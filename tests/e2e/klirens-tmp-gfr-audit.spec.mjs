import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';
import { installMemoryVault, memory, saveVisible } from '../support/klirens-patient-record.mjs';
import { applySession, base, captureSave, card, choose, details, expectBlocked, expectResult, openCalculator, restore } from '../support/klirens-tmp-gfr-browser.mjs';

const concentrations = ['U_PO4_spot', 'Ucr_spot', 'S_PO4_spot', 'Scr_spot'];

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const observation = await page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector);
      if (!node?.checkVisibility()) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, right: r.right, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), input: box('#tmpGfrInputCard'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'),
      saveDate: box('#clcrVisitDate'), saveButton: box('#clcrVisitSaveBtn'),
      fields: [...document.querySelectorAll('#tmpGfrInputCard input:not([type="checkbox"]),#tmpGfrInputCard select')]
        .filter(node => node.checkVisibility()).map(node => {
          const r = node.getBoundingClientRect();
          return { id: node.id, x: r.x, right: r.right, height: r.height, font: parseFloat(getComputedStyle(node).fontSize) };
        }),
      headings: ['#tmpGfrUrineFields h3', '#tmpGfrSerumFields h3'].map(selector => {
        const node = document.querySelector(selector), r = node?.getBoundingClientRect();
        return { visible: node?.checkVisibility() === true, top: r?.top, bottom: r?.bottom, text: node?.textContent };
      }),
    };
  });
  expect(observation.overflow).toBeLessThanOrEqual(1);
  expect(observation.input).not.toBeNull();
  expect(Math.abs(observation.form.width - observation.input.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(observation.clear.width - observation.input.width)).toBeLessThanOrEqual(1);
  for (const field of observation.fields) {
    expect(field.height, field.id).toBeGreaterThanOrEqual(48);
    expect(field.font, field.id).toBeGreaterThanOrEqual(16);
    expect(field.x, field.id).toBeGreaterThanOrEqual(0);
    expect(field.right, field.id).toBeLessThanOrEqual(width + 1);
  }
  for (const heading of observation.headings) {
    expect(heading.visible, heading.text).toBe(true);
    expect(heading.bottom - heading.top, heading.text).toBeGreaterThan(0);
  }
  if (width < 980) expect(observation.report.top - observation.clear.bottom).toBeGreaterThanOrEqual(20);
  else {
    expect(Math.abs(observation.report.top - observation.activePanel.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(observation.report.width - observation.activePanel.width)).toBeLessThanOrEqual(1);
  }
  expect(Boolean(observation.saveDate)).toBe(Boolean(observation.saveButton));
  if (observation.saveDate) {
    expect(Math.abs(observation.saveDate.x - observation.saveButton.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(observation.saveDate.width - observation.saveButton.width)).toBeLessThanOrEqual(1);
  }
  return observation;
}

function sameWidths(before, after) {
  for (const key of ['form', 'input', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
}

async function colors(page) {
  return card(page).evaluate(node => {
    const color = selector => getComputedStyle(node.querySelector(selector)).color;
    return {
      main: color('.clcr-result-value'), reference: color('.tmp-gfr-reference-value'),
      referenceUnit: color('.tmp-gfr-reference-unit'), trp: color('.tmp-gfr-trp-value'),
      trpReference: color('.tmp-gfr-trp-reference-value'), serum: color('.tmp-gfr-serum-result strong'),
      mainTone: node.dataset.clcrTone, serumTone: node.querySelector('.tmp-gfr-serum-row').dataset.serumTone,
    };
  });
}

for (const width of [1440, 390, 320]) {
  test(`TmP/GFR: cztery stężenia, TRP w głównym wyniku i stała geometria przy ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page, Object.fromEntries(concentrations.map(id => [id, ''])));
    await expect(page.locator('#tmpGfrRequiredCount')).toHaveText('0/4');
    await expectBlocked(page);
    for (const id of ['weight', 'height', 'spotSampleKind', 'ui_tmpPairedSameTime_answer', 'ui_tmpOvernightFasting_answer']) await expect(page.locator('#' + id)).toBeHidden();
    const initial = await geometry(page, width);
    for (const id of concentrations) await page.locator('#' + id).fill(base[id]);
    const result = await expectResult(page, { raw: 0.9, tone: 'warning' });
    expect(result.status).toBe('below');
    expect(result.trp).toBeCloseTo(0.8181818181818182, 12);
    await expect(page.locator('#tmpGfrRequiredCount')).toHaveText('4/4');
    await expect(card(page).locator('.tmp-gfr-trp-value')).toContainText('81,8');
    await expect(card(page)).toContainText('85–95%');
    await expect(card(page)).toContainText('0,97–1,64');
    await expect(card(page)).not.toContainText(/Pełna interpretacja jest ograniczona|Do pełnej interpretacji/);
    const initialColors = await colors(page);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#tmpBurosumab').check();
    await expect(page.locator('#tmpDaysSinceDose')).toBeVisible();
    await page.locator('#tmpDaysSinceDose').fill('14');
    await page.locator('#S_PO4_spot').fill('1.8');
    const highPhosphate = await expectResult(page, { raw: 1.6, tone: 'success' });
    expect(highPhosphate.status).toBe('within');
    expect(highPhosphate.serumPhosphate.status).toBe('above');
    await expect(card(page).locator('.tmp-gfr-trp-value')).toContainText('88,9');
    const highColors = await colors(page);
    expect(highColors.serumTone).toBe('danger');
    expect(highColors.main).not.toBe(highColors.serum);
    expect(highColors.reference).toBe(initialColors.reference);
    expect(highColors.referenceUnit).toBe(initialColors.referenceUnit);
    expect(highColors.referenceUnit).not.toBe(highColors.serum);
    expect(highColors.trp).toBe(initialColors.trp);
    expect(highColors.trpReference).toBe(initialColors.trpReference);
    sameWidths(initial, await geometry(page, width));
    await details(page).locator(':scope > summary').click();
    await expect(details(page)).toContainText(/Brodehl|GPN/);
    await expect(details(page)).toContainText(/FEPO/);
    await page.locator('#S_PO4_spot').fill('1.9');
    await expectResult(page, { raw: 1.7, tone: 'warning' });
    await expect(details(page)).toHaveAttribute('open', '');
    sameWidths(initial, await geometry(page, width));
    const screenshot = testInfo.outputPath(`tmp-gfr-${width}-workspace.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: screenshot });
    await testInfo.attach(`tmp-gfr-${width}-workspace`, { path: screenshot, contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expectBlocked(page);
    await expect(page.locator('#tmpGfrRequiredCount')).toHaveText('0/4');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('TmP/GFR: granica normy, jednostki i znana niezgodność próbki przechodzą przez rzeczywisty formularz', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { S_PO4_spot: '1.17' });
  const boundary = await expectResult(page, { raw: 0.97, tone: 'success' });
  expect(boundary.status).toBe('within');
  await restore(page, { U_PO4_spot: '61.94', U_PO4_spot_unit: 'mg/dl', S_PO4_spot: '3.62349', S_PO4_spot_unit: 'mg/dl',
    Ucr_spot: '5000', Ucr_spot_unit: 'umol', Scr_spot: '0.05', Scr_spot_unit: 'mmol/L' });
  const converted = await expectResult(page, { raw: 0.97, tone: 'success' });
  expect(converted.status).toBe('within');
  await restore(page, { FENa_sample_status: 'different-time' });
  await expectBlocked(page);
  for (const id of concentrations) await expect(page.locator('#' + id)).toHaveValue(base[id]);
  await restore(page, { ui_tmpPairedSameTime_answer: 'no' });
  await expectBlocked(page);
});

test('TmP/GFR: zapisuje jeden wynik wraz z TRP, metodą i niezależną oceną fosforanów', async ({ page }, testInfo) => {
  await openCalculator(page);
  await restore(page, { S_PO4_spot: '1.8', tmpBurosumab: true, tmpDaysSinceDose: '14' });
  const result = await expectResult(page, { raw: 1.6, tone: 'success' });
  const saved = await captureSave(page);
  expect(saved.vaultLocked).toBe(true);
  expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
  expect(saved.points).toHaveLength(1);
  expect(saved.points[0].tmpGfrSnapshot).toMatchObject({ rawValue: result.rawValue, method: result.method, trp: result.trp });
  expect(saved.notes).toHaveLength(1);
  const projection = await page.evaluate(notes => window.ClcrSavedResults.projectPatientNotes(notes), saved.notes);
  await testInfo.attach('tmp-gfr-sanitized-save', { body: JSON.stringify({ saved, projection, validation: await page.evaluate(notes => notes.map(note => ({ assessment: window.ClcrTmpGfrPersistence.savedAssessment(note), calculation: window.ClcrSavedCalculation.readSaved(note) })), saved.notes) }, null, 2), contentType: 'application/json' });
  expect(projection.measurements).toHaveLength(1);
  expect(projection.measurements[0]).toMatchObject({ valueNum: result.rawValue, outOfRange: false,
    tmpGfrAssessment: { status: 'within', serumPhosphate: { status: 'above' } } });
  await restore(page, { age: '45', S_PO4_spot: '1.1' });
  const frozen = await page.evaluate(notes => {
    const original = window.VildaClcrTmpGfr;
    window.VildaClcrTmpGfr = { evaluate: () => { throw new Error('Historia nie używa aktualnej normy'); } };
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements[0]; }
    finally { window.VildaClcrTmpGfr = original; }
  }, saved.notes);
  expect(frozen).toMatchObject({ valueNum: result.rawValue, outOfRange: false,
    tmpGfrAssessment: { method: result.method, status: 'within', trp: result.trp } });
});

test('TmP/GFR: przełączenie metody przy 19 latach rozdziela serie historii', async ({ page }) => {
  await openCalculator(page);
  const fields = { age: '18', ageMonths: '11', S_PO4_spot: '1', U_PO4_spot: '5', Scr_spot: '100', Ucr_spot: '10', tmpBurosumab: true, tmpDaysSinceDose: '14' };
  await restore(page, fields);
  await expectResult(page, { raw: 0.95 });
  const first = await captureSave(page, '2026-09-28');
  await restore(page, { ...fields, age: '19', ageMonths: '' });
  const adult = await expectResult(page, { raw: 1.1875, tone: 'neutral' });
  expect(adult.status).toBe('unassessed');
  const second = await captureSave(page, '2026-10-26');
  const summary = await page.evaluate(notes => {
    const projection = window.ClcrSavedResults.projectPatientNotes(notes);
    const host = document.body.appendChild(document.createElement('div'));
    const view = window.ClcrSavedResultsView.render(host, { projection, view: 'charts' });
    try { return { series: projection.series.map(series => ({ count: series.points.length })), points: host.querySelectorAll('.vilda-clcr-point').length }; }
    finally { view.destroy(); host.remove(); }
  }, [...first.notes, ...second.notes]);
  expect(summary.series).toHaveLength(2);
  expect(summary.series.every(series => series.count === 1)).toBe(true);
  expect(summary.points).toBe(2);
});

test('TmP/GFR: edycja zachowuje ID, czas od dawki i przelicza tylko wskazany pomiar', async ({ page }, testInfo) => {
  await openCalculator(page);
  await installMemoryVault(page);
  await restore(page, { tmpBurosumab: true, tmpDaysSinceDose: '14' });
  await expectResult(page, { raw: 0.9, guest: false });
  let note;
  try { [note] = await saveVisible(page, '2026-10-25'); }
  catch (error) { await testInfo.attach('tmp-gfr-save-status-failure', { body: JSON.stringify(await memory(page), null, 2), contentType: 'application/json' }); throw error; }
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), note);
  await page.locator('#editMeasurement').click();
  await expect(page.locator('#editDialog')).toBeVisible();
  await page.locator('#editField-S_PO4_spot').fill('-1');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editError')).toBeVisible();
  expect((await memory(page)).updates).toHaveLength(0);
  await page.locator('#editField-S_PO4_spot').fill('1.8');
  await page.locator('#saveEditedMeasurement').click();
  await expect(page.locator('#editDialog')).not.toBeVisible();
  const after = await memory(page);
  expect(after.updates).toHaveLength(1);
  expect(after.notes).toHaveLength(1);
  expect(after.notes[0].id).toBe(note.id);
  expect(after.originalsLocked).toBe(true);
  const saved = await page.evaluate(note => ({ saved: window.ClcrSavedCalculation.readSaved(note),
    point: window.ClcrSavedResults.projectPatientNotes([note]).measurements[0] }), after.notes[0]);
  expect(saved.saved.valid).toBe(true);
  expect(saved.saved.snapshot.values).toMatchObject({ tmpBurosumab: true, tmpDaysSinceDose: '14', S_PO4_spot: '1.8' });
  expect(saved.point.valueNum).toBeCloseTo(1.6, 12);
  expect(saved.point).toMatchObject({ tmpGfrAssessment: { status: 'within', serumPhosphate: { status: 'above' } } });
});

test('TmP/GFR: kontekst leczenia zachowuje się przy zmianie wzoru, a nowa sesja go nie dziedziczy', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { tmpBurosumab: true, tmpDaysSinceDose: '14' });
  await expectResult(page, { raw: 0.9 });
  await choose(page, 'ACR');
  await choose(page, 'TMP_GFR');
  await expect(page.locator('#tmpBurosumab')).toBeChecked();
  await expect(page.locator('#tmpDaysSinceDose')).toHaveValue('14');
  await expectResult(page, { raw: 0.9 });
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'TMP_GFR', inputs: { ...base } });
  await expect(page.locator('#tmpBurosumab')).not.toBeChecked();
  await expect(page.locator('#tmpDaysSinceDose')).toHaveValue('');
  await expect(page.locator('#tmpDaysSinceDose')).toBeHidden();
  await expectResult(page, { raw: 0.9 });
});

