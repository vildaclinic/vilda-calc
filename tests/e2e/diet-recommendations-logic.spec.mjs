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
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js?v=15' });
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
  // Etap 6 (decyzja właściciela): przy niedowadze nie pada cel zmniejszania talii:
  expect(text).not.toContain('Dodatkowym celem');
  expect(text).not.toContain('zmniejszenie obwodu talii');
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
  await page.addScriptTag({ url: '/vilda_patient_report.js?v=7' });
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

// ── Etap 3: plan SMART — warianty dziecięce, fallback bazowy, chipy, rotacja mitów ──

async function buildSmart(page, { ageYears, sex, weightKg, heightCm, checkedKeys }) {
  return page.evaluate(({ ageYears, sex, weightKg, heightCm, checkedKeys }) => {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = String(value); };
    window.professionalMode = true;
    set('age', ageYears); set('ageMonths', 0); set('sex', sex);
    set('weight', weightKg); set('height', heightCm);
    window.ensureDietRecommendationsElements();
    document.querySelectorAll('[data-diet-survey-key]').forEach((el) => {
      el.checked = checkedKeys.includes(el.getAttribute('data-diet-survey-key'));
    });
    const result = window.buildDietSmartRecommendationResult();
    return {
      text: result && result.textOutput ? result.textOutput : '',
      surveyCompleted: !!(result && result.surveyCompleted),
    };
  }, { ageYears, sex, weightKg, heightCm, checkedKeys });
}

// DIET-SMART-CHILD-BASE: dziecko 6 lat, w ankiecie zaznaczone tylko „alergie
// lub nietolerancje" (chip bez własnego celu) → fallback bazowy musi dać cele
// DZIECIĘCE (woda, warzywa, posiłek bez ekranu), nie dorosłą triadę z metodą
// talerza; przypomnienie honoruje chip alergii (przedtem martwy).
test('DIET-SMART-CHILD-BASE: fallback bazowy dziecka + aktywny chip alergii', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithDietModule(page);
  const result = await buildSmart(page, {
    ageYears: 6, sex: 'M', weightKg: 28, heightCm: 118,
    checkedKeys: ['allergiesOrIntolerances'],
  });
  expect(result.surveyCompleted).toBe(true);
  expect(result.text).toContain('Woda jako podstawowy nap');
  expect(result.text).toContain('bez ekranu');
  expect(result.text).not.toContain('Talerz zdrowego żywienia');
  expect(result.text).not.toContain('redukcji masy');
  // Chip „alergie lub nietolerancje" ma realny efekt w przypomnieniu:
  expect(result.text).toContain('alergiach lub nietolerancjach');
  expect(result.text).toContain('zamienników bezpiecznych dla pacjenta');
});

// DIET-SMART-CHILD-PROTEIN: dziecko szkolne z „mało białka" + „nie lubi ryb"
// → cel białkowy w brzmieniu dziecięcym (rozwój, nie „redukcja masy"),
// a lista produktów respektuje chip dislikesFish (przedtem martwy).
test('DIET-SMART-CHILD-PROTEIN: cel białkowy dziecka bez narracji redukcyjnej i bez ryb', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithDietModule(page);
  const result = await buildSmart(page, {
    ageYears: 8, sex: 'F', weightKg: 38, heightCm: 132,
    checkedKeys: ['lowProtein', 'dislikesFish'],
  });
  expect(result.text).toContain('głównych posiłkach dziecka');
  expect(result.text).toContain('prawidłowy rozwój');
  expect(result.text).toContain('zamiast ryb wybierz inne akceptowane');
  expect(result.text).not.toContain('redukcji masy');
  expect(result.text).not.toContain('jaja, ryby,');
});

