import { expect, test } from '@playwright/test';

// P-SPOZYCIE-REE (decyzja właściciela 2026-09-29, opcja A) — PRAWDZIWA strona index.html, dane FIKCYJNE.
// Karta „Szacowane spożycie energii” pokazywała chłopcu 13 l., 76 kg, 168 cm (nadwaga, OLAF) „Utrzymanie masy: ok. 2731 kcal/d
// (PAL 1.4)” (Henry × PAL × 1,01), a plan diety 2507 kcal (Molnár × PAL). Po zmianie obie karty mówią tą samą liczbą.
test.use({ serviceWorkers: 'block' });

async function pacjent(page, { sex, age, months, weight, height }) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.buildDietEnergyRecommendationResult === 'function');
  await page.waitForTimeout(800);
  await page.evaluate(() => document.documentElement.classList.remove('vilda-auth-locked'));
  await page.selectOption('#sex', sex).catch(() => {});
  for (const [id, v] of [['age', age], ['ageMonths', months], ['weight', weight], ['height', height]]) await page.locator(`#${id}`).fill(String(v));
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    window.update();
    const norm = (s) => String(s || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ');
    const m = norm(document.body.innerText).match(/Utrzymanie masy: ok\. (\d+) kcal\/d \(PAL ([\d.,]+)([^)]*)\)/);
    const br = window.buildDietEnergyRecommendationResult();
    return {
      karta: m ? { kcal: Number(m[1]), pal: m[2], dopisek: m[3].trim() } : null,
      planUtrzymanie: br.dane.energia.utrzymanieKcal,
      planPal: br.dane.energia.palUzyty,
      podaz: br.dane.energia.podazZaokrKcal,
    };
  });
}

test('SP-1: chłopiec 13 l., 76 kg, 168 cm — karta spożycia 2507 kcal (REE wg Molnára), tyle samo co plan; dotąd 2731', async ({ page }) => {
  test.setTimeout(120_000);
  const r = await pacjent(page, { sex: 'M', age: 13, months: 0, weight: 76, height: 168 });
  expect(r.karta).toEqual({ kcal: 2507, pal: '1.4', dopisek: '; REE wg Molnára 1995' });
  expect(r.planPal).toBe(1.4);
  expect(r.planUtrzymanie).toBe(2507);
  expect(r.podaz).toBe(2500);
});

test('SP-2: 13-latek z masą prawidłową (52 kg) — bez zmian: Henry z dodatkiem na wzrastanie, bez równania Molnára', async ({ page }) => {
  test.setTimeout(120_000);
  await pacjent(page, { sex: 'M', age: 13, months: 0, weight: 52, height: 168 });
  // karta spożycia przy masie prawidłowej jest zwinięta — ta sama funkcja produkcyjna, którą karta liczy „Utrzymanie masy”
  const k = await page.evaluate(() => {
    const st = window.energyBuildIntakeObservedState({ ageYears: 13, ageMonthsOpt: 0, sex: 'M', weightKg: 52, heightCm: 168, palInput: 1.6, applyRiskAdjust: false });
    return { ree: st.reeKcal, tee: st.teeBaselineKcal, fac: st.reeFactor, rownanie: st.reeRownanie, nadwaga: st.bmiClass && st.bmiClass.overweight };
  });
  const henry = 15.6 * 52 + 266 * 1.68 + 299;
  expect(k.nadwaga).toBe(false);
  expect(k.rownanie).toBeNull();
  expect(k.fac).toBe(1);
  expect(Math.round(k.ree)).toBe(Math.round(henry));
  expect(k.tee).toBeGreaterThan(henry * 1.6); // dodatek na wzrastanie zostaje
});

test('SP-3: PAL karty spożycia idzie za planem, dopóki lekarz go nie zmieni; wybór lekarza zostaje po zmianie masy', async ({ page }) => {
  test.setTimeout(120_000);
  const r = await pacjent(page, { sex: 'M', age: 13, months: 0, weight: 76, height: 168 });
  expect(r.karta.pal).toBe('1.4');
  // lekarz wybiera w karcie spożycia PAL 1,8 (select bywa w zwiniętej karcie — zmiana wartości i zdarzenie change)
  await page.evaluate(() => { const el = document.getElementById('intakePal'); el.value = '1.8'; el.dispatchEvent(new Event('change', { bubbles: true })); window.update(); });
  await page.waitForTimeout(1200);
  await page.locator('#weight').fill('78');
  await page.waitForTimeout(1500);
  const po = await page.evaluate(() => {
    window.update();
    const norm = (s) => String(s || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ');
    const m = norm(document.body.innerText).match(/Utrzymanie masy: ok\. (\d+) kcal\/d \(PAL ([\d.,]+)/);
    return { pal: m && m[2], kcal: m && Number(m[1]), planPal: window.buildDietEnergyRecommendationResult().dane.energia.palUzyty };
  });
  expect(po.pal).toBe('1.8');
  expect(po.planPal).toBe(1.4);
  expect(po.kcal).toBe(Math.round((50.9 * 78 + 25.3 * 168 - 50.3 * 13 + 26.9) / 4.184 * 1.8));
});
