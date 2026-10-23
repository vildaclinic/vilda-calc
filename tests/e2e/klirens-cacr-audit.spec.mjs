import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';

// Fikcyjne dane i produkcyjny DOM. Zapis przechwytuje wyłącznie adapter w pamięci;
// sanitizer pochodzi z prawdziwego, przez cały test zablokowanego modułu sejfu.
const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="CaCr_spot"]');
const details = page => page.locator('#clcrResultReport .clcr-result-details[data-clcr-formula="CaCr_spot"]');
const snapshot = async page => JSON.parse(await card(page).getAttribute('data-clcr-cacr-snapshot'));
const mode = (page, direct = false) => page.getByRole('button', {
  name: direct ? 'Gotowy wynik Ca/Cr' : 'Oblicz ze stężeń', exact: true,
});

async function openCalculator(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//, route => route.abort());
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await guest.waitFor({ state: 'visible' });
  await guest.evaluate(button => button.click());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') &&
    typeof window.applyClcrSessionSnapshot === 'function' && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
}

async function restore(page, fields = {}) {
  expect(await page.evaluate(values => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'CaCr_spot', inputs: {
      currentVersion: 'spot', formulaPicker: 'CaCr_spot', age: '5', ageMonths: '', ageDays: '',
      sex: '', weight: '', height: '', Scr: '', Ca_spot: '', Ca_spot_unit: 'mg/dl',
      Ucr_spot: '', Ucr_spot_unit: 'mg/dl', CaCr_entry_mode: 'concentration',
      CaCr_reported: '', CaCr_reported_unit: 'mg/mg', CaCr_same_specimen: '',
      U_Alb: '', U_Alb_unit: 'mg/L', ACR_entry_mode: 'concentration', ACR_same_specimen: '',
      spotSampleKind: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
      spotMenstruation: false, spotHematuria: false, spotInfection: false,
      spotExercise: false, spotAcuteIllness: false, ...values,
    },
  }, { source: 'e2e-cacr-fictional', update: true, dispatchEvents: false, preserveAcrossVersions: true }), fields)).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'CaCr_spot' &&
    document.getElementById('formulaPicker').value === 'CaCr_spot' && window.clcrIsResetting !== true);
  await expect(mode(page)).toBeVisible();
}

async function expectResult(page, { raw, unit = 'mg/mg', tone = 'warning', status = 'above', category, norm } = {}) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  if (raw !== undefined) await expect.poll(async () => Number(await card(page).getAttribute('data-clcr-value'))).toBeCloseTo(raw, 8);
  await expect(card(page).locator('.clcr-result-value')).toHaveCount(1);
  await expect(card(page).locator('.clcr-result-unit')).toHaveText(unit);
  await expect(card(page)).toHaveAttribute('data-clcr-tone', tone);
  const result = await snapshot(page);
  expect(result.status).toBe(status);
  if (category !== undefined) expect(result.category).toBe(category);
  if (norm !== undefined) expect(await normNumbers(page)).toEqual(norm);
  expect(await card(page).getAttribute('data-clcr-category') || '').not.toMatch(/^A[123]$/);
  await expect(card(page).locator('[data-clcr-category-control]')).toHaveCount(0);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  return result;
}

