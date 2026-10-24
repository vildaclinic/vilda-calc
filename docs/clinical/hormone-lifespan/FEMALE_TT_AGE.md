# Testosteron całkowity dziewcząt — mediana wieku 6–18 lat

Właściciel zaakceptował makietę desktopową i mobilną oraz polecił jej
wdrożenie 24.10.2026 („jest ok, koduj”). Zakres obejmuje jedną osobną
kartę **TT dziewcząt 6–18 lat**, z medianą modelu Madsen 2022 i opcjonalnym
punktem wpisanego wyniku. Wiek i płeć pochodzą z istniejącego formularza;
nie dodano pytań o Tanner, cykl, metodę lub wywiad.

To zamierzona nowa informacja medyczna i edukacyjne odniesienie wyniku.
Nie jest nowym zakresem referencyjnym (RI), SDS, centylem pacjentki,
progiem diagnostycznym ani walidacją kliniczną modelu. Niezależna ocena
laboratoryjna Mayo i istniejące konwersje pozostają własnymi warstwami.

## Pełne źródło i pochodzenie danych

Madsen A i wsp., *Reference Curves for Pediatric Endocrinology:
Leveraging Biomarker Z-Scores for Clinical Classifications*, JCEM 2022,
[DOI 10.1210/clinem/dgac155](https://doi.org/10.1210/clinem/dgac155),
[PMID 35299255](https://pubmed.ncbi.nlm.nih.gov/35299255/),
[pełny tekst PMC9202734](https://pmc.ncbi.nlm.nih.gov/articles/PMC9202734/).
Sprawdzono Methods (kohorty, oznaczenia, modelowanie), tabelę 1 i jej
przypisy, Results/ryc. 1, Discussion oraz oryginalne suplementy.

**Supplemental Table 1, wersja 1**, DOI
[10.6084/m9.figshare.17153336.v1](https://doi.org/10.6084/m9.figshare.17153336.v1),
arkusz `LCMSMS hormones`: nagłówek `AF1` identyfikuje żeński testosteron
całkowity w nmol/L. Zakres **`AF3:AI15`** zawiera 13 wierszy wieku
6, 7, …, 18 oraz L/M/S. Wartości M pochodzą z **`AH3:AH15`**. Nie są
to pomiary wolnego testosteronu ani mediany 13 empirycznych grup wieku.
Supplemental Table 2 (`Ark2`) podaje odrębne nieparametryczne RI; nie
importujemy ich jako mediany, normy nowej karty lub reguł stadium.

Oryginały pozostają poza repozytorium. SHA-256 użytych kopii:

| Dokument | SHA-256 |
| --- | --- |
| Pełny XML artykułu | `ae2410f0b9998b64c7bc3074455338dbd539300582a92337bf00d3c63cb029ff` |
| Supplemental Table 1 LMS XLSX | `45cd1b63284c9f53a5936abee7ab8d8e6fce13a19025d4e2cbed0e5b3468897e` |
| Supplemental Table 2 RI XLSX | `9457d3179d1287d746f7fc8a26f1caa6dde12d38a6405a1f0436f63d8a37b3b9` |

[Ekstrakt audytu 24.10](evidence/madsen2022-unused-sex-analytes-audit-2026-10-24.json)
zachowuje pełne M, P50, komórki i ograniczenia. Niezależne powtórzenie
odczytu 26 węzłów obu audytowanych analitów jest kontrolą ekstrakcji
tego samego źródła, nie niezależną replikacją populacyjną.

## Statystyka, transformacja i 13 węzłów

Artykuł używa sformułowania „mean-for-age (p50)”, ale identyfikuje z=0
z 50. percentylem. Przykłady arkusza `K36/K37` jawnie obliczają
`LN(SI * 1000000)`. Dlatego **`P50 = exp(M) / 1000000`** w oryginalnej
jednostce nmol/L. To mediana modelu wieku, nie średnia arytmetyczna
stężeń, nie środek RI i nie trajektoria pojedynczej pacjentki.

| Wiek węzła [lata] | P50 [nmol/L], skrócona prezentacja |
| --- | ---: |
| 6 | 0,055406420 |
| 7 | 0,078300542 |
| 8 | 0,110296558 |
| 9 | 0,155459777 |
| 10 | 0,220168105 |
| 11 | 0,310371551 |
| 12 | 0,425028157 |
| 13 | 0,549075299 |
| 14 | 0,658479382 |
| 15 | 0,739978702 |
| 16 | 0,793352560 |
| 17 | 0,831358479 |
| 18 | 0,869047786 |

Dane produkcyjne zachowują pełną precyzję odwróconych M; liczba cyfr
obliczenia nie zwiększa dokładności analitycznej badania. UI stosuje
ograniczoną precyzję i znak przybliżenia. Nie odzyskano ciągłego obiektu
autorskiego dopasowania. **PCHIP na 13 P50 jest zaakceptowaną polityką
interpolacji aplikacji**, wspólną dla krzywej i odczytu mediany. Nie jest
przywróceniem pełnego LMS/GAMLSS. Węzły nie zmieniają się, a poza ich
domeną nie powstaje ekstrapolacja lub stałe zakończenie.

Przykład z-score `L37` w oryginalnym arkuszu używa obcego L w mianowniku.
Nie zmienia to lokalizacji zera licznika i odwrócenia M, lecz tego
przykładu nie kopiujemy. Nie importowano L/S, kalkulatora SDS, innych
centyli lub RI z błędnego przykładu.

## Populacja, materiał, metoda i granice uogólnienia

Norweskie badanie przekrojowe łączy BGS2 2016 (6–<16 lat) oraz Fit Futures 1
2010–2011 (15–18 lat). Tabela 1 podaje **601 i 319** dostępnych żeńskich
próbek w kohortach. Nie są to wykazane N dopasowania TT lub każdego
rocznika; nie prezentujemy ich sumy jako N920 modelu. Partycypacja BGS2
wynosiła 43%, Fit Futures 93%; populacja była głównie biała. Nie
utożsamiamy jej z populacją polską ani uniwersalnym wzorcem każdej metody.

**Surowica, multipleks LC-MS/MS**, oznaczenia w Haukeland, pobrania
**08–14**. Autorzy odnotowali wyższy TT przed 10 w pokwitaniu; model wieku
nie rozdziela pory dnia. Łączy stadia i nie jest modelem Th/P ani wczesnej
fazy folikularnej. Sam wpis Th nie zmienia mediany dla wieku.

Wykluczano samozgłoszone choroby przewlekłe/nowotwory; Methods BGS2
wymienia także padaczkę. Przypis tabeli 1 mówi o wykluczeniu doustnej
antykoncepcji ze wszystkich żeńskich odniesień biomarkerów (BGS2 N12,
Fit Futures N167). Osobne RI „Ethinylestradiol” suplementu 2 nie są
częścią tego modelu P50. Nieznany wywiad pacjentki nie potwierdza braku
antykoncepcji lub leczenia. Wyłączenia glikokortykosteroidów specyficzne
dla kortyzolu nie są dopisywane jako literalne kryteria modelu TT.

**Źródłowa LLOQ TT = 0,02 nmol/L.** Wszystkie 13 P50 leży ponad nią.
Nie znaleziono jednoznacznego opisu reguły cenzury/imputacji niskich
obserwacji, ich liczby według wieku lub osobnego LOD. Brak opisu nie
potwierdza braku cenzury. CV między seriami 4% opisano dla 1,5–37 nmol/L;
nie przypisujemy tej precyzji żeńskim P50 poniżej 1,5. Granica źródłowej
metody nie staje się LOD/LOQ próbki pacjentki, a zgodność jednostek nie
harmonizuje różnych oznaczeń.

## Dane, silnik i kwalifikacja bieżącego kontekstu

`female-tt-age-data.json` zawiera źródło i liczby, a
`female-tt-age-policy.json` jawne reguły. `build_runtime.py` pakuje je jako
`VildaHormoneLifespanData.femaleTtAgeData` i `.femaleTtAgePolicy`.
`VildaFemaleTTAge.evaluate(data, policy, context)` przyjmuje dane jako
argumenty i używa niezmienionych produkcyjnych funkcji
`VildaHormoneLifespanReference.referenceAt` / `sampleProfile` na osobnym
obiekcie danych. Konwersje korzystają z istniejącego modułu TT.

Gotowy wynik rozdziela źródło/politykę, `median`, `ageContext`, stałą
`curve`, 13 `knots`, geometrię `plot` i `comparison.patientPoint`.
Wartości prezentacyjne są w wybranym `displayUnit`; `sourceValue`
zachowuje stężenie w źródłowym nmol/L. Wynik niedostępny ma powód,
`median: null`, pustą krzywą/węzły i brak punktu, więc nie pożycza
poprzedniej liczby. Metadane źródła mogą pozostać przy neutralnym stanie
braku wieku lub znanego wyłączenia. `visible: false` usuwa widok przy
niezgodnej płci/analicie, niedostępnym lub historycznym kontekście.
`clinicalReferenceActivation: false` oznacza brak nowego laboratoryjnego
RI; `patientComparisonEnabled: true` jawnie włącza osobne edukacyjne
porównanie. Nie jest to deklaracja braku zmiany informacji medycznej.

To **osobny blok poza rejestrem 85 zwykłych profili**. Nie zastępuje
`patientPointData`, nie dodaje 86. profilu zwykłego wykresu i nie
rozszerza porównania płci. Męski TT oraz pozostałe hormony zachowują swoje
kontrakty. Nowa karta dotyczy wyłącznie aktualnego żeńskiego TT.

Cały znany przedział od `ageYears` do `ageUpperYears`, z zachowaniem
`ageUpperInclusive`, musi mieścić się w **[6,18]**. Nie wybieramy środka
wieku ani tylko dostępnej części. Brak wymaganej dokładności nie tworzy
zastępczej liczby. Odczyt jest liczony przy dolnej granicy wpisanego wieku
z podpisem **„Mediana dla wpisanego wieku”**; nie oznacza to odzyskania
nieznanej daty urodzenia.

Kontekst musi jawnie wskazywać `sourceStatus: 'ready'`, płeć żeńską,
`testosterone_total`, `contextBasis: 'current-patient'` oraz pełne granice
wieku. Sama dolna liczba lat lub obecność przykładu na wykresie nie
ustanawia dokładnego przedziału; nie jest dopisywany automatyczny górny
kraniec, DOB lub domyślny wiek dorosły.

- `[12,13)` kwalifikuje i odczytuje P50 przy 12; przedział nadal jest jawny.
- Wiek 12,5 daje około **0,4874143269614546 nmol/L** z PCHIP, nie z liniowej
  interpolacji lub nowego dopasowania biologicznego.
- `[17,18)` mieści się w domenie. Dokładne 18 jest ostatnim węzłem;
  ukończone 18 jako `[18,19)` lub 18 lat 0 miesięcy jako `[18,18+1/12)`
  wykracza poza dane i nie otrzymuje mediany.
- Dla 3/75 lat, braku wieku lub niepełnego przedziału nie dobieramy
  najbliższego węzła, zera lub dorosłej wartości zastępczej.

Źródło jest dobierane automatycznie. Znana niezgodna metoda/materiał,
OCP, egzogenne androgeny/steroidy płciowe, GnRHa, ciąża lub stymulacja
wstrzymują to porównanie według jawnej polityki. OCP jest wyłączeniem
źródłowym; pozostałych konserwatywnych bramek produktu nie opisujemy jako
literalnych kryteriów autorów. Nieznane dane pozostają nieznane i nie
prowadzą do nowej ankiety. Bieżący wiek i wywiad nie są przypisywane
historycznej próbce.

Zmiana osoby, płci, analitu, wieku lub dostępności/odblokowania kontekstu
usuwa nieaktualne liczby. Brak gotowego bieżącego kontekstu i wynik
historyczny nie mogą pożyczyć dzisiejszej mediany. Stan nie jest zapisywany
w karcie, migawce `lab.hormoneReference`, synchronizacji lub historii.

## Wykres i odrębność normy

`VildaFemaleTTAgeUI` pokazuje jedną kartę bez dodatkowych selektorów.
Źródła „O wykresie i źródła” są początkowo zwinięte. Krzywa obejmuje tylko
6–18 lat, bez fikcyjnego niemowlęctwa lub dorosłego ogona. Stała oś wynosi
**0–1,2 nmol/L**, z równoważnymi wartościami po konwersji wyświetlanej
jednostki. Wynik, wiek, rozmiar ekranu i wyczyszczenie nie zmieniają
krzywej lub osi. To skala prezentacji, nie zakres normy.

Jasny znacznik przedstawia źródłową P50, czerwony rzeczywisty dokładny
wynik. Zero pozostaje na osi. Wynik ponad osią otrzymuje strzałkę i swoją
prawdziwą wartość; nie jest przycinany do 1,2 lub przeskalowywany do
normy. Wyniki `<…`, `>…`, `≤…`, `≥…`, `<LOD` lub `<LOQ` zachowują operator,
bez dokładnej kropki, imputacji zera, połowy granicy lub przedstawienia
granicy jako pomiaru. Sama informacja o P50 może pozostać dostępna.

Przy wieku poza zakresem lub znanym wyłączeniu karta pokazuje neutralny
powód bez krzywej, mediany i punktu tej pacjentki. Dla niewłaściwej płci/
analitu, zablokowanego lub historycznego kontekstu nowy widok jest ukrywany.
Niezależne konwersje i ocena Mayo działają według dotychczasowych reguł;
znane OCP może wyłączyć także RI w realnym silniku Mayo. Nie utrzymujemy
sztucznego zielonego werdyktu, gdy dotychczasowa ścieżka zwraca niedostępność.

Mayo ma m.in. dolny kraniec `<7 ng/dL`, nie potwierdzone minimum lub
LOD/LOQ. Nie zastępujemy go zerem ani nie wnioskujemy normy z mediany
Madsena. Przykładowa 12-latka z 0,65 nmol/L jest powyżej P50 około 0,425,
a niezależny Mayo preview ma status `within`. Dla 0,1 może być
`indeterminate` z powodu nieokreślonego dolnego krańca. Ta karta nie
zmienia tych stanów.

## Przypadki i wymagana regresja

Regresje mają wywoływać rzeczywiste `VildaFemaleTTAge.evaluate` oraz
produkcję UI/adaptera; nie kopię PCHIP lub konwersji. Oczekiwane zachowania:

| Fikcyjne wejście | Oczekiwane zachowanie |
| --- | --- |
| F12, TT 0,65 nmol/L, bieżący kontekst | P50 0,42502815745885664, osobny punkt 0,65; niezależne Mayo bez zmian |
| F12,5 | P50 0,4874143269614546; pełny możliwy wiek nadal musi pasować |
| Każdy źródłowy węzeł 6…18 | Ta sama P50 jak odwrócone M z odpowiedniej komórki AH |
| F12: puste → 0 → P50 → 5 → wyczyszczenie | Stała krzywa i oś; 0 na osi, 5 ze strzałką i liczbą; brak starego punktu po czyszczeniu |
| F12, `<0,1 nmol/L` i odpowiadająca zmiana jednostki | Nierówność zachowana w liczbie/opisie/konwersjach; bez dokładnego punktu |
| Dokładne 18 / `[17,18)` / `[18,19)` | Pierwsze dwa kwalifikują; ostatni bez mediany, bez przedłużania modelu |
| 3 / 75 / brak wieku | Brak zastępczej P50; dotychczasowy wynik/konwersje pozostają |
| Znane OCP/GnRHa, inny materiał/metoda, ciąża/stymulacja | Brak tego porównania, bez nowego pytania lub ignorowania znanej niezgodności |
| Inna osoba/płeć/analit, blokada, odtworzenie dawnej wizyty | Bez poprzedniej mediany, bieżącego wieku przypisanego historii lub zapisu nowej P50 |

Kontrole obejmują desktop i 320/390 px, klawiaturę, pełny ekran/Escape,
zwinięte źródła, brak przewijania poziomego, instalację/aktualizację SW
i zimny start po zamknięciu przeglądarki oraz wyłączeniu serwera.
Konkretne wyniki lokalnych testów i wszystkich kontroli GitHub dla
końcowego SHA raportuje PR po ich zakończeniu. Dokument nie przedstawia
planowanej weryfikacji jako wykonanych testów. Akceptacja zakresu przez
właściciela nie jest walidacją kliniczną modelu lub całego połączenia źródeł.
