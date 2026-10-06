import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-GH-PUNKTY-TESTY (T3): punkty terapii GH w rekordzie pacjenta — wczytanie (applyLoadedData), zbieranie
// do zapisu (collectUserData) i „Wyczyść wszystkie pola” (clearAllData). Test charakteryzujący: opisuje
// DZISIEJSZE zachowanie prawdziwego vilda_data_import_export.js, zanim punkty GH przejdą do wspólnego API,
// także tam, gdzie zachowanie czeka na decyzję właściciela. Pomocniki app.js (zapis i czyszczenie modułu,
// kanał gh-therapy-sync, mostek, monitor) zastępują szpiedzy wstrzyknięci tak, jak wstrzykuje je app.js.
// Wszystkie punkty, pomiary i nazwy są fikcyjne.
const klon = (wartosc) => JSON.parse(JSON.stringify(wartosc));

// Punkty w kształcie, jaki dziś zapisuje monitor (15 kluczy, doseAbs na końcu). Liczby niecałkowite
// celowo: zapis ma je przenieść co do bitu, bez zaokrąglania.
const PUNKT_START = {
  id: '1759000000000.4217', type: 'start', ageYears: 9, ageMonths: 4, weight: 27.3, height: 128.5,
  boneAge: 7.5, dose: 0.03296703296703297, doseUnit: 'mg/kg/d', drug: 'Omnitrope 10 mg', program: 'SNP',
  igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.9,
};
const PUNKT_NGENLA = {
  id: '1762000000000.0913', type: 'continue', ageYears: 10, ageMonths: 1, weight: 30.1, height: 133.2,
  boneAge: null, dose: 0.5980066445182725, doseUnit: 'mg/kg/tydz', drug: 'Ngenla 60 mg', program: 'SNP',
  igf1: 312, igf1Unit: 'ng/mL', igf1DaysSinceDose: 4, doseAbs: 2.5714285714285716,
};
const LISTA = [PUNKT_START, PUNKT_NGENLA];
const PUNKT_OTYLOSCI = { id: 'ob-fikcyjny-1', type: 'start', ageYears: 15, ageMonths: 0, weight: 92, height: 170 };
const PUNKT_BISFOSFONIANU = { id: 'bf-fikcyjny-1', type: 'start', ageYears: 12, ageMonths: 6, weight: 38, height: 146 };

function cel() {
  const nasluchy = new Map();
  return {
    addEventListener(typ, fn) { if (!nasluchy.has(typ)) nasluchy.set(typ, []); nasluchy.get(typ).push(fn); },
    removeEventListener(typ, fn) { nasluchy.set(typ, (nasluchy.get(typ) || []).filter((inny) => inny !== fn)); },
    dispatchEvent(zdarzenie) { (nasluchy.get(zdarzenie.type) || []).forEach((fn) => fn(zdarzenie)); return true; },
  };
}
function magazyn() {
  const wartosci = new Map();
  return {
    getItem: (klucz) => wartosci.get(klucz) ?? null,
    setItem: (klucz, wartosc) => wartosci.set(klucz, String(wartosc)),
    removeItem: (klucz) => wartosci.delete(klucz),
  };
}

