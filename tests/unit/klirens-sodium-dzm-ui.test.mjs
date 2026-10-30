import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_collection_duration.js', 'clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_sodium_dzm_data.js', 'clcr_sodium_dzm.js', 'clcr_sodium_dzm_ui.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrSodiumDzmUi, engine = browser.VildaClcrSodiumDzm;
const base = { mode: 'concentration', concentration: '100', volume: '1500', volumeUnit: 'mL', hours: '24', ageYears: 30, sex: 'M' };
const result = patch => engine.evaluate({ ...base, ...patch }, browser.ClcrSodiumDzmReferenceData.DEFAULT_POLICY);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = html => decode(html.replace(/<[^>]*>/g, ''));
const attribute = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const card = html => html.split('<details')[0].replace(/data-clcr-sodium-dzm-snapshot="[^"]*"/g, '');

// Exercise the real engine result and the exact payload rendered for saving.
describe('Sodium DZM — one integrated result and frozen reference', () => {
  it.each(['mmol/24h', 'gNa/24h'])('keeps patient value, norm and saved data in selected %s', outputUnit => {
    const model = result({ outputUnit }), html = ui.renderResult(model), main = card(html), shown = model.presentation;
    expect(main.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(main).toContain('data-clcr-series="Na_mmol_d"');
    expect(attribute(main, 'data-clcr-value')).toBe(String(shown.rawValue));
    expect(attribute(main, 'data-clcr-display-value')).toBe(shown.valueText);
    expect(attribute(main, 'data-clcr-display-unit')).toBe(shown.unitText);
    expect(main).toContain('Norma dla wieku');
    expect(plain(main)).toContain(shown.referenceValue);
    expect(main).toContain(`class="sodium-dzm-reference-unit">${shown.unitText}</span>`);
    expect(main).not.toMatch(/NaCl|WHO|m²|mg\/kg/);
    expect(html).toContain('WHO');
    expect(html).not.toContain('<details open');
    expect(JSON.parse(attribute(html, 'data-clcr-sodium-dzm-snapshot'))).toEqual(model);
  });

  it('renders both reference boundaries and the patient marker without a misleading zero tick', () => {
    const main = card(ui.renderResult(result()));
    expect(main).toContain('sodium-dzm-norm-boundary--low');
    expect(main).toContain('sodium-dzm-norm-boundary--high');
    expect(main).toContain('sodium-dzm-norm-point');
    expect(main).not.toContain('norm-label--zero');
    expect(plain(main)).toContain('58');
    expect(plain(main)).toContain('337');
    // The registered single inline style carries only continuous axis data;
    // every static appearance rule remains in the component stylesheet.
    const inlineStyles = [...main.matchAll(/\sstyle="([^"]+)"/g)];
    expect(inlineStyles).toHaveLength(1);
    const parameters = inlineStyles[0][1].split(';').map(value => value.split(':'));
    expect(parameters.map(([name]) => name)).toEqual(['--low', '--high', '--point']);
    for (const [, value] of parameters) {
      expect(value).toMatch(/^\d+(?:\.\d+)?%$/);
      expect(Number.parseFloat(value)).toBeGreaterThanOrEqual(0);
      expect(Number.parseFloat(value)).toBeLessThanOrEqual(100);
    }
  });

  it.each(['57.999999999999999999', '337.000000000000000001'])('retains an amber exact outside-boundary assessment for %s', reportedValue => {
    const model = result({ mode: 'reported', reportedValue, reportedUnit: 'mmol/24h' }), main = card(ui.renderResult(model));
    expect(model.outOfRange).toBe(true);
    expect(main).toContain('data-clcr-tone="warning"');
    expect(main).toContain('data-clcr-assessment="outside"');
    expect(model.presentation.valueText).toContain('≈');
    expect(main).toContain('sodium-dzm-rounding-note');
    expect(ui.renderResult(model)).toContain('Wynik przed zaokrągleniem');
  });

  it('shows the available norm for zero while keeping it unassessed', () => {
    const main = card(ui.renderResult(result({ mode: 'reported', reportedValue: '0' })));
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('data-clcr-assessment="unassessed"');
    expect(main).toContain('data-clcr-reference-comparison="false"');
    expect(plain(main)).toContain('58–337');
    expect(plain(main)).toContain('granicy oznaczalności');
  });

  it.each(['0.00000000000000001', '1e-300'])('keeps %s positive in visible and saved fields', reportedValue => {
    const model = result({ mode: 'reported', reportedValue }), html = ui.renderResult(model);
    expect(model.valid).toBe(true);
    expect(Number(attribute(html, 'data-clcr-value'))).toBeGreaterThan(0);
    expect(attribute(html, 'data-clcr-display-value')).not.toBe('0');
    expect(JSON.parse(attribute(html, 'data-clcr-sodium-dzm-snapshot')).presentation.rawValue).toBeGreaterThan(0);
  });

  it.each([{ ageYears: null }, { ageYears: 5 }, { ageYears: 10, sex: 'M' }, { hours: '12' }])('does not invent a norm for %j', patch => {
    const model = result(patch), main = card(ui.renderResult(model));
    expect(model.valid).toBe(true);
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('data-clcr-assessment="unassessed"');
    expect(main).toContain('Brak normy do porównania');
    expect(main).not.toContain('sodium-dzm-norm-axis');
  });

  it('converts the complete source table and highlights only the eligible source cells', () => {
    for (const profile of [{ ageYears: 10, sex: 'F', active: 1 }, { ageYears: 16, sex: '', active: 2 }, { ageYears: 30, sex: 'M', active: 1 }]) {
      const model = result({ ...profile, outputUnit: 'gNa/24h' }), html = ui.renderResult(model);
      const table = html.match(/<table[^>]*>[\s\S]*?<\/table>/)?.[0] || '';
      expect((table.match(/sodium-dzm-current-cell/g) || [])).toHaveLength(profile.active);
      expect(table.match(/<tr>/g)).toHaveLength(model.referenceTable.length + 1);
      expect(plain(table)).not.toContain('58–337');
      for (const row of model.referenceTable) {
        expect(plain(table)).toContain(row.label);
        expect(plain(table)).toContain(row.male.text);
        expect(plain(table)).toContain(row.female.text);
      }
    }
  });

  it.each([{ hours: '0' }, { knownFacts: { Cl24CollectionProblem: true } }, { mode: 'reported', reportedValue: '150', knownFacts: { collectionNoMissedVoids: false } }])('does not expose a collectible result for rejected input %j', patch => {
    const html = ui.renderResult(result(patch));
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-sodium-dzm-snapshot=');
  });

  it('renders a frozen snapshot without consulting current engine, policy or document fields', () => {
    const model = JSON.parse(JSON.stringify(result({ outputUnit: 'gNa/24h' }))), old = browser.VildaClcrSodiumDzm;
    browser.VildaClcrSodiumDzm = new Proxy({}, { get() { throw new Error('frozen render must not call engine'); } });
    try {
      expect(plain(card(ui.renderResult(model)))).toContain(model.presentation.referenceValue);
      expect(attribute(ui.renderResult(model), 'data-clcr-display-unit')).toBe('g Na/24 h');
    } finally { browser.VildaClcrSodiumDzm = old; }
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
  return { doc, form };
}
function nativeChange(field, value) {
  field.value = value;
  for (const type of ['input', 'change']) for (const listener of field.sluchacze.get(type) || []) listener({ type, target: field, isTrusted: true });
}

describe('Sodium DZM — minimal controls and quantity-preserving unit changes', () => {
  it('creates eleven idempotent controls with actual 24 h and no extra patient questions', () => {
    const { doc } = documentFixture();
    expect(ui.ensureControls(doc)).toHaveLength(11);
    expect(doc.getElementById('Na_inputMode').value).toBe('concentration');
    expect(doc.getElementById('Na_collectionHours').value).toBe('24');
    expect(doc.getElementById('Na_collectionSource').value).toBe('assumed-24h');
    expect(doc.getElementById('Na_reportedUnit').children.map(option => option.textContent)).toEqual(['mmol/24 h', 'mg Na/24 h', 'g Na/24 h']);
    doc.getElementById('Na_concentration').value = '100'; ui.ensureControls(doc);
    expect(doc.body.querySelectorAll('#Na_concentration')).toHaveLength(1);
    expect(doc.getElementById('Na_concentration').value).toBe('100');
    for (const id of ['Na_concentrationUnit', 'weight', 'height', 'age', 'sex']) expect(doc.getElementById(id)).toBeNull();
    ui.sync(doc, { active: true });
    expect(doc.getElementById('sodiumDzmInputCard').textContent).toContain('1 mmol/L = 1 mEq/L');
  });

  it('keeps values through mode switches and returns fields to their original wrappers', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    doc.getElementById('Na_concentration').value = '100'; doc.getElementById('Na_reportedValue').value = '150';
    const origin = doc.getElementById('Na_concentration').closest('label').parentNode;
    ui.sync(doc, { active: true });
    doc.body.querySelector('[data-sodium-dzm-mode="reported"]').click();
    expect(doc.getElementById('Na_inputMode').value).toBe('reported');
    expect(doc.getElementById('Na_concentration').value).toBe('100');
    doc.body.querySelector('[data-sodium-dzm-mode="concentration"]').click();
    expect(doc.getElementById('Na_reportedValue').value).toBe('150');
    ui.restore(doc);
    expect(doc.getElementById('Na_concentration').closest('label').parentNode).toBe(origin);
    expect(doc.documentElement.hasAttribute('data-clcr-sodium-dzm-active')).toBe(false);
  });

  it('adopts one live picker into the heading and cleans it after replacement, clear and formula switch', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    const report = doc.createElement('section'); report.id = 'clcrResultReport';
    const heading = doc.createElement('div'); heading.className = 'clcr-result-report__head'; report.append(heading); doc.body.append(report);
    const makeResult = (className, withPicker = true) => {
      const host = doc.createElement('div'); host.className = className;
      const picker = doc.createElement('label'); picker.className = 'sodium-dzm-output-picker';
      if (withPicker) host.append(picker);
      report.append(host);
      return { host, picker };
    };
    const first = makeResult('sodium-dzm-proposal-card');
    ui.sync(doc, { active: true });
    expect(first.picker.parentNode).toBe(heading);
    ui.refresh(doc);
    expect(heading.querySelectorAll('.sodium-dzm-output-picker')).toHaveLength(1);
    first.host.remove();
    const next = makeResult('sodium-dzm-proposal-card'); ui.refresh(doc);
    expect(first.picker.parentNode).toBeNull();
    expect(next.picker.parentNode).toBe(heading);
    next.host.remove();
    const numericError = makeResult('sodium-dzm-result-error'); ui.refresh(doc); ui.refresh(doc);
    expect(numericError.picker.parentNode).toBe(heading);
    numericError.host.remove();
    const empty = makeResult('sodium-dzm-result-empty', false); ui.refresh(doc);
    expect(heading.querySelectorAll('.sodium-dzm-output-picker')).toHaveLength(0);
    empty.host.remove();
    const final = makeResult('sodium-dzm-proposal-card'); ui.refresh(doc); ui.restore(doc);
    expect(final.picker.parentNode).toBeNull();
    expect(heading.querySelectorAll('.sodium-dzm-output-picker')).toHaveLength(0);
  });

  it.each(['12', '0', '-1', 'wrong'])('keeps known %s-hour context visible and correctable in reported mode', hours => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    doc.getElementById('Na_inputMode').value = 'reported'; doc.getElementById('Na_reportedValue').value = '150'; doc.getElementById('Na_collectionHours').value = hours;
    ui.sync(doc, { active: true });
    expect(doc.getElementById('sodiumDzmInputCard').querySelector('.sodium-dzm-context-row').hidden).toBe(false);
    if (hours !== '12') expect(doc.getElementById('sodiumDzmDurationEditor').hidden).toBe(false);
    ui.restore(doc);
    expect(doc.getElementById('Na_collectionHours').value).toBe(hours);
  });

  it.each(['57.999999999999999999', '58', '337.000000000000000001', '1e-300', '0'])('preserves exact %s through native unit selectors', value => {
    const { doc, form } = documentFixture(); ui.ensureControls(doc);
    for (const [id, text] of Object.entries({ age: '30', sex: 'M' })) { const input = doc.createElement('input'); input.id = id; input.value = text; form.append(input); }
    doc.getElementById('Na_inputMode').value = 'reported'; doc.getElementById('Na_reportedValue').value = value;
    const current = () => engine.evaluate(engine.readInputFromDocument(doc), browser.ClcrSodiumDzmReferenceData.DEFAULT_POLICY);
    const before = current();
    for (const unit of ['mgNa/24h', 'gNa/24h', 'mmol/24h']) {
      nativeChange(doc.getElementById('Na_reportedUnit'), unit);
      const after = current();
      expect(after.valid).toBe(true);
      expect(after.exactMain).toEqual(before.exactMain);
      expect(after.outOfRange).toBe(before.outOfRange);
    }
    expect(doc.getElementById('Na_reportedValue').value).toBe(value);
  });

  it('preserves the inclusive 58 mmol boundary through mL/L unit-only changes', () => {
    const { doc, form } = documentFixture(); ui.ensureControls(doc);
    for (const [id, text] of Object.entries({ age: '30', sex: 'M' })) { const input = doc.createElement('input'); input.id = id; input.value = text; form.append(input); }
    doc.getElementById('Na_concentration').value = '100'; doc.getElementById('Na_volume').value = '580';
    for (const unit of ['L', 'mL']) {
      nativeChange(doc.getElementById('Na_volumeUnit'), unit);
      const model = engine.evaluate(engine.readInputFromDocument(doc), browser.ClcrSodiumDzmReferenceData.DEFAULT_POLICY);
      expect(model.valid).toBe(true);
      expect(model.exactMain).toEqual({ numerator: '58', denominator: '1' });
      expect(model.status).toBe('within');
    }
    expect(doc.getElementById('Na_volume').value).toBe('580');
  });

  it('preserves a subnormal positive input as exact text and rejects an unrepresentable output', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    doc.getElementById('Na_inputMode').value = 'reported';
    doc.getElementById('Na_reportedValue').value = '5e-324';
    nativeChange(doc.getElementById('Na_reportedUnit'), 'gNa/24h');
    const converted = doc.getElementById('Na_reportedValue').value;
    expect(converted).not.toBe('0');
    expect(engine.parseValue(converted).exact.numerator).not.toBe('0');
    const model = engine.evaluate(engine.readInputFromDocument(doc), browser.ClcrSodiumDzmReferenceData.DEFAULT_POLICY);
    expect(model.valid).toBe(true);
    expect(model.rawValue).toBeGreaterThan(0);
    doc.getElementById('Na_outputUnit').value = 'gNa/24h';
    const invalid = engine.evaluate(engine.readInputFromDocument(doc), browser.ClcrSodiumDzmReferenceData.DEFAULT_POLICY);
    expect(invalid.valid).toBe(false);
    expect(ui.renderResult(invalid)).not.toContain('data-clcr-series=');
    expect(ui.renderResult(invalid)).toContain('data-sodium-dzm-output-unit');
  });
});
