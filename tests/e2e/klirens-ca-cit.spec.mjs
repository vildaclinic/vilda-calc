import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad } from '../support/uklad-czekanie.mjs';
import { enterGuest, installMemoryVault, memory, saveVisible } from '../support/klirens-patient-record.mjs';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { clcrPoint, clcrPoints, showClcrResults } from '../support/badania-klirens.mjs';
import { applySession, card, choose, details, expectBlocked, expectResult, openCalculator, restore } from '../support/klirens-ca-cit-browser.mjs';

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY }; };
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), active: box('#clcrActivePanel'), input: box('#caCitInputCard'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      modes: [...document.querySelectorAll('#caCitInputCard [data-ca-cit-mode]')].map(node => { const r = node.getBoundingClientRect(); return { width: r.width, height: r.height }; }),
      controls: [...document.querySelectorAll('#caCitInputCard input,#caCitInputCard select,#caCitInputCard button')].filter(node => node.checkVisibility()).map(node => ({
        id: node.id || node.textContent.trim(), font: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height,
        left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right,
      })),
    };
  });
  expect(result.overflow).toBeLessThanOrEqual(1);
  expect(Math.abs(result.form.width - result.input.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.clear.width - result.input.width)).toBeLessThanOrEqual(1);
  expect(result.clear.top - result.input.bottom).toBeGreaterThanOrEqual(15);
  expect(result.modes).toHaveLength(2);
  expect(Math.abs(result.modes[0].width - result.modes[1].width)).toBeLessThanOrEqual(0.5);
  if (width < 980) expect(result.report.top - result.clear.bottom).toBeGreaterThanOrEqual(20);
  else { expect(Math.abs(result.active.top - result.report.top)).toBeLessThanOrEqual(1); expect(Math.abs(result.active.width - result.report.width)).toBeLessThanOrEqual(1); }
  for (const control of result.controls) {
    expect(control.font, control.id).toBeGreaterThanOrEqual(16); expect(control.height, control.id).toBeGreaterThanOrEqual(48);
    expect(control.left, control.id).toBeGreaterThanOrEqual(0); expect(control.right, control.id).toBeLessThanOrEqual(width + 1);
  }
  return result;
}

async function expectResultTextFits(page) {
  const fit = await card(page).evaluate(node => {
    const box = selector => { const r = node.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right }; };
    const glyphs = selector => { const range = document.createRange(); range.selectNodeContents(node.querySelector(selector)); return [...range.getClientRects()].map(r => ({ left: r.left, right: r.right })); };
    return { patient: box('.clcr-result-patient'), reference: box('.clcr-result-reference'), value: glyphs('.clcr-result-value'), norm: glyphs('.ca-cit-reference-value') };
  });
  for (const glyph of fit.value) { expect(glyph.left).toBeGreaterThanOrEqual(fit.patient.left - .5); expect(glyph.right).toBeLessThanOrEqual(fit.patient.right + .5); }
  for (const glyph of fit.norm) { expect(glyph.left).toBeGreaterThanOrEqual(fit.reference.left - .5); expect(glyph.right).toBeLessThanOrEqual(fit.reference.right + .5); }
  expect(fit.patient.right).toBeLessThanOrEqual(fit.reference.left + .5);
}

function sameWidths(before, after) {
  for (const key of ['form', 'input', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), key).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), key).toBeLessThanOrEqual(0.5);
  }
}

