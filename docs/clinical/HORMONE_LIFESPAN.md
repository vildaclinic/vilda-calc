# Poglądowy przebieg hormonów przez życie

Zatwierdzenie właściciela: 9 października 2026, po przeglądzie makiet
desktopowych i mobilnych oraz po poprawach połączeń okresów życia i skali
minipuberty. Dane: `2026-10-09.5`. Zakres zatwierdzenia to prezentacja
edukacyjna, nie nadanie algorytmowi statusu walidacji klinicznej.

10 października 2026, po porównaniu kolejnych wariantów, właściciel
polecił powrót do „Pierwotnego przebiegu” z makiety. Przywrócono geometrię
sprzed PR #607; źródła medyczne i zakresy odniesienia pozostają bez zmian.

Następnie właściciel zatwierdził makietę czerwonego punktu wyniku i wdrożenie
na dostępnych danych liczbowych, bez nowych pól. Ta zmiana zastępuje dawny
zakaz zaznaczania wyniku **wyłącznie przy odrębnym modelu stężeń**. Źródła,
granice zastosowania i przypadki kontrolne opisano w
[PATIENT_POINT.md](hormone-lifespan/PATIENT_POINT.md). Nie wolno nadać
dotychczasowemu schematowi znaczenia mediany przez samo dodanie punktu.

Po analizie czterech dostarczonych pełnych tekstów właściciel polecił wdrożenie
uzupełnień inhibiny B: dwóch wizyt minipuberty według płci i donoszenia,
median G1–G5 oraz średnich grup wieku mężczyzn do 101 lat. Osobne małe
wykresy grupowe zachowują rodzaj statystyki i nie zastępują głównych modeli
wieku. Zakres i ograniczenia: [INHIBIN_EVIDENCE.md](hormone-lifespan/INHIBIN_EVIDENCE.md).
Nie rozszerza to norm laboratoryjnych ani nie zatwierdza danych jako
zwalidowanych klinicznie. Publikacji De Schepper nie aktywowano z powodu
niespójności tekstu i tabel.

Po zgłoszeniu zmiany kształtu po wpisaniu wyniku właściciel polecił
ujednolicić męską inhibinę B i zachować jedną płynną linię. Opisana niżej
stała krzywa edukacyjna zastępuje przełączanie schematu na osobne ścieżki
liczbowe oraz przerywane łączniki PR #615. Nie zmienia źródeł mediany
pacjenta ani laboratoryjnych zakresów odniesienia.

Historia zmian testosteronu: po audycie ustabilizowano jego prezentację.
Kolejny etap naprawy wprowadza pediatryczne p50 Madsen 2022 w wieku
6–<18 lat, zachowując Busch w niemowlęctwie i Kelsey 2014/2015
w wieku 3–<6 oraz 18–88 lat. Zmienia to edukacyjne odniesienie dziecka,
bez zmiany norm i werdyktów laboratoryjnych. Granice doboru oraz
ograniczenia źródeł opisano w [PATIENT_POINT.md](hormone-lifespan/PATIENT_POINT.md).

Po zgłoszeniu ostrego szczytu przy 17–18 latach właściciel zatwierdził
korektę samego połączenia graficznego. Szerszy pas 16–25 lat nie wymusza
przejścia przez ostatni węzeł Madsen w wieku 18 lat. Źródłowe mediany,
dobór profilu pacjenta, skala oraz interpretacja laboratoryjna pozostają
bez zmian.

11 października 2026 właściciel zaakceptował kolejną makietę i wdrożenie:
łagodne dzieciństwo bez ząbka źródeł, jeden szeroki łuk dorosłości oraz
średnie grup Walravens jako dorosłe odniesienie edukacyjne. Ta decyzja
zastępuje opisane wyżej historyczne połączenia testosteronu i dorosły
wybór Kelsey; aktualny kontrakt znajduje się niżej. Obowiązująca instrukcja
dla kolejnych agentów: [HORMONE_CURVE_AGENT_GUIDE.md](HORMONE_CURVE_AGENT_GUIDE.md).

