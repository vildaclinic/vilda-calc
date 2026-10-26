import { expect, test } from '@playwright/test';
import { readVisibleSavedHistory } from '../support/klirens-saved-history.mjs';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';

// Wyłącznie fikcyjne stężenia. Prawdziwy sejf pozostaje zamknięty. Zapis
// przechodzi przez produkcyjny kolektor i sanitizery, z adapterem w pamięci.
const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="FENa_spot"]');
const details = page => page.locator('#clcr-fena-details');
const snapshot = async page => JSON.parse(await card(page).getAttribute('data-clcr-fena-snapshot'));
const base = {
  currentVersion: 'spot', formulaPicker: 'FENa_spot', age: '45', ageMonths: '', ageDays: '', sex: '',
  weight: '', height: '', Scr: '', U_Na_spot: '20', S_Na_spot: '140', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl',
  Scr_spot: '1', Scr_spot_unit: 'mg/dl', FENa_sample_status: '',
  spotSameSpecimen: false, ui_spotSameSpecimen_answer: '', spotPairedChemistry: false, ui_spotPairedChemistry_answer: '',
  spotSampleKind: '', spotDiureticUse: false, spotKnownCKD: false,
};

async function openCalculator(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//, route => route.abort());
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await guest.waitFor({ state: 'visible' }); await guest.evaluate(button => button.click());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') && typeof window.applyClcrSessionSnapshot === 'function' &&
    Boolean(window.VildaClcrFena && window.ClcrFenaUi && window.ClcrVisitSave) && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
}

async function applySession(page, session) {
  expect(await page.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-fena-fictional', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'FENa_spot' &&
    document.getElementById('formulaPicker').value === 'FENa_spot' && window.clcrIsResetting !== true);
  await expect(page.locator('#fenaInputCard')).toBeVisible();
}

async function restore(page, fields = {}) {
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FENa_spot', inputs: { ...base, ...fields } });
}

async function expectResult(page, { raw, context = 'adult', band = 'low' } = {}) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(card(page)).toHaveAttribute('data-clcr-tone', 'neutral');
  await expect(card(page).locator('.clcr-result-value')).toHaveCount(1);
  await expect(card(page)).toHaveAttribute('data-clcr-display-value', (await card(page).locator('.clcr-result-value').textContent()).trim());
  await expect(card(page).locator('.clcr-result-unit')).toHaveText('%');
  if (raw !== undefined) await expect.poll(async () => Number(await card(page).getAttribute('data-clcr-value'))).toBeCloseTo(raw, 12);
  const result = await snapshot(page);
  expect(result).toMatchObject({ valid: true, status: 'unassessed', tone: 'neutral', category: null, context, helperBand: band });
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  return result;
}

async function openDetails(page) {
  if (await details(page).getAttribute('open') === null) await kliknij(details(page).locator(':scope > summary'));
  return details(page);
}

async function openSampleDetails(page) {
  if (await page.locator('#fenaSampleInfo').getAttribute('open') === null) await kliknij(page.locator('#fenaSampleInfo > summary'));
}

