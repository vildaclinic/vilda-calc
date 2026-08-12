import { expect, test } from '@playwright/test';

// Testy regresyjne etapu 1 naprawy karty „Droga do normy BMI":
//  - klasyfikacja pediatryczna działa od urodzenia (dotąd dzieci < 3 mies.
//    dostawały progi dorosłych i fałszywą „niedowagę"),
//  - dzieci < 2 lat z BMI > 85. centyla nie dostają liczbowej recepty
//    redukcyjnej („Musisz zredukować… kcal"), tylko komunikat o utrzymaniu
//    masy przy dalszym wzroście + konsultację,
//  - dzieci 2–5 lat: liczby pozostają, ale jako „nadwyżka względem 85.
//    centyla" ze zdaniem o spowolnieniu przyrostu, bez trybu rozkazującego,
//  - dopisek „Do 50 centyla BMI brakuje…" pomijany < 2 lat,
//  - starsze dzieci i dorośli — bez zmian (tryb redukcyjny z tabelą).
// Testy uruchamiają PRAWDZIWĄ ścieżkę produkcyjną window.update() na
// index.html i czytają wyrenderowaną kartę (AGENTS.md §3.5). Dane FIKCYJNE.

async function renderToNorm(page, { age, months, sex, weight, height }) {
  return page.evaluate(({ age, months, sex, weight, height }) => {
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = String(v);
    };
    set('age', age);
    set('ageMonths', months);
    set('sex', sex);
    set('weight', weight);
    set('height', height);
    window.update();
    const card = document.getElementById('toNormCard');
    const info = document.getElementById('toNormInfo');
    return {
      visible: !!card && card.style.display !== 'none',
      text: info ? info.textContent.replace(/\s+/g, ' ').trim() : '',
    };
  }, { age, months, sex, weight, height });
}

async function openIndex(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.update === 'function');
}

test('TONORM-S1-INFANT-NORMAL: 2 mies., BMI prawidłowe → „w normie", bez fałszywej niedowagi', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderToNorm(page, { age: 0, months: 2, sex: 'M', weight: 5.5, height: 58 });
  expect(out.visible).toBe(true);
  expect(out.text).toContain('w normie');
  expect(out.text.toLowerCase()).not.toContain('niedowag');
  expect(out.text).not.toContain('Do 50 centyla');
});

test('TONORM-S1-INFANT-HIGH: 7 mies., BMI > 85c → utrzymanie masy zamiast recepty redukcyjnej', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderToNorm(page, { age: 0, months: 7, sex: 'M', weight: 11.5, height: 70 });
  expect(out.visible).toBe(true);
  expect(out.text).not.toContain('Musisz zredukować');
  expect(out.text).not.toContain('kcal');
  expect(out.text).not.toContain('Do 50 centyla');
  expect(out.text).toContain('nie zaleca się redukcji masy ciała');
  expect(out.text).toContain('utrzymanie obecnej masy');
  expect(out.text).toContain('konsultacji');
  // Informacja o medianie masy dla wzrostu zostaje.
  expect(out.text).toContain('50 centyl BMI');
});

test('TONORM-S1-INFANT-UNDER: niemowlę z BMI < 5c → komunikat niedowagi ścieżką pediatryczną', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderToNorm(page, { age: 0, months: 6, sex: 'M', weight: 5.8, height: 68 });
  expect(out.visible).toBe(true);
  expect(out.text.toLowerCase()).toContain('niedowag');
  expect(out.text).toContain('konsultacji');
  expect(out.text).not.toContain('Musisz zredukować');
});

test('TONORM-S1-TODDLER-2-5-HIGH: 3 lata, BMI > 85c → „nadwyżka" i spowolnienie przyrostu, bez rozkazu i tabeli', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderToNorm(page, { age: 3, months: 0, sex: 'F', weight: 20, height: 95 });
  expect(out.visible).toBe(true);
  expect(out.text).toContain('Nadwyżka masy względem górnej granicy normy');
  expect(out.text).toContain('kcal');
  expect(out.text).toContain('spowolnienie przyrostu masy');
  expect(out.text).toContain('Nadwyżka względem 50. centyla BMI');
  expect(out.text).not.toContain('Musisz zredukować');
  expect(out.text).not.toContain('Dystans / Czas do normy');
  expect(out.text).toContain('konsultacji');
});

