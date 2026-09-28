# Calendar

Terminarz kliniczny rysowany jako białe karty z włoskowatym obrysem 0.5 px #d7e9ec i promieniem 14 px: pasek górny z obrysowanymi przyciskami nawigacji (promień 10 px), tytułem miesiąca 1.5rem/700, szukajką, przełącznikiem widoku i gradientowym przyciskiem „Dodaj termin" 40 px; siatka miesiąca to 7 kolumn z liniami #c9dde0, wersalikowym nagłówkiem dni na #f2fafb i komórkami 184 px, w których leżą dysk numeru dnia 24 px i chipy kategorii .7rem z lewym paskiem 3 px; pod siatką panel dnia z wierszami wizyt.

## Kiedy używać

- Strona „Terminarz" (`terminarz.html`, `.terminarz-shell#terminarzRoot`); cały CSS wstrzykuje `vilda_terminarz.js` (`<style id="vildaTerminarzCss">`), nie ma go w żadnym pliku `.css`.
- Ten partial obejmuje widok miesiąca (pasek górny, siatka, komórki, chipy, kropki), panel dnia z wierszami kompaktowymi i paskowymi oraz stan zablokowany (`.terminarz-locked`). Widoki tygodnia, dnia (kolumny), oś czasu, lista oczekujących, statystyki, minikalendarz, modale i menu przełożenia nie są tu przepisane.

Nie używaj do przypomnień na stronie głównej (`ReminderCard`).

## Co dostarcza konsument

