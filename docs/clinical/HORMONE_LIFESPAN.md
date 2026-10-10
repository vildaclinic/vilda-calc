# Poglądowy przebieg hormonów przez życie

Zatwierdzenie właściciela: 9 października 2026, po przeglądzie makiet
desktopowych i mobilnych oraz po poprawach połączeń okresów życia i skali
minipuberty. Dane: `2026-10-09.5`. Zakres zatwierdzenia to prezentacja
edukacyjna, nie nadanie algorytmowi statusu walidacji klinicznej.

10 października 2026, po porównaniu kolejnych wariantów, właściciel
polecił powrót do „Pierwotnego przebiegu” z makiety. Przywrócono geometrię
sprzed PR #607; źródła medyczne i zakresy odniesienia pozostają bez zmian.

Następnie właściciel zatwierdził makietę czerwonego punktu wyniku i wdrożenie
na dostępnych danych liczbowych, bez nowych pól. Ta zmiana zastępuje dawny
zakaz zaznaczania wyniku **wyłącznie przy odrębnym modelu stężeń**. Źródła,
granice zastosowania i przypadki kontrolne opisano w
[PATIENT_POINT.md](hormone-lifespan/PATIENT_POINT.md). Nie wolno nadać
dotychczasowemu schematowi znaczenia mediany przez samo dodanie punktu.

## Cel i granice

Wykres pokazuje czas i kierunek zmian hormonów. Jeśli dostępny jest właściwy
model liczbowy, pokazuje również wpisane stężenie pacjenta na jego tle.
Nie wyznacza norm, centyli, stadium pokwitania, menopauzy ani przyczyny wyniku.
Nie zastępuje osi interpretacji badania i nie zmienia ich danych, progów,
jednostek ani werdyktów. Połączenie nie zapisuje porównań do historii,
przypiętych wyników, wizyt ani stanu pacjenta.

Każdy hormon ma własną skalę względną. Przecięcie linii różnych hormonów
nie oznacza równego stężenia. Oś całego życia ma różną skalę czasu w etapach.
Granice pokwitania, dorosłości i przejścia menopauzalnego są umowne,
nie są diagnozą na podstawie wieku.

Sam wykres nie potwierdza dopasowania pacjenta do populacji publikacji.
Niemowlęce dane dotyczą dzieci donoszonych; wcześniak lub nieznane dane
urodzeniowe nie mogą automatycznie otrzymać dopasowania do tej populacji.
Brak wiarygodnej płci lub wieku nie może tworzyć fikcyjnego kontekstu.
Pionowy znacznik pokazuje znany wiek. Osobny czerwony punkt może pokazać
wynik laboratoryjny po spełnieniu warunków opisanych poniżej.
Poza osią wieku znacznik znika zamiast przyklejać się do końca.

## Wynik pacjenta na tle modelu

Czerwony punkt oznacza **wynik pacjenta**, a nie wynik nieprawidłowy.
Linia odniesienia przedstawia medianę lub centralny przebieg modelu,
nie górną granicę normy i nie średnią arytmetyczną. Powyżej albo poniżej
linii nie oznacza poza zakresem referencyjnym. Pozostają dotychczasowe,
odrębne osie interpretacji badania.

Wiek, płeć, analit, zapis wyniku i jednostka pochodzą z istniejącego
formularza, również z jego lokalnych korekt. Nie dodajemy selektorów
publikacji, metody ani dodatkowego formularza. Metoda w źródłach opisuje
badanie populacyjne; nie potwierdza metody próbki pacjenta. Obecne dane
Tannera pozostają dostępne, lecz nie zmieniają krzywej wieku w krzywą
stadium i nie są odgadywane z wyniku.

Punkt i linia muszą korzystać z **tego samego modelu stężenia, jednostki
i przekształcenia wysokości**, również po zmianie widoku, wyboru hormonów
i powiększeniu. Nie wolno dopasować punktu do autorskiej linii pojedynczym
mnożnikiem ani przeliczać schematycznej wysokości na stężenie. Model
ilościowy ma własne granice i jawnie wskazane źródło; poza nimi schemat
edukacyjny nie staje się jego ekstrapolacją.

