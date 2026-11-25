import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-BAZA-ZAKRES (decyzja właściciela 2026-11-24: „popracuj nad selektorem Zakres bo tam jest mały wybór”):
// pozycje pola „Zakres” w Statystykach Bazy — okna ostatniego zapisu karty (3, 6, 12 mies. i ich dopełnienia:
// bez zapisu od ponad 12 albo 24 mies.) oraz zakresy leczenia (hormon wzrostu, otyłość) z wyniku liczenia kart.
// Model ładowany z PLIKU PRODUKCYJNEGO (vilda_patients_list.js); wszystkie osoby są fikcyjne.
function modul() {
  const win = {};
  loadBrowserScript('vilda_patients_list.js', win);
  return win.VildaPatientsList;
}
// Chwile zapisu w dobie lokalnej (rok, miesiąc 1–12, dzień, godzina, minuta) — test nie zależy od strefy czasowej.
const chwila = (rok, miesiac, dzien, godzina = 13, minuta = 0) => new Date(rok, miesiac - 1, dzien, godzina, minuta, 0).toISOString();
const osoba = (id, zapis, sex = 'F', extra = {}) =>
  ({ patientId: id, lastSavedAtISO: zapis, header: { name: 'Fikcyjna Osoba ' + id, dobISO: '2015-01-01', sex }, ...extra });
const DZIS = new Date(2026, 5, 17, 13, 0, 0); // 17.06.2026, 13:00 doby lokalnej
// Każda granica ma osobę dokładnie na niej i osobę minutę wcześniej.
const BAZA = [
  osoba('dzis', chwila(2026, 6, 17, 12, 59)),
  osoba('m3-na', chwila(2026, 3, 17, 13, 0)), osoba('m3-przed', chwila(2026, 3, 17, 12, 59)),
  osoba('m6-na', chwila(2025, 12, 17, 13, 0)), osoba('m6-przed', chwila(2025, 12, 17, 12, 59)),
  osoba('m12-na', chwila(2025, 6, 17, 13, 0)), osoba('m12-przed', chwila(2025, 6, 17, 12, 59)),
  osoba('m24-na', chwila(2024, 6, 17, 13, 0)), osoba('m24-przed', chwila(2024, 6, 17, 12, 59)),
  osoba('bez-daty', ''), osoba('zla-data', 'nie-data'),
  { patientId: 'spoza', __ext: true, lastSavedAtISO: chwila(2020, 1, 1), header: { name: 'Fikcyjna Spoza', birthYear: 2016, sex: 'F' } },
];
const WSZYSCY = BAZA.filter((p) => !p.__ext).map((p) => p.patientId);
const opcje = (extra = {}) => ({ now: DZIS, ...extra });

describe('Pozycje pola „Zakres” (scopeRanges, scopeFilters, scopeLabel, scopeKey)', () => {
  it('siedem pozycji w dwóch rodzinach; tylko zakresy leczenia potrzebują wyniku kart', () => {
    const { scopeRanges, scopeNeedsCards } = modul();
    expect(scopeRanges()).toEqual([
      { key: 'm3', group: 'Ostatni zapis karty', label: 'z zapisem w ostatnich 3 mies.', needsCards: false },
      { key: 'm6', group: 'Ostatni zapis karty', label: 'z zapisem w ostatnich 6 mies.', needsCards: false },
      { key: 'm12', group: 'Ostatni zapis karty', label: 'z zapisem w ostatnich 12 mies.', needsCards: false },
      { key: 'o12', group: 'Ostatni zapis karty', label: 'bez zapisu od ponad 12 mies.', needsCards: false },
      { key: 'o24', group: 'Ostatni zapis karty', label: 'bez zapisu od ponad 24 mies.', needsCards: false },
      { key: 'gh', group: 'Leczenie', label: 'leczeni hormonem wzrostu', needsCards: true },
      { key: 'ob', group: 'Leczenie', label: 'leczeni z powodu otyłości', needsCards: true },
    ]);
    expect(scopeRanges().filter((pozycja) => scopeNeedsCards({ range: pozycja.key })).map((pozycja) => pozycja.key)).toEqual(['gh', 'ob']);
    expect(scopeNeedsCards(null)).toBe(false);
    expect(scopeNeedsCards({ range: 'nie-ma' })).toBe(false);
    // Zmiana zwróconej listy nie zmienia modelu.
    scopeRanges()[0].label = 'zmienione';
    expect(scopeRanges()[0].label).toBe('z zapisem w ostatnich 3 mies.');
  });

  it('nieznana pozycja to „cała baza”; opis i klucz niosą wybraną pozycję', () => {
    const { scopeRanges, scopeFilters, scopeActive, scopeLabel, scopeKey } = modul();
    expect(scopeFilters({ range: 'recent' }).range).toBeNull();
    expect(scopeFilters({ range: true }).range).toBeNull();
    scopeRanges().forEach((pozycja) => {
      expect(scopeFilters({ range: pozycja.key }).range).toBe(pozycja.key);
      expect(scopeActive(scopeFilters({ range: pozycja.key }))).toBe(true);
      expect(scopeLabel({ range: pozycja.key }, null)).toBe(pozycja.label);
    });
    expect(scopeLabel({ range: 'o12', sex: 'F', band: '10-13' }, { key: 'c:E66', label: 'E66 — Otyłość' }))
      .toBe('bez zapisu od ponad 12 mies. · dziewczęta · 10–13 lat · E66 — Otyłość');
    const klucze = [null].concat(scopeRanges().map((pozycja) => ({ range: pozycja.key }))).map((filtry) => scopeKey(filtry, null));
    expect(new Set(klucze).size).toBe(klucze.length);
  });
});

