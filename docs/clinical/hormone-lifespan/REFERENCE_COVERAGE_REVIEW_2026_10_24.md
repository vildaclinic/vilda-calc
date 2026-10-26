# Pokrycie wykresów hormonów — przegląd po PR #766 i #770

**Dalsza realizacja punktu 4 — 25–26.10.2026:** PR #790 wdrożył
[orientacyjne LH dzieci i punkt bez mediany](../LH_CHILDHOOD_REFERENCE.md).
Nie odzyskano dokładnej P50 dziecięcej. Osobny pełny audyt Busch 2022
potwierdził wierny istniejący odczyt ścieżki; właściciel polecił wdrożyć
[przybliżoną modelową medianę LH dla całego `(243;326]` dnia, następnie
sam wynik do <1 roku](LH_INFANT_TAIL.md). Granica 326 jest decyzją
prezentacji aplikacji, a nie regułą autora. Dotyczy zwykłego wykresu,
bez zmiany porównania płci, RI i historii. Ten krok zastępuje niższą
historyczną rekomendację dalszego wyjaśnienia ogona LH; **TT po 212. dniu
pozostaje następnym osobnym etapem**. Poniższy przegląd i jego JSON
nadal dokumentują stan z 24.10, bez przepisywania dawnych hashy.

**24.10.2026, baza `audyt` `7ff480c21129dcb006443ca9c929e508eeea55e2`.**
To audyt i rekomendacja dalszych prac, bez aktywacji nowych danych, norm,
krzywych lub interpretacji. Nie jest systematycznym przeglądem całego
piśmiennictwa ani walidacją kliniczną. Najpierw ponownie wykorzystano
posiadane pełne publikacje i suplementy.

**Późniejsza decyzja z 24.10.2026:** właściciel zaakceptował osobną
makietę TT dziewcząt 6–18 i polecił wdrożenie. Bieżący kontrakt tej karty
opisuje [FEMALE_TT_AGE.md](FEMALE_TT_AGE.md). Poniższy przegląd oraz jego
JSON pozostają zapisem etapu audytu przed tą decyzją; nie zmieniają
historycznych hashy i nie są polityką uruchamiającą męski E2 lub inne
pozostałe propozycje.

**Kolejna decyzja z 25.10.2026:** po analizie niskich E2 i osobnej
makiecie właściciel zaakceptował wdrożenie karty E2 chłopców 6–18
(„jest ok, koduj”). Zachowano pełny model [6,18], bez podłogi LLOQ
lub progu 8/9 lat, z opisem niepewności niskiego końca i odrębnością
norm laboratoryjnych. Aktualny kontrakt: [MALE_E2_AGE.md](MALE_E2_AGE.md).
Numerowana rekomendacja i liczby poniżej pozostają zapisem audytu
24.10 sprzed obu decyzji; nie są samodzielną polityką wykonawczą,
nie zmieniają historycznych hashy i nie uruchamiają dorosłego E2.

**Późniejsza decyzja 25.10.2026 — dorośli mężczyźni:** po kontrolowanym
odczycie Frederiksen 2020, pełnym sprawdzeniu ograniczeń i akceptacji
prywatnej makiety właściciel polecił wdrożenie wariantu 31,4–60,9 w jednej
karcie E2. [MALE_E2_ADULT_AGE.md](MALE_E2_ADULT_AGE.md) opisuje bieżący
zakres. Punkt 3 historycznej kolejności poniżej został zrealizowany jako
odczyt i osobna decyzja; nie jest ponownym zadaniem lub zgodą na inne luki.

## Wynik i rekomendowana kolejność

Wspólny silnik nadal ma **85 profili**, dane `2026-10-22.2`, API `1.4.0`.
Istnieją jednak **gotowe, dotychczas niewykorzystane roczne węzły P50**
Madsen 2022 dla testosteronu całkowitego dziewcząt i estradiolu chłopców.
Ich brak na wykresie nie jest już opisywany jako brak liczb źródłowych.
Oba zakresy wymagają nowej geometrii, skali i selektora odpowiedniej płci;
nie wystarczy dopisać profilu do istniejącego rysunku.

1. **Pierwsza propozycja i makieta: TT dziewcząt 6–18 lat według Madsen.**
   Wszystkie 13 P50 jest ponad źródłową LLOQ. To najprostszy następny
   kandydat źródłowy, ale nie zaakceptowane jeszcze wdrożenie.
