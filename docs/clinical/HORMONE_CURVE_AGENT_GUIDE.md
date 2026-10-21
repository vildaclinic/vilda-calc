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
widok całego życia używa innego stałego maksimum, poza jawnym wyjątkiem
żeńskich LH/FSH zatwierdzonym 12 października 2026 i opisanym niżej.
W tym wyjątku zmiana okresu zmienia również źródło, statystykę i skalę;
nie jest zwykłym powiększeniem tej samej krzywej. W obrębie wybranego
okresu wynik pacjenta i wybór dodatkowych hormonów nadal nie mogą
przeskalowywać ani zastępować linii LH/FSH.

Nie obiecuj identycznych ciągów SVG ani idealnej równości po ponownym
próbkowaniu. Kontroluj błąd geometryczny w pikselach, położenie szczytów,
skalę i kierunek zmian. W zaakceptowanej makiecie 801 próbek zbliżenia
dawało resztę do około 0,06 px: wygląd i szczyty były zachowane, mimo
ośmiu niespełnionych porównań o zbyt ścisłym progu względnym 0,00001.
Nie przedstawiaj tego jako pełnej matematycznej równości.

**Porównanie płci ma odrębny kontrakt.** Zatwierdzone wyjątki od
dotychczasowych osobnych skal to AMH w minipuberty oraz inhibina B
i LH/FSH w minipuberty i pokwitaniu, opisane niżej. Obie płcie używają w nich
stałej wspólnej osi stężeń. Pozostałe porównania
zachowują własną politykę; schemat z osobnymi maksimami opisuje kierunek,
nie iloraz stężeń. Nie przenoś automatycznie tych zmian do innych hormonów
lub okresów. Wymagałoby to osobnej weryfikacji.

## Utrwalony przykład: testosteron, 11 października 2026

- Rysunek dzieciństwa zachowuje odczyt Busch do 212. dnia, potem łagodnie
  schodzi do niskiego poziomu Madsen w wieku 6 lat. Węzły Kelsey 3–5 lat
  nie wymuszają rysunku. Źródłowe odniesienia Kelsey 3–<6 pozostają
  dostępne osobno. Historyczną lukę 1–<3 uzupełnia osobne odniesienie
  Kushnir z 21.10.2026, opisane poniżej; nie bierze mediany z rysunku.
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
- Zachowaj 15 pierwotnych profili. W tej historycznej zmianie luki
  obejmowały przed 7. dniem, 12–<13, 15–<30 oraz >70 lat. Osobne
  rozszerzenie z 13.10.2026 dodaje źródłowe mediany Jopling 12–<13
  i 15–<18 oraz Benderradji 20–<30, według
  `male-amh-reference-policy.json`, bez zmiany geometrii. Krzywa przez
  pozostałą lukę 18–<20 nie uprawnia do dodania źródłowej liczby.
  Po 70 latach wygaszony płaski ogon oznacza koniec danych, nie biologiczne
  plateau. Normy laboratoryjne i porównanie płci mają odrębne kontrakty.

## Utrwalony przykład: żeńskie AMH, 12 października 2026

Właściciel zatwierdził makietę i implementację („ok, koduj to”).
Ta naprawa zwykłych widoków nie obejmuje odrębnego porównania płci.

- Zachowaj dotychczasową linię całego życia z `displaySegments`, także
  po wpisaniu wyniku. Stała skala to `normalizationMaximum = 28.99 pmol/L`
  i `ceiling = 1`. Nie zastępuj linii wybranym profilem i nie dobieraj
  wysokości osi do największego wyniku pacjenta. Ponad osią pokaż
  strzałkę z rzeczywistą liczbą; zero pozostaje na osi.
- Zbliżenie jest projekcją tej samej kanonicznej krzywej. Podziel kawałki
  Hermite'a/Béziera również na granicach skali czasu, a następnie zmień
  współrzędne. Ponowne dopasowanie pełnego zbioru węzłów w nowym X także
  zmienia kształt: przed naprawą AMH w wieku 19,668 roku różniło się
  między całym życiem a pokwitaniem o około 9,3 px na wykresie 277 px.
- Zaznaczenie LH/FSH nie przełącza AMH na inną linię lub ich skalę.
  Mieszany widok używa tej samej krzywej AMH na osi czasu wybranego
  okresu. IU/L oraz własne maksima średnich LH/FSH nie dotyczą AMH.
- Most 0,9–1,3 roku pozostaje ilustracją we wszystkich zwykłych widokach.
  Przy 0,95 roku źródłowa mediana nadal wynosi 7,747 pmol/L, niezależnie
  od wysokości mostu. Wszystkie 99 median źródła zachowaj w danych;
  nie przyciągaj jasnego znacznika do poglądowej linii.
- Nie twórz dorosłego profilu z kotwic graficznych. Istniejące zwykłe
  żeńskie odniesienie AMH kończyło się przy 1 roku; rozszerzenie
  Jopling z 13 października opisano poniżej. Jopling/FDA opisują
  osobne grupy osocza, a niemowlęta Ljubicic — surowicę. To nie jedna
  skalibrowana populacja. Wysokość po 45 latach i `displayFloor` są
  jakościowe, bez koncentracji, LOD lub dokładnego wieku menopauzy.
- Przypadek kontrolny: dziewczynka donoszona 0,25 roku, wynik 10 pmol/L
  → mediana 16,999 pmol/L; 200 pmol/L → strzałka, ta sama linia i mediana.
  Historyczny brak odniesienia w wieku 19,668 roku uzupełniają odrębne
  mediany surowicy FDA 18–<46 lat z 13.10.2026, opisane w kontrakcie punktu;
  mediana grupy pozostaje niezależna od osoczowej ilustracji. Prawidłowe
  projekcje porównuj geometrycznie z tolerancją zaokrąglenia SVG, nie
  przez oczekiwanie identycznego tekstu ścieżek między różnymi osiami.

Źródła i trwały zapis decyzji:
[audyt żeńskiego AMH](hormone-lifespan/evidence/female-amh-display-audit-2026-10-12.json).
Akceptacja prezentacji nie nadaje jej statusu walidacji klinicznej.

## Utrwalony przykład: żeński estradiol, 12 października 2026

Właściciel zatwierdził makietę i wdrożenie („ok, koduj”), po wyjaśnieniu
niższego szczytu minipuberty na stałej osi całego życia.