async function openDetails(page) {
  if (await details(page).getAttribute('open') === null) await kliknij(details(page).locator(':scope > summary'));
  await expect(details(page)).toHaveAttribute('open', '');
  return details(page);
}

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const value = await page.evaluate(() => {
    const box = selector => {
      const element = document.querySelector(selector);
      if (!element?.getClientRects().length) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, width: rect.width, top: rect.top + scrollY, bottom: rect.bottom + scrollY };
    };
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('.cacr-input-card'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'),
      modeButtons: [...document.querySelectorAll('.cacr-mode-switch button')].map(button => {
        const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height };
      }),
      fields: [...document.querySelectorAll('.cacr-entry-fields input, .cacr-entry-fields select')]
        .filter(element => element.getClientRects().length && !element.closest('[hidden]'))
        .map(element => ({ id: element.id, kind: element.tagName, x: element.getBoundingClientRect().x,
          width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
          font: parseFloat(getComputedStyle(element).fontSize) })),
    };
  });
  expect(value.overflow).toBeLessThanOrEqual(1);
  expect(value.inputCard).not.toBeNull();
  expect(Math.abs(value.inputCard.top - value.activePanel.bottom - 16), 'Rytm nagłówka i pól').toBeLessThanOrEqual(1);
  expect(Math.abs(value.form.width - value.inputCard.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(value.clear.width - value.inputCard.width)).toBeLessThanOrEqual(1);
  expect(value.modeButtons).toHaveLength(2);
  expect(Math.abs(value.modeButtons[0].width - value.modeButtons[1].width)).toBeLessThanOrEqual(0.5);
  for (const button of value.modeButtons) expect(button.height).toBeGreaterThanOrEqual(48);
  for (const field of value.fields) {
    expect(field.height, field.id).toBeGreaterThanOrEqual(48);
    expect(field.font, `${field.id}: bez autozoomu`).toBeGreaterThanOrEqual(16);
    expect(field.x).toBeGreaterThanOrEqual(0);
    expect(field.x + field.width).toBeLessThanOrEqual(width + 1);
  }
  if (width < 980) expect(value.report.top - value.clear.bottom).toBeGreaterThanOrEqual(19);
  else expect(Math.abs(value.report.top - value.activePanel.top), 'Wyrównane kolumny desktop').toBeLessThanOrEqual(1);
  return value;
}

function sameWidths(before, after) {
  for (const key of ['form', 'inputCard', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), `${key}: stała szerokość`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), `${key}: wspólna lewa krawędź`).toBeLessThanOrEqual(0.5);
  }
  for (const field of after.fields) {
    const original = before.fields.find(item => item.kind === field.kind);
    expect(original).toBeTruthy();
    expect(Math.abs(original.x - field.x), `${field.id}: kolumna`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(original.width - field.width), `${field.id}: szerokość kolumny`).toBeLessThanOrEqual(0.5);
  }
}

async function captureSave(page, date) {
  return page.evaluate(async clinicalDateISO => {
    const api = window.ClcrVisitSave;
    const originalVault = window.VildaVault;
    const rawNotes = [], notes = [];
    const points = api.collectActiveDatapoints(document, { formulaId: 'CaCr_spot' });
    window.VildaVault = { isUnlocked: () => true, savePatientNote: async note => {
      rawNotes.push(JSON.parse(JSON.stringify(note)));
      notes.push({ ...note, body: originalVault.sanitizeNoteText(note.body), labResult: originalVault.sanitizeLabResult(note.labResult) });
    } };
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'fictional-cacr-e2e-only', clinicalDateISO, root: document, formulaId: 'CaCr_spot' });
      window.__cacrSyntheticNotes = [...(window.__cacrSyntheticNotes || []), ...notes];
      return { outcome, points, rawNotes, notes, vaultLocked: !originalVault.isUnlocked() };
    } finally { window.VildaVault = originalVault; }
  }, date);
}

async function normNumbers(page) {
  const text = await card(page).locator('.clcr-result-reference-value').innerText();
  return (text.match(/\d+(?:[,.]\d+)?/g) || []).map(value => Number(value.replace(',', '.')));
}

async function expectReferenceFits(page) {
  const fit = await card(page).evaluate(node => {
    const reference = node.querySelector('.clcr-result-reference').getBoundingClientRect();
    const patient = node.querySelector('.clcr-result-patient').getBoundingClientRect();
    const glyphs = selector => {
      const range = document.createRange(); range.selectNodeContents(node.querySelector(selector));
      return [...range.getClientRects()].map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }));
    };
    return { reference: { left: reference.left, right: reference.right },
      patient: { left: patient.left, right: patient.right },
      normGlyphs: glyphs('.clcr-result-reference-value'), patientGlyphs: glyphs('.clcr-result-value'),
      patientFont: parseFloat(getComputedStyle(node.querySelector('.clcr-result-value')).fontSize),
      referenceFont: parseFloat(getComputedStyle(node.querySelector('.clcr-result-reference-value')).fontSize) };
  });
  for (const glyph of fit.normGlyphs) {
    expect(glyph.left, 'Norma nie wykracza poza swoją kolumnę').toBeGreaterThanOrEqual(fit.reference.left - 0.5);
    expect(glyph.right, 'Każdy wiersz pełnej normy mieści się w kolumnie').toBeLessThanOrEqual(fit.reference.right + 0.5);
  }
  for (const glyph of fit.patientGlyphs) expect(glyph.right).toBeLessThanOrEqual(fit.patient.right + 0.5);
  expect(fit.patient.right, 'Wynik i norma nie nachodzą na siebie').toBeLessThanOrEqual(fit.reference.left + 0.5);
  expect(fit.patientFont, 'Wynik pacjenta jest większy od normy').toBeGreaterThan(fit.referenceFont);
}

