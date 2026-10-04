import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

let engine;
let data;
let snapshot;
const SAMPLE_DATE = '2026-10-04';
beforeAll(() => {
  const browser = {};
  loadBrowserScript('vilda_lab_puberty_data.js', browser);
  loadBrowserScript('vilda_lab_puberty.js', browser);
  loadBrowserScript('vilda_lab_snapshot.js', browser);
  engine = browser.VildaLabPuberty;
  data = browser.VildaLabPubertyData;
  snapshot = browser.VildaLabSnapshot;
});

function input(overrides = {}) {
  return {
    analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
    birthDateISO: '2010-10-04', sampleDateISO: SAMPLE_DATE,
    specimen: 'serum', measurementKind: 'basal',
    assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
    puberty: { kind: 'G', stage: 3, assessedAtISO: SAMPLE_DATE, appliesToSample: true },
    onset: { kind: 'G', age: { years: 12, months: 0, days: 0, precision: 'day' } },
    history: { progression: 'no', growthAcceleration: 'no', cnsSymptoms: 'no', regression: 'no' },
    treatment: { gnrha: 'no', sexSteroids: 'no' }, preterm: 'no',
    ...overrides,
  };
}

function evaluate(overrides = {}, reference = data) {
  return engine.evaluate(input(overrides), reference);
}

function infant(overrides = {}) {
  return input({
    birthDateISO: '2026-07-04', puberty: {}, onset: {},
    testicularVolume: { value: 8, unit: 'mL', method: 'Prader', assessedAtISO: SAMPLE_DATE, appliesToSample: true },
    ...overrides,
  });
}

