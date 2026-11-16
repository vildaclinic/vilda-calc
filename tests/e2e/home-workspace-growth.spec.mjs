import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(240_000);
async function setup(page, { shell = false } = {}) {
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const fixture = await createFictionalVault(page, { shell, waitForAccountReadyBeforeReload: true });
  const payload = fictionalPatient(); payload.advanced.testicularVolume = '4to6';
  payload.puberty = { onsetAgeYears: 11.2, gnrhaStatus: 'zakonczone', gnrhaStartAgeYears: 8.5, gnrhaStopAgeYears: 10.5, cdgp: 'tak' };
  const id = await fixture.frame.evaluate(async data => (await VildaVault.savePatient(data, { dedup: false })).patientId, payload);
  await loadPatient(fixture.frame, id, 'restore');
  await fixture.frame.waitForFunction(() => !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !VildaDataImportExport.isMainSessionRestorePending() && !VildaDobAge.restorePending());
  await expect(fixture.frame.locator('#vhomeGrowthCard')).toBeVisible();
  await expect(fixture.frame.locator('#advTesticularVolume')).toHaveValue('4to6');
  await fixture.frame.evaluate(() => { calculateGrowthAdvanced(); vildaPersistFlushNow({ force: true }); });
  await fixture.frame.waitForFunction(() => VildaAdvancedGrowth.advGrowthPredictionsMatchCurrentInput());
  return { ...fixture, id, payload };
}
async function show(frame, tab = 'data') {
  await frame.locator(`[data-growth-open="${tab}"]`).click();
  const dialog = frame.getByRole('dialog', { name: 'Zaawansowane obliczenia wzrostowe', exact: true });
  await expect(dialog).toBeVisible(); return dialog;
}
const field = (dialog, id) => dialog.locator(`[data-growth-field="${id}"]`);
const apply = dialog => dialog.getByRole('button', { name: 'Zastosuj dane', exact: true });
async function snapshot(frame) {
  return frame.evaluate(() => {
    const payload = VildaDataImportExport.captureCurrentUserDataReadOnly(); delete payload.timestampISO;
    const session = VildaPersistence.readMainSession(); if (session) delete session.timestampISO;
    return { payload, session, activity: VildaPubertyAssessmentState.getActivityRevision() };
  });
}

test('home growth: volume belongs only to advanced data; drafts and tabs cancel without changing clinical data', async ({ page }) => {
  const { frame } = await setup(page);
  const before = await snapshot(frame), card = await frame.locator('#vhomeGrowthCard').boundingBox();
  await frame.locator('#tannerToggleBtn').click();
  const puberty = frame.getByRole('dialog', { name: 'Dane pokwitaniowe', exact: true });
  await expect(puberty.locator('[data-puberty-draft-field]')).toHaveCount(0);
  await puberty.getByRole('button', { name: 'Anuluj', exact: true }).click();
  const dialog = await show(frame);
  await expect(field(dialog, 'advTesticularVolume')).toHaveValue('4to6');
  await expect(dialog.locator('#vhomeGrowthNote-advTesticularVolume')).toContainText('KOWD/CDGP');
  await expect(dialog.locator('#vhomeGrowthNote-advTesticularVolume')).toContainText('Nie zastępuje oceny G');
  await expect(dialog.getByRole('tab')).toHaveCount(3);
  await field(dialog, 'advTesticularVolume').selectOption('gt6');
  await field(dialog, 'advMotherHeight').fill('170');
  await dialog.getByRole('button', { name: '+ Dodaj pomiar', exact: true }).click();
  await dialog.locator('[data-growth-row]').last().locator('[data-growth-history-field="2"]').fill('-1');
  await dialog.getByRole('button', { name: '+ Dodaj pomiar', exact: true }).click();
  await apply(dialog).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('tab', { name: 'Dane i pomiary', exact: true })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByRole('tab', { name: 'Prognozy', exact: true }).click();
  await expect(dialog.locator('#vhomeGrowthPanel-methods')).toContainText('niezastosowane dane');
  await expect(dialog.locator('#vhomeGrowthPanel-methods .vgcc')).toHaveCount(0);
  await expect(dialog.locator('[data-growth-document="report"]')).toBeDisabled();
  expect(await snapshot(frame)).toEqual(before);
  page.once('dialog', confirmation => confirmation.accept());
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect(await snapshot(frame)).toEqual(before);
  await expect(frame.locator('#vhomeGrowthExpand')).toBeFocused();
  const afterCard = await frame.locator('#vhomeGrowthCard').boundingBox();
  expect(afterCard.height).toBe(card.height); expect(card.height).toBe(352);
});

