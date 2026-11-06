import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const PATIENT = 'fictional-ph-dzm-record';
function harness() {
  const w = {};
  for (const file of ['clcr_ph_dzm_reference_data.js', 'clcr_ph_dzm.js', 'clcr_ph_dzm_persistence.js', 'clcr_saved_calculation.js', 'clcr_saved_legacy_calculator.js', 'clcr_saved_results.js']) loadBrowserScript(file,w);
  const locked = {}; loadBrowserScript('vilda_vault.js',locked);
  return {w,sanitizer:locked.VildaVault};
}
function record(h,input='5.2',extra={},withCapture=false) {
  const values={pH24:input,Cl24DurationHours:'24',Cl24DurationSource:'assumed-24h',...extra};
  const engine=h.w.VildaClcrPhDzm;
  const snapshot=engine.evaluate(engine.inputFromValues(values),h.w.VildaClcrPhDzmReferenceData.DEFAULT_POLICY);
  const dp={id:'pH24',sourceFormulaId:'pH24',label:'pH moczu (DZM)',testKey:'clcr:pH24'};
  h.w.ClcrPhDzmPersistence.augmentDatapoint({getAttribute:()=>JSON.stringify(snapshot)},dp);
  const note={id:'fictional-ph24-'+input,...h.w.ClcrSavedResults.buildPatientNotePayload(dp,{patientId:PATIENT,clinicalDateISO:'2026-11-06'})};
  if(withCapture){
    const capture={formulaId:'pH24',values,fields:h.w.ClcrPhDzmPersistence.captureFields(values)};
    const full=h.w.ClcrSavedCalculation.createSnapshot(dp,{capture});
    note.body+='\n\n'+h.w.ClcrSavedCalculation.serializeSnapshot(full,note);
  }
  const original=note.body;
  note.body=h.sanitizer.sanitizeNoteText(note.body);
  note.labResult=h.sanitizer.sanitizeLabResult(note.labResult);
  expect(note.body).toBe(original);
  expect(h.sanitizer.isUnlocked()).toBe(false);
  return {dp,note,values};
}
const project=(h,note)=>h.w.ClcrSavedResults.projectPatientNotes([note],{patientId:PATIENT,formulaId:'pH24'}).measurements[0];
function disableCurrentEngines(h){
  h.w.VildaClcrPhDzm={evaluate(){throw new Error('Reading a record must not re-evaluate pH');}};
  h.w.VildaClcrPhDzmReferenceData={getPolicy(){throw new Error('Reading a record must not pick today’s policy');}};
}

