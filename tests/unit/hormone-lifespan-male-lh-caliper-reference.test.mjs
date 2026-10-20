import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const display = require('../../vilda_hormone_lifespan_display.js');
const ageEngine = require('../../vilda_lab_puberty.js');
const agePolicy = require('../../vilda_lab_puberty_data.js');
const data = runtime.patientPointData;
const read = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const source = read('evidence/patient-point/wilson2023-caliper-male-lh-lms.json');
const policy = read('male-lh-caliper-reference-policy.json');
const id = 'wilson2023-male-lh-age-over16-under18';
const method = 'abbott-architect-ci2000-lh';
const profile = () => data.profiles.find(item => item.id === id);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const evaluate = (ageYears = 17, extra = {}) => engine.evaluate(data, {
  analyte: 'lh', sex: 'male', ageYears, measurement: { value: 2, unit: 'IU/L' }, ...extra
});
const unavailable = reason => ({ status: 'unavailable', reason });

// Independent source-audit controls from LH_M, Supplementary Table 3. These
// are normalized qBCCG(.5), then exp(q)/1e6 under the pinned coauthor's
// convention. The original Wilson LH preprocessing was not recovered.
const controls = [[10, .12151028791646062], [16, 2.1850115693016887],
  [17, 2.603196549069626], [18, 3.053091212441528]];

// Run the real main-form laboratory evaluation, shared age resolver and
// converter adapter. Only storage/UI surfaces are fictional. In particular,
// no test fixture invents an exact birthday from completed months or years.
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const adapterSource = html.slice(html.indexOf('    function currentPatientIdentity()'),
  html.indexOf('    // ID substancji,'));
function currentForm(years = 17, months = 0) {
  const updates = [];
  const context = {
    window: { VildaLabPuberty: ageEngine, VildaLabPubertyData: agePolicy },
    identity: 'fictional-caliper-lh-boy', localOverrideIdentity: 'fictional-caliper-lh-boy',
    lifespanVault: null, lifespanCurrentSex: null, testosteroneMeasurementContext: {},
    localOverride: { sex: null, age: null, tanner: null, cycle_phase: null },
    overrideSexEl: { value: '' }, overrideAgeEl: { value: '' }, overrideAgeMonthsEl: { value: '' },
    overrideCycleEl: { value: '' }, overrideTannerEl: { value: '' },
    valueEl: { value: '2' }, unitEl: { value: 'IU/L' }, currentSubstance: { id: 'lh' },
    sourcePatient: { identityKey: 'fictional-caliper-lh-boy', sourceStatus: 'ready',
      sex: 'M', ageYears: years, ageMonths: months },
    effectivePatient: { sex: 'M', age: years + (months || 0) / 12 },
    lifespanUI: { update: value => updates.push(value), clear: () => updates.push(null) },
    amhAgeReferenceUI: null, showError: () => {}, isPubertyReferenceSubstance: substance => substance.id === 'lh',
  };
  context.sessionStorage = { getItem: () => context.identity };
  context.readPubertyPatientContext = () => context.sourcePatient;
  context.getEffectivePatient = () => context.effectivePatient;
  vm.createContext(context);
  vm.runInContext(adapterSource, context);
  return { context, last: () => updates.at(-1),
    calculate(extra = {}, raw = '2', unit = 'IU/L') {
      const input = { analyte: 'lh', sex: context.sourcePatient.sex,
        age: { years: context.sourcePatient.ageYears, months: context.sourcePatient.ageMonths,
          precision: context.sourcePatient.ageMonths == null ? 'year' : 'month' },
        contextBasis: 'current-patient', value: raw, unit, ...extra };
      const result = ageEngine.evaluate(input, agePolicy);
      context.unitEl.value = unit;
      context.updateLifespan({ id: 'lh' }, result);
      return result;
    },
    reference: () => engine.evaluate(data, updates.at(-1)) };
}

