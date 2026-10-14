# Historia i porównanie wyników badań laboratoryjnych: propozycja dla właściciela

Stan dokumentu: projekt do decyzji właściciela, 2026-10-14. Nic z tego dokumentu nie jest wdrożone. Opisuje funkcję, miejsca w interfejsie, model danych, etapy wdrożenia i decyzje, które należą do właściciela.

Baza kodu: `origin/audyt` po #669 (`2df41a8`, 2026-10-14), SW 1.1.271, `vilda_auth_ui.js?v=489`, `vilda_vault.js?v=210`, `lab_pin_result.js?v=6`, `vilda_lab_snapshot.js?v=7`. Otwarty równolegle PR #673 (`agent/inhibin-female-childhood`) zmienia `przelicznik-jednostek.html`, `vilda_hormone_lifespan*.js`, service worker i `tests/fixtures/wersje-zasobow.json`.

Makieta desktop i mobile (AGENTS.md § 5): płótno „Historia badań — makieta” na claude.ai, https://claude.ai/artifact/2VQeLt8SmXQazscJeHcDcj (pięć tablic: karta pacjenta → zakładka „Badania” na desktopie i telefonie 390 px, przelicznik z paskiem „Poprzednie wyniki” na desktopie i telefonie, stany brzegowe). Dane w makiecie są fikcyjne, zakresy poglądowe.

Dokument powstał z pięciu map kodu i dokumentacji (karta pacjenta, przelicznik, warstwa danych, reguły właściciela i design system, powłoka i nawigacja), trzech niezależnych projektów, ocen trzech sędziów, syntezy, trzech krytyk (reguły, wykonalność, bezpieczeństwo kliniczne) z głosowaniem refutacyjnym oraz osobnej recenzji makiety. Numery linii odnoszą się do plików w repozytorium na wskazanej bazie.

---

## 1. Streszczenie dla właściciela

**Co już jest.** Przypięty w przeliczniku wynik to notatka pacjenta kategorii „wynik-badania” z polem `labResult` (`test`, `value`, `testKey`, `valueNum`, `unit`, dla LH/FSH/inhibiny B także zamrożona ocena). Sejf ma gotową funkcję `VildaVault.listPatientLabSeries(patientId)`, która grupuje te notatki w serie per badanie. Karta pacjenta w zakładce „Historia” renderuje już sekcję „Trend wyników”: chipy badań, wykres jednej serii, przełącznik „norma” i listę „Zapisane oceny”. Sekcja pokazuje się tylko wtedy, gdy seria ma co najmniej dwa punkty liczbowe albo zapisaną ocenę, pokazuje jedno badanie naraz i jest schowana za osią czasu.

**Czego brakuje.** Lekarz prowadzący pacjenta z nadczynnością tarczycy nie zobaczy TSH, fT4 i fT3 obok siebie; w przeliczniku, sprawdzając nowy wynik, nie widzi poprzednich; jeden wynik nie ma żadnej reprezentacji; wynik wpisany ręcznie w karcie i wynik przypięty z przelicznika mogą trafić do osobnych serii; konwersja jednostek w trendzie nie działa (zła sygnatura wywołania konwertera), więc punkty w innej jednostce są pomijane.

**Propozycja.** Dwa miejsca, jeden model danych, zero nowego magazynu:

1. **Karta pacjenta → nowa, piąta zakładka „Badania”.** Panele kliniczne (np. tarczyca: TSH, fT4, fT3; oś gonadalna: LH, FSH, estradiol, testosteron, AMH, inhibina B) jako dane konfiguracyjne; karta każdego badania z ostatnią wartością, datą, różnicą od poprzedniego wyniku i wykresem (ten sam komponent, który dziś rysuje „Trend wyników”); tabela „data × badanie” dla panelu; lista „Zapisane oceny”; pojedynczy wynik widoczny bez wykresu. Sekcja „Trend wyników” przenosi się z „Historii” do „Badań”, w „Historii” zostaje odnośnik.
2. **Jednostki laboratoryjne → pasek „Poprzednie wyniki” pod sekcją wyniku, przed wierszem przypięcia.** Tylko do odczytu: chipy poprzednich wyników wybranego badania u wczytanego pacjenta, bieżący (nieprzypięty) wynik obok nich bez daty, różnica liczbowa od ostatniego zapisanego wyniku, rozwijany wykres. Bez nowych pól formularza, bez daty pobrania w formularzu (data pada dopiero w oknie przypięcia, jak dziś).

