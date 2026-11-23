import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient, shellFrame, readyForPatient } from '../support/centile-live-fixture.mjs';
import { prepareGabinet, choosePatient } from '../support/gabinet-patient-fixture.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';

test.use({ serviceWorkers: 'block', contextOptions: { reducedMotion: 'reduce' } });
test.setTimeout(240_000);
const PERINATAL = { gestationalWeeks: 34, gestationalDays: 2, birthWeightG: 1650,
  birthLengthCm: 41, birthHeadCircCm: 29, gravidity: 2, parity: 1, retainedMetadata: 'fictional-retained' };
const field = (dialog, key) => dialog.locator(`[data-home-birth-field="${key}"]`);
const save = dialog => dialog.getByRole('button', { name: 'Zapisz dane i zamknij', exact: true });
async function open(page, { shell = false, perinatal = PERINATAL, birth = null } = {}) {
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const fixture = await createFictionalVault(page, { shell, waitForAccountReadyBeforeReload: true });
  const payload = { ...fictionalPatient(), birth, perinatal };
  const id = await fixture.frame.evaluate(async value => (await window.VildaVault.savePatient(value, { dedup: false })).patientId, payload);
  await loadPatient(fixture.frame, id, 'restore');
  await fixture.frame.waitForFunction(() => !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !window.VildaDataImportExport.isMainSessionRestorePending() && !window.VildaDobAge.restorePending());
  await expect(fixture.frame.locator('#vhomePerinatalButton')).toBeEnabled();
  if (perinatal) await fixture.frame.waitForFunction(() => window.VildaPerinatalSource.zKartyPacjenta()?.weight === '1650');
  await fixture.frame.evaluate(() => window.update());
  await fixture.frame.evaluate(() => window.VildaDataImportExport.saveMainSessionNow());
  return { ...fixture, id, payload };
}
async function snapshot(frame) {
  return frame.evaluate(() => {
    const payload = window.VildaDataImportExport.captureCurrentUserDataReadOnly(); delete payload.timestampISO;
    const session = window.VildaPersistence.readMainSession(); if (session) delete session.timestampISO;
    return { payload, session };
  });
}
async function show(frame) {
  await frame.locator('#vhomePerinatalButton').click();
  const dialog = frame.getByRole('dialog', { name: 'Dane okołoporodowe', exact: true });
  await expect(dialog).toBeVisible(); return dialog;
}
async function compareSources(dialog) {
  for (const source of ['intergrowth', 'malewski']) await dialog.locator(`[data-home-birth-source][value="${source}"]`).check();
  await expect(dialog.locator('.sga-birth-compare-table')).toHaveCount(4);
}

