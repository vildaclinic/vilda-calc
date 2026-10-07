import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-WIEK-KOSTNY-WIZYTA. Rzeczywiste moduły zapisu, odtwarzania i monitora GH;
// atrapa wyłącznie przeglądarki. Wszystkie pomiary i nazwa pacjenta są fikcyjne.
const clone = (value) => JSON.parse(JSON.stringify(value));
const study = (atAgeMonths = 123) => ({ years: 9, atAgeMonths, dateISO: null, source: 'measured' });
const context = (current, last = null) => ({ version: 1, current, last });

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}
function target() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter((other) => other !== fn)); },
    dispatchEvent(event) { (listeners.get(event.type) || []).forEach((fn) => fn(event)); return true; },
  };
}
function environment(withGh = false) {
  const fields = new Map();
  const doc = { ...target(), readyState: 'complete', activeElement: null, querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => fields.get(id) || null };
  const element = (id = '') => {
    const field = {
      ...target(), id, value: '', checked: false, dataset: {}, style: {}, children: [], type: 'text',
      classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
      setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
      querySelector: () => null, querySelectorAll: () => [], closest: () => null,
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      removeChild(child) { this.children = this.children.filter((other) => other !== child); },
      focus() { doc.activeElement = this; },
    };
    const dispatch = field.dispatchEvent;
    field.dispatchEvent = (event) => { if (!event.target) event.target = field; dispatch(event); if (event.bubbles) doc.dispatchEvent(event); return true; };
    if (id) fields.set(id, field);
    return field;
  };
  doc.createElement = () => element();
  doc.body = element();
  doc.documentElement = element();
  ['age', 'ageMonths', 'height', 'weight', 'sex', 'name', 'advName', 'advBoneAge', 'therDailyDose', 'therDrug', 'therProg'].forEach(element);
  Object.entries({ age: '10', ageMonths: '3', height: '141', weight: '32', sex: 'M', name: 'Fikcyjny Test BA', advName: 'Fikcyjny Test BA', therDailyDose: '0.033', therDrug: 'Omnitrope 5 mg', therProg: 'SNP' }).forEach(([id, value]) => { fields.get(id).value = value; });
  const modules = new Map();
  const win = {
    ...target(), document: doc, localStorage: storage(), sessionStorage: storage(),
    location: { pathname: '/index.html', hash: '' }, console, confirm: () => true,
    Event: class Event { constructor(type, options) { this.type = type; this.bubbles = !!options?.bubbles; this.isTrusted = false; } },
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; this.isTrusted = false; } },
    setTimeout: () => 1, clearTimeout() {},
    vildaOnReady: (_key, fn) => fn(),
    VildaPersistence: { readModuleJSON: (key, fallback) => clone(modules.get(key) ?? fallback), writeModuleJSON: (key, value) => { modules.set(key, clone(value)); return true; }, patientScopedStorageType: () => 'session' },
  };
  win.window = win; win.self = win; win.parent = win; win.top = win; win.globalThis = win;
  loadBrowserScript('vilda_bone_age.js', win);
  loadBrowserScript('vilda_data_import_export.js', win);
  if (withGh) {
    // Jak docpro.html: wspólne API punktów GH (z modułem dawki) przed monitorem; bez niego monitor nie zapisuje punktu
    // (P-GH-PUNKTY-API rata 3).
    loadBrowserScript('vilda_gh_punkty.js', win);
    const source = fs.readFileSync(new URL('../../gh_therapy_monitor.js', import.meta.url), 'utf8');
    new Function('window', 'globalThis', 'document', 'sessionStorage', 'localStorage', 'setTimeout', 'location', 'CustomEvent', source)(win, win, doc, win.sessionStorage, win.localStorage, win.setTimeout, win.location, win.CustomEvent);
  }
  const edit = (id, value) => {
    const field = fields.get(id);
    field.value = String(value);
    const event = { type: 'input', target: field, isTrusted: true };
    field.dispatchEvent(event);
    doc.dispatchEvent(event);
  };
  return { win, fields, edit, api: win.VildaDataImportExport, ba: win.VildaBoneAge };
}
function record(advanced = {}) {
  return {
    name: 'Fikcyjny Test BA', user: { sex: 'M', age: 10, ageMonths: 3, height: 141, weight: 32 },
    advanced: { boneAgeYears: 9, data: { boneAgeMonths: 108, measurements: [] }, ...clone(advanced) },
  };
}
const options = { showRestoreButton() {}, syncSharedUserDataFromLoadedData() {}, rehydrateAdvancedFromState() {}, debouncedUpdate() {}, showLoadDataMessage() {} };
function newVisit(env) {
  env.edit('age', 10); env.edit('ageMonths', 5); env.edit('height', 142); env.edit('weight', 33);
}

