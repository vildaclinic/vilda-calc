# EduCard

Warstwowa karta materiałów edukacyjnych: promień 24px, gradient biel–mięta, delikatne podświetlenia w rogach i białe pigułki (kicker, odznaka, rozdziały, przyciski zasobów).

## Kiedy używać

Na stronach instrukcji filmowych (`genotropin-instrukcja.html`, `ngenla-`, `omnitrope-`, `przelicznik-doposilkowy-instrukcja.html`) i na liście materiałów (`materialy-edukacyjne.html`, `body.edu-page`). Hero (`.edu-hero`) otwiera stronę kickerem i tytułem, `.edu-resource-card` jest kafelkiem zasobu w `.video-grid` (2 kolumny, ≤900px jedna), `.edu-video-shell` obudowuje odtwarzacz w ramce `.edu-video-frame`, `.edu-info-card` niesie spis sekcji `.chapter-list`, `.edu-presentation-card` — pozycję w `.presentation-list`.

## Co dostarcza konsument

- Sekcja `<section class="card edu-hero|edu-resource-card|edu-presentation-card|edu-video-shell|edu-info-card">` — klasa `card` jest wymagana: to ona włącza tło, obrys i cień (`.edu-hero.card…`), a na szkle recepturę `.liquid-ios26 .card`.
- Hero: `<span class="edu-kicker"><span class="edu-kicker-icon">SVG</span><span>Film instruktażowy</span></span>`, `h1.edu-title`, `p.edu-lead`, opcjonalnie `.edu-chip-row` z `.edu-chip` i `.edu-meta-row` z `.edu-meta-pill` (`.edu-meta-icon`).
- Kafelek: `.edu-card-top` (`.edu-card-badge`, `h3.edu-card-title`, `p.edu-card-description`) i `.resource-actions` z `<a class="resource-button primary|secondary">`; `.resource-actions.center` wyśrodkowuje.
- Odtwarzacz: `.edu-video-frame > video`; modyfikator `edu-video-shell--portrait` (max 520px, ramka `aspect-ratio: 1365 / 2048`, promień 28px, wideo `object-fit:contain`, promień 22px).
- Spis: `h2` + `<ol class="chapter-list"><li><a><span class="chapter-time">00:42</span><span>…</span></a></li>`; `p.notice` na drobne zastrzeżenie; `.breadcrumbs` nad hero.
- Na `materialy-edukacyjne.html` `<body class="liquid-ios26 has-sidebar edu-page">` przełącza literały na tokeny `--edu-*` (drabinki `glass-level-0..4`, `dark-bg-level-1..2`, `high-contrast-level-1..3`); strony instrukcji nie mają klasy `edu-page` i używają literałów. Podgląd pokazuje wariant `edu-page`.

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `.edu-hero`, `.edu-resource-card`, `.edu-presentation-card`, `.edu-video-shell`, `.edu-info-card` | `position:relative; overflow:hidden; isolation:isolate`, promień `--edu-card-radius` 24px; `.card`: tło `--edu-surface` (gradient biel→`rgba(244,251,250,.96)`), obrys `1px solid --edu-border`, cień `--edu-card-shadow` `0 16px 42px rgba(15,45,42,.08)`; `::before` dwa `radial-gradient` (`rgba(0,168,181,.12)` prawy górny, `rgba(4,120,87,.08)` lewy dolny) pod treścią |
| `.edu-hero` | padding `1.35rem 1.4rem`; pozostałe karty `1rem 1.05rem 1.1rem`; ≤700px promień 20px, padding `.95rem` |
| `.edu-kicker` | pigułka, padding `.48rem .82rem`, tło `#ffffffe6`, obrys `--edu-border-strong`, `#0f4b48` 800 `.92rem`, cień `0 8px 24px #0f2d2a0d`; ikona 1rem |
| `.edu-title` / `.edu-lead` | `clamp(1.55rem,3vw,2.25rem)/1.14` `--edu-text-strong` `#163638`, `text-wrap:balance` / `--edu-text` `#355a59`, `1.7`, max `74ch` |
| `.edu-chip`, `.edu-meta-pill` | pigułka, padding `.46rem .8rem`, tło `#ffffffe0`, obrys `rgba(22,76,71,.1)`, `#0f4b48` 700, `.92rem` / `.88rem` |
| `.edu-card-badge` | pigułka, padding `.36rem .72rem`, tło `#00a8b51f`, obrys `rgba(0,168,181,.18)`, `#0f6665` `.82rem` 800 |
| `.edu-card-title` / `.edu-card-description` | `1.14rem/1.32` `--edu-text-strong` / `#476766` `1.66` |
| `.edu-video-frame` | padding `.45rem`, promień 20px, tło `linear-gradient(180deg,#00838d14,#ffffffeb)`, obrys `rgba(0,131,141,.12)`, `inset 0 1px #ffffffb3`; `video` promień 16px, tło `#000` |
| `.resource-button` | inline-flex, min. 46px, padding `.8rem 1.1rem`, promień 14px, 700, obrys `rgba(0,131,141,.18)`, tło `#ffffffd6`, cień `0 10px 22px #0f2d2a14`; `.primary` `linear-gradient(180deg,#00b0a629,#00838d1a)`; `.secondary` `#ffffffb8`; `:hover`/`:focus-visible` `translateY(-1px)`, cień `0 14px 28px #0f2d2a1f`, obrys `#00838d47`; ≤700px pełna szerokość |
| `.chapter-list a` | flex, `gap:.75rem`, padding `.82rem .9rem`, promień 16px, tło `#ffffffe0`, obrys `rgba(22,76,71,.1)`; `:hover`/`:focus-visible` `translateY(-1px)`, tło `#fffffff5`, obrys `#00838d38`; `.chapter-time` min `3.8rem`, 800, `--primary`, `tabular-nums` |
| `.notice` / `.breadcrumbs` | `.92rem/1.55` `--edu-text-muted` `#567375` / `.95rem`, linki dziedziczą kolor, podkreślenie na `:hover` |
| `body.edu-page …` | tło `--edu-surface`, obrys `--edu-card-border-width` `--edu-border`, cień `--edu-card-shadow`, `backdrop-filter: --edu-surface-backdrop`; kicker/chipy/odznaka/przyciski/rozdziały z `--edu-kicker-*`, `--edu-chip-*`, `--edu-accent-*`, `--edu-button-*`; `:focus-visible` = cień + pierścień `0 0 0 --edu-focus-width --edu-focus-color`; `.faq-container` tło `--edu-surface-soft` |
| szkło (`.liquid-ios26 .card`) | `!important`: tło `--lg-surface-light`, obrys `1px solid --lg-border`, cień `--lg-shadow`, promień `--lg-radius` 18px, `blur(14px) saturate(115%)` — gradient `--edu-surface` i promień 24px są nadpisane na każdej stronie z `liquid-ios26`; podświetlenia `::before` zostają |
| szkło (kicker, chip, pigułka, rozdział, przycisk) | `backdrop-filter: blur(10px) saturate(120%)` |
| wysoki kontrast (`body.edu-page`) | tokeny `--edu-*` przełączone na `--hc-*`: powierzchnia `--hc-surface`, obrys `--hc-card-border-width` `--hc-border`, tekst `--hc-text`, przyciski `--hc-module-btn-*`, kontrolki bez rozmycia; dodatkowo karta `.card` przejmuje regułę wysokiego kontrastu kart |
| ciemne tło 1–2 | głębsze cienie `--edu-card-shadow` (`0 18px 46px rgba(11,27,33,.1)` / `0 20px 52px rgba(8,20,26,.13)`), obrys poziomu 2 `rgba(22,76,71,.12)` |

