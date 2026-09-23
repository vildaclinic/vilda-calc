import { expect, test } from '@playwright/test';

// P-DIETA-CEL-WLASNY (rata C, 2026-09-21) — „cel własny” u dorosłego z BMI 23,0–24,9.
//
// Po co: pacjent w normie, ale przy jej górnej granicy, chce schudnąć np. 4 kg. Żadne wytyczne nie
// zalecają redukcji przy prawidłowym BMI, więc cel jest CELEM WŁASNYM (nie wskazaniem medycznym)
// i ma twarde strażniki, które daje silnik planu (energyCustomGoalAssess / energyBuildPlanReductionState):
//  - dorosły ≥ 19 lat, BMI od 23,0 (decyzja właściciela) do 24,9 (wariant A: etykieta „górna norma” i
//    plakietka „Do obserwacji” zostają od 24,0 — zmienia się tylko dostępność celu);
//  - cel ≥ masa dla BMI 18,5 i ≤ masa aktualna − 0,5 kg;
//  - TYLKO dieta lekka (15 %, maks. 500 kcal/d), podłoga 1600 kcal (M) / 1200 kcal (K) obcina deficyt;
//  - blokada przy cechach ryzyka zaburzeń odżywiania z historii masy (szybka utrata).
// Dwa miejsca wpisu tej samej wartości: pole w „Drodze do normy BMI” (#customGoalKg) i karta „Cel”
// w Zaleceniach energetycznych (#customGoalKgProxy). Zdania generatora zatwierdzone przez właściciela.
// Dane FIKCYJNE.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function' && !!window.VildaRaportPlan);
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportFormatIssueList === 'function');
}

const norm = (v) => String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
const zl = (w, rola) => norm((w.zdania[rola] || []).join(' '));
const tekstZHtml = (h) => norm(String(h).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '));

/** Ustawia pacjenta, cel własny (s.cel) i tryb; zwraca stan silnika, generatora i DOM. */
function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const pro = s.pro !== false;
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && tgl.checked !== pro) { tgl.checked = pro; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = pro; window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false; window.__vildaDietGoalChoice = null;
    window.intakeHistory = s.historia || null;
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', s.w); set('height', s.h);
    if (s.pal) { set('palFactor', s.pal); window.__vildaPlanPalTouched = true; }
    set('customGoalKg', s.cel == null ? '' : s.cel);
    window.ensureDietRecommendationsElements();
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    flag('nutritionNormsFlag', true); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true);
    window.update();
    await new Promise((res) => { setTimeout(res, 160); });
    const r = window.VildaDietRecommendations.generateRecommendations();
    const d = r.dane || {};
    const st = window.energyBuildPlanReductionState({ ageYears: s.age, ageMonthsOpt: s.months || 0, sex: s.sex, weightKg: s.w, heightCm: s.h,
      palInput: s.pal ? Number(s.pal) : null, history: s.historia || null });
    const vis = (id) => { const el = document.getElementById(id); return !!el && el.style.display !== 'none' && el.offsetParent !== null; };
    const goalCard = document.querySelector('[data-diet-goal-card]');
    const pressed = (sel) => { const b = document.querySelector(sel); return !!b && b.getAttribute('aria-pressed') === 'true'; };
    const mount = document.getElementById('bmiJourneyMount');
    return {
      text: r.textOutput || '', zdania: d.zdania || {}, punkty: d.punkty || {}, strategia: d.strategia, energia: d.energia || {}, masa: d.masa || {},
      czas: d.czasDoNormy || null, klucz: d.klasyfikacja && d.klasyfikacja.klucz,
      cg: st.customGoal, diety: (st.diets || []).map((x) => ({ key: x.key, deficit: x.deficit, intake: x.intake, weeklyLoss: x.weeklyLoss, floorHit: !!x.floorHit })),
      tee: st.teeBaselineKcal, bezRedukcji: !!st.reductionNotIndicated, niedostepne: st.dietUnavailable || {},
      wrap: vis('customGoalWrap'), hint: norm((document.getElementById('customGoalHint') || {}).textContent || ''),
      poleDisabled: !!(document.getElementById('customGoalKg') || {}).disabled,
      journey: mount ? norm(mount.textContent) : null, toNorm: norm((document.getElementById('toNormInfo') || {}).textContent || ''),
      planWidoczny: vis('planCard'), dietLevel: Array.from((document.getElementById('dietLevel') || { options: [] }).options).map((o) => o.value),
      kartaCel: !!goalCard && goalCard.style.display !== 'none', celPressed: pressed('[data-diet-goal-choice="custom"]'), maintainPressed: pressed('[data-diet-goal-choice="maintain"]'),
      proxy: (document.getElementById('customGoalKgProxy') || {}).value, proxyWrap: (() => { const w = document.querySelector('[data-diet-goal-input-wrap]'); return !!w && w.style.display !== 'none'; })(),
      kartaHint: norm((document.querySelector('[data-diet-goal-hint]') || {}).textContent || '')
    };
    function norm(v) { return String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim(); }
  }, s);
}

