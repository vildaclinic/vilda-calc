import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';

// Wyłącznie fikcyjne próbki. Prawdziwy sejf pozostaje zablokowany; zapis
// przechwytuje adapter w pamięci, a tekst i wynik przechodzą produkcyjny sanitizer.
const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="OxCr_spot"]');
const details = page => page.locator('#clcrResultReport .clcr-result-details[data-clcr-formula="OxCr_spot"]');
const snapshot = async page => JSON.parse(await card(page).getAttribute('data-clcr-oxcr-snapshot'));
const mode = (page, direct = false) => page.getByRole('button', { name: direct ? 'Gotowy wynik Ox/Cr' : 'Oblicz ze stężeń', exact: true });

async function openCalculator(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//, route => route.abort());
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await guest.waitFor({ state: 'visible' });
  await guest.evaluate(button => button.click());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') && typeof window.applyClcrSessionSnapshot === 'function' && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
}

async function restore(page, fields = {}) {
  expect(await page.evaluate(values => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'spot', selectedFormula: 'OxCr_spot', inputs: {
      currentVersion: 'spot', formulaPicker: 'OxCr_spot', age: '8', ageMonths: '', ageDays: '',
      sex: '', weight: '', height: '', Scr: '', Ox_Cr_spot: '', Ox_Cr_spot_unit: 'umol/L',
      Ucr_spot: '', Ucr_spot_unit: 'mmol/L', OxCr_entry_mode: 'concentration',
      OxCr_reported: '', OxCr_reported_unit: 'umol/mmol', OxCr_same_specimen: '',
      oxalateSpotReportingEntity: '', spotSampleKind: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
      spotMenstruation: false, spotHematuria: false, spotInfection: false,
      spotExercise: false, spotAcuteIllness: false, ...values,
    },
  }, { source: 'e2e-oxcr-fictional', update: true, dispatchEvents: false, preserveAcrossVersions: true }), fields)).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'OxCr_spot' && document.getElementById('formulaPicker').value === 'OxCr_spot' && window.clcrIsResetting !== true);
  await expect(mode(page)).toBeVisible();
}

async function expectResult(page, { raw, unit = 'µmol/mmol', tone = 'warning', status = 'above', reference = true } = {}) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  if (raw !== undefined) await expect.poll(async () => Number(await card(page).getAttribute('data-clcr-value'))).toBeCloseTo(raw, 10);
  await expect(card(page).locator('.clcr-result-value')).toHaveCount(1);
  await expect(card(page).locator('.clcr-result-unit')).toHaveText(unit);
  await expect(card(page)).toHaveAttribute('data-clcr-tone', tone);
  const result = await snapshot(page);
  expect(result.status).toBe(status);
  expect(result.referenceAvailable).toBe(reference);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  return result;
}

async function openDetails(page) {
  if (await details(page).getAttribute('open') === null) await kliknij(details(page).locator(':scope > summary'));
  return details(page);
}

