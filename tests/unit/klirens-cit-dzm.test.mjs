import {describe, expect, it} from 'vitest';
import {loadBrowserScript} from '../support/load-browser-script.mjs';

function setup(withAgeHelper = false) {
  const w = {};
  for (const file of [...(withAgeHelper ? ['clcr_clinical_safety.js'] : []), 'clcr_cit_dzm_reference_data.js', 'clcr_cit_dzm.js']) loadBrowserScript(file, w);
  return {w, engine:w.VildaClcrCitDzm, policy:w.ClcrCitDzmReferenceData.DEFAULT_POLICY};
}
const {engine, policy} = setup();
const clone = value => JSON.parse(JSON.stringify(value));
const child = {ageYears:10, sex:'F', weightKg:'30', heightCm:'140'};
const base = {concentration:'0.8', volume:'1000', ...child};
const calc = (patch = {}, reference = policy) => engine.evaluate({...base, ...patch}, reference);
const daily = (value, patch = {}, reference = policy) => calc({mode:'reported', reportedValue:String(value), ageYears:40, sex:'M', ...patch}, reference);
const numeric = text => Number(text.replace(',', '.'));
const fraction = value => ({n:BigInt(value.numerator), d:BigInt(value.denominator)});
const compare = (a,b) => a.n*b.d < b.n*a.d ? -1 : a.n*b.d > b.n*a.d ? 1 : 0;
const displayedFraction = value => {
  const [coefficient, exponent='0'] = value.replace(',', '.').split('e'), decimals=(coefficient.split('.')[1]||'').length;
  const shift=Number(exponent)-decimals, digits=BigInt(coefficient.replace('.', ''));
  return shift >= 0 ? {n:digits*10n**BigInt(shift),d:1n} : {n:digits,d:10n**BigInt(-shift)};
};

