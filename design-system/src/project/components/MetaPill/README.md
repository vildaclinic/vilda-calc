# MetaPill

Mała pigułka metadanych pod ramką filmu lub materiału (czas trwania, rozmiar pliku, format): półprzezroczysta biel `#ffffffe0`, obrys `1px solid rgba(22,76,71,.1)`, tekst `#0f4b48` .88rem/700 i ikona Lucide 1rem — dzieli z EduChip każdą deklarację poza rozmiarem czcionki.

## Kiedy używać

W `.edu-meta-row` pod `.edu-video-shell` lub kartą zasobu, do 1–3 faktów o pliku: „Czas filmu: 03:05”, „PDF, 2 MB”, „Napisy: polski”. Do tagów tematycznych w hero użyj EduChip (większy, .92rem), do typu materiału EduKicker. Podobne pigułki innych stron (`.settings-mini-chip`, `.clcr-ident-badge`, `.guide-module-badge`, `.sub-hero__pill`) mają własne reguły.

## Co dostarcza konsument

- `<div class="edu-meta-row">` (flex, `flex-wrap`, `gap:.65rem`, bez marginesu górnego) z `<span class="edu-meta-pill"><span class="edu-meta-icon">[SVG]</span><span>Tekst</span></span>`.
- Ikona w `.edu-meta-icon` 1rem×1rem, `line-height:0`, SVG `stroke="currentColor"`; w aplikacji `data-lucide="activity|file-text"`.
- Pod `body.edu-page` pigułka używa tokenów `--edu-chip-*` (wspólnych z EduChip).

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.edu-meta-row` | `display:flex; flex-wrap:wrap; gap:.65rem`. |
| `.edu-meta-pill` | `inline-flex`, `gap:.45rem`, promień 999px, `nowrap`, `padding:.46rem .8rem`, tło `#ffffffe0`, obrys `1px solid rgba(22,76,71,.1)`, tekst `#0f4b48` 700, **.88rem**, cień `0 8px 24px #0f2d2a0a`. |
| `.edu-meta-icon` | 1rem×1rem, `flex:0 0 auto`, `line-height:0`; `svg` 100%/100%. |
| `body.edu-page .edu-meta-pill` | Tło `--edu-chip-bg`, obrys `--edu-control-border-width solid --edu-border`, tekst `--edu-chip-text`, cień `--edu-chip-shadow`, `backdrop-filter:--edu-control-backdrop`. |
| `.liquid-ios26 .edu-meta-pill` | `backdrop-filter:blur(10px) saturate(120%)`. |
| Wysoki kontrast / ciemne tło | Jak EduChip — przez tokeny `--edu-chip-*`, `--edu-border`, `--hc-card-border-width`. |

Brak stanów interakcji.

## Tokeny

`--edu-chip-bg`, `--edu-chip-text`, `--edu-chip-shadow`, `--edu-border`, `--edu-control-border-width`, `--edu-control-backdrop`; literały `#ffffffe0`, `rgba(22,76,71,.1)`, `#0f4b48`, `#0f2d2a0a`.

## Zasady

- Rób: format „Etykieta: wartość” („Czas filmu: 03:05”) albo „Format, rozmiar” („PDF, 2 MB”); wartości liczbowe po polsku (przecinek dziesiętny).
- Rób: ikona pasująca do faktu (`activity` czas, `file-text` plik); SVG z `aria-hidden`.
- Nie rób: nie wkładaj do pigułki linku pobierania — do tego służy `.resource-button`.
- Nie rób: nie zmieniaj rozmiaru czcionki, żeby „dopasować” do EduChip — różnica .88/.92rem jest celowa.
- Kontrast: identyczny jak EduChip (`#0f4b48` na ≥78% bieli, 9,9:1).

Wersja statyczna, przepisana ręcznie z src/css/edu-video-ui.css (43-48, 58-69, 82-99, 333-335, 559-565), genotropin-instrukcja.html (216)
