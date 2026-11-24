import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-BAZA-STATYSTYKI, etap 4 (decyzja właściciela 2026-11-24): raport PDF i plik dla Excela.
// Model raportu, arkusze, dokumenty pliku .xlsx i dokument pdfmake pochodzą z PLIKU PRODUKCYJNEGO
// (vilda_patients_list.js). Wejście składają prawdziwe modele z etapów 1–3 na prawdziwych silnikach,
// a archiwum .xlsx pakuje ta sama lokalna biblioteka JSZip, którą ładuje aplikacja.
// Wszystkie osoby i pomiary są fikcyjne.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(repo, plik), 'utf8');

const WEGOVY = { drug: 'Wegovy (semaglutyd) – s.c. 1×/tydz.', substance: 'Semaglutyd (agonista receptora GLP‑1)' };
const SAXENDA = { drug: 'Saxenda (liraglutyd) – s.c. 1×/dobę', substance: 'Liraglutyd (agonista receptora GLP‑1)' };
const ob = (type, dateISO, lata, mies, weight, height, lek) => ({ type, dateISO, ageYears: lata, ageMonths: mies, weight, height, ...lek });
const gh = (type, lata, mies, height, extra = {}) => ({ type, ageYears: lata, ageMonths: mies, height, program: 'SNP', ...extra });

// Cztery osoby z bazy i jedna spoza bazy. Wiek na 17.06.2026.
const OSOBY = [
  { patientId: 'id-dorota', header: { name: 'Fikcyjna Dorota', sex: 'F', dobISO: '2014-03-20' }, lastSavedAtISO: '2026-06-01T10:00:00.000Z' },
  { patientId: 'id-cezary', header: { name: 'Fikcyjny Cezary', sex: 'M', dobISO: '2018-01-10' }, lastSavedAtISO: '2026-06-02T10:00:00.000Z' },
  { patientId: 'id-felicja', header: { name: 'Fikcyjna Felicja', sex: 'F', dobISO: '2005-05-05' }, lastSavedAtISO: '2024-01-02T10:00:00.000Z' },
  { patientId: 'id-gustaw', header: { name: 'Fikcyjny Gustaw', sex: 'M', dobISO: '' }, lastSavedAtISO: '2026-06-03T10:00:00.000Z' },
  { patientId: 'id-spoza', __ext: true, header: { name: 'Fikcyjna Spozabazy', sex: 'F' } },
];
const WIEK = { '2014-03-20': 146, '2018-01-10': 101, '2005-05-05': 253 };
const KARTY = {
  'id-dorota': { user: { sex: 'F' }, perinatal: { birthWeightG: 2900 }, obesityTherapyPoints: [
    ob('start', '2025-09-10', 11, 5, 60.0, 145, SAXENDA), ob('continue', '2025-12-10', 11, 8, 58.2, 146, SAXENDA), ob('continue', '2026-03-11', 11, 11, 57.0, 147, SAXENDA)] },
  'id-cezary': { user: { sex: 'M' }, growthBasic: { data: { measurements: [{ ageMonths: 60, ageYears: 5, height: 105.0 }] } }, ghTherapyPoints: [
    gh('start', 6, 0, 109.2), gh('continue', 7, 0, 118.8), gh('continue', 8, 1, 126.4)] },
  'id-felicja': { user: { sex: 'F' }, obesityTherapyPoints: [
    ob('start', '2025-10-01', 20, 4, 100.0, 166, WEGOVY), ob('continue', '2025-12-24', 20, 7, 94.0, 166, WEGOVY), ob('continue', '2026-04-01', 20, 10, 88.0, 166, WEGOVY)] },
  'id-gustaw': { user: { sex: 'M' } },
};
const STAN = new Date(2026, 5, 17, 15, 4);

