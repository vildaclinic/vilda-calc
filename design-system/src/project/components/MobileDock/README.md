# MobileDock

Pływający dolny pasek nawigacji na telefonie i tablecie (≤991px): szklana listwa z pięcioma kafelkami tras, przypięta nad bezpiecznym obszarem ekranu, z podświetloną bieżącą trasą.

## Kiedy używać

Dock buduje `ios26-ui.js` (`setupMobileBottomDock`) na każdej stronie poza ramką osadzoną (`?embedded=1`) i dokleja go na końcu `<body>`. Pokazuje stałą listę pięciu tras: Start, DocPro, Notatki, Terminarz, Lab (Jednostki laboratoryjne). Na desktopie (≥992px) jest ukryty, nawigacją jest Sidebar. Skrypt chowa dock przy przewijaniu w dół (`.is-hidden`), przy otwartej klawiaturze (`.is-keyboard-hidden`), w tutorialu (`body.nav-ui-temporarily-hidden`), pod oknami logowania (`body.vilda-password-alert-open`, `body.vilda-modal-alert-open`) i na życzenie użytkownika (`body.user-hides-mobile-dock` z Ustawień). W powłoce `app.html` dock stoi w dokumencie nadrzędnym, a modal w ramce ukrywa go przez `html.vilda-pane-modal-open` (`visibility`, nie `display`, żeby pudełko zostało do pomiarów).

## Co dostarcza konsument

- `<nav id="mobileBottomDock" class="mobile-bottom-dock" aria-label="Szybka nawigacja">` — wszystkie reguły są zapisane po `id`, więc `id="mobileBottomDock"` jest wymagane; klasa `.mobile-bottom-dock` sama nic nie styluje.
- W środku jeden `<div class="mobile-bottom-dock__list">` z pięcioma `<a class="mobile-bottom-dock__item" href aria-label>`; siatka ma zawsze 5 kolumn (`repeat(5,minmax(0,1fr))`).
- Każdy kafelek: `<span class="mobile-bottom-dock__icon" aria-hidden="true">` z ikoną Lucide (w aplikacji `<span data-lucide="…">` zamieniany na `<svg>`) i `<span class="mobile-bottom-dock__label" data-full-label="Pełna nazwa">Etykieta</span>`. Etykieta widoczna może być skrócona („Lab”), pełna nazwa siedzi w `data-full-label` i w `aria-label` odnośnika.
- Bieżąca trasa: `.is-active` oraz `aria-current="page"` na tym samym odnośniku.
- `body.has-mobile-bottom-dock` (ustawia skrypt, gdy dock działa) wymusza `display:block` i dokłada `padding-bottom` ciała strony: `calc(--mobile-dock-height + env(safe-area-inset-bottom) + --mobile-dock-extra-offset + --mobile-dock-bottom-gap + 1rem)`.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `#mobileBottomDock` | `position:fixed`, lewo/prawo `max(--mobile-dock-side-gap .75rem, safe-area + .35rem)`, dół `--mobile-dock-anchor-bottom` (safe-area + `--mobile-dock-bottom-gap` 4px + `--mobile-dock-extra-offset` 0px), `z-index:1100`; `display:none`, a przy ≤991.98px `display:block`; przejścia `transform/opacity/box-shadow .22s ease`. |
| `.mobile-bottom-dock__list` | Siatka 5 kolumn, `gap:.28rem`, `min-height:--mobile-dock-height` 84px (źródło przy ≤480px zmienia ten token na 80px — w tokenach `--mobile-dock-height-compact`; partial nie przepisuje tokenów), `padding:.4rem`, promień 1.55rem, tło `#fffc`, obrys `1px solid rgba(255,255,255,.42)`, cień `0 18px 42px #0f172a29, inset 0 1px #ffffff6b`, `backdrop-filter:blur(24px) saturate(155%)`. |
| `.mobile-bottom-dock__item` | Kolumna flex wyśrodkowana, `gap:.2rem`, `padding:.42rem .28rem`, promień 1.2rem, kolor `#52606d`, bez podkreślenia; przejścia .18s. |
| `.mobile-bottom-dock__item:active` | `transform:scale(.97)`. |
| `.mobile-bottom-dock__item.is-active` | Kolor `primary`, tło `#00838d1f`, wewnętrzny pierścień `inset 0 0 0 1px #00838d2e`. |
| `.mobile-bottom-dock__icon` | 1.2rem × 1.2rem, `inline-flex`; `svg` wypełnia 100%. |
| `.mobile-bottom-dock__label` | Blok 100%, `.68rem/600`, `line-height:1.1`, jedna linia z wielokropkiem; `.63rem` przy ≤480px. |
| `#mobileBottomDock.is-hidden`, `.is-keyboard-hidden` | Zjazd `translateY(calc(100% + safe-area + --mobile-dock-bottom-gap + .95rem))`, `opacity:.001`, bez zdarzeń wskaźnika. |
| `body.user-hides-mobile-dock`, `body.nav-ui-temporarily-hidden`, `body.vilda-password-alert-open`, `body.vilda-modal-alert-open`, `.vilda-embedded` | `display:none!important` (styl z `ios26-ui.js`, `style.css`, `vilda_auth_ui.css`, `<style>` stron). |
| `body.mobile-nav-ui-locked` | Przejścia i animacje wyłączone (styl wstrzykiwany z `ios26-ui.js`). |
| `html.vilda-pane-modal-open` (powłoka) | `visibility:hidden!important`, `pointer-events:none!important`. |
| PWA (`display-mode:standalone` + `pointer:coarse`, także `body.display-mode-standalone`) | Dół `--mobile-dock-anchor-bottom!important`, zjazd `translateY(calc(100% + anchor + .75rem))`, `padding-bottom` ciała `calc(height + anchor + .75rem)`, `min-height:calc(100% + 120px)`. |
| `prefers-reduced-motion` | `transition:none!important` na docku i kafelkach. |

