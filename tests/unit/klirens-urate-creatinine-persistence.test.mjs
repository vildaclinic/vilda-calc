import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const DATE='2026-11-02', PATIENT='fictional-kmcr-persistence';
const defaults={ URCR_inputMode:'concentration', URCR_uricAcid:'100', URCR_uricAcidUnit:'mg/dL', URCR_creatinine:'100', URCR_creatinineUnit:'mg/dL', URCR_reportedValue:'', URCR_reportedUnit:'mmol/mmol', URCR_specimen:'random', URCR_outputUnit:'mmol/mmol', age:'40', ageMonths:'0' };
function harness() {
  const w={};
  for(const file of ['clcr_clinical_safety.js','clcr_collection_duration.js','clcr_calculation_assumptions.js','clcr_result_reference_data.js','clcr_result_presentation.js','clcr_urate_creatinine_data.js','clcr_urate_creatinine.js','clcr_urate_creatinine_persistence.js','clcr_saved_calculation.js','clcr_saved_results.js','clcr_notes_view.js','clcr_saved_legacy_calculator.js'])loadBrowserScript(file,w);
  return w;
}
function record(w,patch={}) {
  const values={...defaults,...patch}, p=w.ClcrUrateCreatininePersistence, e=w.VildaClcrUrateCreatinine;
  const result=e.compute(e.inputFromValues(values),w.ClcrUrateCreatinineReferenceData.DEFAULT_POLICY);
  expect(result.valid).toBe(true);
  const dp={id:'KM_Cr',sourceFormulaId:'KM_Cr',capture:{formulaId:'KM_Cr',values,fields:p.captureFields(values)}};
  p.augmentDatapoint({getAttribute:()=>JSON.stringify(result)},dp);
  const note={id:'fictional-kmcr-note',rev:3,...w.ClcrSavedResults.buildPatientNotePayload(dp,{patientId:PATIENT,clinicalDateISO:DATE,comment:'Fikcyjny komentarz lekarza.'})};
  const snapshot=w.ClcrSavedCalculation.createSnapshot(dp,{clinicalDateISO:DATE});expect(snapshot).not.toBeNull();
  note.body+='\n\n'+w.ClcrSavedCalculation.serializeSnapshot(snapshot,note);
  const locked={};loadBrowserScript('vilda_vault.js',locked);expect(locked.VildaVault.isUnlocked()).toBe(false);
  note.body=locked.VildaVault.sanitizeNoteText(note.body);note.labResult=locked.VildaVault.sanitizeLabResult(note.labResult);
  return {values,result,dp,note};
}
function legacy(w,patch={}) {
 const values={U_UA:'0.04',Ucr:'100',age:'40',ageMonths:'0',...patch};
 const dp={id:'KM_Cr',sourceFormulaId:'KM_Cr',label:'Kwas moczowy/kreatynina (DZM)',unit:'mg/mg',rawValue:0.0004,valueNum:0.0004,displayValue:'0.000',assessment:'unassessed',outOfRange:null,tone:'neutral',norm:''};
 const note={id:'fictional-old-kmcr-note',rev:4,patientId:PATIENT,category:'wynik-klirens',clinicalDateISO:'2020-01-01',body:'Kalkulator klirensu · dawny zapis',labResult:{test:dp.label,value:'0',valueNum:dp.valueNum,unit:'mg/mg'}};
 const capture={formulaId:'KM_Cr',values,fields:Object.keys(values).map(id=>({id,label:id,type:'text',required:['U_UA','Ucr'].includes(id)}))};
 const snapshot=w.ClcrSavedCalculation.createSnapshot(dp,{capture});note.body+='\n\n'+w.ClcrSavedCalculation.serializeSnapshot(snapshot,note);return note;
}
const project=(w,note)=>w.ClcrSavedResults.projectPatientNotes(Array.isArray(note)?note:[note],{patientId:PATIENT});

