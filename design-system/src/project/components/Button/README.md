# Button

Podstawowy przycisk aplikacji: każdy `<button>` (oraz `input[type=button|submit]`) dziedziczy jedną regułę globalną, a warianty dokładają klasę lub `id`.

## Kiedy używać

Do każdej akcji wykonywanej kliknięciem w kartach klinicznych i formularzach: generowanie siatki, zapis, anulowanie, dodanie wiersza pomiaru, rozwinięcie modułu terapii, akcje w oknie przypomnienia. Do akcji w pasku górnym użyj ChromeActionButton, do ekranów konta AuthButton, do funkcji PRO ProButton.

## Co dostarcza konsument

- Element: `<button type="button">` z tekstem. Znacznik `type="button"` jest obowiązkowy poza formularzem wysyłanym.
- Klasy wariantów na tym samym elemencie: `primary-btn`, `secondary-btn`, `icon`, `add-row`, `module-btn` (+ `active-toggle`), `vild-tanner-toggle`, a w oknie przypomnienia `vild-rem-dlg-pri` / `vild-rem-dlg-destr` / `vild-rem-dlg-ghost` wewnątrz `<div class="vild-rem-dlg-acts">`.
- Zagnieżdżenie modułów: `<div id="modulesWrapper"><div class="module-btn-wrapper"><button class="module-btn">…</button></div></div>`. Wysoki kontrast i układ 50/50 od 700 px działają tylko pod `#modulesWrapper`.
- Wymagane `id` (źródło styluje po identyfikatorze): przełączniki sekcji `#toggleIntakeCard`, `#toggleFoodCard`, `#toggleNutritionMicrosCard`, `#toggleNutritionNormsCard`, `#toggleDownSyndrome`, `#toggleCircSection`, `#generateCentileChart`, `#generateCentileChartBasic` (pełna szerokość, turkus przywrócony mimo szkła); moduły `#toggleAbxTherapy`, `#toggleFluTherapy`, `#toggleObesityTherapy`, `#toggleHypertensionTherapy`, `#toggleThyroidCancerKids`, `#toggleIgfTests`, `#toggleSnp`, `#toggleTurner`, `#togglePws`, `#toggleSga`, `#toggleIgf1`, `#toggleGhMonitor` (szkło z wyśrodkowaniem, obrys `brand-light` po `active-toggle`); `#tannerToggleBtn` dla przełącznika danych pokwitaniowych.
- Stany: `disabled` (atrybut), `active-toggle` (klasa ustawiana przez JS po rozwinięciu modułu), `aria-expanded` na przełącznikach.
- Ikona w `button.icon`: znak `×` lub SVG Lucide inline; zawsze z `aria-label`.

## Warianty i stany

