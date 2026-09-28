# EduChip

Wiersz pigułek tematycznych pod leadem strony edukacyjnej: półprzezroczysta biel `#ffffffe0`, obrys `1px solid rgba(22,76,71,.1)`, tekst `#0f4b48` .92rem/700, delikatny cień `0 8px 24px #0f2d2a0a`, ikona Lucide 1rem, odstęp `.65rem` między chipami.

## Kiedy używać

Do 2–5 słów kluczowych opisujących materiał („Cukrzyca typu 1”, „Wzór 1800/DDI”, „Węglowodany i insulina”) tuż pod `.edu-lead` w hero, a także pod nagłówkiem `.edu-info-card` jako lista tego, co pokazuje film („Ocena glikemii przed i po posiłku”, „Kiedy dodać brakującą insulinę”). Chipy są nieinteraktywne — nie filtrują i nie linkują. Do metadanych (czas, rozmiar pliku) użyj MetaPill; do typu materiału nad tytułem EduKicker; do chipów kart klinicznych Chip.

## Co dostarcza konsument

- `<div class="edu-chip-row">` (flex, `flex-wrap`, `gap:.65rem`, `margin-top:1rem`) z `<span class="edu-chip"><span class="edu-chip-icon">[SVG]</span><span>Tekst</span></span>`.
- Ikona 1rem×1rem w `.edu-chip-icon` (`line-height:0`, SVG 100%, `stroke="currentColor"`); w aplikacji `data-lucide="activity|calculator|syringe|info|plus-circle|minus-circle"`.
- Pod `body.edu-page` chip bierze tło `--edu-chip-bg`, obrys `--edu-control-border-width solid --edu-border`, kolor `--edu-chip-text`, cień `--edu-chip-shadow` i `backdrop-filter:--edu-control-backdrop`.
- Ta sama wizualnie pigułka powtarza się na stronach marketingowych jako `.about-chip` / `.about-badge` (MarketingBadge).

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.edu-chip-row` | `display:flex; flex-wrap:wrap; gap:.65rem; margin-top:1rem`. |
| `.edu-chip` | `inline-flex`, `gap:.45rem`, promień 999px, `nowrap`, `padding:.46rem .8rem`, tło `#ffffffe0`, obrys `1px solid rgba(22,76,71,.1)`, tekst `#0f4b48` 700, .92rem, cień `0 8px 24px #0f2d2a0a`. |
| `.edu-chip-icon` | 1rem×1rem, `flex:0 0 auto`, `line-height:0`; `svg` 100%/100%. |
| `body.edu-page .edu-chip` | Tło `--edu-chip-bg` (`rgba(255,255,255,.78)` light, `.95` glass-4), obrys `--edu-control-border-width solid --edu-border`, tekst `--edu-chip-text` `#0f4b48`, cień `--edu-chip-shadow`, `backdrop-filter:--edu-control-backdrop`. |
| `.liquid-ios26 .edu-chip` | `backdrop-filter:blur(10px) saturate(120%)`. |
| Wysoki kontrast (tokeny) | `--edu-chip-bg`→`--hc-button-bg`, `--edu-chip-text`→`--hc-text`, `--edu-chip-shadow`→`--hc-module-btn-shadow`, `--edu-border`→`--hc-border`, grubość `--hc-card-border-width`. |
| Ciemne tło (tokeny) | Cień `--edu-chip-shadow` `0 10px 24px rgba(11,27,33,.06)` / `0 10px 26px rgba(8,20,26,.08)`. |

Brak stanów `:hover`/`:focus`.

## Tokeny

`--edu-chip-bg`, `--edu-chip-text`, `--edu-chip-shadow`, `--edu-border`, `--edu-control-border-width`, `--edu-control-backdrop`; literały `#ffffffe0`, `rgba(22,76,71,.1)`, `#0f4b48`, `#0f2d2a0a`.

## Zasady

- Rób: każdy chip z ikoną i 1–5 słowami; wiersz zawija się sam (`flex-wrap`).
- Rób: trzymaj chipy w `.edu-chip-row` — `margin-top:1rem` odsuwa je od leadu.
- Nie rób: nie czyń chipów klikalnymi ani nie dodawaj stanu „wybrany” — do filtrów służy SegmentedControl.
- Nie rób: nie mieszaj `.edu-chip` z `.edu-meta-pill` w jednym wierszu; różnią się rozmiarem (.92rem vs .88rem) i rolą.
- Kontrast: `#0f4b48` na tle o kryciu ≥78% ma 9,9:1; w wysokim kontraście obrys grubieje i tło przechodzi na `--hc-button-bg`.

Wersja statyczna, przepisana ręcznie z src/css/edu-video-ui.css (43-48, 58-69, 82-99, 333-335, 559-565), przelicznik-doposilkowy-instrukcja.html (166-170, 186-192)
