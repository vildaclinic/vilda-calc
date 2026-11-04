import { showClcrResults, clcrPoints } from '../support/badania-klirens.mjs';
import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, prepareBrowser, saveVisible } from '../support/klirens-patient-record.mjs';

// Fictional values only. Clinical producers, readers, editors and sanitizers are
// production code; the optional memory fixture replaces encrypted patient I/O.
const FORMULA = 'Ca_Cr';
const PROFILE = 'ARUP_CACR_DZM_2026_11';
const card = (page, formula = FORMULA) => page.locator(`#clcrResultReport .clcr-result-card[data-clcr-series="${formula}"]`);
const inputCard = page => page.locator('#cacrDzmInputCard');
const details = page => page.locator('#clcrResultReport .clcr-result-details[data-clcr-formula="Ca_Cr"]');
const mode = (page, direct = false) => inputCard(page).getByRole('button', { name: direct ? 'Gotowy wynik Ca/Cr' : 'Oblicz ze stężeń', exact: true });
const parsed = text => Number(String(text).replace(/\s|≈/g, '').replace(',', '.'));
const BASE = Object.freeze({
  currentVersion: 'advanced', formulaPicker: FORMULA,
  age: '40', ageMonths: '', ageDays: '', sex: 'M', weight: '', height: '',
  CACR_DZM_inputMode: 'concentration', CACR_DZM_calcium: '5', CACR_DZM_calciumUnit: 'mmol/L',
  CACR_DZM_creatinine: '100', CACR_DZM_creatinineUnit: 'mg/dL', CACR_DZM_reportedValue: '', CACR_DZM_reportedUnit: 'mg/mg',
  CACR_DZM_sameSpecimen: '', CACR_DZM_collectionProblem: false,
  CACR_DZM_collectionHours: '', CACR_DZM_durationKnown: false, CACR_DZM_currentPreterm: '',
  U_Ca: '', Ucr: '', V24: '', collectionStartAt: '', collectionEndAt: '', Cl24DurationHours: '',
  Ca_spot: '', Ca_spot_unit: 'mg/dl', Ucr_spot: '', Ucr_spot_unit: 'mg/dl',
  CaCr_entry_mode: 'concentration', CaCr_reported: '', CaCr_reported_unit: 'mg/mg', CaCr_same_specimen: '',
  spotSampleKind: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
});

async function openCalculator(page, width = 1440) {
  await prepareBrowser(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await page.waitForFunction(() => typeof window.evaluateClcrCacrDzm === 'function' && Boolean(window.ClcrCacrDzmUi));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

async function restore(page, fields = {}, formula = FORMULA) {
  const version = formula === FORMULA ? 'advanced' : 'spot';
  expect(await page.evaluate(({ fields, formula, version, base }) => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: version, selectedFormula: formula,
    inputs: { ...base, currentVersion: version, formulaPicker: formula, ...fields },
  }, { source: 'e2e-cacr-dzm-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true }),
  { fields, formula, version, base: BASE })).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formula);
  if (formula === FORMULA) await expect(inputCard(page)).toBeVisible();
}

async function choose(page, formula) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formula)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formula);
}

async function expectResult(page, { formula = FORMULA, raw = 0.20039, unit = 'mg/mg', status = 'within', tone = status === 'within' ? 'success' : status === 'unassessed' ? 'neutral' : 'warning', reference = true, guest = true } = {}) {
  const resultCard = card(page, formula);
  await expect(resultCard).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect.poll(async () => Number(await resultCard.getAttribute('data-clcr-value'))).toBeCloseTo(raw, 14);
  await expect(resultCard.locator('.clcr-result-value')).toHaveCount(1);
  await expect(resultCard.locator('.clcr-result-unit')).toHaveText(unit);
  await expect(resultCard).toHaveAttribute('data-clcr-tone', tone);
  const result = JSON.parse(await resultCard.getAttribute('data-clcr-cacr-snapshot'));
  expect(result).toMatchObject({ schema: 'clcr-cacr', valid: true, rawValue: raw, unit, status, referenceAvailable: reference });
  expect(await page.evaluate(id => window.canComputeFormula(id), formula)).toBe(true);
  expect(await page.evaluate(id => window.ClcrUiWorkflow.getFormulaReadiness(id).valueReady, formula)).toBe(true);
  if (guest) {
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  }
  return result;
}

