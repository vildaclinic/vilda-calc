import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

function loadModule(browserGlobal = {}) {
  return loadBrowserScript('vilda_trajectory_analysis.js', browserGlobal);
}

// Realny verdictCh wycięty z produkcyjnego vilda_auth_ui.js (test parytetu wg AGENTS.md §3.5 —
// wywołujemy rzeczywistą funkcję, nie kopię wzoru).
function extractRealVerdictCh() {
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'vilda_auth_ui.js'),
    'utf8'
  );
  const start = source.indexOf('function verdictCh(met,');
  const end = source.indexOf('var VCHIP=', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const fnSource = source.slice(start, end);
  return new Function(`return (${fnSource.replace(/^function verdictCh/, 'function')})`)();
}

function extractRealVerdictCh2() {
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'vilda_auth_ui.js'),
    'utf8'
  );
  const v1 = source.slice(
    source.indexOf('function verdictCh(met,'),
    source.indexOf('var VCHIP=')
  );
  const v2 = source.slice(
    source.indexOf('function verdictCh2('),
    source.indexOf('function ctxClean(')
  );
  return new Function(`${v1}\n${v2}\nreturn verdictCh2;`)();
}

function extractRealInterpCh() {
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'vilda_auth_ui.js'),
    'utf8'
  );
  const constants = source.slice(
    source.indexOf('var CLINES='),
    source.indexOf('function chan(')
  );
  const chan = source.slice(
    source.indexOf('function chan('),
    source.indexOf('function interpCh(')
  );
  const interp = source.slice(
    source.indexOf('function interpCh('),
    source.indexOf('function fmtC(')
  );
  return new Function(`${constants}\n${chan}\n${interp}\nreturn interpCh;`)();
}

describe('parytet werdyktów z panelem porównania (realny verdictCh z vilda_auth_ui.js)', () => {
  const realVerdict = extractRealVerdictCh();
  const { VildaTrajectoryAnalysis } = loadModule();

  it('verdictForPair daje identyczny typ i etykietę dla pełnej siatki przypadków', () => {
    const sdsGrid = [-2.6, -1.9, -1.4, -1.0, -0.6, -0.3, -0.1, 0, 0.15, 0.3, 0.55, 1.1, 1.45, 1.9, 2.4, 2.95];
    const centileFromSds = (sds) =>
      Math.min(99.9, Math.max(0.1, 100 * (0.5 * (1 + Math.tanh(sds * 0.79)))));
    let compared = 0;
    for (const met of ['height', 'weight', 'bmi']) {
      for (const sa of sdsGrid) {
        for (const sb of sdsGrid) {
          const ca = centileFromSds(sa);
          const cb = centileFromSds(sb);
          const real = realVerdict(met, sa, sb, ca, cb);
          const mine = VildaTrajectoryAnalysis.verdictForPair(met, sa, sb, ca, cb);
          expect(mine).toEqual(real);
          compared += 1;
        }
      }
    }
    expect(compared).toBe(3 * sdsGrid.length * sdsGrid.length);
  });

  it('parytet także na granicach stref centylowych (3/5/10/85/90/97)', () => {
    const edges = [2.9, 3, 3.1, 4.9, 5, 9.9, 10, 10.1, 84.9, 85, 89.9, 90, 90.1, 96.9, 97, 97.1];
    const sdsPairs = [
      [-0.6, -1.3], [-0.3, 0.4], [0.2, 0.9], [1.2, 1.9], [2.2, 2.7], [1.9, 1.3], [0.5, -0.7]
    ];
    for (const met of ['height', 'weight', 'bmi']) {
      for (const ca of edges) {
        for (const cb of edges) {
          for (const [sa, sb] of sdsPairs) {
            expect(VildaTrajectoryAnalysis.verdictForPair(met, sa, sb, ca, cb))
              .toEqual(realVerdict(met, sa, sb, ca, cb));
          }
        }
      }
    }
  });

  it('zoneForPair odpowiada tekstowi strefy z realnego interpCh', () => {
    const realInterp = extractRealInterpCh();
    const cases = [
      [98, 99, 2.1, 2.6], [98, 98, 2.1, 2.2], [50, 75.5, 0, 0.7],
      [2, 2.5, -2.2, -2.0], [2, 1, -2.2, -2.6], [45, 45, -0.1, -0.1],
      [95, 94, 1.7, 1.6], [26, 24, -0.6, -0.7]
    ];
    for (const [ca, cb, sa, sb] of cases) {
      expect(VildaTrajectoryAnalysis.zoneForPair(ca, cb, sa, sb)).toBe(realInterp(ca, cb, sa, sb)[2]);
    }
  });
});

