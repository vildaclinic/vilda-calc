import {describe, expect, it} from 'vitest';
import {loadBrowserScript} from '../support/load-browser-script.mjs';

function setup(withAgeHelper = false) {
  const w = {};
  for (const file of [...(withAgeHelper ? ['clcr_clinical_safety.js'] : []), 'clcr_ox_dzm_reference_data.js', 'clcr_ox_dzm.js']) loadBrowserScript(file, w);
  return {w, engine:w.VildaClcrOxDzm, policy:w.ClcrOxDzmReferenceData.DEFAULT_POLICY};
}
const {engine, policy} = setup();
const clone = value => JSON.parse(JSON.stringify(value));
const child = {ageYears:10, weightKg:'30', heightCm:'140'};
const base = {concentration:'200', volume:'1500', ...child};
const calc = (patch = {}, reference = policy) => engine.evaluate({...base, ...patch}, reference);
const daily = (value, patch = {}, reference = policy) => calc({mode:'reported', reportedValue:String(value), ageYears:40, ...patch}, reference);
const numeric = text => Number(text.replace(',', '.'));
const fraction = value => ({n:BigInt(value.numerator), d:BigInt(value.denominator)});
const compare = (a,b) => a.n*b.d < b.n*a.d ? -1 : a.n*b.d > b.n*a.d ? 1 : 0;
const displayedFraction = value => {
  const [coefficient, exponent='0'] = value.replace(',', '.').split('e'), decimals=(coefficient.split('.')[1]||'').length;
  const shift=Number(exponent)-decimals, digits=BigInt(coefficient.replace('.', ''));
  return shift >= 0 ? {n:digits*10n**BigInt(shift),d:1n} : {n:digits,d:10n**BigInt(-shift)};
};

