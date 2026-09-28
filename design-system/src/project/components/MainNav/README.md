# MainNav

Legacy nawigacja górna ze `style.css`: tealowe linki 600 na białym nagłówku do 960 px szerokości oraz hamburger CSS-only rozwijający menu `.vertical-menu`.

## Kiedy używać

Tylko dla zgodności wstecznej. Na stronach z chrome (`body.has-sidebar`, `body.has-vilda-chrome`) `header>.main-nav` jest ukryty `!important`, a od 992 px `header .main-nav` chowa też `sidebar.css`; żadna bieżąca strona nie niesie już tego znacznika (`ios26-ui.js` tylko go wykrywa). Nową nawigację buduj z ChromeStrip, Sidebar i ChromeDrawer. Ten komponent dokumentuje arkusz, który wciąż się ładuje i zadziała, jeśli znacznik wróci.

## Co dostarcza konsument

- `<nav class="main-nav"><ul>` z pozycjami `<li><a href="…">Kalkulator</a></li>`; pierwsza pozycja `<li class="menu-toggle">` z `<input type="checkbox" class="nav-toggle" id="…">`, `<label for="…" aria-label="Menu">` z trzema `<span class="bar"></span>` i `<ul class="vertical-menu">`, gdzie wiersze to `<li><a href>` albo `<li><button type="button">`.
- Struktura jest sztywna: selektory `.nav-toggle:checked+label+.vertical-menu` i `.nav-toggle:checked+label .bar:nth-child(n)` wymagają kolejności input → label → ul.
- Stan otwarty to `checked` na polu wyboru; stan wyłączony wiersza to `button[disabled]` albo `a[disabled]`.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.main-nav` | `max-width:960px`, wyśrodkowany, `padding-left:1.5rem`, `padding-right:1rem`, `width:100%`, `background:inherit`, `position:relative`, `box-sizing:border-box`. |
| `.main-nav ul` | Bez punktorów, `margin:.5rem 0 0`, `display:flex`, `gap:1rem`, `align-items:center`. |
| `.main-nav a` / `ul li a` | Kolor `primary`, 600, bez podkreślenia; 1rem, `display:flex`, `align-items:end`, `height:32px`; hover — podkreślenie. |
| `.menu-toggle label` | 32×32, bez tła i obrysu, `padding:.4rem`, kolumna flex `gap:4px`, `cursor:pointer`. |
| `.menu-toggle .bar` | 24×2px, tło `primary`, promień 1px, `transition: transform .3s, opacity .3s`. |
| `.nav-toggle` | `position:absolute; opacity:0; pointer-events:none` (pole ukryte, ale dostępne). |
| `.nav-toggle:checked+label .bar` | Kreska 1 `translateY(6px) rotate(45deg)`, kreska 2 bez zmian, kreska 3 `translateY(-6px) rotate(-45deg)`. |
| `.vertical-menu` | `position:absolute; top:100%; left:0`, 220 px, tło `card`, obrys `1px solid #d0dede`, promień `radius`, cień `shadow`, `padding-top:1rem`, kolumna flex, `z-index:1000`; zamknięte: `max-height:0; opacity:0; transform:scaleY(0)` od góry, `pointer-events:none`, `transition .3s`. |
| `.nav-toggle:checked+label+.vertical-menu` | `max-height:500px; opacity:1; transform:scaleY(1); pointer-events:auto`. |
| `.vertical-menu li` | Dolny obrys `1px solid #e0e7e7`, ostatni bez. |
| `.vertical-menu a`, `button` | Blok `padding:.75rem 1rem`, `primary`/600; przycisk `width:100%`, bez tła, obrysu, cienia i rozmycia `!important`, `text-align:left`, `font:inherit`; hover — tło `secondary`, tekst `#fff`. |
| `button:disabled`, `a[disabled]` | Kolor `#9eb8bb`, `cursor:default`, bez tła i obrysu; `a[disabled]` zachowuje `pointer-events:auto`, hover bez tła. |
| `.liquid-ios26 .vertical-menu button` | Szkło zdejmuje z przycisku wygląd szklanego przycisku: `background:none; border:none; box-shadow:none; backdrop-filter:none; border-radius:0; color:primary; font-weight:600; padding:.75rem 1rem; width:100%; text-align:left` (wszystko `!important`); hover `secondary`/`#fff`; `:disabled` i `a[disabled]` `#9eb8bb`. |
| ≤600px | `.main-nav` dostaje zmienne `--mobile-top-nav-font-size:.72rem`, `--mobile-top-nav-gap:.22rem`, `--mobile-top-nav-side-padding:.48rem`, `--mobile-top-nav-hamburger-size:2.06rem`; `>ul` to siatka `var(--mobile-top-nav-hamburger-size) repeat(5, minmax(0,1fr))`; linki wyśrodkowane, `min-height:2rem`, `line-height:1.06`, `letter-spacing:-.012em`, jedna linia z wielokropkiem; hamburger `padding:.28rem`; `.vertical-menu` 40% szerokości, w wariancie siatki `min(260px, calc(100vw - 1rem))`. ≤420px: `gap .18rem`, `padding .4rem`, hamburger 1.98rem; ≤360px: `.14rem`, `.34rem`, 1.92rem. |
| `header .main-nav` (≥992px), `.has-sidebar header>.main-nav`, `.has-vilda-chrome header>.main-nav` | `display:none` (z `!important` w dwóch ostatnich). |

Wysoki kontrast i ciemne tło nie mają reguł dla tej nawigacji.

## Tokeny

`--primary`, `--secondary`, `--card`, `--radius`, `--shadow`; zmienne lokalne `.main-nav` w zakresach ≤600/420/360px: `--mobile-top-nav-font-size`, `--mobile-top-nav-gap`, `--mobile-top-nav-side-padding`, `--mobile-top-nav-hamburger-size`.

## Zasady

- Rób: zostaw `aria-label="Menu"` na `label` — hamburger nie ma tekstu; pole wyboru zostaje w DOM (`opacity:0`), więc menu da się otworzyć z klawiatury.
- Rób: pozycję wyłączoną oznaczaj atrybutem (`disabled` na `button`, `[disabled]` na `a`), nie samym kolorem.
- Nie rób: nie wkładaj `.main-nav` do `<header>` na stronach z chrome — zostanie ukryty; nie mieszaj go z Sidebar ani ChromeDrawer.
- Nie rób: nie zmieniaj kolejności input → label → ul i nie zastępuj `label` przyciskiem — mechanizm otwierania to selektor sąsiedztwa `+`.
- Kontrast: `primary` #00838d na bieli 4.5:1; hover `secondary` #00b0a6 pod białym tekstem 2.7:1 (źródło używa go mimo to); `#9eb8bb` to celowo stan nieaktywny.
- Podgląd: próbki stoją poza `<header>`, na `<body>` bez `has-sidebar`, inaczej byłyby ukryte; menu otwarte ma pod sobą pusty pas, bo `.vertical-menu` jest pozycjonowane absolutnie względem `.main-nav`. Wariant siatki ≤600px nie mieści się w ramce 960 px.

Wersja statyczna, przepisana ręcznie z src/css/style.css (3161-3187, 3914-4021, 4881-4935), src/css/ios26-v2.css (204-236), src/css/sidebar.css (10-11), src/css/vilda_chrome.css (45-46, 912-913)
