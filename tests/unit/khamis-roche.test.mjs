import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Silnik Khamisa-Roche (vilda_khamis_roche.js). Współczynniki z ERRATY 1995 (kolumna „masa” 10× vs 1994).
// Wartości oczekiwane policzone NIEZALEŻNIE (osobny skrypt referencyjny), nie z tego samego kodu.
//
// KONWENCJA WIEKU (jak BP/RWT w vilda_advanced_growth.js): chronologicalAgeMonths = ŁĄCZNE miesiące
// i ma pierwszeństwo; chronologicalAgeYears = fallback. NIE sumujemy lat i miesięcy. Dlatego fixture
// `base()` podaje wiek dziesiętnie przez chronologicalAgeYears (bez chronologicalAgeMonths).

const g = loadBrowserScript('vilda_khamis_roche.js', {});
const KR = g.VildaKhamisRoche;
const predict = g.calculateKhamisRochePrediction;

function base(overrides = {}) {
  return {
    sex: 'M',
    chronologicalAgeYears: 10,
    currentHeightCm: 138,
    currentWeightKg: 32,
    motherHeightCm: 163,
    fatherHeightCm: 178,
    ...overrides,
  };
}

describe('Khamis-Roche — moduł i tablice', () => {
  it('eksportuje silnik + tablice (28 wierszy 4,0–17,5 co pół roku)', () => {
    expect(typeof predict).toBe('function');
    expect(KR.MALE_ROWS).toHaveLength(28);
    expect(KR.FEMALE_ROWS).toHaveLength(28);
    for (const rows of [KR.MALE_ROWS, KR.FEMALE_ROWS]) {
      expect(rows[0][0]).toBe(4.0);
      expect(rows[rows.length - 1][0]).toBe(17.5);
      for (let i = 1; i < rows.length; i++) {
        expect(Math.round((rows[i][0] - rows[i - 1][0]) * 10)).toBe(5); // krok 0,5 r.ż.
        expect(rows[i]).toHaveLength(5); // wiek + 4 współczynniki
      }
    }
  });

  it('kolumna „masa” = wartości z ERRATY (10× vs druk 1994) — strażnik transkrypcji', () => {
    // dziewczęta 7,0 r.ż. masa: errata −0,13184 (NIE −0,013184 z 1994)
    const f7 = KR.FEMALE_ROWS.find((r) => r[0] === 7.0);
    expect(f7[3]).toBeCloseTo(-0.13184, 6);
    // chłopcy 4,0 r.ż. masa: errata −0,087235
    const m4 = KR.MALE_ROWS.find((r) => r[0] === 4.0);
    expect(m4[3]).toBeCloseTo(-0.087235, 6);
    // kontrola kolumn niezmienionych erratą (wzrost/β0/midparent)
    expect(f7[1]).toBeCloseTo(-2.87645, 6); // β0
    expect(f7[2]).toBeCloseTo(1.11342, 6); // wzrost
    expect(f7[4]).toBeCloseTo(0.31748, 6); // midparent
  });
});

describe('Khamis-Roche — wartości referencyjne (niezależnie policzone)', () => {
  const cases = [
    ['chłopiec 10,0 l 138/32 163/178', base(), 177.1596],
    ['dziewczynka 12,0 l 150/42 165/179', base({ sex: 'F', chronologicalAgeYears: 12, currentHeightCm: 150, currentWeightKg: 42, motherHeightCm: 165, fatherHeightCm: 179 }), 165.3935],
    ['chłopiec 7,0 l (wiersz) 120/23 170/183', base({ chronologicalAgeYears: 7, currentHeightCm: 120, currentWeightKg: 23, motherHeightCm: 170, fatherHeightCm: 183 }), 178.5854],
    ['dziewczynka 15,5 l (wiersz) 160/52 160/175', base({ sex: 'F', chronologicalAgeYears: 15.5, currentHeightCm: 160, currentWeightKg: 52, motherHeightCm: 160, fatherHeightCm: 175 }), 161.4181],
    ['chłopiec 10,25 l (interpolacja) 139/32 163/178', base({ chronologicalAgeYears: 10.25, currentHeightCm: 139 }), 177.1694],
    ['chłopiec 4,0 l (min) 100/16 170/183', base({ chronologicalAgeYears: 4, currentHeightCm: 100, currentWeightKg: 16, motherHeightCm: 170, fatherHeightCm: 183 }), 178.6989],
    ['chłopiec 17,5 l (max) 175/62 170/183', base({ chronologicalAgeYears: 17.5, currentHeightCm: 175, currentWeightKg: 62, motherHeightCm: 170, fatherHeightCm: 183 }), 174.0176],
  ];
  for (const [name, input, expected] of cases) {
    it(`${name} → ${expected} cm`, () => {
      const r = predict(input);
      expect(r.available).toBe(true);
      expect(r.predictedAdultHeightCm).toBeCloseTo(expected, 2); // ±0,005 cm
    });
  }

  it('wiek produkcyjny: {ageYears:10, ageMonths:120} → 10 l. (NIE 20), wynik jak dla 10,0 — regresja', () => {
    // Moduł walidacji podaje jednocześnie chronologicalAgeMonths (łączne) i chronologicalAgeYears.
    // Wcześniejszy błąd sumował je (10 + 120/12 = 20 → out-of-range). Ten test to blokuje.
    const r = predict(base({ chronologicalAgeYears: 10, chronologicalAgeMonths: 120 }));
    expect(r.available).toBe(true);
    expect(r.ageYears).toBeCloseTo(10, 9);
    expect(r.predictedAdultHeightCm).toBeCloseTo(177.1596, 2);
  });

  it('interpolacja: wiersz exact → interpolated=false; między → interpolated=true', () => {
    expect(predict(base({ chronologicalAgeYears: 10 })).interpolated).toBe(false);
    expect(predict(base({ chronologicalAgeYears: 10.25 })).interpolated).toBe(true);
  });

  it('midparent = (matka+ojciec)/2', () => {
    expect(predict(base({ motherHeightCm: 160, fatherHeightCm: 180 })).midparentCm).toBe(170);
  });
});

