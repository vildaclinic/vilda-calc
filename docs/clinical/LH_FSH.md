# LH/FSH — dane, silnik i zapis kontekstu, PR1–PR2

Stan dokumentu: 3 października 2026. Baza PR1: `audyt` `68993e35`; baza PR2 po scaleniu #528: `ad84e67b`.

## Status i granice tej raty

PR1 dodaje czytelne dane `vilda_lab_puberty_data.js` (`VildaLabPubertyData`, wersja `2026-10-03.1`) i silnik `vilda_lab_puberty.js` (`VildaLabPuberty`, wersja `1.0.0`). **Nowe moduły nie są ładowane przez istniejące strony ani service worker.** Nie zmieniają obecnego przelicznika, jego norm, komunikatów, przypiętych wyników ani danych pacjentów. Nie zastępują jeszcze `lab_units_data.js` i `lab_unit_converter.js`.

Silnik jest deterministyczny: nie czyta DOM, magazynów, zegara ani sieci i niczego nie zapisuje. Zestaw danych trzeba przekazać jawnie:

```js
const wynik = VildaLabPuberty.evaluate(wejscie, VildaLabPubertyData);
```

Publiczne funkcje: `evaluate`, `parseMeasurement`, `resolveAge`, `compareMeasurement`, `assessTiming`. W przeglądarce API jest globalne; w Node dostępne przez `module.exports`. Normy i kryteria kliniczne są danymi przekazanymi do silnika, a nie domyślnymi liczbami zaszytymi w kodzie.

Kwalifikację populacji laboratoryjnej określa odrębna `biochemicalPolicy` (`pediatric-basal-eligibility`, wersja `2026-10-03.1`), m.in. kontekst niemowlęcy i wcześniactwo. Nie zależy od obecności `clinicalProfile`: jego brak ogranicza ocenę kliniczną, ale nie omija ograniczeń zakresów referencyjnych u wcześniaków. Brak polityki biochemicznej w przekazanych danych blokuje automatyczny RI, zachowując konwersję jednostek.

Przykład syntetyczny wywołania, bez identyfikatora pacjenta:

```js
const wynik = VildaLabPuberty.evaluate({
  analyte: 'lh', value: '2', unit: 'IU/L', sex: 'M',
  birthDateISO: '2020-10-03', sampleDateISO: '2026-10-03',
  specimen: 'serum', measurementKind: 'basal',
  assay: {
    profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia',
    confirmation: 'reported' // musi odpowiadać metodzie rzeczywistej próbki
  },
  puberty: { kind: 'G', stage: 4, assessedAtISO: '2026-10-03' },
  treatment: { gnrha: 'no', sexSteroids: 'no' }
}, VildaLabPubertyData);
// biochemical.byAge.status === 'above'
// biochemical.byStage.status === 'within'
// clinical.code === 'early_development'
// summary.status === 'attention'
```

Właściciel autoryzował realizację etapowego planu, obejmującego kolejne prace nad zapisem i UI. Akceptacja planu i makiety **nie jest walidacją kliniczną** ani potwierdzeniem przenoszalności norm na polskie laboratoria. Scalenie, publikacja i uruchomienie produkcyjne wymagają osobnego polecenia właściciela zgodnie z `AGENTS.md`; status nieaktywny w UI dotyczy zakresu PR1, nie zakazu kodowania następnych etapów. Rejestr nadrzędny: [ALGORITHMS.md](ALGORITHMS.md).

## Dwie oceny i wspólne podsumowanie

1. **Biochemia:** porównanie stężenia ze wskazanym zakresem właściwym dla próbki, metody, płci, wieku i ewentualnie stadium. Zakresy wieku i stadium pozostają odrębne; nie tworzy się ich przecięcia, sumy ani własnej obwiedni.
2. **Rozwój:** czas i charakter cech dojrzewania wobec wieku metrykalnego oraz wywiadu. Ta ocena jest niezależna od stężenia LH/FSH i metody jego oznaczenia.

Podsumowanie nie ma uniwersalnej kategorii „pacjent prawidłowy”. LH w zakresie dla G4 nie usuwa ostrzeżenia o G4 u sześciolatka. Prawidłowe FSH nie staje się z tego powodu „wysokie”. Niskie lub niewykrywalne LH nie wyklucza CPP. Silnik nie ustala centralnej/obwodowej etiologii, nie różnicuje KOWD/CDGP od CHH z jednej liczby i nie dobiera automatycznie MRI, leczenia ani protokołu stymulacyjnego [K1–K4].

## Wejście i czas badania

