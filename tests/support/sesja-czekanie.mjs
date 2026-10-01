/**
 * Bramka na startowe odtworzenie sesji karty — dla testów, które zaraz po otwarciu strony
 * wczytują pacjenta (`applyLoadedData`) i zmieniają pola.
 *
 * DLACZEGO TO JEST OSOBNY MODUŁ. `vilda_data_import_export.js` przy starcie strony odtwarza
 * sesję karty z `sessionStorage` (`restoreMainSessionIfAny`, w VildaInit jako
 * `app:main-session-restore-init`). Rejestracja wykonuje się przy DOMContentLoaded, ale samo
 * odtworzenie czeka jeszcze DWIE klatki animacji (`requestAnimationFrame` ×2) i dopiero wtedy
 * woła `applyLoadedData` z migawką sesji. Test, który w tym oknie wczyta pacjenta i zmieni pole,
 * dostaje potem migawkę na wierzch — wyczyszczone pole wraca do wartości sprzed zmiany.
 *
 * Zegar testowy (`test-czas.mjs`: `page.clock.install` + `resume`) podmienia także
 * `requestAnimationFrame`. Pod obciążeniem CPU jego klatki przychodzą na tyle późno, że
 * odtworzenie ląduje PO wczytaniu pacjenta przez test. Zmierzone (P-BRAMKI-5, 2026-09-30,
 * `docpro-dziedziczy-pokwitanie.spec.mjs`): z zegarem testowym odtworzenie przyszło po
 * wyczyszczeniu pola w 4 z 24 przebiegów, w 2 z nich przed odczytem testu (czerwony test); stos
 * zapisu `requestAnimationFrame` → `restoreMainSessionIfAny` → `applyLoadedData`. Bez zegara
 * 0 z 24.
 *
 * Bramka: (1) rejestracja odtworzenia już się wykonała, (2) potem dwie klatki animacji zlecone
 * przez test. Przeglądarka wykonuje wywołania `requestAnimationFrame` w kolejności zlecenia,
 * więc druga klatka bramki nie przychodzi wcześniej niż druga klatka odtworzenia. Predykat jest
 * SYNCHRONICZNY (tests/unit/straznik-bramek-testowych.test.mjs); `page.evaluate` na `Promise`
 * czeka poprawnie.
 *
 * Bramka nie zmienia stanu aplikacji i nie zastępuje asercji.
 */

const DOMYSLNY_TIMEOUT = 15000;

/** Czeka, aż startowe odtworzenie sesji karty ma się już za sobą. Stawiać przed wczytaniem pacjenta. */
export async function czekajNaOdtworzenieSesji(page, opcje = {}) {
  try {
    await page.waitForFunction(
      () => Boolean(window.VildaInit && typeof window.VildaInit.isInitialized === 'function'
        && window.VildaInit.isInitialized('app:main-session-restore-init')),
      null,
      { timeout: opcje.timeout || DOMYSLNY_TIMEOUT },
    );
  } catch (blad) {
    blad.message = `bramka sesji (rejestracja odtworzenia sesji karty): ${blad.message}`;
    throw blad;
  }
  await page.evaluate(() => new Promise((gotowe) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => gotowe()));
  }));
}
