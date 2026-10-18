import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const runtime = require('../../vilda_hormone_lifespan_data.js');
const engine = require('../../vilda_hormone_lifespan_reference.js');
const display = require('../../vilda_hormone_lifespan_display.js');
const ageEngine = require('../../vilda_lab_puberty.js');
const agePolicy = require('../../vilda_lab_puberty_data.js');
const data = runtime.patientPointData;
const read = name => JSON.parse(readFileSync(new URL(
  `../../docs/clinical/hormone-lifespan/${name}`, import.meta.url), 'utf8'));
const policy = read('male-amh-young-adult-reference-policy.json');
const source = read('evidence/patient-point/woloszynek2015-male-amh-group-median.json');
const id = 'woloszynek2015-male-amh-age-18-20';
const method = 'beckman-coulter-gen-ii-original-elisa-amh';
const profile = () => data.profiles.find(item => item.id === id);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const evaluate = (ageYears = 18, extra = {}) => engine.evaluate(data, {
  analyte: 'amh', sex: 'male', ageYears, measurement: { value: 4, unit: 'ng/mL' }, ...extra
});
const unavailable = reason => ({ status: 'unavailable', reason });

// Table 2, Woloszynek 2015: median 6.3 ng/mL, N=63, full source group
// 18–30 years. The literal canonical value below is independently converted
// using the existing AMH unit convention; it is not taken from runtime data,
// the educational line, a reference-interval midpoint or a new 18–<20 cohort.
const canonicalMedian = 44.96788008565311;

// Execute the actual converter adapter and shared age resolver. This fixture
// supplies only fictional current-form context; it does not reimplement the
// source selector, unit converter, contraindication or identity rules.
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const adapterSource = html.slice(html.indexOf('    function currentPatientIdentity()'),
  html.indexOf('    // ID substancji,'));
function currentForm(years = 18, months = 0) {
  const updates = [];
  const context = {
    window: { VildaLabPuberty: ageEngine, VildaLabPubertyData: agePolicy },
    identity: 'fictional-young-adult-amh', localOverrideIdentity: 'fictional-young-adult-amh',
    lifespanVault: null, lifespanCurrentSex: null, testosteroneMeasurementContext: {},
    localOverride: { sex: null, age: null, tanner: null, cycle_phase: null },
    overrideSexEl: { value: '' }, overrideAgeEl: { value: '' }, overrideAgeMonthsEl: { value: '' },
    overrideCycleEl: { value: '' }, overrideTannerEl: { value: '' },
    valueEl: { value: '4' }, unitEl: { value: 'ng/mL' }, currentSubstance: { id: 'amh' },
    sourcePatient: { identityKey: 'fictional-young-adult-amh', sourceStatus: 'ready',
      sex: 'M', ageYears: years, ageMonths: months },
    effectivePatient: { sex: 'M', age: years + months / 12 },
    lifespanUI: { update: value => updates.push(value), clear: () => updates.push(null) },
    amhAgeReferenceUI: null, showError: () => {}, isPubertyReferenceSubstance: () => false,
  };
  context.sessionStorage = { getItem: () => context.identity };
  context.readPubertyPatientContext = () => context.sourcePatient;
  context.getEffectivePatient = () => context.effectivePatient;
  vm.createContext(context);
  vm.runInContext(adapterSource, context);
  return { context, last: () => updates.at(-1),
    calculate: (evaluation = null) => context.updateLifespan({ id: 'amh' }, evaluation,
      { ok: true, siValue: 4, siUnit: 'ng/mL' }),
    reference: () => engine.evaluate(data, updates.at(-1)) };
}