test('home growth: explicit volume-only apply preserves Tanner and history, survives F5 and reaches the saved patient', async ({ page }) => {
  const { frame, id } = await setup(page, { shell: true });
  const before = await snapshot(frame);
  const count = await frame.evaluate(patient => VildaVault.getPatient(patient).then(row => row.snapshotCount), id);
  await frame.evaluate(() => { window.__growthVolumeNode = document.getElementById('advTesticularVolume'); });
  const dialog = await show(frame); await field(dialog, 'advTesticularVolume').selectOption('gt6'); await apply(dialog).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => frame.evaluate(() => VildaPersistence.readMainSession()?.advanced?.testicularVolume)).toBe('gt6');
  const after = await snapshot(frame);
  expect(after.payload.pubertyAssessment).toEqual(before.payload.pubertyAssessment);
  expect(after.payload.puberty).toEqual(before.payload.puberty);
  expect(after.payload.advanced.data.measurements).toEqual(before.payload.advanced.data.measurements);
  expect(after.payload.advanced.data.predictionProfile.testicularVolumeKey).toBe('gt6');
  expect(await frame.evaluate(() => document.getElementById('advTesticularVolume') === window.__growthVolumeNode
    && window.__growthVolumeNode.form === document.getElementById('calcForm'))).toBe(true);
  expect(await frame.evaluate(patient => VildaVault.getPatient(patient).then(row => row.snapshotCount), id)).toBe(count);
  await page.reload({ waitUntil: 'load' }); const restored = await shellFrame(page); await readyForPatient(restored);
  await expect(restored.locator('#advTesticularVolume')).toHaveValue('gt6');
  await show(restored); await expect(field(restored.getByRole('dialog', { name: 'Zaawansowane obliczenia wzrostowe', exact: true }), 'advTesticularVolume')).toHaveValue('gt6');
  await restored.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await restored.evaluate(() => saveUserData());
  await expect.poll(() => restored.evaluate(patient => VildaVault.getPatient(patient).then(row => row.snapshots[0].payload.advanced.testicularVolume), id)).toBe('gt6');
});

test('home growth: history edits keep original nodes, metadata, annotations and GH locks; native results remain authoritative', async ({ page }) => {
  const { frame } = await setup(page);
  await frame.evaluate(() => {
    const rows = document.querySelectorAll('#advMeasurements .measure-row');
    window.__growthRow = rows[0]; rows[0].setAttribute('data-fictional-retained', 'keep');
    rows[0].querySelector('.adv-arrow-comment').value = 'Fikcyjna adnotacja';
    rows[1].setAttribute('data-gh-id', 'fictional-protected'); rows[1].setAttribute('data-gh-sync', 'true');
  });
  await expect(frame.locator('#advMeasurements .measure-row').nth(1).locator('.adv-height')).toBeDisabled();
  const protectedBefore = await frame.locator('#advMeasurements .measure-row').nth(1).evaluate(row => row.outerHTML);
  const dialog = await show(frame), locked = dialog.locator('[data-growth-row]').nth(1);
  await expect(locked.locator('input')).toHaveCount(5);
  for (const control of await locked.locator('input').all()) await expect(control).toBeDisabled();
  await expect(locked.getByRole('button', { name: 'Usuń pomiar', exact: true })).toBeDisabled();
  await dialog.locator('[data-growth-row]').first().locator('[data-growth-history-field="2"]').fill('124');
  await field(dialog, 'advFatherHeight').fill('183');
  await field(dialog, 'advBoneAge').fill('11.5');
  await dialog.getByRole('button', { name: '+ Dodaj pomiar', exact: true }).click();
  const added = dialog.locator('[data-growth-row]').last();
  for (const [index, value] of [[0, '10'], [1, '6'], [2, '145'], [3, '35']]) await added.locator(`[data-growth-history-field="${index}"]`).fill(value);
  await apply(dialog).click();
  expect(await frame.evaluate(() => window.__growthRow === document.querySelector('#advMeasurements .measure-row'))).toBe(true);
  await expect(frame.locator('#advMeasurements .measure-row').first()).toHaveAttribute('data-fictional-retained', 'keep');
  await expect(frame.locator('#advMeasurements .measure-row').first().locator('.adv-arrow-comment')).toHaveValue('Fikcyjna adnotacja');
  expect(await frame.locator('#advMeasurements .measure-row').nth(1).evaluate(row => row.outerHTML)).toBe(protectedBefore);
  await expect.poll(() => frame.evaluate(() => advancedGrowthData.measurements.some(row => row.ageMonths === 126 && row.height === 145 && row.weight === 35))).toBe(true);
  await expect(frame.locator('#advFatherHeight')).toHaveValue('183');
  await expect(frame.locator('#advBoneAge')).toHaveValue('11.5');
  await show(frame, 'analysis');
  expect(await dialog.locator('.adv-growth-result-block--trajectory').textContent()).toBe(await frame.locator('#advResults .adv-growth-result-block--trajectory').textContent());
  await dialog.getByRole('tab', { name: 'Prognozy', exact: true }).click();
  expect(await dialog.locator('.vgcc').textContent()).toBe(await frame.locator('#advResults .vgcc').textContent());
});

