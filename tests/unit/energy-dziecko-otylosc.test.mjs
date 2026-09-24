import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// ENERGY-CHILD-MID1 (decyzja właściciela 2026-09-12, po przeglądzie „diety zbyt rygorystyczne"):
// plan i stabilizacja u dziecka 2–18 lat z BMI ≥ 85c liczą się od zapotrzebowania dla MASY AKTUALNEJ
// z korektą −10 % REE na otyłość (Hofsteenge 2010), bez mnożnika wzrastania ×1,01. Deficyt wynika
// z BEZPIECZNEGO TEMPA, nie ze stałej: 12–18 lat 1 / 1,5 / 2 kg/mies. (Mazur 2022: do 1–2 kg/mies.),
// 6–11 lat ≥ 99c 0,5 / 1 / 1,5, 6–11 lat < 99c tylko 0,5 (Barlow 2007), 2–5 lat brak diet.
// Podłoga = max(minimum wieku 1000/1200 kcal, REE po korekcie) — żaden plan nie schodzi poniżej
// spoczynkowej przemiany materii. Masa należna (mediana BMI) zostaje CELEM, nie podstawą energii.
// PAL domyślny planu 10–18 lat (MID2/MID3): 1,6 przy nadwadze, 1,4 przy otyłości; silnik bez podanego
// PAL używa tej samej wartości co formularz.
// Dorośli i dzieci z BMI < 85c: bez zmian merytorycznych (deficyt procentowy / brak planu).
// P-DIETA rata U (decyzje właściciela 2026-09-23): korekta REE × 0,9 WRACA, ale tylko przy otyłości (≥ 97c)
// od 10 lat (poprawka błędu równania, niezależna od PAL); poniżej 10 lat i przy samej nadwadze mnożnik 1.
// Podstawa diety = zapotrzebowanie dla masy docelowej (85c) − 200/350/500 kcal (Mazur 2022), sufit tempa
// 1/1,5/2 kg/mies. — szczegóły w tests/unit/rata-u-dieta-dziecka.test.mjs.
// P-DIETA-SILNIK: klasa BMI, mediana i cel 85. centyla pochodzą z PRAWDZIWEGO silnika vilda_bmi.js
// na PRAWDZIWYCH tablicach OLAF — koniec atrap getLMS. Dane pacjentów FIKCYJNE.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => {
  for (const k of Object.keys(zapisane)) {
    if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k];
  }
});

// Ładowanie synchroniczne na poziomie modułu: describe() korzysta ze stanu silnika już przy zbieraniu testów.
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');
const T = win.VildaBmi;

/** Wyrocznia: to samo pytanie zadane wprost silnikowi (bez przechodzenia przez moduł diety). */
function zSilnika({ sex, ageYears, weightKg, heightCm }) {
  const h2 = (heightCm / 100) ** 2;
  const mies = ageYears * 12;
  const r = T.ocen({ bmi: weightKg / h2, plec: sex, wiekMies: mies, zrodlo: 'OLAF' });
  const cel = T.celNormy({ wiekMies: mies, wzrostCm: heightCm, plec: sex, zrodlo: 'OLAF' });
  return { h2, r, cel, needed: r.mediana * h2, target: cel.bmiCel * h2 };
}

const henryBoy10_17 = (w, hM) => 15.6 * w + 266 * hM + 299;
const henryBoy3_9 = (w, hM) => (0.0632 * w + 1.31 * hM + 1.28) * 239;
const henryGirl3_9 = (w, hM) => 15.9 * w + 210 * hM + 349;
const plan = (o) => win.energyBuildPlanReductionState({ ageMonthsOpt: 0, palInput: null, ...o });
// P-DIETA rata V (2026-09-23): u dziecka 10–18 lat z OTYŁOŚCIĄ REE = Molnár 1995 (1A chłopcy, 1B dziewczęta; kJ/24 h),
// doi:10.1016/s0022-3476(95)70114-1 — wyrocznia testu przepisana z tabeli V publikacji, NIE z pliku danych;
// silnik czyta współczynniki z vilda_ree_rownania_data.js. Przy nadwadze i poniżej 10 lat zostaje Henry bez korekty.
const molnar = (sex, w, hCm, age) => (sex === 'F' ? 51.2 * w + 24.5 * hCm - 207.5 * age + 1629.8 : 50.9 * w + 25.3 * hCm - 50.3 * age + 26.9) / 4.184;
const defFor = (kgPerMonth) => Math.round(kgPerMonth * 7700 / 30.4375); // 0,5→126; 1→253; 1,5→379; 2→506