Dock nie jest przepisany pod `.liquid-ios26` — jego szkło (`#fffc`, blur 24px) jest stałe i nie zależy od poziomu szkła. Wysoki kontrast dodaje tylko obrys fokusu na odnośnikach (`--hc-focus-width solid --hc-focus-color`, odsunięcie 2px); ciemne tło nie ma reguł — listwa `#fffc` pozostaje jasna na `#f5f5f5`/`#e0e0e0`.

## Tokeny

`--mobile-dock-height` (84px; przy ≤480px źródło ustawia 80px, w tokenach jako `--mobile-dock-height-compact`), `--mobile-dock-side-gap`, `--mobile-dock-bottom-gap`, `--mobile-dock-extra-offset`, `--mobile-dock-visible-lift`, `--mobile-dock-scroll-top-gap`, `--primary`, `--hc-focus-width`, `--hc-focus-color`; zmienne lokalne z `calc()` deklarowane w partialu: `--mobile-dock-anchor-bottom`, `--mobile-dock-effective-height` (z opcjonalnym `--mobile-dock-measured-height` ustawianym przez skrypt), `--mobile-dock-pinned-visible-lift`, `--mobile-dock-pinned-scroll-top-bottom`.

## Zasady

- Rób: zawsze 5 kafelków — siatka ma sztywno 5 kolumn, mniej tras zostawia puste pola, więcej wypada poza listwę.
- Rób: bieżącą trasę oznaczaj jednocześnie `.is-active` (wygląd) i `aria-current="page"` (czytnik ekranu); ikona plus etykieta, nigdy sam kolor.
- Rób: pełną nazwę trasy trzymaj w `aria-label` i `data-full-label`, gdy etykieta widoczna jest skrócona („Lab”).
- Rób: zostaw `id="mobileBottomDock"` — bez niego nie działa ani stylowanie, ani pozycjonowanie strzałki „do góry” nad dockiem.
- Nie rób: nie dokładaj drugiego docka ani nie umieszczaj go w ramce osadzonej — w `app.html` dock należy do dokumentu nadrzędnego.
- Nie rób: nie chowaj docka przez `display:none` z własnych skryptów — skrypt zarządza `.is-hidden`/`.is-keyboard-hidden`, a `body.user-hides-mobile-dock` jest preferencją użytkownika.
- Kontrast: etykieta kafelka aktywnego (`primary` #00838d, `.68rem/600`) na wypełnieniu `#00838d1f` nałożonym na listwę `#fffc` i tło `#ffffff` daje zmierzone 3,86:1 — poniżej 4,5:1 dla małego tekstu; wartości pochodzą ze źródła i nie zostały zmienione. Kafelek nieaktywny (`#52606d`) ma 6,33:1.
- Podgląd: dock w aplikacji jest `position:fixed`; w podglądzie nadpisano wyłącznie pozycję (`position:static`, `transform:none`) i ustawiono go w ramce o szerokości telefona (430px). Widoczność bierze się z reguły ≤991.98px, bo podgląd renderuje się przy 960px.

Wersja statyczna, przepisana ręcznie z src/css/ios26-v2.css (353-364, 365-433, 444-482), src/css/style.css (517-525, 5196-5198), src/css/vilda_shell.css (74-75, 146-147, 163-165), src/css/vilda_auth_ui.css (1626-1629, 1664-1667), src/html-styles/index.css (2), ios26-ui.js (setupMobileBottomDock, #vildaNavigationVisibilityPrefsStyle, #vildaLockedMobileNavigationStyle)
