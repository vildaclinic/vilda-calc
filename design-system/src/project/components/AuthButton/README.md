# AuthButton

Przycisk ekranów konta i pacjentów: pigułka `inline-flex` z paddingiem `14px 22px`, promieniem 12px, obrysem 1.5px i tekstem 15px/500, w wariantach wypełnionym, białym, biometrycznym, dyskretnym i destrukcyjnym.

## Kiedy używać

Na ekranach logowania, konfiguracji hasła i biometrii, w arkuszach pacjentów oraz w sekcjach kopii zapasowych i synchronizacji na `ustawienia.html`. W kartach klinicznych użyj Button. Rodzina ma własne, literalne kolory i nie korzysta ze szkła: blok `.vilda-auth-root .vilda-auth-btn-*` ponownie ustawia wartości z `!important`, zeruje `backdrop-filter` i cofa `width:100%` narzucane przez globalne reguły przycisków.

## Co dostarcza konsument

- Element: `<button class="vilda-auth-btn vilda-auth-btn-<wariant>" type="button">`. Wariant: `vilda-auth-btn-primary`, `vilda-auth-btn-ghost`, `vilda-auth-btn-biometric`, `vilda-auth-btn-subtle`, `vilda-auth-btn-danger` (w aplikacji zawsze razem z `vilda-auth-btn-ghost`); rozmiar `vilda-auth-btn-small`.
- Kontenery: `vilda-auth-buttons` (kolumna, `gap:12px`), `vilda-auth-actions` (wiersz, `gap:12px`, każdy przycisk `flex:1`), `vilda-auth-actions-end` (do prawej, `min-width:140px`), `vilda-auth-actions-center` (środek, `min-width:200px`). Poniżej 520 px wiersz zmienia się w `column-reverse`, a przyciski `-end` dostają `width:100%`.
- Kontekst: wewnątrz `.vilda-auth-root` (ekrany konta) obowiązują reguły z `!important`, w tym pełny czerwony `danger`; poza nim (`ustawienia.html`) wygrywa późniejsza reguła `.vilda-auth-btn-danger` — biały przycisk z bordowym tekstem.
- Specjalne: `vilda-auth-logout` (pigułka w rogu ekranu, `position:fixed`, tworzona przez JS z `<span class="vilda-auth-logout-icon">⏻</span><span>Wyloguj się</span>`), `vilda-patient-delete-btn` (tylko w `.vilda-auth-root`), `vilda-copy-summary-btn` (fioletowy, w `.vilda-copy-summary-row`), `settings-backup-btn` (`primary small` na stronie ustawień).
- Znaki graficzne przed etykietą (identyfikator przy „Zaloguj przez Touch ID”, kostka przy „Zaproponuj silne hasło”, symbol zasilania w `vilda-auth-logout-icon`) są częścią tekstu w źródle; nie są wymagane.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.vilda-auth-btn` | `inline-flex`, wyśrodkowany, padding `14px 22px`, promień 12px, `border:1.5px solid transparent`, 15px/500, `font-family:inherit`; `:active` `translateY(1px)`; `:focus-visible` obrys `3px solid rgba(0,131,141,.3)` z odsunięciem 2px. |
| `.vilda-auth-btn-small` | Padding `10px 16px`, 13px, promień 10px. |
| `.vilda-auth-btn-primary` | Tło i obrys `#00838d`, tekst `#fff`, cień `0 6px 18px #00838d38`; hover `#006d75` i cień `0 8px 22px #00838d4d`. |
| `.vilda-auth-btn-ghost` | Tło `#fff`, tekst `#08202c`, obrys `#d6dde0`; hover tło `#f5fafb`, obrys i tekst `#00838d`. |
| `.vilda-auth-btn-biometric` | Gradient `135deg #00838d → #00b0a6`, tekst `#fff`, bez obrysu, waga 600, `letter-spacing:.01em`; hover gradient `#006d77 → #009a91`, `translateY(-1px)`, cień `0 4px 14px #00838d47`; `:active` bez cienia; `:focus-visible` obrys `2px solid #00838d` z odsunięciem 3px. Pod `body.liquid-ios26` globalna reguła `.liquid-ios26 button` (z `!important`) spłaszcza gradient do pigułki `#fff3` z tekstem `#111` — tak wygląda w aplikacji i w podglądzie; gradient widać tylko bez szkła. |
| `.vilda-auth-btn-subtle` | Przezroczysty, tekst `#6a8089`; hover tło `#f5fafb` (w `.vilda-auth-root`: `#00838d0f`) i tekst `#00838d`. |
| `.vilda-auth-btn-danger` w `.vilda-auth-root` | Tło i obrys `#b00020`, tekst `#fff`, cień `0 6px 18px #b0002038`; hover `#8e0019`. |
| `.vilda-auth-btn-danger` poza rootem | Tło `#fff`, tekst `#9f1239`, obrys `#f0c2cd` (reguła późniejsza w arkuszu). |
| `.vilda-auth-root .vilda-patient-delete-btn` | Tło `#fff`, tekst `#b00020`, obrys `1.5px #f0c4cf`, bez cienia; hover tło `#fff5f6`, obrys `#b00020`, tekst `#8e0019`. Poniżej 520 px `width:100%`. |
| `.vilda-auth-btn.vilda-copy-summary-btn` | `width:auto`, padding `10px 20px`, obrys `1.5px #c4b5fd`, tekst `#5b21b6`, tło `#ede9fe`, cień `0 3px 10px #7c3aed33`, waga 650; hover `#e3ddfc`, active `#d6ccfa`. Na ekranie dotykowym lub ≤720 px: obrys `#ddd6fe`, tekst `#6d28d9`, tło `#f5f3ff`, bez cienia. |
| `.vilda-auth-logout` | `position:fixed`, `inset:14px 14px auto auto`, `z-index:99990`, ukryty do zalogowania; biel, obrys `1.5px #d6dde0`, promień 24px, padding `8px 16px`, 13px/500 Inter, tekst `#08202c`, cień `0 4px 14px #003c501a`; hover obrys i tekst `#00838d`, cień `0 6px 18px #00838d2e`; ikona 16px. Poniżej 520 px `top/right:8px`, padding `6px 12px`, 12px. |
| `.settings-backup-btn` (ustawienia.html) | Dodatkowo `min-width:175px` (ustawienia.css); w aplikacji łączony z `vilda-auth-btn-primary vilda-auth-btn-small`. |
| `disabled` | Brak osobnej reguły w tej rodzinie — obowiązuje globalne `button:disabled` (`opacity:.45`). |

