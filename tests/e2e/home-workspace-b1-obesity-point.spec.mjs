// One actual app shell → accepted homepage B1 → native obesity point → DocPro.
// Disposable fictional account; no guard/API/crypto/timer/lifetime replacement.
import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { loadPatient, prepareDocProUserFlow, readyClearPage } from '../support/clear-current-state-fixture.mjs';

const CARD = '#vhomePatientCard';
const NATIVE = '.vhome-native-patient-card';
const DRUG = 'Wegovy (semaglutyd) – s.c. 1×/tydz.';
const START = { id: 'fictional-home-b1-start', type: 'start', dateISO: '2026-04-14',
  ageYears: 13, ageMonths: 0, weight: 80, height: 160, drug: DRUG, dose: '0,25 mg / tydz.' };
const CONTROL = { id: 'fictional-home-b1-control', type: 'continue', dateISO: '2026-10-13',
  ageYears: 13, ageMonths: 6, weight: 75.2, height: 162.9, drug: DRUG, dose: '2,4 mg / tydz.' };

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
test.setTimeout(240_000);

async function settled(frame) {
  await frame.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady()
    && !window.__vildaPersistRestoring && !window.__vildaLustroWpis && !window.__vildaSuspendIntakeUserReset
    && !window.VildaDataImportExport.isMainSessionRestorePending()
    && !window.VildaDataImportExport.isMainSessionAutosavePaused()
    && !window.VildaPersistence.isAutosaveSuppressed() && !window.VildaDobAge.restorePending());
}
async function records(frame, ids) {
  return frame.evaluate(async map => {
    const all = {}, byId = rows => rows.slice().sort((a, b) => a.id.localeCompare(b.id));
    for (const [name, id] of Object.entries(map)) all[name] = {
      patient: await window.VildaVault.getPatient(id),
      notes: byId(await window.VildaVault.listPatientNotesForPatient(id)),
    };
    return JSON.parse(JSON.stringify(all));
  }, ids);
}

