import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';

// Fikcyjne dane i produkcyjny DOM. Zapis przechwytuje wyłącznie adapter w pamięci;
// sanitizer pochodzi z prawdziwego, przez cały test zablokowanego modułu sejfu.
const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="PCR"]');
const details = page => page.locator('#clcrResultReport .clcr-result-details[data-clcr-formula="PCR"]');
const snapshot = async page => JSON.parse(await card(page).getAttribute('data-clcr-pcr-snapshot'));
const mode = (page, direct = false) => page.getByRole('button', {
  name: direct ? 'Gotowy wynik PCR' : 'Oblicz ze stężeń', exact: true,
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
    version: 2, currentVersion: 'spot', selectedFormula: 'PCR', inputs: {
      currentVersion: 'spot', formulaPicker: 'PCR', age: '10', ageMonths: '', ageDays: '',
      sex: '', weight: '', height: '', Scr: '', U_Prot_spot: '', U_Prot_spot_unit: 'mg/L',
      Ucr_spot: '', Ucr_spot_unit: 'mg/dl', PCR_entry_mode: 'concentration',
      PCR_reported: '', PCR_reported_unit: 'mg/g', PCR_same_specimen: '',
      U_Alb: '', U_Alb_unit: 'mg/L', ACR_entry_mode: 'concentration', ACR_same_specimen: '',
      spotSampleKind: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
      spotMenstruation: false, spotHematuria: false, spotInfection: false,
      spotExercise: false, spotAcuteIllness: false, ...values,
    },
  }, { source: 'e2e-pcr-fictional', update: true, dispatchEvents: false, preserveAcrossVersions: true }), fields)).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'PCR' &&
    document.getElementById('formulaPicker').value === 'PCR' && window.clcrIsResetting !== true);
  await expect(mode(page)).toBeVisible();
}

async function expectResult(page, { raw, unit = 'mg/g', tone = 'warning', status = 'above', category, norm } = {}) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  if (raw !== undefined) await expect.poll(async () => Number(await card(page).getAttribute('data-clcr-value'))).toBeCloseTo(raw, 8);
  await expect(card(page).locator('.clcr-result-value')).toHaveCount(1);
  await expect(card(page).locator('.clcr-result-unit')).toHaveText(unit);
  await expect(card(page)).toHaveAttribute('data-clcr-tone', tone);
  const result = await snapshot(page);
  expect(result.status).toBe(status);
  if (category !== undefined) expect(result.category).toBe(category);
  if (norm !== undefined) await expect(card(page).locator('.clcr-result-reference-value')).toHaveText(norm);
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
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('.pcr-input-card'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'),
      modeButtons: [...document.querySelectorAll('.pcr-mode-switch button')].map(button => {
        const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height };
      }),
      fields: [...document.querySelectorAll('.pcr-entry-fields input, .pcr-entry-fields select')]
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
    const points = api.collectActiveDatapoints(document, { formulaId: 'PCR' });
    window.VildaVault = { isUnlocked: () => true, savePatientNote: async note => {
      rawNotes.push(JSON.parse(JSON.stringify(note)));
      notes.push({ ...note, body: originalVault.sanitizeNoteText(note.body), labResult: originalVault.sanitizeLabResult(note.labResult) });
    } };
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'fictional-pcr-e2e-only', clinicalDateISO, root: document, formulaId: 'PCR' });
      window.__pcrSyntheticNotes = [...(window.__pcrSyntheticNotes || []), ...notes];
      return { outcome, points, rawNotes, notes, vaultLocked: !originalVault.isUnlocked() };
    } finally { window.VildaVault = originalVault; }
  }, date);
}

