import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { computeSga, reloadSavedSga, SGA_INPUT } from '../support/karta-pacjenta-sga.mjs';
import { cancelNativeClear, lastCommit, observeRealSave, record, reference } from '../support/save-commit-reference-fixture.mjs';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', actionTimeout: 15_000 });
test.setTimeout(150_000);

// Only the actual browser-tab lifecycle case uses a native default context.
// Ordinary Playwright pages emulate focus and can stay visible in a background
// tab. A clean headless Chromium tab provides real trusted visibility events.
const nativeTabTest = test.extend({
  browser: [async ({ playwright }, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'vilda-fictional-tab-'));
    const child = spawn(playwright.chromium.executablePath(), [
      '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
      '--disable-dev-shm-usage', '--disable-gpu', '--user-data-dir=' + profile,
      '--remote-debugging-port=0', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    const exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
    let browser;
    try {
      const endpoint = await new Promise((resolve, reject) => {
        let log = '';
        const timer = setTimeout(() => reject(new Error('Native Chromium endpoint unavailable')), 10_000);
        child.stderr.on('data', bytes => {
          log = (log + bytes).slice(-65536);
          const match = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
          if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); reject(new Error('Native Chromium exited ' + code)); });
      });
      browser = await playwright.chromium.connectOverCDP(endpoint, { noDefaults: true });
      await use(browser);
    } finally {
      const forceClose = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 5000);
      try { await browser?.close(); } finally {
        try { if (child.exitCode === null) child.kill(); await exited; }
        finally {
          clearTimeout(forceClose);
          // Chromium helpers can finish closing their profile files just after
          // the main child exits. Retry transient ENOTEMPTY/EBUSY cleanup only.
          await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        }
      }
    }
  }, { scope: 'worker' }],
  context: async ({ browser }, use) => {
    const context = browser.contexts()[0];
    context.setDefaultTimeout(15_000);
    await use(context);
  },
  page: async ({ context, baseURL }, use) => {
    const page = context.pages()[0];
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // Service workers retain the native default-context behavior. The unique
    // temporary profile prevents any cache or controller from a previous run.
    const navigate = page.goto.bind(page);
    // A native default context has no Playwright baseURL option.
    page.goto = (url, options) => navigate(new URL(url, baseURL).href, options);
    await use(page);
  },
});

async function observeNativeMainWrites(page) {
  await page.addInitScript(() => {
    const facades = new WeakMap(), origins = new WeakMap();
    let published;
    const probe = window.__producerMainWrites = { installations: [], writes: [] };
    const clone = value => { try { return structuredClone(value); } catch { return null; } };
    function facadeFor(original) {
      if (!original || typeof original !== 'object' || origins.has(original)) return original;
      if (facades.has(original)) return facades.get(original);
      const facade = {};
      for (const key of Reflect.ownKeys(original)) {
        const descriptor = Object.getOwnPropertyDescriptor(original, key);
        if ('value' in descriptor && typeof descriptor.value === 'function') {
          const method = descriptor.value;
          Object.defineProperty(facade, key, { ...descriptor, value: function (...args) {
            const payload = key === 'writeMainSession' ? clone(args[0]) : null;
            const result = method.apply(original, args);
            if (key === 'writeMainSession') {
              try { probe.writes.push({ payload, result: clone(result),
                patientId: sessionStorage.getItem('vildaCurrentPatientId') }); } catch { /* observation must not affect the writer */ }
            }
            return result;
          } });
        } else if ('value' in descriptor) Object.defineProperty(facade, key, descriptor);
        else Object.defineProperty(facade, key, { enumerable: descriptor.enumerable, configurable: descriptor.configurable,
          get: descriptor.get ? () => descriptor.get.call(original) : undefined,
          set: descriptor.set ? value => descriptor.set.call(original, value) : undefined });
      }
      Object.freeze(facade); facades.set(original, facade); origins.set(facade, original);
      probe.installations.push({ originalFrozen: Object.isFrozen(original), facadeFrozen: Object.isFrozen(facade),
        beforeDix: !window.VildaDataImportExport, wrappedWrite: facade.writeMainSession !== original.writeMainSession });
      return facade;
    }
    // Both aliases publish the same stable facade before any module captures
    // adapter identity. All methods retain their original receiver and result.
    for (const alias of ['VildaPersistence', 'vildaPersistence']) Object.defineProperty(window, alias, {
      configurable: true, enumerable: true, get: () => published,
      set: original => { published = facadeFor(original); },
    });
    probe.check = () => ({ aliasesSame: window.VildaPersistence === window.vildaPersistence,
      facadeInstalled: origins.has(window.VildaPersistence), installations: clone(probe.installations) });
  });
}

async function expectMainWriteObserver(owner) {
  expect(await owner.evaluate(() => window.__producerMainWrites.check())).toEqual({
    aliasesSame: true, facadeInstalled: true,
    installations: [{ originalFrozen: true, facadeFrozen: true, beforeDix: true, wrappedWrite: true }],
  });
}

async function bisphosState(owner) {
  return owner.evaluate(() => {
    const main = window.VildaPersistence.readMainSession();
    const current = window.VildaDataImportExport.captureCurrentUserDataReadOnly({ base: main });
    return { main: main.bisphos, current: current.bisphos };
  });
}

const ENTERED_BISPHOS = { indication: 'osteoporoza', drug: 'zomikos', doseNumber: 'maintenance' };
const OTHER_PATIENT_BISPHOS = { indication: 'crmo', drug: 'pamifos', doseNumber: 'subsequent' };

for (const navigation of ['same patient', 'explicit Restore', 'explicit New', 'same patient immediate Save']) {
  test(`DocPro selections: ${navigation} retains entered bisphosphonate settings in encrypted Start Save`, async ({ page }) => {
    await observeNativeMainWrites(page);
    const fixture = await createFictionalVault(page, { shell: true });
    if (navigation.startsWith('explicit')) await fixture.frame.evaluate(async ({ id, bisphos }) => {
      const existing = await window.VildaVault.getPatient(id);
      const payload = structuredClone(existing.snapshots[0].payload);
      payload.bisphos = bisphos;
      await window.VildaVault.savePatient(payload, { patientId: id, dedup: false });
    }, { id: fixture.ids.b, bisphos: OTHER_PATIENT_BISPHOS });
    const initialRecords = await vaultRecords(fixture.frame, fixture.ids);
    await page.locator('a.sidebar-link[href="docpro.html"]').click();
    const docpro = await shellFrame(page, 'DocPro');
    await readyForPatient(docpro);
    const confirmation = docpro.locator('#professionalConfirmBtn');
    if (await confirmation.isVisible()) await confirmation.click();
    await loadPatient(docpro, fixture.ids.a, 'restore');
    await docpro.locator('#toggleBisphos').click();
    await docpro.locator('#bisphosIndication').selectOption(ENTERED_BISPHOS.indication);
    await docpro.locator('#bisphosDrug').selectOption(ENTERED_BISPHOS.drug);
    await docpro.locator('#bisphosDoseNumber').selectOption(ENTERED_BISPHOS.doseNumber);
    await expect(docpro.locator('#bisphosResult')).toContainText('Zalecana dawka');
    await observeRealSave(docpro);
    const savedDocpro = await saveNative(docpro);
    expect(savedDocpro.snapshot.payload.bisphos).toEqual(ENTERED_BISPHOS);
    // This is an entered calculator draft, not a completed treatment record.
    expect(savedDocpro.snapshot.payload.bisphosTherapyPoints).toEqual([]);
    expect(await decision(docpro)).toEqual({ ready: true, state: 'saved' });
    const savedRecords = await vaultRecords(docpro, fixture.ids);
    expect(savedRecords[0].snapshots).toEqual(expect.arrayContaining(initialRecords[0].snapshots));
    expect(savedRecords[1]).toEqual(initialRecords[1]);

    await page.locator('a.sidebar-link[href="index.html"]').click();
    const start = fixture.frame;
    await readyForPatient(start);
    await expectMainWriteObserver(start);
    let targetWriteStart = await start.evaluate(() => window.__producerMainWrites.writes.length);
    if (navigation.startsWith('explicit')) {
      await loadPatient(start, fixture.ids.b, 'restore');
      expect(await bisphosState(start), 'accepted B must use its own selections, not previously mounted A')
        .toEqual({ main: OTHER_PATIENT_BISPHOS, current: OTHER_PATIENT_BISPHOS });
      targetWriteStart = await start.evaluate(() => window.__producerMainWrites.writes.length);
      await loadPatient(start, fixture.ids.a, navigation === 'explicit New' ? 'new' : 'restore');
      if (navigation === 'explicit New') {
        await start.locator('#height').fill('159');
        await start.locator('#weight').fill('47');
        await start.locator('#weight').blur();
      }
    }
    const acceptedState = await bisphosState(start);
    await test.info().attach('accepted-bisphos-checkpoint', { contentType: 'application/json', body: JSON.stringify({
      navigation, expected: ENTERED_BISPHOS, actual: acceptedState, savedDocpro, savedRecords,
      records: await vaultRecords(start, fixture.ids), reference: await reference(start),
      writes: await start.evaluate(() => window.__producerMainWrites.writes),
    }, null, 2) });
    expect(acceptedState).toEqual({ main: ENTERED_BISPHOS, current: ENTERED_BISPHOS });
    const beforeReference = await reference(start);
    expect(await vaultRecords(start, fixture.ids)).toEqual(savedRecords);

    // Let the real results-mode control schedule its normal debounced writer.
    // The observer delegates to the original adapter and cannot manufacture a
    // successful write, persistence receipt or saved-state reference.
    if (navigation !== 'same patient immediate Save') {
      const targetMode = !(await start.locator('#resultsModeToggle').isChecked());
      const beforeWrite = await start.evaluate(() => window.__producerMainWrites.writes.length);
      await start.locator('#resultsModeToggleContainer .switch').click();
      await expect.poll(() => start.evaluate(({ since, mode }) => window.__producerMainWrites.writes.slice(since)
        .some(write => write.result === true && write.payload?.zscore?.resultsMode === mode),
      { since: beforeWrite, mode: targetMode })).toBe(true);
    }
    expect(await bisphosState(start)).toEqual({ main: ENTERED_BISPHOS, current: ENTERED_BISPHOS });
    const targetWrites = await start.evaluate(({ since, id }) => window.__producerMainWrites.writes
      .slice(since).filter(write => write.result === true && write.patientId === id),
    { since: targetWriteStart, id: fixture.ids.a });
    if (navigation !== 'same patient immediate Save') expect(targetWrites.length).toBeGreaterThan(0);
    for (const write of targetWrites) expect(write.payload.bisphos,
      'every successful writer after the accepted target PID retains its actual selections').toEqual(ENTERED_BISPHOS);
    expect(await reference(start)).toBe(beforeReference);
    expect(await vaultRecords(start, fixture.ids)).toEqual(savedRecords);

    await observeRealSave(start);
    const savedStart = await saveNative(start);
    expect(savedStart.receipt.patientId).toBe(fixture.ids.a);
    expect(savedStart.snapshot.payload.bisphos).toEqual(ENTERED_BISPHOS);
    expect(savedStart.snapshot.payload.bisphosTherapyPoints).toEqual([]);
    const finalRecords = await vaultRecords(start, fixture.ids);
    expect(finalRecords[0].snapshots).toHaveLength(savedRecords[0].snapshots.length + 1);
    expect(finalRecords[0].snapshots).toEqual(expect.arrayContaining(savedRecords[0].snapshots));
    expect(finalRecords[1]).toEqual(savedRecords[1]);
    expect(await decision(start)).toEqual({ ready: true, state: 'saved' });
    await test.info().attach('native-bisphos-checkpoints', { contentType: 'application/json', body: JSON.stringify({
      navigation, initialRecords, savedDocpro, savedRecords, beforeReference,
      writes: await start.evaluate(() => window.__producerMainWrites.writes), savedStart, finalRecords,
    }, null, 2) });
  });
}

