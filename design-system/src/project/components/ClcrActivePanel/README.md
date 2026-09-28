# ClcrActivePanel

Powłoka kalkulatora klirensu: biała karta przepływu z tealowym rozbłyskiem w rogu, w niej płaski panel „Aktywne obliczenie” z nazwą formuły i notką, panele gotowości danych oraz przyklejona szyna wyniku z przyciskiem pełnego raportu.

## Kiedy używać

Na `kalkulator-klirens.html` (`<html data-clcr-workflow-ui="1">`). Skrypt `clcr_ui_workflow.js` buduje `.clcr-workflow` wokół formularza, a `renderActiveHeading` wypełnia `.clcr-active-panel` po wyborze formuły: kicker „Aktywne obliczenie” (albo „Tryb zgodności” dla formuł zgodnościowych), `formula.label` jako tytuł („Najpierw wybierz formułę” bez wyboru) i `formula.note`. `renderReadiness` ustawia klasę stanu `.clcr-readiness--neutral|--incomplete|--warning|--error|--ready`. Na ekranach ≥980px `.clcr-workspace` dzieli się na kolumnę formularza i szynę `.clcr-result-rail` (348px, `sticky` 74px) z nagłówkiem wyniku i przyciskiem „Zobacz pełny opis wyniku ↓”, który przewija do sekcji z kickerem „Wynik i raport”.

## Co dostarcza konsument

- Atrybut `data-clcr-workflow-ui="1"` na `<html>` — wszystkie reguły powłoki są nim prefiksowane (bez niego karta i panel są nieostylowane; szyna wyniku i `.clcr-step-kicker` nie mają prefiksu).
- `<section class="clcr-workflow">`: `span.clcr-workflow__eyebrow`, `h1.clcr-workflow__title`, `p.clcr-workflow__lead`, opcjonalnie `h2.clcr-workflow__section-title`.
- `<div class="clcr-active-panel">`: `span.clcr-active-panel__eyebrow`, `h2.clcr-active-panel__title`, opcjonalnie `p.clcr-active-panel__note`.
- `<div class="clcr-readiness clcr-readiness--<stan>">` z `p` lub `ul` (lista braków `.clcr-missing-list`).
- Szyna: `<div class="clcr-result-rail">` z `.clcr-rail-head` (`span.clcr-rail-kick`, `div.clcr-rail-formula`, `div.clcr-rnum` z `<small>` jednostki), `<button type="button" class="clcr-fullreport-button">` i kartami `.card`; `[hidden]` chowa nagłówek i przycisk.
- `span.clcr-step-kicker` nad nagłówkiem sekcji raportu.

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `.clcr-workflow` | `position:relative`, pełna szerokość, `margin:0 0 1.25rem`, padding `clamp(1.1rem, 2.6vw, 2rem)`, tekst `--clcr-text` `#333333`, tło `radial-gradient(circle at 95% 0%, rgba(0, 169, 159, 0.11), transparent 35%)` nad `--clcr-surface` `#ffffff`, obrys `1px solid --clcr-border-soft` `#e3ecec`, promień 22px, cień `--clcr-shadow` `0 8px 28px rgba(0, 81, 88, 0.1)` |
| `.clcr-workflow__eyebrow`, `.clcr-active-panel__eyebrow` | blok, `margin:0 0 0.35rem`, `--clcr-primary` `#00838d`, `0.76rem` 800, tracking `0.1em`, wersaliki |
| `.clcr-workflow__title` / `__lead` / `__section-title` | `clamp(1.55rem, 3vw, 2.25rem)/1.15` / `--clcr-muted` `#5a7274` `0.98rem/1.55`, max 720px, `margin:0.55rem 0 1.35rem` / `1rem`, `margin:1.35rem 0 0.65rem` |
| `.clcr-active-panel` | padding `1rem 1.1rem`, tło `--clcr-surface`, obrys `1px solid --clcr-border-soft`, promień 16px; tytuł `clamp(1.15rem, 2.3vw, 1.45rem)/1.25`; notka `--clcr-muted` `0.86rem/1.5`, max 920px, `margin:0.45rem 0 0` |
| `.clcr-readiness` | padding `0.85rem 1rem`, obrys `1px solid --clcr-border` `#d0dede`, promień 14px, `0.88rem/1.45`; `p`/`ul` bez marginesów pionowych |
| `.clcr-readiness--neutral` | tekst `--clcr-muted`, tło `--clcr-surface-soft` `#f5f9f9` |
| `.clcr-readiness--incomplete` | tekst `--clcr-primary-dark` `#006b73`, tło `#eef9fa`, obrys `rgba(0, 131, 141, 0.28)` |
| `.clcr-readiness--warning` | tekst `--clcr-warning` `#9a5b00`, tło `--clcr-warning-bg` `#fff7e6`, obrys `#edd59d` |
| `.clcr-readiness--error` | tekst `--clcr-error` `#c62828`, tło `--clcr-error-bg` `#fff1f1`, obrys `#efc4c8` |
| `.clcr-readiness--ready` | tekst `--clcr-success` `#147a64`, tło `--clcr-success-bg` `#eaf8f3`, obrys `#b9dfd3` |
| `.clcr-workspace` / `.clcr-result-rail` | `min-width:0`; ≥980px siatka `minmax(0, 1fr) 348px`, `gap:20px`, szyna `position:sticky; top:74px`; karty w szynie `margin-bottom:16px` |
| `.clcr-rail-head` | tło `#fff`, obrys `2px solid #00838d`, promień 16px, padding `16px 18px`, cień `0 10px 28px rgba(18,72,77,.06)`; `.clcr-rail-kick` 11px 800, tracking `.07em`, wersaliki, `#00838d`; `.clcr-rail-formula` 12.5px 800 `#006b73`; `.clcr-rnum` `600 2.5rem/1 Inter`, tracking `-.02em`, `#00838d`, `small` `.34em` `#444`; `.clcr-rail-empty` `#557074` 13.5px |
| `.clcr-fullreport-button` | `!important`: blok 100 %, min. 44px, `margin:0 0 16px`, obrys i tło `--clcr-primary`, biały tekst, promień 11px, cień `0 8px 18px rgba(0, 131, 141, 0.2)`, bez rozmycia, `font-weight:750`; `:hover` tło `--clcr-primary-dark`; `[hidden]` = `display:none` |
| `.clcr-step-kicker` | blok, `--clcr-primary`, 12px 780, tracking `0.1em`, wersaliki |
| `prefers-reduced-motion` | `scroll-behavior:auto`, `transition-duration:0.01ms` (`!important`) na całej stronie |