Dobór źródła zależy od analitu, płci i wieku, nigdy od wpisanej wartości
ani pożądanego położenia punktu. Nie interpolujemy pomiędzy publikacjami.
Modele i tabele są danymi oddzielnymi od silnika. Między węzłami jednego
profilu stosujemy PCHIP bez przeregulowania; krzywą i punkt liczy ta sama
funkcja. Interpolacja węzłów rocznych jest przybliżeniem implementacji,
nie udostępnionym przez autora pełnym dopasowaniem statystycznym.

Brak profilu, nieznany wiek lub płeć, nieobsługiwana jednostka, pusty albo
nieprawidłowy wynik oraz nierówność (`<`, `≤`, `>`, `≥`) oznaczają brak
dokładnego punktu. Odznaczenie hormonu ukrywa jego punkt; nie wyświetlamy
wyniku LH przy przeglądaniu AMH ani wyniku jednej osoby po zmianie pacjenta.
Poza widocznym okresem punkt znika, zamiast przesuwać się na jego granicę.
Wyniku przekraczającego wysokość wykresu nie wolno przyciąć i przedstawić
jako innego stężenia. Schemat cyklu estradiolu nie przyjmuje punktu wyniku.

Źródła niemowlęce wymagają znanego donoszenia; wcześniactwo i nieznane
dane urodzeniowe nie kwalifikują do tych populacji. Stosujemy wiek po
urodzeniu, bez zamiany na PMA lub wiek skorygowany. Wiek zapisany tylko
w latach i miesiącach nie staje się dokładnie znaną datą pobrania. Bramka
donoszenia nie usuwa automatycznie danych pokwitaniowych starszego dziecka.
Przy medianie Busch odczytanej z ryciny zbyt blisko granicy oznaczalności
nie tworzymy precyzyjnego punktu względem sztucznej podłogi. Szczegóły
tego ograniczenia graficznego są w dokumentacji danych; nie jest to
nowy próg interpretacji klinicznej.

## Wybór i interakcje

- Domyślnie wybrany jest tylko bieżący analit przelicznika. Pozostałe
  hormony można dołączyć, bez uruchamiania ich obliczeń.
- Identyfikatory mapuje się jawnie: `lh` → `lh`, `fsh` → `fsh`,
  `estradiol` → żeńskie `e2`, `testosterone_total` → męskie `t`,
  `amh` → `amh`, `inhibin_b` → `inhb`. `testosterone_free` nie jest `t`.
  Nieobsługiwana para płeć–analit pomija wykres, bez krzywej poprzedniego analitu.
- Zmiana analitu lub płci przywraca pojedynczy właściwy hormon.
  Aktualizacja wyniku, wieku albo rozmiaru ekranu przy tym samym analicie
  nie usuwa ręcznie dołączonych porównań.
- Każdy hormon, także ostatni i domyślnie wybrany, można odznaczyć.
  Pusty wybór ukrywa krzywe i pokazuje „Wybierz hormon”; nie przywraca
  automatycznie bieżącego analitu. Powrót przyciskiem „Tylko…” wybiera
  bieżący analit. Ta sama możliwość odznaczenia dotyczy porównania płci.
- Nagłówek osi „Przebieg zmian” zastępuje techniczne „Poziom względny”.
  Nie zmienia znaczenia wysokości linii; zasada osobnych skal pozostaje
  widoczna pod wykresem.
- „Porównaj płcie” działa w minipuberty dla AMH i inhibiny B, a w pokwitaniu
  dla LH, FSH, AMH i inhibiny B. Przejście między tymi okresami zachowuje
  tryb porównania. Gdy wybrany hormon nie ma porównania w nowym okresie,
  znika wybór i użytkownik może wskazać hormon z dostępnego zestawu.
  Widok „Całe życie” kończy porównanie płci. Nie dopisujemy żeńskiego
  testosteronu lub INSL3 ani męskiego estradiolu bez odpowiednich danych.
  Wejście w porównanie respektuje ręczny wybór: wybiera pierwszy zaznaczony
  hormon dostępny w danym okresie. Bieżący analit nie ma pierwszeństwa.
  Pusty wybór pozostaje pusty również po wejściu w porównanie; przy samych
  zaznaczonych hormonach bez danych drugiej płci przycisk jest ukryty.
- Kliknięcie etapu przesuwa tę samą ramkę płynnie od aktualnego położenia;
  `prefers-reduced-motion` wyłącza ruch. Brak osobnego przycisku zatrzymania.
