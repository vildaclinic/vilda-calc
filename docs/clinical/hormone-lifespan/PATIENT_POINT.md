# Punkt wyniku na wykresie hormonów

Decyzja właściciela z 10 października 2026: wdrożyć zatwierdzony czerwony
punkt na dostępnych danych liczbowych, wykorzystując istniejący formularz.
Zakres decyzji dotyczy orientacyjnej prezentacji edukacyjnej; nie jest
nadaniem statusu walidacji klinicznej modelom ani digitalizacji rycin.

## Znaczenie i dane wejściowe

Punkt pokazuje wpisane stężenie, a jego znacznik odniesienia — centralną
wartość modelu populacyjnego. Linia zwykle odtwarza ten model; męska
inhibina B i testosteron całkowity mają osobno opisane niżej płynne
prezentacje wielu źródeł.
W zależności od źródła jest to opublikowane p50 lub odczytana
z ryciny krzywa 0 SD, z odpowiednią informacją o przybliżeniu. Przy grupach
wieku Wang i Zec zamiast ciągłej krzywej wieku widoczny jest lokalny poziomy
odcinek mediany jednej grupy; nie jest to p50 dokładnego wieku. Określenie
„średnia” nie zastępuje mediany; linia nie jest granicą normy. Kolor czerwony
identyfikuje pacjenta i nie nadaje wynikom statusu nieprawidłowych.

Wykorzystujemy aktualny analit, surowy zapis wyniku, jednostkę, wiek, płeć
i znane dane urodzeniowe oraz aktualne stadium gonadalne z istniejącego
kontekstu. Wybór źródła nie zależy
od wartości wyniku. Nie potwierdza metody próbki, materiału, leczenia ani
stadium. Nie tworzy nowego selektora lub historii pomiarów. Znane leczenie
lub stymulacja nie uprawniają do opisywania odniesienia zdrowej populacji
jako dostosowanego do tego kontekstu.

Dokładny punkt wymaga liczby skończonej i zgodnej jednostki. Nierówności,
nieznane jednostki, brak wyniku/wieku/płci i brak właściwego profilu nie
tworzą zastępczej liczby. Nie utożsamiamy testosteronu wolnego z całkowitym.
Nie przypisujemy wyniku do innego hormonu po zmianie wyboru. Brak punktu
na wykresie nie blokuje osobnej, dostępnej interpretacji laboratoryjnej.

## Aktywne źródła

Przedziały poniżej są polityką tego wykresu, a nie nowymi normami.
Każda publikacja zachowuje osobny profil, metodę, jednostkę i pochodzenie
liczb. Nie ma jednej zwalidowanej krzywej od urodzenia do starości.