async function expectBlocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('Ca_Cr'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('Ca_Cr').valueReady)).toBe(false);
  expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'Ca_Cr' }))).toEqual([]);
}

async function referenceNumbers(page, formula = FORMULA) {
  const text = await card(page, formula).locator('.clcr-result-reference-value').innerText();
  return (text.match(/\d+(?:[,.]\d+)?/g) || []).map(value => Number(value.replace(',', '.')));
}

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector), rect = node.getBoundingClientRect();
      return { x: rect.x, width: rect.width, top: rect.top + scrollY, bottom: rect.bottom + scrollY };
    };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), active: box('#clcrActivePanel'), input: box('#cacrDzmInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      controls: [...document.querySelectorAll('#cacrDzmInputCard input,#cacrDzmInputCard select,#cacrDzmInputCard button')]
        .filter(node => node.checkVisibility()).map(node => ({ id: node.id || node.textContent.trim(), kind: node.tagName,
          height: node.getBoundingClientRect().height, font: parseFloat(getComputedStyle(node).fontSize),
          left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })),
      units: [...document.querySelectorAll('#clcrResultReport [data-clcr-series="Ca_Cr"] .clcr-result-unit,#clcrResultReport [data-clcr-series="Ca_Cr"] .clcr-result-reference-unit')].map(node => node.getBoundingClientRect().top),
      numbers: [...document.querySelectorAll('#clcrResultReport [data-clcr-series="Ca_Cr"] .clcr-result-value,#clcrResultReport [data-clcr-series="Ca_Cr"] .clcr-result-reference-value')].map(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const container = node.closest('.clcr-result-patient,.clcr-result-reference').getBoundingClientRect();
        return { text: node.textContent, left: container.left, right: container.right,
          glyphs: [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right })) };
      }),
    };
  });
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(Math.abs(result.form.width - result.input.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.clear.width - result.input.width)).toBeLessThanOrEqual(1);
  if (width < 980) expect(result.report.top - result.clear.bottom).toBeGreaterThanOrEqual(20);
  else expect(Math.abs(result.active.top - result.report.top)).toBeLessThanOrEqual(1);
  for (const control of result.controls) {
    expect(control.height, control.id).toBeGreaterThanOrEqual(48);
    if (control.kind !== 'BUTTON') expect(control.font, control.id).toBeGreaterThanOrEqual(16);
    expect(control.left, control.id).toBeGreaterThanOrEqual(0);
    expect(control.right, control.id).toBeLessThanOrEqual(width + 1);
  }
  if (result.units.length === 2) expect(Math.abs(result.units[0] - result.units[1])).toBeLessThanOrEqual(1);
  for (const number of result.numbers) for (const glyph of number.glyphs) {
    expect(glyph.left, number.text).toBeGreaterThanOrEqual(number.left - 0.6);
    expect(glyph.right, number.text).toBeLessThanOrEqual(number.right + 0.6);
  }
  return result;
}

