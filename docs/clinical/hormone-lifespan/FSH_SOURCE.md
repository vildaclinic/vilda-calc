# FSH — mediana w tabeli producenta

Zaakceptowana makieta pokazuje krótką, osobną informację o źródle pod
wykresem. Bieżący wynik, przeliczenia, status i oś zakresu Mayo zachowują
dotychczasowy kontrakt. Informacja producenta nie kwalifikuje pacjentki do
nieopisanej kohorty i nie stanowi nowego odniesienia dokładnego wieku.

## Źródło i znaczenie liczb

Roche Diagnostics, **Elecsys FSH**, instrukcja **08932387500V4.0**, **2024-06,
V4.0 English**, 4 strony. Odczytano pełny, oryginalny dokument producenta.
Strona 3, sekcja **Expected values**, kolumna **50th percentile**:

| Grupa źródłowa | Mediana IU/L | Wydrukowane N |
| --- | ---: | ---: |
| Follicular phase — faza folikularna | 6,9 | 376 |
| Ovulation phase — faza owulacyjna | 12,3 | 56 |
| Luteal phase — faza lutealna | 3,6 | 349 |
| Postmenopause — po menopauzie | 67,0 | 181 |

W druku jednostką jest mIU/mL, liczbowo równoważne IU/L. Są to opublikowane
mediany grup, nie średnie ani środki RI. P5/P95 tej tabeli nie są importowane
do zakresów referencyjnych aplikacji. Nie uśredniamy grup i nie sumujemy N.

Źródło nie podaje liczbowego wieku grup, kraju/pochodzenia, rekrutacji,
wyłączeń, dokładnych dni faz ani niezależności uczestniczek i próbek między
grupami. Nagłówek „Test subjects N” nie dostarcza tych brakujących procedur.
Akapit o zdrowych kobietach w wieku rozrodczym opisuje inną analizę — iloraz
LH/FSH z innymi liczebnościami — i nie uzupełnia tej kohorty.

Aktualny test: kanapkowy ECLIA, cobas e402/e801. Dopuszcza surowicę oraz
osocze Li-heparynowe, K2-EDTA i K3-EDTA, ale rzeczywistego materiału grup
z tabeli nie określono. Standaryzacja: Enzymun-Test FSH, pośrednio WHO 2nd
IRP 78/549. Metoda źródła nie potwierdza metody badania pacjentki.

Aktualne LoB/LoD/LoQ wynoszą 0,1/0,3/1 IU/L; zakres pomiarowy 0,3–200.
Nie opisano historycznego uwzględnienia niskich wyników w grupach. Parametry
z aktualnej instrukcji nie odtwarzają cenzury oryginalnej tabeli. Nie
podstawiamy granicy, jej połowy ani dokładnej liczby za wynik nierównościowy.

