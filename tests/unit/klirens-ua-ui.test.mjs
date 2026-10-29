import { describe, expect, it } from 'vitest';
import { atrapaDokumentu } from '../support/atrapa-dom-lekka.mjs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const browser = {};
loadBrowserScript('clcr_ua_ui.js', browser);
const ui = browser.ClcrUaUi;
loadBrowserScript('clcr_ua_reference_data.js', browser);
loadBrowserScript('clcr_ua.js', browser);
const model = (patch = {}) => ({
  schema: 'clcr-ua', version: 1, engineVersion: 1, valid: true,
  rawValue: 12, value: 12, unit: 'mg/kg/24 h', dailyMg: 360, perKg: 12,
  input: { mode: 'concentration', concentration: '30', volume: '1200', weightKg: '30', hours: '24' },
  display: { text: '12', boundary: false }, status: 'high', statusText: 'Zwiększone wydalanie',
  tone: 'warning', outOfRange: true, interpretation: 'Komentarz wybranego profilu.', cautions: [],
  referenceAvailable: true, referenceActive: true, referenceLabel: 'Norma dla wieku', referenceText: '<9,3 mg/kg/24 h',
  referenceHint: 'Opis wieku z modelu.', reference: { kind: 'upper', upper: 9.3, upperInclusive: false, unit: 'mg/kg/24 h' },
  referenceRows: [{ label: 'Profil z danych', text: '<9,3', unit: 'mg/kg/24 h', active: true }],
  educationalReferences: [{ label: 'Inny cel z danych', text: 'Próg z polityki' }],
  notes: { sourceSummary: 'Źródło wybranego profilu.', collection: 'Pełna zbiórka z podanego czasu.', formula: 'Wzór z silnika.' },
  sources: [{ label: 'Źródło profilu', url: 'https://example.org/urine' }],
  ...patch,
});
const visible = html => html.replace(/data-clcr-ua-snapshot="[^"]*"/g, '');
const main = html => visible(html).split('<details')[0];

