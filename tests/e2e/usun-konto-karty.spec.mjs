// P-USUN-KONTO-KARTY (E2-PR3a1b) — „Usuń konto” w pełnej aplikacji: druga karta z tym samym kontem (index.html, powłoka
// app.html) wraca do ekranu logowania z banerem „Konto zostało usunięte z tej przeglądarki.” (role="status", przed
// tytułem) i jest zablokowana; karta usuwająca kończy bez czekania i bez banera; w aplikacji zainstalowanej (jedno okno
// app.html#/ustawienia) po własnym „Usuń konto” wpis rejestru znika, ramka Ustawień ładuje się od nowa, trasa zostaje,
// a powłoka pokazuje „Witamy” z banerem; przy dwóch kontach „Kto się loguje?” z banerem tylko z drugim kontem, pamięć
// PRO usuniętego konta unieważniona raz, logowanie w toku w trzeciej karcie kończy się komunikatem odmowy w formularzu
// (bez banera), blokady manual i idle — bez banera. Wyrocznia baz: bazy przeglądarki przed i po „Usuń konto” (opis
// w module). Konto bez biblioteki szablonów. Scenariusze, literały i własny serwer plików repozytorium (port
// przydzielany przez system, start w teście, zamknięcie w finally) w tests/support/usun-konto-karty-chromium.mjs. Dane
// wyłącznie fikcyjne.
import { expect, test } from '@playwright/test';
import { SCENARIUSZE_PA, startSerwer } from '../support/usun-konto-karty-chromium.mjs';

const OPISY = {
  PA1: 'dwie karty index.html i ustawienia.html — karta B „Witamy” z banerem, zablokowana; karta usuwająca „Witamy” bez banera; po „Usuń konto” bez bazy sejfu i bazy kolejki konta',
  'PA1′': 'karta B = app.html#/start — powłoka „Witamy” z banerem, trasa zostaje',
  PA2: 'jedno okno app.html#/ustawienia — wpis rejestru usunięty, ramka Ustawień od nowa (_r=), trasa zostaje, powłoka „Witamy” z banerem',
  PA3: 'dwa konta, logowanie w toku w trzeciej karcie — „Kto się loguje?” z banerem i drugim kontem, pamięć PRO raz, formularz z komunikatem odmowy; manual i idle bez banera',
};

test.describe('Sejf: „Usuń konto” przy drugiej karcie i w aplikacji zainstalowanej', () => {
  for (const [nazwa, scenariusz, oczekiwane] of SCENARIUSZE_PA) {
    test(`${nazwa}: ${OPISY[nazwa]}`, async ({ context }) => {
      test.setTimeout(120_000);
      const serwer = await startSerwer();
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
