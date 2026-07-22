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
| RENAL | Klirens, eGFR, BSA i wskaźniki moczowe | `kalkulator-klirens.html`, `inline_kalkulator_klirens_*.js` | E2E wyłącznie ładowania strony; brak dedykowanej regresji równań | wysoki priorytet przeglądu wersji równań i etykiet |
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

### RENAL — nazwa i wersja CKD-EPI

Interfejs i komentarze nie używają obecnie całkowicie spójnego nazewnictwa roku równania i roku wytycznych. Nie należy zmieniać etykiety ani wzoru bez jednoczesnej identyfikacji publikacji równania, populacji oraz dokumentu klasyfikacyjnego.

### GROWTH-PRED — pochodzenie danych

Dane Bayley–Pinneau oraz część modelu RWT wymagają jednoznacznego zapisu pochodzenia tabel/wykresu, metody transkrypcji lub interpolacji, zakresów oraz prawa wykorzystania. Test zgodności z obecną tablicą nie zastępuje weryfikacji materiału źródłowego.

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
