import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_potassium_index_data.js', 'clcr_potassium_index.js', 'clcr_potassium_index_ui.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrPotassiumIndexUi, engine = browser.VildaClcrPotassiumIndex;
const profile = browser.VildaClcrPotassiumIndexData.getProfile('KFR_2026_11');
const evaluate = patch => engine.evaluate({ potassiumValue: '60', sodiumValue: '20', ...patch }, profile);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = html => decode(html.replace(/<[^>]*>/g, ''));
const attribute = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const card = html => html.split('<details')[0].replace(/data-clcr-potassium-index-snapshot="[^"]*"/g, '');

function fixture() {
  const doc = atrapaDokumentu(), create = doc.createElement;
  const enhance = node => {
    node.dataset = new Proxy({}, { set(_, key, value) { node.setAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, value); return true; }, get(_, key) { return node.getAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`); } });
    node.append = (...nodes) => nodes.forEach(child => node.appendChild(child));
    node.closest = selector => { for (let n = node; n; n = n.parentNode) if (n.tagName.toLowerCase() === selector) return n; return null; };
    node.removeEventListener = (type, listener) => node.sluchacze.set(type, (node.sluchacze.get(type) || []).filter(x => x !== listener));
    return node;
  };
  doc.createElement = tag => enhance(create(tag)); doc.createComment = text => { const node = doc.createElement('comment'); node.textContent = text; return node; };
  enhance(doc.documentElement); enhance(doc.body); doc.defaultView = browser;
  const form = doc.createElement('form'); form.id = 'clcrForm'; doc.body.append(form);
  const fieldset = doc.createElement('fieldset'); form.append(fieldset);
  const fieldViews = new Map();
  for (const [id, label, value] of [['U_Na', 'Sód (DZM)', '20'], ['U_K', 'Potas (DZM)', '60']]) {
    const wrapper = doc.createElement('label'), control = doc.createElement('input'), name = doc.createElement('span');
    name.className = 'clcr-field__name'; name.textContent = label;
    control.id = id; control.type = 'number'; control.setAttribute('type', 'number'); control.setAttribute('min', '1'); control.setAttribute('max', '500'); control.setAttribute('step', '0.1'); control.value = value;
    wrapper.append(name, control); fieldset.append(wrapper);
    fieldViews.set(id, { wrapper, control, labelText: label });
  }
  const clear = doc.createElement('div'); clear.id = 'clearContainer'; form.append(clear);
  return { doc, form, fieldset, fieldViews };
}

describe('K/(K+Na) — single neutral result and two inputs', () => {
  it.each([{ potassiumValue: '60', sodiumValue: '20', expected: '75' }, { potassiumValue: '0', sodiumValue: '20', expected: '0' }, { potassiumValue: '60', sodiumValue: '0', expected: '100' }])('keeps valid endpoint or interior %j neutral without a healthy norm', ({ expected, ...input }) => {
    const result = evaluate(input), html = ui.renderResult(result), main = card(html);
    expect(main.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(attribute(main, 'data-clcr-value')).toBe(expected);
    expect(attribute(main, 'data-clcr-series')).toBe('K_frac');
    expect(attribute(main, 'data-clcr-tone')).toBe('neutral');
    expect(attribute(main, 'data-clcr-assessment')).toBe('unassessed');
    expect(plain(main)).toContain('NormaBrak uniwersalnej normy');
    expect(plain(main)).toContain('Wynik opisuje udział potasu');
    expect(main).not.toMatch(/out-of-range|>60|hipowolem|norm-axis/);
    expect(main).toContain('To nie jest skala normy.');
    expect(JSON.parse(attribute(html, 'data-clcr-potassium-index-snapshot'))).toEqual(result.snapshot);
  });
  it('shows the contextual threshold and sources only in collapsed details', () => {
    const html = ui.renderResult(evaluate()), details = html.split('<details')[1];
    expect(html).not.toContain('<details open');
    expect(plain(details)).toContain('wskaźnik >60%'); expect(plain(details)).toContain('FENa <0,5%');
    expect(plain(details)).toContain('Diuretyki i dożylne płyny');
    expect(details).toContain('https://www.indianpediatrics.net/may2021/may-461-481.htm');
    expect(plain(details)).toContain('100 × 60 / (60 + 20)');
    expect(plain(details)).toContain('Nie zapisano rodzaju próbki');
  });
  it.each([{ potassiumValue: '', sodiumValue: '20' }, { potassiumValue: '60', sodiumValue: '' }])('keeps missing %j uncollectable without an error alert', input => {
    const html = ui.renderResult(evaluate(input));
    expect(html).toContain('kfr-result-empty'); expect(html).not.toMatch(/data-clcr-series=|role="alert"/);
  });
  it.each([{ potassiumValue: '0', sodiumValue: '0' }, { potassiumValue: '-1', sodiumValue: '-1' }, { potassiumValue: '1', sodiumValue: '-0.5' }, { potassiumValue: '<1' }, { potassiumValue: '0x10' }, { sameSpecimen: false }])('blocks invalid %j without stale result data', input => {
    const html = ui.renderResult(evaluate(input));
    expect(html).toContain('kfr-result-error'); expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/data-clcr-series=|data-clcr-value=|data-clcr-potassium-index-snapshot=/);
  });
  it('preserves a tiny positive primary result and exact tiny sodium complement', () => {
    const tiny = evaluate({ potassiumValue: '0.000001', sodiumValue: '100' }), html = ui.renderResult(tiny);
    expect(tiny.rawValue).toBeGreaterThan(0); expect(attribute(html, 'data-clcr-value')).toBe(String(tiny.rawValue));
    expect(attribute(html, 'data-clcr-display-value')).toBe(tiny.display.text);
    expect(plain(card(html))).not.toContain('K · 0%');
    const tinyNa = evaluate({ potassiumValue: '1e308', sodiumValue: '1e-100' }), other = ui.renderResult(tinyNa);
    expect(tinyNa.sodiumValue).toBeNull(); expect(plain(card(other))).toContain(`Na · ${tinyNa.sodiumDisplay.text}%`);
    expect(plain(card(other))).not.toContain('Na · 0%');
  });
  it('keeps timed material frozen and never looks up current profile or patient in render', () => {
    const captured = JSON.parse(JSON.stringify(evaluate({ sampleType: 'timed' })));
    const previous = browser.VildaClcrPotassiumIndexData; browser.VildaClcrPotassiumIndexData = new Proxy({}, { get() { throw Error('No lookup'); } });
    try {
      const html = ui.renderResult(captured);
      expect(plain(html)).toContain('Zachowany materiał: mocz ze zbiórki czasowej lub dobowej.');
      expect(JSON.parse(attribute(html, 'data-clcr-potassium-index-snapshot'))).toEqual(captured.snapshot);
    } finally { browser.VildaClcrPotassiumIndexData = previous; }
  });
  it('escapes copied data and does not create links to untrusted schemes', () => {
    const result = JSON.parse(JSON.stringify(evaluate()));
    result.input.potassiumValue = '<img src=x onerror=alert(1)>';
    result.notes.clinicalContext = '<script>bad</script>';
    result.sources = [{ label: '<script>source</script>', url: 'javascript:alert(1)' }];
    const html = ui.renderResult(result);
    expect(html).not.toMatch(/<img|<script|href="javascript:/); expect(html).toContain('&lt;script&gt;bad');
  });
  it('moves the existing controls in K-first order and restores their labels, position and constraints on exit', () => {
    const { doc, fieldset, fieldViews } = fixture(), sodium = doc.getElementById('U_Na'), potassium = doc.getElementById('U_K');
    const original = Array.from(fieldset.children);
    ui.sync(doc, { active: true, fieldViews });
    const inputCard = doc.getElementById('kfrInputCard');
    expect(inputCard.querySelectorAll('input').map(control => control.id)).toEqual(['U_K', 'U_Na']);
    expect(doc.getElementById('kfrRequiredCount').textContent).toBe('2/2');
    expect(potassium.type).toBe('text'); expect(potassium.getAttribute('max')).toBeNull();
    expect(fieldViews.get('U_K').labelText).toBe('Potas w moczu');
    ui.sync(doc, { active: true, fieldViews }); expect(doc.getElementById('kfrInputCard')).toBe(inputCard);
    potassium.value = '0'; ui.refresh(doc); expect(doc.getElementById('kfrRequiredCount').textContent).toBe('2/2');
    potassium.value = '-1'; ui.refresh(doc); expect(doc.getElementById('kfrRequiredCount').textContent).toBe('1/2');
    ui.sync(doc, { active: false, fieldViews });
    expect(Array.from(fieldset.children)).toEqual(original); expect(sodium.type).toBe('number'); expect(potassium.getAttribute('min')).toBe('1');
    expect(potassium.getAttribute('max')).toBe('500'); expect(fieldViews.get('U_K').labelText).toBe('Potas (DZM)');
    expect(potassium.value).toBe('-1'); expect(doc.getElementById('kfrInputCard')).toBeNull();
  });
  it('prepares controls before raw restoration and does not erase commas or invalid strings on exit', () => {
    const { doc, fieldViews } = fixture(), control = doc.getElementById('U_K');
    ui.prepareControls(doc); control.value = '1,25'; ui.sync(doc, { active: true, fieldViews });
    expect(doc.getElementById('kfrRequiredCount').textContent).toBe('2/2');
    ui.restore(doc); expect(control.type).toBe('text'); expect(control.value).toBe('1,25');
    control.value = '<0.1'; ui.sync(doc, { active: true, fieldViews }); ui.restore(doc);
    expect(control.type).toBe('text'); expect(control.value).toBe('<0.1');
  });
});
