# ChromeStrip

Górny pasek aplikacji: 64 px półprzezroczystej bieli z marką po lewej i wierszem chipów po prawej, montowany przez `vilda_chrome.js` w `<header>` każdej strony narzędziowej.

## Kiedy używać

Na każdej stronie aplikacji z chrome (`body.has-vilda-chrome.has-sidebar`); pasek jest jeden, na górze dokumentu, i niesie nawigację globalną (przycisk menu na telefonie, marka na desktopie) oraz status sesji (chip pacjenta, chip konta, kafelki synchronizacji, przypomnień i PRO). Nie używaj tych klas do nagłówków sekcji ani kart — to powłoka strony, nie treść.

## Co dostarcza konsument

- Na `<body>`: klasy `liquid-ios26 has-vilda-chrome has-sidebar` (skrypt dokłada je sam). Bez `has-vilda-chrome` header wraca do bazowego białego paska ze `style.css`.
- Znacznik: `<header data-vilda-chrome-mounted="1"><div data-vilda-chrome-wrap><div class="chrome-strip" data-vilda-chrome-strip>…</div><div class="chrome-mobile-brand-bar" aria-hidden="true">wagaiwzrost.pl</div></div></header>`.
- Wewnątrz `.chrome-strip`, w tej kolejności: `button.chrome-mobile-menu-btn[data-vilda-chrome-menu-btn]` (MobileTopNav), `a.chrome-brand[href="index.html"]` z `img.chrome-brand-logo` 38×38 i `span.chrome-brand-text` (`span.chrome-brand-name` „wagaiwzrost.pl”, `span.chrome-brand-tagline` „Vilda Clinic”), potem `div.chrome-chips` z plakietką PRO, kafelkami synchronizacji i przypomnień (ChromeActionButton), PatientChip i UserChip.
- Logo w aplikacji to `logo_vilda.webp`; w podglądzie osadzone jako `data:` URI.
- Stały `id` nie jest wymagany na pasku; identyfikatory niosą chipy (`#vildaPatientChip`, `#vildaUserChip`, `#vildaProBadge`, `#vildaSyncBtn`, `#vildaRemindersBtn`).

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.has-vilda-chrome header` | `position:relative`, `z-index:50`, `padding:0`, tło `chrome-glass-bg` rgba(255,255,255,.78), `backdrop-filter:saturate(160%) blur(14px)`, dolny obrys 1px `chrome-glass-border` rgba(0,131,141,.14), cień `0 1px #fff9 inset, 0 6px 18px #0046500f`. |
| `.has-sidebar header` | `min-height:var(--chrome-strip-height)` 64px, `flex-shrink:0`; ≤991px `min-height:calc(64px + 25px)` na pasek marki. |
| `≥992px` | `position:sticky; top:0`, `view-transition-name:vilda-header`; przycisk menu ukryty, marka widoczna. |
| `.chrome-strip` | `display:flex`, `gap:.75rem`, wysokość 64px, `padding:0 1rem`, `max-width:1500px`, wyśrodkowany; ≤991px `padding:0 .75rem; gap:.55rem`, ≤600px `gap:.4rem`. |
| `.chrome-brand` | `inline-flex`, `gap:.6rem`, bez podkreślenia, kolor `text`; ≤991px `display:none!important`. |
| `.chrome-brand-logo` | 38×38, `object-fit:cover`, promień 10px. |
| `.chrome-brand-name` | 700, 1.05rem, `primary` #00838d, `letter-spacing:-.01em`. |
| `.chrome-brand-tagline` | .72rem, `chrome-label-color` #5a7274, `.04em`, wersaliki. |
| `.chrome-chips` | `margin-left:auto`, `inline-flex`, `gap:.55rem`, `flex:0 1 auto`, `min-width:0`. |
| `.chrome-mobile-brand-bar` | Ukryty; ≤991px pasek 25px pod strip: .8rem/600, `.04em`, `primary`, tło `#00838d0d`, górny obrys `.5px solid rgba(0,131,141,.14)`. |
| `a:focus-visible`, `button:focus-visible` w `.has-vilda-chrome` | Obrys `2px solid primary`, odsunięcie 2px, promień 8px. |

Pod szkłem (`.liquid-ios26 header`) źródło najpierw ustawia `lg-surface-light`, `blur(18px) saturate(120%)`, promień `0 0 lg-radius lg-radius` (18px), cień `lg-shadow`, `position:sticky!important`, `z-index:200`, a zaraz potem tym samym plikiem wyłącza rozmycie i wymusza nieprzezroczysty gradient `linear-gradient(180deg,#ffffffe6,#fffc)!important`; ≤991px `position:relative!important`. Suwak Płynne szkło nie zmienia więc paska. Wysoki kontrast (`body.high-contrast-level-1/2/3.liquid-ios26 header`) podmienia tło na `hc-surface`, pełny obrys `hc-card-border-width solid hc-border`, cień `hc-shadow` i rozmycie `hc-blur`. Ciemne tło nie ma reguł dla paska — tylko tło strony pod nim ciemnieje.

Bazowe reguły `header{}` ze `style.css` (linia 25: tło `primary`, biały tekst, `text-align:center`, `padding:1rem`; linia 3124: biel, tekst `text`, obrys `#d0dede`) są w partialu, bo `text-align:center` dziedziczy się do chipów w pasku — w aplikacji etykiety w chipach są wyśrodkowane.

## Tokeny

`--chrome-strip-height`, `--chrome-glass-bg`, `--chrome-glass-border`, `--chrome-label-color`, `--primary`, `--text`, `--lg-surface-light`, `--lg-border`, `--lg-radius`, `--lg-shadow`, `--hc-surface`, `--hc-border`, `--hc-card-border-width`, `--hc-shadow`, `--hc-blur`.

## Zasady

- Rób: zachowaj kolejność dzieci paska (menu → marka → chipy); `margin-left:auto` na `.chrome-chips` zakłada, że jest ostatnim dzieckiem.
- Rób: ogranicz liczbę chipów — `.chrome-chips` ma `flex:0 1 auto` i `min-width:0`, a wartości chipów ucinają się wielokropkiem przy 180px.
- Rób: na stronach bez sidebara nie dodawaj `has-sidebar`; wtedy header nie dostaje `min-height` i nie rezerwuje miejsca na pasek marki.
- Nie rób: nie stawiaj drugiego `<header>` na stronie — nadpisania `.liquid-ios26 header` i wysokiego kontrastu działają na element, nie na klasę.
- Nie rób: nie wymuszaj `backdrop-filter` na pasku — źródło celowo je wyłącza i daje gradient, żeby tekst chipów był czytelny nad przewijaną treścią.
- Podgląd renderuje się przy 960 px, czyli w wariancie ≤991px (przycisk menu, ukryta marka, pasek marki pod strip); wariant desktopowy z logo i taglinem pojawia się od 992 px. Pozycję `sticky` nadpisano w podglądzie na `relative` (tylko pozycja).
- Kontrast (zmierzony): nazwa marki `primary` na bieli 4,5:1; tagline i etykiety chipów `#5a7274` 5,1:1; tekst paska marki `#00838d` na `#00838d0d` 4,2:1 — poniżej 4,5:1, wartość źródła. W wysokim kontraście pasek dostaje pełny obrys i cień, a nie zmienia kolorów tekstu.

Wersja statyczna, przepisana ręcznie z src/css/vilda_chrome.css (1-12, 43-81, 120-153, 456-484, 960-963, 1293-1296), src/css/ios26-v2.css (51-73), src/css/style.css (25-29, 3124-3127, 5157-5162), vilda_chrome.js (funkcja Je)