**Zasady, których nie łamiemy.** Historia pokazuje wyniki tak, jak je zapisano; żadnego ponownego liczenia dawnych wyników dzisiejszymi normami ani danymi aktualnie wczytanego pacjenta. Wynik z operatorem („<10”) nie dostaje punktu ani zera. Punkt pacjenta na wykresie hormonów w ciągu życia nie dostaje historii (kontrakt `PATIENT_POINT.md`). Strzałki ↓↑ i pigułki „w zakresie / poniżej / powyżej” tylko dla wpisów z zakresem zapisanym w dniu badania albo z zapisaną oceną.

**Jedna zmiana danych do decyzji.** Dzisiejsze przypięcie nie zapisuje zakresu referencyjnego użytego do oceny. Bez tego historia TSH nie może uczciwie powiedzieć „ten wynik był poniżej zakresu w dniu badania”. Rekomendacja: od wdrożenia przypięcie zapisuje też zakres (granice, jednostka, źródło, wersja danych) w `labResult.range`; starsze wpisy pozostają neutralne, a pasmo „norma” dla nich jest orientacyjne i wyłączalne (jak dziś). To zmiana źródła danych w rozumieniu AGENTS.md § 3, więc wymaga akceptacji właściciela.

**Etapy.** Cztery PR-y: (0) model historii bez DOM z testami na prawdziwym sejfie i naprawa konwersji jednostek w trendzie; (1) zakładka „Badania” w karcie; (2) pasek w przeliczniku; (3) zapis zakresu przy przypięciu i scalanie serii ręcznych z przypiętymi. Szczegóły w rozdziale 5, decyzje w rozdziale 6.

---

## 2. Stan dzisiejszy

### 2.1 Zapis wyniku

- `lab_pin_result.js` czyta formularz przelicznika (`#labSubstance`, `#labValue`, `#labUnit`, `#labResultBig`), pokazuje wiersz `#labPinRow` za `#labResultSection` tylko wtedy, gdy jest wynik, identyfikator pacjenta karty (`sessionStorage.vildaCurrentPatientId`) i nazwisko z `VildaSession.getPatient()`, a po kliknięciu otwiera okno z datą badania i komentarzem.
- Zapis: `VildaVault.savePatientNote({patientId, title, body, category: "wynik-badania", clinicalDateISO, labResult: {test, value, testKey, valueNum, unit, assessment?}, linkedAgeMonths})`. `assessment` istnieje tylko dla LH, FSH i inhibiny B (analytes w `vilda_lab_snapshot.js`); TSH, fT4, fT3, AMH, estradiol i pozostałe mają wyłącznie wartość, jednostkę i klucz. Zakres referencyjny użyty do oceny w przeliczniku nie jest zapisywany.
- Sanitizacja w sejfie (`sanitizeLabResult`, `vilda_vault.js` ok. l. 1384): `test` ≤120 znaków, `value` ≤120, `norm` ≤200 (tekst z edytora notatki), `testKey` `[a-z0-9_-]{1,40}`, `valueNum` liczba ≥0, `unit` ≤20 znaków, `assessment` przez `VildaLabSnapshot.normalize`.
- Edytor notatki w karcie (kategoria „Badanie”) ma pola badanie (lista z `LabUnitConverter.list()` + „inne”), wartość, jednostka, norma tekstowa. Terminarz tworzy notatki „wynik-badania” oczekujące (`recheckDays`, `completedAtISO`) bez `labResult`.

### 2.2 Serie i transport ocen

- `VildaVault.listPatientLabSeries(patientId)` (`vilda_vault.js`, czytelny fragment) grupuje wszystkie notatki pacjenta z `labResult` po kluczu `testKey || slug(test)`; punkt: `{noteId, dateISO, ageMonths, valueNum, unit, norm, legacy, assessment?, plotValue?}`. Data punktu: `clinicalDateISO`, potem `dueDateISO` (jeśli nie z przyszłości), potem data utworzenia. `ageMonths` to kotwica wizyty (`linkedAgeMonths`), nie wiek w dniu pobrania.
- Funkcja nie filtruje po kategorii (do serii wchodzą też „wynik-klirens” i każda notatka z `labResult`), nie przelicza jednostek, nie liczy różnic. Wynik z operatorem bez oceny (ręczne „<0,02”) nie trafia do serii; z oceną trafia jako punkt bez liczby. Wynik oczekujący z Terminarza nie ma `labResult`, więc nie jest w serii.
- `vilda_lab_snapshot.js` (`normalize`, `reconcile`, `forSeries`): ocena ma status `recorded` / `invalidated` / `unavailable` z `reasonCodes`; edycja wyniku lub daty po ocenie unieważnia ją (`result_or_clinical_date_changed`, `assessment_sample_date_mismatch`). `forSeries` oddaje `plotValue` tylko dla dokładnego wyniku z operatorem „=”.

