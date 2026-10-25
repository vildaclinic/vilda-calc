import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';

// Synthetic concentrations only. The real vault stays locked; save tests use
// the production collector and sanitizers with an isolated in-memory adapter.
const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="FEK_spot"]');
const details = page => page.locator('#clcr-fek-details');
const snapshot = async page => JSON.parse(await card(page).getAttribute('data-clcr-fek-snapshot'));
const base = {
  currentVersion: 'spot', formulaPicker: 'FEK_spot', age: '8', ageMonths: '', ageDays: '',
  sex: '', weight: '', height: '', Scr: '', U_K_spot: '20', S_K_spot: '4',
  Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '1', Scr_spot_unit: 'mg/dl',
  FENa_sample_status: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
  spotPairedChemistry: false, ui_spotPairedChemistry_answer: '', spotSampleKind: '',
  spotDiureticUse: false, spotKnownCKD: false,
  suspectedAKI: false, creatinineState: '',
};

async function openCalculator(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//, route => route.abort());
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await guest.waitFor({ state: 'visible' });
  await guest.evaluate(button => button.click());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') && typeof window.applyClcrSessionSnapshot === 'function' &&
    Boolean(window.VildaClcrFek && window.ClcrFekUi && window.ClcrVisitSave) && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
}

async function applySession(page, value, selected = 'FEK_spot') {
  expect(await page.evaluate(session => window.applyClcrSessionSnapshot(session, {
    source: 'e2e-fek-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), value)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, selected);
}

async function restore(page, fields = {}) {
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FEK_spot', inputs: { ...base, ...fields } });
  await expect(page.locator('#fekInputCard')).toBeVisible();
}

async function choose(page, formulaId) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
}

async function expectResult(page, { raw, status, tone, outOfRange } = {}) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(card(page).locator('.clcr-result-value')).toHaveCount(1);
  await expect(card(page).locator('.clcr-result-unit')).toHaveText('%');
  if (raw !== undefined) await expect.poll(async () => Number(await card(page).getAttribute('data-clcr-value'))).toBeCloseTo(raw, 12);
  const result = await snapshot(page);
  expect(result).toMatchObject({ schema: 'clcr-fek', version: 1, valid: true, unit: '%' });
  if (status !== undefined) expect(result.status).toBe(status);
  if (tone !== undefined) {
    expect(result.tone).toBe(tone);
    await expect(card(page)).toHaveAttribute('data-clcr-tone', tone);
  }
  if (outOfRange !== undefined) expect(result.outOfRange).toBe(outOfRange);
  await expect(card(page).locator('.clcr-result-value')).toHaveText(result.display.text);
  await expect(card(page)).toHaveAttribute('data-clcr-display-value', result.display.text);
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  return result;
}

async function openDetails(page) {
  if (await details(page).getAttribute('open') === null) await kliknij(details(page).locator(':scope > summary'));
}

async function openSampleDetails(page) {
  if (await page.locator('#fekSampleInfo').getAttribute('open') === null) await kliknij(page.locator('#fekSampleInfo > summary'));
}

async function captureSave(page, date = '2026-10-25') {
  return page.evaluate(async clinicalDateISO => {
    const api = window.ClcrVisitSave, originalVault = window.VildaVault, rawNotes = [], notes = [];
    const points = api.collectActiveDatapoints(document, { formulaId: 'FEK_spot' });
    window.VildaVault = { isUnlocked: () => true, savePatientNote: async note => {
      rawNotes.push(JSON.parse(JSON.stringify(note)));
      notes.push({ ...note, body: originalVault.sanitizeNoteText(note.body), labResult: originalVault.sanitizeLabResult(note.labResult) });
    } };
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'fictional-fek-e2e-only', clinicalDateISO, root: document, formulaId: 'FEK_spot' });
      window.__fekSyntheticNotes = [...(window.__fekSyntheticNotes || []), ...notes];
      return { outcome, points, rawNotes, notes, vaultLocked: !originalVault.isUnlocked() };
    } finally { window.VildaVault = originalVault; }
  }, date);
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
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('#fekInputCard'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'), saveDate: box('#clcrVisitDate'), saveButton: box('#clcrVisitSaveBtn'),
      fields: [...document.querySelectorAll('#fekInputCard input,#fekInputCard select')].filter(node => node.checkVisibility()).map(node => {
        const r = node.getBoundingClientRect();
        return { id: node.id, height: r.height, font: parseFloat(getComputedStyle(node).fontSize), x: r.x, right: r.right };
      }),
      rows: [...document.querySelectorAll('#fekInputCard .fek-value-row')].map(node => {
        const r = node.getBoundingClientRect(), unit = node.lastElementChild.getBoundingClientRect();
        return { x: r.x, width: r.width, unitWidth: unit.width, unitRight: unit.right };
      }),
      numberLine: (() => {
        const node = document.querySelector('#clcrResultReport .clcr-result-card .clcr-result-value');
        if (!node) return null;
        const range = document.createRange(); range.selectNodeContents(node);
        // Glyph ink can exceed CSS line-height for the current fallback font.
        // Distinct text-fragment rows identify actual wrapping without relying
        // on font-specific glyph bounds.
        return { rows: new Set([...range.getClientRects()].filter(rect => rect.width > 0).map(rect => Math.round(rect.top))).size };
      })(),
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
    expect(field.height, field.id).toBeGreaterThanOrEqual(48);
    expect(field.font, field.id).toBeGreaterThanOrEqual(16);
    expect(field.x, field.id).toBeGreaterThanOrEqual(0);
    expect(field.right, field.id).toBeLessThanOrEqual(width + 1);
  }
  if (result.numberLine) expect(result.numberLine.rows).toBe(1);
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
  test(`FEK ${width}px: cztery stężenia, jedna karta z normą i niezmienne wyrównanie`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page, { U_K_spot: '', S_K_spot: '', Ucr_spot: '', Scr_spot: '' });
    await expect(page.locator('#fekRequiredCount')).toHaveText('0/4');
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#clcrResultReport')).toContainText(/Tutaj pojawi się wynik FEK/);
    for (const [id, name] of [['U_K_spot', 'Potas w moczu'], ['S_K_spot', 'Potas w surowicy'], ['Ucr_spot', 'Kreatynina w moczu'], ['Scr_spot', 'Kreatynina w surowicy']]) {
      await expect(page.locator('#' + id)).toHaveAccessibleName(new RegExp(name));
    }
    expect(await page.locator('#fekInputCard input:visible').count()).toBe(4);
    await expect(page.locator('#fekInputCard')).toContainText(/Zakładamy.*próbkę moczu.*krew/);
    const initial = await geometry(page, width);
    for (const id of ['U_K_spot', 'Ucr_spot', 'S_K_spot', 'Scr_spot']) await page.locator('#' + id).fill(base[id]);
    const result = await expectResult(page, { raw: 5, status: 'within', tone: 'normal', outOfRange: false });
    expect(result.sample).toMatchObject({ sameUrineSpecimen: 'assumed', pairedSameTime: 'assumed' });
    await expect(page.locator('#fekRequiredCount')).toHaveText('4/4');
    await expect(card(page)).toContainText('Norma dla wieku');
    await expect(card(page)).toContainText('4,6–20,4%');
    await expect(page.locator('#clcrResultReport')).not.toContainText(/Pełna interpretacja jest ograniczona|Do pełnej interpretacji|Uzupełnij.*wiek/);
    sameWidths(initial, await geometry(page, width));
    for (const [unit, urine, serum] of [['umol', '8840', '88.4'], ['mmol/L', '8.84', '0.0884'], ['mg/dl', '100', '1']]) {
      await page.locator('#Ucr_spot_unit').selectOption(unit);
      await page.locator('#Scr_spot_unit').selectOption(unit);
      await page.locator('#Ucr_spot').fill(urine);
      await page.locator('#Scr_spot').fill(serum);
      await expectResult(page, { raw: 5, status: 'within', tone: 'normal' });
      sameWidths(initial, await geometry(page, width));
    }
    await page.locator('#U_K_spot').fill('120');
    await expectResult(page, { raw: 30, status: 'above', tone: 'warning', outOfRange: true });
    await expect(card(page)).toContainText(/Powyżej zakresu dla wieku/);
    await page.locator('#U_K_spot').fill('81.6004');
    await expectResult(page, { raw: 20.4001, status: 'above', tone: 'warning' });
    sameWidths(initial, await geometry(page, width));
    await page.locator('#U_K_spot').fill('120');
    await openDetails(page);
    await expect(details(page)).toContainText(/AENP/);
    await expect(details(page)).toContainText(/P3.*P97/);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#S_K_spot').fill('0');
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#clcrResultReport')).toContainText(/dodatnie|stężenia/i);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#S_K_spot').fill('4');
    await expectResult(page, { raw: 30, tone: 'warning' });
    await openSampleDetails(page);
    await page.locator('#ui_fek_sample_issue').selectOption('different-time');
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#clcrResultReport')).toContainText(/prób|pobran|równocz/i);
    sameWidths(initial, await geometry(page, width));
    await kliknij(page.locator('#fekCorrectSampleIssue'));
    await expectResult(page, { raw: 30, tone: 'warning' });
    await testInfo.attach(`fek-${width}-production`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#fekRequiredCount')).toHaveText('0/4');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('FEK: wiek dobiera właściwe przedziały, a granica roku pozostaje dwoma zakresami', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { age: '0', ageMonths: '6' });
  let result = await expectResult(page, { raw: 5, status: 'within', tone: 'normal' });
  expect(result.references).toHaveLength(1);
  await expect(card(page)).toContainText('3,8–27,4%');
  await restore(page, { age: '1', ageMonths: '0' });
  result = await expectResult(page, { raw: 5, status: 'unassessed', tone: 'neutral', outOfRange: null });
  expect(result.references).toHaveLength(2);
  expect(result.referenceActive).toBe(false);
  await expect(card(page)).toContainText('3,8–27,4%');
  await expect(card(page)).toContainText('4,6–20,4%');
  for (const age of ['16', '75', '']) {
    await restore(page, { age });
    result = await expectResult(page, { raw: 5, status: 'unassessed', tone: 'neutral', outOfRange: null });
    expect(result.referenceActive).toBe(false);
    await expect(card(page)).not.toContainText('4–16%');
    await expect(page.locator('#fekRequiredCount')).toHaveText('4/4');
  }
  await restore(page, { age: '0', ageDays: '14' });
  await expectResult(page, { raw: 5, status: 'unassessed', tone: 'neutral' });
  await expect(card(page)).not.toContainText('3,8–27,4%');
});

