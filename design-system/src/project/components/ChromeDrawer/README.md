# ChromeDrawer

Mobilna szuflada nawigacji (≤991px): biały panel do 320 px wysuwany od lewej nad przyciemnionym tłem, z nagłówkiem „Menu”, kartą konta i pacjenta oraz tymi samymi sekcjami linków co Sidebar.

## Kiedy używać

Otwierana przyciskiem MobileTopNav (`[data-vilda-chrome-menu-btn]`) na telefonie i tablecie; na desktopie nawigacją jest Sidebar, a szuflada pozostaje `hidden`. Skrypt (`Je()`) przenosi powłokę szuflady na koniec `<body>`, a `$e()` buduje jej treść z modelu menu. Nie używaj jej do dialogów treści ani jako panelu ustawień — to wyłącznie nawigacja i status sesji.

## Co dostarcza konsument

- Powłoka: `<div class="chrome-drawer" data-vilda-chrome-drawer hidden aria-hidden="true"><div class="chrome-drawer-backdrop" data-vilda-chrome-drawer-close></div><div class="chrome-drawer-panel" role="dialog" aria-label="Menu"><div class="chrome-drawer-head"><span class="chrome-drawer-title">Menu</span><button type="button" class="chrome-drawer-close" data-vilda-chrome-drawer-close aria-label="Zamknij menu"><svg…></button></div><div class="chrome-drawer-body" data-vilda-chrome-drawer-body>…</div></div></div>`. SVG w przycisku zamknięcia jest ukryte (`display:none!important`) — krzyżyk rysują `::before`/`::after`.
- Karta konta: `<div class="chrome-drawer-account"><div class="chrome-drawer-account-row"><span class="chrome-drawer-account-avatar is-logged-in|is-guest" aria-hidden="true">AK</span><div class="chrome-drawer-account-info"><span class="chrome-drawer-account-label">Konto</span><span class="chrome-drawer-account-value">…</span></div></div><button type="button" class="chrome-drawer-account-action"><svg 16px/><span>Wyloguj się | Zaloguj się</span></button><div class="chrome-drawer-patient-row"><span class="chrome-drawer-patient-label">Pacjent</span><span class="chrome-drawer-patient-value">—</span></div></div>`. Gość ma w awatarze ikonę użytkownika, wartość „Niezalogowany” (w trybie gościa „Tryb gościa”) i akcję „Zaloguj się”; zalogowany — inicjały, etykietę konta i „Wyloguj się”.
- Nawigacja: `<nav class="chrome-drawer-nav" aria-label="Menu mobilne">` z `<div class="chrome-drawer-section">` (tytuł `.chrome-drawer-section-title` pomijany dla sekcji „Pacjent”) i `<ul>`; wiersz to `<li><a href [class="pro-link"] [aria-current="page"]>` albo `<li><button type="button" class="chrome-drawer-btn [auth-only-item]" data-drawer-btn="saveDataBtnSidebar">`, zawsze z `<span class="chrome-drawer-icon" data-lucide="…"><svg/></span><span class="chrome-drawer-label">…</span>`. Pozycje `data-auth-only="true"` są `style="display:none"` dla gościa.
- Stan otwarty: skrypt zdejmuje `hidden`, ustawia `aria-hidden="false"` i dodaje `chrome-drawer-open` na `<body>`.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.chrome-drawer` | `position:fixed; inset:0; z-index:99999; display:flex`; `[hidden]` — `display:none`. |
| `.chrome-drawer-backdrop` | `position:absolute; inset:0`, tło `#0f1c1e73`, `backdrop-filter:blur(2px)`, `cursor:pointer`, `opacity:0`, `transition:opacity .26s`. |
| `.chrome-drawer-panel` | `width:min(86%,320px)`, tło `#fff`, `height:100%`, kolumna flex, cień `4px 0 24px #00323c2e`, `transform:translate(-100%)`, `transition:transform .28s cubic-bezier(.4,0,.2,1)`, `padding-top:var(--vilda-safe-top)` (`env(safe-area-inset-top, 0px)`). |
| `body.chrome-drawer-open` | Tło `opacity:1`, panel `transform:none`, `body{overflow:hidden}` (blokada przewijania). |
| `prefers-reduced-motion` | Tło i panel bez przejść. |
| `.chrome-drawer-head` | Wiersz `space-between`, `padding:.9rem 1rem`, dolny obrys `1px solid #e5eded`; `.chrome-drawer-title` 700 w `primary`. |
| `.chrome-drawer-close` | 36×36, `inline-flex`, promień 10px, obrys `1px solid #e5eded`, tło `#fff`, kolor `#08202c` (wszystko `!important`); krzyżyk z dwóch pasków 18×2px `currentColor` obróconych ±45°; hover — kolor i obrys `primary`. |
| `.chrome-drawer-body` | `overflow-y:auto`, `padding:.5rem .5rem 1.2rem`, `flex:1 1 auto`. |
| `.chrome-drawer-section` | `margin-top:1rem` (pierwsza `0`); tytuł `.7rem`/700, wersaliki, `.08em`, `chrome-label-color`, `padding:.5rem .85rem .25rem`. |
| `.chrome-drawer-nav a`, `.chrome-drawer-btn` | `display:flex`, `gap:.7rem`, `padding:.7rem .85rem`, kolor `text`, 500, promień 10px, `margin:.05rem .25rem`, `transition .12s`; przycisk `width:100%`, bez tła i obrysu, `text-align:left`, `font:inherit`; `li:has(.chrome-drawer-btn)` ma `margin:.125rem 0`. |
| `:hover` | Tło `#eef5f5`. |
| `a[aria-current=page]`, `a.is-active` | Tło `chrome-active-bg` (gradient `primary → secondary`), tekst `#fff`, 700, ikona `#fff`. |
| `.chrome-drawer-icon` | 22×22 `inline-flex`, kolor `primary`; `svg` 18×18. `.chrome-drawer-label` — `flex:1 1 auto`. |
| `.pro-link` | Kolor `secondary` #00b0a6, 700 (bez plakietki „PRO”). |
| `.chrome-drawer-account` | Kolumna `gap:.6rem`, `padding:.85rem .85rem .95rem`, `margin:0 0 .6rem`, dolny obrys `#e5eded`, tło `linear-gradient(180deg,#00838d0f,#00838d00)`. |
| `.chrome-drawer-account-avatar` | Koło 36px, `.85rem`/700, tło `#e8eded`, kolor `#9eb8bb`; `.is-logged-in` — gradient 135° `primary → secondary`, `#fff`; `.is-guest` — `#f3eaea`/`#b35c5c`. |
| `.chrome-drawer-account-label` / `-value` | `.66rem` wersaliki 700 `.06em` w `chrome-label-color` / `.95rem`/600 `text`, jedna linia z wielokropkiem. |
| `.chrome-drawer-account-action` | `inline-flex` na całą szerokość, `gap:.5rem`, `padding:.6rem .8rem`, promień 10px, obrys `1px solid primary`, tło `#fff`, kolor `primary`, `.92rem`/600, `transition .15s`; hover — tło `primary`, tekst `#fff`; `svg` 16×16. |
| `.chrome-drawer-patient-row` | Wiersz `space-between` po linii bazowej, `padding:.4rem .1rem 0`, górny obrys `1px dashed rgba(0,131,141,.18)`, `margin-top:.2rem`; etykieta jak etykieta konta, wartość `.85rem`/600 `text` wyrównana do prawej z wielokropkiem. |
| `.has-vilda-chrome a:focus-visible`, `button:focus-visible` | `outline:2px solid primary`, `outline-offset:2px`, promień 8px. |

