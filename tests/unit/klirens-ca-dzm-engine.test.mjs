import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_ca_dzm_reference_data.js', 'clcr_ca_dzm.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrCaDzm, policy = browser.ClcrCaDzmReferenceData.DEFAULT_POLICY;
const base = { concentration: '5', concentrationUnit: 'mmol/L', volume: '1200', volumeUnit: 'mL', hours: '24', weightKg: '30', ageYears: 10 };
const calc = (patch = {}, data = policy) => engine.evaluate({ ...base, ...patch }, data);
const reported = (value, patch = {}) => calc({ mode: 'reported', reportedValue: String(value), reportedUnit: 'mg/kg/24h', ...patch });
const clone = value => JSON.parse(JSON.stringify(value));

describe('Calcium DZM — actual production calculation and optional patient data', () => {
  it('uses 40.078 mg/mmol: age10,30kg,5mmol/L,1200mL →8.0156 and240.468', () => {
    const m = calc();
    expect(m).toMatchObject({ valid: true, rawValue: 8.0156, dailyMg: 240.468, perKg: 8.0156, unit: 'mg/kg/24 h', display: { text: '8,02' }, status: 'high', tone: 'warning', referenceText: '<4' });
    expect(m.exactMain).toEqual({ numerator: '20039', denominator: '2500' });
    expect(JSON.parse(JSON.stringify(m))).toEqual(m);
    for (const value of [m, m.input, m.reference, m.sources, m.notes, m.referenceRows]) expect(Object.isFrozen(value)).toBe(true);
  });
  it.each([['5', 'mmol/L', '1200', 'mL'], ['20.039', 'mg/dL', '1.2', 'L'], ['200.39', 'mg/L', '1200', 'mL']])('one conversion policy for %s %s ×%s %s', (concentration, concentrationUnit, volume, volumeUnit) => {
    expect(calc({ concentration, concentrationUnit, volume, volumeUnit })).toMatchObject({ valid: true, rawValue: 8.0156, dailyMg: 240.468, status: 'high' });
  });
  it.each([['240.468', 'mg/24h'], ['6', 'mmol/24h'], ['8.0156', 'mg/kg/24h']])('reported %s %s is already daily and ignores dormant fields', (value, unit) => {
    expect(reported(value, { reportedUnit: unit, concentration: '-1', volume: 'bad', hours: '12' })).toMatchObject({ valid: true, rawValue: 8.0156, dailyMg: 240.468, hours: 24, status: 'high' });
  });
  it.each([['', 10], ['', null], ['30', null]])('missing weight %s /age%s preserves a computable daily amount', (weightKg, ageYears) => {
    expect(calc({ weightKg, ageYears })).toMatchObject({ valid: true, dailyMg: 240.468, rawValue: 240.468, unit: 'mg/24 h', status: 'unassessed', tone: 'neutral', reference: null });
  });
  it('adults use daily mg even with a known mass, without changing the source threshold', () => {
    expect(calc({ ageYears: 45, sex: 'M' })).toMatchObject({ rawValue: 240.468, unit: 'mg/24 h', perKg: 8.0156, referenceText: '<250', status: 'within' });
    expect(calc({ ageYears: 45, sex: 'M', weightKg: '' })).toMatchObject({ rawValue: 240.468, unit: 'mg/24 h', perKg: null, referenceText: '<250', status: 'within' });
  });
  it('reported perkg does not need mass for the number or the pediatric reference', () => {
    expect(reported(3, { weightKg: '' })).toMatchObject({ valid: true, rawValue: 3, dailyMg: null, status: 'within', referenceText: '<4' });
    expect(reported(3, { ageYears: 45, sex: 'F', weightKg: '' })).toMatchObject({ valid: true, rawValue: 3, unit: 'mg/kg/24 h', status: 'unassessed', reference: null });
  });
  it('does not build a default norm into the engine and honors injected source data', () => {
    expect(calc({}, undefined)).toMatchObject({ valid: true });
    expect(engine.evaluate(base)).toMatchObject({ valid: true, reference: null, status: 'unassessed' });
    const other = clone(policy); other.profiles.find(p => p.id === 'EAU_CA_CHILD').upper = 10; other.profiles.find(p => p.id === 'EAU_CA_CHILD').text = '<10';
    expect(calc({}, other)).toMatchObject({ status: 'within', referenceText: '<10' });
  });
});

