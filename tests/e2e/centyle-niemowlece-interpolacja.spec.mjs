import { expect, test } from '@playwright/test';

// DOB-AGE-4 — na PRAWDZIWEJ stronie: wpisana data urodzenia zmienia centyl niemowlęcia.
//
// Test jednostkowy (tests/unit/centyle-niemowlece-interpolacja.test.mjs) mierzy samą regułę,
// podstawiając atrapę modułu daty urodzenia. Tutaj sprawdzamy to, czego tamten nie może:
// że `getChildLMS` w app.js naprawdę sięga po `VildaDobAge.readExactAge()`, a moduł naprawdę
// czyta pole `#dobInput` — czyli że oba końce są zlutowane.
//
// Formularz jest zasłonięty bramką logowania (`html.vilda-auth-locked` chowa całe body),
// a sejfa nie wolno odblokowywać (AGENTS.md §4), więc sterujemy polami przez DOM.
// Dane FIKCYJNE; data urodzenia liczona od dnia uruchomienia testu, żeby nie starzała się
// z kalendarzem.

async function otworz(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(
    () => Boolean(window.VildaDobAge) && typeof window.getChildLMS === 'function'
      && typeof window.calcPercentileStats === 'function'
  );
}

/* Data urodzenia dziecka, które DZIŚ jest w `dni` dobie życia, w formacie dd.mm.rrrr. */
function dataUrodzeniaPrzedDniami(page, dni) {
  return page.evaluate((d) => {
    const dzis = new Date();
    const ur = new Date(dzis.getFullYear(), dzis.getMonth(), dzis.getDate() - d);
    const dwa = (n) => String(n).padStart(2, '0');
    return `${dwa(ur.getDate())}.${dwa(ur.getMonth() + 1)}.${ur.getFullYear()}`;
  }, dni);
}

function wpisz(page, id, wartosc) {
  return page.evaluate(
    ({ id: i, wartosc: v }) => {
      const el = document.getElementById(i);
      if (!el) throw new Error('brak pola ' + i);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value;
    },
    { id, wartosc }
  );
}

/* Mediana WHO w danej dobie — interpolowana z dwóch sąsiednich wierszy, niezależnie od
   ścieżki, którą testujemy: pytamy o wiersze pełnych miesięcy, przy pustym polu daty. */
function medianaWDobie(page, dni) {
  return page.evaluate((d) => {
    const a = d / 30.4375;
    const lo = Math.floor(a);
    const dolny = window.getChildLMS('M', lo / 12, 'HT');
    const gorny = window.getChildLMS('M', (lo + 1) / 12, 'HT');
    return dolny[1] + (gorny[1] - dolny[1]) * (a - lo);
  }, dni);
}

function centyl(page, dlugosc, miesiace) {
  return page.evaluate(
    ({ h, m }) => {
      const r = window.calcPercentileStats(h, 'M', m / 12, 'HT');
      return r ? { percentile: r.percentile, sd: r.sd } : null;
    },
    { h: dlugosc, m: miesiace }
  );
}

test.describe('Data urodzenia zmienia centyl niemowlęcia', () => {
  test('29. doba: bez daty ~99. centyl, z datą ~50.', async ({ page }) => {
    await otworz(page);

    // Mediana liczona przy PUSTYM polu daty, więc getChildLMS idzie starą ścieżką.
    const mediana = await medianaWDobie(page, 29);
    expect(mediana).toBeGreaterThan(50);

    const bezDaty = await centyl(page, mediana, 0);
    expect(bezDaty.sd).toBeGreaterThan(1.5);
    expect(bezDaty.percentile).toBeGreaterThan(90);

    await wpisz(page, 'dobInput', await dataUrodzeniaPrzedDniami(page, 29));
    // Moduł sam wypełnia wiek — po dacie sprzed 29 dób to 0 lat 0 mies.
    await expect.poll(() => page.evaluate(() => document.getElementById('ageMonths').value))
      .toBe('0');

    const zDataUr = await centyl(page, mediana, 0);
    expect(Math.abs(zDataUr.sd)).toBeLessThan(0.1);
    expect(zDataUr.percentile).toBeGreaterThan(45);
    expect(zDataUr.percentile).toBeLessThan(55);
  });

  test('pomiar o innym wieku niż dzisiejszy nie dostaje dzisiejszego uściślenia', async ({ page }) => {
    await otworz(page);
    const przed = await page.evaluate(() => window.getChildLMS('M', 2 / 12, 'HT'));

    await wpisz(page, 'dobInput', await dataUrodzeniaPrzedDniami(page, 29));
    await expect.poll(() => page.evaluate(() => document.getElementById('ageMonths').value))
      .toBe('0');

    // Dziecko ma dziś 0 mies., więc zapytanie o 2 mies. dotyczy innego pomiaru.
    const po = await page.evaluate(() => window.getChildLMS('M', 2 / 12, 'HT'));
    expect(po).toEqual(przed);
  });

  test('wyczyszczenie daty przywraca zachowanie sprzed zmiany', async ({ page }) => {
    await otworz(page);
    const przed = await page.evaluate(() => window.getChildLMS('M', 0, 'HT'));

    await wpisz(page, 'dobInput', await dataUrodzeniaPrzedDniami(page, 29));
    const zDataUr = await page.evaluate(() => window.getChildLMS('M', 0, 'HT'));
    expect(zDataUr[1]).toBeGreaterThan(przed[1]);

    await page.evaluate(() => window.VildaDobAge.clear());
    const po = await page.evaluate(() => window.getChildLMS('M', 0, 'HT'));
    expect(po).toEqual(przed);
  });
});
