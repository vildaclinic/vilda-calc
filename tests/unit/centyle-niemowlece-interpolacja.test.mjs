import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// DOB-AGE-4 (decyzja właściciela 2026-09-14) — centyle niemowlęce liczone na dokładnym wieku.
//
// ZNALEZISKO. `getChildLMS` poniżej 36 miesięcy czytało tablicę WHO wierszem UKOŃCZONEGO
// miesiąca, bez interpolacji. Formularz podaje wiek w pełnych miesiącach, więc całą pierwszą
// dobę życia aż do 29. włącznie dziecko było oceniane wierszem URODZENIOWYM. Skutek policzony
// na tablicach, które aplikacja sama wozi: niemowlę w 29. dobie leżące DOKŁADNIE na medianie
// WHO wychodziło na 99. centylu (z = +2,44 dla długości chłopców, +2,32 dziewcząt, +2,00 dla
// masy chłopców, +1,84 dziewcząt). Błąd jednostronny — zawsze w górę — gasnący dopiero około
// pierwszych urodzin (w 364. dobie wciąż z ≈ +0,5).
//
// POPRAWKA. Gałąź niemowlęca interpoluje L, M i S między sąsiednimi wierszami — tym samym
// mechanizmem, którego ta sama funkcja używa powyżej 36 miesięcy, i który `getLMSFromDataset`
// (moduły wykresów) stosuje od zawsze. Dokładny wiek bierze się WYŁĄCZNIE z daty urodzenia,
// przez `VildaDobAge.readExactAge()`.
//
// DLACZEGO NIE TABLICE WHO W ROZDZIELCZOŚCI DZIENNEJ. Zmierzone na tych samych tablicach:
// test samospójności (interpolacja wiersza `m` z wierszy `m−1` i `m+1`, więc rozpiętość 2×
// większa niż w praktyce) zostawia najwyżej |Δz| ≈ 0,30, czyli ≈ 0,075 na rozpiętości jednego
// miesiąca — sprawdzone także przy z = ±2, gdzie błędy L i S biją najmocniej. Dla porównania
// pomyłka 0,5 cm przy pomiarze długości w 1. miesiącu to z ≈ 0,26. Reszta po interpolacji ginie
// w błędzie taśmy, a tablice dzienne WHO mają sporny status prawny (smart-ccc deklaruje CC0,
// ale Terms of Use przy mnf-anthro-analyzer zastrzega wszystkie prawa do Reference Data).
//
// Funkcje są WYCINANE Z app.js i uruchamiane wprost — mierzymy zachowanie aplikacji, nie kopię
// reguły. Dane wyłącznie FIKCYJNE.

const src = fs.readFileSync(path.join(korzen, 'app.js'), 'utf8');

function wytnijOdKlamry(od) {
  let d = 0;
  for (let k = src.indexOf('{', od); k < src.length; k += 1) {
    if (src[k] === '{') d += 1;
    else if (src[k] === '}') {
      d -= 1;
      if (d === 0) return src.slice(od, k + 1);
    }
  }
  return null;
}

function funkcja(nazwa) {
  const i = src.indexOf(`function ${nazwa}(`);
  expect(i, `app.js ma funkcję ${nazwa}()`).toBeGreaterThan(-1);
  return wytnijOdKlamry(i);
}

function tablica(nazwa) {
  const i = src.indexOf(`${nazwa}={`);
  expect(i, `app.js ma tablicę ${nazwa}`).toBeGreaterThan(-1);
  return `const ${wytnijOdKlamry(i)}`;
}

