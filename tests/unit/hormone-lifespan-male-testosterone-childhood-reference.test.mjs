import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { beforeFemaleE2ChildhoodBundle, beforeTestosteroneBoysBundle } from '../support/prior-female-gonadotropin-bundle.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const display = require('../../vilda_hormone_lifespan_display.js');
const ageEngine = require('../../vilda_lab_puberty.js');
const agePolicy = require('../../vilda_lab_puberty_data.js');
const labEngine = require('../../vilda_lab_testosterone.js');
const labData = require('../../vilda_lab_testosterone_data.js');
const data = runtime.patientPointData;
const read = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const policy = read('male-testosterone-childhood-reference-policy.json');
const source = read('evidence/patient-point/kushnir2010-male-testosterone-group-medians.json');
const ids = ['kushnir2010-male-t-1-2-group', 'kushnir2010-male-t-2-3-group'];
const profile = index => data.profiles.find(item => item.id === ids[index]);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const context = (ageYears = 2, extra = {}) => ({ analyte: 'testosterone_total', sex: 'male', ageYears, preterm: 'no',
  measurement: { value: .2, unit: 'nmol/L', operator: '=' }, ...extra });
const evaluate = (ageYears, extra) => engine.evaluate(data, context(ageYears, extra));
const unavailable = reason => ({ status: 'unavailable', reason });