describe('P-WIEK-KOSTNY-WIZYTA — badanie należy do wizyty, a poprzednie BA pozostaje kontekstem', () => {
  it('zwykłe wczytanie do nowego pomiaru czyści pole BA i zachowuje wynik przy wieku poprzedniej wizyty', () => {
    const env = environment();
    env.api.applyLoadedData(record(), options);
    expect(env.fields.get('advBoneAge').value).toBe('');
    expect(env.ba.capture().current).toBeNull();
    expect(env.ba.capture().last).toMatchObject({ years: 9, atAgeMonths: 123 });
  });

  it('kolektor po dwóch miesiącach zapisuje null dla nowego badania, oddzielnie poprzedni wynik i efektywne BA', () => {
    const env = environment();
    env.api.applyLoadedData(record(), options); newVisit(env);
    const saved = env.api.collectUserData();
    expect(saved.advanced.boneAgeYears).toBeNull();
    expect(saved.advanced.boneAgeContext.current).toBeNull();
    expect(saved.advanced.boneAgeContext.last).toMatchObject({ years: 9, atAgeMonths: 123 });
    expect(saved.advanced.data.boneAgeContext).toEqual(saved.advanced.boneAgeContext);
    expect(saved.advanced.data.boneAgeMonths).toBe(108);
  });

  it('Odtwórz zapis odtwarza BA bieżącej zapisanej wizyty', () => {
    const env = environment();
    env.api.applyLoadedData(record(), options);
    env.api.restoreLoadedState({ ...options, data: record() });
    const saved = env.api.collectUserData();
    expect(env.fields.get('advBoneAge').value).toBe('9');
    expect(saved.advanced.boneAgeYears).toBe(9);
    expect(saved.advanced.boneAgeContext.current).toMatchObject({ years: 9, atAgeMonths: 123 });
  });

  it('odtworzenie sesji nowej wizyty zachowuje puste pole i zakotwiczenie wcześniejszego badania', () => {
    const env = environment();
    const payload = record({ boneAgeYears: null, boneAgeContext: context(null, study()), data: { boneAgeMonths: 108, boneAgeContext: context(null, study()), measurements: [] } });
    payload.user.ageMonths = 5;
    env.api.applyLoadedData(payload, { ...options, isSessionRestore: true });
    expect(env.fields.get('advBoneAge').value).toBe('');
    const saved = env.api.collectUserData();
    expect(saved.user.ageMonths).toBe(5);
    expect(saved.advanced.boneAgeYears).toBeNull();
    expect(saved.advanced.boneAgeContext.last).toEqual(study());
  });

  it('przeniesienie wizyty bez nowego BA do historii nie używa efektywnego BA do obliczeń', () => {
    const env = environment();
    const payload = record({ boneAgeYears: null, boneAgeContext: context(null, study()) });
    payload.user.ageMonths = 5;
    env.api._ensureCurrentMeasurementInHistory(payload);
    expect(payload.advanced.data.measurements).toHaveLength(1);
    expect(payload.advanced.data.measurements[0].ageMonths).toBe(125);
    expect(payload.advanced.data.measurements[0].boneAgeYears).toBeUndefined();
    expect(payload.growthBasic.data.measurements[0].boneAgeYears).toBeUndefined();
  });

  it('wynik przypisany do poprzedniego wieku nie staje się wynikiem następnej wizyty', () => {
    const env = environment();
    const payload = record({ boneAgeContext: context(study()) });
    payload.user.ageMonths = 5;
    env.api._ensureCurrentMeasurementInHistory(payload);
    expect(payload.advanced.data.measurements[0].boneAgeYears).toBeUndefined();
  });

  it('rzeczywiście powtórzone badanie o tej samej wartości pozostaje przy dwóch osobnych wizytach', () => {
    const env = environment();
    const first = record({ boneAgeContext: context(study()) });
    env.api.applyLoadedData(first, options);
    // Tak jak wybór „Nowy pomiar”: poprzednią wizytę dopisujemy po wczytaniu.
    env.api._ensureCurrentMeasurementInHistory(env.win.lastLoadedData);
    env.win.advancedGrowthData.measurements = clone(env.win.lastLoadedData.advanced.data.measurements);
    newVisit(env); env.edit('advBoneAge', 9);
    const second = env.api.collectUserData();
    env.api._ensureCurrentMeasurementInHistory(second);
    expect(second.advanced.boneAgeContext.current).toMatchObject({ years: 9, atAgeMonths: 125 });
    expect(second.advanced.data.measurements.map((row) => [row.ageMonths, row.boneAgeYears])).toEqual([[123, 9], [125, 9]]);
  });

  it('nowe badanie aktualizuje także efektywne BA w zapisanym stanie obliczeń', () => {
    const env = environment();
    env.api.applyLoadedData(record(), options); newVisit(env); env.edit('advBoneAge', 9.5);
    const saved = env.api.collectUserData();
    expect(saved.advanced.boneAgeYears).toBe(9.5);
    expect(saved.advanced.boneAgeContext.current).toMatchObject({ years: 9.5, atAgeMonths: 125, source: 'measured' });
    expect(saved.advanced.data.boneAgeMonths).toBe(114);
  });

  it('historyczny payload bez kontekstu zachowuje dotychczasowy zapis BA', () => {
    const env = environment();
    const payload = record();
    env.api._ensureCurrentMeasurementInHistory(payload);
    expect(payload.advanced.data.measurements[0].boneAgeYears).toBe(9);
    delete payload.advanced.boneAgeYears;
    env.api._ensureCurrentMeasurementInHistory(payload);
    expect(payload.advanced.data.measurements[0].boneAgeYears).toBe(9);
  });

  it('Wyczyść wszystkie pola usuwa również kontekst wcześniejszego pacjenta', () => {
    const env = environment();
    env.api.applyLoadedData(record(), options);
    env.api.clearAllData({ ...options, confirm: () => true });
    expect(env.ba.capture().current).toBeNull();
    expect(env.ba.capture().last).toBeNull();
  });

  it('strona bez pola BA i bez kontekstu nie wytwarza jawnego pustego badania podczas zbierania danych', () => {
    const env = environment();
    env.fields.delete('advBoneAge');
    env.win.vildaKowdData = { boneAgeYears: 9 };
    const saved = env.api.collectUserData();
    expect(saved.advanced.boneAgeYears).toBe(9);
    expect(saved.advanced.boneAgeContext).toBeUndefined();
    expect(env.win.vildaBoneAgeContext).toBeUndefined();
  });

  it('strona bez pola BA zachowuje dostępny kontekst badania z danych sesji', () => {
    const env = environment();
    env.fields.delete('advBoneAge');
    env.win.advancedGrowthData = { measurements: [], boneAgeContext: context(null, study()), boneAgeMonths: 108 };
    const saved = env.api.collectUserData();
    expect(saved.advanced.boneAgeYears).toBeNull();
    expect(saved.advanced.boneAgeContext).toEqual(context(null, study()));
    expect(saved.advanced.data.boneAgeContext).toEqual(context(null, study()));
    expect(saved.advanced.data.boneAgeMonths).toBe(108);
  });

  it('punkt GH dodany w nowej wizycie nie dziedziczy poprzedniego BA', () => {
    const env = environment(true);
    env.api.applyLoadedData(record(), options); newVisit(env);
    env.win.ghAddTherapyPoint('continue');
    expect(env.win.ghTherapyPoints).toHaveLength(1);
    expect(env.win.ghTherapyPoints[0].boneAge).toBeNull();
  });

  it('punkt GH zachowuje jawnie ponownie wpisane BA bieżącej wizyty', () => {
    const env = environment(true);
    env.api.applyLoadedData(record(), options); newVisit(env); env.edit('advBoneAge', 9);
    env.win.ghAddTherapyPoint('continue');
    expect(env.win.ghTherapyPoints[0].boneAge).toBe(9);
    expect(env.win.ghTherapyPoints[0].ageMonths).toBe(5);
  });

  it('punkt GH nie kopiuje widocznego wyniku badania przypisanego do innego wieku', () => {
    const env = environment(true);
    env.api.applyLoadedData(record({ boneAgeContext: context(study()) }), { ...options, isSessionRestore: true });
    env.edit('ageMonths', 5);
    env.win.ghAddTherapyPoint('continue');
    expect(env.win.ghTherapyPoints).toHaveLength(1);
    expect(env.win.ghTherapyPoints[0].boneAge).toBeNull();
  });
});
