import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { appSrc, funkcjaZ, tablica, zrodlo } from '../support/silnik-bmi.mjs';

// P-OSTATNI-2c — mpSDS (SDS potencjału genetycznego MPH w 18. r.ż.) ma JEDNĄ ścieżkę w rdzeniu:
// vildaMpSdsStats(mph, płeć, źródło?) → advHistoryResolveMetric('HT', …, 18, źródło) → silnik SDS
// wzrostu z regułą siatek. Do SW 1.0.981 liczyły to trzy drogi (calcPercentileStats z globalnym
// bmiSource; advHistoryResolveMetric w kolumnie tabeli; advHistoryCalcAnthroStatsForSource w Karcie
// pacjenta i kontekście). Tu: parytet nowej funkcji z obiema starymi drogami na PRAWDZIWYM silniku
// (populacja ogólna), źródło puste = preferowane, walidacja wejścia i strażnik konsumentów.

const TABLICE = ['LMS_INFANT_HEIGHT_BOYS', 'LMS_INFANT_HEIGHT_GIRLS', 'LMS_HEIGHT_WHO_BOYS', 'LMS_HEIGHT_WHO_GIRLS', 'LMS_HEIGHT_BOYS', 'LMS_HEIGHT_GIRLS'];

// Rdzeń app.js wycięty do izolowanego okna: prawdziwy silnik SDS + prawdziwe funkcje rdzenia.
function rdzen(bmiSource = 'OLAF', dataSourceRadio = null, populacjaDs = false) {
  const win = { document: { querySelector: () => (dataSourceRadio ? { value: dataSourceRadio } : null) } };
  for (const n of TABLICE) win[n] = tablica(n);
  loadBrowserScript('centile_data.js', win);
  loadBrowserScript('vilda_centile_interpolation.js', win);
  loadBrowserScript('vilda_sds_wzrostu.js', win);
  win.VildaSdsWzrostu.ustawDane({ palCentyl: (plec, mies, c) => win.VildaCentileInterp.palCentileValue(plec, mies, c, 'HT') });
  const kod = `
    const document=window.document; let bmiSource=${JSON.stringify(bmiSource)}; function vildaPopulacjaDs(){return ${populacjaDs ? 'true' : 'false'}}
    ${['erf', 'normalCDF', 'lmsNiemowleWiek', 'calcPercentileStats', 'advHistoryCalcAnthroStatsForSource', 'advHistoryResolveMetric', 'advHistoryGetPreferredSource', 'vildaMpSdsStats'].map((n) => funkcjaZ(appSrc, n)).join('\n')}
    return { calcPercentileStats, advHistoryCalcAnthroStatsForSource, advHistoryResolveMetric, vildaMpSdsStats, advHistoryGetPreferredSource };`;
  return { win, R: new Function('window', kod)(win) };
}

