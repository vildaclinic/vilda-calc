import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_serum_anion_gap_data.js', 'clcr_serum_anion_gap.js', 'clcr_serum_anion_gap_ui.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrSerumAnionGapUi, engine = browser.VildaClcrSerumAnionGap;
const profile = browser.VildaClcrSerumAnionGapData.getProfile('MAYO_ELPSR_AGS_2026_11');
const evaluate = patch => engine.evaluate({ sodiumValue: '140', chlorideValue: '100', bicarbonateValue: '18', ageYears: 40, ...patch }, profile);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const attr = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const main = html => html.split('<details')[0].replace(/data-clcr-serum-anion-gap-snapshot="[^"]*"/g, '');
const plain = html => decode(html.replace(/<[^>]*>/g, ''));

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
  for (const [id, value] of [['S_Na', '140'], ['S_Cl', '100'], ['S_HCO3', '18']]) {
    const wrapper = doc.createElement('label'), control = doc.createElement('input'), name = doc.createElement('span');
    name.className = 'clcr-field__name'; name.textContent = id;
    control.id = id; control.type = 'number'; control.setAttribute('type', 'number'); control.setAttribute('min', '1'); control.setAttribute('max', '500'); control.value = value;
    wrapper.append(name, control); fieldset.append(wrapper); fieldViews.set(id, { wrapper, control, labelText: id });
  }
  const albumin = doc.createElement('div'); albumin.id = 'agsAlbuminControls'; albumin.hidden = true; fieldset.append(albumin);
  for (const [id, type, value] of [['AGS_albuminEnabled', 'checkbox', ''], ['S_Albumin', 'text', ''], ['S_Albumin_unit', 'select', 'g/L']]) {
    const wrapper = doc.createElement('label'), control = doc.createElement(type === 'select' ? 'select' : 'input'), name = doc.createElement('span');
    name.className = 'clcr-field__name'; name.textContent = id; control.id = id; control.type = type; control.value = value; control.checked = false;
    wrapper.append(name, control); albumin.append(wrapper); fieldViews.set(id, { wrapper, control, labelText: id });
  }
  const clear = doc.createElement('div'); clear.id = 'clearContainer'; form.append(clear);
  return { doc, fieldset, fieldViews, albumin };
}

