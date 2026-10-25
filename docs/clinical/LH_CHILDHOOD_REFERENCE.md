# LH w dzieciństwie — wspólna górna granica i wynik bez mediany

**Decyzja właściciela z 25.10.2026:** po audycie źródeł i akceptacji
makiety 04 właściciel zlecił wdrożenie osobnego, orientacyjnego odniesienia
`LH ≤0,3 IU/L` dla obu płci, krótkiego komentarza przy wyniku oraz punktu
rzeczywistego wyniku w dziecięcych lukach median. To zmiana kliniczna
prezentowanego porównania, nie korekta danych Mayo ani walidacja kliniczna.

Własny [ekstrakt audytu i metadane źródeł](hormone-lifespan/evidence/lh-childhood-upper-reference-audit-2026-10-25.json)
rozróżniają liczby autorów i decyzje aplikacji. Pełne materiały, prywatna
makieta i raporty robocze pozostają poza publicznym repozytorium.

## Trzy niezależne informacje

| Informacja | Znaczenie |
| --- | --- |
| Jednostronne odniesienie `≤0,3` | Zaakceptowana wspólna górna granica orientacyjnego porównania. Nie ocenia zbyt niskiego LH. |
| Laboratoryjne RI i ocena czasu dojrzewania | Istniejące źródłowe osie wieku/stadium, `biochemical` i ostrzeżenia kliniczne zachowują własne reguły. |
| Wykres i źródłowa mediana | Punkt przedstawia wynik. W dziecięcej luce nie ma dokładnej mediany, łącznika ani ilorazu do mediany. |

Nowa oś nie zapożycza dolnego `<0,02` ani męskiego górnego `0,5` z Mayo.
Nie tworzy dwóch pozornie niezależnych norm wieku i stadium z tą samą
liczbą. W porównaniu orientacyjnym zastępuje ich domyślną prezentację jedną
osią; nie zmienia źródłowych RI, potwierdzonej klasyfikacji według metody
ani wcześniejszych zapisów. Nie jest dodatkowym profilem mediany wieku.

## Źródła, populacje i ograniczenia