async function captureSave(page, date = '2026-10-25') {
  return page.evaluate(async clinicalDateISO => {
    const api = window.ClcrVisitSave, originalVault = window.VildaVault, rawNotes = [], notes = [];
    const points = api.collectActiveDatapoints(document, { formulaId: 'FENa_spot' });
    window.VildaVault = { isUnlocked: () => true, savePatientNote: async note => {
      rawNotes.push(JSON.parse(JSON.stringify(note)));
      notes.push({ ...note, body: originalVault.sanitizeNoteText(note.body), labResult: originalVault.sanitizeLabResult(note.labResult) });
    } };
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'fictional-fena-e2e-only', clinicalDateISO, root: document, formulaId: 'FENa_spot' });
      window.__fenaSyntheticNotes = [...(window.__fenaSyntheticNotes || []), ...notes];
      return { outcome, points, rawNotes, notes, vaultLocked: !originalVault.isUnlocked() };
    } finally { window.VildaVault = originalVault; }
  }, date);
}

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const result = await page.evaluate(() => {
    const box = selector => {
      const node = document.querySelector(selector); if (!node?.checkVisibility()) return null;
      const r = node.getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('#fenaInputCard'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'), saveDate: box('#clcrVisitDate'), saveButton: box('#clcrVisitSaveBtn'),
      fields: [...document.querySelectorAll('#fenaInputCard input,#fenaInputCard select')].filter(node => node.checkVisibility()).map(node => {
        const r = node.getBoundingClientRect(); return { id: node.id, height: r.height, font: parseFloat(getComputedStyle(node).fontSize), x: r.x, right: r.right };
      }),
      rows: [...document.querySelectorAll('#fenaInputCard .fena-value-row')].map(node => {
        const r = node.getBoundingClientRect(); const unit = node.lastElementChild.getBoundingClientRect();
        return { x: r.x, width: r.width, unitWidth: unit.width, unitRight: unit.right };
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
  }
  for (const field of result.fields) {
    expect(field.height, field.id).toBeGreaterThanOrEqual(48); expect(field.font, field.id).toBeGreaterThanOrEqual(16);
    expect(field.x, field.id).toBeGreaterThanOrEqual(0); expect(field.right, field.id).toBeLessThanOrEqual(width + 1);
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
    expect(Math.abs(before[key].width - after[key].width), `${key}: stała szerokość`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), `${key}: wspólna krawędź`).toBeLessThanOrEqual(0.5);
  }
}

for (const width of [1440, 390, 320]) {
  test(`FENa ${width}px: cztery stężenia, stałe kolumny i neutralny wynik w jednym miejscu`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width); await restore(page, { U_Na_spot: '', S_Na_spot: '', Ucr_spot: '', Scr_spot: '' });
    await expect(page.locator('#fenaRequiredCount')).toHaveText('0/4'); await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#U_Na_spot')).toHaveAccessibleName(/Sód w moczu/);
    await expect(page.locator('#S_Na_spot')).toHaveAccessibleName(/Sód w surowicy/);
    await expect(page.locator('#Ucr_spot')).toHaveAccessibleName(/Kreatynina w moczu/);
    await expect(page.locator('#Scr_spot')).toHaveAccessibleName(/Kreatynina w surowicy/);
    expect(await page.locator('#fenaInputCard input:visible').count()).toBe(4);
    await expect(page.locator('#fenaInputCard')).toContainText(/Zakładamy.*próbkę moczu.*krew/);
    const initial = await geometry(page, width);
    for (const id of ['U_Na_spot', 'Ucr_spot', 'S_Na_spot', 'Scr_spot']) await page.locator('#' + id).fill(base[id]);
    const low = await expectResult(page, { raw: 1 / 7 });
    expect(low.sample).toMatchObject({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
    await expect(page.locator('#fenaRequiredCount')).toHaveText('4/4');
    await expect(card(page)).toContainText('Progi pomocnicze w AKI');
    await expect(card(page)).toContainText(/AKI z oligurią/);
    await expect(page.locator('#clcrResultReport')).not.toContainText(/Pełna interpretacja jest ograniczona|Do pełnej interpretacji|Norma dla wieku/);
    sameWidths(initial, await geometry(page, width));
    for (const [unit, urine, serum] of [['umol', '8840', '88.4'], ['mmol/L', '8.84', '0.0884'], ['mg/dl', '100', '1']]) {
      await page.locator('#Ucr_spot_unit').selectOption(unit); await page.locator('#Scr_spot_unit').selectOption(unit);
      await page.locator('#Ucr_spot').fill(urine); await page.locator('#Scr_spot').fill(serum);
      await expectResult(page, { raw: 1 / 7 }); sameWidths(initial, await geometry(page, width));
    }
    await page.locator('#U_Na_spot').fill('100'); await page.locator('#Ucr_spot').fill('20'); await page.locator('#Scr_spot').fill('2');
    await expectResult(page, { raw: 50 / 7, band: 'high' });
    await openDetails(page); await expect(details(page)).toContainText(/KDIGO.*2012/);
    await expect(details(page)).toContainText(/Schreuder/); sameWidths(initial, await geometry(page, width));
    await expect(details(page).locator('[data-fena-band="high"]')).toHaveAttribute('aria-current', 'true');
    await page.locator('#S_Na_spot').fill('0'); await expect(card(page)).toHaveCount(0);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#S_Na_spot').fill('140'); await expectResult(page, { raw: 50 / 7, band: 'high' });
    await openSampleDetails(page);
    await page.locator('#ui_fena_sample_issue').selectOption('different-time'); await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#clcrResultReport')).toContainText(/inn.*czas|równocz/);
    sameWidths(initial, await geometry(page, width));
    await kliknij(page.locator('#fenaCorrectSampleIssue')); await expectResult(page, { raw: 50 / 7, band: 'high' });
    await testInfo.attach(`fena-${width}-production`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn')); await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expect(card(page)).toHaveCount(0); await expect(page.locator('#fenaRequiredCount')).toHaveText('0/4');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('FENa: dokładne progi 1 i 2% oraz wartości tuż obok nie zależą od zaokrąglenia', async ({ page }) => {
  await openCalculator(page); await restore(page, { Scr_spot: '2' });
  for (const [sodium, value, band] of [['69.999999999999', 0.9999999999999857, 'low'], ['70', 1, 'middle'],
    ['70.000000000001', 1.0000000000000142, 'middle'], ['139.999999999999', 1.9999999999999858, 'middle'],
    ['140', 2, 'middle'], ['140.000000000001', 2.000000000000014, 'high']]) {
    await page.locator('#U_Na_spot').fill(sodium); const result = await expectResult(page, { raw: value, band });
    await openDetails(page); await expect(details(page).locator('[aria-current="true"]')).toHaveCount(1);
    await expect(details(page).locator(`[data-fena-band="${band}"]`)).toHaveAttribute('aria-current', 'true');
    const shown = Number(result.display.text.replace(',', '.'));
    if (value < 1) expect(shown).toBeLessThan(1);
    if (value > 2) expect(shown).toBeGreaterThan(2);
  }
  await page.locator('#U_Na_spot').fill('0'); await expectResult(page, { raw: 0 });
});

test('FENa: równoważna kreatynina i małe dodatnie wartości nie giną w walidacji', async ({ page }) => {
  await openCalculator(page); await restore(page, { U_Na_spot: '40', Ucr_spot: '50001', Ucr_spot_unit: 'umol' });
  const first = await expectResult(page, { raw: 0.05051327544877674 });
  await page.locator('#Ucr_spot_unit').selectOption('mg/dl'); await page.locator('#Ucr_spot').fill('565.6221719457013');
  expect((await snapshot(page)).rawValue).toBeCloseTo(first.rawValue, 12);
  await restore(page, { U_Na_spot: '1.4' }); const tiny = await expectResult(page, { raw: 0.01 });
  expect(Number(tiny.display.text.replace(',', '.'))).toBe(0.01);
  await page.locator('#U_Na_spot').fill('1e-12'); const small = await expectResult(page, { raw: 1 / 140000000000000 });
  expect(Number(small.display.text.replace(',', '.'))).toBeGreaterThan(0);
  for (const id of ['S_Na_spot', 'Ucr_spot', 'Scr_spot']) {
    const previous = await page.locator('#' + id).inputValue();
    await page.locator('#' + id).fill('0'); await expect(card(page)).toHaveCount(0);
    await page.locator('#' + id).fill(previous); await expect(card(page)).toBeVisible();
  }
});

test('FENa: dziecko i nieznany wiek mają liczbę bez normy dorosłych lub dodatkowej ankiety', async ({ page }) => {
  await openCalculator(page);
  for (const [age, context, label] of [['0', 'child', 'Brak uniwersalnej normy dla wieku'], ['17', 'child', 'Brak uniwersalnej normy dla wieku'], ['', 'unknown', 'Brak uniwersalnej normy']]) {
    await restore(page, { age }); const result = await expectResult(page, { raw: 1 / 7, context, band: null });
    expect(result.referenceAvailable).toBe(false);
    await expect(card(page)).toContainText(label); await expect(card(page)).not.toContainText('Progi pomocnicze w AKI (dorośli)');
    await expect(page.locator('#fenaRequiredCount')).toHaveText('4/4');
    await expect(page.locator('#clcrResultReport')).not.toContainText(/Uzupełnij.*wiek|Do pełnej interpretacji|Pełna interpretacja jest ograniczona/);
    await openDetails(page); await expect(details(page).locator('[aria-current="true"]')).toHaveCount(0);
  }
  await restore(page, { age: '5', spotDiureticUse: true, spotKnownCKD: true });
  const childWithFacts = await expectResult(page, { raw: 1 / 7, context: 'child', band: null });
  expect(childWithFacts.knownFacts).toMatchObject({ diureticUse: true, knownCKD: true });
  expect(childWithFacts.referenceAvailable).toBe(false);
  await expect(card(page)).not.toContainText('Progi pomocnicze w AKI (dorośli)');
  await expect(card(page)).toContainText('Brak uniwersalnej normy');
  await restore(page, { age: '18' }); await expectResult(page, { raw: 1 / 7 });
});

test('FENa: znane PChN i diuretyk pozostają przy wyniku i w zapisie, bez diagnostycznej kategorii', async ({ page }) => {
  await openCalculator(page); await restore(page, { U_Na_spot: '100', Ucr_spot: '20', Scr_spot: '2', spotDiureticUse: true, spotKnownCKD: true });
  const result = await expectResult(page, { raw: 50 / 7, context: 'confounders', band: null });
  expect(result.knownFacts).toMatchObject({ diureticUse: true, knownCKD: true });
  await expect(card(page)).toContainText(/diuretyk/i); await expect(card(page)).toContainText(/PChN/);
  await openDetails(page); await expect(details(page).locator('[aria-current="true"]')).toHaveCount(0);
  const saved = await captureSave(page);
  expect(saved.outcome).toMatchObject({ ok: true, saved: 1 }); expect(saved.vaultLocked).toBe(true);
  expect(saved.points[0]).toMatchObject({ outOfRange: null, norm: '' });
  expect(saved.notes[0].body).toContain('clcr:FENa_spot');
  const series = await page.evaluate(notes => window.ClcrVisitSave.buildSeriesFromNotes(notes, { formulaId: 'FENa_spot' }), saved.notes);
  expect(series.flatMap(item => item.points)[0].fenaAssessment.knownFacts).toEqual(result.knownFacts);
});

test('FENa: surowy zapis 0,99 / 1,99 / 0,01% i historia zachowują ocenę z dnia badania', async ({ page }) => {
  await openCalculator(page);
  const expected = [];
  for (const [index, [sodium, raw, band]] of [['138.6', 0.99, 'low'], ['278.6', 1.99, 'middle'], ['1.4', 0.01, 'low']].entries()) {
    await restore(page, { U_Na_spot: sodium }); const result = await expectResult(page, { raw, band });
    const saved = await captureSave(page, `2026-10-${25 + index}`);
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 }); expect(saved.vaultLocked).toBe(true);
    expect(saved.notes).toEqual(saved.rawNotes); expect(saved.points).toHaveLength(1);
    expect(saved.points[0]).toMatchObject({ valueNum: raw, unit: '%', outOfRange: null, norm: '' });
    expect(saved.notes[0].labResult).toMatchObject({ valueNum: raw, unit: '%' });
    expected.push(result);
  }
  await restore(page, { age: '5', U_Na_spot: '100', spotDiureticUse: true, spotKnownCKD: true });
  const series = await page.evaluate(() => {
    const engine = window.VildaClcrFena;
    window.VildaClcrFena = { evaluate: () => { throw new Error('Nie wolno przeliczać zapisanej oceny'); } };
    try { return window.ClcrVisitSave.buildSeriesFromNotes(window.__fenaSyntheticNotes, { formulaId: 'FENa_spot' }); }
    finally { window.VildaClcrFena = engine; }
  });
  const points = series.flatMap(item => item.points).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  expect(points).toHaveLength(3); expect(points.map(point => point.valueNum)).toEqual([0.99, 1.99, 0.01]);
  expect(points.map(point => point.outOfRange)).toEqual([null, null, null]);
  for (const [index, point] of points.entries()) expect(point.fenaAssessment).toMatchObject(expected[index]);
  const historical = await page.evaluate(() => {
    const original = window.__fenaSyntheticNotes[0];
    const legacy = { ...original, clinicalDateISO: '2026-10-01', body: 'Kalkulator klirensu · clcr:FENa_spot',
      labResult: { ...original.labResult, value: '2,2', valueNum: 2.2, norm: 'dawny opis bez kontekstu' } };
    const edited = { ...original, clinicalDateISO: '2026-10-02',
      labResult: { ...original.labResult, value: '0,5', valueNum: 0.5 } };
    const engine = window.VildaClcrFena;
    window.VildaClcrFena = { evaluate: () => { throw new Error('Nie wolno odtwarzać brakującego kontekstu z dzisiejszych danych'); } };
    try { return window.ClcrVisitSave.buildSeriesFromNotes([legacy, edited], { formulaId: 'FENa_spot' }).flatMap(item => item.points); }
    finally { window.VildaClcrFena = engine; }
  });
  expect(historical.map(point => point.valueNum)).toEqual([2.2, 0.5]);
  for (const point of historical) {
    expect(point.norm).toBe(''); expect(point.outOfRange).toBeNull(); expect(point.fenaAssessment).toBeUndefined();
  }
});

test('FENa: jawna niezgodność próbek blokuje mimo dawnego zaznaczenia; brak potwierdzenia pozostaje założeniem', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [{ spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'no' },
    { spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'no' }, { FENa_sample_status: 'different-time' }]) {
    await restore(page, fields);
    const sampleState = await page.evaluate(() => ({
      status: document.getElementById('FENa_sample_status').value,
      paired: document.getElementById('ui_spotPairedChemistry_answer')?.value ?? null,
      same: document.getElementById('ui_spotSameSpecimen_answer')?.value ?? null,
      input: window.VildaClcrFena.readInputFromDocument(document),
    }));
    await expect(card(page), JSON.stringify({ incoming: fields, restored: sampleState })).toHaveCount(0);
    await expect(page.locator('#clcrResultReport')).toContainText(/prób|pobran/i);
    await openSampleDetails(page);
    await page.locator('#ui_fena_sample_issue').selectOption('');
    await expect(card(page)).toHaveCount(0);
    await kliknij(page.locator('#fenaCorrectSampleIssue')); const corrected = await expectResult(page, { raw: 1 / 7 });
    expect(corrected.sample).toMatchObject({ sameUrineSpecimen: 'confirmed', pairedSameTime: 'confirmed' });
  }
  await restore(page); const assumed = await expectResult(page, { raw: 1 / 7 });
  expect(assumed.sample).toMatchObject({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
  await openSampleDetails(page);
  await page.locator('#ui_fena_sample_issue').evaluate(node => {
    node.value = 'different-time';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => ({
    canonical: document.getElementById('FENa_sample_status').value,
    preserved: window.__vildaClcrVersionValueVault.FENa_sample_status,
    valid: window.evaluateClcrFena().valid,
  }))).toEqual({ canonical: 'different-time', preserved: 'different-time', valid: false });
  await page.locator('#ui_fena_sample_issue').evaluate(node => node.dispatchEvent(new Event('change', { bubbles: true })));
  await expect(card(page)).toHaveCount(0);
});

test('FENa: niepełna i preserved-only sesja nie miesza starych stężeń ani znanych faktów', async ({ page }) => {
  await openCalculator(page); await restore(page, { spotDiureticUse: true, spotKnownCKD: true, spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'yes' });
  const selected = { currentVersion: 'spot', formulaPicker: 'FENa_spot', age: '45' };
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FENa_spot', inputs: { ...selected, U_Na_spot: '20' } });
  await expect(page.locator('#U_Na_spot')).toHaveValue('20');
  for (const id of ['S_Na_spot', 'Ucr_spot', 'Scr_spot']) await expect(page.locator('#' + id)).toHaveValue('');
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => [document.getElementById('spotDiureticUse').checked, document.getElementById('spotKnownCKD').checked,
    document.getElementById('spotPairedChemistry').checked])).toEqual([false, false, false]);
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FENa_spot', inputs: selected,
    preservedInputs: { U_Na_spot: '20', S_Na_spot: '140', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '1', Scr_spot_unit: 'mg/dl' } });
  const restored = await expectResult(page, { raw: 1 / 7 });
  expect(restored.sample).toMatchObject({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FENa_spot', inputs: { ...selected, Scr_spot: '' },
    preservedInputs: { U_Na_spot: '20', S_Na_spot: '140', Ucr_spot: '100', Scr_spot: '1' } });
  await expect(page.locator('#Scr_spot')).toHaveValue(''); await expect(card(page)).toHaveCount(0);
});