async function geometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const value = await page.evaluate(() => {
    const box = selector => {
      const element = document.querySelector(selector);
      if (!element?.getClientRects().length) return null;
      const r = element.getBoundingClientRect(); return { x: r.x, width: r.width, top: r.top + scrollY, bottom: r.bottom + scrollY };
    };
    return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      form: box('#clcrForm'), activePanel: box('#clcrActivePanel'), inputCard: box('.oxcr-input-card'), clear: box('#clearBtn'), report: box('#clcrResultReport'),
      modeButtons: [...document.querySelectorAll('.oxcr-mode-switch button')].map(button => { const r = button.getBoundingClientRect(); return { width: r.width, height: r.height }; }),
      fields: [...document.querySelectorAll('.oxcr-entry-fields input, .oxcr-entry-fields select')]
        .filter(e => e.getClientRects().length && !e.closest('[hidden]'))
        .map(e => ({ id: e.id, kind: e.tagName, x: e.getBoundingClientRect().x, width: e.getBoundingClientRect().width,
          height: e.getBoundingClientRect().height, font: parseFloat(getComputedStyle(e).fontSize) })),
    };
  });
  expect(value.overflow).toBeLessThanOrEqual(1);
  expect(value.inputCard).not.toBeNull();
  expect(Math.abs(value.inputCard.top - value.activePanel.bottom - 16)).toBeLessThanOrEqual(1);
  expect(Math.abs(value.form.width - value.inputCard.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(value.clear.width - value.inputCard.width)).toBeLessThanOrEqual(1);
  expect(value.modeButtons).toHaveLength(2);
  expect(Math.abs(value.modeButtons[0].width - value.modeButtons[1].width)).toBeLessThanOrEqual(0.5);
  for (const b of value.modeButtons) expect(b.height).toBeGreaterThanOrEqual(48);
  for (const f of value.fields) {
    expect(f.height, f.id).toBeGreaterThanOrEqual(48); expect(f.font, `${f.id}: bez autozoomu`).toBeGreaterThanOrEqual(16);
    expect(f.x).toBeGreaterThanOrEqual(0); expect(f.x + f.width).toBeLessThanOrEqual(width + 1);
  }
  if (width < 980) expect(value.report.top - value.clear.bottom).toBeGreaterThanOrEqual(20);
  else expect(Math.abs(value.report.top - value.activePanel.top)).toBeLessThanOrEqual(1);
  return value;
}
function sameWidths(a, b) {
  for (const key of ['form', 'inputCard', 'clear', 'report']) {
    expect(Math.abs(a[key].width - b[key].width), `${key}: stała szerokość`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(a[key].x - b[key].x), `${key}: wspólna krawędź`).toBeLessThanOrEqual(0.5);
  }
  for (const f of b.fields) {
    const original = a.fields.find(item => item.kind === f.kind);
    expect(original).toBeTruthy(); expect(Math.abs(original.x - f.x), f.id).toBeLessThanOrEqual(0.5);
    expect(Math.abs(original.width - f.width), f.id).toBeLessThanOrEqual(0.5);
  }
}
async function expectReferenceFits(page) {
  const fit = await card(page).evaluate(node => {
    const reference = node.querySelector('.clcr-result-reference').getBoundingClientRect();
    const patient = node.querySelector('.clcr-result-patient').getBoundingClientRect();
    const glyphs = selector => { const r = document.createRange(); r.selectNodeContents(node.querySelector(selector)); return [...r.getClientRects()].map(x => ({ left: x.left, right: x.right, top: x.top })); };
    return { reference: { left: reference.left, right: reference.right }, patient: { left: patient.left, right: patient.right },
      norm: glyphs('.clcr-result-reference-value'), value: glyphs('.clcr-result-value'),
      patientFont: parseFloat(getComputedStyle(node.querySelector('.clcr-result-value')).fontSize), referenceFont: parseFloat(getComputedStyle(node.querySelector('.clcr-result-reference-value')).fontSize) };
  });
  for (const g of fit.norm) { expect(g.left).toBeGreaterThanOrEqual(fit.reference.left - 0.5); expect(g.right).toBeLessThanOrEqual(fit.reference.right + 0.5); }
  for (const g of fit.value) expect(g.right).toBeLessThanOrEqual(fit.patient.right + 0.5);
  expect(fit.patient.right).toBeLessThanOrEqual(fit.reference.left + 0.5); expect(fit.patientFont).toBeGreaterThan(fit.referenceFont);
  return fit;
}
async function captureSave(page, date) {
  return page.evaluate(async clinicalDateISO => {
    const api = window.ClcrVisitSave, originalVault = window.VildaVault, rawNotes = [], notes = [];
    const points = api.collectActiveDatapoints(document, { formulaId: 'OxCr_spot' });
    const originalPatientId = api.resolveCurrentPatientId();
    // The clinical writer now requires an existing selected fictional card.
    window.VildaVault = { isUnlocked: () => true,
      getPatient: async patientId => patientId === 'fictional-oxcr-e2e-only' ? { patientId, header: { name: 'Fikcyjny pacjent testu Klirensu' } } : null, savePatientNote: async note => {
      rawNotes.push(JSON.parse(JSON.stringify(note)));
      notes.push({ ...note, body: originalVault.sanitizeNoteText(note.body), labResult: originalVault.sanitizeLabResult(note.labResult) });
    } };
    api._setPatientId('fictional-oxcr-e2e-only');
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'fictional-oxcr-e2e-only', clinicalDateISO, root: document, formulaId: 'OxCr_spot' });
      window.__oxcrSyntheticNotes = [...(window.__oxcrSyntheticNotes || []), ...notes];
      return { outcome, points, rawNotes, notes, vaultLocked: !originalVault.isUnlocked() };
    } finally { window.VildaVault = originalVault; api._setPatientId(originalPatientId); }
  }, date);
}

