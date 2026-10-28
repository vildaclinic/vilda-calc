import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-ca-dzm-persistence-only';
const LABEL = 'Wydalanie wapnia (DZM)';
function harness() {
  const w = {};
  for (const file of ['clcr_clinical_safety.js', 'clcr_ca_dzm_reference_data.js', 'clcr_ca_dzm.js', 'clcr_ca_dzm_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_legacy_calculator.js', 'clcr_saved_results.js']) loadBrowserScript(file, w);
  const vault = {}; loadBrowserScript('vilda_vault.js', vault);
  return { w, sanitizer: vault.VildaVault };
}
const standard = { CA_inputMode: 'concentration', CA_concentration: '5', CA_concentrationUnit: 'mmol/L', CA_volume: '1200', CA_volumeUnit: 'mL', CA_collectionHours: '24', CA_clinicalMode: 'general', weight: '30', age: '10', ageMonths: '0', sex: 'M' };
function capture(values, context = {}) {
  return { ...context, formulaId: 'Ca_mgkg', values, fields: Object.keys(values).map(id => ({ id, label: id, type: typeof values[id] === 'boolean' ? 'checkbox' : 'text', required: ['CA_concentration', 'CA_volume'].includes(id) })) };
}
function finish(h, dp, values, withCapture = true, context = {}) {
  const note = { id: 'fictional-ca-dzm-1', ...h.w.ClcrSavedResults.buildPatientNotePayload(dp, { patientId: PATIENT, clinicalDateISO: '2026-10-28' }) };
  if (withCapture) {
    const snapshot = h.w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, context) });
    note.body += '\n\n' + h.w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  }
  const original = note.body;
  note.body = h.sanitizer.sanitizeNoteText(note.body);
  note.labResult = h.sanitizer.sanitizeLabResult(note.labResult);
  expect(note.body).toBe(original);
  expect(h.sanitizer.isUnlocked()).toBe(false);
  return note;
}
function record(h, patch = {}, withCapture = true) {
  const values = { ...standard, ...patch };
  const dp = h.w.ClcrSavedLegacyCalculator.recalculate('Ca_mgkg', values);
  return { dp, values, note: finish(h, dp, values, withCapture) };
}
function project(h, notes) {
  return h.w.ClcrSavedResults.projectPatientNotes(Array.isArray(notes) ? notes : [notes], { patientId: PATIENT, formulaId: 'Ca_mgkg' });
}
function noEvaluation(h) {
  h.w.VildaClcrCaDzm = { evaluate() { throw new Error('History must not evaluate current policy'); }, formatValue() { throw new Error('History must not use a later display formatter'); } };
  h.w.ClcrCaDzmReferenceData = { get DEFAULT_POLICY() { throw new Error('History must not load current policy'); } };
}
function legacy(h, context = {}) {
  const values = { U_Ca: '30', V24: '1200', weight: '30', age: '10', ageMonths: '0', sex: 'M', collectionStartAt: '2026-10-24T08:00', collectionEndAt: '2026-10-25T08:00', collectionNoMissedVoids: false };
  const dp = { id: 'Ca_mgkg', sourceFormulaId: 'Ca_mgkg', testKey: 'clcr:Ca_mgkg', label: LABEL, rawValue: 12, valueNum: 12, displayValue: '12.0', unit: 'mg/kg/24 h', norm: '', assessment: 'unassessed', outOfRange: false, tone: 'neutral' };
  const snapshot = h.w.ClcrSavedCalculation.createSnapshot(dp, { capture: capture(values, context) });
  const note = { id: 'fictional-ca-dzm-legacy', patientId: PATIENT, category: 'wynik-klirens', clinicalDateISO: '2020-01-01', labResult: { test: LABEL, value: '12', valueNum: 12, unit: 'mg/kg/24 h' } };
  note.body = h.w.ClcrSavedCalculation.serializeSnapshot(snapshot, note);
  return { note, values, snapshot };
}

