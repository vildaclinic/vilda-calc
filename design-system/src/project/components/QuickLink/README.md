# QuickLink

Odnośniki nawigacyjne i wezwania do działania stron informacyjnych: pigułki „O aplikacji” (`.about-quick-links a`), karty-odnośniki (`.about-link-card`, `.contact-link-card`), akcje kontaktowe (`.contact-action`, `.primary`) i karty metod kontaktu (`.contact-method`) — półprzezroczysta biel, promień 18–20px, ciemnoturkusowy tekst 700–800, uniesienie o 1px po najechaniu.

## Kiedy używać

Do przejść w obrębie strony (kotwice `#jak-to-dziala`), do innych podstron (`instrukcja.html`) i do kontaktu (`mailto:`, strona zewnętrzna). Jedna akcja główna na hero kontaktowe (`.contact-action.primary`). Do przycisków wykonujących operacje użyj Button; do kafelków treści FeatureCard.

## Co dostarcza konsument

- Pigułki: `<div class="about-quick-links">` z czterema `<a href="#…">`; odnośnik do zastrzeżeń dostaje klasę `warning-link`. Wymaga `body.about-page`. Siatka 4 kolumn (≤780px 2, ≤640px 1).
- Karty-odnośniki: `<div class="about-link-grid">` → `<a class="about-link-card">` z `<span class="sidebar-icon">` (ikona), `<span>` (etykieta), `<span class="sidebar-icon">` (strzałka `arrow-right`).
- Akcje kontaktowe: `<div class="contact-actions">` → `<a class="contact-action primary">` i `<a class="contact-action">`, każda z `<span class="sidebar-icon">` i `<span>` z tekstem. Odnośnik zewnętrzny z `target="_blank" rel="noopener noreferrer"`.
- Metody kontaktu: `<div class="contact-methods">` → `<a class="contact-method">` z `<span class="contact-method-head">` (ikona + nazwa), `<span class="contact-method-value">` i opcjonalnymi `<span class="contact-method-label">`, `<span class="contact-method-note">`.
- Karty kontaktowe: `<div class="contact-link-grid">` → `<a class="contact-link-card">` (ikona, etykieta, strzałka).
- Reguły kontaktowe wymagają przodka `.contact-page` (w aplikacji `<body>`); motywy zmieniają tylko tokeny `--contact-*`.
- Stany: `:hover`, `:focus-visible` (pierścień tylko w wariantach kontaktowych), brak stanu wyłączonego.

## Warianty i stany

