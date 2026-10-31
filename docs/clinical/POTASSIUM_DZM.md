# Dobowe wydalanie potasu — K_mmol_d

Decyzja właściciela: zaakceptowana makieta desktop/mobile i polecenie kodowania
31.10.2026. [Podgląd](https://vilda-k-dzm-20261030.maciej-flader.chatgpt.site).
Zmiana obejmuje obliczenie, orientacyjne porównanie laboratoryjne, prezentację,
precyzję i zapis. Testy nie stanowią niezależnej walidacji klinicznej.

## Źródło i rzeczywiste pokrycie

Domyślna polityka używa wyłącznie **Labcorp 003186, Potassium, 24-Hour Urine**:
[pełny katalog](https://www.labcorp.com/tests/003186/potassium-24-hour-urine?letter=M),
sekcje **Reference Range**, **Methodology**, **Specimen Requirements**, **Use**.
Pełny odczyt: **30.10.2026**. Katalog nie podaje wersji norm ani daty ich
wyznaczenia, liczebności, kryteriów zdrowia, diety lub pochodzenia kohorty.
Metoda katalogowa: ISE / fotometr płomieniowy. Nie przypisuje się tej metody
próbce pacjenta ani nie uznaje jej za udokumentowaną metodę pierwotnej kohorty.
Materiał: pełna zbiórka 24 h, z podaną objętością dobową. Jednostka zakresów:
**mmol/24 h**, nie stężenie mmol/L, spożycie ani cel suplementacji.

| Wiek w katalogu | Chłopcy / mężczyźni | Dziewczęta / kobiety |
| --- | ---: | ---: |
| 0–5 lat | Nieustalony | Nieustalony |
| 6–17 lat | 11–88 | 10–70 |
| 18–80 lat | 20–116 | 14–95 |
| >80 lat | 16–83 | 6–67 |

Pediatryczna tabela Labcorp, *Pediatric Testing Reference Ranges*, ©2022,
s.42, potwierdza grupę 6–17 i brak ustalonego zakresu 0–5; bieżący katalog
uzupełnia grupę >80. Katalog nie określa dokładności wieku przy granicach.
**Jawna konwencja aplikacji**, zaakceptowana przez właściciela: ukończone lata,
czyli odpowiednio **[6,18), [18,81), ≥81**, bez interpolacji i zaokrąglania
wieku w górę. Źródłowy `sourceAgeLabel` pozostaje obok predykatów aplikacji.
Wiek 80 lat 11 miesięcy pozostaje w grupie 18–80. Obie liczbowe granice
przedziału są włączone; to konwencja aplikacji dla zapisu zakresu myślnikiem.

Dane referencyjne są oddzielone od bezstanowego silnika. Silnik przyjmuje
politykę jako argument, a wynik niesie źródło, populację, użyty profil,
wersję, granice i ograniczenia. Brak właściwego wieku lub płci oraz wiek <6
pozostawiają liczbę bez oceny. Nie ma zastępczej normy dorosłych ani
przełączenia na inne laboratorium tylko z powodu brakujących danych.

## Obliczenie i jednostki

Domyślnie wystarczą stężenie potasu **mmol/L** i objętość całej zbiórki
**mL** lub **L**. Alternatywą jest jedna gotowa ilość **mmol/24 h**.
Nie ma wyboru jednostek masowych ani jednostki wyniku. Dla jednowartościowego
K⁺ liczbowo **mEq/L = mmol/L**, **mEq/24 h = mmol/24 h**.

`K mmol/24 h = stężenie mmol/L × objętość L × 24 / czas h`

Nowa zbiórka ma rzeczywiście wpisane **24 h**, z opcją **Zmień**. Puste pole
czasu nowej zbiórki podczas wpisywania nadal korzysta z jawnego domyślnego
24 h, bez zmiany surowego pola lub zapisu do momentu opuszczenia pola.
Historycznie nieznany czas nie otrzymuje domyślnego 24 h. W trybie stężeń
brak rzeczywistego historycznego czasu blokuje obliczenie; gotowa ilość dobowa
pozostaje dostępna liczbowo, bez porównania do pełnej DZM. Znany czas inny
niż 24 h daje proporcjonalne oszacowanie dobowe, bez normy pełnej DZM.
**Gotowej ilości dobowej nigdy nie skaluje się drugi raz** przez czas lub
objętość. Znana błędna / niekompletna zbiórka lub jawnie niepoprawny czas
blokują oba tryby i zapis.

Wiek i płeć pochodzą z istniejącego kontekstu pacjenta. Nie dodaje się pytań
o masę, wzrost, potas we krwi, chorobę, leczenie lub kompletność zbiórki.
Znane sprzeczności pozostają istotne; brak nowej ankiety nie kasuje ich.

## Precyzja i ocena

Wartości ujemne są błędem także podczas edycji i walidacji zapisu. Dokładne
zero pozostaje neutralne, z uwagą o raporcie / oznaczalności; dostępny zakres
może nadal być pokazany, bez klasyfikowania zera jako niskiego lub prawidłowego.
Mała dodatnia wartość pozostaje dodatnia w wyniku, raporcie i badaniu.
Nie ma arbitralnego limitu stężenia 200 mmol/L. Operandy i wynik muszą mieścić
się w skończonym Number; stężenie i gotowy wynik ≥0, objętość i czas >0.
Dodatni underflow i overflow kończą się
błędem zamiast pozornego zera lub poprawnego zapisu null.

Obliczenie przechowuje dokładną ilość dziesiętną / wymierną jako metadane
bezpieczne dla JSON. Ocena używa dokładnej wartości przed skróceniem zapisu.
Skrócona prezentacja ma znak **≈**, a Szczegóły pełny zapis. Przełączenie
samej jednostki objętości zachowuje ilość i jej pochodzenie; nie oznacza
badania jako zmienionego.

Jedna karta B łączy wynik i **Normę dla wieku · Labcorp** w tej samej
jednostce. Liczby normy są neutralne, odchylenia bursztynowe, brak oceny
neutralny. Status **W zakresie laboratoryjnym** nie rozpoznaje prawidłowego
stanu potasowego. Wynik w zakresie nie wyklucza nadmiernej utraty nerkowej
przy hipokaliemii. Niski wynik może wiązać się z małą podażą lub oszczędzaniem
potasu i wymaga uwzględnienia kompletności zbiórki; sam nie rozpoznaje
hipokaliemii. Wysoki może wiązać się z podażą, suplementacją lub utratą
nerkową; sam nie rozpoznaje hiperkaliemii.

## Kontekst kliniczny i ograniczenia

Podaż potasu, suplementacja, leki, funkcja nerek i kompletność zbiórki
wpływają na wynik. Laboratorium pacjenta może stosować inny zakres.
Nie przelicza się wyniku automatycznie na spożycie ani dawkę leczenia.

Kontrolnie przeczytano **Mayo Clinic Laboratories KUR 614060**, pełny PDF
wygenerowany 30.10.2026, *Reference Values* s.2 i *Interpretation / Cautions*
s.3: ≥18 lat 16–105 mmol/24 h, <18 nieustalony. Ten profil nie jest używany
jako fallback. Warunkowe progi przy hipokaliemii z Mayo (<30/>30 mEq/d,
brak gałęzi równej30) nie są normą zdrowej populacji. Fragmenty *Use* Labcorp
również zawierają inne warunkowe progi i mieszaną wielkość mmol/L versus
mmol/24 h; nie tworzą automatycznej diagnozy utraty nerkowej.

**Alder Hey**, *Laboratory Reference Ranges*, v3.0, styczeń2026, s.48,
podaje granice zależne od masy, lecz bez precyzyjnych granic grup i
zweryfikowanej kohorty źródłowej. Nie wypełnia nimi luki <6. Nie scala się
różnych laboratoriów ani nie uśrednia ich zakresów. AAFP2023 ma niejednoznaczny
zapis jednostki w kontekście DZM; nie stanowi podstawy automatycznego progu.

## Zapis i zgodność historii

Jeden pomiar `K_mmol_d`, klucz `clcr:K_mmol_d`, migawka
`clcr-potassium-dzm` v1 / `potassiumDzmSnapshot`. Badania, Notatki, raport,
historia i edycja zachowują tę samą ilość, jednostkę, ocenę, dokładność,
kontekst i źródło. Brak oceny ma `outOfRange:null`, nie `false` / „W zakresie”.
Odczyt dawnych zapisów nie liczy ich ponownie dzisiejszym silnikiem lub
normą aktualnego pacjenta. Świadoma edycja może odzyskać precyzję z dawnych
wejść, lecz nigdy nie wymyśla historycznego czasu. Edycja i usunięcie dotyczą
tego samego ID. Zapis wymaga wcześniej zapisanej i wybranej karty pacjenta.

## Przypadki regresji rzeczywistego silnika

| Wejście | Oczekiwany wynik |
| --- | --- |
| M40, 100 mmol/L, 1500 mL, 24 h | 150 mmol/24 h; powyżej 20–116 |
| K10, gotowy wynik10 mmol/24 h, 24 h | W zakresie 10–70, dolny koniec włączony |
| M81, gotowy wynik83 mmol/24 h, 24 h | W zakresie 16–83, górny koniec włączony |
| 5 lat lub brak płci, 100 mmol/L, 1500 mL, 24 h | 150, bez normy |
| 100 mmol/L, 1500 mL, 12 h | 300, oszacowanie, bez normy pełnej DZM |
| Gotowe150 mmol/24 h, znane12 h | 150, bez powtórnego skalowania, bez normy |
| 0 / 0,001 mmol/L ×1500 mL, 24 h | 0 neutralne / dodatnie0,0015 |
| Ujemne stężenie, jawnie błędny czas lub zbiórka | Błąd i brak zapisu |

Testy wywołują produkcyjne funkcje; osobno sprawdzają granice wieku/płci,
iniekcję innej polityki, dokładność, rzeczywisty renderer, sanitizery,
powiązanie z pacjentem, desktop/mobile i ponowne uruchomienie offline.