describe('silnik analizy trajektorii (statystyki stubowane deterministycznie)', () => {
  // Stub wspólnej ścieżki statystyk: SDS zadany wprost w tabeli, centyl przybliżony logistycznie.
  function makeGlobalWithStats(table) {
    const centileFromSds = (sds) => {
      // CDF rozkładu normalnego (Abramowitz–Stegun, jak normalCDF w app.js)
      const sign = sds >= 0 ? 1 : -1;
      const x = Math.abs(sds) / Math.SQRT2;
      const t = 1 / (1 + 0.3275911 * x);
      const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
      return Math.min(99.9, Math.max(0.1, 100 * 0.5 * (1 + sign * y)));
    };
    const browserGlobal = {
      bmiSource: 'OLAF',
      advHistoryResolveMetric(param, value, sex, ageYears, source) {
        const key = `${param}|${Math.round(ageYears * 12)}`;
        if (!(key in table)) return { result: null, source: null, reason: '' };
        const sd = table[key];
        return { result: { percentile: centileFromSds(sd), sd }, source, reason: '' };
      }
    };
    return loadModule(browserGlobal).VildaTrajectoryAnalysis;
  }

  it('buduje odcinki między kolejnymi punktami i wskazuje najpoważniejszy', () => {
    const vta = makeGlobalWithStats({
      'HT|48': 0.4, 'HT|60': 0.3, 'HT|72': -0.9, 'HT|84': -1.0
    });
    const model = vta.analyze({
      measurements: [
        { ageMonths: 48, height: 104 },
        { ageMonths: 60, height: 110 },
        { ageMonths: 72, height: 113 }
      ],
      currentAgeMonths: 84,
      currentHeight: 118,
      sex: 'M',
      source: 'OLAF'
    });
    expect(model).not.toBeNull();
    const h = model.metrics.find((m) => m.metric === 'height');
    expect(h.segments).toHaveLength(3);
    expect(h.segments.map((s) => s.dSds)).toEqual([-0.1, -1.2, -0.1]);
    expect(h.worst.a.ageMonths).toBe(60);
    expect(h.worst.verdict).toEqual({ t: 'bad', l: 'istotna deceleracja wzrastania' });
    expect(h.total).toEqual({ t: 'bad', l: 'istotna deceleracja wzrastania' });
  });

  it('czerwona flaga pozycyjna: baza = pierwszy pomiar ≥24 mies. (reguła PR #64)', () => {
    const vta = makeGlobalWithStats({
      'HT|6': 1.9, 'HT|30': 1.3, 'HT|72': 0.1
    });
    const model = vta.analyze({
      measurements: [
        { ageMonths: 6, height: 70 },
        { ageMonths: 30, height: 93 }
      ],
      currentAgeMonths: 72,
      currentHeight: 113,
      sex: 'M'
    });
    const h = model.metrics.find((m) => m.metric === 'height');
    expect(h.redFlag).not.toBeNull();
    expect(h.redFlag.baseAgeMonths).toBe(30);
    expect(h.redFlag.dSds).toBe(-1.2);
  });

  it('bez czerwonej flagi, gdy spadek zaszedł wyłącznie przed 24. mies. (catch-down niemowlęcy)', () => {
    const vta = makeGlobalWithStats({
      'HT|6': 1.9, 'HT|40': 0.2, 'HT|72': 0.1
    });
    const model = vta.analyze({
      measurements: [
        { ageMonths: 6, height: 70 },
        { ageMonths: 40, height: 99 }
      ],
      currentAgeMonths: 72,
      currentHeight: 113,
      sex: 'M'
    });
    const h = model.metrics.find((m) => m.metric === 'height');
    expect(h.redFlag).toBeNull();
  });

  it('odcinek krótszy niż 3 mies. jest pokazywany bez werdyktu', () => {
    const vta = makeGlobalWithStats({
      'HT|60': 0.2, 'HT|62': 0.1, 'HT|74': 0.0
    });
    const model = vta.analyze({
      measurements: [
        { ageMonths: 60, height: 110 },
        { ageMonths: 62, height: 111 }
      ],
      currentAgeMonths: 74,
      currentHeight: 115,
      sex: 'K'
    });
    const h = model.metrics.find((m) => m.metric === 'height');
    expect(h.segments[0].verdict).toBeNull();
    expect(h.segments[1].verdict).not.toBeNull();
  });

  it('BMI liczone z pary wzrost+masa w punkcie; werdykt wg słownika panelu (pacjent otyły)', () => {
    const vta = makeGlobalWithStats({
      'HT|145': 1.7, 'HT|150': 1.6,
      'WT|145': 2.4, 'WT|150': 2.9,
      'BMI|145': 2.2, 'BMI|150': 2.7
    });
    const model = vta.analyze({
      measurements: [{ ageMonths: 145, height: 166, weight: 77.6 }],
      currentAgeMonths: 150,
      currentHeight: 169,
      currentWeight: 88,
      sex: 'M'
    });
    const bmi = model.metrics.find((m) => m.metric === 'bmi');
    const wt = model.metrics.find((m) => m.metric === 'weight');
    expect(bmi.total).toEqual({ t: 'bad', l: 'progresja otyłości' });
    expect(wt.total).toEqual({ t: 'bad', l: 'progresja nadmiaru masy (>97. centyla)' });
    const html = vta.buildHtml(model);
    expect(html).toContain('progresja otyłości');
    expect(html).toContain('progresja nadmiaru masy (&gt;97. centyla)');
  });

  it('tempo wzrastania używa produkcyjnych funkcji okna i progu (norma 5–10 lat)', () => {
    const appSource = fs.readFileSync(path.join(repositoryRoot, 'app.js'), 'utf8');
    const cut = (name) => {
      const i = appSource.indexOf(`function ${name}(`);
      expect(i).toBeGreaterThan(-1);
      let depth = 0;
      for (let k = appSource.indexOf('{', i); k < appSource.length; k++) {
        if (appSource[k] === '{') depth += 1;
        else if (appSource[k] === '}') {
          depth -= 1;
          if (depth === 0) return appSource.slice(i, k + 1);
        }
      }
      throw new Error(`niezbalansowana funkcja ${name}`);
    };
    const helpers = new Function(`
      ${cut('pickPrevForLastYear')}
      ${cut('pickPrevFallback')}
      ${cut('velocityCmPerYear')}
      ${cut('getVelocityThreshold')}
      return { pickPrevForLastYear, pickPrevFallback, velocityCmPerYear, getVelocityThreshold };
    `)();
    const browserGlobal = {
      bmiSource: 'OLAF',
      ...helpers,
      advHistoryResolveMetric(param, value, sex, ageYears) {
        return { result: { percentile: 50, sd: 0 }, source: 'OLAF', reason: '' };
      }
    };
    const vta = loadModule(browserGlobal).VildaTrajectoryAnalysis;
    const model = vta.analyze({
      measurements: [{ ageMonths: 84, height: 120 }],
      currentAgeMonths: 96,
      currentHeight: 124, // 4 cm w 12 mies. → poniżej progu 5 cm/rok dla 5–10 lat
      sex: 'M'
    });
    expect(model.velocity).not.toBeNull();
    expect(model.velocity.cmPerYear).toBeCloseTo(4, 5);
    expect(model.velocity.usedLastYear).toBe(true);
    expect(model.velocity.slow).toBe(true);
    // >10 lat bez Tannera/wieku kostnego: reguła generyczna okołopokwitaniowa (<4 cm/rok → warn)
    const model2 = vta.analyze({
      measurements: [{ ageMonths: 144, height: 150 }],
      currentAgeMonths: 156,
      currentHeight: 153,
      sex: 'M'
    });
    expect(model2.velocity.threshold).toBeNull();
    expect(model2.velocity.basis).toBe('generic');
    expect(model2.velocity.slow).toBe(true);
    expect(model2.velocity.severity).toBe('warn');
    expect(model2.velocity.alarm).toBe(false);
  });

  it('zwraca null przy mniej niż dwóch punktach z policzalną statystyką', () => {
    const vta = makeGlobalWithStats({ 'HT|60': 0.2 });
    expect(vta.analyze({
      measurements: [],
      currentAgeMonths: 60,
      currentHeight: 110,
      sex: 'M'
    })).toBeNull();
    expect(vta.analyzeAndRenderHtml({
      measurements: [],
      currentAgeMonths: 60,
      currentHeight: 110,
      sex: 'M'
    })).toBe('');
  });
});

