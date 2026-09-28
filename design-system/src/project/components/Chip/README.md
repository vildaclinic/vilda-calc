# Chip

Małe pigułki statusu i kontekstu z kart klinicznych (promień 999px, tekst .72–.92rem o wadze 600–800): domyślnie jasny turkusowy tint z ciemnoturkusowym tekstem i cienką obwódką w tym samym odcieniu, a warianty semantyczne w kolorach palety klinicznej (pomarańcz `#c75d00`, czerwień `#c62828`, fiolet `#9900ff`/`#6f2dbd`, zieleń `#1f8a4c`) jako wypełnienie 10–15% z nasyconym tekstem; kwadratowe odznaki z promieniem 6px trzymają wartości liczbowe.

## Kiedy używać

Do nieinteraktywnego oznaczenia stanu, trybu lub kontekstu obok wyniku: źródło i data poprzedniego pomiaru (`.porownanie-chip`), status trendu w tabeli porównania (`.pt-pill`), tryb liczenia energii (`.energy-mode-badge`), wiarygodność metody i profil wzrastania (`.adv-growth-*`), ocena parametrów dorosłych (`.adult-vitals-summary-badge`), typ normy mikroskładnika (`.nutrition-micros-badge`), rekomendacja wariantu diety (`.diet-*-badge`), oznaczenie PRO (`.circ-pro-pill`) i nowości (`.vild-rem-chip`). Wartości liczbowe z jednostką (WHR, dawki mg/kg/d) idą do kwadratowej `.whr-badge` lub `#intakeCard .badge`. Chip nie jest przyciskiem ani filtrem; do przełączania użyj SegmentedControl, do pigułek stron edukacyjnych EduChip/MetaPill, do paska bocznego MiniSummaryChip.

## Co dostarcza konsument

- Pojedynczy `<span>` z klasą bazową i opcjonalnym modyfikatorem; tekst w środku. Grupę `.porownanie-chip` opakowuje `<div class="porownanie-chipy">` (flex, `gap:.35rem`, `margin:.55rem 0 .15rem`); chip ukrywa się atrybutem `hidden`.
- Odznaki trybu energii stoją w `<div class="energy-mode-badge-row">` (flex, `gap:.45rem`, `flex-wrap`); modyfikator `--inline` daje `margin-top:.45rem`, `--results` `margin:0 0 .55rem` z wyrównaniem do lewej.
- `.pt-pill` jest blokiem `inline-block` z `margin-top:.25rem` — stoi pod wartością w komórce tabeli porównania, nie obok niej.
- `.whr-badge` przyjmuje `<small>` (opacity .85, `margin-left:.25rem`) na dopisek w nawiasie. `#intakeCard .badge` wymaga przodka o `id="intakeCard"`.
- Odznaki diety mają skórkę modułu: wewnątrz `#dietRecommendationsContent` kolory przechodzą na tokeny `--diet-ui-*` (z `!important`); `.nutrition-micros-badge` wewnątrz `.nutrition-micros-card` bierze `--nutrition-ui-chip-bg` i `--nutrition-ui-accent-text`. Poza tymi kontenerami obowiązują literały poniżej.
- Skrypty ustawiają modyfikatory z danych: `is-${poziom}` na `.adv-growth-*`, `tone-${tone}` na `.adult-vitals-summary-badge` (tekst „Informacyjnie” gdy brak etykiety), `status-ok|improve|alert` na `.pt-pill`.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.porownanie-chip` | `inline-flex`, .8rem/600, `padding:.15rem .6rem`, tło `#e6f4f5`, tekst `#0a6b73`, obrys `#cfe2e5`, `nowrap`. |
| `.porownanie-chip--szara` | Tło przezroczyste, tekst `#6b7a7a`, obrys `#e3ecee`. |
| `.porownanie-chip--kontekst` | Tło `#eef3ff`, tekst `#2f4b8a`, obrys `#d5def5`. |
| `.pt-pill` | `inline-block`, .74rem/600, `padding:.12rem .5rem`, `line-height:1.3`, tło `#eef2f3`, tekst `#4b5b5b`; ≤559px .7rem. |
| `.pt-pill.status-ok` / `.status-improve` / `.status-alert` | `#e7f5ec`/`#1f8a4c`; `#fff1e3`/`#c75d00`; `#fdecec`/`#c62828`. |
| `.energy-mode-badge` | .82rem/700, `line-height:1`, `padding:.28rem .62rem`, obrys `rgba(191,87,0,.28)`, tło `#ff914d1f`, tekst `#9c4300`. |
| `.energy-mode-badge--clinical` | Obrys `#bf570052`, tło `#ff914d24`. |
| `.whr-badge`, `#intakeCard .badge` | `inline-block`, biel, obrys `1px solid #d0dede`, promień 6px, `padding:.35rem .55rem` (intake: `.35rem .6rem`), 1rem. |
| `.adv-growth-reliability-badge` | `min-width:8.75rem`, `padding:.38rem .78rem`, .92rem/700, obrys `rgba(0,131,141,.18)`, tło `#eef7f7`, tekst `#0a5157`. |
| `.is-high` / `.is-moderate` | `#00838d1f` obrys `#00838d42`; `#00838d14` obrys `#00838d33`; tekst `#0a5157`. |
| `.is-lowered` / `.is-low` / `.is-indicative` | `#c75d001f`/`#8a4b00`; `#c628281a`/`danger`; `#5a6f701a`/`#445758`. |
| `.adv-growth-profile-badge`, `.adv-growth-model-chip` | Ta sama geometria; `.is-standard`/`.is-comparison` `#eef7f7`; `.is-possible` `#00838d1a`; `.is-preferred` `#00838d1f`; `.is-probable`/`.is-specialist` `#6f2dbd1a` z tekstem `#6f2dbd`; `.is-out-of-scope` `#c628281a`/`danger`; `.is-warning` `#c75d001f`/`#8a4b00`; `.is-unavailable` `#5a6f701a`/`#445758`. ≤700px `width:100%`. |
| `.adult-vitals-summary-badge` | `min-height:30px`, `padding:.35rem .7rem`, .78rem/800, tło `#00838d1f`, tekst `primary`; `.tone-warn` `#c75d001f`/`#a94f00`; `.tone-danger` `#c628281f`/`danger`; ≤700px `align-self:flex-start`. |
| `.nutrition-micros-badge` | `min-width:2.9rem`, `padding:.18rem .55rem`, .76rem/700, tło `#0b72851a`, tekst `#0b7285`. |
| `.diet-personalized-badge` | Biel, obrys `#d6c3ea`, tekst `#5b3a78`, .75rem/700; `--active` obrys `#90f`, tekst `#5a008f`, tło `#9900ff14`. |
| `.diet-recommended-badge` | Tło `#90f`, biały tekst .74rem/800, `letter-spacing:.02em`, `margin-bottom:.45rem`. |
| `.vild-rem-chip` | Tło `primary`, biały tekst .72rem/800, `padding:2px 9px`. |
| `.circ-pro-pill` | `inline-block`, tło `#6a1b9a`, biały .72rem/700, `letter-spacing:.04em`, `margin-left:.18rem`, `padding:.02rem .35rem`. |

