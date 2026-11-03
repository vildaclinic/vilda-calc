import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, prepareBrowser, saveVisible, selectPatient, OTHER_PATIENT_ID, openShellCalculator, shellFrame } from '../support/klirens-patient-record.mjs';

// Fictional values. Only encrypted I/O is replaced by the explicit memory vault;
// all clinical calculations, DOM events, serializers, readers and editors are real.
const FORMULA = 'PO4_Cr';
const STANDARD = 0.4107199699169024;
const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="PO4_Cr"]');
const inputCard = page => page.locator('#picrInputCard');
const details = page => page.locator('#clcrResultReport .clcr-result-details[data-clcr-formula="PO4_Cr"]');
const mode = (page, direct = false) => inputCard(page).locator(`button[data-picr-mode="${direct ? 'direct' : 'concentration'}"]`);
const BASE = Object.freeze({
  currentVersion: 'advanced', formulaPicker: FORMULA,
  age: '', ageMonths: '', ageDays: '', sex: '', height: '', weight: '',
  PICR_inputMode: 'concentration', PICR_phosphorus: '15', PICR_phosphorusUnit: 'mmol/L',
  PICR_creatinine: '10', PICR_creatinineUnit: 'mmol/L', PICR_reportedValue: '', PICR_reportedUnit: 'mg/mg',
  PICR_sameSpecimen: '', PICR_collectionProblem: false, PICR_collectionHours: '', PICR_durationKnown: false,
  U_PO4: '', U_Ca: '', Ucr: '', V24: '', collectionStartAt: '', collectionEndAt: '', Cl24DurationHours: '',
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
  await page.waitForFunction(() => typeof window.VildaClcrPhosphorusCreatinine?.evaluate === 'function' && Boolean(window.ClcrPhosphorusCreatinineUi));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

async function restore(page, fields = {}) {
  expect(await page.evaluate(({ base, fields }) => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'advanced', selectedFormula: 'PO4_Cr', inputs: { ...base, ...fields },
  }, { source: 'e2e-phosphorus-creatinine-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true }), { base: BASE, fields })).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'PO4_Cr' &&
    document.getElementById('formulaPicker').value === 'PO4_Cr' && window.clcrIsResetting !== true);
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
  const snapshot = JSON.parse(await card(page).getAttribute('data-clcr-phosphorus-creatinine-snapshot'));
  expect(snapshot).toMatchObject({ schema: 'clcr-phosphorus-creatinine', valid: true, status, unit: 'mg/mg',
    referenceAvailable: Boolean(reference), outOfRange: status === 'normal' ? false : status === 'unassessed' ? null : true });
  if (reference) expect(snapshot.reference).toMatchObject(reference);
  else expect(snapshot.reference).toBe(null);
  expect(Number.isFinite(snapshot.rawValue)).toBe(true);
  if (raw === 0) expect(snapshot.rawValue).toBe(0);
  else expect(Math.abs(snapshot.rawValue / raw - 1)).toBeLessThan(2e-14);
  expect(Number(await card(page).getAttribute('data-clcr-value'))).toBe(snapshot.rawValue);
  expect(await page.evaluate(() => window.canComputeFormula('PO4_Cr'))).toBe(true);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('PO4_Cr').valueReady)).toBe(true);
  if (guest) {
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  }
  return snapshot;
}

async function blocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('PO4_Cr'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('PO4_Cr').valueReady)).toBe(false);
  expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'PO4_Cr' }))).toEqual([]);
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
      form: box('#clcrForm'), active: box('#clcrActivePanel'), input: box('#picrInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      inputStep: box('#clcrActivePanel .clcr-step-number'), resultStep: box('#clcrResultTitle .clcr-step-number'),
      inputMode: document.getElementById('PICR_inputMode').value,
      resultUnits: [...document.querySelectorAll('#clcrResultReport [data-clcr-series="PO4_Cr"] .clcr-result-unit,#clcrResultReport [data-clcr-series="PO4_Cr"] .clcr-result-reference-unit')].map(node => node.getBoundingClientRect().top),
      modeButtons: [...document.querySelectorAll('#picrInputCard .picr-input-mode button')].map(button => {
        const style = getComputedStyle(button);
        return { mode: button.getAttribute('data-picr-mode'), pressed: button.getAttribute('aria-pressed'),
          background: style.backgroundColor, color: style.color };
      }),
      controls: [...document.querySelectorAll('#picrInputCard input,#picrInputCard select,#picrInputCard button')]
        .filter(node => node.checkVisibility()).map(node => ({ id: node.id || node.textContent.trim(), kind: node.tagName,
          valueControl: node.tagName !== 'BUTTON' || node.hasAttribute('data-picr-mode'),
          height: node.getBoundingClientRect().height, font: parseFloat(getComputedStyle(node).fontSize),
          left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })),
      inputPairs: [...document.querySelectorAll('#picrInputCard .picr-value-row')]
        .filter(row => row.checkVisibility()).map(row => {
          const input = row.querySelector('input'), unit = row.querySelector('select');
          const inputRect = input.getBoundingClientRect(), unitRect = unit.getBoundingClientRect();
          return { inputId: input.id, unitId: unit.id,
            inputTop: inputRect.top, inputBottom: inputRect.bottom,
            unitTop: unitRect.top, unitBottom: unitRect.bottom };
        }),
      mainFont: parseFloat(getComputedStyle(document.querySelector('#picrInputCard')).fontSize),
      numbers: [...document.querySelectorAll('#clcrResultReport [data-clcr-series="PO4_Cr"] .clcr-result-value,#clcrResultReport [data-clcr-series="PO4_Cr"] .clcr-result-reference-value')].map(node => {
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

test('Pᵢ/Cr: wybór formuły zamyka wyszukiwanie i prowadzi do dwóch brakujących stężeń', async ({ page }) => {
  await open(page, 390);
  await restore(page, { PICR_phosphorus: '', PICR_creatinine: '' });
  await choose(page, 'Ca_Cr');
  await page.evaluate(() => scrollTo(0, 0));
  const search = page.locator('#formulaSearch'), list = page.locator('#formulaLive');
  await expect(list).toBeHidden();
  await search.fill('Pᵢ/Cr');
  await expect(list.locator('[data-formula-id="PO4_Cr"]')).toBeVisible();
  await page.locator('.clcr-workflow__title').click();
  await expect(list).toBeHidden();
  await search.click();
  await list.locator('[data-formula-id="PO4_Cr"]').click();
  await expect(list).toBeHidden();
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.selectionGuidance.lastFormula === 'PO4_Cr' &&
    window.ClcrUiWorkflow.state.selectionGuidance.lastTarget === 'PICR_phosphorus');
  await expect(page.locator('#PICR_phosphorus')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#PICR_creatinine')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#PICR_phosphorus')).toBeInViewport();
  await blocked(page);
});

for (const width of [1440, 390, 320]) {
  test(`Pᵢ/Cr ${width}px: dwa stężenia, jedna karta, wyrównanie i stałe szerokości`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page, width);
    await restore(page, { PICR_phosphorus: '', PICR_creatinine: '' });
    await blocked(page);
    await expect(inputCard(page).locator('input:visible')).toHaveCount(2);
    await expect(inputCard(page).locator('select:visible')).toHaveCount(2);
    await expect(inputCard(page).locator('.clcr-info-button:visible')).toHaveCount(0);
    await expect(page.locator('#age,#sex,#weight,#height,#U_PO4,#Ucr,#V24,#collectionStartAt,#collectionEndAt').filter({ visible: true })).toHaveCount(0);
    await expect(page.locator('#PICR_phosphorusUnit')).toHaveValue('mmol/L');
    await expect(page.locator('#PICR_creatinineUnit')).toHaveValue('mmol/L');
    await page.locator('#PICR_phosphorus').fill('15');
    await blocked(page);
    await page.locator('#PICR_creatinine').fill('10');
    const model = await result(page);
    expect(model.exactValue).toMatchObject({ numerator: '46460642997', denominator: '113120000000' });
    const initial = await geometry(page, width);
    await screenshot(page, testInfo, `picr-concentration-${width}`);
    await page.locator('#PICR_creatinine').fill('0');
    await blocked(page);
    sameWidths(initial, await geometry(page, width));
    await kliknij(mode(page, true));
    await expect(inputCard(page).locator('input:visible')).toHaveCount(1);
    await expect(inputCard(page).locator('select:visible')).toHaveCount(1);
    expect(await page.locator('#PICR_reportedUnit option:not([hidden])').allTextContents()).toEqual(['mg/mg', 'mg/g', 'mmol/mmol']);
    await page.locator('#PICR_reportedValue').fill('0.5');
    await result(page, { raw: 0.5 });
    sameWidths(initial, await geometry(page, width));
    await restore(page, { age: '10', sex: 'F', PICR_inputMode: 'direct', PICR_reportedValue: '.5' });
    await result(page, { raw: .5, status: 'normal', reference: { low: .142, high: 1.321 } });
    sameWidths(initial, await geometry(page, width));
    await screenshot(page, testInfo, `picr-normal-${width}`);
    await page.locator('#PICR_reportedValue').fill('2');
    await result(page, { raw: 2, status: 'high', reference: { low: .142, high: 1.321 } });
    sameWidths(initial, await geometry(page, width));
    await screenshot(page, testInfo, `picr-high-${width}`);
    if (!await details(page).evaluate(node => node.open)) await kliknij(details(page).locator('summary'));
    await expect(details(page)).toHaveAttribute('open', '');
    sameWidths(initial, await geometry(page, width));
    await expect(details(page)).toHaveAttribute('open', '');
    await screenshot(page, testInfo, `picr-details-${width}`);
    await kliknij(details(page).locator('summary'));
    await restore(page, { PICR_inputMode: 'direct', PICR_reportedValue: '.5' });
    for (const family of ['Arial', 'DejaVu Sans', 'Liberation Sans']) {
      await page.addStyleTag({ content: `#picrInputCard,#picrInputCard *,#clcrResultReport,#clcrResultReport * { font-family: "${family}", sans-serif !important; }` });
      for (const extreme of ['1.7976931348623157e308', '1e-300']) {
        await page.locator('#PICR_reportedValue').fill(extreme);
        await result(page, { raw: Number(extreme) });
        sameWidths(initial, await geometry(page, width));
      }
    }
    await screenshot(page, testInfo, `picr-extreme-${width}`);
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await choose(page, FORMULA);
    await expect(page.locator('#PICR_phosphorus')).toHaveValue('');
    await expect(page.locator('#PICR_creatinine')).toHaveValue('');
    await blocked(page);
    expect(errors).toEqual([]);
  });
}

// Four independent tests retain all 16 physical equivalences and the normal
// 60-second budget. The oracle is the elemental P and creatinine molar masses.
for (const [pUnit, p] of [['mmol/L', '1'], ['µmol/L', '1000'], ['mg P/L', '30.973761998'], ['mg P/dL', '3.0973761998']]) {
  test(`Pᵢ/Cr: fosfor ${pUnit} i cztery jednostki kreatyniny`, async ({ page }) => {
    await open(page);
    await restore(page);
    for (const [crUnit, cr] of [['mmol/L', '1'], ['µmol/L', '1000'], ['mg/L', '113.12'], ['mg/dL', '11.312']]) {
      await page.locator('#PICR_phosphorusUnit').selectOption(pUnit);
      await page.locator('#PICR_creatinineUnit').selectOption(crUnit);
      await page.locator('#PICR_phosphorus').fill(p);
      await page.locator('#PICR_creatinine').fill(cr);
      await result(page, { raw: 0.27381331327793496 });
      if (pUnit.startsWith('mg')) await expect(page.locator('#picrMassHint')).toBeVisible();
      else await expect(page.locator('#picrMassHint')).toBeHidden();
    }
  });
}

for (const [age, sex, low, high] of [
  ['7', 'M', .165, 1.682], ['7', 'F', .153, 1.443],
  ['10', 'M', .144, 1.234], ['10', 'F', .142, 1.321],
  ['13', 'M', .101, 1.134], ['13', 'F', .081, .930],
  ['16', 'M', .068, .874], ['16', 'F', .058, .846],
]) {
  test(`Pᵢ/Cr: ARUP ${age} lat ${sex} — obie granice włączone i odchylenia`, async ({ page }) => {
    await open(page);
    await restore(page, { age, sex, PICR_inputMode: 'direct' });
    let referenceColors;
    for (const [value, status] of [[low - .00001, 'low'], [low, 'normal'], [high, 'normal'], [high + .00001, 'high']]) {
      await page.locator('#PICR_reportedValue').fill(String(value));
      await result(page, { raw: value, status, reference: { low, high, lowerInclusive: true, upperInclusive: true } });
      await expect(card(page)).toContainText('ARUP');
      const colors = await card(page).evaluate(node => ({
        value: getComputedStyle(node.querySelector('.clcr-result-value')).color,
        reference: getComputedStyle(node.querySelector('.clcr-result-reference-value')).color,
        unit: getComputedStyle(node.querySelector('.clcr-result-reference-unit')).color,
      }));
      if (status !== 'normal') { expect(colors.reference).not.toBe(colors.value); expect(colors.unit).not.toBe(colors.value); }
      if (referenceColors) expect([colors.reference, colors.unit]).toEqual(referenceColors);
      else referenceColors = [colors.reference, colors.unit];
    }
    await kliknij(details(page).locator('summary'));
    await expect(details(page).locator('.picr-reference-cell--active')).toHaveCount(1);
    await expect(details(page).locator('.picr-reference-cell--active')).toContainText(String(low).replace('.', ','));
  });
}

test('Pᵢ/Cr: źródło zmienia się dokładnie w 18 urodziny; dorosły mężczyzna ma <0,75 bez dolnej granicy', async ({ page }) => {
  await open(page);
  await restore(page, { age: '17', ageMonths: '11', ageDays: '29', sex: 'M', PICR_inputMode: 'direct', PICR_reportedValue: '.75' });
  await result(page, { raw: .75, status: 'normal', reference: { low: .068, high: .874 } });
  await restore(page, { age: '18', sex: 'M', PICR_inputMode: 'direct', PICR_reportedValue: '.75' });
  await result(page, { raw: .75, status: 'high', reference: { low: null, high: .75, upperInclusive: false } });
  await expect(card(page)).toContainText('Mayo');
  await page.locator('#PICR_reportedValue').fill('.7499999999999999');
  await result(page, { raw: .7499999999999999, status: 'normal', reference: { low: null, high: .75, upperInclusive: false } });
  await page.locator('#PICR_reportedValue').fill('1e-300');
  await result(page, { raw: 1e-300, status: 'normal', reference: { low: null, high: .75 } });
});

test('Pᵢ/Cr: brak wieku, właściwej płci lub profilu pozostawia liczbę bez oceny', async ({ page }) => {
  await open(page);
  for (const [age, sex] of [['', ''], ['6', 'M'], ['10', ''], ['18', 'F'], ['75', 'F']]) {
    await restore(page, { age, sex });
    await result(page);
    await expect(card(page)).not.toContainText('W zakresie');
  }
});

test('Pᵢ/Cr: zero fosforu, ujemne operandy i skrajne liczby nie tworzą pozornego prawidłowego zera', async ({ page }) => {
  await open(page);
  await restore(page);
  for (const [p, cr] of [['-1', '2'], ['15', '-1'], ['-1', '-1'], ['15', '0'], ['', '2'], ['15', '']]) {
    await page.locator('#PICR_phosphorus').fill(p);
    await page.locator('#PICR_creatinine').fill(cr);
    await blocked(page);
  }
  for (const [p, cr, raw] of [['0', '2', 0], ['0.00001', '1', 2.7381331327793495e-6], ['1e308', '1e308', .27381331327793496]]) {
    await page.locator('#PICR_phosphorus').fill(p);
    await page.locator('#PICR_creatinine').fill(cr);
    await result(page, { raw });
  }
  await page.locator('#PICR_phosphorus').fill('1e-300');
  await page.locator('#PICR_creatinine').fill('1e100');
  await blocked(page);
  await kliknij(mode(page, true));
  for (const invalid of ['-1', '<0', '1e309', '1e-400']) {
    await page.locator('#PICR_reportedValue').fill(invalid);
    await blocked(page);
  }
});

test('Pᵢ/Cr: gotowe jednostki przeliczają się do mg/mg przed dokładnym porównaniem z normą', async ({ page }) => {
  await open(page);
  await restore(page, { age: '18', sex: 'M', PICR_inputMode: 'direct' });
  for (const [value, unit, raw, status] of [['.75', 'mg/mg', .75, 'high'], ['750', 'mg/g', .75, 'high'], ['749.9999999999999', 'mg/g', .7499999999999999, 'normal'], ['1', 'mmol/mmol', .27381331327793496, 'normal']]) {
    await page.locator('#PICR_reportedUnit').selectOption(unit);
    await page.locator('#PICR_reportedValue').fill(value);
    await result(page, { raw, status, reference: { low: null, high: .75, upperInclusive: false } });
  }
});

test('Pᵢ/Cr: własne stężenia i kontekst nie przejmują Ca/Cr, Mg/Ca ani dobowej ilości fosforu', async ({ page }) => {
  await open(page);
  await restore(page, { U_PO4: '999', Ucr: '999', V24: '900', CACR_DZM_sameSpecimen: 'different', CACR_DZM_collectionHours: '8',
    MGCA_magnesium: '999', MGCA_calcium: '999', PICR_collectionHours: '8', PICR_durationKnown: true,
    age: '10', sex: 'F' });
  const reference = { low: .142, high: 1.321 };
  const baseline = await result(page, { status: 'normal', reference });
  expect(baseline.context.concentrationSameSpecimen).not.toBe('different');
  expect(baseline.context.collectionHours).toBe('8');
  for (const formula of ['Ca_Cr', 'Mg_Ca', 'PO4_mgkg']) {
    await choose(page, formula);
    await choose(page, FORMULA);
    await result(page, { status: 'normal', reference });
    await expect(page.locator('#PICR_phosphorus')).toHaveValue('15');
    await expect(page.locator('#PICR_creatinine')).toHaveValue('10');
  }
  await restore(page, { PICR_sameSpecimen: 'different' });
  await blocked(page);
  await kliknij(mode(page, true));
  await page.locator('#PICR_reportedValue').fill('.5');
  const direct = await result(page, { raw: .5 });
  expect(direct.context.concentrationSameSpecimen).toBe('different');
});

test('Pᵢ/Cr: zero i nierówność zachowują dostępną normę bez pozornej oceny', async ({ page }) => {
  await open(page);
  await restore(page, { age: '10', sex: 'F', PICR_phosphorus: '0' });
  await result(page, { raw: 0, reference: { low: .142, high: 1.321 } });
  await expect(card(page).locator('.picr-norm-axis')).toHaveCount(0);
  await kliknij(mode(page, true));
  await page.locator('#PICR_reportedValue').fill('≤0');
  const model = await result(page, { raw: 0, reference: { low: .142, high: 1.321 } });
  expect(model).toMatchObject({ comparator: '≤', pointValue: null, exact: false });
  await expect(card(page).locator('.picr-norm-axis')).toHaveCount(0);
});

test('Pᵢ/Cr: cztery znaki nierówności zachowane w zapisie, Badaniach i bez punktów wykresu', async ({ page }) => {
  await open(page);
  await installMemoryVault(page);
  await restore(page, { PICR_inputMode: 'direct' });
  const saved = [];
  for (const operator of ['<', '≤', '>', '≥']) {
    const literal = operator + '.5';
    await page.locator('#PICR_reportedValue').fill(literal);
    const model = await result(page, { raw: .5, guest: false });
    expect(model).toMatchObject({ comparator: operator, pointValue: null, exact: false, input: { reportedValue: literal } });
    const [note] = await saveVisible(page, `2026-10-${21 + saved.length}`);
    saved.push(note);
  }
  const projected = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes).measurements, saved);
  expect(projected).toHaveLength(4);
  expect(new Set(projected.map(item => item.parameterKey))).toEqual(new Set(['clcr:PO4_Cr']));
  for (let index = 0; index < saved.length; index += 1) {
    const measurement = projected.find(item => item.noteId === saved[index].id);
    expect(measurement.displayValue).toContain(['<', '≤', '>', '≥'][index]);
    expect(measurement.outOfRange).toBe(null);
  }
  await page.locator('#clcrOpenBadaniaBtn').click();
  await expect(page.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-point')).toHaveCount(0);
  for (const note of saved) await expect(page.locator(`.vilda-lab-hist-panel[data-panel="renal"] tr[data-note-id="${note.id}"]`)).toHaveCount(1);
});

