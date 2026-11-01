import {describe, expect, it} from 'vitest';
import {loadBrowserScript} from '../support/load-browser-script.mjs';

// All cases are fictional and invoke the exact production browser module.
const window = {};
for (const file of ['clcr_collection_duration.js', 'clcr_potassium_dzm_data.js', 'clcr_potassium_dzm.js']) loadBrowserScript(file, window);
const engine = window.VildaClcrPotassiumDzm, policy = window.ClcrPotassiumDzmReferenceData.DEFAULT_POLICY;
const base = {concentration:'100', volume:'1500', hours:'24', ageYears:40, sex:'M'};
const calc = (patch = {}, source = policy) => engine.evaluate({...base, ...patch}, source);
const daily = (reportedValue, patch = {}, source = policy) => calc({mode:'reported', reportedValue:String(reportedValue), ...patch}, source);
const clone = value => JSON.parse(JSON.stringify(value));
function switched(originalValue, originalUnit, convertedUnit) {
  const converted = engine.convertUnitInput(originalValue, originalUnit, convertedUnit, 'volume');
  expect(converted.ok).toBe(true);
  return {converted, unitConversions:{volume:{originalValue, originalUnit, convertedValue:converted.text, convertedUnit}}};
}

describe('potassium DZM production engine — quantity and collection', () => {
  it('computes the accepted comparison case without mass or height', () => {
    expect(calc()).toMatchObject({schema:'clcr-potassium-dzm',version:1,engineVersion:1,valid:true,rawValue:150,dailyMmol:150,exactMain:{numerator:'150',denominator:'1'},status:'high',tone:'warning',reference:{lower:20,upper:116},presentation:{valueText:'150',unitText:'mmol/24 h'}});
    expect(calc({ageYears:null,sex:null})).toMatchObject({valid:true,rawValue:150,status:'unassessed',tone:'neutral',reference:null,outOfRange:null,missingIds:[]});
  });
  it.each([
    ['100','1500','mL','24',150], ['100','1.5','L','24',150],
    ['100','1500','mL','12',300], ['50','2000','mL','48',50],
    ['0,01','1500','mL','24',0.015], ['400','15000','mL','24',6000],
    ['1000','1500','mL','24',1500]
  ])('computes %s mmol/L × %s %s over %s hours as %s mmol/24 h', (concentration,volume,volumeUnit,hours,rawValue) => {
    expect(calc({concentration,volume,volumeUnit,hours})).toMatchObject({valid:true,rawValue});
  });
  it('accepts one already-daily result without concentration, volume, or time rescaling', () => {
    const result=daily('60',{hours:'12',concentration:'invalid',volume:'-10'});
    expect(result).toMatchObject({valid:true,rawValue:60,exactMain:{numerator:'60',denominator:'1'},hours:12,full24Hours:false,status:'unassessed',reference:null,tone:'neutral'});
    expect(result.interpretation).toContain('bez ponownego skalowania');
  });
  it.each(['',null,undefined])('keeps missing historical clock %s unknown', hours => {
    expect(calc({hours})).toMatchObject({valid:false,errorCode:'missing-hours',missingIds:['K_collectionHours'],input:{durationSource:'historical-missing',durationNeedsConfirmation:true}});
    expect(daily('60',{hours})).toMatchObject({valid:true,rawValue:60,hours:null,full24Hours:false,status:'unassessed',reference:null});
    expect(daily('60',{hours}).interpretation).toContain('Czas zbiórki jest nieznany');
  });
  it('qualifies only the live new blank editor as24h without changing historical input', () => {
    const fields={K_concentration:'100',K_volume:'1500',K_collectionHours:'',K_collectionSource:'assumed-24h',K_durationNeedsConfirmation:'false'};
    const doc={getElementById:id=>Object.hasOwn(fields,id)?{id,value:fields[id],type:'text'}:null};
    expect(engine.evaluate(engine.readInputFromDocument(doc),policy)).toMatchObject({valid:true,rawValue:150,hours:24,full24Hours:true,input:{durationSource:'assumed-24h',durationNeedsConfirmation:false}});
    expect(engine.evaluate(engine.inputFromValues(fields),policy)).toMatchObject({valid:false,errorCode:'missing-hours'});
    for (const flag of [true,'true']) expect(engine.evaluate(engine.inputFromValues({...fields,K_durationNeedsConfirmation:flag}),policy)).toMatchObject({valid:false,errorCode:'missing-hours'});
    expect(engine.evaluate(engine.inputFromValues({...fields,K_collectionSource:'historical-missing'}),policy)).toMatchObject({valid:false,errorCode:'missing-hours'});
  });
  it.each(['0','-1','Infinity','NaN','bad','0x18','<24','1e-400','1e400'])('blocks both modes on invalid explicit clock %s', hours => {
    for (const mode of ['concentration','reported']) expect(calc({mode,hours,reportedValue:'60'})).toMatchObject({valid:false,errorCode:'invalid-hours',rawValue:null});
  });
  it('does not round a near-24h clock into a reference-eligible collection', () => {
    expect(calc({hours:'23.999999999999999999999999'})).toMatchObject({valid:true,hours:24,full24Hours:false,reference:null,status:'unassessed'});
    expect(calc({hours:'24.000000000000000000000001',durationSource:'assumed-24h'})).toMatchObject({valid:true,hours:24,full24Hours:false,input:{durationSource:'hours'},reference:null,status:'unassessed'});
  });
  it.each(['concentration','reported'])('blocks known-invalid or incomplete collection in %s mode', mode => {
    for (const hours of ['','24']) expect(calc({mode,hours,reportedValue:'60',durationSource:'invalid'})).toMatchObject({valid:false,errorCode:'invalid-hours',invalidIds:['K_collectionHours']});
    for (const knownFacts of [{collectionNoMissedVoids:false},{ui_collectionNoSpillage_answer:'no'},{Cl24CollectionProblem:true}]) expect(calc({mode,reportedValue:'60',knownFacts})).toMatchObject({valid:false,blocked:true,errorCode:'collection-conflict'});
  });
  it('does not treat unchecked collection defaults as known contradictions', () => {
    const input=engine.inputFromValues({K_concentration:'100',K_volume:'1500',K_collectionHours:'24',collectionNoMissedVoids:false});
    expect(input.knownFacts).not.toHaveProperty('collectionNoMissedVoids');
    expect(engine.evaluate(input,policy).valid).toBe(true);
  });
  it.each(['-1','bad','NaN','Infinity','0x10','<3','1e400','1e-400'])('rejects invalid or unrepresentable analyte %s', value => {
    expect(calc({concentration:value})).toMatchObject({valid:false,rawValue:null});
    expect(daily(value)).toMatchObject({valid:false,rawValue:null});
  });
  it.each(['0','-1','bad','Infinity','1e400','1e-400'])('requires a positive representable volume %s', volume => {
    expect(calc({volume})).toMatchObject({valid:false,errorCode:'invalid-volume'});
  });
  it('keeps every unit fixed except the mL/L volume choice', () => {
    expect(calc({mode:'direct'})).toMatchObject({valid:false,errorCode:'invalid-mode'});
    expect(calc({concentrationUnit:'mEq/L'})).toMatchObject({valid:false,errorCode:'invalid-concentration-unit'});
    expect(calc({volumeUnit:'dL'})).toMatchObject({valid:false,errorCode:'invalid-volume-unit'});
    for (const reportedUnit of ['mgK/24h','gK/24h','mgNa/24h','mEq/24h']) expect(daily(60,{reportedUnit})).toMatchObject({valid:false,errorCode:'invalid-reported-unit'});
    expect(daily(60,{outputUnit:'gK/24h'})).toMatchObject({valid:false,errorCode:'invalid-output-unit'});
    expect(engine.convertUnitInput('60','mmol/24h','mgK/24h','reportedValue').ok).toBe(false);
    expect(daily(60,{reportedUnit:'mmol/24 h'}).valid).toBe(true);
  });
});

