import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { KLUCZ_MODULU, TAB_ID_DOMYSLNY, opcjePrzedApi, rodzaje, utworzAtrapeMonitoraGh } from '../support/gh-monitor-atrapa.mjs';

// P-GH-PUNKTY-API rata 1. Funkcje z efektami wspólnego API punktów terapii GH (vilda_gh_punkty.js →
// window.VildaGhPunkty): zapisz, wczytaj, gotowe — na atrapach okna, bez prawdziwej przeglądarki. Test woła
// PRAWDZIWY moduł (loadBrowserScript, osobne okno na każdy przypadek, więc leniwy kanał modułu startuje od zera).
//
// Wzorcem jest L() monitora sprzed API (gh_therapy_monitor.js 52, MONITOR_PRZED_API w atrapie): ve() → writeModuleJSON('GH_THERAPY_POINTS', lista, {force:true}),
// potem document 'vilda:therapy-points-changed' {source:'gh'}, potem Y({type:'update'}) na kanale gh-therapy-sync
// z tabId: VildaPersistence.getTabId(), bez niej sessionStorage.vildaTabIdV1 (pusty → ''), a wyjątek przy odczycie
// tabId zostawia wiadomość bez pola tabId. Każdy krok L() ma własny try, więc brak modułu nie zatrzymuje sygnałów.
// be() monitora: readModuleJSON('GH_THERAPY_POINTS', []), nie-tablica albo wyjątek → [].
// Przypadki „różnicowo z monitorem” porównują wynik API z PRAWDZIWYM monitorem sprzed API w atrapie
// tests/support/gh-monitor-atrapa.mjs (usunięcie punktu z tabeli kończy się samym L(): M → E → BC).
//
// Atrapa okna tego pliku (utworzOkno) zapisuje w jednym dzienniku, w kolejności:
//   { rodzaj: 'M',  klucz, wartosc, opcje }        VildaPersistence.writeModuleJSON (wartosc = ten sam obiekt)
//   { rodzaj: 'R',  klucz, zapas }                 VildaPersistence.readModuleJSON
//   { rodzaj: 'E',  typ, detail, wlasne, modul, okno }  document.dispatchEvent; modul = pamięć modułu w chwili
//                                                  zdarzenia, okno = window.ghTherapyPoints w chwili zdarzenia
//   { rodzaj: 'BC', kanal, wiadomosc }             BroadcastChannel#postMessage (kopia wiadomości)
//   { rodzaj: 'N',  klucze, wiadomosc }            opcje.nadaj (klucze wiadomości w chwili wywołania)
//   { rodzaj: 'W' }                                przypisanie window.ghTherapyPoints (tylko z setterem testu)
// To nie jest test kliniczny. Dane wyłącznie FIKCYJNE.

const KANAL = 'gh-therapy-sync';
const ZDARZENIE = 'vilda:therapy-points-changed';
const TAB_ID = 'fikcyjna-karta-A';
const TAB_ID_SESJI = 'fikcyjna-sesja-B';

// Fikcyjny punkt w kształcie monitora (15 kluczy).
const punkt = (id, type, nadpisania = {}) => ({
  id, type, ageYears: 9, ageMonths: 0, weight: 32, height: 130, boneAge: null, dose: 0.025, doseUnit: 'mg/kg/d',
  drug: 'Omnitrope 10 mg', program: 'SNP', igf1: null, igf1Unit: 'ng/mL', igf1DaysSinceDose: null, doseAbs: 0.8,
  ...nadpisania,
});
const WLACZENIE = punkt('fikc-start', 'start');
const KONTYNUACJA = punkt('fikc-kont', 'continue', { ageYears: 10, weight: 36, height: 138, doseAbs: 0.9 });

/* ---------- Atrapa okna ---------- */

