# Dobowe wydalanie szczawianów — Ox_mgkg / Ox_total24

Stan decyzji: **04.11.2026**. Właściciel zaakceptował
[makietę przed/po na desktopie i telefonie](https://vilda-oxalate-dzm-20261104.maciej-flader.chatgpt.site)
oraz polecił implementację z naprawą potwierdzonych
błędów. Baza audytu: `881c82a481744cfa56f7e83fae3e6431f47c0361`.
Zakres obejmuje ilość szczawianów z dobowej zbiórki moczu, osobno od
punktowego Ox/Cr. Nowa norma, główna miara wyniku, konwersje, walidacja
i zapis są zmianą kliniczną oraz funkcjonalną. Akceptacja właściciela
i testy techniczne nie stanowią niezależnej walidacji klinicznej.

## Potwierdzone problemy poprzedniej wersji

- Małe dodatnie wydalanie, np. `0,021428571… mg/kg/24 h`, mogło być
  prezentowane i zapisane w tekście jako `0,0`. Surowa wartość pełnego
  obliczenia mogła pozostać dodatnia; nie należy twierdzić, że utraciły
  ją wszystkie historyczne wpisy.
- Edytor zapisanego obliczenia przyjmował ujemne stężenie szczawianów
  lub ujemną masę i mógł zapisać ujemne wydalanie.
- Dokładne zero stężenia nie przechodziło gotowości formularza, choć
  jest dopuszczalnym wejściem liczbowym. Nie oznacza to potwierdzenia
  fizjologicznej wiarygodności zera ani wyniku poniżej oznaczalności.
- Obowiązkowa masa blokowała ilość dobową, ponieważ główną miarą było
  `mg/kg/24 h`. Brak normy pediatrycznej był ograniczeniem funkcji,
  nie błędem mnożenia stężenia i objętości.

## Minimalne dane i obliczenie

Pierwsza, domyślna opcja **„Oblicz ze stężenia”** wymaga stężenia
szczawianów oraz objętości całej zbiórki. Czas ma rzeczywiście wpisane
**24 godziny**, z możliwością zmiany. Druga opcja **„Gotowy wynik DZM”**
przyjmuje już obliczoną ilość dobową.

| Wielkość | Dostępne jednostki |
|---|---|
| Stężenie szczawianów | µmol/L, mmol/L, mg/L, mg/dL |
| Objętość całej zbiórki | mL, L |
| Gotowa ilość dobowa | µmol/24 h, mmol/24 h, mg/24 h |
| Główny wynik | mmol/24 h dla wejścia molowego; mg/24 h dla masowego |

Domyślne stężenie jest w µmol/L. Nie powiela się jednostek mg w grupach
jonu i kwasu. Przy jednostkach masowych krótka linia **„Postać z wyniku”**
z opcją **„Zmień”** rozróżnia jon szczawianowy, bezwodny kwas szczawiowy
i niepodaną postać. Jednostki molowe nie wymagają tego wyboru.

`ilość w zbiórce = stężenie na litr × objętość w litrach`.

`ilość na 24 h = ilość w zbiórce × 24 / czas w godzinach`.

W pełnej zbiórce 24 h drugi czynnik wynosi 1. Dla innego czasu jest to
ekstrapolacja, opisana jako oszacowanie. `mg/dL ×10 = mg/L`,
`µmol/L ÷1000 = mmol/L`, `mL ÷1000 = L`. Gotowa ilość dobowa nie jest
ponownie mnożona przez objętość ani przez `24/czas`; gotowe µmol/24 h
dzieli się przez 1000 tylko raz.

Do samej ilości dobowej nie potrzeba wieku, płci, masy, wzrostu, surowicy,
kreatyniny, pH, BSA, diagnozy, dawki leku ani wyboru źródła. Wiek oraz
antropometrię pobiera się z istniejących danych pacjenta wyłącznie do
porównania. Brak normy nie blokuje poprawnej liczby i nie tworzy
dodatkowego formularza „pełnej interpretacji”.

## Czas i znane ograniczenia

Domyślne 24 h jest założeniem nowego formularza, nie potwierdzoną
kompletnością zbiórki. Widoczna notka brzmi:
**„Porównanie z normą dotyczy kompletnej zbiórki 24-godzinnej.”**
Nie wymaga się nowego checkboxa o kompletności, diecie, AKI, IFCC,
stabilności nerek ani przygotowaniu próbki.

Znany czas inny niż 24 h pozostaje znany również po przełączeniu na
gotowy wynik. Tryb stężenia daje oszacowanie `×24/czas`, gotowy wynik
zachowuje swoją liczbę; oba pozostają bez automatycznej normy pełnej
DZM. Znana niepełna/błędna zbiórka zachowuje tę informację i nie otrzymuje
porównania z normą. Przeliczenie czasu nie odtwarza pominiętej porcji moczu.
Niepoprawny podany czas nie jest zastępowany milcząco przez 24 h.

Nieznanego czasu historycznego nie zamienia się w dzisiejszą domyślną
dobę. Przy odczycie obowiązuje dawny zapis; ponowne obliczenie wymaga
właściwych zachowanych danych albo ich jawnego uzupełnienia. Nie
interpretuje się dawnych lokalnych dat ponownie w aktualnej strefie
urządzenia. Ogólne reguły czasu: [DZM_COLLECTION_DURATION.md](DZM_COLLECTION_DURATION.md).

Gotowa ilość dobowa z nieznanym historycznym albo nieprawidłowym czasem
pozostaje liczbą bez normy; czas nie jest potrzebny do jej ponownego
mnożenia. Komunikat **„Wynik dobowy — ocena ograniczona”** wskazuje
powód braku porównania, nie sugeruje wykonania nowej ekstrapolacji.

Znane **eGFR <30 mL/min/1,73 m²** ogranicza uspokajającą interpretację
niskiego wyniku: przy niewydolności nerek wydalanie moczowe może nie
odzwierciedlać wytwarzania szczawianów. Liczba pozostaje dostępna,
z konkretną uwagą. Nie dodaje się pola eGFR do formularza.

## Wybrana norma publikacyjna

Domyślny profil opiera się na **ERKNet/OxalEurope 2023**. Normy są
danymi w `clcr_ox_dzm_reference_data.js`, poza
silnikiem `clcr_ox_dzm.js`. `VildaClcrOxDzm.evaluate(input, policy)`
przyjmuje politykę jako argument; `ClcrOxDzmReferenceData.DEFAULT_POLICY`
udostępnia profil **`erknet-oxaleurope-2023-oxalate-dzm-v1`**, wersja 1.
Wynik zachowuje źródło, jego wersję,
populację, granicę i operator.

**Groothoff JW i wsp.** *Clinical practice recommendations for primary
hyperoxaluria: an expert consensus statement from ERKNet and OxalEurope*.
Nature Reviews Nephrology 19, 194–211 (2023), opublikowano 05.01.2023.
[DOI 10.1038/s41581-022-00661-1](https://doi.org/10.1038/s41581-022-00661-1),
[pełny tekst](https://www.nature.com/articles/s41581-022-00661-1),
[pełny suplement](https://static-content.springer.com/esm/art%3A10.1038%2Fs41581-022-00661-1/MediaObjects/41581_2022_661_MOESM1_ESM.pdf).
Odczytano pełny artykuł i suplement 04.11.2026, nie tylko abstrakt.

Sekcja **Diagnostic approach → Rationale for biochemical assessment →
Urine oxalate** wskazuje jako przyjęte prawidłowe wartości
**„<0.46 mmol/24 h”** i pozwala po korekcie do 1,73 m² stosować to
odniesienie u dzieci. **Supplementary Table 2, PDF s. 18**, podaje
**„<0.46 mmol/day (all ages)”** przy wierszu 24 h z korektą BSA dla dzieci.
To konsensus kliniczny, nie nowe badanie centyli zdrowej populacji.

| Populacja / polityka aplikacji | Norma źródłowa | Norma przy głównym wyniku całkowitym |
|---|---|---|
| Dzieci, wiek <18 lat | <0,46 mmol/1,73 m²/24 h | <`0,46 × BSA / 1,73` mmol/24 h |
| Dorośli, wiek ≥18 lat | <0,46 mmol/24 h | <0,46 mmol/24 h |

**18 lat jest technicznym podziałem aplikacji** między przeliczeniem
pediatrycznym i dorosłym. Źródło używa określenia „children”, nie
ustanawia fizjologicznego skoku w dniu osiemnastych urodzin. Wiek
wykorzystuje się z zachowaną dokładnością; nie zaokrągla się go w górę
i nie dopisuje dokładnej daty do samych ukończonych lat.

Obie płcie mają tę samą normę DZM. „All ages” nie jest osobną walidacją
dla wcześniaków lub każdego dnia życia. Nie wprowadza się mnożnika
niemowlęcego ani progów z punktowego Ox/Cr. Brak wieku nie upoważnia
do automatycznej normy dorosłych.

Pediatryczne BSA liczy się zgodnie z przyjętą konwencją Mostellera:
`sqrt(masa[kg] × wzrost[cm] / 3600)`.
Źródło wzoru: Mosteller RD, *Simplified calculation of body-surface area*,
N Engl J Med 1987;317:1098,
[DOI 10.1056/NEJM198710223171717](https://doi.org/10.1056/NEJM198710223171717).
Norma dla dziecka nie ma maksimum odpowiadającego dorosłemu: dla BSA
>1,73 m² jej całkowita ilość może być >0,46 mmol/24 h. Źródło nie
uzasadnia obcięcia tej wartości. Brak potrzebnej masy lub wzrostu
pozostawia ilość dobową bez porównania.

Operator `<` pozostaje ścisły. Dokładnie na granicy wynik brzmi
**„Na górnej granicy”**, a nie „poniżej” lub rozpoznanie PH. Ocena
poprzedza formatowanie; nie dodaje się arbitralnego pasma tolerancji.
Źródło nie daje dolnej granicy do rozpoznawania niedoboru szczawianów.

## EAU i znaczenie kliniczne

Pełne **EAU Guidelines on Urolithiasis 2026, limited update March 2026**,
[PDF](https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Urolithiasis-2026.pdf)+i [rozdział metaboliczny](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention),
odczytano 04.11.2026. **§4.4.2, drukowana s. 53**, nazywa u dorosłych
wydalanie **>0,40 mmol/dobę** hiperoksalurią; 0,40–0,50 opisuje jako
łagodne podwyższenie w kamicy szczawianowo-wapniowej. Jest to niższy
próg kliniczny niż przyjęta granica referencyjna ERKNet.

Dla dorosłego z **`0,40 < wynik <0,46 mmol/24 h`** pozostają ta sama
norma ERKNet i status **„Poniżej górnej granicy”**. Towarzyszy im
bursztynowa uwaga: **„W ocenie kamicy EAU uznaje już wydalanie
>0,40 mmol/24 h za zwiększone.”** Jeżeli wynik jest masowy i postać
znana, próg uwagi jest przeliczany na tę samą jednostkę. Nie tworzy
się drugiej normy ani ogólnej deklaracji „prawidłowego wyniku”.

**Tabela 4.2, s. 47**, wymienia >0,5 mmol/dobę jako podejrzenie
hiperoksalurii jelitowej, a >1 mmol/dobę jako podejrzenie pierwotnej.
Są to wskazówki etiologiczne, nie progi zdrowej normy. Nie należy
z nich wyprowadzać zakresu „do 0,5 prawidłowo”.

Znaczne podwyższenie oznacza czerwony wynik z komunikatem o potrzebie
oceny przyczyny: u dzieci **>1 mmol/1,73 m²/24 h** według ERKNet,
u dorosłych w miarze nieindeksowanej **>1 mmol/24 h** według EAU.
To dwa jawnie opisane kryteria w różnych miarach, bez automatycznego
rozpoznania PH ani czerwonej kategorii pilności. ERKNet wskazuje,
że wtórne przyczyny jelitowe mogą dawać podobne wartości. Dokładnie
1 nie spełnia ścisłego `>1`.

Wysoki wynik może sprzyjać kamicy szczawianowo-wapniowej; możliwe
przyczyny obejmują dietę, zwiększone wchłanianie jelitowe i rzadsze
zaburzenia metaboliczne. ERKNet zaleca potwierdzenie podwyższenia
w co najmniej dwóch, najlepiej trzech oznaczeniach. EAU §4.1.2,
s. 46, zaleca dwie kolejne pełne zbiórki 24 h w swoistej ocenie
metabolicznej kamicy. Pojedynczy wynik nie wybiera leczenia.

Konsensus opisuje oznaczenie oksydazą szczawianową oraz LC-MS/GC-MS;
nie jest to potwierdzenie metody próbki pacjenta. Niedostateczne
rozpuszczenie kryształów przed pobraniem alikwotu może zaniżyć wynik,
a duża podaż witaminy C może wpływać na oznaczenie. Krótka instrukcja
w Szczegółach: **„Zbiórkę i przechowywanie wykonaj zgodnie z instrukcją
laboratorium.”** Bez instrukcji samodzielnego obchodzenia się z kwasem
ani obowiązkowych pól o przygotowaniu próbki.

## Różne źródła nie tworzą jednej mieszanej normy

- **Hoppe i Kemper 2010**, *Diagnostic examination of the child with
  urolithiasis or nephrocalcinosis*, Pediatr Nephrol 25:403–413,
  [DOI 10.1007/s00467-008-1073-x](https://doi.org/10.1007/s00467-008-1073-x),
  pełny PDF/XML odczytany; tabela 3, s. 409/PDF s. 7: dzieci
  <0,5 mmol (<45 mg)/1,73 m². Nie zastępuje wybranego 0,46 i nie
  daje normy szczawianów 2 mg/kg/24 h.
- **EAU Paediatric Urology 2026**, pełny
  [PDF](https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Paediatric-Urology-2026.pdf),
  §18.2.1, s. 78: <50 mg (0,57 mmol)/1,73 m²/dobę i ogólna uwaga
  o czterokrotnie większym wydalaniu niemowląt, bez operacyjnej granicy
  wieku. Nie wdraża się z tej frazy automatycznego mnożnika 4.
- **Mayo OXU**, [pełny katalog](https://www.mayocliniclabs.com/test-catalog/Overview/606737)
  i [PDF](https://www.mayocliniclabs.com/test-catalog/download-setup?format=pdf&unit_code=606737),
  Reference Values/Interpretation/Method Description, s. 2–3 PDF:
  od 16 lat 0,11–0,46 mmol/24 h, 9,7–40,5 mg/24 h, metoda enzymatyczna.
  Nie ma normy dla innego czasu ani dla <16 lat. To niezależny zakres
  laboratoryjny; jego dolnego limitu nie dopisuje się do ERKNet.
- **ACB, Gill Rumsby 2012, review 30.11.2013**, pełna
  [monografia Oxalate](https://www.acb.org.uk/static/bcc8d575-025f-4051-a663c44fc50ea343/oxalate.pdf),
  s. 3, §5.1.1–2: dorośli <460 µmol/24 h, dzieci <460 µmol/1,73 m²/24 h.
  §7.2, s. 4, nie przypisuje niskim wynikom moczu znaczenia klinicznego.
- **Newcastle NHS**, [pełny katalog](https://laboratories.newcastle-hospitals.nhs.uk/test-directory/oxalate-urine/),
  aktualizacja 24.12.2024: dorosłe zakresy 0,08–0,49 u mężczyzn
  i 0,04–0,32 mmol/24 h u kobiet. Brak opisu kohorty, metody i dokładnej
  granicy dorosłości. Nie tworzy pytania o płeć dla wybranego ERKNet.

Wymienione pełne źródła odczytano 04.11.2026. Oryginalny Wilson/Liedtke
1991, Clin Chem 37:1229–1235,
[PMID 1855295](https://pubmed.ncbi.nlm.nih.gov/1855295/), jest cytowany
przez Mayo; w tym audycie odczytano jedynie rekord i abstrakt, nie pełną
publikację. Nie deklaruje się niezależnej weryfikacji jego metod,
liczebności populacji ani percentyli. Nie używa się nieodczytanych
publikacji pierwotnych do uzupełnienia brakujących norm.

## Masa szczawianu i kwasu szczawiowego

Przyjęte stałe pozostają zgodne z wcześniejszym modułem Ox/Cr:

| Postać raportowanej masy | Zadeklarowany przelicznik | Masa odpowiadająca 0,46 mmol |
|---|---:|---:|
| Jon szczawianowy C₂O₄²⁻ | 88,019 mg/mmol | 40,48874 mg |
| Bezwodny kwas szczawiowy C₂H₂O₄ | 90,0349 mg/mmol | 41,416054 mg |

[ChEBI:30623](https://www.ebi.ac.uk/chebi/CHEBI:30623) podaje obecnie
średnią masę jonu 88,018; 88,019 jest utrzymanym, jawnym przybliżeniem
aplikacji, nie dosłowną bieżącą wartością katalogu.
[NIST WebBook, CAS 144-62-7](https://webbook.nist.gov/cgi/cbook.cgi?ID=C144627)
podaje masę kwasu 90,0349. Pełne strony chemiczne odczytano 04.11.2026.

Różnica obu podstaw wynosi około 2,29% i może zmienić stronę granicy.
Nie wolno ustalać postaci z samego słowa „szczawiany” lub metody
oksydazowej. Para Mayo 0,46 mmol/40,5 mg jest zgodna z masą jonu;
para pediatryczna 0,5 mmol/45 mg jest bliższa kwasowi, lecz żadna nie
potwierdza postaci nieznanego raportu. Nie dodaje się konwersji
hydratów/soli na podstawie przypuszczenia.

Niepodana postać pozwala obliczyć **surowe mg/24 h**, ale nie konwersję
na mmol ani porównanie z molową normą. Nie wybiera się korzystniejszego
wyniku spośród obu mas. Oryginalna jednostka i postać pozostają w zapisie.
Zmiana jednostki raportu wymaga odpowiadającej jej liczby; samo wybranie
mmol nie zmienia nieznanego zapisu masowego w oznaczenie molowe.

## Walidacja, precyzja i jedna karta wyniku

Stężenie i gotowa ilość są skończonymi nieujemnymi liczbami dziesiętnymi;
w trybie stężenia objętość oraz czas muszą być dodatnie. Każdy aktywny
operand sprawdza się osobno również w edytorze. Gotowy wynik nie
wymaga dawnych stężenia i objętości, a znany problem czasu wpływa na
możliwość porównania zamiast ponownie skalować ilość dobową. Puste pole
nie jest zerem. Ujemne aktywne dane, hex, NaN, nieskończoność i tekst
nie tworzą zapisywalnego wyniku.
Nierówności typu `<LOD` nie są zastępowane przez dokładne zero.

Dokładne literalne zero jest poprawną liczbą i przy spełnionych warunkach
porównania leży poniżej górnej granicy. Nie rozpoznaje niedoboru
szczawianów ani nie zastępuje zapisu poniżej oznaczalności. Bez danych
do normy pozostaje nieocenione tak samo jak inne liczby. Małe dodatnie
liczby nie stają się zerem. Klasyfikacja używa niezaokrąglonych wartości;
renderowanie oraz zapis nie odczytują liczby z zaokrąglonego tekstu.
Underflow/overflow nie może dać zapisywalnego fałszywego 0 lub ∞.

Dla dzieci porównanie może korzystać z dokładnego kwadratu BSA
`masa × wzrost /3600`, aby zaokrąglenie pierwiastka nie zmieniło strony
granicy. Dla nieujemnych wartości nierówność po podniesieniu obu stron
do kwadratu jest równoważna oryginalnej; nie zmienia się normy.

Jedna karta B łączy dużą ilość dobową i neutralną **„Normę dla pacjenta”**
w tej samej jednostce. U dziecka dopisek **„Przeliczona dla powierzchni
ciała”** wyjaśnia pochodzenie limitu; nie używa się „Norma dla wieku”.
Brak porównania ma konkretny powód i `outOfRange:null`. Zwykłe
podwyższenie/równość granicy jest bursztynowe; znaczne podwyższenie
ma opisane wyżej czerwone wyróżnienie bez diagnozy PH. Norma i jej
jednostka nie przejmują koloru odchylenia.

Szczegóły zawierają źródło, jednostki i postać, czas, BSA oraz pomocniczą
ilość po indeksowaniu, gdy jest dostępna. Nie tworzy się drugiego
głównego wyniku ani drugiego pomiaru do Badań. Stałe szerokości,
wspólne krawędzie, mobilne pola ≥16 px/48 px i ≥20 px pod przyciskiem
czyszczenia obowiązują po zmianie trybu, jednostki i stanu wyniku.

## Kontrakt zapisu, edycji i historii

Źródłowa formuła pozostaje **`Ox_mgkg`**, ale nowy główny wynik ma
odrębne ID **`Ox_total24` / `clcr:Ox_total24`** i
`sourceFormulaId:'Ox_mgkg'`. Dawne `Ox_mgkg` nadal oznacza **mg/kg/24 h**.
Nie redefiniuje się dawnej etykiety ani jednostki zastępczej, ponieważ
historyczny wpis może nie zawierać osobnego pola jednostki.

`ClcrOxDzmUi`, `ClcrOxDzmPersistence` i `ClcrOxDzmSession` korzystają
z modelu `VildaClcrOxDzm`. Nowy `oxDzmSnapshot`, schemat
**`clcr-ox-dzm`**, wersja **1**, utrwala wejście,
oryginalne liczby/jednostki/postacie, tryb, czas i jego pochodzenie,
znane ograniczenia, kontekst wieku/antropometrii, BSA z metodą,
surowy wynik, normę źródłową i zastosowaną, operator, źródło,
populację, wersję oraz końcową ocenę i prezentację.

Odczyt **READ** nie uruchamia ponownie oceny dzisiejszym wiekiem, BSA
lub nową normą. Nie dopisuje postaci masowej do dawnych niepełnych
notatek. Historyczne mg/kg, nowe mg/24 h i nowe mmol/24 h są osobnymi
seriami. Także znane masy jonu/kwasu i nieznana postać mają różną
tożsamość serii; dotyczy to obu ścieżek grupowania, w tym starego
adaptera historii. Rozdział osi nie zmienia historycznych liczb/ocen
i nie wymaga migracji realnych rekordów.

Jawna edycja **EDIT** nowego `Ox_total24` używa wspólnego silnika
i zapisanych danych pacjenta. Edycja dawnego `/kg` zachowuje jego
miarę oraz schemat, z poprawioną walidacją i prezentacją; nie zamienia
go po cichu w nowe wydalanie całkowite i nie dopisuje normy ERKNet.
Niespójny nowy snapshot nie przechodzi awaryjnie do starego wzoru.

Jeden zapis oznacza jeden pomiar i czytelną notatkę, bez JSON w treści.
Wynik, Badania, Notatki, wykres i eksport mają zgodne wartości i jednostki.
Zapis zachowuje istniejącą bramkę zapisanej karty pacjenta. Czyszczenie
pomiaru zachowuje pacjenta i domyślne 24 h, usuwa liczby, postać masową
i fakty dotyczące czyszczonej zbiórki. Zmiana pacjenta nie przenosi
pomiaru, dawnej normy ani problemu zbiórki poprzedniej osoby.

## Syntetyczne kontrakty funkcji produkcyjnych

Przykłady są fikcyjne. Przybliżenia BSA wyliczono niezależnie z podanego
wzoru; porównanie produkcyjne musi zachować pełną dokładność granic.

| Wejście lub stan | Oczekiwany wynik i zachowanie |
|---|---|
| Dorosły, 200 µmol/L, 2 L, 24 h | 0,4 mmol/24 h; poniżej <0,46; bez uwagi wymagającej >0,40. |
| Dorosły, 220 µmol/L, 2 L, 24 h | 0,44 mmol/24 h; poniżej ERKNet, z uwagą o progu EAU. |
| Dorosły, gotowe 0,459999999999 /0,46 /0,460000000001 mmol/24 h | Poniżej /na górnej granicy /powyżej; formatowanie nie zrównuje statusów. |
| Dziecko 10 lat, 30 kg, 140 cm, 20 mg/L jonu, 1500 mL, 24 h | 30 mg/24 h; BSA ≈1,08012345 m²; norma <≈25,27909683 mg/24 h; zwiększone. |
| To samo dziecko, 0,3 mmol/L, 1 L, 24 h | 0,3 mmol/24 h; norma <≈0,2872004548; zwiększone. |
| 17 lat, 70 kg, 180 cm, gotowe 0,49 mmol/24 h | Norma <≈0,4974457797, bez obcięcia do 0,46; poniżej granicy. |
| 6 miesięcy, 7 kg, 65 cm, 0,1 mmol/L, 0,5 L | 0,05 mmol/24 h; norma <≈0,0945292422; bez mnożnika niemowlęcego. |
| 25,5 mg/24 h, dziecko 30 kg/140 cm, postać jonu /kwasu /niepodana | Powyżej <≈25,2791 /poniżej <≈25,8581 /liczba bez normy. |
| 20 mg/L, 1,5 L, niepodana postać | 30 mg/24 h dostępne bez zgadniętej konwersji lub normy. |
| 0,2 mmol/L, 1 L, 12 h | Oszacowanie 0,4 mmol/24 h, bez normy pełnej doby. |
| Gotowe 0,3 mmol/24 h ze znanym czasem 12 h | Nadal 0,3, bez ponownego skalowania i bez normy pełnej doby. |
| Znana niepełna zbiórka /eGFR 20 | Zachowany znany fakt i konkretne ograniczenie; brak uspokajającego statusu. |
| Brak wieku albo dziecko bez potrzebnej antropometrii | Poprawna ilość, bez zastępczej normy dorosłych. |
| Stężenie/gotowy wynik 0 /−1 /puste | Zero poniżej dostępnej granicy /błąd /brak liczby; tak samo w edycji. |
| 0,000001 µmol/L, 1 L | 0,000000001 mmol/24 h, dodatnie również po zapisie. |
| Dorosłe 1 /1,000000001 mmol/24 h | Zwiększone /znacznie zwiększone; ścisłe >1, bez rozpoznania PH. |
| Stary `/kg` oraz nowe mg/24 h i mmol/24 h | Oddzielne osie, bez retrospektywnego przeliczania i normy. |
| Zmiana bieżącego pacjenta, BSA lub źródła po zapisie | READ nadal pokazuje dawną zamrożoną liczbę, normę i ocenę. |

Regresje wywołują rzeczywisty `VildaClcrOxDzm.evaluate(input, policy)`
w `tests/unit/klirens-ox-dzm.test.mjs`, walidację edytora,
serializery i oba adaptery historii w
`tests/unit/klirens-ox-dzm-persistence.test.mjs` oraz
`tests/unit/klirens-ox-dzm-legacy-edit.test.mjs`. Osobne testy sesji,
UI i prowadzenia formularza obejmują reset i zmianę pacjenta;
scenariusze przeglądarkowe sprawdzają desktop/mobile i offline.
Odczyt historii jest testowany także bez bieżącego silnika. Wyniki wykonań,
końcowy SHA i CI podaje PR; powyższa tabela jest kontraktem, a nie
deklaracją zakończonych testów. Ponowny przegląd jest wymagany po
zmianie źródła, konwersji, populacji, BSA, granic lub modelu historii.

Scenariusz `tests/e2e/klirens-ox-dzm-offline.spec.mjs` obejmuje świeżą
instalację oraz aktualizację z rzeczywistego drzewa Git
`881c82a481744cfa56f7e83fae3e6431f47c0361`, bez podmieniania samego
nagłówka starego SW. Sprawdza pełny precache przed pierwszą wizytą
w kalkulatorze, dwa zimne starty trwałego profilu po wyłączeniu serwera,
hashe nowych zasobów oraz ładowany na żądanie odczyt i edycję w Notatkach
i Badaniach. Budżet instalacji pozostaje 600 żądań. Współdzielenie
identycznych bieżących aliasów pięciu niezmienionych plików
`ds_lms.js`, `reinehr_cdgp_data.js`, `vilda_centile_interpolation.js`,
`adult_vitals.js`, `bp_module.js` ogranicza dodatkowe pobrania;
historyczne wersjonowane wpisy nie są źródłem bajtów nowej wersji.
