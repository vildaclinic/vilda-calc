# LH chłopców w późnym niemowlęctwie — mediana modelu i sam wynik

**Decyzja właściciela z 26.10.2026:** po zakończonym audycie pełnego
źródła i odczytu wektorowego właściciel polecił wdrożenie podziału:
przybliżona mediana modelu dla całego znanego wieku w **(243;326] dnia**,
a później sam rzeczywisty wynik do wyłącznego końca jednego roku.
To zmiana edukacyjnego porównania, bez nowej normy laboratoryjnej,
rozpoznania lub deklaracji walidacji klinicznej. Nie wymaga nowych pytań.

Własny [ekstrakt audytu](evidence/male-infant-lh-tail-audit-2026-10-26.json)
zawiera źródłowe fakty, hashe i zakres kontroli geometrii. Pełne materiały
wydawcy oraz robocze raporty pozostają poza publicznym repozytorium.

## Źródło, populacja i oznaczenie

Busch AS i wsp., *Dynamic Changes of Reproductive Hormones in Male
Minipuberty: Temporal Dissociation of Leydig and Sertoli Cell Activity*,
JCEM 2022;107(6):1560–1568,
[DOI 10.1210/clinem/dgac115](https://doi.org/10.1210/clinem/dgac115),
[PMID 35225342](https://pubmed.ncbi.nlm.nih.gov/35225342/).
Sprawdzono pełny końcowy dziewięciostronicowy artykuł, Methods/Results
s. 1561–1562, ryc. 3 i podpis s. 1565 oraz ograniczenia s. 1566.
Publikacja online: 28.02.2022; wersja poprawiona i złożona: 17.03.2022.

- Prospektywne populacyjne badanie COPENHAGEN Minipuberty 2016–2018,
  Rigshospitalet, Kopenhaga. Zdrowi donoszeni chłopcy z ciąż pojedynczych;
  autorzy opisują populację wyłącznie jako kaukaską. Nie jest to model
  wcześniaków ani pełne odzwierciedlenie populacji międzynarodowej.
- Obserwacja pourodzeniowa: **119 chłopców, 630 wizyt, 338 próbek surowicy**.
  To nie jest potwierdzone N dopasowania LH, każdego dnia lub samego ogona.
  128 chłopców obejmuje także dziewięciu z samą próbką pępowinową.
  Próbki pępowinowe nie weszły do pourodzeniowych krzywych referencyjnych.
- Wizyty obejmowały 4–440 dni. Nie oznacza to pełnego wsparcia LH w każdym
  wieku i nie rozszerza istniejącej domeny aplikacji. Szczegółowe kryteria
  rekrutacji autorzy odsyłają do osobnego opisu kohorty; nie dopisujemy
  z niego niezweryfikowanych wyłączeń ani granicy tygodni ciąży.
- Surowica z krwi żylnej, przechowywanie −20°C. LH: **AutoDELFIA**,
  time-resolved fluoroimmunometric assay, PerkinElmer **B031-101**,
  jednostka **IU/L**, źródłowe **LOD 0,05 IU/L**, interassay CV <5%.
  Nie podano osobnego LOQ LH ani niskich stężeń próbek kontroli jakości.
  Pora pobrania i bycie na czczo nie zostały określone; nie oceniono
  zmienności dobowej.

Źródłowa metoda, materiał, terminowość urodzenia i warunki pobrania
opisują badanie. Nie stają się automatycznie ustalonymi faktami o próbce
pacjenta. Nieznane fakty pozostają nieznane, a znana niezgodność zachowuje
dotychczasową bramkę doboru profilu.

### Model i niskie wyniki

Rycina 3 przedstawia wiekowe krzywe GAMLSS. Czarna linia to modelowana
mediana M, szare linie ±1/±2 SDS. LH transformowano pierwiastkowo przed
analizą i przekształcano odwrotnie; współrzędne opublikowanej ryciny są
już w IU/L. Nie potęgujemy ich ponownie. Rycina 2 pokazuje osobne,
znormalizowane średnie trajektorie podłużne i nie jest źródłem tej P50.

Autorzy raportowali wyniki poniżej LOD/LOQ jako połowę odpowiedniego
limitu. Dla źródłowego LH daje to arytmetycznie 0,025 IU/L, bez znajomości
rzeczywistego stężenia poniżej LOD. Szczegóły włączenia tych wyników do
funkcji wiarygodności GAMLSS nie zostały osobno podane. Nie twierdzimy,
że zastosowano konkretny model cenzury lub potwierdzony algorytm
dopasowania do wartości zastępczych. Także mediana ponad LOD może zależeć
od niskich pomiarów.

W grupie 340–390 dni **18 z 34 próbek LH (53%)** było poniżej LOD
(Results, s. 1562). To wynik zbiorczej grupy, nie odsetek każdego dnia.
Modelowana mediana poniżej LOD nie jest automatycznie nieważna, lecz
precyzyjny odczyt jej kreski nie odzyskuje dokładnej mediany niezmierzonych
stężeń biologicznych. Szare SDS i CV oznaczenia nie są przedziałem
ufności ani błędem odczytu mediany.

**0,05 IU/L jest LOD metody publikacji.** Nie jest LOD próbki pacjenta,
LOQ LH, górną normą przedpokwitaniową, RI ani progiem rozpoznania CPP.
Odrębne dziecięce odniesienie ≤0,3 z
[LH_CHILDHOOD_REFERENCE.md](../LH_CHILDHOOD_REFERENCE.md) nie obejmuje
tego wieku i nie jest tutaj przenoszone.

### Sprawdzone suplementy

26.10.2026 sprawdzono bieżące metadane, listy wersji i pliki wszystkich
trzech oficjalnych suplementów Figshare; każdy miał tylko wersję 1
i jeden plik:

| Materiał | Zawartość i znaczenie dla tego wdrożenia |
| --- | --- |
| [Supplemental Figure 1 v1](https://doi.org/10.6084/m9.figshare.19093787.v1) | SHBG i wolny testosteron; bez liczbowego modelu LH. |
| [Supplemental Figure 2 v1](https://doi.org/10.6084/m9.figshare.19093790.v1) | Zmienność SDS; średnia SD SDS LH 0,69 nie jest niepewnością mediany wieku. |
| [Supplemental Table 1 v1](https://doi.org/10.6084/m9.figshare.19093793.v1) | Statystyki grupowe INSL3; bez LH, LMS lub dziennych P50. |

W pełnym artykule, tych suplementach i celowanym przeszukaniu publicznym
nie znaleziono liczbowego eksportu ani kompletnego obiektu dopasowania LH.
To nie dowodzi, że autorzy go nie posiadają. Nie kontaktowano się z nimi.

## Odczyt źródła i decyzja prezentacji aplikacji

Pozostaje ten sam [historyczny ekstrakt wektorowy](evidence/patient-point/busch2022-figure3-vector-medians.json).
Ponowny odczyt czarnej ścieżki ryciny odtworzył wszystkie **394 węzły
dni 7–400** z maksymalną różnicą **0,000000494 IU/L** względem zachowanych
wartości zaokrąglonych do sześciu miejsc. Nie jest to nowa tabela autora.
Dotychczasowy PCHIP między dziennymi węzłami pozostaje przybliżeniem
aplikacji; nie odzyskano autorskich współczynników LMS.

Dawna bramka LH wymagała co najmniej
`LOD + połowa grubości kreski + maksymalna reszta kalibracji Y`,
czyli około `0,170751424 IU/L`. Ostatnim kwalifikującym całym dniem był
243. **Połowa grubości kreski nie jest błędem modelu, pomiaru ani środka
ścieżki wektorowej.** Pięć sprawdzonych kalibracji zmieniało odczyt
244–365 dni o najwyżej około 0,0000491 IU/L; porównanie PCHIP z rodzimą
krzywą Béziera w 489 wiekach co ćwierć dnia dało maksymalnie około
0,0000329 IU/L. To kontrole geometrii i analizy wrażliwości, nie pełny
przedział niepewności lub walidacja medyczna.

Nowa [polityka](male-lh-infant-tail-policy.json)
ma ID `male-lh-infant-tail-2026`, wersję `2026-10-26.1` i odrębne części:

| Cały znany wiek | Prezentacja w zwykłym „Całym życiu” i „Minipuberty” |
| --- | --- |
| Dotychczas kwalifikujący wiek do 243. dnia włącznie | Zachowany dawny wynik i odniesienie; nowa ścieżka nie zmienia ich kontraktu. |
| **(243;326] dnia** | Dokładny wynik i **przybliżona mediana modelu Busch 2022**, znak ≈ i dwie cyfry znaczące mediany. |
| **(326 dni;1 rok)** | Sam dokładny wynik, bez liczbowej mediany, jasnego znacznika, łącznika i ilorazu do mediany. |
| Przedział przecinający 243 lub 326 albo koniec jednego roku | Brak nowego porównania/punktu; nie wybieramy arbitralnie jednego wieku. |

**326 dni jest decyzją prezentacji aplikacji.** To ostatni całkowity
dzień z odczytem P50 powyżej źródłowego LOD, odporny na sprawdzone
warianty kalibracji. Źródłowy model nie kończy się w tym dniu, a przejście
na sam wynik nie oznacza unieważnienia dalszej modelowanej mediany.
Nie podstawiamy zera, 0,025 ani 0,05 jako mediany. Nie przenosimy tej
decyzji na inne anality lub inne oznaczenie pacjenta.

W silniku obowiązuje istniejące `365,25 dni/rok`; dokładne 365,25 dnia
nie należy do niemowlęcego profilu Busch. Węzeł podtrzymujący interpolację
ani ekstrakt do dnia 400 nie rozszerzają domeny aplikacji. Dokładne 326
może kwalifikować się do mediany, lecz wiek obejmujący dalszą część dnia
nie jest automatycznie dokładnym dniem 326. Nie dopisujemy daty urodzenia
lub dnia do ukończonych lat/miesięcy.

### Wiek z już podanej daty urodzenia

Główny formularz może już znać datę urodzenia. Dla tej samej aktualnej
osoby wykorzystujemy pochodny wiek bez dodatkowego pola lub ponownego
pytania. `VildaLabNeonatalContext.readForm({ includeInfantLhTail: true })`
dopuszcza daty kalendarzowe do <12 miesięcy; domyślne `readForm()`
zachowuje dotychczasową granicę <6 miesięcy. Publikator używa tego
jawnego opt-in i istniejącego klucza sesyjnego `vildaLabNeonatalAgeV1`,
wersji 1. Późny rekord ma `infantLhTailOnly: true` oraz dotychczasowe
`minipubertyOnly: true`. Odczyt takiego wieku wymaga obu opcji
`includeMinipuberty: true` i `includeInfantLhTail: true`; starszy odczyt
kliniczny bez nowej opcji go nie otrzymuje. Nie przedłużamy tygodni
ani nie wyliczamy dni z samych ukończonych miesięcy. Data urodzenia
nie trafia do tego cache lub wyjścia, wspólne dane pacjenta nie są
przepisywane, a zapisany dzień wizyty zachowuje swoje zakotwiczenie.

Osobne przejściowe `infantLhChronologicalAge` służy wyłącznie wykresowi
bieżącego LH chłopca, przy gotowym kontekście, zgodnej osobie,
płci i wieku formularza oraz bez historycznej daty/kontekstu.
Nie jest wejściem biochemicznej interpretacji, nowym zapisem lub sposobem
uściślenia innych analitów. Zachowuje dotychczasowe bramki odtwarzania,
czyszczenia, blokady, aktualnego dnia i zgodności formularza.

Cache zapisuje **możliwe ukończone dni**, nie dokładny upływ od godziny
urodzenia. Przedział `[lower,upper]` daje dla wykresu zachowawczy
przedział wieku `[lower/365.25;(upper+1)/365.25)`; koniec jest wyłączny.
Nie zastępujemy go dokładnym dniem ani nie zmieniamy dotychczasowego
obwiedzenia wieku w klinicznym `resolveAge` dla innych ocen.

| Wiek kalendarzowy, bez godziny urodzenia | Przejściowy przedział dni wykresu | Kwalifikacja nowej ścieżki |
| --- | --- | --- |
| 244 dni → cache `[243,244]` | `[243,245)` | Nie mieści się w `(243;326]`. |
| 325 dni → cache `[324,325]` | `[324,326)` | Przybliżona mediana. |
| 326 lub 327 dni | Odpowiednio `[325,327)` / `[326,328)` | Przecina granicę 326; bez nowej kropki/mediany. |
| 328 dni → cache `[327,328]` | `[327,329)` | Sam wynik. |

Przykłady dokładnego 244/326/327 dnia w kontrakcie API nie oznaczają,
że data kalendarzowa dostarcza takiej dokładności. O kwalifikacji zawsze
decyduje cały znany przedział.

**Porównanie płci zachowuje osobny dotychczasowy kontrakt**, w tym brak
nowego punktu LH po 243. dniu. Nowe części polityki są `ordinaryOnly`;
nie zmieniają krzywych lub skal porównania, wstawki cyklu albo innych
hormonów. Linia edukacyjna i stała skala zwykłego wykresu również
pozostają niezależne od wyniku, wieku i liczby zaznaczonych hormonów.

## Silnik, kontekst i granice fallbacku

Runtime udostępnia `infantLhTailPolicy`, z `numericReference` oraz
`resultOnlyPolicy`. Profil `busch2022-male-lh` niesie kopię
`numericReferencePolicy`. Tylko kwalifikacja LH dla dni 244–326 zostaje
rozszerzona; wartości, archiwalny ekstrakt i pozostałe 84 profile są
zachowane. Rejestr ma wersję `2026-10-26.1` i nadal zawiera 85 profili;
nowa polityka nie tworzy 86.

- `male-lh-infant-tail-model-median`,
  `kind: educational-model-median-extension`: zwykłe `evaluate()` zwraca
  metadane `referencePolicy` tylko po kwalifikacji nowego odcinka. Ścieżka
  do dnia 243 zachowuje dotychczasowy kształt odpowiedzi.
- `male-lh-infant-tail-result-only`, `kind: educational-result-only`:
  `evaluateResultOnly()` może pokazać wynik wyłącznie po dobraniu
  zgodnego, gotowego profilu Busch i odrzuceniu samego odniesienia
  liczbowego jako `reference-unavailable` w całym późnym zakresie.
  To nie jest ogólny fallback po błędzie wyboru źródła.

Obie nowe ścieżki wymagają jawnej górnej granicy pełnego wieku wraz
z jej włącznością oraz `infantLhContextAvailable: true`. Adapter
wykorzystuje istniejący aktualny kontekst pacjenta i gotowość źródła.
Zmiana osoby, zablokowany vault, przygotowywanie/odtwarzanie/czyszczenie
stanu lub wynik odnoszący się do dawnego kontekstu nie uprawnia do
zastąpienia go dzisiejszym wiekiem.

Pozostają wszystkie dotychczasowe warunki zgodnego profilu: płeć,
donoszenie, materiał/metoda oraz znane leczenie, stymulacja
i przeciwwskazania. Nowa polityka nie odzyskuje punktu po odrzuceniu
źródła z tych powodów. Brak odpowiedzi nie potwierdza nieobecności
leczenia lub innych faktów. Dobór odniesienia i części polityki nie
zależy od wysokości wpisanego LH.

Dokładna kropka wymaga skończonego, nieujemnego wyniku i obsługiwanej
jednostki. Zero pozostaje zerem; wynik ponad stałą osią ma strzałkę
z rzeczywistą liczbą. `IU/L = mIU/mL` liczbowo. Nierówność, zapis LOD/LOQ,
pusty wynik lub niezgodna jednostka nie tworzą dokładnej kropki;
nie podstawiamy granicy jako stężenia. Mediana nie jest granicą normy,
a odległość lub iloraz do niej nie nadają laboratoryjnego werdyktu.

## Normy, historia i wpływ kliniczny

Zmienia się dostępność edukacyjnego odniesienia po 243. dniu oraz
prezentacji rzeczywistego wyniku w końcu niemowlęctwa. Laboratoryjne RI,
ich porównania i ostrzeżenia pozostają niezależne. Zapisane oceny nie
są ponownie liczone z dzisiejszym wiekiem, modelem lub polityką.
Nie dodajemy historycznej migawki LH lub nowego pola zapisu; dotychczasowy
snapshot edukacyjnego odniesienia pozostaje AMH-only. Nie zmieniamy
testosteronu po 212. dniu, reguł wcześniactwa ani innych analitów.

Autorzy wskazują, że wartość kliniczna krzywych w rozpoznawaniu zaburzeń
rozrodczych wymaga dalszej oceny. Akceptacja właściciela dotyczy tego
konkretnego sposobu prezentacji; nie nadaje digitalizacji, modelowi
lub aplikacji statusu walidacji klinicznej.

## Syntetyczne wejście → oczekiwane zachowanie

Poniżej wyłącznie fikcyjne dane, przy gotowym aktualnym kontekście,
donoszonym chłopcu, zgodnej jednostce i pozostałych spełnionych bramkach.

| Wejście | Oczekiwane zachowanie |
| --- | --- |
| Dokładne 243 dni, LH 0,4 IU/L | Zachowana dotychczasowa ścieżka i mediana ≈0,173137. |
| Dokładne 244 dni, LH 0,4 IU/L | Punkt 0,4 oraz przybliżona mediana ≈0,17 IU/L; bez diagnozy lub zmiany RI. |
| Dokładne 300 dni, LH 0,1 IU/L | Punkt 0,1 oraz przybliżona mediana ≈0,070 IU/L. |
| Dokładne 326 dni, LH 0,1 IU/L | Przybliżona mediana ≈0,050 IU/L; nie podniesiona do źródłowego LOD. |
| Dokładne 330 lub 365 dni, LH 0,1 IU/L | Sam punkt 0,1, bez liczbowej mediany i ilorazu. |
| 330 dni, LH 0 lub wynik ponad osią | Zero na osi albo strzałka z rzeczywistą liczbą; ta sama linia i skala. |
| Cały wiek `[243,244)` lub `[326,327)` | Brak nowej kwalifikacji mediany i samego punktu. |
| Dokładne 365,25 dnia albo wiek przecinający rok | Bez rozszerzenia profilu niemowlęcego. |
| LH `<0,1`, `>0,1`, `<LOD`, pusty lub nieobsługiwana jednostka | Bez dokładnej kropki i bez imputacji. |
| Wcześniactwo, brak gotowego kontekstu, zmiana osoby, znana niezgodność | Bez obejścia dotychczasowego odrzucenia źródła. |
| Porównanie płci, 244 albo 330 dni | Zachowany dotychczasowy brak nowego punktu LH. |

Regresje mają wywoływać rzeczywiste funkcje produkcyjne, ich CommonJS
i browser-VM oraz rzeczywisty adapter/UI. Kontrakt obejmuje granice
i przedziały wieku, znacznik/strzałkę, nierówności, bramki źródła,
zmianę pacjenta, brak mutacji historii, niezmienność pozostałych profili
i zwykłych skal oraz odrębność porównania płci. Wdrożenie wymaga też
rzeczywistego sprawdzenia PWA, zimnego startu offline i ekranu mobilnego.
Wykonane testy, wyniki i kontrole GitHub dla końcowego SHA podaje PR;
ten kontrakt nie jest deklaracją ich wcześniejszego przejścia.
