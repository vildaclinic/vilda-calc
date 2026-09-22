import { expect, test } from '@playwright/test';

// P-DIETA-KARTA rata I (2026-09-22) — karta „Zalecenia dietetyczne” nie zwija się sama.
//
// Do raty I bramka widoczności (updateDietRecommendationsVisibility, wołana z każdego update())
// zaczynała od ukrycia treści karty i nigdy tego nie cofała, więc zmiana masy, wzrostu czy wpis
// celu własnego zwijały kartę, a odświeżenie wyniku wracało od razu („treść ukryta”). Druga usterka:
// zmiana flagi „Wzrost zakończony” odświeżała tylko wynik, a stan przycisków karty „Cel” nastolatka
// ustawia bramka — przyciski odblokowywały się dopiero przy następnej zmianie formularza.
// Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function');
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
}

/** Pacjent w trybie profesjonalnym; bez generowania. */
function ustaw(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const pro = s.pro !== false;
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && tgl.checked !== pro) { tgl.checked = pro; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = pro; window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false; window.__vildaDietGoalChoice = null;
    window.intakeHistory = null;
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h);
    set('customGoalKg', s.cel == null ? '' : s.cel);
    window.ensureDietRecommendationsElements();
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', !!s.ge);
    flag('nutritionNormsFlag', true); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true);
    window.update();
    await new Promise((res) => { setTimeout(res, 160); });
  }, s);
}

const stan = (page) => page.evaluate(() => {
  const vis = (el) => !!el && el.style.display !== 'none';
  const btn = document.getElementById('dietRecommendationsBtn');
  const tresc = document.getElementById('dietRecommendationsContent');
  const wynik = document.getElementById('dietEnergyResult');
  const gc = document.querySelector('[data-diet-goal-card]');
  const b = (k) => document.querySelector('[data-diet-goal-choice="' + k + '"]');
  const hint = gc ? gc.querySelector('[data-diet-goal-hint]') : null;
  return {
    przycisk: vis(btn), otwarta: vis(tresc), wynik: (wynik && wynik.textContent || '').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim(),
    kartaCel: vis(gc), celDisabled: !!(b('custom') && b('custom').disabled), utrzymanieDisabled: !!(b('maintain') && b('maintain').disabled),
    celPressed: !!(b('custom') && b('custom').getAttribute('aria-pressed') === 'true'),
    hint: (hint && hint.textContent || '').replace(/\s+/g, ' ').trim()
  };
});

async function rozwinIGeneruj(page) {
  await page.evaluate(() => {
    const t = document.getElementById('dietRecommendationsContent');
    if (t.style.display === 'none') document.getElementById('dietRecommendationsBtn').click();
    document.getElementById('generateEnergyDietBtn').click();
  });
  await page.waitForFunction(() => (document.getElementById('dietEnergyResult') || {}).textContent.trim().length > 0);
}

test('zmiana masy, wzrostu i PAL nie zwija rozwiniętej karty; wynik jest odświeżany', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await ustaw(page, { age: 42, sex: 'M', w: 108, h: 178 });
  let s = await stan(page);
  expect(s.przycisk).toBe(true); expect(s.otwarta).toBe(false);
  await rozwinIGeneruj(page);
  s = await stan(page);
  expect(s.otwarta).toBe(true); expect(s.wynik).toContain('BMI wynosi 34,1');

  for (const [id, v] of [['weight', '104'], ['height', '179'], ['palFactor', '1.6']]) {
    await page.evaluate(([id, v]) => { const el = document.getElementById(id); el.value = v; window.update(); }, [id, v]);
    await page.waitForTimeout(200);
    s = await stan(page);
    expect(s.przycisk, id).toBe(true);
    expect(s.otwarta, 'karta zwinięta po zmianie ' + id).toBe(true);
    expect(s.wynik.length, 'wynik zniknął po zmianie ' + id).toBeGreaterThan(0);
  }
  // 104 kg / 179 cm → wynik przeliczony (BMI 32,5), nie stary (34,1)
  expect(s.wynik).toContain('BMI wynosi 32,5');
  expect(s.wynik).not.toContain('BMI wynosi 34,1');

  // bramka nadal zamyka moduł, gdy przestaje być dostępny (tryb pacjenta), i nie otwiera go sama po powrocie
  await ustaw(page, { age: 42, sex: 'M', w: 104, h: 179, pro: false });
  s = await stan(page);
  expect(s.przycisk).toBe(false); expect(s.otwarta).toBe(false);
  await ustaw(page, { age: 42, sex: 'M', w: 104, h: 179, pro: true });
  s = await stan(page);
  expect(s.przycisk).toBe(true); expect(s.otwarta).toBe(false);
});