describe('oxalate DZM production quantities and minimum data', () => {
  it('computes one absolute daily amount with two required entries and a populated default 24h', () => {
    const result = calc({ageYears:null, weightKg:'', heightCm:''});
    expect(result).toMatchObject({valid:true, rawValue:0.3, schema:'clcr-ox-dzm', formulaId:'Ox_mgkg', outputKey:'Ox_total24', unit:'mmol/24 h', exactMain:{numerator:'3', denominator:'10'}, hours:24, input:{hours:'24', durationSource:'assumed-24h'}, status:'unassessed', reference:null});
    expect(result.presentation).toMatchObject({valueText:'0,3', referenceValue:'Brak normy do porównania'});
    expect(engine.readiness(base)).toMatchObject({ready:true, filled:2, total:2, userRequiredIds:['OXDZM_concentration','OXDZM_volume'], requiredIds:['OXDZM_concentration','OXDZM_volume','OXDZM_collectionHours']});
  });
  it.each([
    ['200','µmol/L','1500','mL','unknown',0.3,'mmol/24 h'],
    ['0,2','mmol/L','1,5','L','unknown',0.3,'mmol/24 h'],
    ['20','mg/L','1500','mL','unknown',30,'mg/24 h'],
    ['2','mg/dL','1.5','L','unknown',30,'mg/24 h'],
    ['17.6038','mg/L','1500','mL','oxalate_ion',26.4057,'mg/24 h'],
    ['1.800698','mg/dL','1500','mL','oxalic_acid',27.01047,'mg/24 h']
  ])('converts %s %s × %s %s without assuming a chemical form', (concentration, concentrationUnit, volume, volumeUnit, reportingEntity, value, unit) => {
    const result = calc({concentration, concentrationUnit, volume, volumeUnit, reportingEntity});
    expect(result).toMatchObject({valid:true, rawValue:value, unit});
    if (reportingEntity !== 'unknown') expect(result.dailyMmol).toBe(0.3);
  });
  it.each([['300','µmol/24h',0.3,'mmol/24 h'], ['0,3','mmol/24h',0.3,'mmol/24 h'], ['30','mg/24h',30,'mg/24 h']])('ready %s %s does not require or rescale volume/time', (value, reportedUnit, expected, unit) => {
    expect(daily(value, {reportedUnit, hours:'12', concentration:'bad', volume:'-1'})).toMatchObject({valid:true, rawValue:expected, hours:12, unit, reference:null});
    expect(engine.readiness({mode:'reported', reportedValue:value, reportedUnit})).toMatchObject({ready:true, total:1, filled:1, requiredIds:['OXDZM_reportedValue']});
  });
  it.each(['', null, undefined])('default duration %s is 24h, with assumption provenance', hours => {
    expect(calc({hours})).toMatchObject({valid:true, hours:24, input:{hours:'24', durationSource:'assumed-24h'}});
  });
  it('uses other known collection durations arithmetically without automatic normality', () => {
    expect(calc({hours:'12'})).toMatchObject({valid:true, rawValue:0.6, status:'unassessed', reference:null, statusText:'Przeliczenie na 24 godziny'});
    expect(calc({hours:'48'})).toMatchObject({valid:true, rawValue:0.15, reference:null});
    expect(calc({hours:'24.0000000000000000000001'})).toMatchObject({valid:true, reference:null});
  });
  it('does not repair invalid or missing historical time with the new default', () => {
    expect(calc({hours:'', durationNeedsConfirmation:true})).toMatchObject({valid:false, errorCode:'missing-hours', missingIds:['OXDZM_collectionHours']});
    expect(calc({hours:'24', durationSource:'invalid'})).toMatchObject({valid:false, errorCode:'invalid-hours', invalidIds:['OXDZM_collectionHours'], input:{durationSource:'invalid'}});
    const input = engine.inputFromValues({OXDZM_concentration:'200', OXDZM_volume:'1500', OXDZM_collectionHours:'24', OXDZM_collectionSource:'invalid'});
    expect(engine.compute(input)).toMatchObject({valid:false, errorCode:'invalid-hours'});
    expect(calc({hours:'24', durationNeedsConfirmation:true})).toMatchObject({valid:true, input:{durationNeedsConfirmation:false}});
  });
  it.each([{hours:'',durationNeedsConfirmation:true},{hours:'24',durationSource:'invalid'},{hours:'bad'}])('keeps already daily values available with unconfirmed historical duration %j', patch => {
    expect(daily('0.3',patch)).toMatchObject({valid:true,rawValue:0.3,hours:null,exactHours:null,reference:null,tone:'neutral'});
  });
  it.each(['0','-1','NaN','Infinity','0x18','<24'])('rejects invalid known hours %s', hours => expect(calc({hours})).toMatchObject({valid:false, errorCode:'invalid-hours'}));
  it.each([{collectionNoMissedVoids:false}, {ui_collectionNoSpillage_answer:'no'}, {Cl24CollectionProblem:true}])('known incomplete collection %j preserves quantity but removes assessment', knownFacts => {
    expect(calc({knownFacts})).toMatchObject({valid:true, rawValue:0.3, tone:'neutral', reference:null, statusText:'Niepełna zbiórka'});
  });
  it('does not turn unchecked collection defaults into recorded contradictions', () => {
    const input = engine.inputFromValues({OXDZM_concentration:'200', OXDZM_volume:'1500', collectionNoMissedVoids:false}, child);
    expect(input.knownFacts).not.toHaveProperty('collectionNoMissedVoids');
    expect(engine.evaluate(input, policy).referenceAvailable).toBe(true);
  });
  it.each(['0','-0','0e-200'])('preserves literal zero %s and accepted comparison below the upper boundary', concentration => {
    expect(calc({concentration})).toMatchObject({valid:true, rawValue:0, display:{text:'0'}, status:'within', tone:'normal', outOfRange:false});
    expect(calc({concentration}).details.join(' ')).toContain('granicy oznaczalności');
  });
  it.each(['1e-9','1e-200','1e-320','5e-324'])('keeps a small positive reported amount %s positive and visible', value => {
    const result = daily(value); expect(result.valid).toBe(true); expect(result.rawValue).toBeGreaterThan(0); expect(numeric(result.display.text)).toBeGreaterThan(0);
  });
  it('fails rather than silently turning an underflowed quantity into zero', () => {
    expect(daily('1e-400')).toMatchObject({valid:false, rawValue:null});
    expect(calc({concentration:'5e-324', volume:'1'})).toMatchObject({valid:false, errorCode:'numeric-range', rawValue:null});
  });
  it.each(['-1','bad','Infinity','0x10','<5',{},true])('rejects invalid quantity %s through the public production API', reportedValue => {
    expect(daily(reportedValue)).toMatchObject({valid:false, rawValue:null});
  });
  it.each(['0','-10','bad'])('rejects invalid volume %s while accepting zero concentration', volume => expect(calc({volume})).toMatchObject({valid:false, errorCode:'invalid-volume'}));
  it('rejects unsupported analyte/time/area unit substitutions', () => {
    expect(calc({concentrationUnit:'mmol/mmol'})).toMatchObject({valid:false, errorCode:'invalid-concentration-unit'});
    expect(daily('2', {reportedUnit:'mg/kg/24h'})).toMatchObject({valid:false, errorCode:'invalid-reported-unit'});
    expect(calc({mode:'spot'}).valid).toBe(false);
  });
});

