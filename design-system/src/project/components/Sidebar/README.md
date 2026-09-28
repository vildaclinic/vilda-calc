# Sidebar

Lewa kolumna nawigacji na desktopie (≥992px): szklany panel 270 px przyklejony pod paskiem górnym, z sekcjami linków i strefą dodatków, montowany przez `vilda_chrome.js` w `<aside class="sidebar">` każdej strony narzędziowej.

## Kiedy używać

Na każdej stronie aplikacji z chrome (`body.has-vilda-chrome.has-sidebar`), jako pierwsza kolumna siatki `.desktop-layout` (`grid-template-columns: var(--chrome-sidebar-width) 1fr`, od 1400 px z trzecią kolumną 230 px na `.decor-sidebar`). Poniżej 992 px pasek jest ukryty (`display:none!important`), a nawigację przejmuje ChromeDrawer otwierany z MobileTopNav. Nie używaj tych klas do bocznych paneli treści ani do list w kartach — to powłoka strony.

## Co dostarcza konsument

- Na `<body>`: klasy `liquid-ios26 has-vilda-chrome has-sidebar`. Skrypt dokłada `has-vilda-chrome`; do tego czasu `.has-sidebar aside.sidebar:not(.sidebar-v2)` jest `visibility:hidden` z ukrytymi dziećmi, a `body.has-sidebar:not(.has-vilda-chrome) aside.sidebar` (≥992px, `min-height:70vh`) rysuje przez `::before` szkielet: pasy `repeating-linear-gradient(to bottom, rgba(13,68,76,.08) 0 13px, transparent 13px 40px)` 470 px wysokie, 16 px od krawędzi, 22 px od góry, promień 8px.
- Znacznik po montażu (`Ke()`): `<aside class="sidebar sidebar-v2" data-vilda-chrome-mounted="1"><div class="sidebar-inner"><nav class="sidebar-nav" aria-label="Nawigacja boczna">` z powtarzanym `<div class="sidebar-section"><div class="sidebar-section-title">…</div><ul>…</ul></div>`, a po nawigacji `<div class="sidebar-extras" data-vilda-chrome-extras>` — tam skrypt przenosi `#miniSummary` (MiniSummary) i `.steroid-summary`.
- Sekcje z modelu menu: „Pacjent” (Zapisz dane, Dodaj notatkę do wizyty, Pacjenci — elementy `role="button"`), „Narzędzia” (Strona główna, DocPro, HOMA-IR, Klirens, Steroidy, Jednostki lab., Wiedza), „Konto” (Notatki, Terminarz, Ustawienia). Pozycje w `<li>` to SidebarNavLink.
- Legacy (`sidebar.css`, bez `sidebar-v2`): `<aside class="sidebar"><div class="sidebar-logo"><a><h1>…</h1></a></div><nav class="sidebar-nav"><ul>…</ul></nav></aside>` — biała karta, którą chrome nadpisuje wyższą specyficznością; w aplikacji widoczna tylko bez `has-sidebar` na `<body>`.
- Kolumna dekoracyjna: `<aside class="decor-sidebar" id="vildaShellDecor">`; bez `decor-sidebar--has-content` jest `visibility:hidden` z wyzerowanym tłem, cieniem i rozmyciem.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.has-vilda-chrome aside.sidebar-v2` (≥992px) | `position:sticky; top:calc(var(--chrome-strip-height, 64px) + 1rem)!important`, `grid-column:1`, `justify-self:stretch`, tło `chrome-glass-bg` rgba(255,255,255,.78) `!important`, `backdrop-filter:saturate(160%) blur(14px)`, obrys `1px solid chrome-glass-border` rgba(0,131,141,.14) bez lewej krawędzi, promień `0 14px 14px 0` (`chrome-radius-card`), cień `chrome-glass-shadow` 0 8px 28px rgba(0,81,88,.1), `padding:0!important`, `margin:0!important`, `max-height:calc(100vh - 64px)`, `overflow:hidden`, `display:flex`, `transform:none!important`. |
| `.sidebar-inner` | Kolumna flex `width:100%`, `overflow-y:auto`, `overscroll-behavior:contain`, cienki pasek przewijania `rgba(0,131,141,.25)` (WebKit: 6px, kciuk `#00838d2e`, promień 4px). |
| `.sidebar-nav` | Kolumna flex, `padding:.4rem 0`, `margin:0`. |
| `.sidebar-section` | `padding:.35rem 0 .55rem`; kolejna sekcja ma `border-top:1px solid rgba(0,131,141,.08)` i `margin-top:.15rem`. |
| `.sidebar-section-title` | `.7rem`/700, wersaliki, `letter-spacing:.08em`, kolor `chrome-label-color` #5a7274, `padding:.4rem var(--chrome-sidebar-pad-x) .3rem` (.85rem). |
| `.sidebar-section ul` | Bez punktorów, `padding:0 .45rem`, kolumna flex z `gap:2px`. |
| `.sidebar-extras` | `padding:0 var(--chrome-sidebar-pad-x)`, `margin-top:.2rem`; `.mini-summary` w środku to wpuszczona karta `#ffffffd9`, promień 10px, obrys `1px solid rgba(0,131,141,.1)`, `padding:.75rem .6rem!important`, `margin:.5rem 0 0`. |
| `.has-vilda-chrome .decor-sidebar` (≥1400px) | Lustrzane szkło: promień `14px 0 0 14px`, bez prawej krawędzi, `sticky` pod paskiem, `max-height:calc(100vh - 64px - 1rem)`, `overflow-y:auto`, `padding:.5rem .6rem!important`; `.mini-summary` w środku `position:static`, tło przezroczyste, bez obrysu, `padding:.25rem 0`. |
| `.sidebar` legacy (≥992px) | `display:block`, tło `#fff!important`, promień `radius`, cień `shadow`, `padding:1rem 0`, `sticky` pod paskiem, `max-height:calc(100vh - 64px - 1rem)`, `overflow-y:auto`; poza zakresem `display:none`. |
| `.sidebar-logo` legacy | Kolumna wyśrodkowana, `padding-bottom:1rem`; `img` do 160 px z promieniem `radius`; `h1` 1.5rem w `primary`; `a` blokowe, wyśrodkowane. |
| `.decor-sidebar.decor-sidebar--has-content` legacy (≥1400px) | Tło `#fff!important`, promień `radius`, cień `shadow`, `margin:1em 0`, `padding:1rem 0`. |
| `html.vilda-pane-auth-open .desktop-layout>.sidebar` | `display:none` (panel logowania w powłoce `app.html`; siatka staje się `1fr`). |
| `aside.sidebar` (≥992px) | `view-transition-name:vilda-sidebar`. |
| `.liquid-ios26 .sidebar._enter` | Animacja wejścia szkła wyłączona (`animation:none; transform:none; opacity:1`, wszystko `!important`). |