test('home B1 shell: selected patient Leczenie opens its existing obesity Włączenie in native DocPro without saving records', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true;
    // The shared account fixture writes PWZ0000000 at every document init.
    // Set the native SK suite's explicitly fictional valid preference at DOM
    // ready, before production boot, including a later reloaded DocPro pane.
    document.addEventListener('DOMContentLoaded', () => localStorage.setItem('pwzNumber', '6000001'), { once: true });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue() : route.abort();
  });
  // This existing fixture creates a disposable native account and its legitimate
  // test PRO entitlement, then waits for account readiness before its one reload.
  const fixture = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
  // Prepare the ordinary professional receiver before testing the handoff;
  // this case isolates B1 navigation rather than racing its ten-second boot.
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const preparedDocpro = await shellFrame(page, 'DocPro');
  await readyForPatient(preparedDocpro);
  // Native speculative preload has a three-pane limit. Observe completion of
  // its actual panes; no clocks, lifecycle flags or readiness guards are forced.
  await page.waitForFunction(() => {
    const panes = [...document.querySelectorAll('iframe.app-pane')];
    return panes.length >= 3 && panes.every(pane => pane.contentDocument?.readyState === 'complete');
  });
  for (const pane of await page.locator('iframe.app-pane').elementHandles()) {
    const frame = await pane.contentFrame();
    if (frame && await frame.evaluate(() => Boolean(window.VildaDataImportExport))) await readyClearPage(frame);
    await pane.dispose();
  }
  const nativePwz = preparedDocpro.locator('#pwzNumber');
  if (await nativePwz.isVisible()) await nativePwz.fill('6000001');
  await prepareDocProUserFlow(preparedDocpro);
  await expect(preparedDocpro.locator('#professionalModule')).toBeVisible();
  await page.evaluate(() => window.VildaShell.navigate('start'));
  const start = await shellFrame(page, 'Start');
  await readyForPatient(start);
  const payload = fictionalPatient({ firstName: 'B1-Skok-Fikcyjna', sex: 'F', age: 13, height: 163.6, weight: 72.4 });
  Object.assign(payload.user, { ageMonths: 7, dobISO: '2013-04-11', measuredAtISO: '2026-11-18' });
  payload.obesityTherapyPoints = [START, CONTROL];
  const id = await start.evaluate(async value => (await window.VildaVault.savePatient(value, { dedup: false })).patientId, payload);
  await start.evaluate(patientId => window.VildaVault.savePatientNote({ patientId,
    title: 'Fikcyjna niezależna notatka B1', body: 'Ta notatka nie należy do skoku ani punktu leczenia.', category: 'observation' }), id);
  await loadPatient(start, id, 'restore');
  await settled(start);
  await start.waitForFunction(() => Boolean(window.VildaHomePatient));
  await expect(page).toHaveURL(/\/app\.html#\/start$/u);
  await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible();
  await expect(start.locator(CARD)).toBeVisible();
  expect(await start.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(id);
  const ids = { ...fixture.ids, selected: id }, before = await records(start, ids);

  // Enter only through the actual compact homepage card, not showPatientCard().
  await start.locator(CARD).getByRole('button', { name: 'Powiększ kartę pacjenta', exact: true }).click();
  const native = start.locator(NATIVE);
  await expect(native).toBeVisible();
  await expect(native).toHaveAttribute('data-home-patient-id', id);
  const originalRoot = await native.elementHandle();
  await native.locator('.vhome-b1-nav [data-tab="treatment"]').click();
  const treatment = native.locator('.vilda-patient-tab-content[data-tab="treatment"]');
  await expect(treatment).toBeVisible();
  const entry = treatment.locator('.vdo-list:not(.vdo-list-deleted) > .vdo-item[data-date="2026-04-14"]');
  await expect(entry).toContainText('Od Włączenia zależą cykl, ocena wg ChPL i listy pacjentów.');
  await expect.poll(() => page.evaluate(() => history.state?.shellAuthOwner)).toBe('start');
  await entry.getByRole('button', { name: 'Edytuj w DocPro →', exact: true }).click();

  await expect(page).toHaveURL(/\/app\.html#\/docpro$/u);
  await expect(page.locator('iframe.app-pane[title="DocPro"]')).toBeVisible();
  const docpro = await shellFrame(page, 'DocPro');
  // No entitlement, professional-mode or authority changes after the tested
  // click. Native restore/readiness is observed in the actual destination.
  await readyClearPage(docpro);
  await expect(docpro.locator('#professionalModule')).toBeVisible();
  await expect.poll(() => docpro.evaluate(() => window._vildaCurrentPatientId)).toBe(id);
  await expect(docpro.locator('#obesityEditBar')).toContainText('Edytujesz punkt: Włączenie', { timeout: 20_000 });
  await expect(docpro.locator('#obesityMonitorSection')).toBeVisible();
  await expect(docpro.locator('#obesityAge')).toHaveValue('13');
  await expect(docpro.locator('#obesityAgeMonths')).toHaveValue('0');
  await expect(docpro.locator('#obesityWeight')).toHaveValue('80');
  await expect(docpro.locator('#obesityHeight')).toHaveValue('160');
  await expect(docpro.locator('#obesityDate')).toHaveValue('2026-04-14');
  await expect(docpro.locator('#obesityMonDrug')).toHaveValue(DRUG);
  await expect(docpro.locator('#obesityDose')).toHaveValue('0,25 mg / tydz.');
  await expect(docpro.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  // Hidden frame visibility is insufficient: the exact original B1 node must
  // have been retired by native navigation, not remain as an active portal.
  await expect.poll(() => originalRoot.evaluate(node => node.isConnected)).toBe(false);
  await originalRoot.dispose();
  expect(await page.evaluate(() => history.state?.shellAuthOwner || null)).toBeNull();
  await settled(docpro);
  await docpro.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); }));
  expect(await docpro.evaluate(() => sessionStorage.getItem('vilda:gh-jump'))).toBeNull();
  expect(await records(docpro, ids)).toEqual(before);
  expect(errors).toEqual([]);
});
