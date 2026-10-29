import {describe, expect, it} from 'vitest';
import {loadBrowserScript} from '../support/load-browser-script.mjs';

function setup() {
  const w = {};
  for (const file of ['clcr_po4_dzm_reference_data.js', 'clcr_po4_dzm.js']) loadBrowserScript(file, w);
  return {engine: w.VildaClcrPo4Dzm, policy: w.ClcrPo4DzmReferenceData.DEFAULT_POLICY};
}
const {engine, policy} = setup();
const clone = value => JSON.parse(JSON.stringify(value));
const base = {concentration:'50', volume:'1500', ageYears:10, sex:'F', weightKg:'30'};
const calc = (patch = {}, source = policy) => engine.calculate({...base, ...patch}, source);
const daily = (value, patch = {}, source = policy) => calc({mode:'reported', reportedValue:String(value), ...patch}, source);
const shown = text => Number(text.replace(',', '.'));

// Fixed expected values come from the accepted manufacturer P conversion and
// the complete 2026-10-29 Labcorp reference table, not a duplicate engine.
describe('PO4 DZM production engine — quantity and input safety', () => {
  it('calculates absolute elemental-P excretion without requiring mass', () => {
    const result = calc({weightKg:''});
    expect(result).toMatchObject({ok:true, valid:true, schema:'clcr-po4-dzm', version:1, rawValue:750, value:750, dailyMg:750, unit:'mg P/24 h', chemicalBasis:'phosphorus-P', molarMass:30.9738, exactMain:{numerator:'750', denominator:'1'}, perKg:null, status:'within', tone:'normal', outOfRange:false, input:{concentrationUnit:'mgP/dL', hours:'24', durationSource:'assumed-24h'}});
    expect(result.presentation).toMatchObject({ok:true, valueText:'750', referenceValue:'130–941', unitText:'mg P/24 h'});
    expect(result.reference).toMatchObject({lower:130, upper:941, lowerInclusive:true, upperInclusive:true});
  });
  it.each([
    ['50','mgP/dL','1500','mL',750],
    ['500','mgP/L','1.5','L',750],
    ['1','mmol/L','1','L',30.9738],
    ['3.09738','mgP/dL','1000','mL',30.9738],
    ['30.9738','mgP/L','1000','mL',30.9738]
  ])('converts %s %s × %s %s to %s mg P/day', (concentration, concentrationUnit, volume, volumeUnit, expected) => {
    expect(calc({concentration, concentrationUnit, volume, volumeUnit})).toMatchObject({valid:true, rawValue:expected, dailyMg:expected, unit:'mg P/24 h'});
  });
  it.each([['61.9476','mgP/24h'], ['2','mmol/24h']])('reported %s %s is not rescaled by 12 hours', (reportedValue, reportedUnit) => {
    expect(calc({mode:'reported', reportedValue, reportedUnit, hours:'12', concentration:'bad', volume:'-1'})).toMatchObject({valid:true, rawValue:61.9476, hours:12, status:'unassessed', tone:'neutral', reference:null, outOfRange:null});
  });
  it('concentration normalizes by actual time, but comparison is withheld', () => {
    const result = calc({hours:'12'});
    expect(result).toMatchObject({valid:true, rawValue:1500, hours:12, reference:null, status:'unassessed', outOfRange:null});
    expect(result.interpretation).toContain('rzeczywistego czasu');
    expect(daily(750, {hours:'12'}).interpretation).toContain('bez ponownego przeliczenia');
  });
  it.each(['', null, undefined])('new blank duration %s means an explicit assumption of 24h', hours => {
    expect(calc({hours})).toMatchObject({valid:true, hours:24, input:{hours:'24', durationSource:'assumed-24h', durationNeedsConfirmation:false}});
  });
  it.each(['concentration','reported'])('historical missing hours block %s until corrected', mode => {
    expect(calc({mode, reportedValue:'750', hours:'', durationNeedsConfirmation:true})).toMatchObject({valid:false, errorCode:'missing-hours', missingIds:['PO4_collectionHours'], input:{durationSource:'historical-missing'}});
    expect(calc({mode, reportedValue:'750', hours:'12', durationNeedsConfirmation:true})).toMatchObject({valid:true, hours:12, reference:null, input:{durationNeedsConfirmation:false, durationSource:'hours'}});
  });
  it.each(['0', '-1', 'bad', 'NaN', 'Infinity', '0x18', '<24'])('explicit invalid hours %s cannot become 24 in either mode', hours => {
    for (const mode of ['concentration','reported']) expect(calc({mode, reportedValue:'750', hours})).toMatchObject({valid:false, rawValue:null, errorCode:'invalid-hours'});
  });
  it.each(['concentration','reported'])('known collection contradiction blocks %s', mode => {
    for (const knownFacts of [{collectionNoMissedVoids:false}, {ui_collectionNoSpillage_answer:'no'}, {Cl24CollectionProblem:true}]) {
      expect(calc({mode, reportedValue:'750', knownFacts})).toMatchObject({valid:false, rawValue:null, blocked:true, errorCode:'collection-conflict'});
    }
  });
  it('unchecked default is not changed into a known invalid collection', () => {
    expect(engine.inputFromValues({U_PO4:'50', V24:'1500', collectionNoMissedVoids:false}).knownFacts).not.toHaveProperty('collectionNoMissedVoids');
  });
  it.each(['0','-0','0e-300'])('exact zero %s is valid and neutral', concentration => {
    const result = calc({concentration});
    expect(result).toMatchObject({valid:true, rawValue:0, status:'zero', tone:'neutral', outOfRange:null, reference:null, display:{text:'0'}, presentation:{valueText:'0'}});
    expect(result.interpretation).toContain('granicy oznaczalności');
    expect(result.interpretation).toContain('„<”');
  });
  it('zero retains known non24 context', () => {
    const result = daily(0, {hours:'12'});
    expect(result.interpretation).toContain('bez ponownego przeliczenia');
    expect(result.interpretation).toContain('granicy oznaczalności');
  });
  it.each(['0.001','0.000000001','1e-320'])('positive concentration %s stays numerically and visibly positive', concentration => {
    const result = calc({concentration});
    expect(result.valid).toBe(true);
    expect(result.rawValue).toBeGreaterThan(0);
    expect(shown(result.presentation.valueText)).toBeGreaterThan(0);
    expect(shown(result.display.text)).toBeGreaterThan(0);
  });
  it('keeps the audited small result 0.015 without reading a rounded display', () => {
    expect(calc({concentration:'0,001'})).toMatchObject({rawValue:0.015, exactMain:{numerator:'3', denominator:'200'}, presentation:{valueText:'0,015'}, perKg:0.0005});
  });
  it('retains representable subnormal mg and rejects impossible mmol output', () => {
    expect(daily('5e-324')).toMatchObject({valid:true, rawValue:5e-324, presentation:{valueText:'5e-324'}});
    expect(daily('5e-324', {outputUnit:'mmol/24h'})).toMatchObject({valid:false, rawValue:null, errorCode:'numeric-range'});
    expect(calc({concentration:'1e-320', concentrationUnit:'mgP/L', volume:'1e-10'})).toMatchObject({valid:false, errorCode:'numeric-range'});
  });
  it('uses rational arithmetic before finite result conversion', () => {
    expect(calc({concentration:'1e308', concentrationUnit:'mgP/L', volume:'1e308', volumeUnit:'L', hours:'1e308'})).toMatchObject({valid:false, errorCode:'numeric-range'});
    expect(calc({concentration:'1e308', concentrationUnit:'mgP/L', volume:'1e308', volumeUnit:'mL', hours:'1e308'})).toMatchObject({valid:true, rawValue:2.4e306});
  });
  it.each(['1e-324', '1e309', '-1', 'NaN', '0x10', '<5', '1,2.3', '1.0000000000000001'])('invalid or lossy concentration %s is rejected', concentration => {
    expect(calc({concentration})).toMatchObject({valid:false, rawValue:null});
  });
  it.each([{volume:'0'}, {volume:'-1'}, {volumeUnit:'dl'}, {concentrationUnit:'mgPO4/dL'}, {mode:'other'}, {mode:'reported', reportedValue:'2', reportedUnit:'mg/kg/24h'}, {outputUnit:'mgPO4/24h'}])('invalid quantity input %j is rejected', patch => {
    expect(calc(patch)).toMatchObject({valid:false, rawValue:null});
  });
  it('mass affects only optional details; missing and invalid mass preserve main result', () => {
    expect(calc()).toMatchObject({rawValue:750, perKg:25, perKgDisplay:'25'});
    for (const weightKg of ['', '-1', '0', 'bad', '1e-324']) {
      const result = calc({weightKg});
      expect(result).toMatchObject({valid:true, rawValue:750, perKg:null, status:'within'});
      expect(result.cautions.length).toBe(weightKg ? 1 : 0);
    }
  });
  it('supports Mg-compatible numeric/unit adapters without changing P basis', () => {
    expect(calc({concentrationUnit:'mg/dL'}).input.concentrationUnit).toBe('mgP/dL');
    expect(daily(750, {reportedUnit:'mg/24 h'}).input.reportedUnit).toBe('mgP/24h');
  });
});