| Obszar | Kontrakt i ograniczenie |
|---|---|
| Analit i wynik | `lh` lub `fsh`; liczba, tekst albo obiekt `{operator, value}`. Operator `=`, `<`, `≤`, `>`, `≥` należy do wyniku. `<LOD`/`<LOQ` bez wartości nie otrzymują wymyślonego progu. Ujemna wartość lub nieznana jednostka są nieprawidłowym wejściem. |
| Jednostki | Kanoniczna `IU/L`; `mIU/mL` jest liczbowo równoważne. Równość jednostek nie dowodzi zgodności analizatorów. Klasyfikacja używa wartości niezaokrąglonych. |
| Wiek | `birthDateISO` i `sampleDateISO`, czyli rzeczywiste daty bez godziny, albo jawne `age` z częściami i precyzją. To wiek **w dniu pobrania**, nie aktualny wiek pacjenta ani wiek kostny. Kotwica wizyty w przyszłym zapisie jest osobną informacją. |
| Precyzja | Poprawne daty dają dokładny wiek; rachunek dat jest UTC i kalendarzowy. Rocznica 29 lutego w roku nieprzestępnym przypada na ostatni dzień lutego — jawna konwencja implementacyjna. Wpisane pełne lata/miesiące bez dokładnych dat opisują przedział wieku, nie pozornie dokładny punkt. Precyzja dzienna nie może powstać przez dopisanie brakujących danych. Nieprawidłowa data nie jest po cichu zastępowana ręcznym wiekiem. |
| Kontekst próbki | `sex`, `specimen`, `measurementKind`, metoda i potwierdzenie jej pochodzenia. W pierwszej wersji automatyczna ocena katalogowa dotyczy zgodnej metody, surowicy, oznaczenia bazalnego i znanego kontekstu bez GnRHa/steroidów płciowych. Nieznany kontekst pozostaje nieznany. |
| Obserwacja kliniczna | Stadium i/lub objętość jąder z typem, źródłem, datą i potwierdzeniem związku z próbką. Badanie wykonane później nie zastępuje badania z dnia dawnego oznaczenia. |
| Wywiad | Początek z typem zdarzenia i wiekiem/datą; progresja, przyspieszenie wzrastania, objawy OUN, regresja oraz leczenie, o ile są znane. Brak odpowiedzi nie oznacza „nie”. U niemowląt osobno wcześniactwo i wiek ciążowy. |

`parseMeasurement` zachowuje surowy zapis oraz jednostkę źródłową. Przy `<x`/`>x` liczba jest granicą raportowanego wyniku; `isExact` jest fałszywe, a `plotValue` puste. Wyniku nie wolno później rysować jako dokładnego punktu `x`. Porównanie całego zbioru możliwych wartości z granicami może dać `within`, `above`, `below` albo `indeterminate`; brak zgodnego zakresu daje `unavailable`. Brak interpretacji nie blokuje prawidłowej konwersji jednostek.

## Nomenklatura i kryteria rozwoju

Zaakceptowane oznaczenia UI: **Th/M** — rozwój piersi, **G** — rozwój narządów płciowych, **P** — owłosienie łonowe, **Ax** — owłosienie pachowe; skrót obserwacji, np. **Th3**, **G4**. Silnik normalizuje `Th/M/B` do `Th` i `P/PH` do `P`. To nazwy części badania, nie zamienne określenia jednego stadium.

P/Ax wskazują odrębną ocenę owłosienia; nie dowodzą gonadarche. Ax jest oceną dodatkową poza klasyczną skalą Tannera; ten moduł nie ustanawia skali Ax1–Ax5. Dawny sam numer „Tanner 3” bez typu pozostaje nieokreślony. Nie jest przepisywany na Th3/G3 na podstawie płci. Kryterium profilu to objętość jąder **≥4 mL** w badaniu orchidometrem Pradera; służy do oceny obecności początku, ale nie wyznacza całego stadium G i nie jest automatycznie przenoszone na każdą metodę USG [K2,K3,K5].

| Kryterium profilu klinicznego | Znaczenie |
|---|---|
| Potwierdzone Th≥2 przed 8. urodzinami | Wczesny rozwój piersi; izolowane początkowe Th2 ma komunikat o ocenie przebiegu, nie automatyczne CPP. Th3+, progresja lub inne niepokojące dane wymagają odrębnego ostrzeżenia. |
| Potwierdzone G≥2 / jądra ≥4 mL przed 9. urodzinami | Nieprawidłowy dla wieku początek rozwoju wymagający oceny; bez ustalenia etiologii. |
| Th1 od 13 lat / G1 lub brak powiększenia jąder od 14 lat | Ocena nieobecnego początku, z uwzględnieniem znanego wcześniejszego początku, regresji i leczenia. Sam brak danych o stadium nie jest stadium I. |
| Znany wczesny lub późny początek | Pozostaje częścią oceny mimo starszego obecnego wieku/stadium. Nie rekonstruować wieku początku z aktualnego stadium. |

