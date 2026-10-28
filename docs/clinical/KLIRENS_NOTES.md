# Wyniki Klirensu w Notatkach

Zatwierdzona 28.10.2026 zmiana prezentacji dotyczy wyłącznie notatek kategorii
`wynik-klirens`. Zwykłe obserwacje i notatki lekarza zachowują dotychczasowy widok
i edytor.

## Jeden pomiar, kilka widoków

Notatki, Badania i Historia wyników Klirensu czytają ten sam zapis o tym samym
identyfikatorze. `clcr_notes_view.js` korzysta z
`ClcrSavedResults.projectPatientNotes`, a ten z `ClcrSavedCalculation.readSaved`.
Nie przelicza dawnych próbek i nie dobiera dzisiejszych norm do historii.

Karta pokazuje datę badania, nazwę, zapisaną wartość wyświetlaną i jednostkę,
normę z dnia zapisu, zapisaną kategorię lub ocenę i interpretację. Zachowuje
utrwaloną informację o granicy przed zaokrągleniem oraz zastrzeżenia czytnika.
Norma ma neutralny kolor; kolor odchylenia dotyczy wyniku pacjenta. Przy
nieprawidłowym, zmienionym lub niedostępnym zapisie oceny karta pozostaje
neutralna i nie odtwarza domyślnej normy.
Utrwalone kryterium kliniczne ma etykietę „Próg przy zapisie” oraz „Ocena
kryterium”; nie jest opisywane jako norma zdrowej populacji.

Komentarz lekarza z sekcji `Komentarz lekarza:` jest osobną, czytelną częścią
karty. Ręcznie napisany tekst starszej notatki także pozostaje dostępny.
Techniczne drzewo oceny i koperta JSON są danymi przechowywania; nie trafiają do
treści karty, stanu ładowania ani komunikatu błędu. Wszystkie teksty są
wstawiane przez `textContent`.

## Zapis i edycja

Zmiana nie migruje notatek ani nie zapisuje nowych wersji przy ich odczycie.
Treść oryginalnego zapisu, w tym drzewo oceny i koperta obliczenia, pozostaje
niezmieniona. Wartość wyświetlana ma pierwszeństwo przed surową liczbą w tytule;
zmiana dotyczy prezentacji, nie reguły zaokrąglania zapisanej wartości.

Przycisk **Szczegóły obliczenia** otwiera istniejący `ClcrResultDetails`.
Edycja i usuwanie używają kanonicznego identyfikatora notatki, istniejących
transakcji oraz kontroli rewizji i konfliktów. Nie powstaje drugi pomiar.
Również publiczne wywołanie ogólnego edytora notatki kieruje ustrukturyzowany
wynik do szczegółów obliczenia, bez pola tekstowego z JSON.

Po edycji zawartość karty odświeża się bez odłączania otwartego okna szczegółów.
Lista notatek przebudowuje się po zamknięciu okna; usunięcie usuwa wpis od razu.
Zamknięcie karty pacjenta albo zablokowanie sejfu unieważnia opóźnione odczyty
i zamyka okno szczegółów.

## Ładowanie i odtwarzalność

`ClcrRecordResources.ensureNotes()` ładuje czytnik historii i widok notatek.
Silniki kliniczne i edytor są ładowane dopiero po jawnej akcji użytkownika.
Błąd zasobu daje neutralny komunikat z możliwością ponowienia; nigdy nie
przełącza karty na wyświetlanie surowego `body`.

Wąskie punkty podpięcia w zachowanym artefakcie `vilda_auth_ui.js` odtwarza
idempotentny `node tools/patch-klirens-notes-view.mjs`. Czytelny widok jest w
`clcr_notes_view.js` i `clcr_notes_view.css`. Hook zachowuje pozostałe ścieżki
notatek oraz przypomnienia.

Testy używają fikcyjnych pomiarów Ca i ACR, rzeczywistych funkcji produkcyjnych
oraz pamięciowego adaptera zapisu. Obejmują m.in. brak przeliczania historii,
komentarze lekarza, uszkodzony zapis, opóźnione ładowanie po blokadzie,
kanoniczną edycję i usuwanie oraz ekran 320/390 px. Nie odblokowują realnego
sejfu ani nie wykorzystują załączonych danych pacjentów.
