import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA-AUDYT2 rata 2 (akceptacja właściciela 2026-09-30): bezpieczeństwo i teksty, bez obniżania kcal.
// PRAWDZIWY silnik (vilda_diet_plan_ui.js + VildaBmi na tablicach OLAF/WHO + moduł ryzyka zaburzeń odżywiania).
// Dane FIKCYJNE. Druga część pliku to „mapa skoków”: test CHARAKTERYZUJĄCY — przypina dzisiejsze skoki na progach
// (część B audytu), żeby każda przyszła zmiana była świadoma. To nie jest ocena, że te skoki są poprawne.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('bmiSource', 'OLAF');
// moduł ryzyka woła pomocnika z app.js
ustawGlobal('energyIsNumeric', (v) => typeof v === 'number' && Number.isFinite(v));
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });
const okno = oknoZSilnikiem();
wczytajDoOkna(okno, 'vilda_anorexia_risk.js');
const win = wczytajDoOkna(okno, 'vilda_diet_plan_ui.js');

const plan = (p) => win.energyBuildPlanReductionState({ palInput: null, ageMonthsOpt: 0, ...p });
const karta = (p) => win.energyBuildIntakeObservedState({ palInput: null, ageMonthsOpt: 0, ...p });
const gorna = (st, key) => { const d = (st.diets || []).find((x) => x.key === key); return d ? d.gornaKcal : null; };
// historia masy: dwa pomiary odległe o `dni` (czas z wieku w miesiącach, jak window.intakeHistory)
const historia = (wiekMiesTeraz, masaWczesniej, masaTeraz, dni) => [
  { ageMonths: wiekMiesTeraz - dni / 30.44, weight: masaWczesniej },
  { ageMonths: wiekMiesTeraz, weight: masaTeraz },
];

describe('R2-1: sygnał ryzyka z historii masy nie pogłębia deficytu u dziecka z nadmiarem masy i od 65 lat', () => {
  const dz8 = { sex: 'F', ageYears: 8, weightKg: 59.6, heightCm: 130 };

  it('8-latka po 6 tyg. zgodnie z planem (61,7 → 59,6 kg): ostrzeżenie zostaje, plan jak bez historii (dotąd 1868 kcal i sama lekka ≤ 1600)', () => {
    const bez = plan(dz8);
    const z = plan({ ...dz8, history: historia(96, 61.7, 59.6, 42) });
    expect(z.risk && z.risk.any).toBe(true);
    expect(z.riskBezKorekty).toBe(true);
    expect(z.riskAdjusted).toBe(false);
    expect(z.maintenanceKcal).toBe(bez.maintenanceKcal);
    expect(z.maintenanceKcal).toBe(2197);
    expect(z.diets.map((d) => [d.key, d.gornaKcal])).toEqual([['light', 1900], ['moderate', 1800], ['intense', 1650]]);
    // dawna baza: TEE × 0,85 (to samo mnożenie silnik nadal robi u dorosłego 19–64 lat, niżej)
    expect(Math.round(z.teeRawKcal * 0.85)).toBe(1868);
    expect(z.tempoObserwowaneKgMies).toBe(1.52);
    expect(z.tempoZaSzybkie).toBeNull(); // 1,5 kg/mies. ≤ górna granica wiersza 2 kg/mies.
  });

  it('ubytek szybszy niż górna granica wiersza (61,7 → 57,6… tu 63,7 → 59,6 kg w 42 dni ≈ 3 kg/mies.) → alarm z limitem 2 kg/mies., plan bez obniżki', () => {
    const z = plan({ ...dz8, history: historia(96, 63.7, 59.6, 42) });
    expect(z.tempoZaSzybkie).toEqual({ kgMies: 2.97, limitKgMies: 2, dni: 42 });
    expect(z.maintenanceKcal).toBe(2197);
  });

  it('dorosły 40 lat — bez zmian (decyzja właściciela): korekta × 0,85 nadal działa', () => {
    const d = { sex: 'F', ageYears: 40, weightKg: 80, heightCm: 165 };
    const bez = plan(d);
    const z = plan({ ...d, history: historia(480, 84, 80, 42) });
    expect(z.riskAdjusted).toBe(true);
    expect(z.riskBezKorekty).toBe(false);
    expect(z.teeBaselineKcal).toBeCloseTo(bez.teeRawKcal * 0.85, 6);
    expect(gorna(bez, 'moderate')).toBe(1800);
    expect(gorna(z, 'moderate')).toBe(1550);
  });

  it('70-latka z tym samym spadkiem — bez obniżki (ESPEN 2019: ocena niezamierzonego spadku), ostrzeżenie zostaje', () => {
    const d = { sex: 'F', ageYears: 70, weightKg: 80, heightCm: 165 };
    const bez = plan(d);
    const z = plan({ ...d, history: historia(840, 84, 80, 42) });
    expect(z.risk && z.risk.any).toBe(true);
    expect(z.riskBezKorekty).toBe(true);
    expect(z.diets.map((x) => x.gornaKcal)).toEqual(bez.diets.map((x) => x.gornaKcal));
    expect(z.tempoZaSzybkie).toBeNull(); // alarm tempa dotyczy planu dziecka
  });

  it('karta spożycia liczy tak samo (parytet z planem)', () => {
    const z = karta({ ...dz8, history: historia(96, 61.7, 59.6, 42), applyRiskAdjust: true });
    expect(z.riskBezKorekty).toBe(true);
    expect(Math.round(z.teeBaselineKcal)).toBe(2197);
  });

  it('granice alarmu: najwyższy sufit wiersza; 2–5 lat 0,45 kg/mies. (Barlow 2007); obserwacja wymaga odstępu ≥ 14 dni', () => {
    expect(win.energyLimitAlarmuUbytku('age_6_11', { severe: true })).toBe(2);
    expect(win.energyLimitAlarmuUbytku('age_6_11', { severe: false })).toBe(0.5);
    expect(win.energyLimitAlarmuUbytku('age_12_18', { obese: true })).toBe(2);
    expect(win.energyLimitAlarmuUbytku('age_12_18', { obese: false })).toBe(1.5);
    expect(win.energyLimitAlarmuUbytku('age_2_5', {})).toBe(0.45);
    expect(win.energyTempoUbytkuZHistorii(historia(96, 61.7, 59.6, 10))).toBeNull();
    expect(win.energyTempoUbytkuZHistorii([{ ageMonths: 90, weight: 40 }])).toBeNull();
  });
});