// Atrapa przeglądarki jak w wiek-kostny-zapis-wizyty.test.mjs; moduł importu/eksportu jest prawdziwy.
// Dziennik `slad` zapisuje kolejność efektów i stan window.ghTherapyPoints w chwili każdego z nich.
function srodowisko() {
  const pola = new Map();
  const doc = {
    ...cel(), readyState: 'complete', activeElement: null,
    querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => pola.get(id) || null,
  };
  const element = (id = '') => {
    const pole = {
      ...cel(), id, value: '', checked: false, dataset: {}, style: {}, children: [], type: 'text',
      classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
      setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
      querySelector: () => null, querySelectorAll: () => [], closest: () => null,
      appendChild(dziecko) { this.children.push(dziecko); return dziecko; },
      removeChild(dziecko) { this.children = this.children.filter((inne) => inne !== dziecko); },
      focus() { doc.activeElement = this; },
    };
    if (id) pola.set(id, pole);
    return pole;
  };
  doc.createElement = () => element();
  doc.body = element();
  doc.documentElement = element();
  ['name', 'advName', 'age', 'ageMonths', 'height', 'weight', 'sex'].forEach(element);

  const slad = [];
  const polkniete = [];
  const win = {
    ...cel(), document: doc, localStorage: magazyn(), sessionStorage: magazyn(),
    location: { pathname: '/docpro.html', hash: '' }, console, confirm: () => true,
    Event: class Event { constructor(typ, opcje) { this.type = typ; this.bubbles = !!opcje?.bubbles; } },
    CustomEvent: class CustomEvent { constructor(typ, opcje) { this.type = typ; this.detail = opcje?.detail; } },
    setTimeout: () => 1, clearTimeout() {},
    vildaOnReady: (_klucz, fn) => fn(),
    vildaLogSwallowedCatch: (kontekst, blad) => { polkniete.push({ kontekst, blad: String(blad && blad.message) }); },
    VildaPersistence: {
      readModuleJSON: (_klucz, zapas) => klon(zapas), writeModuleJSON: () => true,
      patientScopedStorageType: () => 'session', getTabId: () => 'karta-fikcyjna-1',
    },
  };
  win.window = win; win.self = win; win.parent = win; win.top = win; win.globalThis = win;
  win.sessionStorage.setItem('vildaTabIdV1', 'karta-fikcyjna-1');
  const okno = () => (win.ghTherapyPoints === undefined ? 'undefined' : JSON.stringify(win.ghTherapyPoints));

  // Globalne funkcje, których moduł szuka w window (monitor, flush autozapisu, mostek Start, karta GH).
  win.refreshGHTherapyMonitor = () => { slad.push({ co: 'odswiezenie', okno: okno() }); };
  win.vildaPersistFlushNow = (o) => { slad.push({ co: 'flush', force: !!(o && o.force), okno: okno() }); };
  win.importTherapyPointsToAdvancedGrowth = () => { slad.push({ co: 'mostek', okno: okno() }); };
  win.ghActivateTab = (zakladka) => { slad.push({ co: 'zakladka', zakladka }); };
  win.obesityTherapyMonitorSetPoints = (lista) => { slad.push({ co: 'otylosc', lista: JSON.stringify(lista) }); };
  win.bisphosTherapyMonitorSetPoints = (lista) => { slad.push({ co: 'bisfosfoniany', lista: JSON.stringify(lista) }); };

  loadBrowserScript('vilda_data_import_export.js', win);

  // Pomocniki modułu GH_THERAPY_POINTS: app.js podaje je w opcjach applyLoadedData (oe()) i clearAllData (J()).
  const zapisane = [];
  const kanal = {
    wiadomosci: [],
    postMessage(wiadomosc) { this.wiadomosci.push(wiadomosc); slad.push({ co: 'bc', wiadomosc }); },
  };
  const opcje = {
    showRestoreButton() {}, syncSharedUserDataFromLoadedData() {}, rehydrateAdvancedFromState() {},
    debouncedUpdate() {}, showLoadDataMessage() {},
    writeGhTherapyPointsToModuleStorage: (lista) => {
      zapisane.push(lista);
      slad.push({ co: 'zapis-modulu', lista: JSON.stringify(lista), okno: okno() });
      return true;
    },
    clearGhTherapyPointsModuleStorage: () => { slad.push({ co: 'czyszczenie-modulu', okno: okno() }); return true; },
    getGhTherapyBroadcastChannel: () => kanal,
  };
  const bledyGh = () => polkniete.filter((p) => /gh|obesity|bisphos/i.test(p.kontekst));
  return { win, api: win.VildaDataImportExport, slad, zapisane, kanal, opcje, bledyGh };
}
const rekord = (dodatki = {}) => ({
  name: 'Fikcyjny Pacjent GH', user: { sex: 'M', age: 10, ageMonths: 1, height: 133.2, weight: 30.1 }, ...dodatki,
});
const kroki = (slad) => slad.map((wpis) => wpis.co);