test('TONORM-S1-OLDER-JOURNEY: 13 lat i dorosły — panel „Droga do normy 2.0" zamiast recepty', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const teen = await renderToNorm(page, { age: 13, months: 0, sex: 'M', weight: 58, height: 158 });
  expect(teen.visible).toBe(true);
  expect(teen.text).toContain('Twój cel:');
  expect(teen.text).toContain('85. centyl dla wieku');
  expect(teen.text).not.toContain('Musisz zredukować');
  // Stara tabela MET dostępna pod zwijanym „dla dociekliwych".
  expect(teen.text).toContain('Pełna tabela aktywności');
  expect(teen.text).toContain('Dystans / Czas do normy');
  const adult = await renderToNorm(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  expect(adult.visible).toBe(true);
  expect(adult.text).toContain('Twój cel:');
  expect(adult.text).toContain('Start: 95,0 kg');
  expect(adult.text).not.toContain('Musisz zredukować');
});

test('TONORM-S2-ADULT-UNDER: dorosły z niedowagą dostaje komunikat i brakujące kg do 18,5', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderToNorm(page, { age: 30, months: 0, sex: 'F', weight: 45, height: 170 });
  expect(out.visible).toBe(true);
  expect(out.text.toLowerCase()).toContain('niedowag');
  // 18,5 × 1,70² = 53,465 kg → brakuje ok. 8,5 kg.
  expect(out.text).toContain('Brakuje ok.');
  expect(out.text).toContain('8,5');
  expect(out.text).not.toContain('Musisz zredukować');
});

test('TONORM-S2-ADULT-NEAR-LIMIT: BMI 24,9–25 → komunikat o górnej granicy zamiast „redukcji 0,1 kg"', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  // 79,1 kg / 178 cm → BMI 24,97 (powyżej celu 24,9, poniżej progu nadwagi 25).
  const out = await renderToNorm(page, { age: 30, months: 0, sex: 'M', weight: 79.1, height: 178 });
  expect(out.visible).toBe(true);
  expect(out.text).not.toContain('Musisz zredukować');
  expect(out.text).toContain('zbliża się do jej górnej granicy');
  // Od progu nadwagi (BMI ≥ 25) redukcja wraca.
  const over = await renderToNorm(page, { age: 30, months: 0, sex: 'M', weight: 80, height: 178 });
  expect(over.text).toContain('Twój cel:');
  expect(over.text).toContain('do górnej granicy normy BMI');
});

test('TONORM-S2-TEEN-18-UNDER: 18-latek z niskim BMI oceniany centylem, nie progiem dorosłych', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  // 18 lat, BMI 18,2 — u dorosłych „niedowaga", ale centylowo w normie (> 5c).
  const out = await renderToNorm(page, { age: 18, months: 0, sex: 'M', weight: 57.7, height: 178 });
  expect(out.visible).toBe(true);
  expect(out.text.toLowerCase()).not.toContain('niedowag');
});

