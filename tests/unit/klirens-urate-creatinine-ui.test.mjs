import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_urate_creatinine_data.js', 'clcr_urate_creatinine.js', 'clcr_urate_creatinine_ui.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrUrateCreatinineUi, engine = browser.VildaClcrUrateCreatinine;
const base = { mode: 'concentration', uricAcid: '100', uricAcidUnit: 'mg/dL', creatinine: '100', creatinineUnit: 'mg/dL', specimen: 'random', ageYears: 40 };
const result = patch => engine.compute({ ...base, ...patch }, browser.ClcrUrateCreatinineReferenceData.DATA);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = html => decode(html.replace(/<[^>]*>/g, ''));
const attribute = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const card = html => html.split('<details')[0].replace(/data-clcr-urate-creatinine-snapshot="[^"]*"/g, '');

describe('KM/Cr — one integrated result, captured references and source', () => {
  it.each([{ mode: 'concentration' }, { mode: 'reported', reportedValue: '1', reportedUnit: 'mg/mg' }])('renders one fixed-molar result in $mode', patch => {
    const model = result(patch), html = ui.renderResult(model), main = card(html);
    expect(main.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(main).toContain('data-clcr-series="KM_Cr"');
    expect(attribute(main, 'data-clcr-display-value')).toBe(model.presentation.valueText);
    expect(attribute(main, 'data-clcr-display-unit')).toBe('mmol/mmol');
    expect(attribute(main, 'data-clcr-value')).toBe(String(model.rawValue));
    expect(plain(main)).toContain('Norma dla wieku · Newcastle NHS');
    expect(plain(main)).toContain('0,11–0,53');
    expect(main).toContain('class="urate-creatinine-reference-unit">mmol/mmol</span>');
    expect(main).not.toMatch(/<select|style=/);
    expect(plain(main)).toContain('Podwyższony KM/Cr może wskazywać na zwiększone wydalanie kwasu moczowego.');
    expect(plain(main)).not.toContain('Sam wynik nie rozpoznaje kamicy ani nie zastępuje oceny dobowego wydalania.');
    expect(JSON.parse(attribute(html, 'data-clcr-urate-creatinine-snapshot'))).toEqual(model);
    expect(html).not.toContain('<details open');
  });
  it('has explicit lower and upper reference markers without inline styles or rescaled SVG fonts', () => {
    const main = card(ui.renderResult(result({ uricAcid: '60' })));
    expect(main).toContain('urate-creatinine-norm-boundary--low');
    expect(main).toContain('urate-creatinine-norm-boundary--high');
    expect(main).toContain('urate-creatinine-norm-point');
    expect(main).toContain('<svg class="urate-creatinine-norm-graphic" width="100%" height="76"');
    expect(main).not.toContain('viewBox=');
    expect(main).not.toMatch(/\sstyle=/);
    for (const [, value] of main.matchAll(/\s(?:x|width|x1|x2|cx)="(\d+(?:\.\d+)?)%"/g)) {
      expect(Number(value)).toBeGreaterThanOrEqual(0);
      expect(Number(value)).toBeLessThanOrEqual(100);
    }
  });
  it.each(['0.530000000000000000001', '0.109999999999999999999'])('keeps rounded %s visibly approximate and outside the source interval', reportedValue => {
    const model = result({ mode: 'reported', reportedValue, reportedUnit: 'mmol/mmol' });
    const html = ui.renderResult(model), main = card(html);
    expect(model.outOfRange).toBe(true);
    expect(main).toContain('data-clcr-tone="warning"');
    expect(plain(main)).toContain('≈');
    expect(plain(html)).toContain('Wynik przed zaokrągleniem');
    expect(plain(html)).toContain(model.presentation.fullValueText);
  });
  it.each(['0.11', '0.53'])('renders an inclusive exact endpoint %s as within the interval', reportedValue => {
    const model = result({ mode: 'reported', reportedValue, reportedUnit: 'mmol/mmol' }), main = card(ui.renderResult(model));
    expect(main).toContain('data-clcr-tone="normal"');
    expect(main).toContain('data-clcr-assessment="within"');
    expect(plain(main)).toContain('W zakresie');
  });
  it('keeps zero neutral and does not imply that a value below detection is a measured zero', () => {
    const main = card(ui.renderResult(result({ uricAcid: '0' })));
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('data-clcr-assessment="unassessed"');
    expect(main).toContain('data-clcr-reference-comparison="false"');
    expect(main).not.toContain('urate-creatinine-norm-axis');
    expect(plain(main)).toContain('granicę oznaczalności');
  });
  it.each([{ specimen: 'timed' }, { specimen: 'unknown' }, { ageYears: null }])('shows a number without a substituted norm for %j', patch => {
    const model = result(patch), main = card(ui.renderResult(model));
    expect(main).toContain('data-clcr-series="KM_Cr"');
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('data-clcr-reference-comparison="false"');
    expect(main).not.toContain('urate-creatinine-norm-axis');
    if (patch.specimen === 'timed') expect(plain(main)).toContain('Brak normy DZM w aplikacji');
  });
  it.each([{ uricAcid: '-1' }, { creatinine: '0' }, { uricAcid: '<0.1' }, { sameUrineSample: false }])('cannot collect a rejected %j result', patch => {
    const html = ui.renderResult(result(patch));
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-urate-creatinine-snapshot=');
    expect(plain(html)).toContain('Sprawdź');
  });
  it('shows the complete captured age table and active profile', () => {
    const model = result({ ageYears: 8 }), html = ui.renderResult(model), table = html.match(/<table[^>]*>[\s\S]*?<\/table>/)?.[0] || '';
    expect(table.match(/<tr/g)).toHaveLength(6);
    expect(table).toContain('urate-creatinine-current-row');
    expect(plain(table)).toContain('0,39–0,85');
    expect(plain(table)).toContain('Up to 2 years');
    expect(plain(table)).toContain('2 to 5 years');
    expect(plain(html)).toContain('Dokładnie 2 lata');
    expect(html).toContain('https://laboratories.newcastle-hospitals.nhs.uk/test-directory/urate-urine/');
  });
  it('renders a frozen model without the current engine or reference data', () => {
    const model = JSON.parse(JSON.stringify(result({ ageYears: 8 }))), previous = browser.VildaClcrUrateCreatinine;
    browser.VildaClcrUrateCreatinine = new Proxy({}, { get() { throw Error('frozen render must not compute'); } });
    try { expect(plain(card(ui.renderResult(model)))).toContain('0,39–0,85'); } finally { browser.VildaClcrUrateCreatinine = previous; }
  });
  it('shows exact recurring quantities compactly without discarding their captured expansion', () => {
    const model = result(), html = ui.renderResult(model);
    expect(model.presentation.fullValueComplete).toBe(false);
    expect(plain(html)).toContain(`Dokładny ułamek: ${model.exactMain.numerator}/${model.exactMain.denominator}`);
    const visible = plain(html.replace(/data-clcr-urate-creatinine-snapshot="[^"]*"/g, ''));
    expect(visible).not.toContain(model.presentation.fullValueText);
    expect(JSON.parse(attribute(html, 'data-clcr-urate-creatinine-snapshot')).presentation.fullValueText).toBe(model.presentation.fullValueText);
  });
  it('escapes captured clinical strings and rejects non-HTTPS source links', () => {
    const model = JSON.parse(JSON.stringify(result()));
    model.presentation.interpretation = '<img src=x onerror=alert(1)>';
    model.sources = [{ label: '<script>bad</script>', url: 'javascript:alert(1)' }];
    const html = ui.renderResult(model);
    expect(html).not.toContain('<img'); expect(html).not.toContain('<script'); expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;img'); expect(html).toContain('&lt;script&gt;');
  });
});

function documentFixture() {
  const doc = atrapaDokumentu(), create = doc.createElement;
  const enhance = node => {
    node.dataset = new Proxy({}, { set(_, key, value) { node.setAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, value); return true; }, get(_, key) { return node.getAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`); } });
    node.append = (...nodes) => nodes.forEach(child => node.appendChild(child));
    node.closest = selector => { for (let current = node; current; current = current.parentNode) if (current.tagName.toLowerCase() === selector) return current; return null; };
    node.removeEventListener = (type, listener) => node.sluchacze.set(type, (node.sluchacze.get(type) || []).filter(item => item !== listener));
    node.dispatchEvent = event => node.dispatch(event.type);
    return node;
  };
  doc.createElement = tag => enhance(create(tag));
  doc.createComment = text => { const node = doc.createElement('comment'); node.textContent = text; return node; };
  enhance(doc.documentElement); enhance(doc.body);
  doc.defaultView = { ...browser, Event: class Event { constructor(type) { this.type = type; } } };
  const form = doc.createElement('form'); form.id = 'clcrForm'; doc.body.append(form);
  const clear = doc.createElement('div'); clear.id = 'clearContainer'; form.append(clear);
  const age = doc.createElement('input'); age.id = 'age'; age.value = '40'; doc.body.append(age);
  return { doc, form };
}

describe('KM/Cr — reversible minimum-data form', () => {
  it('creates nine idempotent controls and no new patient or collection questions', () => {
    const { doc } = documentFixture();
    expect(ui.ensureControls(doc)).toHaveLength(9);
    expect(doc.getElementById('URCR_inputMode').type).toBe('hidden');
    expect(doc.getElementById('URCR_outputUnit').type).toBe('hidden');
    expect(doc.getElementById('URCR_inputMode').closest('label')).toBeNull();
    expect(doc.getElementById('URCR_specimen').value).toBe('random');
    expect(doc.getElementById('URCR_uricAcidUnit').children).toHaveLength(4);
    expect(doc.getElementById('URCR_reportedUnit').children).toHaveLength(3);
    doc.getElementById('URCR_uricAcid').value = '100'; ui.ensureControls(doc);
    expect(doc.body.querySelectorAll('#URCR_uricAcid')).toHaveLength(1);
    expect(doc.getElementById('URCR_uricAcid').value).toBe('100');
    for (const id of ['weight', 'height', 'sex', 'V24', 'Cl24DurationHours', 'serumUrate']) expect(doc.getElementById(id)).toBeNull();
  });
  it('preserves values and original ARIA through mode and formula switches', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    const field = doc.getElementById('URCR_uricAcid'); field.value = '100'; field.setAttribute('aria-describedby', 'original-help');
    doc.getElementById('URCR_reportedValue').value = '0.4';
    const origin = field.closest('label').parentNode;
    ui.sync(doc, { active: true });
    expect(field.getAttribute('aria-describedby')).toContain('urateCreatinineInputError');
    doc.body.querySelector('[data-urate-creatinine-mode="reported"]').click();
    expect(doc.getElementById('URCR_inputMode').value).toBe('reported');
    expect(doc.getElementById('URCR_uricAcid').value).toBe('100');
    doc.body.querySelector('[data-urate-creatinine-mode="concentration"]').click();
    expect(doc.getElementById('URCR_reportedValue').value).toBe('0.4');
    ui.sync(doc, { active: false });
    expect(doc.getElementById('urateCreatinineInputCard')).toBeNull();
    expect(field.closest('label').parentNode).toBe(origin);
    expect(field.getAttribute('aria-describedby')).toBe('original-help');
    expect(doc.documentElement.getAttribute('data-clcr-urate-creatinine-active')).toBeNull();
  });
  it('keeps specimen change collapsed and never silently qualifies historical unknown material', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    doc.getElementById('URCR_specimen').value = 'unknown';
    ui.sync(doc, { active: true });
    const editor = doc.getElementById('urateCreatinineSpecimenEditor'); expect(editor.hidden).toBe(true);
    expect(doc.getElementById('URCR_specimen').value).toBe('unknown');
    doc.body.querySelector('[aria-controls="urateCreatinineSpecimenEditor"]').click();
    expect(editor.hidden).toBe(false);
    expect(doc.getElementById('URCR_specimen').value).toBe('unknown');
    expect(doc.activeElement).toBe(doc.getElementById('URCR_specimen'));
  });
});