describe('Klasa BMI i masa należna (mediana BMI × wzrost²) — z silnika, nie z atrapy', () => {
  it('chłopiec 14 l, 165 cm, 85 kg (OLAF): z, centyl, kategoria, mediana i cel P85 równe wynikom silnika', () => {
    const p = { sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165 };
    const c = win.energyChildBmiClass(p);
    const { r, cel, needed, target } = zSilnika(p);
    expect(r.siatka).toBe('OLAF');
    expect(c.bmi).toBeCloseTo(85 / 1.65 ** 2, 9);
    expect(c.z).toBeCloseTo(r.sds, 9);
    expect(c.percentile).toBeCloseTo(r.centyl, 9);
    expect(c.source).toBe('OLAF');
    expect(c.overweight).toBe(true);
    expect(c.obese).toBe(true);
    expect(r.kategoria.klucz).toBe('otylosc');
    // „severe" to ≥ 99. centyl (Barlow 2007) — jedna granica, prosto z centyla silnika
    expect(c.severe).toBe(r.centyl >= 99);
    expect(c.medianBmi).toBeCloseTo(r.mediana, 9);
    expect(c.neededWeightKg).toBeCloseTo(needed, 9);
    // ENERGY-CHILD-MID2: cel leczenia to 85. centyl BMI (Mazur 2022), nie mediana — wyżej niż masa należna
    expect(c.targetBmi).toBeCloseTo(cel.bmiCel, 9);
    expect(c.targetWeightKg).toBeCloseTo(target, 9);
    expect(c.targetWeightKg).toBeGreaterThan(c.neededWeightKg);
  });
  it('chłopiec 10 l, 140 cm, 33 kg → BMI poniżej mediany: nie nadwaga', () => {
    const c = win.energyChildBmiClass({ sex: 'M', ageYears: 10, weightKg: 33, heightCm: 140 });
    expect(c.z).toBeLessThan(0);
    expect(c.overweight).toBe(false);
  });
  it('bez silnika BMI klasa nie powstaje — moduł nie ma własnego wzoru LMS ani zapasowej interpolacji', () => {
    const bez = wczytajDoOkna(Object.assign({ addEventListener() {}, location: { pathname: '/' }, navigator: {}, window: null }, {}), 'vilda_diet_plan_ui.js');
    expect(bez.energyChildBmiClass({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165 })).toBeNull();
    expect(bez.energyBuildPlanReductionState({ ageYears: 14, ageMonthsOpt: 0, sex: 'M', weightKg: 85, heightCm: 165, palInput: 1.4 }).childObesityPlan).toBe(false);
  });
  it('decyzja 1: przy OLAF poniżej 3 lat klasa idzie z Palczewskiej (tablice OLAF zaczynają się od 36 mies.)', () => {
    const c = win.energyChildBmiClass({ sex: 'M', ageYears: 1, ageMonthsOpt: 12, weightKg: 14, heightCm: 78 });
    const r = T.ocen({ bmi: 14 / 0.78 ** 2, plec: 'M', wiekMies: 12, zrodlo: 'OLAF' });
    expect(r.siatka).toBe('PALCZEWSKA');
    expect(c.source).toBe('PALCZEWSKA');
    expect(c.z).toBeCloseTo(r.sds, 9);
    expect(T.lms('M', 12, 'OLAF'), 'tablice OLAF nie sięgają 12 mies.').toBeNull();
  });
});

