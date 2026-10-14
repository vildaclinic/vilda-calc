import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { appSrc, funkcjaZ, oknoZSilnikiem, tablica, wczytajDoOkna, zrodlo } from '../support/silnik-bmi.mjs';

// P-WIEK-POMIARU-3 (polecenie właściciela 2026-10-14: „zajmij się pozostałymi miejscami w osobnym PR”).
// Domyka miejsca, które P-WIEK-POMIARU (#671) i P-WIEK-POMIARU-2 (#669) zostawiły poza zakresem:
//
// 1. Karta porównania, kolumna „Zmiana”: ΔSDS i werdykt pary liczyły oba punkty w pełnych miesiącach, choć
//    kolumny „Poprzednio” i „Dziś” pokazują centyle w wieku dokładnym. Noworodek na medianie WHO w 7. i 28. dobie
//    (oba punkty w 0. miesiącu) dostawał „szybką zmianę w krótkim oknie” wzrostu i „przekroczenie 97. centyla”
//    masy. Teraz model liczy SDS w wieku dokładnym; masa tylko na siatce WHO 0–35 mies., bo tak liczy ją formularz.
//    Ścieżka trajektorii (advHistoryGetChildLMSForSource) interpoluje masę WHO 0–35 mies. dla wieku ułamkowego,
//    jak rdzeń; wiek całkowity daje ten sam wiersz, co dotąd.
// 2. Siatka masy poniżej 3 lat przy OLAF (decyzja właściciela 2026-10-14): kolumna „Poprzednio”, kafelek Karty
//    i schowek liczyły masę na WHO 2006, formularz — na Palczewskiej. Teraz wszędzie Palczewska.
// 3. Przypadkowa zgodność bramki DOB-AGE-4: wzrost dla wieku kostnego dostaje jawne pełne miesiące.
//
// Funkcje są wycinane z plików produkcyjnych albo ładowane w całości; liczby BMI i Cole daje prawdziwy silnik.
// Dane FIKCYJNE.

const DNI = 30.4375;
const EA = 7 / DNI;
const EB = 28 / DNI;

function stubDocument() {
  return {
    getElementById: () => null, addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
    createElement() { return { style: {}, classList: { add() {}, contains() { return false; } }, appendChild() {} }; },
    body: { appendChild() {} },
  };
}

const zapisane = {};
beforeEach(() => { zapisane.document = globalThis.document; globalThis.document = stubDocument(); });
afterEach(() => { if (zapisane.document === undefined) delete globalThis.document; else globalThis.document = zapisane.document; });

const zaokr = (x) => Math.round(x * 1e9) / 1e9;

// ---------------------------------------------------------------------------------------------------------------
// 1. Model karty porównania
// ---------------------------------------------------------------------------------------------------------------

// Model na prawdziwych modułach tempa, trajektorii, BMI i kart. Statystykę wzrostu i masy (statFor → rdzeń
// advHistoryResolveMetric) podmieniamy rejestratorem: zapisuje wiek, o który pyta model, i oddaje siatkę.
function oknoModelu(siatkaDla) {
  const wywolania = [];
  const win = oknoZSilnikiem({ document: globalThis.document });
  win.advHistoryResolveMetric = (param, v, plec, wiekLat, zrodloSiatki) => {
    wywolania.push({ param, wiekMies: zaokr(wiekLat * 12), zrodlo: zrodloSiatki });
    return { result: { percentile: 50, sd: 0 }, source: siatkaDla(param) };
  };
  wczytajDoOkna(win, 'vilda_tempo_wzrastania.js');
  wczytajDoOkna(win, 'vilda_trajectory_analysis.js');
  wczytajDoOkna(win, 'vilda_summary_cards.js');
  return { win, wywolania };
}

// Chłopiec, pomiar w 7. dobie (51 cm, 3,61 kg), dziś 28. doba (54,3 cm, 4,38 kg) — oba punkty w 0. miesiącu.
const PREV = { sex: 'M', ageMonths: 0, wiekMies: EA, heightCm: 51, weightKg: 3.61 };
const CUR = { ageMonths: 0, wiekMies: EB, heightCm: 54.3, weightKg: 4.38 };
const OPT = { plec: 'M', zrodlo: 'WHO', dorosly: false, tanner: null };
const bmiZ = (kg, cm) => kg / Math.pow(cm / 100, 2);
const wiekiDla = (wywolania, param) => wywolania.filter((w) => w.param === param).map((w) => w.wiekMies);

