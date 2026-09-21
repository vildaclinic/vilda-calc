import { expect, test } from '@playwright/test';

// P-DIETA-AUDYT (rata F, 2026-09-21) — audyt mieszania zaleceń w module „Zalecenia dietetyczne”.
//
// Co było: trzy przyciski i pakiet „Raport pacjenta” generowały CZTERY różne dokumenty. Plan SMART
// (osobny silnik: ankieta nawyków → 2–3 „małe kroki”) nie sprawdzał stanu odżywienia i dawał
// 13‑latkowi z niedowagą cele otyłościowe (400 g warzyw, „kontrola sytości”, model talerza ½/¼/¼),
// a „Pełny raport” sklejał je ze zdaniami niedowagi. Zdanie o 60 min ruchu padało także przy cechach
// ryzyka zaburzeń odżywiania, a o nadzorze mówiły trzy osobne zdania.
//
// Decyzje właściciela (wszystkie rekomendacje przyjęte): plan SMART i jego raporty usunięte; jedno
// źródło treści (generator) dla ekranu, schowka, PDF i pakietu raportu; przy ryzyku ZO jedno zdanie
// o nadzorze (dawne Z5 + kontrola A) z powodami z modułu ryzyka, ruch i termin kontroli wg lekarza
// (AAP 2021, Hornberger i Lane, doi 10.1542/peds.2020-040279); przy niedowadze bez ryzyka (≥ 5 lat)
// ruch dla przyjemności bez wyczerpujących treningów; dorosły bez planu liczbowego (Z6) — ruch wg lekarza.
// Dane FIKCYJNE.
// P-DIETA-REJESTR rata G (2026-09-21): tryb „Dla pacjenta" usunięty — zostaje jeden, standardowy rejestr.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function' && typeof window.energyBuildPlanReductionState === 'function' && !!window.VildaRaportPlan && !!window.VildaAnorexiaRisk);
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js' });
  await page.waitForFunction(() => !!(window.VildaDietRecommendations && typeof window.VildaDietRecommendations.generateRecommendations === 'function'));
  await page.addScriptTag({ url: '/vilda_patient_report.js' });
  await page.waitForFunction(() => typeof window.patientReportCreateRenderHost === 'function');
}

const norm = (v) => String(v == null ? '' : v).replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ').trim();
const zl = (w, rola) => norm((w.zdania[rola] || []).join(' '));

/** Ustawia pacjenta (masa wprost albo z centyla BMI silnika); zwraca tekst, role, punkty i stan ryzyka. */
function policz(page, s) {
  return page.evaluate(async (s) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    const tgl = document.getElementById('resultsModeToggle');
    if (tgl && !tgl.checked) { tgl.checked = true; tgl.dispatchEvent(new Event('change', { bubbles: true })); }
    window.professionalMode = true; window.__vildaPlanPalTouched = false; window.__vildaDietStrategyTouched = false; window.__vildaDietGoalChoice = null;
    window.intakeHistory = null;
    let w = s.w;
    if (s.centyl != null) {
      const q = window.VildaBmi.wartoscDlaCentyla({ centyl: s.centyl, plec: s.sex, wiekMies: (s.age + (s.months || 0) / 12) * 12, zrodlo: 'OLAF' });
      w = Math.round(q.bmi * Math.pow(s.h / 100, 2) * 10) / 10;
    }
    set('age', s.age); set('ageMonths', s.months || 0); set('sex', s.sex); set('weight', w); set('height', s.h); set('customGoalKg', '');
    window.ensureDietRecommendationsElements();
    flag('reduceToggle', false); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    flag('nutritionNormsFlag', true); flag('journeyFlag', true); flag('vitDSuppFlag', true); flag('hydrationFlag', true);
    window.update();
    await new Promise((res) => { setTimeout(res, 160); });
    const r = window.VildaDietRecommendations.generateRecommendations();
    const d = r.dane || {};
    const st = window.energyBuildPlanReductionState({ ageYears: s.age, ageMonthsOpt: s.months || 0, sex: s.sex, weightKg: w, heightCm: s.h, palInput: null, history: null });
    return { w, bmi: w / Math.pow(s.h / 100, 2), text: r.textOutput || '', zdania: d.zdania || {}, punkty: d.punkty || {}, strategia: d.strategia, risk: st.risk || null, gp: st.gainPlan || null };
  }, s);
}

const NADZOR_PRO_13 = 'Niedowaga z cechami ryzyka zaburzeń odżywiania (masa poniżej 85 % należnej; BMI poniżej 2. centyla) wymaga pilnej oceny przyczyn klinicznych i trajektorii wzrastania. Plan żywieniowy dla przyrostu masy ciała musi nadzorować lekarz z dietetykiem klinicznym; nie zaleca się ograniczania energii ani produktów. Do rozważenia konsultacja psychologiczna.';
const RUCH_RYZ_PRO = 'Do czasu oceny klinicznej nie zaleca się zwiększania aktywności fizycznej; jej zakres ustala lekarz prowadzący.';
const TERMIN_PRO = 'Termin i częstość kontroli masy ciała i wzrostu ustala lekarz prowadzący; brak przyrostu lub dalszy spadek masy ciała wymaga wcześniejszej wizyty.';
const RUCH_PRZ_PRO = 'Aktywność fizyczna w zwykłym zakresie dla wieku pozostaje wskazana, najlepiej jako zabawa i sport dla przyjemności; przy niedowadze należy unikać długich, wyczerpujących treningów wytrzymałościowych.';