test('home perinatal: Gabinet browse is read-only in Start and DocPro, and a new visit restores editing', async ({ page }) => {
  let { frame } = await prepareGabinet(page);
  const payload = { ...fictionalPatient({ firstName: 'Perinatalny' }), perinatal: PERINATAL,
    birth: { sourceChoice: 'niklasson', sourceKeys: ['niklasson'], sex: 'male', weeks: '34', days: '2',
      weight: '1650', length: '41', head: '29', hasComputed: false } };
  const id = await frame.evaluate(async value => {
    const id = crypto.randomUUID();
    value.visit = VildaVisitContext.create({ patientId: id, clinicalDateISO: '2026-06-17' });
    await VildaVault.savePatient(value, { patientId: id, dedup: false });
    return id;
  }, payload);
  await readyForPatient(frame);
  await choosePatient(frame, 'Perinatalny');
  let header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('tab', { name: 'Analiza', exact: true }).click();
  await expect.poll(() => frame.evaluate(id => VildaHomeEncounter.state(id).mode, id)).toBe('browse');
  const saved = () => frame.evaluate(id => VildaVault.getPatient(id).then(patient => patient.snapshots), id);
  const storedBefore = await saved();
  async function docpro() {
    const menu = await visibleChromeMenu(page);
    await menu.locator('a[href="docpro.html"]').click();
    const owner = await shellFrame(page, 'DocPro');
    await readyForPatient(owner);
    const confirm = owner.locator('#professionalConfirmBtn');
    if (await confirm.isVisible()) await confirm.click();
    return owner;
  }
  const readonlyDocpro = await docpro();
  await expect(readonlyDocpro.locator('#height')).not.toBeEditable();
  await expect(readonlyDocpro.locator('#weight')).not.toBeEditable();
  await expect(readonlyDocpro.locator('#sgaBirthWeight')).not.toBeEditable();
  await expect(readonlyDocpro.locator('#sgaBirthWeeks')).toBeDisabled();
  await (await visibleChromeMenu(page)).locator('a[href="index.html"]').click();
  await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible({ timeout: 15_000 });
  frame = await shellFrame(page);
  header = frame.locator('#vhomeGabinetHeader');
  await expect(header.getByRole('tab', { name: 'Analiza', exact: true })).toBeVisible({ timeout: 15_000 });
  expect(await frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(id);
  await expect.poll(() => frame.evaluate(id => VildaHomeEncounter.state(id).mode, id)).toBe('browse');
  await header.getByRole('tab', { name: 'Analiza', exact: true }).click();
  await expect(frame.locator('#vhomePerinatalButton')).toBeEnabled();

  const before = await snapshot(frame);
  const readonly = await show(frame);
  await expect(field(readonly, 'weight')).toHaveValue('1650');
  await expect(readonly.locator('[data-home-birth-field]:enabled, [data-home-birth-source]:enabled')).toHaveCount(0);
  await expect(save(readonly)).toBeHidden();
  await expect(readonly.getByRole('button', { name: 'Wyczyść dane okołoporodowe', exact: true })).toBeHidden();
  await expect(readonly.locator('[data-home-birth-results]')).toBeVisible();
  await readonly.locator('.vhome-dialog-cancel').click();
  await expect(readonly).toBeHidden();
  await frame.waitForFunction(() => !String(history.state?.vildaHomeDialog || '').startsWith('perinatal-'));
  expect(await snapshot(frame)).toEqual(before);
  expect(await saved()).toEqual(storedBefore);

  await header.getByRole('button', { name: 'Rozpocznij nową wizytę', exact: true }).click();
  await expect.poll(() => frame.evaluate(id => VildaHomeEncounter.state(id).mode, id)).toBe('new');
  const editable = await show(frame);
  await expect(field(editable, 'weight')).toBeEditable();
  await expect(field(editable, 'weeks')).toBeEnabled();
  await expect(save(editable)).toBeVisible();
  await field(editable, 'weight').fill('1700');
  await save(editable).click();
  await expect(editable).toBeHidden();
  await expect.poll(() => frame.evaluate(() => VildaPersistence.readMainSession()?.birth?.weight)).toBe('1700');
  expect(await saved()).toEqual(storedBefore);

  const editableDocpro = await docpro();
  await expect(editableDocpro.locator('#height')).toBeEditable();
  await expect(editableDocpro.locator('#weight')).toBeEditable();
  await expect(editableDocpro.locator('#sgaBirthWeight')).toHaveValue('1700');
  await expect(editableDocpro.locator('#sgaBirthWeight')).toHaveJSProperty('readOnly', false);
  expect(await saved()).toEqual(storedBefore);
});

test('home perinatal: pure live preview, native results, symmetric shortcuts and cancel preserve all data', async ({ page }) => {
  const { frame } = await open(page);
  const before = await snapshot(frame);
  const a = await frame.locator('#tannerToggleBtn').boundingBox(), b = await frame.locator('#vhomePerinatalButton').boundingBox();
  expect(a.height).toBe(b.height); expect(a.width).toBe(b.width); expect(a.y).toBe(b.y);
  const dialog = await show(frame);
  await expect(field(dialog, 'weeks')).toBeFocused(); await expect(field(dialog, 'weight')).toHaveValue('1650');
  await compareSources(dialog); await field(dialog, 'weight').fill('1750');
  await expect(dialog.locator('[data-home-birth-status]')).toHaveText('Wyniki aktualizowane automatycznie.');
  await expect.poll(() => dialog.locator('.sga-birth-compare-table').first().innerText()).toContain('SGA');
  expect(await snapshot(frame)).toEqual(before);
  page.once('dialog', prompt => prompt.accept()); await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect(await snapshot(frame)).toEqual(before); await expect(frame.locator('#vhomePerinatalButton')).toBeFocused();
  await show(frame); await expect(field(dialog, 'weight')).toHaveValue('1650');
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
});

test('home perinatal: explicit save survives F5, reaches native DocPro and preserves separate perinatal metadata', async ({ page }) => {
  const { frame, id } = await open(page, { shell: true });
  const count = await frame.evaluate(patient => window.VildaVault.getPatient(patient).then(value => value.snapshotCount), id);
  const dialog = await show(frame); await compareSources(dialog); await field(dialog, 'weight').fill('1700');
  await save(dialog).click(); await expect(dialog).toBeHidden();
  expect(await frame.evaluate(() => window.vildaBirthData?.weight)).toBe('1700');
  await expect.poll(() => frame.evaluate(() => window.VildaPersistence.readMainSession()?.birth?.weight)).toBe('1700');
  const expected = await frame.evaluate(() => window.VildaDataImportExport.captureCurrentUserDataReadOnly().birth);
  expect(expected.assessment.version).toBe(1); expect(expected.assessment.requestedSourceKeys).toEqual(['niklasson', 'intergrowth', 'malewski']);
  expect(await frame.evaluate(() => window.VildaHomePerinatal.ownsCurrentBirth())).toBe(true);
  // The explicit editor owns only the value it saved. An unrelated global
  // mutation cannot use its receipt to replace the same-patient session carry.
  await frame.evaluate(() => {
    window.vildaBirthData.weight = '1900';
    window.VildaDataImportExport.saveMainSessionNow();
  });
  expect(await frame.evaluate(() => window.VildaHomePerinatal.ownsCurrentBirth())).toBe(false);
  expect(await frame.evaluate(() => window.VildaPersistence.readMainSession().birth.weight)).toBe('1700');
  await frame.evaluate(value => { window.vildaBirthData = value; }, expected);
  expect(await frame.evaluate(() => window.VildaDataImportExport.captureCurrentUserDataReadOnly().perinatal)).toEqual(PERINATAL);
  expect(await frame.evaluate(patient => window.VildaVault.getPatient(patient).then(value => value.snapshotCount), id)).toBe(count);
  await page.reload({ waitUntil: 'load' }); const main = await shellFrame(page); await readyForPatient(main);
  await expect.poll(() => main.evaluate(() => window.vildaBirthData)).toEqual(expected);
  await main.evaluate(() => window.saveUserData());
  await expect.poll(() => main.evaluate(patient => window.VildaVault.getPatient(patient).then(value => value.snapshots[0].payload.birth), id)).toEqual(expected);
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await shellFrame(page, 'DocPro'); await readyForPatient(docpro);
  await expect.poll(() => docpro.evaluate(() => window.vildaSgaBirthPersistApi?.captureStateReadOnly().assessment)).toEqual(expected.assessment);
});

test('home perinatal: discrepancies remain explicit; draft clear cancels and saved partial data is not marked assessed', async ({ page }) => {
  const birth = { sourceChoice: 'niklasson', sourceKeys: ['niklasson'], sex: 'male', weeks: '34', days: '2', weight: '2100', length: '41', head: '29', hasComputed: false };
  const { frame } = await open(page, { birth }); const before = await snapshot(frame);
  const dialog = await show(frame); await expect(dialog.locator('[data-vilda-ur="sga"]')).toBeVisible();
  await expect(field(dialog, 'weight')).toHaveValue('2100');
  await dialog.getByRole('button', { name: 'Wyczyść dane okołoporodowe', exact: true }).click();
  await expect(field(dialog, 'weight')).toHaveValue(''); expect(await snapshot(frame)).toEqual(before);
  page.once('dialog', prompt => prompt.accept()); await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect(await snapshot(frame)).toEqual(before);
  await show(frame); await field(dialog, 'weeks').selectOption(''); await save(dialog).click();
  expect(await frame.evaluate(() => window.vildaBirthData.hasComputed)).toBe(false);
  expect(await frame.evaluate(() => window.vildaBirthData.assessment)).toBeUndefined();
  expect(await frame.evaluate(() => window.VildaPersistence.readMainSession().birth.weeks)).toBe('');
  expect(await frame.evaluate(() => window.VildaDataImportExport.captureCurrentUserDataReadOnly().perinatal)).toEqual(PERINATAL);
  await expect(frame.locator('#vhomePerinatalStatus')).toHaveText('Częściowe dane');
});

test('home perinatal: mobile uses shared modal geometry and stale owners cannot apply a draft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { frame, ids } = await open(page, { shell: true });
  const dialog = await show(frame); await expect(page.locator('#mobileBottomDock')).toHaveCSS('visibility', 'hidden');
  const size = await dialog.boundingBox(); expect(Math.round(size.width)).toBe(370);
  const weeks = await field(dialog, 'weeks').boundingBox(), days = await field(dialog, 'days').boundingBox();
  const weight = await field(dialog, 'weight').boundingBox(), length = await field(dialog, 'length').boundingBox();
  expect(days.y).toBeGreaterThan(weeks.y + weeks.height);
  expect(length.y).toBeGreaterThan(weight.y + weight.height);
  expect(weeks.width).toBe(days.width); expect(weight.width).toBe(length.width);
  await field(dialog, 'weight').fill('1800');
  await frame.evaluate(next => sessionStorage.setItem('vildaCurrentPatientId', next), ids.b);
  await expect(dialog).toBeHidden();
  expect(await frame.evaluate(() => window.vildaBirthData)).toBeNull();
  await expect(page.locator('#mobileBottomDock')).toHaveCSS('visibility', 'visible');
});