for (const width of [1440, 390, 320]) {
  test(`Ox/Cr ${width}px: dwa stężenia domyślnie, jeden wynik i stały układ wszystkich jednostek`, async ({ page }, testInfo) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await openCalculator(page, width);
    await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('OxCr_spot'));
    await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'OxCr_spot' && window.clcrIsResetting !== true);
    await expect(page.locator('#Ox_Cr_spot_unit')).toHaveValue('umol/L');
    await expect(page.locator('#Ucr_spot_unit')).toHaveValue('mmol/L');
    await restore(page);
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await mode(page).evaluate(b => b.nextElementSibling?.textContent.trim())).toBe('Gotowy wynik Ox/Cr');
    await expect(page.locator('#Ox_Cr_spot')).toBeVisible(); await expect(page.locator('#Ucr_spot')).toBeVisible();
    await expect(page.locator('#oxalateSpotReportingEntity')).toBeHidden(); await expect(card(page)).toHaveCount(0);
    const initial = await geometry(page, width);
    await page.locator('#Ox_Cr_spot_unit').selectOption('mg/dL:acid'); await page.locator('#Ox_Cr_spot').fill('1');
    await page.locator('#Ucr_spot_unit').selectOption('mg/dl'); await page.locator('#Ucr_spot').fill('10');
    const result = await expectResult(page, { raw: 0.1, unit: 'mg/mg' });
    expect(result.context).toMatchObject({ ageYears: 8, sameSpecimen: 'assumed', confounders: [] });
    await expect(card(page).locator('.clcr-result-reference-label')).toHaveText('Norma dla wieku');
    await expect(page.locator('#oxcrOxalateUnitHelp')).toContainText('kwas szczawiowy bezwodny');
    const colors = await card(page).evaluate(n => ({ patient: getComputedStyle(n.querySelector('.clcr-result-value')).color,
      status: getComputedStyle(n.querySelector('.clcr-result-interpretation')).color, norm: getComputedStyle(n.querySelector('.clcr-result-reference-value')).color }));
    expect(colors.patient).toBe('rgb(154, 91, 0)'); expect(colors.status).toBe(colors.patient); expect(colors.norm).not.toBe(colors.patient);
    expect(new Set((await expectReferenceFits(page)).value.map(x => x.top)).size).toBe(1);
    sameWidths(initial, await geometry(page, width));
    await kliknij(mode(page, true));
    for (const [unit, value] of [['umol/mmol', '125'], ['mmol/mol', '125'], ['mmol/mmol', '0.125'], ['mol/mol', '0.125'],
      ['mg/mg:ion', '0.1'], ['mg/g:acid', '100'], ['mg/mmol:acid', '11.312']]) {
      await page.locator('#OxCr_reported_unit').selectOption(unit); await page.locator('#OxCr_reported').fill(value);
      await expectResult(page, { raw: Number(value), unit: unit.split(':')[0].replace('umol', 'µmol') });
      await expectReferenceFits(page); sameWidths(initial, await geometry(page, width));
    }
    await page.locator('#OxCr_reported_unit').selectOption('mg/mmol:unknown');
    await expectResult(page, { unit: 'mg/mmol', tone: 'neutral', status: 'unassessed', reference: false });
    sameWidths(initial, await geometry(page, width));
    await expect(page.locator('#oxcrReportedUnitHelp')).toContainText('nie podano');
    await page.locator('#OxCr_reported_unit').selectOption('umol/mmol'); await page.locator('#OxCr_reported').fill('125');
    await openDetails(page); await expect(details(page)).toContainText(/Fimlab/); await expect(details(page)).toContainText(/Newcastle/); await expect(details(page)).not.toContainText('Źródło progów: EAU');
    sameWidths(initial, await geometry(page, width));
    for (const value of ['12345678.12345678', '-1', '']) {
      await page.locator('#OxCr_reported').fill(value);
      if (value[0] === '-' || !value) await expect(card(page)).toHaveCount(0);
      else { await expectResult(page); await expectReferenceFits(page); }
      sameWidths(initial, await geometry(page, width));
    }
    await kliknij(mode(page)); await expectResult(page, { raw: 0.1, unit: 'mg/mg' });
    const path = testInfo.outputPath(`oxcr-${width}-production.png`);
    await page.locator('#clcrWorkspace').screenshot({ path, animations: 'disabled', style: '#mobileBottomDock,#scrollTopBtn{visibility:hidden!important}' });
    await testInfo.attach('OxCr-production', { path, contentType: 'image/png' });
    await kliknij(page.locator('#clearBtn')); await page.waitForFunction(() => window.clcrIsResetting !== true);
    await page.evaluate(() => window.ClcrUiWorkflow.selectFormula('OxCr_spot'));
    await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'OxCr_spot' && window.clcrIsResetting !== true);
    await expect(mode(page)).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('#Ox_Cr_spot')).toHaveValue('');
    await expect(page.locator('#OxCr_reported')).toHaveValue(''); await expect(page.locator('#Ox_Cr_spot_unit')).toHaveValue('umol/L');
    await expect(page.locator('#Ucr_spot_unit')).toHaveValue('mmol/L');
    await expect(card(page)).toHaveCount(0); sameWidths(initial, await geometry(page, width)); expect(errors).toEqual([]);
  });
}

