# MarketingHero

Karta wprowadzająca u góry stron informacyjnych: „O aplikacji” (`.about-hero`), Kontakt (`.contact-hero`), Subskrypcja (`.sub-hero`) i Instrukcja (`.guide-hero`) — duży zaokrąglony panel z delikatnym gradientem, odznakami i nagłówkiem skalowanym `clamp()`.

## Kiedy używać

Raz na stronę, jako pierwsza sekcja treści pod paskiem górnym: przedstawia stronę informacyjną (o aplikacji, kontakt, subskrypcja, instrukcja) i prowadzi do dalszych sekcji. Nie używaj na kartach klinicznych ani w kalkulatorze (`index.html` nie ma hero). Odnośniki wewnątrz hero to QuickLink, komunikat „Najważniejsze założenie” to Callout (`.hero-note`), kafelki pod hero instrukcji to FeatureCard.

## Co dostarcza konsument

- „O aplikacji”: `<section class="about-hero">` → `<div class="about-hero-main">` → `<div class="about-badges">` z `<span class="about-badge">` (ikona Lucide w `<span class="sidebar-icon">` + tekst), `<h2>`, `<div class="hero-copy">` z `<p class="hero-lead">` i kolejnymi `<p>`; w treści `<strong>` i `<span class="inline-label">`; na końcu sekcji `<div class="about-quick-links">` (QuickLink) i `<div class="hero-note">`. Wszystkie reguły mają prefiks `.about-page`, a wysoki kontrast wymaga `body.about-page` — klasa musi stać na `<body>`.
- Kontakt: `<section class="contact-hero">` → `<div class="contact-badges">` z `<span class="contact-badge">`, `<div class="contact-hero-main">` z `<h2>`, `<p class="hero-lead">` i `<div class="contact-actions">` (QuickLink). Reguły mają prefiks `.contact-page` (w aplikacji na `<body>`); motywy zmieniają wyłącznie tokeny `--contact-*`.
- Subskrypcja: `<section class="sub-hero" aria-labelledby="…">` → `<span class="sub-hero__pill">`, `<h1>`, `<p>`. Bez prefiksu strony. `subskrypcja.html` jako jedyna strona nie ma klasy `liquid-ios26` na `<body>`.
- Instrukcja: `<section class="guide-hero">` → `<h2 class="guide-title">` (lub `<h1>`), `<p class="guide-lead">`.
- Ikony: SVG Lucide inline wewnątrz `<span class="sidebar-icon">` (1rem × 1rem, `svg` wypełnia 100 %).
- Stany: brak interaktywnych; hero jest statyczne. `aria-label` na `.contact-badges` opisuje rząd odznak.

## Warianty i stany

