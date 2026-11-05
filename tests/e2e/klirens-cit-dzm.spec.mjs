import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, saveVisible } from '../support/klirens-patient-record.mjs';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { clcrPoint, clcrPoints, showClcrResults } from '../support/badania-klirens.mjs';
import { applySession, card, choose, chooseNativeUnit, details, expectBlocked, expectResult, openCalculator, restore } from '../support/klirens-cit-dzm-browser.mjs';

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), active: box('#clcrActivePanel'), input: box('#citDzmInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      controls: [...document.querySelectorAll('#citDzmInputCard input,#citDzmInputCard select,#citDzmInputCard button')].filter(node => node.checkVisibility()).map(node => ({
        id: node.id || node.textContent.trim(), font: parseFloat(getComputedStyle(node).fontSize),
        height: node.getBoundingClientRect().height, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
      })),
    };
  });
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(Math.abs(result.form.width - result.input.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.clear.width - result.input.width)).toBeLessThanOrEqual(1);
  expect(result.clear.top - result.input.bottom).toBeGreaterThanOrEqual(15);
  if (width < 980) expect(result.report.top - result.clear.bottom).toBeGreaterThanOrEqual(20);
  else {
    expect(Math.abs(result.active.top - result.report.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.active.width - result.report.width)).toBeLessThanOrEqual(1);
  }
  for (const control of result.controls) {
    expect(control.font, control.id).toBeGreaterThanOrEqual(16);
    expect(control.height, control.id).toBeGreaterThanOrEqual(48);
    expect(control.left, control.id).toBeGreaterThanOrEqual(0);
    expect(control.right, control.id).toBeLessThanOrEqual(width + 1);
  }
  return result;
}

