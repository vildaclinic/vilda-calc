# Testosteron chłopców po 212. dniu — sam wynik na wykresie

**Decyzja właściciela z 26.10.2026:** po audycie pełnego Busch 2022
i trzech oficjalnych suplementów oraz przeglądzie makiety wdrożyć
wyłącznie punkt rzeczywistego wyniku TT dla całego znanego wieku
**(212 dni;1 rok)**. Właściciel odrzucił propozycję przybliżonej mediany
z późnej części publikowanej grafiki i objaśniania w produkcie
rozbieżności źródła. Sam wynik nie dostaje mediany, jasnego znacznika,
łącznika, ilorazu, SDS, centyla ani nowego werdyktu laboratoryjnego.

Dotyczy to zwykłych widoków „Całe życie” i „Minipuberty”. Krzywa,
stała skala, wcześniejsze odniesienia i porównanie płci zachowują swoje
kontrakty. Nie dodajemy pytań. Akceptacja wdrożenia nie stanowi walidacji
klinicznej modelu lub aplikacji.

Własny [mały zapis audytu](evidence/male-infant-tt-result-only-audit-2026-10-26.json)
utrwala źródła, wersje, hashe, zakres weryfikacji i decyzję. Pełne pliki
wydawcy, zrzuty publikacji i robocze raporty pozostają poza repozytorium.

## Źródło i ograniczenie odniesienia

