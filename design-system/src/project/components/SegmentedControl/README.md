# SegmentedControl

Wybór jednej z dwóch–trzech opcji w rzędzie pustych pigułek: przezroczyste tło, obrys `2px` w kolorze `--primary`, zaznaczona opcja odwraca się w pełną teal pigułkę z białym tekstem; wariant modułu diety zamienia teal na fiolet PRO.

## Kiedy używać

- `.data-source-toggle`: wybór źródła danych referencyjnych (Palczewska PRO / OLAF / WHO) nad wynikami wzrostu — ukryte pola `radio` w etykietach.
- `.adult-vitals-radio-group` + `.adult-vitals-radio-option`: krótkie pytania tak/nie w module dorosłych („Regularnie uprawia sport") oraz wybór masy do obliczeń w normach żywieniowych (`.nutrition-norms-card`).
- `.diet-segmented-control`: przełącznik strategii w module diety („Redukcja masy" / „Stabilizacja masy") — przyciski, nie pola `radio`, stan przez `.is-active` z JS.
- Przełączniki modułów `.module-btn.active-toggle` to stan przycisku modułu (`ModuleButton`), nie ten komponent.

## Co dostarcza konsument

- Źródło danych: `<div id="dataToggleContainer" class="data-source-toggle"><label><input type="radio" name="dataSource" id="sourcePalczewska" value="PALCZEWSKA"><span>Palczewska<sup class="pro-superscript">PRO</sup></span></label><label><input type="radio" name="dataSource" id="sourceOlaf" value="OLAF" checked><span>OLAF</span></label>…</div>`. Pole `radio` jest ukryte (`display:none`), więc etykietą musi być `<span>` z tekstem; dopisek PRO w `<sup class="pro-superscript">`. Fioletowy wariant PRO działa wyłącznie po `id="sourcePalczewska"`.
- Pytanie tak/nie: `<div class="adult-vitals-radio-group" role="radiogroup" aria-labelledby="…"><label class="adult-vitals-radio-option"><input type="radio" name="adultHrAthleteGroup" value="0" checked><span>Nie</span></label><label class="adult-vitals-radio-option"><input type="radio" name="adultHrAthleteGroup" value="1"><span>Tak</span></label></div>`. Pole `radio` jest przezroczyste i pozycjonowane absolutnie (nadal dostępne z klawiatury), pierścień focus dostaje `<span>`.
- Normy żywieniowe: ta sama struktura w kontenerze `.nutrition-norms-card`, grupa z dodatkową klasą `.nutrition-norms-radio-group` (wyśrodkowanie).
- Dieta: `<div class="diet-segmented-control"><button type="button" class="is-active">Redukcja masy</button><button type="button">Stabilizacja masy</button></div>` — dokładnie dwie kolumny siatki; wewnątrz `#dietRecommendationsContent` kolory pochodzą z tokenów `--diet-ui-*`.
- Stany: `input:checked+span`, `input:disabled+span`, `input:focus-visible+span` (tylko `.adult-vitals-radio-option`), `button.is-active`, `button:hover:not(.is-active)`.

## Warianty i stany

| Klasa / selektor | Wygląd |
| --- | --- |
| `.data-source-toggle` | `display:flex`, wyśrodkowany, `gap:.5rem`, `margin:.6rem auto 1rem`, `width:100%`, `max-width:360px`; każda `label` `flex:1 1 0` (z globalnej reguły `label`: `margin-top:.7rem`, `font-size:.95rem`) |
| `.data-source-toggle label span` | `padding:.5rem .8rem`, obrys `2px solid --primary`, promień 20px, tekst `--primary` .85rem/500, tło przezroczyste, przejście `.3s` |
| `.data-source-toggle label input:checked+span` | tło `--primary`, tekst `#fff` |
| `.data-source-toggle label input:disabled+span` | obrys `#ccc`, tekst `#666`, tło `#f3f3f3`, `cursor:not-allowed`, `pointer-events:none` (na szkle te same wartości z `!important`) |
| `#sourcePalczewska+span` | obrys i tekst `#90f`; `:checked` — tło `#90f`, tekst i `.pro-superscript` `#fff`; `:disabled` — obrys `#ccc`, tekst `#000`, tło `#f3f3f3`, `.pro-superscript` zostaje `#90f` |
| `.pro-superscript` | `#90f`, `.55em`, waga 700, `vertical-align:super`, `margin-left:.1rem` |
| `.adult-vitals-radio-group` | `inline-flex`, `gap:.5rem`, `flex-wrap:wrap`, `justify-self:end` (≤700px: `start`); `.nutrition-norms-radio-group` centruje |
| `.adult-vitals-radio-option span` | `inline-flex`, `min-width:60px`, `padding:.42rem .9rem`, obrys `2px solid --primary`, promień 999px, tekst `--primary` .88rem/700, `line-height:1`, przejście `.25s ease` |
| `.adult-vitals-radio-option input:checked+span` | tło `--primary`, tekst `#fff` |
| `.adult-vitals-radio-option input:focus-visible+span` | `box-shadow:0 0 0 3px #00838d2e` |
| `.nutrition-norms-card .adult-vitals-radio-option span` | tło `--nutrition-ui-button-bg`, tekst `--nutrition-ui-accent-text`, obrys `--nutrition-ui-border-strong`, cień `--nutrition-ui-button-shadow`; `:checked` — `--nutrition-ui-active-bg` / `-text` / `-border`; focus `0 0 0 3px --nutrition-ui-focus` |
| `.diet-segmented-control` | siatka `repeat(2,minmax(0,1fr))`, `gap:.35rem` |
| `.diet-segmented-control button` | `width:100%`, `padding:.55rem`, obrys `1px solid #d8c5eb`, promień `.75rem`, tło `#fff`, tekst `#2a2a2a` .86rem/700, `line-height:1.2`, zawijanie słów (wszystko `!important`) |
| `.diet-segmented-control button.is-active` | obrys `#90f`, tło `#9900ff24`, tekst `#5a008f` |
| `#dietRecommendationsContent .diet-segmented-control button` | tło `--diet-ui-button-bg`, tekst `--diet-ui-button-text`, obrys `--diet-ui-neutral-border`; `.is-active` — tło `color-mix(in srgb, --diet-ui-surface 80%, --diet-ui-accent 20%)`, obrys `--diet-ui-active-border`, tekst `--diet-ui-accent-strong`; `:hover:not(.is-active)` — `--diet-ui-button-hover-bg` |

## Tokeny

`--primary`, `--lg-border` (przez `.liquid-ios26 button`), `--diet-ui-button-bg`, `--diet-ui-button-text`, `--diet-ui-neutral-border`, `--diet-ui-surface`, `--diet-ui-accent`, `--diet-ui-active-border`, `--diet-ui-accent-strong`, `--diet-ui-button-hover-bg`, `--nutrition-ui-button-bg`, `--nutrition-ui-accent-text`, `--nutrition-ui-border-strong`, `--nutrition-ui-button-shadow`, `--nutrition-ui-active-bg`, `--nutrition-ui-active-text`, `--nutrition-ui-active-border`, `--nutrition-ui-focus`, `--hc-focus-width`, `--hc-focus-color`. Fiolet PRO (`#90f`, `#9900ff24`, `#5a008f`, `#d8c5eb`) i szarości stanu wyłączonego (`#ccc`, `#666`, `#f3f3f3`) są literałami w źródle.

## Zasady

- Rób: zawsze jedna opcja zaznaczona; stan wyboru niesie tło, więc w każdej pigułce zostaw tekst — kolor sam nie wystarczy.
- Rób: w `.diet-segmented-control` umieszczaj dokładnie dwa przyciski (siatka ma dwie kolumny); dłuższe etykiety zawijają się, nie skracaj ich do skrótów.
- Nie rób: nie używaj fioletu `#90f` poza opcjami PRO/diety — teal `--primary` jest domyślnym kolorem wyboru.
- Nie rób: nie dodawaj `disabled` do pigułki bez wyjaśnienia w interfejsie (blokada PRO ma osobny komunikat).
- Kontrast (zmierzony): teal `#00838d` na bieli dla obrysu i tekstu — 4,53:1; zaznaczona pigułka — biały tekst na `#00838d` — 4,53:1; fiolet `#90f` na bieli i biel na `#90f` — 5,53:1; `#5a008f` na `#9900ff24` nad bielą — 8,90:1; `#0b7285` (`--nutrition-ui-accent-text`) na bieli — 5,59:1. Wyłączona opcja `#666` na `#f3f3f3` (5,17:1) jest celowo przygaszona.
- Wysoki kontrast: pigułki teal nie mają własnych reguł; pola i przyciski dostają `outline: --hc-focus-width solid --hc-focus-color` przy `:focus-visible`, a warianty tokenowe (`#dietRecommendationsContent`, `.nutrition-norms-card`) przemapowują `--diet-ui-*` / `--nutrition-ui-*` na `--hc-*` w `tokens.css`.
- Na szkle: pigułki radiowe bez zmian; przyciski diety dostają z `.liquid-ios26 button` rozmycie `blur(10px) saturate(120%)` i cień `0 4px 12px #0000001a`, ale promień `.75rem`, białe tło i obrys zostają, bo `style.css` ładuje się po `ios26-v2.css`.
- Selektory z identyfikatorem zachowano: `#sourcePalczewska` (wariant PRO), `#dietRecommendationsContent` (wariant tokenowy); podgląd używa `id="dataToggleContainer"`, `id="sourcePalczewska"`, `id="sourceOlaf"`, `id="sourceWho"`, `id="adultHrAthleteNo"`, `id="adultHrAthlete"` z aplikacji.

Wersja statyczna, przepisana ręcznie z src/css/style.css (.data-source-toggle, #sourcePalczewska, .pro-superscript, .adult-vitals-radio-group, .adult-vitals-radio-option, .nutrition-norms-radio-group, .nutrition-norms-card .adult-vitals-radio-option, .diet-segmented-control, #dietRecommendationsContent .diet-segmented-control button, reguły globalne label/input/button, high-contrast :focus-visible) i src/css/ios26-v2.css (.liquid-ios26 button).