- Zachowaj dotychczasowe `displaySegments` E2 i stałą liniową skalę
  `normalizationMaximum = 264 pmol/L`, `ceiling = 1`, niezależnie od
  pustego/wpisanego/wyczyszczonego wyniku i wyboru LH/FSH. To historyczna
  normalizacja graficzna, nie górna norma, maksimum fizjologiczne ani
  mediana całego cyklu. Wynik ponad osią ma strzałkę z rzeczywistą liczbą.
- Zbliżenia przenoszą tę samą kanoniczną krzywą Hermite'a/Béziera po
  podziale na węzłach i granicach osi czasu. E2 dołączone do LH/FSH
  zachowuje wszystkie swoje odcinki i własną skalę; nie przyjmuje osi
  IU/L ani procentowego maksimum średniej gonadotropin.
- Ljubicic 2022: 99 median GAMLSS pozostaje bez zmian. Szczyt 23,908
  pmol/L przy 0,34 roku zajmuje `23.908 / 264 ≈ 0.0906` wysokości osi.
  Jest około 13% mediany Madsen przy 18 latach, 185,456 pmol/L. To
  porównanie różnych modeli i kohort, nie uniwersalny iloraz ani miara
  znaczenia biologicznego minipuberty. Nie podnoś szczytu dla wyglądu.
- Dwie fale E2 w ryc. 3 Ljubicic dotyczą względnej modelowanej średniej
  podłużnej, nie mediany ryc. 1/suplementu F. Brak fizycznej kalibracji
  maksimów tej średniej nie pozwala dokleić ich do osi pmol/L. Początek
  przy 0,02 roku nie jest pomiarem narodzin; nie ekstrapoluj do dnia 0.
- Most 1–6 lat i dorosłe plateau są ilustracjami. Nie twórz dorosłej
  mediany z wysokości końca pokwitania lub median poszczególnych faz.
  Osobny cykl Anckaert ma własną normalizację 817 i pozostaje schematem
  bez punktu pacjentki. Cui 2026, pełny artykuł/tabela 2, potwierdza
  zbiorcze p50 4,9 pg/mL ≈18 pmol/L po menopauzie; nie medianę konkretnego
  wieku ani stałe stężenie każdej kobiety. Przejście 45–55 jest umowne.
- Profil `ljubicic2022-female-e2` pozostaje wyłącznie dla donoszonych
  dziewczynek 0,02–1 roku. Dla 0,25 roku i 50 pmol/L źródłowy znacznik
  ma nadal 21,616 pmol/L; 1000 pmol/L zmienia tylko punkt na strzałkę.
  Nie dodawaj liczbowego odniesienia dzieciństwa, pokwitania lub
  dorosłości przez samą obecność tam linii. Normy i kwalifikacja bez zmian.

Źródła, hashe i syntetyczne kontrole:
[audyt żeńskiego estradiolu](hormone-lifespan/evidence/female-estradiol-display-audit-2026-10-12.json).
Akceptacja prezentacji nie jest walidacją kliniczną połączonej krzywej.

## Utrwalony przykład: żeńska inhibina B, 12 października 2026

Właściciel zatwierdził makietę przed/po i wdrożenie („ok, koduj”).
Zwykły widok i porównanie płci zachowują odrębne kontrakty.

- Zachowaj pierwotne `displaySegments`, stały dzielnik 52,474 pg/mL
  i `ceiling = 1`, niezależnie od wyniku, wieku pacjentki i wyboru
  innych hormonów. Jest to maksimum wybranych median niemowlęcych,
  nie norma. Wynik ponad osią ma strzałkę z rzeczywistą liczbą.
- Zbliżenia przenoszą kanoniczną krzywą Hermite'a/Béziera po podziale
  na węzłach i granicach osi czasu. Dołączenie LH/FSH zachowuje wszystkie
  odcinki oraz własną skalę inhibiny B. Nie zastępuj życia samym
  profilem niemowlęcym i nie dopasowuj linii od nowa w każdym okresie.
- Zachowaj 99 dokładnych median Ljubicic 2022, tabela 1 C: surowica,
  donoszone dziewczynki, Gen II ELISA. Mediana ma maksimum 52,474
  pg/mL przy 0,35 roku. Dwie fale ryc. 3 dotyczą odrębnej względnej
  średniej podłużnej; nie doklejaj ich do liczbowej mediany. Modelowy
  wiersz wieku 0 nie jest obserwacją narodzin. LOD 3 pg/mL nie daje
  zgody na imputację wyniku pacjentki.
- Borelli-Kjær 2025: zachowaj 24 przybliżone odczyty mediany 0 SD
  5,6–47 lat i źródłowy wzrost około 13 lat. Nie utożsamiaj go ze
  stadium Tannera lub szczytem każdej dziewczynki. Fazy cyklu nie
  standaryzowano, dane antykoncepcji są niepełne; to nie populacja
  wyłącznie bez leczenia. ±2 pg/mL jest oszacowaniem digitalizacji.
- Most 1–5,6 roku nie tworzy nowych stężeń. Ogon po 47 latach,
  `displayFloor = 0.012` i umowny wiek 55 są jakościowe, bez LOD
  lub prognozy menopauzy. Wiek 47 kończy wybrany odczyt, choć badanie
  obserwowało dorosłe kobiety do 69 lat. Nie zamieniaj ogona na medianę.
- Zwykły profil `ljubicic2022-female-inhb` pozostaje 0,02–1 roku,
  włącznie. Odrębny `borelli2025-female-inhb-puberty-comparison`
  8–20 lat w tej historycznej zmianie nie trafiał do globalnych profili.
  Zatwierdzone rozszerzenie z 13 października opisano poniżej; sama
  obecność starszej linii nadal nie aktywuje punktu poza źródłem.
  Dla 0,25 roku wynik 30 lub 80 pg/mL zachowuje
  p50 49,684; tylko 80 wymaga strzałki. Źródłowy znacznik pozostaje
  niezależny od ilustracji, kwalifikacja i normy nie zmieniają się.

Źródła, ograniczenia i hashe:
[audyt żeńskiej inhibiny B](hormone-lifespan/evidence/female-inhibin-b-display-audit-2026-10-12.json).
Akceptacja ilustracji nie oznacza walidacji klinicznej połączonej krzywej.

## Żeńskie mediany poza niemowlęctwem — 13 października 2026

