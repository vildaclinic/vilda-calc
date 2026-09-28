# ConverterPanel

Przelicznik jednostek laboratoryjnych zbudowany jako wysoka biała „smart-karta" (promień 16 px, obrys 0.5 px rgba(0,131,141,0.18), delikatna radialna poświata teal, maks. 720 px) z numerowanymi krokami oddzielonymi liniami 0.5 px rgba(0,131,141,0.10): każdy krok ma wersalikową etykietę .72rem #1a1a1a i pole lub `<select>` o promieniu 8 px z obrysem 0.5 px teal; sekcja wyniku pokazuje wartość 2.6rem/500 w kolorze stanu obok jednostki 1rem #5a6a6e, pasek zakresu z animowanym markerem i wyśrodkowaną linię zakresu referencyjnego.

## Kiedy używać

- Strona „Przelicznik jednostek laboratoryjnych" (`przelicznik-jednostek.html`, `.lab-container > .lab-grid > .lab-card.lab-full.lab-smart-card#labResultsCard`).
- Karty towarzyszące (`.lab-card.lab-full`): informacje o zakresach z `.lab-cross-link`, „Zaproponuj badania" (`.lab-suggest-card` z chipami `button.lab-suggest-chip`) i zastrzeżenie `.lab-disclaimer`.

Nie używaj do formularzy kalkulatora głównego (`FormField`) ani do kart wyników innych modułów.

## Co dostarcza konsument