Granice wczesnych cech to `<8/<9`; granice oceny nieobecnego początku to `≥13/≥14`. Dokładny początek w wieku 13/14 lat nie jest tym samym co brak początku w tej chwili. Przedział nieprecyzyjnego wieku przecinający granicę nie daje pewnego alarmu ani pewnego wykluczenia. Wytyczne Endocrine Society 2026 warunkowo dopuszczają obserwację niektórych dziewczynek z izolowanym Th2; nie są podstawą bezwarunkowej decyzji aplikacji o obserwacji, badań lub MRI [K1].

Opis katalogowy LHPED „delayed by age 12” u dziewcząt **nie jest** kryterium tego profilu. Kryteria kliniczne 13/14 pochodzą z odpowiednich źródeł klinicznych [K2–K4]; nie przenosi się ich razem z laboratoryjnym RI.

## Profile referencyjne Mayo w PR1

Poniższe wartości są w IU/L. Są to zakresy konkretnych oznaczeń Mayo, nie uniwersalne normy LH/FSH. Katalog nie podaje tu kompletnej charakterystyki kohort pozwalającej ogłosić walidację dla wszystkich populacji. Metoda próbki jest oddzielna od metody profilu: wybranie profilu nie potwierdza wykonania badania tą metodą.

### `mayo-lh-pediatric` — LHPED 62999

**AnshLite LH CLIA**, trzystopniowe oznaczenie sandwich, czułość analityczna 0,02 IU/L; metoda Mayo. Surowica [R1].

| Wiek katalogowy | M | F |
|---|---:|---:|
| <1 rok | <0,02–5,0 | <0,02–18,3 |
| 1–8 lat | <0,02–0,5 | <0,02–0,3 |
| 9–10 lat | <0,02–3,6 | <0,02–4,8 |
| 11–13 lat | 0,1–5,7 | <0,02–11,7 |
| 14–17 lat | 0,8–8,7 | <0,02–16,7 |

| Stadium katalogowe | M | F |
|---|---:|---:|
| I | <0,02–0,5 | <0,02–0,3 |
| II | 0,03–3,7 | <0,02–4,1 |
| III | 0,09–4,2 | 0,6–7,2 |
| IV–V | 1,3–9,8 | 0,9–13,3 |

Dolny zapis `<0,02` jest cenzorowany (`censoredLower`), a nie twardym minimum fizjologicznym 0,02. Nie generuje automatycznego „poniżej normy” dla wyniku `<0,02`. Grupa IV–V zachowuje wspólne liczby, bez interpolowania stadium.

Przedziały LH w pełnych latach mają jawną politykę `attained-year-band`: 1–8 → `[1,9)`, 9–10 → `[9,11)`, 11–13 → `[11,14)`, 14–17 → `[14,18)`. To zapis operacyjny ukończonych lat, nie dodatkowa dokładność oryginalnej publikacji. Niepewność wieku, która przecina granicę wierszy, nie jest usuwana zaokrągleniem ani przejściem do innej normy. Katalogowy kwalifikator stadium I „1–8 lat” także pozostaje `[1,9)`; tego wiersza nie rozszerza się na starsze dzieci. Zakres profilu LHPED kończy się przed 18. urodzinami.

### `mayo-fsh-pediatric` — FSH 602753

**Roche Elecsys FSH ECLIA**, oznaczenie sandwich; surowica. Katalog cytuje package insert 09/2021 [R2].

| Wiek katalogowy | M | F |
|---|---:|---:|
| <12 miesięcy | ≤3,3 | 1,2–12,5 |
| 12 miesięcy–5 lat | ≤1,9 | 0,5–6,0 w grupie 12 miesięcy–10 lat |
| >5–10 lat | ≤2,3 | 0,5–6,0 w grupie 12 miesięcy–10 lat |
| >10–15 lat | 0,6–6,9 | 0,9–8,9 |
| >15–18 lat | 0,7–9,6 | 0,7–9,6 |

| Stadium | M | F |
|---|---:|---:|
| I | <1,5 | 0,6–4,1 |
| II | <3,0 | 0,3–5,8 |
| III | 0,4–6,2 | 0,1–7,2 |
| IV | 0,6–5,1 | 0,3–7,0 |
| V | 0,8–7,2 | 0,4–8,6 |