function utworzOkno({ getTabId = TAB_ID, sesjaTabId = null, modul } = {}) {
  const dziennik = [];
  const kanaly = [];
  const sluchaczeOkna = [];
  const wywolania = { getTabId: 0, efektyPoboczne: [] };
  const moduly = new Map();
  if (modul !== undefined) moduly.set(KLUCZ_MODULU, JSON.stringify(modul));
  const odczytModulu = () => (moduly.has(KLUCZ_MODULU) ? JSON.parse(moduly.get(KLUCZ_MODULU)) : undefined);

  class AtrapaKanalu {
    constructor(nazwa) {
      this.name = String(nazwa);
      this.wyslane = [];
      this.zamkniety = false;
      kanaly.push(this);
    }
    postMessage(wiadomosc) {
      // Jak w przeglądarce: wysłanie po close() rzuca InvalidStateError.
      if (this.zamkniety) throw new Error('InvalidStateError: fikcyjny kanał jest zamknięty');
      const kopia = structuredClone(wiadomosc);
      this.wyslane.push(kopia);
      dziennik.push({ rodzaj: 'BC', kanal: this.name, wiadomosc: kopia });
    }
    close() { this.zamkniety = true; }
  }
  class AtrapaZdarzenia {
    constructor(typ, init = {}) {
      this.type = typ;
      this.detail = init.detail === undefined ? null : init.detail;
    }
  }

  const sesja = new Map();
  if (sesjaTabId !== null) sesja.set('vildaTabIdV1', sesjaTabId);
  const sessionStorage = {
    getItem: (k) => (sesja.has(String(k)) ? sesja.get(String(k)) : null),
    setItem: (k, v) => { sesja.set(String(k), String(v)); },
    removeItem: (k) => { sesja.delete(String(k)); },
  };

  const VildaPersistence = {
    readModuleJSON(klucz, zapas) {
      dziennik.push({ rodzaj: 'R', klucz, zapas });
      return moduly.has(klucz) ? JSON.parse(moduly.get(klucz)) : zapas;
    },
    writeModuleJSON(klucz, wartosc, opcjeZapisu) {
      dziennik.push({ rodzaj: 'M', klucz, wartosc, opcje: structuredClone(opcjeZapisu) });
      moduly.set(klucz, JSON.stringify(wartosc));
      return true;
    },
  };
  if (getTabId !== null) {
    VildaPersistence.getTabId = () => {
      wywolania.getTabId += 1;
      return typeof getTabId === 'function' ? getTabId() : getTabId;
    };
  }

  const win = {
    document: {
      dispatchEvent(ev) {
        dziennik.push({
          rodzaj: 'E', typ: ev.type, detail: structuredClone(ev.detail), wlasne: ev instanceof AtrapaZdarzenia,
          modul: odczytModulu(), okno: win.ghTherapyPoints,
        });
        return true;
      },
    },
    CustomEvent: AtrapaZdarzenia,
    BroadcastChannel: AtrapaKanalu,
    sessionStorage,
    VildaPersistence,
    addEventListener(typ, fn, o) { sluchaczeOkna.push({ typ, fn, o }); },
    removeEventListener(typ, fn) {
      const i = sluchaczeOkna.findIndex((s) => s.typ === typ && s.fn === fn);
      if (i >= 0) sluchaczeOkna.splice(i, 1);
    },
    // Czego zapisz NIE woła (zostaje u wołającego: F(), J(), mostek, ghTherapyDB).
    VildaSaveStatusIndicator: { notifyExternalChange: (p) => { wywolania.efektyPoboczne.push(['notifyExternalChange', p]); } },
    refreshGHTherapyMonitor: () => { wywolania.efektyPoboczne.push(['refreshGHTherapyMonitor']); },
    setModuleMonitorBadge: (...a) => { wywolania.efektyPoboczne.push(['setModuleMonitorBadge', ...a]); },
    indexedDB: {
      open: (...a) => { wywolania.efektyPoboczne.push(['indexedDB.open', ...a]); throw new Error('fikcyjne IndexedDB'); },
      deleteDatabase: (...a) => { wywolania.efektyPoboczne.push(['indexedDB.deleteDatabase', ...a]); return {}; },
    },
  };
  loadBrowserScript('vilda_gh_punkty.js', win);

  // Zdarzenie okna (pagehide, beforeunload) z obsługą {once:true}, jak w przeglądarce.
  const zdarzenieOkna = (typ) => {
    for (const s of sluchaczeOkna.filter((x) => x.typ === typ)) {
      if (s.o && s.o.once) sluchaczeOkna.splice(sluchaczeOkna.indexOf(s), 1);
      s.fn({ type: typ });
    }
  };
  // Setter window.ghTherapyPoints: każde przypisanie trafia do dziennika ('W').
  const sledzOkno = (poczatkowa) => {
    const przypisania = [];
    let biezaca = poczatkowa;
    Object.defineProperty(win, 'ghTherapyPoints', {
      configurable: true,
      enumerable: true,
      get: () => biezaca,
      set: (v) => { przypisania.push(v); dziennik.push({ rodzaj: 'W' }); biezaca = v; },
    });
    return przypisania;
  };

  return {
    win, A: win.VildaGhPunkty, dziennik, kanaly, sluchaczeOkna, wywolania, moduly, odczytModulu, zdarzenieOkna,
    sledzOkno, wyczysc() { dziennik.length = 0; },
  };
}

// Para atrap PRAWDZIWEGO monitora z tymi samymi opcjami: w jednej usuwa punkt monitor (re() → L()), w drugiej tę samą
// listę zapisuje API (bez nadaj, czyli własnym kanałem). `przed` dostaje okno atrapy przed akcją. Usuwa monitor sprzed
// API (MONITOR_PRZED_API, bez VildaGhPunkty; od raty 3 dzisiejszy monitor nie ma już starego L()): porównanie dotyczy
// starego L(), nie samego API.
function monitorIApi(opcje = {}, przed = () => {}) {
  const punkty = [WLACZENIE, KONTYNUACJA];
  const monitor = utworzAtrapeMonitoraGh(opcjePrzedApi({ punkty, ...opcje }));
  const api = utworzAtrapeMonitoraGh({ punkty, ...opcje, modulPunktow: false });
  loadBrowserScript('vilda_gh_punkty.js', api.win);
  przed(monitor.win);
  przed(api.win);
  const wpisyMonitora = monitor.usun(KONTYNUACJA.id).filter((w) => ['M', 'E', 'BC'].includes(w.rodzaj));
  const lista = api.win.ghTherapyPoints.filter((p) => String(p.id) !== String(KONTYNUACJA.id));
  api.wyczyscDziennik();
  let wynik;
  expect(() => { wynik = api.win.VildaGhPunkty.zapisz(lista); }).not.toThrow();
  return { wpisyMonitora, wpisyApi: api.dziennik.slice(), wynik, monitor, api };
}

/* ---------- zapisz: kolejność L() ---------- */

