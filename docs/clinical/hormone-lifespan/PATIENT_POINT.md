# Punkt wyniku na wykresie hormonów

Decyzja właściciela z 10 października 2026: wdrożyć zatwierdzony czerwony
punkt na dostępnych danych liczbowych, wykorzystując istniejący formularz.
Zakres decyzji dotyczy orientacyjnej prezentacji edukacyjnej; nie jest
nadaniem statusu walidacji klinicznej modelom ani digitalizacji rycin.

## Znaczenie i dane wejściowe

Punkt pokazuje wpisane stężenie, a linia — centralny przebieg modelu
populacyjnego. W zależności od źródła jest to opublikowane p50 lub odczytana
z ryciny krzywa 0 SD, z odpowiednią informacją o przybliżeniu. Określenie
„średnia” nie zastępuje mediany; linia nie jest granicą normy. Kolor czerwony
identyfikuje pacjenta i nie nadaje wynikom statusu nieprawidłowych.

Wykorzystujemy aktualny analit, surowy zapis wyniku, jednostkę, wiek, płeć
i znane dane urodzeniowe z istniejącego kontekstu. Wybór źródła nie zależy
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
| Męski testosteron całkowity; 3–88 lat | [Kelsey 2014](https://doi.org/10.1371/journal.pone.0109346), Table S1, A1/B2:B8; [korekta 2015](https://doi.org/10.1371/journal.pone.0117674), poprawiona tabela 3 | Połączone 13 badań, 10 097 mężczyzn, surowica; różne oznaczenia przeliczone przez autorów do odpowiednika LC-MS/MS | Węzły co 0,1 roku z funkcji centralnej `log10(T+1)` po odwróceniu transformacji, zgodne z poprawionym p50; między węzłami PCHIP. Nie średnia arytmetyczna stężeń. Model po 40 latach jest niemal płaski; nie wymuszać spadku ze starego schematu. |
| Męska inhibina B; 1–<6,1 roku | [Kelsey 2016](https://doi.org/10.1371/journal.pone.0153843), tabela 4, opublikowane węzły p50 | Cztery badania, 709 obserwowanych par wiek–stężenie; surowica, historyczne dwumiejscowe ELISA | Pełna tabela 0–17 lat pozostaje dowodem, wybrany odcinek jest polityką aplikacji. Nie używać rocznej tabeli do minipuberty. Nie odtwarzać modelu zaokrąglonymi współczynnikami z tabeli 2. |
| Męska inhibina B; 6,1–80 lat | [Borelli-Kjær 2025](https://doi.org/10.1210/clinem/dgae439), ryc. 2, męska linia 0 SD | Dania, 1818 uczestników/2007 próbek łącznie; surowica; mieszane Oxford Bio-innovation i Gen II ELISA | Digitalizacja około ±5 pg/mL, nie dokładna funkcja autora ani kalkulator SDS. `ng/L = pg/mL`. Nie przeliczać dowolnej metody współczynnikiem różnicy Oxford/Gen II. Nie łączyć z Kelsey jako jednym modelem. |
| Męskie AMH; 30–70 lat | [Tehrani 2017](https://doi.org/10.1371/journal.pone.0179634), tabela 2, 41 rocznych p50 | 831 zdrowych mężczyzn z Tehran Lipid and Glucose Study; surowica, zmodyfikowany AMH Gen II EIA, na czczo 07:00–09:00 | Mediany swoiste dla wieku; pomiędzy nimi interpolacja. Nie zamieniać na osocze Access ani nie przedłużać przed 30. i po 70. roku. |
| Żeńskie LH, FSH, AMH, inhibina B, E2; 0,02–1 roku | [Ljubicic 2022](https://doi.org/10.1210/clinem/dgac363), ryc. 1 i [Supplementary Table 1](https://doi.org/10.6084/m9.figshare.19469555.v1), 99 median na hormon | 98 zdrowych donoszonych dziewczynek, 266 próbek surowicy; AutoDELFIA LH/FSH, Access 2 AMH, Gen II ELISA inhibina B, LC-MS/MS E2 | Pierwszy zachowany węzeł 0,02 roku, nie urodzenie. Mediany GAMLSS nie są średnimi podłużnymi z ryc. 3. Nie dopisywać stężeń przed pierwszym węzłem. |

INSL3 pozostaje zadaniem przyszłego kalkulatora. Zachowane wartości
niemowlęce z Busch nie uruchamiają nowego analitu. Dorosłe LH/FSH, dziecięce
AMH, pozaniemowlęce profile żeńskie i niepokryte fragmenty osi pozostają
bez ilościowego punktu. Dostępny schemat lub mediana szerokiej grupy wieku
nie wypełnia tej luki. Dane płodowe, pępowinowe i wcześniacze nie należą
do powyższych profili.

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

Jednostki źródłowe zachowuje się w danych: LH/FSH IU/L, testosteron nmol/L,
inhibina B pg/mL, żeńskie E2 pmol/L; AMH Busch/Ljubicic pmol/L, Tehrani
ng/mL. Runtime używa dla AMH pmol/L; tehraniowskie ng/mL przelicza tym
samym współczynnikiem co wynik pacjenta (`1 ng/mL = 1/0,1401 pmol/L`).
Konwersja jednostki pacjenta musi być jawna i wspólna z rysowaniem.
Zgodność jednostek nie dowodzi zamienności metod oznaczenia.

Punkt i linia używają wspólnego modelu oraz monotonicznej funkcji skali.
Nie przycinamy punktu do zakresu `[0,1]` i nie przesuwamy wieku na brzeg
widoku. Odcinki interpolowane PCHIP pozostają w zakresie węzłów swojego
profilu; granica publikacji nie jest parą węzłów do interpolacji. W osobnym
porównaniu płci ewentualny punkt dotyczy tylko płci pacjenta i tej samej
skali co jej linia, nigdy obu populacji naraz.

Suplementy Madsen i Ljubicic oraz dane PLOS są CC BY (dokładna wersja
w metadanych źródła). Artykuł Madsen ma odrębną licencję CC BY-NC-ND.
Busch i Borelli zachowują prawa wydawcy: w aplikacji są liczbowe odczyty
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
| Donoszony chłopiec, dokładnie 90 dni, LH 2,05589 IU/L | Punkt na przybliżonej medianie Busch; wartość ma dokładność odczytu ryciny, nie sześciu klinicznych miejsc dziesiętnych. |
| Donoszony chłopiec, 90 dni, inhibina B 300 pg/mL | Busch około 294,293798 pg/mL; punkt nieznacznie ponad linią. |
| Mężczyzna 40 lat, testosteron 13,049603876520182 nmol/L | Punkt na centralnej linii Kelsey 2014/2015. |
| Chłopiec 3 lata, inhibina B 107 pg/mL | Punkt na węźle p50 Kelsey 2016, bez stosowania krzywej niemowlęcej. |
| Mężczyzna 40 lat, AMH 6,12 ng/mL | Punkt na rocznym p50 Tehrani; metoda Gen II w źródle, bez potwierdzania metody próbki. |
| Wcześniak 90 dni lub niemowlę z nieznanym donoszeniem | Brak dopasowania punktu do Busch/Ljubicic; bez użycia wieku skorygowanego. |
| LH `<0,05 IU/L`, dorosłe FSH, dziecięce AMH bez profilu, wiek poza źródłem | Brak dokładnego punktu, bez punktu zastępczego na zerze lub granicy osi. |

Regresje powinny objąć dzień przed/początek/koniec każdego profilu,
granice dwóch źródeł, blokadę graficznej podłogi, nierówności, jednostki
i konwersje, zmianę osoby/analitu/płci, odznaczenie hormonu, pełny ekran
oraz telefon. Test równości punktu z linią nie może sprawdzać wyłącznie
wspólnej błędnej implementacji: potrzebne są też powyższe wartości źródłowe.
Zielone testy potwierdzają techniczne odtworzenie danych, nie walidację
medyczną ani przydatność diagnostyczną nowej wizualizacji.
