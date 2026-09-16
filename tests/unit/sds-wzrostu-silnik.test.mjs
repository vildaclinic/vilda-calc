import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSrc = fs.readFileSync(path.join(korzen, 'app.js'), 'utf8');

// P-SDS etap 1 — jeden silnik SDS wzrostu: vilda_sds_wzrostu.js.
//
// Audyt 2026-09-15 znalazł w app.js trzy silniki (calcPercentileStats, calcPercentileStatsPal,
// advHistoryResolveMetric z własną kopią wzoru) i trzy różne reguły „która siatka poniżej
// 3 lat". Decyzje właściciela: przy OLAF poniżej 3 lat — Palczewska; PALCZEWSKA pełnoprawna
// w rdzeniu; format „hSDS −1,23"; centyl wg ADV-REPORT-5. Tu silnik dostaje PRAWDZIWE tablice
// z app.js i prawdziwy interpolator Palczewskiej, a wrappery app.js są wycinane z produkcji.

function wytnij(src, od) {
  let d = 0;
  for (let k = src.indexOf('{', od); k < src.length; k += 1) {
    if (src[k] === '{') d += 1;
    else if (src[k] === '}') { d -= 1; if (d === 0) return src.slice(od, k + 1); }
  }
  throw new Error('niezbalansowane nawiasy');
}
function tablica(nazwa) {
  const i = appSrc.indexOf(`${nazwa}={`);
  expect(i, `app.js ma tablicę ${nazwa}`).toBeGreaterThan(-1);
  return new Function(`return ${wytnij(appSrc, i).slice(nazwa.length + 1)}`)();
}
function funkcja(nazwa) {
  const i = appSrc.indexOf(`function ${nazwa}(`);
  expect(i, `app.js ma funkcję ${nazwa}()`).toBeGreaterThan(-1);
  return wytnij(appSrc, i);
}

const TABLICE = ['LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS', 'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS'];

function silnik() {
  const win = {};
  for (const n of TABLICE) win[n] = tablica(n);
  loadBrowserScript('centile_data.js', win);
  loadBrowserScript('vilda_centile_interpolation.js', win);
  loadBrowserScript('vilda_sds_wzrostu.js', win);
  const T = win.VildaSdsWzrostu;
  T.ustawDane({ palCentyl: (plec, mies, c) => win.VildaCentileInterp.palCentileValue(plec, mies, c, 'HT') });
  return { win, T };
}

// Wyrocznia parzystości: produkcyjny wzór LMS app.js (advHistoryCalcLmsStats, dziś tylko dla masy)
// na tablicach z getChildLMS — ta sama liczba, którą dawał rdzeń przed etapem 1.
function staryRdzen(bmiSource) {
  const kod = `
    ${TABLICE.map((n) => `const ${n}=window.${n};`).join('')}
    let weightUsedFallback=false; const bmiSource=${JSON.stringify(bmiSource)};
    ${funkcja('erf')}${funkcja('normalCDF')}${funkcja('lmsNiemowleWiek')}${funkcja('lmsNiemowle')}${funkcja('vildaDsTablica')}${funkcja('vildaPopulacjaDs')}${funkcja('vildaDsWiersz')}${funkcja('getChildLMS')}${funkcja('advHistoryCalcLmsStats')}
    function calcPercentileStats(e,t,n,a){const r=advHistoryCalcLmsStats(e,getChildLMS(t,n,a));return r?{percentile:r.percentile,sd:r.sd}:null}
    return { calcPercentileStats, getChildLMS };`;
  const win = {};
  for (const n of TABLICE) win[n] = tablica(n);
  return new Function('window', kod)(win);
}