// All records belong to the isolated, encrypted fictional vault. This exercises
// the native collector and Save; no payload, commit receipt or reference is faked.
async function saveNative(owner) {
  await expect.poll(() => owner.evaluate(() => window.VildaDataImportExport.getSaveReadiness().ready)).toBe(true);
  const result = await owner.evaluate(async () => ({
    readyAtCall: window.VildaDataImportExport.getSaveReadiness().ready,
    saved: Boolean(await window.saveUserData()),
  }));
  expect(result).toEqual({ readyAtCall: true, saved: true });
  await expect.poll(() => owner.evaluate(() => window.VildaDataImportExport.isSaveUserDataPending())).toBe(false);
  return lastCommit(owner);
}

const INDEPENDENT_BASIC_HISTORY = [{ ageMonths: 102, ageYears: 8.5, height: 131.7, weight: 29.1 }];
const INDEPENDENT_INTAKE_HISTORY = [{ ageMonths: 150, ageYears: 12.5, height: 156.2, weight: 44.4 }];
// Current advanced-editor format is explicit in the seed. A bare legacy row
// gains these UI fields on hydration; that unrelated migration must not mask
// loss of an independent history or of a meaningful saved annotation.
const INDEPENDENT_ADVANCED_HISTORY = [
  { ageMonths: 84, ageYears: 7, height: 123.6, weight: 23.9, boneAgeYears: 6.5,
    arrowEnabled: true, arrowComment: 'Fikcyjna adnotacja archiwalna', ghSync: false, ghId: null, domIndex: 0 },
  { ageMonths: 108, ageYears: 9, height: 135, weight: 29.9, boneAgeYears: null,
    arrowEnabled: false, arrowComment: '', ghSync: false, ghId: null, domIndex: 1 },
  { ageMonths: 120, ageYears: 10, height: 141, weight: 33, boneAgeYears: null,
    arrowEnabled: false, arrowComment: '', ghSync: false, ghId: null, domIndex: 2 },
  { ageMonths: 144, ageYears: 12, height: 153, weight: 40, boneAgeYears: null,
    arrowEnabled: false, arrowComment: '', ghSync: false, ghId: null, domIndex: 3 },
];
// The existing native delete action rebuilds rows from the mounted controls.
// Baseline a066 has this same explicit shape: neutral display defaults are
// omitted, while entered bone age and enabled annotation remain in the row.
const ADVANCED_AFTER_NATIVE_DELETE = [
  { ageMonths: 84, ageYears: 7, height: 123.6, weight: 23.9, boneAgeYears: 6.5,
    arrowEnabled: true, arrowComment: 'Fikcyjna adnotacja archiwalna' },
  { ageMonths: 108, ageYears: 9, height: 135, weight: 29.9 },
  { ageMonths: 120, ageYears: 10, height: 141, weight: 33 },
  { ageMonths: 144, ageYears: 12, height: 153, weight: 40 },
];

async function seedPal(owner, patientId, { pal = 1.8, manual = true, perinatal = false, independent = false, standardResults = false } = {}) {
  return owner.evaluate(async ({ patientId, pal, manual, perinatal, histories, standardResults }) => {
    const vault = window.VildaVault, record = await vault.getPatient(patientId);
    const payload = JSON.parse(JSON.stringify(record.snapshots[0].payload));
    payload.plan = { ...(payload.plan || {}), palFactor: pal };
    if (manual === null) delete payload.plan.palWybrany;
    else payload.plan.palWybrany = manual;
    payload.intake = { ...(payload.intake || {}), pal: String(pal) };
    if (standardResults) payload.zscore = { ...payload.zscore, resultsMode: false };
    if (histories) {
      payload.advanced.data.measurements = histories.advanced;
      payload.growthBasic = { name: payload.name, data: { measurements: histories.basic } };
      payload.intake.history = histories.intake;
    }
    if (perinatal) payload.perinatal = { ...(payload.perinatal || {}), birthHeadCircCm: 29 };
    const receipt = await vault.savePatient(payload, { patientId, dedup: false });
    return (await vault.getPatient(patientId)).snapshots.find(row => row.snapshotId === receipt.snapshotId).payload;
  }, { patientId, pal, manual, perinatal, standardResults,
    histories: independent ? { advanced: INDEPENDENT_ADVANCED_HISTORY,
      basic: INDEPENDENT_BASIC_HISTORY, intake: INDEPENDENT_INTAKE_HISTORY } : null });
}

async function openDocpro(page, fixture, choice = 'restore') {
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await readyForPatient(page);
  const confirmation = page.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await loadPatient(page, fixture.ids.a, choice);
  if (choice === 'new') {
    await page.locator('#height').fill('159');
    await page.locator('#weight').fill('47');
    await page.locator('#weight').blur();
  }
  await expect.poll(() => page.evaluate(() => window.VildaDataImportExport.getSaveReadiness().ready)).toBe(true);
}

async function decision(owner) {
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  return owner.evaluate(() => {
    const result = window.VildaSaveStatusIndicator.getCurrentDecision();
    return { ready: result.ready, state: result.state };
  });
}

async function prefillEvents(owner) {
  await owner.evaluate(async () => {
    const vault = window.VildaVault, original = vault.getPatient, pending = [];
    vault.getPatient = function (...args) {
      const result = original.apply(this, args);
      pending.push(result);
      return result;
    };
    try {
      document.dispatchEvent(new CustomEvent('vilda:auth-hidden'));
      document.dispatchEvent(new CustomEvent('vilda:sync-status-changed'));
      // Await the real reads requested by the real event handlers. The fixed
      // producer may skip them entirely when computed/restored inputs own SGA.
      await Promise.all(pending);
      await new Promise(resolve => { requestAnimationFrame(resolve); });
    } finally { vault.getPatient = original; }
  });
}

for (const optionalHead of [false, true]) {
  test(`SGA: ${optionalHead ? 'blank optional head survives automatic prefill' : 'same-value replay preserves the exact computed assessment'}`, async ({ page }) => {
    const fixture = await createFictionalVault(page);
    await seedPal(page, fixture.ids.a, { perinatal: optionalHead });
    const otherPatient = await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.b);
    await openDocpro(page, fixture);
    const computed = await computeSga(page, { inputs: { ...SGA_INPUT, head: optionalHead ? '' : SGA_INPUT.head },
      sources: ['niklasson', 'intergrowth', 'malewski'] });
    await observeRealSave(page);
    const committed = await saveNative(page);
    expect(committed.snapshot.payload.birth).toEqual(computed);
    const savedRecord = await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a);
    const savedReference = await reference(page);

    if (!optionalHead) await page.evaluate(() => {
      for (const id of ['sgaBirthWeeks', 'sgaBirthDays', 'sgaBirthWeight', 'sgaBirthLength', 'sgaBirthHead']) {
        const field = document.getElementById(id);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const source = document.querySelector('input[name="sgaBirthSource"]:checked');
      source.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await prefillEvents(page);
    expect(await page.evaluate(() => window.vildaSgaBirthPersistApi.captureStateReadOnly()),
      'replay/prefill preserve every source result, input, note and original computation timestamp').toEqual(computed);
    expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(savedRecord);
    expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.b)).toEqual(otherPatient);
    expect(await reference(page), 'the comparison reference remains the exact committed version').toBe(savedReference);
    expect(await decision(page)).toEqual({ ready: true, state: 'saved' });

    // A real change must invalidate the old result rather than manufacture Saved.
    await page.locator('#sgaBirthWeight').fill('1700');
    const edited = await page.evaluate(() => window.vildaSgaBirthPersistApi.captureStateReadOnly());
    // Editing refreshes the live result, but invalidates the durable assessment
    // created by the explicit Calculate action. These are separate states.
    expect(edited).toMatchObject({ weight: '1700', hasComputed: true });
    expect(edited).not.toHaveProperty('assessment');
    expect(await decision(page)).toEqual({ ready: true, state: 'dirty' });
    expect(await reference(page)).toBe(savedReference);
    expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(savedRecord);
    expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.b)).toEqual(otherPatient);
  });
}

