process.env.TZ = 'Europe/Warsaw';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Audyt Terminarza 2026-09-02, I9/D1/D2/D8 — strażnicy silnika dat i powtórzeń.
// Testy ładują PRAWDZIWY vilda_terminarz.js do fałszywego okna bez DOM: IIFE na poziomie
// modułu wykonuje tylko `g = w.document`, strażnik `typeof w.matchMedia`, stałe i ostatnią
// instrukcję `g.readyState === "loading" ? … : en()`; en() woła getElementById("terminarzRoot")
// → null i kończy bez inicjalizacji UI (bez localStorage, setInterval, sejfu). Czyste funkcje
// dat są czytane z window.VildaTerminarz.__internals (hook testowy z PR 3):
//   Jn(startISO, tryb 'm1'|'w1'|'w2', dniTygodnia[], koniec {mode:'until'|'count',…}|null,
//      pomijajŚwięta, pomijajWeekendy) → {dates, skippedHol, capped}
//   ge(ISO) → najbliższy dzień roboczy; ka(ISO, zWeekendami) → nazwa kolizji lub '';
//   Vt(ISO) → nazwa święta lub null; Kn(ISO, coNDni, horyzontMies) → podgląd „co N dni”;
//   Cc(Date, miesiące) → Date (miesiące kalendarzowe z klamrą końca miesiąca);
//   Cd() → próg „zaległych” (lokalne wczoraj + 'T23:59:59.999Z');
//   Cg(daty[], krok) → {min, max, warn} | null (strażnik odstępów); R/H — format/parse dat;
//   Ae = maks. wystąpień serii (120), Cf = limit iteracji pętli dziennej (2200 dni).

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TERMINARZ_SOURCE = fs.readFileSync(path.join(repositoryRoot, 'vilda_terminarz.js'), 'utf8');

function loadTerminarz() {
  const win = {
    document: {
      readyState: 'complete',
      getElementById() { return null; },
      addEventListener() {}
    }
  };
  win.window = win;
  loadBrowserScript('vilda_terminarz.js', win);
  if (!win.VildaTerminarz || !win.VildaTerminarz.__internals) {
    throw new Error('vilda_terminarz.js nie wystawił window.VildaTerminarz.__internals');
  }
  return win;
}

const win = loadTerminarz();
const I = win.VildaTerminarz.__internals;

// Jn z domyślnymi argumentami jak w UI: bez dni tygodnia, domyślny horyzont (6 mies.),
// bez pomijania świąt i weekendów.
const seria = (start, tryb, dni = [], koniec = null, pomijajSwieta = false, pomijajWeekendy = false) =>
  I.Jn(start, tryb, dni, koniec, pomijajSwieta, pomijajWeekendy);
const data = (rok, miesiac, dzien) => new Date(rok, miesiac - 1, dzien);
const ostatnia = (lista) => lista[lista.length - 1];

describe('Hook testowy __internals (PR 3)', () => {
  it('ładuje się do fałszywego okna bez DOM i wystawia czyste funkcje dat obok publicznego API', () => {
    expect(Object.keys(win.VildaTerminarz)).toEqual(['version', 'refresh', 'setView', '__internals']);
    expect(win.VildaTerminarz.version).toBe('4.2.0');
    for (const nazwa of ['Jn', 'ge', 'ka', 'Vt', 'Kn', 'R', 'H', 'Cc', 'Cd', 'Cg']) {
      expect(typeof I[nazwa], nazwa).toBe('function');
    }
    expect(I.Ae).toBe(120);
    expect(I.Cf).toBe(2200);
  });
});

