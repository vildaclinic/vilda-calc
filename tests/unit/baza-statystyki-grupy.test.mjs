import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-BAZA-GRUPY (makieta statystyk; decyzja właściciela 2026-11-24: „praca nad grupami pacjentów z makiety”):
// zakres statystyk z filtrów — pole „Zakres”, lista pacjentów, płeć, przedział wieku — razem z rozpoznaniem
// wybranym w sekcji „Rozpoznania”. Model ładowany z PLIKU PRODUKCYJNEGO (vilda_patients_list.js); wszystkie
// osoby są fikcyjne. Pozycje pola „Zakres” (P-BAZA-ZAKRES) mają własny plik: baza-statystyki-zakres.test.mjs.
function modul() {
  const win = {};
  loadBrowserScript('vilda_patients_list.js', win);
  return win.VildaPatientsList;
}
const DZIS = new Date(2026, 5, 17, 13, 0, 0); // 17.06.2026, doba lokalna
const osoba = (id, dobISO, sex, zapis = '2026-06-01T10:00:00.000Z', extra = {}) =>
  ({ patientId: id, lastSavedAtISO: zapis, header: { name: 'Fikcyjna Osoba ' + id, dobISO, sex }, ...extra });
// a  dziewczynka 1 r. 6 mies.            b  chłopiec 5 lat (urodziny dziś)   c  chłopiec 8 l. 5 mies.
// d  dziewczynka 12 l. 2 mies. (K)       e  chłopiec 15 l. 9 mies., ostatni zapis dwa lata temu
// f  kobieta 21 l. 1 mies.               g  chłopiec bez daty urodzenia       h  dziecko bez płci, 9 l. 11 mies. (urodziny jutro)
const BAZA = [
  osoba('a', '2024-12-01', 'F'), osoba('b', '2021-06-17', 'M'), osoba('c', '2018-01-10', 'M'),
  osoba('d', '2014-03-20', 'K'), osoba('e', '2010-09-01', 'M', '2024-05-01T10:00:00.000Z'), osoba('f', '2005-05-05', 'F'),
  osoba('g', '', 'M'), osoba('h', '2016-06-18', ''),
  { patientId: 'spoza', __ext: true, lastSavedAtISO: '2026-06-01T10:00:00.000Z', header: { name: 'Fikcyjna Spoza', birthYear: 2016, sex: 'F' } },
];
const opcje = (extra = {}) => ({ now: DZIS, ...extra });

describe('Filtry zakresu (scopeFilters, scopeActive, scopeKey, scopeLabel)', () => {
  it('przyjmuje tylko znane wartości; reszta to „bez filtra”', () => {
    const { scopeFilters, scopeActive } = modul();
    expect(scopeFilters(null)).toEqual({ range: null, listId: null, listName: '', sex: null, band: null });
    expect(scopeFilters({ range: 'zawsze', listId: 7, sex: 'K', band: '5-7', listName: 3 })).toEqual({ range: null, listId: null, listName: '', sex: null, band: null });
    expect(scopeFilters({ range: 'm12', listId: 'l1', listName: 'Fikcyjna lista', sex: 'F', band: '6-9' }))
      .toEqual({ range: 'm12', listId: 'l1', listName: 'Fikcyjna lista', sex: 'F', band: '6-9' });
    expect(scopeActive(scopeFilters(null))).toBe(false);
    for (const jeden of [{ range: 'm12' }, { listId: 'l1' }, { sex: 'M' }, { band: '18+' }]) expect(scopeActive(scopeFilters(jeden))).toBe(true);
  });

  it('opis w kolejności filtrów na ekranie, rozpoznanie na końcu; klucz rozróżnia każdy filtr i rozpoznanie', () => {
    const { scopeLabel, scopeKey } = modul();
    const wszystko = { range: 'm12', listId: 'l1', listName: 'Fikcyjna lista kontrolna', sex: 'F', band: '10-13' };
    const rozpoznanie = { key: 'c:E66', label: 'E66 — Otyłość' };
    expect(scopeLabel(wszystko, rozpoznanie)).toBe('z zapisem w ostatnich 12 mies. · lista „Fikcyjna lista kontrolna” · dziewczęta · 10–13 lat · E66 — Otyłość');
    expect(scopeLabel({ sex: 'M' }, null)).toBe('chłopcy');
    expect(scopeLabel(null, rozpoznanie)).toBe('E66 — Otyłość');
    expect(scopeLabel({ listId: 'l2' }, null)).toBe('lista „bez nazwy”');
    expect(scopeLabel(null, null)).toBe('');
    const klucze = [null, { range: 'm12' }, { listId: 'l1' }, { listId: 'l2' }, { sex: 'M' }, { sex: 'F' }, { band: '0-2' }, { band: '3-5' }, wszystko]
      .flatMap((filtry) => [scopeKey(filtry, null), scopeKey(filtry, rozpoznanie), scopeKey(filtry, { key: 'c:Q96' })]);
    expect(new Set(klucze).size).toBe(klucze.length);
    expect(scopeKey(null, null)).toBe('');
  });
});

