# ClcrField

Karta pojedynczego pola formularza klirensu: nagłówek z nazwą, etykietą statusu i przyciskiem informacji, pod nim kontrolka, dymek pomocy i komunikat walidacji.

## Kiedy używać

Dla każdej kontrolki `#clcrForm` na stronie `kalkulator-klirens.html` (`<html data-clcr-workflow-ui="1">`). Skrypt `clcr_ui_workflow.js` (`decorateField`) opakowuje istniejący `<label>` w kartę, dopisuje nagłówek i dymek, a walidację z `inline_kalkulator_klirens_04.js` (`validateField`) podpina jako `.clcr-field__validation`. Para wartość + jednostka (`.clcr-field-pair`) łączy pole liczbowe z selectem jednostki, pole wyboru (`.clcr-field--choice`) pokazuje checkbox obok nagłówka albo select odpowiedzi protokołu, a `<details class="clcr-context-details">` grupuje pola opcjonalnego kontekstu.

## Co dostarcza konsument

- `<label class="clcr-field" data-clcr-field-id="<id>" data-clcr-status="required|interpretation|optional">` z dziećmi w kolejności: `.clcr-field__heading`, kontrolka, `.clcr-field__help`, `.clcr-field__validation`.
- Nagłówek `<span class="clcr-field__heading">`: `<span class="clcr-field__name" id="clcr-label-<id>">` (tekst etykiety bez dwukropka, np. „Masa ciała (kg)”, „Kreatynina w surowicy”), `<span class="clcr-field__status …">` („* Wymagane”, „Wymagane potwierdzenie”, „Do pełnej interpretacji”, „Opcjonalne”), `<button class="clcr-info-button">` (zob. ClcrInfoButton).
- Kontrolka jako bezpośrednie dziecko: `input` (nie checkbox), `select`, `textarea`; `aria-labelledby="clcr-label-<id>"`; `aria-required="true"` dla wymaganych.
- Modyfikatory: `clcr-field--value` i `data-clcr-unit-pair` na polu wartości, `clcr-field--unit` na polu jednostki, oba w `<div class="clcr-field-pair" data-clcr-value-field data-clcr-unit-field>`; `clcr-field--choice` dla checkboxa (`input[type="checkbox"]` w kolumnie 28px) albo z `<select class="clcr-protocol-answer">` („— wybierz —”, „Tak — potwierdzam”, „Nie”, „Nie wiem”) i ukrytym `input.clcr-canonical-checkbox` (`aria-hidden`, `tabindex="-1"`) dla silnika.
- Dymek `<span class="clcr-field__help" id="clcr-help-<id>" data-clcr-help-source hidden>`; `clcr-field__help--above` gdy JS umieści go nad przyciskiem.
- Walidacja `<div class="validation-message clcr-field__validation">`; błąd = klasa `error` na kontrolce i tekst komunikatu („Wartość nie może być ujemna”, „Nieprawidłowa liczba”, „Wartość wydaje się zbyt wysoka”).
- `<details class="clcr-context-details">` z `<summary class="clcr-context-details__summary">Opcjonalny kontekst kliniczny</summary>` i `<div class="clcr-context-details__body">` z kartami pól.

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `.clcr-field` | grid, min. wysokość 112px, padding 0.75rem, odstęp 0.5rem, tło `--clcr-surface-soft`, obrys 1px `--clcr-border-soft`, promień 13px, tekst `--clcr-text` 0.85rem; `[hidden]` = `display: none !important` |
| `.clcr-field-pair` | grid `minmax(0, 1.55fr) minmax(180px, 0.75fr)`, odstęp 0.75rem, `grid-column: 1 / -1`; dzieci `height: 100%` |
| `.clcr-field__heading` | grid `minmax(0, 1fr) auto` (U2), min. wysokość 26px, odstęp 0.4rem |
| `.clcr-field__name` | 0.84rem/730, interlinia 1.35, `--clcr-text` |
| `.clcr-field__status` | pigułka 999px, 0.64rem/760, tło `#e9f0f0`, tekst `--clcr-muted`; `--required` tło `#ffe8ea` tekst `--clcr-error`; `--interpretation` tło `#fff0c9` tekst `--clcr-warning`; w układzie U2 zawsze `display: none !important` |
| kontrolka (`input`, `select`, `textarea`, `.clcr-protocol-answer`) | biel, obrys 1px `#bfcfcf`, promień 10px, min. wysokość 46px, padding 0.62rem 0.7rem; `:focus` obrys `--clcr-primary` + outline 3px `rgba(0, 131, 141, 0.16)` |
| `.clcr-field--choice` | kolumny `28px minmax(0, 1fr)`, checkbox 22px w kolumnie 1, nagłówek w kolumnie 2; z `.clcr-protocol-answer` jedna kolumna |
| `.clcr-canonical-checkbox` | 1px, `clip-path: inset(50%)`, `opacity: 0` (tylko dla silnika) |
| `.clcr-field__help` | `position: fixed`, z-index 1300, biel, obrys 1px `--clcr-border`, górna krawędź 3px `--clcr-primary`, promień 12px, cień `0 18px 44px rgba(13, 60, 65, 0.24)`, 13px/500; strzałka `::before` 10px w `--clcr-arrow-x`; `--above` przenosi akcent i strzałkę na dół |
| `.clcr-field__validation` | `--clcr-error`, 0.74rem, pełna szerokość; `:empty` ukryty; klasa strony `.validation-message` daje `--danger` 0.8rem |
| `.clcr-field:has(> .error)` | tło `--clcr-error-bg`, obrys `#e4aeb3`; kontrolka `.error` obrys `--danger !important` |
| `.clcr-context-details` | pełna szerokość, tło `#f8fbfb`, obrys 1px `--clcr-border`, promień 12px; summary 0.84rem/760 `--clcr-primary-dark`, min. 46px; body grid 2 kolumny, odstęp 0.65rem |
| `@media (max-width: 760px)` | karta bez min. wysokości, padding 0.7rem; para `minmax(0, 1fr) minmax(96px, 0.62fr)`; body kontekstu w jednej kolumnie; przycisk informacji w kolumnie 2 na dwa wiersze |

