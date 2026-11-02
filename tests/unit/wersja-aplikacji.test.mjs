// E2-PR1w (P-WERSJA-APLIKACJI; decyzja właściciela 4 z 2026-10-29, decyzje z 2026-11-02) — linia „Wersja aplikacji”
// na dole Ustawień.
//
// Strona pyta service worker, który ją naprawdę obsługuje (navigator.serviceWorker.controller), przez MessageChannel
// ({type:'VILDA_WERSJA'}); SW odpowiada własną stałą SW_VERSION. Oczekujący SW (registration.waiting) pytany osobno.
// Bez kontrolera — „nieustalona” (registration.active nie jest pytany). Czytnik jest blokiem na końcu istniejącego
// inline_ustawienia_07.js (bez nowego pliku: limit 600 żądań instalacji SW, decyzja 2 z 2026-11-02). Test wykonuje
// CAŁY prawdziwy plik w vm (kontekst = atrapa okna, z kodem kłódki), a SW — prawdziwy service-worker-kalorii.js przez
// new Function z przechwyconym nasłuchem message. Dane fikcyjne (numery wersji wymyślone).
//
// Przypadki:
//   W1  brak navigator.serviceWorker → „nieustalona”.         W2  getRegistration() → undefined, bez kontrolera.
//   W2b serviceWorker bez getRegistration, z kontrolerem → „nieustalona”, kontroler niepytany.
//   W3  kontroler odpowiada → numer; bez kontrolera, z registration.active → „nieustalona”, active nie pytany.
//   W4  kontroler milczy 2 s → „starsza wersja (numer nieznany)” (przed limitem dalej „sprawdzam…”).
//   W5  oczekujący odpowiada → „X · gotowa aktualizacja Y”.   W5b kontroler milczy, oczekujący odpowiada.
//   W6  installing bez oczekującego → „X · pobieranie aktualizacji…”.  W7 tylko installing, bez kontrolera.
//   W8  controllerchange → nowy odczyt.                        W9  nowszy odczyt wygrywa (pokolenie).
//   W10 odpowiedź spoza wzoru → jak brak odpowiedzi.           W10b wersje testowe z sufiksem przyjęte.
//   W11 obca pamięć, caches/storage/fetch nietknięte.          W12 tylko textContent, zapis tylko przy zmianie.
//   W13 oczekujący milczy → „X · gotowa aktualizacja” bez numeru; porty zamknięte po odpowiedzi i po limicie.
//   W14 przejścia: updatefound (pobieranie…) → statechange installed (gotowa Y) → controllerchange (Y).
//   W14b visibilitychange (widoczna) → odczyt.                 W14c instalacja nieudana (redundant) → bez dopisku.
//   W14d pierwsza wizyta, pierwsza instalacja nieudana bez ready i controllerchange → „nieustalona” od razu;
//        kolejne odczyty w trakcie instalacji nie mnożą nasłuchu statechange.
//   W14e statechange w trakcie pytania wolnego kontrolera → po odpowiedzi „gotowa aktualizacja” (nasłuch przed pytaniem).
//   W14f to samo z milczącym kontrolerem (stary SW, pierwsze wydanie) i pełnym oknem 2 s.
//   W15 tekst() — tabela stanów; API zamrożone.                W16 brak MessageChannel → „nieustalona”.
//   W17 getRegistration() odrzuca → bez kontrolera „nieustalona”, z kontrolerem numer.
//   W18 pierwsza wizyta: bez rejestracji „nieustalona”, po ready i przejęciu (claim) numer.
//   W19 visibilitychange przy ukrytej stronie → bez pytania.  W20 zegar limitu wyczyszczony po odpowiedzi.
//   W21 okno bez document/navigator (jak w powloka-ustawienia-konto) → bez wyjątku, bez timerów.
//   W22 installing i waiting naraz → tylko „gotowa aktualizacja”.
//   W24 rzucający getter navigator.serviceWorker → „nieustalona”, bez wyjątku, visibilitychange dalej działa.
//   W23 gość: kłódka chowa strefę niebezpieczną, linia zostaje (czytnik nie dotyka stylów).
//   SW1 VILDA_WERSJA z portem → {type, wersja = SW_VERSION z pliku}. SW2 SKIP_WAITING bez zmian; nieznany typ bez
//       odpowiedzi; VILDA_WERSJA bez portów nie rzuca. SW3 VILDA_WERSJA nie woła skipWaiting.
//   SW4 czytnik strony + prawdziwy nasłuch SW → numer = SW_VERSION z pliku (oczekujący też prawdziwy SW).
//   SW5 SW bez gałęzi VILDA_WERSJA (jak 1.1.437 i starsze, pierwsze wydanie) + nowy oczekujący → „starsza wersja … · gotowa …”.
//   S1  strażniki źródła: blok między znacznikami na końcu 07, po kłódce; cały 07 ASCII; blok bez ?v=, literału x.y.z,
//       SW_VERSION=, caches/fetch/storage/innerHTML/.style, var f=[ i gołego document/navigator; jedno
//       „const SW_VERSION = '” w SW; brak vilda_wersja_aplikacji w SW i na dysku.
//   S2  ustawienia.html: akapit bezpośrednio w .settings-content, po strefie niebezpiecznej, poza details, ostatni, bez
//       style=, z aria-live; 07 ostatnim skryptem strony, bez nowego tagu; reguły CSS (kolor --text-2 przy ciemnym tle 2:
//       w układzie wąskim linia leży na #e0e0e0, gdzie #586d72 daje 4,14:1 — pomiar w e2e).
//
// Czerwone na bazie d77c0973 (sprawdzone): 43 z 44 — wszystkie poza SW2 (SKIP_WAITING działa i dziś; strażnik, że
// nowa gałąź go nie psuje). Mutanty czytnika i gałęzi SW (limit 3 s, pytanie registration.active, brak dopisku przy
// milczącym oczekującym, bez controllerchange/statechange/updatefound/ready, bez pokolenia, bez zamykania portu
// i czyszczenia zegara, odczyt przy ukrytej stronie, pierwszeństwo installing, bez wzoru wersji, skipWaiting przy
// pytaniu, odpowiedź bez portu, stała zamiast SW_VERSION, goły navigator, bez strażnika getRegistration, bez śledzenia
// instalacji w odczycie, nasłuch statechange dopiero po pytaniu, nasłuch jako nowe domknięcie, bez osłony gettera
// navigator.serviceWorker, bez koloru przy ciemnym tle 2 i inne): każdy nierównoważny zabity. Równoważne: brak
// „if (koniec) return;” (obietnica rozwiązuje się raz, clearTimeout/close idempotentne) i brak „port1.onmessage = null”
// (zamknięty port nic nie dostarcza); nieszkodliwe: śledzenie statechange także oczekującego (dodatkowy odczyt, ten sam
// tekst).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const KORZEN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (p) => fs.readFileSync(path.join(KORZEN, p), 'utf8');
const PLIK = 'inline_ustawienia_07.js';
const LIMIT_MS = 2000;

