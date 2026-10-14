import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const zrodlo = (plik) => fs.readFileSync(path.join(korzen, plik), 'utf8');

// P-SDS etap 2 — konsumenci rdzenia nie przepisują reguły siatki i mówią o SDS wzrostu jednym
// zapisem. Audyt 2026-09-15: warunek „PALCZEWSKA || OLAF && wiek < 3" był skopiowany ręcznie
// w ośmiu plikach (i w trzech go brakowało), mpSDS liczono czterema drogami (w tym zawsze z
// OLAF/WHO przy wybranej Palczewskiej), a ta sama liczba miała cztery zapisy: „hSDS +1,2",
// „SDS = +1,23", „Z‑score = 1,23", „z-score: 1,23". Decyzje właściciela: reguła siatki żyje
// w silniku (rdzeń ją stosuje), PALCZEWSKA pełnoprawna także w 18. r.ż., format „hSDS −1,23".

function wytnij(src, od) {
  let d = 0;
  for (let k = src.indexOf('{', od); k < src.length; k += 1) {
    if (src[k] === '{') d += 1;
    else if (src[k] === '}') { d -= 1; if (d === 0) return src.slice(od, k + 1); }
  }
  throw new Error('niezbalansowane nawiasy');
}

// Atrapa silnika: liczy „z" jako (wzrost − 100)/10, żeby wynik był przewidywalny, i loguje wywołania.
function atrapaSilnika(log = []) {
  const fmt = (z) => {
    if (typeof z !== 'number' || !isFinite(z)) return '—';
    const v = Math.round(z * 100) / 100;
    const a = Math.abs(v).toFixed(2).replace('.', ',');
    return v === 0 ? a : (v < 0 ? '−' : '+') + a;
  };
  return {
    fmtSds: fmt,
    sdsZCentyla: (p) => (p === 3 ? -1.8808 : p === 97 ? 1.8808 : 0),
    zLms: (x, l) => (l[0] !== 0 ? (Math.pow(x / l[1], l[0]) - 1) / (l[0] * l[2]) : Math.log(x / l[1]) / l[2]),
    xLms: (z, l) => (l[0] !== 0 ? l[1] * Math.pow(1 + l[0] * l[2] * z, 1 / l[0]) : l[1] * Math.exp(l[2] * z)),
    policz(o) { log.push({ f: 'policz', ...o }); return { sds: (o.wzrost - 100) / 10, centyl: 50, siatka: o.zrodlo, mediana: 100, fallback: false, powod: '' }; },
    wartoscDlaSds(o) { log.push({ f: 'wartoscDlaSds', ...o }); return { wzrost: 100 + 10 * o.sds, siatka: o.zrodlo || o.siatka, fallback: false }; },
    mediana(plec, wiekMies, zrodlo) { log.push({ f: 'mediana', plec, wiekMies, zrodlo }); return { mediana: 171.5, siatka: zrodlo, fallback: false }; },
  };
}

