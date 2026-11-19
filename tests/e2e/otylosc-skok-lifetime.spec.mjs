import { expect, test } from '@playwright/test';

// Synthetic accounts only. Unlike the imported native SK suite, these cases
// exercise the coherent current bundle with service workers allowed and real time.
test.use({ serviceWorkers: 'allow', reducedMotion: 'reduce' });
test.setTimeout(180_000);
const PASSWORD = 'Fictional#ScopedObesity!2026';
const DRUG = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const point = (id, type, dateISO, weight, height) => ({
  id, type, dateISO, ageYears: 13, ageMonths: 7, weight, height,
  drug: DRUG, dose: type === 'start' ? '0,25 mg / tydz.' : '2,4 mg / tydz.',
});
const START = point('fictional-scope-start', 'start', '2026-04-14', 80, 160);
const CONTROL = point('fictional-scope-control', 'continue', '2026-10-13', 75.2, 162.9);
const END = point('fictional-scope-end', 'end', '2026-11-03', 72.4, 163.6);
const patient = (name, points, weight = 72.4) => ({
  version: 1, name: `Fikcyjna ${name}`,
  user: { firstName: name, lastName: 'Fikcyjna', sex: 'F', age: 13, ageMonths: 7,
    dobISO: '2013-04-11', measuredAtISO: '2026-11-18', height: 163.6, weight },
  obesityTherapyPoints: points,
});

