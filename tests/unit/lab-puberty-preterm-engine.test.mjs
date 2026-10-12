import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const data = require('../../vilda_lab_puberty_data.js');
const engine = require('../../vilda_lab_puberty.js');
const profileId = (analyte) => `greaves-preterm-${analyte}-candidate`;
const days = (lower, upper = lower, source = 'manual-completed-days') => ({ lower, upper, source });
const neonatal = (ga = 200, pna = 43) => ({ gestationalDays: days(ga, ga, 'manual-gestational-age'), postnatalDays: days(pna) });
function assay(id) {
  const p = data.profiles.find((entry) => entry.id === id);
  return { profileId: id, profileVersion: p.version, methodId: p.method.id, confirmation: 'configured' };
}
function input(overrides = {}, analyte = 'lh') {
  return { analyte, value: '2', unit: 'IU/L', sex: 'M', contextBasis: 'current-patient', age: null,
    specimen: 'serum', measurementKind: 'basal', assay: assay(profileId(analyte)), preterm: 'yes',
    neonatalAge: neonatal(), treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' }, ...overrides };
}
const evaluate = (overrides = {}, reference = data, analyte = 'lh') => engine.evaluate(input(overrides, analyte), reference);
function expectNoReference(result, reason) {
  expect(result.biochemical).toMatchObject({ status: 'unavailable', primary: null,
    byAge: { status: 'unavailable', range: null }, byStage: { status: 'unavailable', range: null } });
  expect(result).not.toHaveProperty('referencePreview');
  if (reason) expect(result.biochemical.reasonCodes).toContain(reason);
}

describe('Wcześniacze LH/FSH — rzeczywiste porównania i niezależna klinika', () => {
  it.each([
    ['lh', 'M', 0.1, 9.2], ['lh', 'F', 0.2, 133.9], ['fsh', 'M', 0.2, 3.6], ['fsh', 'F', 2.6, 181.1],
  ])('%s/%s: dolna i górna granica są włączone; poza nimi odchylenie', (analyte, sex, lower, upper) => {
    for (const [value, status] of [[lower / 2, 'below'], [lower, 'within'], [(lower + upper) / 2, 'within'], [upper, 'within'], [upper + 0.01, 'above']]) {
      const result = evaluate({ sex, value: String(value) }, data, analyte);
      expect(result.biochemical.byAge).toMatchObject({ status, range: { sourceId: 'greaves-preterm-2015', basis: 'preterm',
        bounds: { lower: { operator: '>=', value: lower }, upper: { operator: '<=', value: upper } } } });
      expect(result.biochemical.primary).toBe('age');
      expect(result.biochemical.byStage.reasonCodes).toContain('stage_reference_not_for_preterm');
    }
  });
  it('GA28+4/PNA43 → PMA34+5 i LH2 w zakresie, bez dopisywania dat', () => {
    const result = evaluate();
    expect(result.neonatalAge).toMatchObject({ status: 'known', postmenstrualDays: { lower: 243, upper: 243 }, reasonCodes: [] });
    expect(result.provenance).toMatchObject({ eligibilityPolicyId: 'greaves-preterm-applicability', eligibilityPolicyVersion: '2026-10-09.3' });
    expect(result.input).toMatchObject({ age: null, birthDateISO: null, sampleDateISO: null });
    expect(result.ageAtSample.source).toBe('neonatal-days');
    expect(result.clinical.code).toBe('infant_context');
    expect(result.limitations).not.toContain('broad_infant_reference_not_full_minipuberty_assessment');
  });
  it.each(['lh', 'fsh'])('%s: nieznany kontekst daje wyłącznie warunkowe porównanie tych samych granic', (analyte) => {
    const result = evaluate({ measurementKind: 'unknown', treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' } }, data, analyte);
    expect(result.biochemical.status).toBe('unavailable');
    expect(result.referencePreview).toMatchObject({ kind: 'conditional-basal-untreated',
      byAge: { status: 'within', range: { basis: 'preterm', profileId: profileId(analyte) } },
      byStage: { status: 'unavailable', reasonCodes: ['stage_reference_not_for_preterm'] } });
    expect(result.input.treatment.context).toBe('unknown');
  });
  it('zaawansowane G3 nadal ostrzega nawet przy LH w zakresie', () => {
    const result = evaluate({ puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true } });
    expect(result.biochemical.byAge.status).toBe('within');
    expect(result.clinical).toMatchObject({ status: 'warning', code: 'early_development' });
  });
  it('mIU/mL jest równoważne IU/L, a cenzurowany wynik nie staje się dokładnym punktem', () => {
    expect(evaluate({ unit: 'mIU/mL' }).biochemical.byAge.status).toBe('within');
    const censored = evaluate({ value: '<0,1' });
    expect(censored.biochemical.byAge.status).toBe('below');
    expect(censored.measurement).toMatchObject({ operator: '<', plotValue: null, isExact: false });
    expect(evaluate({ value: '<LOD' }).biochemical.byAge.status).toBe('indeterminate');
  });
});

describe('Kwalifikacja — cały domknięty przedział ukończonych dni', () => {
  it.each([[168, 1], [224, 1], [168, 84], [224, 28], [200, 52]])('dopuszcza GA%i/PNA%i na włącznie określonych granicach', (ga, pna) => {
    expect(evaluate({ neonatalAge: neonatal(ga, pna) }).biochemical.byAge.status).toBe('within');
  });
  it.each([
    [167, 1, 'preterm_gestational_age_outside_profile'], [225, 1, 'preterm_gestational_age_outside_profile'],
    [168, 85, 'preterm_postmenstrual_age_outside_profile'], [224, 29, 'preterm_postmenstrual_age_outside_profile'],
    [200, 0, 'preterm_first_day_excluded'],
  ])('blokuje GA%i/PNA%i: %s', (ga, pna, reason) => {
    expectNoReference(evaluate({ neonatalAge: neonatal(ga, pna) }), reason);
  });
  it.each([
    ['niepewna pełna doba', days(0, 1, 'main-calendar-dates'), days(200, 200, 'patient-record'), 'preterm_first_day_excluded'],
    ['PMA przecina 36+0', days(52, 53, 'main-calendar-dates'), days(200, 200, 'patient-record'), 'preterm_age_precision_crosses_scope'],
    ['cały 32. tydzień nie jest 32+0', days(1), days(224, 230, 'patient-record'), 'preterm_age_precision_crosses_scope'],
    ['tygodnie PNA przecinają PMA', days(49, 55, 'main-completed-weeks'), days(200, 200, 'patient-record'), 'preterm_age_precision_crosses_scope'],
  ])('%s', (_, postnatalDays, gestationalDays, reason) => {
    const result = evaluate({ neonatalAge: { postnatalDays, gestationalDays } });
    expectNoReference(result, reason);
    expect(result.neonatalAge.status).toBe('uncertain');
  });
  it('same daty nie udają 24h, lecz cały przedział po pierwszej dobie może być użyty', () => {
    expectNoReference(evaluate({ neonatalAge: { ...neonatal(), postnatalDays: days(1, 1, 'main-calendar-dates') } }), 'invalid_neonatal_age');
    expectNoReference(evaluate({ neonatalAge: { ...neonatal(), postnatalDays: days(1, 1, ' main-calendar-dates ') } }), 'invalid_neonatal_age');
    expect(evaluate({ neonatalAge: { ...neonatal(), postnatalDays: days(1, 2, 'main-calendar-dates') } }).biochemical.byAge.status).toBe('within');
    const result = evaluate({ neonatalAge: { postnatalDays: days(7, 13, 'main-completed-weeks'), gestationalDays: days(196, 202, 'patient-record') } });
    expect(result.biochemical.byAge.status).toBe('within');
    expect(result.neonatalAge.postmenstrualDays).toEqual({ lower: 203, upper: 215 });
  });
  it.each([null, {}, { postnatalDays: days(43) }, { gestationalDays: days(200, 200, 'patient-record') }])('nie odtwarza brakujących dni z miesięcy lub wcześniactwa: %j', (neonatalAge) => {
    expectNoReference(evaluate({ neonatalAge, age: { years: 0, months: 1, precision: 'month' } }));
  });
  it.each([days(-1), days(1.5), days(4, 3), days(43, 43, ''), { lower: '43', upper: 43, source: 'manual-completed-days' }])('odrzuca wadliwy przedział: %j', (postnatalDays) => {
    const result = evaluate({ neonatalAge: { ...neonatal(), postnatalDays } });
    expectNoReference(result, 'invalid_neonatal_age');
    expect(result.input.neonatalAge.postnatalDays).toBeNull();
    expect(result.neonatalAge).toMatchObject({ postnatalDays: null, postmenstrualDays: null, status: 'invalid' });
  });
  it('jawne donoszenie i starszy wiek nie mogą współistnieć z kwalifikacją noworodkową', () => {
    expectNoReference(evaluate({ preterm: 'no' }), 'preterm_context_conflict');
    expectNoReference(evaluate({ gestationalAgeWeeks: 40 }), 'preterm_context_conflict');
    expect(evaluate({ gestationalAgeWeeks: 28 }).biochemical.byAge.status).toBe('within');
    expectNoReference(evaluate({ age: { years: 2, months: 9, precision: 'month' } }), 'neonatal_age_context_mismatch');
    expect(evaluate({ preterm: 'unknown' }).biochemical.byAge.status).toBe('within');
  });
  it.each([['BigInt', 28n], ['Symbol', Symbol('28')]])('wadliwy typ starszego GA (%s) blokuje ocenę bez wyjątku', (_, gestationalAgeWeeks) => {
    expectNoReference(evaluate({ gestationalAgeWeeks }), 'preterm_context_conflict');
  });
  it('wiek skorygowany nie staje się PNA', () => {
    expectNoReference(evaluate({ neonatalAge: { gestationalDays: neonatal().gestationalDays }, correctedAge: { years: 0, months: 1, precision: 'month' } }), 'neonatal_postnatal_age_missing');
  });
  it('kwalifikacja pochodzi z danych, a nie z liczby 252 wpisanej w silnik', () => {
    const narrower = structuredClone(data);
    narrower.pretermEligibilityPolicy.postmenstrualAgeDays.upper.value = 242;
    for (const p of narrower.profiles.filter((entry) => entry.id.startsWith('greaves-preterm-'))) {
      p.scope.age.upper.value = 242;
      p.rows.forEach((row) => { row.age.upper.value = 242; });
    }
    expectNoReference(evaluate({}, narrower), 'preterm_postmenstrual_age_outside_profile');
    expect(evaluate().biochemical.byAge.status).toBe('within');
  });
});

describe('Nie wolno omijać metody, leczenia, wyłączenia profilu ani jego wersji', () => {
  it.each([
    [{ measurementKind: 'stimulated' }, 'non_basal_or_unknown_measurement'],
    [{ treatment: { context: 'hormonal' } }, 'treatment_requires_separate_profile'],
    [{ treatment: { gnrha: 'yes', sexSteroids: 'no' } }, 'treatment_requires_separate_profile'],
    [{ specimen: 'plasma' }, 'unsupported_or_unknown_specimen'],
    [{ sex: null }, 'missing_sex'], [{ unit: 'ng/mL' }, 'invalid_measurement'],
  ])('brak RI i podglądu dla %j', (overrides, reason) => expectNoReference(evaluate(overrides), reason));
  it.each([
    { methodId: 'anshlite-lh-clia' }, { methodId: 'roche-elecsys-fsh-eclia' },
    { confirmation: 'unknown' }, { profileVersion: '2026-10-09.2' }, { profileId: profileId('fsh') },
  ])('nie utożsamia metod ani wersji: %j', (override) => {
    expectNoReference(evaluate({ assay: { ...assay(profileId('lh')), ...override } }));
  });
  it.each(['missing-policy', 'wrong-policy-version', 'scope-differs', 'inactive', 'missing-source', 'no-rows'])('odrzuca profil: %s', (change) => {
    const reference = structuredClone(data), p = reference.profiles.find((entry) => entry.id === profileId('lh'));
    if (change === 'missing-policy') delete reference.pretermEligibilityPolicy;
    if (change === 'wrong-policy-version') p.scope.policyVersion = 'old';
    if (change === 'scope-differs') p.scope.gestationalAgeDays = { ...p.scope.gestationalAgeDays, upper: { operator: '<=', value: 230 } };
    if (change === 'inactive') p.active = false;
    if (change === 'missing-source') delete reference.sources[p.sourceId];
    if (change === 'no-rows') p.rows = [];
    expectNoReference(evaluate({}, reference));
    expectNoReference(evaluate({ measurementKind: 'unknown' }, reference));
  });
  it('brak klinicznych kryteriów nie wyłącza biochemicznej kwalifikacji', () => {
    const reference = { ...data, clinicalProfile: null };
    expect(evaluate({}, reference).biochemical.byAge.status).toBe('within');
    expectNoReference(evaluate({ neonatalAge: neonatal(200, 0) }, reference), 'preterm_first_day_excluded');
  });
  it('Greaves nie przełącza się na Mayo po pierwszych urodzinach', () => {
    expectNoReference(evaluate({ neonatalAge: neonatal(200, 365), age: { years: 1, months: 0, precision: 'month' } }), 'preterm_postmenstrual_age_outside_profile');
  });
  it('starszy wcześniak M2 lata 9 miesięcy/G3/LH2 zachowuje zwykłe osie i ostrzeżenie', () => {
    const source = input({ age: { years: 2, months: 9, precision: 'month' }, assay: assay('mayo-lh-pediatric'), measurementKind: 'unknown',
      treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' }, puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true } });
    delete source.neonatalAge;
    const result = engine.evaluate(source, data);
    expect(result.referencePreview).toMatchObject({ byAge: { status: 'above', range: { id: 'lh-m-age1-8' } }, byStage: { status: 'within', range: { id: 'lh-m-g3' } } });
    expect(result.clinical.code).toBe('early_development');
    expect(result).not.toHaveProperty('neonatalAge');
    expect(result.provenance).not.toHaveProperty('eligibilityPolicyId');
  });
});
