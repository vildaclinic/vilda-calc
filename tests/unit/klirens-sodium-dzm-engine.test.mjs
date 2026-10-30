import {describe, expect, it} from 'vitest';
import {loadBrowserScript} from '../support/load-browser-script.mjs';

function setup() {
  const w = {};
  for (const file of ['clcr_sodium_dzm_data.js', 'clcr_sodium_dzm.js']) loadBrowserScript(file, w);
  return {engine:w.VildaClcrSodiumDzm, data:w.ClcrSodiumDzmReferenceData};
}
const {engine, data} = setup(), policy = data.DEFAULT_POLICY;
const clone = value => JSON.parse(JSON.stringify(value));
const base = {concentration:'100', volume:'1500', hours:'24', ageYears:30, sex:'M'};
const calc = (patch = {}, source = policy) => engine.evaluate({...base, ...patch}, source);
const daily = (reportedValue, patch = {}, source = policy) => calc({mode:'reported', reportedValue:String(reportedValue), ...patch}, source);
function switched(kind, originalValue, originalUnit, convertedUnit) {
  const converted = engine.convertUnitInput(originalValue, originalUnit, convertedUnit, kind);
  expect(converted.ok).toBe(true);
  return {converted, provenance:{[kind]:{originalValue, originalUnit, convertedValue:converted.text, convertedUnit}}};
}