describe('Domyślny PAL planu (P-PAL rata 1): jedna tabela wg wieku 1,4 / 1,6 / 1,6 / 1,6; otyłość −1 stopień tylko 10–18 lat i dorośli', () => {
  it('energyDefaultPlanPal bez antropometrii: 14 l → 1,6; 10 l → 1,6; 8 l → 1,6; 2 l → 1,4; 30 l → 1,6', () => {
    expect(win.energyDefaultPlanPal(14, 0)).toBe(1.6);
    expect(win.energyDefaultPlanPal(10, 0)).toBe(1.6);
    expect(win.energyDefaultPlanPal(8, 0)).toBe(1.6);
    expect(win.energyDefaultPlanPal(2, 0)).toBe(1.4);
    expect(win.energyDefaultPlanPal(30, 0)).toBe(1.6);
  });
  it('tabela jako dane (ENERGY_PAL_DOMYSLNY) — normy nie są założeniem wbudowanym w silnik', () => {
    expect(win.ENERGY_PAL_DOMYSLNY).toEqual({ child_1_3: 1.4, child_4_9: 1.6, child_10_18: 1.6, adult: 1.6, otylosc: { child_10_18: 1.4, adult: 1.4 } });
    expect(Object.isFrozen(win.ENERGY_PAL_DOMYSLNY)).toBe(true);
  });
  it('dorosły: otyłość (BMI ≥ 30) → 1,4; nadwaga, norma i NIEDOWAGA → 1,6 (niedowaga nigdy nie obniża PAL)', () => {
    expect(win.energyDefaultPlanPal(30, 0, { sex: 'M', weightKg: 100, heightCm: 170 })).toBe(1.4); // BMI 34,6
    expect(win.energyDefaultPlanPal(30, 0, { sex: 'M', weightKg: 86.7, heightCm: 170 })).toBe(1.4); // BMI 30,0
    expect(win.energyDefaultPlanPal(30, 0, { sex: 'M', weightKg: 86.4, heightCm: 170 })).toBe(1.6); // BMI 29,9
    expect(win.energyDefaultPlanPal(30, 0, { sex: 'F', weightKg: 50, heightCm: 170 })).toBe(1.6); // BMI 17,3
    expect(win.energyDefaultPlanPal(30, 0, { obese: true })).toBe(1.4);
    expect(win.energyDefaultPlanPal(30, 0, { obese: false })).toBe(1.6);
    // silnik bez jawnego PAL bierze tę samą wartość, także u dorosłego
    expect(plan({ sex: 'M', ageYears: 30, weightKg: 100, heightCm: 170, palInput: null }).palUsed).toBe(1.4);
    expect(plan({ sex: 'M', ageYears: 30, weightKg: 70, heightCm: 170, palInput: null }).palUsed).toBe(1.6);
    expect(plan({ sex: 'F', ageYears: 30, weightKg: 50, heightCm: 170, palInput: null }).palUsed).toBe(1.6);
  });
  it('dziecko 4–9 lat z otyłością zostaje przy 1,6; nastolatek z niedowagą 1,6; 2-latek 1,4', () => {
    expect(plan({ sex: 'M', ageYears: 8, weightKg: 45, heightCm: 130, palInput: null }).palUsed).toBe(1.6);
    expect(plan({ sex: 'M', ageYears: 7, weightKg: 24, heightCm: 122, palInput: null }).palUsed).toBe(1.6);
    expect(win.energyDefaultPlanPal(14, 0, { sex: 'M', weightKg: 40, heightCm: 165 })).toBe(1.6);
    expect(win.energyDefaultPlanPal(2, 6, { sex: 'M', weightKg: 18, heightCm: 90 })).toBe(1.4);
  });
  it('rata V: dwa niezależne elementy u nastolatka z otyłością — PAL 1,4 (aktywność) i REE z równania Molnára 1995 (dane), bez mnożnika 0,9', () => {
    expect(win.CHILD_REE_OBESITY_FACTOR).toBe(1);
    expect(win.CHILD_REE_FACTOR_OD_LAT).toBe(10);
    expect(win.CHILD_REE_OTYLOSC_ZRODLO).toBe('MOLNAR_1995');
    const st = plan({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165, palInput: null });
    const mol = molnar('M', 85, 165, 14);
    expect(st.palUsed).toBe(1.4);
    expect(st.reeRownanie.id).toBe('MOLNAR_1995');
    expect(st.reeFactor).toBeCloseTo(mol / st.reeKcal, 9);
    expect(st.reeAdjustedKcal).toBe(Math.round(mol));
    expect(st.maintenanceKcal).toBe(Math.round(mol * 1.4));
  });
  it('ENERGY-CHILD-MID3: nastolatek z otyłością (≥ 97c) → 1,4; z samą nadwagą (85–97c) → 1,6', () => {
    // chłopiec 14 l, 165 cm: 85 kg to otyłość wg OLAF, 66 kg to nadwaga bez otyłości
    const otyly = win.energyChildBmiClass({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165 });
    const nadwaga = win.energyChildBmiClass({ sex: 'M', ageYears: 14, weightKg: 66, heightCm: 165 });
    expect(otyly.obese).toBe(true);
    expect(nadwaga.overweight).toBe(true);
    expect(nadwaga.obese).toBe(false);
    // klasa BMI podana wprost
    expect(win.energyDefaultPlanPal(14, 0, otyly)).toBe(1.4);
    expect(win.energyDefaultPlanPal(14, 0, nadwaga)).toBe(1.6);
    // albo sama antropometria — moduł liczy klasę sam (ścieżka formularza)
    expect(win.energyDefaultPlanPal(14, 0, { sex: 'M', weightKg: 85, heightCm: 165 })).toBe(1.4);
    expect(win.energyDefaultPlanPal(14, 0, { sex: 'M', weightKg: 66, heightCm: 165 })).toBe(1.6);
    // poniżej 10 lat otyłość niczego nie zmienia — pomiary DLW nie pokazują niższego PAL (P-PAL rata 1: 1,6)
    expect(win.energyDefaultPlanPal(8, 0, { sex: 'M', weightKg: 45, heightCm: 130 })).toBe(1.6);
  });
  it('ENERGY-CHILD-MID3: silnik bez jawnego PAL bierze wartość zależną od klasy BMI', () => {
    expect(plan({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165, palInput: null }).palUsed).toBe(1.4);
    expect(plan({ sex: 'M', ageYears: 14, weightKg: 66, heightCm: 165, palInput: null }).palUsed).toBe(1.6);
  });
  it('etykieta opcji 1,4 w selekcie planu 10–18 lat: „częsta przy otyłości", bez „poza Normami 2024"', () => {
    const el = { value: '', innerHTML: '' };
    win.energyPopulatePlanPalSelect(el, { ageYears: 14, ageMonthsOpt: 0, value: 1.4 });
    expect(el.innerHTML).toContain('częsta przy otyłości');
    expect(el.innerHTML).not.toContain('poza Normami');
    expect(el.value).toBe('1.4');
    const adult = { value: '', innerHTML: '' };
    win.energyPopulatePlanPalSelect(adult, { ageYears: 30, ageMonthsOpt: 0, value: 1.2 });
    expect(adult.innerHTML).not.toContain('częsta przy otyłości');
  });
  it('plakietka trybu: PAL 1,4 u 10–18 lat → ton „info" (nie „Tryb kliniczny"); PAL 1,2 dorosłego → kliniczny', () => {
    const teen = plan({ sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165, palInput: 1.4 });
    expect(teen.modeBadge.tone).toBe('info');
    expect(teen.modeBadge.text).toContain('PAL 1,4');
    const adult = plan({ sex: 'M', ageYears: 30, weightKg: 95, heightCm: 178, palInput: 1.2 });
    expect(adult.modeBadge.tone).toBe('clinical');
  });
});

