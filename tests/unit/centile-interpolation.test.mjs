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

// Referencje DAWNEGO potoku rysowania (interpolacja liniowa + wygładzanie
// uśrednianiem), zmierzone na produkcyjnych danych: maksymalna druga różnica
// próbek miesięcznych (gładkość, mniejsza = gładsza) oraz maksymalna odchyłka
// krzywej od wartości tabeli. Nowy potok (PCHIP + graduacja WH) ma być
// co najwyżej minimalnie mniej gładki w strefie realnej krzywizny niemowlęcej
// (tolerancja 1.15×) i wyraźnie wierniejszy tabeli.
const LEGACY = {
  WT: { sm3: 0.109, sm18: 0.159, dev3: 0.33, dev18: 0.67 },
  HT: { sm3: 0.359, sm18: 0.229, dev3: 1.07, dev18: 0.62 },
  BMI: { sm3: 0.227, sm18: 0.1, dev3: 0.75, dev18: 0.31 },
};

function maxSecondDiff(values) {
  let max = 0;
  for (let i = 1; i < values.length - 1; i += 1) {
    const d = Math.abs(values[i - 1] - 2 * values[i] + values[i + 1]);
    if (d > max) max = d;
  }
  return max;
}

describe('VildaCentileInterp (PCHIP + graduacja Whittakera–Hendersona, dane Palczewskiej)', () => {
  it('publikuje zamrożone API i raportuje gotowość na produkcyjnych danych', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;

    expect(Object.isFrozen(api)).toBe(true);
    expect(api.method).toBe('pchip-whittaker-henderson');
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

  it('jest gładszy lub równie gładki jak dawne wygładzanie uśrednianiem (obie strefy siatek)', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;
    for (const sex of ['M', 'F']) {
      for (const [kind] of SERIES) {
        for (const p of PERCENTILES) {
          const zone3 = [];
          for (let m = 0; m <= 36; m += 1) zone3.push(api.palCentileValue(sex, m, p, kind));
          const zone18 = [];
          for (let m = 12; m <= 216; m += 1) zone18.push(api.palCentileValue(sex, m, p, kind));
          // Strefa 0–3 zawiera realną krzywiznę niemowlęcą — tolerancja 1.15×
          // referencji dawnego potoku; strefa 1–18 musi być wyraźnie gładsza.
          expect(maxSecondDiff(zone3), `${sex}/${kind}/p${p} strefa 0-3`)
            .toBeLessThanOrEqual(LEGACY[kind].sm3 * 1.15);
          expect(maxSecondDiff(zone18), `${sex}/${kind}/p${p} strefa 1-18`)
            .toBeLessThanOrEqual(LEGACY[kind].sm18);
        }
      }
    }
  });

  it('odchyla się od opublikowanych wartości tabeli nie bardziej niż dawne wygładzanie', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;
    for (const sex of ['M', 'F']) {
      const sexKey = sex === 'M' ? 'boys' : 'girls';
      for (const [kind, kindKey] of SERIES) {
        for (const row of g.centileData[sexKey][kindKey]) {
          for (const p of PERCENTILES) {
            const value = api.palCentileValue(sex, row.months, p, kind);
            const bound = row.months <= 36 ? LEGACY[kind].dev3 : LEGACY[kind].dev18;
            expect(Math.abs(value - row[`p${p}`]), `${sex}/${kind}/p${p}@${row.months}m`)
              .toBeLessThanOrEqual(bound);
          }
        }
      }
    }
  });

  it('nie tworzy przecięć linii centylowych na gęstej siatce wieku (co 0,25 mies.)', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;
    // Zakres od pierwszego węzła (1 mies.): poniżej działa ekstrapolacja
    // liniowa, w której p90/p97 BMI dziewczynek zbiegają się w m. 0 —
    // zachowanie odziedziczone po dawnej funkcji produkcyjnej.
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

  it('rosnące serie pozostają monotoniczne (wzrost p50 chłopców na gęstej siatce)', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;
    // Tolerancja 0,01 cm: graduacja zostawia mikro-zafalowanie rzędu 1e-4 cm
    // na plateau 216–222 mies. — bez znaczenia wizualnego i klinicznego
    // (grubość linii na wydruku odpowiada ~0,5 cm w skali osi).
    let previous = -Infinity;
    for (let m = 1; m <= 222; m += 0.1) {
      const value = api.palCentileValue('M', m, 50, 'HT');
      expect(value).toBeGreaterThanOrEqual(previous - 0.01);
      previous = value;
    }
  });

  it('zachowuje reguły brzegowe: ekstrapolacja liniowa poniżej 1. mies. i plateau za ostatnim węzłem', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;
    for (const sex of ['M', 'F']) {
      const sexKey = sex === 'M' ? 'boys' : 'girls';
      for (const [kind, kindKey] of SERIES) {
        const rows = g.centileData[sexKey][kindKey];
        const first = rows[0];
        const last = rows[rows.length - 1];
        for (const p of PERCENTILES) {
          // Miesiąc 0: liniowo z dwóch pierwszych wartości graduowanych
          // (reguła przejęta z dawnej funkcji produkcyjnej).
          const v0 = api.palCentileValue(sex, first.months, p, kind);
          const v1 = api.palCentileValue(sex, first.months + 1, p, kind);
          const expected0 = v0 + (0 - first.months) * (v1 - v0);
          expect(api.palCentileValue(sex, 0, p, kind)).toBeCloseTo(expected0, 9);
          // Za ostatnim węzłem: plateau na wartości ostatniej próbki.
          expect(api.palCentileValue(sex, last.months + 18, p, kind))
            .toBe(api.palCentileValue(sex, last.months, p, kind));
        }
      }
    }
  });

  it('przypadek syntetyczny: chłopiec 4 mies., p50 wagi — tabela 7,2 kg; nowa krzywa bliżej tabeli niż dawna', () => {
    const g = loadInterp();
    const api = g.VildaCentileInterp;
    const value = api.palCentileValue('M', 4, 50, 'WT');
    // Dawne wygładzanie rysowało tu ~6,90 kg (odchyłka 0,30). Graduacja ma
    // być bliżej opublikowanej wartości 7,2 kg.
    expect(Math.abs(value - 7.2)).toBeLessThan(0.3);
    expect(value).toBeGreaterThan(6.9);
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

  it('whGraduate: redukuje szum zaokrągleń, zachowuje sygnał liniowy i długości spoza kontraktu', () => {
    const g = loadInterp();
    const { whGraduate } = g.VildaCentileInterp;
    // Sygnał liniowy przechodzi bez zmian (druga różnica = 0, kara nieaktywna).
    const linear = [0, 1, 2, 3, 4, 5, 6, 7];
    const lam = new Array(linear.length - 2).fill(100);
    const gl = whGraduate(linear, lam);
    linear.forEach((v, i) => expect(gl[i]).toBeCloseTo(v, 9));
    // Zaszumiona linia zostaje wygładzona (mniejsza druga różnica).
    const noisy = linear.map((v, i) => v + (i % 2 ? 0.1 : -0.1));
    const gn = whGraduate(noisy, lam);
    expect(maxSecondDiff(gn)).toBeLessThan(maxSecondDiff(noisy) / 5);
    // Za krótkie wejście wraca bez zmian.
    expect(whGraduate([1, 2], [])).toEqual([1, 2]);
  });
});