// DIET-MYTH-ROTATION: nastolatek z zaznaczonym tylko „mało białka" zawęża pulę
// mitów tagami do jednej pozycji (perfect_diet, tag „teen"). Prośba o nowy mit
// musi sięgnąć do pełnej puli wiekowej (fallback rAll) — przedtem rotacja
// utykała i zwracała wciąż ten sam mit.
test('DIET-MYTH-ROTATION: nowy mit przy zawężonej puli tagów faktycznie się zmienia', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithDietModule(page);
  const result = await page.evaluate(() => {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = String(value); };
    window.professionalMode = true;
    set('age', 14); set('ageMonths', 0); set('sex', 'M');
    set('weight', 75); set('height', 165);
    window.ensureDietRecommendationsElements();
    document.querySelectorAll('[data-diet-survey-key]').forEach((el) => {
      el.checked = el.getAttribute('data-diet-survey-key') === 'lowProtein';
    });
    const mythOf = (text) => (text.split('\n').find((l) => l.startsWith('Mit / popularne przekonanie:')) || '').trim();
    const first = window.buildDietSmartRecommendationResult();
    window.dietRecommendationsRequestNewMyth();
    const second = window.buildDietSmartRecommendationResult();
    return {
      firstMyth: mythOf(first && first.textOutput ? first.textOutput : ''),
      secondMyth: mythOf(second && second.textOutput ? second.textOutput : ''),
    };
  });
  expect(result.firstMyth).not.toBe('');
  expect(result.secondMyth).not.toBe('');
  expect(result.secondMyth).not.toBe(result.firstMyth);
});

// ── Etap 4: growthEnded a stabilizacja, spójność kcal, dopełnienie planu do 2 celów ──

// DIET-GROWTH-ENDED-STAB: dziecko z otyłością i zakończonym wzrostem nie może
// dostać strategii stabilizacji („BMI obniży się wraz z dalszym wzrastaniem"),
// nawet gdy przełącznik stabilizacji pozostał zaznaczony. Bez growthEnded
// stabilizacja działa dalej normalnie (kontrola, że guard nie wycina legalnej ścieżki).
test('DIET-GROWTH-ENDED-STAB: zakończony wzrost wymusza narrację redukcyjną', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithDietModule(page);
  const run = (growthEnded) => page.evaluate((ge) => {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = String(value); };
    window.professionalMode = true;
    set('age', 10); set('ageMonths', 0); set('sex', 'M');
    set('weight', 60); set('height', 140);
    window.ensureDietRecommendationsElements();
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
    flag('reduceToggle', false);
    flag('stabilizationToggle', true);
    flag('growthEndedFlag', ge);
    const result = window.generateDietRecommendations();
    // Odśwież nowoczesne UI strategii (we() → Te()) tak, jak robi to moduł
    // po każdej przebudowie wyniku SMART:
    window.buildDietSmartRecommendationResult();
    const btn = document.querySelector('[data-diet-strategy-choice="stabilization"]');
    return {
      text: result && result.textOutput ? result.textOutput : '',
      stabChoiceHidden: btn ? !!btn.hidden : null,
    };
  }, growthEnded);

  const withGrowthEnded = await run(true);
  expect(withGrowthEnded.text).not.toMatch(/dalszym wzrastaniem|dalszego wzrastania/u);
  expect(withGrowthEnded.text).toMatch(/zredukowa|redukcji/u);
  if (withGrowthEnded.stabChoiceHidden !== null) {
    expect(withGrowthEnded.stabChoiceHidden).toBe(true);
  }

  const withoutGrowthEnded = await run(false);
  expect(withoutGrowthEnded.text).toMatch(/wzrastani/u);
  expect(withoutGrowthEnded.text).not.toMatch(/zredukowa|potrzebę redukcji/u);
  if (withoutGrowthEnded.stabChoiceHidden !== null) {
    expect(withoutGrowthEnded.stabChoiceHidden).toBe(false);
  }
});