test('ryzyko ZO u 13‑latka: jedno zdanie o nadzorze z powodami modułu ryzyka, bez „60 minut”, ruch i kontrola wg lekarza', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const pro = await policz(page, { age: 13, sex: 'M', h: 158, centyl: 1 });
  expect(pro.strategia).toBe('przyrost');
  expect(pro.risk.any).toBe(true);
  expect(pro.risk.reasons.join(' ')).toMatch(/85%/);
  expect(pro.risk.reasons.join(' ')).toMatch(/2\. centyla/);
  const t = norm(pro.text);
  expect(t).toContain(NADZOR_PRO_13);
  // dawne trzy zdania o nadzorze i ruch otyłościowy nie mogą wrócić
  for (const zakazane of ['Cechy ryzyka', 'Niedowaga u dziecka wymaga oceny przyczyn', '60 minut', 'co 4–6 tygodni', 'gry zespołowe', 'psychodietetyk']) expect(t).not.toContain(zakazane);
  expect(zl(pro, 'ruch')).toBe(RUCH_RYZ_PRO);
  expect(norm(pro.zdania.kontrola[0])).toBe(NADZOR_PRO_13);
  expect(pro.zdania.kontrola.length).toBe(2);
  expect(norm(pro.zdania.kontrola[1])).toBe(TERMIN_PRO);
  // punkty raportu: cytują zdanie, bez liczby i słowa spoza niego
  expect(pro.punkty.kontrola).toEqual(['pilna ocena przyczyn klinicznych i trajektorii wzrastania', 'plan żywieniowy pod nadzorem lekarza i dietetyka klinicznego', 'bez ograniczania energii ani produktów', 'do rozważenia konsultacja psychologiczna', 'termin i częstość kontroli ustala lekarz prowadzący', 'brak przyrostu lub dalszy spadek masy ciała – wcześniejsza wizyta']);
  expect(pro.punkty.ruch).toEqual(['bez zwiększania aktywności fizycznej do czasu oceny klinicznej', 'zakres aktywności ustala lekarz prowadzący']);
  // Z5 i kontrola A scalone: o nadzorze mówi dokładnie jedno zdanie
  expect((norm(pro.text).match(/dietetykiem klinicznym|dietetyka klinicznego/g) || []).length).toBe(1);

  // 15‑latka: tylko EBW < 85 % → w nawiasie jeden powód
  const n15 = await policz(page, { age: 15, sex: 'F', h: 160, centyl: 4 });
  expect(norm(n15.text)).toContain('Niedowaga z cechami ryzyka zaburzeń odżywiania (masa poniżej 85 % należnej) wymaga');
});

test('niedowaga bez cech ryzyka: ruch dla przyjemności bez wyczerpujących treningów (8 i 12 lat), maluch 180 min, nadmiar nadal 60 min', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const d8 = await policz(page, { age: 8, sex: 'F', h: 128, centyl: 4 });
  expect(d8.risk.any).toBe(false);
  expect(zl(d8, 'ruch')).toBe(RUCH_PRZ_PRO);
  expect(norm(d8.text)).not.toContain('60 minut');
  expect(norm(d8.zdania.kontrola[1])).toContain('co 4–6 tygodni'); // bez ryzyka kontrola raty D bez zmian
  expect(d8.punkty.ruch).toEqual(['ruch w zwykłym zakresie dla wieku – zabawa i sport dla przyjemności', 'bez długich, wyczerpujących treningów wytrzymałościowych']);
  const n12 = await policz(page, { age: 12, sex: 'F', h: 150, centyl: 4 });
  expect(n12.risk.any).toBe(false);
  expect(zl(n12, 'ruch')).toBe(RUCH_PRZ_PRO);
  // maluch: bez zmian (rata E)
  const m3 = await policz(page, { age: 3, sex: 'F', h: 100, w: 12 });
  expect(zl(m3, 'ruch')).toContain('180 minut');
  // kontrola pozytywna: nadmiar u 12‑latka nadal dostaje 60 minut ruchu
  const o12 = await policz(page, { age: 12, sex: 'M', h: 150, centyl: 95 });
  expect(o12.strategia).toBe('reduction');
  expect(zl(o12, 'ruch')).toContain('co najmniej 60 minut');
});