Po zgłoszeniu braku median przy AMH i inhibinie B u 15-latki właściciel
zaakceptował rozszerzenie odniesień edukacyjnych, z krótkim komentarzem
o ograniczeniach i bez nowych pól. Nie zmienia to norm laboratoryjnych,
źródłowych liczb, geometrii linii, skali ani zapisu wyniku.

- AMH: Jopling 2018, tabela 1, pięć stałych median grup wieku,
  Access AMH, osocze litowo-heparynowe. Routing aplikacji to `(1,5)`,
  `[5,8)`, `[8,12)`, `[12,15)`, `[15,18)`; zachowaj oryginalne etykiety
  grup i liczebności. To jawna konwencja dopasowania, nie odzyskana
  reguła autora ani nowa ciągła mediana wieku. Ograniczenie do <18 lat
  jest konserwatywną polityką pediatryczną. FDA dodano w osobnej partii dorosłych.
- Dokładnie 1 rok zachowuje Ljubicic. Nieprecyzyjny wiek obejmujący
  tę granicę lub dwie grupy Jopling nie otrzymuje arbitralnej mediany;
  wystarczy krótki powód. Nie wymagaj nowych danych o stadium lub cyklu.
- Inhibina B: historyczne rozszerzenie z 13 października obejmowało **5,6–20 lat
  włącznie**. Początkowe 8–20 z PR #651 wynikało z przejęcia okna
  porównania pokwitania; po zgłoszeniu braku punktu u 6-latki właściciel
  13 października zatwierdził rozszerzenie do początku danych źródła.
  Porównanie płci nadal ma własne okno 8–20. Zachowaj wszystkie 24 węzły
  5,6–47 do PCHIP, te same liczby i geometrię. Dla F6/33 pg/mL pokaż
  wynik ponad przybliżoną medianą ≈11 pg/mL; nie oznacza to przekroczenia
  normy. Luka >1–<5,6 nie otrzymuje liczby z mostu graficznego.
  Nie wymagaj Th1, nie wyznaczaj stadium z wieku. Cykl i antykoncepcja
  pozostają ograniczeniami modelu w odpowiednim kontekście, nie normą
  fazy cyklu ani nowymi polami.
- Materiał Jopling jest osoczem, a Borelli surowicą. Nieznane metoda
  lub materiał pozwalają na edukacyjne zestawienie, bez potwierdzania
  zgodności próbki. Znana niezgodność blokuje punkt, nie krzywą wieku.
  Profilowa lista `compatibleSpecimenIds` nie znosi dotychczasowej
  domyślnej kwalifikacji surowicy pozostałych źródeł.
- Jasny znacznik AMH podpisuj jako medianę grupy; 15–18,9 lat daje
  21,14 pmol/L ≈2,96 ng/mL. Inhibina B dokładnie w wieku 15 lat daje
  ≈44 pg/mL z odczytu ryciny. Nie przyciągaj żadnej liczby do linii;
  wynik poniżej mediany nie staje się automatycznie nieprawidłowy.

