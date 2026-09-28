# EduKicker

Etykieta nad tytułem hero strony edukacyjnej: pigułka 999px o prawie białym wypełnieniu `#ffffffe6`, obrysie `1px solid --edu-border-strong`, ciemnoturkusowym tekście `#0f4b48` .92rem/800, miękkim cieniu `0 8px 24px #0f2d2a0d` i ikonie Lucide 1rem przed tekstem.

## Kiedy używać

Jako pierwszy element `.edu-hero` (nad `.edu-title`), gdy trzeba nazwać typ materiału: „Film instruktażowy”, „Materiał edukacyjny”, „Instrukcja krok po kroku”. Jeden kicker na hero. Do tagów tematycznych pod leadem użyj EduChip, do metadanych filmu MetaPill, do odznak na kartach listy EduCard (`.edu-card-badge`).

## Co dostarcza konsument

- `<span class="edu-kicker"><span class="edu-kicker-icon">[SVG Lucide 24, stroke="currentColor"]</span><span>Tekst</span></span>`; w aplikacji ikonę wstawia `data-lucide="play"`.
- `.edu-kicker` ma `align-self:flex-start` — w kolumnie flex hero nie rozciąga się na szerokość.
- Ikona: kontener 1rem×1rem, `line-height:0`; SVG wypełnia 100% i dziedziczy kolor tekstu.
- Strona edukacyjna ma klasę `body.edu-page` (ustawia ją `edu-video-ui.css` przez tokeny) — wtedy kicker bierze tło, obrys, kolor i cień z tokenów `--edu-kicker-*`, `--edu-control-border-width`, `--edu-control-backdrop`; bez tej klasy działa wersja literałowa.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.edu-kicker` | `inline-flex`, `gap:.45rem`, `padding:.48rem .82rem`, promień 999px, `nowrap`; tło `#ffffffe6`, obrys `1px solid --edu-border-strong` (`rgba(255,255,255,.4)` w motywie light, `rgba(0,131,141,.18)` na stronie bez tokenów), tekst `#0f4b48` .92rem/800, cień `0 8px 24px #0f2d2a0d`. |
| `.edu-kicker-icon` | 1rem×1rem, `inline-flex`, `flex:0 0 auto`, `line-height:0`; `svg` 100%/100%, `display:block`. |
| `body.edu-page .edu-kicker` | Tło `--edu-kicker-bg` (`rgba(255,255,255,.8)` light, `.96` glass-4), obrys `--edu-control-border-width solid --edu-border-strong`, tekst `--edu-kicker-text` `#0f4b48`, cień `--edu-kicker-shadow`, `backdrop-filter:--edu-control-backdrop`. |
| `.liquid-ios26 .edu-kicker` | `backdrop-filter:blur(10px) saturate(120%)`. |
| Wysoki kontrast (tokeny) | `--edu-kicker-bg`→`--hc-button-bg`, `--edu-kicker-text`→`--hc-text`, `--edu-kicker-shadow`→`--hc-module-btn-shadow`, obrys `--hc-card-border-width solid --hc-module-btn-border`. |
| Ciemne tło (tokeny) | Tylko cień: `--edu-kicker-shadow` `0 10px 26px rgba(11,27,33,.07)` (poziom 1) / `0 10px 28px rgba(8,20,26,.09)` (poziom 2). |

Brak stanów interakcji — kicker jest etykietą statyczną.

## Tokeny

`--edu-border-strong`, `--edu-kicker-bg`, `--edu-kicker-text`, `--edu-kicker-shadow`, `--edu-control-border-width`, `--edu-control-backdrop`; literały `#ffffffe6`, `#0f4b48`, `#0f2d2a0d`.

## Zasady

- Rób: zawsze ikona + tekst; ikona sama nie niesie znaczenia (`aria-hidden` na SVG).
- Rób: krótki rzeczownik typu materiału (2–4 słowa); kicker nie łamie wiersza.
- Nie rób: nie umieszczaj kickera w `<a>` ani `<button>` — do nawigacji służy `.resource-button`.
- Nie rób: nie nadpisuj koloru tekstu — w wysokim kontraście przechodzi na `--hc-text`, a obrys grubieje do `--hc-card-border-width`.
- Kontrast: `#0f4b48` na tle o kryciu 80% 9,9:1; na szkle tło ma ≥80% krycia, więc kontrast nie spada.

Wersja statyczna, przepisana ręcznie z src/css/edu-video-ui.css (43-69, 333-335, 552-558), genotropin-instrukcja.html (203)
