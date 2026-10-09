import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_inhibin_b.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const renderer = require('../../vilda_lab_assessment_ui.js');
const lhEngine = require('../../vilda_lab_puberty.js');
const lhData = require('../../vilda_lab_puberty_data.js');
const inhibinData = require('../../vilda_lab_inhibin_b_data.js');

// Deliberately artificial mechanical fixtures. These are not clinical norms.
const bounds = (lower, upper, lo = '>=', hi = '<=') => ({ lower: lower === null ? null : { operator: lo, value: lower }, upper: upper === null ? null : { operator: hi, value: upper }, censoredLower: null, sourceText: 'Fikcyjne granice testowe' });
const age = (lower, upper) => ({ axis: 'chronologicalYears', ...bounds(lower, upper, '>=', '<'), sourceText: 'Fikcyjny przedział wieku' });
const row = (id, sex, extra = {}) => ({ id, sex, age: age(1, 120), bounds: bounds(101, 202), basis: 'age', ...extra });
const contexts = ['early_follicular', 'late_follicular', 'ovulation', 'mid_luteal', 'late_luteal', 'postmenopause'];
function fixture(rows = [row('male', 'M')], extra = {}) {
  return {
    dataVersion: 'fictional-1', sources: { fixture: { id: 'fixture', label: 'Fikcyjne źródło do testu transportu', url: 'https://example.org/transport-fixture', version: 'test-1' } },
    automaticReferencePolicy: { id: 'fictional-inhibin-policy', version: 'test-1', profileIds: ['fixture'], reproductiveContexts: ['unknown', 'follicular', 'luteal', ...contexts], reproductiveContextGroups: { follicular: ['early_follicular', 'late_follicular'], luteal: ['mid_luteal', 'late_luteal'] }, termGestationalDays: bounds(250, 290) },
    profiles: [{ id: 'fixture', version: 'test-1', active: true, analyte: 'inhibin_b', sourceId: 'fixture', material: 'serum', unit: 'pg/mL', method: { id: 'fixture-method', name: 'Fikcyjna metoda' }, population: { label: 'Wyłącznie fikcyjna populacja testowa' }, scope: { age: age(0, 120) }, rows, applicabilityText: 'Zakres zastosowania z fikcyjnego profilu, bez odtwarzania bieżących danych.', ...extra }],
  };
}
function evaluate(overrides = {}, data = fixture()) {
  return engine.evaluate({ analyte: 'inhibin_b', value: '150', unit: 'pg/mL', sex: 'M', age: { years: 8, precision: 'year' }, contextBasis: 'current-patient', referenceSelection: 'automatic', reproductiveContext: 'unknown', specimen: 'unknown', measurementKind: 'unknown', assay: { confirmation: 'unknown' }, ...overrides }, data);
}
function femaleFixture() { return fixture(contexts.map((context) => row(context, 'F', { basis: 'adult', age: age(18, 120), reproductiveContext: context, label: context }))); }
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
function descendants(element, predicate) { return element.children.flatMap((child) => [...(predicate(child) ? [child] : []), ...descendants(child, predicate)]); }
function visibleText(element) { return element.tagName === 'details' ? '' : element._text + ' ' + element.children.map(visibleText).join(' '); }
function render(evaluation, historical = false) {
  const container = documentDouble().createElement('main');
  if (historical) renderer.renderAssessment(container, JSON.parse(JSON.stringify(snapshot.create(evaluation))));
  else renderer.renderEvaluation(container, evaluation, { live: true });
  return container;
}

