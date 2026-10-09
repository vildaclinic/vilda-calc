# Poglądowy przebieg hormonów przez życie

Zatwierdzenie właściciela: 9 października 2026, po przeglądzie makiet
desktopowych i mobilnych oraz po poprawach połączeń okresów życia i skali
minipuberty. Dane: `2026-10-09.5`. Zakres zatwierdzenia to prezentacja
edukacyjna, nie nadanie algorytmowi statusu walidacji klinicznej.

## Cel i granice

Wykres pokazuje czas i kierunek zmian hormonów. Nie wyznacza norm,
stężeń pacjenta, centyli, stadium pokwitania, menopauzy ani przyczyny wyniku.
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
Znacznik pokazuje wyłącznie znany wiek, nigdy wynik laboratoryjny.
Poza osią wieku znacznik znika zamiast przyklejać się do końca.

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
- Ostatniego hormonu nie można odznaczyć do pustego widoku. Powrót
  przyciskiem „Tylko…” wybiera bieżący analit.
- Kliknięcie etapu przesuwa tę samą ramkę płynnie od aktualnego położenia;
  `prefers-reduced-motion` wyłącza ruch. Brak osobnego przycisku zatrzymania.
- Wiek i płeć pochodzą z istniejącego kontekstu aplikacji; bez kolejnego
  formularza. Etap wybrany do obejrzenia nie zmienia pacjenta.

## Stała skala i połączenia

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

Wyjątek: osobny widok **Porównaj płcie** porównuje kształt AMH albo inhibiny B
w pierwszym roku. Każda płeć używa własnego maksimum tego okresu, z widocznym
podpisem tej zasady. Wymaga osobnych `comparisonValues`; zwykłe `miniValues`
nadal zachowuje skalę całego życia. Linia dziewczynek odtwarza mediany,
linia chłopców jest autorskim schematem. Nie wyprowadzać z porównania
ilorazów stężeń ani precyzyjnej różnicy czasu szczytów.

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

Pliki źródłowe zawierają odnośniki, sumy kontrolne suplementów i wskazanie
konkretnych tabel/komórek/pikseli. Repozytorium nie przechowuje pełnych PDF,
makiet HTML, zrzutów makiet ani danych pacjentów. Zmiana krzywych, ich
źródeł lub znaczenia wymaga ponownego przeglądu klinicznego; poprawny test
techniczny nie stanowi dowodu poprawności medycznej.
