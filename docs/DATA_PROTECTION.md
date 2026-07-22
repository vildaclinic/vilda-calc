# Ochrona danych w pracy nad repozytorium

Ten dokument dotyczy kodu, testów, Issues, pull requestów i artefaktów CI. Nie zastępuje polityki prywatności aplikacji ani procedur organizacyjnych Vilda Clinic.

## Zasada podstawowa

Publiczne repozytorium nie jest miejscem przechowywania dokumentacji pacjenta. Do prac programistycznych używamy wyłącznie danych syntetycznych i minimalnego zakresu informacji potrzebnego do odtworzenia zachowania.

## Materiały dozwolone

- kod i konfiguracja pozbawione sekretów;
- publicznie dostępne źródła medyczne opisane bibliograficznie;
- fikcyjne dane testowe stworzone na potrzeby danego scenariusza;
- wyniki testów, które nie pochodzą z prawdziwej sesji użytkownika;
- zrzuty interfejsu wypełnionego wyłącznie danymi syntetycznymi;
- pliki referencyjne, których pochodzenie i prawo wykorzystania są udokumentowane.

## Materiały zakazane

- imię, nazwisko, PESEL, adres, dane kontaktowe lub identyfikator pacjenta;
- pełna data urodzenia połączona z informacją kliniczną;
- wyniki badań, rozpoznania, terapia, pomiary albo notatki rzeczywistej osoby;
- eksport `.wiw`, backup JSON, zrzut bazy lub plik wygenerowany z konta użytkownika;
- zrzuty IndexedDB, `localStorage`, `sessionStorage`, logi i trace prawdziwej sesji;
- niezredagowane screenshoty, nagrania i raporty Playwright z prawdziwymi danymi;
- `.env`, `.dev.vars`, tokeny API, hasła, klucze prywatne i dane dostępowe;
- `node_modules`, `.wrangler`, cache, archiwa robocze i kopie całych katalogów;
- pliki zdjęć lub dokumentów z niepotrzebnymi metadanymi autora, urządzenia albo lokalizacji.

## Dane syntetyczne

Dane syntetyczne:

1. nie mogą być przepisane z dokumentacji rzeczywistego pacjenta;
2. powinny być jednoznacznie oznaczone, np. „Anna Testowa”;
3. powinny zawierać tylko pola wymagane przez scenariusz;
4. nie powinny używać prawdziwego numeru PESEL, adresu ani danych kontaktowych;
5. muszą być bezpieczne także po opublikowaniu logu, screenshotu lub raportu testowego.

Zastąpienie nazwiska inicjałami albo wizualne zamazanie fragmentu ekranu nie zawsze jest anonimizacją. Plik może nadal zawierać dane w metadanych, warstwie tekstowej, nazwie, adresie URL lub załączonym stanie aplikacji.

## Przed commitem lub zgłoszeniem

- uruchom `npm run test:repo`;
- sprawdź listę plików przez `git status` i diff;
- otwórz każdy nowy obraz, dokument, arkusz i archiwum;
- sprawdź metadane pliku;
- upewnij się, że raport testowy powstał w lokalnym, syntetycznym środowisku;
- nie polegaj wyłącznie na `.gitignore` — plik można dodać z wymuszeniem lub przez interfejs WWW.

Automatyczny skan wykrywa tylko wybrane formaty. Nie potrafi rozstrzygnąć, czy zwykłe imię, data albo wynik należą do prawdziwej osoby.

## Przypadkowe ujawnienie

1. Nie kopiuj danych dalej i nie dodawaj ich do kolejnego komentarza.
2. Jeżeli ujawniono sekret, natychmiast go unieważnij lub obróć.
3. Jeżeli ujawniono dane pacjenta, potraktuj zdarzenie jako incydent i skontaktuj się z właścicielem projektu.
4. Sam kolejny commit usuwający plik nie oczyszcza historii Git.
5. Oczyszczenie historii i ocenę dalszych obowiązków wykonuje się osobną, kontrolowaną procedurą.

## Testy przeglądarkowe

Testy Playwright uruchamiają lokalny serwer i dane syntetyczne. Nie kieruj automatycznych testów do zalogowanej produkcyjnej sesji. Raporty, screenshoty, trace i filmy z niepowodzeń traktuj jak potencjalnie wrażliwe do czasu ich sprawdzenia.

## Dokumentacja wewnętrzna

Publiczne repozytorium powinno zawierać tylko informacje potrzebne użytkownikom, recenzentom i procesowi jakości. Szczegółowe plany bezpieczeństwa, materiały biznesowe, kopie robocze, źródłowe wytyczne i instrukcje infrastruktury należy docelowo utrzymywać w kontrolowanym prywatnym repozytorium źródłowym.
