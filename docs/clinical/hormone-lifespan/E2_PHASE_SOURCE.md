# E2 — mediana fazy w badanej grupie

Decyzja właściciela: zaakceptowana makieta desktop/mobile i polecenie wdrożenia
z zachowaniem dotychczasowego panelu wyniku, statusu i osi normy (22.10.2026).
To osobny blok informacji pod wykresem, poza registry liczbowego punktu,
laboratoryjnym RI i historią źródłowego odniesienia AMH.

## Źródło i znaczenie liczb

Anckaert i wsp., 2021, *Extensive monitoring of the natural menstrual cycle
using the serum biomarkers estradiol, luteinizing hormone and progesterone*.
DOI [10.1016/j.plabm.2021.e00211](https://doi.org/10.1016/j.plabm.2021.e00211),
[pełny tekst i suplement](https://pmc.ncbi.nlm.nih.gov/articles/PMC8042396/).
Zweryfikowano pełny tekst, tabelę 1 oraz kompletny oryginalny suplement DOCX
(Methods i tabele S1–S3). Ekstrakt i hashe:
[audyt źródła](evidence/e2-phase-source-audit-2026-10-22.json).

| Faza w źródle | Mediana, pmol/L | Uczestniczki |
| --- | ---: | ---: |
| Folikularna | 198 | 85 |
| Okołoowulacyjna | 757 | 81 |
| Lutealna | 412 | 85 |

Najpierw obliczono medianę wyników każdej uczestniczki w danej fazie,
a następnie medianę między uczestniczkami. Nie jest to P50 pojedynczego
pobrania, mediana dokładnego wieku, RI, SDS ani ocena rezerwy jajnikowej.
N to liczba uczestniczek, nie próbek. Wartości przybliżone 53,9/206/112 pg/mL
są skrótem prezentacyjnym przy dotychczasowym współczynniku E2 3,671.

Badano naturalne owulacyjne cykle 24–35 dni. Grupa analizowana: 85 kobiet,
przedział wieku 18–37 lat (USA 22–37, Europa 18–37), mediana wieku 25 lat.
Wykluczono m.in. ciążę, laktację, niedawną antykoncepcję hormonalną,
zaburzenia hormonalne i płodności, cykle nieowulacyjne oraz atypowe profile
hormonów. To wyselekcjonowana grupa, nie model wszystkich kobiet.

Surowica, Roche Elecsys Estradiol III, cobas e801, ECLIA. Metoda źródła nie
potwierdza metody próbki pacjentki. Zakres pomiarowy 18,4–11010 pmol/L nie
ustanawia osobnych LOD/LOQ; nie podstawiamy dolnej granicy ani jej połowy.
Źródłowe fazy odnoszą się do owulacji ustalonej z profilu hormonów i oceny
lekarskiej, bez niezależnego USG. Standaryzacja do 29 dni nie oznacza,
że pacjentka owuluje w dniu 15. Nie wnioskujemy fazy z wyniku ani wieku.

## Kontrakt produkcyjny

Czytelne dane `e2-phase-source-data.json` są pakowane przez `build_runtime.py`
jako `VildaHormoneLifespanData.e2PhaseSourceData`. Bezpaństwowy
`VildaE2PhaseSource.evaluate(data, context)` zwraca kopię źródła, wybranej
fazy, mediany, domeny i polityki. Renderer `VildaE2PhaseSourceUI` przedstawia
ten wynik. Nie oblicza własnej normy i nie zwraca wartości pacjentki,
ilorazu, percentyla, werdyktu ani współrzędnych wykresu.

Wymagane są gotowy kontekst bieżącej kobiety, znany wiek oraz faza
`follicular`, `ovulation` lub `luteal` z istniejącego lokalnego edytora E2.
Nie ma pytania o dokładny dzień cyklu ani nowego selektora. Nie przenosimy
automatycznie fazy LH/FSH. Brak fazy pozostawia obecne przeliczenie i neutralne
alternatywne RI, bez domyślnej mediany.

Cały możliwy wiek musi mieścić się w **[18,37]**. To konserwatywna polityka
aplikacji, nie odzyskana precyzja granic autorów. Ukończone 36 lat i 11 miesięcy
mogą kwalifikować, ukończone 37 lat nie. Dokładne 18/37 kwalifikują sam blok;
nie tworzymy dokładnej daty urodzenia z ukończonych lat. Blok nie wybiera
ani nie zastępuje dotychczasowego Madsen w dokładnym wieku 18.

Znana ciąża, menopauza, leczenie hormonalne, GnRHa i stymulacja zachowują
obecne blokady kontekstu E2. Ewaluator odrzuca również przekazaną jawną
laktację. Nieznany wywiad nie potwierdza ich nieobecności. Znana niezgodna
metoda lub materiał wyłącza blok; nieznana metoda/materiał pozwala na tę
ograniczoną informację edukacyjną. Aliasy metody i wyłączenia są danymi.
Nie dopisujemy pól ani pozornego dostosowania do terapii.

Blok jest widoczny w zwykłym widoku „Całe życie” z zaznaczonym E2.
Odznaczenie E2, zmiana okresu, porównanie płci, zmiana pacjenta/płci/analitu,
blokada konta, niegotowy kontekst i niepoprawny/pusty wynik czyszczą liczby,
metadane źródła i rozwinięte szczegóły. Obsługa kontrolek pełnego ekranu
czyta jedynie aktualny stan wykresu, bez ponownego liczenia formularza.

## Wynik i wykres

Dokładny wynik liczbowy nadal korzysta z dotychczasowej ścieżki przeliczeń,
statusu, osi RI i znacznika. Mediana fazy nie klasyfikuje tego wyniku.
Krzywa, stała skala E2 **264 pmol/L**, zbliżenia i 85 wcześniejszych profili
pozostają identyczne. Dla wszystkich trzech faz liczby są w HTML poza SVG;
757/412 nie są przycinane do 264 ani rysowane jako nowy punkt źródłowy.

E2 przyjmuje też zapis z operatorem, np. `<5 pg/mL` → `<18,4 pmol/L`.
Istniejący parser nierówności otrzymuje jednostki E2 z przelicznika;
konwersje liczy rzeczywisty `LabUnitConverter`, bez czynników AMH.
Nie powstaje dokładny punkt, znacznik RI ani globalny werdykt.
Etykieta wyjaśnia krótko, że dokładna wartość nie jest znana.
`<LOD`/`<LOQ` pozostaje zapisem bez liczbowego progu i bez konwersji
nieznanej granicy. Mediana badanej grupy jest od tego niezależna.

Nie dodajemy mediany E2 do `lab.hormoneReference`, schematu historii,
przypiętej oceny ani dawnych wpisów. Odczyt historii nie liczy nowego źródła.

## Przypadki syntetyczne i sprawdzenia

- F30, E2 206 pg/mL, znana faza okołoowulacyjna → obecny wynik 206 pg/mL,
  status w zakresie dotychczasowego RI około 104–398 pg/mL i znacznik osi;
  osobno mediana grupy **757 pmol/L**, około 206 pg/mL.
- F30, znana folikularna/lutealna → odpowiednio **198/412 pmol/L**,
  z tą samą krzywą, niezależnie od wpisanego stężenia.
- Nieznana faza, F40 lub znana ciąża → brak bloku i liczby z poprzedniej
  fazy, z zachowanym przeliczeniem oraz właściwym istniejącym RI/ograniczeniem.
- `<5`, `<LOD`, `<LOQ` → brak pozornego dokładnego punktu lub klasyfikacji.

Testy wywołują rzeczywisty evaluator i adapter strony, sprawdzają granice
całego wieku, kontekst, jednostki, operator, historię, desktop/320/390 px,
pełny ekran i zgodność wcześniejszych danych. Osobny scenariusz PWA obejmuje
instalację, aktualizację i zimny start offline. Wyniki raportuje PR dla
aktualnego SHA; nie jest to nadanie statusu walidacji klinicznej.