test('silnik planu: strażniki celu własnego i dieta wyłącznie lekka z podłogą kaloryczną', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  // F 35 lat, 164 cm, 66 kg (BMI 24,5), cel 62 kg (BMI 23,1)
  const ok = await policz(page, { age: 35, sex: 'F', h: 164, w: 66, cel: 62 });
  expect(ok.cg.available).toBe(true); expect(ok.cg.active).toBe(true); expect(ok.cg.reason).toBeNull();
  expect(ok.cg.targetKg).toBe(62); expect(ok.cg.kgToTarget).toBeCloseTo(4, 5); expect(ok.cg.targetBmi).toBeCloseTo(62 / 1.64 ** 2, 3);
  expect(ok.cg.minTargetKg).toBeCloseTo(Math.round(18.5 * 1.64 ** 2 * 10) / 10, 5);
  expect(ok.bezRedukcji).toBe(false);
  expect(ok.diety.map((d) => d.key)).toEqual(['light']);
  const l = ok.diety[0];
  expect(l.deficit).toBeLessThanOrEqual(500);
  expect(l.deficit).toBeCloseTo(Math.min(0.15 * ok.tee, 500), 0);
  expect(l.intake).toBe(Math.round(ok.tee - Math.min(0.15 * ok.tee, 500)));
  expect(l.intake).toBeGreaterThanOrEqual(1200);
  expect(l.weeklyLoss).toBeCloseTo(l.deficit * 7 / 7700, 2);
  expect(l.floorHit).toBe(false);
  expect(Object.keys(ok.niedostepne).sort()).toEqual(['intense', 'moderate']);
  expect(ok.niedostepne.moderate).toContain('tylko dieta lekka');

  // cel powyżej masy − 0,5 kg i cel poniżej BMI 18,5: brak aktywacji, plan „bez redukcji”
  const zaWysoki = await policz(page, { age: 35, sex: 'F', h: 164, w: 66, cel: 66 });
  expect(zaWysoki.cg.available).toBe(true); expect(zaWysoki.cg.active).toBe(false); expect(zaWysoki.cg.targetError).toBe('za-wysoki');
  expect(zaWysoki.diety).toEqual([]); expect(zaWysoki.bezRedukcji).toBe(true); expect(zaWysoki.strategia).toBe('utrzymanie');
  const zaNiski = await policz(page, { age: 35, sex: 'F', h: 164, w: 66, cel: 45 });
  expect(zaNiski.cg.targetError).toBe('za-niski'); expect(zaNiski.cg.active).toBe(false);
  const brak = await policz(page, { age: 35, sex: 'F', h: 164, w: 66 });
  expect(brak.cg.available).toBe(true); expect(brak.cg.targetError).toBe('brak'); expect(brak.strategia).toBe('utrzymanie');

  // progi dostępności: BMI 22,9 → nie; 25,2 → nadmiar (zwykła drabinka 3 diet); 18 lat → gałąź dziecięca
  const nizej = await policz(page, { age: 35, sex: 'F', h: 164, w: 61.6, cel: 58 });
  expect(nizej.cg.available).toBe(false); expect(nizej.cg.reason).toBe('bmi-ponizej'); expect(nizej.strategia).toBe('utrzymanie');
  const naProgu = await policz(page, { age: 35, sex: 'F', h: 164, w: 61.9, cel: 58 }); // BMI 23,02
  expect(naProgu.cg.available).toBe(true); expect(naProgu.cg.active).toBe(true);
  const nadmiar = await policz(page, { age: 35, sex: 'F', h: 164, w: 67.8, cel: 62 }); // BMI 25,2
  expect(nadmiar.cg.available).toBe(false); expect(nadmiar.cg.reason).toBe('nadmiar');
  expect(nadmiar.diety.map((d) => d.key)).toEqual(['light', 'moderate', 'intense']); expect(nadmiar.strategia).toBe('reduction');
  // 18 lat → gałąź nastolatka (rata C′): bez zaznaczonego „Wzrost zakończony” cel zablokowany
  const osiemnascie = await policz(page, { age: 18, sex: 'F', h: 164, w: 66, cel: 62 });
  expect(osiemnascie.cg.teen).toBe(true); expect(osiemnascie.cg.reason).toBe('wzrastanie'); expect(osiemnascie.strategia).toBe('utrzymanie');

  // blokada z historii masy: 70 → 66 kg w 4 tygodnie (≈ 1,4 %/tydz.)
  const now = Date.now();
  const ryzyko = await policz(page, { age: 35, sex: 'F', h: 164, w: 66, cel: 62, historia: [{ t: now - 28 * 864e5, weight: 70 }, { t: now, weight: 66 }] });
  expect(ryzyko.cg.available).toBe(false); expect(ryzyko.cg.reason).toBe('ryzyko'); expect(ryzyko.cg.riskAny).toBe(true);
  expect(ryzyko.diety).toEqual([]); expect(ryzyko.strategia).toBe('utrzymanie');

  // podłoga: F 60 lat, 150 cm, 54 kg (BMI 24,0), PAL 1,2 → podaż nie schodzi poniżej 1200 kcal, deficyt obcięty
  const podloga = await policz(page, { age: 60, sex: 'F', h: 150, w: 54, cel: 51, pal: '1.2' });
  expect(podloga.cg.active).toBe(true);
  expect(podloga.tee - Math.min(0.15 * podloga.tee, 500), 'scenariusz ma trafiać w podłogę').toBeLessThan(1200);
  expect(podloga.tee - 1200, 'scenariusz ma zostawić deficyt ≥ 100 kcal').toBeGreaterThanOrEqual(100);
  expect(podloga.diety.map((d) => d.key)).toEqual(['light']);
  expect(podloga.diety[0].intake).toBe(1200);
  expect(podloga.diety[0].deficit).toBe(Math.round(podloga.tee - 1200));
  expect(podloga.diety[0].floorHit).toBe(true);
  expect(norm(podloga.text)).toContain('Podaż energii nie schodzi poniżej 1200 kcal/dzień');
  expect(norm(podloga.text)).toContain(`deficyt ok. ${podloga.diety[0].deficit} kcal/dobę`);
  // zapotrzebowanie zbyt bliskie podłogi: diety nie ma, cel pozostaje „aktywny” tylko formalnie, generator mówi o utrzymaniu
  const zaNisko = await policz(page, { age: 60, sex: 'F', h: 148, w: 51, cel: 48, pal: '1.2' });
  if (zaNisko.tee - 1200 < 100) {
    expect(zaNisko.diety).toEqual([]);
    expect(zaNisko.niedostepne.light).toMatch(/minimum 1200/u);
    expect(zaNisko.cg.active).toBe(false); expect(zaNisko.cg.targetError).toBe('minimum');
    expect(zaNisko.hint).toMatch(/nie może zejść poniżej 1200 kcal/u);
    expect(zaNisko.strategia).toBe('utrzymanie'); expect(zaNisko.journey).toBeNull();
  }

  // symulator czasu przyjmuje liczbowe BMI celu
  const sim = await page.evaluate(() => window.energySimulateMonthsToBmiTarget({ ageYears: 35, ageMonthsOpt: 0, sex: 'F', weightKg: 66, heightCm: 164, weeklyLossKg: 0.3, target: 62 / 1.64 ** 2 }));
  expect(sim.months).toBeCloseTo(Math.ceil(4 / (0.3 * 52 / 12) * 2) / 2, 0);
});

