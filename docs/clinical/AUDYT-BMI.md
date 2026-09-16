# Audyt obliczeń BMI w aplikacji (2026-09-16)

**Zlecenie właściciela:** „zrób audyt obliczenia BMI w aplikacji — tak jak robiliśmy z tempem wzrastania. […] na podstawie tej aplikacji będzie stworzona inna aplikacja i chciałbym, żeby możliwie wszystkie obliczenia były zunifikowane, żeby można było dość łatwo przenieść tę logikę obliczeń do innej aplikacji."

**Zakres:** wzór BMI, BMI‑SDS i centyl BMI (siatki OLAF, WHO 2006/2007, Palczewska, zespół Downa), kategorie (niedowaga / prawidłowe / nadwaga / otyłość / otyłość olbrzymia; dorośli), wskaźnik Cole'a, cele „normy" (P85, P50, 24,9, 22), formaty tekstu, źródło wieku, tablice referencyjne, testy. Poza zakresem: BMR/TEE, WFL, obwody, dawkowanie.

**Metoda:** sześć niezależnych przeglądów plików (rdzeń `app.js`; karta główna `vilda_update_prep.js`; raporty i teksty; Karta pacjenta, sejf, otyłość, nadciśnienie, trajektoria; dieta, żywienie, anoreksja, zespół Downa, laboratoria; tablice, testy, kanon `ALGORITHMS.md`) — każde wystąpienie `/bmi/i` w ~50 plikach, z cytatami. Najważniejsze twierdzenia zweryfikowane **pomiarem** na produkcyjnych funkcjach wyciętych z `app.js` i prawdziwych tablicach (harness w załączniku A) oraz grepem. Żaden plik produkcyjny nie został zmieniony.

