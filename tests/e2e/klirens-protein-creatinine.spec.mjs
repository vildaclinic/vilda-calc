import { showClcrResults, showBadaniaView, clcrRow, clcrPoints, clcrPoint } from '../support/badania-klirens.mjs';
import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, prepareBrowser, saveVisible, selectPatient, OTHER_PATIENT_ID, openShellCalculator, shellFrame } from '../support/klirens-patient-record.mjs';

// Fictional values. Only encrypted I/O is replaced by the explicit memory vault;
// all clinical calculations, DOM events, serializers, readers and editors are real.
const FORMULA = 'B_Cr';
const STANDARD = 0.3;
const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="B_Cr"]');
const inputCard = page => page.locator('#bcrInputCard');
const details = page => page.locator('#clcrResultReport .clcr-result-details[data-clcr-formula="B_Cr"]');
const mode = (page, direct = false) => inputCard(page).locator(`button[data-bcr-mode="${direct ? 'direct' : 'concentration'}"]`);
const BASE = Object.freeze({
  currentVersion: 'advanced', formulaPicker: FORMULA,
  age: '', ageMonths: '', ageDays: '', sex: '', height: '', weight: '',
  BCR_inputMode: 'concentration', BCR_protein: '300', BCR_proteinUnit: 'mg/L',
  BCR_creatinine: '100', BCR_creatinineUnit: 'mg/dL', BCR_reportedValue: '', BCR_reportedUnit: 'mg/mg',
  BCR_sameSpecimen: '', BCR_collectionProblem: false, BCR_collectionHours: '', BCR_durationKnown: false,
  U_Prot: '', U_Ca: '', Ucr: '', V24: '', collectionStartAt: '', collectionEndAt: '', Cl24DurationHours: '',
  CACR_DZM_calcium: '', CACR_DZM_creatinine: '', CACR_DZM_sameSpecimen: '', CACR_DZM_collectionHours: '',
});

async function screenshot(page, testInfo, name) {
  const path = testInfo.outputPath(name + '.png');
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function open(page, width = 1440) {
  await prepareBrowser(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await page.waitForFunction(() => typeof window.VildaClcrProteinCreatinine?.evaluate === 'function' && Boolean(window.ClcrProteinCreatinineUi));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

async function restore(page, fields = {}) {
  expect(await page.evaluate(({ base, fields }) => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'advanced', selectedFormula: 'B_Cr', inputs: { ...base, ...fields },
  }, { source: 'e2e-protein-creatinine-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true }), { base: BASE, fields })).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'B_Cr' &&
    document.getElementById('formulaPicker').value === 'B_Cr' && window.clcrIsResetting !== true);
  await expect(inputCard(page)).toBeVisible();
}

async function choose(page, formula) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formula)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formula);
}

async function result(page, { raw = STANDARD, guest = true, status = 'unassessed', reference = null } = {}) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(card(page)).toHaveAttribute('data-clcr-tone', status === 'normal' ? 'success' : ['low', 'high'].includes(status) ? 'warning' : 'neutral');
  await expect(card(page).locator('.clcr-result-value')).toHaveCount(1);
  await expect(card(page).locator('.clcr-result-unit')).toHaveText('mg/mg');
  const snapshot = JSON.parse(await card(page).getAttribute('data-clcr-protein-creatinine-snapshot'));
  expect(snapshot).toMatchObject({ schema: 'clcr-protein-creatinine', valid: true, status, unit: 'mg/mg',
    referenceAvailable: Boolean(reference), outOfRange: status === 'normal' ? false : status === 'unassessed' ? null : true });
  if (reference) expect(snapshot.reference).toMatchObject(reference);
  else expect(snapshot.reference).toBe(null);
  expect(Number.isFinite(snapshot.rawValue)).toBe(true);
  if (raw === 0) expect(snapshot.rawValue).toBe(0);
  else expect(Math.abs(snapshot.rawValue / raw - 1)).toBeLessThan(2e-14);
  expect(Number(await card(page).getAttribute('data-clcr-value'))).toBe(snapshot.rawValue);
  expect(await page.evaluate(() => window.canComputeFormula('B_Cr'))).toBe(true);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('B_Cr').valueReady)).toBe(true);
  if (guest) {
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  }
  return snapshot;
}