describe('renderer Karty pacjenta (buildPatientHtml)', () => {
  function makeVta(table) {
    const centileFromSds = (sds) => {
      const sign = sds >= 0 ? 1 : -1;
      const x = Math.abs(sds) / Math.SQRT2;
      const t = 1 / (1 + 0.3275911 * x);
      const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
      return Math.min(99.9, Math.max(0.1, 100 * 0.5 * (1 + sign * y)));
    };
    return loadBrowserScript('vilda_trajectory_analysis.js', {
      bmiSource: 'OLAF',
      advHistoryResolveMetric(param, value, sex, ageYears) {
        const key = `${param}|${Math.round(ageYears * 12)}`;
        if (!(key in table)) return { result: null, source: null, reason: '' };
        return { result: { percentile: centileFromSds(table[key]), sd: table[key] }, source: 'OLAF', reason: '' };
      }
    }).VildaTrajectoryAnalysis;
  }

  it('panel z czerwoną flagą, chipami słownika lekarskiego i tabelą odcinków', () => {
    const vta = makeVta({ 'HT|48': 0.3, 'HT|72': -0.35, 'HT|96': -1.1 });
    const model = vta.analyze({
      measurements: [{ ageMonths: 48, height: 104 }, { ageMonths: 72, height: 116 }],
      currentAgeMonths: 96,
      currentHeight: 123,
      sex: 'M'
    });
    const html = vta.buildPatientHtml(model);
    expect(html).toContain('Analiza trajektorii');
    expect(html).toContain('Istotne obniżenie pozycji centylowej wzrostu');
    expect(html).toContain('obraz deceleracji wzrastania');
    expect(html).toContain('istotna deceleracja wzrastania');
    expect(html).toContain('Szczegóły odcinków trajektorii (2)');
    expect(html).toContain('<svg'); // sparkline
    expect(html).toContain('vtap-main" open');
  });

  it('opcja collapsed usuwa atrybut open; brak modelu daje pusty HTML', () => {
    const vta = makeVta({ 'HT|48': 0.3, 'HT|72': 0.3 });
    const model = vta.analyze({
      measurements: [{ ageMonths: 48, height: 104 }],
      currentAgeMonths: 72,
      currentHeight: 118,
      sex: 'K'
    });
    const collapsed = vta.buildPatientHtml(model, { collapsed: true });
    expect(collapsed).toContain('vtap-main"');
    expect(collapsed).not.toContain('vtap-main" open');
    expect(vta.buildPatientHtml(null)).toBe('');
  });
});

describe('kontekst kliniczny per odcinek (parytet z realnym verdictCh2)', () => {
  const realVerdict2 = extractRealVerdictCh2();
  const { VildaTrajectoryAnalysis } = loadModule();

  it('verdictForPairCtx daje identyczny wynik dla siatki przypadków GH/MPH/redukcji', () => {
    const centiles = [2, 4.5, 8, 15, 40, 60, 86, 92, 96, 98];
    const sdsPairs = [
      [-2.4, -2.0], [-2.0, -2.4], [-1.2, -0.7], [-0.4, -0.6], [0, 0.4],
      [0.6, 1.2], [1.3, 0.6], [1.9, 2.5], [2.3, 2.1], [0.2, 0.25]
    ];
    const gms = [0, 5, 6, 14];
    const mps = [null, -0.4, 1.2];
    const rds = [false, true];
    let compared = 0;
    for (const met of ['height', 'weight', 'bmi']) {
      for (const ca of centiles) {
        for (const cb of centiles) {
          for (const [sa, sb] of sdsPairs) {
            for (const gm of gms) {
              for (const mp of mps) {
                for (const rd of rds) {
                  expect(VildaTrajectoryAnalysis.verdictForPairCtx(met, sa, sb, ca, cb, gm, mp, rd))
                    .toEqual(realVerdict2(met, sa, sb, ca, cb, gm, mp, rd));
                  compared += 1;
                }
              }
            }
          }
        }
      }
    }
    expect(compared).toBe(3 * centiles.length * centiles.length * sdsPairs.length * gms.length * mps.length * rds.length);
  });
});

describe('kontekst kliniczny w silniku (nakładanie per odcinek)', () => {
  function makeVtaCtx(table) {
    const centileFromSds = (sds) => {
      const sign = sds >= 0 ? 1 : -1;
      const x = Math.abs(sds) / Math.SQRT2;
      const t = 1 / (1 + 0.3275911 * x);
      const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
      return Math.min(99.9, Math.max(0.1, 100 * 0.5 * (1 + sign * y)));
    };
    return loadBrowserScript('vilda_trajectory_analysis.js', {
      bmiSource: 'OLAF',
      advHistoryResolveMetric(param, value, sex, ageYears) {
        const key = `${param}|${Math.round(ageYears * 12)}`;
        if (!(key in table)) return { result: null, source: null, reason: '' };
        return { result: { percentile: centileFromSds(table[key]), sd: table[key] }, source: 'OLAF', reason: '' };
      }
    }).VildaTrajectoryAnalysis;
  }

  it('GH tylko w odcinku objętym terapią ≥6 mies.; poza nim werdykt populacyjny', () => {
    const vta = makeVtaCtx({ 'HT|60': -2.1, 'HT|72': -2.0, 'HT|84': -1.5 });
    const model = vta.analyze({
      measurements: [{ ageMonths: 60, height: 100 }, { ageMonths: 72, height: 108 }],
      currentAgeMonths: 84,
      currentHeight: 116,
      sex: 'M',
      context: { gh: { a: 72, b: null } } // terapia GH od 72. mies., nadal
    });
    const h = model.metrics.find((m) => m.metric === 'height');
    // odcinek 60→72: przed terapią (nakładanie 0) → werdykt populacyjny (niedobór, poprawa)
    expect(h.segments[0].ghOn).toBe(false);
    expect(h.segments[0].verdict).toEqual({ t: 'stable', l: 'stabilny tor wzrastania' });
    // odcinek 72→84: 12 mies. GH, ΔSDS +0,5 → dobra odpowiedź na GH
    expect(h.segments[1].ghOn).toBe(true);
    expect(h.segments[1].verdict).toEqual({ t: 'good', l: 'dobra odpowiedź na GH' });
  });

  it('kanał rodzicielski MPH zmienia werdykt wzrostu, redukcja zmienia werdykt wagi/BMI (ca≥10)', () => {
    const vta = makeVtaCtx({
      'HT|120': -2.0, 'HT|132': -1.8,
      'WT|120': 1.6, 'WT|132': 1.2,
      'BMI|120': 1.8, 'BMI|132': 1.3
    });
    const model = vta.analyze({
      measurements: [{ ageMonths: 120, height: 125, weight: 42 }],
      currentAgeMonths: 132,
      currentHeight: 131,
      currentWeight: 43,
      sex: 'K',
      context: { mpSds: -0.2, red: { a: 118, b: null, label: 'otyłość' } }
    });
    const h = model.metrics.find((m) => m.metric === 'height');
    expect(h.total).toEqual({ t: 'good', l: 'nadrabia względem kanału rodzicielskiego' });
    const wt = model.metrics.find((m) => m.metric === 'weight');
    expect(wt.segments[0].rdOn).toBe(true);
    expect(wt.total).toEqual({ t: 'good', l: 'redukcja w trakcie leczenia' });
    const bmi = model.metrics.find((m) => m.metric === 'bmi');
    expect(bmi.total).toEqual({ t: 'good', l: 'redukcja w trakcie leczenia' });
    const html = vta.buildPatientHtml(model);
    expect(html).toContain('kanał rodzicielski (MPH)');
    expect(html).toContain('zamierzona redukcja (otyłość)');
    expect(html).toContain(' ⬇');
  });

  it('bez kontekstu wynik identyczny jak dotychczas (regresja)', () => {
    const table = { 'HT|48': 0.4, 'HT|60': 0.3, 'HT|72': -0.9, 'HT|84': -1.0 };
    const vta = makeVtaCtx(table);
    const bare = vta.analyze({
      measurements: [{ ageMonths: 48, height: 104 }, { ageMonths: 60, height: 110 }, { ageMonths: 72, height: 113 }],
      currentAgeMonths: 84,
      currentHeight: 118,
      sex: 'M'
    });
    const withEmptyCtx = vta.analyze({
      measurements: [{ ageMonths: 48, height: 104 }, { ageMonths: 60, height: 110 }, { ageMonths: 72, height: 113 }],
      currentAgeMonths: 84,
      currentHeight: 118,
      sex: 'M',
      context: {}
    });
    expect(withEmptyCtx.context).toBeNull();
    expect(withEmptyCtx.metrics.find((m) => m.metric === 'height').total)
      .toEqual(bare.metrics.find((m) => m.metric === 'height').total);
  });
});

