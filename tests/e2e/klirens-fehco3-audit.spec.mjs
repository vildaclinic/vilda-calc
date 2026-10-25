import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';
import { applySession, base, captureSave, card, choose, details, expectBlocked, expectResult, openCalculator, restore } from '../support/klirens-fehco3.mjs';

async function openDetails(page) {
  if (await details(page).getAttribute('open') === null) await kliknij(details(page).locator(':scope > summary'));
}

async function openSampleDetails(page) {
  if (await page.locator('#fehco3SampleInfo').getAttribute('open') === null) await kliknij(page.locator('#fehco3SampleInfo > summary'));
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
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('#fehco3InputCard'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'), saveDate: box('#clcrVisitDate'), saveButton: box('#clcrVisitSaveBtn'),
      fields: [...document.querySelectorAll('#fehco3InputCard input,#fehco3InputCard select')].filter(node => node.checkVisibility()).map(node => {
        const r = node.getBoundingClientRect();
        return { id: node.id, height: r.height, font: parseFloat(getComputedStyle(node).fontSize), x: r.x, right: r.right };
      }),
      rows: [...document.querySelectorAll('#fehco3InputCard .fehco3-value-row')].map(node => {
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
  test(`FEHCO3: cztery stężenia i jedna karta zachowują wyrównanie przy ${width}px`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page, { U_HCO3_spot: '', S_HCO3_spot: '', Ucr_spot: '', Scr_spot: '' });
    await expect(page.locator('#fehco3RequiredCount')).toHaveText('0/4');
    await expect(page.locator('#clcrResultReport')).toContainText('Tutaj pojawi się wynik FEHCO₃');
    for (const [id, label] of [['U_HCO3_spot', 'Wodorowęglany w moczu'], ['S_HCO3_spot', 'Wodorowęglany we krwi'], ['Ucr_spot', 'Kreatynina w moczu'], ['Scr_spot', 'Kreatynina w surowicy']]) {
      await expect(page.locator('#' + id)).toHaveAccessibleName(new RegExp(label));
    }
    expect(await page.locator('#fehco3InputCard input:visible').count()).toBe(4);
    await expect(page.locator('#fehco3InputCard')).toContainText(/Zakładamy.*próbkę moczu.*krwi/);
    const initial = await geometry(page, width);
    for (const id of ['U_HCO3_spot', 'Ucr_spot', 'S_HCO3_spot', 'Scr_spot']) await page.locator('#' + id).fill(base[id]);
    const result = await expectResult(page, { raw: 0.5 });
    await page.locator('#Ucr_spot').focus();
    await expect(page.locator('#Ucr_spot')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#Ucr_spot_unit')).toBeFocused();
    expect(result.sample).toMatchObject({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
    await expect(page.locator('#fehco3RequiredCount')).toHaveText('4/4');
    await expect(card(page)).toContainText('Norma dla wieku');
    await expect(card(page)).toContainText('Brak normy do porównania');
    await expect(card(page)).toContainText(/Sam wynik nie potwierdza ani nie wyklucza/);
    await expect(page.locator('#clcrResultReport')).not.toContainText(/Pełna interpretacja jest ograniczona|Do pełnej interpretacji|Uzupełnij.*wiek/);
    sameWidths(initial, await geometry(page, width));
    for (const [unit, urine, serum] of [['umol', '8840', '88.4'], ['mmol/L', '8.84', '0.0884'], ['mg/dl', '100', '1']]) {
      await page.locator('#Ucr_spot_unit').selectOption(unit);
      await page.locator('#Scr_spot_unit').selectOption(unit);
      await page.locator('#Ucr_spot').fill(urine);
      await page.locator('#Scr_spot').fill(serum);
      await expectResult(page, { raw: 0.5 });
      sameWidths(initial, await geometry(page, width));
    }
    for (const [bicarbonate, raw] of [['0.024', 0.001], ['360.0024', 15.0001], ['2400000', 100000]]) {
      await page.locator('#U_HCO3_spot').fill(bicarbonate);
      await expectResult(page, { raw });
      sameWidths(initial, await geometry(page, width));
    }
    await openDetails(page);
    await expect(details(page)).toContainText(/Yaxley/);
    await expect(details(page).locator('a[href*="ochsnerjournal.org/content/16/4/525"]')).toHaveCount(1);
    await page.locator('#U_HCO3_spot').fill('360.0024');
    await expectResult(page, { raw: 15.0001 });
    await expect(details(page)).toHaveAttribute('open', '');
    sameWidths(initial, await geometry(page, width));
    await page.locator('#S_HCO3_spot').fill('0');
    await expectBlocked(page);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#S_HCO3_spot').fill('24');
    await expectResult(page, { raw: 15.0001 });
    await testInfo.attach(`fehco3-${width}-production`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expectBlocked(page);
    await expect(page.locator('#fehco3RequiredCount')).toHaveText('0/4');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('FEHCO3: wiek i wielkość liczby nie nadają niezweryfikowanej normy ani rozpoznania', async ({ page }) => {
  await openCalculator(page);
  for (const age of ['0', '8', '45', '85', '']) {
    for (const bicarbonate of ['0', '12', '120', '360', '384']) {
      await restore(page, { age, U_HCO3_spot: bicarbonate });
      const result = await expectResult(page);
      expect(result.outOfRange).toBeNull();
      expect(result.referenceActive).toBe(false);
      await expect(card(page)).toContainText('Brak normy do porównania');
      await expect(card(page)).not.toContainText(/W normie|W zakresie dla wieku|Odwodnienie|Rozpoznano|Poniżej normy|Powyżej normy/);
    }
  }
  await openDetails(page);
  await expect(details(page)).toContainText(/5–15|5.?15/);
  await expect(details(page)).toContainText(/obciąż|obciaz/i);
  await expect(details(page)).toContainText(/niemowl/i);
  await expect(details(page)).toContainText(/aktualne|standardowe|tCO₂/);
  await expect(details(page)).toContainText(/nie.*norm|nie.*samodziel|kryterium pomocnicze/i);
});

test('FEHCO3: podanie wodorowęglanu i niskie HCO₃ krwi nie nadają diagnozy ani potwierdzonego protokołu', async ({ page }) => {
  await openCalculator(page);
  for (const [load, answer, expected] of [[false, '', null], [true, 'unknown', null], [true, 'no', false], [true, 'yes', true]]) {
    await restore(page, { U_HCO3_spot: '384', spotBicarbonateLoad: load, ui_spotBicarbonateLoad_answer: answer });
    const result = await expectResult(page, { raw: 16, tone: expected === true ? 'warning' : 'neutral' });
    expect(result.knownFacts.bicarbonateLoad).toBe(expected);
    expect(result.protocol).toEqual({ bicarbonateLoad: expected, completion: 'not-assessed', comparisonActive: false });
    expect(result.category).toBeNull();
    await expect(card(page)).not.toContainText(/Rozpoznano|Wykluczono|Prawidłowy|Powyżej normy/);
    const saved = await captureSave(page);
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
    expect(saved.points[0].fehco3Snapshot.protocol).toEqual(result.protocol);
  }
  // Clearing concentrations within the same sample does not undo the known
  // administration of bicarbonate or turn it into a completed test protocol.
  await kliknij(page.locator('#clearBtn'));
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await expectBlocked(page);
  await expect(page.locator('#spotBicarbonateLoad')).toBeChecked();
  for (const id of ['U_HCO3_spot', 'Ucr_spot', 'S_HCO3_spot', 'Scr_spot']) await page.locator('#' + id).fill(base[id]);
  const afterClear = await expectResult(page, { raw: 0.5, tone: 'warning' });
  expect(afterClear.protocol).toEqual({ bicarbonateLoad: true, completion: 'not-assessed', comparisonActive: false });
  await restore(page, { U_HCO3_spot: '0.018', S_HCO3_spot: '18' });
  await expectResult(page, { raw: 0.001 });
  await expect(card(page)).toContainText(/nie potwierdza ani nie wyklucza/);
  await openDetails(page);
  await expect(details(page)).toContainText(/mały.*nie wyklucza|małe.*nie wyklucza|niski.*nie wyklucza/i);
  const rows = details(page).locator('table tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(details(page).locator('[aria-current="true"]')).toHaveCount(0);
});

test('FEHCO3: małe dodatnie liczby i jednostki zachowują wynik, gotowość oraz zapis', async ({ page }) => {
  await openCalculator(page);
  for (const [bicarbonate, raw, display] of [['0.96', 0.04, '0,04'], ['0.024', 0.001, '0,001'], ['360.0024', 15.0001, '15,0001'], ['0', 0, '0']]) {
    await restore(page, { U_HCO3_spot: bicarbonate });
    expect((await expectResult(page, { raw })).display.text).toBe(display);
    const saved = await captureSave(page);
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
    expect(saved.points[0].valueNum).toBe(raw);
    expect(saved.notes[0].labResult).toMatchObject({ valueNum: raw, value: display, unit: '%' });
  }
  await restore(page, { U_HCO3_spot: '30', Ucr_spot: '50001', Ucr_spot_unit: 'umol' });
  const first = await expectResult(page);
  await page.locator('#Ucr_spot_unit').selectOption('mg/dl');
  await page.locator('#Ucr_spot').fill('565.6221719457013');
  await expectResult(page, { raw: first.rawValue });
  for (const id of ['S_HCO3_spot', 'Ucr_spot', 'Scr_spot']) {
    const previous = await page.locator('#' + id).inputValue();
    await page.locator('#' + id).fill('0');
    await expectBlocked(page);
    await page.locator('#' + id).fill(previous);
    await expectResult(page);
  }
});

test('FEHCO3: stress skończonej arytmetyki nie tworzy fałszywego zera ani gotowości', async ({ page }) => {
  await openCalculator(page);
  // Deliberately nonphysiological arithmetic stress, not a clinical reference.
  await restore(page, { U_HCO3_spot: '1e-200', S_HCO3_spot: '1e-100', Ucr_spot: '1e-200', Scr_spot: '1e-200' });
  const tiny = await expectResult(page, { raw: 1e-98 });
  expect(tiny.rawValue).toBeGreaterThan(0);
  expect(tiny.display.text).not.toMatch(/^0(?:,0+)?$/);
  expect((await captureSave(page)).notes[0].labResult.valueNum).toBe(1e-98);
  await restore(page, { U_HCO3_spot: '1', S_HCO3_spot: '1e-200', Ucr_spot: '1e-200', Scr_spot: '1' });
  await expectBlocked(page);
  await expect(page.locator('#clcrResultReport')).toContainText(/skończon|zakres|jednostki/i);
  await expect(page.locator('#Ucr_spot')).toHaveValue('1e-200');
});

test('FEHCO3: znane czynniki i oryginalne dane pozostają w zapisanej ocenie po zmianie pacjenta', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_HCO3_spot: '0.024', spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes' });
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
  await restore(page, { age: '85', U_HCO3_spot: '384' });
  const history = await page.evaluate(notes => {
    const engine = window.VildaClcrFehco3;
    window.VildaClcrFehco3 = { evaluate: () => { throw new Error('Historia nie wywołuje bieżącej polityki'); } };
    try { return window.ClcrVisitSave.buildSeriesFromNotes(notes, { formulaId: 'FEHCO3_spot' }).flatMap(series => series.points); }
    finally { window.VildaClcrFehco3 = engine; }
  }, saved.notes);
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({ valueNum: 0.001, outOfRange: null, norm: '', fehco3Assessment: result });
});

test('FEHCO3: widoczna historia, przecinek, nierówność i edycja nie tracą precyzji', async ({ page }) => {
  await openCalculator(page);
  for (const [bicarbonate, day] of [['0.0024', '25'], ['0.024', '26']]) {
    await restore(page, { U_HCO3_spot: bicarbonate });
    await expectResult(page);
    expect((await captureSave(page, `2026-10-${day}`)).outcome).toMatchObject({ ok: true, saved: 1 });
  }
  const history = await page.evaluate(async () => {
    const originalVault = window.VildaVault, api = window.ClcrVisitSave, patientId = api.resolveCurrentPatientId();
    window.VildaVault = { isUnlocked: () => true, listPatientNotesForPatient: async () => window.__fehco3SyntheticNotes };
    api._setPatientId('fictional-fehco3-history-only');
    try {
      await api.refreshActiveHistory();
      const original = window.__fehco3SyntheticNotes[0];
      const old = { ...original, body: 'Kalkulator klirensu · clcr:FEHCO3_spot' };
      const comma = { ...old, clinicalDateISO: '2026-10-01', labResult: { ...old.labResult, value: '0,8', valueNum: undefined, norm: 'dawna norma' } };
      const bound = { ...old, clinicalDateISO: '2026-10-02', labResult: { ...old.labResult, value: '<0,1', valueNum: 0.1 } };
      const edited = { ...original, clinicalDateISO: '2026-10-03', labResult: { ...original.labResult, value: '0,5', valueNum: 0.5 } };
      return { hidden: document.getElementById('clcrHistoryCard').hidden,
        shown: [...document.querySelectorAll('#clcrHistoryBody .cvs-num')].map(node => node.textContent.trim()),
        trend: document.querySelector('#clcrHistoryBody .cvs-trend')?.textContent || '',
        legacy: api.buildSeriesFromNotes([comma, bound, edited], { formulaId: 'FEHCO3_spot' }).flatMap(series => series.points) };
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
    expect(point.fehco3Assessment).toBeUndefined();
    expect(point.outOfRange).toBeNull();
    expect(point.norm).toBe('');
  }
});

test('FEHCO3: cienka sesja i preserved-only nie pożyczają starych wodorowęglanów i faktów', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_HCO3_spot: '36', spotBicarbonateLoad: true, ui_spotBicarbonateLoad_answer: 'yes', spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes' });
  const selected = { currentVersion: 'spot', formulaPicker: 'FEHCO3_spot', age: '8' };
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FEHCO3_spot', inputs: { ...selected, Ucr_spot: '200', Scr_spot: '2' } });
  for (const id of ['U_HCO3_spot', 'S_HCO3_spot']) await expect(page.locator('#' + id)).toHaveValue('');
  await expectBlocked(page);
  expect(await page.evaluate(() => [document.getElementById('spotDiureticUse').checked, document.getElementById('spotKnownCKD').checked, document.getElementById('spotBicarbonateLoad').checked])).toEqual([false, false, false]);
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FEHCO3_spot', preservedInputs: { ...base } });
  await expectResult(page, { raw: 0.5 });
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FEHCO3_spot', inputs: { ...selected, S_HCO3_spot: '' }, preservedInputs: { ...base } });
  await expect(page.locator('#S_HCO3_spot')).toHaveValue('');
  await expectBlocked(page);
  await restore(page, { spotBicarbonateLoad: true, ui_spotBicarbonateLoad_answer: 'yes' });
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FECl_spot', inputs: {
    currentVersion: 'spot', formulaPicker: 'FECl_spot', U_Cl_spot: '20', S_Cl_spot: '100', Ucr_spot: '100', Scr_spot: '1',
  } }, 'FECl_spot');
  await choose(page, 'FEHCO3_spot');
  for (const id of ['U_HCO3_spot', 'S_HCO3_spot']) await expect(page.locator('#' + id)).toHaveValue('');
  await expect(page.locator('#spotBicarbonateLoad')).not.toBeChecked();
  await expectBlocked(page);
  await restore(page);
  await page.locator('#Scr_spot').fill('');
  await choose(page, 'FEK_spot');
  await choose(page, 'FEHCO3_spot');
  await expect(page.locator('#Scr_spot')).toHaveValue('');
  await expect(page.locator('#U_HCO3_spot')).toHaveValue('12');
  await expectBlocked(page);
});

for (const issue of ['different-time', 'different-urine']) {
  test(`FEHCO3: jawne ${issue} blokuje frakcje, a korekta nie potwierdza protokołów TmP/GFR i obciążenia HCO₃`, async ({ page }) => {
    await openCalculator(page);
    await restore(page, { U_K_spot: '25', S_K_spot: '4', U_Na_spot: '20', S_Na_spot: '140', U_Cl_spot: '20', S_Cl_spot: '100',
      U_PO4_spot: '10', U_PO4_spot_unit: 'mmol/L', S_PO4_spot: '1', S_PO4_spot_unit: 'mmol/L',
      tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: 'no',
      spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'yes', FENa_sample_status: issue });
    await expectBlocked(page);
    await openSampleDetails(page);
    await page.locator('#ui_fehco3_sample_issue').selectOption('');
    const corrected = await expectResult(page, { raw: 0.5 });
    // Correction removes the reported issue; it does not certify collection.
    expect(corrected.sample).toMatchObject({ sameUrineSpecimen: issue === 'different-time' ? 'confirmed' : 'assumed', pairedSameTime: 'assumed' });
    for (const [id, value] of Object.entries({ U_HCO3_spot: '12', S_HCO3_spot: '24', Ucr_spot: '100', Scr_spot: '1' })) await expect(page.locator('#' + id)).toHaveValue(value);
    await choose(page, 'TMP_GFR');
    expect(await page.evaluate(() => window.canComputeFormula('TMP_GFR'))).toBe(false);
    await expect(page.locator('#tmpPairedSameTime')).not.toBeChecked();
    await choose(page, 'FEHCO3_spot');
    // FEHCO₃ shares the disclosed specimen assumption, but correcting FEHCO3
    // cannot establish that bicarbonate loading occurred or was completed.
    expect(await page.evaluate(() => window.canComputeFormula('FEHCO3_spot'))).toBe(true);
    const fehco3 = page.locator('#clcrResultReport [data-clcr-series="FEHCO3_spot"]');
    await expect(fehco3).toBeVisible();
    expect(JSON.parse(await fehco3.getAttribute('data-clcr-fehco3-snapshot'))).toMatchObject({
      protocol: { bicarbonateLoad: null, completion: 'not-assessed', comparisonActive: false },
      outOfRange: null,
    });
    await expect(page.locator('#spotBicarbonateLoad')).not.toBeChecked();
    await expectResult(page, { raw: 0.5 });
    await openSampleDetails(page);
    await page.locator('#ui_fehco3_sample_issue').selectOption(issue);
    await expectBlocked(page);
    for (const id of ['FENa_spot', 'FEK_spot', 'FECl_spot', 'TMP_GFR']) {
      await choose(page, id);
      expect(await page.evaluate(formulaId => window.canComputeFormula(formulaId), id)).toBe(false);
    }
    await choose(page, 'AGu_spot');
    const uag = page.locator('#clcrResultReport [data-clcr-series="AGu_spot"]');
    if (issue === 'different-time') await expect(uag).toBeVisible();
    else await expect(uag).toHaveCount(0);
    await choose(page, 'FEHCO3_spot');
    await expectBlocked(page);
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    for (const id of ['U_HCO3_spot', 'S_HCO3_spot', 'Ucr_spot', 'Scr_spot']) await expect(page.locator('#' + id)).toHaveValue('');
    // Clearing concentrations is not a correction of an explicitly reported
    // collection problem. Refilling all four values must remain blocked.
    await expect(page.locator('#FENa_sample_status')).toHaveValue(issue);
    for (const id of ['U_HCO3_spot', 'Ucr_spot', 'S_HCO3_spot', 'Scr_spot']) await page.locator('#' + id).fill(base[id]);
    await expectBlocked(page);
    await openSampleDetails(page);
    await expect(page.locator('#ui_fehco3_sample_issue')).toHaveValue(issue);
  });
}

test('FEHCO3: jawne no ma pierwszeństwo nad dawnym yes i nieznany fakt pozostaje nieznany', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [{ spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'no' }, { spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'no' }]) {
    await restore(page, fields);
    await expectBlocked(page);
  }
  await restore(page, { spotDiureticUse: true, ui_spotDiureticUse_answer: 'no', spotKnownCKD: true, ui_spotKnownCKD_answer: 'unknown' });
  const result = await expectResult(page, { raw: 0.5 });
  expect(result.knownFacts).toMatchObject({ diureticUse: false, knownCKD: null });
});

test('FEHCO3: rzeczywisty schowek AI i raport Word zachowują wartość i znany kontekst', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_HCO3_spot: '0.024', spotDiureticUse: true, ui_spotDiureticUse_answer: 'yes', spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes' });
  const result = await expectResult(page, { raw: 0.001, tone: 'warning' });
  await page.evaluate(() => {
    window.__fehco3Clipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__fehco3Clipboard = value; } } });
    window.alert = () => {};
  });
  await kliknij(page.locator('#askAI'));
  await expect.poll(() => page.evaluate(() => window.__fehco3Clipboard)).toContain('0,001');
  const clipboard = await page.evaluate(() => window.__fehco3Clipboard);
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

test('FEHCO3: odtworzenie aliasów jednostek kreatyniny zachowuje wartość i nie zgaduje nieobsługiwanej jednostki', async ({ page }) => {
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
    await expectResult(page, { raw: 0.5 });
  }
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FEHCO3_spot',
    preservedInputs: { ...base, Ucr_spot_unit: 'µmol/L', Scr_spot_unit: 'μmol/L', Ucr_spot: '8840', Scr_spot: '88.4' } });
  await expectResult(page, { raw: 0.5 });
  for (const unit of ['ng/mL', 'mg/L']) {
    await restore(page, { Scr_spot_unit: unit });
    await expectBlocked(page);
    await expect(page.locator('#Scr_spot')).toHaveValue('1');
    await expect(page.locator('#U_HCO3_spot')).toHaveValue('12');
  }
});
