import { expect, test } from '@playwright/test';

// P-DIETA-CEL-WLASNY rata C′ (2026-09-21) — „cel własny” nastolatka po zakończeniu wzrastania.
//
// Decyzje właściciela: wiek ≥ 16 lat; BMI od 75. do 85. centyla dla wieku i płci (silnik VildaBmi);
// zaznaczone „Wzrost zakończony” OBOWIĄZKOWE (prognoza „praktycznie zakończone” tylko podpowiada —
// wariant A); cel ≥ masa dla 50. centyla BMI i ≤ masa − 0,5 kg; tempo ≤ 1 kg/miesiąc (deficyt z tempa,
// podłoga jak w drabince dziecięcej: max(1200 kcal, REE)); blokada przy cechach ryzyka zaburzeń
// odżywiania; 18-latek idzie tą samą ścieżką, ale bez „rodziców” w zdaniach. Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function' && !!window.VildaRaportPlan && !!window.VildaBmi);
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

const norm = (v) => String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
const zl = (w, rola) => norm((w.zdania[rola] || []).join(' '));
const tekstZHtml = (h) => norm(String(h).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));

/** Masa z centyla BMI silnika (s.centyl) i cel z centyla (s.celCentyl) — test nie zgaduje kilogramów. */
function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const pro = s.pro !== false;
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && tgl.checked !== pro) { tgl.checked = pro; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = pro; window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false; window.__vildaDietGoalChoice = null;
    window.intakeHistory = s.historia || null;
    window.advancedGrowthData = s.prognozaCm != null ? { finalHeightPrediction: { cm: s.h + s.prognozaCm } } : null;
    const wm = (s.age + (s.months || 0) / 12) * 12;
    const bmiDla = (c) => { const q = window.VildaBmi.wartoscDlaCentyla({ centyl: c, plec: s.sex, wiekMies: wm, zrodlo: 'OLAF' }); return q.bmi; };
    const h2 = (s.h / 100) ** 2;
    const w = s.w != null ? s.w : Math.round(bmiDla(s.centyl) * h2 * 10) / 10;
    const cel = s.cel != null ? s.cel : s.celCentyl != null ? Math.round(bmiDla(s.celCentyl) * h2 * 10) / 10 : null;
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', w); set('height', s.h);
    if (s.pal) { set('palFactor', s.pal); window.__vildaPlanPalTouched = true; }
    set('customGoalKg', cel == null ? '' : cel);
    window.ensureDietRecommendationsElements();
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', s.flaga !== false);
    flag('nutritionNormsFlag', true); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true);
    flag('patientFacingToggle', !!s.pf);
    window.update();
    await new Promise((res) => { setTimeout(res, 160); });
    const r = window.VildaDietRecommendations.generateRecommendations();
    const d = r.dane || {};
    const st = window.energyBuildPlanReductionState({ ageYears: s.age, ageMonthsOpt: s.months || 0, sex: s.sex, weightKg: w, heightCm: s.h,
      palInput: s.pal ? Number(s.pal) : null, history: s.historia || null });
    const vis = (id) => { const el = document.getElementById(id); return !!el && el.style.display !== 'none' && el.offsetParent !== null; };
    const goalCard = document.querySelector('[data-diet-goal-card]');
    const mount = document.getElementById('bmiJourneyMount');
    return {
      w, cel, p50: bmiDla(50) * h2, p75: bmiDla(75), p85: bmiDla(85),
      text: r.textOutput || '', zdania: d.zdania || {}, punkty: d.punkty || {}, strategia: d.strategia, energia: d.energia || {}, masa: d.masa || {},
      czas: d.czasDoNormy || null,
      cg: st.customGoal, diety: (st.diets || []).map((x) => ({ key: x.key, deficit: x.deficit, intake: x.intake, weeklyLoss: x.weeklyLoss, monthlyLossKg: x.monthlyLossKg, floorKcal: x.floorKcal })),
      tee: st.teeBaselineKcal, ree: st.reeKcal, bezRedukcji: !!st.reductionNotIndicated, niedostepne: st.dietUnavailable || {},
      wrap: vis('customGoalWrap'), hint: norm((document.getElementById('customGoalHint') || {}).textContent || ''),
      poleDisabled: !!(document.getElementById('customGoalKg') || {}).disabled,
      journey: mount ? norm(mount.textContent) : null, dietLevel: Array.from((document.getElementById('dietLevel') || { options: [] }).options).map((o) => o.value),
      kartaCel: !!goalCard && goalCard.style.display !== 'none',
      celPressed: (() => { const b = document.querySelector('[data-diet-goal-choice="custom"]'); return !!b && b.getAttribute('aria-pressed') === 'true'; })()
    };
    function norm(v) { return String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim(); }
  }, s);
}

