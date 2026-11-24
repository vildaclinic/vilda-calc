import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-BAZA-STATYSTYKI, etap 1 (decyzja właściciela 2026-11-23): statystyki opisowe Bazy pacjentów —
// wiek, płeć i kompletność danych. Model ładowany z PLIKU PRODUKCYJNEGO (vilda_patients_list.js);
// wszystkie osoby są fikcyjne.

function modul() {
  const win = {};
  loadBrowserScript('vilda_patients_list.js', win);
  return win.VildaPatientsList;
}
const DZIS = new Date(2026, 5, 17, 13, 0, 0); // 17.06.2026, doba lokalna
let numer = 0;
function pacjent(dobISO, sex, extra = {}) {
  numer += 1;
  return { patientId: 'p' + numer, lastSavedAtISO: '2026-06-01T10:00:00.000Z', header: { name: 'Fikcyjny ' + numer, dobISO, sex }, ...extra };
}

describe('Wiek i płeć z nagłówków kart (demographics)', () => {
  it('liczy tylko pacjentów z bazy; osoba spoza bazy nie wchodzi do żadnej liczby', () => {
    const { demographics } = modul();
    const wynik = demographics([
      pacjent('2016-01-15', 'M'), pacjent('2016-01-15', 'F'),
      { patientId: 'ext', __ext: true, header: { name: 'Fikcyjna Spoza', birthYear: 2016, sex: 'F' } },
    ], { now: DZIS });
    expect(wynik.total).toBe(2);
    expect(wynik.sex).toEqual({ M: 1, F: 1, unknown: 0 });
    expect(wynik.bands.reduce((suma, przedzial) => suma + przedzial.total, 0)).toBe(2);
  });

  it('płeć: M to chłopcy, F i K to dziewczęta, reszta nieznana i wykazana osobno', () => {
    const { demographics } = modul();
    const rekordy = [pacjent('2016-01-15', 'M'), pacjent('2016-01-15', 'F'), pacjent('2016-01-15', 'K'), pacjent('2016-01-15', ''), pacjent('2016-01-15', undefined)];
    const wynik = demographics(rekordy, { now: DZIS });
    expect(wynik.sex).toEqual({ M: 1, F: 2, unknown: 2 });
    expect(wynik.sexIds.F).toEqual([rekordy[1].patientId, rekordy[2].patientId]);
    expect(wynik.missingSex).toEqual([rekordy[3].patientId, rekordy[4].patientId]);
  });

  it('wiek na dziś w pełnych miesiącach: dzień przed urodzinami dziecko jest jeszcze młodsze', () => {
    const { demographics } = modul();
    const jutro = demographics([pacjent('2016-06-18', 'F')], { now: DZIS });
    expect(jutro.meanMonths).toBe(119);
    expect(jutro.bands.find((p) => p.key === '6-9').total).toBe(1);
    const dzis = demographics([pacjent('2016-06-17', 'F')], { now: DZIS });
    expect(dzis.meanMonths).toBe(120);
    expect(dzis.bands.find((p) => p.key === '10-13').total).toBe(1);
  });

  it('granice przedziałów: 0–2, 3–5, 6–9, 10–13, 14–17, 18+ w pełnych latach', () => {
    const { demographics } = modul();
    const przypadki = [[0, '0-2'], [35, '0-2'], [36, '3-5'], [71, '3-5'], [72, '6-9'], [119, '6-9'], [120, '10-13'],
      [167, '10-13'], [168, '14-17'], [215, '14-17'], [216, '18+'], [600, '18+']];
    for (const [miesiace, klucz] of przypadki) {
      const wynik = demographics([pacjent('2000-01-01', 'M')], { now: DZIS, ageMonths: () => miesiace });
      expect(wynik.bands.filter((p) => p.total).map((p) => p.key), `${miesiace} mies.`).toEqual([klucz]);
    }
  });

  it('średnia, mediana i zakres; osobno średni wiek chłopców i dziewcząt', () => {
    const { demographics } = modul();
    const wiek = { a: 18, b: 60, c: 101, d: 146 };
    const rekordy = [pacjent('a', 'F'), pacjent('b', 'M'), pacjent('c', 'M'), pacjent('d', 'F')];
    const wynik = demographics(rekordy, { now: DZIS, ageMonths: (dob) => wiek[dob] });
    expect(wynik.withAge).toBe(4);
    expect(wynik.meanMonths).toBeCloseTo(81.25, 6);
    expect(wynik.medianMonths).toBe(80.5); // parzysta liczba: średnia dwóch środkowych
    expect(wynik.minMonths).toBe(18);
    expect(wynik.maxMonths).toBe(146);
    expect(wynik.meanMonthsBySex).toEqual({ M: 80.5, F: 82 });
    expect(demographics(rekordy.slice(0, 3), { now: DZIS, ageMonths: (dob) => wiek[dob] }).medianMonths).toBe(60);
  });

  it('bez pełnej daty urodzenia pacjent nie wchodzi do wieku — wiek z zapisu ani rok urodzenia go nie zastępują', () => {
    const { demographics } = modul();
    const bez = pacjent('', 'M', { header: { name: 'Fikcyjny Bezdaty', sex: 'M', age: 7, ageMonths: 0, birthYear: 2019 } });
    const przyszla = pacjent('2027-01-01', 'F');
    const bledna = pacjent('2016-13-40', 'F');
    const wynik = demographics([pacjent('2016-01-15', 'M'), bez, przyszla, bledna], { now: DZIS });
    expect(wynik.total).toBe(4);
    expect(wynik.withAge).toBe(1);
    expect(wynik.missingDob).toEqual([bez.patientId, przyszla.patientId, bledna.patientId]);
    expect(wynik.sex).toEqual({ M: 2, F: 2, unknown: 0 }); // płeć liczy się niezależnie od daty urodzenia
  });

  it('„z zapisem w ostatnich 12 mies.” liczy ostatni zapis karty', () => {
    const { demographics } = modul();
    const wynik = demographics([
      pacjent('2016-01-15', 'M', { lastSavedAtISO: '2026-06-16T08:00:00.000Z' }),
      pacjent('2016-01-15', 'M', { lastSavedAtISO: '2025-06-18T08:00:00.000Z' }),
      pacjent('2016-01-15', 'M', { lastSavedAtISO: '2025-06-01T08:00:00.000Z' }),
      pacjent('2016-01-15', 'M', { lastSavedAtISO: null }),
    ], { now: DZIS });
    expect(wynik.recent).toBe(2);
  });

  it('pusta baza nie rzuca i nie zmyśla wieku', () => {
    const { demographics } = modul();
    const wynik = demographics([], { now: DZIS });
    expect(wynik).toMatchObject({ total: 0, withAge: 0, meanMonths: null, medianMonths: null, minMonths: null, maxMonths: null });
  });
});