for (const profile of [
  { label: 'manual PAL 1.8 / Restore', pal: 1.8, manual: true, choice: 'restore' },
  { label: 'manual PAL 1.8 / New measurement', pal: 1.8, manual: true, choice: 'new' },
  { label: 'imported PAL 1.8 without manual marker', pal: 1.8, manual: null, choice: 'restore' },
  { label: 'manual PAL equal to automatic default 1.6', pal: 1.6, manual: true, choice: 'restore' },
]) {
  test(`DocPro preserves ${profile.label} and carried measurement history in the encrypted save`, async ({ page }) => {
    const fixture = await createFictionalVault(page);
    const seeded = await seedPal(page, fixture.ids.a, { ...profile, independent: true });
    // Each archive has a distinct point. No generated advanced mirror can
    // accidentally stand in for a patient's independently entered history.
    expect(seeded.growthBasic.data.measurements).toEqual(INDEPENDENT_BASIC_HISTORY);
    expect(seeded.intake.history).toEqual(INDEPENDENT_INTAKE_HISTORY);
    expect(seeded.advanced.data.measurements).toEqual(INDEPENDENT_ADVANCED_HISTORY);
    expect(seeded.user).toMatchObject({ age: 13, ageMonths: 0, height: 158, weight: 46 });
    // Native New measurement archives the previous committed visit once.
    // Its known fixture values supplement, rather than replace, either archive.
    const previousVisit = { ageMonths: 156, ageYears: 13, height: 158, weight: 46 };
    const expectedBasic = profile.choice === 'new'
      ? [...seeded.growthBasic.data.measurements, previousVisit] : seeded.growthBasic.data.measurements;
    const expectedAdvanced = profile.choice === 'new'
      ? [...seeded.advanced.data.measurements, { ...previousVisit, boneAgeYears: null,
        arrowEnabled: false, arrowComment: '', ghSync: false, ghId: null, domIndex: 4 }]
      : seeded.advanced.data.measurements;
    const originalRecord = await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a);
    const otherPatient = await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.b);
    await openDocpro(page, fixture, profile.choice);
    const before = await page.evaluate(() => ({
      controls: [Boolean(document.getElementById('palFactor')), Boolean(document.getElementById('intakePal'))],
      carried: window.VildaDataImportExport.captureCurrentUserDataReadOnly({ base: window.VildaPersistence.readMainSession() }),
    }));
    expect(before.controls).toEqual([false, false]);
    expect(before.carried.plan.palFactor).toBe(profile.pal);
    expect(before.carried.intake.pal).toBe(String(profile.pal));
    expect(before.carried.growthBasic.data.measurements).toEqual(expectedBasic);
    expect(before.carried.intake.history).toEqual(seeded.intake.history);
    expect(before.carried.advanced.data.measurements).toEqual(expectedAdvanced);
    await observeRealSave(page);
    const committed = await saveNative(page);
    expect(committed.snapshot.payload.plan.palFactor).toBe(profile.pal);
    expect(committed.snapshot.payload.plan.palWybrany).toBe(before.carried.plan.palWybrany);
    expect(committed.snapshot.payload.intake.pal).toBe(String(profile.pal));
    expect(committed.snapshot.payload.growthBasic.data.measurements).toEqual(expectedBasic);
    expect(committed.snapshot.payload.intake.history).toEqual(seeded.intake.history);
    expect(committed.snapshot.payload.advanced.data.measurements).toEqual(expectedAdvanced);
    expect(committed.snapshot.payload.growthBasic?.data?.measurements,
      'the save and readonly model agree on history owned by the absent basic form')
      .toEqual(before.carried.growthBasic?.data?.measurements);
    expect(committed.snapshot.payload.advanced.data.measurements,
      'the native history owner preserves the actual archived measurements')
      .toEqual(before.carried.advanced.data.measurements);
    const savedRecord = await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a);
    expect(savedRecord.snapshots).toEqual(expect.arrayContaining(originalRecord.snapshots));
    const savedReference = await reference(page);
    expect(await decision(page)).toEqual({ ready: true, state: 'saved' });
    await page.locator('#height').fill(profile.choice === 'new' ? '160' : '159');
    expect(await decision(page)).toEqual({ ready: true, state: 'dirty' });
    expect(await reference(page)).toBe(savedReference);
    expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(savedRecord);
    expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.b)).toEqual(otherPatient);
  });
}

test('SGA: native Restore and Save retain the explicitly empty day field of a supported legacy assessment', async ({ page }) => {
  const fixture = await createFictionalVault(page);
  await seedPal(page, fixture.ids.a);
  await openDocpro(page, fixture);
  const computed = await computeSga(page, { inputs: { ...SGA_INPUT, days: '0' } });
  const legacy = await page.evaluate(async ({ id, computed }) => {
    const vault = window.VildaVault, record = await vault.getPatient(id);
    const payload = JSON.parse(JSON.stringify(record.snapshots[0].payload));
    // An imported legacy representation, using the actual controller's exact
    // day-zero assessment and timestamp rather than a reconstructed result.
    payload.birth = { ...computed, days: '' };
    const receipt = await vault.savePatient(payload, { patientId: id, dedup: false });
    return (await vault.getPatient(id)).snapshots.find(row => row.snapshotId === receipt.snapshotId).payload.birth;
  }, { id: fixture.ids.a, computed });
  // The real same-patient decision can offer reload before any discard guard;
  // follow the displayed dialog rather than predicting it from a stale SSI.
  const records = await vaultRecords(page, fixture.ids);
  await loadSamePatient(page, fixture.ids.a, 'restore');
  expect(await vaultRecords(page, fixture.ids)).toEqual(records);
  await expect.poll(() => page.evaluate(() => window.VildaDataImportExport.getSaveReadiness().ready)).toBe(true);
  expect(await page.locator('#sgaBirthDays').inputValue()).toBe('');
  expect(await page.locator('#sgaBirthDays').evaluate(select => select.selectedIndex)).toBe(-1);
  expect(await page.evaluate(() => window.vildaSgaBirthPersistApi.captureStateReadOnly())).toEqual(legacy);
  await observeRealSave(page);
  const committed = await saveNative(page);
  expect(committed.snapshot.payload.birth).toEqual(legacy);
  expect(await page.evaluate(() => window.vildaSgaBirthPersistApi.captureStateReadOnly())).toEqual(legacy);
  const savedRecords = await vaultRecords(page, fixture.ids), savedReference = await reference(page);
  if (!await page.locator('#sgaBirthDays').isVisible()) await page.locator('#toggleSgaBirth').click();
  await page.locator('#sgaBirthDays').selectOption('1');
  const edited = await page.evaluate(() => window.vildaSgaBirthPersistApi.captureStateReadOnly());
  expect(edited).toMatchObject({ days: '1', hasComputed: true });
  expect(edited).not.toHaveProperty('assessment');
  expect(await decision(page)).toEqual({ ready: true, state: 'dirty' });
  expect(await reference(page)).toBe(savedReference);
  expect(await vaultRecords(page, fixture.ids)).toEqual(savedRecords);
});

test('DocPro: anonymous first native save and an edited repeat save adopt only their new patient', async ({ page }) => {
  const fixture = await createFictionalVault(page);
  const previousRecords = await page.evaluate(async ids => Promise.all(Object.values(ids)
    .map(id => window.VildaVault.getPatient(id))), fixture.ids);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await readyForPatient(page);
  const confirmation = page.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
  for (const [id, value] of Object.entries({ lastName: 'Fikcyjny', firstName: 'Nowy Producent', age: '12', ageMonths: '3', height: '151', weight: '41' })) {
    await page.locator('#' + id).fill(value);
  }
  await page.locator('#sex').selectOption('M');
  await page.locator('#weight').blur();
  await observeRealSave(page);
  const first = await saveNative(page);
  const patientId = first.receipt.patientId;
  expect(Object.values(fixture.ids)).not.toContain(patientId);
  expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(patientId);
  expect(first.snapshot.payload.user).toMatchObject({ height: 151, weight: 41, sex: 'M' });
  const beforeRepeat = await page.evaluate(id => window.VildaVault.getPatient(id), patientId);
  await page.locator('#height').fill('152');
  await page.locator('#height').blur();
  const second = await saveNative(page);
  expect(second.receipt.patientId).toBe(patientId);
  expect(second.snapshot.payload.user).toMatchObject({ height: 152, weight: 41, sex: 'M' });
  const afterRepeat = await page.evaluate(id => window.VildaVault.getPatient(id), patientId);
  expect(afterRepeat.snapshots).toHaveLength(beforeRepeat.snapshots.length + 1);
  expect(afterRepeat.snapshots).toEqual(expect.arrayContaining(beforeRepeat.snapshots));
  expect(await page.evaluate(async ids => Promise.all(Object.values(ids)
    .map(id => window.VildaVault.getPatient(id))), fixture.ids)).toEqual(previousRecords);
});