test('silnik: pasmo P75–P85, flaga obowiązkowa, cel ≥ P50, tempo 1 kg/mies. z podłogą, blokada ryzyka', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  // dziewczyna 17 lat, 165 cm, masa z P80, cel z P60 → aktywny
  const ok = await policz(page, { age: 17, sex: 'F', h: 165, centyl: 80, celCentyl: 60 });
  expect(ok.cg.teen).toBe(true); expect(ok.cg.available).toBe(true); expect(ok.cg.active).toBe(true); expect(ok.cg.reason).toBeNull();
  expect(ok.cg.growthEnded).toBe(true);
  expect(ok.cg.minTargetKg).toBeCloseTo(Math.round(ok.p50 * 10) / 10, 5);
  expect(ok.cg.targetKg).toBe(ok.cel); expect(ok.cg.kgToTarget).toBeCloseTo(ok.w - ok.cel, 5);
  expect(ok.cg.targetCentyl).toBeGreaterThan(50); expect(ok.cg.targetCentyl).toBeLessThan(70);
  expect(ok.bezRedukcji).toBe(false);
  expect(ok.diety.map((d) => d.key)).toEqual(['light']);
  const l = ok.diety[0];
  expect(l.deficit).toBe(Math.round(7700 / 30.4375));            // 1 kg/mies. z tempa
  expect(l.monthlyLossKg).toBe(1);
  expect(l.intake).toBe(Math.round(ok.tee - l.deficit));
  expect(l.intake).toBeGreaterThanOrEqual(l.floorKcal);
  expect(l.floorKcal).toBe(Math.max(1200, Math.round(ok.ree)));
  expect(Object.keys(ok.niedostepne).sort()).toEqual(['intense', 'moderate']);
  expect(ok.niedostepne.moderate).toContain('tylko tempo do 1');

  // flaga niezaznaczona → zablokowane (chłopiec 16 lat: mediana daje jeszcze wzrastanie, więc bez prognozy
  // „praktycznie zakończone” nie pada); z prognozą „zostały 2 cm” podpowiedź mówi o prognozie
  const bezFlagi = await policz(page, { age: 16, sex: 'M', h: 176, centyl: 80, celCentyl: 60, flaga: false });
  expect(bezFlagi.cg.available).toBe(false); expect(bezFlagi.cg.reason).toBe('wzrastanie'); expect(bezFlagi.cg.practicallyEnded).toBe(false);
  expect(bezFlagi.diety).toEqual([]); expect(bezFlagi.strategia).toBe('utrzymanie');
  expect(bezFlagi.hint).toMatch(/dostępny po potwierdzeniu zakończonego wzrastania – zaznacz „Wzrost zakończony”/u);
  const prognoza = await policz(page, { age: 16, sex: 'M', h: 176, centyl: 80, celCentyl: 60, flaga: false, prognozaCm: 2 });
  expect(prognoza.cg.reason).toBe('wzrastanie'); expect(prognoza.cg.practicallyEnded).toBe(true); expect(prognoza.cg.active).toBe(false);
  expect(prognoza.hint).toMatch(/^Według prognozy wzrastanie jest praktycznie zakończone/u);

  // pasmo: P70 → poniżej; P90 → nadmiar (zwykła ścieżka redukcji); 15 lat → brak celu; cel z P40 → za niski
  const nizej = await policz(page, { age: 17, sex: 'F', h: 165, centyl: 70, celCentyl: 55 });
  expect(nizej.cg.reason).toBe('bmi-ponizej'); expect(nizej.cg.available).toBe(false); expect(nizej.strategia).toBe('utrzymanie');
  expect(nizej.hint).toBe('Cel własny dotyczy BMI od 75. do 85. centyla; poniżej 75. centyla celem jest utrzymanie masy ciała.');
  const naProgu = await policz(page, { age: 17, sex: 'F', h: 165, centyl: 76, celCentyl: 55 });
  expect(naProgu.cg.available).toBe(true); expect(naProgu.cg.active).toBe(true);
  const nadmiar = await policz(page, { age: 17, sex: 'F', h: 165, centyl: 90, celCentyl: 60 });
  expect(nadmiar.cg.reason).toBe('nadmiar'); expect(nadmiar.strategia).toBe('reduction'); expect(nadmiar.diety.length).toBeGreaterThan(1);
  const za_mlody = await policz(page, { age: 15, sex: 'F', h: 165, centyl: 80, celCentyl: 60 });
  expect(za_mlody.cg).toBeNull(); expect(za_mlody.strategia).toBe('utrzymanie'); expect(za_mlody.wrap).toBe(false);
  const zaNiski = await policz(page, { age: 17, sex: 'F', h: 165, centyl: 80, celCentyl: 40 });
  expect(zaNiski.cg.available).toBe(true); expect(zaNiski.cg.targetError).toBe('za-niski'); expect(zaNiski.cg.active).toBe(false);
  expect(zaNiski.hint).toMatch(/nie może być niższy niż .* \(50\. centyl BMI\)/u);

  // ryzyko z historii masy
  const now = Date.now();
  const ryzyko = await policz(page, { age: 17, sex: 'F', h: 165, centyl: 80, celCentyl: 60, historia: [{ t: now - 28 * 864e5, weight: ok.w + 4 }, { t: now, weight: ok.w }] });
  expect(ryzyko.cg.reason).toBe('ryzyko'); expect(ryzyko.cg.available).toBe(false); expect(ryzyko.poleDisabled).toBe(true);
  expect(ryzyko.hint).toMatch(/masa poniżej 85 % należnej lub szybka utrata masy ciała/u);

  // 18-latek: ta sama ścieżka (gałąź dziecięca do 19 lat), bez rodziców
  const osiemnascie = await policz(page, { age: 18, sex: 'M', h: 178, centyl: 80, celCentyl: 60 });
  expect(osiemnascie.cg.teen).toBe(true); expect(osiemnascie.cg.active).toBe(true); expect(osiemnascie.strategia).toBe('cel-wlasny');
  expect(norm(osiemnascie.text)).not.toMatch(/rodzic/u);
  expect(norm(osiemnascie.text)).toContain('cel uzgodniony z pacjentem.');
});

