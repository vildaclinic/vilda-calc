import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, saveVisible } from '../support/klirens-patient-record.mjs';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { clcrPoint, clcrPoints, showClcrResults } from '../support/badania-klirens.mjs';
import { applySession, card, choose, chooseNativeUnit, details, expectBlocked, expectResult, openCalculator, restore } from '../support/klirens-ox-dzm-browser.mjs';

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), active: box('#clcrActivePanel'), input: box('#oxDzmInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      controls: [...document.querySelectorAll('#oxDzmInputCard input,#oxDzmInputCard select,#oxDzmInputCard button')].filter(node => node.checkVisibility()).map(node => ({
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

test('Ox DZM: odświeżenie pustego formularza nie pokazuje przycisku czyszczenia przed wyborem formuły', async ({ page }) => {
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
  await choose(page, 'Ox_mgkg');
  await expect(page.locator('#oxDzmInputCard')).toBeVisible();
  await expect(page.locator('#clearContainer')).toBeVisible();
  await expect(page.locator('#clearBtn')).toBeVisible();
  await page.evaluate(() => window.clcrUpdate());
  await expect(page.locator('#clearBtn')).toBeVisible();
});

for (const width of [1440, 390, 320]) {
  test(`Ox DZM: dwa pomiary, jeden wynik i stały układ ${width}px`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page, { OXDZM_concentration: '', OXDZM_volume: '' });
    await expectBlocked(page);
    for (const id of ['U_Ox', 'V24', 'oxalateReportingEntity', 'weight', 'height', 'age', 'stoneTwoCollectionsConfirmed']) await expect(page.locator('#' + id)).toBeHidden();
    await expect(page.locator('#OXDZM_collectionHours')).toHaveValue('24');
    const initial = await geometry(page, width);
    await page.locator('#OXDZM_concentration').fill('100');
    await page.locator('#OXDZM_volume').fill('1500');
    await expectResult(page, { raw: 0.15, outOfRange: false });
    await expect(page.locator('#oxDzmInputCard')).toContainText('2/2');
    await expect(page.locator('#clcrDataCompletion')).toBeHidden();
    sameWidths(initial, await geometry(page, width));
    await page.locator('[data-ox-dzm-mode="reported"]').click();
    await page.locator('#OXDZM_reportedValue').fill('0.6');
    await expectResult(page, { raw: 0.6 });
    await expect(page.locator('#oxDzmInputCard')).toContainText('1/1');
    const colors = await card(page).evaluate(node => ({
      value: getComputedStyle(node.querySelector('.clcr-result-value')).color,
      reference: getComputedStyle(node.querySelector('.ox-dzm-reference-value')).color,
      unit: getComputedStyle(node.querySelector('.ox-dzm-reference-unit')).color,
    }));
    expect(colors.value).not.toBe(colors.reference);
    expect(colors.reference).toBe(colors.unit);
    sameWidths(initial, await geometry(page, width));
    await details(page).locator('summary').click();
    sameWidths(initial, await geometry(page, width));
    const shot = testInfo.outputPath(`ox-dzm-${width}.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: shot });
    await testInfo.attach(`ox-dzm-${width}`, { path: shot, contentType: 'image/png' });
    await page.locator('#clearBtn').click();
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expect(page.locator('#formulaPicker')).toHaveValue('Ox_mgkg');
    await expect(page.locator('#OXDZM_concentration')).toHaveValue('');
    await expect(page.locator('#OXDZM_reportedValue')).toHaveValue('');
    await expect(page.locator('#OXDZM_collectionHours')).toHaveValue('24');
    await expect(page.locator('#age')).toHaveValue('10');
    await expectBlocked(page);
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('Ox DZM: brak danych pacjenta lub BSA nie blokuje liczby i nie nadaje dorosłej normy', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [{ age: '', ageMonths: '', weight: '', height: '' }, { weight: '', height: '' }, { weight: '', height: '140' }, { weight: '30', height: '' }]) {
    await restore(page, fields);
    await expectResult(page, { reference: false, outOfRange: null });
    await expect(page.locator('#oxDzmInputCard')).toContainText('2/2');
    await expect(page.locator('#clcrReadiness')).toBeHidden();
  }
  await restore(page, { age: '40', weight: '', height: '' });
  await expectResult(page, { outOfRange: false });
});

test('Ox DZM: nieznana postać masowa daje ilość bez wymuszonego przeliczenia lub normy', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { age: '40', weight: '', height: '', OXDZM_concentration: '20', OXDZM_concentrationUnit: 'mg/L' });
  await expectResult(page, { raw: 30, unit: 'mg/24 h', reference: false, outOfRange: null });
  await page.locator('[aria-controls="oxDzmEntityEditor"]').click();
  await page.locator('#OXDZM_reportingEntity').selectOption('oxalic_acid');
  await expectResult(page, { raw: 30, unit: 'mg/24 h', outOfRange: false });
  await restore(page, { age: '40', OXDZM_inputMode: 'reported', OXDZM_reportedValue: '50', OXDZM_reportedUnit: 'mg/24h', OXDZM_reportingEntity: 'oxalic_acid' });
  await expectResult(page, { raw: 50, unit: 'mg/24 h' });
});

test('Ox DZM: zero pozostaje zerem, a mała dodatnia ilość pozostaje dodatnia także w zapisie', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { OXDZM_concentration: '0.1' });
  const small = await expectResult(page, { raw: 0.00015, outOfRange: false });
  expect(small.presentation.valueText).not.toMatch(/^0(?:[.,]0+)?$/);
  await restore(page, { OXDZM_concentration: '0' });
  await expectResult(page, { raw: 0, outOfRange: false });
  await expect(page.locator('#OXDZM_concentration')).not.toHaveClass(/clcr-missing-input/);
  for (const OXDZM_concentration of ['-1', 'abc', '1e999']) {
    await restore(page, { OXDZM_concentration });
    await expectBlocked(page);
  }
});

test('Ox DZM: zmiana jednostek nie zmienia ilości, a nieznana postać nie pozwala zgadnąć moli', async ({ page }) => {
  await openCalculator(page); await restore(page, { OXDZM_reportingEntity: 'oxalate_ion' });
  await chooseNativeUnit(page, '#OXDZM_concentrationUnit', 'mmol/L');
  await expectResult(page);
  await chooseNativeUnit(page, '#OXDZM_volumeUnit', 'L');
  await expect(page.locator('#OXDZM_volume')).toHaveValue('1,5');
  await expectResult(page);
  await chooseNativeUnit(page, '#OXDZM_concentrationUnit', 'mg/L');
  await expectResult(page, { raw: 26.4057, unit: 'mg/24 h' });
  await chooseNativeUnit(page, '#OXDZM_concentrationUnit', 'µmol/L');
  await expectResult(page);
  await restore(page);
  await page.locator('#OXDZM_concentrationUnit').focus();
  await page.locator('#OXDZM_concentrationUnit').press('End');
  // A prevented conversion deliberately restores the original selector.
  await expect(page.locator('#OXDZM_concentrationUnit')).toHaveValue('µmol/L');
  await expect(page.locator('#OXDZM_concentration')).toHaveValue('200');
  await expect(page.locator('#OXDZM_reportingEntity')).toHaveValue('unknown');
  await expectResult(page);
});

test('Ox DZM: czas inny niż 24h i znana niepełna zbiórka zachowują swoje znaczenie', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { OXDZM_collectionHours: '12', OXDZM_collectionSource: 'hours' });
  await expectResult(page, { raw: 0.6, reference: false, outOfRange: null });
  await page.locator('[data-ox-dzm-mode="reported"]').click();
  await page.locator('#OXDZM_reportedValue').fill('0.3');
  await expectResult(page, { raw: 0.3, reference: false, outOfRange: null });
  for (const OXDZM_collectionHours of ['0', '-1', 'abc']) {
    await restore(page, { OXDZM_collectionHours }); await expectBlocked(page);
  }
  for (const OXDZM_inputMode of ['concentration', 'reported']) {
    await restore(page, { OXDZM_inputMode, OXDZM_reportedValue: '0.3', Cl24CollectionProblem: true });
    await expectResult(page, { reference: false, outOfRange: null });
    await expect(card(page)).toContainText('Niepełna zbiórka');
  }
  await page.locator('#clearBtn').click();
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await expect(page.locator('#Cl24CollectionProblem')).not.toBeChecked();
  await page.locator('#OXDZM_concentration').fill('200'); await page.locator('#OXDZM_volume').fill('1500');
  await expectResult(page);
});

test('Ox DZM: wybór wyszukanej formuły przewija do pierwszego brakującego pola i podświetla dwa dane', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openCalculator(page, 390); await restore(page, { OXDZM_concentration: '', OXDZM_volume: '' });
  const count = await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount);
  await page.locator('#formulaSearch').fill('dobowe wydalanie szczawianów');
  await page.locator('.clcr-search-result[data-formula-id="Ox_mgkg"]').click();
  await expect.poll(() => page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount)).toBe(count + 1);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.lastTarget)).toBe('OXDZM_concentration');
  await expect(page.locator('#OXDZM_concentration')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#OXDZM_volume')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#clcrForm .clcr-missing-input:visible')).toHaveCount(2);
  await expect.poll(() => page.locator('#OXDZM_concentration').evaluate(node => {
    const rect = node.getBoundingClientRect(); return rect.top >= 40 && rect.bottom <= innerHeight - 40;
  })).toBe(true);
});

test('Ox DZM: dokładny wynik tuż pod granicą normy mieści się w karcie 320px', async ({ page }) => {
  await openCalculator(page, 320);
  await restore(page, { age: '40', OXDZM_inputMode: 'reported', OXDZM_reportedValue: '0.45999999999999999999' });
  await expectResult(page, { raw: 0.46, outOfRange: false });
  await geometry(page, 320);
  await expect(card(page)).toContainText('0,45999999999999999999');
});

test('Ox DZM: stan sesji i przełączanie formuł zachowują ilość, nowy pacjent nie dziedziczy wyniku', async ({ page }) => {
  await openCalculator(page); await page.waitForFunction(() => !window.VildaPersistence?.isAutosaveSuppressed?.());
  await restore(page); await chooseNativeUnit(page, '#OXDZM_volumeUnit', 'L');
  const conversions = await page.locator('#OXDZM_unitConversions').inputValue();
  await choose(page, 'Cit_mgkg'); await choose(page, 'Ox_mgkg');
  await expectResult(page);
  await expect(page.locator('#OXDZM_unitConversions')).toHaveValue(conversions);
  await expect.poll(() => page.evaluate(() => {
    const saved = window.VildaPersistence?.readClcrSession?.() || JSON.parse(sessionStorage.getItem('vildaClcrSessionV1') || 'null');
    return saved?.inputs?.OXDZM_volumeUnit;
  })).toBe('L');
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterGuest(page, { calculator: true });
  await expect(page.locator('#OXDZM_volumeUnit')).toHaveValue('L'); await expectResult(page);
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'Ox_mgkg', inputs: { age: '12', sex: 'M' } });
  await expectBlocked(page);
  await expect(page.locator('#OXDZM_concentration')).toHaveValue('');
  await expect(page.locator('#OXDZM_unitConversions')).toHaveValue('');
});

test('Ox DZM: dokładne wartości i brak normy pozostają zamrożone w Badaniach i wykresie', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  await restore(page, { OXDZM_concentration: '0.1' });
  const small = await expectResult(page, { raw: 0.00015, outOfRange: false, guest: false });
  const [first] = await saveVisible(page, '2026-10-24');
  expect(first.labResult.valueNum).toBe(0.00015); expect(first.labResult.value).toBe(small.presentation.valueText);
  await restore(page, { weight: '', height: '' });
  await expectResult(page, { reference: false, outOfRange: null, guest: false });
  const [second] = await saveVisible(page, '2026-10-25');
  const projected = await page.evaluate(notes => {
    const producer = window.VildaClcrOxDzm;
    window.VildaClcrOxDzm = new Proxy({}, { get() { return () => { throw new Error('History must not recalculate oxalate'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; } finally { window.VildaClcrOxDzm = producer; }
  }, [first, second]);
  expect(projected[0]).toMatchObject({ valueNum: 0.00015, displayValue: small.presentation.valueText, outOfRange: false });
  expect(projected[1]).toMatchObject({ valueNum: 0.3, outOfRange: null });
  await page.evaluate(notes => { window.__oxDzmFictionalNotes = notes; }, [first, second]);
  const history = await readVisibleSavedHistory(page, '__oxDzmFictionalNotes');
  expect(history.visible).toBe(true); expect(history.ids).toEqual(history.originalIds);
  await page.locator('#clcrOpenBadaniaBtn').click();
  await showClcrResults(page, 'charts');
  await expect(clcrPoints(page)).toHaveCount(2);
  await expect(clcrPoint(page, first.id)).toBeVisible();
  await expect(clcrPoint(page, first.id)).toHaveAttribute('data-value', '0.00015');
  await expect(clcrPoint(page, first.id)).toHaveAttribute('data-tone', 'within');
  await expect(clcrPoint(page, second.id)).toBeVisible();
  await expect(clcrPoint(page, second.id)).toHaveAttribute('data-value', '0.3');
  await expect(clcrPoint(page, second.id)).toHaveAttribute('data-tone', 'neutral');
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Ox DZM: edycja i usunięcie dotyczą jednego pomiaru, Notatki pozostają czytelne', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page);
  const [first] = await saveVisible(page, '2026-10-24');
  await restore(page, { OXDZM_inputMode: 'reported', OXDZM_reportedValue: '0.4' });
  const [sibling] = await saveVisible(page, '2026-10-25');
  await page.locator('#clcrOpenBadaniaBtn').click(); await showClcrResults(page, 'table');
  await page.locator('button[data-tab="notes"]').click();
  const notes = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]'); await expect(notes).toHaveCount(2);
  for (const key of ['VILDA_CLCR', 'engineVersion', 'exactMain', '[tekst]']) await expect(notes.first()).not.toContainText(key);
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), first);
  await page.locator('#editMeasurement').click(); await page.locator('#editField-OXDZM_concentration').fill('400');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  let stored = await memory(page);
  expect(stored.notes.find(note => note.id === first.id).labResult.valueNum).toBe(0.6);
  expect(stored.notes.find(note => note.id === sibling.id)).toEqual(sibling);
  await page.locator('#deleteMeasurement').click(); await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).toBeHidden(); stored = await memory(page);
  expect(stored.notes).toEqual([sibling]); expect(stored.originalsLocked).toBe(true);
});

test('Ox DZM: eksporty AI i Word używają jednej wartości, jednostki i zapisanej normy', async ({ page }) => {
  await openCalculator(page); await restore(page);
  await page.evaluate(() => {
    window.__oxDzmClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__oxDzmClipboard = value; } } });
    window.alert = () => {};
  });
  const model = await expectResult(page);
  const expected = [model.presentation.valueText, model.unit, model.presentation.referenceText, model.interpretation];
  await page.locator('#askAI').click(); await expect.poll(() => page.evaluate(() => window.__oxDzmClipboard)).toContain(model.presentation.valueText);
  const copied = await page.evaluate(() => window.__oxDzmClipboard);
  for (const value of expected) expect(copied.replace(/\s/g, '')).toContain(value.replace(/\s/g, ''));
  const pending = page.waitForEvent('download'); await page.locator('#downloadDOCX').click();
  const download = await pending, html = await fs.readFile(await download.path(), 'utf8');
  const text = await page.evaluate(value => new DOMParser().parseFromString(value, 'text/html').body.textContent, html);
  for (const value of expected) expect(text.replace(/\s/g, '')).toContain(value.replace(/\s/g, ''));
});