describe('LH/FSH — dodatni wywiad obok niezależnej oceny czasu', () => {
  it.each([
    ['regression', 'reported_puberty_regression', 'Regresja cech dojrzewania:'],
    ['cnsSymptoms', 'reported_cns_symptoms', 'Objawy OUN:'],
  ])('%s pozostaje widoczne przy zgodnych RI i prawidłowym czasie początku', (field, code, message) => {
    const baseline = evaluate();
    const result = evaluate({ history: { [field]: 'yes' } });
    expect(baseline.summary.status).toBe('compared');
    expect(result.biochemical).toEqual(baseline.biochemical);
    expect(result.biochemical.byAge.status).toBe('within');
    expect(result.biochemical.byStage.status).toBe('within');
    expect(result.clinical).toMatchObject({ code: baseline.clinical.code, status: baseline.clinical.status, title: baseline.clinical.title });
    expect(result.clinical.text).toContain(`${baseline.clinical.text}\n\n${message}`);
    expect(result.clinical.reasonCodes).toContain(code);
    expect(result.limitations).toContain(code);
    expect(result.summary).toMatchObject({ status: 'attention', code });
  });

  it.each(['regression', 'cnsSymptoms'])('%s nie znika przy brakującym wieku, metodzie ani niepoprawnym wyniku', (field) => {
    const result = evaluate({ birthDateISO: null, age: null, assay: {}, value: 'błąd', history: { [field]: 'yes' } });
    expect(result.clinical.code).toBe('missing_age');
    expect(result.biochemical.primary).toBeNull();
    expect(result.measurement.status).toBe('invalid');
    expect(result.clinical.text).toContain(field === 'regression' ? 'Regresja cech dojrzewania:' : 'Objawy OUN:');
    expect(result.summary.status).toBe('attention');
  });

  it.each(['no', 'unknown', undefined, false])('odpowiedź %s nie tworzy dodatniego wywiadu', (answer) => {
    const result = evaluate({ history: { regression: answer, cnsSymptoms: answer } });
    expect(result.summary.status).toBe('compared');
    expect(result.clinical.text).not.toContain('Regresja cech dojrzewania:');
    expect(result.clinical.text).not.toContain('Objawy OUN:');
  });

  it('obie dodatnie informacje pozostają osobnymi akapitami przy leczeniu i braku RI', () => {
    const result = evaluate({ treatment: { gnrha: 'yes', sexSteroids: 'no' }, history: { regression: true, cnsSymptoms: true } });
    expect(result.clinical.code).toBe('treatment_context');
    expect(result.biochemical.primary).toBeNull();
    expect(result.clinical.text.split('\n\n')).toHaveLength(3);
    expect(result.clinical.text).toContain('Regresja cech dojrzewania:');
    expect(result.clinical.text).toContain('Objawy OUN:');
    expect(result.summary).toMatchObject({ status: 'attention', code: 'reported_cns_symptoms' });
  });

  it('regresja nie zastępuje ostrzeżenia o wcześniejszym początku rozpoznaniem opóźnienia', () => {
    const source = input({ birthDateISO: '2014-10-04', onset: { kind: 'G', age: { years: 7, precision: 'year' } }, history: { regression: 'yes' } });
    const timing = engine.assessTiming(source, data.clinicalProfile);
    const result = engine.evaluate(source, data);
    expect(timing.code).toBe('early_onset_history');
    expect(result.clinical).toMatchObject({ code: timing.code, status: timing.status, title: timing.title });
    expect(result.clinical.text).toContain('Regresja cech dojrzewania:');
    expect(result.summary).toMatchObject({ status: 'attention', code: timing.code });
  });

  it('aktualne G1 z regresją po prawidłowym początku zachowuje ograniczenie rozpoznania nowego opóźnienia', () => {
    const result = evaluate({ puberty: { kind: 'G', stage: 1, appliesToSample: true }, history: { regression: 'yes' } });
    expect(result.clinical.code).toBe('treatment_context');
    expect(result.clinical.text).toContain('Regresja cech dojrzewania:');
    expect(result.clinical.reasonCodes).toContain('reported_puberty_regression');
    expect(result.summary.status).toBe('attention');
  });

  it('OUN przy wczesnym Th2 ma odrębny komunikat zgodny z zakresem uwag ES2026', () => {
    const source = input({ sex: 'F', birthDateISO: '2019-10-04', puberty: { kind: 'Th', stage: 2, appliesToSample: true }, onset: {}, history: { cnsSymptoms: 'yes' } });
    const timing = engine.assessTiming(source, data.clinicalProfile);
    const result = engine.evaluate(source, data);
    expect(timing.code).toBe('early_development');
    expect(result.clinical).toMatchObject({ code: timing.code, status: timing.status, title: timing.title });
    expect(result.clinical.reasonCodes).toEqual(expect.arrayContaining(['reported_cns_symptoms', 'early_thelarche_with_cns_symptoms']));
    expect(result.clinical.text).toContain('sprawną ocenę przez endokrynologa dziecięcego');
    expect(result.clinical.text).toContain('Zalecenie samej obserwacji izolowanej wczesnej thelarche nie ma tu zastosowania.');
    expect(result.summary).toMatchObject({ status: 'attention', code: 'early_development' });
  });

  it.each([
    { birthDateISO: '2018-10-04', puberty: { kind: 'Th', stage: 2, appliesToSample: true } },
    { birthDateISO: '2019-10-04', puberty: { kind: 'Th', stage: 1, appliesToSample: true } },
    { birthDateISO: '2019-10-04', puberty: { kind: 'P', stage: 3, appliesToSample: true } },
    { birthDateISO: '2019-10-04', puberty: { kind: 'Th', stage: 2, appliesToSample: false } },
    { birthDateISO: '2019-10-04', puberty: { kind: 'Th', stage: 2, assessedAtISO: '2018-10-04', appliesToSample: true } },
  ])('nie rozszerza wyjątku wczesnej thelarche na nieodpowiedni lub niepotwierdzony kontekst: %j', (context) => {
    const result = evaluate({ sex: 'F', onset: {}, history: { cnsSymptoms: 'yes' }, ...context });
    expect(result.clinical.reasonCodes).toContain('reported_cns_symptoms');
    expect(result.clinical.reasonCodes).not.toContain('early_thelarche_with_cns_symptoms');
  });

  it.each([
    { analyte: 'tsh' },
    { birthDateISO: '2000-10-04' },
  ])('nie tworzy pediatrycznej oceny poza zakresem modułu: %j', (overrides) => {
    const result = evaluate({ ...overrides, history: { regression: 'yes', cnsSymptoms: 'yes' } });
    expect(result.summary.status).toBe('out_of_scope');
    expect(result.clinical.text).not.toContain('Regresja cech dojrzewania:');
    expect(result.clinical.text).not.toContain('Objawy OUN:');
  });

  it('silnik nie tworzy nowych reguł, gdy przekazany profil nie zawiera ich danych', () => {
    const reference = JSON.parse(JSON.stringify(data));
    delete reference.clinicalProfile.contextMessages;
    const result = evaluate({ history: { regression: 'yes' } }, reference);
    expect(result.clinical.reasonCodes).not.toContain('reported_puberty_regression');
    expect(result.summary.status).toBe('compared');
  });
});

