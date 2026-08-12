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
  - tempo wzrastania <10 lat: produkcyjne `pickPrevForLastYear`/`pickPrevFallback`/`velocityCmPerYear`/`getVelocityThreshold` (okno 12±3 mies., fallback 6–8 mies., progi wg wieku metrykalnego, poziom alarmowy).

#### Ocena tempa wzrastania >10 lat — hierarchia okołopokwitaniowa (akceptacja kliniczna właściciela 2026-08-08)

Źródła: Tanner JM, Whitehouse RH. *Clinical longitudinal standards…* Arch Dis Child 1976;51(3):170-9 (PMID 952550, doi:10.1136/adc.51.3.170) — centyle tempa osobno dla wcześnie/przeciętnie/późno dojrzewających; Tanner JM, Davies PS. J Pediatr 1985;107(3):317-29 (PMID 3875704, doi:10.1016/s0022-3476(85)80501-1). Próg 4 cm/rok ≈ dolna granica nadiru przedpokwitaniowego u późno dojrzewających. Populacje brytyjska/północnoamerykańska (brak polskich norm tempa w aplikacji); reguła przesiewowa, nie diagnostyczna. Parametry w `PARAMS` modułu (do strojenia przez właściciela).

| Priorytet | Dane | Reguła | Poziom |
| --- | --- | --- | --- |
| 1 | Tanner I (formularz) | tempo <4 cm/rok | alarmowy (baner + konsultacja) — konfudent skoku wykluczony badaniem |
| 1 | Tanner II–III | tempo <4 cm/rok | czujność (chip „do oceny — osłabiony skok?"); bez banera |
| 1 | Tanner IV–V | — | bez oceny; nota „deceleracja fizjologiczna po skoku" |
| 2 | wiek kostny (świeży ≤18 mies.) | norma `getVelocityThreshold(BA)`; BA 10–13/10–15 lat → <4 cm/rok | czujność (błąd oceny BA ~±1 rok) |
| 3 | brak danych | dziewczęta 10–13 lat / chłopcy 10–15 lat: <4 cm/rok | czujność („możliwy późny skok pokwitaniowy") |

Źródło etapu Tannera: pole formularza (karty na stronie głównej — stan bieżący) lub `payload.user.tannerStage` z najnowszego zapisu pacjenta (Karta pacjenta); wpis z rekordu jest używany tylko, gdy zapisany w ciągu ostatnich 12 mies. (`TANNER_FRESH_M` — stadium zmienia się w czasie); starszy jest pokazywany w pasku kontekstu jako „nieaktualny, pominięty w ocenie".

Dodatek: Tanner I u dziewcząt >13 lat / chłopców >14 lat → niezależna nota „obraz opóźnionego dojrzewania, wskazana ocena" (Palmert MR, Dunkel L. *Delayed puberty.* N Engl J Med 2012;366(5):443-53, PMID 22296078, doi:10.1056/NEJMcp1109290).

Przypadki syntetyczne: TRAJ-VELO-T1 (12 lat, 3,0 cm/rok, Tanner I → alarm); TRAJ-VELO-T2 (j.w., Tanner II → czujność, bez banera); TRAJ-VELO-T4 (Tanner IV → bez oceny, nota); TRAJ-VELO-BA (BA 8 lat świeży → norma ≥5 cm/rok, czujność; BA nieświeży → reguła generyczna); TRAJ-VELO-GEN (chłopiec 14 lat bez danych → czujność; dziewczynka 14 lat → poza oknem); TRAJ-DELAY (Tanner I, dziewczynka 13,5 r. → nota; chłopiec 13,5 r. → bez noty).
- BMI powyżej 97. centyla nigdy nie otrzymuje werdyktu „stabilny tor BMI" (decyzja właściciela 2026-08-09): przy końcowym centylu BMI ≥97 i zmianie ΔSDS w strefie dotychczas „stabilnej" słownik zwraca ostrzeżenie „utrzymująca się otyłość (>97c)". Zmiana wykonana równolegle w `verdictForPair` modułu i produkcyjnym `verdictCh` panelu porównania (parytet pilnowany testami); dotyczy wyłącznie BMI (masa ciała bez zmian).
- Start z niedoboru masy/BMI (decyzja właściciela 2026-08-09): przy centylu początkowym <10 i przyroście ΔSDS ≥ +0,2 etykietę różnicuje centyl końcowy — masa: <10c „nadrabia niedobór masy ciała" (good), 10–75c „wyrównanie niedoboru masy ciała" (good), 75–90c „wyrównanie niedoboru z szybkim przyrostem masy ciała — do obserwacji" (warn), ≥90c „przekroczenie 90. centyla masy ciała po wyrównaniu niedoboru" (bad); BMI: 10–85c „wyrównanie niedoboru (BMI)", 85–97c „wyrównanie niedoboru z szybkim przyrostem BMI — do obserwacji", ≥97c istniejące „przekroczenie progu otyłości (≥97c)". Wzrost bez zmian („nadrabia niedobór wzrostu" — nadmiar wzrostu po niedoborze nie stanowi ryzyka). Progi z konwencji aplikacji (10c dolna granica normy; 85/97c klasyfikacja BMI; 90/97c gałąź wysokich centyli masy). Zmiana równoległa w `verdictForPair` i `verdictCh` (parytet pilnowany testami).
- Chip odpowiedzi na leczenie (decyzja właściciela 2026-08-09): dla masy/BMI przy aktywnym kontekście zamierzonej redukcji werdykt wiersza w panelu trajektorii liczony jest od pomiaru na starcie leczenia (ostatni pomiar ≤ początku redukcji) do ostatniego pomiaru — progi identyczne ze słownikiem redukcji (ΔSDS ≤ −0,2 „redukcja w trakcie leczenia", ≥ +0,2 „narasta mimo leczenia", ≤ −1,5 „redukcja bardzo szybka — do kontroli"); wiersz pokazuje dodatkowo linię „okres leczenia (od X)". Werdykt całego okresu obserwacji pozostaje w polu total.
- Kontekst kliniczny per odcinek (od v3 modułu): transkrypcja 1:1 reguł `verdictCh2` panelu porównania — terapia GH (ocena odpowiedzi przy ≥6 mies. terapii w odcinku: ΔSDS ≥0,3 dobra / <0,1 słaba), kanał rodzicielski MPH (progi ±1,5 SDS względem mpSDS), zamierzona redukcja (nakładanie ≥3 mies., nigdy przy ca<10). Kontekst przekazywany z Karty pacjenta (`_vildaCmpCtx` — ten sam, którego używa panel porównania); parytet z realnym `verdictCh2` pilnowany testem (siatka 72 000 przypadków).
- Czerwone banery obu kart wzrostowych (istotne obniżenie pozycji centylowej; tempo poniżej normy) są od konsolidacji (wariant 1, decyzja właściciela 2026-08-08) zasilane wprost z modelu modułu (`buildCardAlertsHtml`) — jedno źródło prawdy dla banerów, ramki alarmowej kart i plakietek Karty pacjenta; dotychczasowa logika wbudowana kart pozostaje wyłącznie jako fallback przy niedostępności modułu. Blok trajektorii w kartach nie powtarza flagi (opcja `hideRedFlag`).
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

### EPICRISIS — generator epikryzy: spójność reguł klinicznych (akceptacja właściciela 2026-08-08)

Plik: `vilda_epicrisis.js` (generator, UMD) + `vilda_epicrisis_ui.js` (kolektor metryk `Te()`). Reguły ujednolicone po audycie (etap P1+P2; wszystkie sprzeczności potwierdzone uruchomieniem produkcyjnego kodu):

- **Testy stymulacyjne GH — kryterium dwóch testów.** Norma: szczyt GH ≥10 ng/mL; niedobór potwierdza szczyt <10 ng/mL w **dwóch** testach; szczyt ≥10 w **którymkolwiek** teście wyklucza SNP. Źródła: kryteria programu B.19 NFZ (cytowane w `lab_clinical_panels.js`: „szczyt GH < 10 ng/mL w dwóch testach"); GH Research Society, *Consensus guidelines for the diagnosis and treatment of GH deficiency in childhood…* J Clin Endocrinol Metab 2000;85(11):3990‑3 (PMID 11095419, doi:10.1210/jcem.85.11.6984). Zastosowanie we wszystkich kontekstach: `second_only` wnioskuje z **obu** szczytów (dotąd ignorował wynik 1. testu — para 12/8 dawała fałszywe „oba poniżej normy"); `both` z jednym wypełnionym testem daje status **oczekujący** z zaleceniem drugiego testu (dotąd: przy samym teście 2 sekcja znikała, a rozpoznanie GHD i tak twierdziło „potwierdzone"; przy samym teście 1 — „potwierdzone" po jednym teście).
- **Rozpoznanie KOWD**: zdanie „Wydzielanie hormonu wzrostu mieści się w granicach normy" tylko przy wykonanych testach ze szczytem ≥10; przy obu szczytach <10 — ostrzeżenie o konieczności weryfikacji rozpoznania w kierunku SNP; bez testów — bez twierdzeń o wydzielaniu GH (dotąd zdanie bezwarunkowe, także bez żadnych testów).
- **Rozpoznanie ISS**: „po potwierdzeniu prawidłowego wydzielania GH" tylko przy szczycie ≥10 (dotąd wystarczał sam fakt `performed=yes`); przy szczytach <10 — ostrzeżenie o weryfikacji (definicja ISS wymaga prawidłowego wydzielania GH). Ocena hSDS−mpSDS w sekcji ISS używa **tych samych progów** co ocena auksologiczna (<−2 „wyraźnie poniżej", <−1,5 „na granicy"; dotąd własny próg −0,5 dawał sprzeczne zdania w jednym dokumencie).
- **Rozpoznanie SGA**: fraza „bez nadgonienia wzrostu do 4. roku życia" oraz rekomendacja programu B.64 NFZ tylko gdy wywiad okołoporodowy nie podaje catch‑up (`catchUp!=='yes'`); przy `catchUp==='yes'` — nota o konieczności weryfikacji rozpoznania (program B.64 dotyczy dzieci SGA **bez** nadgonienia wzrostu).
- **Otyłość — progi ujednolicone z resztą aplikacji**: centyl BMI ≥85 nadwaga / ≥97 otyłość (jak `vildaResolvePediatricBmiCategoryFromPercentile`; dotąd 90/97), wskaźnik Cole'a >110% nadwaga / ≥120% otyłość bez zaokrąglania (jak `vilda_update_prep.js`; dotąd `Math.round` + ≥110), otyłość olbrzymia wyłącznie ze standaryzowanego BMI Z ≥ +3 (jak w aplikacji; usunięto nieużywaną nigdzie indziej regułę Cole ≥150%). Rozpoznanie wyznaczane z **obu** kryteriów (cięższe wygrywa, wymienione podstawy). Zdanie o możliwej farmakoterapii otyłości: wiek ≥12 lat **i** rozpoznana otyłość (dotąd sam centyl ≥97 przy nagłówku „nadwaga"); usunięto błędne przywołanie programu B.130 NFZ (B.130 to w aplikacji — zgodnie ze stanem faktycznym — burosumab/XLH; program lekowy farmakoterapii otyłości dziecięcej nie istnieje, stąd zdanie bez numeru programu).
- **Tempo wzrastania — trzy stany.** Flaga `growthVelocityLow` liczona w kolektorze funkcją `VildaTrajectoryAnalysis.assessVelocityValue(v, gapM, ageMonths, sex, ctx)` — tą samą hierarchią norm co karty (GROWTH-TRAJ: `getVelocityThreshold` <10 lat; >10 lat Tanner → wiek kostny → reguła generyczna; okno pomiarowe 6–15 mies.). Usunięto lokalny próg 4,5 cm/rok dla wieku 4–12 lat (sprzeczny z normami aplikacji: 3–5 lat ≥6, 5–10 lat ≥5 cm/rok); pozostaje wyłącznie jako fallback przy niedostępności modułu. Generator rozróżnia: poniżej normy / w normie / **oceny nie przeprowadzono** (zdanie bez odniesienia do normy; dotąd `null` drukował bezwarunkowo „w normie dla wieku").

**Etap 2 — zasilenie epikryzy analizą trajektorii (akceptacja właściciela 2026-08-08).** Karta zaawansowana wystawia policzony model analizy (`window.advancedGrowthTrajectory` = wynik `VildaTrajectoryAnalysis.analyze()` — dokładnie ten, który renderuje panel karty), a kolektor `Te()` destyluje go do `metrics.trajectory`; epikryza i karta mówią więc jednym głosem (jedno źródło werdyktów — słownik GROWTH-TRAJ). Nowe treści (wszystkie za strażnikiem obecności modelu; bez modelu dokument bez zmian):

- **Ocena auksologiczna**: werdykt toru wzrostu dla całego okresu obserwacji; najgorszy odcinek (bad/warn, pomijany gdy pokrywa się z całym okresem): „Największe pogorszenie toru obserwowano między X a Y (ΔSDS −Z,ZZ — …)"; flaga pozycyjna (ΔhSDS ≤ −1,0 od pierwszego pomiaru ≥24 mies., reguła GROWTH-TRAJ): „…istotne obniżenie pozycji centylowej wzrostu — obraz deceleracji wzrastania".
- **Badanie przedmiotowe**: nota o opóźnionym dojrzewaniu (model `delayedPuberty`: Tanner I u dziewcząt >13 lat / chłopców >14 lat; Palmert & Dunkel, N Engl J Med 2012;366:443-53, PMID 22296078, doi:10.1056/NEJMcp1109290).
- **Nowa opcjonalna sekcja „Ocena odpowiedzi wzrostowej na leczenie GH"** (po sekcji testów, przed prognozą): odcinki z aktywną oceną terapii GH (`ghOn` — nakładanie ≥6 mies.; werdykty verdictForPairCtx: ΔSDS ≥0,3 dobra / <0,1 słaba / pośrednia umiarkowana). Odcinek terapii GH w kontekście karty wyznaczany z wierszy pomiarowych zsynchronizowanych z modułem terapii GH (`ghSync`): od najwcześniejszego do najpóźniejszego takiego pomiaru (przybliżenie konserwatywne — bez ekstrapolacji poza udokumentowane punkty terapii).
- **Rozpoznanie otyłości**: ostatni odcinek masy/BMI z aktywną zamierzoną redukcją (`rdOn`) dodaje zdanie „W okresie zamierzonej redukcji masy ciała analiza trajektorii wskazuje: …" (etykiety verdictForPairCtx: redukcja w trakcie leczenia / narasta mimo leczenia / redukcja bardzo szybka — do kontroli). Kontekst redukcji nie jest jeszcze wyznaczany w karcie zaawansowanej (brak odpowiednika przełącznika panelu porównania) — zdanie aktywuje się, gdy model go dostarczy.
- **Prefill Tannera**: obok formularza głównego (`#tannerStage`) kreator seeduje stadium z rekordu pacjenta (`payload.user.tannerStage` z najnowszego snapshotu Vault) ze strażnikiem świeżości 12 mies. (`TANNER_FRESH_M`, jak GROWTH-TRAJ); formularz główny ma pierwszeństwo.

**Szlif językowy (audyt językowy 2026-08-08, akceptacja właściciela).** Warstwa tekstowa generatora przeszła audyt polszczyzny, rejestru medycznego i spójności terminologicznej (4 perspektywy + weryfikacja adwersaryjna na realnym `generate()`). Reguły kliniczne bez zmian; decyzje właściciela: „doganianie wzrostu (catch-up growth)" zamiast „nadgonienia", „auksologiczna" zamiast „auksometrycznej". Etykiety słownika trajektorii (wspólne z kartami) pozostają nietknięte — generator wprowadza je do zdań przez mapy przypadków (np. „istotna deceleracja wzrastania" → „wykazała istotną decelerację wzrastania"; etykieta spoza mapy trafia do ramki mianownikowej „Wynik analizy toru wzrastania …: <etykieta>."). Ujednolicono: „SDS" zamiast „Z-score", przedziały wieku „w wieku X–Y lat/roku" (bez błędnych porządkowych „X r.ż."), pełne nazwy programów lekowych NFZ, nominatiwy centyli w nawiasach, formułę wypisową „wypisano do domu"; usunięto dublowanie treści między sekcjami (prognoza RWT, lista powikłań otyłości, werdykt testów GH w rozpoznaniu, dopisek SGA sekcji testów).

Przypadki syntetyczne etapu 2: EPI-TRAJ-DECEL (całość + najgorszy odcinek + flaga; worst=całość niepowtarzany); EPI-TRAJ-DELAY (nota 13/14 lat wg płci); EPI-TRAJ-GH (odcinki ghOn → sekcja przed prognozą); EPI-TRAJ-RED (ostatni odcinek rdOn → zdanie w rozpoznaniu otyłości; bez rdOn — brak); EPI-TRAJ-NONE (brak modelu → dokument identyczny jak dotąd).

Przypadki syntetyczne (testy `tests/unit/epicrisis.test.mjs`, wywołują realny `generate()`): EPI-GH-SECOND (second_only 12/8 → prawidłowe wydzielanie, GHD wykluczone; 7/8 → potwierdzony niedobór); EPI-GH-BOTH-SINGLE (both z jednym testem <10 → oczekujący + zalecenie drugiego testu); EPI-KOWD (testy 6,2/4,8 → ostrzeżenie zamiast „w granicach normy"; bez testów → bez twierdzeń); EPI-ISS (3,2/4,1 → weryfikacja; hSDS−mpSDS −0,72/−1,70/−2,30 → spójne z sekcją auksologiczną); EPI-SGA-CATCHUP (catchUp=yes → bez „bez nadgonienia", bez B.64); EPI-OBESITY (Cole 118% + 98c → otyłość; 85c → nadwaga; Cole 110% → norma; Cole 160% bez Z → otyłość prosta, nie olbrzymia; farmakoterapia tylko ≥12 lat + otyłość); EPI-VELO (flaga null → zdanie bez oceny normy).

### GROWTH-LMS — kompletność cytowań

Każdy zbiór OLAF/OLA, WHO, Palczewska, zespół Downa i inne populacje specjalne powinny otrzymać osobny wpis ze źródłem, zakresem wieku, płcią, jednostkami i zasadą wyboru zbioru. Ogólna bibliografia strony nie wystarcza do prześledzenia pojedynczej stałej.

### ENERGY — poprawki logiczne zaleceń dietetycznych, etap 1 (2026-08-11)

Moduł `vilda_diet_recommendations.js`. Naprawiono trzy klasy błędów logicznych wykrytych w audycie (bez zmiany wzorów, danych ani progów):

1. **Norma płynów wg płci** — warunek porównywał płeć z `"K"`, podczas gdy formularz używa wartości `M`/`F`; w efekcie dziewczynki ≥10 lat otrzymywały męską normę 2,5 l/d zamiast 2,0 l/d, a tekst dla rodzica opisywał dziecko jako „płci męskiej". Po poprawce (`"K"`→`"F"`, 3 miejsca) dawka i etykieta zgodne z płcią.
2. **Niedowaga u dorosłych (ścieżka alertu WHR)** — blok celów sprawdzał alert WHR przed klasą niedowagi, przez co osoba z BMI <18,5 dostawała cel „niedopuszczenie do dalszego wzrostu masy ciała" oraz (z powodu auto-wyboru poziomu diety) zdanie o deficycie i „tempie redukcji". Po poprawce zalecenia niedowagi mają pierwszeństwo, a zdanie o deficycie/tempie redukcji jest emitowane tylko poza klasą niedowagi.
3. **Dziecko z BMI w normie (ścieżka alertu WHR)** — narracja celu wagowego („zredukować o 0,0 kg"), blok „wyrośnie z nadwagi/otyłości" i zdanie o deficycie diety były emitowane bez sprawdzenia przekroczenia progu; po poprawce wymagają flagi nadwagi/otyłości (BMI ≥ ekwiwalent 85./97. centyla), a dziecko w normie otrzymuje komunikat „masa ciała mieści się w granicach normy" plus zalecenia stylu życia.

Przypadki syntetyczne i test wywołujący rzeczywistą funkcję produkcyjną (`window.generateDietRecommendations` na załadowanej stronie): `tests/e2e/diet-recommendations-logic.spec.mjs` (DIET-SEX-HYDRATION, DIET-ADULT-UNDERWEIGHT, DIET-CHILD-NORM-WHR).

**Etap 2 (2026-08-11) — kompletność PDF „Pełny raport":** dwustronicowy układ zintegrowany trybu `full` przycinał sekcje do 1–2 pozycji i gubił bez śladu zalecenia sklasyfikowane poza czterema kartami (m.in. dawkowanie witaminy D oraz każdą pozycję z sekcji `other`, wypieraną przez zalecenie aktywności). Po poprawce tryb `full` dokłada trzecią stronę „Komplet zaleceń" z pełną listą numerowaną (mechanizm dopasowania gęstości i skali `It()` przypisany do klasy strony `diet-pdf-page-classic-single`, nie do trybu — co naprawia także brak dopasowania w zdegradowanej ścieżce `full` z jedną stroną klasyczną). Dodatkowo placeholder pustej sekcji „Energia" nie mówi już o deficycie („Podaż energii powinna wspierać…") — poprzedni tekst był mylący w planie stabilizacyjnym, który celowo deficytu nie ma. Test: DIET-PDF-FULL-COMPLETE (tryb `full` = 3 strony, markup zawiera „Komplet zaleceń" i dawkowanie witaminy D w IU; tryb `classic` = 1 strona), z hermetycznymi stubami jsPDF/html2canvas. Znane ograniczenie (poza zakresem etapu 1): przy niedowadze z alertem WHR pozostaje zdanie o „dodatkowym celu zmniejszenia obwodu talii" (fenotyp centralnej adipozji przy niskim BMI); ocena, czy je warunkować, należy do właściciela.

**Etap 3 (2026-08-11) — plan SMART dla dzieci, fallback bazowy, martwe chipy ankiety, rotacja mitów:** poprawki wyłącznie w warstwie doboru i brzmienia zaleceń SMART (bez zmiany wzorów energetycznych ani progów):

1. **Warianty dziecięce celów SMART** — cele `plateMethod`, `eveningSnacking`, `energyDensity`, `simplePlanning`, `fiberWholeGrains` i `proteinAtMeals` miały wyłącznie brzmienie dorosłe/redukcyjne (m.in. uzasadnienie „białko … podczas redukcji masy" trafiało do planu dziecka). Po poprawce grupy `youngChild`/`schoolChild` otrzymują warianty dziecięce (środowisko domowe, bez presji i bez narracji redukcyjnej; uzasadnienie białka mówi o sytości i prawidłowym rozwoju).
2. **Fallback bazowy w ścieżce ankiety** — gdy ankieta była wypełniona, ale żaden zaznaczony chip nie mapował się na cel (np. wyłącznie „alergie lub nietolerancje"), moduł zawsze podstawiał dorosłą triadę (metoda talerza / regularność / warzywa). Po poprawce fallback jest rozgałęziony wiekowo tak samo jak ścieżka „bez ankiety": dziecko → woda / warzywa / posiłek bez ekranu, nastolatek → regularność / warzywa / tempo jedzenia i sytość.
3. **Martwe chipy ankiety** — `allergiesOrIntolerances` i `dislikesFish` były zbierane, ale nie wpływały na żaden tekst. Po poprawce chip alergii dodaje do przypomnienia zdanie o doborze zamienników bezpiecznych dla pacjenta, a chip „nie lubi ryb" usuwa ryby z listy źródeł białka w celu `proteinAtMeals` (z adnotacją o wyborze innych akceptowanych źródeł).
4. **Rotacja mitów przy zawężonej puli tagów** — gdy tagi stanu zawężały pulę mitów do jednej pozycji (np. nastolatek: jedyny mit z tagiem `teen`), prośba „pokaż inny mit" zwracała wciąż ten sam mit (wykluczenie bieżącego opróżniało pulę i fallback przywracał ją w całości). Po poprawce drugi fallback sięga do pełnej puli wiekowej sprzed zawężenia tagami (z wykluczeniem mitu bieżącego), więc rotacja zawsze zmienia mit, jeśli w grupie wiekowej istnieje więcej niż jeden.

Testy na rzeczywistych funkcjach produkcyjnych (`window.buildDietSmartRecommendationResult`, `window.dietRecommendationsRequestNewMyth`): DIET-SMART-CHILD-BASE, DIET-SMART-CHILD-PROTEIN, DIET-MYTH-ROTATION w `tests/e2e/diet-recommendations-logic.spec.mjs`.

**Etap 4 (2026-08-11) — „Wzrost zakończony" a stabilizacja, spójność kaloryczności, PAL pacjenta w normach, dopełnienie planu:**

1. **„Wzrost zakończony" blokuje strategię stabilizacji** — strategia stabilizacji masy u dziecka opiera się na założeniu, że BMI obniży się wraz z dalszym wzrastaniem; przy zaznaczonej fladze `growthEndedFlag` to założenie nie obowiązuje (reguła z `app.js`: „nie zdąży wyrosnąć → redukcja"), a mimo to moduł pozwalał wybrać stabilizację w nowoczesnym UI i generował jej narrację. Po poprawce wszystkie cztery miejsca wyprowadzające strategię (`ti()` dla planu SMART, `pe()` dla narracji energetycznej, `Ci()` dla dyspozycji do generatora stabilizacyjnego, `Te()` dla stanu przycisków) traktują zakończony wzrost jako wymuszenie redukcji, a przycisk „Stabilizacja" jest wtedy ukryty i wyłączony. Dodatkowo gałąź dorosłego w `we()` odznacza przełącznik stabilizacji przy wymuszaniu redukcji (dotąd oba mogły być zaznaczone naraz).
2. **Jedna kaloryczność planu w dokumencie** — narracja zaokrąglała kaloryczność wybranej diety do 100 kcal („ok. 2200 kcal/dzień"), a sekcja norm żywieniowych liczyła i drukowała wartość niezaokrągloną („2237 kcal/d") — ten sam dokument podawał dwie różne liczby. Po poprawce `Gt()` zaokrągla kaloryczność wybranej diety do 100 kcal również dla norm (gałęzie zapasowe norm — wartość główna/zakres energii z modelu norm — pozostają bez zmian).
3. **PAL pacjenta w normach żywieniowych** — przy selektorze PAL „inherit" model norm dostawał `mainPal` z domyślnych ustawień karty norm (PAL 1,6) zamiast PAL użytego w planie pacjenta; przekazywany parametr `palUsed` był martwy. Po poprawce `Wt()` przy braku liczbowego selektora używa `palUsed` planu, z dotychczasowym fallbackiem do ustawień karty.
4. **Dopełnienie planu do 2 celów** — gdy ankieta trafiała dokładnie jednym chipem w cel, plan zawierał jeden cel wbrew obietnicy „2–3 małe kroki". Po poprawce `st()` dopełnia plan drugim celem z triady bazowej właściwej dla wieku (pomijając cel już obecny), z najniższym priorytetem.
5. **Odporność na brak stałej wieku dorosłego** — pięć surowych odwołań `>= ENERGY_ADULT_START_AGE` (ReferenceError przy niezaładowanej stałej) przechodzi przez istniejący akcesor `Si()` z typeof-guardem, a jego fallback ujednolicono z produkcyjną wartością stałej (19 lat, `vilda_diet_plan_ui.js`; dotąd fallback wynosił 18).

Testy: DIET-GROWTH-ENDED-STAB (scenariusz z flagą i kontrolny bez niej), DIET-KCAL-CONSISTENT, DIET-SMART-PAD-TWO w `tests/e2e/diet-recommendations-logic.spec.mjs`.

**Etap 5 (2026-08-11) — walidacja wejścia PDF, jawna niekompletność, czytelność, transliteracja, wspólne etykiety PAL:**

1. **Walidacja danych pacjenta w generatorze PDF (`di()`)** — generator przyjmował dowolne dane: puste pola wieku dawały chip „0 lat 0 mies." i treść dla małego dziecka, wzrost wpisany w metrach dawał „BMI 24221,5", a dla niemowląt tryb „full" produkował raport-atrapę z placeholderami. Po poprawce generator odmawia pracy z czytelnym komunikatem, gdy wiek ≤ 5 lat (zgodnie z bramką widoczności modułu), brak masy/wzrostu albo BMI poza zakresem 8–90 (sygnał błędnych jednostek).
2. **Jawna niekompletność raportu** — strona, której nie udało się przenieść do PDF, znikała bez śladu (toast „wygenerowano" przy 1 z 2 stron). Po poprawce nieudane przygotowanie którejkolwiek strony (obraz lub cięcie na segmenty) przerywa generowanie z błędem; w `ri()` dodatkowy pas bezpieczeństwa porównuje liczbę stron z liczbą przygotowanych obrazów.
3. **Podłoga czytelności strony klasycznej (`It()`)** — dopasowanie skali mogło zejść do 0,22× (nieczytelny druk) albo przyciąć treść przez `overflow:hidden`. Po poprawce minimalna skala wynosi 0,45×, a gdy strona jest pomniejszona do ≤0,5× lub treść mimo to nie mieści się w polu strony, toast po wygenerowaniu ostrzega o obniżonej czytelności (mechanizm flagi `data-diet-pdf-fit-warning` przenoszonej przez `di()`/`ri()`).
4. **Transliteracja ł/Ł w nazwach plików** — NFD nie rozkłada „ł", więc „Michał Łąka" stawał się `Micha_ka`. Poprawka w `patientReportSanitizeFilename` (`vilda_patient_report.js`, wspólna dla wszystkich raportów) i w zapasowym sanitizerze modułu diety: `ł→l`, `Ł→L` przed normalizacją.
5. **Martwy `maxLength` i znacznik obcięcia w kartach zintegrowanych** — `At()` ignorował limit długości pozycji (parametr 420 był martwy), a `Ct()` ucinał listy do `maxItems` bez śladu. Po poprawce pozycja dłuższa niż limit jest przycinana na granicy słowa z wielokropkiem, a obcięta lista dostaje pozycję „… oraz N kolejnych — komplet na stronie „Komplet zaleceń"" (strona kompletu istnieje w trybie „full" zawsze od etapu 2).
6. **Wspólne etykiety PAL** — narracja używała słownika `PAL_OPTIONS` z `app.js` („wysoka"), podczas gdy karta planu pokazuje etykiety z `ENERGY_PAL_TABLE_LABELS` („aktywny tryb życia") — pacjent widział dwie różne nazwy tego samego poziomu. Po poprawce `Ht()` preferuje wspólny słownik karty planu (z fallbackiem do `PAL_OPTIONS`), a fraza cytuje etykietę: „deklarowaną aktywność na poziomie „umiarkowana aktywność" (PAL 1,6)".

Testy: DIET-PDF-VALIDATION (brak wieku, wzrost w metrach), DIET-FILENAME-PL (transliteracja na rzeczywistym `patientReportSanitizeFilename`), rozszerzenie DIET-KCAL-CONSISTENT o frazę etykiety PAL.

**Etap 6 (2026-08-11, decyzje właściciela) — metodyka BMI dla wartości wagowych Palczewskiej; warunek celu obwodu talii:**

1. **Wartości wagowe przy źródle Palczewska liczone metodą BMI, jak przy OLAF** (decyzja właściciela: „ujednolicić zgodnie z tym jak teraz jest w przypadku OLAF"). Stan zastany był mieszany: tabela Palczewskiej nie ma kolumny p85, więc próg nadwagi i cel 85c szły już ścieżką BMI (inwersja `bmiPercentileChildPal` przez wyszukiwanie binarne), ale **mediana** (kolumna p50 masy-dla-wieku) i **próg otyłości 97c** (kolumna p97 masy-dla-wieku, przeliczana na ekwiwalent BMI przez ÷wzrost²) pochodziły z masy względem wieku — u dziecka wysokiego lub niskiego dawało to wartości przesunięte względem metody OLAF (LMS/BMI). Po zmianie wszystkie cztery wielkości (progi 85c/97c oraz cel i mediana narracji) liczone są primarnie z centyli BMI Palczewskiej (inwersja `bmiPercentileChildPal`, fallback: kolumny BMI tabeli), a centyle masy-dla-wieku pozostają wyłącznie ostatnim fallbackiem przy niedostępności wartości BMI. Wpływ na wcześniej zapisane wyniki: u dzieci o wzroście istotnie odbiegającym od mediany zmieniają się mediana masy w narracji (np. chłopiec 10 lat, 160 cm: ~43 kg metodą BMI wobec ~31,5 kg z masy-dla-wieku) i klasyfikacja otyłości blisko progu 97c; wartości przy wzroście bliskim mediany zmieniają się nieznacznie.
2. **Cel zmniejszenia obwodu talii przy alercie WHR u dorosłych** (decyzja właściciela: „warunkuj") — zdanie „Dodatkowym celem … zmniejszenie obwodu talii…" nie jest emitowane przy niedowadze (BMI < 18,5); pozostaje bez zmian dla pozostałych klas BMI.

Testy: DIET-PAL-TARGET-BMI (mediana Palczewskiej metodą BMI na realnym `generateDietRecommendations` i `getPalCentile`), DIET-WHR-WAIST-GATE (kontrola: otyły dorosły z WHR zachowuje cel talii), rozszerzenie DIET-ADULT-UNDERWEIGHT (niedowaga+WHR bez celu talii).

**Etap 7 (2026-08-11, decyzja właściciela: „emituj zawsze") — ożywienie martwych ścieżek `!professionalMode`:** dwa fragmenty generatora dziecięcego były emitowane wyłącznie poza trybem profesjonalnym, w którym moduł nie jest osiągalny — nie pojawiały się więc w żadnym dokumencie: (1) zalecenie konsultacji z dietetykiem lub psychologiem dziecięcym (kryteria: wiek <10 lat, BMI ≥120% progu lub dieta intensywna) oraz (2) dyskleimer dla dzieci <10 lat („plan należy traktować wyłącznie orientacyjnie/poglądowo; wskazana konsultacja z dietetykiem lub endokrynologiem dziecięcym"). Po zmianie oba emitowane są zawsze przy spełnieniu kryteriów merytorycznych, niezależnie od trybu aplikacji; dyskleimer trafia na początek dokumentu jako karta ostrzeżenia. Test: DIET-UNDER10-DISCLAIMER (otyłe dziecko 8 lat w trybie profesjonalnym dostaje oba teksty; dziecko 12 lat bez kryteriów — żadnego).

**Uzupełnienie etapu 7 po przeglądzie PR #109 (2026-08-11):**

1. **Wariant dyskleimera dla dziecka <10 lat z BMI w normie** — słuszna uwaga przeglądu: standardowy wariant dyskleimera („Dziecko poniżej 10 lat z nadwagą lub otyłością powinno…") mógł paść także u dziecka z prawidłowym BMI, do którego karta dotarła ścieżką alertu WHR — fałszywa klasyfikacja. Brzmienie diagnostyczne jest teraz bramkowane flagami klasyfikacji BMI (`Ze`/`ye`); dziecko <10 lat z BMI w normie dostaje wariant neutralny: „U dziecka poniżej 10. roku życia proponowany plan ma charakter poglądowy; w razie wątpliwości wskazana jest konsultacja z dietetykiem lub endokrynologiem dziecięcym." (wariant dla pacjenta był neutralny od początku).
2. **Regresja brzegowa progu 97c** — test DIET-PAL-P97-BOUNDARY: przy źródle Palczewska (przełączanym produkcyjnym `setCheckedGrowthDataSource`) klasyfikacja nadwaga/otyłość zmienia się dokładnie na progu BMI p97 wyznaczonym tą samą inwersją `bmiPercentileChildPal`, której używa produkcja (przypadki tuż pod progiem i powyżej, chłopiec 10 lat / 160 cm). Ten sam mechanizm przełączania źródła wzmocnił test DIET-PAL-TARGET-BMI (poprzednio ustawiał tylko `window.bmiSource`, którego globalny lexical binding `bmiSource` nie widzi).
3. **Podstawa merytoryczna zaleceń konsultacji <10 lat** — teksty emitowane w tych ścieżkach mają charakter wyłącznie ostrożnościowo-kierujący (zalecenie konsultacji ze specjalistą i adnotacja o poglądowym charakterze planu), nie diagnostyczno-terapeutyczny. Kryteria wyzwolenia (wiek <10 lat, BMI ≥120% progu, dieta intensywna) są konwencją aplikacji przyjętą przez właściciela jako wentyl bezpieczeństwa — kierunkowo zgodną z praktyką kierowania małych dzieci z otyłością do opieki specjalistycznej — a nie implementacją konkretnej wytycznej; nie zastępują oceny klinicznej. Ograniczenie: progi nie mają dedykowanego źródła piśmienniczego (decyzja właściciela 2026-08-11, „emituj zawsze").

Tym wpisem wszystkie ustalenia audytu modułu z 2026-08-11 (wraz z uwagami przeglądu PR #109) są rozstrzygnięte i wdrożone (etapy 1–7).

### ENERGY — ruch jako akcelerator; spójność wzrost/redukcja (2026-08-12, decyzje właściciela)

Analiza zaleceń energetycznych pod kątem błędów logicznych/merytorycznych i motywującego brzmienia. Ustalenia i zmiany (3 decyzje właściciela — wszystkie rekomendacje przyjęte):

1. **Blok czasu spalania przebudowany na akcelerator.** Dotąd dokument podawał teoretyczny czas spalenia CAŁEGO nadmiaru energii (nadmiar kg × 7700 kcal) pojedynczą aktywnością bez udziału diety (np. „Rower – około 207 godzin", „Piłka nożna – około 119 meczów") — liczby poprawne rachunkowo (wzór MET: kcal/min = MET × 3,5 × masa ÷ 200; zweryfikowane co do godziny), ale zniechęcające i mylące obok dietetycznego szacunku tygodni. Po zmianie ruch jest pokazywany jako akcelerator szacunku Z DIETĄ: kaloryczność realnej sesji (jazda na rowerze MET 6, 45 min, masa pacjenta) i nowy czas przy 3 sesjach tygodniowo — `z2 = ⌈nadmiar ÷ (utrata_z_diety + 3·kcal_sesji/7700)⌉` (np. „ok. 21 tygodni → ok. 17 tygodni"), z dopiskiem o korzyściach ruchu niezależnych od masy. Dietetyczny szacunek tygodni — bez zmian metodycznych.
2. **Teksty wzrostowe zależne od strategii.** Dotąd komunikat „masa ma rosnąć minimalnie / pozostać zbliżona do obecnej" (filozofia stabilizacji) pojawiał się także w trybie REDUKCJI, obok planu −0,4/−0,6 kg/tydz. — dwa sprzeczne cele w jednym dokumencie. Po zmianie w redukcji wzrastanie jest przedstawiane jako dodatkowy sprzymierzeniec planu („każdy dodatkowy centymetr … przyspiesza wychodzenie z nadwagi/otyłości"), a klasyczne brzmienie zostaje wyłącznie w stabilizacji.
3. **Listy aktywności ujednolicone między płciami** (dotąd: chłopcy bieganie/rower/piłka nożna, dziewczęta pływanie/taniec/rower) — wspólny zestaw przykładów (rower, pływanie, bieganie, taniec, gry zespołowe) w bloku akceleratora i punkcie o codziennym ruchu.

Pozostałe elementy narracji energetycznej sprawdzone bez zastrzeżeń: 7700 kcal/kg i wartości MET (standard), przeliczenia tygodnie↔miesiące, spójność deficyt↔tempo, normy płynów, dawkowanie wit. D.

Testy: DIET-ACT-ACCELERATOR (weryfikacja kcal sesji z wzoru MET co do ±1 kcal i skrócenia szacunku), DIET-GROWTH-STRATEGY-TEXT (redukcja bez „rosła minimalnie", stabilizacja z klasycznym brzmieniem), DIET-ACT-UNISEX w `tests/e2e/diet-recommendations-logic.spec.mjs`.

### ENERGY — język zaleceń energetycznych: spójny rejestr wg adresata (2026-08-12, decyzja właściciela)

Przełącznik „Język zaleceń" (Dla pacjenta / Standardowy) jest opcją wyłącznie zakładki „Zalecenia energetyczne". Analiza wygenerowanych dokumentów wykazała niekonsekwencje rejestru; po decyzji właściciela („naprawiaj" + „standard nastolatka też wyrównaj do neutralnego") ujednolicono brzmienie — bez zmian liczb, progów i logiki klinicznej (26 podmian tekstów):

1. **„Dla pacjenta"**: nastolatek (11–18 lat) — konsekwentna forma „ty" w całym dokumencie (usunięte mieszanki typu „Proszę jeść regularnie… wybieraj… Ogranicz…" → „Jedz regularnie…"; „Proszę planować…" → „Planuj…"; „Proszę pamiętać…" → „Pamiętaj…"); dorosły — poprawka gramatyczna („co odpowiada otyłość I stopnia" → „co oznacza otyłość I stopnia") i usunięty kancelaryzm („W proponowanym planie przyjęto…" → „Proponowany plan zakłada…"); rodzic (<11 lat) — „Przy takim ustawieniu uzyskujemy deficyt…" → „Taki plan daje deficyt…".
2. **„Standardowy" u nastolatka** wyrównany do neutralnego zapisu klinicznego, jak u dorosłego (dotąd luźna ty-forma): m.in. „Twoja obecna waga to…, musisz zredukować…" → „Obecna masa ciała wynosi…, co oznacza potrzebę redukcji…"; „Postaraj się jeść…" → „Zalecane jest regularne spożywanie…"; „Staraj się być aktywny…" → „Wskazana jest aktywność fizyczna…"; „zadbaj o suplementację" → „wskazana jest suplementacja"; „Pamiętaj o nawodnieniu…" → „Zalecane jest odpowiednie nawodnienie…"; „zajmie Ci około" → „można szacować na około"; „Jeżeli masz trudności… porozmawiaj z rodzicami…" → „W razie trudności… wskazana jest konsultacja…". Nawias prognozy MPH bez „Twój". Teksty dziecięce (<11, do rodzica) — bez zmian.
3. **Artefakty szablonu** (oba tryby): „(ok. 4,8 miesiąca/miesięcy)" → poprawna odmiana przez pomocnika `mLb` (4,8 miesiąca / 12 miesięcy / 1 miesiąca); czasy spalania „około 155 h 28 min" → „około 155 godzin" (≥10 h bez minutowej precyzji; poniżej: „godz. + min").

Testy: DIET-LANG-TEEN (oba tryby nastolatka), DIET-LANG-ADULT, DIET-LANG-ARTIFACTS w `tests/e2e/diet-recommendations-logic.spec.mjs`.

### NUTRITION-NORMS — norma białka w g/d od masy należnej/typowej (2026-08-12, decyzja właściciela)

Kontekst (przegląd modułu `nutrition_norms.js` 2026-08-12): Normy żywienia dla populacji Polski (NIZP PZH–PIB, 2024) definiują normy białka dorosłych na poziomach EAR 0,66 i RDA 0,83 g/kg **masy ciała należnej** wyznaczanej ze wzrostu przy BMI 22 kg/m² (zmiana edycji 2024 — wcześniej 0,9 g/kg), a wartości g/dobę w tabelach dla dzieci i młodzieży liczone są od **masy referencyjnej (typowej) dla wieku i płci**. Karta „Normy żywieniowe" w domyślnym trybie „masa aktualna" mnożyła g/kg przez masę aktualną, przez co u pacjentów z otyłością nagłówkowa „norma" była zawyżona (przykład syntetyczny: kobieta 40 lat, 110 kg, 165 cm — 91,3 g/d wobec 49,7 g/d od masy należnej 59,9 kg), a przy niedowadze zaniżona; wartość od masy należnej pojawiała się wyłącznie jako porównanie, chowane przy małej różnicy.

Po zmianie (wybór właściciela spośród 4 wariantów: „od masy należnej"):

1. **Podstawa masy dla białka w g/d** (EAR i RDA), niezależnie od trybu karty: dorośli (≥19 lat) — masa należna = 22 × wzrost[m]² (fallback: masa aktualna, gdy brak wzrostu); dzieci 1–18 lat — masa referencyjna dla wieku i płci z tabel modułu energii; niemowlęta 6–11 mies. — bez zmian masa aktualna (dawkowanie białka u niemowląt tradycyjnie na kg rzeczywistej masy; tryb referencyjny i tak jest tam zablokowany). Wartości g/kg bez zmian.
2. **Masa aktualna pozostaje widoczna**: linia porównania „masa aktualna: X g/d" w modelu karty i karcie raportu, pokazywana zawsze, gdy różni się od podstawy o ≥1 g/d (dotąd porównanie bywało niedostępne w trybie „pełen zakres PAL" — teraz liczone wprost z masy z formularza). Panel „Norma białka" podaje jawnie podstawę („— podstawa: masa należna przy BMI 22" / „wartości typowe dla wieku N lat i tej płci").
3. **Bez zmian**: energia (REE/TEE) i wynikające z niej przedziały planistyczne %E→g dla białka, tłuszczu i węglowodanów nadal od masy wybranej trybem karty (TEE to oszacowanie wydatku, który rośnie z masą rzeczywistą); tryb „masa referencyjna" działa jak dotąd; wartości EAR/RDA g/kg i przedziały %E — nietknięte.
4. **Efekty uboczne**: u dorosłych bez podanej masy (ze wzrostem) norma białka w g/d jest teraz dostępna (liczona z masy należnej), u dzieci — z masy typowej; komunikat o braku danych zaktualizowany („masa ciała lub wzrost"). Zalecenia dietetyczne (blok „Normy żywieniowe" w PDF, `Wt` w `vilda_diet_recommendations.js`) przejmują nową podstawę automatycznie — cytowane tam „minimum referencyjne RDA" u pacjentów z nadwagą będzie niższe niż dotąd. Poprawiona gramatyka zdań porównawczych karty raportu („Energia (masa referencyjna przy BMI 22): …" zamiast „Energia dla masa referencyjna…"; „Białko … dla masy aktualnej").
5. **Wpływ na wcześniej zapisane wyniki**: karta nie zapisuje wyników — zmiana dotyczy wyłącznie prezentacji na żywo i generowanych od nowa raportów.

Testy na rzeczywistej funkcji produkcyjnej `nutritionNormsBuildCardModel` i produkcyjnym rendererze (`tests/e2e/nutrition-norms-logic.spec.mjs`, dane fikcyjne): NORM-PROT-U1-ADULT-OBESE (49,7 vs 91,3 g/d), NORM-PROT-U1-CHILD-OBESE (masa typowa vs 55 kg), NORM-PROT-U1-NEAR-EQUAL (porównanie ukryte <1 g), NORM-PROT-U1-NO-WEIGHT (norma ze wzrostu), NORM-PROT-U1-INFANT (bez zmian), NORM-PROT-U1-RENDER (podstawa na karcie, gramatyka porównań).

Pozostałe ustalenia przeglądu 2026-08-12 (bez zmian kodu): wartości modułu zweryfikowane jako zgodne z edycją 2024 — tłuszcz dorosłych 30–40%E (20–30%E przy PAL ≤ 1,4), węglowodany 45–65%E, białko %E 5–15 (<2 lat) / 10–20 / 15–20 (≥65 lat), tłuszcz ≤3 lat 35–40%E, LA 4%E, ALA 0,5%E, EPA+DHA 250 mg/d; przedziały niemowlęce 30–45%E (tłuszcz) i 45–55%E (węglowodany) — potwierdzone w pierwotnym źródle, patrz sekcja NUTRITION-NORMS-U2; mnożnik wzrastania ~1,01 w TEE stosowany do 18. r.ż. włącznie (konwencja wspólnego modułu energii).

### NUTRITION-NORMS-U2 — tłuszcz i węglowodany u niemowląt 6–11 mies.: weryfikacja źródłowa (2026-08-12)

Historia zmiany (ważne dla audytu): przegląd 2026-08-12 początkowo zakwalifikował przedziały niemowlęce 30–45%E (tłuszcz) i 45–55%E (węglowodany) jako „konwencję aplikacji", bo pełny PDF norm był niedostępny sieciowo, a omówienia wtórne podawały tłuszcz ~40%E (za EFSA) i węglowodany AI 95 g/d (zapis IOM). Na tej podstawie PR #116 zmienił kartę na „około 40% energii" + AI 95 g/d. Po scaleniu właściciel dostarczył do repozytorium pełny PDF („Normy spożycia dla populacji Polski", plik `Normy-spozycia-dla-populacji-polski-30-07.pdf`) i weryfikacja z pierwotnym źródłem wykazała, że **pierwotne wartości aplikacji były poprawne**, a zmiana #116 — błędna. Wartości przywrócono niezwłocznie w PR follow-up.

Zapis pierwotnego źródła (PDF w repo):

1. **Tłuszcz, niemowlęta > 6–12 mies.: 30–45 % E** — rozdział „Tłuszcze", tekst „W grupie niemowląt starszych tłuszcz powinien dostarczać 30–45 % energii z diety" oraz Tabela 1 („Niemowlęta > 6–12 miesięcy: 30–45 % E"); Tabela 2 podaje gramy na dobę per miesiąc życia i płeć liczone właśnie z 30–45 %E i mas referencyjnych (np. chłopcy 8 mies.: 22,0–33,1 g/d) — spójne z kartą, która liczy gramy z %E × TEE / 9.
2. **Węglowodany, niemowlęta 6–11 mies.: RI 45–55 % E** — rozdział „Węglowodany", tekst „W drugim półroczu życia dziecka powinny stanowić 45–55 % energii całodziennej diety" (wg wytycznych PTGHiŻD 2014) oraz Tabela 8 (RI; przypis: „od ukończenia 6 miesięcy do ukończenia 12 miesięcy"). Normy NIE podają dla polskiej populacji AI 95 g/d — to zapis IOM, błędnie przypisany normom w omówieniach wtórnych.
3. Przy okazji potwierdzono w pierwotnym źródle pozostałe wartości modułu: SFA „tak małe, jak to możliwe (< 10 % E)", LA 4 %E, ALA 0,5 %E, DHA min. 100 mg/d (6–24 mies.), EPA+DHA 250 mg/d (od 3. r.ż.), tłuszcz 2–3 r.ż. 35–40 %E, 4–18 lat i dorośli 30–40 %E (do 20 %E przy siedzącym trybie życia), węglowodany ≥1 r.ż. 45–65 %E.

Stan końcowy kodu (po przywróceniu):

1. **Karta i raport pokazują przedziały jak przed #116**: tłuszcz 30–45 %E, węglowodany 45–55 %E, gramy z TEE; `planningReference` 10/37,5/52,5 %E; bez not o wartości referencyjnej i AI.
2. **Zachowane z #116 i follow-upu (ulepszenia odporności, nie zmiany kliniczne)**: formatery karty (`O`, `X`) i raportu pacjenta (`patientReportFormatNutritionNorms*`) zwijają zdegenerowane pary do pojedynczej wartości (nigdy „40–40% energii"/„95–95 g/d"); kafel nie renderuje osieroconej linii „—", gdy przedział %E nie istnieje; lista historycznych adresów cache w SW pozostaje append-only (przywrócony wpis `/nutrition_norms.js?v=41`).
3. **Proces**: zmiany wartości klinicznych wymagają pełnego źródła medycznego (AGENTS.md §2) — PDF norm jest teraz w repozytorium i przyszłe weryfikacje modułu odbywają się wyłącznie względem niego, nie względem omówień.

Testy: NORM-U2-INFANT-MACROS (przedziały i gramy z TEE, planningReference), NORM-U2-INFANT-RENDER (kafle bez „około 40%", bez AI), NORM-U2-REPORT (karta raportu i linie podsumowania na produkcyjnych `patientReportBuild*`; robustność formaterów na zdegenerowanych parach), NORM-U2-RANGES-INTACT (dzieci/dorośli bez regresji) w `tests/e2e/nutrition-norms-logic.spec.mjs`.

### BMI-TONORM-S1 — „Droga do normy BMI": klasyfikacja od urodzenia i język bez redukcji u najmłodszych (2026-08-12, etap 1 przeglądu)

Kontekst (przegląd modułu 2026-08-12): karta liczy cel redukcyjny jako BMI na 85. centylu (LMS; źródło automatyczne: WHO u niemowląt, OLAF 3–18 lat) lub 24,9 u dorosłych; kg = (BMI − cel) × wzrost²; kcal = kg × 7700; tabela aktywności wg MET (kcal/min = MET × 3,5 × masa/200). Sonda runtime wykryła dwa błędy kliniczne naprawione w tym etapie:

1. **Klasyfikacja pediatryczna od urodzenia.** Resolver kategorii, cel BMI i wyliczenie brakujących kg do P5 miały dolną bramkę wieku 0,25 r.ż. (3 mies.) — młodsze niemowlęta wpadały w progi DOROSŁYCH (BMI < 18,5 = „Niedowaga"), przez co zdrowy 2-miesięczniak (BMI 16,3 — norma WHO dla wieku) dostawał czerwony komunikat „Dziecko poniżej 10 lat z niedowagą wymaga konsultacji…". Po zmianie wszystkie trzy ścieżki używają klasyfikatora pediatrycznego (WHO LMS działa od urodzenia); progi centylowe bez zmian (<5c niedowaga, ≥85c nadwaga, ≥97c otyłość, z ≥ +3 otyłość olbrzymia).
2. **Bez liczbowej recepty redukcyjnej u dzieci < 2 lat.** Dotąd niemowlę z BMI > 85c dostawało „Musisz zredukować masę o X kg (ok. N kcal)" — sprzeczne z praktyką (u niemowląt i małych dzieci nie zaleca się redukcji masy; celem jest utrzymanie masy przy dalszym wzroście). Po zmianie: < 2 lat — komunikat „BMI powyżej górnej granicy normy dla wieku (85. centyl)" + zdanie o utrzymaniu obecnej masy przy dalszym wzroście, ostrzeżenie konsultacyjne (< 5 lat) i mediana masy dla wzrostu; bez kg, kcal i tabeli aktywności; dopisek „Do 50 centyla BMI brakuje…" również pomijany < 2 lat. Dzieci 2–5 lat: liczby pozostają, ale jako „Nadwyżka masy względem górnej granicy normy (85. centyl BMI): ok. X kg (ok. N kcal)" ze zdaniem, że celem jest zwykle spowolnienie przyrostu masy — bez trybu rozkazującego; ostrzeżenie i mediana jak dotąd. Od 5 lat wzwyż — bez zmian (tryb redukcyjny z tabelą aktywności).
3. **Bez zmian**: matematyka celu (85c/24,9), 7700 kcal/kg, tabela MET, ścieżka niedowagi dziecięcej (brakujące kg do P5), ukrywanie karty przy niedowadze dorosłych (do etapu 2), gating Planu odchudzania i ostrzeżeń (< 5 / < 10 lat).

Etap 2 (2026-08-12, ten sam przegląd):

1. **Niedowaga dorosłych widoczna.** Dotąd dorosły (≥ 18 lat) z BMI < 18,5 nie dostawał ŻADNEJ informacji — karta była ukrywana wczesnym returnem. Po zmianie: dorośli przechodzą normalną ścieżką kategorii i dostają komunikat niedowagi (wspólny builder z dziećmi) wraz z brakującymi kg do dolnej granicy normy (18,5 × wzrost² − masa). Usunięcie bramki wieku ≥ 18 oznacza też, że 18–19-latkowie z niskim BMI są oceniani centylem pediatrycznym (np. BMI 18,2 przy 18 latach to norma > 5c, a nie „niedowaga” progiem dorosłych).
2. **Koniec „redukcji 0,1 kg” przy BMI 24,9–25.** Cel redukcyjny dorosłych (24,9) kolidował z progiem normy (< 25): BMI 24,91–24,99 dawało „Musisz zredukować masę o 0,1 kg (ok. 823 kcal)”, a przewidziany na tę strefę komunikat o zbliżaniu do górnej granicy (24–25) praktycznie nigdy się nie pokazywał. Po zmianie tryb redukcyjny u dorosłych włącza się dopiero od progu nadwagi (BMI ≥ 25); strefa 24–25 dostaje komunikat „BMI mieści się jeszcze w normie, jednak zbliża się do jej górnej granicy…”. U dzieci bez zmian (celem pozostaje 85. centyl).
3. **Dopisek 50. centyla przeredagowany.** „Do 50 centyla BMI brakuje X kg” (mylące — to nadwyżka, nie brak) → „Nadwyżka względem 50. centyla BMI: X kg” u dzieci i „Nadwyżka względem BMI 22: X kg” u dorosłych; nadal pomijany < 2 lat i przy nadwyżce ≤ 0,1 kg.

Testy etapu 2: TONORM-S2-ADULT-UNDER (brakujące kg do 18,5), TONORM-S2-ADULT-NEAR-LIMIT (BMI 24,97 → komunikat graniczny; BMI 25,2 → redukcja z nowym dopiskiem), TONORM-S2-TEEN-18-UNDER (18-latek centylem) w `tests/e2e/bmi-norm-path-logic.spec.mjs`.

Etap 3 (2026-08-12, decyzje właściciela):

1. **Konwencje przelicznika MET pozostają — udokumentowane.** Tabela „Droga do normy" świadomie NIE stosuje czynnika dziecięcego +10% (< 14 lat), którego używa karta „Kalorie posiłków" (`applyChildFactor` w presecie `food_times`, brak w `bmi_journey`) — długoterminowy szacunek drogi do normy zostaje na czystym wzorze MET. Czas/dystans liczone są przy stałej masie startowej — przy dużych redukcjach niedoszacowują czasu (masa spada, spalanie/min maleje); wynik jest jawnie oznaczony jako szacunek (gwiazdka przy karcie).
2. **„Otyłość olbrzymia" dopiero od 5. roku życia.** Etykieta z-score ≥ +3 pojawiała się od urodzenia (u niemowląt bez znaczenia klinicznego i stygmatyzująca). Po zmianie produkcyjny resolver kategorii (`vildaResolvePediatricBmiCategoryFromPercentile`, plus kopia zapasowa w `vilda_update_prep.js`) przyjmuje `ageMonths` i stosuje etykietę od 60 mies.; młodsze dzieci z z ≥ +3 dostają „Otyłość". Wywołania bez podanego wieku zachowują dotychczasowe działanie (ścieżka `bmiCategoryChildExact` używana przez moduł nadciśnienia — bez zmian). Obserwacja przy okazji: dla nastolatków z-score OLAF LMS saturuje się poniżej +3 (L < 0 daje asymptotę z = 1/(−L·S), np. 13 lat: BMI 45 → z ≈ 2,9), więc etykieta bywa tam nieosiągalna z natury danych LMS — to cecha istniejąca, nieobjęta zmianą.

Test etapu 3: TONORM-S3-SEVERE-LABEL (niemowlę i 59 mies. z z ≥ +3 → „Otyłość"; 72 mies. → „Otyłość olbrzymia"; bramka resolvera wprost dla 59/60 mies. i wywołania bez wieku) w `tests/e2e/bmi-norm-path-logic.spec.mjs`.

Testy (produkcyjna ścieżka `window.update()` + DOM karty, dane fikcyjne): TONORM-S1-INFANT-NORMAL, TONORM-S1-INFANT-HIGH, TONORM-S1-INFANT-UNDER, TONORM-S1-TODDLER-2-5-HIGH, TONORM-S1-OLDER-UNCHANGED w `tests/e2e/bmi-norm-path-logic.spec.mjs`.

### BMI-TONORM-J — „Droga do normy 2.0": panel dieta + ruch (2026-08-12, makieta zatwierdzona przez właściciela)

Tryb redukcyjny karty (≥ 5 lat) zastąpiony interaktywnym panelem (nowy moduł `vilda_bmi_journey.js`), wg makiety iterowanej z właścicielem:

1. **Nagłówek celu (wyśrodkowany)**: „Twój cel: −X kg / do górnej granicy normy BMI (24,9 u dorosłych; 85. centyl dla wieku u dzieci) / Start · Cel". Bez trybu rozkazującego i bez sześciocyfrowych kalorii; bez linii/paska postępu (decyzja właściciela). Uwaga: etykieta u dorosłych pokazuje 24,9 — rzeczywisty cel redukcyjny (0,1 BMI poniżej progu normy), spójny z liczonym „Cel: … kg".
2. **Przełącznik „Połącz z planem diety" (wyśrodkowany, domyślnie włączony)** + chipy diet: deficyty liczone produkcyjnym silnikiem Planu odchudzania (`energyBuildPlanReductionState` → `proposeDietsFromTEE`; minima kaloryczne i wariant dziecięcy w silniku). Domyślna dieta: lekka u dzieci, umiarkowana u dorosłych — dopóki użytkownik nie wybierze własnej.
3. **Chipy ruchu (wyśrodkowane, wielokrotny wybór)** — stałe dawki tygodniowe: spacer 30 min/d (210 min), rower 2×45, basen 1×45, taniec 1×60, bieganie 3×30; kcal/tydzień = MET × 3,5 × masa / 200 × minuty (istniejąca biblioteka MET).
4. **Tabela wkładów budowana z wyboru**: wiersz na każdą zaznaczoną pozycję (kcal/tydzień, wkład −kg/mies. = kcal_tydz × 52/12/7700) + wiersz „Razem"; pusta prosi o wybór.
5. **Termin i oś czasu**: czas łączony = kg_do_celu × 7700 / (7 × deficyt_diety + kcal_ruchu_tydz); prezentacja w miesiącach zaokrąglanych do 0,5 z polską odmianą; zdanie „Przy tym planie osiągniesz normę BMI 〈w miesiącu roku〉 (za ok. X …)"; pigułka „Dzięki ruchowi o Y szybciej niż na samej diecie" (warianty brzegowe: „dołóż ruch…", „włącz plan diety — sam ruch to długa droga"); oś czasu ze znacznikami „dieta + ruch" / „sama dieta". Stara tabela MET (dystanse/czasy) przeniesiona pod zwijane „Pełna tabela aktywności"; odznaka roczna porównuje roczny dystans spaceru z trasami miast.
6. **Zakres i stan**: wybór (toggle/dieta/ruch) trwały w `localStorage` i przeżywa przeliczenia karty; dzieci 2–5 lat i < 2 lat bez panelu (komunikaty z etapu 1 — tam pozostaje też dopisek „Nadwyżka względem 50. centyla BMI"); niedowaga i norma bez zmian; przy braku modułu karta degraduje się do poprzedniego HTML. PDF raportu — osobny etap.

Korekta v7 (2026-08-12, po testach właściciela na produkcji): (a) układ skompaktowany do wąskiej kolumny karty (~350 px) — mniejszy nagłówek celu, ciaśniejsze chipy, nagłówki tabeli „kcal/tydz." / „kg/mies." z wartościami bez jednostek w komórkach; (b) sekcja „Pełna tabela aktywności (dystanse i czasy)" usunięta w całości; (c) style odporne na motywy: globalne `th{background:var(--secondary);color:#fff}` ze `style.css` oraz `.liquid-ios26 button{…}!important` z motywu liquid glass nadpisywały nagłówki tabeli (niewidoczne) i wygląd chipów — panel ma teraz jawne tła/kolory z `!important` i specyficznością `#bmiJourneyMount .bmi-journey-…`, plus ciemniejsze warianty kolorów pod `.liquid-ios26` dla kontrastu na jasnym szkle. Testy: TONORM-J-THEME (computed styles pod klasą liquid-ios26), TONORM-J-NARROW (brak poziomego przewijania przy 380 px).

Testy: TONORM-J-ADULT-PANEL, TONORM-J-INTERACTIONS, TONORM-J-CHILD, TONORM-J-PERSIST + zaktualizowane TONORM-S1-OLDER-JOURNEY/S2-NEAR-LIMIT w `tests/e2e/bmi-norm-path-logic.spec.mjs`.

### ENERGY-PAL — potwierdzenie mnożnika wzrastania (U3) i PAL 1,4 dla 10–18 lat jako opcja kliniczna (2026-08-12, decyzja właściciela)

**U3 — mnożnik wzrastania potwierdzony w pierwotnym źródle.** Rozdział o energii w PDF-ie norm (w repo): „U dzieci i młodzieży w wieku od 1 do 18 lat wydatek energetyczny związany ze wzrastaniem został uwzględniony jako 1 % wzrost wartości PAL dla każdej grupy wiekowej". Aplikacja mnoży TEE przez `ENERGY_CHILD_GROWTH_MULTIPLIER = 1,01` do 18 r.ż. włącznie — ponieważ TEE = REE × PAL, podniesienie PAL o 1% i pomnożenie TEE przez 1,01 są tożsame. Konwencja aplikacji jest więc dokładnie metodą norm; bez zmian kodu.

**Zestawy PAL wg norm (ten sam rozdział):** dzieci 1–3 lata — jeden poziom 1,4; dzieci 4–9 lat — 1,4/1,6/1,8; dzieci i młodzież 10–18 lat — 1,6/1,8/2,0; REE dzieci wzorami Henry'ego, masy/wysokości referencyjne z WHO (1–3) i OLA/OLAF (3–18). Zestawy w module energii (`vilda_diet_plan_ui.js`) są z tym zgodne.

**Zmiana (prośba właściciela):** rosnąca otyłość i malejąca aktywność dzieci uzasadniają możliwość świadomego wyboru PAL 1,4 także w wieku 10–18 lat, którego normy dla tej grupy nie definiują. Wdrożono go analogicznie do istniejącego dorosłego PAL 1,2 („tryb kliniczny poza Normami 2024"):

1. **Wspólny moduł energii**: nowy zestaw `child_10_18_clinical = [1,4, 1,6, 1,8, 2,0]` zwracany przez `energyGetAllowedPals(…, "clinical")`; flaga `clinicalOverride` uogólniona z „PAL 1,2 u dorosłych" na „PAL spoza zestawu normatywnego danej grupy wieku"; plakietka „Tryb kliniczny" i opis PAL podają właściwą wartość (nie tylko 1,2); opcje selectów budowane przez moduł dostają dopisek „(poza Normami 2024)" dla wartości pozanormatywnych.
2. **Plan odchudzania**: dostaje 1,4 dla 10–18 lat automatycznie (preset `plan_reduction` używa polityki klinicznej) — dotąd select dla tej grupy zawierał tylko 1,6–2,0, a programowe 1,4 przycinano do 1,6.
3. **Karta Norm żywieniowych**: selektor PAL dla 10–18 lat pokazuje dodatkową opcję „1.4 – mała aktywność (poza Normami 2024)"; jej wybór liczy energię tą samą metodą norm (Henry × PAL × korekta wzrastania +1%), a karta pokazuje komunikat informacyjny („normy dla 10–18 lat definiują PAL 1,6–2,0; przyjęto na podstawie oceny klinicznej"). Rozwiązanie selekcji przechodzi na politykę kliniczną wyłącznie dla wartości z listy rozszerzeń dla dzieci — dorosły PAL 1,2 pozostaje na karcie niedostępny. „Pełen zakres aktywności" pozostaje normatywny (1,6–2,0). Makra %E→g przeliczają się z niższego TEE; białko w g/d bez zmian (liczone od masy). Model karty niesie flagę `energy.clinicalPal`, a karta raportu pacjenta dopisuje zastrzeżenie o wyborze poza normami.
4. **Bez zmian**: dzieci 1–9 lat (1,4 pozostaje opcją normatywną bez adnotacji), dorośli (1,2 nadal tylko w trybach klinicznych planu/spożycia), niemowlęta.

Testy: NORM-PAL14-CHILD (TEE 13-latka skaluje się liniowo z PAL, komunikat, opcja z dopiskiem, nota w raporcie), NORM-PAL14-RANGE-AND-GUARDS (pełen zakres bez 1,4; 4–9 lat bez adnotacji; dorosły bez 1,2 na karcie), NORM-PAL14-SHARED (zestawy normative/clinical, `clinicalOverride`, select planu z 1,4 i dopiskiem) w `tests/e2e/nutrition-norms-logic.spec.mjs`.

### ENERGY/GROWTH — prognoza wzrostu ostatecznego w zaleceniach dietetycznych (2026-08-11, decyzja właściciela)

Dotąd wszystkie szacunki „ile dziecko może jeszcze urosnąć" w module zaleceń dietetycznych — oraz bramka dostępności strategii stabilizacji masy — opierały się wyłącznie na MPH (mid-parental height, `advancedGrowthData.targetHeight` = (wzrost matki + ojca ± 13)/2, przedział ±8,5 cm). Aplikacja dysponuje jednak lepszymi metodami prognozy wzrostu ostatecznego na karcie „Zaawansowane obliczenia wzrostowe" (RWT, Bayley–Pinneau, Khamis–Roche, Reinehr/CDGP z profilem wiarygodności i ważonym konsensusem).

Po zmianie (decyzja właściciela: konsensus metod, gdy dostępny; widełki ± metody preferowanej):

1. **Publikacja prognozy**: czysta funkcja `window.VildaGrowthCardC.computeFinalHeightPrediction(...)` (wydzielona z logiki karty — te same wagi: waga metody = f_wiar(poziom)/σ², σ = półszerokość 90% błędu / 1,645; przy jednej metodzie — jej wynik; MPH celowo poza konsensusem jako cel genetyczny, nie prognoza). Adapter karty dopisuje wynik do `advancedGrowthData.finalHeightPrediction` — `{cm, halfWidthCm (przedział metody preferowanej), methodCount, source, sourceLabel, preferredKey/Label, minCm, maxCm, agreementLabel, methods[]}` — przy każdym przeliczeniu karty.
2. **Konsumenci** (reguła: prognoza jeśli dostępna i skończona, inaczej MPH — dotychczasowe zachowanie): (a) pozostały wzrost w narracji zaleceń (`je`/`Vi`; przy prognozie ≤ obecny wzrost wzrost traktowany jako zakończony — prognoza to szacunek wzrostu ostatecznego, który, inaczej niż MPH, nie powinien być przekraczany „z natury"); (b) nawias źródłowy w tekstach — „prognozowany wzrost ostateczny — konsensus N metod z karty zaawansowanych obliczeń wzrostowych — to ok. X cm ±Y cm" zamiast „na podstawie wzrostu rodziców … ±8,5 cm"; (c) sufit projekcji wzrostu w symulacji „czas do normy BMI"; (d) bramka dostępności stabilizacji (`isStabilizationPossibleForCurrentData`/`updateStabilizationEligibility` w app.js) — masa docelowa przy górnej normie BMI liczona na wysokości prognozy, nie MPH.
3. **Wpływ na wcześniej zapisane wyniki**: u dzieci z wypełnioną kartą zaawansowaną (rodzice + ew. wiek kostny) pozostały wzrost i decyzja o stabilizacji mogą się zmienić — np. dziecko z opóźnionym wiekiem kostnym i niskim MPH może odzyskać opcję stabilizacji (prognoza > MPH), a z przyspieszonym — ją stracić. Bez danych karty zachowanie bez zmian (fallback MPH, a bez rodziców — brak szacunku, jak dotąd).

Testy na rzeczywistych funkcjach produkcyjnych (`calculateGrowthAdvanced` → `generateDietRecommendations`/`updateStabilizationEligibility`): DIET-FINAL-HEIGHT-CONSENSUS (konsensus 3 metod cytowany w tekście, pozostały wzrost = prognoza − wzrost obecny co do 0,1 cm, fallback MPH po usunięciu prognozy) i DIET-STAB-FINAL-HEIGHT (dziewczynka 11 lat, MPH 152 cm vs konsensus ~166,6 cm przy opóźnionym wieku kostnym: stabilizacja dostępna z prognozą, zablokowana przy samym MPH) w `tests/e2e/diet-recommendations-logic.spec.mjs`; matematyka konsensusu zweryfikowana niezależnie od DOM (zgodność z ręcznym wyliczeniem wag co do pełnej precyzji).

### GROWTH-LMS — interpolacja krzywych centylowych Palczewskiej (2026-08-11)

Dane: `centile_data.js` (Palczewska & Niedźwiecka, IMiD 1999; waga, wzrost i BMI, węzły 1–222 mies., rozstaw od 1 mies. w niemowlęctwie do 12 mies. w wieku szkolnym; wszystkie 180 wierszy ma komplet p3–p97, co potwierdza test regresyjny).

Metoda (moduł `vilda_centile_interpolation.js` v2, `window.VildaCentileInterp`, metoda `pchip-whittaker-henderson`) — potok na serię (płeć × rodzaj × centyl):

1. monotoniczny sześcienny spline Hermite'a PCHIP w wariancie Fritscha–Carlsona/Butlanda przez opublikowane węzły tabeli (nachylenia wewnętrzne: ważona średnia harmoniczna ilorazów różnicowych, zero przy zmianie znaku; nachylenia brzegowe: niecentrowany wzór trójpunktowy z klamrami zachowującymi kształt);
2. próbkowanie co 1 miesiąc na zakresie danych;
3. graduacja Whittakera–Hendersona (minimalizacja Σ(f−y)² + Σ λ(m)·(Δ²f)²) z λ zależnym od wieku: λ(m) = 256·clamp(((m−3)/21)², 0,02, 1). Rampa chroni realną, dużą krzywiznę 1.–24. miesiąca, a pełna kara usuwa szum zaokrągleń tabeli (rozdzielczość 0,1 kg/cm przy przyrostach 0,2–0,3 między węzłami), który przy czystym PCHIP (wersja v1 modułu, wycofana po ocenie wizualnej właściciela) dawał widocznie pofalowane krzywe;
4. finalny ewaluator: PCHIP przez graduowane próbki miesięczne.

Własności zmierzone na produkcyjnych danych i objęte testem `tests/unit/centile-interpolation.test.mjs` (na rzeczywistych funkcjach produkcyjnych): gładkość (maks. druga różnica próbek miesięcznych) co najmniej taka jak dawnego wygładzania uśrednianiem w strefie 1–18 lat i równoważna (tolerancja 1,15×, realna krzywizna niemowlęca) w strefie 0–3; odchyłka od opublikowanych wartości tabeli mniejsza niż dawnego wygładzania (waga: ≤0,20/0,28 kg wobec dawnych 0,33/0,66; wzrost: ≤0,62/0,26 cm wobec 1,06/0,61; BMI: ≤0,50/0,06 wobec 0,75/0,31 — strefa 0–3 / 1–18); brak przecięć sąsiednich linii centylowych (siatka co 0,25 mies.).

Granice i ekstrapolacja (reguły przejęte z wcześniejszej produkcyjnej funkcji `getPalReferenceCentileInterpolated` w `app.js`, stosowane na wartościach graduowanych): dla wieku ≤ pierwszego węzła ekstrapolacja liniowa z dwóch pierwszych próbek (używana przez siatkę 0–3 dla miesiąca 0.); dla wieku ≥ ostatniego węzła wartość ostatniej próbki; poza tym brak ekstrapolacji.

Zastąpiona implementacja: interpolacja odcinkowo-liniowa z następczym wygładzaniem uśrednianiem rysowanych krzywych (siatka 1–18: 12 przejść jądra 1-2-3-2-1/9; siatki 0–3: 6 przejść średniej 3-punktowej), powielona w `inline_index_03/04/07.js` i `inline_docpro_01/02/05.js`. Wygładzanie uśrednianiem przesuwało rysowane krzywe względem tabeli (do 1,06 cm na wzroście 0–3), a centyl liczbowy liczony był z danych niewygładzonych — punkt pacjenta mógł leżeć po złej stronie narysowanej linii. Po zmianie krzywe i obliczenia numeryczne (`getPLWeightCentile`/`getPLHeightCentile` → `calcPercentileStatsPL`) używają tej samej funkcji graduowanej; wartości numeryczne odchylają się od surowej tabeli w granicach podanych wyżej (mniej niż dawne krzywe rysowane).

Krzywe LMS (OLAF, WHO, zespół Downa) nie przechodzą przez moduł: interpolacja parametrów LMS (`getLMSFromDataset`; konsumenci m.in. `bp_module.js`) pozostała nietknięta (liniowa per parametr), a ich potok rysowania zachowuje dotychczasowe wygładzanie uśrednianiem (6 przejść średniej 3-punktowej) — wygląd bez zmian. Guardy w `inline_index_03/04.js` i `inline_docpro_01/02.js` pomijają wygładzanie wyłącznie dla źródła Palczewskiej przy aktywnym module; siatka DS (`inline_index_05.js`) zachowuje wygładzanie bezwarunkowo.

Stary kod interpolacji liniowej i wygładzania pozostaje w plikach jako fallback wykonywany, gdy `vilda_centile_interpolation.js` nie jest załadowany. Preferencja `PAL_SMOOTH_PASSES` działa wyłącznie w ścieżce fallbacku. Moduł jest ładowany w `index.html` i `docpro.html`.

Warstwa rysowania (bez zmian algorytmicznych): od etapu 1 konsolidacji kopii siatek (2026-08-11) prymitywy rysowania — style/szerokości linii, flagi widoczności, metryki pola wykresu, motyw canvas, punkt bieżący, serie pomiarów i `drawCentileGrid` — są wyodrębnione verbatim z `inline_index_03.js` do wspólnego `vilda_centile_charts.js` (index.html + docpro.html), zastępując starszą ręczną kopię z `inline_docpro_01.js`. Niezmienność wyników wykazano regresją pikselową (SHA-256 PNG identyczne na index.html przed/po); parzystości renderowania między stronami pilnuje stały test `tests/e2e/centile-chart-parity.spec.mjs`.

Etap 2 (2026-08-11): `docpro.html` ładuje generator siatek Palczewskiej 1–18 bezpośrednio z `inline_index_07.js` — ręcznie utrzymywana kopia `inline_docpro_05.js` (zawierająca martwe gałęzie trybu publikacyjnego, nieosiągalne bez `vilda_publication_creator.js`) nie jest już ładowana. Regresja pikselowa przed/po: pełne canvasy generatora (wzrost i waga, 2 zestawy wejść) bitowo identyczne na obu stronach; parzystości pilnuje drugi test w `centile-chart-parity.spec.mjs`. Plik `inline_docpro_05.js` pozostaje w repozytorium wyłącznie dla zgodności wymaganego precache Service Workera (lista append-only).

Etap 3 (2026-08-11, finał konsolidacji): `docpro.html` ładuje także `inline_index_03.js` (LMS, nagłówek imienia, strona standardUser, legacy generator) oraz `inline_index_04.js` (buildCentilePageCanvas, stan siatek, generateCentileChart) zamiast starszych kopii `inline_docpro_01/02.js` — cały stos rysowania siatek jest teraz jednym zestawem plików dla obu stron. Regresja pikselowa: index.html bitowo niezmieniony (5/5 przypadków); strony Palczewska 0–3 i OLAF 3–18 bitowo identyczne między stronami; strona WHO 0–35 identyczna przy ujednoliconej bramce elementów kreatora (test ze stubem) — jedyna produkcyjna różnica to element „podsumowanie" sterowany kreatorem publikacji, który jest załadowany wyłącznie na index.html (różnica konfiguracji stron, nie kodu siatek). Parzystości pilnuje trzeci test w `centile-chart-parity.spec.mjs`. Pliki `inline_docpro_01/02.js` pozostają w repozytorium dla zgodności precache SW.

Ujednolicenie bramek (2026-08-11, decyzja właściciela): `docpro.html` ładuje także `vilda_publication_creator.js` (moduł pasywny — bez przycisku i UI kreatora na tej stronie), przez co bramki `isElementEnabled` („Elementy siatki", w tym domyślnie wyłączona ramka podsumowania w kontekście WHO) oraz adnotacje zapisane z pacjentem działają identycznie na obu stronach. Regresja pikselowa: pełna naturalna parzystość index↔docpro (5/5 przypadków bitowo identycznych, bez stubów); test parzystości stron uproszczony do wariantu produkcyjnego.

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
