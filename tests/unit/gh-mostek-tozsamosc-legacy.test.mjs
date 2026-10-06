import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-GH-PUNKTY-TESTY (T4). Test charakteryzujący mostka punktów terapii GH na stronie Start
// (VildaAdvancedGrowth.importTherapyPointsToAdvancedGrowth, vilda_advanced_growth.js) przed przeniesieniem
// punktów do wspólnego API. Przypina DZISIEJSZE zachowanie, także to, które czeka na decyzję właściciela:
// klucz wiersza punktu bez id, sprzątanie zdublowanych wierszy i wiersza równego bieżącemu pomiarowi,
// zapis zwrotny bez sygnałów, porzucanie wywołania w oknie blokady i zapis „[]” przy braku klucza.
//
// Test woła PRAWDZIWY mostek na atrapie DOM. Pamięć modułu GH_THERAPY_POINTS daje prawdziwy adapter
// (vilda_persistence_adapter.js), a odczyt, zapis i sprawdzenie blokady — prawdziwe pomocniki wycięte
// z app.js, czyli te same funkcje, które app.js podaje mostkowi w opcjach. Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (plik) => readFileSync(path.join(korzen, plik), 'utf8');
const ma = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const KLUCZ = 'ghTherapyPoints';

/* ---------- minimalna atrapa DOM ---------- */
function magazyn() {
  const m = Object.create(null);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
  };
}

const POLA = ['.adv-age-years', '.adv-age-months', '.adv-height', '.adv-weight', '.adv-bone-age'];
function wiersz(wartosci, atrybuty) {
  const attrs = Object.assign({}, atrybuty || {});
  const inputs = {};
  POLA.forEach((s, i) => {
    inputs[s] = {
      value: wartosci && wartosci[i] != null ? String(wartosci[i]) : '', disabled: false, title: '',
      setAttribute(n, v) { if (n === 'title') this.title = String(v); },
    };
  });
  const r = {
    nodeType: 1, className: 'measure-row', isConnected: false, parentElement: null,
    getAttribute: (n) => (ma(attrs, n) ? attrs[n] : null),
    setAttribute: (n, v) => { attrs[n] = String(v); },
    removeAttribute: (n) => { delete attrs[n]; },
    hasAttribute: (n) => ma(attrs, n),
    querySelector: (sel) => inputs[sel] || null,
    querySelectorAll: () => [],
    remove() { if (r.parentElement) r.parentElement.removeChild(r); },
    matches: (sel) => {
      if (sel === '.measure-row') return true;
      if (sel === '.measure-row[data-gh-sync="true"]') return attrs['data-gh-sync'] === 'true';
      if (sel === '.measure-row[data-gh-id]') return ma(attrs, 'data-gh-id');
      throw new Error(`atrapa: nieobsługiwany selektor ${sel}`);
    },
    _inputs: inputs,
  };
  return r;
}
// Wiersz ręczny i wiersz GH w kolejności pól tabeli: lata, miesiące, wzrost, masa.
const reczny = (y, m, h, w) => wiersz([y, m, h, w, '']);
const wierszGh = (id, y, m, h, w) => wiersz([y, m, h, w, ''], { 'data-gh-sync': 'true', 'data-gh-id': id });

function kontener() {
  const c = {
    id: 'advMeasurements', children: [],
    appendChild(n) { if (n.parentElement && n.parentElement !== c) n.parentElement.removeChild(n); n.parentElement = c; n.isConnected = true; c.children.push(n); return n; },
    removeChild(n) { const i = c.children.indexOf(n); if (i >= 0) c.children.splice(i, 1); n.parentElement = null; n.isConnected = false; return n; },
    // Jak w DOM: wynik w kolejności dokumentu, selektor z przecinkami to suma.
    querySelectorAll(sel) { const s = sel.split(',').map((x) => x.trim()); return c.children.filter((n) => s.some((x) => n.matches(x))); },
    querySelector(sel) { return c.querySelectorAll(sel)[0] || null; },
  };
  return c;
}