test('FEK: dokładne pediatryczne granice i zaokrąglenie pozostają po tej samej stronie normy', async ({ page }) => {
  await openCalculator(page);
  const samples = [
    { age: '8', ageMonths: '', low: 4.6, high: 20.4, points: [['18.3996', 4.5999, 'below'], ['18.4', 4.6, 'within'], ['18.4004', 4.6001, 'within'], ['81.5996', 20.3999, 'within'], ['81.6', 20.4, 'within'], ['81.6004', 20.4001, 'above']] },
    { age: '0', ageMonths: '6', low: 3.8, high: 27.4, points: [['15.1996', 3.7999, 'below'], ['15.2', 3.8, 'within'], ['15.2004', 3.8001, 'within'], ['109.5996', 27.3999, 'within'], ['109.6', 27.4, 'within'], ['109.6004', 27.4001, 'above']] },
  ];
  for (const sample of samples) {
    await restore(page, { age: sample.age, ageMonths: sample.ageMonths });
    for (const [potassium, raw, status] of sample.points) {
      await page.locator('#U_K_spot').fill(potassium);
      const result = await expectResult(page, { raw, status, tone: status === 'within' ? 'normal' : 'warning', outOfRange: status !== 'within' });
      const displayed = Number(result.display.text.replace(',', '.'));
      if (status === 'below') expect(displayed).toBeLessThan(sample.low);
      if (status === 'above') expect(displayed).toBeGreaterThan(sample.high);
      if (raw === sample.low || raw === sample.high) expect(displayed).toBe(raw);
    }
  }
});