afterEach(() => { vi.useRealTimers(); });

// ── Atrapy okna ──
function atrapaKanalu(dziennik) {
  return class MessageChannel {
    constructor() {
      const port1 = { onmessage: null, zamkniety: false, close() { port1.zamkniety = true; dziennik.push('close'); } };
      const port2 = {
        postMessage(data) {
          Promise.resolve().then(() => { if (!port1.zamkniety && typeof port1.onmessage === 'function') port1.onmessage({ data }); });
        },
      };
      this.port1 = port1;
      this.port2 = port2;
      dziennik.push('kanal');
    }
  };
}
// Worker: odpowiada na VILDA_WERSJA (wersja albo dowolna wartość `odpowiedz`), milczy przy odpowiedz === undefined.
function worker(odpowiedz, wpis = {}) {
  const et = new EventTarget();
  return Object.assign({
    pytania: 0,
    postMessage(msg, porty) {
      this.pytania += 1;
      if (wpis.zwloka) { wpis.zwloka.push(() => this._odpowiedz(msg, porty)); return; }
      this._odpowiedz(msg, porty);
    },
    _odpowiedz(msg, porty) {
      if (!msg || msg.type !== 'VILDA_WERSJA' || odpowiedz === undefined) return;
      const dane = odpowiedz && typeof odpowiedz === 'object' ? odpowiedz : { type: 'VILDA_WERSJA', wersja: odpowiedz };
      porty[0].postMessage(dane);
    },
    addEventListener: (...a) => et.addEventListener(...a),
    dispatchEvent: (e) => et.dispatchEvent(e),
  }, wpis.pola || {});
}
function elementWartosci() {
  const el = { _t: 'sprawdzam…', zapisy: 0 };
  Object.defineProperty(el, 'textContent', { get() { return el._t; }, set(v) { el.zapisy += 1; el._t = String(v); } });
  Object.defineProperty(el, 'innerHTML', { get() { throw new Error('innerHTML niedozwolone'); }, set() { throw new Error('innerHTML niedozwolone'); } });
  Object.defineProperty(el, 'style', { get() { throw new Error('style niedozwolone'); } });
  return el;
}
function okno({ sw = true, rejestracja = null, controller = null, kanal = true, caches = null } = {}) {
  const dziennik = [];
  const dok = new EventTarget();
  const el = elementWartosci();
  const strefa = { style: { display: '' } };
  const document = {
    readyState: 'interactive', visibilityState: 'visible',
    getElementById: (id) => (id === 'settingsAppVersionValue' ? el : null),
    // Kłódka (ten sam plik): .settings-danger-zone i linki podnawigacji; sekcje (getElementById) — brak.
    querySelector: (sel) => (sel === '.settings-danger-zone' ? strefa : null),
    addEventListener: (...a) => dok.addEventListener(...a),
    dispatchEvent: (e) => dok.dispatchEvent(e),
  };
  const swEt = new EventTarget();
  let gotowa;
  const stan = { reg: rejestracja, controller };
  const serviceWorker = sw ? {
    get controller() { return stan.controller; },
    getRegistration: vi.fn(async () => stan.reg || undefined),
    ready: new Promise((r) => { gotowa = r; }),
    addEventListener: (...a) => swEt.addEventListener(...a),
    dispatchEvent: (e) => swEt.dispatchEvent(e),
  } : undefined;
  const win = {
    document, navigator: sw ? { serviceWorker } : {},
    MessageChannel: kanal ? atrapaKanalu(dziennik) : undefined,
    setTimeout: (...a) => setTimeout(...a), clearTimeout: (...a) => clearTimeout(...a),
    caches, localStorage: { setItem: vi.fn(), getItem: vi.fn(() => null) }, sessionStorage: { setItem: vi.fn(), getItem: vi.fn(() => null) },
    fetch: vi.fn(() => Promise.reject(new Error('sieć niedozwolona'))),
  };
  win.window = win;
  return { win, el, strefa, dziennik, stan, gotowa: (r) => gotowa(r), serviceWorker };
}
function rejestracja({ active = null, waiting = null, installing = null } = {}) {
  const et = new EventTarget();
  return { active, waiting, installing, addEventListener: (...a) => et.addEventListener(...a), dispatchEvent: (e) => et.dispatchEvent(e) };
}
// Cały prawdziwy inline_ustawienia_07.js (kłódka + czytnik) w kontekście = atrapa okna.
function zaladuj(o) {
  vm.createContext(o.win);
  vm.runInContext(czytaj(PLIK), o.win, { filename: PLIK });
  return o.win.VildaWersjaAplikacji;
}
const tury = async (n = 10) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