for (const width of [1440, 390, 320]) {
  test(`Ca/Cit: dwa stężenia lub jeden raport i stały układ ${width}px`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width); await restore(page, { CACIT_calcium: '', CACIT_citrate: '' });
    await expectBlocked(page);
    for (const id of ['U_Ca', 'U_Cit', 'V24', 'weight', 'height', 'age', 'sex', 'Cl24DurationHours', 'stoneTwoCollectionsConfirmed']) await expect(page.locator('#' + id)).toBeHidden();
    await expect(page.locator('#CACIT_citrateUnit option')).toHaveText(['µmol/L', 'mmol/L', 'mg/L', 'mg/dL']);
    const initial = await geometry(page, width);
    await page.locator('#CACIT_calcium').fill('2'); await page.locator('#CACIT_citrate').fill('40');
    await expectResult(page); await expectResultTextFits(page); await expect(page.locator('#caCitInputCard')).toContainText('2/2');
    await expect(page.locator('#clcrDataCompletion')).toBeHidden(); sameWidths(initial, await geometry(page, width));
    const normalShot = testInfo.outputPath(`ca-cit-normal-${width}.png`); await page.locator('#clcrWorkspace').screenshot({ path: normalShot });
    await testInfo.attach(`ca-cit-normal-${width}`, { path: normalShot, contentType: 'image/png' });
    await page.locator('[data-ca-cit-mode="reported"]').click(); await page.locator('#CACIT_reportedValue').fill('0.6');
    await expectResult(page, { raw: 0.6, outOfRange: true }); await expect(page.locator('#caCitInputCard')).toContainText('1/1');
    const colors = await card(page).evaluate(node => ({ value: getComputedStyle(node.querySelector('.clcr-result-value')).color,
      reference: getComputedStyle(node.querySelector('.ca-cit-reference-value')).color, unit: getComputedStyle(node.querySelector('.ca-cit-reference-unit')).color }));
    expect(colors.value).not.toBe(colors.reference); expect(colors.reference).toBe(colors.unit);
    sameWidths(initial, await geometry(page, width)); await details(page).locator('summary').click(); sameWidths(initial, await geometry(page, width));
    await expect(details(page).locator('.ca-cit-current-reference[aria-current="true"]')).toHaveText('0,04–0,47');
    const clippedCells = await details(page).evaluate(node => [...node.querySelectorAll('th,td')].filter(cell => {
      const boundary = cell.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(cell);
      return [...range.getClientRects()].some(rect => rect.left < boundary.left - .5 || rect.right > boundary.right + .5);
    }).map(cell => cell.textContent));
    expect(clippedCells).toEqual([]);
    const shot = testInfo.outputPath(`ca-cit-${width}.png`); await page.locator('#clcrWorkspace').screenshot({ path: shot });
    await testInfo.attach(`ca-cit-${width}`, { path: shot, contentType: 'image/png' });
    await page.locator('[data-ca-cit-mode="concentration"]').click(); await page.locator('#CACIT_citrate').fill('0');
    await expectBlocked(page); sameWidths(initial, await geometry(page, width));
    await page.locator('#clearBtn').click(); await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expect(page.locator('#formulaPicker')).toHaveValue('Ca_Cit');
    await expect(page.locator('#CACIT_calcium')).toHaveValue(''); await expect(page.locator('#CACIT_citrate')).toHaveValue('');
    await expect(page.locator('#CACIT_reportedValue')).toHaveValue(''); await expect(page.locator('#age')).toHaveValue('10');
    await expectBlocked(page); sameWidths(initial, await geometry(page, width)); expect(errors).toEqual([]);
  });
}

test('Ca/Cit: wszystkie sześć górnych P95 ma włączoną granicę, dolne P5 nie alarmuje', async ({ page }) => {
  await openCalculator(page);
  for (const [age, sex, upper] of [[2, 'M', .48], [2, 'F', .42], [7, 'M', .60], [7, 'F', .47], [13, 'M', .80], [13, 'F', .60]]) {
    for (const [value, outside] of [[String(upper), false], [(upper + .001).toString(), true], ['0.000001', false]]) {
      await restore(page, { age: String(age), sex, CACIT_inputMode: 'reported', CACIT_reportedValue: value });
      const result = await expectResult(page, { raw: Number(value), outOfRange: outside }); expect(result.reference.upper).toBe(upper);
    }
  }
});

test('Ca/Cit: brak wieku/płci, wiek poniżej 2 lat i dorosły pozostają neutralne z gotowością 2/2', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [{ age: '', ageMonths: '' }, { sex: '' }, { age: '1', ageMonths: '11' }, { age: '18' }, { age: '50' }]) {
    await restore(page, fields); await expectResult(page, { reference: false, outOfRange: null });
    await expect(page.locator('#caCitInputCard')).toContainText('2/2'); await expect(page.locator('#clcrReadiness')).toBeHidden();
    await expect(card(page)).toHaveAttribute('data-clcr-tone', 'neutral');
  }
  await restore(page, { age: '2', ageMonths: '0' }); await expectResult(page);
});