| Klasa / selektor | Wygląd |
| --- | --- |
| `.about-page .about-hero` | Gradient `180deg rgba(255,255,255,0.98) → rgba(244,251,250,0.96)`, obrys `1px rgba(22, 76, 71, 0.1)`, promień 24px, cień `0 16px 42px rgba(15, 45, 42, 0.08)`, padding 1.6rem, kolumna flex z `gap 1.25rem`, `margin-bottom 1.2rem`, `overflow:hidden`, `isolation:isolate`. `::before` (z-index −1): dwa gradienty radialne — `rgba(0, 168, 181, 0.14)` u góry po prawej (do 34 %) i `rgba(4, 120, 87, 0.09)` u dołu po lewej (do 32 %). |
| `.about-hero-main` | `width:100%`, `max-width:78ch`, wyśrodkowany. |
| `.about-hero h2` | `clamp(1.75rem, 3.5vw, 2.55rem)`, `line-height 1.1`, margines `0.75rem auto 0.9rem`, `max-width 26ch`, wyśrodkowany, `text-wrap:balance`, kolor `#0f3533`. |
| `.about-hero p` / `.hero-copy` / `.hero-lead` | Akapity `#284847`, `line-height 1.72`; `.hero-copy` szerokość do 68ch, justowanie, margines `0 auto 1rem`, `p + p` odstęp 1rem; `.hero-lead` 1.07rem. `strong` w hero `#0f3533`. |
| `.about-badge` | Pigułka `inline-flex`, `gap .45rem`, padding `.5rem .8rem`, promień 999px, tło `rgba(255,255,255,0.88)`, obrys `1px rgba(0, 168, 181, 0.16)`, tekst `#0f4b48` 700, cień `0 8px 24px rgba(15, 45, 42, 0.05)`; hover `translateY(-1px)`, cień `0 12px 24px rgba(15, 45, 42, 0.08)`. Rząd `.about-badges` (flex, `gap .55rem`) w hero jest wyśrodkowany. |
| `.inline-label` | Pigułka w tekście: padding `.14rem .45rem`, tło `rgba(0, 168, 181, 0.12)`, obrys `rgba(0, 168, 181, 0.22)`, `#0a6261` 700, `white-space:nowrap`. |
| `.hero-note` | Blok pod treścią: `margin-top 1rem`, padding `1rem 1.05rem`, promień 20px, tło `rgba(8, 145, 178, 0.09)`, obrys `1px rgba(8, 145, 178, 0.18)`, justowanie; `strong` `#0f4b48`. |
| `.contact-page .contact-hero` | Tło `contact-surface`, obrys `1px contact-border`, promień 24px, cień `contact-shadow`, rozmycie `contact-surface-backdrop` (blur(16px)); padding 1.6rem, `margin-bottom 1.1rem`, `isolation:isolate`. `::before`: gradienty radialne `contact-hero-highlight-1` (do 34 %) i `contact-hero-highlight-2` (do 30 %). |
| `.contact-hero h2` | `clamp(1.8rem, 3.6vw, 2.6rem)`, `line-height 1.08`, margines `0.95rem auto 0.9rem`, `max-width 18ch`, wyśrodkowany, `text-wrap:balance`, kolor `contact-text-strong`. `.contact-hero-main` do 76ch, wyśrodkowany. |
| `.contact-page .hero-lead` | `contact-text-muted`, `line-height 1.72`, `max-width 64ch`, 1.05rem, `margin 0 auto`. `strong` w hero `contact-text-strong`. |
| `.contact-badge` | Pigułka: padding `.52rem .82rem`, tło `contact-badge-bg`, obrys `1px contact-badge-border`, tekst `contact-text-action` 700, cień `contact-card-shadow`, rozmycie `contact-control-backdrop` (blur(12px)); rząd `.contact-badges` wyśrodkowany, `gap .55rem`. Bez stanu hover. |
| `.sub-hero` | Blok bez obrysu i tła: wyśrodkowany, padding `1.5rem 1rem 2.5rem`, `max-width 660px`, margines `0 auto 2.5rem`. |
| `.sub-hero__pill` | Pigułka PRO: tło `pro-light`, tekst `pro-dark`, obrys `1px pro-border`, 0.78rem 700, wersaliki, `letter-spacing .03em`, padding `.28rem .9rem`, `margin-bottom 1.1rem`; `::before` dodaje `★` (0.7rem). |
| `.sub-hero h1` / `.sub-hero p` | `h1` `clamp(1.7rem, 4vw, 2.4rem)` 700 `#1a2e30`, `line-height 1.2`, `letter-spacing -0.02em`, margines `0 0 0.75rem`; `p` 1.05rem `#5a7274`, `line-height 1.6`, bez marginesu. |
| `.guide-hero` | Gradient `135deg rgba(0,131,141,0.12) → rgba(0,176,166,0.05)`, obrys `1px rgba(0,131,141,0.16)`, promień 18px, padding `1.1rem 1.2rem`, cień `shadow`. |
| `.guide-title` / `.guide-lead` | Tytuł `clamp(1.35rem,2.2vw,1.85rem)` `#163638`, bez marginesu; lead `#537072`, `line-height 1.55`, `margin .45rem 0 0`. |
| `≤640px` | `.about-hero` i `.contact-hero`: padding 1.1rem, promień 20px; `.about-badge` i `.contact-badge` na całą szerokość, wyśrodkowane; `.guide-hero` padding 1rem. `≤480px`: `.sub-hero` padding `1rem 0.5rem 1.75rem`. |

