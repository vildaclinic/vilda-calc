import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_collection_duration.js', 'clcr_po4_dzm_reference_data.js', 'clcr_po4_dzm.js', 'clcr_po4_dzm_ui.js', 'clcr_po4_dzm_persistence.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrPo4DzmUi, engine = browser.VildaClcrPo4Dzm, persistence = browser.ClcrPo4DzmPersistence;
const base = { mode: 'concentration', concentration: '50', concentrationUnit: 'mgP/dL', volume: '1500', volumeUnit: 'mL', hours: '24', ageYears: 10, sex: 'M', weightKg: '30' };
const result = patch => engine.evaluate({ ...base, ...patch }, browser.ClcrPo4DzmReferenceData.DEFAULT_POLICY);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function attribute(html, name) { return decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || ''); }
function card(html) { return html.split('<details')[0].replace(/data-clcr-po4-dzm-snapshot="[^"]*"/g, ''); }

// These checks call the production engine, renderer and snapshot reader together.
// They ensure display precision and units cannot silently become saved data.
describe('PO4 DZM — one card and the actual production assessment', () => {
  it.each(['mgP/24h', 'mmol/24h'])('renders and captures the same selected %s while retaining canonical phosphorus', outputUnit => {
    const model = result({ outputUnit }), html = ui.renderResult(model), main = card(html), shown = model.presentation;
    expect(model.valid).toBe(true);
    expect(main).toContain(`data-clcr-value="${shown.rawValue}"`);
    expect(main).toContain(`data-clcr-display-value="${shown.valueText}"`);
    expect(main).toContain(`data-clcr-display-unit="${shown.unitText}"`);
    expect(main).toContain(`>${shown.valueText}</strong>`);
    expect(main.replace(/<[^>]*>/g, "")).toContain(shown.referenceValue);
    expect(main).toContain(`class="po4-dzm-reference-unit">${shown.unitText}</span>`);
    expect(main).toContain('6–12 lat');
    expect(main.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(main).not.toMatch(/kg\/|wykres|svg/);
    const snapshot = JSON.parse(attribute(html, 'data-clcr-po4-dzm-snapshot'));
    expect(persistence.readSnapshot(JSON.stringify(snapshot))).toEqual(model);
    expect(snapshot.rawValue).toBe(750);
    expect(snapshot.unit).toBe('mg P/24 h');
    const dp = { sourceFormulaId: 'PO4_mgkg' };
    persistence.augmentDatapoint({ getAttribute: name => attribute(html, name) }, dp);
    expect(dp).toMatchObject({ valueNum: shown.rawValue, rawValue: shown.rawValue, unit: shown.unitText, displayValue: shown.valueText, norm: shown.referenceText, outOfRange: false });
  });

  it.each(['129.99999999999997', '130', '941', '941.0000000000001', '0.015', '1e-20', '0'])('keeps exact patient value %s and its pre-rounding assessment coherent', reportedValue => {
    const model = result({ mode: 'reported', reportedValue }), html = ui.renderResult(model), main = card(html);
    expect(main).toContain(`>${model.presentation.valueText}</strong>`);
    expect(attribute(html, 'data-clcr-value')).toBe(String(model.presentation.rawValue));
    expect(attribute(html, 'data-clcr-tone')).toBe(model.tone);
    expect(persistence.readSnapshot(attribute(html, 'data-clcr-po4-dzm-snapshot'))).not.toBeNull();
    if (reportedValue !== '0') expect(Number(model.presentation.valueText.replace(',', '.'))).toBeGreaterThan(0);
    if (model.outOfRange === true) expect(main).toContain('data-clcr-tone="warning"');
    expect(main).not.toContain('data-clcr-tone="danger"');
    if (reportedValue === '0') {
      expect(main).toContain('data-clcr-assessment="unassessed"');
      expect(main).toContain('Brak normy do porównania');
      expect(main).toContain('granicy oznaczalności');
    }
  });

  it.each([{ ageYears: null }, { ageYears: 5 }, { ageYears: 40, sex: null }, { hours: '12' }])('keeps an available number neutral when its comparison is unavailable: %j', patch => {
    const model = result(patch), main = card(ui.renderResult(model));
    expect(model.valid).toBe(true);
    expect(main).toContain('data-clcr-assessment="unassessed"');
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('Brak normy do porównania');
    expect(main.replace(/<[^>]*>/g, '')).not.toContain('130–941');
  });

  it('reported daily result retains known 12-hour context without scaling or a reference', () => {
    const model = result({ mode: 'reported', reportedValue: '750', hours: '12' }), main = card(ui.renderResult(model));
    expect(model).toMatchObject({ rawValue: 750, hours: 12, referenceAvailable: false, outOfRange: null });
    expect(main).toContain('>750</strong>');
    expect(main).toContain('bez ponownego przeliczenia');
  });

  it.each([{ hours: '0' }, { hours: '-1' }, { mode: 'reported', reportedValue: '750', hours: '0' }, { knownFacts: { Cl24CollectionProblem: true } }, { mode: 'reported', reportedValue: '750', knownFacts: { collectionNoMissedVoids: false } }])('produces no saved-result anchor for invalid or incomplete collection: %j', patch => {
    const model = result(patch), html = ui.renderResult(model);
    expect(model.valid).toBe(false);
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-po4-dzm-snapshot=');
  });

  it('keeps the exact below-boundary assessment when binary raw Number equals the boundary', () => {
    const model = result({ concentration: '13.000000000000002', concentrationUnit: 'mgP/L', volume: '9.999999999999998', volumeUnit: 'L' });
    const html = ui.renderResult(model), main = card(html);
    expect(model).toMatchObject({ valid: true, rawValue: 130, status: 'low', outOfRange: true });
    expect(Number(model.presentation.valueText.replace(',', '.'))).toBeLessThanOrEqual(130);
    expect(model.presentation.valueText).not.toBe('130');
    expect(main).toContain(`>${model.presentation.valueText}</strong>`);
    expect(main.replace(/<[^>]*>/g, '')).toContain('130–941');
    expect(main).toContain('data-clcr-value="130"');
    expect(main).toContain('data-clcr-tone="warning"');
    expect(persistence.readSnapshot(attribute(html, 'data-clcr-po4-dzm-snapshot'))).not.toBeNull();
  });

  it('keeps optional kg conversion and clinical context in collapsed Details', () => {
    const html = ui.renderResult(result()), main = card(html), details = html.split('<details')[1];
    expect(main).not.toMatch(/XLH|burosumab|przytarczy|mg P\/kg/);
    expect(details).toContain('25 mg P/kg/24 h');
    expect(details).toContain('XLH');
    expect(details).toContain('co 3 miesiące');
    expect(details).toContain('bez wymogu każdorazowej DZM');
    expect(details).toContain('data-po4-dzm-open-tmp');
    expect(html).not.toContain('<details open');
    expect(details.match(/Krzywica hipofosfatemiczna, XLH i burosumab/g)).toHaveLength(1);
  });

  it('uses frozen presentation without consulting a current engine or patient document', () => {
    const model = result({ outputUnit: 'mmol/24h' }), old = browser.VildaClcrPo4Dzm;
    browser.VildaClcrPo4Dzm = { presentation() { throw new Error('must use frozen presentation'); } };
    try { expect(card(ui.renderResult(model))).toContain(`>${model.presentation.valueText}</strong>`); }
    finally { browser.VildaClcrPo4Dzm = old; }
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

describe('PO4 DZM — mode and correctable duration controls', () => {
  it('registers exactly the necessary standalone inputs and keeps restored data', () => {
    const { doc } = documentFixture();
    expect(ui.ensureControls(doc)).toHaveLength(12);
    expect(doc.getElementById('PO4_inputMode').value).toBe('concentration');
    expect(doc.getElementById('PO4_collectionHours').value).toBe('24');
    expect(doc.getElementById('PO4_concentrationUnit').children.map(option => option.textContent)).toEqual(['mg P/dL', 'mg P/L', 'mmol/L']);
    expect(doc.getElementById('PO4_reportedUnit').children.map(option => option.textContent)).toEqual(['mg P/24 h', 'mmol/24 h']);
    doc.getElementById('PO4_concentration').value = '42'; ui.ensureControls(doc);
    expect(doc.body.querySelectorAll('#PO4_concentration')).toHaveLength(1);
    expect(doc.getElementById('PO4_concentration').value).toBe('42');
    expect(doc.getElementById('weight')).toBeNull();
    expect(doc.getElementById('age')).toBeNull();
    expect(doc.getElementById('sex')).toBeNull();
  });

  it.each(['12', '0', '-1', 'wrong'])('keeps known %s hours visible and correctable in reported mode', hours => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    doc.getElementById('PO4_inputMode').value = 'reported';
    doc.getElementById('PO4_reportedValue').value = '750';
    doc.getElementById('PO4_collectionHours').value = hours;
    ui.sync(doc, { active: true });
    expect(doc.getElementById('po4DzmInputCard').querySelector('.po4-dzm-context-row').hidden).toBe(false);
    if (hours !== '12') expect(doc.getElementById('po4DzmDurationEditor').hidden).toBe(false);
    expect(doc.documentElement.getAttribute('data-clcr-po4-dzm-active')).toBe('1');
    ui.restore(doc);
    expect(doc.documentElement.hasAttribute('data-clcr-po4-dzm-active')).toBe(false);
    expect(doc.getElementById('PO4_collectionHours').value).toBe(hours);
  });
});

function populate(doc, values = {}) {
  const form = doc.getElementById('clcrForm');
  for (const [id, value] of Object.entries({ age: '10', sex: 'M', PO4_concentration: '13', PO4_volume: '1000', ...values })) {
    let field = doc.getElementById(id);
    if (!field) { field = doc.createElement('input'); field.id = id; form.append(field); }
    field.value = value;
  }
}
function currentModel(doc) { return engine.evaluate(engine.readInputFromDocument(doc), browser.ClcrPo4DzmReferenceData.DEFAULT_POLICY); }
function changeUnit(doc, id, value, trusted = true) {
  const field = doc.getElementById(id); field.value = value;
  // Native select input refreshes the form before its later change event.
  for (const listener of field.sluchacze.get('input') || []) listener({ type: 'input', target: field, isTrusted: trusted });
  ui.refresh(doc);
  for (const listener of field.sluchacze.get('change') || []) listener({ type: 'change', target: field, isTrusted: trusted });
}

describe('PO4 DZM — physical unit selectors preserve the exact original quantity', () => {
  it('keeps the actual 130 boundary within range across concentration units, then restores the original entry', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc); populate(doc);
    const original = currentModel(doc);
    ui.sync(doc, { active: true });
    for (const unit of ['mgP/L', 'mmol/L']) {
      changeUnit(doc, 'PO4_concentrationUnit', unit);
      const after = currentModel(doc);
      expect(after).toMatchObject({ valid: true, rawValue: 130, status: 'within', outOfRange: false });
      expect(after.exactMain).toEqual(original.exactMain);
      expect(after.input.unitConversions.concentration).toMatchObject({ originalValue: '13', originalUnit: 'mgP/dL', convertedUnit: unit, convertedValue: doc.getElementById('PO4_concentration').value });
      expect(persistence.readSnapshot(JSON.stringify(after))).not.toBeNull();
    }
    changeUnit(doc, 'PO4_concentrationUnit', 'mgP/dL');
    expect(doc.getElementById('PO4_concentration').value).toBe('13');
    expect(doc.getElementById('PO4_unitConversions').value).toBe('');
    expect(currentModel(doc).exactMain).toEqual(original.exactMain);
  });

  it('converts 1500 mL to 1.5 L using production arithmetic without applying twice', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc); populate(doc, { PO4_concentration: '50', PO4_volume: '1500' });
    ui.sync(doc, { active: true });
    ui.ensureControls(doc); ui.ensureControls(doc);
    changeUnit(doc, 'PO4_volumeUnit', 'L');
    expect(doc.getElementById('PO4_volume').value).toBe('1,5');
    expect(currentModel(doc)).toMatchObject({ valid: true, rawValue: 750 });
    changeUnit(doc, 'PO4_volumeUnit', 'mL');
    expect(doc.getElementById('PO4_volume').value).toBe('1500');
    expect(currentModel(doc).rawValue).toBe(750);
  });

  it.each(['130', '941', '0.015', '1e-20', '0'])('keeps reported quantity %s exact after conversion to mmol and session serialization', reported => {
    const { doc } = documentFixture(); ui.ensureControls(doc); populate(doc, { PO4_inputMode: 'reported', PO4_reportedValue: reported });
    const original = currentModel(doc);
    changeUnit(doc, 'PO4_reportedUnit', 'mmol/24h');
    const after = currentModel(doc);
    expect(after.valid).toBe(true);
    expect(after.rawValue).toBe(original.rawValue);
    expect(after.status).toBe(original.status);
    expect(after.exactMain).toEqual(original.exactMain);
    const restored = documentFixture().doc; ui.ensureControls(restored);
    const values = Object.fromEntries([...engine.FIELD_IDS, 'age', 'sex'].map(id => [id, doc.getElementById(id)?.value || '']));
    populate(restored, JSON.parse(JSON.stringify(values)));
    ui.sync(restored, { active: true });
    expect(currentModel(restored).exactMain).toEqual(original.exactMain);
    expect(currentModel(restored).status).toBe(original.status);
    changeUnit(restored, 'PO4_reportedUnit', 'mgP/24h');
    expect(restored.getElementById('PO4_reportedValue').value).toBe(reported);
  });

  it('a real numerical edit clears conversion provenance and defines a new quantity', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc); populate(doc);
    changeUnit(doc, 'PO4_concentrationUnit', 'mmol/L');
    const field = doc.getElementById('PO4_concentration'); field.value = '1';
    doc.dispatchEvent({ type: 'input', target: field, isTrusted: true });
    expect(doc.getElementById('PO4_unitConversions').value).toBe('');
    expect(currentModel(doc)).toMatchObject({ valid: true, rawValue: 30.9738, status: 'low' });
  });

  it('an untrusted restore change keeps the explicitly restored input and unit', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc); populate(doc, { PO4_concentration: '100' });
    changeUnit(doc, 'PO4_concentrationUnit', 'mgP/L', false);
    expect(doc.getElementById('PO4_concentration').value).toBe('100');
    expect(doc.getElementById('PO4_unitConversions').value).toBe('');
    expect(currentModel(doc).rawValue).toBe(100);
    changeUnit(doc, 'PO4_concentrationUnit', 'mgP/dL');
    expect(doc.getElementById('PO4_concentration').value).toBe('10');
    expect(currentModel(doc).rawValue).toBe(100);
  });
});