describe('P-GH-PUNKTY-TESTY T3 — applyLoadedData: punkty GH z rekordu', () => {
  it('lista z rekordu trafia 1:1 do zapisu modułu i jako głęboka kopia do window; kolejność: window → moduł → monitor → flush → mostek', () => {
    const env = srodowisko();
    const payload = rekord({ ghTherapyPoints: klon(LISTA) });
    expect(env.api.applyLoadedData(payload, env.opcje)).toBe(true);

    // Zapis modułu dostaje dokładnie tę listę: te same id, doseAbs i kolejność kluczy (JSON identyczny).
    expect(env.zapisane, 'jeden zapis modułu na wczytanie').toHaveLength(1);
    expect(JSON.stringify(env.zapisane[0])).toBe(JSON.stringify(LISTA));
    expect(env.zapisane[0].map((p) => p.id)).toEqual(['1759000000000.4217', '1762000000000.0913']);
    expect(env.zapisane[0].map((p) => p.doseAbs)).toEqual([0.9, 2.5714285714285716]);

    // window dostaje kopię: równą treścią, ale niezależną od wczytanego rekordu.
    expect(JSON.stringify(env.win.ghTherapyPoints)).toBe(JSON.stringify(LISTA));
    expect(env.win.ghTherapyPoints).not.toBe(payload.ghTherapyPoints);
    expect(env.win.ghTherapyPoints[0]).not.toBe(payload.ghTherapyPoints[0]);
    payload.ghTherapyPoints[0].dose = 99;
    expect(env.win.ghTherapyPoints[0].dose, 'zmiana rekordu po wczytaniu nie rusza window').toBe(0.03296703296703297);

    // Kolejność efektów: window jest ustawione PRZED zapisem modułu, monitor odświeża się po zapisie,
    // flush autozapisu jest wymuszony, a mostek Start rusza na końcu — każdy widzi już nową listę.
    expect(kroki(env.slad)).toEqual(['zapis-modulu', 'odswiezenie', 'otylosc', 'bisfosfoniany', 'flush', 'mostek']);
    const poWczytaniu = JSON.stringify(LISTA);
    for (const wpis of env.slad.filter((w) => 'okno' in w)) {
      expect(wpis.okno, `${wpis.co}: window ma już listę z rekordu`).toBe(poWczytaniu);
    }
    expect(env.slad.find((w) => w.co === 'flush').force).toBe(true);
    expect(env.slad.some((w) => w.co === 'bc'), 'wczytanie nie wysyła nic kanałem gh-therapy-sync').toBe(false);
    expect(JSON.stringify(env.win.lastLoadedData.ghTherapyPoints), 'linia bazowa wczytania niesie tę samą listę')
      .toBe(poWczytaniu);
    expect(env.bledyGh(), 'żaden krok punktów nie rzucił po cichu').toEqual([]);
  });

  it('rekord bez tablicy punktów czyści moduł i daje [] w window, a pusta tablica zapisuje [] — stan obecny — do decyzji (pytanie 13)', () => {
    // Dwie reguły „pustej listy” obok siebie: brak tablicy usuwa klucz modułu (pomocnik czyszczenia),
    // pusta tablica idzie zwykłym zapisem i zostawia w module "[]".
    for (const [opis, dodatki] of [
      ['brak pola', {}],
      ['null', { ghTherapyPoints: null }],
      ['obiekt zamiast tablicy', { ghTherapyPoints: { 0: PUNKT_START } }],
      ['napis', { ghTherapyPoints: '[]' }],
    ]) {
      const env = srodowisko();
      env.win.ghTherapyPoints = klon(LISTA);
      expect(env.api.applyLoadedData(rekord(dodatki), env.opcje)).toBe(true);
      expect(env.win.ghTherapyPoints, `${opis}: window po wczytaniu`).toEqual([]);
      expect(env.zapisane, `${opis}: bez zapisu listy`).toEqual([]);
      const czyszczenia = env.slad.filter((w) => w.co === 'czyszczenie-modulu');
      expect(czyszczenia, `${opis}: jedno czyszczenie modułu`).toHaveLength(1);
      expect(czyszczenia[0].okno, `${opis}: window wyzerowane przed czyszczeniem modułu`).toBe('[]');
      expect(kroki(env.slad).slice(0, 2), `${opis}: monitor odświeża się po czyszczeniu`)
        .toEqual(['czyszczenie-modulu', 'odswiezenie']);
    }

    const env = srodowisko();
    env.win.ghTherapyPoints = klon(LISTA);
    env.api.applyLoadedData(rekord({ ghTherapyPoints: [] }), env.opcje);
    expect(env.win.ghTherapyPoints).toEqual([]);
    expect(env.zapisane, 'pusta tablica to zapis [], nie czyszczenie').toEqual([[]]);
    expect(env.slad.some((w) => w.co === 'czyszczenie-modulu')).toBe(false);
  });

  it('odtworzenie sesji (isSessionRestore) stosuje punkty GH, a od P-POWLOKA-OBCY także punkty otyłości i bisfosfonianów z migawki', () => {
    const env = srodowisko();
    const otyloscPrzed = [klon(PUNKT_OTYLOSCI)];
    const bisfosfonianyPrzed = [klon(PUNKT_BISFOSFONIANU)];
    env.win.obesityTherapyPoints = otyloscPrzed;
    env.win.bisphosTherapyPoints = bisfosfonianyPrzed;
    env.win.ghTherapyPoints = [];

    const payload = rekord({ ghTherapyPoints: klon(LISTA), obesityTherapyPoints: [], bisphosTherapyPoints: [] });
    expect(env.api.applyLoadedData(payload, { ...env.opcje, isSessionRestore: true })).toBe(true);

    expect(JSON.stringify(env.zapisane), 'GH: zapis modułu jak przy zwykłym wczytaniu').toBe(JSON.stringify([LISTA]));
    expect(JSON.stringify(env.win.ghTherapyPoints)).toBe(JSON.stringify(LISTA));
    expect(kroki(env.slad), 'otyłość i bisfosfoniany z migawki (P-POWLOKA-OBCY); flush i mostek jak przy wczytaniu')
      .toEqual(['zapis-modulu', 'odswiezenie', 'otylosc', 'bisfosfoniany', 'flush', 'mostek']);
    expect(env.slad.filter((w) => w.co === 'otylosc' || w.co === 'bisfosfoniany').map((w) => [w.co, w.lista]),
      'monitory otyłości i bisfosfonianów dostają listy z migawki').toEqual([['otylosc', '[]'], ['bisfosfoniany', '[]']]);
    expect(otyloscPrzed, 'poprzednia lista otyłości nie jest mutowana').toEqual([PUNKT_OTYLOSCI]);
    expect(bisfosfonianyPrzed, 'poprzednia lista bisfosfonianów nie jest mutowana').toEqual([PUNKT_BISFOSFONIANU]);
    expect(env.win.lastLoadedData, 'odtworzenie sesji nie ustawia linii bazowej wczytania').toBeUndefined();
    expect(env.bledyGh()).toEqual([]);
  });

  it('kontrola: zwykłe wczytanie tego samego rekordu stosuje także punkty otyłości i bisfosfonianów', () => {
    const env = srodowisko();
    env.win.obesityTherapyPoints = [klon(PUNKT_OTYLOSCI)];
    env.win.bisphosTherapyPoints = [klon(PUNKT_BISFOSFONIANU)];
    env.api.applyLoadedData(rekord({ ghTherapyPoints: klon(LISTA), obesityTherapyPoints: [], bisphosTherapyPoints: [] }), env.opcje);
    expect(env.slad.filter((w) => w.co === 'otylosc' || w.co === 'bisfosfoniany').map((w) => [w.co, w.lista]))
      .toEqual([['otylosc', '[]'], ['bisfosfoniany', '[]']]);
  });
});

