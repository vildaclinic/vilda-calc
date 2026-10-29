import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
loadBrowserScript('clcr_mg_dzm_ui.js', browser);
const ui = browser.ClcrMgDzmUi;
const model = (patch = {}) => ({
  schema: 'clcr-mg-dzm', version: 1, engineVersion: 1, valid: true,
  rawValue: 49.13, value: 49.13, unit: 'mg/1,73 m²/24 h', dailyMg: 30, perKg: 1, indexed: 49.13,
  input: { mode: 'concentration', concentration: '20', volume: '1500', weightKg: '30', heightCm: '135', ageYears: 10, hours: '24' },
  populationCategory: 'child', display: { text: '49,13', boundary: '' },
  status: 'low', statusText: 'Obniżone wydalanie magnezu', tone: 'warning', outOfRange: true,
  interpretation: 'Komentarz z utrwalonego modelu.', cautions: [],
  referenceAvailable: true, referenceActive: true, referenceLabel: 'Próg pediatryczny', referenceText: '>88',
  referenceHint: 'Pomocniczo w ocenie kamicy', reference: { kind: 'lower', lower: 88, lowerInclusive: false, upper: null, unit: 'mg/1,73 m²/24 h' },
  dailyDisplay: '30', referenceRows: [{ label: 'Profil z danych', text: '>88', unit: 'mg/1,73 m²/24 h', active: true }],
  educationalReferences: [{ label: 'Inny cel w ocenie kamicy', text: '<3', unit: 'mmol/24 h' }],
  notes: { sourceSummary: 'Źródło wybranego progu.', collection: 'Pełna zbiórka z podanego czasu.', formula: 'Wzór z silnika.' },
  sources: [{ label: 'Źródło z modelu', url: 'https://example.org/reference' }],
  ...patch,
});
const visible = html => html.replace(/data-clcr-mg-dzm-snapshot="[^"]*"/g, '');
const main = html => visible(html).split('<details')[0];