describe('Męskie AMH 18–<20 — mediana całej grupy Woloszynek 18–30', () => {
  it('dodaje tylko jeden profil, zachowując wszystkie 80 wcześniejszych profili i pozostały runtime', () => {
    expect(data.version).toBe('2026-10-18.2');
    expect(data.profiles).toHaveLength(81);
    expect(data).toEqual(read('population-reference-data.json'));
    expect(runtime.maleAmhYoungAdultReferencePolicy).toEqual(policy);
    expect(policy).toMatchObject({ id, kind: 'educational-source-selection', ordinaryOnly: true,
      minAge: 18, maxAge: 20, maxAgeExclusive: true });
    const unchanged = data.profiles.filter(item => item.id !== id);
    expect(unchanged).toHaveLength(80);
    // Frozen patientPointData on audyt d2bd5ed6: the new source must not alter
    // an existing number, boundary, specimen, assay gate or source provenance.
    expect(digest(unchanged)).toBe('eb8052ce82ca1bcab28dcb4ca318bf701386eb8dd56a0ae93da44c4df2dc70ac');
    expect(digest({ ...data, version: '2026-10-18.1', profiles: unchanged }))
      .toBe('bd130ff8eeeb9c046d1e3ef5a62d11c660f98ec0bfb2cd4ffb5a85516fa91a27');
    const otherRuntime = Object.fromEntries(Object.entries(runtime).filter(([key]) =>
      key !== 'patientPointData' && key !== 'maleAmhYoungAdultReferencePolicy'));
    expect(digest(otherRuntime)).toBe('d72999891daaa5e32b2ddf521aa29c30b400e400b037bd822096d76bcf2e37d7');
  });

  it('zachowuje pełną grupę 18–30, N=63 i natywną medianę 6,3 ng/mL z tabeli 2', () => {
    expect(source.source.doi).toBe('10.1177/0004563214554462');
    expect(source.groups).toContainEqual(expect.objectContaining({ minAge: 18, maxAge: 30, n: 63, median: 6.3 }));
    expect(profile()).toMatchObject({ id, analyte: 'amh', sex: 'male', minAge: 18, maxAge: 20,
      maxAgeExclusive: true, ordinaryOnly: true, statistic: 'group-median',
      unit: 'pmol/L', interpolation: 'constant', approximate: false, specimen: 'serum',
      compatibleSpecimenIds: ['serum', 'surowica'], compatibleAssayMethodIds: [method],
      ageGroup: { label: '18–30 lat', minAge: 18, maxAge: 30, n: 63,
        sourceMedian: 6.3, sourceUnit: 'ng/mL' },
      provenance: { doi: '10.1177/0004563214554462', table: 2,
        participants: 104, groupParticipants: 63 } });
    expect(profile().provenance.sourceToCanonicalFactor).toBeCloseTo(7.137758743754461, 12);
    for (const key of ['classification', 'percentile', 'sds', 'referenceInterval', 'clinicalCutoff', 'minimumPatientValue']) {
      expect(evaluate()).not.toHaveProperty(key);
      expect(profile()).not.toHaveProperty(key);
    }
  });

  it('pokazuje tę samą medianę całej grupy w luce, bez interpolowania między publikacjami', () => {
    for (const age of [18, 18 + 1 / 12, 18.5, 19, 19 + 11 / 12, 20 - 1e-7]) {
      const result = evaluate(age);
      expect(result).toMatchObject({ status: 'ready', profile: { id } });
      expect(result.referenceValue).toBeCloseTo(canonicalMedian, 12);
      expect(result.referenceValue * .1401).toBeCloseTo(6.3, 12);
    }
    expect(engine.sampleProfile(profile(), 13).every(point => Math.abs(point.value - canonicalMedian) < 1e-12)).toBe(true);
    expect(engine.referenceAt(profile(), 18 - 1e-7)).toBeNull();
    expect(engine.referenceAt(profile(), 20)).toBeNull();
    expect(engine.referenceAt(profile(), 25)).toBeNull();
  });

  it('przełącza dokładnie przy 18 i 20, zachowując Jopling, Benderradji, Tehrani i żeńskie FDA', () => {
    expect(evaluate(17.999999)).toMatchObject({ status: 'ready', referenceValue: 55.61,
      profile: { id: 'jopling2018-male-amh-age-15-under18' } });
    expect(evaluate(18)).toMatchObject({ status: 'ready', profile: { id } });
    for (const age of [20, 20.001, 25, 29.999]) {
      expect(evaluate(age)).toMatchObject({ status: 'ready', referenceValue: 43.8,
        profile: { id: 'benderradji2022-male-amh-age-20-under30' } });
    }
    expect(evaluate(30).profile.id).toBe('tehrani2017-male-amh');
    for (const age of [18, 19.999, 20]) {
      expect(evaluate(age, { sex: 'female' })).toMatchObject({ status: 'ready', referenceValue: 25.7,
        profile: { id: 'fda2017-female-amh-age-18-under26' } });
    }
    for (const age of [0, 6 / 365.25, 70.001, 90]) expect(evaluate(age)).toEqual(unavailable('unsupported-age'));
  });

  it('wymaga zmieszczenia całego możliwego wieku w jednej domenie, także na granicach formularza', () => {
    for (const [years, months] of [[18, 0], [18, 11], [19, 0], [19, 11]]) {
      const age = ageEngine.resolveAge({ age: { years, months, precision: 'month' } });
      expect(age.status).toBe('known');
      expect(evaluate(age.lowerYears, { ageUpperYears: age.upperYears,
        ageUpperInclusive: age.upperInclusive })).toMatchObject({ status: 'ready', profile: { id } });
    }
    expect(evaluate(18, { ageUpperYears: 20, ageUpperInclusive: false }).status).toBe('ready');
    for (const extra of [{ ageUpperYears: 20 }, { ageUpperYears: 20, ageUpperInclusive: true },
      { ageUpperYears: 20.001, ageUpperInclusive: false }, { ageUpperYears: 17.999 }]) {
      expect(evaluate(18, extra)).toEqual(unavailable('ambiguous-age'));
    }
    expect(evaluate(17 + 11 / 12, { ageUpperYears: 18, ageUpperInclusive: false }).profile.id)
      .toBe('jopling2018-male-amh-age-15-under18');
    expect(evaluate(17 + 11 / 12, { ageUpperYears: 18, ageUpperInclusive: true }))
      .toEqual(unavailable('ambiguous-age'));
    expect(evaluate(17.999, { ageUpperYears: 18.001, ageUpperInclusive: false }))
      .toEqual(unavailable('ambiguous-age'));
  });

  it('zachowuje jednostki i rzeczywisty wynik od zera po wartości ponad osią, niezależnie od doboru mediany', () => {
    for (const value of [0, .0001, 4, 6.3, 1e12]) {
      for (const unit of ['ng/mL', 'μg/L', 'ug/L']) {
        const result = evaluate(19, { measurement: { value, unit } });
        expect(result).toMatchObject({ status: 'ready', profile: { id } });
        expect(result.value * .1401).toBeCloseTo(value, value < 1e6 ? 10 : 0);
        expect(result.referenceValue).toBeCloseTo(canonicalMedian, 12);
      }
      const molar = evaluate(19, { measurement: { value, unit: 'pmol/L' } });
      expect(molar.value).toBe(value);
      expect(molar.referenceValue).toBeCloseTo(canonicalMedian, 12);
    }
    expect(evaluate(19, { measurement: { value: 6.3, unit: 'ng/mL' } }).value)
      .toBeCloseTo(canonicalMedian, 12);
  });

  it('dopuszcza tylko jawnie zgodny protokół Gen II, bez zastępowania źródła przy niezgodności metody', () => {
    expect(evaluate(19, { assayMethodId: method }).status).toBe('ready');
    for (const assayMethodId of ['mindray-cl-6000i', 'roche-elecsys', 'roche-elecsys-amh',
      'access-amh', 'access-2', 'beckman-access-2', 'dxi-access-amh',
      'amh-gen-ii-modified', 'beckman-amh-gen-ii-original-2012', 'gen-ii', 'unmatched']) {
      expect(evaluate(19, { assayMethodId })).toEqual(unavailable('incompatible-assay'));
    }
    // Original Gen II cannot acquire a point in a neighbouring Access cohort.
    for (const age of [17.999, 20]) {
      expect(evaluate(age, { assayMethodId: method })).toEqual(unavailable('incompatible-assay'));
    }
  });

  it('odróżnia nieznany materiał i metodę od potwierdzenia, a znane osocze wyłącza punkt', () => {
    for (const unknown of [undefined, null, '', 'unknown']) {
      const result = evaluate(19, { specimen: unknown, assayMethodId: unknown });
      expect(result.status).toBe('ready');
      expect(result).not.toHaveProperty('methodConfirmed');
      expect(result).not.toHaveProperty('specimenConfirmed');
    }
    for (const specimen of ['serum', 'surowica']) {
      expect(evaluate(19, { specimen, assayMethodId: method }).status).toBe('ready');
    }
    for (const specimen of ['plasma', 'lithium-heparin-plasma', 'edta-plasma', 'saliva']) {
      expect(evaluate(19, { specimen })).toEqual(unavailable('incompatible-specimen'));
    }
  });

  it('nie żąda stadium, donoszenia ani nowego wywiadu i nie wnioskuje Tannera z wieku', () => {
    for (const preterm of [undefined, 'unknown', 'yes', 'no']) {
      for (const puberty of [null, {}, { kind: 'G', stage: 1 }, { kind: 'G', stage: 5 }]) {
        expect(evaluate(19, { preterm, puberty })).toMatchObject({ status: 'ready', profile: { id } });
      }
    }
    expect(profile()).not.toHaveProperty('requiredGonadalStage');
    expect(profile().termOnly).not.toBe(true);
    expect(evaluate(null)).toEqual(unavailable('missing-age'));
    expect(evaluate(19, { sex: 'unknown' })).toEqual(unavailable('unsupported-sex'));
  });

  it('zachowuje przeciwwskazania, cenzurowanie i odrzucanie nieprawidłowych pomiarów', () => {
    expect(evaluate(19, { contraindicated: true })).toEqual(unavailable('contraindicated'));
    for (const operator of ['<', '>', '<=', '>=', '≤', '≥', '~']) {
      expect(evaluate(19, { measurement: { value: 4, unit: 'ng/mL', operator } }))
        .toEqual(unavailable('censored-result'));
    }
    for (const measurement of [null, { value: -1, unit: 'ng/mL' }, { value: NaN, unit: 'ng/mL' },
      { value: Infinity, unit: 'ng/mL' }]) {
      expect(evaluate(19, { measurement })).toEqual(unavailable('invalid-value'));
    }
    expect(evaluate(19, { measurement: { value: 4, unit: 'pg/mL' } })).toEqual(unavailable('unsupported-unit'));
  });

  it('nie przesuwa ilustracji, skali ani porównania niemowląt i nie zmienia danych podczas obliczeń', () => {
    const before = JSON.stringify(runtime);
    const model = display.buildMaleAmh(runtime, engine);
    expect(digest(model)).toBe('cbd1e9d72a4d993ac52e1d3050f31573f678131c14205154ea18a34bd2e96c1c');
    expect(model).toMatchObject({ divisor: 1335.592934, ceiling: 1.25 });
    expect(model.sourceIds).not.toContain(id);
    expect(model.profiles).toHaveLength(15);
    const prior = { ...runtime, patientPointData: { ...data,
      profiles: data.profiles.filter(item => item.id !== id) } };
    expect(display.buildAmhInfantComparison(runtime, engine))
      .toEqual(display.buildAmhInfantComparison(prior, engine));
    evaluate(18); evaluate(19.99);
    expect(JSON.stringify(runtime)).toBe(before);
  });

  it('rzeczywisty adapter wykorzystuje 18 lat 0 miesięcy i 19 lat 11 miesięcy z istniejącego formularza', () => {
    for (const [years, months] of [[18, 0], [19, 11]]) {
      const app = currentForm(years, months);
      app.calculate();
      expect(app.last()).toMatchObject({ analyte: 'amh', sex: 'male', ageYears: years + months / 12,
        ageUpperInclusive: false, puberty: null, specimen: null, assayMethodId: null,
        measurement: { value: 4, unit: 'ng/mL', operator: '=' } });
      expect(app.reference()).toMatchObject({ status: 'ready', profile: { id } });
      expect(app.reference().referenceValue).toBeCloseTo(canonicalMedian, 12);
    }
    const adult = currentForm(20, 0);
    adult.calculate();
    expect(adult.reference()).toMatchObject({ status: 'ready', referenceValue: 43.8,
      profile: { id: 'benderradji2022-male-amh-age-20-under30' } });
  });

  it('adapter zachowuje znane GnRHa, protokół stymulacji i metodę oraz nie zamienia nierówności w liczbę', () => {
    const app = currentForm();
    app.calculate();
    expect(app.reference().status).toBe('ready');
    app.context.sourcePatient.gnrhaStatus = 'w-trakcie';
    app.calculate();
    expect(app.reference()).toEqual(unavailable('contraindicated'));
    app.context.sourcePatient.gnrhaStatus = 'unknown';
    app.context.effectivePatient.test_protocol = 'stimulated';
    app.calculate();
    expect(app.reference()).toEqual(unavailable('contraindicated'));
    app.context.effectivePatient.test_protocol = 'unknown';
    app.context.effectivePatient.method = 'roche-elecsys';
    app.calculate();
    expect(app.reference()).toEqual(unavailable('incompatible-assay'));
    app.context.effectivePatient.method = method;
    app.calculate();
    expect(app.reference().status).toBe('ready');
    app.calculate({ measurement: { status: 'valid', value: 4, unit: 'ng/mL', operator: '<' } });
    expect(app.last().measurement).toEqual({ value: 4, unit: 'ng/mL', operator: '<' });
    expect(app.reference()).toEqual(unavailable('censored-result'));
  });

  it('adapter usuwa poprzedni wynik i kontekst po zmianie pacjenta oraz nie przywraca wyniku przy zablokowanej karcie', () => {
    const app = currentForm();
    app.calculate();
    expect(app.reference().status).toBe('ready');
    app.context.identity = 'fictional-next-amh-patient';
    app.context.sourcePatient.identityKey = app.context.identity;
    app.context.sourcePatient.sex = 'F';
    app.context.effectivePatient.sex = 'F';
    app.calculate();
    expect(app.context.valueEl.value).toBe('');
    expect(app.last()).toMatchObject({ sex: 'female', measurement: null });
    expect(app.reference()).toEqual(unavailable('invalid-value'));
    app.calculate();
    expect(app.reference()).toMatchObject({ status: 'ready', referenceValue: 25.7,
      profile: { id: 'fda2017-female-amh-age-18-under26' } });
    app.context.window.VildaVault = { isUnlocked: () => false };
    app.calculate();
    expect(app.last()).toMatchObject({ measurement: null, ageYears: null, sourceStatus: 'unavailable' });
    expect(app.reference()).toEqual(unavailable('missing-age'));
  });
});