for (const width of [1440, 390, 320]) {
  test(`PCR ${width}px: domyślne dwa stężenia i stały, symetryczny układ każdego trybu`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restore(page);
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await mode(page).evaluate(button => button.nextElementSibling?.textContent.trim())).toBe('Gotowy wynik PCR');
    await expect(page.locator('#U_Prot_spot')).toBeVisible();
    await expect(page.locator('#Ucr_spot')).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    const initial = await geometry(page, width);
    await page.locator('#U_Prot_spot').fill('300');
    await page.locator('#Ucr_spot').fill('100');
    const result = await expectResult(page, { raw: 300, norm: '<200', category: 'raised' });
    expect(result.context).toMatchObject({ ageYears: 10, sameSpecimen: 'assumed', sampleType: '', confounders: [] });
    expect(result.profileId).toBe('KDIGO_PCR_2024_2025');
    await expect(card(page).locator('.clcr-result-reference-label')).toHaveText('Norma dla wieku');
    await expect(card(page).locator('.clcr-result-value')).toHaveCSS('color', 'rgb(154, 91, 0)');
    const fonts = await card(page).evaluate(node => ({
      patient: parseFloat(getComputedStyle(node.querySelector('.clcr-result-value')).fontSize),
      norm: parseFloat(getComputedStyle(node.querySelector('.clcr-result-reference-value')).fontSize),
    }));
    expect(fonts.patient, 'Wartość pacjenta ma pierwszeństwo przed normą').toBeGreaterThan(fonts.norm);
    const colors = await card(page).evaluate(node => ({
      patient: getComputedStyle(node.querySelector('.clcr-result-value')).color,
      unit: getComputedStyle(node.querySelector('.clcr-result-unit')).color,
      status: getComputedStyle(node.querySelector('.clcr-result-interpretation')).color,
      reference: ['.clcr-result-patient-label', '.clcr-result-reference-label',
        '.clcr-result-reference-value', '.clcr-result-reference-unit'].map(selector => getComputedStyle(node.querySelector(selector)).color),
    }));
    expect(colors.unit).toBe(colors.patient);
    expect(colors.status).toBe(colors.patient);
    for (const color of colors.reference) expect(color, 'Etykiety i norma mają neutralny kolor').not.toBe(colors.patient);
    sameWidths(initial, await geometry(page, width));
    await kliknij(page.locator('#pcrSampleInfo > summary'));
    await expect(page.locator('#ui_pcr_known_problem')).toBeVisible();
    await expect(page.locator('#pcrSampleInfo select:visible')).toHaveCount(1);
    sameWidths(initial, await geometry(page, width));
    for (const field of await page.locator('#pcrSampleInfo select:visible').all()) {
      const size = await field.evaluate(node => ({ font: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height }));
      expect(size.font).toBeGreaterThanOrEqual(16);
      expect(size.height).toBeGreaterThanOrEqual(48);
    }
    await kliknij(page.locator('#pcrSampleInfo > summary'));
    await kliknij(mode(page, true));
    await expect(page.locator('#PCR_reported')).toBeVisible();
    await expect(page.locator('#U_Prot_spot')).toBeHidden();
    sameWidths(initial, await geometry(page, width));
    for (const [unit, value, norm] of [['mg/g', '300', '<200'], ['mg/mmol', '20', '<20'], ['mg/mg', '0.2', '<0,2'], ['g/g', '0.2', '<0,2']]) {
      await page.locator('#PCR_reported_unit').selectOption(unit);
      await page.locator('#PCR_reported').fill(value);
      await expectResult(page, { raw: Number(value), unit, norm });
      sameWidths(initial, await geometry(page, width));
    }
    // Nowy profil dorosły ma dłuższą granicę <0,15 w raportach mg/mg i g/g.
    // Sprawdzamy prawdziwe glify w kolumnie, a nie tylko szerokość kontenera.
    await kliknij(page.locator('.pcr-patient-age__edit'));
    await page.locator('#age').fill('18');
    await kliknij(page.locator('.pcr-patient-age__edit'));
    for (const unit of ['mg/mg', 'g/g']) {
      await page.locator('#PCR_reported_unit').selectOption(unit);
      await page.locator('#PCR_reported').fill('0.2');
      await expectResult(page, { raw: 0.2, unit, norm: '<0,15', category: 'raised' });
      sameWidths(initial, await geometry(page, width));
      const fit = await card(page).evaluate(node => {
        const reference = node.querySelector('.clcr-result-reference').getBoundingClientRect();
        const patient = node.querySelector('.clcr-result-patient').getBoundingClientRect();
        const glyphs = selector => {
          const range = document.createRange();
          range.selectNodeContents(node.querySelector(selector));
          const rect = range.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        };
        return { reference: { left: reference.left, right: reference.right },
          patient: { left: patient.left, right: patient.right },
          normGlyphs: glyphs('.clcr-result-reference-value'), patientGlyphs: glyphs('.clcr-result-value') };
      });
      expect(fit.normGlyphs.left).toBeGreaterThanOrEqual(fit.reference.left - 0.5);
      expect(fit.normGlyphs.right, 'Cała norma <0,15 mieści się w kolumnie').toBeLessThanOrEqual(fit.reference.right + 0.5);
      expect(fit.patientGlyphs.right).toBeLessThanOrEqual(fit.patient.right + 0.5);
      expect(fit.patient.right).toBeLessThanOrEqual(fit.reference.left + 0.5);
    }
    await kliknij(page.locator('.pcr-patient-age__edit'));
    await page.locator('#age').fill('10');
    await kliknij(page.locator('.pcr-patient-age__edit'));
    const expanded = await openDetails(page);
    await expect(expanded).toContainText(/nerczyc|nerczykow/);
    await expect(expanded).toContainText(/zaokrągl|przybliż/);
    sameWidths(initial, await geometry(page, width));
    await page.locator('#PCR_reported_unit').selectOption('mg/g');
    await page.locator('#PCR_reported').fill('12345678');
    await expectResult(page, { raw: 12345678, tone: 'danger', category: 'nephrotic' });
    sameWidths(initial, await geometry(page, width));
    await kliknij(mode(page));
    await expectResult(page, { raw: 300 });
    const path = testInfo.outputPath(`pcr-${width}-production.png`);
    await page.locator('#clcrWorkspace').screenshot({ path, animations: 'disabled', style: '#mobileBottomDock,#scrollTopBtn{visibility:hidden!important}' });
    await testInfo.attach('PCR-production', { path, contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn'));
    await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expect(page.locator('#U_Prot_spot')).toHaveValue('');
    await expect(page.locator('#PCR_reported')).toHaveValue('');
    await expect(card(page)).toHaveCount(0);
    await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('PCR'));
    await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'PCR' && window.clcrIsResetting !== true);
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'true');
    sameWidths(initial, await geometry(page, width));
    expect(errors).toEqual([]);
  });
}