Źródła, granice i przypadki kontrolne:
[przegląd odniesień](hormone-lifespan/evidence/female-reference-points-2026-10-13.json)
oraz [kontrakt punktu](hormone-lifespan/PATIENT_POINT.md#żeńskie-amh-i-inhibina-b--rozszerzenie-13-października-2026).

## Żeńska inhibina B — odniesienie 5,6–47 lat, 14 października 2026

- `female-inhibin-reference-policy.json` jest odrębne od polityki AMH.
  Jeden zwykły profil `borelli2025-female-inhb-age-5p6-47` zastępuje
  poprzednie 5,6–20. Zachowaj wszystkie 24 węzły Borelli i ich PCHIP;
  nie dopasowuj ponownie dorosłego podzbioru i nie twórz styku przy 20.
- Wiek całym swoim możliwym przedziałem musi należeć do 5,6–47 włącznie.
  Dokładne 47 lat daje ≈11 pg/mL; formularz 47 lat 0 miesięcy wykracza
  poza domenę. Nie zamieniaj nieprecyzyjnego wieku na dokładny środek.
  Źródło obejmuje dorosłe kobiety do 69 lat, ale zachowany liczbowy
  odczyt kończy się na 47; poglądowy ogon nie dostarcza dalszych median.
- Surowica Gen II, 149 kobiet 20–69 lat, cykl niestandaryzowany, dane
  antykoncepcji niepełne. ±2 pg/mL to tolerancja digitalizacji, nie CI.
  Przy dokładnym wieku 25/30/40/46/47 lat zachowaj ≈32/30/28/17/11.
  Nie opisuj tego jako mediany fazy cyklu, normy, SDS lub oceny płodności.
- Znana ciąża/menopauza wyłącza ten zwykły profil według konserwatywnej
  **polityki aplikacji**, nie kryteriów wyłączenia autorów. Brak danych
  nie potwierdza ich nieobecności; pozwala na ograniczone porównanie.
  Nie dodawaj selektora, nie koryguj stężenia przez stosowanie antykoncepcji.
- Geometria, skala, 73 pozostałe profile i porównanie płci 8–20 są odrębne
  i pozostają bez zmian. Jasny znacznik ma wskazywać źródłową liczbę,
  także gdy nie leży na ilustracji. W tej partii Crofton i luka >1–<5,6
  nie były aktywowane; osobne rozszerzenie Zhou opisano poniżej.

Źródła i oczekiwane przypadki:
[kontrakt punktu](hormone-lifespan/PATIENT_POINT.md#żeńska-inhibina-b--rozszerzenie-odniesienia-do-47-lat-14-października-2026),
[przegląd dostępności](hormone-lifespan/evidence/female-inhibin-reference-coverage-2026-10-14.json).

## Żeńska inhibina B — dalszy odczyt do 47,75 roku, 21 października 2026

Ta decyzja aktualizuje granicę zwykłego profilu z historycznego wpisu
14.10, nie granicę porównania płci ani geometrię ilustracji.

- `borelli2025-female-inhb-age-5p6-47p75`, `ordinaryOnly`, obejmuje
  **[5,6;47,75]**. Zachowuje wszystkie 24 stare węzły i dodaje wyłącznie
  **47,25 → ≈10; 47,5 → ≈8; 47,75 → ≈7 pg/mL** z ryc. 1 Borelli-Kjær
  (DOI 10.1210/clinem/dgae439). Polityka i dane: `2026-10-21.2`.
- PCHIP po 27 węzłach zmienia też ostatni dawny odcinek `(46,47)`:
  przy 46,5 roku 14,4375 → 14,076923 pg/mL; największa zmiana w skanie
  około −0,42735 pg/mL przy 46,667 roku. Nie nazywaj tego neutralną
  refaktoryzacją. Dawne węzły i interpolacja do 46 lat pozostają takie same.
- Zachowaj odrębną wspólną ekstrakcję **24** węzłów oraz kwalifikację
  porównania płci **8–20**; nie dopisuj tam nowych punktów. Pozostałe
  **83 profile**, E2, laboratoryjne RI, krzywe, skale i dawne oceny
  pozostają bez zmian. Nie przyciągaj znacznika mediany do linii.
- Cały możliwy wiek musi pasować: formularz 47 lat 8 miesięcy daje
  ≈7,2345679 pg/mL; 47 lat 9 miesięcy przecina koniec domeny, a dokładne
  48 jest poza nią. Dokładne 47,75 kwalifikuje się. Nie wybieraj środka
  niepewnego wieku i nie wyciągaj z tej granicy wniosku o menopauzie.
- Źródło: 889 uczestniczek/1005 próbek, w tym 149 dorosłych 20–69 lat,
  surowica Gen II ELISA, ng/L = pg/mL. Cykl niestandaryzowany, dane
  antykoncepcji niepełne. LOD **3 pg/mL**, bez osobnego LOQ. ±2 pg/mL
  to tolerancja odczytu, nie CI/RI ani dowód oznaczalności ilościowej.
  LOD/2 było regułą modelowania autorów, nigdy podstawieniem wyniku
  pacjentki. Odczyt 48 lat i dolne plateau pozostają nieaktywne.
- Kalibrację wykonano na archiwalnym oficjalnym rastrze 3000×2178,
  SHA-256 `7abfa7ffc9d1b6f0a8494bea32515ffb417d2ff31f67f9de557253d08526d76f`.
  HTML i cztery suplementy sprawdzono ponownie; świeży obraz zwrócił
  403. Nie deklaruj pozyskania nowej kopii PDF lub rastra.
- Zachowaj dotychczasowe bramki metody, materiału, GnRHa, cenzury,
  `pregnancy_t1/t2/t3` i `postmenopause`. Nie dodawaj pytań. Regresje
  mają wywoływać produkcję, chronić stare dane i objąć jednostki,
  niepewny wiek, źródła, desktop/320 px oraz PWA z zimnym startem offline.

[Kontrakt punktu](hormone-lifespan/PATIENT_POINT.md#żeńska-inhibina-b--dalszy-odczyt-do-4775-roku-21-października-2026),
[odczyt źródła i kalibracja](hormone-lifespan/evidence/patient-point/borelli2025-female-inhb-post47-digitized.json).

## Dziecięce mediany grup Zhou — inhibina B, 14 października 2026

- Po PR #672 uzupełniamy wyłącznie zwykły żeński zakres >1–<5,6:
  `female-inhibin-childhood-reference-policy.json`, `ordinaryOnly`,
  `group-median`, `constant`. Grupa źródłowa 1–5, N=60, daje 33 pg/mL
  dla `(1,5)`; grupa 5–10, N=77, daje 27 dla `[5,5.6)`. Węższy routing
  nie tworzy mediany nowej podgrupy. Nie interpoluj między 33 i 27.
- Granica dokładnych 5 lat jest konwencją aplikacji, bo autorzy nie
  zdefiniowali inkluzywności. Cały możliwy wiek musi pasować; przedziały
  przecinające 1, 5 lub 5,6 nie dostają liczby ze środka wieku. Dokładnie
  1 zachowuje Ljubicic, od 5,6 Borelli; nie stosuj zastępczo Zhou,
  gdy nie pasuje metoda lub kontekst tamtego profilu.
- Surowica Kangran CLIA / KAESER 1000 nie jest skalibrowana względem
  Gen II. Znana niezgodna metoda/materiał blokuje punkt, nieznana
  dopuszcza orientacyjne zestawienie. Nie dodawaj kolejnych pytań
  o metodę, Tanner lub porę pobrania. Ograniczenia szpitalnej populacji
  chińskiej i nieznanej pory pobrania należą do źródeł.
- Zachowaj gładki most oraz skalę. Jasny punkt to mediana całej grupy,
  nie wysokość ilustracji. Przejścia 33→27 oraz do ≈11 Borelli nie
  dowodzą zdarzeń biologicznych przy 5/5,6 roku; nie dopasowuj do nich
  krzywej. 90% CI mediany nie staje się pasmem normy. Nie uruchamiaj
  norm Zhou, regresji sześciennej, Crofton ani porównań płci przez
  samo dodanie tych liczb. Wszystkie 74 wcześniejsze profile zachowaj.

Źródło, populacja, przypadki graniczne i oczekiwane kontrole:
[kontrakt punktu](hormone-lifespan/PATIENT_POINT.md#żeńska-inhibina-b--mediany-grup-dziecięcych-zhou-14-października-2026),
[przegląd tej partii](hormone-lifespan/evidence/female-inhibin-childhood-reference-coverage-2026-10-14.json).

## Uzupełnienie po audycie męskich LH/FSH, 11 października 2026

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

## Utrwalony wyjątek: żeńskie LH/FSH, 12 października 2026

Właściciel zatwierdził kolejne makiety: wspólną czytelną oś całego życia,
oddzielny przebieg pokwitania i cyklu, poprawione pierwsze dni oraz
dwufazową względną średnią minipuberty. Następnie polecił ich wdrożenie.
To wąski wyjątek od zasady identycznej normalizacji każdego zbliżenia.
Nie przenoś go na męskie wykresy, porównania płci ani inne hormony.

- Korzystaj z `female-gonadotropin-display-policy.json`,
  `female-gonadotropin-display-data.json` i
  `buildFemaleGonadotropins(data)`. Dane prezentacji są odrębne od
  źródeł punktu pacjenta i norm laboratoryjnych. Nie dopisuj źródła
  ilościowego tylko dlatego, że można narysować jego linię.
- **Całe życie:** obie gonadotropiny mają wspólną stałą oś 0–70 IU/L,
  `log1p(C / 0.5) / log1p(70 / 0.5)`, z liczbowymi poziomami i jawnym
  opisem kompresji. Równe wysokości LH/FSH odpowiadają równym stężeniom
  na tej osi, ale odległości nie wyznaczają ich ilorazu. Linie pozostają
  poglądowym połączeniem różnych badań, nie nową medianą całego życia.
- **Początek osi:** grupa Schmidt 1–5 dni jest umieszczona graficznie
  w dniu 3, grupa 26–28 w dniu 27. Nie opisuj ich jako pomiarów
  w dokładnym dniu ani nie dopisuj wartości przy urodzeniu. Pełny
  artykuł obejmuje 73 zdrowe donoszone dziewczynki, po jednej próbce.
  Wczesne LH pochodzi z RIA Serono MAIA z 3% reaktywnością krzyżową
  wobec hCG; nie ma podstaw do korekty liczbowej ani kalibracji do
  późniejszych Immulite/AutoDELFIA. Małe grupy i ich fluktuacje nie
  wymuszają liczby fizjologicznych szczytów.
- **Łączenie niemowlęctwa w całym życiu:** szeroki asymetryczny łuk
  LH dochodzi łagodnie do niskiego poziomu Ji około 5. miesiąca,
  z zerowymi pochodnymi na końcach. Nie wymuszaj mediany grupy
  2-miesięcznej jako węzła: powstawał ostry zjazd zakończony kolankiem.
  Gęste próbkowanie początku usuwa również narożnik polilinii SVG.
  Wartości pośrednie mostu nie są zmierzonymi stężeniami. Wybrane
  kotwice Ljubicic 2020 po niemowlęctwie mają umowne pozycje wieku;
  nie identyfikują dokładnego wieku menopauzy ani stadium Tannera.
- **Minipuberty:** używaj wyłącznie odczytu ryc. 3 Ljubicic 2022
  (COPENHAGEN): modelowanej średniej podłużnej, dzielonej przez własne
  maksimum każdego hormonu. LH ma pierwszy szczyt około 23. dnia
  i drugi około 165. dnia, około 18% wysokości pierwszego. Zachowaj
  mniejszą drugą falę i ponowny wzrost w 3.–4. miesiącu; nie podnoś
  jej arbitralnie do wysokości FSH. To wynik modelu jednej kohorty,
  nie harmonogram dla każdej dziewczynki. Ryc. 1 i suplement LMS tej
  samej publikacji przedstawiają inne statystyki — mediany GAMLSS.
- Oś minipuberty oznacza **100% własnego szczytu**, nie IU/L,
  percentyl ani procent normy. Wysokości LH i FSH nie porównują
  stężeń. Brakuje fizycznych maksimów modelu średniej: nie odtwarzaj
  ich z median Schmidt, Ji lub GAMLSS. Nie dodawaj punktu LH/FSH pacjentki
  ani znacznika mediany gonadotropiny na tej osi. Zachowaj wynik tekstowo w jego
  jednostce oraz pion wieku; powrót do widoku ilościowego przywraca
  tylko punkt kwalifikowany przez istniejący silnik.
- Dane ryc. 3 zaczynają się około 5,6 dnia, kończą dla LH w dniu 360,
  dla FSH w dniu 357. Brzegowa luka jest poprawna: nie ekstrapoluj
  do narodzin lub 365. dnia. Digitalizacja jest przybliżeniem ryciny,
  a nie udostępnioną przez autorów tabelą współczynników modelu.
- **Pokwitanie:** osobne mediany Madsen 2022, 6–16 lat, wspólna
  liniowa oś 0–8 IU/L. To odrębny model wieku, nie dokładny wycinek
  poglądowej syntezy całego życia. Nie ustalaj Tannera z wieku.
  Osobno zatwierdzone 16.10.2026 zwykłe profile wieku opisuje uzupełnienie
  poniżej; sama geometria nadal nie jest źródłem odniesienia.
- **Dorosłość:** osobna wstawka cyklu Stricker 2006 zachowuje 30
  dziennych median obu hormonów oraz wspólną liniową oś 0–50 IU/L.
  Dzień 0 oznacza szczyt LH w badaniu, nie zawsze 14. dzień cyklu
  ani dokładny moment owulacji. Nie rysuj na niej wyniku pacjentki
  bez odrębnie zweryfikowanego kontekstu cyklu.
- Dołączenie AMH, E2 lub inhibiny B nie przywraca starych linii LH/FSH.
  Ich własne skale nie stają się wspólną osią IU/L. Jawnie ogranicz
  opis osi stężeń do gonadotropin; porównania płci zachowują odrębny
  dotychczasowy kontrakt. Wynik innego bieżącego analitu zachowuje
  własny silnik kwalifikacji, jednostkę i skalę; nie przenoś jego kropki
  na procentową ani ilościową oś LH/FSH.

Źródła, ograniczenia oznaczeń i syntetyczne punkty kontrolne:
[audyt żeńskich LH/FSH](hormone-lifespan/evidence/female-gonadotropin-display-audit-2026-10-12.json)
oraz [opis modułu](HORMONE_LIFESPAN.md#żeńskie-lhfsh--odrębne-widoki-okresów-12-października-2026).

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

## Utrwalony wyjątek: porównania płci inhibiny B, 11 października 2026

- `inhibin-comparison-policy.json`, `inhibinComparisonPolicy` i
  `buildInhibinComparison(data, referenceEngine, period)` utrzymują
  stałe źródła i wspólną liniową oś 0–400 pg/mL w obu okresach.
  1 ng/L = 1 pg/mL. Zero jest punktem na poziomie 0; wynik ponad 400
  ma strzałkę z rzeczywistą liczbą. Nie kopiuj logarytmicznej osi AMH.
- Minipuberty: oryginalne mediany GAMLSS Busch/Ljubicic, Gen II ELISA,
  surowica, zdrowe donoszone niemowlęta; wspólne linie 0,02–<1 roku.
  Chłopiec zachowuje własne odniesienie od 7. dnia, bez ekstrapolacji
  żeńskiej linii. Dokładnie 1 rok nie otrzymuje punktu tego porównania;
  nie przełączaj linii na Kelsey. Dotychczasowe profile, ich granice
  i warunek donoszenia nie zmieniają się.
- Pokwitanie: mediany modeli Borelli-Kjær 2025 w wieku 8–20 lat,
  nie mediany Tannera. Męski profil i jego mieszane metody pozostają
  dotychczasowe. Dla dziewcząt właściciel osobno zaakceptował nowe
  odniesienie **początkowo wyłącznie w porównaniu płci inhibiny B 8–20 lat**.
  Dane `inhibinComparisonReferenceData` pozostają poza globalnym
  `patientPointData`. Osobne rozszerzenie z 13 października udostępnia
  te same mediany w zwykłych widokach, po zatwierdzonym uzupełnieniu
  również 5,6–<8 lat. Partia z 14 października poszerza wyłącznie zwykły
  profil do 5,6–47; okno samego porównania pozostaje 8–20.
- Zachowaj wszystkie 24 żeńskie węzły ryc. 1 od 5,6 do 47 lat podczas
  PCHIP. Okno porównania płci 8–20 ogranicza wynik, nie zbiór węzłów
  potrzebnych do stycznych. Nie dopasowuj nowej krzywej z obciętej
  tabeli. Odczyt około ±2 pg/mL jest dokładnością digitalizacji,
  nie przedziałem ufności ani normą. Źródło dotyczy surowicy Gen II;
  faz cyklu nie standaryzowano, a antykoncepcja może zmieniać wynik.
- Własna płeć kwalifikuje punkt niezależnie przez oryginalny silnik
  i dane odniesienia właściwe dla tego widoku. Brak dopasowania do
  metody drugiej płci nie blokuje poprawnego własnego odniesienia.
  Znana niezgodna metoda, materiał, przeciwwskazanie, niepewny wiek
  przecinający granice i cenzurowany wynik nadal mają znaczenie.
- Nie przeliczaj Oxford na Gen II współczynnikiem 1,28. Wspólna oś
  pokazuje opublikowane modele, nie harmonizuje ich metod. Nie dodawaj
  SDS, percentyli, norm, diagnoz ani stadium wywnioskowanego z wieku.
  Osobne obserwacje Kuiri-Hänninen, Crofton i Baccarelli pozostają
  odrębne. Uzasadnienie i przypadki:
  [audyt porównań inhibiny B](hormone-lifespan/evidence/inhibin-comparison-audit-2026-10-11.json).

## Utrwalony wyjątek: porównania płci LH/FSH, 12 października 2026

Właściciel zatwierdził makietę i wdrożenie („ok, ładnie, koduj”).
Stosuj `gonadotropin-comparison-policy.json` i
`buildGonadotropinComparison(data, referenceEngine, period, analyte)`.

- Obie płcie i oba hormony mają stałą liniową skalę IU/L w danym
  okresie: minipuberty 0–6, pokwitanie 0–8. Nie normalizuj osobno
  maksimów i nie dostosowuj osi do wyniku. Zero to punkt na osi;
  ponad osią strzałka z rzeczywistą wartością, bez ukrytego przycięcia.
- Minipuberty przedstawia mediany GAMLSS Busch/Ljubicic, surowica
  AutoDELFIA, zdrowe donoszone niemowlęta. Zachowaj oryginalne węzły,
  kwalifikację i wspólne linie 0,02–<1 roku. Chłopiec zachowuje
  własną medianę od 7. dnia; brak żeńskiej mediany nie blokuje punktu.
  Dokładnie 1 rok nie otrzymuje punktu tego porównania. Nie przenoś
  tej granicy do zwykłego API źródeł ani nie podstawiaj FSH Zec.
- Nie zastępuj zatwierdzonych dwufazowych średnich zwykłej żeńskiej
  minipuberty tym porównaniem median. Nie kalibruj ich procentowych
  szczytów medianami IU/L. Względnie płaska mediana FSH nie znaczy
  stałego FSH u konkretnej dziewczynki. Niski ogon męskiego LH
  pozostaje oszacowaniem, bez punktu po 243. dniu według istniejącej
  bramki digitalizacji; ta bramka nie jest LOD ani normą.
- Pokwitanie: 44 mediany Madsen, 6–16 lat obu płci, IMMULITE 2000 XPi.
  Zachowaj wszystkie roczne węzły i `exp(M)/1e6`; M nie jest IU/L.
  Węzeł 16 jest opublikowanym brzegiem kohorty 6–<16. Fit Futures
  do 18 lat dotyczy steroidów, nie LH/FSH. Nie dopisuj 17–20 lat,
  nie ustalaj Tannera z wieku ani fazy cyklu z mediany.
- Dwa żeńskie profile Madsen `*-sex-comparison` pozostają w odrębnych danych porównania,
  poza globalnym `patientPointData`. Kwalifikuj własny profil przez
  istniejący silnik; nie przekazuj kontekstu pacjenta drugiej płci.
  Zachowaj bramki wieku, metody, materiału, leczenia, donoszenia
  i cenzurowanego wyniku. Wdrożenie zwykłych odniesień z 16.10.2026
  ma osobną politykę i identyfikatory. Nie dodawaj norm, SDS ani
  klinicznego ilorazu LH/FSH.

Źródła, weryfikacja 198/788/44 wartości i ograniczenia:
[audyt porównań LH/FSH](hormone-lifespan/evidence/lh-fsh-sex-comparison-audit-2026-10-12.json).
Zatwierdzenie ilustracji nie nadaje jej statusu walidacji klinicznej.

## Żeńskie LH/FSH — zwykłe odniesienia wieku, 16 października 2026

Po analizie źródeł właściciel polecił wdrożyć rekomendowany dobór:
`female-gonadotropin-reference-policy.json`. W wieku 6–16 zwykłe LH i FSH
używają tych samych oryginalnych 22 median Madsen co porównanie płci, ale
pod odrębnymi identyfikatorami `*-age-6-16`. Źródłowych danych porównania,
geometrii, skal, niemowląt i norm laboratoryjnych nie zmieniaj.

- Model wieku nie wymaga Th; uzupełnienie Th1/Th2 nie przełącza mediany.
  Osobna laboratoryjna ocena stadium i czasu pokwitania pozostaje istotna.
- Żeńskie FSH Zec działa tylko 1–<6 przy aktualnym Th1. Okno 4–<6 nadal
  opisuje opublikowaną grupę 4–<8, medianę 1,07 i N=156. Grupę 8–<11
  zachowaj w dowodach. Nie zmieniaj męskiego routingu.
- To świadoma zmiana źródła: F9/Th1/FSH 1,55 → około 1,965 IU/L.
  Znana Roche cobas e411 nie pasuje do Madsen/IMMULITE; brak punktu nie
  uprawnia do ukrytego powrotu do Zec ani rozszerzania zgodnych metod.
- Cały niepewny wiek musi pasować; brak ekstrapolacji poza opublikowany
  brzeg 16 lat. Wiek 16 lat 0 miesięcy nie oznacza dokładnego węzła 16.
- Zachowaj znane dodatnie leczenie i jawną bieżącą ciążę po przełączeniu
  analitu, z ochroną tożsamości/płci i bez przenoszenia faktów na dawną próbkę.
  Brak wywiadu nie potwierdza braku leczenia; nie dodawaj nowej ankiety.
- Żeńskie `mini` nadal pokazuje względną średnią, bez kropki stężenia.
  Zmiana mediany odniesienia nie może przesunąć poglądowej linii.

Źródła, granice i zakres ponownej weryfikacji:
[audyt zwykłych odniesień](hormone-lifespan/evidence/female-gonadotropin-reference-audit-2026-10-16.json).
To porównanie orientacyjne; testy nie są walidacją kliniczną.

## Żeński E2 — zwykła mediana wieku, 17 października 2026

Po analizie pełnego Madsen i oryginalnego suplementu właściciel polecił
wdrożenie `female-estradiol-reference-policy.json`. Jeden profil
`madsen2022-female-e2-age-6-18` używa wszystkich 13 źródłowych median,
bez Th, nowych pól i obowiązkowego pytania o cykl. Zachowaj cały przedział
wieku w [6,18], bez ekstrapolacji po opublikowanym węźle 18; wpis 18 lat
0 miesięcy nie jest dokładnym punktem 18. To model wieku z łącznymi fazami,
nie norma lub mediana konkretnej fazy. Nigdy nie wyprowadzaj p50 z geometrii.

- Zachowaj wszystkie 77 wcześniejszych profili i mediany, stałą skalę E2
  264 pmol/L, krzywe, cykl, porównania płci i niezależne normy laboratoryjne.
- LC-MS/MS dotyczy surowicy dwóch kohort. LLOQ 0,58 i 13 pmol/L nie tworzą
  wspólnego progu; bez LLOQ/2 lub dokładnego punktu z nierówności.
- OCP było wykluczeniem autora; ciąża, menopauza i znane leczenie/stymulacja
  są konserwatywnymi wyłączeniami aplikacji. Brak wywiadu pozostaje nieznany.
  Nieznana metoda pozwala wyłącznie na edukacyjne odniesienie; znana niezgodna
  metoda/materiał blokuje bez fallbacku.
- Adapter przekazuje znane dodatnie fakty tylko tej samej aktualnej pacjentki,
  z ochroną płci i historycznej próbki. Obejmuje E2 wszystkich wieków: znane
  aktualne leczenie może wyłączyć także niemowlęcą kropkę. Nie twierdź, że cała
  jej kwalifikacja jest niezmieniona; mediany, domena i donoszenie są zachowane.

Źródła, granice i przypadki produkcyjnego silnika:
[audyt E2](hormone-lifespan/evidence/female-estradiol-reference-audit-2026-10-17.json).
Zgoda na wdrożenie nie nadaje modelowi statusu walidacji klinicznej.

## FSH CALIPER — zwykłe odniesienie od 16 lat, 18 października 2026

Po analizie pełnego Wilson 2023 i Supplemental Tables 1–3 właściciel
polecił mały PR z FSH. `fsh-caliper-reference-policy.json` przełącza
zwykłe FSH od 16: chłopcy `[16,18)`, dziewczęta `[16,19)`. Madsen FSH
zachowuje wszystkie węzły, ale zwykłe zastosowanie kończy przed 16.
To celowa zmiana źródła także w dokładnym wieku 16, aby wpis 16 lat
0 miesięcy nie przecinał dwóch źródeł. Nie harmonizuj metod ani nie
uśredniaj median na styku.

Mediana CALIPER to znormalizowany `qBCCG(0.5)`, nie automatycznie M;
u dziewcząt F18 wynosi 4,3996476844 IU/L zamiast M4,3159775325.
Nie stosuj logarytmicznej transformacji LH do natywnego FSH.
PCHIP przybliża tabelę co 0,1 roku. Węzeł 19 służy interpolacji,
nie kwalifikacji pacjentki >=19. Brak dodatkowych pytań o Th/G lub cykl.
Znane niezgodna metoda/materiał, ciąża, leczenie i stymulacja zachowują
bramki; brak informacji nie potwierdza ich nieobecności.

Porównanie płci nadal ma Madsen 6–16 włącznie: jego polityka jawnie
zachowuje opublikowany męski węzeł 16 w kopii profilu. Nie rozszerza
zwykłej kwalifikacji ani granic porównania. Zachowaj geometrię, skale,
LH, niemowlęta i normy. Sam suplement nie uprawnia do importu LH/E2/T;
pozostają tam odrębne niejasności transformacji i żeńskiego LH.

Źródło, reprodukcja i ograniczenia:
[audyt FSH](hormone-lifespan/evidence/fsh-caliper-reference-audit-2026-10-18.json).

## Męskie AMH — źródłowa mediana grupy w 18–<20, 18 października 2026

Właściciel polecił mały PR uzupełniający wyłącznie tę lukę. Stosuj
`male-amh-young-adult-reference-policy.json`: Woloszynek 2015, tabela 2,
mediana **całej grupy 18–30 lat, N=63, 6,3 ng/mL**. Domena aplikacji
`[18,20)` nie tworzy mediany nowej podgrupy ani ciągłego modelu wieku.
Cały możliwy wiek musi pasować. `group-median`, `constant`, `ordinaryOnly`.
Korzystaj z tego samego przeliczenia 0,1401 co dla wyniku pacjenta.

Zachowaj 80 wcześniejszych profili, geometrię, skale, porównania płci,
normy i dawne utrwalone oceny. Krzywa przez 18–20 nadal jest ilustracją;
jasny znacznik wskazuje medianę grupy niezależnie od jej wysokości.
Surowica, wąsko określony protokół manualnego Gen II ELISA, bez zgodności
domniemanej dla zmodyfikowanego Gen II lub metod automatycznych.
Znana niezgodność blokuje punkt, nie uruchamia zastępczego źródła.
Nie dodawaj nowych pól lub wnioskowania o stadium, płodności, RI czy SDS.
Poprzednie opisy luki 18–<20 są historyczne i zostają uzupełnione tym wpisem.

Źródło i ograniczenia:
[audyt AMH 18–<20](hormone-lifespan/evidence/male-amh-18-20-reference-audit-2026-10-18.json).

## LH chłopców — odtworzona mediana w (16,18), 18 października 2026

Po audycie źródłowym właściciel polecił mały PR wyłącznie dla chłopców.
`male-lh-caliper-reference-policy.json` dodaje jeden profil `ordinaryOnly`
ściśle w `(16,18)`, bez zmian 81 wcześniejszych profili, krzywej, skali,
porównania płci, norm i formularza. Dokładne 16 zachowuje Madsen
3,5142066372549756 IU/L; od 18 pozostaje Laurentino 3 IU/L. Cały możliwy
wiek musi pasować. Wpis 16 lat 0 miesięcy lub 16 ukończonych lat nadal
obejmuje styk źródeł i nie otrzymuje arbitralnej mediany ze środka wieku.

Wilson 2023, Supplemental Table 3 `LH_M`, dostarcza 91 węzłów L/M/S
10–19 co 0,1 roku, nie miesięcznych. Mediana to znormalizowany
`qBCCG(0.5)`, potem `exp(q)/1e6` IU/L. To zaakceptowana rekonstrukcja:
artykuł opisuje logarytmowanie, przypięty kod współautora
`288329c43ee238b3c8921097dfeac411d30465b9` wspiera konwencję, a pięć
centyli odtwarza rycinę na 89 punktach wieku. Późniejszy przykład T4/TSH
nie jest dokładnym preprocessingiem LH Wilson. Nie nazywaj rekonstrukcji
odzyskanym modelem ani zwalidowaną normą. Żeński arkusz pozostaje
niespójny z ryciną i nie daje nowego profilu. Nie dodawaj RI, SDS lub
percentyla wyniku. PCHIP przybliża stężenia z pełnej tabeli; nie refituj
samego wycinka 16–18. Dla M17 odniesienie wynosi 2,603196549069626 IU/L.

Surowica, Abbott ARCHITECT ci2000 LH; znana niezgodność metody/materiału
blokuje bez fallbacku, nieznane dopuszczają porównanie edukacyjne.
Zachowaj istniejące bramki leczenia, GnRHa, kanonicznej stymulacji
i tożsamości; nie zakładaj nowego przekazywania pól dawnych protokołów.
LLOQ 0,09 IU/L nie jest LOD ani podłogą wyniku. Edukacyjna mediana LH
nie trafia do historii; snapshot źródłowego odniesienia pozostaje AMH-only.
Zapisana laboratoryjna ocena LH i odczyt bez ponownego liczenia pozostają
odrębne. Źródła i granice:
[audyt](hormone-lifespan/evidence/male-lh-caliper-reference-audit-2026-10-18.json),
[kontrakt punktu](hormone-lifespan/PATIENT_POINT.md#lh-chłopców--odtworzona-mediana-w-1618-18-października-2026).

## Testosteron chłopców — grupy Kushnir 1–<3, 21 października 2026

Właściciel zaakceptował dwa przybliżone odniesienia grupowe po audycie
pełnego Kushnir 2010, ryc. 4C, s. 1146, DOI
[10.1373/clinchem.2010.143222](https://doi.org/10.1373/clinchem.2010.143222).
`male-testosterone-childhood-reference-policy.json` stosuje `[1,2)`
i `[2,3)`, `ordinaryOnly`, `group-median`, `constant`, `approximate`.
To jawna konwencja aplikacji, nie odzyskane nierówności wieku autorów.
Cały możliwy wiek musi pasować do jednej grupy. Brak G nie blokuje
porównania; nie wnioskuj G1 z wieku i nie dodawaj pytań.

- Dwa czarne markery Te chłopców odczytano jako około 0,03/0,02 µg/L,
  czyli 0,10401/0,06934 nmol/L według istniejącej konwersji. Zachowaj
  grupowy charakter i znak ≈, bez pozornej dokładności konwersji w UI.
- Środek bounding box jest jedną konwencją dla obu markerów. Różnica
  od centroidu i zaokrąglenie dają oszacowaną tolerancję około ±5 ng/L;
  nie jest to CI ani norma. N rocznych grup nie podano; N123/125
  z tabeli 1 nie można automatycznie przenieść do grup ryciny.
- Surowica, derywatyzacyjne dwuwymiarowe LC-MS/MS, LOD/LOQ5/10 ng/L.
  Mediany są ponad LOQ; nieznana reguła cenzury pojedynczych obserwacji
  pozostaje ograniczeniem. Pobranie po indukcji znieczulenia i 24 wysokie
  wyniki całej młodszej kohorty należą do źródeł; dodatkowe 90% RI nie
  jest skorygowaną medianą. Nie uśredniaj z Kulle N9/osocze/≈0,4 nmol/L.
- Zachowaj 82 wcześniejsze profile, w tym Kelsey od dokładnie 3 lat,
  krzywą i stałą skalę oraz osobne Mayo RI wieku/G. Przejścia grup
  i źródeł nie są zdarzeniami biologicznymi; nie dociągaj do nich linii.
  Jasny znacznik pozostaje na medianie, nawet gdy ilustracja jest wyżej.
- Nie rozszerzaj na >212 dni–<1 roku, inne anality, porównanie płci lub
  historię. Znana niezgodność metody/materiału, leczenie, stymulacja,
  niepewny wiek, cenzurowany wynik i tożsamość zachowują bramki.

Źródło, geometria odczytu, SHA256 i ograniczenia:
[ekstrakt](hormone-lifespan/evidence/patient-point/kushnir2010-male-testosterone-group-medians.json),
[kontrakt punktu](hormone-lifespan/PATIENT_POINT.md#testosteron-chłopców--przybliżone-mediany-dwóch-grup-21-października-2026).
Akceptacja porównania edukacyjnego nie jest walidacją kliniczną.

## Co sprawdzić przed oddaniem zmiany

- Osobno porównaj dane źródłowe, wynik funkcji odniesienia i geometrię.
  Zmiana uchwytów łuku nie może zmienić mediany/średniej, norm ani werdyktu.
- Na rzeczywistych funkcjach produkcyjnych sprawdź granice źródeł,
  niepewny wiek, jednostki, brak danych i brak ekstrapolacji. Dla aktualnego
  T: 44 lata → średnia 18,1; 82 lata → 15,9; >86 → brak odniesienia;
  2 lata → przybliżona mediana grupy Kushnir 0,06934 nmol/L;
  wcześniejsze pediatryczne mediany pozostają niezmienione.
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
