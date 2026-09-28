import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-GH-TOZSAMOSC rata 1 (decyzja właściciela 2026-09-28): przebudowa tabeli zaawansowanej z modelu
// pomiarów ręcznych nie może kasować wierszy punktów terapii GH (data-gh-sync / data-gh-id). Model
// (be(), ht()) celowo je odsiewa — ich źródłem prawdy jest monitor terapii — więc każda przebudowa
// czyściła kontener i punkt przepadał; po F5 wracał z tabeli spożycia jako bliźniak bez znacznika.
//
// Test woła PRAWDZIWE rehydrateAdvancedFromState i rehydrateAdvancedRowsUIFromState na atrapie DOM
// z jednym wierszem ręcznym i jednym wierszem punktu terapii. Kontrola negatywna dowodzi, że bez
// odłączenia i doklejenia wiersz GH ginie.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (plik) => readFileSync(path.join(korzen, plik), 'utf8');

/* Minimalna atrapa DOM: kontener z dziećmi, wiersze z atrybutami i polami .adv-*. */
function wiersz(pola, atrybuty) {
  const attrs = Object.assign({}, atrybuty || {});
  const inputs = {};
  ['adv-age-years', 'adv-age-months', 'adv-height', 'adv-weight', 'adv-bone-age', 'adv-arrow-comment'].forEach((k) => {
    inputs['.' + k] = { value: pola && pola[k] != null ? String(pola[k]) : '', style: {}, checked: false };
  });
  inputs['.adv-arrow-enable'] = { checked: false, style: {} };
  const r = {
    nodeType: 1, className: 'measure-row', isConnected: false, parentElement: null,
    classList: { contains: (c) => c === 'measure-row' },
    getAttribute: (n) => (Object.prototype.hasOwnProperty.call(attrs, n) ? attrs[n] : null),
    setAttribute: (n, v) => { attrs[n] = String(v); },
    removeAttribute: (n) => { delete attrs[n]; },
    querySelector: (sel) => inputs[sel] || null,
    querySelectorAll: () => [],
    matches: (sel) => {
      if (sel === '.measure-row') return true;
      if (sel === '.measure-row[data-gh-sync="true"]') return attrs['data-gh-sync'] === 'true';
      if (sel === '.measure-row[data-gh-id]') return Object.prototype.hasOwnProperty.call(attrs, 'data-gh-id');
      return false;
    },
    opis() { return { h: inputs['.adv-height'].value, gh: attrs['data-gh-sync'] === 'true', id: attrs['data-gh-id'] || '' }; },
  };
  return r;
}

function kontener() {
  const c = {
    id: 'advMeasurements', children: [],
    appendChild(n) { if (n.parentElement && n.parentElement !== c) n.parentElement.removeChild(n); n.parentElement = c; n.isConnected = true; c.children.push(n); return n; },
    removeChild(n) { const i = c.children.indexOf(n); if (i >= 0) c.children.splice(i, 1); n.parentElement = null; n.isConnected = false; return n; },
    querySelectorAll(sel) { return sel.split(',').map((s) => s.trim()).flatMap((s) => c.children.filter((n) => n.matches(s))).filter((n, i, a) => a.indexOf(n) === i); },
    querySelector(sel) { return c.querySelectorAll(sel)[0] || null; },
    contains(n) { return c.children.includes(n); },
    set textContent(v) { if (v === '') { c.children.forEach((n) => { n.parentElement = null; n.isConnected = false; }); c.children = []; } },
    get textContent() { return ''; },
    set innerHTML(v) { this.textContent = ''; },
  };
  return c;
}

function atrapaOkna() {
  const adv = kontener();
  const win = {
    setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { pathname: '/index.html' },
    Event: class Event { constructor(type) { this.type = type; } },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = (init || {}).detail; } },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    document: {
      readyState: 'complete', addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      getElementById: (id) => (id === 'advMeasurements' ? adv : null),
      querySelector: () => null, querySelectorAll: () => [],
    },
  };
  win.window = win; win.self = win; win.top = win; win.parent = win;
  return { win, adv };
}

/* Stan wyjściowy jak w zgłoszeniu: wiersz ręczny 11 l. / 123,9 cm i punkt terapii 13 l. 1 mies. / 139,9 cm. */
function tabelaZPunktem(adv) {
  adv.appendChild(wiersz({ 'adv-age-years': 11, 'adv-age-months': 0, 'adv-height': 123.9, 'adv-weight': 35 }));
  adv.appendChild(wiersz({ 'adv-age-years': 13, 'adv-age-months': 1, 'adv-height': 139.9, 'adv-weight': 45 }, { 'data-gh-sync': 'true', 'data-gh-id': 'gh-1' }));
}
const dodajWiersz = (adv) => () => { adv.appendChild(wiersz({})); };
const opisy = (adv) => adv.children.map((r) => r.opis());
const MODEL = { measurements: [
  { ageYears: 11, ageMonths: 132, height: 123.9, weight: 35, ghSync: false, ghId: null },
  // punkt terapii w modelu — be() go odsiewa, wiec model „nie wie" o 139,9
  { ageYears: 13.0833, ageMonths: 157, height: 139.9, weight: 45, ghSync: true, ghId: 'gh-1' },
] };
const WIERSZE_UI = [{ ageY: '11', ageM: '0', ht: '123.9', wt: '35', boneAge: '', arrowEnabled: false, arrowComment: '', ghSync: false, ghId: null }];

