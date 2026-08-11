import { expect, test } from '@playwright/test';

// Testy regresyjne poprawek logicznych modułu „Zalecenia dietetyczne"
// (naprawa etap 1). Wołają PRAWDZIWE funkcje produkcyjne
// (window.generateDietRecommendations = pe w vilda_diet_recommendations.js)
// na realnej stronie index.html z wypełnionym formularzem (AGENTS.md §3.5).
//
// Przypadki syntetyczne (wejście → oczekiwany wynik):
//  DIET-SEX-HYDRATION: dziewczynka 10 lat z otyłością + flaga nawodnienia →
//    norma płynów 2,00 l (nie męskie 2,5 l) i „płci żeńskiej" w tekście.
//  DIET-ADULT-UNDERWEIGHT: dorosły BMI ~17,5 z alertem WHR → zalecenia
//    niedowagi (odżywczo gęste posiłki, ocena przyczyn), BEZ deficytu,
//    tempa redukcji i celu „niedopuszczenie do dalszego wzrostu masy".
//  DIET-CHILD-NORM-WHR: dziecko z BMI w normie (ścieżka WHR) → komunikat
//    „w granicach normy", BEZ „zredukować … 0,0 kg", BEZ „wyrośnie z nadwagi".

async function openWithDietModule(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.energyBuildPlanReductionState === 'function');
  // Moduł diety jest ładowany leniwie — doładuj produkcyjny plik wprost.
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js?v=6' });
  await page.waitForFunction(() => typeof window.generateDietRecommendations === 'function');
}

async function generate(page, { ageYears, ageMonths = 0, sex, weightKg, heightCm, vitD = false, hydration = false }) {
  return page.evaluate(({ ageYears, ageMonths, sex, weightKg, heightCm, vitD, hydration }) => {
    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = String(value);
    };
    window.professionalMode = true;
    set('age', ageYears);
    set('ageMonths', ageMonths);
    set('sex', sex);
    set('weight', weightKg);
    set('height', heightCm);
    const setFlag = (id, checked) => {
      const el = document.getElementById(id);
      if (el) el.checked = checked;
    };
    setFlag('vitDSuppFlag', vitD);
    setFlag('hydrationFlag', hydration);
    const reduce = document.getElementById('reduceToggle');
    if (reduce) reduce.checked = true;
    const stab = document.getElementById('stabilizationToggle');
    if (stab) stab.checked = false;
    const result = window.generateDietRecommendations();
    return result && result.textOutput ? result.textOutput : '';
  }, { ageYears, ageMonths, sex, weightKg, heightCm, vitD, hydration });
}

test('DIET-SEX-HYDRATION: dziewczynka 10 lat dostaje żeńską normę płynów 2,00 l', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithDietModule(page);
  // 10 lat, 140 cm, 50 kg → BMI ~25,5, znacznie powyżej 85c → Ze=true.
  // Wariant dla rodzica (<11 lat) zawiera jawnie normę i etykietę płci.
  const text = await generate(page, {
    ageYears: 10, sex: 'F', weightKg: 50, heightCm: 140, hydration: true,
  });
  expect(text).toContain('2,00');
  expect(text).not.toContain('2,50');
  expect(text).toContain('żeńskiej');
  expect(text).not.toContain('męskiej');
});

test('DIET-ADULT-UNDERWEIGHT: niedowaga z alertem WHR bez planu redukcyjnego', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithDietModule(page);
  // Dorosła 30 lat, 170 cm, 50,5 kg → BMI ~17,5 (niedowaga). Alert WHR
  // symulowany tak, jak widzi go moduł: widoczny #whrInfo z klasą ostrzeżenia.
  const text = await page.evaluate(() => {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = String(value); };
    window.professionalMode = true;
    set('age', 30); set('ageMonths', 0); set('sex', 'F');
    set('weight', 50.5); set('height', 170);
    const whr = document.getElementById('whrInfo');
    if (whr) { whr.style.display = 'block'; whr.classList.add('whr-warning'); }
    const dietLevel = document.getElementById('dietLevel');
    if (dietLevel && typeof window.fillDietSelect === 'function') window.fillDietSelect();
    const result = window.generateDietRecommendations();
    if (whr) { whr.style.display = 'none'; whr.classList.remove('whr-warning'); }
    return result && result.textOutput ? result.textOutput : '';
  });
  expect(text).toContain('niedowag');
  // Zalecenia właściwe dla niedowagi muszą być obecne:
  expect(text).toMatch(/gęstych posiłków|oceny przyczyn/);
  // Sprzeczne treści redukcyjne nie mogą wystąpić:
  expect(text).not.toContain('tempu redukcji');
  expect(text).not.toContain('deficytowi energetycznemu');
  expect(text).not.toContain('niedopuszczenie do dalszego wzrostu masy');
});