Brak stanów `:hover` i `:focus` — chipy są statyczne. Szkło (`.liquid-ios26`), wysoki kontrast i ciemne tło nie mają reguł dla tych klas; kolory są literałami i nie zmieniają się w motywach (wyjątek: skórki `--diet-ui-*` i `--nutrition-ui-*` w swoich kontenerach przechodzą na `--hc-*`).

## Tokeny

`--primary`, `--danger`; w skórkach modułów `--diet-ui-button-bg`, `--diet-ui-muted-strong`, `--diet-ui-border`, `--diet-ui-surface`, `--diet-ui-accent`, `--diet-ui-active-border`, `--diet-ui-active-bg`, `--diet-ui-active-text`, `--nutrition-ui-accent-text`, `--nutrition-ui-chip-bg`. Pozostałe kolory to literały źródła.

## Zasady

- Rób: łącz kolor zawsze z tekstem mówiącym o stanie („w normie”, „Niska wiarygodność”) — chip nie ma ikony, a w wysokim kontraście tinty zostają pastelowe.
- Rób: jeden chip = jedna informacja; dłuższe wyjaśnienie daj w tekście obok, chipy nie łamią wierszy (`nowrap`).
- Rób: wartości liczbowe zapisuj polskim formatem (przecinek, `&thinsp;` przed jednostką) i wkładaj w `.whr-badge`, nie w pigułkę.
- Nie rób: nie mieszaj klas z różnych rodzin (np. `pt-pill` + `tone-warn`); modyfikatory działają tylko na swojej klasie bazowej.
- Nie rób: nie używaj `.diet-recommended-badge` ani `.circ-pro-pill` jako przycisku — nie mają stanów interakcji.
- Kontrast (zmierzony na białym tle strony): `#0a6b73` na `#e6f4f5` 5,5:1, `#0a5157` na `#00838d1f` 7,7:1, `#8a4b00` na `#c75d001f` 5,8:1, `#445758` na `#5a6f701a` 6,7:1, `#9c4300` w `.energy-mode-badge` 5,9:1, `#c62828` w `.status-alert` 4,9:1. Poniżej 4,5:1 w źródle i pozostawione bez zmian: `.pt-pill.status-ok` `#1f8a4c` na `#e7f5ec` 3,9:1, `.pt-pill.status-improve` `#c75d00` na `#fff1e3` 3,8:1, `.adult-vitals-summary-badge` bazowa `--primary` na `#00838d1f` 3,9:1 oraz `.porownanie-chip--szara` `#6b7a7a` 4,48:1 — nie stawiaj tych pigułek jako jedynego nośnika informacji.

Wersja statyczna, przepisana ręcznie z src/css/style.css (773-782, 789-806, 1150-1160, 2290-2295, 2531-2540, 2676-2701, 2771-2790, 2794-2810, 2967-2999, 3064-3121, 4170-4176, 5471-5489, 5584-5594, 6094-6110, 6596-6612, 6925-6936, 7065-7078, 7191-7192, 7210-7211)