## Tokeny

`--clcr-text`, `--clcr-muted`, `--clcr-primary`, `--clcr-primary-dark`, `--clcr-surface-soft`, `--clcr-border`, `--clcr-border-soft`, `--clcr-error`, `--clcr-error-bg`, `--clcr-warning`, `--danger`, `--bg`; w wysokim kontraście `--hc-input-bg`, `--hc-input-border`, `--hc-card-border-width`, `--hc-text`, `--hc-muted`, `--hc-focus-width`, `--hc-focus-color`. Lokalna zmienna `--clcr-arrow-x` (ustawia JS).

## Zasady

- Rób: zachowuj kolejność dzieci karty (nagłówek, kontrolka, pomoc, walidacja); reguły `> input`, `:has(> .error)` i grid pola wyboru zależą od bezpośredniego zagnieżdżenia.
- Rób: błąd sygnalizuj jednocześnie klasą `error` na kontrolce i tekstem w `.clcr-field__validation`; samo tło `--clcr-error-bg` nie wystarcza.
- Rób: parę wartość + jednostka umieszczaj w `.clcr-field-pair`, żeby pole jednostki nie zeszło pod 180px i oba miały równą wysokość.
- Nie rób: nie pokazuj etykiety statusu własnym stylem; w układzie U2 jest ukryta, a wymagalność niesie panel „Wymagane dane” i `aria-required`.
- Nie rób: nie usuwaj ukrytego `input.clcr-canonical-checkbox`; silnik obliczeń czyta jego stan, a select odpowiedzi tylko go ustawia.
- Kontrast: `--clcr-text` na `--clcr-surface-soft` daje 11,91:1, `--clcr-error` na `--clcr-error-bg` 5,11:1, `--clcr-primary-dark` na `#f8fbfb` (summary) powyżej 5:1 — AA spełnione. Etykieta statusu bez modyfikatora (`--clcr-muted` na `#e9f0f0`) daje 4,44:1 i nie spełnia AA dla małego tekstu; wartości zostają jak w źródle, a w układzie U2 etykieta jest ukryta. Wysoki kontrast zamienia kontrolki na `--hc-input-bg` z obrysem `--hc-card-border-width` `--hc-input-border` (`!important`) i daje wszystkim polom, przyciskom i `summary` obwódkę `--hc-focus-width` `--hc-focus-color` na `:focus-visible`. Na szkle karta i pola nie zmieniają się (reguła `.liquid-ios26 input, select` bez `!important` przegrywa specyficznością), zmienia się tylko przycisk informacji.

Wersja statyczna, przepisana ręcznie z clcr_ui_workflow.css (1019–1430, 1718–1770, 3035–3051, 1935–2160), kalkulator-klirens.html `<style>` (1763–1777), clcr_ui_workflow.js (decorateField, ensureProtocolAnswer, groupCollapsibleContextFields), inline_kalkulator_klirens_04.js (validateField), style.css (5185–5198).
