# UserChip

Chip konta w pasku górnym: 28 px okrągły awatar z inicjałami, etykieta „Konto” z nazwą użytkownika i 24 px okrągły przycisk wylogowania lub logowania.

## Kiedy używać

Wyłącznie w `.chrome-chips` paska górnego, jako ostatni element po chipie pacjenta. Pokazuje stan sesji konta (ładowanie, gość, zalogowany) i daje jedną akcję: „Wyloguj się” albo „Zaloguj się”. Nie używaj go w treści strony ani w szufladzie — szuflada ma własną sekcję konta.

## Co dostarcza konsument

- `<div class="chrome-chip chrome-user-chip is-loading|is-guest|is-logged-in" id="vildaUserChip" aria-live="polite">`.
- Dzieci: `span.chip-avatar#vildaUserAvatar[aria-hidden]` (inicjały z `J(label)` po zalogowaniu, „…” w trakcie ładowania, SVG Lucide `user` 16px u gościa), `span.chip-content` z `span.chip-label` „Konto” i `span.chip-value#vildaUserValue` (nazwa konta; „Niezalogowany” lub „Tryb gościa”; „…” przy ładowaniu), `button.chip-action#vildaUserAction` z `title`/`aria-label` „Wyloguj się” (SVG `log-out` 14px) albo „Zaloguj się” (SVG `log-in` 14px).
- Przed podmianą ikon przez Lucide przycisk zawiera `span.chrome-icon-fallback.chrome-icon-fallback--small` z glifem `&#x21AA;` — to stan początkowy z `vilda_chrome.js`.
- Po zalogowaniu skrypt dodaje do `.chip-value` `role="link"`, `tabindex="0"` i `title="Przejdź do ustawień konta"`.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.chrome-chip`, `.chip-avatar`, `.chip-content`, `.chip-label`, `.chip-value` | Jak w PatientChip: pigułka 999px bez tła, awatar 28px z gradientem `#e2f1f2→#cfe9ec` i tekstem `.78rem`/700 `.02em` w `primary`, etykieta .66rem wersalikami, wartość .86rem/600 z wielokropkiem przy 180px. |
| `.is-loading .chip-avatar` | Tekst „…” w `#9eb8bb`. |
| `.is-guest .chip-avatar` | Tło `#f3eaea`, glif `#b35c5c`. |
| `.is-guest .chip-action:hover` | Tło `#00838d1f`, ikona `primary`. |
| `.is-logged-in` | Tło `#fff`, obrys `1px solid #cfe4e4`, promień 9px; awatar na `chrome-active-bg` (gradient `135deg primary→secondary`) z białymi inicjałami; wartość `#0c3a3e`, `cursor:pointer`, hover podkreślenie z odsunięciem 2px, focus obrys `2px solid primary` z promieniem 3px; przycisk akcji `#5f8f91`. |
| `.chip-action` | 24×24, koło, przezroczyste, `chrome-label-color`, `margin-left:.15rem`; hover tło `#c628281f` i ikona `danger` #c62828; SVG 14px. |
| `≤600px` | `.chip-content` i `.chip-action` ukryte; chip `height:34px` bez obrysu i tła; awatar 34×34 z promieniem 8px na `chrome-active-bg`. |
| `.has-vilda-chrome .vilda-auth-logout` | Ukryty — przycisk wylogowania z `vilda_auth_ui` nie dubluje akcji chipa. |

Pod szkłem (`.liquid-ios26 .chrome-user-chip .chip-action`) przycisk jest przywrócony z `!important` do przezroczystego koła w `#5f8f91` bez obrysu, cienia i rozmycia (żeby globalne style przycisków szkła go nie zmieniły); hover `#c628281f`/`#c62828`. Wysoki kontrast i ciemne tło nie mają reguł dla tej rodziny.

## Tokeny

`--chrome-active-bg` (zmienna lokalna, nie token: `linear-gradient(135deg, var(--primary), var(--secondary))`), `--chrome-label-color`, `--primary`, `--secondary`, `--danger`, `--text`. Literały: `#cfe4e4`, `#0c3a3e`, `#5f8f91`, `#9eb8bb`, `#f3eaea`, `#b35c5c`.

## Zasady

- Rób: zmieniaj stan wyłącznie przez klasy `is-loading` → `is-guest` | `is-logged-in` i równocześnie podmieniaj `title`/`aria-label` przycisku („Wyloguj się” / „Zaloguj się”) oraz treść awatara.
- Rób: inicjały licz z etykiety konta (dwie litery), bo awatar ma stały rozmiar 28px i `.78rem` — dłuższy tekst się nie zmieści.
- Rób: trzymaj `aria-live="polite"` — zmiana stanu sesji jest ogłaszana czytnikom ekranu.
- Nie rób: nie usuwaj `button.chip-action` w stanie gościa — jest wtedy akcją logowania; na telefonie chowa go CSS.
- Nie rób: nie stylizuj `.chip-action` jak przycisku aplikacji — źródło celowo zeruje tło, obrys i cień, także pod szkłem.
- Kontrast (zmierzony): wartość `#0c3a3e` na bieli 12,4:1; etykieta `#5a7274` 5,1:1. Poniżej 4,5:1 zostają wartości źródła: przycisk akcji `#5f8f91` na bieli 3,6:1 (ikona 14px, na hover czerwień `#c62828`), glif gościa `#b35c5c` na `#f3eaea` 3,9:1 oraz białe inicjały na gradiencie `chrome-active-bg` — 4,5:1 przy `primary`, 2,7:1 przy `secondary` (awatar jest `aria-hidden`, nazwę konta niesie `.chip-value`).

Wersja statyczna, przepisana ręcznie z src/css/vilda_chrome.css (154-203, 407-455, 485-522, 1253-1263), vilda_chrome.js (funkcja Je, aktualizacja stanu konta)