async function ready(page, userId) {
  await page.waitForFunction(id => {
    const v = window.VildaVault;
    return v?.isUnlocked() && (!id || v.getCurrentUser()?.userId === id)
      && window.VildaAuthUI?.isBootReady()
      && window.VildaPersistRuntime?.getSnapshot().initialized
      && window.VildaInit?.isInitialized('app:professional-module')
      && !document.documentElement.classList.contains('vilda-auth-locked')
      && typeof window.applyLoadedData === 'function'
      && typeof window.collectUserData === 'function'
      && typeof window.obesityTherapyMonitorSkok === 'function'
      && !!window.VildaDziennikOtylosciUI;
  }, userId);
  const restored = await page.evaluate(() => window.VildaDataImportExport.whenInitialMainSessionRestoreSettled());
  expect(restored.ready).toBe(true);
  await page.waitForFunction(() => !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !window.VildaDataImportExport.isMainSessionRestorePending()
    && !window.VildaDataImportExport.isMainSessionAutosavePaused()
    && !window.VildaPersistence.isAutosaveSuppressed() && !window.VildaDobAge.restorePending());
}
async function frames(page) {
  await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
}
async function records(page, ids) {
  return page.evaluate(async map => {
    const out = {};
    for (const [key, id] of Object.entries(map)) out[key] = {
      patient: await window.VildaVault.getPatient(id),
      notes: await window.VildaVault.listPatientNotesForPatient(id),
    };
    return JSON.parse(JSON.stringify(out));
  }, ids);
}
async function unchanged(page, f) {
  expect(await records(page, f.ids)).toEqual(f.before);
}
async function configure(page) {
  const events = [], errors = [];
  await page.exposeFunction('__scopedObesityWitness', event => events.push(event));
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    localStorage.setItem('analyticsConsent', 'denied');
    localStorage.setItem('pwzNumber', '6000001'); // Same explicitly fictional valid PWZ as native SK tests.
    const fictionalPro = () => {
      const access = window.VildaProAccess;
      if (!access) return;
      access.__setTokenModeForTest(false);
      access.setPlan('pro', '2099-12-31T23:59:59.000Z');
    };
    document.addEventListener('DOMContentLoaded', fictionalPro, { once: true });
    document.addEventListener('vilda:session-changed', fictionalPro);
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const result = Reflect.apply(set, this, [key, value]);
      if (this === sessionStorage && key === 'vilda:gh-jump') window.__scopedObesityWitness({
        type: 'cipher-commit', raw: String(value), cardOpen: !!document.querySelector('.vilda-auth-patient-card'),
      });
      return result;
    };
    // Native Chrome transition cancellation is observed precisely; it is not a
    // generic page-error filter and does not replace the transition API.
    for (const type of ['pageswap', 'pagereveal']) addEventListener(type, event => {
      if (event.viewTransition?.ready) event.viewTransition.ready.catch(error => window.__scopedObesityWitness({
        type: 'native-transition', event: event.type, trusted: event.isTrusted,
        name: error?.name, message: error?.message,
      }));
    });
  });
  return { events, errors };
}
async function setup(page, { ended = false, deleted = false } = {}) {
  const audit = await configure(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.VildaVault);
  const account = await page.evaluate(password => window.VildaVault.createUser(password, {
    label: 'Fikcyjny test zakresu skoku otyłości', iterations: 10000, deferServerContact: true,
  }), PASSWORD);
  // Account creation can retire/reload the auth host. Wait for the real owner
  // before the one deliberate fixture reload; no fixed delay or forced flag.
  await ready(page, account.userId);
  await page.reload({ waitUntil: 'load' });
  await ready(page, account.userId);
  await page.evaluate(() => {
    const mode = document.getElementById('resultsModeToggle');
    if (mode && !mode.checked) { mode.checked = true; mode.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  const confirm = page.locator('#professionalConfirmBtn');
  if (await confirm.isVisible()) await confirm.click();
  await expect(page.locator('#professionalOverlay')).toBeHidden();
  const ids = await page.evaluate(async payloads => {
    const result = {};
    for (const [name, value] of Object.entries(payloads)) result[name] = (await window.VildaVault.savePatient(value, { dedup: false })).patientId;
    return result;
  }, { a: patient('Zakres A', [], 65), b: patient('Zakres B', ended || deleted ? [START, CONTROL, END] : [START, CONTROL]) });
  if (deleted) await page.evaluate(async id => {
    const D = window.VildaDziennikOtylosci;
    const snapshot = (await window.VildaVault.getPatient(id)).snapshots[0].payload.obesityTherapyPoints;
    const state = await D.wczytaj(id, snapshot);
    await D.zapisz(id, D.planDzialania(state, id, { rodzaj: 'usun', id: 'fictional-scope-end' }).wersje);
  }, ids.b);
  await page.evaluate(async id => {
    const api = window.VildaDataImportExport;
    const saved = await window.VildaVault.getPatient(id);
    const token = api.captureAcceptedPatientLoad({ patientId: id });
    if (!token || !api.runAcceptedPatientLoad(token, saved.snapshots[0].payload, {
      apply: payload => window.applyLoadedData(payload),
      publish: detail => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
        detail: { patientId: id, source: 'pick', skipLoadChoice: true, ...detail },
      })),
    })) throw new Error('Fictional source patient load refused');
  }, ids.a);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(ids.a);
  await ready(page, account.userId); await frames(page);
  const f = { ...audit, ids, userId: account.userId, before: await records(page, ids) };
  return f;
}
async function card(page, id) {
  await page.evaluate(pid => window.VildaAuthUI.showPatientCard(pid), id);
  await expect(page.locator('.vilda-auth-patient-card')).toBeVisible();
  await expect(page.locator('.vdo')).toBeVisible();
}
const edit = page => page.locator('.vdo-list:not(.vdo-list-deleted) > .vdo-item[data-date="2026-04-14"]')
  .getByRole('button', { name: 'Edytuj w DocPro →', exact: true });
