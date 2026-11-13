# Pakiety badań laboratoryjnych — plan i decyzje

Stan na 2026-11-12. Dokument utrwala ustalenia właściciela i etapy pracy, żeby kolejne PR-y i inne wątki
nie odtwarzały ich z rozmowy. Opis techniczny wdrożonych etapów: `docs/clinical/ALGORITHMS.md`, wpisy „LAB-PAKIETY”.

## Po co

Lekarz dostaje wydruk z kilkoma wynikami naraz (np. TSH, fT4, fT3). Dotąd każdy wynik trzeba było osobno
wybrać w przeliczniku, wpisać i przypiąć do wizyty. Pakiet pozwala wpisać wartości i jednostki z wydruku
w jednym miejscu, zobaczyć ocenę względem norm aplikacji i zapisać całość do Badań w karcie pacjenta.
Docelowo wyniki dodane w czasie wizyty mają też trafiać, z normami, do „Podsumowania wyników” (karta
i kopiowany tekst).

## Decyzje właściciela (2026-11-12)

1. Wejście główne: strona „Jednostki lab.” (tryb „Pakiet badań” obok „Pojedyncze badanie”), skrót
   z zakładki „Badania” karty pacjenta.
2. Podsumowanie wyników pokazuje wyniki dodane dziś dla tego pacjenta, z datą pobrania.
3. Pole „Norma z wydruku” (norma laboratorium zamiast normy aplikacji dla danego wyniku) — tak, jako
   **osobny PR**. Raz wpisane normy mają się **zapamiętywać** i przy następnym dodawaniu wyników od razu
   pojawiać w polach, z możliwością edycji.
4. Pakiety są dostępne **tylko dla zalogowanych użytkowników i dla wybranego pacjenta** (bez trybu gościa
   i bez ręcznego wpisywania wieku i płci).
5. Makieta (desktop, telefon, stany bez logowania i bez pacjenta) zaakceptowana 2026-11-12.

## Zasady, które obowiązują każdy etap

- Pakiet nie ma własnych norm, wzorów ani współczynników. Ocena i zakres pochodzą z silnika pojedynczego
  badania (`LabUnitConverter`, dane w `lab_units_data.js`); AGENTS.md § 3: normy zawsze jako dane.
- Wynik z pakietu jest zwykłą notatką „wynik-badania” w postaci zapisu „Przypnij do wizyty”. Zakładka
  „Badania”, historia i wykresy nie rozróżniają, skąd wynik przyszedł.
- Ekran pokazuje ocenę ze zrzutu normy, który zapisze się z wynikiem — nigdy osobno policzoną.
- Wyniki wpisane dla jednego pacjenta nie przechodzą na innego ani poza sesję.
- Budżet instalacji PWA (≤ 600 żądań) jest wyczerpany: PR1 zużył ostatnią wolną parę aliasów poza
  przykładem kontrolnym testu. Nowy plik w kolejnym etapie wymaga decyzji właściciela (podniesienie
  budżetu albo łączenie plików); rozszerzanie istniejących plików nie kosztuje żądań.

## Etapy

| Etap | Zakres | Stan |
|---|---|---|
| PR1 | Tryb „Pakiet badań”, pakiet „Tarczyca” (TSH, fT4, fT3): wartości i jednostki, data pobrania, komentarz, ocena na żywo, zapis zbiorczy do Badań, jednostki zapamiętane na urządzeniu, skrót z zakładki „Badania”, bramki bez logowania i bez pacjenta | ten PR |
| PR2 | „Normy z wydruku”: opcjonalne od–do dla każdego badania; wpisana norma zastępuje normę aplikacji dla tego wyniku, zapisuje się z nim i jest oznaczona jako norma laboratorium; raz wpisane normy są zapamiętywane i podpowiadane, z możliwością edycji | do zrobienia |
| PR3 | Blok „Badania” w „Podsumowaniu wyników” (karta i kopiowany tekst): wyniki dodane dziś dla pacjenta, z datą pobrania, normą i oceną z zapisu | do zrobienia |
| później | Pakiety definiowane przez użytkownika; pakiet „Pokwitanie” (LH, FSH, estradiol u dziewcząt, testosteron u chłopców) — wymaga silników pokwitaniowych przelicznika (osie wieku i stadium), patrz `docs/clinical/LAB_INTERPRETATION_AGENT_GUIDE.md` | pomysł, bez decyzji |

## Otwarte kwestie do decyzji przy kolejnych etapach

- PR2: gdzie pamiętać normy z wydruku — na urządzeniu (jak jednostki) czy na koncie (dostępne na każdym
  urządzeniu lekarza). Dotyczy tylko wygody podpowiadania; sam wynik zawsze niesie swoją normę w zapisie.
- PR2: zapis normy laboratorium w rekordzie wyniku (osobne pole obok zrzutu normy aplikacji albo zrzut
  z oznaczeniem źródła) — zmiana kształtu zapisu, wymaga osobnej analizy zgodności z historią.
- PR3: nowy kod w istniejących plikach podsumowania albo decyzja o budżecie żądań (wyżej).
- Wynik cenzorowany („<0,01”) w pakiecie — dziś nie jest liczbą, jak w pojedynczym badaniu.
