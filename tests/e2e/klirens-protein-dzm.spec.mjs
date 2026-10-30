import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, openShellCalculator, saveVisible } from '../support/klirens-patient-record.mjs';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { applySession, card, choose, chooseNativeUnit, details, displayedNumber, expectBlocked, expectResult, openCalculator, restore } from '../support/protein-dzm.mjs';

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), active: box('#clcrActivePanel'), input: box('#proteinDzmInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      controls: [...document.querySelectorAll('#proteinDzmInputCard input,#proteinDzmInputCard select,#proteinDzmInputCard button,[data-protein-dzm-output-unit]')].filter(node => node.checkVisibility()).map(node => ({
        id: node.id || node.textContent.trim(), font: parseFloat(getComputedStyle(node).fontSize),
        height: node.getBoundingClientRect().height, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
      })),
      numbers: [...document.querySelectorAll('#clcrResultReport .clcr-result-value,#clcrResultReport .protein-dzm-reference-value')].map(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const text = range.getBoundingClientRect(), rect = node.getBoundingClientRect();
        return { text: node.textContent, left: text.left, right: text.right, boxLeft: rect.left, boxRight: rect.right };
      }),
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
  for (const number of result.numbers) {
    expect(number.left, number.text).toBeGreaterThanOrEqual(number.boxLeft - 0.5);
    expect(number.right, number.text).toBeLessThanOrEqual(number.boxRight + 0.5);
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
  test(`Białko DZM: dwa pola, jedna karta i stały układ ${width}px`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await expect(page.locator('#Prot_collectionHours')).toHaveValue('24');
    await restore(page, { Prot_concentration: '', Prot_volume: '' });
    await expectBlocked(page);
    await expect(page.locator('#proteinDzmInputCard input:visible')).toHaveCount(2);
    await expect(page.locator('#proteinDzmInputCard select:visible')).toHaveCount(2);
    for (const id of ['weight', 'height', 'Prot_collectionHours', 'collectionStartAt', 'collectionEndAt', 'U_Prot', 'V24']) await expect(page.locator('#' + id)).toBeHidden();
    const initial = await geometry(page, width);
    await page.locator('#Prot_concentration').fill('200'); await page.locator('#Prot_volume').fill('1500');
    const model = await expectResult(page);
    expect(model.presentation.referenceValue).toBe('<150');
    await expect(card(page)).toContainText('Norma dla pacjenta');
    await expect(page.locator('#clcrInfo')).toBeEmpty();
    sameWidths(initial, await geometry(page, width));
    const colors = await card(page).evaluate(node => ({
      value: getComputedStyle(node.querySelector('.clcr-result-value')).color,
      ref: getComputedStyle(node.querySelector('.protein-dzm-reference-value')).color,
      unit: getComputedStyle(node.querySelector('.protein-dzm-reference-unit')).color,
    }));
    expect(colors.value).not.toBe(colors.ref); expect(colors.ref).toBe(colors.unit);
    await page.locator('[data-protein-dzm-mode="reported"]').click();
    await expect(page.locator('#proteinDzmInputCard input:visible')).toHaveCount(1);
    await page.locator('#Prot_reportedValue').fill('149.99999999999997');
    await expectResult(page, { raw: 149.99999999999997, status: 'within', tone: 'normal' });
    await page.locator('[data-protein-dzm-output-unit]').selectOption('g/24h');
    const below = await expectResult(page, { raw: 149.99999999999997, status: 'within', tone: 'normal', unit: 'g/24 h' });
    expect(displayedNumber(below.presentation.valueText)).toBeLessThan(0.15);
    sameWidths(initial, await geometry(page, width));
    await details(page).locator('summary').click();
    sameWidths(initial, await geometry(page, width));
    for (const term of [/150/, /powierzchni/i, /KDIGO/, /AEP/]) await expect(details(page)).toContainText(term);
    const screenshot = testInfo.outputPath(`protein-dzm-${width}.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: screenshot });
    await testInfo.attach(`protein-dzm-${width}`, { path: screenshot, contentType: 'image/png' });
    await page.locator('#clearBtn').click(); await page.waitForFunction(() => window.clcrIsResetting !== true);
    await choose(page); await expectBlocked(page);
    await expect(page.locator('#Prot_collectionHours')).toHaveValue('24');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('Białko DZM: jednostki zachowują ten sam pomiar i dokładną stronę granicy', async ({ page }) => {
  await openCalculator(page);
  for (const [Prot_concentration, Prot_concentrationUnit, Prot_volume, Prot_volumeUnit] of [
    ['200', 'mg/L', '1500', 'mL'], ['20', 'mg/dL', '1.5', 'L'], ['0.2', 'g/L', '1500', 'mL'],
  ]) {
    await restore(page, { Prot_concentration, Prot_concentrationUnit, Prot_volume, Prot_volumeUnit });
    await expectResult(page);
  }
  await restore(page, { Prot_inputMode: 'reported', Prot_reportedValue: '0.3', Prot_reportedUnit: 'g/24h', Prot_outputUnit: 'g/24h' });
  await expectResult(page, { unit: 'g/24 h' });
  const collected = await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'Prot_mgkg' }));
  expect(collected).toHaveLength(1); expect(collected[0]).toMatchObject({ id: 'Prot_mg24', valueNum: 0.3, unit: 'g/24 h' });
  await restore(page, { Prot_inputMode: 'reported', Prot_reportedValue: '150' });
  for (const unit of ['g/24h', 'mg/24h', 'g/24h', 'mg/24h']) {
    await chooseNativeUnit(page, '#Prot_reportedUnit', unit);
    await expectResult(page, { raw: 150 });
  }
  await restore(page);
  for (const unit of ['mg/dL', 'g/L', 'mg/L']) { await chooseNativeUnit(page, '#Prot_concentrationUnit', unit); await expectResult(page); }
  for (const unit of ['L', 'mL']) { await chooseNativeUnit(page, '#Prot_volumeUnit', unit); await expectResult(page); }
});

test('Białko DZM: norma korzysta z danych pacjenta, limit nie zmienia kryterium nerczycowego', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { Prot_inputMode: 'reported', Prot_reportedValue: '150' });
  await expectResult(page, { raw: 150 });
  await restore(page, { Prot_inputMode: 'reported', Prot_reportedValue: '1200' });
  await expectResult(page, { raw: 1200, status: 'nephrotic', tone: 'danger' });
  await restore(page, { age: '18', Prot_inputMode: 'reported', Prot_reportedValue: '1200' });
  await expectResult(page, { raw: 1200 });
  await restore(page, { age: '18', Prot_inputMode: 'reported', Prot_reportedValue: '3500' });
  await expectResult(page, { raw: 3500, status: 'nephrotic', tone: 'danger' });
  for (const fields of [
    { age: '', ageMonths: '', ageDays: '' }, { weight: '', height: '' }, { age: '0', ageMonths: '3', weight: '5.5', height: '60' },
  ]) {
    await restore(page, fields);
    await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  }
  await restore(page, { age: '0', ageMonths: '8', weight: '8', height: '70', Prot_inputMode: 'reported', Prot_reportedValue: '1000' });
  await expectResult(page, { raw: 1000 });
});

test('Białko DZM: zero, małe wyniki i ograniczenia zbiórki działają w obu trybach', async ({ page }) => {
  await openCalculator(page);
  for (const Prot_concentration of ['', '-1', 'NaN', 'Infinity', '0x10', '1x']) {
    await restore(page, { Prot_concentration }); await expectBlocked(page);
  }
  await restore(page, { Prot_concentration: '0' });
  await expectResult(page, { raw: 0, status: 'zero', tone: 'neutral', reference: false });
  await restore(page, { Prot_concentration: '0.01' });
  const tiny = await expectResult(page, { raw: 0.015, status: 'within', tone: 'normal' });
  expect(displayedNumber(tiny.display.text)).toBeGreaterThan(0);
  await restore(page, { Prot_collectionHours: '' }); await expectResult(page);
  await restore(page, { Prot_collectionHours: '12', Prot_collectionSource: 'user' });
  await expectResult(page, { raw: 600, status: 'unassessed', tone: 'neutral', reference: false });
  await page.locator('[data-protein-dzm-mode="reported"]').click(); await page.locator('#Prot_reportedValue').fill('300');
  await expect(page.locator('#Prot_collectionHours')).toHaveValue('12');
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  for (const Prot_inputMode of ['concentration', 'reported']) {
    for (const Prot_collectionHours of ['0', '-1', 'NaN']) {
      await restore(page, { Prot_inputMode, Prot_reportedValue: '300', Prot_collectionHours }); await expectBlocked(page);
    }
    await restore(page, { Prot_inputMode, Prot_reportedValue: '300', ui_collectionNoMissedVoids_answer: 'no' }); await expectBlocked(page);
  }
});

test('Białko DZM: wybór formuły prowadzi do dwóch braków, bez zmiany innych badań', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await openCalculator(page, 390);
  await restore(page, { Prot_concentration: '', Prot_volume: '', Scr: '0.7', U_Alb: '42' });
  const protectedIds = ['age', 'sex', 'weight', 'height', 'Scr', 'U_Alb'];
  const read = () => page.evaluate(ids => Object.fromEntries(ids.map(id => [id, document.getElementById(id).value])), protectedIds);
  const before = await read(), count = await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount);
  await page.locator('#formulaSearch').fill('białko całkowite');
  await page.locator('.clcr-search-result[data-formula-id="Prot_mgkg"]').click();
  await expect.poll(() => page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount)).toBe(count + 1);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.lastTarget)).toBe('Prot_concentration');
  await expect(page.locator('#Prot_concentration')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#Prot_volume')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#clcrForm .clcr-missing-input:visible')).toHaveCount(2);
  await expect.poll(() => page.locator('#Prot_concentration').evaluate(node => {
    const r = node.getBoundingClientRect(); return r.top >= 40 && r.bottom <= innerHeight - 40;
  })).toBe(true);
  expect(await read()).toEqual(before);
});

test('Białko DZM: jeden dokładny zapis i brak normy pozostają zamrożone w historii', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  await restore(page, { Prot_concentration: '0.01' });
  const tiny = await expectResult(page, { raw: 0.015, status: 'within', tone: 'normal', guest: false });
  const [small] = await saveVisible(page, '2026-10-24');
  expect((await memory(page)).notes).toHaveLength(1);
  expect(small.labResult.valueNum).toBeCloseTo(0.015, 12); expect(displayedNumber(small.labResult.value)).toBeGreaterThan(0);
  expect(small.labResult.value).toBe(tiny.display.text);
  await restore(page, { weight: '', height: '' });
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false, guest: false });
  const [unassessed] = await saveVisible(page, '2026-10-25');
  expect((await memory(page)).notes).toHaveLength(2);
  const projected = await page.evaluate(notes => {
    const producer = window.VildaClcrProteinDzm;
    window.VildaClcrProteinDzm = new Proxy({}, { get() { return () => { throw new Error('History must not recalculate protein with current patient/policy'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; } finally { window.VildaClcrProteinDzm = producer; }
  }, [small, unassessed]);
  expect(projected[0]).toMatchObject({ valueNum: small.labResult.valueNum, displayValue: tiny.display.text, outOfRange: false });
  expect(projected[1]).toMatchObject({ valueNum: 300, outOfRange: null });
  await page.evaluate(notes => { window.__proteinSyntheticNotes = notes; }, [small, unassessed]);
  const history = await readVisibleSavedHistory(page, '__proteinSyntheticNotes');
  expect(history.visible).toBe(true); expect(history.ids).toEqual(history.originalIds);
  expect(history.points[0].valueNum).toBeCloseTo(0.015, 12);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Białko DZM: edycja i usunięcie dotyczą jednego ID, a Notatki nie ujawniają danych technicznych', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page);
  const [first] = await saveVisible(page, '2026-10-24');
  await restore(page, { Prot_inputMode: 'reported', Prot_reportedValue: '100' });
  const [sibling] = await saveVisible(page, '2026-10-25');
  await page.locator('#clcrOpenBadaniaBtn').click();
  await page.locator('button[data-tab="notes"]').click();
  const notes = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]'); await expect(notes).toHaveCount(2);
  for (const key of ['VILDA_CLCR', 'engineVersion', 'exactMain', '[tekst]']) await expect(notes.first()).not.toContainText(key);
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), first);
  await page.locator('#editMeasurement').click(); await page.locator('#editField-Prot_concentration').fill('400');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  let stored = await memory(page); const edited = stored.notes.find(note => note.id === first.id);
  expect(edited.labResult.valueNum).toBe(600); expect(stored.notes.find(note => note.id === sibling.id)).toEqual(sibling);
  await page.locator('#deleteMeasurement').click(); await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).toBeHidden(); stored = await memory(page);
  expect(stored.notes).toEqual([sibling]); expect(stored.originalsLocked).toBe(true);
});

test('Białko DZM: trzy dawne reprezentacje pozostają trzema historycznymi zapisami bez dzisiejszej normy', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  const oldNotes = await page.evaluate(() => {
    const api = window.ClcrSavedCalculation, patientId = window.ClcrVisitSave.resolveCurrentPatientId();
    const values = { U_Prot: '300', Cl24DurationHours: '24', Cl24DurationSource: 'hours', age: '10', weight: '30', height: '140' };
    const notes = [
      ['Prot_mg24', 300, '300.0', 'mg/24 h'], ['Prot_g24', 0.3, '0.3', 'g/24 h'], ['Prot_bsa', 279.9110187825382, '279.9', 'mg/m²/24 h'],
    ].map(([id, value, displayValue, unit]) => {
      const point = { id, sourceFormulaId: 'Prot_mgkg', label: 'Fikcyjny dawny wynik białka', rawValue: value, valueNum: value, displayValue, unit, norm: '', tone: 'neutral', outOfRange: false };
      const snapshot = api.createSnapshot(point, { capture: { formulaId: 'Prot_mgkg', ageYears: 10, values, fields: Object.keys(values).map(field => ({ id: field, label: field, type: 'text' })) }, clinicalDateISO: '2025-10-21' });
      const note = { id: 'fictional-protein-legacy-' + id, patientId, category: 'wynik-klirens', rev: 1,
        title: point.label, clinicalDateISO: '2025-10-21', body: 'Kalkulator klirensu · clcr:' + id,
        labResult: { test: point.label, value: displayValue, valueNum: value, unit, norm: '' } };
      note.body += '\n\n' + api.serializeSnapshot(snapshot, note);
      if (!api.readSaved(note).valid) throw new Error('Fictional legacy protein envelope failed to round trip: ' + id);
      return note;
    });
    window.__clcrRecordFixture.seed(notes); window.__proteinLegacySyntheticNotes = notes; return notes;
  });
  const projected = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes).measurements, oldNotes);
  expect(projected).toHaveLength(3);
  expect(new Set(projected.map(point => point.parameterKey))).toEqual(new Set(['clcr:Prot_mg24', 'clcr:Prot_g24', 'clcr:Prot_bsa']));
  for (const point of projected) expect(point).toMatchObject({ norm: '', tone: 'neutral', outOfRange: null });
  expect(projected.map(point => point.valueNum)).toEqual([300, 0.3, 279.9110187825382]);
  const history = await readVisibleSavedHistory(page, '__proteinLegacySyntheticNotes');
  expect(history.visible).toBe(true); expect(history.ids).toEqual(history.originalIds); expect(history.points).toHaveLength(3);
  expect((await memory(page)).notes).toEqual(oldNotes);
});

test('Białko DZM: sesja pamięta jednostki i czas, a nowy pacjent nie dziedziczy wyniku', async ({ page }) => {
  await openCalculator(page); await page.waitForFunction(() => !window.VildaPersistence?.isAutosaveSuppressed?.());
  await restore(page, { Prot_concentration: '', Prot_volume: '' });
  await page.locator('[aria-controls="proteinDzmDurationEditor"]').click(); await page.locator('#Prot_collectionHours').fill('12');
  await page.locator('[data-protein-dzm-mode="reported"]').click(); await page.locator('#Prot_reportedValue').fill('300');
  await chooseNativeUnit(page, '#Prot_reportedUnit', 'g/24h');
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  const reported = await page.locator('#Prot_reportedValue').inputValue(), conversions = await page.locator('#Prot_unitConversions').inputValue();
  expect(conversions).not.toBe('');
  await expect.poll(() => page.evaluate(() => {
    const saved = window.VildaPersistence?.readClcrSession?.() || JSON.parse(sessionStorage.getItem('vildaClcrSessionV1') || 'null'), input = saved?.inputs || {};
    return { mode: input.Prot_inputMode, hours: input.Prot_collectionHours, unit: input.Prot_reportedUnit, value: input.Prot_reportedValue, conversions: input.Prot_unitConversions };
  })).toEqual({ mode: 'reported', hours: '12', unit: 'g/24h', value: reported, conversions });
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterGuest(page, { calculator: true });
  await expect(page.locator('#Prot_reportedValue')).toHaveValue(reported); await expect(page.locator('#Prot_collectionHours')).toHaveValue('12');
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'Prot_mgkg', inputs: { age: '12', sex: 'F' } });
  await expectBlocked(page); await expect(page.locator('#Prot_reportedValue')).toHaveValue(''); await expect(page.locator('#Prot_unitConversions')).toHaveValue('');
});

test('Białko DZM: eksporty AI i Word opisują ten sam wynik i normę', async ({ page }) => {
  await openCalculator(page);
  await page.evaluate(() => {
    window.__proteinClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__proteinClipboard = value; } } }); window.alert = () => {};
  });
  for (const Prot_outputUnit of ['mg/24h', 'g/24h']) {
    await restore(page, { Prot_outputUnit });
    const model = await expectResult(page, { unit: Prot_outputUnit === 'g/24h' ? 'g/24 h' : 'mg/24 h' });
    const expected = [model.presentation.valueText, model.presentation.unitText, model.presentation.referenceText, model.interpretation];
    await page.evaluate(() => { window.__proteinClipboard = ''; });
    await page.locator('#askAI').click(); await expect.poll(() => page.evaluate(() => window.__proteinClipboard)).toContain(model.presentation.valueText);
    const copied = await page.evaluate(() => window.__proteinClipboard);
    // DOM text omits the visual gap between separate value/unit elements.
    // Compare every digit, operator and unit while ignoring only whitespace.
    for (const value of expected) expect(copied.replace(/\s/g, '')).toContain(value.replace(/\s/g, ''));
    const pending = page.waitForEvent('download'); await page.locator('#downloadDOCX').click();
    const download = await pending, html = await fs.readFile(await download.path(), 'utf8');
    const text = await page.evaluate(value => new DOMParser().parseFromString(value, 'text/html').body.textContent, html);
    for (const value of expected) expect(text.replace(/\s/g, '')).toContain(value.replace(/\s/g, ''));
  }
});

test('Białko DZM: Start odczytuje i edytuje jeden zamrożony pomiar z ramki Klirens', async ({ page }) => {
  const { calculator, start } = await openShellCalculator(page);
  await restore(calculator); const [note] = await saveVisible(calculator, '2026-10-24');
  await calculator.locator('#clcrOpenCardBtn').click(); await expect(page).toHaveURL(/app\.html#\/start/);
  const history = start.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-history');
  await expect(history.locator(`tr[data-note-id="${note.id}"]`)).toHaveCount(1);
  await expect(history.locator(`.vilda-clcr-point[data-note-id="${note.id}"]`)).toHaveAttribute('data-value', '300');
  await history.locator(`.vilda-clcr-value[data-note-id="${note.id}"]`).click(); await start.locator('#editMeasurement').click();
  await start.locator('#editField-Prot_concentration').fill('400'); await start.locator('#saveEditedMeasurement').click();
  await expect(start.locator('#editDialog')).toBeHidden(); await start.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(history.locator(`.vilda-clcr-point[data-note-id="${note.id}"]`)).toHaveAttribute('data-value', '600');
  expect((await memory(start)).notes).toHaveLength(1); expect((await memory(start)).originalsLocked).toBe(true);
});