test('Ca/Cit: jednostki masowe zachowują współczynnik wapnia 40,078, molowe nie otrzymują masowej normy', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [
    { CACIT_calcium: '2', CACIT_calciumUnit: 'mmol/L', CACIT_citrate: '40', CACIT_citrateUnit: 'mg/dL' },
    { CACIT_calcium: '80.156', CACIT_calciumUnit: 'mg/L', CACIT_citrate: '400', CACIT_citrateUnit: 'mg/L' },
    { CACIT_calcium: '8.0156', CACIT_calciumUnit: 'mg/dL', CACIT_citrate: '40', CACIT_citrateUnit: 'mg/dL' },
  ]) { await restore(page, fields); await expectResult(page); }
  for (const fields of [
    { CACIT_citrate: '2', CACIT_citrateUnit: 'mmol/L' },
    { CACIT_citrate: '2000', CACIT_citrateUnit: 'µmol/L' },
    { CACIT_inputMode: 'reported', CACIT_reportedValue: '1', CACIT_reportedUnit: 'mmol/mmol' },
  ]) { await restore(page, fields); await expectResult(page, { raw: 1, unit: 'mmol/mmol', reference: false, outOfRange: null }); }
  await expect(card(page)).toContainText(/mas|porównywaln/i);
  // Changing the report unit interprets the typed report; it must not guess a citrate molecular form.
  await restore(page); await page.locator('#CACIT_citrateUnit').selectOption('mmol/L');
  await expect(page.locator('#CACIT_citrate')).toHaveValue('40'); await expectResult(page, { raw: .05, unit: 'mmol/mmol', reference: false, outOfRange: null });
});

test('Ca/Cit: zero wapnia jest liczbą neutralną, zero cytrynianów i ujemne lub nieprawidłowe dane blokują', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [{ CACIT_calcium: '0' }, { CACIT_inputMode: 'reported', CACIT_reportedValue: '0' }]) {
    await restore(page, fields); const result = await expectResult(page, { raw: 0, outOfRange: null }); expect(result.tone).toBe('neutral');
  }
  for (const fields of [
    { CACIT_citrate: '0' }, { CACIT_sameSpecimen: 'different' }, { CACIT_calcium: '-1' }, { CACIT_citrate: '-1' }, { CACIT_calcium: '-1', CACIT_citrate: '-1' },
    { CACIT_inputMode: 'reported', CACIT_reportedValue: '-1' }, { CACIT_calcium: 'abc' }, { CACIT_calcium: '1e999' },
    { CACIT_calcium: '<1' }, { CACIT_citrate: '0x10' },
  ]) { await restore(page, fields); await expectBlocked(page); }
});

test('Ca/Cit: małe, bardzo duże i tuż ponad P95 wartości zachowują precyzję przy 320px', async ({ page }) => {
  await openCalculator(page, 320);
  for (const value of ['0.000000000000000000001', '999999999999999999999', '0.470000000000000000001']) {
    await restore(page, { CACIT_inputMode: 'reported', CACIT_reportedValue: value });
    const result = await expectResult(page, { raw: Number(value), outOfRange: value !== '0.000000000000000000001' });
    expect(result.display.text.replace(/\./g, ',').replace(/^≈\s*/, '≈ ')).not.toMatch(/^0(?:[.,]0+)?$/); await geometry(page, 320); await expectResultTextFits(page);
    if (value.startsWith('0.470')) await expect(card(page)).toContainText('0,470000000000000000001');
  }
});

test('Ca/Cit: znany problem materiału/czasu ogranicza normę bez usunięcia liczby i przetrwa zmianę trybu', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [{ CACIT_collectionProblem: 'true' }, { CACIT_collectionHours: '12', CACIT_durationKnown: 'true' }, { CACIT_sampleType: 'spot' },
    { CACIT_sampleSource: 'historical-unknown', CACIT_durationKnown: 'false' }]) {
    await restore(page, fields); await expectResult(page, { reference: false, outOfRange: null });
    await page.locator('[data-ca-cit-mode="reported"]').click(); await page.locator('#CACIT_reportedValue').fill('0.2');
    await expectResult(page, { raw: .2, reference: false, outOfRange: null });
  }
  await restore(page, { CACIT_sameSpecimen: 'different' }); await expectBlocked(page);
  await page.locator('[data-ca-cit-mode="reported"]').click(); await page.locator('#CACIT_reportedValue').fill('0.2');
  const reported = await expectResult(page, { raw: .2, reference: false, outOfRange: null });
  expect(reported.context.concentrationSameSpecimen).toBe('different');
  expect(reported.reasonCode).toBe('different-specimens-reported');
});