### 2.3 Karta pacjenta

- Zakładki (`vilda_auth_ui.js`, budowa ok. l. 636, obsługa ok. l. 721): „Status” (`antro`), „Postępy” dla dorosłego albo „Siatki centylowe” dla dziecka (`traj`), „Notatki” (`notes`), „Historia” (`timeline`). Na szerokości ≤1024 px zakładki są siatką 2×2 (`vilda_auth_ui.css` l. 1026), ikony znikają ≤480 px.
- „Historia” (`Xl`) renderuje najpierw „Trend wyników” (`Jl`): chipy serii, wykres `Nl` (oś wieku wizyty, gdy ≥2 punkty mają wiek, inaczej oś daty; pasmo normy z `vi`; punkty klikalne otwierające edytor `ga`), chip „norma” zapamiętany w `sessionStorage`, lista `Lh3TrendAssessments`. Warunek pokazania: ≥2 punkty liczbowe w jednej jednostce albo zapisana ocena.
- `yi` wybiera jednostkę dominującą serii i próbuje przeliczyć pozostałe punkty, ale woła `LabUnitConverter.convert(testKey, valueNum, unit)` zamiast `convert({substanceId, value, fromUnit, toUnit})`, więc konwersja nigdy się nie udaje i punkty w innej jednostce są pomijane („pominięto N”).
- `vi` liczy pasmo normy dzisiejszym `LabUnitConverter.evaluate` dla punktów bez oceny (wiek z kotwicy wizyty, płeć z ostatniej migawki); AMH jest wyłączone bramką (test `lab-amh-history-no-reassessment.test.mjs`); `mi` daje strzałki z `lab.norm` (tekst), a bez niego z tej dzisiejszej oceny.
- Po `vilda:sync-merged` karta przebudowuje cały DOM, jeśli zmienił się odcisk danych; stan UI musi żyć w `sessionStorage`.
- Testy wycinają fragmenty zminifikowanego pliku po kotwicach (`function Dl(` … `function gi(`, `Jl` … `Xl`): `tests/unit/lab-assessment-history.test.mjs`, `lab-amh-history-no-reassessment.test.mjs`, `lab-snapshot-ui.test.mjs`; E2E `tests/e2e/lab-snapshot.spec.mjs` oczekuje w „Historii” tekstów „<LOD” i „Fikcyjny starszy wynik”.

### 2.4 Przelicznik

- Jedna karta `#labResultsCard` z krokami 1–5, sekcją wyniku (`#labResultStatus`, `#labResultBig`, `#labRangeBlock` z jednym markerem, `#labResultSourceLine`, konwersje, źródła), sekcją `#labHormoneLifespan` (wykres hormonów w ciągu życia z jednym punktem pacjenta), przyciskiem „Wyczyść”.
- `VildaVault` nie jest ładowany tagiem na tej stronie; dociąga go leniwie `vilda_session_bridge.js` (`ensureAuthLoaded`) po wykryciu klucza sesji; `listPatientLabSeries` rzuca wyjątek przy zamkniętym sejfie. Strona reaguje na `vilda:auth-loaded`, `vilda:patient-loaded`, `vilda:session-changed`.
- Nie ma preselekcji analitu z adresu; istnieje tylko `?wskazanie=` i zdarzenie `vilda:shell-navigate-target`. Z karty pacjenta nie da się dziś otworzyć przelicznika „na badaniu X” ani karty „na zakładce Y” z innej ramki (`focusNoteId` w `showPatientCard` jest martwym parametrem).
- Komponenty osi są jednopunktowe (`.lab-range-marker` z `--marker-pct`, `.vilda-lab-axis` z jednym markerem); dla LH/FSH/inhibiny B `#labRangeBlock` przejmuje w całości moduł pokwitania.

