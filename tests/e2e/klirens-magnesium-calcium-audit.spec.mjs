import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, prepareBrowser, saveVisible, selectPatient } from '../support/klirens-patient-record.mjs';

// Fictional values. Only encrypted I/O is replaced by the explicit memory vault;
// all clinical calculations, DOM events, serializers, readers and editors are real.
const FORMULA = 'Mg_Ca';
const STANDARD = 0.24951344877488896;
const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="Mg_Ca"]');
const inputCard = page => page.locator('#mgcaInputCard');
const details = page => page.locator('#clcrResultReport .clcr-result-details[data-clcr-formula="Mg_Ca"]');
const mode = (page, direct = false) => inputCard(page).locator(`button[data-mgca-mode="${direct ? 'direct' : 'concentration'}"]`);
const BASE = Object.freeze({
  currentVersion: 'advanced', formulaPicker: FORMULA,
  age: '', ageMonths: '', ageDays: '', sex: '', height: '', weight: '',
  MGCA_inputMode: 'concentration', MGCA_magnesium: '20', MGCA_magnesiumUnit: 'mg/L',
  MGCA_calcium: '2', MGCA_calciumUnit: 'mmol/L', MGCA_reportedValue: '', MGCA_reportedUnit: 'mg/mg',
  MGCA_sameSpecimen: '', MGCA_collectionProblem: false, MGCA_collectionHours: '', MGCA_durationKnown: false,
  U_Mg: '', U_Ca: '', Ucr: '', V24: '', collectionStartAt: '', collectionEndAt: '', Cl24DurationHours: '',
  CACR_DZM_calcium: '', CACR_DZM_creatinine: '', CACR_DZM_sameSpecimen: '', CACR_DZM_collectionHours: '',
});

async function open(page, width = 1440) {
  await prepareBrowser(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await page.waitForFunction(() => typeof window.VildaClcrMagnesiumCalcium?.evaluate === 'function' && Boolean(window.ClcrMagnesiumCalciumUi));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

async function restore(page, fields = {}) {
  expect(await page.evaluate(({ base, fields }) => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'advanced', selectedFormula: 'Mg_Ca', inputs: { ...base, ...fields },
  }, { source: 'e2e-magnesium-calcium-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true }), { base: BASE, fields })).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'Mg_Ca' &&
    document.getElementById('formulaPicker').value === 'Mg_Ca' && window.clcrIsResetting !== true);
  await expect(inputCard(page)).toBeVisible();
}

async function choose(page, formula) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formula)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formula);
}

async function result(page, { raw = STANDARD, unit = 'mg/mg', guest = true } = {}) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(card(page)).toHaveAttribute('data-clcr-tone', 'neutral');
  await expect(card(page).locator('.clcr-result-value')).toHaveCount(1);
  await expect(card(page).locator('.clcr-result-unit')).toHaveText(unit);
  const snapshot = JSON.parse(await card(page).getAttribute('data-clcr-mgca-snapshot'));
  expect(snapshot).toMatchObject({ schema: 'clcr-magnesium-calcium', valid: true, status: 'unassessed', unit,
    referenceAvailable: false, reference: null, outOfRange: null, category: null });
  expect(Number.isFinite(snapshot.rawValue)).toBe(true);
  // Relative precision also catches tiny-positive → 0 and large finite → Infinity.
  if (raw === 0) expect(snapshot.rawValue).toBe(0);
  else expect(Math.abs(snapshot.rawValue / raw - 1)).toBeLessThan(2e-14);
  expect(Number(await card(page).getAttribute('data-clcr-value'))).toBe(snapshot.rawValue);
  await expect(card(page)).toContainText('Norma dla DZM');
  await expect(card(page)).toContainText('Brak zakresu');
  await expect(card(page).locator('.clcr-result-axis, .clcr-reference-axis, .clcr-result-scale')).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('Mg_Ca'))).toBe(true);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('Mg_Ca').valueReady)).toBe(true);
  if (guest) {
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  }
  return snapshot;
}