async function currentHistories(owner) {
  return owner.evaluate(() => {
    const payload = window.VildaDataImportExport.captureCurrentUserDataReadOnly({ base: window.VildaPersistence.readMainSession() });
    return {
      advanced: payload.advanced?.data?.measurements,
      basic: payload.growthBasic?.data?.measurements,
      intake: payload.intake?.history,
    };
  });
}

async function seedFullPerinatal(owner, patientId) {
  await owner.evaluate(async id => {
    const record = await window.VildaVault.getPatient(id);
    const payload = structuredClone(record.snapshots[0].payload);
    payload.perinatal = { gestationalWeeks: 34, gestationalDays: 2,
      birthWeightG: 1650, birthLengthCm: 41, birthHeadCircCm: 29 };
    payload.plan = { ...payload.plan, palFactor: 1.8, palWybrany: true };
    payload.intake = { ...payload.intake, pal: '1.8' };
    await window.VildaVault.savePatient(payload, { patientId: id, dedup: false });
  }, patientId);
}

async function sgaSnapshot(owner) {
  return owner.evaluate(() => ({
    birth: window.vildaSgaBirthPersistApi.captureStateReadOnly(),
    ui: window.vildaSgaBirthPersistApi.captureUiState(),
  }));
}

async function vaultRecords(owner, ids) {
  return owner.evaluate(async ids => Promise.all(Object.values(ids)
    .map(id => window.VildaVault.getPatient(id))), ids);
}

for (const clear of ['Reset', 'manual field clear']) {
  test(`SGA: ${clear} survives native Save, fresh prefill events and F5 without changing the committed record`, async ({ page }) => {
    const fixture = await createFictionalVault(page);
    await seedFullPerinatal(page, fixture.ids.a);
    await openDocpro(page, fixture);
    await computeSga(page);
    await observeRealSave(page);
    await saveNative(page);
    const originalRecords = await vaultRecords(page, fixture.ids);
    const originalReference = await reference(page);
    if (clear === 'Reset') await page.locator('#resetSgaBirth').click();
    else for (const id of ['sgaBirthWeight', 'sgaBirthLength', 'sgaBirthHead']) {
      await page.locator('#' + id).fill('');
    }
    const cleared = await sgaSnapshot(page);
    expect(cleared.birth?.assessment).toBeUndefined();
    expect(await decision(page)).toEqual({ ready: true, state: 'dirty' });
    expect(await reference(page)).toBe(originalReference);
    expect(await vaultRecords(page, fixture.ids)).toEqual(originalRecords);
    const committed = await saveNative(page);
    // The native collector represents a completely empty SGA card as null;
    // UI reset intent stays outside the patient's clinical birth payload.
    expect(committed.snapshot.payload.birth).toEqual(clear === 'Reset' ? null : cleared.birth);
    expect(committed.snapshot.payload).not.toHaveProperty('sgaBirthUi');
    const records = await vaultRecords(page, fixture.ids), savedReference = await reference(page);
    await prefillEvents(page);
    expect(await sgaSnapshot(page)).toEqual(cleared);
    expect(await reference(page)).toBe(savedReference);
    await expect.poll(() => page.evaluate(() => Boolean(window.VildaPersistence
      .readDocproUi()?.moduleStates?.sgaBirthUi))).toBe(true);
    await page.reload({ waitUntil: 'load' });
    await readyForPatient(page);
    await expect.poll(() => page.evaluate(() => window.VildaDocproStatePersistence.isReady())).toBe(true);
    await prefillEvents(page);
    expect(await sgaSnapshot(page)).toEqual(cleared);
    expect(await decision(page)).toEqual({ ready: true, state: 'saved' });
    expect(await reference(page)).toBe(savedReference);
    expect(await vaultRecords(page, fixture.ids)).toEqual(records);

    if (clear === 'Reset') {
      // Explicitly accepted Restore ends the old UI-only reset intent.
      await reloadSavedSga(page, fixture.ids.a);
      await prefillEvents(page);
      expect(await sgaSnapshot(page)).toMatchObject({ ui: null, birth: {
        weeks: '34', days: '2', weight: '1650', length: '41', head: '29',
      } });
      expect(await vaultRecords(page, fixture.ids)).toEqual(records);
    }
  });
}

async function loadSamePatient(owner, id, choice) {
  await owner.evaluate(id => window.VildaAuthUI.showPatientCard(id,
    record => record && window.applyLoadedData(record)), id);
  await expect.poll(() => owner.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  await owner.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  const same = owner.getByRole('dialog', { name: 'Ten pacjent jest już wczytany' });
  const guard = owner.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wczytaniem\?$/ });
  const choices = owner.locator('#vildaLoadChoiceModal');
  await expect(same.or(guard).or(choices)).toBeVisible();
  if (await same.isVisible()) await same.getByRole('button', { name: 'Wczytaj ponownie', exact: true }).click();
  if (await guard.isVisible()) await guard.getByRole('button', { name: /^Odrzuć (dane|zmiany) i wczytaj$/ }).click();
  await expect(choices).toBeVisible();
  await owner.locator(choice === 'new' ? '#vildaLcmNew' : '#vildaLcmRestore').click();
  await expect(choices).toHaveCount(0);
}

test('SGA: accepted New on Start clears only old reset intent in the retained same-patient DocPro frame', async ({ page }) => {
  const fixture = await createFictionalVault(page, { shell: true });
  await seedFullPerinatal(fixture.frame, fixture.ids.a);
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirmation = docpro.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await loadPatient(docpro, fixture.ids.a, 'restore');
  await computeSga(docpro);
  await observeRealSave(docpro);
  await saveNative(docpro);
  await docpro.locator('#resetSgaBirth').click();
  await saveNative(docpro);
  await prefillEvents(docpro);
  await expect.poll(() => docpro.evaluate(() => Boolean(window.VildaPersistence
    .readDocproUi()?.moduleStates?.sgaBirthUi))).toBe(true);
  const records = await vaultRecords(docpro, fixture.ids);
  await docpro.evaluate(() => { window.__producerWarmDocument = 'same-docpro-document'; });
  await page.evaluate(() => window.VildaShell.navigate('start'));
  const start = await shellFrame(page, 'Start');
  await readyForPatient(start);
  await loadSamePatient(start, fixture.ids.a, 'new');
  await expect.poll(() => docpro.evaluate(() => window.vildaSgaBirthPersistApi.captureUiState())).toBeNull();
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  await readyForPatient(docpro);
  await prefillEvents(docpro);
  expect(await docpro.evaluate(() => window.__producerWarmDocument)).toBe('same-docpro-document');
  expect(await sgaSnapshot(docpro)).toMatchObject({ ui: null, birth: {
    weeks: '34', days: '2', weight: '1650', length: '41', head: '29',
  } });
  expect(await vaultRecords(docpro, fixture.ids)).toEqual(records);
});

test('SGA: canceling native Restore keeps the cleared draft; accepting restores the exact saved assessment', async ({ page }) => {
  const fixture = await createFictionalVault(page);
  await seedFullPerinatal(page, fixture.ids.a);
  await openDocpro(page, fixture);
  const computed = await computeSga(page);
  await observeRealSave(page);
  await saveNative(page);
  const records = await vaultRecords(page, fixture.ids), savedReference = await reference(page);
  await page.locator('#resetSgaBirth').click();
  const cleared = await sgaSnapshot(page);
  let canceledPrompt;
  page.once('dialog', async dialog => { canceledPrompt = dialog.message(); await dialog.dismiss(); });
  await page.evaluate(() => window.restoreLoadedState());
  expect(canceledPrompt).toContain('Czy na pewno chcesz przywrócić zapisany stan?');
  expect(await sgaSnapshot(page)).toEqual(cleared);
  expect(await decision(page)).toEqual({ ready: true, state: 'dirty' });
  expect(await reference(page)).toBe(savedReference);
  expect(await vaultRecords(page, fixture.ids)).toEqual(records);
  let acceptedPrompt;
  page.once('dialog', async dialog => { acceptedPrompt = dialog.message(); await dialog.accept(); });
  await page.evaluate(() => window.restoreLoadedState());
  await prefillEvents(page);
  expect(acceptedPrompt).toContain('Czy na pewno chcesz przywrócić zapisany stan?');
  expect(await sgaSnapshot(page)).toEqual({ birth: computed, ui: null });
  expect(await reference(page)).toBe(savedReference);
  expect(await vaultRecords(page, fixture.ids)).toEqual(records);
});

test('SGA: verified first native Save adopts the anonymous reset intent without changing another patient', async ({ page }) => {
  const fixture = await createFictionalVault(page);
  const records = await vaultRecords(page, fixture.ids);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await readyForPatient(page);
  const confirmation = page.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
  for (const [id, value] of Object.entries({ lastName: 'Fikcyjny', firstName: 'SGA Reset',
    age: '12', ageMonths: '3', height: '151', weight: '41' })) await page.locator('#' + id).fill(value);
  await page.locator('#sex').selectOption('M');
  await page.locator('#weight').blur();
  await computeSga(page);
  await page.locator('#resetSgaBirth').click();
  const cleared = await sgaSnapshot(page);
  expect(cleared.ui.patientId).toBeNull();
  await page.evaluate(() => document.addEventListener('vilda:patient-loaded', event => {
    if (event.detail?.source === 'save') window.__producerSaveReceipt = event.detail;
  }));
  await observeRealSave(page);
  const committed = await saveNative(page);
  await prefillEvents(page);
  const published = await page.evaluate(() => window.__producerSaveReceipt);
  expect(published.referenceVerified).toBe(true);
  expect(await sgaSnapshot(page)).toEqual({ birth: cleared.birth,
    ui: { ...cleared.ui, patientId: committed.receipt.patientId } });
  expect(committed.snapshot.payload.birth).toBeNull();
  expect(await decision(page)).toEqual({ ready: true, state: 'saved' });
  expect(await vaultRecords(page, fixture.ids)).toEqual(records);
});

