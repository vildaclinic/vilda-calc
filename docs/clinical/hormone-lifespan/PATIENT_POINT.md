# Punkt wyniku na wykresie hormonów

Decyzja właściciela z 10 października 2026: wdrożyć zatwierdzony czerwony
punkt na dostępnych danych liczbowych, wykorzystując istniejący formularz.
Zakres decyzji dotyczy orientacyjnej prezentacji edukacyjnej; nie jest
nadaniem statusu walidacji klinicznej modelom ani digitalizacji rycin.

## Znaczenie i dane wejściowe

Punkt pokazuje wpisane stężenie, a jego znacznik odniesienia — centralną
wartość modelu populacyjnego. Linia zwykle odtwarza ten model; męskie
LH, FSH, AMH, inhibina B i testosteron całkowity mają osobno opisane niżej
płynne prezentacje wielu źródeł.
W zależności od źródła jest to opublikowane p50 lub odczytana
z ryciny krzywa 0 SD, z odpowiednią informacją o przybliżeniu. Przy grupach
wieku Wang, Zec, Jopling i FDA odniesienie pozostaje stałą medianą jednej grupy;
nie jest to p50 dokładnego wieku. Żeńskie FSH Zec pokazuje lokalny poziomy
odcinek, a zwykłe męskie FSH i AMH osobne ciągłe ilustracje. Określenie
„średnia” nie zastępuje mediany. Osobny dorosły profil testosteronu
Walravens przedstawia rzeczywiste średnie arytmetyczne grup wieku, jawnie
tak podpisane, na tle ciągłej ilustracji. Linia nie jest granicą normy. Kolor czerwony
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
Ogólne komunikaty braku dopasowania stosują neutralne określenie „wartość
odniesienia”. Odrębne opisy porównań median zachowują nazwę tej statystyki.
Podpis poprawnie dobranej
wartości nadal wskazuje rzeczywistą statystykę źródła: średnią albo medianę.

## Żeński E2 — mediana wieku 6–18 lat, 17 października 2026

Właściciel po analizie źródła polecił wdrożenie jednego zwykłego profilu
`madsen2022-female-e2-age-6-18`. [Polityka](female-estradiol-reference-policy.json)
wykorzystuje wszystkie 13 istniejących median Madsen, ponownie sprawdzonych
z pełnym artykułem i oficjalnym suplementem LMS v1. Szczegóły populacji,
metod, komórek i granic: [audyt](evidence/female-estradiol-reference-audit-2026-10-17.json).

To przekrojowy model dziewcząt BGS2/Fit Futures, surowica LC-MS/MS, fazy cyklu
analizowane łącznie. Wykorzystuje znany wiek i płeć bez wymagania Th lub nowego
pytania o cykl. Nie jest normą, odniesieniem konkretnej fazy ani diagnozą.
Nieznana metoda dopuszcza wyłącznie porównanie edukacyjne; znana niezgodna
metoda/materiał wyklucza punkt bez fallbacku. Doustna antykoncepcja była
wykluczeniem źródłowym; znana ciąża, menopauza, leczenie hormonalne i stymulacja
są konserwatywnymi wyłączeniami aplikacji. Brak odpowiedzi pozostaje nieznany.

Cały możliwy wiek musi mieścić się w [6,18]. Dokładny węzeł 18 jest brzegiem
modelu, nie grupą 18–<19 ani dowodem próbki w dniu 18. urodzin; wpis 18 lat
0 miesięcy nie pasuje. Odrębne nieparametryczne RI 15–<18 z tabeli 2 nie
zmieniają domeny modelu tabeli 1. Luka >1–<6, wiek >18, dorosły cykl i menopauza
nie otrzymują nowych median. PCHIP zachowuje wszystkie roczne węzły.

LLOQ 0,58 pmol/L dotyczy BGS2, a 13 Fit Futures. Nie stosujemy progu 13
do młodszych dziewczynek i nie odtwarzamy nieopisanej imputacji LLOQ/2.
`<13` nie staje się dokładnym 13, 6,5 ani zerem. Przykłady rzeczywistego
silnika: F6 → 1,25768; F12/E2 50 → mediana 52,46318; F17 → 175,78271;
F18 dokładnie → 185,45584 pmol/L. Wynik 50 pozostaje 50; mediana jest niezależna.

Geometria, stała własna skala 264 pmol/L, niemowlęce mediany, warunek donoszenia,
wstawka cyklu, osobne porównania i normy laboratoryjne nie zmieniają się.
Rozszerzony adapter znanych aktualnych faktów obejmuje także niemowlęcy E2:
znane leczenie hormonalne może teraz wyłączyć jego punkt. Nie przenosi faktów
między pacjentami/płciami ani na historyczną próbkę. To jawna zmiana kwalifikacji,
nie zmiana źródła niemowląt. Testy nie stanowią walidacji klinicznej.

## Żeńskie LH/FSH — zwykłe odniesienie wieku, 16 października 2026

Po analizie Madsen/Zec właściciel polecił wdrożenie rekomendowanej polityki:
`female-gonadotropin-reference-policy.json`. Zwykłe LH i FSH od 6 do dokładnego
brzegu 16 lat korzystają z modelu wieku Madsen, niezależnie od obecności lub
stadium Th. To dobór źródła przez aplikację, nie ranking metod i nie zalecenie
autorów dotyczące łączenia badań. FSH Zec pozostaje w wieku 1–<6 tylko przy
aktualnym Th1. Nie zmieniamy osobnych laboratoryjnych osi wieku/stadium,
ostrzeżeń rozwoju, wzorów, jednostek ani wcześniej utrwalonych ocen.

Źródła i ich populacje opisuje tabela poniżej. Ponownie sprawdzono pełny
Madsen, sekcje metod, tabelę 1 i dyskusję oraz oficjalny suplement v1:
22/22 żeńskich median zgodne z oryginalnymi komórkami. `exp(M)/1e6` daje p50;
PCHIP między rocznymi węzłami pozostaje przybliżeniem aplikacji. Dla Zec
zachowujemy ekstrakt pełnego PDF zweryfikowany 10.10.2026; w bieżącym
przeglądzie potwierdzono bibliografię i abstrakt, bez ponownego dostępu do PDF.

Nowe zwykłe profile `madsen2022-female-lh-age-6-16` i
`madsen2022-female-fsh-age-6-16` mają osobne identyfikatory. Oryginalne profile
`*-sex-comparison` i ich dane pozostają wyłącznie w porównaniu. Oba zastosowania
używają tych samych 22 median; nie kopiujemy stadium pacjentki na drugą płeć.
Względna żeńska minipuberty nadal nie pokazuje kropki stężenia.

Cały możliwy wiek musi należeć do jednego profilu: dokładny 16 jest opublikowanym
brzegiem, ale wpis 16 lat 0 miesięcy obejmuje `[16,16+1/12)` i nie pasuje.
`[5,6)` może kwalifikować się do Zec przy Th1; `[5,6]` przecina źródła i nie
dostaje mediany ze środka przedziału. Nie żądamy dokładnej daty urodzenia.
Nie rozszerzamy gonadotropin do 18 lat na podstawie starszej kohorty steroidów.

Zmiana jest kliniczna w znaczeniu doboru źródła: F9/Th1/FSH przechodzi z grupy
Zec 1,55 na model Madsen 1,964770298470689 IU/L. Znana Roche cobas e411,
dotąd zgodna z Zec, nie kwalifikuje do Madsen; nie ukrywamy tego zastępczym
profilem. Nieznana metoda dopuszcza wyłącznie orientacyjne porównanie.
Nie ma kalibracji Roche–Siemens ani nowej klasyfikacji prawidłowości wyniku.

Adapter wykresu zachowuje znane dodatnie przeciwwskazania. W bieżącym kontekście
tej samej pacjentki jawna ciąża z istniejącego wyboru `pregnancy_t1/t2/t3`
nie ginie po zmianie analitu na LH/FSH. Znane leczenie hormonalne, doustna
antykoncepcja lub testosteron, jeżeli są jawnie dostępne, także nie stają się
`unknown` tylko przez zmianę analitu. Wyłączenie przy ciąży jest konserwatywną
polityką aplikacji; źródłowym wykluczeniem Madsen jest doustna antykoncepcja.
Nie dodajemy ankiety, nie deklarujemy kompletnego wykrywania antykoncepcji
z karty i nie wnioskujemy braku leczenia z pustego wywiadu. Nie przenosimy
dzisiejszych faktów na dawną próbkę ani między pacjentami lub płciami.

Przypadki rzeczywistego silnika: F12/LH 2 IU/L → mediana 0,932808521560225;
F12/FSH 2 → 4,151220353235434; F9/FSH/Th1, Th2 lub bez Th → 1,964770298470689.
F5/Th1/FSH zachowuje 1,07 i opis pełnej grupy 4–<8, N=156. Cenzurowany wynik,
niezgodna metoda/materiał i znane przeciwwskazanie nadal blokują dokładny punkt.
Pełny ślad źródeł i decyzji:
[audyt odniesień LH/FSH](evidence/female-gonadotropin-reference-audit-2026-10-16.json).

## Utrwalone odniesienie AMH — 14 października 2026

Po scaleniu PR #673 właściciel zatwierdził zapis źródłowego odniesienia
AMH razem z wynikiem. Dotyczy on zwykłego odniesienia bieżącego analitu,
nie aktywnego trybu porównania płci ani wysokości poglądowej krzywej.
Istniejące „Przypnij do wizyty” zamraża kontekst przy otwarciu okna;
nie dodaje pól formularza. Zmiana pacjenta lub modelu przed późniejszym
odczytem nie podmienia źródła. Data przypięcia/wizyty pozostaje odrębna
od wieku użytego w ocenie i nie potwierdza obserwacji w dniu pobrania.

Opcjonalne `lab.hormoneReference` obsługuje osobny
`VildaHormoneReferenceSnapshot` (`vilda_hormone_reference_snapshot.js`,
API `1.0.0`). Schemat `1` ma `kind: educational-hormone-reference`,
`scope: ordinary-patient-reference`, `analyte: amh` oraz status
`recorded`, `unavailable` lub `invalidated`. Zachowuje:

- surowy wynik z operatorem, jednostkę wejściową, wartość w pmol/L,
  użyty przelicznik oraz liczby i jednostkę prezentacji;
- użyty wiek wraz z niepewnością, płeć i znany kontekst kwalifikacji;
- źródłową liczbę, `median` albo `group-median`, pełną grupę wieku,
  profil, metodę/materiał źródła, populację, ograniczenia i pochodzenie;
- moment utrwalenia oraz wersje silnika, danych, runtime i profilu
  (wersja profilu może być `null`, jeżeli źródłowy profil jej nie ma).

`create` otrzymuje wynik rzeczywistego resolvera i istniejące konwersje;
nie oblicza własnej mediany. `normalize`, `reconcile` i `forSeries`
czytają wyłącznie zapis. Nie dobierają aktualnego profilu, nie aktualizują
wieku i nie odtwarzają odniesienia z `lab.norm` lub krzywej. Nieznany albo
uszkodzony schemat oznacza niedostępność, bez zastępczej mediany.
Znany brak kwalifikacji (np. wcześniactwo, luka wieku lub wynik `<`)
zachowuje powód; nie powstaje dokładny punkt dla wartości cenzurowanej.
Obsługa operatorów dotyczy kontraktu transportu; ta partia nie rozszerza
składni wyniku przyjmowanej przez formularz AMH.

Powiązanie z wynikiem i datą utrwala `binding`. Po zapisie zmiana wyniku,
jednostki, badania albo daty oznacza `invalidated`, z zachowaniem dawnego
odniesienia i przyczyny. Komentarz, status wizyty i niezależna norma
laboratoryjna nie zmieniają mediany. Pominięcie pola przez starszego
klienta podczas edycji nie usuwa istniejącej migawki. Starszy wpis,
który nigdy jej nie miał, nie otrzymuje jej automatycznie.

Źródła, granice wieku i przelicznik `1 pmol/L = 0,1401 ng/mL` pozostają
opisane w sekcjach AMH poniżej: Busch/Ljubicic, Wang, Jopling, Benderradji,
Tehrani i FDA. Utrwalenie nie harmonizuje ich metod, nie zmienia norm
Mayo, krzywych ani kwalifikacji i nie nadaje wynikowi werdyktu klinicznego.