test('Ox/Cr: zero i bardzo małe wartości pozostają odróżnialne od braku danych; Cr nie ma limitu zależnego od jednostki', async ({ page }) => {
  await openCalculator(page); await restore(page, { Ox_Cr_spot: '600', Ucr_spot: '600', Ucr_spot_unit: 'mg/dl' });
  const first = await snapshot(page);
  await page.locator('#Ucr_spot_unit').selectOption('umol'); await page.locator('#Ucr_spot').fill('53041.01838755304');
  const equivalent = await snapshot(page); expect(equivalent.rawValue).toBeCloseTo(first.rawValue, 10);
  await page.locator('#Ox_Cr_spot').fill('0'); await expectResult(page, { raw: 0, tone: 'success', status: 'within' });
  await page.locator('#Ox_Cr_spot_unit').selectOption('mg/dL:acid'); await page.locator('#Ucr_spot_unit').selectOption('mg/dl');
  await page.locator('#Ucr_spot').fill('100'); await page.locator('#Ox_Cr_spot').fill('0.0049');
  const small = await expectResult(page, { raw: 0.000049, unit: 'mg/mg', tone: 'success', status: 'within' });
  expect(Number(small.display.value)).toBeGreaterThan(0);
  await page.locator('#Ox_Cr_spot').fill(''); await expect(card(page)).toHaveCount(0);
  await page.locator('#Ox_Cr_spot').fill('1');
  for (const value of ['0', '-1', '']) { await page.locator('#Ucr_spot').fill(value); await expect(card(page)).toHaveCount(0); }
});