| Profil i zastosowanie | Konkretne źródło liczb | Populacja, materiał i metoda | Ograniczenia |
| --- | --- | --- | --- |
| Męskie LH, FSH, testosteron całkowity, AMH, inhibina B; 7 dni–<1 roku | [Busch 2022](https://doi.org/10.1210/clinem/dgac115), ryc. 3, str. 1565; czarna mediana GAMLSS odczytana z wektorów PDF | 119 zdrowych donoszonych chłopców, ciąże pojedyncze, 338 próbek surowicy, COPENHAGEN Minipuberty; AutoDELFIA LH/FSH, Access 2 AMH, Gen II ELISA inhibina B, LC-MS/MS testosteron | Ekstrakcja obejmuje 7–400 dni; aktywny profil kończy się przed 1. rokiem. To przybliżenie ryciny, nie parametry autora ani średnia podłużna z ryc. 2. Osobna bramka rozdzielczości opisana niżej. |
| Męskie LH i FSH; 6–16 lat | [Madsen 2022](https://doi.org/10.1210/clinem/dgac155), [Supplemental Table 1](https://doi.org/10.6084/m9.figshare.17153336.v1), arkusz `Other biomarkers`, wiersze 17–27, kolumny B:E i G:J | Norwegia, BGS2; 414 dostępnych męskich próbek w tabeli kohorty, liczebność oznaczenia może się różnić; surowica, pobrania 08:00–14:00, Siemens IMMULITE 2000 XPi | 11 rocznych węzłów na hormon. `p50 = exp(M)/1e6`. Wiek chronologiczny, bez wyznaczania stadium Tannera. Bez ekstrapolacji na dorosłych. |
| FSH przed pokwitaniem: chłopcy 1–<6 lat/G1; dziewczynki 1–<4, 4–<8 i 8–<11 lat/Th1 | [Zec 2012](https://doi.org/10.1016/j.clinbiochem.2012.05.019), tabela 2, str. 1210/PDF 5: chłopcy grupa źródłowa 1–<8 lat, mediana 0,48 IU/L, N=303; dziewczynki kolejno 2,57/1,07/1,55 IU/L, N=124/156/107 | Zagrzeb, Chorwacja, Tanner 1; całe badanie N=948, nie każdy hormon oznaczano u każdego dziecka. Roche cobas e 411, kanapkowe ECLIA; zbierano surowicę i osocze Li-heparynowe, bez przypisania materiału do analitu | Mediany całych grup, nie model dokładnego wieku. Aktualne typowane G1/Th1 jest wymagane. U chłopców od 6 lat zachowujemy Madsen, lecz mediana 0,48 i N=303 nadal opisują pełną grupę źródłową 1–<8. Źródłową grupę chłopców 8–<11 (0,79 IU/L, N=117) zachowujemy wyłącznie w dowodach. |
| Męski testosteron całkowity; 3–88 lat | [Kelsey 2014](https://doi.org/10.1371/journal.pone.0109346), Table S1, A1/B2:B8; [korekta 2015](https://doi.org/10.1371/journal.pone.0117674), poprawiona tabela 3 | Połączone 13 badań, 10 097 obserwacji, niekoniecznie niezależnych osób; surowica, różne oznaczenia przeliczone przez autorów do odpowiednika LC-MS/MS | Węzły co 0,1 roku z funkcji centralnej `log10(T+1)` po odwróceniu transformacji, zgodne z poprawionym p50; między węzłami PCHIP. Nie średnia arytmetyczna stężeń. Model po 40 latach jest niemal płaski; nie wymuszać spadku ze starego schematu. |
| Męska inhibina B; 1–<6,1 roku | [Kelsey 2016](https://doi.org/10.1371/journal.pone.0153843), tabela 4, opublikowane węzły p50 | Cztery badania, 709 obserwowanych par wiek–stężenie; surowica, historyczne dwumiejscowe ELISA | Pełna tabela 0–17 lat pozostaje dowodem, wybrany odcinek jest polityką aplikacji. Nie używać rocznej tabeli do minipuberty. Nie odtwarzać modelu zaokrąglonymi współczynnikami z tabeli 2. |
| Męska inhibina B; 6,1–80 lat | [Borelli-Kjær 2025](https://doi.org/10.1210/clinem/dgae439), ryc. 2, męska linia 0 SD | Dania, 1818 uczestników/2007 próbek łącznie; surowica; mieszane Oxford Bio-innovation i Gen II ELISA | Digitalizacja około ±5 pg/mL, nie dokładna funkcja autora ani kalkulator SDS. `ng/L = pg/mL`. Nie przeliczać dowolnej metody współczynnikiem różnicy Oxford/Gen II. Nie łączyć z Kelsey jako jednym modelem odniesienia pacjenta; wygładzona wspólna linia jest wyłącznie prezentacją. |
| Męskie AMH; osobne roczne grupy 1–11, 13 i 14 | [Wang 2020](https://doi.org/10.1016/j.cca.2020.03.028), tabele 1 i 2, str. 156/PDF 3; zgodne mediany obu tabel | 2009 zdrowych chłopców, Wuhan, Chiny; badanie przekrojowe, szpital i pięć szkół; surowica pobierana 08:00–10:00, Beckman Coulter Access 2 | 13 zgodnych median grupowych, nie ciągły model ani mediany Tannera. Grupy 0 i 12 wyłączone z powodu sprzecznych median. Przypisanie etykiety N do `[N,N+1)` jest jawną konwencją aplikacji; autorzy nie podali reguły zaokrąglania wieku ani maksymalnego obserwowanego wieku. Brak interpolacji między grupami. |
| Męskie AMH; 30–70 lat | [Tehrani 2017](https://doi.org/10.1371/journal.pone.0179634), tabela 2, 41 rocznych p50 | 831 zdrowych mężczyzn z Tehran Lipid and Glucose Study; surowica, zmodyfikowany AMH Gen II EIA, na czczo 07:00–09:00 | Mediany swoiste dla wieku; pomiędzy nimi interpolacja. Nie zamieniać na osocze Access ani nie przedłużać przed 30. i po 70. roku. |
| Żeńskie LH, FSH, AMH, inhibina B, E2; 0,02–1 roku (FSH: 0,02–<1 roku) | [Ljubicic 2022](https://doi.org/10.1210/clinem/dgac363), ryc. 1 i [Supplementary Table 1](https://doi.org/10.6084/m9.figshare.19469555.v1), 99 median na hormon | 98 zdrowych donoszonych dziewczynek, 266 próbek surowicy; AutoDELFIA LH/FSH, Access 2 AMH, Gen II ELISA inhibina B, LC-MS/MS E2 | Pierwszy zachowany węzeł 0,02 roku, nie urodzenie. Mediany GAMLSS nie są średnimi podłużnymi z ryc. 3. Nie dopisywać stężeń przed pierwszym węzłem. Wyłącznie dla FSH pierwsze urodziny należą już do profilu Zec z własnym warunkiem stadium; nie stosujemy zastępczo profilu niemowlęcego. |

INSL3 pozostaje zadaniem przyszłego kalkulatora. Zachowane wartości
niemowlęce z Busch nie uruchamiają nowego analitu. Dorosłe LH/FSH, dziecięce
AMH poza wymienionymi grupami, pozaniemowlęce profile żeńskie poza FSH Zec i niepokryte
fragmenty osi pozostają bez ilościowego punktu. Dostępny schemat nie wypełnia
tej luki. Mediana szerokiej grupy wieku nie staje się ciągłym modelem wieku;
odrębna grupowa prezentacja wymaga własnej polityki źródłowej, jak Wang i Zec.
Dane płodowe, pępowinowe i wcześniacze nie należą do powyższych profili.

Uzupełnienia inhibiny B opisuje [INHIBIN_EVIDENCE.md](INHIBIN_EVIDENCE.md):
dwie wizyty minipuberty Kuiri-Hänninen, stadia G Crofton oraz średnie grup
Baccarelli są osobnymi prezentacjami. Nie dopisują węzłów do powyższych
median wieku. Wyjątkiem od medianowego punktu jest jawnie oznaczone
porównanie ze **średnią grupy** dla mężczyzn 80–101 lat, w osobnym wykresie
grupowym i z własnymi warunkami kwalifikacji. Nie przedłuża ono osi głównej.

### Stała, płynna linia męskiej inhibiny B

Decyzja właściciela z 10 października 2026 zastępuje osobne przycinane
ścieżki i przerywane łączniki PR #615 jedną ciągłą linią. W zwykłych
widokach życia, minipuberty i pokwitania ta sama krzywa edukacyjna jest
widoczna bez wyniku i z wynikiem. Wiek, wcześniactwo, materiał i metoda
próbki nie zmieniają jej kształtu ani pionowej skali; nadal określają,
czy wolno na niej umieścić wynik danej osoby. Porównanie płci zachowuje
odrębną politykę i skalowanie opisane w
[HORMONE_LIFESPAN.md](../HORMONE_LIFESPAN.md).

Linia wykorzystuje oryginalne punkty Busch, Kelsey i Borelli w ich
oknach podanych wyżej. `vilda_hormone_lifespan_display.js` przygotowuje
stałe węzły; renderer buduje z nich jedną ścieżkę PCHIP z ciągłą styczną
(C1) we współrzędnych osi całego życia.
Zbliżenie wycina jej przedział, bez ponownego dopasowania krzywej.
Polityka jest zapisana w `inhibin-display-policy.json`, eksportowanym
jako `inhibinDisplayPolicy`; funkcja produkcyjna to
`VildaHormoneLifespanDisplay.buildMaleInhibin`.
Płynne przejścia 0,75–2 lat oraz 4,5–7 lat należą do jawnej polityki
graficznej, nie do publikacji. Trzeci pas 18–25 lat wygładza widoczne
załamanie przy zmianie skali czasu w 20. roku, w obrębie tego samego
źródła Borelli. Styczne na końcach pasów odpowiadają lokalnym pochodnym
źródłowego przebiegu, aby uniknąć krótkich zagięć. Nie tworzy to wspólnej
zwalidowanej mediany ani norm. Odcinek płodowy korzysta z dotychczasowych kotwic poglądowych,
bez wcześniejszego dołka przy urodzeniu, i dochodzi do danych z 7. dnia.
Zakończenie 80–90 lat pozostaje płaską ilustracją zakotwiczoną w końcu
Borelli (140 pg/mL). Nie przedłuża źródłowego profilu dla pacjenta.

Mediana pacjenta nadal pochodzi wyłącznie z
`vilda_hormone_lifespan_reference.js`, z niezmienionych danych i bramek
profilu. Wynik i znacznik mediany używają wspólnej liniowej skali:
stałe źródłowe maksimum 309,779035 pg/mL × zapas 1,25, czyli około
387,22379 pg/mL na górze osi. Wynik ponad tę wysokość jest oznaczany
strzałką w górę i pełną wartością, bez fałszywej kropki na granicy osi
oraz bez przeskalowania krzywej. Wartość dokładnie na granicy pozostaje
punktem. Zapis cenzurowany nie staje się strzałką dokładnego wyniku.

W pasie wygładzenia znacznik źródłowej mediany może leżeć poza krzywą
edukacyjną: zachowujemy go, zamiast przesuwać medianę lub wynik na linię.
Przykładowo dla dokładnie 1 roku i 223 pg/mL oba znaczniki są na wysokości
oryginalnej mediany Kelsey 223, niezależnie od przebiegu wygładzenia.
Dla dokładnie 44 lat mediana Borelli pozostaje około 162,084705882 pg/mL;
wynik 88 pg/mL leży poniżej niej. Ta dokładność służy regresji technicznej;
UI respektuje przybliżony charakter odczytu ryciny.

Nieznane donoszenie lub wcześniactwo blokuje dopasowanie niemowlęcego
punktu do Busch, ale nie usuwa tej populacji z ogólnej prezentacji zmian.
Gdy wiek jest poza wybranym zbliżeniem, punkt znika i krzywa pozostaje
niezmieniona. Porównanie starszego pacjenta ze średnią Baccarelli nadal
korzysta z osobnego wykresu grupowego, nie z poglądowego ogona.

### Stała, płynna linia męskiego testosteronu całkowitego

Po audycie z 10 października 2026 właściciel zatwierdził stabilizację
prezentacji przy zachowaniu obecnych źródeł i warunków kwalifikacji.
Busch 2022 i Kelsey 2014/2015 są stałą podstawą ogólnego przebiegu;
wpisanie, zmiana lub wyczyszczenie wyniku nie zmienia linii ani skali.
Zmiana wieku, donoszenia, metody lub wybranego zbliżenia może usunąć
niedopasowany punkt, lecz nie podmienia populacyjnego przebiegu.
Nie aktywujemy nowego testosteronowego profilu Madsen ani danych wolnego T.

Polityka graficzna `testosterone-display-policy.json` jest eksportowana
jako `testosteroneDisplayPolicy`; funkcja produkcyjna to
`VildaHormoneLifespanDisplay.buildMaleTestosterone`. Jedna ścieżka PCHIP
z ciągłą styczną (C1) powstaje w kanonicznych współrzędnych osi całego
życia. Zbliżenie i pełny ekran pokazują tę samą geometrię, bez ponownego
dopasowania i bez normalizowania każdego okresu osobno.

- **150 dni–4 lata:** monotoniczny most poglądowy od około 0,895098 nmol/L
  Busch do około 0,391750487 nmol/L Kelsey, bez narzucania stromych
  stycznych źródłowych. To decyzja graficzna obejmująca również dostępne
  odcinki źródeł, nie tylko lukę 1–3 lata. Unika sztucznego wzrostu przy
  łączeniu niskiego końca niemowlęctwa z inną populacją Kelsey. Nie jest
  nowym modelem stężenia dla dzieci; źródłowy znacznik mediany może
  przebiegać poza linią.
- **19,3–25 lat:** przejście w obrębie Kelsey łagodzi załamanie
  skompresowanej osi w 20. roku. Zachowuje szczyt źródłowych węzłów
  przy 19,3 roku i lokalne styczne źródła na końcach pasa.
- **Przed urodzeniem:** zachowane kotwice schematu do wieku 0 są
  ilustracją, nie ilościowym profilem płodowym lub pępowinowym.
- **88–90 lat:** płaskie zakończenie przy około 13,222919802 nmol/L
  jest zakotwiczone w ostatnim węźle Kelsey; nie przedłuża jego zakresu
  odniesienia pacjenta poza 88 lat.

Stałe maksimum źródłowych węzłów to 15,41843900285427 nmol/L, a zapas
1,25 daje górną wysokość osi 19,27304875356784 nmol/L. Te cyfry służą
regresji technicznej, nie dokładności klinicznej. Punkt pacjenta i znacznik
mediany korzystają z tej samej skali. Wynik większy od góry osi jest
strzałką w górę z rzeczywistą wartością; równość z granicą nadal daje
punkt. Pusty, błędny lub cenzurowany zapis nie daje zastępczej strzałki.

`vilda_hormone_lifespan_reference.js` i jego dane nie zmieniają się.
Mężczyzna 40 lat/13 nmol/L pozostaje poniżej odniesienia
13,049603876520182 nmol/L; 100 nmol/L jest poza stałą wysokością osi.
Chłopiec 2 lata nadal nie ma ilościowego punktu. Donoszenie i techniczna
bramka rozdzielczości Busch pozostają wymagane dla punktu niemowlęcia;
graficzny most nie obchodzi ich ani nie wyznacza końca minipuberty.
Zmiana obejmuje prezentację edukacyjną, bez nowych norm, median,
werdyktów, jednostek ani zmian zapisanych wyników.

## Transformacje, źródła i granice

Madsen: parametry dotyczą `X = ln(stężenie w jednostce SI × 1e6)`.
Stąd dla `z=0` zachodzi `X=M`, czyli stężenie `exp(M)/1e6`. Sama wartość
M nie jest medianą w IU/L. Przykłady arkusza K36/K37 potwierdzają logarytm;
formuła przykładu testosteronu L37 ma błędne odwołanie w mianowniku i nie
jest kopiowana do aplikacji. To nie wpływa na wyznaczenie p50 z M.

Kelsey 2014/2015: stosujemy pełną precyzję współczynników funkcji wymiernej
`q(a)=(A+C·a+E·a²+G·a³)/(1+B·a+D·a²+F·a³)`, następnie
`T(a)=10^q(a)−1` w nmol/L. Poprawiona tabela p50, nie pierwotne błędne
centyle, jest niezależnym sprawdzeniem. Generator oblicza węzły co 0,1 roku;
runtime interpoluje je PCHIP. Porównanie produkcyjnej interpolacji z funkcją
źródłową co 0,005 roku w przedziale 3–88 lat wykazało maksymalny błąd
0,000121 nmol/L; regresja wymaga błędu poniżej 0,00013 nmol/L.
Funkcja nie może kwalifikować wieku
poza 3–88 lat tylko dlatego, że algebraicznie zwraca liczbę.

**Otwarte ustalenie audytu testosteronu, bez zmiany źródła:** w dzieciństwie
Kelsey istotnie różni się od bezpośrednich oznaczeń LC-MS/MS
[Madsen 2022](https://doi.org/10.1210/clinem/dgac155). W wieku 6 lat
centralne wartości wynoszą odpowiednio około 0,323 i 0,02394 nmol/L.
Niezależny odczyt oryginalnych współczynników i transformacji nie wykazał
błędu jednostki. Madsen podaje LLOQ 0,02 nmol/L, więc jego p50 nie wolno
odrzucać jako wartości poniżej tego progu; reguła przygotowania obserwacji
poniżej LLOQ pozostaje niewyjaśniona. To różne populacje i metody, nie
dowód błędnego wyniku pojedynczego dziecka. Decyzja o osobnym dziecięcym
profilu, jego granicach i przejściach wymaga osobnego wdrożenia klinicznego;
stabilizacja grafiki nie rozstrzyga tego problemu. Luka 1–<3 lat pozostaje
bez dokładnej mediany pacjenta.

Audyt modelu Kelsey potwierdził zgodność 1020 wierszy Table S1 i wszystkich
86 p50 skorygowanej tabeli Kelsey. Nie zmieniamy plateau na spadek wyłącznie
dla wyglądu. Nowsza [metaanaliza Marriott/Yeap 2023](https://doi.org/10.7326/M23-0342)
opisuje względną stabilność średniego całkowitego T przed 70 lat i spadek
później, zależny również od zdrowia i BMI. Są to skorygowane różnice średnich,
nie bezwzględne mediany do podmiany. Kelsey pozostaje jednym modelem źródłowym,
nie uniwersalną trajektorią zdrowego mężczyzny. Nie zastępujemy całkowitego T
publikacjami dotyczącymi wolnego T ani nie ekstrapolujemy p50 powyżej 88 lat.

Kelsey 2016: zaokrąglone współczynniki powodują narastający błąd, np.
w 17. roku około 284,9 zamiast opublikowanego p50=304 pg/mL. Dlatego
podstawą są węzły tabeli, a nie ponowne dopasowanie modelu z surowych danych.
Przejście do Borelli przy 6,1 roku jest zmianą badania i nie może być
przedstawione jako nagły fizjologiczny spadek ani jednolita krzywa populacji.

Busch: osie zostały skalibrowane z opisanych podziałek, przebieg odczytano
z wektorów bez wtórnego wygładzania ekstraktu. Maksymalna reszta kalibracji
wieku jest mniejsza niż 0,051 dnia. Dla punktu przyjęto konserwatywną bramkę
wyświetlania: mediana musi być co najmniej równa `LOD/LOQ + połowa grubości
linii w jednostce stężenia + maksymalna reszta kalibracji Y`. To heurystyka
rozdzielczości grafiki, nie przedział ufności modelu, norma, warunek autora
ani próg rozpoznania. Nie podnosimy surowych median do sztucznej wartości
minimalnej. W zapisanym odczycie ostatnie całe dni kwalifikujące punkt to
243 dla LH i 212 dla testosteronu; FSH, AMH i inhibina B zachowują punkt
do końca aktywnego okresu niemowlęcego. INSL3 miałby dodatkowo problem
jednostki między tekstem a ryciną i nie jest nowym kalkulatorem.

Wang: źródło oznacza grupy wieku liczbami 0–14, a na ryc. 1 ich środki
znajdują się w przybliżeniu przy N+0,5 roku. Nie opisuje dokładnej reguły
zaokrąglania wieku. Dlatego `[N,N+1)` jest wyłącznie jawną konwencją
doboru rocznej grupy w edukacyjnej prezentacji, nie opublikowaną definicją
granic. Dotyczy to również grupy 14: konwencja `[14,15)` nie dowodzi,
że autorzy obserwowali wszystkie dokładne wartości wieku aż do 15 lat.
Każda zgodna grupa ma osobny profil `group-median`, stałą wartość i własną
liczebność. Dwa jednakowe węzły wyznaczają tylko lokalny poziomy odcinek;
nie wygładzamy spadków między rocznymi medianami ani nie łączymy tych
odcinków z Busch lub Tehrani. Nie imputujemy konfliktowej grupy 12 z sąsiadów.
Przy niepewnym wieku przecinającym granicę grup punkt nie może udawać
jednoznacznego porównania z jedną z median.

W tabeli 1/tabeli 2 mediana grupy 0 wynosi odpowiednio 134,58/131,58 ng/mL,
a grupy 12 — 6,99/7,99 ng/mL. Zachowujemy oba zapisy jako dowód konfliktu
i nie aktywujemy żadnego z nich. Regresje suplementu S1 nie są opisane
jako modele mediany/kwantylowe; nie służą do rozstrzygnięcia błędu tabel
ani do odtworzenia ciągłego p50. Pierwszy rok Wang nie zastępuje
dokładniejszych danych minipuberty. Brak danych Tannera i wcześniactwa
nie pozwala nazwać mediany normą stadium lub źródłem wcześniaczym.
Metoda dotyczy kohorty, nie stanowi potwierdzenia metody wyniku pacjenta.

Zec: tabela 2 podaje dokładne granice grup jako dolną włącznie i górną
wyłącznie. Cztery aktywne profile przechowują stałe mediany grupowe;
nie interpolujemy między nimi ani nie zamieniamy ich w ciągły przebieg FSH.
Okno aplikacji chłopców 1–<6 lat jest wyłącznie polityką zachowania
dotychczasowego Madsen od 6 lat. Etykieta porównania i liczebność nadal
opisują źródłową grupę 1–<8 lat, a nie nieistniejącą podgrupę N=303 w wieku
1–<6 lat. Granice 4 i 8 lat u dziewczynek należą do kolejnej grupy;
niepewny wiek obejmujący dwie grupy lub dwa źródła nie daje jednego punktu.

Kohorta Zec obejmowała wyłącznie Tanner 1; odrzucono 14 dzieci w stadium 2.
Profil ma `requiredGonadalStage: 1`. Adapter przekazuje tylko aktualną,
jednoznacznie powiązaną z bieżącym kontekstem obserwację gonadalną:
G1 u chłopca lub Th1 u dziewczynki. Nie ustalamy stadium z wieku, wyniku,
samego numeru Tannera, P ani Ax. Nie używamy obserwacji historycznej.
Brak takiego stadium lub znane stadium 2–5 nie dopasowuje punktu Zec;
nie dodaje nowego pola i nie blokuje niezależnej oceny laboratoryjnej.
W porównaniu płci nie przenosimy stadium pacjenta na drugą płeć:
jeżeli ilościowe porównanie wymaga Zec, pozostaje dotychczasowy schemat.

Pełna kohorta N=948 zawierała dzieci kierowane m.in. z ostrymi infekcjami,
na badania alergologiczne i przed zabiegami; nie opisujemy jej jako czystej
próby zdrowych ochotników. FSH oznaczono u 807 uczestników, zgodnie z sumą
liczebności pięciu grup tabeli. W tabeli 1 (str. 1208/PDF 3) LOD FSH wynosi
0,1 IU/L, LOQ nie podano; żadna aktywna mediana FSH nie jest cenzurowana.
Brak przypisania surowicy lub osocza Li-heparynowego do konkretnego
hormonu pozostaje ograniczeniem źródła. Nie deklarujemy zgodności innych
metod Roche ani metody Mayo wyłącznie na podstawie wspólnego producenta.
LH i testosteron z cenzurowanymi medianami nie są aktywowane, nie przenosimy
zakresów referencyjnych Zec do silnika norm laboratoryjnych.

Jednostki źródłowe zachowuje się w danych: LH/FSH IU/L, testosteron nmol/L,
inhibina B pg/mL, żeńskie E2 pmol/L; AMH Busch/Ljubicic pmol/L, Tehrani
oraz Wang ng/mL. Runtime używa dla AMH pmol/L; ng/mL przelicza tym
samym współczynnikiem co wynik pacjenta (`1 ng/mL = 1/0,1401 pmol/L`).
Zaokrąglony współczynnik 7,14 z przypisu tabeli Wang pozostaje metadaną
źródła; nie mieszamy go z innym przelicznikiem punktu pacjenta.
Konwersja jednostki pacjenta musi być jawna i wspólna z rysowaniem.
Zgodność jednostek nie dowodzi zamienności metod oznaczenia.

Punkt i znacznik źródłowej mediany używają wspólnej monotonicznej funkcji
skali. Płynna linia męskiej inhibiny B ma wyłącznie opisane wyżej
graficzne przejścia między źródłami oraz pas 18–25 lat w obrębie Borelli.
Testosteron ma odrębną politykę graficzną opisaną wyżej; żaden z jego
mostów nie wyznacza mediany ani nie rozszerza wieku kwalifikacji.
Nie przycinamy punktu do zakresu `[0,1]` i nie przesuwamy wieku na brzeg
widoku. Odcinki interpolowane PCHIP pozostają w zakresie węzłów swojego
profilu; granica publikacji nie jest parą węzłów do interpolacji. W osobnym
porównaniu płci ewentualny punkt dotyczy tylko płci pacjenta i tej samej
skali co jej linia, nigdy obu populacji naraz.

Suplementy Madsen i Ljubicic oraz dane PLOS są CC BY (dokładna wersja
w metadanych źródła). Artykuł Madsen ma odrębną licencję CC BY-NC-ND.
Busch, Borelli, Wang i Zec zachowują prawa wydawcy: w aplikacji są liczbowe odczyty
i cytowania, bez reprodukcji PDF lub ryciny. Rozdzielczość digitalizacji
i przypisanie statystyki są częścią pochodzenia danych. Pełnych artykułów,
obrazów źródłowych i surowych danych uczestników nie publikujemy w repo.

## Weryfikacja i przypadki syntetyczne

Silnik `vilda_hormone_lifespan_reference.js` przyjmuje dane jako argument;
`selectProfile` dobiera źródło, `referenceAt` odtwarza jego centralną
wartość, `sampleProfile` przygotowuje linię, a `evaluate` kwalifikuje punkt.
Skrypt `build_patient_point_data.py` przygotowuje dane runtime; nie wpisujemy
progów publikacji jako ukrytych stałych silnika. Źródłowe liczby, adresy
komórek/pikseli, sumy SHA i ograniczenia pozostają w czytelnych ekstraktach.

Poniższe wartości są niezależnymi punktami kontrolnymi do testów rzeczywistej
funkcji, a nie wynikiem uruchomienia kopii silnika w teście:

| Fikcyjne wejście | Oczekiwana podstawa i zachowanie |
| --- | --- |
| Chłopiec 12 lat, LH 2 IU/L | Madsen p50=0,6775625214085037 IU/L; punkt powyżej linii, bez nowego werdyktu „poza normą”. |
| Chłopiec 12 lat, FSH 2,01486005633355 IU/L | Punkt na linii mediany Madsen w tolerancji obliczeń/rysowania. |
| Chłopiec 3 lata, aktualne G1, FSH 0,48 IU/L | Punkt na medianie Zec; etykieta pełnej grupy źródłowej 1–<8 lat, N=303, a nie mediana dokładnie dla 3 lat. |
| Chłopiec 3 lata, aktualne G2 lub brak typowanej obserwacji, FSH 0,48 IU/L | Brak punktu Zec; nie zakładamy G1 z wieku. Dostępna osobna ocena laboratoryjna pozostaje. |
| Chłopiec dokładnie 6 lat, FSH | Profil Madsen; nie przedłużamy okna Zec ani nie wymagamy G1 od profilu Madsen. |
| Dziewczynka 2 lata/aktualne Th1/FSH 2,57; 5 lat/Th1/1,07; 9 lat/Th1/1,55 IU/L | Punkt na medianie odpowiedniej całej grupy Zec: 1–<4, 4–<8, 8–<11 lat. |
| Dziewczynka dokładnie 1 rok, aktualne Th1, FSH 2,57 IU/L | Zec; profil niemowlęcy FSH kończy się przed pierwszymi urodzinami. Inne żeńskie profile Ljubicic zachowują dotychczasową granicę. |
| Dziewczynka 11 lat/Th1 lub 5 lat/Th2, FSH | Brak profilu Zec; bez ekstrapolacji wieku i bez użycia kohorty przedpokwitaniowej w pokwitaniu. |
| Dziewczynka Th1, możliwy wiek 3,99–4,01 roku, FSH | Brak jednoznacznego punktu; nie wybieramy jednej z median pośrodku niepewnego wieku. |
| Donoszony chłopiec, dokładnie 90 dni, LH 2,05589 IU/L | Punkt na przybliżonej medianie Busch; wartość ma dokładność odczytu ryciny, nie sześciu klinicznych miejsc dziesiętnych. |
| Donoszony chłopiec, 90 dni, inhibina B 300 pg/mL | Busch około 294,293798 pg/mL; punkt nieznacznie ponad linią. |
| Mężczyzna 40 lat, testosteron 13,049603876520182 nmol/L | Punkt na centralnej linii Kelsey 2014/2015. |
| Mężczyzna dokładnie 40 lat, testosteron: pusty → 13 → 100 → wyczyszczenie | Identyczna krzywa i skala; 13 poniżej oryginalnej mediany 13,049603876520182; 100 ma strzałkę z rzeczywistą liczbą, bez przyciętej kropki. |
| Chłopiec 2 lata, testosteron 0,1 nmol/L | Stała linia poglądowa, bez źródłowej mediany i bez punktu wyprowadzonego z mostu. |
| Donoszony chłopiec 180 dni, testosteron równy medianie Busch | Punkt równy źródłowemu odniesieniu; oba znaczniki mogą leżeć poza mostem poglądowym 150 dni–4 lata. |
| Chłopiec 3 lata, inhibina B 107 pg/mL | Punkt na węźle p50 Kelsey 2016, bez stosowania krzywej niemowlęcej do jego odniesienia. |
| Mężczyzna dokładnie 44 lata, inhibina B 88 pg/mL; przed wpisaniem, po wpisaniu i po wyczyszczeniu | Identyczna ścieżka i skala; wynik poniżej źródłowego odniesienia Borelli około 162,084705882 pg/mL. |
| Ten sam kontekst, inhibina B 1000 pg/mL | Ta sama ścieżka i skala; strzałka w górę z 1000 pg/mL, bez kropki na górnej granicy. |
| Chłopiec dokładnie 1 rok, inhibina B 223 pg/mL | Punkt i znacznik mediany Kelsey są zgodne; linia edukacyjna w pasie wygładzenia może przebiegać inaczej. |
| Chłopiec 5 lat i 6 miesięcy, AMH 99,18 ng/mL | Punkt na poziomym odcinku mediany rocznej grupy Wang 5–<6 lat, N=134; to nie p50 dla dokładnie 5,5 roku. |
| Chłopiec 11 lat i 6 miesięcy, AMH 20,70 ng/mL | Punkt na medianie grupy 11–<12 lat; profil kończy się przed 12. urodzinami. |
| Chłopiec 12 lat i 6 miesięcy, AMH 7 ng/mL | Brak punktu Wang: mediana grupy 12 jest sprzeczna między tabelami; brak interpolacji przez lukę. |
| Chłopiec 14 lat i 6 miesięcy, AMH 8,23 ng/mL | Punkt na medianie grupy oznaczonej 14, według jawnej konwencji `[14,15)`; brak ekstrapolacji po 15. urodzinach. |
| Chłopiec, możliwy wiek 5,99–6,01 roku, AMH 99,18 ng/mL | Brak jednoznacznego punktu dla jednej grupy; nie wybieramy mediany z połowy niepewnego przedziału. |
| Mężczyzna 40 lat, AMH 6,12 ng/mL | Punkt na rocznym p50 Tehrani; metoda Gen II w źródle, bez potwierdzania metody próbki. |
| Wcześniak 90 dni lub niemowlę z nieznanym donoszeniem | Brak dopasowania punktu do Busch/Ljubicic; bez użycia wieku skorygowanego. |
| LH `<0,05 IU/L`, dorosłe FSH, AMH w wieku 15–<30 lat, wiek poza źródłem | Brak dokładnego punktu, bez punktu zastępczego na zerze lub granicy osi. |

Regresje powinny objąć dzień przed/początek/koniec każdego profilu,
granice dwóch źródeł, blokadę graficznej podłogi, nierówności, jednostki
i konwersje, zmianę osoby/analitu/płci, odznaczenie hormonu, pełny ekran
oraz telefon. Dla inhibiny B i testosteronu dochodzą stałość krzywej i skali przy pustym,
poprawnym, błędnym i cenzurowanym wyniku oraz płynność stycznych przy
zmianie źródła i w pasach wygładzenia osi. Należy sprawdzić, że zbliżenia
T pokazują tę samą kanoniczną krzywą również poza wiekiem pacjenta.
Test równości punktu ze źródłowym
odniesieniem nie może
sprawdzać wyłącznie
wspólnej błędnej implementacji: potrzebne są też powyższe wartości źródłowe.
Zielone testy potwierdzają techniczne odtworzenie danych, nie walidację
medyczną ani przydatność diagnostyczną nowej wizualizacji.