describe('vildaMpSdsStats — parytet z dotychczasowymi drogami (populacja ogólna, 18. r.ż.)', () => {
  const przypadki = [['M', 171.5], ['M', 185], ['F', 158.5], ['F', 172]];

  it('= calcPercentileStats (droga targetStats/Podsumowania) i = advHistoryCalcAnthroStatsForSource (droga Karty pacjenta) dla OLAF, WHO i Palczewskiej', () => {
    for (const zr of ['OLAF', 'WHO', 'PALCZEWSKA']) {
      const { R } = rdzen(zr);
      for (const [plec, mph] of przypadki) {
        const nowy = R.vildaMpSdsStats(mph, plec, zr);
        const stary = R.calcPercentileStats(mph, plec, 18, 'HT');
        const karta = R.advHistoryCalcAnthroStatsForSource(mph, plec, 18, 'HT', zr);
        expect(nowy, `${zr} ${plec} ${mph}`).not.toBeNull();
        expect(nowy.sd).toBeCloseTo(stary.sd, 10);
        expect(nowy.percentile).toBeCloseTo(stary.percentile, 10);
        expect(nowy.sd).toBeCloseTo(karta.sd, 10);
        expect(nowy.siatka).toBe(zr);
        expect(nowy.source).toBe(zr);
        expect(nowy.reason).toBe('');
      }
    }
  });

  it('źródło puste = preferowane: radio dataSource ma pierwszeństwo, potem bmiSource', () => {
    const { R } = rdzen('OLAF', 'WHO');
    expect(R.advHistoryGetPreferredSource()).toBe('WHO');
    const a = R.vildaMpSdsStats(171.5, 'M', null);
    expect(a.siatka).toBe('WHO');
    expect(a.sd).toBeCloseTo(R.vildaMpSdsStats(171.5, 'M', 'WHO').sd, 10);
    const { R: R2 } = rdzen('PALCZEWSKA');
    expect(R2.vildaMpSdsStats(171.5, 'M', '').siatka).toBe('PALCZEWSKA');
    expect(R2.vildaMpSdsStats(171.5, 'M', 'olaf').siatka).toBe('OLAF');
  });

  it('liczba ma sens kliniczny: MPH 178 cm chłopca ≈ mediana OLAF w 18 r.ż. (|mpSDS| < 0,3), 158,5 cm dziewczynki poniżej mediany', () => {
    const { R } = rdzen('OLAF');
    expect(Math.abs(R.vildaMpSdsStats(178, 'M', 'OLAF').sd)).toBeLessThan(0.3);
    expect(R.vildaMpSdsStats(158.5, 'F', 'OLAF').sd).toBeLessThan(-0.5);
  });

  it('wejście nieliczbowe, ≤ 0 lub bez silnika → null', () => {
    const { R } = rdzen('OLAF');
    expect(R.vildaMpSdsStats(NaN, 'M', 'OLAF')).toBeNull();
    expect(R.vildaMpSdsStats(0, 'M', 'OLAF')).toBeNull();
    expect(R.vildaMpSdsStats('171.5', 'M', 'OLAF')).toBeNull();
    const { win, R: R3 } = rdzen('OLAF');
    win.VildaSdsWzrostu = null;
    expect(R3.vildaMpSdsStats(171.5, 'M', 'OLAF')).toBeNull();
  });
});

describe('P-OSTATNI-2d: u pacjenta z zespołem Downa mpSDS nie jest podawany (decyzja właściciela)', () => {
  it('populacja DS → null mimo poprawnego MPH; populacja ogólna w tym samym rdzeniu → liczba', () => {
    const { R } = rdzen('OLAF', null, true);
    expect(R.vildaMpSdsStats(171.5, 'M', 'OLAF')).toBeNull();
    expect(R.vildaMpSdsStats(158.5, 'F', null)).toBeNull();
    const { R: R0 } = rdzen('OLAF', null, false);
    expect(R0.vildaMpSdsStats(171.5, 'M', 'OLAF')).not.toBeNull();
  });

  it('budowniczy kontekstu nie obchodzi tej reguły zapasem: null z rdzenia = brak kanału rodzicielskiego', () => {
    const win = {
      addEventListener() {}, location: { pathname: '/' },
      vildaMpSdsStats: () => null,
      advHistoryCalcAnthroStatsForSource() { throw new Error('zapas nie może być wołany, gdy rdzeń odpowiedział'); },
      advHistoryResolveMetric() { throw new Error('statFor nie może być wołany, gdy rdzeń odpowiedział'); },
    };
    loadBrowserScript('vilda_tempo_wzrastania.js', win);
    const J = loadBrowserScript('vilda_trajectory_analysis.js', win).VildaTrajectoryAnalysis;
    const c = J.buildClinicalContext({ motherHeightCm: 160, fatherHeightCm: 170, sex: 'M', source: 'OLAF', ghTherapyPoints: [{ type: 'start', ageYears: 5, ageMonths: 0 }] });
    expect(c.mpSds).toBeNull();
    expect(c.mph).toBe(171.5);
    expect(c.gh).toEqual({ a: 60, b: null });
    const r = J.pairVerdictInContext('height', { sd: -0.99, c: 16, ageMonths: 98 }, { sd: -1.0, c: 16, ageMonths: 105 }, J.buildClinicalContext({ motherHeightCm: 160, fatherHeightCm: 170, sex: 'M' }) || {});
    expect(r.mphOn).toBe(false);
    expect(r.v.l).toBe('stabilny tor wzrastania');
  });
});

