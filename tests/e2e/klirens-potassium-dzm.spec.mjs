import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, openShellCalculator, saveVisible } from '../support/klirens-patient-record.mjs';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { applySession, card, choose, chooseNativeUnit, details, displayedNumber, expectBlocked, expectResult, openCalculator, restore } from './potassium-dzm.helpers.mjs';

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    const textBoxes = node => {
      const range = document.createRange(); range.selectNodeContents(node);
      return [...range.getClientRects()].map(r => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }));
    };
    const axis = document.querySelector('.potassium-dzm-norm-axis');
    return {
      units: [...document.querySelectorAll('.potassium-dzm-result-unit,.potassium-dzm-reference-unit')].map(node => node.getBoundingClientRect().top),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), active: box('#clcrActivePanel'), input: box('#potassiumDzmInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      fixedUnits: [...document.querySelectorAll('#potassiumDzmInputCard .potassium-dzm-fixed-unit')].filter(node => node.checkVisibility()).map(node => ({ text: node.textContent, lines: textBoxes(node) })),
      rows: [...document.querySelectorAll('#potassiumDzmInputCard .potassium-dzm-value-row')].filter(node => node.checkVisibility()).map(node => [...node.children].map(item => ({ x: item.getBoundingClientRect().x, width: item.getBoundingClientRect().width }))),
      controls: [...document.querySelectorAll('#potassiumDzmInputCard input,#potassiumDzmInputCard select,#potassiumDzmInputCard button,#potassiumDzmInputCard .potassium-dzm-fixed-unit,[data-potassium-dzm-output-unit]')].filter(node => node.checkVisibility()).map(node => ({
        id: node.id || node.textContent.trim(), font: parseFloat(getComputedStyle(node).fontSize),
        height: node.getBoundingClientRect().height, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
      })),
      numbers: [...document.querySelectorAll('#clcrResultReport .clcr-result-value,#clcrResultReport .potassium-dzm-proposal-card .potassium-dzm-reference-bound')].map(node => {
        const rect = node.getBoundingClientRect(), container = node.closest('.clcr-result-patient,.clcr-result-reference').getBoundingClientRect();
        return { text: node.textContent, lines: textBoxes(node), left: rect.left, right: rect.right, boxLeft: container.left, boxRight: container.right };
      }),
      axis: axis ? {
        boundaries: axis.querySelectorAll('.potassium-dzm-norm-boundary').length,
        labels: [...axis.querySelectorAll('.potassium-dzm-norm-label--low,.potassium-dzm-norm-label--high')].map(node => ({ text: node.textContent, rects: textBoxes(node) })),
        title: textBoxes(axis.querySelector('.potassium-dzm-norm-band-title')),
        trackTop: axis.querySelector('.potassium-dzm-norm-track').getBoundingClientRect().top,
        trackBottom: axis.querySelector('.potassium-dzm-norm-track').getBoundingClientRect().bottom,
      } : null,
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
  for (const unit of result.fixedUnits) expect(unit.lines, unit.text).toHaveLength(1);
  for (const number of result.numbers) {
    expect(number.left, number.text).toBeGreaterThanOrEqual(number.boxLeft - 1);
    expect(number.right, number.text).toBeLessThanOrEqual(number.boxRight + 1);
    expect(number.lines).toHaveLength(1);
  }
  if (result.units.length === 2) expect(Math.abs(result.units[0] - result.units[1])).toBeLessThanOrEqual(1);
  if (result.axis) {
    expect(result.axis.boundaries).toBe(2);
    expect(result.axis.labels.map(label => label.text)).toHaveLength(2);
    for (const label of result.axis.labels) {
      expect(label.text).not.toBe(''); expect(label.rects).toHaveLength(1);
      expect(label.rects[0].top).toBeGreaterThanOrEqual(result.axis.trackBottom - 1);
    }
    for (const rect of result.axis.title) expect(rect.bottom).toBeLessThanOrEqual(result.axis.trackTop + 1);
  }
  return result;
}

