# Białko całkowite w dobowej zbiórce moczu — Prot_mgkg

Stan decyzji: **29.10.2026**. Właściciel zaakceptował
[makietę desktop/mobile](https://vilda-protein-dzm-20261029.maciej-flader.chatgpt.site),
następnie jawnie wybrał pediatryczny limit 150 mg/24 h, etykietę
**„Norma dla pacjenta”** i polecił kodowanie. Podstawy oraz ograniczenia
pozostają w [Szczegółach makiety](https://vilda-protein-dzm-20261029.maciej-flader.chatgpt.site/zrodla.html).
Audyt rozpoczęto na `2af9de5304035140ba491b9cd24dc40bdc09623d`, a implementację
na odświeżonym `audyt` `989830ceeb05f8c12acc4760622a50363459517a`.

Nowa ocena referencyjna, tryb stężenia i zasady zapisu stanowią zmianę
kliniczną i funkcjonalną. Przyjęty limit jest decyzją właściciela kalkulatora;
nie oznacza niezależnej walidacji klinicznej ani zgodności wszystkich źródeł.

## Co potwierdził audyt

- Stare pole `U_Prot` oznacza **łączną masę białka w całej zbiórce, w mg**.
  Istniejący producent poprawnie przeliczał ją przez `24/czas`. `U_Prot`
  nie jest stężeniem; jego znaczenie musi pozostać zachowane także dla
  współdzielonego obliczenia `B_Cr`.
- Dokładne zero było dopuszczalne w producencie, lecz blokowane przez
  gotowość formularza.
- Surowe 0,015 mg/24 h mogło być pokazane jako 0,0, a kolektor zastępował
  liczbę ogólnego zapisu laboratoryjnego zaokrąglonym zerem. Nowsza obwiednia
  obliczenia nadal zachowywała `rawValue`; nie wykazano nieodwracalnej utraty
  liczby we wszystkich ścieżkach.
- Wynik bez normy mógł otrzymać `outOfRange:false`, mimo braku oceny.
- Jeden pomiar mógł tworzyć trzy serie: `Prot_mg24`, `Prot_g24` i `Prot_bsa`.
  Są to różne przedstawienia tej samej ilości, a nie trzy niezależne badania.

Nie wykazano potrzeby zmiany istniejącego pediatrycznego wzoru Haycocka ani
reguły nowych domyślnych 24 h. Brak profilu referencyjnego w starym kodzie
nie oznacza braku wszystkich opublikowanych norm pediatrycznych.

## Minimalne dane i jednostki

Pierwszy i domyślny tryb **„Oblicz ze stężenia”** przyjmuje:

- stężenie białka całkowitego: `mg/L`, `mg/dL` lub `g/L`;
- objętość całej zbiórki: `mL` lub `L`.

Drugi tryb **„Gotowy wynik”** przyjmuje jedną ilość dobową w `mg/24 h` lub
`g/24 h`. Główny wynik pozostaje w jednej z tych jednostek niezależnie od
wieku pacjenta. Białko całkowite jest mieszaniną; nie wprowadzamy arbitralnej
masy molowej i jednostek mmol.

Po sprowadzeniu jednostek:

`mg/24 h = stężenie mg/L × objętość L × 24 / czas h`.

`1 g = 1000 mg`, `1 mg/dL = 10 mg/L`. Gotowa ilość dobowa jest już
znormalizowana do doby: nie mnoży się jej ponownie przez objętość ani
`24/czas`. Nowe pola stężenia nie reinterpretują `U_Prot`; dla historycznej
łącznej ilości z całej zbiórki nadal obowiązuje dotychczasowe znaczenie.

Wiek, masa i wzrost są pobierane ze znanych danych pacjenta. Nie są
obowiązkowe do ilości bezwzględnej. Masa i wzrost dziecka są potrzebne
wyłącznie do porównania przez BSA i pomocniczego przeliczenia na m².
Płeć nie zmienia przyjętych progów. Nie dodajemy selektora choroby,
ciąży, leczenia, stabilności czynności nerek, AKI ani IFCC.

## Czas i znane błędy zbiórki

Nowa zbiórka ma rzeczywiście wpisane **24 godziny**, z opcją **„Zmień”**.
To jawne założenie użytkowe, a nie potwierdzony fakt o próbce. Puste nowe
pole nie blokuje wyniku; jawne zero, ujemny czas i nieprawidłowy zapis
wymagają korekty. Wspólny mechanizm opisuje
[DZM_COLLECTION_DURATION.md](DZM_COLLECTION_DURATION.md).

Inny dodatni czas daje oszacowanie na dobę bez oceny normy pełnej DZM.
Przełączenie na gotowy wynik nie usuwa znanych 12 h: zachowuje liczbę
bez ponownego skalowania i zachowuje brak porównania. Znana niepełna lub
błędna zbiórka blokuje obliczenie i zapis w obu trybach. Brak nowych
obowiązkowych checkboxów nie usuwa wcześniej znanych sprzeczności.

Nieznany czas historycznego pomiaru nie staje się nowym domyślnym 24 h.
Przy świadomej edycji takiego zapisu potrzebny jest utrwalony lub podany
czas liczbowy; nie odtwarza się go z dawnych lokalnych dat przez
`Date.parse` w aktualnej strefie urządzenia.

## Przyjęta norma i jej pochodzenie

Normy i kwalifikacja są wersjonowanymi danymi w
`clcr_protein_dzm_data.js`, poza silnikiem `clcr_protein_dzm.js`.
Domyślna polityka to
`ClcrProteinDzmReferenceData.DEFAULT_POLICY`, identyfikator
**`PROTEIN_DZM_KDIGO_OWNER_CAP_2026_10_29`, wersja 1**.
`VildaClcrProteinDzm.evaluate(input, policy)` przyjmuje wybraną politykę
jako argument, a wynik niesie jej
źródła, populację, wersję i zastosowane granice. Odczyt historii zachowuje
użytą politykę bez ponownego doboru z dzisiejszych danych pacjenta.
Migawka ma schemat **`clcr-protein-dzm`, wersja 1**; wspólny producent
ilości to `compute`, a prezentacji jednostki `presentation`.

| Grupa przy pełnych 24 h | Górna granica; wynik musi być ściśle mniejszy | Zakres nerczycowy |
|---|---|---|
| Poniżej 6 miesięcy | Bez automatycznej normy tego profilu | Bez automatycznej kategorii |
| 6–<12 miesięcy, znana BSA | `min(150 × BSA, 150)` mg/24 h | Bez kategorii z profilu KDIGO 2025 dla wieku 1–18 lat |
| 1–<18 lat, znana BSA | `min(150 × BSA, 150)` mg/24 h | `≥1000 × BSA` mg/24 h |
| Od 18 lat | 150 mg/24 h | ≥3500 mg/24 h |

BSA jest powierzchnią ciała w m², wyznaczaną dotychczasowym pediatrycznym
wzorem Haycocka: `0,024265 × masa kg^0,5378 × wzrost cm^0,3964`.
Źródła progów nie wskazują tego wzoru jako jedynej metody; zachowanie
Haycocka jest kontynuacją istniejącej metody aplikacji.

**Limit `min(150 × BSA, 150)` jest decyzją właściciela z 29.10.2026.**
KDIGO 2024 S193 dosłownie podaje pediatryczne `<150 mg/m²/24 h` od
6 miesięcy i u starszych dzieci. Sprawdzony akapit nie ustanawia funkcji
minimum z całkowitym 150 mg/24 h. Nie należy więc nazywać ograniczenia
dosłowną regułą KDIGO ani dowodem jednej fizjologicznej normy.

Przy BSA 0,7 m² przyjęta norma wynosi **<105 mg/24 h**, a przy 1,0 lub
1,5 m² **<150 mg/24 h**. Dokładna równość granicy nie spełnia `<`.
Limit dotyczy wyłącznie granicy prawidłowego wydalania: dziecko z BSA
≥1 m² nie przechodzi przez to na dorosły próg nerczycowy.

Protokół AEP 2022 podaje inne ogólne pediatryczne kryterium:
`<100 mg/m²/24 h` oraz opis całkowitych 150 mg/24 h. Przy BSA 0,5 m²
proponowana reguła kalkulatora daje 75 mg/24 h, a przeliczenie AEP
50 mg/24 h. Limit nie usuwa tej rozbieżności. Wartości 100, 150 oraz
`4 mg/m²/h ×24 = 96 mg/m²/24 h` nie są dokładnymi konwersjami jednej
granicy. Nie wybieramy źródła zależnie od korzystniejszego wyniku.

Próg pediatrycznego zakresu nerczycowego pochodzi z KDIGO 2025,
Figure 1: **≥1000 mg/m²/24 h**. Wiek 1–18 lat jest zakresem wytycznej;
przejście na profil dorosły w osiemnaste urodziny jest jawną konwencją
aplikacji, nie skokiem fizjologii. Dla 6–<12 miesięcy pozostaje ogólne
porównanie bez automatycznej kategorii nerczycowej tego profilu.

Od 18 lat stosujemy ogólny próg PER `<150 mg/24 h` oraz **≥3,5 g/24 h**
z KDIGO 2021, Figure 4. Chorobowo swoiste KDIGO 2025 IgAN opisuje
`>3,5 g/dobę`; kalkulator świadomie zachowuje ogólny operator `≥`
i nie staje się algorytmem IgAN. Katalogi laboratoryjne także różnią się
zakresami; np. Mayo PTU podaje dla ≥18 lat `<229 mg/24 h`.

## Brak porównania i granice interpretacji

Nieznany wiek, brak wiarygodnej BSA u dziecka, wiek <6 miesięcy lub
zbiórka o znanym innym czasie pozostawiają poprawną liczbę neutralną,
z konkretnym powodem. Nie otrzymują zastępczej normy dorosłych.
Niepewność wieku nie jest dopisywana jako dokładna data; nie przyznaje
kwalifikacji do profilu obejmującego tylko część możliwego wieku.

Istnieją opublikowane neonatalne i niemowlęce przedziały, m.in. w Thomas,
Clinical Laboratory Diagnostics §12.9.5. Ich luki wieku, definicje
wcześniactwa i szczegóły kohort nie pozwoliły przyjąć jednej automatycznej
normy tego modułu poniżej 6 miesięcy. To ograniczenie wybranego profilu,
a nie twierdzenie o nieistnieniu wszystkich danych.

Dokładne zero jest poprawną liczbą, ale ma neutralny opis o sprawdzeniu
raportu i oznaczalności. Nie jest rozpoznaniem niedoboru białka ani
bezwarunkowym prawidłowym wynikiem. `<LOD`, `<LOQ` i `<wartość` nie są
dokładnym zerem; nie wymyślamy progu oznaczalności laboratorium.
Mała dodatnia ilość pozostaje dodatnia w każdej jednostce, widoku i zapisie.
Dotyczy to obsługiwanego zakresu reprezentacji liczbowej. Gdy wybranej
jednostki nie można zachować jako dodatniej skończonej liczby, wynik jest
jawnie blokowany, zamiast zastępowany zerem (skrajny przykład:
`5e-324 mg/24 h` po wyborze g). Zwykłe małe ilości, w tym audytowane
0,015 mg/24 h =0,000015 g/24 h, pozostają dostępne.

Sama ilość nie rozpoznaje zespołu nerczycowego, PChN, przyczyny
białkomoczu, remisji, nawrotu lub skuteczności leczenia. Pediatryczne
`<100 mg/m²/24 h` w KDIGO 2025 jest elementem kryterium remisji przez
kolejne dni; nie należy nadawać remisji jednemu ogólnemu pomiarowi.
Nie przypisujemy kategorii albuminurii A1–A3 z białka całkowitego.
Ocena położnicza wymaga odrębnego kontekstu; ten formularz nie rozpoznaje
preeklampsji i nie dodaje ankiety ciążowej.

## Jedna karta i jeden nowy pomiar

Zaakceptowana karta B pokazuje wynik i **„Normę dla pacjenta”** w tej
samej jednostce. Przy porównaniu poniżej granicy status brzmi
**„W przyjętej normie”**. Osiągnięcie lub przekroczenie górnej granicy
jest bursztynowe, a zakres nerczycowy czerwony. Liczby normy i jej
jednostki pozostają neutralne. Brak oceny oznacza `outOfRange:null`,
nie `false`.

Szczegóły przedstawiają źródło, BSA, granicę przed ograniczeniem,
limit 150 mg/24 h, zastosowaną granicę oraz ewentualne przeliczenie
na mg/m²/24 h. Są to dodatkowe wiersze tego samego pomiaru; nie osobne
karty wyniku ani niezależne zapisy badania. Usunięty na życzenie
właściciela komentarz „Oceniaj jego utrzymywanie się i kontekst kliniczny.”
nie wraca do wyniku.

Nowy zapis utrwala jedną kanoniczną ilość z jednostką prezentacji,
dokładną wartością, wejściami, czasem i jego pochodzeniem, kontekstem
pacjenta, BSA, źródłami, wersją polityki, zastosowanym limitem i oceną.
Badania, Notatki, historia, wykres, raport i edycja korzystają z tej samej
migawki; nie pobierają liczby z zaokrąglonego tekstu i nie wyliczają normy
z aktualnych danych innego pacjenta. Notatki nie drukują technicznego JSON.

Starsze serie `Prot_mg24`, `Prot_g24` i `Prot_bsa` zachowują odczyt oraz
edycję. Nie łączymy ani nie usuwamy dawnych realnych rekordów i nie
dopisujemy im dzisiejszej normy. Zapis nadal wymaga zapisanej karty
pacjenta, a nowy pacjent nie dziedziczy poprzedniego pomiaru.

## Syntetyczne kontrakty regresji

Poniższe wartości dotyczą fikcyjnych danych i rzeczywistych producentów
produkcyjnych. Liczby graniczne porównuje się przed zaokrągleniem, bez
poluzowania nierówności przez epsilon. Prezentacja ma zachować stronę
granicy także po zmianie mg↔g.

| Wejście | Oczekiwany wynik i ocena |
|---|---|
| 200 mg/L ×1500 mL, 24 h; dziecko 10 lat, 30 kg, 140 cm | 300 mg/24 h; Haycock BSA ≈1,071769169 m²; norma <150 mg/24 h po limicie; zwiększone, poniżej ≥1071,769169… mg/24 h zakresu nerczycowego |
| Znana BSA 0,7 m²; wiek 10 lat, pełna DZM | Górna granica 105 mg/24 h; dokładnie 105 nie spełnia `<105` |
| Znana BSA 1,5 m²; wiek 17 lat, 150 mg/24 h | Norma <150 mg/24 h po limicie; 150 poza nią; próg nerczycowy nadal 1500 mg/24 h |
| Znany dorosły, 0,15 g/24 h | 150 mg/24 h; osiągnięta ścisła granica normy |
| Znany dorosły, 3,5 g/24 h | 3500 mg/24 h; zakres nerczycowy według wybranego ogólnego `≥` |
| 0,001 mg/dL ×1500 mL, 24 h | 0,015 mg/24 h; nadal dodatnie w karcie, raporcie i zapisie |
| Stężenie 0 przy dodatniej objętości | Liczba 0; neutralne sprawdzenie raportu, bez fikcyjnego LOD |
| 200 mg/L ×750 mL, 12 h | 150 mg w zbiórce →300 mg/24 h oszacowania; bez normy pełnej DZM |
| Gotowe 300 mg/24 h przy znanych 12 h | 300 bez ponownego skalowania, bez normy pełnej DZM |
| Historyczne `U_Prot=300` mg, 12 h | 600 mg/24 h według dawnego znaczenia masy całej zbiórki; objętość nie zmienia tej liczby |
| Brak wieku lub BSA dziecka; <6 miesięcy; historyczny brak czasu | Liczba zachowana tam, gdzie dane wystarczają; bez zastępczej normy/automatycznego dopisania 24 h |
| Znana niepełna/błędna zbiórka | Blokada obu trybów i zapisu, bez utraty wpisanych wartości |

Regresje obejmują ponadto granice 6 i 12 miesięcy oraz 18 lat, źródło
przekazane jako dane, niezależność progu nerczycowego od limitu,
zamrożoną historię, zgodność dawnych serii, edycję i usunięcie jednego
nowego pomiaru, zmianę pacjenta, desktop/390/320 px oraz działanie offline.
Testy muszą wywoływać rzeczywiste funkcje, nie kopię wzoru w teście.
Rzeczywiste moduły obejmują zestawy `tests/unit/klirens-protein-dzm-engine.test.mjs`,
`tests/unit/klirens-protein-dzm-persistence.test.mjs` i
`tests/unit/klirens-protein-dzm-ui.test.mjs`; scenariusze przeglądarkowe
znajdują się w `tests/e2e/klirens-protein-dzm.spec.mjs` i
`tests/e2e/klirens-protein-dzm-offline.spec.mjs`.
Końcowy wynik wykonanych zestawów i kontroli aktualnego SHA podaje PR.

## Pełne źródła i lokalizatory

Odczyt pełnych dokumentów: 29.10.2026; źródłowe znaki nierówności
sprawdzono również w oryginalnych rycinach. Próg i nazwa używane przez
interfejs nie oznaczają zgodności metody lokalnego laboratorium.

1. **KDIGO 2024 CKD**. *Kidney International* 2024;105(Suppl 4S):S117–S314.
   DOI [10.1016/j.kint.2023.10.018](https://doi.org/10.1016/j.kint.2023.10.018).
   [Pełny PDF](https://kdigo.org/wp-content/uploads/2026/04/KDIGO-2024-CKD-Guideline.pdf).
   S193 / strona PDF 78, Pediatric considerations: pediatryczne
   `<150 mg/m²/d`; S190–193: sposób pomiaru i ograniczenia. Rok katalogu
   internetowego nie zmienia wersji klinicznej dokumentu na 2026.
2. **KDIGO 2025 Nephrotic Syndrome in Children**. *Kidney International*
   2025;107(Suppl 5S):S241–S289.
   DOI [10.1016/j.kint.2024.11.007](https://doi.org/10.1016/j.kint.2024.11.007).
   [Pełny PDF](https://kdigo.org/wp-content/uploads/2025/04/KDIGO-2025-Guideline-for-Nephrotic-Syndrome-in-Children.pdf).
   S261 / PDF 22: zakres wieku; S262 / PDF 23, Figure 1: zakres nerczycowy
   `≥1000 mg/m²/d`, odrębne kryteria zespołu i remisji.
3. **KDIGO 2021 Glomerular Diseases**. *Kidney International*
   2021;100(Suppl 4S):S1–S276.
   DOI [10.1016/j.kint.2021.05.021](https://doi.org/10.1016/j.kint.2021.05.021).
   [Pełny PDF](https://kdigo.org/wp-content/uploads/2017/02/KDIGO-Glomerular-Diseases-Guideline-2021-English.pdf).
   S16 / PDF 21: PER `<150 mg/d`; S90–92, w szczególności Figure 4
   na S91 / PDF 96: ogólny dorosły zakres nerczycowy `≥3,5 g/24 h`.
4. **De Lucas C, Izquierdo E. Proteinuria. AEP 2022**.
   *Protoc diagn ter pediatr.* 2022;1:81–92.
   [Pełny protokół](https://static.aeped.es/05_proteinuria_0_8a42ad173d.pdf),
   s.81–83 i 91: `<100 mg/m²/d` oraz alternatywne opisy godzinowe
   i całkowite; ujawniona rozbieżność, nie drugi automatyczny profil.
5. **KDIGO 2025 IgAN/IgAV**.
   [Pełny PDF](https://kdigo.org/wp-content/uploads/2024/08/KDIGO-2025-IgAN-IgAV-Guideline.pdf),
   S9: PER; S50, PP1.5.1: chorobowo swoiste `>3,5 g/d`, odróżnione
   od ogólnego operatora zastosowanego w kalkulatorze.
6. **Thomas, Clinical Laboratory Diagnostics**, wydanie 11, 18.11.2025.
   [Pełny rozdział 12](https://clinical-laboratory-diagnostics.com/k12.html),
   §12.9.5: źródłowe zakresy neonatalne i niemowlęce z ograniczeniami
   kwalifikacji; nie połączono ich w normę ciągłą tego modułu.
7. **Mayo PTU**, [pełny katalog](https://www.mayocliniclabs.com/test-catalog/Overview/614001):
   ≥18 lat, turbidymetria, `<229 mg/24 h`; przykład odmienności norm metod.
8. **NICE NG133**, aktualizacja 17.04.2023,
   [pełne Recommendations](https://www.nice.org.uk/guidance/ng133/chapter/recommendations#assessment-of-proteinuria-in-hypertensive-disorders-of-pregnancy),
   §1.2: odrębna ocena białkomoczu w ciąży; nie źródło ogólnej normy DZM.
