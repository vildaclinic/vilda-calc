# TT dziewcząt od 6 miesięcy do <6 lat — mediana grupy wieku

Rozszerzenie osobnej karty [TT dziewcząt według wieku](FEMALE_TT_AGE.md),
po audycie źródłowym z 28 października 2026 i akceptacji makiety przez
właściciela. Końcowa decyzja brzmi: „wracamy do twojej pierwotnej
koncepcji […] koduj z twoją pierwotną koncepcją”. Dotyczy źródła Kushnir,
oddzielnych median grup oraz pierwotnego wyraźnego wyróżnienia wyniku
powyżej zakresu. Późniejsze warianty A/B/C nie są ustawieniami produktu.

To zmiana dostępnej informacji medycznej: pacjentka w wieku od 6
miesięcy do <6 lat otrzymuje przybliżone odniesienie grupy, którego
wcześniej nie było. Nie dodaje nowego zakresu referencyjnego, SDS,
centyla pacjentki ani rozpoznania. Istniejące Mayo RI i ich werdykty,
konwersje jednostek, model Madsen 6–18 oraz historia wyników pozostają
odrębnymi warstwami. Akceptacja nie jest walidacją kliniczną.

## Pełne źródło i odczyt

Kushnir MM, Blamires T, Rockwood AL i wsp. *Liquid Chromatography–Tandem
Mass Spectrometry Assay for Androstenedione, Dehydroepiandrosterone,
and Testosterone with Pediatric and Adult Reference Intervals.*
Clinical Chemistry 2010;56(7):1138–1147.
DOI [10.1373/clinchem.2010.143222](https://doi.org/10.1373/clinchem.2010.143222).

Audyt obejmował pełny, końcowy PDF czasopisma: 10 stron, metody,
tabele, ryciny, dyskusję i piśmiennictwo. SHA-256:
`25132120d7379f5d1e94dc6a6381e4de6550d901121afcd70b3bd987d457442d`.
Weryfikowane mediany pochodzą z **ryciny 4A, drukowana strona 1146**
(strona PDF 9, indeks 8), z wypełnionych trójkątów `Te` dla dziewcząt.
Rycina 4C dotyczy chłopców i nie jest źródłem żeńskich wartości.
Podpis autorów mówi o medianach grup, nie średnich, przedziałach
referencyjnych lub modelu dokładnego wieku.

Oryginał nie zawiera liczbowej tabeli tych sześciu rocznych median.
Kontrolowany odczyt używał wektorów PDF: osi o indeksie rysunku 105
oraz trójkątów 134–139, z punktem 140 (6–7 lat) wyłącznie jako kontrolą.
Współrzędne i kalibrację zapisano w [sanityzowanym dowodzie](evidence/female-tt-under6-kushnir2010-audit-2026-10-28.json).
Nie publikujemy całego pliku wydawcy ani zrzutów indywidualnych wyników.

Oś jest liniowa w µg/L. Główny odczyt używa środka prostokąta
ograniczającego trójkąt i końców osi 0/0,8; dodatkowo porównano
kalibrację wszystkich pięciu kresek oraz centroid trójkąta. Odczyt
zaokrąglono orientacyjnie do 5 ng/L. Rozrzut między konwencjami,
kalibracją, zaokrągleniem i grubością kreski, z uwzględnieniem reszty
kalibracji, daje konserwatywną ocenę do około **±9 ng/L**
(około **±0,03 nmol/L**). To ocena wrażliwości odczytu grafiki,
**nie przedział ufności, błąd biologiczny, CV metody lub walidacja
modelu**. Dokładne wektory nie czynią przybliżonej ryciny tabelą
stężeń z dowolną liczbą cyfr.

## Populacja i ograniczenia oznaczenia

- Dziewczęta z kohorty publikacji; młodsze dzieci od 6 miesięcy do 6
  lat rekrutowano przed zabiegami planowymi i pobierano po indukcji
  znieczulenia. Nie miały znanych chorób ani leków na receptę.
- Surowica, derywatyzacja hydroksyloaminą i dwuwymiarowa LC-MS/MS.
  Badana zgodność surowicy i osocza nie ustanawia nowego osoczowego
  profilu dla pacjentki. Metoda źródła nie potwierdza jej metody.
- LOD TT **5 ng/L**, LOQ **10 ng/L**; kryteria LOQ obejmowały CV <20%
  i dokładność ±15%. Przybliżone centralne odczyty 20–30 ng/L leżą
  ponad źródłową LOQ, lecz nie dowodzi to braku cenzurowania każdej
  obserwacji. Reguł postępowania z każdym niskim wynikiem nie podano.
- Autorzy omawiają 24 nieoczekiwanie wysokie wyniki TT w łącznej
  młodszej kohorcie i możliwy wpływ stresu/znieczulenia. Dodatkowy
  centralny 90-procentowy RI nie jest opublikowaną poprawioną medianą.
  Nie usuwamy obserwacji ani nie obliczamy własnej mediany.
- Liczebności dziewcząt w tabeli 2 dotyczą innych grup: 6–24 miesiące
  N=92, 2–3 lata N=126, 4–5 lat N=127, 6–7 lat N=131. Nie przypisujemy
  ich do poszczególnych rocznych znaczników ryciny. N każdego z tych
  sześciu rocznych odczytów pozostaje nieustalony.
- Kryteriów GA i osobnego modelu wcześniactwa nie podano. Wiek
  chronologiczny nie jest zamieniany na skorygowany, PNA lub PMA.
- To grupy wieku, bez ustalenia Th1 na podstawie samego wieku.
  Ocena Tannera starszych dzieci w tej publikacji nie oznacza, że
  sześć młodszych grup jest zdefiniowaną kohortą Th1.

## Dane i kwalifikacja

Osobne `female-tt-under6-data.json` i `female-tt-under6-policy.json`
stanowią jawne wejście do `VildaFemaleTTAge.evaluate(data, policy,
context)`. Wersjonowane dane źródła są oddzielone od polityki routingu
oraz renderera. Dotychczasowe `female-tt-age-data.json` i polityka
Madsen zachowują 13 węzłów i interpolację PCHIP.

| Etykieta autorów | Przedział aplikacji | Przybliżony odczyt ng/L | Równoważne nmol/L przed formatowaniem | Podpis nmol/L |
| --- | --- | ---: | ---: | ---: |
| 6 months to 1 year | [6 miesięcy, 1 rok) | 20 | 0,06934 | ≈0,07 |
| 1 to 2 years | [1,2) lat | 20 | 0,06934 | ≈0,07 |
| 2 to 3 years | [2,3) lat | 20 | 0,06934 | ≈0,07 |
| 3 to 4 years | [3,4) lat | 25 | 0,086675 | ≈0,09 |
| 4 to 5 years | [4,5) lat | 30 | 0,10401 | ≈0,10 |
| 5 to 6 years | [5,6) lat | 30 | 0,10401 | ≈0,10 |

`1 ng/L = 1 pg/mL`. Do przeliczeń służy istniejący moduł TT, w którym
1 pg/mL odpowiada 0,003467 nmol/L. Dodatkowe cyfry w kolumnie technicznej
są dokładną konwersją **przybliżonego** odczytu, nie dodatkową
precyzją medyczną. Nie dodano nowego współczynnika.

Półotwarte granice są jawną decyzją aplikacji. Nie zostały odzyskane
jako nierówności autorów z samych etykiet ryciny. Dolna granica to
**sześć ukończonych miesięcy kalendarzowych** w bieżącym kontekście
wieku; nie arbitralny nowy próg w dniach. Cały znany przedział wieku,
z jego otwartym lub zamkniętym końcem, musi zmieścić się w **jednej**
grupie. Przykładowo `[3,4)` pasuje, `[3,4]` oraz przedział 3,9–4,1
nie pasują do jednej grupy. Nie wyznaczamy nowego DOB, dnia, środka
wieku ani mediany dla samej dostępnej części przedziału.

Adapter zachowuje przedział miesięcy kalendarzowych z rzeczywistego
resolvera TT także wtedy, gdy podano tylko liczbę dni od urodzenia.
Nie zastępuje go ilorazem dni i długości roku z ogólnego wykresu
edukacyjnego. Na przykład 183 podane dni bez dat kalendarzowych dają
w resolverze TT niepewny przedział 5–<7 miesięcy: nowa mediana nie jest
wtedy dostępna. To przykład regresyjny istniejącego resolvera, nie nowy
próg kwalifikacji zdefiniowany w dniach.

Od 6 lat automatycznie obowiązuje dotychczasowy model Madsen, przy
jego własnej pełnej kwalifikacji [6,18]. Nie rysujemy mostu między
około 0,10401 przed 6 lat a P50 Madsen 0,055406420261450574 przy 6.
Różnica badań nie jest nagłym fizjologicznym spadkiem w dniu urodzin.
Punkt kontrolny Kushnir 6–7 lat nie zastępuje Madsena. Poniżej 6
miesięcy pozostaje dotychczasowy brak tej mediany i odroczona decyzja
źródłowa dotycząca niemowląt; wynik i przeliczenia nie znikają.

Wymagane są aktualny kontekst pacjentki, prawidłowy analit/płeć,
gotowe źródło i znana pełna reprezentacja wieku. Zwykłe widoki „Całe
życie”/wieku, bez porównania płci, zachowują dotychczasowe bramki karty.
Znana terapia hormonalna, OCP, GnRHa, androgeny, stymulacja, ciąża
lub niezgodna metoda/materiał wstrzymują porównanie według polityki
produktu; nie każda z tych konserwatywnych bramek jest literalnym
kryterium autorów. Nieznany wywiad nie oznacza braku leczenia.
Nie dodajemy pytań o metodę, materiał, Th/P lub wybór publikacji.

Zmiana osoby, płci, analitu, kontekstu, blokada lub odtworzenie historii
usuwa poprzednie liczby i ostrzeżenie. Dzisiejszy wiek nie jest
przypisywany dawnej próbce. Ta mediana, krotność i stan wykresu nie
są dopisywane do historii, migawki laboratoryjnej lub synchronizacji.

## Wykres, wynik i zakres są oddzielone

W młodszej karcie sześć jasnych punktów przedstawia **mediany grup
wieku** na osi kategorii. Wynik pacjentki i mediana wybranej grupy
są w tej samej kolumnie i jednostce. Pozioma pozycja nie staje się
nową medianą dokładnego dnia. Nie ma linii łączącej grupy, schodków
lub przedłużenia do Madsena. Wybrana grupa ma jawny podpis, np.
„Mediana grupy wieku · 3–<4 lata”.

Stała oś stężeń młodszej karty wynosi **0–0,8 nmol/L**. Starsza karta
zachowuje **0–1,2 nmol/L**. To skale prezentacji, nie zakresy normy.
Wynik, obecność innych hormonów lub rozmiar ekranu nie dostosowują
maksimum. Czerwony znacznik to rzeczywisty dokładny wynik, jasny to
przybliżona mediana. Zero jest na osi. Nierówności i `<LOD`/`<LOQ`
nie są pojedynczym stężeniem i nie otrzymują dokładnej kropki.

Pierwotne wyraźne wyróżnienie korzysta wyłącznie z istniejącego
bieżącego `referencePreview.byAge.status === 'above'` i górnej granicy
tego samego zakresu Mayo. Panel nad wykresem podaje „Powyżej zakresu
referencyjnego”, wynik/jednostkę, górną granicę i dla dokładnego wyniku
przybliżoną krotność tej granicy. Nie dodaje progu „znacznego
przekroczenia”, diagnozy, oceny pilności ani werdyktu z mediany.

Gdy wynik jest ponad osią, ma większą strzałkę oraz swoją prawdziwą
wartość z podpisem „ponad skalą wykresu”. Samo wyjście ponad skalę nie
włącza czerwonego panelu klinicznego: np. 12-letnia pacjentka z TT
1,50 nmol/L może pozostawać w odrębnym Mayo RI, mimo osi kończącej
się przy 1,2. Dla pewnego `above` przy `>…` panel zachowuje operator,
lecz nie podaje dokładnego punktu lub dokładnej krotności. Nieokreślony
status przy `<…` nie jest zmieniany na przekroczenie na podstawie
samej liczby granicznej.

Wynik, zakres i konwersje mają **2 miejsca po przecinku**, z wyjątkiem
**ng/mL — 3 miejsca** (np. 0,05 nmol/L → 0,014 ng/mL). Znak `≈`
pozostaje przy przybliżonej medianie i krotności. Mała dodatnia wartość,
która po takim formatowaniu wyglądałaby jak dokładne zero, zachowuje
zapis naukowy. Formatowanie nie zastępuje pełnej wartości w obliczeniach,
werdykcie, współrzędnych lub kolejnej zmianie jednostki. Pole wejściowe
może zachować dodatkowe cyfry rzeczywiście podane przez lekarza.

## Dlaczego pozostałe źródła nie są aktywowane

Holmes 2021 ([DOI 10.1016/j.jmsacl.2021.10.005](https://doi.org/10.1016/j.jmsacl.2021.10.005))
ma rzeczywiste opublikowane predykcje P50 modelu około 0,05 nmol/L
w młodszych grupach. Nie są empirycznymi medianami roczników. 0,05
jest granicą kalibracji/raportowania, a nie ustaloną w audycie LOD lub
LOQ; w danych autorów 35/58 wyników dziewcząt 1–<6 jest na tej granicy
lub poniżej. Brak wyjaśnienia obsługi tych niskich wartości i uboga
próba niemowlęca ograniczają wybór jako pierwszego źródła. To nie
jest dowód imputacji ani stwierdzenie, że model jest fałszywy.

Kulle 2010 ([DOI 10.1210/jc.2009-1670](https://doi.org/10.1210/jc.2009-1670))
zawiera empiryczne mediany grup, lecz dotyczy osocza, ma małe grupy
i wartości przy LOQ 0,1 nmol/L. Dla 1–3 lat tabela 3 podaje N=9,
a Methods N=8. Pooled P1 <8 lat nie jest medianą dokładnego wieku
ani automatycznie definicją Th1. Źródło pozostaje porównaniem
pomocniczym. Nie uśredniamy badań, nie dopasowujemy własnego modelu,
nie tworzymy median z granic RI i nie wypełniamy luki przed 6 miesiącami.

## Przypadki rzeczywistych funkcji i wymagana regresja

| Fikcyjne wejście | Oczekiwane zachowanie |
| --- | --- |
| F, 3 lata 1 miesiąc, TT 0,30 nmol/L | Grupa 3–<4; mediana 0,086675, podpis ≈0,09 nmol/L; punkt 0,30; niezależny Mayo `within` |
| Ta sama pacjentka, TT 1,50 nmol/L | Ta sama mediana i oś; istniejący Mayo `above`, górna 0,6934; panel z ≈2,16 × górna granica; strzałka ponad osią 0,8 |
| TT 0,75 nmol/L u F3 | `above` według Mayo, wyróżniony punkt w osi; brak mylenia górnej osi 0,8 z normą 0,6934 |
| F12, TT 1,50 nmol/L | Dotychczasowy Madsen i oś 1,2; strzałka ponad osią; brak `above` tylko z powodu skali |
| Wiek 6 miesięcy / 5 miesięcy | Pierwszy kwalifikuje po spełnieniu całego przedziału, drugi nie otrzymuje nowej mediany |
| Tylko 183 dni od urodzenia, bez dat kalendarzowych | Adapter zachowuje niepewny przedział 5–<7 miesięcy z silnika TT; bez nowej mediany |
| [5,6) / dokładne 6 / [5,6] | Pierwszy: Kushnir ≈0,10; drugie: Madsen 0,055406420261450574; ostatni nie mieści się w jednej grupie Kushnir |
| Znany przedział 3,9–4,1 | Bez zastępczej mediany, średniej grup lub wyboru środka wieku |
| `>1,50` / `<1,50` u F3 | Operator zachowany, bez dokładnego punktu i krotności; tylko istniejący pewny `above` otrzymuje panel |
| Wynik → zmiany jednostek → powrót | Ta sama pełna wartość, status i geometryczne położenie; zmienia się tylko jednostka/podpis |
| Inna osoba/płeć/analit, blokada, dawna wizyta lub znane wyłączenie | Bez poprzedniej mediany, punktu i panelu; bez nowego zapisu lub ponownej oceny historii |

Regresje wywołują rzeczywistą funkcję produkcyjną, a UI/adapter korzysta
z realnego silnika TT i jego zakresu. Kontrole obejmują wszystkie sześć
grup i granice, jednostki, nierówności, pełny przedział wieku,
wyłączenia i zmianę tożsamości, niezmienione 13 P50 Madsen i Mayo,
desktop/320/390 px, pełny ekran oraz prawdziwą aktualizację i zimny
restart PWA offline. Konkretne wykonane wyniki podaje PR po zakończeniu
kontroli; dokument nie przedstawia planowanych testów jako wykonanych.