describe('banery kart wzrostowych z modelu (wariant 1 konsolidacji)', () => {
  function makeVta(table) {
    const centileFromSds = (sds) => {
      const sign = sds >= 0 ? 1 : -1;
      const x = Math.abs(sds) / Math.SQRT2;
      const t = 1 / (1 + 0.3275911 * x);
      const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
      return Math.min(99.9, Math.max(0.1, 100 * 0.5 * (1 + sign * y)));
    };
    const appSource = fs.readFileSync(path.join(repositoryRoot, 'app.js'), 'utf8');
    const cut = (name) => {
      const i = appSource.indexOf(`function ${name}(`);
      let depth = 0;
      for (let k = appSource.indexOf('{', i); k < appSource.length; k += 1) {
        if (appSource[k] === '{') depth += 1;
        else if (appSource[k] === '}') { depth -= 1; if (depth === 0) return appSource.slice(i, k + 1); }
      }
      throw new Error(name);
    };
    const helpers = new Function(`
      ${cut('pickPrevForLastYear')}
      ${cut('pickPrevFallback')}
      ${cut('velocityCmPerYear')}
      ${cut('getVelocityThreshold')}
      return { pickPrevForLastYear, pickPrevFallback, velocityCmPerYear, getVelocityThreshold };
    `)();
    return loadBrowserScript('vilda_trajectory_analysis.js', {
      bmiSource: 'OLAF',
      ...helpers,
      advHistoryResolveMetric(param, value, sex, ageYears) {
        const key = `${param}|${Math.round(ageYears * 12)}`;
        if (!(key in table)) return { result: null, source: null, reason: '' };
        return { result: { percentile: centileFromSds(table[key]), sd: table[key] }, source: 'OLAF', reason: '' };
      }
    }).VildaTrajectoryAnalysis;
  }

  it('buildCardAlertsHtml renderuje flagę i alarm tempa; oba znikają, gdy trajektoria czysta', () => {
    const vta = makeVta({ 'HT|48': 0.3, 'HT|84': -0.9, 'HT|96': -1.0 });
    // flaga (Δ −1,3 od 48 mies.) + tempo 4 cm w 12 mies. → poniżej normy 5–10 lat
    const alarmed = vta.analyze({
      measurements: [{ ageMonths: 48, height: 104 }, { ageMonths: 84, height: 120 }],
      currentAgeMonths: 96,
      currentHeight: 124,
      sex: 'M'
    });
    const html = vta.buildCardAlertsHtml(alarmed);
    expect(html).toContain('istotne obniżenie pozycji centylowej wzrostu');
    expect(html).toContain('obraz deceleracji wzrastania');
    expect(html).toContain('Tempo wzrastania poniżej normy dla wieku');
    expect(html).toContain('norma: ≥5 cm/rok');
    expect(html).toContain('umów wizytę');
    const clean = vta.analyze({
      measurements: [{ ageMonths: 48, height: 104 }],
      currentAgeMonths: 60,
      currentHeight: 111,
      sex: 'M'
    });
    // brak flagi (Δ 0) — tempo 7 cm/rok w normie 3–5 lat
    expect(vta.buildCardAlertsHtml(clean)).toBe('');
    expect(vta.buildCardAlertsHtml(null)).toBe('');
  });

  it('buildHtml z hideRedFlag nie powtarza flagi (baner karty ją niesie), bez opcji — powtarza', () => {
    const vta = makeVta({ 'HT|48': 0.3, 'HT|84': -0.9, 'HT|96': -1.0 });
    const model = vta.analyze({
      measurements: [{ ageMonths: 48, height: 104 }, { ageMonths: 84, height: 120 }],
      currentAgeMonths: 96,
      currentHeight: 124,
      sex: 'M'
    });
    expect(vta.buildHtml(model)).toContain('Istotne obniżenie pozycji centylowej wzrostu');
    const hidden = vta.buildHtml(model, { hideRedFlag: true });
    expect(hidden).not.toContain('Istotne obniżenie pozycji centylowej wzrostu');
    expect(hidden).toContain('Automatyczna analiza trajektorii');
    // model niezmutowany — flaga nadal w modelu (dla banera i plakietek)
    expect(model.metrics.find((m) => m.metric === 'height').redFlag).not.toBeNull();
  });
});

