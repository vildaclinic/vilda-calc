import {describe, expect, it} from 'vitest';
import {loadBrowserScript} from '../support/load-browser-script.mjs';

function setup(withBsa = true) {
  const w = {};
  for (const file of [...(withBsa ? ['clcr_extended_egfr.js'] : []), 'clcr_protein_dzm_data.js', 'clcr_protein_dzm.js']) loadBrowserScript(file, w);
  return {engine: w.VildaClcrProteinDzm, policy: w.ClcrProteinDzmReferenceData.DEFAULT_POLICY};
}
const {engine, policy} = setup();
const clone = value => JSON.parse(JSON.stringify(value));
const base = {concentration:'200', volume:'1500', ageYears:10, weightKg:'30', heightCm:'140'};
const calc = (patch = {}, source = policy) => engine.calculate({...base, ...patch}, source);
const daily = (value, patch = {}, source = policy) => calc({mode:'reported', reportedValue:String(value), ...patch}, source);
const numeric = text => Number(text.replace(',', '.'));

describe('total protein DZM production engine — actual quantity and safety', () => {
  it('calculates one absolute amount with default 24h and no required patient context', () => {
    const result = calc({ageYears:null, weightKg:'', heightCm:''});
    expect(result).toMatchObject({valid:true, ok:true, schema:'clcr-protein-dzm', version:1, rawValue:300, dailyMg:300, unit:'mg/24 h', exactMain:{numerator:'300', denominator:'1'}, hours:24, input:{hours:'24', durationSource:'assumed-24h'}, status:'unassessed', tone:'neutral', outOfRange:null, reference:null, indexed:null});
    expect(result.presentation).toMatchObject({valueText:'300', unitText:'mg/24 h', referenceValue:'Brak normy do porównania'});
    expect(result.missingIds).toEqual([]);
  });
  it.each([
    ['200','mg/L','1500','mL',300], ['20','mg/dL','1.5','L',300], ['0.2','g/L','1500','mL',300],
    ['0.01','mg/L','1500','mL',0.015], ['2','g/L','0.5','L',1000]
  ])('converts %s %s × %s %s to %s mg/day', (concentration, concentrationUnit, volume, volumeUnit, expected) => {
    expect(calc({concentration, concentrationUnit, volume, volumeUnit})).toMatchObject({valid:true, rawValue:expected});
  });
  it.each([['300','mg/24h'], ['0.3','g/24h']])('ready %s %s is a daily quantity and is never rescaled by 12h', (reportedValue, reportedUnit) => {
    expect(calc({mode:'reported', reportedValue, reportedUnit, hours:'12', concentration:'bad', volume:'-1'})).toMatchObject({valid:true, rawValue:300, hours:12, status:'unassessed', referenceActive:false, outOfRange:null});
  });
  it('uses actual time only in the concentration equation', () => {
    expect(calc({hours:'12'})).toMatchObject({valid:true, rawValue:600, status:'unassessed', reference:null});
    expect(calc({hours:'12'}).interpretation).toContain('rzeczywistego czasu');
    expect(daily(300, {hours:'12'}).interpretation).toContain('bez ponownego przeliczenia');
  });
  it.each(['', null, undefined])('new missing duration %s means assumed 24h', hours => {
    expect(calc({hours})).toMatchObject({valid:true, hours:24, input:{durationSource:'assumed-24h', durationNeedsConfirmation:false}});
  });
  it.each(['concentration', 'reported'])('historical missing hours in %s remain missing', mode => {
    expect(calc({mode, reportedValue:'300', hours:'', durationNeedsConfirmation:true})).toMatchObject({valid:false, errorCode:'missing-hours', missingIds:['Prot_collectionHours'], input:{durationSource:'historical-missing'}});
    expect(calc({mode, reportedValue:'300', hours:'12', durationNeedsConfirmation:true})).toMatchObject({valid:true, hours:12, reference:null, input:{durationNeedsConfirmation:false}});
  });
  it.each(['0','-1','bad','Infinity','0x18','<24'])('invalid known hours %s never become 24h', hours => {
    for (const mode of ['concentration','reported']) expect(calc({mode, reportedValue:'300', hours})).toMatchObject({valid:false, errorCode:'invalid-hours', rawValue:null});
  });
  it.each(['concentration','reported'])('known collection contradiction blocks %s', mode => {
    for (const knownFacts of [{collectionNoMissedVoids:false}, {ui_collectionNoSpillage_answer:'no'}, {Cl24CollectionProblem:true}]) expect(calc({mode, reportedValue:'300', knownFacts})).toMatchObject({valid:false, blocked:true, errorCode:'collection-conflict'});
  });
  it('unchecked protocol defaults do not fabricate a contradiction', () => {
    expect(engine.inputFromValues({Prot_concentration:'200', Prot_volume:'1500', collectionNoMissedVoids:false}).knownFacts).not.toHaveProperty('collectionNoMissedVoids');
  });
  it.each(['0','-0','0e-200'])('exact zero %s is accepted but never marked normal', concentration => {
    const result = calc({concentration});
    expect(result).toMatchObject({valid:true, rawValue:0, status:'zero', tone:'neutral', outOfRange:null, reference:null, presentation:{valueText:'0'}});
    expect(result.interpretation).toContain('granicy oznaczalności');
  });
  it.each(['0.01','1e-9','1e-200','1e-320'])('small positive concentration %s remains positive in calculation and display', concentration => {
    const result = calc({concentration});
    expect(result.valid).toBe(true);expect(result.rawValue).toBeGreaterThan(0);
    expect(numeric(result.display.text)).toBeGreaterThan(0);expect(numeric(result.presentation.valueText)).toBeGreaterThan(0);
  });
  it('preserves the audited 0.015mg and its 0.000015g output', () => {
    expect(calc({concentration:'0.01'})).toMatchObject({valid:true, rawValue:0.015, exactMain:{numerator:'3', denominator:'200'}, display:{text:'0,015'}});
    expect(calc({concentration:'0.01', outputUnit:'g/24h'})).toMatchObject({valid:true, rawValue:0.015, presentation:{rawValue:0.000015, valueText:'0,000015', unitText:'g/24 h'}});
  });
  it('fails explicitly instead of saving a zero for an unrepresentable g quantity', () => {
    expect(daily('5e-324')).toMatchObject({valid:true, rawValue:5e-324, presentation:{valueText:'5e-324'}});
    expect(daily('5e-324', {outputUnit:'g/24h'})).toMatchObject({valid:false, errorCode:'numeric-range', rawValue:null});
  });
  it.each(['-1','bad','Infinity','0x10','<3','1e-400'])('rejects invalid or nonfinite result %s', reportedValue => {
    expect(calc({mode:'reported', reportedValue})).toMatchObject({valid:false, rawValue:null});
  });
  it('does not accept unsupported units or silently truncate unrepresentable input digits', () => {
    expect(calc({concentrationUnit:'mmol/L'})).toMatchObject({valid:false, errorCode:'invalid-concentration-unit'});
    expect(daily(3, {reportedUnit:'mg/m²/24h'})).toMatchObject({valid:false, errorCode:'invalid-reported-unit'});
    expect(daily('0.123456789012345678901')).toMatchObject({valid:false, errorCode:'numeric-precision'});
  });
});

