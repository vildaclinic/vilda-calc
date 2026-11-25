import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { orientacja, wygenerujPdf } from '../support/siatka-poziomo.mjs';
import { visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(240_000);
async function setup(page, { shell = false, gh = false, payload = fictionalPatient() } = {}) {
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const fixture = await createFictionalVault(page, { shell, waitForAccountReadyBeforeReload: true });
  payload.advanced.testicularVolume = '4to6';
  payload.puberty = { onsetAgeYears: 11.2, gnrhaStatus: 'zakonczone', gnrhaStartAgeYears: 8.5, gnrhaStopAgeYears: 10.5, cdgp: 'tak' };
  if (gh) payload.ghTherapyPoints = [{ ...ghStart }];
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
  await expect(dialog).toBeVisible();
  if (tab === 'data') {
    await expect(dialog.locator('.vhome-growth-fold[open]')).toHaveCount(0);
    await dialog.locator('.vhome-growth-fold > summary').filter({ hasText: 'Warunki interpretacji' }).click();
    expect(await dialog.locator('.vhome-growth-family').evaluate(node => node.compareDocumentPosition(document.querySelector('.vhome-growth-history')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
  }
  return dialog;
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
  // Native startup can release its last guard without another UI event.
  await frame.evaluate(() => { window.__vildaPersistRestoring = true; VildaHomeGrowth.refresh(); });
  await expect(frame.locator('[data-growth-open="data"]')).toBeDisabled();
  await frame.evaluate(() => { window.__vildaPersistRestoring = false; });
  await expect(frame.locator('[data-growth-open="data"]')).toBeEnabled();
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
  await dialog.locator('[data-growth-row^="new-"]').first().locator('[data-growth-history-field="2"]').fill('-1');
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
  // The native GH observer decorates the synthetic protected row on its next
  // frame. Capture its fully rendered baseline, rather than racing that label.
  await expect(frame.locator('#advMeasurements .measure-row').nth(1).locator('.gh-z-wiersza-etykieta')).toContainText('Punkt leczenia GH');
  const protectedValues = await frame.locator('#advMeasurements .measure-row').nth(1).evaluate(row => {
    window.__growthProtectedRow = row;
    return Array.from(row.querySelectorAll('input, select, textarea'), input => ({ value: input.value, disabled: input.disabled }));
  });
  const protectedBefore = await frame.locator('#advMeasurements .measure-row').nth(1).evaluate(row => row.outerHTML);
  const dialog = await show(frame), locked = dialog.locator('[data-growth-source-index="1"]');
  await expect(locked.locator('input')).toHaveCount(5);
  for (const control of await locked.locator('input').all()) await expect(control).toBeDisabled();
  await expect(locked.getByRole('button', { name: 'Usuń pomiar', exact: true })).toBeDisabled();
  await dialog.locator('[data-growth-source-index="0"]').locator('[data-growth-history-field="2"]').fill('124');
  await field(dialog, 'advFatherHeight').fill('183');
  await field(dialog, 'advBoneAge').fill('11.5');
  await dialog.getByRole('button', { name: '+ Dodaj pomiar', exact: true }).click();
  const added = dialog.locator('[data-growth-row^="new-"]').first();
  for (const [index, value] of [[0, '10'], [1, '6'], [2, '145'], [3, '35']]) await added.locator(`[data-growth-history-field="${index}"]`).fill(value);
  const invalid = await dialog.locator('input:enabled, select:enabled').evaluateAll(controls => controls.filter(c => !c.checkValidity()).map(c => ({ field: c.getAttribute('aria-label'), value: c.value, step: c.step, message: c.validationMessage })));
  expect(invalid).toEqual([]);
  await apply(dialog).click(); await expect(dialog).toBeHidden();
  expect(await frame.evaluate(() => window.__growthRow === document.querySelector('#advMeasurements .measure-row'))).toBe(true);
  await expect(frame.locator('#advMeasurements .measure-row').first()).toHaveAttribute('data-fictional-retained', 'keep');
  await expect(frame.locator('#advMeasurements .measure-row').first().locator('.adv-arrow-comment')).toHaveValue('Fikcyjna adnotacja');
  expect(await frame.locator('#advMeasurements .measure-row').nth(1).evaluate(row => row.outerHTML)).toBe(protectedBefore);
  expect(await frame.locator('#advMeasurements .measure-row').nth(1).evaluate(row => row === window.__growthProtectedRow)).toBe(true);
  expect(await frame.locator('#advMeasurements .measure-row').nth(1).evaluate(row =>
    Array.from(row.querySelectorAll('input, select, textarea'), input => ({ value: input.value, disabled: input.disabled })))).toEqual(protectedValues);
  await expect.poll(() => frame.evaluate(() => advancedGrowthData.measurements.some(row => row.ageMonths === 126 && row.height === 145 && row.weight === 35))).toBe(true);
  await expect(frame.locator('#advFatherHeight')).toHaveValue('183');
  await expect(frame.locator('#advBoneAge')).toHaveValue('11.5');
  await show(frame, 'analysis');
  await expect(dialog.locator('.vhome-a2-chart svg')).toBeVisible();
  for (const metric of ['height', 'weight', 'bmi']) {
    await dialog.locator('[data-growth-metric="' + metric + '"]').click();
    const nativeSeries = await frame.evaluate(name => JSON.parse(document.querySelector('#advResults [data-vhome-trajectory]').getAttribute('data-vhome-trajectory')).points.filter(p => Number.isFinite(p[name])), metric);
    await expect(dialog.locator('.vhome-a2-chart circle')).toHaveCount(nativeSeries.length);
  }
  expect(await dialog.locator('.adv-growth-result-block--trajectory').textContent()).toBe(await frame.locator('#advResults .adv-growth-result-block--trajectory').textContent());
  await dialog.getByRole('tab', { name: 'Prognozy', exact: true }).click();
  for (const selector of ['.vgcc-hero', '.vgcc-mph', '.vgcc-target', '.vgcc-stats', '.vgcc-det-body', '.vgcc-hint']) {
    expect(await dialog.locator('.vgcc ' + selector).allTextContents()).toEqual(await frame.locator('#advResults .vgcc ' + selector).allTextContents());
  }
  const values = '.vgcc-row .vgcc-nm, .vgcc-row .vgcc-val';
  expect(await dialog.locator('.vgcc ' + values.split(', ').join(', .vgcc ')).allTextContents()).toEqual(await frame.locator('#advResults .vgcc ' + values.split(', ').join(', #advResults .vgcc ')).allTextContents());
});

test('home growth: reported patient measurements remain native read-only copies outside the editable history and patient save', async ({ page }) => {
  const { frame, id, ids } = await setup(page, { gh: true });
  await withGh(frame);
  await frame.evaluate(async patientId => {
    const journal = window.VildaDziennikOtylosci;
    for (const [dateISO, ageYears, ageMonths, weight] of [
      ['2025-06-17', 12, 0, 39.9], ['2025-12-17', 12, 6, 42.5],
      ['2026-03-17', 12, 9, 44.4], ['2026-06-17', 13, 0, 45.9],
    ]) {
      const plan = journal.planNowego(await journal.wczytaj(patientId, []), patientId, {
        type: 'continue', dateISO, ageYears, ageMonths, weight, weightSource: 'pacjent',
        height: null, drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: '', dose: '2,4 mg / tydz.',
      });
      if (!plan.ok) throw new Error('Fictional journal fixture rejected: ' + JSON.stringify(plan.bledy));
      await journal.zapisz(patientId, plan.wersje);
    }
  }, id);
  await expect.poll(() => frame.evaluate(() => window.VildaDziennikOtylosci.punktyWczytanego()?.length)).toBe(4);
  await frame.evaluate(() => window.VildaAdvDziennik.odswiez());
  const native = frame.locator('#advMeasurements > .adv-dz-row');
  await expect(native).toHaveCount(2);
  await expect(frame.locator('#advHistoryPatient')).toHaveText('2 od pacjenta');
  await frame.waitForFunction(() => VildaAdvancedGrowth.advGrowthPredictionsMatchCurrentInput());
  const describeRows = rows => rows.map(row => ({
    age: row.getAttribute('data-age-months'), origin: row.getAttribute('data-origin'),
    date: row.getAttribute('data-date'), label: row.getAttribute('aria-label'), text: row.textContent,
    values: [...row.querySelectorAll('.adv-dz-value')].map(value => value.textContent),
  }));
  const reported = await native.evaluateAll(describeRows);
  // Both the archived 12-year visit and the current 13-year visit take priority
  // over a diary entry from the same month. The other two entries stay visible.
  expect(reported.map(row => [row.age, row.origin, row.values])).toEqual([
    ['150', 'pacjent', ['12', '6', '—', '42,5', '']],
    ['153', 'pacjent', ['12', '9', '—', '44,4', '']],
  ]);
  const canonical = await frame.evaluateHandle(() => [...document.querySelectorAll('#advMeasurements .measure-row')]);
  const canonicalBefore = await canonical.evaluate(rows => rows.map(row => row.outerHTML));
  expect(canonicalBefore).toHaveLength(5);
  const stored = () => frame.evaluate(async patientId => ({
    patient: await VildaVault.getPatient(patientId), notes: await VildaVault.listPatientNotesForPatient(patientId),
  }), id);
  const before = await snapshot(frame), storedBefore = await stored();
  const dialog = await show(frame);
  const copies = dialog.locator('[data-growth-reported-history]');
  await expect(copies).toBeVisible();
  await expect(copies.getByRole('heading', { name: 'Pomiary z dokumentacji leczenia', exact: true })).toBeVisible();
  expect(await copies.locator('.adv-dz-row').evaluateAll(describeRows)).toEqual(reported);
  await expect(copies.locator('input, select, textarea, button, [contenteditable="true"]')).toHaveCount(0);
  await expect(dialog.locator('#vhomeGrowthHistoryCount')).toHaveText('Wcześniejsze pomiary: 7 · 2 od pacjenta');
  await expect(dialog.locator('[data-growth-source-index]')).toHaveCount(5);
  await expect(apply(dialog)).toBeDisabled();
  expect(await canonical.evaluate(rows => rows.every(row => row.isConnected)
    && rows.every((row, index) => row === document.querySelectorAll('#advMeasurements .measure-row')[index]))).toBe(true);
  expect(await canonical.evaluate(rows => rows.map(row => row.outerHTML))).toEqual(canonicalBefore);
  expect(await snapshot(frame)).toEqual(before);
  expect(await stored()).toEqual(storedBefore);
  await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await canonical.evaluate(rows => rows.map(row => row.outerHTML))).toEqual(canonicalBefore);
  expect(await snapshot(frame)).toEqual(before);
  expect(await stored()).toEqual(storedBefore);
  await canonical.dispose();

  await show(frame);
  // An external patient selection invalidates the open modal before the native
  // picker can load the replacement patient. Exercise the existing owner guard.
  await frame.evaluate(next => sessionStorage.setItem('vildaCurrentPatientId', next), ids.b);
  await expect(dialog).toBeHidden();
  await expect(dialog.locator('[data-growth-reported-history]')).toHaveCount(0);
  const menu = await visibleChromeMenu(page);
  await menu.getByRole('button', { name: 'Baza pacjentów', exact: true }).click();
  await frame.locator(`.pt-row[data-patient-id="${ids.b}"] .pt-row-open`).click();
  await expect.poll(() => frame.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  await frame.getByRole('button', { name: 'Wczytaj tego pacjenta', exact: true }).click();
  const confirmation = frame.getByRole('dialog', { name: 'Ten pacjent jest już wczytany', exact: true });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Wczytaj ponownie', exact: true }).click();
  await expect(confirmation).toBeHidden();
  const choices = frame.locator('#vildaLoadChoiceModal');
  await expect(choices).toBeVisible();
  await frame.waitForFunction(() => !window.VildaDobAge.restorePending());
  await frame.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => { requestAnimationFrame(resolve); }); }));
  await choices.locator('#vildaLcmRestore').click();
  await expect(choices).toHaveCount(0);
  await expect.poll(() => frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(ids.b);
  await expect(frame.locator('#firstName')).toHaveValue('Beata');
  await frame.locator('[data-growth-open="data"]').click();
  const replacement = frame.getByRole('dialog', { name: 'Zaawansowane obliczenia wzrostowe', exact: true });
  await expect(replacement).toBeVisible();
  await expect(replacement.getByRole('tab', { name: 'Dane i pomiary', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(replacement.locator('[data-growth-reported-history]')).toBeHidden();
  await expect(replacement.locator('.adv-dz-row')).toHaveCount(0);
  await replacement.getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect(await stored()).toEqual(storedBefore);
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

const ghStart = { id: 'fictional-a2-gh-start', type: 'start', ageYears: 6, ageMonths: 0, weight: 20, height: 115, boneAge: null,
  dose: .03, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: .6 };
async function withGh(frame) {
  // The accepted patient payload owns this initial list. Injecting module state
  // after load can invalidate the native carrier before its first write.
  await frame.waitForFunction(() => VildaDataImportExport.getSaveReadiness().ready);
  await expect.poll(() => frame.evaluate(() => VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []))).toEqual([ghStart]);
  await expect.poll(() => frame.evaluate(() => VildaDataImportExport.captureCurrentUserDataReadOnly().ghTherapyPoints)).toEqual([ghStart]);
  await expect.poll(() => frame.evaluate(() => VildaPersistence.readMainSession()?.ghTherapyPoints)).toEqual([ghStart]);
  await frame.evaluate(() => {
    importTherapyPointsToAdvancedGrowth(); calculateGrowthAdvanced(); vildaPersistFlushNow({ force: true });
  });
  await expect(frame.locator('#advMeasurements [data-gh-id]')).toHaveCount(1);
  await expect(frame.locator('#advMeasurements .gh-z-wiersza-btn').first()).toBeEnabled();
  // The real bridge also imports this fixture into the intake history on its
  // queued update. Settle that actor before taking the pure-cancel baseline.
  await expect.poll(() => frame.evaluate(() => VildaDataImportExport.captureCurrentUserDataReadOnly().intake.history
    .some(row => row.ageMonths === 72 && row.height === 115 && row.weight === 20))).toBe(true);
  await expect.poll(() => frame.evaluate(() => VildaPersistence.readMainSession()?.ghTherapyPoints)).toEqual([ghStart]);
}
async function ghAction(dialog) {
  const key = await dialog.locator('[data-growth-source-index="0"]').getAttribute('data-growth-row');
  return dialog.locator('[data-growth-gh="' + key + '"]');
}
async function expectGhPortalReturned(frame, dialog) {
  try { await expect(dialog.locator('.vhome-growth-tabs')).toBeVisible(); }
  catch (error) {
    try {
    const diagnostic = await frame.evaluate(() => ({
      readiness: VildaDataImportExport.getSaveReadiness(),
      paused: VildaDataImportExport.isMainSessionAutosavePaused(),
      suppressed: VildaPersistence.isAutosaveSuppressed(),
      sequence: VildaDataImportExport.getApplyLoadedDataSequence(),
      module: VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []),
      window: window.ghTherapyPoints,
      session: VildaPersistence.readMainSession()?.ghTherapyPoints,
      status: document.getElementById('vhomeGrowthDraftStatus')?.textContent,
      failureObservation: (() => {
        // This runs only after the original portal-return assertion has failed.
        const expectedLabel = 'Fikcyjny sejf testu panelu siatek';
        const read = reader => {
          try { return { status: 'available', value: reader() }; }
          catch (failure) {
            return { status: 'read-error', error: {
              name: typeof failure?.name === 'string' ? failure.name : 'Error',
              message: typeof failure?.message === 'string' ? failure.message : 'Read unavailable',
            } };
          }
        };
        const primitive = reader => read(() => {
          const value = reader();
          if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value ?? null;
          throw new Error('Expected a primitive public observation');
        });
        const fullJSON = reader => {
          const captured = read(reader);
          if (captured.status !== 'available') return captured;
          const serialized = read(() => JSON.stringify(captured.value));
          return serialized.status === 'available'
            ? { status: 'available', value: captured.value, json: serialized.value ?? null,
              jsonType: typeof serialized.value }
            : { status: 'serialization-error', error: serialized.error };
        };
        // Never serialize the Vault, a session token, a lease or an adapter.
        const account = read(() => {
          const current = VildaVault.getCurrentUser();
          return { userId: typeof current?.userId === 'string' ? current.userId : null,
            label: typeof current?.label === 'string' ? current.label : null };
        });
        const fictionalAccount = account.status === 'available' && account.value.label === expectedLabel;
        const unavailable = { status: 'redacted', reason: 'Expected fictional account is unavailable' };
        const observation = {
          capturedAtISO: primitive(() => new Date().toISOString()),
          performanceNow: primitive(() => performance.now()),
          expectedAccountLabel: expectedLabel,
          fictionalAccount,
          account: fictionalAccount ? account : account.status === 'read-error' ? account : unavailable,
          mainSession: unavailable,
          publicReadOnlyUserSnapshot: {
            meaning: 'Public read-only snapshot; not the private native writer candidate.',
            ...unavailable,
          },
        };
        if (!fictionalAccount) return observation;
        observation.owner = {
          accountOwnerId: account.value.userId,
          actualPatientId: primitive(() => sessionStorage.getItem('vildaCurrentPatientId')),
          documentPatientId: primitive(() => window._vildaCurrentPatientId),
        };
        // Keep every key, its order and all native metadata, including timestamps.
        observation.mainSession = fullJSON(() => VildaPersistence.readMainSession());
        observation.publicReadOnlyUserSnapshot = {
          meaning: 'Public read-only snapshot; not the private native writer candidate.',
          ...fullJSON(() => VildaDataImportExport.captureCurrentUserDataReadOnly()),
        };
        observation.state = {
          persistRestoring: primitive(() => window.__vildaPersistRestoring),
          mirrorWrite: primitive(() => window.__vildaLustroWpis),
          mainSessionRestorePending: primitive(() => VildaDataImportExport.isMainSessionRestorePending()),
          initialMainSessionRestore: read(() => {
            const state = VildaDataImportExport.getInitialMainSessionRestoreState();
            return state == null ? null : { ready: state.ready === true,
              reason: typeof state.reason === 'string' ? state.reason : null };
          }),
          dobRestorePending: primitive(() => VildaDobAge.restorePending()),
          persistenceRestoring: primitive(() => VildaPersistence.isRestoring()),
          clearInProgress: primitive(() => VildaPersistence.isClearInProgress()),
          saveStatus: primitive(() => VildaSaveStatusIndicator.getState()),
        };
        return observation;
      })(),
    }));
    await test.info().attach('pending-native-gh-session', { body: JSON.stringify(diagnostic), contentType: 'application/json' });
    } catch {
      // Diagnostic read/serialization/attachment failures cannot replace the assertion.
    }
    throw error;
  }
}
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test('home A2: native GH portal cancels purely and saves/imports the original therapy point · ' + viewport.width, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { frame, id } = await setup(page, { shell: true, gh: true }); await withGh(frame);
    const before = await snapshot(frame), dialog = await show(frame);
    await (await ghAction(dialog)).click();
    await expect(dialog.locator('#ghZWierszaPanel')).toBeVisible();
    await expect(dialog.locator('#ghZWierszaDawka')).toHaveValue('');
    await expect(dialog.locator('#ghZWierszaProgram')).toHaveValue('SNP');
    await dialog.locator('#ghZWierszaDawka').fill('.8');
    await dialog.getByRole('button', { name: 'Anuluj punkt', exact: true }).click();
    await expect(dialog.locator('#ghZWierszaPanel')).toHaveCount(0);
    expect(await snapshot(frame)).toEqual(before);
    await (await ghAction(dialog)).click();
    await dialog.getByRole('button', { name: 'Zapisz punkt leczenia', exact: true }).click();
    await expect(dialog.locator('#ghZWierszaBlad')).toContainText('dawkę');
    await dialog.locator('#ghZWierszaDawka').fill('.8');
    // Capture the session at the exact moment the ordinary data UI returns.
    // Later Playwright round trips must not hide an early-success race.
    await frame.evaluate(() => {
      window.__ghSessionAtPortalReturn = null;
      const host = document.getElementById('vhomeGrowthDialog');
      const observer = new MutationObserver(() => {
        const tabs = host.querySelector('.vhome-growth-tabs');
        if (!host.open || !tabs || tabs.hidden || host.querySelector('#ghZWierszaPanel')) return;
        observer.disconnect();
        window.__ghSessionAtPortalReturn = JSON.stringify(VildaPersistence.readMainSession()?.ghTherapyPoints);
      });
      observer.observe(host, { childList: true, attributes: true, subtree: true });
    });
    await dialog.getByRole('button', { name: 'Zapisz punkt leczenia', exact: true }).click();
    await expectGhPortalReturned(frame, dialog);
    const points = await frame.evaluate(() => VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []));
    expect(points).toHaveLength(2); expect(points[0]).toEqual(ghStart);
    await expect.poll(() => frame.evaluate(() => window.__ghSessionAtPortalReturn)).toBe(JSON.stringify(points));
    expect(await frame.evaluate(() => JSON.stringify(VildaPersistence.readMainSession()?.ghTherapyPoints))).toBe(JSON.stringify(points));
    const added = points.find(p => p.id !== ghStart.id);
    expect(added).toMatchObject({ type: 'continue', ageYears: 7, ageMonths: 0, height: 123.6, weight: 23.9, doseAbs: .8, doseUnit: 'mg/kg/d' });
    expect(added.dose).toBeCloseTo(.8 / 23.9, 10);
    const native = frame.locator('#advMeasurements [data-gh-id="' + added.id + '"]'); await expect(native).toHaveCount(1);
    const rowKey = await native.evaluate(row => Array.from(document.querySelectorAll('#advMeasurements .measure-row')).indexOf(row));
    const readOnly = dialog.locator('[data-growth-source-index="' + rowKey + '"]');
    for (const input of await readOnly.locator('input').all()) await expect(input).toBeDisabled();
    const geometry = await dialog.evaluate(node => { const r = node.getBoundingClientRect(); return { overflow: node.scrollWidth > r.width, footer: node.querySelector('.vhome-dialog-footer').getBoundingClientRect().bottom <= r.bottom }; });
    expect(geometry).toEqual({ overflow: false, footer: true });
    await dialog.getByRole('button', { name: 'Anuluj', exact: true }).click();
    // A queued native session import and an explicit patient save are separate
    // acknowledgements. Reload only after both writers confirm this point.
    await expect.poll(() => frame.evaluate(() => VildaPersistence.readMainSession()?.ghTherapyPoints)).toEqual(points);
    await expect.poll(() => frame.evaluate(() => VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
    const receipt = await frame.evaluate(() => VildaDataImportExport.saveUserDataWithReceipt({}));
    expect(receipt).toMatchObject({ saved: true });
    await expect.poll(() => frame.evaluate(patient => VildaVault.getPatient(patient).then(row => row.snapshots[0].payload.ghTherapyPoints), id)).toEqual(points);
    await page.reload({ waitUntil: 'load' }); const restored = await shellFrame(page); await readyForPatient(restored);
    await expect(restored.locator('#advMeasurements [data-gh-id="' + added.id + '"]')).toHaveCount(1);
    expect(await restored.evaluate(() => VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []))).toEqual(points);
  });
}

test('home A2: native GH refuses an unseen measurement and invalidates an old owner before saving', async ({ page }) => {
  const { frame, ids } = await setup(page, { gh: true }); await withGh(frame);
  const dialog = await show(frame); await (await ghAction(dialog)).click();
  await dialog.locator('#ghZWierszaDawka').fill('.8');
  await frame.evaluate(() => {
    // Deliberately omit an event: the native actor must notice this itself.
    document.querySelector('#advMeasurements .measure-row .adv-height').value = '124';
    document.querySelector('#vhomeGrowthDialog .vhome-dialog-apply').click();
  });
  await expect(dialog.locator('#ghZWierszaBlad')).toBeVisible();
  expect(await frame.evaluate(() => VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []).length)).toBe(1);
  await frame.evaluate(next => {
    sessionStorage.setItem('vildaCurrentPatientId', next);
    document.querySelector('#vhomeGrowthDialog .vhome-dialog-apply').click();
  }, ids.b);
  await expect(dialog).toBeHidden();
  expect(await frame.evaluate(() => VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []).length)).toBe(1);
});

