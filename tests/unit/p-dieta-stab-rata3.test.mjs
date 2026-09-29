import { afterAll, describe, expect, it } from 'vitest';
import { oknoZSilnikiem, wczytajDoOkna } from '../support/silnik-bmi.mjs';

// P-DIETA-STAB rata 3 (decyzje właściciela 2026-09-29, przypadek chłopca 13 l., 76 kg, 168 cm, BMI 26,9, 96. centyl OLAF,
// któremu stabilizacja dawała ok. 3100 kcal):
//  1. REE wg Molnára 1995 także przy NADWADZE 10–18 lat (dotąd tylko otyłość) — Hofsteenge 2010 walidował go
//     u nastolatków z nadwagą lub otyłością; Puyau 2025: Oxford/Henry zawyża BEE u chłopców z nadwagą/otyłością o ok. 11 %;
//  2. domyślny PAL 1,4 także przy nadwadze 10–18 lat (dotąd 1,6) — koniec skoku ok. 600 kcal na 97. centylu;
//  3. kategoria (nadwaga/otyłość) z siatki wybranej w karcie „Centyle i BMI” (globalne bmiSource) — ta sama, którą pokazuje
//     „Podsumowanie wyników”.
// PRAWDZIWY silnik (vilda_diet_plan_ui.js + VildaBmi na tablicach OLAF/WHO/Palczewskiej). Wyrocznia REE przepisana
// z Molnára 1995 (tab. V), nie z pliku danych. Dane FIKCYJNE.

const zapisane = {};
function ustawGlobal(k, v) { if (!(k in zapisane)) zapisane[k] = globalThis[k]; globalThis[k] = v; }
afterAll(() => { for (const k of Object.keys(zapisane)) { if (zapisane[k] === undefined) delete globalThis[k]; else globalThis[k] = zapisane[k]; } });
ustawGlobal('KCAL_PER_KG', 7700);
ustawGlobal('CHILD_AGE_MIN', 0.25);
ustawGlobal('vildaAppSetTrustedHtml', (el, html) => { el.innerHTML = html; });
ustawGlobal('vildaAppClearHtml', (el) => { el.innerHTML = ''; });
const win = wczytajDoOkna(oknoZSilnikiem(), 'vilda_diet_plan_ui.js');

function zZrodlem(zr, fn) {
  const bylo = 'bmiSource' in globalThis, poprzednie = globalThis.bmiSource;
  globalThis.bmiSource = zr;
  try { return fn(); } finally { if (bylo) globalThis.bmiSource = poprzednie; else delete globalThis.bmiSource; }
}
const molnar = (sex, w, hCm, age) => (sex === 'F' ? 51.2 * w + 24.5 * hCm - 207.5 * age + 1629.8 : 50.9 * w + 25.3 * hCm - 50.3 * age + 26.9) / 4.184;
const henryBoy10_17 = (w, hM) => 15.6 * w + 266 * hM + 299;
const w50 = (x) => Math.floor(x / 50) * 50;
const plan = (p) => win.energyBuildPlanReductionState({ ageMonthsOpt: 0, palInput: null, ...p });
const strategia = (p) => win.energyResolveStrategy({ state: plan(p), ageYears: p.ageYears });

const CHLOPIEC = { sex: 'M', ageYears: 13, weightKg: 76, heightCm: 168 };

describe('Przypadek zgłoszenia: chłopiec 13 l., 76 kg, 168 cm (nadwaga, 96. centyl OLAF)', () => {
  const st = zZrodlem('OLAF', () => plan(CHLOPIEC));
  it('klasa z siatki OLAF: nadwaga, bez otyłości; strategia domyślna — stabilizacja (rata N2, bez zmian)', () => {
    expect(st.bmiClass.source).toBe('OLAF');
    expect(st.bmiClass.overweight).toBe(true);
    expect(st.bmiClass.obese).toBe(false);
    expect(zZrodlem('OLAF', () => strategia(CHLOPIEC))).toBe('stabilization');
  });
  it('REE wg Molnára (1791 kcal zamiast Henry 1931), PAL 1,4 (zamiast 1,6)', () => {
    expect(st.reeRownanie.id).toBe('MOLNAR_1995');
    expect(st.reeAdjustedKcal).toBe(Math.round(molnar('M', 76, 168, 13)));
    expect(Math.round(molnar('M', 76, 168, 13))).toBe(1791);
    expect(Math.round(st.reeKcal)).toBe(Math.round(henryBoy10_17(76, 1.68)));
    expect(st.palUsed).toBe(1.4);
  });
  it('stabilizacja: 2507 kcal → górna granica ≤ 2500 (dotąd 3090 → ≤ 3050)', () => {
    expect(st.maintenanceKcal).toBe(Math.round(molnar('M', 76, 168, 13) * 1.4));
    expect(st.maintenanceKcal).toBe(2507);
    expect(st.maintenanceGornaKcal).toBe(2500);
  });
  it('redukcja (jeśli wybrana): nadwaga 12–18 lat, sufit 0,5 / 1 / 1,5 kg/mies. → ≤ 2350 / 2250 / 2100', () => {
    expect(st.diets.map((d) => d.monthlyLossKg)).toEqual([0.5, 1, 1.5]);
    expect(st.diets.map((d) => d.gornaKcal)).toEqual([2350, 2250, 2100]);
    expect(st.diets.map((d) => d.gornaKcal)).toEqual([126, 253, 379].map((df) => w50(st.maintenanceKcal - df)));
  });
});