| Klasa / selektor | Wygląd (motyw domyślny = szkło) |
| --- | --- |
| `button` (bez klasy) | Pigułka `#fff3`, obrys 1px `lg-border`, tekst `#111`, promień 14px, `blur(10px) saturate(120%)`, cień `0 4px 12px #0000001a`; padding `.55rem 1.1rem` z reguły bazowej. Reguła bazowa (tło `primary` #00838d, biały tekst, promień `radius` 12px) jest widoczna tylko bez `liquid-ios26`. |
| `:hover` / `:focus-visible` | `translateY(-1px) scale(1.02)`, cień `shadow-l`; w bazie tło `secondary` #00b0a6 i cień `shadow`. |
| `:disabled` | `opacity:.45`, `cursor:not-allowed`. |
| `.primary-btn` | Jak przycisk bez klasy; różni się paddingiem `.6rem 1rem` i `border:0`. Turkus wraca tylko z `id` sekcji (np. `#toggleIntakeCard`): tło `primary`, tekst `#fff`, `font-weight:600`, `width:100%`, hover `secondary` z uniesieniem. Margines: reguła bazowa daje `.5rem 0`, ale późniejsza reguła o tej samej specyficzności (style.css 1868) ustawia `margin:0 auto!important`, a poniżej 699 px `margin:0!important` (style.css 4825). |
| `.secondary-btn` | Tekst `primary` na przezroczystym tle, padding `.3rem .6rem`, promień `radius`; pod szkłem otrzymuje białą pigułkę jak inne przyciski. |
| `button.icon` | Przezroczysty, glif `danger` #c62828, `font-size:1.25rem` (pierwsza definicja: 1.35rem, `font-weight:900`), padding `.25rem .5rem`; hover tło `#c628281a` lub `opacity:.8`. Szkło wymusza kolor `danger`. |
| `button.add-row` | Tło `secondary`, biały tekst, promień 4px, padding `.45rem .9rem`, `margin-top:.7rem`; hover tło `primary`. Pod szkłem biała pigułka. |
| `.module-btn` | `width:100%`, `max-width:520px`, promień `radius`, padding `.6rem 1rem`, `font-size:1rem`, cień `shadow`; hover cień `0 4px 8px #00000026`. Kolor nadaje moduł (JS/inline) lub szkło (`#fff3`, `#111`). |
| `.module-btn.active-toggle` | Obrys `1px solid brand-light` #00b0a6 (`#modulesWrapper #toggleThyroidCancerKids.active-toggle`; pod szkłem `.liquid-ios26 .active-toggle` dla każdego przełącznika). |
| `.vild-tanner-toggle` | Blok o szerokości treści, wyśrodkowany (`margin:0.7rem auto 0`), padding `8px 12px`, `.82rem`/600, przezroczysty, obrys `1px #cfe0e3`, promień 9px, tekst `#5a7274`, bez cienia i rozmycia; hover obrys i tekst `#00838d`. |
| `.vild-rem-dlg-acts button` | `.82rem`/600, biały, obrys `1px #d7e9ec`, tekst `#0f2b33`, promień 9px, padding `8px 11px`, `inline-flex` z `gap:6px`; hover `#f5fafb`. Kontener: `flex-wrap`, `gap:7px`, padding `10px 16px 14px`, górna linia `#eef2f3`. |
| `.vild-rem-dlg-pri` | Tło i obrys `#00838d`, tekst `#fff`; hover `#006f78`. |
| `.vild-rem-dlg-destr` | Tekst `#c2271d`, obrys `#f3c9c5`. |
| `.vild-rem-dlg-ghost` | Bez obrysu, tekst `#5b6672`. |
| `.btn-accent` (tylko pod szkłem) | Tło `color-mix(in srgb, lg-accent 40%, transparent)`, tekst `#fff`; klasa nadawana przez `ios26-ui.js`. |
| `button._pressed` (tylko pod szkłem) | `scale(.96)`, cień `0 2px 8px #0000001f`; klasa chwilowa z `ios26-ui.js` podczas naciśnięcia. |
| `.btn-icon` (tylko pod szkłem) | `inline-flex`, `gap:.5rem`; SVG 20px, `stroke:currentColor`, `stroke-width:1.75`. |
| `≤600px` | `button`, `input[type=button|submit]`: `width:100%`, `margin-top:.5rem` (okno przypomnienia i przełącznik Tannera to nadpisują). |

Wysoki kontrast (poziomy 1–3): `#modulesWrapper .module-btn` przechodzi na `hc-module-btn-bg`, tekst `hc-text`, obrys `hc-card-border-width solid hc-module-btn-border`, cień `hc-module-btn-shadow`, bez rozmycia; hover `hc-module-btn-hover-bg`; `active-toggle` tło `hc-module-btn-active-bg`, obrys `hc-module-btn-active-border`, cień `0 0 0 1px #00838d1f` + `hc-module-btn-active-shadow`. Każdy `button:focus-visible` i `a:focus-visible` dostaje `outline: hc-focus-width solid hc-focus-color` z odsunięciem 2px. Ciemne tło nie zmienia przycisków.

## Tokeny

`--primary`, `--secondary`, `--brand-light`, `--danger`, `--radius`, `--shadow`, `--shadow-l`, `--anim-fast`, `--lg-border`, `--hc-text`, `--hc-card-border-width`, `--hc-module-btn-bg`, `--hc-module-btn-border`, `--hc-module-btn-shadow`, `--hc-module-btn-hover-bg`, `--hc-module-btn-active-bg`, `--hc-module-btn-active-border`, `--hc-module-btn-active-shadow`, `--hc-focus-width`, `--hc-focus-color`.

## Zasady

- Rób: jedna akcja główna w karcie; etykieta w trybie rozkazującym („Generuj siatkę centylową”, „Zapisz dane”); `type="button"` na każdym przycisku poza wysyłką formularza.
- Rób: gdy CTA ma być turkusowe pod szkłem, dopisz regułę z prefiksem `.liquid-ios26`, `!important` i wyzerowanym `backdrop-filter` oraz `box-shadow`, tak jak robią to przełączniki sekcji. Bez tego szkło spłaszczy przycisk do białej pigułki.
- Rób: stan przekazuj tekstem lub ikoną z `aria-label`, nie samym kolorem; `active-toggle` łącz z `aria-expanded`.
- Nie rób: nie dodawaj klas `btn`, `btn-primary`, rozmiarów ani wariantów, których nie ma w źródle; nie zmieniaj promienia (12px baza, 14px szkło, 9px dialog, 4px `add-row`).
- Nie rób: nie umieszczaj `.module-btn` poza `#modulesWrapper`, bo straci reguły wysokiego kontrastu i układ dwóch kolumn.
- Kontrast (zmierzony): tekst `#111` na `#fff3` zależy od tła strony (na bieli 18,9:1), więc przyciski szkła wymagają jasnego `bg`; `#fff` na `#00838d` 4,5:1; `#fff` na `secondary` `#00b0a6` (tło bazowe `button.add-row`, hover przycisków bazowych i przełączników sekcji) ma tylko 2,7:1 — wartość pochodzi ze źródła, dlatego stan hover nie może być jedynym nośnikiem informacji; `#5a7274` (Tanner) 5,1:1, `#0f2b33` 14,9:1, `#5b6672` (ghost) 5,9:1; `button.icon` (`#c62828`, 5,6:1) i `vild-rem-dlg-destr` (`#c2271d`, 5,8:1) mają znaczenie destrukcyjne — potwierdzaj akcję.
- Na szkle: bazowe przyciski są białymi pigułkami; w wysokim kontraście rozmycie znika, a obrys i cień pochodzą z zestawu `hc-*`.

Wersja statyczna, przepisana ręcznie z src/css/style.css (100-119, 569-591, 633-635, 659-663, 809-816, 864-867, 1868-1869, 2283-2289, 2865-2871, 3221-3225, 3881-3892, 3898-3913, 4825-4826, 5167-5179, 5196-5198, 7420-7465), src/html-styles/index.css (305-342), src/css/ios26-v2.css (85-117, 122-130, 199-200)
