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
// wzrostu i płci. Ten krok wołał `scheduleTimeout` — identyfikator, którego NIE MA nigdzie
// w repozytorium. ReferenceError łapał otaczający try/catch i szedł tylko do vildaLogSwallowedCatch,
// więc nikt go nie widział (ESLint ma `no-undef` wyłączone dla zastanego kodu). Podsumowanie znikało
// dopiero po 3200 ms — z timera lustra formularza, które po kliknięciu „Wyczyść" wysyła `change`
// po wszystkich polach; zmierzone Playwrightem przed poprawką: 3203 ms.
//
// DRUGIE, NIENAPRAWIONE ODROCZENIE. Ten sam nieistniejący `scheduleTimeout` woła w tym pliku także
// krok po wykasowaniu tabel historii, który miał zdjąć flagi zawieszenia synchronizacji
// (__vildaSuspendAdvIntakeSync, __vildaSuspendGrowthHistoryCrossSync, __vildaSuspendIntakeUserReset)
// i dopiąć parowanie zaawansowane↔spożycie. Włączenie go zmienia przebieg „Wyczyść" → „Wczytaj tego
// pacjenta" → „Odtwórz zapis": parowanie dokleja z tabeli spożycia wiersz-bliźniak punktu terapii GH,
// a import punktów uznaje go za wiersz ręczny i punktu nie oznacza (e2e gh-punkty-po-wczytaniu
// i gh-punkt-a-reczny-wiersz czerwienią się). To zmiana funkcjonalna poza zgłoszeniem, więc zostaje
// jako dług do decyzji właściciela — patrz docs/clinical/ALGORITHMS.md, P-MINI-WYCZYSC. Trzeci blok
// testów pilnuje, żeby ten stan był zapisany, a nie zapomniany.
//
// Test uruchamia PRAWDZIWY moduł na atrapie okna i woła prawdziwe `clearAllData`. Kontrola
// negatywna przywraca `scheduleTimeout` w kroku zdarzeń i pokazuje, że wtedy zdarzenia nie lecą.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (plik) => readFileSync(path.join(korzen, plik), 'utf8');
const POLA_Z_ODSWIEZENIEM = ['age', 'ageMonths', 'height', 'weight', 'sex'];
const XT_NAPRAWIONE = 'function Xt(){try{setTimeout(';
const XT_ZEPSUTE = 'function Xt(){try{scheduleTimeout(';
const QE_DLUG = 'try{scheduleTimeout(()=>{try{r.__vildaSuspendAdvIntakeSync=!1';

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
  it('po clearAllData każde pole antropometryczne dostaje input i change', async () => {
    const { win, pola } = atrapaOkna();
    loadBrowserScript('vilda_data_import_export.js', win);
    const api = win.VildaDataImportExport;
    expect(api && typeof api.clearAllData, 'moduł musi się załadować').toBe('function');
    wypelnij(pola);

    expect(api.clearAllData({})).toBe(true);
    expect(pola.weight.value, 'kasowanie pól jest synchroniczne').toBe('');
    expect(pola.height.value).toBe('');
    for (const id of POLA_Z_ODSWIEZENIEM) {
      expect(pola[id].zdarzenia, `${id}: zdarzenia idą dopiero w następnym ticku`).toEqual([]);
    }

    await tick(); await tick();
    for (const id of POLA_Z_ODSWIEZENIEM) {
      expect(pola[id].zdarzenia, `${id}: input po wyczyszczeniu`).toContain('input');
      expect(pola[id].zdarzenia, `${id}: change po wyczyszczeniu`).toContain('change');
    }
  });

  it('kontrola negatywna: z przywróconym `scheduleTimeout` w kroku zdarzeń nic nie leci', async () => {
    const src = czytaj('vilda_data_import_export.js').replace(XT_NAPRAWIONE, XT_ZEPSUTE);
    expect(src, 'kontrola negatywna musi odtworzyć zepsute wywołanie').toContain(XT_ZEPSUTE);
    const { win, pola } = atrapaOkna();
    new Function('window', 'globalThis', src)(win, win);
    wypelnij(pola);

    expect(win.VildaDataImportExport.clearAllData({}), 'błąd był połykany — czyszczenie melduje sukces').toBe(true);
    await tick(); await tick();
    expect(pola.weight.zdarzenia, 'to jest zgłoszony przebieg: pola puste, nasłuchy nic nie wiedzą').toEqual([]);
    expect(pola.weight.value).toBe('');
  });
});

describe('P-MINI-WYCZYSC — dług zapisany, nie naprawiony w tej racie: flagi zawieszenia po wyczyszczeniu', () => {
  it('drugie odroczenie nadal woła nieistniejące scheduleTimeout — i tylko ono', () => {
    const src = czytaj('vilda_data_import_export.js');
    // Kontrola negatywna dla rejestru: gdy ktoś to naprawi, ten test ma zmusić do zdjęcia wpisu
    // „co zostaje otwarte" z ALGORITHMS i do przejrzenia e2e gh-punkty-po-wczytaniu oraz
    // gh-punkt-a-reczny-wiersz, a nie zgnić jako nieprawdziwy komentarz.
    expect(src.match(/scheduleTimeout\(/g), 'jedno pozostałe wywołanie').toHaveLength(1);
    expect(src).toContain(QE_DLUG);
    expect(src).toContain('P-MINI-WYCZYSC: to drugie odroczenie');
  });

  it('po clearAllData flagi zawieszenia zostają ustawione (dzisiejsze zachowanie, na którym stoją e2e punktów GH)', async () => {
    const { win, pola } = atrapaOkna();
    loadBrowserScript('vilda_data_import_export.js', win);
    wypelnij(pola);
    expect(win.VildaDataImportExport.clearAllData({})).toBe(true);
    await tick(); await tick();
    expect(win.__vildaSuspendAdvIntakeSync, 'flaga wisi do przeładowania albo odtworzenia stanu').toBe(true);
    expect(win.__vildaSuspendGrowthHistoryCrossSync).toBe(true);
    expect(win.__vildaSuspendIntakeUserReset).toBe(true);
  });
});

describe('P-MINI-WYCZYSC — treść, którą ten test chroni', () => {
  it('krok zdarzeń idzie przez setTimeout i niesie komentarz z przyczyną', () => {
    const importExport = czytaj('vilda_data_import_export.js');
    expect(importExport).toContain(XT_NAPRAWIONE);
    expect(importExport).not.toContain(XT_ZEPSUTE);
    expect(importExport).toContain('P-MINI-WYCZYSC (zgloszenie wlasciciela 2026-09-27)');
  });

  it('mini-podsumowanie (custom-fixes.js) odświeża się z input/change — to te zdarzenia niesie poprawka', () => {
    const cf = czytaj('custom-fixes.js');
    // Powłoka app.html: nasłuch w fazie przechwytywania na dokumencie ramki Start.
    expect(cf).toContain('document.addEventListener("input",p,!0),document.addEventListener("change",p,!0)');
    // Samodzielny index.html: nasłuchy wprost na polach name/age/ageMonths/weight/height/sex.
    expect(cf).toContain('_.addEventListener("input",p),_.addEventListener("change",p)');
  });
});
