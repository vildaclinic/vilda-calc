import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { bezKomentarzy, oknoZSilnikiem, wczytajDoOkna, zrodlo } from '../support/silnik-bmi.mjs';

// P-DIETA-B5 (decyzje właściciela 2026-09-30, wariant A′): przejście 18/19 lat.
// 1) Granica ścieżki planu (19 lat) jako DANE — ENERGY_GRANICE_WIEKU; liczby planu bez zmian.
// 2) Zespół Downa: od 19 lat o nadmiarze masy w planie decyduje silnik BMI z populacją pacjenta (VildaBmi.ocen) —
//    do 20 lat centyl siatki DS, tak jak w wieku 18,99. Populacja ogólna: progi dorosłego z surowego BMI, jak dotąd.
// 3) Pary graniczne obu klifów (18,0 — kryterium BMI dorosłego; 19,0 — ścieżka planu) na PRAWDZIWYM silniku.
//    To test CHARAKTERYZUJĄCY: przypina dzisiejsze skoki, żeby każda zmiana była świadoma; nie ocenia, że są poprawne.
// Dane FIKCYJNE.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('bmiSource', 'OLAF');
ustawGlobal('energyIsNumeric', (v) => typeof v === 'number' && Number.isFinite(v));
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });
const okno = oknoZSilnikiem();
wczytajDoOkna(okno, 'vilda_anorexia_risk.js');
const win = wczytajDoOkna(okno, 'vilda_diet_plan_ui.js');

// Populacja pacjenta: silnik planu czyta VildaDsSource.populacja(), silnik BMI — resolver VildaPopulacjaPacjenta.
function ustawDS(ds) {
  if (ds) { win.VildaDsSource = { populacja: () => 'DS' }; win.VildaPopulacjaPacjenta = () => 'DS'; }
  else { delete win.VildaDsSource; delete win.VildaPopulacjaPacjenta; }
}
beforeEach(() => ustawDS(false));

const plan = (p) => win.energyBuildPlanReductionState({ palInput: null, ageMonthsOpt: 0, ...p });
const gorne = (st) => (st.diets || []).map((d) => [d.key, d.gornaKcal]);
const R18_11 = 18 + 11 / 12;

