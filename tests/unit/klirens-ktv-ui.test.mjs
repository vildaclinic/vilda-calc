import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_ktv_reference_data.js', 'clcr_ktv.js', 'clcr_ktv_ui.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrKtv;
const ui = browser.ClcrKtvUi;
const policy = browser.VildaClcrKtvReferenceData.DEFAULT_POLICY;
const BASE = { variant: 'spktv', ageYears: 50, preUrea: '20', postUrea: '6', durationMinutes: '240', netUfLiters: '2', postWeightKg: '70', sessionsPerWeek: '3', pidiDays: '2', accessType: 'AVF' };
const evaluate = (patch = {}) => engine.evaluate({ ...BASE, ...patch }, policy);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const attr = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const main = html => html.split('<details')[0].replace(/data-clcr-ktv-snapshot="[^"]*"/g, '');

function fixture() {
  const doc = atrapaDokumentu(), create = doc.createElement;
  const enhance = node => {
    node.dataset = new Proxy({}, {
      set(_, key, value) { node.setAttribute(`data-${String(key).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value); return true; },
      get(_, key) { return node.getAttribute(`data-${String(key).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`); },
    });
    node.append = (...nodes) => nodes.forEach(child => node.appendChild(child));
    node.replaceChildren = (...nodes) => { [...node.children].forEach(child => child.remove()); node.append(...nodes); };
    node.removeEventListener = (type, listener) => node.sluchacze.set(type, (node.sluchacze.get(type) || []).filter(item => item !== listener));
    node.closest = selector => { for (let current = node; current; current = current.parentNode) if (selector[0] === '#' && current.id === selector.slice(1)) return current; return null; };
    node.dispatchEvent = event => {
      event.target ||= node;
      for (let current = node; current; current = event.bubbles ? current.parentNode : null) {
        event.currentTarget = current;
        (current.sluchacze.get(event.type) || []).forEach(listener => listener(event));
      }
      return true;
    };
    if (node.tagName === 'INPUT') Object.defineProperty(node, 'type', { get: () => node.atrybuty.get('type') || 'text', set: value => { node.atrybuty.set('type', value); } });
    return node;
  };
  doc.createElement = tag => enhance(create(tag));
  doc.createComment = text => { const node = doc.createElement('comment'); node.textContent = text; return node; };
  enhance(doc.documentElement); enhance(doc.body);
  browser.Event = class { constructor(type, options = {}) { this.type = type; this.bubbles = Boolean(options.bubbles); } };
  doc.defaultView = browser;
  const age = doc.createElement('input'); age.id = 'age'; age.value = '50'; doc.body.append(age);
  const form = doc.createElement('form'); form.id = 'clcrForm'; doc.body.append(form);
  const fields = doc.createElement('div'); fields.id = 'ktvFields'; form.append(fields);
  const variant = doc.createElement('input'); variant.id = 'ktvVariant'; variant.type = 'hidden'; variant.value = 'spktv'; fields.append(variant);
  const values = { UreaPre: '20', UreaPost: '6', ktvDurationMinutes: '240', ktvUF: '2', ktvW: '70', ktvSessionsPerWeek: '3', ktvPidiDays: '2', ktvAccessType: 'AVF', ktvKru: '1,5', ktvSameSession: '', ktvPreBeforeDialysis: '', ktvPreNoDilution: '' };
  const fieldViews = new Map();
  Object.entries(values).forEach(([id, value]) => {
    const wrapper = doc.createElement('label'), heading = doc.createElement('span'), name = doc.createElement('span');
    name.className = 'clcr-field__name'; name.textContent = `Original ${id}`; heading.className = 'clcr-field__heading'; heading.append(name);
    const select = ['ktvSessionsPerWeek', 'ktvPidiDays', 'ktvAccessType'].includes(id);
    const control = doc.createElement(select ? 'select' : 'input'); control.id = id; control.value = value;
    if (id === 'ktvSameSession' || id === 'ktvPreBeforeDialysis' || id === 'ktvPreNoDilution') { control.type = 'checkbox'; control.checked = false; }
    else if (!select) { control.setAttribute('type', 'number'); control.setAttribute('max', '400'); control.setAttribute('data-max', '400'); }
    control.setAttribute('aria-describedby', 'original-help');
    if (id === 'ktvPidiDays') ['', '1', '2', '3', '4', 'other'].forEach(value => { const option = doc.createElement('option'); option.value = value; option.textContent = value || 'Choose'; control.append(option); });
    wrapper.append(heading, control); fields.append(wrapper);
    fieldViews.set(id, { wrapper, control, labelText: name.textContent });
  });
  const clear = doc.createElement('div'); clear.id = 'clearContainer'; form.append(clear);
  browser.evaluateClcrKtv = () => engine.evaluate(engine.readInputFromDocument(doc), policy);
  return { doc, form, fields, fieldViews, variant, age, control: id => doc.getElementById(id) };
}

describe('Kt/V integrated result renders the real selected clinical model', () => {
  it.each([
    ['spktv', 1.4010540127569946, ''], ['ektv', 1.2227380474970133, ''], ['urr', 70, '%'],
  ])('only %s is collectable and retains full precision and frozen reference', (variant, expected, unit) => {
    const model = evaluate({ variant }), html = ui.renderResult(model), card = main(html);
    expect(model.rawValue).toBeCloseTo(expected, 12);
    expect(attr(card, 'data-clcr-series')).toBe(`KTV_${variant}`);
    expect(attr(card, 'data-clcr-value')).toBe(String(model.rawValue));
    expect(attr(card, 'data-clcr-display-unit')).toBe(unit);
    expect(attr(card, 'data-clcr-out-of-range')).toBe('false');
    expect(card).toContain('data-clcr-tone="normal"');
    expect((card.match(/data-clcr-series=/g) || [])).toHaveLength(1);
    expect((card.match(/class="clcr-result-value"/g) || [])).toHaveLength(1);
    expect(JSON.parse(attr(html, 'data-clcr-ktv-snapshot'))).toEqual(model);
  });

  it.each([
    ['6,7', 'warning', 'below-target'], ['9', 'danger', 'below-minimum'],
  ])('patient color and tri-state metadata agree for post %s', (postUrea, tone, status) => {
    const model = evaluate({ postUrea }), card = main(ui.renderResult(model));
    expect(model.status).toBe(status);
    expect(attr(card, 'data-clcr-tone')).toBe(tone);
    expect(attr(card, 'data-clcr-assessment')).toBe('outside');
    expect(attr(card, 'data-clcr-out-of-range')).toBe('true');
    expect(card).toContain(' out-of-range');
    expect(card).toContain('ktv-reference-value');
  });

  it('keeps an absent comparison neutral and does not substitute an adult target', () => {
    const model = evaluate({ ageYears: null }), card = main(ui.renderResult(model));
    expect(attr(card, 'data-clcr-assessment')).toBe('unassessed');
    expect(attr(card, 'data-clcr-out-of-range')).toBe('null');
    expect(card).toContain('Brak porównania');
    expect(card).toContain('Brak wieku');
    expect(card).not.toContain('ktv-dose-scale');
  });

  it.each([{ variant: 'ektv' }, { ageYears: 10 }])('one minimum has exactly one scale boundary and legend item (%j)', patch => {
    const html = main(ui.renderResult(evaluate(patch)));
    expect((html.match(/class="ktv-dose-boundary"/g) || [])).toHaveLength(1);
    expect(html).toContain('ktv-dose-legend--single');
    expect(html).not.toContain('>Cel <strong>');
  });

  it('adult spKt/V distinguishes minimum and goal with two boundaries', () => {
    const html = main(ui.renderResult(evaluate()));
    expect((html.match(/class="ktv-dose-boundary"/g) || [])).toHaveLength(2);
    expect(html).toContain('Minimum <strong>≥1,2');
    expect(html).toContain('Cel <strong>≥1,4');
  });

  it.each([
    { preUrea: '' }, { preUrea: 'abc' }, { postUrea: '2' },
    { variant: 'ektv', ageYears: 10 }, { ageYears: 1 }, { knownFacts: { ktvSameSession: false } },
  ])('missing, invalid and guarded models never expose saveable series (%j)', patch => {
    const html = ui.renderResult(evaluate(patch));
    expect(html).toContain('ktv-result-placeholder');
    expect(html).not.toMatch(/data-clcr-series=|data-clcr-ktv-snapshot=|class="clcr-result-value"/);
  });

  it('a high-URR model guard stays amber without a falsely successful number', () => {
    const model = evaluate({ postUrea: '2' }), card = main(ui.renderResult(model));
    expect(card).toContain('data-clcr-tone="warning"');
    expect(card).toContain('Potrzebny dokładniejszy model');
    expect(card).not.toContain('Cel dla sesji osiągnięty');
  });

  it('renders source-frozen values rather than classifying against current policy', () => {
    const model = evaluate();
    const frozen = { ...model, referenceText: '≥1,3', reference: { ...model.reference, minimum: 1.1, target: 1.3 }, notes: { scope: 'Zamrożony zakres', formulaSp: 'Zamrożony wzór' }, sources: [{ label: 'Źródło zapisu', url: 'https://example.org/frozen' }] };
    const html = ui.renderResult(frozen);
    expect(html).toContain('≥1,3');
    expect(html).toContain('Minimum <strong>≥1,1');
    expect(html).toContain('Zamrożony wzór');
    expect(html).toContain('https://example.org/frozen');
    expect(attr(html, 'data-clcr-value')).toBe(String(model.rawValue));
  });

  it('uses boundary-safe model display without rounding the raw history value', () => {
    const model = { ...evaluate(), rawValue: 1.39999, value: 1.39999, display: { text: '<1,40', boundary: '<1,4' }, tone: 'warning', outOfRange: true };
    const html = main(ui.renderResult(model));
    expect(attr(html, 'data-clcr-value')).toBe('1.39999');
    expect(attr(html, 'data-clcr-display-value')).toBe('<1,40');
    expect(html).toContain('data-long="true"');
    expect(html).toContain('&lt;1,40');
  });

  it('method, full precision and real source links stay in collapsed details', () => {
    const model = evaluate({ variant: 'ektv' }), html = ui.renderResult(model);
    expect(html).not.toContain('<details open');
    const details = html.split('<details')[1];
    expect(details).toContain('clcr-ktv-details');
    expect(details).toContain('Tattersalla');
    expect(details).toContain(String(model.rawValue).replace('.', ','));
    expect(details).toContain('PMC3765020');
    expect(details).toContain('Nie doliczono resztkowej');
  });

  it('long scientific values preserve exact metadata and have a safe exponent wrapping point', () => {
    const model = evaluate({ variant: 'urr', preUrea: '0,000001', postUrea: '100' });
    const html = main(ui.renderResult(model));
    expect(attr(html, 'data-clcr-value')).toBe(String(model.rawValue));
    expect(attr(html, 'data-clcr-display-value')).toBe(model.display.text);
    expect(html).toContain('data-dense="true"');
    expect(html).toContain('<wbr>e+10');
  });

  it('untrusted text is escaped and non-HTTPS source links are not executable', () => {
    const html = ui.renderResult({ ...evaluate(), interpretation: '<script>bad()</script>', notes: { scope: '<img src=x>' }, sources: [{ label: '<img src=x>', url: 'javascript:bad()' }] });
    expect(html).not.toMatch(/<script>|<img|href="javascript:/);
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('Kt/V native controls survive formula and variant lifecycle', () => {
  it('moves exact native controls and restores their origin, names and attributes', () => {
    const f = fixture(), before = [...f.fields.children];
    const pidiOptions = [...f.control('ktvPidiDays').children];
    ui.sync(f.doc, { active: true, fieldViews: f.fieldViews });
    const card = f.doc.getElementById('ktvInputCard');
    expect(card).not.toBeNull();
    expect(f.doc.getElementById('ktvRequiredCount').textContent).toBe('7/7');
    expect(f.control('UreaPre').getAttribute('type')).toBe('text');
    expect(f.control('UreaPre').getAttribute('max')).toBeNull();
    expect(f.control('UreaPre').getAttribute('data-max')).toBeNull();
    expect(f.control('UreaPre').getAttribute('aria-describedby')).toContain('original-help');
    ui.sync(f.doc, { active: true, fieldViews: f.fieldViews });
    expect(f.doc.getElementById('ktvInputCard')).toBe(card);
    expect(f.form.sluchacze.get('input')).toHaveLength(1);
    f.control('UreaPre').value = '1200'; f.control('UreaPost').value = '360';
    ui.refresh(f.doc);
    expect(browser.evaluateClcrKtv().rawValue).toBeCloseTo(1.4010540127569946, 12);
    ui.restore(f.doc);
    expect(f.fields.children).toEqual(before);
    expect(f.control('ktvPidiDays').children).toEqual(pidiOptions);
    expect(f.control('UreaPre').value).toBe('1200');
    expect(f.control('UreaPre').getAttribute('max')).toBe('400');
    expect(f.fieldViews.get('UreaPre').wrapper.querySelector('.clcr-field__name').textContent).toBe('Original UreaPre');
    expect(f.doc.documentElement.getAttribute('data-clcr-ktv-ui')).toBeNull();
    expect(f.doc.getElementById('ktvInputCard')).toBeNull();
    expect(f.form.sluchacze.get('input')).toHaveLength(0);
  });

  it('variant buttons retain every entered value and require only7/8/2 data', () => {
    const f = fixture(); ui.sync(f.doc, { active: true, fieldViews: f.fieldViews });
    for (const [variant, count] of [['ektv', '8/8'], ['urr', '2/2'], ['spktv', '7/7']]) {
      const button = f.doc.documentElement.querySelector(`[data-clcr-ktv-variant="${variant}"]`);
      button.dispatchEvent(new browser.Event('click', { bubbles: true }));
      expect(f.variant.value).toBe(variant);
      expect(button.getAttribute('aria-pressed')).toBe('true');
      expect(f.doc.getElementById('ktvRequiredCount').textContent).toBe(count);
      expect(f.control('ktvUF').value).toBe('2');
      expect(f.control('ktvW').value).toBe('70');
      expect(f.fieldViews.get('ktvUF').wrapper.hidden).toBe(variant === 'urr');
      expect(f.fieldViews.get('ktvAccessType').wrapper.hidden).toBe(variant !== 'ektv');
    }
    ui.restore(f.doc);
  });

  it('hidden legacy facts remain unchanged, including false checkboxes and known Kru', () => {
    const f = fixture();
    ui.sync(f.doc, { active: true, fieldViews: f.fieldViews });
    for (const id of ['ktvSameSession', 'ktvPreBeforeDialysis', 'ktvPreNoDilution']) {
      expect(f.control(id).checked).toBe(false);
      expect(f.fieldViews.get(id).wrapper.hidden).toBe(true);
    }
    expect(f.control('ktvKru').value).toBe('1,5');
    ui.restore(f.doc);
    expect(f.control('ktvKru').value).toBe('1,5');
  });

  it('unknown age and optional URR context do not create missing required questions', () => {
    const f = fixture(); f.age.value = ''; f.variant.value = 'urr';
    for (const id of ['ktvSessionsPerWeek', 'ktvPidiDays', 'ktvDurationMinutes', 'ktvUF', 'ktvW', 'ktvAccessType']) f.control(id).value = '';
    ui.sync(f.doc, { active: true, fieldViews: f.fieldViews });
    expect(f.doc.getElementById('ktvRequiredCount').textContent).toBe('2/2');
    expect(browser.evaluateClcrKtv().rawValue).toBe(70);
    expect(browser.evaluateClcrKtv().referenceActive).toBe(false);
    expect(f.control('ktvSessionsPerWeek').value).toBe('');
    expect(f.control('ktvPidiDays').value).toBe('');
    ui.restore(f.doc);
  });

  it('URR proxy controls synchronize native canonical values and emit native changes', () => {
    const f = fixture(); f.variant.value = 'urr'; ui.sync(f.doc, { active: true, fieldViews: f.fieldViews });
    const events = []; f.control('ktvDurationMinutes').addEventListener('input', event => events.push(event.target.id));
    const proxy = f.control('ktvUrrDurationMinutes'); proxy.value = '0'; proxy.dispatchEvent(new browser.Event('input', { bubbles: true }));
    expect(f.control('ktvDurationMinutes').value).toBe('0');
    expect(events).toEqual(['ktvDurationMinutes']);
    expect(f.doc.getElementById('ktvRequiredCount').textContent).toBe('2/2');
    expect(browser.evaluateClcrKtv().rawValue).toBe(70);
    expect(browser.evaluateClcrKtv().referenceActive).toBe(false);
    expect(f.doc.documentElement.querySelectorAll('#ktvDurationMinutes')).toHaveLength(1);
    ui.restore(f.doc);
  });

  it('editing a schedule preserves the known unsupported interval for correction', () => {
    const f = fixture(); ui.sync(f.doc, { active: true, fieldViews: f.fieldViews });
    f.control('ktvSessionsPerWeek').value = '2'; f.control('ktvSessionsPerWeek').dispatchEvent(new browser.Event('change', { bubbles: true }));
    expect(f.control('ktvPidiDays').value).toBe('2');
    expect(f.control('ktvPidiDays').textContent).toContain('Nieobsługiwany odstęp: 2');
    expect(browser.evaluateClcrKtv().valid).toBe(false);
    f.control('ktvPidiDays').value = '3'; f.control('ktvPidiDays').dispatchEvent(new browser.Event('change', { bubbles: true }));
    expect(browser.evaluateClcrKtv().valid).toBe(true);
    expect(browser.evaluateClcrKtv().referenceActive).toBe(false);
    ui.restore(f.doc);
  });

  it('readiness uses engine validity: UF zero counts, invalid pre concentration does not', () => {
    const f = fixture(); f.control('ktvUF').value = '0'; ui.sync(f.doc, { active: true, fieldViews: f.fieldViews });
    expect(f.doc.getElementById('ktvRequiredCount').textContent).toBe('7/7');
    f.control('UreaPre').value = '0'; ui.refresh(f.doc);
    expect(f.doc.getElementById('ktvRequiredCount').textContent).toBe('6/7');
    expect(f.control('UreaPre').getAttribute('aria-invalid')).toBe('true');
    expect(f.doc.getElementById('ktvInputError').hidden).toBe(false);
    ui.restore(f.doc);
  });
});