describe('sodium DZM production engine — quantities and collection', () => {
  it('computes a daily amount without mass, height, age or sex', () => {
    const result = calc({ageYears:null, sex:null});
    expect(result).toMatchObject({valid:true, rawValue:150, dailyMmol:150, exactMain:{numerator:'150',denominator:'1'}, unit:'mmol/24 h', schema:'clcr-sodium-dzm',version:1, status:'unassessed',tone:'neutral',outOfRange:null,reference:null});
    expect(result.missingIds).toEqual([]);
    expect(result.presentation).toMatchObject({valueText:'150',unitText:'mmol/24 h',referenceValue:'Brak normy do porównania'});
    expect(result.interpretation).toContain('Wiek pacjenta');
  });
  it.each([
    ['100','1500','mL','24',150], ['100','1.5','L','24',150],
    ['100','1500','mL','12',300], ['50','2000','mL','48',50],
    ['0.01','1500','mL','24',0.015], ['400','15000','mL','24',6000]
  ])('calculates %s mmol/L × %s %s over %s h as %s mmol/day', (concentration,volume,volumeUnit,hours,expected) => {
    expect(calc({concentration,volume,volumeUnit,hours})).toMatchObject({valid:true,rawValue:expected});
  });
  it.each([['100','mmol/24h'],['2298.976928','mgNa/24h'],['2.298976928','gNa/24h']])('accepts one ready %s %s without using volume/concentration or rescaling time', (reportedValue,reportedUnit) => {
    const result = daily(reportedValue,{reportedUnit,hours:'12',concentration:'bad',volume:'-10'});
    expect(result).toMatchObject({valid:true,rawValue:100,exactMain:{numerator:'100',denominator:'1'},hours:12,reference:null,outOfRange:null,tone:'neutral'});
    expect(result.interpretation).toContain('bez ponownego skalowania');
  });
  it.each(['',null,undefined])('missing clock %s blocks concentration but keeps a daily report numeric and unassessed', hours => {
    expect(calc({hours})).toMatchObject({valid:false,errorCode:'missing-hours',missingIds:['Na_collectionHours'],input:{durationSource:'historical-missing',durationNeedsConfirmation:true}});
    const result = daily(100,{hours});
    expect(result).toMatchObject({valid:true,rawValue:100,hours:null,full24Hours:false,status:'unassessed',reference:null,outOfRange:null});
    expect(result.interpretation).toContain('Czas zbiórki jest nieznany');
  });
  it.each(['0','-1','Infinity','NaN','bad','0x18','<24','1e-400','1e400'])('invalid explicit clock %s blocks BOTH modes', hours => {
    for (const mode of ['concentration','reported']) expect(calc({mode,reportedValue:'100',hours})).toMatchObject({valid:false,errorCode:'invalid-hours',rawValue:null});
  });
  it('does not round a near-24h clock into a full reference-eligible collection', () => {
    const result = calc({hours:'23.99999999999999999999999999'});
    expect(result).toMatchObject({valid:true,hours:24,full24Hours:false,reference:null,status:'unassessed'});
  });
  it('keeps known-invalid clock provenance blocking in BOTH modes, including a blank clock', () => {
    for (const mode of ['concentration','reported']) for (const hours of ['', '24']) {
      expect(calc({mode,reportedValue:'100',hours,durationSource:'invalid'})).toMatchObject({valid:false,errorCode:'invalid-hours',invalidIds:['Na_collectionHours'],input:{durationSource:'invalid'}});
    }
    const input=engine.inputFromValues({Na_inputMode:'reported',Na_reportedValue:'100',Na_collectionHours:'',Na_collectionSource:'invalid'});
    expect(engine.evaluate(input,policy)).toMatchObject({valid:false,errorCode:'invalid-hours'});
    expect(calc({durationSource:'legacy-dates'}).input.durationSource).toBe('legacy-dates');
  });
  it.each(['concentration','reported'])('known incomplete collection blocks %s and preserves inputs', mode => {
    for (const knownFacts of [{collectionNoMissedVoids:false},{ui_collectionNoSpillage_answer:'no'},{Cl24CollectionProblem:true}]) {
      expect(calc({mode,reportedValue:'100',knownFacts})).toMatchObject({valid:false,blocked:true,errorCode:'collection-conflict',input:{concentration:'100',volume:'1500'}});
    }
  });
  it('unchecked defaults are not known collection contradictions', () => {
    const input = engine.inputFromValues({Na_concentration:'100',Na_volume:'1500',Na_collectionHours:'24',collectionNoMissedVoids:false});
    expect(input.knownFacts).not.toHaveProperty('collectionNoMissedVoids');
    expect(engine.evaluate(input,policy).valid).toBe(true);
  });
  it.each(['-1','bad','NaN','Infinity','0x10','<3'])('rejects invalid/non-scalar analyte %s in both modes', value => {
    expect(calc({concentration:value})).toMatchObject({valid:false,rawValue:null});
    expect(daily(value)).toMatchObject({valid:false,rawValue:null});
  });
  it.each(['0','-1','Infinity','bad'])('requires positive valid volume %s', volume => {
    expect(calc({volume})).toMatchObject({valid:false,errorCode:'invalid-volume',rawValue:null});
  });
  it('rejects unsupported mode and units instead of guessing', () => {
    expect(calc({mode:'direct'})).toMatchObject({valid:false,errorCode:'invalid-mode'});
    expect(calc({concentrationUnit:'mg/dL'})).toMatchObject({valid:false,errorCode:'invalid-concentration-unit'});
    expect(calc({volumeUnit:'dL'})).toMatchObject({valid:false,errorCode:'invalid-volume-unit'});
    expect(daily(100,{reportedUnit:'gNaCl/24h'})).toMatchObject({valid:false,errorCode:'invalid-reported-unit'});
    expect(daily(100,{outputUnit:'mEq/L'})).toMatchObject({valid:false,errorCode:'invalid-output-unit'});
  });
});

