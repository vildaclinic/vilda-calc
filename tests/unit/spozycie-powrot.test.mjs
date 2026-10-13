import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// P-SPOZYCIE-POWROT (polecenie właściciela 2026-10-13): po powrocie do panelu Start w powłoce app.html karta
// „Szacowane spożycie energii” przez co najmniej jedną klatkę nie miała wiersza historii — karta niższa o 143 px
// na desktopie i o 252 px na telefonie, treść pod nią skakała. vildaPersistRestoreAll odtwarza karty synchronicznie,
// a końcowy krok (parowanie wierszy zaawansowane↔spożycie, które dorabia pusty wiersz historii, uzgodnienie historii
// wzrastania, przeliczenie, zaplanowanie zapisu) odkładał w setTimeout(0) — przeglądarka malowała klatkę pomiędzy.
// Teraz krok idzie przez kolejkę, a vildaPersistRestoreFinishNow() — wołane przez powłokę przy pokazaniu panelu —
// wykonuje go od razu.
//
// Test uruchamia PRAWDZIWY vilda_persist_runtime.js na atrapie okna z ręcznie sterowanymi timerami:
//   1. bez FinishNow wszystko jak dotąd — krok czeka na setTimeout(0) (start strony, odświeżanie paneli w tle);
//   2. FinishNow: import punktów GH rusza synchronicznie, parowanie i przeliczenie kończą się w mikrozadaniach, bez
//      żadnego timera (czyli przed malowaniem), a flagi zawieszenia synchronizacji schodzą; timer potem nic nie robi;
//   3. kilka zaległych odtworzeń — FinishNow wykonuje wszystkie, w kolejności timerów; pusta kolejka — nic;
//   4. kontrola negatywna: wersja sprzed poprawki (setTimeout zamiast kolejki) — FinishNow niczego nie przyspiesza.
// Wpis: docs/clinical/ALGORITHMS.md, P-SPOZYCIE-POWROT. Atrapa bez danych pacjenta.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZRODLO = fs.readFileSync(path.join(korzen, 'vilda_persist_runtime.js'), 'utf8');

// Wersja sprzed poprawki: krok końcowy wprost w setTimeout(0), z pominięciem kolejki.
const KROK_W_KOLEJCE = 'try{typeof window<"u"&&Sp_odloz(()=>{const n=()=>{';
const KONIEC_KROKU = 'finally{n()}})()})}catch(n){';
const PRZED_POPRAWKA = ZRODLO
  .replace(KROK_W_KOLEJCE, 'try{typeof window<"u"&&setTimeout(()=>{const n=()=>{')
  .replace(KONIEC_KROKU, 'finally{n()}})()},0)}catch(n){');

function magazyn() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

function runtime(zrodlo = ZRODLO) {
  const kroki = [];
  const timery = [];
  const doc = new EventTarget();
  Object.assign(doc, {
    readyState: 'complete',
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementsByName: () => [],
  });
  let odtworzone = 0;
  doc.addEventListener('vilda:persist-restored', () => { odtworzone += 1; });
  const win = new EventTarget();
  Object.assign(win, {
    document: doc,
    sessionStorage: magazyn(),
    localStorage: magazyn(),
    vildaAppOnReady() {},
    vildaEnsureAdvancedIntakePairing: () => kroki.push('parowanie'),
    reconcileGrowthHistoryModules: (zakres) => kroki.push('historia:' + zakres),
    calculateBasicGrowth: () => kroki.push('przeliczenie'),
  });
  const setTimeoutAtrapa = (f, ms) => { timery.push({ f, ms }); return timery.length; };
  new Function('window', 'globalThis', 'document', 'setTimeout', 'clearTimeout', zrodlo)(win, win, doc, setTimeoutAtrapa, () => {});
  win.VildaPersistRuntime.init({ importTherapyPointsToAdvancedGrowth: async () => { kroki.push('import GH'); } });
  return {
    win, kroki, timery,
    odtworzone: () => odtworzone,
    flagi: () => [win.__vildaSuspendAdvIntakeSync, win.__vildaSuspendGrowthHistoryCrossSync],
    // Wszystkie zaległe timery, także dołożone w trakcie (jak pętla zdarzeń, bez malowania pomiędzy).
    async timeryDoKonca() {
      while (timery.length) { timery.shift().f(); await mikrozadania(); }
    },
  };
}

// Tylko mikrozadania — żaden timer nie rusza, więc to, co się tu wykona, wyprzedza najbliższą klatkę.
async function mikrozadania() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

const KROK = ['import GH', 'parowanie', 'historia:advanced', 'przeliczenie'];

