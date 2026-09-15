import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Etap 2b „Walidacji prognoz" (decyzja właściciela 2026-09-15). Eksport zbiorczy niósł jedną
// kolumnę `prognoza_cm` i nie mówił, że aplikacja cokolwiek z tą liczbą zrobiła: analityk
// dostawał wartość z publikacji i nie miał jak odróżnić metody użytej w konsensusie od
// wykluczonej bramką `GROWTH-PRED-DOBOR` ani zobaczyć kwoty korekty `GROWTH-PRED-BIAS`.
// Trzy nowe kolumny (`korekta_aplikacji_cm`, `w_konsensusie_cm`, `poza_konsensusem`) domykają
// to, co karta pokazuje przełącznikiem „Z publikacji / W konsensusie".
//
// Silniki podstawione stubami — test pilnuje SKŁADU pliku, nie wartości medycznych.
// Dane wyłącznie fikcyjne.

function load() {
  const win = {};
  win.calcPercentileStats = () => ({ sd: -2.1 });       // niskorosły chłopiec
  win.getChildLMS = () => [1, 177, 0.04];               // mediana wzrostu dorosłego
  win.calculateBayleyPinneauPrediction = () => ({ available: true, predictedAdultHeightCm: 176, errorBoundHalfWidthCm: 5.7 });
  win.calculateRWTPrediction = () => ({ available: true, predictedAdultHeightCm: 172, errorBoundHalfWidthCm: 4.9 });
  win.calculateReinehrCdgpPrediction = () => ({ available: true, predictedAdultHeightCm: 173 });
  win.calculateKhamisRochePrediction = () => ({ available: true, predictedAdultHeightCm: 170 });
  loadBrowserScript('vilda_blum_iss.js', win);
  loadBrowserScript('vilda_growth_card_c.js', win);
  loadBrowserScript('vilda_growth_prediction_validation_model.js', win);
  loadBrowserScript('vilda_growth_prediction_validation.js', win);
  return win.VildaGrowthPredictionValidation;
}

// Chłopiec z KOWD: wiek kostny ok. 2,5 roku za metrykalnym (Δ ≤ −24 mies. → korekta BP −2,0 cm
// i wykluczenie Khamis–Roche z konsensusu), wzrost ostateczny 171 cm w 18 l.
const measurements = [
  { ageMonths: 120, ageYears: 10, height: 125, weight: 25, boneAgeYears: 7.5 },
  { ageMonths: 144, ageYears: 12, height: 137, weight: 32, boneAgeYears: 9.5 },
  { ageMonths: 168, ageYears: 14, height: 148, weight: 40, boneAgeYears: 11.5 },
  { ageMonths: 192, ageYears: 16, height: 163, weight: 54, boneAgeYears: 14 },
];
const PAYLOAD = {
  user: { sex: 'M', age: 18, ageMonths: 216, height: 171, weight: 62 },
  advanced: { motherHeight: 158, fatherHeight: 172, boneAgeYears: 18, data: { measurements } },
};

const API = load();
const HEAD = API._cohortHead;
const kol = (n) => {
  const i = HEAD.indexOf(n);
  expect(i, `kolumna ${n} musi istnieć w nagłówku`).toBeGreaterThanOrEqual(0);
  return i;
};
const model = API.computeForPayload(PAYLOAD);
const rows = API._cohortRowsForEntry({ id: 'p1', name: 'Testowy Pacjent', model });
const wiersz = (metoda, ageMonths) => rows.filter(
  (r) => r[kol('metoda')] === metoda && r[kol('wiek_metr_mies')] === ageMonths)[0];

