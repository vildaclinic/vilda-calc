import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Rozjazd prognozy wzrostu ostatecznego w czasie (etap 4 silnika opisu).
//
// Prognoza mówi, gdzie dziecko wyląduje WEDŁUG DZISIEJSZYCH danych. Nie mówi, czy ta
// odpowiedź jest stabilna — a prognoza, która przez trzy lata obsuwa się o 7 cm w dół,
// niesie inną informację niż prognoza stojąca w miejscu, choćby dziś obie pokazywały
// tę samą liczbę.
//
// Moduł nie wprowadza NOWEGO progu: prognozę dla każdej wizyty liczy silnik aplikacji
// (wstrzykiwany), miarą jest własny przedział błędu metody, a minimalny odstęp bierze
// z SEGMENT_MIN_GAP_M karty trajektorii.

function okno({ minGap = 3 } = {}) {
  const g = { VildaTrajectoryAnalysis: { PARAMS: { SEGMENT_MIN_GAP_M: minGap } } };
  loadBrowserScript('vilda_prediction_drift.js', g);
  return g;
}

// Atrapa silnika: prognoza = wzrost × mnożnik z wieku kostnego. Kontrakt odwzorowany
// z realnego Bayleya-Pinneau (available, predictedAdultHeightCm, errorBoundHalfWidthCm,
// errorBoundsCoveragePercent), żeby test szedł tą samą ścieżką co produkcja.
const silnik = (mapa, { halfWidth = 3.2, coverage = 90 } = {}) => (we) => {
  const klucz = Math.round(we.chronologicalAgeMonths);
  if (!(klucz in mapa)) return { available: false, reason: 'brak-danych' };
  return {
    available: true,
    predictedAdultHeightCm: mapa[klucz],
    errorBoundHalfWidthCm: halfWidth,
    errorBoundsCoveragePercent: coverage,
  };
};

const POMIARY = [
  { ageMonths: 96, height: 122, boneAgeYears: 7.5 },
  { ageMonths: 120, height: 132, boneAgeYears: 10 },
];
const TERAZ = { ageMonths: 144, height: 141, boneAgeYears: 13 };

describe('Rozjazd prognozy — kiedy w ogóle jest o czym mówić', () => {
  it('spadek większy niż własny przedział metody jest odnotowany', () => {
    const g = okno();
    const m = g.VildaPredictionDrift.analyze({
      sex: 'M', measurements: POMIARY, current: TERAZ,
      predict: silnik({ 96: 176, 120: 172, 144: 168 }),
    });
    expect(m).not.toBeNull();
    expect(m.points.map((p) => p.ageMonths)).toEqual([96, 120, 144]);
    expect(m.first.cm).toBe(176);
    expect(m.last.cm).toBe(168);
    expect(m.deltaCm).toBe(-8);
    expect(m.gapMonths).toBe(48);
    expect(m.yardstickCm, 'miarą jest przedział wcześniejszej prognozy').toBe(3.2);
    expect(m.coverage).toBe(90);
    expect(m.exceedsOwnInterval).toBe(true);
  });

  it('kontrola negatywna: zmiana mieszcząca się w przedziale metody nie jest rozjazdem', () => {
    const g = okno();
    const m = g.VildaPredictionDrift.analyze({
      sex: 'M', measurements: POMIARY, current: TERAZ,
      predict: silnik({ 96: 172, 120: 171, 144: 170 }),
    });
    expect(m).not.toBeNull();
    expect(m.deltaCm).toBe(-2);
    expect(m.exceedsOwnInterval, '2 cm < ±3,2 cm — metoda sama dopuszcza taką zmianę').toBe(false);
  });

  it('wzrost prognozy liczy się tak samo jak spadek', () => {
    const g = okno();
    const m = g.VildaPredictionDrift.analyze({
      sex: 'K', measurements: POMIARY, current: TERAZ,
      predict: silnik({ 96: 160, 120: 165, 144: 168 }),
    });
    expect(m.deltaCm).toBe(8);
    expect(m.exceedsOwnInterval).toBe(true);
  });
});

describe('Rozjazd prognozy — milczenie tam, gdzie nie ma podstawy', () => {
  it('wizyta bez wieku kostnego nie daje punktu — prognozy nie da się dla niej policzyć', () => {
    const g = okno();
    const m = g.VildaPredictionDrift.analyze({
      sex: 'M',
      measurements: [{ ageMonths: 96, height: 122 }],            // brak boneAgeYears
      current: TERAZ,
      predict: silnik({ 96: 176, 144: 168 }),
    });
    expect(m, 'jeden punkt to za mało na porównanie').toBeNull();
  });

  it('metoda niedostępna dla wizyty (available:false) nie wchodzi do serii', () => {
    const g = okno();
    const m = g.VildaPredictionDrift.analyze({
      sex: 'M', measurements: POMIARY, current: TERAZ,
      predict: silnik({ 120: 172, 144: 168 }),                   // 96 mies. poza tabelą
    });
    expect(m.points.map((p) => p.ageMonths)).toEqual([120, 144]);
    expect(m.first.cm).toBe(172);
  });

  it('odstęp krótszy niż próg karty milczy', () => {
    const g = okno({ minGap: 3 });
    const m = g.VildaPredictionDrift.analyze({
      sex: 'M',
      measurements: [{ ageMonths: 142, height: 140, boneAgeYears: 12.9 }],
      current: TERAZ,                                            // 144 mies. → odstęp 2
      predict: silnik({ 142: 176, 144: 168 }),
    });
    expect(m, 'dwa miesiące to nie jest przebieg, tylko szum').toBeNull();
  });

  it('bez karty trajektorii moduł milczy zamiast podstawiać własny próg', () => {
    const g = {};
    loadBrowserScript('vilda_prediction_drift.js', g);
    const m = g.VildaPredictionDrift.analyze({
      sex: 'M', measurements: POMIARY, current: TERAZ,
      predict: silnik({ 96: 176, 120: 172, 144: 168 }),
    });
    expect(m).toBeNull();
  });

  it('brak funkcji licznika i pusta historia nie wywracają modułu', () => {
    const g = okno();
    expect(g.VildaPredictionDrift.analyze({ sex: 'M', measurements: POMIARY, current: TERAZ })).toBeNull();
    expect(g.VildaPredictionDrift.analyze({ sex: 'M', measurements: [], predict: silnik({}) })).toBeNull();
    expect(g.VildaPredictionDrift.analyze(null)).toBeNull();
    // Silnik, który rzuca, nie może wywrócić opisu.
    const rzucajacy = () => { throw new Error('tabela nie wczytana'); };
    expect(g.VildaPredictionDrift.analyze({
      sex: 'M', measurements: POMIARY, current: TERAZ, predict: rzucajacy,
    })).toBeNull();
  });

  it('dwa pomiary w tym samym wieku to jedna wizyta — liczy się nowszy', () => {
    const g = okno();
    const m = g.VildaPredictionDrift.analyze({
      sex: 'M',
      measurements: [
        { ageMonths: 96, height: 122, boneAgeYears: 7.5 },
        { ageMonths: 96, height: 123, boneAgeYears: 7.6 },
      ],
      current: TERAZ,
      predict: (we) => ({
        available: true,
        predictedAdultHeightCm: Math.round(we.currentHeightCm * 1.4 * 10) / 10,
        errorBoundHalfWidthCm: 3.2,
        errorBoundsCoveragePercent: 90,
      }),
    });
    expect(m.points).toHaveLength(2);
    expect(m.first.cm, 'wzięty drugi wpis dla 96 mies. (123 cm)').toBe(172.2);
  });
});