describe('P-GH-PUNKTY-TESTY T3 — rekord nie waliduje ani nie normalizuje punktów GH', () => {
  it('wczytanie i zbieranie przenoszą bez zmian type:"gh", punkt bez id, dwa Włączenia, obce pole i brak doseAbs — stan obecny — do decyzji (pytanie 22)', () => {
    // Takie odmiany występują w fiksturach e2e i mogą istnieć w starszych danych. Walidacja monitora
    // (jeden start, wartości dodatnie, program i preparat) działa tylko na ścieżkach zapisu z UI.
    const historyczne = [
      { id: 'gh-fikcyjny-1', ageYears: 13, ageMonths: 1, height: 139.9, weight: 45, type: 'gh' },
      { type: 'start', ageYears: 9, ageMonths: 4, weight: 27.3, height: 128.5, dose: 0.033, drug: 'Omnitrope 5 mg', program: 'SNP' },
      { id: 'drugi-start', type: 'start', ageYears: 9.5, weight: 0, height: 129, dose: -1, notatkaObca: { zrodlo: 'fikcyjne' } },
    ];
    const env = srodowisko();
    env.api.applyLoadedData(rekord({ ghTherapyPoints: klon(historyczne) }), env.opcje);
    expect(JSON.stringify(env.zapisane[0]), 'moduł: ta sama treść i kolejność kluczy').toBe(JSON.stringify(historyczne));
    expect(JSON.stringify(env.win.ghTherapyPoints), 'window: bez nadania id i bez dopisania doseAbs').toBe(JSON.stringify(historyczne));

    const zebrane = env.api.collectUserData();
    expect(JSON.stringify(zebrane.ghTherapyPoints), 'zapis rekordu niesie te same punkty').toBe(JSON.stringify(historyczne));
    expect(env.bledyGh()).toEqual([]);
  });
});