describe('Pacjenci w zakresie (scopeMembers)', () => {
  it('bez filtrów: wszyscy pacjenci z bazy, osoba spoza bazy nigdy', () => {
    const { scopeMembers } = modul();
    expect(scopeMembers(BAZA, null, opcje())).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(scopeMembers(BAZA, { sex: 'F' }, opcje())).not.toContain('spoza');
    expect(scopeMembers(null, null, opcje())).toEqual([]);
  });

  it('płeć: K liczy się jak F; pacjent bez płci nie należy do żadnej', () => {
    const { scopeMembers } = modul();
    expect(scopeMembers(BAZA, { sex: 'M' }, opcje())).toEqual(['b', 'c', 'e', 'g']);
    expect(scopeMembers(BAZA, { sex: 'F' }, opcje())).toEqual(['a', 'd', 'f']);
  });

  it('wiek na dziś z pełnej daty urodzenia: urodziny dziś już w starszym przedziale, urodziny jutro jeszcze w młodszym, bez daty — poza wiekiem', () => {
    const { scopeMembers } = modul();
    const wg = (band) => scopeMembers(BAZA, { band }, opcje());
    expect(wg('0-2')).toEqual(['a']);
    expect(wg('3-5')).toEqual(['b']);
    expect(wg('6-9')).toEqual(['c', 'h']);
    expect(wg('10-13')).toEqual(['d']);
    expect(wg('14-17')).toEqual(['e']);
    expect(wg('18+')).toEqual(['f']);
    expect(['0-2', '3-5', '6-9', '10-13', '14-17', '18+'].flatMap(wg)).not.toContain('g');
  });

  it('zapis w ostatnich 12 miesiącach: starszy zapis i brak zapisu wypadają', () => {
    const { scopeMembers } = modul();
    const baza = BAZA.concat([osoba('i', '2015-01-01', 'F', ''), osoba('j', '2015-01-01', 'F', '2025-06-17T12:00:00.000Z'), osoba('k', '2015-01-01', 'F', 'nie-data')]);
    expect(scopeMembers(baza, { range: 'm12' }, opcje())).toEqual(['a', 'b', 'c', 'd', 'f', 'g', 'h', 'j']);
  });

  it('te same reguły co demographics: przedziały, płeć i „z zapisem w ostatnich 12 mies.” dają tych samych pacjentów', () => {
    const { scopeMembers, demographics } = modul();
    const model = demographics(BAZA, opcje());
    model.bands.forEach((przedzial) => expect(scopeMembers(BAZA, { band: przedzial.key }, opcje()), przedzial.label).toEqual(przedzial.ids));
    expect(scopeMembers(BAZA, { sex: 'M' }, opcje())).toEqual(model.sexIds.M);
    expect(scopeMembers(BAZA, { sex: 'F' }, opcje())).toEqual(model.sexIds.F);
    expect(scopeMembers(BAZA, { range: 'm12' }, opcje())).toHaveLength(model.recent);
    // Statystyki zawężone filtrem liczą dokładnie tych pacjentów.
    const chlopcy = new Set(scopeMembers(BAZA, { sex: 'M' }, opcje()));
    expect(demographics(BAZA.filter((p) => chlopcy.has(p.patientId)), opcje())).toMatchObject({ total: 4, sex: { M: 4, F: 0, unknown: 0 } });
  });

  it('lista pacjentów: członkowie jako tablica albo Set; członek spoza bazy i nieznany identyfikator nie wchodzą', () => {
    const { scopeMembers } = modul();
    const filtr = { listId: 'l1', listName: 'Fikcyjna lista' };
    expect(scopeMembers(BAZA, filtr, opcje({ listIds: ['f', 'c', 'spoza', 'nie-ma'] }))).toEqual(['c', 'f']);
    expect(scopeMembers(BAZA, filtr, opcje({ listIds: new Set(['a']) }))).toEqual(['a']);
    expect(scopeMembers(BAZA, filtr, opcje({ listIds: [] }))).toEqual([]);
  });

  it('wybrana lista bez wczytanych członków to „nie wiadomo” (null), a nie zero pacjentów', () => {
    const { scopeMembers } = modul();
    expect(scopeMembers(BAZA, { listId: 'l1' }, opcje())).toBeNull();
    expect(scopeMembers(BAZA, { listId: 'l1', sex: 'M' }, opcje({ listIds: null }))).toBeNull();
    // Bez filtra listy członkowie nie są potrzebni.
    expect(scopeMembers(BAZA, { sex: 'M' }, opcje({ listIds: null }))).toEqual(['b', 'c', 'e', 'g']);
  });

  it('filtry łączą się spójnikiem „i” — także z grupą rozpoznania', () => {
    const { scopeMembers } = modul();
    expect(scopeMembers(BAZA, { sex: 'M', band: '6-9' }, opcje())).toEqual(['c']);
    expect(scopeMembers(BAZA, { sex: 'M', range: 'm12' }, opcje())).toEqual(['b', 'c', 'g']);
    expect(scopeMembers(BAZA, { listId: 'l1', sex: 'F' }, opcje({ listIds: ['c', 'd', 'e', 'f'] }))).toEqual(['d', 'f']);
    expect(scopeMembers(BAZA, { listId: 'l1', sex: 'F', band: '18+' }, opcje({ listIds: ['c', 'd', 'e', 'f'], ids: ['d', 'e', 'f'] }))).toEqual(['f']);
    expect(scopeMembers(BAZA, null, opcje({ ids: ['e', 'a', 'nie-ma'] }))).toEqual(['a', 'e']);
    expect(scopeMembers(BAZA, { sex: 'F', band: '14-17' }, opcje())).toEqual([]);
  });

  it('wiek liczy funkcja podana przez widok (ta sama, której używa sejf), gdy ją dostanie', () => {
    const { scopeMembers } = modul();
    const wiek = (dobISO) => dobISO === '2024-12-01' ? 240 : null; // sejf mówi: 20 lat; reszta bez wieku
    expect(scopeMembers(BAZA, { band: '18+' }, { ageMonths: wiek })).toEqual(['a']);
    expect(scopeMembers(BAZA, { band: '0-2' }, { ageMonths: wiek })).toEqual([]);
  });
});

