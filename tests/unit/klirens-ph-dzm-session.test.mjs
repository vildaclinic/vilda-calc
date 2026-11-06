import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { patchPhDzmSessionHooks, phDzmSessionSource } from '../../tools/patch-klirens-ph-dzm-session.mjs';

const source = readFileSync(new URL('../../inline_kalkulator_klirens_07.js', import.meta.url), 'utf8');

function eventTarget(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); },
  });
}

// Execute the complete production session runtime. This fixture supplies only
// its DOM/persistence boundary; it does not reproduce restoration decisions.
function runtime(initial = {}) {
  const values = {
    formulaPicker: 'pH_spot', age: '10', ageMonths: '', ageDays: '', sex: 'F', weight: '30', height: '140',
    U_pH: '8.0001', pH24: '7.1234', spotSampleKind: 'random',
    spotInfection: true, ui_spotInfection_answer: 'yes', spotHematuria: false, ui_spotHematuria_answer: 'no',
    spotMenstruation: false, ui_spotMenstruation_answer: 'unknown',
    spotExercise: false, ui_spotExercise_answer: '', spotAcuteIllness: false, ui_spotAcuteIllness_answer: '',
    spotSameSpecimen: true, ui_spotSameSpecimen_answer: 'yes',
    spotPairedChemistry: false, ui_spotPairedChemistry_answer: 'no', FENa_sample_status: 'different-time',
    spotKnownCKD: true, ui_spotKnownCKD_answer: 'yes', spotDiureticUse: false, ui_spotDiureticUse_answer: 'unknown',
    suspectedAKI: true, ui_suspectedAKI_answer: 'yes', creatinineState: 'rapidlyChanging',
    stoneSpotFasting: true, stonePhPersistent: true, stoneUtiExcluded: false,
    Ucr_spot_unit: 'mmol/L', Scr_spot_unit: 'umol', U_PO4_spot_unit: 'mmol/L', S_PO4_spot_unit: 'mmol/L',
    tmpBurosumab: true, tmpDaysSinceDose: '14',
    tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: 'no',
    tmpOvernightFasting: true, ui_tmpOvernightFasting_answer: '',
    spotBicarbonateLoad: true, ui_spotBicarbonateLoad_answer: 'yes',
    spotNagmaContext: false, ui_spotNagmaContext_answer: 'unknown',
    ...initial,
  };
  const controls = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, eventTarget(typeof value === 'boolean'
    ? { id, tagName: 'INPUT', type: 'checkbox', checked: value }
    : { id, tagName: id === 'formulaPicker' || id.endsWith('_unit') ? 'SELECT' : 'INPUT', type: 'text', value })]));
  const form = eventTarget({ querySelectorAll: () => Object.values(controls) });
  const clearBtn = eventTarget({ id: 'clearBtn', type: 'button' });
  const document = eventTarget({ getElementById: id => id === 'clcrForm' ? form : id === 'clearBtn' ? clearBtn : controls[id] || null, querySelector: () => null });
  const storage = new Map();
  const window = eventTarget({ currentVersion: 'spot', sessionStorage: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  } });
  // Date-based legacy collection migration is provided by these real modules
  // in the application; omitting them would turn known dates into unknown time.
  loadBrowserScript('clcr_clinical_safety.js', window);
  loadBrowserScript('clcr_collection_duration.js', window);
  const context = { window, document, setTimeout: () => 0, clearTimeout() {} };
  vm.createContext(context); vm.runInContext(source, context);
  return { api: window, context, controls, clearBtn, document, storage };
}

function restore(session, initial, options = {}) {
  const result = runtime(initial), original = structuredClone(session);
  expect(result.api.applyClcrSessionSnapshot(session, { update: false, preserveAcrossVersions: true, ...options })).toBe(true);
  expect(session).toEqual(original);
  return result;
}


const initialDzm = {
  formulaPicker: 'pH24', pH24: '8.0001', Cl24DurationHours: '12', Cl24DurationSource: 'hours',
  durationNeedsConfirmation: false, Cl24CollectionProblem: true,
  PH24_sampleType: 'timed', PH24_sampleSource: 'reported', PH24_preservative: 'acid', PH24_infection: 'true',
  collectionStorageFollowed: false, ui_collectionStorageFollowed_answer: 'no',
};
const input = (result, id) => result.controls[id]?.type === 'checkbox' ? result.controls[id].checked : result.controls[id]?.value;