### 2.5 Reguły, które wiążą projekt

| Reguła | Źródło |
|---|---|
| W przeliczniku nie wracają pola „Wcześniejsze badanie”, „Wynik z innej daty”, dodatkowa data pobrania; żadnych nowych formularzy | `LAB_INTERPRETATION_AGENT_GUIDE.md` § 4 |
| Odczyt odtwarza utrwaloną ocenę bez ponownego liczenia dzisiejszymi normami lub danymi wczytanego pacjenta | tamże § 7, testy `lab-assessment-history`, `lab-amh-history-no-reassessment` |
| Nie rysować punktu dla `<LOD`, `<LOQ`, wyniku z operatorem; nie zastępować nieznanej granicy zerem | tamże § 6 |
| Alternatywne zakresy bez wspólnego werdyktu; „w zakresie” ≠ prawidłowo | tamże § 6 |
| Punkt pacjenta na wykresie hormonów nie tworzy selektora ani historii pomiarów | `hormone-lifespan/PATIENT_POINT.md` |
| Każdy nowy próg, kategoria, kolorowanie według normy, reguła doboru normy dla punktów historycznych, nowe źródło danych = zmiana kliniczna (7 wymogów) | `AGENTS.md` § 3 |
| Normy jako dane, źródło jako argument, nazwa źródła w wyniku | `AGENTS.md` § 3, `ARCHITECTURE.md` „Kierunek: wielopopulacyjność” |
| Karta liczy własne dane; stan UI nie jest danymi pacjenta | `AGENTS.md` § 5, inwarianty 3–4 |
| Nowy plik: `?v=` na stronach, precache, `SW_VERSION`, fixture; `npm run podbij-wersje` na końcu; łatka w pliku zminifikowanym → wpis w `ZRODLA_ARTEFAKTOW.md` | `AGENTS.md` § 6, § 9; `GITHUB_WORKFLOW.md` |
| Cele dotykowe ≥44 px, status zawsze z tekstem lub glifem, brak poziomego przewijania na 320 px | design system, guideline 30; `AGENTS.md` § 6 |

---

## 3. Wybrany projekt

### 3.1 Model historii (nowy czytelny moduł bez DOM)

`vilda_lab_history.js` (UMD jak `vilda_lab_snapshot.js`; bez DOM, storage i zegara) z funkcją `buildHistoryView(series, options)`:

- wejście: wynik `listPatientLabSeries` plus opcje `{converter, panels, unitPreference, current}`;
- filtr kategorii: tylko notatki „wynik-badania” (decyzja 6.3 może to rozszerzyć);
- jednostka wspólna serii: jednostka ostatniego dokładnego punktu; pozostałe punkty przeliczane `converter.convert({substanceId: testKey, value, fromUnit, toUnit})` tylko wtedy, gdy `testKey` jest w `converter.list()` i symbol jednostki pasuje; punkt nieprzeliczalny zostaje w tabeli z oznaczeniem „inna jednostka”, poza wykresem;
- różnica: wyłącznie między dwoma dokładnymi wynikami w tej samej jednostce, podpisana jednostką i datą poprzedniego wyniku, nigdy kolorowana ani progowana;
- punkty cenzorowane (operator), unieważnione oceny, wpisy bez zakresu i wpisy w innej jednostce niosą jawne znaczniki (`kind`), a renderer je tylko pokazuje;
- bieżący, nieprzypięty wynik z przelicznika wchodzi jako `current = {testKey, valueNum, unit, raw, dateISO: null}` i jest punktem `kind: "preview"` poza osią czasu;
- panele jako dane: `HISTORY_PANELS = {thyroid: ["tsh","ft4","ft3"], gonadal: ["lh","fsh","estradiol","testosterone_total","amh","inhibin_b"], adrenal: [...], somatotropic: ["igf1","igfbp3"], vitamin_d: [...]}` z etykietami; skład paneli to decyzja właściciela (6.5), nie zmienia żadnego wyniku;
- tabela panelu: wiersze = daty badań, kolumny = badania, brakujące komórki `null`.

