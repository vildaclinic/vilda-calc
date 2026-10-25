import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';

// Wyłącznie fikcyjne dane. Sejf produkcyjny pozostaje zablokowany; test zapisu
// używa adaptera w pamięci i rzeczywistych sanitizerów tekstu/notatki.
const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="CitCr_spot"]');
const details = page => page.locator('#clcrResultReport .clcr-result-details[data-clcr-formula="CitCr_spot"]');
const snapshot = async page => JSON.parse(await card(page).getAttribute('data-clcr-citcr-snapshot'));
const mode = (page, direct = false) => page.getByRole('button', { name: direct ? 'Gotowy wynik Cit/Cr' : 'Oblicz ze stężeń', exact: true });

async function openCalculator(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//, route => route.abort());
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await guest.waitFor({ state: 'visible' });
  await guest.evaluate(button => button.click());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') && typeof window.applyClcrSessionSnapshot === 'function' &&
    Boolean(window.VildaClcrCitcr && window.ClcrCitcrUi && window.ClcrVisitSave) && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
}

async function applySession(page, session) {
  expect(await page.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-citcr-fictional', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'CitCr_spot' &&
    document.getElementById('formulaPicker').value === 'CitCr_spot' && window.clcrIsResetting !== true);
  await expect(mode(page)).toBeVisible();
}

async function restore(page, fields = {}) {
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'CitCr_spot', inputs: {
    currentVersion: 'spot', formulaPicker: 'CitCr_spot', age: '8', ageMonths: '', ageDays: '', sex: '',
    weight: '', height: '', Scr: '', Cit_Cr_spot: '', Cit_Cr_spot_unit: 'umol/L', citrateSpotReportingEntity: 'unknown',
    Ucr_spot: '', Ucr_spot_unit: 'mmol/L', CitCr_entry_mode: 'concentration',
    CitCr_reported: '', CitCr_reported_unit: 'umol/mmol', CitCr_reported_basis: 'unknown', CitCr_same_specimen: '',
    spotSampleKind: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
    spotMenstruation: false, spotHematuria: false, spotInfection: false, spotExercise: false, spotAcuteIllness: false,
    ...fields,
  } });
}

async function expectResult(page, { raw, unit = 'µmol/mmol', tone = 'warning', status = 'below', reference = true } = {}) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  if (raw !== undefined) await expect.poll(async () => Number(await card(page).getAttribute('data-clcr-value'))).toBeCloseTo(raw, 10);
  await expect(card(page).locator('.clcr-result-value')).toHaveCount(1);
  await expect(card(page).locator('.clcr-result-unit')).toHaveText(unit);
  await expect(card(page)).toHaveAttribute('data-clcr-tone', tone);
  const result = await snapshot(page);
  expect(result.status).toBe(status); expect(result.referenceAvailable).toBe(reference);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  return result;
}

async function openDetails(page) {
  if (await details(page).getAttribute('open') === null) await kliknij(details(page).locator(':scope > summary'));
  return details(page);
}