function sameWidths(before, after) {
  for (const key of ['form', 'input', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
  if (before.rows[0] && after.rows[0]) {
    for (const [index, column] of before.rows[0].entries()) {
      expect(Math.abs(column.width - after.rows[0][index].width), `input column ${index}`).toBeLessThanOrEqual(0.5);
    }
  }
}

for (const width of [1440, 390, 320]) {
  test(`Potas DZM: dwa pola, źródło normy i stała geometria ${width}px`, async ({ page }, testInfo) => {
    const errors = [], failures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => { if (new URL(request.url()).origin === new URL(page.url()).origin) failures.push(request.url()); });
    await openCalculator(page, width);
    await restore(page, { K_concentration: '', K_volume: '' });
    await expectBlocked(page);
    await expect(page.locator('#K_collectionHours')).toHaveValue('24');
    await expect(page.locator('#potassiumDzmInputCard input:visible')).toHaveCount(2);
    await expect(page.locator('#potassiumDzmInputCard select:visible')).toHaveCount(1);
    for (const id of ['age', 'sex', 'weight', 'height', 'K_collectionHours', 'collectionStartAt', 'collectionEndAt', 'U_K', 'V24', 'K_reportedUnit', 'K_outputUnit']) await expect(page.locator('#' + id)).toBeHidden();
    const initial = await geometry(page, width);
    await page.locator('#K_concentration').fill('100'); await page.locator('#K_volume').fill('1500');
    const high = await expectResult(page);
    expect(high.presentation.referenceValue).toBe('20–116');
    await expect(card(page).locator('.clcr-result-reference-label')).toContainText('Norma dla wieku');
    await expect(card(page).locator('.clcr-result-reference-label')).toContainText('Labcorp');
    await expect(card(page)).toContainText('Orientacyjny zakres źródła');
    await expect(page.locator('#clcrInfo')).toBeEmpty();
    sameWidths(initial, await geometry(page, width));
    const comparison = testInfo.outputPath(`potassium-dzm-default-${width}.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: comparison });
    await testInfo.attach(`potassium-dzm-default-${width}`, { path: comparison, contentType: 'image/png' });
    for (const [K_concentration, expected] of [
      ['20', { raw: 30, status: 'within', tone: 'normal' }],
      ['1', { raw: 1.5, status: 'low', tone: 'warning' }],
      ['0', { raw: 0, status: 'zero', tone: 'neutral', reference: false, available: true }],
      ['1e-300', { raw: 1.5e-300, status: 'low', tone: 'warning' }],
    ]) {
      await restore(page, { K_concentration }); const result = await expectResult(page, expected);
      if (K_concentration === '1e-300') expect(result.rawValue).toBeGreaterThan(0);
      sameWidths(initial, await geometry(page, width));
    }
    await restore(page, { age: '', sex: '' });
    await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
    sameWidths(initial, await geometry(page, width));
    await restore(page);
    await page.locator('[data-potassium-dzm-mode="reported"]').click();
    await expect(page.locator('#potassiumDzmInputCard input:visible')).toHaveCount(1);
    await expect(page.locator('#potassiumDzmInputCard select:visible')).toHaveCount(0);
    for (const [value, expected] of [
      ['20', { raw: 20, status: 'within', tone: 'normal' }],
      ['19.99999999999999', { raw: 19.99999999999999, status: 'low', tone: 'warning' }],
      ['0', { raw: 0, status: 'zero', tone: 'neutral', reference: false, available: true }],
      ['1e-300', { raw: 1e-300, status: 'low', tone: 'warning' }],
      ['1.7976931348623157e308', { raw: 1.7976931348623157e308 }],
    ]) {
      await page.locator('#K_reportedValue').fill(value); await expectResult(page, expected);
      sameWidths(initial, await geometry(page, width));
    }
    await restore(page, { age: '', sex: '', K_inputMode: 'reported', K_reportedValue: '150' });
    await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
    sameWidths(initial, await geometry(page, width));
    await details(page).locator('summary').click(); await expect(details(page)).toContainText('Labcorp');
    sameWidths(initial, await geometry(page, width));
    const screenshot = testInfo.outputPath(`potassium-dzm-${width}.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: screenshot });
    await testInfo.attach(`potassium-dzm-${width}`, { path: screenshot, contentType: 'image/png' });
    await page.locator('#K_reportedValue').fill('-1'); await expectBlocked(page);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#clearBtn').click(); await page.waitForFunction(() => window.clcrIsResetting !== true);
    await choose(page); await expectBlocked(page); await expect(page.locator('#K_collectionHours')).toHaveValue('24');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]); expect(failures).toEqual([]);
  });
}