const message = page => page.locator('#obesityTherapyActionMsg');
async function assertAudit(f) {
  for (const event of f.events.filter(e => e.type === 'native-transition')) {
    expect(event).toMatchObject({ trusted: true, name: 'AbortError', message: 'Transition was skipped' });
    expect(['pageswap', 'pagereveal']).toContain(event.event);
  }
  expect(f.errors).toEqual([]);
  for (const event of f.events.filter(e => e.type === 'cipher-commit')) {
    expect(Object.keys(JSON.parse(event.raw)).sort()).toEqual(['data', 'iv']);
    expect(event.raw).not.toContain(f.ids.a); expect(event.raw).not.toContain(f.ids.b);
    expect(event.raw).not.toContain('Fikcyjna');
  }
}
async function cipherGate(page) {
  let heldResolve, releaseResolve;
  const held = new Promise(resolve => { heldResolve = resolve; });
  const release = new Promise(resolve => { releaseResolve = resolve; });
  let released = false;
  await page.exposeBinding('__holdRealObesityCipher', async (_source, detail) => {
    heldResolve(detail); await release;
  });
  await page.evaluate(() => {
    const vault = window.VildaVault, original = vault.encryptPayloadForCurrentUser;
    if (!Object.getOwnPropertyDescriptor(vault, 'encryptPayloadForCurrentUser')?.writable) throw new Error('Real Vault encryption method is not instrumentable');
    vault.encryptPayloadForCurrentUser = async function (...args) {
      const cipher = await Reflect.apply(original, this, args);
      const value = args[0];
      if (value?.namespace === 'vilda-ui-intent' && value.purpose === 'gh-jump' && value.value?.obesity) {
        await window.__holdRealObesityCipher({ actualAesComplete: true,
          cipherKeys: Object.keys(cipher).sort(), cardOpen: !!document.querySelector('.vilda-auth-patient-card') });
      }
      return cipher;
    };
  });
  return { held, async release() { released = true; releaseResolve(); },
    async dispose() {
      if (!released) {
        await page.evaluate(() => window.VildaUiIntents?.clear('gh-jump')).catch(() => {});
        releaseResolve(); released = true;
      }
    } };
}
async function assertNoEdit(page) {
  await expect(page.locator('#obesityEditBar')).toBeHidden();
  expect(await page.evaluate(() => sessionStorage.getItem('vilda:gh-jump'))).toBeNull();
}
async function openDeleted(page, id) {
  await card(page, id);
  await page.getByRole('button', { name: /Usunięte wpisy \(1\)/ }).click();
  await page.getByRole('button', { name: 'Dodaj ponownie w DocPro →', exact: true }).click();
  await expect(message(page)).toContainText('Uzupełniono z usuniętego wpisu: Zakończenie, 03.11.2026.', { timeout: 20000 });
  await frames(page);
}


