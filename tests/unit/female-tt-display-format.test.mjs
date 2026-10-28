import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_testosterone.js');
const data = require('../../vilda_lab_testosterone_data.js');
const snapshot = require('../../vilda_lab_snapshot.js');
const renderer = require('../../vilda_lab_assessment_ui.js');
const form = require('../../vilda_lab_puberty_ui.js');

function evaluate(overrides = {}) {
  return engine.evaluate({ analyte: 'testosterone_total', value: '0.30', unit: 'nmol/L', sex: 'F',
    age: { years: 3, months: 1, precision: 'month' }, contextBasis: 'current-patient',
    referenceSelection: 'automatic', ...overrides }, data);
}
const options = unit => ({ live: true, femaleTtFixedDecimals: true, displayUnit: unit });
const clone = value => JSON.parse(JSON.stringify(value));
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

// The actual production form and assessment renderer run on a text-only DOM.
// This double models only nodes/controls; it supplies no formatting or medicine.
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
function mountFemale() {
  const document = documentDouble();
  const context = { sourceStatus: 'ready', identityKey: 'fictional-female-tt-decimals',
    sex: 'F', ageYears: 3, ageMonths: 1 };
  const ui = form.mount({ document, renderer, snapshot, testosteroneEngine: engine,
    testosteroneData: data, readPatientContext: () => context, onChange: () => {} });
  ui.setAnalyte('testosterone_total'); ui.setPatientContext(context);
  return { document, ui, byId: id => document.getElementById(id) };
}