test('Potas DZM: istniejący wiek i płeć dobierają wyłącznie pełne źródłowe zakresy Labcorp', async ({ page }) => {
  await openCalculator(page);
  const groups = [
    ['0', 'M', null], ['5', 'F', null, '11'], ['5.999', 'F', null], ['6', 'M', '11–88'], ['6', 'F', '10–70'],
    ['17', 'M', '11–88', '11'], ['17', 'F', '10–70', '11'], ['18', 'M', '20–116'], ['18', 'F', '14–95'],
    ['80', 'M', '20–116', '11'], ['80', 'F', '14–95', '11'], ['81', 'M', '16–83'], ['81', 'F', '6–67'],
    ['', 'F', null], ['40', '', null], ['10', '', null],
  ];
  for (const [age, sex, reference, ageMonths = ''] of groups) {
    await restore(page, { age, ageMonths, sex, K_inputMode: 'reported', K_reportedValue: '30' });
    const model = await expectResult(page, { raw: 30, status: reference ? 'within' : 'unassessed', tone: reference ? 'normal' : 'neutral', reference: !!reference });
    if (reference) expect(model.presentation.referenceValue).toBe(reference);
    else await expect(card(page)).toContainText('Brak normy do porównania');
    for (const id of ['age', 'sex', 'weight', 'height']) await expect(page.locator('#' + id)).toBeHidden();
  }
  for (const [age, sex, low, high] of [['6','M',11,88], ['6','F',10,70], ['18','M',20,116], ['18','F',14,95], ['81','M',16,83], ['81','F',6,67]]) {
    for (const value of [low, high]) {
      await restore(page, { age, sex, K_inputMode: 'reported', K_reportedValue: String(value) });
      await expectResult(page, { raw: value, status: 'within', tone: 'normal' });
    }
  }
});