for (const width of [1440, 390, 320]) {
  test(`Ca/Cr ${width}px: minimalny formularz i stałe krawędzie wszystkich trybów oraz pełnych norm`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page);
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await mode(page).evaluate(button => button.nextElementSibling?.textContent.trim())).toBe('Gotowy wynik Ca/Cr');
    await expect(page.locator('#Ca_spot')).toBeVisible();
    await expect(page.locator('#Ucr_spot')).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    const initial = await geometry(page, width);
    await page.locator('#Ca_spot').fill('40');
    await page.locator('#Ucr_spot').fill('100');
    const result = await expectResult(page, { raw: 0.4, norm: [0.01, 0.3], category: 'above' });
    expect(result.context).toMatchObject({ ageYears: 5, sameSpecimen: 'assumed', sampleType: '', confounders: [] });
    expect(result.profileId).toBe('MAYO_CACR3_RANDOM_2026_10');
    await expect(card(page).locator('.clcr-result-reference-label')).toHaveText('Norma dla wieku');
    const colors = await card(page).evaluate(node => ({
      patient: getComputedStyle(node.querySelector('.clcr-result-value')).color,
      unit: getComputedStyle(node.querySelector('.clcr-result-unit')).color,
      status: getComputedStyle(node.querySelector('.clcr-result-interpretation')).color,
      reference: ['.clcr-result-patient-label', '.clcr-result-reference-label',
        '.clcr-result-reference-value', '.clcr-result-reference-unit'].map(selector => getComputedStyle(node.querySelector(selector)).color),
    }));
    expect(colors.patient).toBe('rgb(154, 91, 0)');
    expect(colors.unit).toBe(colors.patient);
    expect(colors.status).toBe(colors.patient);
    for (const color of colors.reference) expect(color, 'Norma i etykiety są neutralne').not.toBe(colors.patient);
    await expectReferenceFits(page);
    sameWidths(initial, await geometry(page, width));
    await kliknij(page.locator('#cacrSampleInfo > summary'));
    await expect(page.locator('#ui_cacr_known_problem')).toBeVisible();
    await expect(page.locator('#cacrSampleInfo select:visible')).toHaveCount(1);
    const contextSize = await page.locator('#ui_cacr_known_problem').evaluate(node => ({
      font: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height,
    }));
    expect(contextSize.font).toBeGreaterThanOrEqual(16);
    expect(contextSize.height).toBeGreaterThanOrEqual(48);
    sameWidths(initial, await geometry(page, width));
    await kliknij(page.locator('#cacrSampleInfo > summary'));
    await kliknij(mode(page, true));
    await expect(page.locator('#CaCr_reported')).toBeVisible();
    await expect(page.locator('#Ca_spot')).toBeHidden();
    for (const [unit, value] of [['mg/mg', '0.4'], ['g/g', '0.4'], ['mg/g', '400'],
      ['mg/mmol', '45.248'], ['mol/mol', '1.129'], ['mmol/mmol', '1.129'], ['mmol/mol', '1129']]) {
      await page.locator('#CaCr_reported_unit').selectOption(unit);
      await page.locator('#CaCr_reported').fill(value);
      await expectResult(page, { raw: Number(value), unit, category: 'above' });
      expect(await normNumbers(page), 'Obie granice pełnej normy pozostają widoczne').toHaveLength(2);
      await expectReferenceFits(page);
      sameWidths(initial, await geometry(page, width));
    }
    await openDetails(page);
    await expect(details(page)).toContainText(/Mayo|CACR3/);
    sameWidths(initial, await geometry(page, width));
    for (const unit of ['mg/mg', 'g/g', 'mg/g', 'mg/mmol', 'mol/mol', 'mmol/mmol', 'mmol/mol']) {
      await page.locator('#CaCr_reported_unit').selectOption(unit);
      await page.locator('#CaCr_reported').fill('12345678.12345678');
      await expectResult(page, { unit, category: 'above' });
      sameWidths(initial, await geometry(page, width));
      await expectReferenceFits(page);
    }
    await page.locator('#CaCr_reported').fill('-1');
    await expect(card(page)).toHaveCount(0);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#CaCr_reported').fill('');
    await expect(card(page)).toHaveCount(0);
    sameWidths(initial, await geometry(page, width));
    await kliknij(mode(page));
    await expectResult(page, { raw: 0.4, norm: [0.01, 0.3] });
    const path = testInfo.outputPath(`cacr-${width}-production.png`);
    await page.locator('#clcrWorkspace').screenshot({ path, animations: 'disabled', style: '#mobileBottomDock,#scrollTopBtn{visibility:hidden!important}' });
    await testInfo.attach('CaCr-production', { path, contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('CaCr_spot'));
    await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'CaCr_spot' && window.clcrIsResetting !== true);
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#Ca_spot')).toHaveValue('');
    await expect(page.locator('#CaCr_reported')).toHaveValue('');
    await expect(card(page)).toHaveCount(0);
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('Ca/Cr: wapń 40 mg/dL jest dopuszczalny, jednostki są równoważne, zero różni się od braku danych', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { Ca_spot: '40', Ucr_spot: '100' });
  await expectResult(page, { raw: 0.4 });
  for (const [unit, value] of [['mg/L', '400'], ['mmol/L', '9.980537950995558'], ['mg/dl', '40']]) {
    await page.locator('#Ca_spot_unit').selectOption(unit);
    await page.locator('#Ca_spot').fill(value);
    await expectResult(page, { raw: 0.4 });
  }
  for (const [unit, value] of [['umol', '8840.16973125884'], ['mmol/L', '8.84016973125884'], ['mg/dl', '100']]) {
    await page.locator('#Ucr_spot_unit').selectOption(unit);
    await page.locator('#Ucr_spot').fill(value);
    await expectResult(page, { raw: 0.4 });
  }
  await page.locator('#Ca_spot').fill('0');
  await expectResult(page, { raw: 0, status: 'below', category: 'below' });
  for (const value of ['', '-1']) {
    await page.locator('#Ca_spot').fill(value);
    await expect(card(page)).toHaveCount(0);
  }
  await page.locator('#Ca_spot').fill('40');
  for (const value of ['0', '-1', '']) {
    await page.locator('#Ucr_spot').fill(value);
    await expect(card(page)).toHaveCount(0);
  }
  // Dokładna fizyczna równoważność bez zaokrąglonej odwrotności Cr:
  // 339,36 mg/L Ca oraz 10 mmol/L Cr leżą dokładnie na górnej granicy 0,30.
  await page.locator('#Ca_spot_unit').selectOption('mg/L');
  await page.locator('#Ca_spot').fill('339.36');
  await page.locator('#Ucr_spot_unit').selectOption('mmol/L');
  await page.locator('#Ucr_spot').fill('10');
  await expectResult(page, { raw: 0.3, tone: 'success', status: 'within', category: 'within' });
});