async function blocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('B_Cr'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('B_Cr').valueReady)).toBe(false);
  expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'B_Cr' }))).toEqual([]);
}

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const boxes = await page.evaluate(() => {
    const box = selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { x: rect.x, width: rect.width, top: rect.top + scrollY, bottom: rect.bottom + scrollY };
    };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), active: box('#clcrActivePanel'), input: box('#bcrInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      inputStep: box('#clcrActivePanel .clcr-step-number'), resultStep: box('#clcrResultTitle .clcr-step-number'),
      inputMode: document.getElementById('BCR_inputMode').value,
      resultUnits: [...document.querySelectorAll('#clcrResultReport [data-clcr-series="B_Cr"] .clcr-result-unit,#clcrResultReport [data-clcr-series="B_Cr"] .clcr-result-reference-unit')].map(node => node.getBoundingClientRect().top),
      modeButtons: [...document.querySelectorAll('#bcrInputCard .bcr-input-mode button')].map(button => {
        const style = getComputedStyle(button);
        return { mode: button.getAttribute('data-bcr-mode'), pressed: button.getAttribute('aria-pressed'),
          background: style.backgroundColor, color: style.color };
      }),
      controls: [...document.querySelectorAll('#bcrInputCard input,#bcrInputCard select,#bcrInputCard button')]
        .filter(node => node.checkVisibility()).map(node => ({ id: node.id || node.textContent.trim(), kind: node.tagName,
          valueControl: node.tagName !== 'BUTTON' || node.hasAttribute('data-bcr-mode'),
          height: node.getBoundingClientRect().height, font: parseFloat(getComputedStyle(node).fontSize),
          left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })),
      inputPairs: [...document.querySelectorAll('#bcrInputCard .bcr-value-row')]
        .filter(row => row.checkVisibility()).map(row => {
          const input = row.querySelector('input'), unit = row.querySelector('select');
          const inputRect = input.getBoundingClientRect(), unitRect = unit.getBoundingClientRect();
          return { inputId: input.id, unitId: unit.id,
            inputTop: inputRect.top, inputBottom: inputRect.bottom,
            unitTop: unitRect.top, unitBottom: unitRect.bottom };
        }),
      mainFont: parseFloat(getComputedStyle(document.querySelector('#bcrInputCard')).fontSize),
      numbers: [...document.querySelectorAll('#clcrResultReport [data-clcr-series="B_Cr"] .clcr-result-value,#clcrResultReport [data-clcr-series="B_Cr"] .clcr-result-reference-value')].map(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const container = node.closest('.clcr-result-patient,.clcr-result-reference').getBoundingClientRect();
        return { text: node.textContent, left: container.left, right: container.right,
          glyphs: [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right })) };
      }),
    };
  });
  expect(boxes.overflow).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes.form.width - boxes.input.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes.clear.width - boxes.input.width)).toBeLessThanOrEqual(1);
  expect(boxes.mainFont).toBeGreaterThanOrEqual(16);
  expect(Math.abs(boxes.input.top - boxes.active.bottom), 'continuous input card border').toBeLessThanOrEqual(1);
  if (boxes.resultUnits.length === 2) expect(Math.abs(boxes.resultUnits[0] - boxes.resultUnits[1]), 'result/reference units aligned').toBeLessThanOrEqual(1);
  expect(boxes.modeButtons).toHaveLength(2);
  const pressed = boxes.modeButtons.filter(button => button.pressed === 'true');
  const unpressed = boxes.modeButtons.filter(button => button.pressed === 'false');
  expect(pressed).toHaveLength(1);
  expect(unpressed).toHaveLength(1);
  expect(pressed[0].mode).toBe(boxes.inputMode);
  expect(pressed[0].background).not.toBe(unpressed[0].background);
  expect(pressed[0].color).not.toBe(unpressed[0].color);
  if (width < 980) expect(boxes.report.top - boxes.clear.bottom).toBeGreaterThanOrEqual(20);
  else {
    expect(Math.abs(boxes.active.top - boxes.report.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes.inputStep.top - boxes.resultStep.top)).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(boxes.inputStep.width - boxes.resultStep.width)).toBeLessThanOrEqual(1);
  for (const control of boxes.controls) {
    if (control.valueControl) expect(control.height, control.id).toBeGreaterThanOrEqual(48);
    if (control.kind !== 'BUTTON') expect(control.font, control.id).toBeGreaterThanOrEqual(16);
    expect(control.left, control.id).toBeGreaterThanOrEqual(0);
    expect(control.right, control.id).toBeLessThanOrEqual(width + 1);
  }
  expect(boxes.inputPairs).toHaveLength(boxes.inputMode === 'direct' ? 1 : 2);
  for (const pair of boxes.inputPairs) {
    expect(Math.abs(pair.inputTop - pair.unitTop), `${pair.inputId}/${pair.unitId}: top`).toBeLessThanOrEqual(1);
    expect(Math.abs(pair.inputBottom - pair.unitBottom), `${pair.inputId}/${pair.unitId}: bottom`).toBeLessThanOrEqual(1);
  }
  for (const number of boxes.numbers) for (const glyph of number.glyphs) {
    expect(glyph.left, number.text).toBeGreaterThanOrEqual(number.left - 0.6);
    expect(glyph.right, number.text).toBeLessThanOrEqual(number.right + 0.6);
  }
  return boxes;
}

