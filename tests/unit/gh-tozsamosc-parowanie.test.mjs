import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-GH-TOZSAMOSC rata 2 (decyzja właściciela 2026-09-28, opcja (a) w dwóch ratach).
//
// Parowanie tabel „Zaawansowane obliczenia wzrostowe" ↔ „Szacowane spożycie energii" łączyło wiersze
// WYŁĄCZNIE po kolejności. Wiersz spożycia będący lustrem punktu terapii GH nie niósł żadnej tożsamości,
// więc gdy wiersza GH chwilowo nie było (import punktów jeszcze trwa, punkt usunięty w monitorze,
// punkt przykryty identycznym wierszem ręcznym), parowanie dorabiało z lustra wiersz „ręczny"
// w tabeli zaawansowanej, a import punktów (ghReczny) uznawał punkt za przykryty — znacznik ginął,
// a po usunięciu punktu zostawał wiersz-duch.
//
// Reguły po poprawce (vilda_advanced_growth.js, Ggh0–Ggh3 i parowanie on()):
//   1. lustro punktu GH w tabeli spożycia niesie data-gh-id / data-gh-sync;
//   2. parowanie łączy wiersz GH z jego lustrem po identyfikatorze, niezależnie od kolejności;
//   3. z wiersza-lustra nigdy nie dorabia się wiersza ręcznego (backfill i sync spożycie→zaawansowane
//      odmawiają kopiowania do wiersza o innej tożsamości);
//   4. lustro bez wiersza GH (sierota) jest usuwane, nie awansowane na pomiar ręczny;
//   5. znacznik dostaje tylko wiersz spożycia, który był pusty i został wypełniony z wiersza GH, albo
//      ma te same wartości (miesiąc wieku, wzrost i masa ±0,05) — wiersz ręczny o innych wartościach
//      sparowany po kolejności z wierszem GH znacznika NIE dostaje (inaczej reguła 4 mogłaby go skasować).
//
// Test woła PRAWDZIWE funkcje modułu (pairAdvancedIntakeRowsByOrder, backfill*, sync*) na atrapie DOM.
// Dane wyłącznie FIKCYJNE. Kontrola negatywna wyłącza odczyt tożsamości i pokazuje stary przebieg.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (plik) => readFileSync(path.join(korzen, plik), 'utf8');
const ma = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* ---------- minimalna atrapa DOM ---------- */
function wiersz(klasa, selektory, wartosci, atrybuty) {
  const attrs = Object.assign({}, atrybuty || {});
  const inputs = {};
  selektory.forEach((s, i) => { inputs[s] = { value: wartosci && wartosci[i] != null ? String(wartosci[i]) : '', disabled: false }; });
  const r = {
    nodeType: 1, className: klasa, dataset: {}, isConnected: false, parentElement: null,
    getAttribute: (n) => (ma(attrs, n) ? attrs[n] : null),
    setAttribute: (n, v) => { attrs[n] = String(v); },
    removeAttribute: (n) => { delete attrs[n]; },
    hasAttribute: (n) => ma(attrs, n),
    querySelector: (sel) => inputs[sel] || null,
    querySelectorAll: () => [],
    remove() { if (r.parentElement) r.parentElement.removeChild(r); },
    matches: (sel) => sel === `.${klasa}`,
    _inputs: inputs, _attrs: attrs,
  };
  return r;
}
const ADV = ['.adv-age-years', '.adv-age-months', '.adv-height', '.adv-weight', '.adv-bone-age'];
const INT = ['.intake-ageY', '.intake-ageM', '.intake-ht', '.intake-wt'];
const adv = (y, m, h, w, atr) => wiersz('measure-row', ADV, [y, m, h, w, ''], atr);
const intake = (y, m, h, w, atr) => wiersz('measure-row-intake', INT, [y, m, h, w], atr);
const pustyAdv = () => wiersz('measure-row', ADV, null);
const pustyIntake = () => wiersz('measure-row-intake', INT, null);

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