test('generator: zdania Z1–Z6 nastolatka w obu rejestrach, liczby z silnika, talerz raty B bez zmian', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  for (const s of [
    { age: 17, sex: 'F', h: 165, centyl: 80, celCentyl: 60 },
    { age: 17, sex: 'F', h: 165, centyl: 80, celCentyl: 60, pf: true },
    { age: 16, sex: 'M', h: 176, centyl: 78, celCentyl: 55, pal: '1.6' }
  ]) {
    const w = await policz(page, s);
    const t = norm(w.text);
    expect(w.strategia, JSON.stringify(s)).toBe('cel-wlasny');
    expect(w.masa.docelowaKg).toBe(w.cel); expect(w.masa.doRedukcjiKg).toBeCloseTo(w.w - w.cel, 5);
    expect(w.energia.dietaKlucz).toBe('light'); expect(w.energia.deficytKcal).toBe(Math.round(7700 / 30.4375));
    const kg = (w.w - w.cel).toFixed(1).replace('.', ',');
    // Z1
    expect(t).toMatch(s.pf ? /^1\. Twój wzrost jest już zakończony, a BMI/u : /^1\. Wzrastanie zostało zakończone\. BMI/u);
    expect(t).toContain(`${w.cel.toFixed(1).replace('.', ',')} kg (BMI`);
    expect(t).toContain(`${kg} kg`);
    expect(t).toMatch(s.pf ? /ustalony z rodzicami i lekarzem, a nie zalecenie lekarskie/u : /cel uzgodniony z pacjent(ką|em) i rodzicami/u);
    // Z2 — tempo 1 kg/mies., deficyt i kaloryczność z diety
    expect(t).toMatch(/1 kg miesięcznie/u);
    expect(t).toContain(`${w.energia.deficytKcal} kcal dziennie`);
    expect(t).toContain(`${w.energia.podazZaokrKcal} kcal dziennie`);
    expect(t).not.toContain('kg na tydzień'); expect(t).not.toMatch(/spoczynkow/u);
    if (s.pf) expect(t).toContain('czyli jedzenie ok.');
    // normy liczone dla planu, nie dla utrzymania
    expect(t).toMatch(s.pf ? /Przy kaloryczności planu około/u : /Normy żywieniowe dla planu około/u);
    // Z3
    expect(w.czas.tygodnie).toBe(Math.max(1, Math.ceil((w.w - w.cel) / w.energia.tempoKgTydz)));
    expect(t).toMatch(/orientacyjnie około/u);
    // Z4 talerz nastolatka + płatki (rata B) — bez alkoholu
    expect(zl(w, 'talerz')).toMatch(/crunchy/u); expect(zl(w, 'talerz')).not.toMatch(/alkohol/iu);
    // Z5 ruch: 60 minut + wzmacnianie mięśni 3 dni
    expect(w.zdania.ruch).toHaveLength(2);
    expect(zl(w, 'ruch')).toContain('60 minut'); expect(zl(w, 'ruch')).toMatch(/co najmniej 3 (dni|razy) w tygodniu ćwiczenia wzmacniające mięśnie|ćwiczenia wzmacniające mięśnie co najmniej 3 dni/u);
    expect(zl(w, 'ruch')).toMatch(s.pf ? /^.*Kiedy jesteś na diecie redukcyjnej/u : /Podczas stosowania diety redukcyjnej/u);
    // Z6 kontrola
    expect(w.zdania.kontrola).toHaveLength(1);
    expect(zl(w, 'kontrola')).toContain('50. centyl'); expect(zl(w, 'kontrola')).toContain('4–6 tygodni');
    expect(zl(w, 'kontrola')).toMatch(s.pf ? /powiedz o tym rodzicom lub lekarzowi/u : /zaburzeń odżywiania/u);
    expect(w.punkty.kontrola.join(' ')).toContain('50. centyl'); expect(w.punkty.ruch.join(' ')).toMatch(/wzmacniające/u);
    for (const rola of Object.keys(w.zdania)) for (const zd of w.zdania[rola]) expect(t).toContain(norm(zd));
  }
});

