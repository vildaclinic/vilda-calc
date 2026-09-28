# ClcrFormulaChoice

Wybór formuły w kalkulatorze klirensu: karty modułów z przyciskiem „Wybierz” albo selectem wariantu i przyciskiem „Otwórz obliczenie”, plus zachowane pod spodem starsze kafle `.version-option` i ukryty picker kanoniczny dla silnika.

## Kiedy używać

W sekcji modułów strony `kalkulator-klirens.html` (`<html data-clcr-workflow-ui="1">`). Skrypt `clcr_ui_workflow.js` (`renderModules`) buduje sekcje poziomów („Obliczenia podstawowe”, „Obliczenia zaawansowane”, „Obliczenia profesjonalne”, „Obliczenia z próbki moczu”) i w każdej siatkę kart. Moduł z jedną formułą dostaje przycisk przełączany `aria-pressed`; moduł z kilkoma formułami dostaje select wariantu i przycisk „Otwórz obliczenie” aktywny dopiero po wyborze. Oryginalny select/radio picker (`#formulaPicker`) i kafle wersji (`#versionContainer`) zostają w DOM, bo silnik obliczeń nadal je czyta.

## Co dostarcza konsument

- `<div class="clcr-modules">` z `<section class="clcr-module-section" data-level="basic|advanced|pro|spot">`, w niej `<h3 class="clcr-module-section__title">` i `<div class="clcr-module-grid">`.
- Karta `<article class="clcr-module-card" data-module-id>` (klasa `is-active`, gdy jej formuła jest aktywna) z `<h4 class="clcr-module-card__title">` (np. „eGFR u dziecka i młodej osoby”, „Cockcroft–Gault”), `<p class="clcr-module-card__description">` (np. „Współczesny wzór kreatyninowy CKiD U25.”) i `<div class="clcr-module-card__variants">`.
- Jedna formuła: `<button type="button" class="clcr-formula-choice" data-formula-id aria-pressed="true|false">Wybierz</button>`.
- Kilka formuł: `<select class="clcr-module-variant-select" aria-label="Wariant: <tytuł>">` z opcją „Wybierz wariant (N)” i etykietami formuł (np. „eGFR — dzieci (kreatynina)”), po nim `<button type="button" class="clcr-formula-choice" disabled>Otwórz obliczenie</button>`.
- Starsze elementy: `<div id="versionContainer" class="version-container">` z `.version-option` (`selected`, `disabled`); `<div id="formulaPicker" class="clcr-canonical-picker">` — wymagane `id`, bo strona styluje je po identyfikatorze.

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `.clcr-module-section__title` | `--clcr-muted`, 0.82rem, odstęp liter 0.04em, wersaliki, margines dolny 0.65rem; kolejna sekcja ma górny obrys 1px `--clcr-border-soft` |
| `.clcr-module-grid` | grid 2 kolumny, odstęp 0.7rem; 4 kolumny od 920px; 1 kolumna do 760px |
| `.clcr-module-card` | flex kolumnowy, padding 0.9rem, tło `--clcr-surface`, obrys 1px `--clcr-border-soft`, promień 15px; tytuł 1rem `--clcr-text`, opis 0.82rem `--clcr-muted` |
| `.clcr-module-card.is-active` | tło `linear-gradient(145deg, rgba(0, 169, 159, 0.08), #fff 62%)`, obrys `rgba(0, 131, 141, 0.55)`, lewy pasek `inset 3px 0 0 --clcr-primary` |
| `.clcr-formula-choice` | 100% szerokości, min. 42px (46px do 760px), padding 0.55rem 0.7rem, tekst `--clcr-primary-dark` 0.8rem/700 do lewej, tło `--clcr-surface-soft`, obrys 1px `--clcr-border`, promień 10px |
| `.clcr-formula-choice:hover`, `[aria-pressed="true"]` | biały tekst, tło i obrys `--clcr-primary` |
| `.clcr-formula-choice:disabled` | tekst `#819395`, tło `#edf2f2`, obrys `--clcr-border-soft`, opacity 0.8, `cursor: not-allowed` |
| `.clcr-module-variant-select` | 100%, min. 42px, padding 0.5rem 0.6rem, biel, obrys 1px `--clcr-border`, promień 10px, 0.78rem |
| `#versionContainer.version-container` | grid 3 kolumny, odstęp 0.55rem, bez tła i obrysu |
| `.version-option` | grid wyśrodkowany, min. 52px, padding 0.7rem 0.8rem, `--clcr-primary-dark` 0.88rem/750, tło `--clcr-surface-soft`, obrys `--clcr-border`, promień 13px, przejścia 150ms; `:hover` obrys `rgba(0, 131, 141, 0.55)` i `translateY(-1px)`; `.selected` biel na `--clcr-primary` z cieniem `0 8px 18px rgba(0, 131, 141, 0.2)`; `.disabled` opacity 0.5; `:focus-visible` outline 3px `rgba(0, 131, 141, 0.24)`; do 760px 50px/0.8rem, do 340px 0.74rem |
| `.clcr-canonical-picker` | absolutny 2×2px, `opacity: 0` |