function srodowisko() {
  const advC = kontener('advMeasurements');
  const intC = kontener('intakeMeasurements');
  const doc = {
    readyState: 'complete', addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    getElementById: (id) => (id === 'advMeasurements' ? advC : id === 'intakeMeasurements' ? intC : null),
    querySelectorAll: (sel) => (sel.startsWith('#advMeasurements') ? advC.children.slice() : sel.startsWith('#intakeMeasurements') ? intC.children.slice() : []),
    querySelector: (sel) => doc.querySelectorAll(sel)[0] || null,
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
  return { win, doc, advC, intC };
}
const zaladuj = (env, src) => { if (src) new Function('window', 'globalThis', src)(env.win, env.win); else loadBrowserScript('vilda_advanced_growth.js', env.win); return env; };

const opcje = (env) => ({
  document: env.doc,
  addAdvancedRow: () => { env.advC.appendChild(pustyAdv()); },
  addIntakeRow: () => { env.intC.appendChild(pustyIntake()); },
});
const paruj = (env) => env.win.pairAdvancedIntakeRowsByOrder(opcje(env));

const opisAdv = (r) => ({ y: r._inputs['.adv-age-years'].value, m: r._inputs['.adv-age-months'].value, h: r._inputs['.adv-height'].value, w: r._inputs['.adv-weight'].value, gh: r.getAttribute('data-gh-sync') === 'true', id: r.getAttribute('data-gh-id') || '' });
const opisInt = (r) => ({ y: r._inputs['.intake-ageY'].value, m: r._inputs['.intake-ageM'].value, h: r._inputs['.intake-ht'].value, w: r._inputs['.intake-wt'].value, gh: r.getAttribute('data-gh-sync') === 'true', id: r.getAttribute('data-gh-id') || '' });
const tabelaAdv = (env) => env.advC.children.map(opisAdv);
const tabelaInt = (env) => env.intC.children.map(opisInt);
const sync = (r) => r.dataset.advIntakeSyncId || '';

// Dziewczynka 14 lat: wiersz ręczny 11 l. / 123,9 cm / 35 kg; punkt terapii GH gh-1: 13 l. 1 mies. / 139,9 cm / 45 kg.
const RECZNY = () => adv(11, 0, 123.9, 35);
const PUNKT = () => adv(13, 1, 139.9, 45, { 'data-gh-sync': 'true', 'data-gh-id': 'gh-1' });
const O_RECZNY_INT = { y: '11', m: '0', h: '123.9', w: '35', gh: false, id: '' };
const O_LUSTRO_INT = { y: '13', m: '1', h: '139.9', w: '45', gh: true, id: 'gh-1' };

describe('P-GH-TOZSAMOSC rata 2 — parowanie zaawansowane↔spożycie zna tożsamość punktu terapii GH', () => {
  it('reguła 1: lustro dorobione z wiersza GH w tabeli spożycia dostaje data-gh-id i data-gh-sync, lustro wiersza ręcznego nie', () => {
    const env = zaladuj(srodowisko());
    env.advC.appendChild(RECZNY()); env.advC.appendChild(PUNKT());
    const wynik = paruj(env);
    expect(wynik.paired).toBe(true);
    expect(tabelaInt(env)).toEqual([O_RECZNY_INT, O_LUSTRO_INT]);
    expect(tabelaAdv(env), 'tabela zaawansowana bez zmian').toEqual([
      { y: '11', m: '0', h: '123.9', w: '35', gh: false, id: '' },
      { y: '13', m: '1', h: '139.9', w: '45', gh: true, id: 'gh-1' },
    ]);
    expect(sync(env.advC.children[1])).toBe(sync(env.intC.children[1]));
    expect(sync(env.advC.children[0])).toBe(sync(env.intC.children[0]));
    expect(sync(env.advC.children[0])).not.toBe(sync(env.advC.children[1]));
  });

  it('reguła 2: wiersz GH i jego lustro łączą się po identyfikatorze także przy odwróconej kolejności; nic nie jest dorabiane', () => {
    const env = zaladuj(srodowisko());
    env.advC.appendChild(RECZNY()); env.advC.appendChild(PUNKT());
    env.intC.appendChild(intake(13, 1, 139.9, 45, { 'data-gh-sync': 'true', 'data-gh-id': 'gh-1' }));
    env.intC.appendChild(intake(11, 0, 123.9, 35));
    paruj(env);
    expect(env.advC.children).toHaveLength(2);
    expect(env.intC.children).toHaveLength(2);
    expect(tabelaInt(env)).toEqual([O_LUSTRO_INT, O_RECZNY_INT]);
    expect(sync(env.advC.children[1]), 'GH ↔ lustro (po id, nie po indeksie)').toBe(sync(env.intC.children[0]));
    expect(sync(env.advC.children[0]), 'ręczny ↔ ręczny').toBe(sync(env.intC.children[1]));
  });

  it('reguła 5: lustro odtworzone BEZ znacznika (rekord pacjenta go nie niesie) odzyskuje go po wartościach, także przy odwróconej kolejności', () => {
    const env = zaladuj(srodowisko());
    env.advC.appendChild(RECZNY()); env.advC.appendChild(PUNKT());
    env.intC.appendChild(intake(13, 1, 139.9, 45)); // lustro bez tożsamości, na pierwszym miejscu
    env.intC.appendChild(intake(11, 0, 123.9, 35));
    paruj(env);
    expect(tabelaInt(env)).toEqual([O_LUSTRO_INT, O_RECZNY_INT]);
    expect(sync(env.advC.children[1])).toBe(sync(env.intC.children[0]));
    expect(env.intC.children).toHaveLength(2);
  });

  it('reguła 5 (strażnik): wiersz spożycia o INNYCH wartościach sparowany po kolejności z wierszem GH znacznika nie dostaje', () => {
    const env = zaladuj(srodowisko());
    env.advC.appendChild(PUNKT());
    env.intC.appendChild(intake(12, 0, 130, 38)); // ręczny wpis w tabeli spożycia, inny pomiar
    paruj(env);
    expect(tabelaInt(env)).toEqual([{ y: '12', m: '0', h: '130', w: '38', gh: false, id: '' }]);
    expect(env.intC.children).toHaveLength(1);
    expect(env.advC.children).toHaveLength(1);
  });

  it('reguła 4: lustro bez wiersza GH (sierota) jest usuwane, a NIE dorabiane jako wiersz ręczny w tabeli zaawansowanej', () => {
    const env = zaladuj(srodowisko());
    env.advC.appendChild(RECZNY());
    env.intC.appendChild(intake(11, 0, 123.9, 35));
    env.intC.appendChild(intake(13, 1, 139.9, 45, { 'data-gh-sync': 'true', 'data-gh-id': 'gh-9' }));
    const wynik = paruj(env);
    expect(wynik.mutated).toBe(true);
    expect(tabelaAdv(env), 'bez wiersza-ducha 139,9').toEqual([{ y: '11', m: '0', h: '123.9', w: '35', gh: false, id: '' }]);
    expect(tabelaInt(env)).toEqual([O_RECZNY_INT]);
  });

  it('reguła 3: backfill i sync spożycie→zaawansowane odmawiają kopiowania z lustra do wiersza o innej tożsamości', () => {
    const env = zaladuj(srodowisko());
    const lustro = intake(13, 1, 139.9, 45, { 'data-gh-sync': 'true', 'data-gh-id': 'gh-1' });
    const pusty = pustyAdv();
    const wlasny = adv('', '', '', '', { 'data-gh-sync': 'true', 'data-gh-id': 'gh-1' });
    expect(env.win.VildaAdvancedGrowth.backfillAdvancedIntakeAdvancedRowFromHistoryRow(lustro, pusty)).toBe(false);
    expect(opisAdv(pusty)).toEqual({ y: '', m: '', h: '', w: '', gh: false, id: '' });
    expect(env.win.VildaAdvancedGrowth.syncAdvancedIntakeHistoryRowToAdvancedRow(lustro, { document: env.doc, targetRow: pusty, skipPairing: true })).toBe(false);
    expect(opisAdv(pusty).h).toBe('');
    // do WŁASNEGO wiersza GH kopiowanie działa jak dotąd
    expect(env.win.VildaAdvancedGrowth.backfillAdvancedIntakeAdvancedRowFromHistoryRow(lustro, wlasny)).toBe(true);
    expect(opisAdv(wlasny)).toEqual({ y: '13', m: '1', h: '139.9', w: '45', gh: true, id: 'gh-1' });
  });

  it('sync zaawansowane→spożycie z wiersza GH oznacza lustro (ścieżka „na żywo", bez parowania)', () => {
    const env = zaladuj(srodowisko());
    const punkt = PUNKT();
    const cel = pustyIntake();
    expect(env.win.VildaAdvancedGrowth.syncAdvancedIntakeAdvancedRowToHistoryRow(punkt, { document: env.doc, targetRow: cel, skipPairing: true })).toBe(true);
    expect(opisInt(cel)).toEqual(O_LUSTRO_INT);
  });

  it('kontrola negatywna: bez odczytu tożsamości (Ggh0 → "") sierota staje się wierszem ręcznym 139,9 — to jest zgłoszony przebieg', () => {
    const src = czytaj('vilda_advanced_growth.js');
    const zepsute = src.replace('function Ggh0(e){try{', 'function Ggh0(e){return"";try{');
    expect(zepsute, 'kontrola musi wyłączyć odczyt tożsamości').not.toBe(src);
    const env = zaladuj(srodowisko(), zepsute);
    env.advC.appendChild(RECZNY());
    env.intC.appendChild(intake(11, 0, 123.9, 35));
    env.intC.appendChild(intake(13, 1, 139.9, 45, { 'data-gh-sync': 'true', 'data-gh-id': 'gh-9' }));
    paruj(env);
    expect(tabelaAdv(env)).toEqual([
      { y: '11', m: '0', h: '123.9', w: '35', gh: false, id: '' },
      { y: '13', m: '1', h: '139.9', w: '45', gh: false, id: '' },
    ]);
    // ...i lustro dorobione z wiersza GH nie niesie znacznika
    const env2 = zaladuj(srodowisko(), zepsute);
    env2.advC.appendChild(PUNKT());
    paruj(env2);
    expect(tabelaInt(env2)).toEqual([{ y: '13', m: '1', h: '139.9', w: '45', gh: false, id: '' }]);
  });

  it('źródło niesie kotwice poprawki: komentarz rejestru, parowanie po imporcie i usuwanie sierot', () => {
    const src = czytaj('vilda_advanced_growth.js');
    expect(src).toContain('P-GH-TOZSAMOSC rata 2 (decyzja wlasciciela 2026-09-28');
    expect(src).toContain('vilda_advanced_growth:advanced-intake-pairing:remove-orphan-gh-twin');
    expect(src).toContain('vilda_advanced_growth:gh-import-pairing');
    expect(src).toContain('typeof i.vildaEnsureAdvancedIntakePairing=="function"&&i.vildaEnsureAdvancedIntakePairing()');
    // lustro wraca ze swoją tożsamością po F5 / „Odtwórz zapis"
    const persist = czytaj('vilda_persist_runtime.js');
    expect(persist).toContain('ghId:String(typeof s.getAttribute=="function"&&s.getAttribute("data-gh-id")||"").trim()');
    expect(persist).toContain('ghId:typeof d.ghId=="string"?d.ghId.trim():""');
    expect(persist).toContain('g.setAttribute("data-gh-id",c.ghId.trim()),g.setAttribute("data-gh-sync","true")');
  });
});