test('FEK: małe dodatnie wartości, zero i jednostki kreatyniny mają spójną walidację', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_K_spot: '0.04' });
  let result = await expectResult(page, { raw: 0.01, status: 'below' });
  expect(result.display.text).toBe('0,01');
  await page.locator('#U_K_spot').fill('1e-12');
  result = await expectResult(page, { raw: 2.5e-13, status: 'below' });
  expect(Number(result.display.text.replace(',', '.'))).toBeGreaterThan(0);
  await page.locator('#U_K_spot').fill('0');
  await expectResult(page, { raw: 0, status: 'below' });
  for (const id of ['S_K_spot', 'Ucr_spot', 'Scr_spot']) {
    const previous = await page.locator('#' + id).inputValue();
    await page.locator('#' + id).fill('0');
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#clcrResultReport')).toContainText(/dodatnie|stężenia/i);
    await page.locator('#' + id).fill(previous);
    await expect(card(page)).toBeVisible();
  }
  await restore(page, { U_K_spot: '25', Ucr_spot: '50001', Ucr_spot_unit: 'umol' });
  const first = await expectResult(page);
  expect(await page.evaluate(() => window.canComputeFormula('FEK_spot'))).toBe(true);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('FEK_spot').valueReady)).toBe(true);
  await page.locator('#Ucr_spot_unit').selectOption('mg/dl');
  await page.locator('#Ucr_spot').fill('565.6221719457013');
  result = await expectResult(page, { raw: first.rawValue });
  expect(result.status).toBe(first.status);
  expect((await captureSave(page)).outcome).toMatchObject({ ok: true, saved: 1 });
});