test('Potas DZM: stałe jednostki, dwa tryby, brak pułapu200 oraz dokładność i neutralne zero', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  await restore(page); await expectResult(page, { guest: false });
  await restore(page, { K_volume: '1.5', K_volumeUnit: 'L' }); await expectResult(page, { guest: false });
  await restore(page, { K_inputMode: 'reported', K_reportedValue: '150', K_volume: '' });
  await expectResult(page, { guest: false });
  await restore(page, { K_concentration: '201' }); await expectResult(page, { raw: 301.5, guest: false });
  await restore(page, { K_concentration: '0' });
  const zero = await expectResult(page, { raw: 0, status: 'zero', tone: 'neutral', reference: false, available: true, guest: false });
  expect(zero.outOfRange).toBeNull(); await expect(card(page)).toContainText(/oznaczalno|rapor/i);
  const [savedZero] = await saveVisible(page, '2026-10-20');
  await restore(page, { K_concentration: '0.01' });
  const tiny = await expectResult(page, { raw: 0.015, status: 'low', tone: 'warning', guest: false });
  expect(displayedNumber(tiny.presentation.valueText)).toBeGreaterThan(0);
  const [savedTiny] = await saveVisible(page, '2026-10-21');
  expect(savedTiny.labResult.valueNum).toBe(0.015); expect(displayedNumber(savedTiny.labResult.value)).toBeGreaterThan(0);
  const points = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes).measurements, [savedZero, savedTiny]);
  expect(points[0]).toMatchObject({ valueNum: 0, outOfRange: null, tone: 'neutral' });
  expect(points[1]).toMatchObject({ valueNum: 0.015, outOfRange: true });
  for (const value of ['-1', 'Infinity', '0x10', '1x']) {
    await restore(page, { K_concentration: value }); await expectBlocked(page);
    await restore(page, { K_inputMode: 'reported', K_reportedValue: value }); await expectBlocked(page);
  }
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Potas DZM: czas nowej zbiórki, niepełna doba i historyczny brak czasu mają odrębne znaczenie', async ({ page }) => {
  await openCalculator(page); await restore(page);
  await page.locator('[aria-controls="potassiumDzmDurationEditor"]').click();
  await page.locator('#K_collectionHours').fill(''); await expectResult(page);
  await page.locator('#K_collectionHours').blur(); await expect(page.locator('#K_collectionHours')).toHaveValue('24');
  await page.locator('#K_collectionHours').fill('12');
  await expectResult(page, { raw: 300, status: 'unassessed', tone: 'neutral', reference: false });
  await page.locator('[data-potassium-dzm-mode="reported"]').click(); await page.locator('#K_reportedValue').fill('150');
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  await expect(page.locator('#K_collectionHours')).toHaveValue('12');
  await page.locator('#K_collectionHours').fill('');
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  await page.locator('[data-potassium-dzm-mode="concentration"]').click(); await expectBlocked(page);
  await expect(page.locator('#K_collectionHours')).toHaveValue('');
  await restore(page, { K_inputMode: 'reported', K_reportedValue: '150', K_collectionHours: '', K_collectionSource: 'historical-missing', K_durationNeedsConfirmation: true });
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  await restore(page, { K_collectionHours: '', K_collectionSource: 'historical-missing', K_durationNeedsConfirmation: true });
  await expectBlocked(page); await expect(page.locator('#K_collectionHours')).toHaveValue('');
  await page.locator('#K_collectionHours').focus(); await page.locator('#K_collectionHours').blur();
  await expect(page.locator('#K_collectionHours')).toHaveValue('');
  await page.locator('#K_collectionHours').fill('24'); await expectResult(page);
  for (const K_inputMode of ['concentration', 'reported']) {
    for (const K_collectionHours of ['0', '-1', 'NaN']) {
      await restore(page, { K_inputMode, K_reportedValue: '150', K_collectionHours }); await expectBlocked(page);
    }
    await restore(page, { K_inputMode, K_reportedValue: '150', ui_collectionNoMissedVoids_answer: 'no' }); await expectBlocked(page);
    await expect(page.locator('#K_concentration')).toHaveValue('100'); await expect(page.locator('#K_reportedValue')).toHaveValue('150');
  }
});

