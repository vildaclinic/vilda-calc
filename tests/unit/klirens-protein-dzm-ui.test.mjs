import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_collection_duration.js', 'clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_protein_dzm_data.js', 'clcr_protein_dzm.js', 'clcr_protein_dzm_ui.js', 'clcr_protein_dzm_persistence.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrProteinDzmUi, engine = browser.VildaClcrProteinDzm, persistence = browser.ClcrProteinDzmPersistence;
const base = { mode: 'concentration', concentration: '200', concentrationUnit: 'mg/L', volume: '1500', volumeUnit: 'mL', hours: '24', ageYears: 10, weightKg: '30', heightCm: '140' };
const result = patch => engine.evaluate({ ...base, ...patch }, browser.ClcrProteinDzmReferenceData.DEFAULT_POLICY);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
function attribute(html, name) { return decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || ''); }
function card(html) { return html.split('<details')[0].replace(/data-clcr-protein-dzm-snapshot="[^"]*"/g, ''); }

// Render the real calculation and round-trip its actual saved snapshot.
describe('Protein DZM — one primary result with its patient reference', () => {
  it.each(['mg/24h', 'g/24h'])('renders selected %s without creating derived measurements', outputUnit => {
    const model = result({ outputUnit }), html = ui.renderResult(model), main = card(html), shown = model.presentation;
    expect(model.valid).toBe(true);
    expect(main).toContain('data-clcr-series="Prot_mg24"');
    expect(main.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(main).toContain(`data-clcr-value="${shown.rawValue}"`);
    expect(main).toContain(`data-clcr-display-value="${shown.valueText}"`);
    expect(main).toContain(`data-clcr-display-unit="${shown.unitText}"`);
    expect(main).toContain('Norma dla pacjenta');
    expect(decode(main.replace(/<[^>]*>/g, ''))).toContain(shown.referenceValue);
    expect(main).toContain(`class="protein-dzm-reference-unit">${shown.unitText}</span>`);
    expect(main).not.toMatch(/mg\/m²|m²\/|<svg/);
    expect(html).toContain('mg/m²/24 h');
    expect(html).not.toContain('<details open');
    const snapshot = persistence.readSnapshot(attribute(html, 'data-clcr-protein-dzm-snapshot'));
    expect(snapshot).not.toBeNull();
    expect(snapshot).toEqual(model);
  });

  it('shows the actual source-table units once per reference row', () => {
    const model = result(), html = ui.renderResult(model);
    const table = html.match(/<table[^>]*>[\s\S]*?<\/table>/)?.[0] || '';
    expect(html).toContain('Przyjęte normy');
    const text = decode(table.replace(/<[^>]*>/g, ''));
    expect(text).not.toMatch(/mg\/24 h\s*mg\/24 h/);
    const normCells = Array.from(table.matchAll(/<td>([\s\S]*?)<\/td>/g)).filter((_, index) => index % 2 === 1);
    expect(normCells).toHaveLength(model.referenceRows.length);
    for (const [, cell] of normCells) expect(decode(cell).match(/mg\/24 h/g)).toHaveLength(1);
  });

  it('preserves the red nephrotic assessment instead of downgrading it to neutral', () => {
    const model = result({ mode: 'reported', reportedValue: '1200', reportedUnit: 'mg/24h' });
    expect(model.tone).toBe('danger');
    expect(card(ui.renderResult(model))).toContain('data-clcr-tone="danger"');
  });

  it.each(['0.015', '1e-20', '0'])('renders the actual %s value without replacing it with a rounded saved zero', reportedValue => {
    const model = result({ mode: 'reported', reportedValue, reportedUnit: 'mg/24h' }), html = ui.renderResult(model), main = card(html);
    expect(main).toContain(`>${model.presentation.valueText}</strong>`);
    expect(attribute(html, 'data-clcr-value')).toBe(String(model.presentation.rawValue));
    expect(persistence.readSnapshot(attribute(html, 'data-clcr-protein-dzm-snapshot'))).not.toBeNull();
    if (reportedValue !== '0') expect(model.presentation.valueText).not.toBe('0');
    else {
      expect(main).toContain('data-clcr-tone="neutral"');
      expect(main).toContain('data-clcr-assessment="unassessed"');
      expect(main).toContain('granicy oznaczalności');
    }
  });

  it.each([{ ageYears: null }, { ageYears: 0.25 }, { weightKg: '' }, { heightCm: '' }, { hours: '12' }])('leaves an available number neutral without inventing a patient reference: %j', patch => {
    const model = result(patch), main = card(ui.renderResult(model));
    expect(model.valid).toBe(true);
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('data-clcr-assessment="unassessed"');
    expect(main).toContain('Brak normy do porównania');
  });

  it.each([{ hours: '0' }, { knownFacts: { Cl24CollectionProblem: true } }, { mode: 'reported', reportedValue: '300', knownFacts: { collectionNoMissedVoids: false } }])('does not create a collectible result for a rejected collection: %j', patch => {
    const html = ui.renderResult(result(patch));
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-protein-dzm-snapshot=');
  });

  it('uses the frozen presentation without consulting current patient data or recalculating it', () => {
    const model = result({ outputUnit: 'g/24h' }), old = browser.VildaClcrProteinDzm;
    browser.VildaClcrProteinDzm = { presentation() { throw new Error('must use frozen presentation'); } };
    try { expect(card(ui.renderResult(model))).toContain(`>${model.presentation.valueText}</strong>`); }
    finally { browser.VildaClcrProteinDzm = old; }
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

describe('Protein DZM — minimal stable controls and exact unit changes', () => {
  it('registers the standalone control defaults without creating patient questions or duplicates', () => {
    const { doc } = documentFixture();
    expect(ui.ensureControls(doc)).toHaveLength(12);
    expect(doc.getElementById('Prot_inputMode').value).toBe('concentration');
    expect(doc.getElementById('Prot_collectionHours').value).toBe('24');
    expect(doc.getElementById('Prot_collectionSource').value).toBe('assumed-24h');
    expect(doc.getElementById('Prot_durationNeedsConfirmation').value).toBe('false');
    expect(doc.getElementById('Prot_concentrationUnit').children.map(option => option.textContent)).toEqual(['mg/L', 'mg/dL', 'g/L']);
    expect(doc.getElementById('Prot_reportedUnit').children.map(option => option.textContent)).toEqual(['mg/24 h', 'g/24 h']);
    doc.getElementById('Prot_concentration').value = '200'; ui.ensureControls(doc);
    expect(doc.body.querySelectorAll('#Prot_concentration')).toHaveLength(1);
    expect(doc.getElementById('Prot_concentration').value).toBe('200');
    for (const id of ['weight', 'height', 'age', 'sex']) expect(doc.getElementById(id)).toBeNull();
  });

  it.each(['12', '0', '-1', 'wrong'])('keeps known %s-hour context visible and correctable in reported mode', hours => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    doc.getElementById('Prot_inputMode').value = 'reported';
    doc.getElementById('Prot_reportedValue').value = '300';
    doc.getElementById('Prot_collectionHours').value = hours;
    ui.sync(doc, { active: true });
    expect(doc.getElementById('proteinDzmInputCard').querySelector('.protein-dzm-context-row').hidden).toBe(false);
    if (hours !== '12') expect(doc.getElementById('proteinDzmDurationEditor').hidden).toBe(false);
    ui.restore(doc);
    expect(doc.documentElement.hasAttribute('data-clcr-protein-dzm-active')).toBe(false);
    expect(doc.getElementById('Prot_collectionHours').value).toBe(hours);
  });

  it.each(['149.99999999999997', '150', '0.015', '1e-20', '0'])('preserves reported quantity %s and its assessment through actual unit selectors', value => {
    const { doc, form } = documentFixture(); ui.ensureControls(doc);
    for (const [id, text] of Object.entries({ age: '10', weight: '30', height: '140' })) { const input = doc.createElement('input'); input.id = id; input.value = text; form.append(input); }
    doc.getElementById('Prot_inputMode').value = 'reported'; doc.getElementById('Prot_reportedValue').value = value;
    const current = () => engine.evaluate(engine.readInputFromDocument(doc), browser.ClcrProteinDzmReferenceData.DEFAULT_POLICY);
    const before = current();
    for (const unit of ['g/24h', 'mg/24h']) {
      const field = doc.getElementById('Prot_reportedUnit'); field.value = unit;
      for (const listener of field.sluchacze.get('input') || []) listener({ type: 'input', target: field, isTrusted: true });
      for (const listener of field.sluchacze.get('change') || []) listener({ type: 'change', target: field, isTrusted: true });
      const after = current();
      expect(after.valid).toBe(true);
      expect(after.rawValue).toBe(before.rawValue);
      expect(after.outOfRange).toBe(before.outOfRange);
      expect(after.exactMain).toEqual(before.exactMain);
    }
    expect(doc.getElementById('Prot_reportedValue').value).toBe(value);
  });
});