describe('pH DZM — actual session runtime retains measured value and collection facts', () => {
  it.each([0, '0', '4.4999', '4,5', '8', '8.0001', '14'])('restores %s exactly, independently from spot pH', pH24 => {
    const result = restore({ selectedFormula: 'pH24', inputs: { pH24, U_pH: '6.1234', Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h' } }, initialDzm);
    expect(result.controls.pH24.value).toBe(String(pH24));
    expect(result.controls.U_pH.value).toBe('6.1234');
    expect(result.api.buildClcrSessionSnapshot().inputs.pH24).toBe(String(pH24));
  });
  it('an incoming patient without pH DZM does not inherit the previous result or specimen facts', () => {
    const result = restore({ selectedFormula: 'ACR', inputs: { age: '12' } }, initialDzm);
    expect(result.controls.pH24.value).toBe('');
    for (const id of result.api.ClcrPhDzmSession.SAMPLE_IDS) expect(input(result,id)).toBe('');
  });
  it('an explicit blank wins over a preserved measurement', () => {
    const result = restore({ selectedFormula: 'pH24', inputs: { pH24: '' }, preservedInputs: { pH24: '8.2' } }, initialDzm);
    expect(result.controls.pH24.value).toBe('');
  });
  it('a preserved-only session resolves pH24 without borrowing the previous specimen', () => {
    const result = restore({ preservedInputs: { formulaPicker: 'pH24', pH24: '4.4999', Cl24DurationHours: '24', Cl24DurationSource: 'captured', PH24_preservative: 'boric-acid' } }, initialDzm);
    expect(result.controls.formulaPicker.value).toBe('pH24');
    expect(result.controls.pH24.value).toBe('4.4999');
    expect(input(result,'PH24_preservative')).toBe('boric-acid');
  });
  it('historical missing duration stays missing while its measured pH remains available', () => {
    const result = restore({ selectedFormula: 'pH24', inputs: { pH24: '5.2' } }, initialDzm);
    expect(input(result,'Cl24DurationHours')).toBe('');
    expect(input(result,'Cl24DurationSource')).toBe('historical-missing');
    expect(input(result,'durationNeedsConfirmation')).toBe(true);
    expect(input(result,'pH24')).toBe('5.2');
  });
  it('keeps known collection duration and storage problems through two JSON cycles', () => {
    const values = { ...initialDzm, pH24: '8.0001' };
    let saved = restore({ selectedFormula: 'pH24', inputs: values }, initialDzm).api.buildClcrSessionSnapshot();
    for (let i=0;i<2;i+=1) {
      const result = restore(JSON.parse(JSON.stringify(saved)), initialDzm);
      expect(input(result,'Cl24DurationHours')).toBe('12');
      expect(input(result,'PH24_preservative')).toBe('acid');
      expect(input(result,'PH24_infection')).toBe('true');
      expect(input(result,'ui_collectionStorageFollowed_answer')).toBe('no');
      expect(input(result,'pH24')).toBe('8.0001');
      saved = result.api.buildClcrSessionSnapshot();
    }
  });
  it('ordinary formula switches preserve the pH DZM and its dedicated metadata', () => {
    const result = restore({ selectedFormula: 'pH24', inputs: initialDzm }, initialDzm);
    for (const formula of ['ACR','pH_spot','Ca_Cit','pH24']) {
      result.api.clcrCaptureVersionValues({force:true});
      result.controls.formulaPicker.value=formula;
      result.api.clcrRestoreVersionValues({visibleOnly:false});
      expect(input(result,'pH24')).toBe('8.0001');
      expect(input(result,'PH24_preservative')).toBe('acid');
      expect(input(result,'Cl24DurationHours')).toBe('12');
    }
  });
  it('clear removes the measured value and retains whitelisted factual context', () => {
    const result=runtime(initialDzm);
    const saved=result.api.buildClcrSessionSnapshot().inputs;
    result.document.dispatchEvent({type:'DOMContentLoaded'});
    result.clearBtn.dispatchEvent({type:'click',clcrClearedFormula:'pH24',clcrPreservedPhDzmContext:saved});
    expect(input(result,'pH24')).toBe('');
    for(const id of result.api.ClcrPhDzmSession.CONTEXT_IDS) if(Object.hasOwn(saved,id)) expect(input(result,id),id).toBe(saved[id]);
    expect(result.api.__vildaClcrVersionValueVault.pH24).toBe('');
  });
  it('clear preserves vault-only metadata without creating controls or accepting arbitrary fields',()=>{
    const result=runtime(initialDzm); delete result.controls.PH24_preservative;
    result.document.dispatchEvent({type:'DOMContentLoaded'});
    result.clearBtn.dispatchEvent({type:'click',clcrClearedFormula:'pH24',clcrPreservedPhDzmContext:{PH24_preservative:'acid',pH24:'9',arbitrary:'unsafe',Cl24DurationHours:Number.NaN}});
    expect(result.api.__vildaClcrVersionValueVault.PH24_preservative).toBe('acid');
    expect(result.api.__vildaClcrVersionValueVault.pH24).toBe('');
    expect(Object.hasOwn(result.api.__vildaClcrVersionValueVault,'arbitrary')).toBe(false);
    expect(Object.hasOwn(result.api.__vildaClcrVersionValueVault,'Cl24DurationHours')).toBe(false);
  });
  it('no-session external rehydration clears a preceding DZM value and dedicated facts',()=>{
    const result=runtime(initialDzm);
    expect(result.api.__vildaClcrRehydrate()).toBe(true);
    expect(input(result,'pH24')).toBe('');
    for(const id of result.api.ClcrPhDzmSession.SAMPLE_IDS)expect(input(result,id)).toBe('');
  });
  it('does not adopt spot infection or the spot specimen type as DZM facts',()=>{
    const result=restore({selectedFormula:'pH24',inputs:{pH24:'6.5',Cl24DurationHours:'24',spotInfection:true,spotSampleKind:'random'}},initialDzm);
    expect(input(result,'PH24_infection')).toBe('');
    expect(input(result,'PH24_sampleType')).toBe('');
    expect(result.controls.spotInfection.checked).toBe(true);
  });
  it('restores a fresh 24h session into the actual engine with one pH field and the same active norm',()=>{
    const result=restore({selectedFormula:'pH24',inputs:{pH24:'5.2',Cl24DurationHours:'24',Cl24DurationSource:'assumed-24h'}},initialDzm);
    for(const file of ['clcr_ph_dzm_reference_data.js','clcr_ph_dzm.js'])loadBrowserScript(file,result.api);
    const engine=result.api.VildaClcrPhDzm;
    const assessment=engine.evaluate(engine.readInputFromDocument(result.document),result.api.VildaClcrPhDzmReferenceData.DEFAULT_POLICY);
    expect(assessment).toMatchObject({valid:true,rawValue:5.2,status:'within',referenceActive:true,input:{infection:null,sampleType:'timed'}});
  });
  it('preserves Boolean infection metadata in the vault when no control exists for it',()=>{
    const result=runtime(initialDzm);delete result.controls.PH24_infection;
    expect(result.api.applyClcrSessionSnapshot({selectedFormula:'pH24',inputs:{pH24:'8.2',Cl24DurationHours:'24',PH24_infection:true}},{update:false,preserveAcrossVersions:true})).toBe(true);
    for(const file of ['clcr_ph_dzm_reference_data.js','clcr_ph_dzm.js'])loadBrowserScript(file,result.api);
    expect(result.api.VildaClcrPhDzm.readInputFromDocument(result.document).infection).toBe(true);
    expect(result.api.buildClcrSessionSnapshot().inputs.PH24_infection).toBe(true);
  });
  it('does not turn a different formula’s sample context into hidden DZM metadata',()=>{
    const result=restore({selectedFormula:'ACR',inputs:{age:'12'},sourceContext:{sampleType:'spot',preservative:'acid',infection:true}},initialDzm);
    for(const id of result.api.ClcrPhDzmSession.SAMPLE_IDS)expect(input(result,id)).toBe('');
  });
  it('does not reparse historical local dates into a new inferred duration',()=>{
    const result=restore({selectedFormula:'pH24',inputs:{pH24:'5.2',collectionStartAt:'2020-01-01T08:00:00',collectionEndAt:'2020-01-01T20:00:00'}},initialDzm);
    expect(input(result,'Cl24DurationHours')).toBe('');
    expect(input(result,'Cl24DurationSource')).toBe('historical-missing');
    expect(input(result,'pH24')).toBe('5.2');
  });
  it('retains a numeric duration previously captured from legacy dates',()=>{
    const result=restore({selectedFormula:'pH24',inputs:{pH24:'5.2',Cl24DurationHours:'12',Cl24DurationSource:'legacy-dates'}},initialDzm);
    expect(input(result,'Cl24DurationHours')).toBe('12');
    expect(input(result,'Cl24DurationSource')).toBe('legacy-dates');
  });
  it('restores dedicated specimen facts from its own frozen source context',()=>{
    const result=restore({selectedFormula:'pH24',inputs:{pH24:'5.2'},sourceContext:{phDzmSnapshot:{input:{collectionHours:'12',durationSource:'captured',sampleType:'timed',preservative:'acid',infection:true}}}},initialDzm);
    expect(input(result,'Cl24DurationHours')).toBe('12');
    expect(input(result,'Cl24DurationSource')).toBe('captured');
    expect(input(result,'PH24_preservative')).toBe('acid');
    expect(input(result,'PH24_infection')).toBe('true');
  });
  it.each(['cl24', 'Na_mmol_d', 'Ca_mgkg', 'pH_spot'])('inactive pH DZM does not overwrite %s default collection time', selectedFormula=>{
    const result=restore({selectedFormula,inputs:{pH24:'5.5',Cl24DurationHours:'',Cl24DurationSource:'assumed-24h',PH24_preservative:'acid'}},initialDzm);
    expect(input(result,'Cl24DurationHours')).toBe('24');
    expect(input(result,'Cl24DurationSource')).toBe('assumed-24h');
    expect(input(result,'pH24')).toBe('5.5');
    expect(input(result,'PH24_preservative')).toBe('acid');
  });
  it('does not add pH keys to a session whose calculator never rendered them',()=>{
    const result=runtime({formulaPicker:'ACR'});
    delete result.controls.pH24;
    expect(result.api.applyClcrSessionSnapshot({selectedFormula:'ACR',inputs:{age:'12'}},{update:false,preserveAcrossVersions:true})).toBe(true);
    const saved=result.api.buildClcrSessionSnapshot();
    for(const id of ['pH24',...result.api.ClcrPhDzmSession.SAMPLE_IDS]){
      expect(Object.hasOwn(saved.inputs,id),id).toBe(false);
      expect(Object.hasOwn(result.api.__vildaClcrVersionValueVault,id),id).toBe(false);
    }
  });
  it('an empty new pH DZM session retains the shared fresh24h default',()=>{
    const result=restore({selectedFormula:'pH24',inputs:{}},initialDzm);
    expect(input(result,'pH24')).toBe('');
    expect(input(result,'Cl24DurationHours')).toBe('24');
    expect(input(result,'Cl24DurationSource')).toBe('assumed-24h');
    for(const id of result.api.ClcrPhDzmSession.SAMPLE_IDS)expect(input(result,id)).toBe('');
  });
  it('installs synchronously before DOM readiness and restoration calls',()=>{
    const result=runtime(initialDzm);
    expect(result.api.ClcrPhDzmSession.CONTEXT_IDS).toContain('PH24_preservative');
    expect(result.api.applyClcrSessionSnapshot({selectedFormula:'pH24',inputs:{pH24:'6.2',Cl24DurationHours:'24'}},{update:false})).toBe(true);
    expect(input(result,'pH24')).toBe('6.2');
    expect(input(result,'PH24_preservative')).toBe('');
  });
  it('the readable adapter is reproducible and cannot be installed twice',()=>{
    expect(source).toContain(phDzmSessionSource);
    expect(patchPhDzmSessionHooks(source)).toBe(source);
    expect(()=>patchPhDzmSessionHooks(source.replace('function installPhDzmSessionAdapter()', 'function corruptedAdapter()'))).toThrow();
  });
});
