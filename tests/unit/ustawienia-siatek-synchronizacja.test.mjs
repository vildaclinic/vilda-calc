import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// U3 z audytu sekcji „Ustawienia": grubości linii siatek (`centileChartLineStyles`) jeździły
// w chmurze, ale widoczność elementów tych samych siatek i stopień wygładzenia krzywych
// Palczewskiej — nie. Wszystkie cztery zmieniają dokładnie ten sam wytwarzany dokument:
// siatkę centylową i PDF, który trafia do dokumentacji. Ten sam pacjent wydrukowany z laptopa
// i z telefonu dawał dwa różne dokumenty.
//
// Rozgraniczenie, którego te testy pilnują: ustawienia DOKUMENTU jadą w chmurę, ustawienia
// URZĄDZENIA (ciemne tło, szkło, kontrast, nawigacja mobilna) zostają lokalne.

function makeStorage() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    __m: m,
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
  // Kolejność ma znaczenie: sejf podpina się do VildaPersistence przy ładowaniu.
  loadBrowserScript('vilda_persistence_adapter.js', win);
  loadBrowserScript('vilda_crypto.js', win);
  loadBrowserScript('vilda_vault.js', win);
  const vault = win.VildaVault;
  vault.setStorageAdapter(vault.createInMemoryAdapter());
  vault.__win = win;
  vault.__prefs = win.VildaPersistence;
  return vault;
}

const ITER = 10000;
let licznik = 0;

async function paraUrzadzen() {
  licznik += 1;
  const haslo = `Siatki#Sync!2026${licznik}x`;
  const A = loadDevice();
  const utworzone = await A.createUser(haslo, { label: `A${licznik}`, iterations: ITER });
  const B = loadDevice();
  await B.createUser(haslo, {
    label: `B${licznik}`, iterations: ITER, recoveryKey: utworzone.recoveryKey,
  });
  return { A, B };
}

// Zapis preferencji do sejfu idzie przez hak `onPreferenceWrite` i jest asynchroniczny.
const ustawIPoczekaj = async (v, klucz, wartosc) => {
  v.__prefs.writePreferenceRaw(klucz, wartosc, { force: true });
  await new Promise((r) => { setTimeout(r, 0); });
};

const KLUCZE_DOKUMENTU = [
  'CENTILE_SHOW_HEIGHT_LABEL',
  'CENTILE_SHOW_WEIGHT_LABEL',
  'CENTILE_SHOW_BAND_REFERENCE',
  'PAL_SMOOTH_PASSES',
];

describe('ustawienia siatek centylowych jadą w chmurze', () => {
  it('cztery ustawienia dokumentu mają klasę cloud-synced', () => {
    const v = loadDevice();
    const P = v.__prefs;
    const nazwa = (k) => P.MODULE_KEYS[k];
    const klasa = (k) => P.MODULE_KEY_META[nazwa(k)].storage;

    expect(klasa('CENTILE_CHART_LINE_STYLES'), 'kontrola dodatnia: grubości linii już jeździły')
      .toBe('cloud-synced');
    for (const k of KLUCZE_DOKUMENTU) {
      expect(klasa(k), `${k} zmienia generowaną siatkę, więc należy do konta`).toBe('cloud-synced');
    }
  });

  it('ustawienia urządzenia zostają lokalne', () => {
    const v = loadDevice();
    const P = v.__prefs;
    for (const k of ['DARK_BG_LEVEL', 'GLASS_LEVEL', 'HIGH_CONTRAST_ENABLED',
      'SHOW_MOBILE_DOCK', 'SHOW_NAVIGATION_ARROW', 'ANALYTICS_CONSENT']) {
      expect(P.MODULE_KEY_META[P.MODULE_KEYS[k]].storage,
        `${k} dotyczy tego sprzętu, nie konta`).toBe('local-persistent');
    }
  });

  it('zmiana na jednym urządzeniu dociera na drugie', async () => {
    const { A, B } = await paraUrzadzen();

    await ustawIPoczekaj(A, 'CENTILE_SHOW_HEIGHT_LABEL', 'false');
    await ustawIPoczekaj(A, 'CENTILE_SHOW_BAND_REFERENCE', 'false');
    await ustawIPoczekaj(A, 'PAL_SMOOTH_PASSES', '4');

    const wynik = await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(wynik.updatedPreferenceCount, 'scalanie zgłasza przyjęte preferencje').toBeGreaterThan(0);

    expect(B.__prefs.readPreferenceRaw('CENTILE_SHOW_HEIGHT_LABEL', null)).toBe('false');
    expect(B.__prefs.readPreferenceRaw('CENTILE_SHOW_BAND_REFERENCE', null)).toBe('false');
    expect(B.__prefs.readPreferenceRaw('PAL_SMOOTH_PASSES', null)).toBe('4');
  });

  it('wygląd aplikacji NIE podróżuje między urządzeniami', async () => {
    // Kontrola negatywna dla rozgraniczenia: ciemne tło to ustawienie tego ekranu,
    // a nie dokumentu, i ma zostać tam, gdzie je włączono.
    const { A, B } = await paraUrzadzen();
    await ustawIPoczekaj(A, 'GLASS_LEVEL', '3');
    await B.mergeSyncPayload(await A.exportSyncPayload());
    expect(B.__prefs.readPreferenceRaw('GLASS_LEVEL', null),
      'ustawienie wyglądu zostaje na swoim urządzeniu').toBeNull();
  });

  it('istniejąca wartość lokalna nie znika po zmianie klasy', () => {
    // Klucz w magazynie nazywa się tak samo w obu klasach, więc ustawienie sprzed
    // aktualizacji ma dalej działać — bez tego użytkownik dostałby ciche przestawienie
    // wszystkich siatek na domyślne.
    const v = loadDevice();
    v.__win.localStorage.setItem('centileShowWeightLabel', 'false');
    v.__win.localStorage.setItem('palSmoothPasses', '3');
    expect(v.__prefs.readPreferenceRaw('CENTILE_SHOW_WEIGHT_LABEL', null)).toBe('false');
    expect(v.__prefs.readNumberPreference('PAL_SMOOTH_PASSES', 12, { min: 0, max: 50 })).toBe(3);
  });
});

describe('karta Ustawień odświeża kontrolki po synchronizacji', () => {
  const plik = (n) => readFileSync(path.join(repoRoot, n), 'utf8');

  it('przełączniki widoczności elementów siatek czytają stan po scaleniu', () => {
    const s = plik('inline_ustawienia_02.js');
    expect(s, 'nasłuch na zdarzenie synchronizacji').toContain('vilda:sync-status-changed');
  });

  it('suwak wygładzania i jego odczyt też się odświeżają', () => {
    const s = plik('ustawienia.html');
    expect(s).toContain('odswiezPalSmoothZeStanu');
    expect(s.toLowerCase(), 'odświeżenie nie może zapisywać z powrotem — to zapętliłoby synchronizację')
      .toContain('bez zapisu');
  });

  it('żetony w nagłówkach sekcji nie zostają z nieaktualną wartością', () => {
    const s = plik('inline_ustawienia_05.js');
    expect(s).toContain('vilda:sync-status-changed');
  });
});