describe('Ręczne kopie reguły siatki zniknęły z konsumentów rdzenia', () => {
  it('karta zaawansowana, karta podstawowa, monitor GH, epikryza (wzrost), podsumowanie, schowek — bez własnego przełącznika dla wzrostu', () => {
    const adv = zrodlo('vilda_advanced_growth.js');
    expect(adv).not.toMatch(/tt==="PALCZEWSKA"\|\|tt==="OLAF"&&(te|se|Y0)<sa\)\?y\(/);
    expect(adv, 'mpSDS z jednej funkcji rdzenia (P-OSTATNI-2c), zapas z jawnym rodzajem HT').toContain('const C=typeof vildaMpSdsStats=="function"?vildaMpSdsStats(Me,ae,typeof tt<"u"?tt:null):u(Me,ae,18,"HT");C&&(ge=C)');
    expect(adv, 'normy dorosłych z silnika (mediana w 216. mies.)').toContain('Ts.mediana(ae,216,typeof tt<"u"?tt:null)');
    expect(adv, 'adultHeightLMS niesie płeć i źródło dla karty C').toContain('sex:ae,zrodlo:zr,siatka:md.siatka}');
    // W module podstawowym zostaje tylko wybór siatki DO RYSOWANIA (krzywe LMS OLAF/WHO), nie do SDS.
    expect(zrodlo('growth-basic-module.js')).not.toContain('calcPercentileStatsPal(hv,a,ay,"HT")');
    expect(zrodlo('growth-basic-module.js')).toContain('const st=window.calcPercentileStats(hv,a,ay,"HT")');
    expect(zrodlo('gh_therapy_monitor.js')).not.toMatch(/h==="PALCZEWSKA"\|\|h==="OLAF"&&c</);
    expect(zrodlo('vilda_epicrisis_ui.js')).toContain('ne!=="HT"&&D&&typeof s.calcPercentileStatsPal');
    expect(zrodlo('vilda_summary_cards.js')).not.toContain('_=calcPercentileStatsPal(t,o,n,"HT")');
    expect(zrodlo('vilda_patient_summary_copy.js')).toContain('if(C!=="HT"&&n==="PALCZEWSKA"&&r("calcPercentileStatsPal"))');
    expect(zrodlo('custom-fixes.js')).toContain('if(m&&f!=="HT"&&typeof calcPercentileStatsPal');
  });

  it('mpSDS wszędzie z rdzenia — koniec „zawsze OLAF/WHO" przy wybranej Palczewskiej', () => {
    expect(zrodlo('gh_therapy_monitor.js')).toContain('const m=typeof vildaMpSdsStats=="function"?vildaMpSdsStats(b,t,null):calcPercentileStats(b,t,18,"HT")');
    expect(zrodlo('vilda_epicrisis_ui.js')).toContain('g=typeof s.vildaMpSdsStats=="function"?s.vildaMpSdsStats(m,n,u):typeof s.calcPercentileStats=="function"?s.calcPercentileStats(m,n,18,"HT"):null');
    expect(zrodlo('vilda_summary_cards.js')).toContain('N=typeof vildaMpSdsStats=="function"?vildaMpSdsStats(C.targetHeight,o,null):typeof calcPercentileStats=="function"?calcPercentileStats(C.targetHeight,o,18,"HT"):null');
    expect(zrodlo('vilda_summary_cards.js')).not.toContain('bmiSource==="PALCZEWSKA";let N=null');
  });
});

describe('Granice 3./97. centyla i normy dorosłych przez odwrotność silnika', () => {
  it('epikryza (q), schowek (x), przygotowanie wyników (h3/h97) i raport pytają wartoscDlaSds dla wzrostu', () => {
    expect(zrodlo('vilda_epicrisis_ui.js')).toContain('wartoscDlaSds({sds:de,plec:n,wiekMies:t,zrodlo:A})');
    expect(zrodlo('vilda_patient_summary_copy.js')).toContain('wartoscDlaSds({sds:C===3?Oe:ke,plec:f,wiekMies:o*12,zrodlo:t.bmiSource})');
    expect(zrodlo('vilda_update_prep.js')).toContain('Ts.wartoscDlaSds({sds:Z3,plec:t.sex,wiekMies:t.age*12,zrodlo:t.source})');
    expect(zrodlo('vilda_patient_report.js')).toContain('wq=Ts.wartoscDlaSds({sds:Ts.sdsZCentyla(Math.min(99.9,Math.max(.1,a))),plec:t,wiekMies:i*12,zrodlo:r})');
  });

  it('karta C: SDS wobec norm dorosłych i odwrotność przez silnik, gdy LMS niesie płeć i źródło; bez nich — zapas LMS', () => {
    const log = [];
    const win = { VildaSdsWzrostu: atrapaSilnika(log) };
    loadBrowserScript('vilda_growth_card_c.js', win);
    const C = win.VildaGrowthCardC;
    const LMS = { L: 1, M: 165, S: 0.037 };
    expect(C._adultSdsFor(152, LMS)).toBeCloseTo((152 / 165 - 1) / 0.037, 9);
    expect(log).toHaveLength(0);
    const zZrodlem = { L: 1, M: 165, S: 0.037, sex: 'F', zrodlo: 'PALCZEWSKA' };
    expect(C._adultSdsFor(152, zZrodlem)).toBeCloseTo(5.2, 9);
    expect(log[0]).toEqual({ f: 'policz', wzrost: 152, plec: 'F', wiekMies: 216, zrodlo: 'PALCZEWSKA' });
    expect(C._heightFromSds(-2, zZrodlem)).toBeCloseTo(80, 9);
    expect(log[1]).toEqual({ f: 'wartoscDlaSds', sds: -2, plec: 'F', wiekMies: 216, zrodlo: 'PALCZEWSKA' });
  });
});

