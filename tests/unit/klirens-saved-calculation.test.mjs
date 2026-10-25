import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

function environment() {
  const root = {};
  for (const file of [
    'clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_calculation_assumptions.js', 'clcr_result_reference_data.js', 'clcr_result_presentation.js',
    ...['acr', 'pcr', 'cacr', 'oxcr', 'citcr', 'fena', 'fek', 'fecl', 'fehco3'].flatMap(key => [`clcr_${key}_reference_data.js`, `clcr_${key}.js`, ...(['acr', 'pcr', 'cacr'].includes(key) ? [] : [`clcr_${key}_persistence.js`])]),
    'clcr_saved_calculation.js', 'clcr_saved_results.js',
  ]) loadBrowserScript(file, root);
  return root;
}
function capture(values, root, formulaId) {
  const age = root.ClcrClinicalSafety.readAgeFromDocument({ getElementById: id => id === 'formulaPicker' ? { value: formulaId } : Object.hasOwn(values, id) ? { value: String(values[id]) } : null });
  return { values, ageYears: age.valid ? age.exactYears : null, sourceContext: { creatinineState: 'stable', scrAssay: 'enzymatic_idms' }, fields: Object.entries(values).map(([id, value]) => ({ id, label: id, type: typeof value === 'boolean' ? 'checkbox' : 'text', required: ['U_Alb', 'Ucr_spot', 'Scr', 'height'].includes(id) })) };
}
function persist(root, dp, values, date = '2026-10-25') {
  const snapshot = root.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, root, dp.sourceFormulaId), clinicalDateISO: date });
  const payload = root.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: 'fictional-patient', clinicalDateISO: date });
  payload.body += '\n\n' + root.ClcrSavedCalculation.serializeSnapshot(snapshot, payload);
  return { ...payload, id: 'fictional-note', rev: 4 };
}
function acr(root) {
  const values = { age: '10', ageMonths: '0', U_Alb: '45', U_Alb_unit: 'mg/L', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', ACR_entry_mode: 'concentration' };
  const result = root.VildaClcrAcr.evaluate({ ageYears: 10, albuminValue: '45', albuminUnit: 'mg/L', creatinineValue: '100', creatinineUnit: 'mg/dl' }, root.VildaClcrAcrReferenceData.getProfile('KDIGO_ACR_2024'));
  return persist(root, { id: 'ACR', testKey: 'clcr:ACR', label: 'Albumina/kreatynina — ACR', sourceFormulaId: 'ACR', valueNum: result.rawValue, displayValue: result.display.value, unit: result.unit, norm: '<30 mg/g', category: result.category, tone: result.tone, assessment: result.status, outOfRange: true, acrSnapshot: result.snapshot }, values);
}
function u25(root) {
  const values = { age: '10', ageMonths: '0', sex: 'F', height: '140', Scr: '0.600', ScrUnit: 'mg/dl', ScrAssay: 'enzymatic_idms', creatinineState: 'stable' };
  return persist(root, { id: 'ckid_u25', testKey: 'clcr:ckid_u25', label: 'eGFR — CKiD U25 (kreatynina)', sourceFormulaId: 'ckid_u25', valueNum: root.ClcrClinicalSafety.computeCkidU25Creatinine({ sex: 'F', ageYears: 10, heightCm: 140, creatinineMgDl: 0.6 }), displayValue: '83', unit: 'mL/min/1,73 m²', norm: '≥90 mL/min/1,73 m²', category: 'G2', tone: 'warning', outOfRange: true, referenceProfileId: root.ClcrResultReferenceData.PROFILE.id }, values);
}
function seedCalculation(root, formulaId, values, unit = 'mL/min/1,73 m²') {
  const dp = { id: formulaId, sourceFormulaId: formulaId, testKey: 'clcr:' + formulaId, label: 'Fikcyjny wynik ' + formulaId, valueNum: 1, unit, norm: '', tone: 'neutral' };
  const snapshot = root.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, root, formulaId), clinicalDateISO: '2026-10-25' });
  return root.ClcrSavedCalculation.recalculate(snapshot);
}