describe('R2-4..8: podpisy i drobne błędy', () => {
  it('minimum: plan zwraca minimum bezwzględne (dotąd karta pisała „(spoczynkowa przemiana materii)” przy każdym minimum)', () => {
    const st = plan({ sex: 'F', ageYears: 8, weightKg: 61.7, heightCm: 130 });
    expect(st.floorAbsoluteKcal).toBe(1000);
    expect(st.floorKcal).toBe(st.floorReeKcal); // tu minimum to REE (1603 > 1000)
    const niska = plan({ sex: 'F', ageYears: 17.5, ageMonthsOpt: 6, weightKg: 61, heightCm: 145 });
    expect(niska.floorAbsoluteKcal).toBe(1200);
    expect(niska.floorKcal).toBe(1200); // REE Molnára 1117 < 1200 — to NIE jest „spoczynkowa przemiana materii”
    expect(niska.floorReeKcal).toBeLessThan(1200);
  });

  it('podpis celu z silnika BMI: 18-latek „BMI 24,9”, 13-latek „85. centyl BMI” (dotąd zawsze centyl)', () => {
    const d18 = plan({ sex: 'M', ageYears: 18, weightKg: 79, heightCm: 175 });
    expect(d18.bmiClass.celDorosly).toBe(true);
    expect(win.energyCelPodpis(d18.bmiClass)).toBe('BMI 24,9');
    const d13 = plan({ sex: 'M', ageYears: 13, weightKg: 76, heightCm: 168 });
    expect(d13.bmiClass.celDorosly).toBe(false);
    expect(win.energyCelPodpis(d13.bmiClass)).toBe('85. centyl BMI');
    expect(win.energyCelPodpis(d13.bmiClass, true)).toBe('85. centyl BMI dla wieku i wzrostu');
  });

  it('plakietka PAL 1,4 w 10–18 lat: Ekelund 2002 tylko przy otyłości; przy nadwadze opis bez tego źródła', () => {
    const nadw = plan({ sex: 'M', ageYears: 13, weightKg: 70, heightCm: 168 });
    const otyl = plan({ sex: 'M', ageYears: 13, weightKg: 85, heightCm: 168 });
    expect(nadw.bmiClass.obese).toBe(false);
    expect(nadw.modeBadge.detail).not.toContain('Ekelund');
    expect(nadw.modeBadge.detail).toContain('brak pomiarów PAL dla samej nadwagi');
    expect(otyl.bmiClass.obese).toBe(true);
    expect(otyl.modeBadge.detail).toContain('typowa przy otyłości (Ekelund 2002)');
  });

  it('karta spożycia bez podanego PAL bierze domyślny PAL planu (dotąd 1,4 przed 10 l. i 1,6 od 10 l., odwrotnie)', () => {
    for (const ageYears of [9.9, 10]) {
      const p = { sex: 'M', ageYears, weightKg: 45, heightCm: 141 };
      expect(karta(p).palUsed, String(ageYears)).toBe(plan(p).palUsed);
    }
    expect(karta({ sex: 'M', ageYears: 9.9, weightKg: 45, heightCm: 141 }).palUsed).toBe(1.6);
    expect(karta({ sex: 'M', ageYears: 10, weightKg: 45, heightCm: 141 }).palUsed).toBe(1.4);
  });
});