function sameWidths(before, after) {
  for (const key of ['form', 'input', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
}

test('B/Cr: wybór formuły zamyka wyszukiwanie i prowadzi do dwóch brakujących stężeń', async ({ page }) => {
  await open(page, 390);
  await restore(page, { BCR_protein: '', BCR_creatinine: '' });
  await choose(page, 'Ca_Cr');
  await page.evaluate(() => scrollTo(0, 0));
  const search = page.locator('#formulaSearch'), list = page.locator('#formulaLive');
  await expect(list).toBeHidden();
  await search.fill('B/Cr');
  await expect(list.locator('[data-formula-id="B_Cr"]')).toBeVisible();
  await page.locator('.clcr-workflow__title').click();
  await expect(list).toBeHidden();
  await search.click();
  await list.locator('[data-formula-id="B_Cr"]').click();
  await expect(list).toBeHidden();
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.selectionGuidance.lastFormula === 'B_Cr' &&
    window.ClcrUiWorkflow.state.selectionGuidance.lastTarget === 'BCR_protein');
  await expect(page.locator('#BCR_protein')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#BCR_creatinine')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#BCR_protein')).toBeInViewport();
  await blocked(page);
});

for (const width of [1440, 390, 320]) {
  test(`B/Cr ${width}px: dwa stężenia, jedna karta, wyrównanie i stałe szerokości`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page, width);
    await restore(page, { BCR_protein: '', BCR_creatinine: '' });
    await blocked(page);
    await expect(inputCard(page).locator('input:visible')).toHaveCount(2);
    await expect(inputCard(page).locator('select:visible')).toHaveCount(2);
    await expect(inputCard(page).locator('.clcr-info-button:visible')).toHaveCount(0);
    await expect(page.locator('#age,#sex,#weight,#height,#U_Prot,#Ucr,#V24,#collectionStartAt,#collectionEndAt').filter({ visible: true })).toHaveCount(0);
    await expect(page.locator('#BCR_proteinUnit')).toHaveValue('mg/L');
    await expect(page.locator('#BCR_creatinineUnit')).toHaveValue('mg/dL');
    await page.locator('#BCR_protein').fill('300');
    await blocked(page);
    await page.locator('#BCR_creatinine').fill('100');
    const model = await result(page);
    expect(model.exactValue).toMatchObject({ numerator: '3', denominator: '10' });
    const initial = await geometry(page, width);
    await screenshot(page, testInfo, `bcr-concentration-${width}`);
    await page.locator('#BCR_creatinine').fill('0');
    await blocked(page);
    sameWidths(initial, await geometry(page, width));
    await kliknij(mode(page, true));
    await expect(inputCard(page).locator('input:visible')).toHaveCount(1);
    await expect(inputCard(page).locator('select:visible')).toHaveCount(1);
    expect(await page.locator('#BCR_reportedUnit option:not([hidden])').allTextContents()).toEqual(['mg/mg', 'mg/g', 'mg/mmol']);
    await page.locator('#BCR_reportedValue').fill('0.5');
    await result(page, { raw: 0.5 });
    sameWidths(initial, await geometry(page, width));
    await restore(page, { age: '10', sex: 'F', BCR_inputMode: 'direct', BCR_reportedValue: '.3' });
    await result(page, { raw: .3, status: 'normal', reference: { low: null, high: .334 } });
    sameWidths(initial, await geometry(page, width));
    await screenshot(page, testInfo, `bcr-normal-${width}`);
    await page.locator('#BCR_reportedValue').fill('2');
    await result(page, { raw: 2, status: 'high', reference: { low: null, high: .334 } });
    sameWidths(initial, await geometry(page, width));
    await screenshot(page, testInfo, `bcr-high-${width}`);
    if (!await details(page).evaluate(node => node.open)) await kliknij(details(page).locator('summary'));
    await expect(details(page)).toHaveAttribute('open', '');
    sameWidths(initial, await geometry(page, width));
    await expect(details(page)).toHaveAttribute('open', '');
    await screenshot(page, testInfo, `bcr-details-${width}`);
    await kliknij(details(page).locator('summary'));
    await restore(page, { BCR_inputMode: 'direct', BCR_reportedValue: '.5' });
    for (const family of ['Arial', 'DejaVu Sans', 'Liberation Sans']) {
      await page.addStyleTag({ content: `#bcrInputCard,#bcrInputCard *,#clcrResultReport,#clcrResultReport * { font-family: "${family}", sans-serif !important; }` });
      for (const extreme of ['1.7976931348623157e308', '1e-300']) {
        await page.locator('#BCR_reportedValue').fill(extreme);
        await result(page, { raw: Number(extreme) });
        sameWidths(initial, await geometry(page, width));
      }
    }
    await screenshot(page, testInfo, `bcr-extreme-${width}`);
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await choose(page, FORMULA);
    await expect(page.locator('#BCR_protein')).toHaveValue('');
    await expect(page.locator('#BCR_creatinine')).toHaveValue('');
    await blocked(page);
    expect(errors).toEqual([]);
  });
}

// Equivalent protein concentrations are combined with both 1,000 mg/L
// and 1 mmol/L creatinine; the oracle is independent of production conversion.
for (const [pUnit, p] of [['mg/L', '300'], ['mg/dL', '30'], ['g/L', '.3']]) {
  test(`B/Cr: białko ${pUnit} i cztery jednostki kreatyniny`, async ({ page }) => {
    await open(page);
    await restore(page);
    for (const [crUnit, cr, raw] of [['mg/dL', '100', .3], ['mg/L', '1000', .3], ['mmol/L', '1', 300 / 113.12], ['µmol/L', '1000', 300 / 113.12]]) {
      await page.locator('#BCR_proteinUnit').selectOption(pUnit);
      await page.locator('#BCR_creatinineUnit').selectOption(crUnit);
      await page.locator('#BCR_protein').fill(p);
      await page.locator('#BCR_creatinine').fill(cr);
      await result(page, { raw });
    }
    expect(await page.locator('#BCR_proteinUnit option').allTextContents()).toEqual(['mg/L', 'mg/dL', 'g/L']);
  });
}

