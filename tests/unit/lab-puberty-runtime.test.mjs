import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const win = {};
for (const file of ['vilda_lab_puberty_data.js', 'vilda_lab_puberty.js', 'vilda_lab_snapshot.js', 'vilda_lab_puberty_ui.js']) loadBrowserScript(file, win);
const UI = win.VildaLabPubertyUI;
const complete = {
  sex: 'M', birthDate: '2020-10-03', sampleDate: '2026-10-03', specimen: 'serum', measurementKind: 'basal',
  profile: 'mayo-lh-pediatric', method: 'anshlite-lh-clia', methodConfirmed: true,
  kind: 'G', stage: '4', assessedAt: '2026-10-03', appliesToSample: true,
  gnrha: 'no', sexSteroids: 'no', preterm: 'no', regression: 'no',
};
const result = { analyte: 'lh', raw: '2', unit: 'IU/L' };
const evaluate = (fields, measurement = result) => win.VildaLabPuberty.evaluate(UI.buildInput(fields, measurement), win.VildaLabPubertyData);

describe('LH/FSH — adapter jawnego kontekstu formularza', () => {
  it('puste pola pozostawiają nieznany kontekst, bez daty dziś, metody ani domyślnego dorosłego', () => {
    const input = UI.buildInput({}, result);
    expect(input).toMatchObject({ birthDateISO: null, sampleDateISO: null, age: null, sex: null,
      specimen: 'unknown', measurementKind: 'unknown',
      assay: { profileId: '', methodId: '', confirmation: 'unknown' },
      puberty: { kind: 'unspecified', stage: null, assessedAtISO: null, appliesToSample: false },
      treatment: { gnrha: 'unknown', sexSteroids: 'unknown' }, preterm: 'unknown' });
    expect(input).not.toHaveProperty('life_stage');
    expect(evaluate({}).biochemical.primary).toBeNull();
  });

  it.each([
    [{ ageYears: '6' }, { precision: 'year', years: 6, months: null, days: null }],
    [{ ageYears: '6', ageMonths: '0' }, { precision: 'month', years: 6, months: 0, days: null }],
    [{ ageYears: '0', ageMonths: '3', ageDays: '0' }, { precision: 'day', years: 0, months: 3, days: 0 }],
  ])('zachowuje rzeczywistą precyzję podanego wieku: %j', (fields, expected) => {
    expect(UI.buildInput(fields, result).age).toEqual(expected);
  });

  it.each([{ ageMonths: '3' }, { ageYears: '6', ageDays: '4' }, { ageYears: '6.5' }])(
    'nie dopisuje brakujących części wieku ani nie ucina ułamka: %j', (fields) => {
      expect(evaluate(fields).ageAtSample.status).toBe('invalid');
    },
  );

  it('nie zastępuje niepoprawnej daty urodzenia ręcznym wiekiem', () => {
    const output = evaluate({ ...complete, birthDate: '2020-02-30', ageYears: '6' });
    expect(output.ageAtSample.reasonCodes).toContain('invalid_birth_date');
    expect(output.biochemical.primary).toBeNull();
  });

  it.each(['F', 'M'])('nie zamienia dawnego numeru Tannera w Th/G według płci %s', (sex) => {
    const input = UI.buildInput({ ...complete, sex, kind: '', stage: '3' }, result);
    expect(input.puberty.kind).toBe('unspecified');
    expect(evaluate({ ...complete, sex, kind: '', stage: '3' }).clinical.code).toBe('ambiguous_puberty_kind');
  });

  it('Ax nie otrzymuje skali stadium nawet przy pozostałej w DOM wartości 4', () => {
    expect(UI.buildInput({ ...complete, kind: 'Ax', stage: '4' }, result).puberty.stage).toBeNull();
    expect(evaluate({ ...complete, kind: 'Ax', stage: '4' }).clinical.code).toBe('missing_puberty_assessment');
  });

  it.each([false, undefined, 'true'])('profil i metoda bez jawnego checkboxa %s nie potwierdzają metody', (methodConfirmed) => {
    const output = evaluate({ ...complete, methodConfirmed });
    expect(output.biochemical.primary).toBeNull();
    expect(output.biochemical.reasonCodes).toContain('method_not_confirmed');
    expect(output.clinical.code).toBe('early_development');
  });

  it.each(['gnrha', 'sexSteroids'])('brak odpowiedzi %s nie oznacza braku leczenia', (key) => {
    const output = evaluate({ ...complete, [key]: '' });
    expect(output.biochemical.reasonCodes).toContain('treatment_context_unknown');
    expect(output.clinical.code).toBe('early_development');
  });

  it('M6 / G4 / LH2 ma odrębną ocenę wieku, stadium i rozwoju', () => {
    const output = evaluate(complete);
    expect(output.biochemical.byAge.status).toBe('above');
    expect(output.biochemical.byStage.status).toBe('within');
    expect(output.clinical.code).toBe('early_development');
    expect(output.summary.status).toBe('attention');
  });

  it('M6 / G4 / FSH2 nie staje się wysokim FSH przez alarm rozwoju', () => {
    const output = evaluate({ ...complete, profile: 'mayo-fsh-pediatric', method: 'roche-elecsys-fsh-eclia' }, { ...result, analyte: 'fsh' });
    expect(output.biochemical.byAge.status).toBe('within');
    expect(output.biochemical.byStage.status).toBe('within');
    expect(output.clinical.code).toBe('early_development');
  });

  it.each(['<0,02', '<LOD', '<LOQ', '>10', '≤0,02', '≥10'])('zachowuje operator %s w silniku i snapshotcie', (raw) => {
    const output = evaluate(complete, { ...result, raw });
    expect(output.measurement.raw).toBe(raw);
    expect(output.measurement.status).toBe('valid');
    expect(output.measurement.plotValue).toBeNull();
    expect(output.clinical.code).toBe('early_development');
    expect(win.VildaLabSnapshot.create(output).evaluation.measurement.raw).toBe(raw);
  });

  it.each(['', 'błąd', '-1'])('ostrzeżenie rozwoju nie znika przy niepoprawnym wyniku %s', (raw) => {
    const output = evaluate(complete, { ...result, raw });
    expect(output.measurement.status).toBe('invalid');
    expect(output.clinical.code).toBe('early_development');
    expect(output.summary.status).toBe('attention');
  });

  it('późniejsza obserwacja nie jest cofana do próbki przez checkbox', () => {
    const output = evaluate({ ...complete, assessedAt: '2026-10-04', appliesToSample: true });
    expect(output.biochemical.byStage.reasonCodes).toContain('puberty_not_confirmed_at_sample');
    expect(output.clinical.code).toBe('missing_puberty_assessment');
  });

  it('zachowuje pełny wywiad, datowanie objętości i kontekst wcześniactwa', () => {
    const input = UI.buildInput({ ...complete, progression: 'yes', growthAcceleration: 'no', cnsSymptoms: 'yes', regression: 'unknown',
      testicularVolume: '4,5', volumeMethod: 'Prader', volumeAssessedAt: '2026-10-03', volumeAppliesToSample: true,
      onsetKind: 'G', onsetAgeYears: '5', onsetAgeMonths: '6', onsetConfirmed: true,
      preterm: 'yes', gestationalWeeks: '35.5' }, result);
    expect(input.history).toEqual({ progression: 'yes', growthAcceleration: 'no', cnsSymptoms: 'yes', regression: 'unknown' });
    expect(input.testicularVolume).toEqual({ value: 4.5, unit: 'mL', method: 'Prader', assessedAtISO: '2026-10-03', appliesToSample: true });
    expect(input.onset.age).toEqual({ years: 5, months: 6, days: null, precision: 'month' });
    expect(input.preterm).toBe('yes'); expect(input.gestationalAgeWeeks).toBe(35.5);
  });

  it('jawny lokalny zakres zachowuje źródło, metodę, populację i otwarty operator', () => {
    const fields = { ...complete, localEnabled: true, localId: 'synthetic-local', localVersion: '1',
      localSourceId: 'synthetic-source', localSourceLabel: 'Fikcyjny dokument laboratoryjny', localSourceVersion: '2026',
      localPopulation: 'Fikcyjna populacja testowa', localMethod: 'anshlite-lh-clia', localUnit: 'IU/L',
      localLowerOperator: '>=', localLowerValue: '1', localUpperOperator: '<', localUpperValue: '3',
      localSourceText: '1 ≤ wynik < 3', localConfirmed: true };
    const input = UI.buildInput(fields, result);
    expect(input.localReference.range.upper).toEqual({ operator: '<', value: 3 });
    expect(input.localReference.source.version).toBe('2026');
    expect(evaluate(fields).biochemical.local.status).toBe('within');
    expect(evaluate(fields, { ...result, raw: '3' }).biochemical.local.status).toBe('above');
    expect(evaluate({ ...fields, localConfirmed: false }).biochemical.local.status).toBe('unavailable');
  });

  it('dodatkowe identyfikatory/HTML formularza nie przenikają do wejścia ani snapshotu', () => {
    const input = UI.buildInput({ ...complete, patientId: 'fictional-secret', html: '<p>test</p>', dom: {} }, { ...result, patientId: 'fictional-secret' });
    expect(input).not.toHaveProperty('patientId'); expect(input).not.toHaveProperty('html'); expect(input).not.toHaveProperty('dom');
    expect(JSON.stringify(win.VildaLabSnapshot.create(win.VildaLabPuberty.evaluate(input, win.VildaLabPubertyData)))).not.toContain('fictional-secret');
  });

  it.each(['www.example.invalid', 'javascript:alert(1)', 'https://', 'https:example.invalid', 'https:/example.invalid'])('pomija niepoprawny opcjonalny adres źródła %s bez utraty reszty metadanych', (url) => {
    const input = UI.buildInput({ ...complete, localEnabled: true, localSourceUrl: url, localSourceLabel: 'Fikcyjne laboratorium' }, result);
    expect(input.localReference.source).toMatchObject({ label: 'Fikcyjne laboratorium', url: '' });
    const saved = win.VildaLabSnapshot.create(win.VildaLabPuberty.evaluate(input, win.VildaLabPubertyData));
    expect(saved.status).toBe('recorded');
  });
});