describe('B5-b: granica ścieżki planu jako dane (liczba bez zmian)', () => {
  it('ENERGY_GRANICE_WIEKU: 19 lat, zamrożone, ze źródłem i uwagą; ENERGY_ADULT_START_AGE z tych danych', () => {
    const G = win.ENERGY_GRANICE_WIEKU;
    expect(G.planSciezkaDoroslaOdLat).toBe(19);
    expect(Object.isFrozen(G)).toBe(true);
    expect(G.zrodlo).toMatch(/NASEM 2023/);
    expect(G.uwaga).toMatch(/decyzja wlasciciela/);
    expect(win.ENERGY_ADULT_START_AGE).toBe(19);
    expect(win.energyResolvePalBand(R18_11, 0)).toBe('child_10_18');
    expect(win.energyResolvePalBand(19, 0)).toBe('adult');
  });

  it('w kodzie silnika nie ma już liczby 19 jako granicy ścieżki (k bierze się z danych)', () => {
    const kod = bezKomentarzy(zrodlo('vilda_diet_plan_ui.js'));
    expect(kod).toContain('k=ENERGY_GRANICE_WIEKU.planSciezkaDoroslaOdLat');
    expect(kod).not.toMatch(/[,{;]k=19[,;]/);
  });
});

describe('B5-d: pary graniczne — klif 19,0 (ścieżka planu) i 18,0 (kryterium BMI dorosłego), populacja ogólna', () => {
  it('chł. 175 cm / 79 kg, 18;11 → 19;0: plan dziecka → plan dorosłego (PAL 1,4 → 1,6; minimum REE → brak; stabilizacja znika)', () => {
    const a = plan({ sex: 'M', ageYears: R18_11, weightKg: 79, heightCm: 175 });
    const b = plan({ sex: 'M', ageYears: 19, weightKg: 79, heightCm: 175 });
    expect(a.palUsed).toBe(1.4);
    expect(b.palUsed).toBe(1.6);
    expect(Math.round(a.teeBaselineKcal)).toBe(2518);
    expect(Math.round(b.teeBaselineKcal)).toBe(2877);
    expect(gorne(a)).toEqual([['light', 2350], ['moderate', 2250], ['intense', 2100]]);
    expect(a.diets.find((d) => d.zalecana).key).toBe('light');
    expect(gorne(b)).toEqual([['light', 2400], ['moderate', 2200], ['intense', 2000]]);
    expect(a.floorKcal).toBe(1798);
    expect(b.floorKcal).toBeNull();
    expect(b.diets.every((d) => d.floorKcal === 1600)).toBe(true);
    expect(!!a.childObesityPlan).toBe(true);
    expect(!!b.childObesityPlan).toBe(false);
    expect(a.maintenanceKcal).toBe(2518);
    expect(b.maintenanceKcal).toBeNull();
  });

  it('dz. 165 cm / 105 kg, 18;11 → 19;0: zalecana umiarkowana ≤ 2150 → ≤ 1950; intensywna u dorosłej poniżej REE', () => {
    const a = plan({ sex: 'F', ageYears: R18_11, weightKg: 105, heightCm: 165 });
    const b = plan({ sex: 'F', ageYears: 19, weightKg: 105, heightCm: 165 });
    expect(a.palUsed).toBe(1.4);
    expect(b.palUsed).toBe(1.4);
    expect(gorne(a)).toEqual([['light', 2300], ['moderate', 2150], ['intense', 2000]]);
    expect(a.diets.find((d) => d.zalecana).key).toBe('moderate');
    expect(gorne(b)).toEqual([['light', 2150], ['moderate', 1950], ['intense', 1750]]);
    expect(Math.round(b.reeKcal)).toBe(1825);
    expect(b.diets.find((d) => d.key === 'intense').gornaKcal).toBeLessThan(b.reeKcal);
  });

  it('chł. 175 cm / 79 kg, 17;11 → 18;0: kryterium BMI dorosłego — minimum 1810 → 1798, lekka ≤ 2400 → ≤ 2350', () => {
    const a = plan({ sex: 'M', ageYears: 17 + 11 / 12, weightKg: 79, heightCm: 175 });
    const b = plan({ sex: 'M', ageYears: 18, weightKg: 79, heightCm: 175 });
    expect(a.floorKcal).toBe(1810);
    expect(b.floorKcal).toBe(1798);
    expect(gorne(a)).toEqual([['light', 2400], ['moderate', 2250], ['intense', 2150]]);
    expect(gorne(b)).toEqual([['light', 2350], ['moderate', 2250], ['intense', 2100]]);
    expect(b.bmiClass.celDorosly).toBe(true);
    expect(a.bmiClass.celDorosly).toBe(false);
  });
});

describe('B5-a: zespół Downa — od 19 lat wskazanie z silnika BMI z populacją pacjenta', () => {
  const K150_68 = { sex: 'F', weightKg: 68, heightCm: 150 }; // BMI 30,2: otyłość I st. dorosłego; ok. 50.–60. centyl DS

  it('dz. z DS 150 cm / 68 kg: 18;11 i 19;0 — bez planu redukcji (masa prawidłowa wg siatki DS); 20;0 — plan dorosłego, PAL 1,4', () => {
    ustawDS(true);
    const a = plan({ ...K150_68, ageYears: R18_11 });
    const b = plan({ ...K150_68, ageYears: 19 });
    const c = plan({ ...K150_68, ageYears: 19.99 });
    const d = plan({ ...K150_68, ageYears: 20 });
    expect(a.reductionNotIndicated).toBe(true);
    expect(b.reductionNotIndicated).toBe(true); // dotąd: plan redukcji, umiarkowana ≤ 1450, PAL 1,4
    expect(b.diets).toEqual([]);
    expect(b.palUsed).toBe(1.6);
    expect(c.reductionNotIndicated).toBe(true);
    expect(d.reductionNotIndicated).toBe(false);
    expect(d.palUsed).toBe(1.4);
    expect(gorne(d)).toEqual([['light', 1600], ['moderate', 1450], ['intense', 1300]]);
  });

  it('te same dane bez DS (populacja ogólna) w 19;0 — plan redukcji i PAL 1,4, jak dotąd', () => {
    const b = plan({ ...K150_68, ageYears: 19 });
    expect(b.reductionNotIndicated).toBe(false);
    expect(b.palUsed).toBe(1.4);
    expect(gorne(b)).toEqual([['light', 1600], ['moderate', 1450], ['intense', 1300]]);
  });

  it('dz. z DS 150 cm / 88 kg, 19;3 — nadwaga wg siatki DS: plan dorosłego, PAL 1,6 (otyłość dopiero od 97. centyla DS)', () => {
    ustawDS(true);
    const st = plan({ sex: 'F', weightKg: 88, heightCm: 150, ageYears: 19.25 });
    const o = win.energyNadmiarSciezkiDoroslej({ sex: 'F', weightKg: 88, heightCm: 150, ageYears: 19.25 });
    expect(st.reductionNotIndicated).toBe(false);
    expect(st.palUsed).toBe(1.6);
    expect(o.categoryKey).toBe('nadwaga');
    expect(o.celDorosly).toBe(false);
    expect(o.source).toBe('DS');
    expect(o.targetWeightKg).toBeCloseTo(86.16, 1);
    expect(gorne(st)).toEqual([['light', 2100], ['moderate', 1900], ['intense', 1700]]);
  });

  it('energyNadmiarSciezkiDoroslej: DS 19;0 — klasa z siatki DS; populacja ogólna 19;0 — klasa dorosłego', () => {
    ustawDS(true);
    const ds = win.energyNadmiarSciezkiDoroslej({ ...K150_68, ageYears: 19 });
    expect(ds.categoryKey).toBe('prawidlowe');
    expect(ds.overweight).toBe(false);
    expect(ds.celDorosly).toBe(false);
    expect(win.energyBmiDoroslyWgSilnika(19.5)).toBe(false);
    expect(win.energyBmiDoroslyWgSilnika(20)).toBe(true);
    ustawDS(false);
    const og = win.energyNadmiarSciezkiDoroslej({ ...K150_68, ageYears: 19 });
    expect(og.categoryKey).toBe('otylosc-1');
    expect(og.overweight).toBe(true);
    expect(og.obese).toBe(true);
    expect(og.celDorosly).toBe(true);
    expect(win.energyBmiDoroslyWgSilnika(18)).toBe(true);
  });

  it('domyślny PAL dorosłego (energyDefaultPlanPal) idzie za tą samą klasą: DS 19;0 BMI 30,2 → 1,6; populacja ogólna → 1,4', () => {
    ustawDS(true);
    expect(win.energyDefaultPlanPal(19, 0, { sex: 'F', ...K150_68 })).toBe(1.6);
    ustawDS(false);
    expect(win.energyDefaultPlanPal(19, 0, { sex: 'F', ...K150_68 })).toBe(1.4);
  });

  it('mediana celu w symulacji: DS 19;0 — mediana siatki DS (nie BMI 22); populacja ogólna — BMI 22 jak dotąd', () => {
    const s = (ds) => { ustawDS(ds); return win.energySimulateMonthsToBmiTarget({ sex: 'F', ageYears: 19, ageMonthsOpt: 0, weightKg: 72, heightCm: 150, weeklyLossKg: 0.5, target: 'median' }); };
    const ds = s(true), og = s(false);
    // BMI 32: do mediany DS (ok. 29,5) ok. 5–6 kg; do BMI 22 (49,5 kg przy 150 cm) 22,5 kg
    expect(ds.months).toBeLessThan(4);
    expect(og.months).toBeGreaterThan(9);
  });
});

describe('B5-a: populacja ogólna od 19 lat — klasa silnika BMI = dotychczasowe progi 25 / 30 (bez zmiany wyników)', () => {
  it('siatka BMI 16–45 (co 0,05) × wiek 19–80 lat × płeć: nadmiar ⇔ BMI ≥ 25, otyłość ⇔ BMI ≥ 30', () => {
    const h = 170, h2 = (h / 100) ** 2;
    let n = 0;
    for (const sex of ['F', 'M']) for (const age of [19, 19.5, 25, 40, 64, 65, 80]) for (let b = 16; b <= 45; b += 0.05) {
      const o = win.energyNadmiarSciezkiDoroslej({ sex, ageYears: age, weightKg: b * h2, heightCm: h });
      const x = (b * h2) / h2;
      expect(o.overweight).toBe(x >= 25);
      expect(o.obese).toBe(x >= 30);
      expect(o.celDorosly).toBe(true);
      n += 1;
    }
    expect(n).toBeGreaterThan(8000);
  });

  it('bez silnika BMI — progi ADULT_BMI (25 / 30) z surowego BMI', () => {
    const B = win.VildaBmi;
    try {
      delete win.VildaBmi;
      const o = win.energyNadmiarSciezkiDoroslej({ sex: 'F', ageYears: 30, weightKg: 72.25, heightCm: 170 });
      expect(o.zSilnika).toBe(false);
      expect(o.overweight).toBe(true);
      expect(o.obese).toBe(false);
    } finally { win.VildaBmi = B; }
  });
});

describe('B5-c: notka o przejściu (karta lekarza „Strategia”, 18,0–19,99 lat) — liczby z silnika po obu stronach granicy', () => {
  it('chł. 175/79, 18;7: teraz plan dziecka → od 19 lat plan dorosłego; za 5 mies.; bez tempa i czasu do normy', () => {
    const m = win.energyPrzejscie19({ sex: 'M', ageYears: 18 + 7 / 12, weightKg: 79, heightCm: 175 });
    expect(m.przed).toBe(true);
    expect(m.miesiacyDo).toBe(5);
    expect(m.dziecko).toEqual({ pal: 1.4, teeKcal: 2518, diety: { light: 2350, moderate: 2250, intense: 2100 }, stabilizacja: true, minimumKcal: 1798, minimumRee: true });
    expect(m.dorosly).toEqual({ pal: 1.6, teeKcal: 2877, diety: { light: 2400, moderate: 2200, intense: 2000 }, stabilizacja: false, minimumKcal: 1600, bezPlanu: false, bezDiety: false });
    const t = win.energyPrzejscie19Html(m).replace(/<[^>]+>/g, ' ').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ');
    expect(t).toContain('Plan dorosłego od 19 lat — za 5 mies. te same dane dadzą inne liczby planu');
    expect(t).toContain('PAL domyślny 1,4 → 1,6');
    expect(t).toContain('Lekka ≤ 2350 → ≤ 2400 kcal');
    expect(t).toContain('Min. podaży 1798 (REE) → 1600 kcal');
    expect(t).not.toMatch(/kg\/mies|kg\/tydz|do normy|zalecan/);
    expect(win.energyPrzejscie19Html(m)).toMatch(/^<details class="diet-przejscie"[^>]*><summary>/); // domyślnie zwinięta
  });

  it('dz. 165/105, 19;2: do 18;11 plan dziecka → teraz plan dorosłego; poza 18,0–19,99 notki nie ma', () => {
    const m = win.energyPrzejscie19({ sex: 'F', ageYears: 19 + 2 / 12, weightKg: 105, heightCm: 165 });
    expect(m.przed).toBe(false);
    expect(m.miesiacyDo).toBeNull();
    expect(m.wiekDzieckaLabel).toBe('18;11');
    expect(m.dziecko.diety).toEqual({ light: 2300, moderate: 2150, intense: 2000 });
    expect(m.dorosly.diety).toEqual({ light: 2150, moderate: 1950, intense: 1750 });
    expect(win.energyPrzejscie19({ sex: 'F', ageYears: 17.99, weightKg: 105, heightCm: 165 })).toBeNull();
    expect(win.energyPrzejscie19({ sex: 'F', ageYears: 20, weightKg: 105, heightCm: 165 })).toBeNull();
  });

  it('stabilizacja zablokowana w karcie (flaga „Wzrost zakończony” albo prognoza) → notka: niedostępna; dorosły bez diety nad minimum → „żadna powyżej minimum” i minimum 1600', () => {
    const m = win.energyPrzejscie19({ sex: 'M', ageYears: 18 + 7 / 12, weightKg: 79, heightCm: 175, stabilizacjaZablokowana: true });
    expect(m.dziecko.stabilizacja).toBe(false);
    const n = win.energyPrzejscie19({ sex: 'M', ageYears: 18.5, weightKg: 55.5, heightCm: 136 });
    expect(n.dorosly.bezDiety).toBe(true);
    expect(n.dorosly.minimumKcal).toBe(1600);
    expect(n.dorosly.diety).toEqual({ light: null, moderate: null, intense: null });
    const t = win.energyPrzejscie19Html(n).replace(/<[^>]+>/g, ' ').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ');
    expect(t).toContain('Diety ≤ 1600 / ≤ 1450 / ≤ 1350 → żadna powyżej minimum');
    expect(t).toContain('Min. podaży 1338 (REE) → 1600 kcal');
    expect(win.energyPrzejscie19({ sex: 'F', ageYears: 18.5, weightKg: 105, heightCm: 165 }).dorosly.bezDiety).toBe(false);
  });
});
