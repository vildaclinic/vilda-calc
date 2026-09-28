# Slider

Suwak dawki antybiotyku zbudowany na natywnym `input[type=range]` z podziałką nad torem, przeciąganą etykietą wartości pod kciukiem oraz szklana podpowiedź zakresu (`.vild-range-tip`) wyświetlana nad polem liczbowym po przekroczeniu dopuszczalnych wartości.

## Kiedy używać

- `.dose-slider-container`: wybór dawki w mg/kg/dobę w karcie antybiotykoterapii — jedyne miejsce w aplikacji, w którym suwak ma podziałkę i etykietę wartości. Wszystkie reguły są ograniczone do `#antibioticTherapyCard`.
- `.slider-value-label--multiline` z `.dose-slider-container--multiline`: gdy dawka jest stała lub wymuszona maksymalna („W tym wskazaniu rekomendowana jest stała dawka 50 mg/kg/dobę wybranego leku", „Zastosowano maksymalną dobową dawkę leku"); suwak jest wtedy `disabled`.
- `.vild-range-tip`: komunikat o wartości poza zakresem przy polach wieku, wagi i wzrostu („Waga poza zakresem (1–500 kg)") — tworzy go `vilda_update_prep.js`, pole dostaje klasę `.vild-range-invalid` i `aria-invalid="true"`.
- Suwaki ustawień (`.settings-range-row`) mają własne style w `ustawienia.css` i nie należą do tego komponentu.

## Co dostarcza konsument

- Kontener `#antibioticTherapyCard` (wymagany `id`, bo wszystkie selektory suwaka są nim poprzedzone), a w nim: `<label style="display:block; margin-top:.4rem; text-align:center;">Dawka (<span id="abxDoseDisplay">mg/kg/dobę</span>)<div class="dose-slider-container"><div id="sliderTicks" class="slider-ticks">…</div><input type="range" id="abxDoseSlider" style="width:100%;"><span id="sliderValueLabel" class="slider-value-label">30 mg/kg/dobę</span></div></label>`.
- Podziałkę generuje JS: w `.slider-ticks` dwa `<div class="slider-tick-label">` z `style="left:0%;transform:translateX(0)"` i `style="left:100%;transform:translateX(-100%)"` (wartość min i max). Klasa `.slider-tick-line` (kreski 2px) istnieje w CSS, ale bieżący skrypt jej nie renderuje.
- Etykieta wartości dostaje `style="left:N%"` (procent położenia kciuka), klasę `.active` po przeciągnięciu, `.slider-value-label--message` (kontener z `.has-message-label`) dla dłuższego komunikatu pozycjonowanego, `.slider-value-label--multiline` dla bloku statycznego.
- Opcjonalny `<div class="slider-labels"><span>20 mg/kg</span><span>50 mg/kg</span></div>` pod torem.
- Podpowiedź zakresu: etykieta-gospodarz dostaje klasę `.vild-range-host`, a w niej `<div class="vild-range-tip is-on" role="alert"><span class="vild-range-tip__ic" aria-hidden="true">SVG</span><span class="vild-range-tip__txt">Waga poza zakresem (1–500 kg)</span></div>`; bez `.is-on` podpowiedź jest niewidoczna (`opacity:0`).
- Stany: `input[type=range]:disabled`, `input[type=range]:focus`, `.dose-slider-container:hover .slider-value-label`, `.slider-value-label:active`, `.vild-range-tip.is-on`, `.vild-range-invalid`.

## Warianty i stany

| Klasa / selektor | Wygląd |
| --- | --- |
| `.dose-slider-container` | `position:relative`, `width:100%`, `margin-top:.25rem`, `padding:.6rem 0 1.2rem`; `.has-message-label` — `padding-bottom:2.8rem` (≤699px: 3.4rem); `--multiline` — `padding-bottom:.25rem` |
| `.slider-ticks` | pasek absolutny na górze, `height:.6rem`, bez zdarzeń wskaźnika |
| `.slider-tick-line` | kreska `2px × .3rem`, `top:.3rem`, `--primary`, `opacity:.6` |
| `.slider-tick-label` | absolutna, `top:0`, `translate(-50%)`, tekst `#000000bf` waga 600, bez zawijania; deklaracja `font-size:1 rem` jest nieprawidłowa, więc rozmiar dziedziczy z etykiety (.95rem); pierwsza/ostatnia ma `padding-left/right:.5rem` |
| `input[type=range]` | z globalnej reguły `input`: `width:100%`, `padding:.45rem`, `font-size:1rem`; w karcie obrys `1px solid #d0d7da`, promień `--radius`; `:focus` — bez `outline`, obrys `#d0d7da`, bez cienia; `:disabled` — `opacity:.5`, `cursor:not-allowed` |
| `.slider-labels` | absolutne `bottom:-.3rem`, `flex` `space-between`, `.8rem` |
| `.slider-value-label` | absolutna `left:0; bottom:-.6rem; translate(-50%)`, `1rem`/600 `--primary`, `nowrap`, `cursor:grab`; ramka `1px solid --primary`, tło `--card`, `padding:.25rem .5rem`, promień 6px, cień `--shadow`, `max-width:calc(100% - .5rem)`; `.active` — waga 700; `:active` — `cursor:grabbing` |
| `.dose-slider-container:hover .slider-value-label` | wygrywa ostatnia reguła: tło `--card`, tekst `--primary`, obrys `1px solid --secondary`, cień `--shadow` (wcześniejsze wypełnienie `--secondary` z białym tekstem jest nadpisane) |
| `.slider-value-label--message` | `width:min(28rem,calc(100% - .5rem))`, zawijanie, wyśrodkowanie, `line-height:1.3`, `padding:.45rem .65rem`; ≤699px — `width:calc(100% - .5rem)`, `.95rem` |
| `.slider-value-label--multiline` | blok statyczny (`position:relative`, `display:block`, `transform:none`), `width:min(100%,34rem)`, `margin:.65rem auto 0`, `text-wrap:balance`, `line-height:1.35`, `cursor:default`, `pointer-events:none` |
| `.liquid-ios26 … .slider-value-label` | obrys `1px solid --lg-border`, tło `#fff3`, tekst `#111`, cień `0 4px 12px #0000001a`, `backdrop-filter:blur(10px) saturate(120%)`; hover — tło `#fff3`, tekst `#111`, obrys `1px solid --lg-accent` (reguła z wypełnieniem `color-mix(--lg-accent 40%)` jest nadpisana późniejszą) |
| `.vild-range-host` | `position:relative` — kotwica podpowiedzi |
| `.vild-range-tip` | absolutna `left:12px; bottom:calc(100% + 9px)`, `z-index:10020`, `flex` z `gap:7px`, `max-width:min(300px,calc(100vw - 28px))`, tło `#fffffff5`, tekst `--primary`, obrys `1.5px solid rgba(0,131,141,.2)`, promień 10px, cień `0 4px 20px #00515821, 0 1px 4px #0000000f, inset 0 1px #fffc`, `backdrop-filter:blur(14px) saturate(1.6)`, `.83rem`/500, `padding:.55rem .85rem`; ukryta (`opacity:0`, `translateY(4px)`), `.is-on` pokazuje; strzałka `:after` 12px obrócona o 45° w `left:20px` |
| `.vild-range-tip__ic` | ikona 15×15px w kolorze `--primary` |
| `.vild-range-invalid` | obrys `--primary`, pierścień `0 0 0 3px #00838d24` |

## Tokeny

`--primary`, `--secondary`, `--card`, `--radius`, `--shadow`, `--lg-border`, `--lg-accent`, `--hc-focus-width`, `--hc-focus-color`. Szarość toru (`#d0d7da`), tekst podziałki (`#000000bf`) i biel podpowiedzi (`#fffffff5`) są literałami w źródle.

## Zasady

- Rób: zawsze pokazuj wartość liczbową z jednostką w etykiecie (`30 mg/kg/dobę`) — położenie kciuka samo nie jest odczytywalne.
- Rób: ustawiaj `left` etykiety w procentach zakresu `(value - min) / (max - min) * 100`, jak robi to `updateSliderValueLabel()`.
- Rób: gdy zakres jest pusty (`min === max`) lub dawka wymuszona, przełącz na `--multiline` i wyłącz suwak.
- Nie rób: nie umieszczaj suwaka poza `#antibioticTherapyCard` bez przeniesienia reguł — bez tego przedrostka nie ma żadnych stylów.
- Nie rób: nie dodawaj `.vild-range-tip` bez klasy `.vild-range-invalid` na polu i `role="alert"` — komunikat ma być ogłaszany czytnikom ekranu.
- Kontrast (zmierzony): na szkle tekst etykiety `#111` na `#fff3` nad `--card` (#f5f9f9) — ok. 18:1; podpowiedź zakresu teal `#00838d` na `#fffffff5` nad bielą — 4,53:1; podziałka `#000000bf` nad bielą — 10,37:1. Wariant bez klasy `.liquid-ios26` (teal `#00838d` na `--card` #f5f9f9) ma tylko 4,28:1 — poniżej 4,5:1; wartości pochodzą ze źródła i nie zostały zmienione, w aplikacji ten wariant nie występuje, bo `.liquid-ios26` jest zawsze obecna.
- Wysoki kontrast: suwak, etykieta i podpowiedź nie mają własnych reguł; pole liczbowe przy `:focus-visible` dostaje `outline: --hc-focus-width solid --hc-focus-color`.
- Na szkle: `.liquid-ios26` jest zawsze obecna, więc w aplikacji etykieta wartości zawsze wygląda jak szklany chip (`#fff3`, blur) — wariant `--card`/`--primary` jest widoczny tylko bez tej klasy.
- Selektory z identyfikatorem zachowano: wszystkie reguły suwaka są poprzedzone `#antibioticTherapyCard`; podgląd używa `id="antibioticTherapyCard"`, `id="abxDoseSlider"`, `id="sliderTicks"`, `id="sliderValueLabel"`, `id="abxDoseDisplay"`, `id="weight"` z aplikacji. Podpowiedź zakresu jest pozycjonowana absolutnie względem `.vild-range-host` i w podglądzie pozostaje w tej pozycji (miejsce nad polem daje układ podglądu).

Wersja statyczna, przepisana ręcznie z src/css/style.css (#antibioticTherapyCard .dose-slider-container, .slider-ticks, .slider-tick-line, .slider-tick-label, .slider-labels, .slider-value-label i modyfikatory, input[type=range], .vild-range-host, .vild-range-tip, .vild-range-tip__ic, .vild-range-tip__txt, .vild-range-invalid, reguły globalne label/input), src/css/ios26-v2.css (.liquid-ios26 #antibioticTherapyCard …) oraz znacznika z antibiotic_therapy.js i vilda_update_prep.js.