describe('Khamis-Roche — zakres i braki danych', () => {
  it('poza zakresem 4,0–17,5 → out-of-range (bez ekstrapolacji)', () => {
    // 47 mies. = 3,9166 r.ż. (tuż poniżej 4,0)
    expect(predict(base({ chronologicalAgeYears: null, chronologicalAgeMonths: 47 }))).toEqual({ available: false, reason: 'out-of-range' });
    // 216 mies. = 18,0 r.ż. (tuż powyżej 17,5)
    expect(predict(base({ chronologicalAgeYears: null, chronologicalAgeMonths: 216 }))).toEqual({ available: false, reason: 'out-of-range' });
    // brzegi włącznie
    expect(predict(base({ chronologicalAgeYears: 4, currentHeightCm: 100, currentWeightKg: 16 })).available).toBe(true);
    expect(predict(base({ chronologicalAgeYears: 17.5, currentHeightCm: 170, currentWeightKg: 60 })).available).toBe(true);
  });

  it('braki wejścia → właściwe reason', () => {
    expect(predict(base({ sex: '' })).reason).toBe('missing-sex');
    expect(predict(base({ sex: 'x' })).reason).toBe('missing-sex');
    expect(predict(base({ chronologicalAgeYears: null, chronologicalAgeMonths: null })).reason).toBe('missing-chronological-age');
    expect(predict(base({ currentHeightCm: null })).reason).toBe('missing-input');
    expect(predict(base({ currentWeightKg: 0 })).reason).toBe('missing-input');
    expect(predict(base({ motherHeightCm: null })).reason).toBe('missing-input');
    expect(predict(base({ fatherHeightCm: null })).reason).toBe('missing-input');
    expect(predict(null)).toEqual({ available: false, reason: 'missing-input' });
  });
});

describe('Khamis-Roche — normalizacja płci i wieku', () => {
  it('płeć: M/F oraz warianty tekstowe', () => {
    expect(KR._normalizeSex('M')).toBe('M');
    expect(KR._normalizeSex('F')).toBe('F');
    expect(KR._normalizeSex('male')).toBe('M');
    expect(KR._normalizeSex('female')).toBe('F');
    expect(KR._normalizeSex('boy')).toBe('M');
    expect(KR._normalizeSex('girl')).toBe('F');
    expect(KR._normalizeSex('chłopiec')).toBe('M');
    expect(KR._normalizeSex('dziewczynka')).toBe('F');
    expect(KR._normalizeSex('K')).toBe('F');
    expect(KR._normalizeSex('?')).toBe(null);
  });

  it('wiek: miesiące łączne mają pierwszeństwo, lata to fallback, NIE sumujemy', () => {
    expect(KR._resolveAgeYears({ chronologicalAgeMonths: 120 })).toBeCloseTo(10, 9);
    expect(KR._resolveAgeYears({ chronologicalAgeMonths: 126 })).toBeCloseTo(10.5, 9);
    expect(KR._resolveAgeYears({ chronologicalAgeYears: 10.5 })).toBeCloseTo(10.5, 9); // fallback, gdy brak miesięcy
    expect(KR._resolveAgeYears({ ageMonths: 126 })).toBeCloseTo(10.5, 9);
    // KLUCZOWE: redundantne miesiące+lata tego samego wieku → miesiące wygrywają, bez sumowania
    expect(KR._resolveAgeYears({ chronologicalAgeMonths: 120, chronologicalAgeYears: 10 })).toBeCloseTo(10, 9);
    expect(KR._resolveAgeYears({ chronologicalAgeMonths: 123, chronologicalAgeYears: 99 })).toBeCloseTo(10.25, 9);
    expect(KR._resolveAgeYears({})).toBe(null);
  });
});