test('Pᵢ/Cr: zapisany pacjent, dokładne małe raw i brak normy spójne w Badaniach, Notatkach, historii i wykresie', async ({ page }) => {
  await open(page);
  await restore(page, { PICR_phosphorus: '.00001', PICR_creatinine: '1' });
  const tinyRaw = 2.7381331327793495e-6;
  await result(page, { raw: tinyRaw });
  await installMemoryVault(page, { select: false });
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await selectPatient(page);
  await kliknij(page.locator('#clearBtn'));
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await restore(page, { PICR_phosphorus: '.00001', PICR_creatinine: '1' });
  const model = await result(page, { raw: tinyRaw, guest: false });
  const [tiny] = await saveVisible(page, '2026-10-21');
  expect(tiny.labResult.valueNum).toBe(model.rawValue);
  await restore(page, { age: '70', sex: 'F' });
  await result(page, { guest: false });
  const [standard] = await saveVisible(page, '2026-10-22');
  const projected = await page.evaluate(notes => {
    const engine = window.VildaClcrPhosphorusCreatinine;
    window.VildaClcrPhosphorusCreatinine = new Proxy({}, { get() { return () => { throw Error('Frozen P/Cr must not reevaluate'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes); }
    finally { window.VildaClcrPhosphorusCreatinine = engine; }
  }, [tiny, standard]);
  expect(new Set(projected.measurements.map(item => item.parameterKey))).toEqual(new Set(['clcr:PO4_Cr']));
  expect(projected.measurements.find(item => item.noteId === tiny.id)).toMatchObject({ valueNum: model.rawValue, norm: '', outOfRange: null });
  expect(projected.measurements.find(item => item.noteId === standard.id)).toMatchObject({ valueNum: STANDARD, norm: '', outOfRange: null });
  await page.locator('#clcrOpenHistoryBtn').click();
  for (const note of [tiny, standard]) await expect(page.locator(`#clcrPatientCard tr[data-note-id="${note.id}"]`)).toHaveCount(1);
  await page.locator('#cpcClose').click();
  await page.locator('#clcrOpenBadaniaBtn').click();
  await expect(page.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-point')).toHaveCount(2);
  expect(Number(await page.locator(`.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-point[data-note-id="${tiny.id}"]`).getAttribute('data-value'))).toBe(model.rawValue);
  await page.locator('button[data-tab="notes"]').click();
  const notes = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]');
  await expect(notes).toHaveCount(2);
  for (const note of await notes.all()) await expect(note).not.toContainText('W zakresie');
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Pᵢ/Cr: zapis zamraża normę historycznego wieku; jawna edycja zmienia ten sam pomiar i waliduje operandy', async ({ page }) => {
  await open(page);
  await installMemoryVault(page);
  await restore(page, { age: '10', sex: 'F' });
  await result(page, { guest: false, status: 'normal', reference: { low: .142, high: 1.321 } });
  const [original] = await saveVisible(page, '2026-10-23');
  await restore(page, { age: '18', sex: 'F' });
  await result(page, { guest: false });
  const frozen = await page.evaluate(note => {
    const engine = window.VildaClcrPhosphorusCreatinine;
    window.VildaClcrPhosphorusCreatinine = new Proxy({}, { get() { return () => { throw Error('Read must use frozen P/Cr'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes([note]).measurements[0]; }
    finally { window.VildaClcrPhosphorusCreatinine = engine; }
  }, original);
  expect(frozen.valueNum).toBe(STANDARD);
  expect(frozen.outOfRange).toBe(false);
  expect(frozen.norm).toContain('0,142');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), original);
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editField-PICR_phosphorus')).toHaveValue('15');
  await expect(page.locator('#editField-PICR_creatinine')).toHaveValue('10');
  for (const [p, cr] of [['-1', '2'], ['15', '-1'], ['-1', '-1'], ['15', '0']]) {
    await page.locator('#editField-PICR_phosphorus').fill(p);
    await page.locator('#editField-PICR_creatinine').fill(cr);
    await page.locator('#saveEditedMeasurement').click();
    await expect(page.locator('#editDialog')).toBeVisible();
    expect((await memory(page)).updates).toHaveLength(0);
  }
  await page.locator('#editField-PICR_phosphorus').fill('30');
  await page.locator('#editField-PICR_creatinine').fill('10');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const stored = await memory(page), edited = stored.notes.find(note => note.id === original.id);
  expect(stored.notes).toHaveLength(1);
  expect(edited.id).toBe(original.id);
  expect(edited.labResult.valueNum).toBeCloseTo(.8214399398338048, 14);
  const revised = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], edited);
  expect(revised.norm).toContain('0,142');
  expect(revised.outOfRange).toBe(false);
  await page.locator('#deleteMeasurement').click();
  await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).toBeHidden();
  expect((await memory(page)).notes).toEqual([]);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Pᵢ/Cr: Start i powrót zachowują pola; zmiana pacjenta wymaga nowego pomiaru', async ({ page }) => {
  const { calculator } = await openShellCalculator(page, { width: 390 });
  await restore(calculator, { PICR_inputMode: 'direct', PICR_reportedValue: '.5' });
  await result(calculator, { raw: .5, guest: false });
  await page.evaluate(() => { location.hash = '#/start'; });
  await shellFrame(page, 'Start');
  await page.evaluate(() => { location.hash = '#/klirens'; });
  await shellFrame(page, 'Kalkulator klirensu');
  await expect(calculator.locator('#PICR_reportedValue')).toHaveValue('.5');
  await result(calculator, { raw: .5, guest: false });
  await selectPatient(calculator, OTHER_PATIENT_ID);
  await expect(calculator.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect((await memory(calculator)).notes.filter(note => note.patientId === OTHER_PATIENT_ID)).toEqual([]);
  await kliknij(calculator.locator('#clearBtn'));
  await calculator.waitForFunction(() => window.clcrIsResetting !== true);
  await choose(calculator, FORMULA);
  await expect(calculator.locator('#PICR_phosphorus')).toHaveValue('');
  await expect(calculator.locator('#PICR_creatinine')).toHaveValue('');
  await expect(calculator.locator('#PICR_reportedValue')).toHaveValue('');
  await blocked(calculator);
});

test('Pᵢ/Cr: raport AI i Word zachowują mg/mg, brak normy i pełny wykładnik potęgi', async ({ page }) => {
  await open(page);
  await restore(page);
  await result(page);
  await page.evaluate(() => {
    window.__picrClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__picrClipboard = value; } } });
    window.alert = () => {};
  });
  async function exports() {
    await page.locator('#askAI').click();
    const copy = await page.evaluate(() => window.__picrClipboard);
    const pending = page.waitForEvent('download');
    await page.locator('#downloadDOCX').click();
    const download = await pending, html = await fs.readFile(await download.path(), 'utf8');
    const word = await page.evaluate(source => new DOMParser().parseFromString(source, 'text/html').body.textContent, html);
    return [copy, word];
  }
  for (const text of await exports()) {
    expect(text.replace(/\s/g, '')).toContain('0,4107');
    expect(text).toContain('mg/mg');
    expect(text).toContain('Brak dobranej normy');
    expect(text).not.toContain('W zakresie laboratoryjnym');
  }
  await kliknij(mode(page, true));
  await page.locator('#PICR_reportedValue').fill('1.7976931348623157e308');
  const model = await result(page, { raw: Number.MAX_VALUE });
  await expect(card(page).locator('.clcr-result-value')).toHaveAttribute('data-scientific', 'true');
  await expect(card(page).locator('.clcr-result-value')).toHaveAttribute('aria-label', model.display.text);
  for (const text of await exports()) {
    expect(text).toContain(model.display.text);
    expect(text).not.toMatch(/×\s*10308/);
  }
});