describe('Kompletność jednej karty (cardCompleteness)', () => {
  it('co najmniej dwa pomiary wzrostu w różnym wieku — z historii, punktów leczenia i formularza', () => {
    const { cardCompleteness } = modul();
    expect(cardCompleteness({ user: { age: 8, ageMonths: 5, height: 130 } }).measurements).toBe(false);
    expect(cardCompleteness({
      user: { age: 8, ageMonths: 5, height: 130 },
      growthBasic: { data: { measurements: [{ ageMonths: 89, height: 124 }, { ageMonths: 101, height: 130 }] } },
    }).measurements, 'bieżący pomiar i wiersz historii w tym samym wieku liczą się raz').toBe(true);
    expect(cardCompleteness({
      user: { age: 8, ageMonths: 5, height: 130 },
      growthBasic: { data: { measurements: [{ ageMonths: 101, height: 130 }] } },
      advanced: { data: { measurements: [{ ageMonths: 101, ageYears: 8.4, height: 130 }] } },
    }).measurements, 'ten sam pomiar w trzech miejscach to nadal jeden pomiar').toBe(false);
    expect(cardCompleteness({
      ghTherapyPoints: [{ type: 'start', ageYears: 7, ageMonths: 2, height: 118 }, { type: 'continue', ageYears: 8, ageMonths: 1, height: 127 }],
    }).measurements).toBe(true);
    expect(cardCompleteness({
      user: { age: 12, ageMonths: 0, height: '' },
      obesityTherapyPoints: [{ ageYears: 12, ageMonths: 0, height: 150 }, { ageYears: 12, ageMonths: 6, height: null }],
    }).measurements, 'punkt bez wzrostu nie jest pomiarem wzrostu').toBe(false);
  });

  it('wzrost obojga rodziców i masa urodzeniowa (karta SGA albo dane okołoporodowe)', () => {
    const { cardCompleteness } = modul();
    expect(cardCompleteness({ advanced: { motherHeight: 165, fatherHeight: 178 } }).parents).toBe(true);
    expect(cardCompleteness({ advanced: { motherHeight: '165', fatherHeight: '' } }).parents).toBe(false);
    expect(cardCompleteness({ advanced: { motherHeight: 0, fatherHeight: 178 } }).parents).toBe(false);
    expect(cardCompleteness({ birth: { weight: '3300' } }).birthWeight).toBe(true);
    expect(cardCompleteness({ birth: { weight: '3 300' } }).birthWeight).toBe(true);
    expect(cardCompleteness({ perinatal: { birthWeightG: 2900 } }).birthWeight).toBe(true);
    expect(cardCompleteness({ birth: { weeks: '39', weight: '' }, perinatal: {} }).birthWeight).toBe(false);
  });

  it('pusty albo uszkodzony zapis daje trzy braki, nie wyjątek', () => {
    const { cardCompleteness } = modul();
    for (const zapis of [null, undefined, {}, 'tekst', { user: null, advanced: null, growthBasic: { data: null } }]) {
      expect(cardCompleteness(zapis)).toEqual({ measurements: false, parents: false, birthWeight: false });
    }
  });
});

describe('Zapis wieku (formatAge)', () => {
  it('poniżej roku w miesiącach, potem lata z jednym miejscem po przecinku', () => {
    const { formatAge } = modul();
    expect(formatAge(5)).toBe('5 mies.');
    expect(formatAge(11.6)).toBe('12 mies.');
    expect(formatAge(18)).toBe('1,5 roku');
    expect(formatAge(126.57)).toBe('10,5 roku');
    expect(formatAge(253)).toBe('21,1 roku');
    expect(formatAge(null)).toBe('—');
  });
});
