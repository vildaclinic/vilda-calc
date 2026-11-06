import { describe, expect, it } from 'vitest';
import { buildKlirensSearchCases, createKlirensSearchEnvironment, KLIRENS_SEARCH_PARAMETER_KEYS } from '../support/klirens-search-all-formulas.mjs';

const PATIENT = 'fictional-klirens-search-entire-registry';
const root = createKlirensSearchEnvironment();
const cases = buildKlirensSearchCases(PATIENT, root);
const sorted = values => [...new Set(values)].sort();
const forbidden = ['VILDA_CLCR', 'exactMain', 'numerator', 'referenceRows', 'engineVersion', '[tekst]', '[liczba]', 'Kalkulator klirensu ·'];

function searchFor(win, notes) {
  const vault = { isUnlocked: () => true, getCurrentUser: () => ({ userId: 'fictional-all-formulas-account' }),
    listPatients: async () => [{ patientId: PATIENT, header: { name: 'Fikcyjny Rejestr Klirensu' } }], listExternalPatients: async () => [],
    listAllPatientNotes: async () => notes, listCarePlans: async () => [] };
  return win.VildaGlobalSearch.create({ vault });
}

function expectNotesPresentation(summary, model) {
  expect(model).not.toBeNull();
  expect(summary.split('\n')[0]).toBe('Wynik: ' + model.display + (model.unit ? ' ' + model.unit : ''));
  if (model.norm) expect(summary).toContain(model.referenceLabel + ': ' + model.norm);
  else expect(summary).not.toContain('Norma przy zapisie:');
  for (const field of ['status', 'interpretation', 'caution', 'comment']) if (model[field]) expect(summary).toContain(model[field]);
  if (model.boundary) expect(summary).toContain(model.boundaryLabel + ': ' + model.boundary);
  for (const marker of forbidden) expect(summary).not.toContain(marker);
}