for (const [age, sex, sourceLow, high] of [
  ['7', 'M', .061, .220], ['7', 'F', .070, .548],
  ['10', 'M', .059, .220], ['10', 'F', .057, .334],
  ['13', 'M', .041, .371], ['13', 'F', .033, .307],
  ['16', 'M', .031, .242], ['16', 'F', .036, .329],
]) {
  test(`B/Cr: ARUP ${age} lat ${sex} — górna granica włączona, bez alarmu poniżej dolnej`, async ({ page }) => {
    await open(page);
    await restore(page, { age, sex, BCR_inputMode: 'direct' });
    let referenceColors;
    for (const [value, status] of [[sourceLow / 2, 'normal'], [high, 'normal'], [high + .00001, 'high']]) {
      await page.locator('#BCR_reportedValue').fill(String(value));
      await result(page, { raw: value, status, reference: { low: null, high, upperInclusive: true } });
      await expect(card(page)).toContainText('Górna granica normy');
      await expect(card(page)).toContainText('Dla wieku i płci');
      await expect(card(page)).not.toContainText('ARUP');
      await expect(card(page)).not.toContainText('tego laboratorium');
      await expect(card(page)).toContainText(status === 'normal' ? 'B/Cr niepodwyższony' : 'Podwyższony B/Cr');
      if (status === 'high') await expect(card(page)).not.toContainText('B/Cr niepodwyższony');
      await expect(card(page).locator('.bcr-norm-boundary')).toHaveAttribute('x1', '50%');
      await expect(card(page).locator('.bcr-norm-band')).toHaveAttribute('width', '50%');
      const pointPercent = Number((await card(page).locator('.bcr-norm-point').getAttribute('x1')).replace('%', ''));
      expect(pointPercent).toBeCloseTo(100 * value / (2 * high), 10);
      const colors = await card(page).evaluate(node => ({
        value: getComputedStyle(node.querySelector('.clcr-result-value')).color,
        reference: getComputedStyle(node.querySelector('.clcr-result-reference-value')).color,
        unit: getComputedStyle(node.querySelector('.clcr-result-reference-unit')).color,
      }));
      if (status === 'high') { expect(colors.reference).not.toBe(colors.value); expect(colors.unit).not.toBe(colors.value); }
      if (referenceColors) expect([colors.reference, colors.unit]).toEqual(referenceColors);
      else referenceColors = [colors.reference, colors.unit];
    }
    await kliknij(details(page).locator('summary'));
    await expect(details(page).locator('.bcr-reference-cell--active')).toHaveCount(1);
    await expect(details(page).locator('.bcr-reference-cell--active')).toContainText(String(sourceLow).replace('.', ','));
    await expect(details(page)).toContainText('Źródło zakresu przyjętego w aplikacji: ARUP');
  });
}

test('B/Cr: KDIGO od 18 urodzin, bez wymagania płci i z dokładnymi granicami 0,15 oraz 0,5', async ({ page }) => {
  await open(page);
  await restore(page, { age: '17', ageMonths: '11', ageDays: '29', sex: 'M', BCR_inputMode: 'direct', BCR_reportedValue: '.15' });
  await result(page, { raw: .15, status: 'normal', reference: { low: null, high: .242 } });
  await restore(page, { age: '18', sex: '', BCR_inputMode: 'direct', BCR_reportedValue: '.15' });
  await result(page, { raw: .15, status: 'high', reference: { low: null, high: .15, upperInclusive: false } });
  await expect(card(page)).toContainText('Zakres wg KDIGO');
  await expect(card(page)).not.toContainText('Norma dla wieku');
  await kliknij(details(page).locator('summary'));
  for (const [value, status, categoryId] of [['.14999999999999999', 'normal', 'normal-mild'], ['.15', 'high', 'moderate'], ['.5', 'high', 'moderate'], ['.50000000000000001', 'high', 'severe']]) {
    await page.locator('#BCR_reportedValue').fill(value);
    const model = await result(page, { raw: Number(value), status, reference: { low: null, high: .15 } });
    expect(model.category?.id || model.categoryId).toBe(categoryId);
    await expect(card(page)).not.toContainText(/\bA[123]\b/);
  }
});

test('B/Cr: brak wieku, pediatrycznej płci lub profilu <7 lat pozostawia liczbę bez oceny', async ({ page }) => {
  await open(page);
  for (const [age, sex] of [['', ''], ['6', 'M'], ['6', 'F'], ['10', '']]) {
    await restore(page, { age, sex });
    await result(page);
    await expect(card(page)).not.toContainText('W zakresie');
    await expect(card(page)).not.toContainText('B/Cr niepodwyższony');
  }
  await expect(card(page)).toContainText('Brak płci');
});

test('B/Cr: zero białka, ujemne operandy i skrajne liczby nie tworzą pozornego prawidłowego zera', async ({ page }) => {
  await open(page);
  await restore(page);
  for (const [p, cr] of [['-1', '2'], ['300', '-1'], ['-1', '-1'], ['300', '0'], ['', '2'], ['300', '']]) {
    await page.locator('#BCR_protein').fill(p);
    await page.locator('#BCR_creatinine').fill(cr);
    await blocked(page);
  }
  for (const [p, cr, raw] of [['0', '2', 0], ['.00001', '100', 1e-8], ['1e308', '1e308', .1]]) {
    await page.locator('#BCR_protein').fill(p);
    await page.locator('#BCR_creatinine').fill(cr);
    await result(page, { raw });
  }
  await page.locator('#BCR_protein').fill('1e-300');
  await page.locator('#BCR_creatinine').fill('1e100');
  await blocked(page);
  await kliknij(mode(page, true));
  for (const invalid of ['-1', '<0', '1e309', '1e-400']) {
    await page.locator('#BCR_reportedValue').fill(invalid);
    await blocked(page);
  }
});

test('B/Cr: gotowe mg/mg, mg/g i mg/mmol ocenia się po dokładnym przeliczeniu', async ({ page }) => {
  await open(page);
  await restore(page, { age: '18', BCR_inputMode: 'direct' });
  for (const [value, unit, raw, status] of [['.15', 'mg/mg', .15, 'high'], ['150', 'mg/g', .15, 'high'], ['149.99999999999999', 'mg/g', Number('.14999999999999999'), 'normal'], ['16.968', 'mg/mmol', .15, 'high'], ['16.967999999999999', 'mg/mmol', Number('16.967999999999999') / 113.12, 'normal']]) {
    await page.locator('#BCR_reportedUnit').selectOption(unit);
    await page.locator('#BCR_reportedValue').fill(value);
    await result(page, { raw, status, reference: { low: null, high: .15, upperInclusive: false } });
  }
});