test('scoped obesity: external Back retires the original card during real AES without committing or navigating', async ({ page }) => {
  const f = await setup(page); const gate = await cipherGate(page);
  try {
    const historyLength = await page.evaluate(() => history.length);
    await card(page, f.ids.b);
    expect(await page.evaluate(() => history.length), 'real native card owns a history sentinel').toBeGreaterThan(historyLength);
    await edit(page).click();
    expect(await gate.held).toMatchObject({ actualAesComplete: true, cipherKeys: ['data', 'iv'], cardOpen: true });
    await expect(page.locator('.vilda-auth-patient-card')).toBeVisible();
    expect(f.events.filter(e => e.type === 'cipher-commit')).toHaveLength(0);
    expect(await page.evaluate(() => sessionStorage.getItem(window.VildaUiIntents.reservationKey('gh-jump')))).not.toBeNull();
    await page.evaluate(() => history.back());
    await expect(page.locator('.vilda-auth-patient-card')).toHaveCount(0);
    await gate.release();
    await page.waitForFunction(() => sessionStorage.getItem(window.VildaUiIntents.reservationKey('gh-jump')) === null);
    await frames(page);
    expect(f.events.filter(e => e.type === 'cipher-commit')).toHaveLength(0);
    expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(f.ids.a);
    await expect(page).toHaveURL(/\/docpro\.html(?:[?#]|$)/u);
    await assertNoEdit(page);
    await unchanged(page, f); await assertAudit(f);
  } finally { await gate.dispose(); }
});

test('scoped obesity: real post-route Clear survives doctor input, retired Clear cannot affect a new measurement', async ({ page }) => {
  const f = await setup(page, { deleted: true });
  await openDeleted(page, f.ids.b);
  await expect(page.locator('#obesityWeight')).toHaveValue('72.4');
  await page.locator('#obesityWeight').fill('71.8');
  await message(page).getByRole('button', { name: 'Wyczyść pola', exact: true }).click();
  await expect(page.locator('#obesityWeight')).toHaveValue('');
  // Obtain a new native message and retain its actual DOM button, then use the
  // real public clear boundary; no fake patient/lifetime state is substituted.
  await openDeleted(page, f.ids.b);
  const oldButton = await message(page).getByRole('button', { name: 'Wyczyść pola', exact: true }).elementHandle();
  await page.evaluate(() => window.clearAllData());
  await expect(page.locator('#height'), 'real native clear boundary emptied the primary measurement').toHaveValue('');
  await page.locator('#obesityWeight').fill('70.9');
  await oldButton.evaluate(button => button.click());
  await frames(page);
  await expect(page.locator('#obesityWeight')).toHaveValue('70.9');
  await oldButton.dispose();
  await unchanged(page, f); await assertAudit(f);
});

// Hold only the exact NEW receiver's real native450ms callback. The original
// timer ID is returned, clearTimeout is delegated and cancellation honored. No
// Date/claim/guard/API/module identity is replaced by this timing control.
async function installLandingGate(page) {
  await page.addInitScript(() => {
    const nativeSet = window.setTimeout.bind(window), nativeClear = window.clearTimeout.bind(window);
    const entries = new Map();
    const state = window.__nativeObesityLanding = { held: 0, cancelled: 0, released: 0, pending: [] };
    window.setTimeout = function (fn, delay, ...args) {
      const source = typeof fn === 'function' ? Function.prototype.toString.call(fn) : '';
      if (Number(delay) !== 450 || fn.name !== 'land' || !source.includes('ghJumpLandingCurrent(claim)') || !source.includes('ghJumpCancel(claim)'))
        return nativeSet(fn, delay, ...args);
      const entry = { id: null, fn, args, source, cancelled: false, held: false };
      entry.id = nativeSet(() => { entry.held = true; state.held++; state.pending.push(entry); }, delay);
      entries.set(entry.id, entry);
      return entry.id;
    };
    window.clearTimeout = function (id) {
      const entry = entries.get(id);
      if (entry) { entry.cancelled = true; state.cancelled++; entries.delete(id); }
      return nativeClear(id);
    };
    state.release = () => {
      const entry = state.pending.shift();
      if (!entry) return { released: false, reason: 'missing' };
      if (entry.cancelled) return { released: false, reason: 'cancelled', source: entry.source };
      entries.delete(entry.id); state.released++;
      Reflect.apply(entry.fn, window, entry.args);
      return { released: true, source: entry.source };
    };
  });
}
test('scoped obesity: replacing the captured monitor cannot run the actual held450ms callback on another function', async ({ page }) => {
  await installLandingGate(page);
  const f = await setup(page);
  await card(page, f.ids.b); await edit(page).click();
  await page.waitForFunction(() => window.__nativeObesityLanding?.held === 1);
  expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(f.ids.b);
  await expect(page.locator('#obesityEditBar')).toBeHidden();
  await page.evaluate(() => {
    window.__replacementObesityCalls = 0;
    const replacement = function (_target, _options) { window.__replacementObesityCalls++; return true; };
    Object.defineProperty(replacement, 'uiIntentLandingVersion', { value: 1 });
    window.obesityTherapyMonitorSkok = replacement;
  });
  await page.locator('#obesityWeight').fill('70.6');
  const release = await page.evaluate(() => window.__nativeObesityLanding.release());
  expect(release.source).toContain('ghJumpLandingCurrent(claim)');
  expect(release.released).toBe(true);
  expect(await page.evaluate(() => window.__replacementObesityCalls)).toBe(0);
  await frames(page);
  await expect(page.locator('#obesityWeight')).toHaveValue('70.6');
  await assertNoEdit(page);
  await unchanged(page, f); await assertAudit(f);
});