test('home A2: Generuj siatki shares native generators and keeps annotation/layout drafts pure until Apply', async ({ page }) => {
  const { frame } = await setup(page, { shell: true });
  await frame.getByRole('combobox', { name: 'Siatki referencyjne', exact: true }).selectOption('PALCZEWSKA');
  await frame.waitForFunction(() => VildaAdvancedGrowth.advGrowthPredictionsMatchCurrentInput());
  await frame.evaluate(() => { calculateGrowthAdvanced(); vildaPersistFlushNow({ force: true }); VildaDataImportExport.saveMainSessionNow(); });
  const before = await snapshot(frame); await show(frame);
  await frame.locator('[data-growth-document="charts"]').click();
  const charts = frame.getByRole('dialog', { name: 'Generuj siatki', exact: true }); await expect(charts).toBeVisible();
  await expect(charts.locator('[data-chart-preset]')).toHaveCount(3);
  const settings = charts.getByRole('button', { name: 'Ustawienia publikacji i komentarze', exact: true });
  await settings.click();
  await charts.getByLabel('Układ PDF', { exact: true }).selectOption('landscape');
  await charts.getByLabel('Siatki do publikacji', { exact: true }).check();
  await charts.getByLabel('Komentarz ze strzałką · Bieżący pomiar', { exact: true }).check();
  await charts.getByLabel('Komentarz · Bieżący pomiar', { exact: true }).fill('E2E-A2: fikcyjny komentarz');
  expect(await snapshot(frame)).toEqual(before);
  await expect(charts.locator('[data-chart-native="generatePalCentileChart"]')).toBeDisabled();
  page.once('dialog', confirmation => confirmation.accept()); await charts.getByRole('button', { name: 'Anuluj', exact: true }).click();
  expect(await snapshot(frame)).toEqual(before);
  await frame.evaluate(() => VildaHomeGrowth.openCharts()); await expect(charts).toBeVisible();
  await settings.click();
  await charts.getByLabel('Układ PDF', { exact: true }).selectOption('landscape');
  await charts.getByLabel('Siatki do publikacji', { exact: true }).check();
  await charts.getByLabel('Komentarz ze strzałką · Bieżący pomiar', { exact: true }).check();
  await charts.getByLabel('Komentarz · Bieżący pomiar', { exact: true }).fill('E2E-A2: fikcyjny komentarz');
  await charts.getByRole('button', { name: 'Zastosuj ustawienia', exact: true }).click(); await expect(charts).toBeHidden();
  await expect(frame.locator('#advCurrentArrowEnable')).toBeChecked(); await expect(frame.locator('#advCurrentArrowComment')).toHaveValue('E2E-A2: fikcyjny komentarz');
  await expect(frame.locator('#palPdfLayoutLandscape')).toBeChecked();
  await frame.evaluate(() => VildaHomeGrowth.openCharts());
  // Selecting a creator invokes the original button handler exactly once.
  await frame.evaluate(() => { window.__a2NativeCreator = []; VildaPublicationCreator.open = options => window.__a2NativeCreator.push(options); });
  await charts.locator('[data-chart-native="openChartCreatorBtn"]').click();
  await expect(charts).toBeHidden(); expect(await frame.evaluate(() => window.__a2NativeCreator.length)).toBe(1);
  // The sidebar's existing documents modal routes to this exact same editor.
  await frame.evaluate(() => VildaPatientDocuments.open());
  const docs = page.locator('#patientDocumentsDialog'); await expect(docs).toBeVisible();
  await docs.locator('[data-patient-documents-charts]').click(); await expect(charts).toBeVisible();
  await frame.evaluate(() => VildaVault.lock());
  await expect(page.getByRole('heading', { name: 'Kto się loguje?', exact: true })).toBeVisible();
  for (const remaining of page.frames()) await expect(remaining.locator('#vhomeGrowthChartsDialog:visible')).toHaveCount(0);
});

