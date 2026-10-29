# Dobowe wydalanie magnezu — Mg_mgkg

Stan polityki: 28.10.2026. Implementacja zatwierdzonej makiety Klirensu. Jedno obliczenie i jedna ocena, bez pytania o rozpoznanie hipomagnezemii i bez związanych z nim progów diagnostycznych. Liczby, jednostki, porównanie, raport oraz zapis korzystają z tego samego modelu.

## Formularz i arytmetyka

Pierwszy, domyślny tryb to stężenie magnezu w moczu (`mg/L`, `mmol/L`, `mg/dL`) i objętość całej zbiórki (`mL`, `L`). Drugi tryb przyjmuje gotowe wydalanie w `mg/24 h`, `mmol/24 h` albo `mg/kg/24 h`. Masa i wzrost pochodzą ze wspólnych danych pacjenta; ich brak nie blokuje ilości dobowej ze stężenia i objętości. Gotowy wynik na kg pozostaje dostępny także bez masy, z neutralną uwagą o braku ilości dobowej.

Ilość dobowa = stężenie w mg/L × objętość w L × 24 / czas zbiórki w godzinach. Przelicznik jednostek molowych wynosi 24,305 mg/mmol, zgodnie ze skróconą masą atomową Mg CIAAW 2024 (24,305 ±0,002). Nie jest to twierdzenie o dokładnej, niezmiennej masie atomowej każdego materiału.

W nowym obliczeniu brak czasu lub puste pole oznacza jawnie przyjęte 24 h. Nieprawidłowy jawny wpis, np. zero, liczba ujemna lub tekst, wymaga poprawienia i nie staje się 24. `durationSource` rozróżnia założenie 24 h, wpisane godziny i odtworzony czas liczbowy. W innym czasie wynik stężenie × objętość jest przeliczany do 24 h, ale bez automatycznej normy pełnej DZM. Gotowy wynik w jednostce dobowej jest już ilością dobową i nie jest drugi raz skalowany przez nieaktywny czas/stężenie/objętość.

Jawnie znana niepełna lub błędna zbiórka blokuje użycie jej jako poprawnej zbiórki. Niezaznaczony, historyczny checkbox nie zostaje automatycznie uznany za informację o błędzie; zachowujemy natomiast jawne odpowiedzi negatywne oraz `Cl24CollectionProblem`.

Obliczenia jednostek i porównania używają dokładnych ułamków dziesiętnych. Nie dopuszcza się ujemnego stężenia/wydalania ani zerowej/ujemnej objętości, podanej masy lub wzrostu. Dokładne zero jest liczbą z neutralną uwagą o sprawdzeniu raportu i oznaczalności, bez diagnozy niedoboru. Mała dodatnia wartość nie jest prezentowana jako zero. Nierówność względem granicy jest ustalana przed zaokrągleniem; prezentacja pozostaje po tej samej stronie granicy. Wpisy, których cyfr nie da się zachować w kontrakcie liczbowym, oraz przepełnienie/niedomiar wyniku dają błąd zamiast zmienionej liczby.

## Populacje i odniesienia

Normy są w osobnym, wersjonowanym pliku `clcr_mg_dzm_reference_data.js`, jako argument silnika. Nie ma wbudowanej zastępczej normy wieku. Brak lub błędna polityka nie blokuje poprawnej ilości dobowej i pozostawia wynik bez automatycznej oceny.

| Populacja | Jednostka główna | Porównanie i granice |
| --- | --- | --- |
| Dzieci >2 do <18 lat, znana masa i wzrost | mg/1,73 m²/24 h | Pomocniczy próg pediatryczny >88; dokładnie 88 jest granicą, nie spełnia >88. Bez dobranej górnej granicy. |
| Dorośli, dokładny wiek 18–83 lata włącznie | mg/24 h | Mayo MAGU 51–269; obie granice włączone, obie płcie. |
| Do 2 lat, powyżej 83 lat, nieznany wiek lub brak pełnego pokrycia wieku | mg/24 h, ewentualnie gotowe mg/kg/24 h | Bez automatycznego odniesienia. |
| Kwalifikujące się dziecko bez danych do BSA | mg/24 h, ewentualnie gotowe mg/kg/24 h | Liczba dostępna; nie stosuje się dorosłego zakresu ani arbitralnie przeliczonego progu na kg. |