describe('PO4 DZM — TmP/GFR handoff starts a fresh pair', () => {
  it('preserves patient and shared serum context, clearing only the four old paired concentrations', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    populate(doc, { age: '10', sex: 'F', weight: '30', Scr: '0.5', U_PO4_spot: '50', S_PO4_spot: '1', Ucr_spot: '40', Scr_spot: '0.5' });
    const vault = doc.defaultView.__vildaClcrVersionValueVault = { age: '10', sex: 'F', weight: '30', Scr: '0.5', U_PO4_spot: '50', S_PO4_spot: '1', Ucr_spot: '40', Scr_spot: '0.5' };
    const selections = [];
    doc.defaultView.ClcrUiWorkflow = { selectFormula(id) { selections.push(id); } };
    doc.dispatchEvent({ type: 'click', target: { closest: selector => selector === '[data-po4-dzm-open-tmp]' ? {} : null } });
    expect(selections).toEqual(['TMP_GFR']);
    for (const id of ['U_PO4_spot', 'S_PO4_spot', 'Ucr_spot', 'Scr_spot']) {
      expect(doc.getElementById(id).value).toBe(''); expect(vault[id]).toBe('');
    }
    expect(doc.getElementById('age').value).toBe('10');
    expect(doc.getElementById('sex').value).toBe('F');
    expect(doc.getElementById('weight').value).toBe('30');
    expect(doc.getElementById('Scr').value).toBe('0.5');
    expect(vault.Scr).toBe('0.5');
  });
});