test('dorosły: bez planu liczbowego (Z6) ruch wg lekarza; z planem liczbowym ćwiczenia oporowe bez zmian', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const z6 = await policz(page, { age: 30, sex: 'F', h: 168, w: 44 });
  expect(z6.gp && z6.gp.available).toBe(false);
  expect(zl(z6, 'ruch')).toBe(RUCH_RYZ_PRO);
  expect(norm(z6.text)).not.toContain('oporowych');
  expect(z6.punkty.ruch).toEqual(['bez zwiększania aktywności fizycznej do czasu oceny klinicznej', 'zakres aktywności ustala lekarz prowadzący']);
  const plan = await policz(page, { age: 28, sex: 'F', h: 168, w: 50 });
  expect(plan.gp && plan.gp.available).toBe(true);
  expect(zl(plan, 'ruch')).toContain('ćwiczeniach oporowych 2–3 razy w tygodniu');
});

test('plan SMART usunięty: brak zakładek, ankiety, budowniczego i wariantów; każda nazwa trybu daje jednostronicowy plan z punktami generatora', async ({ page }) => {
  test.setTimeout(180_000);
  await otworz(page);
  const dom = await page.evaluate(() => {
    window.ensureDietRecommendationsElements();
    const q = (sel) => document.querySelectorAll(sel).length;
    const api = window.VildaDietRecommendations || {};
    return {
      tabs: q('[data-diet-mode]'), smartPanel: q('#dietSmartPanel'), pdfPanel: q('#dietPdfPanel'), smartBtn: q('#generateDietBtn'),
      survey: q('[data-diet-survey-key]'), mythNext: q('[data-diet-myth-next]'),
      directButtons: Array.from(document.querySelectorAll('[data-diet-report-direct]')).map((b) => b.getAttribute('data-diet-report-direct')),
      energyBtn: q('#generateEnergyDietBtn'), copyBtn: q('[data-diet-copy-result="energy"]'),
      audience: q('[data-diet-audience-choice]'), pfToggle: q('#patientFacingToggle'),
      builder: typeof window.buildDietSmartRecommendationResult, myth: typeof window.dietRecommendationsRequestNewMyth, mythLib: typeof window.dietMythLibrary,
      apiSmart: typeof api.buildSmartRecommendationResult, apiMode: typeof api.getActiveMode, apiEnergy: typeof api.buildEnergyRecommendationResult,
      intro: (document.querySelector('#dietRecommendationsContent .diet-card-intro p') || {}).textContent || '',
    };
  });
  expect(dom.tabs).toBe(0); expect(dom.smartPanel).toBe(0); expect(dom.pdfPanel).toBe(0); expect(dom.smartBtn).toBe(0);
  expect(dom.survey).toBe(0); expect(dom.mythNext).toBe(0);
  expect(dom.audience).toBe(0); expect(dom.pfToggle).toBe(0); // rata G: bez trybu „Dla pacjenta"
  expect(dom.directButtons).toEqual(['classic']);
  expect(dom.energyBtn).toBe(1); expect(dom.copyBtn).toBe(1);
  expect(dom.builder).toBe('undefined'); expect(dom.myth).toBe('undefined'); expect(dom.mythLib).toBe('undefined');
  expect(dom.apiSmart).toBe('undefined'); expect(dom.apiMode).toBe('undefined'); expect(dom.apiEnergy).toBe('function');
  expect(dom.intro).not.toContain('SMART');

  // jedno źródło treści: strona PDF (każda dawna nazwa trybu) zawiera punkty generatora dla 13‑latka z ryzykiem i nic z planu SMART
  const pro = await policz(page, { age: 13, sex: 'M', h: 158, centyl: 1 });
  const pdf = await page.evaluate(async () => {
    window.vildaEnsurePdfLibraries = async () => true;
    window.jspdf = window.jspdf || { jsPDF: function JsPdfStub() {} };
    window.html2canvas = window.html2canvas || (async () => { const c = document.createElement('canvas'); c.width = 1240; c.height = 1754; return c; });
    const out = {};
    for (const mode of ['full', 'personalized', 'smart', 'classic', undefined]) {
      const captured = { html: '' };
      const observer = new MutationObserver(() => {
        document.querySelectorAll('.diet-pdf-root').forEach((root) => { if (root.innerHTML.length > captured.html.length) captured.html = root.innerHTML; });
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const r = await window.dietRecommendationsCollectPdfPages(mode ? { mode } : {});
      observer.disconnect();
      out[String(mode)] = { pages: r.pages.length, mode: r.mode, txt: captured.html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
    }
    return out;
  });
  for (const k of Object.keys(pdf)) {
    expect(pdf[k].pages).toBe(1);
    expect(pdf[k].mode).toBe('classic');
    const txt = norm(pdf[k].txt);
    expect(txt).toContain('ZAPOTRZEBOWANIE ENERGETYCZNE I PRZYROST MASY CIAŁA');
    for (const rola of ['kontrola', 'ruch', 'talerz']) for (const p of pro.punkty[rola]) expect(txt).toContain(norm(p));
    for (const zakazane of ['Plan na 14 dni', '80/20', 'Mit kontra fakt', 'cele bazowe', 'Regularność posiłków', '400 g warzyw', 'kontroli sytości', 'Komplet zalece', '60 minut']) expect(txt).not.toContain(zakazane);
  }
});