describe('Raport grupy z filtrów (statsReport)', () => {
  it('nagłówek i nazwa pliku mówią, że to grupa; liczby dotyczą pacjentów zakresu', () => {
    const { scopeMembers, scopeLabel, demographics, statsReport, statsWorkbook, reportFileName } = modul();
    const filtry = { sex: 'M', band: '6-9' };
    const ids = new Set(scopeMembers(BAZA, filtry, opcje()));
    const grupa = BAZA.filter((p) => ids.has(p.patientId));
    const raport = statsReport({ model: demographics(grupa, opcje()), cards: null, patients: grupa, stamp: DZIS, scope: scopeLabel(filtry, null) });
    const pacjenci = raport.sections.find((sekcja) => sekcja.key === 'patients');
    expect(pacjenci.facts[0]).toMatchObject({ label: 'Pacjenci w grupie', value: 1 });
    const podsumowanie = statsWorkbook(raport)[0].rows.map((wiersz) => wiersz.cells);
    expect(podsumowanie.slice(0, 4)).toEqual([['Statystyki Bazy pacjentów'], ['Stan na', expect.any(String)], ['Grupa pacjentów', 'chłopcy · 6–9 lat'], ['Pacjentów w grupie', 1]]);
    expect(reportFileName(DZIS, 'xlsx', true)).toBe('statystyki-bazy-pacjentow-grupa-2026-06-17.xlsx');
  });
});
