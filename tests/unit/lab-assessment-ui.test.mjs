import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_puberty.js');
const data = require('../../vilda_lab_puberty_data.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const ui = require('../../vilda_lab_assessment_ui.js');

function evaluate(overrides = {}) {
  return engine.evaluate({
    analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
    birthDateISO: '2020-10-03', sampleDateISO: '2026-10-03',
    specimen: 'serum', measurementKind: 'basal', preterm: 'no',
    assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
    puberty: { kind: 'G', stage: 4, assessedAtISO: '2026-10-03', appliesToSample: true },
    treatment: { gnrha: 'no', sexSteroids: 'no' },
    ...overrides,
  }, data);
}

// A small DOM double rejects HTML assignment and records the real renderer's
// element/text calls. It cannot interpret markup or accidentally make XSS pass.
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

describe('LH/FSH — wspólna prezentacja oceny', () => {
  it('utrzymuje niezależne porównanie LH względem wieku i stadium oraz nadrzędny alarm rozwoju', () => {
    const view = ui.buildView(evaluate());
    expect(view.valid).toBe(true);
    expect(view.clinical.status).toBe('warning');
    expect(view.clinical.title).toContain('zbyt wcześnie');
    expect(view.comparisons.find((row) => row.key === 'age')).toMatchObject({ status: 'above', label: 'Powyżej wskazanego zakresu' });
    expect(view.comparisons.find((row) => row.key === 'stage')).toMatchObject({ status: 'within', label: 'W obrębie wskazanego zakresu' });
    expect(view.comparisons.find((row) => row.key === 'stage').rangeText).toContain('≥1,3');
    expect(JSON.stringify(view)).not.toContain('pacjent prawidłowy');
  });

  it('prawidłowe względem zakresów FSH nie staje się wysokie z powodu wieku rozwoju', () => {
    const view = ui.buildView(evaluate({
      analyte: 'fsh', assay: { profileId: 'mayo-fsh-pediatric', methodId: 'roche-elecsys-fsh-eclia', confirmation: 'reported' },
    }));
    expect(view.clinical.status).toBe('warning');
    expect(view.comparisons.filter((row) => row.key !== 'local').map((row) => row.status)).toEqual(['within', 'within']);
  });

  it.each(['<0,02', '≤0,02', '>0,5', '≥0,5', '<LOD', '<LOQ'])('zachowuje surowy operator %s i ograniczenie punktu trendu', (raw) => {
    const view = ui.buildView(evaluate({ value: raw }));
    expect(view.result.text).toBe(raw + ' IU/L');
    expect(view.result.censored).toBe(true);
    expect(view.result.note).toContain('dokładnym punktem');
  });

  it('zachowuje ścisły operator granicy FSH stadium I', () => {
    const view = ui.buildView(evaluate({
      analyte: 'fsh', value: '1,5',
      assay: { profileId: 'mayo-fsh-pediatric', methodId: 'roche-elecsys-fsh-eclia', confirmation: 'reported' },
      puberty: { kind: 'G', stage: 1, appliesToSample: true },
    }));
    expect(view.comparisons.find((row) => row.key === 'stage')).toMatchObject({ status: 'above', rangeText: '<1,5 IU/L' });
  });

  it('nieznana metoda blokuje zakresy, ale zachowuje ostrzeżenie rozwoju', () => {
    const view = ui.buildView(evaluate({ assay: { profileId: 'mayo-lh-pediatric', confirmation: 'unknown' } }));
    expect(view.clinical.status).toBe('warning');
    expect(view.comparisons.every((row) => row.status === 'unavailable')).toBe(true);
    expect(view.limitations.join(' ')).toContain('metody oznaczenia');
    expect(view.limitations.join(' ')).not.toContain('method_not_confirmed');
  });

  it('pokazuje źródło, metodę, populację, daty i typowane stadium z zapisanej oceny', () => {
    const original = evaluate();
    const frozen = snapshot.create(original);
    const view = ui.buildView(frozen.evaluation);
    original.input.puberty.stage = 1;
    expect(view.context.some((row) => row.value.includes('G4'))).toBe(true);
    expect(view.context.some((row) => row.value.includes('03.10.2026'))).toBe(true);
    expect(view.comparisons[0].method).toContain('AnshLite');
    expect(view.comparisons[0].population).toContain('Mayo');
    expect(view.sources.some((source) => source.url.includes('/62999'))).toBe(true);
    expect(view.versions).toContain('Dane: 2026-10-04.1');
  });

  it('odczyt lokalnego snapshotu zachowuje konkretną metodę, populację oraz osobne wersje źródła i zakresu', () => {
    const input = {
      assay: { profileId: '', methodId: 'synthetic-lh-platform-2024', confirmation: 'reported' },
      localReference: {
        id: 'synthetic-local-lh-range', version: 'range-2024.7', analyte: 'lh', material: 'serum', unit: 'IU/L',
        methodId: 'synthetic-lh-platform-2024', applicabilityConfirmed: true,
        source: { id: 'synthetic-local-lab', label: 'Fikcyjne Laboratorium Alfa', version: 'raport-2024.3', url: 'https://example.org/synthetic-lh' },
        population: { label: 'Fikcyjna pediatryczna populacja odniesienia' },
        range: { lower: { operator: '>=', value: 0.1 }, upper: { operator: '<=', value: 3 }, censoredLower: null },
      },
    };
    const assessment = JSON.parse(JSON.stringify(snapshot.create(evaluate(input))));
    expect(assessment.status).toBe('recorded');
    input.localReference.version = 'range-2026.1';
    input.localReference.source.version = 'raport-2026.1';
    input.assay.methodId = 'synthetic-new-platform';
    const host = documentDouble().createElement('div');
    ui.renderAssessment(host, assessment, { compact: true });
    const row = descendants(host, (node) => node.getAttribute('data-comparison') === 'local')[0];
    expect(row.textContent).toContain('synthetic-lh-platform-2024');
    expect(row.textContent).toContain('Fikcyjna pediatryczna populacja odniesienia');
    expect(row.textContent).toContain('Fikcyjne Laboratorium Alfa');
    expect(row.textContent).toContain('wersja źródła: raport-2024.3');
    expect(row.textContent).toContain('wersja zakresu: range-2024.7');
    expect(host.textContent).not.toContain('range-2026.1');
    expect(host.textContent).not.toContain('synthetic-new-platform');
    expect(ui.buildView(assessment.evaluation).context.find((item) => item.label === 'Metoda próbki').value).toContain('synthetic-lh-platform-2024');
  });

  it('jawnie opisuje precyzję ręcznego wieku i brak potwierdzenia historycznego Tannera', () => {
    const view = ui.buildView(evaluate({
      birthDateISO: null, sampleDateISO: null, age: { years: 6, precision: 'year' },
      puberty: { kind: 'unspecified', stage: 3 },
    }));
    expect(view.context.some((row) => row.value.includes('dokładność do roku'))).toBe(true);
    expect(view.context.some((row) => row.value.includes('typ nieokreślony'))).toBe(true);
    expect(view.limitations.join(' ')).toContain('Th/M lub G');
    expect(view.comparisons.find((row) => row.key === 'stage').status).toBe('unavailable');
  });

  it('brak oceny i nowe kody ograniczeń nie wyświetlają surowych identyfikatorów', () => {
    const value = evaluate();
    value.limitations = ['future_private_code', 'low_lh_does_not_exclude_cpp'];
    const text = ui.buildView(value).limitations.join(' ');
    expect(text).not.toContain('future_private_code');
    expect(text).toContain('dodatkowe ograniczenie');
    expect(text).toContain('nie wyklucza');
    expect(ui.buildView(null).valid).toBe(false);
    expect(ui.buildView({ ...value, schemaVersion: 2 }).valid).toBe(false);
  });

  it('renderuje rozwój przed biochemią bez wywołania silnika lub bieżącego pacjenta', () => {
    const doc = documentDouble();
    const win = { document: doc, VildaLabSnapshot: snapshot, VildaLabPuberty: { evaluate: vi.fn() }, VildaPubertalStatus: { dane: vi.fn() } };
    loadBrowserScript('vilda_lab_assessment_ui.js', win);
    const host = doc.createElement('div');
    win.VildaLabAssessmentUI.renderEvaluation(host, evaluate());
    expect(host.firstChild.getAttribute('data-assessment-status')).toBe('recorded');
    expect(host.textContent.indexOf('Rozwój płciowy')).toBeLessThan(host.textContent.indexOf('Stężenie'));
    expect(win.VildaLabPuberty.evaluate).not.toHaveBeenCalled();
    expect(win.VildaPubertalStatus.dane).not.toHaveBeenCalled();
  });

  it('zapisany dodatni wywiad pozostaje widoczny obok oceny czasu i obu prawidłowych porównań', () => {
    const evaluation = evaluate({
      birthDateISO: '2010-10-03',
      puberty: { kind: 'G', stage: 3, assessedAtISO: '2026-10-03', appliesToSample: true },
      onset: { kind: 'G', age: { years: 12, months: 0, days: 0, precision: 'day' } },
      history: { regression: 'yes', cnsSymptoms: 'yes' },
    });
    const assessment = JSON.parse(JSON.stringify(snapshot.create(evaluation)));
    const host = documentDouble().createElement('div');
    ui.renderAssessment(host, assessment, { compact: true });
    const clinical = descendants(host, (node) => node.className === 'vilda-lab-clinical')[0];
    const paragraphs = clinical.children.filter((node) => node.tagName === 'p').map((node) => node.textContent);
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toContain('Ocena dotyczy dostępnych danych o czasie początku');
    expect(paragraphs[1]).toContain('Objawy OUN:');
    expect(paragraphs[2]).toContain('Regresja cech dojrzewania:');
    expect(host.firstChild.getAttribute('data-summary-status')).toBe('attention');
    expect(assessment.evaluation.biochemical.byAge.status).toBe('within');
    expect(assessment.evaluation.biochemical.byStage.status).toBe('within');
    expect(descendants(host, (node) => node.tagName === 'a').some((node) => node.getAttribute('href').includes('PMC9291332'))).toBe(true);
  });

  it('odczyt dawnego snapshotu nie dopisuje nowych akapitów z dodatniego wywiadu', () => {
    const evaluation = evaluate();
    evaluation.engineVersion = '1.0.0';
    evaluation.dataVersion = '2026-10-03.1';
    Object.assign(evaluation.input.history, { regression: 'yes', cnsSymptoms: 'yes' });
    evaluation.clinical.text = 'Treść utrwalona podczas dawnej oceny.';
    const assessment = JSON.parse(JSON.stringify(snapshot.create(evaluation)));
    expect(assessment.status).toBe('recorded');
    const doc = documentDouble();
    const win = { document: doc, VildaLabSnapshot: snapshot, VildaLabPuberty: { evaluate: vi.fn() } };
    loadBrowserScript('vilda_lab_assessment_ui.js', win);
    const host = doc.createElement('div');
    win.VildaLabAssessmentUI.renderAssessment(host, assessment);
    const clinical = descendants(host, (node) => node.className === 'vilda-lab-clinical')[0];
    expect(clinical.children.filter((node) => node.tagName === 'p').map((node) => node.textContent))
      .toEqual(['Treść utrwalona podczas dawnej oceny.']);
    expect(host.textContent).not.toContain('Objawy OUN:');
    expect(host.textContent).not.toContain('Regresja cech dojrzewania:');
    expect(win.VildaLabPuberty.evaluate).not.toHaveBeenCalled();
  });

  it('unieważniona ocena jest neutralna, z poprzednią oceną wyłącznie w zamkniętych szczegółach', () => {
    const doc = documentDouble();
    const host = doc.createElement('div');
    const assessment = snapshot.create(evaluate());
    assessment.status = 'invalidated';
    assessment.reasonCodes = ['result_or_clinical_date_changed'];
    ui.renderAssessment(host, assessment, { compact: true });
    expect(host.firstChild.getAttribute('data-assessment-status')).toBe('invalidated');
    expect(host.firstChild.getAttribute('data-summary-status')).toBe('unavailable');
    expect(host.textContent).toContain('wymaga ponownej oceny');
    const details = descendants(host, (node) => node.tagName === 'details')[0];
    expect(details).toBeDefined();
    expect(details.getAttribute('open')).toBeNull();
    expect(details.textContent).toContain('Poprzednia ocena');
    expect(details.textContent).toContain('zbyt wcześnie');
  });

  it.each([null, {}, { schemaVersion: 2, status: 'recorded', evaluation: evaluate() }])('uszkodzony snapshot pozostaje jawnie niedostępny: %j', (assessment) => {
    const host = documentDouble().createElement('div');
    ui.renderAssessment(host, assessment);
    expect(host.firstChild.getAttribute('data-assessment-status')).toBe('unavailable');
    expect(host.textContent).toContain('Ocena niedostępna');
    expect(host.textContent).not.toContain('zbyt wcześnie');
  });

  it('zapisane treści są tekstem, a link javascript nie staje się aktywnym źródłem', () => {
    const value = evaluate();
    value.clinical.title = '<img src=x onerror=alert(1)>';
    value.biochemical.byAge.range.source.title = '<script>alert(1)</script>';
    value.biochemical.byAge.range.source.url = 'javascript:alert(1)';
    value.input.assay.methodId = '<img src=x onerror=alert(2)>';
    value.biochemical.byAge.range.method = { id: '<img src=x onerror=alert(3)>' };
    const host = documentDouble().createElement('div');
    ui.renderEvaluation(host, value);
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(host.textContent).toContain('<img src=x onerror=alert(2)>');
    expect(host.textContent).toContain('<img src=x onerror=alert(3)>');
    expect(descendants(host, (node) => node.tagName === 'img' || node.tagName === 'script')).toEqual([]);
    expect(descendants(host, (node) => node.tagName === 'a').every((node) => /^https?:\/\//.test(node.getAttribute('href')))).toBe(true);
  });

  it('kolejny render zastępuje poprzedni wynik, a compact zachowuje widoczny alarm', () => {
    const host = documentDouble().createElement('div');
    ui.renderEvaluation(host, evaluate({ value: '11' }), { compact: true });
    ui.renderEvaluation(host, evaluate({ value: '2' }), { compact: true });
    expect(host.children).toHaveLength(1);
    expect(host.textContent).toContain('2 IU/L');
    expect(host.textContent).not.toContain('11 IU/L');
    expect(host.firstChild.className).toContain('is-compact');
  });

  it('istniejący przelicznik może zachować swój wynik bez drugiej liczby w ocenie', () => {
    const host = documentDouble().createElement('div');
    ui.renderEvaluation(host, evaluate({ value: '<LOD' }), { compact: true, hideMeasurement: true });
    expect(descendants(host, (node) => node.className === 'vilda-lab-result')).toEqual([]);
    expect(host.textContent).toContain('nie jest dokładnym punktem');
    expect(host.textContent).toContain('zbyt wcześnie');
  });

  it('przyszła obserwacja nie jest opisana jako potwierdzona, mimo zaznaczonego powiązania', () => {
    const view = ui.buildView(evaluate({ puberty: { kind: 'G', stage: 4, appliesToSample: true, assessedAtISO: '2026-10-04' } }));
    expect(view.context.find((row) => row.label === 'Związek obserwacji z próbką').value).toBe('Niepotwierdzony dla dnia pobrania');
    expect(view.comparisons.find((row) => row.key === 'stage').status).toBe('unavailable');
  });

  it('odczyt pokazuje potwierdzenie pomiaru jąder dla próbki także przy wieku ręcznym bez dat', () => {
    const assessment = snapshot.create(evaluate({
      birthDateISO: null, sampleDateISO: null, age: { years: 6, precision: 'year' }, puberty: {},
      testicularVolume: { value: 4, unit: 'mL', method: 'Prader', appliesToSample: true },
    }));
    const view = ui.buildView(assessment.evaluation);
    expect(view.clinical.code).toBe('early_development');
    expect(view.context.find((row) => row.label === 'Objętość jąder').value).toContain('4 mL · Orchidometr Pradera');
    expect(view.context.find((row) => row.label === 'Związek pomiaru jąder z próbką').value).toBe('Potwierdzony');
  });

  it('źródło obserwacji oraz potwierdzenie trwałego początku są widoczne w zapisanym kontekście', () => {
    const assessment = snapshot.create(evaluate({
      puberty: { kind: 'G', stage: 4, appliesToSample: true, source: 'clinical-examination' },
      onset: { kind: 'G', age: { years: 0, months: 5, precision: 'month' }, confirmedPubertalOnset: true },
    }));
    const view = ui.buildView(assessment.evaluation);
    expect(view.context.find((row) => row.label === 'Źródło obserwacji').value).toBe('Badanie lekarskie');
    expect(view.context.find((row) => row.label === 'Potwierdzenie trwałego początku pokwitania').value).toBe('Potwierdzono');
  });

  it.each([
    [{ preterm: 'yes' }, 'wcześniaka'],
    [{ preterm: 'unknown' }, 'wcześniactwie'],
    [{ treatment: { gnrha: 'yes', sexSteroids: 'no' } }, 'wymaga odrębnego profilu'],
    [{ treatment: { gnrha: 'unknown', sexSteroids: 'unknown' } }, 'Nie ustalono stosowania'],
  ])('ograniczenia niemowlęctwa lub leczenia są zrozumiałym tekstem: %j', (input, expected) => {
    const view = ui.buildView(evaluate({ birthDateISO: '2026-07-03', puberty: {}, ...input }));
    expect(view.limitations.join(' ')).toContain(expected);
    expect(view.comparisons.every((row) => row.status === 'unavailable')).toBe(true);
  });
});

describe('LH/FSH — zapis tekstu wyniku w historii', () => {
  it.each([
    [{ value: '<LOD', unit: 'IU/L' }, '<LOD IU/L'],
    [{ value: '0', unit: 'IU/L' }, '0 IU/L'],
    [{ value: 0, unit: 'IU/L' }, '0 IU/L'],
    [{ value: '2 IU/L = 2 mIU/mL', unit: 'IU/L' }, '2 IU/L = 2 mIU/mL'],
    [{ value: '2 IU/L', unit: 'IU/L' }, '2 IU/L'],
    [{ value: '5 mg/dL', unit: 'mg/dL' }, '5 mg/dL'],
    [{ value: '>2', unit: 'mIU/mL' }, '>2 mIU/mL'],
    [{}, 'Brak wyniku'],
  ])('formatuje %j bez dublowania jednostki', (lab, expected) => {
    expect(ui.formatResult(lab)).toBe(expected);
  });

  it('brak tekstu może uzupełnić ze snapshotu, ale po edycji pokazuje nowy wpis', () => {
    const assessment = snapshot.create(evaluate({ value: '<0,02' }));
    expect(ui.formatResult({ assessment })).toBe('<0,02 IU/L');
    expect(ui.formatResult({ value: '3', unit: 'IU/L', assessment })).toBe('3 IU/L');
  });
});