test('TmP/GFR: eksport przekazuje wynik, TRP i miejscowe ostrzeżenie o fosforanach', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { S_PO4_spot: '1.8', tmpBurosumab: true, tmpDaysSinceDose: '14' });
  const result = await expectResult(page, { raw: 1.6 });
  await page.evaluate(() => {
    window.__tmpGfrClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__tmpGfrClipboard = value; } } });
    window.alert = () => {};
  });
  await kliknij(page.locator('#askAI'));
  await expect.poll(() => page.evaluate(() => window.__tmpGfrClipboard)).toContain(result.display.text);
  const copied = await page.evaluate(() => window.__tmpGfrClipboard);
  expect(copied).toMatch(/TRP/);
  expect(copied).toMatch(/fosforan/i);
  const downloadPromise = page.waitForEvent('download');
  await kliknij(page.locator('#downloadDOCX'));
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.doc$/);
  const exported = await fs.readFile(await download.path(), 'utf8');
  expect(exported).toContain(result.display.text);
  expect(exported).toMatch(/TRP/);
  expect(exported).toMatch(/fosforan/i);
});

test('TmP/GFR: rzeczywista historia daje opisowy trend i zachowuje powód braku porównania obok ostrzeżenia', async ({ page }) => {
  await openCalculator(page);
  await installMemoryVault(page);
  await restore(page, { S_PO4_spot: '0.8', tmpBurosumab: true, tmpDaysSinceDose: '14' });
  await expectResult(page, { raw: 0.6, guest: false });
  await saveVisible(page, '2026-09-28');
  await page.locator('#clcrVisitDate').fill('2026-10-26');
  await page.locator('#S_PO4_spot').fill('1.1');
  await expectResult(page, { raw: 0.9, guest: false });
  await expect.poll(() => card(page).evaluate(node => JSON.parse(node.dataset.clcrTmpGfrSnapshot).treatment.comparisonAllowed)).toBe(true);
  await expect(card(page).locator('.tmp-gfr-trend-message')).toContainText(/wyższy/i);
  await expect(card(page).locator('.tmp-gfr-therapy-summary')).not.toContainText(/lek jest skuteczny|leczenie jest skuteczne|wskazuje na poprawę/i);
  await page.locator('#S_PO4_spot').fill('1.8');
  await expectResult(page, { raw: 1.6, guest: false, tone: 'success' });
  await expect(card(page).locator('.tmp-gfr-therapy-summary')).toHaveAttribute('data-treatment-tone', 'danger');
  await expect(card(page).locator('.tmp-gfr-therapy-copy')).toContainText(/przekraczają zakres dla wieku/i);
  await page.locator('#tmpDaysSinceDose').fill('7');
  await expect.poll(() => card(page).evaluate(node => {
    const model = JSON.parse(node.dataset.clcrTmpGfrSnapshot);
    return { comparison: model.treatment.comparisonAllowed, reason: model.treatment.reason, tone: model.treatment.tone, serum: model.serumPhosphate.status };
  })).toEqual({ comparison: false, reason: 'different-timing', tone: 'danger', serum: 'above' });
  await expect(card(page).locator('.tmp-gfr-trend-message')).toContainText(/innym czasie względem dawki/);
  await expect(card(page).locator('.tmp-gfr-therapy-copy')).toContainText(/przekraczają zakres dla wieku/i);
  await expect(card(page).locator('.tmp-gfr-trend-row')).toHaveCount(0);
  await page.locator('#tmpDaysSinceDose').fill('14');
  await page.locator('#U_PO4_spot').fill('1');
  await page.locator('#S_PO4_spot').fill('1.7');
  const above = await expectResult(page, { raw: 1.69, guest: false, tone: 'warning' });
  expect(above.status).toBe('above');
  expect(above.serumPhosphate.status).toBe('within');
  await expect(card(page).locator('.tmp-gfr-therapy-summary')).toContainText(/nie traktuj wzrostu jako celu leczenia/i);
  await expect(card(page).locator('.tmp-gfr-therapy-summary')).not.toContainText(/może wskazywać na poprawę|lek jest skuteczny|leczenie jest skuteczne/i);
  expect((await memory(page)).notes).toHaveLength(1);
});

