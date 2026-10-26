import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { installMemoryVault, memory, saveVisible } from '../support/klirens-patient-record.mjs';
import { applySession, base, captureSave, card, choose, details, expectBlocked, expectResult, openCalculator, restore } from '../support/klirens-uag-browser.mjs';

async function openDetails(page) {
  if (await details(page).getAttribute('open') === null) await kliknij(details(page).locator(':scope > summary'));
}

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector);
      if (!node?.checkVisibility()) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('#uagInputCard'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'), saveDate: box('#clcrVisitDate'), saveButton: box('#clcrVisitSaveBtn'),
      fields: [...document.querySelectorAll('#uagInputCard input,#uagInputCard select')].filter(node => node.checkVisibility()).map(node => {
        const r = node.getBoundingClientRect();
        return { id: node.id, height: r.height, font: parseFloat(getComputedStyle(node).fontSize), x: r.x, right: r.right };
      }),
      rows: [...document.querySelectorAll('#uagInputCard .uag-value-row')].map(node => {
        const r = node.getBoundingClientRect(), unit = node.lastElementChild.getBoundingClientRect(), input = node.firstElementChild.getBoundingClientRect();
        return { x: r.x, width: r.width, unitWidth: unit.width, unitRight: unit.right, inputTop: input.top, unitTop: unit.top, inputHeight: input.height, unitHeight: unit.height };
      }),
      text: [...document.querySelectorAll('#clcrResultReport .clcr-result-value,#clcrResultReport .clcr-result-reference')].map(node => {
        const range = document.createRange(); range.selectNodeContents(node);
        const bounds = range.getBoundingClientRect(), container = node.getBoundingClientRect();
        return { text: node.textContent.trim(), textLeft: bounds.left, textRight: bounds.right, left: container.left, right: container.right };
      }),
    };
  });
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(result.inputCard).not.toBeNull();
  expect(Math.abs(result.form.width - result.inputCard.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.clear.width - result.inputCard.width)).toBeLessThanOrEqual(1);
  expect(result.rows).toHaveLength(3);
  for (const row of result.rows) {
    expect(Math.abs(row.x - result.rows[0].x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(row.width - result.rows[0].width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(row.unitWidth - result.rows[0].unitWidth)).toBeLessThanOrEqual(0.5);
    expect(row.unitRight).toBeLessThanOrEqual(width + 1);
    expect(Math.abs(row.inputTop - row.unitTop)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(row.inputHeight - row.unitHeight)).toBeLessThanOrEqual(0.5);
  }
  for (const field of result.fields) {
    expect(field.height, field.id).toBeGreaterThanOrEqual(48);
    expect(field.font, field.id).toBeGreaterThanOrEqual(16);
    expect(field.x, field.id).toBeGreaterThanOrEqual(0);
    expect(field.right, field.id).toBeLessThanOrEqual(width + 1);
  }
  for (const text of result.text) {
    expect(text.textLeft, text.text).toBeGreaterThanOrEqual(text.left - 0.5);
    expect(text.textRight, text.text).toBeLessThanOrEqual(text.right + 0.5);
  }
  if (width < 980) expect(result.report.top - result.clear.bottom).toBeGreaterThanOrEqual(20);
  else {
    expect(Math.abs(result.report.top - result.activePanel.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.report.width - result.activePanel.width)).toBeLessThanOrEqual(1);
  }
  expect(Boolean(result.saveDate)).toBe(Boolean(result.saveButton));
  if (result.saveDate) {
    expect(Math.abs(result.saveDate.x - result.saveButton.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(result.saveDate.width - result.saveButton.width)).toBeLessThanOrEqual(1);
  }
  return result;
}

function sameWidths(before, after) {
  for (const key of ['form', 'inputCard', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
}

for (const width of [1440, 390, 320]) {
  test(`UAG: trzy stężenia bez pytań i niezmienna geometria przy ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page, { U_Na_spot: '', U_K_spot: '', U_Cl_spot: '' });
    await expect(page.locator('#uagRequiredCount')).toHaveText('0/3');
    await expect(page.locator('#clcrResultReport')).toContainText('Wpisz trzy stężenia z moczu');
    expect(await page.locator('#uagInputCard input:visible').count()).toBe(3);
    expect(await page.locator('#uagInputCard select:visible').count()).toBe(0);
    for (const id of ['age', 'sex', 'weight', 'height', 'Scr_spot', 'Ucr_spot', 'ui_spotSameSpecimen_answer', 'ui_spotPairedChemistry_answer', 'ui_spotNagmaContext_answer']) await expect(page.locator('#' + id)).toBeHidden();
    for (const [id, name] of [['U_Na_spot', 'Sód w moczu'], ['U_K_spot', 'Potas w moczu'], ['U_Cl_spot', 'Chlorki w moczu']]) await expect(page.locator('#' + id)).toHaveAccessibleName(new RegExp(name));
    const initial = await geometry(page, width);
    for (const id of ['U_Na_spot', 'U_K_spot', 'U_Cl_spot']) await page.locator('#' + id).fill(base[id]);
    const result = await expectResult(page, { raw: -15 });
    expect(result.sign).toBe('negative');
    expect(result.sample.sameUrineSpecimen).toBe('assumed');
    await expect(page.locator('#uagRequiredCount')).toHaveText('3/3');
    await expect(card(page)).toContainText(/granica znaku/i);
    await expect(card(page)).not.toContainText(/Pełna interpretacja jest ograniczona|Do pełnej interpretacji|W normie|W zakresie dla wieku/);
    sameWidths(initial, await geometry(page, width));
    for (const [chloride, raw] of [['50', 15], ['65', 0], ['65.04', -0.04], ['64.96', 0.04], ['1000000', -999935]]) {
      await page.locator('#U_Cl_spot').fill(chloride);
      await expectResult(page, { raw });
      sameWidths(initial, await geometry(page, width));
    }
    await openDetails(page);
    await expect(details(page)).toContainText(/Kraut|Batlle|Yaxley|Uribarri/);
    await page.locator('#U_Cl_spot').fill('80');
    await expectResult(page, { raw: -15 });
    await expect(details(page)).toHaveAttribute('open', '');
    sameWidths(initial, await geometry(page, width));
    await page.locator('#U_K_spot').fill('-1');
    await expectBlocked(page);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#U_K_spot').fill('25');
    await expectResult(page, { raw: -15 });
    const screenshot = testInfo.outputPath(`uag-${width}-production.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(`uag-${width}-production`, { path: screenshot, contentType: 'image/png' });
    const crop = testInfo.outputPath(`uag-${width}-workspace.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: crop });
    await testInfo.attach(`uag-${width}-workspace`, { path: crop, contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expectBlocked(page);
    await expect(page.locator('#uagRequiredCount')).toHaveText('0/3');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('UAG: znaki i dokładne dziesiętne odejmowanie pozostają identyczne w wyniku, zapisie i odczycie historii', async ({ page }) => {
  await openCalculator(page);
  const cases = [
    ['40', '25', '80', -15, '-15', 'negative'],
    ['40', '25', '50', 15, '15', 'positive'],
    ['40', '25', '65.04', -0.04, '-0,04', 'negative'],
    ['40', '25', '64.96', 0.04, '0,04', 'positive'],
    ['0.3', '0.6', '0.9', 0, '0', 'zero'],
    ['0', '0', '0', 0, '0', 'zero'],
  ];
  for (const [index, [sodium, potassium, chloride, raw, display, sign]] of cases.entries()) {
    await restore(page, { U_Na_spot: sodium, U_K_spot: potassium, U_Cl_spot: chloride });
    const result = await expectResult(page, { raw });
    expect(result.sign).toBe(sign);
    expect(result.display.text.replace('−', '-').replace(/^\+/, '')).toBe(display);
    expect(result.reference.kind).toBe('sign-boundary');
    const saved = await captureSave(page, `2026-10-${20 + index}`);
    expect(saved.vaultLocked).toBe(true);
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
    expect(saved.points[0].valueNum).toBe(raw);
    expect(saved.points[0].uagSnapshot).toEqual(result);
    expect(saved.notes[0].labResult.value.replace('−', '-').replace(/^\+/, '')).toBe(display);
    const projection = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes), saved.notes);
    expect(projection.measurements).toHaveLength(1);
    expect(projection.measurements[0]).toMatchObject({ valueNum: raw, outOfRange: null, norm: '', uagAssessment: result });
  }
  const history = await readVisibleSavedHistory(page, '__uagSyntheticNotes');
  expect(history.visible).toBe(true);
  expect(history.ids).toEqual(history.originalIds);
  expect(history.dates).toEqual(history.originalDates);
  expect(history.points.map(point => point.valueNum)).toEqual(cases.map(item => item[3]));
  const chart = await page.evaluate(() => {
    const projection = window.ClcrSavedResults.projectPatientNotes(window.__uagSyntheticNotes);
    const host = document.body.appendChild(document.createElement('div'));
    const view = window.ClcrSavedResultsView.render(host, { projection, view: 'charts' });
    try { return [...host.querySelectorAll('.vilda-clcr-point')].map(node => ({ id: node.dataset.noteId, value: Number(node.dataset.value) })); }
    finally { view.destroy(); host.remove(); }
  });
  expect(chart.map(point => point.id)).toEqual(history.originalIds);
  expect(chart.map(point => point.value)).toEqual(cases.map(item => item[3]));
});

test('UAG: mały sód i znana PChN ograniczają wnioskowanie, a zapisana ocena pozostaje zamrożona', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_Na_spot: '10', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes' });
  const result = await expectResult(page, { raw: -45 });
  expect(result.knownFacts.knownCKD).toBe(true);
  await expect(card(page)).toContainText(/PChN|przewlekł.*chorob.*nerek/i);
  await expect(card(page)).toContainText(/20 mmol\/L/);
  await expect(card(page)).not.toContainText(/W normie|Poniżej normy|Powyżej normy|Rozpoznano/);
  const saved = await captureSave(page);
  expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
  expect(saved.notes[0].body).toMatch(/PChN|przewlekł.*chorob.*nerek/i);
  expect(saved.notes[0].body).toContain('20 mmol/L');
  await restore(page, { age: '80', U_Na_spot: '100' });
  const history = await page.evaluate(notes => {
    const original = window.VildaClcrUag;
    window.VildaClcrUag = { evaluate: () => { throw new Error('Historia nie przelicza aktualnej polityki'); } };
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; }
    finally { window.VildaClcrUag = original; }
  }, saved.notes);
  expect(history[0]).toMatchObject({ valueNum: -45, outOfRange: null, norm: '', uagAssessment: result });
});

test('UAG: różne chwile pobrania krwi nie blokują, nieznana próbka pozostaje założeniem, znana niezgodność moczu blokuje do wyczyszczenia', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { FENa_sample_status: 'different-time', ui_spotPairedChemistry_answer: 'no', ui_spotSameSpecimen_answer: 'unknown' });
  const result = await expectResult(page, { raw: -15 });
  expect(result.sample.sameUrineSpecimen).toBe('assumed');
  const point = (await captureSave(page)).points[0];
  expect(point.capture.values.ui_spotSameSpecimen_answer).toBe('unknown');
  await restore(page, { FENa_sample_status: 'different-urine', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes' });
  await expectBlocked(page);
  for (const id of ['U_Na_spot', 'U_K_spot', 'U_Cl_spot']) await expect(page.locator('#' + id)).toHaveValue(base[id]);
  await kliknij(page.locator('#clearBtn'));
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  for (const id of ['U_Na_spot', 'U_K_spot', 'U_Cl_spot']) await page.locator('#' + id).fill(base[id]);
  const cleared = await expectResult(page, { raw: -15 });
  expect(cleared.sample.sameUrineSpecimen).toBe('assumed');
  expect(cleared.knownFacts.knownCKD).toBe(true);
  await expect(page.locator('#FENa_sample_status')).not.toHaveValue('different-urine');
});

test('UAG: odtworzenie nie pożycza poprzednich elektrolitów, a przełączanie nie potwierdza protokołów FE i TmP/GFR', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { FENa_sample_status: 'different-time', U_PO4_spot: '10', S_PO4_spot: '1', Ucr_spot: '100', Scr_spot: '1',
    S_Na_spot: '140', S_K_spot: '4', S_Cl_spot: '100', tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: 'no' });
  await expectResult(page, { raw: -15 });
  for (const id of ['FENa_spot', 'FEK_spot', 'FECl_spot', 'TMP_GFR']) {
    await choose(page, id);
    expect(await page.evaluate(id => window.canComputeFormula(id), id)).toBe(false);
  }
  await choose(page, 'AGu_spot');
  await expectResult(page, { raw: -15 });
  await expect(page.locator('#FENa_sample_status')).toHaveValue('different-time');
  await expect(page.locator('#tmpPairedSameTime')).not.toBeChecked();
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'AGu_spot', inputs: { currentVersion: 'spot', formulaPicker: 'AGu_spot', U_Na_spot: '40' } });
  await expect(page.locator('#U_K_spot')).toHaveValue('');
  await expect(page.locator('#U_Cl_spot')).toHaveValue('');
  await expectBlocked(page);
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'AGu_spot', preservedInputs: { ...base } });
  await expectResult(page, { raw: -15 });
});

test('UAG: zapis i rzeczywisty edytor zachowują dawne potwierdzenie wspólnej próbki i odrzucają ujemne stężenia', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  await restore(page, { spotPairedChemistry: true, spotSameSpecimen: false, ui_spotSameSpecimen_answer: '' });
  const before = await expectResult(page, { raw: -15, guest: false });
  expect(before.sample.sameUrineSpecimen).toBe('confirmed');
  const [note] = await saveVisible(page);
  const saved = await page.evaluate(note => window.ClcrSavedCalculation.readSaved(note), note);
  expect(saved.valid).toBe(true);
  expect(saved.snapshot.values.spotPairedChemistry).toBe(true);
  const rejected = await page.evaluate(snapshot => {
    return [-10, ' ', true, '1e309'].map(value => {
      try { window.ClcrSavedCalculation.recalculate(snapshot, { values: { U_Na_spot: value } }); return false; }
      catch { return true; }
    });
  }, saved.snapshot);
  expect(rejected).toEqual([true, true, true, true]);
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), note);
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editDialog')).toBeVisible();
  const field = page.locator('#editField-U_Na_spot');
  await field.fill('-10');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editError')).toBeVisible();
  expect((await memory(page)).updates).toHaveLength(0);
  await field.fill('41');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).not.toBeVisible();
  await expect(page.locator('#calculationDetails .clcr-record-value')).toContainText(/[-−]14/);
  const after = await memory(page);
  expect(after.updates).toHaveLength(1);
  expect(after.notes).toHaveLength(1);
  expect(after.notes[0].id).toBe(note.id);
  expect(after.originalsLocked).toBe(true);
  const edited = await page.evaluate(note => window.ClcrSavedResults.projectPatientNotes([note]).measurements[0], after.notes[0]);
  expect(edited).toMatchObject({ valueNum: -14, uagAssessment: { rawValue: -14, sample: { sameUrineSpecimen: 'confirmed' } } });
});

test('UAG: rzeczywisty schowek i Word przekazują mały ujemny wynik z kontekstem', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_Cl_spot: '65.04' });
  const result = await expectResult(page, { raw: -0.04 });
  await page.evaluate(() => {
    window.__uagClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__uagClipboard = value; } } });
    window.alert = () => {};
  });
  await kliknij(page.locator('#askAI'));
  await expect.poll(() => page.evaluate(() => window.__uagClipboard)).toContain(result.display.text);
  const copied = await page.evaluate(() => window.__uagClipboard);
  expect(copied).toContain(result.interpretation);
  const downloadPromise = page.waitForEvent('download');
  await kliknij(page.locator('#downloadDOCX'));
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.doc$/);
  const exported = await fs.readFile(await download.path(), 'utf8');
  expect(exported).toContain(result.display.text);
  expect(exported).toContain(result.interpretation);
});

test('UAG: produkcyjne odtworzenie JSON przywraca trzy wartości i pozwala zapisać wyłącznie do istniejącej wybranej karty', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  page.on('dialog', dialog => dialog.accept());
  const payload = { name: 'Fikcyjny Pacjent UAG', clcr: { version: 2, currentVersion: 'spot', selectedFormula: 'AGu_spot',
    preservedInputs: { ...base, U_Cl_spot: '65.04', spotNagmaContext: true, ui_spotNagmaContext_answer: 'yes' } } };
  await page.evaluate(data => window.VildaDataImportExport.restoreLoadedState({ data }), payload);
  const restored = await expectResult(page, { raw: -0.04, guest: false });
  expect(restored.knownFacts.nagmaContext).toBe(true);
  const [note] = await saveVisible(page);
  expect(note.labResult.value).toBe('-0,04');
  const saved = await page.evaluate(note => window.ClcrSavedCalculation.readSaved(note), note);
  expect(saved.valid).toBe(true);
  expect(saved.snapshot.values).toMatchObject({ U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: '65.04', spotNagmaContext: true });
  const originalId = note.patientId;
  await page.evaluate(() => {
    window.ClcrVisitSave._setPatientId('fictional-missing-card-uag');
    window.ClcrVisitSave._refresh();
  });
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  const attempt = await page.evaluate(() => window.ClcrVisitSave.saveActiveResultToCard({ patientId: 'fictional-missing-card-uag', clinicalDateISO: '2026-10-25', root: document, formulaId: 'AGu_spot' }));
  expect(attempt.ok).toBe(false);
  expect((await memory(page)).notes).toHaveLength(1);
  expect((await memory(page)).notes[0].patientId).toBe(originalId);
});

test('UAG: brak, wartości ujemne i przepełnienie nie dają wyniku ani danych do zapisu', async ({ page }) => {
  await openCalculator(page);
  for (const id of ['U_Na_spot', 'U_K_spot', 'U_Cl_spot']) {
    for (const value of ['', '-1', '1e309']) {
      await restore(page, { [id]: value });
      await expectBlocked(page);
      await expect(page.locator('#clcrVisitSaveBtn')).toBeHidden();
      const attempt = await page.evaluate(() => window.ClcrVisitSave.saveActiveResultToCard({ clinicalDateISO: '2026-10-25', root: document, formulaId: 'AGu_spot' }));
      expect(attempt.ok).toBe(false);
    }
  }
  await restore(page, { U_Na_spot: '1e308', U_K_spot: '1e308', U_Cl_spot: '0' });
  await expectBlocked(page);
});
