import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_testosterone.js');
const data = require('../../vilda_lab_testosterone_data.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const renderer = require('../../vilda_lab_assessment_ui.js');
const form = require('../../vilda_lab_puberty_ui.js');

function evaluate(overrides = {}) {
  return engine.evaluate({
    analyte: 'testosterone_total', value: '200', unit: 'ng/dL', sex: 'M',
    age: { years: 14, months: 0, precision: 'month' }, contextBasis: 'current-patient', referenceSelection: 'automatic',
    puberty: { kind: 'G', stage: 3, appliesToCurrentContext: true }, ...overrides,
  }, data);
}

// The production mount and renderer run on this small text-only DOM. It models
// moves, controls and change listeners; HTML assignment is deliberately rejected.
function documentDouble() {
  const doc = {
    createElement: tag => new Element(tag),
    createTextNode: value => { const node = new Element('#text'); node.textContent = value; return node; },
    getElementById: id => descendants(doc.body, node => node.id === id)[0] || null,
    activeElement: null,
  };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.attributes = {}; this.dataset = {};
      this.ownerDocument = doc; this._text = ''; this._value = null; this.className = ''; this.listeners = {};
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: name => { if (!this.classList.contains(name)) this.className += ' ' + name; },
        remove: name => { this.className = this.className.split(/\s+/).filter(item => item !== name).join(' '); },
        toggle: (name, enabled) => { if (enabled) this.classList.add(name); else this.classList.remove(name); },
      };
    }
    get value() { return this._value ?? (this.tagName === 'SELECT' ? this.options[0]?.value || '' : ''); }
    set value(value) { this._value = String(value); }
    get options() { return this.children.filter(child => child.tagName === 'OPTION'); }
    set textContent(value) { this.replaceChildren(); this._text = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(' '); }
    set innerHTML(_) { throw new Error('HTML assignment is forbidden'); }
    get firstChild() { return this.children[0] || null; }
    appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); this.children.push(child); child.parentNode = this; return child; }
    insertBefore(child, next) { if (child.parentNode) child.parentNode.removeChild(child); const index = this.children.indexOf(next); this.children.splice(index < 0 ? this.children.length : index, 0, child); child.parentNode = this; return child; }
    removeChild(child) { this.children = this.children.filter(value => value !== child); child.parentNode = null; return child; }
    replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = ''; for (const child of children) this.appendChild(child); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    addEventListener(event, callback) { (this.listeners[event] ||= []).push(callback); }
    change(value) { this.value = value; for (const callback of this.listeners.change || []) callback({ target: this }); }
    querySelector(selector) { return descendants(this, node => selector.startsWith('.') ? node.classList.contains(selector.slice(1)) : selector.startsWith('#') ? node.id === selector.slice(1) : node.tagName === selector.toUpperCase())[0] || null; }
  }
  doc.body = doc.createElement('body');
  for (const id of ['labStep4', 'labStep5']) {
    const step = doc.createElement('section'); step.id = id; doc.body.appendChild(step);
    const body = doc.createElement('div'); body.className = 'lab-step-body'; step.appendChild(body);
    const label = doc.createElement('label'); label.className = 'lab-step-label'; label.appendChild(doc.createTextNode('Pacjent')); body.appendChild(label);
  }
  for (const id of ['labResultSection', 'labRangeBlock', 'labResultBig', 'labResultStatus', 'labResultsBody', 'labMeta', 'labValue', 'labResultSourceLine', 'labSourcesWrap', 'labInfoCard']) {
    const node = doc.createElement('div'); node.id = id; doc.body.appendChild(node);
  }
  return doc;
}
function descendants(element, predicate = () => true) {
  return element.children.flatMap(child => [...(predicate(child) ? [child] : []), ...descendants(child, predicate)]);
}
function mount(options = {}) {
  const document = documentDouble();
  let context = { sourceStatus: 'ready', identityKey: 'fictional-tt-person', sex: 'M', ageYears: 14, ageMonths: 0 };
  const evaluateSpy = vi.fn(engine.evaluate), onChange = vi.fn();
  const ui = (options.formModule || form).mount({ document, renderer, snapshot, testosteroneEngine: { ...engine, evaluate: evaluateSpy }, testosteroneData: data,
    readPatientContext: () => context, onChange, ...options });
  ui.setAnalyte('testosterone_total'); ui.setPatientContext(context);
  return { document, ui, evaluateSpy, onChange, setContext: next => { context = { ...context, ...next }; }, byId: id => document.getElementById(id) };
}

