import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_puberty.js');
const data = require('../../vilda_lab_puberty_data.js');
const age = (years, months = 0, precision = 'month') => ({ years, months, precision });
const neonatal = (ga = 200, pna = 43) => ({ gestationalDays: { lower: ga, upper: ga, source: 'manual-gestational-age' }, postnatalDays: { lower: pna, upper: pna, source: 'manual-completed-days' } });
const input = (overrides = {}) => ({ referenceSelection: 'automatic', reproductiveContext: 'unknown',
  analyte: 'lh', sex: 'M', age: age(60), value: '2', unit: 'IU/L', contextBasis: 'current-patient',
  specimen: 'unknown', measurementKind: 'unknown', assay: { profileId: '', methodId: '', confirmation: 'unknown' },
  treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' }, ...overrides });
const evaluate = (overrides = {}, reference = data) => engine.evaluate(input(overrides), reference);
const axis = (result) => result.referencePreview?.byAge;
function blocked(result, reason) {
  expect(result.referenceSelection.status).toBe('unavailable');
  expect(result.referencePreview).toBeUndefined();
  expect(result.biochemical).toMatchObject({ status: 'unavailable', primary: null });
  if (reason) expect(result.referenceSelection.reasonCodes).toContain(reason);
}

describe('Automatyczny wybór źródła nie potwierdza metody ani materiału próbki', () => {
  it('M60/LH2: porównanie źródłowe z Roche, rzeczywiste wejście nadal unknown', () => {
    const source = input(), saved = structuredClone(source), result = engine.evaluate(source, data);
    expect(source).toEqual(saved);
    expect(result.input.assay).toEqual(saved.assay);
    expect(result.input.specimen).toBe('unknown');
    expect(result.biochemical).toMatchObject({ status: 'unavailable', primary: null, byAge: { range: null } });
    expect(result.referenceSelection).toMatchObject({ mode: 'automatic', status: 'selected', profileIds: ['mayo-lh-adult'] });
    expect(result.referencePreview).toMatchObject({ kind: 'automatic-source-reference', byAge: { status: 'within', range: { basis: 'adult', id: 'lh-adult-m', method: { id: 'roche-elecsys-lh-eclia' }, material: 'serum' } } });
    expect(result.referencePreview.reasonCodes).toEqual(expect.arrayContaining(['source_method_unconfirmed', 'specimen_unconfirmed', 'non_basal_or_unknown_measurement', 'treatment_context_unknown']));
    expect(result.provenance).toMatchObject({ selectionPolicyId: data.automaticReferencePolicy.id, selectionPolicyVersion: data.automaticReferencePolicy.version });
    expect(result.summary).toMatchObject({ status: 'limited', code: 'automatic_reference_comparison' });
  });
  it('jawnie zgodna metoda nie jest nadal nazywana niepotwierdzoną', () => {
    const result = evaluate({ assay: { methodId: 'roche-elecsys-lh-eclia', confirmation: 'reported' }, specimen: 'serum', measurementKind: 'basal', treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' } });
    expect(axis(result).status).toBe('within');
    expect(result.referencePreview.reasonCodes).toEqual([]);
    expect(result.biochemical.primary).toBeNull();
  });
  it('stara konfiguracja urządzenia nie wybiera profilu ani nie potwierdza próbki', () => {
    const result = evaluate({ assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', profileVersion: 'old', confirmation: 'configured' } });
    expect(axis(result).range.profileId).toBe('mayo-lh-adult');
    expect(result.referencePreview.reasonCodes).toContain('source_method_unconfirmed');
    expect(result.input.assay).toMatchObject({ confirmation: 'configured', methodId: 'anshlite-lh-clia', profileVersion: 'old' });
  });
  it.each([
    [{ assay: { confirmation: 'reported', methodId: 'anshlite-lh-clia' } }, 'method_not_confirmed'],
    [{ assay: { confirmation: 'reported', methodId: '' } }, 'method_not_confirmed'],
    [{ assay: { confirmation: 'bogus' } }, 'method_not_confirmed'],
    [{ assay: [] }, 'method_not_confirmed'],
    [{ specimen: 'plasma' }, 'unsupported_or_unknown_specimen'],
    [{ specimen: 'urine' }, 'unsupported_or_unknown_specimen'],
    [{ measurementKind: 'stimulated' }, 'non_basal_or_unknown_measurement'],
    [{ measurementKind: 'other' }, 'non_basal_or_unknown_measurement'],
    [{ treatment: { context: 'hormonal' } }, 'treatment_requires_separate_profile'],
    [{ treatment: { gnrha: 'yes' } }, 'treatment_requires_separate_profile'],
    [{ treatment: { sexSteroids: true } }, 'treatment_requires_separate_profile'],
    [{ treatment: { context: 'bogus' } }, null],
    [{ treatment: [] }, null],
    [{ value: '-2' }, 'invalid_measurement'],
    [{ unit: 'ng/mL' }, 'invalid_measurement'],
    [{ sex: null }, 'missing_sex'],
    [{ age: null }, 'missing_age'],
  ])('jawnie niewłaściwe lub wadliwe dane blokują podgląd: %j', (overrides, reason) => blocked(evaluate(overrides), reason));
});

describe('Dorośli — rzeczywiste nowe katalogowe RI, żadnego odziedziczonego defaultu', () => {
  it.each([
    ['lh', 'M', 'unknown', 1.3, 9.6], ['fsh', 'M', 'unknown', 1.2, 15.8],
    ['lh', 'F', 'follicular', 1.9, 14.6], ['lh', 'F', 'ovulation', 12.2, 118],
    ['lh', 'F', 'luteal', 0.7, 12.9], ['lh', 'F', 'postmenopause', 5.3, 65.4],
    ['fsh', 'F', 'follicular', 2.9, 14.6], ['fsh', 'F', 'ovulation', 4.7, 23.2],
    ['fsh', 'F', 'luteal', 1.4, 8.9], ['fsh', 'F', 'postmenopause', 16, 157],
  ])('%s/%s/%s: granice włączne i odchylenia', (analyte, sex, reproductiveContext, lower, upper) => {
    for (const [value, status] of [[lower / 2, 'below'], [lower, 'within'], [upper, 'within'], [upper + 0.01, 'above']]) {
      const result = evaluate({ analyte, sex, reproductiveContext, value });
      expect(axis(result)).toMatchObject({ status, range: { basis: 'adult', bounds: { lower: { operator: '>=', value: lower }, upper: { operator: '<=', value: upper } } } });
      expect(result.summary.status).toBe('limited');
      expect(result.referencePreview.byStage.reasonCodes).toContain('stage_reference_not_for_adult');
    }
  });
  it.each([19, 60, 90, 110])('obejmuje źródłowe >18 również w wieku %i lat bez udawania odrębnych norm geriatrycznych', (years) => {
    for (const analyte of ['lh', 'fsh']) {
      const result = evaluate({ analyte, age: age(years) });
      expect(axis(result).range.id).toBe(`${analyte}-adult-m`);
      expect(result.clinical.status).toBe('out_of_scope');
      expect(result.summary.status).toBe('limited');
    }
  });
  it('FSH20 u kobiety: unknown daje cztery osobne warianty, bez wyboru najwygodniejszej normy', () => {
    const result = evaluate({ analyte: 'fsh', sex: 'F', age: age(45), value: 20 });
    expect(result.referenceSelection.status).toBe('variants');
    expect(result.referencePreview.byAge).toMatchObject({ status: 'unavailable', range: null });
    expect(result.referencePreview.variants.map((v) => [v.reproductiveContext, v.comparison.status])).toEqual([
      ['follicular', 'above'], ['ovulation', 'within'], ['luteal', 'above'], ['postmenopause', 'within'],
    ]);
    expect(result.summary).toMatchObject({ status: 'limited', code: 'reference_variants_available' });
    expect(result.biochemical.primary).toBeNull();
  });
  it.each(['perimenopause', 'pregnancy', 3, false, {}])('nie zgaduje nieobsługiwanego kontekstu: %j', (reproductiveContext) => {
    blocked(evaluate({ sex: 'F', reproductiveContext }), 'invalid_reproductive_context');
  });
  it('kontekst kobiecy nie przechodzi na mężczyznę ani dziecko', () => {
    blocked(evaluate({ reproductiveContext: 'postmenopause' }), 'reproductive_context_not_applicable');
    blocked(evaluate({ sex: 'F', age: age(8), reproductiveContext: 'follicular' }), 'reproductive_context_not_applicable');
  });
  it('wynik cenzurowany nie zostaje punktem na osi', () => {
    const result = evaluate({ value: '<0,5', unit: 'mIU/mL' });
    expect(axis(result).status).toBe('below');
    expect(result.measurement).toMatchObject({ isExact: false, plotValue: null, operator: '<' });
  });
});

describe('Granica pediatria–dorośli nie jest zaokrąglana', () => {
  it('LH dokładnie w 18. urodziny korzysta ze standardowego Roche >14–≤18', () => {
    for (const [sex, lower, upper] of [['M', 1.3, 9.8], ['F', 0.5, 41.7]]) {
      const result = evaluate({ sex, birthDateISO: '2008-10-09', sampleDateISO: '2026-10-09', contextBasis: 'sample' });
      expect(axis(result).range).toMatchObject({ profileId: 'mayo-lh-standard-transition', basis: 'age-transition', bounds: { lower: { value: lower }, upper: { value: upper } } });
    }
  });
  it('dzień po 18. urodzinach korzysta z dorosłych', () => {
    expect(axis(evaluate({ birthDateISO: '2008-10-08', sampleDateISO: '2026-10-09', contextBasis: 'sample' })).range.profileId).toBe('mayo-lh-adult');
  });
  it.each(['lh', 'fsh'])('%s: 18 lat i 0 mies. daje jawne warianty na granicy', (analyte) => {
    const result = evaluate({ analyte, age: age(18) });
    expect(result.referenceSelection.status).toBe('variants');
    expect(result.referencePreview.variants).toHaveLength(2);
    expect(result.referencePreview.variants.map((v) => v.reproductiveContext)).toEqual([null, null]);
    expect(result.referencePreview.byAge.range).toBeNull();
    expect(result.provenance.profileId).toBeNull();
    expect(result.referencePreview.reasonCodes).toContain('age_precision_crosses_reference_boundary');
    expect(result.referenceSelection.profileIds).toContain(`mayo-${analyte}-adult`);
  });
  it('FSH dokładnie18 pozostaje pediatryczne, znana faza nie jest wyprowadzana z Th5', () => {
    const result = evaluate({ analyte: 'fsh', sex: 'F', age: { years: 18, months: 0, days: 0, precision: 'day' }, puberty: { kind: 'Th', stage: 5, appliesToCurrentContext: true } });
    expect(axis(result).range.id).toBe('fsh-f-age-over15-18');
    expect(result.referencePreview.variants).toBeUndefined();
    expect(result.input.reproductiveContext).toBe('unknown');
  });
  it('przed18 zachowuje LHPED, a nie normę dorosłego z Tanner V', () => {
    expect(axis(evaluate({ age: age(17, 11), puberty: { kind: 'G', stage: 5, appliesToCurrentContext: true } })).range.profileId).toBe('mayo-lh-pediatric');
  });
});

describe('Pediatria i wcześniactwo nie tracą ograniczeń ani ostrzeżeń', () => {
  it('M2 lata9/G3/LH2 zachowuje rozbieżność wieku i stadium oraz ostrzeżenie rozwoju', () => {
    const result = evaluate({ age: age(2, 9), puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true } });
    expect(result.referencePreview).toMatchObject({ byAge: { status: 'above' }, byStage: { status: 'within' } });
    expect(result.summary).toMatchObject({ status: 'attention', code: 'early_development' });
  });
  it('warianty wieku FSH10lat0mies nie usuwają jednoznacznego zakresu G3', () => {
    const result = evaluate({ analyte: 'fsh', age: age(10), puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true } });
    expect(result.referenceSelection.status).toBe('variants');
    expect(result.referencePreview.variants).toHaveLength(2);
    expect(result.referencePreview.byStage).toMatchObject({ status: 'within', range: { id: 'fsh-m-g3' } });
  });
  it.each(['cnsSymptoms', 'regression'])('zachowuje zgłoszone ostrzeżenie kliniczne %s także w auto', (key) => {
    const result = evaluate({ age: age(12), puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true }, history: { [key]: 'yes' }, treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' } });
    expect(result.summary.status).toBe('attention');
    expect(result.summary.code).not.toBe('automatic_reference_comparison');
  });
  it('automatyczny Greaves zachowuje unknown assay, a nie wpisuje e601 jako metodę próbki', () => {
    const result = evaluate({ age: null, preterm: 'yes', neonatalAge: neonatal() });
    expect(axis(result).range).toMatchObject({ basis: 'preterm', profileId: 'greaves-preterm-lh-candidate', method: { id: 'roche-cobas-e601-lh-greaves-2015' } });
    expect(result.neonatalAge.postmenstrualDays).toEqual({ lower: 243, upper: 243 });
    expect(result.input.assay.confirmation).toBe('unknown');
    expect(result.provenance.eligibilityPolicyVersion).toBe('2026-10-09.3');
  });
  it.each([[200, 0], [231, 1], [167, 1], [200, 53]])('Greaves GA%i/PNA%i poza zakresem nie przechodzi do Mayo', (ga, pna) => {
    const result = evaluate({ age: null, preterm: 'yes', neonatalAge: neonatal(ga, pna) });
    blocked(result);
    expect(result.referenceSelection.profileIds).toEqual(['greaves-preterm-lh-candidate']);
  });
  it('brak wcześniaczych danych i niepewność pierwszej doby nadal blokują', () => {
    blocked(evaluate({ age: age(0, 2), preterm: 'yes' }), 'neonatal_postnatal_age_missing');
    const n = neonatal(); n.postnatalDays = { lower: 0, upper: 1, source: 'main-calendar-dates' };
    blocked(evaluate({ age: null, preterm: 'yes', neonatalAge: n }), 'preterm_first_day_excluded');
    blocked(evaluate({ age: null, preterm: 'no', neonatalAge: neonatal() }), 'preterm_context_conflict');
  });
  it('3 ukończone miesiące wcześniaka są już poza oknem, bez prośby o ukryte GA/PNA', () => {
    const result = evaluate({ age: age(0, 3), preterm: 'yes' });
    blocked(result, 'preterm_age_window_exceeded');
    expect(result.referenceSelection.reasonCodes).not.toContain('neonatal_postnatal_age_missing');
    expect(result.referenceSelection.reasonCodes).not.toContain('neonatal_gestational_age_missing');
    expect(result.neonatalAge).toMatchObject({ status: 'missing', reasonCodes: ['preterm_age_window_exceeded'] });
    expect(result.referenceSelection.profileIds).toEqual(['greaves-preterm-lh-candidate']);
    blocked(evaluate({ age: age(0, 2), preterm: 'yes' }), 'neonatal_postnatal_age_missing');
  });
  it('maksymalne okno wcześniacze nadal pochodzi z polityki, a nie stałego wieku3m lub84dni', () => {
    const reference = structuredClone(data);
    reference.pretermEligibilityPolicy.postmenstrualAgeDays.upper.value = 300;
    blocked(evaluate({ age: age(0, 3), preterm: 'yes' }, reference), 'neonatal_postnatal_age_missing');
    expect(evaluate({ age: age(0, 3), preterm: 'yes' }, reference).referenceSelection.reasonCodes).not.toContain('preterm_age_window_exceeded');
  });
  it('donoszone niemowlę korzysta z szerokiego RI, niewiadome wcześniactwo nie zostaje donoszeniem', () => {
    expect(axis(evaluate({ age: age(0, 2), preterm: 'no' })).range.id).toBe('lh-m-age-under1');
    blocked(evaluate({ age: age(0, 2), preterm: 'unknown' }), 'infant_gestational_context_missing');
  });
  it('starszy wcześniak nie zostaje ponownie zakwalifikowany do noworodkowego profilu', () => {
    expect(axis(evaluate({ age: age(12), preterm: 'yes' })).range.profileId).toBe('mayo-lh-pediatric');
  });
  it('nieobsługiwany analit zachowuje out_of_scope', () => {
    expect(evaluate({ analyte: 'tsh' }).summary).toMatchObject({ status: 'out_of_scope', code: 'unsupported_analyte' });
  });
});

describe('Wersjonowane dane sterują wyborem; stary kontrakt pozostaje jawnie opt-in', () => {
  it.each(['policy', 'source', 'inactive', 'method', 'rows', 'wrong-analyte', 'stimulated-profile', 'missing-kind'])('uszkodzone %s blokuje porównanie', (change) => {
    const reference = structuredClone(data), p = reference.profiles.find((entry) => entry.id === 'mayo-lh-adult');
    if (change === 'policy') delete reference.automaticReferencePolicy;
    if (change === 'source') delete reference.sources[p.sourceId];
    if (change === 'inactive') p.active = false;
    if (change === 'method') delete p.method;
    if (change === 'rows') p.rows = [];
    if (change === 'wrong-analyte') p.analyte = 'fsh';
    if (change === 'stimulated-profile') p.examinationType = 'stimulated';
    if (change === 'missing-kind') delete p.examinationType;
    blocked(evaluate({}, reference));
  });
  it('nie dobiera norm dorosłych poza skonfigurowanym routingiem', () => {
    const reference = structuredClone(data); reference.automaticReferencePolicy.profileIds.lh = ['mayo-lh-pediatric'];
    blocked(evaluate({}, reference));
  });
  it('brak opt-in zachowuje dotychczasową blokadę nieznanej metody i materiału', () => {
    const source = input({ age: age(12) }); delete source.referenceSelection;
    const result = engine.evaluate(source, data);
    expect(result.referenceSelection).toBeUndefined();
    expect(result.referencePreview).toBeUndefined();
    expect(result.biochemical.reasonCodes).toContain('unsupported_or_unknown_specimen');
  });
  it('stare configured pediatryczne nadal daje conditional-basal-untreated', () => {
    const source = input({ age: age(2, 9), specimen: 'serum', assay: { profileId: 'mayo-lh-pediatric', profileVersion: '2026-10-03.1', methodId: 'anshlite-lh-clia', confirmation: 'configured' } });
    delete source.referenceSelection; delete source.reproductiveContext;
    const result = engine.evaluate(source, data);
    expect(result.referencePreview.kind).toBe('conditional-basal-untreated');
    expect(result.referenceSelection).toBeUndefined();
    expect(result.input).not.toHaveProperty('referenceSelection');
    expect(result.provenance).not.toHaveProperty('selectionPolicyId');
  });
});
