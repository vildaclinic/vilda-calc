# Dobowe wydalanie cytrynianów — Cit_mgkg / Cit_total24

Stan decyzji: **05.11.2026**. Właściciel zaakceptował
[makietę przed/po na desktopie i telefonie](https://vilda-citrate-dzm-20261105.maciej-flader.chatgpt.site)
i polecił implementację. Baza implementacji:
`17c6f5eca46bd18603f7424d7a1cf66cafc5b034`.
Zakres obejmuje ilość cytrynianów z dobowej zbiórki moczu. Nie zmienia
norm punktowego Cit/Cr ani odrębnego stosunku Ca/Cit.

Zmiana głównej miary, dodanie normy, konwersje, walidacja i zapis mają
wpływ kliniczny oraz funkcjonalny. Akceptacja właściciela i sprawdzenie
techniczne nie stanowią niezależnej walidacji klinicznej.

## Potwierdzone problemy i zakres zmiany

- Dokładne zero stężenia nie przechodziło gotowości formularza. Nowy
  model rozróżnia zero i brak danych; zero zachowuje neutralną ocenę,
  z uwagą o granicy oznaczalności.
- Małe dodatnie wydalanie mogło być prezentowane jako `0,0`, mimo że
  surowy wynik pozostawał dodatni. Przykład: `0,1 mg/dL ×1000 mL /60 kg`
  daje `0,016666… mg/kg/24 h`. Nie twierdzimy, że wszystkie stare zapisy
  utraciły surową wartość.
- Producent wyniku używany przez edytor zapisanego obliczenia przyjmował
  ujemne stężenie lub masę. Dwa ujemne operandy mogły dać dodatni iloraz.
  Zwykły formularz blokował te dane; naprawa dotyczy także edycji.
- Główne `mg/kg/24 h` wymagało masy do samej liczby. Nowa ilość dobowa
  jest dostępna bez antropometrii, a pediatryczne BSA służy do normy.
- Dawne pytania o kontekst kamicy, wiarygodność zbiórki i dwie zbiórki
  ograniczały dodatkowy panel interpretacji. Nie blokowały każdej liczby.
  Usunięto je z tego formularza; znane fakty o zbiórce nadal mają znaczenie.

Dotychczasowe zwykłe mnożenie stężenia przez objętość było poprawne.
Domyślne 24 h również już działało. Zachowanie tych funkcji nie jest
naprawą błędu współczynnika ani nowym potwierdzeniem kompletności.

## Minimalne dane i obliczenie

Pierwszy i domyślny tryb **„Oblicz ze stężenia”** wymaga stężenia
cytrynianów oraz objętości całej zbiórki. Czas ma rzeczywiście wpisane
**24 godziny**, z opcją zmiany. **„Gotowy wynik”** przyjmuje jedną
ilość dobową, bez ponownego mnożenia przez czas lub objętość.

| Wielkość | Jednostki |
|---|---|
| Stężenie cytrynianów | mmol/L domyślnie; także µmol/L, mg/L, mg/dL |
| Objętość całej zbiórki | mL, L |
| Gotowa ilość dobowa | mg/24 h, mmol/24 h |
| Główny wynik | mmol/24 h dla wejścia molowego; mg/24 h dla masowego |

`ilość na 24 h = stężenie na litr × objętość w litrach ×24 / czas[h]`.

`mg/dL ×10 = mg/L`, `µmol/L ÷1000 = mmol/L`, `mL ÷1000 = L`.
Przy 24 h czynnik czasu wynosi 1. Gotowy wynik jest już ilością dobową
i nie potrzebuje nieaktywnych stężeń ani objętości.

Do samej liczby nie potrzeba wieku, płci, masy, wzrostu, kreatyniny,
surowicy, pH ani rozpoznania. Wiek i płeć, a u dziecka również masa
i wzrost, pochodzą z istniejących danych pacjenta wyłącznie do normy.
Brak normy nie blokuje liczby i nie tworzy dodatkowej ankiety do
„pełnej interpretacji”.

## Czas, kompletność i zachowane fakty

Widoczna notka brzmi: **„Porównanie z normą dotyczy kompletnej zbiórki
24-godzinnej.”** Domyślne 24 h nowego formularza jest jawnym założeniem,
nie potwierdzonym faktem o próbce. Nie wymaga się checkboxów o dwóch
zbiórkach, kompletności, diecie, AKI, stabilności nerek lub IFCC.

Inny znany dodatni czas daje w trybie stężenia oszacowanie `×24/czas`,
bez automatycznej normy pełnej DZM. Gotowa ilość przy znanych 12 h
zachowuje liczbę, również bez normy. Zmiana trybu nie usuwa tego faktu.
Znana niepełna lub błędna zbiórka blokuje wiarygodny wynik dobowy
i zapis; skalowanie nie odtwarza pominiętej porcji moczu.

Puste pole w nowym formularzu korzysta z jawnego domyślnego 24 h.
Jawnie nieprawidłowy czas nie jest milcząco zastępowany dobą.
Nieznanemu czasowi historycznemu nie przypisuje się nowego domyślnego
24 h: ponowne wyliczenie ze stężenia wymaga czasu, a gotowa ilość
może pozostać dostępna bez normy. Dawnych lokalnych dat nie przelicza
się ponownie w aktualnej strefie urządzenia. Ogólna reguła:
[DZM_COLLECTION_DURATION.md](DZM_COLLECTION_DURATION.md).

## Wybrana norma i jej pochodzenie

Normy są danymi w `clcr_cit_dzm_reference_data.js`, poza silnikiem
`clcr_cit_dzm.js`. `VildaClcrCitDzm.evaluate(input, policy)` przyjmuje
politykę jako argument. `ClcrCitDzmReferenceData.DEFAULT_POLICY`
udostępnia **`eau-2026-citrate-dzm-v1`**, wersję 1, schemat
`clcr-cit-dzm-reference-policy`. Wynik zachowuje wersję, źródło,
populację, granicę i operator.

**EAU Guidelines on Urolithiasis 2026**:
[pełny rozdział metaboliczny](https://uroweb.org/guidelines/urolithiasis/chapter/metabolic-evaluation-and-recurrence-prevention),
[pełny PDF](https://d56bochluxqnz.cloudfront.net/documents/full-guideline/EAU-Guidelines-on-Urolithiasis-2026.pdf).
Odczytano pełny tekst 05.11.2026. Wstęp określa wydanie 2026 jako pełną
aktualizację. **Tabela 4.2, drukowana s. 47**, podaje dorosłe niskie
wydalanie `<1,7 mmol/dobę` u mężczyzn i `<1,9` u kobiet.
**Tabela 4.4, s. 48**, podaje dziecięce normy `>1,9` u chłopców
i `>1,6 mmol/1,73 m²/24 h` u dziewcząt.

| Profil aplikacji | Norma źródłowa | Norma przy głównej ilości całkowitej |
|---|---|---|
| Mężczyzna, ≥18 lat | ≥1,7 mmol/24 h | ≥1,7 mmol/24 h |
| Kobieta, ≥18 lat | ≥1,9 mmol/24 h | ≥1,9 mmol/24 h |
| Chłopiec, 1–<18 lat | >1,9 mmol/1,73 m²/24 h | >`1,9 ×BSA/1,73` mmol/24 h |
| Dziewczynka, 1–<18 lat | >1,6 mmol/1,73 m²/24 h | >`1,6 ×BSA/1,73` mmol/24 h |
| Dziecko <1 roku | Bez automatycznej oceny w przyjętej polityce | Liczba bez normy |

To dolne odniesienie stosowane w metabolicznej ocenie kamicy, nie pełny
dwustronny zakres zdrowej populacji ani indywidualny cel leczenia.
Tabela wytycznych nie dokumentuje dla każdej liczby osobnej kohorty
i metody oznaczenia. Aplikacja nie potwierdza metody laboratorium
pacjenta. Dieta, płeć i populacja mogą wpływać na wydalanie.

**EAU nie ustala dolnej granicy wieku dziecięcego przy cytrynianach.**
Wyłączenie automatycznej oceny poniżej 1. roku jest zaakceptowaną
05.11.2026 ostrożnościową decyzją aplikacji, a nie ograniczeniem
wieku przepisanym ze źródła. Nie zweryfikowano odrębnej tabeli DZM
dla wcześniaków, noworodków i niemowląt. Nie oznacza to dowodu, że
takie dane nigdzie nie istnieją. Przejście do profilu dorosłego od
18 lat również jest techniczną regułą aplikacji, nie nagłą zmianą
fizjologii. Nie tworzy się interpolacji między tymi kategoriami.

Wiek zachowuje dostępną dokładność. Brak wieku, płci lub potrzebnego
BSA pozostawia liczbę i konkretny powód braku porównania, bez normy
zastępczej dla dorosłych. Dorosły nie potrzebuje masy ani wzrostu.

## BSA i dokładne granice

Mosteller: `BSA[m²] = sqrt(masa[kg] ×wzrost[cm] /3600)`.
Źródło: Mosteller RD, *Simplified calculation of body-surface area*,
N Engl J Med 1987;317:1098,
[DOI 10.1056/NEJM198710223171717](https://doi.org/10.1056/NEJM198710223171717).
U dziecka granicę indeksowaną mnoży się przez `BSA/1,73`.
**Nie stosuje się maksimum dorosłego.** Duży nastolatek może mieć
większą całkowitą dolną granicę niż dorosły; źródło nie uzasadnia
jej obcięcia. Podpis to **„Norma dla pacjenta”**, z dopiskiem
**„Przeliczona dla powierzchni ciała”**, nie sama „Norma dla wieku”.

Równość dorosłej granicy nie oznacza obniżenia, ponieważ źródło
definiuje niskie wyniki przez `<`. Dziecięce `>` pozostaje ścisłe:
równość daje **„Na dolnej granicy”**, bursztynową ocenę i wyjaśnienie
operatora. Nie jest automatycznym rozpoznaniem choroby.

Ocena używa dokładnej ilości przed formatowaniem. Dziesiętne ilości
i konwersje zachowują pochodzenie; dla dodatnich wielkości dziecięce
porównanie można równoważnie wykonać na kwadratach bez zaokrąglenia
pierwiastka BSA. Nie dodaje się epsilon ani dowolnej strefy granicznej.
Źródło nie daje górnego patologicznego progu w tym porównaniu: duża
ilość nie otrzymuje automatycznej czerwonej kategorii.

## Jednostki masowe i molowe

Przyjęte stałe zachowują zgodność z istniejącym Cit/Cr:

| Podstawa raportowania | Identyfikator | mg/mmol |
|---|---|---:|
| Jon cytrynianowy | `citrate_ion` | 189,099 |
| Bezwodny kwas cytrynowy | `citric_acid` | 192,1235 |
| Niepodana | `unknown` | Bez konwersji masy do moli |

Jednostki molowe nie wymagają postaci masowej. Lista jednostek nie
powiela mg/L lub mg/dL w osobnych grupach. Przy masie krótki wiersz
z opcją **„Zmień”** pozwala wskazać postać. Niepodana pozostaje
niepodana; aplikacja nie wybiera automatycznie kwasu.

Z mg/L i objętości można obliczyć mg/24 h bez znajomości postaci.
Konwersja do mmol i przeliczenie molowej normy na mg wymagają
znanej podstawy. Nieznana postać pozwala na liczbę mg bez normy.
Przejście z wypełnionego pola molowego do masowego udostępnia wybór
postaci zamiast blokować użytkownika niewidocznym wymaganiem.

Jedna molowa granica jest podstawą klasyfikacji. Pediatryczne
odpowiedniki EAU `>365` i `>310 mg/1,73 m²/24 h` są zaokrąglone;
nie stają się drugim niezależnym progiem. Przykładowo 1,9 mmol
kwasu odpowiada dokładnie 365,03465 mg przy zadeklarowanej stałej,
a 1,9 mmol jonu — 359,2881 mg. Przełączenie jednostki nie zmienia
oceny tej samej ilości. Rzeczywista edycja unieważnia pochodzenie
poprzedniej konwersji; nie przechowuje się go dla innego pomiaru.

**Boehringer Mannheim/R-Biopharm, Citric acid UV-method**, Cat.
10 139076035, wersja 2011-05,
[pełna instrukcja](https://slatti.se/files/enzymatiska/Citric%20acid_EN_10139076035_2011-05.pdf),
s. 1 *Calculation*, s. 2 §2.1–2.2, odczyt 05.11.2026: oznaczenie
jonu może być wyrażone jako masa jonu, kwasu lub monohydratu.
To źródło konwersji analitycznych, nie norma kliniczna ani dowód
konwencji użytej w próbce pacjenta. Monohydrat i inne sole nie należą
do obecnego wyboru. Stałe aplikacji: [NIST, citric acid](https://webbook.nist.gov/cgi/cbook.cgi?ID=C77929)
i [ChEBI, citrate](https://www.ebi.ac.uk/chebi/CHEBI:16947).

## Znaczenie wyniku i inne źródła

Główny komentarz przy obniżeniu:
**„Mała ilość cytrynianów osłabia ochronę przed tworzeniem złogów
wapniowych i może zwiększać ryzyko kamicy.”**
EAU §4.4.2 omawia m.in. kwasicę metaboliczną i hipokaliemię jako
możliwe przyczyny. To informacje w Szczegółach, bez dodatkowych
pytań, automatycznego rozpoznania przyczyny lub wyboru dawki leku.
Nieobniżone wydalanie nie potwierdza skuteczności leczenia ani
nie wyklucza kamicy.

EAU §4.1.2 zaleca dwie kolejne dobowe zbiórki do swoistej oceny
metabolicznej kamicy. Rekomendację pokazuje się w Szczegółach;
obliczenie jednej zbiórki nie potwierdza wykonania dwóch i nie
wymaga checkboxa. Zbiórka oraz przechowywanie powinny odpowiadać
instrukcji laboratorium, bez samodzielnych zaleceń zakwaszania próbki.

Sprawdzone alternatywy pozostają oddzielne od przyjętej polityki:

- **Kirejczyk JK, Porowski T i wsp. 2014**, *Urinary citrate excretion
  in healthy children depends on age and gender*, Pediatr Nephrol
  29:1575–1582, [DOI 10.1007/s00467-014-2806-7](https://doi.org/10.1007/s00467-014-2806-7),
  [pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC4147207/),
  Methods, Table 3, Discussion: 2334 zdrowych dzieci kaukaskich
  z Białegostoku, 2–<18 lat, po równo obu płci, pojedyncza zbiórka
  24 h, zwykła dieta, metoda enzymatyczna R-Biopharm. Autorzy
  proponują przesiewowe **180 mg u chłopców /250 mg u dziewcząt
  na 1,73 m²/24 h**. To nie dokładny 5. centyl każdej grupy wieku
  ani cel leczenia kamicy; autorzy wskazują, że korzystne wartości
  u osób z kamicą powinny być wyższe. Badanie nie obejmuje niemowląt.
  Wyższe wydalanie u dziewcząt po pokwitaniu jest obserwacją; wpływ
  hormonów i pH jest proponowanym wyjaśnieniem, nie wykazanym
  mechanizmem. Nie zamienia się na tej podstawie wierszy płci EAU.
- **Hoppe B, Kemper MJ 2010**, *Diagnostic examination of the child
  with urolithiasis or nephrocalcinosis*, Pediatr Nephrol 25:403–413,
  [DOI 10.1007/s00467-008-1073-x](https://doi.org/10.1007/s00467-008-1073-x),
  [pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC2810372/),
  tabela 3: zgodne progi 365/310 mg oraz 1,9/1,6 mmol, bez dolnej
  granicy wieku. Przegląd omawia trudność zbiórek u niemowląt
  i różnice regionalne.
- **Injeyan i wsp. 2023**, *Hydration and Nephrolithiasis in Pediatric
  Populations: Specificities and Current Recommendations*, Nutrients
  15:728, [DOI 10.3390/nu15030728](https://doi.org/10.3390/nu15030728),
  [pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC9920266/),
  tabela 2: powtarza pediatryczne >365/>310 mg/1,73 m²/24 h.
- **Brazilian Society of Nephrology 2025**, de Carvalho i wsp.,
  *Brazilian Guidelines on evaluation and clinical management of
  Nephrolithiasis*, J Bras Nefrol 47(2):e20240189,
  [DOI 10.1590/2175-8239-JBN-2024-0189en](https://doi.org/10.1590/2175-8239-JBN-2024-0189en),
  [pełny tekst](https://pmc.ncbi.nlm.nih.gov/articles/PMC11913452/),
  tabela 4: >320 mg/dobę jako odniesienie dorosłych, 320–450 jako
  przedział uwagi, <320 jako próg działania. Nie są to dokładne
  przeliczenia obu płciowych granic EAU.

Powyższe pełne teksty odczytano 05.11.2026. Nie wybiera się źródła
zależnie od korzystniejszej oceny i nie łączy liczb w nową normę.
Pierwotnego badania Hoppe z 1997 r. oraz erraty nie zweryfikowano
w pełnym tekście; nie przedstawia się ich jako samodzielnie
sprawdzonej podstawy tych wartości. Także nieodczytane pełne
wytyczne AUA 2026 nie stanowią podstawy wdrożonych progów.

## Prezentacja, zero i walidacja

Jedna karta B łączy **„Wynik pacjenta”** z **„Normą dla pacjenta”**
w tej samej jednostce. Wynik nieobniżony ma podpis
**„Wydalanie nieobniżone”**; niski i dziecięca równość granicy są
bursztynowe. Liczba normy i jej jednostka pozostają neutralne.
Brak podstaw do oceny daje neutralną liczbę i konkretny powód.

Dokładne zero jest dopuszczalne, ale nie klasyfikowane jako niedobór
lub automatyczna hipocytraturia. Ma `outOfRange:null` i przypomnienie,
aby odróżnić zero od wyniku poniżej oznaczalności. Dostępna norma
może pozostać widoczna bez aktywnej klasyfikacji zera. Zapis `<`
nie jest samowolnie zamieniany na zero.

Każdy operand jest walidowany osobno, także przy edycji legacy.
Ujemne stężenie/ilość, niedodatnia wymagana objętość lub masa
legacy nie tworzą poprawnego wyniku przez znoszenie znaków.
Małe dodatnie wartości pozostają dodatnie w karcie, zapisie,
Notatkach i edytorze. Niereprezentowalna liczba lub wynik to błąd,
nie zero/nieskończoność. Skrót prezentacji nie zmienia klasyfikacji.

Stałe szerokości, wyrównane jednostki, symetria, mobilny tekst pól
≥16 px i wysokość ≥48 px oraz odstęp ≥20 px pod czyszczeniem
obowiązują również po zmianie jednostki, trybu, postaci i przy błędzie.
Szczegóły mogą pokazywać ilość indeksowaną oraz przeliczenie, lecz
nie tworzą drugiego pomiaru.

## Zapis, historia i edycja

Wybór formuły zachowuje **`Cit_mgkg`**, nowy główny wynik ma
**`Cit_total24` / `clcr:Cit_total24`** i jawne pochodzenie od tej
formuły. Dawne `Cit_mgkg` nadal oznacza **mg/kg/24 h**. Nie zmienia
się semantyki jego klucza ani nie dopisuje nowej normy do historii.
Stare pole `U_Cit` było jawnie kwasem cytrynowym w mg/dL;
nowe `CITDZM_` nie nadpisują wspólnego pola używanego przez Ca/Cit.

`ClcrCitDzmUi`, `ClcrCitDzmSession` i `ClcrCitDzmPersistence`
używają wspólnego modelu. `citDzmSnapshot`, schemat
**`clcr-cit-dzm`, wersja 1**, zamraża surowe wejścia i pochodzenie
konwersji, tryb, jednostkę/postać, czas i jego pochodzenie, znane
fakty o zbiórce, wiek/płeć/BSA i metodę, wynik oraz prezentację,
źródłową i zastosowaną granicę z operatorem, źródło/populację/wersję
polityki i ocenę. Brak oceny pozostaje `null`, nie `false`.

READ nie uruchamia dzisiejszego silnika ani nie ocenia historii
według dzisiejszego wieku lub BSA. Świadoma edycja nowego wpisu
korzysta z zachowanych wejść i polityki. Edycja starego `/kg`
zachowuje jego miarę i schemat, z poprawioną walidacją/prezentacją,
bez nowej retrospektywnej normy. Uszkodzona nowa migawka nie
przechodzi cicho do starego kalkulatora. Nie migruje się realnych
zapisów pacjentów.

Stare `/kg`, nowe mg i mmol oraz różne podstawy masowe pozostają
osobnymi seriami historii. Jedno obliczenie tworzy jeden pomiar
w Badaniach i czytelną notatkę bez technicznego drzewa JSON.
Zapis wymaga uprzednio zapisanej karty pacjenta. Czyszczenie usuwa
dane próbki i postać, pozostawia pacjenta oraz nowe domyślne 24 h;
zmiana pacjenta nie przenosi pomiaru ani normy poprzedniej osoby.

## Syntetyczne kontrakty wejście → oczekiwany wynik

Wszystkie wartości poniżej są syntetyczne. Stanowią kontrakt dla
testów rzeczywistych funkcji produkcyjnych, nie wynik niezależnej
walidacji klinicznej. Przy braku innej informacji zbiórka ma 24 h.

| Wejście | Oczekiwane zachowanie |
|---|---|
| Mężczyzna 40 lat, 0,85 mmol/L ×2 L | 1,7 mmol/24 h; norma ≥1,7; nieobniżone, równość włączona |
| Kobieta 40 lat, te same stężenie i objętość | 1,7 mmol/24 h; norma ≥1,9; obniżone |
| Kobieta, gotowe 1,9 mmol/24 h | Nieobniżone; dorosła granica włączona |
| Mężczyzna, gotowe 326,60995 mg kwasu albo 321,4683 mg jonu | Ta sama ilość 1,7 mmol/24 h i ocena przy zadeklarowanej postaci |
| Dziewczynka 10 lat, 30 kg/140 cm, 20 mg/dL kwasu ×1000 mL | 200 mg/24 h; BSA ≈1,08012345 m²; norma >≈191,92332726 mg/24 h; nieobniżone |
| Ta sama dziewczynka, 0,8 mmol/L ×1 L | 0,8 mmol/24 h; norma >≈0,99895810; obniżone |
| Chłopiec 17 lat, 70 kg/180 cm, gotowe 2 mmol/24 h | Norma >≈2,05466735 mmol/24 h; obniżone; bez obcięcia do dorosłego 1,7 |
| Chłopiec 17 lat, 69,2 kg/155,7 cm, BSA dokładnie 1,73 m², gotowe 1,9 mmol/24 h | Dokładnie na ścisłej dolnej granicy; „Na dolnej granicy”, nie „nieobniżone” |
| Ta sama równość jako 359,2881 mg jonu | Ta sama graniczna ocena, bez tolerancji wprowadzanej przez konwersję |
| 20 mg/dL, 1 L, niepodana postać | 200 mg/24 h dostępne; bez zgadniętych mmol i normy |
| Prawidłowe wejścia, wiek 0,99 roku; brak wieku; brak płci; dziecko bez BSA | Liczba dostępna; właściwy powód braku normy, bez zastępczej normy dorosłego |
| 1 mmol/L ×1 L, znane 12 h | Oszacowanie 2 mmol/24 h, bez normy pełnej DZM |
| Gotowe 1,4 mmol/24 h przy znanych 12 h | Pozostaje 1,4, bez ponownego skalowania i bez normy |
| Znana niepełna zbiórka, także po zmianie trybu | Blokada wiarygodnego wyniku i zapisu |
| Dokładne 0; puste pole; −1 | Odpowiednio liczba neutralna; brak danych; błąd — trzy różne stany |
| 0,000001 µmol/L ×1 L | Dodatnie 0,000000001 mmol/24 h, również w zapisie i edycji |
| Ujemne legacy `U_Cit` lub masa, także oba ujemne | Edytor nie zapisuje wyniku z nieprawidłowych operandów |

Regresje obejmują granice wieku 1/18 lat, obie płcie, ścisłe i włączone
granice oraz wartości minimalnie po obu stronach, znaną/nieznaną
postać, konwersje, czas/jakość, gotowość i zapis. Weryfikacja historii
obejmuje READ bez silnika, oddzielne serie, Notatki, edycję/usunięcie,
reset i zmianę pacjenta. Sprawdzenie UI obejmuje desktop, 390/320 px,
prowadzenie do wymaganych pól i PWA offline. Wykonane kontrole oraz
końcowy SHA raportuje PR; ta lista nie deklaruje ich wykonania.