test('B/Cr: własne stężenia i kontekst nie przejmują starej masy białka, PCR ani Pᵢ/Cr', async ({ page }) => {
  await open(page);
  await restore(page, { U_Prot: '999', Ucr: '999', V24: '900', PICR_sameSpecimen: 'different', PICR_collectionHours: '8',
    BCR_collectionHours: '8', BCR_durationKnown: true, age: '10', sex: 'F' });
  const reference = { low: null, high: .334 };
  const baseline = await result(page, { status: 'normal', reference });
  expect(baseline.context.concentrationSameSpecimen).not.toBe('different');
  expect(baseline.context.collectionHours).toBe('8');
  for (const formula of ['PCR', 'Prot_mgkg', 'PO4_Cr']) {
    await choose(page, formula);
    await choose(page, FORMULA);
    await result(page, { status: 'normal', reference });
    await expect(page.locator('#BCR_protein')).toHaveValue('300');
    await expect(page.locator('#BCR_creatinine')).toHaveValue('100');
  }
  await restore(page, { BCR_sameSpecimen: 'different' });
  await blocked(page);
  await kliknij(mode(page, true));
  await page.locator('#BCR_reportedValue').fill('.3');
  const direct = await result(page);
  expect(direct.context.concentrationSameSpecimen).toBe('different');
  await restore(page, { age: '10', sex: 'F', BCR_collectionProblem: true });
  await result(page, { reference });
});

test('B/Cr: zero i nierówność zachowują dostępną normę bez pozornej oceny i punktu osi', async ({ page }) => {
  await open(page);
  await restore(page, { age: '10', sex: 'F', BCR_protein: '0' });
  await result(page, { raw: 0, reference: { low: null, high: .334 } });
  await expect(card(page).locator('.bcr-norm-axis')).toHaveCount(0);
  await kliknij(mode(page, true));
  await page.locator('#BCR_reportedValue').fill('≤0');
  const model = await result(page, { raw: 0, reference: { low: null, high: .334 } });
  expect(model).toMatchObject({ comparator: '≤', pointValue: null, exact: false });
  await expect(card(page).locator('.bcr-norm-axis')).toHaveCount(0);
});

test('B/Cr: cztery znaki nierówności zachowane w zapisie, Badaniach i bez punktów wykresu', async ({ page }) => {
  await open(page);
  await installMemoryVault(page);
  await restore(page, { BCR_inputMode: 'direct' });
  const saved = [];
  for (const operator of ['<', '≤', '>', '≥']) {
    const literal = operator + '.3';
    await page.locator('#BCR_reportedValue').fill(literal);
    const model = await result(page, { guest: false });
    expect(model).toMatchObject({ comparator: operator, pointValue: null, exact: false, input: { reportedValue: literal } });
    const [note] = await saveVisible(page, `2026-10-${21 + saved.length}`);
    saved.push(note);
  }
  const projected = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes).measurements, saved);
  expect(projected).toHaveLength(4);
  expect(new Set(projected.map(item => item.parameterKey))).toEqual(new Set(['clcr:B_Cr']));
  for (let index = 0; index < saved.length; index += 1) {
    const measurement = projected.find(item => item.noteId === saved[index].id);
    expect(measurement.displayValue).toContain(['<', '≤', '>', '≥'][index]);
    expect(measurement.outOfRange).toBe(null);
  }
  await page.locator('#clcrOpenBadaniaBtn').click();
  await showClcrResults(page, 'charts');
  await expect(clcrPoints(page)).toHaveCount(0);
  await showBadaniaView(page, 'table');
  for (const note of saved) await expect(clcrRow(page, note.id)).toHaveCount(1);
});