describe('Plan 12–18 lat: REE dla MASY AKTUALNEJ (rata V: Molnár 1995 przy otyłości od 10 lat; Henry zostaje jako reeKcal kontekstu) × PAL, bez ×1,01; sufit tempa 1/1,5/2 kg/mies.', () => {
  const pacjent = { sex: 'M', ageYears: 14, weightKg: 85, heightCm: 165 };
  const st = plan({ ...pacjent, palInput: 1.4 });
  const needed = zSilnika(pacjent).needed;
  const reeAct = henryBoy10_17(85, 1.65);
  const reePlan = molnar('M', 85, 165, 14);
  const base = reePlan * 1.4;
  it('stan: childObesityPlan, etap 12–18, kontekst na masie aktualnej z mnożnikiem 1; masa należna zostaje celem', () => {
    expect(st.childObesityPlan).toBe(true);
    expect(st.childPlanStage).toBe('age_12_18');
    expect(st.context.anthropometry.source).toBe('actual');
    expect(st.context.anthropometry.weightUsedKg).toBe(85);
    expect(st.context.energy.growthMultiplier).toBe(1);
    expect(st.reeKcal).toBeCloseTo(reeAct, 3);
    expect(st.reeAdjustedKcal).toBe(Math.round(reePlan));
    expect(st.reeRownanie.id).toBe('MOLNAR_1995');
    expect(st.neededWeightKg).toBeCloseTo(needed, 9);
    // ENERGY-CHILD-MID2: stan planu niesie też cel leczenia z 85. centyla BMI
    const cls = win.energyChildBmiClass(pacjent);
    expect(st.targetWeightKg).toBeCloseTo(cls.targetWeightKg, 9);
    expect(st.targetWeightKg).toBeGreaterThan(st.neededWeightKg);
    expect(st.maintenanceKcal).toBe(Math.round(base));
  });
  it('stabilizacja nie jest ukrytym deficytem: baza ≥ REE po korekcie i wyżej niż dawna baza od masy należnej', () => {
    expect(st.maintenanceKcal).toBeGreaterThan(Math.round(reePlan));
    expect(st.maintenanceKcal).toBeGreaterThan(Math.round(henryBoy10_17(needed, 1.65) * 1.4)); // dawne 2175 kcal
  });
  it('trzy diety: deficyt 253/379/506 kcal = 1 / 1,5 / 2 kg/mies., tempo zgodne z deklaracją', () => {
    expect(st.diets.map((d) => d.key)).toEqual(['light', 'moderate', 'intense']);
    expect(st.diets.map((d) => d.monthlyLossKg)).toEqual([1, 1.5, 2]);
    expect(st.diets.map((d) => d.deficit)).toEqual([1, 1.5, 2].map(defFor));
    // rata U: u chłopca z otyłością II stopnia podstawa od masy docelowej − 200/350/500 dawałaby tempo szybsze niż sufit,
    // więc każda dieta jest ograniczona sufitem tempa — liczby jak dotąd (zapotrzebowanie aktualne − deficyt z tempa)
    expect(st.diets.map((d) => d.intake)).toEqual([1, 1.5, 2].map((r) => Math.round(base - defFor(r))));
    expect(st.diets[2].weeklyLoss).toBeCloseTo(defFor(2) * 7 / 7700, 6);
    expect(st.diets.every((d) => d.rateBased && d.tempoSufit && !d.rateCapped)).toBe(true);
    expect(st.diets.map((d) => d.zalecana)).toEqual([false, true, false]); // decyzja 4: umiarkowana domyślna u 12–18 z otyłością
  });
  it('podłoga to max(1200 kcal, REE po korekcie) — żadna dieta nie schodzi poniżej spoczynkowej przemiany materii', () => {
    expect(st.floorKcal).toBe(Math.round(reePlan));
    expect(st.floorAbsoluteKcal ?? 1200).toBe(1200);
    expect(st.floorReeKcal).toBe(Math.round(reePlan));
    expect(Math.min(...st.diets.map((d) => d.intake))).toBeGreaterThanOrEqual(st.floorKcal);
  });
  it('preset nutrition_actual (normy) zachowuje ×1,01 i masę aktualną — zmiana dotyczy tylko planu', () => {
    const ctx = win.energyBuildContext({ preset: 'nutrition_actual', ageYears: 14, ageMonthsOpt: 0, sex: 'M', weightKg: 85, heightCm: 165, palInput: 1.6 });
    expect(ctx.energy.growthMultiplier).toBe(1.01);
    expect(ctx.anthropometry.weightUsedKg).toBe(85);
  });
  it('ENERGY-CHILD-MID1/MID3: chłopiec 14 l z otyłością bez podanego PAL → silnik bierze tę samą wartość co formularz (1,4)', () => {
    const s2 = plan({ ...pacjent, palInput: null });
    const cls2 = win.energyChildBmiClass(pacjent);
    expect(s2.palUsed).toBe(win.energyDefaultPlanPal(14, 0, cls2));
    expect(s2.palUsed).toBe(1.4);
    // u dziecka bez nadwagi fallback pozostaje normatywny (stara ścieżka)
    expect(plan({ sex: 'M', ageYears: 10, weightKg: 33, heightCm: 140, palInput: null }).palUsed).toBe(1.6);
  });
});

