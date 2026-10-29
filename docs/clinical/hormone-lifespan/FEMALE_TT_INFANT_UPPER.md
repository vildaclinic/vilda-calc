# TT niemowląt płci żeńskiej — źródłowa górna wartość odniesienia

Właściciel po audycie źródeł, zaakceptowaniu prywatnej makiety i
wyjaśnieniu różnicy względem niewłączonego zakresu Mayo polecił wdrożenie
zgodne z rekomendacją (29 października 2026). Dotyczy osobnego zestawienia
bieżącego wyniku TT z górnym p97,5 Johannsen 2018 w wąskim oknie wieku.
Nie jest zgodą na nową medianę, normę całego niemowlęctwa, rozpoznanie
lub przeliczenie historycznych ocen. Akceptacja nie jest walidacją kliniczną.

## Pełne źródło i zakres odczytu

Johannsen TH, Main KM, Ljubicic ML i wsp. *Sex Differences in Reproductive
Hormones During Mini-Puberty in Infants With Normal and Disordered Sex
Development.* J Clin Endocrinol Metab. 2018;103(8):3028–3037.
DOI [10.1210/jc.2018-00482](https://doi.org/10.1210/jc.2018-00482),
[PMID 29917083](https://pubmed.ncbi.nlm.nih.gov/29917083/),
[końcowy tekst wydawcy](https://academic.oup.com/jcem/article/103/8/3028/5037960).

Audyt z 29.10.2026 objął pełny zachowany HTML i tekst wydawcy: metody,
obie tabele, wyniki, dyskusję, ograniczenia i piśmiennictwo. Obejrzano
wszystkie pięć oryginalnych rycin. Bieżące pobranie OUP HTML/PDF było
blokowane przez 403; nie deklarujemy pobrania nowej kopii końcowego PDF.
SHA-256 zachowanego HTML:
`58f117a94ad1b37de4dfd5f649c0af12b6198bff89a287bbd8cdfe9ff708415b`;
tekstu:
`024622d7f740a160705736641cab0e19278650a02b948be504d220dabc3f1102`.

Źródłem liczb jest **tabela 1, drukowana strona 3033**. Odsetek poniżej
LOD pochodzi z **ryciny 3, strona 3032**, nie z digitalizacji mediany.
W HTML i spisie numeru nie znaleziono suplementu tej publikacji; nie
jest to dowód nieistnienia suplementu w każdym archiwum. Lokalny plik
o nazwie `Supplementary Data_Johannsen et al.pdf` dotyczy innej pracy
Borelli-Kjær o inhibinie B i został wykluczony. Pełne pliki wydawcy i
obrazy indywidualnych obserwacji nie trafiają do repozytorium.

[Sanityzowany dowód](evidence/female-tt-infant-upper-johannsen2018-audit-2026-10-29.json)
utrwala fakty, hashe źródeł, ograniczenia dostępu, decyzję aplikacji
i fikcyjne przypadki. Nie zawiera rzeczywistych danych pacjentów.

## Statystyka, populacja i cenzurowanie

| Grupa źródłowa | N dziewczynek z TT LC-MS/MS | Średnia geometryczna | Dolny p2,5 | Górny p97,5, nmol/L |
| --- | ---: | --- | --- | ---: |
| 2,0–<3,5 miesiąca | 165 | <LOD | <LOD | 0,21 |
| 3,5–5,0 miesięcy | 125 | <LOD | <LOD | 0,17 |

Autorzy logarytmowali wiek i stężenia, a następnie raportowali
przekształcone z powrotem średnie geometryczne oraz p2,5–p97,5. Nie
nazywamy ich niecenzurowanymi empirycznymi percentylami ani liczbami
niezależnymi od imputacji. Średnia geometryczna nie jest medianą.

- Trzy duńskie kohorty zdrowych niemowląt, jedna próbka na dziecko.
  Łącznie 1840 dzieci: 1041 chłopców i 799 dziewczynek. TT LC-MS/MS
  oznaczono u **290 dziewczynek**, a nie u 799; 165+125 to właściwe N.
- Włączano GA **37+0–41+6 tygodni, 259–293 dni włącznie**. Obserwowany
  zakres wieku wszystkich dziewczynek wynosił **2,3–5,0 miesiąca**,
  średnia 3,3. Dokładnych skrajnych wieków podgrupy żeńskiego TT
  LC-MS/MS osobno nie opublikowano.
- Surowica, LC-MS/MS w Rigshospitalet w Kopenhadze; pobrania bez
  wymagania postu, 08–18. Źródłowe LOD TT **0,10 nmol/L**; odrębnego
  LOQ nie podano. Podane międzyseryjne CV 9% nie opisuje udowodnionej
  precyzji na poziomie LOD lub każdego niskiego wyniku.
- **79,0%** żeńskich wyników TT LC-MS/MS było poniżej LOD. Dokładnej
  liczby tych wyników nie wydrukowano; nie dopisujemy jej z odsetka.
  Autorzy podstawiali **LOD/2 = 0,05 nmol/L** do analizy. To nie
  zmierzony wynik, dokładna mediana, dolna norma ani liczba pacjentki.
- Źródłowy klasyfikator płci **0,31 nmol/L** nie jest żeńskim p97,5
  lub progiem rozpoznania DSD i pozostaje niewłączony. Porównanie RIA
  z LC-MS/MS dotyczyło 182 chłopców; nie służy do kalibracji dziewczynek.

## Jawna kwalifikacja aplikacji

Dane i politykę rozdzielono w `female-tt-infant-upper-data.json` oraz
`female-tt-infant-upper-policy.json`. Czysty produkcyjny silnik
`VildaFemaleTTInfantUpper.evaluate(data, policy, context)` przyjmuje
źródło jako argument. Wynik niesie pochodzenie i użyte górne wartości.
Renderer nie tworzy własnej normy. Runtime dodaje wyłącznie
`femaleTtInfantUpperData` i `femaleTtInfantUpperPolicy`; **45 wcześniejszych
pól i 85 zwykłych profili** pozostaje bez zmian.

Cały możliwy wiek chronologiczny musi mieścić się w **[2,3;5,0] miesiąca**.
Dolne 2,3 jest konserwatywną decyzją aplikacji na podstawie zaokrąglonego
zakresu **wszystkich dziewczynek**. Nie przedstawiamy go jako progu autorów
lub potwierdzonego minimum podgrupy TT LC-MS/MS. Nominalne grupy tabeli
2–<3,5 i 3,5–5 pozostają dosłownymi grupami źródłowymi; aplikacja nie
tworzy nowych percentyli dla węższej podgrupy 2,3–<3,5.

Źródło nie podaje reguły przeliczenia miesięcy na dni. Kwalifikacja
wykorzystuje jawny, konserwatywny **kalendarzowy przedział wieku**
z dostępnego DOB lub precyzji istniejącego formularza. Nie tworzymy
nowego DOB, daty pobrania, środka przedziału lub stałych równoważników
2,3/3,5 miesiąca w dniach. Pozycja wieku w dniach z ogólnego wykresu
nie zastępuje kontekstu kalendarzowego; dotychczasowa ochrona sześciu
miesięcy w module Kushnir pozostaje niezależna. Wiek skorygowany/PMA
nie zastępuje wieku chronologicznego.

Adapter źródłowy zachowuje przedział dni `[n−1,n]` z formularza.
Główny formularz wyprowadza z własnego DOB wyłącznie liczbowy przedział
wieku kalendarzowego, zgodny z konwencją rocznic kalendarzowych istniejącego
resolvera. Pomocniczy cache nie zapisuje DOB ani daty próbki. Nowy odbiorca
jawnie zamawia tę informację i sprawdza zgodność jej PNA z bieżącym wejściem,
osobą, polami, trybem wizyty i dniem. Edycja DOB oraz odtwarzanie unieważniają
cache przed ponownym wyprowadzeniem wieku. Stary cache bez tych metadanych
zostawia szerszy wiek kalendarzowy. Ręczna korekta wieku usuwa odziedziczone
dni. `evaluation.ageAtSample` i daty kanonicznej oceny pozostają bez zmian.

Jednoznaczne porównanie wymaga całego wieku w jednej grupie źródłowej,
całego znanego przedziału GA w **259–293 dniach**, znanej surowicy i zgłoszonej zgodnej
metody LC-MS/MS. Informacja o metodzie publikacji nie uzupełnia
automatycznie metody próbki. Brak GA, metody lub materiału pozostawia
**informację o źródle**, rzeczywisty wynik i przeliczenia, bez przypisanego
werdyktu lub punktu pacjentki. Nie dodajemy nowego badge o metodzie
ani obowiązkowych pytań o metodę, materiał, Tanner, leczenie lub datę.

GA ma jawny dolny i górny koniec oraz domknięcie (`gestationalAgeDays`,
`gestationalAgeUpperDays`, `gestationalAgeUpperInclusive`). Sam numer
ukończonego tygodnia lub dolna granica nie staje się dokładnym GA.
Przykład dokładnych 280 dni ma również górne 280 i koniec zamknięty;
„37 ukończonych tygodni” zachowuje cały zakres 259–265 dni. Brak górnej
granicy daje informację o źródle, bez porównania pacjentki.

Znana niezgodna metoda/materiał, wcześniactwo lub GA poza populacją,
leczenie hormonalne, GnRHa i stymulacja zachowują wyłączenia. Nieznany
wywiad nie staje się potwierdzeniem braku leczenia. Ochrona aktualnej
tożsamości, płci, analitu, blokady i spóźnionych odczytów musi usuwać
stare odniesienie. Bieżący kontekst nie kwalifikuje historycznej próbki.

Gdy cały wiek pasuje do okna aplikacji, ale obejmuje granicę 3,5 miesiąca,
pokazujemy **dwie dosłowne górne wartości źródłowe** z grupami wieku.
Nie łączymy ich w szeroki RI i nie nadajemy pojedynczego werdyktu;
ukończone 3 miesiące znaczą `[3,4)`, a nie dokładnie 3,0. Wiek niepełnie
pokryty przez okno aplikacji nie otrzymuje odniesienia dla swojej części.

## Porównanie górnej wartości i prezentacja

To **górna wartość odniesienia źródła**, nie pełny RI laboratorium.
Nie tworzymy dolnej normy, zielonego pasma 0–U, flagi „poniżej normy”,
SDS, centyla pacjentki, diagnozy lub oceny pilności. Neutralne etykiety:
**„Nie przekracza górnej wartości odniesienia”** oraz **„Powyżej górnej
wartości odniesienia”** pojawiają się tylko przy pewnym wniosku dla
całego znanego stężenia i całej kwalifikacji.

- Dokładna wartość równa U nie przekracza U. `>U` przekracza;
  `≥U` jest niejednoznaczne, bo dopuszcza równość. Każdy operator
  pozostaje operatorem po konwersji.
- `<0,10` przy górnej 0,21 pozwala stwierdzić nieprzekroczenie,
  lecz bez dokładnej kropki. `<LOD`/`<LOQ` bez liczbowej granicy
  nie pożycza źródłowego LOD i nie otrzymuje liczbowego werdyktu.
- Dokładny punkt wymaga kwalifikowanego dokładnego wyniku. Nie ma
  punktu dla nierówności, nieznanego kontekstu lub dwóch grup wieku.
  Nie imputujemy zera, 0,05, LOD, LOQ lub środka przedziału.
- Stała neutralna oś stężeń **0–0,4 nmol/L** z równoważnymi konwersjami
  nie zależy od wyniku lub wieku; 0 osi nie oznacza dolnej normy.
  Ponad osią strzałka z prawdziwą liczbą. Nie rysujemy mediany, krzywej
  wieku ani linii łączącej górne wartości.
- Wynik, górna wartość i konwersje domyślnie mają 2 miejsca po przecinku,
  **ng/mL 3**. Jeżeli taki zapis ukrywa pewne przekroczenie, wspólna
  precyzja wyniku i górnej zwiększa się tylko do potrzebnego minimum,
  maksymalnie 10 miejsc. Przykład 0,214 vs 0,21 → **0,214 / 0,210**;
  0,0606 ng/mL vs 0,060571… → **0,06060 / 0,06057**. Bardzo małe
  dodatnie liczby nie stają się zerem. Formatowanie nie zmienia surowych
  wartości, werdyktu i następnej konwersji; przelicznik TT pozostaje ten sam.

## Mayo i pozostałe luki

Pełny aktualny katalog [Mayo TTST/8533](https://www.mayocliniclabs.com/test-catalog/overview/8533),
ośmiostronicowa definicja i dwustronicowy setup nadal podają dla
dziewczynek 0–5 miesięcy **20–80 ng/dL = 0,6934–2,7736 nmol/L**.
Przeliczenie jest poprawne. Publicznie nie ma kohorty niemowlęcej,
GA, podziału rzeczywistego wieku, definicji percentyli ani liczbowych
LOD/LOQ, które wyjaśniałyby rozbieżność. Oba główne porównywane źródła
opisują LC-MS/MS; samo „RIA versus MS” nie jest wyjaśnieniem. Nie
nazywamy Mayo udowodnionym błędem i nie zmieniamy katalogowej etykiety
na noworodkową. Niemowlęcy profil Mayo pozostaje odroczony, bez fallbacku.

FFTST w katalogu Mayo jest innym badaniem wykonywanym przez LabCorp
Burlington. Opis niskich stężeń po pierwszym miesiącu jest wskazówką
do dalszego audytu wieku, nie korektą zakresu TTST lub kalibracją metod.
Nie uśredniamy źródeł i nie dobieramy ich według korzystnego wyniku.

Ta zmiana nie wypełnia okresu przed 2,3 miesiąca, po 5 do <6 miesięcy
ani wcześniactwa. Olthof 2025/online 2024 pozostaje kandydatem dwóch
grup noworodkowych; nie uzyskano suplementu i nie ustalono konwencji dni.
Kulle 2010 ma małe grupy osocza. Pełne źródła i suplementy Frederiksen
2024 i Busch 2025 nie były dostępne w audycie; nie oceniono ich do importu
P50. Nie twierdzimy, że szersze modele lub mediany niemowlęce nie istnieją.

## Przypadki syntetyczne i regresje

W wierszach „kwalifikowana” założono bieżącą tożsamość, surowicę,
zgłoszoną LC-MS/MS, GA 280 dni i brak znanego wyłączenia.

| Fikcyjne wejście | Oczekiwany wynik produkcyjnego silnika/UI |
| --- | --- |
| Kwalifikowana, dokładne 2,5 mies., TT 0,18 nmol/L | U 0,21; nie przekracza; punkt 0,18; bez mediany i pełnego „w normie” |
| Kwalifikowana, dokładne 4 mies., TT 0,18 | U 0,17; powyżej; punkt 0,18 |
| Kwalifikowana, 2,5 mies., 0,21 / `>0,21` / `≥0,21` | Nie przekracza / powyżej / niejednoznaczne; operatory bez punktu |
| Kwalifikowana, 2,5 mies., `<0,10` / `<LOD` | Nie przekracza / brak liczbowego porównania; żadnej dokładnej kropki |
| Cały wiek `[3,4)` mies., TT 0,18 | Dwie górne wartości 0,21 i 0,17; brak pojedynczego werdyktu i punktu |
| Cały wiek `[2,3)` mies. / wiek >5 / brak wieku | Bez kwalifikowanego porównania, bez przycinania domeny lub najbliższej normy |
| 4 mies., nieznana metoda albo GA | Informacja o źródle; rzeczywisty wynik/konwersje, bez przypisanego werdyktu lub punktu |
| Znane osocze/immunoassay/GA 258 lub 294/leczenie | Zestawienie wstrzymane; bez Mayo lub innego źródła zastępczego |
| Kwalifikowana, 2,5 mies., 0,214 nmol/L | Pewne powyżej; etykiety 0,214 / 0,210, bez zmiany liczb źródłowych |
| Ta sama grupa, 0,0606 ng/mL | Pewne powyżej; etykiety 0,06060 / 0,06057 |
| Historia / zmiana osoby/płci/analitu / lock | Bez nowego przeliczenia lub zapisu oceny; usunięte stare odniesienie/pełny ekran |

Regresje wywołują rzeczywistą funkcję produkcyjną, adapter i UI, obejmują
granice wieku/GA, nierówności, wszystkie jednostki, mobile 320/390,
pełny ekran i zimny restart PWA offline. Historyczne testy zdejmują
wyłącznie dwa nowe bloki przez `beforeFemaleTtInfantUpperRuntime`;
nie zmieniają wcześniejszych hashy ani oczekiwań klinicznych. Konkretnie
wykonane testy i wszystkie kontrole GitHub dla końcowego SHA podaje PR.
Niniejsza lista jest kontraktem weryfikacji, nie deklaracją zaliczenia.
