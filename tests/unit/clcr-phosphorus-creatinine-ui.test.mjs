import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_phosphorus_creatinine_data.js', 'clcr_phosphorus_creatinine.js', 'clcr_phosphorus_creatinine_ui.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrPhosphorusCreatinineUi, engine = browser.VildaClcrPhosphorusCreatinine;
const profile = browser.VildaClcrPhosphorusCreatinineData.getProfile('PICR_DZM_2026_11');
const base = { mode: 'concentration', phosphorusValue: '15', phosphorusUnit: 'mmol/L', creatinineValue: '10', creatinineUnit: 'mmol/L', ageYears: 10, sex: 'M' };
const evaluate = patch => engine.evaluate({ ...base, ...patch }, profile);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = html => decode(html.replace(/<[^>]*>/g, ''));
const attribute = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const card = html => html.split('<details')[0].replace(/data-clcr-phosphorus-creatinine-snapshot="[^"]*"/g, '');

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

describe('Pᵢ/Cr DZM — captured B result and clinically applicable norm', () => {
  it('presents one mass ratio with the same unit and reference as the frozen snapshot', () => {
    const result = evaluate(), html = ui.renderResult(result), main = card(html);
    expect(main.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(attribute(main, 'data-clcr-series')).toBe('PO4_Cr');
    expect(attribute(main, 'data-clcr-value')).toBe(String(result.rawValue));
    expect(attribute(main, 'data-clcr-display-value')).toBe(result.display.value);
    expect(attribute(main, 'data-clcr-display-unit')).toBe('mg/mg');
    expect(plain(main)).toContain('≈0,411');
    expect(plain(main)).toContain('Norma dla wiekuARUP');
    expect(plain(main)).toContain('0,144–1,234');
    expect(main.match(/>mg\/mg</g)).toHaveLength(2);
    expect(main).toContain('data-clcr-tone="success"');
    expect(main).toContain('data-clcr-reference-comparison="true"');
    expect(main).toContain('picr-norm-point');
    expect(JSON.parse(attribute(html, 'data-clcr-phosphorus-creatinine-snapshot'))).toEqual(result.snapshot);
    expect(html).toContain('id="clcr-phosphorus-creatinine-details"');
    expect(html).not.toContain('<details open');
    expect(html).not.toContain('style=');
  });
  it.each([
    ['M', '0,144–1,234'], ['F', '0,142–1,321'],
  ])('highlights only the applicable sex cell for age 10 and sex %s', (sex, expected) => {
    const html = ui.renderResult(evaluate({ sex }));
    expect(html.match(/class="picr-reference-cell--active"/g)).toHaveLength(1);
    expect(html).toContain(`<td class="picr-reference-cell--active" aria-current="true">${expected}`);
    expect(plain(html)).toContain('Wiek w ukończonych latach · mg/mg');
  });
  it.each([
    ['0.1439999999999999999', 'low'], ['1.2340000000000000001', 'high'],
  ])('shows amber for %s using the exact pre-rounding classification', (reportedValue, status) => {
    const result = evaluate({ mode: 'direct', reportedValue, reportedUnit: 'mg/mg' });
    const main = card(ui.renderResult(result));
    expect(result.status).toBe(status);
    expect(attribute(main, 'data-clcr-tone')).toBe('warning');
    expect(attribute(main, 'data-clcr-assessment')).toBe(status);
    expect(main).toContain('picr-result-reference');
    expect(main).not.toMatch(/style=|data-clcr-tone="danger"/);
  });
  it('makes the adult male threshold strictly upper-only without fabricating a lower axis', () => {
    const main = card(ui.renderResult(evaluate({ mode: 'direct', reportedValue: '0.75', reportedUnit: 'mg/mg', ageYears: 18 })));
    expect(plain(main)).toContain('Norma dla wiekuMayo');
    expect(plain(main)).toContain('<0,75');
    expect(attribute(main, 'data-clcr-tone')).toBe('warning');
    expect(plain(main)).toContain('Norma: wynik poniżej 0,75 mg/mg.');
    expect(main).not.toContain('<svg');
  });
  it.each([{ ageYears: 6 }, { ageYears: 18, sex: 'F' }, { ageYears: null }, { sex: null }])('preserves a neutral number for unavailable patient reference %j', context => {
    const result = evaluate(context), html = ui.renderResult(result), main = card(html);
    expect(attribute(main, 'data-clcr-tone')).toBe('neutral');
    expect(attribute(main, 'data-clcr-assessment')).toBe('unassessed');
    expect(plain(main)).toContain(result.message);
    expect(plain(main)).toContain('Brak dobranej normy');
    expect(main).not.toContain('<svg');
    expect(html).not.toContain('class="picr-reference-cell--active"');
  });
  it.each(['mg/mg', 'mg/g', 'mmol/mmol'])('retains a censored %s report and converts only the displayed quantity', reportedUnit => {
    const result = evaluate({ mode: 'direct', reportedValue: '≤0.500000', reportedUnit });
    const html = ui.renderResult(result), main = card(html);
    expect(attribute(main, 'data-clcr-display-unit')).toBe('mg/mg');
    expect(attribute(main, 'data-clcr-comparator')).toBe('≤');
    expect(attribute(main, 'data-clcr-tone')).toBe('neutral');
    expect(attribute(main, 'aria-label')).toBe(result.display.text);
    expect(plain(main)).toContain(result.reference.display);
    expect(plain(html)).toContain(`≤0.500000 ${reportedUnit}`);
    expect(main).not.toContain('picr-norm-point');
    const saved = JSON.parse(attribute(html, 'data-clcr-phosphorus-creatinine-snapshot'));
    expect(saved.input.reportedValue).toBe('≤0.500000');
    expect(saved.pointValue).toBeNull();
  });
  it('keeps zero neutral while showing its available norm and laboratory caution', () => {
    const result = evaluate({ phosphorusValue: '0' }), main = card(ui.renderResult(result));
    expect(attribute(main, 'data-clcr-value')).toBe('0');
    expect(attribute(main, 'data-clcr-tone')).toBe('neutral');
    expect(plain(main)).toContain('granicy oznaczalności');
    expect(plain(main)).toContain('0,144–1,234');
    expect(main).not.toContain('picr-norm-point');
  });
  it.each(['1e-300', '5e-324', '1.7976931348623157e308'])('retains finite %s in scientific presentation and full snapshot', reportedValue => {
    const result = evaluate({ mode: 'direct', reportedValue, reportedUnit: 'mg/mg' }), html = ui.renderResult(result), main = card(html);
    expect(result.valid).toBe(true);
    expect(result.rawValue).toBeGreaterThan(0);
    expect(attribute(main, 'data-clcr-value')).toBe(String(result.rawValue));
    expect(main).toContain('data-scientific="true"');
    expect(main).toContain('× 10<sup>');
    expect(attribute(main, 'aria-label')).toBe(result.display.text);
    expect(JSON.parse(attribute(html, 'data-clcr-phosphorus-creatinine-snapshot'))).toEqual(result.snapshot);
  });
  it.each([
    { phosphorusValue: '' }, { creatinineValue: '' }, { mode: 'direct', reportedValue: '', reportedUnit: 'mg/mg' },
  ])('keeps missing input %j distinct from an invalid measurement', patch => {
    const result = evaluate(patch), html = ui.renderResult(result);
    expect(html).toContain('picr-result-empty');
    expect(plain(html)).toContain(result.message);
    expect(html).not.toMatch(/data-clcr-series=|data-clcr-value=|data-clcr-phosphorus-creatinine-snapshot=|role="alert"/);
  });
  it.each([
    { phosphorusValue: '-1' }, { creatinineValue: '0' }, { phosphorusValue: 'abc' }, { sameSpecimen: 'different' },
    { mode: 'direct', reportedValue: '<0', reportedUnit: 'mg/mg' },
  ])('makes invalid measurement %j visibly invalid and not collectable', patch => {
    const result = evaluate(patch), html = ui.renderResult(result);
    expect(html).toContain('picr-result-error');
    expect(html).toContain('role="alert"');
    expect(plain(html)).toContain(result.message);
    expect(html).not.toMatch(/data-clcr-series=|data-clcr-value=|data-clcr-phosphorus-creatinine-snapshot=/);
  });
  it('explains clinical context and paired sampling only in collapsed details', () => {
    const html = ui.renderResult(evaluate()), details = html.split('<details')[1];
    expect(plain(details)).toContain('15 mmol/L fosforu ÷ 10 mmol/L kreatyniny');
    expect(plain(details)).toContain('30,973761998');
    expect(plain(details)).toContain('113,12');
    expect(plain(details)).toContain('co 3 miesiące, lecz nie określa docelowego Pᵢ/Cr');
    expect(plain(details)).toContain('Zbiórka dobowa nie zastępuje automatycznie próbki');
    expect(details).toContain('data-clcr-picr-formula="TMP_GFR"');
    expect(details).toContain('data-clcr-picr-formula="PO4_mgkg"');
    expect(details).toContain('https://ltd.aruplab.com/Tests/Pub/0020478');
    expect(details).toContain('616180-sample.pdf');
    expect(details).toContain('crysvita-epar-product-information_pl.pdf');
    expect(card(html)).not.toContain('burosumab');
  });
  it('preserves collection limitations without changing the imported direct report', () => {
    const result = evaluate({ mode: 'direct', reportedValue: '>0.3', reportedUnit: 'mg/mg', sameSpecimen: 'different', collectionProblem: true, collectionHours: '12', durationKnown: false });
    const html = ui.renderResult(result);
    expect(attribute(card(html), 'data-clcr-comparator')).toBe('>');
    expect(plain(html)).toContain('Zachowany czas zbiórki: 12 h.');
    expect(plain(html)).toContain('Czas zbiórki oznaczono jako nieznany.');
    expect(plain(html)).toContain('problemie zbiórki');
    expect(plain(html)).toContain('różne zbiórki');
  });
  it('keeps a collection problem supplied as a known fact visible even for a censored result', () => {
    const result = evaluate({ mode: 'direct', reportedValue: '<0.3', reportedUnit: 'mg/mg', knownFacts: { collectionProblem: true } });
    const html = ui.renderResult(result);
    expect(plain(html)).toContain('Zachowano informację o problemie zbiórki.');
    expect(attribute(card(html), 'data-clcr-tone')).toBe('neutral');
  });
  it('renders frozen data without consulting the live engine or reference registry', () => {
    const captured = JSON.parse(JSON.stringify(evaluate()));
    const liveEngine = browser.VildaClcrPhosphorusCreatinine, liveData = browser.VildaClcrPhosphorusCreatinineData;
    browser.VildaClcrPhosphorusCreatinine = new Proxy({}, { get() { throw Error('No recalculation'); } });
    browser.VildaClcrPhosphorusCreatinineData = new Proxy({}, { get() { throw Error('No reference lookup'); } });
    try { expect(JSON.parse(attribute(ui.renderResult(captured), 'data-clcr-phosphorus-creatinine-snapshot'))).toEqual(captured.snapshot); }
    finally { browser.VildaClcrPhosphorusCreatinine = liveEngine; browser.VildaClcrPhosphorusCreatinineData = liveData; }
  });
  it('uses the captured Mayo policy in details and does not invent it when the profile is unavailable', () => {
    const captured = JSON.parse(JSON.stringify(evaluate({ ageYears: 18 })));
    captured.policy.bands.find(band => band.id === 'MAYO_ADULT_MALE').high = 0.72;
    const details = ui.renderResult(captured).split('<details')[1];
    expect(plain(details)).toContain('Norma: <0,72 mg/mg.');
    expect(plain(details)).not.toContain('Norma: <0,75 mg/mg.');
    const unavailable = ui.renderResult(engine.evaluate(base, null));
    expect(attribute(card(unavailable), 'data-clcr-tone')).toBe('neutral');
    expect(plain(unavailable)).not.toContain('Norma: <0,75 mg/mg.');
  });
  it('escapes captured input, clinical notes, ranges and untrusted source links', () => {
    const result = JSON.parse(JSON.stringify(evaluate()));
    result.contextNote = '<img src=x onerror=alert(1)>';
    result.input.phosphorusValue = '<script>bad</script>';
    result.reference.display = '<img src=x onerror=alert(2)>';
    result.sources = [{ label: '<script>source</script>', url: 'javascript:alert(1)' }];
    const html = ui.renderResult(result);
    expect(html).not.toMatch(/<img|<script|href="javascript:/);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;bad');
    expect(html).toContain('&lt;script&gt;source');
  });
});

describe('Pᵢ/Cr DZM — independent, reversible minimum-data controls', () => {
  it('creates its own controls with mmol/L defaults and no additional clinical question', () => {
    const { doc } = fixture(); expect(ui.ensureControls(doc)).toHaveLength(11);
    for (const [id, value] of Object.entries(engine.DEFAULTS)) expect(doc.getElementById(id).value).toBe(value);
    for (const id of engine.CONTEXT_FIELD_IDS) { expect(doc.getElementById(id).type).toBe('hidden'); expect(doc.getElementById(id).closest('label')).toBeNull(); }
    doc.getElementById('PICR_phosphorus').value = '15'; ui.ensureControls(doc);
    expect(doc.body.querySelectorAll('#PICR_phosphorus')).toHaveLength(1);
    expect(doc.getElementById('PICR_phosphorus').value).toBe('15');
    for (const id of ['age', 'weight', 'height', 'V24', 'Cl24DurationHours', 'U_PO4', 'U_Cr', 'S_PO4', 'S_Cr']) expect(doc.getElementById(id)).toBeNull();
    for (const id of ['PICR_phosphorus', 'PICR_creatinine', 'PICR_reportedValue']) expect(doc.getElementById(id).getAttribute('inputmode')).toBe('decimal');
    expect(doc.getElementById('PICR_phosphorusUnit').children.filter(x => !x.hidden).map(x => x.value)).toEqual(['mmol/L', 'µmol/L', 'mg P/L', 'mg P/dL']);
    expect(doc.getElementById('PICR_creatinineUnit').children.filter(x => !x.hidden).map(x => x.value)).toEqual(['mmol/L', 'µmol/L', 'mg/L', 'mg/dL']);
    expect(doc.getElementById('PICR_reportedUnit').children.filter(x => !x.hidden).map(x => x.value)).toEqual(['mg/mg', 'mg/g', 'mmol/mmol']);
  });
  it('keeps phosphorus first, scopes its mass hint, and changes only visible input mode', () => {
    const { doc } = fixture(); ui.ensureControls(doc);
    doc.getElementById('PICR_phosphorus').value = '15'; doc.getElementById('PICR_creatinine').value = '10'; doc.getElementById('PICR_reportedValue').value = '>0.3';
    let changes = 0; ui.sync(doc, { active: true, onChange: () => { changes += 1; } }); ui.sync(doc, { active: true, onChange: () => { changes += 1; } });
    expect(doc.body.querySelectorAll('#picrInputCard')).toHaveLength(1);
    expect(doc.getElementById('picrConcentrationFields').querySelectorAll('input').map(x => x.id)).toEqual(['PICR_phosphorus', 'PICR_creatinine']);
    expect(doc.getElementById('picrMassHint').hidden).toBe(true);
    doc.getElementById('PICR_phosphorusUnit').value = 'mg P/L'; ui.refresh(doc);
    expect(doc.getElementById('picrMassHint').hidden).toBe(false);
    expect(doc.getElementById('PICR_phosphorus').getAttribute('aria-describedby')).toContain('picrMassHint');
    const first = doc.body.querySelector('button[data-picr-mode="concentration"]'), second = doc.body.querySelector('button[data-picr-mode="direct"]');
    expect(first.textContent).toBe('Oblicz ze stężeń'); expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.textContent).toBe('Gotowy wynik Pᵢ/Cr'); second.click();
    expect(changes).toBe(1); expect(doc.getElementById('PICR_inputMode').value).toBe('direct');
    expect(doc.getElementById('picrConcentrationFields').hidden).toBe(true);
    expect(doc.getElementById('picrReportedFields').hidden).toBe(false);
    expect(doc.getElementById('picrMassHint').hidden).toBe(true);
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(engine.readInputFromDocument(doc)).toMatchObject({ mode: 'direct', reportedValue: '>0.3' });
    first.click();
    expect(engine.readInputFromDocument(doc)).toMatchObject({ mode: 'concentration', phosphorusValue: '15', creatinineValue: '10' });
    expect(doc.getElementById('PICR_reportedValue').value).toBe('>0.3');
  });
  it('preserves original placement, imported facts and accessibility attributes through teardown', () => {
    const { doc } = fixture(); ui.ensureControls(doc);
    const field = doc.getElementById('PICR_phosphorus'), wrapper = field.closest('label'), origin = wrapper.parentNode;
    field.value = '15'; field.setAttribute('aria-describedby', 'original-help'); field.setAttribute('aria-invalid', 'true'); wrapper.hidden = true;
    doc.getElementById('PICR_collectionHours').value = '12'; doc.getElementById('PICR_durationKnown').value = 'false';
    doc.getElementById('PICR_sameSpecimen').value = 'different'; doc.getElementById('PICR_collectionProblem').value = 'true';
    ui.sync(doc, { active: true });
    expect(doc.getElementById('picrInputCard').textContent).toContain('różnych zbiórek');
    expect(doc.getElementById('picrInputCard').textContent).toContain('problemie zbiórki');
    expect(doc.getElementById('PICR_sameSpecimen').value).toBe('different');
    ui.sync(doc, { active: false });
    expect(doc.getElementById('picrInputCard')).toBeNull(); expect(wrapper.parentNode).toBe(origin); expect(wrapper.hidden).toBe(true);
    expect(field.getAttribute('aria-describedby')).toBe('original-help'); expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(doc.documentElement.getAttribute('data-clcr-picr-active')).toBeNull();
    ui.sync(doc, { active: true });
    expect(field.value).toBe('15'); expect(doc.getElementById('PICR_collectionHours').value).toBe('12');
    expect(doc.getElementById('PICR_durationKnown').value).toBe('false');
  });
});