describe('VildaGhPunkty.zapisz — kolejność kroków jak L() monitora', () => {
  it('moduł {force:true} → zdarzenie {source:"gh"} → {type:"update", tabId} w jednym dzienniku; moduł zapisany przed zdarzeniem; wynik {modul, zdarzenie, kanal} = true', () => {
    const o = utworzOkno();
    const lista = [WLACZENIE, KONTYNUACJA].map((p) => ({ ...p }));

    const wynik = o.A.zapisz(lista);

    expect(wynik).toEqual({ modul: true, zdarzenie: true, kanal: true });
    expect(Object.keys(wynik)).toEqual(['modul', 'zdarzenie', 'kanal']);
    expect(rodzaje(o.dziennik)).toEqual(['M', 'E', 'BC']);
    const [m, e, bc] = o.dziennik;
    // ve() monitora przekazuje adapterowi tę samą tablicę, nie kopię.
    expect(m.klucz).toBe(KLUCZ_MODULU);
    expect(m.wartosc).toBe(lista);
    expect(m.opcje).toEqual({ force: true });
    // Zdarzenie: CustomEvent z okna, typ i detail jak w L(); moduł JUŻ zapisany (synchronicznie), okno = lista.
    expect(e).toEqual({
      rodzaj: 'E', typ: ZDARZENIE, detail: { source: 'gh' }, wlasne: true, modul: structuredClone(lista), okno: lista,
    });
    expect(e.okno).toBe(lista);
    // Kanał: nazwa i wiadomość jak Y() (klucze w tej kolejności).
    expect(bc).toEqual({ rodzaj: 'BC', kanal: KANAL, wiadomosc: { type: 'update', tabId: TAB_ID } });
    expect(Object.keys(bc.wiadomosc)).toEqual(['type', 'tabId']);
    expect(o.win.ghTherapyPoints).toBe(lista);
  });

  it('nie woła odświeżenia monitora, wskaźnika zapisu, znacznika ani IndexedDB (F(), J(), ghTherapyDB zostają u wołającego)', () => {
    const o = utworzOkno();

    o.A.zapisz([punkt('fikc-1', 'start')]);

    expect(o.wywolania.efektyPoboczne).toEqual([]);
    expect(rodzaje(o.dziennik)).toEqual(['M', 'E', 'BC']);
  });

  it('różnicowo z PRAWDZIWYM monitorem: ta sama lista po usunięciu punktu daje te same wpisy M → E → BC (z kolejnością kluczy wiadomości)', () => {
    const { wpisyMonitora, wpisyApi, wynik } = monitorIApi();

    expect(rodzaje(wpisyMonitora)).toEqual(['M', 'E', 'BC']);
    expect(wynik).toEqual({ modul: true, zdarzenie: true, kanal: true });
    expect(wpisyApi).toEqual(wpisyMonitora);
    expect(wpisyApi[2].wiadomosc).toEqual({ type: 'update', tabId: TAB_ID_DOMYSLNY });
    expect(Object.keys(wpisyApi[2].wiadomosc)).toEqual(Object.keys(wpisyMonitora[2].wiadomosc));
  });
});

/* ---------- zapisz: kanał ---------- */