describe('Jeden zapis SDS wzrostu: „hSDS −1,23"', () => {
  function stubDocument() {
    return {
      getElementById: () => null, addEventListener() {}, querySelectorAll() { return []; }, querySelector() { return null; },
      createElement() { return { style: {}, classList: { add() {}, contains() { return false; } }, appendChild() {} }; },
      body: { appendChild() {} },
    };
  }
  const zapisane = {};
  beforeEach(() => { zapisane.document = globalThis.document; });
  afterEach(() => { if (zapisane.document === undefined) delete globalThis.document; else globalThis.document = zapisane.document; });

  it('schowek Karty pacjenta: „Wzrost: N centyl (hSDS −1,23)", „mpSDS +0,31" i „hSDS - mpSDS: −1,54" z jednego silnika', () => {
    const doc = stubDocument();
    globalThis.document = doc;
    const log = [];
    const win = {
      document: doc, addEventListener() {}, location: { pathname: '/' }, navigator: {},
      professionalMode: true, bmiSource: 'OLAF', VildaSdsWzrostu: atropina(log),
      calcPercentileStats(value, sex, ageYears, kind) { return kind === 'HT' ? { percentile: 11, sd: value === 176 ? 0.31 : -1.23 } : { percentile: 40, sd: -0.25 }; },
      formatCentile: (p) => (p < 1 ? '&lt;1' : p > 99 ? '&gt;99' : String(Math.round(p))),
      centylWord: (c) => (c.includes('&lt;') || c.includes('&gt;') ? 'centyla' : 'centyl'),
    };
    function atropina(l) { return atrapaSilnika(l); }
    loadBrowserScript('vilda_patient_summary_copy.js', win);
    const txt = win.VildaPatientSummaryCopy.buildSummaryTextFromPayload({
      user: { sex: 'M', age: 9, ageMonths: 0, weight: 28, height: 123.8 },
      advanced: { data: { targetHeight: 176 } },
    }, {});
    const l = String(txt).split('\n').map((s) => s.trim());
    expect(l.find((s) => s.startsWith('Wzrost:'))).toBe('Wzrost: 123,8 cm, 11 centyl (hSDS −1,23)');
    expect(l.find((s) => s.startsWith('Waga:')), 'P-WSDS: masa mówi wSDS, jak wzrost hSDS').toContain('(wSDS −0,25)');
    expect(l.find((s) => s.startsWith('MPH'))).toBe('MPH: 176,0 cm – centyl: 11, mpSDS +0,31');
    expect(l.find((s) => s.startsWith('hSDS - mpSDS'))).toBe('hSDS - mpSDS: −1,54');
    expect(l.find((s) => s.startsWith('Wzrost:'))).not.toMatch(/Z‑score/);
  });

  it('epikryza: „(N. centyl, hSDS −2,10)" i „(mpSDS +0,31)"; SDS urodzeniowe bez zmian', () => {
    const requireCjs = createRequire(import.meta.url);
    const epicrisis = requireCjs(path.join(korzen, 'vilda_epicrisis.js'));
    const t = epicrisis.generate({ sex: 'M', ageYears: 7, ageMonths: 0, height: 108, heightPercentile: 1.8, heightSds: -2.1,
      motherHeight: 160, fatherHeight: 175, mph: 174, mphPercentile: 62, mphSds: 0.31 }, {}).text;
    expect(t).toContain('wzrost 108 cm (2. centyl, hSDS −2,10)');
    expect(t).toContain('(62. centyl, mpSDS +0,31)');
    expect(t).not.toMatch(/SDS = [−+]?\d,\d\d\)/);
  });

  it('analiza punktu pomiarowego (app.js): „hSDS −0,12", „wSDS −0,25", „bmiSDS +1,20" — jeden zapis na miarę (P-WSDS)', () => {
    const src = zrodlo('app.js');
    const kod = `
      function advHistoryFormatNumber(v,n){return Number(v).toFixed(n).replace('.',',')}
      function advHistoryPercentileText(p){return Math.round(p)+'. centyl'}
      ${wytnij(src, src.indexOf('function advHistoryMetricUsesTwoLineZScore('))}
      ${wytnij(src, src.indexOf('function advHistorySdsLabel('))}
      ${wytnij(src, src.indexOf('function advHistoryBuildTextMetricLine('))}
      return advHistoryBuildTextMetricLine;`;
    const f = new Function('window', kod)({ VildaSdsWzrostu: atrapaSilnika() });
    expect(f('Wzrost', '130 cm', { result: { percentile: 25.2, sd: -0.12 } })).toBe('Wzrost: 130 cm — 25. centyl,\nhSDS −0,12');
    expect(f('Waga', '30 kg', { result: { percentile: 40, sd: -0.25 } })).toBe('Waga: 30 kg — 40. centyl,\nwSDS −0,25');
    expect(f('BMI', '17,3 kg/m²', { result: { percentile: 89, sd: 1.2 } })).toBe('BMI: 17,3 kg/m² — 89. centyl,\nbmiSDS +1,20');
    expect(f('Obwód głowy', '50 cm', { result: { percentile: 40, sd: -0.25 } }), 'pozostałe miary zostają przy „Z-score"').toContain('Z-score: -0,25');
  });

  it('raport pacjenta: linie „hSDS - mpSDS" i „mpSDS" z minusem typograficznym kolorują się jak dotąd', () => {
    const src = zrodlo('vilda_patient_report.js');
    const i = src.indexOf('function getProfessionalSummaryLineTone(');
    expect(i).toBeGreaterThan(-1);
    globalThis.document = stubDocument();
    const tone = new Function('window', `${wytnij(src, i)}return getProfessionalSummaryLineTone;`)({});
    expect(tone('hSDS - mpSDS: −2,10')).toBe('danger');
    expect(tone('hSDS - mpSDS: −1,60')).toBe('warn');
    expect(tone('hSDS - mpSDS: −0,40')).toBe('normal');
    expect(tone('MPH (mid-parental height): 176,0 cm – centyl: 2, mpSDS −2,10')).toBe('danger');
    expect(tone('MPH: 176,0 cm – centyl: 62, Z-score: 0,31')).toBe('normal');
  });

  it('monitor GH i alert karty: dwa miejsca, znak, przecinek', () => {
    const gh = zrodlo('gh_therapy_monitor.js');
    expect(gh).toContain('i.hSDS_abs!=null&&isFinite(i.hSDS_abs)?Sd(i.hSDS_abs):"\\u2014"');
    expect(gh).not.toContain('i.hSDS_abs.toFixed(2)');
    const i = gh.indexOf('function Sd(e)');
    const Sd = new Function('window', `${wytnij(gh, i)}return Sd;`)({});
    expect(Sd(-1.234)).toBe('−1,23');
    expect(Sd(0.004)).toBe('0,00');
    expect(Sd(null)).toBe('—');
    expect(zrodlo('vilda_advanced_growth.js')).toContain('})(Math.abs(Kd).toFixed(2)):null');
    expect(zrodlo('growth-basic-module.js')).toContain('})(Math.abs(Lx).toFixed(2)):null');
  });
});