function sameWidths(before, after) {
  for (const key of ['form', 'input', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
}

for (const width of [1440, 390, 320]) {
  test(`Ca/Cr DZM ${width}px: dwa stężenia, jeden wynik i stały układ wszystkich trybów`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page, { CACR_DZM_calcium: '', CACR_DZM_creatinine: '' });
    await expectBlocked(page);
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(inputCard(page).locator('input:visible')).toHaveCount(2);
    await expect(inputCard(page).locator('select:visible')).toHaveCount(2);
    for (const id of ['age', 'ageMonths', 'sex', 'weight', 'height', 'U_Ca', 'Ucr', 'V24', 'collectionStartAt', 'collectionEndAt', 'Cl24DurationHours']) await expect(page.locator('#' + id)).toBeHidden();
    const initial = await geometry(page, width);
    await page.locator('#CACR_DZM_calcium').fill('5');
    await page.locator('#CACR_DZM_creatinine').fill('100');
    const adult = await expectResult(page);
    expect(adult.profileId).toBe(PROFILE);
    expect(adult.context).toMatchObject({ ageYears: 40, sex: 'M', sampleType: 'timed' });
    expect(await referenceNumbers(page)).toEqual([0.02, 0.24]);
    await expect(card(page).locator('.clcr-result-reference-label')).toContainText('Norma dla wieku');
    await expect(card(page).locator('.clcr-result-reference-label')).toContainText('ARUP');
    sameWidths(initial, await geometry(page, width));
    const shot = testInfo.outputPath(`cacr-dzm-${width}.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: shot });
    await testInfo.attach(`cacr-dzm-${width}`, { path: shot, contentType: 'image/png' });
    await mode(page, true).click();
    await expect(inputCard(page).locator('input:visible')).toHaveCount(1);
    await expect(inputCard(page).locator('select:visible')).toHaveCount(1);
    expect(await page.locator('#CACR_DZM_reportedUnit option').evaluateAll(nodes => nodes.filter(node => !node.disabled && !node.hidden).map(node => node.value))).toEqual(['mg/mg', 'mg/g', 'mmol/mmol', 'mg/mmol', 'mmol/mol']);
    await page.locator('#CACR_DZM_reportedValue').fill('200.39');
    await page.locator('#CACR_DZM_reportedUnit').selectOption('mg/g');
    await expectResult(page, { raw: 200.39, unit: 'mg/g' });
    expect(await referenceNumbers(page)).toEqual([20, 240]);
    await details(page).locator(':scope > summary').click();
    await expect(details(page).locator('table caption')).toContainText('mg/g');
    await details(page).locator(':scope > summary').click();
    sameWidths(initial, await geometry(page, width));
    await restore(page, { CACR_DZM_calcium: '8' });
    await expectResult(page, { raw: 0.320624, status: 'above' });
    for (const family of ['Arial, sans-serif', '"DejaVu Sans", sans-serif', '"Liberation Sans", sans-serif', 'cursive']) {
      await page.addStyleTag({ content: `#clcrResultReport [data-clcr-series="Ca_Cr"] :is(.clcr-result-value,.clcr-result-reference-value) { font-family: ${family} !important; }` });
      sameWidths(initial, await geometry(page, width));
    }
    await page.addStyleTag({ content: '#clcrResultReport [data-clcr-series="Ca_Cr"] :is(.clcr-result-value,.clcr-result-reference-value) { font-family: "DejaVu Sans", sans-serif !important; }' });
    await mode(page, true).click();
    await page.locator('#CACR_DZM_reportedUnit').selectOption('mg/mg');
    for (const [value, status] of [['1.7976931348623157e308', 'above'], ['1e-300', 'below']]) {
      await page.locator('#CACR_DZM_reportedValue').fill(value);
      await expectResult(page, { raw: Number(value), status });
      sameWidths(initial, await geometry(page, width));
    }
    await details(page).locator(':scope > summary').click();
    await expect(details(page)).toContainText(/ARUP|0020472/);
    await expect(details(page)).toContainText(/przytarczyc/);
    await expect(details(page)).toContainText(/burosumab/);
    sameWidths(initial, await geometry(page, width));
    await restore(page, { CACR_DZM_calcium: '-1' });
    await expectBlocked(page);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#clearBtn').click();
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await choose(page, FORMULA);
    await expectBlocked(page);
    await expect(page.locator('#CACR_DZM_calcium')).toHaveValue('');
    await expect(page.locator('#CACR_DZM_creatinine')).toHaveValue('');
    expect(errors).toEqual([]);
  });
}

