# Dobowe wydalanie sodu — Na_mmol_d

Stan decyzji: **30.10.2026**. Właściciel zaakceptował
[makietę desktop/mobile](https://vilda-na-dzm-20261030.maciej-flader.chatgpt.site)
i polecił kodowanie. Źródła oraz ograniczenia przedstawiono również
w [Szczegółach makiety](https://vilda-na-dzm-20261030.maciej-flader.chatgpt.site/zrodla.html).
Implementację rozpoczęto na odświeżonym `audyt`
`e49ff33eef89db636926666557f1c40380430eb5`.

Dodanie zakresów referencyjnych, nowego trybu wejścia i dokładnej prezentacji
jest zmianą kliniczną oraz funkcjonalną. Akceptacja właściciela i testy
techniczne nie stanowią niezależnej walidacji klinicznej.

## Potwierdzone problemy poprzedniego producenta

- Dokładne zero blokowała gotowość formularza i obliczenie, mimo że jest
  dopuszczalnym zapisem ilości. Ujemny sód mógł przejść przez edytor zapisu.
- Małe dodatnie `0,015 mmol/24 h` mogło być wyświetlane jako `0,0`;
  kolektor wyniku laboratoryjnego mógł utrwalić `valueNum:0`, choć obwiednia
  obliczenia zachowywała `rawValue:0.015`.
- Brak porównania z normą mógł otrzymać `outOfRange:false`, sugerując
  wykonaną ocenę, zamiast `null`.

Sam dotychczasowy wzór stężenie × objętość × 24/czas był poprawny.
Audyt nie ustanowił klinicznego uzasadnienia dla dawnych sztywnych
ograniczeń stężenia do 300 mmol/L i objętości do 10 000 mL. Nowy moduł
sprawdza znak, format i reprezentowalność liczby; nie zastępuje tych
ograniczeń innymi arbitralnymi pułapami.

## Minimalne dane i wzór

Pierwszy, domyślny tryb **„Oblicz ze stężenia”** wymaga stężenia sodu
w moczu w `mmol/L` oraz objętości całej zbiórki w `mL` albo `L`.
Jednostki `mEq/L` i `mmol/L` są dla Na liczbowo równe; nie tworzą dwóch
identycznych pozycji selektora. Drugi tryb **„Gotowy wynik”** przyjmuje
ilość dobową w `mmol/24 h`, `mg Na/24 h` albo `g Na/24 h`.

`Na [mmol/24 h] = stężenie [mmol/L] × objętość [L] × 24 / czas [h]`.

Gotowa ilość dobowa nie jest ponownie mnożona przez objętość ani
`24/czas`. Do liczby nie potrzeba wieku, płci, masy ani wzrostu.
Wiek i potrzebną płeć pobiera się ze znanych danych pacjenta wyłącznie
do wyboru właściwego zakresu. Nie dodaje się ankiety o dietę, diuretyki,
chorobę przytarczyc, kamicę, AKI, IFCC lub leczenie.

Główna karta ma jedną wybraną jednostkę: domyślnie `mmol/24 h`, opcjonalnie
`g Na/24 h`. Wynik i norma mają tę samą jednostkę. `g Na` oznacza masę
sodu, a nie masę soli NaCl.

## Czas i jakość zbiórki

Nowa zbiórka ma rzeczywiście wpisane **24 godziny**, z opcją **„Zmień”**.
To jawne założenie użytkowe, nie potwierdzony fakt o próbce. Puste nowe
pole otrzymuje wspólną domyślną wartość, zamiast blokować wynik.
Jawny czas równy zero, ujemny, nieliczbowy lub niereprezentowalny wymaga
korekty w obu trybach. Znana niepełna albo błędna zbiórka także blokuje
oba tryby i zapis; uproszczenie formularza nie usuwa znanych sprzeczności.
Wspólny kontrakt: [DZM_COLLECTION_DURATION.md](DZM_COLLECTION_DURATION.md).

Przy znanym dodatnim czasie innym niż 24 h tryb stężenia przelicza ilość
proporcjonalnie na dobę i opisuje ją jako oszacowanie bez normy pełnej
DZM. Gotowy wynik zachowuje swoją liczbę, bez ponownego skalowania
i bez normy pełnej DZM. Zmiana trybu nie usuwa znanego innego czasu.

Nieznany czas historyczny nie staje się automatycznie 24 h. Historyczne
stężenie z objętością wymaga wyjaśnienia czasu, zanim powstanie nowe
obliczenie. Gotową, już dobową ilość można pokazać bez historycznego
czasu, ale neutralnie, bez doboru normy. Dawnych lokalnych dat nie
interpretuje się ponownie przez `Date.parse` w bieżącej strefie urządzenia.

## Jeden wybrany profil laboratoryjny

Normy są danymi w `clcr_sodium_dzm_data.js`, poza silnikiem
`clcr_sodium_dzm.js`. `VildaClcrSodiumDzm.evaluate(input, policy)`
przyjmuje politykę jako argument. Domyślny profil
`ClcrSodiumDzmReferenceData.DEFAULT_POLICY` ma identyfikator
**`SODIUM_DZM_LABCORP_003178_2026_10_30`, wersja 1**.
Wynik niesie źródło, populację, metodę zakresu i wersję polityki.

Wybrano jeden katalog **Labcorp 003178 — Sodium, 24-Hour Urine**,
sekcja **Reference Range**, odczyt 30.10.2026. Materiał: pełna zbiórka
24 h; metoda katalogowa: ISE / flame photometer. Metody źródła nie
dopisuje się jako potwierdzonej metody próbki pacjenta. Katalog nie podaje
liczebności badanej populacji, definicji percentyli ani daty wyznaczenia
zakresów; aplikacja nie uzupełnia tych danych przypuszczeniem.

| Wiek źródłowy | Mapowanie aplikacji | Chłopcy/mężczyźni, mmol/24 h | Dziewczynki/kobiety, mmol/24 h |
|---|---|---:|---:|
| 0–5 lat | `wiek <6` | Nie ustalono | Nie ustalono |
| 6–12 lat | `6≤wiek<13` | Nie ustalono | 33–185 |
| 13–17 lat | `13≤wiek<18` | 30–250 | 30–250 |
| 18–80 lat | `18≤wiek<81` | 58–337 | 39–258 |
| >80 lat | `wiek≥81` | 23–207 | 23–207 |

**Obie granice ilości są włączone.** Dokładne 58 mmol/24 h u mężczyzny
40 lat spełnia zakres 58–337. Przedziały wieku oznaczają świadomą
konwencję ukończonych lat z tabeli, nie interpolowaną krzywą fizjologii.
Wiek wykorzystuje się bez przedwczesnego zaokrąglenia. Gdy zapisano tylko
ukończone lata, cały wynikający z nich możliwy przedział wieku musi
mieścić się w jednym właściwym profilu; nie dopisuje się daty urodzenia.

Nieznana płeć nie blokuje identycznego zakresu obu płci w wieku 13–17
oraz od 81 lat. W wieku 6–12 lat kwalifikuje się tylko znana płeć żeńska;
u dorosłych 18–80 lat trzeba znać płeć. Brak właściwego profilu, wieku
lub wymaganej płci pozostawia poprawną liczbę neutralną, z konkretnym
powodem. Nie tworzy dodatkowych obowiązkowych pól do „pełnej interpretacji”.

Luki nie są wypełniane Mayo, UVM ani innym laboratorium. Aktualny Mayo
NAU podaje od 18 lat **22–328 mmol/24 h**, nie często powtarzane 40–220;
nie jest domyślnym ani zastępczym profilem tego modułu. Istnieją inne
opublikowane pediatryczne zakresy, ale ich odmienna populacja, granice
wieku lub niejasne zastosowanie nie uzasadniają sklejenia w jedną tabelę.
„Brak normy” oznacza lukę wybranego profilu, a nie brak wszystkich danych.

## Interpretacja i granice wnioskowania

Jedna karta B łączy liczbę z **„Normą dla wieku”**. Status w zakresie
brzmi **„W zakresie laboratoryjnym”**. Wartość poniżej lub powyżej ma
bursztynowy kolor i jednoznaczny opis; liczby normy pozostają neutralne.
Krótki komentarz w zakresie: **„Zakres laboratoryjny nie jest celem
spożycia soli.”** Na osi obie granice normy są nazwane; brak miejsca
nie może ukryć dolnej ani górnej granicy.

Małe lub duże wydalanie może wiązać się m.in. z podażą sodu, jego
nerkowym zatrzymywaniem lub utratą oraz działaniem leków. Te komentarze
są warunkowe. Sam wynik nie rozpoznaje hipo-/hipernatremii, SIADH,
niedoboru lub nadmiaru sodu w organizmie ani skuteczności leczenia
przytarczyc, XLH lub burosumabem. Do oceny natremii służy badanie krwi.

Dokładne zero jest poprawną liczbą, lecz pozostaje neutralne
(`outOfRange:null`) z uwagą o zapisie laboratorium i oznaczalności.
Jeśli profil jest dostępny, jego norma nadal jest widoczna, ale zero
nie otrzymuje klasyfikacji „poniżej”. Zapis `<LOD`, `<LOQ` lub `<wartość`
nie jest dokładnym zerem; aplikacja nie wymyśla granicy oznaczalności.

## Jednostki i dokładność

Wersjonowane dane chemiczne `SODIUM_CHEMICAL_UNITS_2026_10_30`, wersja 1:

- `1 mmol Na = 22,98976928 mg Na` — standardowa masa atomowa sodu CIAAW;
- `NaCl [g] ≈ Na [mmol] ×0,05844` — jawnie przybliżony odpowiednik
  chemiczny, z konwencją 58,44 g/mol dla NaCl;
- `1 mmol Na = 1 mEq Na` ze względu na wartościowość +1.

Silnik przechowuje ilości jako dokładne ułamki dziesiętne, a ocenę
wykonuje przed zaokrągleniem. Migawka JSON przechowuje licznik i mianownik
jako tekst. Zmiana samej jednostki zachowuje pochodzenie pierwotnej
ilości; prawdziwa edycja liczby unieważnia dawne pochodzenie konwersji.
Wartość dodatnia nie staje się zerem. Gdy skończonej dodatniej ilości
nie można zachować w wybranej jednostce w obsługiwanym zakresie liczbowym,
wynik jest jawnie blokowany zamiast zastąpiony zerem albo nieskończonością.

Główna liczba może być skrócona ze znakiem **≈**, z krótką uwagą
o zaokrągleniu. Pełny zapis i dokładna ilość pozostają w Szczegółach
oraz migawce. Skrócenie nie zmienia strony granicy. Norma po przeliczeniu
na g Na jest oznaczona jako przybliżona; źródłowy zakres mmol pozostaje
utrwalony. Oba końce długiego zakresu zachowują czytelność i jednostkę.

## Sól, dieta i kamica — wyłącznie Szczegóły

Przybliżony odpowiednik NaCl jest przeliczeniem chemicznym wydalonego
sodu. Nie jest pomiarem chlorków ani dokładnym „spożyciem soli pacjenta”.
EFSA 2019 opisuje zmienność między dniami i ograniczenie pojedynczej
zbiórki w ocenie zwyczajowej podaży konkretnej osoby.

WHO zaleca dorosłym **spożycie <2 g sodu / <5 g soli na dobę**;
dla dzieci 2–15 lat pułap jest obniżany odpowiednio do zapotrzebowania
energetycznego. To cele żywieniowe, nie normy wydalania w moczu; nie
wyprowadzamy z nich progu 87 mmol/24 h ani kolejnych pól energetycznych.
EAU 2026 podaje w ogólnej profilaktyce kamicy **4–5 g NaCl/dobę**,
także jako podaż. Duża podaż soli może zwiększać kalciurię. Szczególna
ocena metaboliczna EAU obejmuje dwie kolejne zbiórki 24 h.

Informacje te pozostają w zwiniętych Szczegółach, bez selektora choroby
i bez automatycznego zalecenia ograniczania sodu każdemu pacjentowi.
Szczególnie u dziecka z nefropatią przebiegającą z utratą sodu takie
zalecenie wymaga indywidualnej oceny; KDIGO 2024 §3.3.2 nie ustanawia
uniwersalnego pediatrycznego progu natriurii.

## Jeden zapis i zgodność historii

Zachowane są `Na_mmol_d` i klucz `clcr:Na_mmol_d`: jeden pomiar nie
tworzy drugiego badania dla masy sodu lub odpowiednika NaCl. Prezentacja
zapisuje wybraną ilość i jednostkę, a migawka zachowuje także dokładną
ilość kanoniczną mmol. Serie o różnych jednostkach mają osobne osie;
nie porównuje się liczby w g z liczbą w mmol na wspólnej nieprzeliczonej osi.

Migawka **`clcr-sodium-dzm`, wersja 1**, zamraża wejścia i pochodzenie
konwersji, ilość dokładną, prezentację, czas i jego źródło, znane fakty
o zbiórce, wiek/płeć i dokładność wieku, źródła, wersję polityki,
granice z inkluzywnością oraz ocenę. Brak oceny pozostaje `null`,
nie `false`. Odczyt Badań, historii, Notatek i szczegółów nie uruchamia
dzisiejszego silnika ani nie dobiera normy według dzisiejszego pacjenta.
Notatka ma czytelny wynik, normę i interpretację; techniczne drzewo
pozostaje w danych, a nie w jej treści.

Dawne zapisy nie otrzymują nowej normy i nie są przepisywane przy odczycie.
Przy świadomej edycji rzeczywistego dawnego pomiaru sodu zachowuje się
znaczenie `U_Na` jako mmol/L, `V24` jako mL oraz utrwalony czas.
Wybór nowej formuły nie importuje przypadkowo wspólnego `U_Na` z FENa,
UAG lub innej próbki. Nowy pacjent nie dziedziczy pomiaru. Zapis wymaga
zapisanej karty pacjenta i używa istniejącej ścieżki powiązania z wizytą.

## Syntetyczne kontrakty regresji

Poniższe przypadki mają wywoływać rzeczywistych producentów, nie kopię wzoru:

| Wejście | Oczekiwany wynik / znaczenie |
|---|---|
| Mężczyzna 40 lat, 100 mmol/L ×580 mL /24 h | Dokładnie **58 mmol/24 h**, w zakresie **58–337**, dolna granica włączona. |
| Ten sam profil, gotowe 1333,40661824 mg Na/24 h | Dokładnie **58 mmol/24 h**, ta sama ocena. |
| Wiek 81 lat, płeć nieznana, 528,76469344 mg Na/24 h | Dokładnie **23 mmol/24 h**, dolna granica włączona. |
| Wiek 81 lat, płeć nieznana, 4,75888224096 g Na/24 h | Dokładnie **207 mmol/24 h**, górna granica włączona. |
| Dziewczynka 8 lat; chłopiec 8 lat; dziecko 14 lat bez płci | Odpowiednio **33–185**, **bez normy**, **30–250 mmol/24 h**. |
| Dokładny wiek 5,99 /6 /13 /18 /81 lat | Bez przedwczesnego zaokrąglenia i bez przesunięcia granic profilu. |
| 0,01 mmol/L ×1500 mL /24 h | **0,015 mmol/24 h**, dodatnie w karcie, raporcie i zapisie. |
| Dokładne 0; ujemne stężenie lub gotowa ilość | Zero: liczba neutralna; ujemna ilość: błąd także w edytorze. |
| 100 mmol/L ×1 L /12 h | **200 mmol/24 h**, oszacowanie bez normy pełnej DZM. |
| Gotowe 100 mmol/24 h przy znanych 12 h | **100**, bez ponownego skalowania i bez normy pełnej DZM. |
| Historycznie nieznany czas: stężenie /gotowa ilość dobowa | Stężenie wymaga czasu; gotowa ilość dostępna neutralnie, bez normy. |
| Jawny czas 0, ujemny lub błędny; znana błędna zbiórka | Blokada obu trybów i zapisu. |
| Minimalnie poniżej/powyżej granicy, także po zmianie jednostki | Ocena według dokładnej ilości, bez epsilon i bez porównania zaokrąglonej prezentacji. |

Regresje obejmują również zamrożony odczyt bez silnika, świadomą edycję,
Notatki i eksport, zmianę pacjenta, prowadzenie do wymaganych pól,
stałą geometrię desktop/390/320 px oraz prawdziwe uruchomienie i aktualizację
PWA offline. Końcowe wyniki testów i kontroli aktualnego SHA podaje PR.

## Źródła

Pełne materiały odczytano w audycie 30.10.2026:

1. [Labcorp 003178 — Sodium, 24-Hour Urine](https://www.labcorp.com/tests/003178/sodium-24-hour-urine), **Reference Range**, **Methodology**. Wybrany profil; brak jawnej daty rewizji katalogu i charakterystyki kohorty.
2. [CIAAW — Sodium](https://www.ciaaw.org/sodium.htm), standard atomic weight **22.98976928(2)**; [CIAAW — Abridged Standard Atomic Weights 2024](https://www.ciaaw.org/abridged-atomic-weights.htm). Przeliczenie NaCl z 58,44 jest jawną konwencją przybliżoną.
3. [WHO — Sodium reduction](https://www.who.int/news-room/fact-sheets/detail/sodium-reduction), aktualizacja **11.05.2026**, **Recommendations**; [Guideline: sodium intake for adults and children](https://www.who.int/publications/i/item/9789241504836/), **2012**; [WHO — children](https://www.who.int/tools/elena/interventions/sodium-bp-children), aktualizacja **09.08.2023**. Cele podaży, nie normy moczu.
4. [EAU Urolithiasis 2026 — Metabolic evaluation and recurrence prevention](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention), rozdział **4**, tabela **4.5** (PDF, strona fizyczna 48); [EAU Paediatric Urology — Urinary stone disease](https://uroweb.org/guidelines/paediatric-urology/chapter/urinary-stone-disease), **§18.2.1**. Dieta, kalciuria i zbiórki; nie uniwersalny zakres natriurii.
5. [EFSA NDA Panel, Dietary reference values for sodium](https://pmc.ncbi.nlm.nih.gov/articles/PMC7009309/), **2019;17(9):5778**, DOI **10.2903/j.efsa.2019.5778**, **§2.6.1.1**, Appendix C. Ograniczenia pojedynczej zbiórki.
6. [KDIGO 2024 CKD Guideline](https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf), **§3.3.2**, **S212**, Practice Points **3.3.2.1–3.3.2.2**. Indywidualny kontekst podaży sodu u dzieci i nefropatii z utratą sodu.
7. Alternatywy sprawdzone, lecz niewykorzystane do normy: [Mayo NAU](https://www.mayocliniclabs.com/test-catalog/Overview/610734), **Reference Values**; [UVM LAB446](https://uvmlabs.testcatalog.org/show/LAB446-1); [UK HealthCare Reference Range Export April 2024](https://www.testmenu.com/UKLab/TestDirectory/SiteFile?fileName=sidebar%5CUK+HealthCare+Clinical+Laboratory+Reference+Range+Export+April+2024.pdf), **strona 53**; [Seattle Children's NA U QNT](https://seattlechildrenslab.testcatalog.org/show/NA-U-QNT); [Children's Minnesota, Sodium Timed Urine](https://www.childrensmn.org/references/lab/urinestool/sodium-timed-urine.pdf), aktualizacja metody **25.11.2020**. Odmienne lub niejasne grupy wieku pozostają rozdzielone, bez korygowania jednostek wieku z przypuszczenia.
