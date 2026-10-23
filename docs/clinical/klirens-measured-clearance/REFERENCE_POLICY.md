# Klirens kreatyniny ze zbiórki — polityka wyniku i odniesienia

Polityka: **P-KLIRENS-CL24-2026-10-23**. Przegląd źródeł: 23 października
2026. Właściciel zaakceptował
[makiety desktop/mobile](https://chatgpt.com/space/page_983746180154819187d502dac321405a)
i polecił wdrożenie 23.10.2026 („ok jest dobrze koduj to”). Jest to akceptacja
zakresu klinicznego i sposobu prezentacji; przegląd źródeł i testy techniczne
**nie nadają algorytmowi statusu walidacji klinicznej**.

Polityka zastępuje wcześniejszy wymóg rutynowego potwierdzania każdej czynności
zbiórki oraz podawania dat początku, końca i pobrania krwi w formularzu `cl24`.
Nie zmienia zasad DZM w profilu kamicowym, Cockcrofta–Gaulta ani równań eGFR.
Dokumentację źródeł i mapę pokrycia zawiera [SOURCE_REVIEW.md](SOURCE_REVIEW.md).

## Jeden wynik z czterech wartości

Do obliczenia bezwzględnego klirensu wystarczają cztery dodatnie, skończone
wartości: stężenie kreatyniny w surowicy `Scr`, stężenie kreatyniny w moczu
`Ucr`, całkowita objętość `V` i rzeczywisty czas zbiórki `actualDurationHours`
(kontrolka formularza `Cl24DurationHours`).
Jednostki stężeń są jawne; nie są dodatkowymi danymi biologicznymi.

```text
t [min] = actualDurationHours × 60
CrCl [mL/min] = (Ucr / Scr) × (V [mL] / t [min])
```

Iloraz stężeń musi używać tych samych jednostek. Konwersje kreatyniny:
`mg/dL × 88,4 = µmol/L`, `mg/dL × 0,0884 = mmol/L`.
Przykładowo `Ucr 8,84 mmol/L` i `Scr 88,4 µmol/L` odpowiadają ilorazowi
`100 mg/dL / 1 mg/dL`, a nie `8,84 / 88,4`.
Ilość kreatyniny w `mg/24 h` nie jest stężeniem do tego pola.

Nie podstawia się czasu 24 h przy pustym polu. Przycisk „24 h” jest świadomym
ułatwieniem wpisu rzeczywistego czasu. Same cztery dane dają kompletny wynik
liczbowy i gotowość 4/4; brak danych do normy nie cofa gotowości ani nie tworzy
drugiej karty „pełnej interpretacji”. Wynik główny pozostaje w **mL/min**.

## Założenia, metoda oznaczenia i znane ograniczenia

Przy braku przeciwnych danych aplikacja jawnie zakłada stabilną czynność nerek,
brak podejrzenia AKI, pełną i prawidłowo wykonaną zbiórkę oraz odpowiednie
oznaczenie kreatyniny standaryzowane do IDMS. To założenia obliczenia, nie
fakty potwierdzone przez lekarza ani laboratorium. IFCC dotyczy cystatyny C;
nie jest nowym wymogiem ani etykietą dla kreatyniny w `cl24`.

Założenie IDMS jest opisem użytym w tej ścieżce, **nie nową obowiązkową bramką
kwalifikacji do `cl24`**. Jawnie znane non-IDMS pozostaje zapisane i komentowane;
nie jest zastępowane potwierdzeniem IDMS, nie jest też samo w sobie powodem
automatycznej blokady ilorazu Ucr/Scr. Równanie i wpisane stężenia pozostają
bez empirycznej korekty. Nie twierdzi się, że różnice analityczne zawsze znoszą
się w ilorazie, ani nie dopisuje metody enzymatycznej czy zgodności laboratoryjnej.
Publiczny PathWest nie podaje metody oznaczenia ani standaryzacji; założenie
aplikacji nie uzupełnia tej luki w źródle. Ta reguła dotyczy `cl24`, bez zmiany
wymagań standaryzacji innych równań.

Nie odtwarza się rutynowej ankiety o stabilność, metodykę oznaczenia, sześć
czynności zbiórki lub czas pobrania krwi. Krótka instrukcja przypomina o pełnej
zbiórce, rzeczywistym czasie oraz odpowiednio bliskim czasowo oznaczeniu Scr.
Nie narzuca się jednego nowego okna pobrania krwi: przejrzane laboratoria
stosują różne protokoły. W szczególności dawne wymaganie „wyłącznie podczas
zbiórki” jest bardziej restrykcyjne niż protokół PathWest.

Znane pominięcie, rozlanie lub dodatkowa porcja moczu, niezgodny protokół,
znane niewłaściwe pobranie, AKI i szybka zmiana kreatyniny zachowują znaczenie.
Ogólne założenie nie może nadpisać przeciwnej informacji ani wygenerować
pozornie miarodajnego wyniku. Wpis o znanym błędzie pozostaje widoczny także
po uproszczeniu formularza. Znana metoda oznaczenia pozostaje odrębną informacją
z powyższą regułą non-IDMS; nie utożsamia się jej ze stwierdzonym błędem zbiórki.

Dawny niezaznaczony checkbox może oznaczać brak potwierdzenia, a nie
rozpoznany błąd. Zgodność historyczna musi odróżniać te sytuacje; usunięcie
kontrolki nie upoważnia do zapisania dawnych flag jako `true`, skasowania
ostrzeżenia lub dopisania czasu 24 h. Rutynowy zakres tego formularza nie
oznacza, że specjalistyczny pomiar klirensu w AKI nigdy nie ma zastosowania.

## Automatyczny, nazwany profil PathWest

Wybrany profil to **PathWest CCL**, katalog z 20.03.2026, zakresy źródłowe
w `mL/min/1,73 m²`. Jest wybierany według wieku i potrzebnej płci, nigdy
według tego, który przedział daje korzystniejszy wynik.

| Wiek | Użycie profilu |
|---|---|
| `<3 lata` | Brak automatycznej normy w wybranym profilu PathWest. Normy pediatryczne istnieją w innych źródłach; nie ma cichego przełączenia na Seattle ani normy dorosłych. |
| `3 ≤ wiek <19 lat` | Jeden zakres 75–125 mL/min/1,73 m² dla obu płci. Płeć nie jest potrzebna wyłącznie do tego porównania. |
| `19 ≤ wiek <120 lat` | Osobne źródłowe przedziały mężczyzn i kobiet dla kolejnych grup wieku. |
| `wiek ≥120 lat` | Brak przedziału PathWest; bez ekstrapolacji ostatniej grupy. |

Wiek, wzrost, masę i potrzebną płeć pobiera się z bieżącego kontekstu pacjenta.
Opcjonalne uzupełnienie pokazuje tylko brakujące dane do normy. Nie pyta się
o płeć przed 19. rokiem wyłącznie na potrzeby tego profilu ani o dane, które
aplikacja już zna. Brak normy dla wybranego źródła i wieku nie jest komunikatem,
że nie istnieją żadne opublikowane normy klirensu dla tej grupy.

Pełna tabela źródłowa i granice wieku znajdują się w
[rejestrze dowodów](SOURCE_REVIEW.md#pathwest--aktywny-profil).
Normy pozostają wersjonowanymi danymi poza silnikiem:
`clcr_measured_clearance_reference_data.js`, profil `PATHWEST_CCL_2026_03_20`,
wersja 1. Silnik `clcr_measured_clearance_reference.js` przyjmuje profil,
a wynik niesie jego identyfikator, datę, źródło i użyte granice. Renderer nie
wyprowadza nowej normy z geometrii osi.

## Ta sama jednostka wyniku i normy

Przy jednej głównej liczbie w mL/min przelicza się **granice źródłowe**
do powierzchni ciała pacjenta. Nie przykłada się bezpośrednio przedziału
indeksowanego do bezwzględnego wyniku.

```text
zakres źródłowy = [L, U] w mL/min/1,73 m²
zakres przy wyniku = [L × BSA / 1,73, U × BSA / 1,73] w mL/min

BSA dla wieku <18 lat, Haycock [m²]:
  0,024265 × masa [kg]^0,5378 × wzrost [cm]^0,3964
BSA od 18 lat, Du Bois [m²]:
  0,007184 × masa [kg]^0,425 × wzrost [cm]^0,725
```

Dla dodatniego BSA jest to algebraicznie równoważne porównaniu indeksowanego
wyniku `CrCl × 1,73 / BSA` z oryginalnymi `[L, U]`. Przeliczenie nie tworzy
nowej, niezależnie zwalidowanej populacyjnej normy mL/min.
Nie podstawia się domyślnego BSA 1,73 m² ani masy należnej.

Granica BSA **18 lat** i granica źródłowej płci **19 lat** są niezależne:
18-latek używa Du Bois i wspólnego pediatrycznego przedziału PathWest.
Haycock/Du Bois to zachowana polityka aplikacji. Publiczny katalog PathWest
nie podaje swojego równania BSA; nie przypisuje się mu tych metod.

Status oblicza się z niezaokrąglonej liczby i granic: `<L` — poniżej,
`>U` — powyżej, równość z granicą — w zakresie. Wyświetlane granice są
przybliżone, np. **≈86,5–135,7 mL/min**. Jeżeli zaokrąglona liczba wygląda
na równą granicy, a niezaokrąglona ją przekracza, krótki komentarz wyjaśnia
odchylenie przed zaokrągleniem; kolor nie wynika z liczby po formatowaniu.

## Czas inny niż 24 h

Źródło PathWest używa kontekstu zbiórki dobowej (`UR24`). Nie publikuje
tolerancji czasu ani walidacji wszystkich krótszych protokołów.
**Przyjęta polityka aplikacji** pozwala przedstawić liczbowe porównanie
z zakresem dobowym także po wpisaniu innego rzeczywistego czasu, pod warunkiem
jawnego podania tego czasu i zakresu zastosowania źródła. Jest to decyzja
projektowa w zaakceptowanym modelu porównania źródłowego, nie zalecenie
PathWest i nie dowód równoważności protokołów.

Nie ma bramki `czas === 24` ani wymyślonego przedziału tolerancji, np. 22–26 h.
Pełną zbiórkę 23,5 h liczy się z **1410 min**, bez zamiany na 1440 min.
Na karcie pojawia się zwięzłe „Porównanie z normą dla zbiórki dobowej.”,
a status wskazuje ten zakres: „W zakresie dobowym”, „Poniżej zakresu
dobowego” lub „Powyżej zakresu dobowego”. Rzeczywisty czas, np. 23,5 h,
pozostaje jawny w Szczegółach, raporcie i nowym zapisie.
Przy krótkim protokole jest to nadal orientacyjne odniesienie do źródła
dobowego, a nie potwierdzona norma laboratoryjna tego protokołu. Nie dodaje
się kolejnej obowiązkowej ankiety. Ta polityka nie zmienia ścisłego warunku
24 h w innych modułach.

## Znaczenie koloru, źródło i pierwszeństwo laboratorium

Jedna karta łączy wynik, kierunek odchylenia, pasmo normy, znacznik pacjenta
i krótkie odniesienie. Wyniki poniżej i powyżej zakresu otrzymują bursztynowe
wyróżnienie oraz tekst kierunku, więc sam kolor nie jest jedyną informacją.
Źródło PathWest jest widoczne przy porównaniu; Szczegóły zawierają wybraną
grupę wieku/płci, oryginalny zakres indeksowany, rzeczywiste BSA i jego metodę,
przeliczenie, czas, założenia i ograniczenia.

„W zakresie normy” oznacza w tym miejscu **porównanie źródłowe**, nie
potwierdzoną klasyfikację laboratorium wykonującego badanie. Dane obliczenia zachowują
`referencePreview: true` oraz `patientLaboratoryMatched: false` w ograniczeniach
profilu, odrębnie od potwierdzenia laboratoryjnego. Norma właściwego laboratorium
ma pierwszeństwo, jeżeli jest dostępna; nie dodaje się obowiązkowego przepisywania
norm z wydruku ani selektora publikacji. Nie ustala się metody próbki pacjenta
na podstawie wybranego katalogu.

Nie przypisuje się kategorii G, nie rozpoznaje hiperfiltracji wyłącznie z
przekroczenia zakresu i nie wyklucza PChN na podstawie wyniku w przedziale,
także u seniora. CrCl może przewyższać rzeczywisty GFR wskutek wydzielania
cewkowego. Błędy zbiórki działają w obie strony, a wydalanie kreatyniny na
dobę lub kg nie dowodzi samodzielnie kompletności. Ciąża, nietypowa budowa
ciała, dieta, wysiłek, leki i wpływy analityczne mogą zmieniać wynik;
profil nie zawiera osobnej normy dla ciąży. Katalog nie dokumentuje metody
oznaczenia, pierwotnej kohorty ani liczebności poszczególnych grup wieku;
opublikowana grupa 100–<120 lat nie jest dowodem walidacji w dużej kohorcie
zdrowych stulatków.

Nie stosuje się podanego przez PathWest osobnego `>77 mL/min` jako uniwersalnej
normy bez BSA: strona nie precyzuje jego populacji, wieku ani płci.

## Zapis i przypadki syntetyczne

Trwały zapis korzysta z istniejącej treści notatki i `labResult.norm`.
Czytelna dla człowieka migawka zachowuje rzeczywiste wejścia i jednostki,
czas, wiek, potrzebną płeć, wzrost/masę, BSA i metodę, wybrany przedział,
źródło z URL i wersją/datą, założenia oraz znane ograniczenia. To zapis oceny
z chwili obliczenia, zachowywany przez rzeczywisty sanitizer vaulta.

Obiekt `measuredClearanceReference` służy wewnętrznemu punktowi danych
i prezentacji; nie jest deklarowany jako dowolne rozszerzenie utrwalonego
`labResult`. Sanitizer nie zachowuje nieznanych pól tego schematu. W ramach
tej zmiany nie rozszerza się wspólnego transportu, schematu danych ani vaulta;
kliniczne znaczenie normy i jej pochodzenie utrwala tekst oraz obsługiwane
`labResult.norm`, nie założenie o zachowaniu dodatkowych metadanych.

Odczyt historii nie przelicza dawnych wyników z dzisiejszym wiekiem, BSA lub
normami. Dawny zapis pozostaje czytelny, w tym utrwalone ostrzeżenia; nie
uzupełnia się go automatycznie nowym statusem prawidłowości.

W poniższych przypadkach Scr wynosi **1 mg/dL**, objętość **1440 mL**,
rzeczywisty czas **24 h**; `Ucr` jest w mg/dL. Podstawowe założenia są
spełnione, o ile wiersz nie wskazuje znanej sprzeczności. To fikcyjne dane.

| Przypadek | Dodatkowe wejścia | Oczekiwana liczba i porównanie |
|---|---|---|
| Dorosły, w zakresie | M, 45 lat, 70 kg, 175 cm, Ucr 100 | 100 mL/min; BSA 1,8481430181213463 m²; źródłowe 81–127; granice bezwzględne 86,53155171550813–135,67292676382138 mL/min, pokazane ≈86,5–135,7. |
| Ten sam dorosły, poniżej | Ucr 50 | 50 mL/min, poniżej tego samego zakresu, bursztynowy kierunek odchylenia. |
| Ten sam dorosły, powyżej | Ucr 160 | 160 mL/min, powyżej tego samego zakresu; bez automatycznego rozpoznania hiperfiltracji. |
| Dziecko bez podanej płci | 8 lat, 25 kg, 125 cm, Ucr 50 | 50 mL/min; Haycock ≈0,9289825610909617 m²; źródłowe 75–125; przeliczone ≈40,3–67,1 mL/min, w zakresie. |
| Senior | M, 82 lata, 70 kg, 175 cm, Ucr 70 | 70 mL/min; źródłowe 55–101; przeliczone ≈58,8–107,9 mL/min, w zakresie źródła; bez G i bez wykluczenia PChN. |
| Brak wieku, wzrostu, masy i płci | Ucr 100 | 100 mL/min i komplet 4/4, brak automatycznej normy; opcjonalnie tylko potrzebne brakujące dane. |
| Wiek <3 albo ≥120 lat | Ucr 100 | 100 mL/min; brak zakresu PathWest dla wieku, bez normy zastępczej. |
| Granica 18 i 19 lat | Wiek 18: płeć pusta; następnie 19: płeć pusta | W wieku 18 lat Du Bois i wspólne 75–125; od 19 lat do normy potrzebna płeć. Liczba mL/min pozostaje niezależna. |
| Rzeczywiste 23,5 h zamiast 24 h | Ucr 100, V 1410 mL | 100 mL/min; zapis 23,5 h / 1410 min i informacja o porównaniu z zakresem dobowym; bez cichej korekty czasu. |
| Jednostki SI | Ucr 8,84 mmol/L, Scr 88,4 µmol/L | 100 mL/min, to samo odniesienie co dla równoważnych mg/dL. |
| Brak lub niepoprawny czas | Czas pusty, zero, ujemny albo niefinitywny | Brak wyniku; bez domyślnego 24 h. |
| Znany błąd zbiórki | Jawne pominięcie/rozlanie lub inna przeciwna informacja | Zachowana informacja o błędzie, brak pozornie miarodajnej liczby i normalnego statusu; założenie nie usuwa sprzeczności. |
| Znane non-IDMS bez błędu zbiórki | Profil dorosłego, Ucr 100, zachowana informacja o non-IDMS | 100 mL/min bez automatycznej blokady wyłącznie z powodu non-IDMS; komentarz zachowuje znaną metodę, nie potwierdza IDMS i nie zmienia stężeń. Porównanie PathWest nadal nie jest potwierdzeniem zgodności metody laboratorium. |
| Granica zaokrąglenia | Wynik dokładnie L albo U; następnie L−0,00001 albo U+0,00001 | Równość należy do zakresu; nawet przy takim samym wyświetlanym zaokrągleniu wartości zewnętrzne są poniżej/powyżej. |

Regresje wdrożenia mają wywoływać rzeczywiste funkcje produkcyjne, integrację
założeń, porównanie, prezenter i formularz. Wstępny przegląd arytmetyki makiet
obejmował pięć przykładów z produkcyjnym obliczeniem, 17 przypadków doboru
wieku/płci i 12 sprawdzeń zaokrąglenia. Ten przegląd nie zastępuje testów
nowego wdrożenia ani oceny klinicznej; aktualne wyniki kontroli należą do PR.

Punkty regresji: `tests/unit/klirens-measured-clearance-reference.test.mjs`,
testy prezentacji oraz `tests/e2e/klirens-measured-clearance.spec.mjs`.
`computeTimedCreatinineClearance` zachowuje ścisły dawny kontrakt; uproszczony
formularz wybiera jawnie `protocolMode: 'assumed-complete'`, przekazuje
rzeczywiste `durationMinutes` i znany `collectionProblem`. Wspólny odczyt
`readCl24CalculationInput` służy obliczeniu i ocenie gotowości formularza,
aby cztery wymagane wartości nie były interpretowane na dwa sposoby.
