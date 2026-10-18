# AMH Xu 2026 — opublikowane P50 jako osobna informacja źródłowa

Stan: 14 października 2026. Właściciel zaakceptował makietę desktopową
oraz mobilną i polecił wdrożenie („jest ok, koduj”). Zakres obejmuje osobny
blok par **wiek publikacji → P50**, z opublikowanymi punktami otaczającymi
możliwy wiek. Nie uruchamia ciągłego modelu Xu ani nowego profilu punktu pacjentki.
Akceptacja makiety i testy techniczne nie oznaczają walidacji klinicznej.

Pełny zapis liczb, lokalizacji, rozbieżności i ograniczeń:
[audyt Xu](evidence/amh-xu-2026-audit.json). Wcześniejszy
[przegląd nieaktywnego źródła](evidence/xu2026-amh-source-review.json)
zachowuje historyczny stan decyzji. Nowy audyt doprecyzowuje ten stan
wyłącznie dla osobnego bloku informacyjnego.

## Źródła i wersje

Xu K, Yang Y, Liu P, Ma S, Zhang C, Liang X, Wu X, Wu X, Cao Z, Yang Y,
Chen F, Li Z, Liu J, Hu Z, Zhu D, Zheng R, Qin Y, Guo T, Chen Z.
*Age-specific anti-Müllerian hormone reference values using an ultrasensitive
assay: Associations with ovarian aging and menopausal transition symptoms.*
Chinese Medical Journal. 2026;XX(XX). Publikacja online: 17.08.2026;
przyjęcie do redakcji: 22.10.2025.
[DOI 10.1097/CM9.0000000000004161](https://doi.org/10.1097/CM9.0000000000004161),
PMID 42608648. Przeczytano pełny dostarczony PDF w składzie wydawcy,
10 stron, z zachowanymi zastępnikami tomu i zeszytu `XX(XX)`.
Pełne imiona autorów zapisano w audycie.

Suplement: `CM9_2026_8_13_Guo_CMJ-2025-2620R1_SDC2.xlsx`,
[odnośnik wydawcy cytowany w artykule](http://links.lww.com/CM9/C922).
Przeczytano dostarczony skoroszyt: 13 arkuszy, 10 tabel zbiorczych i 3
obrazy. Nie zawiera danych indywidualnych, ukrytego modelu ani tabeli
współczynników GAMLSS. Numery nazw arkuszy nie są numerami tabel:
arkusz `2` to Supplementary Table 1, arkusz `3` to Table 2,
arkusz `10` to Table 9, a `Sheet1` to Table 10.

| Dostarczony plik | SHA-256 |
| --- | --- |
| `age-specific-anti-mllerian-hormone-reference-values-using-an.pdf` | `270a6f433274e00a5d1f7dd80c3cd82ee2fd7dd3eced6c8d64df95005552413e` |
| `CM9_2026_8_13_Guo_CMJ-2025-2620R1_SDC2.xlsx` | `2d0724c3f610bddea1a9386d8b82ca30aa6c70ad583dfc1eda7b4f4bdc1d6c1b` |

Oba pliki mają te same sumy kontrolne co wcześniejszy przegląd. Repozytorium
przechowuje ekstrakcję faktów i pochodzenie, bez redystrybucji PDF, XLSX
lub rycin.

## Populacja, metoda i znaczenie liczby

Źródło P50 to przekrojowa, społecznościowa kohorta kobiet przed menopauzą
w Chinach: dobór wielostopniowy klastrowy, 26 dystryktów/powiatów w 12
prowincjach. Autorzy podają 11 227 uczestniczek przed wyłączeniami i 10 543
w zbiorze odniesienia. Deklarowane okno modelu to 35–55 lat; główna tabela
obejmuje także 4 osoby <35 i 42 >55 lat. Nie rozszerza to zastosowania
liczbowego poza opublikowane etykiety 35–55.

PDF s. 2–3 podaje wyłączenie obustronnej ooforektomii, chemio-/radioterapii,
antykoncepcji doustnej lub leczenia hormonalnego w poprzednich 30 dniach
oraz AMH >5 SD od średniej dla wieku. Nie zadeklarowano kohorty wolnej od
PCOS. Próbkę pobierano w losowym dniu cyklu; są to wartości wieku, a nie
normy konkretnych faz. Naturalną menopauzę definiowano jako co najmniej
12 kolejnych miesięcy braku miesiączki bez przyczyn jatrogennych. Sam wiek
nie ustala tego statusu.

Oznaczenie: surowica, **Diagnostic Kit for HS-AMH, Kangrun Biotech**,
ultraczuły test chemiluminescencyjny. Jednostka źródłowa: ng/mL.
LOD = 0,003 ng/mL, górny zakres liniowy 30 ng/mL. Nie podano oddzielnego
LOQ ani liczbowej precyzji analitycznej w pobliżu LOD. Nie wykazano
przelicznika między tym testem a Roche Elecsys, Access lub Gen II.
Konwersja jednostek nie harmonizuje metod oznaczenia.

Osobna kohorta podłużna 2521 kobiet leczonych z powodu niepłodności używała
konwencjonalnego Kangrun z LOD 0,01 ng/mL. Osobna grupa 422 kobiet po
naturalnej menopauzie służyła analizie diagnostycznej. Nie są to dodatkowe
uczestniczki źródłowego profilu przed menopauzą ani podstawa do uniwersalnej
oceny płodności, diagnozy menopauzy lub przewidywania jej terminu.

## Wierna transkrypcja P50

Suplement, arkusz `2`, Supplementary Table 1, `A3:A7` i `E3:E7`:

| Etykieta AGE | Opublikowane P50, ng/mL | Komórka |
| --- | --- | --- |
| 35 | 2.589388343 | `E3` |
| 40 | 1.479539998 | `E4` |
| 45 | 0.365121103 | `E5` |
| 50 | 0.045923937 | `E6` |
| 55 | 0.005234022 | `E7` |

Są to modelowe percentyle 50, nie średnie i nie wyliczone ponownie mediany
uczestniczek pięcioletnich przedziałów. Wszystkie źródłowe cyfry zachowano
w danych; nie oznaczają odpowiadającej im precyzji klinicznej. Widok
zaokrągla do trzech cyfr znaczących i oznacza liczbę symbolem ≈; to
prezentacja opublikowanego oszacowania, nie interpolacja nowych punktów.

Nagłówek tabeli mówi „by 5-year age bands”, ale komórki AGE zawierają
pojedyncze etykiety bez granic przedziałów. Ciągła krzywa suplementu
wspiera interpretację punktów modelu, lecz nie rozstrzyga tego sformułowania.
Nie wolno uznać P50 przy etykiecie 50 za medianę wszystkich kobiet 50–54.

Podano GAMLSS, porównywanie modeli krokowo, AIC z karą k = 2 i R 4.3.3.
Brakuje końcowej rodziny rozkładu, funkcji parametrów zależnych od wieku,
współczynników, pełnej tabeli rocznej i obsługi pomiarów poniżej LOD.
Pięć punktów nie odtwarza tego modelu. Różne interpolacje dają inne liczby
między punktami; żadnej z nich nie aktywowano.

## Rozbieżności potwierdzone w oryginałach

| Miejsce | Potwierdzony fakt | Wniosek i granica wyjaśnienia |
| --- | --- | --- |
| PDF s. 7, Figure 4A i akapit; także abstrakt s. 1 | Rycina oznacza 0,187 i 0,043 jako **Mean**, tekst jako **median**. | Najbardziej prawdopodobna jest pomyłka nazwy statystyki; nie ma autorskiego sprostowania. Nie używamy tych liczb jako median ani nie dopisujemy podgrupy tylko wykrywalnych pomiarów. |
| XLSX `Sheet1!A5:C7`, `10!A9:H11`; PDF s. 7, Figure 4B | `Below LoD: No` ma 523/329, `Yes` 823/93. Rycina przypisuje pierwsze liczby do niewykrywalnych, drugie do wykrywalnych. | Zamiana etykiet No/Yes w tabelach jest silną hipotezą. Nie poprawiamy publikacji ani nie aktywujemy tych rozkładów. |
| PDF s. 7; XLSX `Sheet1!B6:C7` | Tekst podaje χ² = 38,6; wtórne obliczenie z czterech liczebności daje 196,78695, z poprawką Yatesa 195,22377. | Zamiana etykiet nie wyjaśnia różnicy. Inny test lub zbiór nie został wskazany. |
| PDF s. 4, Table 1; XLSX `3!B3:G47` | Suma grup = 10 497, Total = 10 543. Różnica 46 powtarza się we wszystkich 14 blokach cech i odpowiada 4 + 42 osobom poza 35–55. | Mocne wsparcie hipotezy różnych mianowników. Nie ustala faktycznej populacji dopasowania GAMLSS. |
| PDF s. 4, Table 1; XLSX `10!H7`, `Sheet1!B4` | Przed menopauzą, 50–55 lat: 1305 w tabeli głównej, 1346 w obu tabelach suplementu. | Różnica 41 pozostaje niewyjaśniona. |
| PDF s. 5–6, Tables 2–3; odesłanie na s. 4 | Powtórzone charakterystyki kohorty podłużnej, z drobnymi różnicami redakcji i zaokrąglenia. | Żadna z tych tabel nie dostarcza współczynników GAMLSS. |

Te rozbieżności są jawnie zachowanymi ograniczeniami źródła. Nie dotyczą
bezpośrednio transkrypcji pięciu komórek P50, ale ograniczają szersze
wnioski o modelu i jego użyciu. Brak modelu, niejawne cenzurowanie i
nieokreślone LOQ pozostają ważne także dla tabeli P50.

## LOD, cenzurowanie i precyzja

W arkuszu `2` komórki `B6`, `C6`, `B7`, `C7`, `D7` zawierają literalnie
`<0.003`: P2,5/P10 dla 50 oraz P2,5/P10/P25 dla 55 lat. Nie są zerem,
0,003 ani LOD/2. Nie podano, jak takie pomiary potraktowano przy
modelowaniu. P50 dla 55 lat, 0,005234022 ng/mL, leży blisko LOD; zachowanie
źródłowych cyfr nie potwierdza oznaczalności ilościowej z taką dokładnością.

Wynik pacjentki z operatorem zachowuje własny zapis i granicę jej metody.
Blok źródłowy nie nadaje mu dokładnej wartości, punktu, percentyla ani
ilorazu. LOD Kangrun nie staje się progiem każdej próbki AMH.

W tej zmianie **wyłącznie wejście AMH** przyjmuje również nierówności
liczbowe oraz `<LOD` i `<LOQ`. Prezentacja zachowuje operator; dla
nierówności liczbowej może przeliczyć granicę wraz z jednostką, ale
nie przedstawia jej jako dokładnego stężenia. Symboliczne LOD/LOQ
pozostaje bez przypisanej liczby. Nie uruchamiamy nowej klasyfikacji
laboratoryjnej, dokładnego punktu pacjentki ani percentyla dla takiego wyniku.
Składnia innych analitów pozostaje bez zmian.

## Kontrakt osobnego bloku

- Pokazuje wyłącznie opublikowane pary etykieta wieku/P50, z sąsiednimi
  punktami dla wieku między etykietami. Przykładowo dla dokładnych 47 lat:
  45 → 0,365121103 i 50 → 0,045923937 ng/mL. Nie oblicza mediany 47-latki.
- Dwa punkty są informacją o badaniu, nie dolną i górną normą, przedziałem
  ufności ani przedziałem możliwej mediany konkretnej pacjentki.
- Nie wyznacza percentyla wyniku, ilorazu do P50, SDS, progu płodności,
  rozpoznania menopauzy ani klinicznego werdyktu.
- Źródło pozostaje niezależne od Mayo, FDA/Access, geometrii edukacyjnej,
  skali i istniejącego punktu pacjentki. Zmiana wyniku nie dobiera źródła
  i nie zmienia liczb z publikacji.
- Blok nie trafia do `lab.hormoneReference`, nie zmienia dawnych migawek
  i nie jest dopisywany do historii jako odniesienie pacjentki.
- Nie dodaje nowego formularza. Ograniczenia populacji i metody należą
  do opisu źródła, bez potwierdzania nieznanych faktów o pacjentce.

### Dobór wieku i kontekstu — polityka aplikacji

Dane: `vilda_amh_age_reference_data.js`; silnik
`vilda_amh_age_reference.js`, API `evaluate(data, context)`; prezentacja:
`vilda_amh_age_reference_ui.js` i `.css`. Dane źródłowe są osobne od
silnika. `displayUnit` odpowiada docelowej jednostce wyniku; przeliczenie
korzysta z niezmienionej konwersji AMH, bez kalibracji różnych oznaczeń.

Dla całego możliwego wieku `[L,U]` mieszczącego się w 35–55 lat wybieramy
największą etykietę źródłową ≤L oraz najmniejszą ≥U. Nie wybieramy środka
przedziału. Jeśli obie etykiety są identyczne, wyświetlamy jedną: w zwykłym
trybie dotyczy to tylko dokładnego wieku równego opublikowanemu punktowi.
Przykłady: `[45,46)` → 45 i 50; dokładne 47 → 45 i 50;
52 → 50 i 55; dokładne 50 → tylko 50. Wiek wpisany w ukończonych latach
nie staje się dokładną datą urodzin.

Wyjątek informacyjny `terminal-anchor`: dla `L = 55` i `55 < U ≤ 56`
(np. ukończone 55 lat) pokazujemy tylko punkt 55, pod etykietą
**„Ostatni opublikowany punkt wieku”**. Jawna nota informuje, że nie
pokrywa on całego możliwego wieku i że późniejszych punktów nie ma.
Nie podpisujemy go medianą wieku pacjentki ani estymatą dla 56 lat.
Inny wiek wychodzący poza 35–55 ukrywa blok, również dokładne 55,1,
56 lub przedział `[54,9;55,1]`. Ten wyjątek to reguła prezentacji aplikacji,
nie rozszerzenie domeny autorskiego modelu.

Nieznany kontekst cyklu/menopauzy lub nieznana metoda/materiał pozwala
pokazać informację o **źródle przed menopauzą** bez potwierdzania tych
faktów o pacjentce. Znana menopauza, ciąża, leczenie hormonalne,
przeciwwskazanie lub niezgodna metoda/materiał ukrywa blok. Są to
konserwatywne bramki aplikacji; nie przedstawiamy ich wszystkich jako
kryteriów wyłączenia autorów. Nie dodajemy pytań ani domyślnych odpowiedzi.

Cenzurowany AMH może mieć obok informację źródłową tylko do odczytu.
Istniejące „Przypnij do wizyty” zachowuje surowy wynik wraz z operatorem
lub symbolem LOD/LOQ. `lab.valueNum = null` zapobiega traktowaniu granicy
jako punktu serii liczbowej. Nie blokujemy samego zapisu tekstowego wyniku.

Migawka zwykłego odniesienia edukacyjnego ma status `unavailable`:
`measurement.raw` zachowuje wpis, `measurement.sourceValue` jest liczbową
granicą z nierówności (albo `null` dla symbolicznego LOD/LOQ), a
`measurement.value = null` nie udaje pomiaru. Referencja i jej prezentacja
są niedostępne. Źródłowe P50 Xu nie trafiają do tej migawki. Nie zmieniamy
schematu ani dawnych danych historii i nie dodajemy klasyfikacji lub
ilorazu. Granicy wykrywalności nie zapisujemy jako zmierzonego stężenia.

## Kontrole

Audyt potwierdza oryginalne pliki, wszystkie pięć P50, komórki cenzurowane
i rozbieżności powyżej. Testy implementacji mają wywoływać rzeczywiste
funkcje i formularz oraz sprawdzać wiek pośredni, granice, niepewny wiek,
kontekst, jednostki i brak wpływu na wcześniejsze źródła. Wynik pusty,
zero, zwykły, ponad osią i wyczyszczony zachowuje liczby źródła, linię
oraz skalę. Weryfikacja obejmuje desktop, telefon, pełny ekran i PWA/offline.
Wyniki wykonanych testów i kontrole GitHub dla aktualnego SHA opisuje PR;
ten dokument nie ogłasza nieprzeprowadzonych kontroli ani walidacji klinicznej.