describe('Ostatni zapis karty (scopeMembers)', () => {
  const wg = (range, extra) => modul().scopeMembers(BAZA, { range }, opcje(extra));

  it('zapis w ostatnich 3, 6 i 12 mies.: granica to ta sama chwila N miesięcy wstecz; zapis dokładnie na granicy jeszcze się liczy', () => {
    expect(wg('m3')).toEqual(['dzis', 'm3-na']);
    expect(wg('m6')).toEqual(['dzis', 'm3-na', 'm3-przed', 'm6-na']);
    expect(wg('m12')).toEqual(['dzis', 'm3-na', 'm3-przed', 'm6-na', 'm6-przed', 'm12-na']);
  });

  it('bez zapisu od ponad 12 i 24 mies.: dopełnienie okna — także pacjent bez daty zapisu albo z datą nie do odczytania', () => {
    expect(wg('o12')).toEqual(['m12-przed', 'm24-na', 'm24-przed', 'bez-daty', 'zla-data']);
    expect(wg('o24')).toEqual(['m24-przed', 'bez-daty', 'zla-data']);
    // „W ostatnich 12 mies.” i „bez zapisu od ponad 12 mies.” dzielą całą bazę bez reszty.
    expect(wg('m12').concat(wg('o12')).sort()).toEqual(WSZYSCY.slice().sort());
    expect(wg('m12').filter((id) => wg('o12').includes(id))).toEqual([]);
    expect(wg('o24').every((id) => wg('o12').includes(id))).toBe(true);
  });

  it('„z zapisem w ostatnich 12 mies.” to ci sami pacjenci, których liczy kafelek (demographics) — także 29 lutego', () => {
    const { scopeMembers, demographics } = modul();
    expect(scopeMembers(BAZA, { range: 'm12' }, opcje())).toHaveLength(demographics(BAZA, opcje()).recent);
    const przestepny = new Date(2028, 1, 29, 13, 0, 0);
    const baza = [osoba('1-marca', chwila(2027, 3, 1, 13, 0)), osoba('28-lutego', chwila(2027, 2, 28, 13, 0)), osoba('1-marca-rano', chwila(2027, 3, 1, 12, 59))];
    const zakres = scopeMembers(baza, { range: 'm12' }, { now: przestepny });
    expect(zakres).toEqual(['1-marca']);
    expect(zakres).toHaveLength(demographics(baza, { now: przestepny }).recent);
  });

  it('koniec miesiąca: gdy w miesiącu docelowym nie ma takiego dnia, granica przesuwa się o brakujące dni (31 maja − 3 mies. = 3 marca)', () => {
    const { scopeMembers } = modul();
    const baza = [osoba('3-marca', chwila(2026, 3, 3, 13, 0)), osoba('2-marca', chwila(2026, 3, 2, 13, 0))];
    expect(scopeMembers(baza, { range: 'm3' }, { now: new Date(2026, 4, 31, 13, 0, 0) })).toEqual(['3-marca']);
  });

  it('łączy się z pozostałymi filtrami spójnikiem „i”; osoba spoza bazy nigdy nie wchodzi', () => {
    const { scopeMembers } = modul();
    const baza = BAZA.concat([osoba('chlopiec-dawno', chwila(2023, 1, 1), 'M'), osoba('chlopiec-teraz', chwila(2026, 6, 1), 'M')]);
    expect(scopeMembers(baza, { range: 'o12', sex: 'M' }, opcje())).toEqual(['chlopiec-dawno']);
    expect(scopeMembers(baza, { range: 'm3', sex: 'M' }, opcje())).toEqual(['chlopiec-teraz']);
    expect(scopeMembers(baza, { range: 'o24', listId: 'l1' }, opcje({ listIds: ['chlopiec-dawno', 'dzis', 'spoza'] }))).toEqual(['chlopiec-dawno']);
    expect(scopeMembers(baza, { range: 'o24' }, opcje())).not.toContain('spoza');
  });
});