test('Ca/Cr: siedem jednostek raportu zachowuje natywną wartość i oddzielne serie po rzeczywistym sanitizerze', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { CaCr_entry_mode: 'direct' });
  const cases = [['mg/mg', '0.4'], ['g/g', '0.4'], ['mg/g', '400'], ['mg/mmol', '45.248'],
    ['mol/mol', '1.129'], ['mmol/mmol', '1.129'], ['mmol/mol', '1129']];
  for (const [unit, value] of cases) {
    await page.locator('#CaCr_reported_unit').selectOption(unit);
    await page.locator('#CaCr_reported').fill(value);
    await expectResult(page, { raw: Number(value), unit, category: 'above' });
    const saved = await captureSave(page, '2026-10-24');
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
    expect(saved.notes).toEqual(saved.rawNotes);
    expect(saved.notes[0].labResult).toMatchObject({ valueNum: Number(value), unit });
    expect(saved.notes[0].body).toMatch(/Mayo|CACR3/);
    expect(saved.vaultLocked).toBe(true);
  }
  const series = await page.evaluate(() => {
    const engine = window.VildaClcrCacr;
    window.VildaClcrCacr = { evaluate: () => { throw new Error('Historia nie może ponownie liczyć dawnej próbki'); } };
    try { return window.ClcrVisitSave.buildSeriesFromNotes(window.__cacrSyntheticNotes, { formulaId: 'CaCr_spot' }); }
    finally { window.VildaClcrCacr = engine; }
  });
  expect(series.map(row => row.unit).sort()).toEqual(cases.map(row => row[0]).sort());
  expect(series.every(row => row.points.length === 1)).toBe(true);
});