test('Ca/Cit: wyszukiwarka prowadzi do brakującego pola, zaznacza dane i zachowuje fokus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await openCalculator(page, 390); await restore(page, { CACIT_calcium: '', CACIT_citrate: '' });
  const count = await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount);
  await page.locator('#formulaSearch').fill('Ca/Cit'); await page.locator('.clcr-search-result[data-formula-id="Ca_Cit"]').click();
  await expect.poll(() => page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.navigationCount)).toBe(count + 1);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.state.selectionGuidance.lastTarget)).toBe('CACIT_calcium');
  await expect(page.locator('#CACIT_calcium')).toHaveClass(/clcr-missing-input/); await expect(page.locator('#CACIT_citrate')).toHaveClass(/clcr-missing-input/);
  await expect(page.locator('#clcrForm .clcr-missing-input:visible')).toHaveCount(2);
  await expect.poll(() => page.locator('#CACIT_calcium').evaluate(node => { const r = node.getBoundingClientRect(); return r.top >= 40 && r.bottom <= innerHeight - 40; })).toBe(true);
  await page.locator('#CACIT_calcium').focus(); await expect(page.locator('#CACIT_calcium')).toBeFocused();
  expect(await page.locator('#CACIT_calcium').evaluate(node => { const s = getComputedStyle(node); return s.boxShadow !== 'none' || s.outlineStyle !== 'none'; })).toBe(true);
});

test('Ca/Cit: sesja oraz zmiana formuły zachowują pola, nowa sesja pacjenta ich nie dziedziczy', async ({ page }) => {
  await openCalculator(page); await page.waitForFunction(() => !window.VildaPersistence?.isAutosaveSuppressed?.());
  await restore(page, { CACIT_inputMode: 'reported', CACIT_reportedValue: '' }); await page.locator('#CACIT_reportedValue').fill('0.7'); await expectResult(page, { raw: .7, outOfRange: true });
  await choose(page, 'Cit_mgkg'); await choose(page, 'Ca_Cit'); await expectResult(page, { raw: .7, outOfRange: true });
  await expect.poll(() => page.evaluate(() => (window.VildaPersistence?.readClcrSession?.() || JSON.parse(sessionStorage.getItem('vildaClcrSessionV1') || 'null'))?.inputs?.CACIT_reportedValue)).toBe('0.7');
  await page.reload({ waitUntil: 'domcontentloaded' }); await enterGuest(page, { calculator: true }); await expectResult(page, { raw: .7, outOfRange: true });
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'Ca_Cit', inputs: { age: '12', sex: 'M' } }); await expectBlocked(page);
  await expect(page.locator('#CACIT_calcium')).toHaveValue(''); await expect(page.locator('#CACIT_reportedValue')).toHaveValue('');
});

test('Ca/Cit: zapis i wykres zamrażają dokładny wynik, normę i osobne serie masowe/molowe', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page);
  await restore(page, { CACIT_inputMode: 'reported', CACIT_reportedValue: '0.000000000001' });
  const small = await expectResult(page, { raw: 1e-12, guest: false }); const [first] = await saveVisible(page, '2026-11-03');
  expect(first.labResult.valueNum).toBe(1e-12); expect(first.labResult.value).toBe(small.display.text.replace(/\./g, ',').replace(/^≈\s*/, '≈ '));
  await restore(page, { CACIT_citrate: '2', CACIT_citrateUnit: 'mmol/L' }); await expectResult(page, { raw: 1, unit: 'mmol/mmol', reference: false, outOfRange: null, guest: false });
  const [second] = await saveVisible(page, '2026-11-04');
  const frozen = await page.evaluate(notes => { const engine = window.VildaClcrCaCit; window.VildaClcrCaCit = new Proxy({}, { get() { return () => { throw Error('History must use frozen Ca/Cit'); }; } });
    try { return window.ClcrSavedResults.projectPatientNotes(notes).measurements; } finally { window.VildaClcrCaCit = engine; } }, [first, second]);
  expect(frozen[0]).toMatchObject({ valueNum: 1e-12, displayValue: small.display.text.replace(/\./g, ',').replace(/^≈\s*/, '≈ '), parameterKey: 'clcr:Ca_Cit', unit: 'mg/mg', outOfRange: false });
  expect(frozen[1]).toMatchObject({ valueNum: 1, parameterKey: 'clcr:Ca_Cit_mol', unit: 'mmol/mmol', outOfRange: null });
  await page.evaluate(notes => { window.__caCitFictionalNotes = notes; }, [first, second]); const history = await readVisibleSavedHistory(page, '__caCitFictionalNotes');
  expect(history.visible).toBe(true); expect(history.ids).toEqual(history.originalIds);
  await page.locator('#clcrOpenBadaniaBtn').click(); await showClcrResults(page, 'charts'); await expect(clcrPoints(page)).toHaveCount(2);
  await expect(clcrPoint(page, first.id)).toHaveAttribute('data-value', '1e-12'); await expect(clcrPoint(page, second.id)).toHaveAttribute('data-value', '1');
  expect((await memory(page)).originalsLocked).toBe(true);
});

