import { expect, test } from '../support/test-czas.mjs';
import { otworzPowloke, pacjentNaStart } from '../support/powloka-przewiniecie.mjs';
import { karta, powrotZeSpozyciem } from '../support/spozycie-powrot.mjs';

// P-SPOZYCIE-POWROT (polecenie właściciela 2026-10-13): karta „Szacowane spożycie energii” po powrocie do panelu
// Start nie gubi wiersza historii w żadnej widocznej klatce. Zmierzone przed zmianą (Chromium, prawdziwa powłoka,
// desktop 1440×1000): pierwsza klatka po Start → DocPro → Start bez wiersza historii, #intakeMeasurements niższe
// o 143 px; dopiero krok końcowy odtworzenia (setTimeout(0)) dorabiał wiersz. Telefon:
// spozycie-powrot-powloka-mobile.spec.mjs. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SpozyciePowrot!26';

test('powrót na Start: karta szacowanego spożycia ma wiersz historii w każdej widocznej klatce, od pierwszej', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page, HASLO);
  await pacjentNaStart(start);
  const { przed } = await powrotZeSpozyciem(page, start, 'desktop');
  // Po powrocie karta jest taka, jak ją zostawiono — krok końcowy niczego nie dokłada ani nie zabiera.
  expect(await karta(start), 'karta po powrocie jak przed wyjściem').toEqual(przed);
});
