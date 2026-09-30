import { expect, test } from '@playwright/test';

// P-DIETA-AUDYT2 rata 2 (akceptacja właściciela 2026-09-30: „Bezpieczeństwo i teksty, bez obniżania kcal”) —
// PRAWDZIWA strona, dane FIKCYJNE. Liczby planu sprawdza tests/unit/dieta-audyt2-rata2.test.mjs; tu teksty w kartach.
test.use({ serviceWorkers: 'block' });

async function otworz(page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function'
    && !!window.VildaRaportPlan && !!window.VildaBmi);
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    document.documentElement.classList.remove('vilda-auth-locked');
    const jf = document.getElementById('journeyFlag');
    if (jf && !jf.checked) { jf.checked = true; jf.dispatchEvent(new Event('change', { bubbles: true })); }
  });
}

async function wpisz(page, { sex, age, months = 0, weight, height }) {
  await page.selectOption('#sex', sex).catch(() => {});
  for (const [id, v] of [['age', age], ['ageMonths', months], ['height', height], ['weight', weight]]) await page.locator(`#${id}`).fill(String(v));
  await page.waitForTimeout(1500);
}

const karty = (page) => page.evaluate(() => {
  window.update();
  const norm = (t) => String(t || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
  const br = window.buildDietEnergyRecommendationResult();
  return {
    plan: norm((document.getElementById('planResults') || {}).textContent),
    droga: norm((document.getElementById('bmiJourneyMount') || {}).textContent),
    tekst: norm(br && br.textOutput),
  };
});

test.describe('P-DIETA-AUDYT2 rata 2 — teksty zgodne z tym, co liczy silnik', () => {
  test('R2-3: dz. 8;0, 130 cm, 61,7 kg (limit tempa wiąże) — notka i punkt diety mówią „zapotrzebowanie przy obecnej masie − limit”, nie „masa docelowa − 200–500”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'F', age: 8, weight: 61.7, height: 130 });
    const r = await karty(page);
    expect(r.plan).toContain('dieta liczona od zapotrzebowania przy obecnej masie ciała: ok. 2244 kcal/dzień przy PAL 1,4');
    expect(r.plan).toContain('pomniejszonego tak, by ubytek nie przekraczał 1–2 kg/mies.');
    expect(r.plan).not.toContain('pomniejszonego o 200–500');
    expect(r.plan).toContain('limit tempa ok. 1 kg/mies. (reguła „masa docelowa − 200 kcal”, Mazur 2022, dałaby tu szybszy ubytek)');
    expect(r.plan).not.toContain('odjęto 200 kcal (Mazur 2022)');
    expect(r.droga).toContain('limit tempa ok. 1,0 kg/mies. (reguła „masa docelowa − 200 kcal”, Mazur 2022, dałaby tu szybszy ubytek)');
    // minimum = REE (1603 > 1000), więc dopisek „spoczynkowa przemiana materii” jest prawdziwy
    expect(r.plan).toContain('minimum 1603 kcal/dzień (spoczynkowa przemiana materii)');
  });

  test('R2-2: zalecenia — „zbyt szybkie odchudzanie może spowolnić wzrastanie”, bez „dieta nie spowalnia wzrastania”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'F', age: 8, weight: 61.7, height: 130 });
    const r = await karty(page);
    expect(r.tekst).toContain('Na kontroli mierzony jest także wzrost dziecka — zbyt szybkie odchudzanie może spowolnić wzrastanie, dlatego tempo jest ograniczone i sprawdzane na każdej wizycie.');
    expect(r.tekst).not.toContain('nie spowalnia wzrastania');
  });

  test('R2-7: dz. 17;6, 145 cm, 61 kg — minimum 1200 bez „(spoczynkowa przemiana materii)” (REE 1117 < 1200)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'F', age: 17, months: 6, weight: 61, height: 145 });
    const r = await karty(page);
    expect(r.plan).toContain('minimum 1200 kcal/dzień');
    expect(r.plan).not.toContain('minimum 1200 kcal/dzień (spoczynkowa przemiana materii)');
  });

  test('R2-5: chł. 18;0, 175 cm, 79 kg, stabilizacja — podpis celu „BMI 24,9” w karcie planu i w „Drodze do normy” (dotąd „85. centyl BMI”)', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 18, weight: 79, height: 175 });
    await page.evaluate(() => {
      window.__vildaDietStrategyTouched = true;
      const rt = document.getElementById('reduceToggle'), sb = document.getElementById('stabilizationToggle');
      if (rt) rt.checked = false;
      if (sb) { sb.checked = true; sb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(800);
    const r = await karty(page);
    expect(r.plan).toContain('masa docelowa ok. 76,3 kg (BMI 24,9)');
    expect(r.plan).not.toContain('85. centyl BMI');
    expect(r.droga).toContain('masa docelowa ok. 76,3 kg, BMI 24,9');
    expect(r.droga).not.toContain('85. centyl BMI)');
  });

  test('R2-6: dz. 18;0, 165 cm, 80 kg bez pomiaru tempa — zdanie o wartości populacyjnej zamiast „pozostało nie więcej niż 3 cm”', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'F', age: 18, weight: 80, height: 165 });
    const r = await karty(page);
    expect(r.tekst).toContain('Brak pomiaru tempa wzrastania — wzrastanie przyjęto jako praktycznie zakończone na podstawie wartości populacyjnej; pomiar wzrostu na kontroli zweryfikuje to założenie.');
    expect(r.tekst).not.toContain('pozostało nie więcej niż 3');
  });

  test('R2-1: historia masy z szybkim spadkiem — karta planu pokazuje ostrzeżenie i alarm, plan bez obniżki × 0,85', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'F', age: 8, weight: 59.6, height: 130 });
    const bez = await page.evaluate(() => window.energyBuildPlanReductionState({ ageYears: 8, ageMonthsOpt: 0, sex: 'F', weightKg: 59.6, heightCm: 130, palInput: null }).maintenanceKcal);
    const r = await page.evaluate(() => {
      window.intakeHistory = [{ ageMonths: 96 - 42 / 30.44, weight: 63.7 }, { ageMonths: 96, weight: 59.6 }];
      window.update();
      const st = window.energyBuildPlanReductionState({ ageYears: 8, ageMonthsOpt: 0, sex: 'F', weightKg: 59.6, heightCm: 130, palInput: null, history: window.intakeHistory });
      const norm = (t) => String(t || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
      const alarm = document.querySelector('#planResults [data-alarm-ubytku]');
      return { m: st.maintenanceKcal, tzs: st.tempoZaSzybkie, rbk: st.riskBezKorekty, alarm: alarm ? norm(alarm.textContent) : null };
    });
    expect(r.m).toBe(bez);
    expect(r.rbk).toBe(true);
    expect(r.tzs).toEqual({ kgMies: 2.97, limitKgMies: 2, dni: 42 });
    expect(r.alarm).toBe('⚠ Ubytek masy ok. 3,0 kg/mies. — szybciej niż górna granica planu (2 kg/mies.). Oceń przyczynę zbyt szybkiego ubytku; nie pogłębiaj deficytu.');
  });

  test('R2-4: chł. 13;0, 168 cm, 70 kg (nadwaga) — opis PAL 1,4 bez Ekelunda; 85 kg (otyłość) — z Ekelundem', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    await wpisz(page, { sex: 'M', age: 13, weight: 70, height: 168 });
    const opis = () => page.evaluate(() => String((document.getElementById('palDesc') || {}).textContent || '').replace(/[\u00A0\u202F]/g, ' '));
    const n = await opis();
    expect(n).toContain('brak pomiarów PAL dla samej nadwagi');
    expect(n).not.toContain('Ekelund');
    await page.locator('#weight').fill('85');
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.update());
    await page.waitForTimeout(500);
    expect(await opis()).toContain('typowa przy otyłości (Ekelund 2002)');
  });
});
