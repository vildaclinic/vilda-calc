# Ca/Cit — wapń do cytrynianów w moczu

Stan źródeł: **05.11.2026**. Właściciel zaakceptował
[makietę przed/po desktop/mobile](https://vilda-ca-cit-20261105.maciej-flader.chatgpt.site)
i polecił implementację („ok, koduj”). Baza implementacji:
`9680f1ba`. Jest to zmiana kliniczna i funkcjonalna: dokładniejsza
konwersja wapnia, gotowy iloraz, jednostki, pediatryczne porównanie
źródłowe oraz walidacja zmieniają możliwy wynik lub jego ocenę.
Akceptacja zakresu i testy nie nadają algorytmowi statusu niezależnej
walidacji klinicznej.

## Minimum danych i znaczenie ilorazu

Wybór obliczenia pozostaje **`Ca_Cit`**. Domyślne
**„Oblicz ze stężeń”** ma tylko wapń, następnie cytryniany z tej samej
wymieszanej dobowej zbiórki moczu. Domyślne jednostki to odpowiednio
**mmol/L** i **mg/dL**. Alternatywne **„Gotowy wynik Ca/Cit”** wymaga
jednego raportowanego ilorazu **mg/mg** albo **mmol/mmol**.

Nie wymaga się objętości, czasu, kreatyniny, masy, wzrostu, BSA ani
wyników krwi. Wiek i płeć pobiera się z dostępnego kontekstu pacjenta
wyłącznie do porównania z tabelą. Ich brak nie blokuje liczby i nie
tworzy dodatkowej ankiety o wiek, materiał, chorobę lub leczenie.
Nie dodaje się checkboxa kompletności zbiórki, AKI lub IFCC.

`Ca/Cit = U_Ca / U_Cit`, po sprowadzeniu stężeń do zgodnych jednostek.
Wspólna objętość i czas skracają się; ilorazu **nie mnoży się przez
24/czas**. Iloraz stężeń i ilości z tej samej zbiórki jest algebraicznie
jednakowy. Nie dowodzi to wymienności klinicznych norm DZM, frakcji
12-godzinnej i próbki jednorazowej.

Ca/Cit nie jest Ca/Cr, Cit/Cr ani stosunkiem klirensów Ca i kreatyniny
(CCCR). Sam wysoki iloraz nie rozstrzyga, czy pacjent ma hiperkalciurię,
hipocytraturię, oba zaburzenia albo żadne według ich odrębnych kryteriów.
Nie rozpoznaje kamicy, nie określa indywidualnego prawdopodobieństwa
złogu i nie ustala dawki cytrynianów lub skuteczności leczenia.

## Jednostki i jawna granica konwersji

Wapń przyjmuje **mmol/L, µmol/L, mg/L lub mg/dL**. Cytryniany mają
cztery unikalne jednostki: **µmol/L, mmol/L, mg/L, mg/dL**.
Wybór jednostki określa znaczenie liczby przepisanej z raportu;
sam nie przelicza wartości pola ani masy cytrynianów na mole.

| Natywne wejście cytrynianów | Rachunek | Główna jednostka |
|---|---|---|
| mg/L lub mg/dL | Ca [mg/L] / cytryniany [mg/L] | mg/mg |
| mmol/L lub µmol/L | Ca [mmol/L] / cytryniany [mmol/L] | mmol/mmol |
| Gotowy iloraz | Zachowanie liczby i zadeklarowanej jednostki | mg/mg albo mmol/mmol |

Stała wapnia to **40,078 mg/mmol**, zatem **1 mmol/L =4,0078 mg/dL**.
Pełną kartę [NIST, calcium, CAS 7440-70-2](https://webbook.nist.gov/cgi/cbook.cgi?ID=7440-70-2)
z masą 40,078 g/mol odczytano 02.11.2026 w audycie
[Mg/Ca](MAGNESIUM_CALCIUM.md). Liczby g/mol i mg/mmol są równoważne.
Dokładna arytmetyka oznacza działania na zadeklarowanej stałej,
nie nieograniczoną precyzję oznaczenia laboratoryjnego.

Poprzedni helper używał mnożnika **4**, dlatego Ca 2 mmol/L i
cytryniany 40 mg/dL dawały **0,200 mg/mg**. Nowy rachunek daje
**0,20039 mg/mg**: wzrost o **0,195%**. To zmiana liczbowa o możliwym
wpływie na ocenę blisko granicy, a nie samo formatowanie. Wspólny
legacy helper dla innych wzorów nie otrzymuje tej zmiany przy okazji.

**Nie przelicza się cytrynianów mg ↔ mole ani normy mg/mg na
mmol/mmol przez 192,12, 189,10 lub 210,14 mg/mmol.** Pełny Kirejczyk
2014 podaje producenta R-Biopharm, bez numeru zestawu i jednoznacznej
podstawy masy: kwas, jon lub monohydrat. Nazwa producenta, oznaczanie
jonu metodą enzymatyczną ani konwencja późniejszego badania nie
rozstrzygają sposobu raportowania w tym źródle.

Przyjęte porównanie **mg/mg** pozostaje orientacyjnym porównaniem
z oryginalnym zapisem publikacji. Nie potwierdza zgodności metody
i konwencji masowej laboratorium pacjenta. Znany niezgodny profil
nie dostaje normy przez ukryte przeliczenie. Wynik molowy pozostaje
liczbą **mmol/mmol**, z konkretnym wyjaśnieniem braku porównywalnej
normy i neutralną oceną. Nie ma dodatkowego selektora postaci
cytrynianów; polityka tego ilorazu różni się od dobowej ilości
cytrynianów i Cit/Cr.

## Jedyny automatyczny profil: zdrowa kohorta pediatryczna DZM

**Kirejczyk JK, Porowski T, Konstantynowicz J, Kozerska A,
Nazarkiewicz A, Hoppe B, Wasilewska A.** *Urinary citrate excretion
in healthy children depends on age and gender*. Pediatr Nephrol
2014;29:1575–1582. [DOI 10.1007/s00467-014-2806-7](https://doi.org/10.1007/s00467-014-2806-7),
[PMCID PMC4147207, pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC4147207/),
[tabela 2](https://link.springer.com/article/10.1007/s00467-014-2806-7/tables/2),
**s. 1579, wiersz Calcium/citrates (mg/mg)**. Pełny tekst,
Methods i tabela zweryfikowane 05.11.2026; publikacja open access
na licencji Creative Commons Attribution. Do aplikacji przepisano
fakty liczbowe z podaniem źródła, bez kopiowania całej publikacji.

Kohorta z lat 2006–2012: **2334 zdrowych białych dzieci z Białegostoku,
po 1167 każdej płci, 2–<18 lat**. Uczestnicy byli głównie ochotnikami
odwiedzającymi ośrodek z powodu monosymptomatycznego moczenia nocnego
lub przepukliny pachwinowej oraz dziećmi personelu. Wykluczano m.in.
infekcje, leki i choroby wpływające na cytryniany, nieprawidłowy mocz,
nieadekwatną zbiórkę ocenianą kreatyniną oraz kamicę/nefrokalcynozę
w USG. Jedna domowa DZM, zwyczajowa dieta. Ca i kreatynina: Cobas-Integra
800/Roche; cytryniany: metoda enzymatyczna R-Biopharm.

Tabela podaje **medianę (P5–P95)**, czyli centralne **90%** rozkładu,
nie P2,5–P97,5. Transkrypcję sprawdzono względem pełnego tekstu PDF
i odrębnego HTML tabeli; wartości pozostają w oryginalnych **mg/mg**.

| Wiek w aplikacji | Źródłowa grupa wieku | Chłopcy: mediana (P5–P95) | Dziewczęta: mediana (P5–P95) | n każdej płci |
|---|---|---|---|---:|
| 2–<7 lat | 2–6,99 | 0,15 (0,05–0,48) | 0,13 (0,03–0,42) | 342 |
| 7–<13 lat | 7–12,99 | 0,17 (0,05–0,60) | 0,12 (0,04–0,47) | 450 |
| 13–<18 lat | 13–17,99 | 0,22 (0,06–0,80) | 0,16 (0,05–0,60) | 375 |

Główna karta stosuje wyłącznie **górne P95**. Dodatnia wartość
**≤P95** jest niepodwyższona, **>P95** — podwyższona, bursztynowa.
Włączenie równości oraz użycie P95 do oceny podwyższenia są jawną
konwencją aplikacji. Źródłowe granice są zaokrąglone; nie dopisuje się
im dodatkowej precyzji i nie interpoluje między grupami wieku.
**P5 jest tylko w Szczegółach; nie tworzy alarmu niskiego Ca/Cit.**
Nie wykazano dolnego progu szkodliwości tego ilorazu.

Porównanie opisuje zdrową, jednorodną kohortę i pojedynczą DZM.
Nie jest laboratoryjną walidacją próbki pacjenta, normą wszystkich
populacji, progiem rozpoznania kamicy ani celem leczenia. Niepodwyższony
wynik nie wyklucza kamicy. Brak pokrycia <2 lub ≥18 lat w tym profilu
nie oznacza, że nie istnieją żadne badania lub normy w literaturze.

## Kwalifikacja próbki i brak porównania

Przy nowym obliczeniu wspólna, wymieszana DZM jest **opisanym
założeniem** wynikającym z przeznaczenia formularza, bez checkboxa.
Nie potwierdza kompletności, metody ani materiału historycznej próbki.
Znane fakty mają pierwszeństwo przed tym założeniem i pozostają przy
zmianie trybu, zapisie i edycji.

| Znany kontekst | Liczba | Porównanie z pediatrycznym P95 DZM |
|---|---|---|
| Nowe stężenia z jednej DZM lub gotowy iloraz w pasującym kontekście | Tak | Tylko mg/mg, właściwy wiek i płeć |
| Brak wiarygodnego wieku/płci; <2 lub ≥18 lat | Tak | Nie; konkretny powód przy wyniku |
| Cytryniany molowe lub gotowy mmol/mmol | Tak | Nie; nieznana podstawa masy normy |
| Znana próbka jednorazowa, inny czas, niepełna/problemowa zbiórka | Tak, bez skalowania czasem | Nie; sam iloraz pozostaje algebraicznie dostępny |
| Historycznie nieznany rodzaj/czas próbki lub znany niezgodny profil | Tak | Nie; brak danych nie staje się nową DZM |
| Znane różne próbki Ca i cytrynianów w obliczanej parze stężeń | Nie | Blokada obliczenia i zapisu tej pary, zachowane wejścia |
| Samodzielnie raportowany iloraz przy zachowanym konflikcie pochodzenia stężeń | Tak | Nie; samo przełączenie trybu nie usuwa konfliktu |

Gotowy iloraz jest samodzielną liczbą z raportu, nie ponownym dzieleniem
niezgodnej pary stężeń. Może zachować liczbę przy zapisanym konflikcie
pochodzenia, lecz bez normy. Dopiero jawne własne metadane potwierdzające
odpowiedni materiał niezależnego raportu mogą przywrócić porównanie.
Zmiana trybu nie jest takim potwierdzeniem; UI nie dodaje nowego pytania.

Nieznany lub nieodpowiedni profil referencyjny nie może otrzymać
zastępczej normy dorosłych, drugiego źródła wypełniającego lukę albo
fałszywego „w normie”. Nie odtwarza się wieku dawnej próbki z dzisiejszego
wieku pacjenta. Niepewność wieku, która nie pozwala jednoznacznie
wybrać grupy, nie uzasadnia zgadniętej granicy.

## Prezentacja, zero i walidacja

Jedna karta B łączy **„Wynik pacjenta”** i **„Normę dla wieku”**,
z dopiskiem **„Dla wieku i płci”**, w tej samej jednostce mg/mg.
Liczba i jednostka normy pozostają neutralne. Przy braku porównania
karta ma neutralną liczbę i krótki, konkretny powód. Nie twierdzi,
że norma nie istnieje nigdzie. Pełna tabela, źródło, populacja, wzór,
ograniczenie metody/podstawy masowej i znaczenie P95 należą do
zwiniętych **„Szczegółów i źródeł”**. Nie tworzą drugiego wyniku.

Każdy aktywny operand jest walidowany osobno w formularzu, edytorze,
przeliczeniu i zapisie. Ca musi być **≥0**, cytryniany **>0**;
gotowy iloraz może być **≥0**. Ujemne dane są błędem, również dwa
ujemne dające dodatni iloraz. Pustego pola nie utożsamia się z zerem.
Nieskończoność, NaN, nieprawidłowy zapis oraz dodatni underflow/overflow
nie dają liczby gotowej do zapisu. Nie wprowadza się nieudokumentowanych
klinicznych sufitów stężeń.

Dokładne zero Ca lub gotowego ilorazu jest neutralną liczbą,
**`outOfRange:null`**, z uwagą o raporcie i granicy oznaczalności.
Zero cytrynianów jest niedopuszczalnym mianownikiem. Zapis `<…` nie
oznacza dokładnego zera; nie tworzy się z niego samowolnie dokładnego
punktu. Gotowy iloraz zachowuje znak `<`, `≤`, `>` lub `≥`. Ocenę
nadaje się tylko wtedy, gdy cały możliwy przedział pozostaje po jednej
stronie górnej granicy; przedział obejmujący obie strony pozostaje
neutralny. Mały dodatni wynik pozostaje dodatni w karcie, edytorze,
Badaniach, Notatce i raporcie.

Ocena używa pełnej wartości przed skróceniem prezentacji. Skrócona
liczba ma **≈** i pełną wartość w Szczegółach; nawet jeżeli skrót
wygląda jak P95, status wynika z wartości dokładnej. Nie dodaje się
pasma tolerancji medycznej wokół granicy. Stałe szerokości,
wyrównanie jednostek, symetria, mobilne pola ≥16 px/48 px i odstęp
≥20 px pod czyszczeniem obowiązują po zmianie trybu/jednostki,
przy błędzie, długim wyniku i otwartych Szczegółach.

## Dane, silnik i historia

Normy i warunki zastosowania są danymi
**`ClcrCaCitReferenceData`**, profil **`KIREJCZYK_CACIT_DZM_2014`, v1**
w `clcr_ca_cit_reference_data.js`. Silnik
**`VildaClcrCaCit.evaluate(input, profile)`** w `clcr_ca_cit.js`
przyjmuje profil jako argument. Wynik niesie populację, źródło,
jednostkę i ograniczenia. Renderer nie ustanawia własnej normy.
Warstwy `ClcrCaCitUi`, `ClcrCaCitSession` i `ClcrCaCitPersistence`
korzystają ze wspólnego modelu; nowe pola mają prefiks **`CACIT_`**,
a **`CACIT_inputMode`** wartości **`concentration`** albo **`reported`**.
Nie nadpisują wspólnego legacy `U_Cit` ani wejść Cit/Cr i ilości DZM.

Nowy zapis **`caCitSnapshot`, schemat `clcr-ca-cit` v1**, zamraża
dokładny wynik, surowe wejścia i ich jednostki,
tryb, pochodzenie próbki i znane ograniczenia, wiek/płeć użyte do
oceny, źródło/populację/wersję polityki, granicę z operatorem,
prezentację oraz ocenę. Brak oceny pozostaje **`null`**, nie `false`.
READ odtwarza migawkę, bez dzisiejszego silnika, wieku lub źródła.
Uszkodzona nowa migawka nie przechodzi cicho do starego kalkulatora.

Dawny **`Ca_Cit` w mg/mg** zachowuje zapisaną liczbę obliczoną
przez **×4** i brak oceny. Samo otwarcie historii nie zmienia jej
na ×4,0078 i nie dopisuje pediatrycznej normy. Jawne przeliczenie
przy świadomej edycji używa nowego silnika; poprzedni wynik nie
jest retrospektywnie przepisywany podczas READ.

Nowy wynik masowy pozostaje **`Ca_Cit` / `clcr:Ca_Cit`**. Nowy
wynik molowy ma oddzielną serię **`Ca_Cit_mol` / `clcr:Ca_Cit_mol`**
z **`sourceFormulaId:'Ca_Cit'`**. Obu miar nie konwertuje się i nie
łączy w jedną serię trendu przez zgadniętą masę cytrynianów.
Jedno obliczenie tworzy jeden pomiar w Badaniach i zgodną, czytelną
Notatkę bez technicznego JSON. Zapis wymaga zapisanej, wybranej
karty pacjenta. Czyszczenie i zmiana pacjenta nie przenoszą próbki,
wyniku lub normy poprzedniej osoby. Nie migruje się realnych danych.

## Pozostałe źródła i powód niewłączenia progów

Poniższa mapa zachowuje ustalenia audytu z 05.11.2026. Odczyt
abstraktu lub indeksu nie jest przedstawiany jako weryfikacja
pełnej metodyki. Żadne z tych źródeł nie dodaje automatycznej normy
do powyższego profilu.

- **Srivastava T i wsp. 2009**, *Urine calcium/citrate ratio in children
  with hypercalciuric stones*, Pediatr Res 66:85–90,
  [DOI 10.1203/PDR.0b013e3181a2939e](https://doi.org/10.1203/PDR.0b013e3181a2939e),
  [PMID 19287339](https://pubmed.ncbi.nlm.nih.gov/19287339/).
  Zweryfikowano abstrakt, bez pełnej metodyki. Próbka przypadkowa:
  149 kontroli, 78 dzieci z hiperkalciurią bez złogów, 34 ze złogami.
  **0,326 mg/mg** jest progiem badawczym/ROC, nie P95 zdrowych;
  abstrakt nie rozstrzyga równości. Nie uzasadnia normy DZM.
- **DeFoor W i wsp. 2017**, *Calcium-to-Citrate Ratio Distinguishes
  Solitary and Recurrent Urinary Stone Forming Children*, J Urol
  198:416–421, [DOI 10.1016/j.juro.2017.03.125](https://doi.org/10.1016/j.juro.2017.03.125),
  [pełny PDF](https://urology.wisc.edu/wp-content/uploads/2019/01/DeFoor-Calcium-to-Citrate-Ratio-in-Pediatric-Stones-2017.pdf),
  s. 417–419. Retrospektywne badanie jednego ośrodka, wiek ≤21 lat,
  średnia z dwóch DZM przed farmakoterapią: 73 pojedyncze kamice,
  92 nawrotowe, 29 kontroli. **0,33 mg/mg jest średnią kontroli**;
  41% kontroli miało >0,33. Nie jest globalną górną normą.
  Praca nie ustala wymienności spot i DZM.
- **Dönger U i wsp. 2026**, *Urinary calcium-to-citrate ratio predicts
  kidney stone risk in children under the age of two years*, Pediatr
  Nephrol 41:2499–2507,
  [DOI 10.1007/s00467-026-07191-z](https://doi.org/10.1007/s00467-026-07191-z).
  Pełny tekst, Methods, Diagnostic performance, Limitations, tabele
  5–6. Jedna poradnia, 181 skierowanych dzieci **1 miesiąc–<24 miesięcy**,
  **spot** i równoczesne USG. ROC 0,23 mg/mg, czułość 66,1%, swoistość
  63,2%; tekst używa >, tabela ≥. Brak zewnętrznej walidacji.
  Nie jest niemowlęcą normą DZM; IQR kontroli nie jest RI.
- **Rodriguez i wsp. 2018**, *Effect of sample time on urinary lithogenic
  risk indexes in healthy and stone-forming adults and children*, BMC
  Urol 18:116, [DOI 10.1186/s12894-018-0430-8](https://doi.org/10.1186/s12894-018-0430-8).
  Pełny HTML/PDF, Methods i tabele 3–4. Dwie frakcje 12 h sumowane
  do 24 h; 82 zdrowych dorosłych 23–57 lat i 67 chorych 18–71 lat,
  87 zdrowych dzieci i 21 z kamicą 4–17 lat. Ca Arsenazo III,
  cytryniany enzymatycznie BioSystems, Ca/Cit mg/mg. Różnice dnia/nocy
  oraz nakładanie rozkładów; brak wyznaczonego RI DZM/cut-offu.
  Mediany i IQR z 12 h nie stają się normą DZM lub spot.
- **AFU/CLAFU 2022**, publikacja French Journal of Urology
  2023;33:911–953,
  [pełny oficjalny HTML](https://www.urofrance.org/recommandation/2022-recommendations-of-the-afu-lithiasis-committee-medical-management-from-diagnosis-to-treatment/),
  *Hypocitraturia and citrate*, **tabela 8**, sprawdzony także surowy
  HTML tabeli. **Odwrotny Cit/Ca <0,3 mmol/mmol** znajduje się
  w kolumnie **Concentration threshold at risk**; komórka progu
  dobowego jest pusta. To pomocniczy próg ryzyka w ocenie kamicy,
  bez określonej zdrowej kohorty/percentyli, nie norma Ca/Cit DZM.
  Nie odwraca się go w automatyczny próg i nie zaokrągla do 0,7 mg/mg.
- **EAU Guidelines on Urolithiasis 2026**,
  [pełny HTML](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention)
  i [PDF 2026](https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Urolithiasis-2026.pdf),
  §4.1.2, §4.1.5, tabela 4.2 i §4.4.2. Osobne dobowe Ca i cytryniany
  nie wyznaczają normy ich ilorazu. Dwie kolejne DZM służą swoistej
  ocenie metabolicznej; nie dodaje się potwierdzającego checkboxa.
  [EAU Paediatric Urology, Hypocitraturia](https://uroweb.org/guidelines/paediatric-urology/chapter/urinary-stone-disease)
  wspomina związek Ca/Cit z nawrotami, bez uniwersalnego 0,33.
- **AUA 2026**, części I i II,
  [DOI 10.1097/JU.0000000000005227](https://doi.org/10.1097/JU.0000000000005227)
  i [10.1097/JU.0000000000005228](https://doi.org/10.1097/JU.0000000000005228),
  publikacja online 30.07.2026, wydanie listopad 2026. Pełny tekst/PDF
  niedostępny (403); odczytano rekordy PubMed
  [42529981](https://pubmed.ncbi.nlm.nih.gov/42529981/) i
  [42529979](https://pubmed.ncbi.nlm.nih.gov/42529979/) oraz fragmenty
  wydawcy. Nie deklaruje się pełnej weryfikacji braku Ca/Cit w AUA.

Inne sprawdzone propozycje nie uzupełniają luk wieku lub dorosłych:

- **Kompani 2019**, [DOI 10.1053/j.jrn.2018.08.005](https://doi.org/10.1053/j.jrn.2018.08.005),
  tylko abstrakt, 2–12 lat, próg 0,25 mg/mg bez pełnej metodyki/operatora.
  **Turudić 2021**, [DOI 10.3390/biom11050758](https://doi.org/10.3390/biom11050758),
  pełny HTML, §2–3/tabela 3: 61 dzieci z CaOx i 25 kontroli, trzy DZM;
  selekcjonowana kohorta, niejasne drukowane `mol/mmol`.
  **Dönger 2025**, [DOI 10.4274/jcp.2025.14892](https://doi.org/10.4274/jcp.2025.14892),
  pełny HTML Methods/Results, tabela 3 w indeksowanym PDF: 325
  skierowanych 0–18 lat, spot/DZM, niespójne jednostki i tabela
  „norm”; nakładający się ośrodek/lata z 2026, nie niezależna walidacja.
- **Gafni 2018**, [DOI 10.1002/jbmr.3480](https://doi.org/10.1002/jbmr.3480),
  pełny tekst, Treatment of hypocitraturia/Discussion: 31 pacjentów
  16–60 lat z niedoczynnością przytarczyc na hPTH1–34. >0,7 mg/mg
  było protokołowym progiem leczenia opartym na odrębnych granicach
  Ca i cytrynianu, nie RI dorosłych. Korekty 2022
  [10.1002/jbmr.4522](https://doi.org/10.1002/jbmr.4522) nie otwarto.
  **Arrabal-Polo 2013**, [PMID 22757744](https://pubmed.ncbi.nlm.nih.gov/22757744/),
  115 osób, próg >0,25 w szczególnym kontekście kamicy/BMD — tylko
  abstrakt, bez zweryfikowanych jednostek. **Höbarth/Hofbauer 1991**,
  [PMID 2022221](https://pubmed.ncbi.nlm.nih.gov/2022221/), 176 chorych
  i 100 kontroli, oraz **Osther 1993**,
  [PMID 8256384](https://pubmed.ncbi.nlm.nih.gov/8256384/), 43 nawrotowych
  i 50 kontroli: tylko abstrakty, bez zweryfikowanego RI Ca/Cit.
- **NHS GGC, guideline 973**, przegląd 17.11.2021,
  [pełny HTML, Appendix III](https://www.rightdecisions.scot.nhs.uk/shared-content/ggc-clinical-guidelines/paediatrics/kidney-diseases/nephrolithiasis-andor-nephrocalcinosis-management-and-evaluation-973/):
  pediatryczne mg/mg odpowiadają Kirejczykowi, lecz skrót `>13`
  pomija dokładnie 13 lat, a wiersz ryzyka ma niespójną nazwę
  calcium/creatinine. Nie zastępuje tabeli pierwotnej ani nie dowodzi
  podstawy molowego przeliczenia. Indeksowane pediatryczne <0,325
  z *Pediatrics in Review* 2010,
  [DOI 10.1542/pir.31-5-179](https://doi.org/10.1542/pir.31-5-179),
  nie zostało zweryfikowane w pełnej tabeli (podany PDF zwracał 404).
- **Historyczny Marshfield SUP24**,
  [dawny URL](https://www.marshfieldlabs.org/sites/ltrm/Human/Pages/26580.aspx):
  tylko indeks wyszukiwarki zawierał 0–17 lat, dziewczęta <0,16,
  chłopcy <0,22 mg/mg; dokument zwracał 403/przekierowanie.
  Nie potwierdzono źródła, daty, percentyla ani kohorty niemowląt.
  Aktualne [Marshfield SUP24SO](https://marshfieldlabs.testcatalog.org/show/SUP24SO)
  i [Mayo SUP24](https://pediatric.testcatalog.org/show/SUP24), pełne
  katalogi, **nie zawierają Ca/Cit ani dawnej tabeli**. Osobne Cit24h
  0–19 lat „not established” nie jest oświadczeniem o wszystkich
  normach Ca/Cit. Historia zastąpienia SAT24 przez SUP24 od 06.12.2022
  pochodzi z [MLabs 09.11.2022](https://mlabs.umich.edu/2022/11/09/test-update-822-2);
  dawny Mayo SAT24 attachment 43696 sprawdzono tylko w indeksie.
  [Mayo CITR](https://www.mayocliniclabs.com/test-catalog/overview/606710)
  dotyczy samego cytrynianu, a
  [CITRA](https://www.mayocliniclabs.com/test-catalog/overview/606715)
  Cit/Cr, bez normy Ca/Cit. Nie rozszerza się DZM poniżej 2 lat na
  podstawie starego indeksu lub innego analitu.

Dokumenty analityczne wyjaśniają ograniczenie podstawy masowej,
bez ustanawiania normy: **Boehringer Mannheim/R-Biopharm Citric acid**,
Cat 10139076035, wersja **2011-05, s. 2 §2.1**,
[PDF](https://slatti.se/files/enzymatiska/Citric%20acid_EN_10139076035_2011-05.pdf)
— tekst dostępny w indeksie, bez pełnego bezpośredniego odczytu
(502/503). Pełna [reprodukcja hiszpańskiej wersji 2013-10](https://studylib.es/doc/4667847/%C3%A1cido-c%C3%ADtrico---r),
ta sama sekcja, potwierdza trzy dopuszczone konwencje; przekład nie
zastępuje instrukcji zestawu. Obecna **Enzytec Liquid E8230**,
wersja 2/24.03.2023, s. 1 §5.1.1,
[pełny PDF](https://food.r-biopharm.com/wp-content/uploads/E-Liquid_IFU_E8230_Citric_acid_EN_2023-03_V2-1.pdf),
stosuje 192,13 g/mol, ale jest innym, późniejszym zestawem.
**BioSystems 03/24**, s. 2,
[pełny PDF](https://biosystems.global/assets/themes/biosystems.global/docs/reagents/BioS_2024_CA_ProductSheet_Citrate-Renal_EN.pdf),
stosuje odpowiednik około 192,12 g/mol dla własnego analitu.
Żaden z tych dokumentów nie dowodzi kalibracji badania Kirejczyka
2006–2012 ani próbki pacjenta.

## Syntetyczne kontrakty wejście → oczekiwany wynik

Dane są fikcyjne. Tabela opisuje wymagania dla testów **rzeczywistego
silnika produkcyjnego**, edytora i serializerów, a nie kopii wzoru.
Jeżeli nie podano inaczej, nowy kontekst odpowiada jednej DZM.
Dokładne wartości poprzedzają formatowanie i ocenę.

| Wejście | Oczekiwany wynik lub zachowanie |
|---|---|
| Ca 2 mmol/L, cytryniany 40 mg/dL | **0,20039 mg/mg**, nie dawne 0,200; brak potrzeby V/czasu/antropometrii |
| Ca 2000 µmol/L, cytryniany 400 mg/L | Ten sam **0,20039 mg/mg** |
| Ca 100 mg/L, cytryniany 40 mg/dL | **0,25 mg/mg** |
| Ca 4,0078 mg/dL, cytryniany 1 mmol/L | **1 mmol/mmol**, neutralnie bez normy masowej |
| Ca 2 mmol/L, cytryniany 500 µmol/L | **4 mmol/mmol**, bez użycia 192/189/210 i bez normy mg/mg |
| Chłopiec 5 lat, gotowe 0,40 mg/mg | Niepodwyższony względem **≤0,48**, mimo >0,326; nie jest diagnozą braku kamicy |
| Dziewczynka 5 lat, gotowe 0,42; następnie 0,4200001 mg/mg | Równość niepodwyższona; druga wartość podwyższona także przy podobnym skrócie wyświetlania |
| Chłopiec, 6,999; 7; 12,999; 13; 17,999; 18 lat | Górne granice odpowiednio **0,48; 0,60; 0,60; 0,80; 0,80; brak** |
| Dziewczynka 13 lat, gotowe 0,50 mg/mg | Grupa **13–<18**, norma **≤0,60**, bez luki w wieku 13 lat |
| Chłopiec 5 lat, gotowe 0,01 mg/mg | Niepodwyższony; P5 0,05 nie wywołuje alarmu |
| Wiek 1,999; 18; 45 lat; brak wieku albo płci | Poprawna liczba, neutralna karta i konkretny powód braku porównania |
| Gotowe 0,40 mg/mg, znany spot/12 h/niepełna zbiórka/historycznie nieznany materiał | Nadal **0,40**, bez normy DZM i bez mnożenia przez czas |
| Te same dane, znany niezgodny profil źródłowy | Liczba bez normy, bez ukrytej konwersji podstawy cytrynianów |
| Ca i cytryniany z jawnie różnych próbek w trybie stężeń | Brak wyniku i zapisu tej pary; wpisy pozostają do korekty |
| Przełączenie tej pary na gotowy, niezależnie raportowany iloraz 0,40 mg/mg | Liczba **0,40** dostępna, konflikt zachowany, bez normy; sam tryb nie potwierdza pochodzenia raportu |
| Chłopiec 5 lat, raport `<0,48`, `>0,48`, `≥0,48` mg/mg | Odpowiednio niepodwyższony, podwyższony, neutralny przedział obejmujący dwie oceny; zachowane znaki |
| Ca 0, cytryniany 40 mg/dL; gotowy iloraz 0 | Liczbowe **0**, neutralne `outOfRange:null`, uwaga o raporcie/oznaczalności |
| Cytryniany 0; puste pole; Ca −2 lub cytryniany −40; oba ujemne | Odpowiednio niedozwolony mianownik; brak danych; błąd każdego ujemnego operandu, również w edytorze/zapisie |
| Ca 0,0000001 mmol/L, cytryniany 40 mg/dL | **0,0000000100195 mg/mg**, nigdy pokazane lub zapisane jako 0,000 |
| Nieskończoność, NaN lub dodatni wynik niereprezentowalny | Brak zapisywalnego wyniku, bez cichego zera/nieskończoności |
| READ starego Ca_Cit 0,200 obliczonego z 2/40 | Pozostaje **0,200 mg/mg, bez oceny**; brak dzisiejszego P95 i konwersji ×4,0078 |
| Jawne przeliczenie tych zachowanych stężeń nowym silnikiem | **0,20039 mg/mg**, z oceną tylko przy kwalifikującym zapisanym/świadomie podanym kontekście |
| Nowy zapis molowy i masowy, potem odczyt przy innym wieku | Oddzielne serie; każde wejście, źródło, liczba i ocena zamrożone z dnia zapisu |

Regresje obejmują wszystkie grupy/płcie, obie strony i równość P95,
jednostki natywne, neutralne zero, małe dodatnie wartości, brakujące
i sprzeczne dane oraz rzeczywiste ścieżki save/read/edit/history.
READ sprawdza się bez wywoływania aktualnego silnika; oba adaptery
historii nie mogą łączyć serii molowej z masową. UI sprawdza się
na desktopie, 390/320 px, z klawiaturą, resetem/zmianą pacjenta,
gotowością 2/2 lub 1/1 i PWA offline. Wykonane kontrole i końcowy
SHA raportuje PR; ten kontrakt nie deklaruje ich wykonania.

Ponowny przegląd jest potrzebny przed dodaniem nowej populacji,
materiału, potwierdzonej konwencji masowej źródła albo automatycznej
normy molowej/dorosłej. Nowa publikacja nie zmienia zapisanej historii.