test('Potas DZM: rzeczywista zmiana jednostki objętości zachowuje ilość i porównanie SSI po przeładowaniu', async ({ page }) => {
  await openCalculator(page); await page.waitForFunction(() => !window.VildaPersistence?.isAutosaveSuppressed?.());
  await restore(page, { K_volume: '', K_volumeUnit: 'mL' });
  await page.locator('#K_volume').fill('200');
  const boundary = await expectResult(page, { raw: 20, status: 'within', tone: 'normal' });
  const fingerprint = () => page.evaluate(() => window.VildaSaveStatusIndicator._computeCanonicalFingerprint());
  await expect.poll(() => page.evaluate(() => window.VildaPersistence?.readClcrSession?.()?.inputs.K_volume)).toBe('200');
  const original = await fingerprint(); expect(original).not.toBeNull();
  for (const unit of ['L', 'mL', 'L']) {
    await chooseNativeUnit(page, '#K_volumeUnit', unit);
    const result = await expectResult(page, { raw: 20, status: 'within', tone: 'normal' });
    expect(result.exactMain).toEqual(boundary.exactMain);
    await expect.poll(() => page.evaluate(() => {
      const saved = window.VildaPersistence?.readClcrSession?.()?.inputs || {};
      return ['K_volume', 'K_volumeUnit', 'K_unitConversions'].every(id => String(saved[id] ?? '') === document.getElementById(id).value);
    })).toBe(true);
    expect(await fingerprint()).toBe(original);
  }
  const conversions = await page.locator('#K_unitConversions').inputValue(), convertedValue = await page.locator('#K_volume').inputValue();
  expect(conversions).not.toBe('');
  await expect.poll(() => page.evaluate(() => window.VildaPersistence?.readClcrSession?.()?.inputs.K_volumeUnit)).toBe('L');
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterGuest(page, { calculator: true });
  const replay = await expectResult(page, { raw: 20, status: 'within', tone: 'normal' });
  expect(replay.exactMain).toEqual(boundary.exactMain);
  expect(displayedNumber(await page.locator('#K_volume').inputValue())).toBe(displayedNumber(convertedValue));
  await expect(page.locator('#K_volumeUnit')).toHaveValue('L');
  expect(await page.locator('#K_unitConversions').inputValue()).toBe(conversions); expect(await fingerprint()).toBe(original);
  await page.locator('#K_volume').fill('0.21'); await expectResult(page, { raw: 21, status: 'within', tone: 'normal' });
  await expect.poll(() => page.evaluate(() => window.VildaPersistence?.readClcrSession?.()?.inputs.K_volume)).toBe('0.21');
  expect(await fingerprint()).not.toBe(original);
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'K_mmol_d', inputs: { age: '12', sex: 'F' } });
  await expectBlocked(page); await expect(page.locator('#K_reportedValue')).toHaveValue(''); await expect(page.locator('#K_unitConversions')).toHaveValue('');
});
test('Potas DZM: jedna notatka i Badania odczytują zamrożoną normę bez bieżącego silnika', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page);
  await expectResult(page, { guest: false });
  const [normal] = await saveVisible(page, '2026-10-24');
  await restore(page, { age: '', sex: '' });
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false, guest: false });
  const [unassessed] = await saveVisible(page, '2026-10-25');
  expect((await memory(page)).notes).toHaveLength(2);
  const projected = await page.evaluate(notes => {
    const producer = window.VildaClcrPotassiumDzm;
    window.VildaClcrPotassiumDzm = new Proxy({}, { get() { return () => { throw new Error('Historical potassium must not recalculate'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; }
    finally { window.VildaClcrPotassiumDzm = producer; }
  }, [normal, unassessed]);
  expect(projected[0]).toMatchObject({ valueNum: 150, norm: '20–116 mmol/24 h', outOfRange: true });
  expect(projected[1]).toMatchObject({ valueNum: 150, norm: '', outOfRange: null });
  expect(new Set(projected.map(point => point.parameterKey))).toEqual(new Set(['clcr:K_mmol_d']));
  await page.evaluate(notes => { window.__potassiumSyntheticNotes = notes; }, [normal, unassessed]);
  const history = await readVisibleSavedHistory(page, '__potassiumSyntheticNotes');
  expect(history.visible).toBe(true); expect(history.ids).toEqual(history.originalIds); expect(history.points).toHaveLength(2);
  await page.locator('#clcrOpenBadaniaBtn').click();
  await expect(page.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-point')).toHaveCount(2);
  await page.locator('button[data-tab="notes"]').click();
  const notes = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]'); await expect(notes).toHaveCount(2);
  for (const key of ['VILDA_CLCR', 'engineVersion', 'exactMain', '[tekst]']) await expect(notes.first()).not.toContainText(key);
  expect((await memory(page)).originalsLocked).toBe(true);
});


test('Potas DZM: edytor odrzuca wartość ujemną, edycja i usunięcie dotyczą jednego ID', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page);
  await expectResult(page, { guest: false });
  const [first] = await saveVisible(page, '2026-10-24');
  await restore(page, { K_inputMode: 'reported', K_reportedValue: '15' });
  await expectResult(page, { raw: 15, status: 'low', tone: 'warning', guest: false });
  const [sibling] = await saveVisible(page, '2026-10-25');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), first);
  await page.locator('#editMeasurement').click(); await page.locator('#editField-K_concentration').fill('-1');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeVisible();
  expect((await memory(page)).updates).toHaveLength(0);
  await page.locator('#editField-K_concentration').fill('200'); await page.locator('#editDate').fill('2026-10-23');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  let stored = await memory(page); const edited = stored.notes.find(note => note.id === first.id);
  expect(stored.notes).toHaveLength(2); expect(edited.labResult.valueNum).toBe(300); expect(edited.id).toBe(first.id);
  expect(edited.clinicalDateISO).toBe('2026-10-23'); expect(stored.notes.find(note => note.id === sibling.id)).toEqual(sibling);
  await page.locator('#deleteMeasurement').click(); await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).toBeHidden(); stored = await memory(page);
  expect(stored.notes).toEqual([sibling]); expect(stored.originalsLocked).toBe(true);
});