async function selectBasis(page, basis, direct = false, leaveOpen = false) {
  const editor = page.locator(direct ? '#citcrReportedBasisDetails' : '#citcrCitrateBasisDetails');
  await expect(editor).toBeVisible();
  if (await editor.getAttribute('open') === null) await kliknij(editor.locator(':scope > summary'));
  await page.locator(direct ? '#CitCr_reported_basis' : '#citrateSpotReportingEntity').selectOption(basis);
  if (!leaveOpen) await kliknij(editor.locator(':scope > summary'));
}

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const value = await page.evaluate(() => {
    const visible = node => node.checkVisibility();
    const box = selector => {
      const node = document.querySelector(selector); if (!node || !visible(node)) return null;
      const r = node.getBoundingClientRect(); return { x: r.x, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('.citcr-input-card'),
      clear: box('#clearBtn'), report: box('#clcrResultReport'),
      modeButtons: [...document.querySelectorAll('.citcr-mode-switch button')].map(node => {
        const r = node.getBoundingClientRect(); return { width: r.width, height: r.height };
      }),
      fields: [...document.querySelectorAll('.citcr-input-card input,.citcr-input-card select')].filter(visible).map(node => {
        const r = node.getBoundingClientRect(); return { id: node.id, height: r.height, font: parseFloat(getComputedStyle(node).fontSize), x: r.x, right: r.right };
      }),
    };
  });
  expect(value.overflow).toBeLessThanOrEqual(1);
  expect(value.inputCard).not.toBeNull();
  expect(Math.abs(value.inputCard.top - value.activePanel.bottom - 16)).toBeLessThanOrEqual(1);
  expect(Math.abs(value.form.width - value.inputCard.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(value.clear.width - value.inputCard.width)).toBeLessThanOrEqual(1);
  expect(value.modeButtons).toHaveLength(2);
  expect(Math.abs(value.modeButtons[0].width - value.modeButtons[1].width)).toBeLessThanOrEqual(0.5);
  for (const button of value.modeButtons) expect(button.height).toBeGreaterThanOrEqual(48);
  for (const field of value.fields) {
    expect(field.height, field.id).toBeGreaterThanOrEqual(48); expect(field.font, field.id).toBeGreaterThanOrEqual(16);
    expect(field.x, field.id).toBeGreaterThanOrEqual(0); expect(field.right, field.id).toBeLessThanOrEqual(width + 1);
  }
  if (width < 980) expect(value.report.top - value.clear.bottom).toBeGreaterThanOrEqual(20);
  else expect(Math.abs(value.report.top - value.activePanel.top)).toBeLessThanOrEqual(1);
  return value;
}

function sameWidths(before, after) {
  for (const key of ['form', 'inputCard', 'clear', 'report']) {
    expect(Math.abs(before[key].width - after[key].width), `${key}: stała szerokość`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(before[key].x - after[key].x), `${key}: wspólna krawędź`).toBeLessThanOrEqual(0.5);
  }
}

async function expectReferenceFits(page) {
  const fit = await card(page).evaluate(node => {
    const rect = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right }; };
    const glyphs = selector => { const range = document.createRange(); range.selectNodeContents(node.querySelector(selector)); return [...range.getClientRects()].map(r => ({ left: r.left, right: r.right })); };
    return { patient: rect(node.querySelector('.clcr-result-patient')), reference: rect(node.querySelector('.clcr-result-reference')),
      value: glyphs('.clcr-result-value'), norm: glyphs('.clcr-result-reference-value'),
      valueFont: parseFloat(getComputedStyle(node.querySelector('.clcr-result-value')).fontSize), normFont: parseFloat(getComputedStyle(node.querySelector('.clcr-result-reference-value')).fontSize) };
  });
  for (const glyph of fit.value) { expect(glyph.left).toBeGreaterThanOrEqual(fit.patient.left - 0.5); expect(glyph.right).toBeLessThanOrEqual(fit.patient.right + 0.5); }
  for (const glyph of fit.norm) { expect(glyph.left).toBeGreaterThanOrEqual(fit.reference.left - 0.5); expect(glyph.right).toBeLessThanOrEqual(fit.reference.right + 0.5); }
  expect(fit.patient.right).toBeLessThanOrEqual(fit.reference.left + 0.5); expect(fit.valueFont).toBeGreaterThan(fit.normFont);
}

async function expectTableCellTextFits(page) {
  const measured = await details(page).evaluate(node => {
    const cells = [...node.querySelectorAll('th,td')].filter(cell => cell.checkVisibility());
    return { cellCount: cells.length, clipped: cells.flatMap(cell => {
      const boundary = cell.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(cell);
      return [...range.getClientRects()].filter(rect => rect.left < boundary.left - 0.5 || rect.right > boundary.right + 0.5)
        .map(rect => ({ text: cell.textContent, glyphLeft: rect.left, glyphRight: rect.right, cellLeft: boundary.left, cellRight: boundary.right }));
    }) };
  });
  expect(measured.cellCount).toBeGreaterThanOrEqual(12);
  expect(measured.clipped, 'Tekst każdej widocznej komórki mieści się wewnątrz niej, także przy overflow:hidden').toEqual([]);
}

async function captureSave(page, date) {
  return page.evaluate(async clinicalDateISO => {
    const api = window.ClcrVisitSave, originalVault = window.VildaVault, rawNotes = [], notes = [];
    const points = api.collectActiveDatapoints(document, { formulaId: 'CitCr_spot' });
    window.VildaVault = { isUnlocked: () => true, savePatientNote: async note => {
      rawNotes.push(JSON.parse(JSON.stringify(note)));
      notes.push({ ...note, body: originalVault.sanitizeNoteText(note.body), labResult: originalVault.sanitizeLabResult(note.labResult) });
    } };
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'fictional-citcr-e2e-only', clinicalDateISO, root: document, formulaId: 'CitCr_spot' });
      window.__citcrSyntheticNotes = [...(window.__citcrSyntheticNotes || []), ...notes];
      return { outcome, points, rawNotes, notes, vaultLocked: !originalVault.isUnlocked() };
    } finally { window.VildaVault = originalVault; }
  }, date);
}