test('Ox/Cr: granice wieku i P95 dzieci, odrębny zakres starszej młodzieży i dorosłych bez luki 17–18 lat', async ({ page }) => {
  await openCalculator(page);
  for (const [age, ageMonths, high] of [['0', '1', 220], ['0', '6', 170], ['1', '', 130], ['2', '', 100], ['3', '', 80], ['5', '', 70], ['7', '', 60], ['17', '', 60]]) {
    await restore(page, { age, ageMonths, OxCr_entry_mode: 'direct', OxCr_reported: String(high) });
    const result = await expectResult(page, { raw: high, tone: 'success', status: 'within' });
    expect(result.reference.nativeHigh).toBe(high); expect(result.reference.nativeLow).toBeNull();
    await expect(page.locator('.clcr-result-source[data-clcr-formula="OxCr_spot"]')).toContainText('Fimlab');
    await page.locator('#OxCr_reported').fill(String(high + 0.000001)); await expectResult(page, { raw: high + 0.000001 });
  }
  for (const [age, months] of [['17', '1'], ['18', ''], ['95', '']]) {
    await restore(page, { age, ageMonths: months, OxCr_entry_mode: 'direct', OxCr_reported: '2' });
    const result = await expectResult(page, { raw: 2, tone: 'success', status: 'within' });
    expect(result.reference).toMatchObject({ nativeLow: 2, nativeHigh: 83 });
    await expect(page.locator('.clcr-result-source[data-clcr-formula="OxCr_spot"]')).toContainText('Newcastle');
    await page.locator('#OxCr_reported').fill('83'); await expectResult(page, { raw: 83, tone: 'success', status: 'within' });
    await page.locator('#OxCr_reported').fill('1.999999'); await expectResult(page, { raw: 1.999999, status: 'below' });
    await expect(await openDetails(page)).toContainText(/Niska wartość nie oznacza niedoboru|niski|niskiego|znaczenia klinicznego/i);
  }
  for (const [age, ageMonths] of [['', ''], ['0', '0']]) {
    await restore(page, { age, ageMonths, OxCr_entry_mode: 'direct', OxCr_reported: '100' });
    await expectResult(page, { raw: 100, tone: 'neutral', status: 'unassessed', reference: false });
    await expect(card(page).locator('.clcr-result-reference-value')).toHaveCount(0);
  }
});

test('Ox/Cr: nierówności opisują cały możliwy przedział, bez dokładnego punktu w historii', async ({ page }) => {
  await openCalculator(page); await restore(page, { OxCr_entry_mode: 'direct' });
  for (const [value, tone, status] of [['≤60', 'success', 'within'], ['>60', 'warning', 'above'], ['≥60', 'neutral', 'unassessed'], ['<61', 'neutral', 'unassessed']]) {
    await page.locator('#OxCr_reported').fill(value); await expectResult(page, { tone, status });
    const saved = await captureSave(page, '2026-10-24');
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 }); expect(saved.notes).toEqual(saved.rawNotes);
    expect(saved.notes[0].labResult.value).toContain(value[0]); expect(saved.notes[0].labResult).not.toHaveProperty('valueNum');
  }
  const history = await page.evaluate(() => window.ClcrVisitSave.buildSeriesFromNotes(window.__oxcrSyntheticNotes, { formulaId: 'OxCr_spot' }));
  expect(history.flatMap(s => s.points).every(p => p.valueNum == null)).toBe(true);
  expect(await page.evaluate(() => window.ClcrVisitSave.seriesTrend(window.ClcrVisitSave.buildSeriesFromNotes(window.__oxcrSyntheticNotes, { formulaId: 'OxCr_spot' })[0].points))).toBeNull();
  await restore(page, { age: '18', OxCr_entry_mode: 'direct' });
  for (const [value, tone, status] of [['<2', 'warning', 'below'], ['≤2', 'neutral', 'unassessed'], ['>83', 'warning', 'above'], ['≥83', 'neutral', 'unassessed']]) {
    await page.locator('#OxCr_reported').fill(value); await expectResult(page, { tone, status });
  }
});