// Prawdziwe pomocniki z app.js: isGhAdvancedImportSuppressed, readGh… i writeGhTherapyPointsToModuleStorage
// leżą w artefakcie jedna za drugą, tuż przed clearGhTherapyPointsModuleStorage.
function pomocnikiAppJs(win) {
  const src = czytaj('app.js');
  const od = src.indexOf('function isGhAdvancedImportSuppressed(');
  const doo = src.indexOf('function clearGhTherapyPointsModuleStorage(', od);
  expect(od, 'app.js: brak isGhAdvancedImportSuppressed').toBeGreaterThan(-1);
  expect(doo, 'app.js: brak clearGhTherapyPointsModuleStorage za pomocnikami odczytu i zapisu').toBeGreaterThan(od);
  return new Function('window', 'globalThis', `${src.slice(od, doo)}
return { isGhAdvancedImportSuppressed, readGhTherapyPointsFromModuleStorage, writeGhTherapyPointsToModuleStorage };`)(win, win);
}

// Bieżący pomiar karty Start (to, co app.js podaje jako _getUserBasics): 14 l. 0 mies., 152,4 cm, 44,6 kg.
const BIEZACY = { ageMonths: 168, height: 152.4, weight: 44.6 };

function srodowisko({ strona = '/index.html' } = {}) {
  const advC = kontener();
  const slad = { log: [], naWindow: [], naDocument: [], naAdvName: [], kanaly: [], kanalApp: 0, bledy: [] };
  const advName = { id: 'advName', dispatchEvent(e) { slad.naAdvName.push(e); slad.log.push(`${e.type}:advName`); return true; } };
  const doc = {
    readyState: 'complete', addEventListener() {}, removeEventListener() {},
    dispatchEvent(e) { slad.naDocument.push(e); return true; },
    getElementById: (id) => (id === 'advMeasurements' ? advC : id === 'advName' ? advName : null),
    querySelectorAll: () => [], querySelector: () => null,
  };
  const win = {
    document: doc,
    setTimeout: (...a) => setTimeout(...a), clearTimeout: (...a) => clearTimeout(...a),
    addEventListener() {}, removeEventListener() {},
    dispatchEvent(e) { slad.naWindow.push(e); return true; },
    localStorage: magazyn(), sessionStorage: magazyn(),
    location: { pathname: strona },
    Event: class Event { constructor(type, init) { this.type = type; this.bubbles = !!(init && init.bubbles); } },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = (init || {}).detail; } },
    // Szpiedzy kanału: konstruktor BroadcastChannel i pomocnik kanału gh-therapy-sync z app.js.
    BroadcastChannel: class BroadcastChannel {
      constructor(name) { this.k = { name, wiadomosci: [] }; slad.kanaly.push(this.k); }
      postMessage(m) { this.k.wiadomosci.push(m); }
      addEventListener() {} close() {}
    },
    getGhTherapyBroadcastChannel: () => { slad.kanalApp += 1; return null; },
    vildaEnsureAdvancedIntakePairing: () => { slad.log.push('parowanie'); },
    vildaLogSwallowedCatch: (miejsce, blad) => { slad.bledy.push(`${miejsce}: ${blad && blad.message ? blad.message : blad}`); },
  };
  win.window = win; win.self = win; win.top = win; win.parent = win;
  loadBrowserScript('vilda_persistence_adapter.js', win);
  loadBrowserScript('vilda_advanced_growth.js', win);
  const app = pomocnikiAppJs(win);
  slad.odczyty = 0;
  slad.wynikiZapisu = [];
  // Opcje jak z getVildaAdvancedGrowthGhImportOptions() w app.js; odczyt i zapis zliczamy, ale wykonują prawdziwy kod.
  const opcje = (nad) => Object.assign({
    isGhAdvancedImportSuppressed: app.isGhAdvancedImportSuppressed,
    readGhTherapyPointsFromModuleStorage: () => { slad.odczyty += 1; return app.readGhTherapyPointsFromModuleStorage(); },
    writeGhTherapyPointsToModuleStorage: (lista) => {
      slad.log.push('zapis');
      const wynik = app.writeGhTherapyPointsToModuleStorage(lista);
      slad.wynikiZapisu.push(wynik);
      return wynik;
    },
    addAdvMeasurementRow: () => { advC.appendChild(wiersz()); },
    updateRemoveButtons: () => { slad.log.push('updateRemoveButtons'); },
    calculateGrowthAdvanced: () => { slad.log.push('calculateGrowthAdvanced'); },
    getUserBasics: () => Object.assign({}, BIEZACY),
  }, nad || {});
  const importuj = (nad) => win.VildaAdvancedGrowth.importTherapyPointsToAdvancedGrowth(opcje(nad));
  const ustawModul = (lista) => { win.sessionStorage.setItem(KLUCZ, JSON.stringify(lista)); };
  const modul = () => win.sessionStorage.getItem(KLUCZ);
  return { win, advC, slad, opcje, importuj, ustawModul, modul };
}