test('Ca/Cr DZM: źródłowe normy wieku i płci bez blokowania liczby przy brakującym kontekście', async ({ page }) => {
  await openCalculator(page);
  for (const [age, months, sex, norm] of [
    ['0', '', '', [0.03, 0.81]], ['0', '0', '', [0.03, 0.81]], ['1', '0', '', [0.03, 0.56]], ['2', '', '', [0.02, 0.5]],
    ['4', '', '', [0.02, 0.41]], ['6', '11', '', [0.01, 0.3]],
    ['7', '', 'M', [0.006, 0.431]], ['8', '', 'F', [0.011, 0.457]],
    ['10', '', 'M', [0.008, 0.3]], ['12', '', 'F', [0.012, 0.309]],
    ['13', '', 'M', [0.006, 0.293]], ['15', '', 'F', [0.008, 0.313]],
    ['16', '', 'M', [0.01, 0.264]], ['17', '', 'F', [0.02, 0.271]],
    ['18', '', 'M', [0.02, 0.24]], ['40', '', 'F', [0.02, 0.3]], ['84', '', 'M', [0.02, 0.24]],
    ['7', '', '', null], ['', '', 'M', null], ['1', '12', 'M', null],
  ]) {
    await restore(page, { age, ageMonths: months, sex });
    const model = await expectResult(page, { status: norm ? 'within' : 'unassessed', reference: !!norm });
    if (norm) expect(await referenceNumbers(page)).toEqual(norm);
    else expect(model.qualification.note).toBeTruthy();
    for (const id of ['age', 'sex', 'weight', 'height']) await expect(page.locator('#' + id)).toBeHidden();
  }
  await restore(page, { age: '8', sex: 'M', CACR_DZM_inputMode: 'direct', CACR_DZM_reportedValue: '300', CACR_DZM_reportedUnit: 'mg/g' });
  await expectResult(page, { raw: 300, unit: 'mg/g' });
  expect(await referenceNumbers(page)).toEqual([6, 431]);
  await restore(page, { age: '8', sex: 'M', CaCr_entry_mode: 'direct', CaCr_reported: '300', CaCr_reported_unit: 'mg/g' }, 'CaCr_spot');
  const spot = await expectResult(page, { formula: 'CaCr_spot', raw: 300, unit: 'mg/g', status: 'above' });
  expect(spot.profileId).toBe('MAYO_CACR3_RANDOM_2026_10');
  expect(await referenceNumbers(page, 'CaCr_spot')).toEqual([10, 250]);
  await restore(page, { CACR_DZM_currentPreterm: true });
  const preterm = await expectResult(page, { status: 'unassessed', reference: false });
  expect(preterm).toMatchObject({ valid: true, rawValue: 0.20039, referenceAvailable: false, status: 'unassessed', tone: 'neutral', context: { population: { currentPreterm: true } } });
});