Szkło nie ma osobnych reguł dla panelu — jego rozmycie `saturate(160%) blur(14px)` i tło `chrome-glass-bg` są wpisane w regułę bazową, więc suwak `glass-level` go nie zmienia. Wysoki kontrast i ciemne tło nie mają reguł dla paska; na `dark-bg` półprzezroczysta biel `.78` leży na `bg` #f5f5f5/#e0e0e0 i lekko szarzeje.

## Tokeny

`--chrome-sidebar-width`, `--chrome-sidebar-pad-x`, `--chrome-strip-height`, `--chrome-glass-bg`, `--chrome-glass-border`, `--chrome-glass-shadow`, `--chrome-radius-card`, `--chrome-label-color`, `--radius`, `--shadow`, `--primary`; zmienna lokalna `--chrome-active-bg` (gradient `135deg primary → secondary`, nie jest tokenem, bo zawiera `var()`).

## Zasady

- Rób: buduj pasek z modelu menu w `vilda_chrome.js` (`b[]`), a nie ręcznie — ta sama lista zasila ChromeDrawer, więc obie nawigacje muszą być identyczne.
- Rób: trzymaj `aria-label="Nawigacja boczna"` na `nav.sidebar-nav` i `aria-current="page"` na pozycji bieżącej strony; stan aktywny niesie kolor i pogrubienie, a `aria-current` czytnik ekranu.
- Rób: wszystko, co ma trafić pod nawigację (MiniSummary, skróty steroidowe), wkładaj do `.sidebar-extras`, nie do `.sidebar-nav`.
- Nie rób: nie zmieniaj `overflow:hidden` na `aside` ani `overflow-y:auto` na `.sidebar-inner` — przewija się wnętrze, a zaokrąglona krawędź zostaje.
- Nie rób: nie pokazuj paska poniżej 992 px i nie dubluj go z szufladą; nie nadawaj mu `position:fixed` — jest `sticky` wewnątrz siatki.
- Kontrast: tytuły sekcji `#5a7274` na szkle `.78` nad białym tłem dają na bieli 5.1:1 (na szkle `.78` nad białym tłem praktycznie tyle samo) przy `.7rem` wersalikach 700.
- Podgląd renderuje się przy 960 px, czyli poniżej progu 992 px, przy którym pasek istnieje: w partialu reguły desktopowe stoją bez `@media(min-width:992px)`/`(min-width:1400px)`, a reguła ukrywająca pasek ≤991px została pominięta jako układ strony. Pozycję `sticky` nadpisano w podglądzie na `static`; wariant legacy pokazano na `<body>` bez `has-sidebar` (inaczej byłby ukryty do czasu montażu), szkielet przed montażem nie jest pokazany, bo wymaga `<body>` bez `has-vilda-chrome`.

Wersja statyczna, przepisana ręcznie z src/css/vilda_chrome.css (13-16, 763-820, 895-903, 915-941, 1277-1291), src/css/sidebar.css (1-2, 12-23, 486-487, 491-510, 516-536), src/css/vilda_shell.css (162-163), src/css/style.css (4788-4791), vilda_chrome.js (funkcje Ke, Ze)