[Pełny oficjalny dokument](https://elabdoc-prod.roche.com/eLD/api/downloads/1c2e351f-b257-ee11-1f91-005056a772fd?countryIsoCode=be)
oraz [ekstrakt i hash](evidence/fsh-source-audit-2026-10-22.json).

## Kontrakt danych i funkcji

Czytelny `fsh-source-data.json` jest pakowany osobno jako
`VildaHormoneLifespanData.fshSourceData`, poza 85 zwykłymi profilami punktu.
`VildaFshSource.evaluate(data, context)` jest bezpaństwowe i przyjmuje źródło
jako argument. Sukces zwraca `status: 'ready'`, kopię źródła, `group`
(id, label, printedN, definition), `median` (value, unit), `ageDomain: null`,
`placement` i `policy`. Nie zwraca wyniku pacjentki, ilorazu, percentyla,
SDS, werdyktu, RI lub współrzędnych wykresu. Źródło i dane wejściowe nie są
modyfikowane, a zwrócone fakty są od nich odłączone.

Aktualny kontekst kobiety, analit FSH i znana grupa z istniejącego wyboru
FSH „Cykl / menopauza” są wymagane. `cyclePhase` wskazuje wyłącznie wiersz
tabeli. Nie wnioskujemy grupy z wieku lub wyniku ani nie odczytujemy
ukrytego wyboru E2. Istniejący wspólny edytor LH/FSH zachowuje dotychczasowe
zachowanie; karta czyta wybór widoczny przy bieżącym FSH. Menopauza jest
obsługiwaną grupą; 67 IU/L nie rozpoznaje menopauzy.
Nie dodajemy pytania o dzień cyklu, metodę, materiał lub wywiad.

Cały możliwy wiek **powyżej 18 lat** jest wyłącznie jawną regułą
umieszczenia informacji przy kontekście dorosłej kobiety, podobnie jak
aplikacyjny dobór dorosłego FSH. Nie jest domeną wieku badania. `ageDomain`
pozostaje `null` zarówno w źródle, jak i wyniku. Nie wyznaczamy górnej
granicy kohorty ani nie przenosimy 18–37 z badania E2. Przedział `[18,19)`
nie kwalifikuje; `[19,20)` kwalifikuje to umieszczenie. Granica nie zamyka
luki zwykłej mediany FSH u dorosłych kobiet.

Znane przeciwwskazanie, ciąża, leczenie hormonalne/GnRHa, stymulacja,
niezgodny jawny materiał/metoda oraz historyczny kontekst wstrzymują kartę.
Są to konserwatywne reguły aplikacji, nie kryteria autorów, których dokument
nie podaje. Nieznany wywiad pozostaje nieznany. Nie dopisujemy wyłączenia
laktacji lub „naturalnych cykli” z Anckaert. Alias dopuszczonego materiału
opisuje aktualny test, nie dowodzi macierzy kohorty; ogólne „plasma” bez
rodzaju nie jest potwierdzeniem jednego z dopuszczonych osoczy.

W anonimowym bieżącym formularzu dodatni fakt GnRHa może istnieć w lustrze
`shared._vildaPersist.byId.pubertyGnrhaStatus` bez znacznika wizyty Tannera.
Adapter wykorzystuje wyłącznie `w-trakcie` do ukrycia tej karty: wymaga
gotowego, nadal anonimowego kontekstu FSH kobiety i braku daty próbki.
Aktywny formularz ma pierwszeństwo przed starszym autosave. Podczas
odtwarzania/czyszczenia kartę wstrzymujemy. Ten odczyt nie dostarcza danych
wybranemu pacjentowi, nie czyta niepowiązanej pełnej sesji i nie zmienia RI.

Widok musi być zwykłym „Całe życie”, bez porównania płci, z zaznaczonym FSH.
Brak źródła/kontekstu, inna płeć/analit/widok, nieznana grupa, zmiana osoby,
blokada lub niepoprawny wynik nie mogą zachowywać liczby poprzedniej grupy.
Obsługa tożsamości i DOM należy do adaptera; sam evaluator nie ma pamięci.

Prawidłowo sparsowany wynik może być dokładny lub nierównościowy, w tym
`<LOD`/`<LOQ`. Funkcja przyjmuje rzeczywisty obiekt parsera LH/FSH
(`limitKind`) lub znormalizowany `censoring`. Adapter może też przekazać
samo `measurementValid: true`, gdy nie przekazuje obiektu pomiaru. Jawnie
niepoprawny obiekt nie jest zastępowany tą flagą; `measurementValid: false`
zawsze blokuje. Żaden wariant nie nadaje pacjentce dokładnego stężenia.

## Wynik laboratoryjny, ilustracja i historia

Mediana jest tekstem HTML poza SVG. Nie dodaje punktu do osi wieku, nie
zmienia zwykłej geometrii lub kwalifikacji 85 profili i nie tworzy źródła
dla porównania płci. Sam wybór fazy nie ustala dnia cyklu. Odrębna zmiana
skali małego wykresu cyklu FSH pokazuje te same dzienne mediany Stricker;
to inne dane niż mediany grup producenta Roche.

Osobna polityka `fsh-cycle-display-policy.json` zasila opcjonalne
`fshCycleDisplayPolicy`. `cycle.projectionFor(activeIds)` wybiera dla
FSH bez LH liniowe 0–20 IU/L z podziałką 0/5/10/15/20. Samo LH i oba
hormony korzystają z dotychczasowej wspólnej osi 0–50. Włączenie E2 nie
dodaje go do tego podwykresu i nie zmienia wyboru skali dla FSH. Brak lub
wadliwa polityka daje bezpieczne 0–50 z właściwym podpisem. Nie zmieniono
30+30 źródłowych węzłów, interpolacji lub osi dni. Wynik pacjentki ani
mediana Roche nie wpływają na skalę. Nagłówek „Dorosła · cykl miesiączkowy”
jest zgodny z kafelkiem; opis dotyczy wybranych FSH, LH lub obu.

Obecna ocena nierówności FSH pozostaje własnością silnika laboratoryjnego:
w fazie folikularnej `<5` daje porównanie niejednoznaczne, a `<1` pozwala
ustalić „poniżej zakresu”; oba bez dokładnego znacznika. Karta Roche nie
zmienia tych wniosków ani Mayo RI 2,9–14,6. Nie przepisuje P5/P95 Roche.

Nie dodajemy tej informacji do `lab.hormoneReference`, oceny przypiętej do
wizyty ani schematu historii. Dawnych wpisów nie oceniamy ponownie na
podstawie bieżącej grupy, wieku lub nowego źródła.

## Przypadki syntetyczne

- F30, FSH 10 IU/L, znana folikularna → dotychczasowy wynik i Mayo
  2,9–14,6; osobno mediana producenta 6,9 IU/L, N=376 w tabeli.
- Ta sama F30 i 10 IU/L, lutealna → dotychczasowa ocena ponad Mayo
  1,4–8,9; osobno mediana grupy 3,6. Nie wybieramy korzystniejszej normy.
- F55, jawna postmenopauza, 67 IU/L → dotychczasowa ocena Mayo 16–157;
  osobno mediana grupy 67, nie rozpoznanie menopauzy.
- Nieznana grupa → dostępny wynik i cztery neutralne warianty RI,
  bez domyślnej mediany. Wiek 55 ani wartość 67 nie wybierają grupy.
- `<5`, `<1`, `<LOD`, `<LOQ` → zachowany parser i dotychczasowa obsługa
  nierówności; karta źródłowa pozostaje informacją o niezależnej tabeli.

Testy `fsh-source.test.mjs` wywołują rzeczywisty evaluator i parser FSH,
sprawdzają cztery grupy, granicę umieszczenia, brak wieku źródła, jawne
wyłączenia, brak domysłów, aliasy, cenzurę i niezależność danych. Wyniki
testów i kontroli dla finalnego SHA raportuje PR. Nie nadaje to nowemu
odniesieniu statusu walidacji klinicznej.