describe('potassium DZM — exact quantity, precision and conversion provenance', () => {
  it.each(['0','-0','0e-200'])('keeps exact zero %s neutral with a report/detection note', value => {
    for (const result of [calc({concentration:value}),daily(value)]) {
      expect(result).toMatchObject({valid:true,rawValue:0,status:'zero',tone:'neutral',outOfRange:null,referenceAvailable:true,referenceActive:false,presentation:{valueText:'0',referenceValue:'20–116'}});
      expect(result.interpretation).toContain('granicy oznaczalności');
    }
  });
  it('preserves 0.015 in exact result, display, report and JSON', () => {
    const result=calc({concentration:'0.01'}), saved=JSON.parse(JSON.stringify(result));
    expect(saved).toMatchObject({valid:true,rawValue:0.015,exactMain:{numerator:'3',denominator:'200'},display:{text:'0,015'},presentation:{valueText:'0,015',fullValueText:'0,015'}});
    expect(engine.formatValue(saved.rawValue,saved.exactMain)).toBe('0,015');
  });
  it.each(['1e-9','1e-200','1e-320'])('keeps tiny positive %s positive and distinct from zero', concentration => {
    const result=calc({concentration});
    expect(result.valid).toBe(true);expect(result.rawValue).toBeGreaterThan(0);expect(result.status).toBe('low');
    expect(result.presentation.valueText).not.toMatch(/^≈?0(?:,0+)?$/);
    expect(JSON.parse(JSON.stringify(result)).exactMain.numerator).not.toBe('0');
  });
  it.each([
    ['19.999999999999999999999999','low','≈20'],
    ['116.000000000000000000000001','high','≈116']
  ])('compares full exact %s before display rounding', (value,status,valueText) => {
    const result=daily(value);
    expect(result).toMatchObject({valid:true,status,tone:'warning',outOfRange:true,presentation:{valueText,approximate:true,fullValueText:value.replace('.',',')}});
    expect(result.presentation.precisionNote).toContain('niezaokrąglonej');
  });
  it('avoids intermediate mL underflow and preserves finite original input when converted', () => {
    expect(calc({concentration:'1e300',volume:'1e-323'})).toMatchObject({valid:true,rawValue:1e-26});
    const {converted,unitConversions}=switched('1e-323','mL','L');
    expect(converted).toMatchObject({text:'1e-326',value:null});
    expect(calc({concentration:'1e300',volume:converted.text,volumeUnit:'L',unitConversions})).toMatchObject({valid:true,rawValue:1e-26,exactMain:{numerator:'1',denominator:'100000000000000000000000000'}});
    expect(calc({concentration:'1e300',volume:converted.text,volumeUnit:'L'})).toMatchObject({valid:false,errorCode:'invalid-volume'});
  });
  it('fails closed on final overflow or positive underflow and never rescues invalid operands', () => {
    expect(calc({concentration:'1e-323',volume:'1'})).toMatchObject({valid:false,errorCode:'numeric-range',rawValue:null});
    expect(calc({concentration:'1e308',volume:'1e308'})).toMatchObject({valid:false,errorCode:'numeric-range'});
    expect(daily('5e-324')).toMatchObject({valid:true,rawValue:5e-324});
    expect(calc({concentration:'1e400',volume:'1e-300'})).toMatchObject({valid:false,errorCode:'invalid-concentration'});
    expect(calc({concentration:'1e-400',volume:'1e300'})).toMatchObject({valid:false,errorCode:'invalid-concentration'});
  });
  it('retains precise original volume across supported conversions and ignores stale metadata', () => {
    const {converted,unitConversions}=switched('1500.000000000000000000000001','mL','L');
    const direct=calc({volume:'1500.000000000000000000000001'});
    expect(calc({volume:converted.text,volumeUnit:'L',unitConversions}).exactMain).toEqual(direct.exactMain);
    for (const provenance of ['{broken',{volume:{originalValue:'1500'}},{reportedValue:{}},{volume:{...unitConversions.volume,convertedUnit:'mL'}},unitConversions]) {
      const result=calc({volume:'2',volumeUnit:'L',unitConversions:provenance});
      expect(result).toMatchObject({valid:true,rawValue:200,input:{unitConversions:{}}});
    }
  });
  it.each([['0.2','0,2'],['0,2','0.2']])('preserves exact volume provenance across decimal separators %s / %s', (volume,convertedValue) => {
    const unitConversions={volume:{originalValue:'200',originalUnit:'mL',convertedValue,convertedUnit:'L'}};
    const result=calc({volume,volumeUnit:'L',unitConversions});
    expect(result).toMatchObject({valid:true,rawValue:20,exactMain:{numerator:'20',denominator:'1'},input:{unitConversions}});
    expect(calc({volume:'0.2000000000000000001',volumeUnit:'L',unitConversions}).input.unitConversions).toEqual({});
  });
});