test('FENa: publiczne odświeżenie z niepełnej sesji nie przywraca poprzedniej kreatyniny', async ({ page }) => {
  await openCalculator(page); await restore(page);
  expect(await page.evaluate(() => {
    const persistence = window.VildaPersistence;
    try {
      window.VildaPersistence = { readClcrSession: () => ({ version: 2, currentVersion: 'spot', selectedFormula: 'FENa_spot',
        inputs: { currentVersion: 'spot', formulaPicker: 'FENa_spot', U_Na_spot: '40' } }), writeClcrSession: () => true };
      return window.__vildaClcrRehydrate();
    } finally { window.VildaPersistence = persistence; }
  })).toBe(true);
  await expect(page.locator('#U_Na_spot')).toHaveValue('40');
  for (const id of ['S_Na_spot', 'Ucr_spot', 'Scr_spot']) await expect(page.locator('#' + id)).toHaveValue('');
  await expect(card(page)).toHaveCount(0);
});

test('FENa: pełna historia zachowuje małe dodatnie pomiary bez zamiany na zero', async ({ page }) => {
  await openCalculator(page);
  for (const [sodium, day] of [['0.014', '25'], ['0.14', '26']]) {
    await restore(page, { U_Na_spot: sodium }); await expectResult(page, { raw: day === '25' ? 0.0001 : 0.001 });
    expect((await captureSave(page, `2026-10-${day}`)).outcome).toMatchObject({ ok: true, saved: 1 });
  }
  const history = await readVisibleSavedHistory(page, '__fenaSyntheticNotes');
  expect(history.visible).toBe(true);
  expect(history.values).toEqual(['0,0001 %', '0,001 %']);
  expect(history.ids).toEqual(history.originalIds);
  expect(new Set(history.ids).size).toBe(2);
  expect(history.dates).toEqual(['2026-10-25', '2026-10-26']);
  expect(history.dates).toEqual(history.originalDates);
  expect(history.norms).toEqual(history.originalNorms);
  expect(history.chartPoints).toBe(0); // Zatwierdzony podgląd historii to pełna tabela, bez trendu.
  expect(history.points.map(point => point.valueNum)).toEqual([0.0001, 0.001]);
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
});