test('FEK: niskie K i znane czynniki mają pierwszeństwo wobec normy zdrowych dzieci', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { S_K_spot: '2.8', U_K_spot: '28', spotDiureticUse: true, spotKnownCKD: true });
  const result = await expectResult(page, { raw: 10, status: 'unassessed', outOfRange: null });
  expect(result.referenceActive).toBe(false);
  expect(result.knownFacts).toMatchObject({ diureticUse: true, knownCKD: true });
  await expect(card(page)).toContainText(/hipokaliem|Obniżony potas/i);
  await expect(card(page)).toContainText(/PChN|chorob.*nerek/i);
  await expect(card(page)).toContainText(/diuretyk/i);
  await expect(card(page)).not.toContainText('W zakresie dla wieku');
  const saved = await captureSave(page);
  expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
  expect(saved.vaultLocked).toBe(true);
  expect(saved.points[0].outOfRange).toBeNull();
  const points = await page.evaluate(notes => window.ClcrVisitSave.buildSeriesFromNotes(notes, { formulaId: 'FEK_spot' }).flatMap(series => series.points), saved.notes);
  expect(points[0].fekAssessment).toMatchObject(result);
  await restore(page, { S_K_spot: '5.1' });
  await expectResult(page, { status: 'unassessed', outOfRange: null });
  await expect(card(page)).not.toContainText(/W zakresie dla wieku|hiperkaliemia/i);
  await restore(page, { suspectedAKI: true, creatinineState: 'rapidlyChanging' });
  const aki = await expectResult(page, { status: 'unassessed', outOfRange: null });
  expect(aki.knownFacts).toMatchObject({ knownAKI: true, rapidlyChangingCreatinine: true });
  await expect(card(page)).toContainText(/AKI/);
  await expect(card(page)).not.toContainText('W zakresie dla wieku');
});