describe('P-GH-TOZSAMOSC rata 1 — wiersze punktów terapii przeżywają przebudowę tabeli', () => {
  it('rehydrateAdvancedFromState buduje wiersze ręczne z modelu i zachowuje wiersz GH', () => {
    const { win, adv } = atrapaOkna();
    loadBrowserScript('vilda_data_import_export.js', win);
    tabelaZPunktem(adv);
    const wynik = win.VildaDataImportExport.rehydrateAdvancedFromState({ advancedGrowthData: MODEL, addAdvMeasurementRow: dodajWiersz(adv), skipRecalc: true, skipPairing: true });
    expect(wynik.rendered).toBe(true);
    expect(opisy(adv)).toEqual([
      { h: '123.9', gh: false, id: '' },
      { h: '139.9', gh: true, id: 'gh-1' },
    ]);
  });

  it('rehydrateAdvancedRowsUIFromState (stan po F5) także zachowuje wiersz GH', () => {
    const { win, adv } = atrapaOkna();
    loadBrowserScript('vilda_data_import_export.js', win);
    tabelaZPunktem(adv);
    const wynik = win.VildaDataImportExport.rehydrateAdvancedRowsUIFromState(WIERSZE_UI, { addAdvMeasurementRow: dodajWiersz(adv), skipRecalc: true, skipPairing: true });
    expect(wynik.rendered).toBe(true);
    expect(opisy(adv)).toEqual([
      { h: '123.9', gh: false, id: '' },
      { h: '139.9', gh: true, id: 'gh-1' },
    ]);
  });

  it('pusty model: zostaje pusty wiersz ręczny i wiersz GH', () => {
    const { win, adv } = atrapaOkna();
    loadBrowserScript('vilda_data_import_export.js', win);
    tabelaZPunktem(adv);
    win.VildaDataImportExport.rehydrateAdvancedFromState({ advancedGrowthData: { measurements: [] }, addAdvMeasurementRow: dodajWiersz(adv), skipRecalc: true, skipPairing: true });
    expect(opisy(adv)).toEqual([
      { h: '', gh: false, id: '' },
      { h: '139.9', gh: true, id: 'gh-1' },
    ]);
  });

  it('kontrola negatywna: bez odłączenia i doklejenia wiersz GH ginie przy przebudowie', () => {
    const src = czytaj('vilda_data_import_export.js').replace(/Bgh1\(([a-z]),Bgh_[a-z]\)/g, '0');
    expect(src, 'kontrola musi wyłączyć doklejanie').not.toMatch(/Bgh1\([a-z],Bgh_/);
    const { win, adv } = atrapaOkna();
    new Function('window', 'globalThis', src)(win, win);
    tabelaZPunktem(adv);
    win.VildaDataImportExport.rehydrateAdvancedFromState({ advancedGrowthData: MODEL, addAdvMeasurementRow: dodajWiersz(adv), skipRecalc: true, skipPairing: true });
    expect(opisy(adv), 'to jest zgłoszony przebieg: punkt terapii znika z tabeli').toEqual([{ h: '123.9', gh: false, id: '' }]);
  });
});

describe('P-GH-TOZSAMOSC rata 1 — treść, którą ten test chroni', () => {
  it('obie funkcje przebudowujące odłączają wiersze GH przed czyszczeniem i doklejają po zbudowaniu', () => {
    const src = czytaj('vilda_data_import_export.js');
    expect(src).toContain('const Bgh_n=Bgh0(n);K(n,"vilda_data_import_export:rehydrateAdvancedFromState:clear")');
    expect(src).toContain('const Bgh_i=Bgh0(i);K(i,"vilda_data_import_export:rehydrateAdvancedRowsUIFromState:clear")');
    expect((src.match(/Bgh1\(n,Bgh_n\)/g) || []).length, 'Ne: obie gałęzie (pusty model i wiersze)').toBe(2);
    expect((src.match(/Bgh1\(i,Bgh_i\)/g) || []).length, 'Ct: obie gałęzie').toBe(2);
    expect(src).toContain('P-GH-TOZSAMOSC rata 1');
  });
});
