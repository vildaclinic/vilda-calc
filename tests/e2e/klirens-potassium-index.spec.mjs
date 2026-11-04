import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, prepareBrowser, saveVisible, selectPatient, OTHER_PATIENT_ID, openShellCalculator, shellFrame } from '../support/klirens-patient-record.mjs';

// Fictional values only. Clinical calculation, serializers, history and editor
// are production code; the explicit fixture replaces encrypted I/O only.
const FORMULA = 'K_frac';
const BASE = Object.freeze({ currentVersion: 'spot', formulaPicker: FORMULA,
  U_K: '60', U_Na: '20', age: '', ageMonths: '', ageDays: '', sex: '', weight: '', height: '',
  V24: '', Cl24DurationHours: '', collectionStartAt: '', collectionEndAt: '',
  U_K_spot: '', U_Na_spot: '', U_Cl_spot: '', spotSameSpecimen: '',
});
const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="K_frac"]');
const inputCard = page => page.locator('#kfrInputCard');
const details = page => page.locator('#clcrResultReport .clcr-result-details[data-clcr-formula="K_frac"]');

async function open(page, width = 1440) {
  await prepareBrowser(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await page.waitForFunction(() => Boolean(window.VildaClcrPotassiumIndex?.evaluate && window.ClcrPotassiumIndexUi));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

async function restore(page, fields = {}) {
  expect(await page.evaluate(({ base, fields }) => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'K_frac', inputs: { ...base, ...fields },
  }, { source: 'e2e-potassium-index-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true }), { base: BASE, fields })).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'K_frac' &&
    document.getElementById('formulaPicker').value === 'K_frac' && window.clcrIsResetting !== true);
  await expect(inputCard(page)).toBeVisible();
}

async function choose(page, formula) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formula)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formula);
}

async function result(page, raw = 75, guest = true) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(card(page)).toHaveAttribute('data-clcr-tone', 'neutral');
  await expect(card(page).locator('.clcr-result-unit')).toHaveText('%');
  await expect(card(page)).toContainText('Brak uniwersalnej normy');
  const snapshot = JSON.parse(await card(page).getAttribute('data-clcr-potassium-index-snapshot'));
  expect(snapshot).toMatchObject({ schema: 'clcr-potassium-index', valid: true, status: 'unassessed', unit: '%',
    referenceAvailable: false, outOfRange: null, reference: null });
  expect(Number.isFinite(snapshot.rawValue)).toBe(true);
  if (raw === 0) expect(snapshot.rawValue).toBe(0);
  else expect(Math.abs(snapshot.rawValue / raw - 1)).toBeLessThan(2e-14);
  expect(Number(await card(page).getAttribute('data-clcr-value'))).toBe(snapshot.rawValue);
  expect(await page.evaluate(() => window.canComputeFormula('K_frac'))).toBe(true);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('K_frac').valueReady)).toBe(true);
  const points = await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'K_frac' }));
  expect(points).toHaveLength(1);
  expect(points[0]).toMatchObject({ rawValue: snapshot.rawValue, valueNum: snapshot.rawValue, outOfRange: null });
  if (guest) {
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  }
  return snapshot;
}

async function blocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('K_frac'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('K_frac').valueReady)).toBe(false);
  expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'K_frac' }))).toEqual([]);
}

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const measured = await page.evaluate(() => {
    const box = selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { x: rect.x, width: rect.width, top: rect.top + scrollY, bottom: rect.bottom + scrollY };
    };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), input: box('#kfrInputCard'), active: box('#clcrActivePanel'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'),
      pairs: [...document.querySelectorAll('#kfrInputCard .kfr-value-row')].map(row => {
        const input = row.querySelector('input').getBoundingClientRect(), unit = row.querySelector('.kfr-fixed-unit').getBoundingClientRect();
        return { inputTop: input.top, inputBottom: input.bottom, unitTop: unit.top, unitBottom: unit.bottom };
      }),
      controls: [...document.querySelectorAll('#kfrInputCard input')].filter(node => node.checkVisibility()).map(node => ({
        id: node.id, font: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height,
        left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
      })),
    };
  });
  expect(measured.overflow).toBeLessThanOrEqual(1);
  expect(measured.controls.map(control => control.id)).toEqual(['U_K', 'U_Na']);
  expect(measured.pairs).toHaveLength(2);
  for (const pair of measured.pairs) {
    expect(Math.abs(pair.inputTop - pair.unitTop), 'input and fixed unit top').toBeLessThanOrEqual(1);
    expect(Math.abs(pair.inputBottom - pair.unitBottom), 'input and fixed unit bottom').toBeLessThanOrEqual(1);
  }
  expect(Math.abs(measured.form.width - measured.input.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(measured.clear.width - measured.input.width)).toBeLessThanOrEqual(1);
  if (width < 980) expect(measured.report.top - measured.clear.bottom).toBeGreaterThanOrEqual(20);
  for (const control of measured.controls) {
    expect(control.font, control.id).toBeGreaterThanOrEqual(16);
    expect(control.height, control.id).toBeGreaterThanOrEqual(48);
    expect(control.left, control.id).toBeGreaterThanOrEqual(0);
    expect(control.right, control.id).toBeLessThanOrEqual(width + 1);
  }
  return measured;
}