Granice wieku FSH zachowują dosłowne relacje katalogu, np. `>5–≤10`, bez zamiany na przedziały ukończonych lat LH. Profil obejmuje dokładnie 18 lat, inaczej niż LHPED. `<1,5` i `<3,0` są jednostronnymi górnymi granicami stadium M, bez dopisywania arbitralnego dolnego RI. `<` i `≤` pozostają różnymi operatorami. Zakresy płciowe nie są zastępowane wspólną tabelą, a stadium V nie uruchamia automatycznie norm faz cyklu dorosłych.

W obu profilach `stageAgeMinYears:1` oznacza politykę wyboru wyłącznie zakresu wieku u niemowląt, a nie biologiczny koniec minipuberty. Nie stosuje się starszego zakresu stadium jako zastępstwa dla brakującej referencji niemowlęcej.

**Poza tą ratą:** standardowy LH Mayo 602752 jest odrębnym oznaczeniem Roche ECLIA [R3], z innymi zakresami i brakiem ustanowionego RI dla ≤4 tygodni. Jego zakresy ani dorosłe fazy LH/FSH nie są zamiennikiem LHPED i nie są aktywowane w PR1. W szczególności nie wolno używać domyślnego `life_stage='adult'` przy brakującym wieku. Lokalny zakres może mieć pierwszeństwo jedynie po podaniu jawnego źródła, wersji, metody, populacji, granic i potwierdzonej przydatności dla tej próbki; nie powstaje przez zgadywanie.

## Minipuberty

To osobny kontekst fizjologiczny, nie diagnoza z wysokiego LH/FSH i nie automatyczne wyłączenie ostrzeżeń. Zaawansowane/postępujące cechy Th/G nadal wymagają oceny. Izolowane Th2 w niemowlęctwie ma odrębny komunikat kontekstowy. Szeroki katalogowy przedział `<1 rok` może być użyty wyłącznie z właściwą metodą i jawnym opisem rozdzielczości; nie zastępuje krzywej kolejnych dni/miesięcy [M1].

**Johannsen 2018 pozostaje kandydatem zablokowanym do automatycznej interpretacji.** Wiek źródłowy 2–5 miesięcy, dokładne zaliczenie 2,0/3,5/5,0 miesięcy, LOD i przeniesienie na lokalny assay nie są dopowiadane. Poniższe przedziały odczytano wtórnie z tabeli 1 Rohayem 2024; metoda AutoDELFIA/PerkinElmer i statystyka P2,5–P97,5 po transformacji logarytmicznej są opisane w tabeli 2 Olthof 2026 [M1,M2,M4]. Nie są aktywną alternatywą Mayo.

| Płeć i wiek raportowany | LH, P2,5–P97,5 IU/L (n) | FSH, P2,5–P97,5 IU/L (n) |
|---|---:|---:|
| M, 2,0–3,5 mies. | 0,62–4,08 (581) | 0,41–3,02 (578) |
| M, 3,5–5,0 mies. | 0,54–3,32 (166) | 0,42–2,68 (165) |
| F, 2,0–3,5 mies. | <LOD–0,98 (432) | 1,23–17,4 (435) |
| F, 3,5–5,0 mies. | <LOD–1,25 (110) | 1,30–17,7 (111) |

Nie rozszerzać tych danych na 0–2/5–12 miesięcy, nie interpolować między analizatorami ani nie stosować ich do moczu lub wcześniaków. Przy wcześniactwie potrzebna jest właściwa źródłowa oś wieku, a nie samodzielna zamiana wieku chronologicznego na skorygowany. Definicja WHO w profilu danych to urodzenie przed ukończeniem 37 tygodni (`<37`), nie `≤37` [K6]. Definicja ta nie jest normą gonadotropin ani zgodą na automatyczne przeliczanie wieku próbki.

Poprawne cytowanie **Andersson 1998** to PMID 9467591, DOI 10.1210/jcem.83.2.4603, JCEM 83(2):675–681 [M3]. Odczytano abstrakt; pełny oryginał był niedostępny. Tabela 1 Rohayem podaje zakresy **obserwowane**, nie centralne 95% RI: np. LH M w 3 mies. 0,90–2,64 i 6 mies. 0,16–1,07; FSH F odpowiednio 0,48–24,0 i 1,68–8,71 IU/L. Badanie 15 dzieci każdej płci, ocenianych co 3 miesiące, nie uzasadnia dawnych wspólnych przedziałów LH M 1–6 ani FSH F 1–8 w całym 1.–6. miesiącu. Błędny PMID 9814500 nie jest źródłem tego badania.

## Wynik, wersje i przyszły zapis