test('home growth: stale load, changed patient and locked vault cannot apply an old draft', async ({ page }) => {
  const { frame, id, ids } = await setup(page);
  const dialog = await show(frame); await field(dialog, 'advTesticularVolume').selectOption('gt6');
  // Simulate an in-flight same-patient restore with the real importer. A user
  // cannot click the patient picker underneath an open modal dialog.
  await frame.evaluate(() => VildaDataImportExport.applyLoadedData(VildaPersistence.readMainSession(), { isSessionRestore: true }));
  await expect(dialog).toBeHidden();
  await frame.waitForFunction(() => !VildaDataImportExport.isMainSessionRestorePending() && !VildaDobAge.restorePending());
  await expect(frame.locator('#advTesticularVolume')).toHaveValue('4to6');
  await show(frame); await field(dialog, 'advMotherHeight').fill('170');
  await frame.evaluate(next => sessionStorage.setItem('vildaCurrentPatientId', next), ids.b);
  await expect(dialog).toBeHidden(); await expect(frame.locator('#advMotherHeight')).toHaveValue('165');
  await loadPatient(frame, id, 'restore');
  await show(frame); await field(dialog, 'advTesticularVolume').selectOption('gt6');
  await frame.evaluate(() => VildaVault.lock()); await expect(dialog).toBeHidden();
  // Native Lock clears clinical controls. The discarded draft must not put
  // its value back into the now-locked document.
  await expect(frame.locator('#advTesticularVolume')).toHaveValue('');
  expect(await frame.evaluate(() => VildaVault.isUnlocked())).toBe(false);
});

test('home growth: mobile uses shared geometry, readable fields, compact card and a reachable footer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { frame } = await setup(page, { shell: true });
  const geometry = await frame.locator('#vhomeGrowthCard').evaluate(node => {
    const sum = Array.from(node.children).reduce((height, child) => {
      const css = getComputedStyle(child); return height + child.getBoundingClientRect().height + parseFloat(css.marginTop) + parseFloat(css.marginBottom);
    }, 0);
    const css = getComputedStyle(node);
    return { height: node.getBoundingClientRect().height, contentHeight: sum + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth) };
  });
  // A narrow title may wrap more than on desktop; compact means no reserved
  // empty vertical area, rather than an arbitrary cap on natural text height.
  expect(Math.abs(geometry.height - geometry.contentHeight)).toBeLessThan(2);
  const dialog = await show(frame);
  await expect(page.locator('#mobileBottomDock')).toHaveCSS('visibility', 'hidden');
  await expect(field(dialog, 'advTesticularVolume')).toHaveCSS('font-size', '16px');
  for (const name of ['Analiza', 'Prognozy', 'Dane i pomiary']) {
    await dialog.getByRole('tab', { name, exact: true }).click();
    const geometry = await dialog.evaluate(node => {
      const r = node.getBoundingClientRect(), apply = node.querySelector('.vhome-dialog-apply').getBoundingClientRect();
      return { width: r.width, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        footerInside: apply.bottom <= r.bottom, hit: document.elementFromPoint(apply.x + apply.width / 2, apply.y + apply.height / 2)?.closest('button')?.classList.contains('vhome-dialog-apply') };
    });
    expect(Math.round(geometry.width)).toBe(370); expect(geometry.overflow).toBe(false); expect(geometry.footerInside).toBe(true); expect(geometry.hit).toBe(true);
  }
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(page.locator('#mobileBottomDock')).toHaveCSS('visibility', 'visible');
  await expect(frame.locator('#vhomeGrowthExpand')).toBeFocused();
});

test('home growth: a synchronous owner change during fact authorization cannot write the old draft', async ({ page }) => {
  const { frame, ids } = await setup(page);
  const dialog = await show(frame); await field(dialog, 'advTesticularVolume').selectOption('gt6');
  await frame.evaluate(next => {
    const unsubscribe = VildaPubertyAssessmentState.subscribe(reason => {
      if (reason !== 'edit') return;
      unsubscribe(); sessionStorage.setItem('vildaCurrentPatientId', next);
    });
  }, ids.b);
  await apply(dialog).click(); await expect(dialog).toBeHidden();
  await expect(frame.locator('#advTesticularVolume')).toHaveValue('4to6');
  expect(await frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(ids.b);
  expect(await frame.evaluate(patient => VildaVault.getPatient(patient).then(row => row.snapshots[0].payload.advanced.testicularVolume), ids.b)).toBeUndefined();
});

test('home growth: new anonymous measurement retains explicit advanced values after F5', async ({ page }) => {
  const { frame } = await setup(page);
  await frame.evaluate(() => clearAllData()); await expect(frame.locator('#vhomeGrowthExpand')).toBeEnabled();
  for (const [id, value] of Object.entries({ age: '13', height: '158', weight: '46' })) await frame.locator('#' + id).fill(value);
  const dialog = await show(frame); await field(dialog, 'advTesticularVolume').selectOption('lt4');
  await field(dialog, 'advMotherHeight').fill('167'); await apply(dialog).click();
  await expect.poll(() => frame.evaluate(() => VildaPersistence.readMainSession()?.advanced?.testicularVolume)).toBe('lt4');
  await page.reload({ waitUntil: 'load' });
  await expect(frame.locator('#advTesticularVolume')).toHaveValue('lt4'); await expect(frame.locator('#advMotherHeight')).toHaveValue('167');
  expect(await frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
});