test('Droga do normy, karta „Cel” i raport: panel do celu własnego nastolatka, tylko dieta lekka', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const z = await policz(page, { age: 17, sex: 'F', h: 165, centyl: 80, celCentyl: 60 });
  expect(z.wrap).toBe(true); expect(z.hint).toMatch(/^Cel własny: .* – redukcja ok\. .* kg; tempo do 1 kg miesięcznie\.$/u);
  expect(z.journey).not.toBeNull();
  expect(z.journey).toContain('Cel własny: −'); expect(z.journey).toContain('do celu własnego (BMI');
  expect(z.journey).toContain('cel własny (dieta lekka)'); expect(z.journey).not.toMatch(/granicy normy BMI|85\. centyl/u);
  expect(z.dietLevel).toEqual(['light']); expect(z.kartaCel).toBe(true); expect(z.celPressed).toBe(true);

  const bez = await policz(page, { age: 17, sex: 'F', h: 165, centyl: 80 });
  expect(bez.wrap).toBe(true); expect(bez.journey).toBeNull(); expect(bez.strategia).toBe('utrzymanie');
  expect(bez.hint).toMatch(/^Opcjonalnie: masa docelowa od .* kg \(50\. centyl BMI\) do .* kg\./u);
  expect(norm(bez.text)).toContain('Masa ciała mieści się w granicach normy dla wieku.');

  const pacjent = await policz(page, { age: 17, sex: 'F', h: 165, centyl: 80, celCentyl: 60, pro: false });
  expect(pacjent.wrap).toBe(false);

  const raport = await page.evaluate(() => {
    const baseResult = window.VildaDietRecommendations.buildEnergyRecommendationResult();
    const ctx = { patient: { name: 'Anna Testowa', ageLabel: '17 lat', sexLabel: 'żeńska', weightLabel: '63,0 kg', heightLabel: '165,0 cm' }, baseResult };
    return { html: window.VildaRaportPlan.html(ctx), strategia: baseResult.dane && baseResult.dane.strategia };
  });
  // ostatnie policz() było w trybie pacjenta bez pro; przelicz w pro raz jeszcze dla raportu
  await policz(page, { age: 17, sex: 'F', h: 165, centyl: 80, celCentyl: 60 });
  const raport2 = await page.evaluate(() => {
    const baseResult = window.VildaDietRecommendations.buildEnergyRecommendationResult();
    const ctx = { patient: { name: 'Anna Testowa', ageLabel: '17 lat', sexLabel: 'żeńska', weightLabel: '63,0 kg', heightLabel: '165,0 cm' }, baseResult };
    return { html: window.VildaRaportPlan.html(ctx), strategia: baseResult.dane && baseResult.dane.strategia };
  });
  expect(raport2.strategia).toBe('cel-wlasny');
  expect(tekstZHtml(raport2.html)).toContain('KALORYCZNOŚĆ DIETY I TEMPO REDUKCJI DO CELU WŁASNEGO');
  expect(raport.strategia === 'utrzymanie' || raport.strategia === 'cel-wlasny').toBe(true);
});
