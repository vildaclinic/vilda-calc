import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Testy wołają PRAWDZIWE funkcje produkcyjne (AGENTS.md §3.5): moduł
// vilda_centile_interpolation.js ładowany jest z pliku produkcyjnego razem
// z produkcyjnymi danymi centile_data.js — bez kopii algorytmu ani danych.
function loadInterp() {
  const browserGlobal = {};
  loadBrowserScript('centile_data.js', browserGlobal);
  loadBrowserScript('vilda_centile_interpolation.js', browserGlobal);
  return browserGlobal;
}

const PERCENTILES = [3, 10, 25, 50, 75, 90, 97];
const SERIES = [
  ['WT', 'weight'],
  ['HT', 'height'],
  ['BMI', 'bmi'],
];

describe('VildaCentileInterp (PCHIP, dane Palczewskiej)', () => {
  it('publikuje zamrożone API i raportuje gotowość na produkcyjnych danych', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;

    expect(Object.isFrozen(api)).toBe(true);
    expect(api.method).toBe('pchip-fritsch-carlson');
    expect(api.isReady()).toBe(true);
  });

  it('dane źródłowe są kompletne: 180 wierszy z pełnym p3–p97', () => {
    const g = loadInterp();
    let rows = 0;
    for (const sex of ['boys', 'girls']) {
      for (const [, kindKey] of SERIES) {
        for (const row of g.centileData[sex][kindKey]) {
          rows += 1;
          for (const p of PERCENTILES) {
            expect(Number.isFinite(row[`p${p}`]), `${sex}/${kindKey}/${row.months}/p${p}`).toBe(true);
          }
        }
      }
    }
    expect(rows).toBe(180);
  });

  it('przechodzi DOKŁADNIE przez każdą opublikowaną wartość referencyjną (1260 węzłów)', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;
    let checks = 0;
    for (const sex of ['M', 'F']) {
      const sexKey = sex === 'M' ? 'boys' : 'girls';
      for (const [kind, kindKey] of SERIES) {
        for (const row of g.centileData[sexKey][kindKey]) {
          for (const p of PERCENTILES) {
            expect(api.palCentileValue(sex, row.months, p, kind)).toBe(row[`p${p}`]);
            checks += 1;
          }
        }
      }
    }
    expect(checks).toBe(1260);
  });

  it('nie tworzy przecięć linii centylowych na gęstej siatce wieku (co 0,25 mies.)', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;
    // Zakres od pierwszego węzła (1 mies.): poniżej działa ekstrapolacja
    // liniowa odziedziczona po starej funkcji, w której p90/p97 BMI
    // dziewczynek zbiegają się w m. 0 — to zachowanie legacy, nie PCHIP.
    for (const sex of ['M', 'F']) {
      for (const [kind] of SERIES) {
        for (let m = 1; m <= 222; m += 0.25) {
          const values = PERCENTILES.map((p) => api.palCentileValue(sex, m, p, kind));
          for (let i = 1; i < values.length; i += 1) {
            expect(values[i], `${sex}/${kind}/${m} mies.: p${PERCENTILES[i]} <= p${PERCENTILES[i - 1]}`)
              .toBeGreaterThan(values[i - 1]);
          }
        }
      }
    }
  });

  it('jest monotoniczny między węzłami tam, gdzie dane są monotoniczne (brak przestrzeleń)', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;
    const rows = g.centileData.boys.height;
    // Wzrost p50 chłopców rośnie na całym zakresie danych — interpolacja
    // musi być niemalejąca na gęstej siatce.
    let previous = -Infinity;
    for (let m = rows[0].months; m <= rows[rows.length - 1].months; m += 0.1) {
      const value = api.palCentileValue('M', m, 50, 'HT');
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
    // Wartości między węzłami mieszczą się w przedziale sąsiednich węzłów.
    for (let i = 0; i < rows.length - 1; i += 1) {
      const mid = (rows[i].months + rows[i + 1].months) / 2;
      const value = api.palCentileValue('M', mid, 50, 'HT');
      expect(value).toBeGreaterThanOrEqual(Math.min(rows[i].p50, rows[i + 1].p50));
      expect(value).toBeLessThanOrEqual(Math.max(rows[i].p50, rows[i + 1].p50));
    }
  });

  it('zachowuje brzegi identycznie z dotychczasową funkcją produkcyjną (m. 0 i >= ostatni węzeł)', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;
    for (const sex of ['M', 'F']) {
      const sexKey = sex === 'M' ? 'boys' : 'girls';
      for (const [kind, kindKey] of SERIES) {
        const rows = g.centileData[sexKey][kindKey];
        const first = rows[0];
        const second = rows[1];
        const last = rows[rows.length - 1];
        for (const p of PERCENTILES) {
          // Ekstrapolacja liniowa z dwóch pierwszych węzłów (miesiąc 0 siatki 0–3).
          const slope = (second[`p${p}`] - first[`p${p}`]) / (second.months - first.months);
          const expected0 = first[`p${p}`] + (0 - first.months) * slope;
          expect(api.palCentileValue(sex, 0, p, kind)).toBeCloseTo(expected0, 10);
          // Za ostatnim węzłem: wartość ostatniego węzła.
          expect(api.palCentileValue(sex, last.months + 18, p, kind)).toBe(last[`p${p}`]);
        }
      }
    }
  });

  it('przypadek syntetyczny: chłopiec 4 mies. — krzywa p50 wagi równa tabeli (7,2 kg), bez odchyłki −0,30 kg starego wygładzania', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;
    // Wejście: płeć M, wiek 4 mies., p50 wagi. Oczekiwany wynik: dokładnie
    // 7,2 kg (Palczewska 1999). Stare wygładzanie rysowało tu ~6,90 kg.
    expect(api.palCentileValue('M', 4, 50, 'WT')).toBe(7.2);
    // Wejście: p97 wagi chłopców 13 lat (156 mies.) — miejsce największej
    // odchyłki starego wygładzania (−0,44 kg); teraz równa węzłowi tabeli:
    const row156 = g.centileData.boys.weight.find((r) => r.months === 156);
    expect(api.palCentileValue('M', 156, 97, 'WT')).toBe(row156.p97);
  });

  it('odrzuca wejścia spoza kontraktu tak, aby konsument użył ścieżki fallback', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;
    expect(api.palCentileValue('M', -1, 50, 'WT')).toBeNull();
    expect(api.palCentileValue('M', Number.NaN, 50, 'WT')).toBeNull();
    expect(api.palCentileValue('M', 12, 51, 'WT')).toBeNull();
    const empty = {};
    loadBrowserScript('vilda_centile_interpolation.js', empty);
    expect(empty.VildaCentileInterp.isReady()).toBe(false);
    expect(empty.VildaCentileInterp.palCentileValue('M', 12, 50, 'WT')).toBeNull();
  });

  it('createPchip: interpoluje przez węzły i pozostaje monotoniczny na danych ze zmianą tempa', () => {
    const g = loadInterp();
    const { createPchip } = g.VildaCentileInterp;
    const xs = [0, 1, 2, 4, 8];
    const ys = [0, 3, 4, 4.5, 4.6];
    const f = createPchip(xs, ys);
    xs.forEach((x, i) => expect(f(x)).toBe(ys[i]));
    let prev = -Infinity;
    for (let x = 0; x <= 8; x += 0.05) {
      const y = f(x);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = y;
    }
    expect(f(-0.1)).toBeNull();
    expect(f(8.1)).toBeNull();
    expect(createPchip([0, 0], [1, 2])).toBeNull();
    expect(createPchip([0, 1], [1])).toBeNull();
  });
});