test('home charts: all three presets create native PDFs without changing the main reference or layout preference', async ({ page }) => {
  const { frame } = await setup(page);
  const source = frame.getByRole('combobox', { name: 'Siatki referencyjne', exact: true });
  await source.selectOption('OLAF');
  await frame.waitForFunction(() => VildaAdvancedGrowth.advGrowthPredictionsMatchCurrentInput());
  const preferences = () => frame.evaluate(() => ({
    layout: VildaCentileLandscape.readLayout(), source: getCentileChartState().source,
  }));
  const before = await preferences();
  for (const [layout, expectedPages] of [['landscape', ['poziom']], ['portrait', ['pion', 'pion']]]) {
    await frame.evaluate(() => VildaHomeGrowth.openCharts());
    const chooser = frame.locator('#vhomeGrowthChartsDialog');
    await chooser.locator(`[data-chart-preset="pal-${layout}"]`).click();
    await expect(chooser.getByLabel('Układ PDF', { exact: true })).toHaveValue(layout);
    expect(await preferences()).toEqual(before);
    const pages = await wygenerujPdf(frame, () => document.querySelector('#vhomeGrowthChartsDialog .vhome-dialog-apply').click());
    expect(pages.map(orientacja)).toEqual(expectedPages);
    expect(await preferences()).toEqual(before);
  }
  await source.selectOption('PALCZEWSKA');
  await frame.waitForFunction(() => VildaAdvancedGrowth.advGrowthPredictionsMatchCurrentInput());
  const beforeOlaf = await preferences();
  await frame.evaluate(() => {
    const render = window.buildCentilePageCanvas;
    window.__renderedChartSources = [];
    window.buildCentilePageCanvas = function (options) {
      window.__renderedChartSources.push(options.chartSource);
      return render(options);
    };
    VildaHomeGrowth.openCharts();
  });
  await frame.locator('#vhomeGrowthChartsDialog [data-chart-preset="olaf"]').click();
  const pages = await wygenerujPdf(frame, () => document.querySelector('#vhomeGrowthChartsDialog .vhome-dialog-apply').click());
  expect(pages.map(orientacja)).toEqual(['pion']);
  expect(await frame.evaluate(() => window.__renderedChartSources)).toEqual(['OLAF']);
  expect(await preferences()).toEqual(beforeOlaf);
});

