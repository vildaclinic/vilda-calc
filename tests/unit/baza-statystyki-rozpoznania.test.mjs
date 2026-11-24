import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-ROZPOZNANIA, rata 2 (decyzja właściciela 2026-11-24): statystyki Bazy według rozpoznania.
// Model z PLIKU PRODUKCYJNEGO (vilda_patients_list.js); rozpoznania dekoduje PRAWDZIWY model zapisu leczenia
// (runtime/patient-treatment-v1/model.js — ten sam, który jest wbudowany w sejf), a nazwy kategorii daje
// PRAWDZIWY katalog ICD-10 PL przez produkcyjną wyszukiwarkę. Wszystkie osoby i rozpoznania są fikcyjne.

function srodowisko() {
  const win = {};
  loadBrowserScript('runtime/patient-treatment-v1/model.js', win);
  loadBrowserScript('vilda_icd10_pl_data.js', win);
  loadBrowserScript('vilda_icd10_search.js', win);
  loadBrowserScript('vilda_patients_list.js', win);
  const katalog = win.VildaICD10Search.create(win.VildaICD10PLData);
  return { ...win.VildaPatientsList, decode: win.VildaPatientTreatmentModel.decode, lookup: katalog.lookup };
}
let licznik = 0;
const notatka = (patientId, name, code, status = 'active', dateISO = '2026-03-01') => {
  licznik += 1;
  return { id: 'tmt-fikcyjne-' + licznik, patientId, category: 'treatment', title: 'Rozpoznanie · ' + name, body: '', rev: 1,
    updatedAtISO: '2026-11-24T10:00:0' + (licznik % 10) + '.000Z',
    treatmentContext: { schemaVersion: 1, kind: 'diagnosis', name, code, codingSystem: 'ICD-10', status, dateISO } };
};
const pacjenci = (...ids) => ids.map((patientId) => ({ patientId, header: { name: 'Fikcyjny ' + patientId } }));
const wiersz = (grupa) => [grupa.label, grupa.n, grupa.closed];

describe('diagnosisIndex — rozpoznania pacjentów z notatek kategorii „treatment”', () => {
  it('bierze tylko rozpoznania: pomija epizody leczenia, zwykłe notatki i zapis w nieobsługiwanej wersji', () => {
    const { diagnosisIndex, decode } = srodowisko();
    const epizod = { id: 'tmt-epizod', patientId: 'a', updatedAtISO: '2026-11-24T10:00:00.000Z',
      treatmentContext: { schemaVersion: 1, kind: 'therapy', title: 'Fikcyjne leczenie', method: 'other', status: 'active' } };
    const zwykla = { id: 'n-1', patientId: 'a', category: 'treatment', title: 'Fikcyjna notatka o leczeniu', body: 'bez kontekstu' };
    const nowsza = { id: 'tmt-v2', patientId: 'a', treatmentContext: { schemaVersion: 2, kind: 'diagnosis', name: 'Z przyszłej wersji' } };
    const index = diagnosisIndex([notatka('a', 'Otyłość spowodowana nadmierną podażą energii', 'E66.0'), epizod, zwykla, nowsza,
      notatka('b', 'Fikcyjne rozpoznanie bez kodu', '', 'closed'), null, { id: 'bez-pacjenta', treatmentContext: {} }], decode);
    expect(index.of('a')).toEqual([{ id: expect.stringMatching(/^tmt-fikcyjne-/), name: 'Otyłość spowodowana nadmierną podażą energii', code: 'E66.0',
      active: true, dateISO: '2026-03-01', stamp: expect.any(String) }]);
    expect(index.of('b').map((d) => [d.name, d.code, d.active])).toEqual([['Fikcyjne rozpoznanie bez kodu', '', false]]);
    expect(index.of('nikt')).toEqual([]);
  });

  it('znacznik zmienia się po dodaniu, poprawce i usunięciu rozpoznania, a nie zależy od kolejności notatek', () => {
    const { diagnosisIndex, decode } = srodowisko();
    const a = notatka('a', 'Otyłość, nieokreślona', 'E66.9'), b = notatka('b', 'Niedoczynność przysadki', 'E23.0');
    const bazowy = diagnosisIndex([a, b], decode).mark;
    expect(diagnosisIndex([b, a], decode).mark).toBe(bazowy);
    expect(diagnosisIndex([a], decode).mark).not.toBe(bazowy);
    expect(diagnosisIndex([a, b, notatka('a', 'Fikcyjne dodatkowe', '')], decode).mark).not.toBe(bazowy);
    expect(diagnosisIndex([a, { ...b, updatedAtISO: '2026-11-25T08:00:00.000Z' }], decode).mark).not.toBe(bazowy);
    expect(diagnosisIndex([], decode).mark).toBe('');
  });
});