describe('I9 — powtarzanie miesięczne „m1”: klamra dnia kotwicy do końca miesiąca', () => {
  it('kotwica 31.01.2026 → 31.01, 28.02, 31.03, 30.04, 31.05, 30.06, 31.07 (dotąd: tylko I/III/V/VII)', () => {
    const wynik = seria('2026-01-31', 'm1');
    expect(wynik.dates).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31'
    ]);
    expect(wynik.skippedHol).toBe(0);
    expect(wynik.capped).toBe(false);
  });

  it('rok przestępny: kotwica 31.01.2028 → 29.02.2028, potem 31.03', () => {
    expect(seria('2028-01-31', 'm1').dates.slice(0, 4)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
  });

  it('kotwica 29.02.2028 → 29. dnia każdego kolejnego miesiąca', () => {
    expect(seria('2028-02-29', 'm1').dates.slice(0, 3)).toEqual(['2028-02-29', '2028-03-29', '2028-04-29']);
  });

  it('kotwica 30. dnia: luty dostaje ostatni dzień miesiąca, pozostałe miesiące 30. dzień', () => {
    expect(seria('2026-01-30', 'm1').dates).toEqual([
      '2026-01-30', '2026-02-28', '2026-03-30', '2026-04-30', '2026-05-30', '2026-06-30', '2026-07-30'
    ]);
  });

  it('kotwica 29. dnia: 29.01.2026 → 28.02 (rok nieprzestępny), potem 29. dnia', () => {
    expect(seria('2026-01-29', 'm1').dates.slice(0, 4)).toEqual(['2026-01-29', '2026-02-28', '2026-03-29', '2026-04-29']);
  });

  it('tryb „Liczba”: 6 podań co miesiąc od 31.03 → 6 kolejnych miesięcy bez luk, bez flagi obcięcia', () => {
    const wynik = seria('2026-03-31', 'm1', [], { mode: 'count', count: 6 });
    expect(wynik.dates).toEqual(['2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31']);
    expect(wynik.capped).toBe(false);
  });

  it('regresja: kotwica 15. dnia bez zmian (15. każdego miesiąca przez domyślne 6 miesięcy)', () => {
    const wynik = seria('2026-01-15', 'm1');
    expect(wynik.dates).toEqual([
      '2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15'
    ]);
    expect(wynik.capped).toBe(false);
  });

  it('pomijanie świąt i weekendów w m1 działa na datach po klamrze', () => {
    // 2026-05-01 (Święto Pracy) wypada w serii z kotwicą 1.: pomijane i liczone w skippedHol
    const zeSwietami = seria('2026-03-01', 'm1', [], null, true, false);
    expect(zeSwietami.dates).not.toContain('2026-05-01');
    expect(zeSwietami.skippedHol).toBe(1);
    // kotwica 30.04 z pomijaniem weekendów: 30.05 (sob) i 30.08 (nd) wypadają, 31.05 nie istnieje w tej serii
    const bezWeekendow = seria('2026-04-30', 'm1', [], null, false, true);
    expect(bezWeekendow.dates).toEqual(['2026-04-30', '2026-06-30', '2026-07-30', '2026-09-30', '2026-10-30']);
  });
});

describe('I9 — limit iteracji pętli dziennej i uczciwa flaga „capped”', () => {
  it('„do dnia” 5 lat (15.01.2026 → 15.01.2031) → 61 wystąpień do końca zakresu, capped=false (dotąd: 40 dat, koniec 04.2029)', () => {
    const wynik = seria('2026-01-15', 'm1', [], { mode: 'until', untilISO: '2031-01-15' });
    expect(wynik.dates.length).toBe(61);
    expect(ostatnia(wynik.dates)).toBe('2031-01-15');
    expect(wynik.capped).toBe(false);
  });

  it('„do dnia” 7 lat → obcięte limitem Cf=2200 dni z jawną flagą capped=true (dotąd: cicho, capped=false)', () => {
    const wynik = seria('2026-01-15', 'm1', [], { mode: 'until', untilISO: '2033-01-15' });
    expect(wynik.dates.length).toBe(73);
    expect(ostatnia(wynik.dates)).toBe('2032-01-15');
    expect(wynik.capped).toBe(true);
  });

  it('tryb „Liczba” osiągnięty naturalnie → capped=false (dotąd fałszywe „(limit 120)” przy każdej serii)', () => {
    const wynik = seria('2026-01-15', 'm1', [], { mode: 'count', count: 12 });
    expect(wynik.dates.length).toBe(12);
    expect(ostatnia(wynik.dates)).toBe('2026-12-15');
    expect(wynik.capped).toBe(false);
  });

  it('tryb „Liczba” 120 co miesiąc → 37 dat (3-letni horyzont) i capped=true (dotąd cicho obcięte)', () => {
    const wynik = seria('2026-01-15', 'm1', [], { mode: 'count', count: 120 });
    expect(wynik.dates.length).toBe(37);
    expect(ostatnia(wynik.dates)).toBe('2029-01-15');
    expect(wynik.capped).toBe(true);
  });
});

