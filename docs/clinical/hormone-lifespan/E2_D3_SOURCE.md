# Estradiol — źródłowa mediana wieku w 3. dniu cyklu

Właściciel zaakceptował makietę desktopową i mobilną oraz polecił jej
implementację 23.10.2026 („jest ok, koduj”). Zakres to osobny blok
edukacyjny bieżącego E2: **26 literalnych P50(M), wiek 19–44 lata**, po
wykluczeniu rozbieżnego węzła 18 lat. Akceptacja dotyczy tego zakresu,
ograniczeń i sposobu prezentacji; nie nadaje źródłu statusu niezależnej
walidacji klinicznej, nowego RI ani testu rezerwy jajnikowej.

## Pełne źródło i pochodzenie tabeli

Grisendi V, Spada E, Argento C, Plebani M, Milani S, Seracchioli R, Volpe A,
La Marca A. *Age-specific reference values for serum FSH and estradiol
levels throughout the reproductive period*. **Gynecological Endocrinology
2014;30(6):451–455**, DOI
[10.3109/09513590.2014.893572](https://doi.org/10.3109/09513590.2014.893572),
[PMID 24805832](https://pubmed.ncbi.nlm.nih.gov/24805832/).

Zweryfikowano dostarczony przez użytkownika pełny, opublikowany artykuł:
metody na s. 452 oraz oryginalną **tabelę 2, s. 454, kolumna 50th (M)**,
także na obrazie PDF. Dostarczony CSV jest odwzorowaniem tabeli, nie danymi
uczestniczek ani niezależnym potwierdzeniem publikacji. Hashe dokumentów,
literalne wartości i granice audytu zawiera
[ekstrakt źródłowy](evidence/e2-d3-source-audit-2026-10-23.json).
Surowe PDF i CSV nie są kopiowane do repozytorium.

## Populacja, pobranie i oznaczenie

Jednoośrodkowa, wyselekcjonowana próba przekrojowa: **192 kobiety**,
Institute of Obstetrics and Gynecology, University of Modena, Włochy.
Powody zgłoszenia: porady przedkoncepcyjne N=103, antykoncepcyjne N=67,
sterylizacja jajowodowa N=22. Wymagano obu jajników i regularnych cykli
**25–35 dni, z różnicą między cyklami <5 dni**. Wyłączano podawanie
hormonów płciowych w poprzednich 6 miesiącach, przebyte zapalenie narządów
miednicy lub operację jajników oraz znaną chorobę przewlekłą, układową,
metaboliczną lub endokrynną, w tym hiperandrogenizm. Mediana wieku 36 lat,
kwartyle 31,5–39,8; liczebności osobnych roczników nie podano. To nie jest
losowa próba całej populacji ani potwierdzenie płodności każdej uczestniczki.

**Każde pobranie wykonano w 3. dniu cyklu.** Sam wybór fazy folikularnej
nie potwierdza tego dnia. Surowicę wirowano 2000 g przez 10 minut i
przechowywano w −80°C. E2 oznaczano kompetycyjnym testem
chemiluminescencyjnym **ADVIA Centaur, Siemens Healthcare Diagnostics,
Italy**. Raportowana **czułość 10 pg/mL**, CV wewnątrz- i międzyseryjny
**3,1% / 5,0%**. Brak wersji odczynników, stężeń dla CV i formalnych
definicji LOD/LOQ. Nie przemianowujemy „sensitivity” na zweryfikowany LOD
lub LOQ; brak opisu cenzury, imputacji i liczby niskich obserwacji nie dowodzi
ich nieobecności. Parametry dzisiejszego testu Siemens nie są dopisywane
do historycznej kohorty.

Metoda i surowica źródła nie ustalają metody ani materiału próbki pacjentki.
Zgodność jednostek nie harmonizuje immunoassay z LC-MS/MS lub inną metodą.
Brak informacji nie oznacza potwierdzonej zgodności ani ujemnego wywiadu.
W badaniu FSH i E2 pochodziły z jednego pobrania; nie potwierdza to, że
dwa wyniki wpisane w aplikacji również pochodzą z tego samego pobrania.

## Co importujemy i czego nie poprawiamy

Metody nazywają M medianą modelu CG-LMS. Import obejmuje **wyłącznie
26 literalnych P50(M) w pg/mL od 19 do 44 lat**. Są to mediany modelu
wieku, nie empiryczne mediany osobnych roczników, średnie ani trajektoria
jednej kobiety. Wybrane komórki CSV sprawdzono z PDF: **26/26** zgodnych;
kontrola kwartylów i spójności kolumny także nie wykazała rozbieżności
wybranych M. To kontrola wewnętrzna źródła, nie walidacja kliniczna.

P50 dla **18 lat = 33,497 pg/mL** jest rozbieżna z pozostałą tabelą.
Nie poprawiamy jej na podstawie regresji, sąsiadów lub oczekiwań. Nie
importujemy tego węzła, nie interpolujemy przez wiek 18 i nie odtwarzamy
globalnego równania autorów. Węzły 16–17 pozostają poza zakresem tego
przyjętego bloku dorosłych; samo ich pominięcie nie jest stwierdzeniem
błędu tych komórek. Osobne rozbieżności P5 wieku 19/20 nie są podstawą
do importu całego LMS. **Nie importujemy L, S, P5/P25/P75/P95, RI, SDS,
centyla pacjentki lub progów rezerwy jajnikowej.**

Przykłady literalnej kolumny:

| Wiek źródłowy [lata] | P50 E2 [pg/mL] |
| --- | ---: |
| 19 | 39,984 |
| 20 | 41,470 |
| 30 | 56,336 |
| 40 | 71,202 |
| 44 | 77,149 |

Węzły zachowują także `sourceLiteral`, czyli oryginalną precyzję druku
0,001 pg/mL. Większa liczba cyfr przeliczenia/interpolacji nie zwiększa
precyzji badania. Nie zaokrąglamy rzeczywistego punktu pacjentki do
źródłowej mediany, zera lub górnej granicy osi.

## Dane, wiek i jednostki

Odrębne `e2-d3-data.json` zasila bezpaństwowy
`VildaE2D3.evaluate(data, context)`. Pakowanie przez `build_runtime.py`
udostępnia je jako `VildaHormoneLifespanData.e2D3Data`. Silnik otrzymuje
dane i reguły jako argument; nie ustala źródła na podstawie wartości
wyniku. Zwracana mediana, domena, źródło, węzły i polityka są odłączone
od wejść, a dostępność punktu jest osobnym statusem porównania.

**Cały możliwy przedział wieku musi mieścić się w [19,44].** W tabeli
drukowano 16–44, kryteria rekrutacji mówiły 16–45, a dyskusja o wieku <45;
nie uprawnia to do dopisania węzła 45 lub przedłużenia wartości 44.
Reguła umieszczenia przy dorosłej kobiecie >18 jest metadanymi aplikacji;
wybrana domena E2 pozostaje węższa i zaczyna się dopiero od 19.

Zachowujemy kontrakt ciągłego wieku i jego dokładności. Odniesienie liczymy
przy dolnej granicy **wpisanego** wieku; nie wybieramy środka przedziału,
nie zgadujemy daty urodzenia i nie nazywamy wieku nieprecyzyjnego dokładnym.
`ageContext` niesie `lowerYears`, `upperYears`, `upperInclusive` oraz
`basis: 'entered-age-lower-bound'`. Na węźle obowiązuje literalne M.
Między dwoma sąsiednimi wybranymi węzłami stosujemy jawną **interpolację
liniową** z flagą `interpolated`: to polityka aplikacji, nie odzyskane
równanie autorów ani odtworzenie LMS. `[30,31)` daje 56,336 przy wpisanym
30; 30,5 daje 57,0795 pomiędzy M30 i M31. `[43,44)` kwalifikuje,
`[44,45)` nie; dokładne 44 kwalifikuje. Nie przycinamy wieku do tabeli.

Źródło i osobna oś D3 pozostają w **pg/mL**. Konwersje wyniku biorą
dzielniki z danych `policy.measurementConversions`, dla wszystkich pięciu
jednostek już obsługiwanych przez istniejący przelicznik E2:

| Jednostka wejściowa | Dzielnik do pg/mL |
| --- | ---: |
| pg/mL | 1 |
| pmol/L | 3,671 |
| nmol/L | 0,003671 |
| ng/L | 1 |
| ng/dL | 0,1 |

Nie zmieniamy współczynnika, jednostek ani precyzji głównego przelicznika.
Wynik 240,0834 pmol/L daje punkt 65,4 pg/mL, niezależnie od mediany.

## Jedno opcjonalne wskazanie D3 dla bieżącego E2

Mediana dla wpisanego wieku jest dostępna także bez potwierdzenia dnia 3,
jako informacja o badaniu. Lokalny wybór ma wartości `unknown` / `day3` /
`other` i dotyczy **wyłącznie tego wyniku E2, tej samej osoby**. Punkt
pacjentki wymaga jawnego `day3`, dokładnego wyniku i spełnienia wszystkich
pozostałych bramek. D3 nie jest domyślnie dziedziczone z FSH, innego wyniku,
wieku, fazy ani stężenia. Nie dodajemy pytań o metodę, materiał i całą
listę wyłączeń źródła przed pokazaniem dotychczasowego wyniku.

Jawne D3 wraz z fazą nieznaną lub folikularną może pozwolić na orientacyjne
zestawienie. Jawna faza owulacyjna/lutealna jest sprzeczna z D3: pozostaje
informacja o medianie badania, lecz brak punktu. D3 nie zmienia wybranej
fazy i nie wybiera automatycznie mediany fazy Anckaert. Znana ciąża,
menopauza, leczenie hormonalne/GnRHa, stymulacja, jawna niezgodna metoda
lub materiał oraz niedostępny/historyczny kontekst wstrzymują ten blok.
To bramki aplikacji; nie wszystkie są literalnymi kryteriami autorów.
Nieznane informacje pozostają nieznane.

Własna linia jest liniową łamaną przez wybrane mediany wieku, na stałej
osi **0–100 pg/mL**, niezależnej od pacjentki. Punkt ponad osią ma strzałkę
z rzeczywistą liczbą. Linia całego życia, schemat cyklu, Anckaert 2021 i
laboratoryjne RI Tietz zachowują odrębne kontrakty. Zestawienie z P50 nie
zmienia istniejącego statusu laboratoryjnego i nie nadaje nowego werdyktu
„dobry/zły”, oceny płodności, wieku jajników lub procentu pozostałych oocytów.

## Nierówności, tożsamość i historia

Wynik `<`, `>`, `≤`, `≥`, `<LOD` lub `<LOQ` zachowuje zapis i poprawną
konwersję liczbowej granicy, ale nie otrzymuje dokładnego punktu. Brak
liczbowej granicy pozostaje brakiem — bez podstawienia zera, połowy progu,
progu lub historycznej czułości 10 pg/mL. Informacja o medianie źródła
może pozostać widoczna, jeżeli reszta bieżącego kontekstu kwalifikuje.

Stan tego konkretnego bloku jest **lokalny, bieżący i bez zapisu**. D3,
mediana i zestawienie nie trafiają do `lab.hormoneReference`, przypiętej
oceny lub schematu historii. Nie oceniamy dawnych wyników dzisiejszym
wiekiem lub lokalną odpowiedzią o dniu 3. Istniejące snapshoty laboratoryjne
oraz odczyt historii pozostają bez zmiany.

Zmiana osoby, analitu, wyniku, jednostki źródłowej, wieku, fazy/kontekstu
lub odtworzenie/reset usuwa odpowiedź D3 i poprzednie liczby. Przełączenie
FSH → E2 nie przekazuje D3. Zwykłe odświeżenie tego samego bieżącego wyniku,
fokus i zmiana wyłącznie jednostki prezentacji nie stanowią nowego pobrania.
Spóźniony odczyt wcześniejszej osoby nie może przywrócić jej odpowiedzi.

## Przypadki źródłowe i sprawdzenia

- F30, E2 65,4 pg/mL, dzień nieznany → P50 **56,336 pg/mL**, bez punktu.
- Ten sam bieżący wynik, potwierdzony D3 → osobno punkt **65,4** i P50
  **56,336**; bez nowej klasyfikacji laboratoryjnej.
- 240,0834 pmol/L, D3 → ten sam punkt **65,4 pg/mL**, bez podwójnej konwersji.
- `[30,31)` → P50 **56,336** przy dolnej granicy; 30,5 → interpolowana
  **57,0795**. `[43,44)` kwalifikuje; `[44,45)` nie; dokładne 44 → **77,149**.
- Wiek 18 lub 18,5 → brak odniesienia z rozbieżnego węzła i bez interpolacji
  przez niego. Nie zmienia to istniejących niezależnych odniesień E2.
- `<10`, `<LOD` lub `<LOQ` → brak dokładnego punktu i imputacji.
- Znana owulacyjna + D3 → źródło bez punktu; ciąża/menopauza/leczenie →
  brak bloku Grisendi, przy zachowaniu wyniku i istniejących własnych bramek RI.
- Zmiana wyniku/osoby lub FSH → E2 → lokalny dzień nieustalony.

Audyt pełnego tekstu i wybranych P50 jest zakończony. Wyniki testów
rzeczywistych funkcji, adaptera, historii, desktop/mobile, PWA/offline i
wszystkich kontroli GitHub dla finalnego SHA raportuje integrujący PR.
Ten dokument nie przedstawia planowanych testów jako już wykonanych ani
technicznych testów jako walidacji klinicznej.
