# Rejestr algorytmów i danych referencyjnych

Wersja początkowa rejestru dla bazowego `audyt` `4c36d8120018087d47cdba3f4aa153eb6c80c83b` z 22 lipca 2026 r.

Rejestr jest inwentaryzacją techniczną. Nie nadaje opisanym modułom statusu walidowanego wyrobu medycznego ani nie potwierdza aktualności wszystkich źródeł.

## Inwentaryzacja

| ID | Obszar | Główne pliki | Obecna ochrona automatyczna | Status |
|---|---|---|---|---|
| GROWTH-LMS | Centyle, SDS i dane LMS | `centile_data.js`, `vilda_growth_reference_data.js`, `ds_lms.js` | Vitest wybranych kontraktów `vilda_growth_reference_data.js`; brak pełnego testu wszystkich zbiorów | zinwentaryzowane; źródła wymagają mapowania per zbiór |
| GROWTH-PRED | Prognozy wzrostu ostatecznego | `bayley_pinneau_data.js`, `rwt_data.js`, `reinehr_cdgp_data.js`, `advanced_growth_kowd.js` | kontrola składni; brak dedykowanej regresji wyników klinicznych | źródło do weryfikacji |
| SGA-BIRTH | Klasyfikacja SGA i dane urodzeniowe | `sga_birth_module.js`, `sga_intergrowth_data.js`, `sga_malewski_data.js` | kontrola składni; brak dedykowanej regresji wyników klinicznych | zinwentaryzowane; wymaga pełnych przypadków granicznych |
| VITALS-PED | Parametry życiowe dzieci | `vitalSigns.js`, `bp_module.js`, `circumference_module.js`, `respiratory_module.js` | kontrola składni; brak dedykowanej regresji wyników klinicznych | zinwentaryzowane; źródła częściowo opisane w modułach |
| ENERGY | BMI, BMR, TEE i plan energetyczny | `app.js`, `vilda_diet_plan_ui.js`, `vilda_diet_recommendations.js` | E2E ładowania `index.html` i centralny smoke; brak pełnej regresji wszystkich obliczeń | zinwentaryzowane; wymaga rozpisania wzorów i populacji |
| INTAKE | Szacowane spożycie energii | `vilda_estimated_intake*.js` | Vitest modelu szacowanego spożycia | test regresyjny; źródła i ograniczenia do ujednolicenia |
| NUTRITION | Normy żywienia i mikroskładniki | `nutrition_norms.js`, `nutrition_micros.js`, pliki `micronorms_*.json` | kontrola składni; brak dedykowanej regresji wartości klinicznych | źródło do weryfikacji per składnik |
| RENAL | Klirens, eGFR, BSA, wskaźniki moczowe, kamica i adekwatność HD | `kalkulator-klirens.html`, `inline_kalkulator_klirens_*.js`, `clcr_*.js` | 186 dedykowanych testów jednostkowych Klirens oraz cztery zestawy E2E wywołujące rzeczywisty interfejs; dodatkowo testy składni i PWA | wdrożone do testów; nadal wymaga walidacji prospektywnej i końcowej akceptacji nefrologicznej |
| HOMA | HOMA-IR i interpretacja | `homa-ir.html` | E2E znanego przypadku | test regresyjny; progi populacyjne do pełnego rejestru |
| LAB-UNITS | Konwersje jednostek laboratoryjnych | `lab_unit_converter.js`, `lab_units_data.js` | Vitest konwersji | test regresyjny; każda nowa para jednostek wymaga źródła |
| LAB-PANELS | Panele i interpretacje laboratoryjne | `lab_clinical_panels.js`, `lab_pin_result.js` | kontrola składni; brak dedykowanej regresji interpretacji klinicznych | wysoki priorytet; brak pełnego pokrycia klinicznego |
| GH-IGF | Dawkowanie i monitorowanie GH/IGF-1 | `gh_igf_therapy.js`, `gh_therapy_monitor.js`, `gh_therapy_segments.js` | kontrola składni; testy PRO dotyczą uprawnień, nie dawkowania ani terapii | wysoki priorytet przeglądu klinicznego |
| OBESITY-RX | Farmakoterapia i odpowiedź w otyłości | `obesity_therapy.js`, `obesity_therapy_monitor.js`, `obesity_response_criteria.js` | kontrola składni; testy PRO dotyczą uprawnień, nie farmakoterapii | wysoki priorytet przeglądu klinicznego |
| ANTIBIOTIC-RX | Schematy antybiotykoterapii | `antibiotic_therapy.js` | kontrola składni; brak dedykowanej regresji dawkowania | wymaga ponownego przeglądu mapowania źródeł |
| BISPHOS-RX | Bisfosfoniany | `bisphos_therapy.js`, `bisphos_therapy_monitor.js` | kontrola składni; brak dedykowanej regresji dawkowania | zinwentaryzowane; dawki i limity do rejestru szczegółowego |
| OTHER-RX | Grypa, nadciśnienie i tarczyca | `flu_therapy.js`, `hypertension_therapy.js`, `thyroid_cancer_kids.js` | kontrola składni; brak dedykowanej regresji dawkowania | źródło do weryfikacji per moduł |
| STEROIDS | Konwersje GKS/AAS i model HPTA | `steroidy.html` | kontrola składni; brak dedykowanego E2E lub regresji wyników | zinwentaryzowane; część HPTA ma charakter edukacyjny |
| DIABETES | Kalkulatory diabetologiczne | `cukrzyca.html`, `cukrzyca.js` | kontrola składni; brak dedykowanego E2E lub regresji wyników | źródło do weryfikacji |