- Karta `.lab-card.lab-full.lab-smart-card` z `<h1>` („Przelicznik jednostek laboratoryjnych") i kolejnymi `.lab-step` = `.lab-step-num` (numer; `.is-done` zielony ✓-kolor, `.is-active` teal z poświatą i pulsowaniem) + `.lab-step-body` (`.lab-step-label` z opcjonalnym `<span class="lab-step-label-hint">` teal lub `<span class="lab-step-label-opt">` „— opcjonalnie", potem kontrolki i `.lab-step-hint`). Krok ukryty ma `.is-hidden`.
- Krok 1: `.lab-search-wrap > .lab-substance-input-wrap > input#labSubstance.lab-substance[role="combobox"]` + `<button class="lab-substance-clear" aria-label="Wyczyść pole substancji">×</button>`, lista `.lab-substance-dropdown[role="listbox"]` (fixed, pozycję ustala JS; `.lab-substance-group-label`, `.lab-substance-option(.is-active)`, `-label`, `-meta`, `-empty`), podpowiedź `.lab-substance-hint` (`.lab-hint-unknown` bursztynowa).
- Krok 2: `.lab-input-row` = `<input type="text" inputmode="decimal">` (1.25rem/500 teal, liczby tabelaryczne) + `<select>`; błąd w `.lab-error`.
- Krok 3: `.lab-step-target-row` = `<span class="lab-step-target-arrow">→</span>` + `<select>`.
- Krok 4: `.lab-mini-pills` z `<button class="lab-mini-pill">` (`.is-active` dla wybranej pory pomiaru).
- Sekcja wyniku `.lab-result-section` (`.is-empty` przyciemnia zawartość do 0.4) = `.lab-result-head` (`.lab-result-title` „Wynik" + pigułka `.lab-range-status.is-normal|is-below|is-above|is-uwaga-high|is-uwaga-low`) + `.lab-result-big` (`.lab-result-big-value` z tą samą klasą stanu + `.lab-result-big-unit`; przed wpisaniem `.lab-result-big-placeholder`) + `#labRangeBlock` z `.lab-range-card` (`.lab-range-header` > `.lab-range-title`, skala `.lab-range-scale` ze zmiennymi `--low-pct`, `--high-pct`, `--low-dark-pct`, `--high-dark-pct` w `style`, marker `.lab-range-marker` ze stanem i `--marker-pct`, opcjonalnie `.lab-range-uwaga-note`) + `.lab-result-source` + `<button class="lab-show-all-toggle" aria-expanded>` z `<span class="arr">▼</span>`.
- Na końcu karty `<button id="labClearBtn" class="lab-clear-btn">` z ikoną eraser (w aplikacji `<i data-lucide="eraser">`) i tekstem „Wyczyść wszystkie pola" — reguła używa selektora z `id`, więc `id="labClearBtn"` jest wymagane.
- Toast `.lab-toast` (fixed w prawym dolnym rogu, `.is-visible` po skopiowaniu). W podglądzie toast stoi w przepływie: nadpisanie tylko pozycji (`position:static`, `transform:none`, `!important`) w stylu podglądu; dodatkowo podgląd wyłącza animację wejścia kroków (`lab-step-slidein`), żeby zrzut był stabilny — w aplikacji krok wjeżdża 0.3 s.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.lab-card` | tło `--card`, wypełnienie 1.5rem, promień `--radius`, cień `--shadow`, obrys 1 px #d0dede |
| `.lab-smart-card` | tło #ffffff, promień 16 px, obrys 0.5 px rgba(0,131,141,0.18), wypełnienie 1.6rem 1.7rem, szerokość min(720px, 100%), `::before` radialna poświata rgba(0,131,141,0.05); `h1` 1.3rem/500 #00838d |
| `.lab-step` | flex, odstęp .85rem, dolna linia 0.5 px rgba(0,131,141,0.10), animacja `lab-step-slidein` .3s; ostatni bez linii |
| `.lab-step-num` | koło 26 px, .8rem/500, tło rgba(0,131,141,0.08), tekst #7a8587; `.is-done` #1D9E75/#fff; `.is-active` #00838d/#fff, poświata 0 0 0 4px rgba(0,131,141,0.15), `lab-step-glow` 2s |
| `.lab-step-label` | .72rem/600 #1a1a1a wersaliki, odstęp liter .05em; `-hint` teal 400 bez wersalików; `-opt` #1a1a1a 400 |
| `.lab-step input[type="text"]`, `input[type="number"]`, `select` | wypełnienie .55rem .85rem, obrys 0.5 px rgba(0,131,141,0.25), promień 8 px, .92rem #2a3a3c; `:focus` obrys #00838d i poświata 0 0 0 3px rgba(0,131,141,0.08); placeholder #c7cfd1 |
| `.lab-step .lab-input-row input[type="text"]` | 1.25rem/500 #00838d, liczby tabelaryczne |
| `.lab-mini-pill` | wypełnienie .4rem .75rem, promień 6 px, .8rem, tło rgba(0,131,141,0.06), obrys 0.5 px rgba(0,131,141,0.18), tekst #2a3a3c; `:hover` tło 0.12; `.is-active` #1D9E75/#ffffff/600, cień 0 1px 3px rgba(29,158,117,0.25) (`:hover` #1a8d6a); wszystko z `!important`, także dla `.liquid-ios26 button` |
| `.lab-substance-clear` | 24 px, bez tła, „×" 1.25rem/700 #d32f2f (`:hover` #b71c1c), pozycjonowany w polu |
| `.lab-result-section` | rozciągnięta na krawędzie karty (marginesy ujemne 1.7rem/1.6rem), górna linia 0.5 px rgba(0,131,141,0.15), własna poświata `::before` |
| `.lab-result-big-value` | 2.6rem/500, interlinia 1, liczby tabelaryczne; normal #00838d, `.is-below` #c75d00, `.is-above` #b91c1c, `.is-uwaga-high` #911c1c z `lab-value-glow-red`, `.is-uwaga-low` #a6491e z `lab-value-glow-amber` |
| `.lab-range-status` | pigułka .78rem/500 (0.95rem po regule czytelności), kropka 6 px oddychająca: `.is-normal` #0f6e56 na rgba(29,158,117,0.12), `.is-below` #8a4a18 na rgba(216,90,48,0.12), `.is-above` #8a1818 na rgba(185,28,28,0.10), `.is-uwaga-high` #7a1414 z obrysem rgba(145,28,28,0.30), `.is-uwaga-low` #6a3a14 z obrysem rgba(166,73,30,0.30) |
| `.lab-range-scale` | pasek 10 px, promień 5 px, gradient stref: bursztyn/pomarańcz → zieleń rgba(29,158,117,0.50) między `--low-pct` i `--high-pct` → czerwień |
| `.lab-range-marker` | koło 20 px #fff z obrysem 3 px w kolorze stanu i halo `::after`; `.is-normal` #1D9E75 (`lab-marker-breath-normal` 2s, `lab-halo-ripple`), `.is-below` #d8632a, `.is-above` #b91c1c, `.is-uwaga-*` z „!" w środku, `lab-marker-shake` i pulsowaniem |
| `.lab-range-uwaga-note` | notka .78rem/500 z lewym paskiem 3 px: `.is-uwaga-high` #7a1414 / #911c1c, `.is-uwaga-low` #6a3a14 / #a6491e |
| `.lab-result-source` | 1.05rem/500 #1a1a1a, wyśrodkowana; `<strong>` 600 |
| `.lab-show-all-toggle` | pełna szerokość, tło rgba(0,131,141,0.04), obrys 0.5 px rgba(0,131,141,0.12), promień 8 px, .83rem #5a6a6e; strzałka `.arr` teal obraca się przy `aria-expanded="true"` |
| `#labClearBtn` | przezroczysty, obrys 1.5 px `--primary`, tekst `--primary`, promień `--radius`, pełna szerokość, margines górny 1.25rem; `:hover` tło rgba(0,131,141,0.07) |
| `button.lab-suggest-chip` | pigułka 1rem, tło #fff, obrys rgba(42,138,138,0.45), tekst #1d6363 .9rem/500; `:hover` tło rgba(42,138,138,0.08); `.is-selected` tło rgba(42,138,138,0.28), tekst #134848/600, poświata 3 px |
| `.lab-cross-link` | link-karta z ikoną, tło rgba(42,138,138,0.07), obrys rgba(42,138,138,0.25), tekst #1d6363 |
| `.lab-toast` | fixed prawy dół, tło rgba(30,60,60,0.92), tekst #fff .9rem, promień .6rem, cień 0 6px 24px rgba(0,0,0,0.18); `.is-visible` widoczny |

Poniżej 600 px pola i pigułki dostają 16 px (`!important`, zapobiega auto-zoomowi iOS), pigułki min. 44 px wysokości; poniżej 480 px `.lab-input-row` ma jedną kolumnę.

## Tokeny

`--card`, `--radius`, `--shadow`, `--primary`, `--danger`; wysoki kontrast: `--hc-surface`, `--hc-border`, `--hc-card-border-width`, `--hc-shadow`, `--hc-blur`, `--hc-result-bg`, `--hc-muted`, `--hc-text`, `--hc-input-bg`, `--hc-input-border`, `--hc-focus-width`, `--hc-focus-color`; przez globalne pola i przyciski: `--lg-border`, `--secondary`.

## Zasady

- Rób: stan wyniku pokazuj jednocześnie kolorem wartości, pigułką z tekstem („W normie", „Poniżej normy", „Powyżej normy", „Uwaga") i położeniem markera — kolor nigdy sam.
- Rób: wartość liczbową i zakres pisz liczbami tabelarycznymi z przecinkiem dziesiętnym po polsku („5,4").
- Rób: numer kroku przełączaj w `.is-done` po wypełnieniu i `.is-active` dla bieżącego; tylko jeden krok jest aktywny.
- Nie rób: nie zaokrąglaj współczynników ani zakresów w treści karty — to dane kliniczne z modułu, nie z systemu projektowego.
- Nie rób: nie usuwaj `id="labClearBtn"` ani `!important` z pigułek i chipów — w aplikacji przebijają globalny szklany wygląd `button`.
- Kontrast: teksty stanów (#c75d00, #b91c1c, #911c1c, #a6491e, #0f6e56) na bieli mają ≥ 4.5:1 (`.lab-range-status.is-normal` 5.44:1, `.lab-step-num.is-active` biały na #00838d 4.53:1, toast 9.33:1); #7a8587 numerów nieaktywnych (3.80:1) i podpowiedzi jest celowo wyciszony. Poniżej 4.5:1 (wartości źródła — nie zmieniaj ich w partialu): biały tekst na #1D9E75 w `.lab-mini-pill.is-active` i `.lab-step-num.is-done` ma 3.39:1.
- Wysoki kontrast (poziomy 1–3, na `body.liquid-ios26`): karty i lista substancji na `--hc-surface` z obrysem `--hc-card-border-width` `--hc-border` i cieniem `--hc-shadow`, sekcja wyniku na `--hc-result-bg`, etykiety `--hc-muted`, pola `--hc-input-bg`/`--hc-input-border`/`--hc-text` z fokusem `--hc-focus-*`; od poziomu 2 numery kroków i pigułka stanu dostają obrys, marker biały pierścień 2 px, linia zakresu `--hc-text`. Szkło (poziomy 1–4): karta zostaje biała, a obrys i cień rosną z poziomem (do 1 px rgba(0,131,141,0.40) i 0 10px 28px rgba(0,131,141,0.12) na poziomie 4); lista substancji od poziomu 2 ma mocniejszy cień. Ciemne tło: poziom 1 karty #fafafa z obrysem 0.22, poziom 2 #ffffff z obrysem 0.28 i cieniem 0 2px 8px rgba(0,0,0,0.04).

Wersja statyczna, przepisana ręcznie z src/html-styles/przelicznik-jednostek.css (33-88, 91-115, 197-275, 779-1190, 1192-1400, 1403-1518, 1573-1799, 1859-1877, 1883-2616, 2619-2633, 2788-2851, 2903-2979, 2983-3024, 3030-3074, 3155-3229, 4050-4054, 4398-4406, 4428-4675), src/css/ios26-v2.css (85-93, 187-190), src/css/style.css (60-66, 569-601).
