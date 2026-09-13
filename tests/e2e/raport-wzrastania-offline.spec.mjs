import { expect, test } from '@playwright/test';

// ADV-REPORT-6, etap 6 naprawy Raportu wzrastania. Sprawdza to, czego audyt nie mógł
// sprawdzić z kodu: czy raport naprawdę powstaje BEZ SIECI. Wcześniej pdfMake był
// ładowany wyłącznie z cdnjs w chwili kliknięcia — aplikacja jest PWA, a raportu offline
// nie dało się wygenerować wcale. Test odcina cdnjs na poziomie przeglądarki i wymaga,
// żeby biblioteka i tak się załadowała. Dane wyłącznie FIKCYJNE.

test('ADV-REPORT-6: pdfMake ładuje się przy odciętym CDN i składa PDF z polskimi znakami', async ({ page }) => {
  test.setTimeout(180_000);

  const cdnProby = [];
  await page.route('https://cdnjs.cloudflare.com/**', (route) => {
    cdnProby.push(route.request().url());
    return route.abort();
  });

  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.VildaAdvancedGrowth);

  const out = await page.evaluate(async () => {
    const api = window.VildaAdvancedGrowth;
    const ok = await api.advGrowthEnsurePdfMake();
    const gotowe = !!(window.pdfMake && typeof window.pdfMake.createPdf === 'function');
    const czcionki = gotowe && window.pdfMake.vfs ? Object.keys(window.pdfMake.vfs).length : 0;
    // Prawdziwy dowód: dokument z polskimi znakami musi się złożyć do bajtów.
    let bajty = 0;
    if (gotowe) {
      bajty = await new Promise((resolve) => {
        try {
          window.pdfMake
            .createPdf({ content: [{ text: 'Wzrost ostateczny — zaświadczenie, ćwierć, łóżko' }] })
            .getBuffer((b) => resolve(b ? b.length : 0));
        } catch { resolve(0); }
      });
    }
    return { ok, gotowe, czcionki, bajty };
  });

  expect(out.ok).toBe(true);
  expect(out.gotowe).toBe(true);
  // vfs musi nieść kroje Roboto — bez nich polskie znaki wyszłyby jako puste pola.
  expect(out.czcionki).toBeGreaterThan(0);
  expect(out.bajty).toBeGreaterThan(1000);
  // I najważniejsze: przy sprawnym pliku lokalnym CDN nie jest w ogóle odpytywany.
  expect(cdnProby).toEqual([]);
});
