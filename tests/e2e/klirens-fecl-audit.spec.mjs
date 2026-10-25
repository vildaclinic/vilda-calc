import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';
import { applySession, base, captureSave, card, choose, details, expectBlocked, expectResult, openCalculator, restore } from '../support/klirens-fecl.mjs';

async function openDetails(page) {
  if (await details(page).getAttribute('open') === null) await kliknij(details(page).locator(':scope > summary'));
}

async function openSampleDetails(page) {
  if (await page.locator('#feclSampleInfo').getAttribute('open') === null) await kliknij(page.locator('#feclSampleInfo > summary'));
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
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('#feclInputCard'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'), saveDate: box('#clcrVisitDate'), saveButton: box('#clcrVisitSaveBtn'),
      fields: [...document.querySelectorAll('#feclInputCard input,#feclInputCard select')].filter(node => node.checkVisibility()).map(node => {
        const r = node.getBoundingClientRect();
        return { id: node.id, height: r.height, font: parseFloat(getComputedStyle(node).fontSize), x: r.x, right: r.right };
      }),
      rows: [...document.querySelectorAll('#feclInputCard .fecl-value-row')].map(node => {
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
  expect(result.rows).toHaveLength(4);
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
  else expect(Math.abs(result.report.top - result.activePanel.top)).toBeLessThanOrEqual(1);
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
  test(`FECl: cztery stężenia i jedna karta zachowują wyrównanie przy ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page, { U_Cl_spot: '', S_Cl_spot: '', Ucr_spot: '', Scr_spot: '' });
    await expect(page.locator('#feclRequiredCount')).toHaveText('0/4');
    await expect(page.locator('#clcrResultReport')).toContainText('Tutaj pojawi się wynik FECl');
    for (const [id, label] of [['U_Cl_spot', 'Chlorki w moczu'], ['S_Cl_spot', 'Chlorki w surowicy'], ['Ucr_spot', 'Kreatynina w moczu'], ['Scr_spot', 'Kreatynina w surowicy']]) {
      await expect(page.locator('#' + id)).toHaveAccessibleName(new RegExp(label));
    }
    expect(await page.locator('#feclInputCard input:visible').count()).toBe(4);
    await expect(page.locator('#feclInputCard')).toContainText(/Zakładamy.*próbkę moczu.*krwi/);
    const initial = await geometry(page, width);
    for (const id of ['U_Cl_spot', 'Ucr_spot', 'S_Cl_spot', 'Scr_spot']) await page.locator('#' + id).fill(base[id]);
    const result = await expectResult(page, { raw: 0.2 });
    await page.locator('#Ucr_spot').focus();
    await expect(page.locator('#Ucr_spot')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#Ucr_spot_unit')).toBeFocused();
    expect(result.sample).toMatchObject({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
    await expect(page.locator('#feclRequiredCount')).toHaveText('4/4');
    await expect(card(page)).toContainText('Norma dla wieku');
    await expect(card(page)).toContainText('Brak normy do porównania');
    await expect(card(page)).toContainText(/Sam wynik nie rozstrzyga o nerkowej utracie chlorków/);
    await expect(page.locator('#clcrResultReport')).not.toContainText(/Pełna interpretacja jest ograniczona|Do pełnej interpretacji|Uzupełnij.*wiek/);
    sameWidths(initial, await geometry(page, width));
    for (const [unit, urine, serum] of [['umol', '8840', '88.4'], ['mmol/L', '8.84', '0.0884'], ['mg/dl', '100', '1']]) {
      await page.locator('#Ucr_spot_unit').selectOption(unit);
      await page.locator('#Scr_spot_unit').selectOption(unit);
      await page.locator('#Ucr_spot').fill(urine);
      await page.locator('#Scr_spot').fill(serum);
      await expectResult(page, { raw: 0.2 });
      sameWidths(initial, await geometry(page, width));
    }
    for (const [chloride, raw] of [['0.1', 0.001], ['50.01', 0.5001], ['1234567.89', 12345.6789]]) {
      await page.locator('#U_Cl_spot').fill(chloride);
      await expectResult(page, { raw });
      sameWidths(initial, await geometry(page, width));
    }
    await openDetails(page);
    await expect(details(page)).toContainText(/KDIGO/);
    await expect(details(page).locator('a[href*="KDIGO-Gitelman-conf-report.pdf"]')).toHaveCount(1);
    await page.locator('#U_Cl_spot').fill('50.01');
    await expectResult(page, { raw: 0.5001 });
    await expect(details(page)).toHaveAttribute('open', '');
    sameWidths(initial, await geometry(page, width));
    await page.locator('#S_Cl_spot').fill('0');
    await expectBlocked(page);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#S_Cl_spot').fill('100');
    await expectResult(page, { raw: 0.5001 });
    await testInfo.attach(`fecl-${width}-production`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expectBlocked(page);
    await expect(page.locator('#feclRequiredCount')).toHaveText('0/4');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('FECl: wiek i wielkość liczby nie nadają niezweryfikowanej normy ani rozpoznania', async ({ page }) => {
  await openCalculator(page);
  for (const age of ['0', '8', '45', '85', '']) {
    for (const chloride of ['0', '20', '50.01', '100', '300']) {
      await restore(page, { age, U_Cl_spot: chloride });
      const result = await expectResult(page);
      expect(result.outOfRange).toBeNull();
      expect(result.referenceActive).toBe(false);
      await expect(card(page)).toContainText('Brak normy do porównania');
      await expect(card(page)).not.toContainText(/W normie|W zakresie dla wieku|Odwodnienie|Rozpoznano|Poniżej normy|Powyżej normy/);
    }
  }
  await openDetails(page);
  await expect(details(page)).toContainText(/0,5/);
  await expect(details(page)).toContainText(/zasadowic|alkaloz/i);
  await expect(details(page)).toContainText(/nie.*norm|nie.*samodziel|kryterium pomocnicze/i);
});

test('FECl: małe dodatnie liczby i jednostki zachowują wynik, gotowość oraz zapis', async ({ page }) => {
  await openCalculator(page);
  for (const [chloride, raw, display] of [['0.1', 0.001, '0,001'], ['50.01', 0.5001, '0,5001'], ['0', 0, '0']]) {
    await restore(page, { U_Cl_spot: chloride });
    expect((await expectResult(page, { raw })).display.text).toBe(display);
    const saved = await captureSave(page);
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
    expect(saved.points[0].valueNum).toBe(raw);
    expect(saved.notes[0].labResult).toMatchObject({ valueNum: raw, value: display, unit: '%' });
  }
  await restore(page, { U_Cl_spot: '30', Ucr_spot: '50001', Ucr_spot_unit: 'umol' });
  const first = await expectResult(page);
  await page.locator('#Ucr_spot_unit').selectOption('mg/dl');
  await page.locator('#Ucr_spot').fill('565.6221719457013');
  await expectResult(page, { raw: first.rawValue });
  for (const id of ['S_Cl_spot', 'Ucr_spot', 'Scr_spot']) {
    const previous = await page.locator('#' + id).inputValue();
    await page.locator('#' + id).fill('0');
    await expectBlocked(page);
    await page.locator('#' + id).fill(previous);
    await expectResult(page);
  }
});

test('FECl: stress skończonej arytmetyki nie tworzy fałszywego zera ani gotowości', async ({ page }) => {
  await openCalculator(page);
  // Deliberately nonphysiological arithmetic stress, not a clinical reference.
  await restore(page, { U_Cl_spot: '1e-200', S_Cl_spot: '1e-100', Ucr_spot: '1e-200', Scr_spot: '1e-200' });
  const tiny = await expectResult(page, { raw: 1e-98 });
  expect(tiny.rawValue).toBeGreaterThan(0);
  expect(tiny.display.text).not.toMatch(/^0(?:,0+)?$/);
  expect((await captureSave(page)).notes[0].labResult.valueNum).toBe(1e-98);
  await restore(page, { U_Cl_spot: '1', S_Cl_spot: '1e-200', Ucr_spot: '1e-200', Scr_spot: '1' });
  await expectBlocked(page);
  await expect(page.locator('#clcrResultReport')).toContainText(/skończon|zakres|jednostki/i);
  await expect(page.locator('#Ucr_spot')).toHaveValue('1e-200');
});

test('FECl: znane czynniki i oryginalne dane pozostają w zapisanej ocenie po zmianie pacjenta', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_Cl_spot: '0.1', spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes' });
  const result = await expectResult(page, { raw: 0.001, tone: 'warning' });
  expect(result.knownFacts).toMatchObject({ diureticUse: true, knownCKD: true });
  await expect(card(page)).toContainText(/diuretyk/i);
  await expect(card(page)).toContainText(/PChN|chorob.*nerek/i);
  const saved = await captureSave(page);
  expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
  expect(saved.vaultLocked).toBe(true);
  expect(saved.notes).toEqual(saved.rawNotes);
  expect(saved.notes[0].body).toContain('0,001');
  expect(saved.notes[0].body).toMatch(/diuretyk/i);
  expect(saved.notes[0].body).toMatch(/chorob.*nerek|PChN/i);
  await restore(page, { age: '85', U_Cl_spot: '300' });
  const history = await page.evaluate(notes => {
    const engine = window.VildaClcrFecl;
    window.VildaClcrFecl = { evaluate: () => { throw new Error('Historia nie wywołuje bieżącej polityki'); } };
    try { return window.ClcrVisitSave.buildSeriesFromNotes(notes, { formulaId: 'FECl_spot' }).flatMap(series => series.points); }
    finally { window.VildaClcrFecl = engine; }
  }, saved.notes);
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({ valueNum: 0.001, outOfRange: null, norm: '', feclAssessment: result });
});

test('FECl: widoczna historia, przecinek, nierówność i edycja nie tracą precyzji', async ({ page }) => {
  await openCalculator(page);
  for (const [chloride, day] of [['0.01', '25'], ['0.1', '26']]) {
    await restore(page, { U_Cl_spot: chloride });
    await expectResult(page);
    expect((await captureSave(page, `2026-10-${day}`)).outcome).toMatchObject({ ok: true, saved: 1 });
  }
  const history = await page.evaluate(async () => {
    const originalVault = window.VildaVault, api = window.ClcrVisitSave, patientId = api.resolveCurrentPatientId();
    window.VildaVault = { isUnlocked: () => true, listPatientNotesForPatient: async () => window.__feclSyntheticNotes };
    api._setPatientId('fictional-fecl-history-only');
    try {
      await api.refreshActiveHistory();
      const original = window.__feclSyntheticNotes[0];
      const old = { ...original, body: 'Kalkulator klirensu · clcr:FECl_spot' };
      const comma = { ...old, clinicalDateISO: '2026-10-01', labResult: { ...old.labResult, value: '0,8', valueNum: undefined, norm: 'dawna norma' } };
      const bound = { ...old, clinicalDateISO: '2026-10-02', labResult: { ...old.labResult, value: '<0,1', valueNum: 0.1 } };
      const edited = { ...original, clinicalDateISO: '2026-10-03', labResult: { ...original.labResult, value: '0,5', valueNum: 0.5 } };
      return { hidden: document.getElementById('clcrHistoryCard').hidden,
        shown: [...document.querySelectorAll('#clcrHistoryBody .cvs-num')].map(node => node.textContent.trim()),
        trend: document.querySelector('#clcrHistoryBody .cvs-trend')?.textContent || '',
        legacy: api.buildSeriesFromNotes([comma, bound, edited], { formulaId: 'FECl_spot' }).flatMap(series => series.points) };
    } finally { window.VildaVault = originalVault; api._setPatientId(patientId); }
  });
  expect(history.hidden).toBe(false);
  expect(history.shown).toEqual(['0,0001 %', '0,001 %']);
  expect(history.trend).toContain('0,0001 → 0,001 %');
  expect(history.legacy).toHaveLength(3);
  expect(history.legacy[0].valueNum).toBe(0.8);
  expect(history.legacy[1].valueNum).toBeNull();
  expect(history.legacy[1].displayValue).toContain('<0,1');
  expect(history.legacy[2].valueNum).toBe(0.5);
  for (const point of history.legacy) {
    expect(point.feclAssessment).toBeUndefined();
    expect(point.outOfRange).toBeNull();
    expect(point.norm).toBe('');
  }
});

test('FECl: cienka sesja i preserved-only nie pożyczają starych chlorków i faktów', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_Cl_spot: '80', spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes' });
  const selected = { currentVersion: 'spot', formulaPicker: 'FECl_spot', age: '8' };
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FECl_spot', inputs: { ...selected, Ucr_spot: '200', Scr_spot: '2' } });
  for (const id of ['U_Cl_spot', 'S_Cl_spot']) await expect(page.locator('#' + id)).toHaveValue('');
  await expectBlocked(page);
  expect(await page.evaluate(() => [document.getElementById('spotDiureticUse').checked, document.getElementById('spotKnownCKD').checked])).toEqual([false, false]);
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FECl_spot', preservedInputs: { ...base } });
  await expectResult(page, { raw: 0.2 });
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FECl_spot', inputs: { ...selected, S_Cl_spot: '' }, preservedInputs: { ...base } });
  await expect(page.locator('#S_Cl_spot')).toHaveValue('');
  await expectBlocked(page);
  await restore(page);
  await page.locator('#Scr_spot').fill('');
  await choose(page, 'FEK_spot');
  await choose(page, 'FECl_spot');
  await expect(page.locator('#Scr_spot')).toHaveValue('');
  await expect(page.locator('#U_Cl_spot')).toHaveValue('20');
  await expectBlocked(page);
});

for (const issue of ['different-time', 'different-urine']) {
  test(`FECl: jawne ${issue} blokuje wynik, a korekta nie potwierdza protokołów TmP/GFR i FEHCO₃`, async ({ page }) => {
    await openCalculator(page);
    await restore(page, { U_K_spot: '25', S_K_spot: '4', U_Na_spot: '20', S_Na_spot: '140', U_HCO3_spot: '1', S_HCO3_spot: '24',
      U_PO4_spot: '10', U_PO4_spot_unit: 'mmol/L', S_PO4_spot: '1', S_PO4_spot_unit: 'mmol/L',
      tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: 'no',
      spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'yes', FENa_sample_status: issue });
    await expectBlocked(page);
    await openSampleDetails(page);
    await page.locator('#ui_fecl_sample_issue').selectOption('');
    const corrected = await expectResult(page, { raw: 0.2 });
    // Correction removes the reported issue; it does not certify collection.
    expect(corrected.sample).toMatchObject({ sameUrineSpecimen: issue === 'different-time' ? 'confirmed' : 'assumed', pairedSameTime: 'assumed' });
    for (const [id, value] of Object.entries({ U_Cl_spot: '20', S_Cl_spot: '100', Ucr_spot: '100', Scr_spot: '1' })) await expect(page.locator('#' + id)).toHaveValue(value);
    await choose(page, 'TMP_GFR');
    expect(await page.evaluate(() => window.canComputeFormula('TMP_GFR'))).toBe(false);
    await expect(page.locator('#tmpPairedSameTime')).not.toBeChecked();
    await choose(page, 'FEHCO3_spot');
    expect(await page.evaluate(() => window.canComputeFormula('FEHCO3_spot'))).toBe(false);
    await choose(page, 'FECl_spot');
    await expectResult(page, { raw: 0.2 });
    await openSampleDetails(page);
    await page.locator('#ui_fecl_sample_issue').selectOption(issue);
    await expectBlocked(page);
    for (const id of ['FENa_spot', 'FEK_spot', 'TMP_GFR', 'FEHCO3_spot']) {
      await choose(page, id);
      expect(await page.evaluate(formulaId => window.canComputeFormula(formulaId), id)).toBe(false);
    }
    await choose(page, 'AGu_spot');
    const uag = page.locator('#clcrResultReport [data-clcr-series="AGu_spot"]');
    if (issue === 'different-time') await expect(uag).toBeVisible();
    else await expect(uag).toHaveCount(0);
  });
}

test('FECl: jawne no ma pierwszeństwo nad dawnym yes i nieznany fakt pozostaje nieznany', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [{ spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'no' }, { spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'no' }]) {
    await restore(page, fields);
    await expectBlocked(page);
  }
  await restore(page, { spotDiureticUse: true, ui_spotDiureticUse_answer: 'no', spotKnownCKD: true, ui_spotKnownCKD_answer: 'unknown' });
  const result = await expectResult(page, { raw: 0.2 });
  expect(result.knownFacts).toMatchObject({ diureticUse: false, knownCKD: null });
});

test('FECl: rzeczywisty schowek AI i raport Word zachowują wartość i znany kontekst', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_Cl_spot: '0.1', spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes' });
  const result = await expectResult(page, { raw: 0.001, tone: 'warning' });
  await page.evaluate(() => {
    window.__feclClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__feclClipboard = value; } } });
    window.alert = () => {};
  });
  await kliknij(page.locator('#askAI'));
  await expect.poll(() => page.evaluate(() => window.__feclClipboard)).toContain('0,001');
  const clipboard = await page.evaluate(() => window.__feclClipboard);
  expect(clipboard).toContain(result.interpretation);
  expect(clipboard).toMatch(/diuretyk/i);
  expect(clipboard).toMatch(/PChN|chorob.*nerek/i);
  const downloadPromise = page.waitForEvent('download');
  await kliknij(page.locator('#downloadDOCX'));
  const download = await downloadPromise;
  // CDN is blocked by openCalculator. This is the real supported HTML/Word
  // fallback, not a claim of checking a binary DOCX/PDF serializer.
  expect(download.suggestedFilename()).toMatch(/\.doc$/);
  const exported = await fs.readFile(await download.path(), 'utf8');
  expect(exported).toContain('0,001');
  expect(exported).toContain(result.interpretation);
  expect(exported).toMatch(/diuretyk/i);
  expect(exported).toMatch(/PChN|chorob.*nerek/i);
});

test('FECl: odtworzenie aliasów jednostek kreatyniny zachowuje wartość i nie zgaduje nieobsługiwanej jednostki', async ({ page }) => {
  await openCalculator(page);
  for (const [unit, canonical, urine, serum] of [
    ['mg/dL', 'mg/dl', '100', '1'],
    ['umol/L', 'umol', '8840', '88.4'],
    ['µmol/L', 'umol', '8840', '88.4'],
    ['μmol/L', 'umol', '8840', '88.4'],
    ['mmol', 'mmol/L', '8.84', '0.0884'],
  ]) {
    await restore(page, { Ucr_spot_unit: unit, Scr_spot_unit: unit, Ucr_spot: urine, Scr_spot: serum });
    await expect(page.locator('#Ucr_spot_unit')).toHaveValue(canonical);
    await expect(page.locator('#Scr_spot_unit')).toHaveValue(canonical);
    await expect(page.locator('#Ucr_spot')).toHaveValue(urine);
    await expect(page.locator('#Scr_spot')).toHaveValue(serum);
    await expectResult(page, { raw: 0.2 });
  }
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FECl_spot',
    preservedInputs: { ...base, Ucr_spot_unit: 'µmol/L', Scr_spot_unit: 'μmol/L', Ucr_spot: '8840', Scr_spot: '88.4' } });
  await expectResult(page, { raw: 0.2 });
  for (const unit of ['ng/mL', 'mg/L']) {
    await restore(page, { Scr_spot_unit: unit });
    await expectBlocked(page);
    await expect(page.locator('#Scr_spot')).toHaveValue('1');
    await expect(page.locator('#U_Cl_spot')).toHaveValue('20');
  }
});