test('Pᵢ/Cr: historyczne mg P/dL i mg/dL zachowują zapis; jawna edycja naprawia dawną utratę precyzji', async ({ page }) => {
  await open(page);
  await installMemoryVault(page);
  const originals = await page.evaluate(() => {
    const api = window.ClcrSavedCalculation, patientId = window.ClcrVisitSave.resolveCurrentPatientId();
    const make = (id, raw, display, p, cr, date) => {
      const values = { U_PO4: p, Ucr: cr, age: '', sex: '' };
      const point = { id: 'PO4_Cr', sourceFormulaId: 'PO4_Cr', label: 'Fosforany/kreatynina (Pi, DZM)', rawValue: raw, valueNum: raw,
        displayValue: display, unit: 'mg/mg', norm: '', tone: 'neutral', outOfRange: false };
      const capture = api.createSnapshot(point, { capture: { formulaId: 'PO4_Cr', values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })) }, clinicalDateISO: date });
      const note = { id, patientId, category: 'wynik-klirens', rev: 1, title: point.label, clinicalDateISO: date,
        body: 'Kalkulator klirensu · clcr:PO4_Cr', labResult: { test: point.label, value: display, valueNum: display === '0.000' ? 0 : raw, unit: 'mg/mg', norm: '' } };
      note.body += '\n\n' + api.serializeSnapshot(capture, note);
      if (!api.readSaved(note).valid) throw Error('Fictional historical P/Cr must round-trip');
      return note;
    };
    const notes = [make('fictional-picr-legacy', .5, '0.500', '50', '100', '2025-10-21'),
      make('fictional-picr-raw-tiny', 1e-7, '0.000', '.00001', '100', '2025-10-22')];
    window.__clcrRecordFixture.seed(notes); return notes;
  });
  const frozen = await page.evaluate(notes => {
    const engine = window.VildaClcrPhosphorusCreatinine;
    window.VildaClcrPhosphorusCreatinine = new Proxy({}, { get() { return () => { throw Error('Legacy P/Cr read must not reevaluate'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; }
    finally { window.VildaClcrPhosphorusCreatinine = engine; }
  }, originals);
  expect(frozen.find(item => item.noteId === originals[0].id)).toMatchObject({ valueNum: .5, outOfRange: null, norm: '', parameterKey: 'clcr:PO4_Cr' });
  expect(frozen.find(item => item.noteId === originals[1].id)).toMatchObject({ valueNum: 1e-7, outOfRange: null, norm: '' });
  expect((await memory(page)).notes).toEqual(originals);
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), originals[0]);
  await expect(page.locator('#detailsDialog .clcr-record-value')).toContainText('0,5');
  await expect(page.locator('#detailsDialog')).not.toContainText('W zakresie');
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editField-PICR_phosphorus')).toHaveValue('50');
  await expect(page.locator('#editField-PICR_phosphorusUnit')).toHaveValue('mg P/dL');
  await expect(page.locator('#editField-PICR_creatinine')).toHaveValue('100');
  await expect(page.locator('#editField-PICR_creatinineUnit')).toHaveValue('mg/dL');
  await page.locator('#editField-PICR_phosphorus').fill('25');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const stored = await memory(page), edited = stored.notes.find(note => note.id === originals[0].id);
  expect(edited.labResult.valueNum).toBe(.25);
  expect(edited.id).toBe(originals[0].id);
  expect(stored.notes.find(note => note.id === originals[1].id)).toEqual(originals[1]);
});

