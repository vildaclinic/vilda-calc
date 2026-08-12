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
  expect(out.text).not.toContain('Musisz zredukować');
  expect(out.text).not.toContain('Dystans / Czas do normy');
  expect(out.text).toContain('konsultacji');
});

test('TONORM-S1-OLDER-UNCHANGED: 13 lat i dorosły — tryb redukcyjny z tabelą bez regresji', async ({ page }) => {
  test.setTimeout(90_000);
  await openIndex(page);
  const teen = await renderToNorm(page, { age: 13, months: 0, sex: 'M', weight: 58, height: 158 });
  expect(teen.visible).toBe(true);
  expect(teen.text).toContain('Musisz zredukować');
  expect(teen.text).toContain('Dystans / Czas do normy');
  expect(teen.text).toContain('Do 50 centyla');
  const adult = await renderToNorm(page, { age: 40, months: 0, sex: 'M', weight: 95, height: 178 });
  expect(adult.visible).toBe(true);
  expect(adult.text).toContain('Musisz zredukować');
  expect(adult.text).toContain('Dystans / Czas do normy');
});
