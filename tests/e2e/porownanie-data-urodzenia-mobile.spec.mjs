import { expect, test } from '../support/test-czas.mjs';
import { kartaPoWczytaniu, sprawdzKarte } from '../support/porownanie-data-urodzenia.mjs';

// P-POROWNANIE-DATA na widoku telefonu (projekt mobile-chromium): centyl wzrostu „Poprzednio” z wieku dokładnego
// od pierwszej klatki, także gdy odczyt z sejfu wyprzedza wpis daty urodzenia. Desktop:
// porownanie-data-urodzenia.spec.mjs. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PorownanieDataMobile!26';

test('telefon, wyścig wymuszony: „Poprzednio” z wieku dokładnego w każdej klatce, od pierwszej', async ({ page }) => {
  test.setTimeout(150_000);
  sprawdzKarte(await kartaPoWczytaniu(page, HASLO, { wymusWyscig: true }), 'telefon');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'bez poziomego przewijania').toBe(true);
});