function srodowisko() {
  const win = {};
  ['vilda_tempo_wzrastania.js', 'vilda_trajectory_analysis.js', 'obesity_response_criteria.js', 'vilda_cykle_leczenia.js', 'vilda_bmi.js', 'vilda_postepy_doroslego_dane.js', 'vilda_patients_list.js']
    .forEach((plik) => loadBrowserScript(plik, win));
  const L = win.VildaPatientsList;
  const ghDeps = { tempo: win.VildaTempoWzrastania, kursy: win.VildaTrajectoryAnalysis.ghKursy };
  const obDeps = {
    cykle: win.VildaCykleLeczenia.podziel, lek: win.VildaCykleLeczenia.nazwaLeku,
    tygodnie: (start, punkt) => win.ObesityResponseCriteria.tygodnieOceny(start, punkt).tygodnie,
    bmi: win.VildaBmi.bmi, dorosly: win.VildaBmi.dorosly,
  };
  const baza = OSOBY.filter((osoba) => !osoba.__ext);
  const missing = { measurements: [], parents: [], birthWeight: [] };
  const leczeniGh = [], leczeniOtylosc = [];
  const details = baza.map((osoba) => {
    const karta = KARTY[osoba.patientId];
    const card = L.cardCompleteness(karta);
    Object.keys(missing).forEach((klucz) => { if (!card[klucz]) missing[klucz].push(osoba.patientId); });
    const wynikGh = L.ghPatient(karta, ghDeps), wynikOb = L.obesityPatient(karta, karta.obesityTherapyPoints, obDeps);
    if (wynikGh) leczeniGh.push({ id: osoba.patientId, gh: wynikGh });
    if (wynikOb) leczeniOtylosc.push({ id: osoba.patientId, ob: wynikOb });
    return { id: osoba.patientId, card, gh: wynikGh, ob: wynikOb };
  });
  const cards = {
    signature: 'x', at: STAN.toISOString(), total: baza.length, failed: 0, missing, details,
    gh: Object.assign(L.ghCohort(leczeniGh), { sdsReady: false, engineReady: true }),
    obesity: Object.assign(L.obesityCohort(leczeniOtylosc, { thresholds: L.obesityThresholds(win.VildaPostepyDoroslegoDane) }), { sdsReady: false, engineReady: true, journalFailed: 0 }),
  };
  const ageMonths = (dobISO) => (dobISO in WIEK ? WIEK[dobISO] : null);
  const model = L.demographics(OSOBY, { now: new Date(2026, 5, 17), ageMonths });
  const wejscie = { model, cards, patients: OSOBY, ageMonths, stamp: STAN };
  return { L, win, wejscie, raport: L.statsReport(wejscie) };
}
const sekcja = (raport, klucz) => raport.sections.find((item) => item.key === klucz);
const tabela = (raport, klucz) => raport.sections.flatMap((item) => item.tables).find((item) => item.key === klucz);
const fakt = (raport, klucz, etykieta) => sekcja(raport, klucz).facts.find((item) => item.label === etykieta);
// Wszystkie napisy dokumentu pdfmake (także w tabelach i stosach).
function teksty(wezel, lista = []) {
  if (Array.isArray(wezel)) wezel.forEach((element) => teksty(element, lista));
  else if (wezel && typeof wezel === 'object') {
    if (typeof wezel.text === 'string') lista.push(wezel.text);
    Object.keys(wezel).forEach((klucz) => { if (klucz !== 'text' && typeof wezel[klucz] === 'object') teksty(wezel[klucz], lista); });
  }
  return lista;
}
function svgi(wezel, lista = []) {
  if (Array.isArray(wezel)) wezel.forEach((element) => svgi(element, lista));
  else if (wezel && typeof wezel === 'object') {
    if (typeof wezel.svg === 'string') lista.push(wezel.svg);
    Object.keys(wezel).forEach((klucz) => { if (typeof wezel[klucz] === 'object') svgi(wezel[klucz], lista); });
  }
  return lista;
}
// Prosta kontrola poprawności XML: każdy znacznik otwarty jest zamknięty, w tej samej kolejności.
function xmlDomkniety(xml) {
  const stos = [];
  for (const dopasowanie of xml.replace(/^<\?xml[^>]*\?>\s*/, '').matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/g)) {
    const [, zamyka, nazwa, , sam] = dopasowanie;
    if (sam) continue;
    if (zamyka) { if (stos.pop() !== nazwa) return false; } else stos.push(nazwa);
  }
  return stos.length === 0 && !/<[^>]*</.test(xml.replace(/<[^<>]*>/g, ''));
}
const DANE_OSOBOWE = ['Fikcyjn', 'Dorota', 'Cezary', 'Felicja', 'Gustaw', 'Spozabazy', 'id-dorota', 'id-cezary', 'id-felicja', 'id-gustaw', 'id-spoza', '2014-03-20', '2018-01-10', '2005-05-05'];