describe('Koniec skoku na 97. centylu (OLAF): 78 kg (nadwaga) i 78,5 kg (otyłość) liczą się tym samym REE i PAL', () => {
  it('różnica energii utrzymania to tylko przyrost masy (ok. 12 kcal/kg × 1,4), nie ~600 kcal', () => {
    const n = zZrodlem('OLAF', () => plan({ sex: 'M', ageYears: 13, weightKg: 78, heightCm: 168 }));
    const o = zZrodlem('OLAF', () => plan({ sex: 'M', ageYears: 13, weightKg: 78.5, heightCm: 168 }));
    expect(n.bmiClass.obese).toBe(false);
    expect(o.bmiClass.obese).toBe(true);
    expect([n.reeRownanie.id, o.reeRownanie.id]).toEqual(['MOLNAR_1995', 'MOLNAR_1995']);
    expect([n.palUsed, o.palUsed]).toEqual([1.4, 1.4]);
    expect(o.maintenanceKcal - n.maintenanceKcal).toBe(Math.round(molnar('M', 78.5, 168, 13) * 1.4) - Math.round(molnar('M', 78, 168, 13) * 1.4));
    expect(o.maintenanceKcal - n.maintenanceKcal).toBeLessThan(20);
  });
});

describe('Granice zmiany', () => {
  it('nastolatek z masą prawidłową: Henry i PAL 1,6 bez zmian (brak planu otyłości)', () => {
    const st = zZrodlem('OLAF', () => plan({ sex: 'M', ageYears: 13, weightKg: 52, heightCm: 168 }));
    expect(st.bmiClass.overweight).toBe(false);
    expect(st.palUsed).toBe(1.6);
    expect(st.reeRownanie).toBeNull();
    expect(st.maintenanceKcal).toBeNull();
  });
  it('nadwaga poniżej 10 lat: Henry i PAL 1,6 bez zmian (Molnár tylko 10–18 lat z danych)', () => {
    const st = zZrodlem('OLAF', () => plan({ sex: 'M', ageYears: 8, weightKg: 33, heightCm: 130 }));
    expect(st.bmiClass.overweight).toBe(true);
    expect(st.bmiClass.obese).toBe(false);
    expect(st.reeRownanie.id).toBe('HENRY_2005');
    expect(st.palUsed).toBe(1.6);
  });
  it('dziewczynka 15 l., 162 cm, 66 kg (nadwaga): Molnár 1B (kobiety) i PAL 1,4', () => {
    const st = zZrodlem('OLAF', () => plan({ sex: 'F', ageYears: 15, weightKg: 66, heightCm: 162 }));
    expect(st.bmiClass.overweight).toBe(true);
    expect(st.bmiClass.obese).toBe(false);
    expect(st.reeAdjustedKcal).toBe(Math.round(molnar('F', 66, 162, 15)));
    expect(st.maintenanceKcal).toBe(Math.round(molnar('F', 66, 162, 15) * 1.4));
  });
});

describe('Siatka odniesienia = wybór z karty „Centyle i BMI” (bmiSource)', () => {
  it('ten sam chłopiec: OLAF → nadwaga i stabilizacja; WHO i Palczewska → otyłość i redukcja (z-score jak w karcie)', () => {
    const r = {};
    for (const zr of ['OLAF', 'WHO', 'PALCZEWSKA']) {
      r[zr] = zZrodlem(zr, () => {
        const st = plan(CHLOPIEC);
        const oc = win.VildaBmi.ocen({ bmi: 76 / 1.68 ** 2, plec: 'M', wiekMies: 156, zrodlo: zr });
        return { src: st.bmiClass.source, z: st.bmiClass.z, zKarta: oc.sds, obese: st.bmiClass.obese, strat: strategia(CHLOPIEC), maint: st.maintenanceKcal };
      });
    }
    expect(r.OLAF.src).toBe('OLAF');
    expect(r.WHO.src).toBe('WHO');
    expect(r.PALCZEWSKA.src).toBe('PALCZEWSKA');
    for (const zr of ['OLAF', 'WHO', 'PALCZEWSKA']) expect(r[zr].z, zr).toBeCloseTo(r[zr].zKarta, 9);
    expect([r.OLAF.obese, r.WHO.obese, r.PALCZEWSKA.obese]).toEqual([false, true, true]);
    expect([r.OLAF.strat, r.WHO.strat, r.PALCZEWSKA.strat]).toEqual(['stabilization', 'reduction', 'reduction']);
    // po racie 3 energia utrzymania nie zależy od tego, czy siatka nazwie to nadwagą, czy otyłością
    expect(new Set([r.OLAF.maint, r.WHO.maint, r.PALCZEWSKA.maint]).size).toBe(1);
  });
});