| Klasa / selektor | Wygląd |
| --- | --- |
| `.about-page .about-quick-links a` | Pigułka jak `.about-badge`: `inline-flex`, `gap .45rem`, padding `.5rem .8rem`, promień 999px, tło `rgba(255,255,255,0.88)`, obrys `1px rgba(0, 168, 181, 0.16)`, `#0f4b48` 700, cień `0 8px 24px rgba(15, 45, 42, 0.05)`; dodatkowo wyśrodkowana, `min-height 3rem`, `width 100%`. Siatka `repeat(4, minmax(0, 1fr))`, `gap .75rem`, `margin 1rem 0 0`. |
| `a:hover` (pigułka i `.about-link-card`) | `translateY(-1px)`, cień `0 12px 24px rgba(15, 45, 42, 0.08)`. |
| `a.warning-link` | Gradient `180deg rgba(255,255,255,0.98) → rgba(255,248,240,0.96)`, obrys `rgba(180, 83, 9, 0.16)`, tekst `#8a3d0a`; hover cień `0 12px 24px rgba(138, 61, 10, 0.12)`. |
| `.about-page .about-link-card` | Siatka `auto 1fr auto`, `gap .8rem`, padding `.95rem 1rem`, promień 18px, obrys `1px rgba(0, 168, 181, 0.16)`, tło `rgba(255,255,255,0.9)`, `#0f4b48` 700; ikony 1rem `#0891b2`. `.about-link-grid`: auto-fit od 180px, `gap .8rem`, `margin-top .9rem`. |
| `.contact-page .contact-action` | `inline-flex` wyśrodkowany, `gap .55rem`, `min-height 3.2rem`, padding `.82rem 1.15rem`, promień 18px, obrys `1px contact-border-strong`, tło `contact-surface-elevated`, tekst `contact-text-action` 800, cień `contact-card-shadow`, rozmycie `contact-control-backdrop`. Rząd `.contact-actions`: flex wyśrodkowany, `gap .75rem`, `margin-top 1.15rem`. |
| `.contact-action.primary` | Tło `contact-primary-bg` (gradient `135deg #0891b2 → #14b8a6`), tekst `contact-primary-text` (#ffffff), obrys `contact-primary-border` (przezroczysty), cień `contact-primary-shadow` (`0 14px 26px rgba(8, 145, 178, 0.24)`). |
| `:hover` / `:focus-visible` (kontakt) | `translateY(-1px)`, cień `contact-hover-shadow`, tło `contact-surface-soft`, obrys `contact-border-strong`, `outline:none`; `.primary` zachowuje gradient i dostaje `contact-primary-hover-shadow`. `:focus-visible` dokłada pierścień `0 0 0 contact-focus-width contact-focus-ring` (2px, `rgba(8, 145, 178, 0.24)`). |
| `.contact-page .contact-method` | Blok: padding `1rem 1.05rem`, promień 20px, tło `contact-surface-elevated`, obrys `1px contact-border`, tekst `contact-text`, `min-height 100%`, cień `contact-card-shadow`, rozmycie. Nagłówek 800 `contact-text-action` z ikoną 1.05rem w `contact-icon`; etykieta `.9rem` `contact-text-subtle`; wartość 1rem 700 `contact-text`, `overflow-wrap:anywhere`; notatka `.9rem` `contact-text-soft`, `line-height 1.55`. Siatka `.contact-methods`: 2 kolumny, `gap .85rem` (≤780px 1 kolumna). |
| `.contact-page .contact-link-card` | Jak `.about-link-card`, ale tło `contact-surface-elevated`, obrys `contact-border-strong`, tekst `contact-text-action` 800, cień `contact-card-shadow`, rozmycie; pierwsza ikona `contact-icon`. Siatka `.contact-link-grid`: `gap .75rem`. |
| `≤640px` | Pigułki i `.contact-action` na całą szerokość, wyśrodkowane; `.about-quick-links` w 1 kolumnie. |

Wysoki kontrast (poziomy 1–3, `body.about-page.liquid-ios26`): pigułki i `.about-link-card` → tło `hc-module-btn-bg`, tekst `hc-text`, obrys `hc-card-border-width solid hc-module-btn-border`, cień `hc-module-btn-shadow`, bez rozmycia; hover `hc-module-btn-hover-bg`; ikony `#0b6a71`; `warning-link` → gradient `#fffcf8fc → #fff6eef7`, obrys `#b4530942`, tekst `#7c360a`, hover gradient `#fffefb → #fff9f2fa`. Warianty kontaktowe zmieniają się przez tokeny: `contact-surface-elevated` → `hc-module-btn-bg`, `contact-surface-soft` → `hc-module-btn-hover-bg`, `contact-focus-ring` → `hc-focus-color`. Szkło: brak reguł `.liquid-ios26`; `glass-4` podnosi tokeny kontaktowe (`contact-surface-elevated .96`, `contact-border-strong .90`, `contact-card-shadow 0 14px 34px rgba(0, 0, 0, 0.16)`, `contact-hover-shadow 0 18px 36px rgba(0, 0, 0, 0.18)`). Ciemne tło: bez reguł.

## Tokeny

`--contact-border`, `--contact-border-strong`, `--contact-surface-elevated`, `--contact-surface-soft`, `--contact-text`, `--contact-text-action`, `--contact-text-subtle`, `--contact-text-soft`, `--contact-icon`, `--contact-card-shadow`, `--contact-hover-shadow`, `--contact-control-backdrop`, `--contact-primary-bg`, `--contact-primary-text`, `--contact-primary-border`, `--contact-primary-shadow`, `--contact-primary-hover-shadow`, `--contact-focus-ring`, `--contact-focus-width`, `--hc-text`, `--hc-card-border-width`, `--hc-module-btn-bg`, `--hc-module-btn-border`, `--hc-module-btn-shadow`, `--hc-module-btn-hover-bg`.

## Zasady

- Rób: etykieta nazywa cel („Instrukcja obsługi”, „Napisz e‑mail”), ikona z lewej, strzałka z prawej tylko w kartach-odnośnikach; jedna akcja `.primary` na widok.
- Rób: `warning-link` wyłącznie dla zastrzeżeń i ostrzeżeń, zawsze z tekstem, bo kolor `#8a3d0a` sam nie wystarczy.
- Rób: odnośniki zewnętrzne z `rel="noopener noreferrer"`; adres e‑mail jako `mailto:`; wartość w `.contact-method-value` dosłowna (łamie się `overflow-wrap:anywhere`).
- Nie rób: nie umieszczaj `.about-quick-links` poza `body.about-page` ani `.contact-*` poza `.contact-page`; nie dodawaj piątej pigułki (siatka ma 4 kolumny); nie używaj `.contact-action` jako `<button>` (reguła globalna przycisku zmieni jego tło).
- Kontrast: `#0f4b48` na bieli 88–92 % daje 9,9:1. Biały tekst `.contact-action.primary` na gradiencie `#0891b2 → #14b8a6` ma w źródle tylko 3,68:1 przy `#0891b2` i 2,49:1 przy `#14b8a6` (poniżej 4,5:1) — wartości pochodzą z aplikacji i nie są tu zmieniane; nie opieraj na tej akcji treści, której nie ma obok w innej formie. Pierścień fokusa istnieje tylko w wariantach kontaktowych — pigułki „O aplikacji” polegają na obrysie przeglądarki.
- Na szkle karty pozostają niemal białe; w wysokim kontraście obrys grubieje do `hc-card-border-width`, rozmycie znika, a kolory pochodzą z `hc-module-btn-*`.

Wersja statyczna, przepisana ręcznie z src/html-styles/o-aplikacji.css (86-131, 678-750, 752-781, 990-996, 1006-1022, 1061-1077), src/html-styles/kontakt.css (403-481, 537-655, 727-841, 1165-1225, 1291-1296, 1325-1333), src/css/style.css (5314-5320, 5328-5334, 5340-5345, 5349-5350)