const TABLICE = [
  'LMS_INFANT_HEIGHT_BOYS',
  'LMS_INFANT_HEIGHT_GIRLS',
  'LMS_INFANT_WEIGHT_BOYS',
  'LMS_INFANT_WEIGHT_GIRLS',
  // Potrzebne tylko po to, żeby test „powyżej 36 miesięcy" przeszedł tą samą drogą co aplikacja.
  'LMS_HEIGHT_WHO_BOYS',
  'LMS_HEIGHT_WHO_GIRLS',
  'LMS_WEIGHT_WHO_BOYS',
  'LMS_WEIGHT_WHO_GIRLS',
  'LMS_HEIGHT_BOYS',
  'LMS_HEIGHT_GIRLS',
  'LMS_WEIGHT_BOYS',
  'LMS_WEIGHT_GIRLS',
].map(tablica).join(';\n');

// `lmsNiemowleWiek` sięga po `window.VildaDobAge`, więc podajemy je jako parametr fabryki.
// P-SDS-5: wzrost liczy WYLACZNIE silnik vilda_sds_wzrostu.js (calcPercentileStats deleguje, bez zapasu),
// wiec harness laduje prawdziwy silnik z tablicami app.js; zrodlo WHO — test mierzy interpolacje WHO 2006.
const silnikSrc = fs.readFileSync(path.join(korzen, 'vilda_sds_wzrostu.js'), 'utf8');
function silnik(dobAge) {
  const win = dobAge ? { VildaDobAge: dobAge } : {};
  win.VildaWzrostLMS = {};
  for (const n of ['LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS', 'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS']) {
    win.VildaWzrostLMS[n] = new Function(`${tablica(n)}; return ${n};`)();
  }
  new Function('window', 'globalThis', silnikSrc)(win, win);
  const kod = `
    ${TABLICE};
    let weightUsedFallback = false; const bmiSource = 'WHO';
    ${funkcja('erf')}
    ${funkcja('normalCDF')}
    ${funkcja('lmsNiemowleWiek')}
    ${funkcja('lmsNiemowle')}
    ${funkcja('getChildLMS')}
    ${funkcja('calcPercentileStats')}
    return { getChildLMS, calcPercentileStats, lmsNiemowle };
  `;
  return new Function('window', kod)(win);
}

const DNI_W_MIESIACU = 30.4375;

// Atrapa modułu daty urodzenia: dziecko w `dni` dobie życia, o `totalMonths` pełnych miesiącach.
function atrapa(dni, totalMonths) {
  return {
    readExactAge: () => ({ totalMonths, days: dni, exactMonths: dni / DNI_W_MIESIACU }),
  };
}

// Mediana WHO w danej dobie — z tych samych tablic, interpolowana niezależnie od kodu aplikacji,
// żeby „dziecko dokładnie na medianie" nie było definiowane przez testowaną funkcję.
function medianaWDobie(plec, metryka, dni) {
  const bez = silnik(null);
  const a = dni / DNI_W_MIESIACU;
  const lo = Math.floor(a);
  const dolny = bez.getChildLMS(plec, lo / 12, metryka);
  const gorny = bez.getChildLMS(plec, (lo + 1) / 12, metryka);
  return dolny[1] + (gorny[1] - dolny[1]) * (a - lo);
}

const PRZYPADKI = [
  ['M', 'HT', 'długość chłopców'],
  ['K', 'HT', 'długość dziewcząt'],
  ['M', 'WT', 'masa chłopców'],
  ['K', 'WT', 'masa dziewcząt'],
];

