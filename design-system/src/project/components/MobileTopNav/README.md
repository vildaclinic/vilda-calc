# MobileTopNav

Nawigacja górna na telefonie i tablecie (≤991px): kwadratowy 40 px szklany przycisk menu z trzema kreskami po lewej stronie paska oraz 25 px pasek marki „wagaiwzrost.pl” pod paskiem, bo logo jest tam ukryte.

## Kiedy używać

Przycisk otwiera ChromeDrawer (szufladę nawigacji) i pojawia się wyłącznie poniżej 992 px — na desktopie CSS go chowa, a nawigacją jest Sidebar. Pasek marki wypełnia miejsce po ukrytym `.chrome-brand`. Legacy hamburger `.main-nav .menu-toggle` (CSS-only, z `input.nav-toggle`) jest w arkuszu, ale żadna strona nie niesie już jego znacznika; `ios26-ui.js` tylko go wykrywa.

## Co dostarcza konsument

- `<button type="button" class="chrome-mobile-menu-btn" aria-label="Otwórz menu" data-vilda-chrome-menu-btn>` jako pierwsze dziecko `.chrome-strip`, zawsze z inline SVG 22px (trzy linie `x1=3 x2=21`, `y=6/12/18`, `stroke="currentColor"`, `stroke-width="2"`). Klasa `.chrome-icon-fallback` (1.4rem) jest w arkuszu, ale aplikacja używa tylko jej wariantu `--small` w UserChip; przycisk menu nie ma glifu zastępczego.
- `<div class="chrome-mobile-brand-bar" aria-hidden="true">wagaiwzrost.pl</div>` jako drugie dziecko `[data-vilda-chrome-wrap]`, zaraz po `.chrome-strip`.
- Legacy: `<nav class="main-nav"><ul><li class="menu-toggle"><input type="checkbox" class="nav-toggle" id="…"><label for="…"><span class="bar"></span><span class="bar"></span><span class="bar"></span></label></li>…</ul></nav>` — struktura wynika z selektorów `.nav-toggle:checked+label .bar:nth-child(n)`.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.chrome-mobile-menu-btn` | `inline-flex`, 40×40 (`width/height/min/max` z `!important`), promień 12px, obrys `1px solid chrome-glass-border`, tło `#fff9`, ikona `primary`, `padding:0`, `margin:0`; przejścia tła .15s i transformacji .1s. |
| `:hover` | Tło `#ffffffe6`. |
| `:active` | `transform:scale(.96)`. |
| `:focus-visible` | Wspólny obrys chrome: `2px solid primary`, odsunięcie 2px, promień 8px. |
| `≥992px` | `display:none!important`. |
| `.chrome-icon-fallback` / `--small` | `inline-flex`, 1.4rem / .95rem, `line-height:1`, `color:currentColor`. |
| `.chrome-mobile-brand-bar` | Ukryty; ≤991px `flex` wyśrodkowany, `min-height:25px`, .8rem/600, `.04em`, `primary`, tło `#00838d0d`, górny obrys `.5px solid rgba(0,131,141,.14)`, `line-height:1`. |
| `.main-nav .menu-toggle label` | 32×32, bez tła i obrysu, `padding:.4rem`, kolumna z `gap:4px`; ≤600px rozmiar `--mobile-top-nav-hamburger-size` 2.06rem (1.98rem ≤420px, 1.92rem ≤360px), `padding:.28rem`. |
| `.main-nav .menu-toggle .bar` | 24×2px, `primary`, promień 1px, przejścia .3s. |
| `.nav-toggle:checked+label .bar` | Kreska 1 `translateY(6px) rotate(45deg)`, kreska 2 bez zmian, kreska 3 `translateY(-6px) rotate(-45deg)` — krzyżyk. |
| `.main-nav` ≤600px | Siatka `grid-template-columns: var(--mobile-top-nav-hamburger-size) repeat(5,minmax(0,1fr))`, `gap:.22rem`, linki .72rem w jednej linii z wielokropkiem. |
| `header .main-nav` ≥992px, `.has-sidebar header>.main-nav` | Ukryte. |

Szkło nie ma reguł dla przycisku menu — jego wygląd jest wpisany z `!important`, więc glass-4 go nie zmienia. Wysoki kontrast i ciemne tło również nie mają reguł; przycisk polega na obrysie `chrome-glass-border` i tle `#fff9`, które na ciemnym tle strony staje się mniej kryjące.

## Tokeny

`--chrome-glass-border`, `--primary`; legacy: `--mobile-top-nav-font-size`, `--mobile-top-nav-gap`, `--mobile-top-nav-side-padding`, `--mobile-top-nav-hamburger-size` (zmienne lokalne `.main-nav`, deklarowane w regułach ≤600/420/360px).

## Zasady

- Rób: zostaw `aria-label="Otwórz menu"` — przycisk nie ma tekstu; kliknięcie tylko otwiera szufladę, a zamknięcie ma osobny przycisk `.chrome-drawer-close` z etykietą „Zamknij menu” (skrypt nie zmienia etykiety ani `aria-expanded` na przycisku menu).
- Rób: trzymaj SVG 22px w `currentColor`, żeby ikona brała kolor `primary` z przycisku i obrys fokusu obejmował cały kwadrat.
- Rób: pasek marki zostaw `aria-hidden` — nazwa strony jest już w `<title>` i w marce desktopowej; to element czysto wizualny.
- Nie rób: nie pokazuj przycisku na desktopie ani nie dubluj go w szufladzie; przy ≥992px nawigacją jest Sidebar.
- Nie rób: nie buduj nowych stron na legacy `.main-nav` — jest utrzymywany tylko dla zgodności i ukrywany pod chrome.
- Podgląd renderuje się przy 960 px, więc przycisk i pasek marki są widoczne tak jak w aplikacji na tablecie; próbki legacy stoją poza `<header>`, bo w nim byłyby ukryte. Podkładka `.ground` w podglądzie tylko imituje tło paska.
- Kontrast (zmierzony): ikona `primary` na tle przycisku `#fff9` nad bielą 4,5:1; tekst paska marki `#00838d` na `#00838d0d` 4,2:1 — poniżej 4,5:1, wartość źródła (element jest `aria-hidden`, nazwa strony jest w `<title>`).

Wersja statyczna, przepisana ręcznie z src/css/vilda_chrome.css (82-119, 456-484, 960-963), src/css/style.css (3161-3184, 3914-3934, 4015-4021, 4881-4935), src/css/sidebar.css (10-11), vilda_chrome.js (funkcja Je)