test('Ox/Cr: zapis zachowuje pełną precyzję, postać, normę i źródło; historia rozdziela jednostki i postaci bez ponownej oceny', async ({ page }) => {
  await openCalculator(page);
  for (const [unit, value, age] of [['mg/mg:acid', '0.012345', '8'], ['mg/mg:ion', '0.012345', '8'], ['mg/mg:unknown', '0.012345', '8'], ['mg/g:acid', '12.345', '18']]) {
    await restore(page, { age, OxCr_entry_mode: 'direct', OxCr_reported: value, OxCr_reported_unit: unit });
    await expectResult(page, { raw: Number(value), unit: unit.split(':')[0], tone: unit.endsWith('unknown') ? 'neutral' : 'success', status: unit.endsWith('unknown') ? 'unassessed' : 'within', reference: !unit.endsWith('unknown') });
    const saved = await captureSave(page, '2026-10-24');
    expect(saved.outcome).toMatchObject({ ok: true, saved: 1 }); expect(saved.notes).toEqual(saved.rawNotes);
    expect(saved.notes[0].labResult).toMatchObject({ valueNum: Number(value), unit: unit.split(':')[0] }); expect(saved.vaultLocked).toBe(true);
    expect(saved.points[0].outOfRange).toBe(unit.endsWith('unknown') ? null : false);
  }
  await restore(page, { Ox_Cr_spot: '0.0499', Ox_Cr_spot_unit: 'mg/dL:acid', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl' });
  await expectResult(page, { raw: 0.000499, unit: 'mg/mg', tone: 'success', status: 'within' });
  const small = await captureSave(page, '2026-10-25'); expect(small.notes[0].labResult.valueNum).toBe(0.000499);
  const series = await page.evaluate(() => {
    const engine = window.VildaClcrOxcr; window.VildaClcrOxcr = { evaluate: () => { throw new Error('Dawna próbka nie może być liczona ponownie'); } };
    try { return window.ClcrVisitSave.buildSeriesFromNotes(window.__oxcrSyntheticNotes, { formulaId: 'OxCr_spot' }); }
    finally { window.VildaClcrOxcr = engine; }
  });
  expect(series).toHaveLength(4); expect(series.flatMap(s => s.points)).toHaveLength(5);
  expect(series.filter(s => s.unit === 'mg/mg')).toHaveLength(3);
});

test('Ox/Cr: znane różne próbki blokują tylko iloraz stężeń; nowa rzadka sesja nie dziedziczy postaci ani faktów', async ({ page }) => {
  await openCalculator(page); await restore(page, { Ox_Cr_spot: '1', Ox_Cr_spot_unit: 'mg/dL:ion', Ucr_spot: '10', Ucr_spot_unit: 'mg/dl',
    OxCr_same_specimen: 'different', spotSampleKind: 'random', spotInfection: true });
  await expect(card(page)).toHaveCount(0); await expect(page.locator('#clcrResultReport')).toContainText(/różn.*prób/);
  await kliknij(mode(page, true)); await page.locator('#OxCr_reported').fill('100');
  const ready = await expectResult(page, { raw: 100 }); expect(ready.context.sameSpecimen).toBe('not-applicable');
  expect(ready.context.confounders).toContain('infection');
  expect(await page.evaluate(() => window.applyClcrSessionSnapshot({ version: 2, currentVersion: 'spot', selectedFormula: 'OxCr_spot', inputs: {
    currentVersion: 'spot', formulaPicker: 'OxCr_spot', age: '8', Ox_Cr_spot: '100', Ox_Cr_spot_unit: 'umol/L', Ucr_spot: '1', Ucr_spot_unit: 'mmol/L',
  } }, { source: 'e2e-oxcr-next-fictional-patient', update: true, dispatchEvents: false, preserveAcrossVersions: true }))).toBe(true);
  const next = await expectResult(page, { raw: 100 }); expect(next.context).toMatchObject({ sameSpecimen: 'assumed', confounders: [], sampleType: '' });
  await expect(page.locator('#Ox_Cr_spot_unit')).toHaveValue('umol/L');
  expect((await page.evaluate(() => window.buildClcrSessionSnapshot().inputs)).oxalateSpotReportingEntity || '').toBe('');
});

test('Ox/Cr ↔ Ca/Cr ↔ PCR: wspólna kreatynina ma jeden DOM i wraca bez utraty stężeń', async ({ page }) => {
  await openCalculator(page); await restore(page, { Ox_Cr_spot: '100', Ucr_spot: '10', Ucr_spot_unit: 'mmol/L', Ca_spot: '40', Ca_spot_unit: 'mg/dl', U_Prot_spot: '300', U_Prot_spot_unit: 'mg/L' });
  await expectResult(page, { raw: 10, tone: 'success', status: 'within' });
  for (const formula of ['CaCr_spot', 'PCR', 'OxCr_spot']) {
    await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formula);
    await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formula);
    await expect(page.locator('#Ucr_spot')).toHaveCount(1); await expect(page.locator('#Ucr_spot')).toBeVisible();
    await expect(page.locator('#Ucr_spot')).toHaveValue('10'); await expect(page.locator('#Ucr_spot_unit')).toHaveValue('mmol/L');
  }
  await expect(page.locator('#Ox_Cr_spot')).toHaveValue('100'); await expectResult(page, { raw: 10, tone: 'success', status: 'within' });
});