describe('Zakresy leczenia (scopeMembers z wynikiem kart)', () => {
  // Wynik liczenia kart jak w widoku: cardsResult na wpisach pamięci kart (gh / ob — wynik ghPatient / obesityPatient).
  const wpis = (gh, ob, read = true) => ({ read, card: {}, gh: gh ? { program: 'SNP' } : null, ob: ob ? { drug: 'Fikcyjny lek' } : null });
  const LUDZIE = [osoba('a', chwila(2026, 6, 1)), osoba('b', chwila(2026, 6, 1), 'M'), osoba('c', chwila(2026, 6, 1), 'M'), osoba('d', chwila(2023, 6, 1)),
    osoba('e', chwila(2026, 6, 1)), osoba('nieodczytana', chwila(2026, 6, 1))];
  const WPISY = { a: wpis(false, false), b: wpis(true, false), c: wpis(true, true), d: wpis(true, false), e: wpis(false, true), nieodczytana: wpis(true, true, false) };

  it('„leczeni hormonem wzrostu” i „leczeni z powodu otyłości” to dokładnie pacjenci, których liczą sekcje leczenia', () => {
    const { scopeMembers, cardsResult } = modul();
    const wynik = cardsResult(LUDZIE, WPISY);
    expect(scopeMembers(LUDZIE, { range: 'gh' }, opcje({ cards: wynik.details }))).toEqual(wynik.treated.map((pozycja) => pozycja.id));
    expect(scopeMembers(LUDZIE, { range: 'ob' }, opcje({ cards: wynik.details }))).toEqual(wynik.obese.map((pozycja) => pozycja.id));
    expect(scopeMembers(LUDZIE, { range: 'gh' }, opcje({ cards: wynik.details }))).toEqual(['b', 'c', 'd']);
    expect(scopeMembers(LUDZIE, { range: 'ob' }, opcje({ cards: wynik.details }))).toEqual(['c', 'e']);
  });

  it('karta, której nie udało się odczytać, nie wchodzi do zakresu leczenia', () => {
    const { scopeMembers, cardsResult } = modul();
    const wynik = cardsResult(LUDZIE, WPISY);
    expect(wynik.failed).toBe(1);
    expect(scopeMembers(LUDZIE, { range: 'gh' }, opcje({ cards: wynik.details }))).not.toContain('nieodczytana');
    expect(scopeMembers(LUDZIE, { range: 'ob' }, opcje({ cards: wynik.details }))).not.toContain('nieodczytana');
  });

  it('bez wyniku liczenia kart to „nie wiadomo” (null), a nie zero pacjentów; pozostałe pozycje wyniku nie potrzebują', () => {
    const { scopeMembers } = modul();
    expect(scopeMembers(LUDZIE, { range: 'gh' }, opcje())).toBeNull();
    expect(scopeMembers(LUDZIE, { range: 'ob', sex: 'M' }, opcje({ cards: null }))).toBeNull();
    expect(scopeMembers(LUDZIE, { range: 'gh' }, opcje({ cards: [] }))).toEqual([]);
    expect(scopeMembers(LUDZIE, { range: 'm12' }, opcje())).toEqual(['a', 'b', 'c', 'e', 'nieodczytana']);
  });

  it('łączy się z płcią, wiekiem, listą i rozpoznaniem; pacjent spoza podanej bazy nie wchodzi', () => {
    const { scopeMembers, cardsResult } = modul();
    const cards = cardsResult(LUDZIE, WPISY).details.concat([{ id: 'nie-ma-w-bazie', gh: { program: 'SNP' }, ob: null }]);
    expect(scopeMembers(LUDZIE, { range: 'gh', sex: 'M' }, opcje({ cards }))).toEqual(['b', 'c']);
    expect(scopeMembers(LUDZIE, { range: 'gh', sex: 'F' }, opcje({ cards }))).toEqual(['d']);
    expect(scopeMembers(LUDZIE, { range: 'ob', band: '10-13' }, opcje({ cards }))).toEqual(['c', 'e']);
    expect(scopeMembers(LUDZIE, { range: 'gh', listId: 'l1' }, opcje({ cards, listIds: ['a', 'c', 'd'] }))).toEqual(['c', 'd']);
    expect(scopeMembers(LUDZIE, { range: 'gh' }, opcje({ cards, ids: ['c', 'e'] }))).toEqual(['c']);
    expect(scopeMembers(LUDZIE, { range: 'gh' }, opcje({ cards }))).not.toContain('nie-ma-w-bazie');
  });
});
