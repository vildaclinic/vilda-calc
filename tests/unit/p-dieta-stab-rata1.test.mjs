import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA-STAB rata 1 (decyzje właściciela 2026-09-28, po przeglądzie piśmiennictwa na przypadku chłopca 7 l. 3 mies.,
// 44 kg, 131 cm, BMI 25,6, 99,2. centyl OLAF, któremu stabilizacja dawała „ok. 2200 kcal”):
//  1. domyślny PAL 1,4 przy otyłości także w wieku 4–9 lat (dotąd 1,6) — REE Henry’ego zgodne z kalorymetrią
//     (Puyau 2025, doi:10.1016/j.ajcnut.2024.12.003: 1350–1380 kcal wobec 1381), o nadmiarze decydował PAL;
//  2. sufit tempa 6–11 lat ≥ 99. centyla 1 / 1,5 / 2 kg/mies. (Mazur 2022; Barlow 2007 tab. 8);
//  3. domyślna strategia 6–11 lat: stabilizacja tylko przy nadwadze, przy otyłości redukcja (Barlow 2007 tab. 8);
//  4. stabilizacja jako górna granica dnia (w dół do 50 kcal) i kontrola po 12 tygodniach: masa ponad dzisiejszą
//     + przyrost z samego wzrastania → obniżka 100–200 kcal.
// PRAWDZIWY silnik (vilda_diet_plan_ui.js + VildaBmi na tablicach OLAF). Wyrocznie REE przepisane z Henry 2005,
// nie z pliku danych. Dane FIKCYJNE.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');

const henryBoy3_9 = (w, hM) => (0.0632 * w + 1.31 * hM + 1.28) * 239;
const defFor = (kgMies) => Math.round(kgMies * 7700 / 30.4375);
const w50 = (x) => Math.floor(x / 50) * 50;
const plan = (p) => win.energyBuildPlanReductionState({ palInput: null, ...p });
const strategia = (p) => win.energyResolveStrategy({ state: plan(p), ageYears: p.ageYears });
const DZIS = new Date(2026, 8, 28);
const kontrolaStab = (p) => {
  const st = plan(p);
  return win.energyKontrolaPlanu(
    { key: 'stabilization', stabilizacja: true, weeklyLoss: 0, monthlyLossKg: 0, intake: st.maintenanceKcal, gornaKcal: st.maintenanceGornaKcal },
    { weightKg: p.weightKg, floorKcal: st.floorKcal, dzis: DZIS, sex: p.sex, ageYears: p.ageYears, ageMonthsOpt: p.ageMonthsOpt || 0, heightCm: p.heightCm },
  );
};

const CHLOPIEC = { sex: 'M', ageYears: 7.25, ageMonthsOpt: 3, weightKg: 44, heightCm: 131 };

describe('Przypadek zgłoszenia: chłopiec 7 l. 3 mies., 44 kg, 131 cm (otyłość, 99,2. centyl OLAF)', () => {
  const st = plan(CHLOPIEC);
  const ree = henryBoy3_9(44, 1.31);
  it('klasa z silnika: otyłość ≥ 99. centyla, etap 6–11 lat', () => {
    expect(st.bmiClass.obese).toBe(true);
    expect(st.bmiClass.severe).toBe(true);
    expect(st.bmiClass.percentile).toBeGreaterThanOrEqual(99);
    expect(st.childPlanStage).toBe('age_6_11');
  });
  it('PAL domyślny 1,4 (dotąd 1,6); REE Henry’ego 1381 kcal bez zmian', () => {
    expect(st.palUsed).toBe(1.4);
    expect(Math.round(st.reeKcal)).toBe(Math.round(ree));
    expect(Math.round(ree)).toBe(1381);
  });
  it('stabilizacja: zapotrzebowanie 1933 kcal (dotąd 2209), górna granica dnia ≤ 1900 kcal', () => {
    expect(st.maintenanceKcal).toBe(Math.round(ree * 1.4));
    expect(st.maintenanceKcal).toBe(1933);
    expect(st.maintenanceGornaKcal).toBe(w50(st.maintenanceKcal));
    expect(st.maintenanceGornaKcal).toBe(1900);
  });
  it('domyślna strategia: redukcja (≥ 99. centyla), jak dotąd', () => {
    expect(strategia(CHLOPIEC)).toBe('reduction');
  });
  it('redukcja: tempo 1 / 1,5 / 2 kg/mies., górne granice ≤ 1650 / 1550 / 1400 kcal (dotąd ≤ 2050 / 1950 / 1800)', () => {
    expect(st.diets.map((d) => d.monthlyLossKg)).toEqual([1, 1.5, 2]);
    expect(st.diets.map((d) => d.intake)).toEqual([1, 1.5, 2].map((r) => st.maintenanceKcal - defFor(r)));
    expect(st.diets.map((d) => d.gornaKcal)).toEqual([1650, 1550, 1400]);
    expect(Math.min(...st.diets.map((d) => d.intake))).toBeGreaterThanOrEqual(st.floorKcal);
    expect(st.floorKcal).toBe(Math.round(ree));
  });
  it('kontrola stabilizacji po 12 tygodniach: masa = dziś + przyrost ze wzrastania, obniżka do 1700–1800 kcal', () => {
    const k = kontrolaStab(CHLOPIEC);
    expect(k.stabilizacja).toBe(true);
    expect(k.tygodnie).toBe(12);
    expect(k.ubytekDietyKg).toBe(0);
    expect(k.przyrostKg).toBeGreaterThan(0.3);
    expect(k.masaSpodziewanaKg).toBe(Math.round((44 + k.przyrostKg) * 10) / 10);
    // P-DIETA-STAB rata 2: próg = spodziewana masa + margines 1 % masy (0,3–1 kg) na wahania pomiaru
    expect(k.tolerancjaKg).toBe(0.44);
    expect(k.progKg).toBe(Math.round((44 + k.przyrostKg + 0.44) * 10) / 10);
    expect(k.progKg).toBeGreaterThan(k.masaSpodziewanaKg);
    expect(k.gornaKcal).toBe(1900);
    expect(k.podazPoObnizceKcal).toEqual([1700, 1800]);
  });
});

describe('Inne grupy wieku i klasy BMI', () => {
  it('chłopiec 4 l., 105 cm, 22 kg (otyłość): PAL 1,4, stabilizacja ≤ 1350 kcal, bez diet (2–5 lat)', () => {
    const p = { sex: 'M', ageYears: 4, ageMonthsOpt: 0, weightKg: 22, heightCm: 105 };
    const st = plan(p);
    expect(st.bmiClass.obese).toBe(true);
    expect(st.palUsed).toBe(1.4);
    expect(st.maintenanceKcal).toBe(Math.round(henryBoy3_9(22, 1.05) * 1.4));
    expect(st.maintenanceGornaKcal).toBe(1350);
    expect(st.diets).toEqual([]);
    expect(strategia(p)).toBe('stabilization');
  });
  it('chłopiec 7 l., 124 cm, 30 kg (nadwaga): bez zmian — PAL 1,6, stabilizacja domyślna, jedna dieta 0,5 kg/mies.', () => {
    const p = { sex: 'M', ageYears: 7, ageMonthsOpt: 0, weightKg: 30, heightCm: 124 };
    const st = plan(p);
    expect(st.bmiClass.overweight).toBe(true);
    expect(st.bmiClass.obese).toBe(false);
    expect(st.palUsed).toBe(1.6);
    expect(strategia(p)).toBe('stabilization');
    expect(st.maintenanceGornaKcal).toBe(w50(st.maintenanceKcal));
    expect(st.diets.map((d) => [d.key, d.monthlyLossKg])).toEqual([['light', 0.5]]);
  });
  it('dziewczynka 8 l., 130 cm, 40 kg (otyłość < 99. centyla): domyślnie redukcja lekka 0,5 kg/mies. (dotąd stabilizacja)', () => {
    const p = { sex: 'F', ageYears: 8, ageMonthsOpt: 0, weightKg: 40, heightCm: 130 };
    const st = plan(p);
    expect(st.bmiClass.obese).toBe(true);
    expect(st.bmiClass.severe).toBe(false);
    expect(strategia(p)).toBe('reduction');
    expect(st.diets.map((d) => [d.key, d.monthlyLossKg, d.zalecana])).toEqual([['light', 0.5, true]]);
  });
  it('chłopiec 10,5 l., 145 cm, 58 kg (otyłość < 99. centyla, etap 6–11): redukcja domyślna; Molnár i PAL 1,4 bez zmian', () => {
    const p = { sex: 'M', ageYears: 10.5, ageMonthsOpt: 6, weightKg: 58, heightCm: 145 };
    const st = plan(p);
    expect(st.childPlanStage).toBe('age_6_11');
    expect(st.bmiClass.severe).toBe(false);
    expect(st.reeRownanie.id).toBe('MOLNAR_1995');
    expect(st.palUsed).toBe(1.4);
    expect(strategia(p)).toBe('reduction');
  });
  it('nastolatek 14 l. z otyłością: PAL, sufit tempa i strategia bez zmian; stabilizacja (wybrana ręcznie) też jako górna granica', () => {
    const p = { sex: 'M', ageYears: 14, ageMonthsOpt: 0, weightKg: 85, heightCm: 165 };
    const st = plan(p);
    expect(st.palUsed).toBe(1.4);
    expect(st.diets.map((d) => d.monthlyLossKg)).toEqual([1, 1.5, 2]);
    expect(strategia(p)).toBe('reduction');
    expect(st.maintenanceGornaKcal).toBe(w50(st.maintenanceKcal));
  });
  it('dorosły: bez stabilizacji dziecięcej (maintenanceGornaKcal null)', () => {
    const st = plan({ sex: 'M', ageYears: 30, ageMonthsOpt: 0, weightKg: 110, heightCm: 178 });
    expect(st.maintenanceKcal).toBeNull();
    expect(st.maintenanceGornaKcal).toBeNull();
  });
});

describe('P-DIETA-STAB rata 2: margines progu kontroli stabilizacji — 1 % masy, nie mniej niż 0,3 kg, nie więcej niż 1 kg', () => {
  const przypadki = [
    [{ sex: 'M', ageYears: 4, ageMonthsOpt: 0, weightKg: 22, heightCm: 105 }, 0.3], // 0,22 → minimum 0,3
    [{ sex: 'F', ageYears: 8, ageMonthsOpt: 0, weightKg: 40, heightCm: 130 }, 0.4],
    [{ sex: 'M', ageYears: 14, ageMonthsOpt: 0, weightKg: 85, heightCm: 165 }, 0.85],
    [{ sex: 'M', ageYears: 16, ageMonthsOpt: 0, weightKg: 130, heightCm: 180 }, 1], // 1,3 → maksimum 1
  ];
  for (const [p, tol] of przypadki) {
    it(`${p.sex} ${p.ageYears} l., ${p.weightKg} kg → margines ${tol} kg, próg = dziś + przyrost + margines`, () => {
      const k = kontrolaStab(p);
      expect(win.ENERGY_KONTROLA_PLANU.stabilizacjaTolerancja).toEqual({ czescMasy: 0.01, minKg: 0.3, maxKg: 1 });
      expect(k.tolerancjaKg).toBe(tol);
      expect(k.progKg).toBe(Math.round((p.weightKg + k.przyrostKg + tol) * 10) / 10);
    });
  }
  it('dieta (wiersz redukcji) bez marginesu stabilizacji — reguła raty W bez zmian', () => {
    const st = plan(CHLOPIEC);
    const d = st.diets[0];
    const k = win.energyKontrolaPlanu(d, { weightKg: 44, floorKcal: st.floorKcal, dzis: DZIS, sex: 'M', ageYears: 7.25, ageMonthsOpt: 3, heightCm: 131 });
    expect(k.tolerancjaKg).toBe(0);
    expect(k.progKg).toBe(Math.round((44 + k.przyrostKg - k.ubytekDietyKg * 0.5) * 10) / 10);
  });
});

describe('Kontrola: wiersz bez tempa bez flagi stabilizacji dalej nie daje kontroli', () => {
  it('weeklyLoss 0 bez stabilizacja:true → null (reguła raty V bez zmian)', () => {
    const st = plan(CHLOPIEC);
    const k = win.energyKontrolaPlanu({ key: 'light', weeklyLoss: 0, intake: 1900 }, { weightKg: 44, floorKcal: st.floorKcal, dzis: DZIS, sex: 'M', ageYears: 7.25, heightCm: 131 });
    expect(k).toBeNull();
  });
});

describe('Plan PDF: sekcja kontroli przy stabilizacji', () => {
  const okP = wczytajDoOkna(oknoZSilnikiem(), 'vilda_raport_plan.js');
  const k = { tygodnie: 12, terminTekst: '21 grudnia 2026', terminKrotki: '21 XII', terminRok: 2026, masaDzisKg: 44, masaSpodziewanaKg: 44.5, progKg: 44.5, gornaKcal: 1900, obnizkaKcal: [100, 200], obnizkaMozliwa: true, podazPoObnizceKcal: [1700, 1800], przyrostKg: 0.53, wzrastanie: true };
  const html = okP.VildaRaportPlan.html({ patient: { name: 'Testowy Fikcyjny' }, baseResult: { dane: {
    wersja: 1, dorosly: false, strategia: 'stabilization', pacjent: { wiekLat: 7.25, wiekMies: 87, plec: 'M', masaKg: 44, wzrostCm: 131, bmi: 25.6 },
    klasyfikacja: { nadmiar: true, otylosc: true }, energia: { podazZaokrKcal: 1900, gornaGranica: true, utrzymanieKcal: 1933 },
    masa: { docelowaKg: 31.6 }, zdania: {}, punkty: {}, kontrola: k } } });
  it('kafel kcal „≤ 1900” jako górna granica, kontrola 12 tygodni, próg „> 44,5 kg”, masa przy stabilizacji', () => {
    expect(html).toContain('<span>KONTROLA ZA 12 TYGODNI</span>');
    expect(html).toContain('<b>ok.\u00A044,5\u00A0kg</b><span>masa przy stabilizacji</span><i>dziś 44,0 kg + wzrastanie</i>');
    expect(html).toContain('<b>&gt;\u00A044,5\u00A0kg</b><span>odejmij od planu</span><i>100–200 kcal</i>');
    expect(html).toMatch(/<b>≤[\s\u00A0]1[\s\u00A0]900<\/b><span>kcal dziennie<\/span><i>górna granica dnia, nie cel<\/i>/);
    expect(html).not.toContain('spodziewana masa');
  });
});