describe('VildaGhPunkty.zapisz — kanał gh-therapy-sync', () => {
  it('z opcje.nadaj: nadaj dostaje {type:"update"} bez tabId (tabId dopisuje Y() wołającego), wynik kanal = !!nadaj(); własny kanał nie powstaje', () => {
    const o = utworzOkno();
    const odebrane = [];
    const nadaj = (zwrot) => (m) => {
      odebrane.push(m);
      o.dziennik.push({ rodzaj: 'N', klucze: Object.keys(m), wiadomosc: { ...m } });
      return zwrot;
    };

    expect(o.A.zapisz([WLACZENIE], { nadaj: nadaj(true) })).toEqual({ modul: true, zdarzenie: true, kanal: true });
    expect(rodzaje(o.dziennik)).toEqual(['M', 'E', 'N']);
    expect(o.dziennik[2]).toEqual({ rodzaj: 'N', klucze: ['type'], wiadomosc: { type: 'update' } });
    // API nie czyta tabId, gdy kanał należy do wołającego.
    expect(o.wywolania.getTabId).toBe(0);

    // Wynik nadaj jest rzutowany na boolean (Y() monitora zwraca true/false).
    expect(o.A.zapisz([WLACZENIE], { nadaj: nadaj(false) }).kanal).toBe(false);
    expect(o.A.zapisz([WLACZENIE], { nadaj: nadaj(undefined) }).kanal).toBe(false);
    expect(o.A.zapisz([WLACZENIE], { nadaj: nadaj(1) }).kanal).toBe(true);
    // Każde wywołanie dostaje nowy obiekt wiadomości.
    expect(new Set(odebrane).size).toBe(4);

    expect(o.kanaly).toEqual([]);
    expect(o.sluchaczeOkna).toEqual([]);
    expect(o.dziennik.some((w) => w.rodzaj === 'BC')).toBe(false);
  });

  it('bez nadaj: własny leniwy BroadcastChannel("gh-therapy-sync") — nie powstaje przy ładowaniu, wczytaj ani gotowe; powstaje przy pierwszym zapisie, jeden na okno; sprzątanie na pagehide i beforeunload z {once:true}', () => {
    const o = utworzOkno();
    expect(o.kanaly).toEqual([]);
    expect(o.sluchaczeOkna).toEqual([]);

    o.A.wczytaj();
    o.A.gotowe();
    o.A.gotowe({ dawka: true });
    o.A.zapisz([WLACZENIE], { nadaj: () => true });
    expect(o.kanaly).toEqual([]);
    expect(o.sluchaczeOkna).toEqual([]);

    o.A.zapisz([WLACZENIE]);
    o.A.zapisz([WLACZENIE, KONTYNUACJA]);
    o.A.zapisz([]);

    expect(o.kanaly).toHaveLength(1);
    expect(o.kanaly[0].name).toBe(KANAL);
    expect(o.kanaly[0].wyslane).toEqual([
      { type: 'update', tabId: TAB_ID }, { type: 'update', tabId: TAB_ID }, { type: 'update', tabId: TAB_ID },
    ]);
    expect(o.sluchaczeOkna.map((s) => [s.typ, s.o])).toEqual([
      ['pagehide', { once: true }], ['beforeunload', { once: true }],
    ]);
    // Z nadaj po utworzeniu własnego kanału — własny kanał milczy.
    o.A.zapisz([WLACZENIE], { nadaj: () => true });
    expect(o.kanaly[0].wyslane).toHaveLength(3);
  });

  it.each(['pagehide', 'beforeunload'])('po „%s” własny kanał jest zamknięty: kolejne zapisy dają kanal:false bez nowego kanału, a moduł i zdarzenie działają dalej', (typ) => {
    const o = utworzOkno();
    expect(o.A.zapisz([WLACZENIE]).kanal).toBe(true);

    o.zdarzenieOkna(typ);
    expect(o.kanaly[0].zamkniety).toBe(true);
    // Drugie zdarzenie sprzątania (np. beforeunload po pagehide) nie rzuca.
    expect(() => { o.zdarzenieOkna('pagehide'); o.zdarzenieOkna('beforeunload'); }).not.toThrow();
    o.wyczysc();

    let wynik;
    expect(() => { wynik = o.A.zapisz([WLACZENIE, KONTYNUACJA]); }).not.toThrow();
    expect(wynik).toEqual({ modul: true, zdarzenie: true, kanal: false });
    expect(rodzaje(o.dziennik)).toEqual(['M', 'E']);
    expect(o.kanaly).toHaveLength(1);
    expect(o.kanaly[0].wyslane).toHaveLength(1);
    expect(o.A.zapisz([]).kanal).toBe(false);
    expect(o.kanaly).toHaveLength(1);
    // Kanał wołającego (nadaj) nie zależy od zamknięcia własnego kanału API.
    expect(o.A.zapisz([], { nadaj: () => true }).kanal).toBe(true);
  });
});

/* ---------- zapisz: tabId jak Y() ---------- */

describe('VildaGhPunkty.zapisz — tabId jak Y() monitora', () => {
  it('3 warianty: getTabId() z VildaPersistence (przed sesją); bez getTabId → sessionStorage.vildaTabIdV1; bez obu → ""', () => {
    const przypadki = [
      [{ getTabId: TAB_ID, sesjaTabId: TAB_ID_SESJI }, TAB_ID],
      [{ getTabId: null, sesjaTabId: TAB_ID_SESJI }, TAB_ID_SESJI],
      [{ getTabId: null }, ''],
      // getTabId zwracające "" nie sięga już do sesji (jak Y()).
      [{ getTabId: '', sesjaTabId: TAB_ID_SESJI }, ''],
    ];
    for (const [opcje, tabId] of przypadki) {
      const o = utworzOkno(opcje);

      const wynik = o.A.zapisz([WLACZENIE]);

      const opis = JSON.stringify(opcje);
      expect(wynik, opis).toEqual({ modul: true, zdarzenie: true, kanal: true });
      expect(o.kanaly[0].wyslane, opis).toEqual([{ type: 'update', tabId }]);
      expect(Object.keys(o.kanaly[0].wyslane[0]), opis).toEqual(['type', 'tabId']);
    }
  });

  it('różnicowo z PRAWDZIWYM monitorem: getTabId, sesja, pusta sesja i getTabId = "" dają tę samą wiadomość', () => {
    const przypadki = [
      { sesjaTabId: TAB_ID_SESJI },
      { getTabId: null, sesjaTabId: TAB_ID_SESJI },
      { getTabId: null },
      { getTabId: '', sesjaTabId: TAB_ID_SESJI },
    ];
    for (const opcje of przypadki) {
      const { wpisyMonitora, wpisyApi } = monitorIApi(opcje);
      const opis = JSON.stringify(opcje);
      expect(wpisyApi.at(-1), opis).toStrictEqual(wpisyMonitora.at(-1));
      expect(Object.keys(wpisyApi.at(-1).wiadomosc), opis).toEqual(Object.keys(wpisyMonitora.at(-1).wiadomosc));
    }
  });

  // Y() monitora: wyjątek przy ustalaniu tabId połyka wewnętrzny try {} i wysyła wiadomość BEZ pola tabId (przypięte
  // też w gh-punkty-charakterystyka-monitor.test.mjs); bez window.sessionStorage pole też nie powstaje. Odbiorca
  // w app.js (`!t.tabId` → pomiń) traktuje brak pola i "" tak samo, ale kształt wiadomości jest częścią kontraktu 1:1.
  it.each([
    ['wyjątek getTabId', { getTabId: () => { throw new Error('fikcyjny błąd getTabId'); }, sesjaTabId: TAB_ID_SESJI }, () => {}],
    ['brak getTabId i brak window.sessionStorage', { getTabId: null }, (win) => { delete win.sessionStorage; }],
    ['brak getTabId i wyjątek przy odczycie window.sessionStorage', { getTabId: null }, (win) => {
      Object.defineProperty(win, 'sessionStorage', { configurable: true, get() { throw new Error('fikcyjny SecurityError'); } });
    }],
  ])('różnicowo z PRAWDZIWYM monitorem — %s: wiadomość {type:"update"} bez pola tabId, jak Y()', (_opis, opcje, przed) => {
    const { wpisyMonitora, wpisyApi, wynik } = monitorIApi(opcje, przed);

    expect(wpisyMonitora.at(-1)).toStrictEqual({ rodzaj: 'BC', kanal: KANAL, wiadomosc: { type: 'update' } });
    expect(wynik).toEqual({ modul: true, zdarzenie: true, kanal: true });
    expect(wpisyApi.at(-1)).toStrictEqual(wpisyMonitora.at(-1));
    expect(Object.keys(wpisyApi.at(-1).wiadomosc)).toEqual(['type']);
  });
});