test('FENa → FEK → FENa: pola mają jeden DOM, a nowa sesja FEK nie uzupełnia się sodem poprzedniej próbki', async ({ page }) => {
  await openCalculator(page); await restore(page);
  await expectResult(page, { raw: 1 / 7 });
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('FEK_spot'));
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'FEK_spot' && window.clcrIsResetting !== true);
  for (const id of ['Ucr_spot', 'Scr_spot']) await expect(page.locator('#' + id)).toHaveCount(1);
  await expect(page.locator('#Ucr_spot')).toHaveValue('100'); await expect(page.locator('#Scr_spot')).toHaveValue('1');
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('FENa_spot'));
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'FENa_spot' && window.clcrIsResetting !== true);
  await expectResult(page, { raw: 1 / 7 });
  expect(await page.evaluate(() => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'FEK_spot', inputs: {
      currentVersion: 'spot', formulaPicker: 'FEK_spot', U_K_spot: '20', S_K_spot: '4',
      Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '1', Scr_spot_unit: 'mg/dl',
      spotPairedChemistry: false, ui_spotPairedChemistry_answer: '',
    },
  }, { source: 'e2e-fena-new-fictional-feK-sample', update: true, dispatchEvents: false, preserveAcrossVersions: true }))).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'FEK_spot' && window.clcrIsResetting !== true);
  const fek = page.locator('#clcrResultReport [data-clcr-series="FEK_spot"]');
  // FEK now follows the accepted four-concentration workflow. Missing pairing
  // confirmation is a disclosed assumption; the negative-fact cases below
  // continue to block calculation and saving.
  await expect(fek).toBeVisible();
  expect(Number(await fek.getAttribute('data-clcr-value'))).toBeCloseTo(5, 12);
  expect(JSON.parse(await fek.getAttribute('data-clcr-fek-snapshot')).sample)
    .toMatchObject({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('FENa_spot'));
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'FENa_spot' && window.clcrIsResetting !== true);
  for (const id of ['U_Na_spot', 'S_Na_spot']) await expect(page.locator('#' + id)).toHaveValue('');
  for (const id of ['Ucr_spot', 'Scr_spot']) await expect(page.locator('#' + id)).toHaveCount(1);
  await expect(card(page)).toHaveCount(0); await expect(page.locator('#fenaRequiredCount')).toHaveText('2/4');
});