describe('oxalate DZM source-specific reference and exact limits', () => {
  it('uses Mosteller BSA without adult capping or a sex requirement', () => {
    const result = calc();
    expect(result).toMatchObject({status:'high', tone:'warning', outOfRange:true, dailyMmol:0.3, bsaMethod:'Mosteller', exactBsaSquared:{numerator:'7', denominator:'6'}});
    expect(result.bsaM2).toBeCloseTo(1.0801234497346435,14);
    expect(result.indexedMmol).toBeCloseTo(0.4805006317819542,14);
    expect(result.reference).toMatchObject({label:'Norma dla pacjenta', sourceUpper:0.46, sourceUnit:'mmol/1,73 m²/24 h', upperInclusive:false, exactUpper:null, exactUpperSquared:{numerator:'7406', denominator:'89787'}, adultCap:null, capped:false, sex:null});
    expect(result.presentation.referenceValue).toBe('<0,2872');
    expect(daily('0.48', {ageYears:17, weightKg:70, heightCm:180})).toMatchObject({status:'within', reference:{capped:false}});
    expect(daily('0.48', {ageYears:17, weightKg:70, heightCm:180}).reference.upper).toBeGreaterThan(0.46);
  });
  it('supports the explicitly all-ages reference in infancy with BSA', () => {
    const result = daily('0.05', {ageYears:0.5, weightKg:7, heightCm:65});
    expect(result).toMatchObject({status:'within', populationCategory:'pediatric'});
    expect(result.reference.upper).toBeCloseTo(0.09452924223066195,14);
  });
  it.each([['',140],[-1,140],[30,''],[30,-140]])('missing or invalid BSA context %s/%s blocks only the norm', (weightKg,heightCm) => {
    expect(calc({weightKg,heightCm})).toMatchObject({valid:true, rawValue:0.3, reference:null, tone:'neutral'});
  });
  it('does not turn extreme finite anthropometry into an infinite normal interval', () => {
    const result = calc({weightKg:'1e308',heightCm:'1e308'});
    expect(result.valid).toBe(true); expect(Number.isFinite(result.bsaM2)).toBe(true); expect(Number.isFinite(result.reference?.upper)).toBe(true);
  });
  it.each([['0.39999','within','normal'], ['0.4','within','normal'], ['0.40001','caution','warning'], ['0.45999','caution','warning'], ['0.46','boundary','warning'], ['0.46001','high','warning'], ['1','high','warning'], ['1.00001','marked','danger']])('classifies adult %s strictly as %s, with coherent displayed bounds', (value,status,tone) => {
    const result = daily(value); expect(result).toMatchObject({valid:true,status,tone,reference:{upper:0.46}});
    for (const bound of result.presentation.displayBounds) {
      const source = fraction(result.exactMain), truth = bound.exactValue ? compare(source,fraction(bound.exactValue)) : compare({n:source.n*source.n,d:source.d*source.d},fraction(bound.exactSquared));
      expect(Math.sign(numeric(result.presentation.valueText)-numeric(bound.text))).toBe(truth);
    }
  });
  it('retains decimal information beyond binary64 at both sides of the exact adult limit', () => {
    const below = daily('0.45999999999999999999999999999'), above = daily('0.46000000000000000000000000001');
    expect(below).toMatchObject({rawValue:0.46,status:'caution'}); expect(above).toMatchObject({rawValue:0.46,status:'high'});
    expect(below.display.text).toBe('0,45999999999999999999999999999'); expect(above.display.text).toBe('0,46000000000000000000000000001');
  });
  it('compares irrational pediatric limits without rounding BSA to a decimal threshold', () => {
    const below = daily('0.287200454842737539', child), above = daily('0.2872004548427377', child);
    expect(below.status).toBe('within'); expect(above.status).toBe('high');
    expect(compare(displayedFraction(below.presentation.valueText),displayedFraction(below.presentation.upperValueText))).toBe(-1);
    expect(compare(displayedFraction(above.presentation.valueText),displayedFraction(above.presentation.upperValueText))).toBe(1);
  });
  it('recognizes an exactly attainable pediatric boundary using squared quantities', () => {
    const result = daily('0.46', {ageYears:17,weightKg:59.858,heightCm:180});
    expect(result).toMatchObject({status:'boundary',reference:{exactUpper:{numerator:'23',denominator:'50'},upper:0.46},exactBsaSquared:{numerator:'29929',denominator:'10000'}});
  });
  it('keeps adult and pediatric marked thresholds attributed to the appropriate source', () => {
    expect(daily('1.1').displayBounds.find(b=>b.kind==='marked').sourceId).toBe('EAU_UROLITHIASIS_2026');
    expect(daily('0.7',child)).toMatchObject({status:'marked',tone:'danger'});
    expect(daily('0.7',child).displayBounds.find(b=>b.kind==='marked').sourceId).toBe('ERKNET_OXALEUROPE_2023');
    expect(daily('0.7',child).interpretation).toContain('oceny przyczyny');
  });
  it('keeps unknown mass as raw mg without assigning a chemical entity or norm', () => {
    expect(daily('30',{reportedUnit:'mg/24h',reportingEntity:'unknown'})).toMatchObject({valid:true,rawValue:30,dailyMg:30,dailyMmol:null,reference:null,reportingBasis:'unknown',tone:'neutral'});
    expect(daily('40.48874',{reportedUnit:'mg/24h',reportingEntity:'oxalate_ion'})).toMatchObject({status:'boundary',dailyMmol:0.46,reference:{upper:40.48874}});
    expect(daily('41.416054',{reportedUnit:'mg/24h',reportingEntity:'oxalic_acid'})).toMatchObject({status:'boundary',dailyMmol:0.46,reference:{upper:41.416054}});
  });
  it('uses the technical age18 boundary without rounding exact age into adulthood', () => {
    expect(daily('0.3',{ageYears:'17.99999999999999999999'}).populationCategory).toBe('pediatric');
    expect(daily('0.3',{ageYears:18,weightKg:'',heightCm:''}).populationCategory).toBe('adult');
    expect(daily('0.3',{ageYears:'17.99999999999999999999',agePrecision:'completed-years'}).reference).toBeNull();
  });
  it('does not reassure at known eGFR below30, but retains a known high result', () => {
    expect(daily('0.2',{egfr:'29.999999999999999999999'})).toMatchObject({status:'limited',tone:'neutral',outOfRange:null,referenceAvailable:true,referenceActive:false});
    expect(daily('0',{egfr:20})).toMatchObject({status:'limited',tone:'neutral'});
    expect(daily('0.6',{egfr:20})).toMatchObject({status:'high',tone:'warning',outOfRange:true});
    expect(daily('0.6',{egfr:20}).cautions[0]).toContain('poniżej górnej granicy');
    expect(daily('0.2',{egfr:30})).toMatchObject({status:'within',tone:'normal'});
    expect(daily('0.2',{knownFacts:{eGFR:20}}).status).toBe('limited');
  });
  it('keeps reference data separate and freezes a complete JSON-serializable outcome', () => {
    const alternate = clone(policy); alternate.upperMmolPerDay=0.5; alternate.id='alternative-source';
    expect(daily('0.48',{},alternate)).toMatchObject({status:'caution',reference:{upper:0.5},policy:{id:'alternative-source'}});
    const result=calc(); expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.input)).toBe(true); expect(Object.isFrozen(result.referencePolicy)).toBe(true); expect(clone(result)).toEqual(result);
    expect(engine.validPolicy(policy)).toBe(true);
    for (const invalid of [null,{}, {...clone(policy),upperInclusive:true}, {...clone(policy),upperMmolPerDay:Infinity}, {...clone(policy),notes:{}}, {...clone(policy),sources:[{id:'bad',label:'bad',url:'javascript:alert(1)'}]}]) expect(daily('0.6',{},invalid)).toMatchObject({valid:true,reference:null,tone:'neutral'});
  });
});