describe('Calcium DZM — frozen clinical record, patient-card projections and explicit edits', () => {
  it.each([
    [{},8.0156,'above'],
    [{CA_concentration:'0'},0,'unassessed'],
    [{CA_concentration:'0.00001'},0.0000160312,'within'],
    [{weight:''},240.468,'unassessed'],
    [{age:'45',sex:'F',CA_inputMode:'reported',CA_reportedValue:'220',CA_clinicalMode:'hypo'},220,'within'],
    [{age:'45',sex:'F',CA_inputMode:'reported',CA_reportedValue:'250',CA_clinicalMode:'phpt'},250,'unassessed'],
    [{age:'45',sex:'F',CA_inputMode:'reported',CA_reportedValue:'320',CA_clinicalMode:'phpt'},320,'above'],
  ])('preserves %j as%s/%s across lab note, history and charts', (fields,raw,assessment) => {
    const h=harness(),{dp,note}=record(h,fields);
    expect(dp.valueNum).toBe(raw);
    expect(note.labResult).toMatchObject({test:LABEL,testKey:'clcr-ca-dzm',value:dp.displayValue,valueNum:raw,unit:dp.unit});
    expect(h.w.ClcrCaDzmPersistence.savedAssessment(note)).toMatchObject(dp.caDzmSnapshot);
    expect(h.w.ClcrSavedCalculation.readSaved(note)).toMatchObject({valid:true,rawValue:raw,assessment});
    noEvaluation(h);
    expect(project(h,note).measurements[0]).toMatchObject({rawValue:raw,valueNum:raw,assessment,displayValue:dp.displayValue,unit:dp.unit,norm:dp.norm});
  });
  it('freezes source, diagnosis context and comments without today’s evaluation', () => {
    const h=harness(),{note,dp}=record(h,{CA_clinicalMode:'hypo'});
    expect(dp.caDzmSnapshot.input.clinicalContext).toBe('hypo');
    expect(note.body).toContain('Niedoczynność przytarczyc');
    noEvaluation(h);
    const point=project(h,note).measurements[0];
    expect(point.frozenAssessment.assessment.caDzmSnapshot.input.clinicalContext).toBe('hypo');
    expect(point.interpretation).toBe(dp.caDzmSnapshot.interpretation);
    expect(point.reference.bounds.high).toBe(4);
  });
  it('keeps daily and perkg chart series separate', () => {
    const h=harness(),a=record(h).note,b=record(h,{age:'45',sex:'M'}).note;b.id='fictional-ca-adult';
    noEvaluation(h);const result=project(h,[a,b]);
    expect(result.series).toHaveLength(2);
    expect(new Set(result.measurements.map(x=>x.unit))).toEqual(new Set(['mg/kg/24 h','mg/24 h']));
  });
  it.each(['raw','display','unit','date','clinical-context','assessment'])('a changed %s cannot revive an old recorded interpretation', kind => {
    const h=harness(),{note}=record(h);
    if(kind==='raw')note.labResult.valueNum=12;
    if(kind==='display')note.labResult.value='123';
    if(kind==='unit')note.labResult.unit='mg/24 h';
    if(kind==='date')note.clinicalDateISO='2020-01-01';
    if(kind==='clinical-context')note.body=note.body.replace('"general"','"hypo"');
    if(kind==='assessment')note.body=note.body.replace('"high"','"within"');
    expect(h.w.ClcrSavedCalculation.readSaved(note)?.valid).not.toBe(true);
    noEvaluation(h);
    const point=project(h,note).measurements[0];
    if(point)expect(point).toMatchObject({assessment:'unassessed',outOfRange:null,norm:''});
  });
  it('edits the current measurement inputs and clinical mode without importing today’s patient age', () => {
    const h=harness(),{note}=record(h,{CA_clinicalMode:'hypo'}),saved=h.w.ClcrSavedCalculation.readSaved(note);
    const editor=h.w.ClcrSavedCalculation.describe(note);
    expect(editor.editable).toBe(true);
    expect(editor.fields.find(x=>x.id==='CA_clinicalMode').options.map(x=>x.label)).toContain('Pierwotna nadczynność przytarczyc');
    expect(editor.fields.some(x=>x.id.startsWith('collection'))).toBe(false);
    const edited=h.w.ClcrSavedCalculation.recalculate(saved,{values:{CA_concentration:'1',CA_clinicalMode:'phpt'}});
    expect(edited.caDzmSnapshot).toMatchObject({rawValue:1.60312,status:'within',referenceText:'<4',input:{ageYears:10,clinicalContext:'phpt'}});
  });
  it('keeps legacy numbers frozen and requires explicit duration when old dates lack a timezone', () => {
    const h=harness(),{note}=legacy(h);
    const saved=h.w.ClcrSavedCalculation.readSaved(note);
    expect(saved).toMatchObject({valid:true,rawValue:12,assessment:'unassessed',norm:''});
    expect(()=>h.w.ClcrSavedCalculation.recalculate(saved,{values:{CA_concentration:'5'}})).toThrow(/czas/i);
    const edited=h.w.ClcrSavedCalculation.recalculate(saved,{values:{CA_concentration:'5',CA_collectionHours:'24'}});
    expect(edited.caDzmSnapshot).toMatchObject({valid:true,rawValue:8.0156,hours:24});
  });
  it('preserves a captured legacy duration and ignores the current device timezone', () => {
    const h=harness(),{note}=legacy(h,{durationMinutes:1440});
    const edited=h.w.ClcrSavedCalculation.recalculate(h.w.ClcrSavedCalculation.readSaved(note),{values:{CA_concentration:'5'}});
    expect(edited.caDzmSnapshot).toMatchObject({valid:true,rawValue:8.0156,hours:24});
  });
  it.each(['-1','0'])('invalid concentration/mass cannot become a new saved result: %s', value => {
    const h=harness(),{note}=record(h),saved=h.w.ClcrSavedCalculation.readSaved(note);
    expect(()=>h.w.ClcrSavedCalculation.recalculate(saved,{values:{weight:value}})).toThrow();
    if(value==='-1')expect(()=>h.w.ClcrSavedCalculation.recalculate(saved,{values:{CA_concentration:value}})).toThrow();
  });
});
