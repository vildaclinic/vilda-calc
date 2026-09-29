import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-HISTORIA-ZWIJANA (decyzje właściciela 2026-09-29): zwijana lista „Poprzednie pomiary”
// w karcie „Zaawansowane obliczenia wzrostowe”, stan per pacjent i synchronizowany.
// Zachowanie na żywej stronie sprawdza tests/e2e/historia-pomiarow-zwijanie.spec.mjs; tutaj
// czyste funkcje modułu, klasa klucza i droga preferencji na drugie urządzenie przez sejf.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plik = (n) => readFileSync(path.join(repoRoot, n), 'utf8');
const NBSP = ' ';

function modul() {
  // Okno bez elementów karty: moduł wystawia API i nic nie montuje.
  const win = {
    document: { readyState: 'complete', getElementById: () => null, addEventListener() {} },
    addEventListener() {},
  };
  win.window = win;
  loadBrowserScript('vilda_adv_history_collapse.js', win);
  return win.VildaAdvHistoryCollapse;
}

const I = modul().__internals;
const UUID_A = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const UUID_B = '0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d';

describe('licznik i odmiana', () => {
  it('odmienia jak po polsku, także w drugiej dziesiątce i po setce', () => {
    const tabela = {
      1: 'pomiar', 2: 'pomiary', 4: 'pomiary', 5: 'pomiarów', 11: 'pomiarów', 12: 'pomiarów',
      14: 'pomiarów', 21: 'pomiarów', 22: 'pomiary', 24: 'pomiary', 25: 'pomiarów',
      101: 'pomiarów', 112: 'pomiarów', 122: 'pomiary',
    };
    for (const [n, slowo] of Object.entries(tabela)) {
      expect(I.odmianaPomiarow(Number(n)), `${n}`).toBe(slowo);
    }
  });

  it('pomiarem jest wiersz z wiekiem i wartością; wpis w toku się nie liczy', () => {
    expect(I.czyWypelniony({ lata: '9', wzrost: '129.1' })).toBe(true);
    expect(I.czyWypelniony({ miesiace: '8', masa: '8.2' }), 'sam wiek w miesiącach też jest wiekiem').toBe(true);
    expect(I.czyWypelniony({ lata: '9', wiekKostny: '8.5' })).toBe(true);
    expect(I.czyWypelniony({ lata: '9' }), 'sam wiek').toBe(false);
    expect(I.czyWypelniony({ wzrost: '129.1', masa: '27' }), 'bez wieku').toBe(false);
    expect(I.czyWypelniony({ lata: ' ', wzrost: ' ' }), 'białe znaki to pusto').toBe(false);
    expect(I.czyWypelniony(null)).toBe(false);
  });
});

describe('podsumowanie pod nagłówkiem', () => {
  const wiersze = [
    { lata: '6', miesiace: '0', wzrost: '113.8', masa: '19.9' },
    { lata: '4', miesiace: '0', wzrost: '101.5', masa: '15.8' },
    { lata: '9', miesiace: '6', wzrost: '129.1', masa: '27.0' },
  ];

  it('zakres wieku i najnowszy pomiar, wartości przepisane z pól, bez przeliczeń', () => {
    expect(I.podsumowanie(wiersze, false)).toBe(
      `wiek 4${NBSP}l. – 9${NBSP}l. 6${NBSP}mies. · najnowszy: 129,1${NBSP}cm · 27,0${NBSP}kg`,
    );
  });

  it('kolejność wierszy na liście nie decyduje o tym, który jest najnowszy', () => {
    expect(I.podsumowanie([...wiersze].reverse(), false)).toContain(`najnowszy: 129,1${NBSP}cm`);
  });

  it('jeden pomiar: sam wiek i wartości; brak masy nie zostawia pustego miejsca', () => {
    expect(I.podsumowanie([{ lata: '12', wzrost: '148.2' }], false)).toBe(`wiek 12${NBSP}l. · 148,2${NBSP}cm`);
  });

  it('dopisek o nowym pomiarze i pusta lista', () => {
    expect(I.podsumowanie(wiersze, true)).toMatch(/ · nowy pomiar poniżej$/);
    expect(I.podsumowanie([], true)).toBe('');
  });

  it('wiek w samych miesiącach', () => {
    expect(I.wiekOpis({ lata: '', miesiace: '8' })).toBe(`8${NBSP}mies.`);
    expect(I.wiekOpis({ lata: '3', miesiace: '0' })).toBe(`3${NBSP}l.`);
  });
});