describe('E2-PR1w P-WERSJA-APLIKACJI: czytnik wersji (blok w inline_ustawienia_07.js)', () => {
  it('W1: brak navigator.serviceWorker — nieustalona', async () => {
    const o = okno({ sw: false });
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('nieustalona');
    expect(o.el.textContent).toBe('nieustalona');
    expect(await api.odczytaj()).toMatchObject({ stan: 'brak', aktywna: null, oczekujaca: null, czeka: false, instalacja: false });
  });

  it('W2: getRegistration() → undefined i brak kontrolera (Playwright serviceWorkers: block) — nieustalona', async () => {
    const o = okno();
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('nieustalona');
    expect(o.serviceWorker.getRegistration).toHaveBeenCalled();
  });

  it('W2b: navigator.serviceWorker bez getRegistration (niepełne API), z kontrolerem — „nieustalona”, kontroler nie jest pytany', async () => {
    const k = worker('1.1.436');
    const o = okno({ controller: k });
    delete o.serviceWorker.getRegistration;
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('nieustalona');
    expect(k.pytania).toBe(0);
    expect(o.dziennik).not.toContain('kanal');
  });

  it('W3: kontroler odpowiada — numer; bez kontrolera (Shift+F5) „nieustalona”, registration.active nie jest pytany', async () => {
    const kontroler = worker('1.1.436');
    const aktywny = worker('0.0.1');
    const o = okno({ rejestracja: rejestracja({ active: aktywny }), controller: kontroler });
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('1.1.436');
    expect(o.el.textContent).toBe('1.1.436');
    o.stan.controller = null;
    expect(await api.odswiez()).toBe('nieustalona');
    expect(aktywny.pytania).toBe(0);
  });

  it('W4: kontroler milczy dłużej niż 2 s (SW sprzed tej zmiany) — „starsza wersja (numer nieznany)”', async () => {
    vi.useFakeTimers();
    const k = worker(undefined);
    const o = okno({ rejestracja: rejestracja({ active: k }), controller: k });
    const api = zaladuj(o);
    const p = api.odswiez();
    await vi.advanceTimersByTimeAsync(LIMIT_MS - 1);
    expect(o.el.textContent).toBe('sprawdzam…');
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe('starsza wersja (numer nieznany)');
    expect(o.el.textContent).toBe('starsza wersja (numer nieznany)');
  });

  it('W5: oczekujący odpowiada — „1.1.436 · gotowa aktualizacja 1.1.437”', async () => {
    const k = worker('1.1.436');
    const o = okno({ rejestracja: rejestracja({ active: k, waiting: worker('1.1.437') }), controller: k });
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('1.1.436 · gotowa aktualizacja 1.1.437');
  });

  it('W5b: kontroler milczy, oczekujący odpowiada — „starsza wersja (numer nieznany) · gotowa aktualizacja …”', async () => {
    vi.useFakeTimers();
    const k = worker(undefined);
    const o = okno({ rejestracja: rejestracja({ active: k, waiting: worker('1.1.437') }), controller: k });
    const api = zaladuj(o);
    const p = api.odswiez();
    await vi.advanceTimersByTimeAsync(LIMIT_MS);
    expect(await p).toBe('starsza wersja (numer nieznany) · gotowa aktualizacja 1.1.437');
  });

  it('W6: installing bez oczekującego — „1.1.436 · pobieranie aktualizacji…” (instalowany nie jest pytany)', async () => {
    const k = worker('1.1.436');
    const instalowany = worker('1.1.437');
    const o = okno({ rejestracja: rejestracja({ active: k, installing: instalowany }), controller: k });
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('1.1.436 · pobieranie aktualizacji…');
    expect(instalowany.pytania).toBe(0);
  });

  it('W7: tylko installing, bez kontrolera (pierwsza wizyta) — „nieustalona · pobieranie aktualizacji…”', async () => {
    const o = okno({ rejestracja: rejestracja({ installing: worker(undefined) }) });
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('nieustalona · pobieranie aktualizacji…');
  });

  it('W8: controllerchange (przejęcie strony, „Aktualizuj” w innej karcie) — ponowny odczyt pokazuje nowy numer', async () => {
    const k = worker('1.1.436');
    const reg = rejestracja({ active: k, waiting: worker('1.1.437') });
    const o = okno({ rejestracja: reg, controller: k });
    zaladuj(o);
    await tury(20);
    expect(o.el.textContent).toBe('1.1.436 · gotowa aktualizacja 1.1.437');
    reg.active = reg.waiting;
    reg.waiting = null;
    o.stan.controller = reg.active;
    o.serviceWorker.dispatchEvent(new Event('controllerchange'));
    await tury(20);
    expect(o.el.textContent).toBe('1.1.437');
  });

  it('W9: dwa odczyty, starszy kończy się później — wygrywa nowszy (pokolenie)', async () => {
    const zwloka = [];
    const stary = worker('1.1.436', { zwloka });
    const o = okno({ rejestracja: rejestracja({ active: stary }), controller: stary });
    const api = zaladuj(o); // odczyt startowy wstrzymany w zwloka
    await tury(5);
    const p1 = api.odswiez(); // też wstrzymany
    await tury(5);
    const nowy = worker('1.1.437');
    o.stan.reg = rejestracja({ active: nowy });
    o.stan.controller = nowy;
    const p2 = api.odswiez();
    expect(await p2).toBe('1.1.437');
    for (const f of zwloka) f();
    expect(await p1).toBeNull();
    await tury(10);
    expect(o.el.textContent).toBe('1.1.437');
  });

  it.each([
    ['znaczniki', '<b>1</b>'], ['200 znaków', '1'.repeat(200)], ['liczba', 1.1],
    ['inny typ wiadomości', { type: 'INNA', wersja: '1.1.436' }], ['pusta', ''], ['spacja na początku', ' 1.1.436'],
  ])('W10: odpowiedź %s — jak brak odpowiedzi (starsza wersja), bez czekania na limit', async (_n, odp) => {
    const k = worker(odp);
    const o = okno({ rejestracja: rejestracja({ active: k }), controller: k });
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('starsza wersja (numer nieznany)');
  });

  it('W10b: wersje testowe z sufiksem — przyjęte', async () => {
    const k = worker('1.1.436-status-e2e-2');
    const o = okno({ rejestracja: rejestracja({ active: k }), controller: k });
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('1.1.436-status-e2e-2');
  });

  it('W11: obca pamięć pwa-kalorii-shell-v9.9.9 — wynik bez zmian, caches nie czytane, bez zapisów i sieci', async () => {
    const caches = { keys: vi.fn(async () => ['pwa-kalorii-shell-v9.9.9']), open: vi.fn(), has: vi.fn(), match: vi.fn() };
    const k = worker('1.1.436');
    const o = okno({ rejestracja: rejestracja({ active: k }), controller: k, caches });
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('1.1.436');
    for (const f of Object.values(caches)) expect(f).not.toHaveBeenCalled();
    expect(o.win.localStorage.setItem).not.toHaveBeenCalled();
    expect(o.win.sessionStorage.setItem).not.toHaveBeenCalled();
    expect(o.win.fetch).not.toHaveBeenCalled();
  });

  it('W12: element z rzucającymi innerHTML i style — tylko textContent (jeden zapis na zmianę tekstu)', async () => {
    const k = worker('1.1.436');
    const o = okno({ rejestracja: rejestracja({ active: k }), controller: k });
    const api = zaladuj(o);
    await api.odswiez();
    await api.odswiez();
    expect(o.el.textContent).toBe('1.1.436');
    expect(o.el.zapisy).toBe(1);
  });

  it('W13: oczekujący milczy — „1.1.436 · gotowa aktualizacja” bez numeru; port1.close po odpowiedzi i po limicie', async () => {
    vi.useFakeTimers();
    const k = worker('1.1.436');
    const o = okno({ rejestracja: rejestracja({ active: k, waiting: worker(undefined) }), controller: k });
    const api = zaladuj(o);
    await vi.advanceTimersByTimeAsync(LIMIT_MS);
    expect(o.el.textContent).toBe('1.1.436 · gotowa aktualizacja');
    const kanaly = o.dziennik.filter((x) => x === 'kanal').length;
    expect(kanaly).toBeGreaterThanOrEqual(2);
    expect(o.dziennik.filter((x) => x === 'close').length).toBe(kanaly);
    const p = api.odswiez();
    await vi.advanceTimersByTimeAsync(LIMIT_MS);
    expect(await p).toBe('1.1.436 · gotowa aktualizacja');
    expect(o.dziennik.filter((x) => x === 'close').length).toBe(o.dziennik.filter((x) => x === 'kanal').length);
  });

  it('W14: przejścia stanów — updatefound (pobieranie…) → statechange installed (gotowa) → SKIP_WAITING i controllerchange (nowy numer)', async () => {
    const k = worker('1.1.436');
    const reg = rejestracja({ active: k });
    const o = okno({ rejestracja: reg, controller: k });
    zaladuj(o);
    o.gotowa(reg);
    await tury(20);
    expect(o.el.textContent).toBe('1.1.436');
    const nowy = worker('1.1.437');
    reg.installing = nowy;
    reg.dispatchEvent(new Event('updatefound'));
    await tury(20);
    expect(o.el.textContent).toBe('1.1.436 · pobieranie aktualizacji…');
    // installing → installed: worker przechodzi do registration.waiting, nasłuch statechange czytnika robi odczyt.
    reg.installing = null;
    reg.waiting = nowy;
    nowy.dispatchEvent(new Event('statechange'));
    await tury(20);
    expect(o.el.textContent).toBe('1.1.436 · gotowa aktualizacja 1.1.437');
    // „Aktualizuj” → waiting aktywowany → controllerchange.
    reg.waiting = null;
    reg.active = nowy;
    o.stan.controller = nowy;
    o.serviceWorker.dispatchEvent(new Event('controllerchange'));
    await tury(20);
    expect(o.el.textContent).toBe('1.1.437');
  });

  it('W14b: visibilitychange (strona widoczna) — odczyt, np. po aktualizacji z innej karty bez zdarzeń tutaj', async () => {
    const k = worker('1.1.436');
    const reg = rejestracja({ active: k });
    const o = okno({ rejestracja: reg, controller: k });
    zaladuj(o);
    await tury(20);
    expect(o.el.textContent).toBe('1.1.436');
    reg.waiting = worker('1.1.437');
    o.win.document.dispatchEvent(new Event('visibilitychange'));
    await tury(20);
    expect(o.el.textContent).toBe('1.1.436 · gotowa aktualizacja 1.1.437');
  });

  it('W14c: instalacja nieudana (installing → redundant) — dopisek znika', async () => {
    const k = worker('1.1.436');
    const nowy = worker('1.1.437');
    const reg = rejestracja({ active: k, installing: nowy });
    const o = okno({ rejestracja: reg, controller: k });
    zaladuj(o);
    o.gotowa(reg);
    await tury(20);
    expect(o.el.textContent).toBe('1.1.436 · pobieranie aktualizacji…');
    reg.installing = null;
    nowy.dispatchEvent(new Event('statechange'));
    await tury(20);
    expect(o.el.textContent).toBe('1.1.436');
  });

  it('W14d: pierwsza wizyta, pierwsza instalacja nieudana (installing → redundant, bez ready i controllerchange) — dopisek znika od razu', async () => {
    const instalowany = worker(undefined);
    const reg = rejestracja({ installing: instalowany });
    const o = okno({ rejestracja: reg }); // bez kontrolera; ready nie rozwiązuje się (brak aktywnego SW)
    const api = zaladuj(o);
    await tury(20);
    expect(o.el.textContent).toBe('nieustalona · pobieranie aktualizacji…');
    // Kolejne odczyty w trakcie instalacji (np. powrót do karty) nie mnożą nasłuchu: ta sama funkcja.
    await api.odswiez();
    await api.odswiez();
    const n = o.serviceWorker.getRegistration.mock.calls.length;
    // Instalacja padła (np. przerwane pobieranie pamięci offline): przeglądarka usuwa rejestrację bez aktywnego SW.
    reg.installing = null;
    o.stan.reg = null;
    instalowany.dispatchEvent(new Event('statechange'));
    await tury(20);
    expect(o.el.textContent).toBe('nieustalona');
    expect(o.serviceWorker.getRegistration.mock.calls.length, 'jeden statechange = jeden odczyt').toBe(n + 1);
  });

  it('W15: tekst() — tabela stanów; API zamrożone', () => {
    const o = okno({ sw: false });
    const api = zaladuj(o);
    const t = api.tekst;
    expect(t({ stan: 'ok', aktywna: '1.1.436', oczekujaca: null, czeka: false, instalacja: false })).toBe('1.1.436');
    expect(t({ stan: 'ok', aktywna: '1.1.436', oczekujaca: '1.1.437', czeka: true, instalacja: true })).toBe('1.1.436 · gotowa aktualizacja 1.1.437');
    expect(t({ stan: 'ok', aktywna: '1.1.436', oczekujaca: null, czeka: true, instalacja: false })).toBe('1.1.436 · gotowa aktualizacja');
    expect(t({ stan: 'ok', aktywna: '1.1.436', oczekujaca: null, czeka: false, instalacja: true })).toBe('1.1.436 · pobieranie aktualizacji…');
    expect(t({ stan: 'starsza', aktywna: null, oczekujaca: null, czeka: false, instalacja: false })).toBe('starsza wersja (numer nieznany)');
    expect(t({ stan: 'starsza', aktywna: null, oczekujaca: null, czeka: false, instalacja: true })).toBe('starsza wersja (numer nieznany) · pobieranie aktualizacji…');
    expect(t({ stan: 'brak', aktywna: null, oczekujaca: null, czeka: false, instalacja: false })).toBe('nieustalona');
    expect(t(null)).toBe('nieustalona');
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.keys(api).sort()).toEqual(['odczytaj', 'odswiez', 'tekst']);
  });

  it('W16: brak MessageChannel — „nieustalona” bez pytania workera', async () => {
    const k = worker('1.1.436');
    const o = okno({ rejestracja: rejestracja({ active: k }), controller: k, kanal: false });
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('nieustalona');
    expect(k.pytania).toBe(0);
  });

  it('W17: getRegistration() odrzuca — bez kontrolera „nieustalona” (nie zostaje „sprawdzam…”), z kontrolerem numer', async () => {
    const o = okno();
    o.serviceWorker.getRegistration.mockImplementation(async () => { throw new Error('fikcyjny błąd rejestracji'); });
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('nieustalona');
    expect(o.el.textContent).toBe('nieustalona');
    o.stan.controller = worker('1.1.436');
    expect(await api.odswiez()).toBe('1.1.436');
  });

  it('W18: pierwsza wizyta — bez rejestracji „nieustalona”; po ready i przejęciu strony (clients.claim) numer', async () => {
    const o = okno(); // getRegistration → undefined, brak kontrolera
    zaladuj(o);
    await tury(20);
    expect(o.el.textContent).toBe('nieustalona');
    const k = worker('1.1.436');
    const reg = rejestracja({ active: k });
    o.stan.reg = reg;
    o.stan.controller = k;
    o.gotowa(reg);
    await tury(20);
    expect(o.el.textContent).toBe('1.1.436');
  });

  it('W19: visibilitychange przy stronie ukrytej — bez nowego pytania', async () => {
    const k = worker('1.1.436');
    const o = okno({ rejestracja: rejestracja({ active: k }), controller: k });
    zaladuj(o);
    await tury(20);
    const n = k.pytania;
    expect(n).toBeGreaterThan(0);
    o.win.document.visibilityState = 'hidden';
    o.win.document.dispatchEvent(new Event('visibilitychange'));
    await tury(20);
    expect(k.pytania).toBe(n);
  });

  it('W20: po odpowiedzi zegar limitu wyczyszczony (bez oczekującego setTimeout)', async () => {
    vi.useFakeTimers();
    const k = worker('1.1.436');
    const o = okno({ rejestracja: rejestracja({ active: k }), controller: k });
    const api = zaladuj(o);
    await vi.advanceTimersByTimeAsync(0);
    expect(await api.odswiez()).toBe('1.1.436');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('W14e: statechange w trakcie pytania wolnego kontrolera (installing → installed) — po odpowiedzi „gotowa aktualizacja”', async () => {
    // Nasłuch statechange musi powstać przed pytaniem workerów, nie po nim: inaczej zmiana stanu w trakcie pytania
    // (do 2 s, np. stary SW przy pierwszym wydaniu) zostawia linię bez dopisku do następnego zdarzenia.
    const zwloka = [];
    const k = worker('1.1.436', { zwloka });
    const x = worker('1.1.437');
    const reg = rejestracja({ active: k, installing: x });
    const o = okno({ rejestracja: reg, controller: k });
    zaladuj(o); // odczyt startowy czeka na kontroler
    await tury(10);
    expect(o.el.textContent).toBe('sprawdzam…');
    reg.installing = null; reg.waiting = x; // installing → installed w trakcie pytania
    x.dispatchEvent(new Event('statechange'));
    await tury(10);
    while (zwloka.length) zwloka.shift()();
    await tury(20);
    expect(o.el.textContent).toBe('1.1.436 · gotowa aktualizacja 1.1.437');
  });
  it('W14f: pierwsze wydanie — kontroler milczy (stary SW), instalacja kończy się w oknie 2 s — „starsza … · gotowa aktualizacja …”', async () => {
    vi.useFakeTimers();
    const k = worker(undefined);
    const x = worker('1.1.437');
    const reg = rejestracja({ active: k, installing: x });
    const o = okno({ rejestracja: reg, controller: k });
    zaladuj(o);
    await vi.advanceTimersByTimeAsync(500);
    expect(o.el.textContent).toBe('sprawdzam…');
    reg.installing = null; reg.waiting = x;
    x.dispatchEvent(new Event('statechange'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(o.el.textContent).toBe('starsza wersja (numer nieznany) · gotowa aktualizacja 1.1.437');
  });
  it('W21: okno bez document i navigator (jak w powloka-ustawienia-konto) — plik bez wyjątku i bez timerów', () => {
    const timery = [];
    const window = { setTimeout: (f) => timery.push(f), addEventListener() {} };
    const zdarzenia = new Map();
    const document = {
      readyState: 'loading',
      addEventListener: (n, l) => { (zdarzenia.get(n) || zdarzenia.set(n, []).get(n)).push(l); },
      querySelectorAll: () => [], getElementById: () => null, querySelector: () => null,
      createElement: () => ({ classList: { add() {}, remove() {} } }),
    };
    const ctx = vm.createContext({ window, document, URL, decodeURIComponent, setTimeout: window.setTimeout, clearTimeout() {} });
    expect(() => vm.runInContext(czytaj(PLIK), ctx)).not.toThrow();
    expect(() => (zdarzenia.get('DOMContentLoaded') || []).forEach((l) => l())).not.toThrow();
    expect(timery).toHaveLength(0);
    expect(typeof window.VildaWersjaAplikacji.odswiez).toBe('function');
  });

  it('W24: odczyt navigator.serviceWorker rzuca (np. SecurityError w ramce sandbox) — „nieustalona”, bez wyjątku, nasłuch powrotu do karty założony', async () => {
    const o = okno();
    const nav = {};
    Object.defineProperty(nav, 'serviceWorker', { get() { const e = new Error('The operation is insecure.'); e.name = 'SecurityError'; throw e; } });
    o.win.navigator = nav;
    let api;
    expect(() => { api = zaladuj(o); }).not.toThrow();
    await tury(20);
    expect(o.el.textContent).toBe('nieustalona');
    expect(await api.odswiez()).toBe('nieustalona');
    o.el._t = 'x'; // powrót do karty ma ponowić odczyt
    o.win.document.dispatchEvent(new Event('visibilitychange'));
    await tury(20);
    expect(o.el.textContent).toBe('nieustalona');
  });
  it('W22: installing i waiting naraz — tylko „gotowa aktualizacja” (pierwszeństwo oczekującego)', async () => {
    const k = worker('1.1.436');
    const o = okno({ rejestracja: rejestracja({ active: k, waiting: worker('1.1.437'), installing: worker('1.1.438') }), controller: k });
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe('1.1.436 · gotowa aktualizacja 1.1.437');
  });

  it('W23: gość — kłódka z tego samego pliku chowa strefę niebezpieczną, linia wersji zostaje i dostaje tekst', async () => {
    const k = worker('1.1.436');
    const o = okno({ rejestracja: rejestracja({ active: k }), controller: k });
    zaladuj(o);
    await tury(20);
    expect(o.strefa.style.display).toBe('none');
    expect(o.el.textContent).toBe('1.1.436');
  });
});

// ── Service worker: gałąź VILDA_WERSJA w nasłuchu message ──
const ZRODLO_SW = czytaj('service-worker-kalorii.js');
const WERSJA_SW = /^const SW_VERSION = '([^']+)';$/m.exec(ZRODLO_SW)[1];
function uruchomSW(zrodlo = ZRODLO_SW) {
  const nasluchy = {};
  const self = {
    location: new URL('https://vilda.test/service-worker-kalorii.js'),
    registration: {},
    clients: { claim: async () => {} },
    addEventListener(typ, f) { (nasluchy[typ] = nasluchy[typ] || []).push(f); },
    skipWaiting: vi.fn(),
  };
  new Function('self', 'caches', 'fetch', zrodlo)(self, null, null);
  return { self, wiadomosc: (event) => { for (const f of nasluchy.message || []) f(event); } };
}
const port = () => ({ wyslane: [], postMessage(d) { this.wyslane.push(d); } });
// Worker strony, którego postMessage trafia do prawdziwego nasłuchu message z pliku SW.
function prawdziwyWorker(sw) {
  return { pytania: 0, postMessage(data, porty) { this.pytania += 1; sw.wiadomosc({ data, ports: porty || [] }); }, addEventListener() {} };
}

describe('E2-PR1w P-WERSJA-APLIKACJI: service worker odpowiada swoją SW_VERSION', () => {
  it('SW1: VILDA_WERSJA z portem — {type, wersja} równe stałej SW_VERSION tego pliku', () => {
    const { wiadomosc } = uruchomSW();
    const p = port();
    wiadomosc({ data: { type: 'VILDA_WERSJA' }, ports: [p] });
    expect(p.wyslane).toEqual([{ type: 'VILDA_WERSJA', wersja: WERSJA_SW }]);
  });

  it('SW2: SKIP_WAITING dalej woła skipWaiting; nieznany typ bez odpowiedzi; VILDA_WERSJA bez portów nie rzuca', () => {
    const { self, wiadomosc } = uruchomSW();
    const p = port();
    wiadomosc({ data: { type: 'SKIP_WAITING' }, ports: [p] });
    expect(self.skipWaiting).toHaveBeenCalledTimes(1);
    wiadomosc({ data: { type: 'COS_INNEGO' }, ports: [p] });
    expect(() => wiadomosc({ data: { type: 'VILDA_WERSJA' } })).not.toThrow();
    expect(() => wiadomosc({ data: { type: 'VILDA_WERSJA' }, ports: [] })).not.toThrow();
    expect(() => wiadomosc({})).not.toThrow();
    expect(p.wyslane).toEqual([]);
    expect(self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('SW3: pytanie o wersję nie aktywuje oczekującego SW (bez skipWaiting)', () => {
    const { self, wiadomosc } = uruchomSW();
    const p = port();
    wiadomosc({ data: { type: 'VILDA_WERSJA' }, ports: [p] });
    expect(p.wyslane).toHaveLength(1);
    expect(self.skipWaiting).not.toHaveBeenCalled();
  });

  it('SW4: czytnik strony z prawdziwym nasłuchem SW (kontroler i oczekujący) — numery z pliku SW', async () => {
    const kontroler = prawdziwyWorker(uruchomSW());
    const nastepny = 'pwa-v-nastepna-1';
    const oczekujacy = prawdziwyWorker(uruchomSW(ZRODLO_SW.replace(/const SW_VERSION = '[^']+';/, `const SW_VERSION = '${nastepny}';`)));
    const o = okno({ rejestracja: rejestracja({ active: kontroler, waiting: oczekujacy }), controller: kontroler });
    const api = zaladuj(o);
    expect(await api.odswiez()).toBe(`${WERSJA_SW} · gotowa aktualizacja ${nastepny}`);
    expect(o.el.textContent).toBe(`${WERSJA_SW} · gotowa aktualizacja ${nastepny}`);
  });

  it('SW5: pierwsze wydanie — kontroler bez gałęzi VILDA_WERSJA (jak SW sprzed zmiany), oczekujący nowy', async () => {
    vi.useFakeTimers();
    const galaz = /\n {2}\} else if \(event\?\.data\?\.type === 'VILDA_WERSJA'[\s\S]*?\n(?= {2}\}\n\}\);)/;
    expect(galaz.test(ZRODLO_SW), 'gałąź VILDA_WERSJA da się wyciąć z prawdziwego pliku').toBe(true);
    const stary = prawdziwyWorker(uruchomSW(ZRODLO_SW.replace(galaz, '\n')));
    const nowy = prawdziwyWorker(uruchomSW());
    const o = okno({ rejestracja: rejestracja({ active: stary, waiting: nowy }), controller: stary });
    const api = zaladuj(o);
    const p = api.odswiez();
    await vi.advanceTimersByTimeAsync(LIMIT_MS);
    expect(await p).toBe(`starsza wersja (numer nieznany) · gotowa aktualizacja ${WERSJA_SW}`);
    expect(stary.pytania).toBeGreaterThan(0);
  });
});

describe('E2-PR1w P-WERSJA-APLIKACJI: strażniki źródła', () => {
  const PLIK_ZRODLO = czytaj(PLIK);
  const START = '/* P-WERSJA-APLIKACJI';
  const KONIEC = '/* /P-WERSJA-APLIKACJI */';
  const blok = () => PLIK_ZRODLO.slice(PLIK_ZRODLO.indexOf(START), PLIK_ZRODLO.indexOf(KONIEC) + KONIEC.length);
  const bezKomentarzy = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

  it('S1: blok na końcu 07 po kłódce; cały 07 ASCII; blok tylko do odczytu, bez wersji i bez gołego document/navigator', () => {
    expect(PLIK_ZRODLO.split(START).length).toBe(2);
    expect(PLIK_ZRODLO.indexOf(START)).toBeGreaterThan(PLIK_ZRODLO.indexOf('var f=['));
    expect(PLIK_ZRODLO.trimEnd().endsWith(KONIEC)).toBe(true);
    expect(PLIK_ZRODLO).toMatch(/^[\x00-\x7F]*$/); // eslint-disable-line no-control-regex -- strażnik ASCII
    const b = blok();
    const kod = bezKomentarzy(b);
    expect(b).not.toMatch(/\?v=/);
    expect(b).not.toMatch(/\d+\.\d+\.\d+/);
    expect(b).not.toMatch(/SW_VERSION\s*=/);
    expect(kod).not.toMatch(/\bcaches\b|\bfetch\(|localStorage|sessionStorage|innerHTML|\.style\b|cssText|setProperty|var f=\[/);
    expect(kod).not.toMatch(/(^|[^.\w])(document|navigator)\b/);
    expect(kod).toMatch(/\(window\);\s*$/);
    expect(ZRODLO_SW.split("const SW_VERSION = '").length).toBe(2);
    expect(ZRODLO_SW).not.toContain('vilda_wersja_aplikacji');
    expect(fs.existsSync(path.join(KORZEN, 'vilda_wersja_aplikacji.js'))).toBe(false);
  });

  it('S2: ustawienia.html — #settingsAppVersion bezpośrednio w .settings-content, po strefie niebezpiecznej, ostatni, poza details; 07 ostatnim skryptem', () => {
    const html = czytaj('ustawienia.html');
    const i = html.indexOf('id="settingsAppVersion"');
    const koniec = html.indexOf('</div><!-- /.settings-content -->');
    const strefa = html.indexOf('class="settings-danger-zone"');
    expect(strefa).toBeGreaterThan(-1);
    expect(i).toBeGreaterThan(strefa);
    expect(koniec).toBeGreaterThan(i);
    const przed = html.slice(0, i);
    expect(przed.split('<details').length).toBe(przed.split('</details>').length);
    const p0 = html.lastIndexOf('<p', i);
    const akapit = html.slice(p0, html.indexOf('</p>', i) + 4);
    expect(akapit).toMatch(/^<p class="settings-inline-note settings-app-version" id="settingsAppVersion" aria-live="polite" aria-atomic="true">\s*Wersja aplikacji: <span id="settingsAppVersionValue" translate="no">sprawdzam…<\/span>\s*<\/p>$/);
    expect(akapit).not.toContain('style=');
    expect(html.slice(html.indexOf('</p>', i) + 4, koniec).trim()).toBe('');
    // Przed akapitem kończy się strefa niebezpieczna (zamknięcie jej div) — akapit jest rodzeństwem strefy.
    expect(html.slice(html.lastIndexOf('</details>', i), p0).replace(/\s+/g, '')).toBe('</details></div>');
    const skrypty = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(skrypty.at(-1)).toMatch(/^<script defer src="inline_ustawienia_07\.js\?v=\d+">$/);
    expect(html).not.toContain('vilda_wersja_aplikacji');
    expect(czytaj('ustawienia.css')).toMatch(/\.settings-content>\.settings-app-version \{\n {2}margin-top: var\(--space-2\);\n {2}overflow-wrap: anywhere\n\}/);
    // Ciemne tło 2: w układzie wąskim linia leży na #e0e0e0 (tło body), gdzie #586d72 daje 4,14:1 — kolor --text-2.
    expect(czytaj('ustawienia.css')).toMatch(/\nbody\.dark-bg-level-2 \.settings-content>\.settings-app-version \{\n {2}color: var\(--text-2\)\n\}/);
  });
});