2. **Osobna propozycja E2 chłopców:** najpierw jawnie rozstrzygnąć sposób
   prezentacji niskich węzłów 6–7 lat i wartości bliskiej LLOQ w wieku 8.
   Nie odrzucać modelowanej mediany automatycznie na podstawie LOQ.
3. **Dorosły męski E2:** kontrolowany odczyt wektorowej ryc. 3a
   Frederiksen 2020; obecny audyt nie dostarcza liczb do importu.
4. **Dalsze luki dziecięce LH i niemowlęcego LH/T:** pozyskać odpowiedni
   model/eksport lub wyjaśnienie; nie usuwać bramek dokładności grafiki.
   Końce wieku seniorów mają niższy priorytet.

Przyszła propozycja ma wykorzystać płeć i pełny kontekst wieku formularza,
bez nowej ankiety. Mediana wieku nie wymaga zgadywania G/Th/P. Zakres,
interpolacja, niepewny wiek i ewentualny punkt wyniku wymagają opisanej
polityki i osobnej akceptacji. Nie dodawać RI, SDS, diagnoz lub zmian
historii przy okazji tej pracy.

## Co jest już zakończone

- **E2 dnia 3, PR #766:** osobne 26 literalnych P50 wieku 19–44,
  po wykluczeniu rozbieżnego węzła 18. Cały możliwy wiek musi pasować;
  punkt pacjentki wymaga potwierdzenia D3 dla bieżącego wyniku.
  [Kontrakt E2 D3](E2_D3_SOURCE.md).
- **INSL3, PR #770:** przybliżona modelowana P50 według Methods
  Albrethsen 2020 w istniejących źródłach, dla czytelnych fragmentów
  `[10;27,6] ∪ [31,4;60,9]`. Nie aktywuje przelicznika, norm lub punktu
  wyniku i nie wypełnia zasłonięcia 18–19 lat.
  [Kontrakt INSL3](INSL3_AGE_SOURCE.md).
- **FSH D3, źródła fazowe FSH/E2, Xu, LiLACS i średnie seniorów
  inhibiny B** mają osobne, już działające kontrakty poza zwykłym
  rejestrem 85 profili. Nie należy ponownie proponować ich jako
  brakujących funkcji lub utożsamiać ze zwykłą medianą wieku.

## Aktualne luki i ich przyczyny

Poniżej chodzi o **zwykłe liczbowe odniesienie na osi wieku**, a nie
o całość interpretacji laboratoryjnej. Granice są dosłowne; dokładny
wiek i ukończone lata mogą dawać różną kwalifikację. Pierwsze dni życia
przed początkiem profilu i wcześniactwo nie są pokryte przez samą
obecność modelu donoszonych niemowląt.

| Analit | Chłopcy / mężczyźni — nadal bez zwykłego odniesienia | Dziewczęta / kobiety — nadal bez zwykłego odniesienia |
| --- | --- | --- |
| LH | Po 243. dniu do <1 roku: bramka jakości odczytu Busch. `[1,6)` i >89 lat: brak zwykłego profilu. | `(1,6)` i >16 lat. W `(16,18)` sam wynik już jest prezentowany; dorośli mają odrębne RI i schemat cyklu. Wilson LH_F nadal nierozstrzygnięty. |
| FSH | >80 lat. Dziecięce 1–<6 działa przy znanym G1. | ≥19 lat. Dziecięce 1–<6 działa przy znanym Th1; dorosłe RI/faza i osobny FSH D3 nie są brakami funkcji. |
| AMH | >70 lat; LiLACS opisuje już całą grupę 80–90 bez porównania pacjenta. | ≥46 lat; pięć punktów Xu jest dostępnych osobno, bez ciągłego modelu. |
| Inhibina B | >80 w zwykłym modelu; osobne średnie Baccarelli sięgają 101 lat. | >47,75; koniec zweryfikowanego odczytu, nie granica kohorty lub menopauzy. |
| TT | Po 212. dniu do <1 roku: bramka jakości grafiki; >86 lat: koniec źródeł. Grupy 1–<3 są już wdrożone. | Brak zwykłej krzywej/profilu; **Madsen ma 13 niewykorzystanych P50 6–18**. Niezależna ocena laboratoryjna już działa. |
| E2 | Brak zwykłej krzywej/profilu; **Madsen ma 13 P50 6–18**. Dorośli Frederiksen: P50 graficzna, bez zweryfikowanego eksportu liczbowego. RI już istnieją. | Przy braku aktualnego Th1 luka `(1,6)` pozostaje; >18 brak zwykłej mediany wieku. Faza i E2 D3 19–44 są osobnymi dostępnymi odniesieniami. |
| INSL3 | Punkt stężenia i konwerter świadomie nieaktywne. Nowy odczyt źródłowy nie obejmuje zasłonięć lub wieku poza przyjętą domeną. | Brak zwykłego profilu; ten przegląd nie ustalił gotowego kandydata. |

