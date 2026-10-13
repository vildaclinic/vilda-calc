import { expect, test } from '../support/test-czas.mjs';
import { najdalej, otworzPowloke, pacjentNaStart, powrotNaStart } from '../support/powloka-przewiniecie.mjs';

// P-PANEL-PRZEWINIECIE na widoku telefonu (projekt mobile-chromium): panel powłoki wraca tam, gdzie go zostawiono.
// Zmierzone przed zmianą: ramka Start 513 → 0 po Start → DocPro → Start. Desktop, cel nawigacji i lista pacjentów:
// powloka-przewiniecie-panelu.spec.mjs. Dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#PanelPrzewinMobile!26';

test('telefon: powrót na Start stoi tam, gdzie go zostawiono, od pierwszej widocznej klatki — także pod przebudowaną kartą i na dole strony', async ({ page }) => {
  test.setTimeout(150_000);
  const start = await otworzPowloke(page, HASLO);
  await pacjentNaStart(start);
  // Pierwszy powrót po wpisaniu pacjenta zawsze odtwarza sesję w Start (Gp_p), a ta przebudowuje kartę szacowanego
  // spożycia: na czas odtworzenia bez wiersza historii (−252 px; od P-SPOZYCIE-POWROT wiersz wraca przed pierwszą
  // klatką). Okno tuż pod kartą: odtworzenie przewinięcia musi wyprzedzić tę przebudowę — ustawione po niej trafiało
  // w skrócony dokument i cały widok stał 252 px dalej, także po oknie powrotu.
  const podKarta = await start.evaluate(() => {
    const karta = document.getElementById('intakeSection').getBoundingClientRect();
    return Math.round(karta.bottom + window.scrollY + 40);
  });
  await powrotNaStart(page, start, podKarta, 'telefon, tuż pod kartą szacowanego spożycia');
  await powrotNaStart(page, start, 513, 'telefon, 513 px jak w pomiarze');
  // Odtworzenie przewija ramkę w dół; dock powłoki nie może przy tym zniknąć.
  await expect(page.locator('#mobileBottomDock')).toBeVisible();
  await expect(page.locator('#mobileBottomDock')).not.toHaveClass(/is-hidden/);
  expect(await start.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'bez poziomego przewijania').toBe(true);
  await powrotNaStart(page, start, await najdalej(start), 'telefon, sam dół strony');
});