describe('Etap 6–11 lat: < 99c tylko 0,5 kg/mies.; ≥ 99c 0,5 / 1 / 1,5 kg/mies.', () => {
  it('chłopiec 10 l, 145 cm, 55 kg (otyłość, ale < 99c wg OLAF) → tylko lekka z tempem 0,5 kg/mies. (126 kcal), reszta z powodem', () => {
    const pacjent = { sex: 'M', ageYears: 10, weightKg: 55, heightCm: 145 };
    const st = plan({ ...pacjent, palInput: 1.4 });
    const base = molnar('M', 55, 145, 10) * 1.4; // rata V: 10 lat z otyłością — Molnár
    expect(zSilnika(pacjent).r.centyl).toBeLessThan(99);
    expect(st.childPlanStage).toBe('age_6_11');
    expect(st.bmiClass.overweight).toBe(true);
    expect(st.bmiClass.severe).toBe(false);
    expect(st.diets.map((d) => d.key)).toEqual(['light']);
    expect(st.diets[0].deficit).toBe(defFor(0.5));
    expect(st.diets[0].monthlyLossKg).toBe(0.5);
    expect(st.diets[0].intake).toBe(Math.round(base - defFor(0.5)));
    expect(st.diets[0].rateCapped).toBe(true);
    expect(st.dietUnavailable.moderate).toContain('0,5 kg/mies.');
    expect(st.dietUnavailable.intense).toContain('6–11 lat');
  });
  it('chłopiec 8 l, 130 cm, 45 kg (≥ 99c wg OLAF) → trzy diety 0,5 / 1 / 1,5 kg/mies., podłoga z REE (> 1000 kcal)', () => {
    const pacjent = { sex: 'M', ageYears: 8, weightKg: 45, heightCm: 130 };
    const st = plan({ ...pacjent, palInput: 1.4 });
    const ree = henryBoy3_9(45, 1.3);
    const base = ree * 1.4; // rata U: poniżej 10 lat bez korekty REE
    expect(zSilnika(pacjent).r.centyl).toBeGreaterThanOrEqual(99);
    expect(st.bmiClass.severe).toBe(true);
    expect(st.diets.map((d) => d.monthlyLossKg)).toEqual([0.5, 1, 1.5]);
    expect(st.diets.map((d) => d.deficit)).toEqual([0.5, 1, 1.5].map(defFor));
    expect(st.diets.map((d) => d.intake)).toEqual([0.5, 1, 1.5].map((r) => Math.round(base - defFor(r))));
    expect(st.floorKcal).toBe(Math.round(ree));
    expect(st.floorKcal).toBeGreaterThan(1000);
    expect(st.diets.every((d) => d.rateCapped === false)).toBe(true);
  });
  it('dziewczynka 7 l, 118 cm, 35 kg (≥ 99c): trzy diety, każda powyżej REE po korekcie', () => {
    const pacjent = { sex: 'F', ageYears: 7, weightKg: 35, heightCm: 118 };
    const st = plan({ ...pacjent, palInput: 1.4 });
    const ree = henryGirl3_9(35, 1.18);
    expect(zSilnika(pacjent).r.centyl).toBeGreaterThanOrEqual(99);
    expect(st.bmiClass.severe).toBe(true);
    expect(st.diets.map((d) => d.key)).toEqual(['light', 'moderate', 'intense']);
    expect(st.floorKcal).toBe(Math.max(1000, Math.round(ree))); // rata U: 7 lat — bez korekty
    expect(Math.min(...st.diets.map((d) => d.intake))).toBeGreaterThanOrEqual(st.floorKcal);
  });
  it('dieta poniżej REE jest niedostępna z nazwanym powodem; poniżej minimum wieku — z powodem o minimum', () => {
    // wprost na silniku doboru diet: baza 1600 kcal, REE po korekcie 1400 → intensywna (−506) odpada przez REE
    // ≥ 99c to także otyłość (obese) — od raty N2 sama nadwaga 12–18 lat ma inny sufit tempa
    const przezRee = win.proposeChildDietsFromBase(1700, 14, { severe: true, obese: true }, 'age_12_18', 1400);
    expect(przezRee.floorKcal).toBe(1400);
    expect(przezRee.floorReeKcal).toBe(1400);
    expect(przezRee.diets.map((d) => d.key)).toEqual(['light']);
    expect(przezRee.unavailable.moderate).toContain('spoczynkowej przemiany materii');
    expect(przezRee.unavailable.intense).toContain('spoczynkowej przemiany materii');
    // bez REE (np. brak wzrostu) zostaje samo minimum wieku
    const przezMinimum = win.proposeChildDietsFromBase(1500, 14, { severe: true, obese: true }, 'age_12_18', null);
    expect(przezMinimum.floorKcal).toBe(1200);
    expect(przezMinimum.unavailable.moderate).toContain('minimum 1200 kcal');
  });
});

