# Pokrycie odniesień hormonalnych — audyt 18 października 2026

Stan po scaleniu PR [#716](https://github.com/vildaclinic/vilda-calc/pull/716),
sprawdzony na `audyt` `d3a64f232556fec6068385da00f5139b8ec17cfb`.
Dane punktu pacjenta: **82 profile, `2026-10-18.3`**.
Ten dokument aktualizuje rejestr pracy; **nie dodaje ani nie zatwierdza
nowych odniesień klinicznych**. Starsze wpisy etapowe w
[PATIENT_POINT.md](PATIENT_POINT.md) opisują stan w chwili danego wdrożenia.

Uzupełnienie 19.10.2026: osobny PR kwalifikacji laboratoryjnego E2 usuwa
opisany niżej domysł fazy folikularnej. Nie zmienia 82 profili ani zapisu
kontroli z 18.10. Szczegóły: [E2 — kontekst cyklu](../E2_CYCLE_CONTEXT.md).

## Co oznacza „luka”

Rozróżniamy zwykły liczbowy punkt na osi wieku, osobne zestawienie
grupowe/fazowe/stadium, zakres referencyjny laboratoryjny (RI) oraz samą
ilustrację. Brak pierwszego nie dowodzi braku pozostałych. Średnia,
mediana, RI i przedział ufności nie są zamienne.

Przegląd wywołuje rzeczywisty silnik produkcyjny i jego eksport
przeglądarkowy, z granicami profili, węzłami i sąsiednimi wartościami wieku.
Osobno sprawdzono porównania, panel seniorów, Xu i interpretację
laboratoryjną. [Zapis kontroli](evidence/reference-coverage-audit-2026-10-18.json)
podaje wersje, hashe wejść, domeny i wybrane odpowiedzi silników.
To kontrola techniczna pokrycia, nie walidacja kliniczna źródeł.

W tabeli wiek jest dokładny. Nawiasy `[]` włączają granicę, `()` ją
wyłączają. Dzień źródłowy przeliczamy przez 365,25 dni/rok; żeńskie
`0,02 roku` oznacza dokładnie 7,305 dnia, nie 7 dni. Szeroki wpis
„18 lat 0 miesięcy” może oznaczać przedział, a nie dokładne 18 lat.
Cały możliwy wiek musi pasować; nie wybieramy jego środka.

## Zwykły punkt na osi wieku

Zakresy poniżej opisują możliwe dopasowanie przy kwalifikującym kontekście.
Donoszenie niemowlęcia oraz G1/Th1 wymagane przez Zec są jawnymi danymi
syntetycznych prób, nigdy wnioskiem z wieku. Znany niezgodny materiał,
metoda lub kontekst kliniczny mogą wyłączyć punkt również w tych zakresach.

| Analit | Chłopcy / mężczyźni | Dziewczęta / kobiety | Co pozostaje poza tym punktem |
|---|---|---|---|
| LH | [7,243] dni; [6,89] lat | [0,02;1] roku; [6,16] lat | M: po 243. dniu do <6 lat, >89 lat. F: >1–<6 i >16 lat. Niemowlęca część M po 243. dniu jest blokadą jakości/oznaczalności istniejącego odczytu, nie brakiem całej publikacji. |
| FSH | [7 dni,80 lat] | [0,02;19) lat | M >80; F ≥19. Wiek 1–<6 wymaga odpowiednio G1/Th1. Dorosłe kobiety mają osobne odniesienia fazowe/menopauzalne. |
| AMH | [7 dni,70 lat] | [0,02;46) lat | M >70; F ≥46 nie ma zwykłej mediany wieku. Xu udostępnia odrębne punkty P50 35/40/45/50/55. |
| Inhibina B | [7 dni,80 lat] | [0,02;47] lat | M >80 ma do 101 lat osobny aktywny panel średnich Baccarelli. F >47 to koniec zatwierdzonego odczytu numerycznego, nie dowód braku starszych kobiet w publikacji. |
| Testosteron całkowity | [7,212] dni; [3,86] lat | Brak zwykłego profilu | M po 212. dniu do <3 lat; >86. Po 212. dniu działa blokada jakości/rozdzielczości obecnego odczytu. F ma m.in. niezależną interpretację laboratoryjną; nie dopisujemy p50 na podstawie RI. |
| Estradiol | Brak zwykłego profilu | [0,02;1] roku; [6,18] lat | F >1–<6 i >18. Dorosła faza cyklu ma własne odniesienia. M ma niezależne odniesienia laboratoryjne; brak osi wieku nie oznacza braku interpretacji. |
| INSL3 | UI nie pokazuje liczbowego punktu | Brak zwykłego profilu | Niemowlęcy profil M istnieje wewnątrz silnika, ale UI świadomie go nie aktywuje. Względna linia nie jest stężeniem. Potrzebny osobny projekt ilościowego odniesienia. |

Ponadto zwykłe profile niemowlęce nie pokrywają pierwszych dni życia przed
podanym początkiem. Nie rozszerzamy ich na wcześniaków ani na starszy wiek.
Górne końce modeli są granicami danych wdrożonych, nie biologiczną granicą
występowania hormonu. Audyt sprawdził wiek 0–120 lat; nie zakłada referencji
poza domeną konkretnego źródła.

Zamknięte luki: FSH M [16,18), FSH F [16,19), AMH M [18,20),
LH M (16,18). Dokładne 16 lat w męskim LH nadal należy do Madsen,
a dokładne 18 do źródła dorosłego. Wypełnienie luki nie uprawnia
do przedłużania modelu ani do użycia go w innym widoku.

## Dostępne warstwy, których nie należy ponownie „uzupełniać”

- **Dorosłe LH/FSH/E2 kobiet:** istnieją RI według znanej fazy cyklu lub
  menopauzy. Mediany Stricker (LH/FSH) i Anckaert (E2) mają własną oś
  cyklu/fazy. Nie są medianą wieku chronologicznego. Nie wnioskujemy fazy,
  menopauzy ani braku ciąży z wieku lub pustego formularza.
  LH/FSH przy nieznanym kontekście pokazuje cztery warianty RI bez
  wspólnego werdyktu. Osobna poprawka laboratoryjnego E2, opisana niżej,
  stosuje taką samą zasadę neutralnych alternatyw.
- **AMH Xu:** działa osobna informacja z pięcioma źródłowymi P50 i sąsiednimi
  punktami wieku. Nie tworzy ciągłej mediany, punktu pacjentki ani
  ekstrapolacji między grupami. Szczegóły: [plan AMH](../AMH_REFERENCE_PLAN.md).
- **Inhibina B seniorów:** istnieje aktywne porównanie ze średnią grupy
  Baccarelli [80,90) i [90,101]. Nie zastępujemy go medianą i nie
  przedłużamy zwykłego modelu Borelli ponad 80.
- **Inhibina B wcześniaków i według G:** obserwacje Kuiri-Hänninen oraz
  Crofton są już obecne; nie tworzą ciągłego modelu wieku ani punktu
  pacjenta. Nie wnioskujemy G z P, wieku lub samej objętości jąder.
- **Porównania płci i minipuberty:** mają własne kontrakty. Profil
  `ordinaryOnly` nie staje się odniesieniem porównania. Żeńskie mini-LH/FSH
  pokazuje względne średnie, bez punktu stężenia.

Wynik `<…` / `>…`, brak jednostki, niepewny wiek przecinający granicę,
brak wymaganego kontekstu czy znana niezgodność metody to powody kwalifikacji,
nie nowa luka źródłowa. Nieznanej metody nie nazywamy zgodną; dopuszczone
edukacyjne zestawienie nadal nie potwierdza porównywalności oznaczeń.

## Żeńskie LH Wilson/CALIPER — blokada pozostaje

[Wilson 2023](https://doi.org/10.1515/cclm-2022-1077) i dostarczony arkusz
`LH_F` nadal nie dają zgodnego odtworzenia ryciny. Monotoniczna zmiana
skali nie naprawia rozbieżności lokalizacji maksimum. Cztery oryginalne
pliki zachowały hashe wcześniejszego audytu.

Sprawdzono Crossref, PubMed, Crossmark i publiczne repozytorium współautora.
Nie znaleziono jednoznacznego sprostowania rozwiązującego ten konflikt.
Bieżącej kopii XLSX od wydawcy nie udało się uzyskać: odpowiedzi 202 miały
puste treści. Nie jest to dowód, że wydawca nie zmienił suplementu.
Późniejszy demonstracyjny skrypt GAMLSS nie potwierdza dokładnego
preprocessingu Wilsona. Nie przenosimy zaakceptowanej rekonstrukcji
męskiego LH na dziewczęta.

Do odblokowania Wilsona potrzebny byłby autorytatywny eksport `LH_F`
z wersją, jednostką, przekształceniem przed/po GAMLSS, rodziną rozkładu
i potwierdzeniem zgodności p50 z opublikowaną ryciną. Pytania przygotowano;
nie kontaktowano autorów.

## Niezależne źródła i następne decyzje

Poniższe wartości są ustaleniami audytu, **nie danymi nowego profilu**.
Żadna pozycja nie jest automatycznie zaakceptowana klinicznie.

| Priorytet i źródło pierwotne | Ustalenie | Ograniczenie / możliwy następny krok |
|---|---|---|
| 1. LH dziewcząt — [Zhao 2025](https://doi.org/10.21037/tp-24-399), pełny tekst i suplement S2 | Rzeczywista mediana grupy >15–18: 7,14 mIU/mL, N=112; >18–19: 5,87, N=30. Surowica, Mindray CL-6000i. Autorska szersza grupa >12–19 w tabeli 4 ma p50=6,79, N=244 (suma tabeli 1). | Kandydat do małego, osobno zatwierdzonego odniesienia grupowego we wnętrzu (16,18), bez interpolacji i zastępowania dokładnego 16 Madsen. Nie opisano precyzyjnego wyliczania wieku ani fazy cyklu/OCP osobno. Selekcja wymagała prawidłowych badań; dokładne kryteria wstępnego wykluczenia wyników hormonalnych są niejasne. To chińska grupa wieku, nie LMS Wilsona ani normy fazy. Decyzja właściciela obejmuje też wybór węższej lub autorsko połączonej grupy. |
| 2. Testosteron M 1–<3 — [Kulle 2010](https://doi.org/10.1210/jc.2009-1670), tabela 3 | Grupa 1–3 lata: N=9, mediana 12 ng/dL (źródłowo zaokrąglone 0,40 nmol/L). Osocze, UPLC-MS/MS; LLOQ 0,1 nmol/L. | Mediana powyżej LLOQ, ale bardzo mała grupa, próbki pozostałe po badaniach klinicznych; pobrania 08–10. Nie uznawać automatycznie za medianę surowicy każdego małego chłopca. Ewentualny profil grupowy i granice wymagają odrębnej propozycji/akceptacji. Nie wypełnia automatycznie okresu po 212. dniu do 1 roku. |
| 3. Inhibina B F >47 — [Borelli-Kjær](https://doi.org/10.1210/clinem/dgae439), ponowne wykorzystanie znanego źródła | Obecny odczyt ma ostatni zatwierdzony węzeł w 47 latach; publikacja obejmuje też dorosłą kohortę kobiet do 69 lat. Świeża oficjalna rycina pokazuje krótki dalszy odcinek, bez liczbowego eksportu modelu w suplementach. | Możliwy ponowny odczyt po formalnej kontroli rozdzielczości i oznaczalności. Źródło podaje LOD 3 ng/L oraz imputację LOD/2; osobnego LOQ nie znaleziono. Nie nadajemy nowej granicy wieku, nie ekstrapolujemy do 69 i nie zamieniamy cenzury na zero. |
| 4. AMH M >70 — [Chong 2013](https://doi.org/10.1371/journal.pone.0070967), pełny tekst i tabela 1 | LiLACS: N=257, 80–90 lat, mediana całej grupy 12,1 pmol/L. | Potencjalne osobne porównanie obserwacyjne; nie ciągła mediana wieku ani rozwiązanie całego przedziału >70. Zróżnicowane zdrowie, mieszane dwa testy AMH; inne kohorty mają inne mediany. Rycina średniej geometrycznej z CI nie dostarcza p50. Sprostowanie z 2013 dotyczy nazwiska autora, nie tabel. |
| 5. E2 F >1–<6 — [Kulle 2024](https://pubmed.ncbi.nlm.nih.gov/38652605/), pełny tekst, tabela 3 | Dziewczynki „B1 1–8 years”: N=213, mediana 15,0 pmol/L, powyżej LLOQ 11. LC-MS/MS. To rzeczywista mediana grupy wieku i stadium, nie dokładnego wieku. | Ewentualne użycie we wnętrzu luki wymaga znanego Th1 z obecnego formularza, zachowania źródeł przy 1 i 6 latach oraz osobnej polityki materiału. Tekst/roczna tabela podają 1724 osoby, tabela charakterystyki 1753 — różnica niewyjaśniona. Nie wyliczamy rocznych p50 z RI lub ryciny bez osobnego audytu. |
| 6. Dorosłe FSH/E2 kobiet — [Grisendi 2014](https://doi.org/10.3109/09513590.2014.893572) | Abstrakt: N=192, regularne miesiączki, pobranie w 3. dniu cyklu i centyle wieku. | Brak uzyskanego pełnego tekstu/tabel/współczynników; samo nachylenie nie wyznacza mediany. Aplikacja zna fazę, lecz nie dokładny dzień cyklu. Nie można automatycznie dopasować każdej fazy folikularnej do dnia 3. |

Źródła, których obecnie **nie należy używać do wypełnienia punktu**:

- [Fanelli 2013](https://doi.org/10.1210/jc.2013-1381): rzeczywista mediana LH
  dziewcząt 16–19, ale oryginalna tabela drukuje `µIU/mL`.
  Nie poprawiamy po cichu na `mIU/mL` ani nie wprowadzamy błędu ×1000.
- Zhao 2025 dla niskiego dziecięcego LH/T: raportowane wartości sięgają
  poniżej dolnej granicy podanej liniowości. Liniowość nie jest tożsama
  z LOD/LLOQ; potrzebne wyjaśnienie oznaczalności i postępowania z cenzurą.
- Zhou 2025 dla LH/T: imputacja `<LOD` oraz niespójne pozycje tabeli LH nie
  uzasadniają dokładnej mediany. Nie przenosi to automatycznie wątpliwości
  na już oddzielnie zweryfikowane dane inhibiny B.
- [Moya-Salazar 2022](https://doi.org/10.1016/j.heliyon.2022.e10592):
  przedstawiono średnie i RI, nie potrzebne p50; jednostki i wybrane liczby
  są niespójne między częściami artykułu. Nie liczymy mediany ze średniej/RI.
- [Albrethsen 2020, INSL3](https://doi.org/10.1210/clinem/dgaa145): istnieją
  ilościowe dane dojrzewających i dorosłych mężczyzn, ale oznaczenie
  statystyki środkowej i eksport liczbowy wymagają wyjaśnienia. Nie
  przeskalowujemy względnej ilustracji do stężenia i nie nazywamy jej p50.
  [Tulumcu 2025](https://doi.org/10.3389/fendo.2025.1574760) także podaje
  mediany grupowe, ale przypisanie wieku wizyt i materiału wymaga osobnej
  polityki. Nie jest to brak wszelkich źródeł INSL3.

## Osobny problem kwalifikacji E2 — poprawka 19.10.2026

Laboratoryjny wiersz `e2_female_default` w `lab_units_data.js` przy kobiecie
dorosłej bez fazy na bazie audytu dobierał domyślnie fazę folikularną. Potwierdzono to
wywołaniem produkcyjnego konwertera: F30, E2 50 pmol/L, faza nieznana →
pojedynczy zakres 70–290 i werdykt „poniżej”. Test
`lab-estradiol-reference-scope.test.mjs` utrwalał tę politykę.
To **problem interpretacji nieznanego kontekstu**, nie luka mediany wieku
i nie dowód ustalonej fazy pacjentki.

Po akceptacji propozycji przez właściciela osobny mały PR pokazuje cztery
neutralne warianty istniejących RI bez globalnego werdyktu, z natychmiastowym
przeliczeniem. Wykorzystuje istniejący wybór fazy; zachowuje znane fazy,
menopauzę i dawne zapisane oceny. Dorosły Tanner nie zastępuje kontekstu
cyklu. Nie dodaje pytania do formularza, liczb ani profili median wieku.
Dokładny zakres, przypadki i ograniczenia: [E2_CYCLE_CONTEXT.md](../E2_CYCLE_CONTEXT.md).

## Kolejność pracy

1. Przedstawić właścicielowi ograniczoną propozycję żeńskiego LH Zhao
   dla (16,18), z rzeczywistą medianą grupy i opisem metody/populacji.
   Wilson pozostaje niezależnie zablokowany; nowe źródło nie „naprawia”
   sprzecznego arkusza.
2. Po decyzji klinicznej: pojedynczy profil, istniejące dane pacjentki,
   jawne bramki i granice, przypadki rzeczywistego silnika, PWA/offline
   oraz wszystkie kontrole GitHub po każdym pushu. Bez nowych pytań
   wymaganych do zobaczenia wyniku.
3. Oddzielnie ocenić małą grupę testosteronu Kulle i możliwość dalszego
   odczytu znanej inhibiny B oraz grupę E2/Th1. Nie łączyć ich z LH
   w jednym wdrożeniu. Poprawka domyślnej fazy E2 ma osobny PR opisany
   wyżej; przegląd nowych źródeł E2 pozostaje odrębnym zadaniem.
4. Pozostałe źródła utrzymać jako obserwacyjne lub wymagające wyjaśnienia.
   Wiek poza zakresem, wynik cenzurowany i metoda niezgodna mają zachować
   uczciwy brak punktu oraz dostępną osobną interpretację.

Przegląd publikacji był ukierunkowany na LH F16–18 oraz wymienione
priorytetowe luki. Nie jest systematycznym przeglądem całego piśmiennictwa.
Pozostałe końce wieku (m.in. FSH M>80, LH M>89, T M>86), męski E2
i żeński T pozostają odrębnymi zadaniami źródłowymi; wykrycie braku
wdrożonego profilu nie oznacza dowodu braku publikacji.

Sam audyt z 18.10 nie zmieniał generatorów, danych runtime, norm, krzywych,
zapisu pacjenta ani zasobów PWA. Osobna poprawka E2 zmienia kwalifikację
laboratoryjną, nie pokrycie median. Aktualizacja rejestru nie nadaje nowym kandydatom statusu
„zwalidowany klinicznie”.
