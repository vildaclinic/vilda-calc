import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';
import { installMemoryVault, memory, OTHER_PATIENT_ID, saveVisible, selectPatient } from '../support/klirens-patient-record.mjs';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { applySession, base, card, choose, details, expectBlocked, expectResult, openCalculator, restore } from '../support/klirens-ua-browser.mjs';

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector);
      if (!node?.checkVisibility()) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('#uaInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      controls: [...document.querySelectorAll('#uaInputCard input,#uaInputCard select,#uaInputCard button')].filter(node => node.checkVisibility()).map(node => ({ id: node.id || node.textContent.trim(), font: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })),
      texts: [...document.querySelectorAll('#clcrResultReport .clcr-result-value,#clcrResultReport .ua-reference-value')].map(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const text = range.getBoundingClientRect(), container = node.getBoundingClientRect();
        return { text: node.textContent.trim(), left: container.left, right: container.right, textLeft: text.left, textRight: text.right };
      }),
    };
  });
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(result.inputCard).not.toBeNull();
  expect(Math.abs(result.form.width - result.inputCard.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.clear.width - result.inputCard.width)).toBeLessThanOrEqual(1);
  expect(result.clear.top - result.inputCard.bottom).toBeGreaterThanOrEqual(15);
  if (width < 980) expect(result.report.top - result.clear.bottom).toBeGreaterThanOrEqual(20);
  else {
    expect(Math.abs(result.report.top - result.activePanel.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.report.width - result.activePanel.width)).toBeLessThanOrEqual(1);
  }
  for (const control of result.controls) {
    expect(control.font, control.id).toBeGreaterThanOrEqual(16);
    expect(control.height, control.id).toBeGreaterThanOrEqual(48);
    expect(control.left, control.id).toBeGreaterThanOrEqual(0);
    expect(control.right, control.id).toBeLessThanOrEqual(width + 1);
  }
  for (const text of result.texts) {
    expect(text.textLeft, text.text).toBeGreaterThanOrEqual(text.left - 0.5);
    expect(text.textRight, text.text).toBeLessThanOrEqual(text.right + 0.5);
  }
  return result;
}