for (const width of [1440, 390, 320]) {
  test(`Cit/Cr ${width}px: cztery jednostki, opcjonalna postać i stały układ jednego wyniku`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width); await restore(page);
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await mode(page).evaluate(node => node.nextElementSibling?.textContent.trim())).toBe('Gotowy wynik Cit/Cr');
    await expect(page.locator('#Cit_Cr_spot')).toHaveAccessibleName(/Cytryniany w moczu/);
    await expect(page.locator('#Cit_Cr_spot_unit option')).toHaveText(['µmol/L', 'mmol/L', 'mg/L', 'mg/dL']);
    await expect(page.locator('#citcrCitrateBasisDetails')).toBeHidden(); await expect(card(page)).toHaveCount(0);
    const initial = await geometry(page, width);
    await page.locator('#Cit_Cr_spot_unit').selectOption('mg/dL'); await selectBasis(page, 'acid', false, true);
    await page.locator('#Cit_Cr_spot').fill('10'); await page.locator('#Ucr_spot_unit').selectOption('mg/dl'); await page.locator('#Ucr_spot').fill('100');
    const result = await expectResult(page, { raw: 0.1, unit: 'mg/mg' });
    expect(result.context).toMatchObject({ ageYears: 8, sameSpecimen: 'assumed', confounders: [] });
    await expect(card(page).locator('.clcr-result-reference-label')).toHaveText('Norma dla wieku');
    await expect(card(page)).toContainText('słabszą ochronę przed kamicą wapniową');
    await expect(page.locator('#citcrCitrateBasisDetails > summary')).toContainText('kwas cytrynowy bezwodny');
    await expectReferenceFits(page); sameWidths(initial, await geometry(page, width));
    const colors = await card(page).evaluate(node => ({ value: getComputedStyle(node.querySelector('.clcr-result-value')).color,
      status: getComputedStyle(node.querySelector('.clcr-result-interpretation')).color, norm: getComputedStyle(node.querySelector('.clcr-result-reference-value')).color }));
    expect(colors.value).toBe('rgb(154, 91, 0)'); expect(colors.status).toBe(colors.value); expect(colors.norm).not.toBe(colors.value);
    await kliknij(mode(page, true)); await expect(page.locator('#CitCr_reported')).toHaveAccessibleName(/Cit\/Cr/);
    await expect(page.locator('#CitCr_reported_unit option')).toHaveCount(7);
    for (const [unit, value] of [['umol/mmol', '100'], ['mmol/mol', '100'], ['mmol/mmol', '0.1'], ['mol/mol', '0.1'], ['mg/mg', '0.1'], ['mg/g', '100'], ['mg/mmol', '11.312']]) {
      await page.locator('#CitCr_reported_unit').selectOption(unit);
      if (unit.startsWith('mg/')) await selectBasis(page, 'acid', true);
      else await expect(page.locator('#citcrReportedBasisDetails')).toBeHidden();
      await page.locator('#CitCr_reported').fill(value);
      await expectResult(page, { raw: Number(value), unit: unit.replace('umol', 'µmol') });
      await expectReferenceFits(page); sameWidths(initial, await geometry(page, width));
    }
    await openDetails(page); await expect(details(page)).toContainText('PathWest'); await expect(details(page)).toContainText('Newcastle');
    await expect(details(page)).not.toContainText('Źródło progów: EAU'); sameWidths(initial, await geometry(page, width));
    if (width === 320) {
      await restore(page, { age: '30', sex: 'F', CitCr_entry_mode: 'direct', CitCr_reported: '50', CitCr_reported_unit: 'mg/mmol', CitCr_reported_basis: 'acid' });
      await expectResult(page, { raw: 50, unit: 'mg/mmol', tone: 'success', status: 'within' });
      await openDetails(page); await expectTableCellTextFits(page); sameWidths(initial, await geometry(page, width));
    }
    await kliknij(page.locator('#clearBtn')); await page.waitForFunction(() => window.clcrIsResetting !== true);
    await expect(page.locator('#Cit_Cr_spot_unit')).toHaveValue('umol/L'); await expect(page.locator('#Ucr_spot_unit')).toHaveValue('mmol/L');
    await expect(page.locator('#citrateSpotReportingEntity')).toHaveValue('unknown'); await expect(page.locator('#CitCr_reported_basis')).toHaveValue('unknown');
    await expect(card(page)).toHaveCount(0); await expect(page.locator('#clcrResultRail')).not.toContainText('EAU');
    sameWidths(initial, await geometry(page, width));
    await testInfo.attach(`citcr-${width}-geometry`, { body: JSON.stringify(await geometry(page, width)), contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
}

test('Cit/Cr: zero, małe wartości i równoważna duża kreatynina nie giną w walidacji ani zaokrągleniu', async ({ page }) => {
  await openCalculator(page); await restore(page, { Cit_Cr_spot: '600', Ucr_spot: '600', Ucr_spot_unit: 'mg/dl' });
  const first = await snapshot(page);
  await page.locator('#Ucr_spot_unit').selectOption('umol'); await page.locator('#Ucr_spot').fill('53041.01838755304');
  expect((await snapshot(page)).rawValue).toBeCloseTo(first.rawValue, 10);
  await page.locator('#Cit_Cr_spot').fill('0'); await expectResult(page, { raw: 0 });
  await page.locator('#Cit_Cr_spot_unit').selectOption('mg/dL'); await selectBasis(page, 'acid');
  await page.locator('#Ucr_spot_unit').selectOption('mg/dl'); await page.locator('#Ucr_spot').fill('100');
  await page.locator('#Cit_Cr_spot').fill('0.0049');
  const small = await expectResult(page, { raw: 0.000049, unit: 'mg/mg' }); expect(Number(small.display.value)).toBeGreaterThan(0);
  const saved = await captureSave(page, '2026-10-24'); expect(saved.points[0].valueNum).toBe(0.000049); expect(saved.notes[0].labResult.valueNum).toBe(0.000049);
  await page.locator('#Cit_Cr_spot').fill('1e-12');
  const scientific = await snapshot(page); expect(scientific.rawValue).toBe(1e-14); expect(Number(scientific.display.value)).toBe(1e-14);
  await page.locator('#Cit_Cr_spot').fill(''); await expect(card(page)).toHaveCount(0);
  await page.locator('#Cit_Cr_spot').fill('1');
  for (const value of ['0', '-1', '']) { await page.locator('#Ucr_spot').fill(value); await expect(card(page)).toHaveCount(0); }
});

test('Cit/Cr: dzieci mają ścisłe dolne progi od urodzenia, bez górnej granicy ani obowiązku podania miesięcy', async ({ page }) => {
  await openCalculator(page);
  for (const [age, months, low] of [['0', '', 300], ['2', '11', 300], ['3', '', 100], ['17', '11', 100]]) {
    await restore(page, { age, ageMonths: months, CitCr_entry_mode: 'direct', CitCr_reported: String(low) });
    const equal = await expectResult(page, { raw: low });
    expect(equal.reference).toMatchObject({ nativeLow: low, nativeHigh: null, lowerInclusive: false });
    await page.locator('#CitCr_reported').fill(String(low + 0.000001)); await expectResult(page, { raw: low + 0.000001, status: 'within', tone: 'success' });
    await page.locator('#CitCr_reported').fill('1000000'); await expectResult(page, { raw: 1000000, status: 'within', tone: 'success' });
  }
  await restore(page, { age: '', CitCr_entry_mode: 'direct', CitCr_reported: '100' });
  await expectResult(page, { raw: 100, reference: false, tone: 'neutral', status: 'unassessed' });
});

test('Cit/Cr: wiek zero z pustymi miesiącami ma normę od urodzenia i nie pokazuje błędu dodatkowych danych', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { age: '0', ageMonths: '', CitCr_entry_mode: 'direct', CitCr_reported: '301' });
  const result = await expectResult(page, { raw: 301, tone: 'success', status: 'within' });
  expect(result.context.ageYears).toBe(0);
  expect(result.reference).toMatchObject({ nativeLow: 300, nativeHigh: null, lowerInclusive: false });
  await expect(page.locator('.citcr-patient-age')).toContainText('poniżej 1 roku');
  await expect(page.locator('.citcr-patient-age')).not.toContainText('niepodany');
  await kliknij(page.locator('.citcr-patient-age__edit'));
  await expect(page.locator('#age')).toHaveValue('0'); await expect(page.locator('#ageMonths')).toHaveValue('');
  await expect(page.locator('#ageMonths')).not.toHaveClass(/\berror\b/);
  expect(await page.locator('#ageMonths').evaluate(node => node.required)).toBe(false);
  await page.locator('#ageMonths').fill('');
  await expect(page.locator('#clcrResultReport')).not.toContainText(/pole miesięcy jest wymagane|podaj pełne miesiące/);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.hasBlockingValidationError())).toBe(false);
  await expectResult(page, { raw: 301, tone: 'success', status: 'within' });
});

