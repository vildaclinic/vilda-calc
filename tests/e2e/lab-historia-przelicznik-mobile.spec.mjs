import { expect, test } from '../support/test-czas.mjs';
import { otworzPrzelicznik, pasekHistorii } from '../support/lab-historia-dane.mjs';

// LAB-HISTORIA PR3: pasek „Poprzednie wyniki” w przeliczniku na telefonie (projekt mobile-chromium, iPhone) i na 320 px.
// Plan 3.3: chipy w dwóch kolumnach, „teraz” na całą szerokość, wykres na całą szerokość paska, na osi dat najwyżej
// trzy etykiety bez nakładania, cele dotyku ≥ 44 px i brak poziomego przewijania strony. Dane wyłącznie fikcyjne.
test.use({ serviceWorkers: 'block' });

async function sprawdzPasek(page) {
  await otworzPrzelicznik(page, { wartosc: '' });
  await page.locator('#labUnit').selectOption('mIU/L');
  await page.locator('#labValue').fill('0,38');
  const pasek = pasekHistorii(page);
  await expect(pasek).toHaveClass(/is-on/);
  await expect(pasek.locator('svg.lab-strip-svg')).toHaveCount(1);
  const uklad = await page.evaluate(() => {
    const strip = document.getElementById('labHistoryStrip');
    const chipy = [...strip.querySelectorAll('button.lab-strip-chip[data-note-id]')].map((c) => c.getBoundingClientRect());
    const kolumny = [...new Set(chipy.map((r) => Math.round(r.left)))].length;
    const teraz = strip.querySelector('.lab-strip-now').getBoundingClientRect();
    const rzad = strip.querySelector('.lab-strip-chips').getBoundingClientRect();
    const svg = strip.querySelector('svg.lab-strip-svg');
    const wykres = svg.getBoundingClientRect();
    const daty = [...svg.querySelectorAll('text.lab-strip-date, text.lab-strip-now-label')].map((t) => t.getBoundingClientRect())
      .sort((a, b) => a.left - b.left);
    const nakladanie = daty.some((r, i) => i > 0 && r.left < daty[i - 1].right);
    const strona = document.scrollingElement;
    const podpis = svg.querySelector('text.lab-strip-val');
    return {
      kolumny,
      terazNaCalaSzerokosc: Math.abs(teraz.width - rzad.width) <= 1,
      wykresNaCalaSzerokosc: Math.abs(wykres.width - (strip.clientWidth - 28)) <= 2,
      etykietDat: svg.querySelectorAll('text.lab-strip-date').length,
      nakladanie,
      stronaBezPoziomego: strona.scrollWidth <= strona.clientWidth + 1,
      najmniejszyCel: Math.min(...[...strip.querySelectorAll('button.lab-strip-chip')].map((b) => b.getBoundingClientRect().height)),
      // Wysokość podpisu wartości na ekranie (px): czytelna także na 320 px.
      podpisPx: podpis.getBoundingClientRect().height,
    };
  });
  expect(uklad).toMatchObject({ kolumny: 2, terazNaCalaSzerokosc: true, wykresNaCalaSzerokosc: true, nakladanie: false, stronaBezPoziomego: true });
  expect(uklad.etykietDat).toBeGreaterThanOrEqual(1);
  expect(uklad.etykietDat).toBeLessThanOrEqual(3);
  expect(uklad.najmniejszyCel).toBeGreaterThanOrEqual(44);
  expect(uklad.podpisPx).toBeGreaterThanOrEqual(9);
  await expect(pasek.locator('svg text', { hasText: /[↑↓]/ })).toHaveCount(0);
}

test('telefon: pasek w dwóch kolumnach, wykres czytelny, bez poziomego przewijania', async ({ page }) => {
  await sprawdzPasek(page);
});

test('320 px: ten sam układ na najwęższym ekranie', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await sprawdzPasek(page);
});