test('Ox/Cr 361/375/381px: wynik, pełny zakres dorosłego i edycja wieku mieszczą się przy szerszym kroju pisma', async ({ page }) => {
  await openCalculator(page, 361);
  await page.addStyleTag({ content: '.oxcr-proposal-card :is(.clcr-result-value,.clcr-result-reference-value){font-family:"DejaVu Sans",sans-serif!important}' });
  for (const width of [361, 375, 381]) {
    await page.setViewportSize({ width, height: 1000 });
    await restore(page, { Ox_Cr_spot: '1', Ox_Cr_spot_unit: 'mg/dL:acid', Ucr_spot: '10', Ucr_spot_unit: 'mg/dl' });
    await expectResult(page, { raw: 0.1, unit: 'mg/mg' }); expect(new Set((await expectReferenceFits(page)).value.map(x => x.top)).size).toBe(1);
    await restore(page, { age: '18', OxCr_entry_mode: 'direct', OxCr_reported: '100', OxCr_reported_unit: 'mg/mmol:acid' });
    await expectResult(page, { raw: 100, unit: 'mg/mmol' }); await expectReferenceFits(page);
    await kliknij(page.locator('.oxcr-patient-age__edit'));
    const fields = await page.locator('#age,#ageMonths').evaluateAll(nodes => nodes.map(n => ({ h: n.getBoundingClientRect().height, font: parseFloat(getComputedStyle(n).fontSize) })));
    for (const f of fields) { expect(f.h).toBeGreaterThanOrEqual(48); expect(f.font).toBeGreaterThanOrEqual(16); }
    await page.locator('#age').fill('8'); await expect(page.locator('#age')).toBeFocused();
    await expectResult(page, { raw: 100, unit: 'mg/mmol' }); await expectReferenceFits(page); await kliknij(page.locator('.oxcr-patient-age__edit'));
    await geometry(page, width);
  }
});