test('TmP/GFR: znane AKI lub szybka zmiana kreatyniny zachowują wynik i jawne ograniczenie oceny leczenia', async ({ page }) => {
  await openCalculator(page);
  for (const [fields, fact, text] of [
    [{ suspectedAKI: true, ui_suspectedAKI_answer: 'yes' }, 'knownAKI', /AKI/],
    [{ creatinineState: 'rapidlyChanging' }, 'rapidlyChangingCreatinine', /zmieniająca się kreatynina|zmiana kreatyniny/i],
  ]) {
    await restore(page, { tmpBurosumab: true, tmpDaysSinceDose: '14', ...fields });
    const result = await expectResult(page, { raw: 0.9 });
    expect(result.knownFacts[fact]).toBe(true);
    expect(result.treatment.comparisonAllowed).toBe(false);
    await expect(card(page)).toContainText(text);
    await expect(page.locator('#tmpGfrInputCard')).toContainText(text);
    await expect(page.locator('#tmpGfrInputCard')).not.toContainText('Zakładamy sparowane próbki krwi i moczu oraz stabilną czynność nerek');
  }
});

test('TmP/GFR: niemowlę bez liczby miesięcy otrzymuje wynik bez ukrytego wymogu i bez zgadywania normy', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { age: '0', ageMonths: '', ageDays: '' });
  const result = await expectResult(page, { raw: 0.9, tone: 'neutral' });
  expect(result.status).toBe('unassessed');
  expect(result.reference).toBeNull();
  expect(result.serumPhosphate.reference).toBeNull();
  await expect(page.locator('#tmpGfrRequiredCount')).toHaveText('4/4');
  await expect(card(page)).toContainText(/zakres|norm/i);
  const readiness = await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('TMP_GFR'));
  expect(readiness.valueReady).toBe(true);
  expect(readiness.missingRequired || []).toHaveLength(0);
});