describe('Calcium DZM — pediatric age and strict boundaries', () => {
  it.each([[0,5,true],[2/12,5,true],[0.24999,5,true],[.25,4,false],[10,4,false],[17.999,4,false]])('age%s has upper%s and inclusivity%s in all clinical contexts', (ageYears, upper, inclusive) => {
    for (const clinicalContext of ['general','hypo','phpt']) {
      expect(reported(upper, { ageYears, clinicalContext })).toMatchObject({ valid: true, referenceText: `${inclusive ? '≤' : '<'}${upper}`, referenceLabel: 'Norma dla wieku', status: inclusive ? 'within' : 'boundary', tone: inclusive ? 'normal' : 'warning' });
      expect(reported(upper+.0001, { ageYears, clinicalContext }).status).toBe('high');
      expect(reported(upper-.0001, { ageYears, clinicalContext }).status).toBe('within');
    }
  });
  it('uses completed infant age honestly without inventing months', () => {
    const input = { CA_inputMode: 'reported', CA_reportedValue: '4.5', CA_reportedUnit: 'mg/kg/24h', age: '0' };
    expect(engine.evaluate(engine.inputFromValues(input), policy)).toMatchObject({ valid: true, rawValue: 4.5, reference: null, status: 'unassessed', input: { agePrecision: 'completed-years' } });
    expect(engine.evaluate(engine.inputFromValues({ ...input, ageMonths: '2' }), policy)).toMatchObject({ status: 'within', referenceText: '≤5' });
    expect(engine.evaluate(engine.inputFromValues({ ...input, ageMonths: '3' }), policy)).toMatchObject({ status: 'high', referenceText: '<4' });
  });
  it('makes the normal-result comment specific to the number and retains owner wording', () => {
    expect(reported(3).interpretation).toContain('Wynik poniżej górnej granicy normy dla wieku.');
    expect(reported(5,{ageYears:2/12}).interpretation).toContain('Wynik na górnej granicy normy dla wieku.');
    expect(reported(3,{clinicalContext:'hypo'}).interpretation).toContain('To jeden z elementów oceny bezpieczeństwa leczenia — sam wynik nie potwierdza jego skuteczności.');
    expect(reported(8,{clinicalContext:'phpt'}).interpretation).toContain('Sam wynik nie rozstrzyga o konieczności leczenia operacyjnego.');
    for (const context of ['general','hypo','phpt']) expect(reported(3,{clinicalContext:context}).interpretation).not.toContain('na granicy włączonej');
  });
  it.each(['3.999999999999999','4','4.000000000000001'])('display retains the true side of4 for%s', value => {
    const result=reported(value), shown=engine.parseValue(result.display.text).value;
    expect(shown<4).toBe(Number(value)<4); expect(shown>4).toBe(Number(value)>4);
  });
});

describe('Calcium DZM — adult stone risk, hypoPT goals and PHPT criteria are different', () => {
  it.each([['F','general',200,'boundary','warning'],['F','hypo',250,'boundary','warning'],['F','phpt',250,'criterion-not-met','neutral'],['M','general',250,'boundary','warning'],['M','hypo',300,'boundary','warning'],['M','phpt',300,'criterion-not-met','neutral']])('%s/%s exact%s gives%s', (sex,clinicalContext,value,status,tone) => {
    expect(reported(value,{ageYears:45,sex,clinicalContext,reportedUnit:'mg/24h'})).toMatchObject({ valid:true, rawValue:value, unit:'mg/24 h',status,tone });
  });
  it('the same woman220 has stone-risk high, hypoPT goal met and PHPT criterion not met', () => {
    const input={ageYears:45,sex:'F',reportedUnit:'mg/24h'};
    expect(reported(220,{...input,clinicalContext:'general'})).toMatchObject({status:'high',referenceText:'<200'});
    expect(reported(220,{...input,clinicalContext:'hypo'})).toMatchObject({status:'within',referenceText:'<250'});
    expect(reported(220,{...input,clinicalContext:'phpt'})).toMatchObject({status:'criterion-not-met',referenceText:'>250',outOfRange:null});
    expect(reported(250.0001,{...input,clinicalContext:'phpt'})).toMatchObject({status:'criterion-met',tone:'warning',outOfRange:true});
  });
  it('does not infer sex, a clinical diagnosis or an adult profile for a child', () => {
    expect(calc({ageYears:45,sex:null})).toMatchObject({status:'unassessed',reference:null});
    expect(reported(5,{clinicalContext:'phpt'})).toMatchObject({status:'high',referenceText:'<4',reference:{kind:'upper'}});
  });
});

describe('Calcium DZM — input safety, duration and zero', () => {
  it.each([{concentration:'-1'},{concentration:'bad'},{volume:'0'},{volume:'-1'},{weightKg:'-30'},{weightKg:'0'},{hours:'0'},{hours:'-24'},{concentrationUnit:'umol/L'},{clinicalContext:'unknown-diagnosis'}])('rejects a real invalid field %j', patch => expect(calc(patch).valid).toBe(false));
  it('keeps zero neutral and small positive values visible', () => {
    expect(calc({concentration:'0'})).toMatchObject({valid:true,rawValue:0,status:'zero',tone:'neutral',reference:null,outOfRange:null});
    const tiny=calc({concentration:'0.00001'});expect(tiny.rawValue).toBeGreaterThan(0);expect(engine.parseValue(tiny.display.text).value).toBeGreaterThan(0);
  });
  it.each(['12','23.999999999999996','24.000000000000004','36'])('non24 hours%s is an estimate with no DZM reference', hours => {
    expect(calc({hours})).toMatchObject({valid:true,status:'unassessed',tone:'neutral',reference:null});
  });
  it('does not reinterpret legacy wall-clock dates without a recorded duration', () => {
    const values={U_Ca:'5',V24:'1200',weight:'30',age:'10',collectionStartAt:'2026-10-24T08:00',collectionEndAt:'2026-10-25T08:00'};
    expect(engine.evaluate(engine.inputFromValues(values),policy)).toMatchObject({valid:false,errorCode:'missing-hours'});
    expect(engine.evaluate(engine.inputFromValues({...values,CA_collectionHours:'24'}),policy)).toMatchObject({valid:true,rawValue:8.0156});
  });
  it.each(engine.COLLECTION_FIELDS)('known negative collection fact%s stays blocking', id => {
    expect(calc({knownFacts:{[id]:false}})).toMatchObject({valid:false,blocked:true,errorCode:'collection-conflict'});
    expect(calc({[id]:false})).toMatchObject({valid:true});
  });
});