function sameWidths(before, after) {
  for (const key of ['form', 'input', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(.5);
  }
}

async function screenshot(page, testInfo, name) {
  const path = testInfo.outputPath(name + '.png');
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('K/(K+Na): wyszukiwarka prowadzi do dwóch stężeń w sektorze próbki moczu', async ({ page }) => {
  await open(page, 390);
  await restore(page, { U_K: '', U_Na: '' });
  await choose(page, 'Ca_Cr');
  await page.evaluate(() => scrollTo(0, 0));
  const search = page.locator('#formulaSearch'), list = page.locator('#formulaLive');
  await expect(list).toBeHidden();
  await search.fill('K/(K+Na)');
  await expect(list.locator('[data-formula-id="K_frac"]')).toBeVisible();
  await list.locator('[data-formula-id="K_frac"]').click();
  await expect(list).toBeHidden();
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.selectionGuidance.lastFormula === 'K_frac' &&
    window.ClcrUiWorkflow.state.selectionGuidance.lastTarget === 'U_K');
  await expect(page.locator('#U_K')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#U_Na')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#U_K')).toBeInViewport();
  await expect(page.locator('html')).toHaveAttribute('data-clcr-active-module', 'spot-potassium-index');
  expect(await page.evaluate(() => window.FORMULAS.find(formula => formula.id === 'K_frac').version)).toBe('spot');
  await blocked(page);
});

for (const width of [1440, 390, 320]) {
  test(`K/(K+Na) ${width}px: dwa pola, neutralna karta i stała szerokość`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await open(page, width);
    await restore(page, { U_K: '', U_Na: '' });
    await blocked(page);
    await expect(inputCard(page).locator('input:visible')).toHaveCount(2);
    await expect(inputCard(page).locator('select:visible')).toHaveCount(0);
    await expect(page.locator('#age,#sex,#weight,#height,#V24,#collectionStartAt,#collectionEndAt').filter({ visible: true })).toHaveCount(0);
    await page.locator('#U_K').fill('60');
    await blocked(page);
    await page.locator('#U_Na').fill('20');
    await result(page);
    const initial = await geometry(page, width);
    await screenshot(page, testInfo, `kfrac-result-${width}`);
    await expect(inputCard(page)).toContainText('mEq/L');
    await expect(inputCard(page)).toContainText('Zbiórka dobowa nie jest wymagana');
    await expect(details(page)).not.toHaveAttribute('open', '');
    await kliknij(details(page).locator('summary'));
    await expect(details(page)).toHaveAttribute('open', '');
    await expect(details(page)).toContainText('FENa');
    await expect(details(page)).toContainText('hipowolemii');
    sameWidths(initial, await geometry(page, width));
    await screenshot(page, testInfo, `kfrac-details-${width}`);
    await kliknij(details(page).locator('summary'));
    await page.locator('#U_K').fill('0');
    await result(page, 0);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#U_Na').fill('0');
    await blocked(page);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#U_K').fill('0,000001');
    await page.locator('#U_Na').fill('100');
    await result(page, 100 / 100000001);
    await expect(card(page).locator('.clcr-result-value')).not.toHaveText(/^0(?:[.,]0+)?$/);
    sameWidths(initial, await geometry(page, width));
    await screenshot(page, testInfo, `kfrac-tiny-${width}`);
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await choose(page, FORMULA);
    await expect(page.locator('#U_K')).toHaveValue('');
    await expect(page.locator('#U_Na')).toHaveValue('');
    await blocked(page);
    expect(errors).toEqual([]);
  });
}

test('K/(K+Na): zera, przecinek i stabilna suma; błędne stężenia nie tworzą wyniku', async ({ page }) => {
  await open(page);
  await restore(page);
  for (const [k, na, expected] of [['0', '60', 0], ['40', '0', 100], ['40,5', '60', 27 / 67 * 100], ['1e308', '1e308', 50]]) {
    await page.locator('#U_K').fill(k);
    await page.locator('#U_Na').fill(na);
    await result(page, expected);
  }
  for (const [k, na] of [['0', '0'], ['-1', '-1'], ['1', '-0.5'], ['-1', '2'], ['0x10', '60'], ['<1', '60'], ['1e309', '60'], ['1e-300', '1e308']]) {
    await page.locator('#U_K').fill(k);
    await page.locator('#U_Na').fill(na);
    await blocked(page);
  }
});

test('K/(K+Na): bez wieku i bez przejmowania innych elektrolitów lub ankiet', async ({ page }) => {
  await open(page);
  await restore(page, { U_K_spot: '1', U_Na_spot: '999', spotSameSpecimen: 'different', V24: '1000', Cl24DurationHours: '8' });
  const baseline = await result(page);
  expect(baseline.context.sampleType).toBe('unspecified');
  for (const formula of ['AGu_spot', 'K_mmol_d']) {
    await choose(page, formula);
    await choose(page, FORMULA);
    await expect(page.locator('#U_K')).toHaveValue('60');
    await expect(page.locator('#U_Na')).toHaveValue('20');
    await result(page);
  }
  await restore(page, { age: '1', sex: 'F' }); await result(page);
  await restore(page, { age: '80', sex: 'M' }); await result(page);
});

test('K/(K+Na): surowe małe wartości i brak normy w zapisie, historii, Notatkach i wykresie', async ({ page }) => {
  await open(page);
  await restore(page, { U_K: '.000001', U_Na: '100' });
  const raw = 100 / 100000001;
  await result(page, raw);
  await installMemoryVault(page, { select: false });
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await selectPatient(page);
  await kliknij(page.locator('#clearBtn'));
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await restore(page, { U_K: '.000001', U_Na: '100' });
  const model = await result(page, raw, false);
  const [tiny] = await saveVisible(page, '2026-10-21');
  expect(tiny.labResult.valueNum).toBe(model.rawValue);
  await restore(page); await result(page, 75, false);
  const [standard] = await saveVisible(page, '2026-10-22');
  const projected = await page.evaluate(notes => {
    const engine = window.VildaClcrPotassiumIndex;
    window.VildaClcrPotassiumIndex = new Proxy({}, { get() { return () => { throw Error('Frozen K fraction must not reevaluate'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; }
    finally { window.VildaClcrPotassiumIndex = engine; }
  }, [tiny, standard]);
  expect(new Set(projected.map(item => item.parameterKey))).toEqual(new Set(['clcr:K_frac']));
  expect(projected.find(item => item.noteId === tiny.id)).toMatchObject({ valueNum: model.rawValue, norm: '', outOfRange: null });
  expect(projected.find(item => item.noteId === standard.id)).toMatchObject({ valueNum: 75, norm: '', outOfRange: null });
  await page.locator('#clcrOpenHistoryBtn').click();
  for (const note of [tiny, standard]) await expect(page.locator(`#clcrPatientCard tr[data-note-id="${note.id}"]`)).toHaveCount(1);
  await page.locator('#cpcClose').click();
  await page.locator('#clcrOpenBadaniaBtn').click();
  await expect(page.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-point')).toHaveCount(2);
  expect(Number(await page.locator(`.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-point[data-note-id="${tiny.id}"]`).getAttribute('data-value'))).toBe(model.rawValue);
  await page.locator('button[data-tab="notes"]').click();
  const notes = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]');
  await expect(notes).toHaveCount(2);
  for (const note of await notes.all()) await expect(note).not.toContainText(/W zakresie|wynik prawidłowy/);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('K/(K+Na): edycja waliduje obie wartości i zachowuje ID; zero i usunięcie działają', async ({ page }) => {
  await open(page); await installMemoryVault(page); await restore(page); await result(page, 75, false);
  const [original] = await saveVisible(page, '2026-10-23');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), original);
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editField-U_K')).toHaveValue('60');
  await expect(page.locator('#editField-U_Na')).toHaveValue('20');
  for (const [k, na] of [['-1', '-1'], ['1', '-0.5'], ['-1', '2'], ['0', '0'], ['0x10', '60']]) {
    await page.locator('#editField-U_K').fill(k);
    await page.locator('#editField-U_Na').fill(na);
    await page.locator('#saveEditedMeasurement').click();
    await expect(page.locator('#editDialog')).toBeVisible();
    expect((await memory(page)).updates).toHaveLength(0);
  }
  await page.locator('#editField-U_K').fill('0');
  await page.locator('#editField-U_Na').fill('60');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const stored = await memory(page), edited = stored.notes.find(note => note.id === original.id);
  expect(stored.notes).toHaveLength(1); expect(edited.id).toBe(original.id);
  expect(edited.labResult.valueNum).toBe(0);
  const revised = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], edited);
  expect(revised).toMatchObject({ valueNum: 0, norm: '', outOfRange: null });
  await page.locator('#deleteMeasurement').click(); await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).toBeHidden();
  expect((await memory(page)).notes).toEqual([]);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('K/(K+Na): powrót ze Startu zachowuje pola; zmiana pacjenta wymaga nowego pomiaru', async ({ page }) => {
  const { calculator } = await openShellCalculator(page, { width: 390 });
  await restore(calculator); await result(calculator, 75, false);
  await page.evaluate(() => { location.hash = '#/start'; }); await shellFrame(page, 'Start');
  await page.evaluate(() => { location.hash = '#/klirens'; }); await shellFrame(page, 'Kalkulator klirensu');
  await expect(calculator.locator('#U_K')).toHaveValue('60');
  await expect(calculator.locator('#U_Na')).toHaveValue('20');
  await result(calculator, 75, false);
  await selectPatient(calculator, OTHER_PATIENT_ID);
  await expect(calculator.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect((await memory(calculator)).notes.filter(note => note.patientId === OTHER_PATIENT_ID)).toEqual([]);
  await kliknij(calculator.locator('#clearBtn')); await calculator.waitForFunction(() => window.clcrIsResetting !== true);
  await choose(calculator, FORMULA);
  await expect(calculator.locator('#U_K')).toHaveValue(''); await expect(calculator.locator('#U_Na')).toHaveValue('');
  await blocked(calculator);
});

test('K/(K+Na): raporty AI i Word zachowują procent i neutralny wynik', async ({ page }) => {
  await open(page); await restore(page); await result(page);
  await page.evaluate(() => {
    window.__kfrClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__kfrClipboard = value; } } });
    window.alert = () => {};
  });
  async function exports() {
    await page.locator('#askAI').click();
    const copy = await page.evaluate(() => window.__kfrClipboard);
    const pending = page.waitForEvent('download'); await page.locator('#downloadDOCX').click();
    const download = await pending, html = await fs.readFile(await download.path(), 'utf8');
    const word = await page.evaluate(source => new DOMParser().parseFromString(source, 'text/html').body.textContent, html);
    return [copy, word];
  }
  for (const text of await exports()) {
    expect(text).toContain('75'); expect(text).toContain('%'); expect(text).toContain('Brak uniwersalnej normy');
    expect(text).not.toMatch(/W zakresie laboratoryjnym|wynik prawidłowy/);
  }
  await page.locator('#U_K').fill('.000001'); await page.locator('#U_Na').fill('100');
  const tiny = await result(page, 100 / 100000001);
  for (const text of await exports()) {
    expect(text).toContain(tiny.display.text);
    expect(text).toContain('Brak uniwersalnej normy');
  }
});

test('K/(K+Na): stara sesja DZM zachowuje przecinek i materiał, jawnie różne próbki blokują wynik', async ({ page }) => {
  await open(page);
  async function oldSession(context) {
    expect(await page.evaluate(context => window.applyClcrSessionSnapshot({
      version: 2, currentVersion: 'advanced', selectedFormula: 'K_frac',
      inputs: { currentVersion: 'advanced', formulaPicker: 'K_frac', U_K: '40,5', U_Na: '60', age: '', sex: '' }, context,
    }, { source: 'e2e-kfrac-old-session', update: true, dispatchEvents: false, preserveAcrossVersions: true }), context)).toBe(true);
    await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'K_frac' && window.clcrIsResetting !== true);
    await expect(inputCard(page)).toBeVisible();
  }
  await oldSession({ potassiumIndex: { sampleType: 'timed', sameSpecimen: true, collectionHours: 24 } });
  await expect(page.locator('#U_K')).toHaveValue('40,5');
  const timed = await result(page, 27 / 67 * 100);
  expect(timed.context).toMatchObject({ sampleType: 'timed', sameSpecimen: 'confirmed' });
  await choose(page, 'ACR'); await choose(page, FORMULA);
  const returned = await result(page, 27 / 67 * 100);
  expect(returned.context.sampleType).toBe('timed');
  await oldSession({ sourceFormula: 'K_frac', sampleType: 'timed', sameSpecimen: false });
  await blocked(page);
  await expect(page.locator('#U_K')).toHaveValue('40,5');
  await expect(page.locator('#U_Na')).toHaveValue('60');
  await oldSession({ sourceFormula: 'AGu_spot', sameSpecimen: false, sampleType: 'spot' });
  const unrelated = await result(page, 27 / 67 * 100);
  expect(unrelated.context).toMatchObject({ sampleType: 'unspecified', sameSpecimen: 'assumed' });
});