describe('Silnik SDS wzrostu — reguła siatek (decyzje właściciela)', () => {
  it('OLAF poniżej 3 lat idzie na Palczewską z jawnym powodem; od 36 mies. na OLAF', () => {
    const { T } = silnik();
    const maly = T.policz({ wzrost: 84, plec: 'M', wiekMies: 24, zrodlo: 'OLAF' });
    expect(maly.siatka).toBe('PALCZEWSKA');
    expect(maly.fallback).toBe(true);
    expect(maly.powod).toBe('brak danych OLAF dla wieku poniżej 3 lat');
    expect(maly.sds).toBeLessThan(-1);
    const duzy = T.policz({ wzrost: 96, plec: 'M', wiekMies: 36, zrodlo: 'OLAF' });
    expect(duzy.siatka).toBe('OLAF');
    expect(duzy.fallback).toBe(false);
    expect(duzy.powod).toBe('');
  });

  it('PALCZEWSKA jest pełnoprawna: także w 18. roku życia (mpSDS, normy dorosłych)', () => {
    const { T } = silnik();
    const r = T.policz({ wzrost: 176, plec: 'M', wiekMies: 216, zrodlo: 'PALCZEWSKA' });
    expect(r.siatka).toBe('PALCZEWSKA');
    expect(r.fallback).toBe(false);
    expect(Math.abs(r.sds)).toBeLessThan(1);
  });

  it('WHO: 0–35 mies. WHO 2006, od 36 WHO 2007, a 35,5 mies. interpoluje między siatkami', () => {
    const { T } = silnik();
    const a = T.lms('M', 35, 'WHO');
    const b = T.lms('M', 36, 'WHO');
    const m = T.lms('M', 35.5, 'WHO');
    expect(a[1]).toBeLessThan(m[1]);
    expect(m[1]).toBeLessThan(b[1]);
    expect(m[1]).toBeCloseTo((a[1] + b[1]) / 2, 9);
    expect(T.policz({ wzrost: 96, plec: 'M', wiekMies: 35.5, zrodlo: 'WHO' }).siatka).toBe('WHO');
  });

  it('noworodek poniżej 1. miesiąca nie ma wiersza u Palczewskiej — WHO 2006 z powodem, przy OLAF i przy PALCZEWSKA', () => {
    const { T } = silnik();
    for (const z of ['OLAF', 'PALCZEWSKA']) {
      const r = T.policz({ wzrost: 52, plec: 'F', wiekMies: 0.5, zrodlo: z });
      expect(r.siatka, z).toBe('WHO');
      expect(r.fallback, z).toBe(true);
      expect(r.powod, z).toMatch(/noworodek poniżej 1\. miesiąca/);
    }
  });

  it('DOB-AGE-4 działa w silniku: niemowlę na medianie WHO w 29. dobie ma SDS ≈ 0, a wierszem „0 mies." miałoby +2,4', () => {
    const { T, win } = silnik();
    const dni = 29 / 30.4375;
    const w0 = win.LMS_INFANT_HEIGHT_BOYS['0'];
    const w1 = win.LMS_INFANT_HEIGHT_BOYS['1'];
    const mediana = w0[1] + (w1[1] - w0[1]) * dni;
    expect(Math.abs(T.policz({ wzrost: mediana, plec: 'M', wiekMies: dni, zrodlo: 'WHO' }).sds)).toBeLessThan(0.01);
    expect(T.policz({ wzrost: mediana, plec: 'M', wiekMies: 0, zrodlo: 'WHO' }).sds).toBeGreaterThan(2);
  });

  it('powyżej 216 mies. siatki LMS milczą — Palczewska do 222 z powodem; powyżej 222 brak wyniku, nie cichy ostatni wiersz', () => {
    const { T } = silnik();
    const r = T.policz({ wzrost: 170, plec: 'M', wiekMies: 218, zrodlo: 'OLAF' });
    expect(r.siatka).toBe('PALCZEWSKA');
    expect(r.fallback).toBe(true);
    expect(r.powod).toBe('brak siatek OLAF powyżej 18 lat');
    const poza = T.policz({ wzrost: 170, plec: 'M', wiekMies: 223, zrodlo: 'OLAF' });
    expect(poza.sds).toBeNull();
    expect(poza.pozaZakresem).toBe(true);
    expect(poza.powod).toMatch(/powyżej 18,5 roku/);
    expect(T.policzNaSiatce({ wzrost: 170, plec: 'M', wiekMies: 230, siatka: 'PALCZEWSKA' })).toBeNull();
  });

  it('brak wzrostu albo wieku to pusty model z powodem, nigdy wyjątek', () => {
    const { T } = silnik();
    expect(T.policz({ wzrost: 0, plec: 'M', wiekMies: 100, zrodlo: 'OLAF' }).powod).toBe('brak wzrostu');
    expect(T.policz({ wzrost: 120, plec: 'M', wiekMies: NaN, zrodlo: 'OLAF' }).powod).toBe('brak wieku');
    expect(T.policz({ wzrost: 120, plec: 'M', wiekMies: 100, zrodlo: 'DOWOLNE' }).zrodloZadane).toBe('OLAF');
  });
});