`evaluate` zwraca `schemaVersion:1`, wersje silnika/danych, kopię znormalizowanego wejścia, `measurement`, `ageAtSample`, osobne `biochemical` i `clinical`, `summary`, `provenance` i `limitations`. Porównania zawierają pełny wybrany zakres z metadanymi, nie tylko ID. `unavailable`, `indeterminate`, brak oceny i brak alarmu czasu nie są kategorią „normalny pacjent”. Próbka po stymulacji, leczenie lub nieznana metoda nie kasują niezależnych informacji klinicznych.

`biochemical.byAge`, `byStage` i `local` są obiektami porównania `{status, reasonCodes, range}`; `range` jest puste przy braku zakresu. Wybrany zakres zawiera `bounds` z operatorami oraz kopię źródła, populacji i metody. `primary` wskazuje `local`, `stage`, `age` lub `null`; nie usuwa pozostałych ocen. `summary.status` ma wartości `attention`, `limited`, `compared`, `invalid`, `out_of_scope`. Ostrzeżenie kliniczne może pozostać widoczne przy nieprawidłowo wpisanej liczbie; `measurement.status` i niedostępność biochemii nadal jawnie wskazują błąd liczby.

Opcjonalny `localReference` ma pola `id`, `version`, `analyte`, `material`, `unit`, `methodId`, `source:{id,label,version,url}`, `population:{label}`, `applicabilityConfirmed` i `range:{lower,upper,censoredLower,sourceText}`. Każda granica to `{operator,value}` lub `null`. Potwierdzenie przydatności dotyczy konkretnej próbki; sama nazwa laboratorium nie wystarcza. Źródła zewnętrzne w wyjściu są tekstem do bezpiecznego wyświetlenia, nigdy poleceniem ani HTML do wykonania.

Lokalny zakres nie rozszerza pediatrycznego zakresu wieku modułu. Wymaga ustanowionego `clinicalProfile.scopeAgeYears` i zgodnego wieku; katalog może korzystać z własnego zakresu wieku przy niedostępnych regułach klinicznych. Gdy ważny lokalny zakres jest podstawą oceny, rozstrzyga biochemiczną część podsumowania. Różnica względem pomocniczego zakresu katalogowego pozostaje w obu porównaniach i kodzie `source_reference_disagreement`; nie nadaje lokalnie prawidłowemu wynikowi etykiety „poza wskazanym zakresem”. Niezależne ostrzeżenie kliniczne ma nadal pierwszeństwo.

W PR2 opcjonalny snapshot oceny przechodzi przez przypięcie, whitelist sejfu, import, serie, kartę i edytory. Zachowuje surowy wynik/operator/jednostkę, kontekst dnia pobrania, źródło/metodę/populację, granice z operatorami i zapisane oceny. Nie może zależeć od późniejszych zmian wejścia ani danych referencyjnych. Nie zawiera HTML, referencji DOM, `patientId` ani dat wymyślonych przez silnik. Sam komentarz zachowuje snapshot; zmiana wyniku, daty, kontekstu lub profilu wymaga przeliczenia albo jawnego unieważnienia.

PR3 uruchomi wspólnie UI, producenta snapshotu, treści ostrzeżeń i odczyt ocen. **Bez backfill:** dawne wyniki bez snapshotu nie otrzymują domniemanego Th/G, metody ani dzisiejszego kontekstu. Jawnej niedostępnej oceny nie zastępuje stary trendowy `evaluate` z samą płcią i wiekiem.

## PR2 — transport historycznej oceny

PR2 dodaje czytelny moduł `vilda_lab_snapshot.js` (`VildaLabSnapshot`, wersja `1.0.0`) ładowany przed sejfem, także przez oba mechanizmy ładowania na żądanie. Silnik i dane PR1 nadal **nie są ładowane** przez aplikację ani precache. Przelicznik nie produkuje jeszcze nowych ocen; ich tworzenie i prezentację włącza dopiero PR3.

Opcjonalne pole `labResult.assessment` ma kontrakt:

```js
{
  schemaVersion: 1,
  status: 'recorded', // albo 'invalidated' / 'unavailable'
  reasonCodes: [],
  evaluation: { /* kopia kompletnego wyniku evaluate z PR1 */ },
  binding: { /* pola wyniku i clinicalDateISO, ustalane przy zapisie */ }
}
```

`create(evaluation, binding?)` przygotowuje kopię, `normalize(assessment)` weryfikuje ją bez ponownej oceny klinicznej, `reconcile(previousLab, nextLab, previousDateISO, nextDateISO)` obsługuje edycję, a `forSeries(lab, dateISO)` przygotowuje odczyt serii. Wszystkie funkcje działają bez DOM, zegara, magazynów i dostępu do aktualnego pacjenta lub norm. Każdy poziom obiektu ma listę dozwolonych pól; kopia nie przenosi identyfikatorów pacjenta, HTML, obiektów DOM ani dowolnych rozszerzeń. Nieznana lub uszkodzona wersja pozostawia jawny status `unavailable`, zamiast zmieniać wpis w starszy wynik bez oceny.

