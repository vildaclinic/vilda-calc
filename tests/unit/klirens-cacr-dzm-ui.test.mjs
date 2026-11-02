import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_clinical_safety.js', 'clcr_cacr_reference_data.js', 'clcr_cacr.js', 'clcr_cacr_ui.js', 'clcr_cacr_dzm_ui.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrCacrDzmUi, shared = browser.ClcrCacrUi, engine = browser.VildaClcrCacr;
const arup = browser.VildaClcrCacrReferenceData.getProfile('ARUP_CACR_DZM_2026_11');
const mayo = browser.VildaClcrCacrReferenceData.getProfile('MAYO_CACR3_RANDOM_2026_10');
const base = { mode: 'concentration', calciumValue: '5', calciumUnit: 'mmol/L', creatinineValue: '100', creatinineUnit: 'mg/dL', sampleType: 'timed', ageYears: '40', sex: 'M' };
const result = patch => engine.evaluate({ ...base, ...patch }, arup);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = html => decode(html.replace(/<[^>]*>/g, ''));
const attribute = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const card = html => html.split('<details')[0].replace(/data-clcr-cacr-snapshot="[^"]*"/g, '');

describe('Ca/Cr DZM — shared B card, independent source and captured precision', () => {
  it('renders one DZM result and its ARUP norm in the same unit', () => {
    const model = result(), html = ui.renderResult(model), main = card(html);
    expect(main.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(main).toContain('data-clcr-series="Ca_Cr"');
    expect(attribute(main, 'data-clcr-display-value')).toBe(model.display.value);
    expect(attribute(main, 'data-clcr-value')).toBe(String(model.rawValue));
    expect(plain(main)).toContain('Norma dla wieku · ARUP');
    expect(plain(main)).toContain('0,02–0,24');
    expect(main).toContain('class="clcr-result-reference-unit">mg/mg</span>');
    expect(main).not.toMatch(/style=|<select/);
    expect(JSON.parse(attribute(html, 'data-clcr-cacr-snapshot'))).toEqual(model.snapshot);
    expect(html).toContain('id="clcr-cacr-dzm-details"');
    expect(html).not.toContain('<details open');
    expect(html).toContain('https://ltd.aruplab.com/Tests/Pub/0020472');
  });
  it('keeps pediatric precision and all 10 age bins with both sex columns', () => {
    const model = result({ ageYears: '8' }), html = ui.renderResult(model), table = html.match(/<table[\s\S]*?<\/table>/)?.[0] || '';
    expect(plain(card(html))).toContain('od 0,006'); expect(plain(card(html))).toContain('do 0,431');
    expect(table.match(/<tr/g)).toHaveLength(11);
    expect(plain(table)).toContain('Chłopcy / mężczyźni');
    expect(plain(table)).toContain('Dziewczęta / kobiety');
    expect(table).toContain('class="cacr-reference-cell--active"');
    expect(plain(table)).toContain('0,011–0,457');
  });
  it.each(['mg/mg', 'mg/g', 'mmol/mmol', 'mg/mmol', 'mmol/mol'])('keeps reported %s and every table range in that same unit', reportedUnit => {
    const model = result({ mode: 'direct', reportedValue: '0.3', reportedUnit }), html = ui.renderResult(model);
    expect(attribute(html, 'data-clcr-display-unit')).toBe(reportedUnit);
    expect(plain(html)).toContain(`Normy dla wieku · ARUP · ${reportedUnit}`);
    for (const row of model.referenceTable) expect(plain(html)).toContain(row.bySex.M.display.range);
  });
  it('renders both axis endpoints, no inline styling or scaled SVG text', () => {
    const main = card(ui.renderResult(result()));
    expect(main).toContain('cacr-norm-boundary--low'); expect(main).toContain('cacr-norm-boundary--high');
    expect(main).toContain('cacr-norm-point'); expect(main).not.toMatch(/viewBox=|\sstyle=/);
    for (const [, value] of main.matchAll(/\s(?:x|width|x1|x2|cx)="(\d+(?:\.\d+)?)%"/g)) { expect(Number(value)).toBeGreaterThanOrEqual(0); expect(Number(value)).toBeLessThanOrEqual(100); }
  });
  it.each([{ calciumValue: '0' }, { ageYears: null }, { sex: '' }, { collectionProblem: true }])('does not infer a normal result or a point for %j', patch => {
    const model = result(patch), main = card(ui.renderResult(model));
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('data-clcr-reference-comparison="false"');
    expect(main).not.toContain('cacr-norm-point');
    if (!model.referenceAvailable) { expect(plain(main)).toContain('Brak dobranej normy'); expect(plain(main)).toContain(model.qualification.note); }
  });
  it('shows an amber censored abnormal result without drawing its bound as an exact point', () => {
    const model = result({ mode: 'direct', reportedValue: '>0.24', reportedUnit: 'mg/mg' }), main = card(ui.renderResult(model));
    expect(main).toContain('data-clcr-tone="warning"'); expect(plain(main)).toContain('>0,24'); expect(main).not.toContain('cacr-norm-point');
  });
  it('keeps tiny positives positive and rounded near-boundary quantities explicit', () => {
    const tiny = result({ mode: 'direct', reportedValue: '1e-300', reportedUnit: 'mg/mg' });
    expect(tiny.valid).toBe(true); expect(tiny.zero).toBe(false); expect(card(ui.renderResult(tiny))).toContain('data-clcr-tone="warning"');
    const near = result({ mode: 'direct', reportedValue: '0.2400000000000000001', reportedUnit: 'mg/mg' }), html = ui.renderResult(near);
    expect(plain(card(html))).toContain('≈'); expect(plain(html)).toContain('Wynik przed zaokrągleniem'); expect(plain(html)).toContain(near.display.fullValueText.replace('.', ','));
  });
  it.each(['1.7976931348623157e308', '1e-300'])('renders the complete compact %s without dropping a digit or changing its captured value', reportedValue => {
    const model = result({ mode: 'direct', reportedValue, reportedUnit: 'mg/mg' }), html = ui.renderResult(model), main = card(html);
    expect(attribute(main, 'data-clcr-value')).toBe(String(model.rawValue));
    expect(attribute(main, 'data-clcr-display-value')).toBe(model.display.value);
    expect(JSON.parse(attribute(html, 'data-clcr-cacr-snapshot'))).toEqual(model.snapshot);
    if (model.display.approximate) expect(plain(html)).toContain(model.display.fullValueText.replace('.', ','));
    else expect(plain(main)).toContain(model.display.text.replace('.', ','));
    if (reportedValue.includes('e308')) {
      expect(main).toContain('data-scientific="true"');
      expect(main).toContain('aria-label="≈1,798e+308"');
      expect(main).toContain('class="cacr-scientific-mantissa">≈1,798</span>');
      expect(main).toContain('× 10<sup>308</sup>');
    } else { expect(model.zero).toBe(false); expect(model.rawValue).toBeGreaterThan(0); }
  });
  it.each([{ calciumValue: '-1' }, { creatinineValue: '0' }, { sameSpecimen: 'different' }])('invalid %j cannot be collected as a result', patch => {
    const html = ui.renderResult(result(patch));
    expect(html).not.toContain('data-clcr-series='); expect(html).not.toContain('data-clcr-cacr-snapshot='); expect(plain(html)).toContain('Sprawdź');
  });
  it('keeps Mayo as the default separate spot renderer', () => {
    const model = engine.evaluate({ ...base, sampleType: 'random', ageYears: '8' }, mayo), html = shared.renderResult(model);
    expect(html).toContain('data-clcr-series="CaCr_spot"'); expect(html).toContain('id="clcr-cacr-details"');
    expect(plain(card(html))).toContain('Norma dla wieku · Mayo'); expect(plain(card(html))).toContain('0,01–0,25');
    expect(html).not.toContain('ARUP');
  });
  it('renders a frozen captured result without consulting live reference data or an engine', () => {
    const model = JSON.parse(JSON.stringify(result({ ageYears: '8' }))), live = browser.VildaClcrCacr;
    browser.VildaClcrCacr = new Proxy({}, { get() { throw Error('No recomputation during history render'); } });
    try { expect(plain(ui.renderResult(model))).toContain('0,006–0,431'); } finally { browser.VildaClcrCacr = live; }
  });
  it('escapes captured text and rejects executable source URLs', () => {
    const model = JSON.parse(JSON.stringify(result())); model.statusText = '<img src=x onerror=alert(1)>'; model.reference.source = { label: '<script>bad</script>', url: 'javascript:alert(1)' };
    const html = ui.renderResult(model); expect(html).not.toMatch(/<img|<script|href="javascript:/); expect(html).toContain('&lt;img'); expect(html).toContain('&lt;script&gt;');
  });
});

function fixture() {
  const doc = atrapaDokumentu(), create = doc.createElement;
  const enhance = node => {
    node.dataset = new Proxy({}, { set(_, key, value) { node.setAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, value); return true; }, get(_, key) { return node.getAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`); } });
    node.append = (...nodes) => nodes.forEach(child => node.appendChild(child));
    node.closest = selector => { for (let n = node; n; n = n.parentNode) if (n.tagName.toLowerCase() === selector) return n; return null; };
    node.removeEventListener = (type, listener) => node.sluchacze.set(type, (node.sluchacze.get(type) || []).filter(x => x !== listener));
    node.dispatchEvent = e => node.dispatch(e.type); return node;
  };
  doc.createElement = tag => enhance(create(tag)); doc.createComment = text => { const n = doc.createElement('comment'); n.textContent = text; return n; };
  enhance(doc.documentElement); enhance(doc.body); doc.defaultView = { ...browser, Event: class Event { constructor(type) { this.type = type; } } };
  const form = doc.createElement('form'); form.id = 'clcrForm'; doc.body.append(form);
  const clear = doc.createElement('div'); clear.id = 'clearContainer'; form.append(clear);
  return { doc, form };
}
describe('Ca/Cr DZM — separate reversible minimum-data input controller', () => {
  it('creates seven clinical and five hidden context controls once, without collection or patient questions', () => {
    const { doc } = fixture(); expect(ui.ensureControls(doc)).toHaveLength(12);
    expect(doc.getElementById('CACR_DZM_calciumUnit').value).toBe('mmol/L'); expect(doc.getElementById('CACR_DZM_creatinineUnit').value).toBe('mg/dL');
    expect(doc.getElementById('CACR_DZM_sameSpecimen').value).toBe('assumed');
    for (const id of engine.DZM_CONTEXT_FIELD_IDS) { expect(doc.getElementById(id).type).toBe('hidden'); expect(doc.getElementById(id).closest('label')).toBeNull(); }
    doc.getElementById('CACR_DZM_calcium').value = '5'; ui.ensureControls(doc);
    expect(doc.body.querySelectorAll('#CACR_DZM_calcium')).toHaveLength(1); expect(doc.getElementById('CACR_DZM_calcium').value).toBe('5');
    for (const id of ['age', 'weight', 'height', 'V24', 'Cl24DurationHours', 'U_Ca', 'Ucr']) expect(doc.getElementById(id)).toBeNull();
  });
  it('offers five unique reported units and canonicalizes restored aliases without editing the values', () => {
    const { doc } = fixture(); ui.ensureControls(doc);
    const select = doc.getElementById('CACR_DZM_reportedUnit');
    expect(select.children.filter(x => !x.hidden).map(x => x.value)).toEqual(['mg/mg', 'mg/g', 'mmol/mmol', 'mg/mmol', 'mmol/mol']);
    select.value = 'g/g'; doc.getElementById('CACR_DZM_reportedValue').value = '0.200'; ui.sync(doc, { active: true });
    expect(select.value).toBe('mg/mg'); expect(doc.getElementById('CACR_DZM_reportedValue').value).toBe('0.200');
  });
  it('preserves values, metadata and ARIA through mode changes and formula teardown', () => {
    const { doc } = fixture(); ui.ensureControls(doc);
    const field = doc.getElementById('CACR_DZM_calcium'), origin = field.closest('label').parentNode;
    field.value = '5'; field.setAttribute('aria-describedby', 'original-help'); doc.getElementById('CACR_DZM_reportedValue').value = '0.3';
    doc.getElementById('CACR_DZM_collectionHours').value = '12'; doc.getElementById('CACR_DZM_durationKnown').value = 'false';
    ui.sync(doc, { active: true }); expect(doc.getElementById('cacrDzmInputCard').textContent).toContain('Dobowa zbiórka moczu (DZM)');
    expect(doc.getElementById('cacrDzmInputCard').querySelectorAll('select')).toHaveLength(3);
    doc.body.querySelector('[data-cacr-dzm-mode="direct"]').click();
    expect(doc.getElementById('CACR_DZM_inputMode').value).toBe('direct'); expect(doc.getElementById('cacrDzmConcentrationFields').hidden).toBe(true);
    doc.body.querySelector('[data-cacr-dzm-mode="concentration"]').click();
    expect(doc.getElementById('CACR_DZM_reportedValue').value).toBe('0.3'); expect(field.value).toBe('5');
    expect(doc.getElementById('CACR_DZM_collectionHours').value).toBe('12'); expect(doc.getElementById('CACR_DZM_durationKnown').value).toBe('false');
    ui.sync(doc, { active: false }); expect(doc.getElementById('cacrDzmInputCard')).toBeNull();
    expect(field.closest('label').parentNode).toBe(origin); expect(field.getAttribute('aria-describedby')).toBe('original-help');
    expect(doc.documentElement.getAttribute('data-clcr-cacr-dzm-active')).toBeNull();
  });
  it('does not replace explicitly blank imported context with a default confirmation', () => {
    const { doc } = fixture(); ui.ensureControls(doc); doc.getElementById('CACR_DZM_sameSpecimen').value = '';
    ui.sync(doc, { active: true }); expect(doc.getElementById('CACR_DZM_sameSpecimen').value).toBe('');
  });
});