// DIET-KCAL-CONSISTENT: jeden dokument = jedna kaloryczność planu. Narracja
// („zalecana kaloryczność … ok. X kcal/dzień") i normy żywieniowe („Normy
// żywieniowe dla planu około Y kcal/d") muszą podawać tę samą liczbę,
// zaokrągloną do 100 kcal (przedtem: 2200 vs 2237).
test('DIET-KCAL-CONSISTENT: narracja i normy podają tę samą kaloryczność planu', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithDietModule(page);
  const text = await page.evaluate(() => {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = String(value); };
    window.professionalMode = true;
    set('age', 35); set('ageMonths', 0); set('sex', 'M');
    set('weight', 105); set('height', 175);
    window.ensureDietRecommendationsElements();
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
    flag('reduceToggle', true); flag('stabilizationToggle', false);
    flag('nutritionNormsFlag', true); flag('patientFacingToggle', false);
    const dl = document.getElementById('dietLevel');
    if (dl && !Array.from(dl.options).some((o) => o.value === 'moderate')) {
      const opt = document.createElement('option');
      opt.value = 'moderate';
      opt.textContent = 'dieta umiarkowana';
      dl.appendChild(opt);
    }
    if (dl) dl.value = 'moderate';
    const result = window.generateDietRecommendations();
    return result && result.textOutput ? result.textOutput : '';
  });
  const digits = (s) => Number(String(s).replace(/[^\d]/g, ''));
  const narration = text.match(/wynosi ok\. ([\d\s]+) kcal\/dzień/u);
  const norms = text.match(/Normy żywieniowe dla planu około ([\d\s]+) kcal\/d/u);
  expect(narration).not.toBeNull();
  expect(norms).not.toBeNull();
  const narrationKcal = digits(narration[1]);
  const normsKcal = digits(norms[1]);
  expect(narrationKcal % 100).toBe(0);
  expect(normsKcal).toBe(narrationKcal);
  // Etap 5: etykieta aktywności pochodzi ze wspólnego słownika karty planu
  // i jest cytowana jawnie („na poziomie „X" (PAL y)"):
  expect(text).toMatch(/deklarowaną aktywność na poziomie „[^"]+" \(PAL \d,\d\)/u);
});

// DIET-SMART-PAD-TWO: pojedynczy trafiony chip nie może dawać planu z jednym
// celem (obietnica „2–3 małe kroki") — plan jest dopełniany celem z triady
// bazowej właściwej dla wieku.
test('DIET-SMART-PAD-TWO: plan z jednym trafionym chipem dostaje drugi cel bazowy', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithDietModule(page);
  const result = await buildSmart(page, {
    ageYears: 8, sex: 'M', weightKg: 40, heightCm: 132,
    checkedKeys: ['lowProtein'],
  });
  expect(result.text).toContain('1. ');
  expect(result.text).toContain('\n2. ');
  // Cel trafiony chipem pozostaje pierwszy (wyższy priorytet):
  expect(result.text).toMatch(/1\. Źródło białka/u);
  // Dopełnienie z triady dziecięcej:
  expect(result.text).toContain('Woda jako podstawowy nap');
});

// ── Etap 5: walidacja danych wejściowych PDF i transliteracja nazw plików ──

// DIET-PDF-VALIDATION: generator PDF odmawia pracy na danych bez sensu zamiast
// produkować raport-atrapę (chip „0 lat 0 mies.", „BMI 24221,5").
test('DIET-PDF-VALIDATION: generator PDF odrzuca brak wieku i błędne jednostki', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithDietModule(page);
  const results = await page.evaluate(async () => {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = String(value); };
    window.professionalMode = true;
    const tryCollect = async () => {
      try {
        await window.dietRecommendationsCollectPdfPages({ mode: 'full' });
        return '';
      } catch (err) {
        return err && err.message ? err.message : 'unknown';
      }
    };
    // Scenariusz 1: puste pola wieku (interpretowane jako 0 lat).
    set('age', ''); set('ageMonths', '');
    set('sex', 'M'); set('weight', 70); set('height', 170);
    const noAge = await tryCollect();
    // Scenariusz 2: wzrost wpisany w metrach → absurdalne BMI.
    set('age', 30); set('ageMonths', 0);
    set('weight', 70); set('height', 1.7);
    const metersHeight = await tryCollect();
    return { noAge, metersHeight };
  });
  expect(results.noAge).toContain('wieku');
  expect(results.metersHeight).toContain('centymetrach');
});

// DIET-FILENAME-PL: „Michał Łąka" nie może tracić liter ł/Ł w nazwie pliku
// (NFD nie rozkłada ł — przedtem wychodziło „Micha_ka"). Dane fikcyjne.
test('DIET-FILENAME-PL: sanitizer nazw plików transliteruje ł/Ł', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithDietModule(page);
  await page.addScriptTag({ url: '/vilda_patient_report.js?v=7' });
  await page.waitForFunction(() => typeof window.patientReportSanitizeFilename === 'function');
  const sanitized = await page.evaluate(() => window.patientReportSanitizeFilename('Michał Łąka'));
  expect(sanitized).toBe('Michal_Laka');
});

