process.env.TZ = 'Europe/Warsaw';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Audyt Terminarza 2026-09-02, I10/I11/D3–D7 — strażnicy prezentacji i statystyk (PR 4).
// Testy ładują PRAWDZIWY vilda_terminarz.js do fałszywego okna bez DOM (ten sam wzorzec co
// tests/unit/terminarz-daty.test.mjs: IIFE wykonuje tylko `g = w.document`, strażniki i ostatnią
// instrukcję en() → getElementById("terminarzRoot") === null, więc nie startuje UI ani sejf).
// Czyste funkcje czytamy z window.VildaTerminarz.__internals (hook rozszerzony w PR 4):
//   Dd(dy, skala, startMin, endMin, dlugoscBloku) → minuta siatki (czysta część lr(), I10);
//   Db(HH:MM, minuty) → {minutes, nextDay, text}; Dc(...) → text + " (+1 dz.)" (D5);
//   Ne(notatka) → opis zakresu godzin; Qa(HH:MM, minuty) → HH:MM końca (prefill modala);
//   Qe(tryb, ISO) → granice okresu i okresu poprzedniego; Wo(notatki, tryb, ISO, dziś, minuta)
//     → kafle statystyk z oknem „do dziś” (I11); Je(notatki, od, do, dziś, minuta) → agregaty
//     wraz z quality.pastVisits/completed/noShow (D3);
//   Bo(od, do) → dni robocze pon–pt bez świąt; Oo(notatki, od, do) → to samo minus nieobecności (D4);
//   Cr(pierwszaGodzina, indeks, odstęp) → slot pacjenta w partii albo null przy wyjściu poza dobę (D6);
//   Fr(ISO, ISO odniesienia) → etykieta względna (D7); yt/Ft — minuty ↔ HH:MM.
//
// Konwencja znalezisk: I10 = skala przeciągania w widoku tygodnia, I11 = okno porównawcze
// „poprzedni okres do dziś”, D3 = frekwencja liczona od północy, D4 = dni robocze bez świąt,
// D5 = zdarzenia przechodzące przez północ, D6 = ciche 23:59 w partii, D7 = etykiety względne.

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

const data = (rok, miesiac, dzien) => new Date(rok, miesiac - 1, dzien);
/** Notatka-wizyta (kategorie liczone jako wizyty: followup/observation/treatment/wynik-badania/procedura). */
const wizyta = (dueDateISO, extra = {}) =>
  Object.assign({ id: `n-${dueDateISO}-${extra.dueTime || 'all'}`, category: 'followup', dueDateISO }, extra);
const oISO = (przesuniecie, odniesienie) => {
  const d = I.H(odniesienie);
  d.setDate(d.getDate() + przesuniecie);
  return I.R(d);
};

describe('Hook testowy __internals (PR 4) — czyste funkcje prezentacji i statystyk', () => {
  it('publiczne API ma nadal cztery klucze, a __internals wystawia funkcje PR 3 i PR 4', () => {
    expect(Object.keys(win.VildaTerminarz)).toEqual(['version', 'refresh', 'setView', '__internals']);
    expect(win.VildaTerminarz.version).toBe('4.2.0');
    for (const nazwa of ['Jn', 'ge', 'ka', 'Vt', 'Nn', 'Dn', 'R', 'H', 'Ct', 'xr', 'Kn', 'Cc', 'Cd', 'Cg']) {
      expect(typeof I[nazwa], `PR 3: ${nazwa}`).toBe('function');
    }
    for (const nazwa of ['Qe', 'Wo', 'Je', 'Bo', 'Oo', 'Cr', 'Fr', 'Ne', 'Qa', 'Db', 'Dc', 'Dd', 'yt', 'Ft']) {
      expect(typeof I[nazwa], `PR 4: ${nazwa}`).toBe('function');
    }
    expect(I.Ae).toBe(120);
    expect(I.Cf).toBe(2200);
  });
});