function deepFreeze(value) {
  Object.values(value).forEach(item => { if (item && typeof item === 'object') deepFreeze(item); });
  return Object.freeze(value);
}

describe('TT — pure presentation of canonical evaluation', () => {
  it('projects the two axes into the chosen unit without changing values, bounds or statuses in the evaluation', () => {
    const evaluated = deepFreeze(evaluate());
    const saved = JSON.stringify(evaluated);
    const molar = renderer.buildView(evaluated, { displayUnit: 'nmol/L' });
    const mass = renderer.buildView(evaluated, { displayUnit: 'ng/dL' });
    const nanogram = renderer.buildView(evaluated, { displayUnit: 'ng/mL' });
    expect(mass.valid).toBe(true);
    for (const key of ['age', 'stage']) {
      const original = molar.comparisons.find(row => row.key === key), projected = mass.comparisons.find(row => row.key === key);
      expect(projected.status).toBe(original.status);
      expect(projected.axis.value).toBeCloseTo(200, 10);
      expect(projected.axis.upper).toBeCloseTo(original.axis.upper / 0.03467, 10);
      expect(projected.axis.unit).toBe('ng/dL');
      expect(nanogram.comparisons.find(row => row.key === key).axis.value).toBeCloseTo(2, 10);
    }
    expect(mass.comparisons[0].axis.max).toBe(mass.comparisons[1].axis.max);
    expect(molar.result.text).toBe('6,934 nmol/L');
    expect(JSON.stringify(evaluated)).toBe(saved);
  });

  it('keeps an unknown source lower boundary open and does not label it as a detection limit or a full within result', () => {
    const view = renderer.buildView(evaluate({ value: '6', age: { years: 7, precision: 'year' }, puberty: {} }), { displayUnit: 'ng/dL' });
    expect(view.comparisons[0]).toMatchObject({ status: 'indeterminate', axis: { lower: null, upper: 20, value: 6 }, rangeText: '<7 (dolny kraniec nieokreślony); ≤20 ng/dL' });
    expect(view.comparisons[0].visualLabel).not.toBe('W zakresie');
    expect(view.upperOnlyNote).toContain('nieokreślony');
    expect(view.comparisons[0].rangeText).not.toMatch(/LOD|LOQ|oznaczalności/);
    expect(view.presentation.limitations.join(' ')).toContain('dolnego krańca nie można ocenić');
    expect(view.pretermProfile).toBe(false);
  });

  it.each([['6', 'indeterminate'], ['7', 'within'], ['20', 'within'], ['21', 'above']])('renders %s ng/dL with only the known upper boundary and preserves status %s', (raw, status) => {
    const document = documentDouble(), host = document.createElement('div');
    const evaluated = deepFreeze(evaluate({ value: raw, age: { years: 7, precision: 'year' }, puberty: {} }));
    const view = renderer.renderEvaluation(host, evaluated, { displayUnit: 'ng/dL' });
    expect(view.comparisons[0]).toMatchObject({ status, axis: { lower: null, upper: 20, unknownLower: true } });
    const axis = descendants(host, node => node.classList.contains('vilda-lab-axis'))[0];
    expect(axis.getAttribute('data-reference-display')).toBe('upper-bound-only');
    expect(axis.getAttribute('data-range-lower')).toBe('unknown');
    expect(Number(axis.getAttribute('data-patient-value'))).toBeCloseTo(Number(raw), 10);
    expect(descendants(axis, node => node.classList.contains('vilda-lab-axis-band'))).toHaveLength(0);
    expect(descendants(axis, node => node.classList.contains('vilda-lab-axis-bound') && node.classList.contains('is-lower'))).toHaveLength(0);
    expect(descendants(axis, node => node.classList.contains('vilda-lab-axis-bound') && node.classList.contains('is-upper'))).toHaveLength(1);
    expect(descendants(host, node => node.classList.contains('vilda-lab-legend-band'))).toHaveLength(0);
    expect(host.textContent).toContain('zaznaczono tylko górną granicę');
  });

  it('retains the reference band when both TT boundaries are actually known', () => {
    const document = documentDouble(), host = document.createElement('div');
    renderer.renderEvaluation(host, evaluate({ age: { years: 15, months: 0, precision: 'month' } }), { displayUnit: 'ng/dL' });
    expect(descendants(host, node => node.classList.contains('vilda-lab-axis-band'))).toHaveLength(2);
    expect(descendants(host, node => node.classList.contains('vilda-lab-legend-band'))).toHaveLength(1);
  });

  it.each(['<6', '≤6', '>200', '≥200', '<LOD', '<LOQ'])('keeps %s censored and draws no numeric patient point after conversion', raw => {
    const view = renderer.buildView(evaluate({ value: raw }), { displayUnit: 'nmol/L' });
    expect(view.result.censored).toBe(true);
    expect(view.comparisons.filter(row => row.axis).every(row => row.axis.value === null)).toBe(true);
    expect(view.result.text).toMatch(/^(<|≤|>|≥)/);
    const document = documentDouble(), host = document.createElement('div');
    renderer.renderEvaluation(host, evaluate({ value: raw }), { displayUnit: 'nmol/L' });
    expect(descendants(host, node => node.getAttribute('data-patient-value') !== null)).toHaveLength(0);
  });

  it('keeps the adult clinical note visible for a numerically within result and cites ES/EAU', () => {
    const document = documentDouble(), host = document.createElement('div');
    const view = renderer.renderEvaluation(host, evaluate({ value: '500', age: { years: 45, precision: 'year' }, puberty: {} }), { compact: true });
    expect(view.adultProfile).toBe(true);
    const note = descendants(host, node => node.classList.contains('vilda-lab-clinical'))[0];
    expect(note.textContent).toContain(data.clinicalGuidance.adult.shortText);
    expect(note.textContent).not.toContain('Rozwój płciowy');
    expect(view.presentation.clinicalSources.some(source => source.label.includes('Endocrine Society'))).toBe(true);
    expect(view.presentation.clinicalSources.some(source => source.label.includes('EAU'))).toBe(true);
    expect(descendants(host, node => node.getAttribute('data-comparison') === 'stage')).toHaveLength(0);
  });

  it('does not apply the unrelated LH severity multiplier to high TT concentrations', () => {
    const view = renderer.buildView(evaluate({ value: '10000' }));
    expect(view.comparisons[0].status).toBe('above');
    expect(view.result.visualState).toBe('is-above');
    expect(view.result.visualAlert).toBeNull();
  });

  it('does not re-read reference data or the engine when rendering a recorded assessment', () => {
    const assessment = snapshot.create(evaluate());
    expect(assessment.status).toBe('recorded');
    const browser = { VildaLabSnapshot: snapshot };
    loadBrowserScript('vilda_lab_testosterone_units.js', browser);
    loadBrowserScript('vilda_lab_assessment_ui.js', browser);
    const document = documentDouble(), host = document.createElement('div');
    const view = browser.VildaLabAssessmentUI.renderAssessment(host, assessment, { displayUnit: 'ng/dL' });
    expect(view.valid).toBe(true);
    expect(view.comparisons[0].axis.value).toBeCloseTo(200, 10);
    expect(browser.VildaLabTestosterone).toBeUndefined();
    expect(browser.VildaLabTestosteroneData).toBeUndefined();
  });
});

