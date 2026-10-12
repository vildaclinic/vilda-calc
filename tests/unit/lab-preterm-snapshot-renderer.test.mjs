import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_puberty.js');
const data = require('../../vilda_lab_puberty_data.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const ui = require('../../vilda_lab_assessment_ui.js');

const days = (lower, upper = lower, source = 'manual-completed-days') => ({ lower, upper, source });
function evaluate(overrides = {}) {
  const profile = data.profiles.find((entry) => entry.id === `greaves-preterm-${overrides.analyte || 'lh'}-candidate`);
  return engine.evaluate({
    analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M', contextBasis: 'current-patient',
    preterm: 'yes', specimen: 'serum', measurementKind: 'unknown',
    assay: { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id, confirmation: 'configured' },
    treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' },
    neonatalAge: { postnatalDays: days(43), gestationalDays: days(200, 200, 'patient-record') },
    ...overrides,
  }, data);
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
function visibleText(element) {
  return element.tagName === 'details' ? '' : element._text + ' ' + element.children.map(visibleText).join(' ');
}
function render(evaluation, saved = false, options = {}) {
  const container = documentDouble().createElement('main');
  if (saved) ui.renderAssessment(container, snapshot.normalize(JSON.parse(JSON.stringify(snapshot.create(evaluation)))));
  else ui.renderEvaluation(container, evaluation, { live: true, ...options });
  return container;
}

describe('LH/FSH wcześniaka — transport kwalifikacji bez ponownej oceny', () => {
  it('zachowuje przedział wieku, politykę, tabelę źródłową i warunkowość przez przypięcie i historię', () => {
    const evaluation = evaluate({ neonatalAge: { postnatalDays: days(42, 43, 'main-calendar-dates'), gestationalDays: days(200, 200, 'patient-record') } });
    const lab = { testKey: 'lh', test: 'LH', value: '2', valueNum: 2, unit: 'IU/L', norm: '', clinicalDateISO: '2026-10-09' };
    const assessment = snapshot.create(evaluation, lab);
    expect(assessment.status).toBe('recorded');
    const stored = JSON.parse(JSON.stringify({ ...lab, assessment }));
    const series = snapshot.forSeries(stored, lab.clinicalDateISO);
    expect(series.assessment).toEqual(assessment);
    expect(series.valueNum).toBe(2);
    expect(series.assessment.evaluation.neonatalAge).toEqual(evaluation.neonatalAge);
    expect(series.assessment.evaluation.neonatalAge.postmenstrualDays).toEqual({ lower: 242, upper: 243 });
    expect(series.assessment.evaluation.provenance).toMatchObject({ eligibilityPolicyId: 'greaves-preterm-applicability', eligibilityPolicyVersion: '2026-10-09.3' });
    expect(series.assessment.evaluation.biochemical.status).toBe('unavailable');
    expect(series.assessment.evaluation.referencePreview).toMatchObject({
      kind: 'conditional-basal-untreated', byAge: { status: 'within', range: {
        basis: 'preterm', age: { axis: 'postmenstrualDays', upper: { operator: '<=', value: 252 }, interpretation: 'owner-approved-applicability-policy-2026-10-09' },
        source: { doi: '10.1210/jc.2014-3681', evidenceSha256: data.sources['greaves-preterm-2015'].evidenceSha256, intervalEvidence: { table: 'Table 4', page: 1102 } },
        method: { id: 'roche-cobas-e601-lh-greaves-2015' }, population: { statistics: { coveragePercent: 95, sampleSize: 219 } },
        bounds: { lower: { value: 0.1 }, upper: { value: 9.2 } },
      } }, byStage: { status: 'unavailable' },
    });
    expect(series.assessment.evaluation.referencePreview.byAge.range.age.sourceText).toContain('GA 24+0–32+0');
    expect(snapshot.normalize(assessment)).toEqual(assessment);
  });

  it.each([
    ['brak GA', { neonatalAge: { postnatalDays: days(43), gestationalDays: null } }, 'missing'],
    ['brak PNA', { neonatalAge: { postnatalDays: null, gestationalDays: days(200) } }, 'missing'],
    ['wadliwy wiek', { neonatalAge: { postnatalDays: days(-1), gestationalDays: days(200) } }, 'invalid'],
    ['pierwsza doba', { neonatalAge: { postnatalDays: days(0), gestationalDays: days(200) } }, 'known'],
    ['niepewna doba', { neonatalAge: { postnatalDays: days(0, 1, 'main-calendar-dates'), gestationalDays: days(200) } }, 'uncertain'],
    ['poza PMA', { neonatalAge: { postnatalDays: days(53), gestationalDays: days(200) } }, 'known'],
  ])('przechowuje jawną blokadę: %s', (_label, input, status) => {
    const result = snapshot.create(evaluate(input));
    expect(result.status).toBe('recorded');
    expect(result.evaluation.neonatalAge.status).toBe(status);
    expect(result.evaluation.biochemical.byAge.status).toBe('unavailable');
    expect(result.evaluation.referencePreview).toBeUndefined();
    expect(snapshot.normalize(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it('zachowuje brak nowego inputu w ocenie brakującego kontekstu Greaves', () => {
    const input = evaluate().input;
    delete input.neonatalAge;
    const result = snapshot.create(engine.evaluate(input, data));
    expect(result.status).toBe('recorded');
    expect(result.evaluation.input).not.toHaveProperty('neonatalAge');
    expect(result.evaluation.neonatalAge.status).toBe('missing');
  });

  it.each([
    ['brak wyniku kwalifikacji', (e) => { delete e.neonatalAge; }],
    ['brak obu rozszerzeń', (e) => { delete e.neonatalAge; delete e.input.neonatalAge; delete e.provenance.eligibilityPolicyId; delete e.provenance.eligibilityPolicyVersion; }],
    ['brak wersji polityki', (e) => { delete e.provenance.eligibilityPolicyVersion; }],
    ['pusta polityka', (e) => { e.provenance.eligibilityPolicyId = ''; }],
    ['odwrócony przedział', (e) => { e.neonatalAge.postnatalDays.lower = 44; }],
    ['wiek ułamkowy', (e) => { e.neonatalAge.postnatalDays.lower = 42.5; }],
    ['ujemny wiek', (e) => { e.neonatalAge.postnatalDays.lower = -1; }],
    ['inna GA na wejściu', (e) => { e.input.neonatalAge.gestationalDays.lower = 199; }],
    ['niezgodna suma PMA', (e) => { e.neonatalAge.postmenstrualDays.upper += 1; }],
    ['brak PMA', (e) => { e.neonatalAge.postmenstrualDays = null; }],
    ['brak źródła', (e) => { e.neonatalAge.postnatalDays.source = ''; e.input.neonatalAge.postnatalDays.source = ''; }],
    ['pozorna dokładność dat', (e) => { e.neonatalAge.postnatalDays.source = 'main-calendar-dates'; e.input.neonatalAge.postnatalDays.source = 'main-calendar-dates'; }],
    ['ocena mimo niepewności', (e) => { e.neonatalAge.status = 'uncertain'; e.neonatalAge.reasonCodes = ['preterm_age_precision_crosses_scope']; }],
    ['ocena mimo wyłączenia', (e) => { e.neonatalAge.reasonCodes = ['preterm_first_day_excluded']; }],
    ['zmieniona oś wieku', (e) => { e.referencePreview.byAge.range.age.axis = 'chronologicalYears'; }],
  ])('odrzuca uszkodzony zapis kwalifikacji: %s', (_label, mutate) => {
    const assessment = snapshot.create(evaluate());
    mutate(assessment.evaluation);
    expect(snapshot.normalize(assessment).status).toBe('unavailable');
  });

  it('starszy snapshot Mayo zachowuje swój kształt bez dopisywania wieku noworodkowego ani polityki', () => {
    const previous = snapshot.create(engine.evaluate({ analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M', age: { years: 6, precision: 'year' }, preterm: 'yes', specimen: 'serum', measurementKind: 'basal', assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' }, treatment: { gnrha: 'no', sexSteroids: 'no' } }, data));
    expect(previous.status).toBe('recorded');
    expect(previous.evaluation).not.toHaveProperty('neonatalAge');
    expect(previous.evaluation.input).not.toHaveProperty('neonatalAge');
    expect(previous.evaluation.provenance).not.toHaveProperty('eligibilityPolicyId');
    expect(snapshot.normalize(JSON.parse(JSON.stringify(previous)))).toEqual(previous);
  });

  it.each([' main-calendar-dates ', '\tmain-calendar-dates\n'])('odrzuca pozornie ukończoną pierwszą dobę mimo białych znaków w źródle %j', (source) => {
    const assessment = snapshot.create(evaluate({ neonatalAge: { postnatalDays: days(1), gestationalDays: days(200) } }));
    expect(assessment.status).toBe('recorded');
    assessment.evaluation.input.neonatalAge.postnatalDays.source = source;
    assessment.evaluation.neonatalAge.postnatalDays.source = source;
    expect(snapshot.normalize(assessment).status).toBe('unavailable');
  });
});

describe('LH/FSH wcześniaka — prosty widok zachowujący istotne ostrzeżenia', () => {
  it('pokazuje jedną oś, bez pustego stadium ani rozbudowanej karty minipuberty', () => {
    const container = render(evaluate());
    const visible = visibleText(container);
    expect(descendants(container, (node) => node.getAttribute('role') === 'img')).toHaveLength(1);
    expect(visible).toContain('Dla wcześniaka');
    expect(visible).toContain('W zakresie');
    expect(visible).toContain('porównanie warunkowe');
    expect(visible).not.toMatch(/Dla stadium|Stężenie — osobne porównania|Brak dopasowanej oceny|Rozwój płciowy|Minipuberty/);
    expect(container.textContent).toContain('Minipuberty');
    expect(container.textContent).toContain('Greaves i wsp., 2015 — tabela 4');
  });

  it('FSH8 u chłopca używa dotychczasowego wyróżnienia >2× i zakresu wcześniaczego', () => {
    const evaluation = evaluate({ analyte: 'fsh', value: '8' });
    const view = ui.buildView(evaluation);
    expect(view.result.visualState).toBe('is-uwaga-high');
    expect(view.result.visualAlert).toMatchObject({ label: 'Uwaga — znacznie powyżej normy', scope: 'Względem zakresu dla wcześniaka', conditional: true });
    const container = render(evaluation);
    expect(descendants(container, (node) => (node.className || '').includes('vilda-lab-axis-marker is') || (node.className || '').includes('vilda-lab-axis-marker above is-uwaga-high'))).toHaveLength(1);
    expect(descendants(container, (node) => node.className === 'vilda-lab-status-icon')[0].textContent).toBe('!');
  });

  it.each([
    ['obie informacje', { neonatalAge: { postnatalDays: null, gestationalDays: null } }, 'Uzupełnij wiek ciążowy i ukończone dni życia'],
    ['GA', { neonatalAge: { postnatalDays: days(43), gestationalDays: null } }, 'Uzupełnij wiek ciążowy przy urodzeniu'],
    ['PNA', { neonatalAge: { postnatalDays: null, gestationalDays: days(200) } }, 'Uzupełnij ukończone dni życia'],
    ['pierwsza doba', { neonatalAge: { postnatalDays: days(0), gestationalDays: days(200) } }, 'Pierwsza doba — bez automatycznej oceny'],
    ['niepewna doba', { neonatalAge: { postnatalDays: days(0, 1, 'main-calendar-dates'), gestationalDays: days(200) } }, 'Nie potwierdzono ukończenia pierwszej doby'],
    ['PMA36+1', { neonatalAge: { postnatalDays: days(53), gestationalDays: days(200) } }, 'Wiek postmenstruacyjny jest poza zakresem'],
    ['niezgodna metoda', { assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' } }, 'Brak zakresu dla wybranej metody'],
  ])('pokazuje jeden konkretny powód bez pustych osi: %s', (_label, input, expected) => {
    const container = render(evaluate(input), false, { pretermContextMode: true });
    expect(descendants(container, (node) => node.getAttribute('data-preterm-block') === 'true')).toHaveLength(1);
    expect(descendants(container, (node) => node.getAttribute('role') === 'img')).toHaveLength(0);
    expect(visibleText(container)).toContain(expected);
    expect(visibleText(container)).not.toMatch(/Dla stadium|Brak dopasowanej oceny/);
  });

  it('przy dobrym stężeniu zachowuje niezależne ostrzeżenie o zaawansowanych cechach', () => {
    const evaluation = evaluate({ puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true } });
    expect(evaluation.clinical.status).toBe('warning');
    const container = render(evaluation);
    expect(visibleText(container)).toContain(evaluation.clinical.title);
    expect(visibleText(container)).toContain(evaluation.clinical.text);
    expect(visibleText(container)).toContain('W zakresie');
  });

  it('starsze dziecko urodzone przedwcześnie nadal widzi stadium', () => {
    const evaluation = engine.evaluate({ analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M', age: { years: 12, precision: 'year' }, preterm: 'yes', specimen: 'serum', measurementKind: 'basal', assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' }, puberty: { kind: 'G', stage: 3, appliesToSample: true }, treatment: { gnrha: 'no', sexSteroids: 'no' } }, data);
    expect(ui.buildView(evaluation).pretermProfile).toBe(false);
    expect(visibleText(render(evaluation))).toContain('Dla stadium G3');
  });

  it('samo GA z karty przy sześciomiesięcznym niemowlęciu i Mayo nie włącza noworodkowego widoku', () => {
    const evaluation = evaluate({
      age: { years: 0, months: 6, precision: 'month' },
      assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
      neonatalAge: { postnatalDays: null, gestationalDays: days(200, 200, 'patient-record') },
    });
    expect(ui.buildView(evaluation).pretermProfile).toBe(false);
    expect(visibleText(render(evaluation))).toContain('Dla stadium');
    expect(visibleText(render(evaluation, true))).toContain('Dla stadium');
    expect(visibleText(render(evaluation, true))).not.toContain('Dla wcześniaka');
  });

  it('flaga bieżącego formularza nie zmienia sposobu odczytu historycznej oceny Mayo', () => {
    const evaluation = evaluate({ assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' } });
    expect(ui.buildView(evaluation, { live: true, pretermContextMode: true }).pretermBlock).toContain('Brak zakresu dla wybranej metody');
    expect(ui.buildView(evaluation, { live: true, historical: true, pretermContextMode: true }).pretermProfile).toBe(false);
  });

  it('odczyt historii nie pobiera bieżącej daty ani nie odtwarza oceny z aktualnego silnika', () => {
    const evaluation = evaluate();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('No current date in history'); });
    try {
      const container = render(evaluation, true);
      expect(visibleText(container)).toContain('Dla wcześniaka');
      expect(visibleText(container)).toContain('W zakresie');
      expect(visibleText(container)).toContain('porównanie warunkowe');
      expect(clock).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });
});