test('DIET-CHILD-NORM-WHR: dziecko z BMI w normie nie dostaje narracji redukcyjnej', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithDietModule(page);
  // Chłopiec 10 lat, 140 cm, 30 kg → BMI ~15,3 (norma). Wywołanie wprost
  // (jak przy widoczności wymuszonej alertem WHR).
  const text = await generate(page, {
    ageYears: 10, sex: 'M', weightKg: 30, heightCm: 140,
  });
  expect(text).toContain('w granicach normy');
  expect(text).not.toContain('0,0 kg');
  expect(text).not.toContain('0,0 kg');
  expect(text).not.toMatch(/wyrośnie|wyrosn/u);
  expect(text).not.toContain('deficyt');
  // Zalecenia stylu życia pozostają:
  expect(text).toMatch(/posiłk/);
  expect(text).toMatch(/60 minut/);
});

// ── Etap 2: kompletność PDF „full" ──
// DIET-PDF-FULL-COMPLETE: otyłe dziecko z flagą wit. D → tryb „full" ma
// 3 strony, a przechwycony markup hosta zawiera stronę „Komplet zaleceń"
// z dawkowaniem witaminy D (przedtem: 2 strony, wit. D gubione w sekcji
// `other`). Tryb „classic" nadal 1 strona.
test('DIET-PDF-FULL-COMPLETE: pełny raport PDF zawiera komplet zaleceń z witaminą D', async ({ page }) => {
  test.setTimeout(180_000);
  await openWithDietModule(page);
  await page.addScriptTag({ url: '/vilda_patient_report.js?v=5' });
  await page.waitForFunction(() => typeof window.patientReportCreateRenderHost === 'function');
  const result = await page.evaluate(async () => {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = String(value); };
    window.professionalMode = true;
    set('age', 12); set('ageMonths', 0); set('sex', 'M');
    set('weight', 75); set('height', 155);
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
    flag('vitDSuppFlag', true); flag('hydrationFlag', true);
    flag('reduceToggle', true); flag('stabilizationToggle', false);
    // Hermetyczne stuby bibliotek PDF (CDN niedostępny w środowisku testów) —
    // testujemy logikę składania stron modułu, nie renderowanie jsPDF.
    window.vildaEnsurePdfLibraries = async () => true;
    window.jspdf = window.jspdf || { jsPDF: function JsPdfStub() {} };
    window.html2canvas = window.html2canvas || (async (el, opts) => {
      const c = document.createElement('canvas');
      c.width = (opts && opts.width) || el.offsetWidth || 1240;
      c.height = (opts && opts.height) || el.offsetHeight || 1754;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
      return c;
    });
    const captured = { html: '' };
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.diet-pdf-root').forEach((root) => {
        if (root.innerHTML.length > captured.html.length) captured.html = root.innerHTML;
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const full = await window.dietRecommendationsCollectPdfPages({ mode: 'full' });
    const classic = await window.dietRecommendationsCollectPdfPages({ mode: 'classic' });
    observer.disconnect();
    return {
      fullPages: full && full.pages ? full.pages.length : 0,
      classicPages: classic && classic.pages ? classic.pages.length : 0,
      hasKomplet: captured.html.includes('Komplet zalece'),
      hasVitD: /witamin/i.test(captured.html),
      hasIU: captured.html.includes('IU'),
    };
  });
  expect(result.fullPages).toBe(3);
  expect(result.classicPages).toBe(1);
  expect(result.hasKomplet).toBe(true);
  expect(result.hasVitD).toBe(true);
  expect(result.hasIU).toBe(true);
});
