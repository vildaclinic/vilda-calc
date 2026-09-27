import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-MINI-WYCZYSC (zgłoszenie właściciela 2026-09-27): w powłoce app.html na szerokim ekranie
// mini-podsumowanie (wiek, masa, wzrost, BMI, powierzchnia ciała) na pasku ozdobnym po prawej
// znikało po „Wyczyść wszystkie pola" dopiero po ok. 3 s.
//
// PRZYCZYNA. `clearAllData` w vilda_data_import_export.js kasuje pola programowo (`el.value=""`),
// więc nasłuchy `input`/`change` — w tym mini-podsumowanie z custom-fixes.js — same nic nie widzą.
// Moduł ma na to osobny krok: w następnym ticku rozsyła `input` i `change` po polach wieku, masy,
// wzrostu i płci. Ten krok, jak i drugi odroczony (zdjęcie flag zawieszenia synchronizacji
// historii wzrastania i spożycia po wyczyszczeniu), wołał `scheduleTimeout` — identyfikator,
// którego NIE MA nigdzie w repozytorium. ReferenceError łapał otaczający try/catch i szedł tylko do
// vildaLogSwallowedCatch, więc nikt go nie widział (ESLint ma `no-undef` wyłączone dla zastanego
// kodu). Podsumowanie znikało dopiero po 3200 ms — z timera lustra formularza, które po kliknięciu
// „Wyczyść" wysyła `change` po wszystkich polach; zmierzone Playwrightem przed poprawką: 3203 ms.
//
// Test uruchamia PRAWDZIWY moduł na atrapie okna i woła prawdziwe `clearAllData`. Kontrola
// negatywna przywraca `scheduleTimeout` w treści modułu i pokazuje, że wtedy zdarzenia nie lecą.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (plik) => readFileSync(path.join(korzen, plik), 'utf8');
const POLA_Z_ODSWIEZENIEM = ['age', 'ageMonths', 'height', 'weight', 'sex'];

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

function pole(id) {
  return {
    id, value: '', disabled: false, style: {}, dataset: {}, zdarzenia: [], selectedIndex: 0,
    textContent: '', innerHTML: '', parentElement: null,
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    dispatchEvent(ev) { this.zdarzenia.push(ev && ev.type); return true; },
    addEventListener() {}, removeEventListener() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
  };
}

function atrapaOkna() {
  const pola = {};
  ['name', 'age', 'ageMonths', 'weight', 'height', 'sex'].forEach((id) => { pola[id] = pole(id); });
  const win = {
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    setTimeout: setTimeout.bind(globalThis),
    clearTimeout: clearTimeout.bind(globalThis),
    requestAnimationFrame: (f) => setTimeout(f, 0),
    location: { pathname: '/index.html', href: 'http://localhost/index.html' },
    Event: class Event {
      constructor(type, init) { this.type = type; this.bubbles = Boolean(init && init.bubbles); }
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = (init || {}).detail; }
    },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    document: {
      readyState: 'complete', hidden: false,
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      getElementById: (id) => pola[id] || null,
      querySelector: () => null, querySelectorAll: () => [],
      body: pole('body'), documentElement: pole('html'),
    },
  };
  win.window = win; win.self = win; win.top = win; win.parent = win;
  return { win, pola };
}

const wypelnij = (pola) => {
  pola.age.value = '16'; pola.ageMonths.value = '4'; pola.weight.value = '62'; pola.height.value = '142'; pola.sex.value = 'M';
};
const tick = () => new Promise((r) => { setTimeout(r, 0); });

describe('P-MINI-WYCZYSC — „Wyczyść wszystkie pola" odświeża nasłuchy pól w następnym ticku', () => {
  it('po clearAllData każde pole antropometryczne dostaje input i change; flagi zawieszenia schodzą', async () => {
    const { win, pola } = atrapaOkna();
    loadBrowserScript('vilda_data_import_export.js', win);
    const api = win.VildaDataImportExport;
    expect(api && typeof api.clearAllData, 'moduł musi się załadować').toBe('function');
    wypelnij(pola);

    expect(api.clearAllData({})).toBe(true);
    expect(pola.weight.value, 'kasowanie pól jest synchroniczne').toBe('');
    expect(pola.height.value).toBe('');
    expect(win.__vildaSuspendAdvIntakeSync, 'na czas kasowania historii synchronizacja jest zawieszona').toBe(true);
    expect(win.__vildaSuspendGrowthHistoryCrossSync).toBe(true);

    await tick(); await tick();
    for (const id of POLA_Z_ODSWIEZENIEM) {
      expect(pola[id].zdarzenia, `${id}: input po wyczyszczeniu`).toContain('input');
      expect(pola[id].zdarzenia, `${id}: change po wyczyszczeniu`).toContain('change');
    }
    expect(win.__vildaSuspendAdvIntakeSync, 'flaga zdjęta zaraz po wyczyszczeniu, nie dopiero po przeładowaniu').toBe(false);
    expect(win.__vildaSuspendGrowthHistoryCrossSync).toBe(false);
    expect(win.__vildaSuspendIntakeUserReset).toBe(false);
  });

  it('kontrola negatywna: z przywróconym `scheduleTimeout` zdarzenia nie lecą, a flagi wiszą', async () => {
    const src = czytaj('vilda_data_import_export.js')
      .replace('function Xt(){try{setTimeout(', 'function Xt(){try{scheduleTimeout(')
      .replace('debouncedIntakeCalc");try{setTimeout(', 'debouncedIntakeCalc");try{scheduleTimeout(');
    expect(src.match(/scheduleTimeout\(/g), 'kontrola negatywna musi odtworzyć oba wywołania').toHaveLength(2);
    const { win, pola } = atrapaOkna();
    new Function('window', 'globalThis', src)(win, win);
    wypelnij(pola);

    expect(win.VildaDataImportExport.clearAllData({}), 'błąd był połykany — czyszczenie melduje sukces').toBe(true);
    await tick(); await tick();
    expect(pola.weight.zdarzenia, 'to jest zgłoszony przebieg: pola puste, nasłuchy nic nie wiedzą').toEqual([]);
    expect(pola.weight.value).toBe('');
    expect(win.__vildaSuspendAdvIntakeSync, 'flaga zostawała ustawiona do przeładowania').toBe(true);
  });
});

describe('P-MINI-WYCZYSC — treść, którą ten test chroni', () => {
  const importExport = czytaj('vilda_data_import_export.js');

  it('moduł nie woła nieistniejącego scheduleTimeout; oba odroczenia idą przez setTimeout', () => {
    expect(importExport).not.toMatch(/scheduleTimeout\(/);
    expect(importExport).toContain('function Xt(){try{setTimeout(');
    expect(importExport).toContain('debouncedIntakeCalc");try{setTimeout(()=>{try{r.__vildaSuspendAdvIntakeSync=!1');
    expect(importExport).toContain('P-MINI-WYCZYSC');
  });

  it('mini-podsumowanie (custom-fixes.js) odświeża się z input/change — to te zdarzenia niesie poprawka', () => {
    const cf = czytaj('custom-fixes.js');
    // Powłoka app.html: nasłuch w fazie przechwytywania na dokumencie ramki Start.
    expect(cf).toContain('document.addEventListener("input",p,!0),document.addEventListener("change",p,!0)');
    // Samodzielny index.html: nasłuchy wprost na polach name/age/ageMonths/weight/height/sex.
    expect(cf).toContain('_.addEventListener("input",p),_.addEventListener("change",p)');
  });
});