test('generator: zdania celu własnego, liczby z silnika, talerz stanu bez zmian', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  for (const s of [
    { age: 35, sex: 'F', h: 164, w: 66, cel: 62 },              // górna norma (≥ 24): „Priorytetem…”, talerz utrzymania
    { age: 30, sex: 'M', h: 180, w: 76, cel: 72 }               // norma (23,5): talerz raty B + alkohol
  ]) {
    const w = await policz(page, s);
    const t = norm(w.text);
    expect(w.strategia, JSON.stringify(s)).toBe('cel-wlasny');
    expect(w.masa.docelowaKg).toBe(s.cel);
    expect(w.masa.doRedukcjiKg).toBeCloseTo(s.w - s.cel, 5);
    expect(w.energia.dietaKlucz).toBe('light');
    expect(w.energia.deficytKcal).toBeLessThanOrEqual(500);
    expect(w.energia.deficytKcal).toBeLessThanOrEqual(0.15 * w.energia.teeBazowyKcal + 1);
    expect(w.energia.podazZaokrKcal).toBe(Math.round(w.energia.podazKcal / 100) * 100);
    // Z1: cel nazwany celem własnym, z BMI celu i kilogramami z silnika
    const bmiCel = (s.cel / (s.h / 100) ** 2).toFixed(1).replace('.', ',');
    expect(t).toContain(`${s.cel},0 kg (BMI ${bmiCel})`);
    expect(t).toMatch(/nie jest to wskazanie medyczne, lecz cel uzgodniony z pacjentem/u);
    // Z2: energia — 15 %, maks. 500, podaż i tempo z silnika
    expect(t).toMatch(/15%/u); expect(t).toContain('500 kcal');
    // P-DIETA rata Z: cel własny dorosłego — podaż jako górna granica dnia
    expect(t).toContain(`podaż nie więcej niż ${w.energia.podazZaokrKcal} kcal dziennie (górna granica dnia, nie cel do dobicia)`);
    expect(t).toContain(`${w.energia.tempoKgTydz.toFixed(1).replace('.', ',')} kg`);
    expect(t).not.toMatch(/brak wskazań do deficytu|nie ma wskazań do deficytu/u);
    // Z4: czas z tych samych liczb
    expect(w.czas.tygodnie).toBe(Math.max(1, Math.ceil((s.w - s.cel) / w.energia.tempoKgTydz)));
    expect(t).toMatch(/orientacyjnie około/u);
    // Z6 i Z5: role ruch (2 zdania) i kontrola
    expect(w.zdania.ruch).toHaveLength(2);
    expect(zl(w, 'ruch')).toMatch(/ćwiczenia oporowe/u);
    expect(zl(w, 'ruch')).toContain('150 minut');
    expect(w.zdania.kontrola).toHaveLength(1);
    expect(zl(w, 'kontrola')).toContain('BMI 20');
    expect(w.punkty.ruch.join(' ')).toMatch(/oporowe|siłowe/u);
    expect(w.punkty.kontrola.join(' ')).toContain('BMI 20');
    // talerz per stan: górna norma bez alkoholu osobno, norma z alkoholem
    if (s.sex === 'F') { expect(zl(w, 'talerz')).not.toMatch(/nowotwor/u); expect(t).toMatch(/Priorytetem powinno być|masa ciała nie rosła dalej/u); } else { expect(zl(w, 'talerz')).toMatch(/nowotwor/u); }
    // każde zdanie roli jest dosłownie w tekście
    for (const rola of Object.keys(w.zdania)) for (const zd of w.zdania[rola]) expect(t).toContain(norm(zd));
  }
});