W aplikacji `<body class="liquid-ios26">` nakłada na każdy `<button>` regułę szkła z `!important` (`ios26-v2.css`): `.clcr-formula-choice` ma wtedy tło `#fff3`, obrys 1px `--lg-border`, tekst `#111`, promień 14px, cień `0 4px 12px #0000001a` i rozmycie tła, a stany `:hover`, `[aria-pressed="true"]` i `:disabled` nie zmieniają tła ani koloru (zostaje `cursor: not-allowed` i opacity 0.8). Kafle `.version-option` są `<div>`, więc reguła szkła ich nie dotyczy.

## Tokeny

`--clcr-primary`, `--clcr-primary-dark`, `--clcr-surface`, `--clcr-surface-soft`, `--clcr-border`, `--clcr-border-soft`, `--clcr-text`, `--clcr-muted`; starsze reguły strony `--card`, `--radius`, `--shadow`, `--primary`; szkło `--lg-border`; wysoki kontrast `--hc-module-btn-bg`, `--hc-module-btn-border`, `--hc-module-btn-shadow`, `--hc-module-btn-hover-bg`, `--hc-module-btn-active-bg`, `--hc-module-btn-active-border`, `--hc-module-btn-active-shadow`, `--hc-card-border-width`, `--hc-text`, `--hc-muted`, `--hc-focus-width`, `--hc-focus-color`.

## Zasady

- Rób: stan wyboru nieś atrybutem `aria-pressed` na przycisku i klasą `is-active` na karcie; w szkle sam przycisk nie zmienia koloru, więc karta z lewym paskiem i gradientem jest jedynym widocznym znacznikiem aktywnej formuły.
- Rób: przycisk „Otwórz obliczenie” trzymaj `disabled`, dopóki select ma wartość pustą.
- Nie rób: nie usuwaj `#formulaPicker` ani `#versionContainer`; są ukryte lub przestylowane, ale silnik obliczeń nadal odczytuje z nich wybraną formułę.
- Nie rób: nie zmieniaj liczby kolumn siatki poza progami 920px i 760px ze źródła.
- Kontrast: `--clcr-primary-dark` na `--clcr-surface-soft` spełnia AA; `#819395` na `#edf2f2` (`:disabled`) daje 2,84:1 i nie spełnia AA; wartość pozostaje jak w źródle (w aplikacji przycisk i tak dostaje `#111` na `#fff3` z reguły szkła). Wysoki kontrast przestylowuje tylko `.version-option` (tło `--hc-module-btn-bg`, obrys `--hc-card-border-width` `--hc-module-btn-border`, `.selected` na `--hc-module-btn-active-bg`, `.disabled` biel `#ffffffc7` z `--hc-muted`); przyciski i select dostają obwódkę `--hc-focus-color` na `:focus-visible`.

Wersja statyczna, przepisana ręcznie z clcr_ui_workflow.css (340–463, 465–648, 729–740, 1897–1901, 1935–2160, 2227–2246), kalkulator-klirens.html `<style>` (843–877, 1148–1195), clcr_ui_workflow.js (MODULES, renderModules), ios26-v2.css (85–93), style.css (5167–5183, 5196–5198).