for (const action of ['edit advanced', 'clear basic']) {
  test(`independent histories: native ${action} preserves the other entered archives`, async ({ page }) => {
    const fixture = await createFictionalVault(page);
    await seedPal(page, fixture.ids.a, { independent: true });
    const records = await page.evaluate(async ids => Promise.all(Object.values(ids)
      .map(id => window.VildaVault.getPatient(id))), fixture.ids);
    await loadPatient(page, fixture.ids.a, 'restore');
    await readyForPatient(page);
    const before = await currentHistories(page), beforeReference = await reference(page);
    await test.info().attach('independent-histories-before-edit', { contentType: 'application/json', body: JSON.stringify(before, null, 2) });
    expect(before.advanced).toEqual(INDEPENDENT_ADVANCED_HISTORY);
    expect(before.basic).toEqual(INDEPENDENT_BASIC_HISTORY);
    // The mounted intake editor may also represent today's locked current row.
    // The independently entered archive must still exist exactly as committed.
    expect(before.intake.filter(row => row.ageMonths === 150)).toEqual(INDEPENDENT_INTAKE_HISTORY);

    if (action === 'edit advanced') {
      if (!await page.locator('#advMeasurements').isVisible()) await page.locator('#toggleAdvancedGrowth').click();
      const row = page.locator('#advMeasurements .measure-row').first();
      await expect(row.locator('.adv-age-years')).toHaveValue('7');
      await row.locator('.adv-height').fill('124.1');
      await row.locator('.adv-height').blur();
      await expect.poll(() => currentHistories(page).then(value => value.advanced?.[0]?.height)).toBe(124.1);
    } else {
      if (!await page.locator('#basicGrowthMeasurements').isVisible()) await page.locator('#toggleGrowthCalculations').click();
      const row = page.locator('#basicGrowthMeasurements .measure-row').first();
      await expect(row.locator('.bg-age-years')).toHaveValue('8');
      await expect(row.locator('.bg-age-months')).toHaveValue('6');
      // The first native row deliberately has no visible remove button.
      // Clearing its real inputs exercises the mounted editor's empty state.
      for (const field of ['.bg-age-years', '.bg-age-months', '.bg-height', '.bg-weight']) {
        await row.locator(field).fill('');
      }
      await row.locator('.bg-weight').blur();
      await expect.poll(() => currentHistories(page).then(value => value.basic)).toEqual([]);
    }

    const after = await currentHistories(page);
    await test.info().attach('independent-histories-after-edit', { contentType: 'application/json', body: JSON.stringify(after, null, 2) });
    expect(after.intake.filter(row => row.ageMonths === 150)).toEqual(INDEPENDENT_INTAKE_HISTORY);
    if (action === 'edit advanced') {
      expect(after.basic.filter(row => row.ageMonths === 102)).toEqual(INDEPENDENT_BASIC_HISTORY);
      expect(after.advanced).toEqual([{ ...before.advanced[0], height: 124.1 }, ...before.advanced.slice(1)]);
    } else {
      expect(after.basic).toEqual([]);
      expect(after.advanced).toEqual(before.advanced);
    }
    expect(await decision(page)).toEqual({ ready: true, state: 'dirty' });
    expect(await reference(page)).toBe(beforeReference);
    expect(await page.evaluate(async ids => Promise.all(Object.values(ids)
      .map(id => window.VildaVault.getPatient(id))), fixture.ids)).toEqual(records);

    await observeRealSave(page);
    const committed = await saveNative(page);
    expect(committed.snapshot.payload.growthBasic.data.measurements).toEqual(after.basic);
    expect(committed.snapshot.payload.advanced.data.measurements).toEqual(after.advanced);
    expect(committed.snapshot.payload.intake.history).toEqual(after.intake);
  });
}

async function observeNativeReplay(page) {
  await page.addInitScript(() => {
    const timer = window.setTimeout.bind(window);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const snapshot = () => ({
      history: clone(window.intakeHistory), kcal: window.intakeEstimatedKcalPerDay,
      inputs: Object.fromEntries(['age', 'ageMonths', 'height', 'weight', 'sex', 'intakePal']
        .map(id => [id, document.getElementById(id)?.value ?? null])),
      patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    });
    const probe = window.__activeProducerReplay = { records: [] };
    window.setTimeout = function (callback, delay, ...args) {
      if (Number(delay) !== 3200 || typeof callback !== 'function'
        || !/\/custom-fixes\.js(?:\?|:)/.test(new Error().stack || '')) return timer(callback, delay, ...args);
      return timer(function () {
        const before = snapshot();
        try { return callback.apply(this, args); }
        finally { probe.records.push({ before, after: snapshot() }); }
      }, delay);
    };
  });
}

test('independent histories: identical measurements remain independent after F5 and a genuine advanced edit', async ({ page }) => {
  const fixture = await createFictionalVault(page);
  await seedPal(page, fixture.ids.a, { independent: true });
  const independentEqual = [{ ageMonths: 84, ageYears: 7, height: 123.6, weight: 23.9 }];
  await page.evaluate(async ({ id, basic }) => {
    const record = await window.VildaVault.getPatient(id), payload = structuredClone(record.snapshots[0].payload);
    payload.growthBasic.data.measurements = basic;
    await window.VildaVault.savePatient(payload, { patientId: id, dedup: false });
  }, { id: fixture.ids.a, basic: independentEqual });
  await loadPatient(page, fixture.ids.a, 'restore');
  await page.reload({ waitUntil: 'load' });
  await readyForPatient(page);
  const before = await currentHistories(page), records = await vaultRecords(page, fixture.ids);
  const savedReference = await reference(page);
  expect(before.basic).toEqual(independentEqual);
  expect(before.advanced).toEqual(INDEPENDENT_ADVANCED_HISTORY);
  if (!await page.locator('#advMeasurements').isVisible()) await page.locator('#toggleAdvancedGrowth').click();
  const row = page.locator('#advMeasurements .measure-row').first();
  await row.locator('.adv-height').fill('124.1');
  await row.locator('.adv-height').blur();
  const after = await currentHistories(page);
  expect(after.basic).toEqual(independentEqual);
  expect(after.intake.filter(row => row.ageMonths === 150)).toEqual(INDEPENDENT_INTAKE_HISTORY);
  expect(after.advanced).toEqual([{ ...before.advanced[0], height: 124.1 }, ...before.advanced.slice(1)]);
  expect(await decision(page)).toEqual({ ready: true, state: 'dirty' });
  expect(await reference(page)).toBe(savedReference);
  expect(await vaultRecords(page, fixture.ids)).toEqual(records);
  await observeRealSave(page);
  const committed = await saveNative(page);
  expect(committed.snapshot.payload.growthBasic.data.measurements).toEqual(independentEqual);
  expect(committed.snapshot.payload.advanced.data.measurements).toEqual(after.advanced);
});

test('independent histories: native Add creates only its own editable pair and deletion preserves every entered archive', async ({ page }) => {
  const fixture = await createFictionalVault(page);
  await seedPal(page, fixture.ids.a, { independent: true });
  await loadPatient(page, fixture.ids.a, 'restore');
  await readyForPatient(page);
  const before = await currentHistories(page), records = await vaultRecords(page, fixture.ids);
  const savedReference = await reference(page);
  const statusRoundtrip = [{ stage: 'before Add', decision: await decision(page) }];
  if (!await page.locator('#advMeasurements').isVisible()) await page.locator('#toggleAdvancedGrowth').click();
  if (!await page.locator('#intakeMeasurements').isVisible()) await page.getByRole('button', { name: 'Szacowane spożycie energii', exact: true }).click();
  for (const [source, years] of [['advanced', 9], ['intake', 11]]) {
    const advancedCount = await page.locator('#advMeasurements .measure-row').count();
    await page.locator(source === 'advanced' ? '#advAddMeasurementBtn' : '#intakeAddRow').click();
    const advanced = page.locator('#advMeasurements .measure-row').last();
    const intake = page.locator('#intakeMeasurements .measure-row-intake:not([data-locked="true"])').last();
    const ageMonths = years * 12 + 6;
    for (const [selector, value] of [['.adv-age-years', String(years)], ['.adv-age-months', '6'],
      ['.adv-height', '139'], ['.adv-weight', '31.2']]) await advanced.locator(selector).fill(value);
    await advanced.locator('.adv-weight').blur();
    await expect(intake.locator('.intake-ageY')).toHaveValue(String(years));
    await expect(intake.locator('.intake-ageM')).toHaveValue('6');
    await expect(intake.locator('.intake-ht')).toHaveValue('139');
    await expect(intake.locator('.intake-wt')).toHaveValue('31.2');
    await intake.locator('.intake-ht').fill('139.5');
    await intake.locator('.intake-ht').blur();
    await expect(advanced.locator('.adv-height')).toHaveValue('139.5');
    const added = await currentHistories(page);
    expect(added.basic).toEqual(before.basic);
    expect(added.intake.filter(row => row.ageMonths === 150)).toEqual(INDEPENDENT_INTAKE_HISTORY);
    expect(added.advanced.filter(row => row.ageMonths !== ageMonths)).toEqual(before.advanced);
    expect(added.advanced.filter(row => row.ageMonths === ageMonths)).toHaveLength(1);
    expect(added.intake.filter(row => row.ageMonths === ageMonths)).toEqual([
      { ageMonths, ageYears: years + 0.5, height: 139.5, weight: 31.2 },
    ]);
    await intake.locator('.remove-intake-row').click();
    await expect(page.locator('#advMeasurements .measure-row')).toHaveCount(advancedCount);
    expect(await currentHistories(page)).toEqual({ ...before, advanced: ADVANCED_AFTER_NATIVE_DELETE });
    statusRoundtrip.push({ stage: 'after deleting ' + source + ' pair', decision: await decision(page) });
  }
  await test.info().attach('native-pairing-status-roundtrip', { contentType: 'application/json', body: JSON.stringify(statusRoundtrip) });
  expect(await reference(page)).toBe(savedReference);
  expect(await vaultRecords(page, fixture.ids)).toEqual(records);
  await observeRealSave(page);
  const committed = await saveNative(page);
  expect(committed.snapshot.payload.growthBasic.data.measurements).toEqual(before.basic);
  expect(committed.snapshot.payload.advanced.data.measurements).toEqual(ADVANCED_AFTER_NATIVE_DELETE);
  expect(committed.snapshot.payload.intake.history).toEqual(before.intake);
});