describe('I11 — okno „poprzedni okres do dziś” przycięte do końca poprzedniego okresu (Wo)', () => {
  // Dotąd koniec okna poprzedniego to prevStart + s dni (s = długość bieżącego okresu do dziś)
  // BEZ przycięcia do prevEnd, więc pod koniec dłuższego miesiąca okno sięgało w miesiąc bieżący
  // i te same wizyty liczyły się w OBU oknach — kafel „vs poprz. okres (do dziś)” był zafałszowany.
  const NOTATKI = [
    wizyta('2026-02-10'),
    wizyta('2026-03-02'),
    wizyta('2026-03-20')
  ];

  it('31.03.2026: okno poprzednie kończy się 28.02 (nie 03.03) — luty ma 28 dni, marzec 31', () => {
    const wynik = I.Wo(NOTATKI, 'month', '2026-03-31', '2026-03-31', 1439);
    expect(I.R(wynik.range.start)).toBe('2026-03-01');
    expect(I.R(wynik.range.end)).toBe('2026-03-31');
    expect(I.R(wynik.range.prevStart)).toBe('2026-02-01');
    expect(I.R(wynik.range.prevEnd)).toBe('2026-02-28');
  });

  it('31.03.2026: wizyta z 02.03 nie wpada do okna poprzedniego → delta +100%, nie 0%', () => {
    const wynik = I.Wo(NOTATKI, 'month', '2026-03-31', '2026-03-31', 1439);
    expect(wynik.curToDate.visits).toBe(2); // 02.03 i 20.03
    expect(wynik.prevToDate.visits).toBe(1); // wyłącznie 10.02
    expect(wynik.visitsDelta).toBe(100);
  });

  it('żadna wizyta nie jest liczona w obu oknach naraz (suma okien = liczba wizyt w obu miesiącach)', () => {
    const wynik = I.Wo(NOTATKI, 'month', '2026-03-31', '2026-03-31', 1439);
    expect(wynik.curToDate.visits + wynik.prevToDate.visits).toBe(NOTATKI.length);
  });

  it('rok przestępny 31.12.2028: okno poprzednie kończy się 31.12.2027, bez przecieku 1 dnia w 2028', () => {
    // 2028 ma 366 dni, 2027 — 365; przesunięcie prevStart + 365 dawało 01.01.2028 (bieżący rok).
    const notatki = [wizyta('2028-01-01'), wizyta('2027-06-15')];
    const wynik = I.Wo(notatki, 'year', '2028-12-31', '2028-12-31', 1439);
    expect(I.R(wynik.range.prevStart)).toBe('2027-01-01');
    expect(I.R(wynik.range.prevEnd)).toBe('2027-12-31');
    expect(wynik.prevToDate.visits).toBe(1); // tylko 15.06.2027
    expect(wynik.curToDate.visits).toBe(1); // 01.01.2028 wyłącznie w oknie bieżącym
  });

  it('widok tygodnia bez zmian: oba okna po 7 dni (poniedziałek–niedziela)', () => {
    const wynik = I.Wo(NOTATKI, 'week', '2026-03-04', '2026-03-04', 1439);
    expect(I.R(wynik.range.prevStart)).toBe('2026-02-23');
    expect(I.R(wynik.range.prevEnd)).toBe('2026-03-01');
  });

  it('okno „do dziś” w środku miesiąca nie przekracza liczby dni, które upłynęły', () => {
    // 10.03 → 10 dni bieżącego okresu, więc okno poprzednie to 01.02–10.02 (mieści się w lutym).
    const wynik = I.Wo(NOTATKI, 'month', '2026-03-10', '2026-03-10', 1439);
    expect(wynik.prevToDate.visits).toBe(1); // 10.02 — ostatni dzień okna
    expect(wynik.curToDate.visits).toBe(1); // 02.03 (20.03 jeszcze przed nami)
  });
});

