# NoteItem

Kafelek notatki-szablonu w siatce `auto-fill minmax(280px, 1fr)`: biała karta o promieniu `--chrome-radius-card` (14 px), obrysie 1 px `--chrome-glass-border` i cieniu `--chrome-glass-shadow`, z małą wersalikową etykietą kategorii, okrągłym przyciskiem pinezki 32 px, tytułem 1rem/600, treścią .86rem uciętą do 4 linii i rzędem obrysowanych przycisków akcji; nad siatką stoi pasek z szukajką i pigułkami filtrów.

## Kiedy używać

- Moduł „Notatki" (`notatki.html`, `.notes-shell`) — uniwersalne szablony opisów badań, zaleceń i wywiadu, nie kartoteka pacjenta.
- Ten sam zestaw reguł jest skopiowany do `terminarz.html` (styl notatek w terminarzu).
- Edytor notatki to wysuwany z prawej panel (`.note-editor-overlay.is-open` > `.note-editor`), również objęty tym partialem.

Nie używaj do przypomnień (`ReminderCard`) ani do komunikatów (`Callout`: `.notes-pii`, `.notes-alert`).

## Co dostarcza konsument

- Powłoka `.notes-shell` (maks. 1080 px), nagłówek `.notes-head` (`.notes-head__titles` z `<h1>` i `.notes-head__sub`, przycisk `.notes-btn-primary` „Nowa notatka").
- Pasek `.notes-toolbar` = `.notes-search` (`<span class="notes-search__icon">🔍</span>` + `<input type="search" placeholder="Szukaj w notatkach…">`) + `.notes-filters` z `<button class="notes-filter" data-cat="…">` (Wszystkie, Opisy badań, Zalecenia, Wywiad, Własne); aktywny filtr ma `.is-active`.
- Siatka `.notes-grid` z kartami `.note-card` (`.is-pinned` dla przypiętych):
  - `.note-card__top` = `<span class="note-cat note-cat--badanie|--zalecenia|--wywiad|--wlasne">` + `<button class="note-pin" title="Przypnij" aria-label="Przypnij notatkę">` z SVG pinezki (`.is-on` + `title="Odepnij"` dla przypiętej);
  - `<p class="note-card__title">`, `<p class="note-card__body">` (zachowuje łamanie wierszy, ucięcie do 4 linii);
  - `.note-card__actions` z `<button class="note-act">`: `.note-act--copy` (ikona copy + „Kopiuj", po skopiowaniu `.is-done`), zwykły (ikona pencil + „Edytuj"), `.note-act--danger` (ikona trash-2, `title="Usuń"`). W aplikacji ikony to `<i data-lucide="…">` zamieniane na SVG.
- Stan pusty `.notes-empty` (`__icon`, `__title`, `__desc`, `__retry`).
- Edytor: `.note-editor-overlay` (fixed, `z-index` 2000010, rozmycie 3 px; widoczny po `.is-open`) > `.note-editor` (`__head` z `<h2>` i `<button class="note-editor__close">×</button>`, `__body` z polami `.note-field` (`<label>` + `input|select|textarea`), `__foot` z `.notes-btn-primary` i `.note-btn-ghost`, komunikat `.note-editor__err.is-shown`).

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.note-card` | flex-kolumna, odstęp .55rem, wypełnienie 1rem 1.05rem, promień `--chrome-radius-card` (14 px), tło `--card-bg`, obrys 1 px `--chrome-glass-border` (rgba(0,131,141,.14)), cień `--chrome-glass-shadow`; `:hover` uniesienie 2 px i cień 0 12px 30px rgba(0,81,88,.13) |
| `.note-card.is-pinned` | obrys rgba(0,131,141,.4) |
| `.note-cat` | .68rem/700 wersaliki, odstęp liter .03em, wypełnienie .2rem .55rem, promień 6 px |
| `.note-cat--badanie` | tło #e8f6f7, tekst #00838d |
| `.note-cat--zalecenia` | tło #fef0f4, tekst #c0395a |
| `.note-cat--wywiad` | tło #fff5e6, tekst #b8730e |
| `.note-cat--wlasne` | tło #f1eefc, tekst #6d4bc0 |
| `.note-pin` | koło 32 px bez tła, ikona 18 px #9aa8aa; `:hover` `--primary` i skala 1.08; `.is-on` tło rgba(0,131,141,0.16) (`!important`) i ikona `--primary` |
| `.note-card__title` / `.note-card__body` | 1rem/600 `--text` / .86rem `--text-2`, interlinia 1.5, `-webkit-line-clamp: 4` |
| `.note-act` | obrys 1 px `--chrome-glass-border`, tło `--card-bg`, tekst `--text-2`, wypełnienie .4rem .8rem, promień 9 px, .8rem/600; `:hover` obrys i tekst `--primary` |
| `.note-act--copy.is-done` | tło #f0fff4, tekst #148f3f, obrys rgba(20,143,63,.3) |
| `.note-act--danger:hover` | obrys i tekst #c0395a |
| `.notes-search input` | wypełnienie .65rem .9rem .65rem 2.3rem, obrys `--chrome-glass-border`, promień 12 px, .92rem; `:focus` obrys `--primary` i poświata 0 0 0 3px rgba(0,131,141,.12) |
| `.notes-filter` | pigułka 999 px, .82rem/600, obrys `--chrome-glass-border`, tekst `--text-2`; `:hover` `--primary`; `.is-active` gradient 135° `--primary` → `--secondary`, tekst #fff |
| `.notes-btn-primary` | pigułka 999 px, gradient 135° `--primary` → `--secondary`, .92rem/600 #fff, cień 0 6px 18px rgba(0,131,141,0.22); `:hover` uniesienie 1 px |
| `.note-btn-ghost` | pigułka obrysowana `--chrome-glass-border`; `:hover` #c0395a |
| `.note-editor` | szerokość min(520px, 100%), pełna wysokość, cień −10px 0 40px rgba(0,0,0,.18), animacja `noteSlideIn` .22s; nakładka `noteFadeIn` .18s |

Poniżej 600 px siatka ma jedną kolumnę, edytor pełną szerokość, a przyciski modułu dostają `width:auto!important` (neutralizacja globalnej reguły `button{width:100%}`); pinezka zostaje 32×32 px.

## Tokeny

`--primary`, `--secondary`, `--text`, `--text-2`, `--text-muted`, `--card-bg`, `--chrome-radius-card`, `--chrome-glass-border`, `--chrome-glass-shadow`; przez globalny wygląd przycisków i pól: `--lg-border`, `--radius`, `--shadow`.

## Zasady

- Rób: etykieta kategorii zawsze z tekstem (Badanie, Zalecenia, Wywiad, Własne) — kolor tylko ją wspiera.
- Rób: pinezka i kosz to przyciski ikonowe — utrzymuj `title` i `aria-label` („Przypnij notatkę" / „Odepnij notatkę", „Usuń").
- Rób: po skopiowaniu przełącz `.note-act--copy` w `.is-done` i zmień etykietę na „Skopiowano".
- Nie rób: nie wpisuj w notatki danych konkretnych pacjentów — to szablony (patrz `Callout` `.notes-pii`).
- Nie rób: nie ustawiaj kart na sztywną wysokość; treść ucina `line-clamp`, a karty wyrównują się w wierszu siatki.
- Kontrast: `--text-2` (#44535c) na bieli 7.96:1, #c0395a na #fef0f4 4.78:1, #6d4bc0 na #f1eefc 5.38:1. Poniżej 4.5:1 (wartości źródła — nie zmieniaj ich w partialu): `.note-cat--badanie` #00838d na #e8f6f7 4.09:1, `.note-cat--wywiad` #b8730e na #fff5e6 3.54:1, `.note-act--copy.is-done` #148f3f na #f0fff4 4.04:1, biały tekst `.notes-filter.is-active` i `.notes-btn-primary` na gradiencie `--primary` → `--secondary` (4.53:1 przy #00838d, 2.71:1 przy #00b0a6); #9aa8aa nieaktywnej pinezki (2.45:1) jest celowo wyciszony.
- Wysoki kontrast i ciemne tło: brak osobnych reguł — moduł opiera się na tokenach `chrome-*` i `--card-bg`. Szkło: `body` w aplikacji zawsze ma klasę `liquid-ios26`, więc globalna reguła `.liquid-ios26 button` (tło #fff3, obrys `--lg-border`, promień 14 px, cień 0 4px 12px, tekst #111, `!important`) nadaje filtrom, akcjom i pinezce wygląd szklanej pigułki; wygrywa z nią tylko `.note-pin.is-on` (tło z `!important` i wyższą swoistością). Pola tekstowe zachowują własny styl (późniejsza reguła o tej samej swoistości).

Wersja statyczna, przepisana ręcznie z src/html-styles/notatki.css (22-95, 205-540, 541-703, 705-740; identyczna kopia w src/html-styles/terminarz.css), src/css/ios26-v2.css (85-93, 187-190), src/css/style.css (60-66, 569-601).
