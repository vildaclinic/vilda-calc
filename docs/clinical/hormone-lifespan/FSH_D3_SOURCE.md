# FSH — źródłowa mediana wieku w 3. dniu cyklu

Właściciel zaakceptował makietę i implementację osobnego edukacyjnego bloku
FSH dnia 3 po przeglądzie pełnego tekstu i ujawnieniu niespójności LMS
(23.10.2026). Zgoda dotyczy **literalnej kolumny P50(M)**, bez odtwarzania
całego modelu, SDS, percentyli lub nowych RI. Akceptacja zakresu i kodu nie
oznacza niezależnej walidacji medycznej źródła.

## Źródło, populacja i oznaczenie

Grisendi V. i wsp., *Age-specific reference values for serum FSH and
estradiol levels throughout the reproductive period*, **Gynecological
Endocrinology 2014;30(6):451–455**, DOI
[10.3109/09513590.2014.893572](https://doi.org/10.3109/09513590.2014.893572),
[PMID 24805832](https://pubmed.ncbi.nlm.nih.gov/24805832/).
Zweryfikowano dostarczony przez użytkownika pełny opublikowany artykuł,
metody na s. 452 i oryginalną tabelę 1 na s. 454, również na obrazie PDF.
CSV jest pomocniczym odwzorowaniem tabeli, nie danymi uczestniczek ani
niezależnym potwierdzeniem publikacji. Surowe PDF i CSV nie są częścią
repozytorium; nazwy, SHA-256 i pochodzenie ekstraktu zawiera
[audyt źródła](evidence/fsh-d3-source-audit-2026-10-23.json).

Jednoośrodkowa próba przekrojowa: **192 kobiety**, Institute of Obstetrics
and Gynecology, University of Modena, Włochy. Powody zgłoszenia: porada
przedkoncepcyjna N=103, antykoncepcyjna N=67, sterylizacja jajowodowa N=22.
Wymagano obu jajników oraz cykli 25–35 dni, z różnicą między cyklami
**<5 dni**. Wyłączano podawanie hormonów płciowych w poprzednich 6 miesiącach,
przebyte zapalenie narządów miednicy lub operację jajników i znaną chorobę
przewlekłą, układową, metaboliczną lub endokrynną, w tym hiperandrogenizm.
Nie jest to losowa próba wszystkich kobiet ani grupa o potwierdzonej
płodności każdej uczestniczki. Mediana wieku 36 lat, kwartyle 31,5–39,8;
liczebności poszczególnych roczników nie podano.

**Każde pobranie wykonano w 3. dniu cyklu.** Sam wybór fazy folikularnej
nie potwierdza tego warunku. Surowica, wirowanie 2000 g przez 10 minut,
przechowywanie w −80°C. FSH: test chemiluminescencyjny **ADVIA Centaur,
Siemens Healthcare Diagnostics, Italy**; raportowana **czułość 0,1 IU/L**,
CV wewnątrz- i międzyseryjny **2,7% / 3,1%**. Nie podano wersji odczynników,
kalibratora, stężeń dla CV ani formalnych definicji LOD/LOQ. Nie przemianowujemy
„sensitivity” na zweryfikowany LOD lub LOQ. Brak opisu cenzury, imputacji
i liczby niskich wyników nie potwierdza ich nieobecności.

Metoda źródła nie ustala metody próbki pacjentki. Nieznana metoda lub
materiał pozostają nieznane; nie oznaczają wyniku ujemnego wywiadu ani
potwierdzonej zgodności oznaczeń. Jawna niezgodność zachowuje znaczenie.
Parametry obecnego testu Siemens nie są dopisywane do historycznej kohorty.

## Co zweryfikowano liczbowo

Metody określają M jako medianę CG-LMS. Tabela 1 drukuje **29 P50(M)**
dla wieku **16–44 lata**, w IU/L i z precyzją 0,001. Przykłady bezpośredniego
odczytu: 20 → **4,803**, 30 → **5,941**, 40 → **7,078**, 44 → **7,533**.
Są to modelowane mediany wieku w tej próbie, nie średnie, empiryczne
mediany osobnych roczników lub coroczna trajektoria jednej kobiety.

Cała literalna kolumna M jest zgodna z deklarowanym trendem liniowym w
granicach precyzji druku. Dodatkowe sprawdzenie z symetrycznej pary P25/P75,
bez korzystania z drukowanej kolumny S, potwierdza **29/29 median**; największa
punktowa różnica wynosi około **0,000413 IU/L**. Jest to sprawdzenie
wewnętrzne tej samej tabeli, nie walidacja na niezależnej populacji.
Nie importujemy dopasowanej przez audytora prostej jako równania autorów.

**Pełnego LMS nie wolno używać.** Drukowane L=0,186472, S i M nie odtwarzają
**żadnej ze 116** komórek P5/P25/P75/P95 nawet przy tolerancji zaokrągleń.
Przykład wieku 30: wzór daje P5≈1,581936 / P95≈17,156359, podczas gdy druk
podaje 3,139 / 10,506 IU/L. Maksymalna różnica sięga 11,312757 IU/L;
największa tolerancja wynikająca z precyzji druku to około 0,004178 IU/L.

Na obrazie potwierdzono dodatkowo S35=0,7336, S44=0,9056 oraz P95 wieku
23=8,008 i 25=9,736. Żadnej komórki nie poprawiono. Glif wieku `I9` pomiędzy
18 i 20 odczytano jawnie jako 19 wyłącznie przy ekstrakcji uporządkowanej
kolumny M; źródłowy zapis jest zachowany w audycie. P5–P95 obejmowałoby
centralne 90%, a nie 95% RI lub CI. Nowy blok nie używa tych centyli,
odwróconego S, SDS, ilorazu wyniku do mediany ani progów diagnostycznych.

Kryteria włączenia drukują wiek 16–45, dyskusja mówi o kobietach poniżej
45, a tabela kończy się na 44. Zachowujemy tę rozbieżność: **koniec danych
liczbowych to 44**, nie 45. Nie dodajemy końcowego plateau, punktu 45 ani
ekstrapolacji. Wiek powyżej 18 w aplikacji to odrębna reguła umieszczenia
przy kontekście dorosłej kobiety, a nie przepisana granica kohorty.

## Kontrakt aplikacji

Czytelne `fsh-d3-data.json` jest odrębnym źródłem; bezpaństwowy evaluator
`VildaFshD3.evaluate(data, context)` przyjmuje dane jako argument i zwraca
odłączone od wejść źródło, politykę, domenę, węzły, medianę, `ageContext`
oraz osobny status porównania. Nie zmienia istniejących 85 profili zwykłego
punktu, norm laboratoryjnych FSH, informacji producenta Roche ani geometrii
Stricker. Blok dotyczy wyłącznie bieżącego FSH i używa istniejącego kontekstu
tej samej osoby. Własna linia źródłowa jest łamaną liniową przez literalne
węzły M, a nie przemodelowaną krzywą całego życia.

Jedynym dodatkowym pytaniem jest opcjonalne wskazanie, czy **ten wynik**
pochodzi z 3. dnia cyklu: `unknown` / `day3` / `other`. Informacja o źródle
i mediana dla wpisanego wieku są dostępne także bez potwierdzenia dnia 3;
wtedy nie ma punktu pacjentki. Samo `day3` nie zastępuje pozostałych warunków
porównania ani dokładnego wyniku. Nie zgadujemy dnia z fazy, wieku lub
stężenia i nie dodajemy ankiety o metodę, materiał, leczenie albo wywiad.
Dostępne już dodatnie fakty i niezgodności zachowują znaczenie; brak
odpowiedzi nie potwierdza nieobecności wyłączeń badania. Znana ciąża,
menopauza, leczenie hormonalne/GnRHa, stymulacja, jawna niezgodna metoda
lub materiał i niedostępny/historyczny kontekst wstrzymują ten blok.
To bramki aplikacji; nie wszystkie są literalnie opisanymi kryteriami autorów.

Jawny dzień 3 jest faktem bardziej szczegółowym niż brak ogólnej fazy:
`day3` wraz z fazą nieznaną/niepodaną lub folikularną może spełnić warunek
pobrania. Jawna faza lutealna lub owulacyjna pozostawia informację o źródle,
lecz blokuje punkt jako sprzeczny kontekst; nie zmieniamy fazy automatycznie.
Znana menopauza lub ciąża wstrzymuje cały ten blok, z zachowaniem odrębnej
istniejącej interpretacji laboratoryjnej oraz informacji Roche.

**Wiek:** zachowujemy istniejący kontrakt ciągłego wieku. Cały możliwy
przedział od `ageYears` do `ageUpperYears` musi mieścić się w aplikacyjnym
**(18,44]**. Dolne >18 jest regułą umieszczenia dla dorosłej kobiety;
górne 44 wynika z końca liczbowej tabeli, nie z oszacowania wieku menopauzy.
`ageContext` zwraca `lowerYears`, `upperYears`, `upperInclusive` oraz
`basis: 'entered-age-lower-bound'`. Odniesienie oblicza się przy dolnej
granicy **wpisanego** wieku. Nie wybieramy środka przedziału, nie zgadujemy
daty urodzenia i nie twierdzimy, że nieprecyzyjny wiek stał się dokładny.
Podpis prezentacji brzmi „dla wpisanego wieku”.

Na węźle zwracamy literalne M. Dla wieku ułamkowego między dwoma sąsiednimi
węzłami stosujemy **interpolację liniową**; wynik ma flagę `interpolated`.
To jawna polityka aplikacji, uzasadniona raportowaną liniowością M i spójnością
kolumny, a nie odzyskane współczynniki autorów ani rekonstrukcja LMS.
Nie wyznaczamy dodatkowych węzłów z dopasowanej globalnie prostej.
Przykładowo `[30,31)` daje odniesienie przy 30: **5,941 IU/L**;
30,5 oraz przedział `[30,5;30,5+1/12)` dają przy dolnej granicy **5,9975**,
liniowo między 5,941 i 6,054. Większa liczba cyfr tego obliczenia nie zwiększa
precyzji publikacji. `[43,44)` kwalifikuje, `[44,45)` nie; dokładne 44
kwalifikuje, ponad 44 nie. Nie przycinamy wieku do granicy tabeli.

To źródło edukacyjnego odniesienia, nie klasyfikacja płodności lub rezerwy
jajnikowej. Położenie względem mediany nie oznacza „w normie”, wyniku
dobrego/złego, odsetka pozostałych komórek jajowych ani szansy ciąży.
Nie importujemy P95 jako progu, a sam FSH nie zastępuje oceny klinicznej.

## Historia i granica zapisu

W tym konkretnym bloku przyjęto politykę **bieżącego odczytu bez zapisu**:
odpowiedź o dniu 3, dopasowana mediana i porównanie nie trafiają do
`lab.hormoneReference`, przypiętej oceny ani schematu historii. To jawny
zakres nowego bloku, nie uniwersalna reguła dla innych źródeł. Odczyt dawnego
wyniku nie nadaje mu dzisiejszego wieku lub lokalnej odpowiedzi o dniu 3.
Nie przelicza się istniejących zapisów na nowe źródło. Zmiana osoby,
analitu, wieku, fazy/kontekstu źródła lub wyniku usuwa lokalną odpowiedź
o dniu 3; zwykłe odświeżenie tego samego bieżącego wyniku nie tworzy nowego
wywiadu. Czyszczenie/reset usuwa stan i poprzednie liczby. Odpowiedź nie
przechodzi do kolejnego wyniku ani innej osoby.

Wynik laboratoryjny, jego operator, przeliczenia i istniejący werdykt
pozostają własnością dotychczasowej ścieżki. Wynik `<`/`>` lub `<LOD`/`<LOQ`
nie otrzymuje dokładnej wartości pacjentki; nie imputujemy granicy,
połowy granicy ani czułości historycznego testu.

## Przypadki źródłowe i sprawdzenia

- Dokładny wiek 30 lat → literalna P50 **5,941 IU/L**; zmiana stężenia
  pacjentki nie zmienia źródłowej mediany.
- Dokładny wiek 44 lata → końcowa opublikowana P50 **7,533 IU/L**;
  wiek ponad 44 nie otrzymuje wartości przez ekstrapolację.
- Dzień nieznany/inny niż 3 → źródłowa mediana dla wpisanego wieku,
  bez punktu pacjentki lub przyjęcia warunku pobrania dnia 3.
- Wiek `[30,31)` → mediana **5,941** przy wpisanej dolnej granicy;
  wiek 30,5 → interpolowana **5,9975**; `[44,45)` → brak bloku,
  bez zastępczego wieku 44.
- FSH `<5`, `<LOD` lub `<LOQ` → brak pozornego dokładnego stężenia
  oraz nowego percentyla, SDS lub oceny rezerwy.

Audyt pełnego tekstu i tabel jest zakończony. Wyniki testów rzeczywistych
funkcji, adaptera, historii i PWA oraz kontroli GitHub raportuje integrujący
PR dla finalnego SHA. Ten dokument nie przedstawia planowanych sprawdzeń
jako wykonanych ani technicznych testów jako walidacji klinicznej.
