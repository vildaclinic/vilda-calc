// P-USUN-KONTO-KARTY (E2-PR3a1c) — „Usuń konto” a inne karty w pełnej aplikacji, prawdziwy Chromium: karta odświeżona
// albo wczytana od nowa po usunięciu konta w innej karcie pokazuje od razu ekran logowania bez tego konta z banerem
// „Konto zostało usunięte z tej przeglądarki.” (przy każdym odświeżeniu, także w aplikacji zainstalowanej; bez banera po
// wylogowaniu, bezczynności, wygaśnięciu sesji istniejącego konta i po własnym „Usuń konto”; start po odświeżeniu bez
// czyszczenia stanu aplikacji i bez błędów strony); listy kont w kartach bez sesji („Kto się loguje?”, „Witamy”)
// odświeżają się same bez usuniętego konta, z banerem, a formularz hasła innego konta i karta zalogowana na usuwane konto
// bez zmian; gdy kasowanie bazy sejfu czeka na inną kartę (karta ze starszą wersją aplikacji albo okno pytania —
// podpowiedź po 1 s), pod przyciskiem „Usuń to konto” jest podpowiedź „Czekam, aż inne karty z aplikacją zwolnią to
// konto. …” (role="status"), przycisk jest wyłączony, przeglądarka pyta przed zamknięciem albo przeładowaniem strony, a w
// aplikacji zainstalowanej pasek z tym tekstem jest na wierzchu nad ekranem logowania; po błędzie usuwania podpowiedź
// znika, a przeglądarka już nie pyta przed zamknięciem strony; usuwanie przerwane zamknięciem strony kończy się przy
// liście kont w następnej karcie. Wyrocznia baz: pełna lista baz przeglądarki po „Usuń konto” — tylko bazy wspólne
// (opis w module). Konto bez biblioteki szablonów. Scenariusze, literały, rejestrator ekranów logowania, obsługa okien
// przeglądarki według typu i własny serwer plików repozytorium (port przydzielany przez system, start w teście,
// zamknięcie w finally) w tests/support/usun-konto-karty-chromium.mjs. Dane wyłącznie fikcyjne.
import { expect, test } from '@playwright/test';
import { SCENARIUSZE_PA_2, startSerwer } from '../support/usun-konto-karty-chromium.mjs';

const OPISY = {
  PA4: 'karta zalogowana na usuwane konto, odświeżona po banerze (jedno konto; dwa konta i dwa odświeżenia) — za każdym razem od razu ekran logowania bez tego konta z banerem, znacznik karty; start bez czyszczenia stanu aplikacji i bez błędów strony',
  PA5: 'karta zalogowana na usuwane konto wraca z innej strony po usunięciu (jedno konto; dwa konta) — ekran logowania bez tego konta z banerem, bez klucza sesji, znacznik karty',
  PA6: 'aplikacja zainstalowana odświeżona po usunięciu konta w innej karcie i po własnym „Usuń konto” — powłoka z banerem, jeden widoczny baner, trasa zostaje',
  PA7: 'bez banera po odświeżeniu: blokada manual, bezczynność, wygasła sesja istniejącego konta, własne „Usuń konto” w zwykłej karcie Ustawień; każdy start bez czyszczenia stanu aplikacji i bez błędów strony',
  PA8: 'karta bez sesji na „Kto się loguje?” odświeża listę bez usuniętego konta z banerem; formularz hasła innego konta bez zmian (wartość, fokus); karta zalogowana na usuwane konto rysuje ekran logowania raz',
  PA9: 'jedyne konto usunięte — karta bez sesji „Witamy” z banerem; powłoka bez sesji — lista bez usuniętego konta, jeden widoczny baner',
  PA10: 'kasowanie bazy sejfu czeka na kartę ze starszą wersją — podpowiedź czekania, przycisk wyłączony, pytanie przy zamknięciu i przeładowaniu strony; po zwolnieniu index.html bez pytania; pełna lista baz po usunięciu konta — tylko bazy wspólne',
  PA10b: 'błąd usuwania w trakcie czekania — komunikat błędu, podpowiedź pusta, przycisk włączony, zamknięcie strony bez pytania przeglądarki',
  PA11: 'okno pytania w innej karcie — podpowiedź czekania po 1 s; po odpowiedzi usuwanie kończy się, druga karta „Witamy” z banerem',
  PA12: 'aplikacja zainstalowana, kasowanie czeka — pasek czekania na wierzchu nad „Witamy” z banerem, pytanie przy zamknięciu okna; po zwolnieniu pasek pusty; przeładowanie ramki Ustawień w trakcie czyści pasek',
  PA13: 'strona usuwająca zamknięta w trakcie czekania — przerwane usuwanie kończy się przy liście kont w następnej karcie (lista bez konta od razu); pełna lista baz po usunięciu konta — tylko bazy wspólne',
};

test.describe('Sejf: „Usuń konto” a inne karty — karta odświeżona, lista kont w kartach bez sesji, czekanie kasowania', () => {
  for (const [nazwa, scenariusz, oczekiwane] of SCENARIUSZE_PA_2) {
    test(`${nazwa}: ${OPISY[nazwa]}`, async ({ context }) => {
      test.setTimeout(180_000);
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