test('Cit/Cr: od 18 lat źródło i zakres zależą od znanej płci, bez wspólnej normy dla braku płci', async ({ page }) => {
  await openCalculator(page);
  for (const [sex, low, high] of [['M', 40, 330], ['F', 110, 550]]) {
    await restore(page, { age: '18', sex, CitCr_entry_mode: 'direct', CitCr_reported: String(low) });
    const result = await expectResult(page, { raw: low, status: 'within', tone: 'success' });
    expect(result.reference).toMatchObject({ nativeLow: low, nativeHigh: high, lowerInclusive: true, upperInclusive: true });
    await expect(page.locator('.clcr-result-source[data-clcr-formula="CitCr_spot"]')).toContainText('Newcastle');
    await page.locator('#CitCr_reported').fill(String(high)); await expectResult(page, { raw: high, status: 'within', tone: 'success' });
    await page.locator('#CitCr_reported').fill(String(high + 0.000001)); await expectResult(page, { raw: high + 0.000001, status: 'above' });
    await page.locator('#CitCr_reported').fill(String(low - 0.000001)); await expectResult(page, { raw: low - 0.000001 });
  }
  await restore(page, { age: '95', sex: '', CitCr_entry_mode: 'direct', CitCr_reported: '100' });
  const unknown = await expectResult(page, { raw: 100, reference: false, tone: 'neutral', status: 'unassessed' });
  expect(unknown.reference).toBeNull(); await expect(card(page)).toContainText(/płeć|płci/);
});