- Wiek i płeć pochodzą z istniejącego kontekstu aplikacji; bez kolejnego
  formularza. Etap wybrany do obejrzenia nie zmienia pacjenta.
- „Powiększ” otwiera całą sekcję w oknie zajmującym viewport, również
  ponad powłoką aplikacji. Zachowuje hormony, okres, porównanie płci,
  schemat cyklu i rozwinięte źródła. „Zamknij” lub Escape przywraca
  sekcję, fokus i przewinięcie. Nie wymaga Fullscreen API ani ukrycia
  paska przeglądarki, dzięki czemu działa także na telefonie.
  Zmiana pacjenta, analitu lub płci, blokada, usunięcie modułu i przejście
  do innej karty zamykają powiększenie. Stan nie trafia do historii pacjenta.
  Powiększenie zmienia rozmiar renderowania, bez zmiany interpolacji,
  danych czy normalizacji. Test `hormone-lifespan-fullscreen.spec.mjs`
  obejmuje oba rozmiary mobilne, obrót, ramkę same-origin i powrót
  do pierwotnej geometrii po zamknięciu.
  Rzeczywiste używanie przycisków, klawiatury i przewijania w dialogu
  odnawia istniejący licznik aktywności przelicznika i powłoki. Automatyczne
  odświeżanie, zmiana rozmiaru i przewijanie przez skrypt nie odnawiają go.
  Limit bezczynności i blokada sesji pozostają bez zmian.
- Przyciski zachowują czytelny kontrast także bez zaznaczenia. Ustawienie
  ograniczenia ruchu wyłącza również przejścia kolorów. Zmiana rozmiaru
  wykresu zachowuje fokus odnośnika w źródłach, jeśli ich treść się nie zmieniła.

Regresje interakcji po audycie: `hormone-lifespan-activity.spec.mjs`
(rzeczywiste moduły sesji, fikcyjne konto, pełny ekran samodzielnie i w ramce),
`hormone-lifespan-accessibility.spec.mjs` (kontrast, klawiatura, ograniczenie
ruchu, fokus źródeł) i `hormone-lifespan-puberty-comparison.spec.mjs`
(ręczny i pusty wybór). Naprawy nie zmieniają geometrii ani źródeł krzywych.

## Stała skala i połączenia

Poniższe zasady opisują bazową warstwę schematów. Jeżeli wyświetlany jest
model liczbowy z punktem wyniku, pierwszeństwo mają wspólne przeliczenie
punktu i modelu oraz granice profilu opisane powyżej. Mosty schematyczne
i normalizacje nie mogą stanowić liczbowej podstawy wyniku pacjenta.

W żeńskich widokach Całe życie, Minipuberty i Pokwitanie pojedynczy hormon
zawsze używa tego samego `normalizationMaximum`. Zmienia się tylko oś czasu.
Zaznaczenie innych hormonów nie przeskalowuje osi pionowej. Nie przywracać
normalizowania każdej niemowlęcej krzywej do jej szczytu ani arbitralnego
`infantHeight`. Dla przykładu szczyt mediany E2 u niemowląt, 23,908 pmol/L,
ma wysokość `23,908 / 264 ≈ 0,0906` w obu zwykłych widokach.

`lifespanData.hormones.*.points` zachowuje dowody w oryginalnych jednostkach.
Renderer korzysta z `displaySegments`: `kind=model` odtwarza opublikowany
model, a `kind=schematic` zawiera wyłącznie `ageYears` i bezwymiarowe
`relative`, z `unit=null` i opisem decyzji. Nie przeliczać wysokości schematu
z powrotem na laboratoryjne stężenia ani nie dodawać liczbowych tooltipów.

Przerwy w obserwacjach (`evidenceGaps`) są połączone przerywanymi mostami
poglądowymi. Nie oznaczają nowych pomiarów. Wspólne styczne PCHIP i dokładne
krzywe Béziera zachowują ciągłość bez przeregulowania. Dla AMH szerokie
wypłaszczenie około końca niemowlęctwa zastępuje skok do mediany całej grupy
1–4,9 lat; odcinek 0,9–1,3 roku to geometria schematu. Szczegółowy widok
minipuberty zachowuje wszystkie 99 źródłowych punktów. Wartość
`qualitativeTail.displayFloor` jest wyłącznie odległością od osi: niskie
lub niewykrywalne nie znaczy stężenie równe zero.

