import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_clinical_safety.js', 'clcr_ca_cit_reference_data.js', 'clcr_ca_cit.js', 'clcr_ca_cit_ui.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrCaCitUi, engine = browser.VildaClcrCaCit;
const policy = browser.ClcrCaCitReferenceData.getProfile(browser.ClcrCaCitReferenceData.DEFAULT_PROFILE_ID);
const base = { mode: 'concentration', calciumValue: '2', calciumUnit: 'mmol/L', citrateValue: '40', citrateUnit: 'mg/dL', ageYears: 10, sex: 'F' };
const evaluate = patch => engine.evaluate({ ...base, ...patch }, policy);
const decode = value => value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const attribute = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const mainCard = html => html.split('<details')[0].replace(/data-clcr-ca-cit-snapshot="[^"]*"/g, '');

describe('Ca/Cit — integrated result and frozen source table', () => {
  it('renders the real 0.20039 mass result once with the matching neutral reference', () => {
    const model = evaluate(), html = ui.renderResult(model), main = mainCard(html);
    expect(model.rawValue).toBe(0.20039);
    expect(main.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(attribute(html, 'data-clcr-display-value')).toBe('0,20039');
    expect(attribute(html, 'data-clcr-value')).toBe('0.20039');
    expect(main).toContain('data-clcr-series="Ca_Cit"');
    expect(main).toContain('Norma dla wieku');
    expect(main).toContain('≤0,47');
    expect(main).toContain('class="ca-cit-result-unit">mg/mg</span>');
    expect(main).toContain('class="ca-cit-reference-unit">mg/mg</span>');
    expect(main).not.toContain('ca-cit-reference-unit" data-clcr-tone');
    expect(JSON.parse(attribute(html, 'data-clcr-ca-cit-snapshot'))).toEqual(model.snapshot);
    expect(html).toContain('<summary>Szczegóły i źródła</summary>');
    expect(html).not.toContain('<details open');
  });

  it.each([
    { mode: 'reported', reportedValue: '0.47', reportedUnit: 'mg/mg', category: 'within' },
    { mode: 'reported', reportedValue: '0.47000000000000001', reportedUnit: 'mg/mg', category: 'above' },
    { calciumValue: '5', citrateValue: '30', category: 'above' },
  ])('retains the exact source-boundary assessment %j', ({ category, ...patch }) => {
    const model = evaluate(patch), main = mainCard(ui.renderResult(model));
    expect(model.category).toBe(category);
    expect(main).toContain(`data-clcr-tone="${category === 'above' ? 'warning' : 'normal'}"`);
    expect(main).toContain(`data-clcr-assessment="${category === 'above' ? 'outside' : 'within'}"`);
    expect(main).not.toContain('data-clcr-tone="danger"');
    expect(attribute(main, 'data-clcr-display-value')).toContain(model.display.value.replace('.', ','));
  });

  it.each([
    { ageYears: null }, { ageYears: 0.5 }, { ageYears: 40 }, { sex: '' },
    { citrateValue: '1', citrateUnit: 'mmol/L' },
    { collectionHours: '12' }, { collectionProblem: true },
  ])('keeps a neutral numeric result with one specific reason: %j', patch => {
    const model = evaluate(patch), main = decode(mainCard(ui.renderResult(model))).replace(/<[^>]*>/g, '');
    expect(model.valid).toBe(true);
    expect(mainCard(ui.renderResult(model))).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('Brak normy do porównania');
    expect(main.split(model.comment)).toHaveLength(2);
    expect(mainCard(ui.renderResult(model))).not.toContain('<svg');
  });

  it('keeps molar ratios in a distinct series and does not invent a mass reference', () => {
    const model = evaluate({ citrateValue: '1000', citrateUnit: 'µmol/L' });
    const html = ui.renderResult(model), main = mainCard(html);
    expect(main).toContain('data-clcr-series="Ca_Cit_mol"');
    expect(main).toContain('data-clcr-display-unit="mmol/mmol"');
    expect(main).toContain('Brak normy do porównania');
    expect(html).not.toContain('class="ca-cit-current-reference"');
  });

  it.each(['0.0000001', '1e-20'])('never displays positive calcium %s as zero', calciumValue => {
    const model = evaluate({ calciumValue }), html = ui.renderResult(model);
    expect(model.rawValue).toBeGreaterThan(0);
    expect(attribute(html, 'data-clcr-display-value')).not.toBe('0');
    expect(JSON.parse(attribute(html, 'data-clcr-ca-cit-snapshot')).exactValue).toEqual(model.exactValue);
  });

  it('shows literal zero as neutral and retains an available reference without a verdict', () => {
    const model = evaluate({ calciumValue: '0' }), main = mainCard(ui.renderResult(model));
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('data-clcr-reference-comparison="false"');
    expect(main).toContain('≤0,47');
    expect(main).toContain('oznaczalności');
  });

  it.each([{ calciumValue: '-1' }, { citrateValue: '-1' }, { citrateValue: '0' }])('blocks invalid input without a collectible result: %j', patch => {
    const html = ui.renderResult(evaluate(patch));
    expect(html).toContain('Sprawdź wpisane dane');
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-ca-cit-snapshot=');
  });

  it('shows the full source table and highlights only the matched sex and age cell', () => {
    const html = ui.renderResult(evaluate());
    expect(html).toContain('Ca/Cit (mg/mg) · zakres P5–P95');
    for (const range of ['0,05–0,48', '0,03–0,42', '0,05–0,6', '0,04–0,47', '0,06–0,8']) expect(html).toContain(range);
    expect(html.match(/class="ca-cit-current-reference"/g)).toHaveLength(1);
    expect(html).toContain('<td class="ca-cit-current-reference" aria-current="true">0,04–0,47</td>');
    expect(html).toContain('https://pmc.ncbi.nlm.nih.gov/articles/PMC4147207/');
    expect(decode(html)).toContain(policy.notes.adultEvidence);
  });

  it('shows engine-supplied canonical concentrations in the calculation details', () => {
    const html = ui.renderResult(evaluate());
    expect(html).toContain('<th scope="row">Wapń po sprowadzeniu jednostek</th><td>80,156 mg/L</td>');
    expect(html).toContain('<th scope="row">Cytryniany po sprowadzeniu jednostek</th><td>400 mg/L</td>');
  });

  it('retains the exact fraction behind an abbreviated repeating result', () => {
    const model = evaluate({ calciumValue: '1', citrateValue: '3' });
    expect(model.display.fullValueComplete).toBe(false);
    expect(ui.renderDetails(model)).toContain(`${model.exactValue.numerator}/${model.exactValue.denominator} mg/mg`);
  });

  it('keeps source details available before input without highlighting a reference cell', () => {
    const model = evaluate({ calciumValue: '', citrateValue: '' }), html = ui.renderResult(model);
    expect(html).toContain('Tutaj pojawi się wynik');
    expect(html).toContain('Ca/Cit (mg/mg) · zakres P5–P95');
    expect(html).toContain('https://pmc.ncbi.nlm.nih.gov/articles/PMC4147207/');
    expect(html).not.toContain('class="ca-cit-current-reference"');
    expect(html).not.toContain('data-clcr-series=');
  });

  it('renders an already frozen snapshot without evaluating current patient or policy', () => {
    const model = evaluate(), expected = ui.renderResult(model.snapshot), previous = browser.VildaClcrCaCit;
    browser.VildaClcrCaCit = { evaluate() { throw new Error('Frozen result must not recalculate'); } };
    try { expect(ui.renderResult(model.snapshot)).toBe(expected); }
    finally { browser.VildaClcrCaCit = previous; }
  });

  it('keeps the approximation sign adjacent to the ordinary numeric text', () => {
    const html = ui.renderResult(evaluate({ calciumValue: '1', citrateValue: '3' }));
    expect(html).toContain('<span class="ca-cit-approx-prefix">≈ </span><span class="ca-cit-number-text">');
    expect(html).not.toContain('≈<br');
  });

  it('preserves the laboratory inequality in the visible result and frozen snapshot', () => {
    const model = evaluate({ mode: 'reported', reportedValue: '<0.2', reportedUnit: 'mg/mg' });
    const html = ui.renderResult(model);
    expect(attribute(html, 'data-clcr-display-value')).toBe('<0,2');
    expect(html).toContain('<span class="ca-cit-comparator">&lt;</span>');
    expect(JSON.parse(attribute(html, 'data-clcr-ca-cit-snapshot')).comparator).toBe('<');
  });
});

function documentFixture() {
  const doc = atrapaDokumentu(), create = doc.createElement;
  const enhance = node => {
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
  for (const [id, value] of Object.entries({ age: '10', ageUnit: 'years', sex: 'F', weight: '30', height: '140' })) {
    const control = doc.createElement('input'); control.id = id; control.value = value; form.append(control);
  }
  ui.ensureControls(doc);
  return { doc, form };
}
function edit(doc, id, value, type = 'input') {
  const control = doc.getElementById(id); control.value = value;
  control.dispatchEvent({ type, target: control, isTrusted: true, bubbles: true });
}

describe('Ca/Cit — actual minimal controls', () => {
  it('registers engine defaults once and asks no additional patient or collection questions', () => {
    const { doc } = documentFixture(), controls = ui.ensureControls(doc);
    expect(controls.map(control => control.id).sort()).toEqual([...Object.keys(engine.DEFAULTS), "CACIT_sourceContext"].sort());
    for (const [id, value] of Object.entries(engine.DEFAULTS)) expect(doc.getElementById(id).value).toBe(value);
    expect(doc.getElementById('CACIT_citrateUnit').children.map(option => option.textContent)).toEqual(['µmol/L', 'mmol/L', 'mg/L', 'mg/dL']);
    expect(doc.getElementById('CACIT_calciumUnit').children.map(option => option.textContent)).toEqual(['mmol/L', 'mg/dL', 'mg/L']);
    doc.getElementById('CACIT_calcium').value = '2'; ui.ensureControls(doc);
    expect(doc.body.querySelectorAll('#CACIT_calcium')).toHaveLength(1);
    expect(doc.getElementById('CACIT_calcium').value).toBe('2');
    expect(controls.filter(control => control.type === 'checkbox')).toHaveLength(0);
  });

  it('moves fields reversibly, keeps data, and provides equal mode actions', () => {
    const { doc } = documentFixture();
    ui.sync(doc, { active: true });
    const card = doc.getElementById('caCitInputCard');
    expect(card).not.toBeNull();
    expect(card.querySelectorAll('button').map(button => button.textContent)).toEqual(['Oblicz ze stężeń', 'Gotowy wynik']);
    edit(doc, 'CACIT_calcium', '2');
    card.querySelector('[data-ca-cit-mode="reported"]').click();
    expect(doc.getElementById('CACIT_inputMode').value).toBe('reported');
    expect(card.querySelectorAll('.ca-cit-mode-fields').map(node => node.hidden)).toEqual([true, false]);
    expect(card.querySelector('[data-ca-cit-mode="reported"]').getAttribute('aria-pressed')).toBe('true');
    ui.restore(doc);
    expect(doc.getElementById('caCitInputCard')).toBeNull();
    expect(doc.documentElement.hasAttribute('data-clcr-ca-cit-active')).toBe(false);
    expect(doc.getElementById('CACIT_calcium').value).toBe('2');
    expect(doc.getElementById('CACIT_calcium').getAttribute('aria-describedby')).toBeNull();
  });

  it('interprets report units without rescaling the entered values or asking chemical-basis questions', () => {
    const { doc } = documentFixture(); ui.mount(doc);
    edit(doc, 'CACIT_calcium', '2'); edit(doc, 'CACIT_citrate', '40');
    const before = ui.evaluate(doc);
    expect(before.rawValue).toBe(0.20039);
    edit(doc, 'CACIT_citrateUnit', 'mmol/L', 'change');
    expect(doc.getElementById('CACIT_citrate').value).toBe('40');
    expect(ui.evaluate(doc).rawValue).toBe(0.05);
    expect(ui.evaluate(doc).unit).toBe('mmol/mmol');
    expect(doc.getElementById('CACIT_reportingEntity')).toBeNull();
    edit(doc, 'CACIT_calciumUnit', 'mg/L', 'change');
    expect(doc.getElementById('CACIT_calcium').value).toBe('2');
  });

  it('marks the actual invalid field and accepts zero calcium as complete input', () => {
    const { doc } = documentFixture(); ui.mount(doc);
    edit(doc, 'CACIT_calcium', '0'); edit(doc, 'CACIT_citrate', '40');
    expect(doc.getElementById('caCitInputError').hidden).toBe(true);
    expect(doc.getElementById('caCitInputCard').querySelector('.ca-cit-readiness').textContent).toBe('Wymagane dane 2/2');
    edit(doc, 'CACIT_citrate', '0');
    expect(doc.getElementById('caCitInputError').hidden).toBe(false);
    expect(doc.getElementById('CACIT_citrate').getAttribute('aria-invalid')).toBe('true');
    expect(doc.getElementById('CACIT_calcium').getAttribute('aria-invalid')).toBe('false');
    expect(doc.getElementById('caCitInputError').textContent).toContain('większą od zera');
  });

  it('uses imported source context for the same UI evaluation as the primary engine path', () => {
    const { doc } = documentFixture(); ui.mount(doc);
    edit(doc, 'CACIT_calcium', '2'); edit(doc, 'CACIT_citrate', '40');
    const imported = { knownFacts: { collectionNoMissedVoids: false }, sex: 'M' };
    doc.getElementById('CACIT_sourceContext').value = JSON.stringify(imported);
    let readDocument;
    doc.defaultView.ClcrCaCitSession = { readContext(documentRef) { readDocument = documentRef; return JSON.parse(documentRef.getElementById('CACIT_sourceContext').value); } };
    const expected = engine.evaluate(engine.readInputFromDocument(doc, imported), policy);
    expect(ui.readInput(doc)).toEqual(engine.readInputFromDocument(doc, imported));
    expect(readDocument).toBe(doc);
    const result = ui.evaluate(doc);
    expect(result).toEqual(expected);
    expect(result.valid).toBe(true);
    expect(result.referenceAvailable).toBe(false);
    expect(result.reasonCode).toBe('collection-problem');
    ui.refresh(doc);
    expect(doc.getElementById('caCitInputCard').querySelector('.ca-cit-readiness').textContent).toBe('Wymagane dane 2/2');
  });

  it('lets explicit caller context override the imported source context', () => {
    const { doc } = documentFixture();
    edit(doc, 'CACIT_calcium', '2'); edit(doc, 'CACIT_citrate', '40');
    doc.defaultView.ClcrCaCitSession = { readContext() { throw new Error('Explicit context must override session context'); } };
    const explicit = { ageYears: 6, sex: 'M', knownFacts: { collectionNoMissedVoids: true } };
    const input = ui.readInput(doc, explicit);
    expect(input).toEqual(engine.readInputFromDocument(doc, explicit));
    expect(engine.evaluate(input, policy).reference.upper).toBe(0.48);
  });

  it('resets sample-specific values and hidden provenance, preserving existing patient data', () => {
    const { doc } = documentFixture(); ui.mount(doc);
    edit(doc, 'CACIT_calcium', '2'); edit(doc, 'CACIT_citrate', '40');
    edit(doc, 'CACIT_sameSpecimen', 'different', 'change');
    edit(doc, 'CACIT_durationSource', 'historical-missing', 'change');
    edit(doc, 'CACIT_sourceContext', JSON.stringify({ knownFacts: { collectionNoMissedVoids: false } }), 'change');
    ui.reset(doc);
    expect(doc.getElementById('CACIT_sourceContext').value).toBe('');
    for (const [id, value] of Object.entries(engine.DEFAULTS)) expect(doc.getElementById(id).value).toBe(value);
    expect(doc.getElementById('age').value).toBe('10');
    expect(doc.getElementById('sex').value).toBe('F');
    expect(doc.getElementById('weight').value).toBe('30');
    expect(doc.getElementById('height').value).toBe('140');
  });
});