describe('P-SPOZYCIE-POWROT — końcowy krok odtworzenia stanu na żądanie powłoki', () => {
  it('bez FinishNow jak dotąd: odtworzenie kończy się zdarzeniem, a krok końcowy czeka na setTimeout(0)', async () => {
    const r = runtime();
    r.win.vildaPersistRestoreAll();
    expect(r.odtworzone(), 'vilda:persist-restored po odtworzeniu, jak dotąd').toBe(1);
    expect(r.win.__vildaPersistRestoring).toBe(false);
    expect(r.timery.map((t) => t.ms), 'jeden odroczony krok').toEqual([0]);
    await mikrozadania();
    expect(r.kroki, 'przed timerem krok końcowy nie ruszył').toEqual([]);
    expect(r.flagi(), 'synchronizacja zaawansowane↔spożycie zawieszona do kroku końcowego').toEqual([true, true]);
    await r.timeryDoKonca();
    expect(r.kroki).toEqual(KROK);
    expect(r.flagi()).toEqual([false, false]);
  });

  it('FinishNow: import GH od razu, parowanie i przeliczenie w mikrozadaniach, bez timera; timer potem nic nie robi', async () => {
    const r = runtime();
    r.win.vildaPersistRestoreAll();
    r.win.vildaPersistRestoreFinishNow();
    expect(r.kroki, 'import punktów GH rusza synchronicznie, jak dotąd na początku kroku').toEqual(['import GH']);
    await mikrozadania();
    expect(r.kroki, 'cały krok przed najbliższym timerem, czyli przed malowaniem').toEqual(KROK);
    expect(r.flagi()).toEqual([false, false]);
    await r.timeryDoKonca();
    expect(r.kroki, 'krok wykonany raz').toEqual(KROK);
  });

  it('kilka zaległych odtworzeń (np. odświeżenie w tle i pokazanie panelu): FinishNow wykonuje wszystkie w kolejności', async () => {
    const r = runtime();
    r.win.vildaPersistRestoreAll();
    r.win.vildaPersistRestoreAll();
    expect(r.timery).toHaveLength(2);
    r.win.vildaPersistRestoreFinishNow();
    expect(r.kroki).toEqual(['import GH', 'import GH']);
    await mikrozadania();
    expect(r.kroki).toEqual(['import GH', 'import GH', 'parowanie', 'historia:advanced', 'przeliczenie', 'parowanie', 'historia:advanced', 'przeliczenie']);
    await r.timeryDoKonca();
    expect(r.kroki, 'timery nic nie dokładają').toHaveLength(8);
  });

  it('pusta kolejka: FinishNow nic nie robi, także po kroku wykonanym przez timer', async () => {
    const r = runtime();
    expect(() => r.win.vildaPersistRestoreFinishNow()).not.toThrow();
    r.win.vildaPersistRestoreAll();
    await r.timeryDoKonca();
    r.win.vildaPersistRestoreFinishNow();
    await mikrozadania();
    expect(r.kroki).toEqual(KROK);
  });

  it('kontrola negatywna: krok wprost w setTimeout(0), jak przed poprawką — FinishNow go nie przyspiesza', async () => {
    expect(PRZED_POPRAWKA, 'atrapa wersji sprzed poprawki różni się od źródła').not.toBe(ZRODLO);
    expect(PRZED_POPRAWKA).not.toContain(KROK_W_KOLEJCE);
    const r = runtime(PRZED_POPRAWKA);
    r.win.vildaPersistRestoreAll();
    r.win.vildaPersistRestoreFinishNow();
    await mikrozadania();
    expect(r.kroki, 'przed timerem karta zostaje bez parowania — to jest klatka bez wiersza historii').toEqual([]);
    await r.timeryDoKonca();
    expect(r.kroki).toEqual(KROK);
  });

  it('strażnik źródła: powłoka kończy krok przy każdym pokazaniu panelu, po sesji; odświeżanie w tle (It) — nie', () => {
    const sh = fs.readFileSync(path.join(korzen, 'vilda_shell.js'), 'utf8');
    const pokaz = sh.match(/function Gp_p\([^)]*\)\{[\s\S]*?(?=function It\()/)?.[0] || '';
    const kolejnosc = ['n.vildaPersistRestoreAll()', 'n.vildaSession.restore()', 'n.vildaPersistRestoreFinishNow()', 'Gp_u(n)'].map((x) => pokaz.indexOf(x));
    expect(kolejnosc.every((x, i) => x > (i ? kolejnosc[i - 1] : -1)), `kolejność w Gp_p: ${kolejnosc}`).toBe(true);
    // poza warunkiem zmiany odcisku sesji: zaległy krok po odświeżeniu w tle też kończy się przed pierwszą klatką
    expect(pokaz).toMatch(/n\.vildaSession\.restore\(\)\}catch\{\}\}\/\*[^*]*\*\/try\{typeof n\.vildaPersistRestoreFinishNow=="function"/);
    const tlo = sh.match(/function It\(\)\{[\s\S]*?(?=function et\()/)?.[0] || '';
    expect(tlo).toContain('r.vildaPersistRestoreAll()');
    expect(tlo).not.toContain('vildaPersistRestoreFinishNow');
    expect(ZRODLO).toContain('window.vildaPersistRestoreAll=Ye,window.vildaPersistRestoreFinishNow=Sp_dokoncz,');
  });
});