describe('Niemowlę na medianie WHO nie może wychodzić na 99. centylu', () => {
  it.each(PRZYPADKI)('%s/%s (%s): 29. doba, dziecko na medianie → centyl ~50', (plec, metryka) => {
    const mediana = medianaWDobie(plec, metryka, 29);

    // PRZED: wiersz ukończonego miesiąca (0 mies. = urodzenie) — bez daty urodzenia.
    const bezDaty = silnik(null).calcPercentileStats(mediana, plec, 0, metryka);
    expect(bezDaty.sd).toBeGreaterThan(1.5);

    // PO: ta sama mediana, ten sam wiek w pełnych miesiącach, ale z datą urodzenia.
    const zDataUr = silnik(atrapa(29, 0)).calcPercentileStats(mediana, plec, 0, metryka);
    expect(Math.abs(zDataUr.sd)).toBeLessThan(0.08);
    expect(zDataUr.percentile).toBeGreaterThan(46);
    expect(zDataUr.percentile).toBeLessThan(54);
  });

  it.each(PRZYPADKI)('%s/%s (%s): 59. doba też, nie tylko pierwszy miesiąc', (plec, metryka) => {
    const mediana = medianaWDobie(plec, metryka, 59);
    const bezDaty = silnik(null).calcPercentileStats(mediana, plec, 1 / 12, metryka);
    expect(bezDaty.sd).toBeGreaterThan(1.3);

    const zDataUr = silnik(atrapa(59, 1)).calcPercentileStats(mediana, plec, 1 / 12, metryka);
    expect(Math.abs(zDataUr.sd)).toBeLessThan(0.08);
  });
});

describe('Uściślenie tylko wtedy, gdy patrzymy na ten sam pomiar', () => {
  it('niezgodny wiek w pełnych miesiącach = brak uściślenia (rekord historyczny)', () => {
    // Dziecko ma dziś 14 miesięcy, ale liczymy centyl dla pomiaru sprzed roku (2 mies.).
    const zAtrapa = silnik(atrapa(430, 14)).getChildLMS('M', 2 / 12, 'HT');
    const bez = silnik(null).getChildLMS('M', 2 / 12, 'HT');
    expect(zAtrapa).toEqual(bez);
  });

  it('brak modułu daty urodzenia = zachowanie jak dotąd', () => {
    expect(silnik(null).getChildLMS('M', 0, 'HT')).toEqual([1, 49.8842, 0.03795]);
  });

  it('moduł bez readExactAge() nie wywraca obliczeń', () => {
    const kaleki = silnik({ version: '3' });
    expect(kaleki.getChildLMS('M', 0, 'HT')).toEqual([1, 49.8842, 0.03795]);
  });

  it('readExactAge() rzucające wyjątkiem nie wywraca obliczeń', () => {
    const wadliwy = silnik({ readExactAge: () => { throw new Error('sejf zamknięty'); } });
    expect(wadliwy.getChildLMS('M', 0, 'HT')).toEqual([1, 49.8842, 0.03795]);
  });
});

describe('Brzegi tablicy', () => {
  it('doba 0 trafia dokładnie w wiersz urodzeniowy, bez dryfu', () => {
    expect(silnik(atrapa(0, 0)).getChildLMS('M', 0, 'HT')).toEqual([1, 49.8842, 0.03795]);
  });

  it('ostatni wiersz niemowlęcy nie interpoluje w pustkę', () => {
    const wynik = silnik(atrapa(1080, 35)).getChildLMS('M', 35 / 12, 'HT');
    const wiersz35 = silnik(null).getChildLMS('M', 35 / 12, 'HT');
    expect(wynik).toEqual(wiersz35);
  });

  it('powyżej 36 miesięcy ścieżka pozostaje nietknięta', () => {
    const zAtrapa = silnik(atrapa(1200, 39)).getChildLMS('M', 39 / 12, 'HT');
    const bez = silnik(null).getChildLMS('M', 39 / 12, 'HT');
    expect(zAtrapa).toEqual(bez);
  });
});

describe('Interpolacja jest monotoniczna i mieści się między wierszami', () => {
  it('mediana rośnie z każdą dobą pierwszego miesiąca', () => {
    let poprzednia = -Infinity;
    for (let d = 0; d <= 30; d += 1) {
      const [, M] = silnik(atrapa(d, 0)).getChildLMS('M', 0, 'HT');
      expect(M).toBeGreaterThan(poprzednia);
      poprzednia = M;
    }
    expect(poprzednia).toBeLessThanOrEqual(54.7244);
  });
});
