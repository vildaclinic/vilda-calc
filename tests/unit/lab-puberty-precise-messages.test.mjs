import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_puberty.js');
const data = require('../../vilda_lab_puberty_data.js');
const ui = require('../../vilda_lab_assessment_ui.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const inclusive = 'Nie przekracza górnej granicy';
const exclusive = 'Poniżej górnej granicy';
const g1Title = 'Brak aktualnych cech dojrzewania w tym wieku wymaga oceny klinicznej.';
const oldTitle = 'Brak cech wymaga uwzględnienia wywiadu';
const note = 'Zakresy z samą górną granicą nie pozwalają ocenić, czy wynik jest za niski.';
const age = (years, months = 0) => ({ years, months, precision: 'month' });
const puberty = (stage = 1, kind = 'G') => ({ kind, stage, appliesToCurrentContext: true, source: 'current-patient' });
const noTreatment = { context: 'none', gnrha: 'no', sexSteroids: 'no' };
function evaluate(overrides = {}, reference = data) {
  return engine.evaluate({ analyte: 'fsh', value: '0.1', unit: 'IU/L', sex: 'M', age: age(0, 3),
    contextBasis: 'current-patient', referenceSelection: 'automatic', specimen: 'unknown', measurementKind: 'unknown',
    assay: { confirmation: 'unknown' }, preterm: 'no', puberty: {},
    treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' }, ...overrides }, reference);
}
const row = (evaluation, key = 'age') => ui.buildView(evaluation).comparisons.find((item) => item.key === key);
const adolescent = (overrides = {}, reference = data) => evaluate({ age: age(14), value: '1', puberty: puberty(), ...overrides }, reference);

describe('LH/FSH — dokładne znaczenie jednostronnego zakresu', () => {
  it.each([['lh', '0.01', 5], ['fsh', '0.1', 3.3], ['fsh', '3.3', 3.3], ['lh', '0', 5]])('%s %s nie oznacza oceny dolnego minimum', (analyte, value, upper) => {
    const result = evaluate({ analyte, value });
    const original = JSON.stringify(result);
    expect(row(result)).toMatchObject({ status: 'within', visualLabel: inclusive, label: inclusive + ' — orientacyjnie', axis: { lower: null, upper, value: Number(value) } });
    expect(ui.buildView(result).upperOnlyNote).toBe(note);
    expect(JSON.stringify(result)).toBe(original);
  });
  it.each([['<0.02', 'within', inclusive], ['≤3.3', 'within', inclusive], ['<LOD', 'indeterminate', 'Porównanie niejednoznaczne'], ['≥3.3', 'indeterminate', 'Porównanie niejednoznaczne'], ['3.31', 'above', 'Powyżej zakresu']])('FSH %s zachowuje operator i status %s', (value, status, label) => {
    const result = evaluate({ value });
    expect(row(result)).toMatchObject({ status, visualLabel: label, axis: { lower: null, upper: 3.3, value: value === '3.31' ? 3.31 : null } });
    expect(Boolean(ui.buildView(result).upperOnlyNote)).toBe(status === 'within');
  });
  it.each([['1.49', 'within', exclusive], ['1.5', 'above', 'Powyżej zakresu']])('ścisła granica FSH G1: %s → %s', (value, status, label) => {
    const result = adolescent({ value });
    expect(row(result, 'stage')).toMatchObject({ status, visualLabel: label, axis: { lower: null, upper: 1.5 } });
    expect(row(result)).toMatchObject({ status: 'within', visualLabel: 'W zakresie', axis: { lower: 0.6, upper: 6.9 } });
  });
  it('dwie jednostronne osie nadal dają jedną krótką notkę', () => {
    const result = evaluate({ age: age(3), value: '0.1', puberty: puberty() });
    expect(row(result).visualLabel).toBe(inclusive);
    expect(row(result, 'stage').visualLabel).toBe(exclusive);
    expect(ui.buildView(result).upperOnlyNote).toBe(note);
  });
  it('rzeczywista dolna granica FSH niemowlęcia płci żeńskiej zachowuje ocenę niskiej wartości', () => {
    const result = evaluate({ sex: 'F', value: '0.1' });
    expect(row(result)).toMatchObject({ status: 'below', axis: { lower: 1.2, upper: 12.5 } });
    expect(ui.buildView(result).upperOnlyNote).toBe('');
  });
  it('brak interpretacji podczas znanego leczenia nie zyskuje etykiety ani notki', () => {
    const result = evaluate({ treatment: { context: 'hormonal' } });
    expect(row(result)).toMatchObject({ status: 'unavailable', axis: null });
    expect(ui.buildView(result).upperOnlyNote).toBe('');
  });
  it('uszkodzona zapisana granica nie otrzymuje nowej etykiety', () => {
    const result = evaluate();
    result.referencePreview.byAge.range.bounds.upper.operator = '>';
    expect(row(result).axis).toBeNull();
    expect(row(result).visualLabel).not.toBe(inclusive);
    expect(ui.buildView(result).upperOnlyNote).toBe('');
  });
});

describe('G1 — konkretna potrzeba oceny przy nieznanym leczeniu', () => {
  it.each([undefined, {}, { gnrha: 'no', sexSteroids: 'unknown' }, { context: 'unknown', gnrha: 'no', sexSteroids: 'no' }])('niepełny kontekst %j zachowuje limited i nie rozpoznaje opóźnienia', (treatment) => {
    const result = adolescent({ treatment });
    expect(result.clinical).toMatchObject({ status: 'limited', code: 'treatment_context', title: g1Title, reasonCodes: ['treatment_or_previous_onset_context'] });
    expect(result.clinical.text).toContain('Nie rozpoznajemy nowego opóźnienia');
    expect(row(result)).toMatchObject({ status: 'within', visualLabel: 'W zakresie' });
  });
  it.each([{ context: 'hormonal' }, { gnrha: 'yes' }, { sexSteroids: 'yes' }])('znane leczenie %j zachowuje dotychczasowy komunikat', (treatment) => {
    expect(adolescent({ treatment }).clinical).toMatchObject({ status: 'limited', code: 'treatment_context', title: oldTitle });
  });
  it.each([{ history: { regression: 'yes' } }, { onset: { kind: 'G', age: age(12) } }])('wywiad %j nie jest zamieniany w nowy brak początku', (overrides) => {
    expect(adolescent(overrides).clinical).toMatchObject({ status: 'limited', code: 'treatment_context', title: oldTitle });
  });
  it.each([{ age: age(13, 11) }, { puberty: puberty(2) }, { puberty: {} }, { puberty: { kind: 'G', stage: 1 } }, { sex: 'F', puberty: puberty(1, 'Th') }])('brak kwalifikacji %j nie otrzymuje nowego tekstu', (overrides) => {
    expect(adolescent(overrides).clinical.title).not.toBe(g1Title);
  });
  it('potwierdzony brak leczenia zachowuje istniejące ostrzeżenie o braku początku', () => {
    expect(adolescent({ treatment: noTreatment }).clinical).toMatchObject({ status: 'warning', code: 'absent_onset' });
  });
  it('wiek pochodzi z profilu kryteriów, bez zaszytego w tekście progu 14', () => {
    const reference = JSON.parse(JSON.stringify(data));
    reference.clinicalProfile.absentOnsetAgeYears.M.value = 15;
    expect(adolescent({}, reference).clinical.title).not.toBe(g1Title);
    expect(adolescent({ age: age(15) }, reference).clinical.title).toBe(g1Title);
  });
  it('historia zachowuje stary tekst kliniczny i zapisane zakresy bez ponownego liczenia', () => {
    const old = adolescent();
    old.engineVersion = '1.5.0';
    old.clinical.title = oldTitle;
    const recorded = JSON.parse(JSON.stringify(snapshot.create(old)));
    expect(recorded.status).toBe('recorded');
    const original = JSON.stringify(recorded);
    const spy = vi.fn(() => { throw new Error('History must not recalculate'); });
    const browser = { VildaLabPuberty: { evaluate: spy } };
    loadBrowserScript('vilda_lab_snapshot.js', browser);
    loadBrowserScript('vilda_lab_assessment_ui.js', browser);
    const view = browser.VildaLabAssessmentUI.buildView(browser.VildaLabSnapshot.normalize(recorded).evaluation);
    expect(view.clinical).toMatchObject({ title: oldTitle, text: old.clinical.text, status: 'limited' });
    expect(view.comparisons.find((item) => item.key === 'stage').visualLabel).toBe(exclusive);
    expect(JSON.stringify(recorded)).toBe(original);
    expect(spy).not.toHaveBeenCalled();
  });
});