Wiek podany tylko w ukończonych latach reprezentuje przedział [wiek, wiek+1). Cały ten przedział musi należeć do populacji odniesienia. Dla ukończonych 2 lat lub 83 lat ta reguła nie daje pewnego porównania. Dane z dni/miesięcy lub inny zapis dokładnego wieku zachowują własną dokładność. Nie rozszerzamy literalnego górnego wieku Mayo z 83 do 84 lat.

Pediatryczne porównanie używa istniejącej funkcji `ClcrExtendedEgfr.computeHaycockBsa`, z masą w kg i wzrostem w cm. Ilość dobowa ×1,73/BSA daje wynik na 1,73 m². Przy kwalifikującym wieku i dostępnych danych jest to główna wartość; ilość dobowa pozostaje krótkim przeliczeniem w tej samej karcie. BSA i metoda są utrwalane. Brak lub niepowodzenie funkcji BSA nie tworzą pytania o już wpisaną masę/wzrost — ilość dobowa pozostaje dostępna z konkretną informacją o braku porównania.

Pediatryczne >88 jest **pomocniczym progiem w piśmiennictwie dotyczącym kamicy**, nie pełnym zakresem laboratoryjnym, diagnozą niedoboru, oceną skuteczności leczenia lub rozpoznaniem nerkowej utraty. Wartość powyżej progu nazywa się „Wydalanie nieobniżone”; brak górnej granicy nie uzasadnia oznaczania dużej wartości jako automatycznie patologicznej. Przy niskim wyniku obowiązuje zaakceptowany tekst: „Może wiązać się z małą podażą lub słabym wchłanianiem magnezu; sam wynik nie rozpoznaje niedoboru magnezu.”

Mayo to zakres laboratoryjny dla konkretnej metody i zbiórki, nie potwierdzenie prawidłowych całkowitych zasobów magnezu. Wynik należy odnieść do stężenia we krwi, podaży, leków i czynności nerek. Zgodnie z decyzją właściciela nie ma dodatkowego selektora rozpoznania ani automatycznego dobowego progu utraty nerkowej.

EAU <3 mmol/24 h jest opisane wyłącznie w Szczegółach jako inny próg uwagi w ocenie kamicy dorosłych. Nie tworzy równoległej, konkurencyjnej interpretacji ani automatycznego zalecenia suplementacji. Samo małe wydalanie nie rozpoznaje kamicy.

## Pełne źródła, wersje i ograniczenia

Odczyt źródeł: 28.10.2026. W audycie przeczytano pełne katalogi/teksty oraz wskazane tabele; pliki źródłowe i ślad audytu pozostają w dokumentacji roboczej. Nie dołączamy materiałów wydawców ani danych pacjenta do publicznego repozytorium.

