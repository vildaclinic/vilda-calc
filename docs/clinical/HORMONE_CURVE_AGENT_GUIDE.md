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

**Porównanie płci ma odrębny kontrakt.** Wyjątkiem od dotychczasowych
osobnych skal jest zatwierdzone AMH w minipuberty, opisane niżej:
obie płcie używają stałej wspólnej osi stężeń. Pozostałe porównania
zachowują własną politykę; schemat z osobnymi maksimami opisuje kierunek,
nie iloraz stężeń. Nie przenoś automatycznie tej zmiany do innych hormonów
lub pokwitania. Wymagałoby to osobnej weryfikacji.

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
  Zwykłe LH, FSH, AMH i INSL3 otrzymały następnie osobne polityki opisane poniżej.

## Utrwalony przykład: męskie AMH, makieta zatwierdzona 11 października 2026

- Zachowaj jedną linię bez wyniku i po jego wpisaniu. Stosuj
  `amh-display-policy.json` i `buildMaleAmh`; widoki zwykłe używają
  stałego dzielnika 1335,592934 pmol/L i zapasu 1,25. Dorosłych 4–7 ng/mL
  nie podnoś do pozornej wysokości zbliżonej do niemowlęcych około 187.
- Busch zachowuje odczyt mediany od 7. do 250. dnia, z szerokim
  maksimum około 175. dnia. Nie myl go ze szczytem modelu podłużnego
  około 146. dnia. Prenatalne kotwice i dojście do 7. dnia są schematem.
- Kolejne łuki w kanonicznym X łączą 250. dzień, 9,5 roku, 14,5 roku,
  30 i 70 lat. Nie wymuszają wszystkich median grup Wang. Środek grupy
  jest punktem kontroli geometrii, nie medianą dokładnego wieku.
  Przykład: przy 11,5 roku linia około 25,01 ng/mL, lecz źródłowe p50
  grupy nadal 20,70. Jasny znacznik musi zachować tę drugą wartość.
- Wang nie zawiera median Tannera. Nie ustalaj stadium z wieku ani
  początku pokwitania z miejsca spadku linii. Access 2 i zmodyfikowany
  Gen II nie otrzymały kalibracji przez samo połączenie rysunku.
- Zachowaj 15 profili i luki przed 7. dniem, 12–<13 lat, 15–<30 lat
  oraz >70 lat. Krzywa przez lukę nie uprawnia do dodania źródłowej liczby.
  Po 70 latach wygaszony płaski ogon oznacza koniec danych, nie biologiczne
  plateau. Normy laboratoryjne i porównanie płci mają odrębne kontrakty.

## Uzupełnienie po audycie LH/FSH, 11 października 2026

Właściciel zatwierdził poprawioną makietę i jej wdrożenie. LH/FSH mają
teraz własną politykę `lh-fsh-display-policy.json`, zamiast dawnego
przełączania schematu na fragment profilu po wpisaniu wyniku. Opis LH/FSH
w historycznym przykładzie testosteronu powyżej dotyczy stanu sprzed tej zmiany.

- Sprawdzenie tylko końców łuku nie wystarcza. Pierwsza propozycja FSH
  dochodziła do poprawnego poziomu w wieku 80 lat, ale narastała zbyt
  szybko około 45–70. Kontroluj również wartości pośrednie i nachylenia.
  Zatwierdzony łuk FSH 25–80 sprawdzono względem 40 odczytów modelu
  Ljubicic; RMS około 0,050 IU/L i maksymalna różnica około 0,127 IU/L.
- Nie wymuszaj poziomej stycznej w miejscu, które nie jest szczytem ani
  plateau: przy 25 latach FSH zachowuje dodatnie nachylenie, a most
  12–25 łączy pokwitanie z tym łukiem bez zatrzymania.
- Przejście między źródłami może celowo omijać ich środkowe wartości.
  Most FSH jest przy 14–16 latach około 24–34% poniżej median Madsen.
  To jawne uproszczenie edukacyjne, nie nowa mediana ani dokładniejsze
  odtworzenie badania. Oryginalny znacznik zachowuje te mediany.
- Zmiana wysokości w minipuberty może wynikać ze stałej skali całego
  życia. Nie przywracaj dawnej wysokości samego szczytu bez sprawdzenia,
  jakie stężenie oznaczałaby na nowej skali. Średnie trajektorie i mediana
  populacyjna Busch są odrębnymi wielkościami.
- Prenatalny fragment pozostaje schematem. Nie przypisuj jego amplitudzie
  zweryfikowanego stężenia ani pacjentowi liczbowego odniesienia.
- Podpis porównania LH/FSH wyjaśnia osobne skale. Przecięcie linii nie
  przedstawia równości stężeń ani ilorazu LH/FSH. Makieta może włączać oba
  hormony dla recenzenta; aplikacja nadal zaczyna od bieżącego analitu.

## Utrwalony przykład: INSL3, poprawiona makieta zatwierdzona 11 października 2026