Busch AS i wsp., *Dynamic Changes of Reproductive Hormones in Male
Minipuberty: Temporal Dissociation of Leydig and Sertoli Cell Activity*,
*J Clin Endocrinol Metab.* 2022;107(6):1560–1568,
[DOI 10.1210/clinem/dgac115](https://doi.org/10.1210/clinem/dgac115),
[PMID 35225342](https://pubmed.ncbi.nlm.nih.gov/35225342/).
Audyt objął pełną końcową dziewięciostronicową publikację, szczególnie
Methods/Results s. 1561–1562, podpis ryc. 3 s. 1565, ograniczenia
s. 1566 i wszystkie trzy oficjalne suplementy v1.

- COPENHAGEN Minipuberty Study, Dania, 2016–2018: zdrowi donoszeni
  chłopcy z ciąż pojedynczych; źródło opisuje populację jako kaukaską.
  119 chłopców obserwacji pourodzeniowej i 338 próbek surowicy łącznie
  nie są potwierdzoną liczebnością oznaczeń TT lub tego przedziału wieku.
- Testosteron **całkowity**, surowica, in-house LC-MS/MS, **nmol/L**.
  Źródłowe **LOQ 0,012 nmol/L** nie jest LOD, normą ani granicą metody
  laboratorium pacjenta. Wolny testosteron był osobno obliczany.
- Tekst opisuje spadek mediany TT poniżej LOQ około 6. miesiąca,
  podczas gdy późny środek modelu w publikowanej grafice pozostaje
  wyżej. Podane 6/34 wyników TT poniżej LOQ dotyczy całego przedziału
  340–390 dni; nie wyznacza mediany konkretnego wieku poniżej roku.
  Nie znaleziono rozstrzygającego eksportu TT lub wyjaśnienia sposobu
  połączenia dwóch opisanych dopasowań. Nie przypisujemy autorom
  konkretnej pomyłki ani własnej korekty modelu.
- [Suplement S1 v1](https://doi.org/10.6084/m9.figshare.19093787.v1)
  dotyczy SHBG i wolnego T, [S2 v1](https://doi.org/10.6084/m9.figshare.19093790.v1)
  zmienności SDS, a [tabela S1 v1](https://doi.org/10.6084/m9.figshare.19093793.v1)
  statystyk INSL3. Żaden nie dostarcza brakującej numerycznej mediany TT.

Powyższe jest dokumentacją decyzji, a nie treścią ostrzeżenia dla lekarza.
W produkcie pozostaje prosty podpis:
**„Czerwony punkt: wynik pacjenta. Linia pokazuje poglądowy przebieg zmian.”**
Nie podstawiamy zera, LOQ ani LOQ/2 jako mediany lub wyniku pacjenta.
Nie usuwamy zachowanego ekstraktu i nie zmieniamy jego liczb lub flag.

## Polityka samego wyniku

[Polityka danych](male-testosterone-infant-result-only-policy.json)
`male-tt-infant-result-only-2026`, wersja `2026-10-26.1`, jest pakowana
jako osobne zewnętrzne `infantTtResultOnlyPolicy`. Zagnieżdżona
`male-tt-infant-result-only` ma `kind: educational-result-only`,
`ordinaryOnly: true`, źródłowy profil `busch2022-male-t` oraz własny
klucz `infantTtContextAvailable`. Nie przejmuje wyjątku ani granicy
326 dni z LH.

`evaluate()` nadal odrzuca brak liczbowego odniesienia jako
`reference-unavailable`. `evaluateResultOnly()` może zwrócić wyłącznie
`{ status: 'result-only', policy, value, unit }` po pomyślnym wyborze
tego profilu, gdy jedynym odrzuconym elementem jest jego liczbowa
kwalifikacja w całym późnym zakresie. Nie jest to ogólny fallback
po błędzie źródła, populacji, metody, materiału lub wyniku.

Cały jawnie podany przedział wieku wraz z włącznością końca musi
mieścić się w `(212/365.25;1)`. Przedział półotwarty może kończyć się
na wyłącznej granicy 1 roku, lecz nie może obejmować tej granicy.
Wcześniejsze kwalifikujące się wyniki i mediany do 212. dnia pozostają
bez zmian. Wiek przecinający 212. dzień nie otrzymuje nowej ścieżki.
Dokładnie rok zachowuje dotychczasowy wybór źródła dziecięcego,
zamiast przedłużania profilu niemowlęcego.

Pozostają warunki bieżącej osoby, gotowości źródła, donoszenia,
znanej zgodności metody i materiału oraz znanego leczenia, stymulacji
i przeciwwskazań. Zmiana osoby, blokada, czyszczenie lub odtwarzanie
stanu unieważniają niezgodny kontekst. Historyczny wynik nie otrzymuje
dzisiejszego wieku. Nieznane fakty pozostają nieznane; nie uznajemy
braku wywiadu za potwierdzenie zdrowia lub braku leczenia.

Dokładny punkt wymaga skończonego nieujemnego wyniku i obsługiwanej
jednostki. Obowiązują dotychczasowe konwersje TT, w tym
`10 ng/dL → 0,3467 nmol/L`. Zero pozostaje zerem; wynik ponad stałą
osią ma strzałkę i rzeczywistą liczbę. Nierówność lub zapis LOD/LOQ
nie tworzą dokładnej kropki.

## Wiek z już podanej daty urodzenia

Osobne przejściowe `infantTtChronologicalAge` służy wyłącznie bieżącemu
wykresowi TT chłopca. Jawny opt-in `includeInfantTtTail` pozwala użyć
istniejącej daty urodzenia do <12 miesięcy, bez ponownego pytania.
Domyślny odczyt kliniczny zachowuje granicę <6 miesięcy; nie zmieniamy
rozstrzygania wieku laboratoryjnego, danych wizyty ani oceny historii.

Cache `vildaLabNeonatalAgeV1` zachowuje klucz i wersję 1. Późny rekord
niesie własny `infantTtTailOnly: true`; jego odczyt wymaga
`includeMinipuberty: true` i `includeInfantTtTail: true`. Dotychczasowy
odczyt LH ma osobny marker i opt-in. Żadna z tych zgód
nie rozszerza automatycznie pozostałych analitów.

Data kalendarzowa nie podaje godziny urodzenia. Cache zachowuje możliwe
ukończone dni `[lower,upper]`, a wykres używa całego przedziału
`[lower/365.25;(upper+1)/365.25)`. Nie zastępujemy go dokładnym dniem.
Nie eksportujemy daty urodzenia ani nie przepisujemy danych pacjenta.

| Dane wieku | Przedział wykresu / zachowanie |
| --- | --- |
| Ukończone 6 miesięcy | `[182,625;213,0625)` dnia przecina granicę; bez nowej kropki. |
| Ukończone 7–11 miesięcy | Cały przedział mieści się w nowej domenie przy pozostałych spełnionych warunkach. |
| 213 dni kalendarzowych bez godziny | Cache `[212,213]`, przedział `[212,214)`; nie mieści się ściśle po 212. dniu. |
| 214 dni kalendarzowych bez godziny | Cache `[213,214]`, przedział `[213,215)`; może otrzymać sam wynik. |
| 365 dni kalendarzowych bez godziny | Przedział `[364,366)` przecina granicę jednego roku; brak nowej ścieżki niemowlęcej. |

Przykłady dokładnych współrzędnych dni w API nie obiecują takiej
precyzji na podstawie samych ukończonych dni, miesięcy lub daty.

## Cytowanie objaśnień medycznych

Właściciel wymaga krótkiego klikalnego odsyłacza bezpośrednio przy
objaśnieniu i pełnego cytowania z lokalizacją danych w rozwijanych
źródłach. Nowa struktura `insightReferences` oddziela te informacje
od numerycznego odniesienia pacjenta.

| Twierdzenie w opisie TT | Źródło i granice wniosku |
| --- | --- |
| W okresie pokwitania stężenie testosteronu wzrasta. | Madsen A i wsp., *Reference Curves for Pediatric Endocrinology: Leveraging Biomarker Z-Scores for Clinical Classifications*, JCEM 2022;107(7):2004–2015, [DOI dgac155](https://doi.org/10.1210/clinem/dgac155). Modele chłopców 6–18 lat; suplement tabela 1, arkusz `LCMSMS hormones`. To model wieku przekrojowej populacji, nie indywidualna trajektoria lub dokładny wiek maksimum młodej dorosłości. |
| W badaniu dorosłych najwyższa średnia dotyczyła grupy 18–29 lat, a w starszych grupach była niższa. | Walravens J i wsp., *Age-Stratified Reference Ranges for Directly Measured Serum Free Testosterone in Community-Dwelling and Healthy Men*, JCEM 2026;111(3):e787–e793, online 10.09.2025, [DOI dgaf507](https://doi.org/10.1210/clinem/dgaf507), tabela 1, wiersz **Total T, nmol/L**. 1194 mężczyzn 18–86 lat; TT z surowicy oznaczany rano na czczo LC-MS/MS. Tytuł pracy dotyczy wolnego T, ale cytowany wiersz opisuje całkowity T. |
| Kolejność wczesnych szczytów hormonów w minipuberty. | Busch 2022, Methods/Results i opis badania; [DOI dgac115](https://doi.org/10.1210/clinem/dgac115). Nie przypisujemy szczytu odrębnej średniej podłużnej dokładnej medianie dnia. |

Średnie TT Walravensa wynoszą kolejno 20,7; 20,0; 18,1; 16,9; 17,1;
17,0 i 15,9 nmol/L. Wszystkie starsze grupy mają średnią niższą od
18–29, ale nie występuje ściśle monotoniczny spadek w każdej dekadzie.
Młodsze zdrowe i starsze populacyjne kohorty różnią się stanem zdrowia;
porównanie nie izoluje starzenia ani nie przewiduje zmian u jednej
osoby. Są to średnie grup, nie mediany lub normy. Nie przenosimy ich
do wieku niemowlęcego.

## Syntetyczne wejście → oczekiwane zachowanie

Przy fikcyjnym donoszonym chłopcu, gotowym aktualnym kontekście,
zgodnej osobie i pozostałych spełnionych warunkach:

| Wejście | Oczekiwanie |
| --- | --- |
| Dokładne 212 dni, TT 0,4 nmol/L | Dotychczasowa kropka i dotychczasowa mediana, bez nowej ścieżki. |
| Dokładne 213, 300 lub 365 dni, TT 0,4 nmol/L | Sam punkt 0,4, bez mediany, łącznika lub ilorazu. |
| 300 dni, TT 10 ng/dL | Sam punkt na wysokości 0,3467 nmol/L, etykieta w obsługiwanej jednostce wyniku. |
| 300 dni, TT 0 albo wynik ponad osią | Zero na osi albo strzałka z rzeczywistą liczbą, ta sama krzywa i skala. |
| Cały wiek `[212,214)` dnia lub przecinający rok | Bez nowej kwalifikacji samego wyniku. |
| Dokładnie 1 rok | Dotychczasowy wybór źródła dziecięcego; bez ekstrapolacji Busch. |
| Nierówność, LOD/LOQ, pusty wynik, nieobsługiwana jednostka | Bez dokładnej kropki i bez imputacji. |
| Wcześniactwo, brak donoszenia, niegotowy lub obcy kontekst, znana niezgodność | Bez obejścia dotychczasowego odrzucenia. |
| Porównanie płci w 300. dniu | Bez nowego punktu lub mediany TT; dotychczasowy kontrakt porównania. |

## Wpływ kliniczny i weryfikacja

Zmienia się wyłącznie widoczność edukacyjnego punktu wpisanego wyniku
i cytowanie objaśnień. Rejestr nadal zawiera **85 profili**;
`busch2022-male-t` zachowuje wszystkie **360 węzłów**, wartości,
flagi i dawną kwalifikację liczbową do 212. dnia. Nie zmieniamy RI,
oceny klinicznej, czasu dojrzewania, historii, migawek lub konwersji.
Nie dodajemy migawki edukacyjnej TT; dotychczasowa pozostaje AMH-only.

Regresje mają wywoływać rzeczywiste produkcyjne API i adapter,
sprawdzać granice całego wieku, kontekst i zmianę osoby, nierówności,
jednostki, brak mediany/metadanych odniesienia, zwykłe skale, porównanie
płci i wcześniejsze profile. Interfejs wymaga kontroli desktop/mobile,
cytowań i pełnego ekranu; PWA — rzeczywistego zimnego restartu offline.
Wykonane testy i wszystkie kontrole GitHub końcowego SHA podaje PR.
Ten kontrakt opisuje wymagania, a nie deklaruje jeszcze ich przejścia.