test('home A2: forecast graphics preserve native published values, clamps, exclusions and complete qualifications', async ({ page }) => {
  const { frame } = await setup(page);
  const results = await frame.evaluate(() => {
    const base = { sex: 'M', ageYears: 13, ageMonths: 156, boneAgeYears: 12.5, currentHeightCm: 155, currentWeightKg: 44,
      motherHeightCm: 165, fatherHeightCm: 179, bp: { available: true, predictedAdultHeightCm: 179.2, errorBoundHalfWidthCm: 5.2 },
      rwt: { available: true, predictedAdultHeightCm: 177.8, errorBoundHalfWidthCm: 4.6 }, reinehr: { available: true, predictedAdultHeightCm: 176.5 },
      mphCm: 178.5, growthVelocityCmPerYear: 5.1 };
    const variants = [base, { ...base, currentHeightCm: 178, boneAgeYears: 10.5 }, { ...base, currentHeightCm: 190 }, { ...base, sex: 'F', ageYears: 14, ageMonths: 168, boneAgeYears: 15,
      postmenarcheal: true, menarcheAgeYears: 12, heightAtMenarcheCm: 145 }, { ...base, ageYears: 6, ageMonths: 72, boneAgeYears: 5 }];
    return variants.map(input => {
      const prediction = VildaGrowthCardC.computeFinalHeightPrediction(input), native = document.createElement('div');
      native.innerHTML = VildaGrowthCardC.render(input); const before = native.innerHTML, host = document.createElement('div');
      const view = VildaHomeGrowthViews.render({ tab: 'methods', native, panel: host, copy: node => node.cloneNode(true), data: { finalHeightPrediction: prediction, currentAgeMonths: input.ageMonths, boneAgeMonths: input.boneAgeYears * 12 } });
      const rows = Array.from(host.querySelectorAll('.vgcc-row'));
      const plotted = rows.filter(row => row.querySelector('.vhome-a2-range')).map(row => {
        const name = row.querySelector('.vgcc-nm').textContent.replace(/[–—−]/g, '-').toLowerCase();
        const method = prediction.methods.find(m => name.includes(m.label.replace(/[–—−]/g, '-').toLowerCase()));
        return { clamped: method.clamped, nativeSymmetric: !!row.querySelector('.vgcc-pm')?.textContent.includes('±'), hasBar: !!row.querySelector('.vhome-a2-error'), aria: row.querySelector('.vhome-a2-range').getAttribute('aria-label'),
          publication: method.publikacjaCm ?? method.cm, dot: parseFloat(row.querySelector('.vhome-a2-range-dot').getAttribute('cx')),
          barWidth: row.querySelector('.vhome-a2-error') ? parseFloat(row.querySelector('.vhome-a2-error').getAttribute('x2')) - parseFloat(row.querySelector('.vhome-a2-error').getAttribute('x1')) : null };
      });
      const selectors = ['.vgcc-hero', '.vgcc-nm', '.vgcc-val', '.vgcc-det-body', '.vgcc-hint'];
      const parity = selectors.every(selector => JSON.stringify(Array.from(native.querySelectorAll(selector), n => n.textContent)) === JSON.stringify(Array.from(host.querySelectorAll(selector), n => n.textContent)));
      view.dispose(); return { plotted, parity, unchanged: before === native.innerHTML, clamped: prediction.methods.some(m => m.clamped), excluded: prediction.methods.some(m => m.excluded) };
    });
  });
  expect(results.some(result => result.clamped)).toBe(true);
  expect(results.every(result => result.parity && result.unchanged)).toBe(true);
  expect(results.some(result => result.plotted.some(range => range.clamped && range.nativeSymmetric))).toBe(true);
  for (const result of results) for (const range of result.plotted) {
    expect(range.aria).toContain(range.publication.toLocaleString('pl-PL', { maximumFractionDigits: 1 }));
    expect(range.hasBar).toBe(range.nativeSymmetric);
    expect(range.dot).toBeGreaterThanOrEqual(0); expect(range.dot).toBeLessThanOrEqual(100);
    if (range.barWidth != null) { expect(range.barWidth).toBeGreaterThan(0); expect(range.barWidth).toBeLessThanOrEqual(100); }
  }
});