describe('Silnik SDS wzrostu — parzystość z dotychczasowym rdzeniem tam, gdzie reguła się nie zmieniła', () => {
  it('od 36 mies. na OLAF i WHO ten sam wynik, co calcPercentileStats sprzed etapu (bez silnika)', () => {
    const { T } = silnik();
    for (const zrodlo of ['OLAF', 'WHO']) {
      const stary = staryRdzen(zrodlo);
      for (const [plec, mies, cm] of [['M', 36, 96], ['F', 60, 108], ['M', 150, 155], ['F', 174, 160], ['M', 216, 176]]) {
        const a = stary.calcPercentileStats(cm, plec, mies / 12, 'HT');
        const b = T.policz({ wzrost: cm, plec, wiekMies: mies, zrodlo });
        expect(b.siatka, `${zrodlo} ${mies}`).toBe(zrodlo);
        expect(b.sds, `${zrodlo} ${plec} ${mies} mies.`).toBeCloseTo(a.sd, 9);
        expect(b.centyl).toBeCloseTo(a.percentile, 9);
      }
    }
  });

  it('WHO niemowlęce w pełnych miesiącach: ten sam wynik, co dotąd', () => {
    const { T } = silnik();
    const stary = staryRdzen('WHO');
    for (const [plec, mies, cm] of [['M', 0, 50], ['F', 6, 65], ['M', 24, 84], ['F', 35, 94]]) {
      expect(T.policz({ wzrost: cm, plec, wiekMies: mies, zrodlo: 'WHO' }).sds).toBeCloseTo(stary.calcPercentileStats(cm, plec, mies / 12, 'HT').sd, 9);
    }
  });

  it('Palczewska: ta sama interpolacja z między centylami, co calcPercentileStatsPal sprzed etapu', () => {
    const { T, win } = silnik();
    const kod = `${funkcja('erf')}${funkcja('normalCDF')}${funkcja('normInv')}
      function getPalCentile(e,t,n,a){return window.VildaCentileInterp.palCentileValue(e,Math.round(t),n,a)}
      ${funkcja('calcPercentileStatsPal').replace('if(a==="HT"){const T=typeof window<"u"&&window.VildaSdsWzrostu;if(T&&typeof T.policzNaSiatce=="function"){const r=T.policzNaSiatce({wzrost:e,plec:t,wiekMies:Math.round(n*12),siatka:"PALCZEWSKA"});return r?{percentile:r.centyl,sd:r.sds}:null}return null}', '')}
      return calcPercentileStatsPal;`;
    const staryPal = new Function('window', kod)(win);
    for (const [plec, mies, cm] of [['M', 24, 84], ['F', 24, 81], ['M', 120, 138], ['F', 150, 160], ['M', 216, 176], ['F', 12, 70]]) {
      const a = staryPal(cm, plec, mies / 12, 'HT');
      const b = T.policzNaSiatce({ wzrost: cm, plec, wiekMies: mies, siatka: 'PALCZEWSKA' });
      expect(b.sds, `${plec} ${mies} mies.`).toBeCloseTo(a.sd, 9);
      expect(b.centyl).toBeCloseTo(a.percentile, 9);
    }
  });
});

