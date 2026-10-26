import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../../vilda_lab_puberty.js');
const data = require('../../vilda_lab_puberty_data.js');
const ui = require('../../vilda_lab_assessment_ui.js');

// Fictional patients only. Policy eligibility and comparison are evaluated by
// the production engine; this suite exercises the real shared renderer.
function evaluate(overrides = {}) {
  return engine.evaluate({
    referenceSelection: 'automatic', contextBasis: 'current-patient', currentContextAvailable: true,
    analyte: 'lh', sex: 'M', age: { years: 4, months: 0, precision: 'month' },
    value: '0,4', unit: 'IU/L', specimen: 'unknown', measurementKind: 'unknown',
    assay: { confirmation: 'unknown', methodId: '', profileId: '' },
    treatment: { context: 'unknown', gnrha: 'unknown', sexSteroids: 'unknown' },
    puberty: { kind: 'G', stage: 1, appliesToCurrentContext: true, observationProvided: true },
    ...overrides,
  }, data);
}

function documentDouble() {
  const doc = { createElement: tag => new Element(tag) };
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.ownerDocument = doc; this._text = ''; }
    set textContent(value) { this.children = []; this._text = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(' '); }
    set innerHTML(_) { throw new Error('HTML assignment is forbidden'); }
    get firstChild() { return this.children[0] || null; }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children = this.children.filter(value => value !== child); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
  }
  return doc;
}

function descendants(element, predicate) {
  return element.children.flatMap(child => [...(predicate(child) ? [child] : []), ...descendants(child, predicate)]);
}
function hasClass(node, name) { return (node.className || '').split(' ').includes(name); }
function matching(host, attribute, value) { return descendants(host, node => node.getAttribute(attribute) === value); }
function visibleText(node) { return node.tagName === 'details' ? '' : node._text + ' ' + node.children.map(visibleText).join(' '); }
function render(evaluation, options = {}) {
  const host = documentDouble().createElement('div');
  ui.renderEvaluation(host, evaluation, { live: true, hideMeasurement: true, ...options });
  return host;
}