describe('potassium DZM — source-specific age and sex references', () => {
  it.each([
    [0,'M',null],[5.999,'F',null],[6,'M',[11,88]],[6,'F',[10,70]],
    [17.999,'M',[11,88]],[17.999,'F',[10,70]],[18,'M',[20,116]],[18,'F',[14,95]],
    [80,'M',[20,116]],[80+11/12,'F',[14,95]],[80.999,'M',[20,116]],
    [81,'M',[16,83]],[81,'F',[6,67]],[100,'F',[6,67]],
    [6,null,null],[18,null,null],[81,null,null],[null,'M',null],[-1,'M',null]
  ])('selects %s years / %s as %s', (ageYears,sex,bounds) => {
    const result=daily(50,{ageYears,sex});
    expect(result.valid).toBe(true);
    if (bounds) expect(result.reference).toMatchObject({lower:bounds[0],upper:bounds[1],lowerInclusive:true,upperInclusive:true,sourceId:'LABCORP_003186_2026_10_30'});
    else expect(result).toMatchObject({status:'unassessed',tone:'neutral',reference:null,outOfRange:null});
  });
  it.each([[6,'M',11,88],[6,'F',10,70],[18,'M',20,116],[18,'F',14,95],[81,'M',16,83],[81,'F',6,67]])('includes both endpoints at %s years / %s', (ageYears,sex,lower,upper) => {
    for (const value of [lower,upper]) expect(daily(value,{ageYears,sex})).toMatchObject({status:'within',tone:'normal',outOfRange:false,statusText:'W zakresie laboratoryjnym'});
    expect(daily(lower-0.001,{ageYears,sex})).toMatchObject({status:'low',tone:'warning'});
    expect(daily(upper+0.001,{ageYears,sex})).toMatchObject({status:'high',tone:'warning'});
  });
  it('uses the whole completed-year bin and refuses ambiguous rounded ages', () => {
    expect(daily(50,{ageYears:17,agePrecision:'completed-years'}).reference?.lower).toBe(11);
    expect(daily(50,{ageYears:80,agePrecision:'completed-years'}).reference?.lower).toBe(20);
    expect(daily(50,{ageYears:81,agePrecision:'completed-years'}).reference?.lower).toBe(16);
    for (const patch of [{ageYears:17.5,agePrecision:'completed-years'},{ageYears:'17.999999999999999999999999'}]) expect(daily(50,patch)).toMatchObject({status:'unassessed',reference:null});
  });
  it('names missing-reference reasons without requiring new patient data', () => {
    expect(daily(50,{ageYears:3}).interpretation).toContain('poniżej 6 lat');
    expect(daily(50,{sex:null}).interpretation).toContain('znanej płci');
    expect(daily(50,{ageYears:null}).interpretation).toContain('Wiek pacjenta');
  });
  it('provides one table with a single eligible population and an explicit orientational comparison', () => {
    const result=daily(50);
    expect(result.referenceTable).toHaveLength(4);
    expect(result.referenceTable.find(row=>row.id==='adult')).toMatchObject({male:{text:'20–116',active:true},female:{text:'14–95',active:false}});
    expect(result.referenceTable[0]).toMatchObject({male:{text:'Nie ustalono',active:false},female:{text:'Nie ustalono',active:false}});
    expect(result).toMatchObject({referencePreview:true,biochemical:false,comparisonKind:'orientational'});
    expect(result.reference.explanation).toContain('orientacyjne');
    expect(result.reference).toMatchObject({sourceAgeLabel:'18 to 80 y',ageLower:18,ageUpper:81});
  });
  it('uses only the injected policy and carries its population into the result', () => {
    const fictional=clone(policy);fictional.id='FICTIONAL_TEST_ONLY';fictional.population.label='Fikcyjna populacja testowa';
    Object.assign(fictional.profiles.find(profile=>profile.id==='LABCORP_K_18_80_M'),{lower:40,upper:60});
    expect(daily(100,{},fictional)).toMatchObject({status:'high',reference:{lower:40,upper:60,text:'40–60'},policy:{id:'FICTIONAL_TEST_ONLY'},population:{label:'Fikcyjna populacja testowa'}});
    expect(daily(100)).toMatchObject({status:'within',reference:{lower:20,upper:116}});
    expect(engine.evaluate(base,null)).toMatchObject({valid:true,status:'unassessed',reference:null,policy:null});
    expect(engine.evaluate(base)).toMatchObject({valid:true,status:'unassessed',reference:null,policy:null});
    const isolated={};loadBrowserScript('clcr_potassium_dzm.js',isolated);
    expect(isolated.VildaClcrPotassiumDzm.evaluate(base,policy)).toMatchObject({valid:true,rawValue:150,status:'high'});
  });
  it('fails closed on malformed, overlapping, circular or accessor-bearing policies', () => {
    const candidates=[null,{},[],{...clone(policy),quantity:'serum-potassium'},{...clone(policy),sources:[]},{...clone(policy),minimumAge:NaN}];
    const overlap=clone(policy);overlap.profiles.push({...clone(overlap.profiles[0]),id:'overlap'});candidates.push(overlap);
    const malformed=clone(policy);malformed.profiles[0].lower=200;candidates.push(malformed);
    const unknown=clone(policy);unknown.profiles[0].sourceId='UNKNOWN';candidates.push(unknown);
    const circular=clone(policy);circular.notes.loop=circular;candidates.push(circular);
    let touched=false;const accessor=clone(policy);Object.defineProperty(accessor,'id',{get(){touched=true;throw Error('must not run');},enumerable:true});candidates.push(accessor);
    const inherited=clone(policy);Object.setPrototypeOf(inherited,{get quantity(){touched=true;throw Error('must not run');}});delete inherited.quantity;candidates.push(inherited);
    for (const candidate of candidates) {
      expect(engine.validPolicy(candidate)).toBe(false);
      expect(engine.evaluate(base,candidate)).toMatchObject({valid:true,status:'unassessed',reference:null,policy:null,outOfRange:null});
    }
    expect(touched).toBe(false);
  });
});