describe('LH CALIPER chłopców — jawna rekonstrukcja mediany wyłącznie w (16,18)', () => {
  it('dodaje jeden profil i zachowuje wszystkie 81 wcześniejszych profili, konwersje i pozostały runtime', () => {
    expect(data.version).toBe('2026-10-18.3');
    expect(data.profiles).toHaveLength(82);
    expect(data).toEqual(read('population-reference-data.json'));
    expect(runtime.maleLhCaliperReferencePolicy).toEqual(policy);
    expect(policy).toMatchObject({ kind: 'educational-source-selection', ordinaryOnly: true });
    const unchanged = data.profiles.filter(item => item.id !== id);
    // Frozen actual audyt 839673492a7b: this protects every earlier boundary,
    // assay/specimen gate, source statistic and provenance, not just counts.
    expect(unchanged).toHaveLength(81);
    expect(digest(unchanged)).toBe('194070b81366fa151b680cfc6d030447fccd6b265b29f791091d4f494f62b793');
    expect(digest({ ...data, version: '2026-10-18.2', profiles: unchanged }))
      .toBe('bafc55a49915a9ccde61c600b05096716b2857111cf39662136820bbf545f16c');
    const otherRuntime = Object.fromEntries(Object.entries(runtime).filter(([key]) =>
      key !== 'patientPointData' && key !== 'maleLhCaliperReferencePolicy' && key !== 'resultOnlyPolicies'));
    expect(digest(otherRuntime)).toBe('678c2b572e10fee5358c5f1d5c5d234a89dd4175a12d0e93c1d020216e750827');
  });

  it('zachowuje pełne 91 węzłów LH_M, jednostkę i dowody rekonstrukcji zamiast deklaracji odzyskanego modelu', () => {
    expect(source).toMatchObject({ sex: 'male', analyte: 'lh', unit: 'IU/L',
      status: 'qualified_reconstruction_for_educational_age_reference_not_laboratory_ri',
      statistic: 'reconstructed-normalized-bccg-model-median',
      source: { doi: '10.1515/cclm-2022-1077',
        sourceSha256: '997f4998e14dd38fb73a0ac9f14f01bbe5e1f40f3100bc4e2714e4764bfeda9b' },
      model: { family: 'GAMLSS BCCG', authorConvention: {
        commit: '288329c43ee238b3c8921097dfeac411d30465b9' } },
      assay: { specimen: 'serum', lowerLimitOfQuantification: .09, limitOfDetection: null } });
    expect(Object.keys(source.series)).toEqual(['male']);
    expect(source.model.responseScale).toContain('not recovered or directly confirmed');
    expect(source.model.authorConvention.limitation).toContain('not the January 2023 Wilson LH');
    expect(profile()).toMatchObject({ id, analyte: 'lh', sex: 'male', minAge: 16, minAgeExclusive: true,
      maxAge: 18, maxAgeExclusive: true, ordinaryOnly: true, statistic: 'median', unit: 'IU/L',
      interpolation: 'pchip', approximate: true, specimen: 'serum', compatibleSpecimenIds: ['serum', 'surowica'],
      compatibleAssayMethodIds: [method], provenance: { doi: '10.1515/cclm-2022-1077',
        sourceWorksheet: 'LH_M', sourceSha256: source.source.sourceSha256 } });
    expect(profile().points).toHaveLength(91);
    expect(profile().points).toEqual(source.series.male.points
      .map(row => ({ ageYears: row.ageYears, value: row.centralConcentration })));
    expect(profile().points[0].ageYears).toBe(10);
    expect(profile().points.at(-1).ageYears).toBe(19);
    expect(profile().provenance.sourceCells).toEqual(source.series.male.points.map(row => row.sourceCells));
    expect(profile().provenance.sourceModel).toEqual(source.model);
    expect(profile().provenance.sourceRouting).toMatchObject({ version: policy.version,
      minAge: 16, minAgeExclusive: true, maxAge: 18, maxAgeExclusive: true });
  });

  it('odtwarza niezależne kontrole qBCCG i nie używa M, exp(M) ani wartości ryciny jako danych', () => {
    const fullSource = { ...profile(), minAge: 10, minAgeExclusive: false, maxAge: 19, maxAgeExclusive: false };
    for (const [age, median] of controls) expect(engine.referenceAt(fullSource, age)).toBeCloseTo(median, 12);
    for (const row of source.series.male.points) {
      expect(engine.referenceAt(fullSource, row.ageYears)).toBe(row.centralConcentration);
      if (row.ageYears > 16 && row.ageYears < 18) {
        expect(evaluate(row.ageYears)).toMatchObject({ status: 'ready', referenceValue: row.centralConcentration,
          profile: { id } });
      }
    }
    expect(source.series.male.points[0]).toMatchObject({ M: 11.6983016214429,
      modelResponseMedian: 11.707754212387634 });
    expect(engine.referenceAt(fullSource, 10)).not.toBeCloseTo(.12036711236665708, 6);
    expect(evaluate(17).referenceValue).toBeCloseTo(2.603196549069626, 12);
    expect(evaluate(17).referenceValue).not.toBeCloseTo(14.7722506897965, 6);
    expect(evaluate(17).referenceValue).not.toBeCloseTo(2.60329867315535, 6);
  });

  it('interpoluje 16,001 i 17 lat 11 miesięcy wewnątrz siatki, bez ekstrapolacji i dobierania według wyniku', () => {
    for (const age of [16.001, 16 + 1 / 12, 16.85, 17, 17 + 11 / 12, 17.999999]) {
      const result = evaluate(age);
      expect(result).toMatchObject({ status: 'ready', profile: { id } });
      const left = profile().points.findLast(row => row.ageYears <= age);
      const right = profile().points.find(row => row.ageYears >= age);
      expect(result.referenceValue).toBeGreaterThanOrEqual(left.value);
      expect(result.referenceValue).toBeLessThanOrEqual(right.value);
      for (const value of [0, .001, 1000]) {
        expect(evaluate(age, { measurement: { value, unit: 'IU/L' } }).referenceValue).toBe(result.referenceValue);
      }
    }
    for (const age of [10, 15.999999, 16, 18, 18.001, 19]) expect(engine.referenceAt(profile(), age)).toBeNull();
  });

  it('zachowuje Madsen przy dokładnym 16, dorosłych od 18 i niewyjaśnioną lukę LH u dziewcząt', () => {
    expect(evaluate(16)).toMatchObject({ status: 'ready', referenceValue: 3.5142066372549756,
      profile: { id: 'madsen2022-male-lh' } });
    expect(evaluate(16.001).profile.id).toBe(id);
    expect(evaluate(17.999999).profile.id).toBe(id);
    expect(evaluate(18)).toMatchObject({ status: 'ready', referenceValue: 3,
      profile: { id: 'laurentino2020-male-lh-18-under25', statistic: 'group-mean' } });
    for (const age of [16.001, 17, 17 + 11 / 12, 17.999999]) {
      expect(evaluate(age, { sex: 'female' })).toEqual(unavailable('unsupported-age'));
    }
  });

  it('nie zwęża niepewnego wieku przy otwartej granicy 16 ani przy przejściu do dorosłych', () => {
    expect(evaluate(16, { ageUpperYears: 16 + 1 / 12, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
    expect(evaluate(16, { ageUpperYears: 17, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
    expect(evaluate(15.999, { ageUpperYears: 16.001, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
    expect(evaluate(17, { ageUpperYears: 18, ageUpperInclusive: false })).toMatchObject({ status: 'ready', profile: { id } });
    for (const ageUpperYears of [18, 18.001, 16.999]) {
      expect(evaluate(17, { ageUpperYears, ageUpperInclusive: true })).toEqual(unavailable('ambiguous-age'));
    }
    expect(evaluate(17.999, { ageUpperYears: 18.001, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
  });

  it('zachowuje 1:1 IU/L i mIU/mL oraz dotychczasowe odrzucanie mIU/L bez nowej konwersji', () => {
    const browser = {};
    loadBrowserScript('lab_units_data.js', browser);
    loadBrowserScript('lab_unit_converter.js', browser);
    for (const unit of ['IU/L', 'mIU/mL']) {
      for (const value of [0, .001, 2, 1000]) {
        const result = browser.LabUnitConverter.convertAll({ substanceId: 'lh', value, fromUnit: unit });
        expect(result).toMatchObject({ ok: true, siValue: value, siUnit: 'IU/L' });
        expect(evaluate(17, { measurement: { value, unit } })).toMatchObject({ status: 'ready', value,
          referenceValue: 2.603196549069626, profile: { id } });
      }
    }
    expect(browser.LabUnitConverter.convertAll({ substanceId: 'lh', value: 2000, fromUnit: 'mIU/L' }).ok).toBe(false);
    expect(ageEngine.parseMeasurement('2000', 'mIU/L').status).toBe('invalid');
    expect(evaluate(17, { measurement: { value: 2000, unit: 'mIU/L' } })).toEqual(unavailable('unsupported-unit'));
  });

  it('nie zamienia cenzury, pustego wyniku ani LLOQ w dokładny punkt; zachowuje zero i przepełnienie osi', () => {
    for (const operator of ['<', '>', '<=', '>=', '≤', '≥', '~']) {
      expect(evaluate(17, { measurement: { value: .09, unit: 'IU/L', operator } }))
        .toEqual(unavailable('censored-result'));
    }
    for (const measurement of [null, { value: -1, unit: 'IU/L' }, { value: NaN, unit: 'IU/L' },
      { value: Infinity, unit: 'IU/L' }]) {
      expect(evaluate(17, { measurement })).toEqual(unavailable('invalid-value'));
    }
    const app = currentForm();
    for (const [raw, expected] of [['0', 0], ['0,001', .001], ['1000', 1000]]) {
      app.calculate({}, raw);
      expect(app.reference()).toMatchObject({ status: 'ready', value: expected, profile: { id } });
    }
    for (const raw of ['', '<LOD', '<LOQ', 'NaN', '-2']) {
      app.calculate({}, raw);
      expect(app.last().measurement).toBeNull();
      expect(app.reference()).toEqual(unavailable('invalid-value'));
    }
    app.calculate({}, '<0,09');
    expect(app.reference()).toEqual(unavailable('censored-result'));
  });

  it('nie stosuje ukrytego fallbacku przy znanej niezgodności metody lub materiału', () => {
    for (const assayMethodId of [undefined, null, '', 'unknown', method]) {
      expect(evaluate(17, { assayMethodId }).status).toBe('ready');
    }
    for (const assayMethodId of ['abbott-architect-i1000', 'abbott-architect-ci2000',
      'abbott-architect-ci2000-fsh', 'immulite-2000-xpi', 'roche-elecsys-lh', 'unmatched']) {
      expect(evaluate(17, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
    for (const specimen of [undefined, null, '', 'unknown', 'serum', 'surowica']) {
      expect(evaluate(17, { specimen }).status).toBe('ready');
    }
    for (const specimen of ['plasma', 'edta-plasma', 'saliva']) {
      expect(evaluate(17, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
    for (const age of [16, 18]) expect(evaluate(age, { assayMethodId: method })).toEqual(unavailable('incompatible-assay'));
  });

  it('nie wymaga nowych danych pokwitaniowych i nie tworzy RI, SDS ani klasyfikacji', () => {
    const baseline = evaluate(17);
    for (const puberty of [undefined, null, {}, { kind: 'G', stage: 1 }, { kind: 'G', stage: 5 }]) {
      for (const preterm of [undefined, 'unknown', 'yes', 'no']) {
        expect(evaluate(17, { puberty, preterm }).referenceValue).toBe(baseline.referenceValue);
      }
    }
    expect(profile()).not.toHaveProperty('requiredGonadalStage');
    for (const key of ['referenceInterval', 'sds', 'percentile', 'classification', 'clinicalCutoff', 'tannerStage']) {
      expect(baseline).not.toHaveProperty(key);
      expect(profile()).not.toHaveProperty(key);
    }
    expect(evaluate(null)).toEqual(unavailable('missing-age'));
    expect(evaluate(17, { sex: 'unknown' })).toEqual(unavailable('unsupported-sex'));
  });

  it('zachowuje geometrię i skale zwykłego LH, żeńskie krzywe oraz oba porównania LH/FSH', () => {
    const before = JSON.stringify(runtime);
    expect(digest(display.buildMaleLh(runtime, engine)))
      .toBe('068ef61e3c6105cca32955f11c9fc4e66d2c808e25a060b99a21e80816fd7a35');
    expect(digest(display.buildFemaleGonadotropins(runtime)))
      .toBe('359c0a3658cb20f394c91a4b0b530243db6de9d545edf3954023a80e5fe7e4a8');
    const prior = Object.fromEntries(Object.entries(runtime).filter(([key]) => key !== 'maleLhCaliperReferencePolicy'));
    prior.patientPointData = { ...data, version: '2026-10-18.2',
      profiles: data.profiles.filter(item => item.id !== id) };
    for (const period of ['mini', 'puberty']) {
      for (const analyte of ['lh', 'fsh']) {
        const comparison = display.buildGonadotropinComparison(runtime, engine, period, analyte);
        const previous = display.buildGonadotropinComparison(prior, engine, period, analyte);
        for (const key of ['curves', 'scale', 'domain', 'profileIds', 'policyVersion']) {
          expect(comparison[key]).toEqual(previous[key]);
        }
        expect(comparison.referenceData.patientPointData.profiles)
          .toEqual(previous.referenceData.patientPointData.profiles);
        expect(comparison.referenceData.patientPointData.profiles.map(item => item.id)).not.toContain(id);
        expect(engine.evaluate(comparison.referenceData, { analyte, sex: 'male', ageYears: 17,
          measurement: { value: 2, unit: 'IU/L' } })).toEqual(unavailable('unsupported-age'));
      }
    }
    evaluate(16.001); evaluate(17.99999);
    expect(JSON.stringify(runtime)).toBe(before);
  });

  it('rzeczywisty adapter używa 16 lat 1 miesiąca i 17 lat 11 miesięcy oraz zachowuje niejednoznaczne 16 lat 0 miesięcy', () => {
    for (const [years, months] of [[16, 1], [17, 0], [17, 11]]) {
      const app = currentForm(years, months);
      const lab = app.calculate({}, '2,125', 'mIU/mL');
      const frozen = structuredClone(lab);
      expect(app.last()).toMatchObject({ analyte: 'lh', sex: 'male', ageYears: years + months / 12,
        ageUpperInclusive: false, measurement: { value: 2.125, unit: 'IU/L', operator: '=' },
        displayUnit: 'mIU/mL', assayMethodId: null, specimen: 'unknown' });
      expect(app.reference()).toMatchObject({ status: 'ready', profile: { id } });
      expect(lab).toEqual(frozen); // Educational comparison never edits lab axes/history input.
    }
    for (const months of [0, null]) {
      const app = currentForm(16, months);
      app.calculate();
      expect(app.last()).toMatchObject({ ageYears: 16, ageUpperInclusive: false });
      expect(app.last().ageUpperYears).toBe(months == null ? 17 : 16 + 1 / 12);
      expect(app.reference()).toEqual(unavailable('ambiguous-age'));
    }
    const adult = currentForm(18, 0);
    adult.calculate();
    expect(adult.reference()).toMatchObject({ status: 'ready', referenceValue: 3,
      profile: { id: 'laurentino2020-male-lh-18-under25' } });
  });

  it('adapter zachowuje znane GnRHa, leczenie, stymulację i wyłącznie zgłoszoną metodę próbki', () => {
    const app = currentForm();
    app.calculate();
    expect(app.reference().status).toBe('ready');
    for (const extra of [{ treatment: { gnrha: 'yes' } }, { treatment: { sexSteroids: 'yes' } },
      { treatment: { context: 'hormonal' } }, { measurementKind: 'stimulated' }, { specimen: 'plasma' }]) {
      app.calculate(extra);
      expect(app.reference()).toEqual(unavailable('contraindicated'));
    }
    app.context.sourcePatient.gnrhaStatus = 'w-trakcie';
    app.calculate();
    expect(app.reference()).toEqual(unavailable('contraindicated'));
    app.context.sourcePatient.gnrhaStatus = 'unknown';
    const legacy = app.calculate();
    // The canonical LH input uses measurementKind. Preserve the existing
    // adapter guard as well if a legacy caller explicitly supplies protocol.
    legacy.input.test_protocol = 'stimulated';
    app.context.updateLifespan({ id: 'lh' }, legacy);
    expect(app.reference()).toEqual(unavailable('contraindicated'));
    for (const confirmation of ['unknown', 'configured']) {
      app.calculate({ assay: { methodId: 'incompatible-fictional-method', confirmation } });
      expect(app.last().assayMethodId).toBeNull();
      expect(app.reference().status).toBe('ready');
    }
    app.calculate({ assay: { methodId: 'incompatible-fictional-method', confirmation: 'reported' } });
    expect(app.reference()).toEqual(unavailable('incompatible-assay'));
    app.calculate({ assay: { methodId: method, confirmation: 'reported' }, specimen: 'serum' });
    expect(app.reference().status).toBe('ready');
  });

  it('adapter usuwa wynik poprzedniej osoby i nie przywraca go z opóźnionej oceny lub zablokowanej karty', () => {
    const app = currentForm();
    const previousEvaluation = app.calculate();
    expect(app.reference().status).toBe('ready');
    app.context.identity = 'fictional-next-caliper-lh-girl';
    app.context.sourcePatient.identityKey = app.context.identity;
    app.context.sourcePatient.sex = 'F';
    app.context.effectivePatient.sex = 'F';
    app.context.updateLifespan({ id: 'lh' }, previousEvaluation);
    expect(app.context.valueEl.value).toBe('');
    expect(app.last()).toMatchObject({ sex: null, ageYears: null, measurement: null });
    app.calculate();
    expect(app.reference()).toEqual(unavailable('unsupported-age'));
    app.context.window.VildaVault = { isUnlocked: () => false };
    app.calculate();
    expect(app.last()).toMatchObject({ sourceStatus: 'unavailable', ageYears: null, measurement: null });
    expect(app.reference()).toEqual(unavailable('missing-age'));
  });
});