test('Droga do normy i karta „Cel”: jedno źródło wartości, panel do celu własnego, tylko dieta lekka', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const bez = await policz(page, { age: 35, sex: 'F', h: 164, w: 66 });
  expect(bez.wrap).toBe(true); expect(bez.hint).toMatch(/Opcjonalnie: masa docelowa od 49,8 kg \(BMI 18,5\) do 65,5 kg/u);
  expect(bez.journey).toBeNull(); expect(bez.toNorm).toContain('zbliża się do jej górnej granicy');
  expect(bez.kartaCel).toBe(true); expect(bez.maintainPressed).toBe(true); expect(bez.celPressed).toBe(false); expect(bez.proxyWrap).toBe(false);

  const z = await policz(page, { age: 35, sex: 'F', h: 164, w: 66, cel: 62 });
  expect(z.wrap).toBe(true); expect(z.hint).toMatch(/^Cel własny: 62,0 kg \(BMI 23,1\)/u);
  expect(z.journey).not.toBeNull();
  expect(z.journey).toContain('Cel własny: −4,0 kg'); expect(z.journey).toContain('do celu własnego (BMI 23,1)');
  expect(z.journey).toContain('Start: 66,0 kg → Cel: 62,0 kg'); expect(z.journey).toContain('górna granica dnia — cel własny, dieta lekka (nie cel do dobicia)'); // P-DIETA rata Z
  expect(z.journey).toContain('nie jest wskazaniem medycznym');
  expect(z.journey).not.toMatch(/granicy normy BMI/u);
  expect(z.dietLevel).toEqual(['light']); expect(z.planWidoczny).toBe(false);
  expect(z.kartaCel).toBe(true); expect(z.celPressed).toBe(true); expect(z.proxyWrap).toBe(true); expect(z.proxy).toBe('62'); expect(z.kartaHint).toMatch(/^Cel własny: 62,0 kg/u);

  // klik „Utrzymanie” w karcie modułu czyści cel w Drodze do normy i zdejmuje panel
  // (panel modułu otwieramy jak inne testy: przycisk i zakładka „energia”, klik przez DOM)
  await page.evaluate(() => { document.getElementById('dietRecommendationsBtn').click(); });
  await page.evaluate(() => document.querySelector('[data-diet-goal-choice="maintain"]').click());
  await page.waitForFunction(() => !document.getElementById('bmiJourneyMount'));
  const po = await page.evaluate(() => ({ cel: document.getElementById('customGoalKg').value, custom: document.querySelector('[data-diet-goal-choice="custom"]').getAttribute('aria-pressed'), toNorm: (document.getElementById('toNormInfo') || {}).textContent || '' }));
  expect(po.cel).toBe(''); expect(po.custom).toBe('false'); expect(po.toNorm).toContain('zbliża się do jej górnej granicy');

  // klik „Cel własny” otwiera pole w karcie; wpis w polu karty trafia do #customGoalKg i montuje panel
  await page.evaluate(() => document.querySelector('[data-diet-goal-choice="custom"]').click());
  await page.waitForFunction(() => { const w = document.querySelector('[data-diet-goal-input-wrap]'); return !!w && w.style.display !== 'none'; });
  await page.evaluate(() => { const px = document.getElementById('customGoalKgProxy'); px.value = '63'; px.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => !!document.getElementById('bmiJourneyMount') && document.getElementById('customGoalKg').value === '63');
  const po2 = await page.evaluate(() => ({ journey: (document.getElementById('bmiJourneyMount') || {}).textContent || '', hint: (document.getElementById('customGoalHint') || {}).textContent || '' }));
  expect(norm(po2.journey)).toContain('Cel własny: −3,0 kg'); expect(norm(po2.hint)).toMatch(/^Cel własny: 63,0 kg/u);

  // zły cel: komunikat, brak panelu, strategia „utrzymanie”
  const zly = await policz(page, { age: 35, sex: 'F', h: 164, w: 66, cel: 70 });
  expect(zly.hint).toMatch(/niższy od obecnej masy ciała co najmniej o 0,5 kg \(maks\. 65,5 kg\)/u);
  expect(zly.journey).toBeNull(); expect(zly.strategia).toBe('utrzymanie'); expect(zly.celPressed).toBe(false);

  // poza pasmem i poza trybem pro pola nie ma; blokada z historii — pole wyłączone z powodem
  const nizej = await policz(page, { age: 35, sex: 'F', h: 164, w: 61.6, cel: 58 });
  expect(nizej.wrap).toBe(false); expect(nizej.kartaCel).toBe(false); expect(nizej.journey).toBeNull();
  const dziecko = await policz(page, { age: 12, sex: 'F', h: 150, w: 40, cel: 38 });
  expect(dziecko.wrap).toBe(false); expect(dziecko.kartaCel).toBe(false);
  const otyly = await policz(page, { age: 42, sex: 'M', h: 178, w: 108, cel: 90 });
  expect(otyly.wrap).toBe(false); expect(otyly.journey).toContain('do górnej granicy normy BMI'); expect(otyly.strategia).toBe('reduction');
  const now = Date.now();
  const ryzyko = await policz(page, { age: 35, sex: 'F', h: 164, w: 66, cel: 62, historia: [{ t: now - 28 * 864e5, weight: 70 }, { t: now, weight: 66 }] });
  expect(ryzyko.wrap).toBe(true); expect(ryzyko.poleDisabled).toBe(true); expect(ryzyko.hint).toMatch(/niedostępny: szybka utrata masy ciała/u);
  expect(ryzyko.journey).toBeNull(); expect(ryzyko.kartaCel).toBe(true); expect(ryzyko.celPressed).toBe(false);
  const pacjent = await policz(page, { age: 35, sex: 'F', h: 164, w: 66, cel: 62, pro: false });
  expect(pacjent.wrap).toBe(false);
});