Strzałki i pigułki: `labResult.range` (etap 3) albo `labResult.assessment` → status z zapisanych danych; `lab.norm` (tekst z edytora) → jak dziś `Dl`/`mi`; brak zakresu → punkt neutralny. Pasmo „norma” z dzisiejszego `LabUnitConverter.evaluate` zostaje tylko jako orientacyjne tło, wyłączalne chipem, podpisane „orientacyjnie: dzisiejszy zakres z przelicznika” i nigdy nie barwi punktów ani nie daje strzałek (zmiana wobec dzisiejszego `mi`, który bez `norm` bierze strzałkę z dzisiejszej oceny — decyzja 6.1).

### 3.2 Karta pacjenta: zakładka „Badania”

- Piąta zakładka `data-tab="lab"` obok „Status”, „Postępy / Siatki centylowe”, „Notatki”, „Historia”; na ≤1024 px siatka 2 kolumny jak dziś, piąta zakładka na całą szerokość ostatniego wiersza (makieta, tablica telefonu). Alternatywa: trzy kolumny tylko przy pięciu zakładkach (`:has(> :nth-child(5))`).
- Układ (makieta, tablica desktopowa): nagłówek z liczbą wyników i badań, akcje „+ Dodaj wynik” (edytor notatki w kategorii „Badanie”) i „Sprawdź nowy wynik →” (przelicznik); rząd „Panel” (Wszystkie, panele z danymi) i rząd „Badanie” (chipy badań z liczbą wyników); przełącznik widoku Wykres / Tabela; chip „norma”.
- Wiersz wyniku oczekującego z Terminarza tylko jako odnośnik „Otwórz w Przypomnieniach →” (akcje zostają tam, gdzie są dziś).
- Karta badania: nazwa i jednostka, ostatnia wartość, data, różnica od poprzedniego wyniku, pigułka statusu tylko przy zapisanym zakresie lub ocenie, wykres `Nl` (ten sam komponent co dziś), stopka ze źródłem pasma i liczbą wyników poza wykresem. Pojedynczy wynik: wartość i data, w miejscu wykresu zdanie „Za mało dokładnych wyników do wykresu.” (tekst istniejący).
- Tabela panelu „data × badanie” z komentarzem i przyciskiem „Otwórz wpis” (edytor `ga`); lista „Zapisane oceny” (istniejący `Lh3TrendAssessments`) przy badaniach z ocenami.
- „Historia”: sekcja „Trend wyników” zastąpiona jednym odnośnikiem „Trend wyników badań jest teraz w zakładce Badania →”; oś czasu bez zmian. Testy E2E oczekujące tekstów trendu w „Historii” przechodzą na zakładkę „Badania”.
- Realizacja: nowy czytelny `vilda_lab_history_tab.js` (+ CSS) montowany w kontenerze zakładki; w `vilda_auth_ui.js` dwie krótkie łatki (przycisk zakładki i kontener; jednolinijkowe wystawienie `Nl`, `yi`, `vi`, `mi`, `Lh3TrendAssessments`, `In` pod `window.__vildaLabTrend` poza zakresami wycinanymi przez testy) z wpisem w `ZRODLA_ARTEFAKTOW.md`. Stan zakładki (wybrany panel, widok, chip „norma”) w `sessionStorage` z kluczem per pacjent, jak dzisiejszy chip „norma”.

### 3.3 Przelicznik: pasek „Poprzednie wyniki”

- Nowy czytelny `lab_history_strip.js` na wzór `lab_pin_result.js`: własna IIFE, własny `<style id>`, montowanie `#labHistoryStrip` za `#labResultSection`, przed `#labPinRow` (kolejność: wynik → poprzednie wyniki → przypięcie → wykres hormonów).
- Warunki pokazania: odblokowany sejf, pacjent karty, wybrane badanie z serią u tego pacjenta (co najmniej jeden wpis). W innych stanach pasek jest ukryty; w stanie „pacjent bez tego badania” też (bez komunikatu). Wpis bez logowania lub bez pacjenta nie dodaje treści do formularza.
- Zawartość: nagłówek „Poprzednie wyniki · TSH · Nazwisko”, licznik i ostatnia data, odnośnik „Otwórz Badania w karcie →”; chipy wyników w kolejności czasu (data, wartość, strzałka tylko przy zapisanym zakresie lub ocenie); po separatorze chip „bieżący · nieprzypięty · bez daty” z wartością z formularza; linia różnicy „+0,26 mIU/L względem ostatniego wyniku (data)”; przycisk „Pokaż wykres” rozwijający ten sam wykres co w karcie, z bieżącym wynikiem w osobnym pasie bez daty (nie stoi na osi czasu, bo data pobrania pada dopiero w oknie przypięcia).
- Bieżący wynik jest oceniony wyżej, w sekcji wyniku, kontekstem dzisiejszego formularza; pasek tego nie powtarza i nie ocenia historii. Historia nie zasila punktu pacjenta na wykresie hormonów w ciągu życia.
- Odświeżanie: te same zdarzenia co `lab_pin_result.js` (`vilda:session-changed`, `vilda:auth-loaded`, `vilda:patient-loaded`, zmiany `#labSubstance`); po zmianie pacjenta w innej ramce pasek przeładowuje serię nowego pacjenta (zasady `vilda_panel_pacjent.js`).
- Na telefonie: chipy w dwóch kolumnach, wykres pod nimi, przycisk przypięcia na całą szerokość jak dziś; brak poziomego przewijania.