| Fikcyjny scenariusz | Oczekiwany zapis i odczyt |
| --- | --- |
| F15, AMH 0,45 ng/mL, nieznana metoda/materiał | Jopling, mediana grupy 15–18,9 lat: 21,14 pmol/L = 2,961714 ng/mL; ta sama liczba po zmianie bieżącego pacjenta i tabel. |
| F28, AMH 1 ng/mL | FDA, mediana grupy 26–30 lat: 27,27 pmol/L = 3,820527 ng/mL; nie nowa norma. |
| Znane wcześniactwo w minipuberty; osobno transport `<0,1 ng/mL` | Zapis powodu niedostępności, bez wymyślonej mediany i dokładnego punktu; test transportu operatora nie oznacza nowej obsługi w formularzu. |
| Zmiana komentarza / wartości / jednostki / daty | Komentarz zachowuje zapis; pozostałe edycje unieważniają odniesienie bez ponownego obliczenia. |
| Dawne AMH bez `hormoneReference` | Dotychczasowy wynik, jednostka i jawne `lab.norm`, bez dopisanej mediany. |

## Aktywne źródła

Przedziały poniżej są polityką tego wykresu, a nie nowymi normami.
Każda publikacja zachowuje osobny profil, metodę, jednostkę i pochodzenie
liczb. Nie ma jednej zwalidowanej krzywej od urodzenia do starości.

