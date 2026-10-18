import { expect, test } from '../support/test-czas.mjs';
import { otworzBadania, otworzSejf, sekcjaBadan, zapiszHistorie } from '../support/lab-historia-dane.mjs';

// LAB-HISTORIA PR2: zakładka „Badania” na telefonie (projekt mobile-chromium, iPhone) i na najwęższym ekranie 320 px.
// Decyzja 6.17: zakładki w siatce 2 + 2 + 1 (piąta na całą szerokość), domyślny widok „Tabela”; strona nie przewija
// się w poziomie, przewija się tylko tabela. Dane wyłącznie fikcyjne (tests/support/lab-historia-dane.mjs).
test.use({ serviceWorkers: 'block' });

async function sprawdzUklad(page) {
  const patientId = await otworzSejf(page);
  await zapiszHistorie(page, patientId);
  await otworzBadania(page, patientId);
  const badania = sekcjaBadan(page);
  await expect(badania.locator('.vilda-lab-hist-segment-btn[aria-pressed="true"]')).toHaveText('Tabela');
  await expect(badania.locator('table.vilda-lab-hist-table')).toHaveCount(3);
  await expect(badania.locator('.vilda-lab-hist-card')).toHaveCount(0);

  const uklad = await page.evaluate(() => {
    const tabs = [...document.querySelectorAll('.vilda-patient-tabs > .vilda-patient-tab')];
    const r = tabs.map((t) => t.getBoundingClientRect());
    const wiersze = [...new Set(r.map((b) => Math.round(b.top)))].map((top) => r.filter((b) => Math.round(b.top) === top).length);
    const przewijanie = document.querySelector('.vilda-lab-hist-table-scroll');
    const data = document.querySelector('.vilda-lab-hist-table tbody th');
    przewijanie.scrollLeft = 400;
    const poPrzewinieciu = data.getBoundingClientRect().left - przewijanie.getBoundingClientRect().left;
    const strona = document.scrollingElement;
    const karta = document.querySelector('.vilda-auth-root');
    return {
      wiersze,
      // Piąta zakładka zajmuje obie kolumny siatki: od lewej krawędzi pierwszej do prawej drugiej.
      piataNaCalaSzerokosc: Math.abs(r[4].left - r[0].left) <= 4 && Math.abs(r[4].right - r[1].right) <= 4, // aktywna zakładka może być lekko powiększona
      stronaBezPoziomego: strona.scrollWidth <= strona.clientWidth + 1 && karta.scrollWidth <= karta.clientWidth + 1,
      tabelaPrzewijaSieWBok: przewijanie.scrollWidth > przewijanie.clientWidth,
      dataPrzyklejona: Math.abs(poPrzewinieciu) <= 1,
      najmniejszyCelDotyku: Math.min(...[...document.querySelectorAll('.vilda-lab-hist-segment-btn, .vilda-lab-hist-chip, .vilda-lab-hist-actions > *')]
        .map((el) => el.getBoundingClientRect().height)),
    };
  });
  expect(uklad).toMatchObject({ wiersze: [2, 2, 1], piataNaCalaSzerokosc: true, stronaBezPoziomego: true, tabelaPrzewijaSieWBok: true, dataPrzyklejona: true });
  expect(uklad.najmniejszyCelDotyku).toBeGreaterThanOrEqual(44);

  // Wykresy dalej są do wyboru; strona nadal bez przewijania w poziomie.
  await badania.locator('.vilda-lab-hist-segment-btn', { hasText: 'Wykresy' }).click();
  await expect(badania.locator('.vilda-lab-hist-card[data-series="tsh"] svg.vilda-lab-trend-chart')).toHaveCount(1);
  expect(await page.evaluate(() => {
    const strona = document.scrollingElement, karta = document.querySelector('.vilda-auth-root');
    return strona.scrollWidth <= strona.clientWidth + 1 && karta.scrollWidth <= karta.clientWidth + 1;
  })).toBe(true);
}

test('telefon: zakładki 2 + 2 + 1, domyślnie Tabela, przewija się tylko tabela', async ({ page }) => {
  await sprawdzUklad(page);
});

test('320 × 760: ten sam układ bez poziomego przewijania strony', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await sprawdzUklad(page);
});