describe('UA — zintegrowany wynik i norma z modelu', () => {
  it('przekazuje jedną liczbę do zapisu, równą jednostkę normy i neutralny opis źródła', () => {
    const html = ui.renderResult(model());
    const card = main(html);
    expect(card).toContain('data-clcr-series="UA_mgkg"');
    expect(card).toContain('data-clcr-value="12"');
    expect(card).toContain('data-clcr-display-unit="mg/kg/24 h"');
    expect(card).toContain('data-clcr-assessment="outside"');
    expect(card).toContain('data-clcr-tone="warning"');
    expect((card.match(/class="clcr-result-value"/g) || [])).toHaveLength(1);
    expect(card).toContain('>12</strong>');
    expect(card).toContain('>&lt;9,3</strong>');
    expect(card).toContain('class="ua-reference-unit">mg/kg/24 h</span>');
    expect(card).toContain('W całej dobie: <strong>360 mg/24 h</strong>');
    expect(card).toContain('class="ua-reference-source">Źródło wybranego profilu.</p>');
    expect(card).toContain('class="ua-range-normal"');
    expect(card).not.toContain('style=');
    const snapshot = JSON.parse(html.match(/data-clcr-ua-snapshot="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
    expect(snapshot).toEqual(model());
  });

  it('dorosły bez masy ma wynik i zakres mg/24 h bez powtórzenia przeliczenia', () => {
    const card = main(ui.renderResult(model({ rawValue: 360, unit: 'mg/24 h', perKg: null, display: { text: '360' },
      reference: { kind: 'interval', lower: 200, upper: 1000 }, referenceText: '200–1000 mg/24 h',
      outOfRange: false, tone: 'normal', statusText: 'W normie' })));
    expect(card).toContain('data-clcr-display-unit="mg/24 h"');
    expect(card).toContain('>200–1000</strong>');
    expect(card).not.toContain('ua-equivalent');
    expect(card).not.toContain(' out-of-range');
    expect(card).toContain('data-clcr-reference-kind="interval"');
  });

  it.each(['zero', 'unassessed'])('neutralne %s nie pokazuje wykresu ani fałszywego porównania', status => {
    const card = main(ui.renderResult(model({ status, rawValue: 0, display: { text: '0' }, referenceActive: false,
      referenceAvailable: false, reference: null, referenceText: 'Brak normy do porównania', tone: 'neutral', outOfRange: null })));
    expect(card).toContain('data-clcr-assessment="unassessed"');
    expect(card).toContain('data-clcr-tone="neutral"');
    expect(card).not.toContain('ua-range-visual');
    expect(card).not.toContain(' out-of-range');
  });

  it('dokładny tekst granicy i małe liczby zachowuje bez wtórnego zaokrąglenia', () => {
    const card = main(ui.renderResult(model({ rawValue: 9.30000001, display: { text: '9,30000001' } })));
    expect(card).toContain('data-clcr-value="9.30000001"');
    expect(card).toContain('>9,30000001</strong>');
    expect(main(ui.renderResult(model({ rawValue: 1e-20, display: { text: '1e-20' } })))).toContain('>1e-20</strong>');
    expect(main(ui.renderResult(model({ dailyMg: 1.0000000000000002, dailyDisplay: '1,0000000000000002' })))).toContain('1,0000000000000002 mg/24 h</strong>');
  });

  it.each(['missing-weight', 'invalid-hours'])('brak lub błąd %s nie tworzy zapisywalnego wyniku', errorCode => {
    const html = ui.renderResult(model({ valid: false, rawValue: null, errorCode, error: 'Sprawdź dane z modelu.' }));
    expect(html).toContain('Sprawdź dane z modelu.');
    expect(html).not.toContain('data-clcr-series=');
    expect(html).not.toContain('data-clcr-ua-snapshot=');
  });

  it('tabele, wzór i źródła wynikają z modelu, a inne progi pozostają w szczegółach', () => {
    const html = visible(ui.renderResult(model()));
    const [card, details] = html.split('<details');
    expect(card).not.toContain('Inny cel z danych');
    expect(details).toContain('Profil z danych');
    expect(details).toContain('Inny cel z danych');
    expect(details).toContain('Próg z polityki');
    expect(details).toContain('Wzór z silnika.');
    expect(details).toContain('https://example.org/urine');
    expect(details).toContain('class="ua-current-reference"');
  });

  it('ucieka dane modelu i blokuje wykonywalne odsyłacze', () => {
    const html = ui.renderResult(model({ interpretation: '<script>attack()</script>',
      referenceRows: [{ label: '<img src=x>', text: '" onclick="attack()' }],
      sources: [{ label: '<img src=x>', url: 'javascript:attack()' }] }));
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x>');
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('&lt;script&gt;attack()&lt;/script&gt;');
  });

  it('obsługuje produkcyjny model silnika bez dopisywania nieistniejącego problemu zbiórki', () => {
    const result = browser.VildaClcrUa.evaluate({ mode: 'concentration', concentration: '30', concentrationUnit: 'mg/dL',
      volume: '1200', volumeUnit: 'mL', weightKg: '30', ageYears: '10', hours: '24', sex: 'M' }, browser.ClcrUaReferenceData.DEFAULT_POLICY);
    const html = visible(ui.renderResult(result));
    expect(main(html)).toContain('>12</strong>');
    expect(main(html)).toContain('>&lt;9,3</strong>');
    expect(html).toContain('Dzieci &lt;1 roku');
    expect(html).toContain('Mężczyźni od 18 lat');
    expect(html).not.toContain('Podano problem kompletności lub protokołu zbiórki');
    expect(html).not.toContain('style=');
  });
});

// Extend the repository's deliberately small DOM fixture with the browser APIs
// used by this mountable view; no browser framework or new dependency is needed.
function documentFixture() {
  const doc = atrapaDokumentu();
  const create = doc.createElement;
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
  enhance(doc.documentElement);
  enhance(doc.body);
  doc.defaultView = { Event: class Event { constructor(type) { this.type = type; } },
    ClcrUaReferenceData: { DEFAULT_POLICY: {} }, VildaClcrUa: {
      readInputFromDocument: documentRef => ({ mode: documentRef.getElementById('UA_inputMode').value, reportedUnit: documentRef.getElementById('UA_reportedUnit').value }),
      evaluate: input => ({ valid: true, input, population: 'child' }),
    } };
  const form = doc.createElement('form'); form.id = 'clcrForm'; doc.body.append(form);
  const weightWrapper = doc.createElement('label'); const weight = doc.createElement('input'); weight.id = 'weight'; weight.value = '30';
  weight.setAttribute('aria-describedby', 'originalWeightHelp'); weightWrapper.append(weight); form.append(weightWrapper);
  const clear = doc.createElement('div'); clear.id = 'clearContainer'; form.append(clear);
  const old = doc.createElement('input'); old.id = 'U_UA'; old.value = '17'; form.append(old);
  const volume = doc.createElement('input'); volume.id = 'V24'; volume.value = '999'; form.append(volume);
  return { doc, form, weight, weightWrapper, clear };
}

describe('UA — kontrolki zarejestrowane w formularzu i przywracanie innych wzorów', () => {
  it('tworzy kontrolki tylko raz i nie nadpisuje wznowionej sesji ani pól innych zbiórek', () => {
    const { doc } = documentFixture();
    expect(ui.ensureControls(doc)).toHaveLength(9);
    expect(doc.getElementById('UA_collectionSource').type).toBe('hidden');
    expect(doc.getElementById('UA_collectionSource').value).toBe('assumed-24h');
    expect(doc.getElementById('UA_inputMode').value).toBe('concentration');
    expect(doc.getElementById('UA_collectionHours').value).toBe('24');
    expect(doc.getElementById('UA_concentrationUnit').children.map(option => option.textContent)).toEqual(['mg/dL', 'mg/L', 'mmol/L', 'µmol/L']);
    doc.getElementById('UA_concentration').value = '123';
    ui.ensureControls(doc);
    expect(doc.querySelectorAll?.('#UA_concentration') || doc.body.querySelectorAll('#UA_concentration')).toHaveLength(1);
    expect(doc.getElementById('UA_concentration').value).toBe('123');
    expect(doc.getElementById('U_UA').value).toBe('17');
    expect(doc.getElementById('V24').value).toBe('999');
  });

  it('tryby zmieniają tylko własne pola; masa jest znana, a przywrócenie oddaje wspólne pole', () => {
    const { doc, form, weight, weightWrapper } = documentFixture();
    const controls = ui.ensureControls(doc);
    const fieldViews = new Map(controls.map(control => [control.id, { control, wrapper: control.parentNode }]));
    fieldViews.set('weight', { control: weight, wrapper: weightWrapper });
    const before = weightWrapper.nextSibling;
    let changes = 0;
    form.addEventListener('change', () => { changes += 1; });
    ui.sync(doc, { active: true, fieldViews });
    expect(doc.getElementById('uaWeightEditor').hidden).toBe(true);
    expect(doc.getElementById('uaInputCard').querySelector('.ua-context-value').textContent).toBe('30 kg');
    doc.getElementById('uaInputCard').querySelector('[data-ua-mode="reported"]').click();
    expect(doc.getElementById('UA_inputMode').value).toBe('reported');
    expect(changes).toBe(1);
    expect(doc.getElementById('UA_concentration').closest('label').parentNode.parentNode.parentNode.hidden).toBe(true);
    expect(doc.getElementById('U_UA').value).toBe('17');
    expect(doc.getElementById('V24').value).toBe('999');
    ui.restore(doc);
    expect(weightWrapper.parentNode).toBe(form);
    expect(weightWrapper.nextSibling).toBe(before);
    expect(weight.value).toBe('30');
    expect(weight.getAttribute('aria-describedby')).toBe('originalWeightHelp');
    expect(doc.getElementById('uaInputCard')).toBe(null);
    expect(doc.documentElement.hasAttribute('data-clcr-ua-active')).toBe(false);
    expect(doc.getElementById('UA_inputMode').value).toBe('reported');
  });

  it('dorosłemu bez masy nie otwiera dodatkowego pytania, ale ujawnia pole przy błędnym wpisie', () => {
    const { doc, form, weight } = documentFixture();
    ui.ensureControls(doc);
    weight.value = '';
    const age = doc.createElement('input'); age.id = 'age'; age.value = '40'; form.append(age);
    const sex = doc.createElement('select'); sex.id = 'sex'; sex.value = 'M'; form.append(sex);
    doc.getElementById('UA_concentration').value = '30';
    doc.getElementById('UA_volume').value = '1200';
    doc.defaultView.VildaClcrUa = browser.VildaClcrUa;
    doc.defaultView.ClcrUaReferenceData = browser.ClcrUaReferenceData;
    ui.sync(doc, { active: true });
    expect(doc.getElementById('uaWeightEditor').hidden).toBe(true);
    expect(doc.getElementById('uaInputCard').querySelector('.ua-context-value').textContent).toBe('Nie jest potrzebna do tego wyniku');
    weight.value = '-30';
    ui.refresh(doc);
    expect(doc.getElementById('uaWeightEditor').hidden).toBe(false);
    expect(doc.getElementById('uaInputError').hidden).toBe(false);
    expect(weight.getAttribute('aria-invalid')).toBe('true');
  });

  it('pusty nowy czas nie otwiera pytania, a odtworzenie zachowuje edytor otwarty przez lekarza', () => {
    const { doc, weight } = documentFixture();
    ui.ensureControls(doc);
    weight.value = '';
    doc.getElementById('UA_collectionHours').value = '';
    ui.sync(doc, { active: true });
    expect(doc.getElementById('uaWeightEditor').hidden).toBe(false);
    expect(doc.getElementById('uaDurationEditor').hidden).toBe(true);
    weight.value = '30';
    doc.getElementById('UA_collectionHours').value = '24';
    ui.refresh(doc);
    expect(doc.getElementById('uaWeightEditor').hidden).toBe(true);
    expect(doc.getElementById('uaDurationEditor').hidden).toBe(true);
    doc.getElementById('uaInputCard').querySelector('.ua-context-button').click();
    weight.value = '35';
    ui.refresh(doc);
    expect(doc.getElementById('uaWeightEditor').hidden).toBe(false);
  });

  it('jawny problem zbiórki usuwa ogólne założenie pełnej zbiórki', () => {
    const { doc } = documentFixture();
    ui.ensureControls(doc);
    doc.defaultView.VildaClcrUa.evaluate = input => ({ valid: false, input, blocked: true,
      errorCode: 'collection-conflict', error: 'Podano problem kompletności zbiórki.' });
    ui.sync(doc, { active: true });
    expect(doc.getElementById('uaInputCard').querySelector('.ua-assumption').hidden).toBe(true);
    expect(doc.getElementById('uaInputError').textContent).toBe('Podano problem kompletności zbiórki.');
  });
});