// ── Etap 6 (decyzje właściciela): cele Palczewskiej metodą BMI jak OLAF; talia przy WHR ──

// DIET-PAL-TARGET-BMI: przy źródle Palczewska wartości wagowe narracji liczone
// są teraz metodą BMI (centyl BMI × wzrost²) — jak przy OLAF — a nie z centyli
// masy względem wieku. Tabela Palczewskiej nie ma kolumny p85 (cel 85c już
// wcześniej szedł ścieżką BMI), ale mediana (p50) i próg otyłości (p97) szły
// z masy-dla-wieku. Wysoki chłopiec (160 cm w wieku 10 lat) ujawnia różnicę:
// mediana masy-dla-wieku ignorowała wzrost.
test('DIET-PAL-TARGET-BMI: mediana Palczewskiej liczona przez BMI jak OLAF', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithDietModule(page);
  const result = await page.evaluate(() => {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = String(value); };
    window.professionalMode = true;
    if (typeof window.setCheckedGrowthDataSource === 'function') {
      window.setCheckedGrowthDataSource('PALCZEWSKA');
    }
    window.bmiSource = 'PALCZEWSKA';
    set('age', 10); set('ageMonths', 0); set('sex', 'M');
    set('weight', 62); set('height', 160);
    window.ensureDietRecommendationsElements();
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
    flag('reduceToggle', true); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    const out = window.generateDietRecommendations();
    const text = out && out.textOutput ? out.textOutput : '';
    const bmi50 = typeof window.getPalCentile === 'function' ? window.getPalCentile('M', 120, 50, 'BMI') : null;
    const wt50 = typeof window.getPalCentile === 'function' ? window.getPalCentile('M', 120, 50, 'WT') : null;
    const numbers = Array.from(text.matchAll(/ok\. (\d+,\d) ?kg/g)).map((m) => Number(m[1].replace(',', '.')));
    return { text, bmi50, wt50, numbers };
  });
  expect(result.bmi50).not.toBeNull();
  expect(result.wt50).not.toBeNull();
  const expected = result.bmi50 * Math.pow(1.6, 2);
  // Nowa mediana (BMI-owa) musi pojawić się w tekście:
  const hit = result.numbers.some((n) => Math.abs(n - expected) < 0.75);
  expect(hit).toBe(true);
  // Stara mediana (50c masy-dla-wieku) różni się przy 160 cm o wiele kilogramów
  // i nie może już występować:
  expect(Math.abs(expected - result.wt50)).toBeGreaterThan(1.5);
  const oldHit = result.numbers.some((n) => Math.abs(n - result.wt50) < 0.5);
  expect(oldHit).toBe(false);
});

// DIET-WHR-WAIST-GATE: kontrola warunku — dorosły z nadwagą/otyłością i alertem
// WHR nadal dostaje cel zmniejszenia obwodu talii (gate wycina go tylko przy
// niedowadze, sprawdzanej w rozszerzonym DIET-ADULT-UNDERWEIGHT).
test('DIET-WHR-WAIST-GATE: otyły dorosły z alertem WHR zachowuje cel obwodu talii', async ({ page }) => {
  test.setTimeout(90_000);
  await openWithDietModule(page);
  const text = await page.evaluate(() => {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = String(value); };
    window.professionalMode = true;
    set('age', 35); set('ageMonths', 0); set('sex', 'M');
    set('weight', 105); set('height', 175);
    const whr = document.getElementById('whrInfo');
    if (whr) { whr.style.display = 'block'; whr.classList.add('whr-warning'); }
    const result = window.generateDietRecommendations();
    if (whr) { whr.style.display = 'none'; whr.classList.remove('whr-warning'); }
    return result && result.textOutput ? result.textOutput : '';
  });
  expect(text).toContain('Dodatkowym celem');
  expect(text).toContain('zmniejszenie obwodu talii');
});

// ── Etap 7 (decyzja właściciela): dyskleimer <10 lat i zalecenie konsultacji emitowane zawsze ──

