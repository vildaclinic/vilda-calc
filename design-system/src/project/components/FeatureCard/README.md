# FeatureCard

Karty treści stron informacyjnych: kafelek podstrony w instrukcji (`.guide-tile`), numerowany krok „Jak to działa” (`.flow-steps li`) i karta-odnośnik z ikoną (`.about-link-card`) — białe lub mleczne powierzchnie z promieniem 18–20px, cienkim turkusowym obrysem i długim miękkim cieniem.

## Kiedy używać

Do prezentacji funkcji, kroków i przejść na stronach „O aplikacji” i Instrukcja. `.guide-tile` jest przyciskiem rozwijającym listę modułów (stan `is-active`), `.flow-steps` opisuje kolejność działań, `.about-link-card` prowadzi do innej podstrony. Do nawigacji w obrębie strony użyj QuickLink, do kart klinicznych z wynikami komponentów grupy „Powierzchnie”.

## Co dostarcza konsument

- Kafelek: `<button type="button" class="guide-tile" data-guide-page="…">` → `<div class="guide-tile-top">` z `<span class="guide-tile-icon" aria-hidden="true">` (SVG Lucide) i opcjonalnym `<span class="guide-tile-count">`, potem `<h3 class="guide-tile-title">`, `<p class="guide-tile-copy">`, `<div class="guide-tile-footer"><span>…</span></div>`. Kafelki leżą w `<div class="guide-tile-grid">` (1 kolumna; od 700px 2; od 1180px 3, a samotny ostatni kafelek w środkowej kolumnie). Stan rozwinięcia: klasa `is-active` + `aria-expanded="true"` i zmieniony tekst stopki („Zwiń moduły”).
- Odznaki modułu (w rozwiniętych szczegółach): `<div class="guide-module-meta">` z `<span class="guide-module-badge guide-module-badge-user|-doctor|-shared">`.
- Kroki: `<ol class="flow-steps"><li><strong>Tytuł</strong> — opis.</li>…</ol>`; numer rysuje `::before` z licznika `aboutStep`. Wymaga `body.about-page`.
- Karta-odnośnik: `<a class="about-link-card" href="…">` z trzema dziećmi: `<span class="sidebar-icon">` (ikona), `<span>` (etykieta), `<span class="sidebar-icon">` (strzałka). Siatka `<div class="about-link-grid">` (auto-fit, min 180px). Wymaga `body.about-page`.
- Strona instrukcji ma `body.liquid-ios26`, więc kafelek podlega globalnej regule szkła przycisków (patrz tabela).

## Warianty i stany

| Klasa / selektor | Wygląd |
| --- | --- |
| `.guide-tile` (reguła własna) | `width:100%`, `min-height:176px`, obrys `1px rgba(0,131,141,0.16)`, promień 18px, padding 1.1rem, gradient `180deg #ffffff → #f7fbfb`, cień `0 12px 30px rgba(0,0,0,0.06)`, `display:grid` z `gap .75rem`, tekst do lewej, `cursor:pointer`, przejście `.18s` (transform, cień, obrys, tło). |
| `.guide-tile` pod `body.liquid-ios26` (jak w aplikacji) | Globalna reguła `.liquid-ios26 button` z `!important` nadpisuje tło na `#fff3`, obrys na `1px lg-border`, kolor na `#111`, promień na 14px, rozmycie `blur(10px) saturate(120%)` i cień `0 4px 12px #0000001a`; zostają siatka, padding, min-height i `text-align:left`. |
| `.guide-tile:hover` | `translateY(-2px)`, cień `0 18px 42px rgba(0,0,0,0.09)`, obrys `rgba(0,131,141,0.24)` (pod szkłem cień i obrys pozostają szklane). |
| `.guide-tile:focus-visible` | `outline: 3px solid rgba(0,176,166,0.34)`, `outline-offset: 3px`. |
| `.guide-tile.is-active` | Obrys `rgba(0,131,141,0.34)`, gradient `#ffffff → rgba(0,176,166,0.08)`, cień `0 18px 42px rgba(0,0,0,0.09)`; pod szkłem widoczny tylko przez tekst stopki i wysoki kontrast. |
| `.guide-tile-icon` | 46×46px, promień 14px, tło `rgba(0,131,141,0.1)`, kolor `primary`, `inline-flex` wyśrodkowany. `.guide-tile-top` to flex z `gap .75rem`. |
| `.guide-tile-count` | Pigułka: padding `.28rem .65rem`, promień 999px, obrys `1px rgba(0,131,141,0.15)`, białe tło, `primary` 800, `.82rem`, `min-height 2rem`. |
| `.guide-tile-title` / `.guide-tile-copy` / `.guide-tile-footer` | Tytuł 1.12rem 800 `#163638`; opis `.94rem` `#557174`, `line-height 1.5`; stopka `margin-top:auto`, wyrównana do prawej, `.9rem` 800 `primary`. |
| `.guide-module-badge` | `min-height 1.7rem`, padding `.22rem .62rem`, promień 999px, `.76rem` 800, `letter-spacing .01em`, obrys `1px rgba(0,131,141,0.14)`, białe tło, `#31585b`. `-user`: tło `rgba(0,176,166,0.08)`, obrys `rgba(0,131,141,0.18)`, `#0b6b72`; `-doctor`: tło `rgba(153,0,255,0.08)`, obrys `rgba(153,0,255,0.18)`, `#7b2cbf`; `-shared`: tło `rgba(0,131,141,0.06)`, `#31585b`. Rząd `.guide-module-meta`: flex, `gap .45rem`, `margin 0 0 .7rem`. |
| `.about-page .flow-steps li` | `padding 1rem 1rem 1rem 3.25rem`, promień 20px, tło `rgba(255,255,255,0.88)`, obrys `1px rgba(22, 76, 71, 0.1)`; lista bez punktorów, siatka z `gap .9rem`. `::before`: numer w kole 1.6rem (`left 1rem`, `top 1rem`), gradient `135deg #0891b2 → #14b8a6`, biały 800, cień `0 10px 20px rgba(8, 145, 178, 0.22)`. |
| `.about-page .about-link-card` | Siatka `auto 1fr auto`, `gap .8rem`, padding `.95rem 1rem`, promień 18px, obrys `1px rgba(0, 168, 181, 0.16)`, tło `rgba(255,255,255,0.9)`, `#0f4b48` 700, bez podkreślenia; ikony 1rem w `#0891b2`; etykieta `line-height 1.25`. Hover: `translateY(-1px)`, cień `0 12px 24px rgba(15, 45, 42, 0.08)`. `.about-link-grid`: `repeat(auto-fit, minmax(180px, 1fr))`, `gap .8rem`, `margin-top .9rem`. |

