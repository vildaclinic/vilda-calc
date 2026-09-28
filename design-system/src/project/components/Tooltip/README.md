# Tooltip

Trzy dymki podpowiedzi z `style.css`: obramowana podpowiedź menu i jej mniejsza odmiana „skopiowano”, szklany dymek zakresu nad polem formularza oraz czarno obramowany dymek objaśnień w tabeli mikroskładników.

## Kiedy używać

- `.menu-tooltip` — podpowiedź do elementu menu (`showTooltip(el, tekst)` w `app.js` dodaje ją do `<body>` i pozycjonuje przy kotwicy); `.copy-tooltip` — potwierdzenie „Skopiowano…” nad przyciskiem kopiowania w modułach terapii (`cukrzyca.js`, `hypertension_therapy.js`, `obesity_therapy.js`).
- `.vild-range-tip` — komunikat „poza zakresem” nad polem liczbowym, wstawiany przez `vilda_update_prep.js` razem z klasą `vild-range-invalid` na polu.
- `.nutrition-micros-tooltip` — objaśnienie skrótu (RDA, AI, EAR) w karcie mikroskładników (`nutrition_micros.js`), jeden element `#nutritionMicrosTooltip` na stronę.

## Co dostarcza konsument

- Menu: `<div class="menu-tooltip">tekst</div>` (opcjonalnie `.copy-tooltip`), dodany do `<body>`; skrypt ustawia `left`/`top` i inline `opacity:1`, bo klasa sama nie ma stanu „widoczny”. Dla `.copy-tooltip` skrypty ustawiają też `position:fixed` i `transform:translate(-50%,-100%) translateY(2px)` inline.
- Zakres: kotwica `<label class="vild-range-host">` (lub inny rodzic z `position:relative`) zawierająca pole z klasą `vild-range-invalid` i `aria-invalid="true"` oraz `<span class="vild-range-tip is-on" role="tooltip"><span class="vild-range-tip__ic">SVG</span><span class="vild-range-tip__txt">tekst</span></span>`. Ikona to inline SVG 24 (kółko z wykrzyknikiem, `stroke="currentColor"`). Stan widoczny: `is-on`.
- Mikroskładniki: kotwica `<span class="nutrition-micros-abbr" tabindex="0">RDA</span>` oraz `<div class="nutrition-micros-tooltip" role="tooltip" hidden>` na `<body>`; skrypt zdejmuje `hidden`, mierzy z klasą `is-measuring`, potem daje `is-visible`.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.menu-tooltip` | `position:absolute`, `z-index:10020`, tło `#fff`, tekst i obrys `2px solid var(--primary)` (`#00838d`), promień `var(--radius)` (12px), cień `var(--shadow)`, `padding:.55rem .75rem`, tekst `1.5rem/1.2` wagi 600, `max-width:min(360px, calc(100vw - 24px))`, `pointer-events:none`; ukryty (`opacity:0; translateY(2px)`), pokazuje się przez inline `opacity:1` z przejściem `.2s ease` |
| `.menu-tooltip.copy-tooltip` | tekst `.95rem/1.25`, `padding:.45rem .65rem`, `max-width:min(320px, calc(100vw - 24px))` |
| `.vild-range-host` | `position:relative` — kotwica dymka zakresu |
| `.vild-range-tip` | `position:absolute`, `left:12px`, `bottom:calc(100% + 9px)`, flex z odstępem 7px, tło `#fffffff5`, tekst `var(--primary)`, obrys `1.5px solid rgba(0,131,141,.2)`, promień 10px, cień `0 4px 20px #00515821, 0 1px 4px #0000000f, inset 0 1px #fffc`, `backdrop-filter:blur(14px) saturate(1.6)`, tekst `.83rem/1.3` wagi 500, `padding:.55rem .85rem`, `max-width:min(300px, calc(100vw - 28px))`; strzałka 12×12px obrócona o 45° pod dymkiem (`::after`, `left:20px`) |
| `.vild-range-tip.is-on` | `opacity:1; translateY(0)` (z `translateY(4px)`, przejście `.18s ease`) |
| `.vild-range-tip__ic` | ikona 15×15px w `var(--primary)` |
| `.vild-range-invalid` | pole: `border-color:var(--primary)`, `box-shadow:0 0 0 3px #00838d24` |
| `.nutrition-micros-abbr` | podkreślenie kropkowane, `cursor:help`; `:focus-visible` obrys `2px solid #111` |
| `.nutrition-micros-tooltip` | `position:fixed`, `z-index:2147483000`, tło `#fff`, tekst `#000`, obrys `2px solid #000`, promień 8px, `padding:.66rem .78rem`, tekst `1.02rem/1.42` wagi 500 do lewej, cień `0 8px 20px #0000002e`, `max-width:min(360px, calc(100vw - 16px))`; przejście `35ms linear`; przy `max-width:420px` tekst `.98rem` |
| `.nutrition-micros-tooltip.is-visible` / `.is-measuring` / `[hidden]` | widoczny / pomiar bez przesunięcia / `display:none` |

## Tokeny

- `--primary`, `--radius`, `--shadow`
- w motywach dymka mikroskładników: `--lg-surface-light`, `--lg-border` (szkło), `--hc-result-bg`, `--hc-text`, `--hc-input-border` (wysoki kontrast)
- wartości wpisane na stałe: `#fffffff5`, `rgba(0,131,141,.2)`, `#00838d24`, `#000`, `#111`

## Zasady

- Rób: dymek nigdy nie przyjmuje wskaźnika (`pointer-events:none`); treść jest krótka i po polsku; kotwica dymka mikroskładników ma `tabindex="0"`, żeby działał z klawiatury.
- Rób: dla pola poza zakresem zawsze dodaj `aria-invalid="true"` i klasę `vild-range-invalid` na polu — dymek sam nie oznacza pola.
- Nie rób: nie używaj `.menu-tooltip` do długich objaśnień — tekst `1.5rem` jest dla krótkich etykiet menu; objaśnienia daj w `.copy-tooltip` albo `.nutrition-micros-tooltip`.
- Nie rób: nie pokazuj dwóch dymków zakresu naraz przy tym samym polu.
- Kontrast (zmierzony): dymek mikroskładników celowo ma czarny obrys i czarny tekst na bieli, 21:1 (`body .nutrition-micros-tooltip` z `!important` wygrywa z kartą; pod `.liquid-ios26` tekst `#10282d` na bieli 15,4:1); dymek zakresu i menu mają turkusowy tekst `#00838d` na (prawie) białym tle — 4,53:1, tuż nad progiem 4,5:1.
- Szkło: tylko `.nutrition-micros-tooltip` zmienia się pod `body.liquid-ios26` (tło `color-mix(in srgb, var(--lg-surface-light) 95%, rgba(255,255,255,.96))`, tekst `#10282d`, obrys `var(--lg-border)`); pozostałe dymki wyglądają tak samo.
- Wysoki kontrast: `.nutrition-micros-tooltip` przechodzi na `var(--hc-result-bg)` / `var(--hc-text)` / `var(--hc-input-border)` na każdym poziomie; reszta bez zmian.
- W podglądzie dymki menu i mikroskładników stoją w przepływie dokumentu (nadpisanie tylko `position`); dymek zakresu jest tam, gdzie w aplikacji — nad kotwicą.

Wersja statyczna, przepisana ręcznie z src/css/style.css (linie 4053–4135, 6222–6260, 7267–7278).