test('PCR: stężenia w trzech jednostkach, zero białka oraz brak dzielenia przez zero', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_Prot_spot: '300', Ucr_spot: '100' });
  await expectResult(page, { raw: 300 });
  for (const [unit, value] of [['mg/dL', '30'], ['g/L', '0.3'], ['mg/L', '300']]) {
    await page.locator('#U_Prot_spot_unit').selectOption(unit);
    await page.locator('#U_Prot_spot').fill(value);
    await expectResult(page, { raw: 300 });
  }
  for (const [unit, value] of [['umol', '8840'], ['mmol/L', '8.84'], ['mg/dl', '100']]) {
    await page.locator('#Ucr_spot_unit').selectOption(unit);
    await page.locator('#Ucr_spot').fill(value);
    await expectResult(page, { raw: 300 });
  }
  await page.locator('#U_Prot_spot').fill('0');
  await expectResult(page, { raw: 0, tone: 'success', status: 'within', category: 'normal' });
  for (const value of ['0', '-1', '']) {
    await page.locator('#Ucr_spot').fill(value);
    await expect(card(page)).toHaveCount(0);
  }
});

test('PCR: natywne progi SI oraz mg/mg i g/g zachowują jednostkę raportu', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { PCR_entry_mode: 'direct' });
  for (const [unit, value, norm] of [['mg/g', '200', '<200'], ['mg/mmol', '20', '<20'], ['mg/mg', '0.2', '<0,2'], ['g/g', '0.2', '<0,2']]) {
    await page.locator('#PCR_reported_unit').selectOption(unit);
    await page.locator('#PCR_reported').fill(value);
    await expectResult(page, { raw: Number(value), unit, norm, category: 'raised' });
    const saved = await captureSave(page, '2026-10-23');
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 });
    expect(saved.notes).toEqual(saved.rawNotes);
    expect(saved.notes[0].labResult).toMatchObject({ valueNum: Number(value), unit });
    expect(saved.vaultLocked).toBe(true);
  }
  const series = await page.evaluate(() => window.ClcrVisitSave.buildSeriesFromNotes(window.__pcrSyntheticNotes, { formulaId: 'PCR' }));
  expect(series.map(row => row.unit).sort()).toEqual(['g/g', 'mg/g', 'mg/mg', 'mg/mmol'].sort());
  expect(series.every(row => row.points.length === 1)).toBe(true);
  await restore(page, { age: '18', PCR_entry_mode: 'direct', PCR_reported: '15', PCR_reported_unit: 'mg/mmol' });
  await expectResult(page, { raw: 15, unit: 'mg/mmol', norm: '<15', category: 'raised' });
  await restore(page, { age: '1', PCR_entry_mode: 'direct', PCR_reported: '50', PCR_reported_unit: 'mg/mmol' });
  await expectResult(page, { raw: 50, unit: 'mg/mmol', norm: '<50', category: 'raised' });
});