describe('diagnosisCohort — grupy według kodu ICD-10 i nazwy', () => {
  it('kody o tych samych trzech znakach tworzą kategorię z podkodami; nazwę kategorii daje katalog', () => {
    const { diagnosisIndex, diagnosisCohort, decode, lookup } = srodowisko();
    const index = diagnosisIndex([
      notatka('a', 'Otyłość spowodowana nadmierną podażą energii', 'E66.0'),
      notatka('b', 'Otyłość spowodowana nadmierną podażą energii', 'E66.0'),
      notatka('c', 'Otyłość, nieokreślona', 'E66.9'),
      notatka('d', 'Niedoczynność przysadki', 'E23.0'),
    ], decode);
    const kohorta = diagnosisCohort(pacjenci('a', 'b', 'c', 'd', 'e'), index, { lookup });
    expect(kohorta.total).toBe(5);
    expect(kohorta.withActive).toBe(4);
    expect(kohorta.none).toEqual({ n: 1, ids: ['e'] });
    expect(kohorta.onlyClosed).toEqual({ n: 0, ids: [] });
    expect(kohorta.records).toEqual({ active: 4, closed: 0 });
    expect(kohorta.groups.map(wiersz)).toEqual([['E66 — Otyłość', 3, 0], ['E23.0 — Niedoczynność przysadki', 1, 0]]);
    const otylosc = kohorta.groups[0];
    expect(otylosc.code).toBe('E66');
    expect(otylosc.ids.slice().sort()).toEqual(['a', 'b', 'c']);
    expect(otylosc.items.map(wiersz)).toEqual([['E66.0 — Otyłość spowodowana nadmierną podażą energii', 2, 0], ['E66.9 — Otyłość, nieokreślona', 1, 0]]);
    // Jeden kod w kategorii — bez sztucznego wiersza kategorii.
    expect(kohorta.groups[1].items).toEqual([]);
    expect(kohorta.groups[1].code).toBe('E23.0');
  });

  it('różne zapisy tego samego kodu („e660”, „E66.0”, „E66.0†”) to jedna grupa; etykietą jest najczęstszy zapis i nazwa z katalogu', () => {
    const { diagnosisIndex, diagnosisCohort, decode, lookup } = srodowisko();
    const index = diagnosisIndex([
      notatka('a', 'Fikcyjna własna nazwa lekarza', 'e660'),
      notatka('b', 'Otyłość spowodowana nadmierną podażą energii', 'E66.0'),
      notatka('c', 'Otyłość spowodowana nadmierną podażą energii', 'E66.0'),
      notatka('d', 'Otyłość spowodowana nadmierną podażą energii', 'E66.0†'),
    ], decode);
    const kohorta = diagnosisCohort(pacjenci('a', 'b', 'c', 'd'), index, { lookup });
    expect(kohorta.groups.map(wiersz)).toEqual([['E66.0 — Otyłość spowodowana nadmierną podażą energii', 4, 0]]);
  });

  it('bez katalogu etykietą jest najczęstsza nazwa wpisana przez lekarzy, a kategoria bez własnego kodu zostaje samym kodem', () => {
    const { diagnosisIndex, diagnosisCohort, decode } = srodowisko();
    const index = diagnosisIndex([
      notatka('a', 'Fikcyjna otyłość prosta', 'E66.0'), notatka('b', 'Fikcyjna otyłość prosta', 'E66.0'), notatka('c', 'Fikcyjna inna nazwa', 'E66.0'),
      notatka('d', 'Fikcyjna otyłość nieokreślona', 'E66.9'),
      notatka('e', 'Fikcyjna otyłość ogólnie', 'E66'), notatka('e', 'Fikcyjna niskorosłość', 'E34.3'), notatka('f', 'Fikcyjna niskorosłość', 'E34.3'),
    ], decode);
    const bezKatalogu = diagnosisCohort(pacjenci('a', 'b', 'c', 'd', 'e', 'f'), index);
    // Kategoria E66 ma rozpoznanie z samym kodem kategorii — jego nazwa jest nazwą kategorii.
    expect(bezKatalogu.groups.map(wiersz)).toEqual([['E66 — Fikcyjna otyłość ogólnie', 5, 0], ['E34.3 — Fikcyjna niskorosłość', 2, 0]]);
    expect(bezKatalogu.groups[0].items.map(wiersz)).toEqual([
      ['E66.0 — Fikcyjna otyłość prosta', 3, 0], ['E66 — Fikcyjna otyłość ogólnie', 1, 0], ['E66.9 — Fikcyjna otyłość nieokreślona', 1, 0]]);
    const bezNazwy = diagnosisCohort(pacjenci('a', 'd'), index);
    expect(bezNazwy.groups.map(wiersz)).toEqual([['E66', 2, 0]]);
  });

  it('rozpoznanie bez kodu grupuje się po nazwie bez wielkości liter, polskich znaków i zbędnych spacji; kod spoza ICD-10 zostaje sobą', () => {
    const { diagnosisIndex, diagnosisCohort, decode, lookup } = srodowisko();
    const index = diagnosisIndex([
      notatka('a', 'Fikcyjna niskorosłość idiopatyczna', ''), notatka('b', 'fikcyjna  niskoroslosc IDIOPATYCZNA', ''),
      notatka('c', 'Fikcyjna niskorosłość idiopatyczna', ''), notatka('d', 'Fikcyjne rozpoznanie własne', 'WŁASNY-1'),
    ], decode);
    const kohorta = diagnosisCohort(pacjenci('a', 'b', 'c', 'd'), index, { lookup });
    expect(kohorta.groups.map(wiersz)).toEqual([['Fikcyjna niskorosłość idiopatyczna', 3, 0], ['WŁASNY-1 — Fikcyjne rozpoznanie własne', 1, 0]]);
    expect(kohorta.groups[0].code).toBe('');
    expect(kohorta.groups[1].items).toEqual([]);
  });

  it('pacjent liczy się w grupie raz i jest w każdej swojej grupie; aktywne wygrywa z zamkniętym; „tylko zamknięte” i „bez rozpoznania” osobno', () => {
    const { diagnosisIndex, diagnosisCohort, decode, lookup } = srodowisko();
    const index = diagnosisIndex([
      // a: dwa rozpoznania w tej samej kategorii (jedno zamknięte) i jedno w innej
      notatka('a', 'Otyłość spowodowana nadmierną podażą energii', 'E66.0'), notatka('a', 'Otyłość, nieokreślona', 'E66.9', 'closed'),
      notatka('a', 'Niedoczynność przysadki', 'E23.0'),
      // b: w kategorii E66 wyłącznie zamknięte
      notatka('b', 'Otyłość, nieokreślona', 'E66.9', 'closed'),
      // c: jedno aktywne
      notatka('c', 'Otyłość, nieokreślona', 'E66.9'),
    ], decode);
    const kohorta = diagnosisCohort(pacjenci('a', 'b', 'c', 'd'), index, { lookup });
    expect(kohorta.withActive).toBe(2);
    expect(kohorta.activeIds.slice().sort()).toEqual(['a', 'c']);
    expect(kohorta.onlyClosed).toEqual({ n: 1, ids: ['b'] });
    expect(kohorta.none).toEqual({ n: 1, ids: ['d'] });
    expect(kohorta.records).toEqual({ active: 3, closed: 2 });
    const [otylosc, przysadka] = kohorta.groups;
    expect(wiersz(otylosc)).toEqual(['E66 — Otyłość', 2, 1]);
    expect(otylosc.ids.slice().sort()).toEqual(['a', 'c']);
    expect(otylosc.closedIds).toEqual(['b']);
    expect(otylosc.allIds.slice().sort()).toEqual(['a', 'b', 'c']);
    // Podkod E66.9: aktywne u „c”, wyłącznie zamknięte u „a” i „b”; E66.0: aktywne u „a”.
    expect(otylosc.items.map(wiersz)).toEqual([['E66.9 — Otyłość, nieokreślona', 1, 2], ['E66.0 — Otyłość spowodowana nadmierną podażą energii', 1, 0]]);
    expect(wiersz(przysadka)).toEqual(['E23.0 — Niedoczynność przysadki', 1, 0]);
    // Suma grup (3) przekracza liczbę pacjentów z rozpoznaniem (2) — pacjent „a” jest w dwóch grupach.
    expect(otylosc.n + przysadka.n).toBeGreaterThan(kohorta.withActive);
  });

  it('kolejność: najwięcej aktywnych, potem najwięcej zamkniętych, potem alfabet; liczy tylko pacjentów z przekazanej bazy', () => {
    const { diagnosisIndex, diagnosisCohort, decode, lookup } = srodowisko();
    const index = diagnosisIndex([
      notatka('a', 'Niedoczynność przysadki', 'E23.0'), notatka('b', 'Otyłość polekowa', 'E66.1'),
      notatka('c', 'Fikcyjne B', ''), notatka('d', 'Fikcyjne A', ''), notatka('e', 'Fikcyjne A', '', 'closed'),
      notatka('spoza', 'Otyłość polekowa', 'E66.1'),
    ], decode);
    const kohorta = diagnosisCohort(pacjenci('a', 'b', 'c', 'd', 'e'), index, { lookup });
    expect(kohorta.groups.map(wiersz)).toEqual([['Fikcyjne A', 1, 1], ['E23.0 — Niedoczynność przysadki', 1, 0], ['E66.1 — Otyłość polekowa', 1, 0], ['Fikcyjne B', 1, 0]]);
    // Zawężenie do grupy pacjentów (statystyki grupy) liczy tę samą funkcją na mniejszej bazie.
    const grupa = diagnosisCohort(pacjenci('d', 'e'), index, { lookup });
    expect(grupa.total).toBe(2);
    expect(grupa.groups.map(wiersz)).toEqual([['Fikcyjne A', 1, 1]]);
    expect(diagnosisCohort([], index, { lookup })).toMatchObject({ total: 0, withActive: 0, groups: [] });
    expect(diagnosisCohort(pacjenci('a'), null)).toMatchObject({ total: 1, withActive: 0, none: { n: 1, ids: ['a'] }, groups: [] });
  });

  it('błąd katalogu nie psuje liczenia — etykieta wraca do nazwy z rozpoznania', () => {
    const { diagnosisIndex, diagnosisCohort, decode } = srodowisko();
    const index = diagnosisIndex([notatka('a', 'Fikcyjna nazwa własna', 'E66.0')], decode);
    const kohorta = diagnosisCohort(pacjenci('a'), index, { lookup: () => { throw new Error('katalog niedostępny'); } });
    expect(kohorta.groups.map(wiersz)).toEqual([['E66.0 — Fikcyjna nazwa własna', 1, 0]]);
  });
});