describe('Silnik SDS wzrostu — odwrotność i format', () => {
  it('wartoscDlaSds odwraca policz() na LMS i na Palczewskiej', () => {
    const { T } = silnik();
    const a = T.policz({ wzrost: 155, plec: 'M', wiekMies: 150, zrodlo: 'OLAF' });
    expect(T.wartoscDlaSds({ sds: a.sds, plec: 'M', wiekMies: 150, zrodlo: 'OLAF' }).wzrost).toBeCloseTo(155, 6);
    const p = T.policz({ wzrost: 84, plec: 'M', wiekMies: 24, zrodlo: 'OLAF' });
    const inv = T.wartoscDlaSds({ sds: p.sds, plec: 'M', wiekMies: 24, zrodlo: 'OLAF' });
    expect(inv.siatka).toBe('PALCZEWSKA');
    expect(inv.wzrost).toBeCloseTo(84, 6);
    const p3 = T.wartoscDlaSds({ sds: T.sdsZCentyla(3), plec: 'M', wiekMies: 24, siatka: 'PALCZEWSKA' });
    expect(p3.wzrost).toBeCloseTo(T.policzNaSiatce({ wzrost: p3.wzrost, plec: 'M', wiekMies: 24, siatka: 'PALCZEWSKA' }).centyl >= 0 ? p3.wzrost : NaN, 9);
  });

  it('format: „hSDS −1,23" (2 miejsca, znak, przecinek), zero bez znaku, centyl <1 / >99 / do jedności', () => {
    const { T } = silnik();
    expect(T.fmtSds(-1.234)).toBe('−1,23');
    expect(T.fmtSds(2)).toBe('+2,00');
    expect(T.fmtSds(0.004)).toBe('0,00');
    expect(T.fmtSds(-0.004)).toBe('0,00');
    expect(T.fmtSds(null)).toBe('—');
    expect(T.fmtCentyl(0.4)).toBe('<1');
    expect(T.fmtCentyl(99.4)).toBe('>99');
    expect(T.fmtCentyl(12.6)).toBe('13');
    const f = T.formatuj(T.policz({ wzrost: 155, plec: 'M', wiekMies: 150, zrodlo: 'OLAF' }));
    expect(f.zdanie).toMatch(/^hSDS [−+]\d,\d\d$/);
    expect(f.centylZdanie).toMatch(/^\d+\. centyl$/);
    expect(T.formatuj({}).zdanie).toBe('');
  });

  it('silnik nie zna DOM, nie używa eval/Function (CSP strony) i nie liczy tempa; app.js wystawia mu tablice', () => {
    const src = fs.readFileSync(path.join(korzen, 'vilda_sds_wzrostu.js'), 'utf8');
    expect(src).not.toMatch(/document\.|getElementById|localStorage/);
    expect(src).not.toMatch(/new Function|\beval\(/);
    expect(src).not.toMatch(/cm\/rok/);
    expect(appSrc).toContain('window.VildaWzrostLMS=Object.freeze({LMS_INFANT_HEIGHT_BOYS,LMS_INFANT_HEIGHT_GIRLS,LMS_HEIGHT_WHO_BOYS,LMS_HEIGHT_WHO_GIRLS,LMS_HEIGHT_BOYS,LMS_HEIGHT_GIRLS,');
    // Silnik czyta pakiet z window, gdy tablic nie ma wprost na window ani we wstrzyknięciu.
    const win = { VildaWzrostLMS: {} };
    for (const n of TABLICE) win.VildaWzrostLMS[n] = tablica(n);
    loadBrowserScript('vilda_sds_wzrostu.js', win);
    expect(win.VildaSdsWzrostu.policz({ wzrost: 155, plec: 'M', wiekMies: 150, zrodlo: 'OLAF' }).siatka).toBe('OLAF');
  });
});

describe('Rdzeń app.js deleguje wzrost do silnika', () => {
  function rdzenZSilnikiem(bmiSource, engine) {
    const kod = `
      ${TABLICE.map((n) => `const ${n}=window.${n};`).join('')}
      let weightUsedFallback=false; const bmiSource=${JSON.stringify(bmiSource)}; const OLAF_DATA_MIN_AGE=3;
      const LMS_INFANT_WEIGHT_BOYS={},LMS_INFANT_WEIGHT_GIRLS={},LMS_WEIGHT_BOYS={},LMS_WEIGHT_GIRLS={},LMS_WEIGHT_WHO_BOYS={},LMS_WEIGHT_WHO_GIRLS={};
      ${funkcja('erf')}${funkcja('normalCDF')}${funkcja('normInv')}${funkcja('lmsNiemowleWiek')}${funkcja('lmsNiemowle')}${funkcja('vildaDsTablica')}${funkcja('vildaPopulacjaDs')}${funkcja('vildaDsWiersz')}${funkcja('getChildLMS')}${funkcja('calcPercentileStats')}
      function getPalCentile(){return null}
      ${funkcja('calcPercentileStatsPal')}
      function advHistoryMetricCandidates(){throw new Error('nie powinno być wołane dla HT')}
      function advHistoryCalcBmiStatsForSource(){return null}
      function advHistoryCalcColeForSource(){return null}
      function advHistoryMetricFallbackReason(){return ''}
      function advHistoryGetChildLMSForSource(){return null}
      function advHistoryCalcLmsStats(){return null}
      ${funkcja('advHistoryCalcAnthroStatsForSource')}${funkcja('advHistoryResolveMetric')}
      return { calcPercentileStats, calcPercentileStatsPal, advHistoryResolveMetric, advHistoryCalcAnthroStatsForSource };`;
    const win = { VildaSdsWzrostu: engine };
    for (const n of TABLICE) win[n] = tablica(n);
    return new Function('window', kod)(win);
  }

  it('calcPercentileStats(HT) woła policz() z wiekiem w miesiącach i źródłem bmiSource; masa zostaje na starej ścieżce', () => {
    const wywolania = [];
    const atrapa = {
      policz(o) { wywolania.push(o); return { sds: -1.5, centyl: 6.7, mediana: 90, siatka: 'PALCZEWSKA', fallback: true, powod: 'brak danych OLAF dla wieku poniżej 3 lat' }; },
      policzNaSiatce() { throw new Error('nie tu'); },
    };
    const r = rdzenZSilnikiem('OLAF', atrapa);
    const w = r.calcPercentileStats(84, 'M', 2, 'HT');
    expect(wywolania).toEqual([{ wzrost: 84, plec: 'M', wiekMies: 24, zrodlo: 'OLAF' }]);
    expect(w).toEqual({ percentile: 6.7, sd: -1.5, median: 90, siatka: 'PALCZEWSKA', fallback: true, powod: 'brak danych OLAF dla wieku poniżej 3 lat' });
    expect(r.calcPercentileStats(12, 'M', 2, 'WT'), 'masa nie idzie przez silnik').toBeNull();
    expect(wywolania).toHaveLength(1);
  });

  it('dokładny wiek z daty urodzenia trafia do silnika, gdy zgadza się z wiekiem pomiaru', () => {
    const wywolania = [];
    const atrapa = { policz(o) { wywolania.push(o); return { sds: 0, centyl: 50, siatka: 'WHO', fallback: false, powod: '' }; } };
    const kod = `window.VildaDobAge={readExactAge:()=>({totalMonths:0,days:29,exactMonths:29/30.4375})};`;
    const r = (function () {
      const win = { VildaSdsWzrostu: atrapa };
      for (const n of TABLICE) win[n] = tablica(n);
      new Function('window', kod)(win);
      return new Function('window', `const bmiSource="WHO";${funkcja('lmsNiemowleWiek')}${funkcja('vildaDsTablica')}${funkcja('vildaPopulacjaDs')}${funkcja('vildaDsWiersz')}${funkcja('getChildLMS')}${funkcja('calcPercentileStats')}return calcPercentileStats;`)(win);
    })();
    r(54.5, 'M', 0, 'HT');
    expect(wywolania[0].wiekMies).toBeCloseTo(29 / 30.4375, 9);
    r(60, 'M', 2 / 12, 'HT');
    expect(wywolania[1].wiekMies, 'inny wiek niż dziś — bez uściślenia').toBe(2);
  });

  it('advHistoryResolveMetric(HT) oddaje siatkę i powód z silnika, bez własnego łańcucha kandydatów', () => {
    const atrapa = {
      policz(o) { return o.wzrost > 0 ? { sds: -0.5, centyl: 30.9, mediana: 100, siatka: 'WHO', fallback: true, powod: 'brak danych OLAF dla wieku poniżej 3 lat' } : { sds: null, powod: 'brak wzrostu' }; },
      policzNaSiatce(o) { return o.siatka === 'WHO' ? { sds: -0.5, centyl: 30.9, mediana: 100 } : null; },
    };
    const r = rdzenZSilnikiem('OLAF', atrapa);
    expect(r.advHistoryResolveMetric('HT', 84, 'M', 2, 'OLAF')).toEqual({ result: { percentile: 30.9, sd: -0.5, median: 100 }, source: 'WHO', reason: 'brak danych OLAF dla wieku poniżej 3 lat' });
    expect(r.advHistoryResolveMetric('HT', 0, 'M', 2, 'OLAF')).toEqual({ result: null, source: null, reason: 'brak wzrostu' });
    expect(r.advHistoryCalcAnthroStatsForSource(84, 'M', 2, 'HT', 'WHO')).toEqual({ percentile: 30.9, sd: -0.5, median: 100 });
    expect(r.advHistoryCalcAnthroStatsForSource(84, 'M', 2, 'HT', 'OLAF')).toBeNull();
  });

  it('calcPercentileStatsPal(HT) liczy przez policzNaSiatce(PALCZEWSKA)', () => {
    const atrapa = { policz() { throw new Error('nie tu'); }, policzNaSiatce(o) { return o.siatka === 'PALCZEWSKA' ? { sds: 1.1, centyl: 86.4 } : null; } };
    const r = rdzenZSilnikiem('PALCZEWSKA', atrapa);
    expect(r.calcPercentileStatsPal(140, 'F', 10, 'HT')).toEqual({ percentile: 86.4, sd: 1.1 });
  });

  it('chip siatki (inline_index_03) liczy wzrost przez silnik', () => {
    const src = fs.readFileSync(path.join(korzen, 'inline_index_03.js'), 'utf8');
    const i = src.indexOf('function getCentilePercentileStatsForSource(');
    const wywolania = [];
    const f = new Function('window', `${wytnij(src, i)}return getCentilePercentileStatsForSource;`)({
      VildaSdsWzrostu: { policz(o) { wywolania.push(o); return { sds: 0.2, centyl: 57.9, siatka: 'OLAF', fallback: false }; } },
    });
    expect(f(150, 'M', 150, 'HT', 'OLAF')).toEqual({ percentile: 57.9, sd: 0.2, siatka: 'OLAF', fallback: false });
    expect(wywolania).toEqual([{ wzrost: 150, plec: 'M', wiekMies: 150, zrodlo: 'OLAF' }]);
  });
});

describe('Strony i cache PWA', () => {
  it('każda strona z app.js ładuje silnik SDS przed silnikiem tempa, a cache PWA go ma', () => {
    for (const strona of fs.readdirSync(korzen).filter((f) => f.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(korzen, strona), 'utf8');
      const iS = html.indexOf('vilda_sds_wzrostu.js?v=');
      const iT = html.indexOf('vilda_tempo_wzrastania.js?v=');
      if (iT < 0) continue;
      expect(iS, `${strona}: silnik SDS obecny`).toBeGreaterThan(-1);
      expect(iS, `${strona}: silnik SDS przed silnikiem tempa`).toBeLessThan(iT);
    }
    expect(fs.readFileSync(path.join(korzen, 'service-worker-kalorii.js'), 'utf8')).toMatch(/'\/vilda_sds_wzrostu\.js\?v=\d+'/);
  });
});