**Werdykt w jednym zdaniu:** BMI liczy w aplikacji ok. **40 wystąpień wzoru w 17 plikach** (jedna funkcja `BMI()` w `app.js` i kilkanaście własnych kopii), SDS/centyl BMI idzie **pięcioma różnymi drogami** (`bmiZscore`/`getLMS`, `advHistoryResolveMetric`, `calcPercentileStatsPal`, karta główna z własną regułą „OLAF < 3 lat → Palczewska", własne wzory LMS w modułach), a kategorię BMI rozstrzyga **co najmniej dziewięć niezależnych zestawów progów** — ten sam pacjent dostaje w różnych miejscach różny centyl, różną kategorię i różny kolor. Sytuacja jest analogiczna do tempa wzrastania i SDS wzrostu przed P‑TEMPO/P‑SDS i wymaga takiego samego programu: jeden silnik, jedna reguła siatek, jedna tablica progów, jeden formater, strażnik.

---

## 1. Jak BMI liczy się dziś — mapa ścieżek

### 1.1. Wzór

`BMI = masa [kg] / (wzrost [cm] / 100)²`. Funkcja `BMI(e,t)` w `app.js` (bez zaokrąglenia i walidacji: wzrost 0 → `Infinity`) jest używana przez **jeden** moduł (`vilda_advanced_growth.js`) i raport; pozostałe miejsca mają własną kopię (`w/Math.pow(h/100,2)`): `vilda_summary_cards.js` (8×), `vilda_diet_recommendations.js` (5×), `vilda_diet_plan_ui.js` (4×), `vilda_auth_ui.js` (4×: siatka, panel otyłości, kafelki, formularz pomiaru), `vilda_anorexia_risk.js`, `vilda_professional_module.js`, `vilda_patient_summary_copy.js` (zapas), `vilda_epicrisis_ui.js`, `obesity_therapy.js`, `obesity_therapy_monitor.js`, `obesity_migration_assist.js`, `hypertension_therapy.js`, `nutrition_micros.js`, `custom-fixes.js`, `vilda_trajectory_analysis.js`, `vilda_down_syndrome.js`, `vilda_vault.js`. Zaokrąglenie zapisu jest różne: monitor otyłości zapisuje `+bmi.toFixed(1)`, sejf `Math.round(x*10)/10`, epikryza liczy **centyl z BMI zaokrąglonego do 0,1** (`vilda_epicrisis_ui.js`), reszta z surowego.

### 1.2. Tablice referencyjne (inwentarz)

| Zbiór | Plik, zmienna | Płeć | Zakres | Typ | Cytowanie w kodzie |
|---|---|---|---|---|---|
| OLAF BMI | `app.js` `OLAF_LMS_BOYS/GIRLS` | M/F | 36–216 mies., co 1 mies. (181) | LMS; **M z dokładnością 0,1 kg/m²** | brak |
| WHO 2006 BMI (niemowlęta) | `vilda_growth_reference_data.js` `LMS_INFANT_BOYS/GIRLS` | M/F | 0–60 mies. (61) | LMS | brak |
| WHO 2006 (24–60) + WHO 2007 (61–228) | `vilda_growth_reference_data.js` `LMS_BOYS/GIRLS` | M/F | 24–228 mies. (205) | LMS (sklejka dwóch źródeł; 24–60 dubluje niemowlęcą z innym zaokrągleniem) | brak |
| P5/P85/P95 | `vilda_growth_reference_data.js` `bmiPercentiles`, `bmiInfant*` | M/F | 0–228 mies. | centyle **wyliczone** z powyższych LMS (max Δ 0,006) | brak |
| Palczewska BMI | `centile_data.js` `centileData.*.bmi` | M/F | 1–222 mies., 30 węzłów | centyle 3/10/25/50/75/90/97 (**bez 85 i 5**); 222 = kopia 216 | tylko w docs (IMiD 1999 / Med Wieku Rozw 2001) |
| Zespół Downa | `ds_lms.js` `DS_CHILD_BMI_*` | M/F | 2–20 lat, co 0,5 | LMS | **tak** (Zemel 2015, DOI) |
| Dorośli — mediana populacyjna PL | `vilda_patient_report.js` `PATIENT_REPORT_ADULT_BMI_MEDIAN_PL` | M/F | 5 pasm od 19 lat (etykieta „18–30") | mediany | brak |
| Centyle PL wzrostu i masy 0–3 lat | `app.js` `CENTILES_PL_*` | M/F | 0–36 mies. | centyle | brak; użyte tylko przez martwą `bmiPercentileChildPL` |

Nie ma CDC 2000 ani IOTF/Cole cut‑offs (grep „IOTF" = 0). „Wskaźnik Cole'a" w aplikacji = BMI / mediana BMI × 100 z progami 90/110/120, nie IOTF. Pakiet `window.VildaWzrostLMS` (P‑SDS‑1) zawiera **wyłącznie wzrost** — tablice BMI i masy są stałymi skryptowymi `app.js`, niedostępnymi dla modułów inaczej niż przez globalne funkcje. Wymóg z `ALGORITHMS.md` (GROWTH‑LMS, l. 1099: osobny wpis źródłowy per zbiór) dla BMI nie jest spełniony.

### 1.3. Pięć dróg do SDS/centyla BMI

| Droga | Funkcje | Reguła siatki | Wiek | Kto używa |
|---|---|---|---|---|
| **A. Rdzeń „karta"** | `bmiZscore` → `getLMS`; `bmiPercentileChild`; `bmiCategoryChild` | `bmiSource==="OLAF"` i 36–216 mies. → OLAF; **w każdym innym przypadku po cichu WHO** (≤60 niemowlęca, >60 WHO 2007), bez informacji o zmianie siatki; PALCZEWSKA → droga C | miesiące **zaokrąglone**, klucz dokładny, bez interpolacji | schowek Karty (`vilda_patient_summary_copy.js`), podsumowanie profesjonalne i karta „poprzedni pomiar" (`vilda_summary_cards.js`), epikryza (`vilda_epicrisis_ui.js`), mini‑podsumowanie (`custom-fixes.js`), kafelek BMI Karty pacjenta (`vilda_auth_ui.js`), idealna masa, hook „bmi50", `toNormalBMITarget`, żywienie (`nutrition_micros.js`), raport (kategoria) |
| **B. Historia** | `advHistoryResolveMetric("BMI")` → `advHistoryMetricCandidates` → `advHistoryCalcBmiStatsForSource` → `advHistoryGetBmiLMSForSource` + `advHistoryCalcLmsStats` | jawny łańcuch kandydatów z powodem: OLAF <3 lat → Palczewska → WHO; OLAF ≥3 → OLAF → Palczewska → WHO; WHO → WHO → Palczewska → OLAF; OLAF poza 36–216 → `null` (nie WHO) | miesiące zaokrąglone, interpolacja L/M/S między kluczami | raport zaawansowany (`vilda_advanced_growth.js`), Karta raportu (`vilda_patient_report.js` — centyl), trajektoria i narracja, monitor otyłości DocPro, tooltip siatki w Karcie |
| **C. Palczewska** | `calcPercentileStatsPal(…,"BMI")` | interpolacja liniowa między 7 centylami po wartości; z z `normInv`; pętla „centyl liniowy" martwa | miesiące zaokrąglone | nadciśnienie (`hypertension_therapy.js`, **zawsze**, niezależnie od `bmiSource`), drogi A/B przy PALCZEWSKA, monitor otyłości (zapas), dieta (bisekcja `te()`) |
| **D. Karta główna** | `vildaUpdatePrepComputeBmiPercentile`, `vildaUpdatePrepClassifyBmi`, `vildaUpdatePrepComputeColeState` (`vilda_update_prep.js`) | PALCZEWSKA → C; **OLAF i <36 mies. → Palczewska**, zapas A; inaczej A. Kategoria: wynik `bmiCategoryChild` jest **nadpisywany** wywołaniem resolvera z centylem Palczewskiej i z‑score z WHO (`bmiZscore`), **bez `ageMonths`** — bramka „olbrzymia od 60 mies." nie działa na karcie; < 0,25 r. → **progi dorosłe** (`bmiCategory`); powyżej 18 lat karta **wymusza `bmiSource="WHO"`** i chowa przełącznik siatek; Cole z własnego wzoru `BMI/getLMS[1]` (nie `getBmiP50ForAgeSex`), tylko < 18 lat | `getAgeDecimal()` = lata + min(11, mies.)/12, zaokrąglone do miesiąca | karta główna index/docpro (#bmiResult „BMI: 17,3 – 85 centyl (Z‑score = 1,20) (Nadwaga)" — bez jednostki kg/m²; Cole „104,3%"; kolory `bmi-warning`/`bmi-danger` tylko dla dorosłych, puls w trybie pro) |
| **E. Własne wzory LMS w modułach** | `vilda_diet_plan_ui.js` `childBmiClass`, `vilda_diet_recommendations.js` `pe()`, `vilda_anorexia_risk.js` `T()`, `vilda_auth_ui.js` (tooltip siatki), `vilda_down_syndrome.js` | każdy własny (dieta na `getLMS`, DS na własnych tablicach) | różne zaokrąglenia (`Math.round(y*12)` ignorujące miesiące, `floor(lat)*12+mies`, …) | dieta, żywienie, anoreksja, DS, siatka BMI w Karcie |

Do tego **pięć kopii dystrybuanty normalnej / erf / probit** w ścieżkach BMI (A&S 7.1.26 w `app.js`, `vilda_anorexia_risk.js`, `vilda_auth_ui.js`; A&S 26.2.17 w `vilda_diet_recommendations.js`, `vilda_down_syndrome.js`; odwrotna A&S 26.2.23 w `vilda_diet_plan_ui.js` — dokładność 4,5·10⁻⁴) i trzy kopie odwrotnego LMS („wartość dla centyla": `vilda_patient_report.js`, `vilda_auth_ui.js` `Zo`, `vilda_diet_plan_ui.js`).

### 1.4. Kategorie i progi — dziewięć zestawów

| Miejsce | Niedowaga | Norma → nadwaga | Otyłość | Otyłość ciężka / olbrzymia | Uwagi |
|---|---|---|---|---|---|
| `app.js` `vildaResolvePediatricBmiCategoryFromPercentile` (kanon BMI‑TONORM‑S1) | < 5 c | ≥ 85 c | ≥ 97 c | z ≥ 3 **i wiek ≥ 60 mies.** | brak centyla → „Brak klasyfikacji pediatrycznej — brak danych referencyjnych" |
| `vilda_update_prep.js` karta główna (`vildaUpdatePrepClassifyBmi`) | < 5 | ≥ 85 | ≥ 97 | z ≥ 3 **bez bramki wieku** (resolver wołany bez `ageMonths`) | < 0,25 r. → progi dorosłe; test e2e bramki sprawdza `bmiCategoryChild`, nie kartę |
| `app.js` `bmiCategoryChildExact` (używa `hypertension_therapy.js`) | < 5 | ≥ 85 | ≥ 97 | ≥ 99,9 c (≈ z 3,09), **bez bramki wieku** | brak → `""` |
| `hypertension_therapy.js` — zapas lokalny | < 5 | ≥ 85 | **≥ 95** | — | aktywny bez `bmiCategoryChildExact` |
| `vilda_auth_ui.js` kafelek BMI Karty (`Y`) | **< 3** alert | ≥ 85 improve | ≥ 97 alert | — | tylko kolor, bez etykiety |
| `vilda_auth_ui.js` / trajektoria `toneCent` | < 5 warn | 85–97 warn | ≥ 97 danger | — | tooltip tej samej Karty: inny próg niedowagi niż kafelek |
| `vilda_summary_cards.js` karta „poprzedni pomiar" | < 3 alert | ≥ 85 improve | ≥ 97 alert | — | |
| `custom-fixes.js` mini‑podsumowanie | < 3 alert, < 10 borderline | > 90 borderline | > 97 alert | — | pasmo 10/90 jak dla masy |
| `nutrition_micros.js` `Gn` | **< 3** | ≥ 85 | ≥ 97 | — | dorośli od **216 mies.** |
| `vilda_diet_plan_ui.js` `childBmiClass` | — | z ≥ 1,036 | z ≥ 1,8808 | **z ≥ 2,3263 (99 c)** | przy Palczewskiej: pct ≥ 85/97/99 |
| `vilda_epicrisis.js` `fe` | brak gałęzi | ≥ 85 c lub Cole > 110 | ≥ 97 c lub Cole ≥ 120 | SDS ≥ 3 **bez bramki wieku** | rozpoznanie w epikryzie |
| `vilda_auth_ui.js` `Ms` (martwa) | < 3 | ≥ 85 | **≥ 95** | ≥ 99 „Otyłość ciężka" | etykiety „Norma BMI", „Otyłość I°" |
| `lab_clinical_panels.js` (opisy) | „< 3" i „5–85 norma" (sam plik niespójny) | 85–95 | **≥ 95** | ≥ 99 lub ≥ 120 % P95 lub ≥ 35 kg/m² | tekst edukacyjny, konwencja CDC |
| Dorośli `app.js` `bmiCategory` | < 18,5 | ≥ 25 | 30 / 35 / 40 (I/II/III) | — | literały zamiast `ADULT_BMI.OBESE` |
| Dorośli `vilda_patient_report.js` | < 18,5 | ≥ 25; **„Do obserwacji" od 24** | 30/35/40 | — | tabela „Norma 18,5–24,9", cel **24,9**; `shouldSuggestWHR` dorosły > **24** |

Granica dziecko/dorosły: **18 lat** (`ADULT_AGE_THRESHOLD`, `vilda_summary_cards.js`, `custom-fixes.js`, `nutrition_micros.js` 216 mies., `vilda_anorexia_risk.js`, kafelki Karty > 216 mies., `Mn`/`ut` monitorów), **19 lat** (`CHILD_AGE_MAX` w `toNormalBMITarget`, hook bmi50, karta główna, `ENERGY_ADULT_START_AGE` w diecie) albo **zależnie od trybu** (`patientReportIsAdultAgeForCurrentMode`: 18, w trybie PDF 19). Pacjent 18–19 lat jest w jednym widoku dzieckiem (centyle), w drugim dorosłym (25/22).

### 1.5. Wskaźnik Cole'a — cztery mediany

Cole = BMI / mediana BMI × 100, progi 90 / 110 / 120 (karta główna, raport, epikryza; kafelki Karty: < 90 lub ≥ 120 alert, > 110 improve). Mediana pochodzi z: (a) `getLMS(…)[1]` (także karta główna: `vildaUpdatePrepComputeColeState` liczy Cole własnym wzorem `BMI/getLMS[1]`, nie przez `getBmiP50ForAgeSex`) — WHO/OLAF wg `bmiSource`, **ignoruje PALCZEWSKA** (idealna masa, hook bmi50, `toNormalBMITarget`, podsumowanie, epikryza, karta „poprzedni pomiar" — tam Cole **ukryty** dla rekordów Palczewskiej); (b) `getBmiP50ForAgeSex` — p50 Palczewskiej przy PALCZEWSKA, inaczej `getLMS` (kafelki Karty, przyrost oczekiwany, schowek); (c) `advHistoryCalcColeForSource` — mediana z interpolowanego LMS wg łańcucha kandydatów (raport zaawansowany); (d) `expectedWeightAtBMI50GivenHeight` — **iloraz median masy i wzrostu**, co nie jest medianą BMI. Pomiar (zał. A3): przy PALCZEWSKA „50. centyl BMI" chłopca 24 mies. to 16,02 (getLMS) albo 16,62 (p50 Pal) — „idealna masa" przy 130 cm różni się o 1,0 kg zależnie od kafelka.

### 1.6. Źródło wieku

- karta główna, raport, podsumowanie profesjonalne, mini‑podsumowanie, epikryza: **wiek dzisiejszy z formularza** (`getAgeDecimal()`), a raport miesza go z wiekiem referencyjnym (centyl w wieku `c`, kategoria w wieku `e`); karta główna powyżej 18 lat **wymusza źródło WHO** (`vildaUpdatePrepUpdateGrowthDataSourceControls`), więc 18–19‑latek na karcie jest liczony z WHO 2007 niezależnie od wyboru lekarza, a w historii i raporcie ze źródła preferowanego;
- Karta pacjenta (kafelki), schowek, karta „poprzedni pomiar", narracja, historia: **wiek pomiaru** z rekordu (Rata B, KARTA‑SCHOWEK‑WIEK) — zgodnie z kanonem;
- wsad XLSX (`vilda_professional_module.js`): data urodzenia względem **dzisiaj** (bez daty odniesienia) i `bmiSource` na sztywno „OLAF" dla każdego źródła poza Palczewską (także WHO);
- monitor otyłości: wiek wpisany ręcznie w punkcie; `obesity_therapy.js`: **tylko pełne lata** (pole miesięcy nieużyte); `vilda_bmi_journey.js`: `ageMonthsOpt: 0` na sztywno;
- **wiek ułamkowy z daty urodzenia (DOB‑AGE‑4) nie trafia do BMI w żadnej ścieżce** — działa tylko dla wzrostu (silnik) i masy niemowląt. Wszystkie drogi zaokrąglają do pełnego miesiąca (pomiar: 47,5 mies. = 48 mies.).

---

## 2. Pomiary (produkcyjne funkcje, prawdziwe tablice; zał. A)

Chłopiec, BMI 17,0 kg/m². Karta = droga A (`bmiZscore`), historia = droga B (`advHistoryCalcBmiStatsForSource`), Pal = droga C.

| bmiSource | wiek | karta A | historia B | Palczewska C | uwaga |
|---|---|---|---|---|---|
| OLAF | 24 mies. | **z +0,75 (77 c)** — po cichu WHO | `null` | z +0,30 (62 c) | karta główna (droga D) pokaże **62 c** z Palczewskiej, ale schowek, podsumowanie i epikryza (droga A) **77 c** |
| OLAF | 35 → 36 mies. | +1,05 → **+0,88** | `null` → +0,88 | +0,67 → +0,68 | skok siatki WHO → OLAF na 3. urodziny |
| OLAF | 47,5 mies. | = 48 mies. | = 48 mies. | = 48 mies. | brak wieku ułamkowego |
| OLAF | 217–222 mies. | **−2,18 … −2,24** — po cichu WHO 2007 | `null` | −2,56 | 18–19 lat: karta liczy z WHO, raport zaawansowany nie liczy wcale, Palczewska daje trzecią liczbę |
| WHO | 60 → 61 mies. | +1,24 → +1,23 | = | | ciągłe (dwie tablice WHO zgodne) |
| PALCZEWSKA | wszystkie | = C | = C | | jedna liczba — tylko to źródło jest spójne |

Dziewczynka, BMI 17,0, OLAF: 35 mies. karta +1,12 / historia `null` / Pal +0,90; 217–228 mies. karta −1,72…−1,75 (WHO) / historia `null` / Pal −2,02; 229 mies. karta `null`.

Kategoria tego samego dziecka w różnych miejscach (progi z 1.4): centyl **4** → „Niedowaga" (karta, raport), kolor **normalny** w kafelku Karty i karcie „poprzedni pomiar" (alert od < 3), „underweight" w żywieniu tylko < 3; centyl **96** → „Nadwaga" (karta), „Otyłość" w zapasie nadciśnienia i w tekstach laboratoryjnych (95); z = **3,05 w 4. roku życia** → „Otyłość" na karcie (bramka 60 mies.), „Otyłość olbrzymia" w epikryzie i w `bmiCategoryChildExact` (99,9 c); dorosły BMI **24,95** → „W zakresie" w raporcie, a obok zdanie „Aby BMI wróciło do zakresu prawidłowego … zredukować masę o ok. 0,2 kg" (cel 24,9), i „Do obserwacji" (≥ 24).

---

## 3. Znaleziska (ważność: 🔴 wynik kliniczny inny w różnych miejscach · 🟠 niespójność reguły · 🟡 higiena kodu / dokumentacja)

1. 🔴 **Dziecko < 3 lat przy OLAF ma dwa centyle BMI.** Karta główna liczy z Palczewskiej (droga D), a schowek, podsumowanie, epikryza, mini‑podsumowanie, kafelek Karty pacjenta i idealna masa z WHO 2006 (droga A, bez sygnału o zmianie siatki); raport zaawansowany — z Palczewskiej przez łańcuch kandydatów. Dla wzrostu ten sam problem rozstrzygnęła decyzja 1 z P‑SDS‑1 (OLAF < 3 lat → Palczewska), ale dla BMI jej nie wdrożono. Pomiar: 24 mies., BMI 17 → 62 c vs 77 c.
2. 🔴 **18–19 lat przy OLAF: trzy odpowiedzi.** `getLMS` po cichu przechodzi na WHO 2007 (217–228 mies.; karta główna dodatkowo wymusza WHO powyżej 18 lat i chowa przełącznik), `advHistoryGetBmiLMSForSource` zwraca `null` (raport zaawansowany bez BMI‑SDS), Palczewska liczy do 222; schowek, podsumowanie i epikryza (droga A) liczą z WHO bez adnotacji o zmianie siatki. Analogicznie 35 → 36 mies.: skok WHO → OLAF bez adnotacji.
3. 🔴 **Karta główna miesza siatki w jednej kategorii**: centyl z Palczewskiej (OLAF < 36 mies.), z‑score do „otyłości olbrzymiej" z WHO (`bmiZscore`); dla dziecka < 0,25 r. kategoria (`window.lastBmiCategory`, puls w trybie pro) pochodzi z **progów dorosłych** (`bmiCategory`), choć etykieta jest ukryta poniżej 2 lat.
4. 🔴 **Próg niedowagi 3 c vs 5 c** — kanon 5 (BMI‑TONORM‑S1, `PERCENTILE_CUTOFF_UNDERWEIGHT`), ale kafelek BMI Karty pacjenta, karta „poprzedni pomiar", mini‑podsumowanie i żywienie alarmują od 3; tooltip Karty i trajektoria od 5. Dziecko na 4. centylu: etykieta „Niedowaga" bez koloru ostrzegawczego w Karcie.
5. 🔴 **Otyłość olbrzymia bez bramki wieku** na karcie głównej (`vildaUpdatePrepClassifyBmi` woła resolver bez `ageMonths`), w epikryzie (`fe`: SDS ≥ 3) i w `bmiCategoryChildExact` (≥ 99,9 c) wobec kanonu BMI‑TONORM‑S1 „tylko od 60 mies." — bramka działa dziś wyłącznie w `bmiCategoryChild` (raport, widoczność sekcji otyłości). Test e2e `TONORM-S3-SEVERE-LABEL` sprawdza `bmiCategoryChild` i resolver, **nie tekst karty**, więc regresja karty jest niewidoczna dla CI.
6. 🔴 **Nadciśnienie liczy centyl BMI zawsze z Palczewskiej** (`hypertension_therapy.js`), niezależnie od `bmiSource`, a wzrost w tym samym raporcie wg `bmiSource`; zapasowa klasyfikacja ma próg otyłości 95 c.
7. 🔴 **Dorośli: cel 24,9 vs klasyfikacja 25 vs „Do obserwacji" od 24 vs WHR od > 24.** BMI 24,95: „W zakresie" i jednocześnie „zredukować o 0,2 kg".
8. 🔴 **Granica dorosłości 18 / 19 / wg trybu** — pacjent 18,5 lat: centyl dziecięcy w raporcie PDF, brak centyla w mini‑podsumowaniu, tony dorosłe w karcie „poprzedni pomiar", cel P85 w „Drodze do normy", progi 25/18,5 w żywieniu.
9. 🟠 **Mediana BMI (P50) dla PALCZEWSKA z dwóch źródeł** (1.5): „idealna masa" i cel P85 z `getLMS` (WHO), Cole i przyrost z p50 Palczewskiej; Cole ukryty dla rekordów Palczewskiej w karcie „poprzedni pomiar", policzony w schowku i raporcie.
10. 🟠 **Brak wieku ułamkowego z daty urodzenia dla BMI** (DOB‑AGE‑4 tylko dla wzrostu/masy niemowląt): u niemowlęcia BMI‑SDS liczy się wierszem pełnego miesiąca, a wzrost‑SDS dokładnym wiekiem — dwa różne wieki na jednej karcie.
11. 🟠 **Raport (`patientReportBuildMetricCards`) liczy centyl w wieku referencyjnym ze źródła preferowanego, a kategorię w wieku dzisiejszym z globalnego `bmiSource`** — badge i centyl mogą się rozjechać.
12. 🟠 **`patientReportDescribeBmi` mapuje „Brak klasyfikacji pediatrycznej…" na „BMI w typowym zakresie"** — fałszywie uspokajająca nota przy braku referencji.
13. 🟠 **Wsad XLSX**: wiek z daty urodzenia na dzisiaj (nie na datę pomiaru) i `bmiSource="OLAF"` dla WHO.
14. 🟠 **Kryteria odpowiedzi na leczenie otyłości**: „bmiZscorePct" = względna zmiana BMI‑SDS w % (`(k−x)/x·100`) — przy SDS bliskim 0 lub ujemnym nieinterpretowalna (spadek z +0,2 do +0,1 = −50 %); Saxenda 12–17 w tekście ChPL „BMI lub z‑score", w `obesity_therapy.js` tylko „BMI". Monitor DocPro (`ut`) i Karta (`Mn`) liczą BMI‑SDS punktu różnymi drogami (z łańcuchem kandydatów vs bez — Karta dla OLAF < 3 lat pusta).
15. 🟠 **Cel „normy" dziecka P85 z `toNormalBMITarget`**, ale toggle stabilizacji liczy go **dla stałego wieku 18 lat i wzrostu przewidywanego**; przy Palczewskiej P85 raz bisekcją po `bmiPercentileChildPal` (dieta), raz interpolacją p75→p90 po z (plan), a zapas `getPalCentile(…,85,"BMI")` jest martwy (kolumny 85 nie ma) i dalszy zapas liczy z centyla **masy**/wzrost².
16. 🟠 **Kilogramy do normy przy niedowadze dziecka z WHO P5 niezależnie od źródła** (`kgToReachNormalBMIChild` czyta `bmiPercentiles`, 24–228 mies.; poniżej 24 mies. brak wiersza → 0 i tekst „Brakuje…" znika), podczas gdy kategoria „Niedowaga" mogła paść z Palczewskiej/OLAF.
17. 🟠 **Trzy nazwy normy na jednej karcie**: „Prawidłowe" (kategoria BMI), „W normie" (Cole, WFL), „norma" (teksty); linia BMI karty **bez jednostki kg/m²**; ostrzeżenia dorosłe od ≥ 18 lat, kategoria dziecięca do 19 lat (ten sam stan ma `isAdult: ≥18` i `isChildBmiAge: ≤19`).
18. 🟠 **Skala BMI w raporcie** ma ticki 5/50/85/95 c i etykiety wartości dla 5. i 95. centyla, choć próg otyłości to 97 (WT/HT: 3/97).
19. 🟠 **Formaty**: BMI 1 miejsce z przecinkiem prawie wszędzie, ale `hypertension_therapy.js` z kropką, oś czasu sejfu „BMI 17.3" surowo; centyl „85 centyl" (raport, schowek), „85. centyl" (epikryza, Karta), „(… c.)" (narracja), „≥97c" (tooltip); SDS „(Z‑score = 1,20)" bez znaku (schowek, podsumowanie) vs „ΔBMI‑SDS +1,20" (narracja) vs `at()` „+2,15" (monitor) vs liczba z kropką (XLSX); Cole „Cole’a" (U+2019) vs „Cole'a" (ASCII).
20. 🟡 **Martwy kod**: `bmiPercentileChildPL` (pseudo‑centyl BMI 0–36 mies. z centyli masy i wzrostu — metodycznie błędny), `kgToReachNormalBMIChild`, `bmiBoxClassForAdult`, `anorexiaSeverityAdult`, `Ms`/`js` w `vilda_auth_ui.js`, pętla „centyl liniowy" w `calcPercentileStatsPal`, wyrażenie `b<=5` w `applyProModePulse`; `CHILD_THRESH_WHO` i `CHILD_THRESH_OLAF` identyczne, więc flaga `useOlaf` nic nie zmienia; `calcPercentileStats(…,"BMI")` trafiłoby do silnika **wzrostu** (nikt tak nie woła, ale funkcja jest globalna).
21. 🟡 **Tablice bez cytowania i o różnej precyzji**: OLAF BMI z medianą do 0,1 kg/m² (przy wzroście po P‑SDS‑1 mediana do 0,01 cm), dwie kopie WHO 2006 24–60 mies. o różnym zaokrągleniu, P5/P85/P95 jako pochodna, wiersz 222 Palczewskiej = kopia 216, mediany dorosłych PL bez źródła i z pasmem „18–30" od 19 lat.
22. 🟡 **Testy**: żadna wartość `OLAF_LMS_*`, `LMS_BOYS/GIRLS` 61–228, `centileData.*.bmi`, `DS_CHILD_BMI_BOYS` nie ma kotwicy liczbowej (jedyne kotwice BMI: WHO 24 mies. P5/P85/P95 i DS dziewczęta 5 lat); `getLMS`, `bmiZscore`, `bmiPercentileChild`, `bmiCategoryChild`, `bmiCategory`, `advHistoryCalcColeForSource`, `toNormalBMITarget`, karta główna (`vildaUpdatePrepComputeBmiPercentile`, `vildaUpdatePrepClassifyBmi`), `hypertension_therapy.js`, `vilda_anorexia_risk.js`, `obesity_response_criteria.js`, `vilda_bmi_journey.js` — niepilnowane numerycznie (e2e sprawdza etykiety). Testy dietetyczne używają **atrap LMS** („uproszczone stałe testowe"). Strażnik `sds-straznik` dopuszcza wzór LMS w plikach BMI „z powodem" — powód będzie zbędny po unifikacji.

---

## 4. Propozycja unifikacji — silnik `vilda_bmi.js` (`window.VildaBmi`, bez DOM), wzorem `vilda_sds_wzrostu.js`

**Jedna odpowiedzialność, jeden wynik.** Każdy konsument dostaje ten sam obiekt i tylko go formatuje.

| Funkcja | Rola |
|---|---|
| `bmi({masaKg, wzrostCm})` | wzór, walidacja (wzrost > 0, masa > 0), bez zaokrąglenia; `null` zamiast `Infinity` |
| `policz({masaKg, wzrostCm, plec, wiekMies, zrodlo, wiekDokladnyMies?})` | `{bmi, sds, centyl, mediana, siatka, zrodloZadane, fallback, powod, pozaZakresem, kategoria, kolor, cole, wiekMies}` — **jedna reguła siatek dla wszystkich ścieżek**, jawny łańcuch zastępczy z powodem (jak w silniku wzrostu), wiek ułamkowy z daty urodzenia przez interpolację L/M/S (DOB‑AGE‑4 także dla BMI) |
| `kategoria({centyl, sds, wiekMies, dorosly})` | jedna tablica progów: niedowaga < 5 c, nadwaga ≥ 85 c, otyłość ≥ 97 c, olbrzymia sds ≥ 3 od 60 mies. (kanon BMI‑TONORM‑S1); dorośli 18,5 / 25 / 30 / 35 / 40; **jedna** granica dorosłości; etykiety i klasa koloru (`alert` / `improve` / `ok`) z tego samego miejsca |
| `cole({bmi, plec, wiekMies, zrodlo})` | BMI / mediana × 100 z **tej samej mediany**, co `policz` (p50 Palczewskiej przy PALCZEWSKA), progi 90 / 110 / 120, etykieta |
| `wartoscDlaCentyla({centyl, plec, wiekMies, zrodlo})` / `wartoscDlaSds` | odwrotność (P85 celu, P50 masy należnej, P5 niedowagi) — także na Palczewskiej (interpolacja po z między sąsiednimi centylami, jedna metoda zamiast bisekcji i „masy/wzrost²") |
| `celNormy({…})` | P85 dla dziecka, 24,9 (lub 25 — decyzja) dla dorosłego; masa docelowa = cel × wzrost² — dla „Drogi do normy", diety, planu, stabilizacji (z wiekiem **bieżącym**, nie stałym 18) |
| `formatuj(model)` | „BMI 17,3 kg/m²", „bmiSDS +1,20" (2 miejsca, znak, przecinek — jak `fmtSds`), centyl wg ADV‑REPORT‑5 („<1", „>99", liczba) + odmiana „centyl/centyla", „wskaźnik Cole'a 105,3 %" |
| `ustawDane()` | tablice wstrzykiwane w testach; produkcyjnie z pakietu `window.VildaBmiLMS` (OLAF BMI, WHO 2006/2007 — **jedna** tablica WHO bez duplikatu 24–60) + `VildaCentileInterp` dla Palczewskiej; brak `eval`/`Function` (CSP) |

Zasady przenośne do nowej aplikacji: (1) dane referencyjne w osobnym pakiecie z cytowaniem per zbiór (Kułaga i wsp. — OLAF/OLA; WHO 2006 / 2007; Palczewska & Niedźwiecka 2001; Zemel 2015) i z podaną precyzją; (2) jeden moduł matematyki (LMS, Φ, Φ⁻¹, interpolacja) współdzielony z silnikiem wzrostu (dziś `normalCDF`/`normInv` istnieją w `vilda_sds_wzrostu.js` — do wyniesienia do wspólnego `vilda_statystyka.js`); (3) konsumenci nie znają nazw tablic ani progów; (4) wiek do siatek zawsze = wiek pomiaru (rekord / data pomiaru), nigdy dzisiejszy dla starych pomiarów; (5) strażnik zakazujący wzoru BMI, wzoru LMS i progów liczbowych poza silnikiem.

**Plan etapów (wzorem P‑TEMPO/P‑SDS):**
1. Silnik + rdzeń: `vilda_bmi.js`, pakiet `VildaBmiLMS`, `app.js` deleguje (`bmiZscore`, `bmiPercentileChild`, `bmiCategoryChild`, `getLMS`, `advHistoryCalcBmiStatsForSource`, `advHistoryCalcColeForSource`, `toNormalBMITarget`, `getBmiP50ForAgeSex`), karta główna (`vilda_update_prep.js`) — test parzystości na dzisiejszych liczbach dla ≥ 3 lat OLAF/WHO i dla Palczewskiej; zamierzone zmiany tylko tam, gdzie właściciel zdecyduje (poniżej).
2. Wyjścia tekstowe: raport, podsumowanie, schowek, epikryza, narracja, mini‑podsumowanie — jeden formater, jedna kategoria, jedna mediana Cole'a.
3. Karta pacjenta, sejf, trajektoria, panel porównania, siatka BMI, monitor otyłości (DocPro i Karta tą samą drogą), kryteria odpowiedzi (definicja „bmiZscorePct").
4. Moduły specjalne: dieta i plan (P85/P50 z silnika, bez bisekcji), żywienie, anoreksja, nadciśnienie (siatka wg `bmiSource`), wsad XLSX (wiek na datę pomiaru), zespół Downa (własne tablice, ale wspólna matematyka i formater).
5. Sprzątanie i strażnik: usunięcie martwych funkcji (§3.20), duplikatu WHO 24–60, `bmiPercentiles` (pochodna), kopii Φ/erf/probit; test strażnik jak `sds-straznik`; kotwice liczbowe tablic; wpisy źródłowe w `ALGORITHMS.md` per zbiór.

---

## 5. Pytania do decyzji właściciela (każdą można rozstrzygnąć osobno)

1. **Siatka BMI poniżej 3 lat przy OLAF**: Palczewska (jak karta główna i jak decyzja 1 dla wzrostu) czy WHO 2006 (jak schowek, epikryza, kafelki)? Rekomendacja: **Palczewska**, spójnie z P‑SDS‑1; WHO tylko przy źródle WHO.
2. **Powyżej 216 mies. (18–19 lat) przy OLAF**: jawny fallback Palczewska → WHO 2007 (jak wzrost) czy `null`? Rekomendacja: łańcuch jak we wzroście, z powodem.
3. **Próg niedowagi**: 5 c (kanon) czy 3 c (kafelki, żywienie)? Rekomendacja: **5 c wszędzie**, kolor ostrzegawczy od < 5, alarm od < 3 — ale jedna tabela.
4. **Otyłość olbrzymia**: „sds ≥ 3 od 60 mies." wszędzie (także epikryza), czy dopuścić poniżej 5 lat? Rekomendacja: kanon karty (od 60 mies.).
5. **Granica dorosłości dla BMI**: 18 lat (jak sejf, żywienie, Karta) czy 19 (jak dieta, `CHILD_AGE_MAX`) — jedna wartość, bez zależności od trybu PDF. Rekomendacja: **18 lat** (OLAF kończy się na 216 mies.; WHO 2007 do 19 lat zostaje w łańcuchu jako zapas tylko dla 18–19, gdy właściciel wybierze 19).
6. **Dorośli**: górna granica normy 25,0 (klasyfikacja) czy 24,9 (cel, tabela)? Czy „Do obserwacji ≥ 24" zostaje? Czy sugestia WHR od > 24 czy ≥ 25? Rekomendacja: klasyfikacja < 25 norma; cel „normy" = 24,9 jako liczba do zredukowania (nie kategoria); „Do obserwacji" tylko w raporcie, jeśli w ogóle.
7. **Nadciśnienie**: centyl BMI wg `bmiSource` (jak wzrost) — tak/nie.
8. **Wiek ułamkowy z daty urodzenia także dla BMI** (jak dla wzrostu, DOB‑AGE‑4) — tak/nie. Rekomendacja: tak, jedna reguła wieku dla trzech miar.
9. **„bmiZscorePct" w kryteriach Saxendy**: względna zmiana BMI‑SDS w % (dziś) czy bezwzględna ΔSDS z progiem — do ustalenia wg ChPL.
10. **Format**: „BMI 17,3 kg/m²" i „bmiSDS +1,20" (analogicznie do „hSDS −1,23") — czy zostawić w podsumowaniach „Z‑score = 1,20"?
11. **Cytowania tablic BMI**: uzupełnić OLAF (Kułaga i wsp.) i WHO w kodzie oraz wpisy GROWTH‑LMS per zbiór — tak (rekomendacja bez wątpliwości); precyzja OLAF BMI M do 0,1 — zostaje czy do uzupełnienia z publikacji?
12. **Zespół Downa**: moduły dietetyczne nie sprawdzają flagi DS — czy plan/zalecenia mają używać siatek DS, czy zostać jak dziś?

---

## Załącznik A — harness pomiarowy

Skrypt (scratchpad `bmi_harness.mjs`, nie w repozytorium) wycina z `app.js` produkcyjne `getLMS`, `bmiZscore`, `bmiPercentileChild`, `calcPercentileStatsPal`, `advHistoryGetBmiLMSForSource`, `advHistoryInterpolateLmsDataSet`, `advHistoryCalcLmsStats`, `advHistoryCalcBmiStatsForSource`, `advHistoryCalcColeForSource`, `normalCDF`, `normInv`, `erf` i tablice `OLAF_LMS_*`; ładuje `vilda_growth_reference_data.js`, `centile_data.js`, `vilda_centile_interpolation.js`; ustawia `bmiSource` i liczy te same wejścia trzema drogami. Do powtórzenia w teście parzystości etapu 1.

A1. Chłopiec, BMI 17,0 — OLAF: 12 m: A +0,15 / B null / C −0,15; 24 m: +0,75 / null / +0,30; 35 m: +1,05 / null / +0,67; 36 m: +0,88 / +0,88 / +0,68; 47,5 m = 48 m: +0,85 / +0,85 / +0,84; 60 m: +0,83 / +0,83 / +0,94; 120 m: −0,04 / −0,04 / +0,01; 180 m: −1,24 / −1,24 / −1,46; 216 m: −2,22 / −2,22 / −2,56; 217 m: −2,18 / null / −2,56; 222 m: −2,24 / null / −2,56. WHO: A = B na całym zakresie (12 m +0,15 … 222 m −2,24). PALCZEWSKA: A = B = C.

A2. Dziewczynka, BMI 17,0 — OLAF: 35 m: +1,12 / null / +0,90; 36 m: +0,93 / +0,93 / +0,91; 216 m: −1,89 / −1,89 / −2,02; 217–228 m: −1,72…−1,75 / null / −2,02; 229 m: null / null / −2,02.

A3. Mediana BMI przy PALCZEWSKA (`getLMS` vs p50 Pal): M 24 m 16,02 / 16,62; 60 m 15,19 / 15,60; 120 m 16,44 / 16,98; 180 m 19,77 / 20,10; 216 m 21,71 / 21,49; F 24 m 15,69 / 16,33; 120 m 16,61 / 16,60; 216 m 21,26 / 20,80. Masa „idealna" przy 130 cm różni się o 0,3–1,1 kg.

A4. Zgodność tablic: `LMS_INFANT_*` vs `LMS_BOYS/GIRLS` w 24–60 mies. — |Δz| ≤ 0,0003 (dwie kopie WHO 2006 o różnym zaokrągleniu); `bmiPercentiles` P5/P85/P95 = wartości z LMS przy z = −1,645 / 1,036 / 1,645 (max Δ 0,006) — pochodna, nie niezależne dane; Palczewska BMI: kolumny 3/10/25/50/75/90/97, **kolumna 85 nie istnieje** (`palCentileValue(...,85,'BMI') = null`), zakres 1–222 mies. (223 = wartość 222).
