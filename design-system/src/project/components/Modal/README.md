# Modal

Okno modalne na przyciemnionym tle: panel `#thyTermModal` z nagłówkiem, przewijaną treścią i stopką przycisków oraz okno przypomnienia Terminarza z wierszem akcji `.vild-rem-dlg-acts`.

## Kiedy używać

Do treści, która musi przerwać pracę na karcie: definicje pojęć w module raka tarczycy u dzieci (Bethesda, EU‑TIRADS, TNM, R, DxWBS — otwierane przyciskiem przypisu, wypełniane przez `thyroid_cancer_kids.js`) oraz szczegóły przypomnienia z Terminarza (kategoria, pacjent, termin, lek, dawka) z akcjami „Otwórz kartę pacjenta”, „Zrobione”, „Przełóż…”, „Nie zgłosił się”, „Zamknij” (`vilda_auth_ui.js`). Krótkie potwierdzenia i pytania tak/nie należą do AuthSheet, a komunikaty po akcji do Toast.

## Co dostarcza konsument

- Okno pojęć: `<div id="thyTermModal" class="thy-modal">` bezpośrednio w `<body>` (żeby `position:fixed` liczyło się od okna, nie od karty z `backdrop-filter`), w środku `.thy-modal-inner[role="dialog"][aria-modal="true"][aria-labelledby]` z `.thy-modal-header` (`<h3>` + `<button class="thy-modal-close" aria-label="Zamknij okno">×</button>`), `.thy-modal-body` (akapity i listy) i `.thy-modal-footer` ze zwykłymi `<button>` („Informacje dodatkowe”, „Zamknij”).
- Otwarcie: klasa `is-open` na `#thyTermModal` (inaczej `display:none`) i `thy-modal-open` na `<body>` (blokuje przewijanie strony). Zamknięcie zdejmuje obie klasy; `aria-hidden` przełącza skrypt.
- Reguły są przypięte do `id="thyTermModal"` — bez tego `id` panel nie ma stylu. Identyfikator w podglądzie jest taki sam jak w aplikacji.
- Okno przypomnienia: `.vild-rem-dlg-ov` (scrim) > `.vild-rem-dlg[role="dialog"]` > `.vild-rem-dlg-head` (`.vild-rem-dlg-cat` z kolorem i tłem kategorii ze stylu inline, `.vild-rem-dlg-x`), `.vild-rem-dlg-body` (`.vild-rem-dlg-nm`, `.vild-rem-dlg-ttl`, `.vild-rem-dlg-txt`, wiersze `.vild-rem-dlg-row` z `<b>etykieta</b><span>wartość</span>`), `.vild-rem-dlg-acts` z przyciskami `vilda-auth-btn vilda-auth-btn-small` i modyfikatorem `vild-rem-dlg-pri` | `vild-rem-dlg-destr` | `vild-rem-dlg-ghost`. Otwarcie dodaje `nav-ui-temporarily-hidden` na `<body>` (chowa dock i przycisk „do góry”).
- W podglądzie oba okna stoją w przepływie dokumentu (nadpisanie tylko `position`); w aplikacji są `position:fixed; inset:0`.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `#thyTermModal` | `position:fixed; inset:0; display:none`, flex od góry i wyśrodkowany w poziomie, tło `#0009`, `z-index:9999`, odstęp `clamp(.75rem, 6vh, 3rem)` u góry i `1rem` u dołu (plus `env(safe-area-inset-*)`) — zmienne lokalne `--thy-modal-top`/`--thy-modal-bottom` |
| `#thyTermModal.is-open` | `display:flex` |
| `body.thy-modal-open` | `overflow:hidden` |
| `.thy-modal-inner` | `width:min(980px,100%)`, `max-height:min(100dvh − odstępy, 760px)`, tło `var(--card)` (`#f5f9f9`), tekst `var(--text)`, promień `var(--radius)` (12px), cień `0 6px 26px #00000040`, obrys `1px solid rgba(0,0,0,.12)`, `overflow:hidden`, kolumna flex |
| `.thy-modal-header` | flex, `gap:.8rem`, `padding:.9rem 1rem`, dolna linia `rgba(0,0,0,.12)`, tło `#00000005`; `h3` `1.15rem` w `var(--primary)` |
| `.thy-modal-close` | `1.6rem/1`, `padding:.15rem .35rem`, promień `.6rem`, przezroczysty bez obrysu, cienia i rozmycia (`!important`, żeby wygrać ze szkłem); `:hover` tło `#0000000f` |
| `.thy-modal-body` | `padding:.9rem 1rem`, `overflow:auto`, `line-height:1.45`, tekst do lewej; `p` margines `0 0 .65rem`, `ul` `.35rem 0 .8rem 1.2rem` |
| `.thy-modal-footer` | flex do prawej z zawijaniem, `gap:.6rem`, `padding:.9rem 1rem`, górna linia `rgba(0,0,0,.12)`, tło `#00000005`; `button{width:auto}` — wygląd przycisku globalnego: tło `var(--primary)`, biały tekst, `padding:.55rem 1.1rem`, promień `var(--radius)`; `:hover` `var(--secondary)` + `var(--shadow)` i uniesienie `translateY(-1px) scale(1.02)` z `var(--shadow-l)`; `:disabled` `opacity:.45` |
| `.vild-rem-dlg-ov` | `position:fixed; inset:0`, tło `#0f2b3357`, wyśrodkowanie, `padding:16px`, `z-index:1000001` |
| `.vild-rem-dlg` | biel, tekst `#0f2b33`, promień 16px, `max-width:460px`, cień `0 18px 50px #00283047`, `overflow:auto` |
| `.vild-rem-dlg-cat` | pigułka `.7rem/800` wersalikami, `letter-spacing:.04em`, `padding:3px 10px`; kolory kategorii ze skryptu: Pomiar `#0F6E56`/`#E1F5EE`, Notatka `#854F0B`/`#FAEEDA`, Obserwacja `#185FA5`/`#E6F1FB`, Wynik `#534AB7`/`#EEEDFE`, Lek `#A32D2D`/`#FCEBEB`, Terapia GH `#0F6E56`/`#E1F5EE` |
| `.vild-rem-dlg-x` | `20px/1` w `#9aa8aa`, bez tła, obrysu i cienia (`!important`) |
| `.vild-rem-dlg-nm` / `-ttl` / `-txt` / `-row` | `1.02rem/700` · `.95rem/600` · `.88rem` w `#2f4448` · wiersz `.84rem` w `#5b6672` z etykietą `<b>` `600`, `min-width:64px` |
| `.vild-rem-dlg-acts button` | `.82rem/600`, obrys `1px solid #d7e9ec`, biel, tekst `#0f2b33`, promień 9px, `padding:8px 11px` (wszystko `!important`); `:hover` `#f5fafb` |
| `.vild-rem-dlg-pri` | tło i obrys `#00838d`, biały tekst; `:hover` `#006f78` |
| `.vild-rem-dlg-destr` | tekst `#c2271d`, obrys `#f3c9c5` |
| `.vild-rem-dlg-ghost` | obrys przezroczysty, tekst `#5b6672` |
| `body.nav-ui-temporarily-hidden` | chowa `#mobileBottomDock` i `#scrollTopBtn` |