Wyjątek: osobny widok **Porównaj płcie** używa własnego maksimum każdej płci
w wybranym okresie, z widocznym podpisem tej zasady. Porównuje kształt
i kierunek zmian, nie bezwzględne stężenia. Równa wysokość i przecięcie
linii nie oznaczają równych stężeń. Nie wyprowadzać z porównania ilorazów
stężeń ani precyzyjnej różnicy czasu szczytów.

- **Minipuberty:** AMH albo inhibina B w pierwszym roku. Osobne
  `comparisonValues` nie zmieniają zwykłych `miniValues`, które nadal
  zachowują skalę całego życia. Linia dziewczynek odtwarza mediany
  Ljubicic 2022; w bazowej warstwie linia chłopców jest autorskim schematem.
  Dotychczasowa
  geometria porównania i ograniczenie do dzieci donoszonych nie zmieniają się.
- **Pokwitanie:** LH, FSH, AMH albo inhibina B na wspólnej osi wieku
  chronologicznego 8–20 lat. Maksimum wyznacza się osobno dla każdej płci
  w tym przedziale, bez przesuwania krzywych w czasie. To umowny wycinek
  wykresu, nie zakres prawidłowego początku lub zakończenia pokwitania.
  Wiek nie zastępuje stadium Tannera. Zachowujemy istniejącą interpolację
  pełnych tablic: męskie PCHIP i 97 próbek z B-spline oraz żeńskie
  `displaySpline`/`segmentPath`. Nie obliczamy nowego splajnu z samych
  węzłów 8–20 lat i nie zmieniamy węzłów, kształtu ani zwykłych widoków.

Pokwitaniowe porównanie dziewczynek wykorzystuje istniejące schematy
LH/FSH (Ljubicic 2020) i AMH (Jopling 2018 oraz FDA K170524), a dla
inhibiny B odtworzony model 0 SD Borelli-Kjær 2025. Nie nazywamy wszystkich
tych przebiegów medianami, a niemowlęce mediany Ljubicic 2022 nie są ich
źródłem. Męskie linie bazowej warstwy są autorskim schematem wspartym źródłami
opisanymi niżej. Porównanie różnych populacji i metod służy zobrazowaniu
kierunku zmian; samo w sobie nie ocenia wyniku pacjenta ani nie ustala
dokładnego opóźnienia jednej płci względem drugiej.

## Źródła żeńskie

Poniżej opisano dane faktycznie użyte do przygotowania punktów. Pełne
ekstrakty, jednostki, liczebności i odnośniki są w
[`hormone-lifespan/evidence`](hormone-lifespan/evidence) oraz
[`female-reference-data.json`](hormone-lifespan/female-reference-data.json).
Są to różne populacje i oznaczenia, nie jeden model całego życia.

