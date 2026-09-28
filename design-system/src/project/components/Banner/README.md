# Banner

Pasek systemowy aplikacji: pływająca biała karta aktualizacji service workera (`#sw-update-banner`), pełnoszerokościowy turkusowy pasek `#updateBanner` oraz osadzona w wynikach pigułka bramki PRO (`.vilda-pro-gate-banner`) w tonacji fioletowej (dokup PRO) lub turkusowej (zaloguj się).

## Kiedy używać

- `#sw-update-banner` — gdy service worker zainstalował nową wersję; buduje go `ios26-ui.js` (funkcja `zn`), z dwoma przyciskami `.btn`: „Aktualizuj" (z fioletową obwódką pulsującą `.ww-sw-refresh--pulse`) i „Później". Opcjonalna sekcja `<details class="ww-sw-update-banner__notes"><summary>Co nowego</summary><ul>…</ul></details>`.
- `#updateBanner` — reguła z `style.css` dla pełnoszerokościowego paska u góry; w repozytorium nie ma znacznika, który by jej używał (żywy baner to `#sw-update-banner`).
- `.vilda-pro-gate-banner--upgrade` — zalogowany użytkownik bez aktywnego PRO (`html.vilda-pro-inactive.vilda-logged-in`).
- `.vilda-pro-gate-banner--login` — użytkownik niezalogowany (`html.vilda-pro-inactive:not(.vilda-logged-in)`).

Baner zgody na analitykę to osobny komponent `CookieBanner`; komunikat kliniczny w karcie — `ObesityBanner`.

## Co dostarcza konsument

- `#sw-update-banner` (`role="alert" aria-live="polite" aria-atomic="true"`): `.ww-sw-update-banner__ico` (SVG 18 px) + `.ww-sw-update-banner__message` (`__title` ze `<strong>`, `__sub`, opcjonalne `__notes`) + `.ww-sw-update-banner__actions` z `<button id="sw-refresh" class="btn ww-sw-refresh--pulse" data-vilda-sw-update-action="refresh">` i `<button id="sw-dismiss" class="btn" style="opacity:.8" data-vilda-sw-update-action="dismiss">`. Skrypt ustawia pozycję i wygląd kontenera w `style.cssText` (w partialu przepisane jako reguła `#sw-update-banner`) i wstrzykuje resztę reguł w `<style id="ww-sw-update-banner-styles">`.
- `#updateBanner`: tekst + `<button>` + `<button class="dismiss">`; arkusz ukrywa go (`display:none`).
- `.vilda-pro-gate-banner`: `<span class="vilda-pro-gate-banner__text">` + `<a class="vilda-pro-gate-banner__btn">` lub `<button class="vilda-pro-gate-banner__btn">`; domyślnie `display:none`, widoczność sterują klasy na `<html>`.
- Wymagane `id`: `sw-update-banner`, `sw-refresh`, `sw-dismiss`, `updateBanner` — selektory z `id` zachowano w partialu i w podglądzie.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `#sw-update-banner` | fixed u góry na środku, szerokość min(540px, 100% − 1.5rem), tło #fff, promień .75rem, cień 0 10px 30px rgba(0,0,0,.15), wypełnienie 12px 14px, odstęp 12px, zawijanie z `row-gap` .65rem, z-index 2147483000 |
| `.ww-sw-update-banner__ico` | dysk 34 px, tło #E0EBFF, ikona #073F94 |
| `__title` / `__sub` / `__notes` | 14px #0f2b33 / 12.5px #5b6672 / 12.5px, `summary` #00838d waga 600 bez znacznika |
| `#sw-update-banner .btn` | .5rem .9rem, promień .5rem, tło `--secondary`, biały; drugi przycisk #e5e7eb / #111827 — na szkle oba stają się pigułkami `#fff3` z tekstem #111 (globalna reguła `.liquid-ios26 button`) |
| `#sw-refresh::after` | obwódka 1.5 px rgba(153,0,255,.72); `.ww-sw-refresh--pulse` animuje `wwHelpPulsePurple` (1.333333s, nieskończenie); wyłączana przy `prefers-reduced-motion` |
| `#updateBanner` | fixed u góry, tło `--primary`, biały wyśrodkowany tekst, cień 0 2px 6px #0003, wypełnienie z `env(safe-area-inset-top)` |
| `#updateBanner button` / `.dismiss` | tło `--secondary`, promień 6 px, .35rem .8rem; `.dismiss` przezroczysty z obrysem rgba(255,255,255,.85); `:disabled` krycie .75 — na szkle oba przyjmują wygląd pigułki |
| `.vilda-pro-gate-banner` | flex, pełna szerokość, .82rem/1.3, promień 10 px, wypełnienie .4rem .55rem .4rem .8rem, odstępy .45rem .55rem |
| `--upgrade` | tło #f5eeff, obrys rgba(153,0,255,.28), tekst #5c008a; przycisk #9900ff → `:hover` #7a00cc |
| `--login` | tło #e5f9fb, obrys rgba(0,131,141,.28), tekst #005a61; przycisk #00838d → `:hover` #006b73 |
| `.vilda-pro-gate-banner__btn` | pigułka 999 px, .24rem .75rem, .78rem waga 600, biały tekst, `!important` na obrysie, promieniu, wypełnieniu i tle |