Ocena przechodzi przez szyfrowany zapis notatki przypiętej do wizyty, odczyt notatek, eksport/import synchronizacji, historię pacjenta i serie laboratoryjne. `linkedAgeMonths` jest kotwicą wizyty; nie zastępuje `evaluation.ageAtSample` ani daty pobrania. Późniejsza zmiana wieku, stadium, leczenia lub norm w aktualnym formularzu nie zmienia zapisanej oceny.

Edytory karty i terminarza zachowują pierwotny wynik, gdy zmienia się tylko komentarz. Zmiana pól wyniku, jednostki, normy albo daty badania unieważnia ocenę; ponowne zapisanie starego obiektu nie przywraca jej ważności. Nowa ocena musi odpowiadać zapisywanemu wynikowi i dacie. Status unieważnienia pozostawia historyczną ocenę do odczytu, lecz nie pozwala użyć jej jako aktualnej interpretacji.

Przypinanie udostępnia nieaktywny domyślnie punkt integracji `VildaLabPinResult.setAssessmentProvider(fn|null)`. Producent PR3 zwróci ocenę przy otwarciu dialogu; dialog przechowuje jej kopię, a sejf weryfikuje zgodność przy zapisie. Brak producenta zachowuje dotychczasowe przypinanie. Dla jawnego snapshotu `labResult.value` zawiera surowy wynik (np. `<0,02`), a jednostka jest osobnym polem; tekst konwersji pozostaje w treści notatki. Starsze przypięcie zachowuje dotychczasowy złożony tekst wyniku. Dialog przyjmuje znaną datę próbki jako datę badania; późniejsza zmiana tej daty unieważnia przechwyconą ocenę, również gdy podano sam wiek bez daty próbki. Kod tej partii nie rejestruje producenta.

**Zgodność starszych danych:** brak pola `assessment` pozostaje brakiem pola, bez masowej migracji i bez dopisywania Th/G, metody, leczenia lub daty. Stare serie zachowują dotychczasową ścieżkę. Wpis z jawną oceną nie wywołuje starego `LabUnitConverter.evaluate` z aktualną płcią i wiekiem. Wynik cenzorowany (`<x`, `<LOD`, `>x`) zachowuje operator i surowy zapis; nie staje się dokładnym punktem trendu na granicy oznaczenia. Prezentacja nowych ocen, ostrzeżeń i cenzorowanych wyników należy do PR3.

Wpływ kliniczny PR2: brak zmian liczb, progów i interpretacji dotychczasowego UI. Dodane zachowanie chroni kontekst nowych zapisów przed utratą lub nieuprawnioną reinterpretacją. Nie jest walidacją medyczną silnika PR1. Wycofanie konsumenta wymaga zachowania dodatkowego pola w kopiach danych; starsza wersja aplikacji może je odrzucić w swojej kopii danych, dlatego nie jest zgodnym edytorem nowych ocen. Bieżący sejf przy scalaniu zachowuje posiadaną ocenę, jeśli starszy klient pominął pole przy zmianie komentarza; zmiana wyniku lub daty przez starszego klienta ją unieważnia. Bez załadowanego modułu transportu odczyt pozostaje jawnie niedostępny, a zapis istniejącej oceny jest blokowany, aby nie utrwalić utraty kontekstu.

Testy PR2: `tests/unit/lab-snapshot.test.mjs` (model), `lab-snapshot-vault.test.mjs` (rzeczywisty sejf, szyfrowanie, import i synchronizacja), `lab-snapshot-ui.test.mjs` (produkcyjne funkcje przypięcia i trendów) oraz `tests/e2e/lab-snapshot.spec.mjs` (przypięcie, przeładowanie, edytory i historia w Chromium).

## Syntetyczne przypadki akceptacyjne

To wymagania dla testów rzeczywistych funkcji produkcyjnych, nie deklaracja wykonania ani walidacji klinicznej. Przypadki liczbowe zakładają właściwy profil/metodę, surowicę, oznaczenie bazalne i potwierdzony kontekst bez leczenia; wiek i obserwacja odnoszą się do tej samej próbki, chyba że podano inaczej.