for (const withName of [true, false]) {
test('home perinatal: a new measurement keeps its encounter and birth data before the first patient save — ' + (withName ? 'named' : 'anonymous'), async ({ page }) => {
  const { frame } = await open(page, { perinatal: null });
  await frame.evaluate(() => window.clearAllData());
  await expect(frame.locator('#vhomePerinatalButton')).toBeEnabled();
  for (const [id, value] of Object.entries({ firstName: withName ? 'Fikcyjny' : '', lastName: withName ? 'Nowy' : '', age: '13', weight: '49', height: '158' }))
    await frame.locator('#' + id).fill(value);
  await frame.locator('#sex').selectOption('M');
  await frame.waitForFunction(() => window.VildaPersistence.readMainSession()?.user?.height === 158);
  const before = await snapshot(frame);
  if (!withName) expect(before.payload.name).toBe('');
  expect(await frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
  const dialog = await show(frame);
  await field(dialog, 'weeks').selectOption('34'); await field(dialog, 'days').selectOption('2');
  await field(dialog, 'weight').fill('1800');
  expect(await snapshot(frame)).toEqual(before);
  await save(dialog).click();
  await expect.poll(() => frame.evaluate(() => window.VildaPersistence.readMainSession()?.birth?.weight)).toBe('1800');
  const saved = (await snapshot(frame)).payload;
  expect(saved.visit).toEqual(before.payload.visit);
  expect(saved.birth.assessment.version).toBe(1);
  await page.reload({ waitUntil: 'load' }); await readyForPatient(page);
  await expect.poll(() => page.evaluate(() => window.vildaBirthData)).toEqual(saved.birth);
  expect(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
});
}
