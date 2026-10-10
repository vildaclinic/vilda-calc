# Inhibina B: dane grupowe i odcinki wykresu życia

Stan źródeł: 10 października 2026. Właściciel polecił wdrożenie po analizie
czterech dostarczonych pełnych tekstów. Dane służą edukacyjnej prezentacji
zmian stężenia. Nie dodają norm, rozpoznań, centyli ani kategorii oceny
laboratoryjnej. Brak nowego punktu na wykresie nie blokuje istniejącej
interpretacji wyniku.

## Zachowanie i granice prezentacji

Wykres wykorzystuje wybrany hormon, płeć, wiek, wcześniactwo, aktualną
obserwację pokwitania i wynik z istniejącego formularza. Nie wprowadza
nowych pól pacjenta. Zmiany widoku, powiększenie i wybór serii nie zmieniają
zapisanych danych ani oceny klinicznej.

Po zgłoszeniu zmiany przebiegu po wpisaniu wyniku właściciel polecił
zachować jedną płynną linię. Ta decyzja zastępuje osobne przycinane
ścieżki i przerywane łączniki PR #615. W zwykłych męskich widokach
inhibiny B ogólna krzywa jest taka sama przed wpisaniem wyniku, z wynikiem
oraz po zmianie wieku lub danych próbki. Obserwacje Busch, Kelsey i Borelli
pozostają jej stałą podstawą; nie są dobierane do metody lub donoszenia
bieżącego pacjenta. Brak dopasowania pacjenta usuwa wyłącznie jego punkt,
a nie fragmenty ogólnego przebiegu.

`VildaHormoneLifespanDisplay.buildMaleInhibin` przygotowuje stałe węzły.
Renderer rysuje z nich jedną ścieżkę PCHIP z ciągłą styczną (C1)
we współrzędnych całego życia.
Przejścia między źródłami w wieku 0,75–2 lat i 4,5–7 lat są geometrią
edukacyjną. Pas 18–25 lat w obrębie Borelli łagodzi wizualne załamanie
przy zmianie skali czasu w 20. roku. Styczne na końcach pasów odpowiadają
lokalnym pochodnym źródłowego przebiegu, bez krótkiego zagięcia przy
powrocie do jego węzłów. Nie ma osobnych łączników, masek ani ponownego dopasowania
przy zbliżeniu. Zachowany poglądowy odcinek płodowy dochodzi do danych
Busch z 7. dnia bez wcześniejszej kotwicy dołka przy urodzeniu. Płaskie
zakończenie 80–90 lat jest zakotwiczone w końcu Borelli (140 pg/mL);
nie jest modelem stężenia pacjenta poza domeną tego źródła.

Polityka graficzna jest jawna w `inhibin-display-policy.json`, eksportowana
jako `inhibinDisplayPolicy`. Pełne źródła wyznaczają stałe maksimum
309,779035 pg/mL, z zapasem wysokości 1,25: około 387,22379 pg/mL na górze
osi. Wpisana wartość nie przeskalowuje krzywej. Poprawny wynik wyższy od
osi ma strzałkę w górę z rzeczywistą wartością, bez fałszywej kropki na
brzegu. Porównanie płci zachowuje swoją odrębną skalę.

Oryginalne liczbowe profile i silnik odniesienia pacjenta są niezmienione.
Warunki wieku, materiału, metody i donoszenia nadal obowiązują dla punktu:
Busch wymaga znanego donoszenia; ogólna prezentacja jego danych nie
kwalifikuje wcześniaka ani niemowlęcia z nieznanym donoszeniem. Wynik
i znacznik mediany są liczone z właściwego źródła nawet w pasie wygładzenia,
gdzie znacznik mediany może leżeć poza linią edukacyjną. Nie dopasowujemy
wartości źródłowych do grafiki. Wiek pacjenta poza widocznym okresem
ukrywa punkt, pozostawiając tę samą krzywą. Niepewność odczytu rycin,
metody i populacje opisuje [PATIENT_POINT.md](PATIENT_POINT.md).

Osobna, niewielka prezentacja obserwacji grupowych jest dobierana do widoku:

- **Minipuberty:** dwa oznaczenia inhibiny B w surowicy, osobno donoszeni
  i wcześniaki. Porównanie płci może pokazać cztery serie. Nie służy do
  wyznaczania dokładnego wyniku odniesienia w dowolnym dniu życia.
- **Pokwitanie chłopców:** pięć median G1–G5. Wyróżnienie wykorzystuje
  wyłącznie znane, aktualne G w wieku objętym źródłem, a nie stadium
  wywnioskowane z wieku lub numer P/Th. Nie jest to dodatkowy punkt wyniku.
- **Starsi mężczyźni:** pięć osobnych średnich grup wieku. Dla 80–101 lat
  dopuszczalne jest porównanie wyniku z właściwą średnią grupową, przy
  spełnieniu opisanych niżej warunków. Średnia nie jest medianą.

Źródła i ograniczenia są dostępne przy wykresie; nie dodajemy nowego
formularza ani obowiązkowego potwierdzania metody. Automatyczny wybór
publikacji nie potwierdza metody próbki pacjenta.