for (const issue of ['different-time', 'different-urine']) {
  test(`FENa: znany problem ${issue} unieważnia wspólne potwierdzenie FEK i zachowuje właściwy kontekst UAG`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page);
    await restore(page, { U_K_spot: '25', S_K_spot: '4', U_Cl_spot: '30', FENa_sample_status: issue });
    await expect(card(page)).toHaveCount(0);
    await openSampleDetails(page); await kliknij(page.locator('#fenaCorrectSampleIssue'));
    expect((await expectResult(page, { raw: 1 / 7 })).sample)
      .toMatchObject({ sameUrineSpecimen: 'confirmed', pairedSameTime: 'confirmed' });
    await page.locator('#ui_fena_sample_issue').selectOption(issue);
    await expect(card(page)).toHaveCount(0);
    const shared = await page.evaluate(() => ({
      paired: document.getElementById('spotPairedChemistry').checked,
      same: document.getElementById('spotSameSpecimen').checked,
      vault: { ...window.__vildaClcrVersionValueVault },
    }));
    expect(shared.paired).toBe(false);
    expect(shared.vault).toMatchObject({ spotPairedChemistry: false, ui_spotPairedChemistry_answer: 'no' });
    expect(shared.same).toBe(issue === 'different-time');
    expect(shared.vault.ui_spotSameSpecimen_answer).toBe(issue === 'different-time' ? 'yes' : 'no');
    const choose = async formulaId => {
      expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
      await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
    };
    await choose('FEK_spot');
    await expect(page.locator('#clcrResultReport [data-clcr-series="FEK_spot"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.canComputeFormula('FEK_spot'))).toBe(false);
    expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('FEK_spot').valueReady)).toBe(false);
    expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'FEK_spot' }))).toEqual([]);
    await choose('FENa_spot'); await expect(card(page)).toHaveCount(0);
    await choose('AGu_spot');
    const uag = page.locator('#clcrResultReport [data-clcr-series="AGu_spot"]');
    if (issue === 'different-time') {
      await expect(uag).toBeVisible();
      expect(Number(await uag.getAttribute('data-clcr-value'))).toBe(15);
      expect(await page.evaluate(() => window.canComputeFormula('AGu_spot'))).toBe(true);
    } else {
      await expect(uag).toHaveCount(0);
      expect(await page.evaluate(() => window.canComputeFormula('AGu_spot'))).toBe(false);
    }
    await choose('FENa_spot'); await expect(card(page)).toHaveCount(0);
    await openSampleDetails(page); await kliknij(page.locator('#fenaCorrectSampleIssue'));
    await expectResult(page, { raw: 1 / 7 });
    await choose('FEK_spot');
    const corrected = page.locator('#clcrResultReport [data-clcr-series="FEK_spot"]');
    await expect(corrected).toBeVisible();
    expect(Number(await corrected.getAttribute('data-clcr-value'))).toBe(6.25);
    expect(errors).toEqual([]);
  });
}