describe('citrate DZM production quantities and minimum inputs', () => {
  it('computes one absolute amount without a patient and retains default24h provenance', () => {
    const result=calc({ageYears:null,sex:null,weightKg:'',heightCm:''});
    expect(result).toMatchObject({valid:true,rawValue:0.8,schema:'clcr-cit-dzm',formulaId:'Cit_mgkg',outputKey:'Cit_total24',unit:'mmol/24 h',hours:24,input:{hours:'24',durationSource:'assumed-24h'},status:'unassessed',reference:null});
    expect(result.exactMain).toEqual({numerator:'4',denominator:'5'});
    expect(engine.readiness(base)).toMatchObject({ready:true,total:2,filled:2,userRequiredIds:['CITDZM_concentration','CITDZM_volume'],requiredIds:['CITDZM_concentration','CITDZM_volume','CITDZM_collectionHours']});
  });
  it.each([
    ['800','µmol/L','1000','mL','unknown',0.8,'mmol/24 h'],
    ['0,8','mmol/L','1','L','unknown',0.8,'mmol/24 h'],
    ['200','mg/L','1000','mL','unknown',200,'mg/24 h'],
    ['20','mg/dL','1','L','unknown',200,'mg/24 h'],
    ['151.2792','mg/L','1000','mL','citrate_ion',151.2792,'mg/24 h'],
    ['15.36988','mg/dL','1000','mL','citric_acid',153.6988,'mg/24 h']
  ])('preserves amount for %s %s × %s %s', (concentration,concentrationUnit,volume,volumeUnit,reportingEntity,expected,unit) => {
    const result=calc({concentration,concentrationUnit,volume,volumeUnit,reportingEntity});
    expect(result).toMatchObject({valid:true,rawValue:expected,unit});
    if(reportingEntity!=='unknown')expect(result.dailyMmol).toBe(0.8);
  });
  it.each([['1.4','mmol/24h',1.4],['200','mg/24h',200]])('accepts a ready daily amount %s %s without repeating time scaling', (reportedValue,reportedUnit,expected) => {
    expect(daily(reportedValue,{reportedUnit,hours:'12',volume:'-1',concentration:'bad'})).toMatchObject({valid:true,rawValue:expected,hours:12,reference:null,tone:'neutral',statusText:'Wynik dobowy — ocena ograniczona'});
    expect(engine.readiness({mode:'reported',reportedValue,reportedUnit})).toMatchObject({ready:true,total:1,filled:1,requiredIds:['CITDZM_reportedValue']});
  });
  it.each(['',null,undefined,' \t '])('empty new duration %s does not block calculation', hours => {
    expect(calc({hours})).toMatchObject({valid:true,hours:24,input:{hours:'24',durationSource:'assumed-24h'}});
  });
  it('retains collection-time restrictions even around the exact24hour boundary', () => {
    expect(calc({hours:'12'})).toMatchObject({valid:true,rawValue:1.6,reference:null,statusText:'Przeliczenie na 24 godziny'});
    expect(calc({hours:'48'})).toMatchObject({valid:true,rawValue:0.4,reference:null});
    expect(calc({hours:'24.0000000000000000000001'})).toMatchObject({valid:true,reference:null});
    expect(calc({hours:'24.0 '})).toMatchObject({valid:true,rawValue:0.8,status:'low'});
  });
  it('does not convert missing historical or knowninvalid duration into a valid assumption', () => {
    expect(calc({hours:'',durationNeedsConfirmation:true})).toMatchObject({valid:false,errorCode:'missing-hours',missingIds:['CITDZM_collectionHours']});
    expect(calc({hours:'24',durationSource:'invalid'})).toMatchObject({valid:false,errorCode:'invalid-hours'});
    expect(calc({hours:'24',durationNeedsConfirmation:true})).toMatchObject({valid:true,input:{durationNeedsConfirmation:false}});
  });
  it('honors historical-missing provenance through the direct API without requiring a duplicate flag', () => {
    const patch={hours:'',durationSource:'historical-missing'};
    expect(calc(patch)).toMatchObject({valid:false,errorCode:'missing-hours',input:{hours:'',durationSource:'historical-missing',durationNeedsConfirmation:true}});
    expect(daily('1.7',patch)).toMatchObject({valid:true,rawValue:1.7,hours:null,reference:null,status:'unassessed',input:{hours:'',durationSource:'historical-missing',durationNeedsConfirmation:true}});
    expect(engine.normalizeInput(patch)).toMatchObject({hours:'',durationSource:'historical-missing',durationNeedsConfirmation:true});
  });
  it.each(['concentration','reported'])('explicit valid hours resolve a historical-missing marker in %s mode', mode => {
    const result=calc({mode,reportedValue:'1.7',hours:'24',durationSource:'historical-missing',durationNeedsConfirmation:true,ageYears:30,sex:'M'});
    expect(result).toMatchObject({valid:true,hours:24,referenceAvailable:true,input:{hours:'24',durationSource:'hours',durationNeedsConfirmation:false}});
  });
  it.each(['','24'])('invalid duration provenance is not silently repaired by %s hours', hours => {
    const patch={hours,durationSource:'invalid'};
    expect(calc(patch)).toMatchObject({valid:false,errorCode:'invalid-hours',input:{hours,durationSource:'invalid'}});
    expect(daily('1.7',patch)).toMatchObject({valid:true,rawValue:1.7,hours:null,reference:null,status:'unassessed',input:{hours,durationSource:'invalid'}});
  });
  it.each([{hours:'',durationNeedsConfirmation:true},{hours:'24',durationSource:'invalid'},{hours:'bad'}])('keeps ready amount available but unassessed with %j', patch => {
    expect(daily('1.4',patch)).toMatchObject({valid:true,rawValue:1.4,hours:null,exactHours:null,reference:null,tone:'neutral'});
  });
  it.each(['0','-1','NaN','Infinity','0x18','<24'])('rejects invalid collection time %s', hours => expect(calc({hours})).toMatchObject({valid:false,errorCode:'invalid-hours'}));
  it.each([{collectionNoMissedVoids:false},{ui_collectionNoSpillage_answer:'no'},{Cl24CollectionProblem:true},{knownIncomplete:true}])('known incomplete collection %j blocks both modes', knownFacts => {
    for(const result of [calc({knownFacts}),daily('1.4',{knownFacts})]) expect(result).toMatchObject({valid:false,rawValue:null,blocked:true,errorCode:'incomplete-collection'});
  });
  it('does not interpret ordinary unchecked DOM defaults as a known invalid collection', () => {
    const input=engine.inputFromValues({CITDZM_concentration:'0.8',CITDZM_volume:'1000',collectionNoMissedVoids:false},child);
    expect(input.knownFacts).not.toHaveProperty('collectionNoMissedVoids');
    expect(engine.evaluate(input,policy).referenceAvailable).toBe(true);
  });
  it.each(['0','-0','0e-200'])('preserves zero %s as neutral with a detection-limit explanation', concentration => {
    expect(calc({concentration})).toMatchObject({valid:true,rawValue:0,status:'zero',tone:'neutral',outOfRange:null,referenceActive:false,display:{text:'0'}});
    expect(calc({concentration}).interpretation).toContain('granicy oznaczalności');
  });
  it('preserves the zero explanation even when patient details or chemistry are unavailable', () => {
    expect(daily('0',{ageYears:null,reportedUnit:'mg/24h',reportingEntity:'unknown'})).toMatchObject({valid:true,status:'zero',tone:'neutral',reference:null});
    expect(daily('0',{ageYears:null,reportedUnit:'mg/24h'}).cautions.length).toBeGreaterThan(0);
  });
  it.each(['1e-9','1e-200','1e-320','5e-324'])('retains small positive %s in display and stored quantity', value => {
    const result=daily(value);expect(result.valid).toBe(true);expect(result.rawValue).toBeGreaterThan(0);expect(numeric(result.display.text)).toBeGreaterThan(0);expect(result.status).toBe('low');
  });
  it('rejects numeric underflow rather than displaying a positive amount as zero', () => {
    expect(daily('1e-400')).toMatchObject({valid:false,rawValue:null});
    expect(calc({concentration:'5e-324',volume:'1'})).toMatchObject({valid:false,errorCode:'numeric-range'});
  });
  it.each(['-1','bad','Infinity','0x10','<5',{},true])('rejects invalid amount %s through the production API', reportedValue => expect(daily(reportedValue)).toMatchObject({valid:false,rawValue:null}));
  it.each(['0','-10','bad'])('rejects invalid volume %s', volume => expect(calc({volume})).toMatchObject({valid:false,errorCode:'invalid-volume'}));
  it('does not accept spot ratios, body-weight outputs, µmol/day not in the approved selector or another analyte unit', () => {
    expect(calc({concentrationUnit:'mmol/mmol'})).toMatchObject({valid:false,errorCode:'invalid-concentration-unit'});
    for(const reportedUnit of ['mg/kg/24h','µmol/24h'])expect(daily('2',{reportedUnit})).toMatchObject({valid:false,errorCode:'invalid-reported-unit'});
    expect(calc({mode:'spot'}).valid).toBe(false);
  });
});

