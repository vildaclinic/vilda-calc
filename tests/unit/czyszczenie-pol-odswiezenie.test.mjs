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
// DRUGIE ODROCZENIE — naprawione w P-GH-TOZSAMOSC rata 2 (decyzja właściciela 2026-09-28, opcja (a)).
// Ten sam nieistniejący `scheduleTimeout` wołał w tym pliku także krok po wykasowaniu tabel historii,
// który miał zdjąć flagi zawieszenia synchronizacji (__vildaSuspendAdvIntakeSync,
// __vildaSuspendGrowthHistoryCrossSync, __vildaSuspendIntakeUserReset) i dopiąć parowanie
// zaawansowane↔spożycie. Flagi wisiały więc po „Wyczyść" (i po czyszczeniu przy logowaniu oraz starcie
// karty) do przeładowania albo odtworzenia stanu — w świeżej karcie synchronizacja obu tabel stała.
// Włączenie go „na sucho" psuło „Wyczyść" → „Wczytaj tego pacjenta" → „Odtwórz zapis" (parowanie
// dorabiało z tabeli spożycia bliźniaka punktu terapii GH, import uznawał punkt za przykryty), dlatego
// w P-MINI-WYCZYSC zostało jako dług. Rata 2 zdejmuje flagi (setTimeout) i jednocześnie uczy parowanie
// tożsamości punktów GH (vilda_advanced_growth.js) oraz daje importowi pierwszeństwo na ścieżce
// wczytania (ghReimport). Trzeci blok testów pilnuje nowego zachowania.
//
// Test uruchamia PRAWDZIWY moduł na atrapie okna i woła prawdziwe `clearAllData`. Kontrola
// negatywna przywraca `scheduleTimeout` w kroku zdarzeń i pokazuje, że wtedy zdarzenia nie lecą.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (plik) => readFileSync(path.join(korzen, plik), 'utf8');
const POLA_Z_ODSWIEZENIEM = ['age', 'ageMonths', 'height', 'weight', 'sex'];
const XT_NAPRAWIONE = 'function Xt(){try{setTimeout(';
const XT_ZEPSUTE = 'function Xt(){try{scheduleTimeout(';
const QE_NAPRAWIONE = 'try{setTimeout(()=>{try{r.__vildaSuspendAdvIntakeSync=!1';
const QE_ZEPSUTE = QE_NAPRAWIONE.replace('try{setTimeout(', 'try{scheduleTimeout(');

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

describe('P-GH-TOZSAMOSC rata 2 — po wyczyszczeniu flagi zawieszenia opadają w następnym ticku', () => {
  const zeSpiegami = (win) => {
    const wywolania = { parowanie: 0, reconcile: [] };
    win.vildaEnsureAdvancedIntakePairing = () => { wywolania.parowanie += 1; };
    win.reconcileGrowthHistoryModules = (k) => { wywolania.reconcile.push(k); };
    return wywolania;
  };

  it('po clearAllData wszystkie trzy flagi są ustawione synchronicznie, a po ticku opadają; parowanie i reconcile ruszają', async () => {
    const { win, pola } = atrapaOkna();
    loadBrowserScript('vilda_data_import_export.js', win);
    const wywolania = zeSpiegami(win);
    wypelnij(pola);
    expect(win.VildaDataImportExport.clearAllData({})).toBe(true);
    expect(win.__vildaSuspendAdvIntakeSync, 'w trakcie kasowania tabel synchronizacja stoi').toBe(true);
    expect(win.__vildaSuspendGrowthHistoryCrossSync).toBe(true);
    expect(win.__vildaSuspendIntakeUserReset).toBe(true);
    expect(wywolania.parowanie, 'parowanie dopiero po ticku').toBe(0);
    await tick(); await tick();
    expect(win.__vildaSuspendAdvIntakeSync, 'flaga nie wisi już do przeładowania').toBe(false);
    expect(win.__vildaSuspendGrowthHistoryCrossSync).toBe(false);
    expect(win.__vildaSuspendIntakeUserReset).toBe(false);
    expect(wywolania.parowanie).toBe(1);
    expect(wywolania.reconcile).toEqual(['advanced']);
  });

  it('kontrola negatywna: z przywróconym `scheduleTimeout` flagi wiszą po ticku (stary, martwy krok)', async () => {
    const src = czytaj('vilda_data_import_export.js').replace(QE_NAPRAWIONE, QE_ZEPSUTE);
    expect(src, 'kontrola negatywna musi odtworzyć zepsute wywołanie').toContain(QE_ZEPSUTE);
    const { win, pola } = atrapaOkna();
    new Function('window', 'globalThis', src)(win, win);
    const wywolania = zeSpiegami(win);
    wypelnij(pola);
    expect(win.VildaDataImportExport.clearAllData({}), 'błąd był połykany — czyszczenie melduje sukces').toBe(true);
    await tick(); await tick();
    expect(win.__vildaSuspendAdvIntakeSync, 'to był zgłoszony stan: flaga wisi').toBe(true);
    expect(wywolania.parowanie).toBe(0);
  });

  it('w pliku nie ma już żadnego wywołania scheduleTimeout, a odroczenie niesie komentarz rejestru', () => {
    const src = czytaj('vilda_data_import_export.js');
    expect(src.match(/scheduleTimeout\(/g), 'oba martwe odroczenia naprawione').toBeNull();
    expect(src).toContain(QE_NAPRAWIONE);
    expect(src).toContain('P-GH-TOZSAMOSC rata 2 (decyzja wlasciciela 2026-09-28): to odroczenie zdejmuje flagi zawieszenia');
    // ścieżka wczytania: import punktów GH ma pierwszeństwo przed parowaniem
    expect(src).toContain('x("suspend-pairing-until-gh-import",Ggh_a,["applyLoadedData"])');
    expect(src).not.toContain('x("ensure-advanced-intake-pairing",r.vildaEnsureAdvancedIntakePairing,[])');
    expect(src).toContain('Ggh_b("ghReimport")};');
    expect(src).toContain('m||ghReimport(a)||Ggh_b("applyLoadedData:no-reimport")');
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