test('FENa: odtworzona niezgodność próbek unieważnia stare potwierdzenie także przy otwieraniu FEK', async ({ page }) => {
  await openCalculator(page);
  for (const issue of ['different-time', 'different-urine']) {
    expect(await page.evaluate(({ issue, inputs }) => window.applyClcrSessionSnapshot({
      version: 2, currentVersion: 'spot', selectedFormula: 'FEK_spot', inputs: {
        ...inputs, formulaPicker: 'FEK_spot', FENa_sample_status: issue,
        U_K_spot: '25', S_K_spot: '4', U_Cl_spot: '30',
        spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'yes',
        spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'yes',
      },
    }, { source: 'e2e-fena-known-issue-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true }), { issue, inputs: base })).toBe(true);
    await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'FEK_spot' && window.clcrIsResetting !== true);
    await expect(page.locator('#clcrResultReport [data-clcr-series="FEK_spot"]')).toHaveCount(0);
    // The simplified FEK form does not mount the old routine questionnaire.
    // Its explicit negative fact must still survive in the canonical context.
    expect(await page.evaluate(() => window.__vildaClcrVersionValueVault.ui_spotPairedChemistry_answer)).toBe('no');
    expect(await page.evaluate(() => window.VildaClcrFek.readInputFromDocument(document).pairedSameTime)).toBe('different');
    expect(await page.evaluate(() => window.canComputeFormula('FEK_spot'))).toBe(false);
    expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('FEK_spot').valueReady)).toBe(false);
    expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'FEK_spot' }))).toEqual([]);
  }
});

