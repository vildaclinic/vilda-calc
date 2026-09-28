# SummaryGrid

Zestawienie etykieta–wartość dla podsumowań pacjenta: szare etykiety .95rem po lewej, teal liczby 1.35rem wyrównane do prawej, kropkowane lub cienkie separatory (#d0dede, #e3ecee) bez obramowań komórek; różnice względem poprzedniego pomiaru używają wspólnego słownika statusów (teal — w normie, pomarańcz — warto obserwować, czerwień — poza normą).

## Kiedy używać

- Podsumowanie bieżącego pomiaru na karcie pacjenta (`.summary-grid` z `.label` / `.val`) i sekcja różnic (`.diff-section`, `.diff-row`, `.diff-verdict`).
- Karta „Porównanie z poprzednim pomiarem” (`#prevSummaryCard.porownanie-karta`): rząd chipów `.porownanie-chipy` (data poprzedniego pomiaru, wiek, odstęp, źródło), tabela `.porownanie-tabela` z kolumnami Parametr / Poprzednio / Dziś / Zmiana, zdanie tempa `.porownanie-tempo`, nota `.porownanie-nota`, blok „pozostałe” `.porownanie-pozostale`.
- Wiersze z kropkowanym wypełnieniem (`.current-summary-row`) w podsumowaniu do wydruku.

Nie używaj do surowych tabel danych z nagłówkiem teal (`DataTable`) ani do pojedynczego wyniku (`ResultPanel`).

## Co dostarcza konsument

- `.summary-grid` — `<div>` siatka `1fr auto`; pary `<span class="label">` + `<span class="val"><span class="result-val">…</span></span>`; wartość wyciszona: `<span class="muted">`.
- `.diff-section` (zajmuje obie kolumny) > `.diff-row` (`.label` + `.val`) i `.diff-verdict` z klasą statusu; `.result-val` w różnicy przyjmuje `status-ok` / `status-improve` / `status-alert`.
- `<hr class="prev-summary-separator">`, `<div class="prev-summary-label">` nad blokiem poprzedniego pomiaru.
- `.current-summary-row` — `<span class="current-summary-param">` + `<span class="current-summary-dots"></span>` + `<span class="current-summary-value">`.
- `<table class="porownanie-tabela">` — `thead th` (druga kolumna `th.pt-kol-poprzednio`), wiersze `<tr data-klucz="…">`: `td` etykiety, `td.pt-kol-poprzednio`, `td.pt-dzis`, `td.pt-zmiana`; w komórkach `.pt-w` (wartość, jednostka w `<small>`), `.pt-s` (podpis), `.pt-s.pt-byl` (widoczne tylko poniżej 560 px), `.pt-d` (różnica), `.pt-pill` (werdykt), `.pt-brak` („—”). Statusy jako dodatkowe klasy na `.pt-w`, `.pt-d`, `.pt-pill`.
- `.porownanie-tempo` z opcjonalnym `status-improve` / `status-alert`; `.porownanie-nota` z opcjonalnym `porownanie-nota--plec`.
- `<div class="porownanie-chipy">` nad tabelą ze `<span class="porownanie-chip">` (teal — „Poprzedni pomiar: …”), `porownanie-chip--szara` (wiek, odstęp `#porownanieOdstep`, źródło) i `porownanie-chip--kontekst` (`#porownanieKontekst`, niebieski); atrybut `hidden` ukrywa chip.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.summary-grid` | siatka `1fr auto`, odstępy .35rem .5rem; `.label` `--text` (#333) .95rem; `.val` do prawej, `.result-val` 1.35rem; `.muted` #6b7a7a .92rem |
| `.prev-summary-separator` / `.prev-summary-label` | linia 2 px #d0dede o szerokości 90 % / wyśrodkowany tytuł .95rem 600 |
| `.status-ok` / `.status-improve` / `.status-alert` | `--secondary` (#00b0a6) / #c75d00 / `--danger` (#c62828) |
| `.diff-row` | siatka `1fr auto` wyrównana do linii bazowej; `.diff-verdict` .88rem #4b5b5b do prawej, z klasą statusu w kolorze statusu |
| `.current-summary-row` | flex .95rem; `.current-summary-param` 600; `.current-summary-dots` linia kropkowana rgba(0,0,0,.3); `.current-summary-value` bez zawijania |
| `.porownanie-chip` | pigułka .8rem 600, promień 999px, tło #e6f4f5, tekst #0a6b73, ramka 1 px #cfe2e5; `--szara` przezroczysta, #6b7a7a, ramka #e3ecee; `--kontekst` tło #eef3ff, #2f4b8a, ramka #d5def5; `[hidden]` ukryty |
| `.porownanie-tabela` | 100 %, `table-layout:fixed`, `tabular-nums`; `th` .72rem wielkie litery, odstęp liter .06em, #6b7a7a, do prawej, linia 1 px #e3ecee; `td` .55rem .4rem, linia 1 px #e3ecee, do prawej; pierwsza kolumna 22 %, do lewej, 600; brak pasków i tła hover |
| `.pt-w` | 1.12rem 700 `--primary`, `small` .72em 600; `status-improve` #c75d00, `status-alert` `--danger` |
| `.pt-s` | .78rem #6b7a7a; `.pt-brak` #9fb0b3 |
| `.pt-d` | 1.05rem 700 `--text`; ze statusem `--secondary` / #c75d00 / `--danger` |
| `.pt-pill` | pigułka .74rem 600, promień 999px, tło #eef2f3, tekst #4b5b5b; `status-ok` #e7f5ec/#1f8a4c, `status-improve` #fff1e3/#c75d00, `status-alert` #fdecec/#c62828 |
| `.porownanie-tempo` | tło #e6f4f5, ramka 1 px #cfe2e5, promień 12px, .9rem; `status-improve` #fff1e3/#f3d2a8; `status-alert` #fdecec/#f2b8b8 |
| `.porownanie-nota` | .9rem #6b7a7a, lewy pasek 3 px #cfe2e5; `--plec` #b45309, pasek #f3d2a8, 600 |
| `.porownanie-pozostale` | górna linia 1 px #e3ecee, `h4` .95rem `--text` |

Responsywnie (`max-width:559px`): kolumna „Poprzednio” znika, pojawia się `.pt-byl` („było …”), pierwsza kolumna 29 %, `.pt-w` 1rem, `.pt-s` .74rem, `.pt-pill` .7rem. Rodzina nie ma własnych nadpisań szkła ani wysokiego kontrastu; w wysokim kontraście działa jedynie globalna reguła `small` (jednostki w `.pt-w small` przechodzą na `--hc-muted`, np. #29474f na poziomie 2, z kryciem 1).

## Tokeny

`--text`, `--primary`, `--secondary`, `--danger`.

## Zasady

- Rób: liczby z przecinkiem dziesiętnym i jednostką w `<small>`; centyl jako podpis `.pt-s` („48. centyl”).
- Rób: status zawsze z tekstem — pigułka `.pt-pill` lub zdanie `.diff-verdict` / `.porownanie-tempo`; sam kolor liczby nie wystarcza.
- Nie rób: nie dodawaj obramowań komórek ani pasków do `.porownanie-tabela` (reguła celowo zeruje globalne paski i hover tabel).
- Nie rób: nie używaj `.status-*` poza słownikiem ok / improve / alert; nie wymyślaj czwartego odcienia.
- Kontrast (zmierzony): #6b7a7a na bieli 4.48:1 i #4b5b5b 7.13:1; pigułki są poniżej AA 4.5:1 dla małego tekstu — #1f8a4c na #e7f5ec 3.89:1, #c75d00 na #fff1e3 3.79:1 (#c62828 na #fdecec 4.92:1); #c75d00 na bieli 4.20:1; `--secondary` #00b0a6 na bieli 2.71:1; #9fb0b3 (`.pt-brak`) 2.25:1; #0a6b73 na #e6f4f5 5.54:1. Wartości pochodzą ze źródła — dlatego status zawsze ma tekst, a wartości `.status-ok` w `.pt-d` są pogrubione i mają towarzyszącą pigułkę.
- Wysoki kontrast i szkło: rodzina nie ma własnych nadpisań; dziedziczy tło karty, w której leży (`#prevSummaryCard.card`), i pozostaje płaska. W wysokim kontraście jednostki w `.pt-w small` przyjmują `--hc-muted` z globalnej reguły `small` — nie nadpisuj tego lokalnie.

Wersja statyczna, przepisana ręcznie z src/css/style.css (365-381, 2601-2659, 2674-2701, 2702-2854).