test('Ca/Cit: edytor zmienia tryb i jednostkę przy zachowaniu kontekstu z dnia zapisu', async ({ page }) => {
  await openCalculator(page); await installMemoryVault(page); await restore(page); const [first] = await saveVisible(page, '2026-11-03');
  await restore(page, { age: '40', sex: 'M', weight: '90', height: '180' }); const [sibling] = await saveVisible(page, '2026-11-04');
  await page.locator('#clcrOpenBadaniaBtn').click(); await showClcrResults(page, 'table');
  await page.evaluate(note => window.ClcrResultDetails.open({ patientId: note.patientId, noteId: note.id }), first); await page.locator('#editMeasurement').click();
  await page.locator('#editField-CACIT_calcium').fill('-1'); await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeVisible();
  expect((await memory(page)).notes.find(note => note.id === first.id)).toEqual(first);
  await page.locator('#editField-CACIT_inputMode').selectOption('reported'); await expect(page.locator('#editField-CACIT_calcium')).toHaveCount(0);
  await page.locator('#editField-CACIT_reportedValue').fill('0.6'); await page.locator('#editField-CACIT_reportedUnit').selectOption('mg/mg');
  await page.locator('#editDate').fill('2026-11-05'); await page.locator('#saveEditedMeasurement').click(); await expect(page.locator('#editDialog')).toBeHidden();
  let stored = await memory(page); const edited = stored.notes.find(note => note.id === first.id);
  expect(edited.labResult).toMatchObject({ valueNum: .6, unit: 'mg/mg' }); expect(edited.clinicalDateISO).toBe('2026-11-05');
  const snapshot = await page.evaluate(note => window.ClcrCaCitPersistence.savedAssessment(note), edited);
  expect(Number(snapshot.context.ageYears)).toBe(10); expect(snapshot.context.sex).toBe('F'); expect(snapshot.reference.upper).toBe(.47);
  expect(snapshot.category).toBe('above'); expect(stored.notes.find(note => note.id === sibling.id)).toEqual(sibling);
  await page.locator('#deleteMeasurement').click(); await page.locator('#confirmDeleteMeasurement').click(); await expect(page.locator('#detailsDialog')).toBeHidden();
  stored = await memory(page); expect(stored.notes).toEqual([sibling]); expect(stored.originalsLocked).toBe(true);
});

test('Ca/Cit: AI i Word zachowują tę samą pojedynczą wartość, jednostkę i normę', async ({ page }) => {
  await openCalculator(page); await restore(page); const result = await expectResult(page);
  await page.evaluate(() => { window.__caCitClipboard = ''; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__caCitClipboard = text; } } }); window.alert = () => {}; });
  const expected = [result.display.text.replace(/\./g, ',').replace(/^≈\s*/, '≈ '), result.unit, result.reference.display.limit, result.comment];
  await page.locator('#askAI').click(); await expect.poll(() => page.evaluate(() => window.__caCitClipboard)).toContain(result.display.text.replace(/\./g, ',').replace(/^≈\s*/, '≈ '));
  const copied = await page.evaluate(() => window.__caCitClipboard); for (const value of expected) expect(copied.replace(/\s/g, '')).toContain(value.replace(/\s/g, ''));
  const pending = page.waitForEvent('download'); await page.locator('#downloadDOCX').click(); const download = await pending;
  const html = await fs.readFile(await download.path(), 'utf8'); const text = await page.evaluate(value => new DOMParser().parseFromString(value, 'text/html').body.textContent, html);
  for (const value of expected) expect(text.replace(/\s/g, '')).toContain(value.replace(/\s/g, ''));
});