nativeTabTest('Start and Reminders: returning from a real browser tab preserves saved SGA; a real edit still warns before Clear', async ({ page, context }) => {
  await observeNativeMainWrites(page);
  const fixture = await createFictionalVault(page);
  await seedPal(page, fixture.ids.a, { perinatal: true, standardResults: true });
  await openDocpro(page, fixture);
  const computed = await computeSga(page, { inputs: { ...SGA_INPUT, head: '' },
    sources: ['niklasson', 'intergrowth', 'malewski'] });
  await observeRealSave(page);
  const committed = await saveNative(page);
  expect(committed.snapshot.payload.birth).toEqual(computed);
  expect(committed.snapshot.payload.zscore.resultsMode).toBe(false);
  const records = await page.evaluate(async ids => Promise.all(Object.values(ids)
    .map(id => window.VildaVault.getPatient(id))), fixture.ids);
  await page.goto('/app.html#/start', { waitUntil: 'load' });
  const start = await shellFrame(page);
  await start.waitForFunction(() => window.VildaAuthUI?.isBootReady()
    && window.VildaDataImportExport?.getSaveReadiness().ready
    && !window.VildaDataImportExport.isMainSessionRestorePending());
  // Grant only the isolated fixture's entitlement. The shared chart helper
  // also changes resultsMode; this scenario keeps the saved preference exact.
  await start.evaluate(() => {
    window.VildaProAccess.__setTokenModeForTest(false);
    window.VildaProAccess.setPlan('pro', '2099-12-31T23:59:59.000Z');
  });
  await expect(start.locator('#height')).toHaveValue('158');
  await expect(start.locator('#weight')).toHaveValue('46');
  await expect(start.locator('#resultsModeToggle')).toBeChecked();
  await expectMainWriteObserver(start);
  const beforeWrite = await start.evaluate(() => window.__producerMainWrites.writes.length);
  // PRO entitlement opens professional results. Return to the saved preference,
  // then observe completion of its real debounced write before the checkpoint.
  await start.locator('#resultsModeToggleContainer .switch').click();
  await expect.poll(() => start.evaluate(since => window.__producerMainWrites.writes.slice(since)
    .some(write => write.result === true && write.payload?.zscore?.resultsMode === false), beforeWrite)).toBe(true);
  await expect(start.locator('#resultsModeToggle')).not.toBeChecked();
  await expect(start.locator('#remindersInline')).toBeVisible();
  const savedReference = await reference(start);
  const capture = () => {
    const current = window.VildaDataImportExport.captureCurrentUserDataReadOnly({ base: window.VildaPersistence.readMainSession() });
    // Only the export's invocation time changes on every readonly call. Keep
    // all clinical inputs/results and the original SGA computation timestamp.
    delete current.timestampISO;
    return { current, fingerprint: window.VildaSaveStatusIndicator._computeCanonicalFingerprint() };
  };
  const before = await start.evaluate(capture);
  expect(before.current.birth).toEqual(computed);
  expect(await decision(start)).toEqual({ ready: true, state: 'saved' });

  for (const owner of [page, start]) await owner.evaluate(() => {
    window.__nativeTabEvents = [];
    document.addEventListener('visibilitychange', event => window.__nativeTabEvents.push({
      trusted: event.isTrusted, visibility: document.visibilityState,
    }));
  });
  const other = await context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  for (const owner of [page, start]) await expect.poll(() => owner.evaluate(() => document.visibilityState)).toBe('hidden');
  await expect.poll(() => other.evaluate(() => document.visibilityState)).toBe('visible');
  await page.bringToFront();
  for (const owner of [page, start]) {
    await expect.poll(() => owner.evaluate(() => document.visibilityState)).toBe('visible');
    expect(await owner.evaluate(() => window.__nativeTabEvents)).toEqual(expect.arrayContaining([
      { trusted: true, visibility: 'hidden' }, { trusted: true, visibility: 'visible' },
    ]));
  }
  await other.close();
  await start.evaluate(() => new Promise(resolve => { requestAnimationFrame(resolve); }));
  const after = await start.evaluate(capture);
  await test.info().attach('trusted-browser-tab-lifecycle', { contentType: 'application/json', body: JSON.stringify({
    topEvents: await page.evaluate(() => window.__nativeTabEvents),
    startEvents: await start.evaluate(() => window.__nativeTabEvents), before, after, savedReference,
  }, null, 2) });
  expect(after).toEqual(before);
  expect(await decision(start)).toEqual({ ready: true, state: 'saved' });
  expect(await reference(start)).toBe(savedReference);
  expect(await start.evaluate(async ids => Promise.all(Object.values(ids)
    .map(id => window.VildaVault.getPatient(id))), fixture.ids)).toEqual(records);

  await start.locator('#weight').fill('47');
  await start.locator('#weight').blur();
  expect(await decision(start)).toEqual({ ready: true, state: 'dirty' });
  await cancelNativeClear(start);
  await expect(start.locator('#weight')).toHaveValue('47');
  expect(await reference(start)).toBe(savedReference);
  expect(await start.evaluate(async ids => Promise.all(Object.values(ids)
    .map(id => window.VildaVault.getPatient(id))), fixture.ids)).toEqual(records);
});

test('Start: actual late mirror replay preserves computed intake history and result; a genuine edit invalidates them', async ({ page }) => {
  await observeNativeReplay(page);
  const fixture = await createFictionalVault(page);
  const beforeRecord = await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a);
  await loadPatient(page, fixture.ids.a, 'restore');
  await page.waitForFunction(() => window.__activeProducerReplay.records.some(record =>
    record.before.patientId && Array.isArray(record.before.history) && record.before.history.length > 0
    && Number.isFinite(record.before.kcal)));
  const replay = await page.evaluate(id => window.__activeProducerReplay.records.find(record =>
    record.before.patientId === id && Array.isArray(record.before.history) && record.before.history.length > 0
    && Number.isFinite(record.before.kcal)), fixture.ids.a);
  await test.info().attach('native-replay-intake-model', { contentType: 'application/json', body: JSON.stringify(replay, null, 2) });
  expect(replay.before.history).toHaveLength(5);
  expect(replay.before.kcal).toBeGreaterThan(0);
  expect(replay.after.inputs).toEqual(replay.before.inputs);
  expect(replay.after.patientId).toBe(replay.before.patientId);
  expect(replay.after.history, 'an unchanged synthetic replay must not erase even a transient working history').toEqual(replay.before.history);
  expect(replay.after.kcal).toBe(replay.before.kcal);
  expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(beforeRecord);

  const savedReference = await reference(page);
  await page.evaluate(() => {
    const listener = event => {
      if (event.target?.id !== 'height') return;
      document.removeEventListener('input', listener);
      // Observe after the native field listeners but before any later redraw.
      window.__genuineIntakeEdit = { trusted: event.isTrusted,
        history: window.intakeHistory == null ? window.intakeHistory : JSON.parse(JSON.stringify(window.intakeHistory)),
        kcal: window.intakeEstimatedKcalPerDay };
    };
    document.addEventListener('input', listener);
  });
  await page.locator('#height').fill('159');
  expect(await page.evaluate(() => window.__genuineIntakeEdit)).toEqual({ trusted: true, history: null, kcal: null });
  expect(await decision(page)).toEqual({ ready: true, state: 'dirty' });
  expect(await reference(page)).toBe(savedReference);
  expect(await page.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(beforeRecord);
});