describe('potassium DZM — adapters and immutable snapshots', () => {
  it('captures only K fields and uses known patient age/sex without guessing old time', () => {
    expect(engine.inputFromValues({U_K:'100',V24:'1500',age:'10',ageMonths:'6',sex:'F'})).toMatchObject({concentration:'',volume:'',hours:'',ageYears:10.5,sex:'F'});
    expect(engine.inputFromValues({K_concentration:'100',K_volume:'1500',collectionStartAt:'2020-01-01T00:00'})).toMatchObject({hours:'',durationSource:'historical-missing',durationNeedsConfirmation:true});
    expect(engine.inputFromValues({K_concentration:'100',K_volume:'1500'},{collectionAnalysis:{durationMinutes:720},ageContext:{valid:true,exactYears:17.5},sex:'F'})).toMatchObject({hours:12,ageYears:17.5,sex:'F',durationSource:'captured'});
    expect(engine.inputFromValues({age:'80',ageMonths:'11',ageDays:'400'}).ageYears).toBe(80+11/12);
    expect(engine.inputFromValues({age:'',ageMonths:'4'},{ageYears:40}).ageYears).toBeNull();
    expect(engine.inputFromValues({},{ageContext:{valid:false,exactYears:40}}).ageYears).toBeNull();
  });
  it('never fills or rounds invalid completed years/months into a reference group', () => {
    const fields={K_inputMode:'reported',K_reportedValue:'50',K_collectionHours:'24',sex:'M'};
    for (const invalid of [{age:'17',ageMonths:'11.999999999999998'},{age:'17',ageMonths:'1.5'},{age:'17.5',ageMonths:''},{age:'121',ageMonths:''},{age:'120',ageMonths:'1'}]) {
      const input=engine.inputFromValues({...fields,...invalid},{ageContext:{valid:true,exactYears:40},ageYears:40});
      expect(input.ageYears).toBeNull();
      expect(engine.evaluate(input,policy)).toMatchObject({valid:true,rawValue:50,status:'unassessed',reference:null});
    }
    expect(engine.evaluate(engine.inputFromValues({...fields,age:'17',ageMonths:'11'}),policy)).toMatchObject({valid:true,reference:{profileId:'LABCORP_K_6_17_M'}});
    expect(daily(50,{ageYears:17.5})).toMatchObject({valid:true,reference:{profileId:'LABCORP_K_6_17_M'}});
    expect(engine.inputFromValues({...fields},{ageContext:{valid:false,exactYears:40}}).ageYears).toBeNull();
  });
  it('reads DOM/vault and explicit collection no answers without mutating either', () => {
    const fields={K_concentration:'100',K_volume:'1500',K_collectionHours:'',K_collectionSource:'assumed-24h',K_durationNeedsConfirmation:'false',age:'40',sex:'M',ui_collectionNoMissedVoids_answer:'no'};
    const vault={K_outputUnit:'mmol/24h',unrelated:'preserve'};
    const doc={getElementById:id=>Object.hasOwn(fields,id)?{value:fields[id],type:'text'}:null,defaultView:{__vildaClcrVersionValueVault:vault}};
    const input=engine.readInputFromDocument(doc);
    expect(input).toMatchObject({hours:'24',knownFacts:{collectionNoMissedVoids:false}});
    expect(engine.evaluate(input,policy)).toMatchObject({valid:false,blocked:true});
    expect(fields.K_collectionHours).toBe('');expect(vault).toEqual({K_outputUnit:'mmol/24h',unrelated:'preserve'});
  });
  it('returns complete JSON-safe exact provenance, copied policy and immutable results', () => {
    const result=daily('116.000000000000000000000001'), saved=JSON.parse(JSON.stringify(result));
    expect(saved).toMatchObject({schema:'clcr-potassium-dzm',version:1,engineVersion:1,status:'high',input:{reportedValue:'116.000000000000000000000001'},referencePolicy:{id:policy.id}});
    expect(saved.exactMain).toEqual(result.exactMain);expect(saved.presentation.fullValueText).toBe('116,000000000000000000000001');
    expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.input)).toBe(true);expect(Object.isFrozen(result.referencePolicy.profiles[0])).toBe(true);
    expect(result).not.toHaveProperty('massEquivalent');expect(result).not.toHaveProperty('saltEquivalent');
  });
});
