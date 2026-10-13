import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-WIEK-POMIARU (decyzja właściciela 2026-10-13, wariant B) — zapisany pomiar liczony w wieku z dnia
// TEGO pomiaru, nie w wieku dzisiejszym.
//
// ZNALEZISKO (P-POROWNANIE-W-TLE). Bramka tożsamości DOB-AGE-4 (`lmsNiemowleWiek` w app.js) uściśla
// wiek dokładnym wiekiem Z FORMULARZA, gdy pełne miesiące wołającego zgadzają się z pełnymi
// miesiącami dziś. Pomiar zapisany kilka dni wcześniej, w tym samym miesiącu życia, przechodzi
// przez bramkę i dostaje dzisiejszy wiek. Noworodek na medianie WHO zmierzony w 7. dobie, oglądany
// w 28. dobie: 4. centyl długości zamiast 50. Karta pacjenta liczyła tak nawet pacjenta innego niż
// ten w formularzu (data urodzenia z formularza).
//
// POPRAWKA. Rdzeń przyjmuje jawny wiek pomiaru `{wiekMies}` (liczba albo null) i wtedy nie sięga do
// formularza. Wiek z doby pomiaru liczy `vildaWiekPomiaruMies` regułą P-ODTWORZ-WIEK
// (`VildaDobAge.ageAtMeasurement`). Formularz — bez obiektu — działa jak dotąd.
//
// Funkcje są WYCINANE Z app.js, a moduł daty urodzenia ładowany w całości: mierzymy kod aplikacji,
// nie kopię reguły. Daty budujemy konstruktorem lokalnym (strefa testów: Pacific/Chatham). Dane FIKCYJNE.

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
  'LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_INFANT_WEIGHT_BOYS', 'LMS_INFANT_WEIGHT_GIRLS',
  'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS', 'LMS_WEIGHT_WHO_BOYS', 'LMS_WEIGHT_WHO_GIRLS',
  'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS', 'LMS_WEIGHT_BOYS', 'LMS_WEIGHT_GIRLS',
].map(tablica).join(';\n');

const silnikSrc = fs.readFileSync(path.join(korzen, 'vilda_sds_wzrostu.js'), 'utf8');

// Rdzeń app.js na prawdziwym silniku wzrostu i tablicach WHO; `dobAge` to moduł daty urodzenia
// (atrapa formularza albo prawdziwy moduł), `sdsSpy` podmienia silnik, gdy test sprawdza samo
// przekazanie wieku.
function rdzen({ dobAge = null, sdsSpy = null } = {}) {
  const win = dobAge ? { VildaDobAge: dobAge } : {};
  if (sdsSpy) {
    win.VildaSdsWzrostu = sdsSpy;
  } else {
    win.VildaWzrostLMS = {};
    for (const n of ['LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS', 'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS']) {
      win.VildaWzrostLMS[n] = new Function(`${tablica(n)}; return ${n};`)();
    }
    new Function('window', 'globalThis', silnikSrc)(win, win);
  }
  const kod = `
    ${TABLICE};
    let weightUsedFallback = false; const bmiSource = 'WHO';
    ${funkcja('erf')}
    ${funkcja('normalCDF')}
    ${funkcja('lmsNiemowleWiek')}
    ${funkcja('vildaWiekPomiaruMies')}
    ${funkcja('lmsNiemowle')}
    ${funkcja('vildaDsTablica')}${funkcja('vildaPopulacjaDs')}${funkcja('vildaDsWiersz')}${funkcja('getChildLMS')}
    ${funkcja('calcPercentileStats')}
    ${funkcja('calcPercentileStatsPal')}
    return { getChildLMS, calcPercentileStats, calcPercentileStatsPal, lmsNiemowleWiek, vildaWiekPomiaruMies };
  `;
  return new Function('window', kod)(win);
}

const DNI_W_MIESIACU = 30.4375;