| Wejście | Wymagana własność wyniku |
|---|---|
| M6 lat, G4, LH2 | `within` względem stadium 1,3–9,8; `above` względem wieku z górną granicą 0,5; ostrzeżenie kliniczne zachowane. |
| M6 lat, G4, FSH2 | W zakresie stadium 0,6–5,1 i wieku ≤2,3; ostrzeżenie rozwoju, bez fałszywego „FSH wysokie”. |
| F4 lata, Th3 | Ostrzeżenie o rozwiniętych cechach przed granicą wieku, bez rozpoznania centralnej etiologii. |
| F7,5 lat, izolowane Th2, progresja nieznana | Informacja o wczesnym rozwoju piersi i ograniczeniu oceny przebiegu; bez automatycznej decyzji CPP/MRI/obserwacja. |
| F7 lat, Th3, LH<LOD | Brak wymyślonej liczby/punktu trendu; niskie LH nie kasuje ostrzeżenia klinicznego. |
| F8,0 / M9,0, początek teraz | Nie spełnia `<8/<9`; brak ogólnego zapewnienia prawidłowości. |
| F13 Th1 / M14 G1, brak wcześniejszego początku, regresji i leczenia | Ocena nieobecnego początku na dokładnej granicy. |
| F10 lat, znany początek Th w wieku 7 lat | Zachowana historia wczesnego początku mimo obecnego wieku. |
| P3 lub Ax bez Th/G; legacy „Tanner 3” | Bez automatycznego podstawienia gonadalnego stadium i bez domyślnego stadium I. |
| M3 mies., LH2, zgodne LHPED | Porównanie do szerokiego `<1 rok`, jawny kontekst minipuberty; nie uniwersalny próg LH0,3. |
| F3 mies., FSH12, kandydat Johannsen | Kandydat pozostaje zablokowany; nieaktywny przedział 1,23–17,4 nie staje się automatyczną normą. |
| FSH M stadium I, wynik dokładnie 1,5 | Nie spełnia górnego ograniczenia `<1,5`; operator nie jest zamieniany na `≤`. |
| Nieprecyzyjny wiek przecina granicę RI lub kryterium klinicznego | Jawna niejednoznaczność; bez zaokrąglenia do wygodnego wiersza. |
| Późniejsza ocena G4 przy dawnym pobraniu | Brak automatycznego zastosowania przyszłej obserwacji. |
| Brak wieku/metody, stymulacja, GnRHa, próbka moczu lub wcześniactwo bez odpowiedniego profilu | Jawne ograniczenie lub brak dopasowanej oceny; brak zastępczej normy dorosłych. |
| Mutacja wejścia/danych po obliczeniu; zapis/odczyt przyszłego snapshotu | Zachowana historyczna ocena i operatory; bez ponownej oceny według bieżącego pacjenta. |

## Źródła i rzeczywisty zakres odczytu

Katalogi odczytano 2–3.10.2026. Rozdzielono odczyt oryginału, abstraktu i wtórnej tabeli; status dostępu nie jest oceną jakości badania.