describe('LH — zaakceptowane przedpokwitaniowe odniesienie w rzeczywistym UI', () => {
  it.each([
    ['M', 'G'], ['F', 'Th'],
  ])('pokazuje pojedynczą źródłowo odrębną górną granicę dla %s', (sex, kind) => {
    const evaluation = evaluate({ sex, puberty: { kind, stage: 1, appliesToCurrentContext: true, observationProvided: true } });
    const original = JSON.stringify(evaluation);
    const view = ui.buildView(evaluation);
    expect(evaluation.prepubertalLh.status).toBe('available');
    expect(view.comparisons).toHaveLength(1);
    expect(view.comparisons[0]).toMatchObject({ key: 'prepubertal', status: 'above',
      visualLabel: 'Powyżej górnej granicy — orientacyjnie', rangeText: 'Górna granica: 0,3 IU/L',
      axis: { lower: null, upper: 0.3, value: 0.4, unknownLower: true } });
    const host = render(evaluation);
    const axes = descendants(host, node => hasClass(node, 'vilda-lab-axis'));
    expect(axes).toHaveLength(1);
    expect(axes[0].getAttribute('data-range-lower')).toBe('unknown');
    expect(axes[0].getAttribute('data-range-upper')).toBe('0.3');
    expect(axes[0].getAttribute('data-reference-display')).toBe('upper-bound-only');
    expect(descendants(host, node => hasClass(node, 'vilda-lab-axis-band'))).toHaveLength(0);
    expect(matching(host, 'data-comparison', 'age')).toHaveLength(0);
    expect(matching(host, 'data-comparison', 'stage')).toHaveLength(0);
    expect(visibleText(host)).not.toMatch(/0[,.]5|0[,.]02|0–0,3|Mayo|AnshLite/);
    expect(view.result.visualAlert).toBeNull();
    expect(JSON.stringify(evaluation)).toBe(original);
  });

  it.each(['0', '0,2', '0,3'])('LH %s nie staje się pełnym werdyktem prawidłowości ani dolną normą', value => {
    const evaluation = evaluate({ value });
    const view = ui.buildView(evaluation);
    expect(view.comparisons[0]).toMatchObject({ status: 'within', visualState: '',
      visualLabel: 'Nie przekracza górnej granicy — orientacyjnie', axis: { lower: null, value: Number(value.replace(',', '.')) } });
    const host = render(evaluation);
    expect(matching(host, 'data-prepubertal-interpretation', 'info')).toHaveLength(1);
    expect(visibleText(host)).toContain('Niskie LH nie wyklucza');
    expect(visibleText(host)).not.toMatch(/w normie|W zakresie normy|znacznie powyżej/i);
  });

  it('brak G nie blokuje odniesienia ani nie tworzy domniemanego G1', () => {
    const evaluation = evaluate({ puberty: { kind: 'unspecified', stage: null, observationProvided: false } });
    expect(evaluation.prepubertalLh.stageContext).toBeNull();
    const host = render(evaluation);
    const box = matching(host, 'data-prepubertal-interpretation', 'attention')[0];
    expect(box.textContent).toContain('Możliwa aktywacja osi pokwitania');
    expect(box.textContent).toContain('z oceną pokwitania');
    expect(box.textContent).not.toMatch(/G1|Th1/);
  });

  it.each(['<0,4', '<LOD', '<LOQ'])('wynik %s pozostaje neutralny bez dokładnego punktu', value => {
    const evaluation = evaluate({ value });
    const view = ui.buildView(evaluation);
    expect(view.comparisons[0]).toMatchObject({ status: 'indeterminate', visualState: '', axis: { value: null } });
    const host = render(evaluation);
    expect(matching(host, 'data-prepubertal-interpretation', 'neutral')).toHaveLength(1);
    expect(descendants(host, node => hasClass(node, 'vilda-lab-axis-marker'))).toHaveLength(0);
    expect(view.result.visualAlert).toBeNull();
  });

  it.each(['', 'abc', '-1'])('pusty lub nieprawidłowy wynik %s ukrywa nowy komentarz i pomoc', value => {
    const host = render(evaluate({ value }));
    expect(descendants(host, node => node.getAttribute('data-prepubertal-interpretation') !== null)).toHaveLength(0);
    expect(matching(host, 'data-prepubertal-method', 'true')).toHaveLength(0);
    expect(descendants(host, node => hasClass(node, 'vilda-lab-axis'))).toHaveLength(0);
  });

  it('pomoc jest zwinięta, zawiera rozróżnienie metod i resetuje się po zmianie kontekstu', () => {
    const host = render(evaluate());
    const help = matching(host, 'data-prepubertal-method', 'true')[0];
    expect(help.tagName).toBe('details');
    expect(help.getAttribute('open')).toBeNull();
    expect(help.textContent).toContain('Pokwitanie i metoda oznaczenia');
    expect(help.textContent).toContain('Sama nowość lub czułość testu nie oznacza');
    expect(help.textContent).toContain('Quest');
    expect(help.textContent).toContain('UChicago');
    expect(descendants(help, node => node.tagName === 'a')).toHaveLength(5);
    help.setAttribute('open', '');
    ui.renderEvaluation(host, evaluate({ sex: 'F', puberty: { kind: 'Th', stage: 1, appliesToCurrentContext: true, observationProvided: true } }));
    const replacement = matching(host, 'data-prepubertal-method', 'true')[0];
    expect(replacement).not.toBe(help);
    expect(replacement.getAttribute('open')).toBeNull();
  });

  it('ważne utrwalone ostrzeżenie czasu rozwoju zachowuje pierwszeństwo', () => {
    const evaluation = evaluate({ value: '0,2' });
    // An independently saved timing warning is presented verbatim; this UI
    // must not recalculate or suppress it merely because LH is low.
    evaluation.clinical = { ...evaluation.clinical, status: 'warning', code: 'early_onset_history',
      title: 'Wczesny początek w wywiadzie', text: 'Utrwalone ostrzeżenie czasu rozwoju.' };
    const host = render(evaluation);
    const warning = matching(host, 'data-clinical-code', 'early_onset_history')[0];
    expect(warning.textContent).toContain('Utrwalone ostrzeżenie czasu rozwoju.');
    expect(visibleText(host).indexOf('Utrwalone ostrzeżenie')).toBeLessThan(visibleText(host).indexOf('Górna granica'));
    expect(matching(host, 'data-prepubertal-interpretation', 'info')).toHaveLength(0);
  });

  it('nowy zapis odtwarza frozen komentarz i granicę, a stary bez pola zachowuje Mayo', () => {
    const evaluation = evaluate();
    const saved = JSON.parse(JSON.stringify(evaluation));
    saved.prepubertalLh.interpretation.text = 'Utrwalony komentarz ze stadium G1.';
    saved.input.puberty.stage = 5;
    const historical = render(saved, { live: false, historical: true });
    expect(visibleText(historical)).toContain('Górna granica: 0,3 IU/L');
    expect(visibleText(historical)).toContain('Utrwalony komentarz ze stadium G1.');
    delete saved.prepubertalLh;
    const oldView = ui.buildView(saved);
    expect(oldView.prepubertalLh).toBeNull();
    expect(oldView.comparisons.find(row => row.key === 'age').axis.upper).toBe(0.5);
    expect(matching(render(saved, { historical: true }), 'data-comparison', 'prepubertal')).toHaveLength(0);
  });

  it('nie stosuje projekcji do FSH, G2 lub niekompletnego bloku', () => {
    const fsh = ui.buildView(evaluate({ analyte: 'fsh' }));
    expect(fsh.prepubertalLh).toBeNull();
    expect(fsh.comparisons.some(row => row.key === 'age')).toBe(true);
    const pubertal = ui.buildView(evaluate({ puberty: { kind: 'G', stage: 2, appliesToCurrentContext: true, observationProvided: true } }));
    expect(pubertal.prepubertalLh).toBeNull();
    expect(pubertal.clinical.status).toBe('warning');
    const malformed = JSON.parse(JSON.stringify(evaluate()));
    malformed.prepubertalLh.range.bounds.upper.value = Number.NaN;
    expect(ui.buildView(malformed).prepubertalLh).toBeNull();
  });

  it('źródłowe komentarze i pomoc są tekstem, bez aktywnego URL javascript', () => {
    const evaluation = JSON.parse(JSON.stringify(evaluate()));
    evaluation.prepubertalLh.interpretation.title = '<img src=x onerror=alert(1)>';
    evaluation.prepubertalLh.methodHelp.paragraphs = ['<script>alert(1)</script>'];
    evaluation.prepubertalLh.methodHelp.sources = [{ label: 'Bezpieczny tekst', url: 'javascript:alert(1)' }];
    const host = render(evaluation);
    expect(host.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(host.textContent).toContain('<script>alert(1)</script>');
    expect(descendants(host, node => ['img', 'script'].includes(node.tagName))).toHaveLength(0);
    expect(descendants(host, node => node.tagName === 'a').every(node => /^https?:\/\//.test(node.getAttribute('href')))).toBe(true);
  });
});
