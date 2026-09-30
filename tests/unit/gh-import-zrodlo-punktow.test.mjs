import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-GH-ZRODLO (2026-09-30). Mostek importTherapyPointsToAdvancedGrowth (vilda_advanced_growth.js)
// bierze punkty terapii GH WYŁĄCZNIE z pamięci modułu GH_THERAPY_POINTS bieżącego pacjenta —
// tej samej, którą czyta monitor GH i którą ustawia wczytanie pacjenta (applyLoadedData).
// Pomocnicza kopia w IndexedDB (getTherapyPointsFromDB) nie jest już źródłem punktów,
// niezależnie od rodzaju pamięci zwracanego przez adapter.
//
// Test woła PRAWDZIWY mostek modułu na atrapie DOM (kontener #advMeasurements, wiersze .adv-*).
// Dane wyłącznie FIKCYJNE.

const ma = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const POLA = ['.adv-age-years', '.adv-age-months', '.adv-height', '.adv-weight', '.adv-bone-age'];

function wiersz() {
  const attrs = {};
  const inputs = {};
  POLA.forEach((s) => { inputs[s] = { value: '', disabled: false, setAttribute() {} }; });
  const r = {
    nodeType: 1, className: 'measure-row', dataset: {}, isConnected: false, parentElement: null,
    getAttribute: (n) => (ma(attrs, n) ? attrs[n] : null),
    setAttribute: (n, v) => { attrs[n] = String(v); },
    removeAttribute: (n) => { delete attrs[n]; },
    hasAttribute: (n) => ma(attrs, n),
    querySelector: (sel) => inputs[sel] || null,
    querySelectorAll: () => [],
    remove() { if (r.parentElement) r.parentElement.removeChild(r); },
    matches: (sel) => sel === '.measure-row',
    _inputs: inputs,
  };
  return r;
}

function kontener(id) {
  const c = {
    id, children: [],
    appendChild(n) { if (n.parentElement && n.parentElement !== c) n.parentElement.removeChild(n); n.parentElement = c; n.isConnected = true; c.children.push(n); return n; },
    removeChild(n) { const i = c.children.indexOf(n); if (i >= 0) c.children.splice(i, 1); n.parentElement = null; n.isConnected = false; return n; },
    querySelectorAll() { return c.children.slice(); },
    querySelector() { return c.children[0] || null; },
  };
  return c;
}

function srodowisko(adapter) {
  const advC = kontener('advMeasurements');
  const doc = {
    readyState: 'complete', addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    getElementById: (id) => (id === 'advMeasurements' ? advC : null),
    querySelectorAll: () => [],
    querySelector: () => null,
  };
  const win = {
    document: doc, setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { pathname: '/index.html' },
    Event: class Event { constructor(type) { this.type = type; } },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = (init || {}).detail; } },
  };
  win.window = win; win.self = win; win.globalThis = win;
  if (adapter) win.VildaPersistence = adapter;
  loadBrowserScript('vilda_advanced_growth.js', win);
  return { win, advC };
}

// Pamięć modułu bieżącego pacjenta: jeden punkt 13 l. 1 mies. / 139,9 cm.
const PUNKT_MODULU = { id: 'gh-modul-1', type: 'continue', ageYears: 13, ageMonths: 1, height: 139.9, weight: 45, dose: 0.033, doseUnit: 'mg/kg/d', drug: 'Omnitrope 5 mg', program: 'SNP' };
// Inna lista w pomocniczej kopii IndexedDB: punkt 11 l. 2 mies. / 141,7 cm.
const PUNKT_KOPII = { id: 'gh-kopia-1', type: 'start', ageYears: 11, ageMonths: 2, height: 141.7, weight: 36.3, dose: 0.033, doseUnit: 'mg/kg/d', drug: 'Omnitrope 5 mg', program: 'SNP' };

function opcje(env, pamiecModulu, kopiaDb) {
  const slad = { db: 0, zapisy: [] };
  const o = {
    isGhAdvancedImportSuppressed: () => false,
    getTherapyPointsFromDB: async () => { slad.db += 1; return JSON.parse(JSON.stringify(kopiaDb)); },
    readGhTherapyPointsFromModuleStorage: () => JSON.parse(JSON.stringify(pamiecModulu)),
    writeGhTherapyPointsToModuleStorage: (lista) => { slad.zapisy.push(lista.map((p) => p.id)); return true; },
    addAdvMeasurementRow: () => { env.advC.appendChild(wiersz()); },
    updateRemoveButtons: () => {},
    calculateGrowthAdvanced: () => {},
    getUserBasics: () => ({ ageMonths: 168, height: 148.5, weight: 50.5 }),
  };
  return { o, slad };
}

const wierszeGh = (env) => env.advC.children
  .filter((r) => r.getAttribute('data-gh-id'))
  .map((r) => ({ id: r.getAttribute('data-gh-id'), h: r._inputs['.adv-height'].value, y: r._inputs['.adv-age-years'].value, m: r._inputs['.adv-age-months'].value }));

const RODZAJE_PAMIECI = [
  ['bez adaptera pamięci', null],
  ['adapter: pamięć sesji', { patientScopedStorageType: () => 'session' }],
  ['adapter: pamięć lokalna', { patientScopedStorageType: () => 'local' }],
];

describe('P-GH-ZRODLO — mostek punktów GH czyta wyłącznie pamięć modułu bieżącego pacjenta', () => {
  for (const [opis, adapter] of RODZAJE_PAMIECI) {
    it(`${opis}: wiersze GH, window.ghTherapyPoints i zapis modułu pochodzą z pamięci modułu, kopia IndexedDB nie jest pytana`, async () => {
      const env = srodowisko(adapter);
      const { o, slad } = opcje(env, [PUNKT_MODULU], [PUNKT_KOPII]);
      await env.win.VildaAdvancedGrowth.importTherapyPointsToAdvancedGrowth(o);
      expect(slad.db, 'kopia w IndexedDB nie jest źródłem punktów').toBe(0);
      expect(env.win.ghTherapyPoints.map((p) => p.id)).toEqual(['gh-modul-1']);
      expect(slad.zapisy).toEqual([['gh-modul-1']]);
      expect(wierszeGh(env)).toEqual([{ id: 'gh-modul-1', h: '139.9', y: '13', m: '1' }]);
    });
  }

  it('pusta pamięć modułu: brak wierszy GH i pusta lista, nawet gdy kopia w IndexedDB zawiera punkty', async () => {
    const env = srodowisko({ patientScopedStorageType: () => 'local' });
    const { o, slad } = opcje(env, [], [PUNKT_KOPII]);
    await env.win.VildaAdvancedGrowth.importTherapyPointsToAdvancedGrowth(o);
    expect(slad.db).toBe(0);
    expect(env.win.ghTherapyPoints).toEqual([]);
    expect(slad.zapisy).toEqual([[]]);
    expect(wierszeGh(env)).toEqual([]);
  });
});