test('dorosły z celem własnym: wpis masy docelowej w karcie „Cel” nie zwija karty, wynik dostaje cel', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await ustaw(page, { age: 35, sex: 'F', w: 66, h: 164 });
  await rozwinIGeneruj(page);
  let s = await stan(page);
  expect(s.kartaCel).toBe(true); expect(s.celDisabled).toBe(false); expect(s.celPressed).toBe(false);
  await page.evaluate(() => document.querySelector('[data-diet-goal-choice="custom"]').click());
  await page.evaluate(() => { const px = document.getElementById('customGoalKgProxy'); px.value = '62'; px.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => document.getElementById('customGoalKg').value === '62');
  await page.waitForTimeout(250);
  s = await stan(page);
  expect(s.otwarta, 'karta zwinęła się po wpisie celu').toBe(true);
  expect(s.celPressed).toBe(true);
  expect(s.wynik).toContain('Przyjęty cel własny to ok. 62,0 kg');
  // zmiana masy przy aktywnym celu — karta dalej otwarta
  await page.evaluate(() => { document.getElementById('weight').value = '65.5'; window.update(); });
  await page.waitForTimeout(200);
  s = await stan(page);
  expect(s.otwarta).toBe(true); expect(s.celPressed).toBe(true);
});

test('nastolatek 16–18 lat: zaznaczenie „Wzrost zakończony” od razu odblokowuje „Cel własny”, karta zostaje otwarta', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  // BMI w paśmie P75–P85 (83,8. centyl), flaga niezaznaczona → karta „Cel” widoczna, przyciski zablokowane
  await ustaw(page, { age: 17, months: 2, sex: 'M', w: 76, h: 176, ge: false });
  await rozwinIGeneruj(page);
  let s = await stan(page);
  expect(s.kartaCel).toBe(true); expect(s.celDisabled).toBe(true); expect(s.utrzymanieDisabled).toBe(true);
  expect(s.hint).toMatch(/Wzrost zakończony/u);

  // sama zmiana flagi (bez innych zmian formularza) odblokowuje przyciski i nie zwija karty
  await page.evaluate(() => { const f = document.getElementById('growthEndedFlag'); f.checked = true; f.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => { const b = document.querySelector('[data-diet-goal-choice="custom"]'); return !!b && !b.disabled; });
  s = await stan(page);
  expect(s.otwarta).toBe(true); expect(s.celDisabled).toBe(false); expect(s.utrzymanieDisabled).toBe(false);
  expect(s.hint).not.toMatch(/Wzrost zakończony/u);

  // wybór celu i wpis masy: strategia „cel-wlasny” w danych generatora, karta nadal otwarta
  await page.evaluate(() => document.querySelector('[data-diet-goal-choice="custom"]').click());
  await page.evaluate(() => { const px = document.getElementById('customGoalKgProxy'); px.value = '68'; px.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => document.getElementById('customGoalKg').value === '68');
  await page.waitForTimeout(250);
  s = await stan(page);
  expect(s.otwarta).toBe(true); expect(s.celPressed).toBe(true);
  const d = await page.evaluate(() => { const r = window.VildaDietRecommendations.generateRecommendations(); return { strategia: r.dane.strategia, docelowaKg: r.dane.masa.docelowaKg, docelowaBmi: r.dane.masa.docelowaBmi }; });
  expect(d.strategia).toBe('cel-wlasny'); expect(d.docelowaKg).toBe(68); expect(d.docelowaBmi).toBeCloseTo(68 / Math.pow(1.76, 2), 6);

  // odznaczenie flagi natychmiast blokuje przyciski z powrotem
  await page.evaluate(() => { const f = document.getElementById('growthEndedFlag'); f.checked = false; f.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => { const b = document.querySelector('[data-diet-goal-choice="custom"]'); return !!b && b.disabled; });
  s = await stan(page);
  expect(s.otwarta).toBe(true); expect(s.hint).toMatch(/Wzrost zakończony/u);
});