test('K/(K+Na): historyczny zapis DZM nie zmienia się podczas odczytu, edycja zachowuje materiał', async ({ page }) => {
  await open(page); await installMemoryVault(page);
  const original = await page.evaluate(() => {
    const api = window.ClcrSavedCalculation, patientId = window.ClcrVisitSave.resolveCurrentPatientId();
    const values = { U_K: '60', U_Na: '20' };
    const point = { id: 'K_frac', sourceFormulaId: 'K_frac', label: 'K/(K+Na) (DZM)', rawValue: 75, valueNum: 75,
      displayValue: '75.0', unit: '%', norm: '', tone: 'neutral', outOfRange: false };
    const capture = api.createSnapshot(point, { capture: { formulaId: 'K_frac', values,
      fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })),
      sourceFormula: 'K_frac', sampleType: 'timed', sameSpecimen: true, collectionHours: 24,
    }, clinicalDateISO: '2025-10-21' });
    const note = { id: 'fictional-kfrac-legacy', patientId, category: 'wynik-klirens', rev: 1,
      title: point.label, clinicalDateISO: '2025-10-21', body: 'Kalkulator klirensu · clcr:K_frac',
      labResult: { test: point.label, value: '75.0', valueNum: 75, unit: '%', norm: '' } };
    note.body += '\n\n' + api.serializeSnapshot(capture, note);
    if (!api.readSaved(note).valid) throw Error('Fictional historical K fraction must round-trip');
    window.__clcrRecordFixture.seed([note]); return note;
  });
  const frozen = await page.evaluate(note => {
    const engine = window.VildaClcrPotassiumIndex;
    window.VildaClcrPotassiumIndex = new Proxy({}, { get() { return () => { throw Error('Legacy read must not reevaluate'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes([note]).measurements[0]; }
    finally { window.VildaClcrPotassiumIndex = engine; }
  }, original);
  expect(frozen).toMatchObject({ valueNum: 75, norm: '', outOfRange: null, parameterKey: 'clcr:K_frac' });
  expect((await memory(page)).notes).toEqual([original]);
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), original);
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editField-U_K')).toHaveValue('60');
  await expect(page.locator('#editField-U_Na')).toHaveValue('20');
  await page.locator('#editField-U_K').fill('20');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const stored = await memory(page), edited = stored.notes.find(note => note.id === original.id);
  expect(stored.notes).toHaveLength(1); expect(edited.labResult.valueNum).toBe(50);
  const snapshot = await page.evaluate(note => window.ClcrSavedCalculation.readSaved(note).snapshot, edited);
  expect(snapshot.assessment.potassiumIndexSnapshot.context.sampleType).toBe('timed');
  expect(snapshot.assessment.potassiumIndexSnapshot.outOfRange).toBe(null);
});
