import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-BAZA-ZAKRES (decyzja właściciela 2026-11-24: „popracuj nad selektorem Zakres bo tam jest mały wybór”):
// pozycje pola „Zakres” w Statystykach Bazy — okna ostatniego zapisu karty (3, 6, 12 mies. i ich dopełnienia:
// bez zapisu od ponad 12 albo 24 mies.) — oraz pola „Leczenie” (hormon wzrostu, otyłość) z wyniku liczenia kart.
// Pole „Leczenie” jest osobne od „Zakresu” (P-BAZA-SEKCJE, decyzja właściciela 2026-11-24: „wydziel to pole
// Leczenie”), więc oba łączą się spójnikiem „i”.
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

describe('Pozycje pól „Zakres” i „Leczenie” (scopeRanges, scopeTreatments, scopeFilters, scopeLabel, scopeKey)', () => {
  it('„Zakres” ma pięć okien ostatniego zapisu, „Leczenie” dwie pozycje; tylko „Leczenie” potrzebuje wyniku kart', () => {
    const { scopeRanges, scopeTreatments, scopeNeedsCards } = modul();
    expect(scopeRanges()).toEqual([
      { key: 'm3', label: 'z zapisem w ostatnich 3 mies.' },
      { key: 'm6', label: 'z zapisem w ostatnich 6 mies.' },
      { key: 'm12', label: 'z zapisem w ostatnich 12 mies.' },
      { key: 'o12', label: 'bez zapisu od ponad 12 mies.' },
      { key: 'o24', label: 'bez zapisu od ponad 24 mies.' },
    ]);
    expect(scopeTreatments()).toEqual([
      { key: 'gh', label: 'leczeni hormonem wzrostu', option: 'hormon wzrostu' },
      { key: 'ob', label: 'leczeni z powodu otyłości', option: 'otyłość' },
    ]);
    scopeRanges().forEach((pozycja) => expect(scopeNeedsCards({ range: pozycja.key }), pozycja.key).toBe(false));
    scopeTreatments().forEach((pozycja) => expect(scopeNeedsCards({ treatment: pozycja.key }), pozycja.key).toBe(true));
    expect(scopeNeedsCards({ range: 'o12', treatment: 'gh' })).toBe(true);
    expect(scopeNeedsCards(null)).toBe(false);
    expect(scopeNeedsCards({ treatment: 'nie-ma' })).toBe(false);
    // Zmiana zwróconej listy nie zmienia modelu.
    scopeRanges()[0].label = 'zmienione';
    expect(scopeRanges()[0].label).toBe('z zapisem w ostatnich 3 mies.');
  });

  it('nieznana pozycja to „bez filtra”; leczenie nie jest pozycją „Zakresu”; opis i klucz niosą oba pola', () => {
    const { scopeRanges, scopeTreatments, scopeFilters, scopeActive, scopeLabel, scopeKey } = modul();
    expect(scopeFilters({ range: 'recent' }).range).toBeNull();
    expect(scopeFilters({ range: true }).range).toBeNull();
    expect(scopeFilters({ treatment: 'gh' }).range).toBeNull();
    expect(scopeFilters({ treatment: 'm12' }).treatment).toBeNull();
    scopeRanges().forEach((pozycja) => {
      expect(scopeFilters({ range: pozycja.key }).range).toBe(pozycja.key);
      expect(scopeActive(scopeFilters({ range: pozycja.key }))).toBe(true);
      expect(scopeLabel({ range: pozycja.key }, null)).toBe(pozycja.label);
    });
    scopeTreatments().forEach((pozycja) => {
      expect(scopeFilters({ treatment: pozycja.key }).treatment).toBe(pozycja.key);
      expect(scopeActive(scopeFilters({ treatment: pozycja.key }))).toBe(true);
      expect(scopeLabel({ treatment: pozycja.key }, null)).toBe(pozycja.label);
    });
    // Kolejność pól na ekranie: Zakres, Leczenie, Lista pacjentów, Płeć, Wiek; rozpoznanie na końcu.
    expect(scopeLabel({ range: 'o12', treatment: 'gh', listId: 'l1', listName: 'Fikcyjna lista', sex: 'F', band: '10-13' }, { key: 'c:E66', label: 'E66 — Otyłość' }))
      .toBe('bez zapisu od ponad 12 mies. · leczeni hormonem wzrostu · lista „Fikcyjna lista” · dziewczęta · 10–13 lat · E66 — Otyłość');
    const wybory = [null].concat(scopeRanges().map((pozycja) => ({ range: pozycja.key })), scopeTreatments().map((pozycja) => ({ treatment: pozycja.key })),
      [{ range: 'o12', treatment: 'gh' }, { range: 'o12', treatment: 'ob' }, { range: 'm3', treatment: 'gh' }]);
    const klucze = wybory.map((filtry) => scopeKey(filtry, null));
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

describe('Pole „Leczenie” (scopeMembers z wynikiem kart)', () => {
  // Wynik liczenia kart jak w widoku: cardsResult na wpisach pamięci kart (gh / ob — wynik ghPatient / obesityPatient).
  const wpis = (gh, ob, read = true) => ({ read, card: {}, gh: gh ? { program: 'SNP' } : null, ob: ob ? { drug: 'Fikcyjny lek' } : null });
  const LUDZIE = [osoba('a', chwila(2026, 6, 1)), osoba('b', chwila(2026, 6, 1), 'M'), osoba('c', chwila(2026, 6, 1), 'M'), osoba('d', chwila(2023, 6, 1)),
    osoba('e', chwila(2026, 6, 1)), osoba('nieodczytana', chwila(2026, 6, 1))];
  const WPISY = { a: wpis(false, false), b: wpis(true, false), c: wpis(true, true), d: wpis(true, false), e: wpis(false, true), nieodczytana: wpis(true, true, false) };

  it('„leczeni hormonem wzrostu” i „leczeni z powodu otyłości” to dokładnie pacjenci, których liczą sekcje leczenia', () => {
    const { scopeMembers, cardsResult } = modul();
    const wynik = cardsResult(LUDZIE, WPISY);
    expect(scopeMembers(LUDZIE, { treatment: 'gh' }, opcje({ cards: wynik.details }))).toEqual(wynik.treated.map((pozycja) => pozycja.id));
    expect(scopeMembers(LUDZIE, { treatment: 'ob' }, opcje({ cards: wynik.details }))).toEqual(wynik.obese.map((pozycja) => pozycja.id));
    expect(scopeMembers(LUDZIE, { treatment: 'gh' }, opcje({ cards: wynik.details }))).toEqual(['b', 'c', 'd']);
    expect(scopeMembers(LUDZIE, { treatment: 'ob' }, opcje({ cards: wynik.details }))).toEqual(['c', 'e']);
  });

  it('karta, której nie udało się odczytać, nie wchodzi do zakresu leczenia', () => {
    const { scopeMembers, cardsResult } = modul();
    const wynik = cardsResult(LUDZIE, WPISY);
    expect(wynik.failed).toBe(1);
    expect(scopeMembers(LUDZIE, { treatment: 'gh' }, opcje({ cards: wynik.details }))).not.toContain('nieodczytana');
    expect(scopeMembers(LUDZIE, { treatment: 'ob' }, opcje({ cards: wynik.details }))).not.toContain('nieodczytana');
  });

  it('bez wyniku liczenia kart to „nie wiadomo” (null), a nie zero pacjentów; pozostałe pozycje wyniku nie potrzebują', () => {
    const { scopeMembers } = modul();
    expect(scopeMembers(LUDZIE, { treatment: 'gh' }, opcje())).toBeNull();
    expect(scopeMembers(LUDZIE, { treatment: 'ob', sex: 'M' }, opcje({ cards: null }))).toBeNull();
    expect(scopeMembers(LUDZIE, { treatment: 'gh' }, opcje({ cards: [] }))).toEqual([]);
    expect(scopeMembers(LUDZIE, { range: 'm12' }, opcje())).toEqual(['a', 'b', 'c', 'e', 'nieodczytana']);
  });

  it('łączy się z płcią, wiekiem, listą i rozpoznaniem; pacjent spoza podanej bazy nie wchodzi', () => {
    const { scopeMembers, cardsResult } = modul();
    const cards = cardsResult(LUDZIE, WPISY).details.concat([{ id: 'nie-ma-w-bazie', gh: { program: 'SNP' }, ob: null }]);
    expect(scopeMembers(LUDZIE, { treatment: 'gh', sex: 'M' }, opcje({ cards }))).toEqual(['b', 'c']);
    expect(scopeMembers(LUDZIE, { treatment: 'gh', sex: 'F' }, opcje({ cards }))).toEqual(['d']);
    expect(scopeMembers(LUDZIE, { treatment: 'ob', band: '10-13' }, opcje({ cards }))).toEqual(['c', 'e']);
    expect(scopeMembers(LUDZIE, { treatment: 'gh', listId: 'l1' }, opcje({ cards, listIds: ['a', 'c', 'd'] }))).toEqual(['c', 'd']);
    expect(scopeMembers(LUDZIE, { treatment: 'gh' }, opcje({ cards, ids: ['c', 'e'] }))).toEqual(['c']);
    expect(scopeMembers(LUDZIE, { treatment: 'gh' }, opcje({ cards }))).not.toContain('nie-ma-w-bazie');
  });

  it('„Zakres” i „Leczenie” naraz: leczeni bez zapisu od ponad 12 mies. — i leczeni z zapisem w ostatnich 12 mies.', () => {
    const { scopeMembers, cardsResult } = modul();
    const cards = cardsResult(LUDZIE, WPISY).details;
    // d: leczona GH, ostatni zapis 1.06.2023; b i c: leczeni GH, zapis 1.06.2026.
    expect(scopeMembers(LUDZIE, { range: 'o12', treatment: 'gh' }, opcje({ cards }))).toEqual(['d']);
    expect(scopeMembers(LUDZIE, { range: 'o24', treatment: 'gh' }, opcje({ cards }))).toEqual(['d']);
    expect(scopeMembers(LUDZIE, { range: 'm12', treatment: 'gh' }, opcje({ cards }))).toEqual(['b', 'c']);
    expect(scopeMembers(LUDZIE, { range: 'o12', treatment: 'ob' }, opcje({ cards }))).toEqual([]);
    expect(scopeMembers(LUDZIE, { range: 'm3', treatment: 'ob', sex: 'M' }, opcje({ cards }))).toEqual(['c']);
    // Oba pola razem nadal czekają na wynik kart.
    expect(scopeMembers(LUDZIE, { range: 'o12', treatment: 'gh' }, opcje())).toBeNull();
  });
});
