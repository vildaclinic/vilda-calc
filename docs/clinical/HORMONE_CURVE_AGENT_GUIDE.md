# Krzywe hormonów w ciągu życia — instrukcja dla agentów AI

Decyzja właściciela z 11 października 2026, po zaakceptowaniu makiety
testosteronu z łagodnym łukiem dorosłości. Stosuj przed zmianą danych,
łączeń, wygładzania, skali lub punktu pacjenta na wykresach hormonów,
dla obu płci i wszystkich okresów życia. Bieżące polecenie właściciela
ma pierwszeństwo. Dokument uzupełnia [AGENTS.md](../../AGENTS.md),
[instrukcję interpretacji badań](LAB_INTERPRETATION_AGENT_GUIDE.md),
[opis wykresu](HORMONE_LIFESPAN.md) i
[kontrakt punktu pacjenta](hormone-lifespan/PATIENT_POINT.md).

## Cel: czytelny obraz zmian, bez sztucznych wydarzeń hormonalnych

To pomoc do rozmowy z pacjentem i nauczania studentów. Linia ma pozwolić
zrozumieć ogólny przebieg hormonu przez życie. Właściciel dopuszcza
autorskie uproszczenie geometrii, aby usunąć drobne fluktuacje, ząbki
na styku badań i ostre kolanka. Nie jest to zgoda na wymyślanie stężeń,
norm, fizjologicznych szczytów ani liczbowych odniesień dla pacjenta.

Zachowuj istniejący układ, selektory hormonów, okresów i porównania płci,
punkt pacjenta oraz pełny ekran. Korzystaj z danych głównego formularza.
Nie dodawaj formularza do wyboru publikacji, metody wygładzania ani
nadmiarowych etykiet. Krótkie objaśnienie znaczenia linii wystarcza;
populacja, metoda i ograniczenia należą do rozwijanych źródeł.

## Trzy warstwy, których nie wolno utożsamiać

| Warstwa | Co przechowuje | Czego nie wolno robić |
| --- | --- | --- |
| Dowód i odniesienie liczbowe | Oryginalna tabela/model, mediana lub średnia, jednostka, populacja, metoda, granice wieku i jakości | Dopisywać wartości z mostu graficznego, zamieniać średnią na medianę, rozszerzać granice na podstawie rysunku |
| Geometria edukacyjna | Zatwierdzone kotwice, mosty i szerokie łuki; wyjaśnienie decyzji w osobnej polityce danych | Nazywać połączoną linię zwalidowaną krzywą populacyjną lub przypisywać jej liczbowe tooltipy bez źródła |
| Interpretacja laboratoryjna | Osobny silnik norm, progi, zakresy wieku/stadium i werdykty | Wnioskować „w normie” z odległości czerwonego punktu od ilustracji |

Czerwony punkt przedstawia rzeczywisty wpisany wynik. Jasny znacznik
przedstawia wartość ze źródła: np. medianę modelu albo średnią całej grupy
wieku. Oba stosują tę samą jednostkę i skalę. Jasny znacznik może leżeć
poza poglądową linią. **Nie przyciągaj go do linii, nie przesuwaj wyniku
i nie podpisuj interpolowanej wysokości krzywej źródłową liczbą.**
Dobór odniesienia zależy od kontekstu i zakresu źródła, nigdy od wartości
wyniku lub pożądanego wyglądu wykresu.

## Jak łączyć badania i wygładzać linię

1. Najpierw rozpisz dla każdego odcinka źródło, rodzaj statystyki,
   jednostkę, metodę, populację, wiek i rzeczywisty zakres obserwacji.
   Sprawdź jednostki oraz różnice między testosteronem całkowitym i wolnym.
2. Oglądaj cały przebieg, potem każde połączenie. Różnica poziomów między
   publikacjami lub między grupami nie dowodzi nagłego fizjologicznego
   spadku, odbicia czy maksimum w konkretnym wieku. Nie rysuj jej jako
   osobnego wydarzenia tylko dlatego, że interpolator przechodzi przez
   każdy węzeł.
3. Buduj jedną ciągłą linię w stałych współrzędnych osi całego życia.
   Kontroluj ciągłość wartości i stycznej (C1), nieujemność oraz brak
   nieuzasadnionych ekstremów i przeregulowania. Zmiana skali czasu
   na granicy okresu również może tworzyć kolanko — sprawdź ją osobno.
4. PCHIP jest narzędziem, a nie gwarancją wiarygodności obrazu. Przy
   niejednorodnych badaniach dozwolony jest szerszy most lub jeden łuk
   Béziera przez zatwierdzone końce, bez wymuszania wszystkich średnich
   po drodze. Parametry i uzasadnienie zapisuj w polityce prezentacji.
   Nie wygładzaj całej serii bez kontroli szczytu minipuberty, niskiego
   dzieciństwa, wzrostu pokwitaniowego i przebiegu dorosłości.
5. Nie wymuszaj wzrostu, spadku lub różnicy płci wyłącznie na podstawie
   oczekiwań. Łagodny trend musi mieć oparcie w źródłach; jego kształt
   może być ilustracyjny. Nie utożsamiaj różnic przekrojowych z trajektorią
   jednej osoby ani czystym wpływem starzenia.
6. Jeżeli oś wykracza poza dane, zachowaj jawnie poglądowe zakończenie
   zgodnie z polityką danego hormonu, np. wygaszony płaski ogon.
   Nie dopisuj liczbowego odniesienia pacjenta ani dalszego trendu.

## Stała geometria i skala