## Długi walidacyjne o najwyższym priorytecie

### ANTIBIOTIC-RX — mapowanie cytowań

W `antibiotic_therapy.js` występują powtarzające się klucze w mapie źródeł i liczne stłumienia `no-dupe-keys`. Obliczenia przechodzą obecne testy, ale nie dowodzi to poprawnego przypisania każdej rekomendacji do cytowania.

Przed zmianą dawek należy:

1. zinwentaryzować unikalne schematy i ich klucze;
2. przypisać źródło do każdego schematu bez nadpisywania kluczy;
3. dodać przypadki regresyjne dla minimum, maksimum i ograniczeń wieku/masy;
4. uzyskać akceptację kliniczną.

### RENAL — profil algorytmów wdrożony do testów 2026-07-28

Status tego wpisu to **wdrożenie do testów**, a nie walidacja kliniczna ani regulacyjna. Reguły kwalifikacji populacji, próbki i metody oznaczenia są częścią wyniku: ostrzeżenie w interfejsie nie zastępuje blokady obliczenia.

#### Zakres i ograniczenia

| Obszar | Wdrożona reguła | Najważniejsze ograniczenia |
|---|---|---|
| eGFR z kreatyniny | CKiD U25 eGFRcr dla wieku 1–25 lat; 2021 CKD-EPI eGFRcr od 18 lat; w wieku 18–25 lat oba wyniki są pokazywane równolegle. Bedside Schwartz 2009 pozostaje wzorem porównawczym w wieku 1–16 lat. | Podejrzenie AKI lub szybko zmieniająca się Scr blokują wynik. Przy nieznanej stabilności albo niepotwierdzonej zgodności oznaczenia z IDMS aplikacja pokazuje oszacowanie bez kategorii G; stabilna Scr i IDMS pozwalają na kategoryzację G. Wyjątkiem jest ścieżka neonatalna, w której enzymatyczna metoda IDMS stanowi twardą bramkę. CKiD U25 opracowano głównie w łagodnej lub umiarkowanej CKD; nie jest uniwersalnym przesiewem zdrowej populacji. |
| eGFR z cystatyny C | 2021 CKD-EPI eGFRcr-cys od 18 lat; CKiD U25 eGFRcys i średnia eGFRcr-cys w wieku 1–25 lat. | Identyfikowalność ERM-DA471/IFCC jest twardą bramką. Metoda oznaczenia jest raportowana; jej brak albo metoda inna niż profil nefelometryczny CKiD generują ograniczenie, lecz same nie blokują obliczenia. Wynik jest blokowany przy niestabilnym markerze; wariant U25 ma ograniczoną możliwość uogólnienia poza profilem CKiD. |
| Noworodek | Ograniczone oszacowanie `0,31 × wzrost [cm] / Scr [mg/dL]` dla donoszonego noworodka w 0.–28. dniu życia. Aplikacja dodatkowo wymaga bieżącej masy ciała >2,5 kg jako konserwatywnej bramki bezpieczeństwa, a nie granicy zwalidowanej populacji. | Wcześniactwo, masa ≤2,5 kg, 29. dzień życia, AKI lub niestabilna Scr blokują wynik. Równanie wyprowadzono w metaanalizie indywidualnych danych pacjentów; autorzy wskazali potrzebę walidacji w dużej kohorcie noworodkowej. Wynik nie otrzymuje kategorii G KDIGO. |
| CrCl i BSA | Klirens ze zbiórki czasowej wymaga rzeczywistego czasu, kompletnego protokołu i próbki surowicy pobranej w trakcie zbiórki. Indeksowanie używa Haycocka przed 18. rokiem życia i Du Bois od 18 lat. | Błędy zbiórki pozostają głównym źródłem błędu. Cockcroft-Gault jest dostępny wyłącznie od 18 lat: surowy eCrCl używa podanej masy rzeczywistej i jest nieindeksowany, a opcjonalny `cg_norm` przelicza go przez BSA do 1,73 m². Oba pozostają eCrCl, nie eGFR. |
| KDIGO G/A, ACR i PCR | Kategorie są wyznaczane z wartości niezaokrąglonej. Obliczenie ACR/PCR wymaga zgodnych jednostek i potwierdzenia wspólnej próbki; kategoria A i automatyczna interpretacja pediatryczna wymagają pierwszego porannego moczu bez zaznaczonych konfunderów. Kategorie G i A są wstrzymane przed 2. rokiem życia. W wieku 6 mies.–<2 lat automatyczny próg pediatryczny dotyczy wyłącznie PCR <500 mg/g; od 2 do <18 lat stosowane są odrębne progi ACR/PCR. | Kategoria G nie jest pokazywana przy AKI, niestabilnym lub niestandaryzowanym markerze. Sama kategoria nie rozpoznaje PChN bez kryterium przewlekłości. |
| Frakcje wydalane i TmP/GFR | Analit i kreatynina muszą pochodzić z tej samej próbki moczu, a próbka krwi być równoczesna. TmP/GFR używa drugiego porannego moczu po nocy na czczo; przed 19. rokiem stosowana jest ścieżka pediatryczna, od 19. roku algorytm Waltona–Bijvoeta/Payne’a z gałęzią dla TRP >0,86. | TmP/GFR nie jest liczone z DZM. Automatyczne zakresy laboratoryjne pozostają wyłączone do czasu wersjonowanego profilu metody i lokalnej walidacji. |
| Kamica | Profil EAU Urolithiasis 2026 rozdziela dorosłe mmol/24 h od pediatrycznej interpretacji wapnia w mmol/kg/24 h i wiekowego Ca/Cr w próbce punktowej; konwencja masowa szczawianu jest jawna. Pozostałe pediatryczne anality są pokazywane liczbowo bez automatycznych progów. Progi DZM wymagają dokładnie 24-godzinnej bieżącej zbiórki i właściwego kontekstu. | EAU zaleca dwie kolejne zbiórki w swoistej ocenie metabolicznej. Komunikaty są przesiewowe, nie stawiają rozpoznania i nie są samodzielnym zaleceniem leczenia. |
| Hemodializa | Moduł dotyczy wyłącznie pojedynczej sesji IHD. spKt/Vurea Daugirdasa II używa źródłowych par GFAC dla 2–7 sesji/tydz. i rzeczywistego PIDI; URR i eKt/V są liczone z niezaokrąglonych danych, z uwzględnieniem dostępu AV/CVC, protokołu próbek i aktualności Kru. | Moduł jest niedostępny przed 2. rokiem życia, a w wieku 2–17 lat wymaga protokołu slow-flow. Dla 5–7 sesji/tydz. sesja >300 min jest blokowana i wymaga formalnego modelowania mocznika. Pary GFAC 2–7 pochodzą z symulacji, a walidację FHN opisano dla schematów 3, 4 i 6×/tydz. Progi 1,2/1,4 są stosowane tylko w opisanym profilu dorosłej IHD 3×/tydz.; poza nim oraz w pediatrii wynik techniczny nie otrzymuje dorosłej kategorii adekwatności. |