- Zachowaj przerywaną tożsamość linii (`6 5`) oraz `insl3-display-policy.json`
  i `buildMaleInsl3(data)`. Jedna krzywa ma tę samą względną skalę
  (`divisor = 1`, `ceiling = 1`) w zwykłych widokach i pełnym ekranie.
  Powiększenie minipuberty nie normalizuje jej do własnego maksimum.
- Mała fala pierwszego miesiąca ma oparcie w modelowanej średniej
  trajektorii z ryc. 2 Busch 2022. Normalizacja dotyczy maksimum każdego
  hormonu, nie dorosłego INSL3 ani osobno każdego uczestnika. Ryc. 3
  przedstawia medianę GAMLSS tej samej kohorty; jej spadek nie uprawnia
  do usunięcia wczesnego wzrostu z ilustracji fizjologii.
- Kotwice rysunku: urodzenie 0,109158, około 27. dnia 0,14, pierwszy
  rok 0,012, młoda dorosłość 0,87. To współrzędne bez jednostki.
  Nie przypisuj im stężeń ani zwalidowanego ilorazu niemowlę/dorosły.
  Wspólna pozioma styczna przy urodzeniu zapobiega sztucznemu dołkowi;
  nie dowodzi dokładnego dnia biologicznego minimum.
- Łagodny łuk dorosłości dochodzi w wieku 80 lat do 0,455; do 90 lat
  utrzymuje i wygasza tę wysokość. To zakończenie ilustracyjne,
  nie ekstrapolacja normy ani dowód plateau. Nie łącz liczbowo LC-MS/MS,
  TRFIA i średnich różnych kohort tak, by tworzyły nowe zdarzenia hormonalne.
- Mediana poniżej LOQ ogranicza pewność liczbową, ale sama nie dowodzi
  braku biologicznej fali i nie unieważnia każdej estymacji populacyjnej.
  Nie aktywuj punktu pacjenta, stężeń w tooltipach ani norm INSL3 z tej
  polityki. Zachowaj oddzielnie liczbowe profile pozostałych hormonów.
- Tulumcu 2025 zawiera własne dane późnego pokwitania i dorosłości;
  opis niemowlęctwa cytuje Busch. Nie licz tego jako kolejnej kohorty
  niemowląt ani jako dowodu dokładnego uniwersalnego szczytu w 22. roku.
  Odczyty, DOI i dostępność źródeł zachowuje
  [audyt INSL3](hormone-lifespan/evidence/insl3-lifespan-display-audit-2026-10-11.json).

## Utrwalony wyjątek: porównanie płci AMH w minipuberty, 11 października 2026

- Stosuj `amh-comparison-policy.json`, `amhComparisonPolicy` i
  `buildAmhInfantComparison(data, referenceEngine)`. Zawsze rysuj te same
  mediany modeli: Busch 2022 u chłopców, Ljubicic 2022 u dziewczynek.
  Oba badania dotyczą surowicy zdrowych donoszonych niemowląt, Access 2.
  Nie zastępuj ich schematem po usunięciu wyniku ani roczną grupą Wang po
  pierwszych urodzinach.
- Oś jest wspólna i stała: log10, 0,1–1000 ng/mL, opisane poziomy
  0,1 / 1 / 10 / 100 / 1000. Każdy krok oznacza 10× stężenie;
  równa wysokość oznacza równe stężenie. Używaj tego samego przelicznika
  źródeł i wyniku: 1 pmol/L = 0,1401 ng/mL. Nie normalizuj osobno płci,
  nie dobieraj maksimum do pacjenta i nie dodawaj selektora skali.
- Wspólne linie obejmują 0,02–<1 roku, bez ekstrapolacji do urodzenia.
  Ich koniec jest lewostronną granicą, nie dostępnym punktem dokładnie
  w pierwsze urodziny. Własne odniesienie chłopca jest poprawne już
  od 7. dnia; nie blokuj go tylko dlatego, że druga linia zaczyna się
  w 7,305 dnia. W tym porównaniu dokładnie 1 rok nie otrzymuje punktu
  żadnej płci; źródłowych domen i zwykłych widoków nie zmieniamy.
- Punkt nadal kwalifikuje oryginalny silnik. Wcześniactwo, nieznane
  donoszenie, nierówność wyniku lub niezgodna metoda nie tworzą
  zastępczego odniesienia; krzywe populacyjne pozostają widoczne.
  Zero i liczba poniżej osi mają strzałkę w dół, powyżej osi w górę,
  z rzeczywistą wartością. Nie obliczaj log(0) ani nie podstawiaj LOD/2.
  Tolerancja maszynowa przy granicy osi nie jest tolerancją oznaczenia.
- To mediany GAMLSS, nie średnie trajektorie podłużne ani normy.
  Męska mediana jest przybliżonym odczytem ryciny; żeńska pochodzi
  z tabeli suplementu. AMH ma LOD 0,14 pmol/L w obu publikacjach;
  odrębnego LOQ nie podano. Podłoga osi 0,1 ng/mL nie jest LOD.
  Źródła i punkty kontrolne zachowuje
  [audyt porównania AMH](hormone-lifespan/evidence/amh-infant-comparison-audit-2026-10-11.json).

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