describe('Search covers the complete Klirens persisted-output registry', () => {
  it('covers every production output and source formula, including protein and dialysis aliases', () => {
    const registry = root.ClcrSavedResults.PARAM_DICTIONARY;
    expect(sorted(KLIRENS_SEARCH_PARAMETER_KEYS)).toEqual(sorted(registry.map(entry => entry.id)));
    expect(sorted(cases.filter(item => item.variant === 'registry').map(item => item.parameterKey))).toEqual(sorted(registry.map(entry => entry.id)));
    expect(sorted(cases.map(item => item.formulaId))).toEqual(sorted(registry.map(entry => entry.sourceFormulaId)));
    expect(sorted(cases.map(item => item.formulaId))).toHaveLength(41);
    expect(root.ClcrSavedResults.getParam('sch_var')).toBeNull();
  });

  it('actually records the requested modes, mass bases, output representations and zeroes', () => {
    for (const item of cases) {
      const saved = root.ClcrSavedCalculation.readSaved(item.note);
      const typed = Object.entries(saved.snapshot.assessment).filter(([key]) => key.endsWith('Snapshot')).map(([, value]) => value).find(Boolean);
      if (item.variant.startsWith('direct-')) expect(typed.mode || typed.input.mode).toBe('direct');
      if (item.variant.startsWith('reported-') || item.variant.startsWith('typed-reported-')) expect(typed.mode || typed.input.mode).toBe('reported');
      if (item.variant === 'exact-zero') expect(saved.rawValue).toBe(0);
      if (item.variant.endsWith('mass-unknown')) {
        expect(item.expected.model.norm).toBe('');
        expect(item.expected.model.status).toBe('Bez zapisanej oceny');
      }
      if (item.variant.endsWith('censored')) expect(item.expected.model.display).toMatch(/^</);
    }
    expect(sorted(cases.filter(item => item.formulaId === 'Mg_mgkg').map(item => item.expected.model.unit)))
      .toEqual(['mg/1,73 m²/24 h', 'mg/24 h', 'mg/kg/24 h']);
    expect(sorted(cases.filter(item => item.parameterKey === 'Prot_mg24' && item.variant.startsWith('typed-')).map(item => item.expected.model.unit)))
      .toEqual(['g/24 h', 'mg/24 h']);
  });

  it.each([
    { variant: 'typed-concentration-adult', mode: 'concentration', specimen: 'random', age: 40, raw: 0.6728927487954316, display: '≈0,673', norm: '0,11–0,53 mmol/mmol', status: 'high', tone: 'warning', outOfRange: true },
    { variant: 'typed-concentration-child', mode: 'concentration', specimen: 'random', age: 8, raw: 0.6728927487954316, display: '≈0,673', norm: '0,39–0,85 mmol/mmol', status: 'within', tone: 'success', outOfRange: false },
    { variant: 'typed-concentration-timed', mode: 'concentration', specimen: 'timed', age: 40, raw: 0.6728927487954316, display: '≈0,673', norm: '', status: 'unassessed', tone: 'neutral', outOfRange: null },
    { variant: 'typed-reported-mass-axis', mode: 'reported', specimen: 'random', age: 40, raw: 0.6728927487954316, display: '≈0,673', norm: '0,11–0,53 mmol/mmol', status: 'high', tone: 'warning', outOfRange: true },
    { variant: 'typed-reported-exact-upper-bound', mode: 'reported', specimen: 'random', age: 40, raw: 0.53, display: '0,53', norm: '0,11–0,53 mmol/mmol', status: 'within', tone: 'success', outOfRange: false },
    { variant: 'typed-reported-above-rounded-upper-bound', mode: 'reported', specimen: 'random', age: 40, raw: 0.53000001, display: '≈0,53', norm: '0,11–0,53 mmol/mmol', status: 'high', tone: 'warning', outOfRange: true },
    { variant: 'exact-zero', mode: 'concentration', specimen: 'random', age: 40, raw: 0, display: '0', norm: '0,11–0,53 mmol/mmol', status: 'zero', tone: 'neutral', outOfRange: null },
  ])('KM/Cr $variant: stores the precise result, specimen and age-specific reference used in Notes', expected => {
    const item = cases.find(item => item.formulaId === 'KM_Cr' && item.variant === expected.variant);
    expect(item).toBeDefined();
    const saved = root.ClcrSavedCalculation.readSaved(item.note);
    const snapshot = saved.snapshot.assessment.urateCreatinineSnapshot;
    const model = root.ClcrNotesView.model(item.note, { patientId: PATIENT });
    expect(saved.valid).toBe(true);
    expect(saved.rawValue).toBeCloseTo(expected.raw, 15);
    expect(snapshot.input).toMatchObject({ mode: expected.mode, specimen: expected.specimen, ageYears: expected.age, outputUnit: 'mmol/mmol' });
    expect(snapshot.status).toBe(expected.status);
    expect(model).toMatchObject({ display: expected.display, unit: 'mmol/mmol', norm: expected.norm, tone: expected.tone, outOfRange: expected.outOfRange });
    expect(snapshot.referencePolicy.profiles).toHaveLength(5);
    if (expected.norm) {
      expect(snapshot.reference).toMatchObject({ sourceId: 'NEWCASTLE_URATE_RANDOM_2024_12_24', sourceAgeLabel: expected.age === 8 ? '6 to 9 years' : '>17 years', specimen: 'random', lowerInclusive: true, upperInclusive: true });
      expect(model.referenceLabel).toBe('Norma przy zapisie');
      expect(model.norm).toBe(snapshot.presentation.referenceText);
    } else {
      expect(snapshot.reference).toBeNull();
      expect(snapshot.referenceAvailable).toBe(false);
      expect(model.status).toBe('Bez zapisanej oceny');
    }
    if (expected.raw === 0.6728927487954316) {
      expect(snapshot.exactMain).toEqual({ numerator: '11312', denominator: '16811' });
      expect(model.boundary).toBe('11312/16811');
      expect(model.boundaryLabel).toBe('Wartość przed zaokrągleniem');
    }
    if (expected.status === 'high') expect(model.interpretation).toBe('Podwyższony KM/Cr może wskazywać na zwiększone wydalanie kwasu moczowego.');
    if (expected.status === 'zero') {
      expect(model.status).toBe('Bez zapisanej oceny');
      expect(snapshot.referenceActive).toBe(false);
      expect(model.boundary).toBe('');
    }
  });

  it('retains the separate historical KM/Cr inputs with unknown specimen and no automatic random-sample norm', () => {
    const item = cases.find(item => item.formulaId === 'KM_Cr' && item.variant === 'registry');
    const saved = root.ClcrSavedCalculation.readSaved(item.note);
    expect(saved.snapshot.assessment.urateCreatinineSnapshot.input).toMatchObject({ mode: 'concentration', uricAcid: '20', uricAcidUnit: 'mg/dL', creatinine: '100', creatinineUnit: 'mg/dL', specimen: 'unknown' });
    expect(saved.rawValue).toBeCloseTo(0.1345785497590863, 15);
    expect(root.ClcrNotesView.model(item.note, { patientId: PATIENT })).toMatchObject({ display: '≈0,135', unit: 'mmol/mmol', norm: '', status: 'Bez zapisanej oceny', outOfRange: null, tone: 'neutral' });
  });

  it.each([
    { variant: 'registry', mode: 'concentration', raw: 0.3, unit: 'mmol/24 h', reference: true, outOfRange: false, basis: 'oxalate-amount' },
    { variant: 'typed-concentration-child', mode: 'concentration', raw: 0.3, unit: 'mmol/24 h', reference: true, outOfRange: true, basis: 'oxalate-amount' },
    { variant: 'typed-concentration-child-no-bsa', mode: 'concentration', raw: 0.3, unit: 'mmol/24 h', reference: false, outOfRange: null, basis: 'oxalate-amount' },
    { variant: 'typed-concentration-mass-unknown', mode: 'concentration', raw: 30, unit: 'mg/24 h', reference: false, outOfRange: null, basis: 'unknown' },
    { variant: 'typed-concentration-mass-ion', mode: 'concentration', raw: 30, unit: 'mg/24 h', reference: true, outOfRange: false, basis: 'oxalate-ion' },
    { variant: 'typed-reported-mass-acid', mode: 'reported', raw: 50, unit: 'mg/24 h', reference: true, outOfRange: true, basis: 'oxalic-acid' },
    { variant: 'typed-reported-molar-upper-bound', mode: 'reported', raw: 0.46, unit: 'mmol/24 h', reference: true, outOfRange: true, basis: 'oxalate-amount' },
    { variant: 'typed-reported-molar-below-rounded-bound', mode: 'reported', raw: 0.46, unit: 'mmol/24 h', reference: true, outOfRange: false, basis: 'oxalate-amount' },
    { variant: 'typed-reported-molar-no-patient', mode: 'reported', raw: 0.3, unit: 'mmol/24 h', reference: false, outOfRange: null, basis: 'oxalate-amount' },
    { variant: 'exact-zero', mode: 'concentration', raw: 0, unit: 'mmol/24 h', reference: true, outOfRange: false, basis: 'oxalate-amount' },
  ])('Ox DZM $variant: search fixture stores a genuine typed amount and frozen reference', expected => {
    const item = cases.find(item => item.parameterKey === 'Ox_total24' && item.variant === expected.variant);
    expect(item).toBeDefined();
    const saved = root.ClcrSavedCalculation.readSaved(item.note);
    const snapshot = saved.snapshot.assessment.oxDzmSnapshot;
    expect(saved.valid).toBe(true);
    expect(saved.rawValue).toBe(expected.raw);
    expect(saved.snapshot.parameterKey).toBe('Ox_total24');
    expect(snapshot).toMatchObject({ valid: true, formulaId: 'Ox_mgkg', outputKey: 'Ox_total24', input: { mode: expected.mode },
      rawValue: expected.raw, unit: expected.unit, referenceAvailable: expected.reference, outOfRange: expected.outOfRange, reportingBasis: expected.basis });
    const model = root.ClcrNotesView.model(item.note, { patientId: PATIENT });
    expect(model).toMatchObject({ unit: expected.unit, display: snapshot.presentation.valueText, outOfRange: expected.outOfRange });
    expect(model.norm).toBe(expected.reference ? snapshot.presentation.referenceText : '');
    if (!expected.reference) expect(model.status).toBe('Bez zapisanej oceny');
  });

  it('retains the old oxalate mg/kg output independently from the absolute daily output', () => {
    const old = cases.find(item => item.parameterKey === 'Ox_mgkg' && item.variant === 'registry');
    const current = cases.find(item => item.parameterKey === 'Ox_total24' && item.variant === 'registry');
    expect(old).toBeDefined(); expect(current).toBeDefined();
    const saved = root.ClcrSavedCalculation.readSaved(old.note);
    expect(saved.valid).toBe(true);
    expect(saved.snapshot.parameterKey).toBe('Ox_mgkg');
    expect(saved.snapshot.assessment.oxDzmSnapshot).toBeUndefined();
    expect(old.expected.model.unit).toBe('mg/kg/24 h');
    expect(current.expected.model.unit).toBe('mmol/24 h');
    expect(old.note.id).not.toBe(current.note.id);
  });

  it.each([
    { variant: 'registry', mode: 'concentration', raw: 1.8, unit: 'mmol/24 h', reference: true, outOfRange: false, basis: 'citrate-amount', status: 'within' },
    { variant: 'typed-concentration-adult-female', mode: 'concentration', raw: 1.8, unit: 'mmol/24 h', reference: true, outOfRange: true, basis: 'citrate-amount', status: 'low' },
    { variant: 'typed-concentration-child', mode: 'concentration', raw: 1.8, unit: 'mmol/24 h', reference: true, outOfRange: false, basis: 'citrate-amount', status: 'within' },
    { variant: 'typed-concentration-child-no-bsa', mode: 'concentration', raw: 1.8, unit: 'mmol/24 h', reference: false, outOfRange: null, basis: 'citrate-amount', status: 'unassessed' },
    { variant: 'typed-concentration-infant', mode: 'concentration', raw: 1.8, unit: 'mmol/24 h', reference: false, outOfRange: null, basis: 'citrate-amount', status: 'unassessed' },
    { variant: 'typed-concentration-mass-unknown', mode: 'concentration', raw: 30, unit: 'mg/24 h', reference: false, outOfRange: null, basis: 'unknown', status: 'unassessed' },
    { variant: 'typed-concentration-mass-ion', mode: 'concentration', raw: 600, unit: 'mg/24 h', reference: true, outOfRange: false, basis: 'citrate-ion', status: 'within' },
    { variant: 'typed-reported-mass-acid', mode: 'reported', raw: 300, unit: 'mg/24 h', reference: true, outOfRange: true, basis: 'citric-acid', status: 'low' },
    { variant: 'typed-reported-molar-lower-bound', mode: 'reported', raw: 1.7, unit: 'mmol/24 h', reference: true, outOfRange: false, basis: 'citrate-amount', status: 'within' },
    { variant: 'typed-reported-molar-below-rounded-bound', mode: 'reported', raw: 1.7, unit: 'mmol/24 h', reference: true, outOfRange: true, basis: 'citrate-amount', status: 'low' },
    { variant: 'typed-reported-child-boundary', mode: 'reported', raw: 1.9, unit: 'mmol/24 h', reference: true, outOfRange: true, basis: 'citrate-amount', status: 'boundary' },
    { variant: 'typed-reported-molar-no-patient', mode: 'reported', raw: 1.8, unit: 'mmol/24 h', reference: false, outOfRange: null, basis: 'citrate-amount', status: 'unassessed' },
    { variant: 'typed-reported-unknown-duration', mode: 'reported', raw: 1.8, unit: 'mmol/24 h', reference: false, outOfRange: null, basis: 'citrate-amount', status: 'unassessed' },
    { variant: 'exact-zero', mode: 'concentration', raw: 0, unit: 'mmol/24 h', reference: true, outOfRange: null, basis: 'citrate-amount', status: 'zero' },
  ])('Cit DZM $variant: search uses the actual frozen amount and lower-bound policy', expected => {
    const item = cases.find(item => item.parameterKey === 'Cit_total24' && item.variant === expected.variant);
    expect(item).toBeDefined();
    const saved = root.ClcrSavedCalculation.readSaved(item.note), snapshot = saved.snapshot.assessment.citDzmSnapshot;
    expect(saved.valid).toBe(true);
    expect(saved).toMatchObject({ rawValue: expected.raw, unit: expected.unit, parameterKey: 'Cit_total24' });
    expect(snapshot).toMatchObject({ valid: true, formulaId: 'Cit_mgkg', outputKey: 'Cit_total24', input: { mode: expected.mode }, status: expected.status,
      referenceAvailable: expected.reference, outOfRange: expected.outOfRange, reportingBasis: expected.basis });
    const model = root.ClcrNotesView.model(item.note, { patientId: PATIENT });
    expect(model).toMatchObject({ unit: expected.unit, display: snapshot.presentation.valueText, outOfRange: expected.outOfRange, interpretation: snapshot.interpretation });
    expect(model.norm).toBe(expected.reference ? snapshot.presentation.referenceText : '');
    if (expected.reference) expect(snapshot.reference).toMatchObject({ kind: 'lower', upper: null, sourceId: 'EAU_UROLITHIASIS_2026' });
    if (!expected.reference || expected.status === 'zero') expect(model).toMatchObject({ status: 'Bez zapisanej oceny', tone: 'neutral' });
    if (expected.variant === 'typed-reported-child-boundary') expect(snapshot.reference).toMatchObject({ lower: 1.9, lowerInclusive: false, operator: '>', bsaM2: 1.73 });
    if (expected.variant === 'typed-reported-molar-lower-bound') expect(snapshot.reference).toMatchObject({ lower: 1.7, lowerInclusive: true, operator: '≥' });
    if (expected.variant === 'typed-reported-unknown-duration') expect(snapshot.input).toMatchObject({ hours: '', durationSource: 'historical-missing', durationNeedsConfirmation: true });
  });

  it('keeps the historical citrate mg/kg output separate from the typed daily amount', () => {
    const old = cases.find(item => item.parameterKey === 'Cit_mgkg' && item.variant === 'registry');
    const current = cases.find(item => item.parameterKey === 'Cit_total24' && item.variant === 'registry');
    const saved = root.ClcrSavedCalculation.readSaved(old.note);
    expect(saved.valid).toBe(true);
    expect(saved.snapshot.parameterKey).toBe('Cit_mgkg');
    expect(saved.snapshot.assessment.citDzmSnapshot).toBeUndefined();
    expect(saved.rawValue).toBe(1.5);
    expect(old.expected.model).toMatchObject({ unit: 'mg/kg/24 h', norm: '', tone: 'neutral' });
    expect(current.expected.model.unit).toBe('mmol/24 h');
    expect(old.note.id).not.toBe(current.note.id);
  });

  it.each([
    ['Ca_Cit', 'registry', 'concentration', 0.500975, 'within', true],
    ['Ca_Cit', 'typed-concentration-child-high', 'concentration', 1.00195, 'above', true],
    ['Ca_Cit', 'typed-concentration-adult', 'concentration', 0.500975, 'unassessed', false],
    ['Ca_Cit', 'typed-concentration-infant', 'concentration', 0.500975, 'unassessed', false],
    ['Ca_Cit', 'typed-concentration-missing-age', 'concentration', 0.500975, 'unassessed', false],
    ['Ca_Cit', 'typed-concentration-missing-sex', 'concentration', 0.500975, 'unassessed', false],
    ['Ca_Cit', 'typed-reported-upper-bound', 'reported', 0.6, 'within', true],
    ['Ca_Cit', 'typed-reported-above-rounded-bound', 'reported', 0.6, 'above', true],
    ['Ca_Cit', 'typed-reported-censored', 'reported', 0.6, 'within', true],
    ['Ca_Cit', 'typed-concentration-tiny', 'concentration', 5.00975e-101, 'within', true],
    ['Ca_Cit', 'exact-zero', 'concentration', 0, 'unassessed', true],
    ['Ca_Cit', 'typed-concentration-random', 'concentration', 0.500975, 'unassessed', false],
    ['Ca_Cit', 'typed-concentration-short', 'concentration', 0.500975, 'unassessed', false],
    ['Ca_Cit', 'typed-concentration-incomplete', 'concentration', 0.500975, 'unassessed', false],
    ['Ca_Cit', 'typed-concentration-historical', 'concentration', 0.500975, 'unassessed', false],
    ['Ca_Cit_mol', 'registry', 'reported', 0.125, 'unassessed', false],
    ['Ca_Cit_mol', 'typed-concentration-molar', 'concentration', 0.5, 'unassessed', false],
    ['Ca_Cit_mol', 'typed-reported-molar-censored', 'reported', 0.5, 'unassessed', false],
  ])('%s %s: search freezes the native dimension, precise ratio and P95 policy', (key, variant, mode, raw, assessment, hasReference) => {
    const item = cases.find(item => item.parameterKey === key && item.variant === variant);
    expect(item).toBeDefined();
    const saved = root.ClcrSavedCalculation.readSaved(item.note), snapshot = saved.snapshot.assessment.caCitSnapshot;
    const unit = key === 'Ca_Cit_mol' ? 'mmol/mmol' : 'mg/mg';
    expect(saved).toMatchObject({ valid: true, rawValue: raw, unit, parameterKey: key, assessment });
    expect(snapshot).toMatchObject({ schema: 'clcr-ca-cit', version: 1, mode, rawValue: raw, unit, referenceAvailable: hasReference });
    expect(snapshot.referencePolicy.restrictions).toMatchObject({ allowMolarConversion: false, normalizeTo24Hours: false, lowerP5IsAlarm: false });
    const model = root.ClcrNotesView.model(item.note, { patientId: PATIENT });
    expect(model).toMatchObject({ unit, display: root.ClcrCaCitPersistence.displayText(snapshot), interpretation: snapshot.comment,
      tone: assessment === 'above' ? 'warning' : assessment === 'within' ? 'success' : 'neutral', outOfRange: assessment === 'unassessed' ? null : assessment === 'above' });
    expect(model.norm).toBe(hasReference ? '≤0,6 mg/mg' : '');
    expect(model.status).toBe(assessment === 'unassessed' ? 'Bez zapisanej oceny' : assessment === 'within' ? 'Nie przekracza górnej granicy' : 'Powyżej górnej granicy');
    if (hasReference) expect(snapshot.reference).toMatchObject({ upper: 0.6, upperInclusive: true, source: { id: 'KIREJCZYK_2014' }, band: { id: 'kirejczyk-cacit-7-13', sex: 'M' } });
    if (variant === 'typed-reported-above-rounded-bound') expect(saved.displayValue).toBe('0,600000000000000000001');
    if (variant === 'typed-concentration-tiny') expect(saved.displayValue).not.toMatch(/^[≈ ]*0(?:[.,]0+)?$/);
    if (variant === 'typed-concentration-historical') expect(snapshot.context).toMatchObject({ sampleType: 'unknown', sampleSource: 'historical-missing', durationKnown: false });
  });

  it.each(cases)('$key: real persisted output matches Notes in both preview and searchable text', async item => {
    const before = JSON.stringify(item.note);
    expect(root.ClcrSavedCalculation.readSaved(item.note).valid).toBe(true);
    const model = root.ClcrNotesView.model(item.note, { patientId: PATIENT });
    const summary = root.ClcrNotesView.summary(item.note, { patientId: PATIENT });
    expectNotesPresentation(summary, model);
    const service = searchFor(root, [item.note]);
    try {
      const rows = await service.search(item.key);
      expect(rows).toHaveLength(1);
      expect(rows[0].noteId).toBe(item.note.id);
      expect(rows[0].body).toBe(summary);
      expect(rows[0].source).toBe(item.note);
      expect(await service.search('VILDA_CLCR_CALCULATION')).toEqual([]);
      expect(await service.search('engineVersion')).toEqual([]);
    } finally { service.destroy(); }
    expect(JSON.stringify(item.note)).toBe(before);
  });

  it('reads every frozen output after all current calculators and reference tables become inaccessible', async () => {
    const isolated = createKlirensSearchEnvironment(), isolatedCases = buildKlirensSearchCases(PATIENT, isolated);
    const inaccessible = Object.keys(isolated).filter(name => /^VildaClcr/.test(name) || /ReferenceData$/.test(name)
      || ['ClcrClinicalSafety', 'ClcrExtendedEgfr', 'ClcrResultPresentation', 'ClcrSavedLegacyCalculator', 'ClcrCollectionDuration', 'ClcrStoneSafety', 'ClcrDialysisSafety'].includes(name));
    const accesses = [];
    isolated.ClcrSavedCalculation = { ...isolated.ClcrSavedCalculation, recalculate() { accesses.push('ClcrSavedCalculation.recalculate'); throw new Error('A reader must not recalculate'); } };
    for (const name of inaccessible) Object.defineProperty(isolated, name, { configurable: true, get() { accesses.push(name); throw new Error('Current clinical dependency accessed: ' + name); } });
    const before = JSON.stringify(isolatedCases.map(item => item.note));
    const service = searchFor(isolated, isolatedCases.map(item => item.note));
    try {
      const rows = await service.search('Fikcyjny komentarz');
      expect(rows).toHaveLength(isolatedCases.length);
      for (const item of isolatedCases) {
        const summary = isolated.ClcrNotesView.summary(item.note, { patientId: PATIENT });
        expect(isolated.ClcrNotesView.model(item.note, { patientId: PATIENT })).toEqual(item.expected.model);
        expect(summary).toBe(item.expected.summary);
        expect(rows.find(row => row.noteId === item.note.id).body).toBe(item.expected.summary);
      }
      expect(accesses).toEqual([]);
    } finally { service.destroy(); }
    expect(JSON.stringify(isolatedCases.map(item => item.note))).toBe(before);
  });

  it.each(cases.filter(item => item.variant === 'registry'))('$parameterKey: a pre-envelope legacy note uses exactly the same safe fallback as Notes', async item => {
    const note = { ...item.note, body: 'Kalkulator klirensu · ' + item.note.labResult.testKey + '\n\nKomentarz lekarza:\nFikcyjny komentarz historyczny ' + item.key + '.' };
    const before = JSON.stringify(note), model = root.ClcrNotesView.model(note, { patientId: PATIENT });
    const summary = root.ClcrNotesView.summary(note, { patientId: PATIENT });
    expectNotesPresentation(summary, model);
    const service = searchFor(root, [note]);
    try {
      const rows = await service.search(item.key);
      expect(rows).toHaveLength(1);
      expect(rows[0].body).toBe(summary);
    } finally { service.destroy(); }
    expect(JSON.stringify(note)).toBe(before);
  });
});