describe('total protein DZM — source-specific references and accepted pediatric cap', () => {
  it('reuses the current Haycock producer and caps only the healthy-upper comparison', () => {
    const result = calc();
    expect(result).toMatchObject({status:'high', tone:'warning', outOfRange:true, referenceActive:true, bsaMethod:'Haycock', bsaM2:1.0717691690196336, indexed:279.9110187825382});
    expect(result.reference).toMatchObject({ruleId:'pediatric-bsa-adult-cap-v1', upper:150, upperInclusive:false, bsa:1.0717691690196336, uncappedUpper:160.76537535294503, adultCap:150, capped:true, nephrotic:1071.7691690196336});
    expect(result.notes.referenceCalculation).toContain('Limit 150 mg/24 h jest dodatkową regułą');
    expect(result.reference.sourceIds).toContain('VILDA_PROTEIN_CAP_2026_10_29');
  });
  it('scales smaller BSA rather than using the adult upper bound', () => {
    const result = daily(70, {ageYears:2, weightKg:10, heightCm:80});
    expect(result.reference.bsa).toBeCloseTo(0.4755160350189111, 12);
    expect(result.reference.upper).toBeCloseTo(71.32740525283667, 10);
    expect(result.reference.capped).toBe(false);expect(result.status).toBe('within');
  });
  it.each([
    ['149.99999999999997','within','normal'], ['150','high','warning'], ['200','high','warning'],
    ['1071.7691690196334','high','warning'], ['1071.7691690196336','nephrotic','danger']
  ])('classifies capped child %s as %s before display rounding', (value, status, tone) => {
    const result = daily(value);expect(result).toMatchObject({valid:true, status, tone});
    const shown = numeric(result.presentation.valueText), bound = numeric(result.presentation.referenceValue.slice(1));
    expect(shown < bound).toBe(status === 'within');
  });
  it.each([['149.99999999999997','within'], ['150','high'], ['3499.9999999999995','high'], ['3500','nephrotic']])('adult threshold %s remains correct in g', (value, status) => {
    const result = daily(value, {ageYears:18, weightKg:'', heightCm:'', outputUnit:'g/24h'});
    expect(result).toMatchObject({valid:true, status, reference:{upper:150, nephrotic:3500, bsa:null}});
    if (status === 'within') expect(numeric(result.presentation.valueText)).toBeLessThan(0.15);
    if (value === '3499.9999999999995') expect(numeric(result.presentation.valueText)).toBeLessThan(3.5);
  });
  it.each(['mg/24h','g/24h'])('shares the near-nephrotic patient/boundary precision in %s', outputUnit => {
    const below=daily('1071.7691690196334',{outputUnit});
    expect(numeric(below.presentation.valueText)).toBeLessThan(numeric(below.presentation.nephroticValue));
    expect(below.presentation.nephroticText).toBe('≥'+below.presentation.nephroticValue+' '+below.presentation.unitText);
    const boundary=daily('1071.7691690196336',{outputUnit});
    expect(numeric(boundary.presentation.valueText)).toBeGreaterThanOrEqual(numeric(boundary.presentation.nephroticValue));
  });
  it('does not switch the whole child profile to adult when BSA exceeds 1', () => {
    expect(daily(1500, {ageYears:17})).toMatchObject({status:'nephrotic', reference:{upper:150, nephrotic:1071.7691690196336}});
    expect(daily(1500, {ageYears:18})).toMatchObject({status:'high', reference:{upper:150, nephrotic:3500}});
  });
  it('from 6 months applies the upper reference, but not the age1+ nephrotic grade', () => {
    expect(daily(1000, {ageYears:0.5, weightKg:8, heightCm:70})).toMatchObject({valid:true, status:'high', reference:{nephrotic:null}});
    expect(daily(1000, {ageYears:1, weightKg:8, heightCm:70})).toMatchObject({valid:true, status:'nephrotic'});
  });
  it.each([
    {ageYears:0.49999999999999994}, {ageYears:null}, {ageYears:'bad'}, {weightKg:''}, {heightCm:''}, {weightKg:'-1'}, {heightCm:'0'}
  ])('missing qualifying context %j leaves the number neutral', patch => {
    expect(calc(patch)).toMatchObject({valid:true, rawValue:300, status:'unassessed', reference:null, outOfRange:null, tone:'neutral'});
  });
  it('does not claim an exact infant age from completed year zero', () => {
    expect(daily(100, {ageYears:0, agePrecision:'completed-years'})).toMatchObject({status:'unassessed', reference:null});
  });
  it('honors injected reference data rather than hidden default thresholds', () => {
    const source = clone(policy);source.id='FICTIONAL_REFERENCE';source.population.label='Fikcyjna populacja testowa';source.profiles[0].upper=50;source.profiles[0].adultCap=80;source.profiles[0].nephrotic=500;
    const result = daily(90, {}, source);
    expect(result.policy.id).toBe('FICTIONAL_REFERENCE');expect(result.population.label).toBe('Fikcyjna populacja testowa');
    expect(result.reference.upper).toBeCloseTo(53.58845845098168, 12);expect(result.status).toBe('high');
    source.profiles[0].upper=20;expect(result.reference.sourceUpper).toBe(50);expect(Object.isFrozen(result.referencePolicy)).toBe(true);
  });
  it.each([null, {}, {...policy, minimumAge:-1}, {...policy, profiles:[]}])('invalid injected policy %j never substitutes the default', source => {
    expect(calc({}, source)).toMatchObject({valid:true, status:'unassessed', reference:null, outOfRange:null, policy:null});
  });
  it('does not fabricate a BSA if the existing producer is absent', () => {
    const missing=setup(false);expect(missing.engine.evaluate(base, missing.policy)).toMatchObject({valid:true, status:'unassessed', reference:null});
  });
});

