# Pakiety badań laboratoryjnych — plan i decyzje

Stan na 2026-11-13. Dokument utrwala ustalenia właściciela i etapy pracy, żeby kolejne PR-y i inne wątki
nie odtwarzały ich z rozmowy. Opis techniczny wdrożonych etapów: `docs/clinical/ALGORITHMS.md`, wpisy „LAB-PAKIETY”.

## Po co

Lekarz dostaje wydruk z kilkoma wynikami naraz (np. TSH, fT4, fT3). Dotąd każdy wynik trzeba było osobno
wybrać w przeliczniku, wpisać i przypiąć do wizyty. Pakiet pozwala wpisać wartości i jednostki z wydruku
w jednym miejscu, zobaczyć ocenę względem norm aplikacji i zapisać całość do Badań w karcie pacjenta.
Wyniki z oceną i normą można też od razu skopiować do dokumentacji przyciskiem przy pakiecie
(pierwotny zamiar bloku „Badania” w „Podsumowaniu wyników” został zastąpiony — punkt 8).

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

## Decyzje właściciela (2026-11-13)

6. Podpowiedź normy z wydruku pochodzi **wyłącznie z poprzedniego wyniku tego samego badania u tego
   samego pacjenta** („zwykle to samo laboratorium i zbliżony wiek”). Gdy pacjent nie ma wcześniejszego
   wyniku, aplikacja **nie podpowiada żadnych norm**. To zastępuje „zapamiętywanie” z punktu 3: norm nie
   pamięta ani urządzenie, ani konto — każdy wynik niesie swoją normę w zapisie i stamtąd wraca.
7. Wybór „Pojedyncze badanie / Pakiet badań” ma postać **zakładek** w stylu karty GH/IGF-1
   („Leczenie / Monitorowanie”) i „Podsumowania wyników”, dla spójności aplikacji: jedna karta, jeden
   tytuł „Przelicznik jednostek laboratoryjnych”, zakładki pod tytułem, kłódka w zakładce dla gościa,
   bramki bez przycisku „Wróć do pojedynczego badania”. Makieta zaakceptowana 2026-11-13 z poleceniem
   wdrożenia w PR2.
8. Po scaleniu PR2 (propozycja właściciela, przyjęta do realizacji; potwierdza ją akceptacja PR3):
   kopiowanie wyników pakietu ma być **przyciskiem bezpośrednio tam, gdzie wyniki się wpisuje**, a nie
   blokiem w karcie „Podsumowanie wyników”, która jest już przeładowana informacjami.
   To **zastępuje decyzję 2**: strona główna i „Podsumowanie wyników” zostają bez zmian. Dodatkowy
   powód techniczny z rozpoznania PR3: karta podsumowania ma trzy postacie (dziecko, dorosły,
   porównanie z poprzednim pomiarem), a jej kopiowany tekst zasila też wiersze karty — blok badań
   wymagałby łatania zminifikowanych plików strony głównej.

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
| PR1 | Tryb „Pakiet badań”, pakiet „Tarczyca” (TSH, fT4, fT3): wartości i jednostki, data pobrania, komentarz, ocena na żywo, zapis zbiorczy do Badań, jednostki zapamiętane na urządzeniu, skrót z zakładki „Badania”, bramki bez logowania i bez pacjenta | scalony 2026-11-13 (PR #943) |
| PR2 | „Normy z wydruku”: opcjonalne od–do dla każdego badania, w jednostce wyniku; wpisana norma zastępuje normę aplikacji dla tego wyniku, zapisuje się z nim (`labResult.norm`, bez zrzutu normy aplikacji) i jest oznaczona jako norma laboratorium; podpowiedź jednostki i normy z poprzedniego wyniku tego samego badania u pacjenta, z możliwością edycji | scalony 2026-11-13 (PR #944) |
| zakładki | Przełącznik trybu jako zakładki w jednej karcie (decyzja 7) | scalone 2026-11-13 (PR #944) |
| PR3 | „Kopiuj wyniki” przy pakiecie (punkt 8): tekst „Badania (pobranie …)” z wierszem na wynik, oceną poza normą i normą z ekranu; po zapisie kopiuje zapisany zestaw. Bez zmian w „Podsumowaniu wyników” | ten PR |
| później | Pakiety definiowane przez użytkownika; pakiet „Pokwitanie” (LH, FSH, estradiol u dziewcząt, testosteron u chłopców) — wymaga silników pokwitaniowych przelicznika (osie wieku i stadium), patrz `docs/clinical/LAB_INTERPRETATION_AGENT_GUIDE.md` | pomysł, bez decyzji |

## Otwarte kwestie do decyzji przy kolejnych etapach

- PR2 (do potwierdzenia przy akceptacji klinicznej): wynik z normą z wydruku nie zapisuje zrzutu normy
  aplikacji — niesie jedną normę. Uzasadnienie i skutek dla wyników przeliczanych w historii:
  `docs/clinical/ALGORITHMS.md`, „LAB-PAKIETY PR2”.
- PR2: podpowiedź bierze normę tylko z **ostatniego** wyniku; gdy ostatni wynik jej nie ma (np. przypięty
  w pojedynczym badaniu), starsza norma nie wraca. Do zmiany, jeżeli w praktyce okaże się za ostrożne.
- Norma z wydruku w pojedynczym badaniu (okno „Przypnij do wizyty”) — dziś tylko w pakiecie i w edytorze
  wyniku karty pacjenta.
- Kopiowanie w pojedynczym badaniu: dziś kopiuje się tam pojedynczą przeliczoną wartość (kliknięcie
  w tabeli); wiersz „badanie: wynik (norma)” jak w pakiecie — do decyzji, jeżeli będzie potrzebny.
- Format kopiowanego tekstu: bez komentarza do pakietu i bez przeliczenia na SI — do zmiany, jeżeli
  dokumentacja tego wymaga.
- Wynik cenzorowany („<0,01”) w pakiecie — dziś nie jest liczbą, jak w pojedynczym badaniu.