test('PCR: granice 199,96 i 1999,96 nie tracą dokładności w karcie, zapisie ani historii', async ({ page }) => {
  await openCalculator(page);
  for (const [protein, status, category, tone, boundary, date] of [
    ['199.96', 'within', 'normal', 'success', '<200', '2026-10-20'],
    ['1999.96', 'above', 'raised', 'warning', '<2000', '2026-10-21'],
    ['2000', 'above', 'nephrotic', 'danger', '', '2026-10-22'],
  ]) {
    await restore(page, { U_Prot_spot: protein, Ucr_spot: '100' });
    await expectResult(page, { raw: Number(protein), status, category, tone, norm: '<200' });
    if (boundary) await expect(card(page)).toHaveAttribute('data-clcr-boundary', boundary);
    const saved = await captureSave(page, date);
    expect(saved.points).toHaveLength(1);
    expect(saved.points[0]).toMatchObject({ valueNum: Number(protein), unit: 'mg/g',
      pcrSnapshot: { rawValue: Number(protein), category, status, boundary, context: { ageYears: 10 } } });
    expect(saved.notes).toEqual(saved.rawNotes);
    expect(saved.notes[0].labResult.valueNum).toBe(Number(protein));
    expect(saved.notes[0].body).toContain(protein.replace('.', ','));
    expect(saved.vaultLocked).toBe(true);
  }
  await restore(page, { age: '', PCR_entry_mode: 'direct', PCR_reported: '300' });
  await expectResult(page, { raw: 300, status: 'unassessed', tone: 'neutral' });
  const latest = await captureSave(page, '2026-10-23');
  expect(latest.points[0]).toMatchObject({ norm: '', outOfRange: null });
  expect(latest.notes).toEqual(latest.rawNotes);
  const history = await page.evaluate(() => {
    const engine = window.VildaClcrPcr;
    window.VildaClcrPcr = { evaluate() { throw new Error('Historia nie może oceniać zapisanych wyników ponownie'); } };
    try { return window.ClcrVisitSave.buildSeriesFromNotes(window.__pcrSyntheticNotes, { formulaId: 'PCR' }); }
    finally { window.VildaClcrPcr = engine; }
  });
  expect(history).toHaveLength(1);
  expect(history[0].norm).toBe('');
  expect(history[0].points.map(point => point.valueNum)).toEqual([199.96, 1999.96, 2000, 300]);
  expect(history[0].points[0]).toMatchObject({ assessment: 'within', outOfRange: false });
  expect(history[0].points[2]).toMatchObject({ category: 'nephrotic', outOfRange: true });
  expect(history[0].points[3]).toMatchObject({ assessment: 'unassessed', outOfRange: null, norm: '' });
});

test('PCR: nierówności pozostają przedziałami, a dokładny raport mg/mg nie jest zaokrąglany do progu', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { PCR_entry_mode: 'direct' });
  for (const [value, tone, status] of [['<200', 'success', 'within'], ['≤200', 'neutral', 'unassessed'], ['≥2000', 'danger', 'above']]) {
    await page.locator('#PCR_reported').fill(value);
    await expectResult(page, { tone, status });
    await expect(card(page).locator('.clcr-result-value')).toContainText(value[0]);
    const saved = await captureSave(page, '2026-10-23');
    expect(saved.notes).toEqual(saved.rawNotes);
    expect(saved.notes[0].labResult.value).toContain(value[0]);
    expect(saved.notes[0].labResult).not.toHaveProperty('valueNum');
    expect(saved.points[0].comparator).toBe(value[0]);
  }
  const trend = await page.evaluate(() => {
    const series = window.ClcrVisitSave.buildSeriesFromNotes(window.__pcrSyntheticNotes, { formulaId: 'PCR' });
    return window.ClcrVisitSave.seriesTrend(series[0].points);
  });
  expect(trend).toBeNull();
  await page.locator('#PCR_reported_unit').selectOption('mg/mg');
  await page.locator('#PCR_reported').fill('0,19996');
  await expectResult(page, { raw: 0.19996, unit: 'mg/mg', tone: 'success', status: 'within' });
  await expect(card(page).locator('.clcr-result-value')).toHaveText('0,19996');
});