describe('total protein DZM — production adapters and exact unit provenance', () => {
  it('maps independent new controls without reinterpreting legacy U_Prot', () => {
    const input=engine.inputFromValues({U_Prot:'300', V24:'1500', age:'10', weight:'30', height:'140'});
    expect(input).toMatchObject({mode:'concentration', concentration:'', volume:'', weightKg:'30', heightCm:'140', ageYears:10, agePrecision:'completed-years'});
    expect(engine.compute(input)).toMatchObject({valid:false, missingIds:['Prot_concentration','Prot_volume']});
  });
  it('uses existing exact months and context duration, without adding numerical requirements', () => {
    const input=engine.inputFromValues({Prot_concentration:'200', Prot_volume:'1500', age:'0', ageMonths:'8'}, {durationMinutes:720});
    expect(input.ageYears).toBe(8/12);expect(input.hours).toBe(12);expect(input.durationSource).toBe('captured');
    expect(engine.evaluate(input,policy)).toMatchObject({valid:true, rawValue:600, status:'unassessed'});
  });
  it('retains date-only legacy uncertainty instead of fabricating a new 24h', () => {
    const input=engine.inputFromValues({Prot_reportedValue:'300', Prot_inputMode:'reported', collectionStartAt:'2026-10-28T08:00'});
    expect(input).toMatchObject({hours:'', durationSource:'historical-missing', durationNeedsConfirmation:true});
    expect(engine.compute(input)).toMatchObject({valid:false, errorCode:'missing-hours'});
  });
  it('reads native values or the value vault while keeping known context', () => {
    const controls={Prot_concentration:{value:'0.01'}, Prot_volume:{value:'1500'}, age:{value:'10'}, weight:{value:'30'}, height:{value:'140'}};
    const input=engine.readInputFromDocument({getElementById:id=>controls[id], defaultView:{__vildaClcrVersionValueVault:{Prot_outputUnit:'g/24h'}}});
    expect(engine.evaluate(input,policy)).toMatchObject({valid:true, rawValue:0.015, presentation:{valueText:'0,000015'}});
  });
  it.each(['149.99999999999997','150','1071.7691690196336'])('unit provenance retains canonical quantity and category for %s', originalValue => {
    const initial=daily(originalValue), conversion=engine.convertUnitInput(originalValue,'mg/24h','g/24h','reportedValue');
    expect(conversion.ok).toBe(true);
    const result=daily(conversion.text,{reportedUnit:'g/24h', unitConversions:{reportedValue:{originalValue,originalUnit:'mg/24h',convertedValue:conversion.text,convertedUnit:'g/24h'}}});
    expect(result.exactMain).toEqual(initial.exactMain);expect(result.status).toBe(initial.status);expect(result.rawValue).toBe(initial.rawValue);
  });
  it('does not let stale conversion metadata override manual editing', () => {
    const conversion=engine.convertUnitInput('150','mg/24h','g/24h','reportedValue');
    const result=daily('0.1',{reportedUnit:'g/24h',unitConversions:{reportedValue:{originalValue:'150',originalUnit:'mg/24h',convertedValue:conversion.text,convertedUnit:'g/24h'}}});
    expect(result).toMatchObject({rawValue:100,status:'within',input:{unitConversions:{}}});
  });
  it('rejects unsupported conversion instead of rewriting a field', () => {
    expect(engine.convertUnitInput('3','mg/L','mmol/L','concentration')).toMatchObject({ok:false});
    expect(engine.convertUnitInput('0','mL','L','volume')).toMatchObject({ok:false});
  });
});