describe('pH DZM — frozen records, exact measurements and separate history identity',()=>{
  it.each([['0',0,'below'],['4.4999',4.4999,'below'],['4.5',4.5,'within'],['8',8,'within'],['8.0001',8.0001,'above'],['14',14,'above']])('keeps %s exact through the real vault sanitizer and history',(entered,raw,assessment)=>{
    const h=harness(),{dp,note}=record(h,entered);
    expect(note.labResult).toMatchObject({test:'pH moczu (DZM)',testKey:'clcr-ph24',unit:'—',valueNum:raw,norm:'4,5–8,0'});
    expect(h.w.ClcrPhDzmPersistence.savedAssessment(note)).toMatchObject(dp.phDzmSnapshot);
    disableCurrentEngines(h);
    const point=project(h,note);
    expect(point).toMatchObject({valueNum:raw,rawValue:raw,assessment,outOfRange:assessment!=='within',phDzmAssessment:dp.phDzmSnapshot});
    expect(point.reference).toMatchObject({text:'4,5–8,0',bounds:{low:4.5,high:8,lowInclusive:true,highInclusive:true},profileId:dp.phDzmSnapshot.policy.id});
    expect(point.source.id).toBe(dp.phDzmSnapshot.reference.sourceIds[0]);
  });
  it.each([{PH24_preservative:'acid'},{Cl24DurationHours:'12'},{Cl24CollectionProblem:true},{ui_collectionStorageFollowed_answer:'no'},{PH24_sampleType:'spot'}])('retains a known incompatible collection without manufacturing normality: %j',extra=>{
    const h=harness(),{note,dp}=record(h,'5.2',extra);
    expect(note.labResult).not.toHaveProperty('norm');
    disableCurrentEngines(h);
    const point=project(h,note);
    expect(point).toMatchObject({valueNum:5.2,assessment:'unassessed',outOfRange:null,tone:'neutral',norm:'',phDzmAssessment:dp.phDzmSnapshot});
    expect(point.reference.bounds).toBe(null);
  });
  it('preserves explicit infection as context without silently turning a high value into within-range',()=>{
    const h=harness(),{note,dp}=record(h,'8.2',{PH24_infection:'true'});
    disableCurrentEngines(h);
    expect(project(h,note)).toMatchObject({assessment:'above',outOfRange:true,knownFacts:{PH24_infection:'true'},interpretation:dp.phDzmSnapshot.interpretation});
    expect(project(h,note).interpretation).not.toContain('Wynik w zakresie');
  });
  it('retains a complete editable capture using the same frozen pH assessment',()=>{
    const h=harness(),{note,dp}=record(h,'4.4999',{},true);
    const capture=h.w.ClcrSavedCalculation.readSaved(note);
    expect(capture).toMatchObject({valid:true,valueNum:4.4999,assessment:'below',outOfRange:true});
    disableCurrentEngines(h);
    const point=project(h,note);
    expect(point).toMatchObject({status:'recorded',valueNum:4.4999,assessment:'below'});
    expect(point.savedCalculation.snapshot.assessment.phDzmSnapshot).toMatchObject(dp.phDzmSnapshot);
  });
  it('keeps a historical untyped value unassessed even when an old boolean or norm implies normality',()=>{
    const h=harness();disableCurrentEngines(h);
    const note={id:'fictional-old-ph24',patientId:PATIENT,category:'wynik-klirens',clinicalDateISO:'2020-01-01',body:'Kalkulator klirensu · clcr:pH24',labResult:{test:'pH moczu (DZM)',unit:'—',value:'5,20',valueNum:5.2,norm:'4,5–8,0'}};
    expect(project(h,note)).toMatchObject({valueNum:5.2,assessment:'unassessed',outOfRange:null,tone:'neutral',norm:''});
  });
  it('does not reuse a frozen assessment after the recorded core value has been changed',()=>{
    const h=harness(),{note}=record(h,'8.2');note.labResult.valueNum=5.2;note.labResult.value='5,2';
    disableCurrentEngines(h);
    const point=project(h,note);
    expect(point).toMatchObject({valueNum:5.2,assessment:'unassessed',outOfRange:null,tone:'neutral',norm:''});
    expect(point.phDzmAssessment).toBeUndefined();
  });
  it('keeps spot and DZM pH in distinct groups despite the same number and unit',()=>{
    const h=harness(),{note}=record(h,'5.2');
    const spot={...structuredClone(note),id:'fictional-spot',body:'Kalkulator klirensu · clcr:pH_spot',labResult:{test:'pH moczu (próbka punktowa)',unit:'—',value:'5,2',valueNum:5.2}};
    const series=h.w.ClcrSavedResults.buildSeriesFromNotes([note,spot],{patientId:PATIENT});
    expect(series.map(x=>x.sourceFormulaId).sort()).toEqual(['pH24','pH_spot']);
    expect(new Set(series.map(x=>x.key)).size).toBe(2);
  });
  it('fails closed rather than saving a mismatched raw number or missing typed assessment',()=>{
    const h=harness(),{dp}=record(h,'4.4999');
    for(const changed of [{valueNum:4.5},{rawValue:4.5},{phDzmSnapshot:null},{norm:''},{outOfRange:false}]){
      expect(()=>h.w.ClcrSavedResults.buildPatientNotePayload({...dp,...changed},{patientId:PATIENT,clinicalDateISO:'2026-11-06'})).toThrow();
    }
  });
});