describe('D3 — „wizyta przeszła” w Je(): data z przeszłości albo dziś po godzinie / zamknięta', () => {
  // Dotąd warunkiem było `data <= dziś` (sam dzień, dueTime ignorowany), więc od PÓŁNOCY każda
  // dzisiejsza, jeszcze nieodbyta wizyta wchodziła do mianownika pastVisits: ring „wykonane”
  // i kafel frekwencji były zaniżone przez cały dzień.
  const DZIS = '2026-09-02';
  const OD = '2026-09-01';
  const DO = '2026-09-30';
  const jakosc = (notatki, minutaDoby) => I.Je(notatki, OD, DO, DZIS, minutaDoby).quality;

  afterEach(() => {
    vi.useRealTimers();
  });

  it('o 09:00 dzisiejsza wizyta na 15:00 NIE jest przeszła (ring 100%, nie 50%)', () => {
    const notatki = [
      wizyta('2026-09-01', { dueTime: '10:00', completedAtISO: '2026-09-01T10:00:00Z' }),
      wizyta(DZIS, { dueTime: '08:00', completedAtISO: `${DZIS}T08:00:00Z` }),
      wizyta(DZIS, { dueTime: '15:00' })
    ];
    const q = jakosc(notatki, 9 * 60);
    expect(q.pastVisits).toBe(2); // wczorajsza + dzisiejsza poranna
    expect(q.completed).toBe(2);
    expect(Math.round((q.completed / q.pastVisits) * 100)).toBe(100);
  });

  it('wczorajsza wizyta jest przeszła niezależnie od godziny', () => {
    expect(jakosc([wizyta('2026-09-01', { dueTime: '23:30' })], 0).pastVisits).toBe(1);
  });

  it('dzisiejsza wizyta z minioną godziną wchodzi do przeszłych (o 16:00 termin 15:00)', () => {
    const notatki = [wizyta(DZIS, { dueTime: '15:00' })];
    expect(jakosc(notatki, 15 * 60 - 1).pastVisits).toBe(0);
    expect(jakosc(notatki, 15 * 60).pastVisits).toBe(1); // granica: dokładnie o godzinie terminu
    expect(jakosc(notatki, 16 * 60).pastVisits).toBe(1);
  });

  it('dzisiejsza wizyta zamknięta przed swoją godziną liczy się od razu (bez znikania z ringu)', () => {
    const wykonana = [wizyta(DZIS, { dueTime: '20:00', completedAtISO: `${DZIS}T09:00:00Z` })];
    expect(jakosc(wykonana, 9 * 60)).toEqual({ pastVisits: 1, completed: 1, noShow: 0 });
    const nieobecny = [wizyta(DZIS, { dueTime: '20:00', noShowAtISO: `${DZIS}T09:00:00Z` })];
    expect(jakosc(nieobecny, 9 * 60)).toEqual({ pastVisits: 1, completed: 0, noShow: 1 });
  });

  it('dzisiejszy wpis CAŁODNIOWY (bez godziny) nie jest przeszły do końca dnia', () => {
    expect(jakosc([wizyta(DZIS)], 23 * 60 + 59).pastVisits).toBe(0);
    expect(jakosc([wizyta('2026-09-01')], 0).pastVisits).toBe(1); // wczorajszy całodniowy już tak
  });

  it('licznik „jeszcze niezamknięte” (przeszłe − wykonane − nieobecności) nie schodzi poniżej zera', () => {
    const notatki = [
      wizyta('2026-09-01', { dueTime: '10:00', completedAtISO: '2026-09-01T10:00:00Z' }),
      wizyta('2026-09-01', { dueTime: '11:00', noShowAtISO: '2026-09-01T11:00:00Z' }),
      wizyta('2026-09-01', { dueTime: '12:00' }),
      wizyta(DZIS, { dueTime: '08:00' }),
      wizyta(DZIS, { dueTime: '15:00' }),
      wizyta(DZIS)
    ];
    for (const minuta of [0, 9 * 60, 16 * 60, 23 * 60 + 59]) {
      const q = jakosc(notatki, minuta);
      expect(q.pastVisits - q.completed - q.noShow, `minuta ${minuta}`).toBeGreaterThanOrEqual(0);
      expect(q.pastVisits, `minuta ${minuta}`).toBeLessThanOrEqual(6);
    }
    expect(jakosc(notatki, 0).pastVisits).toBe(3); // o północy tylko wczorajsze
    expect(jakosc(notatki, 23 * 60 + 59).pastVisits).toBe(5); // + obie dzisiejsze z godziną
  });

  it('bez podanej minuty Je() korzysta z zegara urządzenia (zamrożony czas: 09:00 vs 16:00)', () => {
    const notatki = [wizyta(DZIS, { dueTime: '15:00' })];
    vi.useFakeTimers({ now: new Date(2026, 8, 2, 9, 0, 0).getTime() });
    expect(I.Je(notatki, OD, DO, DZIS).quality.pastVisits).toBe(0);
    vi.setSystemTime(new Date(2026, 8, 2, 16, 0, 0));
    expect(I.Je(notatki, OD, DO, DZIS).quality.pastVisits).toBe(1);
  });

  it('uszkodzony dueTime nie wpada do przeszłych (yt → NaN, porównanie fałszywe)', () => {
    expect(jakosc([wizyta(DZIS, { dueTime: 'abc' })], 23 * 60 + 59).pastVisits).toBe(0);
  });
});