describe('oxalate DZM conversions, context and document integration', () => {
  it('preserves the physical measurement and exact original through molar/mass unit conversion', () => {
    const converted=engine.convertUnitInput('20','mg/L','µmol/L','concentration','oxalic_acid');
    expect(converted.ok).toBe(true);
    const input={...base, concentration:converted.text, concentrationUnit:'µmol/L', reportingEntity:'oxalic_acid', unitConversions:{concentration:{originalValue:'20',originalUnit:'mg/L',convertedValue:converted.text,convertedUnit:'µmol/L',reportingEntity:'oxalic_acid'}}};
    const result=engine.evaluate(input,policy);
    expect(result.exactDailyMg).toEqual({numerator:'30',denominator:'1'});
    expect(result.exactDailyMmol).toEqual({numerator:'300000',denominator:'900349'});
    expect(result.status).toBe(calc({concentration:'20',concentrationUnit:'mg/L',reportingEntity:'oxalic_acid'}).status);
  });
  it('does not cross an exact threshold after a rounded unit conversion', () => {
    const original='40.488739999999999999999999999', converted=engine.convertUnitInput(original,'mg/24h','mmol/24h','reportedValue','oxalate_ion');
    const result=daily(converted.text,{reportingEntity:'oxalate_ion',unitConversions:{reportedValue:{originalValue:original,originalUnit:'mg/24h',convertedValue:converted.text,convertedUnit:'mmol/24h',reportingEntity:'oxalate_ion'}}});
    expect(result.status).toBe('caution'); expect(result.display.text).not.toBe('0,46');
  });
  it('rejects unknown chemistry conversions but allows mass-to-mass and volume conversions', () => {
    expect(engine.convertUnitInput('20','mg/L','mmol/L','concentration','unknown')).toMatchObject({ok:false,errorCode:'unknown-reporting-entity'});
    expect(engine.convertUnitInput('20','mg/L','mg/dL','concentration','unknown')).toMatchObject({ok:true,text:'2',exactValue:{numerator:'2',denominator:'1'}});
    expect(engine.convertUnitInput('1500','mL','L','volume')).toMatchObject({ok:true,text:'1,5'});
  });
  it('invalidates conversion receipts after manual edits or a different chemical basis', () => {
    const receipt={originalValue:'20',originalUnit:'mg/L',convertedValue:'2',convertedUnit:'mg/dL',reportingEntity:'oxalic_acid'};
    expect(calc({concentration:'3',concentrationUnit:'mg/dL',reportingEntity:'oxalic_acid',unitConversions:{concentration:receipt}}).input.unitConversions).toEqual({});
    expect(calc({concentration:'2',concentrationUnit:'mg/dL',reportingEntity:'oxalate_ion',unitConversions:{concentration:receipt}}).input.unitConversions).toEqual({});
  });
  it('reads Polish decimals and all available patient age fields from DOM and value vault', () => {
    const {engine:local}=setup(true);
    const values={OXDZM_concentration:'0,2',OXDZM_concentrationUnit:'mmol/L',OXDZM_volume:'1,5',OXDZM_volumeUnit:'L',age:'17',ageMonths:'11',ageDays:'14',weight:'30',height:'140'};
    const doc={getElementById:id=>Object.hasOwn(values,id)?{value:values[id],type:'text'}:null,defaultView:{__vildaClcrVersionValueVault:{OXDZM_collectionHours:'24'}}};
    const input=local.readInputFromDocument(doc,{ageYears:18,weightKg:70,heightCm:180});
    expect(input).toMatchObject({ageYears:17+11/12,weightKg:'30',heightCm:'140',hours:'24'});
    expect(local.evaluate(input,policy)).toMatchObject({rawValue:0.3,populationCategory:'pediatric'});
    values.age=''; expect(local.readInputFromDocument(doc,{ageYears:18}).ageYears).toBeNull();
    expect(local.inputFromValues({OXDZM_concentration:'200',OXDZM_volume:'1500',age:'0',ageMonths:'0',ageDays:'14'},child).ageYears).toBeCloseTo(14/365.2425,14);
  });
  it('uses explicit supplied context or session context only when DOM context is absent', () => {
    const {engine:local,w}=setup();
    const doc={getElementById:()=>null,defaultView:{__vildaClcrVersionValueVault:{OXDZM_concentration:'200',OXDZM_volume:'1500'}}};
    w.ClcrOxDzmSession={readContext:()=>({...child,egfr:20})};
    expect(local.readInputFromDocument(doc)).toMatchObject({...child,ageYears:10,egfr:20});
    expect(local.readInputFromDocument(doc,{ageYears:40})).toMatchObject({ageYears:40,egfr:null});
    expect(local.captureFields(doc)).toEqual({OXDZM_concentration:'200',OXDZM_volume:'1500'});
  });
  it('does not derive time from dates alone or reinterpret historical mg/kg output', () => {
    const input=engine.inputFromValues({OXDZM_concentration:'200',OXDZM_volume:'1500',collectionStartAt:'2026-11-03T08:00',collectionEndAt:'2026-11-04T08:00'},child);
    expect(engine.evaluate(input,policy)).toMatchObject({valid:false,errorCode:'missing-hours'});
    expect(engine.evaluate({mode:'reported',reportedValue:'2',reportedUnit:'mg/kg/24 h'},policy).valid).toBe(false);
  });
  it('does not invoke accessor payloads or throw on invalid external input', () => {
    const input=Object.defineProperty({},'mode',{get(){throw Error('must not run');}});
    expect(()=>engine.evaluate(input,policy)).not.toThrow(); expect(engine.evaluate(input,policy).valid).toBe(false);
    const circular={}; circular.circular=circular; expect(engine.evaluate(circular,policy).valid).toBe(false);
  });
});