describe('sodium DZM — exact arithmetic and precision regressions', () => {
  it.each(['0','-0','0e-200'])('keeps exact analyte zero %s numeric but neutral, with available range', value => {
    for (const result of [calc({concentration:value}),daily(value)]) {
      expect(result).toMatchObject({valid:true,rawValue:0,status:'zero',tone:'neutral',outOfRange:null,referenceAvailable:true,referenceActive:false,presentation:{valueText:'0',referenceValue:'58–337'}});
      expect(result.interpretation).toContain('granicy oznaczalności');
    }
  });
  it('preserves the audited 0.015 quantity in mmol and in sodium mass', () => {
    expect(calc({concentration:'0.01'})).toMatchObject({valid:true,rawValue:0.015,exactMain:{numerator:'3',denominator:'200'},display:{text:'0,015'},presentation:{valueText:'0,015'}});
    expect(calc({concentration:'0.01',outputUnit:'gNa/24h'})).toMatchObject({valid:true,rawValue:0.015,presentation:{rawValue:0.0003448465392,valueText:'≈0,0003448',unitText:'g Na/24 h'}});
  });
  it.each(['1e-9','1e-200','1e-320'])('keeps very small positive concentration %s positive', concentration => {
    const result = calc({concentration});
    expect(result.valid).toBe(true);expect(result.rawValue).toBeGreaterThan(0);
    expect(result.presentation.valueText).not.toMatch(/^≈?0(?:,0+)?$/);
    expect(result.status).toBe('low');
  });
  it('does not underflow intermediate mL before multiplying concentration', () => {
    expect(calc({concentration:'1e300',volume:'1e-323'})).toMatchObject({valid:true,rawValue:1e-26,exactMain:{numerator:'1',denominator:'100000000000000000000000000'}});
    const {converted,provenance} = switched('volume','1e-323','mL','L');
    expect(converted).toMatchObject({text:'1e-326',value:null});
    expect(calc({concentration:'1e300',volume:converted.text,volumeUnit:'L',unitConversions:provenance})).toMatchObject({valid:true,rawValue:1e-26});
  });
  it('fails closed when the final amount or selected mass cannot be represented', () => {
    expect(calc({concentration:'1e-323',volume:'1'})).toMatchObject({valid:false,errorCode:'numeric-range',rawValue:null});
    expect(daily('5e-324')).toMatchObject({valid:true,rawValue:5e-324});
    expect(daily('5e-324',{outputUnit:'gNa/24h'})).toMatchObject({valid:false,errorCode:'numeric-range',rawValue:null,outOfRange:null});
    expect(calc({concentration:'1e308',volume:'1e308'})).toMatchObject({valid:false,errorCode:'numeric-range',rawValue:null});
  });
  it.each([
    ['58','mmol/24h',30,'M',58], ['337','mmol/24h',30,'M',337],
    ['1333.40661824','mgNa/24h',30,'M',58],
    ['528.76469344','mgNa/24h',81,null,23],
    ['4.75888224096','gNa/24h',81,null,207]
  ])('includes exact source bound %s %s', (reportedValue,reportedUnit,ageYears,sex,expected) => {
    expect(daily(reportedValue,{reportedUnit,ageYears,sex})).toMatchObject({valid:true,rawValue:expected,status:'within',outOfRange:false,tone:'normal',exactMain:{numerator:String(expected),denominator:'1'}});
  });
  it('classifies exact 100 ×580mL as 58, including its converted sodium mass', () => {
    const result = calc({volume:'580',outputUnit:'gNa/24h'});
    expect(result).toMatchObject({valid:true,rawValue:58,status:'within',presentation:{rawValue:1.33340661824,valueText:'≈1,333407',referenceValue:'≈1,3334–7,7476',unitText:'g Na/24 h'}});
  });
  it('keeps the approved six-decimal mass display compact with its full exact value in Details', () => {
    const result=calc({outputUnit:'gNa/24h'});
    expect(result).toMatchObject({valid:true,rawValue:150,status:'within',exactMain:{numerator:'150',denominator:'1'},presentation:{rawValue:3.448465392,valueText:'≈3,448465',approximate:true,roundedDisplay:true,fullValueText:'3,448465392',unroundedValueText:'3,448465392',fullValueComplete:true}});
    expect(result.presentation.valueText).toHaveLength(9);
    expect(result.presentation.precisionNote).toContain('niezaokrąglonej');
  });
  it.each([
    ['57.999999999999999999999999','low','≈58'],
    ['337.000000000000000000000001','high','≈337']
  ])('does not round literal %s into the normal range', (value,status,valueText) => {
    const result = daily(value);
    expect(result).toMatchObject({valid:true,status,tone:'warning',outOfRange:true,presentation:{valueText,approximate:true,roundedDisplay:true,fullValueText:value.replace('.',',')}});
    expect(result.presentation.precisionNote).toContain('pełnej');
  });
  it('retains exact provenance through all ready-result unit conversions', () => {
    for (const original of ['58','57.999999999999999999999999','337.000000000000000000000001']) for (const unit of ['mmol/24h','mgNa/24h','gNa/24h']) {
      const {converted,provenance} = switched('reportedValue',original,'mmol/24h',unit);
      const result = daily(converted.text,{reportedUnit:unit,unitConversions:provenance});
      expect(result.status).toBe(original === '58' ? 'within' : original.startsWith('57') ? 'low' : 'high');
      expect(result.exactMain).toEqual(daily(original).exactMain);
    }
  });
  it('preserves subnormal mass as a positive field, never exact zero', () => {
    const {converted,provenance} = switched('reportedValue','1e-323','mgNa/24h','mmol/24h');
    expect(converted.value).toBeNull();expect(converted.text).toMatch(/[1-9].*e-325$/);
    expect(engine.parseValue(converted.text).exact.numerator).not.toBe('0');
    expect(daily(converted.text,{unitConversions:provenance})).toMatchObject({valid:false,errorCode:'numeric-range'});
  });
  it('ignores stale, partial and malformed conversion metadata', () => {
    const {provenance} = switched('reportedValue','58','mmol/24h','mgNa/24h');
    expect(daily('2298.976928',{reportedUnit:'mgNa/24h',unitConversions:provenance})).toMatchObject({valid:true,rawValue:100});
    for (const unitConversions of ['{broken', {reportedValue:{originalValue:'58'}}, {unknown:{}}, {reportedValue:{...provenance.reportedValue,convertedUnit:'gNa/24h'}}]) {
      expect(daily('2298.976928',{reportedUnit:'mgNa/24h',unitConversions})).toMatchObject({valid:true,rawValue:100,input:{unitConversions:{}}});
    }
  });
});

