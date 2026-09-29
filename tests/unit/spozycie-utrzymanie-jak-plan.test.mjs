import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-SPOZYCIE-REE (decyzja właściciela 2026-09-29, opcja A): karta „Szacowane spożycie energii” liczy „utrzymanie masy”
// dziecka z nadmiarem masy tym samym wzorem co plan diety — bez dodatku na wzrastanie i z REE wg Molnára 1995 w wieku
// 10–18 lat. Przypadek zgłoszenia: chłopiec 13 l., 76 kg, 168 cm (nadwaga, OLAF), PAL 1,4 — karta 2731 kcal
// (Henry × 1,4 × 1,01), plan 2507 kcal (Molnár × 1,4). PRAWDZIWY silnik; wyrocznia REE przepisana z Molnára 1995.
// Dane FIKCYJNE.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });
ustawGlobal('bmiSource', 'OLAF');
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');

const molnar = (sex, w, hCm, age) => (sex === 'F' ? 51.2 * w + 24.5 * hCm - 207.5 * age + 1629.8 : 50.9 * w + 25.3 * hCm - 50.3 * age + 26.9) / 4.184;
const henryBoy10_17 = (w, hM) => 15.6 * w + 266 * hM + 299;
const karta = (p, pal) => win.energyBuildIntakeObservedState({ ageMonthsOpt: 0, palInput: pal, applyRiskAdjust: false, ...p });
const plan = (p, pal) => win.energyBuildPlanReductionState({ ageMonthsOpt: 0, palInput: pal, ...p });

describe('Karta spożycia: utrzymanie masy jak w planie diety', () => {
  it('przypadek zgłoszenia: chłopiec 13 l., 76 kg, 168 cm, PAL 1,4 — 2507 kcal w karcie i w planie (dotąd karta 2731)', () => {
    const p = { sex: 'M', ageYears: 13, weightKg: 76, heightCm: 168 };
    const k = karta(p, 1.4);
    expect(k.bmiClass.overweight).toBe(true);
    expect(k.reeRownanie.id).toBe('MOLNAR_1995');
    expect(k.reeAdjustedKcal).toBe(Math.round(molnar('M', 76, 168, 13)));
    expect(Math.round(k.teeBaselineKcal)).toBe(Math.round(molnar('M', 76, 168, 13) * 1.4));
    expect(Math.round(k.teeBaselineKcal)).toBe(2507);
    expect(Math.round(k.teeBaselineKcal)).toBe(plan(p, 1.4).maintenanceKcal);
    // dawna wartość karty: Henry × PAL × 1,01 (dodatek na wzrastanie)
    expect(Math.round(henryBoy10_17(76, 1.68) * 1.4 * 1.01)).toBe(2731);
    expect(k.teeRawKcal).toBeCloseTo(k.teeBaselineKcal, 9);
  });

  it('ta sama liczba co plan przy różnych PAL, płci, wieku i nasileniu (nadwaga i otyłość, 4–17 lat)', () => {
    const przypadki = [
      { sex: 'M', ageYears: 13, weightKg: 60, heightCm: 155 },
      { sex: 'F', ageYears: 12, weightKg: 52, heightCm: 152 },
      { sex: 'F', ageYears: 15, weightKg: 66, heightCm: 162 },
      { sex: 'M', ageYears: 17, weightKg: 80, heightCm: 178 },
      { sex: 'M', ageYears: 15, weightKg: 102.5, heightCm: 186.7 },
      { sex: 'F', ageYears: 16, weightKg: 90, heightCm: 160 },
      { sex: 'M', ageYears: 7, weightKg: 44, heightCm: 131 },
      { sex: 'M', ageYears: 8, weightKg: 33, heightCm: 130 },
      { sex: 'M', ageYears: 4, weightKg: 22, heightCm: 105 },
    ];
    for (const p of przypadki) {
      for (const pal of [1.4, 1.6, 1.8]) {
        const k = karta(p, pal);
        const pl = plan(p, pal);
        expect(k.bmiClass.overweight, JSON.stringify(p)).toBe(true);
        expect(pl.palUsed, JSON.stringify(p)).toBe(pal);
        expect(Math.round(k.teeBaselineKcal), `${JSON.stringify(p)} PAL ${pal}`).toBe(pl.maintenanceKcal);
      }
    }
  });

  it('poniżej 10 lat z nadmiarem masy: Henry bez korekty i bez dodatku na wzrastanie (jak w planie)', () => {
    const k = karta({ sex: 'M', ageYears: 8, weightKg: 33, heightCm: 130 }, 1.6);
    expect(k.reeRownanie).toBeNull();
    expect(k.reeFactor).toBe(1);
    expect(k.teeBaselineKcal).toBeCloseTo(k.reeKcal * 1.6, 6);
  });

  it('bez nadmiaru masy — bez zmian: Henry i dodatek na wzrastanie jak dotąd', () => {
    const k = karta({ sex: 'M', ageYears: 13, weightKg: 52, heightCm: 168 }, 1.6);
    expect(k.bmiClass.overweight).toBe(false);
    expect(k.reeFactor).toBe(1);
    expect(k.reeRownanie).toBeNull();
    expect(k.teeBaselineKcal).toBeGreaterThan(k.reeKcal * 1.6); // dodatek na wzrastanie zostaje
    expect(Math.round(k.reeKcal)).toBe(Math.round(henryBoy10_17(52, 1.68)));
  });
});