test('Ca/Cr DZM: jednostki, nierówności, neutralne zero i mała liczba zachowują znaczenie w zapisie', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  const equalInputs = [
    { CACR_DZM_calcium: '5', CACR_DZM_calciumUnit: 'mmol/L', CACR_DZM_creatinine: '100', CACR_DZM_creatinineUnit: 'mg/dL' },
    { CACR_DZM_calcium: '5000', CACR_DZM_calciumUnit: 'µmol/L', CACR_DZM_creatinine: '1000', CACR_DZM_creatinineUnit: 'mg/L' },
    { CACR_DZM_calcium: '200.39', CACR_DZM_calciumUnit: 'mg/L', CACR_DZM_creatinine: '1000', CACR_DZM_creatinineUnit: 'mg/L' },
  ];
  for (const fields of equalInputs) { await restore(page, fields); await expectResult(page, { guest: false }); }
  await restore(page, { CACR_DZM_calcium: '0' });
  const zero = await expectResult(page, { raw: 0, status: 'unassessed', guest: false });
  expect(zero.zero).toBe(true);
  const [zeroNote] = await saveVisible(page, '2026-11-01');
  expect(zeroNote.labResult.valueNum).toBe(0);
  await restore(page, { CACR_DZM_calcium: '0.0001' });
  const tiny = await expectResult(page, { raw: 0.0000040078, status: 'below', guest: false });
  expect(parsed(tiny.display.text)).toBeGreaterThan(0);
  const [tinyNote] = await saveVisible(page, '2026-11-02');
  expect(tinyNote.labResult.valueNum).toBe(0.0000040078);
  expect(parsed(tinyNote.labResult.value)).toBeGreaterThan(0);
  await restore(page, { CACR_DZM_inputMode: 'direct', CACR_DZM_reportedValue: '<6', CACR_DZM_reportedUnit: 'mg/g', age: '8' });
  const bound = await expectResult(page, { raw: 6, unit: 'mg/g', status: 'below', guest: false });
  expect(bound.comparator).toBe('<');
  const [boundNote] = await saveVisible(page, '2026-11-03');
  expect(boundNote.labResult.value).toContain('<');
  expect(boundNote.labResult.valueNum).toBeUndefined();
  for (const fields of [
    { CACR_DZM_calcium: '-1' }, { CACR_DZM_creatinine: '-1' },
    { CACR_DZM_calcium: '-1', CACR_DZM_creatinine: '-1' }, { CACR_DZM_creatinine: '0' },
    { CACR_DZM_calcium: 'Infinity' }, { CACR_DZM_calcium: '1e-300', CACR_DZM_creatinine: '1e100' },
  ]) { await restore(page, fields); await expectBlocked(page); }
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Ca/Cr DZM: własne pola i znany materiał nie przejmują zegara ani informacji próbki jednorazowej', async ({ page }) => {
  await openCalculator(page);
  const positions = await page.evaluate(() => window.FORMULAS.filter(item => ['Ca_Cr', 'CaCr_spot'].includes(item.id)).map(item => ({ id: item.id, label: item.label })));
  expect(positions).toEqual([{ id: 'Ca_Cr', label: 'Ca/Cr — DZM' }, { id: 'CaCr_spot', label: 'Ca/Cr — próbka jednorazowa' }]);
  await page.locator('#formulaSearch').fill('wapn');
  await expect(page.locator('#formulaLive')).toBeVisible();
  await expect(page.locator('#formulaLive .clcr-search-result').first()).toHaveAttribute('data-formula-id', 'CaCr_spot');
  await page.locator('#formulaLive .clcr-search-result[data-formula-id="CaCr_spot"]').click();
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'CaCr_spot' && window.clcrIsResetting !== true);
  await expect(page.locator('#Ca_spot')).toBeVisible();
  await expect(page.locator('#formulaLive')).toBeHidden();
  await restore(page, { U_Ca: '0.01', Ucr: '999', Cl24DurationHours: '12', spotSampleKind: 'timed', CaCr_same_specimen: 'different', ui_spotSameSpecimen_answer: 'no' });
  await expectResult(page);
  await choose(page, 'CaCr_spot');
  await expect(page.locator('#Ca_spot')).toHaveValue('');
  await expect(page.locator('#Ucr_spot')).toHaveValue('');
  await page.locator('#Ca_spot').fill('30');
  await page.locator('#Ucr_spot').fill('100');
  await choose(page, FORMULA);
  await expectResult(page);
  await expect(page.locator('#CACR_DZM_calcium')).toHaveValue('5');
  await expect(page.locator('#CACR_DZM_creatinine')).toHaveValue('100');
  await restore(page, { CACR_DZM_collectionHours: '25', CACR_DZM_durationKnown: true });
  const non24 = await expectResult(page);
  expect(non24.context.collectionHours).toBeTruthy();
  await restore(page, { CACR_DZM_collectionProblem: true });
  const problem = await expectResult(page, { reference: false, status: 'unassessed' });
  expect(problem.qualification.note).toMatch(/zbiór|zbior/);
  await restore(page, { CACR_DZM_sameSpecimen: 'different' });
  await expectBlocked(page);
  await restore(page, { CACR_DZM_inputMode: 'direct', CACR_DZM_reportedValue: '0.2', CACR_DZM_sameSpecimen: 'different' });
  await expectResult(page, { raw: 0.2 });
  await page.waitForFunction(() => !window.VildaPersistence?.isAutosaveSuppressed?.());
  await page.locator('#CACR_DZM_reportedValue').fill('0.21');
  await expect.poll(() => page.evaluate(() => window.VildaPersistence?.readClcrSession?.()?.inputs.CACR_DZM_reportedValue)).toBe('0.21');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await expect(page.locator('#CACR_DZM_reportedValue')).toHaveValue('0.21');
  await expectResult(page, { raw: 0.21 });
  await mode(page).click();
  await expectBlocked(page);
});