describe('ocena tempa >10 lat: hierarchia Tanner → wiek kostny → reguła generyczna', () => {
  function makeVta(table) {
    const centileFromSds = (sds) => {
      const sign = sds >= 0 ? 1 : -1;
      const x = Math.abs(sds) / Math.SQRT2;
      const t = 1 / (1 + 0.3275911 * x);
      const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
      return Math.min(99.9, Math.max(0.1, 100 * 0.5 * (1 + sign * y)));
    };
    const appSource = fs.readFileSync(path.join(repositoryRoot, 'app.js'), 'utf8');
    const cut = (name) => {
      const i = appSource.indexOf(`function ${name}(`);
      let depth = 0;
      for (let k = appSource.indexOf('{', i); k < appSource.length; k += 1) {
        if (appSource[k] === '{') depth += 1;
        else if (appSource[k] === '}') { depth -= 1; if (depth === 0) return appSource.slice(i, k + 1); }
      }
      throw new Error(name);
    };
    const helpers = new Function(`
      ${cut('pickPrevForLastYear')}
      ${cut('pickPrevFallback')}
      ${cut('velocityCmPerYear')}
      ${cut('getVelocityThreshold')}
      return { pickPrevForLastYear, pickPrevFallback, velocityCmPerYear, getVelocityThreshold };
    `)();
    return loadBrowserScript('vilda_trajectory_analysis.js', {
      bmiSource: 'OLAF',
      ...helpers,
      advHistoryResolveMetric(param, value, sex, ageYears) {
        const key = `${param}|${Math.round(ageYears * 12)}`;
        if (!(key in table)) return { result: null, source: null, reason: '' };
        return { result: { percentile: centileFromSds(table[key]), sd: table[key] }, source: 'OLAF', reason: '' };
      }
    }).VildaTrajectoryAnalysis;
  }

  // 12-latek, 3 cm w 12 mies. → 3,0 cm/rok (<4)
  function analyzeSlow12(vta, sex, context) {
    return vta.analyze({
      measurements: [{ ageMonths: 132, height: 150 }],
      currentAgeMonths: 144,
      currentHeight: 153,
      sex,
      context
    });
  }
  const T = { 'HT|132': 0, 'HT|144': -0.3 };

  it('Tanner I: poziom alarmowy (danger) — baner tempa aktywny', () => {
    const vta = makeVta(T);
    const m = analyzeSlow12(vta, 'M', { tannerStage: 1 });
    expect(m.velocity.slow).toBe(true);
    expect(m.velocity.severity).toBe('danger');
    expect(m.velocity.alarm).toBe(true);
    expect(m.velocity.basis).toBe('tanner1');
    const alerts = vta.buildCardAlertsHtml(m);
    expect(alerts).toContain('Tempo wzrastania poniżej normy dla wieku');
    expect(alerts).toContain('Tanner I');
  });

  it('Tanner II–III: czujność (warn) — bez banera; Tanner IV–V: bez oceny, nota o deceleracji', () => {
    const vta = makeVta(T);
    const m2 = analyzeSlow12(vta, 'K', { tannerStage: 2 });
    expect(m2.velocity.slow).toBe(true);
    expect(m2.velocity.severity).toBe('warn');
    expect(m2.velocity.alarm).toBe(false);
    expect(vta.buildCardAlertsHtml(m2)).toBe('');
    expect(vta.buildPatientHtml(m2)).toContain('do oceny');
    const m4 = analyzeSlow12(vta, 'K', { tannerStage: 4 });
    expect(m4.velocity.slow).toBe(false);
    expect(m4.velocity.note).toContain('deceleracja fizjologiczna');
  });

  it('wiek kostny: świeży BA <10 lat dobiera normę wg BA na poziomie warn; nieświeży → reguła generyczna', () => {
    const vta = makeVta(T);
    // BA 8 lat oznaczony przy 140 mies. (świeży): norma ≥5 cm/rok → 3,0 poniżej → warn
    const fresh = analyzeSlow12(vta, 'M', { boneAge: { baMonths: 96, atAgeMonths: 140 } });
    expect(fresh.velocity.basis).toBe('boneAge');
    expect(fresh.velocity.slow).toBe(true);
    expect(fresh.velocity.severity).toBe('warn');
    expect(fresh.velocity.alarm).toBe(false);
    expect(fresh.velocity.normLabel).toContain('wieku kostnego');
    // BA oznaczony przy 100 mies. (44 mies. temu — nieświeży) → poziom 3 (generyczny)
    const stale = analyzeSlow12(vta, 'M', { boneAge: { baMonths: 96, atAgeMonths: 100 } });
    expect(stale.velocity.basis).toBe('generic');
  });

  it('reguła generyczna: okna wiekowe dziewczęta ≤13 lat / chłopcy ≤15 lat', () => {
    const vta = makeVta({ 'HT|156': 0, 'HT|168': -0.3 });
    const mk = (sex) => vta.analyze({
      measurements: [{ ageMonths: 156, height: 155 }],
      currentAgeMonths: 168,
      currentHeight: 158,
      sex
    });
    const boy14 = mk('M'); // 14 lat — w oknie chłopców (≤15)
    expect(boy14.velocity.basis).toBe('generic');
    expect(boy14.velocity.slow).toBe(true);
    expect(boy14.velocity.severity).toBe('warn');
    const girl14 = mk('K'); // 14 lat — poza oknem dziewcząt (≤13)
    expect(girl14.velocity.basis).toBeNull();
    expect(girl14.velocity.aboveNormAge).toBe(true);
    expect(girl14.velocity.slow).toBe(false);
  });

  it('poniżej 10 lat zachowanie bez zmian (norma metrykalna, poziom alarmowy)', () => {
    const vta = makeVta({ 'HT|84': 0, 'HT|96': -0.2 });
    const m = vta.analyze({
      measurements: [{ ageMonths: 84, height: 120 }],
      currentAgeMonths: 96,
      currentHeight: 124,
      sex: 'M'
    });
    expect(m.velocity.basis).toBe('age');
    expect(m.velocity.slow).toBe(true);
    expect(m.velocity.severity).toBe('danger');
    expect(m.velocity.alarm).toBe(true);
  });

  it('opóźnione dojrzewanie: Tanner I u dziewczynki >13 lat / chłopca >14 lat', () => {
    const vta = makeVta({ 'HT|150': 0, 'HT|162': -0.2 });
    const mk = (sex) => vta.analyze({
      measurements: [{ ageMonths: 150, height: 150 }],
      currentAgeMonths: 162, // 13,5 roku
      currentHeight: 155,
      sex,
      context: { tannerStage: 1 }
    });
    const girl = mk('K'); // 13,5 > 13 → nota
    expect(girl.delayedPuberty).toBe(true);
    expect(vta.buildPatientHtml(girl)).toContain('obraz opóźnionego dojrzewania');
    expect(vta.buildHtml(girl)).toContain('obraz opóźnionego dojrzewania');
    const boy = mk('M'); // 13,5 < 14 → bez noty
    expect(boy.delayedPuberty).toBe(false);
  });
});