describe('I9 — tryby tygodniowe i „co N dni” bez regresji', () => {
  it('w1 codziennie przez 6 miesięcy → maks. 120 wystąpień (Ae) i capped=true', () => {
    const wynik = seria('2026-01-15', 'w1', [0, 1, 2, 3, 4, 5, 6]);
    expect(wynik.dates.length).toBe(I.Ae);
    expect(wynik.dates[0]).toBe('2026-01-15');
    expect(ostatnia(wynik.dates)).toBe('2026-05-14');
    expect(wynik.capped).toBe(true);
  });

  it('w1 poniedziałki od czwartku 15.01.2026 → 26 dat od 19.01 do 13.07, capped=false', () => {
    const wynik = seria('2026-01-15', 'w1', [1]);
    expect(wynik.dates.length).toBe(26);
    expect(wynik.dates[0]).toBe('2026-01-19');
    expect(ostatnia(wynik.dates)).toBe('2026-07-13');
    expect(wynik.capped).toBe(false);
  });

  it('w2 czwartki co 2 tygodnie do 15.01.2027 → 27 dat, pierwsza to kotwica', () => {
    const wynik = seria('2026-01-15', 'w2', [4], { mode: 'until', untilISO: '2027-01-15' });
    expect(wynik.dates.length).toBe(27);
    expect(wynik.dates[0]).toBe('2026-01-15');
    expect(wynik.dates[1]).toBe('2026-01-29');
    expect(ostatnia(wynik.dates)).toBe('2027-01-14');
    expect(wynik.capped).toBe(false);
  });

  it('w1 bez wybranych dni tygodnia → pusta seria (domyślny horyzont: bez flagi; 10 lat: jawnie obcięta limitem Cf)', () => {
    const domyslny = seria('2026-01-15', 'w1', []);
    expect(domyslny.dates).toEqual([]);
    expect(domyslny.capped).toBe(false);
    const dziesiecLat = seria('2026-01-15', 'w1', [], { mode: 'until', untilISO: '2036-01-15' });
    expect(dziesiecLat.dates).toEqual([]);
    expect(dziesiecLat.capped).toBe(true);
  });

  it('podgląd serii podań „co 28 dni” (Kn) bez zmian: 19.08.2026 → 16.09, 14.10 …', () => {
    const daty = I.Kn('2026-08-19', 28, 6);
    expect(daty.slice(0, 4)).toEqual(['2026-08-19', '2026-09-16', '2026-10-14', '2026-11-11']);
    expect(daty.length).toBe(7);
  });
});

describe('D1 — najbliższy dzień roboczy ge()/ka(): reguła remisu WSTECZ (decyzja 2026-09-02)', () => {
  // Reguła: pierwszy dzień bez kolizji w odległości 1, 2, … 31 dni; przy remisie dzień
  // WCZEŚNIEJ jest sprawdzany przed dniem później (podanie leku długodziałającego 1–2 dni
  // wcześniej nie niesie ryzyka, opóźnienie może dać lukę w działaniu).
  it('święto w środku tygodnia: 11.11.2026 (środa) → 10.11 (wstecz przy remisie)', () => {
    expect(I.ge('2026-11-11')).toBe('2026-11-10');
  });

  it('blok świąt 24–26.12.2026: 24.12 → 23.12, 25.12 → 23.12, 26.12 (sobota) → 28.12', () => {
    expect(I.ge('2026-12-24')).toBe('2026-12-23');
    expect(I.ge('2026-12-25')).toBe('2026-12-23');
    expect(I.ge('2026-12-26')).toBe('2026-12-28');
  });

  it('weekend: sobota → piątek, niedziela → poniedziałek', () => {
    expect(I.ge('2026-08-22')).toBe('2026-08-21');
    expect(I.ge('2026-08-23')).toBe('2026-08-24');
  });

  it('Poniedziałek Wielkanocny → wtorek; 1.05 (piątek) → 30.04; 3.05 (niedziela) → 4.05; dzień roboczy bez zmian', () => {
    expect(I.ge('2026-04-06')).toBe('2026-04-07');
    expect(I.ge('2026-05-01')).toBe('2026-04-30');
    expect(I.ge('2026-05-03')).toBe('2026-05-04');
    expect(I.ge('2026-08-19')).toBe('2026-08-19');
  });

  it('ka(): kolizja to święto, dzień nieobecności lub (opcjonalnie) weekend', () => {
    expect(I.ka('2026-11-11', true)).toBe('Święto Niepodległości');
    expect(I.ka('2026-08-22', true)).toBe('sobota');
    expect(I.ka('2026-08-23', true)).toBe('niedziela');
    expect(I.ka('2026-08-22', false)).toBe('');
    expect(I.ka('2026-08-19', true)).toBe('');
  });

  it('kalendarz świąt Vt(): Wigilia dopiero od 2025, Wielkanoc i Boże Ciało z algorytmu', () => {
    expect(I.Vt('2024-12-24')).toBeNull();
    expect(I.Vt('2025-12-24')).toBe('Wigilia');
    expect(I.Vt('2026-04-05')).toBe('Wielkanoc');
    expect(I.Vt('2026-04-06')).toBe('Poniedziałek Wielkanocny');
    expect(I.Vt('2026-06-04')).toBe('Boże Ciało');
    expect(I.Vt('2026-11-11')).toBe('Święto Niepodległości');
    expect(I.Vt('2026-08-19')).toBeNull();
  });
});