test('FEK: zakres zaobserwowany u dorosłych nie nadaje prawidłowości ani diagnozy', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { age: '45' });
  let result = await expectResult(page, { raw: 5, status: 'unassessed', tone: 'neutral', outOfRange: null });
  expect(result.referenceActive).toBe(false);
  await expect(card(page)).toContainText('4–16%');
  await expect(card(page)).toContainText(/Zakres w badaniu dorosłych/);
  await expect(card(page)).not.toContainText('Norma dla wieku');
  await page.locator('#U_K_spot').fill('120');
  await expectResult(page, { raw: 30, status: 'unassessed', tone: 'neutral', outOfRange: null });
  await page.locator('#S_K_spot').fill('2.8');
  result = await expectResult(page, { status: 'unassessed', outOfRange: null });
  expect(result.referenceActive).toBe(false);
  await expect(card(page)).toContainText(/hipokaliem|Obniżony potas/i);
  await expect(card(page)).not.toContainText(/nerkowa utrata potasu rozpoznana|Norma dla wieku/);
});

test('FEK: zapis i historia zachowują surową liczbę oraz pierwotną normę i kontekst', async ({ page }) => {
  await openCalculator(page);
  const assessments = [];
  for (const [index, [potassium, raw]] of [['25', 6.25], ['39.96', 9.99], ['0.04', 0.01]].entries()) {
    await restore(page, { U_K_spot: potassium });
    const result = await expectResult(page, { raw });
    const saved = await captureSave(page, `2026-10-${25 + index}`);
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
    expect(saved.notes).toEqual(saved.rawNotes);
    expect(saved.points).toHaveLength(1);
    expect(saved.points[0].valueNum).toBe(raw);
    expect(saved.notes[0].labResult.valueNum).toBe(raw);
    expect(saved.notes[0].labResult.unit).toBe('%');
    assessments.push(result);
  }
  await restore(page, { age: '45', S_K_spot: '2.8', spotKnownCKD: true, spotDiureticUse: true });
  const points = await page.evaluate(() => {
    const engine = window.VildaClcrFek;
    window.VildaClcrFek = { evaluate: () => { throw new Error('Zapisanej oceny nie wolno przeliczać'); } };
    try { return window.ClcrVisitSave.buildSeriesFromNotes(window.__fekSyntheticNotes, { formulaId: 'FEK_spot' }).flatMap(series => series.points); }
    finally { window.VildaClcrFek = engine; }
  });
  expect(points).toHaveLength(3);
  expect(points.map(point => point.valueNum)).toEqual([6.25, 9.99, 0.01]);
  expect(points.map(point => point.outOfRange)).toEqual([false, false, true]);
  for (const [index, point] of points.entries()) expect(point.fekAssessment).toMatchObject(assessments[index]);
});

test('FEK: widoczna historia i trend nie zamieniają małych dodatnich wyników na zero', async ({ page }) => {
  await openCalculator(page);
  for (const [potassium, raw, day] of [['0.0004', 0.0001, '25'], ['0.004', 0.001, '26']]) {
    await restore(page, { U_K_spot: potassium });
    await expectResult(page, { raw, status: 'below' });
    expect((await captureSave(page, `2026-10-${day}`)).outcome).toMatchObject({ ok: true, saved: 1 });
  }
  const history = await page.evaluate(async () => {
    const originalVault = window.VildaVault, api = window.ClcrVisitSave;
    const originalPatientId = api.resolveCurrentPatientId();
    window.VildaVault = { isUnlocked: () => true, listPatientNotesForPatient: async () => window.__fekSyntheticNotes };
    api._setPatientId('fictional-fek-history-only');
    try {
      await api.refreshActiveHistory();
      return { hidden: document.getElementById('clcrHistoryCard').hidden,
        values: [...document.querySelectorAll('#clcrHistoryBody .cvs-num')].map(node => node.textContent.trim()),
        trend: document.querySelector('#clcrHistoryBody .cvs-trend')?.textContent || '',
        points: (await api.readActiveSeries()).flatMap(series => series.points) };
    } finally { window.VildaVault = originalVault; api._setPatientId(originalPatientId); }
  });
  expect(history.hidden).toBe(false);
  expect(history.values).toEqual(['0,0001 %', '0,001 %']);
  expect(history.trend).toContain('0,0001 → 0,001 %');
  expect(history.points.map(point => point.valueNum)).toEqual([0.0001, 0.001]);
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
});