- `.terminarz-shell#terminarzRoot` (maks. 980 px; klasy `.tz-view-wide`/`.tz-view-day` rozszerzają do 1600 px).
- `.tz-topbar` = `.tz-nav` (`<button id="tzPrev" aria-label="Poprzedni miesiąc">‹</button>`, `#tzNext` „›", `#tzToday` „Dziś", `<span class="tz-title">Październik 2026</span>`) + `.tz-topbar__sp` + `<button class="tz-search-btn" aria-label="Szukaj w terminarzu">` (SVG lupy; `data-on="1"` gdy szukajka otwarta) + `.tz-print-btn` (SVG drukarki) + `<button class="tz-today-m">Dziś</button>` + `.tz-switch[role="tablist"]` z `<button data-view>` (Miesiąc, Tydzień, Dzień, Lista oczekujących, Statystyki; `.is-active`) + `<button class="tz-add-btn">` (SVG kalendarza z plusem + „Dodaj termin"). Od 701 px pasek jest siatką dwurzędową (nawigacja, lupa, drukarka, „Dodaj termin" w rzędzie 1; „Dziś" i przełącznik w rzędzie 2); `#tzToday` z nawigacji jest wtedy ukryty.
- `.tz-grid` = `.tz-grid__head` (7 × `<div>`; soboty i niedziele z `.is-wknd`) + `.tz-grid__body` z `.tz-cell[data-day]`: `<span class="tz-cell__num">`, opcjonalnie `<button class="tz-cell__add">+</button>` (widoczny po najechaniu), `<span class="tz-cell__holiday">`, `.tz-cell__chips` z `<span class="tz-chip tz-cat-…">` (`.tz-chip__mk.tz-chip__mk--v` „✓" lub `--x` „✕", `.tz-chip__nm`), stopka `.tz-cell__foot` = `.tz-cell__dots` (`<span class="tz-dot tz-cat-…">`) + `<span class="tz-chip--more">+N więcej</span>`.
- Kategorie jako klasy na chipie, kropce i wierszu: `tz-cat-followup`, `-treatment`, `-observation`, `-wynik`, `-uni`, `-duty`, `-clinic`, `-clinicnfz`, `-act`, `-procedura`, `-reservation`, `-absence`; ustawiają lokalne zmienne `--cat-c`, `--cat-bg`, `--cat-a`, z których korzystają wiersze, plakietki i lista „+N".
- `.tz-day-panel` = `<h2>` (tekst dnia + przyciski `+ Dodaj termin`, `Otwórz widok dnia →`) + wiersze `.tz-row.tz-row--c.tz-cat-…` (`.tz-time-pill` z godziną, `.tz-row__main` > `.tz-row__line` (`.tz-row__patient`, `.tz-row__title-in`) + `.tz-row__meta` z `.tz-mini`, `.tz-actions` z `.tz-done-btn` „✓ Wykonane", `.tz-noshow-btn`, `.tz-del-btn` „🗑" `aria-label="Usuń wpis"`) albo `.tz-empty`. Wariant `.tz-row--strip` to kolorowy pasek z lewym obrysem 4 px w `--cat-a`.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.tz-nav button` | obrys 0.5 px #d7e9ec, tło #fff, promień 10 px, wypełnienie 8px 14px, .95rem/600 #0f2b33; `:hover` #f2fafb |
| `.tz-title` | 1.3rem/700 #0f2b33 (1.5rem od 701 px), wielokropek |
| `.tz-search-btn` / `.tz-print-btn` | 40×40 px, obrys 1 px rgba(0,131,141,.18), promień 11 px, ikona 19 px #3f5a5c; `[data-on="1"]` i `.tz-print-btn:hover` tło #e6f5f6, obrys i ikona #00838d |
| `.tz-switch` | 40 px, obrys rgba(0,131,141,.18), promień 12 px, wypełnienie 3 px; przycisk .82rem/600 #5b6672, promień 9 px; `.is-active` gradient 135° #00838d → #00b0a6, tekst #fff, cień 0 2px 7px rgba(0,131,141,.28) |
| `.tz-add-btn` | 40 px, gradient 135° #00838d → #00b0a6, promień 12 px, .84rem/600 #fff, cień 0 3px 10px rgba(0,131,141,.28); `:hover` brightness(1.04); ukryty ≤700 px (zastępuje go `.tz-fab`) |
| `.tz-grid__head div` | .75rem/600 #5b6672 wersaliki na #f2fafb; `.is-wknd` tło #DEE7F1, tekst #0C447C |
| `.tz-cell` | 184 px (58 px ≤700 px), obrys #c9dde0 dół/prawo, wypełnienie 6 px; `:hover` #f7fcfd; `.is-other` #fafcfc i tekst #9aa8aa; `.is-wknd` #EDF2F8; `.is-duty` #FFEBEA; `.is-split` #e6f5f6 ze strzałką; `.is-absence` ukośne paski #eceff1/#dfe4e7; `.is-selected` #F5FBFB z obrysem wewnętrznym 2 px #00838d i promieniem 8 px |
| `.tz-cell__num` | 24 px, .82rem/600, promień 12 px; `.is-today` dysk #00838d z białym numerem; `.is-holiday` #b91c1c |
| `.tz-chip` | .7rem, wypełnienie 2px 6px, promień 6 px, lewy pasek 3 px; kolory: followup #0062E6/#E0EBFF/#073F94, treatment #1FB84C/#E2F7E8/#15722F, observation #0A93D8/#E1F2FB/#0B5C84, wynik #4744C9/#E9E9FB/#302D9C, uni #F08600/#FFEED2/#8A4E00, duty #F0291E/#FFE5E3/#A81C14, clinic #F0B800/#FFF3C7/#7A5C00, clinicnfz #9A36D0/#F0E2FA/#6C1F9E, act #76767C/#ECECEE/#46464B, procedura #1D9E75/#E1F5EE/#0F6E56, reservation kreskowany 1.5 px #1D9E75 na #E9F7F1 |
| `.tz-chip.is-done` / `.is-noshow` | szary #f0f3f4/#9aa8aa z przekreśleniem / #FFEBEA z tekstem i paskiem #C2271D |
| `.tz-chip__mk--v` / `--x` | koło 14 px #34C759 / #FF3B30 z białym znakiem 9 px |
| `.tz-dot` | 7 px, kolor akcentu kategorii; `.is-done` przezroczystość 0.4 |
| `.tz-chip--more` | .66rem/600 #5b6672; `:hover` #00838d podkreślony |
| `.tz-daymore` | pozycjonowany absolutnie w kolumnie tygodnia: #0F6E56, promień 6 px, .72rem/600 #fff |
| `.tz-day-panel` | karta 14 px, wypełnienie 14px 16px; `h2` 1.02rem; jego przyciski obrys #d7e9ec, promień 8 px, .76rem/600 #00838d |
| `.tz-row--c` | wiersz z `.tz-time-pill` (48 px, .74rem/700 #fff na #1F7A3D, promień 7 px; `.is-done-pill` #c6d4d6; `.is-all` tło `--cat-bg` .58rem), pacjent .88rem/600 w `--cat-c`, tytuł .82rem #5b6672, `.tz-mini` .66rem na `--cat-bg`; `.is-done` przekreślenie i 0.6; `.is-overdue` tło #FFF3E0; `.is-noshow` teksty #C2271D |
| `.tz-actions button` | obrys 0.5 px #d7e9ec, promień 8 px, .78rem; `.tz-done-btn` obrys i tekst #00838d/600; `.tz-noshow-btn` obrys i tekst #C2271D/600 (`!important`); `.tz-del-btn` #C2271D z obrysem #ecc8c8, `.is-armed` wypełniony #C2271D |
| `.terminarz-locked` | wyśrodkowany tekst #5b6672, ikona 2rem, tytuł 600 #0f2b33 |

Przy `pointer: coarse` wiersze paskowe chowają `.tz-actions` i stają się klikalne. Poniżej 700 px chipy w siatce znikają (zostają kropki), pasek górny staje się siatką trzyrzędową, a „Dodaj termin" — pełnej szerokości.

## Tokeny

Brak tokenów globalnych — moduł używa literałów i lokalnych zmiennych `--cat-c`, `--cat-bg`, `--cat-a` ustawianych przez klasę kategorii. Przez globalne reguły przycisków: `--primary`, `--secondary`, `--radius`, `--shadow`, `--lg-border`.

## Zasady

- Rób: nazwa kategorii zawsze w chipie lub plakietce (`.tz-mini`, `.tz-badge`) — sam kolor paska nie wystarcza; wykonane oznaczaj znakiem ✓, nieobecność ✕.
- Rób: „dziś" to dysk numeru, „wybrany" to wewnętrzny obrys teal; mogą wystąpić razem.
- Rób: utrzymuj `aria-label` na przyciskach nawigacji, lupie, drukarce i koszu oraz `role="tablist"` na przełączniku widoku.
- Nie rób: nie zmieniaj grubości włoskowatych obrysów (0.5 px) i wielkich liter w heksach — to wartości źródła.
- Nie rób: nie rozszerzaj tego partiala o widoki tygodnia/dnia bez przepisania ich reguł z `vilda_terminarz.js`.
- Kontrast: teksty chipów (#073F94, #15722F, #0B5C84, #302D9C, #8A4E00, #A81C14, #7A5C00, #6C1F9E, #46464B, #0F6E56) na pastelach mają ≥ 4.5:1 (zmierzone 5.37–8.84:1); #9aa8aa dni spoza miesiąca jest celowo wyciszony (2.45:1 na bieli). Biały tekst na gradiencie #00838d → #00b0a6 (`.tz-switch.is-active`, `.tz-add-btn`) ma 4.53:1 na końcu #00838d, ale tylko 2.71:1 na końcu #00b0a6 — wartość źródła, nie zmieniaj jej w partialu.
- Wysoki kontrast i ciemne tło: brak osobnych reguł. Szkło: w aplikacji `body` ma zawsze `liquid-ios26`, a skrypt terminarza celowo spłaszcza globalną szklaną pigułkę dla wszystkich swoich przycisków (`.liquid-ios26 .terminarz-shell …` z `!important`: tło #fff, obrys 0.5 px #d7e9ec, bez rozmycia i cienia), więc terminarz wygląda tak samo na każdym poziomie szkła.

Wersja statyczna, przepisana ręcznie z vilda_terminarz.js (CSS wstrzykiwany z JS, zmienna `Cn`; czytelna kopia src/js-css/terminarz.css: 1, 49-67, 107-110, 142-145, 252-258, 267-369, 375, 403-406, 423, 499-507, 519-520, 566-571, 681-686, 692-741, 745-753, 760-761, 770-779, 787-794, 846-849), src/css/ios26-v2.css (85-93, 187-190), src/css/style.css (569-601).
