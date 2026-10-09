import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_puberty.js');
const data = require('../../vilda_lab_puberty_data.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const ui = require('../../vilda_lab_assessment_ui.js');

// All patients in this suite are synthetic. Every normal case goes through
// the production engine before its saved bounds reach the presentation model.
function evaluate(overrides = {}) {
  const profile = data.profiles.find((entry) => entry.id === 'mayo-lh-pediatric');
  return engine.evaluate({
    analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
    contextBasis: 'current-patient', age: { years: 2, months: 9, precision: 'month' },
    specimen: 'serum', measurementKind: 'unknown', preterm: 'no',
    assay: { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id, confirmation: 'configured' },
    puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true, source: 'current-patient' },
    treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' },
    ...overrides,
  }, data);
}
const confirmed = { measurementKind: 'basal', treatment: { context: 'none', gnrha: 'no', sexSteroids: 'no' } };
function comparison(view, key) { return view.comparisons.find((entry) => entry.key === key); }

function documentDouble() {
  const doc = { createElement: (tag) => new Element(tag) };
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.ownerDocument = doc; this._text = ''; this.listeners = {}; }
    set textContent(value) { this.children = []; this._text = String(value); }
    get textContent() { return this._text + this.children.map((child) => child.textContent).join(' '); }
    set innerHTML(_) { throw new Error('HTML assignment is forbidden'); }
    get firstChild() { return this.children[0] || null; }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children = this.children.filter((value) => value !== child); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    click() { this.listeners.click?.(); }
  }
  return doc;
}
function descendants(element, predicate) {
  return element.children.flatMap((child) => [...(predicate(child) ? [child] : []), ...descendants(child, predicate)]);
}
function hasClass(element, value) { return (element.className || '').split(' ').includes(value); }
function visibleText(element) {
  return element.tagName === 'details' ? '' : element._text + ' ' + element.children.map(visibleText).join(' ');
}
function render(evaluation, options) {
  const host = documentDouble().createElement('div');
  ui.renderEvaluation(host, evaluation, options);
  return host;
}

