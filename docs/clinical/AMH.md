# AMH — laboratoryjne porównanie z zakresem dla wieku

Stan źródła: **13 października 2026**. Dane: `lab_units_data.js`,
`reference_policy.id=mayo-amh1-age-reference`, wersja `2026-10-13.1`.
AMH używa osobnej selekcji w istniejącym `LabUnitConverter`; pozostałe
anality zachowują dotychczasową selekcję. Wynik jest **orientacyjnym
porównaniem ze źródłem**, nie potwierdzeniem metody próbki ani rozpoznaniem.

## Pełne źródło i zakres weryfikacji

[Mayo Clinic Laboratories — AMH1 / 608824, Antimullerian Hormone, Serum](https://www.mayocliniclabs.com/test-catalog/Overview/608824)
oraz pełny, sześciostronicowy
[Setup PDF](https://www.mayocliniclabs.com/test-catalog/download-setup?format=pdf&unit_code=608824)
odczytano 2026-10-13. PDF wygenerowano „October 13, 2026 at 12:06 PM CT”.
To data odczytu/generowania, nie wymyślona data wejścia norm w życie.
Katalog nie podaje odrębnej daty obowiązywania tabeli.

Sprawdzono pełne sekcje: Reference Values (PDF s. 3, również obraz strony),
Method Name i Specimen (s. 1), Method Description (s. 5), Clinical Information,
Interpretation oraz Cautions (s. 2–5). Załącznik XLS zawiera tę samą tabelę.
Wersjonowany [ekstrakt źródłowy](amh/mayo-amh-2026-10-13.json) zawiera
liczby, operatory, adresy i SHA-256 pobranych dokumentów.

Metoda: **Roche Elecsys AMH ECLIA**, dwumiejscowy test kanapkowy z detekcją
elektrochemiluminescencyjną. Materiał: **surowica**. Katalog cytuje instrukcję
Elecsys AMH 2.0 English, 10/2022; tej instrukcji producenta nie odczytano
niezależnie. Dane odnoszą się do katalogu Mayo, nie do wszystkich testów Roche.
Mayo wyraźnie stwierdza, że oznaczenia AMH nie są wystandaryzowane i wyniki
różnych metod lub zestawów nie są zamienne.

Katalog nie podaje liczebności i pochodzenia populacji wyznaczającej każdy RI,
rozkładu wieku ciążowego, udziału wcześniaków, norm według stadium Tannera ani
najstarszego wieku uczestników. Nie dopisujemy tych właściwości.

## Zakresy źródłowe

Wszystkie stężenia w **ng/mL**. `null` dolnej granicy znaczy „nie podano”,
a nie zero. Górne granice `<` pozostają ścisłe.

| Płeć | Wiek — zapis Mayo | Zakres |
|---|---|---:|
| M | <2 lata | 18–283 |
| M | 2–12 lat | 8,9–109 |
| M | >12 lat | <13 |
| F | <3 lata | 0,11–4,2 |
| F | 3–6 lat | 0,21–4,9 |
| F | 7–11 lat | 0,36–5,9 |
| F | 12–14 lat | 0,49–6,9 |
| F | 15–19 lat | 0,62–7,8 |
| F | 20–24 lata | 1,2–12 |
| F | 25–29 lat | 0,89–9,9 |
| F | 30–34 lata | 0,58–8,1 |
| F | 35–39 lat | 0,15–7,5 |
| F | 40–44 lata | 0,03–5,5 |
| F | 45–50 lat | <2,6 |
| F | 51–55 lat | <0,88 |
| F | >55 lat | <0,03 |

Nie ma liczbowej dolnej normy u M >12 lat ani F ≥45 lat w tej tabeli.
Wynik nieprzekraczający górnej granicy nie potwierdza, że stężenie nie jest
zbyt niskie. Dotyczy to także niemierzalnego lub bardzo małego wyniku.

## Jawna polityka kwalifikacji

Całkowitoliczbowe kategorie katalogowe traktujemy jako **ukończone lata**:
„2–12” → `[2,13)`, „>12” → `[13,∞)`, „45–50” → `[45,51)`.
To konwencja aplikacji, nie opublikowany przez Mayo wzór dla dokładnego wieku.
Brak górnej granicy wieku w wierszu nie oznacza niezależnej walidacji wieku 90+.

Wymagane są znana płeć M/F i skończony, nieujemny wiek. Nie ma fallbacku
kobiet dorosłych. `life_stage`, Tanner V ani brak wieku nie uprawniają do
wiersza dla dorosłych. Przy znanym przedziale wieku cały przedział musi się
mieścić w jednym wierszu: górny koniec równy następnej granicy jest dopuszczony
wyłącznie jako wyłączony. Nie sklejamy sąsiadujących norm. Standalone API bez
`ageUpperYears` traktuje podaną liczbę jako dokładny wiek; formularz przekazuje
znaną precyzję, zamiast udawać większą dokładność.

W pierwszym roku **znane wcześniactwo** blokuje porównanie, bo katalog nie
publikuje osobnego RI wcześniaczego. Granica jednego roku jest konserwatywną
polityką aplikacji, nie warunkiem Mayo. Nie stosujemy progów GA 259–293 dni,
wieku skorygowanego ani kryteriów Greaves z LH/FSH. Nieznane wcześniactwo
pozwala wyłącznie na orientacyjne porównanie z ogólnym katalogiem; nie zostaje
zamienione na potwierdzone donoszenie. Wcześniactwo w wywiadzie nie wyłącza
wszystkich późniejszych grup wieku.

Nieznana metoda/materiał nie staje się znaną metodą/materiałem pacjenta.
Znana niezgodna metoda (np. Access, Gen II, picoAMH) lub materiał inny niż
surowica wyklucza porównanie Roche. Znane przeciwwskazanie/kontekst leczenia
lub stymulacji nie otrzymuje dopasowanych norm terapii: wymaga odrębnej oceny.
Mayo wymienia m.in. możliwość interferencji cetroreliksu, Ovitrelle,
Endometrinu i follistatyny; nie implementujemy oceny leków ani nowej ankiety.

Brak fazy cyklu nie blokuje porównania — katalog podaje względną stabilność
AMH w cyklu i nie publikuje tabel fazowych. **Wiek nie ustala menopauzy.**
Znana menopauza młodszej kobiety nie przenosi na nią wiersza `>55`.
Porównanie pozostaje porównaniem z zakresem **dla wieku**, bez osobnej normy
pomenopauzalnej. Nie rozpoznaje PCOS, niewydolności jajników ani nie kwalifikuje
do IVF. Nie zawiera progów decyzyjnych IVF/AFC lub PCOS jako „norm”.

## Kontrakt techniczny

`selectRange(amh, patient)` przyjmuje istniejące `age`, `sex` oraz opcjonalne
`ageUpperYears`, `ageUpperInclusive`, `preterm`, `method`, `specimen`,
`amh_contraindication`. `method` oznacza rzeczywiście zgłoszoną metodę próbki;
zapisana konfiguracja źródła nie spełnia tego warunku.

Wybrany zakres zachowuje `amh_reference: true`,
`clinical_reference_kind: 'age-source-comparison'`, identyfikator i wersję
polityki, źródło, metodę/materiał **zakresu** oraz `high_exclusive`.
Brak kwalifikacji daje `no_interpretation: true`, krótką przyczynę i puste
granice. `evaluate` zachowuje te metadane i rozpoznaje górny zakres bez dolnej
granicy. Dla ścisłego `<13` stężenie **13 jest powyżej**; dolne zero nie jest
dodawane do RI. Wizualne progi znacznego odchylenia zachowują dotychczasową
regułę aplikacji; nie są progami diagnostycznymi.

`compareAmhReference(siValue, range)` jest wspólną funkcją porównania dla
API i widoku. Przy granicy uwzględnia wyłącznie błąd reprezentacji zmiennoprzecinkowej
(8 × `Number.EPSILON` względem porównywanych wartości), bez zaokrąglania stężenia
lub normy. Dzięki temu 7,8 ng/mL i równoważne 55,6745182012848 pmol/L nie dostają
różnej oceny wskutek mnożenia binarnego. Ścisłe `<` zachowuje znaczenie także po
konwersji jednostek.

Jednostki pozostają zgodne z dotychczasowym przelicznikiem:
`1 pmol/L = 0,1401 ng/mL`; `1 μg/L = 1 ng/mL`.
Przeliczenie jednostek nie harmonizuje metod.

## Wpływ względem legacy i regresje

Usunięto wszystkie dawne wiersze AMH, ogólny fallback oraz nieudokumentowane
progi z notatek AMH. Stare wartości nie odpowiadały obecnemu katalogowi Mayo.

| Fikcyjny przykład | Nowy zakres / oczekiwane działanie |
|---|---|
| F13, 2 ng/mL | 0,49–6,9; dopasowany wiersz, bez fallbacku |
| F15, 0,45 ng/mL | poniżej 0,62–7,8 |
| F45,5 i F46, 2 ng/mL | w obu przypadkach poniżej górnej granicy <2,6; bez sztucznego skoku przy 46 |
| M, 90 dni, 80 ng/mL, brak znanego wcześniactwa | 18–283; orientacyjne porównanie ogólne, bez deklaracji normy minipuberty |
| M40, 13 ng/mL | powyżej ścisłej granicy <13; brak dolnej normy |
| F60, 0,03 ng/mL | powyżej ścisłej granicy <0,03 |
| F14–15 lat z włączonym górnym końcem | brak pojedynczego dopasowanego zakresu |
| Wcześniak w 1. roku / znana metoda Access | brak kwalifikacji do tego profilu |
| Brak płci lub wieku | brak normy, bez zastępczej populacji |

Regresje wywołują rzeczywisty `LabUnitConverter`:
`tests/unit/lab-amh-ranges.test.mjs`. Różnicowy przegląd wszystkich innych
analitów względem bazowego `54ace7f0` jest w artefaktach zadania;
wynik nie jest dowodem walidacji klinicznej.

### Korekta cytowania CALIPER

Legacy przypisywało PMID 35760370 błędny tytuł i DOI
`10.1016/j.clinbiochem.2022.06.011` (ten DOI dotyczy heavy chain disease).
Prawidłowe źródło: **Ronn, Bohn i wsp.**, *Anti-mullerian hormone (AMH)
reference values in the CALIPER cohort of healthy community children and
adolescents*, Clin Biochem. 2022;108:63–66,
[DOI 10.1016/j.clinbiochem.2022.06.005](https://doi.org/10.1016/j.clinbiochem.2022.06.005),
[PMID 35760370](https://pubmed.ncbi.nlm.nih.gov/35760370/).

Zweryfikowano rekord bibliograficzny i pełny abstrakt, **nie pełny artykuł**.
Abstrakt opisuje 300 próbek zdrowych dziewcząt 6–<19 lat. Liczby 3,18 ± 1,62
(6–<9 lat) i 4,16 ± 2,55 (9–<12 lat) są **średnimi ± SD**, nie medianami
ani normami dla wieku 2–12 lat. Usunięto błędne przypisanie z deskryptora AMH;
poprawiono jego nieużywany przez inne anality wpis bibliograficzny.
Nie aktywujemy RI CALIPER na podstawie samego abstraktu.

## Odrębność wykresu i historii

Normy Mayo nie zastępują źródłowych median/średnich wykresu życia.
Nie wyznaczamy mediany ze środka RI ani z górnej granicy.
Wynik na tle mediany i wynik na tle zakresu są osobnymi porównaniami.
Historia nie może automatycznie nadać staremu zapisowi nowych norm;
surowy wynik i jawny zapisany zakres pozostają zachowane.