describe('Mapa skoków (część B audytu) — stan przypięty świadomie, nie ocena poprawności', () => {
  it('97. centyl, 4–9 lat (B1): chł. 7;0, 124,6 cm, 33,4 → 33,5 kg: PAL 1,6 → 1,4; 1921 → 1683 kcal', () => {
    const a = plan({ sex: 'M', ageYears: 7, weightKg: 33.4, heightCm: 124.6 });
    const b = plan({ sex: 'M', ageYears: 7, weightKg: 33.5, heightCm: 124.6 });
    expect([a.palUsed, a.maintenanceKcal, a.maintenanceGornaKcal]).toEqual([1.6, 1921, 1900]);
    expect([b.palUsed, b.maintenanceKcal, gorna(b, 'light')]).toEqual([1.4, 1683, 1550]);
  });

  it('10. urodziny przy nadwadze (B2): chł. 46 kg, 141,5 cm: 2310 (Henry × 1,6) → 1822 (Molnár × 1,4)', () => {
    const a = plan({ sex: 'M', ageYears: 9 + 11 / 12, ageMonthsOpt: 11, weightKg: 46, heightCm: 141.5 });
    const b = plan({ sex: 'M', ageYears: 10, weightKg: 46, heightCm: 141.5 });
    expect([a.palUsed, a.maintenanceKcal]).toEqual([1.6, 2310]);
    expect([b.palUsed, b.maintenanceKcal]).toEqual([1.4, 1822]);
  });

  it('85. centyl, 10–18 lat (B3): chł. 13;0, 168 cm: 63,1 kg → karta 2796, bez planu; 63,2 kg → plan 2289, ≤ 2250', () => {
    const a = karta({ sex: 'M', ageYears: 13, weightKg: 63.1, heightCm: 168 });
    const b = plan({ sex: 'M', ageYears: 13, weightKg: 63.2, heightCm: 168 });
    expect([a.palUsed, Math.round(a.teeBaselineKcal)]).toEqual([1.6, 2796]);
    expect(plan({ sex: 'M', ageYears: 13, weightKg: 63.1, heightCm: 168 }).maintenanceKcal).toBeNull();
    expect([b.palUsed, b.maintenanceKcal, b.maintenanceGornaKcal]).toEqual([1.4, 2289, 2250]);
  });

  it('BMI 30 u dorosłego (B4): M 40 l., 175 cm: umiarkowana ≤ 2300 → ≤ 2000; przy BMI 35 ≤ 2200', () => {
    const a = plan({ sex: 'M', ageYears: 40, weightKg: 91.84, heightCm: 175 });
    const b = plan({ sex: 'M', ageYears: 40, weightKg: 91.88, heightCm: 175 });
    const c = plan({ sex: 'M', ageYears: 40, weightKg: 107.19, heightCm: 175 });
    expect([a.palUsed, gorna(a, 'moderate')]).toEqual([1.6, 2300]);
    expect([b.palUsed, gorna(b, 'moderate')]).toEqual([1.4, 2000]);
    expect(gorna(c, 'moderate')).toBe(2200);
  });

  it('19. urodziny (B5): M 175/79: PAL 1,4, lekka ≤ 2350 (zalecana) → PAL 1,6, umiarkowana ≤ 2200', () => {
    const a = plan({ sex: 'M', ageYears: 18 + 11 / 12, ageMonthsOpt: 11, weightKg: 79, heightCm: 175 });
    const b = plan({ sex: 'M', ageYears: 19, weightKg: 79, heightCm: 175 });
    expect(a.palUsed).toBe(1.4);
    expect(a.diets.map((d) => [d.key, d.gornaKcal, !!d.zalecana])).toEqual([['light', 2350, true], ['moderate', 2250, false], ['intense', 2100, false]]);
    expect(b.palUsed).toBe(1.6);
    expect(b.diets.map((d) => [d.key, d.gornaKcal])).toEqual([['light', 2400], ['moderate', 2200], ['intense', 2000]]);
  });

  it('18. urodziny, masa prawidłowa (B5): M 175/76: TEE 3151 → 2836 (Henry 10–18 → 18–30)', () => {
    expect(Math.round(karta({ sex: 'M', ageYears: 17 + 11 / 12, ageMonthsOpt: 11, weightKg: 76, heightCm: 175 }).teeBaselineKcal)).toBe(3151);
    expect(Math.round(karta({ sex: 'M', ageYears: 18, weightKg: 76, heightCm: 175 }).teeBaselineKcal)).toBe(2836);
  });

  it('4. urodziny przy nadwadze: chł. 100 cm, 19,5 kg: PAL 1,4 → 1,6; 1279 → 1462', () => {
    const a = plan({ sex: 'M', ageYears: 3 + 11 / 12, ageMonthsOpt: 11, weightKg: 19.5, heightCm: 100 });
    const b = plan({ sex: 'M', ageYears: 4, weightKg: 19.5, heightCm: 100 });
    expect([a.palUsed, a.maintenanceKcal, b.palUsed, b.maintenanceKcal]).toEqual([1.4, 1279, 1.6, 1462]);
  });

  it('60. urodziny (Henry 60+): K 160/82: umiarkowana ≤ 1550 → ≤ 1500; 65. urodziny: bez zmiany kcal (B9)', () => {
    expect(gorna(plan({ sex: 'F', ageYears: 59 + 11 / 12, ageMonthsOpt: 11, weightKg: 82, heightCm: 160 }), 'moderate')).toBe(1550);
    expect(gorna(plan({ sex: 'F', ageYears: 60, weightKg: 82, heightCm: 160 }), 'moderate')).toBe(1500);
    const n1 = plan({ sex: 'M', ageYears: 64 + 11 / 12, ageMonthsOpt: 11, weightKg: 83, heightCm: 175 });
    const n2 = plan({ sex: 'M', ageYears: 65, weightKg: 83, heightCm: 175 });
    expect(n2.diets.map((d) => d.gornaKcal)).toEqual(n1.diets.map((d) => d.gornaKcal));
    expect(n2.diets.map((d) => d.gornaKcal)).toEqual([2200, 2000, 1800]);
  });

  it('siatka zmienia klasę i PAL: chł. 7;0, 124,6 cm, 33,2 kg — OLAF nadwaga (1,6; 1916), WHO otyłość (1,4; 1677)', () => {
    const a = plan({ sex: 'M', ageYears: 7, weightKg: 33.2, heightCm: 124.6 });
    ustawGlobal('bmiSource', 'WHO');
    const b = plan({ sex: 'M', ageYears: 7, weightKg: 33.2, heightCm: 124.6 });
    globalThis.bmiSource = 'OLAF';
    expect([a.palUsed, a.maintenanceKcal, a.bmiClass.categoryKey]).toEqual([1.6, 1916, 'nadwaga']);
    expect([b.palUsed, b.maintenanceKcal, b.bmiClass.categoryKey]).toEqual([1.4, 1677, 'otylosc']);
  });
});