describe('etap Tannera z rekordu pacjenta (świeżość TANNER_FRESH_M)', () => {
  function makeVta(table) {
    const centileFromSds = (sds) => {
      const sign = sds >= 0 ? 1 : -1;
      const x = Math.abs(sds) / Math.SQRT2;
      const t = 1 / (1 + 0.3275911 * x);
      const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
      return Math.min(99.9, Math.max(0.1, 100 * 0.5 * (1 + sign * y)));
    };
    const appSource = fs.readFileSync(path.join(repositoryRoot, 'app.js'), 'utf8');
    const cut = (name) => {
      const i = appSource.indexOf(`function ${name}(`);
      let depth = 0;
      for (let k = appSource.indexOf('{', i); k < appSource.length; k += 1) {
        if (appSource[k] === '{') depth += 1;
        else if (appSource[k] === '}') { depth -= 1; if (depth === 0) return appSource.slice(i, k + 1); }
      }
      throw new Error(name);
    };
    const helpers = new Function(`
      ${cut('pickPrevForLastYear')}
      ${cut('pickPrevFallback')}
      ${cut('velocityCmPerYear')}
      ${cut('getVelocityThreshold')}
      return { pickPrevForLastYear, pickPrevFallback, velocityCmPerYear, getVelocityThreshold };
    `)();
    return loadBrowserScript('vilda_trajectory_analysis.js', {
      bmiSource: 'OLAF',
      ...helpers,
      advHistoryResolveMetric(param, value, sex, ageYears) {
        const key = `${param}|${Math.round(ageYears * 12)}`;
        if (!(key in table)) return { result: null, source: null, reason: '' };
        return { result: { percentile: centileFromSds(table[key]), sd: table[key] }, source: 'OLAF', reason: '' };
      }
    }).VildaTrajectoryAnalysis;
  }
  const T = { 'HT|150': 0, 'HT|162': -0.2 };
  const mk = (vta, context) => vta.analyze({
    measurements: [{ ageMonths: 150, height: 150 }],
    currentAgeMonths: 162, // 13,5 roku, tempo 3,0 cm/rok
    currentHeight: 153,
    sex: 'K',
    context
  });

  it('świeży Tanner z rekordu (≤12 mies.) działa jak z formularza — ocena i nota o dojrzewaniu', () => {
    const vta = makeVta(T);
    const m = mk(vta, { tannerStage: 1, tannerAtAgeMonths: 156 }); // zapis 6 mies. temu
    expect(m.context.tannerStage).toBe(1);
    expect(m.velocity.basis).toBe('tanner1');
    expect(m.velocity.alarm).toBe(true);
    expect(m.delayedPuberty).toBe(true);
    expect(vta.buildPatientHtml(m)).toContain('z zapisu w wieku 13 lat');
  });

  it('nieaktualny Tanner (>12 mies.) jest pominięty: ocena generyczna, bez noty, pasek pokazuje pominięcie', () => {
    const vta = makeVta(T);
    const m = mk(vta, { tannerStage: 1, tannerAtAgeMonths: 140 }); // zapis 22 mies. temu
    expect(m.context.tannerStage).toBeNull();
    expect(m.context.tannerStale).toBe(true);
    expect(m.velocity.basis).toBeNull(); // dziewczynka 13,5 r. — poza oknem generycznym
    expect(m.velocity.aboveNormAge).toBe(true);
    expect(m.delayedPuberty).toBe(false);
    const html = vta.buildPatientHtml(m);
    expect(html).toContain('nieaktualny, pominięty w ocenie');
    expect(html).not.toContain('obraz opóźnionego dojrzewania');
  });

  it('Tanner bez wieku zapisu (bieżący formularz) — zawsze aktualny (regresja kart)', () => {
    const vta = makeVta(T);
    const m = mk(vta, { tannerStage: 2 });
    expect(m.context.tannerStage).toBe(2);
    expect(m.velocity.basis).toBe('tanner23');
    expect(m.velocity.severity).toBe('warn');
  });
});

describe('panel trajektorii w karcie zaawansowanej (buildCardPanelHtml, hybryda)', () => {
  function makeVta(table, browserExtra = {}) {
    const centileFromSds = (sds) => {
      const sign = sds >= 0 ? 1 : -1;
      const x = Math.abs(sds) / Math.SQRT2;
      const t = 1 / (1 + 0.3275911 * x);
      const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
      return Math.min(99.9, Math.max(0.1, 100 * 0.5 * (1 + sign * y)));
    };
    return loadBrowserScript('vilda_trajectory_analysis.js', {
      bmiSource: 'OLAF',
      ...browserExtra,
      advHistoryResolveMetric(param, value, sex, ageYears) {
        const key = `${param}|${Math.round(ageYears * 12)}`;
        if (!(key in table)) return { result: null, source: null, reason: '' };
        return { result: { percentile: centileFromSds(table[key]), sd: table[key] }, source: 'OLAF', reason: '' };
      }
    }).VildaTrajectoryAnalysis;
  }
  const T = { 'HT|48': 0.3, 'HT|84': -0.9, 'HT|96': -1.0 };
  const mkModel = (vta) => vta.analyze({
    measurements: [{ ageMonths: 48, height: 104 }, { ageMonths: 84, height: 120 }],
    currentAgeMonths: 96,
    currentHeight: 124,
    sex: 'M'
  });

  it('opakowuje panel pacjenta w blok wynikowy karty, domyślnie rozwinięty i bez flagi (baner ją niesie)', () => {
    const vta = makeVta(T);
    const html = vta.buildCardPanelHtml(mkModel(vta));
    expect(html).toContain('adv-growth-result-block--trajectory');
    expect(html).toContain('class="vtap"');
    expect(html).toContain('vtap-main" open');
    expect(html).toContain('Analiza trajektorii');
    expect(html).not.toContain('Istotne obniżenie pozycji centylowej wzrostu');
    expect(vta.buildCardPanelHtml(null)).toBe('');
  });

  it('respektuje zapamiętane zwinięcie z localStorage (wspólny klucz z Kartą pacjenta)', () => {
    const store = { vildaTrajectoryPanelCollapsed: '1' };
    const vta = makeVta(T, {
      localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }
    });
    expect(vta.isPanelCollapsed()).toBe(true);
    const html = vta.buildCardPanelHtml(mkModel(vta));
    expect(html).toContain('vtap-main"');
    expect(html).not.toContain('vtap-main" open');
    // jawna opcja wygrywa
    expect(vta.buildCardPanelHtml(mkModel(vta), { collapsed: false })).toContain('vtap-main" open');
  });

  it('wirePanelToggle zapisuje stan przy zwijaniu/rozwijaniu (idempotentnie)', () => {
    const store = {};
    const vta = makeVta(T, {
      localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } }
    });
    let listener = null;
    const main = {
      open: true,
      _vtaWired: undefined,
      addEventListener(ev, fn) { if (ev === 'toggle') listener = fn; }
    };
    const scope = { querySelector: (sel) => (sel === '.vtap-main' ? main : null) };
    expect(vta.wirePanelToggle(scope)).toBe(true);
    expect(vta.wirePanelToggle(scope)).toBe(false); // już wpięte
    main.open = false;
    listener();
    expect(store.vildaTrajectoryPanelCollapsed).toBe('1');
    main.open = true;
    listener();
    expect(store.vildaTrajectoryPanelCollapsed).toBe('0');
  });
});

