import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// P-WIEK-POMIARU (polecenie właściciela 2026-10-13): pomiar zapisany liczy się w SWOIM wieku.
//
// ZNALEZISKO. `calcPercentileStats` (wzrost w każdym wieku, masa poniżej 36 mies.) uściślał wiek
// przez `lmsNiemowleWiek`, czyli dokładnym wiekiem pomiaru z FORMULARZA, gdy tylko zgadzały się
// pełne miesiące (bramka tożsamości DOB-AGE-4). Dostawały go więc:
//   • poprzedni pomiar sprzed kilku tygodni z tego samego miesiąca życia (karta porównania),
//   • pomiar INNEGO pacjenta w Karcie Pacjenta (kafelki, schowek),
//   • punkty GH, próbki krzywych odniesienia, wiersze wsadu, odniesienie 18 lat.
// U niemowlęcia różnica kilku dób to kilkadziesiąt centyli (DOB-AGE-4).
//
// POPRAWKA. Wołający, który liczy coś innego niż pomiar z formularza, podaje wiek TEGO pomiaru
// jawnie (piąty argument): liczba = dokładny wiek z daty urodzenia i doby pomiaru zapisanych
// w rekordzie (`vildaWiekPomiaruMies`, reguła P-ODTWORZ-WIEK), null = pełne miesiące.
//
// Funkcje są WYCINANE Z app.js i uruchamiane wprost, z prawdziwym silnikiem wzrostu
// (vilda_sds_wzrostu.js) i prawdziwym modułem daty (vilda_dob_age.js) — mierzymy zachowanie
// aplikacji, nie kopię reguły. Dane wyłącznie FIKCYJNE.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const czytaj = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');
const src = czytaj('app.js');

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

const silnikSrc = czytaj('vilda_sds_wzrostu.js');

