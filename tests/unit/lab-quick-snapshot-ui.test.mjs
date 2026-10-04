import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_puberty.js');
const data = require('../../vilda_lab_puberty_data.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const ui = require('../../vilda_lab_assessment_ui.js');

function quick(overrides = {}) {
  return engine.evaluate({
    analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
    contextBasis: 'current-patient', age: { years: 6, months: 0, precision: 'month' },
    specimen: 'serum', measurementKind: 'basal', preterm: 'no',
    assay: { profileId: 'mayo-lh-pediatric', profileVersion: '2026-10-03.1', methodId: 'anshlite-lh-clia', confirmation: 'configured' },
    puberty: { kind: 'G', stage: 4, appliesToCurrentContext: true, source: 'patient-record' },
    treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' },
    ...overrides,
  }, data);
}

function legacy() {
  return engine.evaluate({
    analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
    birthDateISO: '2020-10-03', sampleDateISO: '2026-10-03',
    specimen: 'serum', measurementKind: 'basal', preterm: 'no',
    assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
    puberty: { kind: 'G', stage: 4, appliesToSample: true },
    treatment: { gnrha: 'no', sexSteroids: 'no' },
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

function descendants(element, predicate = () => true) {
  return element.children.flatMap((child) => [...(predicate(child) ? [child] : []), ...descendants(child, predicate)]);
}
function visibleText(element) {
  return element.tagName === 'details' ? '' : element._text + ' ' + element.children.map(visibleText).join(' ');
}
function saved(evaluation) { return snapshot.normalize(JSON.parse(JSON.stringify(snapshot.create(evaluation)))); }

describe('LH/FSH — zapis szybkiej oceny bez zmiany znaczenia starszych danych', () => {
  it('utrwala jawny kontekst formularza i konfigurację bez wymyślania daty próbki', () => {
    const evaluation = quick({ testicularVolume: { value: 4, unit: 'mL', method: 'Prader', appliesToCurrentContext: true } });
    const assessment = saved(evaluation);
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation).toEqual(evaluation);
    expect(assessment.evaluation.input).toMatchObject({
      contextBasis: 'current-patient', sampleDateISO: null,
      assay: { confirmation: 'configured', profileVersion: '2026-10-03.1' },
      puberty: { appliesToCurrentContext: true, appliesToSample: false },
      testicularVolume: { appliesToCurrentContext: true, appliesToSample: false },
      treatment: { context: 'none' },
    });
  });

  it('odczyt legacy pozostawia nieobecne rozszerzenia nieobecnymi', () => {
    const evaluation = legacy();
    evaluation.engineVersion = '1.1.0';
    const assessment = saved(evaluation);
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation).toEqual(evaluation);
    expect(assessment.evaluation).not.toHaveProperty('reportedRange');
    expect(assessment.evaluation.input).not.toHaveProperty('contextBasis');
    expect(assessment.evaluation.input.assay).not.toHaveProperty('profileVersion');
    expect(assessment.evaluation.input.puberty).not.toHaveProperty('appliesToCurrentContext');
    expect(assessment.evaluation.input.treatment).not.toHaveProperty('context');
    expect(ui.buildView(assessment.evaluation).context).toContainEqual({ label: 'Pobranie', value: '03.10.2026' });
  });

  it.each([
    ['kontekst', (e) => { e.input.contextBasis = 'visit'; }],
    ['pusty kontekst', (e) => { e.input.contextBasis = null; }],
    ['wersja profilu', (e) => { e.input.assay.profileVersion = null; }],
    ['zbyt długa wersja', (e) => { e.input.assay.profileVersion = 'a'.repeat(81); }],
    ['obserwacja', (e) => { e.input.puberty.appliesToCurrentContext = 'true'; }],
    ['pomiar', (e) => { e.input.testicularVolume.appliesToCurrentContext = null; }],
    ['leczenie', (e) => { e.input.treatment.context = 'no'; }],
    ['wejście zakresu bez wyniku', (e) => { e.input.reportedRange = { text: '1-3', unit: 'IU/L' }; }],
  ])('odrzuca uszkodzone nowe pole: %s', (_, damage) => {
    const evaluation = quick();
    damage(evaluation);
    expect(snapshot.create(evaluation).status).toBe('unavailable');
  });

  it.each([
    ['wynik niezgodny z wejściem', (e) => { e.reportedRange.raw = '0-10'; }],
    ['jednostka niezgodna z wejściem', (e) => { e.reportedRange.unit = 'mIU/mL'; }],
    ['nieznany status', (e) => { e.reportedRange.status = 'normal'; }],
    ['ujemna granica', (e) => { e.reportedRange.lower.value = -1; }],
    ['odwrócony operator', (e) => { e.reportedRange.upper.operator = '>='; }],
    ['odwrócone granice', (e) => { e.reportedRange.lower.value = 4; }],
    ['brak granic', (e) => { e.reportedRange.lower = null; e.reportedRange.upper = null; }],
    ['brak kodów', (e) => { delete e.reportedRange.reasonCodes; }],
  ])('odrzuca uszkodzony komparator: %s', (_, damage) => {
    const evaluation = quick({ reportedRange: { text: '1-3', unit: 'IU/L' } });
    damage(evaluation);
    expect(snapshot.create(evaluation).status).toBe('unavailable');
  });

  it('kopiuje tylko dozwolone nowe pola i nie uruchamia getterów', () => {
    const evaluation = quick({ reportedRange: { text: '1-3', unit: 'IU/L' } });
    evaluation.input.reportedRange.patientId = 'synthetic-patient';
    evaluation.reportedRange.method = { id: 'injected-method' };
    const clean = snapshot.create(evaluation);
    expect(clean.status).toBe('recorded');
    expect(clean.evaluation.input.reportedRange).not.toHaveProperty('patientId');
    expect(clean.evaluation.reportedRange).not.toHaveProperty('method');
    const accessor = vi.fn();
    Object.defineProperty(evaluation.input.assay, 'profileVersion', { get: accessor });
    expect(snapshot.create(evaluation).status).toBe('unavailable');
    expect(accessor).not.toHaveBeenCalled();
  });

  it.each([
    ['1-3', 'IU/L', 'within'],
    ['<1', 'IU/L', 'above'],
    ['>=3', 'mIU/mL', 'below'],
    ['3-1', 'IU/L', 'unavailable'],
    ['nieznany zakres', 'IU/L', 'unavailable'],
    ['1-3', 'ng/mL', 'unavailable'],
  ])('utrwala porównanie %s %s ze statusem %s', (text, unit, status) => {
    const assessment = saved(quick({ reportedRange: { text, unit } }));
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.reportedRange).toMatchObject({ status, raw: text, unit });
  });
});

describe('LH/FSH — szybki widok i historyczny odczyt', () => {
  it('nazywa źródło aktualnego kontekstu i konfiguracji bez przypisywania ich do próbki', () => {
    const view = ui.buildView(saved(quick()).evaluation);
    expect(view.context).toContainEqual({ label: 'Podstawa oceny', value: 'Kontekst z formularza głównego' });
    expect(view.context.some((row) => row.label === 'Wiek w dniu pobrania')).toBe(false);
    expect(view.context.find((row) => row.label === 'Związek obserwacji z kontekstem').value).toContain('bez potwierdzenia dla dnia pobrania');
    expect(view.context.find((row) => row.label === 'Potwierdzenie metody').value).toBe('Z zapisanej konfiguracji oznaczenia · wersja profilu: 2026-10-03.1');
    expect(view.context.some((row) => row.value === 'Podana dla rzeczywistej próbki')).toBe(false);
  });

  it('ogólny kontekst hormonalny nie staje się rozpoznanym lekiem', () => {
    const assessment = saved(quick({ treatment: { context: 'hormonal' } }));
    expect(assessment.status).toBe('recorded');
    const view = ui.buildView(assessment.evaluation);
    expect(view.context).toContainEqual({ label: 'Kontekst leczenia', value: 'Leczenie hormonalne — bez określenia leku' });
    expect(view.context.some((row) => ['Leczenie GnRHa', 'Steroidy płciowe'].includes(row.label))).toBe(false);
  });

  it('nie pomija nieznanych odpowiedzi o lekach na podstawie samego skrótu none', () => {
    const assessment = saved(quick({ treatment: { context: 'none' } }));
    expect(assessment.status).toBe('recorded');
    expect(assessment.evaluation.biochemical.status).toBe('unavailable');
    expect(assessment.evaluation.limitations).toContain('treatment_context_unknown');
    expect(ui.buildView(assessment.evaluation).context.find((row) => row.label === 'Kontekst leczenia').value).toContain('szczegóły wymagają ustalenia');
  });

  it('zachowuje jawnie podany lek także obok ogólnego kontekstu', () => {
    const view = ui.buildView(saved(quick({ treatment: { context: 'hormonal', gnrha: 'yes' } })).evaluation);
    expect(view.context).toContainEqual({ label: 'Leczenie GnRHa', value: 'Tak' });
    expect(view.context.some((row) => row.label === 'Steroidy płciowe')).toBe(false);
  });

  it('compact zachowuje alarm kliniczny i dwa różne RI, a pełne metadane udostępnia w szczegółach', () => {
    const host = documentDouble().createElement('div');
    ui.renderAssessment(host, saved(quick({ history: { cnsSymptoms: 'yes', regression: 'yes' } })), { compact: true });
    const visible = visibleText(host);
    expect(visible).toContain('zbyt wcześnie');
    expect(visible).toContain('Objawy OUN:');
    expect(visible).toContain('Regresja cech dojrzewania:');
    expect(visible).toContain('Względem wieku');
    expect(visible).toContain('Względem stadium');
    expect(visible).toContain('Powyżej wskazanego zakresu');
    expect(visible).toContain('W obrębie wskazanego zakresu');
    expect(visible).not.toContain('Zakres laboratorium');
    expect(visible).not.toContain('Mayo');
    const details = descendants(host, (node) => node.tagName === 'details');
    expect(details.every((node) => node.getAttribute('open') === null)).toBe(true);
    expect(details.some((node) => node.textContent.includes('Źródło zakresu:'))).toBe(true);
    expect(details.some((node) => node.textContent.includes('Mayo'))).toBe(true);
  });

  it('lista braków w compact pozostaje w zamkniętych szczegółach', () => {
    const host = documentDouble().createElement('div');
    ui.renderAssessment(host, saved(quick({ assay: {}, treatment: { context: 'unknown' }, puberty: {} })), { compact: true });
    const visible = visibleText(host);
    expect(visible).not.toContain('Nie potwierdzono zgodnej metody');
    expect(visible).not.toContain('Nie ustalono stosowania');
    expect(host.textContent).toContain('Nie ustalono stosowania');
    expect(descendants(host, (node) => node.tagName === 'details').some((node) => node.textContent.includes('Nie wybrano zgodnego profilu'))).toBe(true);
  });

  it('komparator zakresu nie udaje źródła, populacji ani metody laboratorium', () => {
    const host = documentDouble().createElement('div');
    ui.renderAssessment(host, saved(quick({ reportedRange: { text: '1-3', unit: 'IU/L' } })), { compact: true });
    const reported = descendants(host, (node) => node.getAttribute('data-comparison') === 'reported')[0];
    expect(reported.textContent).toContain('W podanym zakresie');
    expect(reported.textContent).toContain('1-3 IU/L');
    expect(reported.textContent).toContain('Nie potwierdza zastosowania zakresu');
    expect(reported.textContent).not.toContain('Mayo');
    expect(reported.textContent).not.toContain('AnshLite');
    expect(visibleText(host)).toContain('dają różne porównania');
  });

  it('historia wyświetla zamrożony komparator i kontekst bez silnika ani dzisiejszego pacjenta', () => {
    const evaluation = quick({ value: '<2', reportedRange: { text: '1-3', unit: 'IU/L' } });
    const assessment = saved(evaluation);
    expect(assessment.evaluation.reportedRange.status).toBe('indeterminate');
    evaluation.reportedRange.raw = '0-100';
    evaluation.input.contextBasis = 'sample';
    const doc = documentDouble();
    const win = { document: doc, VildaLabSnapshot: snapshot, VildaLabPuberty: { evaluate: vi.fn() }, VildaPubertalStatus: { dane: vi.fn() } };
    loadBrowserScript('vilda_lab_assessment_ui.js', win);
    const host = doc.createElement('div');
    win.VildaLabAssessmentUI.renderAssessment(host, assessment, { compact: true });
    expect(visibleText(host)).toContain('Kontekst z formularza głównego');
    expect(visibleText(host)).toContain('Porównanie z podanym zakresem niejednoznaczne');
    expect(visibleText(host)).toContain('1-3 IU/L');
    expect(host.textContent).not.toContain('0-100');
    expect(win.VildaLabPuberty.evaluate).not.toHaveBeenCalled();
    expect(win.VildaPubertalStatus.dane).not.toHaveBeenCalled();
  });
});