describe('Model raportu (statsReport)', () => {
  it('niesie te same liczby, co modele ekranu: wiek i płeć, leczenie GH, leczenie otyłości, kompletność', () => {
    const { raport, wejscie } = srodowisko();
    expect(raport.title).toBe('Statystyki Bazy pacjentów');
    expect(raport.total).toBe(4);
    expect(raport.counted).toBe(true);
    expect(raport.sections.map((item) => item.key)).toEqual(['patients', 'gh', 'obesity', 'data']);

    expect(fakt(raport, 'patients', 'Pacjenci w bazie')).toMatchObject({ value: 4, text: '4', note: '3 z zapisem w ostatnich 12 mies.' });
    expect(fakt(raport, 'patients', 'Średni wiek')).toMatchObject({ value: 13.9, unit: 'lata', text: '13,9 roku' });   // (146 + 101 + 253) / 3 = 166,7 mies.
    expect(fakt(raport, 'patients', 'Dziewczęta')).toMatchObject({ value: 2, note: '50% · średni wiek 16,6 roku' });
    expect(tabela(raport, 'age').rows.map((row) => row.slice(0, 5))).toEqual([
      ['0–2 lata', 0, 0, 0, 0], ['3–5 lat', 0, 0, 0, 0], ['6–9 lat', 1, 0, 0, 1], ['10–13 lat', 0, 1, 0, 1], ['14–17 lat', 0, 0, 0, 0], ['18+ lat', 0, 1, 0, 1]]);

    // GH: Cezary — przed 4,2; 1. rok 9,6; 2. rok 7,6 / (13/12) = 7,0.
    expect(sekcja(raport, 'gh').hint).toBe('leczonych: 1 · SNP 1');
    expect(fakt(raport, 'gh', 'Tempo w 1. roku leczenia')).toMatchObject({ value: 9.6, unit: 'cm/rok', text: '9,6 cm/rok', note: 'mediana 9,6 · n = 1' });
    expect(fakt(raport, 'gh', 'Przed leczeniem → 1. rok')).toMatchObject({ text: '4,2 → 9,6 cm/rok', only: 'pdf' });
    expect(fakt(raport, 'gh', 'Tempo przed leczeniem (pary)')).toMatchObject({ value: 4.2, only: 'sheet' });
    expect(tabela(raport, 'gh-programs').rows).toEqual([['SNP', 1, 1, 9.6, 1, 4.2, 9.6, 'mała grupa']]);
    expect(tabela(raport, 'gh-years').rows.map((row) => row.slice(0, 3))).toEqual([['1. rok', 9.6, 1], ['2. rok', 7.02, 1]]);

    // Otyłość: Dorota −3,0 i −5,0; Felicja −6,0 i −12,0.
    expect(sekcja(raport, 'obesity').hint).toBe('leczonych: 2 · Saxenda 1 · Wegovy 1');
    expect(fakt(raport, 'obesity', 'Zmiana masy po 12 tyg.')).toMatchObject({ value: -4.5, unit: '%', text: '−4,5%' });
    expect(fakt(raport, 'obesity', 'Zmiana masy po 6 mies.')).toMatchObject({ value: -8.5, text: '−8,5%' });
    expect(fakt(raport, 'obesity', 'Redukcja o ≥ 5% po 6 mies.')).toMatchObject({ value: 2, unit: 'z 2', text: '2 z 2', note: '100% · o ≥ 10%: 1 (50%)' });
    expect(fakt(raport, 'obesity', 'Dzieci: zmiana BMI po 6 mies.')).toMatchObject({ value: -7.57, text: '−7,6%' });
    expect(tabela(raport, 'ob-windows').columns.map((column) => column.title))
      .toEqual(['Okno', 'Średnia (%)', 'Mediana (%)', 'n', 'Tempo (kg/mies.)', 'Redukcja o ≥ 5% (n)', 'Redukcja o ≥ 10% (n)', 'Przyrost masy (n)']);
    expect(tabela(raport, 'ob-windows').rows[1].slice(0, 4)).toEqual(['po 6 mies.', -8.5, -8.5, 2]);
    expect(tabela(raport, 'ob-drugs').rows).toEqual([['Saxenda', 1, -3, 1, -5, 1, 'mała grupa'], ['Wegovy', 1, -6, 1, -12, 1, 'mała grupa']]);
    expect(sekcja(raport, 'obesity').chart).toEqual({ kind: 'fall', title: 'Każdy pacjent po 6 mies.', values: [-5, -12] });

    expect(tabela(raport, 'data').rows).toEqual([
      ['Data urodzenia', 3, 4, 75], ['Płeć', 4, 4, 100],
      ['Co najmniej 2 pomiary wzrostu', 3, 4, 75], ['Wzrost obojga rodziców', 0, 4, 0], ['Masa urodzeniowa', 1, 4, 25]]);
    // Teksty definicji są te same, co pod sekcjami na ekranie.
    expect(sekcja(raport, 'gh').notes[0]).toContain('od punktu Włączenia do kontroli po 9–15 mies.');
    expect(sekcja(raport, 'obesity').notes[0]).toContain('12. tygodnia (okno 9–15 tyg.) i 26. tygodnia (okno 20–32 tyg.)');
    expect(raport.closing).toContain('Nie są badaniem naukowym ani podstawą decyzji klinicznych.');
    expect(wejscie.cards.details).toHaveLength(4);
  });

  it('bez policzonych kart raport ma tylko dane z nagłówków i mówi, czego nie liczono', () => {
    const { L, wejscie } = srodowisko();
    const raport = L.statsReport({ ...wejscie, cards: null });
    expect(raport.counted).toBe(false);
    expect(raport.sections.map((item) => item.key)).toEqual(['patients', 'data']);
    expect(sekcja(raport, 'data').notes).toEqual(['Leczenie i kompletność kart nie były liczone.']);
    expect(tabela(raport, 'data').rows).toHaveLength(2);
    expect(raport.people).toBeNull();
  });

  it('pusta grupa leczonych daje zdanie zamiast liczb', () => {
    const { L, wejscie } = srodowisko();
    const cards = { ...wejscie.cards, gh: Object.assign(L.ghCohort([]), { sdsReady: false, engineReady: true }),
      obesity: Object.assign(L.obesityCohort([], { thresholds: [5, 10] }), { sdsReady: false, engineReady: true, journalFailed: 0 }) };
    const raport = L.statsReport({ ...wejscie, cards });
    expect(sekcja(raport, 'gh')).toMatchObject({ facts: [], tables: [], notes: ['W bazie nie ma pacjentów z punktami leczenia hormonem wzrostu.'] });
    expect(sekcja(raport, 'obesity')).toMatchObject({ facts: [], tables: [], chart: null, notes: ['W bazie nie ma pacjentów z punktami leczenia otyłości.'] });
  });
});

