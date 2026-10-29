import { expect, test } from '@playwright/test';
import { openCalculator, applySession } from '../support/klirens-mg-dzm-browser.mjs';

// All inputs are fictional; the real vault remains locked. Each selected
// legacy module must agree on new/default, blank, explicit and reset duration.
const specimen = {
  age: '45', ageMonths: '0', ageDays: '', sex: 'F', weight: '60', height: '165',
  Ucr: '100', Scr: '1', ScrUnit: 'mg/dl', V24: '1440',
  U_Na: '50', U_K: '20', U_PO4: '50', U_Prot: '1000', U_Ox: '5', U_Cit: '5', pH24: '5.5',
  oxalateReportingEntity: 'oxalate_ion',
  collectionStartAt: '', collectionEndAt: '', Cl24CollectionProblem: false,
  collectionStartVoidDiscarded: false, collectionFinalVoidIncluded: false,
  collectionNoMissedVoids: false, collectionNoSpillage: false,
  collectionNoExtraVoids: false, collectionStorageFollowed: false,
  ui_collectionStartVoidDiscarded_answer: '', ui_collectionFinalVoidIncluded_answer: '',
  ui_collectionNoMissedVoids_answer: '', ui_collectionNoSpillage_answer: '',
  ui_collectionNoExtraVoids_answer: '', ui_collectionStorageFollowed_answer: '',
};
const formulas = ['cl24', 'PO4_mgkg', 'Prot_mgkg', 'Na_mmol_d', 'K_mmol_d', 'Ox_mgkg', 'Cit_mgkg', 'pH24'];

async function restore(page, formula, patch = {}) {
  await applySession(page, { version: 2, currentVersion: 'advanced', selectedFormula: formula,
    inputs: { ...specimen, currentVersion: 'advanced', formulaPicker: formula,
      Cl24DurationHours: '', Cl24DurationSource: 'assumed-24h', ...patch } }, formula);
}
async function state(page, formula) {
  return page.evaluate(id => ({
    duration: window.ClcrCollectionDuration.readFromDocument(document),
    ready: window.canComputeFormula(id),
    points: window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: id }).map(point => ({
      key: point.seriesKey, output: point.outputId, value: point.rawValue ?? point.valueNum,
      captureSource: point.capture?.values?.Cl24DurationSource,
      captureHours: point.capture?.values?.Cl24DurationHours,
    })),
  }), formula);
}
async function expectReady(page, formula) {
  await expect.poll(async () => (await state(page, formula)).ready).toBe(true);
  const current = await state(page, formula);
  expect(current.points.length, `${formula}: rendered datapoints`).toBeGreaterThan(0);
  expect(current.points.every(point => Number.isFinite(point.value))).toBe(true);
  return current;
}