describe('Karta porównania — kolumna „Zmiana” w wieku dokładnym obu pomiarów', () => {
  it('wzrost, BMI i Cole liczą się w wieku z doby poprzedniego pomiaru i w dzisiejszym wieku dokładnym; odstęp zostaje w pełnych miesiącach', () => {
    const { win, wywolania } = oknoModelu(() => 'WHO');
    const m = win.VildaSummaryCards.__porownanieZPoprzednim(PREV, CUR, OPT);
    expect(wiekiDla(wywolania, 'HT')).toEqual([zaokr(EA), zaokr(EB)]);
    const B = win.VildaBmi;
    const bmi = m.wiersze.find((w) => w.klucz === 'bmi');
    expect(bmi.sdsA).toBeCloseTo(B.ocen({ bmi: bmiZ(3.61, 51), plec: 'M', wiekMies: EA, zrodlo: 'WHO', dorosly: false }).sds, 12);
    expect(bmi.sdsB).toBeCloseTo(B.ocen({ bmi: bmiZ(4.38, 54.3), plec: 'M', wiekMies: EB, zrodlo: 'WHO', dorosly: false }).sds, 12);
    expect(Math.abs(bmi.sdsA - B.ocen({ bmi: bmiZ(3.61, 51), plec: 'M', wiekMies: 0, zrodlo: 'WHO', dorosly: false }).sds),
      'pełne miesiące dają inny wynik — test coś mierzy').toBeGreaterThan(0.1);
    const cole = m.wiersze.find((w) => w.klucz === 'cole');
    expect(cole.delta).toBeCloseTo(
      B.cole({ bmi: bmiZ(4.38, 54.3), plec: 'M', wiekMies: EB, zrodlo: 'WHO' }).cole - B.cole({ bmi: bmiZ(3.61, 51), plec: 'M', wiekMies: EA, zrodlo: 'WHO' }).cole, 9);
    expect(m.gapM, 'odstęp, tempo i kontekst werdyktu w pełnych miesiącach').toBe(0);
  });

  it('masa na siatce WHO 0–35 mies.: najpierw pełne miesiące (rozpoznanie siatki), potem wiek dokładny — jak formularz', () => {
    const { win, wywolania } = oknoModelu(() => 'WHO');
    win.VildaSummaryCards.__porownanieZPoprzednim(PREV, CUR, OPT);
    expect(wiekiDla(wywolania, 'WT')).toEqual([0, zaokr(EA), 0, zaokr(EB)]);
  });

  it.each(['PALCZEWSKA', 'OLAF', 'DS'])('masa na siatce %s zostaje w pełnych miesiącach, bo tak liczy ją formularz', (siatka) => {
    const { win, wywolania } = oknoModelu((param) => (param === 'WT' ? siatka : 'OLAF'));
    win.VildaSummaryCards.__porownanieZPoprzednim(PREV, CUR, { ...OPT, zrodlo: 'OLAF' });
    expect(wiekiDla(wywolania, 'WT')).toEqual([0, 0]);
    expect(wiekiDla(wywolania, 'HT'), 'wzrost i tak w wieku dokładnym').toEqual([zaokr(EA), zaokr(EB)]);
  });

  it('siatka WHO od 36. miesiąca: masa w pełnych miesiącach (tablice dziecięce liczą miesiące całkowite), wzrost w dokładnych', () => {
    const { win, wywolania } = oknoModelu(() => 'WHO');
    win.VildaSummaryCards.__porownanieZPoprzednim({ ...PREV, ageMonths: 40, wiekMies: 40.4 }, { ...CUR, ageMonths: 47, wiekMies: 47.3 }, OPT);
    expect(wiekiDla(wywolania, 'WT')).toEqual([40, 47]);
    expect(wiekiDla(wywolania, 'HT')).toEqual([40.4, 47.3]);
  });

  it('bez wieku dokładnego (albo z niepoprawnym) model liczy wszystko w pełnych miesiącach — jak przed zmianą', () => {
    for (const [p, c] of [
      [{ ...PREV, wiekMies: undefined }, { ...CUR, wiekMies: undefined }],
      [{ ...PREV, wiekMies: 'x' }, { ...CUR, wiekMies: Number.NaN }],
    ]) {
      const { win, wywolania } = oknoModelu(() => 'WHO');
      const m = win.VildaSummaryCards.__porownanieZPoprzednim(p, c, OPT);
      expect(wywolania.map((w) => w.wiekMies)).toEqual([0, 0, 0, 0]);
      expect(m.wiersze.find((w) => w.klucz === 'bmi').sdsA)
        .toBeCloseTo(win.VildaBmi.ocen({ bmi: bmiZ(3.61, 51), plec: 'M', wiekMies: 0, zrodlo: 'WHO', dorosly: false }).sds, 12);
    }
  });

  it('karta podaje modelowi oba wieki: poprzedni z rekordu (q → wiekMies), dzisiejszy z bramki formularza', () => {
    const src = zrodlo('vilda_summary_cards.js');
    expect(src, 'q() — wszystkie drogi budowy prevMeasurementInfo').toContain('i.wiekMies=Sw_wiekPomiaru(e,i.ageMonths),i}');
    expect(src).toContain('vildaPorownanieZPoprzednim({sex:t.sex,ageMonths:t.ageMonths,wiekMies:t.wiekMies,');
    expect(src).toContain('{ageMonths:A*12,wiekMies:Sw_wiekDzis(A),heightCm:l,');
  });

  it('dzisiejszy wiek dokładny to bramka DOB-AGE-4 formularza: lmsNiemowleWiek z pełnymi miesiącami, bez obiektu wieku pomiaru', () => {
    const wolania = [];
    const Sw = (zwrot) => new Function('lmsNiemowleWiek', `${funkcjaZ(zrodlo('vilda_summary_cards.js'), 'Sw_wiekDzis')}\nreturn Sw_wiekDzis;`)(
      (...a) => { wolania.push(a); return zwrot; });
    expect(Sw(0.92)(0)).toBe(0.92);
    expect(wolania[0], 'jeden argument — bramka, nie jawny wiek').toEqual([0]);
    expect(Sw(null)(9)).toBeNull();
    expect(wolania[1]).toEqual([108]);
    expect(Sw(5.2)(5 / 12)).toBe(5.2);
    expect(wolania[2]).toEqual([5]);
    expect(Sw(-1)(1), 'ujemny wiek odrzucony').toBeNull();
    expect(new Function(`${funkcjaZ(zrodlo('vilda_summary_cards.js'), 'Sw_wiekDzis')}\nreturn Sw_wiekDzis;`)()(1), 'bez app.js — null').toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 1b. Ścieżka trajektorii: masa WHO 0–35 mies. dla wieku ułamkowego
// ---------------------------------------------------------------------------------------------------------------

const TABLICE_MASY = ['LMS_INFANT_WEIGHT_BOYS', 'LMS_INFANT_WEIGHT_GIRLS', 'LMS_WEIGHT_BOYS', 'LMS_WEIGHT_GIRLS', 'LMS_WEIGHT_WHO_BOYS', 'LMS_WEIGHT_WHO_GIRLS'];

function sciezkaTrajektorii() {
  const kod = `
    ${TABLICE_MASY.map((n) => `const ${n}=${JSON.stringify(tablica(n))};`).join('\n')}
    function vildaPopulacjaDs(){return false}
    function vildaDsWiersz(){return null}
    ${funkcjaZ(appSrc, 'lmsNiemowleWiek')}
    ${funkcjaZ(appSrc, 'lmsNiemowle')}
    ${funkcjaZ(appSrc, 'advHistoryInterpolateLmsDataSet')}
    ${funkcjaZ(appSrc, 'advHistoryGetChildLMSForSource')}
    return advHistoryGetChildLMSForSource;`;
  return new Function('window', kod)({});
}

describe('advHistoryGetChildLMSForSource — masa WHO 0–35 mies. (ścieżka trajektorii i kolumny „Zmiana”)', () => {
  it('wiek całkowity: dokładnie ten sam wiersz, co dotąd (0–35 mies., obie płcie)', () => {
    const f = sciezkaTrajektorii();
    const tab = { M: tablica('LMS_INFANT_WEIGHT_BOYS'), F: tablica('LMS_INFANT_WEIGHT_GIRLS') };
    for (const plec of ['M', 'F']) {
      for (let m = 0; m < 36; m += 1) expect(f('WHO', plec, m / 12, 'WT'), `${plec} ${m} mies.`).toEqual(tab[plec][String(m)]);
    }
  });

  it('wiek ułamkowy: interpolacja L, M, S między sąsiednimi wierszami (lmsNiemowle, jak rdzeń), nie najbliższy wiersz', () => {
    const f = sciezkaTrajektorii();
    const tab = tablica('LMS_INFANT_WEIGHT_BOYS');
    for (const [wiek, dolny] of [[3.6, 3], [EB, 0], [0.4, 0], [34.5, 34]]) {
      // Wiek zaokrąglony do 0,001 mies. (0,03 doby) — jak silniki wzrostu i BMI na tej samej ścieżce.
      const ulamek = Math.round(wiek * 1e3) / 1e3 - dolny;
      const oczekiwane = tab[String(dolny)].map((x, k) => x + ulamek * (tab[String(dolny + 1)][k] - x));
      const wynik = f('WHO', 'M', wiek / 12, 'WT');
      wynik.forEach((v, k) => expect(v, `${wiek} mies., parametr ${k}`).toBeCloseTo(oczekiwane[k], 9));
    }
    expect(f('WHO', 'M', 3.6 / 12, 'WT'), 'dotąd: wiersz Math.round(3,6) = 4').not.toEqual(tab['4']);
  });

  it('bez zmian: OLAF i Palczewska poniżej 36 mies. (null — inna ścieżka), WHO od 36 mies. i wzrost', () => {
    const f = sciezkaTrajektorii();
    expect(f('OLAF', 'M', 2.5 / 12, 'WT')).toBeNull();
    expect(f('PALCZEWSKA', 'M', 2.5 / 12, 'WT')).toBeNull();
    expect(f('WHO', 'M', 40.4 / 12, 'WT')).toEqual(f('WHO', 'M', 40 / 12, 'WT'));
    expect(f('WHO', 'M', 3.6 / 12, 'HT')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 2. Siatka masy poniżej 3 lat przy OLAF: kolumna „Poprzednio”, kafelek Karty, schowek
// ---------------------------------------------------------------------------------------------------------------

describe('Masa poniżej 3 lat przy OLAF na Palczewskiej — jak formularz (decyzja właściciela 2026-10-14)', () => {
  // Atrapy rdzenia o rozpoznawalnych wynikach: WHO 2006 (rdzeń) → 51. centyl, Palczewska → 28. centyl.
  function karta(bmiSource) {
    const log = [];
    const En = new Function('calcPercentileStats', 'calcPercentileStatsPal', 'bmiSource', 'OLAF_DATA_MIN_AGE',
      `${funkcjaZ(zrodlo('vilda_auth_ui.js'), 'En')}\nreturn En;`)(
      (...a) => { log.push(['rdzen', ...a]); return { percentile: 51 }; },
      (...a) => { log.push(['pal', ...a]); return { percentile: 28 }; },
      bmiSource, 3);
    return { En, log };
  }

  it('Karta pacjenta (En): masa < 3 lat przy OLAF i przy Palczewskiej na Palczewskiej; WHO, 3 lata i wzrost przez rdzeń', () => {
    const w = { wiekMies: 24.2 };
    const { En, log } = karta('WHO');
    expect(En(12.2, 'M', 2, 'WT', 'OLAF', w).percentile).toBe(28);
    expect(En(12.2, 'M', 35 / 12, 'WT', 'OLAF', w).percentile).toBe(28);
    expect(En(12.2, 'M', 2, 'WT', 'PALCZEWSKA', w).percentile).toBe(28);
    expect(En(12.2, 'M', 2, 'WT', 'WHO', w).percentile, 'źródło zapisu WHO').toBe(51);
    expect(En(14, 'M', 3, 'WT', 'OLAF', w).percentile, '3 lata — siatki OLAF').toBe(51);
    expect(En(87, 'M', 2, 'HT', 'OLAF', w).percentile, 'wzrost zawsze przez rdzeń').toBe(51);
    expect(log.filter((l) => l[0] === 'pal').every((l) => l.length === 5), 'Palczewska masy bez wieku dokładnego (pełne miesiące)').toBe(true);
    expect(log.find((l) => l[0] === 'rdzen' && l[4] === 'WT')[5], 'rdzeń dostaje wiek pomiaru').toBe(w);
    expect(karta('OLAF').En(12.2, 'M', 2, 'WT', null, w).percentile, 'rekord bez źródła — bmiSource strony').toBe(28);
    expect(karta('WHO').En(12.2, 'M', 2, 'WT', null, w).percentile).toBe(51);
  });

  it('kolumna „Poprzednio” (Se): ta sama reguła na źródle zapisu (Sw_masaPal), masa przez nią', () => {
    const Sw = (zrodloZapisu, min) => new Function('bmiSource', 'OLAF_DATA_MIN_AGE',
      `${funkcjaZ(zrodlo('vilda_summary_cards.js'), 'Sw_masaPal')}\nreturn Sw_masaPal;`)(zrodloZapisu, min);
    expect(Sw('OLAF', 3)(2)).toBe(true);
    expect(Sw('OLAF', 3)(35 / 12)).toBe(true);
    expect(Sw('OLAF', 3)(3)).toBe(false);
    expect(Sw('PALCZEWSKA', 3)(10)).toBe(true);
    expect(Sw('WHO', 3)(1)).toBe(false);
    expect(Sw('OLAF', undefined)(1), 'bez stałej z app.js — tylko Palczewska z wyboru').toBe(false);
    expect(zrodlo('vilda_summary_cards.js')).toContain(
      'if(F!=null){const L=Sw_masaPal(r)&&typeof calcPercentileStatsPal=="function"?calcPercentileStatsPal(F,d,r,"WT"):typeof calcPercentileStats=="function"?calcPercentileStats(F,d,r,"WT",Po):null;');
  });

  function wierszeSchowka(zrodloDanych, user) {
    const win = oknoZSilnikiem({
      document: globalThis.document, professionalMode: false, bmiSource: zrodloDanych,
      calcPercentileStats() { return { percentile: 51, sd: 0.03 }; },
      calcPercentileStatsPal() { return { percentile: 28, sd: -0.59 }; },
      getPalCentile: () => 10,
      getChildLMS: () => [0.1, 12, 0.1],
    });
    loadBrowserScript('vilda_patient_summary_copy.js', win);
    const txt = win.VildaPatientSummaryCopy.buildSummaryTextFromPayload({ user, zscore: { dataSource: zrodloDanych } }, {});
    return String(txt).split('\n').map((s) => s.trim());
  }
  const centylWagi = (l) => {
    const m = /(\d+) centyl/.exec(l.find((s) => s.startsWith('Waga:')) || '');
    return m ? Number(m[1]) : null;
  };

  it('schowek: centyl masy dwulatka przy OLAF z Palczewskiej — tej samej siatki, co granice 3./97. c. tego wiersza', () => {
    const dwulatek = { sex: 'M', age: 2, ageMonths: 0, weight: 12.2, height: 87 };
    expect(centylWagi(wierszeSchowka('OLAF', dwulatek))).toBe(28);
    expect(centylWagi(wierszeSchowka('PALCZEWSKA', dwulatek))).toBe(28);
    expect(centylWagi(wierszeSchowka('WHO', dwulatek))).toBe(51);
    expect(centylWagi(wierszeSchowka('OLAF', { ...dwulatek, age: 3 })), '3 lata — rdzeń').toBe(51);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// 3. Przypadkowa zgodność bramki DOB-AGE-4: wiek kostny
// ---------------------------------------------------------------------------------------------------------------

describe('Wiek kostny to wiek odniesienia, nie wiek z formularza: jawne pełne miesiące', () => {
  it('wzrost dla wieku kostnego (karta zaawansowana → prognoza wzrostu ostatecznego)', () => {
    expect(zrodlo('vilda_advanced_growth.js')).toContain('heightSdsForBoneAge:(function(){try{if(isNaN(se)||se<=0||isNaN(V)||V<=0)return null;');
    expect(zrodlo('vilda_advanced_growth.js')).toContain('var hb=u(V,ae,se,"HT",{wiekMies:null});');
  });
});