### 3.4 Nawigacja między kartą a przelicznikiem

- „Sprawdź nowy wynik →” w karcie otwiera panel „Jednostki laboratoryjne” w powłoce; preselekcja badania wymaga nowego, małego kontraktu (parametr `?badanie=<testKey>` obsługiwany przez stronę albo wpis w `sessionStorage` czytany przy starcie). Etap 2 realizuje tylko otwarcie panelu; preselekcja to decyzja 6.6.
- „Otwórz Badania w karcie →” w przeliczniku: powłoka woła dziś `showPatientCard(id)` bez zakładki; etap 1 dodaje opcję `activeTab: "lab"` i ożywia martwy parametr `focusNoteId` (wzorzec `vilda:gh-jump`).

### 3.5 Co nie jest zmianą kliniczną, a co jest

- Nie jest: pokazanie zapisanych wartości, dat, komentarzy; tabela i wykres z zapisanych liczb; przeliczenie jednostki tym samym współczynnikiem, którym liczy przelicznik; różnica liczbowa między dwoma dokładnymi wynikami w tej samej jednostce bez koloru i progu; wyświetlenie zapisanej normy tekstowej i istniejących strzałek z niej; statusy ocen.
- Jest (wymaga § 3): zapis zakresu przy przypięciu (nowe źródło danych w rekordzie), każda strzałka lub kolor wyprowadzony z dzisiejszej normy dla dawnego wyniku, etykieta „zmiana istotna” lub próg różnicy, automatyczny dobór normy dla punktu historycznego, skład paneli jako wskazanie.

---

## 4. Krytyka i jak projekt na nią odpowiada

(Do uzupełnienia po zakończeniu panelu: uwagi krytyków reguł, wykonalności i bezpieczeństwa klinicznego, które przetrwały głosowanie refutacyjne, oraz uwagi z recenzji makiety.)

Z recenzji makiety uwzględniono już:

- strzałki i pigułki tylko przy zapisanym zakresie lub ocenie (dzisiejsze przypięcie zakresu nie zapisuje);
- bieżący wynik poza osią czasu, bez daty i bez linii łączącej;
- znacznik „<10” poza polem wartości wykresu;
- przypomnienie z Terminarza jako odnośnik, bez akcji w zakładce i bez wiersza w tabeli;
- etykiety zakładek zgodne z aplikacją („Status”, „Postępy”), siatka 2 kolumny na telefonie, cele dotykowe ≥44 px, kontrast nowego tekstu (`#5a7274`), `role="img"` na glifach, format dat osi jak `Tl()` („14.04.26”), spacje niełamliwe przed jednostką, półpauza w zakresach bez spacji;
- usunięto „Kopiuj do HIS” (poza zakresem) i dodatkową podpowiedź w kroku 1 przelicznika;
- „ocena nieaktualna” w tonie neutralnym z dopiskiem „wartość po edycji”.

---

## 5. Etapy wdrożenia

Każdy etap to osobny draft PR do `audyt`, z walidacją z AGENTS.md § 7 i `npm run podbij-wersje` na końcu. Kolejność scalania ustala właściciel; etap 0 powinien wejść przed #673 lub po nim, ale nie równolegle w tych samych liniach wersji.

### Etap 0: model historii i naprawa konwersji

