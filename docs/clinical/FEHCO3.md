# FEHCO₃ w próbce moczu — źródła i polityka prezentacji

Stan odczytu źródeł: **25.10.2026**. Zakres: `FEHCO3_spot`, frakcja
wydalania wodorowęglanów z czterech stężeń. To procentowy stosunek
klirensu HCO₃ do klirensu kreatyniny. Nie jest stężeniem HCO₃ w moczu,
dobowym wydalaniem ani samodzielnym rozpoznaniem kwasicy cewkowej.

Właściciel zaakceptował
[makietę przed/po na desktopie i telefonie](https://vilda-fehco3-audyt-20261025.maciej-flader.chatgpt.site)
oraz wdrożenie z naprawą potwierdzonych błędów. Źródło makiety:
`856e049b81eb8f327174d264ea4c5b1f3ce20996`. Akceptacja polityki i testy
techniczne nie stanowią nowej walidacji klinicznej metody.

## Wzór, jednostki i minimum danych

`FEHCO₃ [%] = 100 × U_HCO₃ × P_Cr / (P_HCO₃ × U_Cr)`.

| Materiał | Potrzebne stężenia | Jednostki formularza |
|---|---|---|
| Ta sama punktowa próbka moczu | HCO₃ i kreatynina | HCO₃: mmol/L; Cr: mg/dL, µmol/L lub mmol/L |
| Krew pobrana równocześnie | HCO₃ i kreatynina | HCO₃: mmol/L; Cr: mg/dL, µmol/L lub mmol/L |

Dla jednowartościowego HCO₃⁻ mmol/L i mEq/L są liczbowo równoważne.
Stała etykieta mmol/L usuwa zbędny wybór. Kreatyniny są sprowadzane
do wspólnej jednostki; zachowano przelicznik dotychczasowej ścieżki:
**1 mg/dL = 88,4 µmol/L = 0,0884 mmol/L**.

U_HCO₃ = 0 daje poprawne FEHCO₃ = 0. Pozostałe trzy stężenia muszą
być dodatnie, a wszystkie cztery skończone. Puste pole, ujemna wartość,
nieznana jednostka lub nierówność zamiast dokładnego stężenia nie są
poprawnymi operandami. Laboratoryjne „nie wykryto” bez liczbowej
granicy nie staje się dokładnym zerem; `<5 mmol/L` nie oznacza 5 mmol/L.
Nie wprowadzono limitu opartego na surowej liczbie przed konwersją ani
obcinania FEHCO₃ do 100%.

Wiek, płeć, masa, wzrost, BSA, objętość i czas zbiórki nie są operandami.
Cztery stężenia wystarczają do liczby. Nie wymaga się dodatkowo rodzaju
lub pory moczu, potwierdzenia obciążenia, metody laboratoryjnej ani danych
do drugiego poziomu „pełnej interpretacji”. Dostępny wiek pozostaje
kontekstem pacjenta, bez dobierania niezweryfikowanej normy.

## Właściwy parametr laboratoryjny

Pole **„Wodorowęglany we krwi”** obejmuje aktualne HCO₃ z gazometrii
albo laboratoryjne HCO₃ / CO₂ całkowite z chemii surowicy lub osocza.
ERKNet/ESPN 2021 dopuszcza ocenę HCO₃ jako całkowitego CO₂ lub pośrednio
w gazometrii żylnej. **tCO₂ jest przybliżeniem HCO₃, nie chemicznie
identyczną wielkością.** Nie stosuje się dodatkowego mnożnika 0,95,
odejmowania stałej ani innej automatycznej korekty.

Przy polu znajduje się pomoc: **„Z gazometrii wpisz HCO₃⁻ aktualne,
nie standardowe.”** Standardowe HCO₃ jest wielkością wyznaczoną po
modelowym sprowadzeniu pCO₂ do 40 mmHg, nie aktualnym stężeniem.
Różnice metod, materiału i interferencje mogą mieć znaczenie zwłaszcza
w ocenie testu czynnościowego; sam formularz nie potwierdza ich zamienności.

U_HCO₃ musi pochodzić z wyniku laboratoryjnego odpowiedniego dla moczu.
Możliwe są metody enzymatyczne, spektrofotometryczne lub wyliczenie
laboratoryjne z oznaczonych pH i pCO₂ właściwej próbki. Nie zastępuje
się U_HCO₃ samym pH ani pCO₂ przyjętym z krwi. Formularz nie dodaje
pól pH/pCO₂ i nie wykonuje takiej rekonstrukcji. Pobranie i transport
powinny odpowiadać wymaganiom danego laboratorium i metody; nie narzuca
się wszystkim jednego sposobu zabezpieczenia lub czasu transportu.

## Założenia próbek i znany kontekst

Wspólna próbka moczu i równoczesne pobranie krwi są opisanym założeniem,
jeżeli nie ma zachowanego potwierdzenia lub sprzeczności. Nie oznacza
to potwierdzonego faktu. Gazometria i kreatynina krwi nie muszą pochodzić
z tej samej fizycznej probówki. Znana inna próbka moczu lub inny czas
krwi blokuje liczbę i zapis, zachowując stężenia. Jawne „Nie” ma
pierwszeństwo przed dawnym potwierdzeniem; niezaznaczony dawny checkbox
sam nie dowodzi niezgodności. Nie ustanawia się uniwersalnego okna
„do X godzin”. Korekta informacji o próbkach nie potwierdza odrębnego
protokołu UAG lub TmP/GFR ani wykonania obciążenia.

**Nie zakładamy, że wykonano lub zakończono test obciążenia.** Znana
informacja o podaniu wodorowęglanu pozostaje w ocenie jako fakt z chwili
badania, bez automatycznego potwierdzania osiągnięcia warunków protokołu.
Nieznane, jawnie nieprzeprowadzone i odnotowane obciążenie zachowują
odrębne znaczenie. Prawidłowe HCO₃ lub dawne potwierdzenie innego wzoru
nie dowodzą wykonania testu.

Nie dodaje się ankiety stabilności kreatyniny, AKI, IFCC/IDMS, PChN lub
leków. Ogólne założenie „bez AKI” nie jest warunkiem arytmetyki FEHCO₃.
Znane PChN, AKI, szybko zmieniająca się kreatynina, diuretyki i leczenie
zasadami zachowują znaczenie w komentarzu i zapisie. Brak danych nie
potwierdza nieobecności tych czynników.

## Jeden wynik i granice porównania

W przejrzanych źródłach **nie zweryfikowano odpowiednio opisanego zdrowego
przedziału referencyjnego punktowego FEHCO₃ według wieku**. To granica
pokrycia źródłowego implementacji, nie dowód nieistnienia wszystkich
publikacji lub lokalnych norm. Progi nerkowe HCO₃ w mmol/L, dane po
obciążeniu i wartości z chorych kohort nie są normą FEHCO₃ w procentach.

| Grupa | Zweryfikowane pokrycie | Konsekwencja |
|---|---|---|
| Wcześniaki i noworodki | Dane o zależności od masy i dnia życia; bez odczytanej odpowiedniej tabeli zdrowego RI. | Liczba bez zastępczej normy. |
| Niemowlęta | Małe badania fizjologiczne i chore serie; opisy przejściowej utraty HCO₃ w dRTA. | Bez uniwersalnej normy i diagnozy z samego pasma procentowego. |
| Starsze dzieci i dorośli | Przeglądy diagnostyki i warunkowe testy czynnościowe. | Progów testu nie przenosi się na zdrową rutynową próbkę. |

Karta B łączy wartość i procent, **„Norma dla wieku / Brak normy do
porównania”** oraz komentarz:

> Sam wynik nie potwierdza ani nie wyklucza proksymalnej kwasicy
> cewkowej. Interpretacja zależy od stężenia HCO₃⁻ we krwi i warunków badania.

Karta pozostaje neutralna, także przy zerze, małym lub dużym wyniku.
Bez odpowiedniego odniesienia **`outOfRange:null`**, nie `false`
oznaczające „w normie”. Znane czynniki otrzymują bursztynową uwagę;
nie powstaje automatyczna kategoria pacjenta lub rozpoznanie RTA.

### Progi opisane wyłącznie w Szczegółach

Tabela jest przypisana **Yaxley i Pirrone 2016**, s. 529. Dotyczy
odpowiednio przeprowadzonego obciążenia z osiągnięciem właściwego
HCO₃ krwi, a nie dowolnej próbki albo samego podania zasad.

| FEHCO₃ | Znaczenie w warunkach tego testu |
|---|---|
| <5% | Nie wskazuje na znaczne upośledzenie reabsorpcji HCO₃ w warunkach testu. |
| 5–15%, obie granice włączone | Wynik niejednoznaczny. |
| >15% | Przemawia za zaburzeniem reabsorpcji proksymalnej; wymaga oceny klinicznej. |

W tej implementacji tabela nie klasyfikuje wyniku nawet po odnotowaniu
podania wodorowęglanu. Nie jest normą wieku i nie nadaje samodzielnego
rozpoznania. Bonner i Hladik 2025 wspierają warunkowe **>15%** po
obciążeniu. Haque i wsp. 2012 opisują **≥15%** oraz możliwe łagodniejsze
defekty przy niższych wartościach; nie miesza się tych granic z wybranym
profilem. Dokładnie 15% nie jest >15%.

Santos 2015 opisuje FEHCO₃ **6–15% u niektórych niemowląt z dRTA** przy
znormalizowanym HCO₃ krwi. Pasmo 5–15% nie diagnozuje zatem pRTA lub
„mieszanej RTA”. Nie wymaga się wszystkim pacjentom HCO₃ ≥24 mmol/L;
warunki ocenia się według właściwego wieku, materiału i protokołu.

Przy HCO₃ krwi poniżej obniżonego progu nerkowego pRTA może ponownie
niemal całkowicie reabsorbować HCO₃. **Mały wynik zwykłej próbki nie
wyklucza pRTA.** Duże wydalanie w jawnej kwasicy może dostarczać
informacji także bez zakończonego obciążenia, ale samo niskie HCO₃ nie
dowodzi kwasicy metabolicznej. Kalkulator nie automatyzuje tego
rozpoznania ani nie przedstawia instrukcji przeprowadzania testów.

## Źródła, populacje i granice odczytu

Odczyt 25.10.2026. Pełnych publikacji nie kopiowano do repozytorium.

1. **Santos F, Ordóñez FA, Claramunt-Taberner D, Gil-Peña H.**
   *Clinical and laboratory approaches in the diagnosis of renal tubular
   acidosis.* Pediatr Nephrol. **2015;30:2099–2107**.
   [DOI 10.1007/s00467-015-3083-9, pełny PDF wydawcy](https://link.springer.com/content/pdf/10.1007/s00467-015-3083-9.pdf).
   Odczyt pełnego artykułu: s. 2101 (ustanie utraty przy niskim HCO₃),
   s. 2102–2103 „Bicarbonate load” (wzór i warunki), tabela 3 s. 2105.
   Przegląd głównie pierwotnych RTA u dzieci, nie zdrowa kohorta
   referencyjna. Opis 6–15% u niemowląt z dRTA nie jest normą niemowląt.
2. **Yaxley J, Pirrone C.** *Review of the Diagnostic Evaluation of
   Renal Tubular Acidosis.* Ochsner J. **2016;16(4):525–530**.
   PMID 27999512, PMCID PMC5158160;
   [oficjalny artykuł](https://www.ochsnerjournal.org/content/16/4/525),
   [pełny PDF wydawcy](https://www.ochsnerjournal.org/content/ochjnl/16/4/525.full.pdf).
   Odczyt pełnego PDF, s. 528 (pojedyncze oznaczenie w kwasicy) i ramki
   s. 529 (warunkowe <5 / 5–15 / >15 oraz wzór). Przegląd diagnostyczny,
   bez zdrowych przedziałów wieku lub walidacyjnej kohorty RI.
3. **Bonner R, Hladik G.** *Renal Tubular Acidosis: Core Curriculum 2025.*
   Am J Kidney Dis. **2025;85(4):501–512**.
   [DOI 10.1053/j.ajkd.2024.08.014](https://doi.org/10.1053/j.ajkd.2024.08.014),
   PMID 39864011. Pełny artykuł odczytano z
   [kopii edukacyjnej](https://ucthebean.com/wp-content/uploads/2025/09/rta-core-curriculum-ajkd-2025.pdf),
   ze zgodnym DOI, autorstwem i paginacją; s. 506–508, zwłaszcza
   „Confirmatory testing for proximal RTA”. Oficjalny kanał PDF
   zwracał HTTP 403, co nie jest dowodem paywalla. Przegląd z przykładami
   dorosłych; >15% po obciążeniu, bez tabeli zdrowych norm FEHCO₃.
4. **Haque SK, Ariceta G, Batlle D.** *Proximal renal tubular acidosis:
   a not so rare disorder of multiple etiologies.* Nephrol Dial
   Transplant. **2012;27(12):4273–4287**.
   [DOI 10.1093/ndt/gfs493, pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC3616759/).
   Odczyt pełnego tekstu przez publiczny XML Europe PMC, części
   „Pathophysiology and clinical diagnosis” i „Diagnosis of proximal
   RTA”. Obniżony próg reabsorpcji i ustanie wydalania mimo pRTA;
   odmienne ≥15% nie jest podmieniane na wybrane >15% Yaxley.
5. **Trepiccione F i wsp.** *Distal renal tubular acidosis: ERKNet/ESPN
   clinical practice points.* Nephrol Dial Transplant.
   **2021;36:1585–1596**.
   [DOI 10.1093/ndt/gfab171, pełny ERKNet PDF](https://www.erknet.org/fileadmin/Guidelines/Trepiccione_et_al.__2021__CPR_dRTA.pdf).
   S. 1587, tabela 2, przypis b: HCO₃ jako całkowite CO₂ lub pośrednio
   z gazometrii żylnej; s. 1589: przejściowa dysfunkcja proksymalna
   niemowląt. Praktyczne punkty dotyczą dRTA, nie osobnego badania
   zamienności metod FEHCO₃ lub norm zdrowej populacji.
6. **Mayo Clinic Laboratories, HCO3, Bicarbonate, Serum**,
   [oficjalny katalog](https://www.mayocliniclabs.com/test-catalog/Overview/800005).
   Odczyt pełnych sekcji metody, aliasów, „Clinical Information”
   i „Cautions”; brak jawnej daty rewizji. Pomiar fotometryczny/enzymatyczny,
   alias CO₂ surowicy/osocza, część rozpuszczonego CO₂ i ograniczenia
   próbki. Zakres HCO₃ krwi nie jest zakresem FEHCO₃.
7. **Siemens Healthineers Academy**, *General Laboratory: Blood Gas:
   Clinical Significance Online Training*,
   [materiał producenta](https://academy.siemens-healthineers.com/_/en-us/general-laboratory-blood-gas-clinical-significance-online-training/).
   Odczyt części HCO₃; brak jawnej daty rewizji. Rozróżnia aktualne
   i standardowe HCO₃. Nie jest źródłem norm FEHCO₃.
8. **Seattle Children’s, LAB1970 Urine Bicarbonate**,
   [oficjalny katalog](https://seattlechildrenslab.testcatalog.org/show/LAB1970-1),
   oraz **Mayo FBIUR Bicarbonate, Urine**,
   [oficjalny katalog](https://www.mayocliniclabs.com/test-catalog/Overview/75383).
   Odczyt całych wpisów, bez jawnej daty rewizji. Metody odpowiednio
   spektrofotometryczna oraz enzymatyczna NMS Labs. Seattle <5 mEq/L
   jest stężeniem U_HCO₃, nie procentem FEHCO₃. „None detected” Mayo
   nie dostarcza dokładnego zera. Różne wymagania transportowe nie
   uzasadniają jednego formularzowego protokołu dla wszystkich laboratoriów.

Małe pierwotne badanie Edelmann i wsp. **1967**, J Clin Invest
**46:1309–1317**, [DOI 10.1172/JCI105623](https://doi.org/10.1172/JCI105623),
obejmowało reabsorpcję u **6 niemowląt 1–12 miesięcy**. Odczytano pełny
PDF: niższy próg osoczowy i krzywe po obciążeniu nie są zdrowym RI
punktowego FEHCO₃. McSherry, Sebastian i Morris **1972**, J Clin Invest
**51:499–514**, [DOI 10.1172/JCI106838](https://doi.org/10.1172/JCI106838),
to pełny odczyt serii **4 chorych niemowląt**, nie norm zdrowych dzieci;
u dwóch FE 6–9% w szerokim zakresie HCO₃. Część pomiarów odnosi się
do klirensu inuliny i nie jest przenoszona jako norma tego kalkulatora.
Sato i wsp. **2002**, Early Hum Dev. **70:15–24**,
[DOI 10.1016/S0378-3782(02)00042-7](https://doi.org/10.1016/S0378-3782(02)00042-7),
obejmowali 69 noworodków AGA z NICU, dni 0–2 i 4–6. Odczytano abstrakt
i fragment metod, bez pełnych tabel; nie wdraża się nieodczytanych liczb.

## Rozdzielenie danych, obliczenia i historii

`clcr_fehco3_reference_data.js` zawiera źródła i ograniczenia polityki
**`FEHCO3_CONTEXT_2026_10`, wersja 1**. `VildaClcrFehco3.compute(input)`
liczy iloraz, a `VildaClcrFehco3.evaluate(input, policy)` w
`clcr_fehco3.js` przyjmuje wersjonowaną politykę jako argument.
Renderer nie tworzy własnej normy ani kategorii. Brak polityki nie
uruchamia ukrytego zakresu referencyjnego w matematyce.

Dokładny iloraz dziesiętnych wejść/jednostek jest odrębny od liczby
maszynowej i tekstu prezentacji. Mała dodatnia liczba nie staje się zerem;
15,0001% nie jest przedstawiane jako dokładnie 15%. Ochrona strony
wartości 5 i 15 w formatowaniu nie uruchamia klasyfikacji klinicznej.
Notacja naukowa ogranicza długość skrajnych wartości. Skończony wynik
nie ginie wskutek niedomiaru lub przepełnienia pośrednich iloczynów.
Dodatni wynik niereprezentowalny jako dodatnia skończona liczba jest
błędem, nie zapisywanym zerem. Gotowość, karta i możliwość zapisu
korzystają z tej samej oceny wejścia.

Snapshot **`clcr-fehco3`, wersja 1**, zachowuje liczbę, dokładny ułamek,
tekst, wejścia i jednostki, kontekst pacjenta, założenia i potwierdzenia
próbek, znane fakty, informację o obciążeniu, źródła, politykę i ocenę
z chwili zapisu. Używa istniejącej noty laboratoryjnej bez migracji sejfu.
Historia nie dobiera ponownie odniesienia według obecnego pacjenta lub
źródła. Edycja liczby nie może pozostawić niezgodnego starego snapshotu.

Starsze wpisy zachowują przecinek, małą dodatnią wartość i operator;
`<0,001%` nie staje się dokładnym punktem 0,001%. **Nie odtwarza się
precyzji, którą stary zapis bezpowrotnie utracił jako zero.** Nowa lub
niepełna sesja czyści brakujące HCO₃ oraz dawne potwierdzenie obciążenia,
zamiast łączyć je z nowymi kreatyninami. Zwykłe przełączanie wzoru
w bieżącej sesji zachowuje intencjonalnie wpisane lub puste pola.

## Syntetyczne kontrakty regresyjne

Wszystkie dane są fikcyjne. HCO₃ w mmol/L, Cr w mg/dL, jeśli nie podano inaczej.

| Wejście / stan | Oczekiwany wynik lub zachowanie |
|---|---|
| U_HCO₃ 12, P_HCO₃ 24; U_Cr 100, P_Cr 1 | 0,5%, neutralnie; `outOfRange:null`. |
| U_HCO₃ 0,024, P_HCO₃ 24; U_Cr 100, P_Cr 1 | 0,001%, zachowane w widoku, kolektorze i zapisie. |
| U_HCO₃ 1, P_HCO₃ 25; U_Cr 100, P_Cr 1 | 0,04%, nie 0%. |
| U_HCO₃ 120 / 360 / 360,0024; P_HCO₃ 24; U_Cr 100, P_Cr 1 | Dokładnie 5 / 15 / 15,0001%; bez automatycznej klasyfikacji. |
| U_HCO₃ 24, P_HCO₃ 24; U_Cr 8,84 mmol/L, P_Cr 88,4 µmol/L | Dokładnie 1%, jak przy U_Cr 100/P_Cr 1 mg/dL. |
| U_HCO₃ 0 / puste; pozostałe dodatnie | Poprawne 0% / brak liczby; zero w pozostałych stężeniach blokuje. |
| Równoważne U_Cr 50001 µmol/L i mg/dL | Ta sama kwalifikacja po konwersji, bez surowego limitu jednostki. |
| Ten sam komplet dla wcześniaka, niemowlęcia, dziecka, dorosłego lub bez wieku | Ta sama liczba bez zastępczej normy i dodatkowego pytania. |
| Znana PChN, diuretyk i podanie zasad; zapis, następnie zmiana pacjenta | Zachowane fakty i pierwotna ocena; brak dopisanego zakończenia protokołu. |
| Jawnie różne próbki lub inny czas krwi, następnie korekta informacji | Sprzeczność blokuje liczbę/zapis; korekta zachowuje stężenia i niezależne fakty. |
| Nowa/niepełna sesja bez HCO₃/obciążenia po pełnym komplecie | Brak dziedziczenia starych stężeń i protokołu. |
| Stary zapis `0,001` lub `<0,001%` | Zachowana wartość/tekst; granica nie staje się dokładnym punktem. |
| Test arytmetyczny: wszystkie cztery stężenia 1e-200 lub wszystkie 1e200 | 100%, bez błędu pośredniego iloczynu; nie przypadek fizjologiczny. |

Regresje `klirens-fehco3-engine.test.mjs`, `klirens-fehco3-ui.test.mjs`,
`klirens-fehco3-save.test.mjs`, `klirens-fehco3-session.test.mjs` oraz
scenariusze przeglądarkowe mają wywoływać rzeczywisty kod produkcyjny.
Wyniki ich wykonań, testów offline, kontroli GitHub, commit i PR podaje
opis PR. Zielone testy nie zastępują akceptacji klinicznej właściciela
ani przeglądu po zmianie źródeł lub polityki.