test('home A2: long native trajectory stays compact and every historical measurement keeps visible field labels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { frame } = await setup(page);
  const dialog = await show(frame);
  const rows = dialog.locator('.vhome-growth-history-row');
  await expect(rows).toHaveCount(4);
  async function expectLabeledMeasurements() {
    for (const row of await rows.all()) {
      for (const title of ['Wiek', 'Wzrost', 'Masa', 'Wiek kostny']) {
        await expect(row.locator('.vhome-growth-history-title').filter({ hasText: new RegExp('^' + title + '$') })).toBeVisible();
      }
      for (const [index, unit] of ['lata', 'miesiące', 'cm', 'kg', 'lata'].entries()) {
        const control = row.locator(`[data-growth-history-field="${index}"]`);
        await expect(control).toHaveAccessibleName(/\S/);
        const label = control.locator('..');
        await expect(label.locator('.vhome-growth-history-unit')).toHaveText(unit);
        await expect(label.locator('.vhome-growth-history-caption')).toBeVisible();
      }
    }
    await expect(dialog.locator('#vhomeGrowthRowsEmpty')).toBeHidden();
  }
  await expectLabeledMeasurements();
  const firstMeasurement = rows.first(), removeBox = await firstMeasurement.getByRole('button', { name: 'Usuń pomiar', exact: true }).boundingBox();
  const inputBoxes = await firstMeasurement.locator('input').evaluateAll(inputs => inputs.map(input => ({ top: input.getBoundingClientRect().top, width: input.getBoundingClientRect().width })));
  expect(Math.max(...inputBoxes.map(box => box.top)) - Math.min(...inputBoxes.map(box => box.top))).toBeLessThan(2);
  expect(removeBox.width).toBeLessThan(inputBoxes[2].width);
  await expect(dialog.locator('.vhome-growth-history')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const native = frame.locator('#advResults .adv-growth-result-block--trajectory');
  // This real native result contains phase/segment prose: the summary must not
  // grow in proportion to it, while the complete result remains available.
  expect(await native.locator('.vtap-seg').count()).toBeGreaterThan(0);
  const parts = await native.locator('.vtap-cards > .vtap-card:not(.vtap-hvc)').evaluateAll(cards => cards.map(card => {
    const value = card.querySelector('.big').cloneNode(true); value.querySelector('.d')?.remove();
    return { title: card.querySelector('.nm').textContent, value: value.textContent,
      raw: card.querySelector('.sub').textContent.split(' · SDS ')[0],
      delta: card.querySelector('.big .d')?.textContent ?? null, verdict: card.querySelector('.vdt')?.textContent ?? null };
  }));
  await dialog.getByRole('tab', { name: 'Analiza', exact: true }).click();
  const summaries = dialog.locator('.vhome-a2-metrics > .vhome-a2-metric-card');
  await expect(summaries).toHaveCount(3);
  await expect(summaries.locator('.vtap-seg')).toHaveCount(0);
  for (const [index, expected] of parts.entries()) {
    const card = summaries.nth(index);
    await expect(card.locator('.nm')).toHaveText(expected.title);
    await expect(card.locator('.big')).toHaveText(expected.value);
    await expect(card.locator('.sub')).toHaveText(expected.raw);
    if (expected.delta != null) await expect(card.locator('.vhome-a2-metric-delta')).toHaveText(expected.delta);
    if (expected.verdict != null) await expect(card.locator('.vdt')).toHaveText(expected.verdict);
    await expect(card).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  }
  await expect(dialog.locator('.vhome-a2-plot')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await dialog.locator('.adv-growth-result-block--trajectory').textContent()).toBe(await native.textContent());
  const plot = dialog.locator('.vhome-a2-plot'), stack = dialog.locator('.vhome-a2-metrics');
  await expect(dialog.locator('.vhome-a2-chart svg')).toBeVisible();
  const plotBox = await plot.boundingBox(), stackBox = await stack.boundingBox(), chartBox = await dialog.locator('.vhome-a2-chart svg').boundingBox();
  expect(plotBox.x + plotBox.width).toBeLessThan(stackBox.x);
  expect(Math.abs(plotBox.y - stackBox.y)).toBeLessThan(2);
  // Three summaries fit beside a single chart, rather than creating a tall
  // column of the full native phase narratives and a mostly empty plot panel.
  expect(stackBox.height).toBeLessThan(chartBox.height * 3);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await dialog.getByRole('tab', { name: 'Dane i pomiary', exact: true }).click();
    await expectLabeledMeasurements();
    for (const tab of ['Dane i pomiary', 'Analiza']) {
      await dialog.getByRole('tab', { name: tab, exact: true }).click();
      expect(await dialog.locator('.vhome-dialog-body').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    }
  }
});