// DIET-UNDER10-DISCLAIMER: otyłe dziecko 8 lat w trybie profesjonalnym dostaje
// dyskleimer „plan ma charakter poglądowy" (konsultacja z dietetykiem lub
// endokrynologiem dziecięcym) oraz zalecenie konsultacji z dietetykiem lub
// psychologiem dziecięcym — przedtem oba teksty były martwe (emitowane tylko
// poza trybem profesjonalnym, w którym moduł nie jest osiągalny). Dziecko 12 lat
// bez kryteriów (umiarkowane BMI) nie dostaje dyskleimera.
test('DIET-UNDER10-DISCLAIMER: dyskleimer poniżej 10 lat pada w trybie profesjonalnym', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithDietModule(page);
  const young = await generate(page, {
    ageYears: 8, sex: 'F', weightKg: 45, heightCm: 130,
  });
  expect(young).toContain('endokrynologiem');
  expect(young).toContain('poglądowy');
  expect(young).toContain('psychologiem dziecięcym');
  const older = await generate(page, {
    ageYears: 12, sex: 'F', weightKg: 55, heightCm: 152,
  });
  expect(older).not.toContain('poglądowy');
  expect(older).not.toContain('endokrynologiem');
  // Uwaga z przeglądu PR #109: dziecko <10 lat z BMI w NORMIE (ścieżka WHR)
  // dostaje wariant neutralny — bez fałszywej klasyfikacji „z nadwagą lub otyłością".
  const normalBmi = await generate(page, {
    ageYears: 8, sex: 'F', weightKg: 26, heightCm: 130,
  });
  expect(normalBmi).toContain('poglądowy');
  expect(normalBmi).toContain('endokrynologiem');
  expect(normalBmi).not.toContain('z nadwagą lub otyłością');
});

// DIET-PAL-P97-BOUNDARY: regresja brzegowa progu otyłości 97c po ujednoliceniu
// metodyki (etap 6) — klasyfikacja nadwaga/otyłość wokół progu BMI p97
// Palczewskiej liczonego tą samą inwersją bmiPercentileChildPal, której używa
// produkcja. Chłopiec 10 lat, 160 cm: tuż pod progiem → „nadwaga",
// na progu i powyżej → „otyłość".
test('DIET-PAL-P97-BOUNDARY: klasyfikacja wokół progu 97c BMI Palczewskiej', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithDietModule(page);
  const result = await page.evaluate(() => {
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.value = String(value); };
    window.professionalMode = true;
    if (typeof window.setCheckedGrowthDataSource === 'function') {
      window.setCheckedGrowthDataSource('PALCZEWSKA');
    }
    window.bmiSource = 'PALCZEWSKA';
    window.ensureDietRecommendationsElements();
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
    flag('reduceToggle', true); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    // Prog 97c BMI tą samą metodą co produkcja (inwersja bmiPercentileChildPal):
    if (typeof window.bmiPercentileChildPal !== 'function') return { error: 'brak bmiPercentileChildPal' };
    let lo = 5; let hi = 40;
    for (let i = 0; i < 30; i += 1) {
      const mid = (lo + hi) / 2;
      const pct = window.bmiPercentileChildPal(mid, 'M', 120);
      if (pct == null || Number.isNaN(pct)) return { error: 'bmiPercentileChildPal zwraca null' };
      if (pct < 97) lo = mid; else hi = mid;
    }
    const bmi97 = (lo + hi) / 2;
    const heightM2 = Math.pow(1.6, 2);
    const run = (weightKg) => {
      set('age', 10); set('ageMonths', 0); set('sex', 'M');
      set('weight', weightKg.toFixed(1)); set('height', 160);
      const out = window.generateDietRecommendations();
      return out && out.textOutput ? out.textOutput : '';
    };
    return {
      bmi97,
      below: run((bmi97 - 0.4) * heightM2),
      above: run((bmi97 + 0.4) * heightM2),
    };
  });
  expect(result.error).toBeUndefined();
  // Tuż pod progiem: klasyfikacja „nadwaga", bez słownictwa otyłości:
  expect(result.below).toMatch(/nadwa/u);
  expect(result.below).not.toMatch(/otyło/u);
  // Powyżej progu: klasyfikacja „otyłość":
  expect(result.above).toMatch(/otyło/u);
});