describe('budowniczy kontekstu (Karta pacjenta, karta porównania, trajektoria) woli funkcję rdzenia', () => {
  it('buildClinicalContext → vildaMpSdsStats(mph, płeć F/M, źródło); starsze drogi tylko jako zapas', () => {
    const wywolania = [];
    const win = {
      addEventListener() {}, location: { pathname: '/' },
      vildaMpSdsStats(v, sex, src) { wywolania.push([v, sex, src]); return { percentile: 44, sd: -0.15, siatka: 'WHO', source: 'WHO' }; },
      advHistoryCalcAnthroStatsForSource() { throw new Error('zapas nie powinien być wołany, gdy rdzeń ma vildaMpSdsStats'); },
    };
    loadBrowserScript('vilda_tempo_wzrastania.js', win);
    const J = loadBrowserScript('vilda_trajectory_analysis.js', win).VildaTrajectoryAnalysis;
    const c = J.buildClinicalContext({ motherHeightCm: 160, fatherHeightCm: 170, sex: 'K', source: 'who' });
    expect(c.mpSds).toBe(-0.15);
    expect(c.mphC).toBe(44);
    expect(wywolania).toEqual([[158.5, 'F', 'WHO']]);
  });

  it('bez funkcji rdzenia (strona bez app.js) — zapas advHistoryCalcAnthroStatsForSource, jak dotąd', () => {
    const win = { addEventListener() {}, location: { pathname: '/' }, advHistoryCalcAnthroStatsForSource: () => ({ percentile: 31, sd: -0.5 }) };
    loadBrowserScript('vilda_tempo_wzrastania.js', win);
    const J = loadBrowserScript('vilda_trajectory_analysis.js', win).VildaTrajectoryAnalysis;
    expect(J.buildClinicalContext({ motherHeightCm: 160, fatherHeightCm: 170, sex: 'M' }).mpSds).toBe(-0.5);
  });
});

describe('strażnik: każdy konsument mpSDS woła vildaMpSdsStats (zapas tylko bez rdzenia)', () => {
  it('karta zaawansowana (targetStats + kolumna hSDS − mpSDS), Podsumowanie, epikryza, monitor GH ×2, schowek Karty, trajektoria', () => {
    expect(appSrc).toContain('function vildaMpSdsStats(e,t,n){');
    expect(appSrc).toContain('advHistoryResolveMetric("HT",e,t,18,a)');
    const adv = zrodlo('vilda_advanced_growth.js');
    expect(adv).toContain('vildaMpSdsStats(Me,ae,typeof tt<"u"?tt:null)');
    expect(adv).toContain('vildaMpSdsStats(a,n,t)');
    expect(adv).not.toContain('advHistoryResolveMetric("HT",a,n,18,t)');
    expect(zrodlo('vilda_summary_cards.js')).toContain('vildaMpSdsStats(C.targetHeight,o,null)');
    expect(zrodlo('vilda_epicrisis_ui.js')).toContain('s.vildaMpSdsStats(m,n,u)');
    const gh = zrodlo('gh_therapy_monitor.js');
    expect(gh).toContain('vildaMpSdsStats(h.targetHeight,t,null)');
    expect(gh).toContain('vildaMpSdsStats(b,t,null)');
    expect(zrodlo('vilda_patient_summary_copy.js')).toContain('t.vildaMpSdsStats(M(n.targetHeight),p,u)');
    const traj = zrodlo('vilda_trajectory_analysis.js');
    expect(traj).toContain("try { st = w.vildaMpSdsStats(v, g, src); } catch (e) { st = null; }");
    expect(appSrc).toContain('if(typeof vildaPopulacjaDs=="function"&&vildaPopulacjaDs())return null');
  });
});