describe('Mg DZM — pojedynczy wynik, źródłowa jednostka i czytelne odniesienie', () => {
  it('przekazuje dokładną liczbę i pełny snapshot, a próg dolny pokazuje w jednostce wyniku', () => {
    const html = ui.renderResult(model()), card = main(html);
    expect(card).toContain('data-clcr-series="Mg_mgkg"');
    expect(card).toContain('data-clcr-value="49.13"');
    expect(card).toContain('data-clcr-assessment="outside"');
    expect(card).toContain('data-clcr-tone="warning"');
    expect(card).toContain('data-clcr-reference-kind="lower"');
    expect((card.match(/class="clcr-result-value"/g) || [])).toHaveLength(1);
    expect(card).toContain('>49,13</strong>');
    expect(card).toContain('>&gt;88</strong>');
    expect(card).toContain('class="mg-dzm-reference-unit">mg/1,73 m²/24 h</span>');
    expect(card).toContain('W całej dobie: <strong>30 mg/24 h</strong>');
    expect(card).toContain('Źródło wybranego progu.');
    expect(card).toContain('class="mg-dzm-range-normal"');
    expect(card).toContain('width="100%" height="78"');
    expect(card).not.toContain('viewBox=');
    const snapshot = JSON.parse(html.match(/data-clcr-mg-dzm-snapshot="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
    expect(snapshot).toEqual(model());
    expect(card).not.toContain('style=');
  });

  it('dorosły ma pojedynczy wynik dobowy i przedział bez zbędnego drugiego wyniku na kg', () => {
    const card = main(ui.renderResult(model({ rawValue: 120, value: 120, dailyMg: 120, perKg: 2, indexed: null,
      unit: 'mg/24 h', display: { text: '120' }, status: 'within', tone: 'normal', outOfRange: false,
      referenceLabel: 'Norma dla wieku', referenceText: '51–269', reference: { kind: 'interval', lower: 51, upper: 269 } })));
    expect(card).toContain('>120</strong>');
    expect(card).toContain('>51–269</strong>');
    expect(card).toContain('class="mg-dzm-reference-unit">mg/24 h</span>');
    expect(card).toContain('data-clcr-assessment="within"');
    expect(card).not.toContain('mg-dzm-equivalent');
    expect(card).not.toContain(' out-of-range');
  });

  it.each(['zero', 'unassessed'])('neutralne %s nie pokazuje nieaktywnej normy, wykresu ani źródła oceny', status => {
    const card = main(ui.renderResult(model({ status, rawValue: 0, display: { text: '0' }, referenceActive: false,
      tone: 'neutral', outOfRange: null })));
    expect(card).toContain('data-clcr-assessment="unassessed"');
    expect(card).toContain('data-clcr-tone="neutral"');
    expect(card).toContain('Brak normy do porównania');
    expect(card).not.toContain('mg-dzm-range-visual');
    expect(card).not.toContain('mg-dzm-reference-source');
    expect(card).not.toContain('class="mg-dzm-reference-unit"');
    expect(card).not.toContain(' out-of-range');
  });

  it('nie zaokrągla ponownie wartości pokazanej, równoważnika ani małej liczby', () => {
    expect(main(ui.renderResult(model({ rawValue: 88.00000001, display: { text: '88,00000001' } })))).toContain('>88,00000001</strong>');
    expect(main(ui.renderResult(model({ rawValue: 1e-20, display: { text: '1e-20' } })))).toContain('>1e-20</strong>');
    expect(main(ui.renderResult(model({ dailyMg: 1.0000000000000002, dailyDisplay: '1,0000000000000002' })))).toContain('1,0000000000000002 mg/24 h</strong>');
    const extreme = main(ui.renderResult(model({ rawValue: Number.MAX_VALUE, display: { text: '1,7976931348623157e+308' } })));
    expect(extreme).not.toContain('NaN');
    expect(extreme).not.toContain('Infinity');
  });

  it.each(['missing-concentration', 'invalid-hours'])('nie zapisuje wyniku przy %s', errorCode => {
    const html = ui.renderResult(model({ valid: false, rawValue: null, errorCode, error: 'Sprawdź dane z modelu.' }));
    expect(html).toContain('Sprawdź dane z modelu.');
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-mg-dzm-snapshot=');
  });

  it('inne zastosowania opisuje tylko w Szczegółach i nie dodaje odrzuconego kontekstu klinicznego', () => {
    const html = visible(ui.renderResult(model())), [card, details] = html.split('<details');
    expect(card).not.toContain('Inny cel w ocenie kamicy');
    expect(details).toContain('Profil z danych');
    expect(details).toContain('Inny cel w ocenie kamicy');
    expect(details).toContain('Wzór z silnika.');
    expect(details).toContain('https://example.org/reference');
    expect(details).toContain('class="mg-dzm-current-reference"');
    expect(html).not.toMatch(/hipomagnez|MG_clinicalMode|hypomagnesemia/i);
  });

  it('ucieka treść modelu i nie tworzy wykonywalnych odsyłaczy', () => {
    const html = ui.renderResult(model({ interpretation: '<script>attack()</script>',
      referenceRows: [{ label: '<img src=x>', text: '" onclick="attack()' }],
      sources: [{ label: '<img src=x>', url: 'javascript:attack()' }] }));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;script&gt;attack()&lt;/script&gt;');
  });

  it('renderuje rzeczywisty model silnika bez własnych norm lub odrzuconego kontekstu', () => {
    const actual = {};
    for (const file of ['clcr_clinical_safety.js', 'clcr_extended_egfr.js', 'clcr_mg_dzm_reference_data.js', 'clcr_mg_dzm.js']) loadBrowserScript(file, actual);
    const result = actual.VildaClcrMgDzm.evaluate({ mode: 'concentration', concentration: '20', concentrationUnit: 'mg/L',
      volume: '1500', volumeUnit: 'mL', weightKg: '30', heightCm: '135', ageYears: 10, sex: 'M', hours: '24' }, actual.ClcrMgDzmReferenceData.DEFAULT_POLICY);
    const html = visible(ui.renderResult(result)), card = main(html);
    expect(result.valid).toBe(true);
    expect(card).toContain(`data-clcr-value="${result.rawValue}"`);
    expect(card).toContain('>49,13</strong>');
    expect(card).toContain('>&gt;88</strong>');
    expect(card).toContain('W całej dobie: <strong>30 mg/24 h</strong>');
    expect(card).toContain('Może wiązać się z małą podażą lub słabym wchłanianiem magnezu; sam wynik nie rozpoznaje niedoboru magnezu.');
    expect(html).toContain('Pięta');
    expect(html).not.toMatch(/hipomagnez|MG_clinicalMode|hypomagnesemia/i);
  });
});

// Extend the small existing DOM fixture only with browser primitives used by
// this mountable view. No framework or new dependency is introduced.
function documentFixture() {
  const doc = atrapaDokumentu(), create = doc.createElement;
  const enhance = node => {
    node.dataset = new Proxy({}, { set(_, key, value) { node.setAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, value); return true; },
      get(_, key) { return node.getAttribute(`data-${String(key).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`); } });
    node.append = (...nodes) => nodes.forEach(child => node.appendChild(child));
    node.closest = selector => { for (let current = node; current; current = current.parentNode) if (current.tagName.toLowerCase() === selector) return current; return null; };
    node.removeEventListener = (type, listener) => node.sluchacze.set(type, (node.sluchacze.get(type) || []).filter(item => item !== listener));
    node.dispatchEvent = event => node.dispatch(event.type);
    return node;
  };
  doc.createElement = tag => enhance(create(tag));
  doc.createComment = text => { const node = doc.createElement('comment'); node.textContent = text; return node; };
  enhance(doc.documentElement); enhance(doc.body);
  doc.defaultView = { Event: class Event { constructor(type) { this.type = type; } },
    ClcrMgDzmReferenceData: { DEFAULT_POLICY: {} }, VildaClcrMgDzm: {
      readInputFromDocument: documentRef => ({ mode: documentRef.getElementById('MG_inputMode').value, reportedUnit: documentRef.getElementById('MG_reportedUnit').value, ageYears: 10 }),
      evaluate: input => ({ valid: true, input, populationCategory: 'child' }),
    } };
  const form = doc.createElement('form'); form.id = 'clcrForm'; doc.body.append(form);
  const shared = {};
  for (const [id, value] of [['weight', '30'], ['height', '135']]) {
    const wrapper = doc.createElement('label'), control = doc.createElement('input'); control.id = id; control.value = value;
    control.setAttribute('aria-describedby', `${id}OriginalHelp`); wrapper.append(control); form.append(wrapper); shared[id] = { control, wrapper };
  }
  const clear = doc.createElement('div'); clear.id = 'clearContainer'; form.append(clear);
  for (const [id, value] of [['U_Mg', '17'], ['V24', '999']]) { const control = doc.createElement('input'); control.id = id; control.value = value; form.append(control); }
  return { doc, form, clear, ...shared };
}

describe('Mg DZM — tryby, wspólne dane pacjenta i czas', () => {
  it('rejestruje własne kontrolki raz, bez przepisywania wznowionych wartości i innych obliczeń', () => {
    const { doc } = documentFixture();
    expect(ui.ensureControls(doc)).toHaveLength(9);
    expect(doc.getElementById('MG_inputMode').value).toBe('concentration');
    expect(doc.getElementById('MG_collectionHours').value).toBe('24');
    expect(doc.getElementById('MG_collectionSource').value).toBe('assumed-24h');
    expect(doc.getElementById('MG_concentrationUnit').children.map(option => option.textContent)).toEqual(['mg/L', 'mmol/L', 'mg/dL']);
    doc.getElementById('MG_concentration').value = '123'; ui.ensureControls(doc);
    expect(doc.body.querySelectorAll('#MG_concentration')).toHaveLength(1);
    expect(doc.getElementById('MG_concentration').value).toBe('123');
    expect(doc.getElementById('U_Mg').value).toBe('17');
    expect(doc.getElementById('V24').value).toBe('999');
    expect(doc.getElementById('MG_clinicalMode')).toBeNull();
  });

  it('po zmianie trybu zachowuje próbkę i oddaje oba wspólne pola z oryginalnymi atrybutami', () => {
    const { doc, form, weight, height } = documentFixture();
    const controls = ui.ensureControls(doc), fieldViews = new Map(controls.map(control => [control.id, { control, wrapper: control.parentNode }]));
    for (const [id, view] of [['weight', weight], ['height', height]]) fieldViews.set(id, view);
    let changes = 0; form.addEventListener('change', () => { changes += 1; });
    ui.sync(doc, { active: true, fieldViews });
    expect(doc.getElementById('mgDzmPatientDataEditor').hidden).toBe(true);
    expect(doc.getElementById('mgDzmInputCard').querySelector('.mg-dzm-context-value').textContent).toBe('30 kg · 135 cm');
    doc.getElementById('mgDzmInputCard').querySelector('[data-mg-dzm-mode="reported"]').click();
    expect(doc.getElementById('MG_inputMode').value).toBe('reported'); expect(changes).toBe(1);
    expect(doc.getElementById('MG_concentration').closest('label').parentNode.parentNode.parentNode.hidden).toBe(true);
    expect(doc.getElementById('U_Mg').value).toBe('17'); expect(doc.getElementById('V24').value).toBe('999');
    ui.restore(doc);
    for (const [id, view] of [['weight', weight], ['height', height]]) {
      expect(view.wrapper.parentNode).toBe(form);
      expect(view.control.getAttribute('aria-describedby')).toBe(`${id}OriginalHelp`);
    }
    expect(weight.control.value).toBe('30'); expect(height.control.value).toBe('135');
    expect(doc.getElementById('mgDzmInputCard')).toBeNull();
    expect(doc.documentElement.hasAttribute('data-clcr-mg-dzm-active')).toBe(false);
  });

  it('dorosłemu nie pokazuje masy ani wzrostu, jeśli ich nie potrzebuje do samej liczby', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    doc.defaultView.VildaClcrMgDzm.evaluate = input => ({ valid: true, populationCategory: 'adult', input: { ...input, ageYears: 40 } });
    ui.sync(doc, { active: true });
    expect(doc.getElementById('mgDzmPatientDataEditor').hidden).toBe(true);
    expect(doc.getElementById('mgDzmInputCard').querySelector('.mg-dzm-context-row').hidden).toBe(true);
  });

  it('pusty czas zachowuje domyślne 24 w podsumowaniu bez otwierania kolejnego pytania', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc); doc.getElementById('MG_collectionHours').value = '';
    ui.sync(doc, { active: true });
    expect(doc.getElementById('mgDzmDurationEditor').hidden).toBe(true);
    expect(doc.getElementById('mgDzmInputCard').querySelectorAll('.mg-dzm-context-value')[1].textContent).toBe('24 godz.');
  });

  it('jawny problem zbiórki ukrywa ogólne założenie i pokazuje informację z silnika', () => {
    const { doc } = documentFixture(); ui.ensureControls(doc);
    doc.defaultView.VildaClcrMgDzm.evaluate = input => ({ valid: false, input, blocked: true, errorCode: 'collection-conflict', error: 'Podano problem kompletności zbiórki.' });
    ui.sync(doc, { active: true });
    expect(doc.getElementById('mgDzmInputCard').querySelector('.mg-dzm-assumption').hidden).toBe(true);
    expect(doc.getElementById('mgDzmInputError').textContent).toBe('Podano problem kompletności zbiórki.');
  });
});
