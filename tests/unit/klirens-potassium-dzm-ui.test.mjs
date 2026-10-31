import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_collection_duration.js', 'clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_potassium_dzm_data.js', 'clcr_potassium_dzm.js', 'clcr_potassium_dzm_ui.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrPotassiumDzmUi, engine = browser.VildaClcrPotassiumDzm;
const base = { mode: 'concentration', concentration: '100', volume: '1500', volumeUnit: 'mL', hours: '24', ageYears: 40, sex: 'M' };
const result = patch => engine.evaluate({ ...base, ...patch }, browser.ClcrPotassiumDzmReferenceData.DEFAULT_POLICY);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = html => decode(html.replace(/<[^>]*>/g, ''));
const attribute = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const card = html => html.split('<details')[0].replace(/data-clcr-potassium-dzm-snapshot="[^"]*"/g, '');

describe('Potassium DZM — integrated result and the frozen clinical presentation', () => {
  it.each([{ mode: 'concentration' }, { mode: 'reported', reportedValue: '150' }])('renders one fixed-unit result for $mode', patch => {
    const model = result(patch), html = ui.renderResult(model), main = card(html), shown = model.presentation;
    expect(main.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(main).toContain('data-clcr-series="K_mmol_d"');
    expect(attribute(main, 'data-clcr-value')).toBe('150');
    expect(attribute(main, 'data-clcr-display-value')).toBe(shown.valueText);
    expect(attribute(main, 'data-clcr-display-unit')).toBe('mmol/24 h');
    expect(main).toMatch(/Norma dla wieku <span[^>]*>· Labcorp<\/span>/);
    expect(plain(main)).toContain('20–116');
    expect(main).toContain('class="potassium-dzm-reference-unit">mmol/24 h</span>');
    expect(plain(main)).toContain('Orientacyjny zakres źródła');
    expect(main).not.toMatch(/<select|output-picker/);
    expect(plain(main)).not.toMatch(/mg\/|m²|kg/);
    expect(html).not.toContain('<details open');
    expect(JSON.parse(attribute(html, 'data-clcr-potassium-dzm-snapshot'))).toEqual(model);
  });

  it('labels both ends of the source range and the patient marker', () => {
    const main = card(ui.renderResult(result({ concentration: '40' })));
    expect(main).toContain('potassium-dzm-norm-boundary--low');
    expect(main).toContain('potassium-dzm-norm-boundary--high');
    expect(main).toContain('potassium-dzm-norm-point');
    expect(main).not.toContain('norm-label--zero');
    expect(main).not.toMatch(/\sstyle=/);
    expect(main).toContain('<svg class="potassium-dzm-norm-graphic" width="100%" height="76"');
    expect(main).not.toContain('viewBox=');
    const coordinates = [...main.matchAll(/\s(?:x|width|x1|x2|cx)="(\d+(?:\.\d+)?)%"/g)];
    expect(coordinates.length).toBeGreaterThanOrEqual(10);
    for (const [, value] of coordinates) {
      expect(Number(value)).toBeGreaterThanOrEqual(0);
      expect(Number(value)).toBeLessThanOrEqual(100);
    }
    expect(plain(main)).toContain('Znacznik pokazuje wynik pacjenta.');
  });

  it.each(['19.999999999999999999', '116.000000000000000001'])('keeps %s outside the inclusive bounds despite compact rounding', reportedValue => {
    const model = result({ mode: 'reported', reportedValue }), html = ui.renderResult(model), main = card(html);
    expect(main).toContain('data-clcr-tone="warning"');
    expect(main).toContain('data-clcr-assessment="outside"');
    expect(main).toContain('potassium-dzm-rounding-note');
    expect(html).toContain('Wynik przed zaokrągleniem');
    expect(plain(html)).toContain(model.presentation.fullValueText);
  });

  it.each(['20', '116'])('uses the approved laboratory wording at the inclusive bound %s', reportedValue => {
    const main = card(ui.renderResult(result({ mode: 'reported', reportedValue })));
    expect(main).toContain('W zakresie laboratoryjnym');
    expect(main).toContain('data-clcr-tone="normal"');
    expect(main).toContain('data-clcr-assessment="within"');
  });

  it('keeps exact zero neutral while showing the nominal source range', () => {
    const main = card(ui.renderResult(result({ mode: 'reported', reportedValue: '0' })));
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('data-clcr-assessment="unassessed"');
    expect(main).toContain('data-clcr-reference-comparison="false"');
    expect(plain(main)).toContain('20–116');
    expect(plain(main)).toContain('granicy oznaczalności');
    expect(plain(main)).not.toContain('W zakresie laboratoryjnym');
  });

  it.each(['0.00000000000000001', '1e-300'])('preserves positive %s in visible and collectible values', reportedValue => {
    const model = result({ mode: 'reported', reportedValue }), html = ui.renderResult(model);
    expect(Number(attribute(html, 'data-clcr-value'))).toBeGreaterThan(0);
    expect(attribute(html, 'data-clcr-display-value')).not.toBe('0');
    expect(JSON.parse(attribute(html, 'data-clcr-potassium-dzm-snapshot')).exactMain.numerator).not.toBe('0');
  });

  it.each([{ ageYears: null }, { ageYears: 5 }, { sex: '' }, { hours: '12' }])('shows a number without an invented norm for %j', patch => {
    const model = result(patch), main = card(ui.renderResult(model));
    expect(model.valid).toBe(true);
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('data-clcr-assessment="unassessed"');
    expect(main).toContain('Brak normy do porównania');
    expect(main).not.toContain('potassium-dzm-norm-axis');
  });

  it('shows the complete source table and highlights only the selected age and sex cell', () => {
    for (const profile of [{ ageYears: 10, sex: 'F' }, { ageYears: 40, sex: 'M' }, { ageYears: 81, sex: 'F' }, { ageYears: 5, sex: 'M' }]) {
      const model = result(profile), html = ui.renderResult(model), table = html.match(/<table[^>]*>[\s\S]*?<\/table>/)?.[0] || '';
      expect((table.match(/potassium-dzm-current-cell/g) || [])).toHaveLength(profile.ageYears < 6 ? 0 : 1);
      expect(table.match(/<tr>/g)).toHaveLength(model.referenceTable.length + 1);
      for (const row of model.referenceTable) {
        expect(plain(table)).toContain(row.label);
        expect(plain(table)).toContain(row.male.text);
        expect(plain(table)).toContain(row.female.text);
      }
      expect(html).toContain('Labcorp');
      expect(plain(html)).toContain('mEq/24 h i mmol/24 h są liczbowo równe');
    }
  });

  it.each([{ hours: '0' }, { knownFacts: { Cl24CollectionProblem: true } }, { mode: 'reported', reportedValue: '150', knownFacts: { collectionNoMissedVoids: false } }])('cannot collect a rejected result for %j', patch => {
    const html = ui.renderResult(result(patch));
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-potassium-dzm-snapshot=');
  });

  it('renders a saved snapshot without consulting current engine or document fields', () => {
    const model = JSON.parse(JSON.stringify(result({ ageYears: 81, sex: 'F' }))), old = browser.VildaClcrPotassiumDzm;
    browser.VildaClcrPotassiumDzm = new Proxy({}, { get() { throw new Error('frozen render must not call engine'); } });
    try {
      const html = ui.renderResult(model);
      expect(plain(card(html))).toContain('6–67');
      expect(JSON.parse(attribute(html, 'data-clcr-potassium-dzm-snapshot'))).toEqual(model);
    } finally { browser.VildaClcrPotassiumDzm = old; }
  });

  it('shows the exact fraction in Details when a decimal expansion cannot terminate', () => {
    const model = result({ concentration: '1', volume: '1', volumeUnit: 'L', hours: '7' });
    const html = ui.renderResult(model);
    expect(model.presentation.fullValueComplete).toBe(false);
    expect(plain(html)).toContain('Dokładny ułamek: 24/7 mmol/24 h');
    expect(plain(card(html))).not.toContain('Dokładny ułamek');
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

describe('Potassium DZM — minimal controls and reversible mounting', () => {
  it('creates eleven idempotent controls with fixed mmol units and actual editable 24 h', () => {
    const { doc } = documentFixture();
    expect(ui.ensureControls(doc)).toHaveLength(11);
    expect(doc.getElementById('K_inputMode').value).toBe('concentration');
    expect(doc.getElementById('K_collectionHours').value).toBe('24');
    expect(doc.getElementById('K_collectionSource').value).toBe('assumed-24h');
    expect(doc.getElementById('K_reportedUnit').type).toBe('hidden');
    expect(doc.getElementById('K_reportedUnit').value).toBe('mmol/24h');
    expect(doc.getElementById('K_outputUnit').type).toBe('hidden');
    doc.getElementById('K_concentration').value = '100'; ui.ensureControls(doc);
    expect(doc.body.querySelectorAll('#K_concentration')).toHaveLength(1);
    expect(doc.getElementById('K_concentration').value).toBe('100');
    for (const id of ['K_concentrationUnit', 'K_serum', 'weight', 'height', 'age', 'sex']) expect(doc.getElementById(id)).toBeNull();
    ui.sync(doc, { active: true });
    const input = doc.getElementById('potassiumDzmInputCard');
    expect(input.textContent).toContain('1 mmol/L = 1 mEq/L');
    expect(input.querySelectorAll('select')).toHaveLength(1);
  });

  it('preserves values through mode switches and restores field position and ARIA attributes', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    const field = doc.getElementById('K_concentration');
    field.value = '100'; field.setAttribute('aria-describedby', 'original-help');
    doc.getElementById('K_reportedValue').value = '150';
    const origin = field.closest('label').parentNode;
    ui.sync(doc, { active: true });
    expect(field.getAttribute('aria-describedby')).toContain('potassiumDzmInputError');
    doc.body.querySelector('[data-potassium-dzm-mode="reported"]').click();
    expect(doc.getElementById('K_inputMode').value).toBe('reported');
    expect(field.value).toBe('100');
    doc.body.querySelector('[data-potassium-dzm-mode="concentration"]').click();
    expect(doc.getElementById('K_reportedValue').value).toBe('150');
    ui.restore(doc);
    expect(field.closest('label').parentNode).toBe(origin);
    expect(field.getAttribute('aria-describedby')).toBe('original-help');
    expect(field.getAttribute('aria-invalid')).toBeNull();
    expect(doc.documentElement.hasAttribute('data-clcr-potassium-dzm-active')).toBe(false);
    expect(doc.getElementById('potassiumDzmInputCard')).toBeNull();
  });

  it.each(['12', '0', '-1', 'wrong'])('keeps known %s-hour context visible and correctable in reported mode', hours => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    doc.getElementById('K_inputMode').value = 'reported'; doc.getElementById('K_reportedValue').value = '150'; doc.getElementById('K_collectionHours').value = hours;
    ui.sync(doc, { active: true });
    expect(doc.getElementById('potassiumDzmInputCard').querySelector('.potassium-dzm-context-row').hidden).toBe(false);
    if (hours !== '12') expect(doc.getElementById('potassiumDzmDurationEditor').hidden).toBe(false);
    ui.restore(doc);
    expect(doc.getElementById('K_collectionHours').value).toBe(hours);
  });

  it.each(['200', '199.999999999999999999', '1160.000000000000000001', '1e-300'])('preserves the exact quantity for volume %s through mL/L changes', volume => {
    const { doc, form } = documentFixture(); ui.ensureControls(doc);
    for (const [id, text] of Object.entries({ age: '40', sex: 'M' })) { const input = doc.createElement('input'); input.id = id; input.value = text; form.append(input); }
    doc.getElementById('K_concentration').value = '100'; doc.getElementById('K_volume').value = volume;
    const current = () => engine.evaluate(engine.readInputFromDocument(doc), browser.ClcrPotassiumDzmReferenceData.DEFAULT_POLICY);
    const before = current();
    for (const unit of ['L', 'mL']) {
      nativeChange(doc.getElementById('K_volumeUnit'), unit);
      const after = current();
      expect(after.valid).toBe(true);
      expect(after.exactMain).toEqual(before.exactMain);
      expect(after.outOfRange).toBe(before.outOfRange);
    }
    expect(doc.getElementById('K_volume').value).toBe(volume);
  });

  it.each([false, true])('preserves a long exact volume when a decimal comma is normalized (input event: %s)', dispatchInput => {
    const { doc, form } = documentFixture(); ui.ensureControls(doc);
    for (const [id, text] of Object.entries({ age: '40', sex: 'M' })) { const input = doc.createElement('input'); input.id = id; input.value = text; form.append(input); }
    const original = '199.' + '9'.repeat(68);
    doc.getElementById('K_concentration').value = '100'; doc.getElementById('K_volume').value = original;
    const current = () => engine.evaluate(engine.readInputFromDocument(doc), browser.ClcrPotassiumDzmReferenceData.DEFAULT_POLICY);
    const before = current();
    expect(before.status).toBe('low');
    nativeChange(doc.getElementById('K_volumeUnit'), 'L');
    expect(doc.getElementById('K_volume').value).toBe('0,2');
    // The application can normalize the editable decimal separator. This
    // does not change the converted quantity or its captured original source.
    const field = doc.getElementById('K_volume'); field.value = '0.2';
    if (dispatchInput) doc.dispatchEvent({ type: 'input', target: field, isTrusted: true });
    expect(current().exactMain).toEqual(before.exactMain);
    nativeChange(doc.getElementById('K_volumeUnit'), 'mL');
    expect(current().exactMain).toEqual(before.exactMain);
    expect(current().status).toBe('low');
    expect(field.value).toBe(original);
  });

  it('discards converted provenance for a real decimal edit even when its binary Number is unchanged', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    doc.getElementById('K_concentration').value = '100'; doc.getElementById('K_volume').value = '199.' + '9'.repeat(68);
    const current = () => engine.evaluate(engine.readInputFromDocument(doc), browser.ClcrPotassiumDzmReferenceData.DEFAULT_POLICY);
    const before = current(); nativeChange(doc.getElementById('K_volumeUnit'), 'L');
    const field = doc.getElementById('K_volume'); field.value = '0.20000000000000000001';
    expect(engine.parseValue(field.value).value).toBe(engine.parseValue('0,2').value);
    doc.dispatchEvent({ type: 'input', target: field, isTrusted: true });
    expect(doc.getElementById('K_unitConversions').value).toBe('');
    expect(current().exactMain).not.toEqual(before.exactMain);
    const edited = current().exactMain;
    nativeChange(doc.getElementById('K_volumeUnit'), 'mL');
    expect(current().exactMain).toEqual(edited);
  });

  it('updates and explicitly clears the existing version vault with conversion metadata', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    const vault = doc.defaultView.__vildaClcrVersionValueVault = { unrelatedValue: 'retain' };
    doc.getElementById('K_volume').value = '200';
    nativeChange(doc.getElementById('K_volumeUnit'), 'L');
    expect(vault.K_unitConversions).toBe(doc.getElementById('K_unitConversions').value);
    expect(JSON.parse(vault.K_unitConversions).volume.originalValue).toBe('200');
    nativeChange(doc.getElementById('K_volumeUnit'), 'mL');
    expect(doc.getElementById('K_unitConversions').value).toBe('');
    expect(vault.K_unitConversions).toBe('');
    expect(vault.unrelatedValue).toBe('retain');
  });
});