for (const formula of formulas) test(`Shared DZM: ${formula} defaults, blank, invalid and clear`, async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await openCalculator(page); await restore(page, formula);
  await expect(page.locator('#Cl24DurationHours')).toHaveValue('24');
  await expect(page.locator('#clcrCommonDuration')).toBeVisible();
  const baseline = await expectReady(page, formula);
  expect(baseline.duration).toMatchObject({ valid: true, hours: 24, source: 'assumed-24h', complete: true });
  expect(baseline.points.every(point => point.captureSource === 'assumed-24h' && point.captureHours === '24')).toBe(true);
  for (const id of ['collectionStartAt', 'collectionEndAt', 'collectionNoMissedVoids']) await expect(page.locator(`#${id}`)).toBeHidden();

  await page.locator('#clcrCommonDuration .clcr-duration-change').click();
  const hours = page.locator('#Cl24DurationHours'); await expect(hours).toBeVisible();
  await hours.fill('12');
  await expect(page.locator('#clcrCommonDuration strong')).toHaveText('12 godz.');
  await expect(page.locator('#Cl24DurationSource')).toHaveValue('hours');
  const half = await expectReady(page, formula);
  expect(half.duration).toMatchObject({ valid: true, hours: 12, source: 'hours', assumed: false });
  expect(half.points.every(point => point.captureSource === 'hours' && point.captureHours === '12')).toBe(true);
  expect(half.points).toHaveLength(baseline.points.length);
  half.points.forEach((point, index) => expect(point.value).toBeCloseTo(baseline.points[index].value * (formula === 'pH24' ? 1 : 2), 10));

  await hours.fill('');
  expect((await expectReady(page, formula)).duration).toMatchObject({ valid: true, hours: 24, source: 'assumed-24h' });
  await hours.blur(); await expect(hours).toHaveValue('24');
  await expect(page.locator('#clcrCommonDuration strong')).toHaveText('24 godz.');
  await expect(page.locator('#Cl24DurationSource')).toHaveValue('assumed-24h');
  const restored = await expectReady(page, formula);
  expect(restored.duration).toMatchObject({ valid: true, hours: 24, source: 'assumed-24h', assumed: true });
  expect(restored.points).toEqual(baseline.points);

  await hours.fill('0');
  await expect.poll(async () => (await state(page, formula)).ready).toBe(false);
  expect((await state(page, formula)).duration).toMatchObject({ valid: false, invalid: true });
  expect((await state(page, formula)).points).toEqual([]);
  await hours.blur(); await expect(hours).toHaveValue('0');

  await hours.fill('12'); await expectReady(page, formula);
  await page.locator('#clearBtn').click();
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await expect(page.locator('#Cl24DurationHours')).toHaveValue('24');
  expect((await state(page, formula)).duration).toMatchObject({ valid: true, hours: 24, source: 'assumed-24h' });
  expect(errors).toEqual([]);
});

const historicalCases = [
  { formula: 'Na_mmol_d', field: 'Cl24DurationHours', source: 'Cl24DurationSource', flag: 'durationNeedsConfirmation',
    editor: '#clcrCommonDurationEditor', summary: '#clcrCommonDuration strong', width: 390, values: {} },
  ...[['Ca_mgkg', 'CA', 'caDzm', 'ca-dzm', 1440], ['UA_mgkg', 'UA', 'ua', 'ua', 390], ['Mg_mgkg', 'MG', 'mgDzm', 'mg-dzm', 320]].map(([formula, prefix, name, css, width]) => ({
    formula, field: `${prefix}_collectionHours`, source: `${prefix}_collectionSource`, flag: `${prefix}_durationNeedsConfirmation`,
    editor: `#${name}DurationEditor`, summary: `#${name}InputCard .${css}-context-row:has-text("Czas zbiórki") strong`, width,
    values: { [`${prefix}_inputMode`]: 'concentration', [`${prefix}_concentration`]: '20', [`${prefix}_concentrationUnit`]: 'mg/L',
      [`${prefix}_volume`]: '1500', [`${prefix}_volumeUnit`]: 'mL' },
  })),
];