Brak jednostki, wynik z nierównością, znana niezgodna metoda/materiał,
leczenie, niedostępny kontekst lub wiek przecinający granice źródeł to
**powody kwalifikacji**, a nie dowód nowej luki w publikacjach. Th1/G1
w kontrolach są jawnie podanymi fikcyjnymi faktami, nie wnioskiem z wieku.

### Końce niemowlęcego LH i T

Busch 2022, [DOI 10.1210/clinem/dgac115](https://doi.org/10.1210/clinem/dgac115),
ma dalsze węzły w zachowanym odczycie. Obecna bramka porównania uwzględnia
granicę oznaczenia, grubość kreski i resztę kalibracji. To polityka
aplikacji, nie próg kliniczny lub reguła autorów. Przykładowo zapisane
LH dnia 244 ≈0,170118 IU/L jest ponad LOD 0,05, a T dnia 213
≈0,164593 nmol/L ponad LOQ 0,012; mimo tego nie kwalifikują się do punktu.
Nie zmieniono tej polityki. Potrzeba lepszego dowodu liczbowego, a nie
zastąpienia braku zerem, medianą starszej grupy lub samym usunięciem bramki.

Korekta nazwy limitu po ponownym odczycie źródła 26.10: 0,012 nmol/L
dotyczy **LOQ testosteronu**, nie LOD. Nie zmienia to jego polityki.
Powyższy opis statusu LH jest historyczny; aktualną decyzję i granice
po audycie ogona dokumentuje [LH_INFANT_TAIL.md](LH_INFANT_TAIL.md).

## Madsen 2022 — dwa niewykorzystane eksporty

Pełny tekst: *Reference Curves for Pediatric Endocrinology: Leveraging
Biomarker Z-Scores for Clinical Classifications*, JCEM 2022,
[DOI 10.1210/clinem/dgac155](https://doi.org/10.1210/clinem/dgac155),
[PMC9202734](https://pmc.ncbi.nlm.nih.gov/articles/PMC9202734/).
Sprawdzono Methods, Table 1, Results/Fig. 1, Discussion oraz oryginalne
Supplemental Tables 1 i 2. [Suplement LMS, wersja 1](https://doi.org/10.6084/m9.figshare.17153336.v1).

W arkuszu `LCMSMS hormones` blok **TT dziewcząt `AF3:AI15`** oraz
**E2 chłopców `AA19:AD31`** zawierają po 13 rocznych węzłów 6–18.
Przykłady `K36/K37` jawnie przekształcają `LN(SI * 1000000)`;
odwrotne przekształcenie środka to **`P50 = exp(M) / 1000000`**.
Artykuł nazywa linię „mean-for-age (p50)”, lecz identyfikuje z=0
z 50. percentylem. To modelowane P50, nie średnie arytmetyczne ani
empiryczne mediany 13 osobnych roczników.

| Wiek węzła | TT dziewcząt, nmol/L | E2 chłopców, pmol/L |
| --- | ---: | ---: |
| 6 | 0,0554064 | 0,247010 |
| 7 | 0,0783005 | 0,379310 |
| 8 | 0,110297 | 0,590344 |
| 12 | 0,425028 | 6,12905 |
| 18 | 0,869048 | 73,8468 |

To przykłady audytowe, bez aktywacji. Pełna precyzja i komórki źródłowe
są w [ekstrakcie audytu](evidence/madsen2022-unused-sex-analytes-audit-2026-10-24.json).
Nie odzyskano ciągłego obiektu dopasowania; interpolacja między rocznymi
węzłami byłaby polityką produktu. Dokładne 18 jest węzłem; ukończone
18 jako `[18,19)` wykracza poza eksport. Nie przedłużać do 19 lub dorosłości.

### Populacja i oznaczenie

Norweskie przekrojowe kohorty BGS2 (6–<16) i Fit Futures (15–18),
surowica, pobrania 08–14. Tabela 1 podaje dostępne próbki M414/M491
oraz F601/F319; **nie są to potwierdzone N dopasowania każdego analitu
lub rocznika**. Udział BGS2 wynosił 43%, Fit Futures 93%; uogólnienie
poza badaną populację i metodę pozostaje ograniczone. Modele wieku
łączą stadia pokwitania. Wykluczano samozgłoszone choroby przewlekłe/
nowotwory; przypis tabeli 1 wyklucza doustną antykoncepcję ze wszystkich
żeńskich odniesień biomarkerów. Osobny wiersz etynyloestradiolu w tabeli
RI nie jest częścią importu P50. Nieznany wywiad pacjentki nie potwierdza
braku antykoncepcji lub leczenia. Pora pobrania i faza cyklu nie są
stratyfikacją tego modelu wieku.

- **TT, LC-MS/MS:** LLOQ 0,02 nmol/L; wszystkie 13 P50 0,0554–0,8690
  leży ponad nią. CVA 4% opisano dla 1,5–37 nmol/L, więc nie opisuje
  precyzji tych żeńskich median. Reguła cenzury niskich wyników nie jest
  jednoznacznie podana. Nie harmonizować dowolnych metod pacjenta.
- **E2, dwie metody LC-MS/MS:** BGS2 LLOQ 0,58 pmol/L; Fit Futures
  LLOQ 13 pmol/L. Obie metody są spójne pomiarowo z CRM BCR-576;
  połączenie autorzy uzasadniają równoległym porównaniem próbek
  (R² 0,96, średnia różnica 1,7%, P=0,053), bez korekty matematycznej.
  Nie jest to kalibracja
  innych oznaczeń. P50 wieku 6/7 są poniżej pierwszej LLOQ, a wieku 8
  tylko nieznacznie powyżej. Węzły 15–18 są ponad LLOQ starszej kohorty.
- **LOQ próbki nie jest podłogą mediany modelu.** Sam niski odczyt
  nie dowodzi błędu modelu. Nie przycinać do LOQ, nie imputować zera
  lub LOQ/2 i nie przypisywać tej granicy metodzie pacjenta. Brak jawnej
  cenzury pozostaje ograniczeniem przyszłej propozycji, zwłaszcza E2.
- Przykład z-score `L37` w arkuszu odwołuje się do obcego L w mianowniku.
  Nie zmienia lokalizacji zera licznika i odczytu M, ale nie należy
  kopiować go do kalkulatora SDS. Nie importowano L/S, RI lub centyli
  pacjenta. Dodatkowe RI wieku/stadium suplementu 2 są odrębnym tematem.

## Żeński TT poza zakresem Madsen

Pełny **Kushnir 2010**, [DOI 10.1373/clinchem.2010.143222](https://doi.org/10.1373/clinchem.2010.143222),
s. 1143, podaje mediany całych grup: przed menopauzą **270 ng/L, N104**,
po menopauzie **180 ng/L, N86**. Surowica, derywatyzacja 2D LC-MS/MS,
LOD 5 i LOQ 10 ng/L, pobrania dorosłych 08–10; wykluczono OCP/HRT.
To potencjalny późniejszy temat osobnej informacji grupowej. Średnia/
mediana wieku uczestniczek nie wyznacza domeny, a grupy nie dają
ciągłej mediany wieku ani podstaw do zgadywania menopauzy. Pediatryczne
mediany ryc. 4A/B wymagają osobnego kontrolowanego odczytu.

**Holmes 2021** ma model TT i dane 195 dziewcząt, ale 18 wartości <0,05
i 32 równe 0,05 nmol/L. To granica kalibracji/raportowania, nie dowiedziony
LOD/LOQ lub reguła imputacji. **Kulle 2010** ma małe grupy osocza,
niskie wartości przy LLOQ i rozbieżność N8/N9 dla dziewcząt 1–3.
Źródła te nie zamykają automatycznie wieku <6 lub dorosłości.
Johannsen 2018 daje w minipuberty m.in. RI i średnią geometryczną
`<LOD`, bez dokładnej liczbowej mediany TT. Istniejąca niezależna
interpretacja laboratoryjna pozostaje dostępna i bez zmian.

## Męski E2 poza zakresem Madsen

**Frederiksen 2020**, [DOI 10.1210/clinem/dgz196](https://doi.org/10.1210/clinem/dgz196),
pełny końcowy PDF i suplement: ryc. **3a, s. 760**, przedstawia P50
całkowitego E2. Dorosła kohorta Health2008 to **157 mężczyzn 31,4–60,9**;
N772 wszystkich chłopców i mężczyzn nie jest N dorosłych. Surowica, in-house TurboFlow
LC-MS/MS; suplement tabela 5, s. 7: LOD 4,04, LOQ 12,1 pmol/L.
Podstawienie 1 pmol/L za <LOD opisano dla „graphic illustration”;
wpływ na dopasowanie nie jest wyjaśniony. Nie używać 1 jako mediany.

Brak tabeli liczbowego męskiego modelu; suplement tabela 8 podaje
mediany **kobiet według fazy**. Finalna ryc. 3a jest wektorowa, więc
można zaproponować kontrolowany odczyt i niezależną kontrolę względem
logarytmicznej ryc. 4a suplementu. **Nie wykonano go w tym przeglądzie.**
Nie potwierdzono pokrycia kohortą 23,4–31,4 mimo ciągłej linii; nie
łączyć automatycznie z Madsen lub ekstrapolować do seniorów.

Kulle 2024 ma męską P50 tylko na ryc. 1B; tabela 2 daje RI, a tabela 3
mediany żeńskich stadiów piersi. Nie daje gotowego męskiego eksportu P50.
Kulle 2010 i Holmes 2021 nie dostarczają oznaczeń E2; ich tabele androgenów
nie wypełniają tej luki. Inne pediatryczne źródła TT opisane w ekstrakcie
nie są automatycznym połączeniem w jeden model życia kobiet.

## Kontrola techniczna i odtwarzanie

[Aktualny zapis kontroli](evidence/reference-coverage-audit-2026-10-24.json)
zachowuje bazę, wersje, SHA-256 wejść, zakresy i liczbę prób rzeczywistych
funkcji produkcyjnych. Historyczny JSON z 18.10 i jego hashe pozostają
niezmienione. Eksporty CommonJS i browser-VM porównano dla 63 492 zwykłych
prób; zero rozbieżności. Osobno sprawdzono bramki, niepewny wiek,
porównania, seniorów, Xu oraz nowsze bloki źródłowe.

Browser-VM jest wykonaniem eksportu JS, **nie testem DOM lub offline**.
Regresje interfejsu/PWA i CI raportuje osobno PR. Skrypt audytu wyłącznie
odczytuje produkcję, zapisując raporty poza repozytorium:

```sh
node docs/clinical/hormone-lifespan/audit_reference_coverage.mjs . /tmp/vilda-hormone-coverage-audit
```

Zmiany dokumentacji nie aktywują kandydatów, nie przeliczają starych ocen,
nie zmieniają PWA lub zasad zapisu. Następne wdrożenie wymaga konkretnej
makiety i akceptacji zakresu przez właściciela.

## Późniejszy odczyt i decyzja: dorosły męski E2, 25.10.2026

Po tym historycznym przeglądzie zakończono kontrolowany odczyt ryc. 3a
Frederiksen 2020/s. 760. Wycięto 296 wierzchołków w domenie dorosłej kohorty
Health2008: 157 mężczyzn 31,4–60,9. Odczyt jest przybliżoną P50 grafiki,
z liniową interpolacją po odcinkach; brak eksportu GAMLSS/L/M/S pozostaje
prawdziwy. Ryc. 4a suplementu jest rastrowa/logarytmiczna i pokazuje ten
sam model. Niezależna kalibracja 2951 wieków daje maksymalną różnicę
1,4232 pmol/L w łącznych budżetach grafiki; nie jest walidacją kliniczną.

Właściciel zaakceptował makietę desktop/mobile i wdrożenie („ok,
akceptuję, koduj”). Jedna karta E2 automatycznie dobiera Madsen 6–18
albo Frederiksen 31,4–60,9 według całego jawnego wieku. Nowy wariant
ma stałą oś 0–200 pmol/L, ≈/dwie cyfry znaczące i rzeczywisty dokładny
punkt wyniku. Nie rysuje ilościowego mostu 18–31,4 lub rozszerzenia do
seniorów. Pozostają ograniczenia cenzury, źródłowe LOD/LOQ, nieustalone
pobranie/post/wyłączenia i rozbieżności QC opisane w kontrakcie.

P50 około 87–89 nie zastępuje norm Mayo/Tietz i nie dodaje RI, SDS,
centyla, zapisu historii lub 86. profilu. M40 / 125 nadal może być w normie
40–160, mimo położenia powyżej mediany ≈88. Pozostałe dziecięce LH,
końce niemowlęcego LH/T i pozostałe zakresy wieku zachowują swoje
dotychczasowe ograniczenia; ich wdrożenie nie wynika z tej decyzji.
Kontrakt i wymagane przypadki:
[MALE_E2_ADULT_AGE.md](MALE_E2_ADULT_AGE.md).
