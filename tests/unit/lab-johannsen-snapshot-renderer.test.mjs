import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_puberty.js');
const data = require('../../vilda_lab_puberty_data.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const ui = require('../../vilda_lab_assessment_ui.js');
const legacy = require('../fixtures/lab-johannsen-legacy-mayo.json');
const days = (value, source = 'main-calendar-dates') => ({ lower: value - 1, upper: value, source });
const term = { lower: 280, upper: 280, source: 'patient-record' };
const neonatal = (value = 90, gestation = term) => ({ postnatalDays: days(value), gestationalDays: gestation });
function evaluate(overrides = {}) {
  return engine.evaluate({ analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M', age: null,
    contextBasis: 'current-patient', referenceSelection: 'automatic', specimen: 'unknown', measurementKind: 'unknown',
    assay: { confirmation: 'unknown' }, preterm: 'no', neonatalAge: neonatal(),
    treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' }, ...overrides }, data);
}
function documentDouble() {
  const doc = { createElement: (tag) => new Element(tag) };
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.ownerDocument = doc; this._text = ''; }
    set textContent(value) { this.children = []; this._text = String(value); }
    get textContent() { return this._text + this.children.map((child) => child.textContent).join(' '); }
    set innerHTML(_) { throw new Error('HTML assignment is forbidden'); }
    get firstChild() { return this.children[0] || null; }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children = this.children.filter((value) => value !== child); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
  }
  return doc;
}
function descendants(element, predicate) {
  return element.children.flatMap((child) => [...(predicate(child) ? [child] : []), ...descendants(child, predicate)]);
}
function visibleText(element) { return element.tagName === 'details' ? '' : element._text + ' ' + element.children.map(visibleText).join(' '); }
function render(evaluation, historical = false) {
  const container = documentDouble().createElement('main');
  if (historical) ui.renderAssessment(container, snapshot.normalize(JSON.parse(JSON.stringify(snapshot.create(evaluation)))));
  else ui.renderEvaluation(container, evaluation, { live: true });
  return container;
}

describe('Johannsen — osie zgodne z zatwierdzoną makietą', () => {
  it.each([false, true])('jedna grupa wieku ma etykietę w miesiącach i krótkie źródło; historia=%s', (historical) => {
    const result = evaluate(), container = render(result, historical), view = ui.buildView(result);
    expect(result.referenceSelection.profileIds).toEqual(['johannsen-minipuberty-lh']);
    expect(view.pretermProfile).toBe(false);
    const axes = descendants(container, (node) => node.getAttribute('role') === 'img');
    expect(axes).toHaveLength(1);
    expect(axes[0].getAttribute('aria-label')).toContain('Minipuberty · 2–<3,5 mies.');
    expect(visibleText(container)).toContain('Minipuberty · 2–<3,5 mies.');
    expect(visibleText(container)).toContain('Zakres referencyjny: 0,62–4,08 IU/L');
    expect(visibleText(container)).toContain('Johannsen 2018 · AutoDELFIA · porównanie orientacyjne.');
    expect(container.textContent).not.toMatch(/Szeroki zakres niemowlęcy|Dla wcześniaka|0,16666|0,29166/);
    expect(result.provenance).not.toHaveProperty('eligibilityPolicyId');
  });
  it('późniejsza grupa nie pokazuje pierwszego zakresu', () => {
    const container = render(evaluate({ neonatalAge: neonatal(120) }));
    expect(visibleText(container)).toContain('Minipuberty · 3,5–5 mies.');
    expect(visibleText(container)).toContain('Zakres referencyjny: 0,54–3,32 IU/L');
    expect(visibleText(container)).not.toContain('4,08');
  });
  it.each([['3.6', ['within', 'above']], ['10', ['above', 'above']], ['0.1', ['below', 'below']]])('ukończone 3 miesiące, LH=%s: dwie niezależne osie bez wspólnej klasyfikacji', (value, statuses) => {
    const evaluation = evaluate({ value, age: { years: 0, months: 3, precision: 'month' }, neonatalAge: { postnatalDays: null, gestationalDays: term } });
    const view = ui.buildView(evaluation), container = render(evaluation, true);
    expect(view.ageReferenceVariantMode).toBe(true);
    expect(view.ageVariantConsensus).toBeNull();
    expect(view.result.visualState).toBe('');
    expect(view.result.visualAlert).toBeNull();
    const variants = descendants(container, (node) => node.getAttribute('data-comparison') === 'variant');
    expect(variants.map((node) => node.getAttribute('data-status'))).toEqual(statuses);
    expect(variants[0].textContent).toContain('Dla wieku 2–<3,5 mies.');
    expect(variants[1].textContent).toContain('Dla wieku 3,5–5 mies.');
    const axes = descendants(container, (node) => node.getAttribute('role') === 'img');
    expect(axes).toHaveLength(2);
    expect(axes[0].getAttribute('data-axis-max')).toBe(axes[1].getAttribute('data-axis-max'));
    expect(visibleText(container)).toContain('Podany wiek obejmuje dwie grupy badania');
    expect(visibleText(container)).not.toContain('w całym podanym przedziale wieku');
  });
  it.each(['0.02', '<0.05'])('dziewczynka LH %s: dolna granica oznaczalności nie staje się normą', (value) => {
    const evaluation = evaluate({ sex: 'F', value }), view = ui.buildView(evaluation), container = render(evaluation, true);
    const comparison = view.comparisons.find((item) => item.key === 'age');
    expect(comparison).toMatchObject({ status: 'within', visualLabel: 'Nie przekracza górnej granicy', axis: { lower: null, upper: 0.98, value: value.startsWith('<') ? null : 0.02 } });
    expect(evaluation.referencePreview.byAge.range.bounds.censoredLower).toMatchObject({ operator: '<', value: 0.05 });
    expect(visibleText(container)).toContain('Górna granica: ≤0,98 IU/L');
    expect(visibleText(container)).toContain('nie pozwalają ocenić, czy wynik jest za niski');
    expect(visibleText(container)).not.toContain('dolna granica oznaczalności');
    expect(container.textContent).toContain('minimum fizjologicznym');
    expect(descendants(container, (node) => (node.className || '').includes('vilda-lab-axis-marker'))).toHaveLength(value.startsWith('<') ? 0 : 1);
  });
  it('FSH dziewczynki zachowuje ocenę dolnej granicy', () => {
    const view = ui.buildView(evaluate({ analyte: 'fsh', sex: 'F', value: '0.5' }));
    expect(view.comparisons.find((item) => item.key === 'age')).toMatchObject({ status: 'below', axis: { lower: 1.23, upper: 17.4 } });
    expect(view.upperOnlyNote).toBe('');
  });
  it.each([false, true])('nieznany wiek ciążowy przy wcześniactwie „nie” ma pojedynczą notkę; historia=%s', (historical) => {
    const evaluation = evaluate({ neonatalAge: neonatal(90, null) }), container = render(evaluation, historical);
    expect(evaluation.input.neonatalAge.gestationalDays).toBeNull();
    expect(evaluation.input.gestationalAgeWeeks).toBeNull();
    expect(evaluation.referenceAge.gestationStatus).toBe('conditional');
    expect(descendants(container, (node) => node.getAttribute('data-reference-population') === 'true')).toHaveLength(1);
    expect(visibleText(container)).toContain('Zakres dla urodzonych w 37+0–41+6 tyg. ciąży.');
  });
  it('potwierdzony wiek ciążowy nie otrzymuje notki o warunkowym donoszeniu', () => {
    expect(ui.buildView(evaluate()).populationNote).toBe('');
  });
  it('wiek 5 ukończonych miesięcy pozostawia zakres Mayo i wyjaśnia granicę Johannsen', () => {
    const evaluation = evaluate({ age: { years: 0, months: 5, precision: 'month' }, neonatalAge: { postnatalDays: null, gestationalDays: term } });
    const container = render(evaluation, true), view = ui.buildView(evaluation);
    expect(evaluation.referenceSelection.profileIds).toEqual(['mayo-lh-pediatric']);
    expect(view.johannsenProfile).toBe(false);
    expect(view.comparisons.find((item) => item.key === 'age').axis.upper).toBe(5);
    expect(descendants(container, (node) => node.getAttribute('data-reference-fallback') === 'true')).toHaveLength(1);
    expect(visibleText(container)).toContain('Pokazano szerszy zakres Mayo; podany wiek wykracza poza szczegółowe dane minipuberty.');
    expect(visibleText(container)).toContain('Mayo');
  });
});

describe('Johannsen — zapis i odczyt bez aktualizowania dawnych ocen', () => {
  it('nieznane źródło dni zachowuje Mayo i zapisuje nieustaloną kwalifikację bez wymyślonych granic', () => {
    const evaluation = evaluate({ neonatalAge: { postnatalDays: days(90, 'legacy-day-source'), gestationalDays: term } });
    expect(evaluation.referenceSelection.profileIds).toEqual(['mayo-lh-pediatric']);
    expect(evaluation.referenceAge).toMatchObject({ status: 'unknown', lowerMonths: null, upperMonths: null, source: 'legacy-day-source' });
    expect(evaluation.limitations).toContain('johannsen_day_source_unrecognized');
    const saved = snapshot.create(evaluation);
    expect(saved.status).toBe('recorded');
    expect(snapshot.normalize(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(saved.evaluation.referenceAge).toEqual(evaluation.referenceAge);
    const container = render(evaluation, true);
    expect(container.textContent).toContain('Nie ustalono sposobu zapisu wieku w dniach');
    expect(container.textContent).not.toContain('dodatkowe ograniczenie, którego ta wersja widoku nie opisuje');
    expect(visibleText(container)).not.toContain('Nie ustalono sposobu zapisu wieku w dniach');
    expect(descendants(container, (node) => node.getAttribute('data-reference-fallback') === 'true')).toHaveLength(0);
    expect(ui.buildView(evaluation).comparisons.find((item) => item.key === 'age').axis.upper).toBe(5);
  });
  it.each([
    {}, { neonatalAge: neonatal(90, null) },
    { age: { years: 0, months: 3, precision: 'month' }, neonatalAge: { postnatalDays: null, gestationalDays: term } },
    { age: { years: 0, months: 5, precision: 'month' }, neonatalAge: { postnatalDays: null, gestationalDays: term } },
  ])('zachowuje referencyjny wiek, źródło, zakres i politykę przez JSON: %j', (overrides) => {
    const evaluation = evaluate(overrides), saved = snapshot.create(evaluation);
    expect(saved.status).toBe('recorded');
    const restored = snapshot.normalize(JSON.parse(JSON.stringify(saved)));
    expect(restored).toEqual(saved);
    expect(restored.evaluation.referenceAge).toEqual(evaluation.referenceAge);
    expect(restored.evaluation.referencePreview).toEqual(evaluation.referencePreview);
    expect(restored.evaluation.ageAtSample).toEqual(evaluation.ageAtSample);
    expect(restored.evaluation.input).toEqual(evaluation.input);
  });
  it.each([
    (value) => { delete value.policyVersion; },
    (value) => { value.status = 'assumed'; },
    (value) => { value.gestationStatus = 'assumed'; },
    (value) => { value.lowerMonths = -1; },
    (value) => { value.upperMonths = value.lowerMonths - 1; },
    (value) => { value.lowerMonths = null; },
    (value) => { value.upperInclusive = 'yes'; },
  ])('odrzuca uszkodzone metadane wieku, nie naprawiając ich dzisiejszą polityką', (mutate) => {
    const saved = snapshot.create(evaluate());
    expect(saved.status).toBe('recorded');
    mutate(saved.evaluation.referenceAge);
    expect(snapshot.normalize(saved).status).toBe('unavailable');
  });
  it('nie dopuszcza jednego wariantu jako zapisu dwóch grup', () => {
    const saved = snapshot.create(evaluate({ age: { years: 0, months: 3, precision: 'month' }, neonatalAge: { postnatalDays: null, gestationalDays: term } }));
    expect(saved.status).toBe('recorded');
    saved.evaluation.referencePreview.variants.length = 1;
    expect(snapshot.normalize(saved).status).toBe('unavailable');
  });
  it('rzeczywisty zapis z bazy caf10f29 pozostaje Mayo, choć nowa ocena tego wieku wybiera Johannsen', () => {
    const original = JSON.stringify(legacy.assessment);
    const spy = vi.fn(() => { throw new Error('History must not recalculate'); });
    const browser = { VildaLabPuberty: { evaluate: spy } };
    loadBrowserScript('vilda_lab_snapshot.js', browser);
    loadBrowserScript('vilda_lab_assessment_ui.js', browser);
    const restored = browser.VildaLabSnapshot.normalize(legacy.assessment);
    expect(restored).toEqual(legacy.assessment);
    expect(restored.evaluation).not.toHaveProperty('referenceAge');
    const container = documentDouble().createElement('main');
    browser.VildaLabAssessmentUI.renderAssessment(container, restored);
    const view = browser.VildaLabAssessmentUI.buildView(restored.evaluation);
    expect(view.comparisons.find((item) => item.key === 'age')).toMatchObject({ status: 'within', axis: { lower: null, upper: 3.3 } });
    expect(visibleText(container)).toContain('Nie przekracza górnej granicy');
    expect(visibleText(container)).not.toContain('Johannsen');
    const current = engine.evaluate(restored.evaluation.input, data);
    expect(current.referenceSelection.profileIds).toEqual(['johannsen-minipuberty-fsh']);
    expect(current.referencePreview.variants.map((item) => item.comparison.status)).toEqual(['below', 'below']);
    expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(legacy.assessment)).toBe(original);
  });
});