describe('KM/Cr canonical persistence and explicit historical edits',()=>{
 it.each([
  [{},'above'],[{age:'8'},'within'],[{age:'2'},'within'],[{age:''},'unassessed'],[{age:'invalid'},'unassessed'],
  [{URCR_specimen:'timed'},'unassessed'],[{URCR_specimen:'unknown'},'unassessed'],[{URCR_uricAcid:'0'},'unassessed'],
  [{URCR_uricAcid:'0.04'},'below'],[{URCR_uricAcid:'0.4'},'below'],[{URCR_uricAcid:'1e-300'},'below'],
  [{URCR_inputMode:'reported',URCR_reportedValue:'0.53'},'within'],
  [{URCR_inputMode:'reported',URCR_reportedValue:'0.5300000000000000000001'},'above'],
  [{URCR_inputMode:'reported',URCR_reportedValue:'0.1099999999999999999999'},'below'],
  [{URCR_inputMode:'reported',URCR_reportedValue:'1000',URCR_reportedUnit:'mg/g'},'above'],
 ])('roundtrips %j through actual vault sanitizers, history and Notes', (patch,assessment)=>{
  const w=harness(),{note,dp}=record(w,patch),before=structuredClone(note);
  const saved=w.ClcrSavedCalculation.readSaved(note);expect(saved).toMatchObject({valid:true,unit:'mmol/mmol',valueNum:dp.valueNum,displayValue:dp.displayValue,assessment});
  const projected=project(w,note).measurements[0];expect(projected).toMatchObject({sourceFormulaId:'KM_Cr',unit:'mmol/mmol',displayValue:dp.displayValue,valueNum:dp.valueNum,assessment,norm:dp.norm});
  expect(note.labResult.value).toBe(dp.displayValue);expect(note.labResult.valueNum).toBe(dp.valueNum);
  const view=w.ClcrNotesView.model(note);expect(view).toMatchObject({display:dp.displayValue,unit:'mmol/mmol',norm:dp.norm});expect(view.comment).toBe('Fikcyjny komentarz lekarza.');
  expect(w.ClcrNotesView.summary(note)).not.toMatch(/Utrwalone dane|VILDA_CLCR_CALCULATION|\[dane\]|numerator/);
  expect(note).toEqual(before);
 });
 it('validates captured policy without current patient, source or public compute',()=>{
  const w=harness(),{note,dp}=record(w);
  w.VildaClcrUrateCreatinine=new Proxy({},{get(){throw new Error('History must not access the current clinical engine');}});
  w.ClcrUrateCreatinineReferenceData=new Proxy({},{get(){throw new Error('History must not read current references');}});
  w.__vildaClcrVersionValueVault={age:'8',URCR_uricAcid:'1',URCR_specimen:'timed'};
  expect(w.ClcrSavedCalculation.readSaved(note)).toMatchObject({valid:true,valueNum:dp.valueNum,assessment:'above'});
  expect(project(w,note).measurements[0]).toMatchObject({assessment:'above',context:{ageYears:40,specimen:'random'}});
 });
 it('reads and projects a frozen record when only history modules are loaded',()=>{
  const original=harness(),{note,dp}=record(original,{URCR_inputMode:'reported',URCR_reportedValue:'0.5300000000000000000001'}),reader={};
  for(const file of ['clcr_urate_creatinine_persistence.js','clcr_saved_calculation.js','clcr_saved_results.js','clcr_notes_view.js'])loadBrowserScript(file,reader);
  expect(reader.VildaClcrUrateCreatinine).toBeUndefined();expect(reader.ClcrUrateCreatinineReferenceData).toBeUndefined();
  expect(reader.ClcrSavedCalculation.readSaved(note)).toMatchObject({valid:true,displayValue:dp.displayValue,assessment:'above'});
  expect(project(reader,note).measurements[0]).toMatchObject({valueNum:dp.valueNum,norm:dp.norm,boundary:dp.boundary});
  expect(reader.ClcrNotesView.summary(note)).toBe(original.ClcrNotesView.summary(note));
 });
 it.each(['0.04','0.4','1e-300'])('never writes a positive %s numerator as zero text',uric=>{
  const w=harness(),{note,dp}=record(w,{URCR_uricAcid:uric});expect(dp.valueNum).toBeGreaterThan(0);expect(note.labResult.value).not.toMatch(/^0(?:[,.]0*)?$/);expect(project(w,note).measurements[0].displayValue).toBe(dp.displayValue);
 });
 it('keeps exact near-boundary classification and visible approximation in every projection',()=>{
  const w=harness(),{note,dp}=record(w,{URCR_inputMode:'reported',URCR_reportedValue:'0.5300000000000000000001'});
  expect(dp.valueNum).toBe(0.53);expect(dp.displayValue).toContain('≈');expect(dp.assessment).toBe('above');expect(dp.boundary).toBe('0,5300000000000000000001');
  expect(w.ClcrNotesView.model(note)).toMatchObject({display:dp.displayValue,boundary:dp.boundary,outOfRange:true});
 });
 it.each(['negative','reference','display','value','unit'])('rejects inconsistent typed snapshot %s',kind=>{
  const w=harness(),{dp}=record(w),bad=structuredClone(dp.urateCreatinineSnapshot);
  if(kind==='negative')bad.input.uricAcid='-100';if(kind==='reference')bad.reference.upper=999;if(kind==='display')bad.presentation.valueText='0';if(kind==='value')bad.rawValue=0;if(kind==='unit')bad.unit='mg/mg';
  expect(w.ClcrUrateCreatininePersistence.validSnapshot(bad)).toBe(false);
  expect(w.ClcrUrateCreatininePersistence.referenceNote({...dp,urateCreatinineSnapshot:bad})).toBe('');
 });
 it.each(['rawValue','valueNum','displayValue','norm','assessment','tone','unit','interpretation','boundary'])('rejects a contradictory canonical datapoint %s',key=>{
  const w=harness(),{dp}=record(w);const bad={...dp,[key]:typeof dp[key]==='number'?0:typeof dp[key]==='boolean'?!dp[key]:'wrong'};
  expect(()=>w.ClcrSavedResults.buildPatientNotePayload(bad,{patientId:PATIENT,clinicalDateISO:DATE})).toThrow();
 });
 it('invalidates a lab result changed outside its bound typed capture',()=>{
  const w=harness(),{note}=record(w);note.labResult.value='0';expect(w.ClcrSavedCalculation.readSaved(note).valid).toBe(false);
  expect(project(w,note).measurements[0]).toMatchObject({assessment:'unassessed',outOfRange:null,norm:'',tone:'neutral'});
 });
 it('retains legacy mass ratio/label/text without re-evaluating inputs on read',()=>{
  const w=harness(),note=legacy(w),before=structuredClone(note);const old=w.ClcrSavedCalculation.readSaved(note);expect(old).toMatchObject({valid:true,unit:'mg/mg',displayValue:'0.000',method:'Kwas moczowy/kreatynina (DZM)',norm:''});
  const p=project(w,note).measurements[0];expect(p).toMatchObject({label:'Kwas moczowy/kreatynina (DZM)',unit:'mg/mg',norm:'',group:'dzm-ratio'});expect(note).toEqual(before);
 });
 it('opens legacy editing with unknown specimen, then creates one precise typed molar record',()=>{
  const w=harness(),note=legacy(w),description=w.ClcrSavedCalculation.describe(note);expect(description.editable).toBe(true);expect(description.values).toMatchObject({URCR_uricAcid:'0.04',URCR_creatinine:'100',URCR_specimen:'unknown'});
  expect(description.fields.map(f=>f.id)).toContain('URCR_specimen');expect(description.fields.map(f=>f.id)).not.toContain('age');
  const dp=w.ClcrSavedCalculation.recalculate(description.snapshot,{values:description.values});expect(dp.valueNum).toBeGreaterThan(0);expect(dp.unit).toBe('mmol/mmol');expect(dp.assessment).toBe('unassessed');expect(dp.urateCreatinineSnapshot.input.specimen).toBe('unknown');
  expect(dp.capture.fields.map(f=>f.id)).toContain('URCR_specimen');expect(note.labResult.unit).toBe('mg/mg');
 });
 it.each([{URCR_uricAcid:'-1'},{URCR_creatinine:'-100'},{URCR_uricAcid:'-1',URCR_creatinine:'-100'},{URCR_creatinine:'0'},{URCR_uricAcid:'1e-400'}])('blocks invalid historical edits %j',patch=>{
  const w=harness(),d=w.ClcrSavedCalculation.describe(legacy(w));expect(()=>w.ClcrSavedCalculation.recalculate(d.snapshot,{values:{...d.values,...patch}})).toThrow();
 });
 it('requires explicit specimen correction before legacy data can use the random reference',()=>{
  const w=harness(),d=w.ClcrSavedCalculation.describe(legacy(w,{U_UA:'100'}));
  const unknown=w.ClcrSavedCalculation.recalculate(d.snapshot,{values:d.values});expect(unknown.norm).toBe('');
  const confirmed=w.ClcrSavedCalculation.recalculate(d.snapshot,{values:{...d.values,URCR_specimen:'random'},changedFieldIds:['URCR_specimen']});expect(confirmed).toMatchObject({assessment:'above',norm:'0,11–0,53 mmol/mmol'});
 });
 it('does not turn dormant random controls into historical provenance',()=>{
  const w=harness(),p=w.ClcrUrateCreatininePersistence;
  expect(p.prepareValues({U_UA:'1',Ucr:'100',URCR_specimen:'random'}).URCR_specimen).toBe('unknown');
  expect(p.prepareValues({U_UA:'1',Ucr:'100'},{specimen:'random'}).URCR_specimen).toBe('random');
 });
 it('separates different units/specimens in trends while retaining one formula identity',()=>{
  const w=harness(),a=record(w).note,b=record(w,{URCR_specimen:'timed'}).note;b.id='fictional-timed';const p=project(w,[a,b,legacy(w)]);
  expect(p.series).toHaveLength(3);expect(p.measurements.every(point=>point.sourceFormulaId==='KM_Cr')).toBe(true);expect(p.series.map(s=>s.method)).toEqual(expect.arrayContaining(['Próbka jednorazowa','DZM','Typ próbki nieutrwalony']));
 });
 it.each([{U_UA:'-1',Ucr:'100'},{U_UA:'1',Ucr:'-100'},{U_UA:'0',Ucr:'0'},{U_UA:'-1',Ucr:'-100'},{U_UA:'1e-400',Ucr:'100'},{U_UA:'1abc',Ucr:'100'},{U_UA:'1e300',Ucr:'1e-300'}])('rejects invalid compatibility producer data %j',values=>{
  const w=harness();expect(()=>w.ClcrSavedLegacyCalculator.recalculate('KM_Cr',values)).toThrow();
 });
 it('compatibility producer accepts exact zero and preserves a small positive mass ratio',()=>{
  const w=harness();expect(w.ClcrSavedLegacyCalculator.recalculate('KM_Cr',{U_UA:'0',Ucr:'100'})).toMatchObject({rawValue:0,unit:'mg/mg'});
  expect(w.ClcrSavedLegacyCalculator.recalculate('KM_Cr',{U_UA:'0.04',Ucr:'100'})).toMatchObject({rawValue:0.0004,displayValue:'0,0004',unit:'mg/mg'});
 });
 it('does not invent raw age fields when editing a typed context-only age',()=>{
  const w=harness(),values={...defaults};delete values.age;delete values.ageMonths;
  const e=w.VildaClcrUrateCreatinine,p=w.ClcrUrateCreatininePersistence,result=e.compute(e.inputFromValues(values,{ageYears:1.5}),w.ClcrUrateCreatinineReferenceData.DEFAULT_POLICY);
  const dp={id:'KM_Cr',sourceFormulaId:'KM_Cr',capture:{formulaId:'KM_Cr',values,ageYears:1.5,fields:p.captureFields(values)}};
  p.augmentDatapoint({getAttribute:()=>JSON.stringify(result)},dp);
  const note={id:'fictional-context-only-age',...w.ClcrSavedResults.buildPatientNotePayload(dp,{patientId:PATIENT,clinicalDateISO:DATE})};
  note.body+='\n\n'+w.ClcrSavedCalculation.serializeSnapshot(w.ClcrSavedCalculation.createSnapshot(dp),note);
  const description=w.ClcrSavedCalculation.describe(note);expect(description.values).not.toHaveProperty('age');
  const edited=w.ClcrSavedCalculation.recalculate(description.snapshot,{values:description.values});
  expect(edited.urateCreatinineSnapshot.input.ageYears).toBe(1.5);expect(edited.urateCreatinineSnapshot.input.knownFacts).not.toHaveProperty('age');expect(edited.norm).toBe('0,42–1,53 mmol/mmol');
 });
 it('edits a typed reported result with the frozen age and source policy',()=>{
  const w=harness(),{note}=record(w,{URCR_inputMode:'reported',URCR_reportedValue:'0.5'}),d=w.ClcrSavedCalculation.describe(note);
  w.ClcrUrateCreatinineReferenceData={DEFAULT_POLICY:{...w.ClcrUrateCreatinineReferenceData.DEFAULT_POLICY,id:'fictional-current-policy'}};
  w.__vildaClcrVersionValueVault={age:'1',URCR_specimen:'timed'};
  const dp=w.ClcrSavedCalculation.recalculate(d.snapshot,{values:{...d.values,URCR_reportedValue:'0.6'},changedFieldIds:['URCR_reportedValue']});
  expect(dp.urateCreatinineSnapshot.input.ageYears).toBe(40);expect(dp.norm).toBe('0,11–0,53 mmol/mmol');expect(dp.assessment).toBe('above');
  expect(dp.urateCreatinineSnapshot.referencePolicy.id).toBe(d.snapshot.assessment.urateCreatinineSnapshot.referencePolicy.id);
 });
 it('does not reintroduce the removed high-result sentence in records or Notes',()=>{
  const w=harness(),{note}=record(w),removed='Sam wynik nie rozpoznaje kamicy ani nie zastępuje oceny dobowego wydalania.';
  expect(w.ClcrNotesView.model(note).interpretation).toBe('Podwyższony KM/Cr może wskazywać na zwiększone wydalanie kwasu moczowego.');expect(note.body).not.toContain(removed);
 });
});