test('Ca/Cr: 0,30001 i 0,00999 zachowują stronę granicy oraz surową wartość po zapisie i w historii', async ({ page }) => {
  await openCalculator(page);
  for (const [calcium, raw, category, boundary, date] of [
    ['30.001', 0.30001, 'above', '>0,3', '2026-10-20'],
    ['0.999', 0.00999, 'below', '<0,01', '2026-10-21'],
  ]) {
    await restore(page, { Ca_spot: calcium, Ucr_spot: '100' });
    await expectResult(page, { raw, category, status: category, norm: [0.01, 0.3] });
    await expect(card(page)).toHaveAttribute('data-clcr-boundary', boundary);
    const saved = await captureSave(page, date);
    expect(saved.points).toHaveLength(1);
    expect(saved.points[0]).toMatchObject({ valueNum: raw, unit: 'mg/mg',
      cacrSnapshot: { schema: 'clcr-cacr', rawValue: raw, category, status: category, context: { ageYears: 5 } } });
    expect(saved.notes).toEqual(saved.rawNotes);
    expect(saved.notes[0].labResult.valueNum).toBe(raw);
    expect(saved.notes[0].body).toContain(String(raw).replace('.', ','));
  }
  await restore(page, { age: '', CaCr_entry_mode: 'direct', CaCr_reported: '0.4' });
  await expectResult(page, { raw: 0.4, tone: 'neutral', status: 'unassessed', category: null });
  const saved = await captureSave(page, '2026-10-22');
  expect(saved.points[0].outOfRange).toBeNull();
  expect(saved.notes[0].labResult.norm || '').toBe('');
  const series = await page.evaluate(() => window.ClcrVisitSave.buildSeriesFromNotes(window.__cacrSyntheticNotes, { formulaId: 'CaCr_spot' }));
  expect(series).toHaveLength(1);
  expect(series[0].norm).toBe('');
  expect(series[0].points.map(point => point.valueNum)).toEqual([0.30001, 0.00999, 0.4]);
  expect(series[0].points[0]).toMatchObject({ assessment: 'above', outOfRange: true });
  expect(series[0].points[1]).toMatchObject({ assessment: 'below', outOfRange: true });
  expect(series[0].points[2]).toMatchObject({ assessment: 'unassessed', outOfRange: null, norm: '' });
});

test('Ca/Cr: nierówności nie tworzą dokładnych punktów, a zamknięte końce normy pozostają rozróżnialne', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { CaCr_entry_mode: 'direct' });
  for (const [value, tone, status] of [['<0.01', 'warning', 'below'], ['≤0.01', 'neutral', 'unassessed'],
    ['>0.3', 'warning', 'above'], ['≥0.3', 'neutral', 'unassessed'], ['<0.4', 'neutral', 'unassessed']]) {
    await page.locator('#CaCr_reported').fill(value);
    await expectResult(page, { tone, status });
    await expect(card(page).locator('.clcr-result-value')).toContainText(value[0]);
    const saved = await captureSave(page, '2026-10-24');
    expect(saved.notes).toEqual(saved.rawNotes);
    expect(saved.notes[0].labResult.value).toContain(value[0]);
    expect(saved.notes[0].labResult).not.toHaveProperty('valueNum');
    expect(saved.points[0].comparator).toBe(value[0]);
  }
  const history = await page.evaluate(() => {
    const series = window.ClcrVisitSave.buildSeriesFromNotes(window.__cacrSyntheticNotes, { formulaId: 'CaCr_spot' });
    return { points: series.flatMap(row => row.points), trends: series.map(row => window.ClcrVisitSave.seriesTrend(row.points)) };
  });
  expect(history.points.every(point => point.valueNum == null)).toBe(true);
  expect(history.trends.every(trend => trend === null)).toBe(true);
  await page.locator('#CaCr_reported').fill('0,30001');
  await expectResult(page, { raw: 0.30001, category: 'above' });
  await expect(card(page).locator('.clcr-result-value')).toHaveText('0,30001');
});