async function blocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('Mg_Ca'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('Mg_Ca').valueReady)).toBe(false);
  expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'Mg_Ca' }))).toEqual([]);
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
      form: box('#clcrForm'), active: box('#clcrActivePanel'), input: box('#mgcaInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      inputStep: box('#clcrActivePanel .clcr-step-number'), resultStep: box('#clcrResultTitle .clcr-step-number'),
      controls: [...document.querySelectorAll('#mgcaInputCard input,#mgcaInputCard select,#mgcaInputCard button')]
        .filter(node => node.checkVisibility()).map(node => ({ id: node.id || node.textContent.trim(), kind: node.tagName,
          valueControl: node.tagName !== 'BUTTON' || node.hasAttribute('data-mgca-mode'),
          height: node.getBoundingClientRect().height, font: parseFloat(getComputedStyle(node).fontSize),
          left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })),
      mainFont: parseFloat(getComputedStyle(document.querySelector('#mgcaInputCard')).fontSize),
      numbers: [...document.querySelectorAll('#clcrResultReport [data-clcr-series="Mg_Ca"] .clcr-result-value,#clcrResultReport [data-clcr-series="Mg_Ca"] .clcr-result-reference-value')].map(node => {
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

test('Mg/Ca: wyszukiwanie wybiera właściwą formułę, zamyka listę i prowadzi do brakujących stężeń', async ({ page }) => {
  await open(page, 390);
  await restore(page, { MGCA_magnesium: '', MGCA_calcium: '' });
  await choose(page, 'Ca_Cr');
  await page.evaluate(() => scrollTo(0, 0));
  const search = page.locator('#formulaSearch'), list = page.locator('#formulaLive');
  await expect(list).toBeHidden();
  await search.fill('Mg/Ca');
  await expect(list).toBeVisible();
  await expect(list.locator('[role="option"]').first()).toHaveAttribute('data-formula-id', 'Mg_Ca');
  await page.locator('.clcr-workflow__title').click();
  await expect(list).toBeHidden();
  await search.click();
  await expect(list).toBeVisible();
  await list.locator('[data-formula-id="Mg_Ca"]').click();
  await expect(list).toBeHidden();
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.selectionGuidance.lastFormula === 'Mg_Ca' &&
    window.ClcrUiWorkflow.state.selectionGuidance.lastTarget === 'MGCA_magnesium');
  await expect(page.locator('#MGCA_magnesium')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#MGCA_calcium')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#MGCA_magnesium')).toBeInViewport();
  await blocked(page);
});

for (const width of [1440, 390, 320]) {
  test(`Mg/Ca ${width}px: dwa stężenia, jedna karta i stała szerokość obu trybów`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await open(page, width);
    await restore(page, { MGCA_magnesium: '', MGCA_calcium: '' });
    await blocked(page);
    await expect(inputCard(page).locator('input:visible')).toHaveCount(2);
    await expect(inputCard(page).locator('select:visible')).toHaveCount(2);
    await expect(page.locator('#age,#sex,#weight,#height,#U_Mg,#U_Ca,#V24,#collectionStartAt,#collectionEndAt').filter({ visible: true })).toHaveCount(0);
    await expect(page.locator('#MGCA_magnesiumUnit')).toHaveValue('mg/L');
    await expect(page.locator('#MGCA_calciumUnit')).toHaveValue('mmol/L');
    await testInfo.attach(`mgca-pending-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.locator('#MGCA_magnesium').fill('20');
    await blocked(page);
    await page.locator('#MGCA_calcium').fill('2');
    await result(page);
    const initial = await geometry(page, width);
    await testInfo.attach(`mgca-concentration-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await mode(page, true).click();
    await expect(inputCard(page).locator('input:visible')).toHaveCount(1);
    await expect(inputCard(page).locator('select:visible')).toHaveCount(1);
    expect(await page.locator('#MGCA_reportedUnit option:not([hidden])').allTextContents()).toEqual(['mg/mg', 'mmol/mmol']);
    await page.locator('#MGCA_reportedValue').fill('0.5');
    await result(page, { raw: 0.5 });
    sameWidths(initial, await geometry(page, width));
    await testInfo.attach(`mgca-direct-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await details(page).locator('summary').click();
    sameWidths(initial, await geometry(page, width));
    await testInfo.attach(`mgca-details-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await details(page).locator('summary').click();
    for (const family of ['Arial', 'DejaVu Sans', 'Liberation Sans']) {
      await page.addStyleTag({ content: `#mgcaInputCard,#mgcaInputCard *,#clcrResultReport,#clcrResultReport * { font-family: "${family}", sans-serif !important; }` });
      sameWidths(initial, await geometry(page, width));
      for (const extreme of ['1.7976931348623157e308', '1e-300']) {
        await page.locator('#MGCA_reportedValue').fill(extreme);
        await result(page, { raw: Number(extreme) });
        sameWidths(initial, await geometry(page, width));
      }
    }
    await testInfo.attach(`mgca-extreme-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await page.locator('#clearBtn').click();
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await choose(page, FORMULA);
    await expect(page.locator('#MGCA_magnesium')).toHaveValue('');
    await expect(page.locator('#MGCA_calcium')).toHaveValue('');
    await blocked(page);
    expect(errors).toEqual([]);
  });
}

test('Mg/Ca: 16 kombinacji jednostek zachowuje tę samą masową i molową proporcję', async ({ page }) => {
  await open(page);
  await restore(page);
  // Physical source example: Mg and Ca each 1 mmol/L. Fixed expected mass ratio
  // is independent of any application converter.
  const magnesium = [['mg/L', '24.305'], ['mg/dL', '2.4305'], ['mmol/L', '1'], ['µmol/L', '1000']];
  const calcium = [['mg/L', '40.078'], ['mg/dL', '4.0078'], ['mmol/L', '1'], ['µmol/L', '1000']];
  for (const [mgUnit, mg] of magnesium) for (const [caUnit, ca] of calcium) {
    await page.locator('#MGCA_magnesiumUnit').selectOption(mgUnit);
    await page.locator('#MGCA_calciumUnit').selectOption(caUnit);
    await page.locator('#MGCA_magnesium').fill(mg);
    await page.locator('#MGCA_calcium').fill(ca);
    const model = await result(page, { raw: 0.6064424372473676 });
    expect(model.alternateValue).toBeCloseTo(1, 14);
  }
  await mode(page, true).click();
  await page.locator('#MGCA_reportedValue').fill('0.5');
  const mass = await result(page, { raw: 0.5 });
  await page.locator('#MGCA_reportedUnit').selectOption('mmol/mmol');
  const molar = await result(page, { raw: 0.5, unit: 'mmol/mmol' });
  expect(mass.alternateValue).toBeCloseTo(0.824480559555647, 14);
  expect(molar.alternateValue).toBeCloseTo(0.3032212186236838, 14);
  expect(mass.alternateValue).not.toBe(molar.rawValue);
});

test('Mg/Ca: zero Mg jest liczbą, ujemne operandy i zero Ca blokują, skrajne liczby nie tworzą fałszywego zera', async ({ page }) => {
  await open(page);
  await restore(page);
  for (const [mg, ca] of [['-1', '2'], ['20', '-1'], ['-1', '-1'], ['20', '0'], ['', '2'], ['20', '']]) {
    await page.locator('#MGCA_magnesium').fill(mg);
    await page.locator('#MGCA_calcium').fill(ca);
    await blocked(page);
  }
  for (const [mg, ca, raw] of [['0', '2', 0], ['0.00001', '1', 2.4951344877489e-7], ['1e308', '1e308', 0.024951344877489]]) {
    await page.locator('#MGCA_magnesium').fill(mg);
    await page.locator('#MGCA_calcium').fill(ca);
    const model = await result(page, { raw });
    if (raw > 0) expect(model.rawValue).toBeGreaterThan(0);
  }
  await page.locator('#MGCA_magnesium').fill('1e-300');
  await page.locator('#MGCA_calcium').fill('1e100');
  await blocked(page);
});

test('Mg/Ca: cztery znaki nierówności pozostają granicami raportu, bez dokładnego punktu na wykresie', async ({ page }) => {
  await open(page);
  await installMemoryVault(page);
  await restore(page, { MGCA_inputMode: 'direct' });
  const saved = [];
  for (const operator of ['<', '≤', '>', '≥']) {
    const literal = operator + '0.5';
    await page.locator('#MGCA_reportedValue').fill(literal);
    const model = await result(page, { raw: 0.5, guest: false });
    expect(model).toMatchObject({ comparator: operator, pointValue: null, exact: false, input: { reportedValue: literal } });
    const [note] = await saveVisible(page, `2026-11-0${saved.length + 1}`);
    saved.push(note);
  }
  const projected = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes).measurements, saved);
  expect(projected).toHaveLength(4);
  expect(new Set(projected.map(item => item.parameterKey))).toEqual(new Set(['clcr:Mg_Ca']));
  for (let index = 0; index < saved.length; index += 1) {
    const measurement = projected.find(item => item.noteId === saved[index].id);
    expect(measurement.displayValue).toContain(['<', '≤', '>', '≥'][index]);
    expect(measurement.outOfRange).toBe(null);
  }
  await page.locator('#clcrOpenBadaniaBtn').click();
  await expect(page.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-point')).toHaveCount(0);
  for (const note of saved) await expect(page.locator(`.vilda-lab-hist-panel[data-panel="renal"] tr[data-note-id="${note.id}"]`)).toHaveCount(1);
});

test('Mg/Ca: własna próbka i zegar nie przejmują faktów Ca/Cr ani starego Mg DZM; gotowy wynik zachowuje odrębną próbkę', async ({ page }) => {
  await open(page);
  await installMemoryVault(page);
  await restore(page, { U_Mg: '999', U_Ca: '999', V24: '900', CACR_DZM_sameSpecimen: 'different', CACR_DZM_collectionHours: '8', MGCA_collectionHours: '' });
  const baseline = await result(page, { guest: false });
  expect(baseline.context.concentrationSameSpecimen).not.toBe('different');
  await choose(page, 'Ca_Cr');
  await choose(page, FORMULA);
  await result(page, { guest: false });
  await choose(page, 'Mg_mgkg');
  await choose(page, FORMULA);
  await result(page, { guest: false });
  await restore(page, { MGCA_sameSpecimen: 'different' });
  await blocked(page);
  await mode(page, true).click();
  await page.locator('#MGCA_reportedValue').fill('0.5');
  const direct = await result(page, { raw: 0.5, guest: false });
  expect(direct.context.concentrationSameSpecimen).toBe('different');
  const [saved] = await saveVisible(page, '2026-11-02');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), saved);
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editField-MGCA_sameSpecimen')).toHaveCount(0);
  await page.locator('#editField-MGCA_inputMode').selectOption('concentration');
  await page.locator('#editField-MGCA_magnesium').fill('20');
  await page.locator('#editField-MGCA_calcium').fill('2');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeVisible();
  expect((await memory(page)).updates).toHaveLength(0);
});

test('Mg/Ca: dopiero zapisany pacjent umożliwia zapis; mały wynik pozostaje dodatni w Badaniach, Notatkach, historii i wykresie', async ({ page }) => {
  await open(page);
  await restore(page, { MGCA_magnesium: '0.00001', MGCA_calcium: '1' });
  const model = await result(page, { raw: 2.4951344877489e-7 });
  await installMemoryVault(page, { select: false });
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await selectPatient(page);
  // A previous unassigned measurement cannot be attributed to a newly loaded
  // patient. Start a fresh measurement through the real Clear action.
  await page.locator('#clearBtn').click();
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await choose(page, FORMULA);
  await page.locator('#MGCA_magnesium').fill('0.00001');
  await page.locator('#MGCA_calcium').fill('1');
  await result(page, { raw: model.rawValue, guest: false });
  const [tiny] = await saveVisible(page, '2026-11-01');
  expect(tiny.labResult.valueNum).toBe(model.rawValue);
  await restore(page, { age: '70', sex: 'F' });
  await result(page, { guest: false });
  const [standard] = await saveVisible(page, '2026-11-02');
  const projected = await page.evaluate(notes => {
    const engine = window.VildaClcrMagnesiumCalcium;
    window.VildaClcrMagnesiumCalcium = new Proxy({}, { get() { return () => { throw Error('Frozen Mg/Ca must not reevaluate'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes); }
    finally { window.VildaClcrMagnesiumCalcium = engine; }
  }, [tiny, standard]);
  expect(new Set(projected.measurements.map(item => item.parameterKey))).toEqual(new Set(['clcr:Mg_Ca']));
  expect(projected.measurements.find(item => item.noteId === tiny.id)).toMatchObject({ valueNum: model.rawValue, norm: '', outOfRange: null });
  expect(projected.measurements.find(item => item.noteId === standard.id)).toMatchObject({ valueNum: STANDARD, norm: '', outOfRange: null });
  await page.locator('#clcrOpenHistoryBtn').click();
  await expect(page.locator(`#clcrPatientCard tr[data-note-id="${tiny.id}"]`)).toHaveCount(1);
  await expect(page.locator(`#clcrPatientCard tr[data-note-id="${standard.id}"]`)).toHaveCount(1);
  await page.locator('#cpcClose').click();
  await page.locator('#clcrOpenBadaniaBtn').click();
  const points = page.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-point');
  await expect(points).toHaveCount(2);
  expect(Number(await page.locator(`.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-point[data-note-id="${tiny.id}"]`).getAttribute('data-value'))).toBe(model.rawValue);
  await page.locator('button[data-tab="notes"]').click();
  const notes = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]');
  await expect(notes).toHaveCount(2);
  for (const note of await notes.all()) await expect(note).not.toContainText('W zakresie');
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Mg/Ca: dawny 0,25 i zachowany mały raw są zamrożone; jawna edycja przelicza 40,078, zachowuje ID i usuwa tylko wybrany zapis', async ({ page }) => {
  await open(page);
  await installMemoryVault(page);
  const originals = await page.evaluate(() => {
    const api = window.ClcrSavedCalculation, patientId = window.ClcrVisitSave.resolveCurrentPatientId();
    const make = (id, raw, display, date) => {
      const values = { U_Mg: '20', U_Ca: '2', age: '10', sex: 'F' };
      const point = { id: 'Mg_Ca', sourceFormulaId: 'Mg_Ca', label: 'Magnez/wapń (DZM)', rawValue: raw, valueNum: raw,
        displayValue: display, unit: 'mg/mg', norm: '', tone: 'neutral', outOfRange: false };
      const capture = api.createSnapshot(point, { capture: { formulaId: 'Mg_Ca', values, fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })) }, clinicalDateISO: date });
      const note = { id, patientId, category: 'wynik-klirens', rev: 1, title: point.label, clinicalDateISO: date,
        body: 'Kalkulator klirensu · clcr:Mg_Ca', labResult: { test: point.label, value: display, valueNum: display === '0.000' ? 0 : raw, unit: 'mg/mg', norm: '' } };
      note.body += '\n\n' + api.serializeSnapshot(capture, note);
      if (!api.readSaved(note).valid) throw Error('Fictional historical Mg/Ca must round-trip');
      return note;
    };
    const notes = [make('fictional-mgca-legacy', 0.25, '0.250', '2025-10-21'), make('fictional-mgca-raw-tiny', 2.5e-7, '0.000', '2025-10-22')];
    window.__clcrRecordFixture.seed(notes); return notes;
  });
  const frozen = await page.evaluate(notes => {
    const engine = window.VildaClcrMagnesiumCalcium;
    window.VildaClcrMagnesiumCalcium = new Proxy({}, { get() { return () => { throw Error('Legacy read must not call current Mg/Ca engine'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; }
    finally { window.VildaClcrMagnesiumCalcium = engine; }
  }, originals);
  expect(frozen.find(item => item.noteId === originals[0].id)).toMatchObject({ valueNum: 0.25, outOfRange: null, norm: '', parameterKey: 'clcr:Mg_Ca' });
  expect(frozen.find(item => item.noteId === originals[1].id)).toMatchObject({ valueNum: 2.5e-7, outOfRange: null, norm: '' });
  expect((await memory(page)).notes).toEqual(originals);
  await page.evaluate(() => {
    window.__mgcaEngineBeforeRead = window.VildaClcrMagnesiumCalcium;
    window.__mgcaReadCalls = 0;
    window.VildaClcrMagnesiumCalcium = new Proxy({}, { get() { return () => { window.__mgcaReadCalls += 1; throw Error('Details READ must use frozen Mg/Ca'); }; } });
  });
  try {
    await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), originals[0]);
    await expect(page.locator('#detailsDialog .clcr-record-value')).toContainText('0,25');
    await expect(page.locator('#detailsDialog')).not.toContainText('W zakresie');
    expect(await page.evaluate(() => window.__mgcaReadCalls)).toBe(0);
  } finally {
    await page.evaluate(() => { window.VildaClcrMagnesiumCalcium = window.__mgcaEngineBeforeRead; delete window.__mgcaEngineBeforeRead; });
  }
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editField-MGCA_magnesium')).toHaveValue('20');
  await expect(page.locator('#editField-MGCA_calcium')).toHaveValue('2');
  for (const [mg, ca] of [['-1', '2'], ['20', '-1'], ['-1', '-1'], ['20', '0']]) {
    await page.locator('#editField-MGCA_magnesium').fill(mg);
    await page.locator('#editField-MGCA_calcium').fill(ca);
    await page.locator('#saveEditedMeasurement').click();
    await expect(page.locator('#editDialog')).toBeVisible();
    expect((await memory(page)).updates).toHaveLength(0);
  }
  await page.locator('#editField-MGCA_magnesium').fill('20');
  await page.locator('#editField-MGCA_calcium').fill('2');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const stored = await memory(page), edited = stored.notes.find(note => note.id === originals[0].id);
  expect(edited.labResult.valueNum).toBe(STANDARD);
  expect(stored.notes.find(note => note.id === originals[1].id)).toEqual(originals[1]);
  expect(edited.id).toBe(originals[0].id);
  await page.locator('#deleteMeasurement').click();
  await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).toBeHidden();
  expect((await memory(page)).notes).toEqual([originals[1]]);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Mg/Ca: raport AI i Word przenoszą obie jednostki, brak normy i prawdziwy wykładnik potęgi', async ({ page }) => {
  await open(page);
  await restore(page);
  await result(page);
  await page.evaluate(() => {
    window.__mgcaClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__mgcaClipboard = value; } } });
    window.alert = () => {};
  });
  async function exports() {
    await page.locator('#askAI').click();
    const copy = await page.evaluate(() => window.__mgcaClipboard);
    const pending = page.waitForEvent('download');
    await page.locator('#downloadDOCX').click();
    const download = await pending, html = await fs.readFile(await download.path(), 'utf8');
    const word = await page.evaluate(source => new DOMParser().parseFromString(source, 'text/html').body.textContent, html);
    return [copy, word];
  }
  for (const text of await exports()) {
    expect(text.replace(/\s/g, '')).toContain('0,2495');
    expect(text).toContain('mg/mg');
    expect(text).toContain('mmol/mmol');
    expect(text).toContain('Brak zakresu');
    expect(text).not.toContain('W zakresie');
  }
  await mode(page, true).click();
  await page.locator('#MGCA_reportedValue').fill('1.7976931348623157e308');
  const model = await result(page, { raw: Number.MAX_VALUE });
  await expect(card(page).locator('.clcr-result-value')).toHaveAttribute('data-scientific', 'true');
  await expect(card(page).locator('.clcr-result-value')).toHaveAttribute('aria-label', model.display.text);
  for (const text of await exports()) {
    expect(text).toContain(model.display.text);
    expect(text).not.toMatch(/×\s*10308/);
  }
});