describe('citrate DZM EAU references and exact comparisons', () => {
  it.each([
    ['M','1.699999','low','warning'],['M','1.7','within','normal'],['M','1.700001','within','normal'],
    ['F','1.899999','low','warning'],['F','1.9','within','normal'],['F','1.900001','within','normal'],['M','5000','within','normal']
  ])('adult %s %s is %s without a pathological upper limit', (sex,value,status,tone) => {
    const r=daily(value,{sex});expect(r).toMatchObject({valid:true,status,tone,reference:{upper:null,max:null,lowerInclusive:true,operator:'≥',sex}});
  });
  it('uses child BSA and sex, without imposing the adult boundary as a cap', () => {
    const r=calc();expect(r).toMatchObject({status:'low',tone:'warning',outOfRange:true,bsaMethod:'Mosteller',exactBsaSquared:{numerator:'7',denominator:'6'}});
    expect(r.bsaM2).toBeCloseTo(1.0801234497346435,14);
    expect(r.reference).toMatchObject({label:'Norma dla pacjenta',sourceLower:1.6,sourceUnit:'mmol/1,73 m²/24 h',operator:'>',lowerInclusive:false,adultCap:null,capped:false,sex:'F'});
    expect(r.reference.lower).toBeCloseTo(1.6*Math.sqrt(7/6)/1.73,14);
    expect(r.presentation.referenceValue).toBe('>0,999');
    expect(daily('2',{ageYears:17,sex:'M',weightKg:100,heightCm:200}).reference.lower).toBeGreaterThan(1.7);
  });
  it.each(['M','F'])('recognizes exact child boundary for %s with BSA1.73', sex => {
    const limit=sex==='M'?'1.9':'1.6', r=daily(limit,{ageYears:10,sex,weightKg:'100',heightCm:'107.7444'});
    expect(r).toMatchObject({status:'boundary',tone:'warning',statusText:'Na dolnej granicy',outOfRange:true,reference:{lowerInclusive:false,lower:Number(limit)},exactBsaSquared:{numerator:'29929',denominator:'10000'}});
    expect(r.display.boundary).toBe('lower');
  });
  it('handles exact child mass boundary rather than allowing binary64 division to cross it', () => {
    const r=daily('359.2881',{reportedUnit:'mg/24h',reportingEntity:'citrate_ion',ageYears:10,sex:'M',weightKg:'100',heightCm:'107.7444'});
    expect(r).toMatchObject({status:'boundary',reference:{lower:359.2881},dailyMmol:1.9});
  });
  it('does not supply an automatic infant norm below the approved app boundary', () => {
    expect(daily('0.2',{ageYears:0.999999,sex:'F',weightKg:7,heightCm:65})).toMatchObject({valid:true,reference:null,populationCategory:'infant',tone:'neutral'});
    expect(daily('0.2',{ageYears:1,sex:'F',weightKg:10,heightCm:75})).toMatchObject({referenceAvailable:true,populationCategory:'pediatric'});
    expect(policy.pediatricAgeNote).toContain('a nie granicą wieku określoną przez EAU');
  });
  it.each([{ageYears:null},{sex:null},{sex:'other'},{weightKg:''},{heightCm:''},{weightKg:-1},{heightCm:-140}])('missing or invalid reference context %j does not block the daily amount', patch => {
    expect(calc(patch)).toMatchObject({valid:true,rawValue:0.8,reference:null,tone:'neutral'});
  });
  it('does not require child anthropometry for the adult result', () => expect(daily('1.7',{weightKg:'',heightCm:''})).toMatchObject({status:'within',reference:{lower:1.7}}));
  it('keeps decimal information beyond binary64 at both sides of adult1.7', () => {
    const below=daily('1.69999999999999999999999999999'), above=daily('1.70000000000000000000000000001');
    expect(below).toMatchObject({rawValue:1.7,status:'low'});expect(above).toMatchObject({rawValue:1.7,status:'within'});
    expect(below.display.text).toBe('1,69999999999999999999999999999');expect(above.display.text).toBe('1,70000000000000000000000000001');
  });
  it('keeps irrational BSA bounds coherent with the displayed comparison', () => {
    for(const value of ['0.998958103800826','0.998958103800827']){
      const r=daily(value,child), source=fraction(r.exactMain),bound=fraction(r.reference.exactLowerSquared);
      const truth=compare({n:source.n*source.n,d:source.d*source.d},bound);
      expect(compare(displayedFraction(r.presentation.valueText),displayedFraction(r.presentation.lowerValueText))).toBe(truth);
    }
  });
  it('preserves exact age distinctions at18 and does not accept fractional completed-years as exact', () => {
    expect(daily('1.8',{ageYears:'17.99999999999999999999'}).populationCategory).toBe('pediatric');
    expect(daily('1.8',{ageYears:18,weightKg:'',heightCm:''}).populationCategory).toBe('adult');
    expect(daily('1.8',{ageYears:'17.9',agePrecision:'completed-years'}).reference).toBeNull();
  });
  it('does not inherit oxalate eGFR-specific assessment rules', () => expect(daily('2',{egfr:20,knownFacts:{eGFR:20}})).toMatchObject({status:'within',tone:'normal',referenceActive:true}));
  it('keeps unknown mg as a numerical amount without inventing the mass convention', () => {
    expect(daily('200',{reportedUnit:'mg/24h',reportingEntity:'unknown'})).toMatchObject({valid:true,rawValue:200,dailyMmol:null,reference:null,tone:'neutral',reportingBasis:'unknown'});
    expect(daily('321.4683',{reportedUnit:'mg/24h',reportingEntity:'citrate_ion'})).toMatchObject({status:'within',dailyMmol:1.7,reference:{lower:321.4683}});
    expect(daily('326.60995',{reportedUnit:'mg/24h',reportingEntity:'citric_acid'})).toMatchObject({status:'within',dailyMmol:1.7,reference:{lower:326.60995}});
  });
  it('takes reference data as an explicit input and freezes JSON-safe results', () => {
    const alternate=clone(policy);alternate.adultLowerMmolPerDay.M=1.8;alternate.id='alternate-source';
    expect(daily('1.75',{},alternate)).toMatchObject({status:'low',reference:{lower:1.8},policy:{id:'alternate-source'}});
    const r=calc();expect(Object.isFrozen(r)).toBe(true);expect(Object.isFrozen(r.input)).toBe(true);expect(Object.isFrozen(r.referencePolicy)).toBe(true);expect(clone(r)).toEqual(r);
    expect(engine.validPolicy(policy)).toBe(true);
    for(const invalid of [null,{}, {...clone(policy),adultLowerInclusive:false},{...clone(policy),pediatricMinAgeYears:18},{...clone(policy),notes:{}},{...clone(policy),sources:[{id:'bad',label:'bad',url:'javascript:alert(1)'}]}]) expect(daily('1.8',{},invalid)).toMatchObject({valid:true,reference:null,tone:'neutral'});
  });
});