test('Ox/Cr: wszystkie jednostki stężeń i raportu zachowują znany przelicznik albo jawnie brak postaci', async ({ page }) => {
  await openCalculator(page); await restore(page, { Ucr_spot: '10', Ucr_spot_unit: 'mmol/L' });
  for (const [unit, value, raw, output] of [['umol/L', '100', 10, 'µmol/mmol'], ['mmol/L', '0.1', 10, 'µmol/mmol'],
    ['mg/L:ion', '8.8019', 0.007781028995756719, 'mg/mg'], ['mg/dL:ion', '0.88019', 0.007781028995756719, 'mg/mg'],
    ['mg/L:acid', '9.00349', 0.00795923797736917, 'mg/mg'], ['mg/dL:acid', '0.900349', 0.00795923797736917, 'mg/mg']]) {
    await page.locator('#Ox_Cr_spot_unit').selectOption(unit); await page.locator('#Ox_Cr_spot').fill(value);
    const valueModel = await expectResult(page, { raw, unit: output, tone: 'success', status: 'within' });
    expect(valueModel.classificationValue).toBeCloseTo(10, 10);
  }
  for (const unit of ['mg/L:unknown', 'mg/dL:unknown']) {
    await page.locator('#Ox_Cr_spot_unit').selectOption(unit); await page.locator('#Ox_Cr_spot').fill('1');
    const numeric = await expectResult(page, { unit: 'mg/mg', tone: 'neutral', status: 'unassessed', reference: false });
    expect(numeric.classificationValue).toBeNull();
  }
  await kliknij(mode(page, true));
  for (const family of ['mg/mg', 'mg/g', 'mg/mmol']) for (const basis of ['ion', 'acid', 'unknown']) {
    await page.locator('#OxCr_reported_unit').selectOption(`${family}:${basis}`); await page.locator('#OxCr_reported').fill('100');
    await expectResult(page, { raw: 100, unit: family, tone: basis === 'unknown' ? 'neutral' : 'warning', status: basis === 'unknown' ? 'unassessed' : 'above', reference: basis !== 'unknown' });
    await expect(page.locator('#oxcrReportedUnitHelp')).toContainText(basis === 'ion' ? 'jon szczawianowy' : basis === 'acid' ? 'kwas szczawiowy bezwodny' : 'nie podano');
  }
});

test('Ox/Cr: zapis starszej wersji zachowuje masowe stężenie oraz zapisaną postać, a nowa sesja nie dziedziczy ich milcząco', async ({ page }) => {
  await openCalculator(page);
  for (const [legacy, basis] of [['oxalic_acid', 'acid'], ['oxalate_ion', 'ion'], ['', 'unknown']]) {
    expect(await page.evaluate(entity => window.applyClcrSessionSnapshot({ version: 2, currentVersion: 'spot', selectedFormula: 'OxCr_spot', inputs: {
      currentVersion: 'spot', formulaPicker: 'OxCr_spot', age: '8', Ox_Cr_spot: '1', Ucr_spot: '10', oxalateSpotReportingEntity: entity,
    } }, { source: 'e2e-oxcr-old-fictional-session', update: true, dispatchEvents: false, preserveAcrossVersions: true }), legacy)).toBe(true);
    await expect(page.locator('#Ox_Cr_spot_unit')).toHaveValue(`mg/dL:${basis}`); await expect(page.locator('#Ucr_spot_unit')).toHaveValue('mg/dl');
    const model = await expectResult(page, { raw: 0.1, unit: 'mg/mg', tone: basis === 'unknown' ? 'neutral' : 'warning', status: basis === 'unknown' ? 'unassessed' : 'above', reference: basis !== 'unknown' });
    expect(model.input.oxalateValue).toBe('1');
  }
});

test('Ox/Cr: znana próbka ze zbiórki zachowuje liczbę, ale nie otrzymuje normy moczu punktowego', async ({ page }) => {
  await openCalculator(page); await restore(page, { Ox_Cr_spot: '100', Ucr_spot: '1', spotSampleKind: 'timed' });
  const result = await expectResult(page, { raw: 100, tone: 'neutral', status: 'unassessed', reference: false });
  expect(result.context.sampleType).toBe('timed');
  await expect(card(page)).toContainText(/zbiór|punktow|losow/);
  await kliknij(mode(page, true)); await page.locator('#OxCr_reported').fill('100');
  await expectResult(page, { raw: 100, tone: 'neutral', status: 'unassessed', reference: false });
  const saved = await captureSave(page, '2026-10-24');
  expect(saved.points[0].outOfRange).toBeNull(); expect(saved.notes[0].labResult.norm || '').toBe('');
  expect(saved.notes[0].body).toContain('próbka ze zbiórki czasowej');
});