## Tokeny

`--edu-card-radius`, `--edu-card-shadow`, `--edu-border`, `--edu-border-strong`, `--edu-surface`, `--edu-surface-soft`, `--edu-surface-elevated`, `--edu-text-strong`, `--edu-text`, `--edu-text-muted`, `--edu-kicker-bg/-text/-shadow`, `--edu-chip-bg/-text/-shadow`, `--edu-accent-bg/-border/-text`, `--edu-button-bg/-hover-bg/-border/-shadow/-hover-shadow`, `--edu-primary-bg/-border`, `--edu-frame-bg/-border/-shadow`, `--edu-highlight-1/-2`, `--edu-surface-backdrop`, `--edu-control-backdrop`, `--edu-focus-color/-width`, `--edu-card-border-width`, `--edu-control-border-width`, `--primary`, `--lg-surface-light`, `--lg-border`, `--lg-shadow`, `--lg-radius`. Literały (strony bez `edu-page`): `#ffffffe6`, `#0f4b48`, `#ffffffe0`, `#00a8b51f`, `#0f6665`, `#476766`, `#ffffffd6`, `#0f2d2a14`, `#00838d47`, `#00838d38`, `#00b0a629`, `#00838d1a`.

## Zasady

- Rób: zawsze łącz klasę wariantu z `card`; bez niej karta nie ma tła ani obrysu, a na szkle nie dostaje receptury Liquid Glass.
- Rób: znacznik czasu rozdziału zapisuj jako `mm:ss` w `.chapter-time` i dołącz słowny tytuł — kolor marki jest tylko dodatkiem.
- Rób: nowe kolory i cienie dodawaj do drabinki `--edu-*` (`body.edu-page…`), nie jako literały, inaczej suwaki szkła, ciemnego tła i kontrastu ich nie obejmą.
- Nie rób: nie umieszczaj w kartach edukacyjnych danych pacjenta ani wyników — to treść ogólna, dostępna bez logowania.
- Nie rób: nie usuwaj `overflow:hidden`/`isolation:isolate`; bez nich podświetlenia `::before` wychodzą poza promień.
- Kontrast: `#163638` i `#355a59` na jasnym gradiencie spełniają AAA/AA; `#567375` (notka, okruszki) spełnia AA na bieli. W wysokim kontraście tekst przechodzi na `--hc-text`, a przyciski na krycie `.98`; na ciemnym tle rosną tylko cienie.

Wersja statyczna, przepisana ręcznie z edu-video-ui.css (25–98, 116–271, 309–335, 539–601; drabinki tokenów 1–10, 336–538 w tokens.css), style.css (124–129, 5157–5162), ios26-v2.css (74–80).