test('PCR: normy 6 i 24 miesięcy, profil dorosły oraz pediatryczny zakres nerczycowy', async ({ page }) => {
  await openCalculator(page);
  for (const [age, months, value, norm, tone, status, category] of [
    ['0', '5', '300', null, 'neutral', 'unassessed', null],
    ['0', '6', '499', '<500', 'success', 'within', 'normal'],
    ['1', '11', '500', '<500', 'warning', 'above', 'raised'],
    ['2', '', '200', '<200', 'warning', 'above', 'raised'],
    ['18', '', '150', '<150', 'warning', 'above', 'raised'],
    ['18', '', '500', '<150', 'warning', 'above', 'raised'],
    ['18', '', '501', '<150', 'danger', 'above', 'marked'],
    ['0', '6', '3000', '<500', 'warning', 'above', 'raised'],
    ['1', '', '2000', '<500', 'danger', 'above', 'nephrotic'],
    ['17', '', '200', '<20', 'danger', 'above', 'nephrotic'],
  ]) {
    await restore(page, { age, ageMonths: months, PCR_entry_mode: 'direct', PCR_reported: value,
      PCR_reported_unit: age === '17' ? 'mg/mmol' : 'mg/g' });
    await expectResult(page, { raw: Number(value), unit: age === '17' ? 'mg/mmol' : 'mg/g', tone, status, category, ...(norm ? { norm } : {}) });
    if (norm === null) {
      await expect(card(page).locator('.clcr-result-reference-value')).toHaveCount(0);
      await expect(card(page)).toContainText(/6 mies|wieku|pediatr/);
    }
  }
  await restore(page, { age: '', PCR_entry_mode: 'direct', PCR_reported: '300' });
  await expectResult(page, { raw: 300, tone: 'neutral', status: 'unassessed' });
  await expect(card(page)).toContainText(/wiek/i);
});

test('PCR: infekcja zachowuje wysoki sygnał, a równoległa albumina nie usuwa ograniczenia', async ({ page }) => {
  await openCalculator(page);
  for (const albumin of ['', '30']) {
    await restore(page, { U_Prot_spot: '3000', Ucr_spot: '100', U_Alb: albumin });
    if (await page.locator('#pcrSampleInfo').getAttribute('open') === null) await kliknij(page.locator('#pcrSampleInfo > summary'));
    await page.locator('#ui_pcr_known_problem').selectOption('spotInfection');
    await expect(page.locator('#spotInfection')).toBeChecked();
    await expect(page.locator('#ui_pcr_known_problem')).toHaveValue('');
    const result = await expectResult(page, { raw: 3000, tone: 'danger', category: 'nephrotic' });
    expect(result.context.confounders).toContain('infection');
    await expect(card(page)).toContainText(/infekcj|zakażeni/);
    await expect(await openDetails(page)).toContainText(/infekcj|zakażeni/);
    if (albumin) {
      await page.locator('#ui_pcr_known_problem').selectOption('spotExercise');
      expect((await snapshot(page)).context.confounders).toEqual(expect.arrayContaining(['infection', 'exercise']));
      await expect(page.locator('#spotInfection')).toBeChecked();
      await expect(page.locator('#spotExercise')).toBeChecked();
    }
  }
  await restore(page, { U_Prot_spot: '100', Ucr_spot: '100', spotInfection: true });
  await expectResult(page, { raw: 100, tone: 'neutral', status: 'unassessed', norm: '<200' });
  await expect(card(page)).toContainText(/infekcj|zakażeni/);
  const saved = await captureSave(page, '2026-10-23');
  expect(saved.points[0].outOfRange).toBeNull();
  expect(saved.notes[0].body).toMatch(/infekcj|zakażeni/);
  expect(saved.notes).toEqual(saved.rawNotes);
});