W zwykłych widokach krzywa i skala nie zależą od obecności ani wysokości
wyniku, wieku bieżącego pacjenta, wyboru innych hormonów, szerokości ekranu
czy zbliżenia. Zbliżenie próbkuje wcześniej zbudowaną krzywą i zmienia
oś czasu; nie dopasowuje nowej krzywej do rzadszego podzbioru kotwic.
Nie normalizuj osobno minipuberty do jej własnego maksimum, jeżeli zwykły
widok całego życia używa innego stałego maksimum.

Nie obiecuj identycznych ciągów SVG ani idealnej równości po ponownym
próbkowaniu. Kontroluj błąd geometryczny w pikselach, położenie szczytów,
skalę i kierunek zmian. W zaakceptowanej makiecie 801 próbek zbliżenia
dawało resztę do około 0,06 px: wygląd i szczyty były zachowane, mimo
ośmiu niespełnionych porównań o zbyt ścisłym progu względnym 0,00001.
Nie przedstawiaj tego jako pełnej matematycznej równości.

**Porównanie płci ma odrębny kontrakt.** Obecnie używa własnej skali
każdej płci w danym okresie i opisuje kierunek, nie iloraz stężeń.
Nie przenoś automatycznie naprawy zwykłych widoków do porównania płci.
Zmiana tej polityki wymaga jawnego zakresu zadania i osobnej weryfikacji.

## Utrwalony przykład: testosteron, 11 października 2026

- Rysunek dzieciństwa zachowuje odczyt Busch do 212. dnia, potem łagodnie
  schodzi do niskiego poziomu Madsen w wieku 6 lat. Węzły Kelsey 3–5 lat
  nie wymuszają rysunku. Źródłowe odniesienia Kelsey 3–<6 pozostają
  dostępne osobno; luka 1–<3 nie otrzymuje wymyślonej mediany.
- Madsen pozostaje odniesieniem 6–<18 lat. Połączenie z młodą dorosłością
  nie tworzy sztucznego szczytu 17–18 lat ponad poziomem młodych dorosłych.
- Dorosłe odniesienie edukacyjne to siedem średnich Walravens, tabela 1,
  [DOI 10.1210/clinem/dgaf507](https://doi.org/10.1210/clinem/dgaf507),
  w obserwowanym wieku 18–86 lat. Zastępuje tu dorosłe Kelsey; nie zmienia
  laboratoryjnych norm testosteronu. Średnie nie są p50 ani normą.
- Rysunek dorosłości tworzy jeden sześcienny łuk Béziera od
  23,8 lat / 20,7 nmol/L do 82,1 lat / 15,9 nmol/L w kanonicznym X.
  Uchwyty X mają ułamki 0,20 i 0,50 szerokości odcinka, a styczne końców
  są poziome. 601 próbek daje monotoniczny, łagodny przebieg bez
  wymuszania pośrednich średnich i kolanka około czterdziestki.
- Po 82,1 roku rysunek pozostaje na końcowym poziomie, a od 86 do 90 lat
  wygasa. Po 86 latach brak liczbowego odniesienia, mimo ciągłej ilustracji.
- Skala zachowuje divisor 18,051151264084126 i zapas 1,25, czyli górę
  osi 22,563939080105158 nmol/L; divisor jest historyczną kotwicą skali,
  nie maksimum nowego zbioru dorosłych. Przy 44 latach źródłowa średnia
  wynosi 18,1, a przy 82 latach 15,9 nmol/L, niezależnie od łuku.
- Zwykłe męskie schematy LH, FSH, INSL3 i AMH używają kanonicznego PCHIP
  na niezmienionych kotwicach. Usunięto ponowne dopasowanie 97 próbek
  i wtórny B-spline dla każdego zbliżenia. Porównanie płci zachowuje
  dotychczasowy sposób rysowania; inhibina B własną ciągłą krzywą.

## Co sprawdzić przed oddaniem zmiany

- Osobno porównaj dane źródłowe, wynik funkcji odniesienia i geometrię.
  Zmiana uchwytów łuku nie może zmienić mediany/średniej, norm ani werdyktu.
- Na rzeczywistych funkcjach produkcyjnych sprawdź granice źródeł,
  niepewny wiek, jednostki, brak danych i brak ekstrapolacji. Dla aktualnego
  T: 44 lata → średnia 18,1; 82 lata → 15,9; >86 → brak odniesienia;
  2 lata → brak mediany; pediatryczne mediany pozostają niezmienione.
- Porównaj pusty wynik → wynik równy źródłu → niższy/wyższy → wynik ponad
  osią → wyczyszczenie. Linia i skala mają zostać stałe; wynik ponad osią
  ma strzałkę z prawdziwą wartością, a nie kropkę udającą górę skali.
- Sprawdź całe życie, minipuberty, pokwitanie, wybór/odznaczenie hormonów,
  pełny ekran, desktop i telefon 320 px. Obejrzyj połączenia, nie tylko
  zielone testy: brak ząbków, ostrych kolanek, nowych ekstremów i poziomego
  przewijania. Dla porównania płci potwierdź zachowanie odrębnej polityki.
- Zachowaj makietę przed/po do przeglądu, a źródła, granice i decyzję
  graficzną wpisz do dokumentacji i polityki danych w repozytorium.
  Zaktualizuj [ALGORITHMS.md](ALGORITHMS.md). Zgoda na ilustracyjne
  wygładzenie nie oznacza walidacji klinicznej ani zgody na nową normę.
  Wykonaj wymagane testy, wersjonowanie PWA i kontrolę CI z AGENTS.md.