| Odcinek | Publikacja i miejsce | Populacja, oznaczenie i ograniczenie |
| --- | --- | --- |
| LH, FSH, AMH, inhibina B, E2: 0,02–1 roku | [Ljubicic 2022](https://doi.org/10.1210/clinem/dgac363), ryc. 1 i [suplement tabela 1](https://doi.org/10.6084/m9.figshare.19469555.v1), CC BY 4.0 | 98 donoszonych dziewczynek, 266 próbek surowicy. Mediany GAMLSS, po 99 punktów; pierwszy około 7,3 dnia, bez ekstrapolacji do urodzenia. AutoDELFIA dla LH/FSH, Access 2 dla AMH, Gen II ELISA dla inhibiny B, LC-MS/MS dla E2. Nie są to średnie z ryc. 3. |
| LH/FSH po niemowlęctwie | [Ljubicic 2020](https://doi.org/10.1093/humrep/deaa182), tabela I | AutoDELFIA; 3273 kobiety w zdrowej części badania. Rodzaj centralnej statystyki tabeli nie jest określony: `value`, nie potwierdzona mediana. Grupa 20–<40 lat ma tylko 17 kobiet; obserwacje kończą się na 80 latach mimo etykiety 70–100. Faza cyklu nie jest ustalana z wieku. |
| AMH: dzieciństwo/pokwitanie | [Jopling 2018](https://doi.org/10.1002/edm2.21), tabela 1 | Access AMH, osocze litowo-heparynowe; małe szpitalne grupy wieku, wykluczone DSD/endokrynopatie. Mediany grup nie wyznaczają dokładnych szczytów ani dołków. Brak przelicznika surowica–osocze. |
| AMH: dorośli | [FDA K170524](https://www.accessdata.fda.gov/cdrh_docs/pdf17/K170524.pdf), Expected Reference Intervals, str. PDF 15 (wewn. 11), osocze | Access 2, 620 nieciężarnych kobiet, regularne cykle i potwierdzona płodność. Wybrano mediany osocza; tabela surowicy jest oddzielna. Ostatnia grupa 41–45 lat; nie ma liczbowej ekstrapolacji do starości. |
| Inhibina B: 5,6–47 lat | [Borelli-Kjær 2025](https://doi.org/10.1210/clinem/dgae439), ryc. 1, linia 0 SD | Gen II ELISA, surowica, oryginalnie ng/L = pg/mL. Odtworzenie rastra około ±2 pg/mL; kalibracja pikseli i SHA źródła w ekstrakcie. 149 dorosłych kobiet, bez standaryzacji fazy cyklu. Luka obserwacji 1,08–5,6 lat; nasz most zaczyna się przy 1 roku. Nie dopisujemy stężeń pod LOD 3 pg/mL. |
| E2: 6–18 lat | [Madsen 2022](https://doi.org/10.1210/clinem/dgac155), [suplement LMS](https://doi.org/10.6084/m9.figshare.17153336.v1), CC BY 4.0 | BGS2/Fit Futures, LC-MS/MS, różne fazy cyklu, bez użytkowniczek antykoncepcji doustnej. Mediana = `exp(M) / 1e6`, według komórek przykładowych K36/L36, nie samo M. To model przekrojowy, nie trajektoria jednej osoby. |
| E2: archiwum faz dorosłych | [Frederiksen 2020](https://doi.org/10.1210/clinem/dgz196), suplement tabela 8 | Surowica, izotopowe TurboFlow LC-MS/MS, 24,7–43,9 lat. Mediany 156/254/264 pmol/L dotyczą różnych faz. 156 nie jest średnią całego cyklu i nie ustala linii dorosłości. Podgrupa 303 pmol/L pokrywa się z fazą ≥15 dni; nie jest dodatkową fazą. Rozbieżność liczebności w źródle zachowano. |
| E2: po menopauzie | [Cui 2026](https://pubmed.ncbi.nlm.nih.gov/42120349/), DOI 10.1210/clinem/dgag188, pierwotny abstrakt | 7206 kobiet, 5 kohort, głównie LC-MS/MS, harmonizacja do CDC. Potwierdzono abstrakt, nie pełną ekstrakcję artykułu. Mediana 18 pmol/L jest zbiorcza, nie swoista dla 55 czy 75 lat. |

Źródła pomocnicze kierunku zmian: [SWAN/Randolph 2011](https://doi.org/10.1210/jc.2010-1746)
odnosi przejście do rzeczywistej ostatniej miesiączki, nie uniwersalnego wieku;
[Sowers 2008](https://doi.org/10.1210/jc.2008-0567) wspiera spadek AMH
i niską/niewykrywalną inhibinę B. Ekstrakt zachowuje oddzielnie pomocnicze
sprawdzenia ALSPAC i późnego okresu pomenopauzalnego. Archiwalne propozycje
„band” w ekstraktach nie są instrukcją renderowania: pasmo usunięto decyzją
właściciela, a obowiązują `displaySegments` i ten dokument.

Nie łączyć median końca pokwitania E2 z niższą medianą jednej fazy dorosłych.
Dorosłe plateau zachowuje tylko graficzną wysokość końca pokwitania.
Nie jest stężeniem 185,46 pmol/L, średnią ani medianą dorosłych. LH/FSH
po okresie niemowlęcym przedstawiają szerokie kierunki zamiast wymuszonych
szczytów/dołków między grupami. Szerokie maksimum AMH nie lokuje szczytu
dokładnie w 28. roku życia. Pokwitaniowy garb inhibiny B pozostaje,
ponieważ występuje w jej opublikowanym modelu.

## Osobny cykl estradiolu

Widoczny tylko w żeńskim widoku Całe życie, przy wybranym E2 i etapie
„Dorosła”. Bez nowego selektora; znika po zmianie widoku, etapu lub
odznaczeniu E2. Oś dni jest oddzielna od osi lat życia. Bez znacznika
pacjentki, jednostek laboratoryjnych, norm i przewidywania owulacji.

[Anckaert 2021](https://doi.org/10.1016/j.plabm.2021.e00211), tabela 1
i suplement tabela 3: 85 kobiet 18–37 lat, surowica, Roche Elecsys E2 III
na cobas e801. Mediany siedmiu podfaz 125/172/464/817/390/505/396 pmol/L
są dzielone przez 817 wyłącznie w tym osobnym schemacie. Publikacja
standaryzowała cykle do 29 dni względem szczytu LH. Środki podfaz są
przemapowane na poglądowy cykl 28-dniowy; nie są dziennymi medianami.
Końcowy spadek w dniu 28 jest jawnie oznaczonym domknięciem ilustracji,
nie pomiarem. Widoczna informacja o zmiennej długości cyklu i czasie
owulacji pozostaje. Danych Roche nie łączymy liczbowo z LC-MS/MS osi życia.

## Źródła męskie i przyszłe anality

Poniżej udokumentowano zachowany **bazowy schemat bez ilościowej oceny
pacjenta**. Oddzielne liczbowe źródła punktu wyniku znajdują się w
[PATIENT_POINT.md](hormone-lifespan/PATIENT_POINT.md). Obecność schematu
danego hormonu lub wieku nie oznacza dostępności ilościowego porównania.

Męskie `schematic-data.js` to autorski schemat, bez laboratoryjnych jednostek,
oparty na [Salonia 2019](https://doi.org/10.1038/s41572-019-0087-y), ryc. 2,
oraz kierunkach z publikacji. Nie jest digitalizacją jednej ryciny ani
siatką zmierzonych median. [Busch 2022](https://doi.org/10.1210/clinem/dgac115)
uzasadnia orientacyjny czas szczytów u donoszonych chłopców: FSH 11 dni,
LH 18 dni, INSL3 27 dni, testosteron 29 dni; własne `h.ages` zachowuje
różnice. Męskie AMH i inhibina B osiągają ilustracyjne szczyty później,
około 5. i 4. miesiąca. Nie odczytywać dokładnych ilorazów ani czasu
z porównania modelu dziewczynek z tym schematem chłopców.

Dalszy przebieg wspierają: [Madsen 2022](https://doi.org/10.1210/clinem/dgac155),
[Kelsey 2014 — testosteron](https://doi.org/10.1371/journal.pone.0109346),
[Kelsey 2016 — inhibina B](https://doi.org/10.1371/journal.pone.0153843),
[Tehrani 2017](https://doi.org/10.1371/journal.pone.0179634),
[EMAS 2022 — INSL3](https://doi.org/10.1111/andr.13220).
Wysokości pozostają poglądowe; odcinek do 90 lat nie jest ilościową prognozą.

### Pierwotny przebieg męskiego schematu — 2026-10-10

Na polecenie właściciela przywrócono wariant „Pierwotny przebieg”,
odpowiadający rendererowi z commita `c6b03379` (przed PR #607).
Źródłowe tablice `ages`/`values` nie zmieniają się. Usunięto
`displayPointIndices`: wszystkie pierwotne punkty znów uczestniczą
w interpolacji, bez selekcji punktów prowadzących.

Trzy widoki męskie korzystają z pierwotnej interpolacji PCHIP, 97 próbek
na widocznej osi i wtórnego wygładzenia B-spline. Porównanie płci wraca
do interpolacji punktów niemowlęcych i 193 próbek z tym samym sposobem
rysowania. Jest to dokładne przywrócenie zaakceptowanego wyglądu, nie nowy
algorytm. Wygładzenie może nieznacznie spłaszczyć lub przesunąć ostry
szczyt względem węzła; nie gwarantuje przejścia linii przez każdy punkt.
Własne `h.ages` pozostają w źródłach. Zachowano niezależną skalę każdego
hormonu i dotychczasową skalę porównania płci.

**Wpływ kliniczny:** zmienia się tylko geometria edukacyjna; nie pomiary,
zakresy, klasyfikacja wyniku ani historia. Krzywe żeńskie pozostają
niezmienione. Schemat nadal nie jest modelem stężeń ani narzędziem
odczytu dokładnego czasu lub wysokości szczytów. Źródła i ograniczenia
populacji pozostają opisane powyżej.

**Backlog: kalkulator INSL3.** Obecna krzywa nie oznacza działającego
przelicznika ani interpretacji. Po wdrożeniu rzeczywistego analitu powiązać
jego ID z domyślnym wyborem, zgodnie z
[LAB_INTERPRETATION_AGENT_GUIDE.md](LAB_INTERPRETATION_AGENT_GUIDE.md).
Nie tworzyć klinicznych zakresów z tych współrzędnych. Nie mieszać
archiwalnych średnich geometrycznych Johannsen 2018
(`pairedInfantComparison`) z medianami Ljubicic 2022: nie są renderowane.

## Odtwarzanie i regresja

Źródła są czytelne w `docs/clinical/hormone-lifespan/`. Z katalogu repo:

```sh
python docs/clinical/hormone-lifespan/build_evidence.py
python docs/clinical/hormone-lifespan/verify_evidence.py
python docs/clinical/hormone-lifespan/build_runtime.py
python docs/clinical/hormone-lifespan/build_runtime.py --check
node --check vilda_hormone_lifespan_data.js
```

`build_evidence.py` zachowuje ekstrakty i buduje jawne schematy prezentacji.
`build_runtime.py` jedynie pakuje zatwierdzone dane do czytelnego UMD:
`window.VildaHormoneLifespanData` / `module.exports` z polami
`version`, `maleAges`, `maleHormones`, `maleStages`, `referenceData`,
`lifespanData`. Przeglądarka nie potrzebuje Pythona, źródłowych JSON,
sieci ani bibliotek wykresów. Historyczne wzmianki „mock” w metadanych
pochodzą z zatwierdzonego zbioru; nie rozszerzają jego zastosowania.

`tests/unit/hormone-lifespan-data.test.mjs` ładuje rzeczywisty eksport
produkcyjny i sprawdza zachowanie dowodów, jednostek, skal, mostów i cyklu.
Przypadki regresji: E2 minipuberty 23,908/264 zamiast sztucznego szczytu 1;
AMH po niemowlęctwie bez skoku do mediany grupy 1–4,9 lat; E2 18→30 lat
bez spadku do 156/264; ciągłe łączenie mostu inhibiny B od 1 do 5,6 roku;
odróżnienie źródłowych 29 dni od schematycznych 28 dni cyklu.

`tests/e2e/hormone-lifespan-original-curves.spec.mjs` porównuje ścieżki
SVG rzeczywistego renderera z utrwalonym wzorcem „Pierwotnego przebiegu”.
Obejmuje sześć męskich hormonów, trzy widoki, desktop i telefon oraz
porównanie płci dla AMH i inhibiny B. Sprawdza powrót do zatwierdzonej
geometrii, bez wymagania dokładnego przejścia przez szczyty źródłowe.
Syntetyczne wejście: chłopiec, LH, wiek 0,25 roku → początkowo wyłącznie
krzywa LH i geometria zgodna z pierwotnym wzorcem danego widoku.
Istniejące testy `hormone-lifespan-context.spec.mjs` sprawdzają kontekst
formularza i interakcje obu płci.

Wzorzec pierwotnych krzywych dotyczy bazowego schematu, nie nowego modelu
ilościowego. `tests/unit/hormone-lifespan-reference.test.mjs` wywołuje
rzeczywisty `vilda_hormone_lifespan_reference.js` i sprawdza niezależne
wartości źródłowe, granice wieku, jednostki, nierówności oraz brak
ekstrapolacji. W testach interfejsu punkt równy medianie musi trafić na
odpowiednią linię, a większy/mniejszy wynik odpowiednio nad nią/pod nią;
pełny ekran i zmiana szerokości nie mogą zmienić tej relacji. Przypadki
źródłowe podano w [PATIENT_POINT.md](hormone-lifespan/PATIENT_POINT.md).

Pliki źródłowe zawierają odnośniki, sumy kontrolne suplementów i wskazanie
konkretnych tabel/komórek/pikseli. Repozytorium nie przechowuje pełnych PDF,
makiet HTML, zrzutów makiet ani danych pacjentów. Zmiana krzywych, ich
źródeł lub znaczenia wymaga ponownego przeglądu klinicznego; poprawny test
techniczny nie stanowi dowodu poprawności medycznej.