EKFC pozostaje wyłączone za bramką lokalnej walidacji. Historyczny Schwartz z dobieranym współczynnikiem (k) jest wyłączony z rutynowego użycia.

#### Źródła wersjonowane

1. [KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD](https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf) — klasy G/A, przewlekłość, dobór równań, pediatria i ograniczenia CrCl.
2. [NIDDK — eGFR Equations for Children, Adolescents, & Young Adults](https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/glomerular-filtration-rate-equations/children-adolescents-young-adults) oraz [kalkulatory dla dorosłych i pediatrii](https://www.niddk.nih.gov/health-information/professionals/clinical-tools-patient-management/kidney-disease/laboratory-evaluation/estimated-gfr-calculators/adults-pediatrics) — CKiD U25, Bedside Schwartz, ścieżka neonatalna i porównanie w wieku 18–25 lat.
3. Inker LA et al., 2021 CKD-EPI bez zmiennej rasy, [DOI 10.1056/NEJMoa2102953](https://doi.org/10.1056/NEJMoa2102953).
4. Pierce CB et al., CKiD U25, [DOI 10.1016/j.kint.2020.10.047](https://doi.org/10.1016/j.kint.2020.10.047); Schwartz GJ et al., Bedside Schwartz, [DOI 10.1681/ASN.2008030287](https://doi.org/10.1681/ASN.2008030287).
5. Smeets NJL et al., równanie eGFR `0,31 × wzrost / Scr` dla noworodków, [DOI 10.1681/ASN.2021101326](https://doi.org/10.1681/ASN.2021101326) — metaanaliza indywidualnych danych pacjentów; wymagana dalsza walidacja w dużej kohorcie noworodkowej.
6. Derain Dubourg L et al., TmP/GFR od dzieciństwa do dorosłości, [DOI 10.1093/ndt/gfab331](https://doi.org/10.1093/ndt/gfab331); Barth JH et al., algorytm Waltona–Bijvoeta/Payne’a, [DOI 10.1258/0004563001901371](https://doi.org/10.1258/0004563001901371).
7. [EAU Guidelines on Urolithiasis 2026](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention) — próbki, jednostki, progi i cele kamicowe.
8. Daugirdas JT, równanie II, [DOI 10.1681/ASN.V451205](https://doi.org/10.1681/ASN.V451205); Daugirdas JT, eKt/V, [DOI 10.1016/S1073-4449(12)80028-8](https://doi.org/10.1016/S1073-4449(12)80028-8); Daugirdas JT et al., GFAC zależny od częstości/PIDI, [DOI 10.1093/ndt/gfs115](https://doi.org/10.1093/ndt/gfs115); KDOQI 2006 — protokół pobrania, [DOI 10.1053/j.ajkd.2006.03.051](https://doi.org/10.1053/j.ajkd.2006.03.051); [KDOQI 2015](https://doi.org/10.1053/j.ajkd.2015.07.015).
9. Haycock GB et al., BSA, [DOI 10.1016/S0022-3476(78)80601-5](https://doi.org/10.1016/S0022-3476(78)80601-5); Du Bois D i Du Bois EF, [DOI 10.1001/archinte.1916.00080130010002](https://doi.org/10.1001/archinte.1916.00080130010002).
10. Cockcroft DW i Gault MH, [DOI 10.1159/000180580](https://doi.org/10.1159/000180580).

#### Reprezentatywne przypadki syntetyczne

| Przypadek | Wejście | Oczekiwany wynik produkcyjny |
|---|---|---|
| CKD-EPI-CR | mężczyzna, 50 lat, Scr 1,0 mg/dL, marker stabilny, bez AKI | 2021 CKD-EPI eGFRcr ≈91,6915 mL/min/1,73 m²; przy AKI wynik i kategoria G są blokowane |
| U25-CR | dziewczynka, 10 lat, 140 cm, Scr 0,6 mg/dL, IDMS | CKiD U25 eGFRcr ≈82,9016 mL/min/1,73 m²; od 26. urodzin wzór jest niedostępny |
| NEONATAL | donoszony noworodek, 14. dzień, 3,4 kg, 50 cm, Scr 0,5 mg/dL oznaczona enzymatycznie i zgodna z IDMS | ograniczone eGFR 31 mL/min/1,73 m²; wcześniactwo albo 29. dzień blokuje wynik |
| BEDSIDE | dziecko 10-letnie, 140 cm, Scr 0,6 mg/dL, IDMS | Bedside Schwartz ≈96,3667 mL/min/1,73 m² jako wynik porównawczy |
| STONE-CA | Ca 4,0078 mg/dL, kompletna zbiórka 1000 mL przez 1440 min | 40,078 mg/24 h = 1,000 mmol/24 h; próg uruchamia się tylko w zgodnym profilu |
| HD-KTV | dorosły, IHD 3×/tydz., PIDI 2 dni, BUN 120→36 mg/dL w tej samej sesji; próbka pre-HD bez rozcieńczenia, próbka post slow-flow 100 mL/min przez 15 s; 240 min, UF 2 L, masa po HD 70 kg, AVF/AVG, Kru 1,5 mL/min/1,73 m² zmierzone <3 mies. wcześniej, regularne pełne sesje potwierdzone | spKt/V ≈1,401054; eKt/V ≈1,222738; URR 70%; klasyfikacja z wartości niezaokrąglonych |

Zmianie względem starej wersji mogą ulec wyniki na granicach wieku, wyniki pediatryczne wcześniej liczone wzorem dorosłym, kategorie ukrywane przy niestabilnych markerach, TmP/GFR przy wysokim TRP, indeksowany CrCl u dzieci, interpretacje kamicy oraz Kt/V po innym PIDI. Starych wyników nie należy porównywać liczba-do-liczby bez identyfikacji wersji algorytmu.

Pełną walidację przed użyciem produkcyjnym nadal stanowią: recenzja nefrologa dziecięcego i nefrologa dorosłych, test na zanonimizowanym zestawie referencyjnym, porównanie z metodami lokalnych laboratoriów oraz walidacja prospektywna.

### GROWTH-PRED — pochodzenie danych

Dane Bayley–Pinneau oraz część modelu RWT wymagają jednoznacznego zapisu pochodzenia tabel/wykresu, metody transkrypcji lub interpolacji, zakresów oraz prawa wykorzystania. Test zgodności z obecną tablicą nie zastępuje weryfikacji materiału źródłowego.

### GROWTH-PRED-KR — Khamis–Roche (prognoza wzrostu ostatecznego bez wieku kostnego), wdrożenie do testów 2026-08-04

Status wpisu to **wdrożenie do testów**, nie walidacja kliniczna. Metoda Khamisa-Roche’a (KR) prognozuje wzrost ostateczny z płci, wieku metrykalnego, aktualnego wzrostu i masy oraz średniej wzrostu rodziców (midparent), **bez wieku kostnego**. Silnik `vilda_khamis_roche.js` udostępnia `window.calculateKhamisRochePrediction`; moduł walidacji prognoz (`vilda_growth_prediction_validation.js`) wpina KR jako piątą metodę obok Bayley–Pinneau, RWT, Reinehr/CDGP i celu MPH.

#### Zakres i ograniczenia

| Obszar | Wdrożona reguła | Najważniejsze ograniczenia |
|---|---|---|
| Populacja | Model opracowano na białych dzieciach amerykańskich bez chorób (Fels Longitudinal Study, 223 chłopców i 210 dziewcząt, płd.-zach. Ohio; dane co pół roku). | Wg autorów stosowalność ograniczona do białych dzieci bez stanów zmieniających potencjał wzrostu; przydatny dla dzieci nietypowych wzrostem lub dojrzałością jak na wiek, ale nie zwalidowany dla zaburzeń endokrynologicznych ani innych populacji. Wynik ma charakter poglądowy. |
| Zmienne wejściowe | Płeć, wiek metrykalny, aktualny wzrost i masa, wzrost matki i ojca. Midparent = (matka + ojciec)/2, ta sama definicja dla obu płci. | BEZ wieku kostnego — to główna przewaga (liczy się, gdy RWT/Bayley–Pinneau nie mają wieku kostnego), ale też rezygnacja z predyktora dojrzałości. Braki wzrostu, masy lub wzrostu rodzica → brak wyniku (`missing-input`). |
| Jednostki i konwersja | Tablice współczynników w **calach/funtach**. Silnik konwertuje wejście cm→cale (÷2,54) i kg→funty (÷0,45359237), liczy w calach, wynik przelicza na cm (×2,54). | Konwersja jednostek jest częścią wzoru; zmiana stałych konwersji jest zmianą kliniczną. Zaokrąglenie wyłącznie na prezentacji. |
| Wiek | `chronologicalAgeMonths` = łączne miesiące, ma pierwszeństwo; `chronologicalAgeYears` = fallback, gdy miesięcy brak. Zaokrąglenie do pełnych miesięcy (spójnie z Bayley–Pinneau/RWT). Lat i miesięcy NIE sumuje się. | Redundantne `{ageMonths:120, ageYears:10}` oznacza 10 lat (nie 20). Regułę pilnują testy jednostkowe i integracyjny. |
| Zakres wieku i interpolacja | 4,0–17,5 r.ż., tablice co 0,5 roku. Trafienie w wiersz → współczynniki wiersza; między wierszami → **interpolacja liniowa** współczynników po wieku; poza 4,0–17,5 → `out-of-range` **bez ekstrapolacji**. Zachowanie i brzegi (włącznie) spójne z `rwtInterpolateAgeWeights` (RWT). | Poza zakresem brak wyniku, a nie oszacowanie brzegowe. |
| Transkrypcja tablic | Użyto współczynników z **erraty 1995**. Errata poprawia wyłącznie kolumnę „masa”, która w erracie jest ~10× większa niż w druku 1994 (np. dziewczęta 7,0 r.ż.: −0,13184 zamiast −0,013184). Kolumny β0 / wzrost / midparent są identyczne w 1994 i erracie. | Test-strażnik transkrypcji pilnuje kolumny „masa” (errata, nie druk 1994). Wybór erraty potwierdzony analizą wymiarową: współczynniki erraty trafiają w cel śreniorodzicielski przypadków kontrolnych, druk 1994 zawyża o 6–10 cm. |

Dokładność wg pracy źródłowej: błędy KR są „tylko nieco większe” niż metody Roche–Wainer–Thissen używającej wieku kostnego. Silnik nie nadaje prognozie statusu „zwalidowana klinicznie”.

#### Błąd metody prezentowany w karcie „Zaawansowane obliczenia wzrostowe” (dana kliniczna)

Karta pokazuje przy prognozie KR **zbiorczy (średni) 90% przedział błędu metody**, wprost z pracy 1994: średnio **±2,1 cala dla chłopców i ±1,7 cala dla dziewcząt** → wdrożone jako **±5,3 cm (chłopcy) / ±4,3 cm (dziewczęta)**. Średni MAD (50%) metody to ≈0,8 cala (≈2,0 cm). W ODRÓŻNIENIU od Bayley–Pinneau/RWT ten przedział jest **zbiorczy (nie zależy od wieku metrykalnego)** — praca podaje wartości uśrednione dla zakresu 4,0–17,5 r.ż., a nie tablicę per wiek; przy młodszym wieku rzeczywisty przedział jest większy. Wartość jest jawnie oznaczona przypisem w karcie. Wiarygodność KR w prezentacji jest ustawiona konserwatywnie na „orientacyjna” (nowa metoda, populacja Fels). Wartości ±5,3/±4,3 cm są związane w teście jednostkowym modułu prezentacji (`vilda_growth_card_c.js`).

#### Źródła wersjonowane

1. Khamis HJ, Roche AF. „Predicting adult stature without using skeletal age: the Khamis-Roche method.” *Pediatrics* 1994;94(4 Pt 1):504–507. PMID [7936860](https://pubmed.ncbi.nlm.nih.gov/7936860/) (bez DOI w indeksie PubMed).
2. Erratum: *Pediatrics* 1995;95(3):457 — korekta kolumny współczynników masy (wartości ~10× względem druku 1994). **Wartości wdrożone pochodzą z tej erraty.**

#### Reprezentatywne przypadki syntetyczne

Dane w pełni fikcyjne. Wartości oczekiwane policzono niezależnie od kodu produkcyjnego; testy pinują je z tolerancją ±0,005 cm.

| Przypadek | Wejście | Oczekiwany wynik produkcyjny |
|---|---|---|
| KR-M-10 | chłopiec 10,0 l, wzrost 138, masa 32, rodzice 163/178 | 177,1596 cm |
| KR-F-12 | dziewczynka 12,0 l, wzrost 150, masa 42, rodzice 165/179 | 165,3935 cm |
| KR-M-INTERP | chłopiec 10,25 l (interpolacja), wzrost 139, masa 32, rodzice 163/178 | 177,1694 cm; `interpolated=true` |
| KR-M-MIN | chłopiec 4,0 l (brzeg), wzrost 100, masa 16, rodzice 170/183 | 178,6989 cm |
| KR-M-MAX | chłopiec 17,5 l (brzeg), wzrost 175, masa 62, rodzice 170/183 | 174,0176 cm |
| KR-OOR | 47 mies. (3,92 l) lub 216 mies. (18,0 l) | `available:false, reason:"out-of-range"` (bez ekstrapolacji) |
| KR-AGE-REG | `{chronologicalAgeYears:10, chronologicalAgeMonths:120}` (wejście produkcyjne) | 10 lat → 177,1596 cm (NIE 20 lat / out-of-range) |

Wpływ na dotychczasowe wyniki: dodanie KR **nie zmienia** prognoz Bayley–Pinneau, RWT, Reinehr/CDGP ani celu MPH. KR pojawia się jako dodatkowa kolumna/karta w „Walidacji prognoz”, uczestniczy w wyborze metody „najbliżej FH” i w eksporcie kohorty. Karta „Zaawansowane obliczenia wzrostowe” pozostaje bez KR do osobnej decyzji (patrz PR).

### GROWTH-TRAJ — automatyczna analiza trajektorii na siatce centylowej, wdrożenie do testów 2026-08-08

Moduł `vilda_trajectory_analysis.js` (`window.VildaTrajectoryAnalysis`) analizuje wszystkie kolejne odcinki między pomiarami (wzrost, masa, BMI) i podsumowuje całą trajektorię. Renderowany w karcie „Zaawansowane obliczenia wzrostowe" pod tabelą tempa wg okresów.

#### Zakres i ograniczenia

- Moduł **nie wprowadza żadnych nowych progów klinicznych** — jest kompozycją istniejących, przyjętych reguł aplikacji:
  - statystyka punktu (centyl/SDS): wspólna ścieżka `advHistoryResolveMetric` z fallbackiem tabel Palczewskiej (jak „Podsumowanie wyników" i panel porównania A→B, v386);
  - werdykt pary punktów: progi ΔSDS identyczne z `verdictCh` panelu porównania (v388); etykiety w rejestrze lekarskim (słownik zaakceptowany przez właściciela 2026-08-08: m.in. „istotna deceleracja wzrastania", „progresja otyłości", „nadrabia niedobór wzrostu", „dalsza akceleracja wzrastania") — wspólne dla panelu porównania, alarmów kart i modułu; parytet pilnuje test `tests/unit/trajectory-analysis.test.mjs` uruchamiający realny `verdictCh` z `vilda_auth_ui.js` na siatce ~1000 przypadków;
  - opis kanału/strefy: identyczny z `interpCh` panelu (granice 3/10/25/50/75/90/97);
  - czerwona flaga pozycyjna wzrostu: ΔhSDS ≤ −1,0 względem pierwszego pomiaru z wieku ≥24 mies. (reguła alarmu kart z PR #64);
  - tempo wzrastania: produkcyjne `pickPrevForLastYear`/`pickPrevFallback`/`velocityCmPerYear`/`getVelocityThreshold` (okno 12±3 mies., fallback 6–8 mies., progi wg wieku); dla wieku >10 lat progu brak — moduł komunikuje, że normy tempa w okresie pokwitania nie są oceniane automatycznie (świadoma luka, do osobnej decyzji klinicznej właściciela).
- Kontekst kliniczny per odcinek (od v3 modułu): transkrypcja 1:1 reguł `verdictCh2` panelu porównania — terapia GH (ocena odpowiedzi przy ≥6 mies. terapii w odcinku: ΔSDS ≥0,3 dobra / <0,1 słaba), kanał rodzicielski MPH (progi ±1,5 SDS względem mpSDS), zamierzona redukcja (nakładanie ≥3 mies., nigdy przy ca<10). Kontekst przekazywany z Karty pacjenta (`_vildaCmpCtx` — ten sam, którego używa panel porównania); parytet z realnym `verdictCh2` pilnowany testem (siatka 72 000 przypadków).
- Jedyny własny parametr: `SEGMENT_MIN_GAP_M = 3` mies. — strażnik jakości danych (odcinki krótsze są pokazywane bez werdyktu, bo ocena ΔSDS na tak krótkich odstępach jest niestabilna pomiarowo). Nie jest to próg interpretacji klinicznej.
- Analiza ma charakter przesiewowy i nie zastępuje oceny klinicznej; nie nadaje się jej statusu „zwalidowana klinicznie".

#### Reprezentatywne przypadki syntetyczne

| Przypadek | Wejście | Oczekiwany wynik |
| --- | --- | --- |
| TRAJ-SEG | wzrost hSDS 0,4→0,3→−0,9→−1,0 (48→60→72→84 mies.) | najpoważniejszy odcinek 60→72 mies. (ΔSDS −1,2, „istotna deceleracja wzrastania"); całość „istotna deceleracja wzrastania" |
| TRAJ-REDFLAG | hSDS 1,9 (6 m.) → 1,3 (30 m.) → 0,1 (72 m.) | czerwona flaga od bazy 30 mies. (ΔhSDS −1,2); punkt niemowlęcy pominięty jako baza |
| TRAJ-CATCHDOWN | hSDS 1,9 (6 m.) → 0,2 (40 m.) → 0,1 (72 m.) | brak czerwonej flagi (spadek przed 24. mies.) |
| TRAJ-OBESE | pacjent 12,1→12,5 r.ż., waga/BMI >97c → >97c | „progresja nadmiaru masy (>97. centyla)" / „progresja otyłości" (słownik lekarski) |
| TRAJ-VELO | 120→124 cm w 12 mies. w wieku 8 lat | 4,0 cm/rok — poniżej normy ≥5 cm/rok (próg 5–10 lat) |

### GROWTH-LMS — kompletność cytowań

Każdy zbiór OLAF/OLA, WHO, Palczewska, zespół Downa i inne populacje specjalne powinny otrzymać osobny wpis ze źródłem, zakresem wieku, płcią, jednostkami i zasadą wyboru zbioru. Ogólna bibliografia strony nie wystarcza do prześledzenia pojedynczej stałej.

## Zasady aktualizacji rejestru

- Nie usuwaj starego wpisu bez pozostawienia informacji, czym został zastąpiony.
- Źródło podawaj wystarczająco dokładnie, aby recenzent mógł odnaleźć tabelę, równanie lub rekomendację.
- Rozróżniaj rok publikacji równania od roku wytycznych, które je rekomendują.
- Zapisuj jednostki wejściowe i wynikowe oraz moment zaokrąglenia.
- Dla danych przepisanych z tabeli zachowaj proces podwójnej kontroli transkrypcji.
- Dla interpolacji opisz metodę, zachowanie na granicach i ekstrapolację.
- W PR podaj, które wcześniej zapisane wyniki mogą zmienić się po aktualizacji.
- Nie używaj prawdziwych przypadków pacjentów jako przykładów regresyjnych.

Szczegółowy format wpisu i statusy opisuje `docs/clinical/README.md`.