- `vilda_lab_history.js` z `buildHistoryView` i `HISTORY_PANELS`; testy `tests/unit/lab-history-view.test.mjs` (czysty moduł z `lab_units_data.js` i `lab_unit_converter.js` przez `loadBrowserScript`) i `tests/unit/lab-history-vault.test.mjs` (prawdziwy sejf: `savePatient`, kilka `savePatientNote`, `listPatientLabSeries` → `buildHistoryView`).
- Naprawa sygnatury `convert` w `yi` (`vilda_auth_ui.js`) z testem strażniczym w `lab-snapshot-ui.test.mjs` (seria w dwóch jednostkach rysuje oba punkty). To zmiana funkcjonalna: punkty dotąd pomijane pojawią się na wykresie; współczynnik jest ten sam co w przeliczniku. Decyzja 6.2.
- Wpis w `ALGORITHMS.md` (sekcja LAB): „Wpływ kliniczny: brak nowych norm; konwersja tym samym współczynnikiem”.

### Etap 1: zakładka „Badania” w karcie

- `vilda_lab_history_tab.js` + `vilda_lab_history_tab.css`; łatki w `vilda_auth_ui.js` (przycisk i kontener zakładki, `activeTab: "lab"`, wystawienie `__vildaLabTrend`); „Historia” z odnośnikiem zamiast sekcji trendu; CSS piątej zakładki na ≤1024 px.
- Testy: jednostkowe na funkcjach produkcyjnych (wycinanie po kotwicach jak dziś), E2E `tests/e2e/lab-historia-zakladka.spec.mjs` (desktop i 390 px: pusty stan, jeden wynik, panel tarczycy, wynik cenzorowany, ocena nieaktualna, brak poziomego przewijania), aktualizacja `lab-snapshot.spec.mjs`.
- Wersje: `?v=` nowych plików na 7 stronach z kartą, precache, `SW_VERSION`, fixture; wpis w `ZRODLA_ARTEFAKTOW.md`.

### Etap 2: pasek w przeliczniku

- `lab_history_strip.js` (+ style w `<style id>`), tag skryptu w `przelicznik-jednostek.html` po `lab_pin_result.js`; stany: ukryty (brak sejfu, pacjenta, serii), pełny, tylko jeden wpis; wykres przez `__vildaLabTrend.render` albo własny renderer modelu z etapu 0 (decyzja techniczna: jeden renderer, bez duplikacji pasma normy).
- Testy: jednostkowy na funkcjach modułu, E2E rozszerzający `lab-snapshot.spec.mjs` (przypnij → wróć → pasek pokazuje wpis; zmiana pacjenta w innej ramce → pasek przeładowany; wynik z operatorem bez punktu).
- Kolizja z #673 w `przelicznik-jednostek.html` i wersjach: scalanie według `GITHUB_WORKFLOW.md`.

### Etap 3: zakres przy przypięciu i scalanie serii

- `lab_pin_result.js` zapisuje `labResult.range = {lower, upper, unit, source, dataVersion, population}` z wyniku `LabUnitConverter.evaluate` widocznego w chwili przypięcia; `sanitizeLabResult` w sejfie przyjmuje i czyści to pole; historia pokazuje strzałki z `range`.
- Edytor notatki w karcie zapisuje `testKey` dla badania wybranego z listy (serie ręczne i przypięte łączą się po kluczu, nie po nazwie).
- Zmiana kliniczna wg § 3: źródło i wersja danych zakresów (`lab_units_data.js`), opis populacji i jednostek, wpis w `ALGORITHMS.md`, przypadek syntetyczny „wejście → oczekiwany wynik”, test na prawdziwym `savePatientNote` i `listPatientLabSeries`, opis wpływu w PR, akceptacja właściciela.

---

## 6. Decyzje właściciela