test('raport pacjenta: nagłówek sekcji energii wg strategii', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  const raport = (s) => page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    window.professionalMode = true; window.intakeHistory = null;
    set('age', s.age); set('ageMonths', 0); set('sex', s.sex); set('weight', s.w); set('height', s.h); set('customGoalKg', s.cel == null ? '' : s.cel);
    window.ensureDietRecommendationsElements();
    ['reduceToggle', 'stabilizationToggle', 'growthEndedFlag'].forEach((id) => { const el = document.getElementById(id); if (el) el.checked = false; });
    ['nutritionNormsFlag', 'journeyFlag', 'vitDSuppFlag', 'hydrationFlag'].forEach((id) => { const el = document.getElementById(id); if (el) el.checked = true; });
    window.update();
    await new Promise((r) => { setTimeout(r, 180); });
    const baseResult = window.VildaDietRecommendations.buildEnergyRecommendationResult();
    const ctx = { patient: { name: 'Jan Testowy', ageLabel: s.age + ' lat', sexLabel: s.sex === 'F' ? 'żeńska' : 'męska', weightLabel: s.w + ',0 kg', heightLabel: s.h + ',0 cm' }, baseResult };
    return { html: window.VildaRaportPlan.html(ctx), strategia: baseResult.dane && baseResult.dane.strategia };
  }, s);
  const u = await raport({ age: 30, sex: 'M', h: 180, w: 72 });
  expect(u.strategia).toBe('utrzymanie');
  expect(tekstZHtml(u.html)).toContain('ZAPOTRZEBOWANIE ENERGETYCZNE (UTRZYMANIE MASY CIAŁA)');
  expect(tekstZHtml(u.html)).not.toContain('TEMPO REDUKCJI');
  const c = await raport({ age: 30, sex: 'M', h: 180, w: 76, cel: 72 });
  expect(c.strategia).toBe('cel-wlasny');
  expect(tekstZHtml(c.html)).toContain('KALORYCZNOŚĆ DIETY I TEMPO REDUKCJI DO CELU WŁASNEGO');
  expect(tekstZHtml(c.html)).toContain('deficyt energetyczny');
  const o = await raport({ age: 47, sex: 'M', h: 167, w: 112 });
  expect(o.strategia).toBe('reduction');
  expect(tekstZHtml(o.html)).toContain('KALORYCZNOŚĆ DIETY I TEMPO REDUKCJI MASY CIAŁA');
});
