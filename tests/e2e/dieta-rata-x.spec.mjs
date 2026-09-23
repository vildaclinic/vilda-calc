import { expect, test } from '@playwright/test';

// P-DIETA rata X (decyzje właściciela 2026-09-23): czas dojścia do normy BMI przy redukcji u rosnącego dziecka dolicza
// masę przybywającą ze wzrastaniem; linijka o wzrastaniu w karcie drogi i karcie planu mówi o tym wprost. Stabilizacja,
// „Wzrost zakończony” i dorośli bez zmian. PRAWDZIWA strona, dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energySimulateMonthsToBmiTarget === 'function' && !!window.VildaBmi);
}

async function stan(page, c) {
  return page.evaluate(async (c) => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const set = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) { el.disabled = false; el.checked = on; } };
    window.professionalMode = true; window.intakeHistory = null; window.lastLoadedData = null; window.hasUserModifiedAfterLoad = false;
    window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = !!c.redukcja;
    set('name', 'Testowa Fikcyjna'); set('sex', c.sex); set('age', c.y); set('ageMonths', 0); set('weight', c.w); set('height', c.h); set('customGoalKg', '');
    if (typeof window.ensureDietRecommendationsElements === 'function') window.ensureDietRecommendationsElements();
    flag('reduceToggle', !!c.redukcja); flag('stabilizationToggle', false); flag('growthEndedFlag', !!c.wzrostZakonczony);
    const jf = document.getElementById('journeyFlag'); if (jf) { jf.checked = !c.bezDrogi; jf.dispatchEvent(new Event('change', { bubbles: true })); }
    window.update();
    await new Promise((r) => { setTimeout(r, 700); });
    const norm = (s) => String(s || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    const st = window.energyBuildPlanReductionState({ sex: c.sex, ageYears: c.y, ageMonthsOpt: 0, weightKg: c.w, heightCm: c.h, palInput: null });
    const d = st.diets.find((x) => x.zalecana) || st.diets[0];
    const sim = d ? window.energySimulateMonthsToBmiTarget({ ageYears: c.y, ageMonthsOpt: 0, sex: c.sex, weightKg: c.w, heightCm: c.h, weeklyLossKg: d.weeklyLoss, target: 'norm', growthEnded: !!c.wzrostZakonczony }) : null;
    return {
      sim,
      droga: norm((document.querySelector('#bmiJourneyMount .bmi-journey-growth') || {}).textContent),
      plan: norm((document.querySelector('#planResults .plan-growth-note') || {}).textContent),
    };
  }, c);
}

test.describe('P-DIETA rata X — czas do normy z masą przybywającą ze wzrastaniem', () => {
  test('RX-1: dziewczynka 8 l, 45 kg (≥ 99c), redukcja: dopisek o masie w karcie drogi i karcie planu, liczba z symulacji', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await stan(page, { sex: 'F', y: 8, w: 45, h: 130 });
    expect(r.sim.przyrostMasyKgMies).toBeGreaterThan(0.15);
    const kg = r.sim.przyrostMasyKgMies.toFixed(1).replace('.', ',');
    expect(r.droga).toMatch(new RegExp(`^uwzględnia dalsze wzrastanie \\(ok\\. [\\d,]+ cm/rok\\) i masę przybywającą z nim \\(ok\\. ${kg} kg/mies\\.\\)$`));
    const p = await stan(page, { sex: 'F', y: 8, w: 45, h: 130, bezDrogi: true });
    expect(p.plan).toMatch(new RegExp(`^uwzględnia dalsze wzrastanie \\(ok\\. [\\d,]+ cm/rok\\) i masę przybywającą z nim \\(ok\\. ${kg} kg/mies\\.\\)$`));
  });

  test('RX-2: 8-latka 97–99c w stabilizacji — bez dopisku; 11-latek z „Wzrost zakończony” — bez wzrastania i bez przyrostu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const s = await stan(page, { sex: 'F', y: 8, w: 40, h: 130 });
    expect(s.droga).toContain('uwzględnia dalsze wzrastanie');
    expect(s.droga).not.toContain('masę przybywającą');
    const z = await stan(page, { sex: 'M', y: 11, w: 60, h: 150, redukcja: true, wzrostZakonczony: true });
    expect(z.sim.growthAware).toBe(false);
    expect(z.sim.przyrostMasyKg).toBe(0);
    expect(z.droga).not.toContain('masę przybywającą');
  });
});