test('Pᵢ/Cr: pierwsze kliknięcie Szczegółów po wpisaniu wartości działa w obu trybach', async ({ page }) => {
  await open(page, 390);
  await restore(page, { PICR_phosphorus: '', PICR_creatinine: '10' });
  await page.locator('#PICR_phosphorus').fill('15');
  await result(page);
  await kliknij(details(page).locator('summary'));
  await expect(details(page)).toHaveAttribute('open', '');
  await kliknij(details(page).locator('summary'));
  await expect(details(page)).not.toHaveAttribute('open', '');
  await kliknij(mode(page, true));
  await page.locator('#PICR_reportedValue').fill('.5');
  await result(page, { raw: .5 });
  await kliknij(details(page).locator('summary'));
  await expect(details(page)).toHaveAttribute('open', '');
  // An explicit import/change must still calculate without a preceding input.
  await page.evaluate(() => {
    const control = document.getElementById('PICR_reportedValue');
    control.value = '.7'; control.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await result(page, { raw: .7 });
  await expect(details(page)).toHaveAttribute('open', '');
});

for (const width of [1440, 390, 320]) {
  test(`Pᵢ/Cr ${width}px: wynik ze stężeń mieści się w kolumnie także bez fontu Inter`, async ({ page }) => {
    await open(page, width);
    await restore(page);
    await result(page);
    for (const family of ['Arial', 'DejaVu Sans', 'Liberation Sans']) {
      const fontOverride = await page.addStyleTag({ content: `#clcrResultReport,#clcrResultReport * { font-family: "${family}", sans-serif !important; }` });
      await page.evaluate(() => document.fonts.ready);
      await expect(card(page).locator('.clcr-result-value')).toHaveText('≈0,411');
      // Keep the native layout and exact Range glyph bounds; the font override
      // belongs only to this regression, not the normal geometry scenarios.
      await geometry(page, width);
      await fontOverride.evaluate(node => node.remove());
    }
  });
}