// Formularz z datą urodzenia: dziecko DZIŚ w `dni` dobie życia, o `totalMonths` pełnych miesiącach.
function formularzDzis(dni, totalMonths) {
  return { readExactAge: () => ({ totalMonths, days: dni, exactMonths: dni / DNI_W_MIESIACU }) };
}

// Mediana WHO w danej dobie z tych samych tablic, interpolowana niezależnie od testowanego kodu.
function medianaWDobie(plec, metryka, dni) {
  const bez = rdzen();
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

describe('Rdzeń: jawny wiek pomiaru wyłącza bramkę formularza', () => {
  it.each(PRZYPADKI)('%s/%s (%s): pomiar z 7. doby oglądany w 28. dobie — centyl z 7. doby, nie z dzisiejszej', (plec, metryka) => {
    const mediana = medianaWDobie(plec, metryka, 7);
    const dzis = rdzen({ dobAge: formularzDzis(28, 0) });

    // Bramka (bez obiektu): pomiar dostaje dzisiejszy wiek z formularza — zaniżony centyl.
    const brama = dzis.calcPercentileStats(mediana, plec, 0, metryka);
    expect(brama.sd, 'bez poprawki dzisiejszy wiek zaniża wynik').toBeLessThan(-0.9);

    // Jawny wiek pomiaru: ten sam formularz, ale wiek z doby pomiaru.
    const jawny = dzis.calcPercentileStats(mediana, plec, 0, metryka, { wiekMies: 7 / DNI_W_MIESIACU });
    expect(Math.abs(jawny.sd)).toBeLessThan(0.08);
    expect(jawny.percentile).toBeGreaterThan(46);
    expect(jawny.percentile).toBeLessThan(54);
  });

  it.each(PRZYPADKI)('%s/%s (%s): jawne null = pełne miesiące pomiaru, jak bez daty urodzenia — nigdy dzisiejszy wiek', (plec, metryka) => {
    const mediana = medianaWDobie(plec, metryka, 7);
    const nullowy = rdzen({ dobAge: formularzDzis(28, 0) }).calcPercentileStats(mediana, plec, 0, metryka, { wiekMies: null });
    const bezDaty = rdzen().calcPercentileStats(mediana, plec, 0, metryka);
    expect(nullowy.sd).toBeCloseTo(bezDaty.sd, 12);
  });

  it('bez obiektu formularz działa jak dotąd: bieżący pomiar uściślony dzisiejszym wiekiem (DOB-AGE-4)', () => {
    const mediana = medianaWDobie('M', 'HT', 29);
    const biezacy = rdzen({ dobAge: formularzDzis(29, 0) }).calcPercentileStats(mediana, 'M', 0, 'HT');
    expect(Math.abs(biezacy.sd)).toBeLessThan(0.08);
    expect(rdzen().calcPercentileStats(mediana, 'M', 0, 'HT').sd, 'bez daty — wiersz urodzeniowy').toBeGreaterThan(1.5);
  });

  it('getChildLMS z jawnym wiekiem interpoluje w wieku pomiaru niezależnie od formularza', () => {
    const wzor = rdzen({ dobAge: formularzDzis(7, 0) }).getChildLMS('M', 0, 'WT');
    const jawny = rdzen({ dobAge: formularzDzis(28, 0) }).getChildLMS('M', 0, 'WT', { wiekMies: 7 / DNI_W_MIESIACU });
    expect(jawny).toEqual(wzor);
    expect(rdzen({ dobAge: formularzDzis(28, 0) }).getChildLMS('M', 0, 'WT', { wiekMies: null })).toEqual(rdzen().getChildLMS('M', 0, 'WT'));
  });

  it('bramka: obiekt z polem wiekMies ma pierwszeństwo, zły wiek = pełne miesiące, obiekt bez pola = bramka', () => {
    const r = rdzen({ dobAge: formularzDzis(28, 0) });
    expect(r.lmsNiemowleWiek(0, { wiekMies: 0.5 })).toBe(0.5);
    expect(r.lmsNiemowleWiek(0, { wiekMies: null })).toBeNull();
    expect(r.lmsNiemowleWiek(0, { wiekMies: -1 })).toBeNull();
    expect(r.lmsNiemowleWiek(0, { wiekMies: Number.NaN })).toBeNull();
    expect(r.lmsNiemowleWiek(0, { wiekMies: '0.5' })).toBeNull();
    expect(r.lmsNiemowleWiek(0, {})).toBeCloseTo(28 / DNI_W_MIESIACU, 12);
    expect(r.lmsNiemowleWiek(0)).toBeCloseTo(28 / DNI_W_MIESIACU, 12);
  });

  it('Palczewska, wzrost: silnik dostaje jawny wiek ułamkowy; bez niego pełne miesiące, masa bez zmian', () => {
    const wywolania = [];
    const spy = {
      policzNaSiatce: (a) => { wywolania.push(a); return { centyl: 50, sds: 0 }; },
      policz: () => ({ centyl: 50, sds: 0 }),
    };
    const r = rdzen({ dobAge: formularzDzis(80, 2), sdsSpy: spy });
    r.calcPercentileStatsPal(60, 'M', 2 / 12, 'HT', { wiekMies: 2.3 });
    r.calcPercentileStatsPal(60, 'M', 2 / 12, 'HT', { wiekMies: null });
    r.calcPercentileStatsPal(60, 'M', 2 / 12, 'HT');
    expect(wywolania.map((w) => w.wiekMies)).toEqual([2.3, 2, 2]);
    expect(wywolania.every((w) => w.siatka === 'PALCZEWSKA')).toBe(true);
  });
});

// Prawdziwy moduł daty urodzenia na atrapie DOM (jak w odtworzenie-wiek-pomiaru.test.mjs), bez wczytanego rekordu.
function modulDaty() {
  const win = {
    document: { readyState: 'complete', getElementById: () => null, addEventListener: () => {} },
    Event: function (typ) { this.type = typ; },
    setTimeout: (f) => f(),
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  loadBrowserScript('vilda_dob_age.js', win);
  return win.VildaDobAge;
}

// Rekord tak, jak zapisuje go formularz główny: wiek z chwili zapisu, data pomiaru, chwila zapisu.
function rekord(user, timestampISO = new Date(2026, 4, 27, 15, 0).toISOString()) {
  return { version: 1, timestampISO, user: { sex: 'M', weight: 3.6, height: 51, ...user } };
}

describe('vildaWiekPomiaruMies — wiek z doby zapisanego pomiaru (reguła P-ODTWORZ-WIEK)', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('data urodzenia i data pomiaru rekordu → doby życia w dniu pomiaru / 30,4375 (nigdy dziś)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 17, 12, 0)); // „dziś" 17-06-2026 = 28. doba
    const r = rdzen({ dobAge: modulDaty() });
    const rek = rekord({ dobISO: '2026-05-20', measuredAtISO: '2026-05-27', age: 0, ageMonths: 0, ageWeeks: 1 });
    expect(r.vildaWiekPomiaruMies(rek, null, 0)).toBeCloseTo(7 / DNI_W_MIESIACU, 12);
  });

  it('pełne miesiące widoku niezgodne z wiekiem pomiaru → null (pełne miesiące, bez zgadywania)', () => {
    const r = rdzen({ dobAge: modulDaty() });
    const rek = rekord({ dobISO: '2026-05-20', measuredAtISO: '2026-05-27', age: 0, ageMonths: 0 });
    expect(r.vildaWiekPomiaruMies(rek, null, 1)).toBeNull();
    expect(r.vildaWiekPomiaruMies(rek, null, 0)).not.toBeNull();
  });

  it('data urodzenia z rekordu ma pierwszeństwo; zapas wołającego tylko przy rekordzie bez daty', () => {
    const r = rdzen({ dobAge: modulDaty() });
    const zData = rekord({ dobISO: '2026-05-20', measuredAtISO: '2026-05-27', age: 0, ageMonths: 0 });
    // Inna data w zapasie (np. formularz innego pacjenta) nie zmienia wyniku.
    expect(r.vildaWiekPomiaruMies(zData, '2026-05-10', 0)).toBeCloseTo(7 / DNI_W_MIESIACU, 12);
    const bezDaty = rekord({ measuredAtISO: '2026-05-27', age: 0, ageMonths: 0 });
    expect(r.vildaWiekPomiaruMies(bezDaty, null, 0), 'bez daty urodzenia nie ma dokładnego wieku').toBeNull();
    expect(r.vildaWiekPomiaruMies(bezDaty, '2026-05-20', 0)).toBeCloseTo(7 / DNI_W_MIESIACU, 12);
  });

  it('bez daty pomiaru doba z chwili zapisu — tylko gdy zgadza się z zapisanym wiekiem i tygodniami', () => {
    const r = rdzen({ dobAge: modulDaty() });
    const zgodny = rekord({ dobISO: '2026-05-20', age: 0, ageMonths: 0, ageWeeks: 1 }, new Date(2026, 4, 27, 15, 0).toISOString());
    expect(r.vildaWiekPomiaruMies(zgodny, null, 0)).toBeCloseTo(7 / DNI_W_MIESIACU, 12);
    // Ponowny zapis starym kodem: chwila zapisu przesunięta o 3 tygodnie, tygodnie z dnia pomiaru (1).
    const przesuniety = rekord({ dobISO: '2026-05-20', age: 0, ageMonths: 0, ageWeeks: 1 }, new Date(2026, 5, 17, 15, 0).toISOString());
    expect(r.vildaWiekPomiaruMies(przesuniety, null, 0), 'niepewna doba — bez zgadywania').toBeNull();
  });

  it('brak modułu, moduł bez ageAtMeasurement albo wyjątek → null; brak rekordu → null', () => {
    expect(rdzen().vildaWiekPomiaruMies(rekord({ dobISO: '2026-05-20', measuredAtISO: '2026-05-27', age: 0, ageMonths: 0 }), null, 0)).toBeNull();
    expect(rdzen({ dobAge: { readExactAge: () => null } }).vildaWiekPomiaruMies(rekord({ dobISO: '2026-05-20' }), null, 0)).toBeNull();
    const wadliwy = { ageAtMeasurement: () => { throw new Error('awaria'); }, exactMonthsFromDays: (d) => d / DNI_W_MIESIACU };
    expect(rdzen({ dobAge: wadliwy }).vildaWiekPomiaruMies(rekord({ dobISO: '2026-05-20' }), null, 0)).toBeNull();
    expect(rdzen({ dobAge: modulDaty() }).vildaWiekPomiaruMies(null, '2026-05-20', 0)).toBeNull();
  });

  it('cały łańcuch: rekord z 7. doby, formularz w 28. dobie → centyl z 7. doby', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 17, 12, 0));
    const D = modulDaty();
    const formularz = { ...D, readExactAge: () => ({ totalMonths: 0, days: 28, exactMonths: 28 / DNI_W_MIESIACU }) };
    const r = rdzen({ dobAge: formularz });
    const mediana = medianaWDobie('M', 'HT', 7);
    const rek = rekord({ dobISO: '2026-05-20', measuredAtISO: '2026-05-27', age: 0, ageMonths: 0, height: mediana });
    const wiek = r.vildaWiekPomiaruMies(rek, null, 0);
    const wynik = r.calcPercentileStats(mediana, 'M', 0, 'HT', { wiekMies: wiek });
    expect(Math.round(wynik.percentile)).toBe(50);
    expect(Math.round(r.calcPercentileStats(mediana, 'M', 0, 'HT').percentile), 'bramka bez poprawki').toBeLessThan(10);
  });
});