test('Potas DZM: dawny zapis zachowuje prezentację, a nieznany czas wymaga uzupełnienia dopiero przy edycji', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  const old = await page.evaluate(() => {
    const api = window.ClcrSavedCalculation;
    const values = { U_K: '0.01', V24: '1500', age: '10', sex: 'M',
      collectionStartAt: '2025-10-20T08:00', collectionEndAt: '2025-10-21T08:00' };
    const point = { id: 'K_mmol_d', sourceFormulaId: 'K_mmol_d', label: 'Fikcyjne dawne wydalanie potasu',
      rawValue: 0.015, valueNum: 0.015, displayValue: '0.0', unit: 'mmol/24 h', norm: 'dawny zapis normy', tone: 'neutral', outOfRange: false };
    const snapshot = api.createSnapshot(point, { capture: { formulaId: 'K_mmol_d', ageYears: 10, values,
      fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })) }, clinicalDateISO: '2025-10-21' });
    const note = { id: 'fictional-potassium-legacy-missing-hours', patientId: window.ClcrVisitSave.resolveCurrentPatientId(),
      category: 'wynik-klirens', rev: 1, title: point.label, clinicalDateISO: '2025-10-21', body: 'Kalkulator klirensu · clcr:K_mmol_d',
      labResult: { test: point.label, value: '0.0', valueNum: 0.015, unit: point.unit, norm: point.norm } };
    note.body += '\n\n' + api.serializeSnapshot(snapshot, note);
    if (!api.readSaved(note).valid) throw new Error('Fictional legacy potassium envelope must round trip');
    window.__clcrRecordFixture.seed([note]); return note;
  });
  const oldPoint = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], old);
  expect(oldPoint).toMatchObject({ valueNum: 0.015, displayValue: '0.0', norm: 'dawny zapis normy' });
  expect((await memory(page)).notes).toEqual([old]);
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), old);
  await page.locator('#editMeasurement').click();
  const hours = page.locator('#editField-K_collectionHours');
  await expect(hours).toHaveValue(''); await expect(hours).toHaveAttribute('required', '');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeVisible();
  expect((await memory(page)).updates).toHaveLength(0);
  await hours.fill('12'); await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  const edited = (await memory(page)).notes.find(note => note.id === old.id);
  expect(edited.id).toBe(old.id); expect(edited.labResult.valueNum).toBe(0.03);
  const corrected = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], edited);
  expect(corrected).toMatchObject({ valueNum: 0.03, norm: '', outOfRange: null });
});