describe('Eksport zbiorczy — kolumny korekty aplikacji', () => {
  it('model liczy się i daje punkty do wyeksportowania', () => {
    expect(model.ok).toBe(true);
    expect(model.mode).toBe('validation');   // jest FH → tryb walidacji
    expect(rows.length).toBeGreaterThan(0);
  });

  it('nagłówek ma trzy nowe kolumny tuż za wartością z publikacji', () => {
    const i = kol('prognoza_cm');
    expect(HEAD[i + 1]).toBe('korekta_aplikacji_cm');
    expect(HEAD[i + 2]).toBe('w_konsensusie_cm');
    expect(HEAD[i + 3]).toBe('poza_konsensusem');
  });

  // Najtańszy strażnik przesunięcia kolumn: dodanie nagłówka bez wartości (albo odwrotnie)
  // przesuwa cały plik o jedno pole i nikt tego nie zauważy w arkuszu.
  it('każdy wiersz ma dokładnie tyle pól, ile nagłówek', () => {
    rows.forEach((r, i) => {
      expect(r.length, `wiersz ${i}: ${JSON.stringify(r)}`).toBe(HEAD.length);
    });
  });

  it('prognoza_cm to wartość z publikacji, a nie ta po naszej korekcie', () => {
    const bp = wiersz('Bayley–Pinneau', 168);
    expect(bp[kol('prognoza_cm')]).toBe(176);              // tyle podaje silnik
    expect(bp[kol('korekta_aplikacji_cm')]).toBe(-2);      // GROWTH-PRED-BIAS: chłopiec, Δ ≤ −24
    expect(bp[kol('w_konsensusie_cm')]).toBe(174);         // tą liczbą liczył się konsensus
  });

  it('kwota korekty i wartość w konsensusie zgadzają się ze sobą w każdym wierszu', () => {
    rows.forEach((r) => {
      const pub = r[kol('prognoza_cm')];
      const kons = r[kol('w_konsensusie_cm')];
      if (typeof pub !== 'number' || typeof kons !== 'number') return;
      expect(Math.abs(pub + r[kol('korekta_aplikacji_cm')] - kons),
        `${r[kol('metoda')]} @ ${r[kol('wiek_metr_mies')]}`).toBeLessThan(0.051);
    });
  });

  it('metoda bez korekty ma 0, a nie puste pole — plik ma się liczyć bez podstawiania', () => {
    const re = wiersz('Reinehr/CDGP', 168);
    expect(re[kol('korekta_aplikacji_cm')]).toBe(0);
    expect(re[kol('w_konsensusie_cm')]).toBe(re[kol('prognoza_cm')]);
    expect(rows.every((r) => typeof r[kol('korekta_aplikacji_cm')] === 'number')).toBe(true);
  });

  it('metoda wykluczona bramką jest zmierzona, ale oznaczona jako poza konsensusem', () => {
    const kr = wiersz('Khamis–Roche', 168);
    expect(kr[kol('poza_konsensusem')]).toBe('tak');        // |Δ| ≥ 24 mies. → GROWTH-PRED-DOBOR
    expect(typeof kr[kol('prognoza_cm')]).toBe('number');   // mimo to wciąż mierzona
    expect(kr[kol('blad_cm')]).toBe(-1);                    // 170 − 171 (FH)
    const bp = wiersz('Bayley–Pinneau', 168);
    expect(bp[kol('poza_konsensusem')]).toBe('nie');
  });

  it('błąd liczy się wobec wartości z publikacji — tej, którą widać na kartach', () => {
    const bp = wiersz('Bayley–Pinneau', 168);
    expect(bp[kol('FH_cm')]).toBe(171);
    expect(bp[kol('blad_cm')]).toBe(5);                     // 176 − 171, nie 174 − 171
    expect(bp[kol('blad_bezwzgl_cm')]).toBe(5);
  });

  it('lista metod w eksporcie idzie z modelu — Blum/ISS też trafia do pliku', () => {
    const metody = Array.from(new Set(rows.map((r) => r[kol('metoda')])));
    expect(metody).toContain('Blum/ISS');
    expect(metody).toContain('MPH (cel)');
    expect(metody.length).toBeGreaterThanOrEqual(model.methods.length);
  });

  it('arkusz zbiorczy zaczyna się nagłówkiem i skleja pacjentów bez gubienia pól', () => {
    const aoa = API._buildCohortAoa([
      { id: 'p1', name: 'Pacjent Jeden', model },
      { id: 'p2', name: 'Pacjent Dwa', model },
    ]);
    expect(aoa[0]).toEqual(HEAD);
    expect(aoa.length).toBe(1 + rows.length * 2);
    expect(aoa.every((r) => r.length === HEAD.length)).toBe(true);
  });
});
