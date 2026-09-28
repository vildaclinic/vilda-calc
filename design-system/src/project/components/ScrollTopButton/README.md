# ScrollTopButton

Okrągły pływający przycisk „Powrót na górę strony” w prawym dolnym rogu; na stronach z dockiem jego dół podnosi się nad dock, a w powłoce `app.html` zastępuje go mniejszy 44px przycisk powłoki obok 54px przycisku „Nowy termin”.

## Kiedy używać

Wariant strony `#scrollTopBtn` tworzy `ios26-ui.js` (`Qt()`), gdy strona nie ma go w znaczniku, i steruje jego widocznością po przewinięciu; kliknięcie woła `window.scrollToTop`. W powłoce `app.html` strona w ramce ma `#scrollTopBtn` ukryty (`.vilda-shell-host`, `.vilda-embedded`), a `vilda_shell.js` buduje `#appShellScrollTop` w dokumencie nadrzędnym i pokazuje go klasą `.is-visible`; na trasie Terminarz obok stoi `#appShellTermFab` z plusem. Oba przyciski powłoki stoją na wysokości `--vilda-shell-dock-h` (zmierzona wysokość docka, domyślnie 84px) + 14px.

## Co dostarcza konsument

- Strona: `<button id="scrollTopBtn" type="button" aria-label="Powrót na górę strony"><i data-lucide="arrow-up"></i></button>` (w aplikacji dodatkowo `data-ios26-injected="true"`). Lucide zamienia `<i>` na `<svg class="lucide lucide-arrow-up">`; reguła `#scrollTopBtn i, #scrollTopBtn svg` styluje oba. Reguły są po `id`, więc `id="scrollTopBtn"` jest wymagane.
- Powłoka: `<button id="appShellScrollTop" type="button" aria-label="Przewiń na górę">` z inline SVG strzałki (`stroke="currentColor"`, `stroke-width="2.2"`, ścieżki `M12 19V5` i `M6 11l6-6 6 6`) oraz `<button id="appShellTermFab" type="button" aria-label="Nowy termin">+</button>`. Widoczność daje klasa `.is-visible` — bez niej przycisk ma `opacity:0` i nie odbiera kliknięć.
- Element jest `<button>`, więc podlega globalnym regułom przycisków (`style.css`) i globalnemu szkłu `.liquid-ios26 button` z `!important`.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `#scrollTopBtn` (baza, `style.css`) | `position:fixed`, `bottom:1rem`, `right:1rem`, 4rem × 4rem, `border-radius:50%`, tło `primary`, ikona biała 3rem, cień `--shadow`, `z-index:1000`, `display:flex` (obie gałęzie media ≤699/≥700px; skrypt włącza i wyłącza widoczność). |
| `#scrollTopBtn:hover` | Tło `secondary`; z globalnej reguły `button:hover` dochodzi `transform:translateY(-1px) scale(1.02)` i cień `--shadow-l`. |
| `.liquid-ios26 button` (w aplikacji `body` ma tę klasę) | Z `!important`: tło `#fff3`, obrys `1px solid --lg-border`, kolor `#111`, promień 14px, `backdrop-filter:blur(10px) saturate(120%)`, cień `0 4px 12px #0000001a`. Dlatego w działającej aplikacji przycisk jest jasnym szklanym kwadratem o promieniu 14px z ciemną strzałką, a nie turkusowym kołem; przy `body.glass-level-4` obrys `--lg-border` jest bielszy (`rgba(255,255,255,.9)`). |
| `body.has-mobile-bottom-dock #scrollTopBtn` | `bottom:--scroll-top-btn-bottom` (1rem) `!important`, `z-index:1201`, przejścia `bottom/background/transform/opacity`. |
| `body.mobile-nav-ui-locked.has-mobile-bottom-dock #scrollTopBtn` (i `…-visible`) | `bottom:--mobile-dock-pinned-scroll-top-bottom` — wysokość docka + kotwica + `--mobile-dock-scroll-top-gap` 4px. |
| `body.mobile-nav-ui-locked.user-hides-mobile-dock #scrollTopBtn` | `bottom:--mobile-dock-anchor-bottom`. |
| `body.user-hides-nav-arrow`, `body.nav-ui-temporarily-hidden`, `body.vilda-password-alert-open`, `body.vilda-modal-alert-open`, `.vilda-embedded`, `.vilda-shell-host` | `display:none!important`. |
| `html[data-clcr-workflow-ui="1"].clcr-search-open` | `visibility:hidden`, `opacity:0`, bez zdarzeń (otwarta wyszukiwarka klirensu). |
| `#appShellScrollTop` | `position:fixed`, `right:16px`, `bottom:calc(--vilda-shell-dock-h + 14px)`, `z-index:1150`, 44 × 44, `border:.5px solid rgba(255,255,255,.55)`, `border-radius:50%`, tło `#ffffffb8`, `backdrop-filter:blur(12px) saturate(1.4)`, cień `0 6px 20px #0f2b332e`, ikona `#0f6e56` 22px; domyślnie `opacity:0`, `translateY(10px)`, `pointer-events:none`. W `app.html` (`body.liquid-ios26`) globalne szkło z `!important` nadpisuje tło, obrys, kolor (`#111`) i promień (14px). |
| `#appShellScrollTop.is-visible` | `opacity:1`, `translateY(0)`, `pointer-events:auto`. |
| `#appShellScrollTop:active` | `translateY(0) scale(.94)`. |
| `#appShellTermFab` | Jak wyżej, ale 54 × 54, tło `#00838d`, biały plus `font-size:1.7rem`, `line-height:1`, cień `0 6px 18px #00606a59`, przejście także `bottom .22s`; `.is-visible` i `:active` jak w `#appShellScrollTop`. Pod globalnym szkłem `!important` staje się jasny z ciemnym plusem. |
| `html.vilda-pane-auth-open` | Oba przyciski powłoki `display:none!important`. |
| `html.vilda-pane-modal-open` | Oba przyciski powłoki `visibility:hidden!important`, `pointer-events:none!important`. |