test('Cit/Cr: postać nie zmienia liczby ilorazu masowego, lecz poprawnie zmienia normę; unknown nie zgaduje', async ({ page }) => {
  await openCalculator(page); await restore(page, { Cit_Cr_spot: '16.8', Cit_Cr_spot_unit: 'mg/dL', citrateSpotReportingEntity: 'acid', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl' });
  const acid = await expectResult(page, { raw: 0.168, unit: 'mg/mg' }); expect(acid.reference.lower).toBeCloseTo(0.16984043493635, 12);
  await selectBasis(page, 'ion'); const ion = await expectResult(page, { raw: 0.168, unit: 'mg/mg', status: 'within', tone: 'success' });
  expect(ion.reference.lower).toBeCloseTo(0.16716672560113, 12); expect(ion.rawValue).toBe(acid.rawValue);
  await selectBasis(page, 'unknown'); const unknown = await expectResult(page, { raw: 0.168, unit: 'mg/mg', status: 'unassessed', tone: 'neutral', reference: false });
  expect(unknown.nativeSI).toBeNull(); await expect(card(page)).toContainText(/postać|postaci/);
  await page.locator('#Cit_Cr_spot_unit').selectOption('mg/L'); await expect(page.locator('#citrateSpotReportingEntity')).toHaveValue('unknown');
  await page.locator('#Cit_Cr_spot_unit').selectOption('mmol/L'); await expect(page.locator('#citcrCitrateBasisDetails')).toBeHidden();
});

test('Cit/Cr: Szczegóły stosują jednostkę wyniku, a oryginalne jednostki źródeł wymagają osobnego rozwinięcia', async ({ page }) => {
  await openCalculator(page); await restore(page, { CitCr_entry_mode: 'direct', CitCr_reported: '0.1', CitCr_reported_unit: 'mg/mg', CitCr_reported_basis: 'acid' });
  await expectResult(page, { raw: 0.1, unit: 'mg/mg' }); await openDetails(page);
  const rendered = await details(page).evaluate(node => {
    const main = document.querySelector('#clcrResultReport .clcr-result-reference-value');
    const tables = [...node.querySelectorAll(':scope > table')];
    return { main: main.textContent.replace(/\s/g, ''), tables: tables.map(table => ({ text: table.textContent, selected: [...table.querySelectorAll('tr[aria-current="true"] td')].map(cell => cell.textContent.replace(/\s/g, '')) })),
      closedOriginals: [...node.querySelectorAll('details')].filter(item => /Oryginalne jednostki/.test(item.querySelector('summary')?.textContent || '')).map(item => !item.open) };
  });
  expect(rendered.tables.length).toBeGreaterThan(0);
  expect(rendered.tables.every(table => table.text.includes('mg/mg'))).toBe(true);
  expect(rendered.tables.flatMap(table => table.selected)).toContain(rendered.main);
  expect(rendered.closedOriginals).toEqual([true]);
});

test('Cit/Cr: nierówności oceniają możliwy przedział i nie stają się dokładnymi punktami w historii', async ({ page }) => {
  await openCalculator(page); await restore(page, { CitCr_entry_mode: 'direct' });
  for (const [value, tone, status] of [['≤100', 'warning', 'below'], ['>100', 'success', 'within'], ['≥100', 'neutral', 'unassessed'], ['<101', 'neutral', 'unassessed']]) {
    await page.locator('#CitCr_reported').fill(value); await expectResult(page, { tone, status });
    const saved = await captureSave(page, '2026-10-24');
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 }); expect(saved.notes).toEqual(saved.rawNotes);
    expect(saved.notes[0].labResult.value).toContain(value[0]); expect(saved.notes[0].labResult).not.toHaveProperty('valueNum');
  }
  const series = await page.evaluate(() => window.ClcrVisitSave.buildSeriesFromNotes(window.__citcrSyntheticNotes, { formulaId: 'CitCr_spot' }));
  expect(series.flatMap(item => item.points).every(point => point.valueNum == null)).toBe(true);
  expect(await page.evaluate(() => window.ClcrVisitSave.seriesTrend(window.ClcrVisitSave.buildSeriesFromNotes(window.__citcrSyntheticNotes, { formulaId: 'CitCr_spot' })[0].points))).toBeNull();
  await restore(page, { age: '18', sex: 'M', CitCr_entry_mode: 'direct' });
  for (const [value, tone, status] of [['<40', 'warning', 'below'], ['≤40', 'neutral', 'unassessed'], ['>330', 'warning', 'above'], ['≥330', 'neutral', 'unassessed']]) {
    await page.locator('#CitCr_reported').fill(value); await expectResult(page, { tone, status });
  }
});

