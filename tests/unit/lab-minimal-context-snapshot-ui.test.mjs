import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_puberty.js');
const data = require('../../vilda_lab_puberty_data.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const ui = require('../../vilda_lab_assessment_ui.js');

function evaluate(overrides = {}) {
  const profile = data.profiles.find((entry) => entry.id === 'mayo-lh-pediatric');
  return engine.evaluate({
    analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
    contextBasis: 'current-patient', age: { years: 2, months: 9, precision: 'month' },
    specimen: 'serum', measurementKind: 'unknown',
    assay: { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id, confirmation: 'configured' },
    puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true, source: 'current-patient' },
    treatment: { context: 'unknown', gnrha: 'no', sexSteroids: 'unknown' },
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
function save(evaluation) { return snapshot.normalize(JSON.parse(JSON.stringify(snapshot.create(evaluation)))); }

describe('LH/FSH — trwałe warunkowe porównanie przy minimalnym kontekście', () => {
  it('przenosi realny wynik przez przypięcie i serię bez dopisywania braku leczenia ani pobrania', () => {
    const evaluation = evaluate();
    const lab = { testKey: 'lh', test: 'LH', value: '2', valueNum: 2, unit: 'IU/L', norm: '', clinicalDateISO: '2026-10-04' };
    const assessment = snapshot.create(evaluation, lab);
    const stored = JSON.parse(JSON.stringify({ ...lab, assessment }));
    const series = snapshot.forSeries(stored, lab.clinicalDateISO);
    expect(series.assessment.status).toBe('recorded');
    expect(series.assessment.evaluation).toEqual(evaluation);
    expect(series.assessment.evaluation.input).toMatchObject({ measurementKind: 'unknown', sampleDateISO: null, treatment: { context: 'unknown', gnrha: 'no', sexSteroids: 'unknown' } });
    expect(series.assessment.evaluation.biochemical).toMatchObject({ status: 'unavailable', primary: null, byAge: { status: 'unavailable' }, byStage: { status: 'unavailable' } });
    expect(series.assessment.evaluation.referencePreview).toMatchObject({ kind: 'conditional-basal-untreated', byAge: { status: 'above' }, byStage: { status: 'within' } });
    expect(series.valueNum).toBe(2);
  });

  it.each([
    ['brak rodzaju', (e) => { delete e.referencePreview.kind; }],
    ['inny rodzaj', (e) => { e.referencePreview.kind = 'normal'; }],
    ['pusty blok', (e) => { e.referencePreview = null; }],
    ['brak powodów', (e) => { delete e.referencePreview.reasonCodes; }],
    ['puste powody', (e) => { e.referencePreview.reasonCodes = []; }],
    ['powód niezgodny z wejściem', (e) => { e.referencePreview.reasonCodes = ['treatment_context_unknown']; }],
    ['powtórzony powód', (e) => { e.referencePreview.reasonCodes = ['treatment_context_unknown', 'treatment_context_unknown']; }],
    ['inna blokada', (e) => { e.referencePreview.reasonCodes[0] = 'method_not_confirmed'; }],
    ['brak porównania', (e) => { delete e.referencePreview.byAge; }],
    ['brak pola zakresu', (e) => { delete e.referencePreview.byAge.range; }],
    ['nieznany status', (e) => { e.referencePreview.byAge.status = 'normal'; }],
    ['brak granic', (e) => { e.referencePreview.byAge.range.bounds = null; }],
    ['ujemna granica', (e) => { e.referencePreview.byAge.range.bounds.upper.value = -1; }],
    ['odwrócone granice', (e) => { e.referencePreview.byStage.range.bounds.lower.value = 10; }],
    ['pusty przedział', (e) => { e.referencePreview.byStage.range.bounds.lower = { operator: '>', value: 4.2 }; }],
    ['zerowa granica oznaczalności', (e) => { e.referencePreview.byAge.range.bounds.censoredLower.value = 0; }],
    ['obie oceny niedostępne', (e) => { e.referencePreview.byAge = e.biochemical.byAge; e.referencePreview.byStage = e.biochemical.byStage; }],
    ['inna metoda', (e) => { e.referencePreview.byAge.range.method.id = 'other'; }],
    ['inna płeć', (e) => { e.referencePreview.byAge.range.sex = 'F'; }],
    ['inny materiał', (e) => { e.referencePreview.byAge.range.material = 'urine'; }],
    ['inna jednostka', (e) => { e.referencePreview.byAge.range.unit = 'ng/mL'; }],
    ['inny profil', (e) => { e.referencePreview.byAge.range.profileId = 'other'; }],
    ['inna wersja', (e) => { e.referencePreview.byAge.range.profileVersion = 'old'; }],
    ['inne stadium', (e) => { e.referencePreview.byStage.range.stage.value = 4; }],
    ['niezgodna informacja o stymulacji', (e) => { e.input.measurementKind = 'stimulated'; }],
    ['znane leczenie', (e) => { e.input.treatment.context = 'hormonal'; }],
    ['znany GnRHa', (e) => { e.input.treatment.gnrha = 'yes'; }],
    ['znane steroidy', (e) => { e.input.treatment.sexSteroids = 'yes'; }],
    ['niepotwierdzona metoda', (e) => { e.input.assay.confirmation = 'unknown'; }],
    ['twarda blokada', (e) => { e.biochemical.reasonCodes.push('method_not_confirmed'); }],
    ['utracone powody ograniczenia normy', (e) => { e.biochemical.reasonCodes = []; }],
    ['porównanie uznane za normę', (e) => { e.biochemical.status = 'available'; e.biochemical.primary = 'stage'; e.biochemical.byStage = e.referencePreview.byStage; }],
  ])('odrzuca uszkodzony lub sprzeczny zapis: %s', (_, damage) => {
    const evaluation = evaluate();
    expect(evaluation.referencePreview).toBeDefined();
    damage(evaluation);
    expect(snapshot.create(evaluation).status).toBe('unavailable');
  });

  it('pozwala zapisać dostępny zakres wieku bez stadium', () => {
    const assessment = save(evaluate({ puberty: {} }));
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.referencePreview).toMatchObject({ byAge: { status: 'above' }, byStage: { status: 'unavailable' } });
  });

  it('ignoruje obce pola bez uruchamiania getterów w rozszerzeniu', () => {
    const evaluation = evaluate();
    evaluation.referencePreview.patientId = 'fictional-only';
    expect(save(evaluation).evaluation.referencePreview).not.toHaveProperty('patientId');
    const getter = vi.fn();
    Object.defineProperty(evaluation.referencePreview, 'kind', { get: getter });
    expect(snapshot.create(evaluation).status).toBe('unavailable');
    expect(getter).not.toHaveBeenCalled();
  });

  it('zapis bez nowego rozszerzenia nie odzyskuje oceny i nie otrzymuje nowego pola', () => {
    const evaluation = evaluate();
    delete evaluation.referencePreview;
    evaluation.engineVersion = '1.2.0';
    evaluation.limitations = evaluation.limitations.filter((code) => code !== 'conditional_reference_comparison');
    const assessment = save(evaluation);
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation).toEqual(evaluation);
    expect(assessment.evaluation).not.toHaveProperty('referencePreview');
    expect(ui.buildView(assessment.evaluation).comparisons.every((comparison) => comparison.status === 'unavailable')).toBe(true);
    expect(ui.buildView(assessment.evaluation).conditionNote).toBe('');
  });

  it('utrata nieznanego rozszerzenia przez starszego czytnika pozostawia bezpiecznie niedostępne normy', () => {
    const assessment = save(evaluate());
    delete assessment.evaluation.referencePreview;
    const read = snapshot.normalize(assessment);
    expect(read.status).toBe('recorded');
    expect(read.evaluation.biochemical).toMatchObject({ status: 'unavailable', primary: null });
    expect(ui.buildView(read.evaluation).comparisons.every((comparison) => comparison.status === 'unavailable')).toBe(true);
  });
});

describe('LH/FSH — widoczne warunki porównania w wyniku i historii', () => {
  it.each([true, false])('zachowuje warunki obok liczb i alarm rozwoju przy compact=%s', (compact) => {
    const host = documentDouble().createElement('div');
    ui.renderAssessment(host, save(evaluate()), { compact });
    const visible = visibleText(host);
    expect(visible).toContain('Cechy dojrzewania zbyt wcześnie — wymagają oceny');
    expect(visible).toContain('Porównanie z zakresami oznaczenia bazalnego bez leczenia hormonalnego. Rodzaju badania i leczenia nie ustalono.');
    expect(visible).toContain('Liczbowo powyżej zakresu — warunkowo');
    expect(visible).toContain('Liczbowo w zakresie — warunkowo');
    expect(visible).toContain('0,09');
    expect(host.textContent).not.toContain('Rodzaj oznaczenia nie odpowiada wybranemu profilowi.');
    expect(host.children[0].getAttribute('data-summary-status')).toBe('attention');
    for (const key of ['age', 'stage']) {
      const rows = descendants(host, (node) => node.getAttribute('data-comparison') === key);
      expect(rows).toHaveLength(1);
      expect(rows[0].getAttribute('data-applicability')).toBe('conditional');
    }
    expect(descendants(host, (node) => node.getAttribute('data-reference-conditions') === 'conditional-basal-untreated')).toHaveLength(1);
  });

  it.each([
    [{ measurementKind: 'basal' }, 'Leczenia nie ustalono.'],
    [{ treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' } }, 'Rodzaju badania nie ustalono.'],
  ])('nazywa tylko rzeczywiście nieustalony warunek: %s', (overrides, message) => {
    const assessment = save(evaluate(overrides));
    expect(assessment.status).toBe('recorded');
    expect(ui.buildView(assessment.evaluation).conditionNote).toBe('Porównanie z zakresami oznaczenia bazalnego bez leczenia hormonalnego. ' + message);
  });

  it('pokazuje źródło zapisanych zakresów bez odwoływania się do aktualnych danych', () => {
    const assessment = save(evaluate());
    const source = assessment.evaluation.referencePreview.byAge.range.source;
    source.label = 'Fikcyjne zachowane źródło zakresu';
    const view = ui.buildView(assessment.evaluation);
    expect(view.comparisons.find((comparison) => comparison.key === 'age').source.label).toBe(source.label);
    expect(view.sources.some((entry) => entry.label === source.label)).toBe(true);
  });

  it('potwierdzony kontekst zachowuje zwykłe porównania bez etykiety warunkowej', () => {
    const assessment = save(evaluate({ measurementKind: 'basal', treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' } }));
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation).not.toHaveProperty('referencePreview');
    const view = ui.buildView(assessment.evaluation);
    expect(view.conditionNote).toBe('');
    expect(view.comparisons.every((comparison) => !comparison.conditional)).toBe(true);
    expect(view.comparisons.find((comparison) => comparison.key === 'age').status).toBe('above');
  });
});