describe('sodium DZM — one source-specific reference policy', () => {
  it.each([
    [5.999,'F',null], [6,'F',[33,185]], [12.999,'F',[33,185]], [10,'M',null], [10,null,null],
    [13,'M',[30,250]], [13,'F',[30,250]], [13,null,[30,250]], [17.999,null,[30,250]],
    [18,'M',[58,337]], [18,'F',[39,258]], [18,null,null],
    [80.999,'M',[58,337]], [80.999,'F',[39,258]],
    [81,'M',[23,207]], [81,'F',[23,207]], [81,null,[23,207]], [100,null,[23,207]],
    [null,'M',null],[-1,'M',null]
  ])('uses correct age/sex population %s / %s', (ageYears,sex,bounds) => {
    const result = daily(100,{ageYears,sex});
    expect(result.valid).toBe(true);
    if (bounds) expect(result.reference).toMatchObject({lower:bounds[0],upper:bounds[1],lowerInclusive:true,upperInclusive:true,sourceId:'LABCORP_003178_2026_10_30'});
    else expect(result).toMatchObject({status:'unassessed',tone:'neutral',reference:null,outOfRange:null});
  });
  it.each([[6,'F',33,185],[13,null,30,250],[18,'M',58,337],[18,'F',39,258],[81,null,23,207]])('assesses both inclusive bounds for %s / %s', (ageYears,sex,lower,upper) => {
    for (const value of [lower,upper]) expect(daily(value,{ageYears,sex}).status).toBe('within');
    expect(daily(lower-0.001,{ageYears,sex})).toMatchObject({status:'low',tone:'warning',outOfRange:true});
    expect(daily(upper+0.001,{ageYears,sex})).toMatchObject({status:'high',tone:'warning',outOfRange:true});
  });
  it('uses completed-year bins without rounding age or filling source gaps', () => {
    expect(daily(100,{ageYears:12,agePrecision:'completed-years',sex:'F'}).reference?.lower).toBe(33);
    expect(daily(100,{ageYears:17,agePrecision:'completed-years',sex:null}).reference?.lower).toBe(30);
    expect(daily(100,{ageYears:80,agePrecision:'completed-years',sex:'M'}).reference?.lower).toBe(58);
    expect(daily(100,{ageYears:81,agePrecision:'completed-years',sex:null}).reference?.lower).toBe(23);
    expect(daily(100,{ageYears:12.5,agePrecision:'completed-years',sex:'F'})).toMatchObject({status:'unassessed',reference:null});
    expect(daily(100,{ageYears:'12.999999999999999999999999',sex:'F'})).toMatchObject({status:'unassessed',reference:null});
  });
  it('has concrete reasons for missing child/sex ranges', () => {
    expect(daily(100,{ageYears:10,sex:'M'}).interpretation).toContain('chłopców');
    expect(daily(100,{ageYears:10,sex:null}).interpretation).toContain('tylko dla dziewczynek');
    expect(daily(100,{ageYears:3,sex:'F'}).interpretation).toContain('poniżej 6 lat');
    expect(daily(100,{ageYears:30,sex:null}).interpretation).toContain('znanej płci');
  });
  it('shows grouped table in the SAME selected unit and highlights only the eligible population', () => {
    const result = daily(100,{outputUnit:'gNa/24h'});
    expect(result.referenceTable.find(row=>row.id==='adult')).toMatchObject({male:{text:'≈1,3334–7,7476',active:true},female:{text:'≈0,8966–5,9314',active:false}});
    expect(result.referenceTable[0].male.text).toBe('Nie ustalono');
    const teen = daily(100,{ageYears:14,sex:null}).referenceTable.find(row=>row.id==='teen');
    expect(teen).toMatchObject({male:{active:true},female:{active:true}});
  });
  it('uses injected policy bounds and population, with no default norm hidden in the engine', () => {
    const fictional = clone(policy);fictional.id='FICTIONAL_TEST_ONLY';fictional.population.label='Fikcyjna populacja testowa';
    fictional.profiles.find(profile=>profile.id==='LABCORP_NA_18_80_M').lower=90;
    fictional.profiles.find(profile=>profile.id==='LABCORP_NA_18_80_M').upper=110;
    expect(daily(150,{},fictional)).toMatchObject({status:'high',reference:{lower:90,upper:110,text:'90–110'},policy:{id:'FICTIONAL_TEST_ONLY'},population:{label:'Fikcyjna populacja testowa'}});
    expect(daily(150)).toMatchObject({status:'within',reference:{lower:58,upper:337}});
    expect(daily(150,{},undefined)).toMatchObject({valid:true,status:'within'});
    expect(engine.evaluate({...base},null)).toMatchObject({valid:true,status:'unassessed',reference:null,policy:null});
  });
  it('fails closed on missing sources, malformed, overlapping or accessor-bearing policies', () => {
    const mutations = [null, {}, [], {...clone(policy),quantity:'serum-sodium'}, {...clone(policy),sources:[]}, {...clone(policy),minimumAge:NaN}];
    const overlap=clone(policy);overlap.profiles.push({...clone(overlap.profiles[0]),id:'ambiguous'});mutations.push(overlap);
    const malformed=clone(policy);malformed.profiles[0].lower=200;mutations.push(malformed);
    const unknown=clone(policy);unknown.profiles[0].sourceId='UNKNOWN';mutations.push(unknown);
    const circular=clone(policy);circular.notes.loop=circular;mutations.push(circular);
    let touched=false;const accessor=clone(policy);Object.defineProperty(accessor,'id',{get(){touched=true;throw Error('must not run');},enumerable:true});mutations.push(accessor);
    for(const source of mutations) {
      expect(engine.validPolicy(source)).toBe(false);
      expect(engine.evaluate(base,source)).toMatchObject({valid:true,status:'unassessed',reference:null,policy:null,outOfRange:null});
    }
    expect(touched).toBe(false);
  });
});

