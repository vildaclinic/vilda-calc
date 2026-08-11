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
  await page.addScriptTag({ url: '/vilda_diet_recommendations.js?v=11' });
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
  await page.addScriptTag({ url: '/vilda_patient_report.js?v=6' });
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
  await page.addScriptTag({ url: '/vilda_patient_report.js?v=6' });
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
});
