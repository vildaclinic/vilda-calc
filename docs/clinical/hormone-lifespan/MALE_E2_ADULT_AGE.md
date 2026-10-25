# E2 mężczyzn 31,4–60,9 lat — przybliżona mediana wieku

**Decyzja 25.10.2026:** po pełnym odczycie źródeł i ocenie prywatnej
makiety desktopowej/mobilnej właściciel zaakceptował wariant dorosły
i polecił wdrożenie („ok, akceptuję, koduj”). Jest to zamierzona nowa
informacja medyczna: edukacyjne zestawienie dokładnego wyniku z przybliżoną
P50 modelu wieku. Akceptacja i zielone testy nie nadają jej statusu
walidacji klinicznej.

Jedna istniejąca karta męskiego E2 dobiera źródło automatycznie:
[Madsen 6–18](MALE_E2_AGE.md) albo opisany tutaj Frederiksen 31,4–60,9.
Korzysta z danych formularza; bez nowej ankiety, wyboru publikacji,
Tannera, pory pobrania lub metody. Nie tworzy laboratoryjnego RI, SDS,
centyla pacjenta, ilorazu do P50 lub rozpoznania. Istniejące normy
Mayo/Tietz, konwersje i utrwalona historia mają odrębne kontrakty.

## Pełne źródło, wersja i populacja