describe('D1 — wybór przeliczania serii bez lepkiej persystencji i strażnik odstępów', () => {
  it('klucz localStorage „vilda-tz-rx-rebase-v1” nie jest już czytany ani zapisywany (od PR 7 tylko kasowany)', () => {
    // Ke()/$n() nie są wystawione w __internals (są sterowane z dialogu Qn, który wymaga DOM),
    // więc strażnik sprawdza źródło: dawniej jedno kliknięcie chipa utrwalało wybór globalnie.
    // Od PR 7 nazwa klucza wraca w kodzie w jednej roli — jednorazowego sprzątnięcia przy starcie.
    expect(TERMINARZ_SOURCE).not.toMatch(/(getItem|setItem)\("vilda-tz-rx-rebase-v1"\)/);
    expect(TERMINARZ_SOURCE).not.toMatch(/localStorage\.(getItem|setItem)\(wr\)/);
    const wystapienia = TERMINARZ_SOURCE.split('vilda-tz-rx-rebase-v1').length - 1;
    expect(wystapienia, 'klucz występuje wyłącznie raz — w removeItem').toBe(1);
    expect(TERMINARZ_SOURCE).toContain('removeItem("vilda-tz-rx-rebase-v1")');
  });

  it('strażnik odstępów Cg(): domyślne przesunięcia reguły świąt (do 3 dni) przy kroku 28 nie ostrzegają', () => {
    // pętla „Zmień tylko ten dzień” zmierzona w audycie (odstępy 28,28,27,29,27,29)
    expect(I.Cg(['2026-08-19', '2026-09-16', '2026-10-14', '2026-11-10', '2026-12-09', '2027-01-05', '2027-02-03'], 28))
      .toEqual({ min: 27, max: 29, warn: false });
    // seria co 28 dni od soboty 05.09.2026 z samymi „Najbliższy roboczy”: blok świąteczny 26.12 (sob) → 28.12 (pn)
    // daje odstępy 31 i 25 — to przesunięcia silnika, nie użytkownika, więc bez ostrzeżenia (próg ±4)
    expect(I.Cg(['2026-09-04', '2026-10-02', '2026-10-30', '2026-11-27', '2026-12-28', '2027-01-22', '2027-02-19'], 28))
      .toEqual({ min: 25, max: 31, warn: false });
  });

  it('strażnik odstępów Cg(): ręczne przesunięcie o +5 dni → odstępy 23–33, warn=true', () => {
    expect(I.Cg(['2026-08-19', '2026-09-21', '2026-10-14'], 28)).toEqual({ min: 23, max: 33, warn: true });
    expect(I.Cg(['2026-08-19', '2026-09-12', '2026-10-11'], 28)).toEqual({ min: 24, max: 29, warn: false });
    expect(I.Cg(['2026-08-19', '2026-09-11', '2026-10-11'], 28)).toEqual({ min: 23, max: 30, warn: true });
  });

  it('strażnik odstępów Cg(): granice ±4 dni nie ostrzegają, duplikaty pomijane, <2 dat → null, zmiana czasu bez błędu', () => {
    expect(I.Cg(['2026-08-19', '2026-09-14', '2026-10-14'], 28)).toEqual({ min: 26, max: 30, warn: false });
    expect(I.Cg(['2026-08-19', '2026-09-12', '2026-10-14'], 28)).toEqual({ min: 24, max: 32, warn: false });
    expect(I.Cg(['2026-08-19', '2026-09-11', '2026-10-14'], 28)).toEqual({ min: 23, max: 33, warn: true });
    expect(I.Cg(['2026-08-19', '2026-08-19', '2026-09-16'], 28)).toEqual({ min: 28, max: 28, warn: false });
    expect(I.Cg(['2026-08-19'], 28)).toBeNull();
    expect(I.Cg([], 28)).toBeNull();
    // 15.03 → 12.04 przez zmianę czasu na letni (29.03): różnica to nadal 28 dni, nie 27,96
    expect(I.Cg(['2026-03-15', '2026-04-12'], 28)).toEqual({ min: 28, max: 28, warn: false });
  });
});

