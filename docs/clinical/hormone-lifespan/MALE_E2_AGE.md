# Estradiol chłopców — mediana modelu wieku 6–18 lat

Właściciel zaakceptował prywatną makietę desktopową i mobilną oraz
polecił wdrożenie 25.10.2026, Europe/Warsaw („jest ok, koduj”). Zakres
obejmuje osobną kartę **E2 chłopców 6–18 lat**, z P50 modelu Madsen 2022
i opcjonalnym punktem dokładnego bieżącego wyniku. Karta wykorzystuje
istniejący wiek i płeć; nie dodaje pytań o G/P, metodę, materiał,
leczenie, publikację lub datę próbki.

To zamierzona nowa informacja medyczna i edukacyjne zestawienie wyniku.
Nie jest nowym RI, SDS, centylem pacjenta, progiem diagnostycznym ani
walidacją kliniczną. Istniejące zakresy Mayo/Tietz, konwersje i zapis
wyniku pozostają niezależne. Odległość punktu od P50 nie daje werdyktu
„w normie”, rozpoznania lub ilorazu opisującego stopień nieprawidłowości.

## Pełne źródła i wersje

Madsen A i wsp., *Reference Curves for Pediatric Endocrinology:
Leveraging Biomarker Z-Scores for Clinical Classifications*, JCEM 2022,
[DOI 10.1210/clinem/dgac155](https://doi.org/10.1210/clinem/dgac155),
[PMID 35299255](https://pubmed.ncbi.nlm.nih.gov/35299255/),
[pełny tekst PMC9202734](https://pmc.ncbi.nlm.nih.gov/articles/PMC9202734/).
Sprawdzono Methods, tabelę 1 z przypisami, Results/ryc. 1, Discussion,
oryginalny suplement oraz przywołaną pracę metodyczną E2.

**Supplemental Table 1, wersja 1**, DOI
[10.6084/m9.figshare.17153336.v1](https://doi.org/10.6084/m9.figshare.17153336.v1):
arkusz `LCMSMS hormones`, nagłówek **AA17** „Male Estradiol (E2; pmol/L)”,
AA18:AD18 „Age/L/M/S”, dane **AA19:AD31**, M w **AC19:AC31**. To 13
rocznych węzłów modelu 6, 7, …, 18. Nie są empirycznymi medianami 13
osobnych roczników. Supplemental Table 2 podaje odrębne RI; nie importujemy
ich jako median, norm nowej karty lub reguł stadium.

Bertelsen BE i wsp., *An Ultrasensitive Routine LC-MS/MS Method for
Estradiol and Estrone in the Clinically Relevant Sub-Picomolar Range*,
J Endocr Soc. 2020;4(6):bvaa047,
[DOI 10.1210/jendso/bvaa047](https://doi.org/10.1210/jendso/bvaa047),
[pełny tekst PMC7252770](https://pmc.ncbi.nlm.nih.gov/articles/PMC7252770/),
Methods i tabele 2–3, uzupełnia opis czułości metody BGS2. Nie dostarcza
reguły przygotowania niskich danych do dziecięcego modelu Madsen.

Oryginały pozostają poza repozytorium. SHA-256 użytych kopii:

| Dokument | SHA-256 |
| --- | --- |
| Pełny XML Madsen | `ae2410f0b9998b64c7bc3074455338dbd539300582a92337bf00d3c63cb029ff` |
| Supplemental Table 1 LMS XLSX v1 | `45cd1b63284c9f53a5936abee7ab8d8e6fce13a19025d4e2cbed0e5b3468897e` |
| Pełny XML Bertelsen | `a01544929c8665aa727a9912118b2e5e9847cb46c2f728bbc12d392b15c47ab3` |

[Ekstrakt audytu 24.10](evidence/madsen2022-unused-sex-analytes-audit-2026-10-24.json)
zachowuje M, P50 i komórki. Niezależny ponowny odczyt wszystkich 13
węzłów potwierdził tę samą ekstrakcję; nie jest replikacją populacyjną.
Historyczny audyt oraz jego hashe nie stanowią polityki uruchamiającej
kartę i pozostają zapisem etapu sprzed osobnej akceptacji.

## Model, transformacja i liczby

Autorzy nazywają środkową linię „mean-for-age (p50)”, a w Results
identyfikują z=0 z 50. percentylem. Przykłady K36/K37 jawnie stosują
`LN(SI * 1000000)`, dlatego **P50 = exp(M) / 1000000** w pmol/L.
Nie utożsamiamy M z surowym stężeniem, P50 ze średnią arytmetyczną lub
środkiem RI ani krzywej przekrojowej z trajektorią jednej osoby.

| Wiek węzła [lata] | P50 [pmol/L], skrócona prezentacja |
| --- | ---: |
| 6 | 0,247010133 |
| 7 | 0,379310122 |
| 8 | 0,590343991 |
| 9 | 0,957360769 |
| 10 | 1,657850605 |
| 11 | 3,097426690 |
| 12 | 6,129050070 |
| 13 | 12,181153681 |
| 14 | 22,714698209 |
| 15 | 37,285189756 |
| 16 | 52,529442785 |
| 17 | 64,957675698 |
| 18 | 73,846786175 |

Dane zachowują pełną precyzję odwróconego M. UI pokazuje medianę ze
znakiem przybliżenia i **dwiema cyframi znaczącymi**; nie zwiększa to
precyzji analitycznej ani nie zmienia zasad prezentacji głównego wyniku.
Nie odzyskano ciągłego obiektu autorskiego dopasowania. **PCHIP na 13
P50 jest zaakceptowaną interpolacją aplikacji**, wspólną dla krzywej
i liczbowego odczytu, nie rekonstrukcją pełnego LMS/GAMLSS. Poza domeną
nie ma ekstrapolacji, stałego ogona lub najbliższej zastępczej mediany.

Przykład z-score L37 w arkuszu używa obcego AB13 w mianowniku.
Nie zmienia to lokalizacji zera licznika i odwrócenia M. Nie kopiujemy
tego przykładu, L/S, pełnego SDS ani innych centyli. Publiczny skrypt
autora demonstruje SHBG; nie dowodzi preprocessingu E2. Dokumentacja
pakietu `gamlss` również nie uzupełnia brakującej reguły cenzury.

## Populacja, dwie metody i ograniczenia niskiego E2

Norweskie badanie przekrojowe łączy BGS2 2016 (6–<16 lat) z Fit Futures 1
2010–2011 (15–18 lat). Tabela 1 podaje **414 i 491** dostępnych męskich
próbek dla referencji. Nie są wykazanym N dopasowania E2, liczbą każdego
rocznika lub ilościowo oznaczonych obserwacji ponad LLOQ. Model łączy
stadia pokwitania; nie jest modelem wyłącznie G1/G3. Materiałem była
surowica, pobrania 08–14. Nie utożsamiamy tej populacji i metody z każdą
polską próbką lub oznaczeniem E2.

| Metoda źródłowa | Znane ograniczenia ilościowego oznaczenia |
| --- | --- |
| BGS2, ultrasensitive LC-MS/MS | LLOQ **0,58 pmol/L**. U Bertelsen CV **15% przy LOQ**; CV **9,1% przy QC 1,7 pmol/L** nie opisuje P50 0,25–0,59. Końcowy LOD to **<0,28**, nie dokładnie 0,28. |
| Fit Futures, LC-MS/MS o pośredniej czułości | LLOQ **13 pmol/L**, zakres 13–2508, CV 13% przy 57. Nie opisano tu CV przy 13 lub bardzo niskim E2. |

Obie metody są identyfikowalne do CRM BCR-576. Madsen raportuje R²=0,96,
średnią różnicę 1,7%, t-test P=0,053 i połączenie bez korekty, ale nie
podaje w tym miejscu N ani zakresu próbek równoległych. Bertelsen opisuje
osobne porównanie 62 próbek 13–224 pmol/L, `y=1,065x+3,755`, R=0,981.
Nie wykazano tożsamości tych eksperymentów. Nie przenosimy N/zakresu
jednego do drugiego i nie deklarujemy równoważnej precyzji poniżej 13.

W pełnym tekście, suplemencie i kodzie nie znaleziono jawnej reguły
cenzury/imputacji danych E2 poniżej LLOQ/LOD, ich liczby według wieku
i płci ani osobnego pasma niepewności estymatora niskiego P50. Nie
twierdzimy, że takich liczbowych danych nie było. Nie kopiujemy reguły
raportowania `<0,6` z Bertelsen jako preprocessingu dziecięcego LMS.

P50 wieku 6 i 7 leży poniżej LLOQ BGS2, a wieku 8 tylko nieznacznie
powyżej. **LOQ próbki nie jest automatyczną podłogą mediany modelu.**
Zachowujemy pełny opublikowany model [6,18]; nie podstawiamy 0, 0,58,
13 lub LOQ/2 i nie dodajemy progu 8/9 lat. Jednocześnie samo opublikowanie
P50 poniżej LLOQ nie potwierdza jej małej niepewności. Przekroczenie
0,58 nie jest zwalidowaną granicą jakości modelu, a CV pomiaru nie jest
błędem P50. Z zapisu LOD <0,28 nie rozstrzygamy, czy P50 sześciolatka
0,247 leży poniżej LOD. Ograniczenia pozostają jawne w źródłach.

## Dane, silnik i kwalifikacja kontekstu

Osobne `male-e2-age-data.json` oraz `male-e2-age-policy.json` są pakowane
przez `build_runtime.py` do `maleE2AgeData` i `maleE2AgePolicy`.
`VildaMaleE2Age.evaluate(data, policy, context)` używa produkcyjnych
`VildaHormoneLifespanReference.referenceAt/sampleProfile`, istniejącego
lexera z mapą jednostek E2 oraz `LabUnitConverter` do konwersji. Nie
pożycza parsera, jednostek lub współczynników testosteronu.

To osobny blok **poza rejestrem 85 zwykłych profili**. Nie zmienia
`patientPointData`, `maleHormones`, żeńskiego E2/TT lub porównania płci.
`clinicalReferenceActivation: false` oznacza brak nowego RI;
`patientComparisonEnabled: true` jawnie włącza nową edukacyjną informację.
Nie jest to deklaracja braku wpływu klinicznego.

Gotowy wynik rozdziela źródło/politykę, `median`, `ageContext`, stałą
`curve`, 13 `knots`, `plot` i `comparison.patientPoint`. Wartości ekranu
są w `displayUnit`, a `sourceValue` zachowuje źródłowe pmol/L. Wynik
niedostępny ma przyczynę, `median: null`, puste krzywą/węzły i brak
punktu; nie zachowuje liczby poprzedniej osoby lub sąsiedniego wieku.

Wymagane są bieżący `sourceStatus: 'ready'`, analit `estradiol`, płeć
`male`, `contextBasis: 'current-patient'`, brak datowanej próbki oraz
jawne `ageYears`, `ageUpperYears`, boolean `ageUpperInclusive`.
**Cały znany przedział musi mieścić się w [6,18].** Nie domyślamy
górnej granicy, domknięcia, daty urodzenia lub środka przedziału.
Odczyt dotyczy wpisanej dolnej granicy, z właściwym podpisem:

- `[12,13)` kwalifikuje i odczytuje P50 przy 12; nie staje się dokładnym wiekiem.
- 12,5 daje około **8,699139831867987 pmol/L** przez PCHIP aplikacji.
- `[17,18)` kwalifikuje. Dokładne 18 jest ostatnim węzłem; `[18,19)`
  i 18 lat 0 miesięcy jako `[18,18+1/12)` nie mieszczą się w źródle.
- 3/75 lat, brak lub niepełny wiek nie otrzymują zastępczej mediany.

Nieznane G nie blokuje modelu wieku. Znana obserwacja G może służyć
niezależnym RI, ale nie zmienia P50 i nie jest wnioskowana z wieku/P.
Znane GnRHa, leczenie hormonalne/stymulacja oraz niezgodna jawnie
raportowana metoda lub materiał wyłączają nowe zestawienie. To bramki
produktu, nie dopisywane literalne kryteria wykluczenia autorów.
Brak wywiadu pozostaje nieznany; nie powstaje dodatkowa ankieta ani
badge „metoda niepotwierdzona”. Metoda/materiał źródła nie są faktami
o próbce pacjenta.

Adapter musi obsługiwać dodatni fakt GnRHa także u chłopca i aktualnego
anonimowego formularza; żeńskie helpery nie spełniają tego samodzielnie.
Przenoszony dodatni fakt aktualnego leczenia musi zachować tożsamość,
płeć i bieżący kontekst. Metody, materiału, protokołu lub daty innej
próbki nie wolno przenosić z oceny TT. Zmiana osoby/płci/analitu, lock,
przygotowanie lub utrata kontekstu i historia usuwają stare liczby
oraz pełny ekran. Stan nie trafia do historii, snapshotu, autosave,
`lab.hormoneReference`, eksportu lub synchronizacji.

## Prezentacja i niezależny wynik

Jedna karta ma źródła domyślnie zwinięte. Stała liniowa oś **0–100 pmol/L**
i jej równoważne konwersje nie zależą od pacjenta, wartości, czyszczenia
lub szerokości. Pięć istniejących jednostek E2 to pmol/L, nmol/L, pg/mL,
ng/L i ng/dL; dotychczasowy faktor 1 pg/mL = 3,671 pmol/L pozostaje
regułą konwertera, nie nową kalibracją metod.

Jasny znacznik jest P50, czerwony dokładnym wpisem. Odcinek P50 poniżej
źródłowego 0,58 może być delikatnie kreskowany z krótką notką o metodzie
publikacji. To adnotacja ograniczenia źródła, nie pasmo ufności, RI,
próg próbki lub odcięcie jakości w chwili przejścia przez tę liczbę.
Nie rysujemy poziomego progu LOQ pacjenta i nie podnosimy krzywej do niego.

Dokładne **0 i 0,4 pmol/L** pozostają prawdziwymi punktami, także gdy
modelowe P50 jest poniżej źródłowej LLOQ. Nie nadaje to dowolnemu wpisowi
potwierdzenia jakości ilościowej. Wynik ponad osią ma strzałkę i prawdziwą
liczbę, bez przycięcia. `<…`, `>…`, `≤…`, `≥…`, `<LOD` i `<LOQ` zachowują
operator, bez dokładnej kropki lub imputacji. Sama P50 może pozostać.

Przy braku wieku, wieku poza źródłem lub znanym wyłączeniu karta pokazuje
neutralny powód bez mediany/krzywej/punktu. Zła płeć/analit, historia lub
niedostępny bieżący kontekst ukrywają ją i czyszczą stan. Niezależne
Mayo/Tietz i konwersje zachowują dotychczasowy kontrakt; ta karta nie
tworzy norm dla leczenia ani nie zmienia kwalifikacji istniejących RI.

## Przypadki i wymagana regresja

Regresje wywołują rzeczywistą funkcję produkcyjną i adapter HTML, nie
kopię PCHIP, lexera lub wzoru konwersji. Oczekiwane przypadki:

| Fikcyjne wejście | Oczekiwane zachowanie |
| --- | --- |
| M6, dokładne 0,4 pmol/L | P50 0,24701013272002922, punkt 0,4; źródłowa LLOQ nie jest podłogą próbki |
| M7 / M8 | P50 0,37931012200885605 / 0,5903439912846601; bez progu 8/9 lat |
| M12, 20 pmol/L | P50 6,129050070456699, osobny punkt 20; niezależne istniejące Mayo bez zmian |
| M12,5 | P50 8,699139831867987, interpolacja aplikacji |
| Wszystkie 13 rocznych węzłów | Dokładnie te same odwrócone M i komórki AC19:AC31 |
| Puste → 0 → P50 → 150 → wyczyszczenie | Stała krzywa/skala; 0 na osi, 150 ze strzałką; usunięty poprzedni punkt |
| `<5`, `>5`, `≤5`, `≥5`, `<LOD`, `<LOQ` i zmiana jednostki | Literalny operator, brak dokładnego punktu lub granicy udającej pomiar |
| Dokładne 18 / `[17,18)` / `[18,19)` | Pierwsze dwa kwalifikują; ostatni bez mediany |
| 3 / 75 / brak wieku lub jego górnej granicy/domknięcia | Bez zastępczej P50 i bez ekstrapolacji |
| Znane GnRHa, leczenie/stymulacja, niezgodna metoda/materiał | Bez nowego porównania; bez pytania lub automatycznej zmiany RI |
| Inna osoba/płeć/analit, lock, spóźniony kontekst, historia | Bez starej liczby, przypisania dzisiejszego wieku lub nowego zapisu |

Kontrole obejmują wszystkie jednostki, niezmienność 85 zwykłych profili
i wcześniejszych pól runtime, desktop i 320/390 px, czytelność osi,
klawiaturę, pełny ekran/Escape, focus trap i zwinięte źródła. PWA wymaga
instalacji/aktualizacji oraz zimnego startu po zamknięciu przeglądarki
i wyłączeniu serwera. Wykonane wyniki lokalne i wszystkie kontrole GitHub
dla końcowego SHA raportuje PR. Ten dokument nie przedstawia planowanej
regresji jako już zaliczonych testów; akceptacja zakresu nie jest walidacją
kliniczną modelu lub całego połączenia źródeł.