describe('LH/FSH — osie z zapisanych zakresów i wspólny próg wyróżnienia', () => {
  it('LH 2 u chłopca 2 lata 9 miesięcy G3 wyróżnia wiek, zachowując osobne stadium i warunki', () => {
    const evaluation = evaluate();
    const original = JSON.stringify(evaluation);
    const view = ui.buildView(evaluation);
    expect(comparison(view, 'age')).toMatchObject({ status: 'above', conditional: true, visualState: 'is-uwaga-high', axis: { min: 0, max: 7, lower: null, upper: 0.5, value: 2 } });
    expect(comparison(view, 'stage')).toMatchObject({ status: 'within', conditional: true, visualState: 'is-normal', shortTitle: 'Dla stadium G3', axis: { min: 0, max: 7, lower: 0.09, upper: 4.2, value: 2 } });
    expect(view.result).toMatchObject({ visualState: 'is-uwaga-high', visualAlert: { label: 'Uwaga — znacznie powyżej normy', scope: 'Względem wieku', conditional: true } });
    expect(view.clinical.title).toContain('zbyt wcześnie');
    expect(JSON.stringify(evaluation)).toBe(original);
  });

  it.each([['1', 'is-above'], ['1.001', 'is-uwaga-high']])('ścisła granica górna: LH %s → %s', (value, state) => {
    const view = ui.buildView(evaluate({ value, ...confirmed }));
    expect(comparison(view, 'age').visualState).toBe(state);
    expect(view.result.visualAlert?.conditional || false).toBe(false);
    expect(!!view.result.visualAlert).toBe(state === 'is-uwaga-high');
  });

  it.each([['0.045', 'is-below'], ['0.044', 'is-uwaga-low']])('ścisła granica dolna G3: LH %s → %s', (value, state) => {
    const view = ui.buildView(evaluate({ value, age: { years: 16, months: 0, precision: 'month' }, ...confirmed }));
    expect(comparison(view, 'stage')).toMatchObject({ status: 'below', visualState: state });
    if (state === 'is-uwaga-low') expect(view.result.visualAlert).toMatchObject({ label: 'Uwaga — znacznie poniżej normy', scope: 'Względem wieku i stadium G3', conditional: false });
  });

  it('alarm kliniczny nie zmienia prawidłowych stężeń FSH w czerwone osie', () => {
    const profile = data.profiles.find((entry) => entry.id === 'mayo-fsh-pediatric');
    const view = ui.buildView(evaluate({ analyte: 'fsh', value: '1', assay: { profileId: profile.id, profileVersion: profile.version, methodId: profile.method.id, confirmation: 'configured' }, ...confirmed }));
    expect(view.clinical.status).toBe('warning');
    expect(view.comparisons.slice(0, 2).map((entry) => entry.visualState)).toEqual(['is-normal', 'is-normal']);
    expect(view.result.visualAlert).toBeNull();
    expect(view.result.visualState).toBe('');
  });

  it.each(['<LOD', '<LOQ', '<0.02', '≤0.02', '>5', '≥5'])('wynik %s zachowuje zakres, ale nie dostaje punktu ani znacznego odchylenia', (value) => {
    const evaluation = evaluate({ value, ...confirmed });
    const view = ui.buildView(evaluation);
    expect(view.comparisons.slice(0, 2).every((entry) => entry.axis?.value === null && entry.visualState === '')).toBe(true);
    expect(view.result.visualAlert).toBeNull();
    const host = render(evaluation);
    expect(descendants(host, (node) => hasClass(node, 'vilda-lab-axis'))).toHaveLength(2);
    expect(descendants(host, (node) => hasClass(node, 'vilda-lab-axis-marker'))).toHaveLength(0);
    expect(descendants(host, (node) => hasClass(node, 'vilda-lab-motion-toggle'))).toHaveLength(0);
  });

  it.each([
    { assay: { confirmation: 'unknown' } },
    { measurementKind: 'stimulated' },
    { treatment: { context: 'hormonal', gnrha: 'unknown', sexSteroids: 'unknown' } },
    { value: '-1' },
    { unit: 'mg/dL' },
  ])('niedostępna ocena nie odzyskuje osi przez warstwę graficzną: %j', (overrides) => {
    const view = ui.buildView(evaluate(overrides));
    expect(view.comparisons.every((entry) => entry.axis === null && entry.visualState === '')).toBe(true);
    expect(view.result.visualAlert).toBeNull();
  });

  it('dolna granica oznaczalności nie staje się minimum; dokładne zero pozostaje punktem', () => {
    const evaluation = evaluate({ value: '0', puberty: {}, ...confirmed });
    const view = ui.buildView(evaluation);
    expect(comparison(view, 'age')).toMatchObject({ status: 'within', visualState: 'is-normal', axis: { lower: null, value: 0 } });
    expect(view.result.visualAlert).toBeNull();
    const host = render(evaluation);
    const axis = descendants(host, (node) => hasClass(node, 'vilda-lab-axis'))[0];
    expect(axis.getAttribute('data-patient-value')).toBe('0');
    expect(axis.getAttribute('data-range-lower')).toBe('unknown');
    expect(axis.getAttribute('style')).toContain('--value:0%;');
    expect(descendants(axis, (node) => hasClass(node, 'vilda-lab-axis-below'))).toHaveLength(0);
    expect(descendants(axis, (node) => hasClass(node, 'is-open-lower'))).toHaveLength(1);
  });

  it('zakres z wydruku nie rozszerza osi wieku i stadium ani nie steruje ich alarmem', () => {
    const original = evaluate({ ...confirmed });
    const withReported = evaluate({ reportedRange: { text: '100–1000', unit: 'IU/L' }, ...confirmed });
    expect(withReported.reportedRange.status).toBe('below');
    expect(ui.buildView(withReported).comparisons.map((entry) => entry.axis)).toEqual(ui.buildView(original).comparisons.map((entry) => entry.axis));
    expect(ui.buildView(withReported).result.visualAlert).toEqual(ui.buildView(original).result.visualAlert);
  });

  it.each([
    { lower: { operator: '>=', value: 5 }, upper: { operator: '<=', value: 1 } },
    { lower: { operator: '>=', value: 1 }, upper: { operator: '<', value: 1 } },
    { upper: { operator: '<=', value: Infinity } },
    { upper: { operator: '<=', value: -1 } },
  ])('uszkodzone zapisane granice nie tworzą współrzędnych ani efektu: %j', (bounds) => {
    const evaluation = evaluate({ ...confirmed });
    evaluation.biochemical.byAge.range.bounds = bounds;
    const row = comparison(ui.buildView(evaluation), 'age');
    expect(row.axis).toBeNull();
    expect(row.visualState).toBe('');
  });

  it('duży wynik mieści się we wspólnej skali bez przyklejania do jej końca', () => {
    const view = ui.buildView(evaluate({ value: '100', ...confirmed }));
    const age = comparison(view, 'age').axis, stage = comparison(view, 'stage').axis;
    expect(age.max).toBe(stage.max);
    expect(age.max).toBeGreaterThan(100);
    expect(age.value / age.max).toBeLessThan(1);
    expect(view.result.visualAlert.scope).toBe('Względem wieku i stadium G3');
  });
});