test('FEK: historyczny przecinek i nierówność nie giną ani nie stają się nową oceną', async ({ page }) => {
  await openCalculator(page);
  await restore(page);
  await captureSave(page);
  const points = await page.evaluate(() => {
    const original = window.__fekSyntheticNotes[0];
    const common = { ...original, body: 'Kalkulator klirensu · clcr:FEK_spot' };
    const comma = { ...common, clinicalDateISO: '2026-10-01', labResult: { ...common.labResult, value: '6,3', valueNum: undefined, norm: 'dawny opis' } };
    const bound = { ...common, clinicalDateISO: '2026-10-02', labResult: { ...common.labResult, value: '<1', valueNum: 1, norm: 'dawny opis' } };
    const edited = { ...original, clinicalDateISO: '2026-10-03', labResult: { ...original.labResult, value: '0,5', valueNum: 0.5 } };
    const engine = window.VildaClcrFek;
    window.VildaClcrFek = { evaluate: () => { throw new Error('Stary wpis nie otrzymuje dzisiejszej normy'); } };
    try { return window.ClcrVisitSave.buildSeriesFromNotes([comma, bound, edited], { formulaId: 'FEK_spot' }).flatMap(series => series.points); }
    finally { window.VildaClcrFek = engine; }
  });
  expect(points).toHaveLength(3);
  expect(points[0].valueNum).toBe(6.3);
  expect(points[1].displayValue).toContain('<1');
  expect(points[1].valueNum).toBeNull();
  expect(points[2].valueNum).toBe(0.5);
  for (const point of points) {
    expect(point.fekAssessment).toBeUndefined();
    expect(point.norm).toBe('');
    expect(point.outOfRange).toBeNull();
  }
});

test('FEK: cienka sesja i preserved-only nie mieszają poprzednich stężeń ani faktów', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_K_spot: '40', spotDiureticUse: true, spotKnownCKD: true, spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'yes' });
  const selected = { currentVersion: 'spot', formulaPicker: 'FEK_spot', age: '8' };
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FEK_spot', inputs: { ...selected, Ucr_spot: '120', Scr_spot: '1.2', spotPairedChemistry: true } });
  for (const id of ['U_K_spot', 'S_K_spot']) await expect(page.locator('#' + id)).toHaveValue('');
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => [document.getElementById('spotDiureticUse').checked, document.getElementById('spotKnownCKD').checked])).toEqual([false, false]);
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FEK_spot', inputs: selected,
    preservedInputs: { U_K_spot: '20', S_K_spot: '4', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '1', Scr_spot_unit: 'mg/dl' } });
  await expectResult(page, { raw: 5, status: 'within' });
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FEK_spot', inputs: { ...selected, S_K_spot: '' },
    preservedInputs: { U_K_spot: '20', S_K_spot: '4', Ucr_spot: '100', Scr_spot: '1' } });
  await expect(page.locator('#S_K_spot')).toHaveValue('');
  await expect(card(page)).toHaveCount(0);
  await restore(page);
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FENa_spot', inputs: {
    currentVersion: 'spot', formulaPicker: 'FENa_spot', age: '8', U_Na_spot: '20', S_Na_spot: '140', Ucr_spot: '120', Scr_spot: '1.2',
  } }, 'FENa_spot');
  await choose(page, 'FEK_spot');
  for (const id of ['U_K_spot', 'S_K_spot']) await expect(page.locator('#' + id)).toHaveValue('');
  await expect(card(page)).toHaveCount(0);
  for (const id of ['Ucr_spot', 'Scr_spot']) await expect(page.locator('#' + id)).toHaveCount(1);
});