function sameWidths(before, after) {
  for (const key of ['form', 'inputCard', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
}

for (const width of [1440, 390, 320]) {
  test(`UA DZM: dwa pola, jeden wynik i stała szerokość przy ${width}px`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await choose(page, 'UA_mgkg');
    await expect(page.locator('#UA_inputMode')).toHaveValue('concentration');
    await expect(page.locator('[data-ua-mode="concentration"]')).toHaveAttribute('aria-pressed', 'true');
    await restore(page, { UA_concentration: '', UA_volume: '' });
    await expectBlocked(page);
    expect(await page.locator('#uaInputCard input:visible').count()).toBe(2);
    expect(await page.locator('#uaInputCard select:visible').count()).toBe(2);
    await expect(page.locator('#uaInputCard')).toContainText('30 kg');
    for (const id of ['weight', 'UA_collectionHours', 'collectionStartAt', 'collectionEndAt', 'collectionNoMissedVoids', 'U_UA', 'V24']) await expect(page.locator('#' + id)).toBeHidden();
    const unique = await page.evaluate(() => window.VildaClcrUa.FIELD_IDS.every(id => document.querySelectorAll('#' + id).length === 1));
    expect(unique).toBe(true);
    const initial = await geometry(page, width);
    await page.locator('#UA_concentration').fill('30');
    await page.locator('#UA_volume').fill('1200');
    const abnormal = await expectResult(page);
    expect(abnormal.dailyMg).toBe(360);
    expect(abnormal.reference.upper).toBe(9.3);
    await expect(card(page)).toContainText('360 mg/24 h');
    await expect(card(page)).toContainText('Norma dla wieku');
    const colors = await card(page).evaluate(node => ({ value: getComputedStyle(node.querySelector('.clcr-result-value')).color, reference: getComputedStyle(node.querySelector('.ua-reference-value')).color, referenceUnit: getComputedStyle(node.querySelector('.ua-reference-unit')).color, equivalent: getComputedStyle(node.querySelector('.ua-equivalent strong')).color }));
    expect(colors.value).not.toBe(colors.reference);
    expect(colors.referenceUnit).toBe(colors.reference);
    expect(colors.equivalent).not.toBe(colors.value);
    const modeColors = await page.locator('#uaInputCard').evaluate(node => ({ active: getComputedStyle(node.querySelector('[data-ua-mode="concentration"]')).backgroundColor, inactive: getComputedStyle(node.querySelector('[data-ua-mode="reported"]')).backgroundColor, text: getComputedStyle(node.querySelector('[data-ua-mode="concentration"]')).color }));
    expect(modeColors.active).not.toBe(modeColors.inactive);
    expect(modeColors.text).toBe('rgb(255, 255, 255)');
    sameWidths(initial, await geometry(page, width));
    await kliknij(page.locator('[data-ua-mode="reported"]'));
    await page.locator('#UA_reportedValue').fill('279');
    await expectResult(page, { raw: 9.3, status: 'boundary' });
    sameWidths(initial, await geometry(page, width));
    await kliknij(details(page).locator(':scope > summary'));
    await expect(details(page)).toContainText('EAU');
    await expect(details(page)).toContainText('Mayo');
    const screenshot = testInfo.outputPath(`ua-${width}-workspace.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: screenshot });
    await testInfo.attach(`ua-${width}-workspace`, { path: screenshot, contentType: 'image/png' });
    for (const value of ['0.0004', '9.299999999999']) {
      await page.locator('#UA_reportedUnit').selectOption('mg/kg/24h');
      await page.locator('#UA_reportedValue').fill(value);
      await expectResult(page, { raw: Number(value), status: 'within', tone: 'normal' });
      sameWidths(initial, await geometry(page, width));
    }
    await kliknij(page.locator('[data-ua-mode="concentration"]'));
    await expectResult(page);
    await kliknij(page.locator('#uaInputCard button[aria-controls="uaDurationEditor"]'));
    await page.locator('#UA_collectionHours').fill('12');
    await expectResult(page, { raw: 24, status: 'unassessed', tone: 'neutral', reference: false });
    sameWidths(initial, await geometry(page, width));
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expectBlocked(page);
    // Global clear retains its existing navigation policy. Selecting UA again
    // must expose a fresh empty calculation, never an earlier unit or value.
    await choose(page, 'UA_mgkg');
    await expect(page.locator('#UA_inputMode')).toHaveValue('concentration');
    await expect(page.locator('#UA_collectionHours')).toHaveValue('24');
    await expect(page.locator('#UA_concentration')).toHaveValue('');
    await expect(page.locator('#UA_volume')).toHaveValue('');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('UA DZM: cztery jednostki stężenia, litry oraz gotowe wydalanie dają tę samą ilość', async ({ page }) => {
  await openCalculator(page);
  for (const [UA_concentration, UA_concentrationUnit] of [['16.811', 'mg/dL'], ['168.11', 'mg/L'], ['1', 'mmol/L'], ['1000', 'umol/L']]) {
    await restore(page, { weight: '10', UA_concentration, UA_concentrationUnit, UA_volume: '1', UA_volumeUnit: 'L' });
    const model = await expectResult(page, { raw: 16.811 });
    expect(model.dailyMg).toBe(168.11);
    expect(model.input.concentrationUnit).toBe(UA_concentrationUnit);
    await page.locator('#UA_volumeUnit').selectOption('mL');
    await page.locator('#UA_volume').fill('1000');
    await expectResult(page, { raw: 16.811 });
  }
  for (const [UA_reportedValue, UA_reportedUnit] of [['168.11', 'mg/24h'], ['1', 'mmol/24h'], ['16.811', 'mg/kg/24h']]) {
    await restore(page, { weight: '10', UA_inputMode: 'reported', UA_reportedValue, UA_reportedUnit, UA_collectionHours: '12', UA_volume: '' });
    const model = await expectResult(page, { raw: 16.811 });
    expect(model.dailyMg).toBe(168.11);
    await expect(page.locator('#UA_volume')).toBeHidden();
    await expect(page.locator('#UA_collectionHours')).toBeHidden();
  }
});

test('UA DZM: dokładne pediatryczne progi, wiek ciągły i małe liczby nie zmieniają strony normy', async ({ page }) => {
  await openCalculator(page);
  const cases = [
    ['0', '6', '12.9999', 13, 'within'], ['0', '6', '13', 13, 'boundary'],
    ['1', '', '11', 11, 'boundary'], ['5', '0', '10.9999', 11, 'within'],
    ['5', '6', '9.3', 9.3, 'boundary'], ['17', '11', '9.299999999999', 9.3, 'within'],
    ['10', '', '0.0004', 9.3, 'within'],
  ];
  for (const [age, ageMonths, UA_reportedValue, upper, status] of cases) {
    await restore(page, { age, ageMonths, weight: '', UA_inputMode: 'reported', UA_reportedValue, UA_reportedUnit: 'mg/kg/24h' });
    const model = await expectResult(page, { raw: Number(UA_reportedValue), status, tone: status === 'within' ? 'normal' : 'warning' });
    expect(model.reference.upper).toBe(upper);
    expect(model.reference.upperInclusive).toBe(false);
    expect(Number(model.display.text.replace(',', '.'))).toBe(Number(UA_reportedValue));
    if (Number(UA_reportedValue) < upper) expect(Number(model.display.text.replace(',', '.'))).toBeLessThan(upper);
  }
  await restore(page, { UA_concentration: '0.001' });
  const tiny = await expectResult(page, { raw: 0.0004, status: 'within', tone: 'normal' });
  expect(Number(tiny.display.text.replace(',', '.'))).toBeGreaterThan(0);
});

test('UA DZM: zakresy dorosłych mają włączone granice i jednostkę zgodną z wynikiem', async ({ page }) => {
  await openCalculator(page);
  for (const [sex, weight, total, raw, lower, upper, status] of [
    ['M', '100', '200', 2, 2, 10, 'within'], ['M', '100', '1000', 10, 2, 10, 'within'],
    ['M', '100', '1000.01', 10.0001, 2, 10, 'high'],
    ['F', '50', '250', 5, 5, 15, 'within'], ['F', '50', '750', 15, 5, 15, 'within'],
    ['F', '50', '249.995', 4.9999, 5, 15, 'low'],
  ]) {
    await restore(page, { age: '40', sex, weight, UA_inputMode: 'reported', UA_reportedValue: total });
    const model = await expectResult(page, { raw, status, tone: status === 'within' ? 'normal' : 'warning' });
    expect(model.reference).toMatchObject({ kind: 'interval', lower, upper, lowerInclusive: true, upperInclusive: true, unit: model.unit });
    expect(model.dailyMg).toBe(Number(total));
  }
  await restore(page, { age: '18', sex: 'M', weight: '', UA_inputMode: 'reported', UA_reportedValue: '200' });
  const fallback = await expectResult(page, { raw: 200, unit: 'mg/24 h', status: 'within', tone: 'normal' });
  expect(fallback.reference).toMatchObject({ lower: 200, upper: 1000, unit: 'mg/24 h' });
  await expect(card(page).locator('.ua-equivalent')).toHaveCount(0);
  await expect(page.locator('#weight')).toBeHidden();
  await restore(page, { age: '40', sex: 'F', weight: '', UA_concentration: '25', UA_volume: '1000' });
  await expectResult(page, { raw: 250, unit: 'mg/24 h', status: 'within', tone: 'normal' });
});

test('UA DZM: brak kontekstu nie ukrywa liczby, a zero i inny czas nie dają fałszywej normy', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [{ age: '', sex: '' }, { age: '5', ageMonths: '' }, { age: '40', sex: '' }, { age: '40', weight: '', UA_inputMode: 'reported', UA_reportedValue: '12', UA_reportedUnit: 'mg/kg/24h' }]) {
    await restore(page, fields);
    const model = await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
    expect(model.outOfRange).toBeNull();
    await expect(card(page).locator('.ua-range-visual')).toHaveCount(0);
  }
  await restore(page, { UA_collectionHours: '12' });
  const partial = await expectResult(page, { raw: 24, status: 'unassessed', tone: 'neutral', reference: false });
  expect(partial.dailyMg).toBe(720);
  expect(partial.outOfRange).toBeNull();
  await restore(page, { UA_concentration: '0' });
  const zero = await expectResult(page, { raw: 0, status: 'zero', tone: 'neutral', reference: false });
  expect(zero.outOfRange).toBeNull();
  await expect(card(page)).toContainText(/sprawdź|zweryfikuj/i);
});

test('UA DZM: puste i niepoprawne dane usuwają poprzedni wynik z możliwości zapisu', async ({ page }) => {
  await openCalculator(page);
  await restore(page);
  for (const invalid of ['', ' ', '-1', '0x1e', '0b10', 'NaN', 'Infinity', '1e309', '30x', '1,2.3']) {
    await page.locator('#UA_concentration').fill('30');
    await expectResult(page);
    await page.locator('#UA_concentration').fill(invalid);
    await expectBlocked(page);
    await expect(page.locator('#UA_concentration')).toHaveValue(invalid);
  }
  for (const fields of [{ weight: '-30' }, { UA_volume: '-1200' }, { UA_volume: '0' }, { UA_collectionHours: '-24' }, { UA_collectionHours: '0' }, { UA_inputMode: 'reported', UA_reportedValue: '-12', UA_reportedUnit: 'mg/kg/24h' }]) {
    await restore(page, fields);
    await expectBlocked(page);
  }
});

test('UA DZM: znana niepełna zbiórka pozostaje przeciwwskazaniem, jednostki UA nie zmieniają innych DZM', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { collectionNoMissedVoids: false, ui_collectionNoMissedVoids_answer: 'no' });
  await expectBlocked(page);
  await expect(page.locator('#collectionNoMissedVoids')).toBeHidden();
  await expect(page.locator('#uaInputError')).toBeVisible();
  await choose(page, 'Ca_mgkg');
  await choose(page, 'UA_mgkg');
  await expectBlocked(page);
  // Both audited DZM forms keep protocol facts in their session value vault;
  // neither needs to mount the former questionnaire to preserve a known error.
  expect(await page.evaluate(() => window.VildaClcrUa.readInputFromDocument(document).knownFacts.ui_collectionNoMissedVoids_answer)).toBe('no');
  expect(await page.evaluate(() => window.evaluateClcrUa().errorCode)).toBe('collection-conflict');
  const legacy = { ...base, U_Ca: '10', U_UA: '30', V24: '1200', collectionStartAt: '2026-10-20T08:00', collectionEndAt: '2026-10-21T08:00', UA_concentration: '1', UA_concentrationUnit: 'mmol/L', UA_volume: '1.2', UA_volumeUnit: 'L' };
  for (const id of ['collectionStartVoidDiscarded', 'collectionFinalVoidIncluded', 'collectionNoMissedVoids', 'collectionNoSpillage', 'collectionNoExtraVoids', 'collectionStorageFollowed']) { legacy[id] = true; legacy[`ui_${id}_answer`] = 'yes'; }
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'Ca_mgkg', context: { durationMinutes: 1440 }, inputs: { ...legacy, formulaPicker: 'Ca_mgkg' } }, 'Ca_mgkg');
  const calcium = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="Ca_mgkg"]');
  await expect(calcium).toBeVisible();
  const original = await calcium.innerText();
  await choose(page, 'UA_mgkg');
  await expectResult(page, { raw: 6.7244, status: 'within', tone: 'normal' });
  await expect(page.locator('#V24')).toHaveValue('1200');
  await expect(page.locator('#U_UA')).toHaveValue('30');
  await choose(page, 'Ca_mgkg');
  await expect(page.locator('#uaInputCard')).toHaveCount(0);
  expect(await calcium.innerText()).toBe(original);
  await expect(page.locator('#V24')).toHaveValue('1200');
});

test('UA DZM: reset i odtworzenie innego pacjenta nie pożyczają poprzednich danych', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  await restore(page);
  await expectResult(page, { guest: false });
  await selectPatient(page, OTHER_PATIENT_ID);
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'UA_mgkg', inputs: { currentVersion: 'pro', formulaPicker: 'UA_mgkg', age: '15', weight: '50', sex: 'M' } });
  await expect(page.locator('#UA_concentration')).toHaveValue('');
  await expect(page.locator('#UA_volume')).toHaveValue('');
  await expectBlocked(page);
  await restore(page);
  await expectResult(page, { guest: false });
  await kliknij(page.locator('#clearBtn'));
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await expectBlocked(page);
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'UA_mgkg', preservedInputs: { ...base, UA_inputMode: 'reported', UA_reportedValue: '0.0004', UA_reportedUnit: 'mg/kg/24h' } });
  await expectResult(page, { raw: 0.0004, status: 'within', tone: 'normal', guest: false });
});

test('UA DZM: własna zbiórka nie dziedziczy uśpionego panelu ani arbitralnej granicy masy', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { weight: '350' });
  const largeWeight = await expectResult(page, { raw: 1.0285714285714285, status: 'within', tone: 'normal' });
  expect(largeWeight.dailyMg).toBe(360);
  const dormant = { U_UA: '100', V24: '2400', collectionStartAt: '2026-10-20T08:00', collectionEndAt: '2026-10-21T09:00' };
  for (const id of ['collectionStartVoidDiscarded', 'collectionFinalVoidIncluded', 'collectionNoMissedVoids', 'collectionNoSpillage', 'collectionNoExtraVoids', 'collectionStorageFollowed']) { dormant[id] = true; dormant[`ui_${id}_answer`] = 'yes'; }
  await restore(page, dormant);
  const own = await expectResult(page);
  expect(own.dailyMg).toBe(360);
  expect(Number(own.input.hours)).toBe(24);
  await kliknij(details(page).locator(':scope > summary'));
  await expect(details(page)).not.toContainText(/2[\s\u00a0]?304|13[,.]705|25(?:[,.]0)?\s*(?:h|godz)/i);
  await expect(page.locator('#U_UA')).toHaveValue('100');
  await expect(page.locator('#V24')).toHaveValue('2400');
  await expect(page.locator('#collectionEndAt')).toHaveValue('2026-10-21T09:00');
});

test('UA DZM: zapis, pełna historia, edycja i usunięcie zachowują dokładność, normę i wybrany pomiar', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  await restore(page, { UA_concentration: '3.0865' });
  const original = await expectResult(page, { raw: 1.2346, status: 'within', tone: 'normal', guest: false });
  const [first] = await saveVisible(page, '2026-10-24');
  expect(first.labResult).toMatchObject({ valueNum: original.rawValue, value: original.display.text, unit: original.unit, norm: `${original.referenceText} ${original.unit}`, testKey: 'clcr-ua-dzm' });
  await restore(page, { UA_inputMode: 'reported', UA_reportedValue: '9.3', UA_reportedUnit: 'mg/kg/24h' });
  const boundary = await expectResult(page, { raw: 9.3, status: 'boundary', guest: false });
  const [sibling] = await saveVisible(page, '2026-10-25');
  await page.evaluate(notes => { window.__uaSyntheticNotes = notes; }, [first, sibling]);
  const history = await readVisibleSavedHistory(page, '__uaSyntheticNotes');
  expect(history.visible).toBe(true);
  expect(history.ids).toEqual(history.originalIds);
  expect(history.points.map(point => point.valueNum)).toEqual([original.rawValue, boundary.rawValue]);
  expect(history.norms).toEqual(history.originalNorms);
  const frozen = await page.evaluate(notes => {
    const engine = window.VildaClcrUa;
    window.VildaClcrUa = { evaluate: () => { throw new Error('Historia nie może oceniać nową normą'); } };
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; }
    finally { window.VildaClcrUa = engine; }
  }, [first, sibling]);
  expect(frozen.map(point => point.uaAssessment.status)).toEqual(['within', 'boundary']);
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), first);
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editDialog')).toBeVisible();
  await expect(page.locator('#editField-UA_concentration')).toHaveValue('3.0865');
  await expect(page.locator('#editField-UA_collectionHours')).toHaveValue('24');
  await page.locator('#editField-UA_concentration').fill('-1');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editError')).toBeVisible();
  expect((await memory(page)).updates).toHaveLength(0);
  await page.locator('#editField-UA_concentration').fill('0.001');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).not.toBeVisible();
  let stored = await memory(page);
  const edited = stored.notes.find(note => note.id === first.id);
  expect(edited.labResult).toMatchObject({ valueNum: 0.0004, value: '0,0004', unit: 'mg/kg/24 h' });
  expect(stored.notes.find(note => note.id === sibling.id)).toEqual(sibling);
  const projection = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], edited);
  expect(projection).toMatchObject({ valueNum: 0.0004, outOfRange: false, uaAssessment: { status: 'within', rawValue: 0.0004 } });
  await page.locator('#deleteMeasurement').click();
  await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).not.toBeVisible();
  stored = await memory(page);
  expect(stored.notes).toEqual([sibling]);
  expect(stored.deletes).toHaveLength(1);
  expect(stored.originalsLocked).toBe(true);
});

test('UA DZM: historia rozdziela jednostki, a stary zapis pozostaje bez nowej oceny do jawnej edycji', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  await restore(page, { age: '40', sex: 'M', weight: '', UA_inputMode: 'reported', UA_reportedValue: '360' });
  await expectResult(page, { raw: 360, unit: 'mg/24 h', status: 'within', tone: 'normal', guest: false });
  const [daily] = await saveVisible(page);
  await restore(page);
  await expectResult(page, { guest: false });
  const [perKg] = await saveVisible(page);
  const result = await page.evaluate(({ daily, perKg }) => {
    const calc = window.ClcrSavedCalculation;
    const saved = calc.readSaved(perKg);
    const old = JSON.parse(JSON.stringify(perKg)); old.id += '-legacy';
    const snapshot = saved.snapshot;
    delete snapshot.assessment.uaSnapshot;
    old.body = 'Kalkulator klirensu · clcr:UA_mgkg\n' + calc.serializeSnapshot(snapshot, old);
    window.__clcrRecordFixture.seed([old]);
    const projection = window.ClcrSavedResults.projectPatientNotes([daily, perKg, old]);
    return { projection, old, saved: calc.readSaved(old) };
  }, { daily, perKg });
  expect(result.saved).toMatchObject({ valid: true, assessment: 'unassessed', tone: 'neutral', outOfRange: null });
  const legacyPoint = result.projection.measurements.find(point => point.noteId === result.old.id);
  expect(legacyPoint).toMatchObject({ outOfRange: null, norm: '' });
  const units = result.projection.series.map(series => series.unit);
  expect(units).toContain('mg/24 h');
  expect(units).toContain('mg/kg/24 h');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), result.old);
  await page.locator('#editMeasurement').click();
  await page.locator('#editField-UA_concentration').fill('20');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).not.toBeVisible();
  const edited = (await memory(page)).notes.find(note => note.id === result.old.id);
  const changed = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], edited);
  expect(changed).toMatchObject({ valueNum: 8, outOfRange: false, uaAssessment: { status: 'within' } });
});

test('UA DZM: schowek i Word zawierają ten sam precyzyjny wynik, jednostkę, normę i komentarz', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { UA_inputMode: 'reported', UA_reportedValue: '9.299999999999', UA_reportedUnit: 'mg/kg/24h' });
  const model = await expectResult(page, { raw: 9.299999999999, status: 'within', tone: 'normal' });
  await page.evaluate(() => {
    window.__uaClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__uaClipboard = value; } } });
    window.alert = () => {};
  });
  await kliknij(page.locator('#askAI'));
  await expect.poll(() => page.evaluate(() => window.__uaClipboard)).toContain(model.display.text);
  const copied = await page.evaluate(() => window.__uaClipboard);
  for (const text of [model.display.text, model.unit, model.referenceText, model.interpretation]) expect(copied).toContain(text);
  const downloadPromise = page.waitForEvent('download');
  await kliknij(page.locator('#downloadDOCX'));
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.doc$/);
  const exported = await fs.readFile(await download.path(), 'utf8');
  const exportedText = await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').body.textContent, exported);
  for (const text of [model.display.text, model.unit, model.referenceText, model.interpretation]) expect(exportedText).toContain(text);
});

test('UA DZM: szeroki panel zapisuje własne dane kanoniczne zamiast uśpionego formularza UA', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  await restore(page, { weight: '70', UA_inputMode: 'reported', UA_reportedValue: '99', UA_reportedUnit: 'mg/kg/24h', UA_concentration: '1', UA_concentrationUnit: 'mmol/L', UA_volume: '2', UA_volumeUnit: 'L', UA_collectionHours: '12' });
  await expectResult(page, { raw: 99, guest: false });
  await page.evaluate(() => {
    window.__CLCR_TEST_LEGACY_BROAD = true;
    document.getElementById('formulaPicker').value = '';
    window.applyVersion('pro');
    for (const [id, value] of Object.entries({ weight: '30', U_UA: '30', V24: '1200', collectionStartAt: '2026-10-20T08:00', collectionEndAt: '2026-10-21T08:00' })) document.getElementById(id).value = value;
    for (const id of window.VildaClcrUa.COLLECTION_FIELDS) {
      document.getElementById(id).checked = true;
      const answer = document.getElementById('ui_' + id + '_answer'); if (answer) answer.value = 'yes';
    }
    window.clcrUpdate(); window.ClcrVisitSave._refresh();
  });
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.legacyBroad === true);
  const broad = page.locator('#elecInfo .clcr-result-card[data-clcr-series="UA_mgkg"]');
  await expect(broad).toBeVisible();
  const model = await broad.evaluate(node => JSON.parse(node.dataset.clcrUaSnapshot));
  expect(model).toMatchObject({ valid: true, rawValue: 12, dailyMg: 360, status: 'high', input: { mode: 'concentration', concentration: '30', concentrationUnit: 'mg/dL', volume: '1200', volumeUnit: 'mL', hours: '24' } });
  const notes = await saveVisible(page);
  const note = notes.find(item => item.labResult.testKey === 'clcr-ua-dzm');
  expect(note).toBeTruthy();
  expect(note.labResult).toMatchObject({ valueNum: 12, value: model.display.text, unit: 'mg/kg/24 h', norm: `${model.referenceText} ${model.unit}` });
  const frozen = await page.evaluate(note => window.ClcrSavedCalculation.readSaved(note), note);
  expect(frozen.valid).toBe(true);
  expect(frozen.snapshot.values).toMatchObject({ weight: '30', UA_inputMode: 'concentration', UA_concentration: '30', UA_concentrationUnit: 'mg/dL', UA_volume: '1200', UA_volumeUnit: 'mL', UA_collectionHours: '24' });
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), note);
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editField-UA_concentration')).toHaveValue('30');
  await expect(page.locator('#editField-weight')).toHaveValue('30');
  await page.locator('#editField-UA_concentration').fill('25');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).not.toBeVisible();
  expect((await memory(page)).notes.find(item => item.id === note.id).labResult.valueNum).toBe(10);
  expect((await memory(page)).originalsLocked).toBe(true);
});

for (const timezoneId of ['Europe/Warsaw', 'UTC', 'America/New_York']) {
  test.describe(`UA DZM: ${timezoneId}`, () => {
    test.use({ timezoneId });
    test('jawne 24 godziny mają identyczną wartość mimo dat zmiany czasu', async ({ page }) => {
      await openCalculator(page);
      await restore(page, { collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' });
      const model = await expectResult(page);
      expect(model.dailyMg).toBe(360);
      expect(Number(model.input.hours)).toBe(24);
      await page.locator('#uaInputCard button[aria-controls="uaDurationEditor"]').click();
      await page.locator('#UA_collectionHours').fill('12');
      const shortened = await expectResult(page, { raw: 24, status: 'unassessed', tone: 'neutral', reference: false });
      expect(shortened.dailyMg).toBe(720);
      expect(Number(shortened.input.hours)).toBe(12);
    });
  });
}