/* ---------- zapisz: window.ghTherapyPoints ---------- */

describe('VildaGhPunkty.zapisz — window.ghTherapyPoints', () => {
  it('ta sama referencja: bez przypisania (setter nie jest wołany — w monitorze to brak operacji); inna referencja: jedno przypisanie przed zapisem modułu', () => {
    const o = utworzOkno();
    const lista = [punkt('fikc-1', 'start')];
    const przypisania = o.sledzOkno(lista);

    expect(o.A.zapisz(lista)).toEqual({ modul: true, zdarzenie: true, kanal: true });
    expect(przypisania).toEqual([]);
    expect(rodzaje(o.dziennik)).toEqual(['M', 'E', 'BC']);
    expect(o.dziennik[0].wartosc).toBe(lista);

    o.wyczysc();
    const inna = [punkt('fikc-1', 'start'), punkt('fikc-2', 'continue')];
    o.A.zapisz(inna);
    expect(przypisania).toHaveLength(1);
    expect(przypisania[0]).toBe(inna);
    expect(rodzaje(o.dziennik)).toEqual(['W', 'M', 'E', 'BC']);
    expect(o.dziennik[2].okno).toBe(inna);
  });

  it('okno tylko do odczytu (setter rzuca): bez wyjątku, moduł, zdarzenie i kanał idą dalej', () => {
    const o = utworzOkno();
    const stara = [WLACZENIE];
    Object.defineProperty(o.win, 'ghTherapyPoints', {
      configurable: true, get: () => stara, set: () => { throw new TypeError('fikcyjne okno tylko do odczytu'); },
    });
    const nowa = [WLACZENIE, KONTYNUACJA];

    let wynik;
    expect(() => { wynik = o.A.zapisz(nowa); }).not.toThrow();

    expect(wynik).toEqual({ modul: true, zdarzenie: true, kanal: true });
    expect(rodzaje(o.dziennik)).toEqual(['M', 'E', 'BC']);
    expect(o.dziennik[0].wartosc).toBe(nowa);
    expect(o.win.ghTherapyPoints).toBe(stara);
  });
});

/* ---------- zapisz: brak zależności ---------- */

describe('VildaGhPunkty.zapisz — opcje.blad: dziennik błędów wołającego (monitor podaje własny, P-GH-PUNKTY-API rata 2)', () => {
  it('błąd zapisu modułu i błąd nadawcy trafiają do opcje.blad (raz każdy), a kolejne kroki idą dalej', () => {
    const o = utworzOkno();
    o.win.VildaPersistence.writeModuleJSON = () => { throw new Error('fikcyjny błąd zapisu'); };
    const bledy = [];
    const wynik = o.A.zapisz([WLACZENIE], { nadaj: () => { throw new Error('fikcyjny błąd kanału'); }, blad: (e) => bledy.push(e.message) });
    expect(wynik).toEqual({ modul: false, zdarzenie: true, kanal: false });
    expect(bledy).toEqual(['fikcyjny błąd zapisu', 'fikcyjny błąd kanału']);
  });

  it('bez błędów opcje.blad nie jest wołane; dziennik, który sam rzuca, nie zatrzymuje zapisu', () => {
    const o = utworzOkno();
    const bledy = [];
    expect(o.A.zapisz([WLACZENIE], { nadaj: () => true, blad: (e) => bledy.push(e) })).toEqual({ modul: true, zdarzenie: true, kanal: true });
    expect(bledy).toEqual([]);

    const p = utworzOkno();
    p.win.VildaPersistence.writeModuleJSON = () => { throw new Error('fikcyjny błąd zapisu'); };
    let wynik;
    expect(() => { wynik = p.A.zapisz([WLACZENIE], { nadaj: () => true, blad: () => { throw new Error('dziennik'); } }); }).not.toThrow();
    expect(wynik).toEqual({ modul: false, zdarzenie: true, kanal: true });
  });
});