// ── Prognoza wzrostu ostatecznego (konsensus metod) w zaleceniach dietetycznych ──
// Decyzja właściciela 2026-08-11: gdy karta „Zaawansowane obliczenia wzrostowe"
// ma ≥1 metodę prognozy (RWT/BP/KR/Reinehr), pozostały wzrost w zaleceniach
// liczony jest z ważonego konsensusu metod (advancedGrowthData.finalHeightPrediction),
// a MPH zostaje wyłącznie fallbackiem. Wpływa to też na dostępność stabilizacji.

async function openWithGrowthAndDiet(page) {
  await openWithDietModule(page);
  await page.waitForFunction(() => typeof window.calculateGrowthAdvanced === 'function');
}

// DIET-FINAL-HEIGHT-CONSENSUS: pełne dane karty (rodzice + wiek kostny) →
// zalecenia cytują prognozę (konsensus 3 metod), pozostały wzrost = prognoza −
// obecny wzrost; po usunięciu prognozy fallback MPH wraca („na podstawie
// wzrostu rodziców"). Dane fikcyjne.
test('DIET-FINAL-HEIGHT-CONSENSUS: pozostały wzrost z konsensusu metod, MPH jako fallback', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithGrowthAndDiet(page);
  const result = await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true;
    set('age', 10); set('ageMonths', 0); set('sex', 'F');
    set('height', 145); set('weight', 55);
    set('advMotherHeight', 165); set('advFatherHeight', 178); set('advBoneAge', 9);
    window.calculateGrowthAdvanced();
    const d = window.advancedGrowthData || {};
    const fhp = d.finalHeightPrediction || null;
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
    flag('reduceToggle', true); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    const out = window.generateDietRecommendations();
    const withPrediction = out && out.textOutput ? out.textOutput : '';
    delete d.finalHeightPrediction;
    const out2 = window.generateDietRecommendations();
    const mphFallback = out2 && out2.textOutput ? out2.textOutput : '';
    return { fhp, withPrediction, mphFallback };
  });
  expect(result.fhp).not.toBeNull();
  expect(result.fhp.methodCount).toBeGreaterThanOrEqual(2);
  expect(result.fhp.cm).toBeGreaterThanOrEqual(result.fhp.minCm);
  expect(result.fhp.cm).toBeLessThanOrEqual(result.fhp.maxCm);
  // Tekst cytuje prognozę, nie MPH:
  expect(result.withPrediction).toContain('prognozowany wzrost ostateczny');
  expect(result.withPrediction).toContain(`konsensus ${result.fhp.methodCount} metod`);
  expect(result.withPrediction).not.toContain('na podstawie wzrostu rodziców');
  // Pozostały wzrost = prognoza − obecny wzrost (co do 0,1 cm):
  const remaining = (result.fhp.cm - 145).toFixed(1).replace('.', ',');
  expect(result.withPrediction).toContain(`urosnąć ok. ${remaining} cm`);
  // Fallback MPH bez prognozy — dotychczasowe brzmienie:
  expect(result.mphFallback).toContain('na podstawie wzrostu rodziców');
  expect(result.mphFallback).not.toContain('prognozowany wzrost ostateczny');
});

// DIET-STAB-FINAL-HEIGHT: prognoza zmienia decyzję o stabilizacji. Dziewczynka
// 11 lat, 150 cm / 58 kg, niskie MPH (152 cm), opóźniony wiek kostny (9 lat) →
// konsensus ~166,6 cm: przy prognozie stabilizacja DOSTĘPNA (dziecko zdąży
// wyrosnąć do normy), przy samym MPH — ZABLOKOWANA. Dane fikcyjne.
test('DIET-STAB-FINAL-HEIGHT: prognoza ostateczna steruje dostępnością stabilizacji', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithGrowthAndDiet(page);
  const result = await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    window.professionalMode = true;
    set('age', 11); set('ageMonths', 0); set('sex', 'F');
    set('height', 150); set('weight', 58);
    set('advMotherHeight', 152); set('advFatherHeight', 165); set('advBoneAge', 9);
    window.calculateGrowthAdvanced();
    const d = window.advancedGrowthData || {};
    const stab = document.getElementById('stabilizationToggle');
    const withPrediction = {
      cm: d.finalHeightPrediction ? d.finalHeightPrediction.cm : null,
      mph: d.targetHeight,
      possible: window.isStabilizationPossibleForCurrentData(),
      disabled: stab ? stab.disabled : null,
    };
    delete d.finalHeightPrediction;
    window.updateStabilizationEligibility();
    const mphOnly = {
      possible: window.isStabilizationPossibleForCurrentData(),
      disabled: stab ? stab.disabled : null,
    };
    return { withPrediction, mphOnly };
  });
  expect(result.withPrediction.cm).toBeGreaterThan(160);
  expect(result.withPrediction.mph).toBe(152);
  expect(result.withPrediction.possible).toBe(true);
  expect(result.withPrediction.disabled).toBe(false);
  expect(result.mphOnly.possible).toBe(false);
  expect(result.mphOnly.disabled).toBe(true);
});