describe('PO4 DZM reference source — table, ages, sex and precision', () => {
  const profiles = [
    [6, 'M', 130, 941], [6,'F',130,941], [12.999999,'M',130,941], [12.999999,null,130,941],
    [13,'M',390,1425], [13,'F',261,1078], [80.999999,'M',390,1425], [80.999999,'F',261,1078],
    [81,'M',210,888], [81,'F',96,706], [120,'M',210,888], [120,'F',96,706]
  ];
  it.each(profiles)('uses only source interval at age %s sex %s: %s–%s', (ageYears, sex, lower, upper) => {
    const result = daily(lower, {ageYears, sex});
    expect(result).toMatchObject({valid:true, status:'within', outOfRange:false, reference:{lower, upper}});
    expect(daily(upper, {ageYears, sex}).status).toBe('within');
    expect(daily(lower - 0.00001, {ageYears, sex}).status).toBe('low');
    expect(daily(upper + 0.00001, {ageYears, sex}).status).toBe('high');
  });
  it.each([null, '', -1, 'bad', 0, 5, 5.999999])('age %s has no substitution or normal verdict', ageYears => {
    expect(calc({ageYears})).toMatchObject({valid:true, rawValue:750, status:'unassessed', reference:null, tone:'neutral', outOfRange:null});
  });
  it.each([13, 45, 80, 81, 110])('unknown sex at %s does not borrow another profile', ageYears => {
    const result = calc({ageYears, sex:null});
    expect(result).toMatchObject({valid:true, status:'unassessed', reference:null, outOfRange:null});
    expect(result.interpretation).toContain('wymaga znanej płci');
  });
  it.each([6,12,13,80,81])('completed age %s keeps its whole [age,age+1) interval', ageYears => {
    expect(calc({ageYears, agePrecision:'completed-years'}).reference).not.toBeNull();
  });
  it('does not treat a noninteger completed-year entry as exact age', () => {
    expect(calc({ageYears:12.5, agePrecision:'completed-years'}).reference).toBeNull();
  });
  it('source-specific comparison can change independently of clinical arithmetic', () => {
    const modified = clone(policy);
    modified.id = 'SYNTHETIC_TEST_ONLY';
    modified.profiles[0].lower = 800;
    modified.profiles[0].text = '800–941';
    const result = calc({}, modified);
    expect(result).toMatchObject({rawValue:750, status:'low', referenceText:'800–941', policy:{id:'SYNTHETIC_TEST_ONLY', version:1}});
    expect(result.referencePolicy).toEqual(modified);
    expect(calc({}, null)).toMatchObject({rawValue:750, reference:null, referencePolicy:null, policy:null, tone:'neutral', outOfRange:null});
  });
  it('rejects malformed source policy and never executes a policy getter', () => {
    const malformed = clone(policy);
    malformed.profiles[0].lower = -1;
    expect(calc({}, malformed).reference).toBeNull();
    let called = false;
    const getter = {get quantity() {called = true; return 'phosphorus-excretion';}};
    expect(calc({}, getter).reference).toBeNull();
    expect(called).toBe(false);
  });
  it('freezes a JSON-safe source, exact value, input and interpretation context', () => {
    const result = calc({outputUnit:'mmol/24h'});
    expect(clone(result)).toEqual(result);
    for (const value of [result, result.input, result.reference, result.sources, result.policy, result.referencePolicy, result.referencePolicy.profiles, result.notes, result.presentation, result.presentation.exactLower]) expect(Object.isFrozen(value)).toBe(true);
  });
  it.each([['129.99999999999997','low'],['130','within'],['130.00000000000003','within'],['940.9999999999999','within'],['941','within'],['941.0000000000001','high']])('displays %s %s against both bounds coherently in both units', (value, status) => {
    for (const outputUnit of ['mgP/24h', 'mmol/24h']) {
      const result = daily(value, {outputUnit}), p = result.presentation;
      expect(result.valid).toBe(true);
      expect(result.status).toBe(status);
      expect(p.ok).toBe(true);
      const [low, high] = p.referenceValue.split('–').map(shown), display = shown(p.valueText);
      if (status === 'low') expect(display).toBeLessThan(low);
      else if (status === 'high') expect(display).toBeGreaterThan(high);
      else {expect(display).toBeGreaterThanOrEqual(low); expect(display).toBeLessThanOrEqual(high);}
      expect(p.referenceText).toBe(`${p.referenceValue} ${p.unitText}`);
    }
  });
  it('preserves an exact distinction smaller than Number precision at a source bound', () => {
    const result = calc({concentration:'13.000000000000002', concentrationUnit:'mgP/L', volume:'9.999999999999998', volumeUnit:'L'});
    expect(result).toMatchObject({valid:true, rawValue:130, status:'low', outOfRange:true});
    expect(result.presentation.valueText).toBe('129,9999999999999939');
    expect(result.presentation.referenceValue).toBe('130–941');
    expect(result.presentation.precision).toBeGreaterThan(15);
    const molar = engine.presentation(result, 'mmol/24h');
    expect(molar.ok).toBe(true);
    expect(molar.valueText).not.toBe(molar.referenceValue.split('–')[0]);
  });
  it('joint molar precision increases near a source boundary', () => {
    const result = daily('129.999999999', {outputUnit:'mmol/24h'});
    expect(result.presentation.precision).toBeGreaterThan(3);
    expect(shown(result.presentation.valueText)).toBeLessThan(shown(result.presentation.referenceValue.split('–')[0]));
    expect(result).toMatchObject({rawValue:129.999999999, unit:'mg P/24 h', outputUnit:'mmol/24h', input:{outputUnit:'mmol/24h'}});
  });
});