## Tokeny

- `--card`, `--text`, `--radius`, `--primary` (panel i nagłówek)
- `--secondary`, `--shadow`, `--shadow-l`, `--anim-fast` (przyciski stopki)
- `--lg-border` (obrys przycisków w motywie szkła), `--hc-focus-width`, `--hc-focus-color` (fokus w wysokim kontraście)
- zmienne lokalne `--thy-modal-top`, `--thy-modal-bottom` (definiowane na `#thyTermModal`, nie w `tokens.css`)
- okno przypomnienia ma kolory wpisane na stałe: `#0f2b3357`, `#0f2b33`, `#eef2f3`, `#d7e9ec`, `#00838d`, `#006f78`, `#c2271d`, `#f3c9c5`, `#5b6672`, `#9aa8aa`

## Zasady

- Rób: jeden tytuł w `<h3>` i przycisk zamknięcia z `aria-label="Zamknij okno"`; `role="dialog"` z `aria-modal="true"` i `aria-labelledby` na panelu, nie na scrimie.
- Rób: akcję główną stawiaj jako ostatnią po prawej w stopce („Informacje dodatkowe” → „Zamknij”); w oknie przypomnienia akcja otwierająca kartę dostaje `vild-rem-dlg-pri`, akcja destrukcyjna („Nie zgłosił się”) `vild-rem-dlg-destr`, a zamknięcie `vild-rem-dlg-ghost`; skrypt dokleja ikonę z tabeli akcji (👤, ✓, 📅, ✕) przed etykietą.
- Rób: trzymaj panel w `<body>` i przełączaj `thy-modal-open`, żeby strona pod spodem nie przewijała się; treść przewija się wewnątrz `.thy-modal-body`.
- Nie rób: nie kopiuj selektorów z `#thyTermModal` na inne okna z nowym `id` — dla nowych potwierdzeń użyj AuthSheet, który ma reguły klasowe i wysoki kontrast.
- Nie rób: nie oznaczaj stanu samym kolorem pigułki kategorii — etykieta („Lek”, „Wynik”) niesie znaczenie.
- Kontrast: tekst `#333` na `#f5f9f9` (11,9:1); tytuł `#00838d` na pasku nagłówka ma zmierzone 4,09:1 (poniżej 4,5:1 — wartość źródłowa, pogrubiony `1.15rem`), a znak zamknięcia `#9aa8aa` na bieli w oknie przypomnienia 2,45:1 (wartość źródłowa; przycisk ma `aria-label="Zamknij"`, a to samo zamknięcie daje przycisk „Zamknij” w wierszu akcji); scrim `#0009`/`#0f2b3357` oddziela panel od strony.
- Szkło: `.liquid-ios26 button` zamienia przyciski stopki w białe pigułki 20 % (`#fff3`, tekst `#111`, promień 14px, `blur(10px)`) — tak wygląda stopka w aplikacji; przycisk zamknięcia i przyciski `.vild-rem-dlg-acts` bronią się `!important`. Panel nie ma własnych reguł szkła ani wysokiego kontrastu; w wysokim kontraście zmienia się tylko obwódka fokusu przycisków.

Wersja statyczna, przepisana ręcznie z src/css/style.css (linie 3512–3541, 3604–3653, 569–583, 630–636, 659–663, 7328–7465), src/css/ios26-v2.css (85–99, 191–192), docpro.html (znacznik 4267–4279) i vilda_auth_ui.js (znacznik okna przypomnienia, etykiety akcji i kategorii).