test('Ca/Cr DZM: Badania, Notatki i historia zachowują źródło i liczbę bez odwołania do bieżącego silnika', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  await restore(page);
  const model = await expectResult(page, { guest: false });
  const [dzm] = await saveVisible(page, '2026-11-01');
  await restore(page, { age: '', sex: '' });
  await expectResult(page, { status: 'unassessed', reference: false, guest: false });
  const [unassessed] = await saveVisible(page, '2026-11-02');
  await restore(page, { age: '8', CaCr_entry_mode: 'direct', CaCr_reported: '300', CaCr_reported_unit: 'mg/g' }, 'CaCr_spot');
  await expectResult(page, { formula: 'CaCr_spot', raw: 300, unit: 'mg/g', status: 'above', guest: false });
  const [spot] = await saveVisible(page, '2026-11-03');
  const projected = await page.evaluate(notes => {
    const engine = window.VildaClcrCacr;
    window.VildaClcrCacr = new Proxy({}, { get() { return () => { throw Error('Frozen Ca/Cr must not recompute'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes); }
    finally { window.VildaClcrCacr = engine; }
  }, [dzm, unassessed, spot]);
  const savedDzm = projected.measurements.find(item => item.noteId === dzm.id);
  const savedUnknown = projected.measurements.find(item => item.noteId === unassessed.id);
  const savedSpot = projected.measurements.find(item => item.noteId === spot.id);
  expect(savedDzm).toMatchObject({ valueNum: 0.20039, unit: 'mg/mg', outOfRange: false, parameterKey: 'clcr:Ca_Cr' });
  expect(savedDzm.displayValue).toBe(model.display.text.replace('.', ','));
  expect(savedUnknown).toMatchObject({ norm: '', outOfRange: null, parameterKey: 'clcr:Ca_Cr' });
  expect(savedSpot).toMatchObject({ valueNum: 300, unit: 'mg/g', outOfRange: true, parameterKey: 'clcr:CaCr_spot' });
  expect(new Set(projected.measurements.map(item => item.parameterKey))).toEqual(new Set(['clcr:Ca_Cr', 'clcr:CaCr_spot']));
  await page.locator('#clcrOpenBadaniaBtn').click();
  await showClcrResults(page, 'charts');
  await expect(clcrPoints(page)).toHaveCount(3);
  await page.locator('button[data-tab="notes"]').click();
  const notes = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]');
  await expect(notes).toHaveCount(3);
  const unknownNote = notes.filter({ hasText: '02.11.2026' });
  await expect(unknownNote).toHaveCount(1);
  await expect(unknownNote).not.toContainText('W zakresie');
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Ca/Cr DZM: dawny wynik pozostaje 0,2 bez nowej normy; dopiero jawna edycja zmienia obliczenie', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  const original = await page.evaluate(() => {
    const api = window.ClcrSavedCalculation;
    const values = { U_Ca: '5', Ucr: '100', age: '40', ageMonths: '', ageDays: '', sex: 'M' };
    const point = { id: 'Ca_Cr', sourceFormulaId: 'Ca_Cr', label: 'Wapń/kreatynina (DZM)',
      rawValue: 0.2, valueNum: 0.2, displayValue: '0.200', unit: 'mg/mg', norm: '', tone: 'neutral', outOfRange: null };
    const capture = api.createSnapshot(point, { capture: { formulaId: 'Ca_Cr', ageYears: 40, values,
      fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })) }, clinicalDateISO: '2025-10-21' });
    const note = { id: 'fictional-cacr-dzm-legacy', patientId: window.ClcrVisitSave.resolveCurrentPatientId(),
      category: 'wynik-klirens', rev: 1, title: point.label, clinicalDateISO: '2025-10-21',
      body: 'Kalkulator klirensu · clcr:Ca_Cr', labResult: { test: point.label, value: '0.200', valueNum: 0.2, unit: 'mg/mg', norm: '' } };
    note.body += '\n\n' + api.serializeSnapshot(capture, note);
    if (!api.readSaved(note).valid) throw Error('Fictional legacy Ca/Cr must round trip');
    window.__clcrRecordFixture.seed([note]);
    return note;
  });
  const frozen = await page.evaluate(note => {
    const engine = window.VildaClcrCacr;
    window.VildaClcrCacr = new Proxy({}, { get() { return () => { throw Error('Legacy read cannot use the current Ca/Cr engine'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes([note]).measurements[0]; }
    finally { window.VildaClcrCacr = engine; }
  }, original);
  expect(frozen).toMatchObject({ valueNum: 0.2, displayValue: '0.200', unit: 'mg/mg', norm: '', outOfRange: null });
  expect((await memory(page)).notes).toEqual([original]);
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), original);
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editField-CACR_DZM_calcium')).toHaveValue('5');
  await expect(page.locator('#editField-CACR_DZM_creatinine')).toHaveValue('100');
  await page.locator('#editField-CACR_DZM_calcium').fill('3');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const updated = (await memory(page)).notes[0];
  expect(updated.id).toBe(original.id);
  expect(updated.labResult.valueNum).toBe(0.120234);
  const projected = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], updated);
  expect(projected).toMatchObject({ parameterKey: 'clcr:Ca_Cr', valueNum: 0.120234, outOfRange: false });
  expect(projected.norm.replace(/\s/g, '')).toContain('0,02–0,24');
  expect((await memory(page)).notes).toHaveLength(1);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Ca/Cr DZM: nawigacja do próbki jednorazowej nie przenosi edytowanego zapisu do nowej serii', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  await restore(page);
  await expectResult(page, { guest: false });
  const [original] = await saveVisible(page, '2026-11-01');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), original);
  await page.locator('#editMeasurement').click();
  await page.locator('#editField-CACR_DZM_calcium').fill('8');
  await choose(page, 'CaCr_spot');
  await expect(page.locator('#editDialog')).toBeHidden();
  expect((await memory(page)).updates).toHaveLength(0);
  expect((await memory(page)).notes).toEqual([original]);
  await page.locator('#Ca_spot').fill('30');
  await page.locator('#Ucr_spot').fill('100');
  await expectResult(page, { formula: 'CaCr_spot', raw: 0.3, status: 'above', guest: false });
  const [spot] = await saveVisible(page, '2026-11-02');
  expect(spot.id).not.toBe(original.id);
  const stored = await memory(page);
  expect(stored.notes).toHaveLength(2);
  expect(stored.notes.find(note => note.id === original.id)).toEqual(original);
  const projection = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes).measurements, stored.notes);
  expect(new Set(projection.map(item => item.parameterKey))).toEqual(new Set(['clcr:Ca_Cr', 'clcr:CaCr_spot']));
  expect(stored.originalsLocked).toBe(true);
});