test('Potas DZM: Start leniwie odczytuje i edytuje jeden pomiar zapisany przez Klirens', async ({ page }) => {
  const { calculator, start } = await openShellCalculator(page);
  await restore(calculator); await expectResult(calculator, { guest: false }); const [note] = await saveVisible(calculator, '2026-10-24');
  await calculator.locator('#clcrOpenCardBtn').click(); await expect(page).toHaveURL(/app\.html#\/start/);
  const history = start.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-history');
  await expect(history.locator(`tr[data-note-id="${note.id}"]`)).toHaveCount(1);
  await expect(history.locator(`.vilda-clcr-point[data-note-id="${note.id}"]`)).toHaveAttribute('data-value', '150');
  await history.locator(`.vilda-clcr-value[data-note-id="${note.id}"]`).click(); await start.locator('#editMeasurement').click();
  await start.locator('#editField-K_concentration').fill('200'); await start.locator('#saveEditedMeasurement').click();
  await expect(start.locator('#editDialog')).toBeHidden(); await start.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(history.locator(`.vilda-clcr-point[data-note-id="${note.id}"]`)).toHaveAttribute('data-value', '300');
  expect((await memory(start)).notes).toHaveLength(1); expect((await memory(start)).originalsLocked).toBe(true);
});

test('Potas DZM: raporty AI i Word zachowują dodatnią precyzję oraz tę samą normę', async ({ page }) => {
  await openCalculator(page);
  await page.evaluate(() => {
    window.__potassiumClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__potassiumClipboard = value; } } }); window.alert = () => {};
  });
  await restore(page, { K_concentration: '0.01' });
  const model = await expectResult(page, { raw: 0.015, status: 'low', tone: 'warning' });
  const expected = [model.presentation.valueText, model.presentation.unitText, model.presentation.referenceText, model.interpretation];
  await page.locator('#askAI').click();
  await expect.poll(() => page.evaluate(() => window.__potassiumClipboard)).toContain(model.presentation.valueText);
  const copied = await page.evaluate(() => window.__potassiumClipboard);
  for (const value of expected) expect(copied.replace(/\s/g, '')).toContain(value.replace(/\s/g, ''));
  const pending = page.waitForEvent('download'); await page.locator('#downloadDOCX').click();
  const download = await pending, html = await fs.readFile(await download.path(), 'utf8');
  const text = await page.evaluate(value => new DOMParser().parseFromString(value, 'text/html').body.textContent, html);
  for (const value of expected) expect(text.replace(/\s/g, '')).toContain(value.replace(/\s/g, ''));
});

test('Potas DZM: dokładne przekroczenie granicy pozostaje czytelne w Notatce i Szczegółach', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  await restore(page, { K_inputMode: 'reported', K_reportedValue: '116.00000000000000000001' });
  const exact = await expectResult(page, { raw: 116, status: 'high', tone: 'warning', guest: false });
  expect(exact.presentation.valueText).toMatch(/^≈/);
  expect(exact.presentation.fullValueText.replace(',', '.')).toBe('116.00000000000000000001');
  const [note] = await saveVisible(page, '2026-10-26');
  expect(note.labResult.valueNum).toBe(116);
  await page.locator('#clcrOpenBadaniaBtn').click(); await page.locator('button[data-tab="notes"]').click();
  const compact = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]'); await expect(compact).toHaveCount(1);
  await expect(compact.locator('.clcr-note-boundary')).toContainText('Wartość przed zaokrągleniem');
  await expect(compact.locator('.clcr-note-boundary')).toContainText('116,00000000000000000001');
  await compact.getByRole('button', { name: 'Szczegóły obliczenia →', exact: true }).click();
  await expect(page.locator('#calculationDetails')).toHaveAttribute('data-note-id', note.id);
  await expect(page.locator('#calculationDetails')).toContainText('Przed zaokrągleniem');
  await expect(page.locator('#calculationDetails')).toContainText(exact.presentation.fullValueText);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Potas DZM: długa dokładna wartość poniżej granicy nie staje się normą po zmianach mL/L', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { K_volume: '199.' + '9'.repeat(68) });
  const boundary = await expectResult(page, { raw: 20, status: 'low', tone: 'warning' });
  for (const unit of ['L', 'mL', 'L', 'mL']) {
    await chooseNativeUnit(page, '#K_volumeUnit', unit);
    const converted = await expectResult(page, { raw: 20, status: 'low', tone: 'warning' });
    expect(converted.exactMain).toEqual(boundary.exactMain);
    // The application accepts both decimal separators. An equivalent display
    // edit must retain the exact source quantity carried by the conversion.
    const current = await page.locator('#K_volume').inputValue();
    await page.locator('#K_volume').fill(current.replace(',', '.'));
    const normalized = await expectResult(page, { raw: 20, status: 'low', tone: 'warning' });
    expect(normalized.exactMain).toEqual(boundary.exactMain);
  }
});