Responsywność: ≤560 px akcje `#sw-update-banner` rozciągają się na całą szerokość, przyciski dzielą ją po równo; ≤540 px bramka PRO układa się w kolumnę z wyśrodkowanym tekstem i przyciskiem na 100 %.

## Tokeny

`--primary`, `--secondary`; przez globalne reguły przycisków: `--radius`, `--shadow`, `--shadow-l`, `--lg-border`.

## Zasady

- Rób: jeden baner systemowy naraz; `#sw-update-banner` ma najwyższy z-index w aplikacji i nie może być zasłonięty.
- Rób: w bramce PRO trzymaj tekst ze znakiem na początku (`⚡`, `🔐`, jak w `index.html`) i jedno wezwanie do działania.
- Nie rób: nie pokazuj obu bramek jednocześnie — w aplikacji wyklucza je klasa `html.vilda-logged-in`.
- Nie rób: nie usuwaj `aria-label` z przycisków aktualizacji („Zaktualizuj aplikację do najnowszej wersji", „Odłóż aktualizację aplikacji na później").
- Kontrast (zmierzony): #5c008a na #f5eeff 10.2:1, #005a61 na #e5f9fb 7.3:1; biały na #9900ff 5.5:1, na #00838d 4.5:1; tytuł #0f2b33 na białym 14.9:1, podtytuł #5b6672 5.9:1. Biały na `--secondary` #00b0a6 (`#sw-update-banner .btn`, `#updateBanner button` bez szkła) ma 2.7:1 — poniżej 4.5:1 (wartość źródła, bez zmian); w aplikacji szkło jest zawsze włączone i te przyciski są pigułkami #111 na białym (18.9:1).
- Wysoki kontrast i szkło: bramki i paski nie mają osobnych reguł; ich przyciski (`<button>`) dziedziczą pigułkę szkła, a `.vilda-pro-gate-banner__btn` wygrywa własnym `!important`.
- W podglądzie `#sw-update-banner` i `#updateBanner` pokazane w przepływie: nadpisano wyłącznie `position` i `transform`; `#updateBanner` i bramki odsłonięto inline `display`, tak jak robi to skrypt lub klasy `<html>`.

Wersja statyczna, przepisana ręcznie z src/css/style.css (268-278, 4791-4818), src/html-styles/index.css (20-211), ios26-ui.js (funkcje Pn i zn: `<style id="ww-sw-update-banner-styles">`, `i.style.cssText`, znacznik) oraz index.html (znacznik bramek PRO).