const opis = (r) => ({
  id: r.getAttribute('data-gh-id'), gh: r.getAttribute('data-gh-sync') === 'true',
  y: r._inputs['.adv-age-years'].value, m: r._inputs['.adv-age-months'].value,
  h: r._inputs['.adv-height'].value, w: r._inputs['.adv-weight'].value,
});
const tabela = (env) => env.advC.children.map(opis);
const idWierszy = (env) => env.advC.children.map((r) => r.getAttribute('data-gh-id'));

// Fikcyjny chłopiec leczony rhGH. Wizyty Włączenia i Kontynuacji z pełnym rekordem monitora.
const P_START = Object.freeze({ id: 'gh-t4-start', type: 'start', ageYears: 11, ageMonths: 2, weight: 31.2, height: 136.4, boneAge: 9.5, dose: 0.033, doseUnit: 'mg/kg/d', drug: 'Omnitrope 5 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 1.03 });
const P_KONT = Object.freeze({ id: 'gh-t4-kont', type: 'continue', ageYears: 12, ageMonths: 8, weight: 36.9, height: 145.2, boneAge: null, dose: 0.033, doseUnit: 'mg/kg/d', drug: 'Omnitrope 5 mg', program: 'SNP', igf1: 312, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 1.22 });
const klon = (x) => JSON.parse(JSON.stringify(x));

afterEach(() => { vi.useRealTimers(); });

describe('P-GH-PUNKTY-TESTY T4 — mostek punktów GH na Start: tożsamość wierszy, zapis zwrotny, blokada', () => {
  it('punkt bez id dostaje data-gh-id „legacy:<miesiące>:<wzrost>:<masa>:<typ>”; mostek nie nadaje id, a ponowny import trafia w te same wiersze', async () => {
    const env = srodowisko();
    const lista = [
      klon(P_START),
      // bez pola id
      { type: 'continue', ageYears: 12, ageMonths: 3, weight: 34.8, height: 141.7, dose: 0.033, doseUnit: 'mg/kg/d', drug: 'Omnitrope 5 mg', program: 'SNP' },
      // id pusty napis
      { id: '', type: 'continue', ageYears: 12, ageMonths: 9, weight: 36.5, height: 144.1 },
      // id null, ułamkowe lata bez miesięcy (13,125 × 12 = 157,5), brak masy, typ z fikstur e2e
      { id: null, type: 'gh', ageYears: 13.125, weight: null, height: 147.3 },
      // id 0 jest zwykłym id, nie kluczem legacy
      { id: 0, type: 'end', ageYears: 13, ageMonths: 10, weight: 40.1, height: 149.6 },
    ];
    env.ustawModul(lista);
    await env.importuj();

    expect(tabela(env), 'wiersze w kolejności wieku; miesiące w kluczu bez zaokrąglania; brak masy i miesięcy jako pusty napis').toEqual([
      { id: 'gh-t4-start', gh: true, y: '11', m: '2', h: '136.4', w: '31.2' },
      { id: 'legacy:147:141.7:34.8:continue', gh: true, y: '12', m: '3', h: '141.7', w: '34.8' },
      { id: 'legacy:153:144.1:36.5:continue', gh: true, y: '12', m: '9', h: '144.1', w: '36.5' },
      { id: 'legacy:157.5:147.3::gh', gh: true, y: '13.125', m: '', h: '147.3', w: '' },
      { id: '0', gh: true, y: '13', m: '10', h: '149.6', w: '40.1' },
    ]);
    env.advC.children.forEach((r) => {
      expect(r._inputs['.adv-age-years'].disabled, 'wiek punktu terapii zablokowany').toBe(true);
      expect(r._inputs['.adv-age-months'].disabled).toBe(true);
      expect(r._inputs['.adv-age-years'].title).toBe('Wiek punktu terapii — edytuj w module „Monitorowanie leczenia hormonem wzrostu”');
    });
    const zapisany = JSON.parse(env.modul());
    expect(zapisany, 'zapis zwrotny zostawia punkty bez id tak, jak były').toEqual(klon(lista));
    expect(ma(zapisany[1], 'id')).toBe(false);
    expect(zapisany[2].id).toBe('');
    expect(zapisany[3].id).toBe(null);

    const przed = env.advC.children.slice();
    await env.importuj();
    expect(env.advC.children.length).toBe(przed.length);
    expect(env.advC.children.every((r, i) => r === przed[i]), 'te same obiekty wierszy, bez dorabiania nowych').toBe(true);
    expect(env.slad.bledy).toEqual([]);
  });

  it('dwa wiersze z tym samym data-gh-id: zostaje pierwszy w kolejności tabeli i dostaje wartości punktu, drugi jest usuwany', async () => {
    const env = srodowisko();
    const r = reczny(10, 6, 131.8, 28.4);
    const pierwszy = wierszGh('gh-t4-start', 11, 2, 135.0, 30.0);
    const drugi = wierszGh('gh-t4-start', 11, 2, 136.4, 31.2);
    [r, pierwszy, drugi].forEach((x) => env.advC.appendChild(x));
    env.ustawModul([klon(P_START)]);
    await env.importuj();

    expect(env.advC.children.length).toBe(2);
    expect(env.advC.children[0]).toBe(r);
    expect(env.advC.children[1]).toBe(pierwszy);
    expect(drugi.isConnected).toBe(false);
    expect(tabela(env)).toEqual([
      { id: null, gh: false, y: '10', m: '6', h: '131.8', w: '28.4' },
      { id: 'gh-t4-start', gh: true, y: '11', m: '2', h: '136.4', w: '31.2' },
    ]);
    expect(env.slad.bledy).toEqual([]);
  });

  it('dwa punkty o tym samym id: pierwszy import pokazuje wcześniejszy po wieku, kolejny import ten sam wiersz nadpisuje późniejszym — stan obecny — do decyzji (pytanie 18)', async () => {
    const env = srodowisko();
    // Zdublowane id na liście modułu: nikt dziś nie wymusza unikalności id.
    const lista = [
      Object.assign(klon(P_KONT), { id: 'gh-t4-dubel' }),
      Object.assign(klon(P_START), { id: 'gh-t4-dubel' }),
    ];
    env.ustawModul(lista);

    await env.importuj();
    // Każdy punkt dostaje nowy wiersz, a końcowe sprzątanie po data-gh-id zostawia pierwszy z nich.
    expect(tabela(env)).toEqual([{ id: 'gh-t4-dubel', gh: true, y: '11', m: '2', h: '136.4', w: '31.2' }]);
    const wiersz1 = env.advC.children[0];

    await env.importuj();
    // Teraz wiersz już jest, więc oba punkty piszą do niego po kolei i zostaje późniejszy.
    expect(env.advC.children.length).toBe(1);
    expect(env.advC.children[0], 'ten sam obiekt wiersza').toBe(wiersz1);
    expect(tabela(env)).toEqual([{ id: 'gh-t4-dubel', gh: true, y: '12', m: '8', h: '145.2', w: '36.9' }]);
    expect(JSON.parse(env.modul()), 'lista w module bez zmian, oba punkty zostają').toEqual(klon(lista));
    expect(env.slad.bledy).toEqual([]);
  });

  it('punkt równy bieżącemu pomiarowi (ten sam miesiąc wieku, wzrost i masa ±0,11) nie ma wiersza GH, a jego dawny wiersz znika; punkt zostaje na liście', async () => {
    const env = srodowisko();
    // Punkt z bieżącej wizyty: 14 l. 0 mies., 152,5 cm (różnica 0,1), 44,5 kg (różnica 0,1).
    const P_WIZYTA = { id: 'gh-t4-wizyta', type: 'continue', ageYears: 14, ageMonths: 0, weight: 44.5, height: 152.5, dose: 0.033, doseUnit: 'mg/kg/d', drug: 'Omnitrope 5 mg', program: 'SNP' };
    // Wiersz ręczny z innej wizyty — zostaje. Bez wiersza ręcznego równego punktowi, żeby działała sama reguła
    // „punkt = bieżący pomiar”, a nie przykrycie punktu wierszem ręcznym.
    const r = reczny(10, 6, 131.8, 28.4);
    // Wiersz z wcześniejszego importu, gdy bieżący pomiar był jeszcze inny.
    const dawnyWiersz = wierszGh('gh-t4-wizyta', 14, 0, 152.5, 44.5);
    // Stary wiersz GH tylko ze znacznikiem data-gh-sync (bez data-gh-id), równy bieżącemu pomiarowi.
    const staryBezId = wiersz([14, 0, 152.4, 44.6, ''], { 'data-gh-sync': 'true' });
    [r, dawnyWiersz, staryBezId].forEach((x) => env.advC.appendChild(x));
    const lista = [klon(P_START), P_WIZYTA];
    env.ustawModul(lista);
    await env.importuj();

    expect(dawnyWiersz.isConnected).toBe(false);
    expect(staryBezId.isConnected).toBe(false);
    expect(env.advC.children[0]).toBe(r);
    expect(tabela(env)).toEqual([
      { id: null, gh: false, y: '10', m: '6', h: '131.8', w: '28.4' },
      { id: 'gh-t4-start', gh: true, y: '11', m: '2', h: '136.4', w: '31.2' },
    ]);
    expect(env.win.ghTherapyPoints.map((p) => p.id)).toEqual(['gh-t4-start', 'gh-t4-wizyta']);
    expect(JSON.parse(env.modul())).toEqual(klon(lista));
    expect(env.slad.bledy).toEqual([]);
  });

  it('granica ±0,11: wzrost różny o 0,2 cm od bieżącego pomiaru daje zwykły wiersz GH', async () => {
    const env = srodowisko();
    env.ustawModul([{ id: 'gh-t4-obok', type: 'continue', ageYears: 14, ageMonths: 0, weight: 44.6, height: 152.6 }]);
    await env.importuj();
    expect(tabela(env)).toEqual([{ id: 'gh-t4-obok', gh: true, y: '14', m: '0', h: '152.6', w: '44.6' }]);
    expect(env.slad.bledy).toEqual([]);
  });

  it('zapis zwrotny: lista w kolejności oryginału trafia do GH_THERAPY_POINTS bez zdarzenia vilda:therapy-points-changed i bez BroadcastChannel; jedynym sygnałem jest syntetyczny input na #advName', async () => {
    const env = srodowisko();
    // Moduł trzyma punkty w kolejności wstawiania (późniejszy wiek pierwszy); wiersze mostek układa po wieku.
    const lista = [klon(P_KONT), klon(P_START)];
    const tekstPrzed = JSON.stringify(lista);
    env.win.sessionStorage.setItem(KLUCZ, tekstPrzed);
    await env.importuj();

    expect(env.modul(), 'ta sama wartość i ta sama kolejność kluczy').toBe(tekstPrzed);
    expect(env.win.ghTherapyPoints).toEqual(lista);
    expect(idWierszy(env), 'wiersze po wieku').toEqual(['gh-t4-start', 'gh-t4-kont']);
    expect(env.slad.log).toEqual(['zapis', 'updateRemoveButtons', 'calculateGrowthAdvanced', 'input:advName', 'parowanie']);
    expect(env.slad.naAdvName.map((e) => [e.type, e.bubbles])).toEqual([['input', true]]);
    expect(env.slad.naDocument.map((e) => e.type)).toEqual([]);
    expect(env.slad.naWindow.map((e) => e.type)).toEqual([]);
    expect(env.slad.kanaly, 'mostek nie otwiera kanału').toEqual([]);
    expect(env.slad.kanalApp, 'mostek nie sięga po kanał gh-therapy-sync z app.js').toBe(0);
    expect(env.slad.bledy).toEqual([]);
  });

  it('zapis zwrotny idzie z {force:true}: przechodzi w oknie czyszczenia pamięci, w którym zwykły zapis modułu jest odrzucany', async () => {
    const env = srodowisko();
    // Lista zapisana z wcięciami: po zapisie zwrotnym widać, że wartość została przepisana.
    const lista = [klon(P_START)];
    env.win.sessionStorage.setItem(KLUCZ, JSON.stringify(lista, null, 2));
    env.win.__vildaPersistClearUntil = Date.now() + 60_000;
    expect(env.win.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [], {}), 'kontrola: zapis bez force odrzucony').toBe(false);
    expect(env.modul()).toBe(JSON.stringify(lista, null, 2));

    await env.importuj();
    expect(env.slad.wynikiZapisu).toEqual([true]);
    expect(env.modul()).toBe(JSON.stringify(lista));
    expect(idWierszy(env)).toEqual(['gh-t4-start']);
    expect(env.slad.bledy).toEqual([]);
  });

  describe('blokada mostka (Pa)', () => {
    it('wywołanie w oknie blokady przepada: nic nie czyta ani nie zapisuje i po końcu okna samo nie wraca — stan obecny — do decyzji', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      vi.setSystemTime(new Date('2026-10-06T10:00:00.000Z'));
      const env = srodowisko();
      env.ustawModul([klon(P_START)]);
      // Okno 4 s, takie jak ustawia „Wyczyść wszystkie pola”.
      env.win.__vildaSuppressGhAdvancedImportUntil = Date.now() + 4000;
      await env.importuj();

      expect(env.slad.odczyty).toBe(0);
      expect(env.slad.log).toEqual([]);
      expect(env.win.ghTherapyPoints).toBeUndefined();
      expect(env.advC.children).toEqual([]);
      expect(vi.getTimerCount(), 'brak odłożonego ponowienia').toBe(0);

      vi.advanceTimersByTime(5000);
      vi.runAllTimers();
      await Promise.resolve();
      expect(env.slad.odczyty, 'po końcu okna nic się nie dzieje bez nowego wywołania').toBe(0);
      expect(env.advC.children).toEqual([]);

      // Dopiero następne wywołanie (na stronie: ghReimport, kanał, odtworzenie stanu) wstawia wiersze.
      await env.importuj();
      expect(env.slad.odczyty).toBe(1);
      expect(idWierszy(env)).toEqual(['gh-t4-start']);
      expect(env.slad.bledy).toEqual([]);
    });

    it('blokada, która zaczęła się w trakcie odczytu, przerywa przebieg przed zapisem zwrotnym i przed wierszami', async () => {
      const env = srodowisko();
      env.ustawModul([klon(P_START)]);
      const pytania = [];
      await env.importuj({ isGhAdvancedImportSuppressed: () => { pytania.push(1); return pytania.length > 1; } });
      expect(pytania.length, 'Pa() przed odczytem i po odczycie').toBe(2);
      expect(env.slad.odczyty).toBe(1);
      expect(env.slad.log).toEqual([]);
      expect(env.win.ghTherapyPoints).toBeUndefined();
      expect(env.advC.children).toEqual([]);
      expect(env.slad.bledy).toEqual([]);
    });

    it('dla porównania: wywołanie w trakcie trwającego przebiegu jest odkładane i ponawiane raz, z opcjami ostatniego wywołania', async () => {
      const env = srodowisko();
      env.ustawModul([klon(P_START)]);
      const odczytyB = [];
      const odczytyC = [];
      const listaC = [klon(P_START), klon(P_KONT)];
      const opcjeB = env.opcje({ readGhTherapyPointsFromModuleStorage: () => { odczytyB.push(1); return []; } });
      const opcjeC = env.opcje({ readGhTherapyPointsFromModuleStorage: () => { odczytyC.push(1); return klon(listaC); } });
      let wejscia = 0;
      // Przeliczenie karty w trakcie przebiegu woła mostek ponownie, dwa razy.
      await env.importuj({
        calculateGrowthAdvanced: () => {
          wejscia += 1;
          env.win.VildaAdvancedGrowth.importTherapyPointsToAdvancedGrowth(opcjeB);
          env.win.VildaAdvancedGrowth.importTherapyPointsToAdvancedGrowth(opcjeC);
        },
      });
      expect(wejscia).toBe(1);
      expect(env.slad.odczyty, 'pierwszy przebieg').toBe(1);
      expect(odczytyB, 'odłożone wywołanie z wcześniejszymi opcjami przepada').toEqual([]);
      expect(odczytyC, 'ponowienie raz, z ostatnimi opcjami').toEqual([1]);
      expect(idWierszy(env)).toEqual(['gh-t4-start', 'gh-t4-kont']);
      expect(env.slad.bledy).toEqual([]);
    });
  });

  it('pusta lista przy braku klucza modułu: mostek zapisuje "[]" i usuwa wiersze GH, wiersz ręczny zostaje — stan obecny — do decyzji (pytanie 13)', async () => {
    const env = srodowisko();
    const r = reczny(10, 6, 131.8, 28.4);
    const gh = wierszGh('gh-t4-start', 11, 2, 136.4, 31.2);
    const staryBezId = wiersz([12, 3, 141.7, 34.8, ''], { 'data-gh-sync': 'true' });
    [r, gh, staryBezId].forEach((x) => env.advC.appendChild(x));
    expect(env.modul(), 'klucza modułu nie ma').toBe(null);
    await env.importuj();

    expect(env.modul(), 'brak klucza zamienia się w zapisaną pustą listę').toBe('[]');
    expect(env.win.ghTherapyPoints).toEqual([]);
    expect(env.advC.children).toEqual([r]);
    expect(env.slad.log).toEqual(['zapis', 'updateRemoveButtons', 'calculateGrowthAdvanced', 'input:advName', 'parowanie']);
    expect(env.slad.bledy).toEqual([]);
  });

  it('pusta lista przy braku klucza i bez wierszy GH: zapis "[]" bez przeliczenia karty i bez sygnału autozapisu — stan obecny — do decyzji (pytanie 13)', async () => {
    const env = srodowisko();
    const r = reczny(10, 6, 131.8, 28.4);
    env.advC.appendChild(r);
    await env.importuj();
    expect(env.modul()).toBe('[]');
    expect(env.advC.children).toEqual([r]);
    expect(env.slad.log).toEqual(['zapis']);
    expect(env.slad.bledy).toEqual([]);
  });

  it('dla porównania: na docpro.html mostek wychodzi przed odczytem, więc brak klucza zostaje brakiem', async () => {
    const env = srodowisko({ strona: '/docpro.html' });
    await env.importuj();
    expect(env.slad.odczyty).toBe(0);
    expect(env.modul()).toBe(null);
    expect(env.slad.log).toEqual([]);
    expect(env.slad.bledy).toEqual([]);
  });
});