test('Potas DZM: zmiana mL/L po zapisie zachowuje potwierdzenie bez drugiej notatki', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page);
  await expectResult(page, { guest: false });
  const date = '2026-10-31', [saved] = await saveVisible(page, date);
  const save = page.locator('#clcrVisitSaveBtn');
  await expect(save).toBeDisabled(); await expect(save).toHaveText('Zapisano w Badaniach');
  expect(await page.evaluate(() => window.ClcrVisitSave.hasUnsavedMeasurement())).toBe(false);
  const baseline = await card(page).evaluate(node => JSON.parse(node.dataset.clcrPotassiumDzmSnapshot).exactMain);
  for (const unit of ['L', 'mL', 'L']) {
    await chooseNativeUnit(page, '#K_volumeUnit', unit);
    await expect.poll(() => card(page).evaluate(node => JSON.parse(node.dataset.clcrPotassiumDzmSnapshot).exactMain)).toEqual(baseline);
    await expect(save).toBeDisabled(); await expect(save).toHaveText('Zapisano w Badaniach');
    expect(await page.evaluate(() => window.ClcrVisitSave.hasUnsavedMeasurement())).toBe(false);
    const receipt = await page.evaluate(clinicalDateISO => window.ClcrVisitSave.saveActiveResultToCard({ clinicalDateISO }), date);
    expect(receipt).toMatchObject({ ok: true, noteIds: [saved.id] });
    const stored = await memory(page);
    expect(stored.notes).toEqual([saved]); expect(stored.saves).toHaveLength(1);
  }
  await page.locator('#K_concentration').fill('101'); await expectResult(page, { raw: 151.5, guest: false });
  expect(await page.evaluate(() => window.ClcrVisitSave.hasUnsavedMeasurement())).toBe(true);
  const [changed] = await saveVisible(page, date);
  expect(changed.id).not.toBe(saved.id); expect(changed.labResult.valueNum).toBe(151.5);
  // Equal final excretion does not make a changed specimen the same input:
  // preserve real concentration and collection-volume edits in the guard.
  await page.locator('#K_volume').fill('2'); await page.locator('#K_concentration').fill('75');
  await expectResult(page, { raw: 150, guest: false });
  expect(await page.evaluate(() => window.ClcrVisitSave.hasUnsavedMeasurement())).toBe(true);
  const [differentSpecimen] = await saveVisible(page, date), final = await memory(page);
  expect(new Set([saved.id, changed.id, differentSpecimen.id]).size).toBe(3);
  expect(differentSpecimen.labResult.valueNum).toBe(150);
  expect(final.notes).toHaveLength(3); expect(final.saves).toHaveLength(3); expect(final.originalsLocked).toBe(true);
  expect(await page.evaluate(() => window.ClcrVisitSave.hasUnsavedMeasurement())).toBe(false);
});