describe('LH/FSH — prezentacja, dostępność i stan animacji', () => {
  it.each(['2', '0', '100000000000000000000', '<LOD'])('inline przechowuje tylko skończone współrzędne i rezerwę krawędzi etykiety dla %s', (value) => {
    const evaluation = evaluate({ value });
    evaluation.clinical.title = 'Fikcyjna treść; color: red; --value: NaN';
    const host = render(evaluation);
    const styled = descendants(host, (node) => node.getAttribute('style') !== null);
    expect(styled).toHaveLength(2);
    for (const axis of styled) {
      expect(hasClass(axis, 'vilda-lab-axis')).toBe(true);
      const declarations = axis.getAttribute('style').split(';').filter(Boolean).map((entry) => entry.split(':'));
      expect(declarations.map(([key]) => key)).toEqual(value === '<LOD' ? ['--low', '--high'] : ['--low', '--high', '--value', '--label-edge']);
      for (const [key, cssValue] of declarations) {
        const unit = key === '--label-edge' ? 'em' : '%';
        expect(cssValue.endsWith(unit)).toBe(true);
        const coordinate = Number(cssValue.slice(0, -unit.length));
        expect(Number.isFinite(coordinate)).toBe(true);
        expect(coordinate).toBeGreaterThanOrEqual(0);
        if (unit === '%') expect(coordinate).toBeLessThanOrEqual(100);
        else expect(coordinate).toBeGreaterThanOrEqual(2);
      }
      expect(axis.getAttribute('style')).not.toMatch(/color|animation|border|NaN|Infinity/);
    }
  });

  it('osie mają wspólną skalę i pełny opis dostępny; metadane są w jednym rozwinięciu', () => {
    const host = render(evaluate(), { compact: true });
    const axes = descendants(host, (node) => node.getAttribute('role') === 'img');
    expect(axes).toHaveLength(2);
    expect(axes[0].getAttribute('aria-label')).toContain('Wynik 2 IU/L');
    expect(axes[0].getAttribute('aria-label')).toContain('Liczbowo powyżej zakresu — warunkowo');
    expect(axes[0].getAttribute('aria-label')).toContain('≤0,5 IU/L');
    expect(axes[0].getAttribute('data-axis-max')).toBe(axes[1].getAttribute('data-axis-max'));
    expect(axes[0].getAttribute('data-patient-value')).toBe(axes[1].getAttribute('data-patient-value'));
    expect(descendants(host, (node) => node.tagName === 'details')).toHaveLength(1);
    expect(visibleText(host)).not.toContain('AnshLite LH CLIA');
    expect(host.textContent).toContain('AnshLite LH CLIA');
    expect(host.textContent).not.toContain('Z zapisanej konfiguracji oznaczenia:');
    expect(visibleText(host)).toContain('Rodzaju badania i leczenia nie ustalono.');
  });

  it('nie oferuje ręcznej pauzy; dawne opcje nie wyłączają wyróżnienia znacznego odchylenia', () => {
    const onMotionChange = vi.fn();
    const host = render(evaluate(), { hideMeasurement: true, motionPaused: true, onMotionChange });
    expect(descendants(host, (node) => hasClass(node, 'vilda-lab-motion-toggle'))).toHaveLength(0);
    expect(descendants(host, (node) => node.tagName === 'button')).toHaveLength(0);
    expect(host.firstChild.className).not.toContain('is-motion-paused');
    expect(onMotionChange).not.toHaveBeenCalled();
    expect(host.textContent).not.toMatch(/Zatrzymaj animacje|Wznów animacje/);
    expect(descendants(host, (node) => hasClass(node, 'vilda-lab-axis'))).toHaveLength(2);
    expect(descendants(host, (node) => hasClass(node, 'vilda-lab-axis-marker') && hasClass(node, 'is-uwaga-high'))).toHaveLength(1);
    expect(host.textContent).toContain('Znacznie powyżej normy · warunkowo');
    expect(descendants(host, (node) => hasClass(node, 'vilda-lab-result'))).toHaveLength(0);
    expect(descendants(host, (node) => hasClass(node, 'vilda-lab-status-icon'))[0].textContent).toBe('!');
  });

  it('dawna unieważniona ocena pozostaje w zamkniętej historii bez przycisku wznawiania ruchu', () => {
    const assessment = snapshot.create(evaluate());
    assessment.status = 'invalidated';
    assessment.reasonCodes = ['result_or_clinical_date_changed'];
    const host = documentDouble().createElement('div');
    ui.renderAssessment(host, assessment);
    expect(visibleText(host)).not.toContain('Uwaga — znacznie');
    const history = descendants(host, (node) => hasClass(node, 'vilda-lab-history'))[0];
    expect(history.getAttribute('open')).toBeNull();
    expect(descendants(history, (node) => hasClass(node, 'vilda-lab-axis'))).toHaveLength(2);
    expect(descendants(history, (node) => hasClass(node, 'vilda-lab-motion-toggle'))).toHaveLength(0);
  });

  it('OUN i regresja oraz odrębny tytuł ostrzeżenia zostają poza zwiniętymi szczegółami', () => {
    const evaluation = evaluate({ age: { years: 16, months: 0, precision: 'month' }, history: { cnsSymptoms: 'yes', regression: 'yes' }, ...confirmed });
    expect(evaluation.summary.status).toBe('attention');
    expect(evaluation.summary.title).not.toBe(evaluation.clinical.title);
    const host = render(evaluation, { compact: true });
    const visible = visibleText(host);
    for (const paragraph of evaluation.clinical.text.split(/\n\s*\n/)) expect(visible).toContain(paragraph);
    expect(visible).toContain(evaluation.summary.title);
    expect(visible).toContain('Objawy OUN:');
    expect(visible).toContain('Regresja cech dojrzewania:');
  });
});