describe('raport i arkusz — rozpoznania i statystyki grupy', () => {
  // Trzy fikcyjne osoby: a (K, 12 l.) E66.0 i Q96; b (M, 15 l.) E66.9 oraz zamknięte E23.0; c (K, 21 l.) bez rozpoznania.
  function dane() {
    const s = srodowisko();
    const baza = [
      { patientId: 'a', header: { sex: 'F', dobISO: '2014-03-20' }, lastSavedAtISO: '2026-05-01T10:00:00.000Z' },
      { patientId: 'b', header: { sex: 'M', dobISO: '2010-09-01' }, lastSavedAtISO: '2026-05-02T10:00:00.000Z' },
      { patientId: 'c', header: { sex: 'F', dobISO: '2005-05-05' }, lastSavedAtISO: '2026-05-03T10:00:00.000Z' },
    ];
    const index = s.diagnosisIndex([
      notatka('a', 'Otyłość spowodowana nadmierną podażą energii', 'E66.0'), notatka('a', 'Zespół Turnera', 'Q96'),
      notatka('b', 'Otyłość, nieokreślona', 'E66.9'), notatka('b', 'Niedoczynność przysadki', 'E23.0', 'closed'),
    ], s.decode);
    const now = new Date('2026-06-17T10:00:00.000Z');
    const karta = { growthPair: true, parents: false, birthWeight: false };
    const items = Object.fromEntries(baza.map((p) => [p.patientId, { read: true, card: karta, gh: null, ob: null, partial: false }]));
    const wynik = s.cardsResult(baza, items);
    const cards = { total: wynik.total, failed: wynik.failed, missing: wynik.missing, details: wynik.details, gh: s.ghCohort([]), obesity: s.obesityCohort([], { thresholds: [5, 10] }) };
    const raport = (zakres) => {
      const osoby = zakres ? baza.filter((p) => zakres.includes(p.patientId)) : baza;
      return s.statsReport({ model: s.demographics(osoby, { now }), cards: zakres ? Object.assign({}, cards, s.cardsResult(osoby, items)) : cards, patients: osoby, stamp: now,
        ageMonths: (dob) => (now.getFullYear() - Number(dob.slice(0, 4))) * 12, scope: zakres ? 'E66 — Otyłość' : '',
        diagnoses: s.diagnosisCohort(osoby, index, { lookup: s.lookup }), diagnosesOf: index.of });
    };
    return { s, raport, now };
  }
  const sekcja = (raport, klucz) => raport.sections.find((item) => item.key === klucz);

  it('raport całej bazy: sekcja „Rozpoznania” zaraz po „Pacjenci”, z wierszem kategorii „razem” i podkodami', () => {
    const { raport } = dane();
    const pelny = raport(null);
    expect(pelny.scope).toBe('');
    expect(pelny.sections.map((item) => item.key).slice(0, 3)).toEqual(['patients', 'diagnoses', 'gh']);
    const dx = sekcja(pelny, 'diagnoses');
    expect(dx.hint).toBe('z aktywnym rozpoznaniem: 2 z 3');
    expect(dx.facts.map((fakt) => [fakt.label, fakt.value, fakt.note])).toEqual([
      ['Pacjenci z aktywnym rozpoznaniem', 2, '67% pacjentów'], ['Bez rozpoznania', 1, ''], ['Rozpoznania aktywne', 3, 'zamknięte: 1']]);
    const tabela = dx.tables[0];
    expect(tabela.columns.map((kolumna) => kolumna.title)).toEqual(['Kod ICD-10', 'Rozpoznanie', 'Pacjenci', 'Odsetek (%)', 'Tylko zamknięte', '']);
    expect(tabela.columns[1].wide, 'elastyczna jest kolumna nazwy, nie kodu').toBe(true);
    expect(tabela.rows.map((wiersz) => wiersz.slice(0, 5))).toEqual([
      ['E66', 'Otyłość — razem', 2, 67, 0],
      ['E66.0', 'Otyłość spowodowana nadmierną podażą energii', 1, 33, 0],
      ['E66.9', 'Otyłość, nieokreślona', 1, 33, 0],
      ['Q96', 'Zespół Turnera', 1, 33, 0],
      ['E23.0', 'Niedoczynność przysadki', 0, 0, 1],
    ]);
    expect(tabela.barMax).toBe(2);
    expect(dx.notes[0]).toContain('Liczone są rozpoznania aktywne.');
    expect(dx.notes[0]).toContain('od wszystkich pacjentów bazy');
    expect(sekcja(pelny, 'patients').facts[0].label).toBe('Pacjenci w bazie');
  });

  it('raport grupy: zakres w nagłówku, liczby tylko tej grupy, własna nazwa pliku', () => {
    const { s, raport, now } = dane();
    const grupa = raport(['a', 'b']);
    expect(grupa.scope).toBe('E66 — Otyłość');
    expect(grupa.total).toBe(2);
    expect(sekcja(grupa, 'patients').facts[0]).toMatchObject({ label: 'Pacjenci w grupie', value: 2 });
    expect(sekcja(grupa, 'diagnoses').facts[0]).toMatchObject({ value: 2, note: '100% pacjentów' });
    expect(sekcja(grupa, 'diagnoses').notes[0]).toContain('od wszystkich pacjentów grupy');
    const arkusze = s.statsWorkbook(grupa), podsumowanie = arkusze[0].rows.map((wiersz) => wiersz.cells);
    expect(podsumowanie.slice(0, 4)).toEqual([['Statystyki Bazy pacjentów'], ['Stan na', expect.any(String)], ['Grupa pacjentów', 'E66 — Otyłość'], ['Pacjentów w grupie', 2]]);
    expect(podsumowanie.some((komorki) => komorki[0] === 'Pacjentów w bazie')).toBe(false);
    // Nagłówek PDF mówi, czyje to liczby.
    const dokument = JSON.stringify(s.statsDocument(grupa).content[0]);
    expect(dokument).toContain('Grupa pacjentów: E66 — Otyłość · 2 pacjentów');
    expect(s.reportFileName(now, 'pdf', true)).toBe('statystyki-bazy-pacjentow-grupa-2026-06-17.pdf');
    expect(s.reportFileName(now, 'xlsx')).toBe('statystyki-bazy-pacjentow-2026-06-17.xlsx');
    // Raport całej bazy nie ma wiersza grupy.
    expect(s.statsWorkbook(raport(null))[0].rows.map((wiersz) => wiersz.cells).slice(0, 3)).toEqual([
      ['Statystyki Bazy pacjentów'], ['Stan na', expect.any(String)], ['Pacjentów w bazie', 3]]);
  });

  it('arkusz „Pacjenci”: kolumny rozpoznań aktywnych i zamkniętych — kod, a bez kodu nazwa; bez nazwisk i identyfikatorów', () => {
    const { s, raport } = dane();
    const pacjenci = s.statsWorkbook(raport(null))[1];
    const naglowek = pacjenci.rows[0].cells;
    expect(naglowek.slice(0, 6)).toEqual(['Lp.', 'Płeć', 'Wiek (lata)', 'Przedział wieku', 'Rozpoznania aktywne', 'Rozpoznania zamknięte']);
    // Kolejność wieku: a (12 l.), b (16 l.), c (21 l.).
    expect(pacjenci.rows.slice(1).map((wiersz) => wiersz.cells.slice(1, 6))).toEqual([
      ['K', 12, '10–13 lat', 'E66.0; Q96', ''],
      ['M', 16, '14–17 lat', 'E66.9', 'E23.0'],
      ['K', 21, '18+ lat', '', ''],
    ]);
    const tekst = JSON.stringify(pacjenci);
    ['Fikcyjny', 'tmt-fikcyjne', '2014-03-20'].forEach((napis) => expect(tekst).not.toContain(napis));
  });

  it('bez danych o rozpoznaniach (starszy sejf) raport nie ma sekcji ani kolumn rozpoznań', () => {
    const { s, now } = dane();
    const baza = [{ patientId: 'a', header: { sex: 'F', dobISO: '2014-03-20' } }];
    const wynik = s.cardsResult(baza, { a: { read: true, card: { growthPair: true, parents: false, birthWeight: false }, gh: null, ob: null, partial: false } });
    const raport = s.statsReport({ model: s.demographics(baza, { now }), stamp: now, patients: baza, ageMonths: () => 147,
      cards: { total: 1, failed: 0, missing: wynik.missing, details: wynik.details, gh: s.ghCohort([]), obesity: s.obesityCohort([], { thresholds: [5, 10] }) } });
    expect(raport.sections.map((item) => item.key)).toEqual(['patients', 'gh', 'obesity', 'data']);
    expect(raport.people.columns.map((kolumna) => kolumna.title).slice(0, 5)).toEqual(['Lp.', 'Płeć', 'Wiek (lata)', 'Przedział wieku', 'Co najmniej 2 pomiary wzrostu']);
  });
});