describe('sodium DZM — adapters and snapshot-safe provenance', () => {
  it('captures only own Na fields and does not turn unrelated U_Na/V24 into sodium inputs', () => {
    const result = engine.inputFromValues({U_Na:'100',V24:'1500',age:'10',ageMonths:'6',sex:'F'});
    expect(result).toMatchObject({concentration:'',volume:'',hours:'',ageYears:10.5,sex:'F'});
    expect(engine.evaluate(result,policy)).toMatchObject({valid:false});
  });
  it('captures the real clock/context without guessing historical dates or 24h', () => {
    expect(engine.inputFromValues({Na_concentration:'100',Na_volume:'1500',collectionStartAt:'2020-01-01T00:00'})).toMatchObject({hours:'',durationNeedsConfirmation:true,durationSource:'historical-missing'});
    expect(engine.inputFromValues({Na_concentration:'100',Na_volume:'1500'},{collectionAnalysis:{durationMinutes:720},ageContext:{valid:true,exactYears:17.5},sex:'F'})).toMatchObject({hours:12,ageYears:17.5,sex:'F',durationSource:'captured'});
    expect(engine.inputFromValues({Na_collectionHours:'24',Na_collectionSource:'assumed-24h',age:'12',sex:'F'})).toMatchObject({hours:'24',durationSource:'assumed-24h',ageYears:12,agePrecision:'completed-years'});
  });
  it('preserves exact raw age context and ignores stale neonatal days for older ages', () => {
    expect(engine.inputFromValues({age:'12',ageMonths:'11',ageDays:'400'}).ageYears).toBe(12+11/12);
    expect(engine.inputFromValues({age:'',ageMonths:'4'},{ageYears:30}).ageYears).toBeNull();
    expect(engine.inputFromValues({}, {ageContext:{valid:false,exactYears:30}}).ageYears).toBeNull();
  });
  it('captures document/vault values and explicit no answers without dirtying other fields', () => {
    const values={Na_concentration:'100',Na_volume:'580',Na_collectionHours:'24',age:'30',sex:'M',ui_collectionNoMissedVoids_answer:'no'};
    const doc={getElementById:id=>Object.hasOwn(values,id)?{value:values[id],type:'text'}:null,defaultView:{__vildaClcrVersionValueVault:{Na_outputUnit:'gNa/24h',unrelated:'preserve'}}};
    const input=engine.readInputFromDocument(doc);
    expect(input).toMatchObject({outputUnit:'gNa/24h',knownFacts:{collectionNoMissedVoids:false}});
    expect(engine.evaluate(input,policy)).toMatchObject({valid:false,blocked:true});
    expect(doc.defaultView.__vildaClcrVersionValueVault.unrelated).toBe('preserve');
  });
  it('exports deep-frozen versioned data and JSON-safe complete exact result metadata', () => {
    const result=daily('337.000000000000000000000001',{outputUnit:'gNa/24h'}), encoded=JSON.stringify(result), decoded=JSON.parse(encoded);
    expect(decoded).toMatchObject({schema:'clcr-sodium-dzm',version:1,engineVersion:1,status:'high',unitPolicy:{id:'SODIUM_CHEMICAL_UNITS_2026_10_30',sodiumMgPerMmol:'22.98976928'}});
    expect(decoded.exactMain).toEqual(result.exactMain);
    expect(decoded.presentation.fullValueText).toContain(',');
    expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.input)).toBe(true);expect(Object.isFrozen(result.referencePolicy.profiles[0])).toBe(true);
    expect(Object.isFrozen(data.UNIT_CONSTANTS)).toBe(true);expect(Object.isFrozen(policy.profiles[0])).toBe(true);
    expect(data.NA_MG_PER_MMOL).toBe(22.98976928);
    expect(calc().notes.massEquivalentText).toContain('g Na/24 h');
    expect(calc().saltEquivalent).toMatchObject({rawValue:8.766,unit:'g NaCl/24 h'});
    expect(calc().saltEquivalent.explanation).toContain('nie pomiar spożycia');
  });
});