test('Cit/Cr: pełny zapis zachowuje precyzję, jednostkę, postać i normę, a historia nie przelicza dawnego wieku', async ({ page }) => {
  await openCalculator(page);
  for (const [unit, basis, value] of [['mg/mg', 'acid', '0.012345'], ['mg/mg', 'ion', '0.012345'], ['mg/mg', 'unknown', '0.012345'], ['mg/g', 'acid', '12.345']]) {
    await restore(page, { CitCr_entry_mode: 'direct', CitCr_reported: value, CitCr_reported_unit: unit, CitCr_reported_basis: basis });
    await expectResult(page, { raw: Number(value), unit, tone: basis === 'unknown' ? 'neutral' : 'warning', status: basis === 'unknown' ? 'unassessed' : 'below', reference: basis !== 'unknown' });
    const saved = await captureSave(page, '2026-10-24');
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 }); expect(saved.notes).toEqual(saved.rawNotes); expect(saved.vaultLocked).toBe(true);
    expect(saved.notes[0].labResult).toMatchObject({ valueNum: Number(value), unit });
    expect(Number(saved.notes[0].labResult.value.replace(',', '.'))).toBe(Number(value));
    expect(saved.points[0].outOfRange).toBe(basis === 'unknown' ? null : true);
    expect(saved.notes[0].body).toContain('clcr:CitCr_spot'); expect(saved.notes[0].body).toContain('8');
  }
  await restore(page, { Cit_Cr_spot: '0.0499', Cit_Cr_spot_unit: 'mg/dL', citrateSpotReportingEntity: 'acid', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl' });
  await expectResult(page, { raw: 0.000499, unit: 'mg/mg' }); const small = await captureSave(page, '2026-10-25');
  expect(small.notes[0].labResult.valueNum).toBe(0.000499);
  await restore(page, { age: '95', sex: '', CitCr_entry_mode: 'direct', CitCr_reported: '0.1', CitCr_reported_unit: 'mg/mg', CitCr_reported_basis: 'acid' });
  await expectResult(page, { raw: 0.1, unit: 'mg/mg', reference: false, status: 'unassessed', tone: 'neutral' }); await captureSave(page, '2026-10-26');
  const series = await page.evaluate(() => {
    const engine = window.VildaClcrCitcr; window.VildaClcrCitcr = { evaluate: () => { throw new Error('Dawnego wyniku nie wolno przeliczać'); } };
    try { return window.ClcrVisitSave.buildSeriesFromNotes(window.__citcrSyntheticNotes, { formulaId: 'CitCr_spot' }); }
    finally { window.VildaClcrCitcr = engine; }
  });
  expect(series).toHaveLength(4); expect(series.flatMap(item => item.points)).toHaveLength(6);
  expect(series.filter(item => item.unit === 'mg/mg')).toHaveLength(3);
  const acidSeries = series.find(item => item.unit === 'mg/mg' && item.points.some(point => point.dateISO === '2026-10-26'));
  expect(acidSeries.norm).toBe(''); expect(acidSeries.points.at(-1).outOfRange).toBeNull();
  expect(acidSeries.points[0].norm).not.toBe('');
});

test('Cit/Cr: znane różne próbki blokują stężenia, lecz gotowy wskaźnik zachowuje osobną ocenę', async ({ page }) => {
  await openCalculator(page); await restore(page, { Cit_Cr_spot: '100', Ucr_spot: '1',
    spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'no', spotInfection: true });
  await expect(card(page)).toHaveCount(0); await expect(page.locator('#clcrResultReport')).toContainText(/różn.*prób/);
  await kliknij(mode(page, true)); await page.locator('#CitCr_reported').fill('100');
  const direct = await expectResult(page, { raw: 100 });
  expect(direct.context.sameSpecimen).toBe('not-applicable'); expect(direct.context.confounders).toContain('infection');
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'CitCr_spot', inputs: {
    currentVersion: 'spot', formulaPicker: 'CitCr_spot', age: '8', Cit_Cr_spot: '100', Cit_Cr_spot_unit: 'umol/L', Ucr_spot: '1', Ucr_spot_unit: 'mmol/L',
  } });
  const next = await expectResult(page, { raw: 100 }); expect(next.context).toMatchObject({ sameSpecimen: 'assumed', confounders: [], sampleType: '' });
});