function sameWidths(before, after) {
  for (const key of ['form', 'input', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
}

test('Cit DZM: odświeżenie pustego formularza nie pokazuje przycisku czyszczenia przed wyborem formuły', async ({ page }) => {
  await openCalculator(page);
  await expect(page.locator('#formulaPicker')).toHaveValue('');
  await expect(page.locator('#clearContainer')).toBeHidden();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (let refresh = 0; refresh < 3; refresh += 1) {
      await page.evaluate(() => window.clcrUpdate());
      await czekajNaUstabilizowanyUklad(page);
      await expect(page.locator('#clearContainer')).toBeHidden();
      await expect(page.locator('#clearBtn')).toBeHidden();
    }
  }
  await choose(page, 'Cit_mgkg');
  await expect(page.locator('#citDzmInputCard')).toBeVisible();
  await expect(page.locator('#clearContainer')).toBeVisible();
  await expect(page.locator('#clearBtn')).toBeVisible();
  await page.evaluate(() => window.clcrUpdate());
  await expect(page.locator('#clearBtn')).toBeVisible();
});

for (const width of [1440, 390, 320]) {
  test(`Cit DZM: dwa pomiary, jeden wynik i stały układ ${width}px`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page, { CITDZM_concentration: '', CITDZM_volume: '' });
    await expectBlocked(page);
    for (const id of ['U_Cit', 'V24', 'weight', 'height', 'age', 'stoneTwoCollectionsConfirmed']) await expect(page.locator('#' + id)).toBeHidden();
    await expect(page.locator('#CITDZM_collectionHours')).toHaveValue('24');
    const initial = await geometry(page, width);
    await page.locator('#CITDZM_concentration').fill('1.5');
    await page.locator('#CITDZM_volume').fill('1000');
    await expectResult(page, { raw: 1.5, outOfRange: false });
    await expect(page.locator('#citDzmInputCard')).toContainText('2/2');
    await expect(page.locator('#clcrDataCompletion')).toBeHidden();
    sameWidths(initial, await geometry(page, width));
    await page.locator('[data-cit-dzm-mode="reported"]').click();
    await page.locator('#CITDZM_reportedValue').fill('0.6');
    await expectResult(page, { raw: 0.6 });
    await expect(page.locator('#citDzmInputCard')).toContainText('1/1');
    const colors = await card(page).evaluate(node => ({
      value: getComputedStyle(node.querySelector('.clcr-result-value')).color,
      reference: getComputedStyle(node.querySelector('.cit-dzm-reference-value')).color,
      unit: getComputedStyle(node.querySelector('.cit-dzm-reference-unit')).color,
    }));
    expect(colors.value).not.toBe(colors.reference);
    expect(colors.reference).toBe(colors.unit);
    sameWidths(initial, await geometry(page, width));
    await details(page).locator('summary').click();
    sameWidths(initial, await geometry(page, width));
    const shot = testInfo.outputPath(`cit-dzm-${width}.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: shot });
    await testInfo.attach(`cit-dzm-${width}`, { path: shot, contentType: 'image/png' });
    await page.locator('#clearBtn').click();
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expect(page.locator('#formulaPicker')).toHaveValue('Cit_mgkg');
    await expect(page.locator('#CITDZM_concentration')).toHaveValue('');
    await expect(page.locator('#CITDZM_reportedValue')).toHaveValue('');
    await expect(page.locator('#CITDZM_collectionHours')).toHaveValue('24');
    await expect(page.locator('#age')).toHaveValue('10');
    await expectBlocked(page);
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('Cit DZM: brak danych pacjenta lub BSA nie blokuje liczby i nie nadaje dorosłej normy', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [{ age: '', ageMonths: '', weight: '', height: '' }, { sex: '' }, { age: '0', ageMonths: '6' }, { weight: '', height: '' }, { weight: '', height: '140' }, { weight: '30', height: '' }]) {
    await restore(page, fields);
    await expectResult(page, { reference: false, outOfRange: null });
    await expect(page.locator('#citDzmInputCard')).toContainText('2/2');
    await expect(page.locator('#clcrReadiness')).toBeHidden();
  }
  await restore(page, { age: '40', weight: '', height: '' });
  await expectResult(page, { outOfRange: true });
});

test('Cit DZM: nieznana postać masowa daje ilość bez wymuszonego przeliczenia lub normy', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { age: '40', weight: '', height: '', CITDZM_concentration: '20', CITDZM_concentrationUnit: 'mg/L' });
  await expectResult(page, { raw: 20, unit: 'mg/24 h', reference: false, outOfRange: null });
  await page.locator('[aria-controls="citDzmEntityEditor"]').click();
  await page.locator('#CITDZM_reportingEntity').selectOption('citric_acid');
  await expectResult(page, { raw: 20, unit: 'mg/24 h', outOfRange: true });
  await restore(page, { age: '40', CITDZM_inputMode: 'reported', CITDZM_reportedValue: '400', CITDZM_reportedUnit: 'mg/24h', CITDZM_reportingEntity: 'citric_acid' });
  await expectResult(page, { raw: 400, unit: 'mg/24 h', outOfRange: false });
});

test('Cit DZM: zero pozostaje zerem, a mała dodatnia ilość pozostaje dodatnia także w zapisie', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { CITDZM_concentration: '0.000001' });
  const small = await expectResult(page, { raw: 0.000001, outOfRange: true });
  expect(small.presentation.valueText).not.toMatch(/^0(?:[.,]0+)?$/);
  await restore(page, { CITDZM_concentration: '0' });
  await expectResult(page, { raw: 0, outOfRange: null });
  await expect(page.locator('#CITDZM_concentration')).not.toHaveClass(/clcr-missing-input/);
  for (const CITDZM_concentration of ['-1', 'abc', '1e999']) {
    await restore(page, { CITDZM_concentration });
    await expectBlocked(page);
  }
});

test('Cit DZM: zmiana jednostek nie zmienia ilości, a nieznana postać nie pozwala zgadnąć moli', async ({ page }) => {
  await openCalculator(page); await restore(page, { CITDZM_reportingEntity: 'citrate_ion' });
  await chooseNativeUnit(page, '#CITDZM_concentrationUnit', 'µmol/L');
  await expectResult(page);
  await chooseNativeUnit(page, '#CITDZM_volumeUnit', 'L');
  await expect(page.locator('#CITDZM_volume')).toHaveValue('1');
  await expectResult(page);
  await chooseNativeUnit(page, '#CITDZM_concentrationUnit', 'mg/L');
  await expectResult(page, { raw: 151.2792, unit: 'mg/24 h' });
  await chooseNativeUnit(page, '#CITDZM_concentrationUnit', 'mmol/L');
  await expectResult(page);
  await restore(page);
  await page.locator('#CITDZM_concentrationUnit').focus();
  await page.locator('#CITDZM_concentrationUnit').press('End');
  // A prevented conversion deliberately restores the original selector.
  await expect(page.locator('#CITDZM_concentrationUnit')).toHaveValue('mmol/L');
  await expect(page.locator('#CITDZM_concentration')).toHaveValue('0.8');
  await expect(page.locator('#CITDZM_reportingEntity')).toHaveValue('unknown');
  await expectResult(page);
});

test('Cit DZM: czas inny niż 24h i znana niepełna zbiórka zachowują swoje znaczenie', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { CITDZM_collectionHours: '12', CITDZM_collectionSource: 'hours' });
  await expectResult(page, { raw: 1.6, reference: false, outOfRange: null });
  await page.locator('[data-cit-dzm-mode="reported"]').click();
  await page.locator('#CITDZM_reportedValue').fill('0.8');
  await expectResult(page, { raw: 0.8, reference: false, outOfRange: null });
  for (const CITDZM_collectionHours of ['0', '-1', 'abc']) {
    await restore(page, { CITDZM_collectionHours }); await expectBlocked(page);
  }
  for (const CITDZM_inputMode of ['concentration', 'reported']) {
    await restore(page, { CITDZM_inputMode, CITDZM_reportedValue: '0.8', Cl24CollectionProblem: true });
    await expectBlocked(page);
    await expect(page.locator('#clcrResultReport')).toContainText(/niepełn/i);
  }
  await page.locator('#clearBtn').click();
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await expect(page.locator('#Cl24CollectionProblem')).not.toBeChecked();
  await page.locator('[data-cit-dzm-mode="concentration"]').click();
  await page.locator('#CITDZM_concentration').fill('0.8'); await page.locator('#CITDZM_volume').fill('1000');
  await expectResult(page);
});

test('Cit DZM: wybór wyszukanej formuły przewija do pierwszego brakującego pola i podświetla dwa dane', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCalculator(page, 390); await restore(page, { CITDZM_concentration: '', CITDZM_volume: '' });
  const count = await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount);
  await page.locator('#formulaSearch').fill('dobowe wydalanie cytrynianów');
  await page.locator('.clcr-search-result[data-formula-id="Cit_mgkg"]').click();
  await expect.poll(() => page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount)).toBe(count + 1);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.lastTarget)).toBe('CITDZM_concentration');
  await expect(page.locator('#CITDZM_concentration')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#CITDZM_volume')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#clcrForm .clcr-missing-input:visible')).toHaveCount(2);
  await expect.poll(() => page.locator('#CITDZM_concentration').evaluate(node => {
    const rect = node.getBoundingClientRect(); return rect.top >= 40 && rect.bottom <= innerHeight - 40;
  })).toBe(true);
});

test('Cit DZM: dokładny wynik tuż poniżej dolnej granicy normy mieści się w karcie 320px', async ({ page }) => {
  await openCalculator(page, 320);
  await restore(page, { age: '40', sex: 'M', CITDZM_inputMode: 'reported', CITDZM_reportedValue: '1.69999999999999999999' });
  await expectResult(page, { raw: 1.7, outOfRange: true });
  await geometry(page, 320);
  await expect(card(page)).toContainText('1,69999999999999999999');
});

test('Cit DZM: stan sesji i przełączanie formuł zachowują ilość, nowy pacjent nie dziedziczy wyniku', async ({ page }) => {
  await openCalculator(page); await page.waitForFunction(() => !window.VildaPersistence?.isAutosaveSuppressed?.());
  await restore(page); await chooseNativeUnit(page, '#CITDZM_volumeUnit', 'L');
  const conversions = await page.locator('#CITDZM_unitConversions').inputValue();
  await choose(page, 'Ox_mgkg'); await choose(page, 'Cit_mgkg');
  await expectResult(page);
  await expect(page.locator('#CITDZM_unitConversions')).toHaveValue(conversions);
  await expect.poll(() => page.evaluate(() => {
    const saved = window.VildaPersistence?.readClcrSession?.() || JSON.parse(sessionStorage.getItem('vildaClcrSessionV1') || 'null');
    return saved?.inputs?.CITDZM_volumeUnit;
  })).toBe('L');
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterGuest(page, { calculator: true });
  await expect(page.locator('#CITDZM_volumeUnit')).toHaveValue('L'); await expectResult(page);
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'Cit_mgkg', inputs: { age: '12', sex: 'M' } });
  await expectBlocked(page);
  await expect(page.locator('#CITDZM_concentration')).toHaveValue('');
  await expect(page.locator('#CITDZM_unitConversions')).toHaveValue('');
});

test('Cit DZM: dokładne wartości i brak normy pozostają zamrożone w Badaniach i wykresie', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  await restore(page, { CITDZM_concentration: '0.000001' });
  const small = await expectResult(page, { raw: 0.000001, outOfRange: true, guest: false });
  const [first] = await saveVisible(page, '2026-10-24');
  expect(first.labResult.valueNum).toBe(0.000001); expect(first.labResult.value).toBe(small.presentation.valueText);
  await restore(page, { weight: '', height: '' });
  await expectResult(page, { reference: false, outOfRange: null, guest: false });
  const [second] = await saveVisible(page, '2026-10-25');
  const projected = await page.evaluate(notes => {
    const producer = window.VildaClcrCitDzm;
    window.VildaClcrCitDzm = new Proxy({}, { get() { return () => { throw new Error('History must not recalculate citrate'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; } finally { window.VildaClcrCitDzm = producer; }
  }, [first, second]);
  expect(projected[0]).toMatchObject({ valueNum: 0.000001, displayValue: small.presentation.valueText, outOfRange: true });
  expect(projected[1]).toMatchObject({ valueNum: 0.8, outOfRange: null });
  await page.evaluate(notes => { window.__citDzmFictionalNotes = notes; }, [first, second]);
  const history = await readVisibleSavedHistory(page, '__citDzmFictionalNotes');
  expect(history.visible).toBe(true); expect(history.ids).toEqual(history.originalIds);
  await page.locator('#clcrOpenBadaniaBtn').click();
  await showClcrResults(page, 'charts');
  await expect(clcrPoints(page)).toHaveCount(2);
  await expect(clcrPoint(page, first.id)).toBeVisible();
  await expect(clcrPoint(page, first.id)).toHaveAttribute('data-value', '0.000001');
  await expect(clcrPoint(page, first.id)).toHaveAttribute('data-tone', 'below');
  await expect(clcrPoint(page, second.id)).toBeVisible();
  await expect(clcrPoint(page, second.id)).toHaveAttribute('data-value', '0.8');
  await expect(clcrPoint(page, second.id)).toHaveAttribute('data-tone', 'neutral');
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Cit DZM: edycja i usunięcie dotyczą jednego pomiaru, Notatki pozostają czytelne', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page);
  const [first] = await saveVisible(page, '2026-10-24');
  await restore(page, { CITDZM_inputMode: 'reported', CITDZM_reportedValue: '1.5' });
  const [sibling] = await saveVisible(page, '2026-10-25');
  await page.locator('#clcrOpenBadaniaBtn').click(); await showClcrResults(page, 'table');
  await page.locator('button[data-tab="notes"]').click();
  const notes = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]'); await expect(notes).toHaveCount(2);
  for (const key of ['VILDA_CLCR', 'engineVersion', 'exactMain', '[tekst]']) await expect(notes.first()).not.toContainText(key);
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), first);
  await page.locator('#editMeasurement').click(); await page.locator('#editField-CITDZM_concentration').fill('1.4');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  let stored = await memory(page);
  expect(stored.notes.find(note => note.id === first.id).labResult.valueNum).toBe(1.4);
  expect(stored.notes.find(note => note.id === sibling.id)).toEqual(sibling);
  await page.locator('#deleteMeasurement').click(); await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).toBeHidden(); stored = await memory(page);
  expect(stored.notes).toEqual([sibling]); expect(stored.originalsLocked).toBe(true);
});

test('Cit DZM: eksporty AI i Word używają jednej wartości, jednostki i zapisanej normy', async ({ page }) => {
  await openCalculator(page); await restore(page);
  await page.evaluate(() => {
    window.__citDzmClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__citDzmClipboard = value; } } });
    window.alert = () => {};
  });
  const model = await expectResult(page);
  const expected = [model.presentation.valueText, model.unit, model.presentation.referenceText, model.interpretation];
  await page.locator('#askAI').click(); await expect.poll(() => page.evaluate(() => window.__citDzmClipboard)).toContain(model.presentation.valueText);
  const copied = await page.evaluate(() => window.__citDzmClipboard);
  for (const value of expected) expect(copied.replace(/\s/g, '')).toContain(value.replace(/\s/g, ''));
  const pending = page.waitForEvent('download'); await page.locator('#downloadDOCX').click();
  const download = await pending, html = await fs.readFile(await download.path(), 'utf8');
  const text = await page.evaluate(value => new DOMParser().parseFromString(value, 'text/html').body.textContent, html);
  for (const value of expected) expect(text.replace(/\s/g, '')).toContain(value.replace(/\s/g, ''));
});

test('Cit DZM: dorosła granica zależy od płci, równość jest nieobniżona, a wysoki wynik nie dostaje sztucznego alarmu', async ({ page }) => {
  await openCalculator(page);
  for (const sample of [
    { sex: 'M', value: '1.7', outside: false },
    { sex: 'F', value: '1.7', outside: true },
    { sex: 'F', value: '1.9', outside: false },
    { sex: 'M', value: '5', outside: false },
  ]) {
    await restore(page, { age: '40', sex: sample.sex, weight: '', height: '', CITDZM_inputMode: 'reported', CITDZM_reportedValue: sample.value });
    const result = await expectResult(page, { raw: Number(sample.value), outOfRange: sample.outside });
    expect(result.reference.operator).toBe('≥');
    expect(result.reference.lower).toBe(sample.sex === 'M' ? 1.7 : 1.9);
    expect(result.tone).toBe(sample.outside ? 'warning' : 'normal');
  }
});

test('Cit DZM: ścisła granica pediatryczna oraz jednostki masowe zachowują tę samą ocenę', async ({ page }) => {
  await openCalculator(page);
  // 100 kg × 107.7444 cm / 3600 = 1.73² exactly. This isolates the
  // strict pediatric boundary from an approximate square root and units.
  for (const sample of [
    { sex: 'F', value: '1.6', mass: 302.5584, status: 'boundary', outside: true },
    { sex: 'F', value: '1.6001', mass: 302.5773099, status: 'within', outside: false },
    { sex: 'M', value: '1.9', mass: 359.2881, status: 'boundary', outside: true },
  ]) {
    await restore(page, { age: '15', sex: sample.sex, weight: '100', height: '107.7444', CITDZM_inputMode: 'reported', CITDZM_reportedValue: sample.value, CITDZM_reportingEntity: 'citrate_ion' });
    const result = await expectResult(page, { raw: Number(sample.value), outOfRange: sample.outside });
    expect(result.status).toBe(sample.status); expect(result.reference.operator).toBe('>');
    await chooseNativeUnit(page, '#CITDZM_reportedUnit', 'mg/24h');
    const mass = await expectResult(page, { raw: sample.mass, unit: 'mg/24 h', outOfRange: sample.outside });
    expect(mass.status).toBe(sample.status);
    await chooseNativeUnit(page, '#CITDZM_reportedUnit', 'mmol/24h');
    const restored = await expectResult(page, { raw: Number(sample.value), outOfRange: sample.outside });
    expect(restored.status).toBe(sample.status);
  }
});

test('Cit DZM: nieznana postać przy zmianie mmol na mg odsłania wybór i zachowuje ilość', async ({ page }) => {
  await openCalculator(page, 390); await restore(page);
  await page.locator('#CITDZM_concentrationUnit').focus(); await page.locator('#CITDZM_concentrationUnit').press('End');
  await expect(page.locator('#CITDZM_concentrationUnit')).toHaveValue('mmol/L');
  await expect(page.locator('#CITDZM_concentration')).toHaveValue('0.8');
  await expect(page.locator('#CITDZM_reportingEntity')).toBeVisible();
  await page.locator('#CITDZM_reportingEntity').selectOption('citric_acid');
  await chooseNativeUnit(page, '#CITDZM_concentrationUnit', 'mg/L');
  await expectResult(page, { raw: 153.6988, unit: 'mg/24 h' });
  await chooseNativeUnit(page, '#CITDZM_concentrationUnit', 'mmol/L');
  await expectResult(page);
});

test('Cit DZM: pusty czas pozostaje 24h, a spacje nie zmieniają granicy oceny', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { age: '40', sex: 'M', CITDZM_concentration: '1.7 ', CITDZM_collectionHours: '24.0 ', CITDZM_collectionSource: 'hours' });
  await expectResult(page, { raw: 1.7, outOfRange: false });
  await restore(page, { age: '40', sex: 'M', CITDZM_concentration: '1.7', CITDZM_collectionHours: '', CITDZM_collectionSource: 'assumed-24h' });
  await expectResult(page, { raw: 1.7, outOfRange: false });
  await expect(page.locator('#CITDZM_collectionHours')).toHaveValue('24');
});

test('Cit DZM: edytor pozwala zmienić tryb, jednostki i postać bez podmiany danych pacjenta z dnia zapisu', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page);
  const [original] = await saveVisible(page, '2026-10-24');
  await restore(page, { age: '40', sex: 'M', weight: '90', height: '180' });
  await page.evaluate(pid => window.VildaAuthUI.showPatientCard(pid, null, null, { activeTab: 'lab' }), original.patientId); await showClcrResults(page, 'table');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), original);
  await page.locator('#editMeasurement').click();
  for (const id of ['inputMode', 'concentrationUnit', 'volumeUnit', 'reportingEntity']) await expect(page.locator('#editField-CITDZM_' + id)).toBeVisible();
  await expect(page.locator('#editField-CITDZM_concentrationUnit')).toHaveValue('mmol/L');
  await page.locator('#editField-CITDZM_inputMode').selectOption('reported');
  await expect(page.locator('#editField-CITDZM_concentration')).toHaveCount(0);
  await expect(page.locator('#editField-CITDZM_reportedUnit')).toBeVisible();
  await page.locator('#editField-CITDZM_reportedValue').fill('400');
  await page.locator('#editField-CITDZM_reportedUnit').selectOption('mg/24h');
  await page.locator('#editField-CITDZM_reportingEntity').selectOption('citric_acid');
  await page.locator('#editDate').fill('2026-11-01');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const edited = (await memory(page)).notes.find(note => note.id === original.id);
  expect(edited.labResult).toMatchObject({ valueNum: 400, unit: 'mg/24 h' });
  expect(edited.clinicalDateISO).toBe('2026-11-01');
  const snapshot = await page.evaluate(note => window.ClcrCitDzmPersistence.savedAssessment(note), edited);
  expect(snapshot).toMatchObject({ outOfRange: false, reportingBasis: 'citric-acid', input: { mode: 'reported', sex: 'F' } });
  expect(Number(snapshot.input.ageYears)).toBe(10); expect(Number(snapshot.input.weightKg)).toBe(30); expect(Number(snapshot.input.heightCm)).toBe(140);
  expect(snapshot.reference.lower).toBeCloseTo(191.92332725557807, 10);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Cit DZM: edycja gotowego wyniku z nieznanym dawnym czasem nie wymaga wymyślenia 24 godzin', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  await restore(page, { CITDZM_inputMode: 'reported', CITDZM_reportedValue: '1.9', CITDZM_collectionHours: '', CITDZM_collectionSource: 'historical-missing', CITDZM_durationNeedsConfirmation: true });
  await expectResult(page, { raw: 1.9, reference: false, outOfRange: null, guest: false });
  const [original] = await saveVisible(page, '2026-10-24');
  await page.locator('#clcrOpenBadaniaBtn').click(); await showClcrResults(page, 'table');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), original);
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editField-CITDZM_collectionHours')).toHaveValue('');
  expect(await page.locator('#editField-CITDZM_collectionHours').evaluate(field => field.required)).toBe(false);
  await page.locator('#editField-CITDZM_reportedValue').fill('2.4');
  await page.locator('#editDate').fill('2026-11-01');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const edited = (await memory(page)).notes.find(note => note.id === original.id);
  const snapshot = await page.evaluate(note => window.ClcrCitDzmPersistence.savedAssessment(note), edited);
  expect(edited.labResult).toMatchObject({ valueNum: 2.4, unit: 'mmol/24 h' });
  expect(edited.clinicalDateISO).toBe('2026-11-01');
  expect(snapshot).toMatchObject({ referenceAvailable: false, outOfRange: null, input: { hours: '', durationSource: 'historical-missing' } });
  expect((await memory(page)).originalsLocked).toBe(true);
});