test('FEK: nieznany fakt nie zmienia się w potwierdzenie, a jawne no wygrywa z dawnym yes', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [{ spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'no' },
    { spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'no' }, { FENa_sample_status: 'different-time' }]) {
    await restore(page, fields);
    await expect(card(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.canComputeFormula('FEK_spot'))).toBe(false);
    expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'FEK_spot' }))).toEqual([]);
    await openSampleDetails(page);
    await page.locator('#ui_fek_sample_issue').selectOption('');
    await expect(card(page)).toHaveCount(0);
    await kliknij(page.locator('#fekCorrectSampleIssue'));
    const corrected = await expectResult(page, { raw: 5 });
    expect(corrected.sample).toMatchObject({ sameUrineSpecimen: 'confirmed', pairedSameTime: 'confirmed' });
  }
  await restore(page, { spotDiureticUse: true, ui_spotDiureticUse_answer: 'no', spotKnownCKD: true, ui_spotKnownCKD_answer: 'unknown' });
  const result = await expectResult(page, { raw: 5, status: 'within' });
  expect(result.knownFacts).toMatchObject({ diureticUse: false, knownCKD: null });
  await openSampleDetails(page);
  await page.locator('#ui_fek_sample_issue').evaluate(node => {
    node.value = 'different-time';
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => ({ canonical: document.getElementById('FENa_sample_status').value,
    preserved: window.__vildaClcrVersionValueVault.FENa_sample_status, valid: window.evaluateClcrFek().valid })))
    .toEqual({ canonical: 'different-time', preserved: 'different-time', valid: false });
  await page.locator('#ui_fek_sample_issue').evaluate(node => node.dispatchEvent(new Event('change', { bubbles: true })));
  await expect(card(page)).toHaveCount(0);
});

test('FEK: przejście FECl → TmP/GFR zachowuje także świadomie wyczyszczone pole', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_Cl_spot: '30', S_Cl_spot: '100', FENa_sample_status: 'different-time' });
  expect(await page.evaluate(() => window.__vildaClcrVersionValueVault.Scr_spot)).toBe('1');
  await choose(page, 'FECl_spot');
  await expect(page.locator('#Scr_spot')).toHaveValue('1');
  await page.locator('#Scr_spot').fill('');
  await choose(page, 'TMP_GFR');
  await choose(page, 'FEK_spot');
  await expect(page.locator('#Scr_spot')).toHaveValue('');
  for (const [id, value] of [['U_K_spot', '20'], ['S_K_spot', '4'], ['Ucr_spot', '100'], ['U_Cl_spot', '30']]) {
    await expect(page.locator('#' + id)).toHaveValue(value);
  }
  await expect(page.locator('#FENa_sample_status')).toHaveValue('different-time');
  expect(await page.evaluate(() => window.VildaClcrFek.readInputFromDocument(document).pairedSameTime)).toBe('different');
  expect(await page.evaluate(() => window.__vildaClcrVersionValueVault.ui_spotPairedChemistry_answer)).toBe('no');
  await expect(card(page)).toHaveCount(0);
});

