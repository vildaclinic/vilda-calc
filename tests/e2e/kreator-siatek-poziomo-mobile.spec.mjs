import { expect, test } from '@playwright/test';
import { otworzKreator, otworzStrone, palczewskaPro, punktEkranu } from '../support/siatka-poziomo.mjs';

// P-KREATOR-POZIOM na telefonie (projekt mobile-chromium): strona A4 poziomo ma 3508 px szerokości,
// więc podgląd startuje z aktywnym wykresem na całą szerokość, zmiana zakładki przesuwa na drugą
// połowę strony, a „Dopasuj” pokazuje całą stronę. Bez poziomego przewijania ekranu. Dane FIKCYJNE.
test.use({ serviceWorkers: 'block' });

/** Stan podglądu: przewijanie ekranu, widoczny fragment strony (px strony) i kolumny obu wykresów. */
async function widok(page) {
  return page.evaluate(() => {
    const root = document.getElementById('vilda-pub-creator-overlay');
    const [baza, nakladka] = [...root.querySelectorAll('canvas')].filter((c) => c.offsetParent !== null);
    const okno = nakladka.closest('div[style*="overflow"]');
    const r = nakladka.getBoundingClientRect();
    const o = okno.getBoundingClientRect();
    const k = nakladka.width / r.width;
    const g = window.VildaPublicationCreator._geomStoreL;
    return {
      przewijanie: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
      pasek: root.firstElementChild.nextElementSibling.getBoundingClientRect().right - window.innerWidth,
      zoom: root.innerText.match(/\d+%/)[0],
      widac: { od: (o.left - r.left) * k, do: (o.right - r.left) * k },
      bazaW: baza.getBoundingClientRect().width,
      oknoW: okno.clientWidth,
      wzrost: (g.height.clip.x + g.height.clip.w / 2),
      waga: (g.weight.clip.x + g.weight.clip.w / 2),
    };
  });
}

test('telefon: Kreator strony poziomej — aktywny wykres na całą szerokość, zakładka przesuwa podgląd, bez poziomego przewijania', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzStrone(page);
  await palczewskaPro(page);
  await otworzKreator(page);
  const ui = page.locator('#vilda-pub-creator-overlay');

  let v = await widok(page);
  expect(v.przewijanie, 'brak poziomego przewijania ekranu').toBeLessThanOrEqual(0);
  expect(v.pasek, 'pasek narzędzi z przełącznikiem „Układ” mieści się na ekranie').toBeLessThanOrEqual(0);
  expect(v.zoom).toBe('200%');
  expect(v.widac.od).toBeLessThan(v.wzrost);
  expect(v.widac.do).toBeGreaterThan(v.wzrost);
  expect(v.widac.do, 'kolumna wagi poza widokiem').toBeLessThan(v.waga);
  await expect(ui.getByRole('button', { name: 'poziom', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await ui.getByRole('tab', { name: 'Masa ciała' }).click();
  v = await widok(page);
  expect(v.przewijanie).toBeLessThanOrEqual(0);
  expect(v.widac.od).toBeLessThan(v.waga);
  expect(v.widac.do).toBeGreaterThan(v.waga);
  expect(v.widac.od, 'kolumna wzrostu poza widokiem').toBeGreaterThan(v.wzrost);

  await ui.getByRole('button', { name: 'Dopasuj' }).click();
  v = await widok(page);
  expect(v.zoom).toBe('100%');
  expect(v.bazaW, 'cała strona w szerokości podglądu').toBeLessThanOrEqual(v.oknoW);
  expect(v.przewijanie).toBeLessThanOrEqual(0);

  // Dotyk w punkt drugiego wykresu (wzrost, 5. r.ż.) przełącza zakładkę i otwiera edytor tego punktu.
  const punkt = await page.evaluate(() => {
    const g = window.VildaPublicationCreator._geomStoreL.height;
    return { x: g.plotX + (60 - 12) * (g.plotW / 204), y: g.plotY + g.plotH - (110.8 - g.minY) * (g.plotH / (g.maxY - g.minY)) };
  });
  const ekran = await punktEkranu(page, punkt.x, punkt.y);
  await page.touchscreen.tap(ekran.x, ekran.y);
  await expect(ui.getByRole('tab', { name: 'Wzrost' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Treść komentarza')).toBeVisible();
  expect(await page.evaluate(() => Boolean(window.chartCreatorData.growth.shared.a60))).toBe(true);
});