describe('VildaGhPunkty.zapisz — brak każdej zależności osobno: bez wyjątku, pozostałe kroki działają (jak L())', () => {
  const rzuca = (tekst) => () => { throw new Error(tekst); };
  const przypadki = [
    ['brak VildaPersistence', (o) => { delete o.win.VildaPersistence; }, { modul: false, zdarzenie: true, kanal: true }, ['E', 'BC'], TAB_ID_SESJI],
    ['VildaPersistence bez writeModuleJSON', (o) => { delete o.win.VildaPersistence.writeModuleJSON; }, { modul: false, zdarzenie: true, kanal: true }, ['E', 'BC'], TAB_ID],
    ['writeModuleJSON rzuca', (o) => { o.win.VildaPersistence.writeModuleJSON = rzuca('fikcyjny błąd zapisu'); }, { modul: false, zdarzenie: true, kanal: true }, ['E', 'BC'], TAB_ID],
    ['writeModuleJSON odmawia (false)', (o) => { o.win.VildaPersistence.writeModuleJSON = () => false; }, { modul: false, zdarzenie: true, kanal: true }, ['E', 'BC'], TAB_ID],
    ['brak document', (o) => { delete o.win.document; }, { modul: true, zdarzenie: false, kanal: true }, ['M', 'BC'], TAB_ID],
    ['document.dispatchEvent rzuca', (o) => { o.win.document.dispatchEvent = rzuca('fikcyjny błąd zdarzenia'); }, { modul: true, zdarzenie: false, kanal: true }, ['M', 'BC'], TAB_ID],
    ['brak CustomEvent', (o) => { delete o.win.CustomEvent; }, { modul: true, zdarzenie: false, kanal: true }, ['M', 'BC'], TAB_ID],
    ['brak BroadcastChannel', (o) => { delete o.win.BroadcastChannel; }, { modul: true, zdarzenie: true, kanal: false }, ['M', 'E'], null],
    ['konstruktor BroadcastChannel rzuca', (o) => { o.win.BroadcastChannel = function () { throw new Error('fikcyjny błąd kanału'); }; }, { modul: true, zdarzenie: true, kanal: false }, ['M', 'E'], null],
  ];

  it.each(przypadki)('%s', (_opis, usun, oczekiwany, kolejnosc, tabId) => {
    const o = utworzOkno({ sesjaTabId: TAB_ID_SESJI });
    usun(o);
    const lista = [WLACZENIE, KONTYNUACJA];

    let wynik;
    expect(() => { wynik = o.A.zapisz(lista); }).not.toThrow();

    expect(wynik).toEqual(oczekiwany);
    expect(rodzaje(o.dziennik)).toEqual(kolejnosc);
    expect(o.win.ghTherapyPoints).toBe(lista);
    if (tabId !== null) expect(o.dziennik.at(-1).wiadomosc).toEqual({ type: 'update', tabId });
    if (kolejnosc.includes('E')) expect(o.dziennik.find((w) => w.rodzaj === 'E').detail).toEqual({ source: 'gh' });
  });

  it('nadaj rzuca: kanal:false bez wyjątku, moduł i zdarzenie zapisane; własny kanał NIE powstaje w zastępstwie', () => {
    const o = utworzOkno();

    let wynik;
    expect(() => { wynik = o.A.zapisz([WLACZENIE], { nadaj: rzuca('fikcyjny błąd nadaj') }); }).not.toThrow();

    expect(wynik).toEqual({ modul: true, zdarzenie: true, kanal: false });
    expect(rodzaje(o.dziennik)).toEqual(['M', 'E']);
    expect(o.kanaly).toEqual([]);
  });

  it('wszystkie zależności naraz: {modul:false, zdarzenie:false, kanal:false} bez wyjątku; okno i tak dostaje listę', () => {
    const o = utworzOkno();
    for (const k of ['VildaPersistence', 'document', 'CustomEvent', 'BroadcastChannel', 'sessionStorage']) delete o.win[k];
    const lista = [WLACZENIE];

    let wynik;
    expect(() => { wynik = o.A.zapisz(lista); }).not.toThrow();

    expect(wynik).toEqual({ modul: false, zdarzenie: false, kanal: false });
    expect(o.dziennik).toEqual([]);
    expect(o.win.ghTherapyPoints).toBe(lista);
  });

  it.each([
    ['brak VildaPersistence', (win) => { delete win.VildaPersistence; }],
    ['writeModuleJSON rzuca', (win) => { win.VildaPersistence.writeModuleJSON = () => { throw new Error('fikcyjny błąd zapisu'); }; }],
    ['writeModuleJSON odmawia (false)', (win) => { win.VildaPersistence.writeModuleJSON = () => false; }],
  ])('różnicowo z PRAWDZIWYM monitorem — %s: te same sygnały E → BC', (_opis, przed) => {
    const { wpisyMonitora, wpisyApi, wynik } = monitorIApi({ sesjaTabId: TAB_ID_SESJI }, przed);

    expect(rodzaje(wpisyMonitora)).toEqual(['E', 'BC']);
    expect(wynik.modul).toBe(false);
    expect(wpisyApi).toEqual(wpisyMonitora);
  });
});

/* ---------- zapisz: punkty i lista ---------- */