Frederiksen H i wsp. *Sex-specific Estrogen Levels and Reference Intervals
from Infancy to Late Adulthood Determined by LC-MS/MS*. JCEM
2020;105(3):754–768, [DOI 10.1210/clinem/dgz196](https://doi.org/10.1210/clinem/dgz196).
Sprawdzono końcowy pełny PDF, Methods, wyniki, dyskusję i cały suplement
**v1**, [DOI 10.6084/m9.figshare.10084145.v1](https://doi.org/10.6084/m9.figshare.10084145.v1).
API Figshare sprawdzone 25.10.2026 zwracało jedną wersję i pojedynczy PDF,
bez eksportu liczbowego męskiego modelu. Crossref nie zwrócił relacji
korekty w sprawdzonym rekordzie; nie dowodzi to braku każdego sprostowania.

| Wejście | SHA-256 |
| --- | --- |
| Końcowy artykuł, 15 stron PDF | `4f07600af51fa35fcc83a2599f5733d77f528768bde6e82d987063e17cc42cf6` |
| Suplement v1, 15 stron PDF | `d061a335bd42a0d7607c20abd96611529d73f225f11d0e27856c3913b549ee19` |

**Health2008: 157 mężczyzn, 31,4–60,9 lat**, populacyjne badanie
przekrojowe w Danii. N=772 w podpisie ryciny obejmuje chłopców i mężczyzn
łącznie. Nie jest liczbą dorosłych, liczebnością rocznika lub eksportem
liczebności dopasowania w danym wieku. Zakres 5,9–23,4 młodszej kohorty
opisano łącznie dla obu płci; nie potwierdza osobnego męskiego końca
ani pokrycia 23,4–31,4. Nie podano liczebności poszczególnych roczników.

Odniesienie dotyczy **całkowitego E2 w surowicy**, oznaczanego in-house
isotope-dilution online TurboFlow LC-MS/MS w Rigshospitalet, Kopenhaga.
Methods i podpis ryciny określają środkową linię jako modelowaną medianę
M/P50. Nie jest średnią arytmetyczną ani empiryczną medianą osobnej grupy
rocznej. Rycina 3c przedstawia obliczony wolny E2 i nie jest tu używana.
Model przekrojowy nie wyznacza trajektorii pojedynczego mężczyzny.

## Odczyt krzywej i jego ograniczenia

Źródło liczb to **rycina 3a, s.760 / PDF s.7**: ciągła linia P50.
Przerywane linie innych centyli nie są importowane jako RI lub SDS.
Oryginalna ścieżka wektorowa nr 16 (indeks od zera), seqno 42, ma
546 odcinków i 547 wierzchołków; grubość kreski wynosi 0,874 pt.
Kalibracja używa siedmiu rzeczywistych kresek X (0–60 lat) i sześciu Y
(0–250 pmol/L). Współrzędne PDF mają początek w lewym górnym rogu:

```text
x_pdf = 113,6632674080984 + 2,5459891727992456 × wiek [lata]
y_pdf = 175,54402814592632 − 0,4187828587123326 × E2 [pmol/L]
```

Wycięcie domeny 31,4–60,9 daje **296 punktów**, w tym dwa końce
interpolowane na oryginalnych odcinkach. To wierzchołki odczytanej
grafiki; nie nazywamy ich opublikowanymi rocznymi obserwacjami lub
eksportem LMS. Interpolacja liniowa po tych odcinkach odtwarza rysunek.
Nie odzyskuje oryginalnego modelu GAMLSS, jego L/M/S, rodziny rozkładu,
współczynników, parametrów wygładzania lub niepewności dopasowania.
PCHIP Madsen pozostaje osobną polityką i nie jest używany do dorosłej
ścieżki tylko dlatego, że ten interpolator istnieje w aplikacji.

Niezależna kontrola wykorzystała **rycinę 4a suplementu, PDF s.12**.
Jest to rastrowy obraz 998×688 z osią logarytmiczną, nie drugi wektor
lub niezależna kohorta. Sprawdzenie 2951 wieków co 0,01 roku objęło
173 natywne kolumny. Największa różnica pomiędzy odczytami wyniosła
**1,4231769012068725 pmol/L** przy 31,4 roku. Mieści się w łącznych,
jawnych budżetach odczytu ścieżki głównej i rastra.

Budżet geometryczny głównego odczytu około 1,18 pmol/L uwzględnia
pół grubości kreski, resztę kalibracji i wrażliwość na kalibrację
końcową. Niezależny wariant daje około 1,15; raster około 2,34%
pionowej niepewności kwantyzacji. Są to założenia technicznej kontroli
grafiki, **nie przedziały ufności, CV oznaczenia lub niepewność biologiczna
i modelowa**. Zgodność dwóch przedstawień tego samego modelu sprawdza
ekstrakcję, nie stanowi niezależnej walidacji klinicznej lub harmonizacji
metod.

| Wiek kontrolny | Przybliżony odczyt P50, pmol/L |
| ---: | ---: |
| 31,4 | 89,47239229264481 |
| 35 | 88,68916317315305 |
| 40 | 88,16623312463493 |
| 45 | 87,90597048970147 |
| 50 | 87,64567141872784 |
| 55–60,9 | 87,38540878379439 |

Pełna precyzja tej tabeli służy odtwarzaniu kontroli, nie prezentacji
klinicznej. P50 wynosi około **87–89 pmol/L**, czyli około 24 pg/mL.
Cała różnica 31,4→60,9 to około 2,087 pmol/L; schodki co około
0,26 pmol/L odpowiadają kwantyzacji rysunku. Nie eksponujemy ich wąską
skalą ani opisem dokładnego klinicznego spadku. Narysowana linia sięga
około 64,98 roku, lecz jej zasięg nie rozszerza kohorty po 60,9.

## Metoda, niskie wartości i informacje nieustalone

Suplement, tabela 5, s.7: **LOD 4,04, LOQ 12,1 pmol/L**. To granice
metody źródłowej, nie granice laboratorium pacjenta, kliniczne progi
lub podłoga jego wyniku. Zastąpienie wartości E2 <LOD przez 1 pmol/L
opisano dla „graphic illustration”. Wpływ na wejście GAMLSS pozostaje
niejasny. Nie zastępujemy nim mediany, wyniku, `<LOD` lub `<LOQ`.
P50 dorosłych ponad LOQ nie rozstrzyga obsługi niskich obserwacji
w całym modelu przebiegu życia.

Tekst podaje precyzję niskiego QC interday ≤11%, natomiast suplement
tabela 7 podaje dla E2 **12,3% przy 31,2 pmol/L**; opis partii różni
się 20 wobec 18. Te CV nie są błędem mediany ani korektą odczytu linii.
Nie wybieramy mniejszej liczby jako gwarancji jakości. W sprawdzonych
dokumentach nie ustalono dorosłej pory pobrania, reguły postu ani
szczegółowych wyłączeń lekowych/BMI. Nie nadajemy populacji etykiety
„poranna”, „na czczo” lub „bez leczenia”.

Narracyjne 50–150 pmol/L z dyskusji nie jest nową tabelą norm.
Suplement tabela 8 dotyczy kobiet i faz cyklu; jej mediany nie są
męskim odniesieniem. Sama wspólna nazwa LC-MS/MS nie dowodzi
zgodności dowolnych oznaczeń pacjenta z metodą Frederiksen.

## Dane, kwalifikacja i prezentacja

[Dane](male-e2-adult-age-data.json), id
`frederiksen2020-male-estradiol-age`, kind `controlled-graphic-p50-data`,
oraz [polityka](male-e2-adult-age-policy.json), wersje `2026-10-25.1`,
są pakowane przez `build_runtime.py` jako `maleE2AdultAgeData` i
`maleE2AdultAgePolicy`. Dane zawierają pochodzenie, hashe, kalibrację,
punkty i ograniczenia. Polityka określa okno wieku, jednostki,
`linear-on-extracted-graphic-path`, stałą skalę i bramki aplikacji.

`VildaMaleE2Age.evaluate(data, policy, context)` zachowuje dotychczasowy
kontrakt pojedynczego źródła. `evaluateSources([{data, policy}, …], context)`
dobiera jedno źródło według **całego jawnego przedziału wieku**, a następnie
stosuje jego reguły. Wartość wyniku nie wybiera publikacji. Wyłączenie
przez terapię, znaną niezgodną metodę lub materiał nie uprawnia do próby
z sąsiednim źródłem. Przy luce, braku lub niejednoznaczności wieku wynik
jest neutralny: `source: null`, `plot: null`, `median: null`, puste
krzywa/węzły i brak punktu. `availableSources` opisuje dostępne źródła
bez przypisywania jednego z nich pacjentowi.

Gotowy wynik rozdziela źródło/politykę, `median`, `ageContext`, `curve`,
stały `plot` i `comparison.patientPoint`. Dorosła `curve` zachowuje
296 wierzchołków, `knots` jest puste: wierzchołki digitalizacji nie są
rocznymi węzłami do oznaczania kropkami. `sourceValue/sourceUnit` zachowują
pmol/L, a prezentacja ma osobne `displayUnit`. Nie dodajemy zwykłego
86. profilu, nie zmieniamy 85 profili i 38 wcześniejszych pól runtime.
Nowe dwa bloki dają 40 pól; poprzedni kontrakt Madsen pozostaje odrębny.

Konieczne są bieżący zgodny pacjent M/E2, `sourceStatus: 'ready'`,
`contextBasis: 'current-patient'`, brak datowanej próbki i jawne
`ageYears`, `ageUpperYears`, boolean `ageUpperInclusive`. Nie dopisujemy
upper, domknięcia, dokładnej daty ani środka przedziału. Odczyt dotyczy
wpisanej dolnej granicy, z ≈ i dwiema cyframi znaczącymi.

Legacy UI E2 przekazuje lata/miesiące, nie pożycza precyzji DOB/dni innego
analitu. `[40,41)` kwalifikuje, lecz nie staje się dokładnym wiekiem.
31 lat 5 miesięcy i 60 lat 9 miesięcy mieszczą się w źródle; ukończone
31 lub 60 lat oraz 31 lat 4 miesiące i 60 lat 10 miesięcy przecinają
granice. Prawdziwe dokładne 31,4 lub 60,9 są brzegami kontraktu API;
nie są tworzone w UI przez wpisanie fikcyjnej daty.

**Poprawka integracji pustych miesięcy:** E2E ujawniło, że pusty
`shared.ageMonths === ''` może pobrać z `VildaSession.getPatient()`
fallback `NaN`, powstały po parsowaniu pustego pola. Legacy czytnik
wybierał wtedy nieprawidłową precyzję miesięczną i tracił poprawnie
znane 40 lat. Tylko tę kombinację pustego pola współdzielonego i `NaN`
fallbacku normalizujemy do braku miesięcy (`null`), czyli precyzji
ukończonych lat. Prawidłowe miesiące z sesji pozostają używane;
jawnie zgłoszone błędne lub poza zakresem miesiące nadal są odrzucane.
Precyzja `activeAssessment` pozostaje nadrzędna, bez imputacji DOB/dni.
Regresja ma wywoływać rzeczywisty czytnik i adapter. Korekta przywraca
dostępność znanego wieku w kwalifikacji wykresu; nie zmienia norm lub
historii. Końcowe wyniki regresji raportuje PR.

Znane dodatnie fakty terapii/GnRHa, sterydów płciowych/egzogennego T,
stymulacji oraz znana niezgodna metoda/materiał wstrzymują zestawienie.
To konserwatywne reguły aplikacji, nie dopisane kryteria autorów.
Nieznane fakty pozostają nieznane; orientacyjny odczyt nie potwierdza
zgodności metody lub braku terapii. Nie dodajemy badge lub pytania
„metoda niepotwierdzona”. Adapter zachowuje wyłącznie bieżące dane
tej samej osoby; nie pożycza metody, materiału, protokołu lub daty
próbki TT. Zmiana osoby/płci/analitu, lock, restore, przygotowanie,
spóźniony kontekst lub historia usuwają stare liczby i pełny ekran.

Jedna istniejąca karta ma automatyczny wariant Madsen albo Frederiksen,
źródła domyślnie zwinięte i dotychczasowy pełny ekran. W luce 18–31,4,
po 60,9 lub bez wieku nie pojawia się zastępcza mediana 18 lat lub
najbliższej grupy. Oś dorosła **31,4–60,9 / 0–200 pmol/L**, z tickami
wieku 35/40/45/50/55/60, jest stała i niezależna od wyniku. To wybór
prezentacji, nie RI. Dziecięca 0–100 i adnotacja niskiego BGS2 pozostają
właściwościami Madsen. Nie przenosimy ich do dorosłego źródła.

Pięć jednostek E2 używa rzeczywistego `LabUnitConverter`: pmol/L,
nmol/L, pg/mL, ng/L i ng/dL. Dotychczasowy współczynnik
1 pg/mL = 3,671 pmol/L pozostaje regułą konwersji, nie harmonizacją metod.
Jasny znacznik jest przybliżoną P50, czerwony dokładnym rzeczywistym
wynikiem. 0 i 0,4 pozostają punktami; 300 pmol/L ma strzałkę i liczbę
przy niezmienionej osi. `<`, `>`, `≤`, `≥`, `<LOD` i `<LOQ` zachowują
charakter wyniku bez dokładnej kropki, podstawienia zera lub źródłowej
granicy. Dotychczasowa obsługa E2 z operatorem pozostaje niezależna; karta nie
tworzy klasyfikacji względem normy z położenia wobec P50.

Istniejący dorosły RI Tietz **40–160 pmol/L** oraz pediatryczne Mayo
pozostają niezależne. M40/125 jest powyżej P50 ≈88, a nadal może być
`within` według tego RI. P50 nie trafia do snapshotu, autosave,
`lab.hormoneReference`, wizyty, historii, eksportu lub synchronizacji;
odczyt dawnego wyniku nie przelicza go według dzisiejszego wieku.

## Syntetyczne przypadki i wymagana weryfikacja

| Fikcyjne wejście | Oczekiwany wynik rzeczywistej funkcji |
| --- | --- |
| M40, `[40,41)`, 125 pmol/L | P50 88,16623312463493, ≈88 w UI; punkt 125; niezależny RI 40–160 zachowuje `within` |
| M55, 80 pmol/L | P50 87,38540878379439; ta sama krzywa i oś dorosła |
| Dokładne 31,4 / 60,9 w API | Odpowiednio P50 89,47239229264481 / 87,38540878379439 |
| Ukończone 31 / 60 | `[31,32)` / `[60,61)` przecinają źródło; brak P50 |
| 31 lat 5 mies. / 60 lat 9 mies. | Całe przedziały mieszczą się; około 89 / 87 pmol/L |
| 31 lat 4 mies. / 60 lat 10 mies. | Brak P50, bez imputacji dokładnego wieku |
| 25 / 75 / brak lub niepełny wiek | Bez mediany, krzywej i punktu źródła; dostępny wynik, konwersje i RI zachowane |
| 0 / 0,4 / 300 pmol/L w kwalifikującym wieku | Rzeczywiste punkty 0 / 0,4; dla 300 strzałka i liczba; stała oś 0–200 |
| `<5`, `>150`, `≤5`, `≥150`, `<LOD`, `<LOQ` | P50 może pozostać; literalny wynik bez dokładnego punktu |
| Zmiana każdej z pięciu jednostek | Ten sam fizyczny wynik, P50 i geometria; równoważne stałe osie |
| M12 / M6 | Dotychczasowe P50 6,129050070456699 / 0,24701013272002922; oś 0–100, własne opisy Madsen |
| Znana terapia/stymulacja lub niezgodna metoda/materiał | Brak nowego porównania i bez próby z innym źródłem |
| Inna osoba/płeć/analit, lock, restore, spóźniony kontekst, historia | Bez starej mediany, obcych faktów, dzisiejszego wieku dawnej próbki i nowego zapisu |

Weryfikacja ma wywoływać produkcyjny silnik, parser, konwerter i adapter
HTML. Obejmuje zgodność wszystkich 296 punktów z kontrolowanym odczytem,
interpolację liniową wewnątrz oryginalnych odcinków, granice i brak
ekstrapolacji, niezmienność 38 wcześniejszych pól/85 profili i RI,
tożsamość/wyłączenia, desktop, 320/390 px, pełny ekran/Escape/fokus,
domyślnie zwinięte źródła oraz ich reset przy zmianie źródła/osoby.
PWA wymaga rzeczywistej instalacji i aktualizacji, zamknięcia przeglądarki,
wyłączenia serwera i zimnego startu offline z nowym bundlem.

Regresje: `male-e2-adult-age.test.mjs`, testy rzeczywistego adaptera oraz
`lab-male-e2-adult-age.spec.mjs` i `lab-male-e2-adult-age-offline.spec.mjs`.
Wykonane wyniki lokalne, wersje PWA i **wszystkie** kontrole GitHub dla
końcowego SHA raportuje PR po ich zakończeniu. Lista oczekiwań w tym
dokumencie nie jest deklaracją, że niewykonane jeszcze testy przeszły.