test('Ca/Cr: dokładne granice wieku i oba końce Mayo, bez normy zastępczej dla noworodka i wieku ponad 83 lata', async ({ page }) => {
  await openCalculator(page);
  for (const [age, months, low, high] of [
    ['0', '1', 0.03, 0.81], ['1', '', 0.03, 0.56], ['2', '', 0.02, 0.5],
    ['3', '', 0.02, 0.41], ['5', '', 0.01, 0.3], ['7', '', 0.01, 0.25],
    ['10', '', 0.01, 0.24], ['18', '', 0.05, 0.27], ['83', '', 0.05, 0.27],
  ]) {
    for (const endpoint of [low, high]) {
      await restore(page, { age, ageMonths: months, CaCr_entry_mode: 'direct', CaCr_reported: String(endpoint) });
      await expectResult(page, { raw: endpoint, norm: [low, high], tone: 'success', status: 'within', category: 'within' });
    }
  }
  for (const [age, months] of [['', ''], ['0', '0'], ['83', '1'], ['84', '']]) {
    await restore(page, { age, ageMonths: months, CaCr_entry_mode: 'direct', CaCr_reported: '0.4' });
    await expectResult(page, { raw: 0.4, tone: 'neutral', status: 'unassessed', category: null });
    await expect(card(page).locator('.clcr-result-reference-value')).toHaveCount(0);
    await expect(card(page)).toContainText(/wiek|mies|83/);
  }
});

test('Ca/Cr: znane różne próbki blokują iloraz, bezpośredni raport działa, nowy pacjent nie dziedziczy faktów', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { Ca_spot: '40', Ucr_spot: '100', ui_spotSameSpecimen_answer: 'no',
    spotSampleKind: 'random', spotInfection: true, spotExercise: true,
    ui_spotInfection_answer: 'yes', ui_spotExercise_answer: 'yes' });
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#clcrResultReport')).toContainText(/różn.*prób/);
  await kliknij(mode(page, true));
  await page.locator('#CaCr_reported').fill('0.4');
  await expectResult(page, { raw: 0.4, category: 'above' });
  expect((await snapshot(page)).context).toMatchObject({ sameSpecimen: 'not-applicable', sampleType: 'random' });
  expect((await snapshot(page)).context.confounders).toEqual(expect.arrayContaining(['infection', 'exercise']));
  await expect(await openDetails(page)).toContainText(/infekcj|zakażeni/);
  expect(await page.evaluate(() => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'CaCr_spot', inputs: {
      currentVersion: 'spot', formulaPicker: 'CaCr_spot', age: '5', Ca_spot: '40', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl',
    },
  }, { source: 'e2e-cacr-next-fictional-patient', update: true, dispatchEvents: false, preserveAcrossVersions: true }))).toBe(true);
  await expectResult(page, { raw: 0.4, category: 'above' });
  expect((await snapshot(page)).context).toMatchObject({ sameSpecimen: 'assumed', confounders: [], sampleType: '' });
  const fields = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(fields.CaCr_same_specimen).toBe('');
  expect(fields.ui_spotSameSpecimen_answer || '').toBe('');
  expect(fields.spotInfection).toBe(false);
  expect(fields.spotExercise).toBe(false);
  expect(fields.ui_spotInfection_answer || '').toBe('');
  expect(fields.ui_spotExercise_answer || '').toBe('');
  // Nowe zgłoszenie poprzez rzeczywisty selektor zapisuje fakt kanoniczny.
  // Powrót do opcji bez odpowiedzi nie może go potajemnie wymazać.
  if (await page.locator('#cacrSampleInfo').getAttribute('open') === null) await kliknij(page.locator('#cacrSampleInfo > summary'));
  await page.locator('#ui_cacr_known_problem').selectOption('different');
  await expect(card(page)).toHaveCount(0);
  expect((await page.evaluate(() => window.buildClcrSessionSnapshot().inputs)).CaCr_same_specimen).toBe('different');
  await page.locator('#ui_cacr_known_problem').selectOption('');
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#CaCr_same_specimen')).toBeVisible();
  await expect(page.locator('#CaCr_same_specimen')).toHaveValue('different');
  await page.locator('#CaCr_same_specimen').selectOption('confirmed');
  await expectResult(page, { raw: 0.4, category: 'above' });
  expect((await snapshot(page)).context).toMatchObject({ sameSpecimen: 'confirmed', confounders: [] });
});

