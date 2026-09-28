# ClcrInfoButton

Okrągły przycisk „i” w nagłówku pola klirensu, który otwiera dymek pomocy `.clcr-field__help` pozycjonowany przez skrypt względem okna.

## Kiedy używać

W każdym `.clcr-field__heading` (zob. ClcrField). Skrypt `clcr_ui_workflow.js` tworzy przycisk (`createElement("button", "clcr-info-button", "i")`), ustawia `aria-label="Informacja: <nazwa pola>"`, `aria-expanded` i `aria-controls` na identyfikator dymka; kliknięcie zamyka inne dymki, otwiera własny i wylicza jego pozycję (`positionHelpTooltip`): pod przyciskiem, a gdy brakuje miejsca u dołu — nad nim z klasą `clcr-field__help--above`.

## Co dostarcza konsument

- `<button type="button" class="clcr-info-button" aria-label="Informacja: Masa ciała (kg)" aria-expanded="false|true" aria-controls="clcr-help-<id>">i</button>` jako ostatnie dziecko `.clcr-field__heading`.
- Dymek `<span class="clcr-field__help" id="clcr-help-<id>" data-clcr-help-source="field|formula" hidden>` po kontrolce pola; treść to zdanie pomocy z aplikacji (np. „Podaj kreatyninę w surowicy i wybierz jednostkę dokładnie zgodną z wynikiem laboratoryjnym.”).
- Skrypt ustawia `style="left; top"` oraz `--clcr-arrow-x` (pozycja strzałki, min. 14px, maks. szerokość − 24px).

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `.clcr-info-button` | `inline-grid` 44×44px, marginesy `-0.45rem -0.42rem -0.25rem 0` (wciąga cel dotyku w 26px nagłówka), biel, obrys 1px `--clcr-border`, promień 50%, Georgia kursywa 0.95rem/700 w `--clcr-primary-dark` |
| `:hover`, `:focus-visible`, `[aria-expanded="true"]` | biały glif, tło i obrys `--clcr-primary` |
| `:focus-visible` | outline 3px `rgba(0, 131, 141, 0.22)`, offset 2px |
| `.clcr-field__help` | `position: fixed`, z-index 1300, `pointer-events: none`, padding 10px 12px, biel, obrys 1px `--clcr-border`, górna krawędź 3px `--clcr-primary`, promień 12px, cień `0 18px 44px rgba(13, 60, 65, 0.24)`, 13px/500, interlinia 1.55; strzałka `::before` 10px obrócona 45°, `top: -7px`, `left: var(--clcr-arrow-x)` |
| `.clcr-field__help--above` | górny obrys 1px `--clcr-border`, dolna krawędź 3px `--clcr-primary`, strzałka `bottom: -7px` |
| `@media (max-width: 760px)` | przycisk w kolumnie 2 nagłówka na dwa wiersze |

W aplikacji `<body class="liquid-ios26">` nakłada na każdy `<button>` regułę szkła z `!important` (`ios26-v2.css`): przycisk ma wtedy tło `#fff3`, obrys 1px `--lg-border`, glif `#111`, promień 14px (zamiast koła), cień `0 4px 12px #0000001a` i rozmycie tła; stany `:hover` i `[aria-expanded="true"]` nie zmieniają tła ani koloru. W podglądzie dymek jest w przepływie (`position: relative`), bo źródło pozycjonuje go skryptem.

## Tokeny

`--clcr-primary`, `--clcr-primary-dark`, `--clcr-border`, `--clcr-text`; szkło `--lg-border`; wysoki kontrast `--hc-focus-width`, `--hc-focus-color`. Lokalna zmienna `--clcr-arrow-x`.

## Zasady

- Rób: zawsze podawaj `aria-label` z nazwą pola i parę `aria-expanded`/`aria-controls`; sam glif „i” nie nazywa pola.
- Rób: zachowuj 44px celu dotyku i ujemne marginesy; to one mieszczą przycisk w 26px nagłówka bez podnoszenia karty.
- Nie rób: nie umieszczaj dymka w innym miejscu niż po kontrolce w tej samej karcie; `closeAllHelp` i pozycjonowanie zakładają tę strukturę.
- Nie rób: nie nadawaj dymkowi `pointer-events`; kliknięcie „przez” dymek ma trafiać pod spód i go zamykać.
- Kontrast: glif `--clcr-primary-dark` na bieli spełnia AA; w szkle glif `#111` na `#fff3` również. W wysokim kontraście przycisk dostaje obwódkę `--hc-focus-width` `--hc-focus-color` na `:focus-visible`; tło i obrys pozostają z reguły szkła. Stan otwarty jest widoczny przez sam dymek, nie przez kolor przycisku.

Wersja statyczna, przepisana ręcznie z clcr_ui_workflow.css (1164–1227, 1335–1409, 2154–2157), clcr_ui_workflow.js (decorateField, positionHelpTooltip, closeAllHelp), ios26-v2.css (85–93), style.css (5196–5198).