describe('D4 — dni robocze bez świąt państwowych (Bo/Oo)', () => {
  // Dotąd Bo/Oo liczyły wyłącznie pon–pt, bez kalendarza świąt Vt() używanego w siatce i w silniku
  // serii: mianownik KPI „średnio dziennie/tygodniowo”, próg 5 dni i etykieta „N dni roboczych”
  // były zawyżone o 5–9% w miesiącach ze świętami.
  it('listopad 2026 → 20 dni roboczych (nie 21): 11.11 to środa, Święto Niepodległości', () => {
    expect(I.Vt('2026-11-11')).toBe('Święto Niepodległości');
    expect(I.Bo(data(2026, 11, 1), data(2026, 11, 30))).toBe(20);
  });

  it('grudzień 2026 → 21 dni (nie 23): 24, 25 i 26.12 — Wigilia i pierwszy dzień świąt w tygodniu', () => {
    expect(I.Bo(data(2026, 12, 1), data(2026, 12, 31))).toBe(21);
  });

  it('styczeń 2026 → 20 dni (nie 22): 1.01 (czwartek) i 6.01 (wtorek)', () => {
    expect(I.Bo(data(2026, 1, 1), data(2026, 1, 31))).toBe(20);
  });

  it('cały 2026 → 253 dni robocze (nie 261)', () => {
    expect(I.Bo(data(2026, 1, 1), data(2026, 12, 31))).toBe(253);
  });

  it('miesiąc, w którym święta wypadają w weekend, nie zmienia liczby dni (sierpień 2026: 15.08 to sobota)', () => {
    expect(I.Bo(data(2026, 8, 1), data(2026, 8, 31))).toBe(21);
  });

  it('Bo() ignoruje nieobecności lekarza — one należą wyłącznie do Oo()', () => {
    // Bo jest miarą kalendarzową (etykieta i mianownik porównywalny między okresami).
    const nieobecnosci = [
      { category: 'absence', dueDateISO: '2026-11-05' },
      { category: 'absence', dueDateISO: '2026-11-06' }
    ];
    expect(I.Bo(data(2026, 11, 1), data(2026, 11, 30))).toBe(20);
    expect(I.Oo([], data(2026, 11, 1), data(2026, 11, 30))).toBe(20);
    expect(I.Oo(nieobecnosci, data(2026, 11, 1), data(2026, 11, 30))).toBe(18);
  });

  it('Oo() nie odejmuje dwa razy nieobecności przypadającej w święto (11.11.2026)', () => {
    const wSwieto = [{ category: 'absence', dueDateISO: '2026-11-11' }];
    expect(I.Oo(wSwieto, data(2026, 11, 1), data(2026, 11, 30))).toBe(20);
  });

  it('zakres jednodniowy i odwrócony: święto → 0, dzień roboczy → 1, koniec przed początkiem → 0', () => {
    expect(I.Bo(data(2026, 11, 11), data(2026, 11, 11))).toBe(0);
    expect(I.Bo(data(2026, 11, 10), data(2026, 11, 10))).toBe(1);
    expect(I.Bo(data(2026, 11, 30), data(2026, 11, 1))).toBe(0);
  });
});