describe('TT — shared form and one effective patient context', () => {
  it.each([null, -1])('keeps conversion but never chooses an adult female range for age %s', ageYears => {
    const { ui, byId, setContext } = mount();
    setContext({ sex: 'F', ageYears, ageMonths: null });
    const evaluated = ui.render({ raw: '1', unit: 'nmol/L', targetUnit: 'ng/dL' });
    expect(evaluated.referenceSelection.status).toBe('unavailable');
    expect(evaluated).not.toHaveProperty('referencePreview');
    expect(byId('labResultBig').textContent).toContain('ng/dL');
    expect(descendants(byId('labPubertyAssessment'), node => node.getAttribute('data-patient-value') !== null)).toHaveLength(0);
    expect(ui.getAssessment().status).toBe('recorded');
  });

  it('carries known female pregnancy and treatment through the real form into its saved assessment', () => {
    const { ui, setContext } = mount({ readMeasurementContext: () => ({ pregnancy: 'yes', reproductiveContext: 'pregnancy',
      treatment: { cocp: 'yes', exogenousTestosterone: 'yes' } }) });
    setContext({ sex: 'F', ageYears: 35, gnrhaStatus: 'w-trakcie' });
    const evaluated = ui.render({ raw: '6', unit: 'nmol/L', targetUnit: 'nmol/L' });
    expect(evaluated.input).toMatchObject({ pregnancy: 'yes', reproductiveContext: 'pregnancy',
      treatment: { gnrha: 'yes', cocp: 'yes', exogenousTestosterone: 'yes' } });
    expect(evaluated.referenceSelection.status).toBe('unavailable');
    expect(evaluated.clinical.code).not.toBe('female_androgen_excess_action');
    expect(ui.getAssessment()).toMatchObject({ status: 'recorded', evaluation: { input: { pregnancy: 'yes',
      treatment: { gnrha: 'yes', cocp: 'yes', exogenousTestosterone: 'yes' } } } });
  });

  it('preserves boolean facts supplied by existing callers instead of replacing known treatment with unknown', () => {
    const input = form.buildInput({ sex: 'F', pregnancy: true, cocp: true, exogenousTestosterone: false },
      { analyte: 'testosterone_total', raw: '6', unit: 'nmol/L' });
    expect(input).toMatchObject({ pregnancy: 'yes', treatment: { cocp: 'yes', exogenousTestosterone: 'no' } });
  });

  it('shows only a source upper bound for female <7 and never places <LOD at an exact value', () => {
    const document = documentDouble(), host = document.createElement('div');
    const female = { sex: 'F', value: '6', puberty: { kind: 'Th', stage: 3, appliesToCurrentContext: true } };
    renderer.renderEvaluation(host, evaluate(female), { displayUnit: 'ng/dL' });
    expect(descendants(host, node => node.classList.contains('vilda-lab-axis-band'))).toHaveLength(0);
    expect(descendants(host, node => node.getAttribute('data-comparison') === 'stage')).toHaveLength(0);
    expect(host.textContent).toContain('dolnego krańca nie można ocenić');
    renderer.renderEvaluation(host, evaluate({ ...female, value: '<LOD' }), { displayUnit: 'ng/dL' });
    expect(descendants(host, node => node.getAttribute('data-patient-value') !== null)).toHaveLength(0);
    expect(host.textContent).toContain('<LOD');
  });

  it.each([
    ['1', 'reference_comparison_only', 'Society for Endocrinology'],
    ['0.1', 'female_low_testosterone_not_diagnostic', 'Global Consensus'],
    ['6', 'female_androgen_excess_action', 'Society for Endocrinology'],
  ])('renders female TT %s with the proper clinical sources and without male hypogonadism notes', (value, code, citation) => {
    const document = documentDouble(), host = document.createElement('div');
    const view = renderer.renderEvaluation(host, evaluate({ sex: 'F', value, unit: 'nmol/L',
      age: { years: 35, months: 0, precision: 'month' }, puberty: {} }));
    expect(view.clinical.code).toBe(code);
    expect(host.textContent).toContain(citation);
    expect(host.textContent).not.toMatch(/EAU|Bhasin|hipogonadyzmu|pewny guz/);
    expect(host.textContent).not.toContain('dodatkowe ograniczenie, którego ta wersja');
  });

  it('preserves known assay, material, protocol, treatment and collection time under automatic reference selection', () => {
    const input = form.buildInput({ contextBasis: 'current-patient', referenceSelection: 'automatic', sex: 'M', ageYears: '14',
      assay: { profileId: 'known-profile', profileVersion: '1', methodId: 'known-assay', confirmation: 'reported' },
      collectionTime: 'evening', specimen: 'urine', measurementKind: 'stimulated', gnrha: 'yes', sexSteroids: 'no', treatmentContext: 'hormonal',
    }, { analyte: 'testosterone_total', raw: '1 000', unit: 'ng/dL' });
    expect(input).toMatchObject({ value: '1 000', collectionTime: 'evening', specimen: 'urine', measurementKind: 'stimulated',
      assay: { profileId: 'known-profile', methodId: 'known-assay', confirmation: 'reported' }, treatment: { gnrha: 'yes', sexSteroids: 'no', context: 'hormonal' } });
    const unknown = form.buildInput({ referenceSelection: 'automatic' }, { analyte: 'testosterone_total', raw: '3', unit: 'nmol/L' });
    expect(unknown).toMatchObject({ collectionTime: 'unknown', measurementKind: 'unknown', specimen: 'unknown', treatment: { gnrha: 'unknown', sexSteroids: 'unknown' }, assay: { confirmation: 'unknown' } });
  });

  it('uses real conversions in the large value and copyable table, retaining canonical assessment values', () => {
    const { ui, byId } = mount();
    const evaluated = ui.render({ raw: '1 000', unit: 'ng/dL', targetUnit: 'nmol/L' });
    expect(byId('labResultBig').textContent).toContain('34,67');
    expect(byId('labResultBig').textContent).toContain('nmol/L');
    const cells = descendants(byId('labResultsBody'), node => !!node.dataset.copyText);
    expect(cells.map(cell => cell.dataset.copyText)).toEqual(['34,67 nmol/L', '10 ng/mL', '10000 pg/mL']);
    expect(evaluated.measurement).toMatchObject({ sourceValue: 1000, value: 34.67, unit: 'nmol/L' });
    expect(byId('labMeta').textContent).not.toContain('liczbowo równoważne');
  });

  it('changes M→F→unknown→M through one engine and records the female age comparison', () => {
    const { ui, byId, evaluateSpy, onChange } = mount();
    const measurement = { raw: '200', unit: 'ng/dL', targetUnit: 'ng/dL' };
    ui.render(measurement); expect(evaluateSpy).toHaveBeenCalledTimes(1);
    ui.getEffectiveContext(); ui.getLegacyPatient(); ui.isLegacyFemale();
    expect(onChange).not.toHaveBeenCalled();
    byId('labPubertySex').change('F');
    expect(ui.getEffectiveContext()).toMatchObject({ sex: 'F', isLegacyFemale: false });
    expect(ui.getLegacyPatient()).toMatchObject({ sex: 'F', age: 14, life_stage: 'pediatric' });
    expect(ui.getLegacyPatient()).not.toHaveProperty('tanner');
    expect(ui.render(measurement).referencePreview.byAge.range).toMatchObject({ sex: 'F', bounds: { upper: { value: 75 * 0.03467 } } });
    expect(ui.getAssessment()).toMatchObject({ status: 'recorded', evaluation: { input: { sex: 'F' } } });
    expect(byId('labPubertyAssessment').hidden).toBe(false);
    expect(byId('labResultSourceLine').classList.contains('lab-puberty-suppressed')).toBe(true);
    expect(byId('labStep5').classList.contains('lab-puberty-step-active')).toBe(true);
    expect(byId('labPubertyPatientContext').textContent).not.toContain('dotychczasowe zakresy');
    byId('labPubertySex').change('');
    expect(ui.isLegacyFemale()).toBe(false);
    expect(ui.render(measurement).referenceSelection.reasonCodes).toContain('missing_sex');
    byId('labPubertySex').change('M');
    expect(ui.render(measurement).referencePreview.byAge.range.sex).toBe('M');
    expect(byId('labPubertyAssessment').hidden).toBe(false);
    expect(byId('labResultSourceLine').classList.contains('lab-puberty-suppressed')).toBe(true);
  });

  it('keeps female Th editing unavailable for this age-only TT source and restores G without changing shared observations', () => {
    const browser = {};
    loadBrowserScript('vilda_puberty_assessment.js', browser);
    let editor;
    browser.VildaPubertyAssessmentUI = {
      mountEditor: (_host, options) => { editor = options; return { render() {} }; },
      summary: () => 'Ocena pokwitania',
    };
    loadBrowserScript('vilda_lab_puberty_ui.js', browser);
    const editObservation = vi.fn(() => ({ ok: true }));
    const { ui, byId, setContext } = mount({ formModule: browser.VildaLabPubertyUI,
      pubertyContext: { editObservation }, engine: require('../../vilda_lab_puberty.js'), data: require('../../vilda_lab_puberty_data.js') });
    const sharedContext = { available: true, scope: 'visit', assessmentContext: { status: 'absent', assessment: null, legacy: null } };
    setContext({ pubertyAssessmentContext: sharedContext, gonadalObservation: { kind: 'G', stage: 3, current: true } });
    ui.getEffectiveContext();
    expect(byId('labPubertyStageSummary').parentNode.hidden).toBe(false);
    expect(byId('labPubertySharedEditor').hidden).toBe(false);
    setContext({ sex: 'F', gonadalObservation: { kind: 'Th', stage: 1, current: true } });
    const femaleInput = ui.getEffectiveContext().input;
    expect(femaleInput.puberty).toMatchObject({ kind: 'Th', stage: 1 });
    expect(byId('labPubertyStageSummary').parentNode.hidden).toBe(true);
    expect(byId('labPubertyRefineStage').disabled).toBe(true);
    expect(byId('labPubertyOpenStage').disabled).toBe(true);
    expect(byId('labPubertySharedEditor').hidden).toBe(true);
    expect(byId('labPubertySectionStage')).toMatchObject({ hidden: true, inert: true });
    expect(byId('labPubertyPatientContext').textContent).not.toContain('dotychczasowe zakresy');
    expect(editor.onEdit('Th', 5)).toEqual({ ok: false, reason: 'stage-reference-not-established' });
    expect(editObservation).not.toHaveBeenCalled();
    expect(ui.getEffectiveContext().input.puberty).toEqual(femaleInput.puberty);
    ui.setAnalyte('lh');
    expect(byId('labPubertySharedEditor').hidden).toBe(false);
    expect(byId('labPubertyRefineStage').disabled).toBe(false);
    expect(byId('labPubertySectionStage').inert).toBe(false);
    ui.setAnalyte('testosterone_total');
    expect(byId('labPubertySharedEditor').hidden).toBe(true);
    setContext({ sex: 'M', gonadalObservation: { kind: 'G', stage: 3, current: true } });
    expect(ui.getEffectiveContext().input.puberty).toMatchObject({ kind: 'G', stage: 3 });
    expect(byId('labPubertyStageSummary').parentNode.hidden).toBe(false);
    expect(byId('labPubertySharedEditor').hidden).toBe(false);
    expect(byId('labPubertyRefineStage').disabled).toBe(false);
    expect(byId('labPubertySectionStage').inert).toBe(false);
    expect(editor.onEdit('G', 4)).toEqual({ ok: true });
    expect(editObservation).toHaveBeenCalledWith('G', 4);
  });

  it('opens the male stage editor after switching back from the female age-only profile', () => {
    const { ui, byId } = mount();
    const open = () => byId('labPubertyRefineStage').listeners.click[0]();
    expect(() => open()).not.toThrow();
    expect(byId('labPubertySectionStage').hidden).toBe(false);
    byId('labPubertySex').change('F');
    expect(() => open()).not.toThrow();
    expect(byId('labPubertySectionStage').hidden).toBe(true);
    byId('labPubertySex').change('M');
    expect(() => open()).not.toThrow();
    expect(byId('labPubertySectionStage').hidden).toBe(false);
  });

  it('discards local sex and old measurement when the patient changes', () => {
    const { ui, byId, setContext } = mount();
    byId('labPubertySex').change('F');
    setContext({ identityKey: 'fictional-other-person', sex: 'M', ageYears: 7 });
    const evaluated = ui.render({ raw: '200', unit: 'ng/dL', targetUnit: 'ng/dL' });
    expect(ui.getEffectiveContext()).toMatchObject({ sex: 'M', isLegacyFemale: false });
    expect(evaluated.measurement.status).toBe('invalid');
    expect(evaluated.measurement.raw).toBe('');
  });

  it('does not let a routing getter erase patient invalidation before pinning an old value', () => {
    const { ui, setContext } = mount();
    ui.render({ raw: '200', unit: 'ng/dL', targetUnit: 'ng/dL' });
    setContext({ identityKey: 'fictional-next-person', ageYears: 7 });
    expect(ui.getEffectiveContext().identityKey).toBe('fictional-next-person');
    const assessment = ui.getAssessment({ testKey: 'testosterone_total', raw: '200', unit: 'ng/dL' });
    expect(assessment.evaluation.measurement.status).toBe('invalid');
    expect(assessment.evaluation.measurement.raw).toBe('');
  });

  it('never lets the old female routing getters restore a value belonging to the previous patient', () => {
    const { ui, setContext } = mount();
    setContext({ sex: 'F', ageYears: 35 });
    ui.render({ raw: '30', unit: 'ng/dL', targetUnit: 'ng/dL' });
    setContext({ identityKey: 'fictional-next-girl', ageYears: 8 });
    ui.getEffectiveContext(); ui.getLegacyPatient(); ui.isLegacyFemale();
    const assessment = ui.getAssessment({ testKey: 'testosterone_total', raw: '30', unit: 'ng/dL' });
    expect(assessment.evaluation.input.sex).toBe('F');
    expect(assessment.evaluation.measurement).toMatchObject({ status: 'invalid', raw: '' });
    expect(assessment.evaluation).not.toHaveProperty('referencePreview');
  });

  it('keeps completed calendar months when PNA lies near the six-month boundary', () => {
    const { ui, setContext } = mount();
    setContext({ ageYears: 0, ageMonths: 6, preterm: 'no', neonatalAge: {
      postnatalDays: { lower: 180, upper: 181, source: 'main-calendar-dates' },
      gestationalDays: { lower: 280, upper: 280, source: 'patient-record' },
    } });
    const input = ui.getEffectiveContext().input;
    expect(input.age).toMatchObject({ years: 0, months: 6, precision: 'month' });
    expect(input.neonatalAge.postnatalDays).toMatchObject({ lower: 180, upper: 181 });
    const evaluated = ui.render({ raw: '100', unit: 'ng/dL', targetUnit: 'ng/dL' });
    expect(evaluated.input.age).toMatchObject({ years: 0, months: 6 });
    expect(evaluated.referencePreview.byAge.range.id).toBe('mayo-ttst-m-6m-9y');
  });

  it('preserves known sample facts and lets active shared GnRHa override an incompatible local no', () => {
    const { ui, setContext } = mount({ readMeasurementContext: () => ({ collectionTime: 'evening', specimen: 'urine', measurementKind: 'stimulated',
      assay: { methodId: 'synthetic-incompatible-assay', confirmation: 'reported' }, treatment: { gnrha: 'no', sexSteroids: 'yes', context: 'none' } }) });
    setContext({ gnrhaStatus: 'w-trakcie' });
    const evaluated = ui.render({ raw: '100', unit: 'ng/dL', targetUnit: 'ng/dL' });
    expect(evaluated.input).toMatchObject({ collectionTime: 'evening', specimen: 'urine', measurementKind: 'stimulated',
      assay: { methodId: 'synthetic-incompatible-assay', confirmation: 'reported' }, treatment: { gnrha: 'yes', sexSteroids: 'yes', context: 'hormonal' } });
    expect(evaluated.referenceSelection.status).toBe('unavailable');
  });
});
