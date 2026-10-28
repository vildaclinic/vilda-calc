# E2 — wiek kwalifikuje zakres przed stadium Tannera

Decyzja właściciela: 28.10.2026, po końcowym audycie hormonów i zgodzie
na mały etap kwalifikacji E2. Zmiana jest kliniczna: może zmienić dobrany
zakres i ocenę nowego wyniku. Nie wprowadza nowych stężeń, norm,
konwersji, median ani pól formularza.

## Zachowanie

Chronologiczny wiek tej samej bieżącej osoby kwalifikuje źródło przed
stadium i kontekstem cyklu. E2 nie ustala wieku ani dorosłości z Tannera
lub odziedziczonego `life_stage`. Dorosły mężczyzna zachowuje istniejący
wiersz `e2_male_adult` 40–160 pmol/L także przy zachowanym Tanner I–V.
U dorosłej nadal działają cztery neutralne alternatywy przy nieznanej
fazie oraz dotychczasowe zakresy jawnie wybranego kontekstu.

Brak wieku, nieprawidłowy wiek, pierwsze 14 dni albo przedział przecinający
podział źródeł pozostawiają wynik i konwersje, bez pojedynczego RI,
koloru prawidłowości i dokładnego znacznika zakresu. Tanner nie obchodzi
tych ograniczeń. Nie kasujemy cechy w rekordzie pacjenta; kwalifikacja
tworzy odłączony kontekst obliczenia.

Granica dorosłości **18 lat** zachowuje obecny podział aplikacji.
Nie jest literalną granicą kohorty lub dodatkową normą Mayo. Cały
podany wiek musi być po jednej stronie: `[17,18)` pozostaje pediatryczny,
`[17,18]` lub `[17,19)` nie wybiera jednego RI, a `[18,19)` jest dorosły.
Nie wykorzystujemy kolumny źródłowego „Mean age” jako progu wieku.

## Pierwsze dni i precyzja

Mayo opisuje 1–14 dni jako okres wysokiego E2 po urodzeniu i spadku
do poziomu przedpokwitaniowego; nie podaje dla niego liczbowego RI.
Warunek stadium I to **>14 dni i przed pokwitaniem**. Nowa polityka
nie stosuje w pierwszych 14 dniach również innych wierszy E2, które
mogłyby zostać błędnie wybrane przez sam numer stadium.

Wykorzystujemy istniejący resolver wieku i już dostępne PNA. Dzielenie
dni przez 365,25 jest istniejącą konwencją wieku aplikacji, nie modelem
hormonu. Nie dopisujemy godziny urodzenia, dokładnego dnia do miesiąca
ani środka przedziału. „0 miesięcy” obejmuje granicę 14 dni i nie
kwalifikuje RI. Pełny przedział zaczynający się po 14. dniu może go
kwalifikować, gdy pasują pozostałe warunki. W znanym kontekście z dat
kalendarzowych zachowujemy oryginalną niepewność resolvera.

Nie tworzymy osobnego zakresu wcześniaczego E2 i nie utożsamiamy PNA,
wieku skorygowanego ani PMA. Nie zmieniamy w tym etapie pozostałych
kryteriów źródeł, metod, leczenia lub stymulacji.

## Źródła i zakres weryfikacji

Pełny oficjalny **Mayo Clinic Laboratories EEST / 81816, Estradiol,
Serum**, odczyt 28.10.2026:

- [HTML](https://www.mayocliniclabs.com/test-catalog/Overview/81816);
- [Test Definition PDF](https://www.mayocliniclabs.com/test-catalog/download-setup?format=pdf&unit_code=81816),
  7 stron, tabela Reference Values s. 3; kliniczne ograniczenia s. 4–6,
  metoda s. 1 i 6–7;
- surowica, LC-MS/MS, pg/mL. Pediatryczne zakresy oparto na literaturze,
  porównaniu metod i danych młodych dorosłych. Nie podano pełnej kohorty
  z liczebnością i kryteriami wieku ciążowego dla każdej pozycji.

Źródło rozdziela dzieci/stadia i dorosłych; wspiera poprawę kwalifikacji.
Nie jest ponownym potwierdzeniem istniejącego w aplikacji 40–160 pmol/L
z Tietz, wierszy fazowych ani wszystkich dawnych przeliczeń. Tabela
Mayo podaje dorosłym mężczyznom 10–40 pg/mL, a nie 40–160 pmol/L.
Pełna odpowiednia tabela **Tietz 2018, wydanie 6** nie była dostępna;
zachowujemy dotychczasowe liczby i ich pochodzenie, bez deklarowania
ich ponownej walidacji lub harmonizacji metod.

Mayo używa określenia Undetectable dla części granic pediatrycznych.
Nie poprawiamy przy okazji istniejącego numerycznego zera na LOD/LOQ,
nie zmieniamy 3,671 aplikacyjnego przeliczenia pg/mL→pmol/L na podane
w katalogu 3,676 ani nie rozstrzygamy operatora postmenopauzalnego.
Te rozbieżności pozostają oddzielnymi tematami źródłowymi.

[Zapis źródłowy](hormone-lifespan/evidence/e2-age-qualification-audit-2026-10-28.json)
zawiera SHA-256 pełnego HTML/PDF, lokalizacje i przykłady. Pliki
wydawcy pozostają poza publicznym repozytorium. Data generowania PDF
nie jest datą rewizji katalogu. Zielone testy nie są walidacją kliniczną.

## Dane, wykonanie i historia

Polityka `estradiol-matched-reference-only` `2026-10-28.1` ma własne
`chronological_age`: granicę dorosłości, wyłączenie pierwszych dni,
konwencję jednostki wieku i wymóg pełnego przedziału. Silnik bierze
te wartości z deskryptora. Pozostałe substancje, wiersze stężeń i ich
źródła pozostają bez zmian.

Adapter E2 przekazuje pełny przedział przez istniejące
`readPubertyPatientContext()` i `lifespanLegacyAge()`. Niedostępne dane
bieżącej osoby nie są zastępowane dawnym wiekiem z shared. Lokalna
korekta nadal dotyczy tylko bieżącego sprawdzenia. Formularz nie
wymaga nowych odpowiedzi.

Nowe przypięcie zapisuje rzeczywiście dobrane odniesienie albo jego
brak. Dawna koperta zakresu i dawna klasyfikacja pozostają historyczne;
nie są przeliczane po zmianie wieku, stadium albo polityki. Wykresy,
85 profili, P50, porównanie płci i konwersje są niezależne.

## Przypadki wejście → wynik

- M30, Tanner I, E2 50 pmol/L → 40–160 i `within`; wcześniej 0–47,79
  pediatryczne i `above`.
- M, brak wieku, Tanner I/V → przeliczenie bez RI, bez domniemanej
  dorosłości lub wieku pediatrycznego.
- M, dokładnie 14 dni, Tanner I → brak RI; >14 dni przy całym zgodnym
  wieku i kontekście → dotychczasowy wiersz pediatryczny.
- M, 0 ukończonych miesięcy, Tanner I → brak RI; nie wybieramy środka
  przedziału. 1 ukończony miesiąc przy Tanner I → istniejący zakres.
- F30, dowolny Tanner, nieznana faza → cztery neutralne alternatywy;
  jawna faza folikularna → dotychczasowe 70–290 pmol/L.
- E2 z historyczną oceną → nadal zapisany zakres i ocena, niezależnie
  od obecnego wieku lub dostępności silnika.

Regresje wywołują rzeczywisty `LabUnitConverter` i funkcję adaptera,
obejmują granice, pełny wiek, jednostki, niezmienność wejścia i innych
analitów. E2E sprawdza desktop/320 px, zmianę kontekstu, przypięcie i
historię. Rzeczywistą instalację/aktywację, aktualizację oraz zimny
restart offline raportuje końcowy PR razem z kontrolami GitHub.