for (const issue of ['different-time', 'different-urine']) {
  test(`FEK: niezgodność ${issue} pozostaje faktem po przełączeniu do FENa, FECl, UAG i TmP/GFR`, async ({ page }, testInfo) => {
    const record = async name => {
      const state = await page.evaluate(() => {
        const ids = ['U_K_spot', 'S_K_spot', 'Ucr_spot', 'Scr_spot', 'U_Na_spot', 'S_Na_spot', 'U_Cl_spot',
          'FENa_sample_status', 'spotSameSpecimen', 'ui_spotSameSpecimen_answer', 'spotPairedChemistry', 'ui_spotPairedChemistry_answer',
          'tmpPairedSameTime', 'ui_tmpPairedSameTime_answer'];
        const control = Object.fromEntries(ids.map(id => {
          const node = document.getElementById(id);
          return [id, node ? node.type === 'checkbox' ? node.checked : node.value : null];
        }));
        return { formula: window.ClcrUiWorkflow.state.activeFormulaId, control,
          preserved: Object.fromEntries(ids.map(id => [id, window.__vildaClcrVersionValueVault?.[id]])),
          input: window.VildaClcrFek.readInputFromDocument(document),
          body: document.getElementById('clcrResultReport').innerText };
      });
      await testInfo.attach(name, { body: Buffer.from(JSON.stringify(state, null, 2)), contentType: 'application/json' });
      return state;
    };
    await openCalculator(page);
    await restore(page, { age: '8', sex: 'M', U_K_spot: '25', U_Na_spot: '20', S_Na_spot: '140', U_Cl_spot: '30', S_Cl_spot: '100',
      spotSampleKind: 'secondMorning', tmpOvernightFasting: true, ui_tmpOvernightFasting_answer: 'yes',
      tmpPairedSameTime: true, ui_tmpPairedSameTime_answer: 'yes', U_PO4_spot: '10', U_PO4_spot_unit: 'mmol/L', S_PO4_spot: '1', S_PO4_spot_unit: 'mmol/L',
      spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'yes', spotPairedChemistry: true, ui_spotPairedChemistry_answer: 'yes' });
    await expectResult(page, { raw: 6.25 });
    await openSampleDetails(page);
    await page.locator('#ui_fek_sample_issue').selectOption(issue);
    await expect(card(page)).toHaveCount(0);
    await record('known-issue');
    for (const id of ['FENa_spot', 'FECl_spot', 'TMP_GFR']) {
      await choose(page, id);
      await record('switched-' + id);
      await expect(page.locator(`#clcrResultReport [data-clcr-series="${id}"]`)).toHaveCount(0);
      expect(await page.evaluate(formulaId => window.canComputeFormula(formulaId), id)).toBe(false);
    }
    await choose(page, 'AGu_spot');
    await record('switched-UAG');
    const uag = page.locator('#clcrResultReport [data-clcr-series="AGu_spot"]');
    if (issue === 'different-time') {
      await expect(uag).toBeVisible();
      expect(Number(await uag.getAttribute('data-clcr-value'))).toBe(15);
    } else await expect(uag).toHaveCount(0);
    await choose(page, 'FEK_spot');
    await openSampleDetails(page);
    await kliknij(page.locator('#fekCorrectSampleIssue'));
    await record('corrected-FEK');
    await expectResult(page, { raw: 6.25 });
    await choose(page, 'TMP_GFR');
    await expect(page.locator('#clcrResultReport [data-clcr-series="TMP_GFR"]')).toHaveCount(0);
    await expect(page.locator('#tmpPairedSameTime')).not.toBeChecked();
    expect(await page.evaluate(() => window.canComputeFormula('TMP_GFR'))).toBe(false);
  });
}

test('FEK: schowek AI i raport DOCX korzystają z widocznego wyniku oraz jego komentarza', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_K_spot: '18.3996' });
  const result = await expectResult(page, { raw: 4.5999, status: 'below' });
  expect(result.display.text).toBe('4,5999');
  await page.evaluate(() => {
    window.__fekClipboard = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__fekClipboard = value; } } });
    window.alert = () => {};
  });
  await kliknij(page.locator('#askAI'));
  await expect.poll(() => page.evaluate(() => window.__fekClipboard)).toContain('4,5999');
  const clipboard = await page.evaluate(() => window.__fekClipboard);
  expect(clipboard).toContain('4,6–20,4%');
  expect(clipboard).toContain(result.interpretation);
  const downloadPromise = page.waitForEvent('download');
  await kliknij(page.locator('#downloadDOCX'));
  const download = await downloadPromise;
  // External DOCX runtime is blocked above; this checks the real supported
  // HTML/Word fallback instead of a copied export serializer.
  expect(download.suggestedFilename()).toMatch(/\.doc$/);
  const exported = await fs.readFile(await download.path(), 'utf8');
  expect(exported).toContain('4,5999');
  expect(exported).toContain('4,6–20,4%');
  expect(exported).toContain(result.interpretation);
});
