import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_protein_creatinine_data.js', 'clcr_protein_creatinine.js', 'clcr_protein_creatinine_ui.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrProteinCreatinineUi, engine = browser.VildaClcrProteinCreatinine;
const profile = browser.VildaClcrProteinCreatinineData.getProfile('BCR_DZM_2026_11');
const base = { mode: 'concentration', proteinValue: '300', proteinUnit: 'mg/L', creatinineValue: '100', creatinineUnit: 'mg/dL', ageYears: 10, sex: 'F' };
const evaluate = patch => engine.evaluate({ ...base, ...patch }, profile);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = html => decode(html.replace(/<[^>]*>/g, ''));
const attribute = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const card = html => html.split('<details')[0].replace(/data-clcr-protein-creatinine-snapshot="[^"]*"/g, '');

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

describe('B/Cr DZM — captured single result and upper reference', () => {
  it('presents one mass ratio and one upper limit without claiming the patient laboratory is known', () => {
    const result = evaluate(), html = ui.renderResult(result), main = card(html);
    expect(main.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(attribute(main, 'data-clcr-series')).toBe('B_Cr');
    expect(attribute(main, 'data-clcr-value')).toBe('0.3');
    expect(attribute(main, 'data-clcr-display-unit')).toBe('mg/mg');
    expect(plain(main)).toContain('B/Cr niepodwyższony');
    expect(plain(main)).toContain('Górna granica normyDla wieku i płci');
    expect(plain(main)).toContain('≤0,334');
    expect(main.match(/>mg\/mg</g)).toHaveLength(2);
    expect(attribute(main, 'data-clcr-tone')).toBe('success');
    expect(main).not.toContain('ARUP');
    expect(main).not.toContain('tego laboratorium');
    expect(JSON.parse(attribute(html, 'data-clcr-protein-creatinine-snapshot'))).toEqual(result.snapshot);
    expect(html).toContain('id="clcr-protein-creatinine-details"');
    expect(html).not.toMatch(/<details open|style=/);
  });
  it.each([['M', '0,059–0,22'], ['F', '0,057–0,334']])('highlights only age10 and sex%s in the source table', (sex, expected) => {
    const html = ui.renderResult(evaluate({ sex }));
    expect(html.match(/class="bcr-reference-cell--active"/g)).toHaveLength(1);
    const selectedCell = html.match(/<td class="bcr-reference-cell--active"[^>]*>(.*?)<\/td>/)?.[1] || '';
    expect(plain(selectedCell)).toContain(expected);
    expect(plain(html)).toContain('Pełne przedziały źródłowe · B/Cr w mg/mg');
  });
  it('shows an upper-only fixed scale and distinguishes its caption from the patient status', () => {
    const high = evaluate({ mode: 'direct', reportedValue: '0.3340000000000000001', reportedUnit: 'mg/mg' });
    const main = card(ui.renderResult(high));
    expect(high.status).toBe('high');
    expect(attribute(main, 'data-clcr-tone')).toBe('warning');
    expect(plain(main)).toContain('Podwyższony B/Cr');
    expect(plain(main)).toContain('Górna granica normy: 0,334 mg/mg.');
    expect(plain(main)).not.toContain('B/Cr niepodwyższony');
    expect(main.match(/class="bcr-norm-boundary"/g)).toHaveLength(1);
    expect(main).toContain('x1="50%" x2="50%"');
    const second = card(ui.renderResult(evaluate({ proteinValue: '600' })));
    expect(second).toContain('x1="50%" x2="50%"');
    expect(second).not.toContain('Wynik powyżej skali.');
    expect(plain(card(ui.renderResult(evaluate({ proteinValue: '700' }))))).toContain('Wynik powyżej skali. Górna granica normy: 0,334 mg/mg.');
  });
  it('does not turn a positive value below the source lower bound into a low alarm', () => {
    const main = card(ui.renderResult(evaluate({ proteinValue: '1' })));
    expect(attribute(main, 'data-clcr-tone')).toBe('success');
    expect(plain(main)).toContain('B/Cr niepodwyższony');
    expect(main).not.toContain('below');
  });
  it.each(['M', 'F', null])('uses the strict adult KDIGO boundary independently of sex%s', sex => {
    const result = evaluate({ mode: 'direct', reportedValue: '0.15', reportedUnit: 'mg/mg', ageYears: 18, sex });
    const html = ui.renderResult(result), main = card(html);
    expect(plain(main)).toContain('Zakres wg KDIGO');
    expect(plain(main)).toContain('<0,15');
    expect(attribute(main, 'data-clcr-tone')).toBe('warning');
    expect(plain(main)).toContain('Zakres KDIGO: poniżej 0,15 mg/mg.');
    expect(plain(html)).toContain('Umiarkowanie zwiększony');
    expect(html).not.toContain('class="bcr-reference-cell--active"');
    expect(html.match(/class="bcr-category-row--active"/g)).toHaveLength(1);
    expect(plain(html.match(/<tr class="bcr-category-row--active"[^>]*>(.*?)<\/tr>/)?.[1] || '')).toBe('0,15–0,5Umiarkowanie zwiększony');
    expect(main).not.toMatch(/Mayo|A1|A2|A3/);
  });
  it.each([{ ageYears: 6 }, { ageYears: null }, { sex: null }])('shows a neutral number and the specific missing-reference reason %j', context => {
    const result = evaluate(context), html = ui.renderResult(result), main = card(html);
    expect(attribute(main, 'data-clcr-tone')).toBe('neutral');
    expect(attribute(main, 'data-clcr-assessment')).toBe('unassessed');
    expect(plain(main)).toContain(result.message);
    expect(plain(main)).toContain('Brak dobranej normy');
    expect(main).not.toContain('<svg');
    expect(html).not.toContain('class="bcr-reference-cell--active"');
  });
  it.each(['mg/mg', 'mg/g', 'mg/mmol'])('preserves the%s censored report without fabricating a point', reportedUnit => {
    const result = evaluate({ mode: 'direct', reportedValue: '≤0.500000', reportedUnit });
    const html = ui.renderResult(result), main = card(html);
    expect(attribute(main, 'data-clcr-display-unit')).toBe('mg/mg');
    expect(attribute(main, 'data-clcr-comparator')).toBe('≤');
    expect(attribute(main, 'data-clcr-tone')).toBe('neutral');
    expect(attribute(main, 'aria-label')).toBe(result.display.text);
    expect(plain(main)).toContain(result.reference.display);
    expect(plain(html)).toContain(`≤0.500000 ${reportedUnit}`);
    expect(main).not.toContain('bcr-norm-point');
    const saved = JSON.parse(attribute(html, 'data-clcr-protein-creatinine-snapshot'));
    expect(saved.input.reportedValue).toBe('≤0.500000'); expect(saved.pointValue).toBeNull();
  });
  it('keeps exact zero neutral with its reference and quantitation caution', () => {
    const result = evaluate({ proteinValue: '0' }), main = card(ui.renderResult(result));
    expect(attribute(main, 'data-clcr-value')).toBe('0'); expect(attribute(main, 'data-clcr-tone')).toBe('neutral');
    expect(plain(main)).toContain('granicy oznaczalności'); expect(plain(main)).toContain('≤0,334');
    expect(main).not.toContain('bcr-norm-point');
  });
  it.each(['1e-300', '5e-324', '1.7976931348623157e308'])('preserves finite%s as scientific display and frozen exact/raw data', reportedValue => {
    const result = evaluate({ mode: 'direct', reportedValue, reportedUnit: 'mg/mg' }), html = ui.renderResult(result), main = card(html);
    expect(result.valid).toBe(true); expect(result.rawValue).toBeGreaterThan(0);
    expect(attribute(main, 'data-clcr-value')).toBe(String(result.rawValue));
    expect(main).toContain('data-scientific="true"'); expect(main).toContain('× 10<sup>');
    expect(attribute(main, 'aria-label')).toBe(result.display.text);
    expect(JSON.parse(attribute(html, 'data-clcr-protein-creatinine-snapshot'))).toEqual(result.snapshot);
  });
  it.each([{ proteinValue: '' }, { creatinineValue: '' }, { mode: 'direct', reportedValue: '', reportedUnit: 'mg/mg' }])('keeps missing input%j distinct from invalid data', patch => {
    const result = evaluate(patch), html = ui.renderResult(result);
    expect(html).toContain('bcr-result-empty'); expect(plain(html)).toContain(result.message);
    expect(html).not.toMatch(/data-clcr-series=|data-clcr-value=|data-clcr-protein-creatinine-snapshot=|role="alert"/);
  });
  it.each([{ proteinValue: '-1' }, { creatinineValue: '0' }, { proteinValue: 'abc' }, { sameSpecimen: 'different' }, { mode: 'direct', reportedValue: '<0', reportedUnit: 'mg/mg' }])('makes invalid%j visibly invalid and uncollectable', patch => {
    const result = evaluate(patch), html = ui.renderResult(result);
    expect(html).toContain('bcr-result-error'); expect(html).toContain('role="alert"'); expect(plain(html)).toContain(result.message);
    expect(html).not.toMatch(/data-clcr-series=|data-clcr-value=|data-clcr-protein-creatinine-snapshot=/);
  });
  it('explains the denominator, sources and conversion in collapsed details only', () => {
    const html = ui.renderResult(evaluate()), details = html.split('<details')[1];
    expect(plain(details)).toContain('300 mg/L białka ÷ 100 mg/dL kreatyniny');
    expect(plain(details)).toContain('Źródło zakresu przyjętego w aplikacji: ARUP');
    expect(plain(details)).toContain('Kreatynina jest w mianowniku B/Cr.');
    expect(plain(details)).toContain('13–<16 lat'); expect(plain(details)).toContain('0,307'); expect(plain(details)).toContain('0,371');
    expect(plain(details)).toContain('113,12');
    expect(details).toContain('https://ltd.aruplab.com/Tests/Pub/0020479');
    expect(details).toContain('https://pmc.ncbi.nlm.nih.gov/articles/PMC7446301/');
    expect(details).not.toMatch(/burosumab|fosfor|Mayo/);
  });
  it('retains known collection facts and suppresses automated assessment without changing the direct report', () => {
    const result = evaluate({ mode: 'direct', reportedValue: '>0.3', reportedUnit: 'mg/mg', sameSpecimen: 'different', collectionProblem: true, collectionHours: '12', durationKnown: false });
    const html = ui.renderResult(result);
    expect(attribute(card(html), 'data-clcr-comparator')).toBe('>');
    expect(plain(html)).toContain('Zachowany czas zbiórki: 12 h.'); expect(plain(html)).toContain('Czas zbiórki oznaczono jako nieznany.');
    expect(plain(html)).toContain('problemie zbiórki'); expect(plain(html)).toContain('różne zbiórki');
    expect(attribute(card(html), 'data-clcr-tone')).toBe('neutral');
  });
  it('renders a snapshot without looking up current patient or reference data', () => {
    const captured = JSON.parse(JSON.stringify(evaluate()));
    const liveEngine = browser.VildaClcrProteinCreatinine, liveData = browser.VildaClcrProteinCreatinineData;
    browser.VildaClcrProteinCreatinine = new Proxy({}, { get() { throw Error('No recalculation'); } });
    browser.VildaClcrProteinCreatinineData = new Proxy({}, { get() { throw Error('No reference lookup'); } });
    try { expect(JSON.parse(attribute(ui.renderResult(captured), 'data-clcr-protein-creatinine-snapshot'))).toEqual(captured.snapshot); }
    finally { browser.VildaClcrProteinCreatinine = liveEngine; browser.VildaClcrProteinCreatinineData = liveData; }
  });
  it('escapes frozen input, clinical notes, ranges and untrusted source links', () => {
    const result = JSON.parse(JSON.stringify(evaluate()));
    result.contextNote = '<img src=x onerror=alert(1)>'; result.input.proteinValue = '<script>bad</script>';
    result.reference.display = '<img src=x onerror=alert(2)>'; result.sources = [{ label: '<script>source</script>', url: 'javascript:alert(1)' }];
    const html = ui.renderResult(result);
    expect(html).not.toMatch(/<img|<script|href="javascript:/); expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;bad'); expect(html).toContain('&lt;script&gt;source');
  });
});

describe('B/Cr DZM — reversible minimal controls', () => {
  it('creates isolated controls with protein mg/L and creatinine mg/dL defaults', () => {
    const { doc } = fixture(); expect(ui.ensureControls(doc)).toHaveLength(11);
    for (const [id, value] of Object.entries(engine.DEFAULTS)) expect(doc.getElementById(id).value).toBe(value);
    for (const id of engine.CONTEXT_FIELD_IDS) { expect(doc.getElementById(id).type).toBe('hidden'); expect(doc.getElementById(id).closest('label')).toBeNull(); }
    doc.getElementById('BCR_protein').value = '300'; ui.ensureControls(doc);
    expect(doc.body.querySelectorAll('#BCR_protein')).toHaveLength(1); expect(doc.getElementById('BCR_protein').value).toBe('300');
    for (const id of ['age', 'weight', 'height', 'V24', 'Cl24DurationHours', 'U_Prot', 'U_Cr', 'S_Prot', 'S_Cr']) expect(doc.getElementById(id)).toBeNull();
    for (const id of ['BCR_protein', 'BCR_creatinine', 'BCR_reportedValue']) expect(doc.getElementById(id).getAttribute('inputmode')).toBe('decimal');
    expect(doc.getElementById('BCR_proteinUnit').children.filter(x => !x.hidden).map(x => x.value)).toEqual(['mg/L', 'mg/dL', 'g/L']);
    expect(doc.getElementById('BCR_creatinineUnit').children.filter(x => !x.hidden).map(x => x.value)).toEqual(['mg/dL', 'mg/L', 'mmol/L', 'µmol/L']);
    expect(doc.getElementById('BCR_reportedUnit').children.filter(x => !x.hidden).map(x => x.value)).toEqual(['mg/mg', 'mg/g', 'mg/mmol']);
  });
  it('keeps protein first, changes only mode and retains dormant values', () => {
    const { doc } = fixture(); ui.ensureControls(doc);
    doc.getElementById('BCR_protein').value = '300'; doc.getElementById('BCR_creatinine').value = '100'; doc.getElementById('BCR_reportedValue').value = '>0.3';
    let changes = 0; ui.sync(doc, { active: true, onChange: () => { changes += 1; } }); ui.sync(doc, { active: true, onChange: () => { changes += 1; } });
    expect(doc.body.querySelectorAll('#bcrInputCard')).toHaveLength(1);
    expect(doc.getElementById('bcrConcentrationFields').querySelectorAll('input').map(x => x.id)).toEqual(['BCR_protein', 'BCR_creatinine']);
    const first = doc.body.querySelector('button[data-bcr-mode="concentration"]'), second = doc.body.querySelector('button[data-bcr-mode="direct"]');
    expect(first.textContent).toBe('Oblicz ze stężeń'); expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.textContent).toBe('Gotowy wynik B/Cr'); second.click();
    expect(changes).toBe(1); expect(doc.getElementById('BCR_inputMode').value).toBe('direct');
    expect(doc.getElementById('bcrConcentrationFields').hidden).toBe(true); expect(doc.getElementById('bcrReportedFields').hidden).toBe(false);
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(engine.readInputFromDocument(doc)).toMatchObject({ mode: 'direct', reportedValue: '>0.3' });
    first.click(); expect(engine.readInputFromDocument(doc)).toMatchObject({ mode: 'concentration', proteinValue: '300', creatinineValue: '100' });
    expect(doc.getElementById('BCR_reportedValue').value).toBe('>0.3');
  });
  it('restores original legacy mass and volume controls without relabeling them as concentrations', () => {
    const { doc, form } = fixture();
    const values = { U_Prot: '450', V24: '1500', Ucr: '100' };
    for (const [id, value] of Object.entries(values)) {
      const wrapper = doc.createElement('label'), input = doc.createElement('input');
      input.id = id; input.value = value; wrapper.append(input); form.append(wrapper);
    }
    ui.ensureControls(doc); doc.getElementById('BCR_inputMode').value = 'legacy';
    doc.getElementById('BCR_protein').value = '999'; doc.getElementById('BCR_creatinine').value = '888';
    ui.sync(doc, { active: true });
    expect(doc.getElementById('bcrLegacyFields').hidden).toBe(false);
    expect(doc.getElementById('bcrRequiredCount').textContent).toBe('3/3');
    doc.getElementById('V24').value = '0'; ui.refresh(doc);
    expect(doc.getElementById('bcrRequiredCount').textContent).toBe('2/3');
    doc.getElementById('V24').value = '1500'; ui.refresh(doc);
    expect(doc.getElementById('bcrConcentrationFields').hidden).toBe(true);
    expect(doc.getElementById('bcrLegacyFields').querySelectorAll('input').map(input => input.id)).toEqual(['U_Prot', 'V24', 'Ucr']);
    expect(doc.getElementById('bcrLegacyFields').textContent).toContain('ilość białka w całej zbiórce');
    const result = engine.evaluate(engine.readInputFromDocument(doc, { ageYears: 10, sex: 'F' }), profile);
    expect(result.rawValue).toBe(0.3);
    expect(plain(ui.renderResult(result))).toContain('białko w całej zbiórce 450 mg, objętość 1500 mL, kreatynina 100 mg/dL');
    doc.body.querySelector('button[data-bcr-mode="concentration"]').click();
    expect(doc.getElementById('bcrLegacyFields').hidden).toBe(true);
    expect(doc.getElementById('BCR_protein').value).toBe(''); expect(doc.getElementById('BCR_creatinine').value).toBe('');
    for (const [id, value] of Object.entries(values)) expect(doc.getElementById(id).value).toBe(value);
    ui.sync(doc, { active: false });
    for (const id of Object.keys(values)) expect(doc.getElementById(id).closest('label').parentNode).toBe(form);
  });
  it('preserves comma and invalid legacy evidence when restoring numeric-control attributes would erase it', () => {
    const { doc, form } = fixture();
    for (const id of ['U_Prot', 'V24', 'Ucr']) {
      const wrapper = doc.createElement('label'), input = doc.createElement('input');
      input.id = id; input.type = 'number'; input.setAttribute('type', 'number'); wrapper.append(input); form.append(wrapper);
    }
    ui.prepareLegacyControls(doc);
    doc.getElementById('U_Prot').value = '450,25'; doc.getElementById('V24').value = 'invalid'; doc.getElementById('Ucr').value = '100';
    ui.restore(doc);
    expect(doc.getElementById('U_Prot').type).toBe('text'); expect(doc.getElementById('U_Prot').value).toBe('450,25');
    expect(doc.getElementById('V24').type).toBe('text'); expect(doc.getElementById('V24').value).toBe('invalid');
    expect(doc.getElementById('Ucr').type).toBe('number'); expect(doc.getElementById('Ucr').value).toBe('100');
    doc.getElementById('U_Prot').value = ''; doc.getElementById('V24').value = '1500'; ui.restore(doc);
    expect(doc.getElementById('U_Prot').type).toBe('number'); expect(doc.getElementById('V24').type).toBe('number');
    expect(doc.getElementById('U_Prot').getAttribute('inputmode')).toBeNull();
  });
  it('counts only valid required quantities, including zero protein, without requiring patient context', () => {
    const { doc } = fixture(); ui.sync(doc, { active: true });
    const count = () => doc.getElementById('bcrRequiredCount').textContent;
    expect(count()).toBe('0/2');
    doc.getElementById('BCR_protein').value = '0'; ui.refresh(doc); expect(count()).toBe('1/2');
    doc.getElementById('BCR_creatinine').value = '0'; ui.refresh(doc); expect(count()).toBe('1/2');
    doc.getElementById('BCR_creatinine').value = '100'; ui.refresh(doc); expect(count()).toBe('2/2');
    expect(doc.body.querySelector('.bcr-readiness').getAttribute('data-complete')).toBe('true');
    doc.getElementById('BCR_protein').value = '-1'; ui.refresh(doc); expect(count()).toBe('1/2');
    doc.getElementById('BCR_protein').value = 'invalid'; ui.refresh(doc); expect(count()).toBe('1/2');
    expect(doc.body.querySelector('.bcr-readiness').getAttribute('data-complete')).toBe('false');
    doc.body.querySelector('button[data-bcr-mode="direct"]').click(); expect(count()).toBe('0/1');
    doc.getElementById('BCR_reportedValue').value = '<0'; ui.refresh(doc); expect(count()).toBe('0/1');
    doc.getElementById('BCR_reportedValue').value = '≤0'; ui.refresh(doc); expect(count()).toBe('1/1');
    expect(doc.getElementById('bcrInputCard').textContent).not.toMatch(/pełnej interpretacji|wiek|płeć/);
    doc.body.querySelector('button[data-bcr-mode="concentration"]').click(); expect(count()).toBe('1/2');
  });
  it('preserves original placement, imported facts and accessibility through teardown', () => {
    const { doc } = fixture(); ui.ensureControls(doc);
    const field = doc.getElementById('BCR_protein'), wrapper = field.closest('label'), origin = wrapper.parentNode;
    field.value = '300'; field.setAttribute('aria-describedby', 'original-help'); field.setAttribute('aria-invalid', 'true'); wrapper.hidden = true;
    doc.getElementById('BCR_collectionHours').value = '12'; doc.getElementById('BCR_durationKnown').value = 'false';
    doc.getElementById('BCR_sameSpecimen').value = 'different'; doc.getElementById('BCR_collectionProblem').value = 'true'; ui.sync(doc, { active: true });
    expect(doc.getElementById('bcrInputCard').textContent).toContain('różnych zbiórek'); expect(doc.getElementById('bcrInputCard').textContent).toContain('problemie zbiórki');
    expect(doc.getElementById('BCR_sameSpecimen').value).toBe('different'); ui.sync(doc, { active: false });
    expect(doc.getElementById('bcrInputCard')).toBeNull(); expect(wrapper.parentNode).toBe(origin); expect(wrapper.hidden).toBe(true);
    expect(field.getAttribute('aria-describedby')).toBe('original-help'); expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(doc.documentElement.getAttribute('data-clcr-bcr-active')).toBeNull(); ui.sync(doc, { active: true });
    expect(field.value).toBe('300'); expect(doc.getElementById('BCR_collectionHours').value).toBe('12'); expect(doc.getElementById('BCR_durationKnown').value).toBe('false');
  });
});
