import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_ph_dzm_reference_data.js', 'clcr_ph_dzm.js', 'clcr_ph_dzm_ui.js']) loadBrowserScript(file, browser);
const engine = browser.VildaClcrPhDzm;
const ui = browser.ClcrPhDzmUi;
const policy = browser.VildaClcrPhDzmReferenceData.DEFAULT_POLICY;
const evaluate = (urinePh, patch = {}) => engine.evaluate({ urinePh, ...patch }, policy);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const attr = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const main = html => html.split('<details')[0].replace(/data-clcr-ph-dzm-snapshot="[^"]*"/g, '');

function fixture() {
  const doc = atrapaDokumentu(), create = doc.createElement;
  const enhance = node => {
    node.dataset = new Proxy({}, {
      set(_, key, value) { node.setAttribute(`data-${String(key).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value); return true; },
      get(_, key) { return node.getAttribute(`data-${String(key).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`); },
    });
    node.append = (...nodes) => nodes.forEach(child => node.appendChild(child));
    node.removeEventListener = (type, listener) => node.sluchacze.set(type, (node.sluchacze.get(type) || []).filter(item => item !== listener));
    return node;
  };
  doc.createElement = tag => enhance(create(tag));
  doc.createComment = text => { const node = doc.createElement('comment'); node.textContent = text; return node; };
  enhance(doc.documentElement); enhance(doc.body); doc.defaultView = browser;
  const form = doc.createElement('form'); form.id = 'clcrForm'; doc.body.append(form);
  const fieldset = doc.createElement('fieldset'); form.append(fieldset);
  const before = doc.createElement('span'); before.textContent = 'before'; fieldset.append(before);
  const wrapper = doc.createElement('label'), name = doc.createElement('span'), control = doc.createElement('input');
  name.className = 'clcr-field__name'; name.textContent = 'pH dobowego moczu'; control.id = 'pH24';
  control.setAttribute('type', 'number'); control.setAttribute('step', '0.01'); control.setAttribute('aria-describedby', 'existing-description'); control.value = '5,2';
  wrapper.append(name, control); fieldset.append(wrapper);
  const after = doc.createElement('span'); after.textContent = 'after'; fieldset.append(after);
  const clear = doc.createElement('div'); clear.id = 'clearContainer'; form.append(clear);
  const fieldViews = new Map([['pH24', { wrapper, control, labelText: name.textContent }]]);
  return { doc, form, fieldset, wrapper, name, control, fieldViews };
}

describe('pH DZM — one integrated source-specific result', () => {
  it.each([
    ['0', 'warning', 'outside'], ['4.4999', 'warning', 'outside'], ['4.5', 'normal', 'within'],
    ['5.2', 'normal', 'within'], ['6.2', 'normal', 'within'], ['7.5', 'normal', 'within'],
    ['8', 'normal', 'within'], ['8.0001', 'warning', 'outside'], ['14', 'warning', 'outside'],
  ])('renders exact report value %s with one reference and correct classification', (input, tone, assessment) => {
    const model = evaluate(input), html = ui.renderResult(model), card = main(html);
    expect(attr(card, 'data-clcr-value')).toBe(String(model.rawValue));
    expect(attr(card, 'data-clcr-display-value')).toBe(model.display.text);
    expect(attr(card, 'data-clcr-series')).toBe('pH24');
    expect(attr(card, 'data-clcr-tone')).toBe(tone);
    expect(attr(card, 'data-clcr-assessment')).toBe(assessment);
    expect(card).toContain('>Norma ogólna</p>');
    expect(card).toContain('>4,5–8,0</strong>');
    expect(card).not.toContain('Norma dla wieku');
    expect((card.match(/class="clcr-result-value"/g) || [])).toHaveLength(1);
    expect(card).toContain('>4,5</text>');
    expect(card).toContain('>8,0</text>');
    expect(JSON.parse(attr(html, 'data-clcr-ph-dzm-snapshot'))).toEqual(model);
    expect(card.includes(' out-of-range')).toBe(assessment === 'outside');
  });

  it('keeps low-pH stone commentary inside the normal card rather than inventing a second abnormal result', () => {
    const card = main(ui.renderResult(evaluate('5,2')));
    expect(card).toContain('data-clcr-tone="normal"');
    expect(card).toContain('krystalizacji kwasu moczowego');
    expect(card).not.toContain(' out-of-range');
    expect(card).not.toContain('RTA');
  });

  it.each(['', ' '])('empty value %j does not create collectable result metadata', input => {
    const html = ui.renderResult(evaluate(input));
    expect(html).toContain('ph-dzm-result-empty');
    expect(html).not.toMatch(/data-clcr-series=|data-clcr-ph-dzm-snapshot=/);
  });

  it.each(['-1', '14.0001', '15', 'abc', 'Infinity', '0x6'])('invalid value %j has no stale result', input => {
    const html = ui.renderResult(evaluate(input));
    expect(html).toContain('ph-dzm-result-error');
    expect(html).not.toMatch(/data-clcr-series=|data-clcr-ph-dzm-snapshot=/);
  });

  it.each(['0', '14'])('identifies the off-axis position of pH %s rather than silently placing it at 3 or 9', input => {
    const card = main(ui.renderResult(evaluate(input)));
    expect(card).toContain('Wynik poza zakresem osi (3–9)');
    expect(attr(card, 'data-clcr-value')).toBe(input);
  });

  it('keeps unassessed source/context models neutral and suppresses the reference axis', () => {
    const evaluated = evaluate('6.2');
    const model = { ...evaluated, status: 'unassessed', statusText: 'Wynik z raportu · bez porównania', tone: 'neutral', outOfRange: null,
      referenceActive: false, reference: null, references: [], referenceText: 'Brak porównania', interpretation: 'Znana próbka zakwaszona.' };
    const card = main(ui.renderResult(model));
    expect(card).toContain('data-clcr-assessment="unassessed"');
    expect(card).toContain('data-clcr-tone="neutral"');
    expect(card).toContain('Znana próbka zakwaszona.');
    expect(card).toContain('Brak porównania');
    expect(card).not.toContain('ph-dzm-range-visual');
    expect(card).not.toContain('>4,5–8,0</strong>');
  });

  it('renders the frozen input/source model without a current policy lookup', () => {
    const evaluated = evaluate('6.2');
    const model = { ...evaluated, reference: { ...evaluated.reference, lower: 5, upper: 7 }, referenceText: '5,0–7,0',
      notes: { scope: 'Utrwalony opis zakresu DZM', sample: 'Utrwalony opis próbki' }, sources: [{ label: 'Utrwalone źródło', url: 'https://example.org/source' }] };
    const html = ui.renderResult(model);
    expect(main(html)).toContain('>5,0–7,0</strong>');
    expect(main(html)).toContain('>5,0</text>');
    expect(html).toContain('Utrwalony opis zakresu DZM');
    expect(html).toContain('Utrwalone źródło');
  });

  it('puts sampling, therapy limitations and adult risk context in collapsed details', () => {
    const html = ui.renderResult(evaluate('6.2'));
    const details = html.split('<details')[1];
    expect(html).not.toContain('<details open');
    expect(details).toContain('id="clcr-ph-dzm-details"');
    expect(details).toContain('pH wpisane z raportu: 6.2');
    expect(details).toContain('https://www.mayocliniclabs.com/test-catalog/overview/606521');
    expect(details).toContain('https://pediatric.testcatalog.org/show/UPH24');
    expect(details).toContain('uroweb.org');
    expect(details).toContain('Monitorowanie alkalizacji');
    expect(main(html)).not.toContain('kwasicy cewkowej');
  });

  it('escapes imported model text and blocks executable source URLs', () => {
    const html = ui.renderResult({ ...evaluate('6.2'), interpretation: '<script>bad()</script>', cautions: ['" onclick="bad()'],
      sources: [{ label: '<img src=x>', url: 'javascript:bad()' }] });
    expect(html).not.toMatch(/<script>|<img|href="javascript:/);
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(html).toContain('&quot; onclick=&quot;bad()');
  });
});

describe('pH DZM — moving the existing field preserves values and lifecycle', () => {
  it('mounts only the measured field and restores exact origin, attributes and raw input', () => {
    const { doc, form, fieldset, wrapper, name, control, fieldViews } = fixture();
    const original = [...fieldset.children];
    ui.sync(doc, { active: true, fieldViews });
    const inputCard = doc.getElementById('phDzmInputCard');
    expect(inputCard.querySelectorAll('input').map(node => node.id)).toEqual(['pH24']);
    expect(doc.getElementById('phDzmRequiredCount').textContent).toBe('1/1');
    expect(control.getAttribute('type')).toBe('text');
    expect(control.getAttribute('inputmode')).toBe('decimal');
    expect(control.getAttribute('aria-describedby')).toContain('existing-description');
    expect(name.textContent).toBe('pH w DZM');
    expect(doc.documentElement.getAttribute('data-clcr-ph-dzm-active')).toBe('1');
    ui.sync(doc, { active: true, fieldViews });
    expect(doc.getElementById('phDzmInputCard')).toBe(inputCard);
    expect(form.sluchacze.get('input')).toHaveLength(1);
    control.value = '8,0001';
    ui.sync(doc, { active: false, fieldViews });
    expect(fieldset.children).toEqual(original);
    expect(wrapper.parentNode).toBe(fieldset);
    expect(control.value).toBe('8,0001');
    expect(control.getAttribute('type')).toBe('number');
    expect(control.getAttribute('aria-describedby')).toBe('existing-description');
    expect(name.textContent).toBe('pH dobowego moczu');
    expect(doc.documentElement.getAttribute('data-clcr-ph-dzm-active')).toBeNull();
    expect(doc.getElementById('phDzmInputCard')).toBeNull();
    expect(form.sluchacze.get('input')).toHaveLength(0);
  });

  it('refreshes readiness/error state using the production engine and treats zero as a measurement', () => {
    const { doc, control, fieldViews } = fixture();
    ui.sync(doc, { active: true, fieldViews });
    for (const [value, count, invalid] of [['', '0/1', false], ['abc', '0/1', true], ['15', '0/1', true], ['0', '1/1', false], ['14', '1/1', false], ['5,2', '1/1', false]]) {
      control.value = value; control.dispatch('input');
      expect(doc.getElementById('phDzmRequiredCount').textContent).toBe(count);
      expect(doc.getElementById('phDzmInputError').hidden).toBe(!invalid);
      expect(control.getAttribute('aria-invalid')).toBe(String(invalid));
    }
    ui.restore(doc);
  });
});