1. [Mayo Clinic Laboratories, MAGU, Magnesium, 24 Hour, Urine](https://www.mayocliniclabs.com/test-catalog/Overview/610768), aktualny katalog i [PDF test definition](https://www.mayocliniclabs.com/test-catalog/download-setup?format=pdf&unit_code=610768), sekcja Reference Values: 51–269 mg/24 h, nie ustalono <18 i >83 lat; metoda kolorymetryczna. Instrukcja Roche jest cytowana przez katalog; nie przedstawiamy jej jako osobiście odczytanego niezależnego dokumentu. Sam katalog zastrzega wspólną ocenę magnezu w moczu i surowicy oraz ograniczenie podczas wlewu magnezu.
2. Pięta J, Szyszka M, Lipiński P, Skrzypczyk P. *Urolithiasis in Children—Clinical Picture, Pathogenesis, and Diagnostic Approach*. Biomolecules 2026;16:119, opublikowano 9.01.2026, [DOI 10.3390/biom16010119](https://doi.org/10.3390/biom16010119). Pełny PDF, tabela 3, s.7–8: >2 lata, Mg >88 mg/1,73 m²/24 h. Przegląd pediatrycznej oceny kamicy, nie nowa walidacja pełnego zakresu zdrowej populacji.
3. Penido MGMG, Tavares MS. *Beyond kidney stones: Why pediatricians should worry about hypercalciuria*. World J Clin Pediatr 2021;10(6):137–150, [DOI 10.5409/wjcp.v10.i6.137](https://www.wjgnet.com/2219-2808/full/v10/i6/137.htm), pełny HTML i tabela 1: masowy próg >88 mg/1,73 m². Tabela adaptowana z [przeglądu autorów z 2015, DOI 10.5527/wjn.v4.i4.444](https://www.wjgnet.com/2220-6124/full/v4/i4/444.htm), również odczytanego w audycie.
4. [EAU Guidelines on Urolithiasis 2026](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention), rozdział 4.1.4, tabela 4.2: <3 mmol/day, ocena kamicy dorosłych. Tabela 4.4 dla dzieci nie zawiera Mg w DZM; Mg/Cr z tabeli 4.3 dotyczy próbki punktowej i nie jest podstawą dobowego progu.
5. [CIAAW Abridged Standard Atomic Weights 2024](https://ciaaw.org/abridged-atomic-weights.htm), Mg 24,305 ±0,002; przyjęty kliniczny przelicznik 24,305 mg/mmol.

W źródłach pediatrycznych odnotowano niespójności: wiersze punktowego Mg/Cr w pracy Pięty mają problematyczne znaki nierówności; Hoppe/Kemper 2010 zestawia >0,04 mmol z 0,8 mg/kg, co nie odpowiada przelicznikowi Mg; inna starsza tabela podaje niespójny odpowiednik molowy przy 88 mg. Nie wykorzystujemy tych wierszy/przeliczeń ani nie łączymy ich w korzystniejszą normę. Wybór masowego progu 88 jest jawnie ograniczony i zgodny w tabelach 2021/2026.

## Historia, edycja i zapis

`clcr_mg_dzm_persistence.js` czyta wyłącznie zamrożony pomiar, granice, źródła, BSA i jego metodę. Nie wywołuje dzisiejszego silnika, katalogu norm ani funkcji BSA. Weryfikuje własny kontrakt wersji 1, zgodność dokładnych liczb, zaokrąglenia, statusu, jednostki i powiązania z `labResult`. Granica dolna „>88” ma przy równości status odpowiadający wynikowi poniżej wymaganego progu, nie powyżej górnej granicy.

Historyczne pomiary zachowują liczbę, jednostkę i ocenę z dnia zapisu. Stare /kg bez utrwalonej normy pozostaje neutralne; nawet ujemny zapis błędu starego silnika nie zostaje automatycznie przepisany na inną liczbę. Mały dodatni surowy wynik nie jest odtwarzany jako zero tylko dlatego, że dawny tekst był „0,0”. Serie mg/24 h, mg/kg/24 h i mg/1,73 m²/24 h pozostają rozdzielone.

Przy świadomej edycji starego wpisu mapujemy U_Mg jako mg/L i V24 jako mL. Zachowany liczbowy czas jest używany wprost. Jeżeli stary wpis ma wyłącznie lokalne daty bez offsetu i bez zapisanego czasu liczbowego, wymagane jest jawne podanie godzin. Nie używamy `Date.parse` w aktualnej strefie urządzenia i nie podstawiamy nowego domyślnego 24 do dawnego, nieznanego czasu. Prywatna flaga potwierdzenia czasu nie jest dodatkowym pytaniem w nowym formularzu.

## Przypadki regresyjne i testy

Testy wywołują rzeczywiste moduły produkcyjne, w tym istniejący Haycock:

- 10 lat, 30 kg, 135 cm, Mg 20 mg/L, objętość 1500 mL, 24 h → 30 mg/24 h, BSA 1,0564292378223323 m², główne 49,12775805692763 mg/1,73 m²/24 h, pokazane 49,13, poniżej >88.
- 1,25 mmol/L ×1,6 L i równoważne mg/L oraz mg/dL → 48,61 mg/24 h.
- Dorosły: 51 i 269 są w zakresie; 50,999999999 oraz 269,000000001 pozostają po właściwej stronie granicy również w prezentacji.
- Rzeczywista funkcja Haycock dla fikcyjnego 10-latka o masie 60 kg i wzroście 182,93671255949508 cm daje dokładnie reprezentowane BSA 1,73; gotowe 88 mg/24 h jest dokładnie na ścisłej granicy >88. Ten techniczny przypadek testuje nierówność, nie modeluje typowego wzrostu.
- Brak masy/wzrostu, nieznany wiek, brak kwalifikującego profilu i brak funkcji BSA nie blokują dostępnej liczby. Gotowe /kg bez masy nie nazywa się dostępną ilością dobową.
- Zero, wartości ujemne, bardzo małe dodatnie, nieprawidłowy czas, znana błędna zbiórka, uszkodzony zapis, normalizacja sejfu i zamrożone źródła mają osobne testy.

Testy automatyczne sprawdzają te kontrakty; nie nadają algorytmowi statusu walidacji klinicznej.