describe('D2 — „Przełóż” o miesiące kalendarzowe (Cc) zamiast 30/91/182 dni', () => {
  it('31.01.2026 +1 miesiąc → 28.02.2026 (dotąd +30 dni → 2.03 z pominięciem lutego)', () => {
    expect(I.R(I.Cc(data(2026, 1, 31), 1))).toBe('2026-02-28');
  });

  it('15.01.2026 +1/+3/+6 miesięcy → 15.02 / 15.04 / 15.07 (dotąd 14.02 / 16.04 / 16.07)', () => {
    expect(I.R(I.Cc(data(2026, 1, 15), 1))).toBe('2026-02-15');
    expect(I.R(I.Cc(data(2026, 1, 15), 3))).toBe('2026-04-15');
    expect(I.R(I.Cc(data(2026, 1, 15), 6))).toBe('2026-07-15');
  });

  it('30.11.2026 +3 miesiące → 28.02.2027 (dotąd +91 dni → 1.03); 31.08.2024 +6 → 28.02.2025; 31.08 +1 → 30.09', () => {
    expect(I.R(I.Cc(data(2026, 11, 30), 3))).toBe('2027-02-28');
    expect(I.R(I.Cc(data(2024, 8, 31), 6))).toBe('2025-02-28');
    expect(I.R(I.Cc(data(2026, 8, 31), 1))).toBe('2026-09-30');
    expect(I.R(I.Cc(data(2026, 12, 31), 1))).toBe('2027-01-31');
    expect(I.R(I.Cc(data(2028, 1, 31), 1))).toBe('2028-02-29');
  });

  it('Cc nie modyfikuje daty źródłowej i zwraca lokalną datę kalendarzową (Mn zapisuje tylko R(n); godzina wizyty idzie payloadem)', () => {
    const zrodlo = new Date(2026, 0, 31, 12, 0);
    const wynik = I.Cc(zrodlo, 1);
    expect(I.R(zrodlo)).toBe('2026-01-31');
    expect(zrodlo.getHours()).toBe(12);
    expect(I.R(wynik)).toBe('2026-02-28');
    expect(I.H(I.R(wynik)).getTime()).toBe(new Date(2026, 1, 28).getTime());
  });

  it('menu „Przełóż”: +1 tydzień to nadal 7 dni, a +1/+3/+6 miesięcy to kody miesięcy kalendarzowych', () => {
    // Mn() wymaga sejfu i DOM (jedyny wywołujący to menu), więc strażnik sprawdza tablicę menu
    // i gałąź Mn dla kodu „mN” w źródle.
    expect(TERMINARZ_SOURCE).toContain(
      '[["+1 tydzie\\u0144",7],["+1 miesi\\u0105c","m1"],["+3 miesi\\u0105ce","m3"],["+6 miesi\\u0119cy","m6"]]'
    );
    // Od naprawy krawędzi „a” (2026-09-03) Mn() najpierw czyta rekord z sejfu, więc między
    // nagłówkiem a gałęzią „mN” stoi już callback — dopuszczamy dowolny kod pośredni.
    expect(TERMINARZ_SOURCE).toMatch(/function Mn\(t,e\)\{[\s\S]{0,400}?typeof e=="string"&&e\.charAt\(0\)==="m"\?Cc\(r,parseInt\(e\.slice\(1\),10\)\|\|0\):new Date\(r\.getFullYear\(\),r\.getMonth\(\),r\.getDate\(\)\+e\)/);
  });
});

describe('D8 — próg „zaległych” (Cd) z lokalnych składników daty, niezależnie od strefy', () => {
  // Sejf porównuje leksykalnie d.dueDateISO ("YYYY-MM-DDT00:00:00.000Z") <= próg, więc próg
  // musi być lokalną datą kalendarzową „wczoraj”, a nie chwilą UTC z toISOString().
  // Strefę zmieniamy w locie przez process.env.TZ (Node przeładowuje tzset przy zapisie),
  // a zegar zamrażamy fałszywymi timerami na 2026-09-02 12:00 UTC — to 2.09 w Europie i obu Amerykach.
  const POLUDNIE_UTC_2026_09_02 = Date.UTC(2026, 8, 2, 12, 0, 0);
  const DZISIEJSZY_WPIS = '2026-09-02T00:00:00.000Z';
  const WCZORAJSZY_WPIS = '2026-09-01T00:00:00.000Z';
  const staraFormula = () => new Date(new Date().setHours(0, 0, 0, -1)).toISOString();

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = 'Europe/Warsaw';
  });

  it('Europe/Warsaw: 2.09.2026 → próg 2026-09-01T23:59:59.999Z; dzisiejszy wpis nie jest zaległy, wczorajszy jest', () => {
    vi.useFakeTimers({ now: POLUDNIE_UTC_2026_09_02 });
    expect(new Date().getTimezoneOffset()).toBe(-120);
    expect(I.Cd()).toBe('2026-09-01T23:59:59.999Z');
    expect(DZISIEJSZY_WPIS <= I.Cd()).toBe(false);
    expect(WCZORAJSZY_WPIS <= I.Cd()).toBe(true);
  });

  it('America/New_York (UTC−4): ten sam próg; stara formuła toISOString() dawała „dziśT03:59:59.999Z” i oznaczała dzisiejszy wpis jako zaległy', () => {
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers({ now: POLUDNIE_UTC_2026_09_02 });
    expect(new Date().getTimezoneOffset()).toBe(240);
    expect(I.Cd()).toBe('2026-09-01T23:59:59.999Z');
    expect(DZISIEJSZY_WPIS <= I.Cd()).toBe(false);
    expect(WCZORAJSZY_WPIS <= I.Cd()).toBe(true);
    // udokumentowana regresja sprzed PR 3
    expect(staraFormula()).toBe('2026-09-02T03:59:59.999Z');
    expect(DZISIEJSZY_WPIS <= staraFormula()).toBe(true);
  });

  it('America/Los_Angeles (UTC−7): ten sam próg; stara formuła dawała „dziśT06:59:59.999Z”', () => {
    process.env.TZ = 'America/Los_Angeles';
    vi.useFakeTimers({ now: POLUDNIE_UTC_2026_09_02 });
    expect(new Date().getTimezoneOffset()).toBe(420);
    expect(I.Cd()).toBe('2026-09-01T23:59:59.999Z');
    expect(DZISIEJSZY_WPIS <= I.Cd()).toBe(false);
    expect(staraFormula()).toBe('2026-09-02T06:59:59.999Z');
  });

  it('Pacific/Auckland (UTC+12): próg liczony z lokalnego „wczoraj”, nie z chwili UTC', () => {
    process.env.TZ = 'Pacific/Auckland';
    // 2026-09-02 06:00 UTC = 18:00 tego samego dnia w Auckland
    vi.useFakeTimers({ now: Date.UTC(2026, 8, 2, 6, 0, 0) });
    expect(new Date().getTimezoneOffset()).toBe(-720);
    expect(I.Cd()).toBe('2026-09-01T23:59:59.999Z');
    expect(DZISIEJSZY_WPIS <= I.Cd()).toBe(false);
  });

  it('bez zamrożonego zegara: próg = R(lokalne wczoraj) + "T23:59:59.999Z"', () => {
    const teraz = new Date();
    const wczoraj = new Date(teraz.getFullYear(), teraz.getMonth(), teraz.getDate() - 1);
    expect(I.Cd()).toBe(I.R(wczoraj) + 'T23:59:59.999Z');
    expect(I.R(teraz) + 'T00:00:00.000Z' <= I.Cd()).toBe(false);
  });
});