test('home A2: shows the distinct earlier BMI warning beside the summary', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const payload = fictionalPatient({ weight: 52.5 });
  payload.advanced.data.measurements.find(row => row.ageMonths === 120).weight = 46;
  payload.advanced.data.measurements.find(row => row.ageMonths === 144).weight = 49.5;
  const { frame } = await setup(page, { payload });
  const dialog = await show(frame, 'analysis');
  const isBmi = frame.locator('.nm', { hasText: /^BMI$/ });
  const native = frame.locator('#advResults .vtap-card').filter({ has: isBmi });
  const summary = dialog.locator('.vhome-a2-metric-card').filter({ has: isBmi });
  const warning = native.locator('.vtap-seg').filter({ hasText: /najpoważniejszy odcinek: 9 lat → 10 lat/ });
  await expect(warning).toHaveCount(1);
  await expect(summary.locator('.vtap-seg')).toHaveCount(1);
  await expect(summary.locator('.vtap-seg')).toBeVisible();
  await expect(summary.locator('.vtap-seg')).toHaveText(await warning.textContent());
  expect(await dialog.locator('.vhome-dialog-body').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
});

// Component regressions use only the fictional vault created by setup. All
// application modules, SSI validators, collectors and persistence remain real.
async function anonymousGrowthBase(frame) {
  await frame.evaluate(() => clearAllData());
  await expect(frame.locator('#vhomeGrowthExpand')).toBeEnabled();
  // Establish the existing native precondition before the controlled seed.
  // This read-only setup proof is not retained or substituted for OPEN's scope.
  await frame.waitForFunction(() => VildaDataImportExport.getSaveReadiness().ready
    && !VildaDataImportExport.isMainSessionAutosavePaused()
    && VildaSaveStatusIndicator.getCurrentDecision().ready);
  expect(await frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
}

test('home growth regression: first anonymous native allocation retains the draft and a second visit invalidates it', async ({ page }) => {
  const { frame } = await setup(page); await anonymousGrowthBase(frame);
  const dialog = frame.getByRole('dialog', { name: 'Zaawansowane obliczenia wzrostowe', exact: true });
  // Keep original OPEN, the native producer and the first validation in one
  // task. No native queued writer can allocate the visit before this actor.
  const allocation = await frame.evaluate(() => {
    for (const [id, value] of Object.entries({ age: '13', height: '158', weight: '46' })) document.getElementById(id).value = value;
    const read = () => {
      const payload = VildaDataImportExport.captureCurrentUserDataReadOnly(); delete payload.timestampISO;
      const session = VildaPersistence.readMainSession(); if (session) delete session.timestampISO;
      return { payload, session, activity: VildaPubertyAssessmentState.getActivityRevision() };
    };
    const before = read(), nativeMother = document.getElementById('advMotherHeight').value;
    const opened = VildaHomeGrowth.open('data'), host = document.getElementById('vhomeGrowthDialog');
    const afterOpen = read();
    const visit = VildaVisitContext.capture(VildaDataImportExport.captureCurrentUserDataReadOnly(), { patientId: null });
    if (opened) document.getElementById('vhomeGrowthTab-data').click();
    return { opened, before, afterOpen, after: read(), nativeMother, visit,
      nativeVisit: VildaVisitContext.capture({ user: {} }, { patientId: null, readOnly: true }), open: !!host?.open };
  });
  expect(allocation.opened).toBe(true); expect(allocation.before.payload).not.toHaveProperty('visit');
  expect(allocation.afterOpen).toEqual(allocation.before);
  expect(allocation.visit).toMatchObject({ version: 1, patientId: null, origin: 'explicit' });
  expect(allocation.visit.visitId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(allocation.open).toBe(true); await expect(dialog).toBeVisible();
  expect(allocation.nativeVisit).toEqual(allocation.visit);
  expect(allocation.after.payload.visit).toEqual(allocation.visit);
  // Compare the complete snapshots from the one controlled actor. Ordinary
  // autosave may legitimately settle after this evaluate returns.
  const after = structuredClone(allocation.after);
  delete after.payload.visit; expect(after).toEqual(allocation.before);
  await field(dialog, 'advMotherHeight').fill('169');
  const replacement = await frame.evaluate(() => {
    const visit = VildaVisitContext.beginNew({ patientId: null });
    document.querySelector('#vhomeGrowthDialog .vhome-dialog-apply').click();
    return visit;
  });
  expect(replacement.visitId).not.toBe(allocation.visit.visitId);
  await expect(dialog).toBeHidden(); await expect(frame.locator('#advMotherHeight')).toHaveValue(allocation.nativeMother);
  expect(await frame.evaluate(() => VildaVisitContext.capture({ user: {} }, { patientId: null, readOnly: true }))).toEqual(replacement);
});

test('home growth regression: blank family and history cancel purely; immediate anonymous Apply persists the complete draft', async ({ page }) => {
  const { frame } = await setup(page); await anonymousGrowthBase(frame);
  page.once('dialog', confirmation => confirmation.accept());
  // Isolate the pure UI actor from unrelated queued native derivation/autosave.
  // Use the same complete snapshot projection as snapshot(frame), without
  // dropping clinical fields, calculation fingerprints, session or activity.
  const cancelled = await frame.evaluate(() => {
    const read = () => {
      const payload = VildaDataImportExport.captureCurrentUserDataReadOnly(); delete payload.timestampISO;
      const session = VildaPersistence.readMainSession(); if (session) delete session.timestampISO;
      return { payload, session, activity: VildaPubertyAssessmentState.getActivityRevision() };
    };
    const before = read();
    document.querySelector('[data-growth-open="data"]').click();
    const host = document.getElementById('vhomeGrowthDialog'), opened = !!host?.open;
    if (!opened) return { opened };
    const closedFolds = host.querySelectorAll('.vhome-growth-fold[open]').length;
    Array.from(host.querySelectorAll('.vhome-growth-fold > summary'))
      .find(node => node.textContent.includes('Warunki interpretacji')).click();
    const familyBeforeHistory = !!(host.querySelector('.vhome-growth-family')
      .compareDocumentPosition(host.querySelector('.vhome-growth-history')) & Node.DOCUMENT_POSITION_FOLLOWING);
    const afterOpen = read();
    const edit = (node, value) => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); };
    edit(host.querySelector('[data-growth-field="advMotherHeight"]'), '167');
    host.querySelector('[data-growth-add]').click();
    const row = host.querySelector('[data-growth-row^="new-"]');
    for (const [index, value] of [[0, '12'], [1, '0'], [2, '153'], [3, '40']]) edit(row.querySelector(`[data-growth-history-field="${index}"]`), value);
    const draft = { mother: host.querySelector('[data-growth-field="advMotherHeight"]').value,
      history: [0, 1, 2, 3].map(index => row.querySelector(`[data-growth-history-field="${index}"]`).value),
      applyEnabled: !host.querySelector('.vhome-dialog-apply').disabled };
    const duringDraft = read();
    host.querySelector('.vhome-dialog-cancel').click();
    return { opened, closedFolds, familyBeforeHistory, before, afterOpen, draft, duringDraft,
      openAfterCancel: host.open, afterCancel: read() };
  });
  expect(cancelled.opened).toBe(true); expect(cancelled.closedFolds).toBe(0); expect(cancelled.familyBeforeHistory).toBe(true);
  expect(cancelled.before.payload).not.toHaveProperty('visit'); expect(cancelled.before.payload.user.age).toBeNull();
  expect(cancelled.draft).toEqual({ mother: '167', history: ['12', '0', '153', '40'], applyEnabled: true });
  expect(cancelled.afterOpen).toEqual(cancelled.before);
  expect(cancelled.duringDraft).toEqual(cancelled.before);
  expect(cancelled.openAfterCancel).toBe(false); expect(cancelled.afterCancel).toEqual(cancelled.before);
  const measurements = { age: '13', height: '158', weight: '46' };
  const fast = await frame.evaluate(measurements => {
    // Notify the native shared-form writer exactly as a field edit does.
    // Keep these events, opening and Apply in one turn so a queued autosave
    // cannot allocate the anonymous visit before Apply is exercised.
    for (const [id, value] of Object.entries(measurements)) {
      const field = document.getElementById(id);
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // The controlled seed uses the same native constraint updater as the UI.
    // It only projects the current main age onto native historical inputs.
    updateAdvAgeMax();
    const opened = VildaHomeGrowth.open('data'), host = document.getElementById('vhomeGrowthDialog');
    const edit = (node, value) => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); };
    if (!opened) return { opened };
    edit(host.querySelector('[data-growth-field="advMotherHeight"]'), '167');
    host.querySelector('[data-growth-add]').click();
    const row = host.querySelector('[data-growth-row^="new-"]');
    for (const [index, value] of [[0, '12'], [1, '0'], [2, '153'], [3, '40']]) edit(row.querySelector(`[data-growth-history-field="${index}"]`), value);
    const copiedHistoryAgeMax = row.querySelector('[data-growth-history-field="0"]').max;
    const invalidBeforeApply = Array.from(host.querySelectorAll('input:enabled, select:enabled'))
      .filter(control => !control.checkValidity()).map(control => ({ field: control.getAttribute('aria-label'),
        value: control.value, min: control.min, max: control.max, step: control.step, message: control.validationMessage }));
    const beforeApplyVisit = VildaVisitContext.capture({ user: {} }, { patientId: null, readOnly: true });
    let notifications = 0, firstNotificationVisit = null;
    const observe = event => {
      if (!document.getElementById('advancedGrowthSection').contains(event.target)) return;
      notifications += 1;
      if (notifications === 1) firstNotificationVisit = VildaVisitContext.capture({ user: {} }, { patientId: null, readOnly: true });
    };
    window.addEventListener('input', observe, true); window.addEventListener('change', observe, true);
    try { host.querySelector('.vhome-dialog-apply').click(); }
    finally { window.removeEventListener('input', observe, true); window.removeEventListener('change', observe, true); }
    return { opened, open: host.open, copiedHistoryAgeMax, invalidBeforeApply, beforeApplyVisit, firstNotificationVisit, notifications,
      visit: VildaVisitContext.capture({ user: {} }, { patientId: null, readOnly: true }) };
  }, measurements);
  expect(fast.copiedHistoryAgeMax).toBe('13'); expect(fast.invalidBeforeApply).toEqual([]);
  expect(fast).toMatchObject({ opened: true, open: false, beforeApplyVisit: null });
  expect(fast.notifications).toBeGreaterThan(0); expect(fast.firstNotificationVisit).toEqual(fast.visit);
  expect(fast.visit).toMatchObject({ patientId: null, origin: 'explicit' });
  await expect(frame.locator('#advMotherHeight')).toHaveValue('167');
  await expect.poll(() => frame.evaluate(() => {
    const session = VildaPersistence.readMainSession();
    const shared = VildaPersistence.readShared();
    return { shared: { age: shared?.age, height: shared?.height, weight: shared?.weight },
      mother: session?.advanced?.motherHeight, visit: session?.visit,
      history: session?.advanced?.data?.measurements?.some(row => row.ageMonths === 144 && row.height === 153 && row.weight === 40) };
  })).toEqual({ shared: measurements, mother: 167, visit: fast.visit, history: true });
  await page.reload({ waitUntil: 'load' }); await expect(frame.locator('#advMotherHeight')).toHaveValue('167');
  // Shared controls can be restored before the native main-session producer.
  const startup = await frame.evaluate(() => VildaDataImportExport.whenInitialMainSessionRestoreSettled());
  expect(startup.ready).toBe(true);
  const restored = await frame.evaluate(() => VildaDataImportExport.captureCurrentUserDataReadOnly());
  expect(restored.visit).toEqual(fast.visit);
  expect(restored.user).toMatchObject({ age: 13, height: 158, weight: 46 });
  expect(restored.advanced.data.measurements).toContainEqual(expect.objectContaining({ ageMonths: 144, height: 153, weight: 40 }));
});