describe('PO4 DZM existing patient and collection adapters', () => {
  it('uses legacy producer fields with explicit mg P/dL and known patient fields', () => {
    const input = engine.inputFromValues({U_PO4:'50', V24:'1500', weight:'30', age:'10', ageMonths:'0', sex:'F'});
    expect(input).toMatchObject({concentration:'50', concentrationUnit:'mgP/dL', volume:'1500', hours:'24', durationSource:'assumed-24h', ageYears:10, agePrecision:'exact', weightKg:'30'});
    expect(engine.calculate(input, policy).rawValue).toBe(750);
  });
  it('keeps age-year precision and source provenance without reparsing dates', () => {
    expect(engine.inputFromValues({age:'12'})).toMatchObject({ageYears:12, agePrecision:'completed-years'});
    expect(engine.inputFromValues({age:'12', ageMonths:'6'})).toMatchObject({ageYears:12.5, agePrecision:'exact'});
    expect(engine.inputFromValues({age:'0', ageMonths:'0', ageDays:'30'}).ageYears).toBe(30/365.25);
    expect(engine.inputFromValues({age:'3', ageMonths:'12'}).ageYears).toBeNull();
    expect(engine.inputFromValues({U_PO4:'50', V24:'1500', collectionStartAt:'2026-10-28T08:00', collectionEndAt:'2026-10-29T08:00'})).toMatchObject({hours:'', durationNeedsConfirmation:true, durationSource:'historical-missing'});
    expect(engine.inputFromValues({U_PO4:'50', V24:'1500'}, {durationMinutes:720})).toMatchObject({hours:12, durationSource:'captured'});
  });
  it('reads known shared context and UI hidden provenance via document/vault', () => {
    const values = {PO4_inputMode:'reported', PO4_reportedValue:'750', PO4_reportedUnit:'mgP/24h', PO4_collectionHours:'', PO4_collectionSource:'historical-missing', age:'10', sex:'F'};
    const doc = {getElementById:id => Object.hasOwn(values,id) ? {value:values[id], type:'text'} : null};
    const input = engine.readInputFromDocument(doc);
    expect(engine.calculate(input,policy)).toMatchObject({valid:false, errorCode:'missing-hours'});
    const vault = {PO4_concentration:'50',PO4_volume:'1500',PO4_collectionHours:'12',age:'10',sex:'F'};
    expect(engine.calculate(engine.readInputFromDocument({getElementById:()=>null,defaultView:{__vildaClcrVersionValueVault:vault}}),policy)).toMatchObject({valid:true, rawValue:1500, hours:12, reference:null});
  });
});