describe('AG surowicy — accepted integrated result and optional albumin', () => {
  it.each([
    [{}, '22', 'high', 'warn'],
    [{ chlorideValue: '104', bicarbonateValue: '24' }, '12', 'normal', 'normal'],
    [{ chlorideValue: '118', bicarbonateValue: '24' }, '-2', 'low', 'warn'],
    [{ sodiumValue: '140.1', chlorideValue: '116', bicarbonateValue: '24.1' }, '0', 'low', 'warn'],
    [{ sodiumValue: '140.04', chlorideValue: '116', bicarbonateValue: '24' }, '0.04', 'low', 'warn'],
  ])('renders one raw signed result with frozen reference for %j', (input, expected, status, tone) => {
    const result = evaluate(input), html = ui.renderResult(result), card = main(html);
    expect(attr(card, 'data-clcr-value')).toBe(expected);
    expect(attr(card, 'data-clcr-assessment')).toBe(status); expect(attr(card, 'data-clcr-tone')).toBe(tone);
    expect(card.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(plain(card)).toContain('AG bez korekcji'); expect(plain(card)).toContain('Norma dla wieku7–15mmol/L');
    expect(plain(card)).toContain('Norma: od 7 do 15 mmol/L.');
    expect(JSON.parse(attr(html, 'data-clcr-serum-anion-gap-snapshot'))).toEqual(result.snapshot);
  });
  it.each([null, 3, 0])('does not classify or draw a norm axis for age %s', ageYears => {
    const html = main(ui.renderResult(evaluate({ ageYears })));
    expect(attr(html, 'data-clcr-assessment')).toBe('unassessed'); expect(attr(html, 'data-clcr-tone')).toBe('neutral');
    expect(html).toContain('Brak normy do porównania'); expect(html).not.toContain('ags-scale');
    expect(html).toContain('<span class="ags-reference-unit"></span>');
  });
  it.each([['20', 'g/L', '17'], ['2', 'g/dL', '17'], ['50', 'g/L', '9,5']])('keeps correction %s %s inside the single raw-AG card', (albuminValue, albuminUnit, expected) => {
    const html = main(ui.renderResult(evaluate({ chlorideValue: '104', bicarbonateValue: '24', albuminEnabled: true, albuminValue, albuminUnit })));
    expect(html.match(/class="clcr-result-value"/g)).toHaveLength(1); expect(attr(html, 'data-clcr-value')).toBe('12');
    expect(attr(html, 'data-clcr-assessment')).toBe('normal'); expect(html).toContain('ags-correction-row');
    expect(plain(html)).toContain(`Po uwzględnieniu albuminy${expected} mmol/L`);
  });
  it('invalid albumin retains a valid raw AG but cannot be saved', () => {
    const result = evaluate({ albuminEnabled: true, albuminValue: '-1' }), html = ui.renderResult(result);
    expect(result.valid).toBe(true); expect(result.canSave).toBe(false); expect(main(html)).not.toContain('ags-correction-row');
    expect(attr(html, 'data-clcr-value')).toBe('22');
    expect(JSON.parse(attr(html, 'data-clcr-serum-anion-gap-snapshot')).canSave).toBe(false);
  });
  it.each([{ sodiumValue: '' }, { sodiumValue: '-1' }, { sodiumValue: '0x10' }, { sodiumValue: '1e309' }])('does not emit collectable result metadata for %j', input => {
    const html = ui.renderResult(evaluate(input));
    expect(html).not.toMatch(/data-clcr-series=|data-clcr-value=|data-clcr-serum-anion-gap-snapshot=/);
    expect(html).toContain(input.sodiumValue === '' ? 'Tutaj pojawi się wynik' : 'Sprawdź wpisane dane');
  });
  it('renderer uses the frozen model and escapes imported text', () => {
    const model = JSON.parse(JSON.stringify(evaluate())); model.reference.min = 6; model.reference.max = 14;
    model.interpretation = '<script>bad</script>'; model.sources = [{ label: '<img src=x>', url: 'javascript:bad' }];
    const data = browser.VildaClcrSerumAnionGapData; browser.VildaClcrSerumAnionGapData = new Proxy({}, { get() { throw Error('No lookup'); } });
    try {
      const html = ui.renderResult(model); expect(plain(main(html))).toContain('6–14mmol/L');
      expect(html).not.toMatch(/<script>|<img|href="javascript:/); expect(html).toContain('&lt;script&gt;bad');
    } finally { browser.VildaClcrSerumAnionGapData = data; }
  });
  it('moves real fields and optional controls, then restores their exact positions without erasing raw strings', () => {
    const { doc, fieldset, fieldViews, albumin } = fixture(), original = Array.from(fieldset.children), albuminOriginal = Array.from(albumin.children);
    ui.sync(doc, { active: true, fieldViews, context: { ageYears: 40 } });
    expect(doc.getElementById('agsRequiredCount').textContent).toBe('3/3');
    expect(doc.getElementById('agsInputCard').querySelectorAll('input').slice(0, 3).map(node => node.id)).toEqual(['S_Na', 'S_Cl', 'S_HCO3']);
    expect(doc.getElementById('S_Na').type).toBe('text'); expect(albumin.hidden).toBe(true);
    doc.getElementById('AGS_albuminEnabled').checked = true; doc.getElementById('S_Albumin').value = '-1'; ui.refresh(doc);
    expect(albumin.hidden).toBe(false); expect(doc.getElementById('agsAlbuminError').hidden).toBe(false);
    expect(doc.getElementById('agsRequiredCount').textContent).toBe('3/3');
    doc.getElementById('S_Na').value = '140,1'; ui.restore(doc);
    expect(Array.from(fieldset.children)).toEqual(original); expect(Array.from(albumin.children)).toEqual(albuminOriginal);
    expect(doc.getElementById('S_Na').type).toBe('text'); expect(doc.getElementById('S_Na').value).toBe('140,1');
    expect(doc.getElementById('S_Cl').type).toBe('number'); expect(doc.getElementById('agsInputCard')).toBeNull();
  });
});