// Rdzeń app.js na podanym oknie (z modułem daty albo bez). Źródło WHO — mierzymy interpolację WHO 2006,
// jak test DOB-AGE-4 (tests/unit/centyle-niemowlece-interpolacja.test.mjs).
function rdzen(win = {}) {
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
    ${funkcja('vildaWiekPomiaruMies')}
    ${funkcja('lmsNiemowle')}
    ${funkcja('vildaDsTablica')}${funkcja('vildaPopulacjaDs')}${funkcja('vildaDsWiersz')}${funkcja('getChildLMS')}
    ${funkcja('calcPercentileStats')}
    return { getChildLMS, calcPercentileStats, lmsNiemowleWiek, vildaWiekPomiaruMies };
  `;
  return { ...new Function('window', kod)(win), win };
}

const DNI_W_MIESIACU = 30.4375;

// Formularz z datą urodzenia dziecka w `dni` dobie życia — tak, jak widzi go lmsNiemowleWiek.
const formularz = (dni, totalMonths) => ({
  readExactAge: () => ({ totalMonths, days: dni, exactMonths: dni / DNI_W_MIESIACU }),
});

// Prawdziwy vilda_dob_age.js; pole daty urodzenia formularza opcjonalne (`dobPole` w formacie DD-MM-RRRR).
function modulDaty(dobPole = null) {
  const pola = {};
  if (dobPole) pola.dobInput = { id: 'dobInput', value: dobPole, addEventListener() {}, dataset: {}, classList: { toggle() {} } };
  const win = {
    document: { readyState: 'loading', getElementById: (id) => pola[id] || null, addEventListener() {} },
    setTimeout: (f) => f(),
  };
  loadBrowserScript('vilda_dob_age.js', win);
  return win;
}

// Mediana WHO w danej dobie — z tych samych tablic, liczona niezależnie od testowanej ścieżki.
function medianaWDobie(plec, metryka, dni) {
  const bez = rdzen().getChildLMS;
  const a = dni / DNI_W_MIESIACU;
  const lo = Math.floor(a);
  const dolny = bez(plec, lo / 12, metryka);
  const gorny = bez(plec, (lo + 1) / 12, metryka);
  return dolny[1] + (gorny[1] - dolny[1]) * (a - lo);
}

// Chłopiec urodzony 2026-05-01. Poprzedni pomiar 2026-05-11 (10. doba, 0 pełnych miesięcy),
// zapisany z formularza z datą urodzenia: data pomiaru i wiek w rekordzie.
const REKORD_10_DOBA = (metryka, wartosc) => ({
  timestampISO: '2026-05-11T09:00:00.000Z',
  user: {
    sex: 'M', age: 0, ageMonths: 0, dobISO: '2026-05-01', measuredAtISO: '2026-05-11',
    ...(metryka === 'HT' ? { height: wartosc } : { weight: wartosc }),
  },
});

afterEach(() => { vi.useRealTimers(); });
const dzis = (r, m, d) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(r, m - 1, d, 12, 0)); };

describe('Pomiar zapisany nie dostaje dokładnego wieku pomiaru z formularza (ustalenie 1)', () => {
  it.each([['HT', 'długość'], ['WT', 'masa']])('%s (%s): pomiar z 10. doby oglądany w 25. dobie — przed: dzisiejsza doba, po: jego własna', (metryka) => {
    dzis(2026, 5, 26);
    const wartosc = medianaWDobie('M', metryka, 10);
    const formularz25 = rdzen({ VildaDobAge: formularz(25, 0) });

    // PRZED: bez jawnego wieku pomiar z 10. doby liczony w 25. dobie (dziecko z formularza).
    const przed = formularz25.calcPercentileStats(wartosc, 'M', 0, metryka);
    expect(przed.sd, 'zmierzony błąd: mediana 10. doby wychodzi dużo poniżej mediany').toBeLessThan(-0.9);

    // PO: wiek z rekordu — 10. doba — i centyl mediany.
    const modul = modulDaty();
    const zRekordu = rdzen({ VildaDobAge: modul.VildaDobAge });
    const w = zRekordu.vildaWiekPomiaruMies(REKORD_10_DOBA(metryka, wartosc), 0, null);
    expect(w).toBeCloseTo(10 / DNI_W_MIESIACU, 9);
    const po = formularz25.calcPercentileStats(wartosc, 'M', 0, metryka, w);
    expect(Math.abs(po.sd)).toBeLessThan(0.08);
    expect(po.percentile).toBeGreaterThan(46);
    expect(po.percentile).toBeLessThan(54);
  });

  it('jawny wiek wyłącza formularz całkowicie — ta sama liczba bez daty, z 3. i z 25. dobą w formularzu', () => {
    const wartosc = medianaWDobie('M', 'HT', 10);
    const w = 10 / DNI_W_MIESIACU;
    const wyniki = [rdzen(), rdzen({ VildaDobAge: formularz(3, 0) }), rdzen({ VildaDobAge: formularz(25, 0) })]
      .map((r) => r.calcPercentileStats(wartosc, 'M', 0, 'HT', w).sd);
    expect(wyniki[1]).toBe(wyniki[0]);
    expect(wyniki[2]).toBe(wyniki[0]);
    expect(rdzen({ VildaDobAge: formularz(25, 0) }).getChildLMS('M', 0, 'WT', w))
      .toEqual(rdzen().getChildLMS('M', 0, 'WT', w));
  });

  it('null = wieku dokładnego nie znamy: pełne miesiące, także gdy formularz ma tę samą dobę miesiąca', () => {
    const wartosc = medianaWDobie('M', 'HT', 10);
    const bezDaty = rdzen().calcPercentileStats(wartosc, 'M', 0, 'HT');
    const jawnieNull = rdzen({ VildaDobAge: formularz(25, 0) }).calcPercentileStats(wartosc, 'M', 0, 'HT', null);
    expect(jawnieNull.sd).toBe(bezDaty.sd);
    expect(rdzen({ VildaDobAge: formularz(25, 0) }).getChildLMS('M', 0, 'WT', null))
      .toEqual(rdzen().getChildLMS('M', 0, 'WT'));
  });

  it('niepoprawny jawny wiek (NaN, ujemny) liczy się jak null — nigdy jak formularz', () => {
    const r = rdzen({ VildaDobAge: formularz(25, 0) });
    expect(r.lmsNiemowleWiek(0, NaN)).toBeNull();
    expect(r.lmsNiemowleWiek(0, -1)).toBeNull();
    expect(r.lmsNiemowleWiek(0, null)).toBeNull();
    expect(r.lmsNiemowleWiek(0, 0.25)).toBe(0.25);
  });
});

describe('Pomiar z formularza bez zmian (DOB-AGE-4)', () => {
  it('bez piątego argumentu formularz nadal uściśla swój pomiar: 29. doba na medianie → ~50. centyl', () => {
    const wartosc = medianaWDobie('M', 'HT', 29);
    const r = rdzen({ VildaDobAge: formularz(29, 0) }).calcPercentileStats(wartosc, 'M', 0, 'HT');
    expect(Math.abs(r.sd)).toBeLessThan(0.08);
  });

  it('bramka tożsamości jak dotąd: inny pełny miesiąc = wiersz ukończonego miesiąca', () => {
    expect(rdzen({ VildaDobAge: formularz(430, 14) }).getChildLMS('M', 2 / 12, 'HT'))
      .toEqual(rdzen().getChildLMS('M', 2 / 12, 'HT'));
  });

  it('powyżej 36 mies. jawny wiek idzie do silnika wprost (chłopiec 109,4 mies., WHO)', () => {
    const r = rdzen();
    const wynik = r.calcPercentileStats(135, 'M', 109 / 12, 'HT', 109.4);
    const silnik = r.win.VildaSdsWzrostu.policz({ wzrost: 135, plec: 'M', wiekMies: 109.4, zrodlo: 'WHO' });
    expect(wynik.sd).toBe(silnik.sds);
    expect(wynik.sd).not.toBe(r.calcPercentileStats(135, 'M', 109 / 12, 'HT', null).sd);
  });
});

describe('vildaWiekPomiaruMies — wiek pomiaru z rekordu, nigdy z formularza ani z dzisiejszej daty', () => {
  it('data urodzenia i data pomiaru w rekordzie → wiek ułamkowy tamtej doby', () => {
    dzis(2026, 5, 26);
    const r = rdzen({ VildaDobAge: modulDaty().VildaDobAge });
    expect(r.vildaWiekPomiaruMies(REKORD_10_DOBA('HT', 51), 0, null)).toBeCloseTo(10 / DNI_W_MIESIACU, 9);
  });

  it('formularz z datą urodzenia INNEGO pacjenta nie zmienia wyniku (ustalenie 2)', () => {
    dzis(2026, 5, 26);
    const bezFormularza = rdzen({ VildaDobAge: modulDaty().VildaDobAge });
    const zInnymPacjentem = rdzen({ VildaDobAge: modulDaty('06-05-2026').VildaDobAge });
    const rek = REKORD_10_DOBA('HT', 51);
    expect(zInnymPacjentem.vildaWiekPomiaruMies(rek, 0, null)).toBe(bezFormularza.vildaWiekPomiaruMies(rek, 0, null));
  });

  it('rekord bez doby pomiaru → null (pełne miesiące); nie bierzemy dzisiejszej daty', () => {
    dzis(2026, 5, 26);
    const r = rdzen({ VildaDobAge: modulDaty().VildaDobAge });
    const bezDoby = { user: { sex: 'M', age: 0, ageMonths: 0, dobISO: '2026-05-01', height: 51 } };
    expect(r.vildaWiekPomiaruMies(bezDoby, 0, null)).toBeNull();
  });

  it('doba nie daje zapisanego wieku (ręcznie wpisany wiek) → null', () => {
    dzis(2026, 5, 26);
    const r = rdzen({ VildaDobAge: modulDaty().VildaDobAge });
    const rek = { timestampISO: '2026-05-11T09:00:00.000Z', user: { sex: 'M', age: 0, ageMonths: 1, dobISO: '2026-05-01', height: 51 } };
    expect(r.vildaWiekPomiaruMies(rek, 1, null)).toBeNull();
  });

  it('wiek wołającego inny niż wiek rekordu → null (nie mieszamy dwóch pomiarów)', () => {
    dzis(2026, 5, 26);
    const r = rdzen({ VildaDobAge: modulDaty().VildaDobAge });
    expect(r.vildaWiekPomiaruMies(REKORD_10_DOBA('HT', 51), 1, null)).toBeNull();
    expect(r.vildaWiekPomiaruMies(REKORD_10_DOBA('HT', 51), undefined, null)).toBeNull();
  });

  it('rekord bez daty urodzenia: data urodzenia pacjenta podana przez wołającego, przy pewnej dobie pomiaru', () => {
    dzis(2026, 5, 26);
    const r = rdzen({ VildaDobAge: modulDaty().VildaDobAge });
    const rek = { user: { sex: 'M', age: 0, ageMonths: 0, measuredAtISO: '2026-05-11', height: 51 } };
    expect(r.vildaWiekPomiaruMies(rek, 0, null)).toBeNull();
    expect(r.vildaWiekPomiaruMies(rek, 0, '2026-05-01')).toBeCloseTo(10 / DNI_W_MIESIACU, 9);
  });

  it('bez modułu daty urodzenia → null', () => {
    expect(rdzen().vildaWiekPomiaruMies(REKORD_10_DOBA('HT', 51), 0, null)).toBeNull();
  });

  it('pomiar z dziś (przypadek P-POROWNANIE-DATA): wiek z rekordu = wiek z formularza', () => {
    dzis(2026, 6, 17);
    const modul = modulDaty('05-05-2017');
    const r = rdzen({ VildaDobAge: modul.VildaDobAge });
    const zFormularza = modul.VildaDobAge.readExactAge();
    const rek = { timestampISO: '2026-06-17T01:00:00.000Z', user: { sex: 'M', age: 9, ageMonths: 1, dobISO: '2017-05-05', measuredAtISO: '2026-06-17', height: 135 } };
    expect(zFormularza.totalMonths).toBe(109);
    expect(r.vildaWiekPomiaruMies(rek, 109, null)).toBeCloseTo(zFormularza.exactMonths, 9);
  });
});

/* Wołający: każde miejsce, które liczy coś innego niż pomiar z formularza, podaje wiek jawnie. */
describe('Strażnik źródła: miejsca liczące pomiar zapisany podają wiek pomiaru jawnie', () => {
  const MIEJSCA = {
    'vilda_summary_cards.js': [
      'wP=typeof vildaWiekPomiaruMies=="function"?vildaWiekPomiaruMies(e,l,null):null',
      'calcPercentileStats(A,d,r,"HT",wP)',
      'calcPercentileStats(F,d,r,"WT",wP)',
      'T0.ocen({bmi:p,plec:d,wiekMies:wP!=null?wP:l,zrodlo:Z0})',
      'T0.cole({bmi:p,plec:d,wiekMies:wP!=null?wP:l,zrodlo:Z0})',
      'ee(F,A,d,wP!=null?wP:l)',
    ],
    'vilda_auth_ui.js': [
      'function En(t,a,n,r,o,w){',
      'calcPercentileStats(t,a,n,r,w)',
      'wP=h!=="PALCZEWSKA"&&I!=null&&typeof i.vildaWiekPomiaruMies=="function"?i.vildaWiekPomiaruMies(s,I,null):null',
      'En(D,it,ht,"HT",h,wP)',
      'En(M,it,ht,"WT",h,wP)',
      'Tb.ocen({bmi:$,plec:it,wiekMies:wP!=null?wP:I,zrodlo:h})',
      'Tb.cole({bmi:$,plec:it,wiekMies:wP!=null?wP:I,zrodlo:h})',
      'En(t,a,n,"HT",r,null)',
      'En(rt,S,18,"HT",h,null)',
      'i.getChildLMS(g,E/12,"HT",null)',
      'i.getChildLMS(g,E/12,"WT",null)',
    ],
    'vilda_patient_summary_copy.js': [
      'function I(e,f,o,C,n,w){',
      't.calcPercentileStats(e,f,o,C,w)',
      'wP=u!=="PALCZEWSKA"&&r("vildaWiekPomiaruMies")?t.vildaWiekPomiaruMies(e,N,null):null',
      'I(g,p,i,"WT",u,wP),v=I(h,p,i,"HT",u,wP)',
      'x("WT",p,i,3,u,O,wP)',
      'x("HT",p,i,97,u,O,wP)',
      't.getChildLMS(f,o,e,w===void 0?null:w)',
      'wiekMies:wP!=null?wP:i*12,zrodlo:u,dorosly:!1',
      'var Z=I(h,p,i,"HT",u,wP)',
    ],
    'gh_therapy_monitor.js': ['calcPercentileStats(u,t,c,f,null)'],
    'vilda_growth_prediction_validation_model.js': ["f(wzrost, plec, wiekLat, 'HT', null)"],
    'vilda_professional_module.js': ['calcPercentileStats(P,r,re,"WT",Ce)', 'calcPercentileStats(ae,r,re,"HT",Ce)'],
    'custom-fixes.js': ['calcPercentileStats(e,t,r,f,w)', 'A(P,W,N,"WT",se,Gq5s?null:void 0)', 'A(K,W,N,"HT",se,Gq5s?null:void 0)'],
    'inline_index_04.js': ['calcPercentileStats(m,p,18,"HT",null)'],
    'inline_index_07.js': ['calcPercentileStats(n,t,Ge,"HT",null)'],
  };
  it.each(Object.entries(MIEJSCA))('%s', (plik, fragmenty) => {
    const kod = czytaj(plik);
    for (const f of fragmenty) expect(kod, `${plik}: ${f}`).toContain(f);
  });

  it('app.js: piąty argument w rdzeniu i pomocnik wystawiony na window', () => {
    expect(src).toContain('function calcPercentileStats(e,t,n,a,w){');
    expect(src).toContain('x=lmsNiemowleWiek(m,w)');
    expect(src).toContain('const o=getChildLMS(t,n,a,w)');
    expect(src).toContain('function getChildLMS(e,t,n,w){');
    expect(src).toContain('LMS_INFANT_HEIGHT_GIRLS),a,w)');
    expect(src).toContain('function lmsNiemowle(t,a,w){const e=lmsNiemowleWiek(a,w);');
    expect(src).toContain('window.vildaWiekPomiaruMies=vildaWiekPomiaruMies');
  });
});

/* Schowek Karty: jeden wiek dla wszystkich liczb z siatek pomiaru (harness jak schowek-wiek-pomiaru.test.mjs). */
describe('„Skopiuj podsumowanie wyników" — jeden wiek pomiaru dla wszystkich liczb z siatek', () => {
  function okno({ wiekZRekordu }) {
    const wywolania = { stats: [], lms: [], bmi: [], cole: [], pomocnik: [] };
    const win = {
      professionalMode: true,
      bmiSource: 'OLAF',
      calcPercentileStats(value, sex, ageYears, kind, w) {
        wywolania.stats.push({ value, ageYears, kind, w, argumenty: arguments.length });
        return { percentile: 50, sd: 0 };
      },
      getChildLMS(sex, ageYears, kind, w) { wywolania.lms.push({ ageYears, kind, w }); return [1, 10, 0.1]; },
      vildaWiekPomiaruMies(rekord, m, d) { wywolania.pomocnik.push({ m, d }); return wiekZRekordu; },
      VildaBmi: {
        ocen(a) { wywolania.bmi.push(a.wiekMies); return { centyl: 50, sds: 0, kategoria: null }; },
        cole(a) { wywolania.cole.push(a.wiekMies); return { cole: 100 }; },
        fmtSds: () => '0,00',
      },
    };
    loadBrowserScript('vilda_patient_summary_copy.js', win);
    return { win, wywolania };
  }
  const REKORD = { user: { sex: 'M', age: 1, ageMonths: 2, weight: 9.5, height: 78, dobISO: '2025-04-01', measuredAtISO: '2026-06-10' }, advanced: { data: {} } };

  it('wiek z rekordu trafia do centyli masy i wzrostu, granic 3./97. centyla, BMI i Cole; wiek w latach jak dotąd', () => {
    const { win, wywolania } = okno({ wiekZRekordu: 14.3 });
    const txt = win.VildaPatientSummaryCopy.buildSummaryTextFromPayload(REKORD, {});
    expect(txt).toMatch(/Wzrost:/);
    expect(wywolania.pomocnik).toEqual([{ m: 14, d: null }]);
    expect(wywolania.stats.length).toBeGreaterThan(1);
    for (const s of wywolania.stats) {
      expect(s.argumenty, `${s.kind}: piąty argument zawsze podany`).toBe(5);
      expect(s.w, s.kind).toBe(14.3);
      expect(s.ageYears, s.kind).toBeCloseTo(14 / 12, 9);
    }
    for (const l of wywolania.lms) expect(l.w).toBe(14.3);
    expect(wywolania.bmi).toEqual([14.3]);
    expect(wywolania.cole).toEqual([14.3]);
  });

  it('wieku dokładnego nie znamy → null do siatek (pełne miesiące, bez formularza), BMI w pełnych miesiącach', () => {
    const { win, wywolania } = okno({ wiekZRekordu: null });
    win.VildaPatientSummaryCopy.buildSummaryTextFromPayload(REKORD, {});
    for (const s of wywolania.stats) {
      expect(s.argumenty).toBe(5);
      expect(s.w, s.kind).toBeNull();
    }
    expect(wywolania.bmi).toEqual([14]);
  });

  it('rekord liczony na Palczewskiej: bez wieku dokładnego (jej ścieżka masy go nie zna)', () => {
    const { win, wywolania } = okno({ wiekZRekordu: 14.3 });
    win.VildaPatientSummaryCopy.buildSummaryTextFromPayload({ ...REKORD, zscore: { dataSource: 'PALCZEWSKA' } }, {});
    expect(wywolania.pomocnik).toEqual([]);
    for (const s of wywolania.stats) expect(s.w, s.kind).toBeNull();
  });
});