Szkło, wysoki kontrast i ciemne tło nie mają reguł dla szuflady; panel jest kryjąco biały, więc `dark-bg` widać tylko przez tło `#0f1c1e73` za nim.

## Tokeny

`--primary`, `--secondary`, `--text`, `--chrome-label-color`; zmienne lokalne `--chrome-active-bg` (gradient z `var()`) i `--vilda-safe-top` (`env()`).

## Zasady

- Rób: trzymaj `role="dialog"` z `aria-label="Menu"` na panelu i `aria-label="Zamknij menu"` na przycisku bez tekstu; skrypt zamyka szufladę klawiszem Escape oraz kliknięciem w `[data-vilda-chrome-drawer-close]` (tło i przycisk), nie przenosi fokusu.
- Rób: zamknięty stan to atrybut `hidden` i `aria-hidden="true"` na powłoce, nie tylko `transform` — inaczej linki pozostają w kolejności tabulacji.
- Rób: pozycje tylko dla zalogowanych ukrywaj `display:none`, nie `aria-disabled` — gość nie powinien ich widzieć.
- Nie rób: nie wkładaj do szuflady MiniSummary ani skrótów — status pacjenta ogranicza się do wiersza „Pacjent”.
- Nie rób: nie zmieniaj `z-index:99999` ani nie osadzaj szuflady wewnątrz `header` — skrypt celowo przenosi ją na koniec `<body>`, żeby leżała nad paskiem i dokiem.
- Kontrast: tekst `#333` na bieli 12.6:1; `#9eb8bb` na `#e8eded` w awatarze 1.8:1 (stan ładowania, treść „…”); `#b35c5c` na `#f3eaea` 3.9:1 przy ikonie. `.pro-link` w `secondary` #00b0a6 na bieli daje 2,7:1 — para ze źródła poniżej 4,5:1, niezmieniona; `primary` #00838d na bieli (tytuł, akcja konta) 4,5:1, etykiety `#5a7274` na tle karty konta 4,8:1.
- Podgląd: szuflada jest w źródle `position:fixed; inset:0`; w podglądzie stoi w scenie 580 px z nadpisaniem tylko pozycji (`position:absolute`), w stanie otwartym (`body.chrome-drawer-open`, bez `hidden`), z obu wariantami konta obok siebie; lista „Narzędzia” jest skrócona do trzech pozycji, żeby zmieścić się bez przewijania `.chrome-drawer-body`.

Wersja statyczna, przepisana ręcznie z src/css/vilda_chrome.css (523-761, 960-963, 1272-1275), vilda_chrome.js (funkcje Je, $e, aktualizacja konta w szufladzie)