Wysoki kontrast (poziomy 1–3, `body.liquid-ios26`): `.guide-tile` → tło `hc-module-btn-bg`, tekst `hc-text`, obrys `hc-card-border-width solid hc-module-btn-border`, cień `hc-module-btn-shadow`, bez rozmycia; hover `hc-module-btn-hover-bg`; `is-active` → `hc-module-btn-active-bg`, obrys `hc-module-btn-active-border`, cień `0 0 0 1px #00838d1a` + `hc-module-btn-active-shadow`; ikona tło `#ffffffdb` z obrysem `hc-input-border`; licznik i odznaki → `hc-button-bg`, obrys `hc-input-border`, cień `0 4px 12px #0000000f`; tytuł i stopka `hc-text`, opis `hc-muted`; odznaki `-user` `#00b0a61f`/`#00838d38`/`#0b5e65`, `-doctor` `#9900ff1a`/`#7b2cbf38`/`#5f3388`, `-shared` `#00838d14`/`#07363e2e`. Pod `body.about-page.liquid-ios26`: `.flow-steps li` → `hc-surface`, `hc-border`, `hc-shadow`, `hc-text`, `hc-blur`, licznik gradient `#00838de6 → #14b8a6e0` z cieniem `0 10px 20px #00838d2e`; `.about-link-card` → `hc-module-btn-bg`, `hc-text`, `hc-module-btn-border`, `hc-module-btn-shadow`, ikony `#0b6a71`, hover `hc-module-btn-hover-bg`. Ciemne tło: bez reguł.

## Tokeny

`--primary`, `--radius`, `--secondary`, `--shadow`, `--shadow-l`, `--lg-border`, `--hc-text`, `--hc-muted`, `--hc-surface`, `--hc-border`, `--hc-shadow`, `--hc-blur`, `--hc-card-border-width`, `--hc-input-border`, `--hc-button-bg`, `--hc-module-btn-bg`, `--hc-module-btn-border`, `--hc-module-btn-shadow`, `--hc-module-btn-hover-bg`, `--hc-module-btn-active-bg`, `--hc-module-btn-active-border`, `--hc-module-btn-active-shadow`.

## Zasady

- Rób: stan rozwinięcia sygnalizuj tekstem stopki („Rozwiń moduły” / „Zwiń moduły”) i `aria-expanded`, bo pod szkłem różnica tła `is-active` znika.
- Rób: jedna ikona Lucide na kafelek, tytuł do trzech słów, opis jednozdaniowy; w kroku `strong` na początku zdania.
- Rób: kafelki tylko w `.guide-tile-grid`, kroki tylko w `ol.flow-steps` pod `body.about-page`.
- Nie rób: nie zamieniaj `.guide-tile` na `<a>` ani `<div>` — to przycisk i tak ma działać klawiaturą; nie dodawaj własnych numerów w treści kroku (numer rysuje `::before`).
- Nie rób: nie usuwaj `type="button"` i nie dokładaj klas przycisków z innych grup.
- Kontrast: tytuł `#163638` (13:1) i tekst `#557174` (5,3:1) na białym gradiencie; stopka i licznik w `primary` (#00838d) mają 4,53:1 na bieli i są jedynym akcentem — nie używaj ich do treści. Biały numer kroku `.flow-steps li::before` na gradiencie `#0891b2 → #14b8a6` ma w źródle 3,68:1 / 2,49:1 (poniżej 4,5:1) — wartość z aplikacji, nie zmieniana; numer jest dekoracją, kolejność niesie treść `<strong>`.
- Na szkle kafelek to karta `#fff3` z rozmyciem i promieniem 14px; w wysokim kontraście rozmycie znika, a obrys i cień pochodzą z zestawu `hc-module-btn-*`.

Wersja statyczna, przepisana ręcznie z src/html-styles/instrukcja.css (47-83, 85-253, 532-602), src/html-styles/o-aplikacji.css (543-608, 678-750, 990-996), src/css/style.css (569-583, 631-635, 659-663, 5241-5262, 5300-5305, 5314-5320, 5328-5334, 5349-5350, 5355-5358), src/css/ios26-v2.css (85-98)