// Schowek („Skopiuj podsumowanie wyników”) — podłączenie: każda liczba zapisanego pomiaru dostaje ten sam jawny wiek.
// Atrapy rdzenia notują argumenty; liczby same w sobie są tu nieistotne (mierzy je spec e2e).
function schowekZAtrapami(wiekPomiaru) {
  const w = { cps: [], lms: [], bmi: [], cole: [], granicaWzrostu: [], wiekPomiaru: [] };
  const win = {
    professionalMode: true,
    bmiSource: 'OLAF',
    vildaWiekPomiaruMies(rek, iso, pelne) { w.wiekPomiaru.push({ rek, iso, pelne }); return wiekPomiaru; },
    calcPercentileStats(value, sex, ageYears, kind, wp) { w.cps.push({ value, kind, ageYears, wp }); return { percentile: 50, sd: 0 }; },
    getChildLMS(sex, ageYears, kind, wp) { w.lms.push({ kind, ageYears, wp }); return [1, 3.5, 0.13]; },
    vildaMpSdsStats() { return { percentile: 50, sd: 0.1 }; },
    VildaSdsWzrostu: { wartoscDlaSds(a) { w.granicaWzrostu.push(a.wiekMies); return { wzrost: 50 }; } },
    VildaBmi: {
      ocen(a) { w.bmi.push(a.wiekMies); return { centyl: 50, sds: 0, kategoria: {} }; },
      cole(a) { w.cole.push(a.wiekMies); return { cole: 100 }; },
      fmtSds: (x) => String(x),
    },
  };
  loadBrowserScript('vilda_patient_summary_copy.js', win);
  return { win, w };
}