test('Ca/Cr DZM: edycja nie przyjmuje ujemnych operandów, zachowuje ID i usuwa tylko wybrany pomiar', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  await restore(page);
  await expectResult(page, { guest: false });
  const [first] = await saveVisible(page, '2026-11-01');
  await restore(page, { CACR_DZM_calcium: '8' });
  await expectResult(page, { raw: 0.320624, status: 'above', guest: false });
  const [sibling] = await saveVisible(page, '2026-11-02');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), first);
  await page.locator('#editMeasurement').click();
  for (const [calcium, creatinine] of [['-1', '100'], ['5', '-1'], ['-1', '-1'], ['5', '0']]) {
    await page.locator('#editField-CACR_DZM_calcium').fill(calcium);
    await page.locator('#editField-CACR_DZM_creatinine').fill(creatinine);
    await page.locator('#saveEditedMeasurement').click();
    await expect(page.locator('#editDialog')).toBeVisible();
    expect((await memory(page)).updates).toHaveLength(0);
  }
  await page.locator('#editField-CACR_DZM_calcium').fill('3');
  await page.locator('#editField-CACR_DZM_creatinine').fill('100');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const stored = await memory(page), edited = stored.notes.find(note => note.id === first.id);
  expect(edited.labResult.valueNum).toBe(0.120234);
  expect(edited.id).toBe(first.id);
  expect(stored.notes.find(note => note.id === sibling.id)).toEqual(sibling);
  const measurement = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], edited);
  expect(measurement.parameterKey).toBe('clcr:Ca_Cr');
  await page.locator('#deleteMeasurement').click();
  await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).toBeHidden();
  expect((await memory(page)).notes).toEqual([sibling]);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Ca/Cr DZM: raport AI i Word zawierają ten sam wynik, normę i źródło', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { age: '8', sex: 'M' });
  const model = await expectResult(page);
  expect(model.reference).toMatchObject({ lower: 0.006, upper: 0.431 });
  await page.evaluate(() => {
    window.__cacrDzmClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__cacrDzmClipboard = value; } } });
    window.alert = () => {};
  });
  await page.locator('#askAI').click();
  const copied = await page.evaluate(() => window.__cacrDzmClipboard);
  expect(copied.replace(/\s/g, '')).toContain('0,20039');
  expect(copied).toContain('ARUP');
  expect(copied.replace(/\s/g, '')).toContain('0,006–0,431');
  const pending = page.waitForEvent('download');
  await page.locator('#downloadDOCX').click();
  const download = await pending, html = await fs.readFile(await download.path(), 'utf8');
  const text = await page.evaluate(value => new DOMParser().parseFromString(value, 'text/html').body.textContent, html);
  expect(text.replace(/\s/g, '')).toContain('0,20039');
  expect(text.replace(/\s/g, '')).toContain('0,006–0,431');
  expect(text).toContain('ARUP');
  await mode(page, true).click();
  await page.locator('#CACR_DZM_reportedUnit').selectOption('mg/mg');
  await page.locator('#CACR_DZM_reportedValue').fill('1.7976931348623157e308');
  const scientific = await expectResult(page, { raw: Number.MAX_VALUE, status: 'above' });
  const scientificText = scientific.display.text.replace('.', ',');
  await expect(card(page).locator('.clcr-result-value')).toHaveAttribute('data-scientific', 'true');
  await expect(card(page).locator('.clcr-result-value')).toHaveAttribute('aria-label', scientificText);
  await page.locator('#askAI').click();
  await expect.poll(() => page.evaluate(() => window.__cacrDzmClipboard)).toContain(scientificText);
  const scientificCopy = await page.evaluate(() => window.__cacrDzmClipboard);
  expect(scientificCopy).not.toContain('× 10308');
  const scientificPending = page.waitForEvent('download');
  await page.locator('#downloadDOCX').click();
  const scientificDownload = await scientificPending;
  const scientificHtml = await fs.readFile(await scientificDownload.path(), 'utf8');
  const scientificWord = await page.evaluate(value => new DOMParser().parseFromString(value, 'text/html').body.textContent, scientificHtml);
  expect(scientificWord).toContain(scientificText);
  expect(scientificWord).not.toContain('× 10308');
});