| # | Pytanie | Rekomendacja | Uzasadnienie |
|---|---|---|---|
| 6.1 | Czy wpis bez zapisanego zakresu i bez oceny może dostać strzałkę lub kolor z dzisiejszej normy (jak dziś `mi` w „Trend wyników”)? | Nie; punkt neutralny, pasmo orientacyjne i wyłączalne | LAB guide § 7; test `lab-amh-history-no-reassessment` wyraża tę zasadę dla AMH, projekt rozszerza ją na wszystkie anality |
| 6.2 | Naprawić konwersję jednostek w `yi` w etapie 0, czy osobnym PR? | W etapie 0, z testem strażniczym | Bez tego serie w dwóch jednostkach (np. fT4 pmol/L i ng/dL) tracą punkty; współczynnik jest ten sam co w przeliczniku |
| 6.3 | Które notatki wchodzą do historii: tylko „wynik-badania”, czy każda z `labResult` (także „wynik-klirens”)? | Tylko „wynik-badania” w zakładce „Badania”; klirens ma własny model wizyt | `KLIRENS_MODEL_WIZYT.md`; uniknięcie mieszania eGFR z hormonami |
| 6.4 | Zapis zakresu referencyjnego przy przypięciu (etap 3)? | Tak, od wdrożenia; bez backfillu starych wpisów | Jedyny uczciwy sposób pokazania „poniżej zakresu w dniu badania”; zmiana kliniczna § 3 |
| 6.5 | Skład paneli (tarczyca, oś gonadalna, nadnercza, oś somatotropowa, witamina D) i ich nazwy | Jak w makiecie; panele jako dane w module | Nie zmienia wyników; łatwe do edycji |
| 6.6 | Preselekcja badania przy przejściu z karty do przelicznika i otwarcie karty od razu na zakładce „Badania” z przelicznika | Tak, w etapach 1–2 przez mały kontrakt (parametr strony + opcja `activeTab`) | Dwa kliknięcia mniej w scenariuszu wizyty; wymaga zmian w `vilda_shell.js` / stronie |
| 6.7 | Różnica liczbowa od poprzedniego wyniku: pokazywać bez koloru i progu, czy wcale? | Pokazywać, bez koloru, z jednostką i datą, tylko między dokładnymi wynikami w tej samej jednostce | Arytmetyka, nie interpretacja; każdy próg „istotności” to osobna decyzja § 3 ze źródłem |
| 6.8 | Sekcja „Trend wyników” znika z „Historii” (odnośnik) czy zostaje obok nowej zakładki? | Znika, zostaje odnośnik | Jedno miejsce prawdy; brak duplikacji wykresu |
| 6.9 | Paleta modułu lab: utrzymać fiolet (`#5856D6`, `#EEEDFE`, `#CECBF6`) z przypięcia i trendu, czy przejść na teal design systemu? | Utrzymać fiolet dla elementów historii i przypięcia, udokumentować jako literały modułu | Spójność z istniejącym `#labPinRow` i wykresem trendu |
| 6.10 | Zakładki na telefonie przy pięciu pozycjach: 2 kolumny z „Badania” na całą szerokość, czy 3 kolumny? | 2 kolumny, „Badania” na całą szerokość | Bez ucinania „Siatki centylowe”; jedna reguła CSS |
| 6.11 | Wyniki oczekujące z Terminarza w zakładce „Badania”: tylko odnośnik do Przypomnień, czy akcje na miejscu? | Tylko odnośnik w etapie 1 | Akcje istnieją w Przypomnieniach; brak API „uzupełnij wynik” |

---

## 7. Odrzucone warianty

- **Rozbudowa sekcji „Trend wyników” w „Historii” zamiast osobnej zakładki.** Oś czasu i panele wieloanalitowe konkurują o miejsce; właściciel wskazał osobną zakładkę; „Historia” zostaje osią zdarzeń.
- **Nakładanie historii na wykres hormonów w ciągu życia.** Zakazane kontraktem `PATIENT_POINT.md` („nie tworzy historii pomiarów”); krzywa jest ilustracją, nie normą.
- **Pole „data pobrania” lub „wcześniejsze badanie” w przeliczniku, by porównać bieżący wynik na osi czasu.** Zakaz z LAB guide § 4; data pada w oknie przypięcia.
- **Nowy magazyn historii (osobna kolekcja w sejfie).** Notatki „wynik-badania” już niosą wszystko; nowy magazyn to podwójny zapis, eksport, synchronizacja i konflikty.
- **Wykres kilku analitów na jednej osi Y.** Różne jednostki i rzędy wielkości; zamiast tego małe wielokrotności z osobnymi osiami i wspólną osią czasu.
- **Automatyczne strzałki z dzisiejszej normy dla starych wyników.** Przeliczanie dawnych wyników dzisiejszymi normami (LAB guide § 7).
- **Przycisk „Kopiuj do HIS” w zakładce „Badania”.** Poza zakresem prośby; schowek HIS pozostaje osobnym tematem.
