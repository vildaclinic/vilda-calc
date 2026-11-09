// P-USUN-KONTO-KARTY (E2-PR3a1b, E2-PR3a1c) — „Usuń konto” w pełnej aplikacji: druga karta z tym samym kontem
// (index.html, powłoka app.html) wraca do ekranu logowania z banerem „Konto zostało usunięte z tej przeglądarki.”
// (role="status", przed tytułem) i jest zablokowana; karta usuwająca kończy bez czekania, bez banera i bez pytania przed
// opuszczeniem strony; w aplikacji zainstalowanej (jedno okno app.html#/ustawienia) po własnym „Usuń konto” wpis
// rejestru znika, ramka Ustawień ładuje się od nowa, trasa zostaje, a powłoka pokazuje „Witamy” z banerem, bez
// podpowiedzi czekania; przy dwóch kontach „Kto się loguje?” z banerem tylko z drugim kontem, pamięć PRO usuniętego
// konta unieważniona raz, logowanie w toku w trzeciej karcie kończy się komunikatem odmowy w formularzu (bez banera),
// blokady manual i idle — bez banera, ustawienia kopii zapasowej usuniętego konta usunięte, drugiego konta bez zmian.
// Dziennik dostępu działa przez całą sesję także po przywróceniu sesji: po przeładowaniu z modułem dziennika wczytanym,
// gdy sejf jest już odblokowany (bazy dziennika nie ma), wpis odblokowania zakłada bazę i zdarzenia sesji są zapisane.
// Wyrocznia baz: pełna lista baz przeglądarki po „Usuń konto” — tylko bazy wspólne, żadna baza wspólna sprzed usunięcia
// nie znika (opis w module). Konto bez biblioteki szablonów. Scenariusze, literały i własny serwer plików repozytorium
// (port przydzielany przez system, start w teście, zamknięcie w finally) w tests/support/usun-konto-karty-chromium.mjs.
// Dane wyłącznie fikcyjne.
import { expect, test } from '@playwright/test';
import { OCZEKIWANE_DZIENNIK_PO_PRZYWROCENIU, SCENARIUSZE_PA, dziennikPoPrzywroceniu, startSerwer } from '../support/usun-konto-karty-chromium.mjs';

const OPISY = {
  PA1: 'dwie karty index.html i ustawienia.html — karta B „Witamy” z banerem, zablokowana; karta usuwająca „Witamy” bez banera i bez pytania przed opuszczeniem strony; pełna lista baz po usunięciu konta — tylko bazy wspólne',
  'PA1′': 'karta B = app.html#/start — powłoka „Witamy” z banerem, trasa zostaje; pełna lista baz po usunięciu konta — tylko bazy wspólne',
  PA2: 'jedno okno app.html#/ustawienia — wpis rejestru usunięty, ramka Ustawień od nowa (_r=), trasa zostaje, powłoka „Witamy” z banerem, bez podpowiedzi czekania; pełna lista baz po usunięciu konta — tylko bazy wspólne',
  PA3: 'dwa konta, logowanie w toku w trzeciej karcie — „Kto się loguje?” z banerem i drugim kontem, pamięć PRO raz, formularz z komunikatem odmowy; manual i idle bez banera; ustawienia kopii tego konta usunięte, drugiego konta bez zmian',
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

  test('dziennik dostępu po przywróceniu sesji: bazy dziennika nie ma, moduł dziennika wczytany, gdy sejf jest już odblokowany — wpis odblokowania zakłada bazę, jeden wpis odblokowania, zdarzenie sesji zapisane, dziennik spójny', async ({ context }) => {
    test.setTimeout(60_000);
    const serwer = await startSerwer();
    try {
      const { pomiary, ...wynik } = await dziennikPoPrzywroceniu(context, serwer.adres);
      test.info().annotations.push({ type: 'pomiary', description: JSON.stringify(pomiary) });
      expect(wynik).toEqual(OCZEKIWANE_DZIENNIK_PO_PRZYWROCENIU);
    } finally {
      await serwer.zamknij();
    }
  });
});