test('Ca/Cr ↔ PCR ↔ ACR: wspólna kreatynina i kanoniczny kontekst wracają bez klonów i bez utraty danych', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { Ca_spot: '40', U_Prot_spot: '300', U_Prot_spot_unit: 'mg/L', U_Alb: '45',
    Ucr_spot: '8.84', Ucr_spot_unit: 'mmol/L', PCR_entry_mode: 'concentration', PCR_same_specimen: '',
    spotSampleKind: 'random', spotInfection: true });
  // CaCr używa zadeklarowanej masy molowej Cr113,12, ACR/PCR zachowują88,4.
  // Sprawdzamy wartości każdej ścieżki dla tej samej zachowanej próbki SI,
  // zamiast nazywać przybliżone przeliczenia identycznymi współczynnikami.
  await expectResult(page, { raw: 0.4000076801474588 });
  for (const [formula, raw] of [['PCR', 300], ['ACR', 45], ['CaCr_spot', 0.4000076801474588]]) {
    await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formula);
    await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formula);
    await expect(page.locator('#Ucr_spot')).toHaveCount(1);
    await expect(page.locator('#Ucr_spot')).toBeVisible();
    await expect(page.locator('#Ucr_spot')).toHaveValue('8.84');
    await expect(page.locator('#Ucr_spot_unit')).toHaveValue('mmol/L');
    await expect(page.locator('#spotInfection')).toBeChecked();
    const output = page.locator(`#clcrResultReport .clcr-result-card[data-clcr-series="${formula}"]`);
    await expect(output).toBeVisible();
    expect(Number(await output.getAttribute('data-clcr-value'))).toBeCloseTo(raw, 8);
  }
  expect((await snapshot(page)).context.confounders).toContain('infection');
  await expect(page.locator('#Ca_spot')).toHaveValue('40');
  await expect(card(page)).toHaveAttribute('data-clcr-tone', 'warning');
});

test('Ca/Cr telefon: edycja znanego wieku zachowuje fokus i zmienia pełną normę 0,56 → 0,41 → 0,30', async ({ page }) => {
  await openCalculator(page, 390);
  await restore(page, { age: '1', Ca_spot: '40', Ucr_spot: '100' });
  await expectResult(page, { raw: 0.4, norm: [0.03, 0.56], tone: 'success', status: 'within' });
  const edit = page.locator('.cacr-patient-age__edit');
  await kliknij(edit);
  for (const id of ['age', 'ageMonths']) {
    const size = await page.locator(`#${id}`).evaluate(node => ({ font: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height }));
    expect(size.font).toBeGreaterThanOrEqual(16);
    expect(size.height).toBeGreaterThanOrEqual(48);
  }
  await page.locator('#age').fill('3');
  await expect(page.locator('#age')).toBeFocused();
  await expectResult(page, { raw: 0.4, norm: [0.02, 0.41], tone: 'success', status: 'within' });
  await page.locator('#age').fill('5');
  await expect(page.locator('#age')).toBeFocused();
  await expectResult(page, { raw: 0.4, norm: [0.01, 0.3] });
  await kliknij(edit);
  await expect(page.locator('#age')).toBeHidden();
});

test('Ca/Cr: pusty domyślny tryb nie tworzy wyniku ani ostrzeżenia o wieku', async ({ page }) => {
  await openCalculator(page);
  await expect(page.locator('#CaCr_entry_mode')).toHaveAttribute('type', 'hidden');
  await expect(page.locator('#CaCr_entry_mode')).toHaveValue('concentration');
  await expect(page.locator('#age')).toHaveValue('');
  await expect(page.locator('#formulaPicker')).toHaveValue('');
  await page.evaluate(() => window.clcrUpdate());
  await czekajNaUstabilizowanyUklad(page);
  await expect(page.locator('#clcrInfo')).toBeEmpty();
  await expect(page.locator('.clcr-result-card:visible')).toHaveCount(0);
  await expect(page.locator('#clcrResultReport')).not.toContainText(/Wiek:\s*podaj pełne lata i miesiące/);
});