| Profil i zastosowanie | Konkretne źródło liczb | Populacja, materiał i metoda | Ograniczenia |
| --- | --- | --- | --- |
| Męskie LH, FSH, testosteron całkowity, AMH, inhibina B; 7 dni–<1 roku | [Busch 2022](https://doi.org/10.1210/clinem/dgac115), ryc. 3, str. 1565; czarna mediana GAMLSS odczytana z wektorów PDF | 119 zdrowych donoszonych chłopców, ciąże pojedyncze, 338 próbek surowicy, COPENHAGEN Minipuberty; AutoDELFIA LH/FSH, Access 2 AMH, Gen II ELISA inhibina B, LC-MS/MS testosteron | Ekstrakcja obejmuje 7–400 dni; aktywny profil kończy się przed 1. rokiem. To przybliżenie ryciny, nie parametry autora ani średnia podłużna z ryc. 2. Osobna bramka rozdzielczości opisana niżej. |
| Męskie LH i FSH; 6–16 lat | [Madsen 2022](https://doi.org/10.1210/clinem/dgac155), [Supplemental Table 1](https://doi.org/10.6084/m9.figshare.17153336.v1), arkusz `Other biomarkers`, wiersze 17–27, kolumny B:E i G:J | Norwegia, BGS2; 414 dostępnych męskich próbek w tabeli kohorty, liczebność oznaczenia może się różnić; surowica, pobrania 08:00–14:00, Siemens IMMULITE 2000 XPi | 11 rocznych węzłów na hormon. `p50 = exp(M)/1e6`. Wiek chronologiczny, bez wyznaczania stadium Tannera. Bez ekstrapolacji na dorosłych. |
| Żeńskie LH i FSH; zwykłe widoki i porównanie płci w wieku 6–16 lat | [Madsen 2022](https://doi.org/10.1210/clinem/dgac155), [suplement v1](https://doi.org/10.6084/m9.figshare.17153336.v1), `Other biomarkers` B3:E13 i G3:J13 | BGS2, Norwegia, 601 dostępnych próbek dziewcząt w tabeli kohorty; surowica 08:00–14:00, IMMULITE 2000 XPi | 22 mediany, `exp(M)/1e6`, bez wymogu Th. Osobne identyfikatory profili zwykłych i porównania. Cykl niestandaryzowany, doustna antykoncepcja wykluczona. Wiek 16 jest opublikowanym brzegiem modelu kohorty 6–<16, bez ekstrapolacji. |
| FSH przed pokwitaniem: chłopcy 1–<6 lat/G1; dziewczynki 1–<4 i 4–<6 lat/Th1 | [Zec 2012](https://doi.org/10.1016/j.clinbiochem.2012.05.019), tabela 2, str. 1210/PDF 5: chłopcy grupa źródłowa 1–<8 lat, mediana 0,48 IU/L, N=303; dziewczynki grupy źródłowe 1–<4 / 4–<8 / 8–<11, mediany 2,57/1,07/1,55 IU/L, N=124/156/107 | Zagrzeb, Chorwacja, Tanner 1; całe badanie N=948, nie każdy hormon oznaczano u każdego dziecka. Roche cobas e 411, kanapkowe ECLIA; zbierano surowicę i osocze Li-heparynowe, bez przypisania materiału do analitu | Mediany całych grup, nie model dokładnego wieku. Aktualne typowane G1/Th1 jest wymagane. Od 6 lat obie płcie używają Madsen. Węższe okna aplikacji nie zmieniają źródłowych etykiet, median ani N. Grupy 8–<11 obu płci pozostają w dowodach. |
| Męski testosteron całkowity; 6–<18 lat | [Madsen 2022](https://doi.org/10.1210/clinem/dgac155), [Supplemental Table 1 v1](https://doi.org/10.6084/m9.figshare.17153336.v1), arkusz `LCMSMS hormones`, AF19:AI31; przykładowa transformacja K37 | Norwegia, BGS2 i FitFutures; przekrojowe kohorty populacyjne, głównie pochodzenia europejskiego; surowica, pobrania 08:00–14:00, LC-MS/MS, LLOQ 0,02 nmol/L | 13 rocznych węzłów 6–18, p50=`exp(M)/1e6`; PCHIP jest przybliżeniem między nimi. Aplikacja używa profilu przed 18. urodzinami; węzeł 18 domyka interpolację dla wieku 17.x. Bez narzucania Tannera i bez korekty do pory pobrania. Nie są to normy laboratoryjne ani średnia arytmetyczna. |
| Męski testosteron całkowity; 3–<6 lat | [Kelsey 2014](https://doi.org/10.1371/journal.pone.0109346), Table S1, A1/B2:B8; [korekta 2015](https://doi.org/10.1371/journal.pone.0117674), poprawiona tabela 3 | Połączone 13 badań, 10 097 obserwacji, niekoniecznie niezależnych osób; surowica, różne oznaczenia przeliczone przez autorów do odpowiednika LC-MS/MS | Pełny model 3–88 lat pozostaje dowodem; aktywny wybór ograniczono do 3–<6. Funkcja centralna `log10(T+1)` po odwróceniu transformacji, zgodna z poprawionym p50; między węzłami PCHIP. Źródło punktu nie wymusza kotwic geometrii 3–5 lat. Dawny dorosły profil zastąpił Walravens; nie poprawiamy liczb Kelsey pod oczekiwany trend. |
| Męski testosteron całkowity; 18–86 lat | [Walravens 2025/2026](https://doi.org/10.1210/clinem/dgaf507), tabela 1; publikacja online 10.09.2025, wydanie JCEM marzec 2026 | 1194 mężczyzn pochodzenia europejskiego, 18–86 lat, BMI ≤35; młodsze zdrowe kohorty i starsza populacja społecznościowa, także z chorobami; surowica rano przed 10:00, na czczo; LC-MS/MS | Siedem średnich arytmetycznych całkowitego T: 18–29: 20,7; 30–39: 20,0; 40–49: 18,1; 50–59: 16,9; 60–69: 17,1; 70–79: 17,0; 80+: 15,9 nmol/L. Nie mediany, normy, wolny T ani model ciągłego wieku. Grupa 80+ działa tylko do obserwowanych 86 lat. Poglądowa krzywa nie interpoluje średniej dla pacjenta. |
| Męska inhibina B; 1–<6,1 roku | [Kelsey 2016](https://doi.org/10.1371/journal.pone.0153843), tabela 4, opublikowane węzły p50 | Cztery badania, 709 obserwowanych par wiek–stężenie; surowica, historyczne dwumiejscowe ELISA | Pełna tabela 0–17 lat pozostaje dowodem, wybrany odcinek jest polityką aplikacji. Nie używać rocznej tabeli do minipuberty. Nie odtwarzać modelu zaokrąglonymi współczynnikami z tabeli 2. |
| Męska inhibina B; 6,1–80 lat | [Borelli-Kjær 2025](https://doi.org/10.1210/clinem/dgae439), ryc. 2, męska linia 0 SD | Dania, 1818 uczestników/2007 próbek łącznie; surowica; mieszane Oxford Bio-innovation i Gen II ELISA | Digitalizacja około ±5 pg/mL, nie dokładna funkcja autora ani kalkulator SDS. `ng/L = pg/mL`. Nie przeliczać dowolnej metody współczynnikiem różnicy Oxford/Gen II. Nie łączyć z Kelsey jako jednym modelem odniesienia pacjenta; wygładzona wspólna linia jest wyłącznie prezentacją. |
| Męskie AMH; osobne roczne grupy 1–11, 13 i 14 | [Wang 2020](https://doi.org/10.1016/j.cca.2020.03.028), tabele 1 i 2, str. 156/PDF 3; zgodne mediany obu tabel | 2009 zdrowych chłopców, Wuhan, Chiny; badanie przekrojowe, szpital i pięć szkół; surowica pobierana 08:00–10:00, Beckman Coulter Access 2 | 13 zgodnych median grupowych, nie ciągły model ani mediany Tannera. Grupy 0 i 12 wyłączone z powodu sprzecznych median. Przypisanie etykiety N do `[N,N+1)` jest jawną konwencją aplikacji; autorzy nie podali reguły zaokrąglania wieku ani maksymalnego obserwowanego wieku. Brak interpolacji między grupami. |
| Męskie AMH; 12–<13 i 15–<18 lat | [Jopling 2018](https://doi.org/10.1002/edm2.21), tabela 1: grupy 12–14,9 / 15–18,9 lat, p50 64,66 / 55,61 pmol/L, N=36 / 48 | Pozostałości próbek szpitalnych chłopców, Manchester; wykluczono podejrzenie DSD/endokrynopatii, bez Tannera; osocze Li-heparynowe, Access AMH, rozcieńczenie próbek męskich 1:10 | Mediany pełnych grup, nie nowych węższych podgrup aplikacji. Zachowane Wang 13–<15; konserwatywny koniec <18. Nie potwierdza zdrowia ani metody próbki pacjenta. |
| Męskie AMH; 20–<30 lat | [Benderradji 2022](https://doi.org/10.1210/clinem/dgac218), tabela 1: p50 43,8 pmol/L całej grupy 20–39 lat | Normozoospermiczni partnerzy par z obniżoną płodnością, Lille; prawidłowe FSH/LH/T/inhibina B, bez stymulacji; surowica 08:00–10:00, bez wymogu bycia na czczo, DxI Access AMH | Wyselekcjonowana kohorta: 578 mężczyzn po usunięciu 29 odstających AMH, wiek 20–62; N grupy 20–39 nie podano. Nie mediana dokładnego wieku ani norma populacji ogólnej. Nie aktywujemy starszej grupy. |
| Męskie AMH; 30–70 lat | [Tehrani 2017](https://doi.org/10.1371/journal.pone.0179634), tabela 2, 41 rocznych p50 | 831 zdrowych mężczyzn z Tehran Lipid and Glucose Study; surowica, zmodyfikowany AMH Gen II EIA, na czczo 07:00–09:00 | Mediany swoiste dla wieku; pomiędzy nimi interpolacja. Nie zamieniać na osocze Access ani nie przedłużać przed 30. i po 70. roku. |
| Żeńskie LH, FSH, AMH, inhibina B, E2; 0,02–1 roku (FSH: 0,02–<1 roku) | [Ljubicic 2022](https://doi.org/10.1210/clinem/dgac363), ryc. 1 i [Supplementary Table 1](https://doi.org/10.6084/m9.figshare.19469555.v1), 99 median na hormon | 98 zdrowych donoszonych dziewczynek, 266 próbek surowicy; AutoDELFIA LH/FSH, Access 2 AMH, Gen II ELISA inhibina B, LC-MS/MS E2 | Pierwszy zachowany węzeł 0,02 roku, nie urodzenie. Mediany GAMLSS nie są średnimi podłużnymi z ryc. 3. Nie dopisywać stężeń przed pierwszym węzłem. Wyłącznie dla FSH pierwsze urodziny należą już do profilu Zec z własnym warunkiem stadium; nie stosujemy zastępczo profilu niemowlęcego. |
| Żeńskie AMH; grupy po 1. i przed 18. urodzinami | [Jopling 2018](https://doi.org/10.1002/edm2.21), tabela 1 | Osocze litowo-heparynowe, Beckman Coulter Access AMH; pozostałości próbek szpitalnych, wykluczone podejrzenie endokrynopatii i DSD | Pięć stałych median całych grup, nie model dokładnego wieku ani Tannera. Routing i granice opisano poniżej. Nie harmonizujemy osocza z surowicą niemowląt ani dorosłych. |
| Żeńskie AMH; 18–<46 lat, wyłącznie zwykłe widoki | [FDA K170524](https://www.accessdata.fda.gov/cdrh_docs/pdf17/K170524.pdf), PDF str. 14/wewn. 10, tabela surowicy | Access AMH, Access 2; pięć ośrodków, pozornie zdrowe nieciężarne kobiety z regularnymi cyklami 21–35 dni, oboma jajnikami i udowodnioną płodnością; 620 próbek w tabeli | Pięć stałych median grup; konwencja ukończonych lat jest polityką aplikacji, nie opisaną regułą autora. Osocze z PDF str. 15 pozostaje odrębnym źródłem ilustracji. Brak norm, rozpoznania płodności i ekstrapolacji od 46 lat. |
| Żeńska inhibina B; wyłącznie zwykłe widoki `(1,5)` i `[5,5.6)` lat | [Zhou 2025](https://doi.org/10.1038/s41598-025-85551-9), tabele 1–3 | Surowica, Kangran Biotech double-antibody CLIA, KAESER 1000; szpitalna kohorta Wuhan 2022; pełne grupy 1–5 lat N=60 i 5–10 lat N=77 | Stałe mediany grup 33/27 pg/mL, nie model wieku. Granica 5 jest konwencją aplikacji; cały przedział wieku musi pasować. 90% CI 30–39/24–29 dotyczy median, nie norm. Bez harmonizacji Gen II, interpolacji, zmiany krzywej i aktywacji zakresów laboratoryjnych. |
| Żeńska inhibina B; zwykłe widoki 5,6–47 lat, porównanie płci 8–20 lat | [Borelli-Kjær 2025](https://doi.org/10.1210/clinem/dgae439), ryc. 1, przybliżona mediana GAMLSS (0 SD) | Surowica, Beckman Coulter Gen II ELISA; 648 dziewcząt 5,6–20,2 lat i 149 kobiet 20–69 lat | Od 14.10.2026 jeden zwykły profil obejmuje 5,6–47 włącznie. Zachowane 24 węzły PCHIP; 47 to koniec zachowanego odczytu liczbowego, nie obserwacji. Digitalizacja około ±2 pg/mL nie jest CI. Cykl niestandaryzowany, dane antykoncepcji niepełne; znana ciąża/menopauza wyłącza zwykły profil według polityki aplikacji. Bez SDS, norm i ekstrapolacji. |

INSL3 pozostaje zadaniem przyszłego kalkulatora. Zatwierdzona
11 października 2026 przerywana linia ma osobną względną politykę
`insl3-display-policy.json`; jej wysokości nie mają jednostki stężenia.
Ani geometria, ani zachowane wartości niemowlęce z Busch nie uruchamiają
nowego analitu, profilu odniesienia lub punktu pacjenta. Dorosłe LH/FSH opisuje
poniższe uzupełnienie zatwierdzone 11 października 2026. Dziecięce
AMH poza wymienionymi grupami, pozaniemowlęce profile żeńskie poza FSH Zec,
AMH Jopling/FDA, inhibiną B Zhou >1–<5,6/Borelli 5,6–47 i LH/FSH Madsen 6–16 oraz niepokryte fragmenty
osi pozostają bez ilościowego punktu. Dostępny schemat nie wypełnia
tej luki. Mediana szerokiej grupy wieku nie staje się ciągłym modelem wieku;
odrębna grupowa prezentacja wymaga własnej polityki źródłowej, jak Wang i Zec.
Dane płodowe, pępowinowe i wcześniacze nie należą do powyższych profili.

### Męskie AMH — uzupełnienie median grupowych, 13 października 2026

Po scaleniu podstawy AMH (#661) właściciel polecił następny mały krok
planu: liczby odniesienia w brakujących przedziałach męskiego AMH.
Trzy profile `ordinaryOnly`, `group-median`, `interpolation: constant`
uzupełniają zwykłe widoki bez modyfikacji norm Mayo, geometrii i skali.
Podpis „Mediana grupy” korzysta z jednostki wybranej przez lekarza;
krótka notka zachowuje pełną grupę źródłową. To nie mediana dokładnego
wieku ani stadium Tannera. Jasny znacznik może leżeć poza linią.

| Źródło i pełna grupa | Mediana pmol/L | Ta sama mediana ng/mL | Domena aplikacji |
| --- | ---: | ---: | --- |
| Jopling 12–14,9 lat, N=36 | 64,66 | 9,058866 | `[12,13)` |
| Jopling 15–18,9 lat, N=48 | 55,61 | 7,790961 | `[15,18)` |
| Benderradji 20–39 lat, N niepodane | 43,8 | 6,13638 | `[20,30)` |

Przeliczenie `1 pmol/L = 0,1401 ng/mL` jest dotychczasowym przeliczeniem
jednostki, nie harmonizacją metod. Pełne teksty i tabele sprawdzono
w PDF, Jopling również w HTML, Benderradji w XML. Odczytane fakty,
pochodzenie i hashe są w `evidence/patient-point/jopling2018-male-amh-group-medians.json`
i `benderradji2022-male-amh-group-medians.json`. Polityka wyboru jest
osobnym plikiem `male-amh-reference-policy.json`; silnik pozostaje ogólny.

Węższe domeny wybrano wyłącznie do uzupełnienia luk: Jopling nie zastępuje
Wang 13–<15, Benderradji nie zastępuje Tehrani od 30 lat. Zachowano
wszystkie 66 poprzednich profili. Nie ma fallbacku do innej metody,
wyboru najkorzystniejszej mediany ani interpolacji między źródłami.
Pełny możliwy przedział wieku musi mieścić się w jednej domenie;
`[12,13)` jest dopuszczalny, `[12,13]` nie. Luka `[18,20)` pozostaje,
bo Jopling opisuje maksimum wieku 18 lat pomimo etykiety tabeli 18,9,
a rzeczywiste obserwacje Benderradji zaczynają się od 20 lat.

Jopling jest badaniem pozostałości próbek szpitalnych, nie prospektywną
kohortą zdrowych dzieci. Liczby 469 chłopców / 235 dziewcząt pochodzą
z Methods i tabeli; abstrakt ma inne sumy. Stadium Tannera nie jest
dostępne. Znana surowica, ogólne osocze bez antykoagulantu lub EDTA
nie kwalifikują się do profilu osocza Li-heparynowego. Identyfikatory
metody zgodne z Access/Access 2 zachowują dotychczasową konwencję Jopling.

Benderradji jest retrospektywnym badaniem wyselekcjonowanych mężczyzn
z kliniki andrologicznej, nie normą wszystkich zdrowych mężczyzn.
N=578 dotyczy pełnej kohorty po wyłączeniu odstających AMH; nie
podajemy fikcyjnego N grupy. Znane metoda/materiał muszą odpowiadać
DxI Access/surowicy. Nie uznajemy automatycznie Access 2, Elecsys ani
Gen II za metodę tego badania. Brak danych umożliwia jedynie jawne
edukacyjne odniesienie, bez potwierdzania metody lub materiału pacjenta.

Znane przeciwwskazanie (np. leczenie), nierówność wyniku i niepewny wiek
przecinający granicę nadal blokują punkt. Nie wymagamy dodatkowego
wywiadu, stadium czy badania nasienia; ograniczenie populacji opisujemy
przy odniesieniu. Profile nie trafiają do porównania płci AMH w pokwitaniu.
Nie zmieniają zapisu wizyty/historii, źródłowych RI, progów ani diagnoz.

Przypadki: M12/8 ng/mL → mediana grupy ≈9,06; M17/4 → ≈7,79;
M25/4 → ≈6,14. M13 i M14 zachowują Wang, M30 zachowuje Tehrani.
M18/M19 i wiek >70 → brak nowego odniesienia. Niski, wysoki i wyczyszczony
wynik oraz przełączanie widoków nie zmieniają istniejącej linii.

### Żeńskie AMH i inhibina B — rozszerzenie 13 października 2026

Właściciel zaakceptował dodanie median w zwykłych widokach, z krótkimi
komentarzami ograniczeń i bez nowych pól. Zgoda dotyczy edukacyjnej relacji
stężenia do źródłowej mediany, nie nowych norm, diagnozy ani walidacji
klinicznej. Linie, skale, wcześniejsze źródła, zapis i porównania płci
zachowują swoje kontrakty.

W nowych profilach oba podpisy używają jednostki wybranej przy wyniku.
Adapter przekazuje ją osobno jako `displayUnit`; pomiar i współrzędne
pozostają w dotychczasowych jednostkach obliczeń. Przeliczenie podpisów
korzysta wyłącznie z istniejącego słownika jednostek, bez harmonizacji
metod lub materiałów. Zmiana ng/mL ↔ pmol/L nie przesuwa znaczników.

**Jopling 2018, tabela 1:** pięć grup dziewcząt ma następujące mediany.

| Grupa w publikacji | N | Mediana [pmol/L] | Routing aplikacji [lata] |
| --- | --- | --- | --- |
| 1–4,9 | 42 | 14,58 | `(1,5)` |
| 5–7,9 | 42 | 11,44 | `[5,8)` |
| 8–11,9 | 47 | 20,42 | `[8,12)` |
| 12–14,9 | 33 | 17,87 | `[12,15)` |
| 15–18,9 | 30 | 21,14 | `[15,18)` |

`interpolation = constant` zachowuje jedną medianę całej grupy; nie
interpolujemy między środkami grup ani nie pobieramy liczby z poglądowej
linii. Dane autorów zapisano z wiekiem w dniach. Tekst opisuje wiek do
18 lat, tabela kończy się etykietą 18,9; nie podano rzeczywistego maksimum
ani reguły zaokrągleń. Sąsiadujące przedziały aplikacji są jawną konwencją
bez sztucznych luk 4,9–5 itd.; cap <18 jest konserwatywną polityką tej
partii. Etykieta 15–18,9 oraz N=30 nadal opisują pełną grupę źródłową.

Pierwszy nowy profil ma `minAgeExclusive` przy 1 roku. Dokładnie 1 rok
zachowuje dotychczasowe Ljubicic i bramkę donoszenia. Przedział zaczynający
się przy 1, np. `[1,1+1/12)`, albo obejmujący granicę dwóch grup pozostaje
bez jednej mediany; krótki komunikat wyjaśnia niejednoznaczny wiek.
Nie wybieramy źródła po środku przedziału. Ta pediatryczna partia nie
aktywowała FDA, dorosłego modelu Jopling ani median Tannera; osobne
rozszerzenie FDA opisano poniżej.

Materiał Jopling to osocze litowo-heparynowe, metoda Access AMH.
`compatibleSpecimenIds` dobiera akceptowane oznaczenia materiału dla
tego źródła; istniejące profile zachowują dotychczasową domyślną politykę
surowicy. Nieznany materiał/metoda dopuszcza edukacyjne zestawienie, ale
nie potwierdza zgodności próbki. Znana surowica lub inny niezgodny materiał,
znana niezgodna metoda i przeciwwskazania blokują punkt. Źródło podaje
małe szpitalne grupy; zdrowie założono po wykluczeniach, a stadium Tannera
nie było dostępne. Nie traktujemy relatywnej stabilności AMH w cyklu
jako dowodu braku wpływu każdego kontekstu klinicznego.

**Historia Borelli-Kjær 2025, ryc. 1 (13.10.2026):** zwykły profil **5,6–20 lat włącznie**
korzysta z tych samych 24 odczytanych węzłów 5,6–47 lat co porównanie płci.
Początkowe 8–20 w PR #651 zachowywało okno pokwitania; po zgłoszeniu
F6/33 pg/mL właściciel 13 października zatwierdził udostępnienie istniejących
median także 5,6–<8 lat. ID to `borelli2025-female-inhb-age-5p6-20`,
polityka i dane punktu `2026-10-13.2`; porównanie płci nadal 8–20.
Rozszerzenie do 47 lat z 14 października opisano poniżej; zastępuje ono
ten zwykły profil, zachowując dotychczasowe wartości.
Cały możliwy przedział wieku musi mieścić się w profilu. Nie obcinamy PCHIP
do zakresu kwalifikacji ani nie zmieniamy wartości, krzywej lub skali.
Dla dokładnie 6 lat mediana wynosi ≈11 pg/mL, a wynik 33 leży powyżej niej,
co nie oznacza „powyżej normy”. Kalendarz lub dokładniejszy wiek nie powstają
przez dopisanie danych do formularza. Przedział [6,6+1/12) jest objęty
profilem, a wartości modelu na jego krańcach zaokrąglają się do ≈11.
W tej historycznej partii luka >1–<5,6 pozostała bez odniesienia; bramki metody,
materiału, wyniku i przeciwwskazań obowiązują nadal. Nie wymagamy Th1. Przy 15 latach
mediana wynosi ≈44 pg/mL, przy 16 ≈40; niepełny wiek nadal daje przedział
odniesienia. ±2 pg/mL oznacza oszacowanie odczytu, nie przedział ufności.
Kohorta 648 dziewcząt 5,6–20,2 lat jest częścią 889 kobiet/dziewcząt;
wszystkie oznaczenia żeńskie wykonano Gen II ELISA w surowicy, LOD 3 pg/mL.
Mediana ≈11 w wieku 6 lat nie jest wartością pod LOD ani imputacją LOD/2.
Pełny artykuł i zachowany suplement ponownie sprawdzono; suplement opisuje
walidację metody i nie udostępnia numerycznych parametrów LMS. Wczesne
punkty ryciny częściowo zasłaniają krzywą; nie deklarujemy niezależnej
ponownej digitalizacji ani precyzji większej niż dotychczasowe około ±2.
Nie standaryzowano fazy cyklu, dane antykoncepcji były niepełne; mediana
podgrupy stosującej antykoncepcję wynosiła 8, a niestosującej 55 ng/L.
Nie jest to podstawa automatycznej korekty wyniku. Wiek nie zastępuje
Tannera, a jasny punkt nie jest dolną granicą normy.

Przykład kontrolny: dziewczynka 15 lat, AMH 0,45 ng/mL, nieznana metoda
i materiał → wartość wyniku 3,212 pmol/L oraz mediana grupy 21,14 pmol/L
(≈2,96 ng/mL). Wynik poniżej mediany nie otrzymuje z tego powodu werdyktu
„poniżej normy”. Krzywa pozostaje identyczna po wyczyszczeniu wyniku.
Pełne pochodzenie, hashe i przypadki graniczne:
[przegląd źródeł](evidence/female-reference-points-2026-10-13.json).

### Żeńska inhibina B — rozszerzenie odniesienia do 47 lat, 14 października 2026

Zwykły profil `borelli2025-female-inhb-age-5p6-47` zastępuje profil
`borelli2025-female-inhb-age-5p6-20`. Polityka
[`female-inhibin-reference-policy.json`](female-inhibin-reference-policy.json)
i dane punktu mają wersję `2026-10-14.1`; dawna wspólna polityka
adolescent pozostaje dla AMH. Zmiana poszerza dostępność źródłowej liczby,
bez nowych pól, przeliczeń, norm lub geometrii. Pozostałe 73 profile oraz
odrębne porównanie inhibiny B 8–20 lat pozostają bez zmian.

Pełny artykuł Borelli-Kjær (*JCEM* 2025;110:70–77,
[DOI 10.1210/clinem/dgae439](https://doi.org/10.1210/clinem/dgae439),
wersja składu 18.07.2024) i [suplement v1](https://doi.org/10.6084/m9.figshare.26056558.v1)
sprawdzono ponownie. Ryc. 1 przedstawia medianę modelu GAMLSS (0 SD),
a nie średnią. Łączna żeńska kohorta to 889 uczestniczek/1005 próbek,
w tym 648 dziewcząt 5,6–20,2 lat i 149 kobiet 20–69 lat z Health2006.
Dorosłe obserwacje są nieliczne, fazy cyklu nie standaryzowano,
a danych o antykoncepcji brakowało u większości kobiet. Nie jest to
potwierdzona populacja wyłącznie nieleczona ani model faz cyklu.

Wszystkie żeńskie próbki oznaczano w surowicy metodą Beckman Coulter
Inhibin B Gen II ELISA, w ng/L = pg/mL, LOD 3 pg/mL. Zachowano **24
węzły i tę samą interpolację PCHIP**. Przy dokładnym wieku 25/30/40/46/47
lat odczyt wynosi odpowiednio ≈32/30/28/17/11 pg/mL. Około ±2 pg/mL
opisuje niepewność digitalizacji, nie CI, rozrzut populacji ani normę.
Nie uzyskano oryginalnych parametrów LMS/GAMLSS; suplement waliduje
metodę, nie dostarcza tabeli median wieku. Nie deklarujemy ponownego
dopasowania modelu ani dokładniejszej digitalizacji.

Oba końce **5,6–47** są włączone, a cały możliwy wiek musi się mieścić
w profilu. Nie tworzymy nowego styku źródeł przy 20 latach: formularz
„20 lat, 0 miesięcy” kwalifikuje swój cały przedział. Dokładnie 47 lat
daje ≈11 pg/mL, ale „47 lat, 0 miesięcy” to przedział wykraczający poza
47 i dlatego nie daje odniesienia. Nie wybieramy środka takiego wieku.
Granica 47 wynika z ostatniego zachowanego, zweryfikowanego węzła;
obserwowanie kobiet do 69 lat nie upoważnia do ekstrapolacji z ogona.
Wartość 11 i jej przybliżona tolerancja odczytu 9–13 są powyżej LOD 3.

Znana ciąża (`pregnancy_t1/t2/t3`) lub stan po menopauzie
(`postmenopause`) wyłącza **ten zwykły profil**. To konserwatywna polityka
aplikacji: autorzy nie podali modelu dla ciąży ani osobnego odniesienia
menopauzalnego; nie przedstawiamy tej bramki jako kryterium wykluczenia
kohorty. Brak kontekstu nie oznacza potwierdzonego braku ciąży/menopauzy
lub antykoncepcji, lecz dopuszcza ograniczone porównanie wieku. Zwykłe
fazy cyklu nie dobierają nowych median. Adapter przekazuje bieżące
znormalizowane `reproductiveContext` inhibiny B do `cyclePhase` wykresu;
nie przenosi kontekstu historycznej próbki lub innej osoby/płci. Nieznany
stan może korzystać z już znanego bieżącego `cycle_phase`. Zachowano dotychczasowe bramki
GnRHa, metody, materiału, cenzurowania i kwalifikacji całego wieku.
Nieznane metoda/materiał nie potwierdzają zgodności z surowicą Gen II;
znana niezgodność nadal blokuje punkt.

Krótki komentarz pozostaje: „Cykl i antykoncepcja mogą wpływać na
porównanie.” Szczegóły źródła podają pełne ograniczenia. Różnica median
8 ng/L u 59 nastolatek stosujących antykoncepcję doustną i 55 ng/L
u 81 niestosujących nie stanowi przelicznika wyniku ani progu rezerwy
jajnikowej. Nie nadajemy statusu normy, SDS, centyla, diagnozy lub prognozy
płodności z relacji punktu do mediany. Jasnego znacznika nie przyciągamy
do wygładzonej linii.

W tej partii luka >1–<5,6 oraz wiek >47 pozostały bez zwykłego odniesienia.
Kolejne rozszerzenie Zhou poniżej uzupełnia wyłącznie dziecięcą lukę
dwiema medianami pełnych grup, zachowując profil Borelli.
Crofton 2002 (DOI `10.1046/j.0300-0664.2001.01449.x`, tabela 1) zachowano
do osobnej decyzji: grupa 0–6 lat N=105, mediana 10,6 pg/mL, 35% pod
LOD 8 pg/mL, osocze i historyczny ELISA. Nie aktywujemy tej mediany
szerokiej grupy jako modelu dokładnego wieku lub minipuberty.
Źródła, hashe, zakres audytu i oczekiwane regresje:
[przegląd dostępności](evidence/female-inhibin-reference-coverage-2026-10-14.json).

### Żeńska inhibina B — mediany grup dziecięcych Zhou, 14 października 2026

Po scaleniu PR #672 dodano dwa odrębne profile `ordinaryOnly`,
`group-median`, `interpolation: constant` z wersją danych `2026-10-14.2`.
Polityka [female-inhibin-childhood-reference-policy.json](female-inhibin-childhood-reference-policy.json)
uzupełnia tylko lukę po dokładnym 1 roku i przed 5,6 roku. Zachowano
wszystkie 74 wcześniejsze profile, niemowlęce kwalifikacje i osobną politykę
Borelli. Pełny [Zhou i wsp. 2025](https://doi.org/10.1038/s41598-025-85551-9),
*Scientific Reports* 15:1899, opublikowany 14.01.2025, dostarcza:

| Pełna grupa źródłowa | N (tabela 1) | Mediana pg/mL (tabele 2/3) | 90% CI mediany (tabela 3) | Domena aplikacji |
| --- | ---: | ---: | --- | --- |
| 1–5 lat | 60 | 33 | 30–39 | `(1,5)` |
| 5–10 lat | 77 | 27 | 24–29 | `[5,5.6)` |

Profile to `zhou2025-female-inhb-age-over1-under5` i
`zhou2025-female-inhb-age-5-under5p6`. Drugi podaje medianę **całej grupy
5–10**, nie nowej podgrupy 5–5,6. Źródło nie definiuje inkluzywności
stykających się etykiet 1–5/5–10. Przypisanie dokładnych 5 lat drugiej
grupie jest jawną konwencją aplikacji. Dokładnie 1 rok zachowuje Ljubicic,
a od 5,6 do 47 lat — Borelli. Nie wybieramy Zhou jako zastępstwa
niedopasowanej metody innego aktywnego źródła.

Cały możliwy wiek musi mieścić się w jednym profilu. `[4,5)` korzysta
z 33, ale `[4,5]` albo `[4.99,5.01]` nie dostają jednej mediany.
„5 lat, 3 miesiące” mieści się w drugim profilu i daje 27; „5 lat,
7 miesięcy” przecina 5,6 i nie otrzymuje arbitralnej liczby.
Sam wiek „5 lat” bez miesięcy obejmuje `[5,6)` i również przecina źródła.
Przedział od dokładnie 1 roku, np. `[1,1+1/12)`, przecina Ljubicic/Zhou.
Nie wybieramy źródła według środka wieku ani wartości wyniku.

To przekrojowe badanie próbek szpitalnych Wuhan, Chiny, pobranych
w styczniu–grudniu 2022; 622 dzieci, w tym 302 dziewczynki. Wykluczano
m.in. choroby rozrodcze/endokrynne, poważne choroby przewlekłe, zakażenia
i chemioterapię, ale autorzy dopuszczają pozostawienie osób z patologią.
Grupy były mniejsze niż 120, bez pory pobrania, powtórzonych pomiarów
oraz danych Tannera/cyklu w starszym wieku. Nie przedstawiamy kohorty
jako losowej zdrowej populacji ogólnej ani udowodnionej populacji nieleczonej.
Brak Tannera nie staje się nowym obowiązkowym polem lub przypisaniem Th1.

Próbki surowicy oznaczano Kangran Biotech double-antibody inhibin B CLIA
na KAESER 1000; LOD 7 pg/mL, CV 4,34–9,73%. `ng/L = pg/mL` zachowuje
istniejącą konwersję jednostek, bez kalibracji z Gen II lub Oxford ELISA.
Znana inna metoda, samo ogólne „CLIA”, osocze lub inny materiał nie
kwalifikują się. Nieznane metoda/materiał dopuszczają wyłącznie orientacyjne
porównanie. Nie wpisujemy zgodności metody do faktów o próbce.
Źródłowa imputacja `<LOD` jako LOD/√2 nie dotyczy wyniku pacjentki;
liczby cenzurowanych pomiarów w tych dwóch grupach nie podano.

Podpis „Mediana grupy” i krótka notka „Grupa 1–5 lat · Chiny · KAESER
1000 CLIA.” (odpowiednio 5–10) opisują punkt. **90% CI mediany nie jest
zakresem referencyjnym pacjentki.** Wartości 33/27 nie powstają z mostu
linii, nie są średnią, medianą dokładnego wieku lub normą Tannera.
Różnica 33→27 przy granicy 5 i przejście do ≈11 Borelli przy 5,6
nie oznaczają nagłych zmian biologicznych: zmienia się grupa lub metoda/
populacja źródła. Krzywa, jej płynny most, skala i punkt pacjentki nie
są do tych median dopasowywane; jasny znacznik może leżeć poza linią.

Nie aktywujemy norm Zhou: dolna granica grupy 1–5 różni się między
tabelą 2 (15) i 3 (14), choć obie podają zgodną medianę 33. Suplement
zawiera tylko tabelę S1 regresji; sześcienna regresja z R²=0,198 nie jest
nowym modelem mediany. Crofton pozostaje nieaktywną alternatywą dla
tej luki. Porównania płci, normy laboratoryjne, historie, męskie profile,
donoszone niemowlęta i pozostałe hormony nie są zmieniane.

Przypadki: F3/33 pg/mL → mediana grupy 1–5 =33; F5,25/33 → grupa
5–10 =27; F6/33 zachowuje Borelli ≈11. Żaden z tych stosunków nie
dodaje werdyktu „w normie/powyżej normy”. Źródło i hashe:
[dane grup](evidence/patient-point/zhou2025-female-inhb-childhood-groups.json),
[przegląd tej partii](evidence/female-inhibin-childhood-reference-coverage-2026-10-14.json).

### Żeńskie AMH — mediany dorosłych FDA, 13 października 2026

Pięć profili `ordinaryOnly`, `group-median`, `interpolation: constant`
udostępnia źródłowe mediany surowicy w zwykłych widokach. Pełny
[FDA K170524](https://www.accessdata.fda.gov/cdrh_docs/pdf17/K170524.pdf),
przygotowany 09.11.2017, podaje odrębne tabele surowicy na stronie
PDF 14/wewnętrznej 10 i osocza Li-heparynowego na PDF 15/wewnętrznej 11.
Nie mieszamy ich ani nie odczytujemy mediany z istniejącej krzywej.

| Grupa źródłowa | N | Mediana surowicy pmol/L | Mediana ng/mL wydrukowana w źródle | Domena aplikacji |
| --- | ---: | ---: | ---: | --- |
| 18–25 | 120 | 25,7 | 3,60 | `[18,26)` |
| 26–30 | 131 | 27,27 | 3,82 | `[26,31)` |
| 31–35 | 120 | 17,64 | 2,47 | `[31,36)` |
| 36–40 | 123 | 12,21 | 1,71 | `[36,41)` |
| 41–45 | 126 | 3,86 | 0,54 | `[41,46)` |

Dokument nie określa ciągłych granic ani zaokrąglania wieku. Przedziały
aplikacji jawnie odczytują etykiety jako ukończone lata; nie dowodzą
obserwacji osoby w wieku 45,999 roku. Cały możliwy wiek musi należeć
do jednej grupy: `[25,26)` kwalifikuje się, `[25,26]` ani przedział
przecinający granicę nie. Dokładnie 46 lat nie otrzymuje odniesienia.
Nie ma interpolacji między grupami, wyboru mediany ze środka przedziału
ani zmiany pediatrycznego Jopling przed 18 lat.

Źródło obejmuje próbki pozornie zdrowych, nieciężarnych kobiet z pięciu
ośrodków, z regularnymi cyklami 21–35 dni, oboma jajnikami i udowodnioną
płodnością. Suma N wynosi 620 dla każdej tabeli materiału, nie 1240
niezależnych kobiet. Dnia cyklu i stosowania antykoncepcji dla tej
populacji nie określono. Nie przenosimy kryteriów odrębnej kohorty
klinicznej N=164 (np. dzień 2–4, wykluczenie PCOS) do tych median.

Znane metoda i materiał muszą odpowiadać Access AMH/Access 2 i surowicy.
Nie uznajemy DxI, Elecsys, Gen II ani osocza za zgodne na podstawie
jednostki. Nieznane metoda, materiał, cykl lub płodność dopuszczają
edukacyjne zestawienie, bez potwierdzania kwalifikacji pacjentki i bez
nowych pól. Znana ciąża lub stan po menopauzie blokują wyłącznie te
nowe profile; dotychczasowa blokada GnRHa oraz pozostałe bramki silnika
pozostają. Nie dodajemy z FDA nowego progu LOD/LOQ dla wyniku pacjentki.

Kanoniczne są wydrukowane mediany pmol/L. Globalne przeliczenie
`1 pmol/L = 0,1401 ng/mL` pozostaje bez zmian; oddzielnie zachowane
zaokrąglone liczby ng/mL dokumentują źródło, nie drugi wariant obliczeń.
F28, wynik 1 ng/mL → mediana grupy 26–30: 27,27 pmol/L
(3,820527 ng/mL, podpis ≈3,82), bez werdyktu „poniżej normy”.

Jasny znacznik „Mediana grupy” zachowuje liczbę surowicy także poza
poglądową linią, której dorosłe kotwice pochodzą z osocza. Oba znaczniki
używają istniejącej skali i wybranej jednostki; źródłowe ograniczenia
trafiają do krótkiej notki i rozwijanych szczegółów. Linie, skale,
porównania płci, normy Mayo, historia i inne profile nie zmieniają się.
Nie wyznaczamy płodności, PCOS, rezerwy jajnikowej, odpowiedzi na IVF
ani wieku menopauzy na podstawie odległości od mediany. Xu 2026 pozostaje
nieaktywne; weryfikacja techniczna nie oznacza walidacji klinicznej.

Pochodzenie i mediany z obu tabel:
[dane FDA](evidence/patient-point/fda2017-female-amh-group-medians.json);
reguły zastosowania: [polityka dorosłych kobiet](female-adult-amh-reference-policy.json).

### INSL3: ilustracja bez liczbowego odniesienia — 11 października 2026

Mały wzrost do około 27. dnia korzysta jakościowo z modelowanej średniej
trajektorii podłużnej Busch, ryc. 2, znormalizowanej do własnego
niemowlęcego maksimum hormonu. Mediana GAMLSS z ryc. 3 jest inną
statystyką tej samej kohorty. Żadna z tych figur nie kalibruje wysokości
rysunku 0,14 względem dorosłej 0,87. Nie wolno użyć tych współrzędnych
jako mianownika wyniku pacjenta lub przesunąć wyniku na przerywaną linię.

Odczyty ryc. 3 w µg/L są już po transformacji odwrotnej. Busch podaje
LOD 0,03; jednostka µg/mL w Methods jest niespójna z ryciną i tabelą S1.
LOQ 0,15 µg/L pochodzi z cytowanego opisu metody Albrethsen, nie z jawnego
progu INSL3 w artykule niemowlęcym. Te ograniczenia, imputacja wyników
poniżej LOD jako LOD/2 i brak współczynników autora ograniczają dokładność
liczbowego odniesienia. Mediana modelu poniżej LOQ nie dowodzi braku
biologicznej fali ani automatycznej nieważności estymacji populacyjnej.

Połączenia płodowe, dziecięce i dorosłe oraz wygaszony koniec 80–90 lat
nie uzupełniają brakujących profili. Nie zmieniono norm laboratoryjnych,
werdyktów ani liczbowych odniesień innych hormonów. DOI, populacje,
rodzaje statystyk i dostępność źródeł podaje
[audyt INSL3](evidence/insl3-lifespan-display-audit-2026-10-11.json).

### Dorosłe LH/FSH i stała ilustracja — 11 października 2026

18 nowych profili edukacyjnych uzupełnia istniejące źródła; nie zmienia
ich liczb ani laboratoryjnych norm. Wszystkie stężenia poniżej mają
jednostkę IU/L. Pełne pochodzenie, ograniczenia i konkretne tabele:
[ALGORITHMS.md](../ALGORITHMS.md#hormone-lh-fsh-stable-curves--stałe-krzywe-i-dorosłe-odniesienia-2026-10-11).

| Okno aplikacji | Źródło i statystyka | LH | FSH |
| --- | --- | ---: | ---: |
| 18–<25 | FAMe/Laurentino 2020, średnia grupy, Architect i1000 | 3,0 | 3,0 |
| 25–<30 | FINRISK/Perheentupa 2013, mediana grupy, DELFIA | 3,74 | 3,43 |
| 30–<40 | jw. | 3,76 | 4,00 |
| 40–<50 | jw. | 3,91 | 4,56 |
| 50–<60 | jw. | 4,53 | 5,64 |
| 60–<70 | jw. | 4,73 | 5,92 |
| 70–<75 | jw. | 5,57 | 6,43 |
| 75–<80 | LH: HIMS/Yeap 2007, mediana grupy, Immulite 2000; FSH: Ljubicic 2020, przybliżona mediana modelu, AutoDELFIA | 4,44 | odczyt modelu |
| 80–<85 | HIMS/Yeap 2007, mediana grupy | 5,14 | tylko dokładnie 80: ≈8,4 |
| 85–89 włącznie | HIMS/Yeap 2007, mediana grupy | 5,22 | brak |

FSH Ljubicic obejmuje 75–80 włącznie, z sześcioma odczytami rocznymi;
przy 75 latach ≈7,8 IU/L. To próbkowanie modelu pomiędzy obserwowanymi
kohortami, nie sześć empirycznych median roczników. Tolerancja odczytu
około 8,5% nie jest przedziałem ufności. FAMe ma niejednoznaczną górną
granicę najmłodszej grupy 24/25; okno 18–<25 jest zachowawczą polityką,
nie ponownie obliczoną średnią. FINRISK łączy lata badania i kohorty.
HIMS nie stanowi wyłącznie populacji zdrowej. Średnia nie jest medianą,
a różnice między metodami nie są kalibracją próbki użytkownika.

Grupy mają stałe wartości, bez uśredniania między publikacjami. Wiek
przecinający granicę profili nie kwalifikuje do jednego odniesienia.
Luka >16–<18, FSH >80 i LH >89 pozostają bez liczbowego punktu.
Niemowlęce oraz pediatryczne źródła, w tym warunek G1 dla Zec, zachowują
dotychczasowe ograniczenia.

`lh-fsh-display-policy.json` definiuje osobną, ciągłą ilustrację i stałą
skalę: LH 5,57 × 1,25, FSH 8,4178 × 1,25. Nie zależą od pacjenta ani
wyniku. Most FSH 12–25 lat nie przechodzi przez wszystkie mediany Madsen;
jasny znacznik odniesienia zachowuje źródłową medianę i może leżeć poza
linią; czerwony punkt pokazuje wpisany wynik.
Łuk dorosłości sprawdzono także w pośrednich latach, aby nie przenosił
poziomu starszych mężczyzn na wiek średni. Odcinek płodowy pozostaje
schematem; zakończenie poza źródłem nie dostarcza liczbowego odniesienia.
Zbliżenia pokazują tę samą krzywą. Porównanie płci pozostaje odrębne.

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

Decyzja właściciela z 11 października 2026 zastępuje poprzednie połączenia
150 dni–4, 5–6 i 16–25 lat oraz dorosły model Kelsey w tym wykresie.
Zatwierdzona makieta usuwa sztuczny spadek przy 5–6 latach i kolanko
w dorosłości. Reguły dla przyszłych prac utrwala
[HORMONE_CURVE_AGENT_GUIDE.md](../HORMONE_CURVE_AGENT_GUIDE.md).

Wpisanie, zmiana lub wyczyszczenie wyniku, wieku, metody czy donoszenia
nie zmienia krzywej ani skali. Zbliżenia korzystają z tego samego przebiegu
w kanonicznych współrzędnych całego życia; ponowne próbkowanie daje
przybliżenie geometryczne, nie nowy model. Nie aktywujemy wolnego T.
Dobór liczbowego odniesienia nadal jest osobny od geometrii: Busch
w dotychczasowym oknie z bramką jakości, Kelsey 3–<6, Madsen 6–<18,
a od 18 do 86 lat siedem osobnych średnich grup Walravens.
Luka 1–<3 oraz wiek >86 nie otrzymują punktu z ilustracyjnego połączenia.

Polityka `testosterone-display-policy.json`, eksportowana jako
`testosteroneDisplayPolicy`, kieruje
`VildaHormoneLifespanDisplay.buildMaleTestosterone`. Wspólna, ciągła
ścieżka zachowuje styczne (C1), nieujemność i jedną stałą skalę.

- **Niemowlęctwo i dzieciństwo:** odczyt Busch pozostaje w rysunku do
  212. dnia. Dalej jedno monotoniczne zejście prowadzi do niskiej wartości
  Madsen w wieku 6 lat. Węzły Kelsey 3–5 lat nie wymuszają geometrii,
  dzięki czemu różnica między badaniami nie wygląda jak osobny spadek
  hormonalny. Źródłowe mediany Kelsey 3–<6 pozostają dostępne dla punktu.
- **Pokwitanie i młoda dorosłość:** Madsen prowadzi ku źródłowej wartości
  w wieku 18 lat, następnie poglądowe połączenie 18–23,8 lat dochodzi do
  średniej młodych dorosłych 20,7 nmol/L. Nie tworzy sztucznego szczytu
  17–18 lat przewyższającego młodą dorosłość. Mediany Madsen i średnia
  Walravens są różnymi statystykami i nie tworzą wspólnego modelu p50.
- **23,8–82,1 roku:** jeden sześcienny łuk Béziera w kanonicznym X,
  od 20,7 do 15,9 nmol/L; poziome styczne końcowe, ułamki uchwytów
  0,20/0,50 i 601 próbek. Linia łagodnie maleje, nie musi przechodzić
  przez każdą średnią grupową, nie odtwarza falowania 16,9→17,1→17,0
  ani kolanka około czterdziestki. Jest ilustracją, nie estymacją
  stężenia w każdym roku ani osobniczego tempa starzenia.
- **82,1–90 lat:** płaskie zakończenie na poziomie 15,9; po 86 latach
  linia wygasa. Obserwowany zakres źródła kończy się na 86 latach.
  Poglądowy ogon nie dostarcza wartości pacjenta.
- **Przed urodzeniem:** dotychczasowe kotwice pozostają ilustracją,
  nie ilościowym profilem płodowym lub pępowinowym.

Stały dzielnik skali 18,051151264084126 nmol/L i zapas 1,25 zachowują
wysokość osi 22,563939080105158 nmol/L. Dzielnik pochodzi z poprzedniej
polityki; nie jest już maksimum danych dorosłych. Punkt pacjenta i znacznik
odniesienia używają tej samej funkcji. Wynik ponad osią jest strzałką
z rzeczywistą liczbą; równość daje punkt. Nieprawidłowy, pusty lub
cenzurowany zapis nie dostarcza zastępczej liczby.

Dorosły znacznik oznacza **średnią grupy wieku**, nie medianę dokładnego
wieku. Przykładowo M/44 lata/12 nmol/L otrzymuje źródłową średnią grupy
40–49 lat równą 18,1; M/82 lata/12 otrzymuje średnią grupy 80+ równą
15,9. Jasny znacznik może leżeć poza łukiem. Nigdy nie podstawiamy wartości
krzywej do podpisu źródłowej średniej ani nie przesuwamy punktu na linię.
Pediatryczne p50 pozostają: 6 lat → 0,02393726986868612; 16 lat →
12,96588173768215; 17,9 roku → 17,87811097018994 nmol/L. Dokładnie
18 lat otrzymuje teraz średnią grupy 18–29 równą 20,7. Ta zmiana
odniesienia nie oznacza fizjologicznego skoku w dniu osiemnastych urodzin.

**Wpływ:** zmienia się dorosłe odniesienie edukacyjne i geometria.
Źródłowe dane pediatryczne, jednostki, silniki norm, laboratoryjne werdykty,
historia, zapis i synchronizacja pozostają bez zmian. Brak punktu nie
blokuje osobnej interpretacji laboratoryjnej. Nowa linia nie jest
zwalidowaną krzywą jednej populacji.

## Transformacje, źródła i granice

Madsen: parametry dotyczą `X = ln(stężenie w jednostce SI × 1e6)`.
Stąd dla `z=0` zachodzi `X=M`, czyli stężenie `exp(M)/1e6`. Sama wartość
M nie jest medianą w IU/L lub nmol/L. Przykłady arkusza K36/K37 potwierdzają logarytm;
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

**Wybór dziecięcego źródła testosteronu po audycie:** bezpośrednie
pediatryczne oznaczenia LC-MS/MS [Madsen 2022](https://doi.org/10.1210/clinem/dgac155)
zastępują p50 Kelsey w wieku 6–<18 lat. Pełne źródło to *Reference Curves
for Pediatric Endocrinology: Leveraging Biomarker Z-Scores for Clinical
Classifications*, JCEM 107(7):2004–2015, PMID 35299255, oraz suplement
LMS v1 z 9 grudnia 2021. Model T korzysta z BGS2 i FitFutures, a nie
wyłącznie BGS2 jak LH/FSH. Dla 6 lat mediana wynosi około 0,02394,
dla 12 lat 1,49773, dla 16 lat 12,96588 nmol/L. Wartości z oryginalnych
komórek M i transformacja są sprawdzalne bez digitalizacji wykresu.
Kelsey 6 lat daje około 0,323 nmol/L; niezależna kontrola nie wykazała
błędu jednostki. Preferencja dla Madsen wynika z bezpośrednich pomiarów
LC-MS/MS w docelowym wieku, nie z dopasowania krzywej do konkretnego wyniku.

LLOQ Madsen wynosi 0,02 nmol/L; p50 dla 6 lat jest wyższe, choć bliskie
tej granicy. Artykuł i suplementy nie wyjaśniają, jak potraktowano
pojedyncze obserwacje poniżej LLOQ. Publiczny przykładowy kod LMS dla SHBG
nie wyjaśnia przygotowania danych T. Jest to ograniczenie, nie dowód
błędu opublikowanego p50 ani podstawa do arbitralnego wyłączenia sześciolatków.
CVA 4% opisano dla stężeń 1,5–37 nmol/L; nie przypisujemy tej precyzji
medianie około 0,024. Nie kopiujemy SDS ani zakresów z błędnej formuły
przykładowej L37. W aplikacji p50 pozostaje przybliżonym odniesieniem
edukacyjnym, bez nowych progów diagnostycznych.

To przekrojowe norweskie kohorty o zróżnicowanym BMI, głównie pochodzenia
europejskiego, z pobraniami 08:00–14:00. Model wieku nie jest skorygowany
do porannego pobrania i miesza stadia pokwitania; nie nazywamy go normą
G1–G5. Nie wymagamy nowego pola Tannera lub pory pobrania. Table 1 podaje
liczebności kohort, nie jednoznaczne N testosteronowego dopasowania LMS.
[Supplemental Table 2 v4](https://doi.org/10.6084/m9.figshare.17153369.v4),
arkusz `Ark2`, wiersze 64–67, podaje łącznie 835 obserwacji w grupach T,
lecz stosuje inne usuwanie wartości odstających; nie przenosimy tej liczby
do LMS ani nie nazywamy 414+491 dokładnym N modelu testosteronu.

Granice 6 i 18 lat są jawną polityką doboru publikacji. Przy dokładnie
18 latach wybierana jest średnia Walravens 18–29 (20,7 nmol/L); węzeł Madsen
18 lat/18,05115 domyka interpolację dla 17.x i pozostaje składnikiem
stałej skali, bez obowiązku przejścia linii przez ten punkt.
Różnica źródeł nie jest fizjologicznym skokiem stężenia. Niepewny wiek
przecinający granicę źródeł nie daje jednej arbitralnej mediany.
Kelsey 3–<6 zachowano ostrożnie bez ekstrapolowania Madsen poniżej 6;
luka 1–<3 lat nadal nie ma dokładnej mediany pacjenta.

Audyt modelu Kelsey potwierdził zgodność 1020 wierszy Table S1 i wszystkich
86 p50 skorygowanej tabeli Kelsey. Nie zmieniamy plateau na spadek wyłącznie
dla wyglądu. Nowsza [metaanaliza Marriott/Yeap 2023](https://doi.org/10.7326/M23-0342)
opisuje względną stabilność średniego całkowitego T przed 70 lat i spadek
później, zależny również od zdrowia i BMI. Są to skorygowane różnice średnich,
nie bezwzględne mediany do podmiany. Kelsey pozostaje dowodem i aktywnym
modelem 3–<6 lat, a nie uniwersalną trajektorią zdrowego mężczyzny.
Od 11 października 2026 dorosłe odniesienie edukacyjne korzysta ze średnich
Walravens. Nie zastępujemy całkowitego T publikacjami dotyczącymi wolnego T
ani nie ekstrapolujemy punktu poza 86 lat.

Walravens: tabela 1 obejmuje siedem grup o liczebnościach
141/252/207/150/177/167/100 i średnich wieku
23,8/34,3/43,5/55,0/65,1/74,7/82,1 roku. Wartości T są średnimi całych
grup, nie estymacją dla tych dokładnych lat. Źródło łączy różne kohorty;
nie jest podłużną historią starzenia jednej osoby. Nie przenosimy do
tego porównania populacji BMI <30 wybranej osobno do zakresów wolnego T.
Przedziały wyboru wynoszą [18,30), [30,40), [40,50), [50,60), [60,70),
[70,80) i [80,86]. Niepewny wiek obejmujący różne grupy nie dostarcza
jednej arbitralnej średniej. Drobna różnica 16,9→17,1 między grupami
50–59 i 60–69 nie jest dowodem fizjologicznego odbicia; nie wymusza
zagięcia poglądowej linii. Dokładne opublikowane średnie pozostają
liczbowym odniesieniem, mimo uproszczenia geometrii.

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
do końca aktywnego okresu niemowlęcego. INSL3 nie jest aktywnym kalkulatorem;
jego odrębne ograniczenia omówiono wyżej. Heurystyka rozdzielczości grafiki
nie jest dowodem nieobecności wczesnej fali fizjologicznej.

Wang: źródło oznacza grupy wieku liczbami 0–14, a na ryc. 1 ich środki
znajdują się w przybliżeniu przy N+0,5 roku. Nie opisuje dokładnej reguły
zaokrąglania wieku. Dlatego `[N,N+1)` jest wyłącznie jawną konwencją
doboru rocznej grupy w edukacyjnej prezentacji, nie opublikowaną definicją
granic. Dotyczy to również grupy 14: konwencja `[14,15)` nie dowodzi,
że autorzy obserwowali wszystkie dokładne wartości wieku aż do 15 lat.
Każda zgodna grupa ma osobny profil `group-median`, stałą wartość i własną
liczebność. Dwa jednakowe węzły kodują stałą wartość odniesienia grupy;
nie interpolujemy liczbowej mediany między grupami, Busch i Tehrani.
Osobna linia edukacyjna AMH może łączyć te okresy według polityki opisanej
niżej. Nie imputujemy konfliktowej grupy 12 z sąsiadów.
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
wyłącznie. Trzy aktywne profile przechowują stałe mediany grupowe;
nie interpolujemy między nimi ani nie zamieniamy ich w ciągły przebieg FSH.
Okno aplikacji chłopców 1–<6 lat jest wyłącznie polityką zachowania
dotychczasowego Madsen od 6 lat. Etykieta porównania i liczebność nadal
opisują źródłową grupę 1–<8 lat, a nie nieistniejącą podgrupę N=303 w wieku
1–<6 lat. U dziewczynek od 16.10.2026 używamy grupy 4–<8 tylko w oknie
4–<6, zachowując źródłową etykietę, medianę 1,07 i N=156. Grupa 8–<11
pozostaje w dowodach; od 6 lat obowiązuje model Madsen niezależnie od Th.
Granica 4 lat należy do kolejnej grupy, a 6 lat do Madsen;
niepewny wiek obejmujący dwie grupy lub dwa źródła nie daje jednego punktu.

Kohorta Zec obejmowała wyłącznie Tanner 1; odrzucono 14 dzieci w stadium 2.
Profil ma `requiredGonadalStage: 1`. Adapter przekazuje tylko aktualną,
jednoznacznie powiązaną z bieżącym kontekstem obserwację gonadalną:
G1 u chłopca lub Th1 u dziewczynki. Nie ustalamy stadium z wieku, wyniku,
samego numeru Tannera, P ani Ax. Nie używamy obserwacji historycznej.
Brak takiego stadium lub znane stadium 2–5 nie dopasowuje punktu Zec;
nie dodaje nowego pola i nie blokuje niezależnej oceny laboratoryjnej.
W porównaniu płci nie przenosimy stadium pacjenta na drugą płeć:
Zec nie jest źródłem tego porównania. LH/FSH w wieku 6–16 lat
korzystają z osobno zatwierdzonych median Madsen obu płci.

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

### Stała linia AMH i niezależne źródłowe odniesienie

Makieta zatwierdzona przez właściciela 11 października 2026 zastępuje
zależną od wyniku prezentację męskiego AMH jedną linią edukacyjną.
Polityka `amh-display-policy.json`, eksport `amhDisplayPolicy` i funkcja
`VildaHormoneLifespanDisplay.buildMaleAmh` wyznaczają jej geometrię.
15 pierwotnych profili liczbowych — Busch, 13 grup Wang i Tehrani —
pozostaje bez zmian. Trzy dodatkowe profile z 13.10.2026 służą wyłącznie
znacznikom, nie budowaniu linii. Zbliżenia próbkują tę samą kanoniczną krzywą.

Dzielnik 1335,592934 pmol/L oraz zapas 1,25 nie zależą od wyniku ani
wieku pacjenta. Źródłowy odczyt mediany Busch zostaje zachowany od 7.
do 250. dnia, obejmując szerokie maksimum około 175. dnia / 187 ng/mL.
Łuki do 9,5, 14,5, 30 i 70 lat wygładzają dalszy spadek. Wielkości
dorosłych 4–7 ng/mL pozostają odpowiednio niskie. Prenatalny schemat
oraz dojście do 7. dnia nie są nowymi stężeniami odniesienia. Ogon po
70 latach wygasa na ostatniej wysokości, bez dowodu biologicznego plateau.

Kontrola kształtu przy środku grupy wieku nie zmienia jej statystyki.
Przy 5,5 roku Wang daje 99,18 ng/mL, podczas gdy linia odpowiada około
95,25; przy 11,5 roku odpowiednio 20,70 i 25,01. Punkt wyniku równego
medianie ma pokrywać się ze znacznikiem źródła, nawet jeśli linia leży
obok. Nie wolno przyciągać znacznika do krzywej. Wang nie określa stadium
Tannera. Przeliczenie jednostek nie harmonizuje Access 2 i zmodyfikowanego
Gen II ani odmiennych populacji.

Przed 7. dniem, w wieku 18–<20 i po 70 latach nadal brak źródłowego
odniesienia. Tak samo pozostaje bramka donoszenia Busch.
W tych przypadkach obecność ilustracji nie tworzy punktu pacjenta z jej
wysokości. Odrębne rozszerzenie z 13.10.2026 korzysta z Jopling
i Benderradji w wymienionych wcześniej lukach; Chong pozostaje
poza aktywnymi profilami. Przebieg porównania płci
oraz laboratoryjne normy mają odrębne kontrakty.

### Wspólne osie LH/FSH i żeńskie odniesienie tylko w porównaniu

Zatwierdzona 12 października 2026 polityka porównania LH/FSH stosuje
stałe mediany obu płci: liniową oś 0–6 IU/L w minipuberty i 0–8 IU/L
w pokwitaniu. Dane i normy zwykłych widoków pozostają odrębne.
`buildGonadotropinComparison` przekazuje istniejącemu silnikowi tylko
profile właściwe dla analitu i okresu; wynik kwalifikuje własna płeć.
Nie kopiujemy stadium, metody lub leczenia na drugą populację.

Minipuberty zachowuje Busch/Ljubicic i dotychczasowe bramki. Wspólne
linie zaczynają się od 0,02 roku; własne odniesienie chłopca już
od 7. dnia. Poniżej żeńskiej granicy nie ekstrapolujemy mediany.
Dokładnie 1 rok jest poza tym porównaniem dla obu płci; nie zmienia
to globalnych granic źródeł. Po 243. dniu LH chłopców pozostaje
bez dokładnego punktu według istniejącej reguły wiarygodności
odczytu, niezależnie od widocznego ogona. Dziewczynka tego samego
wieku zachowuje własną kwalifikację.

Pokwitanie obejmuje 6–16 lat obu płci: Madsen 2022, surowica
IMMULITE 2000 XPi, po 11 rocznych median na hormon i płeć.
`gonadotropin-comparison-reference-data.json` dodaje tylko
`madsen2022-female-lh-sex-comparison` i
`madsen2022-female-fsh-sex-comparison`, poza globalnym `patientPointData`.
Nie używa Zec jako zamiennika i nie wymaga Tannera dla modelu wieku.
Cały przedział niepewnego wieku musi mieścić się w profilu: dokładnie
16 lat jest opublikowanym brzegiem, lecz [16,17) go przekracza.

Kontekst znanej niezgodnej metody, materiału, leczenia, wyniku
cenzurowanego i donoszenia zachowuje działanie dotychczasowego silnika.
Linie pozostają widoczne bez kwalifikowanego punktu i nie zależą od
wysokości wyniku. Zero leży na osi, ponad nią jest strzałka z liczbą.
Nie nadajemy nowych diagnoz, norm, percentyli lub SDS. Względne średnie
zwykłej żeńskiej minipuberty nie służą do ustawiania tego punktu.
Źródła, hashe i przypadki:
[audyt LH/FSH](evidence/lh-fsh-sex-comparison-audit-2026-10-12.json).

### Wspólna oś AMH w porównaniu płci podczas minipuberty

Decyzja właściciela z 11 października 2026 dotyczy wyłącznie tego
porównania. `buildAmhInfantComparison(data, referenceEngine)` korzysta
z `amh-comparison-policy.json` i stałej pary istniejących profili
Busch/Ljubicic. Linie median GAMLSS obejmują wspólnie 0,02–<1 roku.
Nie są przełączane na schemat przy braku wyniku ani na grupę Wang
przy pierwszych urodzinach. Źródłowych profili i ich domen nie zmieniono.

Obie linie, czerwony wynik i jasny znacznik mediany używają osi log10
0,1–1000 ng/mL; 1 pmol/L = 0,1401 ng/mL. Równa wysokość oznacza
równe stężenie, a kolejne poziomy 0,1 / 1 / 10 / 100 / 1000 są
dziesięciokrotnymi zmianami. Dane zdrowych donoszonych niemowląt
oznaczano metodą Access 2. Mediana chłopców jest przybliżonym odczytem
ryciny, dziewczynek pochodzi z tabeli suplementu. Nie są to normy.

`evaluate` nadal kwalifikuje własny punkt i źródłowy znacznik pacjenta,
z dotychczasowym uwzględnieniem całego przedziału wieku, donoszenia,
materiału, metody i jednostki. Chłopiec od 7. do <7,305 dnia zachowuje
własne odniesienie Busch, choć wspólne linie zaczynają się później.
Cały przedział wieku musi dodatkowo mieścić się przed 1. rokiem:
`[11/12, 1)` może otrzymać punkt, `[11/12, 1]` i przedział przekraczający
1 rok nie mogą. Górna granica 1 jest dopuszczalna tylko jako wyłączony
koniec niepustego przedziału (`ageUpperInclusive: false`). Dokładnie
1 rok nie otrzymuje punktu w tym porównaniu żadnej płci; to ograniczenie
widoku, nie skrócenie żeńskiego profilu Ljubicic ani usunięcie Wang
z innych widoków. Kontrolę granicy uzupełniono po HM-3, 12 października
2026, bez zmiany źródeł, krzywych lub norm. Wcześniactwo i nieznane donoszenie
wykluczają punkt niemowlęcy, lecz nie zmieniają populacyjnych krzywych.

Liczbowy wynik poniżej osi, w tym zero, ma strzałkę w dół z prawdziwą
wartością; ponad osią — strzałkę w górę. Nie ma dokładnej kropki
z nierówności ani dodatniej wartości zastępczej dla log(0). Tolerancja
maszynowa przy granicy osi nie zmienia wyniku. Granice osi nie są LOD
ani normą: LOD AMH w obu publikacjach wynosi 0,14 pmol/L, osobnego
LOQ AMH nie podano. Zapis źródeł i odtworzenia:
[audyt porównania AMH](evidence/amh-infant-comparison-audit-2026-10-11.json).

### Wspólna oś inhibiny B i odniesienie dziewcząt tylko w porównaniu

Makiety minipuberty i pokwitania zaakceptowano 11 października 2026.
`buildInhibinComparison(data, referenceEngine, period)` odczytuje
`inhibinComparisonPolicy`. Oba okresy zachowują stałą liniową oś
0–400 pg/mL; zero jest punktem na osi, a wynik ponad 400 strzałką
z prawdziwą wartością. 1 ng/L = 1 pg/mL; bez normalizacji osobno dla płci.

Minipuberty używa niezmienionych profili Busch/Ljubicic. Wspólne linie
mają zakres 0,02–<1 roku; własne odniesienie chłopca zaczyna się od
7. dnia. Dokładnie 1 rok nie otrzymuje punktu tego porównania,
bez przełączenia na Kelsey i bez skracania źródłowej domeny dziewcząt
w innych widokach. Dotychczasowe warunki donoszenia, metody i materiału
zachowują znaczenie. Same linie nie kwalifikują wcześniaka.

Pokwitanie korzysta z męskiego Borelli i nowego, zaakceptowanego
odniesienia `borelli2025-female-inhb-puberty-comparison` tylko w wieku
8–20 lat włącznie. Żeński profil przechowuje
`inhibin-comparison-reference-data.json`, eksportowany jako
`inhibinComparisonReferenceData`, poza globalnym `patientPointData`.
Ten historyczny profil nie włączał punktu w zwykłych widokach.
Rozszerzenie z 13 października udostępnia te same mediany także tam,
po uzupełnieniu 5,6–20, a od 14 października 5,6–47. Granica 8 lat dotyczy
nadal wyłącznie tego widoku porównania pokwitania.
Kwalifikacja używa istniejącego `evaluate` z danymi tego porównania
i dotyczy wyłącznie własnej płci; metoda drugiej płci nie blokuje
własnego zgodnego profilu.

Żeńska mediana jest przybliżonym odczytem ryc. 1 Borelli-Kjær 2025,
surowica Gen II, bez odzyskanych parametrów L/S. Wszystkie 24 węzły
5,6–47 lat pozostają w PCHIP, a granice kwalifikacji tego porównania
nadal wynoszą 8–20. Obcięcie węzłów do widoku zmieniłoby styczne i część wartości.
Odczyt około ±2 pg/mL nie jest przedziałem ufności ani normą.
Męska krzywa łączy dwie metody (Oxford i Gen II); nie stosujemy
między nimi współczynnika 1,28. Brak standaryzacji cyklu i wpływ
antykoncepcji pozostają ograniczeniami, nie nowym formularzem lub
osobnymi dostosowanymi normami. Znane przeciwwskazania i niezgodna
metoda/materiał nadal ograniczają punkt.

Wiek nie ustala stadium Tannera. Porównanie nie wyznacza SDS,
percentyli, diagnozy ani prawidłowości wyniku. Osobne panele obserwacji
Kuiri-Hänninen, Crofton i Baccarelli, normy oraz zapis pozostają bez zmian.
Globalny profil z 13 października jest odrębnym rozszerzeniem. Źródła i odtworzenie:
[audyt inhibiny B](evidence/inhibin-comparison-audit-2026-10-11.json).

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
| Chłopiec 12 lat, LH 2 IU/L | Madsen p50=0,6775625214085037 IU/L; wynik powyżej znacznika odniesienia, bez nowego werdyktu „poza normą”. |
| Chłopiec 12 lat, FSH 2,01486005633355 IU/L | Wynik równy źródłowemu znacznikowi Madsen; zgodność z ilustracją nie jest warunkiem poprawności odniesienia. |
| Chłopiec 3 lata, aktualne G1, FSH 0,48 IU/L | Punkt na medianie Zec; etykieta pełnej grupy źródłowej 1–<8 lat, N=303, a nie mediana dokładnie dla 3 lat. |
| Chłopiec 3 lata, aktualne G2 lub brak typowanej obserwacji, FSH 0,48 IU/L | Brak punktu Zec; nie zakładamy G1 z wieku. Dostępna osobna ocena laboratoryjna pozostaje. |
| Chłopiec dokładnie 6 lat, FSH | Profil Madsen; nie przedłużamy okna Zec ani nie wymagamy G1 od profilu Madsen. |
| Dziewczynka 2 lata/aktualne Th1/FSH 2,57; 5 lat/Th1/1,07 IU/L | Punkt na medianie odpowiedniej całej grupy Zec: 1–<4, 4–<8 lat. |
| Dziewczynka 9 lat, FSH 2 IU/L, brak Th / Th1 / Th2 | Madsen 1,964770298470689 IU/L w zwykłym widoku i porównaniu; uzupełnienie Th nie zmienia mediany wieku. |
| Dziewczynka dokładnie 1 rok, aktualne Th1, FSH 2,57 IU/L | Zec; profil niemowlęcy FSH kończy się przed pierwszymi urodzinami. Inne żeńskie profile Ljubicic zachowują dotychczasową granicę. |
| Dziewczynka 11 lat/Th1, FSH | Model wieku Madsen, bez użycia kohorty Zec powyżej okna aplikacji. |
| Dziewczynka 5 lat/Th2, FSH | Brak punktu Zec; bez użycia kohorty przedpokwitaniowej w pokwitaniu. |
| Dziewczynka Th1, możliwy wiek 3,99–4,01 roku, FSH | Brak jednoznacznego punktu; nie wybieramy jednej z median pośrodku niepewnego wieku. |
| Donoszony chłopiec, dokładnie 90 dni, LH 2,05589 IU/L | Punkt na przybliżonej medianie Busch; wartość ma dokładność odczytu ryciny, nie sześciu klinicznych miejsc dziesiętnych. |
| Donoszony chłopiec, 90 dni, inhibina B 300 pg/mL | Busch około 294,293798 pg/mL; punkt nieznacznie ponad linią. |
| Chłopiec dokładnie 6 lat, testosteron 0,02393726986868612 nmol/L | Madsen: punkt równy p50, bez rozpoznania i bez sztucznego podniesienia mediany do innej wartości. |
| Chłopiec dokładnie 12 lat, testosteron 1,4977255724595988 nmol/L | Punkt i znacznik źródłowej mediany Madsen są zgodne; brak stadium nie blokuje modelu wieku. |
| Chłopiec dokładnie 16 lat, testosteron 12,96588173768215 nmol/L | Nadal Madsen T; nie stosujemy górnej granicy 16 lat właściwej dla profili LH/FSH. |
| Chłopiec dokładnie 17,9 roku, testosteron 17,87811097018994 nmol/L | Niezmienione źródłowe p50 Madsen; geometrię i odniesienie oblicza się oddzielnie. |
| Mężczyzna dokładnie 18 lat, testosteron | Średnia grupy Walravens 18–29: 20,7 nmol/L; nie mediana Madsen ani Kelsey. Znacznik nie musi leżeć na połączeniu graficznym. |
| Chłopiec, możliwy wiek 5,99–6,01 lub 17,99–18,01 lat, testosteron | Brak jednoznacznego punktu między źródłami; wiek pośrodku przedziału nie rozstrzyga publikacji. |
| Mężczyzna 44 lata, testosteron 18,1 nmol/L | Punkt zgodny ze znacznikiem opublikowanej średniej grupy 40–49, nawet gdy łuk jest na innej wysokości. |
| Mężczyzna dokładnie 44 lata, testosteron: pusty → 12 → 100 → wyczyszczenie | Identyczna krzywa i skala; 12 poniżej średniej 18,1; 100 ma strzałkę z rzeczywistą liczbą, bez przyciętej kropki. |
| Mężczyzna 82 lata, testosteron 15,9 nmol/L | Punkt równy średniej grupy 80+, nie medianie dokładnego wieku. |
| Mężczyzna dokładnie 86 lat / powyżej 86 lat, testosteron | Przy 86 latach średnia grupy 80+ wynosi 15,9; powyżej 86 brak liczbowego odniesienia mimo wygaszonego ogona linii. |
| Mężczyzna, możliwy wiek 39,99–40,01 lat, testosteron | Brak jednej średniej między grupami; nie uśredniamy 20,0 i 18,1. |
| Chłopiec 2 lata, testosteron 0,1 nmol/L | Stała linia poglądowa, bez źródłowej mediany i bez punktu wyprowadzonego z mostu. |
| Donoszony chłopiec 180 dni, testosteron równy medianie Busch | Punkt równy źródłowemu odniesieniu; niezmienione dane i bramka jakości Busch. |
| Chłopiec 3 lata, inhibina B 107 pg/mL | Punkt na węźle p50 Kelsey 2016, bez stosowania krzywej niemowlęcej do jego odniesienia. |
| Mężczyzna dokładnie 44 lata, inhibina B 88 pg/mL; przed wpisaniem, po wpisaniu i po wyczyszczeniu | Identyczna ścieżka i skala; wynik poniżej źródłowego odniesienia Borelli około 162,084705882 pg/mL. |
| Ten sam kontekst, inhibina B 1000 pg/mL | Ta sama ścieżka i skala; strzałka w górę z 1000 pg/mL, bez kropki na górnej granicy. |
| Chłopiec dokładnie 1 rok, inhibina B 223 pg/mL | Punkt i znacznik mediany Kelsey są zgodne; linia edukacyjna w pasie wygładzenia może przebiegać inaczej. |
| Chłopiec 5 lat i 6 miesięcy, AMH 99,18 ng/mL | Punkt zgodny ze znacznikiem mediany grupy Wang 5–<6 lat, N=134, choć linia edukacyjna odpowiada około 95,25; to nie p50 dokładnego wieku. |
| Chłopiec 11 lat i 6 miesięcy, AMH 20,70 ng/mL | Punkt zgodny ze znacznikiem mediany grupy 11–<12, niezależnie od linii około 25,01; profil kończy się przed 12. urodzinami. |
| Chłopiec 12 lat i 6 miesięcy, AMH 7 ng/mL | Brak punktu Wang: mediana grupy 12 jest sprzeczna między tabelami; brak interpolacji przez lukę. |
| Chłopiec 14 lat i 6 miesięcy, AMH 8,23 ng/mL | Punkt na medianie grupy oznaczonej 14, według jawnej konwencji `[14,15)`; brak ekstrapolacji po 15. urodzinach. |
| Chłopiec, możliwy wiek 5,99–6,01 roku, AMH 99,18 ng/mL | Brak jednoznacznego punktu dla jednej grupy; nie wybieramy mediany z połowy niepewnego przedziału. |
| Mężczyzna 40 lat, AMH 6,12 ng/mL | Punkt równy znacznikowi rocznego p50 Tehrani, nawet gdy ilustracja przebiega nieco wyżej; zmodyfikowany Gen II w źródle. |
| Mężczyzna 70 lat, AMH 3,95 ng/mL / powyżej 70 lat | Przy 70 latach punkt równy p50 Tehrani; powyżej brak odniesienia mimo wygaszonego ogona. |
| Męskie AMH, ten sam wiek: pusty → wynik równy źródłu → ponad osią → wyczyszczenie | Stała linia i skala; wynik ponad osią zachowuje prawdziwą wartość ze strzałką. |
| Porównanie płci AMH, donoszone niemowlę dokładnie 90 dni | Mediany modeli: chłopcy ≈161,6811 ng/mL; dziewczynki ≈2,3535 ng/mL. Obie linie i punkty na tej samej stałej osi log10, również bez wyniku. |
| Porównanie AMH, donoszony chłopiec 7 dni / dziewczynka 7 dni | Własna mediana Busch ≈64,25565 ng/mL i punkt chłopca dostępne; brak źródła dziewczynki. Wspólne linie zaczynają się w 7,305 dnia, bez ekstrapolacji. |
| Porównanie AMH, dokładnie pierwsze urodziny, dowolna płeć | Krzywe pozostają identyczne, ale brak punktu tego widoku; nie podstawiamy grupy Wang. |
| Porównanie AMH, dowolna płeć i zgodny kontekst, przedział `[11/12, 1)` / `[11/12, 1]` / wiek przekraczający 1 rok | Punkt tylko dla przedziału z wyłączonym końcem 1; pozostałe nie mieszczą się w oknie widoku. Źródłowe granice i obie krzywe pozostają bez zmian. |
| AMH, donoszona dziewczynka, dokładnie 1 rok, zwykły widok | Nadal p50 Ljubicic 0,9916278 ng/mL; brak punktu w porównaniu nie skraca źródłowego profilu. |
| Porównanie AMH, kwalifikujący kontekst: 0 → 0,1 → 1000 → 10000 ng/mL | Strzałka w dół → punkt na dolnej granicy → punkt na górnej granicy → strzałka w górę; krzywe i oś stałe. Nie traktujemy błędu konwersji 1000,0000000000001 jako przekroczenia osi. |
| Porównanie inhibiny B, donoszone niemowlę dokładnie 90 dni | Mediany modeli M≈294,2938 i F≈49,4718 pg/mL; stała wspólna liniowa oś 0–400 również bez wyniku. |
| Porównanie inhibiny B, donoszony chłopiec 7 dni / dziewczynka 7 dni | Własne odniesienie M≈187,9788 pg/mL dostępne, F bez odniesienia; wspólne linie od 7,305 dnia. |
| Porównanie inhibiny B w minipuberty, dokładnie 1 rok | Brak punktu obu płci w tym widoku; bez podstawienia Kelsey i bez zmiany globalnych granic profili. |
| Porównanie inhibiny B w pokwitaniu lub zwykły widok, dziewczynka dokładnie 8/12/13/20 lat, zgodny kontekst | Odniesienie Borelli ≈14/43/47/34 pg/mL. PCHIP zachowuje wszystkie 24 węzły 5,6–47 lat; zwykły widok korzysta z własnej stałej skali. |
| Zwykły widok, dziewczynka 6 lat, inhibina B 33 pg/mL, zgodny kontekst | Punkt 33 i przybliżona mediana ≈11 pg/mL; bez klasyfikacji normy, ta sama krzywa i skala. |
| Zwykły widok, dziewczynka dokładnie 5,6 lat / przedział 5,59–5,61 | Odpowiednio mediana ≈11 / brak kwalifikacji całego przedziału; bez wybierania środka wieku. |
| Zwykły widok, dziewczynka 3 lata / 5,25 roku, inhibina B 33 pg/mL | Stałe mediany całych grup Zhou 1–5 =33 / 5–10 =27 pg/mL. Krzywa i norma bez zmian. |
| Dziewczynka: przedział `[4,5)` / `[4,5]` / `[5.59,5.61]` | Mediana grupy 33 / brak jednej mediany / brak jednej mediany; pełny wiek nie jest redukowany do środka. |
| Dziewczynka dokładnie 1 rok / 5,6 roku | Zachowane źródła Ljubicic / Borelli; Zhou nie zastępuje ich na podstawie wyniku lub niezgodnej metody. |
| Kobieta >47 lat, inhibina B | Brak odniesienia Borelli; poglądowy ogon nie tworzy liczby. |
| Zwykły widok, kobieta dokładnie 25/30/40/46/47 lat, inhibina B 33 pg/mL, zgodny lub nieznany kontekst | Przybliżona mediana modelu ≈32/30/28/17/11 pg/mL; bez werdyktu normy. |
| Zwykły widok, F20 lat 0 miesięcy / F47 lat 0 miesięcy z formularza | Pierwszy przedział wieku mieści się w profilu; drugi wykracza poza 47 i nie otrzymuje punktu. Dokładne 47 lat kwalifikuje się osobno. |
| Zwykły widok, kobieta 30 lat, znana ciąża lub stan po menopauzie | Brak punktu zwykłego profilu według konserwatywnej polityki aplikacji; krzywa i interpretacja laboratoryjna bez zmian. |
| Porównanie pokwitania inhibiny B, chłopiec ze zgodną własną metodą, niedopasowaną do żeńskiego Gen II | Kwalifikacja wyłącznie własnego męskiego profilu; druga płeć nie blokuje punktu. |
| Porównanie pokwitania inhibiny B, możliwy wiek 7,99–8,01 albo 19,99–20,01 lat | Brak punktu dla wieku przekraczającego granicę widoku; nie zawężamy wieku do jego środka. |
| Porównanie inhibiny B, kwalifikujący kontekst: pusty → 0 → 400 → 1000 pg/mL → wyczyszczenie | Brak punktu → punkt na zerze → punkt na górnej granicy → strzałka w górę → brak punktu. Te same linie i skala; 400 ng/L równe 400 pg/mL. |
| Wcześniak 90 dni lub niemowlę z nieznanym donoszeniem | Brak dopasowania punktu do Busch/Ljubicic; bez użycia wieku skorygowanego. |
| Mężczyzna 44 lata, LH 2 / FSH 2 IU/L | Źródłowe mediany grupowe 3,91 / 4,56; przebieg i skala identyczne przed wpisaniem oraz po wyczyszczeniu wyniku. |
| Mężczyzna 20 lat, LH lub FSH, niezgodna metoda albo materiał / kontekst zgodny | Brak punktu opisany neutralną „wartością odniesienia” / źródłowa średnia Laurentino 3,0 IU/L nadal podpisana jako średnia. |
| Mężczyzna 75 lat, LH / FSH | LH: mediana grupy 4,44; FSH: przybliżona mediana modelu ≈7,8. Nie wymuszamy skoku linii na granicy źródła. |
| FSH dokładnie 80 / >80; LH dokładnie 89 / >89 | Odpowiednio ≈8,4 / brak oraz 5,22 / brak, bez przedłużania źródła wygaszonym ogonem. |
| LH `<0,05 IU/L`, męskie AMH w wieku 18–<20 lat, wiek poza źródłem | Brak dokładnego punktu, bez punktu zastępczego na zerze lub granicy osi. |

Regresje powinny objąć dzień przed/początek/koniec każdego profilu,
granice dwóch źródeł, blokadę graficznej podłogi, nierówności, jednostki
i konwersje, zmianę osoby/analitu/płci, odznaczenie hormonu, pełny ekran
oraz telefon. Dla męskich LH, FSH, AMH, inhibiny B i testosteronu dochodzą
stałość krzywej i skali przy pustym,
poprawnym, błędnym i cenzurowanym wyniku oraz płynność stycznych przy
zmianie źródła i w pasach wygładzenia osi. Należy sprawdzić, że zbliżenia
LH, FSH, T i AMH pokazują tę samą kanoniczną krzywą również poza wiekiem pacjenta.
Dla AMH sprawdzić szeroki niemowlęcy szczyt i monotoniczny spadek po nim,
ciągłość stycznych na połączeniach, niezmienione 15 pierwotnych profili
oraz kwalifikację trzech dodatkowych median grupowych i pozostałych luk.
Korekta testosteronu wymaga ciągłości przy końcach wszystkich połączeń,
monotonicznego dzieciństwa po 212. dniu, braku sztucznego maksimum 17–18 lat
i łagodnego, monotonicznego łuku dorosłości. Średnie Walravens pozostają
niezmienione po zmianie uchwytów łuku; pediatryczne mediany 16 i 17,9 lat
zachowują dotychczasowe wartości. Zbliżenia mogą mieć mały błąd ponownego
próbkowania — kontrolujemy go w pikselach, wraz z zachowaniem szczytów
i skali, bez deklarowania idealnej równości ścieżek SVG. Sprawdzamy też
desktop i 320 px oraz niezmienioną politykę pozostałych porównań płci.
AMH w minipuberty wymaga osobnej kontroli stałej pary modeli, wspólnej
osi log10 i zachowania punktu przy granicach 7 dni, 0,02 i 1 roku.
Inhibina B wymaga stałej osi liniowej obu okresów, własnej kwalifikacji
płci i zachowania tych samych granic niemowlęcych. W pokwitaniu
sprawdzamy 8 i 20 lat włącznie, cały zestaw 24 żeńskich węzłów oraz
zgodne mediany w zwykłym widoku oraz brak nowego odniesienia poza
zakresem wieku. Dla Jopling dochodzą stałe grupy, granice 1/5/8/12/15/18,
przedziały nieprecyzyjnego wieku i kwalifikacja osocza bez zmiany
dotychczasowych profili surowicy.
Test równości punktu ze źródłowym
odniesieniem nie może
sprawdzać wyłącznie
wspólnej błędnej implementacji: potrzebne są też powyższe wartości źródłowe.
Zielone testy potwierdzają techniczne odtworzenie danych, nie walidację
medyczną ani przydatność diagnostyczną nowej wizualizacji.