## Kuiri-Hänninen 2018: donoszeni i wcześniaki

[DOI: 10.1111/cen.13716](https://doi.org/10.1111/cen.13716), tabela 2,
strona 16 dostarczonego accepted manuscript. Populacja: 125 niemowląt obu
płci, Kuopio, Finlandia. Surowica, Beckman Coulter ELISA, LOQ 5,2 pg/mL;
generacja zestawu nie została podana.

| Grupa | D7: mediana [IQR], n | M3: mediana [IQR], n |
| --- | --- | --- |
| Chłopcy donoszeni | 157,0 [129,5–185,6], 28 | 335,5 [282,7–400,5], 29 |
| Dziewczynki donoszone | 33,1 [17,3–59,6], 27 | 92,0 [62,7–124,0], 27 |
| Chłopcy wcześniacy | 201,1 [155,1–254,3], 28 | 297,1 [260,2–361,5], 31 |
| Dziewczynki wcześniaczki | 13,8 [5,1–23,5], 27 | 131,7 [55,5–157,8], 30 |

Wszystkie stężenia są w pg/mL. D7 i M3 oznaczają nominalne wizyty według
wieku chronologicznego. M3 nie oznacza dokładnie 90. dnia; publikacja nie
podaje okien wizyt. Nie stosujemy wieku skorygowanego ani PMA.
Nie ma oznaczeń inhibiny B w M1, M2 lub M4–M6. Częstsze pomiary innych
hormonów w tej pracy dotyczą moczu i nie przechodzą na oś surowicy.

IQR obejmuje środkowe 50% wyników, nie normę. Dolny kwartyl wcześniaczek
w D7 (5,1 pg/mL) leży poniżej LOQ. Kohorta wcześniacza obejmuje GA
24,7–36,7 tygodnia oraz choroby okresu noworodkowego. Nie jest to jednorodna
populacja zdrowych wcześniaków do wyznaczania zakresu referencyjnego.
Łącznik dwóch wizyt ma znaczenie poglądowe; nie wyznacza szczytu,
interpolowanej mediany ani czerwonego punktu pacjenta. Gęstsze modele
Busch/Ljubicic dla dzieci donoszonych pozostają odrębnymi źródłami.

## Crofton 2002: gonadalne stadia Tannera

[DOI: 10.1046/j.0300-0664.2001.01448.x](https://doi.org/10.1046/j.0300-0664.2001.01448.x),
tabela 2, strona 218 / PDF 4. Osocze, historyczny dimeric inhibin B ELISA
według Groome; LOD 8 ng/L. `1 ng/L = 1 pg/mL` jest konwersją jednostki,
nie przeliczeniem między metodami.

| Stadium | n | Mediana pg/mL | IQR pg/mL |
| --- | ---: | ---: | --- |
| G1 | 90 | 70 | 54–94 |
| G2 | 38 | 150 | 106–220 |
| G3 | 39 | 220 | 171–236 |
| G4 | 18 | 176 | 143–191 |
| G5 | 10 | 172 | 138–196 |

To oś stadium G, nie wieku. Wyróżnienie znanego G nie wskazuje położenia
stężenia pacjenta. Nie tworzymy stadium na podstawie numeru bez rodzaju
obserwacji, owłosienia P/Ax, żeńskiego Th ani samego wieku. Zakres kohorty
stadiów to 5–18 lat; obserwacja spoza niego nie jest dopasowaniem do źródła.

Seria stadiowa obejmuje 195 próbek, w tym 135 podczas leczenia GH.
Nie określamy jej jako zdrowej, nieleczonej populacji odniesienia.
IQR nie staje się kliniczną normą. Połączony wiersz G4–G5 nie jest szóstym
stadium ani niezależnym zbiorem. Osobne 366 obserwacji według wieku
wykorzystano już w modelu Kelsey 2016; nie dodajemy ich drugi raz ani nie
nazywamy niezależną walidacją.

## Baccarelli 2001: średnie grup męskich do 101 lat

[DOI: 10.1016/S0531-5565(01)00117-6](https://doi.org/10.1016/S0531-5565(01)00117-6),
tabela 1, strona 1406 / PDF 4. 73 wyselekcjonowanych zdrowych mężczyzn,
Mediolan, badanie przekrojowe. Surowica, Serotec Oxford sandwich ELISA,
czułość 15 pg/mL. Brak zweryfikowanej konwersji do Gen II lub Ansh.

| Grupa opisana przez autorów | n | Średnia ± SD pg/mL |
| --- | ---: | --- |
| 30–50 lat | 20 | 198 ± 60 |
| 50–65 lat | 14 | 209 ± 66 |
| 65–80 lat | 12 | 165 ± 121 |
| 80–90 lat | 18 | 129 ± 101 |
| 90–101 lat | 9 | 78 ± 45 |

To średnie arytmetyczne grup, nie mediany i nie ciągła funkcja wieku.
SD opisuje rozrzut, nie granice normy. Nie łączymy pięciu średnich krzywą
wieku ani z linią Borelli. Kobietom inhibiny B nie oznaczano: nie dopisujemy
wartości zero ani poniżej wykrywalności.

Autorzy nie zdefiniowali włączenia wspólnych granic grup. Jawna konwencja
aplikacji dla czerwonego punktu to `[80,90)` → 129 i `[90,101]` → 78 pg/mL.
Dokładne 80 i 90 lat rozpoczynają kolejną grupę, dokładne 101 lat jeszcze
mieści się w ostatniej grupie. Wiek znany jedynie jako ukończone 101 lat
obejmuje też wiek powyżej 101 i nie daje dopasowania. Nie interpolujemy
między średnimi; niepewny przedział wieku musi mieścić się w jednej grupie.

Punkt wymaga męskiej płci, inhibiny B, poprawnej dokładnej wartości
nieujemnej oraz jednostki pg/mL albo ng/L. Nierówność, nieznany wiek,
niezgodny materiał, jawnie inna metoda lub znany kontekst wykluczający
porównanie blokują punkt. Nieznana metoda nie jest potwierdzeniem Serotec;
wynik pokazujemy wyłącznie jako edukacyjne porównanie ze średnią tego
badania. Zero jest dokładną wartością wejściową, a nie zamiennikiem
wyniku poniżej wykrywalności.

## De Schepper 2000: brak aktywacji ilościowej

[DOI: 10.1007/s004310051309](https://doi.org/10.1007/s004310051309).
Pełny tekst zawiera sprzeczności liczebności, oznaczenia średniej/mediany
i skrajnych wyników grup. Nie aktywujemy wartości liczbowych tej pracy.
Przy urodzeniu badano krew pępowinową, a w dniu 5 surowicę z krwi kapilarnej;
nie tworzymy z tego punktu krwi obwodowej w wieku zero. Obserwowane
minima/maksima nie są normami. Brak aktywacji pozostaje jawny w danych.

## Odtwarzanie danych i testy

Czytelne ekstrakcje trzech aktywnych tabel znajdują się w
`evidence/patient-point/`. Każda zachowuje DOI, pozycję tabeli, SHA-256
dostarczonego PDF, populację, statystykę, jednostkę i ograniczenia. Pełne
PDF oraz skany tabel pozostają poza publicznym repozytorium. Dane trafiają
do `inhibinEvidence` w artefakcie wykresu; nie do zbioru norm laboratoryjnych.

Przypadki syntetyczne testują rzeczywisty produkcyjny moduł obserwacji:

| Fikcyjne wejście / akcja | Oczekiwane zachowanie |
| --- | --- |
| Mężczyzna 85 lat, inhibina B 129 pg/mL | Punkt na średniej 129 grupy 80–90, bez oceny „w normie”. |
| Mężczyzna dokładnie 90 lat, 78 ng/L | Punkt na średniej 78 grupy 90–101. |
| Wiek 89–<90 lat | Średnia 129; otwarta górna granica nie włącza kolejnej grupy. |
| Wiek 89–90 lat, oba końce włącznie | Brak punktu: przedział obejmuje dwie grupy. |
| Dokładnie 101 lat / przedział 101–<102 lat | Odpowiednio średnia 78 / brak punktu. |
| Wynik `<78`, niezgodna metoda, mocz, przeciwwskazany kontekst lub płeć żeńska | Brak senioralnego punktu zastępczego. |
| Minipuberty, porównanie płci | Cztery serie, po dwa opublikowane punkty, bez punktu pacjenta na tych danych. |
| Chłopiec 12 lat i znane G3 | Wyróżnione G3=220, bez dopasowania wyniku do normy stadium. |
| P3, Th3, brak rodzaju stadium, nieznane stadium | Brak wyróżnienia G3. |
| Odznaczenie inhibiny B lub zmiana osoby/analitu | Poprzednia obserwacja i czerwony punkt nie pozostają. |
| Chłopiec 3 lata, 107 pg/mL | Jedna płynna linia i punkt na źródłowej medianie Kelsey 107; zmiana donoszenia nie przerywa ogólnego przebiegu. |
| Chłopiec dokładnie 1 rok, 223 pg/mL | Czerwony punkt i znacznik mediany Kelsey są na tej samej wysokości; wygładzona linia nie zmienia ich źródłowej wartości. |
| Przejście Borelli do poglądowego odcinka po 80. roku | Płaskie zakończenie do 90 lat na wysokości końca Borelli, bez nowego ilościowego odniesienia. |
| Dokładnie 44 lata; pusty wynik → 88 → 1000 pg/mL → wyczyszczenie | Ta sama linia i skala; przy 88 punkt pod źródłową medianą około 162,084705882; przy 1000 strzałka w górę z prawdziwą liczbą. |
| Telefon 320 px i pełny ekran | Widoczna oś i punkty, bez nowych pól ani przewijania w poziomie. |

Testy jednostkowe zachowują niezależną transkrypcję liczb i sprawdzają
granice, jednostki oraz wykluczenia. E2E korzystają z prawdziwego
formularza, parsera i adaptera; sprawdzają również niezmienność danych
pacjenta i oceny klinicznej po interakcji z wykresem. Zielone testy nie
oznaczają walidacji klinicznej.