for (const entry of historicalCases) test(`Historical DZM replay: ${entry.formula} confirms unknown time explicitly and resets to a new24h collection`, async ({ page }) => {
  test.setTimeout(90_000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await openCalculator(page, entry.width);
  const original = { ...specimen, ...entry.values, U_Mg: '20', U_Ca: '20', U_UA: '20',
    collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00' };
  // Build/read a real, fictional older calculation envelope without a captured
  // numeric duration. The production editor migration must not parse its dates.
  const values = await page.evaluate(({ formula, original }) => {
    const api = window.ClcrSavedCalculation;
    const point = { id: formula, sourceFormulaId: formula, testKey: 'clcr:' + formula, label: 'Fikcyjny zapis historyczny',
      valueNum: 1, rawValue: 1, displayValue: '1', unit: formula === 'Na_mmol_d' ? 'mmol/24 h' : 'mg/kg/24 h', norm: '', tone: 'neutral' };
    const snapshot = api.createSnapshot(point, { capture: { formulaId: formula, ageYears: 45, values: original,
      fields: Object.keys(original).map(id => ({ id, label: id, type: 'text' })) }, clinicalDateISO: '2026-10-24' });
    if (!snapshot) throw new Error('Could not create the fictional historical envelope');
    // Older notes predate the typed Ca/UA/Mg snapshot required by today's new
    // write path. Model that old note explicitly, then use production readers.
    const note = { id: 'fictional-duration-history-note', patientId: 'fictional-duration-history-only', category: 'wynik-klirens',
      clinicalDateISO: '2026-10-24', body: 'Fikcyjny starszy pomiar',
      labResult: { test: point.label, value: '1', valueNum: 1, unit: point.unit, norm: '' } };
    note.body += '\n\n' + api.serializeSnapshot(snapshot, note);
    if (!api.readSaved(note).valid) throw new Error('Fictional historical envelope did not round trip');
    const described = api.describe(note);
    if (!described.editable) throw new Error(described.reason);
    return described.values;
  }, { formula: entry.formula, original });
  expect(values).toMatchObject({ [entry.field]: '', [entry.source]: 'historical-missing', [entry.flag]: true });
  const version = entry.formula === 'Na_mmol_d' ? 'advanced' : 'pro';
  await applySession(page, { version: 2, currentVersion: version, selectedFormula: entry.formula,
    inputs: { ...values, currentVersion: version, formulaPicker: entry.formula } }, entry.formula);
  const hours = page.locator('#' + entry.field), source = page.locator('#' + entry.source), summary = page.locator(entry.summary);
  const expectUnknown = async value => {
    await expect(hours).toBeVisible(); await expect(hours).toHaveValue(value);
    await expect(page.locator(entry.editor)).toBeVisible();
    await expect(source).toHaveValue('historical-missing');
    await expect(summary).toHaveText('Uzupełnij czas');
    expect(await page.evaluate(formula => window.canComputeFormula(formula), entry.formula)).toBe(false);
    expect(await page.evaluate(formula => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: formula }), entry.formula)).toEqual([]);
  };
  await expectUnknown(''); await hours.focus(); await hours.blur(); await expectUnknown('');
  await hours.fill('0'); await hours.blur(); await expectUnknown('0');
  const invalidSession = await page.evaluate(() => window.buildClcrSessionSnapshot());
  await applySession(page, invalidSession, entry.formula); await expectUnknown('0');
  await hours.fill(''); await hours.blur(); await expectUnknown('');
  // The editor opened automatically for the old missing duration. Its first
  // positive digit must not hide the field before the doctor can finish12.
  await hours.focus(); await hours.pressSequentially('12');
  await expect(hours).toHaveValue('12'); await expect(hours).toBeFocused();
  await expect(page.locator(entry.editor)).toBeVisible();
  await expect(source).toHaveValue('hours'); await expect(summary).toHaveText('12 godz.');
  for (const [value, shown] of [['1e1', '10'], ['+12', '12'], ['12', '12']]) {
    await hours.fill(value);
    await expect(source).toHaveValue('hours'); await expect(summary).toHaveText(shown + ' godz.');
    await expect.poll(async () => page.evaluate(formula => window.canComputeFormula(formula), entry.formula)).toBe(true);
  }
  const captured = await page.evaluate(({ formula, field, source, flag }) => {
    const points = window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: formula });
    return { points: points.map(point => ({ hours: point.capture?.values?.[field], source: point.capture?.values?.[source] })),
      confirmation: window.__vildaClcrVersionValueVault?.[flag] };
  }, entry);
  expect(captured.points.length).toBeGreaterThan(0);
  expect(captured.points.every(point => point.hours === '12' && point.source === 'hours')).toBe(true);
  expect(captured.confirmation).toBe(false);
  await page.locator('#clearBtn').click();
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  await expect(hours).toHaveValue('24'); await expect(source).toHaveValue('assumed-24h');
  // Apply a new incoming context into those same mounted controls.
  await applySession(page, { version: 2, currentVersion: version, selectedFormula: entry.formula,
    inputs: { ...specimen, ...entry.values, formulaPicker: entry.formula, currentVersion: version } }, entry.formula);
  await expect(hours).toHaveValue('24'); await expect(source).toHaveValue('assumed-24h');
  await expect(summary).toHaveText('24 godz.');
  const actual = await page.evaluate(fieldId => window.ClcrCollectionDuration.readFromDocument(document, { fieldId }), entry.field);
  expect(actual).toMatchObject({ valid: true, hours: 24, source: 'assumed-24h', assumed: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
});