test('Cit/Cr: otwarty edytor wieku oddaje tę samą płeć szerokiemu panelowi, który respektuje jawne różne próbki', async ({ page }) => {
  await openCalculator(page);
  await restore(page, { age: '30', sex: 'F', Cit_Cr_spot: '10', Cit_Cr_spot_unit: 'mg/dL',
    citrateSpotReportingEntity: 'acid', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl' });
  await expectResult(page, { raw: 0.1, unit: 'mg/mg' });
  await kliknij(page.locator('.citcr-patient-age__edit'));
  await expect(page.locator('#sex')).toBeVisible(); await expect(page.locator('#sex')).toHaveValue('F');
  await page.evaluate(() => {
    window.__citcrOriginalSexControl = document.getElementById('sex');
    window.__CLCR_TEST_LEGACY_BROAD = true;
    document.getElementById('formulaPicker').value = '';
    window.applyVersion('spot'); window.clcrUpdate();
  });
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.legacyBroad === true);
  await expect(page.locator('#sex')).toHaveCount(1); await expect(page.locator('#sex')).toBeVisible();
  await expect(page.locator('#sex')).toHaveValue('F');
  expect(await page.evaluate(() => document.getElementById('sex') === window.__citcrOriginalSexControl)).toBe(true);
  const blocked = await page.evaluate(() => {
    // Nowy formularz nie tworzy rutynowego pytania o wspólną próbkę.
    // Starszą jawną odpowiedź odtwarza rzeczywisty importer sesji.
    const session = window.buildClcrSessionSnapshot();
    session.selectedFormula = ''; session.inputs.formulaPicker = '';
    session.inputs.spotSameSpecimen = true; session.inputs.ui_spotSameSpecimen_answer = 'no';
    session.inputs.CitCr_same_specimen = '';
    const applied = window.applyClcrSessionSnapshot(session, {
      source: 'e2e-citcr-legacy-broad-fictional', update: true, dispatchEvents: false, preserveAcrossVersions: true,
    });
    document.getElementById('spotSameSpecimen').checked = true;
    window.clcrUpdate();
    return { applied, legacyBroad: window.ClcrUiWorkflow.state.legacyBroad,
      evaluation: window.evaluateClcrCitcr({ concentrationOnly: true }) };
  });
  expect(blocked).toMatchObject({ applied: true, legacyBroad: true, evaluation: { valid: false, reasonCode: 'different-specimens' } });
  await expect(page.locator('[data-clcr-series="CitCr_spot"]')).toHaveCount(0);
  await expect(page.locator('#Cit_Cr_spot')).toHaveValue('10'); await expect(page.locator('#Ucr_spot')).toHaveValue('100');
  const direct = await page.evaluate(() => {
    document.getElementById('CitCr_entry_mode').value = 'direct';
    document.getElementById('CitCr_reported').value = '200';
    document.getElementById('CitCr_reported_unit').value = 'umol/mmol';
    return window.evaluateClcrCitcr();
  });
  expect(direct).toMatchObject({ valid: true, mode: 'direct', rawValue: 200, status: 'within', context: { sameSpecimen: 'not-applicable' } });
  await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('CitCr_spot'));
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.legacyBroad === false && window.ClcrUiWorkflow.state.activeFormulaId === 'CitCr_spot');
  await expect(mode(page, true)).toHaveAttribute('aria-pressed', 'true');
  await expectResult(page, { raw: 200, tone: 'success', status: 'within' });
  await expect(page.locator('#sex')).toHaveCount(1); await expect(page.locator('#sex')).toHaveValue('F');
});

