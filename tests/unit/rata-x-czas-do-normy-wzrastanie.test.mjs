import { afterAll, describe, expect, it } from 'vitest';
import { appSrc, funkcjaZ, oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA rata X (decyzje właściciela 2026-09-23): czas dojścia do normy BMI u rosnącego dziecka przy REDUKCJI liczy masę
// jako dziś − tempo diety × czas + PRZYROST MASY ZE WZRASTANIA (mediana BMI dla wieku × przyrost wzrost², krok 0,5 mies.) —
// ta sama reguła co kontrola z raty W. Bez zmian: stabilizacja (tempo 0, masa stała z definicji), „Wzrost zakończony”,
// praktycznie zakończone wzrastanie, dorośli. Kafle tempa zostają „z samej diety”.
// PRAWDZIWY silnik diety + PRAWDZIWE toNormalBMITarget z app.js (cel 85. centyla na silniku BMI). Dane FIKCYJNE.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');
// produkcyjne funkcje celu z app.js, związane z tym samym oknem silnika
const celZApp = new Function('window', `${funkcjaZ(appSrc, 'vildaBmiSilnik')}${funkcjaZ(appSrc, 'vildaBmiZrodlo')}${funkcjaZ(appSrc, 'toNormalBMITarget')}return toNormalBMITarget;`)(win);
ustawGlobal('toNormalBMITarget', celZApp);

const sym = (o) => win.energySimulateMonthsToBmiTarget({ ageMonthsOpt: 0, target: 'norm', ...o });
// wyrocznia reguły (zapis decyzji właściciela) na danych silnika; `zPrzyrostem=false` = dawna symulacja
function wyrocznia({ sex, ageYears, weightKg, heightCm, weeklyLossKg }, zPrzyrostem) {
  const ol = win.energyChildGrowthOutlook({ ageYears, sex, heightCm });
  const g = ol.annualGrowthCm, gm = g / 12, mLoss = weeklyLossKg * 52 / 12, k = win.ENERGY_ADULT_START_AGE;
  const cap = ol.capCm != null ? ol.capCm : Infinity, growMax = Math.max(0, (k - ageYears) * 12);
  let lean = 0, hPrev = heightCm;
  for (let t = 0; t <= 240; t += 0.5) {
    const aa = ageYears + t / 12, hh = Math.min(cap, heightCm + gm * Math.min(t, growMax));
    if (zPrzyrostem && t > 0 && hh > hPrev) lean += win.energyChildMedianBmi(sex, aa) * ((hh / 100) ** 2 - (hPrev / 100) ** 2);
    hPrev = hh;
    const ww = Math.max(1, weightKg - mLoss * t + lean), bt = celZApp(ww, hh, aa, sex);
    if (isFinite(bt) && bt > 0 && ww / (hh / 100) ** 2 <= bt) return t;
  }
  return null;
}
const LEKKA = 126 * 7 / 7700;          // 0,5 kg/mies.
const UMIARK_15 = 379 * 7 / 7700;      // 1,5 kg/mies.

describe('rata X: redukcja u rosnącego dziecka — przyrost masy ze wzrastania w czasie do normy', () => {
  const DZ8 = { sex: 'F', ageYears: 8, weightKg: 45, heightCm: 130, weeklyLossKg: LEKKA };
  it('dziewczynka 8 l, 45 kg, dieta lekka: czas zgodny z regułą i dłuższy niż dawny o ≥ 20 %', () => {
    const s = sym(DZ8);
    const nowy = wyrocznia(DZ8, true), dawny = wyrocznia(DZ8, false);
    expect(s.months).toBe(nowy);
    expect(s.months).toBeGreaterThanOrEqual(dawny * 1.2);
    expect(s.growthAware).toBe(true);
  });
  it('przyrost masy na miesiąc = mediana BMI × ((wzrost + tempo/12)² − wzrost²), ok. 0,2 kg/mies.', () => {
    const s = sym(DZ8);
    const ol = win.energyChildGrowthOutlook({ ageYears: 8, sex: 'F', heightCm: 130 });
    const bm = win.energyChildMedianBmi('F', 8);
    expect(s.przyrostMasyKgMies).toBeCloseTo(bm * (((130 + ol.annualGrowthCm / 12) / 100) ** 2 - 1.3 ** 2), 2);
    expect(s.przyrostMasyKgMies).toBeGreaterThan(0.15);
    expect(s.przyrostMasyKgMies).toBeLessThan(0.3);
    expect(s.przyrostMasyKg).toBeGreaterThan(s.przyrostMasyKgMies * (s.months - 1));
  });
  it('chłopiec 15;3, 102,5 kg, umiarkowana: czas zgodny z regułą, dłuższy niż dawny', () => {
    const CH = { sex: 'M', ageYears: 15.25, weightKg: 102.5, heightCm: 186.7, weeklyLossKg: UMIARK_15 };
    const s = sym(CH);
    expect(s.months).toBe(wyrocznia(CH, true));
    expect(s.months).toBeGreaterThan(wyrocznia(CH, false));
  });
});

describe('rata X: czego reguła nie rusza', () => {
  it('stabilizacja (tempo 0): masa stała, bez przyrostu — czas jak dawniej', () => {
    const P = { sex: 'F', ageYears: 8, weightKg: 40, heightCm: 130, weeklyLossKg: 0 };
    const s = sym(P);
    expect(s.przyrostMasyKgMies).toBe(0);
    expect(s.przyrostMasyKg).toBe(0);
    expect(s.months).toBe(wyrocznia(P, false));
  });
  it('„Wzrost zakończony”: bez wzrastania i bez przyrostu masy', () => {
    const s = sym({ sex: 'M', ageYears: 15.25, weightKg: 102.5, heightCm: 186.7, weeklyLossKg: UMIARK_15, growthEnded: true });
    expect(s.growthAware).toBe(false);
    expect(s.przyrostMasyKgMies).toBe(0);
    expect(s.przyrostMasyKg).toBe(0);
  });
  it('praktycznie zakończone wzrastanie (dziewczyna 17 l.): bez przyrostu masy', () => {
    expect(win.energyChildGrowthOutlook({ ageYears: 17, sex: 'F', heightCm: 165 }).practicallyEnded).toBe(true);
    const s = sym({ sex: 'F', ageYears: 17, weightKg: 90, heightCm: 165, weeklyLossKg: 253 * 7 / 7700 });
    expect(s.przyrostMasyKg).toBe(0);
  });
  it('dorosły: bez wzrastania i bez przyrostu', () => {
    const s = sym({ sex: 'M', ageYears: 40, weightKg: 95, heightCm: 178, weeklyLossKg: 0.5 });
    expect(s.growthAware).toBe(false);
    expect(s.przyrostMasyKg ?? 0).toBe(0);
  });
});