describe('VildaGhPunkty.zapisz — punkty i lista bez przepisywania', () => {
  it('zamrożone punkty i zamrożona lista (Object.freeze) przechodzą bez zmian i bez wyjątku; adapter dostaje ten sam obiekt', () => {
    const o = utworzOkno();
    const lista = Object.freeze([
      Object.freeze(punkt('fikc-1', 'start')),
      Object.freeze(punkt('fikc-2', 'continue', { obcePole: 'fikcyjne', ageMonths: 14 })),
    ]);
    const przed = structuredClone(lista);
    const elementy = lista.slice();

    let wynik;
    expect(() => { wynik = o.A.zapisz(lista); }).not.toThrow();

    expect(wynik).toEqual({ modul: true, zdarzenie: true, kanal: true });
    expect(o.dziennik[0].wartosc).toBe(lista);
    expect(Object.isFrozen(lista)).toBe(true);
    lista.forEach((p, i) => {
      expect(p).toBe(elementy[i]);
      expect(Object.isFrozen(p)).toBe(true);
      expect(Object.keys(p)).toEqual(Object.keys(przed[i]));
    });
    expect(lista).toEqual(przed);
    expect(o.odczytModulu()).toEqual(przed);
    expect(o.win.ghTherapyPoints).toBe(lista);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['obiekt tablicopodobny', { 0: WLACZENIE, length: 1 }],
    ['tekst', '[{"id":"fikc-1"}]'],
    ['liczba', 7],
  ])('lista nie-tablica (%s) → moduł dostaje [] (jak ve()), window.ghTherapyPoints bez zmian; zdarzenie i kanał idą dalej', (_opis, wartosc) => {
    const o = utworzOkno();
    const poprzednia = [WLACZENIE];
    o.win.ghTherapyPoints = poprzednia;

    let wynik;
    expect(() => { wynik = o.A.zapisz(wartosc); }).not.toThrow();

    expect(wynik).toEqual({ modul: true, zdarzenie: true, kanal: true });
    expect(rodzaje(o.dziennik)).toEqual(['M', 'E', 'BC']);
    expect(Array.isArray(o.dziennik[0].wartosc)).toBe(true);
    expect(o.dziennik[0].wartosc).toEqual([]);
    expect(o.win.ghTherapyPoints).toBe(poprzednia);

    // Okno bez listy zostaje bez listy.
    const czyste = utworzOkno();
    czyste.A.zapisz(wartosc);
    expect('ghTherapyPoints' in czyste.win).toBe(false);
  });
});

/* ---------- wczytaj ---------- */

describe('VildaGhPunkty.wczytaj — jak be() monitora', () => {
  it('zwraca tablicę z pamięci modułu GH_THERAPY_POINTS bez normalizacji; odczyt z zapasem []; bez zdarzenia, zapisu, kanału i zapisu do window', () => {
    // Lista z dziwnymi wpisami: wczytaj ich nie poprawia (D8 — bez przepisywania przy odczycie).
    const zapisana = [punkt('fikc-1', 'start', { obcePole: 'fikcyjne' }), null, { id: 7 }];
    const o = utworzOkno({ modul: zapisana });
    const przypisania = o.sledzOkno(undefined);

    const wynik = o.A.wczytaj();

    expect(wynik).toEqual(zapisana);
    expect(rodzaje(o.dziennik)).toEqual(['R']);
    expect(o.dziennik[0]).toEqual({ rodzaj: 'R', klucz: KLUCZ_MODULU, zapas: [] });
    expect(przypisania).toEqual([]);
    expect(o.kanaly).toEqual([]);
    expect(o.sluchaczeOkna).toEqual([]);
    expect(o.wywolania.efektyPoboczne).toEqual([]);
  });

  it('oddaje tę samą tablicę, którą zwrócił adapter (be() jej nie kopiuje)', () => {
    const o = utworzOkno();
    const zAdaptera = [punkt('fikc-1', 'start')];
    o.win.VildaPersistence.readModuleJSON = () => zAdaptera;

    expect(o.A.wczytaj()).toBe(zAdaptera);
  });

  it.each([
    ['pusta pamięć modułu (zapas [])', () => {}],
    ['adapter zwraca null', (o) => { o.win.VildaPersistence.readModuleJSON = () => null; }],
    ['adapter zwraca obiekt', (o) => { o.win.VildaPersistence.readModuleJSON = () => ({ 0: WLACZENIE, length: 1 }); }],
    ['adapter zwraca tekst JSON', (o) => { o.win.VildaPersistence.readModuleJSON = () => '[{"id":"fikc-1"}]'; }],
    ['adapter zwraca undefined', (o) => { o.win.VildaPersistence.readModuleJSON = () => undefined; }],
    ['readModuleJSON rzuca', (o) => { o.win.VildaPersistence.readModuleJSON = () => { throw new Error('fikcyjny błąd odczytu'); }; }],
    ['VildaPersistence bez readModuleJSON', (o) => { delete o.win.VildaPersistence.readModuleJSON; }],
    ['brak VildaPersistence', (o) => { delete o.win.VildaPersistence; }],
    ['VildaPersistence nie jest obiektem', (o) => { o.win.VildaPersistence = true; }],
  ])('%s → [] bez wyjątku, bez zapisu i sygnałów', (_opis, przygotuj) => {
    const o = utworzOkno();
    przygotuj(o);
    const przypisania = o.sledzOkno(undefined);

    let wynik;
    expect(() => { wynik = o.A.wczytaj(); }).not.toThrow();

    expect(Array.isArray(wynik)).toBe(true);
    expect(wynik).toEqual([]);
    // Każde wywołanie daje nową pustą tablicę — zmiana jednej nie przecieka do następnego odczytu.
    wynik.push('fikcyjny wpis');
    expect(o.A.wczytaj()).toEqual([]);
    expect(o.dziennik.filter((w) => w.rodzaj !== 'R')).toEqual([]);
    expect(przypisania).toEqual([]);
    expect(o.kanaly).toEqual([]);
  });

  it('po zapisz → wczytaj oddaje to, co trafiło do pamięci modułu', () => {
    const o = utworzOkno();
    const lista = [punkt('fikc-1', 'start'), punkt('fikc-2', 'end', { ageYears: 12 })];

    o.A.zapisz(lista);

    expect(o.A.wczytaj()).toEqual(lista);
  });
});

