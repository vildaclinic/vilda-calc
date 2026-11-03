import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
for (const file of ['clcr_magnesium_calcium_data.js', 'clcr_magnesium_calcium.js', 'clcr_magnesium_calcium_ui.js']) loadBrowserScript(file, browser);
const ui = browser.ClcrMagnesiumCalciumUi, engine = browser.VildaClcrMagnesiumCalcium;
const profile = browser.VildaClcrMagnesiumCalciumData.getProfile('MGCA_DZM_2026_11');
const base = { mode: 'concentration', magnesiumValue: '20', magnesiumUnit: 'mg/L', calciumValue: '2', calciumUnit: 'mmol/L' };
const evaluate = patch => engine.evaluate({ ...base, ...patch }, profile);
const decode = text => text.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const plain = html => decode(html.replace(/<[^>]*>/g, ''));
const attribute = (html, name) => decode(html.match(new RegExp(`${name}="([^"]*)"`))?.[1] || '');
const card = html => html.split('<details')[0].replace(/data-clcr-mgca-snapshot="[^"]*"/g, '');

describe('Mg/Ca DZM — one captured B card without a fabricated normal range', () => {
  it('connects the exact calculated result, visible reference and full captured snapshot', () => {
    const result = evaluate(), html = ui.renderResult(result), main = card(html);
    expect(main.match(/class="clcr-result-value"/g)).toHaveLength(1);
    expect(attribute(main, 'data-clcr-series')).toBe('Mg_Ca');
    expect(attribute(main, 'data-clcr-formula')).toBe('Mg_Ca');
    expect(attribute(main, 'data-clcr-value')).toBe(String(result.rawValue));
    expect(attribute(main, 'data-clcr-display-value')).toBe(result.display.value);
    expect(attribute(main, 'data-clcr-display-unit')).toBe('mg/mg');
    expect(plain(main)).toContain('≈0,2495');
    expect(plain(main)).toContain('Wynik pacjenta');
    expect(plain(main)).toContain('Norma dla DZM');
    expect(plain(main)).toContain('Brak zakresu');
    expect(plain(main)).toContain('Ten wynik nie ma przypisanej normy dla DZM.');
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(main).toContain('data-clcr-assessment="unassessed"');
    expect(main).toContain('data-clcr-reference-comparison="false"');
    expect(main).not.toMatch(/<svg|norm-axis|W zakresie|data-clcr-tone="success"|style=/);
    expect(JSON.parse(attribute(html, 'data-clcr-mgca-snapshot'))).toEqual(result.snapshot);
    expect(html).toContain('id="clcr-magnesium-calcium-details"');
    expect(html).not.toContain('<details open');
  });
  it('explains the actual calculation, full value, different quantity and primary sources only in details', () => {
    const result = evaluate(), html = ui.renderResult(result), details = html.split('<details')[1];
    expect(plain(details)).toContain('20 mg/L Mg ÷ 2 mmol/L Ca');
    expect(plain(details)).toContain(result.display.fullValueText);
    expect(plain(details)).toContain('Ten sam wskaźnik w drugiej jednostce:');
    expect(plain(details)).toContain('mmol/mmol');
    expect(plain(details)).toContain('24,305 g/mol');
    expect(plain(details)).toContain('40,078 g/mol');
    expect(plain(details)).toContain('Badania porannych próbek');
    expect(details).toContain('https://uroweb.org/guidelines/urolithiasis/');
    expect(details).toContain('https://webbook.nist.gov/cgi/cbook.cgi?ID=7439-95-4');
    expect(details).toContain('data-clcr-mgca-formula="Mg_mgkg"');
    expect(details).toContain('data-clcr-mgca-formula="Ca_mgkg"');
    expect(card(html)).not.toContain('40,078');
  });
  it.each(['mg/mg', 'mmol/mmol'])('keeps the reported %s quantity and its comparator throughout rendering', reportedUnit => {
    const result = evaluate({ mode: 'direct', reportedValue: '≤0.500000', reportedUnit });
    const html = ui.renderResult(result), main = card(html), captured = JSON.parse(attribute(html, 'data-clcr-mgca-snapshot'));
    expect(attribute(main, 'data-clcr-display-unit')).toBe(reportedUnit);
    expect(attribute(main, 'data-clcr-comparator')).toBe('≤');
    expect(plain(main)).toContain(result.display.text);
    expect(plain(html)).toContain(result.display.fullValueText);
    expect(captured.input.reportedValue).toBe('≤0.500000');
    expect(captured.pointValue).toBeNull();
    expect(main).not.toMatch(/<svg|norm-point|success|warning|danger/);
    expect(plain(html)).toContain('Przepisany wskaźnik');
  });
  it.each(['0', '1e-300', '5e-324', '1.7976931348623157e308'])('preserves a valid %s, including zero and finite extremes, without assigning normality', reportedValue => {
    const result = evaluate({ mode: 'direct', reportedValue, reportedUnit: 'mg/mg' });
    expect(result.valid).toBe(true);
    const html = ui.renderResult(result), main = card(html);
    expect(attribute(main, 'data-clcr-value')).toBe(String(result.rawValue));
    expect(attribute(main, 'data-clcr-display-value')).toBe(result.display.value);
    expect(main).toContain('data-clcr-tone="neutral"');
    expect(JSON.parse(attribute(html, 'data-clcr-mgca-snapshot'))).toEqual(result.snapshot);
    if (/e/i.test(result.display.text)) {
      expect(main).toContain('data-scientific="true"');
      expect(attribute(main, 'aria-label')).toBe(result.display.text);
      expect(main).toContain('× 10<sup>');
    } else expect(plain(main)).toContain(result.display.text);
    if (reportedValue === '0') expect(plain(main)).toContain('Wynik pacjenta0');
    else expect(result.rawValue).toBeGreaterThan(0);
    if (!result.alternateAvailable) expect(plain(html)).toContain(`Przeliczenie na ${result.alternateUnit} jest poza zakresem liczbowym`);
  });
  it.each([
    [{ magnesiumValue: '' }, 'Wpisz stężenie magnezu'],
    [{ calciumValue: '' }, 'Wpisz stężenie wapnia'],
    [{ mode: 'direct', reportedValue: '', reportedUnit: 'mg/mg' }, 'Wpisz wynik Mg/Ca'],
  ])('keeps missing input %j distinct from an invalid measurement', (patch, message) => {
    const html = ui.renderResult(evaluate(patch));
    expect(html).toContain('mgca-result-empty');
    expect(plain(html)).toContain('Tutaj pojawi się wynik Mg/Ca');
    expect(plain(html)).toContain(message);
    expect(html).not.toMatch(/data-clcr-series=|data-clcr-value=|data-clcr-mgca-snapshot=|role="alert"/);
  });
  it.each([
    { magnesiumValue: '-1' }, { calciumValue: '0' }, { calciumValue: '-1' },
    { magnesiumValue: 'abc' }, { sameSpecimen: 'different' },
    { mode: 'direct', reportedValue: '-1', reportedUnit: 'mg/mg' },
  ])('does not make invalid %j collectable', patch => {
    const result = evaluate(patch), html = ui.renderResult(result);
    expect(html).toContain('mgca-result-error');
    expect(html).toContain('role="alert"');
    expect(plain(html)).toContain(result.message);
    expect(html).not.toMatch(/data-clcr-series=|data-clcr-value=|data-clcr-mgca-snapshot=/);
  });
  it('retains known collection limitations in details without creating a range or altering a direct report', () => {
    const result = evaluate({ mode: 'direct', reportedValue: '>0.3', reportedUnit: 'mg/mg', sameSpecimen: 'different', collectionProblem: true, collectionHours: '12', durationKnown: false });
    const html = ui.renderResult(result), main = card(html);
    expect(attribute(main, 'data-clcr-comparator')).toBe('>');
    expect(plain(main)).toContain('>0,3');
    expect(plain(html)).toContain('Zachowany czas zbiórki: 12 h.');
    expect(plain(html)).toContain('Czas zbiórki oznaczono jako nieznany.');
    expect(plain(html)).toContain('problemie zbiórki');
    expect(plain(html)).toContain('różne zbiórki');
    expect(JSON.parse(attribute(html, 'data-clcr-mgca-snapshot')).context).toEqual(result.context);
  });
  it('renders the captured version without consulting the live engine or reference registry', () => {
    const captured = JSON.parse(JSON.stringify(evaluate()));
    const liveEngine = browser.VildaClcrMagnesiumCalcium, liveData = browser.VildaClcrMagnesiumCalciumData;
    browser.VildaClcrMagnesiumCalcium = new Proxy({}, { get() { throw Error('No recalculation during rendering'); } });
    browser.VildaClcrMagnesiumCalciumData = new Proxy({}, { get() { throw Error('No live reference lookup during rendering'); } });
    try { expect(JSON.parse(attribute(ui.renderResult(captured), 'data-clcr-mgca-snapshot'))).toEqual(captured.snapshot); }
    finally { browser.VildaClcrMagnesiumCalcium = liveEngine; browser.VildaClcrMagnesiumCalciumData = liveData; }
  });
  it('escapes captured text and refuses executable source links', () => {
    const result = JSON.parse(JSON.stringify(evaluate()));
    result.contextNote = '<img src=x onerror=alert(1)>';
    result.input.magnesiumValue = '<script>bad</script>';
    result.sources = [{ label: '<script>source</script>', url: 'javascript:alert(1)' }];
    const html = ui.renderResult(result);
    expect(html).not.toMatch(/<img|<script|href="javascript:/);
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;bad');
    expect(html).toContain('&lt;script&gt;source');
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

describe('Mg/Ca DZM — independent reversible minimum-data controls', () => {
  it('creates only its own fields once and requires no patient data, volume or time', () => {
    const { doc } = fixture(); expect(ui.ensureControls(doc)).toHaveLength(11);
    for (const [id, value] of Object.entries(engine.DEFAULTS)) expect(doc.getElementById(id).value).toBe(value);
    for (const id of engine.CONTEXT_FIELD_IDS) { expect(doc.getElementById(id).type).toBe('hidden'); expect(doc.getElementById(id).closest('label')).toBeNull(); }
    doc.getElementById('MGCA_magnesium').value = '20'; ui.ensureControls(doc);
    expect(doc.body.querySelectorAll('#MGCA_magnesium')).toHaveLength(1);
    expect(doc.getElementById('MGCA_magnesium').value).toBe('20');
    for (const id of ['age', 'weight', 'height', 'V24', 'Cl24DurationHours', 'U_Mg', 'U_Ca']) expect(doc.getElementById(id)).toBeNull();
    for (const id of ['MGCA_magnesium', 'MGCA_calcium', 'MGCA_reportedValue']) {
      const control = doc.getElementById(id);
      expect(control.type).toBe('text'); expect(control.getAttribute('inputmode')).toBe('decimal');
    }
  });
  it('offers four unambiguous concentration units and two direct quantities, retaining hidden alias imports', () => {
    const { doc } = fixture(); ui.ensureControls(doc);
    for (const id of ['MGCA_magnesiumUnit', 'MGCA_calciumUnit']) expect(doc.getElementById(id).children.filter(x => !x.hidden).map(x => x.value)).toEqual(['mg/L', 'mg/dL', 'mmol/L', 'µmol/L']);
    const directUnit = doc.getElementById('MGCA_reportedUnit');
    expect(directUnit.children.filter(x => !x.hidden).map(x => x.value)).toEqual(['mg/mg', 'mmol/mmol']);
    directUnit.value = 'g/g'; doc.getElementById('MGCA_reportedValue').value = '0.500000'; ui.sync(doc, { active: true });
    expect(directUnit.value).toBe('mg/mg'); expect(doc.getElementById('MGCA_reportedValue').value).toBe('0.500000');
    directUnit.value = 'mol/mol'; ui.refresh(doc); expect(directUnit.value).toBe('mmol/mmol');
  });
  it('keeps magnesium first and switches only the visible input path without losing either result', () => {
    const { doc } = fixture(); ui.ensureControls(doc);
    doc.getElementById('MGCA_magnesium').value = '20'; doc.getElementById('MGCA_calcium').value = '2'; doc.getElementById('MGCA_reportedValue').value = '>0.3';
    let changes = 0; ui.sync(doc, { active: true, onChange: () => { changes += 1; } }); ui.sync(doc, { active: true, onChange: () => { changes += 1; } });
    expect(doc.body.querySelectorAll('#mgcaInputCard')).toHaveLength(1);
    const fields = doc.getElementById('mgcaConcentrationFields').querySelectorAll('input');
    expect(fields.map(x => x.id)).toEqual(['MGCA_magnesium', 'MGCA_calcium']);
    const first = doc.body.querySelector('button[data-mgca-mode="concentration"]'), second = doc.body.querySelector('button[data-mgca-mode="direct"]');
    expect(first.textContent).toBe('Oblicz ze stężeń'); expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.textContent).toBe('Gotowy wynik Mg/Ca'); second.click();
    expect(changes).toBe(1); expect(doc.getElementById('MGCA_inputMode').value).toBe('direct');
    expect(doc.getElementById('mgcaConcentrationFields').hidden).toBe(true);
    expect(doc.getElementById('mgcaReportedFields').hidden).toBe(false);
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(engine.readInputFromDocument(doc)).toMatchObject({ mode: 'direct', reportedValue: '>0.3' });
    first.click();
    expect(engine.readInputFromDocument(doc)).toMatchObject({ mode: 'concentration', magnesiumValue: '20', calciumValue: '2' });
    expect(doc.getElementById('MGCA_reportedValue').value).toBe('>0.3');
  });
  it('preserves imported facts, original placement and ARIA through teardown and re-entry', () => {
    const { doc } = fixture(); ui.ensureControls(doc);
    const field = doc.getElementById('MGCA_calcium'), wrapper = field.closest('label'), origin = wrapper.parentNode;
    field.value = '2'; field.setAttribute('aria-describedby', 'original-help'); field.setAttribute('aria-invalid', 'true'); wrapper.hidden = true;
    doc.getElementById('MGCA_collectionHours').value = '12'; doc.getElementById('MGCA_durationKnown').value = 'false';
    doc.getElementById('MGCA_sameSpecimen').value = 'different'; doc.getElementById('MGCA_collectionProblem').value = 'true';
    ui.sync(doc, { active: true });
    expect(doc.getElementById('mgcaInputCard').textContent).toContain('różnych zbiórek');
    expect(doc.getElementById('mgcaInputCard').textContent).toContain('problemie zbiórki');
    expect(doc.getElementById('MGCA_sameSpecimen').value).toBe('different');
    ui.sync(doc, { active: false });
    expect(doc.getElementById('mgcaInputCard')).toBeNull(); expect(wrapper.parentNode).toBe(origin); expect(wrapper.hidden).toBe(true);
    expect(field.getAttribute('aria-describedby')).toBe('original-help'); expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(doc.documentElement.getAttribute('data-clcr-mgca-active')).toBeNull();
    ui.sync(doc, { active: true });
    expect(field.value).toBe('2'); expect(doc.getElementById('MGCA_collectionHours').value).toBe('12');
    expect(doc.getElementById('MGCA_durationKnown').value).toBe('false');
  });
  it('does not manufacture a confirmation from explicitly blank imported facts', () => {
    const { doc } = fixture(); ui.ensureControls(doc);
    doc.getElementById('MGCA_sameSpecimen').value = ''; doc.getElementById('MGCA_durationKnown').value = '';
    ui.sync(doc, { active: true });
    expect(doc.getElementById('MGCA_sameSpecimen').value).toBe(''); expect(doc.getElementById('MGCA_durationKnown').value).toBe('');
    expect(doc.getElementById('mgcaInputCard').textContent).toContain('Przyjmujemy');
  });
});