for (const issue of ['different-time', 'different-urine']) {
  test(`FENa: problem ${issue} unieważnia dawne potwierdzenie protokołu TmP/GFR`, async ({ page }) => {
    await openCalculator(page);
    expect(await page.evaluate(inputs => window.applyClcrSessionSnapshot({
      version: 2, currentVersion: 'spot', selectedFormula: 'TMP_GFR', inputs: {
        ...inputs, formulaPicker: 'TMP_GFR', spotSampleKind: 'secondMorning',
        tmpOvernightFasting: true, ui_tmpOvernightFasting_answer: 'yes',
        tmpPairedSameTime: true, ui_tmpPairedSameTime_answer: 'yes',
        U_PO4_spot: '10', U_PO4_spot_unit: 'mmol/L', S_PO4_spot: '1', S_PO4_spot_unit: 'mmol/L',
      },
    }, { source: 'e2e-fena-tmp-shared-sample-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true }), base)).toBe(true);
    await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'TMP_GFR' && window.clcrIsResetting !== true);
    const tmpCard = page.locator('#clcrResultReport [data-clcr-series="TMP_GFR"]');
    await expect(tmpCard).toBeVisible();
    expect(await page.evaluate(() => window.canComputeFormula('TMP_GFR'))).toBe(true);
    const choose = async formulaId => {
      expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
      await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
    };
    await choose('FENa_spot'); await expectResult(page, { raw: 1 / 7 });
    await openSampleDetails(page); await page.locator('#ui_fena_sample_issue').selectOption(issue);
    await expect(card(page)).toHaveCount(0);
    const knownTmp = await page.evaluate(() => ({
      paired: document.getElementById('tmpPairedSameTime').checked,
      answer: document.getElementById('ui_tmpPairedSameTime_answer')?.value,
      vaultAnswer: window.__vildaClcrVersionValueVault?.ui_tmpPairedSameTime_answer,
    }));
    expect(knownTmp).toEqual({ paired: false, answer: issue === 'different-time' ? 'no' : 'unknown', vaultAnswer: issue === 'different-time' ? 'no' : 'unknown' });
    await choose('TMP_GFR'); await expect(tmpCard).toHaveCount(0);
    expect(await page.evaluate(() => window.canComputeFormula('TMP_GFR'))).toBe(false);
    expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('TMP_GFR').valueReady)).toBe(false);
    expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'TMP_GFR' }))).toEqual([]);
    await choose('FENa_spot'); await openSampleDetails(page);
    await kliknij(page.locator('#fenaCorrectSampleIssue')); await expectResult(page, { raw: 1 / 7 });
    // Correcting Na/Cr pairing does not silently re-confirm the independent
    // TmP/GFR phosphate sampling protocol that was invalidated above.
    await choose('TMP_GFR'); await expect(tmpCard).toHaveCount(0);
    await expect(page.locator('#tmpPairedSameTime')).not.toBeChecked();
    await page.locator('#ui_tmpPairedSameTime_answer').selectOption('yes');
    await expect(tmpCard).toBeVisible();
    expect(await page.evaluate(() => window.canComputeFormula('TMP_GFR'))).toBe(true);
  });
}
