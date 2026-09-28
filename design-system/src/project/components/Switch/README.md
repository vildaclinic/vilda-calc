# Switch

Przełącznik w stylu iOS: pigułka 60×30px (lub 52×28px) z białym kółkiem, które przesuwa się w prawo po zaznaczeniu ukrytego pola wyboru.

## Kiedy używać

- `.switch` w `.toggle-wrap`: wybór między dwiema równorzędnymi opcjami opisanymi po lewej i prawej (`Wyniki standardowe` / `Wyniki profesjonalne`, `AHA` / `ESC/PTK`). Tor jest teal po obu stronach, bo żadna strona nie jest „wyłączona".
- `.switch-diet`, `.switch-flu`, `.settings-grid .switch`: włącz/wyłącz jedną funkcję (redukcja masy, profilaktyka dla domowników, etykiety na siatce). Tor szary, po włączeniu teal.
- `.switch-pub`: opcje trybu PRO (siatki do publikacji, strzałka z komentarzem) — po włączeniu fiolet `#90f`.

## Co dostarcza konsument

- Znacznik: `<label class="switch"><input type="checkbox" id="…"><span class="slider"></span></label>`. Pole jest `display:none`; kółko rysuje `.slider:before`.
- Wiersz z etykietami: `<div class="toggle-wrap"><span class="label-left">…</span><label class="switch">…</label><span class="label-right">…</span></div>`.
- Uwaga: bazowy `.switch` nie ma ogólnej reguły przesunięcia kółka po zaznaczeniu — ruch nadają reguły z identyfikatorem: `#dataToggle`, `#bpDataToggle`, `#resultsModeToggle` (kółko `right:2px`), `#adultBpGuidelineToggle` (`translate(30px)`), a w ustawieniach `.settings-grid .switch input:checked+.slider:before`. Nowy `.switch` poza tymi kontekstami wymaga własnej reguły przesunięcia.
- Tryb PRO: `#resultsModeToggleContainer` z `.label-right.pro-label` i `<sup class="pro-tag">PRO</sup>`; zaznaczony `#resultsModeToggle` barwi tor na `#90f`.
- Warianty modułowe: `.diet-toggle-group` (`.toggle-label` + `.switch-diet`), `.publication-toggle-row` (`.publication-toggle-label` + `.switch-pub`), `#fluCard #fluSwitches .flu-switch-row` (`.flu-switch-label` + `.switch-flu`), `.settings-grid .setting-item` (`<span>` + `.switch`).
- Stany bez klasy: `:checked`, `:disabled` (tylko `#bpDataToggle` i `.settings-grid .switch`). Brak widocznego stylu focus — pole jest ukryte, więc sterowanie klawiaturą wymaga własnego rozwiązania.

## Warianty i stany

| Klasa / selektor | Wygląd |
| --- | --- |
| `.switch` | 60×30px, `margin:0 .75rem`; tor `--primary`, promień 30px; kółko 26px białe, `left:2px; top:2px` |
| `#resultsModeToggle:checked~.slider` | tor `#90f`, kółko przy prawej krawędzi (`right:2px`) |
| `#adultBpGuidelineToggle:checked~.slider:before` | kółko `translate(30px)`; tor bez zmiany koloru |
| `#bpDataToggle:disabled+.slider` | tor `#ddd`, `cursor:not-allowed` |
| `.label-left`, `.label-right` | Inter 1rem, waga 600, `--primary`, bez zaznaczania; .9rem poniżej 480px |
| `.pro-label`, `.pro-tag` (w `#resultsModeToggleContainer`) | fiolet `#90f`; znacznik PRO .55em, waga 700, indeks górny |
| `.switch-diet` | 52×28px, tor `#ccc` → `--primary`, kółko 24px `translate(24px)` |
| `.diet-toggle-group .toggle-label` | .88rem, waga 500, `line-height:1.2`; .84rem poniżej 380px |
| `.switch-pub` | 60×30px, tor `#ccc` → `#90f`, kółko `translate(30px)` |
| `.publication-toggle-row` | wiersz `space-between`, `margin-top:.8rem`; etykieta .95rem, waga 500 |
| `.switch-flu` | 60×30px, tor `#ccc` → `--primary`, kółko `translate(30px)`; wiersz `.flu-switch-row` `space-between`, etykieta .9rem |
| `.settings-grid .switch` | tor `#ccd9d9` → `--primary`; kółko `right:2px` po zaznaczeniu; `:disabled` tor `#ddd`, `cursor:not-allowed` |
| `.settings-grid .setting-item` | wiersz `space-between`, `padding:.6rem .8rem`, obrys `1px solid --line`, promień 6px, `background:var(--field)` (zmienna niezdefiniowana w źródle — tło przezroczyste); `<span>` .95rem z `flex:1`; siatka `repeat(auto-fit,minmax(260px,1fr))` |
| `#dietRecommendationsContent .switch-diet` | tor `--diet-ui-switch-bg`, kółko `--diet-ui-switch-thumb`, zaznaczony `--diet-ui-active-bg` / `#90f` (także z prefiksem `.liquid-ios26`) |