- **R1:** Mayo Clinic Laboratories, [LHPED 62999](https://www.mayocliniclabs.com/test-catalog/Overview/62999). Odczytano pełny aktualny katalog, `Reference Values`, `Method Name/Description`, `Clinical Information`, `Cautions` i przykładowy raport. Źródło liczb i metody LH pediatrycznego.
- **R2:** Mayo Clinic Laboratories, [FSH 602753](https://www.mayocliniclabs.com/test-catalog/Overview/602753). Pełny katalog i przykładowy raport; `Reference Values`, metoda Roche Elecsys ECLIA, przywołany package insert 09/2021. Nie deklarujemy niezależnego odczytu pełnego insertu.
- **R3:** Mayo Clinic Laboratories, [LH 602752](https://www.mayocliniclabs.com/test-catalog/Overview/602752). Pełny katalog i przykładowy raport; odrębne standardowe Roche LH. Źródło audytu różnic, nie aktywny zamiennik R1.
- **K1:** Latronico AC i wsp. *Central precocious puberty: an Endocrine Society clinical practice guideline.* JCEM 2026. [PMID 42287186](https://pubmed.ncbi.nlm.nih.gov/42287186/), [DOI 10.1210/clinem/dgag168](https://doi.org/10.1210/clinem/dgag168). Odczytany abstrakt oraz [oficjalne rekomendacje z uwagami technicznymi](https://www.endocrine.org/clinical-practice-guidelines/central-precocious-puberty); pełny artykuł wydawcy niedostępny. Nie utożsamiano strony rekomendacji z pełnym odczytem uzasadnienia GRADE.
- **K2:** Persani L i wsp. *ENDO-ERN expert opinion on the differential diagnosis of pubertal delay.* Endocrine 2021. [PMID 33512657](https://pubmed.ncbi.nlm.nih.gov/33512657/), DOI 10.1007/s12020-021-02626-z, [pełny tekst PMC8016789](https://pmc.ncbi.nlm.nih.gov/articles/PMC8016789/). Odczytano definicje i różnicowanie.
- **K3:** Howard SR. *Interpretation of reproductive hormones before, during and after the pubertal transition—Identifying health and disordered puberty.* Clin Endocrinol 2021;95:702–715. [PMID 34368982](https://pubmed.ncbi.nlm.nih.gov/34368982/), DOI 10.1111/cen.14578, [pełny tekst PMC9291332](https://pmc.ncbi.nlm.nih.gov/articles/PMC9291332/). Odczytano fizjologię, definicje i tabele 2–4.
- **K4:** Bangalore Krishna K, Garibaldi L. *Critical appraisal of diagnostic laboratory tests in the evaluation of central precocious puberty.* Front Pediatr, online 21.01.2025, tom/DOI 2024. [PMID 39911767](https://pubmed.ncbi.nlm.nih.gov/39911767/), DOI 10.3389/fped.2024.1504874, [pełny tekst PMC11795171](https://pmc.ncbi.nlm.nih.gov/articles/PMC11795171/). Odczytano części merytoryczne, tabelę 1 i Box 1; narracyjny przegląd, nie wspólna walidacja progów wszystkich assay.
- **K5:** Rosenfield RL. *Normal and Premature Adrenarche.* Endocr Rev 2021. [PMID 33788946](https://pubmed.ncbi.nlm.nih.gov/33788946/), DOI 10.1210/endrev/bnab009, [pełny tekst PMC8599200](https://pmc.ncbi.nlm.nih.gov/articles/PMC8599200/). Źródło odrębności adrenarche/gonadarche; nie źródło automatycznego wykluczenia CPP niskim LH.
- **K6:** World Health Organization. *Preterm birth*, fact sheet 10.05.2023, [oficjalna strona](https://www.who.int/news-room/fact-sheets/detail/preterm-birth). Odczytano `Overview`, definicję urodzenia przed 37 ukończonymi tygodniami ciąży; dostęp 3.10.2026. Źródło definicji wcześniactwa, nie tabel LH/FSH ani reguł przenoszenia norm między osiami wieku.
- **M1:** Rohayem J, Alexander EC, Heger S, Nordenström A, Howard SR. *Mini-Puberty, Physiological and Disordered: Consequences, and Potential for Therapeutic Replacement.* Endocr Rev 2024. [PMID 38436980](https://pubmed.ncbi.nlm.nih.gov/38436980/), DOI 10.1210/endrev/bnae003, [pełny tekst PMC11244267](https://pmc.ncbi.nlm.nih.gov/articles/PMC11244267/). Odczytano pełne części merytoryczne; tabela 1 jest wtórnym źródłem liczb M2/M3, z zachowaniem ich różnych statystyk.
- **M2:** Johannsen TH i wsp. *Sex Differences in Reproductive Hormones During Mini-Puberty in Infants With Normal and Disordered Sex Development.* JCEM 2018. [PMID 29917083](https://pubmed.ncbi.nlm.nih.gov/29917083/), DOI 10.1210/jc.2018-00482. Odczytany abstrakt i metadane: 1840 zdrowych niemowląt oraz 27 dzieci z DSD, wiek 2–5 miesięcy. Pełny oryginał niedostępny; liczby zdrowych grup odczytano z M1, metodę/statystykę z M4.
- **M3:** Andersson AM i wsp. *Longitudinal reproductive hormone profiles in infants: peak of inhibin B levels in infant boys exceeds levels in adult men.* JCEM 1998;83(2):675–681. [PMID 9467591](https://pubmed.ncbi.nlm.nih.gov/9467591/), DOI 10.1210/jcem.83.2.4603. Zweryfikowane metadane i abstrakt; pełny oryginał niedostępny. Zakresy obserwowane odczytano wtórnie z M1, nie przekształcono ich w RI.
- **M4:** Olthof A i wsp. *A literature overview of age- and Tanner stage-specific reference intervals for sex hormones for children aged 0–18 years.* J Mol Endocrinol 2026;77(2). [PMID 42554720](https://pubmed.ncbi.nlm.nih.gov/42554720/), DOI 10.1530/JME-26-0037, [pełny tekst PMC13506540](https://pmc.ncbi.nlm.nih.gov/articles/PMC13506540/). Odczytano Methods, Results, Discussion i tabele 1–2; suplement PDF niedostępny. Heterogeniczność populacji, metod, ocen stadium i statystyk ogranicza łączenie danych.