describe('D5 — koniec zdarzenia przechodzącego przez północ (Db/Dc/Ne/Qa)', () => {
  // Moduł miał trzy niespójne granice doby: 1439 (wiersze list, popover, wydruk, CSV), 1435 (Qa —
  // podgląd i prefill pola „koniec”) i 1440 (klamra zapisu). 12-godzinny dyżur od 19:00 pokazywał
  // się jako „19:00–23:59”, a modal — „23:55”. Teraz jedna funkcja Db liczy koniec bez klamry.
  it('dyżur 19:00 + 720 min → koniec 07:00 następnego dnia (nie 23:59 i nie 23:55)', () => {
    expect(I.Db('19:00', 720)).toEqual({ minutes: 1860, nextDay: true, text: '07:00' });
    expect(I.Dc('19:00', 720)).toBe('07:00 (+1 dz.)');
    expect(I.Ne({ dueTime: '19:00', durationMin: 720, category: 'duty' })).toBe('19:00–07:00 (+1 dz.)');
    expect(I.Qa('19:00', 720)).toBe('07:00');
  });

  it('nocny dyżur nie pokazuje nigdzie 23:59 ani 23:55', () => {
    const opis = I.Ne({ dueTime: '19:00', durationMin: 720, category: 'duty' });
    for (const tekst of [opis, I.Dc('19:00', 720), I.Qa('19:00', 720)]) {
      expect(tekst).not.toContain('23:59');
      expect(tekst).not.toContain('23:55');
    }
  });

  it('wizyta 23:00 + 120 min → „23:00–01:00 (+1 dz.)”', () => {
    expect(I.Ne({ dueTime: '23:00', durationMin: 120 })).toBe('23:00–01:00 (+1 dz.)');
    expect(I.Qa('23:00', 120)).toBe('01:00');
  });

  it('zdarzenie w obrębie doby: 10:00 + 30 min → „10:00–10:30” bez sufiksu', () => {
    expect(I.Db('10:00', 30)).toEqual({ minutes: 630, nextDay: false, text: '10:30' });
    expect(I.Dc('10:00', 30)).toBe('10:30');
    expect(I.Ne({ dueTime: '10:00', durationMin: 30 })).toBe('10:00–10:30');
    expect(I.Qa('10:00', 30)).toBe('10:30');
  });

  it('dokładna północ liczy się już do dnia następnego (12:00 + 720 min → 00:00 (+1 dz.))', () => {
    expect(I.Db('12:00', 720)).toEqual({ minutes: 1440, nextDay: true, text: '00:00' });
    expect(I.Ne({ dueTime: '12:00', durationMin: 720 })).toBe('12:00–00:00 (+1 dz.)');
    expect(I.Db('23:30', 30)).toEqual({ minutes: 1440, nextDay: true, text: '00:00' });
  });

  it('Ne, Qa i Dc podają tę samą minutę końca dla całej doby startu (co 15 min, trwanie 720)', () => {
    for (let start = 0; start < 1440; start += 15) {
      const hhmm = I.Ft(start);
      const koniec = I.Db(hhmm, 720);
      const przezPolnoc = start + 720 >= 1440;
      expect(koniec.minutes, hhmm).toBe(start + 720);
      expect(koniec.nextDay, hhmm).toBe(przezPolnoc);
      expect(I.Qa(hhmm, 720), hhmm).toBe(koniec.text);
      expect(I.Dc(hhmm, 720), hhmm).toBe(koniec.text + (przezPolnoc ? ' (+1 dz.)' : ''));
      expect(I.Ne({ dueTime: hhmm, durationMin: 720 }), hhmm).toBe(`${hhmm}–${I.Dc(hhmm, 720)}`);
    }
  });

  it('pozostałe gałęzie Ne() bez zmian: dyżur bez godziny → „12 h”, brak czasu trwania → ""', () => {
    expect(I.Ne({ durationMin: 720, category: 'duty' })).toBe('12 h');
    expect(I.Ne({ durationMin: 45 })).toBe('45 min');
    expect(I.Ne({ dueTime: '19:00' })).toBe('');
    expect(I.Ne(null)).toBe('');
  });

  it('uszkodzony dueTime nie produkuje „NaN:NaN” — Db zwraca pusty tekst', () => {
    expect(I.Db('abc', 60)).toEqual({ minutes: NaN, nextDay: false, text: '' });
    expect(I.Dc('abc', 60)).toBe('');
  });

  it('wszystkie tory prezentacji (wiersze, popover, wydruk bi, CSV Po) liczą koniec przez Dc()', () => {
    // bi()/Po()/xa() wymagają DOM i sejfu, więc spójność sprawdzamy w źródle: stałe 1435 i 1439
    // zniknęły z torów prezentacji, a każdy z nich woła tę samą funkcję Dc.
    expect(TERMINARZ_SOURCE).not.toContain('1435');
    expect(TERMINARZ_SOURCE.match(/1439/g) || []).toHaveLength(1); // wyłącznie granica doby w Cr (D6)
    expect(TERMINARZ_SOURCE).not.toContain('Math.min(yt(t.dueTime)+t.durationMin,1439)');
    expect(TERMINARZ_SOURCE.match(/Dc\(t\.dueTime,t\.durationMin\)/g) || []).toHaveLength(4);
    expect(TERMINARZ_SOURCE).toContain('Dc(e.dueTime,e.durationMin)'); // popover xa()
  });
});