test('B/Cr: zapisany pacjent, małe raw i brak normy spójne w Badaniach, Notatkach, historii i wykresie', async ({ page }) => {
  await open(page);
  await restore(page, { BCR_protein: '.00001', BCR_creatinine: '100' });
  const tinyRaw = 1e-8;
  await result(page, { raw: tinyRaw });
  await installMemoryVault(page, { select: false });
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await selectPatient(page);
  await kliknij(page.locator('#clearBtn'));
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await restore(page, { BCR_protein: '.00001', BCR_creatinine: '100' });
  const model = await result(page, { raw: tinyRaw, guest: false });
  const [tiny] = await saveVisible(page, '2026-10-21');
  expect(tiny.labResult.valueNum).toBe(model.rawValue);
  await restore(page, { age: '6', sex: 'F' });
  await result(page, { guest: false });
  const [standard] = await saveVisible(page, '2026-10-22');
  const projected = await page.evaluate(notes => {
    const engine = window.VildaClcrProteinCreatinine;
    window.VildaClcrProteinCreatinine = new Proxy({}, { get() { return () => { throw Error('Frozen B/Cr must not reevaluate'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes); }
    finally { window.VildaClcrProteinCreatinine = engine; }
  }, [tiny, standard]);
  expect(new Set(projected.measurements.map(item => item.parameterKey))).toEqual(new Set(['clcr:B_Cr']));
  expect(projected.measurements.find(item => item.noteId === tiny.id)).toMatchObject({ valueNum: model.rawValue, norm: '', outOfRange: null });
  expect(projected.measurements.find(item => item.noteId === standard.id)).toMatchObject({ valueNum: STANDARD, norm: '', outOfRange: null });
  await page.locator('#clcrOpenHistoryBtn').click();
  for (const note of [tiny, standard]) await expect(page.locator(`#clcrPatientCard tr[data-note-id="${note.id}"]`)).toHaveCount(1);
  await page.locator('#cpcClose').click();
  await page.locator('#clcrOpenBadaniaBtn').click();
  await showClcrResults(page, 'charts');
  await expect(clcrPoints(page)).toHaveCount(2);
  expect(Number(await clcrPoint(page, tiny.id).getAttribute('data-value'))).toBe(model.rawValue);
  await page.locator('button[data-tab="notes"]').click();
  const notes = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]');
  await expect(notes).toHaveCount(2);
  for (const note of await notes.all()) await expect(note).not.toContainText('W zakresie');
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('B/Cr: zapis zamraża normę wieku i płci; jawna edycja zmienia ten sam pomiar i waliduje operandy', async ({ page }) => {
  await open(page);
  await installMemoryVault(page);
  await restore(page, { age: '10', sex: 'F' });
  await result(page, { guest: false, status: 'normal', reference: { low: null, high: .334 } });
  const [original] = await saveVisible(page, '2026-10-23');
  await restore(page, { age: '18', sex: 'M' });
  await result(page, { guest: false, status: 'high', reference: { low: null, high: .15 } });
  const frozen = await page.evaluate(note => {
    const engine = window.VildaClcrProteinCreatinine;
    window.VildaClcrProteinCreatinine = new Proxy({}, { get() { return () => { throw Error('Read must use frozen B/Cr'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes([note]).measurements[0]; }
    finally { window.VildaClcrProteinCreatinine = engine; }
  }, original);
  expect(frozen.valueNum).toBe(STANDARD);
  expect(frozen.outOfRange).toBe(false);
  expect(frozen.norm).toContain('0,334');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), original);
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editField-BCR_protein')).toHaveValue('300');
  await expect(page.locator('#editField-BCR_creatinine')).toHaveValue('100');
  for (const [p, cr] of [['-1', '2'], ['300', '-1'], ['-1', '-1'], ['300', '0']]) {
    await page.locator('#editField-BCR_protein').fill(p);
    await page.locator('#editField-BCR_creatinine').fill(cr);
    await page.locator('#saveEditedMeasurement').click();
    await expect(page.locator('#editDialog')).toBeVisible();
    expect((await memory(page)).updates).toHaveLength(0);
  }
  await page.locator('#editField-BCR_protein').fill('600');
  await page.locator('#editField-BCR_creatinine').fill('100');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const stored = await memory(page), edited = stored.notes.find(note => note.id === original.id);
  expect(stored.notes).toHaveLength(1);
  expect(edited.id).toBe(original.id);
  expect(edited.labResult.valueNum).toBe(.6);
  const revised = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], edited);
  expect(revised.norm).toContain('0,334');
  expect(revised.outOfRange).toBe(true);
  await page.locator('#deleteMeasurement').click();
  await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).toBeHidden();
  expect((await memory(page)).notes).toEqual([]);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('B/Cr: Start i powrót zachowują pola; zmiana pacjenta wymaga nowego pomiaru', async ({ page }) => {
  const { calculator } = await openShellCalculator(page, { width: 390 });
  await restore(calculator, { BCR_inputMode: 'direct', BCR_reportedValue: '.3' });
  await result(calculator, { guest: false });
  await page.evaluate(() => { location.hash = '#/start'; });
  await shellFrame(page, 'Start');
  await page.evaluate(() => { location.hash = '#/klirens'; });
  await shellFrame(page, 'Kalkulator klirensu');
  await expect(calculator.locator('#BCR_reportedValue')).toHaveValue('.3');
  await result(calculator, { guest: false });
  await selectPatient(calculator, OTHER_PATIENT_ID);
  await expect(calculator.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect((await memory(calculator)).notes.filter(note => note.patientId === OTHER_PATIENT_ID)).toEqual([]);
  await kliknij(calculator.locator('#clearBtn'));
  await calculator.waitForFunction(() => window.clcrIsResetting !== true);
  await choose(calculator, FORMULA);
  await expect(page.locator('#BCR_protein')).toHaveCount(0); // form lives in the calculator iframe
  await expect(calculator.locator('#BCR_protein')).toHaveValue('');
  await expect(calculator.locator('#BCR_creatinine')).toHaveValue('');
  await expect(calculator.locator('#BCR_reportedValue')).toHaveValue('');
  await blocked(calculator);
});

test('B/Cr: raport AI i Word zachowują mg/mg, brak normy i pełny wykładnik potęgi', async ({ page }) => {
  await open(page);
  await restore(page);
  await result(page);
  await page.evaluate(() => {
    window.__bcrClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__bcrClipboard = value; } } });
    window.alert = () => {};
  });
  async function exports() {
    await page.locator('#askAI').click();
    const copy = await page.evaluate(() => window.__bcrClipboard);
    const pending = page.waitForEvent('download');
    await page.locator('#downloadDOCX').click();
    const download = await pending, html = await fs.readFile(await download.path(), 'utf8');
    const word = await page.evaluate(source => new DOMParser().parseFromString(source, 'text/html').body.textContent, html);
    return [copy, word];
  }
  for (const text of await exports()) {
    expect(text.replace(/\s/g, '')).toContain('0,3');
    expect(text).toContain('mg/mg');
    expect(text).toContain('Brak dobranej normy');
    expect(text).not.toContain('W zakresie laboratoryjnym');
  }
  await kliknij(mode(page, true));
  await page.locator('#BCR_reportedValue').fill('1.7976931348623157e308');
  const model = await result(page, { raw: Number.MAX_VALUE });
  await expect(card(page).locator('.clcr-result-value')).toHaveAttribute('data-scientific', 'true');
  await expect(card(page).locator('.clcr-result-value')).toHaveAttribute('aria-label', model.display.text);
  for (const text of await exports()) {
    expect(text).toContain(model.display.text);
    expect(text).not.toMatch(/×\s*10308/);
  }
});

test('B/Cr: historyczne U_Prot to masa całej zbiórki; odczyt zamrożony, edycja zachowuje trzy oryginalne dane', async ({ page }) => {
  await open(page);
  await installMemoryVault(page);
  const originals = await page.evaluate(() => {
    const api = window.ClcrSavedCalculation, patientId = window.ClcrVisitSave.resolveCurrentPatientId();
    const make = (id, raw, display, p, cr, volume, date) => {
      const values = { U_Prot: p, Ucr: cr, V24: volume, age: '', sex: '' };
      const point = { id: 'B_Cr', sourceFormulaId: 'B_Cr', label: 'Białko/kreatynina (B/Cr, DZM)', rawValue: raw, valueNum: raw,
        displayValue: display, unit: 'mg/mg', norm: '', tone: 'neutral', outOfRange: false };
      const capture = api.createSnapshot(point, { capture: { formulaId: 'B_Cr', values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })) }, clinicalDateISO: date });
      const note = { id, patientId, category: 'wynik-klirens', rev: 1, title: point.label, clinicalDateISO: date,
        body: 'Kalkulator klirensu · clcr:B_Cr', labResult: { test: point.label, value: display, valueNum: display === '0.000' ? 0 : raw, unit: 'mg/mg', norm: '' } };
      note.body += '\n\n' + api.serializeSnapshot(capture, note);
      if (!api.readSaved(note).valid) throw Error('Fictional historical B/Cr must round-trip');
      return note;
    };
    const notes = [make('fictional-bcr-legacy', .3, '0.300', '450', '100', '1500', '2025-10-21'),
      make('fictional-bcr-raw-tiny', 1e-8, '0.000', '.00001', '100', '1000', '2025-10-22')];
    window.__clcrRecordFixture.seed(notes); return notes;
  });
  const frozen = await page.evaluate(notes => {
    const engine = window.VildaClcrProteinCreatinine;
    window.VildaClcrProteinCreatinine = new Proxy({}, { get() { return () => { throw Error('Legacy B/Cr read must not reevaluate'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; }
    finally { window.VildaClcrProteinCreatinine = engine; }
  }, originals);
  expect(frozen.find(item => item.noteId === originals[0].id)).toMatchObject({ valueNum: .3, outOfRange: null, norm: '', parameterKey: 'clcr:B_Cr' });
  expect(frozen.find(item => item.noteId === originals[1].id)).toMatchObject({ valueNum: 1e-8, outOfRange: null, norm: '' });
  expect((await memory(page)).notes).toEqual(originals);
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), originals[0]);
  await expect(page.locator('#detailsDialog .clcr-record-value')).toContainText('0,3');
  await expect(page.locator('#detailsDialog')).not.toContainText('W zakresie');
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editField-U_Prot')).toHaveValue('450');
  await expect(page.locator('#editField-Ucr')).toHaveValue('100');
  await expect(page.locator('#editField-V24')).toHaveValue('1500');
  await expect(page.locator('#editField-BCR_protein')).toHaveCount(0);
  for (const [p, cr, volume] of [['-450', '100', '1500'], ['450', '-100', '1500'], ['-450', '-100', '1500'], ['450', '100', '0']]) {
    await page.locator('#editField-U_Prot').fill(p);
    await page.locator('#editField-Ucr').fill(cr);
    await page.locator('#editField-V24').fill(volume);
    await page.locator('#saveEditedMeasurement').click();
    await expect(page.locator('#editDialog')).toBeVisible();
    expect((await memory(page)).updates).toHaveLength(0);
  }
  await page.locator('#editField-U_Prot').fill('225');
  await page.locator('#editField-Ucr').fill('100');
  await page.locator('#editField-V24').fill('1500');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const stored = await memory(page), edited = stored.notes.find(note => note.id === originals[0].id);
  expect(edited.labResult.valueNum).toBe(.15);
  expect(edited.id).toBe(originals[0].id);
  expect(stored.notes.find(note => note.id === originals[1].id)).toEqual(originals[1]);
});

test('B/Cr: pierwsze kliknięcie Szczegółów po wpisaniu wartości działa w obu trybach', async ({ page }) => {
  await open(page, 390);
  await restore(page, { BCR_protein: '', BCR_creatinine: '100' });
  await page.locator('#BCR_protein').fill('300');
  await result(page);
  await kliknij(details(page).locator('summary'));
  await expect(details(page)).toHaveAttribute('open', '');
  await kliknij(details(page).locator('summary'));
  await expect(details(page)).not.toHaveAttribute('open', '');
  await kliknij(mode(page, true));
  await page.locator('#BCR_reportedValue').fill('.3');
  await result(page);
  await kliknij(details(page).locator('summary'));
  await expect(details(page)).toHaveAttribute('open', '');
  await page.evaluate(() => {
    const control = document.getElementById('BCR_reportedValue');
    control.value = '.7'; control.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await result(page, { raw: .7 });
  await expect(details(page)).toHaveAttribute('open', '');
});

test('B/Cr: przywrócenie dawnej sesji zachowuje dokładną masę, przecinek i objętość bez pozornego stężenia', async ({ page }) => {
  await open(page, 390);
  const legacy = { U_Prot: '000450,000000000000001', V24: '1700.000', Ucr: '100.00', age: '', sex: '' };
  expect(await page.evaluate(inputs => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'advanced', selectedFormula: 'B_Cr', inputs: { currentVersion: 'advanced', formulaPicker: 'B_Cr', ...inputs },
  }, { source: 'e2e-bcr-legacy-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true }), legacy)).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'B_Cr' && window.clcrIsResetting !== true);
  await expect(page.locator('#BCR_inputMode')).toHaveValue('legacy');
  for (const [id, literal] of Object.entries(legacy).filter(([id]) => ['U_Prot', 'V24', 'Ucr'].includes(id))) {
    await expect(page.locator('#' + id)).toHaveValue(literal);
    await expect(page.locator('#' + id)).toBeVisible();
  }
  const model = await result(page, { raw: 450 / 1700 });
  expect(model.exactValue).toEqual({ numerator: '450000000000000001', denominator: '1700000000000000000' });
  await expect(page.locator('#BCR_protein')).toBeHidden();
  await expect(inputCard(page)).toContainText('mg');
  const before = await inputCard(page).boundingBox();
  await kliknij(mode(page));
  await expect(page.locator('#BCR_inputMode')).toHaveValue('concentration');
  await expect(page.locator('#BCR_protein')).toHaveValue('');
  await expect(page.locator('#BCR_creatinine')).toHaveValue('');
  await expect(page.locator('#U_Prot')).toHaveValue(legacy.U_Prot);
  await expect(page.locator('#V24')).toHaveValue(legacy.V24);
  await blocked(page);
  const after = await inputCard(page).boundingBox();
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(.5);
});

test('B/Cr: licznik 2/1/3 obejmuje tylko poprawne dane wzoru i nie dodaje pytań o normę', async ({ page }, testInfo) => {
  await open(page, 320);
  await restore(page, { BCR_protein: '', BCR_creatinine: '' });
  const count = page.locator('#bcrRequiredCount');
  await expect(count).toHaveText('0/2');
  await page.locator('#BCR_protein').fill('0');
  await expect(count).toHaveText('1/2');
  await page.locator('#BCR_creatinine').fill('-1');
  await expect(count).toHaveText('1/2');
  await page.locator('#BCR_creatinine').fill('100');
  await expect(count).toHaveText('2/2');
  await result(page, { raw: 0 });
  await expect(inputCard(page)).not.toContainText('Do pełnej interpretacji');
  const before = await geometry(page, 320);
  await restore(page, { BCR_protein: '300', age: '10', sex: 'F' });
  await expect(count).toHaveText('2/2');
  await result(page, { status: 'normal', reference: { low: null, high: .334 } });
  sameWidths(before, await geometry(page, 320));
  await screenshot(page, testInfo, 'bcr-ready-concentration-320');
  await kliknij(mode(page, true));
  await expect(count).toHaveText('0/1');
  await page.locator('#BCR_reportedValue').fill('<0');
  await expect(count).toHaveText('0/1');
  await page.locator('#BCR_reportedValue').fill('≤0');
  await expect(count).toHaveText('1/1');
  await result(page, { raw: 0, reference: { low: null, high: .334 } });
  sameWidths(before, await geometry(page, 320));
  await screenshot(page, testInfo, 'bcr-ready-direct-320');
  const readinessBox = await inputCard(page).locator('.bcr-readiness').boundingBox();
  const countBox = await count.boundingBox();
  expect(countBox.x).toBeGreaterThanOrEqual(readinessBox.x);
  expect(countBox.x + countBox.width).toBeLessThanOrEqual(readinessBox.x + readinessBox.width);
  const labelBox = await inputCard(page).locator('.bcr-readiness > span').boundingBox();
  expect(countBox.x - (labelBox.x + labelBox.width)).toBeGreaterThanOrEqual(8);
  expect(await page.evaluate(() => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'advanced', selectedFormula: 'B_Cr', inputs: {
      currentVersion: 'advanced', formulaPicker: 'B_Cr', U_Prot: '450', Ucr: '100', V24: '', age: '', sex: '',
    },
  }, { source: 'e2e-bcr-readiness-legacy-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true }))).toBe(true);
  await expect(page.locator('#BCR_inputMode')).toHaveValue('legacy');
  await expect(count).toHaveText('2/3');
  await page.locator('#V24').fill('1500');
  await expect(count).toHaveText('3/3');
  await result(page);
  await screenshot(page, testInfo, 'bcr-ready-legacy-320');
  await expect(inputCard(page)).not.toContainText('Do pełnej interpretacji');
});

test('B/Cr: zapis dorosłego pokazuje polski opis KDIGO w Notatkach i Szczegółach, zachowując techniczne ID w migawce', async ({ page }) => {
  await open(page);
  await installMemoryVault(page);
  await restore(page, { age: '18', BCR_inputMode: 'direct', BCR_reportedValue: '.3' });
  const model = await result(page, { guest: false, status: 'high', reference: { low: null, high: .15 } });
  expect(model.category.id).toBe('moderate');
  const [saved] = await saveVisible(page, '2026-10-25');
  await page.locator('#clcrOpenBadaniaBtn').click();
  await page.locator('button[data-tab="notes"]').click();
  const note = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]');
  await expect(note).toHaveCount(1);
  await expect(note).toContainText('Umiarkowanie zwiększony');
  await expect(note).not.toContainText(/normal-mild|moderate|severe/);
  await page.evaluate(item => window.ClcrResultDetails.open({ patientId: item.patientId, noteId: item.id }), saved);
  await expect(page.locator('#detailsDialog')).toContainText('Umiarkowanie zwiększony');
  await expect(page.locator('#detailsDialog')).not.toContainText(/normal-mild|moderate|severe/);
});
