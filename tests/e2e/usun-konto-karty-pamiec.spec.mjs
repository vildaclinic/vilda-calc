// P-USUN-KONTO-KARTY (E2-PR3a1c) — „Usuń konto” a karta przywracana z pamięci przeglądarki (pamięć stron Chromium
// włączona: przeglądarka bez domyślnego argumentu Playwrighta --disable-back-forward-cache, serwer z nagłówkiem
// Cache-Control: max-age=600; opcje uruchomienia przeglądarki są na poziomie workera, więc osobny plik). Kontrola: karta
// zalogowana wraca z innej strony z pamięci stron (pageshow.persisted). Po usunięciu konta w innej karcie karta
// zalogowana na to konto wraca do ekranu logowania bez tego konta z banerem „Konto zostało usunięte z tej przeglądarki.”
// i znacznikiem karty, a karta bez sesji — do listy kont bez usuniętego konta; zdarzenie pageshow, baner karty bez sesji
// i powody pominięcia pamięci stron — pomiary. Scenariusze, literały i własny serwer plików repozytorium w
// tests/support/usun-konto-karty-chromium.mjs. Dane wyłącznie fikcyjne.
import { expect, test } from '@playwright/test';
import konfiguracja from '../../playwright.config.mjs';
import { ARGUMENTY_PAMIECI, SCENARIUSZE_PA_PAMIEC, SERWER_PAMIECI, startSerwer } from '../support/usun-konto-karty-chromium.mjs';

test.use({ launchOptions: { ...(konfiguracja.use?.launchOptions || {}), ...ARGUMENTY_PAMIECI } });

const OPISY = {
  'PA14 (a)': 'kontrola — karta zalogowana wraca z innej strony z pamięci stron',
  'PA14 (b)': 'karta zalogowana na usuwane konto wraca po usunięciu — ekran logowania bez tego konta z banerem, znacznik karty, bez klucza sesji',
  'PA14 (c)': 'karta bez sesji na „Kto się loguje?” wraca po usunięciu — lista kont bez usuniętego konta',
};

test.describe('Sejf: „Usuń konto” a karta z pamięci przeglądarki', () => {
  for (const [nazwa, scenariusz, oczekiwane] of SCENARIUSZE_PA_PAMIEC) {
    test(`${nazwa}: ${OPISY[nazwa]}`, async ({ context }) => {
      test.setTimeout(120_000);
      const serwer = await startSerwer(undefined, SERWER_PAMIECI);
      try {
        const { pomiary, ...wynik } = await scenariusz(context, serwer.adres);
        if (pomiary) test.info().annotations.push({ type: 'pomiary', description: JSON.stringify(pomiary) });
        expect(wynik).toEqual(oczekiwane);
      } finally {
        await serwer.zamknij();
      }
    });
  }
});