test('Cit/Cr: niepełna i preserved-only sesja jawnie odtwarza stężenia; puste pole ma pierwszeństwo', async ({ page }) => {
  await openCalculator(page); await restore(page, { Cit_Cr_spot: '1.2345', Cit_Cr_spot_unit: 'mg/dL', citrateSpotReportingEntity: 'acid', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl' });
  const base = { currentVersion: 'spot', formulaPicker: 'CitCr_spot', age: '8' };
  for (const fields of [{ Ucr_spot: '200' }, { Cit_Cr_spot: '2' }, {}]) {
    await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'CitCr_spot', inputs: { ...base, ...fields } });
    await expect(page.locator('#Cit_Cr_spot')).toHaveValue(fields.Cit_Cr_spot || '');
    await expect(page.locator('#Ucr_spot')).toHaveValue(fields.Ucr_spot || ''); await expect(card(page)).toHaveCount(0);
  }
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'CitCr_spot',
    inputs: { ...base }, preservedInputs: { Cit_Cr_spot: '3', Ucr_spot: '400', Ucr_spot_unit: 'mg/dl' } });
  await expect(page.locator('#Cit_Cr_spot')).toHaveValue('3'); await expect(page.locator('#Ucr_spot')).toHaveValue('400');
  await expectResult(page, { raw: 0.0075, unit: 'mg/mg' });
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'CitCr_spot',
    inputs: { ...base, Cit_Cr_spot: '' }, preservedInputs: { Cit_Cr_spot: '3', Ucr_spot: '400' } });
  await expect(page.locator('#Cit_Cr_spot')).toHaveValue(''); await expect(card(page)).toHaveCount(0);
});

test('Cit/Cr: publiczne odświeżenie nie przywraca stężenia z poprzedniego DOM', async ({ page }) => {
  await openCalculator(page); await restore(page, { Cit_Cr_spot: '1.2345', Cit_Cr_spot_unit: 'mg/dL', citrateSpotReportingEntity: 'acid', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl' });
  expect(await page.evaluate(() => {
    const persistence = window.VildaPersistence;
    try {
      window.VildaPersistence = { readClcrSession: () => ({ version: 2, currentVersion: 'spot', selectedFormula: 'CitCr_spot',
        inputs: { currentVersion: 'spot', formulaPicker: 'CitCr_spot', age: '8', Ucr_spot: '200' } }), writeClcrSession: () => true };
      return window.__vildaClcrRehydrate();
    } finally { window.VildaPersistence = persistence; }
  })).toBe(true);
  await expect(page.locator('#Cit_Cr_spot')).toHaveValue(''); await expect(page.locator('#Ucr_spot')).toHaveValue('200'); await expect(card(page)).toHaveCount(0);
});

test('Cit/Cr: starsza sesja zachowuje historyczną konwencję kwasu cytrynowego mg/dL', async ({ page }) => {
  await openCalculator(page);
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'CitCr_spot', inputs: {
    currentVersion: 'spot', formulaPicker: 'CitCr_spot', age: '8', Cit_Cr_spot: '10', Ucr_spot: '100',
  } });
  await expect(page.locator('#Cit_Cr_spot_unit')).toHaveValue('mg/dL'); await expect(page.locator('#citrateSpotReportingEntity')).toHaveValue('acid');
  await expect(page.locator('#Ucr_spot_unit')).toHaveValue('mg/dl'); const legacy = await expectResult(page, { raw: 0.1, unit: 'mg/mg' });
  expect(legacy.input.citrateValue).toBe('10'); expect(legacy.input.citrateUnit).toBe('mg/dL:acid');
});

test('Cit/Cr ↔ Ox/Cr ↔ Ca/Cr ↔ PCR: wspólna kreatynina ma jeden DOM i zachowuje jawnie wpisane stężenie', async ({ page }) => {
  await openCalculator(page); await restore(page, { Cit_Cr_spot: '100', Ucr_spot: '10', Ucr_spot_unit: 'mmol/L', Ox_Cr_spot: '100', Ox_Cr_spot_unit: 'umol/L', Ca_spot: '40', Ca_spot_unit: 'mg/dl', U_Prot_spot: '300', U_Prot_spot_unit: 'mg/L' });
  await expectResult(page, { raw: 10 });
  for (const formula of ['OxCr_spot', 'CaCr_spot', 'PCR', 'CitCr_spot']) {
    await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formula);
    await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formula);
    await expect(page.locator('#Ucr_spot')).toHaveCount(1); await expect(page.locator('#Ucr_spot')).toHaveValue('10'); await expect(page.locator('#Ucr_spot_unit')).toHaveValue('mmol/L');
  }
  await expect(page.locator('#Cit_Cr_spot')).toHaveValue('100'); await expectResult(page, { raw: 10 });
});

test('Cit/Cr: znana zbiórka czasowa zachowuje liczbę bez normy próbki punktowej i bez zielonej oceny', async ({ page }) => {
  await openCalculator(page); await restore(page, { Cit_Cr_spot: '100', Ucr_spot: '1', spotSampleKind: 'timed' });
  const result = await expectResult(page, { raw: 100, tone: 'neutral', status: 'unassessed', reference: false });
  expect(result.context.sampleType).toBe('timed'); await expect(card(page)).toContainText(/zbiór|punktow|losow/);
  const saved = await captureSave(page, '2026-10-24'); expect(saved.points[0].outOfRange).toBeNull(); expect(saved.notes[0].labResult.norm || '').toBe('');
});