11 października 2026 właściciel zatwierdził także poprawioną makietę LH/FSH:
stałe krzywe i skale, łagodniejszy wzrost FSH w środkowej dorosłości,
dorosłe źródłowe średnie/mediany oraz podpis porównania. Zastępuje ona
przełączanie schematu po wpisaniu wyniku. Politykę i źródła opisują
[PATIENT_POINT.md](hormone-lifespan/PATIENT_POINT.md) i
[ALGORITHMS.md](ALGORITHMS.md#hormone-lh-fsh-stable-curves--stałe-krzywe-i-dorosłe-odniesienia-2026-10-11).
FSH ma ilustracyjny most 12–25 lat oraz łuk dorosłości sprawdzony w wieku
41–80, bez wymuszonego wypłaszczenia przy 25 latach. Źródłowe mediany
Madsen pozostają niezmienione mimo uproszczenia rysunku pokwitania.
Pod wykresem widnieje: „Porównanie zmian LH i FSH w czasie. Każdy hormon
ma własną skalę — podobna wysokość linii nie oznacza takiego samego
stężenia.” Podpis działa również w pełnym ekranie; nie zastępuje opisu
osobnego trybu porównania płci. Domyślny wybór nadal obejmuje jeden analit.

11 października 2026 właściciel zaakceptował także makietę męskiego AMH
ze stałą linią, szerokim maksimum niemowlęcym, opadającym dzieciństwem
i płynnym spadkiem pokwitaniowym. Poniższa polityka AMH zmienia
prezentację edukacyjną, zachowując 15 istniejących profili liczbowych.

Tego samego dnia właściciel zaakceptował poprawioną makietę INSL3:
niewielką falę w pierwszym miesiącu, niski poziom dzieciństwa, szeroki
wzrost pokwitaniowy i łagodny spadek dorosłości. Zatwierdzona wersja
zastępuje wcześniejszą propozycję niemal płaskiego przebiegu niemowlęcego.
INSL3 pozostaje przerywaną ilustracją bez liczbowego punktu pacjenta.

Następnie właściciel zaakceptował wspólną, stałą oś stężenia AMH
w porównaniu płci podczas minipuberty. Obie linie od początku odtwarzają
mediany modeli niemowlęcych, także bez wyniku. Jest to wąski wyjątek
od wcześniejszego porównywania względnych wysokości płci. Ta zmiana AMH
nie obejmowała pokwitania ani innych hormonów.

Kolejna zatwierdzona makieta obejmuje inhibinę B: wspólną liniową oś
stężenia w minipuberty i pokwitaniu. Właściciel zaakceptował również
punkt dziewcząt według modelu Borelli-Kjær 2025, wyłącznie w porównaniu
płci inhibiny B w wieku 8–20 lat. To ograniczone rozszerzenie odniesienia
edukacyjnego, bez zmiany norm laboratoryjnych lub zwykłych widoków.

12 października 2026 właściciel polecił wdrożenie zatwierdzonych makiet
żeńskich LH/FSH: całego życia, pokwitania i cyklu oraz poprawionej
minipuberty z dwiema falami modelowanej średniej. To jawny wyjątek
od wcześniejszego obowiązku tej samej statystyki i skali we wszystkich
zbliżeniach. Zakres i ograniczenia opisano w sekcji żeńskich LH/FSH poniżej.

Tego samego dnia właściciel zatwierdził makietę stałej żeńskiej krzywej
AMH i polecił jej implementację („ok, koduj to”). Naprawa zachowuje
dotychczasowy przebieg całego życia, usuwa jego zastępowanie i skalowanie
po wpisaniu wyniku oraz przenosi tę samą geometrię do zbliżeń. Nie dodaje
źródeł liczbowego punktu, norm ani kalibracji między badaniami.

## Cel i granice

Wykres pokazuje czas i kierunek zmian hormonów. Jeśli dostępny jest właściwy
model liczbowy, pokazuje również wpisane stężenie pacjenta na jego tle.
Nie wyznacza norm, centyli, stadium pokwitania, menopauzy ani przyczyny wyniku.
Nie zastępuje osi interpretacji badania i nie zmienia ich danych, progów,
jednostek ani werdyktów. Połączenie nie zapisuje porównań do historii,
przypiętych wyników, wizyt ani stanu pacjenta.

W bazowych zwykłych widokach każdy hormon ma własną skalę względną.
Wyjątkiem są żeńskie LH/FSH: całe życie i pokwitanie mają wspólną
oś stężeń tych dwóch hormonów, a minipuberty — osobne własne maksima
modelowanych średnich. Przecięcie linii pozostałych hormonów nie
oznacza równego stężenia. Oś całego życia
ma różną skalę czasu w etapach.
Granice pokwitania, dorosłości i przejścia menopauzalnego są umowne,
nie są diagnozą na podstawie wieku.

Sam wykres nie potwierdza dopasowania pacjenta do populacji publikacji.
Niemowlęce dane dotyczą dzieci donoszonych; wcześniak lub nieznane dane
urodzeniowe nie mogą automatycznie otrzymać dopasowania do tej populacji.
Brak wiarygodnej płci lub wieku nie może tworzyć fikcyjnego kontekstu.
Pionowy znacznik pokazuje znany wiek. Osobny czerwony punkt może pokazać
wynik laboratoryjny po spełnieniu warunków opisanych poniżej.
Poza osią wieku znacznik znika zamiast przyklejać się do końca.

## Wynik pacjenta na tle modelu

Czerwony punkt oznacza **wynik pacjenta**, a nie wynik nieprawidłowy.
Znacznik odniesienia przedstawia źródłową medianę, centralny przebieg
modelu albo jawnie podpisaną średnią grupy, zależnie od źródła.
Poglądowa linia może upraszczać ich przebieg. Nie jest górną granicą normy. Powyżej albo poniżej
linii nie oznacza poza zakresem referencyjnym. Pozostają dotychczasowe,
odrębne osie interpretacji badania.
Ogólny komunikat braku dopasowania używa neutralnej „wartości odniesienia”,
nie przypisuje nieudostępnionej wartości średniej lub mediany.
Poprawnie dobrany znacznik zachowuje właściwy podpis statystyki źródłowej.

Średnie są jawne: dorosły testosteron korzysta z grup Walravens,
a osobny wykres starszych grup Baccarelli pokazuje
średnie arytmetyczne i tak je nazywa. Wynik w wieku 80–101 lat może być
porównany ze średnią całej dopasowanej grupy. Nie jest to punkt na medianie
dla dokładnego wieku ani przedłużenie głównej osi pozostałych hormonów.

Wiek, płeć, analit, zapis wyniku i jednostka pochodzą z istniejącego
formularza, również z jego lokalnych korekt. Nie dodajemy selektorów
publikacji, metody ani dodatkowego formularza. Metoda w źródłach opisuje
badanie populacyjne; nie potwierdza metody próbki pacjenta. Obecne dane
Tannera pozostają dostępne, lecz nie zmieniają krzywej wieku w krzywą
stadium i nie są odgadywane z wyniku.

Przy FSH Zec 2012 istniejąca aktualna ocena G1/Th1 kwalifikuje porównanie
z medianą grupy dzieci przed pokwitaniem. Brak takiej oceny nie blokuje
osobnej interpretacji laboratoryjnej. Odniesienie jest stałą medianą
całej grupy wieku, bez interpolowania do sąsiednich grup lub publikacji.
W porównaniu płci te profile nie tworzą punktu: stadium pacjenta nie
określa stadium drugiej populacji. Szczegóły źródła i granic opisuje
[PATIENT_POINT.md](hormone-lifespan/PATIENT_POINT.md).

Punkt wyniku i jego znacznik odniesienia muszą korzystać z **tej samej
jednostki i funkcji skali**. Mediana lub średnia pochodzi z oryginalnego źródła
źródłowego, również po zmianie widoku, wyboru hormonów i powiększeniu.
Nie wolno dopasować punktu do autorskiej linii pojedynczym mnożnikiem
ani przeliczać schematycznej wysokości na stężenie. W męskich LH, FSH,
AMH, inhibinie B i testosteronie całkowitym oraz żeńskim AMH
ciągła linia jest wygładzoną prezentacją: w pasach wygładzenia znacznik
źródłowej mediany/średniej może leżeć poza nią. Nie przesuwamy go na linię.
Model ilościowy zachowuje własne granice; poza nimi krzywa edukacyjna
nie staje się jego ekstrapolacją.

Dobór źródła zależy od analitu, płci i wieku, nigdy od wpisanej wartości
ani pożądanego położenia punktu. Przy wyznaczaniu odniesienia pacjenta
nie interpolujemy pomiędzy publikacjami.
Modele i tabele są danymi oddzielnymi od silnika. Między węzłami jednego
profilu stosujemy PCHIP bez przeregulowania; wartości odniesienia
oblicza jedna funkcja źródłowa, niezależna od wygładzenia prezentacji. Interpolacja węzłów rocznych jest przybliżeniem implementacji,
nie udostępnionym przez autora pełnym dopasowaniem statystycznym.

Zwykły żeński widok LH/FSH **Minipuberty** nie ma liczbowego punktu
gonadotropiny ani znacznika odniesienia: jego oś jest względną średnią
z ryc. 3 COPENHAGEN, bez znanego przeliczenia do IU/L. Wpisany wynik
pozostaje tekstem w swojej jednostce, a pion oznacza tylko wiek. Nie
blokuje to interpretacji laboratoryjnej ani kwalifikowanego punktu po
powrocie do widoku ilościowego. Inne anality w mieszanym wyborze zachowują
własne dotychczasowe reguły punktu, bez używania skali LH/FSH.

Męska inhibina B ma jedną gładką, ciągłą krzywą edukacyjną w zwykłych
widokach. Przebieg jest taki sam przed wpisaniem wyniku, po jego wpisaniu
lub usunięciu oraz po zmianie wieku, donoszenia lub metody próbki. Źródła
Busch (7 dni–<1 roku), Kelsey (1–<6,1 roku) i Borelli (6,1–80 lat) są
stałą podstawą tej prezentacji, a nie doborem populacji dla konkretnej osoby.
Bramki wieku, materiału, metody i donoszenia nadal kwalifikują osobno punkt
pacjenta. Nieznane donoszenie nie usuwa danych populacyjnych Busch z ogólnej
krzywej, lecz nie pozwala dopasować do nich wyniku niemowlęcia.

`vilda_hormone_lifespan_display.js` przygotowuje węzły, z których renderer
rysuje jedną ścieżkę PCHIP z ciągłą styczną (C1) w stałych współrzędnych
osi całego życia.
Pasy 0,75–2 lat i 4,5–7 lat łagodzą zmianę źródła, a pas 18–25 lat
łagodzi widoczne załamanie przy zmianie skali czasu w 20. roku. Ten ostatni
pas pozostaje w obrębie Borelli. To wyłącznie geometria prezentacji; na
końcach pasów styczne odpowiadają lokalnym pochodnym źródłowego przebiegu,
co usuwa krótkie zagięcia przy przejściu. Nie ma masek ani osobnych
przerywanych łączników; powiększenie
przedziału nie oblicza innej krzywej. Odcinek płodowy zachowuje wcześniejsze
kotwice poglądowe i dochodzi do danych z 7. dnia bez sztucznego dołka przy
urodzeniu. Po 80. roku płaskie zakończenie do 90 lat jest zakotwiczone
w ostatniej wartości Borelli (140 pg/mL); to ilustracja, nie dalsza mediana.

Skala jest stała: maksimum źródeł 309,779035 pg/mL i zapas wysokości 1,25
wyznaczają górę osi około 387,22379 pg/mL. Wpisana liczba nie zmienia skali
ani krzywej. Wyższy poprawny wynik ma strzałkę w górę z rzeczywistą wartością,
bez kropki sugerującej stężenie równe górze osi. Szczegóły polityki i granic
przedstawiono w [PATIENT_POINT.md](hormone-lifespan/PATIENT_POINT.md).

Testosteron całkowity ma jedną stałą linię we wszystkich zwykłych męskich
widokach. Zatwierdzona 11 października 2026 geometria opiera się na Busch,
Madsen i trendzie grup Walravens. Osobne liczbowe odniesienia nadal
kwalifikują pacjenta: Busch w dotychczasowym oknie z bramką jakości,
Kelsey 3–<6, Madsen 6–<18 i siedem średnich Walravens 18–86 lat.
Wiek 2 lat nie otrzymuje mediany z mostu; wcześniak nie otrzymuje profilu
niemowląt donoszonych. Znacznik dorosłego ma nazwę „Średnia grupy”.

`VildaHormoneLifespanDisplay.buildMaleTestosterone` i osobna polityka
`testosterone-display-policy.json` przygotowują edukacyjny przebieg.
Odczyt Busch do 212. dnia przechodzi łagodnie do niskiego poziomu Madsen
w wieku 6 lat; Kelsey 3–5 nie wymusza węzłów rysunku. Usunięto sztuczny
ząbek wynikający z połączenia różnych badań. Wartości Kelsey nadal
stanowią odrębne liczbowe odniesienie w wieku 3–<6 lat.

Po pokwitaniu linia dochodzi do młodej dorosłości. Jeden sześcienny
łuk Béziera od 23,8 lat / 20,7 nmol/L do 82,1 lat / 15,9 nmol/L
zastępuje przechodzenie przez każdą średnią grupową. W kanonicznym X
uchwyty mają ułamki 0,20/0,50, styczne końców są poziome, a łuk ma
601 próbek. To łagodny trend bez kolanka około czterdziestki, nie model
stężenia dla każdego roku życia. Wartości grupowe pozostają w źródle
pacjenta. Po 82,1 roku linia utrzymuje końcowy poziom; od 86 do 90 lat
wygasa i nie stanowi liczbowego odniesienia. Kotwice płodowe są ilustracją.

Walravens, tabela 1, [DOI 10.1210/clinem/dgaf507](https://doi.org/10.1210/clinem/dgaf507),
opisuje średnie arytmetyczne testosteronu całkowitego u 1194 mężczyzn
w wieku 18–86 lat, surowica rano na czczo, LC-MS/MS. Zdrowe młodsze
kohorty połączono ze starszą populacją społecznościową, także z chorobami.
Różnice nie przedstawiają wyłącznie wpływu wieku ani podłużnego losu
jednej osoby. Nie są medianami ani normami. Nie używamy tu wolnego T.

Stała kotwica skali 18,051151264084126 nmol/L i zapas 1,25 zachowują górę
osi około 22,563939 nmol/L. Kotwica nie jest maksimum nowego zbioru.
Wynik ponad osią ma strzałkę z rzeczywistą liczbą bez zmiany geometrii.
M/44 lata/12 nmol/L otrzymuje średnią grupy 40–49 równą 18,1;
M/82 lata/12 otrzymuje średnią grupy 80+ równą 15,9. Znacznik średniej
może leżeć poza ilustracyjnym łukiem; nie przesuwamy go na linię.
Pediatryczne mediany pozostają bez zmian, np. Madsen w wieku 6 lat
około 0,02394 nmol/L (LLOQ 0,02). Szczegóły i ograniczenia:
[PATIENT_POINT.md](hormone-lifespan/PATIENT_POINT.md).
Trwałe zasady kolejnych zmian:
[HORMONE_CURVE_AGENT_GUIDE.md](HORMONE_CURVE_AGENT_GUIDE.md).

Brak profilu, nieznany wiek lub płeć, nieobsługiwana jednostka, pusty albo
nieprawidłowy wynik oraz nierówność (`<`, `≤`, `>`, `≥`) oznaczają brak
dokładnego punktu. Odznaczenie hormonu ukrywa jego punkt; nie wyświetlamy
wyniku LH przy przeglądaniu AMH ani wyniku jednej osoby po zmianie pacjenta.
Poza widocznym okresem punkt znika, zamiast przesuwać się na jego granicę.
Wyniku przekraczającego wysokość wykresu nie wolno przyciąć i przedstawić
jako innego stężenia. Schemat cyklu estradiolu nie przyjmuje punktu wyniku.

Źródła niemowlęce wymagają znanego donoszenia; wcześniactwo i nieznane
dane urodzeniowe nie kwalifikują do tych populacji. Stosujemy wiek po
urodzeniu, bez zamiany na PMA lub wiek skorygowany. Wiek zapisany tylko
w latach i miesiącach nie staje się dokładnie znaną datą pobrania. Bramka
donoszenia nie usuwa automatycznie danych pokwitaniowych starszego dziecka.
Przy medianie Busch odczytanej z ryciny zbyt blisko granicy oznaczalności
nie tworzymy precyzyjnego punktu względem sztucznej podłogi. Szczegóły
tego ograniczenia graficznego są w dokumentacji danych; nie jest to
nowy próg interpretacji klinicznej.

### Stała linia żeńskiego AMH — 12 października 2026

Zwykłe widoki żeńskiego AMH korzystają ze stałego dzielnika
`lifespanData.hormones.amh.normalizationMaximum = 28.99 pmol/L`
i `ceiling = 1`. To dotychczasowa kotwica graficzna, pochodząca
z mediany osocza grupy 26–30 lat FDA K170524; nie górna granica normy.
Wpisanie, zwiększenie, wyczyszczenie lub cenzurowanie wyniku nie zmienia
tej skali ani linii. Wynik i oryginalna mediana źródłowa stosują tę samą
funkcję liniową. Zero jest punktem na osi, a wynik ponad 28,99 pmol/L
otrzymuje strzałkę i rzeczywistą liczbę, bez zmniejszania całej krzywej.
Tolerancja ośmiu epsilonów maszynowych przy granicy skali usuwa tylko
błąd arytmetyki konwersji; nie jest tolerancją oznaczenia.

Renderer buduje `displaySpline` z niezmienionych `displaySegments`
we współrzędnych żeńskiej osi całego życia. Jej dotychczasowa geometria
zostaje zachowana. Minipuberty i pokwitanie odwzorowują te same kawałki
Hermite'a/Béziera po podziale na węzłach oraz granicach skali czasu;
nie dopasowują nowego splajnu. Dotyczy to również AMH dołączonego do
LH/FSH: korzysta z osi czasu danego widoku, zachowując własną krzywą
i skalę AMH. Podpis osi LH/FSH nie nadaje AMH jednostki IU/L ani
normalizacji do maksymalnej średniej gonadotropin.

Most 0,9–1,3 roku pozostaje ilustracyjny również w minipuberty.
Wszystkie 99 źródłowych median niemowlęcych pozostają w danych,
ale rysunek mostu nie musi przez nie przechodzić. Jasny znacznik
zachowuje medianę źródłową, nawet gdy leży obok linii. Nie wymuszamy
odbicia po pierwszych urodzinach do mediany szerokiej grupy 1–4,9 lat.
Także późniejszy szeroki szczyt nie wskazuje dokładnego wieku maksimum.
Odcinek po ostatniej grupie FDA 41–45 lat i niska końcówka do 75 lat
są jakościowe, bez liczbowych odniesień, LOD lub ustalonego wieku menopauzy.

Źródła pozostają te same: mediana GAMLSS Ljubicic 2022 (98 donoszonych
dziewczynek, 266 próbek surowicy, Access 2), mediany niewielkich szpitalnych
grup Jopling 2018 (osocze litowo-heparynowe, Access AMH) oraz mediany
osocza FDA K170524 (620 kobiet z regularnymi cyklami i potwierdzoną
płodnością, Access 2). Sowers 2008 wspiera jakościowy spadek wokół
ostatniej miesiączki. Połączenie nie harmonizuje surowicy, osocza ani
populacji i nie tworzy jednego zwalidowanego modelu życia.

Jedyny dotychczasowy żeński profil liczbowy AMH w zwykłym widoku,
`ljubicic2022-female-amh`, zachowuje okno 0,02–1 roku, kwalifikację
donoszenia, metody, materiału i wyniku. W wieku 19,668 lub 35 lat
poglądowa linia nie uprawnia do dopisania mediany ani punktu stężenia.
Męskie AMH, porównanie płci i pozostałe hormony mają odrębne, niezmienione
kontrakty. Laboratoryjne normy, wyniki, jednostki wejściowe i zapis
pacjenta pozostają bez zmian.

Przypadki syntetyczne: dziewczynka donoszona, 0,25 roku, AMH
10 pmol/L → mediana 16,999 pmol/L, oba znaczniki na stałej skali 28,99;
200 pmol/L → strzałka z etykietą 200, bez przesunięcia mediany lub linii;
0,95 roku → oryginalna mediana 7,747 pmol/L mimo ilustracyjnego mostu.
Wiek 0,25 roku nie jest dokładnie równy 90 dniom makiety.
Dowód źródłowy i decyzję utrwala
[audyt żeńskiego AMH](hormone-lifespan/evidence/female-amh-display-audit-2026-10-12.json).

### Stała linia żeńskiego estradiolu — 12 października 2026

Zwykłe widoki E2 zachowują pierwotną linię pustego wykresu całego życia,
również po wpisaniu lub wyczyszczeniu wyniku i dołączeniu LH/FSH.
Wcześniej wynik zmieniał skalę, a wybór mieszany mógł zastąpić wszystkie
odcinki samym profilem niemowlęcym. Stały dzielnik to niezmienione
`lifespanData.hormones.e2.normalizationMaximum = 264 pmol/L`,
`ceiling = 1`. Wartość pochodzi z archiwalnej mediany fazy lutealnej
Frederiksen; jest normalizacją graficzną, nie normą, maksimum życia
lub cyklu ani medianą dorosłej pacjentki.

Renderer korzysta z kanonicznego `displaySpline` istniejących
`displaySegments`. Minipuberty i pokwitanie przenoszą te same kawałki
Hermite'a/Béziera po podziale na węzłach i granicach osi czasu, bez
nowego dopasowania. W mieszanym widoku E2 używa osi czasu okresu,
zachowując własną skalę; nie przejmuje IU/L lub względnej średniej
LH/FSH. Wysokość punktów wyniku i źródłowej mediany to `C / 264`.
Zero pozostaje na osi; wynik ponad nią ma strzałkę i rzeczywistą liczbę.
Osiem epsilonów maszynowych na granicy usuwa wyłącznie błąd zaokrąglenia,
nie wyznacza tolerancji laboratoryjnej. Konwersje wykonuje istniejący silnik.

Wszystkie 99 median niemowlęcych Ljubicic i 13 median wieku Madsen
zgadzają się z ponownie odczytanymi suplementami. Mediana E2 ma
maksimum 23,908 pmol/L przy 0,34 roku: około 9,1% osi i 13% mediany
18-latki 185,456 pmol/L z innej kohorty. Niższa wysokość po wpisie
wyniku usuwa wcześniejsze powiększenie; nie obniża danych źródłowych.
Względna średnia podłużna ryc. 3 Ljubicic ma dwie fale, lecz jest inną
statystyką bez ustalonej tu fizycznej kalibracji. Nie zastępuje mediany
GAMLSS i nie uprawnia do dopisania szczytów na osi stężeń.

Most 1–6 lat, dorosłe plateau i przejście menopauzalne pozostają
poglądowe, bez nowych median lub przewidywania wieku menopauzy.
Siedem median faz Anckaert zachowuje osobny schemat cyklu; pełna tabela 2
Cui potwierdza zbiorcze pomenopauzalne p50 4,9 pg/mL ≈18 pmol/L,
nie dokładną medianę wieku 55 lub 75 lat. Zestawienie publikacji
nie harmonizuje ich populacji, metod ani surowicy i osocza.

Jedyny zwykły żeński profil liczbowy E2 `ljubicic2022-female-e2`
nadal obejmuje 0,02–1 roku i donoszone dziewczynki. Nie ekstrapoluje
do urodzenia ani po pierwszym roku. Normy, źródłowe stężenia, warunki
kwalifikacji, zapis i interpretacja laboratoryjna pozostają bez zmian.
Także odrębne porównania płci i wybór wstawki cyklu nie zmieniają się:
przy LH/FSH panel cyklu nadal ma pierwszeństwo dla gonadotropin.

Syntetyczny przypadek: dziewczynka donoszona, 0,25 roku, 50 pmol/L
→ mediana 21,616 pmol/L i ta sama krzywa; 1000 pmol/L → strzałka,
bez przesunięcia źródła; pusty/wyczyszczony wynik → identyczna linia.
Dowód, ograniczenia i decyzja właściciela:
[audyt żeńskiego estradiolu](hormone-lifespan/evidence/female-estradiol-display-audit-2026-10-12.json).

### Stała linia żeńskiej inhibiny B — 12 października 2026

Właściciel zatwierdził makietę przed/po i jej wdrożenie („ok, koduj”).
Zwykły wykres inhibiny B zachowuje pierwotne `displaySegments` pustego
widoku całego życia. Wpisanie, podwyższenie lub wyczyszczenie wyniku
nie dobiera już nowej skali ani nie zastępuje krzywej profilem niemowlęcym.
Stały dzielnik `normalizationMaximum = 52.474 pg/mL`, `ceiling = 1`
pochodzi z maksimum zachowanych median Ljubicic. To kotwica graficzna,
nie norma lub maksimum fizjologiczne. Wynik ponad osią ma strzałkę
i rzeczywistą liczbę; zero pozostaje na osi. Tolerancja ośmiu epsilonów
maszynowych dotyczy tylko zaokrągleń na granicy wykresu.

Minipuberty i pokwitanie odwzorowują te same kanoniczne kawałki
Hermite'a/Béziera, dzielone na węzłach i granicach osi czasu. Wybór
LH/FSH nie usuwa starszych odcinków inhibiny B i nie nadaje jej osi
IU/L ani procentu maksimum gonadotropin. Jasny znacznik zachowuje
oryginalną medianę oraz skalę wyniku; nie jest przyciągany do ilustracji.
Dotychczasowe odróżnienie modeli i przerywanych mostów pozostaje.

Audyt potwierdził wszystkie 99 median tabeli 1 C suplementu Ljubicic
2022, DOI `10.1210/clinem/dgac363`: 98 zdrowych donoszonych dziewczynek,
266 próbek surowicy, Gen II ELISA. Szczyt mediany wynosi 52,474 pg/mL
przy 0,35 roku. Dwie fale względnej średniej podłużnej z ryc. 3
nie stanowią tej samej statystyki i nie mają ustalonej tu kalibracji
stężenia. Nie dopisujemy pomiaru przy urodzeniu z modelowego wiersza
wieku 0: pierwsza próbka w badaniu pochodziła z 5. dnia.

Pełny artykuł Borelli-Kjær 2025, DOI `10.1210/clinem/dgae439`, i ryc. 1
potwierdzają późniejszy wzrost i niższy poziom dorosły. Zachowane
24 węzły 5,6–47 lat są przybliżonym odczytem mediany 0 SD, m.in.
13/20/30/40 lat → około 47/34/30/28 pg/mL. Dotyczą surowicy Gen II;
648 dziewcząt 5,6–20,2 roku i 149 kobiet 20–69 lat. Faza cyklu
nie była standaryzowana, a dane antykoncepcji są niepełne. Nie jest to
trajektoria pojedynczej kobiety ani populacja wyłącznie bez leczenia.
Około ±2 pg/mL opisuje odczyt ryciny, nie normę lub przedział ufności.

Most 1–5,6 roku pozostaje poglądowy; dane Borelli mają lukę 1,08–5,6.
Crofton 2002 wspiera kierunek, lecz inne oznaczenie w osoczu i szerokie
grupy nie uzupełniają jej stężeniami. Po 47 latach niski ogon jest
jakościowy; `displayFloor = 0.012` oraz wiek 55 nie są pomiarem, LOD
lub przewidywaniem menopauzy. Źródło Borelli obserwowało kobiety do
69 lat; 47 kończy jedynie zachowany odczyt liczbowy. Sowers 2008 wspiera
spadek względem ostatniej miesiączki na poziomie sprawdzonego abstraktu.
Wspólna jednostka `1 ng/L = 1 pg/mL` i rodzina metody nie harmonizują
osobnych modeli, populacji lub wpływu cyklu. LOD Gen II wynosi 3 pg/mL,
bez osobnego LOQ; nie podstawiamy pacjentce wartości LOD/2.

Zwykły profil `ljubicic2022-female-inhb` nadal obejmuje 0,02–1 roku
włącznie i donoszone dziewczynki. Porównanie płci ma osobny profil
żeńskich median 8–20 lat, poza globalnym `patientPointData`; nie
aktywuje on starszego punktu w zwykłych widokach. Normy laboratoryjne,
źródła liczbowe, kwalifikacja, zapis i męska krzywa pozostają bez zmian.

Przypadek syntetyczny: dziewczynka donoszona, 0,25 roku, 30 pg/mL
→ mediana 49,684 pg/mL; 80 pg/mL lub 80 ng/L → strzałka z liczbą 80,
bez zmiany mediany, krzywej lub skali. 90 dni daje inne p50, około
49,4718 pg/mL: 0,25 roku nie jest dokładnie równe 90 dniom.
Źródła i decyzję utrwala
[audyt żeńskiej inhibiny B](hormone-lifespan/evidence/female-inhibin-b-display-audit-2026-10-12.json).

### Stała linia męskiego AMH

Zatwierdzona 11 października 2026 linia jest taka sama przed wpisaniem
wyniku, po wpisaniu i po wyczyszczeniu. Wiek pacjenta, kwalifikacja
niemowlęcia, wybór innych hormonów i powiększenie nie dobierają innego
rysunku. `buildMaleAmh` korzysta z
[`amh-display-policy.json`](hormone-lifespan/amh-display-policy.json).

Przebieg zachowuje odczyt mediany Busch od 7. do 250. dnia. Jej szerokie
maksimum około 175. dnia wynosi około 187 ng/mL. Później łagodne łuki
prowadzą przez dzieciństwo i wyraźniejszy spadek pokwitaniowy do niskiego
poziomu dorosłych. Kontrole geometrii w 9,5 i 14,5 roku odnoszą się do
median grup Wang 58,96 i 8,23 ng/mL. Nie są pomiarami dokładnego wieku
ani momentami osiągnięcia stadium. Łuk 14,5–30 dochodzi do p50 Tehrani
7,08 ng/mL; dorosły odcinek maleje do 3,95 w 70. roku. Po 70 latach
ostatnia wysokość wygasa do 90 lat, oznaczając koniec dostępnych danych,
bez twierdzenia o biologicznym plateau. Odcinek płodowy oraz urodzenie–
7. dzień pozostają jawnie schematyczne i nie dostają liczbowych tooltipów.

Cała linia używa dzielnika 1335,592934 pmol/L z zapasem 1,25. Dorosłe
około 4–7 ng/mL jest na tej skali niskie względem niemowlęcych około 187;
nie jest podnoszone sztucznym przesunięciem. Płynne łączenia są syntezą
edukacyjną różnych populacji i metod. Access 2 oraz zmodyfikowany Gen II
nie są przez to skalibrowane. Źródła i granice opisuje
[PATIENT_POINT.md](hormone-lifespan/PATIENT_POINT.md).

Jasny znacznik nadal wskazuje źródłową medianę; przy 11,5 roku wynosi ona
20,70 ng/mL, choć uproszczona linia odpowiada około 25,01. Zachowano
wszystkie 15 profili, bramkę donoszenia oraz luki: przed 7. dniem,
12–<13 lat, 15–<30 i >70 lat. Ciągłość obrazu nie daje nowych median,
norm ani interpretacji. Porównanie płci ma odrębną politykę; dla AMH
w minipuberty obowiązuje poniższy wyjątek.

### AMH w minipuberty — wspólna skala porównania płci

Zatwierdzona makieta zastępuje zmianę geometrii i skali po wpisaniu
wyniku. `amh-comparison-policy.json`, eksport `amhComparisonPolicy`
i `buildAmhInfantComparison(data, referenceEngine)` przygotowują stałe
krzywe: `busch2022-male-amh` oraz `ljubicic2022-female-amh`.
Oba źródła dotyczą zdrowych donoszonych niemowląt, surowicy i Access 2.
Linie przedstawiają mediany GAMLSS; męska jest przybliżonym odczytem
ryciny 3, żeńska pochodzi z tabeli D suplementu. Nie są średnimi
trajektoriami podłużnymi ani granicami norm.

Obie płcie, wynik i znacznik źródłowy używają wspólnej osi log10
0,1–1000 ng/mL, z poziomami 0,1 / 1 / 10 / 100 / 1000 i krótkim
podpisem „Kolejne poziomy osi oznaczają 10× większe stężenie”. Równa
wysokość oznacza równe stężenie; odstęp pionowy wyraża iloraz, nie
różnicę arytmetyczną. Używamy dotychczasowego przeliczenia
1 pmol/L = 0,1401 ng/mL. Skala nie zależy od wyniku, płci pacjenta,
wieku ani rozmiaru ekranu. Nie ma nowego wyboru skali.

Wspólny zakres linii wynosi 0,02–<1 roku (7,305–<365,25 dnia).
Nie dopisujemy krzywych przy urodzeniu ani rocznej grupy Wang na końcu.
Niezależny silnik zachowuje własne źródłowe domeny: chłopiec może mieć
punkt już od 7. dnia, mimo późniejszego początku wspólnych krzywych.
W tym widoku dokładnie pierwsze urodziny nie otrzymują punktu żadnej
płci. Nie zmienia to żeńskiego profilu obejmującego 1 rok w pozostałych
widokach. Cały przedział niepewnego wieku musi mieścić się przed 1. rokiem:
`[11/12, 1)` może otrzymać punkt przy zgodnym kontekście źródłowym,
`[11/12, 1]` oraz przedział przekraczający 1 rok nie mogą. To uzupełniona
kontrola granicy widoku (HM-3, 12 października 2026), bez nowego źródła,
normy, ekstrapolacji ani zmiany krzywych.

Wcześniactwo, nieznane donoszenie i inne dotychczasowe ograniczenia
silnika mogą wykluczyć punkt, lecz nie zmieniają krzywych populacyjnych.
Zapis „<” lub „>” nie jest dokładną kropką. Wynik poniżej 0,1 ng/mL,
w tym zero, ma strzałkę w dół; ponad 1000 strzałkę w górę, zawsze
z prawdziwą wartością. Nie podstawiamy dodatniego minimum do log(0).
Tolerancja błędu zmiennoprzecinkowego przy granicach zapobiega
fałszywej strzałce po konwersji jednostek; nie jest tolerancją kliniczną.

Podłoga osi jest decyzją graficzną, nie granicą oznaczenia. Obie prace
podają LOD AMH 0,14 pmol/L (około 0,0196 ng/mL), bez odrębnego LOQ AMH.
Wartości LOQ 2,9 i 4,0 pmol/L w Ljubicic dotyczą estrogenów.
Źródła, ograniczenia i punkty kontrolne:
[audyt AMH](hormone-lifespan/evidence/amh-infant-comparison-audit-2026-10-11.json).
Normy laboratoryjne, profile pacjenta, historia i zwykłe widoki nie zmieniają się.

### Inhibina B — wspólna skala w minipuberty i pokwitaniu

`inhibin-comparison-policy.json` i `buildInhibinComparison(data,
referenceEngine, period)` przygotowują stałą parę krzywych dla każdego
okresu. Obie płcie i znaczniki używają tej samej liniowej osi
0–400 pg/mL, z poziomami 0 / 100 / 200 / 300 / 400. Równa wysokość
oznacza równe stężenie; 1 pg/mL = 1 ng/L. Zero pozostaje punktem na
osi, a wynik ponad nią ma strzałkę z prawdziwą liczbą. Krzywe i oś
nie zmieniają się po wpisaniu lub wyczyszczeniu wyniku, zmianie osoby
ani rozmiaru ekranu. Oś nie wyznacza norm ani granic oznaczenia.

**Minipuberty:** istniejące `busch2022-male-inhb` i
`ljubicic2022-female-inhb`, wspólne linie 0,02–<1 roku. Oba źródła
dotyczą surowicy zdrowych donoszonych niemowląt i Gen II ELISA Beckman.
To mediany GAMLSS, nie średnie trajektorie podłużne. Męska jest
przybliżonym odczytem ryciny, żeńska pochodzi z tabeli C suplementu.
Przy 90 dniach wynoszą odpowiednio około 294,29 i 49,47 pg/mL.
Obie prace podają LOD 3 pg/mL, bez osobnego LOQ inhibiny B.
Własny punkt chłopca pozostaje dostępny od 7. dnia, mimo początku
wspólnych linii w 7,305 dnia. Dokładnie pierwsze urodziny nie dostają
punktu tego porównania; nie włączamy na końcu profilu Kelsey.
Wcześniactwo lub nieznane donoszenie ogranicza punkt, nie usuwa linii.

**Pokwitanie:** dotychczasowy męski profil Borelli-Kjær 2025 i żeńska
mediana ryc. 1, na wspólnej osi wieku chronologicznego 8–20 lat.
Nie jest to oś Tannera. Męski model łączy Oxford Bio-innovation
i Gen II, żeński używa surowicy Gen II. Wspólna jednostka nie dowodzi
zamienności metod; nie stosujemy między nimi nowego przelicznika.
Przybliżenia odczytu wynoszą około ±5 pg/mL u chłopców i ±2 u dziewcząt;
to rozdzielczość digitalizacji, nie granice kliniczne.

Nowe żeńskie odniesienie `borelli2025-female-inhb-puberty-comparison`
jest odrębne od globalnych profili: `inhibin-comparison-reference-data.json`
eksportuje `inhibinComparisonReferenceData` wyłącznie dla tego widoku.
Kwalifikacja obejmuje 8–20 lat włącznie, natomiast PCHIP zachowuje
wszystkie 24 źródłowe węzły 5,6–47 lat, aby granice widoku nie zmieniały
stycznych. W wieku 8/12/13/20 lat żeńskie mediany wynoszą około
14/43/47/34 pg/mL. Przed 8 i po 20 latach nie dodajemy tego punktu;
nie pojawia się też w zwykłych widokach. Źródło nie daje tu parametrów
L/S, SDS ani nowych percentyli. Fazy cyklu nie standaryzowano,
a antykoncepcja doustna wpływa na stężenia; nie dodajemy formularza
ani norm dostosowanych do tych okoliczności.

Każda płeć kwalifikuje własny punkt niezależnie przez istniejący
silnik, z uwzględnieniem wieku, materiału, metody, przeciwwskazań,
jednostki i zapisu wyniku. Brak dopasowania do profilu drugiej płci
nie blokuje poprawnego własnego odniesienia. Nierówność „<” lub „>”
nie staje się dokładną kropką. Pozostałe profile, normy laboratoryjne,
werdykty, historia i zwykłe wykresy pozostają bez zmian. Osobne panele
obserwacji Kuiri-Hänninen, Crofton i Baccarelli zachowują swoje dane
i zasady; nie dopisują median do nowych linii. Źródła i granice:
[audyt porównań inhibiny B](hormone-lifespan/evidence/inhibin-comparison-audit-2026-10-11.json).

### LH i FSH — wspólne stężenia obu płci, 12 października 2026

Zatwierdzone porównanie wykorzystuje mediany stężeń i stałe wspólne
osie: **0–6 IU/L w minipuberty, 0–8 IU/L w pokwitaniu**. Równa
wysokość oznacza równe stężenie. Wynik nie skaluje ani nie zastępuje
krzywych; zero leży na osi, powyżej osi pojawia się strzałka z liczbą.

W minipuberty linie od 0,02 do <1 roku przedstawiają mediany GAMLSS:
Busch 2022 u chłopców, Ljubicic 2022 u dziewczynek. Obie kohorty
COPENHAGEN dotyczą zdrowych donoszonych niemowląt, surowicy AutoDELFIA.
Sprawdzono 788 męskich odczytów ryciny oraz 198 żeńskich wartości
suplementu. Nie ekstrapolujemy do narodzin. Własne odniesienie chłopca
pozostaje dostępne od 7. dnia, niezależnie od późniejszego początku
żeńskiej linii. Dokładnie 1 rok nie otrzymuje punktu żadnej płci
w tym porównaniu. Po 243. dniu niski męski model LH nie kwalifikuje
już dokładnego punktu według istniejącej reguły digitalizacji.

Zwykła żeńska minipuberty nadal pokazuje **względną średnią podłużną**,
z dwiema falami. Nowe porównanie pokazuje **mediany stężeń**. Nie należy
przenosić szczytów między tymi modelami ani nadawać procentowej średniej
jednostki IU/L. Względnie płaska żeńska mediana FSH z suplementu nie
opisuje braku wahań u pojedynczej dziewczynki.

Pokwitanie obejmuje **6–16 lat** z jednego źródła Madsen 2022,
Siemens IMMULITE 2000 XPi: 44 roczne mediany obu płci i hormonów.
Wiek 16 jest opublikowanym brzegiem modelu kohorty 6–<16; nie
przedłużamy krzywych do 20 lat. PCHIP między rocznymi węzłami jest
interpolacją aplikacji. Wiek nie określa Tannera; faz cyklu nie
standaryzowano, a użytkowniczki antykoncepcji doustnej wykluczono.
Młodsze mediany LH blisko LLOQ 0,1 IU/L nie wyznaczają dokładnego
początku pokwitania ani znaczenia niewielkiej różnicy płci.

Wynik odnosi się wyłącznie do profilu własnej płci. Brak kwalifikacji
drugiej płci nie blokuje poprawnego własnego punktu. Znana niezgodna
metoda, materiał, leczenie, niepewny wiek, wynik cenzurowany oraz
wcześniactwo lub nieznane donoszenie niemowlęcia zachowują znaczenie.
Dwa żeńskie profile Madsen działają tylko w tym porównaniu; nie
trafiają do zwykłych widoków, FSH Zec lub norm laboratoryjnych.

Polityka: `gonadotropin-comparison-policy.json`; dodatkowe profile:
`gonadotropin-comparison-reference-data.json`. Źródła, wersje,
populacje, hashe i przypadki kontrolne:
[audyt LH/FSH](hormone-lifespan/evidence/lh-fsh-sex-comparison-audit-2026-10-12.json).
To edukacyjne porównanie median, bez diagnozy, SDS lub nowych norm.

### Stała przerywana linia męskiego INSL3

`buildMaleInsl3(data)` korzysta z osobnej polityki
[`insl3-display-policy.json`](hormone-lifespan/insl3-display-policy.json).
Jedna krzywa w kanonicznym X osi całego życia zachowuje własną stałą
skalę względną (`divisor = 1`, `ceiling = 1`) w widokach całego życia,
minipuberty, pokwitania i pełnego ekranu. Wybór innych hormonów,
wiek i wynik pacjenta nie zmieniają jej skali. Przerywany styl `6 5`
identyfikuje INSL3; nie oznacza przerwy w danych ani nowej normy.

[Busch 2022](https://doi.org/10.1210/clinem/dgac115), ryc. 2, pokazuje
modelowaną średnią trajektorię podłużną, znormalizowaną do własnego
niemowlęcego maksimum każdego hormonu. Dla INSL3 wzrost od urodzenia
do około 27. dnia jest niewielki: od około 0,78 do 1 tej skali źródłowej.
Ryc. 3 przedstawia odrębną medianę GAMLSS tej samej kohorty, bez krwi
pępowinowej w dopasowaniu. Jej malejący przebieg nie wyklucza wczesnej
fali modelu podłużnego. Odczyty ryc. 3 są już po transformacji odwrotnej,
w µg/L; nie należy ich ponownie podnosić do kwadratu.

Zatwierdzone wysokości techniczne to 0,109158 przy urodzeniu i 0,14
około 27. dnia; później linia opada, przechodząc od 200. dnia łagodnie
do 0,012 w pierwszym roku. Wysokość 0,14 jest decyzją graficzną.
Jej stosunek do dorosłego maksimum 0,87 **nie jest zweryfikowanym
ilorazem stężeń**. [Bay 2007](https://doi.org/10.1210/jc.2007-0974)
i [Bay 2005](https://doi.org/10.1210/jc.2004-2257) wspierają niższe
centralne stężenia niemowlęce niż dorosłe, lecz pobranie około trzeciego
miesiąca nie określa wysokości szczytu pierwszego miesiąca. Nie mieszamy
median, średnich ani maksimów obserwowanych u pojedynczych osób.

Przy urodzeniu wspólna pozioma styczna łączy schemat płodowy z małym
wzrostem postnatalnym, bez dodatkowego dołka lub przeregulowania.
To połączenie graficzne, nie dowód dokładnego biologicznego minimum
w dniu urodzenia. Dzieciństwo pozostaje niskie, wzrost pokwitaniowy
przechodzi w szeroki wysoki obszar młodej dorosłości. Jeden łuk 25–80 lat
prowadzi od 0,87 do 0,455; od 80 do 90 lat ta wysokość wygasa. Granica
80 lat jest konserwatywną polityką prezentacji, nie dokładnym końcem
obserwacji EMAS ani twierdzeniem o biologicznym plateau.

[Tulumcu 2025](https://doi.org/10.3389/fendo.2025.1574760), sprawdzony
także w dostarczonym pełnym PDF, zawiera własne dane ALSPAC z wizyt około
17. i 24. roku. Opis małej fali postnatalnej cytuje Busch, a ryc. 1B
zestawia średnie kilku badań od późnego dzieciństwa. Nie dodaje niezależnych
pomiarów niemowląt, wspólnej mediany całego życia ani uniwersalnego szczytu
dokładnie w 22. roku. [EMAS 2022](https://doi.org/10.1111/andr.13220)
i [FAMAS 2006](https://doi.org/10.1111/j.1365-2605.2006.00714.x)
uzasadniają kierunek późniejszego spadku, bez kalibracji LC-MS/MS i TRFIA.

Brak liczbowych tooltipów stężenia, profilu odniesienia i punktu pacjenta
dla INSL3. Niskie odczyty i ograniczenia oznaczenia zmniejszają pewność
dokładnych liczb; wynik mediany poniżej LOQ nie dowodzi braku biologicznej
fali ani nie unieważnia automatycznie estymacji populacyjnej. Normy
laboratoryjne i liczbowe profile innych hormonów pozostają odrębne.
Źródła, dostępność pełnych tekstów i ograniczenia zapisano w
[`insl3-lifespan-display-audit-2026-10-11.json`](hormone-lifespan/evidence/insl3-lifespan-display-audit-2026-10-11.json).

## Wybór i interakcje

- Domyślnie wybrany jest tylko bieżący analit przelicznika. Pozostałe
  hormony można dołączyć, bez uruchamiania ich obliczeń.
- Identyfikatory mapuje się jawnie: `lh` → `lh`, `fsh` → `fsh`,
  `estradiol` → żeńskie `e2`, `testosterone_total` → męskie `t`,
  `amh` → `amh`, `inhibin_b` → `inhb`. `testosterone_free` nie jest `t`.
  Nieobsługiwana para płeć–analit pomija wykres, bez krzywej poprzedniego analitu.
- Zmiana analitu lub płci przywraca pojedynczy właściwy hormon.
  Aktualizacja wyniku, wieku albo rozmiaru ekranu przy tym samym analicie
  nie usuwa ręcznie dołączonych porównań.
- Każdy hormon, także ostatni i domyślnie wybrany, można odznaczyć.
  Pusty wybór ukrywa krzywe i pokazuje „Wybierz hormon”; nie przywraca
  automatycznie bieżącego analitu. Powrót przyciskiem „Tylko…” wybiera
  bieżący analit. Ta sama możliwość odznaczenia dotyczy porównania płci.
- Nagłówek osi „Przebieg zmian” zastępuje techniczne „Poziom względny”.
  Zasada osobnych skal pozostaje widoczna pod zwykłym wykresem.
  Porównanie AMH/minipuberty opisuje stężenie w ng/mL i wspólną skalę
  logarytmiczną; inhibina B w obu porównaniach ma liniową oś pg/mL,
  a LH/FSH wspólne liniowe osie IU/L.
- „Porównaj płcie” działa w minipuberty i pokwitaniu dla LH, FSH, AMH
  i inhibiny B. Przejście między tymi okresami zachowuje
  tryb porównania. Gdy wybrany hormon nie ma porównania w nowym okresie,
  znika wybór i użytkownik może wskazać hormon z dostępnego zestawu.
  Widok „Całe życie” kończy porównanie płci. Nie dopisujemy żeńskiego
  testosteronu lub INSL3 ani męskiego estradiolu bez odpowiednich danych.
  Wejście w porównanie respektuje ręczny wybór: wybiera pierwszy zaznaczony
  hormon dostępny w danym okresie. Bieżący analit nie ma pierwszeństwa.
  Pusty wybór pozostaje pusty również po wejściu w porównanie; przy samych
  zaznaczonych hormonach bez danych drugiej płci przycisk jest ukryty.
- Kliknięcie etapu przesuwa tę samą ramkę płynnie od aktualnego położenia;
  `prefers-reduced-motion` wyłącza ruch. Brak osobnego przycisku zatrzymania.
- Wiek i płeć pochodzą z istniejącego kontekstu aplikacji; bez kolejnego
  formularza. Etap wybrany do obejrzenia nie zmienia pacjenta.
- „Powiększ” otwiera całą sekcję w oknie zajmującym viewport, również
  ponad powłoką aplikacji. Zachowuje hormony, okres, porównanie płci,
  schemat cyklu i rozwinięte źródła. „Zamknij” lub Escape przywraca
  sekcję, fokus i przewinięcie. Nie wymaga Fullscreen API ani ukrycia
  paska przeglądarki, dzięki czemu działa także na telefonie.
  Zmiana pacjenta, analitu lub płci, blokada, usunięcie modułu i przejście
  do innej karty zamykają powiększenie. Stan nie trafia do historii pacjenta.
  Powiększenie zmienia rozmiar renderowania, bez zmiany interpolacji,
  danych czy normalizacji. Test `hormone-lifespan-fullscreen.spec.mjs`
  obejmuje oba rozmiary mobilne, obrót, ramkę same-origin i powrót
  do pierwotnej geometrii po zamknięciu.
  Rzeczywiste używanie przycisków, klawiatury i przewijania w dialogu
  odnawia istniejący licznik aktywności przelicznika i powłoki. Automatyczne
  odświeżanie, zmiana rozmiaru i przewijanie przez skrypt nie odnawiają go.
  Limit bezczynności i blokada sesji pozostają bez zmian.
- Przyciski zachowują czytelny kontrast także bez zaznaczenia. Ustawienie
  ograniczenia ruchu wyłącza również przejścia kolorów. Zmiana rozmiaru
  wykresu zachowuje fokus odnośnika w źródłach, jeśli ich treść się nie zmieniła.

Regresje interakcji po audycie: `hormone-lifespan-activity.spec.mjs`
(rzeczywiste moduły sesji, fikcyjne konto, pełny ekran samodzielnie i w ramce),
`hormone-lifespan-accessibility.spec.mjs` (kontrast, klawiatura, ograniczenie
ruchu, fokus źródeł) i `hormone-lifespan-puberty-comparison.spec.mjs`
(ręczny i pusty wybór). Naprawy nie zmieniają geometrii ani źródeł krzywych.

## Żeńskie LH/FSH — odrębne widoki okresów, 12 października 2026

Zatwierdzone makiety zastępują niemal płaską prezentację median niemowlęcych
i nadmierną kompresję wcześniejszych etapów przez wartości pomenopauzalne.
Nie powstaje jeden zwalidowany model całego życia. Widoki celowo mają
różne źródła, statystyki i stałe skale; przełączenie okresu nie jest samym
powiększeniem. Wynik, wiek bieżącej pacjentki, rozmiar ekranu oraz dołączenie
innego hormonu nie mogą zmieniać krzywych LH/FSH w obrębie danego widoku.

| Widok | Linia i źródło | Stała oś | Wynik LH/FSH |
| --- | --- | --- | --- |
| Całe życie | Synteza edukacyjna grup Schmidt 2000, Ji 2008 i Ljubicic 2020; mosty są poglądowe | Wspólna 0–70 IU/L, `log1p(C / 0.5) / log1p(70 / 0.5)` | Oryginalnie kwalifikowany wynik i źródłowe odniesienie, ta sama funkcja skali; znacznik nie jest przyciągany do ilustracji |
| Minipuberty | Odczyt ryc. 3 Ljubicic 2022: podłużna średnia modelowana każdego hormonu / jego własne maksimum | Własny szczyt każdego hormonu = 100%; bez IU/L | Tekst wyniku w jednostce wejściowej oraz pion wieku; bez liczbowej kropki i mediany na względnej osi |
| Pokwitanie | Osobne mediany wieku Madsen 2022, 6–16 lat | Wspólna liniowa 0–8 IU/L | Wyłącznie odniesienie kwalifikowane przez istniejący silnik; sam model żeński nie aktywuje nowego profilu |
| Cykl przy etapie „Dorosła” | Stricker 2006, 30 dziennych median, od −15 do +14 dni względem szczytu LH | Wspólna liniowa 0–50 IU/L | Brak punktu pacjentki i wyznaczania jej fazy cyklu |

Równa wysokość LH i FSH na osi stężeń odpowiada tej samej liczbie IU/L,
ale połączenie różnych badań nie harmonizuje metod. Nieliniowa oś życia
nie pozwala odczytywać ilorazu ze stosunku odległości od zera. Poziomy
0 / 0,5 / 2 / 10 / 70 i krótki opis kompresji są widoczne. W minipuberty
100% to własne maksimum modelu, nie percentyl lub granica normy; wysokości
LH i FSH nie służą do porównania stężeń.

### Całe życie: narodziny, łączenie źródeł i późniejsze etapy

[Schmidt i Schwarz 2000](https://doi.org/10.1530/eje.0.1430213), tabela 2,
obejmuje 73 zdrowe donoszone dziewczynki w wieku 1–28 dni, po jednej
próbce krwi żylnej na osobę, pobranej 08:00–10:00. Mediany grupy
1–5 dni wynoszą LH 0,20 i FSH 1,80 IU/L (n=31), a grupy 26–28 dni
odpowiednio 2,80 i 6,15 (n=8). Oznaczenie to Serono MAIA clone RIA;
LOD wynosi LH 0,15 i FSH 0,30 IU/L. Reaktywność krzyżowa LH wobec hCG
wynosi 3%; bez równoległych pomiarów hCG nie można jej liczbowo odjąć.
Nie jest to profil ilościowy noworodka w aplikacji ani badanie podłużne.

Pierwsza grupa jest umieszczona w dniu 3, druga w dniu 27 wyłącznie
dla rysunku; początek osi opisuje „1–5 dni”. Nie ma wartości przy urodzeniu
ani dowodu dokładnego dnia maksimum. Wszystkie grupy źródłowe pozostają
w dowodzie, lecz wahania małych grup n=3–8 nie są wymuszanymi szczytami.
Wybrane mediany [Ji 2008](https://www.indianpediatrics.net/june2008/june-489-492.htm),
tabela I, opisują dalsze niemowlęctwo: 201 zdrowych donoszonych dziewczynek,
badanie przekrojowe, surowica, DPC Immulite, LOD 0,1 IU/L. Nie stosujemy
kalibracji między RIA, Immulite i AutoDELFIA.

Wczesny łuk LH od 0,20 do 2,80 i z powrotem do 0,20 IU/L około
5. miesiąca jest szerokim połączeniem edukacyjnym. Pomija mediany
grup Ji 2/3/4 miesiące jako wymuszane węzły, aby nie tworzyć ostrego
zjazdu i kolanka po zmianie publikacji. Zastosowano asymetryczne
odwzorowanie X oraz funkcję `6t^5 − 15t^4 + 10t^3` we współrzędnej
`log1p(C / 0.5)`, z odwrotnym przeliczeniem do IU/L przed rysowaniem.
Zerowe pochodne na końcach i gęste próbkowanie zachowują płynność.
Parametry łuku opisują geometrię, nie zmierzone stężenia pośrednie.
Nie wyprowadzamy z niego tempa spadku u pojedynczego dziecka.

FSH prowadzą kotwice 1,80 / 6,15 z grup noworodkowych, następnie
7,10 w grupie 3-miesięcznej, 6,10 w 5-miesięcznej i 5,70 w rocznej.
Pominięto drobne fluktuacje grup oraz Ji 2 miesiące / 5,90 jako węzeł
geometrii, by różnica kohort nie stworzyła dodatkowego dołka. Nie oznacza
to uniwersalnego maksimum dokładnie w 3. miesiącu. Most od 1 do 6 lat
jest poglądowy. Zec 2012, grupa Th1 1–<4 lat, mediana 2,57, pozostaje
osobnym dowodem i dotychczasowym odniesieniem grupowym; nie wymusza
punktu geometrii dokładnie w wieku 2,5 roku.

Po niemowlęctwie wybrane wartości tabeli I [Ljubicic 2020](https://doi.org/10.1093/humrep/deaa182)
są umieszczone w reprezentatywnych pozycjach wieku. Ich statystyki
nie nazwano w źródle jednoznacznie medianą. Grupa 20–<40 lat liczy
17 kobiet, fazy cyklu nie standaryzowano. Nie należy rysować spadku
po pokwitaniu wyłącznie z różnicy tej grupy i median Madsen. Pominięte
grupy pośrednie pozostają w dowodach, bez wymuszania kolejnych ząbków.
Przejście menopauzalne 45–55 lat jest umownym położeniem ilustracji,
nie rozpoznaniem menopauzy z wieku. Późny LH zachowuje niewielki spadek
27,83 → 24,95, a FSH wzrost 61,66 → 64,54 właściwy temu zbiorowi;
inne badania pokazują inne trendy. Nie doklejamy regresji innej metody.
Rysunek kończy się przy 75 latach: etykieta źródłowej grupy 70–100
nie uprawnia do przedłużenia danych do 90 lub 100 lat, gdy obserwacje
sięgają 80 lat. Wiek 75 jest pozycją graficzną, nie medianą wieku grupy.

### Minipuberty: dwie fale średniej z COPENHAGEN

[Ljubicic 2022](https://doi.org/10.1210/clinem/dgac363), ryc. 3, dotyczy
98 zdrowych donoszonych dziewczynek, 266 próbek surowicy i mediany
3 próbek na dziecko. LH/FSH oznaczano AutoDELFIA, LOD 0,05 IU/L.
Model mieszany ze splajnami opisuje podłużną średnią populacyjną;
każdy hormon podzielono przez jego własne maksimum. Odczyt ryciny
zachowuje pierwszy szczyt LH około 23. dnia, minimum około 85. dnia
i mniejszy drugi szczyt około 165. dnia, około 18% wysokości pierwszego.
LH narasta ponownie w 3.–4. miesiącu. Drugi szczyt FSH wynosi około
76% jego własnego pierwszego szczytu. To cechy modelu tej kohorty,
nie dokładny harmonogram każdej dziewczynki.

Odczyt zaczyna się około 5,6 dnia; nie przedłużamy go do narodzin.
Kończy się dla LH w dniu 360, a FSH w dniu 357, bez przedłużenia do
365. dnia. Nie nadajemy odczytanym współrzędnym dokładności oryginalnych
danych. Ryc. 1 i suplement LMS tej samej publikacji podają mediany
GAMLSS z innym kształtem: niska mediana nie unieważnia fal średniej.
Nie wolno jednak użyć mediany lub innej kohorty do wyliczenia brakującego
fizycznego maksimum średniej. Brak tych maksimów wyklucza przeliczenie
przedstawionej krzywej do IU/L i umieszczenie na niej liczbowego wyniku.

### Pokwitanie i wstawka cyklu

[Madsen 2022](https://doi.org/10.1210/clinem/dgac155) i
[suplement LMS](https://doi.org/10.6084/m9.figshare.17153336.v1) dostarczają
11 żeńskich rocznych median wieku 6–16 lat. Dla LH/FSH surowicę oznaczano
Siemens IMMULITE 2000 XPi; mediana to `exp(M) / 1e6`, nie parametr M.
PCHIP odtwarza przebieg między rocznymi węzłami, bez ekstrapolacji.
Przy 16 latach LH ≈5,6486 i FSH ≈5,8261 IU/L. To model wieku,
nie stadium Tannera i nie ten sam model co synteza całego życia.
Nie powstaje dodatkowy profil punktu pacjentki ani nowy zakres norm.

[Stricker 2006](https://doi.org/10.1515/CCLM.2006.160), tabela 1A,
obejmuje codzienne oznaczenia surowicy podczas jednego cyklu u 20 zdrowych
kobiet 20–36 lat, bez antykoncepcji doustnej; Abbott ARCHITECT i2000SR.
Wstawka zachowuje 30 dziennych median od −15 do +14 dni względem
indywidualnego szczytu LH. W dniu 0 LH wynosi 41,19, a FSH 12,82 IU/L.
Nie jest to automatycznie 14. dzień cyklu ani dokładny moment owulacji.
Liczebności dzienne wynoszą 8–20; wartości nie są uniwersalną normą.
Wstawka przy istniejącym etapie „Dorosła” nie wprowadza nowego formularza
lub selektora, nie dotyczy ciąży, leczenia ani menopauzy i nie interpretuje
wyniku konkretnej pacjentki. Oś dni jest oddzielna od osi lat życia.

### Granice wdrożenia i pliki

`buildFemaleGonadotropins(data)` korzysta z odrębnych plików
[`female-gonadotropin-display-policy.json`](hormone-lifespan/female-gonadotropin-display-policy.json)
i [`female-gonadotropin-display-data.json`](hormone-lifespan/female-gonadotropin-display-data.json).
Generator eksportuje `femaleGonadotropinPolicy` i `femaleGonadotropinData`.
[Audyt źródeł i geometrii](hormone-lifespan/evidence/female-gonadotropin-display-audit-2026-10-12.json)
utrwala pochodzenie, metodę, jednostki, zakresy, przybliżenia i decyzje
prezentacji. Nie aktywuje nowych źródeł w `patientPointData`, nie zmienia
norm, diagnoz, konwersji wyniku, zapisu wizyt ani historii.

Dodanie AMH, E2 lub inhibiny B do LH/FSH nie przywraca dawnej krzywej
gonadotropin. Podpis wskazuje, że oś IU/L dotyczy wyłącznie LH i FSH,
a pozostałe hormony zachowują własne skale. W minipuberty względne
maksima LH/FSH również nie kalibrują innych analitów. Bieżący wynik
innego hormonu zachowuje własne kwalifikowanie, jednostkę i skalę.
Porównania płci pozostają osobnymi trybami; ta zmiana nie przenosi do
nich źródeł Madsen lub względnej średniej COPENHAGEN.

## Stała skala i połączenia

Poniższe zasady opisują bazową warstwę schematów, zwłaszcza żeńskich.
Męskie LH, FSH, AMH, inhibina B i testosteron całkowity oraz żeńskie AMH i E2
korzystają ze stałych krzywych opisanych powyżej. Jeżeli
wyświetlany jest model liczbowy z punktem wyniku, pierwszeństwo mają wspólne przeliczenie
punktu i modelu oraz granice profilu opisane powyżej. Mosty schematyczne
i normalizacje nie mogą stanowić liczbowej podstawy wyniku pacjenta.

Poza opisanym wyżej wyjątkiem LH/FSH w żeńskich widokach Całe życie,
Minipuberty i Pokwitanie pojedynczy hormon
zawsze używa tego samego `normalizationMaximum`. Zmienia się tylko oś czasu.
Zaznaczenie innych hormonów nie przeskalowuje osi pionowej. Nie przywracać
normalizowania każdej niemowlęcej krzywej do jej szczytu ani arbitralnego
`infantHeight`. Dla przykładu szczyt mediany E2 u niemowląt, 23,908 pmol/L,
ma wysokość `23,908 / 264 ≈ 0,0906` w obu zwykłych widokach.

`lifespanData.hormones.*.points` zachowuje dowody w oryginalnych jednostkach.
Renderer korzysta z `displaySegments`: `kind=model` odtwarza opublikowany
model, a `kind=schematic` zawiera wyłącznie `ageYears` i bezwymiarowe
`relative`, z `unit=null` i opisem decyzji. Nie przeliczać wysokości schematu
z powrotem na laboratoryjne stężenia ani nie dodawać liczbowych tooltipów.

Przerwy w obserwacjach (`evidenceGaps`) są połączone przerywanymi mostami
poglądowymi. Nie oznaczają nowych pomiarów. Wspólne styczne PCHIP i dokładne
krzywe Béziera zachowują ciągłość bez przeregulowania. Dla AMH szerokie
wypłaszczenie około końca niemowlęctwa zastępuje skok do mediany całej grupy
1–4,9 lat; odcinek 0,9–1,3 roku to geometria schematu. Po naprawie żeńskiego
AMH z 12 października zwykłe zbliżenie minipuberty pokazuje ten sam most
co całe życie; wszystkie 99 źródłowych punktów pozostają niezależnymi
danymi odniesienia, nie wymuszanymi węzłami rysunku mostu. Wartość
`qualitativeTail.displayFloor` jest wyłącznie odległością od osi: niskie
lub niewykrywalne nie znaczy stężenie równe zero.

Widok **Porównaj płcie** ma odrębną politykę. Dla AMH w minipuberty
oraz inhibiny B i LH/FSH w minipuberty i pokwitaniu obowiązują stałe
mediany i wspólne osie stężenia opisane wyżej. Pozostała
bazowa warstwa porównania używa własnego maksimum każdej płci
w wybranym okresie, z widocznym podpisem tej zasady. Taki schemat
porównuje kształt i kierunek zmian, nie bezwzględne stężenia. Nie wolno
wyprowadzać z jego przecięć równości stężeń, ilorazów ani precyzyjnej
różnicy czasu szczytów. Dotychczasowe ilościowe tryby pozostałych
analitów nie otrzymują automatycznie nowych polityk tych porównań.

- **Minipuberty, AMH:** stała wspólna oś log10, modele Busch/Ljubicic
  od 0,02 do <1 roku; bez przełączenia po wpisaniu wyniku. Nie zmienia
  zwykłych `miniValues` ani skali całego życia.
- **Minipuberty, inhibina B:** stałe mediany Busch/Ljubicic od
  0,02 do <1 roku, wspólna liniowa oś 0–400 pg/mL. Bez przełączenia
  geometrii po wpisaniu wyniku lub powiększeniu.
- **Pokwitanie, inhibina B:** stałe modele Borelli-Kjær obu płci,
  8–20 lat i ta sama liniowa oś 0–400 pg/mL; osobno zaakceptowane
  żeńskie odniesienie pacjentki tylko w tym porównaniu.
- **LH/FSH:** mediany obu płci, minipuberty 0,02–<1 roku / 0–6 IU/L
  i pokwitanie 6–16 lat / 0–8 IU/L, bez osobnej normalizacji płci.
- **Pokwitanie, AMH:** na wspólnej osi wieku
  chronologicznego 8–20 lat. Maksimum wyznacza się osobno dla każdej płci
  w tym przedziale, bez przesuwania krzywych w czasie. To umowny wycinek
  wykresu, nie zakres prawidłowego początku lub zakończenia pokwitania.
  Wiek nie zastępuje stadium Tannera. Zachowujemy istniejącą interpolację
  pełnych tablic: męskie PCHIP i 97 próbek z B-spline oraz żeńskie
  `displaySpline`/`segmentPath`. Nie obliczamy nowego splajnu z samych
  węzłów 8–20 lat i nie zmieniamy węzłów, kształtu ani zwykłych widoków.

Pokwitaniowe LH/FSH wykorzystują mediany Madsen obu płci, a inhibina B
modele Borelli-Kjær. AMH zachowuje dotychczasowe schematy: żeński
(Jopling 2018 oraz FDA K170524) i męski, wsparte źródłami opisanymi
niżej. Nie nazywamy wszystkich tych przebiegów medianami. Porównanie
populacji nie ustala dokładnego opóźnienia jednej płci względem drugiej
ani stadium Tannera; ocena laboratoryjna pozostaje odrębna.

## Źródła żeńskie

Poniżej opisano dane faktycznie użyte do przygotowania punktów. Pełne
ekstrakty, jednostki, liczebności i odnośniki są w
[`hormone-lifespan/evidence`](hormone-lifespan/evidence) oraz
[`female-reference-data.json`](hormone-lifespan/female-reference-data.json).
Są to różne populacje i oznaczenia, nie jeden model całego życia.

| Odcinek | Publikacja i miejsce | Populacja, oznaczenie i ograniczenie |
| --- | --- | --- |
| LH, FSH, AMH, inhibina B, E2: 0,02–1 roku | [Ljubicic 2022](https://doi.org/10.1210/clinem/dgac363), ryc. 1 i [suplement tabela 1](https://doi.org/10.6084/m9.figshare.19469555.v1), CC BY 4.0 | 98 donoszonych dziewczynek, 266 próbek surowicy. Mediany GAMLSS, po 99 punktów; pierwszy około 7,3 dnia, bez ekstrapolacji do urodzenia. AutoDELFIA dla LH/FSH, Access 2 dla AMH, Gen II ELISA dla inhibiny B, LC-MS/MS dla E2. Nie są to średnie z ryc. 3. |
| LH/FSH po niemowlęctwie | [Ljubicic 2020](https://doi.org/10.1093/humrep/deaa182), tabela I | AutoDELFIA; 3273 kobiety w zdrowej części badania. Rodzaj centralnej statystyki tabeli nie jest określony: `value`, nie potwierdzona mediana. Grupa 20–<40 lat ma tylko 17 kobiet; obserwacje kończą się na 80 latach mimo etykiety 70–100. Faza cyklu nie jest ustalana z wieku. |
| AMH: dzieciństwo/pokwitanie | [Jopling 2018](https://doi.org/10.1002/edm2.21), tabela 1 | Access AMH, osocze litowo-heparynowe; małe szpitalne grupy wieku, wykluczone DSD/endokrynopatie. Mediany grup nie wyznaczają dokładnych szczytów ani dołków. Brak przelicznika surowica–osocze. |
| AMH: dorośli | [FDA K170524](https://www.accessdata.fda.gov/cdrh_docs/pdf17/K170524.pdf), Expected Reference Intervals, str. PDF 15 (wewn. 11), osocze | Access 2, 620 nieciężarnych kobiet, regularne cykle i potwierdzona płodność. Wybrano mediany osocza; tabela surowicy jest oddzielna. Ostatnia grupa 41–45 lat; nie ma liczbowej ekstrapolacji do starości. |
| Inhibina B: 5,6–47 lat | [Borelli-Kjær 2025](https://doi.org/10.1210/clinem/dgae439), ryc. 1, linia 0 SD | Gen II ELISA, surowica, oryginalnie ng/L = pg/mL. Odtworzenie rastra około ±2 pg/mL; kalibracja pikseli i SHA źródła w ekstrakcie. 149 dorosłych kobiet, bez standaryzacji fazy cyklu. Luka obserwacji 1,08–5,6 lat; nasz most zaczyna się przy 1 roku. Nie dopisujemy stężeń pod LOD 3 pg/mL. |
| E2: 6–18 lat | [Madsen 2022](https://doi.org/10.1210/clinem/dgac155), [suplement LMS](https://doi.org/10.6084/m9.figshare.17153336.v1), CC BY 4.0 | BGS2/Fit Futures, LC-MS/MS, różne fazy cyklu, bez użytkowniczek antykoncepcji doustnej. Mediana = `exp(M) / 1e6`, według komórek przykładowych K36/L36, nie samo M. To model przekrojowy, nie trajektoria jednej osoby. |
| E2: archiwum faz dorosłych | [Frederiksen 2020](https://doi.org/10.1210/clinem/dgz196), suplement tabela 8 | Surowica, izotopowe TurboFlow LC-MS/MS, 24,7–43,9 lat. Mediany 156/254/264 pmol/L dotyczą różnych faz. 156 nie jest średnią całego cyklu i nie ustala linii dorosłości. Podgrupa 303 pmol/L pokrywa się z fazą ≥15 dni; nie jest dodatkową fazą. Rozbieżność liczebności w źródle zachowano. |
| E2: po menopauzie | [Cui 2026](https://pmc.ncbi.nlm.nih.gov/articles/PMC13461334/), DOI 10.1210/clinem/dgag188, pełny artykuł, tabela 2 | 7206 kobiet 38–100 lat, 5 kohort, osocze, głównie LC-MS/MS i część RIA, harmonizacja do CDC wewnątrz publikacji. Potwierdzone zbiorcze p50 4,9 pg/mL ≈18 pmol/L nie jest medianą wieku 55 czy 75 lat. Jedna próbka na uczestniczkę nie opisuje jej trajektorii starzenia; BMI ma znaczenie dla stężenia. |

Źródła pomocnicze kierunku zmian: [SWAN/Randolph 2011](https://doi.org/10.1210/jc.2010-1746)
odnosi przejście do rzeczywistej ostatniej miesiączki, nie uniwersalnego wieku;
[Sowers 2008](https://doi.org/10.1210/jc.2008-0567) wspiera spadek AMH
i niską/niewykrywalną inhibinę B. Ekstrakt zachowuje oddzielnie pomocnicze
sprawdzenia ALSPAC i późnego okresu pomenopauzalnego. Archiwalne propozycje
„band” w ekstraktach nie są instrukcją renderowania: pasmo usunięto decyzją
właściciela, a obowiązują `displaySegments` i ten dokument.

Nie łączyć median końca pokwitania E2 z niższą medianą jednej fazy dorosłych.
Dorosłe plateau zachowuje tylko graficzną wysokość końca pokwitania.
Nie jest stężeniem 185,46 pmol/L, średnią ani medianą dorosłych. LH/FSH
po okresie niemowlęcym przedstawiają szerokie kierunki zamiast wymuszonych
szczytów/dołków między grupami. Szerokie maksimum AMH nie lokuje szczytu
dokładnie w 28. roku życia. Pokwitaniowy garb inhibiny B pozostaje,
ponieważ występuje w jej opublikowanym modelu.

## Osobny cykl estradiolu

Widoczny tylko w żeńskim widoku Całe życie, przy wybranym E2 i etapie
„Dorosła”. Bez nowego selektora; znika po zmianie widoku, etapu lub
odznaczeniu E2. Oś dni jest oddzielna od osi lat życia. Bez znacznika
pacjentki, jednostek laboratoryjnych, norm i przewidywania owulacji.

[Anckaert 2021](https://doi.org/10.1016/j.plabm.2021.e00211), tabela 1
i suplement tabela 3: 85 kobiet 18–37 lat, surowica, Roche Elecsys E2 III
na cobas e801. Mediany siedmiu podfaz 125/172/464/817/390/505/396 pmol/L
są dzielone przez 817 wyłącznie w tym osobnym schemacie. Publikacja
standaryzowała cykle do 29 dni względem szczytu LH. Środki podfaz są
przemapowane na poglądowy cykl 28-dniowy; nie są dziennymi medianami.
Końcowy spadek w dniu 28 jest jawnie oznaczonym domknięciem ilustracji,
nie pomiarem. Widoczna informacja o zmiennej długości cyklu i czasie
owulacji pozostaje. Danych Roche nie łączymy liczbowo z LC-MS/MS osi życia.

## Źródła męskie i przyszłe anality

Poniżej udokumentowano historyczny **bazowy schemat bez ilościowej oceny
pacjenta**. Zwykłe męskie widoki LH, FSH, AMH, inhibiny B i testosteronu
całkowitego oraz przerywaną ilustrację INSL3 zastępują obecnie stałe
krzywe opisane powyżej. INSL3 ma własną zatwierdzoną politykę geometrii,
bez przeliczania jej wysokości na stężenie. Zbliżenia próbkują jedną
kanoniczną krzywą, zamiast ponownie dopasowywać 97 punktów i wtórny
B-spline. Zachowują skalę, kierunek zmian i szczyty, z niewielkim błędem
ponownego próbkowania.
Porównanie płci zachowuje wcześniejszą interpolację i własną politykę
poza wspólnymi modelami AMH/minipuberty i inhibiny B opisanymi wyżej.
Oddzielne liczbowe źródła punktu wyniku znajdują się w
[PATIENT_POINT.md](hormone-lifespan/PATIENT_POINT.md). Obecność schematu
danego hormonu lub wieku nie oznacza dostępności ilościowego porównania.

Męskie `schematic-data.js` to autorski schemat, bez laboratoryjnych jednostek,
oparty na [Salonia 2019](https://doi.org/10.1038/s41572-019-0087-y), ryc. 2,
oraz kierunkach z publikacji. Nie jest digitalizacją jednej ryciny ani
siatką zmierzonych median. [Busch 2022](https://doi.org/10.1210/clinem/dgac115)
uzasadnia orientacyjny czas szczytów u donoszonych chłopców: FSH 11 dni,
LH 18 dni, INSL3 27 dni, testosteron 29 dni; własne `h.ages` zachowuje
różnice. Męskie AMH i inhibina B osiągają ilustracyjne szczyty później,
około 5. i 4. miesiąca. Nie odczytywać dokładnych ilorazów ani czasu
z porównania modelu dziewczynek z tym schematem chłopców.

Dalszy przebieg wspierają: [Madsen 2022](https://doi.org/10.1210/clinem/dgac155),
[Kelsey 2014 — testosteron](https://doi.org/10.1371/journal.pone.0109346),
[Kelsey 2016 — inhibina B](https://doi.org/10.1371/journal.pone.0153843),
[Tehrani 2017](https://doi.org/10.1371/journal.pone.0179634),
[EMAS 2022 — INSL3](https://doi.org/10.1111/andr.13220).
Wysokości pozostają poglądowe; odcinek do 90 lat nie jest ilościową prognozą.

### Pierwotny przebieg męskiego schematu — 2026-10-10

Opis historyczny: zwykłe widoki zastępuje obecnie geometria opisana
powyżej. Dawny sposób porównania płci pozostaje aktywny poza AMH
w minipuberty i inhibiną B w obu okresach, z osobnymi zatwierdzonymi
politykami.

Na polecenie właściciela przywrócono wariant „Pierwotny przebieg”,
odpowiadający rendererowi z commita `c6b03379` (przed PR #607).
Źródłowe tablice `ages`/`values` nie zmieniają się. Usunięto
`displayPointIndices`: wszystkie pierwotne punkty znów uczestniczą
w interpolacji, bez selekcji punktów prowadzących.

Historyczne trzy widoki męskie korzystały z pierwotnej interpolacji PCHIP,
97 próbek
na widocznej osi i wtórnego wygładzenia B-spline. Porównanie płci wraca
do interpolacji punktów niemowlęcych i 193 próbek z tym samym sposobem
rysowania. Jest to dokładne przywrócenie zaakceptowanego wyglądu, nie nowy
algorytm. Wygładzenie może nieznacznie spłaszczyć lub przesunąć ostry
szczyt względem węzła; nie gwarantuje przejścia linii przez każdy punkt.
Własne `h.ages` pozostają w źródłach. Zachowano niezależną skalę każdego
hormonu i dotychczasową skalę porównania płci.

**Wpływ kliniczny:** zmienia się tylko geometria edukacyjna; nie pomiary,
zakresy, klasyfikacja wyniku ani historia. Krzywe żeńskie pozostają
niezmienione. Schemat nadal nie jest modelem stężeń ani narzędziem
odczytu dokładnego czasu lub wysokości szczytów. Źródła i ograniczenia
populacji pozostają opisane powyżej.

**Backlog: kalkulator INSL3.** Obecna krzywa nie oznacza działającego
przelicznika ani interpretacji. Po wdrożeniu rzeczywistego analitu powiązać
jego ID z domyślnym wyborem, zgodnie z
[LAB_INTERPRETATION_AGENT_GUIDE.md](LAB_INTERPRETATION_AGENT_GUIDE.md).
Nie tworzyć klinicznych zakresów z tych współrzędnych. Nie mieszać
archiwalnych średnich geometrycznych Johannsen 2018
(`pairedInfantComparison`) z medianami Ljubicic 2022: nie są renderowane.

## Odtwarzanie i regresja

Źródła są czytelne w `docs/clinical/hormone-lifespan/`. Z katalogu repo:

```sh
python docs/clinical/hormone-lifespan/build_evidence.py
python docs/clinical/hormone-lifespan/verify_evidence.py
python docs/clinical/hormone-lifespan/build_runtime.py
python docs/clinical/hormone-lifespan/build_runtime.py --check
node --check vilda_hormone_lifespan_data.js
```

`build_evidence.py` zachowuje ekstrakty i buduje jawne schematy prezentacji.
`build_runtime.py` jedynie pakuje zatwierdzone dane do czytelnego UMD:
`window.VildaHormoneLifespanData` / `module.exports` z polami
`version`, `maleAges`, `maleHormones`, `maleStages`, `referenceData`,
`lifespanData`, `patientPointData`, `inhibinEvidence`, `inhibinDisplayPolicy`,
`testosteroneDisplayPolicy` oraz `insl3DisplayPolicy`.
Żeńskie odrębne widoki LH/FSH dodają `femaleGonadotropinPolicy`
i `femaleGonadotropinData`, bez zastępowania liczbowych profili pacjenta.
Przeglądarka nie potrzebuje Pythona, źródłowych JSON,
sieci ani bibliotek wykresów. Historyczne wzmianki „mock” w metadanych
pochodzą z zatwierdzonego zbioru; nie rozszerzają jego zastosowania.

`tests/unit/hormone-lifespan-data.test.mjs` ładuje rzeczywisty eksport
produkcyjny i sprawdza zachowanie dowodów, jednostek, skal, mostów i cyklu.
Przypadki regresji: E2 minipuberty 23,908/264 zamiast sztucznego szczytu 1;
AMH po niemowlęctwie bez skoku do mediany grupy 1–4,9 lat; E2 18→30 lat
bez spadku do 156/264; ciągłe łączenie mostu inhibiny B od 1 do 5,6 roku;
odróżnienie źródłowych 29 dni od schematycznych 28 dni cyklu.

`tests/e2e/hormone-lifespan-female-amh-stability.spec.mjs` sprawdza
rzeczywisty renderer: pusty wynik → zero → mediana → wysoki → wyczyszczenie,
stałe 28,99 pmol/L, jednostki, źródłowy znacznik w moście 0,9–1,3 roku,
kanoniczne zbliżenia i wybór mieszany z LH/FSH, brak nowego punktu
19,668 roku, desktop, 320 px i pełny ekran. Porównanie płci zachowuje
własną geometrię oraz skalę, odrębne od tej naprawy zwykłych widoków.

`tests/e2e/hormone-lifespan-female-e2-stability.spec.mjs` sprawdza
stałą linię i skalę E2 po wpisaniu/wyczyszczeniu wyniku, zero i strzałkę
ponad 264 pmol/L, konwersje, niezmienione źródło 21,616 pmol/L przy
0,25 roku oraz kwalifikację tylko 0,02–1 roku. Kontrole obejmują zwykłe
zbliżenia, mieszany wybór LH/FSH, desktop, 320 px i pełny ekran.

`tests/e2e/hormone-lifespan-original-curves.spec.mjs` porównuje ścieżki
SVG rzeczywistego renderera z utrwalonym wzorcem „Pierwotnego przebiegu”.
Historyczny wzorzec zwykłych widoków zastępuje aktualna polityka
kanonicznej geometrii. Niezmienione porównania płci nadal wymagają
zgodności ze swoim dotychczasowym wzorcem; AMH w minipuberty i inhibina B
mają nowe kontrakty stałych modeli, granic i wspólnych osi. Kontrola obejmuje
desktop i telefon oraz brak nowych ekstremów, bez udawania, że kotwice
schematu są ilościowymi obserwacjami.
Syntetyczne wejście: chłopiec, LH, wiek 0,25 roku → początkowo wyłącznie
krzywa LH i geometria zgodna z kanonicznym przebiegiem danego hormonu.
Istniejące testy `hormone-lifespan-context.spec.mjs` sprawdzają kontekst
formularza i interakcje obu płci.

Wzorzec pierwotnych krzywych pozostaje właściwy dla niezmienionych
porównań płci, nie dla nowych porównań AMH/minipuberty i inhibiny B,
zastąpionej geometrii zwykłych męskich widoków ani modelu ilościowego.
`tests/unit/hormone-lifespan-reference.test.mjs` wywołuje
rzeczywisty `vilda_hormone_lifespan_reference.js` i sprawdza niezależne
wartości źródłowe, granice wieku, jednostki, nierówności oraz brak
ekstrapolacji. W testach interfejsu punkt równy medianie/średniej musi trafić na
znacznik źródłowego odniesienia, a większy/mniejszy wynik odpowiednio nad nim/pod nim;
w pasach wygładzenia inhibiny B i testosteronu znacznik nie musi leżeć
na linii edukacyjnej;
pełny ekran i zmiana szerokości nie mogą zmienić tej relacji. Dla T
44 lata wymagają średniej 18,1 nmol/L, 82 lata 15,9, a >86 braku
odniesienia. Pusty wynik, wpisanie i wyczyszczenie nie zmieniają linii
ani skali; zbliżenia zachowują przebieg w granicach jawnego błędu
próbkowania, bez deklarowania identycznych ścieżek SVG. Przypadki
źródłowe podano w [PATIENT_POINT.md](hormone-lifespan/PATIENT_POINT.md).

Pliki źródłowe zawierają odnośniki, sumy kontrolne suplementów i wskazanie
konkretnych tabel/komórek/pikseli. Repozytorium nie przechowuje pełnych PDF,
makiet HTML, zrzutów makiet ani danych pacjentów. Zmiana krzywych, ich
źródeł lub znaczenia wymaga ponownego przeglądu klinicznego; poprawny test
techniczny nie stanowi dowodu poprawności medycznej.
