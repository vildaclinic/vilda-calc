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
    // >10 lat: getVelocityThreshold zwraca null — moduł oznacza brak automatycznej oceny
    const model2 = vta.analyze({
      measurements: [{ ageMonths: 144, height: 150 }],
      currentAgeMonths: 156,
      currentHeight: 153,
      sex: 'M'
    });
    expect(model2.velocity.threshold).toBeNull();
    expect(model2.velocity.slow).toBe(false);
    expect(model2.velocity.aboveNormAge).toBe(true);
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