Przejścia: tło `.3s`, ruch kółka `transform .3s`.

## Tokeny

`--primary`, `--diet-ui-switch-bg`, `--diet-ui-switch-thumb`, `--diet-ui-active-bg`. Szarości toru (`#ccc`, `#ccd9d9`, `#ddd`) i fiolet PRO (`#90f`) są literałami w źródle.

## Zasady

- Rób: przy `.switch` z torem teal po obu stronach zawsze podpisuj obie strony (`.label-left`, `.label-right`); bez etykiet stan jest nieczytelny.
- Rób: przy wariantach włącz/wyłącz stawiaj etykietę w tym samym wierszu (`.toggle-label`, `.flu-switch-label`, `.publication-toggle-label`).
- Nie rób: nie używaj fioletu `#90f` poza trybem PRO — to kolor funkcji płatnych, nie stanu „włączone".
- Nie rób: nie licz na przesunięcie kółka w gołym `.switch` bez jednego z obsługiwanych `id` lub kontekstu `.settings-grid`.
- Kontrast (zmierzony, motyw jasny): etykiety `.label-left`/`.label-right` `#00838d` na bieli 4,53:1, `.pro-label` `#90f` 5,53:1; na ciemnym tle 1 (`#f5f5f5`) teal spada do 4,16:1 (wartość źródła, bez zmian). Kółko białe na torze `--primary` 4,53:1, na torze `#ccc` 1,61:1 — to element nietekstowy; stan wyłączony `#ddd` musi mieć opis tekstowy, bo różni się od `#ccc` tylko odcieniem.
- W wysokim kontraście i na ciemnym tle przełączniki nie mają własnych reguł — tor i kółko wyglądają jak w motywie jasnym; zmienia się tylko tło strony.
- Na szkle jedyne nadpisanie `.liquid-ios26` dotyczy `.switch-diet` w panelu diety (`#dietRecommendationsContent`), gdzie zaznaczony tor jest fioletowy `#90f`.
- Selektory z identyfikatorem zachowano bez zmian; podgląd używa `id` z aplikacji: `resultsModeToggleContainer`, `resultsModeToggle`, `adultBpGuidelineToggle`, `publicationToggleRow`, `reduceToggle`, `stabilizationGroup`, `fluCard`, `fluSwitches`.

Wersja statyczna, przepisana ręcznie z src/css/style.css (.toggle-wrap, .settings-grid, .setting-item, .switch, .slider, #dataToggle, #bpDataToggle, #resultsModeToggle, #adultBpGuidelineToggle, .label-left/.label-right, .pro-label/.pro-tag, .switch-diet, .diet-toggle-group, .switch-pub, .publication-toggle-row, .switch-flu, #fluCard #fluSwitches, .settings-grid .switch, #dietRecommendationsContent .switch-diet, .liquid-ios26 #dietRecommendationsContent .switch-diet).