// ── Język zaleceń energetycznych: spójny rejestr wg adresata (2026-08-12) ──
// „Dla pacjenta": dorosły/rodzic — konsekwentne „Proszę…"; nastolatek —
// konsekwentna forma „ty" (bez „Proszę + bezokolicznik"). „Standardowy"
// nastolatka wyrównany do neutralnego zapisu klinicznego (decyzja właściciela).

async function genEnergyText(page, { age, sex, w, h, pf }) {
  return page.evaluate(({ age, sex, w, h, pf }) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
    window.professionalMode = true;
    const dl = document.getElementById('dietLevel');
    if (dl && !Array.from(dl.options).some((o) => o.value === 'moderate')) {
      const opt = document.createElement('option'); opt.value = 'moderate'; dl.appendChild(opt);
    }
    set('age', age); set('ageMonths', 0); set('sex', sex);
    set('weight', w); set('height', h);
    if (dl) dl.value = 'moderate';
    flag('reduceToggle', true); flag('stabilizationToggle', false); flag('growthEndedFlag', false);
    flag('vitDSuppFlag', true); flag('hydrationFlag', true);
    flag('journeyFlag', true); flag('nutritionNormsFlag', true);
    flag('patientFacingToggle', pf);
    return window.generateDietRecommendations().textOutput;
  }, { age, sex, w, h, pf });
}

test('DIET-LANG-TEEN: nastolatek — pacjent per „ty", standard neutralnie klinicznie', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithDietModule(page);
  const pac = await genEnergyText(page, { age: 14, sex: 'M', w: 75, h: 165, pf: true });
  // Tryb pacjencki: bez formalnego „Proszę + bezokolicznik", konsekwentne „ty":
  expect(pac).not.toMatch(/Proszę (jeść|planować|pamiętać)/u);
  expect(pac).toContain('Jedz regularnie');
  expect(pac).toContain('Twoja obecna masa ciała');
  expect(pac).toContain('Pamiętaj o regularnym piciu wody');
  const std = await genEnergyText(page, { age: 14, sex: 'M', w: 75, h: 165, pf: false });
  // Standard: zero form „ty", neutralny zapis kliniczny:
  expect(std).not.toMatch(/\bTwoj|\bmusisz\b|\bPostaraj\b|\bStaraj\b|\bporozmawiaj\b|zajmie Ci/u);
  expect(std).toContain('Obecna masa ciała wynosi');
  expect(std).toContain('Wskazana jest aktywność fizyczna');
  expect(std).toContain('wskazana jest konsultacja z dietetykiem lub psychologiem dziecięcym');
});

test('DIET-LANG-ADULT: dorosły pacjent — gramatyka klasy BMI i plan bez kancelaryzmów', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithDietModule(page);
  const pac = await genEnergyText(page, { age: 35, sex: 'M', w: 105, h: 175, pf: true });
  expect(pac).toContain('co oznacza otyłość');
  expect(pac).not.toContain('co odpowiada otyłość');
  expect(pac).toContain('Proponowany plan zakłada');
  expect(pac).not.toContain('W proponowanym planie przyjęto');
});

test('DIET-LANG-ARTIFACTS: bez „miesiąca/miesięcy", minutowej precyzji spalania i „uzyskujemy"', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithDietModule(page);
  const std = await genEnergyText(page, { age: 14, sex: 'M', w: 75, h: 165, pf: false });
  expect(std).not.toContain('miesiąca/miesięcy');
  expect(std).toMatch(/ok\. \d+,\d miesiąca|ok\. \d+ miesięcy/u);
  // Godzinowe totale spalania usunięte w całości (patrz DIET-ACT-ACCELERATOR):
  expect(std).not.toMatch(/\d+ h \d+ min/u);
  expect(std).not.toMatch(/około \d{2,} godzin/u);
  const childPac = await genEnergyText(page, { age: 8, sex: 'F', w: 45, h: 130, pf: true });
  expect(childPac).not.toContain('uzyskujemy');
  expect(childPac).toContain('Taki plan daje deficyt');
});

