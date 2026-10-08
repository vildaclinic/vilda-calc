import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_puberty.js');
const data = require('../../vilda_lab_puberty_data.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const ui = require('../../vilda_lab_assessment_ui.js');

// Synthetic current-patient input follows the real quick form: a configured
// method does not declare either a basal specimen or absence of treatment.
function evaluate(overrides = {}) {
  const profile = data.profiles.find((entry) => entry.id === 'mayo-lh-pediatric');
  return engine.evaluate({
    analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
    contextBasis: 'current-patient', age: { years: 2, months: 9, precision: 'month' },
    specimen: 'serum', measurementKind: 'unknown',
    assay: { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id, confirmation: 'configured' },
    puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true, source: 'patient-record' },
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

const descendants = (element, predicate = () => true) => element.children.flatMap((child) => [
  ...(predicate(child) ? [child] : []), ...descendants(child, predicate),
]);
const hasClass = (node, name) => String(node.className || '').split(' ').includes(name);
const withClass = (host, name) => descendants(host, (node) => hasClass(node, name));
const visibleText = (node) => node.tagName === 'details' ? '' : node._text + ' ' + node.children.map(visibleText).join(' ');
const occurrences = (text, phrase) => text.split(phrase).length - 1;
const saved = (evaluation) => snapshot.normalize(JSON.parse(JSON.stringify(snapshot.create(evaluation))));
function render(evaluation, options = {}) {
  const host = documentDouble().createElement('div');
  ui.renderEvaluation(host, evaluation, { compact: true, ...options });
  return host;
}

describe('LH/FSH — zwięzła prezentacja bez zmiany oceny', () => {
  it.each(['', '   '])('pusty live wynik %j nie dodaje błędu ani pustych porównań do zachowanej oceny rozwoju', (value) => {
    const evaluation = evaluate({ value });
    const before = JSON.stringify(evaluation);
    const host = render(evaluation, { live: true, hideMeasurement: true });
    expect(withClass(host, 'vilda-lab-axis')).toHaveLength(0);
    expect(withClass(host, 'vilda-lab-comparison')).toHaveLength(0);
    expect(host.textContent).not.toMatch(/Nieprawidłowy zapis|Zapis wyniku wymaga poprawienia|Rodzaj oznaczenia nie odpowiada|Nie ustalono stosowania/);
    expect(visibleText(host)).toContain(evaluation.clinical.title);
    expect(host.textContent).toContain('Niskie lub niewykrywalne LH nie wyklucza');
    expect(JSON.stringify(evaluation)).toBe(before);
  });

  it('błędny live wynik pozostawia głównemu polu jeden komunikat błędu, zachowując niezależne ostrzeżenia', () => {
    const evaluation = evaluate({ value: 'błąd', history: { cnsSymptoms: 'yes', regression: 'yes' } });
    const host = render(evaluation, { live: true, hideMeasurement: true });
    expect(withClass(host, 'vilda-lab-axis')).toHaveLength(0);
    expect(withClass(host, 'vilda-lab-comparison')).toHaveLength(0);
    expect(host.textContent).not.toMatch(/Nieprawidłowy zapis|Zapis wyniku wymaga poprawienia|Rodzaj oznaczenia nie odpowiada|Nie ustalono stosowania/);
    for (const paragraph of evaluation.clinical.text.split(/\n\s*\n/)) expect(visibleText(host)).toContain(paragraph);
    expect(visibleText(host)).toContain('Objawy OUN:');
    expect(visibleText(host)).toContain('Regresja cech dojrzewania:');
    expect(host.textContent).toContain('Niskie lub niewykrywalne LH nie wyklucza');
  });

  it('brak wieku przy poprawnym wyniku jest wyjaśniony raz bez powtarzania wtórnych bramek zakresu', () => {
    const evaluation = evaluate({ age: null });
    const host = render(evaluation, { live: true, hideMeasurement: true });
    expect(visibleText(host)).toMatch(/wiek/i);
    expect(occurrences(host.textContent, 'Brak wiarygodnego wieku')).toBe(1);
    expect(host.textContent).not.toContain('Wiek próbki nie mieści się');
    expect(host.textContent).not.toContain('Rodzaj oznaczenia nie odpowiada');
    expect(withClass(host, 'vilda-lab-axis')).toHaveLength(0);
  });

  it('metoda i źródła pozostają dostępne raz, a techniczne wersje i puste odpowiedzi znikają z HTML', () => {
    const evaluation = evaluate();
    const view = ui.buildView(evaluation);
    const host = render(evaluation, { live: true, hideMeasurement: true });
    const details = descendants(host, (node) => node.tagName === 'details');
    expect(details).toHaveLength(1);
    expect(details[0].children.find((node) => node.tagName === 'summary').textContent).toBe('Szczegóły i źródła');
    expect(details[0].getAttribute('open')).toBeNull();
    expect(occurrences(host.textContent, 'AnshLite LH CLIA')).toBe(1);
    for (const population of new Set(view.comparisons.map((row) => row.population).filter(Boolean))) {
      expect(host.textContent).toContain(population);
    }
    expect(host.textContent).not.toMatch(/Silnik:|Dane:|Kryteria rozwoju:|wersja profilu:|Z zapisanej konfiguracji oznaczenia:/);
    const values = descendants(host, (node) => node.tagName === 'dd').map((node) => node.textContent);
    expect(values).not.toEqual(expect.arrayContaining(['Nieznany', 'Nieznana', 'Nie wiadomo', 'Nie podano', 'Nie ustalono', 'Inny lub nieznany', 'Nie oceniono Th/M lub G']));
    expect(host.textContent).not.toContain('Nie podano potwierdzonego zakresu laboratorium');
    // Removing copy from the screen must not rewrite the public view data.
    expect(view.context).toContainEqual({ label: 'Podstawa oceny', value: 'Kontekst z formularza głównego' });
    expect(view.context.find((row) => row.label === 'Potwierdzenie metody').value).toContain('wersja profilu:');
    expect(view.versions).toContain('Dane: ' + evaluation.dataVersion);
  });

  it.each([
    ['M', { kind: 'G', stage: 3, appliesToCurrentContext: true }, /chłopiec|mężczyzna/i],
    ['F', { kind: 'Th', stage: 3, appliesToCurrentContext: true }, /dziewczynka|kobieta/i],
  ])('płeć %s ma czytelną nazwę w kontekście zamiast technicznego kodu', (sex, puberty, expected) => {
    const host = render(evaluate({ sex, puberty }));
    const context = withClass(host, 'vilda-lab-context')[0];
    expect(context.textContent).toMatch(expected);
    expect(descendants(context, (node) => node.tagName === 'dd').map((node) => node.textContent)).not.toContain(sex);
  });

  it('minimalny kontekst zachowuje dwa różne porównania, widoczne warunki i istotne odchylenie wieku', () => {
    const evaluation = evaluate();
    const host = render(evaluation, { live: true });
    expect(withClass(host, 'vilda-lab-axis')).toHaveLength(2);
    const rows = descendants(host, (node) => ['age', 'stage'].includes(node.getAttribute('data-comparison')));
    expect(rows.map((row) => row.getAttribute('data-status'))).toEqual(['above', 'within']);
    expect(rows.map((row) => row.getAttribute('data-applicability'))).toEqual(['conditional', 'conditional']);
    expect(visibleText(host)).toContain('bez leczenia hormonalnego');
    expect(visibleText(host)).toContain('Uwaga — znacznie powyżej normy');
    expect(visibleText(host)).toContain(evaluation.clinical.title);
    expect(evaluation.biochemical.status).toBe('unavailable');
  });

  it('brak stadium nie usuwa dopasowanej osi wieku ani nie tworzy oceny stadium', () => {
    const evaluation = evaluate({ puberty: {} });
    const host = render(evaluation, { live: true });
    expect(withClass(host, 'vilda-lab-axis')).toHaveLength(1);
    const age = descendants(host, (node) => node.getAttribute('data-comparison') === 'age')[0];
    expect(age.getAttribute('data-status')).toBe('above');
    const stage = descendants(host, (node) => node.getAttribute('data-comparison') === 'stage');
    expect(stage.every((row) => row.getAttribute('data-status') === 'unavailable')).toBe(true);
    expect(visibleText(host)).toMatch(/stadium|Th\/M lub G/);
    expect(visibleText(host)).toContain('bez leczenia hormonalnego');
  });

  it('nieznana metoda pozostawia jedno wyjaśnienie w szczegółach bez osi i bez zmiany zapisanej oceny', () => {
    const evaluation = evaluate({ assay: {} });
    expect(evaluation.measurement.status).toBe('valid');
    expect(evaluation.biochemical.status).toBe('unavailable');
    expect(evaluation.clinical.status).toBe('warning');
    const before = JSON.stringify(evaluation);
    const host = render(evaluation, { live: true, hideMeasurement: true });
    expect(withClass(host, 'vilda-lab-axis')).toHaveLength(0);
    const method = 'Nie można porównać stężenia z normami aplikacji bez zgodnej metody oznaczenia.';
    expect(occurrences(host.textContent, method)).toBe(1);
    expect(visibleText(host)).not.toContain(method);
    expect(descendants(host, (node) => node.tagName === 'details')[0].textContent).toContain(method);
    expect(visibleText(host)).toContain(evaluation.clinical.title);
    expect(JSON.stringify(evaluation)).toBe(before);
  });

  it('nieznany kod ograniczenia nadal otrzymuje jawny komunikat zastępczy', () => {
    const evaluation = evaluate();
    // Future saved evaluations can carry a code unknown to this reader.
    evaluation.limitations.push('future_saved_limitation');
    const host = render(evaluation);
    expect(host.textContent).toContain('dodatkowe ograniczenie');
    expect(host.textContent).not.toContain('future_saved_limitation');
  });
});

describe('LH/FSH — uproszczony odczyt starszych zapisów', () => {
  it('historyczny błędny wynik nadal ma jeden komunikat błędu obok zachowanego ostrzeżenia rozwoju', () => {
    const assessment = saved(evaluate({ value: 'błąd' }));
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.measurement.status).toBe('invalid');
    const host = documentDouble().createElement('div');
    ui.renderAssessment(host, assessment, { compact: true });
    expect(host.textContent).toContain('błąd IU/L');
    expect(host.textContent.match(/Nieprawidłowy zapis wyniku|Zapis wyniku wymaga poprawienia/g)).toHaveLength(1);
    expect(withClass(host, 'vilda-lab-axis')).toHaveLength(0);
    expect(visibleText(host)).toContain(assessment.evaluation.clinical.title);
  });

  it.each([
    ['stymulacja', { measurementKind: 'stimulated' }, /stymulac/],
    ['leczenie', { treatment: { context: 'hormonal', gnrha: 'yes', sexSteroids: 'no' } }, /odrębnego profilu|leczenia hormonalnego/i],
  ])('zapisana %s nadal blokuje porównanie i wyjaśnia ograniczenie', (_, overrides, expected) => {
    const assessment = saved(evaluate(overrides));
    expect(assessment.status).toBe('recorded');
    const host = documentDouble().createElement('div');
    ui.renderAssessment(host, assessment, { compact: true });
    expect(withClass(host, 'vilda-lab-axis')).toHaveLength(0);
    expect(host.textContent).toMatch(expected);
    expect(visibleText(host)).toContain(assessment.evaluation.clinical.title);
    expect(assessment.evaluation).not.toHaveProperty('referencePreview');
  });

  it('zapis zachowuje daty, metodę i znane odpowiedzi po usunięciu pustych wierszy bez czytania bieżącego pacjenta', () => {
    const evaluation = evaluate({
      contextBasis: 'sample', birthDateISO: '2018-06-17', sampleDateISO: '2026-06-17', age: null,
      measurementKind: 'basal',
      assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
      puberty: { kind: 'G', stage: 3, assessedAtISO: '2026-06-17', appliesToSample: true, source: 'clinical-examination' },
      treatment: { gnrha: 'no', sexSteroids: 'no' },
      history: { cnsSymptoms: 'yes', regression: 'yes', progression: 'no', growthAcceleration: 'unknown' },
      testicularVolume: { value: 6, unit: 'mL', method: 'Prader', assessedAtISO: '2026-06-17', appliesToSample: true },
    });
    const assessment = saved(evaluation);
    expect(assessment.status).toBe('recorded');
    const before = JSON.stringify(assessment);
    const doc = documentDouble();
    const win = { document: doc, VildaLabSnapshot: snapshot, VildaLabPuberty: { evaluate: vi.fn() }, VildaPubertalStatus: { dane: vi.fn() } };
    loadBrowserScript('vilda_lab_assessment_ui.js', win);
    const host = doc.createElement('div');
    win.VildaLabAssessmentUI.renderAssessment(host, assessment, { compact: true });
    expect(host.textContent).toContain('17.06.2026');
    expect(host.textContent).toContain('17.06.2018');
    expect(host.textContent).toContain('AnshLite LH CLIA');
    expect(host.textContent).toContain('Badanie lekarskie');
    expect(host.textContent).toContain('6 mL');
    expect(host.textContent).toContain('Pradera');
    expect(visibleText(host)).toContain('Objawy OUN:');
    expect(visibleText(host)).toContain('Regresja cech dojrzewania:');
    const rows = withClass(host, 'vilda-lab-context')[0].children;
    const progression = rows.findIndex((node) => node.tagName === 'dt' && node.textContent === 'Progresja');
    expect(progression).toBeGreaterThanOrEqual(0);
    expect(rows[progression + 1].textContent).toBe('Nie');
    expect(descendants(host, (node) => node.tagName === 'dd').map((node) => node.textContent)).not.toContain('Nie wiadomo');
    expect(JSON.stringify(assessment)).toBe(before);
    expect(win.VildaLabPuberty.evaluate).not.toHaveBeenCalled();
    expect(win.VildaPubertalStatus.dane).not.toHaveBeenCalled();
  });
});
