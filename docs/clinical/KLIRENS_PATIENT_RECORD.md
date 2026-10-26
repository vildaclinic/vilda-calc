# Klirens: wspólny zapis i historia Badań pacjenta

Decyzja właściciela z 25.10.2026, po akceptacji makiety desktop/mobile
obejmującej zapis, pełną historię, wykresy oraz edycję i usuwanie pomiaru.

## Jeden zapis

Notatka `wynik-klirens` w istniejącym sejfie pacjenta jest jedynym rekordem
wyniku. Główna karta → Badania i Historia wyników Klirensu pokazują ten sam
identyfikator. Nie tworzy się kopii `wynik-badania`, migracji ani drugiej bazy.
Starsze notatki są czytane bez zapisywania nowych wartości lub ocen.

`clcr_saved_results.js` zawiera wspólny słownik 45 wyjść 41 aktywnych wzorów,
serializację i czytniki zapisanej oceny. Odczyt nie wywołuje silników klinicznych,
nie używa dzisiejszego wieku/płci i nie dobiera nowego źródła normy. Metoda,
indeksacja, jednostka i postać masowa rozdzielają nieporównywalne serie.
Nieznana albo unieważniona ocena nie otrzymuje zielonego statusu.

Główne Badania dołączają tę projekcję do dotychczasowej historii laboratoryjnej;
dotychczasowe reguły zwykłych badań i notatek leczenia pozostają odrębne.
Powtórna projekcja tego samego ID jest pomijana. Dwa rzeczywiste pomiary
z jednakową datą i wartością pozostają osobnymi wpisami.

## Prezentacja i nawigacja

„Zapisz do Badań pacjenta” pokazuje pacjenta i datę. Po zapisie skrót otwiera
główną kartę bezpośrednio na Badaniach, zgodnie z istniejącą nawigacją powłoki
lub samodzielnej strony. Historia wyników Klirensu ma osobny link.

Grupy są rozwinięte i zawierają wszystkie pomiary. Na telefonie zachowane są
czytelne wiersze, wspólne szerokości i pola co najmniej 48 px / 16 px.
Nagłówki tabel są białe na turkusie. „Nowy pomiar” przygotowuje bieżący
formularz z lokalną dzisiejszą datą, zachowując pacjenta; nie zapisuje pustej wizyty.

Wykres punktowy pokazuje dokładne wartości liczbowe. Oś kolejnych zapisanych
pomiarów jest porządkowa, z prawdziwymi datami i jawnym opisem równych odstępów.
Kilka oznaczeń z jednego dnia nie otrzymuje wymyślonych godzin ani łącznika
sugerującego kolejność pobrania. Wynik graniczny `<`, `≤`, `>` lub `≥` jest
widoczny w wykazie, ale jego granica nie staje się dokładnym punktem. Ujemny UAG
pozostaje ujemny; nie odczytuje się go wyłącznie z ogólnej serii sejfu, która
może nie zawierać takiej wartości.

Pasmo normy pochodzi wyłącznie ze zgodnych zapisanych odniesień pomiarów tej
samej serii. Przy różnych lub brakujących odniesieniach pozostaje własna norma
każdego wiersza. Nie stosuje się dzisiejszych norm do historii. Bursztyn/czerwień
oznaczają zapisane odchylenie, a brak oceny pozostaje neutralny.

## Edycja i usuwanie

Nowy zapis zachowuje wersjonowany opis rzeczywiście użytych wejść, jednostek,
znanych faktów, pochodzenia założeń i źródeł. Dane innych obliczeń oraz tożsamość
z bieżącego formularza nie są dopisywane do tego opisu. Odpowiedzi zachowane
w pamięci odpowiedniej wersji formularza, np. znana PChN, nie znikają dlatego,
że ich kontrolka nie jest aktualnie zamontowana.

Edytor w Szczegółach poprawia datę i oryginalne wejścia. Wiek/płeć są kontekstem
z dnia badania, z możliwością świadomej korekty. Bez wiarygodnej DOB zmiana daty
nie wylicza nowego wieku. „Przelicz i zapisz zmiany” używa istniejących funkcji
klinicznych i zastępuje cały wynik/ocenę pod tym samym ID. Nie podmienia samej
liczby obok starej kategorii, normy lub komentarza. Niepełny starszy zapis jest
czytelny i możliwy do usunięcia; edycja wymaga kompletnych oryginalnych danych
i dostępnego, zgodnego profilu źródłowego. Anulowanie niczego nie zapisuje.

Usunięcie potwierdza nazwę, wartość i datę konkretnego pomiaru. Nie usuwa całej
grupy ani innych oznaczeń z tego samego dnia. Dla Prot/KTV każde z trzech wyjść
ma własny ID; operacja nie zgaduje wspólnego pakietu na podstawie daty/tytułu.

Warunkowe aktualizowanie/usuwanie wymaga istniejącego ID, pacjenta i zgodnej
rewizji. Ponowienie tworzenia używa stałego ID i nie nadpisuje zmienionego ani
usuniętego rekordu. Blokada konta, konflikt lub błąd trwałego zapisu nie otrzymuje
potwierdzenia sukcesu. Odświeżenia między ramkami używają dotychczasowych sygnałów
unieważnienia bez treści klinicznej i ponownie czytają wybranego pacjenta.

## Wpływ kliniczny i źródła

Nie dodano wzorów, progów, norm, populacji ani konwersji. Edycja jest jawnym
ponownym obliczeniem istniejącym silnikiem, z zachowaniem zgodnego źródła.
Wspólna arytmetyka dawnych wzorów jest w `clcr_saved_legacy_calculator.js`;
główny formularz i edytor używają tych samych funkcji.

Obowiązują istniejące wersjonowane profile: KDIGO 2024 dla właściwych eGFR/ACR/PCR,
CKiD U25 2021, Cockcroft–Gault 1976, PathWest 20.03.2026 dla zmierzonego klirensu,
Mayo i pozostałe wskazane profile wskaźników, EAU 2026 oraz KDOQI 2015/2006
wyłącznie w ich dotychczasowych populacjach i kontekstach. Szczegółowe źródła
i ograniczenia pozostają w plikach danych i odpowiednich wpisach rejestru
[ALGORITHMS.md](ALGORITHMS.md). Nie jest to nowa walidacja kliniczna tych wzorów.

Sprawdzane przypadki obejmują m.in. ACR 45 → 13,6 (A2 → A1), U25 83 → 97
(G2 → G1), wiek 1,5 roku bez przeniesionej normy ≥90/kategorii G, raw 89,704…
z wynikiem widocznym 90/G2 i dopiskiem „Przed zaokrągleniem: <90”, graniczne
wskaźniki bez punktu, signed UAG −15, wszystkie 45 wyjść, oddzielne pomiary
jednego dnia oraz aktualizację/usuwanie z zachowaniem ID.