describe('Etap 2–5 lat: bez diet (stabilizacja) i energia utrzymania dla masy aktualnej', () => {
  it('chłopiec 3 l, 98 cm, 20 kg → diets [], powody „2–5 lat", maintenanceKcal = REE(masa aktualna) × PAL (bez korekty < 10 lat), nie mniej niż 1000', () => {
    const st = plan({ sex: 'M', ageYears: 3, weightKg: 20, heightCm: 98, palInput: 1.4 });
    const base = henryBoy3_9(20, 0.98) * 1.4; // rata U: 3 lata — bez korekty REE
    expect(st.childObesityPlan).toBe(true);
    expect(st.childPlanStage).toBe('age_2_5');
    expect(st.diets).toEqual([]);
    expect(st.dietUnavailable.light).toContain('2–5 lat');
    expect(st.maintenanceKcal).toBe(Math.max(1000, Math.round(base)));
    expect(st.floorKcal).toBe(1000);
    expect(st.maintenanceKcal).toBeGreaterThanOrEqual(st.floorKcal); // podłoga działa też w gałęzi 2–5 lat
  });
});

describe('Dziecko z BMI < 85c i dorosły', () => {
  it('chłopiec 10 l, 140 cm, 33 kg → brak planu (reductionNotIndicated), kontekst na masie aktualnej z ×1,01', () => {
    const st = plan({ sex: 'M', ageYears: 10, weightKg: 33, heightCm: 140, palInput: 1.4 });
    expect(st.childObesityPlan).toBe(false);
    expect(st.reductionNotIndicated).toBe(true);
    expect(st.diets).toEqual([]);
    expect(st.context.anthropometry.source).toBe('actual');
    expect(st.context.energy.growthMultiplier).toBe(1.01);
  });
  it('dorosły 40 l, 178 cm, 95 kg → bez zmian: deficyt 22 % TEE (≤ 750) dla umiarkowanej, minimum 1600 kcal (M)', () => {
    const st = plan({ sex: 'M', ageYears: 40, weightKg: 95, heightCm: 178, palInput: 1.4 });
    const tee = st.teeBaselineKcal;
    const mod = st.diets.find((d) => d.key === 'moderate');
    expect(st.childObesityPlan).toBe(false);
    expect(mod.deficit).toBe(Math.round(Math.min(0.22 * tee, 750)));
    expect(mod.fixedDeficit).toBeUndefined();
  });
});
