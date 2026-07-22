# Zasady wprowadzania zmian

Ten dokument określa proces pracy właściciela, współpracowników i agentów nad Vilda. To aplikacja medyczna, dlatego proces jest bardziej rygorystyczny niż w typowej stronie internetowej.

Do czasu zatwierdzenia licencji projektu oraz zasad prawnych dla wkładu zewnętrznego publiczne pull requesty od osób trzecich nie są przyjmowane do scalenia. Można zgłaszać błędy i propozycje przez formularze Issues, bez danych pacjenta. Nieoczekiwany PR może zostać zamknięty bez wykorzystania jego kodu.

## Zanim utworzysz zgłoszenie

- Nie publikuj danych pacjentów, eksportów `.wiw`, zrzutów prawdziwej sesji ani sekretów.
- Do odtworzenia problemu użyj jednoznacznie fikcyjnych danych.
- Podatność bezpieczeństwa zgłoś prywatnie według `SECURITY.md`.
- Błąd wzoru, progu, dawki, jednostki lub interpretacji zgłoś formularzem zmiany medycznej.

## Gałęzie i pull requesty

1. Zaktualizuj lokalny `audyt` i utwórz od niego gałąź.
2. Nazwij ją krótko, np. `agent/fix-homa-rounding` albo `agent/docs-clinical-registry`.
3. Ogranicz PR do jednego celu. Nie łącz refaktoryzacji, nowej funkcji i zmiany klinicznej bez wyraźnej potrzeby.
4. Kieruj PR do `audyt`, nigdy do historycznego `main`.
5. Domyślnie otwieraj PR jako draft. Scalenie i wdrożenie należą do właściciela.

Zalecane prefiksy tytułu lub commita:

- `fix:` — naprawa błędu;
- `feat:` — nowa funkcja;
- `refactor:` — zmiana struktury bez zmiany zachowania;
- `clinical:` — zamierzona zmiana wyniku lub interpretacji medycznej;
- `test:` — testy i infrastruktura jakości;
- `docs:` — dokumentacja;
- `chore:` — utrzymanie zależności i narzędzi;
- `security:` — poprawa bezpieczeństwa bez ujawniania podatności w tytule.

## Dane testowe

Dozwolone są wyłącznie dane syntetyczne, które nie pochodzą od rzeczywistego pacjenta. Używaj nazw typu „Anna Testowa”, dat i wyników utworzonych na potrzeby testu oraz minimalnego zakresu pól.

Nie wystarczy zasłonięcie imienia na zrzucie. Metadane, adres strony, storage, logi, nazwa pliku i pozostałe pola również mogą identyfikować osobę. Zasady szczegółowe: `docs/DATA_PROTECTION.md`.

## Zmiana kliniczna

Za kliniczną uznaje się zmianę wzoru, stałej, danych referencyjnych, dawki, progu, jednostki, zaokrąglenia, populacji, zakresu wieku lub płci, ostrzeżenia albo interpretacji.

PR kliniczny musi zawierać:

- opis zachowania przed i po zmianie;
- populację i zakres zastosowania;
- pełne źródło: autor/instytucja, tytuł, rok, wersja wytycznych oraz DOI/PMID/URL, jeśli istnieje;
- informację o pochodzeniu i prawie użycia tabel lub danych;
- jednostki, precyzję i regułę zaokrąglania;
- co najmniej jeden przypadek typowy i graniczny w formie `wejście → oczekiwany wynik`;
- test rzeczywistej funkcji produkcyjnej;
- aktualizację `docs/clinical/ALGORITHMS.md`;
- akceptację kliniczną właściciela.

Nie kopiuj wzoru do testu jako drugiej implementacji. Oczekiwany wynik powinien być niezależnie wyliczoną, zatwierdzoną stałą regresyjną.

## Refaktoryzacja

Refaktoryzacja nie może zmieniać:

- wartości ani prezentacji wyniku mającej znaczenie kliniczne;
- formatu zapisu i eksportu;
- autosave, synchronizacji lub przywracania danych;
- publicznych interfejsów `window.Vilda…`;
- kolejności wymaganych efektów ubocznych skryptów.

W szczególności rozdzielone warstwy modelu wejściowego, obliczeń, UI, runtime i montowania DOM dla „Szacowanego spożycia energii” powinny pozostać rozdzielone.

## PWA i pliki wdrożeniowe

Po zmianie zasobu ładowanego przez stronę:

- sprawdź wszystkie odwołania `?v=`;
- przeanalizuj wpływ na `SW_VERSION` i listę cache;
- nie usuwaj historycznych, wersjonowanych adresów z cache bez planu migracji;
- uruchom test instalacji, aktualizacji i pracy offline;
- sprawdź widok mobilny bez poziomego przewijania.

Jeżeli dostępny jest czytelny plik źródłowy i generowany artefakt, zmieniaj źródło i odtwórz artefakt kontrolowanym procesem. Nie poprawiaj tylko zminifikowanej kopii.

## Testy

Minimalny zestaw przed PR:

```bash
npm ci
npm test
npx playwright install chromium
npm run test:e2e
```

Szczegóły znajdują się w `TESTING.md`. W opisie PR podaj rzeczywisty wynik oraz przyczynę pominięcia testu, jeżeli nie dotyczy danej zmiany.

Nie akceptujemy:

- zmniejszenia oczekiwanej liczby asercji bez uzasadnionej zmiany zakresu;
- skopiowania błędnego zachowania do testu;
- rozszerzenia baseline ESLint zamiast naprawy nowego błędu;
- wyłączenia testu albo alarmu bezpieczeństwa tylko po to, by uzyskać zielone CI.

## Aktualizacje zależności

PR-y Dependabota nie są scalane automatycznie. Nawet aktualizacja narzędzia deweloperskiego musi przejść pełne CI. Aktualizacje major wymagają osobnego przeglądu zmian niezgodnych wstecz.

## Gotowość do scalenia

PR jest gotowy, gdy:

- zakres i wpływ kliniczny są jednoznacznie opisane;
- nie zawiera danych pacjenta ani sekretów;
- dokumentacja i testy odpowiadają zmianie;
- wymagane kontrole GitHub Actions są zielone;
- właściciel zatwierdził część kliniczną oraz decyzję o scaleniu.
