import { beforeAll, describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Clamp prognozy wzrostu ostatecznego do aktualnego wzrostu (decyzja właściciela 2026-08-13).
//
// Metody regresyjne (Khamis-Roche, RWT) przy górnej granicy wieku potrafią zwrócić prognozę
// NIŻSZĄ niż już zmierzony wzrost — wynik fizycznie niemożliwy (artefakt wewnątrz błędu metody).
// Kontrakt: prognoza punktowa i dolna granica przedziału ≥ aktualny wzrost; górna granica
// przedziału liczona ZAWSZE od wartości surowej (raw + półszerokość), żeby nie zawyżać metody;
// gdy cały przedział leży poniżej aktualnego wzrostu, widełki zapadają się do pojedynczej
// wartości. Testy wywołują RZECZYWISTE funkcje produkcyjne (silniki + budowniczych linii),
// nie kopie wzorów.

let win;
beforeAll(() => {
  win = {};
  loadBrowserScript('vilda_khamis_roche.js', win);
  loadBrowserScript('rwt_data.js', win);
  loadBrowserScript('vilda_advanced_growth.js', win);
  loadBrowserScript('vilda_growth_card_c.js', win);
});

// Przypadek właściciela: chłopiec 17,5 l, 176 cm / 55 kg, rodzice 165/177 (MPH 177,5).
// Równanie KR → 175,16 cm, czyli 0,8 cm poniżej zmierzonego wzrostu.
const OWNER_CASE = Object.freeze({
  sex: 'M', chronologicalAgeMonths: 210, currentHeightCm: 176, currentWeightKg: 55,
  motherHeightCm: 165, fatherHeightCm: 177,
});

describe('RWT — clamp w silniku produkcyjnym (calculateRWTPrediction)', () => {
  // Wysoki nastolatek + niscy rodzice + wiek kostny 17,5 → równanie poniżej zmierzonego wzrostu.
  const input = Object.freeze({
    sex: 'M', chronologicalAgeMonths: 192, currentHeightCm: 185, currentWeightKg: 60,
    motherHeightCm: 150, fatherHeightCm: 158, boneAgeYears: 17.5,
  });

  it('prognoza punktowa podniesiona do aktualnego wzrostu, raw zachowany, remainingGrowth 0', () => {
    const r = win.calculateRWTPrediction(input);
    expect(r.available).toBe(true);
    expect(r.clampedToCurrentHeight).toBe(true);
    expect(r.predictedAdultHeightCm).toBe(185);
    expect(r.predictedAdultHeightCmRaw).toBeLessThan(185);
    expect(r.remainingGrowthCm).toBe(0);
  });

  it('przedział obcięty: dolna granica = wzrost; górna nie spada poniżej wzrostu (zapadnięty przedział)', () => {
    const r = win.calculateRWTPrediction(input);
    // Tu cały przedział (raw ± half) leży poniżej 185 cm → obie granice zapadają się do 185.
    expect(r.predictionIntervalLowerCm).toBe(185);
    expect(r.predictionIntervalUpperCm).toBeGreaterThanOrEqual(r.predictionIntervalLowerCm);
  });

  it('linia podsumowania: zapadnięty przedział → pojedyncza wartość + adnotacja z wartością surową', () => {
    const r = win.calculateRWTPrediction(input);
    const line = win.advGrowthBuildRWTSummaryCardLine(r);
    expect(line).toContain('Prognoza wzrostu ostatecznego (metoda RWT): 185,0 cm');
    expect(line).toContain('oszacowanie metody');
    expect(line).toContain('dolną granicę ograniczono do aktualnego wzrostu');
    expect(line).not.toContain('185,0–'); // bez odwróconych/zapadniętych widełek
  });

  it('linia podsumowania: przedział niezapadnięty → widełki „lo–hi cm"', () => {
    // Syntetyczny wynik w kontrakcie silnika: clamp aktywny, ale raw+half > wzrost.
    const line = win.advGrowthBuildRWTSummaryCardLine({
      available: true, hasErrorInterval: true, clampedToCurrentHeight: true,
      predictedAdultHeightCm: 176, predictedAdultHeightCmRaw: 175.2,
      errorBoundHalfWidthCm: 3.1, predictionIntervalLowerCm: 176, predictionIntervalUpperCm: 178.3,
    });
    expect(line).toContain('176,0–178,3 cm');
    expect(line).toContain('oszacowanie metody: 175,2 ±3,1 cm');
  });

  it('bez clampu linia bez zmian: „X cm (±Y cm)" — regresja formatu', () => {
    const r = win.calculateRWTPrediction({
      sex: 'M', chronologicalAgeMonths: 150, currentHeightCm: 150, currentWeightKg: 40,
      motherHeightCm: 165, fatherHeightCm: 180, boneAgeYears: 12.5,
    });
    expect(r.clampedToCurrentHeight).toBe(false);
    expect(r.predictedAdultHeightCm).toBe(r.predictedAdultHeightCmRaw);
    const line = win.advGrowthBuildRWTSummaryCardLine(r);
    expect(line).toMatch(/^Prognoza wzrostu ostatecznego \(metoda RWT\): \d+,\d cm \(±\d+,\d cm\)$/);
  });
});

describe('Karta C — wpisy, konsensus i prezentacja po clampie', () => {
  function ownerInput() {
    return {
      sex: 'M', ageMonths: 210, currentHeightCm: 176, currentWeightKg: 55,
      motherHeightCm: 165, fatherHeightCm: 177,
    };
  }

  it('wpis KR: value = wzrost, rawValue = wynik równania, widełki [176; raw+5,3]', () => {
    const model = win.VildaGrowthCardC._buildModel(ownerInput());
    const kh = model.entries.find((e) => e.key === 'khamis');
    expect(kh).toBeTruthy();
    expect(kh.clamped).toBe(true);
    expect(kh.value).toBe(176);
    expect(kh.rawValue).toBeCloseTo(175.16, 1);
    expect(kh.loCm).toBe(176);
    expect(kh.hiCm).toBeCloseTo(175.16 + 5.3, 1);
  });

  it('konsensus i zakres min–max nigdy poniżej aktualnego wzrostu', () => {
    const fh = win.VildaGrowthCardC.computeFinalHeightPrediction(ownerInput());
    expect(fh).toBeTruthy();
    expect(fh.cm).toBeGreaterThanOrEqual(176);
    expect(fh.minCm).toBeGreaterThanOrEqual(176);
    const kh = fh.methods.find((m) => m.key === 'khamis');
    expect(kh.clamped).toBe(true);
    expect(kh.cm).toBe(176);
    expect(kh.rawCm).toBeCloseTo(175.16, 1);
  });

  it('generyczny clamp obejmuje wynik metody przekazany z zewnątrz (np. RWT sprzed clampu)', () => {
    const model = win.VildaGrowthCardC._buildModel({
      ...ownerInput(),
      rwt: { available: true, predictedAdultHeightCm: 174.8, errorBoundHalfWidthCm: 3.1 },
    });
    const rwt = model.entries.find((e) => e.key === 'rwt');
    expect(rwt.clamped).toBe(true);
    expect(rwt.value).toBe(176);
    expect(rwt.rawValue).toBeCloseTo(174.8, 6);
    expect(rwt.hiCm).toBeCloseTo(177.9, 6);
  });

  it('render: widełki zamiast „±" i adnotacja o obcięciu w Szczegółach', () => {
    const html = win.VildaGrowthCardC.render(ownerInput());
    expect(html).toContain('176,0–180,5 cm'); // 175,16+5,3 = 180,46 → 180,5
    expect(html).toContain('Prognoza a obecny wzrost');
    expect(html).toContain('Dolną granicę prognozy ograniczono do aktualnego wzrostu');
    expect(html).toContain('175,2'); // surowa wartość równania widoczna w adnotacji
  });

  it('render bez clampu: format „±" nietknięty (regresja)', () => {
    const html = win.VildaGrowthCardC.render({
      sex: 'M', ageMonths: 120, currentHeightCm: 138, currentWeightKg: 32,
      motherHeightCm: 163, fatherHeightCm: 178,
    });
    expect(html).toContain('±5,3 cm');
    expect(html).not.toContain('Prognoza a obecny wzrost');
  });
});

describe('Adapter KR (advanced growth) — pola przedziału na obiekcie khamis', () => {
  it('buildAdvancedGrowthDataPayload zachowuje pola clampu po whitelist', () => {
    const kr = win.calculateKhamisRochePrediction(OWNER_CASE);
    expect(kr.clampedToCurrentHeight).toBe(true);
    // pola dopisywane przez adapter przechodzą przez asembler razem z obiektem khamis
    const model = win.VildaAdvancedGrowth.buildAdvancedGrowthDataPayload({}, { khamis: { ...kr, errorBoundHalfWidthCm: 5.3, hasErrorInterval: true, predictionIntervalLowerCm: 176, predictionIntervalUpperCm: 180.5 } });
    expect(model.khamis.clampedToCurrentHeight).toBe(true);
    expect(model.khamis.predictedAdultHeightCmRaw).toBeCloseTo(175.16, 1);
    expect(model.khamis.predictionIntervalLowerCm).toBe(176);
    expect(model.khamis.predictionIntervalUpperCm).toBe(180.5);
  });
});