1. **LabCorp/Esoterix, test 502286**, [aktualny katalog](https://www.labcorp.com/tests/502286/luteinizing-hormone-lh-pediatric-endocrine-sciences)
   i [*Endocrinology Expected Values*, dokument `DX_QRG_L5167-0422-19`](https://specialtytesting.labcorp.com/sites/default/files/2023-07/DX_QRG_L5167-0422-19.pdf),
   drukowana s. 41 / PDF 43, odczyt 25.10.2026. Wiersz wieku
   **12 miesięcy–8 lat, obie płcie: 0,02–0,3 mIU/mL**. Metoda katalogowa:
   two-site electrochemiluminescence; surowica preferowana, dopuszczone
   także osocze. Brak wskazanej platformy, liczebności tego wiersza,
   dokładnego percentyla RI, protokołu niskich wyników i pełnego opisu
   kohorty. Dokument jest nadal udostępniany, nie jest nowym badaniem 2026.
   Odrębny Tanner I ma M `0,02–0,3`, F `0,02–0,18`; kolumny `0,09/0,06`
   są **średnimi**, nie medianami. **Tylko górna wartość wiersza wieku**
   wspiera nową propozycję. Nie importujemy całej tabeli ani nie nazywamy
   `Th1 ≤0,3` zakresem stadium LabCorp.
2. **Mayo LHPED 62999**, [pełny katalog](https://www.mayocliniclabs.com/test-catalog/Overview/62999),
   aktualny pięciostronicowy PDF wygenerowany 25.10.2026: RI wieku i Tanner I
   na s. 2–3, metoda na s. 4. AnshLite LH CLIA, surowica, *Unpublished Mayo
   method*: M 1–8 lat `<0,02–0,5`, F `<0,02–0,3 IU/L`. Męskie `0,5` nadal
   istnieje w źródle; nie jest błędem transkrypcji. Czułość analityczna
   `0,02` nie jest górnym RI ani podanym tu LOQ. Nie opublikowano N,
   dokładnego percentyla lub danych wykazujących przenoszalność RI na
   każdą nieznaną metodę. Nowa granica ma własne pochodzenie i wersję.
3. **Bangalore Krishna i Garibaldi 2025**, [pełny przegląd](https://doi.org/10.3389/fped.2024.1504874),
   Front Pediatr 12:1504874, publikacja 21.01.2025; sekcje *General
   considerations*, *Baseline LH* i tabela 1. `≥0,3 IU/L` w odpowiednio
   czułych HS-IFMA/HS-ICMA jest omawianym **progiem sugerującym hormonalny
   początek pokwitania**, nie uniwersalną górną normą populacyjną.
   [Howard 2021](https://doi.org/10.1111/cen.14578), Clin Endocrinol
   95:702–716, sekcja *Biochemical diagnosis of precocious puberty*,
   również uzależnia progi od metody i wskazuje ograniczenia niskiego LH.
4. **Endocrine Society 2026**, [wytyczne dgag168](https://doi.org/10.1210/clinem/dgag168),
   JCEM 111(8):2101–2144, pełny *Question 3 / Recommendation 3*;
   [towarzyszący przegląd dgag169](https://doi.org/10.1210/clinem/dgag169)
   i [korekta dgag320](https://doi.org/10.1210/clinem/dgag320).
   Ultraczułe bazalne LH jest etapem diagnostyki u dzieci z cechami
   przedwczesnego dojrzewania. Dowody są głównie z dziewcząt B2/B3;
   zastosowanie do chłopców 1–6 lat, G1/Th1 i nieznanej metody jest
   ograniczone. Wytyczne nie ustanawiają wspólnego RI `0,3` i nie pozwalają
   wykluczyć CPP niskim wynikiem. Korekta nie zmienia tych progów.
5. **Wiedemann, Jonetz-Mentzel i Panse 1993**, [pełna publikacja](https://doi.org/10.1515/cclm.1993.31.6.395),
   s. 395–401, metody s. 396 i tabela 4 s. 398. **2–11 lat, obie płcie
   razem, N=282, P50 `<0,07 U/L`**. Surowica 08–10, Abbott IMx MEIA,
   WHO 68/40; wartości poniżej czułości podstawiano granicą i oznaczano
   `<`. To cenzurowana mediana całej grupy, nie dokładne `0,07`, mediana
   każdego wieku lub zdrowa kohorta potwierdzonego G1/Th1. Nie pokrywa
   wieku 1–<2. Nie aktywujemy stąd RI, P50 liczbowej ani modelu wieku.

`mIU/mL = IU/L` liczbowo. Przegląd nie był przeglądem systematycznym;
nie przypisuje wszystkim źródłom jednego N, metody, stadium lub poziomu
dostępu. Hashe i lokalizacje odczytanych dokumentów są w ekstrakcie.

## Co jest decyzją aplikacji

Pełny możliwy wiek musi mieścić się w **M `[1,9)` / F `[1,8)`**.
Są to zaakceptowane granice działania orientacyjnej propozycji, nie
odzyskana dokładna definicja wieku LabCorp. Nie dopisujemy dnia urodzenia
do ukończonych lat/miesięcy i nie wybieramy środka przedziału. Dokładne
8 lat F i 9 lat M nie kwalifikuje; przedział z wyłączonym takim końcem
może kwalifikować. Bez wieku propozycja jest niedostępna.

Kontekst dotyczy aktualnego dziecka, bazalnego LH w surowicy, poza znanym
leczeniem hormonalnym/stymulacją. Wykorzystujemy istniejący odczyt
tożsamości, wieku i aktualnego **G1 chłopca / Th1 dziewczynki**. Brak
stadium nie wymusza dodatkowego pytania i nie zamienia się w potwierdzone
stadium I. P/Ax ani nieokreślony numer Tannera nie zastępują G/Th.
Jawne G/Th 2–5 nie kwalifikuje nowej propozycji; zachowuje własne RI
i niezależne ostrzeżenia rozwoju. Nieznana metoda, pora pobrania,
materiał lub terapia pozostają nieznane. Dane źródła nie stają się
faktami o próbce; znana niezgodność i niegotowy kontekst zachowują bramki.

Matematyka to istniejące porównanie pomiaru z jednostronnym
`upper: { operator: '<=', value: 0.3 }`, przy `lower: null` i bez
`censoredLower`. Nie wprowadzamy zera, `0,02`, LOD/2 lub LOQ/2 jako
dolnej normy. `within` oznacza wyłącznie **nieprzekroczenie tej górnej
granicy**, nie pełną prawidłowość wyniku lub brak pokwitania.

Wersjonowane dane niosą `prepubertalLhPolicy`, identyfikator
`prepubertal-lh-clinical-orienting`, wersję `2026-10-25.1`.
Źródłowe profile Mayo i wynik ich `biochemical` nie są przepisane na
`0,3`; nowa propozycja ma własne pole oceny `prepubertalLh`.
To blok `status: available/unavailable` o `kind: clinical-orienting-reference`,
`orientingOnly: true` i `assayMatched: false`. Źródło
`vilda-prepubertal-lh-clinical-policy-2026`, `kind: application-clinical-policy`,
ma osobną notę wspierającego katalogu, nie jego nazwę jako metodę próbki.
Udostępnia własne `range`, `comparison`, `interpretation`, `stageContext`,
`applicabilityText`, `methodHelp` i `limitations`. Do nowego obliczenia
wymaga automatycznego doboru i jawnego `currentContextAvailable: true`.
Zgłoszona, ale odrzucona/nieaktualna obserwacja lub P nie jest brakiem
G/Th uprawniającym do obejścia tej bramki. Znana poprawnie opisana metoda
może otrzymać wyłącznie orientacyjne odniesienie; błędny zapis metody
nie otrzymuje domyślnego dopasowania. Dotychczasowe `referencePreview`,
`biochemical`, `clinical`, `summary` i `provenance` zachowują swoje dane.

Nie ma sprzeczności, gdy dokładne `0,3` nie przekracza przyjętego `≤0,3`,
a przegląd opisuje `≥0,3` jako sygnał diagnostyczny innej roli i dla
określonych metod. Nie zmieniamy operatora autorów na `>`, nie robimy
z `≤0,3` testu wykluczającego CPP i nie rozpoznajemy CPP samą liczbą.
Nowa informacja jest warunkowa, także przy G1; nie ustala stadium z LH.

## Komentarz i szczegóły przy wyniku

Przy pewnym przekroczeniu granicy komentarz mówi o **możliwej aktywacji
osi pokwitania**, z odniesieniem do znanego G/Th albo ogólnej oceny
pokwitania, wieku i metody laboratorium. Przy nieprzekroczeniu przypomina,
że niskie LH nie wyklucza wczesnej aktywacji osi. Niejednoznaczna
nierówność otrzymuje neutralne wyjaśnienie, nie komentarz o wysokim LH.
Istotne dotychczasowe ostrzeżenie czasu rozwoju zachowuje pierwszeństwo.

Zwijane objaśnienie przedstawia czułe metody jako umożliwiające oznaczanie
bardzo niskiego LH. **Nie ma monotonicznej reguły „nowsze/czulsze = niższa
górna norma”.** RI zależy także od populacji, wieku/stadium i laboratorium.
Niższe granice w konkretnych katalogach nie zastępują automatycznie
zaakceptowanej granicy ani zakresu danego laboratorium. Nie dodajemy
ankiety, potwierdzenia metody lub ręcznego przepisywania norm.

## Wykres: sam wynik i informacja Wiedemann

Zwykły wykres pokazuje dokładny, nieujemny wynik także bez mediany
w **M `[1,6)` / F `(1,6)`**. Zachowuje istniejącą linię i stałą skalę;
nie przesuwa wyniku na ilustrację. Nie dodaje jasnego punktu mediany,
łącznika, ilorazu, SDS lub centyla. Wynik ponad osią zachowuje rzeczywistą
liczbę przy strzałce. Nierówność/LOD/LOQ nie daje dokładnego punktu.

Dokładny rok dziewczynki pozostaje przy Ljubicic; od 6 lat obie płcie
zachowują Madsen. Wynik bez mediany nie obchodzi odrzucenia istniejącego
źródła z powodu metody, materiału lub kontekstu. Znana metoda nie musi
udawać metody publikacji tylko po to, by pokazać sam wynik w luce.

Wyłącznie przy całym wieku **`[2,6)`** rozwijane źródła mogą podać
„Mediana całej grupy 2–11 lat, obie płcie: <0,07 IU/L — Wiedemann 1993”.
Przedział aplikacji jest węższy niż grupa autorów. N282 nie oznacza N
poniżej 6 lat ani N każdej płci. Granica nie staje się wysokością punktu,
nowym RI, limitem metody pacjenta lub P50 w liczbowym rejestrze.

Odrębne `childhoodLhResultOnlyPolicies`, wersja `2026-10-25.1`, zawierają
polityki `childhood-male-lh-result-only` i `childhood-female-lh-result-only`
z pliku `hormone-lifespan/childhood-lh-result-only-policy.json`.
Nie zastępują dotychczasowego `resultOnlyPolicies` dla LH dziewcząt
`(16,18)`. Wymagają jawnego końca i sposobu domknięcia całego przedziału
wieku, bez domyślnego traktowania brakującej górnej granicy jako dokładnego
wieku. Notka jest odrębna od kwalifikacji dokładnej kropki: wynik
cenzurowany może zachować tekst grupy, nie staje się przez to liczbą.
Stan źródła, tożsamość i bramki bieżącego kontekstu nadal obowiązują.
Nowe polityki wymagają `currentPatientOnly: true` i jawnego
`childhoodLhContextAvailable === true`; adapter ustawia tę chwilową flagę
tylko po zgodnym gotowym odczycie, poza lock/restore/clear i przygotowaniem
zapisu. Nie jest ona zapisywanym faktem klinicznym i nie zmienia kontraktu
dawnej ścieżki dziewcząt `(16,18)`.

## Tożsamość, historia i dane już wpisane

Odczyt bieżącego kontekstu i aktywnej oceny musi zachować pierwszeństwo
oraz precyzję wieku. Zmiana osoby/płci, lock, restore, kontekst niegotowy
lub spóźniony odczyt nie mogą przywracać starej osi, komentarza lub punktu.
Szczegóły są domyślnie zwinięte i resetowane przy zmianie kontekstu.
Nie kopiujemy metody/protokołu z innego badania lub źródła.

Nowa ocena jest wyliczana wyłącznie dla bieżącego sprawdzenia i, gdy
dostępna, utrwala własne wersjonowane `prepubertalLh`: profil, górną granicę, pochodzenie,
interpretację oraz użyte wtedy stadium. `VildaLabSnapshot` zachowuje
tylko dozwolone pola; chwilowe flagi dostępności kontekstu i tożsamość
runtime nie trafiają do tej koperty. Renderer historii pokazuje zapisany
zakres i komentarz bez wywołania silnika lub danych aktualnego formularza.
Dlatego nowy wynik `0,4`, pokazany powyżej `0,3`, nie staje się po odczycie
samym porównaniem `within` wobec dawnego Mayo `0,5`.

Stare oceny bez `prepubertalLh` pozostają bez tego pola. Nie przeliczamy
ich granicą `0,3`, dzisiejszym wiekiem lub stadium i nie dopisujemy nowych
komentarzy. Zachowujemy surowy wynik, operatory, dotychczasowe zakresy,
wersje i ostrzeżenia. P50 Wiedemann nie trafia do historii lub synchronizacji
jako liczba; źródłowe odniesienia wykresu nie są nowym snapshotem LH.

## Przypadki wejście → oczekiwany wynik i weryfikacja

Poniższe fikcyjne przypadki określają kontrakt, nie deklarują wyniku CI.

| Wejście | Oczekiwane zachowanie |
| --- | --- |
| M4/G1 lub F4/Th1, LH `0,3 IU/L` | Nie przekracza proponowanej górnej granicy; informacja o metodzie i niewykluczaniu wczesnej aktywacji. |
| Ten sam kontekst, `0,4` lub `>0,3` | `above`; warunkowy komentarz możliwej aktywacji; samo G1/Th1 nie zmienia się w G2/Th2 ani rozpoznanie CPP. |
| Ten sam kontekst, `<0,4` | `indeterminate`; neutralny komentarz, bez dokładnej kropki lub imputacji. |
| Ten sam kontekst, `0`, `<0,1`, `<LOD` lub `<LOQ` | Brak oceny zbyt niskiego LH; zero pozostaje rzeczywistym zerem. Nierówność/limit nie daje dokładnej kropki; limit bez liczby nie daje pewnej relacji do `0,3`. |
| M4 bez G / F4 bez Th | Orientacyjne odniesienie bez nowej ankiety i bez założenia G1/Th1. |
| M4/G2 lub F4/Th2 | Brak nowej propozycji; właściwa dotychczasowa ocena wieku/stadium i rozwoju nadal działa. |
| M8 lat / F7 lat, cały ukończony rok | Nowa górna granica może działać; nie poszerzamy dziecięcego trybu punktu bez mediany po 6 lat. |
| Dokładne M9 / F8 lub wiek przecinający taki brzeg | Brak dopasowania nowej propozycji; nie zaokrąglać do młodszej grupy. |
| Dokładne F1 / ukończone F1 | Dokładne F1 zachowuje Ljubicic; `[1,2)` nie otrzymuje fikcyjnej dokładności, aby wymusić punkt bez mediany. |
| M4/F4, sam wynik; rozwinięcie źródeł | Dokładny wynik na istniejącej osi bez mediany; tekst Wiedemann zachowuje `<0,07` i N całej grupy. |
| M/F 1 rok 6 mies. | Brak noty Wiedemann, brak ekstrapolacji mediany przed 2 lata. |
| Zmiana osoby, płci, lock/restore, terapia/stymulacja lub dawna próbka | Brak przejęcia aktualnego G/Th, starego punktu lub nowego komentarza; zachowane właściwe ograniczenia i dawna ocena. |

Regresje mają wywoływać produkcyjne porównanie, selektor, rzeczywisty
adapter, renderer i odczyt historii. UI wymaga kontroli desktop/320 px,
klawiatury i resetu źródeł; PWA rzeczywistej aktualizacji i zimnego startu
offline. Rzeczywiste wyniki kontroli oraz wszystkie kontrole GitHub dla
końcowego SHA są raportowane w PR. Zielone testy i akceptacja makiety
nie są walidacją kliniczną.