describe('assessVelocityValue — ocena gotowej wartości tempa tą samą hierarchią norm', () => {
  function makeVta() {
    const appSource = fs.readFileSync(path.join(repositoryRoot, 'app.js'), 'utf8');
    const cut = (name) => {
      const i = appSource.indexOf(`function ${name}(`);
      let depth = 0;
      for (let k = appSource.indexOf('{', i); k < appSource.length; k += 1) {
        if (appSource[k] === '{') depth += 1;
        else if (appSource[k] === '}') { depth -= 1; if (depth === 0) return appSource.slice(i, k + 1); }
      }
      throw new Error(name);
    };
    const helpers = new Function(`
      ${cut('pickPrevForLastYear')}
      ${cut('pickPrevFallback')}
      ${cut('velocityCmPerYear')}
      ${cut('getVelocityThreshold')}
      return { pickPrevForLastYear, pickPrevFallback, velocityCmPerYear, getVelocityThreshold };
    `)();
    return loadBrowserScript('vilda_trajectory_analysis.js', {
      bmiSource: 'OLAF',
      ...helpers,
      advHistoryResolveMetric() {
        return { result: { percentile: 50, sd: 0 }, source: 'OLAF', reason: '' };
      }
    }).VildaTrajectoryAnalysis;
  }

  it('<10 lat: produkcyjny próg wg wieku, poziom alarmowy (parytet z heightVelocity w analyze)', () => {
    const vta = makeVta();
    const va = vta.assessVelocityValue(4.0, 12, 96, 'M', null);
    expect(va.usedLastYear).toBe(true);
    expect(va.basis).toBe('age');
    expect(va.slow).toBe(true);
    expect(va.severity).toBe('danger');
    expect(va.alarm).toBe(true);
    // parytet z pełnym heightVelocity liczonym z punktów (4 cm w 12 mies., 8 lat)
    const model = vta.analyze({
      measurements: [{ ageMonths: 84, height: 120 }],
      currentAgeMonths: 96,
      currentHeight: 124,
      sex: 'M'
    });
    expect(va.slow).toBe(model.velocity.slow);
    expect(va.severity).toBe(model.velocity.severity);
    expect(va.basis).toBe(model.velocity.basis);
    expect(va.normLabel).toBe(model.velocity.normLabel);
    // 4,7 cm/rok w wieku 6 lat: poniżej normy ≥5 (stara reguła 4,5 mówiła „w normie”)
    const va2 = vta.assessVelocityValue(4.7, 12, 72, 'M', null);
    expect(va2.slow).toBe(true);
    // 5,5 cm/rok w wieku 4,5 roku: poniżej normy ≥6 (stara reguła 4,5 mówiła „w normie”)
    const va3 = vta.assessVelocityValue(5.5, 12, 54, 'M', null);
    expect(va3.slow).toBe(true);
  });

  it('odstęp poza oknem rocznym (6–15 mies.): bez porównania z normą', () => {
    const vta = makeVta();
    const va = vta.assessVelocityValue(3.0, 30, 96, 'M', null);
    expect(va.usedLastYear).toBe(false);
    expect(va.slow).toBe(false);
    const va2 = vta.assessVelocityValue(3.0, 4, 96, 'M', null);
    expect(va2.usedLastYear).toBe(false);
  });

  it('>10 lat: hierarchia Tanner → wiek kostny → reguła generyczna jak w analyze', () => {
    const vta = makeVta();
    const t1 = vta.assessVelocityValue(3.0, 12, 144, 'M', { tannerStage: 1 });
    expect(t1.basis).toBe('tanner1');
    expect(t1.severity).toBe('danger');
    expect(t1.alarm).toBe(true);
    const t4 = vta.assessVelocityValue(3.0, 12, 144, 'M', { tannerStage: 4 });
    expect(t4.slow).toBe(false);
    expect(t4.normLabel).toBeNull();
    expect(t4.note).toContain('deceleracja fizjologiczna');
    const ba = vta.assessVelocityValue(4.2, 12, 132, 'M', { boneAge: { baMonths: 108, atAgeMonths: 132 } });
    expect(ba.basis).toBe('boneAge');
    expect(ba.slow).toBe(true);
    expect(ba.severity).toBe('warn');
    const gen = vta.assessVelocityValue(3.0, 12, 156, 'K', null);
    expect(gen.basis).toBe('generic');
    expect(gen.severity).toBe('warn');
    // dziewczynka 13,5 r.: powyżej okna generycznego → bez oceny
    const above = vta.assessVelocityValue(3.0, 12, 163, 'K', null);
    expect(above.basis).toBeNull();
    expect(above.aboveNormAge).toBe(true);
    expect(above.normLabel).toBeNull();
  });

  it('brak wartości lub wieku → null', () => {
    const vta = makeVta();
    expect(vta.assessVelocityValue(null, 12, 96, 'M', null)).toBeNull();
    expect(vta.assessVelocityValue(4.0, 12, null, 'M', null)).toBeNull();
  });
});

describe('siatki Karty pacjenta — pionowa linia najechania kończy się na osi X siatki BMI', () => {
  it('wysokość linii liczona helperem crossH (oś X ostatniego SVG), nie wysokością hosta z panelem trajektorii', () => {
    const source = fs.readFileSync(path.join(repositoryRoot, 'vilda_auth_ui.js'), 'utf8');
    expect(source).toContain('function crossH(hr){try{var l9=svgs[svgs.length-1]');
    expect(source).toContain('r9.height*((s9.H-s9.padB)/s9.H)');
    expect(source.match(/line\.style\.height=crossH\(hr\)\+"px"/g)).toHaveLength(2);
    expect(source).not.toContain('line.style.height=hr.height+"px"');
  });
});