describe('D6 — partia z listy oczekujących bez cichego 23:59 (Cr)', () => {
  // Dotąd slot i-tego pacjenta był przycinany do 1439 → nadmiarowi pacjenci dostawali identyczny
  // dueTime „23:59” tego samego dnia, bez żadnego komunikatu (duplikaty w podglądzie i w zapisie).
  const partia = (start, ilu, odstep) => Array.from({ length: ilu }, (_, i) => I.Cr(start, i, odstep));

  it('start 23:00, odstęp 15 min: pacjenci 0–3 dostają 23:00–23:45, kolejni null (brak slotu)', () => {
    expect(partia('23:00', 8, 15)).toEqual(['23:00', '23:15', '23:30', '23:45', null, null, null, null]);
  });

  it('żaden pacjent poza dobą nie dostaje „23:59” ani terminu zdublowanego', () => {
    const sloty = partia('23:00', 8, 15);
    expect(sloty).not.toContain('23:59');
    const przyznane = sloty.filter((s) => s !== null);
    expect(new Set(przyznane).size).toBe(przyznane.length);
  });

  it('partia mieszcząca się w dobie bez zmian: 09:00 co 20 min', () => {
    expect(partia('09:00', 4, 20)).toEqual(['09:00', '09:20', '09:40', '10:00']);
  });

  it('23:59 to wciąż poprawny slot (granica doby, nie przycięcie)', () => {
    expect(I.Cr('23:59', 0, 15)).toBe('23:59');
    expect(I.Cr('23:44', 1, 15)).toBe('23:59');
    expect(I.Cr('23:45', 1, 15)).toBe(null);
  });

  it('sloty rosną monotonicznie, więc sprawdzenie ostatniego wystarcza jako strażnik zapisu', () => {
    const ilu = 6;
    const sloty = partia('23:00', ilu, 15);
    expect(I.Cr('23:00', ilu - 1, 15)).toBe(null);
    expect(sloty.indexOf(null)).toBe(4);
    expect(sloty.slice(4).every((s) => s === null)).toBe(true);
  });
});

describe('D7 — etykiety względne: ciągła drabina dni → tygodnie → miesiące → lata (Fr)', () => {
  // Przed audytem: „za N dni” do 45 dni, powyżej round(N/30,44) miesięcy — skok z „za 45 dni” na
  // „za 2 mies.”. PR 4 wypełnił lukę tygodniami (14–52 dni), ale kubełek „za 1 mies.” nadal nie
  // występował, a rok opisywały miesiące („za 12 mies.”). PR 8 (decyzja właściciela 2026-09-03)
  // domyka drabinę: ≤13 dni → dni, 14–34 → tygodnie (2–5), 35–349 → miesiące (1–11), powyżej →
  // lata z polską odmianą (rok / lata / lat).
  const ODNIESIENIE = '2026-09-02';
  const za = (n) => I.Fr(oISO(n, ODNIESIENIE), ODNIESIENIE);

  it('tabela progów dla przyszłości', () => {
    expect(za(0)).toBe('dziś');
    expect(za(1)).toBe('jutro');
    expect(za(7)).toBe('za 7 dni');
    expect(za(13)).toBe('za 13 dni');
    expect(za(14)).toBe('za 2 tyg.');
    expect(za(20)).toBe('za 3 tyg.');
    expect(za(34)).toBe('za 5 tyg.');
    expect(za(35)).toBe('za 1 mies.');
    expect(za(45)).toBe('za 1 mies.');
    expect(za(46)).toBe('za 2 mies.');
    expect(za(90)).toBe('za 3 mies.');
    expect(za(349)).toBe('za 11 mies.');
    expect(za(350)).toBe('za 1 rok');
    expect(za(365)).toBe('za 1 rok');
    expect(za(548)).toBe('za 2 lata');
    expect(za(1000)).toBe('za 3 lata');
    expect(za(1826)).toBe('za 5 lat');
  });

  it('symetria dla przeszłości, z odmianą lat', () => {
    expect(za(-1)).toBe('wczoraj');
    expect(za(-7)).toBe('7 dni temu');
    expect(za(-14)).toBe('2 tyg. temu');
    expect(za(-35)).toBe('1 mies. temu');
    expect(za(-90)).toBe('3 mies. temu');
    expect(za(-365)).toBe('1 rok temu');
    expect(za(-730)).toBe('2 lata temu');
    expect(za(-1826)).toBe('5 lat temu');
  });

  it('każdy kubełek naprawdę występuje — miesiąc i rok już nie są pomijane', () => {
    const wszystkie = new Set();
    for (let n = 2; n <= 2000; n += 1) wszystkie.add(za(n));
    expect(wszystkie.has('za 1 mies.'), 'kubełek „za 1 mies.” istnieje').toBe(true);
    expect(wszystkie.has('za 1 rok'), 'kubełek „za 1 rok” istnieje').toBe(true);
    expect(wszystkie.has('za 11 mies.'), 'miesiące dochodzą do 11').toBe(true);
    expect(wszystkie.has('za 12 mies.'), 'rok opisują lata, nie 12 miesięcy').toBe(false);
    expect(wszystkie.has('za 1 tyg.'), 'tydzień opisują dni („za 7 dni”)').toBe(false);
  });

  it('brak przeskoków między jednostkami: dni → tygodnie → miesiące → lata', () => {
    const jednostka = (n) => za(n).replace(/^za /, '').replace(/^\d+ /, '');
    expect(jednostka(13)).toBe('dni');
    expect(jednostka(14)).toBe('tyg.');
    expect(jednostka(34)).toBe('tyg.');
    expect(jednostka(35)).toBe('mies.');
    expect(jednostka(349)).toBe('mies.');
    expect(jednostka(350)).toBe('rok');
    // Po etykiecie dziennej nigdy nie następuje miesięczna ani roczna, po tygodniowej — roczna.
    for (let n = 2; n <= 2000; n += 1) {
      const tu = jednostka(n);
      const dalej = jednostka(n + 1);
      if (tu === 'dni') expect(['dni', 'tyg.'], `granica przy ${n}`).toContain(dalej);
      if (tu === 'tyg.') expect(['tyg.', 'mies.'], `granica przy ${n}`).toContain(dalej);
      if (tu === 'mies.') expect(['mies.', 'rok'], `granica przy ${n}`).toContain(dalej);
    }
  });

  it('etykiety są ciągłe i niemalejące w obrębie jednostki dla 2…2000 dni', () => {
    const kolejnosc = { dni: 0, 'tyg.': 1, 'mies.': 2, rok: 3, lata: 3, lat: 3 };
    let poprzedniaJednostka = 0;
    let poprzedniaLiczba = 0;
    for (let n = 2; n <= 2000; n += 1) {
      const etykieta = za(n);
      const m = etykieta.match(/^za (\d+) (dni|tyg\.|mies\.|rok|lata|lat)$/);
      expect(m, `N=${n} → ${etykieta}`).toBeTruthy();
      const jednostka = kolejnosc[m[2]];
      expect(jednostka, `N=${n}`).toBeGreaterThanOrEqual(poprzedniaJednostka);
      const liczba = Number(m[1]);
      if (jednostka === poprzedniaJednostka) {
        expect(liczba, `N=${n} → ${etykieta}`).toBeGreaterThanOrEqual(poprzedniaLiczba);
      }
      poprzedniaJednostka = jednostka;
      poprzedniaLiczba = liczba;
    }
  });

  it('drugi argument (data odniesienia) jest opcjonalny — bez niego liczy się od dziś', () => {
    const dzis = I.R(new Date());
    expect(I.Fr(dzis)).toBe('dziś');
    expect(I.Fr(oISO(1, dzis))).toBe('jutro');
    expect(I.Fr(oISO(-1, dzis))).toBe('wczoraj');
    expect(I.Fr(oISO(20, dzis))).toBe('za 3 tyg.');
  });
});

