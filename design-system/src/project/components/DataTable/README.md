# DataTable

Pełnoszerokie tabele ze zwiniętymi obramowaniami: nagłówek w kolorze `--primary` z białym tekstem 600, cienkie linie #ddd, komórki .95rem, paski w odcieniu karty i delikatne teal podświetlenie wiersza; tabele wyników leżą w `.data-card` z ramką 2 px teal, a szerokie w `.table-scroll`, żeby strona nigdy nie przewijała się w poziomie.

## Kiedy używać

- Tabele referencyjne i wynikowe: centyle talii/bioder (`#whrChildTable.data-card`), wyniki spożycia (`#intakeResults table.intake-results-table`), zestawienia kalorii posiłków (`.total-card` > `.kcal-table`).
- Każda tabela `<table>` bez dodatkowej klasy dostaje wygląd bazowy (nagłówek teal, paski, hover).
- Szerokie tabele (co najmniej 520 px) — w `.table-scroll`.

Nie używaj do porównania pomiarów bez obramowań (`SummaryGrid` / `.porownanie-tabela`) ani do pojedynczego wyniku (`ResultPanel`).

## Co dostarcza konsument

- `<table>` z `<thead><tr><th>` i `<tbody><tr><td>`; wyrównanie komórki: `.text-center`, `.text-right`.
- Opakowanie `.data-card` (`<div>`), gdy tabela jest kartą wyniku; `.table-scroll` (`<div>`), gdy tabela ma być przewijana w poziomie (`min-width:520px`).
- Karta sum: `<div class="total-card">` z `<h2>` i `<table class="kcal-table">` (opcjonalnie `kcal-table--macro`).
- Tabela spożycia: `<div id="intakeResults"><div class="intake-results-table-wrap"><table class="intake-results-table">` — trzy kolumny 25 % / 37,5 % / 37,5 %; w komórkach `.intake-period-main` i `.intake-period-sub`. Reguły są po `id` `#intakeResults`, więc opakowanie musi je nosić.
- Wymagane `id` w podglądzie: `#whrChildTable` (jak w aplikacji; reguły są po klasie `.data-card`).

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `table` | 100 %, `border-collapse:collapse`, odstęp górny .6rem |
| `th, td` | ramka 1 px #ddd, .95rem; dwie definicje w kaskadzie — obowiązuje późniejsza: wypełnienie .6rem .75rem, tekst do lewej (pierwsza: .6rem, do środka) |
| `thead th` | tło `--primary` (#00838d), #fff, 600 (pierwsza definicja `th` daje `--secondary`; nadpisana) |
| `tbody tr:nth-child(odd)` | tło `--card` (#f5f9f9) |
| `tbody tr:hover` | tło #00b0a614 |
| `.table-scroll` | `overflow-x:auto`, `overscroll-behavior-x:contain`; `> table` `min-width:520px` |
| `.data-card` | tło `--card`, ramka 2 px `--primary`, promień `--radius` (12 px), cień `--shadow`, wypełnienie 1.25rem 1rem, `overflow:auto`; `thead` tło `--primary` #fff; `th, td` .4rem .6rem do środka; `tr:nth-child(2n)` #00000008 |
| `.total-card` | wypełnienie `--pad` (1rem), tło `--card-bg` (#fff), ramka 1 px `var(--card-border, #e2e8ea)` — `--card-border` nie jest tokenem, obowiązuje fallback #e2e8ea; promień `--radius` (12 px; fallback 6px w źródle), marginesy 1rem; `h2` wyśrodkowany |
| `.kcal-table` | `th, td` 4px 6px; `th` do lewej, tekst #f9fafa; ostatnia kolumna do prawej; `--macro td` do góry |
| `#intakeResults table.intake-results-table` | `border-collapse:separate`, `table-layout:fixed`, komórki .55rem .65rem do lewej z zawijaniem; `th` tło `--secondary` (#00b0a6) .92rem 600; parzyste wiersze #00000008; `.intake-period-main` 700 `--primary`, `.intake-period-sub` .88rem #6b7a7a |

Responsywnie (`max-width:600px`): `th, td` wypełnienie .5rem. Na szkle `.data-card` przechodzi na recepturę kart (tło `--lg-surface-light`, ramka 1 px `--lg-border`, promień `--lg-radius` 18 px, cień `--lg-shadow`, rozmycie 14 px) — w trybie jasnym traci teal ramkę; sama tabela nie ma nadpisań szkła.

## Tokeny

`--primary`, `--secondary`, `--card`, `--card-bg`, `--radius`, `--shadow`, `--pad` (`--card-border` w `.total-card` nie istnieje w tokenach — działa fallback #e2e8ea); na szkle `--lg-surface-light`, `--lg-border`, `--lg-shadow`, `--lg-radius`; w wysokim kontraście `--hc-surface`, `--hc-border`, `--hc-card-border-width`, `--hc-shadow`, `--hc-blur`.

## Zasady

- Rób: zawsze `<thead>` z nagłówkami kolumn; liczby z przecinkiem dziesiętnym, jednostka w nagłówku lub w komórce.
- Rób: szeroką tabelę wkładaj w `.table-scroll`, nie zmniejszaj czcionki poniżej .95rem.
- Nie rób: nie koloruj wierszy znaczeniem klinicznym w tabeli — do statusów służy słownik `SummaryGrid` (`.status-*`, `.pt-pill`).
- Nie rób: nie ustawiaj `border-collapse:separate` poza tabelą spożycia (reguła po `#intakeResults`).
- Kontrast (zmierzony): biały tekst na `--primary` #00838d 4.53:1 (AA spełnione); #f9fafa na #00838d w nagłówku `.kcal-table` 4.34:1 — tuż poniżej AA 4.5:1, wartość ze źródła; biały na `--secondary` #00b0a6 2.71:1 — nagłówek tabeli spożycia jest poniżej AA, nie powielaj go dla nowych tabel. Tekst #333 na pasku `--card` #f5f9f9 11.9:1.
- Wysoki kontrast: `.data-card` — tło `--hc-surface`, ramka `--hc-card-border-width` `--hc-border`, cień `--hc-shadow`, rozmycie `--hc-blur`; tabela, `.total-card` i `.table-scroll` bez własnych reguł. Ciemne tło: bez reguł własnych.

Wersja statyczna, przepisana ręcznie z src/css/style.css (134-145, 603-616, 622-632, 711-728, 1543-1566, 2334-2371, 4745-4746, 5157-5162), src/css/ios26-v2.css (74-80).