test('PCR: starsze różne próbki blokują stężenia, raport bezpośredni działa, kolejny pacjent nie dziedziczy kontekstu', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_Prot_spot: '300', Ucr_spot: '100', ui_spotSameSpecimen_answer: 'no', spotInfection: true });
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#clcrResultReport')).toContainText(/różn.*prób/);
  await kliknij(mode(page, true));
  await page.locator('#PCR_reported').fill('300');
  await expectResult(page, { raw: 300 });
  expect((await snapshot(page)).context.sameSpecimen).toBe('not-applicable');
  expect(await page.evaluate(() => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'PCR', inputs: {
      currentVersion: 'spot', formulaPicker: 'PCR', age: '10', U_Prot_spot: '300',
      Ucr_spot: '100', Ucr_spot_unit: 'mg/dl',
    },
  }, { source: 'e2e-pcr-next-fictional-patient', update: true, dispatchEvents: false, preserveAcrossVersions: true }))).toBe(true);
  await expectResult(page, { raw: 300 });
  expect((await snapshot(page)).context).toMatchObject({ sameSpecimen: 'assumed', confounders: [], sampleType: '' });
  const fields = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(fields.PCR_same_specimen).toBe('');
  expect(fields.ui_spotSameSpecimen_answer || '').toBe('');
  expect(fields.spotInfection).toBe(false);
});

test('PCR ↔ ACR: współdzielona kreatynina i jej jednostka pozostają widoczne i nie zmieniają ilorazu', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { U_Prot_spot: '300', U_Alb: '45', Ucr_spot: '8.84', Ucr_spot_unit: 'mmol/L' });
  await expectResult(page, { raw: 300 });
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('ACR'));
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'ACR' && window.clcrIsResetting !== true);
  await expect(page.locator('#Ucr_spot')).toBeVisible();
  await expect(page.locator('#Ucr_spot')).toHaveValue('8.84');
  await expect(page.locator('#Ucr_spot_unit')).toHaveValue('mmol/L');
  const acr = page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="ACR"]');
  await expect(acr).toBeVisible();
  expect(Number(await acr.getAttribute('data-clcr-value'))).toBeCloseTo(45, 8);
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('PCR'));
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'PCR' && window.clcrIsResetting !== true);
  await expect(page.locator('#U_Prot_spot')).toHaveValue('300');
  await expect(page.locator('#Ucr_spot')).toHaveValue('8.84');
  await expect(page.locator('#Ucr_spot_unit')).toHaveValue('mmol/L');
  await expectResult(page, { raw: 300 });
  const label = page.locator('#Ucr_spot').locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," clcr-field ")][1]').locator('.clcr-field__name');
  await expect(label).toBeVisible();
  await expect(label).toContainText(/Kreatynina.*moczu/);
});

test('PCR telefon: edycja wieku zachowuje fokus i aktualizuje normę 500 → 200 → 150', async ({ page }) => {
  await openCalculator(page, 390);
  await restore(page, { age: '1', U_Prot_spot: '300', Ucr_spot: '100' });
  await expectResult(page, { raw: 300, norm: '<500', tone: 'success', status: 'within' });
  const edit = page.locator('.pcr-patient-age__edit');
  await kliknij(edit);
  for (const id of ['age', 'ageMonths']) {
    const size = await page.locator(`#${id}`).evaluate(node => ({ font: parseFloat(getComputedStyle(node).fontSize), height: node.getBoundingClientRect().height }));
    expect(size.font).toBeGreaterThanOrEqual(16);
    expect(size.height).toBeGreaterThanOrEqual(48);
  }
  await page.locator('#age').fill('2');
  await expect(page.locator('#age')).toBeFocused();
  await expectResult(page, { raw: 300, norm: '<200' });
  await page.locator('#age').fill('18');
  await expect(page.locator('#age')).toBeFocused();
  await expectResult(page, { raw: 300, norm: '<150' });
  await kliknij(edit);
  await expect(page.locator('#age')).toBeHidden();
});

test('PCR: ukryty domyślny tryb na pustej stronie nie tworzy wyniku ani ostrzeżenia wieku', async ({ page }) => {
  await openCalculator(page);
  await expect(page.locator('#PCR_entry_mode')).toHaveAttribute('type', 'hidden');
  await expect(page.locator('#PCR_entry_mode')).toHaveValue('concentration');
  await expect(page.locator('#age')).toHaveValue('');
  await expect(page.locator('#formulaPicker')).toHaveValue('');
  await page.evaluate(() => window.clcrUpdate());
  await czekajNaUstabilizowanyUklad(page);
  await expect(page.locator('#clcrInfo')).toBeEmpty();
  await expect(page.locator('.clcr-result-card:visible')).toHaveCount(0);
  await expect(page.locator('#clcrResultReport')).not.toContainText(/Wiek:\s*podaj pełne lata i miesiące/);
});
