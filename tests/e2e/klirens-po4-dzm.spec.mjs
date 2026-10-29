import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, openShellCalculator, saveVisible, selectPatient } from '../support/klirens-patient-record.mjs';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { applySession, card, choose, details, displayedNumber, expectBlocked, expectResult, openCalculator, restore } from '../support/klirens-po4-dzm-browser.mjs';

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), active: box('#clcrActivePanel'), input: box('#po4DzmInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      controls: [...document.querySelectorAll('#po4DzmInputCard input,#po4DzmInputCard select,#po4DzmInputCard button,[data-po4-dzm-output-unit],[data-po4-dzm-open-tmp]')].filter(node => node.checkVisibility()).map(node => ({
        id: node.id || node.textContent.trim(), font: parseFloat(getComputedStyle(node).fontSize),
        height: node.getBoundingClientRect().height, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
      })),
      numbers: [...document.querySelectorAll('#clcrResultReport .clcr-result-value,#clcrResultReport .po4-dzm-reference-value')].map(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const text = range.getBoundingClientRect(), box = node.getBoundingClientRect(), tops = [];
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) for (let index = 0; index < walker.currentNode.length; index += 1) {
          if (!/\S/.test(walker.currentNode.textContent[index])) continue;
          range.setStart(walker.currentNode, index); range.setEnd(walker.currentNode, index + 1);
          tops.push(range.getBoundingClientRect().top);
        }
        return { text: node.textContent, left: text.left, right: text.right,
          boxLeft: box.left, boxRight: box.right, lineShift: tops.length ? Math.max(...tops) - Math.min(...tops) : 0 };
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
    expect(number.lineShift, number.text).toBeLessThanOrEqual(1);
  }
  return result;
}