describe('Arkusze (statsWorkbook) — bez danych osobowych', () => {
  it('„Podsumowanie” powtarza sekcje raportu, a liczby zostają liczbami', () => {
    const { L, raport } = srodowisko();
    const arkusze = L.statsWorkbook(raport);
    expect(arkusze.map((arkusz) => arkusz.name)).toEqual(['Podsumowanie', 'Pacjenci']);
    const wiersze = arkusze[0].rows.map((row) => row.cells);
    expect(wiersze[0]).toEqual(['Statystyki Bazy pacjentów']);
    expect(wiersze[1]).toEqual(['Stan na', '17.06.2026, 15:04']);
    expect(wiersze).toContainEqual(['Tempo w 1. roku leczenia', 9.6, 'cm/rok', 'mediana 9,6 · n = 1']);
    expect(wiersze).toContainEqual(['Zmiana masy po 6 mies.', -8.5, '%', 'mediana −8,5% · n = 2 · −1,3 kg/mies.']);
    expect(wiersze).toContainEqual(['SNP', 1, 1, 9.6, 1, 4.2, 9.6, 'mała grupa']);
    expect(wiersze).toContainEqual(['Plik nie zawiera nazwisk, dat urodzenia ani identyfikatorów pacjentów.']);
    // Fakt tylko do PDF (napis ze strzałką) nie trafia do arkusza; kolumna słupków też nie.
    expect(wiersze.some((cells) => cells[0] === 'Przed leczeniem → 1. rok')).toBe(false);
    expect(wiersze).toContainEqual(['Przedział wieku', 'Chłopcy', 'Dziewczęta', 'Płeć nieznana', 'Razem']);
    // Tytuły sekcji i nagłówki tabel są pogrubione.
    expect(arkusze[0].rows.filter((row) => row.bold).map((row) => row.cells[0])).toEqual(expect.arrayContaining(['Pacjenci', 'Leczenie hormonem wzrostu', 'Wg programu', 'Program', 'Leczenie otyłości', 'Kompletność danych']));
  });

  it('„Pacjenci”: jeden wiersz na pacjenta z bazy, kolejność wg wieku, żadnego nazwiska, daty urodzenia ani identyfikatora', () => {
    const { L, raport } = srodowisko();
    const pacjenci = L.statsWorkbook(raport)[1];
    expect(pacjenci.freeze).toBe(true);
    const naglowek = pacjenci.rows[0].cells, wiersze = pacjenci.rows.slice(1).map((row) => row.cells);
    expect(pacjenci.rows[0].bold).toBe(true);
    expect(naglowek.slice(0, 4)).toEqual(['Lp.', 'Płeć', 'Wiek (lata)', 'Przedział wieku']);
    expect(wiersze).toHaveLength(4);
    const kolumna = (tytul) => naglowek.indexOf(tytul);
    // Od najmłodszego; pacjent bez daty urodzenia na końcu, bez wieku.
    expect(wiersze.map((cells) => [cells[0], cells[1], cells[2], cells[3]])).toEqual([
      [1, 'M', 8.4, '6–9 lat'], [2, 'K', 12.2, '10–13 lat'], [3, 'K', 21.1, '18+ lat'], [4, 'M', null, '']]);
    expect(wiersze[0][kolumna('GH: program')]).toBe('SNP');
    expect(wiersze[0][kolumna('GH: tempo przed leczeniem (cm/rok)')]).toBe(4.2);
    expect(wiersze[0][kolumna('GH: tempo 1. rok (cm/rok)')]).toBe(9.6);
    expect(wiersze[0][kolumna('GH: tempo 2. rok')]).toBe(7.02);
    expect(wiersze[1][kolumna('Otyłość: lek')]).toBe('Saxenda');
    expect(wiersze[1][kolumna('Otyłość: grupa')]).toBe('dziecko');
    expect(wiersze[1][kolumna('Otyłość po 12 tyg.: tydzień pomiaru')]).toBe(13);
    expect(wiersze[1][kolumna('Otyłość po 12 tyg.: zmiana masy (%)')]).toBe(-3);
    expect(wiersze[1][kolumna('Otyłość po 6 mies.: zmiana BMI (%)')]).toBe(-7.57);
    expect(wiersze[2][kolumna('Otyłość: grupa')]).toBe('dorosły');
    expect(wiersze[2][kolumna('Otyłość po 6 mies.: zmiana masy (%)')]).toBe(-12);
    expect(wiersze[2][kolumna('Otyłość po 6 mies.: tempo (kg/mies.)')]).toBe(-2.01);
    expect(wiersze[1][kolumna('Masa urodzeniowa')]).toBe('tak');
    expect(wiersze[3][kolumna('Co najmniej 2 pomiary wzrostu')]).toBe('nie');
    const calosc = JSON.stringify(L.statsWorkbook(raport));
    DANE_OSOBOWE.forEach((napis) => expect(calosc, `arkusze nie zawierają „${napis}”`).not.toContain(napis));
  });

  it('pacjent, którego karty nie udało się odczytać, ma wiersz z samym wiekiem i płcią', () => {
    const { L, wejscie } = srodowisko();
    const details = wejscie.cards.details.map((item) => item.id === 'id-felicja' ? { id: item.id, card: null, gh: null, ob: null } : item);
    const raport = L.statsReport({ ...wejscie, cards: { ...wejscie.cards, details, failed: 1 } });
    const wiersz = L.statsWorkbook(raport)[1].rows[3].cells;
    expect(wiersz.slice(0, 4)).toEqual([3, 'K', 21.1, '18+ lat']);
    expect(wiersz.slice(4).every((cell) => cell === '' || cell === null)).toBe(true);
    expect(sekcja(raport, 'data').notes).toEqual(['Nie udało się odczytać kart: 1.']);
    expect(tabela(raport, 'data').rows[2]).toEqual(['Co najmniej 2 pomiary wzrostu', 2, 3, 67]);
  });
});