describe('citrate DZM unit receipts and application context', () => {
  it('retains the physical amount and exact original through mass-to-molar conversion', () => {
    const converted=engine.convertUnitInput('20','mg/dL','µmol/L','concentration','citric_acid');
    const input={...base,concentration:converted.text,concentrationUnit:'µmol/L',reportingEntity:'citric_acid',unitConversions:{concentration:{originalValue:'20',originalUnit:'mg/dL',convertedValue:converted.text,convertedUnit:'µmol/L',reportingEntity:'citric_acid'}}};
    const r=engine.evaluate(input,policy);expect(r.exactDailyMg).toEqual({numerator:'200',denominator:'1'});expect(r.exactDailyMmol).toEqual({numerator:'400000',denominator:'384247'});
    expect(r.status).toBe(calc({concentration:'20',concentrationUnit:'mg/dL',reportingEntity:'citric_acid'}).status);
  });
  it('does not cross the reference after rounding the displayed converted input', () => {
    const original='321.468299999999999999999999999',converted=engine.convertUnitInput(original,'mg/24h','mmol/24h','reportedValue','citrate_ion');
    const r=daily(converted.text,{reportingEntity:'citrate_ion',unitConversions:{reportedValue:{originalValue:original,originalUnit:'mg/24h',convertedValue:converted.text,convertedUnit:'mmol/24h',reportingEntity:'citrate_ion'}}});
    expect(r.status).toBe('low');expect(r.display.text).not.toBe('1,7');
  });
  it('accepts scientific notation returned by converting a tiny positive amount', () => {
    const converted=engine.convertUnitInput('0.000001','mg/24h','mmol/24h','reportedValue','citric_acid');
    expect(converted.ok).toBe(true);expect(daily(converted.text,{reportingEntity:'citric_acid'})).toMatchObject({valid:true,status:'low'});
  });
  it('rejects unknown chemistry conversions but permits mass and volume conversions', () => {
    expect(engine.convertUnitInput('20','mg/L','mmol/L','concentration','unknown')).toMatchObject({ok:false,errorCode:'unknown-reporting-entity'});
    expect(engine.convertUnitInput('20','mg/L','mg/dL','concentration','unknown')).toMatchObject({ok:true,text:'2'});
    expect(engine.convertUnitInput('1500','mL','L','volume')).toMatchObject({ok:true,text:'1,5'});
  });
  it('invalidates receipts after manual changes or a different mass convention', () => {
    const receipt={originalValue:'20',originalUnit:'mg/L',convertedValue:'2',convertedUnit:'mg/dL',reportingEntity:'citric_acid'};
    expect(calc({concentration:'3',concentrationUnit:'mg/dL',reportingEntity:'citric_acid',unitConversions:{concentration:receipt}}).input.unitConversions).toEqual({});
    expect(calc({concentration:'2',concentrationUnit:'mg/dL',reportingEntity:'citrate_ion',unitConversions:{concentration:receipt}}).input.unitConversions).toEqual({});
  });
  it.each(['1.7 ','1,7\t',' 1.7 '])('accepts surrounding whitespace for %s without changing classification', value => expect(daily(value)).toMatchObject({rawValue:1.7,status:'within'}));
  it('reads the current patient, precise available age and sex from DOM and value vault', () => {
    const {engine:local}=setup(true), values={CITDZM_concentration:'0,8',CITDZM_volume:'1000',age:'17',ageMonths:'11',ageDays:'14',sex:'F',weight:'30',height:'140'};
    const doc={getElementById:id=>Object.hasOwn(values,id)?{value:values[id],type:'text'}:null,defaultView:{__vildaClcrVersionValueVault:{CITDZM_collectionHours:'24'}}};
    const input=local.readInputFromDocument(doc,{ageYears:18,sex:'M',weightKg:70,heightCm:180});
    expect(input).toMatchObject({ageYears:17+11/12,sex:'F',weightKg:'30',heightCm:'140',hours:'24'});
    expect(local.evaluate(input,policy)).toMatchObject({populationCategory:'pediatric',reference:{sex:'F'}});
    values.age='';values.sex='';expect(local.readInputFromDocument(doc,{ageYears:18,sex:'M'})).toMatchObject({ageYears:null,sex:null});
    expect(local.inputFromValues({CITDZM_concentration:'0.8',CITDZM_volume:'1000',age:'0',ageMonths:'0',ageDays:'14'},child).ageYears).toBeCloseTo(14/365.2425,14);
  });
  it('uses a session context only when explicit document fields are absent', () => {
    const {engine:local,w}=setup(),doc={getElementById:()=>null,defaultView:{__vildaClcrVersionValueVault:{CITDZM_concentration:'0.8',CITDZM_volume:'1000'}}};
    w.ClcrCitDzmSession={readContext:()=>child};
    expect(local.readInputFromDocument(doc)).toMatchObject(child);
    expect(local.readInputFromDocument(doc,{ageYears:40,sex:'M'})).toMatchObject({ageYears:40,sex:'M'});
  });
  it('does not infer historical timing from unparsed date strings or reuse legacy mg/kg units', () => {
    const input=engine.inputFromValues({CITDZM_concentration:'0.8',CITDZM_volume:'1000',collectionStartAt:'2026-11-03T08:00',collectionEndAt:'2026-11-04T08:00'},child);
    expect(engine.evaluate(input,policy)).toMatchObject({valid:false,errorCode:'missing-hours'});
    expect(engine.evaluate({mode:'reported',reportedValue:'2',reportedUnit:'mg/kg/24 h'},policy).valid).toBe(false);
  });
  it('does not invoke accessors or throw on malformed external input', () => {
    const input=Object.defineProperty({},'mode',{get(){throw Error('must not run');}});
    expect(()=>engine.evaluate(input,policy)).not.toThrow();expect(engine.evaluate(input,policy).valid).toBe(false);
    const circular={};circular.circular=circular;expect(engine.evaluate(circular,policy).valid).toBe(false);
  });
});
