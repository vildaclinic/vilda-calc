# Inhibina B — porównanie według wieku i minipuberty

Stan źródeł: 2026-10-09. Dane `2026-10-09.1`, osobny silnik
`VildaLabInhibinB` 1.0.0. Wdrożenie wymaga akceptacji klinicznej właściciela
przed scaleniem. Testy techniczne nie nadają statusu walidacji klinicznej.

## Zakres i zmiana zachowania

Lekarz wybiera inhibinę B i wpisuje stężenie. Formularz wykorzystuje aktualne
dane pacjenta, w tym płeć, wiek i dostępne dane urodzeniowe. Nie wymaga wyboru
metody ani profilu. Lokalna korekta nie zmienia karty pacjenta. Porównanie
odnosi się do bieżącego kontekstu, bez dodatkowej daty dawnego pobrania.

Wynik zawiera duże stężenie, dostępną oś, jedną notkę źródłową i zwinięte
szczegóły. Dla przedziału z samą górną granicą komunikat brzmi
„Nie przekracza górnej granicy”, nie „prawidłowa funkcja gonad”. Sam wynik
nie rozpoznaje niepłodności, hipogonadyzmu, nowotworu ani przyczyny zaburzeń.
Przy krzywej dziewczynek w minipuberty widoczna jest jedna notka:
„Źródło podaje tylko górną granicę — nie pozwala ocenić, czy wynik jest za niski.”

Poprzedni moduł miał niezweryfikowane zakresy niemowlęce 150–400 i 100–200,
błędne powiązanie cytowania Anderssona, domyślną fazę folikularną u kobiet
oraz zastępczą normę dorosłych mężczyzn 80–300 przy brakującym dopasowaniu.
Usunięto te dane i rozpoznania sugerowane przez dawne notatki. Nie należy
porównywać nowych wyników z dawnym kolorem statusu jako zmiany klinicznej.

## Pokrycie

| Grupa | Aktywne źródło i zakres zastosowania |
|---|---|
| Wcześniaki w pierwszym roku | Brak zweryfikowanego osobnego RI; bez norm donoszonych i bez wieku skorygowanego jako zamiennika |
| Chłopcy 2,0–5,0 miesiąca | Johannsen 2018, dwa przedziały minipuberty |
| Chłopcy <12 miesięcy poza powyższym oknem | Labcorp, szeroki zakres pierwszego roku; nie opisuje dynamiki minipuberty |
| Dziewczynki od 5 ukończonych dni do <1 roku | Ljubičić 2022, górna krzywa dla wieku; bez dolnego RI |
| Dziewczynki przed powyższą dolną granicą | Brak dopasowanego zakresu; nie zastępujemy normą starszych dziewczynek |
| Dzieci od 1 roku | Labcorp, osobno według płci i kategorii wieku |
| Mężczyźni dorośli | Labcorp, 18–49 oraz >49 ukończonych lat |
| Kobiety po dziecięcej kategorii 12–18 lat | Labcorp, fazy cyklu i menopauza; nie ustalamy ich z wieku |
| G1–G5 / Th1–Th5 | Brak aktywnej normy stadium w tej wersji; brak stadium nie blokuje osi wieku |

Wcześniactwo w wywiadzie nie blokuje późniejszych zakresów dziecięcych ani
dorosłych. Nie tworzymy osobnej normy dla perimenopauzy. Wiersz Labcorp
„>49” nie ma górnego limitu wieku; nie nazywamy go odrębną walidacją u osób
80+ lub 90+.

## R1 — Johannsen 2018: minipuberty