describe('I10 — skala przeciągania w widoku tygodnia: px → minuta siatki (Dd)', () => {
  // lr() przeliczało pozycję kursora stałą 2 px/min, podczas gdy zr() dopasowuje slot 30-minutowy
  // do wysokości okna (48–60 px, Ze = 1,6–2,0) i tą samą skalą gt() rysuje bloki, linię „teraz”
  // i wskaźnik upuszczenia. Dd() liczy minutę siatki podaną skalą — bez rozjazdu z rysowaniem.
  const START = 8 * 60; // siatka 08:00–21:00 (26 wierszy po 30 min)
  const KONIEC = 21 * 60;
  const minuta = (dy, skala, dur = 30) => I.Ft(I.Dd(dy, skala, START, KONIEC, dur));

  it('skala jest respektowana: ten sam odcinek pikseli to inna minuta przy 1,6 i przy 2,0 px/min', () => {
    // 480 px: przy 1,6 px/min = 300 min (5 h) → 13:00; przy 2,0 px/min = 240 min (4 h) → 12:00.
    expect(minuta(480, 1.6)).toBe('13:00');
    expect(minuta(480, 2)).toBe('12:00');
    // 8 slotów desktopowych (8 × 48 px): przy 1,6 to 4 h, przy 2,0 tylko 3 h 12 min → 11:15.
    expect(minuta(8 * 48, 1.6)).toBe('12:00');
    expect(minuta(8 * 48, 2)).toBe('11:15');
  });

  it('jeden slot 48 px przy skali 1,6 px/min to 30 minut siatki; przy 2,0 px/min — 24 minuty', () => {
    expect(I.Dd(48, 1.6, START, KONIEC, 30) - START).toBe(30);
    // 24 min wpada w zaokrąglenie do 15-minutowej siatki (24 → 30), więc mierzymy na 5 slotach:
    // 5 × 48 px przy 2,0 to 120 min (nie 150), czyli 10:00 zamiast 10:30.
    expect(I.Dd(5 * 48, 2, START, KONIEC, 30) - START).toBe(120);
    expect(I.Dd(5 * 48, 1.6, START, KONIEC, 30) - START).toBe(150);
  });

  it('celowanie w wiersz „14:00” zapisuje 14:00 przy każdej wysokości slotu (48/53/60 px)', () => {
    for (const slot of [48, 53, 60]) {
      const skala = slot / 30;
      expect(minuta((14 * 60 - START) * skala, skala), `slot ${slot}px`).toBe('14:00');
      expect(minuta((20 * 60 + 15 - START) * skala, skala), `slot ${slot}px`).toBe('20:15');
    }
  });

  it('mobile (Ze = 2, slot 60 px) — dotychczasowa stała 2 px/min była tam przypadkiem poprawna', () => {
    expect(minuta((14 * 60 - START) * 2, 2)).toBe('14:00');
  });

  it('zaokrąglenie do 15 minut bez zmian semantyki (14:07 → 14:00, 14:08 → 14:15)', () => {
    expect(minuta((14 * 60 + 7 - START) * 1.6, 1.6)).toBe('14:00');
    expect(minuta((14 * 60 + 8 - START) * 1.6, 1.6)).toBe('14:15');
  });

  it('klamry siatki: kursor nad siatką → początek, pod siatką → ostatni slot mieszczący blok', () => {
    for (const skala of [1.6, 53 / 30, 2]) {
      expect(minuta(-50, skala), `skala ${skala}`).toBe('08:00');
      expect(minuta(999999, skala, 30), `skala ${skala}`).toBe('20:30');
      expect(minuta(999999, skala, 60), `skala ${skala}`).toBe('20:00');
    }
  });

  it('dotychczasowa stała 2 px/min przy slocie 48 px celowała ~75 min za wysoko (regresja audytu)', () => {
    const skala = 48 / 30; // 1,6
    const dy = (14 * 60 - START) * skala; // piksel wiersza „14:00”
    const staraArytmetyka = Math.round((START + dy / 2) / 15) * 15;
    expect(I.Ft(staraArytmetyka)).toBe('12:45');
    expect(minuta(dy, skala)).toBe('14:00');
  });

  it('siatka rozciągnięta poza dobę (yr) — koniec siatki przycięty do 1440 trzyma wynik w dobie', () => {
    // yr() rozciąga siatkę do końca najpóźniejszego zdarzenia, więc wiersze bywają etykietowane
    // „24:00”…„30:30” (wizyta 23:45 + 30 min, dyżur nocny 19:00 + 12 h). Minuta ≥ 1440 daje
    // „24:00”, czego regex sejfu /^([01]\d|2[0-3]):[0-5]\d$/ nie przyjmuje — dueTime zostałby
    // wyzerowany i wizyta cicho stałaby się wpisem całodniowym. Dlatego koniec siatki jest
    // przycinany do doby ZANIM trafi do Dd (klamra Math.min(..., 1440) po stronie lr()).
    const koniecSiatki = (endMin) => Math.min(endMin, 1440);
    const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const skala of [1.6, 53 / 30, 2]) {
      for (const rozciagnieta of [24 * 60, 27 * 60, 31 * 60]) {
        const koniec = koniecSiatki(rozciagnieta);
        expect(I.Dd(999999, skala, START, koniec, 30), `skala ${skala}, koniec ${rozciagnieta}`)
          .toBeLessThanOrEqual(1440 - 30);
        expect(I.Ft(I.Dd(999999, skala, START, koniec, 30))).toBe('23:30');
        expect(I.Ft(I.Dd(999999, skala, START, koniec, 60))).toBe('23:00');
        expect(HHMM.test(I.Ft(I.Dd(999999, skala, START, koniec, 30)))).toBe(true);
      }
    }
  });

  it('zerowa/ujemna skala nie wysypuje przeliczenia (bezpieczny fallback 2 px/min)', () => {
    expect(minuta(480, 0)).toBe('12:00');
    expect(minuta(480, -1)).toBe('12:00');
  });
});