describe('PO4 DZM exact input conversion provenance', () => {
  function converted(value, originalUnit, convertedUnit, kind) {
    const conversion = engine.convertUnitInput(String(value), originalUnit, convertedUnit, kind);
    expect(conversion.ok).toBe(true);
    return {conversion, entry:{originalValue:String(value), originalUnit, convertedValue:conversion.text, convertedUnit}};
  }
  it.each([130, 941])('keeps exact concentration boundary %s through the first molar switch and reload', value => {
    const {conversion, entry} = converted(value, 'mgP/L', 'mmol/L', 'concentration');
    const values = {PO4_concentration:conversion.text, PO4_concentrationUnit:'mmol/L', PO4_volume:'1', PO4_volumeUnit:'L', PO4_unitConversions:JSON.stringify({concentration:entry}), age:'10', sex:'F'};
    const result = engine.calculate(engine.inputFromValues(values), policy);
    expect(result).toMatchObject({valid:true, rawValue:value, exactMain:{numerator:String(value), denominator:'1'}, status:'within', outOfRange:false});
    expect(result.input.unitConversions).toEqual({concentration:entry});
    const restored = engine.calculate(clone(result.input), policy);
    expect(restored.exactMain).toEqual(result.exactMain);
    expect(restored.status).toBe('within');
    expect(Object.isFrozen(result.input.unitConversions.concentration)).toBe(true);
  });
  it.each([130, 941])('keeps exact daily-report boundary %s through molar switch and reload', value => {
    const {conversion, entry} = converted(value, 'mgP/24h', 'mmol/24h', 'reportedValue');
    const result = daily(conversion.text, {reportedUnit:'mmol/24h', unitConversions:{reportedValue:entry}});
    expect(result).toMatchObject({valid:true, rawValue:value, exactMain:{numerator:String(value), denominator:'1'}, status:'within'});
    expect(engine.calculate(clone(result.input), policy).exactMain).toEqual(result.exactMain);
  });
  it('keeps volume and concentration origins independently in one calculation', () => {
    const concentration = converted('94.1', 'mgP/dL', 'mmol/L', 'concentration');
    const volume = converted('1000', 'mL', 'L', 'volume');
    const result = calc({concentration:concentration.conversion.text, concentrationUnit:'mmol/L', volume:volume.conversion.text, volumeUnit:'L', unitConversions:{concentration:concentration.entry, volume:volume.entry}});
    expect(result).toMatchObject({rawValue:941, exactMain:{numerator:'941', denominator:'1'}, status:'within'});
  });
  it('a manual edit invalidates the prior conversion binding and defines the new measurement', () => {
    const {entry} = converted('130', 'mgP/24h', 'mmol/24h', 'reportedValue');
    const result = daily('1', {reportedUnit:'mmol/24h', unitConversions:{reportedValue:entry}});
    expect(result).toMatchObject({rawValue:30.9738, exactMain:{numerator:'154869', denominator:'5000'}, status:'low', input:{unitConversions:{}}});
  });
  it('a changed unit invalidates the prior conversion binding', () => {
    const {conversion, entry} = converted('130', 'mgP/24h', 'mmol/24h', 'reportedValue');
    const result = daily(conversion.text, {reportedUnit:'mgP/24h', unitConversions:{reportedValue:entry}});
    expect(result.input.unitConversions).toEqual({});
    expect(result.rawValue).toBe(conversion.value);
  });
  it('rejects unrelated, malformed or lossy conversion provenance without executing getters', () => {
    const {conversion, entry} = converted('941', 'mgP/24h', 'mmol/24h', 'reportedValue');
    for (const patch of [{originalValue:'130'}, {originalUnit:'mgPO4/24h'}, {convertedValue:'1'}, {extra:true}, {originalValue:'941.00000000000000001'}]) {
      const result = daily(conversion.text, {reportedUnit:'mmol/24h', unitConversions:{reportedValue:{...entry, ...patch}}});
      expect(result.input.unitConversions).toEqual({});
    }
    expect(daily(750, {unitConversions:'not JSON'}).input.unitConversions).toEqual({});
    let called = false;
    const bad = {get reportedValue() {called = true; return entry;}};
    expect(daily(conversion.text, {reportedUnit:'mmol/24h', unitConversions:bad}).input.unitConversions).toEqual({});
    expect(called).toBe(false);
  });
  it('formats input conversions for roundtrip parsing rather than result-display precision', () => {
    expect(engine.convertUnitInput('130', 'mgP/24h', 'mmol/24h', 'reportedValue')).toMatchObject({ok:true, text:'4,197095609837992', value:4.197095609837992, exactValue:{numerator:'50000', denominator:'11913'}});
    expect(engine.convertUnitInput('0.001', 'mgP/dL', 'mgP/L', 'concentration')).toMatchObject({ok:true, text:'0,01'});
    expect(engine.convertUnitInput('1e-320', 'mgP/dL', 'mgP/L', 'concentration')).toMatchObject({ok:true, value:1e-319});
    expect(engine.convertUnitInput('0', 'mgP/dL', 'mmol/L', 'concentration')).toMatchObject({ok:true, text:'0'});
    for (const args of [['5e-324','mgP/24h','mmol/24h','reportedValue'], ['1e308','L','mL','volume'], ['0','mL','L','volume'], ['1','mgPO4/dL','mmol/L','concentration']]) expect(engine.convertUnitInput(...args).ok).toBe(false);
  });
});
