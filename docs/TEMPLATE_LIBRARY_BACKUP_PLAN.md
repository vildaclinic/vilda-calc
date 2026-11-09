# P-WIW-TEMPLATE-LIBRARY — biblioteka szablonów w kopii `.wiw`

**Stan: zadanie przyszłe, niewdrożone.** Zapisane na wyraźne polecenie właściciela z 2026-11-09, podczas wdrażania importu i eksportu pojedynczego szablonu.

## Cel

Pełna zaszyfrowana kopia konta `.wiw` ma w przyszłości obejmować również bibliotekę własnych szablonów planów opieki. Lekarz ma móc odtworzyć kompletną bibliotekę razem z dokumentacją konta, zamiast osobno eksportować każdy szablon.

**Obecnie `.wiw` nie obejmuje tej biblioteki.** Import/eksport pojedynczego pliku `.vilda-template.json` nie realizuje tego zadania: przenosi bieżące opracowanie jednego szablonu, nie historię całego magazynu. Wycofanie publicznego importu/eksportu całej biblioteki nie oznacza ani usunięcia jej danych, ani dodania ich do `.wiw`.

## Wymagany zakres przyszłej kopii

- Wszystkie utrzymywane szablony: aktywne i zarchiwizowane, ich definicje, wersje treści, identyfikatory oraz operacje historii.
- Autorstwo, źródła, warunki udostępniania, pochodzenie i informacje o modyfikacjach w każdej zachowanej wersji.
- Nierozstrzygnięte konflikty i wszystkie ich utrzymane gałęzie; kopia nie rozstrzyga ich przez wybór późniejszej daty.
- Stan wymagany do poprawnego odtworzenia zapisów, ich zależności i bezpiecznych ponowień. Metadane synchronizacji muszą zostać rozpatrzone jawnie: odtworzenie nie może po prostu oznaczyć starej kolejki jako kolejki innego konta lub generacji.
- Zachowane, nieobsługiwane dane, jeżeli magazyn utrzymuje je dla przyszłego zgodnego czytnika. Nie wolno pomijać ich po cichu lub zastępować pustą biblioteką.

## Wymagania wdrożenia

1. Wersjonowany format i jawny manifest zakresu kopii; komunikat „pełna kopia” wyłącznie wtedy, gdy zapisano wszystkie wymagane domeny konta.
2. Spójny obraz biblioteki i dokumentacji oraz kontrola zmiany sesji podczas tworzenia kopii. Błąd odczytu biblioteki nie może kończyć się pozornie pełnym plikiem.
3. Zachowanie szyfrowania i powiązań tożsamości. Pełna kopia konta pozostaje dokumentem odzyskiwania konta, a nie plikiem przeznaczonym do przekazywania między lekarzami.
4. Pełna walidacja formatu, limitów, identyfikatorów, zależności i integralności przed zapisem; czytelne zachowanie po przerwaniu lub braku miejsca, bez częściowego udawanego sukcesu.
5. Obsługa „Odtwórz” i „Scal” oraz ich konfliktów, z zachowaniem historii i bez dublowania istniejących operacji. Ponowienie tego samego importu ma być bezpieczne.
6. Zgodność z dawnymi kopiami `.wiw` bez sekcji biblioteki: brak sekcji nie oznacza polecenia wyczyszczenia istniejących szablonów. Nieobsługiwana nowa sekcja wymaga jawnego komunikatu i zachowania danych.
7. Ponowne dołączenie odtworzonej biblioteki do synchronizacji zgodnie z jej tożsamością i generacją, bez nadpisania innych urządzeń pustym lub niepełnym stanem.
8. Ręczne i automatyczne kopie muszą deklarować i realizować ten sam zakres. UI Ustawień, dokumentacja oraz potwierdzenie udanej kopii muszą odpowiadać rzeczywistej zawartości pliku.

## Warunki odbioru

Testy na fikcyjnych kontach mają objąć pełny cykl: utworzenie i edycję szablonu, archiwizację, konflikt dwóch urządzeń, kopię `.wiw`, odtworzenie na czystym profilu oraz dalszy zapis i synchronizację. Po odtworzeniu mają zgadzać się utrzymane definicje, wersje, identyfikatory, autorstwo i warunki udostępniania.

Osobne przypadki obejmują scalenie kopii z istniejącą biblioteką, dwukrotny import, dawną `.wiw` bez biblioteki, nieznaną wersję, uszkodzony plik, przekroczenie limitu, brak miejsca, przerwanie i zmianę sesji. Potrzebny jest scenariusz rzeczywistego zimnego uruchomienia offline po odtworzeniu oraz sprawdzenie ręcznej i automatycznej kopii w przeglądarce.

Przed implementacją należy ustalić dokładny format, granice transakcji i reguły odzyskiwania. Sama obecność tej sekcji w dokumentacji nie upoważnia do nazywania bieżącej `.wiw` kopią biblioteki.

Powiązane: [transfer pojedynczego szablonu](CARE_TEMPLATE_TRANSFER.md), [biblioteka szablonów](CARE_PLAN_TEMPLATES.md), [użycie szablonu u pacjenta](CARE_TEMPLATE_APPLICATION.md).