function sameWidths(before, after) {
  for (const key of ['form', 'input', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
}

for (const width of [1440, 390]) {
  test(`PO4 DZM: domyślny czas nie pokazuje czyszczenia pustego wyboru ${width}px`, async ({ page }) => {
    await openCalculator(page, width);
    await expect(page.locator('#formulaPicker')).toHaveValue('');
    await expect(page.locator('#PO4_collectionHours')).toHaveValue('24');
    await expect(page.locator('#clearContainer')).toBeHidden();
    await page.evaluate(() => window.clcrUpdate());
    await expect(page.locator('#clearContainer')).toBeHidden();
    // Selecting an equation retains the existing clear-action behavior, even
    // before a value is entered. A real zero is a measurement and is clearable.
    await choose(page, 'PO4_mgkg');
    await expect(page.locator('#clearBtn')).toBeVisible();
    await page.locator('#PO4_concentration').fill('0');
    await page.locator('#PO4_volume').fill('1000');
    await expectResult(page, { raw: 0, status: 'zero', tone: 'neutral', reference: false });
    await expect(page.locator('#clearBtn')).toBeVisible();
    await page.locator('#clearBtn').click();
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expect(page.locator('#PO4_concentration')).toHaveValue('');
    await expect(page.locator('#PO4_volume')).toHaveValue('');
  });
}

for (const width of [1440, 390, 320]) {
  test(`PO4 DZM: dwa pola, jedna liczba i stała geometria ${width}px`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page, { PO4_concentration: '', PO4_volume: '' });
    await expectBlocked(page);
    await expect(page.locator('#po4DzmInputCard input:visible')).toHaveCount(2);
    await expect(page.locator('#po4DzmInputCard select:visible')).toHaveCount(2);
    for (const id of ['weight', 'height', 'PO4_collectionHours', 'collectionStartAt', 'collectionEndAt', 'U_PO4', 'V24']) await expect(page.locator('#' + id)).toBeHidden();
    await expect(page.locator('#PO4_collectionHours')).toHaveValue('24');
    const initial = await geometry(page, width);
    await page.locator('#PO4_concentration').fill('10');
    await page.locator('#PO4_volume').fill('1500');
    await expectResult(page);
    await expect(page.locator('#clcrInfo')).toBeEmpty();
    sameWidths(initial, await geometry(page, width));
    await page.locator('[data-po4-dzm-mode="reported"]').click();
    await page.locator('#PO4_reportedValue').fill('941.0001');
    const high = await expectResult(page, { raw: 941.0001, status: 'high', tone: 'warning' });
    expect(displayedNumber(high.display.text)).toBeGreaterThan(941);
    const colors = await card(page).evaluate(node => ({
      value: getComputedStyle(node.querySelector('.clcr-result-value')).color,
      ref: getComputedStyle(node.querySelector('.po4-dzm-reference-value')).color,
      unit: getComputedStyle(node.querySelector('.po4-dzm-reference-unit')).color,
    }));
    expect(colors.value).not.toBe(colors.ref);
    expect(colors.ref).toBe(colors.unit);
    sameWidths(initial, await geometry(page, width));
    await details(page).locator('summary').click();
    sameWidths(initial, await geometry(page, width));
    const shot = testInfo.outputPath(`po4-dzm-${width}.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: shot });
    await testInfo.attach(`po4-dzm-${width}`, { path: shot, contentType: 'image/png' });
    await page.locator('#clearBtn').click();
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await choose(page, 'PO4_mgkg');
    await expectBlocked(page);
    await expect(page.locator('#PO4_collectionHours')).toHaveValue('24');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('PO4 DZM: jednostki masy P, objętości i gotowego wydalania pozostają zgodne', async ({ page }) => {
  await openCalculator(page);
  // Fixed synthetic expectations; all calculations run through the live producer.
  for (const [PO4_concentration, PO4_concentrationUnit, PO4_volume, PO4_volumeUnit] of [
    ['6.19476', 'mgP/dL', '1500', 'mL'], ['61.9476', 'mgP/L', '1.5', 'L'], ['2', 'mmol/L', '1500', 'mL'],
  ]) {
    await restore(page, { PO4_concentration, PO4_concentrationUnit, PO4_volume, PO4_volumeUnit });
    await expectResult(page, { raw: 92.9214, status: 'low', tone: 'warning' });
  }
  await restore(page, { PO4_inputMode: 'reported', PO4_reportedValue: '3', PO4_reportedUnit: 'mmol/24h', PO4_outputUnit: 'mmol/24h' });
  const mmol = await expectResult(page, { raw: 92.9214, status: 'low', tone: 'warning', unit: 'mmol/24 h' });
  expect(displayedNumber(mmol.presentation.valueText)).toBe(3);
  const collected = await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'PO4_mgkg' }));
  expect(collected).toHaveLength(1);
  expect(collected[0]).toMatchObject({ valueNum: 3, unit: 'mmol/24 h' });
  await restore(page);
  await page.locator('#PO4_concentrationUnit').focus();
  await page.locator('#PO4_concentrationUnit').press('ArrowDown');
  await expect(page.locator('#PO4_concentrationUnit')).toHaveValue('mgP/L');
  expect(displayedNumber(await page.locator('#PO4_concentration').inputValue())).toBe(100);
  await page.locator('#PO4_volumeUnit').focus(); await page.locator('#PO4_volumeUnit').press('End');
  await expect(page.locator('#PO4_volumeUnit')).toHaveValue('L');
  expect(displayedNumber(await page.locator('#PO4_volume').inputValue())).toBe(1.5);
  await expectResult(page);
  await page.locator('[data-po4-dzm-output-unit]').selectOption('mmol/24h');
  await expectResult(page, { unit: 'mmol/24 h' });
  await restore(page, { PO4_inputMode: 'reported', PO4_reportedValue: '30.9738' });
  await page.locator('#PO4_reportedUnit').focus(); await page.locator('#PO4_reportedUnit').press('End');
  await expect(page.locator('#PO4_reportedUnit')).toHaveValue('mmol/24h');
  expect(displayedNumber(await page.locator('#PO4_reportedValue').inputValue())).toBe(1);
  await expectResult(page, { raw: 30.9738, status: 'low', tone: 'warning' });
});

test('PO4 DZM: jawny wybór wskazuje dwa braki jednym przewinięciem i zachowuje inne dane', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await openCalculator(page, 390);
  const fields = { PO4_concentration: '', PO4_volume: '', weight: '30', height: '135', Scr: '0.7', U_Alb: '42' };
  await restore(page, fields);
  const protectedIds = ['age', 'sex', 'weight', 'height', 'Scr', 'U_Alb'];
  const readProtected = () => page.evaluate(ids => Object.fromEntries(ids.map(id => [id, document.getElementById(id).value])), protectedIds);
  const before = await readProtected();
  const navigations = () => page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount);
  const count = await navigations();
  await page.locator('#formulaSearch').fill('fosfor');
  await page.locator('.clcr-search-result[data-formula-id="PO4_mgkg"]').click();
  await expect.poll(navigations).toBe(count + 1);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.lastTarget)).toBe('PO4_concentration');
  await expect(page.locator('#PO4_concentration')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#PO4_volume')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#clcrForm .clcr-missing-input:visible')).toHaveCount(2);
  await expect.poll(() => page.locator('#PO4_concentration').evaluate(node => {
    const box = node.getBoundingClientRect(); return box.top >= 40 && box.bottom <= innerHeight - 40;
  })).toBe(true);
  expect(await readProtected()).toEqual(before);
  await page.locator('#PO4_concentration').fill('10');
  await expect(page.locator('#PO4_concentration')).not.toHaveClass(/clcr-missing-input/);
  await page.locator('#PO4_volume').fill('1500'); await expectResult(page);
  expect(await navigations()).toBe(count + 1);
  await restore(page, { ...fields, PO4_concentration: '10', PO4_volume: '1500' });
  expect(await navigations()).toBe(count + 1); expect(await readProtected()).toEqual(before);
});

test('PO4 DZM: pełne lata i płeć wybierają wyłącznie przyjęty profil Labcorp', async ({ page }) => {
  await openCalculator(page);
  for (const [age, sex, lower, upper] of [
    ['6', 'M', 130, 941], ['12', 'F', 130, 941], ['13', 'M', 390, 1425], ['80', 'M', 390, 1425],
    ['13', 'F', 261, 1078], ['80', 'F', 261, 1078], ['81', 'M', 210, 888], ['81', 'F', 96, 706],
  ]) {
    for (const endpoint of [lower, upper]) {
      await restore(page, { age, sex, PO4_inputMode: 'reported', PO4_reportedValue: String(endpoint) });
      const model = await expectResult(page, { raw: endpoint });
      expect(model.reference).toMatchObject({ lower, upper });
    }
  }
  for (const fields of [{ age: '5' }, { age: '', ageMonths: '' }, { age: '13', sex: '' }, { age: '81', sex: '' }]) {
    await restore(page, fields);
    await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  }
  await restore(page, { age: '6', sex: '' });
  await expectResult(page);
});

test('PO4 DZM: walidacja, zero i znany czas obejmują oba tryby', async ({ page }) => {
  await openCalculator(page);
  for (const PO4_concentration of ['', '-1', 'NaN', 'Infinity', '0x10', '1x']) {
    await restore(page, { PO4_concentration }); await expectBlocked(page);
  }
  await restore(page, { PO4_concentration: '0' });
  await expectResult(page, { raw: 0, status: 'zero', tone: 'neutral', reference: false });
  await restore(page, { PO4_concentration: '0.001' });
  const tiny = await expectResult(page, { raw: 0.015, status: 'low', tone: 'warning' });
  expect(displayedNumber(tiny.display.text)).toBeGreaterThan(0);
  await restore(page, { PO4_collectionHours: '' }); await expectResult(page);
  await restore(page, { PO4_collectionHours: '12', PO4_collectionSource: 'user' });
  await expectResult(page, { raw: 300, status: 'unassessed', tone: 'neutral', reference: false });
  await page.locator('[data-po4-dzm-mode="reported"]').click();
  await page.locator('#PO4_reportedValue').fill('150');
  await expect(page.locator('#PO4_collectionHours')).toHaveValue('12');
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false });
  for (const PO4_inputMode of ['concentration', 'reported']) {
    for (const PO4_collectionHours of ['0', '-1', 'NaN']) {
      await restore(page, { PO4_inputMode, PO4_reportedValue: '150', PO4_collectionHours }); await expectBlocked(page);
    }
    await restore(page, { PO4_inputMode, PO4_reportedValue: '150', ui_collectionNoMissedVoids_answer: 'no' });
    await expectBlocked(page);
  }
});

test('PO4 DZM: mała dodatnia liczba i brak normy zachowują surowy zapis oraz zamrożoną historię', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  await restore(page, { PO4_concentration: '0.001' });
  const model = await expectResult(page, { raw: 0.015, status: 'low', tone: 'warning', guest: false });
  const [small] = await saveVisible(page, '2026-10-24');
  expect(small.labResult.valueNum).toBeCloseTo(0.015, 12);
  expect(displayedNumber(small.labResult.value)).toBeGreaterThan(0);
  expect(small.labResult.value).toBe(model.display.text);
  await restore(page, { age: '5' });
  await expectResult(page, { status: 'unassessed', tone: 'neutral', reference: false, guest: false });
  const [unassessed] = await saveVisible(page, '2026-10-25');
  const projected = await page.evaluate(notes => {
    const producer = window.VildaClcrPo4Dzm;
    const blocked = new Proxy({}, { get() { return () => { throw new Error('History must not call current PO4 producer'); }; } });
    window.VildaClcrPo4Dzm = blocked;
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; }
    finally { window.VildaClcrPo4Dzm = producer; }
  }, [small, unassessed]);
  expect(projected[0]).toMatchObject({ valueNum: small.labResult.valueNum, displayValue: model.display.text, outOfRange: true });
  expect(projected[1]).toMatchObject({ valueNum: 150, outOfRange: null });
  await page.evaluate(notes => { window.__po4SyntheticNotes = notes; }, [small, unassessed]);
  const history = await readVisibleSavedHistory(page, '__po4SyntheticNotes');
  expect(history.visible).toBe(true); expect(history.ids).toEqual(history.originalIds);
  expect(history.points[0].valueNum).toBeCloseTo(0.015, 12);
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('PO4 DZM: wybór pacjenta nie przypisuje wcześniejszego anonimowego pomiaru', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page, { select: false });
  await restore(page);
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await selectPatient(page);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await page.locator('#clcrVisitSaveBtn').evaluate(button => button.click());
  expect((await memory(page)).notes).toHaveLength(0);
  await page.locator('#clcrStartPatientMeasurementBtn').click();
  await restore(page, { PO4_inputMode: 'reported', PO4_reportedValue: '500' });
  await expectResult(page, { raw: 500, guest: false });
  const [note] = await saveVisible(page);
  expect(note.patientId).toBe(await page.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId')));
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('PO4 DZM: dawne daty nie zastępują nieznanego czasu zbiórki przy edycji', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  const old = await page.evaluate(() => {
    const api = window.ClcrSavedCalculation;
    const values = { U_PO4: '10', V24: '1500', age: '10', sex: 'M',
      collectionStartAt: '2025-10-20T08:00', collectionEndAt: '2025-10-21T08:00' };
    // An explicitly fictional pre-upgrade frozen record, built with the real
    // envelope writer. Historical read/edit must not evaluate today's policy.
    const point = { id: 'PO4_mgkg', sourceFormulaId: 'PO4_mgkg', label: 'Fikcyjne dawne wydalanie fosforu',
      rawValue: 150, valueNum: 150, displayValue: '150.0', unit: 'mg P/24 h', norm: '', tone: 'neutral', outOfRange: false };
    const snapshot = api.createSnapshot(point, { capture: { formulaId: 'PO4_mgkg', ageYears: 10, values,
      fields: Object.keys(values).map(id => ({ id, label: id, type: 'text' })) }, clinicalDateISO: '2025-10-21' });
    const note = { id: 'fictional-po4-legacy-missing-hours', patientId: window.ClcrVisitSave.resolveCurrentPatientId(),
      category: 'wynik-klirens', rev: 1, title: point.label, clinicalDateISO: '2025-10-21', body: 'Kalkulator klirensu · clcr:PO4_mgkg',
      labResult: { test: point.label, value: '150.0', valueNum: 150, unit: point.unit, norm: '' } };
    note.body += '\n\n' + api.serializeSnapshot(snapshot, note);
    if (!api.readSaved(note).valid) throw new Error('Fictional legacy PO4 envelope failed to round trip');
    window.__clcrRecordFixture.seed([note]);
    return note;
  });
  const oldPoint = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], old);
  expect(oldPoint).toMatchObject({ valueNum: 150, norm: '', outOfRange: null, tone: 'neutral' });
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), old);
  await page.locator('#editMeasurement').click();
  const hours = page.locator('#editField-PO4_collectionHours');
  await expect(hours).toHaveValue(''); await expect(hours).toHaveAttribute('required', '');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeVisible(); expect((await memory(page)).updates).toHaveLength(0);
  await hours.fill('12'); await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const edited = (await memory(page)).notes.find(note => note.id === old.id);
  expect(edited.labResult.valueNum).toBe(300);
  const corrected = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], edited);
  expect(corrected).toMatchObject({ valueNum: 300, norm: '', outOfRange: null });
});

test('PO4 DZM: edycja daty, jednostek i czasu zmienia tylko wybrany pomiar', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page);
  const [first] = await saveVisible(page, '2026-10-24');
  await restore(page, { PO4_inputMode: 'reported', PO4_reportedValue: '400' });
  const [sibling] = await saveVisible(page, '2026-10-25');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), first);
  await page.locator('#editMeasurement').click();
  await page.locator('#editDate').fill('2026-10-23');
  await page.locator('#editField-PO4_concentrationUnit').selectOption('mmol/L');
  await page.locator('#editField-PO4_concentration').fill('2');
  await page.locator('#editField-PO4_volumeUnit').selectOption('L');
  await page.locator('#editField-PO4_volume').fill('1.5');
  await page.locator('#editField-PO4_collectionHours').fill('0');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editError')).toBeVisible();
  expect((await memory(page)).updates).toHaveLength(0);
  await page.locator('#editField-PO4_collectionHours').fill('12');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).toBeHidden();
  const saved = await memory(page), edited = saved.notes.find(note => note.id === first.id);
  expect(saved.notes).toHaveLength(2); expect(saved.notes.find(note => note.id === sibling.id)).toEqual(sibling);
  expect(edited.clinicalDateISO).toBe('2026-10-23'); expect(edited.labResult.valueNum).toBeCloseTo(185.8428, 8);
  const point = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], edited);
  expect(point).toMatchObject({ outOfRange: null });
  expect(saved.originalsLocked).toBe(true);
});

test('PO4 DZM: sesja przetrwa reload, a nowy pacjent nie dostaje starego pomiaru', async ({ page }) => {
  await openCalculator(page);
  await page.waitForFunction(() => !window.VildaPersistence?.isAutosaveSuppressed?.());
  await restore(page, { PO4_concentration: '', PO4_volume: '' });
  await page.locator('[aria-controls="po4DzmDurationEditor"]').click();
  await page.locator('#PO4_collectionHours').fill('12');
  await page.locator('[data-po4-dzm-mode="reported"]').click();
  await page.locator('#PO4_reportedValue').fill('500');
  await page.locator('#PO4_reportedUnit').focus(); await page.locator('#PO4_reportedUnit').press('End');
  await expect(page.locator('#PO4_reportedUnit')).toHaveValue('mmol/24h');
  await expectResult(page, { raw: 500, status: 'unassessed', tone: 'neutral', reference: false });
  const reported = await page.locator('#PO4_reportedValue').inputValue();
  const conversions = await page.locator('#PO4_unitConversions').inputValue();
  expect(conversions).not.toBe('');
  await expect.poll(() => page.evaluate(() => {
    const saved = window.VildaPersistence?.readClcrSession?.() || JSON.parse(sessionStorage.getItem('vildaClcrSessionV1') || 'null');
    const input = saved?.inputs || {};
    return { mode: input.PO4_inputMode, hours: input.PO4_collectionHours, unit: input.PO4_reportedUnit,
      value: input.PO4_reportedValue, conversions: input.PO4_unitConversions };
  })).toEqual({ mode: 'reported', hours: '12', unit: 'mmol/24h', value: reported, conversions });
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterGuest(page, { calculator: true });
  await expect(page.locator('#PO4_inputMode')).toHaveValue('reported');
  await expect(page.locator('#PO4_reportedValue')).toHaveValue(reported);
  await expect(page.locator('#PO4_reportedUnit')).toHaveValue('mmol/24h');
  await expect(page.locator('#PO4_unitConversions')).toHaveValue(conversions);
  await expect(page.locator('#PO4_collectionHours')).toHaveValue('12');
  await expectResult(page, { raw: 500, status: 'unassessed', tone: 'neutral', reference: false });
  await choose(page, 'Mg_mgkg'); await choose(page, 'PO4_mgkg');
  await expectResult(page, { raw: 500, status: 'unassessed', tone: 'neutral', reference: false });
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'PO4_mgkg', inputs: { age: '12', sex: 'F' } });
  await expectBlocked(page); await expect(page.locator('#PO4_reportedValue')).toHaveValue('');
  await expect(page.locator('#PO4_unitConversions')).toHaveValue('');
});

test('PO4 DZM: Szczegóły zachowują kontekst endokrynologiczny i otwierają świeżą parę TmP/GFR', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  await restore(page, { PO4_inputMode: 'reported', PO4_reportedValue: '500', S_PO4_spot: '2', U_PO4_spot: '35', Ucr_spot: '100', Scr_spot: '1' });
  await expectResult(page, { raw: 500, guest: false });
  await expect(details(page)).not.toHaveAttribute('open', '');
  await details(page).locator('summary').click();
  for (const term of [/przytarczyc/i, /XLH/, /burosumab/i, /surowic/i]) await expect(details(page)).toContainText(term);
  const patient = await page.evaluate(() => ({ id: sessionStorage.getItem('vildaCurrentPatientId'), age: document.getElementById('age').value, sex: document.getElementById('sex').value }));
  await details(page).locator('[data-po4-dzm-open-tmp]').click();
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'TMP_GFR');
  for (const id of ['S_PO4_spot', 'U_PO4_spot', 'Ucr_spot', 'Scr_spot']) await expect(page.locator('#' + id)).toHaveValue('');
  expect(await page.evaluate(() => ({ id: sessionStorage.getItem('vildaCurrentPatientId'), age: document.getElementById('age').value, sex: document.getElementById('sex').value }))).toEqual(patient);
  expect(await page.evaluate(() => window.canComputeFormula('TMP_GFR'))).toBe(false);
  expect((await memory(page)).notes).toHaveLength(0);
});

test('PO4 DZM: AI i Word przekazują tę samą liczbę, normę i ocenę', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { PO4_inputMode: 'reported', PO4_reportedValue: '941.0001' });
  const model = await expectResult(page, { raw: 941.0001, status: 'high', tone: 'warning' });
  await page.evaluate(() => {
    window.__po4Clipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__po4Clipboard = value; } } });
    window.alert = () => {};
  });
  await page.locator('#askAI').click();
  await expect.poll(() => page.evaluate(() => window.__po4Clipboard)).toContain(model.display.text);
  const copied = await page.evaluate(() => window.__po4Clipboard);
  for (const value of [model.display.text, model.unit, model.referenceText, model.interpretation]) expect(copied).toContain(value);
  const pendingDownload = page.waitForEvent('download'); await page.locator('#downloadDOCX').click();
  const download = await pendingDownload, html = await fs.readFile(await download.path(), 'utf8');
  const text = await page.evaluate(value => new DOMParser().parseFromString(value, 'text/html').body.textContent, html);
  for (const value of [model.display.text, model.unit, model.referenceText, model.interpretation]) expect(text).toContain(value);
});

test('PO4 DZM: powłoka, karta Badania i edytor działają bez otwarcia silnika w Start', async ({ page }) => {
  const { calculator, start } = await openShellCalculator(page);
  await restore(calculator, { PO4_inputMode: 'reported', PO4_reportedValue: '500' });
  const [note] = await saveVisible(calculator, '2026-10-24');
  await page.evaluate(() => { location.hash = '#/start'; });
  await page.evaluate(() => { location.hash = '#/klirens'; });
  await expect(card(calculator)).toHaveAttribute('data-clcr-value', '500');
  await expect(calculator.locator('#PO4_reportedValue')).toHaveValue('500');
  await calculator.locator('#clcrOpenCardBtn').click();
  await expect(page).toHaveURL(/app\.html#\/start/);
  const history = start.locator('.vilda-lab-hist-panel[data-panel="renal"] .vilda-clcr-history');
  await expect(history.locator(`tr[data-note-id="${note.id}"]`)).toHaveCount(1);
  await expect(history.locator(`.vilda-clcr-point[data-note-id="${note.id}"]`)).toHaveAttribute('data-value', '500');
  expect(await start.evaluate(() => Boolean(window.VildaClcrPo4Dzm))).toBe(false);
  await history.locator(`.vilda-clcr-value[data-note-id="${note.id}"]`).click();
  await start.locator('#editMeasurement').click();
  await start.locator('#editField-PO4_reportedValue').fill('600');
  await start.locator('#saveEditedMeasurement').click();
  await expect(start.locator('#editDialog')).toBeHidden();
  await start.locator('#detailsDialog').getByRole('button', { name: 'Zamknij', exact: true }).click();
  await expect(history.locator(`.vilda-clcr-point[data-note-id="${note.id}"]`)).toHaveAttribute('data-value', '600');
  expect((await memory(start)).originalsLocked).toBe(true);
});
