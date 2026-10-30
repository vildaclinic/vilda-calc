import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, openShellCalculator, saveVisible } from '../support/klirens-patient-record.mjs';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { applySession, card, choose, chooseNativeUnit, details, displayedNumber, expectBlocked, expectResult, openCalculator, restore } from '../support/sodium-dzm.mjs';

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
    const axis = document.querySelector('.sodium-dzm-norm-axis');
    const picker = document.querySelector('.sodium-dzm-output-picker');
    const patientCard = document.querySelector('.sodium-dzm-proposal-card');
    return {
      picker: picker && patientCard ? { inHead: picker.parentElement.classList.contains('clcr-result-report__head'), bottom: picker.getBoundingClientRect().bottom, left: picker.getBoundingClientRect().left, cardTop: patientCard.getBoundingClientRect().top, titleRight: document.getElementById('clcrResultTitle').getBoundingClientRect().right } : null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), active: box('#clcrActivePanel'), input: box('#sodiumDzmInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      rows: [...document.querySelectorAll('#sodiumDzmInputCard .sodium-dzm-value-row')].filter(node => node.checkVisibility()).map(node => [...node.children].map(item => ({ x: item.getBoundingClientRect().x, width: item.getBoundingClientRect().width }))),
      controls: [...document.querySelectorAll('#sodiumDzmInputCard input,#sodiumDzmInputCard select,#sodiumDzmInputCard button,[data-sodium-dzm-output-unit]')].filter(node => node.checkVisibility()).map(node => ({
        id: node.id || node.textContent.trim(), font: parseFloat(getComputedStyle(node).fontSize),
        height: node.getBoundingClientRect().height, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
      })),
      numbers: [...document.querySelectorAll('#clcrResultReport .clcr-result-value,#clcrResultReport .sodium-dzm-proposal-card .sodium-dzm-reference-bound')].map(node => {
        const rect = node.getBoundingClientRect(), container = node.closest('.clcr-result-patient,.clcr-result-reference').getBoundingClientRect();
        return { text: node.textContent, lines: textBoxes(node), left: rect.left, right: rect.right, boxLeft: container.left, boxRight: container.right };
      }),
      axis: axis ? {
        boundaries: axis.querySelectorAll('.sodium-dzm-norm-boundary').length,
        labels: [...axis.querySelectorAll('.sodium-dzm-norm-label--low,.sodium-dzm-norm-label--high')].map(node => ({ text: node.textContent, rects: textBoxes(node) })),
        title: textBoxes(axis.querySelector('.sodium-dzm-norm-band-title')),
        trackTop: axis.querySelector('.sodium-dzm-norm-track').getBoundingClientRect().top,
        trackBottom: axis.querySelector('.sodium-dzm-norm-track').getBoundingClientRect().bottom,
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
  for (const number of result.numbers) {
    expect(number.left, number.text).toBeGreaterThanOrEqual(number.boxLeft - 1);
    expect(number.right, number.text).toBeLessThanOrEqual(number.boxRight + 1);
    expect(number.lines).toHaveLength(1);
  }
  if (result.picker) {
    expect(result.picker.inHead).toBe(true);
    expect(result.picker.bottom).toBeLessThan(result.picker.cardTop);
    expect(result.picker.titleRight).toBeLessThan(result.picker.left);
  }
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
  test(`Sód DZM: dwa pola, czytelne granice normy i stała geometria ${width}px`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await page.addStyleTag({ content: '.sodium-dzm-proposal-card :is(.clcr-result-value,.sodium-dzm-reference-value) { font-family: "DejaVu Sans", sans-serif !important; }' });
    await expect(page.locator('#Na_collectionHours')).toHaveValue('24');
    await restore(page, { Na_concentration: '', Na_volume: '' });
    await expectBlocked(page);
    await expect(page.locator('[data-sodium-dzm-output-unit]')).toHaveCount(0);
    await expect(page.locator('#sodiumDzmInputCard input:visible')).toHaveCount(2);
    await expect(page.locator('#sodiumDzmInputCard select:visible')).toHaveCount(1);
    for (const id of ['age', 'weight', 'height', 'Na_collectionHours', 'collectionStartAt', 'collectionEndAt', 'U_Na', 'V24']) await expect(page.locator('#' + id)).toBeHidden();
    const initial = await geometry(page, width);
    await page.locator('#Na_concentration').fill('100'); await page.locator('#Na_volume').fill('1500');
    const normal = await expectResult(page);
    expect(normal.presentation.referenceValue).toBe('58–337');
    await expect(card(page)).toContainText('Norma dla wieku');
    await expect(card(page)).toContainText('W zakresie laboratoryjnym');
    await expect(page.locator('#clcrInfo')).toBeEmpty();
    const normalGeometry = await geometry(page, width);
    expect(normalGeometry.axis).not.toBeNull(); sameWidths(initial, normalGeometry);
    await page.locator('[data-sodium-dzm-mode="reported"]').click();
    await expect(page.locator('#sodiumDzmInputCard input:visible')).toHaveCount(1);
    // Exact decimal is just below the inclusive lower boundary. Compact display
    // may be approximate, but it must never look like an exact normal result.
    await page.locator('#Na_reportedValue').fill('57.99999999999999');
    const low = await expectResult(page, { raw: 57.99999999999999, status: 'low', tone: 'warning' });
    expect(low.presentation.valueText).toMatch(/^≈/);
    const colors = await card(page).evaluate(node => ({
      value: getComputedStyle(node.querySelector('.clcr-result-value')).color,
      ref: getComputedStyle(node.querySelector('.sodium-dzm-reference-value')).color,
      unit: getComputedStyle(node.querySelector('.sodium-dzm-reference-unit')).color,
    }));
    expect(colors.value).not.toBe(colors.ref); expect(colors.ref).toBe(colors.unit);
    sameWidths(initial, await geometry(page, width));
    await page.locator('[data-sodium-dzm-output-unit]').selectOption('gNa/24h');
    const grams = await expectResult(page, { raw: 57.99999999999999, status: 'low', tone: 'warning', unit: 'g Na/24 h' });
    expect(grams.presentation.referenceValue.replace(/≈/g, '')).toBe('1,3334–7,7476');
    sameWidths(initial, await geometry(page, width));
    await details(page).locator('summary').click();
    await expect(details(page)).toContainText('Labcorp');
    await expect(details(page)).toContainText(grams.presentation.fullValueText);
    for (const term of [/WHO/, /NaCl/, /spoży/i]) await expect(details(page)).toContainText(term);
    sameWidths(initial, await geometry(page, width));
    const screenshot = testInfo.outputPath(`sodium-dzm-${width}.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: screenshot });
    await testInfo.attach(`sodium-dzm-${width}`, { path: screenshot, contentType: 'image/png' });
    await restore(page, { Na_inputMode: 'reported', Na_reportedValue: '1.7976931348623157e308' });
    await expectResult(page, { raw: 1.7976931348623157e308, status: 'high', tone: 'warning' });
    sameWidths(initial, await geometry(page, width));
    await restore(page, { age: '', sex: '', Na_inputMode: 'reported', Na_reportedValue: '150' });
    await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
    sameWidths(initial, await geometry(page, width));
    await page.locator('#Na_reportedValue').fill('-1'); await expectBlocked(page);
    await expect(page.locator('[data-sodium-dzm-output-unit]')).toHaveCount(0);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#clearBtn').click(); await page.waitForFunction(() => window.clcrIsResetting !== true);
    await choose(page); await expectBlocked(page); await expect(page.locator('#Na_collectionHours')).toHaveValue('24');
    await expect(page.locator('[data-sodium-dzm-output-unit]')).toHaveCount(0);
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('Sód DZM: gotowy wynik ma jedno pole i nie jest skalowany ponownie', async ({ page }) => {
  await openCalculator(page);
  for (const [Na_reportedValue, Na_reportedUnit] of [['150', 'mmol/24h'], ['3448.465392', 'mgNa/24h'], ['3.448465392', 'gNa/24h']]) {
    await restore(page, { Na_inputMode: 'reported', Na_reportedValue, Na_reportedUnit });
    await expectResult(page);
    await expect(page.locator('#sodiumDzmInputCard input:visible')).toHaveCount(1);
  }
  await restore(page, { Na_volume: '1.5', Na_volumeUnit: 'L', Na_outputUnit: 'gNa/24h' });
  const mass = await expectResult(page, { unit: 'g Na/24 h' });
  expect(mass.presentation.rawValue).toBe(3.448465392);
  const collected = await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'Na_mmol_d' }));
  expect(collected).toHaveLength(1);
  expect(collected[0]).toMatchObject({ id: 'Na_mmol_d', valueNum: 3.448465392, unit: 'g Na/24 h', outOfRange: false });
  expect(collected[0].sodiumDzmSnapshot.exactMain).toEqual(mass.exactMain);
});

test('Sód DZM: rzeczywiste przełączanie jednostek zachowuje dokładną granicę', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { Na_volume: '580' });
  const boundary = await expectResult(page, { raw: 58 });
  for (const unit of ['L', 'mL', 'L', 'mL']) {
    await chooseNativeUnit(page, '#Na_volumeUnit', unit);
    const model = await expectResult(page, { raw: 58 }); expect(model.exactMain).toEqual(boundary.exactMain);
  }
  await restore(page, { Na_inputMode: 'reported', Na_reportedValue: '1333.40661824', Na_reportedUnit: 'mgNa/24h' });
  for (const unit of ['gNa/24h', 'mmol/24h', 'mgNa/24h', 'mmol/24h']) {
    await chooseNativeUnit(page, '#Na_reportedUnit', unit);
    const model = await expectResult(page, { raw: 58 }); expect(model.exactMain).toEqual(boundary.exactMain);
  }
  expect(await page.locator('#Na_unitConversions').inputValue()).not.toBe('');
  await page.locator('#Na_reportedValue').fill('55');
  await expectResult(page, { raw: 55, status: 'low', tone: 'warning' });
  await page.locator('#Na_reportedValue').fill('337.00000000000001');
  await expectResult(page, { raw: 337, status: 'high', tone: 'warning' });
  // The preceding display input was edited: old exact-conversion provenance
  // cannot override the new clinically high decimal.
  await chooseNativeUnit(page, '#Na_reportedUnit', 'mgNa/24h');
  await expectResult(page, { raw: 337, status: 'high', tone: 'warning' });
  await restore(page, { Na_inputMode: 'reported', Na_reportedValue: '5e-324' });
  for (const unit of ['gNa/24h', 'mmol/24h']) {
    await chooseNativeUnit(page, '#Na_reportedUnit', unit);
    const tiny = await expectResult(page, { raw: 5e-324, status: 'low', tone: 'warning' });
    expect(tiny.rawValue).toBeGreaterThan(0);
    expect(await page.locator('#Na_reportedValue').inputValue()).not.toMatch(/^0(?:[.,]0*)?$/);
  }
  await page.locator('[data-sodium-dzm-output-unit]').selectOption('gNa/24h');
  await expectBlocked(page);
  // This selected mass is below representable Number range. A remaining
  // output picker lets the clinician recover without discarding the input.
  await expect(page.locator('[data-sodium-dzm-output-unit]')).toBeVisible();
  await page.locator('[data-sodium-dzm-output-unit]').selectOption('mmol/24h');
  const recovered = await expectResult(page, { raw: 5e-324, status: 'low', tone: 'warning' });
  expect(recovered.rawValue).toBeGreaterThan(0);
  await choose(page, 'ACR'); await expect(page.locator('[data-sodium-dzm-output-unit]')).toHaveCount(0);
});

test('Sód DZM: profil wieku i płci pochodzi z istniejących danych pacjenta', async ({ page }) => {
  await openCalculator(page);
  for (const [age, sex, reference] of [
    ['10', 'F', '33–185'], ['10', 'M', null], ['13', '', '30–250'],
    ['5', 'F', null], ['30', 'F', '39–258'], ['30', '', null], ['81', '', '23–207'], ['', 'F', null],
  ]) {
    await restore(page, { age, sex });
    const model = await expectResult(page, reference ? {} : { status: 'unassessed', tone: 'neutral', reference: false });
    if (reference) expect(model.presentation.referenceValue).toBe(reference);
    else await expect(card(page)).toContainText('Brak normy do porównania');
    for (const id of ['age', 'sex', 'weight', 'height']) await expect(page.locator('#' + id)).toBeHidden();
  }
  for (const [Na_reportedValue, Na_reportedUnit, raw] of [['528.76469344', 'mgNa/24h', 23], ['4.75888224096', 'gNa/24h', 207]]) {
    await restore(page, { age: '81', sex: '', Na_inputMode: 'reported', Na_reportedValue, Na_reportedUnit });
    await expectResult(page, { raw });
  }
});

test('Sód DZM: zero jest neutralne, mały dodatni wynik pozostaje dodatni także po zapisie', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  await restore(page, { Na_concentration: '0' });
  const zero = await expectResult(page, { raw: 0, status: 'zero', tone: 'neutral', reference: false, available: true, guest: false });
  expect(zero.outOfRange).toBeNull(); await expect(card(page)).toContainText(/oznaczalno/i);
  const [savedZero] = await saveVisible(page, '2026-10-23');
  await restore(page, { Na_concentration: '0.01' });
  const tiny = await expectResult(page, { raw: 0.015, status: 'low', tone: 'warning', guest: false });
  expect(displayedNumber(tiny.presentation.valueText)).toBeGreaterThan(0);
  const [savedTiny] = await saveVisible(page, '2026-10-24');
  expect(savedTiny.labResult.valueNum).toBe(0.015); expect(displayedNumber(savedTiny.labResult.value)).toBeGreaterThan(0);
  const points = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes).measurements, [savedZero, savedTiny]);
  expect(points[0]).toMatchObject({ valueNum: 0, outOfRange: null, tone: 'neutral' });
  expect(points[1]).toMatchObject({ valueNum: 0.015, outOfRange: true });
  await restore(page, { Na_inputMode: 'reported', Na_reportedValue: '57.99999999999999', Na_outputUnit: 'gNa/24h' });
  const near = await expectResult(page, { raw: 57.99999999999999, status: 'low', tone: 'warning', unit: 'g Na/24 h', guest: false });
  const [savedNear] = await saveVisible(page, '2026-10-25');
  const frozen = await page.evaluate(note => window.ClcrSavedCalculation.readSaved(note).snapshot, savedNear);
  expect(JSON.stringify(frozen)).toContain(JSON.stringify(near.exactMain));
  expect(JSON.stringify(frozen)).toContain(near.presentation.fullValueText);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Sód DZM: czas inny niż 24 h ogranicza normę i nie przelicza gotowej ilości', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { Na_collectionHours: '12', Na_collectionSource: 'user' });
  await expectResult(page, { raw: 300, status: 'unassessed', tone: 'neutral', reference: false });
  await page.locator('[data-sodium-dzm-mode="reported"]').click(); await page.locator('#Na_reportedValue').fill('150');
  await expect(page.locator('#Na_collectionHours')).toHaveValue('12');
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  await restore(page, { Na_inputMode: 'reported', Na_reportedValue: '150', Na_collectionHours: '', Na_collectionSource: 'historical-missing', Na_durationNeedsConfirmation: true });
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  await restore(page, { Na_collectionHours: '', Na_collectionSource: 'historical-missing', Na_durationNeedsConfirmation: true });
  await expectBlocked(page); await expect(page.locator('#Na_collectionHours')).toHaveValue('');
  await page.locator('#Na_collectionHours').fill('24');
  await expectResult(page);
});

test('Sód DZM: znana wadliwa zbiórka i błędne wartości blokują oba tryby bez utraty pól', async ({ page }) => {
  await openCalculator(page);
  for (const Na_inputMode of ['concentration', 'reported']) {
    for (const Na_collectionHours of ['0', '-1', 'NaN']) {
      await restore(page, { Na_inputMode, Na_reportedValue: '150', Na_collectionHours }); await expectBlocked(page);
    }
    await restore(page, { Na_inputMode, Na_reportedValue: '150', ui_collectionNoMissedVoids_answer: 'no' });
    await expectBlocked(page);
    await expect(page.locator('#Na_concentration')).toHaveValue('100'); await expect(page.locator('#Na_reportedValue')).toHaveValue('150');
  }
  for (const value of ['-1', 'Infinity', '0x10', '1x']) {
    await restore(page, { Na_concentration: value }); await expectBlocked(page);
    await restore(page, { Na_inputMode: 'reported', Na_reportedValue: value }); await expectBlocked(page);
  }
  // Valid values above the former arbitrary concentration/volume caps remain
  // calculable; their clinical interpretation follows the same source range.
  await restore(page, { Na_concentration: '400', Na_volume: '12000' });
  await expectResult(page, { raw: 4800, status: 'high', tone: 'warning' });
});

test('Sód DZM: wybór wskazuje dwa braki jednym przewinięciem i zachowuje inne badania', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await openCalculator(page, 390);
  await restore(page, { Na_concentration: '', Na_volume: '', Scr: '0.7', U_Alb: '42' });
  const protectedIds = ['age', 'sex', 'weight', 'height', 'Scr', 'U_Alb'];
  const read = () => page.evaluate(ids => Object.fromEntries(ids.map(id => [id, document.getElementById(id).value])), protectedIds);
  const before = await read(), count = await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount);
  await page.locator('#formulaSearch').fill('wydalanie sodu');
  await page.locator('.clcr-search-result[data-formula-id="Na_mmol_d"]').click();
  await expect.poll(() => page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount)).toBe(count + 1);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.lastTarget)).toBe('Na_concentration');
  await expect(page.locator('#Na_concentration')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#Na_volume')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#clcrForm .clcr-missing-input:visible')).toHaveCount(2);
  await expect.poll(() => page.locator('#Na_concentration').evaluate(node => {
    const r = node.getBoundingClientRect(); return r.top >= 40 && r.bottom <= innerHeight - 40;
  })).toBe(true);
  expect(await read()).toEqual(before);
});

test('Sód DZM: jedna notatka i Badania odczytują zamrożoną normę bez bieżącego silnika', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page);
  await expectResult(page, { guest: false });
  const [normal] = await saveVisible(page, '2026-10-24');
  await restore(page, { age: '', sex: '' });
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false, guest: false });
  const [unassessed] = await saveVisible(page, '2026-10-25');
  expect((await memory(page)).notes).toHaveLength(2);
  const projected = await page.evaluate(notes => {
    const producer = window.VildaClcrSodiumDzm;
    window.VildaClcrSodiumDzm = new Proxy({}, { get() { return () => { throw new Error('Historical sodium must not recalculate'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; }
    finally { window.VildaClcrSodiumDzm = producer; }
  }, [normal, unassessed]);
  expect(projected[0]).toMatchObject({ valueNum: 150, norm: '58–337 mmol/24 h', outOfRange: false });
  expect(projected[1]).toMatchObject({ valueNum: 150, norm: '', outOfRange: null });
  expect(new Set(projected.map(point => point.parameterKey))).toEqual(new Set(['clcr:Na_mmol_d']));
  await page.evaluate(notes => { window.__sodiumSyntheticNotes = notes; }, [normal, unassessed]);
  const history = await readVisibleSavedHistory(page, '__sodiumSyntheticNotes');
  expect(history.visible).toBe(true); expect(history.ids).toEqual(history.originalIds); expect(history.points).toHaveLength(2);
  await page.locator('#clcrOpenBadaniaBtn').click();
  await expect(page.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-point')).toHaveCount(2);
  await page.locator('button[data-tab="notes"]').click();
  const notes = page.locator('.vilda-clcr-note[data-clcr-note-state="ready"]'); await expect(notes).toHaveCount(2);
  for (const key of ['VILDA_CLCR', 'engineVersion', 'exactMain', '[tekst]']) await expect(notes.first()).not.toContainText(key);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Sód DZM: edytor odrzuca wartość ujemną, edycja i usunięcie dotyczą jednego ID', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page);
  await expectResult(page, { guest: false });
  const [first] = await saveVisible(page, '2026-10-24');
  await restore(page, { Na_inputMode: 'reported', Na_reportedValue: '55' });
  await expectResult(page, { raw: 55, status: 'low', tone: 'warning', guest: false });
  const [sibling] = await saveVisible(page, '2026-10-25');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), first);
  await page.locator('#editMeasurement').click(); await page.locator('#editField-Na_concentration').fill('-1');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeVisible();
  expect((await memory(page)).updates).toHaveLength(0);
  await page.locator('#editField-Na_concentration').fill('200'); await page.locator('#editDate').fill('2026-10-23');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  let stored = await memory(page); const edited = stored.notes.find(note => note.id === first.id);
  expect(stored.notes).toHaveLength(2); expect(edited.labResult.valueNum).toBe(300); expect(edited.id).toBe(first.id);
  expect(edited.clinicalDateISO).toBe('2026-10-23'); expect(stored.notes.find(note => note.id === sibling.id)).toEqual(sibling);
  await page.locator('#deleteMeasurement').click(); await page.locator('#confirmDeleteMeasurement').click();
  await expect(page.locator('#detailsDialog')).toBeHidden(); stored = await memory(page);
  expect(stored.notes).toEqual([sibling]); expect(stored.originalsLocked).toBe(true);
});

test('Sód DZM: dawny zapis zachowuje prezentację, a nieznany czas wymaga uzupełnienia dopiero przy edycji', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  const old = await page.evaluate(() => {
    const api = window.ClcrSavedCalculation;
    const values = { U_Na: '0.01', V24: '1500', age: '10', sex: 'M',
      collectionStartAt: '2025-10-20T08:00', collectionEndAt: '2025-10-21T08:00' };
    const point = { id: 'Na_mmol_d', sourceFormulaId: 'Na_mmol_d', label: 'Fikcyjne dawne wydalanie sodu',
      rawValue: 0.015, valueNum: 0.015, displayValue: '0.0', unit: 'mmol/24 h', norm: 'dawny zapis normy', tone: 'neutral', outOfRange: false };
    const snapshot = api.createSnapshot(point, { capture: { formulaId: 'Na_mmol_d', ageYears: 10, values,
      fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })) }, clinicalDateISO: '2025-10-21' });
    const note = { id: 'fictional-sodium-legacy-missing-hours', patientId: window.ClcrVisitSave.resolveCurrentPatientId(),
      category: 'wynik-klirens', rev: 1, title: point.label, clinicalDateISO: '2025-10-21', body: 'Kalkulator klirensu · clcr:Na_mmol_d',
      labResult: { test: point.label, value: '0.0', valueNum: 0.015, unit: point.unit, norm: point.norm } };
    note.body += '\n\n' + api.serializeSnapshot(snapshot, note);
    if (!api.readSaved(note).valid) throw new Error('Fictional legacy sodium envelope must round trip');
    window.__clcrRecordFixture.seed([note]); return note;
  });
  const oldPoint = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], old);
  expect(oldPoint).toMatchObject({ valueNum: 0.015, displayValue: '0.0', norm: 'dawny zapis normy' });
  expect((await memory(page)).notes).toEqual([old]);
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), old);
  await page.locator('#editMeasurement').click();
  const hours = page.locator('#editField-Na_collectionHours');
  await expect(hours).toHaveValue(''); await expect(hours).toHaveAttribute('required', '');
  await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeVisible();
  expect((await memory(page)).updates).toHaveLength(0);
  await hours.fill('12'); await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  const edited = (await memory(page)).notes.find(note => note.id === old.id);
  expect(edited.id).toBe(old.id); expect(edited.labResult.valueNum).toBe(0.03);
  const corrected = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], edited);
  expect(corrected).toMatchObject({ valueNum: 0.03, norm: '', outOfRange: null });
});

test('Sód DZM: sesja zachowuje jednostki i czas, a nowy pomiar nie dziedziczy poprzedniego', async ({ page }) => {
  await openCalculator(page); await page.waitForFunction(() => !window.VildaPersistence?.isAutosaveSuppressed?.());
  await restore(page, { Na_concentration: '', Na_volume: '' });
  await page.locator('[aria-controls="sodiumDzmDurationEditor"]').click(); await page.locator('#Na_collectionHours').fill('12');
  await page.locator('[data-sodium-dzm-mode="reported"]').click(); await page.locator('#Na_reportedValue').fill('150');
  await chooseNativeUnit(page, '#Na_reportedUnit', 'gNa/24h');
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  const value = await page.locator('#Na_reportedValue').inputValue(), conversions = await page.locator('#Na_unitConversions').inputValue();
  expect(conversions).not.toBe('');
  await expect.poll(() => page.evaluate(() => {
    const saved = window.VildaPersistence?.readClcrSession?.() || JSON.parse(sessionStorage.getItem('vildaClcrSessionV1') || 'null'), input = saved?.inputs || {};
    return { mode: input.Na_inputMode, hours: input.Na_collectionHours, unit: input.Na_reportedUnit, value: input.Na_reportedValue, conversions: input.Na_unitConversions };
  })).toEqual({ mode: 'reported', hours: '12', unit: 'gNa/24h', value, conversions });
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterGuest(page, { calculator: true });
  await expect(page.locator('#Na_reportedValue')).toHaveValue(value); await expect(page.locator('#Na_collectionHours')).toHaveValue('12');
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'Na_mmol_d', inputs: { age: '12', sex: 'F' } });
  await expectBlocked(page); await expect(page.locator('#Na_reportedValue')).toHaveValue(''); await expect(page.locator('#Na_unitConversions')).toHaveValue('');
});

test('Sód DZM: eksporty AI i Word opisują ten sam wynik, jednostkę i normę', async ({ page }) => {
  await openCalculator(page);
  await page.evaluate(() => {
    window.__sodiumClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__sodiumClipboard = value; } } }); window.alert = () => {};
  });
  for (const Na_outputUnit of ['mmol/24h', 'gNa/24h']) {
    await restore(page, { Na_outputUnit });
    const model = await expectResult(page, { unit: Na_outputUnit === 'gNa/24h' ? 'g Na/24 h' : 'mmol/24 h' });
    const expected = [model.presentation.valueText, model.presentation.unitText, model.presentation.referenceText, model.interpretation];
    await page.evaluate(() => { window.__sodiumClipboard = ''; }); await page.locator('#askAI').click();
    await expect.poll(() => page.evaluate(() => window.__sodiumClipboard)).toContain(model.presentation.valueText);
    const copied = await page.evaluate(() => window.__sodiumClipboard);
    for (const value of expected) expect(copied.replace(/\s/g, '')).toContain(value.replace(/\s/g, ''));
    const pending = page.waitForEvent('download'); await page.locator('#downloadDOCX').click();
    const download = await pending, html = await fs.readFile(await download.path(), 'utf8');
    const text = await page.evaluate(value => new DOMParser().parseFromString(value, 'text/html').body.textContent, html);
    for (const value of expected) expect(text.replace(/\s/g, '')).toContain(value.replace(/\s/g, ''));
  }
});

test('Sód DZM: Start leniwie odczytuje i edytuje jeden pomiar zapisany przez Klirens', async ({ page }) => {
  const { calculator, start } = await openShellCalculator(page);
  await restore(calculator); await expectResult(calculator, { guest: false }); const [note] = await saveVisible(calculator, '2026-10-24');
  await calculator.locator('#clcrOpenCardBtn').click(); await expect(page).toHaveURL(/app\.html#\/start/);
  const history = start.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-history');
  await expect(history.locator(`tr[data-note-id="${note.id}"]`)).toHaveCount(1);
  await expect(history.locator(`.vilda-clcr-point[data-note-id="${note.id}"]`)).toHaveAttribute('data-value', '150');
  await history.locator(`.vilda-clcr-value[data-note-id="${note.id}"]`).click(); await start.locator('#editMeasurement').click();
  await start.locator('#editField-Na_concentration').fill('200'); await start.locator('#saveEditedMeasurement').click();
  await expect(start.locator('#editDialog')).toBeHidden(); await start.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(history.locator(`.vilda-clcr-point[data-note-id="${note.id}"]`)).toHaveAttribute('data-value', '300');
  expect((await memory(start)).notes).toHaveLength(1); expect((await memory(start)).originalsLocked).toBe(true);
});