Johannsen TH i wsp. *Sex Differences in Reproductive Hormones During
Mini-Puberty in Infants With Normal and Disordered Sex Development.*
JCEM 2018;103(8):3028–3037. DOI
[10.1210/jc.2018-00482](https://doi.org/10.1210/jc.2018-00482),
[PMID 29917083](https://pubmed.ncbi.nlm.nih.gov/29917083/).
Przeczytano [pełny tekst](https://academic.oup.com/jcem/article/103/8/3028/5037960),
w tym metody i tabelę 1.

Populacja referencyjna: zdrowe niemowlęta duńskie, urodzone w GA
37+0–41+6, czyli 259–293 dni włącznie. Materiał: surowica. Metoda:
Oxford Bio-Innovation/Serotec double antibody enzyme-immunometric assay;
LOD 20 pg/mL. Tabela podaje centralne p2,5–p97,5, a nie przedział ufności
średniej.

| Wiek chronologiczny | Chłopcy [pg/mL] | n | Dziewczynki [pg/mL] | n |
|---|---:|---:|---:|---:|
| 2,0–<3,5 miesiąca | 229–631 | 571 | <LOD–184 | 423 |
| 3,5–5,0 miesiąca | 222–662 | 158 | <LOD–174 | 106 |

Aktywne są dwa wiersze **chłopców**. Dane dziewczynek dokumentujemy jako
zweryfikowane, ale nie przełączamy w środku pierwszego roku z R2 na inną
metodę R1. Dolna granica dziewczynek w R1 jest cenzorowana; nie oznacza 0
ani 20. Granice 3,5 oraz 5,0 miesiąca zachowują operatory publikacji.
Rzeczywiste próbki miały wiek od 2,1 miesiąca u chłopców i 2,3 u dziewczynek;
przedziały tabeli zaczynają się od 2,0. Nie ekstrapolujemy poza tabelę.

## R2 — Ljubičić 2022: dziewczynki w minipuberty

Ljubičić ML i wsp. *A Biphasic Pattern of Reproductive Hormones in Healthy
Female Infants: The COPENHAGEN Minipuberty Study.* JCEM
2022;107(9):2598–2605. DOI
[10.1210/clinem/dgac363](https://doi.org/10.1210/clinem/dgac363),
[PMID 35704034](https://pubmed.ncbi.nlm.nih.gov/35704034/).
Przeczytano [pełny artykuł](https://academic.oup.com/jcem/article/107/9/2598/6608768)
oraz oryginalny DOCX suplementu
[1A–G, wersja 1](https://doi.org/10.6084/m9.figshare.19469555.v1).

Populacja: 98 zdrowych donoszonych dziewczynek z ciąż pojedynczych,
Kopenhaga, 266 próbek w wieku 5 dni–14,2 miesiąca. Wszystkie uczestniczki
opisano jako kaukaskie. Surowica; Beckman Coulter Inhibin B Gen II ELISA,
LOD 3 pg/mL. Nie przypisujemy tej metodzie parametrów R1 ani Labcorp.

Tabela **1C** zawiera 121 punktów wieku 0–1,20 roku, co 0,01 roku, z L/M/S
i krzywymi modelu GAMLSS. Wszystkie komórki dolnej krzywej −2 SD są puste.
Przechowujemy dokładne wartości opublikowanej górnej krzywej **+2 SD**;
autorzy opisują ją w przybliżeniu jako 97,5 centyl. Nie obliczamy brakującej
dolnej granicy, nie zastępujemy jej LOD i nie wyliczamy rozpoznania ani SDS
pacjenta z niepełnego modelu.

### Jawna polityka numeryczna aplikacji

Publikacja nie określa sposobu interpolacji siatki ani konwencji
przeliczenia dni na lata dziesiętne. Poniższe zasady są polityką aplikacji,
podlegającą akceptacji klinicznej; nie są cytatem ani instrukcją autorów:

- Wartość górnej krzywej interpolujemy liniowo pomiędzy sąsiednimi
  opublikowanymi punktami. Nie dopasowujemy nowego modelu i nie
  ekstrapolujemy poza dane.
- Dla wieku znanego w dniach punkt modelu to liczba dni / 365,25.
  Dane z pary dat kalendarzowych określają wiek kalendarzowy, nie dowodzą
  ukończenia identycznej liczby pełnych 24 godzin. Oryginalny przedział
  niepewności pozostaje w wejściu i zapisie oceny. Kwalifikacja do zakresu
  wieku jest sprawdzana oddzielnie i zachowawczo, w dniach, niezależnie
  od długości miesiąca. Różnica dat wynosząca 5 dni oznacza możliwe
  4–5 ukończonych dób i wymaga doprecyzowania; jawne 5 ukończonych dni
  kwalifikuje do profilu.
- Dla wieku tylko w latach/miesiącach nie tworzymy fikcyjnej daty urodzenia
  ani punktu środkowego. Sprawdzamy granice przedziału i węzły wewnętrzne
  krzywej; przy różnych granicach pokazujemy warianty bez wspólnego werdyktu.
- Aktywne okno ograniczamy do **od 5 ukończonych dni do <1 roku**, wewnątrz
  populacji badania. Od roku używamy katalogu dziecięcego R3. Tabela nadal
  przechowuje wszystkie 121 punktów źródłowych. Nie traktujemy publikowanych
  punktów wieku 0–5 dni jako dowodu próbek z tego okresu.
- UI zaokrągla wyłącznie opis górnej granicy modelu do jednego miejsca
  z symbolem „≈”; porównanie i snapshot zachowują pełną wartość.

Przykład: 90 dni → 90/365,25 = 0,24640657 roku. Sąsiednie punkty
0,24 → 146,389 oraz 0,25 → 145,559 pg/mL dają
**145,8572546201232 pg/mL**. Wynik 80 nie przekracza tej górnej granicy;
nie oznacza to potwierdzenia prawidłowej funkcji jajników.

### Alternatywne źródło dolnej granicy — nieaktywne

Zhou i wsp. 2025, *Reference intervals of inhibin B in Chinese children
on chemiluminescence analyzer*,
[PMID 39805980](https://pubmed.ncbi.nlm.nih.gov/39805980/),
[pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC11730302/),
DOI 10.1038/s41598-025-85551-9, tabela 3: dziewczynki **<1 roku,
13–162 pg/mL**, p2,5–p97,5; n=82. Dolna granica 13 jest estymowanym
centylem, nie LOD (LOD testu: 7 pg/mL). Jej 90% przedział ufności wynosi
3–15 pg/mL i nie stanowi dodatkowego zakresu referencyjnego pacjentki.

Oznaczenie: surowica, KAESER 1000, double-antibody CLIA, Kangran Biotech.
Rekrutacja szpitalna z kryteriami wykluczenia; bez dokładnego rozkładu
wieku niemowląt i bez określonego GA. Autorzy wskazują małe podgrupy
(poniżej 120) oraz możliwość pozostawienia osób z patologią mimo wykluczeń.
To szeroki zakres pierwszego roku, a nie odrębny RI dla 90. dnia lub
poszczególnych miesięcy minipuberty. Nie łączymy jego dolnej granicy z
górną krzywą Gen II w R2 i nie uaktywniamy automatycznie drugiego profilu
wyłącznie dlatego, że zawiera dodatnią dolną granicę.

Uzupełniający przegląd PubMed obejmuje van der Coelen i wsp. 2025,
[PMID 40651522](https://pubmed.ncbi.nlm.nih.gov/40651522/),
DOI 10.1016/j.fertnstert.2025.07.003. Tabela 2 przytacza zdrowe kontrole
Ljubičić dla 3 i 9 miesięcy z dolnym wynikiem poniżej LOD, bez liczbowego
dolnego RI. Jest to ponowne użycie grupy referencyjnej, nie niezależna
walidacja krzywej. Sam niewykrywalny wynik nie ustala niewydolności gonad.

## R3 — Labcorp: niemowlęta, dzieci i dorośli

[Labcorp 146795 — Inhibin B](https://www.labcorp.com/tests/146795/inhibin-b),
pełny katalog odczytany 2026-10-09 UTC: „Reference Range”, „Specimen”,
„Limitations”, „Methodology”. Metoda jest nazwana
**AnshLite™ Enzyme Linked Immunoassay**. Nie poprawiamy jej na CLIA.
Materiał: surowica. Jednostki wszystkich poniższych wartości: pg/mL.
Katalog nie podaje liczebności ani szczegółów doboru grup referencyjnych.

| Chłopcy/mężczyźni — zapis źródłowy | Zakres |
|---|---:|
| <12 miesięcy | 68–630 |
| 12–23 miesiące | 87–419 |
| 2–5 lat | 42–268 |
| 6–9 lat | 35–167 |
| 10 lat | 50–310 |
| 11 lat | 104–481 |
| 12–17 lat | 74–470 |
| 18–49 lat | 66,9–300 |
| >49 lat | 34,9–289,2 |

| Dziewczynki/kobiety — zapis źródłowy | Zakres |
|---|---:|
| <6 lat | <73 |
| 6–9 lat | <129 |
| 10 lat | <103 |
| 11 lat | 20–186 |
| 12–18 lat | <362 |
| Wczesna faza folikularna | <261 |
| Późna faza folikularna | <286 |
| Okres okołoowulacyjny | <189 |
| Środek fazy lutealnej | <164 |
| Koniec fazy lutealnej | <107 |
| Po menopauzie | <17 |

### Polityka wyboru katalogowych kategorii

Katalog publikuje kategorie w całych latach i miesiącach bez definicji
precyzji obliczania wieku. Jawna polityka aplikacji interpretuje te
kategorie jako **ukończone lata/miesiące**. Przykładowo „18–49” oznacza
[18,50), a „>49 ukończonych lat” zaczyna się w 50. urodziny. To nie
twierdzenie, że katalog opublikował dokładną granicę daty urodzin. Zakresy
stężeń zachowują oryginalne operatory, w tym ścisłe `<` u kobiet.

U dziewczynek używamy R3 od 1 roku, po aktywnym oknie R2. Pediatryczna
kategoria „12–18” obejmuje [12,19); dopiero od 19 lat aktywujemy fazy cyklu
lub menopauzę. Ten punkt przejścia jest polityką aplikacji ograniczającą
nakładanie kategorii, ponieważ źródło nie publikuje liczbowego początku
wierszy fazowych. Nie stwierdzamy przez to, że cykl pojawia się dopiero w
19. roku życia. Brak zweryfikowanej kwalifikacji fazowej poniżej tego wieku
pozostaje ograniczeniem tej wersji.

Wybór ogólnej fazy folikularnej daje dwa jawne warianty; lutealnej również
dwa. Nieznany kontekst daje sześć. Nie sklejamy zakresów, nie wybieramy
większej granicy i nie nadajemy wspólnego koloru. Menopauza wymaga znanego
kontekstu, nie wieku lub pojedynczego wyniku hormonu.

Męski zakres <12 miesięcy służy tylko poza [2,0;5,0] miesiąca R1.
Pozostaje **ogólnym zakresem dla niemowląt**, bez pełnej oceny dynamiki
minipuberty. Błąd kwalifikacji do R1 nie uruchamia zastępczej normy R3 dla
tego samego wieku. Zmiana źródła i metody na granicy okna jest jawna w
wyniku i zapisie; nie oznacza zmiany stężenia pacjenta.

## Donoszenie, rzeczywista metoda i brakujące dane

Pierwszoroczne porównania są orientacyjne i ograniczone do donoszonych
niemowląt. R1 publikuje GA 37+0–41+6. Dla R2 i szerokiego R3 ten sam
przedział jest zachowawczą **polityką aplikacji**, nie granicą liczbową
wydrukowaną w tych źródłach. Nie stosujemy ograniczeń Greaves dla LH/FSH.

- Znane GA spoza 259–293 dni albo niepewny przedział przecinający granicę
  nie kwalifikuje niemowlęcia do tych profili.
- Przy braku GA jawna deklaracja „Urodzenie przedwcześnie: Nie” pozwala
  jedynie na warunkowe porównanie źródłowe dla donoszonych niemowląt.
  Nie ustala dokładnego GA ani nie wyklucza porodu po terminie; zapis
  zachowuje `term_birth_unconfirmed`. To świadomie ograniczona polityka
  szybkiego porównania. Znane sprzeczne GA ma pierwszeństwo nad deklaracją.
- Brak zarówno danych urodzeniowych, jak i odpowiedzi wymaga uzupełnienia
  tego jednego kontekstu. Nie oznacza „Nie”. Znane wcześniactwo nie dostaje
  norm donoszonych. Dokładnych tygodni GA nie wymagamy od każdego użytkownika.

`referenceSelection.mode='automatic'` wybiera źródło, nie ustala metody
rzeczywistej próbki. `referencePreview.kind='automatic-source-reference'`
przechowuje porównanie; `biochemical.primary=null`, bez potwierdzonej
laboratoryjnej klasyfikacji. Znana niezgodna metoda lub materiał, stymulacja
i znane leczenie hormonalne wykluczają niedopasowane porównanie.

Zależność od metody potwierdzają pełny
[Randolph 2014, DOI 10.1093/humrep/det447](https://pmc.ncbi.nlm.nih.gov/articles/PMC3923509/)
i [informacja Cleveland Clinic o zmianie metody](https://clevelandcliniclabs.com/february-2021-inhibin-b-changes-to-reference-ranges/).
Nie stosujemy przeliczników regresyjnych pomiędzy kitami. Jednostki
**1 pg/mL = 1 ng/L** wynikają z jednostek masy i objętości; nie są konwersją
między metodami. Wyniki `<x`, `≤x`, `>x`, `≥x`, `<LOD` i `<LOQ` zachowują
operator; cenzorowanego wyniku nie rysujemy jako dokładnego punktu.

## Luki i materiały potrzebne do dalszego rozszerzenia

- **Dolna granica u dziewczynek w minipuberty:** pełne PDF Crofton 2002
  i Bergadá 2002 dostarczone przez właściciela przeczytano 2026-10-09,
  sprawdzając też obrazy tabel. Nie dostarczają liczbowego dolnego RI
  dla konkretnego dnia/miesiąca minipuberty. Szczegóły poniżej.
  Pełny Chada 2003 (PMID 12790766, tabela 2) podaje jedynie min–max
  w pięcioosobowych grupach 0–3 i 4–6 miesięcy; obserwowanego minimum
  nie uznajemy za dolny centyl referencyjny.
- **Pełna krzywa chłopców w pierwszym roku:** Busch i wsp. 2022,
  [DOI 10.1210/clinem/dgac115](https://doi.org/10.1210/clinem/dgac115),
  [pełny tekst](https://academic.oup.com/jcem/article/107/6/1560/6539293).
  Artykuł i dostępne suplementy przeczytano. Brakuje liczbowej tabeli
  krzywych lub współczynników LMS **inhibiny B**; suplement S1 dotyczy
  INSL3. Ponowne przesłanie samego PDF nie uzupełni tej luki. Nie
  odczytujemy norm z ryciny.
- **Stadium u chłopców:** Andersson 1997,
  [DOI 10.1210/jcem.82.12.4449](https://doi.org/10.1210/jcem.82.12.4449),
  pełny tekst autora odczytany, tabela 1, s. 3979. Przedziały I–V wynoszą
  35–182, 62–338, 78–323, 67–304, 95–323 pg/mL. To **p5–p95**, centralne
  90%, nie 95%; zdrowi chłopcy 6–20 lat, Groome EIA, LOD 18. Tabela mówi
  o Tannerze, bez jednoznacznego wskazania G względem PH. Dalszy opis tej
  samej kohorty Juul 2006 (DOI 10.1111/j.1365-2605.2005.00556.x) rozróżnia
  obie skale, ale nie rozstrzyga zmiennej tabeli Anderssona. Nie mapujemy
  automatycznie na G. Potrzebne potwierdzenie definicji lub pełny Crofton
  2002, [DOI 10.1046/j.0300-0664.2001.01448.x](https://doi.org/10.1046/j.0300-0664.2001.01448.x),
  do niezależnej weryfikacji tabeli/metody/stadium.
- **Stadium u dziewczynek:** potrzebne pełne tabele i metody Sehested 2000,
  [DOI 10.1210/jcem.85.4.6512](https://doi.org/10.1210/jcem.85.4.6512).
  Dostarczony Crofton 2002 rozróżnia B1, B2 i połączone B3–5, lecz
  jego tabela 2 podaje medianę i IQR, nie RI; część grup obejmuje
  leczenie GH. Nie nadaje się do bezpośredniego utworzenia norm Th1–Th5.
- **Wcześniaki:** potrzebne pełne teksty/metody/tabele Kuiri-Hänninen 2018,
  [DOI 10.1111/cen.13716](https://doi.org/10.1111/cen.13716), i Chellakooty
  2003, [DOI 10.1210/jc.2002-021468](https://doi.org/10.1210/jc.2002-021468).
  Trzeba sprawdzić, czy w ogóle zawierają RI, a nie same średnie, rozrzuty
  albo porównania populacji. Brak zgody na tworzenie RI z tych statystyk.

Pełny lifespan Borelli-Kjær 2025,
[DOI 10.1210/clinem/dgae439](https://doi.org/10.1210/clinem/dgae439),
i suplement [10.6084/m9.figshare.26056558.v1](https://doi.org/10.6084/m9.figshare.26056558.v1)
również przeczytano. Nie zawierają tabel parametrów LMS ani przedziałów
referencyjnych G/Th; mediany i rozrzuty punktów nie zastępują RI.

### Wynik analizy dostarczonych PDF

**Crofton 2002:** *Dimeric inhibins in girls from birth to adulthood:
relationship with age, pubertal stage, FSH and oestradiol*, Clinical
Endocrinology 56:223–230,
[PMID 11874414](https://pubmed.ncbi.nlm.nih.gov/11874414/),
DOI 10.1046/j.0300-0664.2001.01449.x. Na s. 227, tabela 1, inhibina B
ma wspólną grupę **0–6 lat**, n=105, p2,5–p97,5 **<8,0–72,7 ng/L**;
37/105 próbek (35%) było poniżej przyjętej granicy wykrywalności.
Nie jest to dodatnia dolna norma 8,0. Osobny wiersz **<0,25 roku,
n=14 dotyczy inhibiny A**, a nie B. Nie przenosimy go na minipuberty B.

Materiał w Crofton: osocze. Swoisty double-antibody ELISA wg Groome,
standard immunooczyszczony, skalibrowany wobec rekombinowanej inhibiny B
Genentech. Na s. 225 czułość analityczna wynosi 5 ng/L, zaś operacyjny
próg wykrywalności 8 ng/L. Wyniki poniżej progu zastępowano nim w analizie
statystycznej; to nie podstawa do nadania pacjentce dokładnego wyniku 8.
Przedziały stadiowe na s. 227 są medianami i IQR, z B3–5 połączonymi
i z leczeniem GH w części grup B1/B3–5. Nie tworzymy z nich RI.

**Bergadá 2002:** *High serum concentrations of dimeric inhibins A and B
in normal newborn girls*, Fertility and Sterility 77:363–365,
[PMID 11821098](https://pubmed.ncbi.nlm.nih.gov/11821098/),
DOI 10.1016/S0015-0282(01)02965-X. Tabela 1 na s. 364 podaje
**średnie ± SE**, m.in. 177,2 ±32, 213,9 ±45 oraz 88,6 ±19 pg/mL
w grupach n=14/10/7; nie są to dolne/górne RI. Rycina 1 przedstawia
indywidualne wyniki oraz średnie, bez krzywych referencyjnych.

Cała próba: 31 dziewczynek, wiek w abstrakcie/metodach 4–65 dni;
przypis tabeli podaje 4–14, 17–25 i 31–60 dni, więc zapis wieku jest
niespójny. W każdym wariancie **90 dni wykracza poza badaną populację**.
Surowica, swoisty two-site ELISA wg Groome, standardy rekombinowane
Genentech, czułość inhibiny B 15 pg/mL. Artykuł nie potwierdza kitu Gen II,
GA ani statusu donoszenia. Nie ekstrapolujemy średnich na 90. dzień
i nie przeliczamy SE na nową normę.

### Gueguen 2025: progi diagnostyczne, bez nowego RI

Pełny PDF właściciela **Gueguen i wsp. 2025**, *Inhibin B and AMH for
Diagnosis of Hypogonadotropic Hypogonadism in Boys Under 1 Year of Age:
A Case-control Study*, JCEM 110:e4119–e4128,
[DOI 10.1210/clinem/dgaf219](https://doi.org/10.1210/clinem/dgaf219),
oraz [suplement v1](https://doi.org/10.6084/m9.figshare.28773545.v1)
przeczytano 2026-10-09. Tabelę 3 zweryfikowano również wizualnie.
Badanie dotyczy **progów różnicowania CHH u wybranych chłopców**,
nie przedziałów referencyjnych zdrowej populacji.

Retrospektywna kohorta siedmiu ośrodków obejmuje 138 chłopców z
mikropenisem i/lub wnętrostwem: 58 z izolowanym CHH, 32 z CHH w ramach
wielohormonalnej niedoczynności przysadki i 48 kontroli z idiopatycznymi
objawami genitalnymi. Kontrole również nie stanowią próby zdrowych dzieci;
wykluczono m.in. pierwotną niewydolność jąder (FSH >4,5 IU/L podczas
minipuberty), DSD i ciężkie zespoły wad. Kryteria rozpoznania wykorzystują testosteron we wczesnej
minipuberty. Nie ma niezależnej kohorty walidacyjnej; autorzy wymagają
potwierdzenia progów w takiej kohorcie.

Tabela 3, s. e4125–e4126, **pg/mL**, czułość/swoistość z 95% CI:

| Wiek (dni) | Cel doboru progu | Próg | Czułość % (95% CI) | Swoistość % (95% CI) |
|---|---|---|---|---|
| 1–4 | Najwyższa czułość | <150 | 100 (70–100) | 75 (41–96) |
| 1–4 | Najwyższa swoistość | <85 | 89 (57–99) | 100 (68–100) |
| 15–65 | Najwyższa czułość | <190 | 98; CI w druku „88–1.0” | 85 (68–94) |
| 15–65 | Najwyższa swoistość | <100 | 82 (69–91) | 100 (88–100) |
| 66–179 | Najwyższa czułość | <180 | 100 (81–100) | 80 (49–96) |
| 66–179 | Najwyższa swoistość | <130 | 81 (57–93) | 100 (72–100) |
| 180–365 | Oba cele | 100; brak operatora w tabeli | 100 (68–100) | 100 (74–100) |

Nie uzupełniamy luki **5–14 dni**, nie przeliczamy progów na wiek
skorygowany i nie tworzymy z nich profilu wcześniaczego. Część badanych
urodziła się przedwcześnie, ale brak progów według GA. Liczba kontroli
w całym okresie 66–179 dni wynosi tylko 10; tabela ROC nie podaje osobnych
mianowników oznaczeń inhibiny B. Obserwowana swoistość 100% nie oznacza
100% prawdopodobieństwa CHH ani pewności działania w innej populacji.

Metody inhibiny B: Oxford Bioinnovation/DSL, zestaw **MCA1312KZZ**,
czułość 6 pg/mL, oraz Ansh Labs **AL-107**, czułość 7 pg/mL. Autorzy
deklarują podobną wydajność tych dwóch metod, co nie ustanawia zamienności
z każdym innym testem. Nie łączymy tych progów z krzywą Gen II ani
z katalogowym zakresem AnshLite w jedną normę.

Ograniczenia zapisu źródła wymagające zachowania przy przyszłej pracy:

- Tabela 2 błędnie oznacza inhibinę B jako **ng/mL**; metody i tabela 3
  podają pg/mL. Nie stosować mnożnika 1000 do liczb z tej tabeli.
- Dla progu <130 tabela/dyskusja podają czułość 81%, tekst wyników 82%.
  Powyżej zachowano wartości tabeli i jawnie wskazano niepoprawny zapis
  CI przy progu <190.
- Dla okresu 180–365 tabela drukuje samą liczbę 100, bez `<`/`≤`.
  Opis metod mówi o wartości poniżej progu, ale nie rozstrzyga bezpiecznie
  granicy dokładnie 100 dla implementacji. Nie domyślamy operatora.
- Mediany i p5–p95 kontroli w tabeli 2 opisują wyselekcjonowaną grupę
  kliniczną. Szare zakresy ryciny 2 pochodzą z innych publikacji;
  nie odczytujemy z obrazu nowych granic referencyjnych.

**Decyzja dla obecnej wersji:** źródło dokumentujemy, bez aktywowania
nowych progów w silniku. Chłopiec w wieku 90 dni z inhibiną B 80 pg/mL
spełnia próg <130; przy mikropenisie/wnętrostwie może to wspierać potrzebę
diagnostyki CHH, ale sam wynik go nie rozpoznaje. Dla **dziewczynki
w wieku 90 dni** badanie nie ma zastosowania i nie uzupełnia dolnej normy.
Ewentualna przyszła wskazówka diagnostyczna wymaga osobnej akceptacji
klinicznej, jawnej populacji docelowej oraz oddzielenia od osi RI.

## Architektura, historia i regresje

- `vilda_lab_inhibin_b_data.js`: jawne normy, źródła, siatka krzywej i
  wersjonowane reguły doboru.
- `vilda_lab_inhibin_b.js`: osobny czysty silnik. Współdzieli wyłącznie
  publiczne narzędzia wieku i porównania przedziałów LH/FSH; nie wywołuje
  jego oceny czasu pokwitania ani rozpoznań.
- `vilda_lab_puberty_ui.js` i HTML przelicznika: ograniczone ponowne użycie
  formularza z routingiem po analicie, bez aktywowania zbędnego Tannera.
- `vilda_lab_snapshot.js` i `vilda_lab_assessment_ui.js`: wspólny transport
  i osie, jednostki sprawdzane osobno dla analitu. LH/FSH nadal przyjmują
  wyłącznie swoje jednostki.
- `lab_units_data.js`: czytelny fragment inhibiny zachowuje wyszukiwanie
  i konwersję, bez dawnych norm i rozpoznań. Inne anality nie są zmieniane.

Przypięcie, wizyta i historia przechowują surowy wynik, operator, jednostkę,
użyty kontekst, granice, źródło, metodę źródła, ograniczenia i wersje.
Historia nie uruchamia dzisiejszego silnika. Starszym zapisom bez oceny
nie dopisujemy nowego RI; zachowują swój zapis i konwersję. Zmiana osoby
czyści lokalny wynik i korekty, także przy opóźnionym odczycie źródła.

Syntetyczne przypadki regresyjne rzeczywistego silnika obejmują m.in.:

| Wejście | Oczekiwane porównanie źródłowe |
|---|---|
| M, 90 dni, zadeklarowane bez wcześniactwa, 350 pg/mL | Johannsen 229–631; w zakresie |
| M, 90 dni, GA 30+0 | Brak RI dla wcześniaka; bez normy dorosłych |
| F, 90 dni, zadeklarowane bez wcześniactwa, 80 ng/L | Górna krzywa ≈145,9 pg/mL; bez dolnej normy |
| F, 90 dni, wynik `<LOD` | Brak dokładnego punktu i liczby podstawionej za LOD |
| M, 5 lat, 100 pg/mL | Labcorp 42–268 |
| M, 35 lat, 150 pg/mL | Labcorp 66,9–300 |
| M, 75 lat, 150 pg/mL | Labcorp 34,9–289,2 |
| F, 35 lat, kontekst nieznany | Sześć wariantów bez wspólnego werdyktu |
| F, 35 lat, po menopauzie, 17 pg/mL | Powyżej ścisłej granicy `<17` |
| Brak wieku/płci | Brak RI, działające przeliczenie jednostek |

Przypadki graniczne sprawdzają 3,5/5 miesięcy, początek/koniec aktywnej
krzywej, urodziny kategorii katalogowych, konflikty GA/PNA, nieprecyzyjny
wiek, znane leczenie, metodę i materiał, niezależność danych źródłowych,
operatorów oraz zapis bez ponownego liczenia. UI wymaga weryfikacji
desktop/mobile 320 px, animacji i reduced motion, przełączania pacjentów,
przypięcia/historii oraz rzeczywistego offline. Wyniki końcowych kontroli
podaje PR dla jego dokładnego SHA.

## Ślad weryfikacji źródeł

Pełne artykuły i katalog pozostają poza publicznym repozytorium. Hash
identyfikuje konkretny odczyt, nie zastępuje cytowania:

| Dowód | SHA-256 |
|---|---|
| R1, pełny HTML | `58f117a94ad1b37de4dfd5f649c0af12b6198bff89a287bbd8cdfe9ff708415b` |
| R2, pełny HTML | `5ab2b805ae6ae82c8c0280150db4ce5a0650c65c9e65801181c46ea2f01df465` |
| R2, oryginalny suplement DOCX v1 | `f440f7e4ef2b3e7f06d3a538dd56df3529c71f6e83dfb7a22e7affc518f04297` |
| R3, pełny HTML | `fe6f3e5c913b6cce63d936e6396eff852a6bee5b83168da23aef23c452df73f8` |
| Crofton 2002, PDF właściciela | `a1cfb39a440cb09bc15ddae664b15e80513d34b7e21aca5e2a6ccfdacf5215e9` |
| Bergadá 2002, PDF właściciela | `d5a19ef5c10d89c72c78c1b4f8f03bf0e3bbcad61d5474b189bdef92dbb59cd7` |
| Gueguen 2025, PDF właściciela | `4ec70fe032f1947a6c6f9b05f98c8b5563572962561ef2ae8a4827d9c5c06d14` |