test('TONORM-S3-SEVERE-LABEL: „Otyłość olbrzymia" (z ≥ +3) dopiero od 5. roku życia', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await page.evaluate(() => {
    const pick = (months, sex) => {
      // Znajdź BMI z z-score >= 3 dla danego wieku (produkcyjny bmiZscore).
      let bmi = 20;
      while (bmi < 45 && Number(window.bmiZscore(bmi, sex, months)) < 3.05) bmi += 0.5;
      return { bmi, z: Number(window.bmiZscore(bmi, sex, months)), cat: window.bmiCategoryChild(bmi, sex, months) };
    };
    return {
      infant7m: pick(7, 'M'),
      preschool59m: pick(59, 'F'),
      school72m: pick(72, 'M'),
      // Przy 13 latach z-score OLAF LMS saturuje się poniżej 3 (L < 0),
      // więc bramkę testujemy wprost na produkcyjnym resolverze.
      resolver59: window.vildaResolvePediatricBmiCategoryFromPercentile(99, { useOlaf: true, zScore: 3.2, ageMonths: 59 }),
      resolver60: window.vildaResolvePediatricBmiCategoryFromPercentile(99, { useOlaf: true, zScore: 3.2, ageMonths: 60 }),
      resolverNoAge: window.vildaResolvePediatricBmiCategoryFromPercentile(99, { useOlaf: true, zScore: 3.2 }),
    };
  });
  expect(out.infant7m.z).toBeGreaterThanOrEqual(3);
  expect(out.infant7m.cat).toBe('Otyłość');
  expect(out.preschool59m.cat).toBe('Otyłość');
  expect(out.school72m.cat).toBe('Otyłość olbrzymia');
  expect(out.resolver59).toBe('Otyłość');
  expect(out.resolver60).toBe('Otyłość olbrzymia');
  // Bez podanego wieku resolver zachowuje dotychczasowe działanie.
  expect(out.resolverNoAge).toBe('Otyłość olbrzymia');
});

test('TONORM-J-ADULT-PANEL: panel dieta+ruch dla dorosłego — cel, diety z silnika planu, Razem, termin', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderToNorm(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  expect(out.text).toContain('Twój cel:');
  expect(out.text).toContain('−16,1 kg');
  expect(out.text).toContain('Start: 95,0 kg · Cel: 78,9 kg');
  expect(out.text).toContain('Połącz z planem diety');
  // Deficyty diet liczone produkcyjnym silnikiem Planu odchudzania.
  expect(out.text).toContain('lekka −');
  expect(out.text).toContain('umiarkowana −');
  expect(out.text).toContain('intensywna −');
  expect(out.text).toContain('Razem');
  expect(out.text).toContain('kg / mies.');
  expect(out.text).toMatch(/osiągniesz normę BMI (w|we) .+ \(za ok\. .+miesi/);
});

test('TONORM-J-INTERACTIONS: chipy budują tabelę, toggle wyłącza dietę, wybór diety się przełącza', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await renderToNorm(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
  const txt = () => page.evaluate(() => document.getElementById('bmiJourneyMount').textContent.replace(/\s+/g, ' ').trim());
  await click('.bmi-journey-chip[data-key="bike"]');
  let t = await txt();
  expect(t).toContain('Rower 2 × 45 min');
  expect(t).toContain('Dzięki ruchowi o');
  await click('[data-journey="toggle"]');
  t = await txt();
  expect(t).not.toContain('Dieta (jak w planie odchudzania)');
  expect(t).toContain('Włącz plan diety');
  await click('[data-journey="toggle"]');
  await click('.bmi-journey-chip[data-key="intense"]');
  t = await txt();
  expect(t).toContain('Dieta intensywna');
  expect(t).not.toContain('Dieta umiarkowana ≈');
});

test('TONORM-J-CHILD: 13-latek — cel 85. centyla, domyślna dieta lekka, minima dziecięce', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const out = await renderToNorm(page, { age: 13, months: 0, sex: 'M', weight: 58, height: 158 });
  expect(out.text).toContain('85. centyl dla wieku');
  expect(out.text).toContain('Dieta lekka');
  expect(out.text).toMatch(/osiągniesz normę BMI/);
});

test('TONORM-J-PERSIST: wybór aktywności przeżywa kolejne przeliczenia karty', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  await renderToNorm(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  await page.evaluate(() => document.querySelector('.bmi-journey-chip[data-key="swim"]').click());
  // Kolejny update() (np. zmiana masy) nie może zgubić wyboru.
  const out = await renderToNorm(page, { age: 40, months: 0, sex: 'M', weight: 94, height: 178 });
  expect(out.text).toContain('Basen 1 × 45 min');
});