describe('P-GH-PUNKTY-TESTY T3 — collectUserData: punkty GH do zapisu', () => {
  it('rekord dostaje głęboką kopię window.ghTherapyPoints z zachowaną kolejnością punktów i kluczy', () => {
    const env = srodowisko();
    env.win.ghTherapyPoints = klon(LISTA);
    const zebrane = env.api.collectUserData();

    expect(JSON.stringify(zebrane.ghTherapyPoints)).toBe(JSON.stringify(LISTA));
    expect(zebrane.ghTherapyPoints).not.toBe(env.win.ghTherapyPoints);
    expect(zebrane.ghTherapyPoints[1]).not.toBe(env.win.ghTherapyPoints[1]);
    zebrane.ghTherapyPoints[1].igf1 = 1;
    zebrane.ghTherapyPoints.pop();
    expect(JSON.stringify(env.win.ghTherapyPoints), 'zmiana zebranej kopii nie rusza window').toBe(JSON.stringify(LISTA));
  });

  it('brak tablicy w window (undefined, null, obiekt, napis) daje [] w rekordzie', () => {
    for (const [opis, wartosc] of [
      ['undefined', undefined], ['null', null], ['obiekt', { 0: PUNKT_START }], ['napis', JSON.stringify(LISTA)],
    ]) {
      const env = srodowisko();
      env.win.ghTherapyPoints = wartosc;
      const zebrane = env.api.collectUserData();
      expect(zebrane.ghTherapyPoints, `${opis}: pole istnieje i jest pustą tablicą`).toEqual([]);
      expect(env.win.ghTherapyPoints, `${opis}: zbieranie nie poprawia window`).toBe(wartosc);
    }
  });
});

describe('P-GH-PUNKTY-TESTY T3 — clearAllData: punkty GH', () => {
  it('ustawia window=[], czyści moduł, odświeża monitor i wraca na zakładkę rejestracji; import GH zablokowany na 4 s', () => {
    const env = srodowisko();
    env.win.ghTherapyPoints = klon(LISTA);
    const przed = Date.now();
    expect(env.api.clearAllData(env.opcje)).toBe(true);
    const po = Date.now();

    expect(env.win.ghTherapyPoints).toEqual([]);
    const gh = env.slad.filter((w) => ['czyszczenie-modulu', 'bc', 'odswiezenie', 'zakladka'].includes(w.co));
    expect(kroki(gh), 'kolejność kroków GH w clearAllData').toEqual(['czyszczenie-modulu', 'bc', 'odswiezenie', 'zakladka']);
    expect(gh[0].okno, 'window wyzerowane przed czyszczeniem modułu').toBe('[]');
    expect(gh[2].okno, 'monitor odświeża się na pustej liście').toBe('[]');
    expect(gh[3].zakladka).toBe('rec');
    expect(env.zapisane, 'czyszczenie nie idzie przez zapis listy').toEqual([]);
    expect(env.slad.some((w) => w.co === 'mostek'), 'mostek Start nie jest wołany wprost').toBe(false);

    // Blokada importu punktów do karty zaawansowanej: 4 s od chwili czyszczenia.
    expect(env.win.__vildaSuppressGhAdvancedImportUntil).toBeGreaterThanOrEqual(przed + 4000);
    expect(env.win.__vildaSuppressGhAdvancedImportUntil).toBeLessThanOrEqual(po + 4000);
    expect(env.bledyGh()).toEqual([]);
  });

  it('wysyła kanałem gh-therapy-sync {type:"clear"} BEZ tabId, choć tabId jest dostępny — stan obecny — do decyzji (pytanie 12)', () => {
    // Odbiornik kanału w app.js przyjmuje tylko wiadomości z własnym tabId, więc dziś ta wiadomość
    // nikogo nie odświeża. Monitor przy własnym resecie wysyła clear z tabId.
    const env = srodowisko();
    env.win.ghTherapyPoints = klon(LISTA);
    expect(env.win.VildaPersistence.getTabId()).toBe('karta-fikcyjna-1');
    expect(env.win.sessionStorage.getItem('vildaTabIdV1')).toBe('karta-fikcyjna-1');

    env.api.clearAllData(env.opcje);
    expect(env.kanal.wiadomosci).toEqual([{ type: 'clear' }]);
    expect(Object.keys(env.kanal.wiadomosci[0]), 'jedyne pole wiadomości to type').toEqual(['type']);
  });
});