describe('LH/FSH — jawny zakres oceny objętości jąder niemowlęcia', () => {
  it.each([0, 1, 3.9, 4, 8, 15])('pomiar %s mL uruchamia to samo ograniczenie bez progu alarmowego i stadium G', (value) => {
    const source = infant();
    source.testicularVolume.value = value;
    const timing = engine.assessTiming(source, data.clinicalProfile);
    const result = engine.evaluate(source, data);
    expect(result.clinical).toMatchObject({ code: 'infant_context', status: 'notice', title: timing.title });
    expect(result.clinical.reasonCodes).toContain('infant_testicular_volume_not_validated');
    expect(result.clinical.text).toContain(`podano ${String(value).replace('.', ',')} mL, orchidometr Pradera`);
    expect(result.clinical.text).toContain('nie ma zweryfikowanego zakresu referencyjnego objętości');
    expect(result.input.puberty.stage).toBeNull();
    expect(result.biochemical.byStage.status).toBe('unavailable');
    expect(result.summary).toMatchObject({ status: 'attention', code: 'infant_context' });
  });

  it.each([['ultrasound', 'USG'], ['', 'metoda niepodana lub nieznana'], ['other', 'inna metoda']])('komunikat zachowuje kontekst metody %s bez użycia progu Pradera', (method, label) => {
    const source = infant();
    source.testicularVolume.method = method;
    const result = engine.evaluate(source, data);
    expect(result.clinical.text).toContain(`podano 8 mL, ${label}`);
    expect(result.clinical.reasonCodes).toContain('infant_testicular_volume_not_validated');
  });

  it.each([
    { appliesToSample: false, assessedAtISO: null },
    { assessedAtISO: '2026-10-05' },
    { assessedAtISO: '2026-02-30' },
    { assessedAtISO: '2025-10-04' },
    { value: null },
    { value: -1 },
    { value: Infinity },
    { unit: 'cm' },
  ])('nie przedstawia niemożliwego lub niepotwierdzonego pomiaru jako oceny próbki: %j', (volume) => {
    const source = infant();
    Object.assign(source.testicularVolume, volume);
    const result = engine.evaluate(source, data);
    expect(result.clinical.reasonCodes).not.toContain('infant_testicular_volume_not_validated');
    expect(result.clinical.text).not.toContain('podano');
  });

  it('zgodna data badania i pobrania potwierdza obserwację także bez dodatkowego checkboxa', () => {
    const source = infant();
    source.testicularVolume.appliesToSample = false;
    expect(engine.evaluate(source, data).clinical.reasonCodes).toContain('infant_testicular_volume_not_validated');
  });

  it.each([
    { sex: 'F' },
    { birthDateISO: '2025-10-04' },
    { birthDateISO: null, age: null },
    { birthDateISO: '2026-02-30' },
  ])('nie przenosi ograniczenia objętości niemowlęcia na inny lub nieustalony kontekst: %j', (overrides) => {
    expect(engine.evaluate(infant(overrides), data).clinical.reasonCodes).not.toContain('infant_testicular_volume_not_validated');
  });

  it('nie znosi istniejącego ostrzeżenia o rozwiniętych cechach u niemowlęcia', () => {
    const source = infant({ puberty: { kind: 'G', stage: 3, appliesToSample: true } });
    const result = engine.evaluate(source, data);
    expect(result.clinical.code).toBe('early_development');
    expect(result.clinical.reasonCodes).toContain('infant_testicular_volume_not_validated');
    expect(result.summary).toMatchObject({ status: 'attention', code: 'early_development' });
  });
});

describe('LH/FSH — utrwalenie nowych komunikatów i zgodność starszych ocen', () => {
  it('nowy snapshot przechowuje dosłowne akapity i kody bez zmiany schematu', () => {
    const evaluation = evaluate({ history: { regression: 'yes', cnsSymptoms: 'yes' } });
    const envelope = snapshot.create(evaluation);
    expect(envelope.status).toBe('recorded');
    expect(envelope.schemaVersion).toBe(1);
    expect(snapshot.normalize(JSON.parse(JSON.stringify(envelope))).evaluation).toEqual(evaluation);
    expect(envelope.evaluation.clinical.text.split('\n\n')).toHaveLength(3);
  });

  it('starszy zapis z dodatnim wywiadem nie dostaje nowych komunikatów podczas odczytu', () => {
    const reference = JSON.parse(JSON.stringify(data));
    delete reference.clinicalProfile.contextMessages;
    const historical = evaluate({ history: { regression: 'yes', cnsSymptoms: 'yes' } }, reference);
    historical.engineVersion = '1.0.0';
    historical.dataVersion = '2026-10-03.1';
    historical.provenance.clinicalProfileVersion = '2026-10-03.1';
    const envelope = snapshot.create(historical);
    expect(envelope.status).toBe('recorded');
    const read = snapshot.normalize(JSON.parse(JSON.stringify(envelope)));
    expect(read.evaluation).toEqual(historical);
    expect(read.evaluation.clinical.text).not.toContain('Regresja cech dojrzewania:');
    expect(read.evaluation.clinical.text).not.toContain('Objawy OUN:');
    expect(read.evaluation.summary.status).toBe('compared');
  });

  it('wersjonuje zmienioną interpretację niezależnie od niezmienionych profilów RI', () => {
    expect(engine.version).toBe('1.3.0');
    expect(data.dataVersion).toBe('2026-10-04.1');
    expect(data.clinicalProfile.version).toBe('2026-10-04.1');
    expect(data.biochemicalPolicy.version).toBe('2026-10-03.1');
    expect(data.profiles.every((profile) => profile.version === '2026-10-03.1')).toBe(true);
    for (const sourceId of ['puberty-hormones-review-2021', 'minipuberty-review-2024']) {
      expect(data.clinicalProfile.sourceIds).toContain(sourceId);
      expect(data.sources[sourceId]).toMatchObject({ id: sourceId });
      expect(data.sources[sourceId].pmid).toMatch(/^\d+$/);
    }
  });
});
