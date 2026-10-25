# FECl w próbce moczu — źródła i polityka prezentacji

Stan odczytu źródeł: **25.10.2026**. Zakres: `FECl_spot`, frakcja
wydalania chlorków z czterech stężeń. Wynik jest procentowym stosunkiem
klirensu chlorków do klirensu kreatyniny. Nie jest klirensem w mL/min,
dobowym wydalaniem chlorków ani samodzielnym rozpoznaniem przyczyny AKI.

Właściciel zaakceptował
[makietę przed/po na desktopie i telefonie](https://vilda-fecl-audyt-20261025.maciej-flader.chatgpt.site)
oraz kodowanie z naprawą potwierdzonych błędów. Źródło zaakceptowanej
makiety: `5c5fdc1d52eb0018ef45f30a4ca9f593dba036f2`. Akceptacja zakresu
i testy techniczne nie nadają metodzie statusu nowej walidacji klinicznej.

## Wzór, jednostki i minimum danych

`FECl [%] = 100 × U_Cl × S_Cr / (S_Cl × U_Cr)`.

| Materiał | Potrzebne stężenia | Jednostki formularza |
|---|---|---|
| Ta sama punktowa próbka moczu | Chlorki i kreatynina | Cl: mmol/L; Cr: mg/dL, µmol/L lub mmol/L |
| Krew pobrana równocześnie | Chlorki i kreatynina | Cl: mmol/L; Cr: mg/dL, µmol/L lub mmol/L |

Dla jednowartościowego Cl− mmol/L i mEq/L są liczbowo równoważne.
Stała etykieta mmol/L usuwa zbędny wybór. Jednostki obu kreatynin
uzgadnia się przed obliczeniem; zachowano przelicznik dotychczasowej
ścieżki frakcji wydalanych: **1 mg/dL = 88,4 µmol/L = 0,0884 mmol/L**.

U_Cl = 0 daje poprawne FECl = 0. Pozostałe trzy stężenia muszą być
dodatnie, a wszystkie cztery skończone. Puste pole nie jest zerem.
Ujemna liczba, nierówność zamiast dokładnego stężenia lub nieznana
jednostka nie są poprawnymi operandami. W szczególności `<20 mmol/L`
nie staje się dokładnym U_Cl = 20. Nie ma limitu opartego na samym
numerze przed konwersją ani obcinania FECl do 100%.

Wiek, płeć, masa, wzrost, BSA, objętość i czas zbiórki nie są składnikami
równania. Cztery stężenia wystarczają do liczby. Wiek dostępny w aplikacji
pozostaje kontekstem pacjenta; jego brak nie tworzy dodatkowego poziomu
„pełnej interpretacji” ani obowiązkowego pytania.

## Założenia próbek i znane fakty

Wspólna próbka moczu oraz równoczesne pobranie krwi są opisanym
**założeniem**, jeżeli nie ma zachowanego potwierdzenia lub sprzeczności.
Nie oznacza to potwierdzonego faktu pacjenta. Znana różna próbka moczu
lub inny czas krwi blokują liczbę i zapis, zachowując wpisane stężenia.
Jawne „Nie” ma pierwszeństwo przed dawnym potwierdzeniem; brak
zaznaczenia starszego checkboxu sam nie dowodzi niezgodności próbek.
Nie ustalono uniwersalnego dopuszczalnego okna „do X godzin”.

Uproszczenie dotyczy FECl. Nie potwierdza niezależnego protokołu TmP/GFR
lub FEHCO₃. Inny czas krwi nie unieważnia sam przez się wspólnej próbki
moczu dla UAG; różne próbki moczu mają znaczenie także dla UAG.

Nie dodaje się rutynowej ankiety o stabilność kreatyniny, AKI, IFCC/IDMS,
PChN lub leczenie. Ogólne założenie Klirensu „stabilna czynność nerek,
bez podejrzenia AKI” nie jest warunkiem arytmetyki FECl. Znane PChN,
podejrzenie AKI, szybko zmieniająca się kreatynina lub diuretyk pozostają
istotnymi uwagami przy wyniku i w zapisie. Nieznany fakt nie staje się
potwierdzoną nieobecnością choroby lub leczenia.

## Jeden wynik bez nieuzasadnionej normy

W przejrzanych źródłach nie zweryfikowano odpowiednio opisanego
przedziału referencyjnego pozwalającego automatycznie oceniać punktowe
FECl według wieku. Jest to granica pokrycia źródłowego tej implementacji,
**nie dowód nieistnienia wszystkich norm lokalnych lub publikacji**.

| Grupa | Zweryfikowane pokrycie | Konsekwencja |
|---|---|---|
| Wcześniaki | Brak właściwego przedziału referencyjnego w odczytanych źródłach. | Liczba bez zastępczej normy. |
| Zdrowe donoszone noworodki | Ho 2024: mediany/IQR z 1. i 5. doby. | IQR nie jest przedziałem referencyjnym i nie obejmuje całego okresu noworodkowego. |
| Niemowlęta, dzieci i dojrzewanie | Kryteria podejrzenia tubulopatii, wybrane kohorty oraz niepełnie opisane wartości wtórne. | Brak automatycznej normy wieku i klasyfikacji. |
| Dorośli i osoby starsze | Badanie populacyjne Moulin 2017 z DZM oraz testy prowokacyjne Bech 2017. | Nie przenosi się danych dobowych lub ΔFECl na punktowe FECl. |

Karta B łączy dużą wartość z jednostką, prostą informację
**„Norma dla wieku / Brak normy do porównania”** oraz komentarz:

> Sam wynik nie rozstrzyga o nerkowej utracie chlorków. Oceń go łącznie
> z nawodnieniem, czynnością nerek i leczeniem.

Bez kwalifikującego odniesienia karta pozostaje neutralna również przy
0%, bardzo małym lub dużym wyniku. `outOfRange` pozostaje **`null`**,
a nie `false` oznaczającym „w normie”. Znany czynnik ograniczający
interpretację otrzymuje bursztynową uwagę; sama wysoka liczba nie jest
nowym progiem alarmowym. Znana sprzeczność próbek blokuje obliczenie.

FECl nie nadaje kategorii G, nie potwierdza prawidłowego GFR i samo nie
rozpoznaje odwodnienia, nerkowej utraty chlorków, Gitelmana, uszkodzenia
cewek ani wskazania do płynoterapii. Nie wyklucza AKI lub tubulopatii.
Podaż chlorków, objętość, leki, czynność nerek oraz równowaga
kwasowo-zasadowa mogą zmieniać wynik. FENa i FECl nie muszą zmieniać
się równolegle, np. przy wydalaniu NaHCO₃ lub NH₄Cl.

### Dlaczego >0,5% nie jest normą

KDIGO 2017, tabela 2, wymienia **FECl >0,5%** jako jeden z elementów
podejrzenia zespołu Gitelmana w odpowiednim obrazie, obejmującym
hipokaliemię i zasadowicę metaboliczną. Przypis b określa ten próg jako
opinię ekspertów wymagającą weryfikacji obserwacjami klinicznymi.
Nie jest górną granicą zdrowej populacji, normą wieku, samodzielną
diagnozą ani regułą wykluczającą chorobę przy wyniku ≤0,5%.
Pozostaje objaśnieniem w „Szczegółach i źródłach”, bez automatycznej
klasyfikacji wpisanego wyniku. Także `<1%` z określonego screeningu,
podręcznikowe `1–3%`, progi U_Cl w mmol/L i zmiana ΔFECl po diuretyku
nie są zamiennymi normami punktowego FECl.

## Źródła, populacje i granice odczytu

Poniżej podano właściwe miejsca w odczytanych źródłach. Datą przeglądu
jest 25.10.2026; nie kopiowano pełnych publikacji do repozytorium.

1. **Mayo Clinic Laboratories, RCHLU, Chloride, Random, Urine.**
   [Oficjalny katalog](https://www.mayocliniclabs.com/test-catalog/Overview/800340),
   [oficjalny katalog Renal Diagnostics](https://renal.testcatalog.org/show/RCHLU),
   [PDF katalogu](https://www.mayocliniclabs.com/test-catalog/download-setup?format=pdf&unit_code=800340).
   Brak jawnej daty rewizji; odczyt sekcji „Reference Values”,
   „Interpretation”, „Cautions” i materiału, s. 2/3 generowanego PDF.
   Potwierdza wzór FECl i znaczenie kontekstu. Katalog losowego U_Cl
   nie definiuje kohorty zdrowej ani zakresów FECl dla wieku. Zdanie
   „No established reference values” dotyczy **testu losowego U_Cl**;
   nie jest dowodem braku wszelkich norm FECl. Oznaczanie chlorków
   metodą ISE może podlegać interferencji innych halogenków.
2. **Blanchard A i wsp.** *Gitelman syndrome: consensus and guidance from
   a Kidney Disease: Improving Global Outcomes (KDIGO) Controversies
   Conference.* Kidney Int. **2017;91:24–33**.
   [DOI 10.1016/j.kint.2016.09.046](https://doi.org/10.1016/j.kint.2016.09.046),
   [pełny oficjalny PDF](https://kdigo.org/wp-content/uploads/2017/02/KDIGO-Gitelman-conf-report.pdf).
   Odczyt s. 25–26, tabela 2 i przypis b. Konsensus obejmuje podejrzenie
   GS u dzieci/dorosłych, nie normy zdrowej populacji. Wspiera równoczesne
   próbki, zwykle wystarczającą próbkę punktową i warunkowe znaczenie
   >0,5%. Nie przenosi się do kalkulatora instrukcji odstawiania
   suplementacji lub leczenia.
3. **Walsh PR i wsp.** *Clinical and diagnostic features of Bartter and
   Gitelman syndromes.* Clin Kidney J. **2018;11(3):302–309**.
   [DOI 10.1093/ckj/sfx118](https://doi.org/10.1093/ckj/sfx118),
   [pełny artykuł](https://pmc.ncbi.nlm.nih.gov/articles/PMC6007694/).
   Odczyt metod, tabeli 2 i dyskusji diagnostycznej. Jednoośrodkowo
   45 dzieci z potwierdzonym wariantem genetycznym; FECl dostępne tylko
   dla **15**. Przed suplementacją u tych 15 było >0,5%, mediana 1,62%,
   IQR 1,2–5,5%. Brak zdrowej grupy kontrolnej; brak norm lub swoistości
   uniwersalnego progu.
4. **Palmer BF, Clegg DJ.** *The Use of Selected Urine Chemistries in the
   Diagnosis of Kidney Disorders.* CJASN **2019;14:306–316**.
   [DOI 10.2215/CJN.10330818](https://doi.org/10.2215/CJN.10330818),
   [pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC6390907/).
   Odczyt wstępu i „Urinary Chloride”, s. 306–308. Przegląd, bez
   referencyjnej kohorty wieku; wyjaśnia wpływ objętości, podaży, leków,
   funkcji nerek i zaburzeń kwasowo-zasadowych. Nie dostarcza norm FECl
   ani uprawnienia do przeniesienia progów FENa.
5. **Do C, Vasquez PC, Soleimani M.** *Metabolic Alkalosis Pathogenesis,
   Diagnosis, and Treatment: Core Curriculum 2022.* Am J Kidney Dis.
   **2022;80(4):536–551**.
   [DOI 10.1053/j.ajkd.2021.12.016](https://doi.org/10.1053/j.ajkd.2021.12.016),
   [pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC10947768/).
   Odczyt „Workup and Treatment of Metabolic Alkalosis”, ryc. 6
   i części o diuretykach. Podział zasadowicy na podstawie **U_Cl <20
   lub >20 mmol/L** dotyczy stężenia, nie procentowego FECl.
6. **Bech AP, Wetzels JFM, Nijenhuis T.** *Reference values of renal tubular
   function tests are dependent on age and kidney function.* Physiol Rep.
   **2017;5:e13542**.
   [DOI 10.14814/phy2.13542](https://doi.org/10.14814/phy2.13542),
   [pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC5727289/).
   Odczyt metod, wyników i dyskusji; 53 dorosłych, 129 testów; grupy
   zdrowych 18–50 lat, >50 lat i osób z eGFR <90, po 10 osób w grupie
   na test. Badano **przyrost ΔFECl po furosemidzie lub HCTZ**, nie normę
   bazalnego punktowego FECl. Liczebność i zależność od wieku/GFR
   ograniczają uogólnienie. Suplementów S1–S4 nie użyto jako norm.
7. **Ho SY, Wang KL, Fan HC, Ding JJ.** *Dynamics of Urine Electrolytes
   in Term Neonates during the 1st Week of Life.* J Med Sci.
   **2024;44(5):216–221**, online 22.05.2024.
   [DOI 10.4103/jmedsci.jmedsci_8_24](https://doi.org/10.4103/jmedsci.jmedsci_8_24),
   [pełny oficjalnie udostępniony PDF](https://www.mnd.gov.tw/File/49366).
   Odczyt metod s. 217, tabeli 2 s. 218 i ograniczeń s. 220.
   55 zdrowych donoszonych noworodków, **54 chłopców i 1 dziewczynka**,
   jeden ośrodek; pomiary 1. i 5. doby. FECl: mediana **0,54%**, IQR
   **0,27–0,825%** w 1. dobie oraz **0,45%**, IQR **0,255–0,670%**
   w 5. dobie. IQR to środkowe 50% obserwacji, nie przedział referencyjny.
   Nie rozszerza się go na inne doby, wcześniaki lub starsze dzieci.
8. **Becue i wsp.**, Front Pediatr. **2022;10:902252**.
   [DOI 10.3389/fped.2022.902252](https://doi.org/10.3389/fped.2022.902252),
   [pełny tekst wydawcy](https://www.frontiersin.org/journals/pediatrics/articles/10.3389/fped.2022.902252/full).
   Odczyt pełnego tekstu/PDF: populacja i protokół s. 1–2, ograniczenia
   s. 8–9 i bibliografia s. 10. 299 dzieci 5–16 lat kierowanych z powodu
   niskorosłości. Kryterium przesiewowe `<1%` pochodzi z cytowanego
   ESPN Handbook 2002, którego pełnego rozdziału nie uzyskano. Nie jest
   nowo wyznaczonym RI; brak pełnego follow-up ujemnych screenów nie
   pozwala użyć go do wykluczania tubulopatii.
9. **Mattke i wsp.**, Anaesth Intensive Care **2024;52(6)**.
   [DOI 10.1177/0310057X241265119](https://doi.org/10.1177/0310057X241265119),
   [pełny HTML wydawcy](https://journals.sagepub.com/doi/10.1177/0310057X241265119).
   Odczyt „Participants”, „Data collection and variables”, równania 3,
   wyników i dyskusji. 91 dzieci ≤2 lat po operacji z krążeniem
   pozaustrojowym; wpływ diuretyków i bardzo wybranej chorej populacji.
   Małe FECl w tej kohorcie nie dowodzi zdrowia. Brak normy zdrowych
   niemowląt lub samodzielnego progu AKI.
10. **Moulin F i wsp.** *A population-based approach to assess the
    heritability and distribution of renal handling of electrolytes.*
    Kidney Int. **2017;92(6):1536–1543**.
    [DOI 10.1016/j.kint.2017.06.020](https://doi.org/10.1016/j.kint.2017.06.020),
    [PMID 28888328](https://pubmed.ncbi.nlm.nih.gov/28888328/),
    [publiczny autorski upload pełnego tekstu](https://www.researchgate.net/publication/279308484_5C09_HERITABILITY_OF_RENAL_FUNCTION_PARAMETERS_AND_ELECTROLYTE_LEVELS_IN_THE_SWISS_POPULATION).
    Rekord uploadu ma tytuł wcześniejszego abstraktu, ale odczytany
    załącznik zawiera właściwy artykuł z DOI i paginacją 2017. Odczytano
    cały tekst główny, tabelę 1, metody i wykaz suplementów. SKIPOGH:
    1128 osób ≥18 lat europejskiego pochodzenia, 537 mężczyzn/591 kobiet,
    średni wiek 47,4 ±17,5 roku; w tym 51 osób z cukrzycą i 260
    z nadciśnieniem. Nie jest to wyłącznie zdrowa kohorta. Materiał:
    **dobowa zbiórka moczu**, poranna krew na czczo. Statystyki FECl
    w **Supplementary Table S1** i rozkład w **Figure S1** nie zostały
    uzyskane; tekst główny nie podaje odpowiedniego liczbowego zakresu.
    Nie zgaduje się tych liczb ani nie przenosi statystyk dobowych na
    próbkę punktową. Błąd HTTP 403 w odczycie kanału wydawcy nie jest
    dowodem paywalla.

### Dane wtórne niewystarczające do normy wieku

- Espinosa Román, *Pediatr Integral* **2017;XXI(8):549–555**,
  [pełny PDF, tabela IV s. 554](https://www.pediatriaintegral.es/wp-content/uploads/2017/xxi08/06/n8-549-555_RB-Espinosa.pdf):
  FECl **0,84 ±0,27**, bez wieku, n, definicji ± i warunków populacji.
  Sąsiednie wiersze wieku dotyczą fosforanów, nie FECl. Nie wyprowadza
  się z tej liczby przedziału ±1SD lub ±2SD.
- Thomas, *Clinical Laboratory Diagnostics*,
  [rozdział 8, §8.8.5 i §8.8.9](https://clinical-laboratory-diagnostics.com/k08.html),
  odczyt 25.10.2026: **1–3%** oraz **0,35–1,07%** występują w różnych
  kontekstach bez wystarczającego opisu zdrowej kohorty i wyznaczenia RI.
  Pierwotnego Gross/Reimann 2002 nie uzyskano. Nie wybiera się jednego
  zakresu do automatycznej oceny wszystkich grup.

## Rozdzielenie danych, obliczenia i historii

`clcr_fecl_reference_data.js` zawiera wersjonowane źródła i ograniczenia
**`FECL_CONTEXT_2026_10`, wersja 1**. Nie zawiera kwalifikującego profilu
normy. `VildaClcrFecl.compute(input)` w `clcr_fecl.js` liczy FECl,
a `VildaClcrFecl.evaluate(input, policy)` przyjmuje politykę jako
argument. Renderer przedstawia tę ocenę bez tworzenia własnych norm.
Brak przekazanej polityki nie uruchamia normy wbudowanej w matematykę.

Dokładny iloraz dziesiętnych wejść i jednostek jest oddzielony od liczby
maszynowej i tekstu prezentacji. Wynik 0,001% nie staje się zerem,
a 0,5001% nie jest przedstawiane jako dokładnie 0,5%. Ochrona dokładnej
strony wartości 0,5 i 1 w formatowaniu nie nadaje im statusu progów normy.
Notacja naukowa pozwala ograniczyć długość bardzo dużej lub małej liczby.
Reprezentowalny wynik nie ginie wskutek przepełnienia lub niedomiaru
pośredniego iloczynu. Dodatni wynik niereprezentowalny jako dodatnia
skończona liczba jest błędem, nie zapisywanym zerem. Stan gotowości,
karta oraz możliwość zapisu muszą wynikać z tej samej oceny wejścia.

Snapshot **`clcr-fecl`, wersja 1**, zachowuje surową liczbę, dokładny
ułamek, tekst, oryginalne cztery stężenia i jednostki, kontekst pacjenta,
założenia/potwierdzenia próbek, znane fakty, źródła, wersję polityki
i interpretację z chwili zapisu. Zapis wykorzystuje istniejącą notę
laboratoryjną bez migracji modelu sejfu. Znane leczenie lub PChN nie
znikają po zapisaniu samej liczby. Raport i historia odtwarzają utrwaloną
ocenę bez dzisiejszego wieku, leczenia lub ponownego doboru źródła.

Starszym wpisom nie dopisuje się normy ani utraconej precyzji. Zachowuje
się przecinek, małą dodatnią liczbę i znak nierówności; `<0,1` nie jest
dokładnym punktem 0,1. Edycja wyniku nie może pozostawić niezgodnego
starego snapshotu. Odtworzenie nowej lub niepełnej sesji czyści brakujące
chlorki zamiast pobierać poprzednie wartości z DOM. Zwykła zmiana wzoru
w bieżącej sesji nie jest zmianą pacjenta ani powodem kasowania
intencjonalnie wpisanych lub pustych pól.

## Syntetyczne kontrakty regresyjne

| Wejście / stan | Oczekiwany wynik lub zachowanie |
|---|---|
| U_Cl 20, S_Cl 100 mmol/L; S_Cr 1, U_Cr 100 mg/dL | Dokładnie 0,2%; neutralna karta, bez normy, `outOfRange:null`. |
| U_Cl 100, S_Cl 100; S_Cr 88,4 µmol/L, U_Cr 8,84 mmol/L | Dokładnie 1%, jak przy S_Cr 1/U_Cr 100 mg/dL. |
| U_Cl 0,1 / 50,01; pozostałe 100 / 1 / 100 | 0,001 / 0,5001%; wartości zachowane w prezentacji i zapisie. |
| U_Cl 0 / puste; pozostałe dodatnie | Poprawne 0% / brak liczby; zero w którymkolwiek pozostałym polu blokuje. |
| U_Cl 100, S_Cl 100, S_Cr 1 mg/dL; U_Cr 50001 µmol/L lub dokładne równoważne mg/dL | Ta sama kwalifikacja i wynik po konwersji, bez zależnej od jednostki blokady. |
| Ten sam komplet dla wcześniaka, 1. doby życia, 8 lat, 45 lat lub bez wieku | Ta sama liczba; brak nieuzasadnionej normy i dodatkowego pytania do interpretacji. |
| Znane PChN i diuretyk, następnie zapis i zmiana kontekstu pacjenta | Wszystkie znane uwagi zachowane w ocenie z chwili zapisu. |
| Jawnie różne próbki lub czas krwi, następnie korekta informacji | Sprzeczność blokuje liczbę; korekta nie usuwa stężeń i nie potwierdza odrębnego protokołu. |
| Nowa/niepełna sesja bez Cl po poprzednim komplecie | Brak dziedziczenia poprzednich chlorków i pozornie kompletnego wyniku. |
| Stary zapis `0,001`, `0,8` bez `valueNum` lub `<0,1` | Zachowana wartość/tekst; nierówność nie staje się dokładnym punktem. |
| Test obliczeniowy: U_Cl 1e-200, S_Cl 1e-100, U_Cr 1e-200, S_Cr 1e-200 mg/dL | 1e-98%, nie fałszywe zero; to syntetyczny test arytmetyki, nie fizjologiczny przypadek. |

Regresje `klirens-fecl-engine.test.mjs`, `klirens-fecl-session.test.mjs`,
`klirens-fecl-save.test.mjs`, E2E `klirens-fecl-audit.spec.mjs`
i `klirens-fecl-offline.spec.mjs` mają wywoływać rzeczywiste funkcje
produkcyjne, z wyłącznie fikcyjnymi danymi. Wyniki ich wykonań, testów
offline, kontroli GitHub oraz commit i PR podaje opis PR. Zielone testy
nie zastępują akceptacji klinicznej właściciela ani ponownego przeglądu
po zmianie źródła lub polityki.