describe('Testosteron chłopców 1–<3 — przybliżone mediany grup Kushnir 2010', () => {
  it('dodaje wyłącznie dwa profile, zachowując 82 wcześniejsze profile, jednostki i pozostały runtime', () => {
    expect(data.version).toBe('2026-10-22.2');
    expect(data.profiles).toHaveLength(85);
    expect(data).toEqual(read('population-reference-data.json'));
    expect(beforeFemaleE2ChildhoodBundle(data).profiles.slice(-2).map(item => item.id)).toEqual(ids);
    const prior = beforeTestosteroneBoysBundle(data);
    expect(prior.profiles).toHaveLength(82);
    // Frozen complete audyt 0d7b4160 bundle: these checks protect every
    // earlier number, source boundary, assay/material gate and provenance.
    expect(digest(prior.profiles)).toBe('8900802bb979f8663a3b2904c89e025feb5324ef8b6fb6c83bb5236a4f0f6a74');
    expect(digest(prior)).toBe('11905045ada04596a294491dce3d9986cd027b4882aa50f3bc5697b43d61da4f');
    const otherRuntime = Object.fromEntries(Object.entries(runtime).filter(([key]) =>
      key !== 'patientPointData' && key !== 'amhLilacsSourceData'));
    expect(digest(otherRuntime)).toBe('47fda226dc893be4f94578a53c75d91d8a0c98fece580b7c6f46525a77f2def0');
    expect(policy).toMatchObject({ kind: 'educational-source-selection', ordinaryOnly: true });
  });

  it('zachowuje przybliżony odczyt właściwych markerów, nie tworząc liczebności grup ani RI', () => {
    expect(source).toMatchObject({ sourceUnit: 'µg/L', unit: 'nmol/L', statistic: 'group-median', approximate: true,
      source: { doi: '10.1373/clinchem.2010.143222', figure: '4C', printedPage: 1146,
        sourceSha256: '25132120d7379f5d1e94dc6a6381e4de6550d901121afcd70b3bd987d457442d',
        sourceQuantification: { lodNgL: 5, loqNgL: 10, censoringRule: null, belowLoqCounts: null } },
      digitization: { numericTable: false, roundingStepUgL: .01, approximateDigitizationToleranceNgL: 5,
        approximateDigitizationToleranceNmolL: .017335 },
      conversion: { ngDlPerUgL: 100, nmolLPerNgDl: .03467, sourceToCanonicalFactor: 3.467 } });
    const checks = [
      { id: '1-2', label: '1 to 2 years', sourceMedian: .03, canonicalMedian: .10401 },
      { id: '2-3', label: '2 to 3 years', sourceMedian: .02, canonicalMedian: .06934 },
    ];
    for (const [index, check] of checks.entries()) {
      expect(source.groups[index]).toMatchObject({ ...check, n: null });
      const geometry = source.groups[index].geometry;
      expect(geometry.boundingBoxCenterReadoutNgL).toBeGreaterThan(10);
      expect(geometry.centroidReadoutNgL).toBeGreaterThan(10);
      expect(profile(index)).toMatchObject({ id: ids[index], analyte: 't', sex: 'male',
        minAge: index + 1, maxAge: index + 2, maxAgeExclusive: true, ordinaryOnly: true,
        statistic: 'group-median', interpolation: 'constant', approximate: true, referenceSignificantDigits: 1,
        unit: 'nmol/L', specimen: 'serum', compatibleSpecimenIds: ['serum', 'surowica'], ageGroup: { n: null } });
      expect(profile(index).points).toEqual([
        { ageYears: index + 1, value: check.canonicalMedian },
        { ageYears: index + 2, value: check.canonicalMedian },
      ]);
      expect(profile(index).patientNote).toContain('LC-MS/MS');
      expect(profile(index)).not.toHaveProperty('requiredGonadalStage');
      for (const key of ['referenceInterval', 'sds', 'percentile', 'classification', 'clinicalCutoff']) {
        expect(profile(index)).not.toHaveProperty(key);
      }
    }
  });

  it('stosuje stałą medianę całej grupy i przełącza źródła dokładnie w 1., 2. i 3. urodziny', () => {
    // Coarse Figure 4C readouts 0.03/0.02 µg/L, converted independently
    // with the existing app unit convention, not from a smooth drawing.
    for (const [ages, id, median] of [
      [[1, 1.000001, 1.5, 1.999999], ids[0], .10401],
      [[2, 2.000001, 2.5, 2.999999], ids[1], .06934],
    ]) {
      for (const age of ages) {
        expect(evaluate(age)).toMatchObject({ status: 'ready', value: .2, referenceValue: median,
          profile: { id, statistic: 'group-median' } });
      }
    }
    expect(evaluate(.999999)).toEqual(unavailable('reference-unavailable'));
    expect(evaluate(3)).toMatchObject({ status: 'ready', referenceValue: .3764139001167295,
      profile: { id: 'kelsey2014-male-t-childhood' } });
    for (const [index, start] of [1, 2].entries()) {
      expect(engine.referenceAt(profile(index), start - .000001)).toBeNull();
      expect(engine.referenceAt(profile(index), start + 1)).toBeNull();
      expect(engine.sampleProfile(profile(index), 5).every(point => point.value === [.10401, .06934][index])).toBe(true);
    }
  });

  it('kwalifikuje cały możliwy wiek z produkcyjnego resolvera zamiast przypisywać fikcyjną datę', () => {
    for (const [reported, id] of [
      [{ years: 1, months: 0, precision: 'month' }, ids[0]],
      [{ years: 1, months: 11, precision: 'month' }, ids[0]],
      [{ years: 1, precision: 'year' }, ids[0]],
      [{ years: 2, months: 0, precision: 'month' }, ids[1]],
      [{ years: 2, months: 11, precision: 'month' }, ids[1]],
      [{ years: 2, precision: 'year' }, ids[1]],
    ]) {
      const age = ageEngine.resolveAge({ age: reported });
      expect(age.status).toBe('known');
      expect(evaluate(age.lowerYears, { ageUpperYears: age.upperYears, ageUpperInclusive: age.upperInclusive }))
        .toMatchObject({ status: 'ready', profile: { id } });
    }
    for (const [age, boundary] of [[1.5, 2], [2.5, 3]]) {
      expect(evaluate(age, { ageUpperYears: boundary, ageUpperInclusive: false }).status).toBe('ready');
      for (const inclusive of [undefined, true]) {
        expect(evaluate(age, { ageUpperYears: boundary, ageUpperInclusive: inclusive })).toEqual(unavailable('ambiguous-age'));
      }
      expect(evaluate(age, { ageUpperYears: boundary + .000001, ageUpperInclusive: false }))
        .toEqual(unavailable('ambiguous-age'));
    }
    expect(evaluate(.9, { ageUpperYears: 1.1 })).toEqual(unavailable('ambiguous-age'));
    expect(evaluate(2, { ageUpperYears: 1 })).toEqual(unavailable('ambiguous-age'));
    for (const age of [null, NaN, Infinity, -1]) expect(evaluate(age)).toEqual(unavailable('missing-age'));
  });

  it('przelicza obsługiwane jednostki bez zmiany źródłowej mediany i nie nadaje werdyktu z odległości od niej', () => {
    for (const [value, unit] of [[.06934, 'nmol/L'], [2, 'ng/dL']]) {
      const result = evaluate(2, { measurement: { value, unit, operator: '=' } });
      expect(result.status).toBe('ready');
      expect(result.value).toBeCloseTo(.06934, 12);
      expect(result.referenceValue).toBe(.06934);
      for (const key of ['referenceInterval', 'sds', 'percentile', 'classification', 'clinicalCutoff', 'ratio']) {
        expect(result).not.toHaveProperty(key);
      }
    }
    const browser = loadBrowserScript('vilda_hormone_lifespan_reference.js');
    expect(browser.VildaHormoneLifespanReference.evaluate(runtime, context()))
      .toEqual(engine.evaluate(data, context()));
    // Broader TT lab units are normalized by the actual converter adapter;
    // they do not extend this existing graph-engine conversion contract.
    for (const unit of ['ng/mL', 'pg/mL', 'IU/L', 'ng', 'toString']) {
      expect(evaluate(2, { measurement: { value: .2, unit } })).toEqual(unavailable('unsupported-unit'));
    }
  });

  it('zachowuje znaną metodę i materiał, bez wybierania korzystniejszego źródła lub awaryjnej mediany', () => {
    for (const assayMethodId of [undefined, null, '', 'unknown', 'lc-ms/ms', 'lc-ms-ms', 'lcmsms',
      'kushnir2010-lcmsms-total-testosterone', ' LC-MS/MS ']) {
      expect(evaluate(2, { assayMethodId }).status).toBe('ready');
    }
    for (const assayMethodId of ['roche-elecsys', 'abbott-architect', 'mayo-ttst-lcmsms', 'fictional-assay']) {
      expect(evaluate(2, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
      expect(engine.evaluateResultOnly(runtime, context(2, { assayMethodId }))).toEqual(unavailable('incompatible-assay'));
    }
    for (const specimen of [undefined, null, '', 'unknown', 'serum', 'surowica', ' SERUM ']) {
      expect(evaluate(2, { specimen }).status).toBe('ready');
    }
    for (const specimen of ['plasma', 'plasma_li_heparin', 'saliva', 'urine']) {
      expect(evaluate(2, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    // No current G observation is required and none is inferred from age.
    for (const puberty of [null, { kind: 'G', stage: 1 }, { kind: 'G', stage: 2 }, { kind: 'P', stage: 1 }]) {
      expect(evaluate(2, { puberty }).status).toBe('ready');
    }
    expect(evaluate(2, { preterm: 'yes' }).status).toBe('ready');
    expect(evaluate(2, { sex: 'female' })).toEqual(unavailable('unsupported-age'));
    expect(evaluate(2, { sex: 'unknown' })).toEqual(unavailable('unsupported-sex'));
  });

  it('odrzuca cenzurowanie, błędne pomiary, znane przeciwwskazania i nakładające się profile', () => {
    for (const operator of ['<', '>', '<=', '>=', '≤', '≥', '<LOD']) {
      expect(evaluate(2, { measurement: { value: .2, unit: 'nmol/L', operator } })).toEqual(unavailable('censored-result'));
    }
    for (const value of [-1, Infinity, NaN, '0.2', null]) {
      expect(evaluate(2, { measurement: { value, unit: 'nmol/L' } })).toEqual(unavailable('invalid-value'));
    }
    expect(evaluate(2, { measurement: null })).toEqual(unavailable('invalid-value'));
    expect(evaluate(2, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    expect(engine.evaluate({ ...data, profiles: [...data.profiles, profile(1)] }, context()))
      .toEqual(unavailable('ambiguous-profile'));
    expect(engine.evaluateResultOnly(runtime, context())).toEqual(unavailable('reference-available'));
  });

  it('zachowuje niemowlęcą lukę, krzywą, skalę i wszystkie pozostałe porównania', () => {
    const before = JSON.stringify(runtime);
    const prior = { ...runtime, patientPointData: beforeTestosteroneBoysBundle(data) };
    const drawing = display.buildMaleTestosterone(runtime, engine);
    expect(digest(drawing)).toBe('9c95940b01b3dbd0b1657da891c1f8ca4ab03a40b12b7c587305012b37660282');
    expect(drawing).toEqual(display.buildMaleTestosterone(prior, engine));
    expect(drawing).toMatchObject({ divisor: 18.051151264084126, ceiling: 1.25 });
    for (const age of [213 / 365.25, 250 / 365.25]) {
      expect(evaluate(age)).toEqual(unavailable('reference-unavailable'));
    }
    for (const age of [300 / 365.25, .99, .999999]) expect(evaluate(age)).toEqual(unavailable('reference-unavailable'));
    expect(evaluate(212 / 365.25, { preterm: 'no' })).toMatchObject({ status: 'ready', referenceValue: .168563 });
    evaluate(1); evaluate(2.999999);
    expect(JSON.stringify(runtime)).toBe(before);
  });
});

// Run the converter's actual current-patient adapter and the actual TT lab
// engine. Only fictional form values and UI update callbacks are supplied.
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const adapterSource = html.slice(html.indexOf('    function currentPatientIdentity()'), html.indexOf('    // ID substancji,'));
function currentForm(years = 2, months = 0) {
  const updates = [];
  const ctx = {
    window: { VildaLabPuberty: ageEngine, VildaLabPubertyData: agePolicy, VildaLabTestosteroneData: labData },
    identity: 'fictional-child-testosterone', localOverrideIdentity: 'fictional-child-testosterone',
    lifespanVault: null, lifespanCurrentSex: null, testosteroneMeasurementContext: {},
    localOverride: { sex: null, age: null, tanner: null, cycle_phase: null },
    overrideSexEl: { value: '' }, overrideAgeEl: { value: '' }, overrideAgeMonthsEl: { value: '' },
    overrideCycleEl: { value: '' }, overrideTannerEl: { value: '' },
    valueEl: { value: '.2' }, unitEl: { value: 'nmol/L' }, currentSubstance: { id: 'testosterone_total' },
    sourcePatient: { identityKey: 'fictional-child-testosterone', sourceStatus: 'ready', sex: 'M', ageYears: years, ageMonths: months },
    lifespanUI: { update: value => updates.push(value), clear: () => updates.push(null) },
    amhAgeReferenceUI: null, showError: () => {}, isPubertyReferenceSubstance: () => true,
  };
  ctx.sessionStorage = { getItem: () => ctx.identity };
  ctx.readPubertyPatientContext = () => ctx.sourcePatient;
  vm.createContext(ctx);
  vm.runInContext(adapterSource, ctx);
  return { ctx, last: () => updates.at(-1), calculate(extra = {}, raw = '.2') {
    ctx.unitEl.value = extra.unit || 'nmol/L';
    const evaluation = labEngine.evaluate({ analyte: 'testosterone_total', sex: ctx.sourcePatient.sex,
      age: { years: ctx.sourcePatient.ageYears, months: ctx.sourcePatient.ageMonths,
        precision: ctx.sourcePatient.ageMonths == null ? 'year' : 'month' },
      contextBasis: 'current-patient', value: raw, unit: 'nmol/L', ...extra }, labData);
    ctx.updateLifespan({ id: 'testosterone_total' }, evaluation);
    return { evaluation, context: updates.at(-1), result: engine.evaluate(data, updates.at(-1)) };
  } };
}

describe('Testosteron 1–<3 — rzeczywisty adapter i niezależne normy laboratoryjne', () => {
  it('wykorzystuje istniejący wiek i wynik bez stadium ani nowego formularza, zachowując oceny Mayo', () => {
    for (const [years, months, id] of [[1, 0, ids[0]], [1, 11, ids[0]], [2, 0, ids[1]], [2, 11, ids[1]]]) {
      const form = currentForm(years, months);
      const { evaluation, context: passed, result } = form.calculate();
      const before = JSON.stringify(evaluation);
      expect(passed).toMatchObject({ analyte: 'testosterone_total', sex: 'male', ageYears: years + months / 12,
        ageUpperInclusive: false, puberty: null, specimen: 'unknown', assayMethodId: null,
        measurement: { value: .2, unit: 'nmol/L', operator: '=' } });
      expect(result).toMatchObject({ status: 'ready', value: .2, profile: { id } });
      expect(evaluation.referencePreview.byAge).toMatchObject({ status: 'indeterminate',
        range: { bounds: { lower: null, upper: { value: .6934 } } } });
      expect(evaluation.biochemical.status).toBe('unavailable');
      expect(JSON.stringify(evaluation)).toBe(before);
    }
    const high = currentForm().calculate({}, '1');
    expect(high.result).toMatchObject({ status: 'ready', value: 1, referenceValue: .06934 });
    expect(high.evaluation.referencePreview.byAge.status).toBe('above');
    for (const [raw, unit] of [['.02', 'ng/mL'], ['20', 'pg/mL']]) {
      const converted = currentForm().calculate({ unit }, raw);
      expect(converted.context.measurement).toMatchObject({ value: .06934, unit: 'nmol/L', operator: '=' });
      expect(converted.result).toMatchObject({ status: 'ready', value: .06934, referenceValue: .06934 });
    }
    expect(currentForm().calculate({}, '<.2').result).toEqual(unavailable('censored-result'));
  });

  it('przenosi znane leczenie, GnRHa, stymulację, materiał i jawną metodę bez obchodzenia ograniczeń', () => {
    for (const extra of [{ treatment: { context: 'hormonal' } }, { treatment: { gnrha: 'yes' } },
      { treatment: { sexSteroids: 'yes' } }, { measurementKind: 'stimulated' }, { specimen: 'plasma' }]) {
      expect(currentForm().calculate(extra).result, JSON.stringify(extra)).toEqual(unavailable('contraindicated'));
    }
    const gnrha = currentForm();
    gnrha.ctx.sourcePatient.gnrhaStatus = 'w-trakcie';
    expect(gnrha.calculate().result).toEqual(unavailable('contraindicated'));
    const incompatible = currentForm().calculate({ assay: { methodId: 'roche-elecsys', confirmation: 'reported' } });
    expect(incompatible.context.assayMethodId).toBe('roche-elecsys');
    expect(incompatible.result).toEqual(unavailable('incompatible-assay'));
    const configured = currentForm().calculate({ assay: { methodId: 'roche-elecsys', confirmation: 'configured' } });
    expect(configured.context.assayMethodId).toBeNull();
    expect(configured.result.status).toBe('ready');
  });

  it('nie przenosi wyniku do nowego pacjenta, oczekującego źródła ani zablokowanej karty', () => {
    const form = currentForm();
    expect(form.calculate().result.status).toBe('ready');
    form.ctx.identity = 'fictional-other-child';
    form.ctx.sourcePatient.identityKey = form.ctx.identity;
    const switched = form.calculate();
    expect(form.ctx.valueEl.value).toBe('');
    expect(switched.context.measurement).toBeNull();
    expect(switched.result.status).toBe('unavailable');
    form.ctx.sourcePatient.sourceStatus = 'loading';
    expect(form.calculate().context).toMatchObject({ ageYears: null, measurement: null, sourceStatus: 'loading' });
    form.ctx.sourcePatient.sourceStatus = 'ready';
    form.ctx.window.VildaVault = { isUnlocked: () => false };
    expect(form.calculate().context).toMatchObject({ ageYears: null, measurement: null, sourceStatus: 'unavailable' });
  });
});
