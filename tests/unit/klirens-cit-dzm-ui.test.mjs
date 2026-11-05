import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_collection_duration.js', 'clcr_extended_egfr.js', 'clcr_cit_dzm_reference_data.js', 'clcr_cit_dzm.js', 'clcr_cit_dzm_ui.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrCitDzmUi, engine = browser.VildaClcrCitDzm;
const policy = browser.ClcrCitDzmReferenceData.DEFAULT_POLICY;
const base = { mode: 'concentration', concentration: '0.8', concentrationUnit: 'mmol/L', volume: '1000', volumeUnit: 'mL', hours: '24', ageYears: 10, sex: 'F', weightKg: '30', heightCm: '140', reportingEntity: 'unknown' };
const evaluate = patch => engine.evaluate({ ...base, ...patch }, policy);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const attribute = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const mainCard = html => html.split('<details')[0].replace(/data-clcr-cit-dzm-snapshot="[^"]*"/g, '');

describe('Citrate DZM — one result and frozen clinical presentation', () => {
  it.each([
    {},
    { concentration: '20', concentrationUnit: 'mg/L', reportingEntity: 'citric_acid' },
    { mode: 'reported', reportedValue: '1.8', reportedUnit: 'mmol/24h', ageYears: 40 },
  ])('uses the calculated daily amount and its reference in the same units: %j', patch => {
    const model = evaluate(patch), html = ui.renderResult(model), main = mainCard(html);
    expect(model.valid).toBe(true);
    expect(main).toContain('data-clcr-series="Cit_total24"');
    expect(main.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(attribute(html, 'data-clcr-value')).toBe(String(model.presentation.rawValue));
    expect(attribute(html, 'data-clcr-display-value')).toBe(model.presentation.valueText);
    expect(attribute(html, 'data-clcr-display-unit')).toBe(model.presentation.unitText);
    expect(decode(main.replace(/<[^>]*>/g, ''))).toContain(model.presentation.referenceValue);
    expect(main).toContain(`class="cit-dzm-reference-unit">${model.presentation.unitText}</span>`);
    expect(main).toContain('Norma dla pacjenta');
    expect(main).not.toContain('Norma dla wieku');
    expect(main).not.toMatch(/mg\/kg|mmol\/1,73/);
    expect(JSON.parse(attribute(html, 'data-clcr-cit-dzm-snapshot'))).toEqual(model);
    expect(html).not.toContain('<details open');
    expect(html).toContain(model.notes.clinicalDetails);
  });

  it.each([
    { reportedValue: '1.5', sex: 'M', expectedTone: 'warning' },
    { reportedValue: '1.7', sex: 'M', expectedTone: 'normal' },
    { reportedValue: '1.7', sex: 'F', expectedTone: 'warning' },
    { reportedValue: '1.9', sex: 'F', expectedTone: 'normal' },
    { reportedValue: '20', sex: 'F', expectedTone: 'normal' },
  ])('keeps the adult $sex lower-bound assessment for $reportedValue mmol/24 h', ({ reportedValue, sex, expectedTone }) => {
    const model = evaluate({ mode: 'reported', reportedValue, reportedUnit: 'mmol/24h', ageYears: 40, sex });
    const main = mainCard(ui.renderResult(model));
    expect(model.tone).toBe(expectedTone);
    expect(main).toContain(`data-clcr-tone="${expectedTone}"`);
    expect(main).toContain('data-clcr-reference-kind="lower"');
    expect(main).toContain('class="cit-dzm-reference-unit"');
    expect(main).not.toContain('data-clcr-tone="danger"');
  });

  it('marks exact pediatric equality as the lower boundary and starts the normal band there', () => {
    const model = evaluate({ mode: 'reported', reportedValue: '1.9', reportedUnit: 'mmol/24h', sex: 'M', weightKg: '100', heightCm: '107.7444' });
    const main = decode(mainCard(ui.renderResult(model)));
    expect(model.status).toBe('boundary');
    expect(main).toContain('Na dolnej granicy');
    expect(main).toContain('Norma: >1,9 mmol/24 h');
    expect(main).toContain('data-clcr-tone="warning"');
    const band = /class="cit-dzm-range-normal" x="([\d.]+)%" y="29" width="([\d.]+)%"/.exec(main);
    const boundary = /class="cit-dzm-range-boundary" x1="([\d.]+)%"/.exec(main);
    expect(Number(band[1])).toBe(Number(boundary[1]));
    expect(Number(band[1]) + Number(band[2])).toBeCloseTo(96);
  });

  it.each(['0', '0.0000001', '1e-20'])('retains the actual %s result instead of displaying a rounded zero', reportedValue => {
    const model = evaluate({ mode: 'reported', reportedValue, reportedUnit: 'mmol/24h', ageYears: 40 });
    expect(model.valid).toBe(true);
    const html = ui.renderResult(model);
    expect(attribute(html, 'data-clcr-display-value')).toBe(model.presentation.valueText);
    expect(JSON.parse(attribute(html, 'data-clcr-cit-dzm-snapshot')).exactMain).toEqual(model.exactMain);
    if (reportedValue !== '0') expect(model.presentation.valueText).not.toBe('0');
  });

  it.each([
    { ageYears: null }, { sex: '' }, { ageYears: 0.5 }, { weightKg: '' }, { heightCm: '' }, { hours: '12' },
    { concentration: '20', concentrationUnit: 'mg/L', reportingEntity: 'unknown' },
  ])('keeps the available number without a fabricated reference: %j', patch => {
    const model = evaluate(patch), main = mainCard(ui.renderResult(model));
    expect(model.valid).toBe(true);
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('data-clcr-reference-comparison="false"');
    expect(main).toContain('data-clcr-series="Cit_total24"');
    expect(main).not.toContain('<svg');
  });

  it.each([{ concentration: '-1' }, { volume: '0' }, { hours: '-1' }])('does not create a collectible result from invalid input: %j', patch => {
    const html = ui.renderResult(evaluate(patch));
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-cit-dzm-snapshot=');
    expect(html).toContain('Sprawdź wpisane dane');
  });

  it('uses a saved presentation without reading the current engine or patient', () => {
    const model = evaluate({ concentration: '20', concentrationUnit: 'mg/L', reportingEntity: 'citric_acid' });
    const original = browser.VildaClcrCitDzm;
    browser.VildaClcrCitDzm = { evaluate() { throw new Error('Frozen results must not recalculate'); }, presentation() { throw new Error('Frozen result must keep its presentation'); } };
    try { expect(mainCard(ui.renderResult(model))).toContain(`>${model.presentation.valueText}</strong>`); }
    finally { browser.VildaClcrCitDzm = original; }
  });

  it('keeps zero neutral with a visible reference and no coloured comparison axis', () => {
    const model = evaluate({ mode: 'reported', reportedValue: '0', reportedUnit: 'mmol/24h', ageYears: 40 });
    const main = mainCard(ui.renderResult(model));
    expect(model.status).toBe('zero');
    expect(main).toContain('data-clcr-reference-comparison="false"');
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('oznaczalności');
    expect(main).not.toContain('<svg');
  });

  it('states the missing-reference reason once instead of repeating it beside and below the number', () => {
    const model = evaluate({ ageYears: null });
    const main = decode(mainCard(ui.renderResult(model)));
    expect(main.split(model.interpretation)).toHaveLength(2);
    expect(main).toContain('Brak normy do porównania');
  });
});

function documentFixture() {
  const doc = atrapaDokumentu(), create = doc.createElement;
  const enhance = node => {
    node.dataset = new Proxy({}, { set(_, key, value) { node.setAttribute(`data-${String(key).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value); return true; }, get(_, key) { return node.getAttribute(`data-${String(key).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`); } });
    node.append = (...nodes) => nodes.forEach(child => node.appendChild(child));
    node.closest = selector => { for (let current = node; current; current = current.parentNode) if (current.tagName.toLowerCase() === selector) return current; return null; };
    node.removeEventListener = (type, listener) => node.sluchacze.set(type, (node.sluchacze.get(type) || []).filter(item => item !== listener));
    node.dispatchEvent = event => { event.target = node; for (let current = node; current; current = event.bubbles ? current.parentNode : null) for (const listener of current.sluchacze.get(event.type) || []) listener(event); };
    return node;
  };
  doc.createElement = tag => enhance(create(tag));
  doc.createComment = text => { const node = doc.createElement('comment'); node.textContent = text; return node; };
  enhance(doc.documentElement); enhance(doc.body);
  doc.defaultView = { ...browser, Event: class Event { constructor(type, options = {}) { this.type = type; this.bubbles = options.bubbles === true; this.isTrusted = false; } } };
  const form = doc.createElement('form'); form.id = 'clcrForm'; doc.body.append(form);
  const clear = doc.createElement('div'); clear.id = 'clearContainer'; form.append(clear);
  ui.ensureControls(doc);
  return { doc, form };
}
function change(doc, id, value, type = 'change') {
  const field = doc.getElementById(id); field.value = value;
  const event = { type, target: field, isTrusted: true, bubbles: true };
  doc.dispatchEvent(event);
  field.dispatchEvent(event);
}
function addPatient(doc, form) {
  for (const [id, value] of Object.entries({ age: '10', sex: 'F', weight: '30', height: '140' })) {
    const input = doc.createElement('input'); input.id = id; input.value = value; form.append(input);
  }
}

describe('Citrate DZM — minimal controls and meaningful unit changes', () => {
  it('registers defaults once, with no new patient or collection-quality questions', () => {
    const { doc } = documentFixture();
    expect(ui.ensureControls(doc).map(control => control.id).sort()).toEqual([...engine.FIELD_IDS].sort());
    expect(doc.getElementById('CITDZM_inputMode').value).toBe('concentration');
    expect(doc.getElementById('CITDZM_collectionHours').value).toBe('24');
    expect(doc.getElementById('CITDZM_reportingEntity').value).toBe('unknown');
    expect(doc.getElementById('CITDZM_concentrationUnit').children.map(option => option.textContent)).toEqual(['mmol/L', 'µmol/L', 'mg/L', 'mg/dL']);
    doc.getElementById('CITDZM_concentration').value = '200'; ui.ensureControls(doc);
    expect(doc.body.querySelectorAll('#CITDZM_concentration')).toHaveLength(1);
    expect(doc.getElementById('CITDZM_concentration').value).toBe('200');
    for (const id of ['weight', 'height', 'age', 'sex', 'stoneMetabolicContext']) expect(doc.getElementById(id)).toBeNull();
  });

  it('moves controls reversibly and keeps duration visible when a ready result has known non-24h context', () => {
    const { doc } = documentFixture();
    ui.sync(doc, { active: true });
    expect(doc.getElementById('citDzmInputCard')).not.toBeNull();
    expect(doc.getElementById('CITDZM_collectionHours').closest('label').hidden).toBe(false);
    change(doc, 'CITDZM_inputMode', 'reported');
    expect(doc.getElementById('citDzmInputCard').querySelector('.cit-dzm-duration-field').hidden).toBe(true);
    change(doc, 'CITDZM_collectionHours', '12', 'input');
    expect(doc.getElementById('citDzmInputCard').querySelector('.cit-dzm-duration-field').hidden).toBe(false);
    ui.restore(doc);
    expect(doc.getElementById('citDzmInputCard')).toBeNull();
    expect(doc.getElementById('CITDZM_collectionHours').value).toBe('12');
    expect(doc.documentElement.hasAttribute('data-clcr-cit-dzm-active')).toBe(false);
  });

  it('preserves exact molar quantity when actual unit selectors are changed', () => {
    const { doc, form } = documentFixture(); addPatient(doc, form);
    doc.getElementById('CITDZM_concentration').value = '0.9998999999999999';
    doc.getElementById('CITDZM_volume').value = '1500';
    ui.sync(doc, { active: true });
    const current = () => engine.evaluate(engine.readInputFromDocument(doc), policy);
    const before = current();
    for (const unit of ['µmol/L', 'mmol/L']) {
      change(doc, 'CITDZM_concentrationUnit', unit, 'input');
      change(doc, 'CITDZM_concentrationUnit', doc.getElementById('CITDZM_concentrationUnit').value);
      const after = current();
      expect(after.valid).toBe(true);
      expect(after.exactMain).toEqual(before.exactMain);
      expect(after.outOfRange).toBe(before.outOfRange);
    }
    expect(doc.getElementById('CITDZM_concentration').value).toBe('0.9998999999999999');
  });

  it('does not relabel an entered unknown mass as moles and offers the missing report information', () => {
    const { doc } = documentFixture();
    doc.getElementById('CITDZM_concentrationUnit').value = 'mg/L';
    doc.getElementById('CITDZM_concentration').value = '20';
    doc.getElementById('CITDZM_volume').value = '1500';
    ui.sync(doc, { active: true });
    change(doc, 'CITDZM_concentrationUnit', 'mmol/L', 'input');
    expect(doc.getElementById('CITDZM_concentrationUnit').value).toBe('mg/L');
    expect(doc.getElementById('CITDZM_concentration').value).toBe('20');
    expect(doc.getElementById('citDzmEntityEditor').hidden).toBe(false);
    expect(doc.getElementById('citDzmUnitMessage').textContent).toContain('wybierz postać');
    change(doc, 'CITDZM_reportingEntity', 'citric_acid');
    expect(doc.getElementById('CITDZM_concentration').value).toBe('20');
    expect(doc.getElementById('citDzmUnitMessage').hidden).toBe(true);
    change(doc, 'CITDZM_concentrationUnit', 'mmol/L', 'input');
    expect(doc.getElementById('CITDZM_concentrationUnit').value).toBe('mmol/L');
    expect(doc.getElementById('CITDZM_concentration').value).not.toBe('20');
  });

  it('converts mass-only units without requiring the reporting entity', () => {
    const { doc } = documentFixture();
    doc.getElementById('CITDZM_concentrationUnit').value = 'mg/L';
    doc.getElementById('CITDZM_concentration').value = '20';
    ui.sync(doc, { active: true });
    change(doc, 'CITDZM_concentrationUnit', 'mg/dL', 'input');
    expect(doc.getElementById('CITDZM_concentration').value).toBe('2');
    expect(doc.getElementById('CITDZM_reportingEntity').value).toBe('unknown');
  });

  it('reveals the mass-basis chooser when changing a filled molar result to mg', () => {
    const { doc, form } = documentFixture(); addPatient(doc, form);
    doc.getElementById('CITDZM_concentration').value = '0.8';
    doc.getElementById('CITDZM_volume').value = '1000';
    ui.sync(doc, { active: true });
    const current = () => engine.evaluate(engine.readInputFromDocument(doc), policy);
    const before = current();
    expect(doc.getElementById('citDzmEntityEditor').hidden).toBe(true);
    change(doc, 'CITDZM_concentrationUnit', 'mg/L', 'input');
    expect(doc.getElementById('CITDZM_concentrationUnit').value).toBe('mmol/L');
    expect(doc.getElementById('CITDZM_concentration').value).toBe('0.8');
    expect(doc.getElementById('citDzmEntityEditor').hidden).toBe(false);
    expect(doc.getElementById('citDzmInputCard').querySelector('.cit-dzm-context-row').hidden).toBe(false);
    change(doc, 'CITDZM_reportingEntity', 'citric_acid');
    change(doc, 'CITDZM_concentrationUnit', 'mg/L', 'input');
    const after = current();
    expect(doc.getElementById('CITDZM_concentrationUnit').value).toBe('mg/L');
    expect(after.exactMmol).toEqual(before.exactMmol);
    expect(after.outOfRange).toBe(before.outOfRange);
    expect(after.rawValue).toBeCloseTo(153.6988, 8);
  });

  it('allows any unit on an empty field and resets report-specific data without changing the patient', () => {
    const { doc, form } = documentFixture(); addPatient(doc, form); ui.sync(doc, { active: true });
    change(doc, 'CITDZM_concentrationUnit', 'mg/L', 'input');
    expect(doc.getElementById('CITDZM_concentrationUnit').value).toBe('mg/L');
    change(doc, 'CITDZM_concentration', '20', 'input');
    change(doc, 'CITDZM_reportingEntity', 'citric_acid');
    change(doc, 'CITDZM_collectionHours', '12', 'input');
    ui.reset(doc);
    expect(doc.getElementById('CITDZM_concentration').value).toBe('');
    expect(doc.getElementById('CITDZM_reportingEntity').value).toBe('unknown');
    expect(doc.getElementById('CITDZM_collectionHours').value).toBe('24');
    expect(doc.getElementById('CITDZM_collectionSource').value).toBe('assumed-24h');
    expect(doc.getElementById('CITDZM_unitConversions').value).toBe('');
    expect(doc.getElementById('weight').value).toBe('30');
    expect(doc.getElementById('height').value).toBe('140');
  });
});