describe('current female TT — accepted display precision, unchanged medical values', () => {
  it.each([
    ['nmol/L', '0,30 nmol/L', 'Zakres: <0,24–0,69 nmol/L'],
    ['ng/dL', '8,65 ng/dL', 'Zakres: <7,00–20,00 ng/dL'],
    ['ng/mL', '0,087 ng/mL', 'Zakres: <0,070–0,200 ng/mL'],
    ['pg/mL', '86,53 pg/mL', 'Zakres: <70,00–200,00 pg/mL'],
  ])('projects a complete unrounded evaluation into %s', (unit, resultText, rangeText) => {
    const evaluated = freeze(evaluate()), before = JSON.stringify(evaluated);
    const view = renderer.buildView(evaluated, options(unit));
    expect(view.result.text).toBe(resultText);
    expect(view.comparisons[0]).toMatchObject({ status: 'within', rangeText,
      axis: { lower: null, unknownLower: true } });
    expect(view.upperOnlyNote).toContain('nieokreślony');
    expect(evaluated.referencePreview.byAge.range.bounds).toMatchObject({
      lower: null, upper: { value: .6934 }, censoredLower: { value: .24269 } });
    expect(JSON.stringify(evaluated)).toBe(before);
  });

  it('renders the actual form result and conversion cells while preserving its original input and every verdict', () => {
    const app = mountFemale();
    const raw = '0.300000000123';
    const original = app.ui.render({ raw, unit: 'nmol/L', targetUnit: 'nmol/L' });
    expect(app.byId('labResultBig').textContent).toContain('0,30');
    const cells = descendants(app.byId('labResultsBody'), n => n.tagName === 'TD').map(n => n.textContent);
    expect(cells).toEqual(['ng/dL', '8,65', 'ng/mL', '0,087', 'pg/mL', '86,53']);
    const originalData = JSON.stringify(original);
    for (let cycle = 0; cycle < 5; cycle += 1) {
      for (const targetUnit of ['ng/mL', 'ng/dL', 'pg/mL', 'nmol/L']) {
        const current = app.ui.render({ raw, unit: 'nmol/L', targetUnit });
        expect(JSON.stringify(current)).toBe(originalData);
      }
    }
    expect(app.byId('labResultBig').textContent).toContain('0,30');
    expect(original.measurement.raw).toBe(raw);
    expect(original.measurement.plotValue).toBeCloseTo(.300000000123, 14);
  });

  it('keeps the above verdict when displayed result and upper bound round to the same number', () => {
    const evaluated = freeze(evaluate({ value: '0.693401' }));
    for (const unit of ['nmol/L', 'ng/mL', 'ng/dL', 'pg/mL', 'nmol/L']) {
      const view = renderer.buildView(evaluated, options(unit));
      expect(view.comparisons[0].status).toBe('above');
      expect(evaluated.referencePreview.byAge.range.bounds.upper.value).toBe(.6934);
      expect(evaluated.measurement.plotValue).toBe(.693401);
    }
    expect(renderer.buildView(evaluated, options('nmol/L')).result.text).toBe('0,69 nmol/L');
  });

  it.each(['<0.10', '≤0.10', '>0.10', '≥0.10', '<LOD', '<LOQ'])('preserves %s as a non-exact result instead of plotting the displayed bound', raw => {
    const evaluated = freeze(evaluate({ value: raw }));
    const app = mountFemale(), rendered = app.ui.render({ raw, unit: 'nmol/L', targetUnit: 'nmol/L' });
    const view = renderer.buildView(evaluated, options('nmol/L'));
    const expected = raw.includes('LO') ? raw + ' nmol/L' : raw.replace('0.10', '0,10') + ' nmol/L';
    expect(view.result.text).toBe(expected);
    expect(view.result.censored).toBe(true);
    expect(view.comparisons[0].axis?.value ?? null).toBeNull();
    expect(rendered.measurement).toMatchObject({ isExact: false, plotValue: null });
    expect(app.byId('labResultBig').textContent).toContain(expected.split(' ')[0]);
  });

  it('does not turn a tiny positive number into an apparent exact zero or a new laboratory limit', () => {
    const evaluated = evaluate({ value: '0.0001' });
    const view = renderer.buildView(evaluated, options('nmol/L'));
    expect(view.result.text).toBe('1,00E-4 nmol/L');
    expect(view.result.text).not.toContain('<');
    expect(evaluated.measurement).toMatchObject({ isExact: true, plotValue: .0001 });
    expect(renderer.formatFemaleTestosteroneNumber(0, 'nmol/L')).toBe('0,00');
    expect(renderer.formatFemaleTestosteroneNumber(.0001, 'ng/mL')).toBe('1,000E-4');
  });

  it('leaves male, dated female and non-live presentations on their original precision', () => {
    const male = evaluate({ sex: 'M', value: '0.3000123' });
    expect(renderer.buildView(male, options('nmol/L'))).toEqual(renderer.buildView(male, { displayUnit: 'nmol/L' }));
    const dated = evaluate({ contextBasis: 'sample', birthDateISO: '2023-01-01', sampleDateISO: '2026-01-01', value: '.3000123' });
    expect(renderer.buildView(dated, options('nmol/L'))).toEqual(renderer.buildView(dated, { displayUnit: 'nmol/L' }));
    const current = evaluate({ value: '.3000123' });
    expect(renderer.buildView(current).result.text).toBe('.3000123 nmol/L');
    expect(renderer.buildView(current, { live: true, displayUnit: 'nmol/L' }).result.text).toBe('.3000123 nmol/L');
  });

  it('retains saved display and unrounded snapshot values even if a caller passes live formatting options', () => {
    const evaluated = evaluate({ value: '.3000123' });
    const recorded = freeze(snapshot.create(evaluated));
    const doc = documentDouble(), host = doc.createElement('div');
    const historical = renderer.renderAssessment(host, recorded, options('nmol/L'));
    expect(historical.result.text).toBe('.3000123 nmol/L');
    expect(historical.comparisons[0].rangeText).toBe('<0,24269 (dolny kraniec nieokreślony); ≤0,6934 nmol/L');
    expect(recorded.evaluation.measurement.raw).toBe('.3000123');
    expect(recorded.evaluation.referencePreview.byAge.range.bounds.upper.value).toBe(.6934);
    expect(snapshot.normalize(clone(recorded))).toEqual(recorded);
  });
});