test('basic metadata: native Restore, row edits, encrypted Save, F5 and removal retain exact observation identities', async ({ page }, testInfo) => {
  const BASIC = [
    { ageMonths: 102, ageYears: 8.5, height: 131.7, weight: 29.1,
      uid: 'fictional-basic-observation-a', dateISO: '2025-01-12', boneAgeYears: 7.5 },
    { ageMonths: 102, ageYears: 8.5, height: 131.9, weight: 29.3,
      uid: 'fictional-basic-observation-b', dateISO: '2025-01-28', boneAgeYears: 8.25 },
  ];
  const ADVANCED = [
    { ageMonths: 84, ageYears: 7, height: 123.6, weight: 23.9, boneAgeYears: 6.5,
      arrowEnabled: true, arrowComment: 'Fikcyjna niezależna historia', ghSync: false, ghId: null, domIndex: 0 },
    { ageMonths: 120, ageYears: 10, height: 141, weight: 33, boneAgeYears: null,
      arrowEnabled: false, arrowComment: '', ghSync: false, ghId: null, domIndex: 1 },
  ];
  const INTAKE = [{ ageMonths: 150, ageYears: 12.5, height: 156.2, weight: 44.4 }];

  async function showBasic(owner) {
    if (!await owner.locator('#basicGrowthMeasurements').isVisible()) await owner.locator('#toggleGrowthCalculations').click();
    await expect(owner.locator('#basicGrowthMeasurements')).toBeVisible();
  }
  async function waitForMainSessionBasic(owner, expected) {
    await expect.poll(() => owner.evaluate(() => window.VildaPersistence.readMainSession()
      ?.growthBasic?.data?.measurements)).toEqual(expected);
  }
  const evidence = {};
  try {
    const fixture = await createFictionalVault(page);
    const seeded = await page.evaluate(async ({ id, basic, advanced, intake }) => {
      const vault = window.VildaVault, existing = await vault.getPatient(id);
      const payload = structuredClone(existing.snapshots[0].payload);
      payload.growthBasic = { name: payload.name, data: { measurements: basic } };
      payload.advanced.data.measurements = advanced;
      payload.plan = { ...(payload.plan || {}), palFactor: 1.8, palWybrany: true };
      payload.intake = { ...(payload.intake || {}), pal: '1.8', history: intake };
      const receipt = await vault.savePatient(payload, { patientId: id, dedup: false });
      const saved = await vault.getPatient(id);
      return saved.snapshots.find(row => row.snapshotId === receipt.snapshotId).payload;
    }, { id: fixture.ids.a, basic: BASIC, advanced: ADVANCED, intake: INTAKE });
    expect(seeded.growthBasic.data.measurements).toEqual(BASIC);
    expect(seeded.advanced.data.measurements).toEqual(ADVANCED);
    expect(seeded.intake.history).toEqual(INTAKE);
    evidence.seeded = seeded;
    const originalRecord = await record(page, fixture.ids.a);
    const otherRecord = await record(page, fixture.ids.b);

    await loadPatient(page, fixture.ids.a, 'restore');
    await readyForPatient(page);
    await showBasic(page);
    await expect(page.locator('#basicGrowthMeasurements .measure-row')).toHaveCount(2);
    const before = await currentHistories(page), originalReference = await reference(page);
    evidence.before = before;
    expect(before.basic).toEqual(BASIC);
    expect(before.advanced).toEqual(ADVANCED);
    // The native intake editor can additionally contain today's locked row.
    expect(before.intake.filter(row => row.ageMonths === 150)).toEqual(INTAKE);

    await page.evaluate(() => {
      window.__basicMetadataNativeEdits = [];
      document.getElementById('basicGrowthMeasurements').addEventListener('input', event => {
        if (!event.target.matches('.bg-height, .bg-age-years')) return;
        window.__basicMetadataNativeEdits.push({ field: event.target.className,
          value: event.target.value, trusted: event.isTrusted });
      });
    });
    const rows = page.locator('#basicGrowthMeasurements .measure-row');
    await expect(rows.nth(0).locator('.bg-height')).toHaveValue('131.7');
    await expect(rows.nth(1).locator('.bg-height')).toHaveValue('131.9');
    // Both source observations have the same age. Changing the first age
    // reverses model sort order, so index/value matching cannot pass by chance.
    await rows.nth(1).locator('.bg-height').fill('132.4');
    await rows.nth(1).locator('.bg-height').blur();
    await rows.nth(0).locator('.bg-age-years').fill('9');
    await rows.nth(0).locator('.bg-age-years').blur();
    const edited = [
      { ...BASIC[1], height: 132.4 },
      { ...BASIC[0], ageYears: 9.5, ageMonths: 114 },
    ];
    await expect.poll(() => currentHistories(page).then(value => value.basic)).toEqual(edited);
    const afterEdit = await currentHistories(page);
    evidence.afterEdit = afterEdit;
    evidence.nativeEdits = await page.evaluate(() => window.__basicMetadataNativeEdits);
    expect(evidence.nativeEdits).toEqual(expect.arrayContaining([
      { field: 'bg-height', value: '132.4', trusted: true },
      { field: 'bg-age-years', value: '9', trusted: true },
    ]));
    expect(afterEdit.advanced).toEqual(before.advanced);
    expect(afterEdit.intake).toEqual(before.intake);
    await expect.poll(() => page.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('dirty');
    expect(await reference(page)).toBe(originalReference);
    expect(await record(page, fixture.ids.a)).toEqual(originalRecord);
    expect(await record(page, fixture.ids.b)).toEqual(otherRecord);

    await observeRealSave(page);
    const committed = await saveNative(page);
    evidence.firstCommit = committed;
    expect(committed.receipt.patientId).toBe(fixture.ids.a);
    expect(committed.snapshot.payload.growthBasic.data.measurements).toEqual(edited);
    expect(committed.snapshot.payload.advanced.data.measurements).toEqual(before.advanced);
    expect(committed.snapshot.payload.intake.history).toEqual(before.intake);
    const committedRecord = await record(page, fixture.ids.a);
    expect(committedRecord.snapshots).toHaveLength(originalRecord.snapshots.length + 1);
    expect(committedRecord.snapshots).toEqual(expect.arrayContaining(originalRecord.snapshots));
    await waitForMainSessionBasic(page, edited);

    await page.reload({ waitUntil: 'load' });
    await readyForPatient(page);
    expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(fixture.ids.a);
    await showBasic(page);
    await expect.poll(() => currentHistories(page).then(value => value.basic)).toEqual(edited);
    const afterReload = await currentHistories(page);
    evidence.afterReload = afterReload;
    expect(afterReload.advanced).toEqual(before.advanced);
    expect(afterReload.intake).toEqual(before.intake);
    expect(await record(page, fixture.ids.a)).toEqual(committedRecord);
    expect(await record(page, fixture.ids.b)).toEqual(otherRecord);

    // Accepted F5 hydration sorts the DOM. Remove A through its native button
    // and verify B retains its distinct metadata after a second native Save.
    const reloadedRows = page.locator('#basicGrowthMeasurements .measure-row');
    await expect(reloadedRows).toHaveCount(2);
    await expect(reloadedRows.nth(0).locator('.bg-height')).toHaveValue('132.4');
    await expect(reloadedRows.nth(1).locator('.bg-age-years')).toHaveValue('9');
    await expect(reloadedRows.nth(1).locator('.bg-height')).toHaveValue('131.7');
    await reloadedRows.nth(1).locator('.remove-measure').click();
    const remaining = [edited[0]];
    await expect(reloadedRows).toHaveCount(1);
    await expect.poll(() => currentHistories(page).then(value => value.basic)).toEqual(remaining);
    const afterDelete = await currentHistories(page);
    evidence.afterDelete = afterDelete;
    expect(afterDelete.advanced).toEqual(before.advanced);
    expect(afterDelete.intake).toEqual(before.intake);
    await observeRealSave(page);
    const deletionCommit = await saveNative(page);
    evidence.deletionCommit = deletionCommit;
    expect(deletionCommit.snapshot.payload.growthBasic.data.measurements).toEqual(remaining);
    expect(deletionCommit.snapshot.payload.advanced.data.measurements).toEqual(before.advanced);
    expect(deletionCommit.snapshot.payload.intake.history).toEqual(before.intake);
    const deletionRecord = await record(page, fixture.ids.a);
    expect(deletionRecord.snapshots).toHaveLength(committedRecord.snapshots.length + 1);
    expect(deletionRecord.snapshots).toEqual(expect.arrayContaining(committedRecord.snapshots));
    await waitForMainSessionBasic(page, remaining);
    await page.reload({ waitUntil: 'load' });
    await readyForPatient(page);
    await expect.poll(() => currentHistories(page).then(value => value.basic)).toEqual(remaining);
    evidence.afterDeletionReload = await currentHistories(page);
    expect(evidence.afterDeletionReload.advanced).toEqual(before.advanced);
    expect(evidence.afterDeletionReload.intake).toEqual(before.intake);
    expect(await record(page, fixture.ids.a)).toEqual(deletionRecord);
    expect(await record(page, fixture.ids.b)).toEqual(otherRecord);
  } finally {
    await testInfo.attach('basic-metadata-native-evidence', {
      contentType: 'application/json', body: JSON.stringify(evidence, null, 2),
    });
  }
});

async function currentIntakeRows(owner) {
  return owner.evaluate(() => [...document.querySelectorAll('#intakeMeasurements .measure-row-intake')]
    .map(row => ({ locked: row.dataset.locked === 'true',
      ageYears: row.querySelector('.intake-ageY').value,
      ageMonths: row.querySelector('.intake-ageM').value,
      height: row.querySelector('.intake-ht').value,
      weight: row.querySelector('.intake-wt').value })));
}

async function firstSaveProducerScope(owner) {
  return owner.evaluate(() => ({
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    historyScope: !!vildaCurrentGrowthHistoryRestore(),
    replayMatches: vildaSameIntakeUserResetBasis(vildaIntakeUserResetBasis, vildaReadIntakeUserResetBasis()),
  }));
}

test('DOB-only Restore keeps an independent intake archive through current-row creation, Save and F5', async ({ page }) => {
  const fixture = await createFictionalVault(page);
  const original = await page.evaluate(async ({ id, archive, advanced }) => {
    const vault = window.VildaVault, record = await vault.getPatient(id);
    const payload = structuredClone(record.snapshots[0].payload);
    payload.user.age = null; payload.user.ageMonths = null;
    payload.advanced.data.measurements = advanced;
    payload.growthBasic = { name: payload.name, data: { measurements: [] } };
    payload.intake = { pal: '1.8', history: archive };
    payload.plan = { palFactor: 1.8, palWybrany: true };
    const receipt = await vault.savePatient(payload, { patientId: id, dedup: false });
    return (await vault.getPatient(id)).snapshots.find(row => row.snapshotId === receipt.snapshotId).payload;
  }, { id: fixture.ids.a, archive: INDEPENDENT_INTAKE_HISTORY, advanced: INDEPENDENT_ADVANCED_HISTORY });
  const recordsBefore = await vaultRecords(page, fixture.ids);
  await loadPatient(page, fixture.ids.a, 'restore'); await readyForPatient(page);
  const before = await currentHistories(page);
  expect(before.intake.filter(row => row.ageMonths === 150)).toEqual(INDEPENDENT_INTAKE_HISTORY);
  expect(before.advanced).toEqual(original.advanced.data.measurements);
  expect(before.basic).toEqual([]);
  const rows = await currentIntakeRows(page);
  expect(rows.filter(row => row.locked)).toHaveLength(1);
  expect(rows.filter(row => !row.locked)).toContainEqual({ locked: false,
    ageYears: '12', ageMonths: '6', height: '156.2', weight: '44.4' });
  expect(await vaultRecords(page, fixture.ids)).toEqual(recordsBefore);
  await observeRealSave(page);
  const saved = await saveNative(page);
  expect(saved.receipt.patientId).toBe(fixture.ids.a);
  expect(saved.snapshot.payload.intake.history).toEqual(before.intake);
  expect(saved.snapshot.payload.advanced.data.measurements).toEqual(before.advanced);
  expect(saved.snapshot.payload.growthBasic.data.measurements).toEqual(before.basic);
  const recordsAfterSave = await vaultRecords(page, fixture.ids);
  expect(recordsAfterSave[0].snapshots).toHaveLength(recordsBefore[0].snapshots.length + 1);
  expect(recordsAfterSave[0].snapshots).toEqual(expect.arrayContaining(recordsBefore[0].snapshots));
  expect(recordsAfterSave[1]).toEqual(recordsBefore[1]);
  await page.reload({ waitUntil: 'load' }); await readyForPatient(page);
  expect(await currentHistories(page)).toEqual(before);
  expect((await currentIntakeRows(page)).filter(row => row.locked)).toHaveLength(1);
  expect(await vaultRecords(page, fixture.ids)).toEqual(recordsAfterSave);
});

test('anonymous UI/F5 first Save adopts intake before another calculation; manual DOB still invalidates it', async ({ page }) => {
  const fixture = await createFictionalVault(page);
  const recordsBefore = await vaultRecords(page, fixture.ids);
  for (const [id, value] of Object.entries({ lastName: 'Fikcyjny', firstName: 'Anonimowa Historia',
    age: '13', ageMonths: '0', height: '158', weight: '46' })) await page.locator('#' + id).fill(value);
  await page.locator('#weight').blur(); await page.locator('#toggleAdvancedGrowth').click();
  const row = page.locator('#advMeasurements .measure-row').first();
  for (const [selector, value] of Object.entries({ '.adv-age-years': '10', '.adv-age-months': '0',
    '.adv-height': '141', '.adv-weight': '33' })) await row.locator(selector).fill(value);
  await row.locator('.adv-weight').blur();
  await expect.poll(() => page.evaluate(() => window.VildaPersistence.readMainSession()
    ?.advanced?.data?.measurements?.some(row => row.ageMonths === 120 && row.height === 141))).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
  await page.reload({ waitUntil: 'load' }); await readyForPatient(page);
  expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
  const before = await currentHistories(page);
  await observeRealSave(page);
  const saved = await saveNative(page);
  // Read immediately, before Add or a new calculation could repair a stale memo.
  expect(await firstSaveProducerScope(page)).toMatchObject({ patientId: saved.receipt.patientId, replayMatches: true });
  expect(Object.values(fixture.ids)).not.toContain(saved.receipt.patientId);
  expect(saved.snapshot.payload.advanced.data.measurements).toEqual(before.advanced);
  expect(saved.snapshot.payload.growthBasic.data.measurements).toEqual(before.basic);
  expect(saved.snapshot.payload.intake.history).toEqual(before.intake);
  const newRecord = await page.evaluate(id => window.VildaVault.getPatient(id), saved.receipt.patientId);
  const savedReference = await reference(page);
  expect(await vaultRecords(page, fixture.ids)).toEqual(recordsBefore);
  // Observe the real runtime clear without altering its timing, inputs or result.
  await page.evaluate(() => {
    const original = window.clearEstimatedIntakeWindowState;
    window.__nativeManualDobIntakeClears = [];
    window.clearEstimatedIntakeWindowState = function (...args) {
      const before = structuredClone(window.intakeHistory), suspended = shouldSuspendIntakeUserReset();
      const result = original.apply(this, args);
      window.__nativeManualDobIntakeClears.push({ before, after: structuredClone(window.intakeHistory), suspended });
      return result;
    };
  });
  await expect(page.locator('#dobInput')).toBeEditable();
  await page.locator('#dobInput').fill('17-06-2012'); await page.locator('#dobInput').blur();
  await expect.poll(() => page.evaluate(() => window.__nativeManualDobIntakeClears
    .some(call => Array.isArray(call.before) && call.before.length > 0 && call.after === null && call.suspended === false))).toBe(true);
  expect(await decision(page)).toEqual({ ready: true, state: 'dirty' });
  expect(await reference(page)).toBe(savedReference);
  expect(await page.evaluate(id => window.VildaVault.getPatient(id), saved.receipt.patientId)).toEqual(newRecord);
  expect(await vaultRecords(page, fixture.ids)).toEqual(recordsBefore);
});

test('anonymous JSON import and confirmed Restore preserve first-Save history scope and native Add', async ({ page }) => {
  const fixture = await createFictionalVault(page);
  const recordsBefore = await vaultRecords(page, fixture.ids);
  const imported = structuredClone(fixture.patients.a);
  imported.name = 'Fikcyjny Anonimowy Import'; imported.user.firstName = 'Anonimowy Import';
  imported.advanced.name = imported.name; imported.advanced.data.name = imported.name;
  imported.advanced.data.measurements = INDEPENDENT_ADVANCED_HISTORY;
  imported.growthBasic = { name: imported.name, data: { measurements: INDEPENDENT_BASIC_HISTORY } };
  imported.intake = { pal: '1.8', history: INDEPENDENT_INTAKE_HISTORY };
  imported.plan = { palFactor: 1.8, palWybrany: true };
  // Actual File parsing/import entry point. No patient-ID or restore flags are injected.
  await page.evaluate(payload => new Promise((resolve, reject) => {
    const file = new File([JSON.stringify(payload)], 'fikcyjny-import.json', { type: 'application/json' });
    window.VildaDataImportExport.handleFile({ target: { files: [file], value: 'fikcyjny-import.json' } },
      { applyLoadedData: window.applyLoadedData, onLoaded: resolve, onError: reject });
  }), imported);
  await readyForPatient(page);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Odtwórz zapisany stan', exact: true }).click();
  await expect(page.locator('#height')).toHaveValue('158'); await readyForPatient(page);
  expect(await firstSaveProducerScope(page)).toMatchObject({ patientId: null, historyScope: true });
  const before = await currentHistories(page);
  expect(before.basic).toEqual(INDEPENDENT_BASIC_HISTORY);
  expect(before.advanced).toEqual(INDEPENDENT_ADVANCED_HISTORY);
  expect(before.intake.filter(row => row.ageMonths === 150)).toEqual(INDEPENDENT_INTAKE_HISTORY);
  expect(await vaultRecords(page, fixture.ids)).toEqual(recordsBefore);
  await observeRealSave(page);
  const saved = await saveNative(page);
  // Scope adoption must complete before the following user action/calculation.
  expect(await firstSaveProducerScope(page)).toEqual({ patientId: saved.receipt.patientId,
    historyScope: true, replayMatches: true });
  expect(Object.values(fixture.ids)).not.toContain(saved.receipt.patientId);
  expect(saved.snapshot.payload.advanced.data.measurements).toEqual(before.advanced);
  expect(saved.snapshot.payload.growthBasic.data.measurements).toEqual(before.basic);
  expect(saved.snapshot.payload.intake.history).toEqual(before.intake);
  const newRecord = await page.evaluate(id => window.VildaVault.getPatient(id), saved.receipt.patientId);
  const savedReference = await reference(page);
  if (!await page.locator('#advMeasurements').isVisible()) await page.locator('#toggleAdvancedGrowth').click();
  const count = await page.locator('#advMeasurements .measure-row').count();
  await page.locator('#advAddMeasurementBtn').click();
  await expect(page.locator('#advMeasurements .measure-row')).toHaveCount(count + 1);
  expect(await currentHistories(page)).toEqual(before);
  expect(await reference(page)).toBe(savedReference);
  expect(await page.evaluate(id => window.VildaVault.getPatient(id), saved.receipt.patientId)).toEqual(newRecord);
  expect(await vaultRecords(page, fixture.ids)).toEqual(recordsBefore);
});
