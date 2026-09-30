import { expect, test } from '@playwright/test';

// P-DIETA-B5 (decyzje właściciela 2026-09-30) — PRAWDZIWA strona, dane FIKCYJNE. Pacjent z zespołem Downa w wieku
// 19,0–19,99: o nadmiarze masy decyduje silnik BMI z populacją pacjenta (siatka DS do 20 lat), tak jak w 18,99 —
// plan, karta „Strategia”, zalecenia, „Droga do normy BMI” i plan PDF mówią to samo. Populacja ogólna bez zmian.
// Liczby silnika sprawdza tests/unit/dieta-b5-przejscie-19.test.mjs.
test.use({ serviceWorkers: 'block' });

async function otworz(page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() })); } catch (_) { /* brak storage */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function'
    && !!window.VildaRaportPlan && !!window.VildaBmi && !!window.VildaDsSource && typeof window.energyNadmiarSciezkiDoroslej === 'function');
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
  await page.evaluate(() => { document.documentElement.classList.remove('vilda-auth-locked'); });
}

function policz(page, s) {
  return page.evaluate(async (s) => {
    const norm = (v) => String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    if (s.ds) window.VildaDsSource.zapamietaj({ clinical: { downSyndrome: true } }); else window.VildaDsSource.zapomnij();
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true; window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false; window.__vildaDietGoalChoice = null;
    window.intakeHistory = null;
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h); set('customGoalKg', '');
    window.ensureDietRecommendationsElements();
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', false); flag('journeyFlag', true);
    window.update();
    await new Promise((res) => { setTimeout(res, 200); });
    const r = window.VildaDietRecommendations.buildEnergyRecommendationResult();
    const d = r.dane || {};
    const cc = document.querySelector('.diet-energy-control-card');
    const ctx = { patient: { name: 'Pacjent Testowy', ageLabel: '19 lat', sexLabel: s.sex === 'F' ? 'żeńska' : 'męska', weightLabel: '', heightLabel: '' }, baseResult: r };
    const html = window.VildaRaportPlan.html(ctx);
    return {
      text: norm(r.textOutput), klas: d.klasyfikacja || {}, strategia: d.strategia, masa: d.masa || {},
      karta: !!cc && cc.style.display !== 'none',
      droga: norm((document.getElementById('bmiJourneyMount') || {}).textContent),
      plan: norm((document.getElementById('planResults') || {}).textContent),
      raport: norm(String(html).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')),
    };
  }, s);
}

test.describe('P-DIETA-B5 — zespół Downa 19,0–19,99: ocena BMI z siatki DS także na ścieżce dorosłej planu', () => {
  test('dz. z DS 19;3, 150 cm / 68 kg (BMI 30,2, ok. 50. centyla DS): bez planu redukcji, karta „Strategia” ukryta, zdanie o siatce DS', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await policz(page, { ds: true, sex: 'F', age: 19, months: 3, w: 68, h: 150 });
    expect(r.text).toContain('BMI wynosi 30,2 i według siatki dla zespołu Downa (stosowanej do 20. roku życia) mieści się w zakresie prawidłowym.');
    expect(r.text).toContain('brak wskazań do deficytu energetycznego');
    expect(r.text).not.toContain('otyłość I stopnia');
    expect(r.text).not.toContain('BMI 24,9');
    expect(r.strategia).toBe('utrzymanie');
    expect(r.klas.celDorosly).toBe(false);
    expect(r.klas.klasaBmi && r.klas.klasaBmi.source).toBe('DS');
    expect(r.karta).toBe(false);
  });

  test('dz. z DS 19;3, 150 cm / 88 kg (nadwaga wg siatki DS): cel 85. centyl DS w zaleceniach, „Drodze do normy” i planie PDF — bez drabinki dorosłego', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await policz(page, { ds: true, sex: 'F', age: 19, months: 3, w: 88, h: 150 });
    expect(r.text).toContain('BMI wynosi 39,1 (nadwaga wg siatki dla zespołu Downa). Do 20. roku życia BMI ocenia się według siatki dla zespołu Downa; do zejścia poniżej jej 85. centyla potrzebna byłaby redukcja masy ciała o ok. 1,8 kg – odpowiada to masie ok. 86,2 kg.');
    expect(r.text).not.toMatch(/BMI 24,9|koniec otyłości|otyłość III/);
    expect(r.strategia).toBe('reduction');
    expect(r.masa.docelowaKg).toBeCloseTo(86.16, 1);
    expect(r.masa.pierwszyCel).toBeNull();
    expect(r.karta).toBe(true);
    expect(r.droga).toContain('do górnej granicy normy BMI (85. centyl dla wieku)');
    expect(r.droga).not.toContain('BMI (24,9)');
    expect(r.plan).toContain('50. centyl BMI');
    expect(r.plan).not.toContain('BMI 22');
    expect(r.raport).toContain('nadwaga wg siatki dla zespołu Downa 87,1. centyl');
    expect(r.raport).toContain('Cel końcowy: 86,2 kg (85. centyl).');
    expect(r.raport).not.toMatch(/Cel końcowy: [\d,]+ kg \(BMI 24,9\)/);
  });

  test('ta sama dz. 150 cm / 68 kg bez DS (populacja ogólna), 19;3: jak dotąd — otyłość I st., drabinka dorosłego, karta „Strategia” widoczna', async ({ page }) => {
    test.setTimeout(120_000);
    await otworz(page);
    const r = await policz(page, { ds: false, sex: 'F', age: 19, months: 3, w: 68, h: 150 });
    expect(r.text).toContain('BMI wynosi 30,2 (otyłość I stopnia). Pierwszy cel to ok. 67,5 kg (BMI 30)');
    expect(r.text).toContain('Górna granica normy (BMI 24,9) odpowiada masie ok. 56,0 kg');
    expect(r.klas.celDorosly).toBe(true);
    expect(r.karta).toBe(true);
    expect(r.droga).toContain('do górnej granicy normy BMI (24,9)');
    expect(r.plan).toContain('BMI 22');
  });
});