Powłoka nie ma własnych reguł szkła, wysokiego kontrastu ani ciemnego tła: karta pozostaje biała w każdym motywie. Reguła `.liquid-ios26 button` z `!important` próbuje nałożyć szkło na `.clcr-fullreport-button`, ale reguła przycisku ma wyższą specyficzność i również `!important`, więc CTA zostaje pełnym tealem. Karty `.card` w szynie przejmują recepturę szkła i wysokiego kontrastu kart.

## Tokeny

`--clcr-primary`, `--clcr-primary-dark`, `--clcr-surface`, `--clcr-surface-soft`, `--clcr-border`, `--clcr-border-soft`, `--clcr-text`, `--clcr-muted`, `--clcr-error`, `--clcr-error-bg`, `--clcr-warning`, `--clcr-warning-bg`, `--clcr-success`, `--clcr-success-bg`, `--clcr-shadow`. Literały: `rgba(0, 169, 159, 0.11)`, `#eef9fa`, `rgba(0, 131, 141, 0.28)`, `#edd59d`, `#efc4c8`, `#b9dfd3`, `rgba(0, 131, 141, 0.2)`, `#00838d`, `#006b73`, `#444`, `#557074`, `rgba(18,72,77,.06)`.

## Zasady

- Rób: kicker panelu zawsze mówi, co jest liczone („Aktywne obliczenie” / „Tryb zgodności”), a tytuł powtarza pełną nazwę formuły z wersją, np. „CKiD U25 eGFRcr (2021)”, „Bedside Schwartz 2009 (IDMS)”.
- Rób: stan gotowości wyrażaj tekstem („Brakuje danych: …”, „Wszystkie wymagane dane są uzupełnione.”) i klasą stanu jednocześnie; kolor tła nie wystarcza.
- Rób: przycisk pełnego raportu chowaj atrybutem `hidden`, dopóki nie ma wyniku; nagłówek szyny również.
- Nie rób: nie kopiuj `--clcr-*` jako literałów do nowych elementów strony i nie usuwaj atrybutu `data-clcr-workflow-ui` — bez niego znika cała powłoka.
- Nie rób: nie zmieniaj notki formuły na własny opis kliniczny; `formula.note` pochodzi z definicji silnika (`inline_kalkulator_klirens_02.js`) i podlega akceptacji klinicznej.
- Kontrast: `#5a7274` na bieli spełnia AA dla tekstu `0.86rem`; kolory stanów gotowości (`#006b73`, `#9a5b00`, `#c62828`, `#147a64`) na swoich tłach spełniają AA. W wysokim kontraście i na ciemnym tle powłoka nie zmienia się — tylko `:focus-visible` przycisku dostaje `--hc-focus-color`.

Wersja statyczna, przepisana ręcznie z clcr_ui_workflow.css (62–155, 797–932, 2249–2256, 2903–3017, 3057–3066, 3370–3402), clcr_ui_workflow.js (renderActiveHeading, renderReadiness, buildReport, stateKicker), inline_kalkulator_klirens_02.js (definicje formuł: label, note).