describe('Klirens saved calculation envelope and real recalculation', () => {
  it('roundtrips original inputs without invoking an engine during history read', () => {
    const root = environment(), note = acr(root);
    root.VildaClcrAcr = { evaluate() { throw new Error('history must not recalculate'); } };
    const read = root.ClcrSavedCalculation.readSaved(note);
    expect(read).toMatchObject({ valid: true, formulaId: 'ACR', rawValue: 45, category: 'A2', assessment: 'above', outOfRange: true, norm: '<30 mg/g' });
    expect(read.inputs.U_Alb).toBe('45');
    expect(root.ClcrSavedCalculation.describe(note).editable).toBe(true);
  });
  it.each(['date', 'value', 'valueNum', 'unit', 'norm'])('invalidates a saved envelope after incompatible %s editing', field => {
    const root = environment(), note = acr(root);
    if (field === 'date') note.clinicalDateISO = '2026-10-24';
    if (field === 'value') note.labResult.value = '100';
    if (field === 'valueNum') note.labResult.valueNum = 100;
    if (field === 'unit') note.labResult.unit = 'mg/mmol';
    if (field === 'norm') note.labResult.norm = '<3 mg/mmol';
    expect(root.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false, invalidated: true });
    expect(root.ClcrSavedCalculation.describe(note).editable).toBe(false);
  });
  it('retains frozen clinical context after an authorized merge of patient cards', () => {
    const root = environment(), note = acr(root);
    note.patientId = 'merged-target-patient';
    const read = root.ClcrSavedCalculation.readSaved(note);
    expect(read).toMatchObject({ valid: true, category: 'A2', context: { ageYears: 10 } });
    expect(read.snapshot.binding.patientId).toBe('fictional-patient');
    expect(note.id).toBe('fictional-note');
  });
  it('keeps absent or corrupt legacy data readable without allowing invented inputs', () => {
    const root = environment(), note = acr(root);
    expect(root.ClcrSavedCalculation.readSaved({ ...note, body: 'Legacy result' })).toBeNull();
    expect(root.ClcrSavedCalculation.describe({ ...note, body: 'Legacy result' }).editable).toBe(false);
    note.body = root.ClcrSavedCalculation.START + '\n{broken\n' + root.ClcrSavedCalculation.END;
    expect(root.ClcrSavedCalculation.readSaved(note)).toMatchObject({ valid: false });
  });
  it('ACR 45→13.6 replaces the complete assessment using the actual engine', () => {
    const root = environment(), note = acr(root), saved = root.ClcrSavedCalculation.readSaved(note);
    const computed = root.ClcrSavedCalculation.recalculate(saved, { values: { U_Alb: '13.6' } });
    expect(computed).toMatchObject({ id: 'ACR', sourceFormulaId: 'ACR', valueNum: 13.6, category: 'A1', tone: 'success', outOfRange: false, norm: '<30 mg/g' });
    expect(computed.acrSnapshot.input.albuminValue).toBe('13.6');
    expect(saved.inputs.U_Alb).toBe('45');
  });
  it('ACR corrected age 1.5 removes its old A2/reference and invalid numbers do not produce a result', () => {
    const root = environment(), saved = root.ClcrSavedCalculation.readSaved(acr(root));
    const computed = root.ClcrSavedCalculation.recalculate(saved, { ageYears: 1.5 });
    expect(computed).toMatchObject({ valueNum: 45, category: null, tone: 'neutral', norm: '', outOfRange: null });
    expect(computed.acrSnapshot.context.ageYears).toBe(1.5);
    expect(() => root.ClcrSavedCalculation.recalculate(saved, { values: { Ucr_spot: '0' } })).toThrow();
  });
  it('does not silently use a newer reference profile when the saved version differs', () => {
    const root = environment(), saved = root.ClcrSavedCalculation.readSaved(acr(root));
    saved.snapshot.assessment.acrSnapshot.profileVersion = 99;
    expect(() => root.ClcrSavedCalculation.recalculate(saved, { values: { U_Alb: '13.6' } })).toThrow(/profil/);
  });
  it('U25 uses the recorded sex, age, height and actual clinical engine', () => {
    const root = environment(), saved = root.ClcrSavedCalculation.readSaved(u25(root));
    const computed = root.ClcrSavedCalculation.recalculate(saved, { values: { Scr: '0.515' } });
    expect(computed.valueNum).toBeCloseTo(96.5843906782418, 12);
    expect(computed).toMatchObject({ id: 'ckid_u25', category: 'G1', tone: 'success', norm: '≥90 mL/min/1,73 m²' });
    expect(computed.capture.values.sex).toBe('F');
    expect(computed.capture.ageYears).toBe(10);
  });
  it('U25 age 1.5 removes G/90 reference, age zero is invalid, and rounding keeps the exact raw point', () => {
    const root = environment(), saved = root.ClcrSavedCalculation.readSaved(u25(root));
    const infant = root.ClcrSavedCalculation.recalculate(saved, { ageYears: 1.5, values: { height: '85', Scr: '0.4' } });
    expect(infant.valueNum).toBeCloseTo(70.55544724174037, 12);
    expect(infant).toMatchObject({ category: null, norm: '', tone: 'neutral' });
    expect(() => root.ClcrSavedCalculation.recalculate(saved, { ageYears: 0 })).toThrow();
    const boundary = root.ClcrSavedCalculation.recalculate(saved, { values: { Scr: '0.5545' } });
    expect(boundary.valueNum).toBeCloseTo(89.70416807807851, 12);
    expect(boundary).toMatchObject({ displayValue: '90', category: 'G2', tone: 'warning', boundary: '<90', comparator: '' });
  });
  it('preserves explicit empty/mol and acid/ion/unknown bases without a false fallback', () => {
    const root = environment(), note = acr(root), saved = root.ClcrSavedCalculation.readSaved(note);
    for (const basis of ['', 'acid', 'ion', 'unknown']) {
      const snapshot = saved.snapshot;
      snapshot.assessment.basis = basis;
      snapshot.assessment.acrSnapshot.reportingEntity = 'wrong-fallback';
      const payload = { ...note, body: '' };
      payload.body = root.ClcrSavedCalculation.serializeSnapshot(snapshot, payload);
      expect(root.ClcrSavedCalculation.readSaved(payload).basis).toBe(basis);
    }
  });
  it.each([
    ['PCR', 'U_Prot_spot', { U_Prot_spot: '45', U_Prot_spot_unit: 'mg/L', PCR_entry_mode: 'concentration' }],
    ['CaCr_spot', 'Ca_spot', { Ca_spot: '5', Ca_spot_unit: 'mg/dl', CaCr_entry_mode: 'concentration' }],
    ['OxCr_spot', 'Ox_Cr_spot', { Ox_Cr_spot: '100', Ox_Cr_spot_unit: 'umol/L', OxCr_entry_mode: 'concentration' }],
    ['CitCr_spot', 'Cit_Cr_spot', { Cit_Cr_spot: '200', Cit_Cr_spot_unit: 'umol/L', CitCr_entry_mode: 'concentration', sex: 'F' }],
    ['FENa_spot', 'U_Na_spot', { U_Na_spot: '50', S_Na_spot: '140' }],
    ['FEK_spot', 'U_K_spot', { U_K_spot: '30', S_K_spot: '4' }],
    ['FECl_spot', 'U_Cl_spot', { U_Cl_spot: '50', S_Cl_spot: '100' }],
    ['FEHCO3_spot', 'U_HCO3_spot', { U_HCO3_spot: '5', S_HCO3_spot: '24' }],
  ])('%s actually recomputes a changed input and roundtrips through its own production serializer', (formulaId, changedField, extra) => {
    const root = environment();
    const values = { age: '10', ageMonths: '0', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '0.6', Scr_spot_unit: 'mg/dl', ...extra };
    const initial = seedCalculation(root, formulaId, values, '%');
    const initialNote = persist(root, initial, values);
    const saved = root.ClcrSavedCalculation.readSaved(initialNote);
    expect(saved.valid).toBe(true);
    const changedValue = String(Number(values[changedField]) * 1.25);
    const updated = root.ClcrSavedCalculation.recalculate(saved, { values: { [changedField]: changedValue } });
    expect(updated.valueNum).not.toBe(initial.valueNum);
    const updatedNote = persist(root, updated, updated.capture.values);
    const updatedSaved = root.ClcrSavedCalculation.readSaved(updatedNote);
    expect(updatedSaved.valid).toBe(true);
    expect(updatedSaved.rawValue).toBe(updated.valueNum);
    expect(updatedSaved.unit).toBe(updated.unit);
    expect(updatedSaved.inputs[changedField]).toBe(changedValue);
    expect(updatedSaved.snapshot.assessment[({ PCR: 'pcr', CaCr_spot: 'cacr', OxCr_spot: 'oxcr', CitCr_spot: 'citcr', FENa_spot: 'fena', FEK_spot: 'fek', FECl_spot: 'fecl', FEHCO3_spot: 'fehco3' })[formulaId] + 'Snapshot']).toBeTruthy();
  });
  it.each(['egfr', 'egfr_cr_cys', 'ckid_u25_cys', 'ckid_u25_cr_cys', 'sch_idms', 'neonatal_egfr'])('%s calls its existing production engine and preserves the native indexed unit', formulaId => {
    const root = environment();
    const values = { age: formulaId === 'egfr' || formulaId === 'egfr_cr_cys' ? '50' : '10', ageMonths: '0', sex: 'F', height: '140', weight: '35', Scr: '0.6', ScrUnit: 'mg/dl', ScrAssay: 'enzymatic_idms', creatinineState: 'stable', CystatinC: '1.0', CystatinCStandardization: 'ERM-DA471/IFCC' };
    if (formulaId === 'neonatal_egfr') Object.assign(values, { age: '0', ageDays: '10', neonatalTermStatus: 'term', height: '52', weight: '3.5' });
    const initial = seedCalculation(root, formulaId, values);
    const note = persist(root, initial, values);
    const saved = root.ClcrSavedCalculation.readSaved(note);
    expect(saved.valid).toBe(true);
    const updated = root.ClcrSavedCalculation.recalculate(saved, { values: formulaId === 'ckid_u25_cys' ? { CystatinC: '0.9' } : { Scr: '0.5' } });
    expect(updated.valueNum).not.toBe(initial.valueNum);
    expect(updated.unit).toBe('mL/min/1,73 m²');
    if (formulaId === 'neonatal_egfr') expect(updated).toMatchObject({ category: null, norm: '', tone: 'neutral' });
  });
  it('data-only input readers never inspect live patient/workflow/session globals', () => {
    const root = environment();
    for (const key of ['document', 'ClcrUiWorkflow', 'VildaPatientContext', '__vildaClcrVersionValueVault', 'currentPatient']) Object.defineProperty(root, key, { enumerable: true, get() { throw new Error('Live patient state accessed: ' + key); } });
    for (const [formulaId, extra] of [
      ['PCR', { U_Prot_spot: '45', U_Prot_spot_unit: 'mg/L', PCR_entry_mode: 'concentration' }],
      ['CaCr_spot', { Ca_spot: '5', Ca_spot_unit: 'mg/dl', CaCr_entry_mode: 'concentration' }],
      ['CitCr_spot', { Cit_Cr_spot: '200', Cit_Cr_spot_unit: 'umol/L', CitCr_entry_mode: 'concentration', sex: 'F' }],
      ['FENa_spot', { U_Na_spot: '50', S_Na_spot: '140' }],
      ['FEK_spot', { U_K_spot: '30', S_K_spot: '4' }],
      ['FECl_spot', { U_Cl_spot: '50', S_Cl_spot: '100' }],
      ['FEHCO3_spot', { U_HCO3_spot: '5', S_HCO3_spot: '24' }],
    ]) {
      const values = { age: '10', ageMonths: '0', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '0.6', Scr_spot_unit: 'mg/dl', ...extra };
      expect(seedCalculation(root, formulaId, values, '%').valueNum).toBeGreaterThan(0);
    }
  });
  it('newborn editing rejects contradictory older age instead of silently using newborn arithmetic', () => {
    const root = environment();
    const values = { age: '0', ageMonths: '0', ageDays: '10', neonatalTermStatus: 'term', sex: 'F', height: '52', weight: '3.5', Scr: '0.6', ScrUnit: 'mg/dl', ScrAssay: 'enzymatic_idms' };
    const initial = seedCalculation(root, 'neonatal_egfr', values);
    const note = persist(root, initial, values);
    expect(() => root.ClcrSavedCalculation.recalculate(root.ClcrSavedCalculation.readSaved(note), { ageYears: 10 })).toThrow();
  });
  it('requires a real recorded creatinine unit while keeping cystatin-only U25 independent of creatinine', () => {
    const root = environment(), saved = root.ClcrSavedCalculation.readSaved(u25(root));
    for (const ScrUnit of ['', 'wrong-unit']) expect(() => root.ClcrSavedCalculation.recalculate(saved, { values: { ScrUnit, Scr: '88.4' } })).toThrow(/jednostk/);
    const values = { age: '10', ageMonths: '0', sex: 'F', CystatinC: '1', CystatinCStandardization: 'ERM-DA471/IFCC' };
    expect(seedCalculation(root, 'ckid_u25_cys', values).valueNum).toBeGreaterThan(0);
  });
  it('keeps existing cystatin and Jaffé method qualifications with the edited frozen result', () => {
    const root = environment();
    const values = { age: '10', ageMonths: '0', sex: 'F', height: '140', Scr: '0.6', ScrUnit: 'mg/dl', ScrAssay: 'jaffe_idms', CystatinC: '1', CystatinCStandardization: 'ERM-DA471/IFCC', CystatinCAssayMethod: 'immunoturbidimetric' };
    const initial = seedCalculation(root, 'ckid_u25_cr_cys', values);
    const saved = root.ClcrSavedCalculation.readSaved(persist(root, initial, values));
    const updated = root.ClcrSavedCalculation.recalculate(saved, { values: { CystatinC: '0.9' } });
    const read = root.ClcrSavedCalculation.readSaved(persist(root, updated, { ...values, CystatinC: '0.9' }));
    expect(read.comment).toContain('Podano metodę Jaffego kalibrowaną do IDMS.');
    expect(read.comment).toContain('Metoda cystatyny C: metodę immunoturbidymetryczną. NIDDK opisuje dla CKiD U25 oznaczenie nefelometryczne; uwzględnij możliwe ograniczenie porównywalności.');
    const correctedMethod = root.ClcrSavedCalculation.recalculate(saved, { values: { CystatinCAssayMethod: 'nephelometric' } });
    expect(correctedMethod.warnings.join(' ')).not.toContain('Metoda cystatyny C:');
    const cysOnly = seedCalculation(root, 'ckid_u25_cys', { age: '10', sex: 'F', CystatinC: '1' });
    expect(cysOnly.warnings.join(' ')).toContain('Metoda cystatyny C: nie określono metody.');
  });
  it('measured-reference plot bounds use exact saved endpoints, not the rounded displayed interval', () => {
    const root = environment(), note = u25(root), saved = root.ClcrSavedCalculation.readSaved(note);
    saved.snapshot.assessment.norm = '≈86,5–135,7 mL/min';
    saved.snapshot.assessment.unit = 'mL/min';
    saved.snapshot.assessment.model = { reference: { snapshot: { absoluteRange: { lower: 86.511111111111, upper: 135.733333333333 } } } };
    const payload = { ...note, labResult: { ...note.labResult, unit: 'mL/min', norm: saved.snapshot.assessment.norm } };
    payload.body = root.ClcrSavedCalculation.serializeSnapshot(saved.snapshot, payload);
    expect(root.ClcrSavedCalculation.readSaved(payload).reference.bounds).toEqual({ low: 86.511111111111, high: 135.733333333333, lowInclusive: true, highInclusive: true });
  });
  it.each([
    ['FENa_spot', 'Fena', 'fena', { U_Na_spot: '50', S_Na_spot: '140' }, true, false],
    ['FENa_spot', 'Fena', 'fena', { U_Na_spot: '50', S_Na_spot: '140' }, false, true],
    ['FEK_spot', 'Fek', 'fek', { U_K_spot: '40', S_K_spot: '4' }, true, false],
    ['FEK_spot', 'Fek', 'fek', { U_K_spot: '40', S_K_spot: '4' }, false, true],
    ['FECl_spot', 'Fecl', 'fecl', { U_Cl_spot: '50', S_Cl_spot: '100' }, true, false],
    ['FECl_spot', 'Fecl', 'fecl', { U_Cl_spot: '50', S_Cl_spot: '100' }, false, true],
    ['FEHCO3_spot', 'Fehco3', 'fehco3', { U_HCO3_spot: '5', S_HCO3_spot: '24' }, true, false],
    ['FEHCO3_spot', 'Fehco3', 'fehco3', { U_HCO3_spot: '5', S_HCO3_spot: '24' }, false, true],
  ])('%s retains its frozen known fact %s when an unmounted answer was absent from an older capture', (formulaId, name, key, extra, knownCKD, checkbox) => {
    const root = environment();
    const values = { age: '10', ageMonths: '0', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '0.6', Scr_spot_unit: 'mg/dl', spotKnownCKD: checkbox, ...extra };
    const initial = seedCalculation(root, formulaId, values, '%');
    const typed = root['VildaClcr' + name].evaluate({ ...initial[key + 'Snapshot'].input, knownCKD }, root['VildaClcr' + name + 'ReferenceData'].DEFAULT_POLICY);
    initial[key + 'Snapshot'] = typed;
    Object.assign(initial, { category: typed.category, tone: typed.tone, assessment: typed.status });
    root['Clcr' + name + 'Persistence'].augmentDatapoint({ getAttribute: () => JSON.stringify(typed) }, initial);
    const saved = root.ClcrSavedCalculation.readSaved(persist(root, initial, values));
    const unchanged = root.ClcrSavedCalculation.recalculate(saved);
    expect(unchanged[key + 'Snapshot'].knownFacts.knownCKD).toBe(knownCKD);
    for (const [answer, expected] of [['yes', true], ['no', false], ['unknown', null]]) {
      const updated = root.ClcrSavedCalculation.recalculate(saved, { values: { ui_spotKnownCKD_answer: answer } });
      expect(updated[key + 'Snapshot'].knownFacts.knownCKD).toBe(expected);
    }
    const explicitCheckbox = root.ClcrSavedCalculation.recalculate(saved, { values: { spotKnownCKD: !knownCKD }, changedFieldIds: ['spotKnownCKD'] });
    expect(explicitCheckbox[key + 'Snapshot'].knownFacts.knownCKD).toBe(!knownCKD);
  });
  it('FEK retains the exact selected paper and distinguishes an adult study interval from a healthy norm', () => {
    const root = environment();
    for (const age of ['10', '30']) {
      const values = { age, ageMonths: '0', U_K_spot: '40', S_K_spot: '4', Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '1', Scr_spot_unit: 'mg/dl' };
      const dp = seedCalculation(root, 'FEK_spot', values, '%');
      const saved = root.ClcrSavedCalculation.readSaved(persist(root, dp, values));
      const expectedSource = dp.fekSnapshot.sources.find(source => source.id === dp.fekSnapshot.reference.sourceIds[0]);
      expect(saved.source.id).toBe(expectedSource.id);
      if (age === '30') {
        expect(saved.norm).toBe('');
        expect(saved.reference).toBeNull();
        expect(saved.assessment).toBe('unassessed');
        expect(saved.contextReferences[0]).toMatchObject({ kind: 'observed-study-range', label: 'Zakres w badaniu dorosłych' });
      } else {
        expect(saved.reference.bounds).toMatchObject({ low: dp.fekSnapshot.reference.lower, high: dp.fekSnapshot.reference.upper });
      }
    }
  });
});
