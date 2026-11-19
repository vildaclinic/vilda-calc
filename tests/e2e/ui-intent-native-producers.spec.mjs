import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const PASSWORD = 'Fictional#UiProducer!2026';
const A = { version: 1, name: 'Fikcyjny Transport A', user: { lastName: 'Fikcyjny', firstName: 'Transport A', age: 8, ageMonths: 0, sex: 'M', height: 126, weight: 25 } };
const B = { version: 1, name: 'Fikcyjna Transport B', user: { lastName: 'Fikcyjna', firstName: 'Transport B', age: 11, ageMonths: 0, sex: 'F', height: 141, weight: 36 },
  advanced: { name: 'Fikcyjna Transport B', data: { measurements: [{ uid: 'fictional-imported-row', ageMonths: 60, ageYears: 5, height: 111, weight: 19 }] } } };

async function ready(page) {
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && !document.documentElement.classList.contains('vilda-auth-locked'));
}
async function setup(page) {
  const events = [], errors = [], transitionCancellations = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.exposeFunction('__e2eIntentWitness', value => {
    events.push(value);
    if (value.type === 'transition-rejection') transitionCancellations.push(value);
    if (value.type === 'transition-rejection' && (value.name !== 'AbortError' || value.message !== 'Transition was skipped'
      || !['pageswap', 'pagereveal'].includes(value.event) || value.trusted !== true)) errors.push('Unexpected native transition rejection: ' + JSON.stringify(value));
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    // Observe the real browser transition promise. Native Chrome intentionally
    // skips cross-document transitions while authentication UI is present.
    // Every rejection is recorded; unexpected reasons still fail this suite.
    for (const type of ['pageswap', 'pagereveal']) addEventListener(type, event => {
      const ready = event.viewTransition?.ready;
      if (ready && typeof ready.then === 'function') ready.then(undefined, failure => {
        window.__e2eIntentWitness({ type: 'transition-rejection', event: event.type, trusted: event.isTrusted,
          name: failure?.name, message: failure?.message, href: location.href, at: performance.now() });
      });
    });
    const nativeSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const result = nativeSet.call(this, key, value);
      if (this === sessionStorage && key === 'vilda:pendingPatientLoad') {
        window.__e2eIntentWitness({ type: 'commit', href: location.href, at: performance.now(), raw: sessionStorage.getItem(key), cardOpen: !!document.querySelector('.vilda-auth-patient-card') });
      }
      return result;
    };
    document.addEventListener('vilda:patient-loaded', event => window.__e2eIntentWitness({ type: 'patient-loaded', href: location.href, at: performance.now(), patientId: event.detail?.patientId }));
    addEventListener('pagehide', () => window.__e2eIntentWitness({ type: 'pagehide', href: location.href,
      at: performance.now(), raw: sessionStorage.getItem('vilda:pendingPatientLoad') }));
  });
  await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.VildaVault);
  await page.evaluate(password => window.VildaVault.createUser(password, { label: 'Fikcyjny transport UI', iterations: 10000, deferServerContact: true }), PASSWORD);
  await page.reload({ waitUntil: 'load' }); await ready(page);
  const ids = await page.evaluate(async ([a, b]) => {
    const savedA = await window.VildaVault.savePatient(a, { dedup: false });
    const savedB = await window.VildaVault.savePatient(b, { dedup: false });
    const api = window.VildaDataImportExport;
    await api.whenInitialMainSessionRestoreSettled();
    const record = await window.VildaVault.getPatient(savedA.patientId);
    const token = api.captureAcceptedPatientLoad({ patientId: savedA.patientId });
    if (!token || !api.runAcceptedPatientLoad(token, record.snapshots[0].payload, {
      apply: payload => window.applyLoadedData(payload),
      publish: detail => document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: savedA.patientId, source: 'pick', skipLoadChoice: true, ...detail } })),
    })) throw new Error('Fictional native A load refused');
    return { a: savedA.patientId, b: savedB.patientId };
  }, [A, B]);
  await expect.poll(() => page.evaluate(() => window.VildaPersistence.readMainSession()?.name)).toBe(A.name);
  const before = await page.evaluate(async ids => ({ a: await window.VildaVault.getPatient(ids.a), b: await window.VildaVault.getPatient(ids.b) }), ids);
  await page.goto('/notatki.html', { waitUntil: 'load' }); await ready(page);
  expect(await page.evaluate(() => ({ apply: typeof window.applyLoadedData, shell: !!window.VildaShell,
    patient: sessionStorage.getItem('vildaCurrentPatientId'), main: window.VildaPersistence.readMainSession()?.name })))
    .toEqual({ apply: 'undefined', shell: false, patient: ids.a, main: A.name });
  events.length = 0;
  return { ids, before, events, errors, transitionCancellations };
}
async function openB(page) {
  await page.locator('#patientsListBtnSidebar').click();
  const list = page.locator('.vilda-auth-patients');
  await expect(list).toBeVisible();
  await list.locator('.pt-row', { hasText: B.name }).locator('.pt-row-open').click();
  await expect(page.locator('.vilda-auth-patient-card')).toBeVisible();
}
function assertTransitionObservations(fixture) {
  for (const event of fixture.transitionCancellations) {
    expect(event).toMatchObject({ name: 'AbortError', message: 'Transition was skipped', trusted: true });
    expect(['pageswap', 'pagereveal']).toContain(event.event);
  }
}
async function reportWitness(fixture, detail = {}) {
  const report = { ...detail, events: fixture.events,
    expectedNativeTransitionCancellations: fixture.transitionCancellations,
    expectedNativeTransitionCancellationCount: fixture.transitionCancellations.length,
    unexpectedPageErrors: fixture.errors };
  await mkdir(test.info().outputDir, { recursive: true });
  const file = test.info().outputPath('fictional-native-intent-witness.json');
  await writeFile(file, JSON.stringify(report, null, 2));
  await test.info().attach('fictional-native-intent-witness.json', { contentType: 'application/json', path: file });
}
async function verify(page, fixture) {
  await expect(page).toHaveURL(/\/index\.html(?:[?#]|$)/u);
  await ready(page);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(fixture.ids.b);
  await expect.poll(() => page.evaluate(() => window.lastLoadedData?.name)).toBe(B.name);
  await expect.poll(() => page.evaluate(() => window.VildaPersistence.readMainSession()?.name)).toBe(B.name);
  const after = await page.evaluate(async ids => ({ a: await window.VildaVault.getPatient(ids.a), b: await window.VildaVault.getPatient(ids.b),
    name: document.getElementById('name')?.value, pending: sessionStorage.getItem('vilda:pendingPatientLoad') }), fixture.ids);
  expect(after.a.snapshots).toEqual(fixture.before.a.snapshots);
  expect(after.b.snapshots).toEqual(fixture.before.b.snapshots);
  expect(after.name).toBe(B.name); expect(after.pending).toBeNull();
  await expect.poll(() => fixture.events.filter(event => event.type === 'pagehide').length).toBeGreaterThan(0);
  expect(fixture.events.filter(event => event.type === 'commit')).toHaveLength(1);
  const commit = fixture.events.find(event => event.type === 'commit'), hide = fixture.events.find(event => event.type === 'pagehide');
  expect(commit).toBeTruthy(); expect(commit.href).toContain('/notatki.html');
  expect(Object.keys(JSON.parse(commit.raw)).sort()).toEqual(['data', 'iv']);
  expect(commit.raw).not.toContain(fixture.ids.b); expect(commit.raw).not.toContain(B.name);
  expect(hide.raw).toBe(commit.raw); expect(commit.at).toBeLessThanOrEqual(hide.at);
  const plain = await page.evaluate(async raw => { const cipher = JSON.parse(raw); return window.VildaVault.decryptPayloadForCurrentUser(cipher.iv, cipher.data); }, commit.raw);
  expect(plain.value).toEqual({ patientId: fixture.ids.b });
  await reportWitness(fixture, { expectedPatientId: fixture.ids.b,
    sourceSnapshotCount: after.a.snapshots.length, targetSnapshotCount: after.b.snapshots.length });
  assertTransitionObservations(fixture);
  expect(fixture.errors).toEqual([]);
}

test('native standalone Chrome patient picker commits encrypted B before navigation while main patient is A', async ({ page }) => {
  const fixture = await setup(page);
  await openB(page);
  expect(await page.evaluate(() => typeof window.applyLoadedData)).toBe('undefined');
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta', exact: true }).click();
  await verify(page, fixture);
});

// Native timeline projection assigns every imported row its latest snapshot ID.
// Keep this genuine fixture on its native snapshot branch; the legacy gt branch
// needs a historical no-snapshot event and cannot be produced by this save API.
test('native imported timeline rows keep their snapshot editor instead of the legacy no-snapshot handoff', async ({ page }) => {
  const fixture = await setup(page);
  const rows = await page.evaluate(async id => (await window.VildaVault.listPatientTimelineEvents(id)).filter(event => event.type === 'measurement'), fixture.ids.b);
  expect(rows.find(row => row.uid === 'fictional-imported-row')).toMatchObject({ patientId: fixture.ids.b, snapshotId: fixture.before.b.snapshots[0].snapshotId, ageMonths: 60, height: 111, weight: 19 });
  await openB(page);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const actions = page.locator('.vilda-patient-timeline-list').getByRole('button', { name: 'Akcje dla pomiaru', exact: true });
  await expect(actions).toHaveCount(2);
  await actions.locator('..').filter({ hasText: '111' }).getByRole('button', { name: 'Akcje dla pomiaru', exact: true }).click();
  const menu = page.locator('.vilda-timeline-measure-menu');
  await expect(menu.getByRole('button', { name: 'Edytuj', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Edytuj w kalkulatorze', exact: true })).toHaveCount(0);
  expect(fixture.events.filter(event => event.type === 'commit')).toHaveLength(0);
  expect(await page.evaluate(() => sessionStorage.getItem('vilda:pendingPatientLoad'))).toBeNull();
  await expect(page).toHaveURL(/\/notatki\.html$/u);
  await reportWitness(fixture);
  assertTransitionObservations(fixture);
  expect(fixture.errors).toEqual([]);
});

test('native standalone picker cannot commit or navigate after its original owner locks during publication', async ({ page }) => {
  const fixture = await setup(page);
  await openB(page);
  const userId = await page.evaluate(patientId => {
    const vault = window.VildaVault, userId = vault.getCurrentUser().userId;
    document.addEventListener('vilda:patient-loaded', function invalidate(event) {
      if (event.detail?.patientId !== patientId) return;
      document.removeEventListener('vilda:patient-loaded', invalidate);
      vault.lock('fictional-producer-boundary');
      window.__e2eProducerBoundary = { locked: !vault.isUnlocked(), patientId: event.detail.patientId };
    });
    return userId;
  }, fixture.ids.b);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__e2eProducerBoundary)).toEqual({ locked: true, patientId: fixture.ids.b });
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  await expect(page).toHaveURL(/\/notatki\.html$/u);
  expect(fixture.events.filter(event => event.type === 'commit')).toHaveLength(0);
  expect(await page.evaluate(() => sessionStorage.getItem('vilda:pendingPatientLoad'))).toBeNull();
  // A new native session for this same fictional account must not authorize
  // completion of the callback captured under its earlier session token.
  await page.evaluate(({ userId, password }) => window.VildaVault.unlockUser(userId, password), { userId, password: PASSWORD });
  await ready(page);
  expect(await page.evaluate(() => window.VildaVault.getCurrentUser().userId)).toBe(userId);
  await expect(page).toHaveURL(/\/notatki\.html$/u);
  expect(fixture.events.filter(event => event.type === 'commit')).toHaveLength(0);
  expect(await page.evaluate(() => sessionStorage.getItem('vilda:pendingPatientLoad'))).toBeNull();
  const after = await page.evaluate(async ids => ({ a: await window.VildaVault.getPatient(ids.a), b: await window.VildaVault.getPatient(ids.b) }), fixture.ids);
  expect(after.a.snapshots).toEqual(fixture.before.a.snapshots);
  expect(after.b.snapshots).toEqual(fixture.before.b.snapshots);
  await reportWitness(fixture, { originalOwnerLockObserved: true, sameAccountUnlocked: true });
  assertTransitionObservations(fixture);
  expect(fixture.errors).toEqual([]);
});