test('home growth regression: clinical changes and native restore, choice or account boundaries reject the original draft', async ({ page }) => {
  const { frame } = await setup(page);
  for (const boundary of ['clinical-diff', 'vilda:state-restored', 'vilda:load-choice-applied', 'account-session-loss']) {
    await test.step(boundary, async () => {
      await anonymousGrowthBase(frame);
      const result = await frame.evaluate(reason => {
        for (const [id, value] of Object.entries({ age: '13', height: '158', weight: '46' })) document.getElementById(id).value = value;
        const nativeMother = document.getElementById('advMotherHeight').value;
        const opened = VildaHomeGrowth.open('data'), host = document.getElementById('vhomeGrowthDialog');
        const beforeVisit = VildaVisitContext.capture({ user: {} }, { patientId: null, readOnly: true });
        if (!opened) return { opened };
        const draftMother = host.querySelector('[data-growth-field="advMotherHeight"]');
        draftMother.value = '169'; draftMother.dispatchEvent(new Event('input', { bubbles: true }));
        if (reason === 'clinical-diff') {
          // Deliberately omit an event. Full clinical data must still be checked,
          // including fields outside the short owner/basics comparison.
          document.getElementById('advFatherHeight').value = '181';
          VildaVisitContext.capture(VildaDataImportExport.captureCurrentUserDataReadOnly(), { patientId: null });
          document.getElementById('vhomeGrowthTab-data').click();
        } else if (reason === 'account-session-loss') VildaVault.lock();
        else document.dispatchEvent(new CustomEvent(reason, { detail: { source: 'fictional-growth-component-boundary' } }));
        return { opened, beforeVisit, nativeMother, open: host.open, mother: document.getElementById('advMotherHeight').value,
          father: document.getElementById('advFatherHeight').value, unlocked: VildaVault.isUnlocked() };
      }, boundary);
      expect(result).toMatchObject({ opened: true, beforeVisit: null, open: false });
      const dialog = frame.getByRole('dialog', { name: 'Zaawansowane obliczenia wzrostowe', exact: true }); await expect(dialog).toBeHidden();
      expect(result.mother).toBe(boundary === 'account-session-loss' ? '' : result.nativeMother);
      if (boundary === 'clinical-diff') expect(result.father).toBe('181');
      if (boundary === 'account-session-loss') expect(result.unlocked).toBe(false);
    });
  }
});