Wysoki kontrast dodaje tylko obrys fokusu `--hc-focus-width solid --hc-focus-color` z odsunięciem 2px na `button:focus-visible`; ciemne tło nie ma reguł.

## Tokeny

`--primary`, `--secondary`, `--shadow`, `--shadow-l`, `--anim-fast`, `--radius`, `--lg-border`, `--scroll-top-btn-bottom`, `--mobile-dock-scroll-top-gap`, `--vilda-shell-dock-h` (ustawiana przez `vilda_shell.js`, domyślnie 84px), `--hc-focus-width`, `--hc-focus-color`; lokalne z partialu: `--mobile-dock-pinned-scroll-top-bottom`, `--mobile-dock-anchor-bottom`.

## Zasady

- Rób: zostaw `aria-label` — przycisk nie ma tekstu; skrypt dodatkowo ustawia `aria-hidden` i `tabindex="-1"`, gdy użytkownik wyłączył strzałkę w Ustawieniach.
- Rób: w powłoce pokazuj przyciski wyłącznie klasą `.is-visible`; `#scrollTopBtn` strony w ramce ma zostać ukryty, żeby nie było dwóch strzałek.
- Rób: pozycję nad dockiem zostaw regułom `body.has-mobile-bottom-dock…` — dół wynika z pomiaru docka (`--mobile-dock-measured-height`), nie z wpisanej wartości.
- Nie rób: nie nadawaj przyciskowi własnego tła ani promienia w stylu inline — w aplikacji i tak wygra globalne szkło `.liquid-ios26 button` z `!important`.
- Nie rób: nie zmieniaj ikony na tekst — 3rem strzałka Lucide na stronie i 22px SVG w powłoce są jedynym sygnałem funkcji.
- Podgląd: wszystkie trzy przyciski są `position:fixed`; w podglądzie nadpisano wyłącznie pozycję (`position:static`, `transform:none`). Podgląd ma `body.liquid-ios26` jak aplikacja, więc pokazuje wygląd po nałożeniu globalnego szkła.

Wersja statyczna, przepisana ręcznie z src/css/style.css (569-583, 631-635, 659-663, 4022-4052, 517-525, 5196-5198), src/css/ios26-v2.css (85-93, 97-99, 434-443), src/css/vilda_shell.css (15-16, 74-75, 82-145, 161-165), src/css/vilda_auth_ui.css (1626-1629, 1664-1667), src/css/clcr_ui_workflow.css (2196-2200), ios26-ui.js (Qt, Zt, #vildaNavigationVisibilityPrefsStyle, #vildaLockedMobileNavigationStyle), vilda_shell.js (Rt)