Wysoki kontrast (poziomy 1–3, `body.about-page.liquid-ios26`): `.about-hero` przechodzi na tło `hc-surface`, obrys `hc-card-border-width solid hc-border`, cień `hc-shadow`, tekst `hc-text`, rozmycie `hc-blur`; `::before` zmienia poświaty na `rgba(0,131,141,.08)` i `rgba(0,131,141,.05)`; `h2`, akapity i `strong` → `hc-text`; `.about-badge` i `.inline-label` → tło `hc-button-bg`, obrys `hc-card-border-width solid hc-input-border`, cień `0 6px 18px #0000000f`, ikony `#0b6a71`; `.hero-note` → `hc-result-bg`, obrys `hc-input-border`, cień `0 8px 22px #00000014`. `.guide-hero` (`body.liquid-ios26`) → `hc-surface`, `hc-border`, `hc-shadow`, `hc-blur`; tytuł `hc-text`, lead `hc-muted`. Hero kontaktowe zmienia się wyłącznie przez tokeny (`contact-surface` → `hc-surface`, poświaty `rgba(0, 131, 141, 0.08/0.05)`). `.sub-hero` nie ma reguł wysokiego kontrastu. Szkło: brak reguł `.liquid-ios26` dla hero; poziom `glass-4` podnosi krycie tokenów kontaktowych (`contact-border .84`, `contact-badge-bg .96`, cienie `0 14px 34px rgba(0, 0, 0, 0.16)`). Ciemne tło: bez reguł.

## Tokeny

`--contact-surface`, `--contact-border`, `--contact-shadow`, `--contact-surface-backdrop`, `--contact-hero-highlight-1`, `--contact-hero-highlight-2`, `--contact-text-strong`, `--contact-text-muted`, `--contact-badge-bg`, `--contact-badge-border`, `--contact-text-action`, `--contact-card-shadow`, `--contact-control-backdrop`, `--pro-light`, `--pro-dark`, `--pro-border`, `--shadow`, `--hc-surface`, `--hc-border`, `--hc-card-border-width`, `--hc-shadow`, `--hc-blur`, `--hc-text`, `--hc-muted`, `--hc-result-bg`, `--hc-input-border`, `--hc-button-bg`.

## Zasady

- Rób: jeden nagłówek na hero (`h2` w „O aplikacji” i Kontakcie, `h1` w Subskrypcji) i jeden lead; nagłówek krótki, bo `max-width 26ch`/`18ch` łamie go w 2–3 wiersze.
- Rób: odznaki z ikoną i tekstem (sam znak nie niesie treści); rząd odznak przed nagłówkiem, odnośniki po treści.
- Rób: trzymaj klasę strony (`about-page`, `contact-page`) na `<body>`, bo od niej zależą reguły bazowe i wysoki kontrast; na stronie subskrypcji nie dodawaj `liquid-ios26`.
- Nie rób: nie mieszaj wariantów (odznaka `.about-badge` w `.contact-hero` nie dostanie stylu); nie dodawaj przycisków innych niż `.contact-action`/`.about-quick-links a`; nie zmieniaj promieni (24px „O aplikacji” i Kontakt, 18px Instrukcja).
- Kontrast: nagłówki `#0f3533`/`#163638`/`#1a2e30` i akapity `#284847`/`#5a7274` na niemal białym tle (zmierzone: `#0f3533` 12,7:1, `#284847` 9,5:1, `#0f4b48` w odznace 9,9:1, `#7700cc` w pigułce PRO 7,0:1, `#537072` w leadzie instrukcji 4,6:1); poświaty `::before` są dekoracją i nie mogą nieść informacji. Akcja główna hero kontaktowego (`.contact-action.primary`, QuickLink) ma w źródle biały tekst na gradiencie `#0891b2 → #14b8a6` — 3,68:1 / 2,49:1, poniżej 4,5:1; wartość z aplikacji, nie zmieniana.
- Na szkle hero zachowuje własne, prawie kryjące tła (nie korzysta z `lg-surface-light`); w wysokim kontraście gradienty ustępują `hc-surface`, a poświaty bledną do turkusu `rgba(0,131,141,.08)`.

Wersja statyczna, przepisana ręcznie z src/html-styles/o-aplikacji.css (10-74, 75-84, 103-168, 170-198, 209-298, 987-989, 1024-1043), src/html-styles/kontakt.css (347-356, 371-536, 1303-1323), src/html-styles/subskrypcja.css (37-119, 1532-1536), src/html-styles/instrukcja.css (13-45, 622-626), src/css/style.css (5235-5240, 5254-5262, 5300-5305, 5321-5327, 5335-5348)