describe('BMI >97. centyla nigdy „stabilny tor BMI” (decyzja właściciela 2026-08-09)', () => {
  it('mała zmiana przy BMI >97c daje ostrzeżenie; waga i BMI <97c bez zmian; parytet z realnym verdictCh', () => {
    const vta = loadModule().VildaTrajectoryAnalysis;
    expect(vta.verdictForPair('bmi', 2.3, 2.4, 98.9, 99.2)).toEqual({ t: 'warn', l: 'utrzymująca się otyłość (>97c)' });
    expect(vta.verdictForPair('bmi', 2.4, 2.4, 99.2, 99.2)).toEqual({ t: 'warn', l: 'utrzymująca się otyłość (>97c)' });
    expect(vta.verdictForPair('weight', 2.3, 2.4, 98.9, 99.2)).toEqual({ t: 'stable', l: 'stabilny tor masy ciała' });
    expect(vta.verdictForPair('bmi', 1.2, 1.3, 88, 90)).toEqual({ t: 'stable', l: 'stabilny tor BMI' });
    const real = extractRealVerdictCh();
    for (const [sa, sb, ca, cb] of [[2.3, 2.4, 98.9, 99.2], [2.4, 2.4, 99.2, 99.2], [2.4, 2.3, 99.2, 98.9]]) {
      expect(vta.verdictForPair('bmi', sa, sb, ca, cb)).toEqual(real('bmi', sa, sb, ca, cb));
    }
  });
});

describe('chip odpowiedzi na leczenie (para od startu zamierzonej redukcji)', () => {
  function makeVta(table) {
    const centileFromSds = (sds) => Math.min(99.9, Math.max(0.1, 100 * (0.5 * (1 + Math.tanh(sds * 0.79)))));
    return loadBrowserScript('vilda_trajectory_analysis.js', {
      bmiSource: 'OLAF',
      advHistoryResolveMetric(param, value, sex, ageYears) {
        const key = `${param}|${Math.round(ageYears * 12)}`;
        if (!(key in table)) return { result: null, source: null, reason: '' };
        return { result: { percentile: centileFromSds(table[key]), sd: table[key] }, source: 'OLAF', reason: '' };
      }
    }).VildaTrajectoryAnalysis;
  }

  it('chip wiersza pokazuje werdykt okresu leczenia, całość zostaje w total', () => {
    const vta = makeVta({ 'WT|144': 1.0, 'WT|192': 1.5, 'WT|196': 1.2 });
    const m = vta.analyze({
      measurements: [
        { ageMonths: 144, weight: 52 },
        { ageMonths: 192, weight: 66 }
      ],
      currentAgeMonths: 196, currentWeight: 64, sex: 'K',
      context: { red: { a: 192, b: null, label: 'Wegovy' } }
    });
    const wt = m.metrics.find((x) => x.metric === 'weight');
    expect(wt.total.l).toBe('narasta mimo leczenia');
    expect(wt.treatment).not.toBeNull();
    expect(wt.treatment.dSds).toBeCloseTo(-0.3, 5);
    expect(wt.treatment.verdict.l).toBe('redukcja w trakcie leczenia');
    const html = vta.buildPatientHtml(m);
    expect(html).toContain('redukcja w trakcie leczenia');
    expect(html).toContain('okres leczenia (od 16 lat)');
  });

  it('bez kontekstu redukcji chip pozostaje werdyktem całości (regresja)', () => {
    const vta = makeVta({ 'WT|144': 1.0, 'WT|192': 1.5, 'WT|196': 1.2 });
    const m = vta.analyze({
      measurements: [{ ageMonths: 144, weight: 52 }, { ageMonths: 192, weight: 66 }],
      currentAgeMonths: 196, currentWeight: 64, sex: 'K'
    });
    const wt = m.metrics.find((x) => x.metric === 'weight');
    expect(wt.treatment).toBeNull();
  });
});

describe('siatki Karty pacjenta — dymek i zaznaczanie tekstu nad panelem trajektorii', () => {
  it('mousemove/pointerdown ignorują panel (.vtap), a tekst panelu można zaznaczać', () => {
    const source = fs.readFileSync(path.join(repositoryRoot, 'vilda_auth_ui.js'), 'utf8');
    expect(source).toContain('if(e.target&&e.target.closest&&e.target.closest(".vtap")){if(cmp){');
    expect(source).toContain('g=e.target&&e.target.closest&&e.target.closest(".vtap")?null:');
    expect(source).toContain('.vilda-siatka-charts .vtap{-webkit-user-select:text;user-select:text}');
  });
});

describe('start z niedoboru masy/BMI: etykietę różnicuje centyl końcowy (decyzja właściciela 2026-08-09)', () => {
  it('masa: nadrabia (<10c) / wyrównanie (10–75c) / do obserwacji (75–90c) / przekroczenie 90c; parytet z verdictCh', () => {
    const vta = loadModule().VildaTrajectoryAnalysis;
    expect(vta.verdictForPair('weight', -1.5, -1.25, 7, 9.5)).toEqual({ t: 'good', l: 'nadrabia niedobór masy ciała' });
    expect(vta.verdictForPair('weight', -1.5, -0.3, 7, 36)).toEqual({ t: 'good', l: 'wyrównanie niedoboru masy ciała' });
    expect(vta.verdictForPair('weight', -1.5, 0.85, 7, 80)).toEqual({ t: 'warn', l: 'wyrównanie niedoboru z szybkim przyrostem masy ciała — do obserwacji' });
    expect(vta.verdictForPair('weight', -1.5, 1.5, 7, 93)).toEqual({ t: 'bad', l: 'przekroczenie 90. centyla masy ciała po wyrównaniu niedoboru' });
    const real = extractRealVerdictCh();
    for (const [met, sa, sb, ca, cb] of [
      ['weight', -1.5, -0.3, 7, 36], ['weight', -1.5, 0.85, 7, 80], ['weight', -1.5, 1.5, 7, 93],
      ['bmi', -1.4, 0, 8, 50], ['bmi', -1.4, 1.3, 8, 90], ['bmi', -1.4, 2.1, 8, 98]
    ]) {
      expect(vta.verdictForPair(met, sa, sb, ca, cb)).toEqual(real(met, sa, sb, ca, cb));
    }
  });

  it('BMI: wyrównanie (10–85c) / do obserwacji (85–97c) / przekroczenie progu otyłości (≥97c); wzrost bez zmian', () => {
    const vta = loadModule().VildaTrajectoryAnalysis;
    expect(vta.verdictForPair('bmi', -1.4, 0, 8, 50)).toEqual({ t: 'good', l: 'wyrównanie niedoboru (BMI)' });
    expect(vta.verdictForPair('bmi', -1.4, 1.3, 8, 90)).toEqual({ t: 'warn', l: 'wyrównanie niedoboru z szybkim przyrostem BMI — do obserwacji' });
    expect(vta.verdictForPair('bmi', -1.4, 2.1, 8, 98)).toEqual({ t: 'bad', l: 'przekroczenie progu otyłości (≥97c)' });
    expect(vta.verdictForPair('height', -1.7, -0.5, 5, 30)).toEqual({ t: 'good', l: 'nadrabia niedobór wzrostu' });
    expect(vta.verdictForPair('weight', -1.5, -1.7, 7, 5)).toEqual({ t: 'warn', l: 'pogłębianie niedoboru masy ciała' });
  });
});