describe('mapa stanu w preferencji', () => {
  it('z magazynu zostają tylko identyfikatory sejfu z wartością 1', () => {
    const wejscie = { [UUID_A]: 1, [UUID_B]: true, 'Anna Testowa': 1, ab: 1, [`${UUID_A}x`]: 0 };
    expect(I.normalizujMape(wejscie)).toEqual({ [UUID_A]: 1 });
    expect(I.normalizujMape([UUID_A])).toEqual({});
    expect(I.normalizujMape('x')).toEqual({});
    expect(I.normalizujMape(null)).toEqual({});
  });

  it('zwinięcie przenosi wpis na koniec, rozwinięcie go usuwa (rozwinięta lista to stan domyślny)', () => {
    let m = I.zmienMape({}, UUID_A, true);
    m = I.zmienMape(m, UUID_B, true);
    m = I.zmienMape(m, UUID_A, true);
    expect(Object.keys(m)).toEqual([UUID_B, UUID_A]);
    expect(I.zmienMape(m, UUID_B, false)).toEqual({ [UUID_A]: 1 });
    expect(I.zmienMape(m, 'Anna Testowa', true), 'nazwisko zamiast identyfikatora niczego nie dopisuje').toEqual(m);
  });

  it(`ma limit ${I.LIMIT_WPISOW} wpisów — wypadają najdawniej przełączone`, () => {
    let m = {};
    const id = (i) => `pacjent-${String(i).padStart(4, '0')}-test`;
    for (let i = 0; i < I.LIMIT_WPISOW + 5; i++) m = I.zmienMape(m, id(i), true);
    const klucze = Object.keys(m);
    expect(klucze).toHaveLength(I.LIMIT_WPISOW);
    expect(klucze[0]).toBe(id(5));
    expect(klucze.at(-1)).toBe(id(I.LIMIT_WPISOW + 4));
    expect(Object.keys(I.normalizujMape({ ...m, [id(9999)]: 1 }))).toHaveLength(I.LIMIT_WPISOW);
  });
});

// Dwa urządzenia na prawdziwym sejfie — wzorzec z ustawienia-siatek-synchronizacja.test.mjs.
function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

function loadDevice() {
  const win = {
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    btoa: globalThis.btoa,
    atob: globalThis.atob,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    CustomEvent: class {},
    document: { addEventListener() {}, removeEventListener() {}, hidden: false },
  };
  win.window = win; win.self = win; win.top = win;
  loadBrowserScript('vilda_persistence_adapter.js', win);
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  vault.__prefs = win.VildaPersistence;
  return vault;
}

describe('preferencja advHistoryCollapsed jedzie między urządzeniami', () => {
  it('klucz jest zarejestrowany jako cloud-synced (local-persistent zostałby na jednym urządzeniu)', () => {
    const P = loadDevice().__prefs;
    expect(P.MODULE_KEYS.ADV_HISTORY_COLLAPSED).toBe('advHistoryCollapsed');
    expect(P.MODULE_KEY_META.advHistoryCollapsed).toEqual({ scope: 'ui', kind: 'preference', storage: 'cloud-synced' });
    expect(modul().PREF_KEY, 'moduł pisze pod tym samym kluczem').toBe('advHistoryCollapsed');
  });

  it('stan zwinięcia zapisany na A jest po scaleniu na B', async () => {
    const haslo = 'Historia#Sync!2026x';
    const A = loadDevice();
    const utworzone = await A.createUser(haslo, { label: 'A', iterations: 10000 });
    const B = loadDevice();
    await B.createUser(haslo, { label: 'B', iterations: 10000, recoveryKey: utworzone.recoveryKey });

    expect(A.__prefs.writePreferenceJSON('advHistoryCollapsed', { [UUID_A]: 1 }, { force: true })).toBe(true);
    await new Promise((r) => { setTimeout(r, 0); });

    const wynik = await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(wynik.updatedPreferenceCount).toBeGreaterThan(0);
    expect(B.__prefs.readPreferenceJSON('advHistoryCollapsed', {})).toEqual({ [UUID_A]: 1 });
  });
});

describe('granice modułu (kontrola kształtu)', () => {
  const zrodlo = plik('vilda_adv_history_collapse.js');
  const kod = zrodlo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('nie zmienia wartości pól ani danych pacjenta', () => {
    expect(kod, 'żadnego przypisania .value').not.toMatch(/\.value\s*=[^=]/);
    for (const zakazane of ['writeMainSession', 'savePatient', 'applyLoadedData', 'writeShared', 'removeChild', 'insertBefore', 'appendChild']) {
      expect(kod, zakazane).not.toContain(zakazane);
    }
  });

  it('nie ustawia stylów na elementach — tylko atrybuty i klasy', () => {
    expect(kod).not.toMatch(/\.style\b/);
  });

  it('przyciski stoją poza #advMeasurements, a moduł ładuje się po vilda_advanced_growth.js', () => {
    const html = plik('index.html');
    expect(html, 'kontener wierszy jest pusty w markupie').toContain('<div id="advMeasurements"></div>');
    const iPrzelacznik = html.indexOf('id="advHistoryToggle"');
    const iKontener = html.indexOf('<div id="advMeasurements">');
    const iDolny = html.indexOf('id="advHistoryCollapseBottom"');
    expect(iPrzelacznik).toBeGreaterThan(0);
    expect(iPrzelacznik).toBeLessThan(iKontener);
    expect(iDolny).toBeGreaterThan(iKontener);
    const iSilnik = html.indexOf('src="vilda_advanced_growth.js');
    const iModul = html.indexOf('src="vilda_adv_history_collapse.js');
    expect(iModul).toBeGreaterThan(iSilnik);
  });
});