// ── Ruch jako akcelerator + spójność wzrost/redukcja (2026-08-12, decyzje właściciela) ──

// DIET-ACT-ACCELERATOR: zamiast zniechęcających totali („Rower – około 207 godzin"
// spalania całego nadmiaru bez diety) dokument pokazuje ruch jako akcelerator
// szacunku dietetycznego: kcal realnej sesji + krótszy czas dojścia do normy.
test('DIET-ACT-ACCELERATOR: ruch skraca szacunek dietetyczny zamiast strasznych totali', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithDietModule(page);
  const text = await genEnergyText(page, { age: 14, sex: 'M', w: 75, h: 165, pf: false });
  // Totale i mecze zniknęły:
  expect(text).not.toMatch(/około \d{2,} godzin/u);
  expect(text).not.toContain('meczów');
  expect(text).not.toContain('spalenie całego nadmiaru');
  // Akcelerator: sesja z kcal i krótszy czas:
  const m = text.match(/szacować na około (\d+) tygodni.*po 45 minut tygodniowo \(ok\. (\d+) kcal każda\) skracają szacowany czas do około (\d+) tygodni/su);
  expect(m).not.toBeNull();
  const weeksDiet = Number(m[1]);
  const sessionKcal = Number(m[2]);
  const weeksWithActivity = Number(m[3]);
  expect(weeksWithActivity).toBeLessThan(weeksDiet);
  // Kcal sesji z wzoru MET (rower 6, 45 min, masa 75 kg): 6×3,5×75/200×45 ≈ 354
  expect(Math.abs(sessionKcal - 354)).toBeLessThanOrEqual(1);
});

// DIET-GROWTH-STRATEGY-TEXT: tekst wzrostowy zależy od strategii — w redukcji
// bez „masa ma rosnąć minimalnie/pozostać zbliżona" (sprzeczność z planem
// −0,6 kg/tydz.), w stabilizacji klasyczne brzmienie zostaje.
test('DIET-GROWTH-STRATEGY-TEXT: bez sprzeczności utrzymuj-vs-redukuj', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithDietModule(page);
  const red = await genEnergyText(page, { age: 14, sex: 'M', w: 75, h: 165, pf: false });
  expect(red).not.toMatch(/rosła w tym czasie minimalnie|rosła jak najwolniej|pozostała zbliżona do obecnej/u);
  expect(red).toContain('przyspiesza wychodzenie z');
  const stab = await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
    const flag = (id, on) => { const el = document.getElementById(id); if (el) el.checked = on; };
    window.professionalMode = true;
    set('age', 14); set('ageMonths', 0); set('sex', 'M');
    set('weight', 75); set('height', 165);
    flag('reduceToggle', false); flag('stabilizationToggle', true); flag('growthEndedFlag', false);
    flag('patientFacingToggle', false);
    return window.generateDietRecommendations().textOutput;
  });
  expect(stab).toContain('rosła w tym czasie minimalnie');
});

// DIET-ACT-UNISEX: listy aktywności bez podziału wg płci — dziewczynka i chłopiec
// dostają ten sam zestaw przykładów (z tańcem włącznie).
test('DIET-ACT-UNISEX: wspólne listy aktywności dla obu płci', async ({ page }) => {
  test.setTimeout(120_000);
  await openWithDietModule(page);
  const boy = await genEnergyText(page, { age: 14, sex: 'M', w: 75, h: 165, pf: false });
  expect(boy).toContain('taniec');
  expect(boy).not.toContain('piłka nożna');
  const boyActivityLines = boy.split('\n').filter((l) => l.includes('taniec')).map((l) => l.replace(/^\d+\. /, ''));
  const girl = await genEnergyText(page, { age: 14, sex: 'F', w: 75, h: 165, pf: false });
  for (const line of boyActivityLines.filter((l) => l.startsWith('Wskazana jest aktywność'))) {
    expect(girl).toContain(line);
  }
});