Wysoki kontrast (1–3): `vilda-auth-btn-ghost`, `vilda-auth-logout` i `vilda-patient-delete-btn` przechodzą na tło `hc-surface`, rozmycie `hc-blur`, cień `hc-shadow`; ghost i logout dostają obrys `hc-card-border-width solid hc-border` i tekst `hc-text`; `vilda-auth-btn-subtle` tekst `hc-muted`. Warianty wypełnione pozostają bez zmian. Ciemne tło nie zmienia przycisków.

## Tokeny

Baza nie używa zmiennych — kolory są literalne (`#00838d`, `#006d75`, `#006d77`, `#009a91`, `#00b0a6`, `#b00020`, `#8e0019`, `#9f1239`, `#f0c2cd`, `#f0c4cf`, `#d6dde0`, `#08202c`, `#6a8089`, `#f5fafb`, `#c4b5fd`, `#5b21b6`, `#ede9fe`). Wysoki kontrast: `--hc-surface`, `--hc-blur`, `--hc-shadow`, `--hc-card-border-width`, `--hc-border`, `--hc-text`, `--hc-muted`.

## Zasady

- Rób: w każdym wierszu akcji jeden `primary` i jeden `ghost` („Nie teraz” / „Tak, włącz synchronizację”); akcje destrukcyjne jako `ghost danger` z etykietą nazywającą skutek („Wyloguj wszystkie urządzenia”).
- Rób: umieszczaj przyciski w `vilda-auth-actions`, żeby dostały responsywne `column-reverse` i pełną szerokość na telefonie.
- Rób: dla przycisku biometrycznego zachowaj `type="button"` i etykietę z nazwą metody („Zaloguj przez Touch ID”), bo gradient sam nie komunikuje funkcji.
- Nie rób: nie mieszaj tej rodziny z klasami Button ani nie dodawaj jej szkła — blok w `.vilda-auth-root` celowo je wyłącza; poza rootem globalna reguła `.liquid-ios26 button` narzuca promień 14px i cień, dlatego na `ustawienia.html` przyciski wyglądają bardziej „szklano”.
- Nie rób: nie przenoś `vilda-auth-logout` do przepływu strony — to element przypięty, sterowany przez JS. W podglądzie karty jego pozycja i widoczność są nadpisane wyłącznie na potrzeby prezentacji.
- Kontrast (zmierzony): `#08202c` na bieli 16,8:1, `#fff` na `#00838d` 4,5:1, `#fff` na `#b00020` 7,3:1, `#9f1239` na bieli 8,0:1, `#5b21b6` na `#ede9fe` 7,6:1 — spełniają AA. `#6a8089` na bieli (subtle, 13px) ma 4,15:1 i nie osiąga 4,5:1 — wartość pochodzi ze źródła; wariant jest drugorzędny, a w wysokim kontraście przechodzi na `hc-muted`. Bez szkła gradient przycisku biometrycznego kończy się na `#00b0a6`, gdzie biały tekst ma 2,7:1 (na początku `#00838d` 4,5:1) — wartości pochodzą ze źródła; etykieta ma wagę 600 i nazywa metodę logowania. Pod szkłem ten sam przycisk to `#111` na białej pigułce (18,9:1 na bieli).

Wersja statyczna, przepisana ręcznie z src/css/vilda_auth_ui.css (188-256, 266-276, 295-339, 454-461, 709-735, 1208+1226-1233, 1234-1251, 1341-1383, 1452-1458, 1468-1471, 1647-1650), src/css/ustawienia.css (400-401)