describe('Inhibina B — zapis referencyjnego wyniku bez zależności od silnika LH/FSH', () => {
  it.each(['pg/mL', 'ng/L'])('przenosi %s przez przypięcie, serię i historię z kanoniczną jednostką oraz surowym zapisem', (unit) => {
    const evaluation = evaluate({ unit, value: '150,25' });
    const lab = { testKey: 'inhibin_b', test: 'Inhibina B', value: '150,25', valueNum: 150.25, unit, norm: '', clinicalDateISO: '2026-10-09' };
    const assessment = snapshot.create(evaluation, lab);
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.measurement).toMatchObject({ raw: '150,25', sourceUnit: unit, unit: 'pg/mL', value: 150.25 });
    expect(assessment.evaluation.input).toMatchObject({ specimen: 'unknown', assay: { confirmation: 'unknown', methodId: '' } });
    expect(assessment.evaluation.referencePreview.byAge.range).toMatchObject({ unit: 'pg/mL', material: 'serum', method: { id: 'fixture-method' } });
    expect(assessment.evaluation.referencePreview.applicabilityText).toBe(fixture().profiles[0].applicabilityText);
    expect(assessment.evaluation.biochemical).toMatchObject({ status: 'unavailable', primary: null });
    expect(snapshot.forSeries(JSON.parse(JSON.stringify({ ...lab, assessment })), lab.clinicalDateISO)).toEqual({ assessment, valueNum: 150.25, plotValue: 150.25 });
    expect(snapshot.normalize(JSON.parse(JSON.stringify(assessment)))).toEqual(assessment);
  });

  it.each(['<100', '≤100', '>200', '≥200', '<LOD', '<LOQ'])('zapis %s nie otrzymuje dokładnego punktu trendu ani osi', (value) => {
    const evaluation = evaluate({ value, unit: 'ng/L' });
    const lab = { testKey: 'inhibin_b', value, unit: 'ng/L', assessment: snapshot.create(evaluation) };
    expect(lab.assessment.status).toBe('recorded');
    expect(snapshot.forSeries(lab, null)).toMatchObject({ valueNum: null, plotValue: null });
    expect(renderer.buildView(evaluation).comparisons.find((comparison) => comparison.key === 'age').axis.value).toBeNull();
  });

  it.each([
    ['jednostka aktywności na wejściu', (e) => { e.input.unit = 'IU/L'; e.measurement.sourceUnit = 'IU/L'; }],
    ['jednostka aktywności kanoniczna', (e) => { e.measurement.unit = 'IU/L'; }],
    ['jednostka aktywności zakresu', (e) => { e.referencePreview.byAge.range.unit = 'IU/L'; }],
    ['zamiana analitu na LH', (e) => { e.analyte = 'lh'; e.input.analyte = 'lh'; }],
    ['fałszywa klasyfikacja potwierdzona', (e) => { e.biochemical.status = 'available'; e.biochemical.primary = 'age'; e.biochemical.byAge = e.referencePreview.byAge; }],
    ['fałszywa rzeczywista metoda', (e) => { e.input.assay.confirmation = 'reported'; e.input.assay.methodId = 'other'; e.referencePreview.reasonCodes = e.referencePreview.reasonCodes.filter((code) => code !== 'source_method_unconfirmed'); }],
    ['nieznany schemat', (e) => { e.schemaVersion = 2; }],
  ])('odrzuca uszkodzone lub niezgodne dane: %s', (_label, mutate) => {
    const assessment = snapshot.create(evaluate());
    mutate(assessment.evaluation);
    expect(snapshot.normalize(assessment).status).toBe('unavailable');
  });

  it.each([
    ['unknown', contexts], ['follicular', ['early_follicular', 'late_follicular']], ['luteal', ['mid_luteal', 'late_luteal']],
  ])('zachowuje szczegółowe alternatywy dla kontekstu %s', (context, expected) => {
    const assessment = snapshot.create(evaluate({ sex: 'F', age: { years: 35, precision: 'year' }, reproductiveContext: context }, femaleFixture()));
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.referenceSelection.status).toBe('variants');
    expect(assessment.evaluation.referencePreview.variants.map((variant) => variant.reproductiveContext)).toEqual(expected);
    expect(snapshot.normalize(JSON.parse(JSON.stringify(assessment)))).toEqual(assessment);
  });

  it('nie rozszerza enum faz dla LH przez dodanie szczegółowych faz inhibiny', () => {
    const evaluation = lhEngine.evaluate({ analyte: 'lh', value: '2', unit: 'IU/L', sex: 'F', age: { years: 30, precision: 'year' }, referenceSelection: 'automatic', reproductiveContext: 'follicular' }, lhData);
    const assessment = snapshot.create(evaluation);
    expect(assessment.status).toBe('recorded');
    assessment.evaluation.input.reproductiveContext = 'early_follicular';
    expect(snapshot.normalize(assessment).status).toBe('unavailable');
  });

  it('starszy snapshot LH nie dostaje nowego pola applicabilityText ani nowej jednostki', () => {
    const old = snapshot.create(lhEngine.evaluate({ analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M', age: { years: 8, precision: 'year' }, referenceSelection: 'automatic' }, lhData));
    expect(old.status).toBe('recorded');
    expect(old.evaluation.referencePreview).not.toHaveProperty('applicabilityText');
    expect(snapshot.normalize(JSON.parse(JSON.stringify(old)))).toEqual(old);
    expect(old.evaluation.measurement.unit).toBe('IU/L');
  });

  it('zmiana wyniku unieważnia ocenę inhibiny, nie odtwarza jej z bieżącego profilu', () => {
    const previous = { testKey: 'inhibin_b', test: 'Inhibina B', value: '150', unit: 'pg/mL', valueNum: 150, assessment: snapshot.create(evaluate()) };
    const bound = snapshot.reconcile(null, previous, null, '2026-10-09');
    const changed = snapshot.reconcile(bound, { ...bound, value: '170', valueNum: 170 }, '2026-10-09', '2026-10-09');
    expect(changed.assessment.status).toBe('invalidated');
    expect(changed.assessment.evaluation.measurement.raw).toBe('150');
  });
});

describe('Inhibina B — wspólne osie bez diagnostyki LH/FSH', () => {
  it('pokazuje właściwą nazwę, jednostkę osi i źródłową notkę, bez karty dojrzewania', () => {
    const evaluation = evaluate({ unit: 'ng/L' });
    const view = renderer.buildView(evaluation), container = render(evaluation);
    expect(view.analyte).toBe('Inhibina B');
    expect(view.comparisons[0].axis.unit).toBe('pg/mL');
    const axes = descendants(container, (node) => node.getAttribute('role') === 'img');
    expect(axes).toHaveLength(1);
    expect(axes[0].getAttribute('aria-label')).toContain('pg/mL');
    expect(visibleText(container)).toContain('150 ng/L');
    expect(visibleText(container)).toContain(fixture().profiles[0].applicabilityText);
    expect(container.textContent).not.toMatch(/Rozwój płciowy|CPP|GnRHa|metoda próbki niepotwierdzona|IU\/L|Wersja|Silnik:/);
    expect(descendants(container, (node) => node.getAttribute('aria-label') === 'Ocena inhibiny B')).toHaveLength(1);
  });

  it.each([
    ['adult', { years: 35, precision: 'year' }, 'Dla mężczyzn'],
    ['infant', { years: 0, months: 4, precision: 'month' }, 'Dla wieku'],
    ['infant-broad', { years: 0, months: 4, precision: 'month' }, 'Ogólny zakres dla niemowląt'],
    ['infant-curve', { years: 0, months: 4, precision: 'month' }, 'Minipuberty'],
  ])('etykieta %s wynika z zapisanego basis, nie ze znanego ID profilu', (basis, patientAge, expected) => {
    const evaluation = evaluate({ age: patientAge }, fixture([row('example', 'M', { age: age(0, 120), basis })]));
    expect(evaluation.referencePreview.byAge.range.basis).toBe(basis);
    expect(visibleText(render(evaluation))).toContain(expected);
    expect(visibleText(render(evaluation, true))).toContain(expected);
  });

  it.each([false, true])('tylko górna granica, censoredLower=%s: brak normy funkcji gonad i dolnego progu zero', (censored) => {
    const data = fixture([row('upper', 'M', { bounds: { ...bounds(null, 202), censoredLower: censored ? { operator: '<', value: 5 } : null } })]);
    const evaluation = evaluate({ value: '0' }, data), view = renderer.buildView(evaluation), container = render(evaluation);
    expect(snapshot.create(evaluation).status).toBe('recorded');
    expect(view.comparisons[0]).toMatchObject({ visualLabel: 'Nie przekracza górnej granicy', axis: { lower: null, upper: 202 } });
    expect(view.result.visualAlert).toBeNull();
    expect(view.upperOnlyNote).toBe('');
    expect(visibleText(container)).toContain('Nie przekracza górnej granicy');
    expect(visibleText(container)).not.toMatch(/W zakresie|Prawidł|poniżej zakresu/i);
    const axis = descendants(container, (node) => node.getAttribute('role') === 'img')[0];
    expect(axis.getAttribute('data-range-lower')).toBe('unknown');
  });

  it('znaczne odchylenie zachowuje marker, wykrzyknik i regułę wizualną zakresu referencyjnego', () => {
    const evaluation = evaluate({ value: '500' });
    const container = render(evaluation), view = renderer.buildView(evaluation);
    expect(view.result.visualAlert.label).toBe('Uwaga — znacznie powyżej zakresu referencyjnego');
    expect(descendants(container, (node) => (node.className || '').includes('vilda-lab-axis-marker above is-uwaga-high'))).toHaveLength(1);
    expect(descendants(container, (node) => node.className === 'vilda-lab-status-icon')[0].textContent).toBe('!');
  });

  it('alternatywne fazy są nazwane po polsku bez globalnego koloru lub werdyktu', () => {
    const evaluation = evaluate({ sex: 'F', age: { years: 35, precision: 'year' }, value: '500' }, femaleFixture());
    const container = render(evaluation), view = renderer.buildView(evaluation);
    expect(view.result.visualState).toBe('');
    expect(view.result.visualAlert).toBeNull();
    expect(descendants(container, (node) => node.getAttribute('data-comparison') === 'variant')).toHaveLength(6);
    expect(visibleText(container)).toContain('Wczesna faza folikularna');
    expect(visibleText(container)).toContain('Środkowa faza lutealna');
    expect(visibleText(container)).not.toMatch(/W zakresie|Powyżej|Poniżej|follicular|mid_luteal/);
  });

  it('brak stadium nie blokuje osi wieku, a syntetyczny zgodny zakres G3 tworzy niezależną oś', () => {
    const data = fixture([row('age', 'M'), row('stage', 'M', { basis: 'stage', stage: { kind: 'G', value: 3, sourceText: 'Fikcyjne G3' } })]);
    expect(descendants(render(evaluate({}, data)), (node) => node.getAttribute('role') === 'img')).toHaveLength(1);
    const evaluation = evaluate({ puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true } }, data);
    expect(snapshot.create(evaluation).status).toBe('recorded');
    expect(descendants(render(evaluation), (node) => node.getAttribute('role') === 'img')).toHaveLength(2);
    expect(visibleText(render(evaluation))).toContain('Dla stadium G3');
    expect(visibleText(render(evaluation))).not.toContain('Rozwój płciowy');
  });

  it('historia korzysta ze zapisanej notki i zakresu bez aktualnego zegara', () => {
    const evaluation = evaluate();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Historical presentation cannot read today'); });
    try {
      const container = render(evaluation, true);
      expect(visibleText(container)).toContain(fixture().profiles[0].applicabilityText);
      expect(clock).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });
});

describe('Inhibina B — rzeczywiste źródła przez zapis i prezentację', () => {
  function production(overrides = {}) {
    return evaluate({ age: { years: 40, precision: 'year' }, preterm: 'no', ...overrides }, inhibinData);
  }
  function neonatal(sex, days, extra = {}) {
    return production({ sex, age: null, neonatalAge: {
      postnatalDays: { lower: days, upper: days, source: 'manual-completed-days' },
      gestationalDays: { lower: 280, upper: 280, source: 'patient-record' },
    }, ...extra });
  }

  it('zapisuje męski zakres Labcorp 66,9–300 i metodę źródła, nie próbki', () => {
    const evaluation = production(), assessment = snapshot.create(evaluation);
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.referencePreview.byAge.range).toMatchObject({ basis: 'adult', unit: 'pg/mL', bounds: { lower: { value: 66.9, operator: '>=' }, upper: { value: 300, operator: '<=' } } });
    expect(assessment.evaluation.input).toMatchObject({ specimen: 'unknown', assay: { confirmation: 'unknown', methodId: '' } });
    expect(visibleText(render(evaluation, true))).toContain('Zakres: 66,9–300 pg/mL');
    expect(snapshot.normalize(JSON.parse(JSON.stringify(assessment)))).toEqual(assessment);
  });

  it('nie zaokrągla sześciu ścisłych progów kobiecych ani nie nadaje wspólnego werdyktu', () => {
    const evaluation = production({ sex: 'F', value: '999' }), assessment = snapshot.create(evaluation);
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.referencePreview.variants.map((variant) => variant.comparison.range.bounds.upper)).toEqual([261, 286, 189, 164, 107, 17].map((value) => ({ operator: '<', value })));
    const visible = visibleText(render(evaluation, true));
    for (const limit of [261, 286, 189, 164, 107, 17]) expect(visible).toContain('<' + limit + ' pg/mL');
    expect(visible).not.toMatch(/Powyżej|W zakresie|Poniżej|niepotwierdzona|Rozwój płciowy/);
    expect(renderer.buildView(evaluation).result.visualAlert).toBeNull();
  });

  it('krzywa 90 dni zachowuje pełną precyzję modelu i wyświetla jawną granicę przybliżoną', () => {
    const evaluation = neonatal('F', 90, { value: '80' }), assessment = snapshot.create(evaluation);
    expect(assessment.status).toBe('recorded');
    const range = assessment.evaluation.referencePreview.byAge.range;
    expect(range.basis).toBe('infant-curve');
    expect(range.bounds.lower).toBeNull();
    expect(range.bounds.upper.value).toBeCloseTo(145.8572546201232, 10);
    expect(range.source).toMatchObject({ doi: expect.any(String) });
    expect(range.age.sourceText).toBe('Model dla wieku 90 dni');
    expect(snapshot.normalize(JSON.parse(JSON.stringify(assessment)))).toEqual(assessment);
    const visible = visibleText(render(evaluation, true));
    expect(visible).toContain('Minipuberty');
    expect(visible).toContain('Górna granica modelu: ≈145,9 pg/mL');
    expect(visible).toContain('Nie przekracza górnej granicy');
    expect(visible).toContain('Źródło podaje tylko górną granicę — nie pozwala ocenić, czy wynik jest za niski.');
    expect(descendants(render(evaluation, true), (node) => node.getAttribute('data-upper-only-note') === 'true')).toHaveLength(1);
    expect(visible).not.toContain('145,857254620');
    expect(renderer.buildView(evaluation).comparisons[0].axis.upper).toBe(range.bounds.upper.value);
  });

  it.each(['M', 'F'])('niepewność wieku 3 miesięcy (%s) daje czytelne warianty bez sztucznej precyzji lat', (sex) => {
    const evaluation = production({ sex, age: { years: 0, months: 3, precision: 'month' } });
    expect(snapshot.create(evaluation).status).toBe('recorded');
    const visible = visibleText(render(evaluation));
    expect(visible).not.toMatch(/0,[0-9]{6}|0\.[0-9]{6}|nie można go zastosować/);
    if (sex === 'M') {
      expect(visible).toContain('Wiek ≥2 i <3,5 mies.');
      expect(visible).toContain('Wiek ≥3,5 i ≤5 mies.');
    } else {
      expect(visible).toContain('Najniższa górna granica dla podanego przedziału wieku');
      expect(visible).toContain('Najwyższa górna granica dla podanego przedziału wieku');
      expect(visible).toContain('Górna granica modelu: ≈');
      expect(descendants(render(evaluation), (node) => node.getAttribute('data-upper-only-note') === 'true')).toHaveLength(1);
    }
    expect(renderer.buildView(evaluation).result.visualAlert).toBeNull();
  });

  it('znane wcześniactwo daje konkretną lukę źródłową, bez prośby o znany kontekst urodzenia', () => {
    const evaluation = neonatal('M', 90, { preterm: 'yes' });
    expect(snapshot.create(evaluation).status).toBe('recorded');
    const container = render(evaluation, true);
    expect(visibleText(container)).toContain('Brak zweryfikowanego zakresu inhibiny B dla wcześniaków.');
    expect(container.textContent).not.toMatch(/potrzebna jest informacja o urodzeniu|Roche|Greaves|CPP/);
    expect(descendants(container, (node) => node.getAttribute('role') === 'img')).toHaveLength(0);
    expect(renderer.buildView(evaluation).conditionNote).toBe('');
  });

  it('dziewczynka w drugiej dobie nie dostaje normy pierwszego roku spoza zakresu modelu', () => {
    const evaluation = neonatal('F', 2);
    expect(snapshot.create(evaluation).status).toBe('recorded');
    expect(evaluation).not.toHaveProperty('referencePreview');
    expect(descendants(render(evaluation), (node) => node.getAttribute('role') === 'img')).toHaveLength(0);
    expect(renderer.buildView(evaluation).automaticBlock).toBeTruthy();
    expect(renderer.buildView(evaluation).conditionNote).toBe('');
  });

  it('nie prezentuje nieużytych obserwacji LH/FSH, zachowując je w historycznym wejściu', () => {
    const evaluation = production({ age: { years: 8, precision: 'year' }, puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true, source: 'patient-record' }, testicularVolume: { value: 7, unit: 'mL', method: 'Prader' }, history: { cnsSymptoms: 'yes', regression: 'yes', progression: 'yes' } });
    // A transported record may include actual observations the new engine does
    // not use. The renderer must not delete them while hiding irrelevant rows.
    evaluation.input.testicularVolume.value = 7;
    evaluation.input.testicularVolume.method = 'Prader';
    evaluation.input.history = { cnsSymptoms: 'yes', regression: 'yes', progression: 'yes', growthAcceleration: 'unknown' };
    const assessment = snapshot.create(evaluation), view = renderer.buildView(evaluation);
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.input.puberty).toMatchObject({ kind: 'G', stage: 3 });
    expect(assessment.evaluation.input.testicularVolume.value).toBe(7);
    for (const label of ['Obserwacja rozwoju', 'Data obserwacji', 'Źródło obserwacji', 'Objętość jąder', 'Objawy OUN', 'Regresja']) expect(view.presentation.context.map((item) => item.label)).not.toContain(label);
    expect(render(evaluation, true).textContent).not.toMatch(/G3|Objętość jąder|Objawy OUN|Regresja/);
  });
});