/* ---------- gotowe ---------- */

describe('VildaGhPunkty.gotowe — czy zależności zapisu są dostępne', () => {
  it('pełne okno: {ok:true, braki:[], kanal:true, tabId:true}; nie tworzy kanału, nie czyta i nie zapisuje magazynu', () => {
    const o = utworzOkno();

    expect(o.A.gotowe()).toEqual({ ok: true, braki: [], kanal: true, tabId: true });
    expect(o.A.gotowe({ dawka: true })).toEqual({ ok: true, braki: [], kanal: true, tabId: true });
    expect(o.dziennik).toEqual([]);
    expect(o.kanaly).toEqual([]);
    expect(o.sluchaczeOkna).toEqual([]);
  });

  it.each([
    ['brak VildaPersistence', (o) => { delete o.win.VildaPersistence; }, ['VildaPersistence.readModuleJSON', 'VildaPersistence.writeModuleJSON']],
    ['VildaPersistence nie jest obiektem', (o) => { o.win.VildaPersistence = 'fikcyjny'; }, ['VildaPersistence.readModuleJSON', 'VildaPersistence.writeModuleJSON']],
    ['brak readModuleJSON', (o) => { delete o.win.VildaPersistence.readModuleJSON; }, ['VildaPersistence.readModuleJSON']],
    ['brak writeModuleJSON', (o) => { delete o.win.VildaPersistence.writeModuleJSON; }, ['VildaPersistence.writeModuleJSON']],
  ])('%s → ok:false z brakami (kolejność: odczyt, zapis)', (_opis, usun, braki) => {
    const o = utworzOkno({ sesjaTabId: TAB_ID_SESJI });
    usun(o);

    const wynik = o.A.gotowe();

    expect(wynik).toEqual({ ok: false, braki, kanal: true, tabId: true });
  });

  it('kanal i tabId tylko informacyjnie: brak BroadcastChannel i pusty tabId nie blokują (ok:true)', () => {
    const bezKanalu = utworzOkno();
    delete bezKanalu.win.BroadcastChannel;
    expect(bezKanalu.A.gotowe()).toEqual({ ok: true, braki: [], kanal: false, tabId: true });

    const przypadkiTabId = [
      [{ getTabId: null, sesjaTabId: TAB_ID_SESJI }, true],
      [{ getTabId: null }, false],
      [{ getTabId: '', sesjaTabId: TAB_ID_SESJI }, false],
      [{ getTabId: () => { throw new Error('fikcyjny błąd getTabId'); } }, false],
    ];
    for (const [opcje, tabId] of przypadkiTabId) {
      const o = utworzOkno(opcje);
      let wynik;
      expect(() => { wynik = o.A.gotowe(); }).not.toThrow();
      expect(wynik, JSON.stringify(opcje)).toEqual({ ok: true, braki: [], kanal: true, tabId });
    }

    const bezSesji = utworzOkno({ getTabId: null });
    delete bezSesji.win.sessionStorage;
    expect(bezSesji.A.gotowe()).toEqual({ ok: true, braki: [], kanal: true, tabId: false });
  });

  it('{dawka:true} wymaga VildaGhDawka.preparat; bez tej opcji moduł dawki nie jest sprawdzany', () => {
    const o = utworzOkno();
    expect(typeof o.win.VildaGhDawka.preparat).toBe('function');
    expect(o.A.gotowe({ dawka: true }).ok).toBe(true);

    const bezDawki = utworzOkno();
    delete bezDawki.win.VildaGhDawka;
    expect(bezDawki.A.gotowe()).toEqual({ ok: true, braki: [], kanal: true, tabId: true });
    expect(bezDawki.A.gotowe({ dawka: false })).toEqual({ ok: true, braki: [], kanal: true, tabId: true });
    expect(bezDawki.A.gotowe({ dawka: true })).toEqual({ ok: false, braki: ['VildaGhDawka.preparat'], kanal: true, tabId: true });

    const pustyModul = utworzOkno();
    pustyModul.win.VildaGhDawka = {};
    expect(pustyModul.A.gotowe({ dawka: true })).toEqual({ ok: false, braki: ['VildaGhDawka.preparat'], kanal: true, tabId: true });

    // Obiekt w opcje.dawka znaczy to samo co w polaZPodawanej: sprawdzany jest wstrzyknięty moduł, nie okno.
    expect(pustyModul.A.gotowe({ dawka: o.win.VildaGhDawka }).ok).toBe(true);
    expect(o.A.gotowe({ dawka: {} })).toEqual({ ok: false, braki: ['VildaGhDawka.preparat'], kanal: true, tabId: true });

    // Kolejność braków: odczyt, zapis, moduł dawki.
    const nic = utworzOkno();
    for (const k of ['VildaPersistence', 'VildaGhDawka', 'BroadcastChannel', 'sessionStorage']) delete nic.win[k];
    expect(nic.A.gotowe({ dawka: true })).toEqual({
      ok: false,
      braki: ['VildaPersistence.readModuleJSON', 'VildaPersistence.writeModuleJSON', 'VildaGhDawka.preparat'],
      kanal: false,
      tabId: false,
    });
  });
});