const REKORD_SCHOWKA = {
  zscore: { dataSource: 'WHO' },
  user: { sex: 'M', age: 0, ageMonths: 0, weight: 3.61, height: 51, dobISO: '2026-05-20', measuredAtISO: '2026-05-27' },
  advanced: { data: { targetHeight: 176 } },
};

describe('Schowek: masa, wzrost, granica masy, BMI, Cole i hSDS − mpSDS w jednym wieku pomiaru', () => {
  it('wiek z doby pomiaru trafia do każdej liczby zapisanego pomiaru; granica wzrostu jak w formularzu (pełne miesiące)', () => {
    const { win, w } = schowekZAtrapami(0.23);
    const tekst = win.VildaPatientSummaryCopy.buildSummaryTextFromPayload(REKORD_SCHOWKA, {});
    expect(tekst).toMatch(/Wzrost:/);
    expect(w.wiekPomiaru, 'wiek liczony z rekordu, bez daty z formularza, dla pełnych miesięcy rekordu').toEqual([{ rek: REKORD_SCHOWKA, iso: null, pelne: 0 }]);
    const pomiar = w.cps.filter((c) => c.value === 3.61 || c.value === 51);
    expect(pomiar.map((c) => c.kind).sort(), 'masa, wzrost i hSDS do mpSDS').toEqual(['HT', 'HT', 'WT']);
    for (const c of pomiar) expect(c.wp, c.kind).toEqual({ wiekMies: 0.23 });
    expect(w.lms.length, 'granice masy (3. i 97. centyl)').toBe(2);
    for (const c of w.lms) expect(c.wp).toEqual({ wiekMies: 0.23 });
    expect(w.bmi).toEqual([0.23]);
    expect(w.cole).toEqual([0.23]);
    expect(w.granicaWzrostu, 'granica wzrostu w pełnych miesiącach, jak w formularzu').toEqual([0, 0]);
  });

  it('bez dokładnego wieku pomiaru: jawne null (pełne miesiące rekordu), BMI i Cole w pełnych miesiącach', () => {
    const { win, w } = schowekZAtrapami(null);
    win.VildaPatientSummaryCopy.buildSummaryTextFromPayload({ ...REKORD_SCHOWKA, user: { ...REKORD_SCHOWKA.user, age: 4, ageMonths: 2 } }, {});
    const pomiar = w.cps.filter((c) => c.value === 3.61 || c.value === 51);
    expect(pomiar.length).toBe(3);
    for (const c of pomiar) expect(c.wp, c.kind).toEqual({ wiekMies: null });
    expect(w.bmi).toEqual([50]);
    expect(w.cole).toEqual([50]);
  });
});
