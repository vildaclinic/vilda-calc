import { expect, test } from '../support/test-czas.mjs';

// P-NOTATKI rata 2 (G19, audyt „Dodaj notatkę do wizyty" 2026-09-18).
//
// Na telefonie pasek boczny jest ukryty (`display:none`), a menu żyje w szufladzie. Przycisk
// „Dodaj notatkę do wizyty" w szufladzie wyglądał na aktywny niezależnie od bramki, a klik:
//   1) zamykał szufladę,
//   2) klikał ukryty przycisk paska,
//   3) przez co dymek odmowy rodził się na prostokącie 0×0 — w lewym górnym rogu ekranu,
//      oderwany od tego, czego lekarz dotknął.
// Teraz szuflada lustruje `aria-disabled`/`data-tip` i sama pokazuje dymek, bez zamykania.

const HASLO = 'E2e#Szuflada!2026';
const PRZYCISK = '[data-drawer-btn="addVisitNoteBtnSidebar"]';

async function otworzSzuflade(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch { /* brak storage — pomiń */ }
  });
  await page.route('**/*', (route) => {
    const u = route.request().url();
    return (u.startsWith('http://127.0.0.1:') || u.startsWith('data:') || u.startsWith('blob:'))
      ? route.continue() : route.abort();
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.waitForFunction(() => window.VildaVault.isUnlocked());
  // Po założeniu konta panel logowania zasłania nagłówek — przeładowanie oddaje stronę
  // w stanie, w jakim widzi ją lekarz po odblokowaniu sejfu.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await expect(page.locator('#vilda-auth-ui-root .vilda-auth-brand')).toHaveCount(0);
  // Bramka musi zdążyć przeliczyć stan „zalogowany, bez pacjenta".
  await expect
    .poll(async () => page.evaluate(() => {
      const b = document.getElementById('addVisitNoteBtnSidebar');
      return b ? b.getAttribute('data-tip') : null;
    }), { timeout: 15000 })
    .toContain('Pacjenci');
  await page.click('[data-vilda-chrome-menu-btn]');
  await expect(page.locator('[data-vilda-chrome-drawer]')).toHaveAttribute('aria-hidden', 'false');
}

test('G19 — szuflada lustruje stan przycisku i nie gubi dymka', async ({ page }) => {
  await otworzSzuflade(page);

  const przycisk = page.locator(PRZYCISK);
  await expect(przycisk).toBeVisible();
  // Lustrzenie: szuflada wie, że przycisk jest wyłączony, i zna powód.
  await expect(przycisk).toHaveAttribute('aria-disabled', 'true');
  await expect(przycisk).toHaveAttribute('data-tip', /Pacjenci/);

  // Playwright traktuje `aria-disabled="true"` jak wyłączony i domyślnie odmawia kliknięcia —
  // palec na telefonie takiej wymówki nie ma, więc wymuszamy dotknięcie.
  await przycisk.click({ force: true });

  // Szuflada zostaje otwarta — nie znika spod palca razem z odpowiedzią.
  await expect(page.locator('[data-vilda-chrome-drawer]')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('.vilda-patient-note-editor-overlay')).toHaveCount(0);

  // Dymek stoi przy przycisku, a nie w rogu ekranu.
  const dymek = page.locator('.menu-tooltip, .vilda-tip').first();
  await expect(dymek).toBeVisible();
  const [pudloDymka, pudloPrzycisku] = await Promise.all([
    dymek.boundingBox(),
    przycisk.boundingBox(),
  ]);
  const srodekDymka = pudloDymka.y + pudloDymka.height / 2;
  const srodekPrzycisku = pudloPrzycisku.y + pudloPrzycisku.height / 2;
  expect(Math.abs(srodekDymka - srodekPrzycisku),
    `dymek ${Math.round(srodekDymka)} px, przycisk ${Math.round(srodekPrzycisku)} px`).toBeLessThan(60);
});