describe('Plik .xlsx (xlsxParts + lokalny JSZip)', () => {
  it('dokumenty pakietu: typy, relacje, skoroszyt, style i arkusze — poprawny XML', () => {
    const { L, raport } = srodowisko();
    const czesci = L.xlsxParts(L.statsWorkbook(raport));
    expect(Object.keys(czesci).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
    Object.entries(czesci).forEach(([sciezka, xml]) => {
      expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'), sciezka).toBe(true);
      expect(xmlDomkniety(xml), `${sciezka} ma domknięte znaczniki`).toBe(true);
    });
    expect(czesci['xl/workbook.xml']).toContain('<sheet name="Podsumowanie" sheetId="1" r:id="rId1"/><sheet name="Pacjenci" sheetId="2" r:id="rId2"/>');
    expect(czesci['xl/_rels/workbook.xml.rels']).toContain('Target="worksheets/sheet2.xml"');
    expect(czesci['xl/_rels/workbook.xml.rels']).toContain('Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"');
    expect(czesci['[Content_Types].xml']).toContain('<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
    const pierwszy = czesci['xl/worksheets/sheet1.xml'], drugi = czesci['xl/worksheets/sheet2.xml'];
    // Tytuł pogrubiony (styl 1), napis jako inlineStr, liczba jako wartość.
    expect(pierwszy).toContain('<row r="1"><c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Statystyki Bazy pacjentów</t></is></c></row>');
    expect(pierwszy).toContain('<is><t xml:space="preserve">Tempo w 1. roku leczenia</t></is></c><c r="B');
    expect(pierwszy).toMatch(/<c r="B\d+"><v>9\.6<\/v><\/c>/);
    expect(pierwszy).toMatch(/<c r="B\d+"><v>-8\.5<\/v><\/c>/);
    expect(pierwszy).toContain('tabSelected="1"');
    // Arkusz pacjentów ma przypięty wiersz nagłówka.
    expect(drugi).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(drugi).toContain('<c r="A2"><v>1</v></c><c r="B2" t="inlineStr"><is><t xml:space="preserve">M</t></is></c><c r="C2"><v>8.4</v></c>');
    DANE_OSOBOWE.forEach((napis) => expect(Object.values(czesci).join('\n')).not.toContain(napis));
  });

  it('znaki specjalne, puste komórki, kolumny za Z i nazwy arkuszy', () => {
    const { L } = srodowisko();
    const szeroki = Array.from({ length: 28 }, (_, index) => index);
    const czesci = L.xlsxParts([
      { name: 'A/B:C*?[x]\\ bardzo długa nazwa arkusza ponad limit', widths: [10, 20], rows: [{ bold: false, cells: ['a & b < c > d "e"', null, '', 0, -1.5, 'x\u0001y\tz', NaN] }, { bold: true, cells: szeroki }] },
      { name: 'Pacjenci', rows: [] }, { name: 'pacjenci', rows: [{ cells: ['ok'] }] }, { name: '', rows: [] },
    ]);
    const arkusz = czesci['xl/worksheets/sheet1.xml'];
    expect(arkusz).toContain('<t xml:space="preserve">a &amp; b &lt; c &gt; d &quot;e&quot;</t>');
    expect(arkusz).toContain('<c r="D1"><v>0</v></c><c r="E1"><v>-1.5</v></c><c r="F1" t="inlineStr"><is><t xml:space="preserve">xy\tz</t></is></c></row>');   // B1, C1 i G1 (NaN) puste
    expect(arkusz).toContain('<c r="Z2" s="1"><v>25</v></c><c r="AA2" s="1"><v>26</v></c><c r="AB2" s="1"><v>27</v></c>');
    expect(arkusz).toContain('<cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/></cols>');
    const nazwy = Array.from(czesci['xl/workbook.xml'].matchAll(/<sheet name="([^"]*)"/g)).map((match) => match[1]);
    expect(nazwy[0]).toBe('A B C x bardzo długa nazwa arku');
    expect(nazwy[0].length).toBeLessThanOrEqual(31);
    expect(nazwy[1]).toBe('Pacjenci');
    expect(nazwy[2].toLowerCase()).not.toBe('pacjenci');
    expect(nazwy[3]).toBe('Arkusz 4');
    expect(new Set(nazwy.map((nazwa) => nazwa.toLowerCase())).size).toBe(4);
    Object.entries(czesci).forEach(([sciezka, xml]) => expect(xmlDomkniety(xml), sciezka).toBe(true));
  });

  it('lokalna biblioteka JSZip składa z tych dokumentów archiwum, które da się otworzyć z powrotem', async () => {
    const { L, raport } = srodowisko();
    const okno = {};
    new Function('window', 'globalThis', zrodlo('jszip.min.js'))(okno, okno);
    expect(typeof okno.JSZip).toBe('function');
    const czesci = L.xlsxParts(L.statsWorkbook(raport));
    const archiwum = new okno.JSZip();
    Object.keys(czesci).forEach((sciezka) => archiwum.file(sciezka, czesci[sciezka], { createFolders: false }));
    const bajty = await archiwum.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    expect(String.fromCharCode(bajty[0], bajty[1])).toBe('PK');
    const otwarte = await okno.JSZip.loadAsync(bajty);
    expect(Object.keys(otwarte.files).sort()).toEqual(Object.keys(czesci).sort());
    expect(await otwarte.file('xl/worksheets/sheet2.xml').async('string')).toBe(czesci['xl/worksheets/sheet2.xml']);
  });
});

describe('Dokument PDF (statsDocument)', () => {
  it('A4, czcionka z polskimi znakami, sekcje i liczby z raportu, stopka z numerem strony', () => {
    const { L, raport } = srodowisko();
    const dokument = L.statsDocument(raport);
    expect(dokument).toMatchObject({ pageSize: 'A4', pageOrientation: 'portrait', defaultStyle: { font: 'Roboto' }, info: { title: 'Statystyki Bazy pacjentów' } });
    expect(dokument.footer(2, 5)).toMatchObject({ text: 'Strona 2 z 5', alignment: 'center' });
    const napisy = teksty(dokument.content);
    ['Statystyki Bazy pacjentów', 'Zestawienie opisowe · 4 pacjentów z bazy', 'Stan na 17.06.2026, 15:04', 'bez danych osobowych',
      'Pacjenci', 'Leczenie hormonem wzrostu', 'Leczenie otyłości', 'Kompletność danych',
      'TEMPO W 1. ROKU LECZENIA', '9,6 cm/rok', 'mediana 9,6 · n = 1', '−4,5%', '−8,5%', '2 z 2', 'REDUKCJA O ≥ 5% PO 6 MIES.',
      'Wg programu', 'Kolejne lata leczenia', 'Zmiana masy ciała', 'Wg leku (zmiana masy)', 'Każdy pacjent po 6 mies.', 'Ile kart ma dane',
    ].forEach((napis) => expect(napisy, `dokument zawiera „${napis}”`).toContain(napis));
    // Liczby w tabelach: przecinek dziesiętny, znak przy zmianach, kreska przy braku.
    expect(napisy).toEqual(expect.arrayContaining(['7,0', '−12,0', '−5,0', '75']));
    // Fakt przeznaczony tylko do arkusza nie robi kafla w PDF.
    expect(napisy).not.toContain('TEMPO PRZED LECZENIEM (PARY)');
    expect(napisy).not.toContain('LECZONYCH');
    expect(napisy.some((napis) => napis.includes('Linie co 5%: od 0% (góra) do −15% (dół)'))).toBe(true);
  });

  it('strzałki, których nie ma w czcionce wydruku, zastępuje „»”; żadnych danych osobowych', () => {
    const { L, raport } = srodowisko();
    const dokument = L.statsDocument(raport), napisy = teksty(dokument.content);
    expect(napisy).toContain('PRZED LECZENIEM » 1. ROK');
    expect(napisy).toContain('4,2 » 9,6 cm/rok');
    expect(napisy.join('\n')).not.toMatch(/[→➡›]/);
    const calosc = JSON.stringify(dokument);
    DANE_OSOBOWE.forEach((napis) => expect(calosc, `dokument nie zawiera „${napis}”`).not.toContain(napis));
    // Glify zastępowane są te same, co w wydruku postępów dorosłego (ta sama czcionka).
    const okno = {};
    loadBrowserScript('vilda_postepy_doroslego_wydruk.js', okno);
    expect(okno.VildaPostepyDoroslegoWydruk.PODMIANY.map((para) => para[0])).toEqual(['/\\u2192/g', '/\\u27A1/g']);
  });

  it('wykresy to SVG z samych kształtów: słupki wieku i lat leczenia oraz wykres pacjentów', () => {
    const { L, raport } = srodowisko();
    const rysunki = svgi(L.statsDocument(raport).content);
    expect(rysunki).toHaveLength(6 + 2 + 1);   // 6 przedziałów wieku, 2 lata leczenia, 1 wykres pacjentów
    rysunki.forEach((svg) => { expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true); expect(svg).not.toContain('<text'); expect(xmlDomkniety(svg)).toBe(true); });
    // Przedział 6–9 lat: jeden chłopiec z jednego (największy przedział ma 1 osobę) → pełny niebieski słupek.
    expect(rysunki[2]).toContain('<rect x="0.0" y="1" width="110.0" height="7" fill="#2a78d6"/>');
    expect(rysunki[0]).not.toContain('<rect');
    // Wykres pacjentów: dwa słupki ubytku pod linią zera (y = 5), wyższy dla −12%.
    const slupki = Array.from(rysunki[8].matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)" fill="(#[0-9a-f]+)"\/>/g));
    expect(slupki.map((match) => match[3])).toEqual(['#00838d', '#00838d']);
    expect(slupki.map((match) => Number(match[1]))).toEqual([5, 5]);
    expect(Number(slupki[1][2]) / Number(slupki[0][2])).toBeCloseTo(2.4, 1);
  });

  it('nagłówek sekcji idzie na stronę razem z pierwszą tabelą', () => {
    const { L, raport } = srodowisko();
    const bloki = L.statsDocument(raport).content.filter((blok) => blok.unbreakable && Array.isArray(blok.stack));
    const zTytulem = (tytul) => bloki.find((blok) => blok.stack[0] && blok.stack[0].text === tytul);
    ['Pacjenci', 'Leczenie hormonem wzrostu', 'Leczenie otyłości', 'Kompletność danych'].forEach((tytul) => {
      const blok = zTytulem(tytul);
      expect(blok, tytul).toBeTruthy();
      expect(blok.stack.some((element) => Array.isArray(element.stack) && element.stack.some((czesc) => czesc.table)), `${tytul}: tabela w tym samym bloku`).toBe(true);
    });
  });
});

describe('Nazwa pliku i biblioteki', () => {
  it('nazwa pliku niesie tylko datę policzenia — bez nazwy gabinetu i bez danych pacjentów', () => {
    const { L } = srodowisko();
    expect(L.reportFileName(STAN, 'pdf')).toBe('statystyki-bazy-pacjentow-2026-06-17.pdf');
    expect(L.reportFileName(new Date(2026, 0, 5, 9, 3), 'xlsx')).toBe('statystyki-bazy-pacjentow-2026-01-05.xlsx');
    expect(L.reportFileName(null, 'pdf')).toBe('statystyki-bazy-pacjentow.pdf');
  });

  it('pliki powstają z bibliotek lokalnych, zapisanych w pamięci offline; moduł wydruku stoi przed listą na każdej stronie', () => {
    const lista = zrodlo('vilda_patients_list.js'), sw = zrodlo('service-worker-kalorii.js');
    expect(lista).toContain("script.src = 'jszip.min.js?v=1'");
    expect(lista).toContain('win.VildaPostepyDoroslegoWydruk');
    expect(lista).toContain('print.zapewnijPdfmake()');
    expect(lista).not.toMatch(/https?:\/\/(?!schemas\.openxmlformats\.org|www\.w3\.org)/);   // żadnych adresów sieciowych poza nazwami przestrzeni XML
    ["'/jszip.min.js?v=1',", "'/pdfmake.min.js?v=1',", "'/pdfmake_vfs_fonts.js?v=1',"].forEach((wpis) => expect(sw, wpis).toContain(wpis));
    const okno = {};
    loadBrowserScript('vilda_postepy_doroslego_wydruk.js', okno);
    expect(okno.VildaPostepyDoroslegoWydruk.PLIKI).toEqual(['pdfmake.min.js?v=1', 'pdfmake_vfs_fonts.js?v=1']);
    const strony = fs.readdirSync(repo).filter((plik) => plik.endsWith('.html') && zrodlo(plik).includes('vilda_patients_list.js?v='));
    expect(strony.length).toBe(8);
    strony.forEach((strona) => {
      const html = zrodlo(strona);
      const wydruk = html.indexOf('vilda_postepy_doroslego_wydruk.js?v='), listaNaStronie = html.indexOf('vilda_patients_list.js?v=');
      expect(wydruk, `${strona} ładuje moduł wydruku`).toBeGreaterThan(-1);
      expect(wydruk, `${strona}: moduł wydruku przed listą`).toBeLessThan(listaNaStronie);
    });
  });
});
