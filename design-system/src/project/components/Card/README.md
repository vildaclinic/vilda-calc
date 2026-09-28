# Card

Uniwersalna powierzchnia aplikacji: jasna karta z cienkim obrysem i miękkim cieniem, a w wersji `fieldset` z pływającą legendą w kolorze marki.

## Kiedy używać

Do każdego bloku treści klinicznej na stronach kalkulatorów (`index.html`, `docpro.html`): grupa pól pacjenta (`fieldset.user-card`), karta wyniku porównania (`.card.summary-card`), karta testu stymulacyjnego (`.card.gh-test-card`), karta planu żywieniowego (`.plan-card`), sekcja z nagłówkiem (`section.card`). Karty stoją w kolumnach `.half` formularza `#calcForm` albo w kolumnie wyników `#results`.

## Co dostarcza konsument

- Kontener: `<div class="card">`, `<section class="card">` albo `<fieldset>`; treść dowolna. Nagłówek w karcie to zwykłe `h2`/`h3` z inline `text-align:center` (index.html) lub `margin:0` — w `style.css` nie ma reguły `.card h2`.
- `fieldset.user-card` z `<legend>` jako pierwszym dzieckiem; potem `label` zawierające `input`/`select`. Legenda jest pozycjonowana absolutnie na górnej krawędzi (`top:0; left:0`) i nie rezerwuje miejsca w przepływie: przy `padding-top:.5rem` karty i `margin-top:.7rem` etykiety pierwsza etykieta zachodzi na dolną krawędź legendy o kilka pikseli — dokładnie tak, jak w `index.html`, bo CSS jest ten sam. Jeśli konsument chce odstępu, dodaje go własnym elementem lub marginesem pierwszego dziecka.
- Modyfikatory: `summary-card porownanie-karta` (id `prevSummaryCard`, treść w `.porownanie`), `gh-test-card` (`strong` + `p`), `plan-card` (samodzielna, bez klasy `card`), `section.card` i `#toNormCard`, `.info-card` (własna reguła wysokiego kontrastu), `#professionalModule` (obrys i cień karty bez tła).
- Klasa `_enter` (animacje wejścia z `ios26-ui.js`) jest neutralizowana na szkle.

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `.card` | tło `--card` `#f5f9f9`, padding `1rem`, promień `--radius` 12px, cień `--shadow` `0 2px 6px rgba(0,0,0,.08)`, obrys `1px solid #d0dede` |
| `fieldset` | jak `.card`, padding `1.4rem 1rem 1rem` nadpisany `padding-top:1rem`, `margin-bottom:1.5rem`, `position:relative` |
| `legend` | 600, `--primary` `#00838d`, tło `--card`, `font-size:1.1rem`, `padding:0 .5rem`, `position:absolute; top:0; left:0`, promień `--radius` |
| `section.card`, `#toNormCard` | promień, tło, cień i padding jak `.card`; `#toNormCard h2` wyśrodkowany; `#toNormCard.result-card` obrys `1px solid #d0dede` |
| `fieldset.user-card` | Inter `1.1rem/1.3`, cień, obrys `#d0dede`, `margin-bottom:1rem`, `margin-inline:0`, `padding-top:.5rem`; legenda `1.25rem` 600, `padding-inline:.4rem`; pola Inter `1.05rem`, padding `.65rem .85rem`, promień `.4rem`, obrys `#c0c8c8` |
| `.plan-card` | tło `--card`, padding `1.25rem 1.5rem`, Inter `1.1rem`, obrys `#d0dede`, cień `--shadow` |
| `.gh-test-card` | jak `.card` plus `margin-bottom:1rem`; `strong` `1.5rem`; `p` `1.4rem !important` (późniejsza reguła nadpisuje `.9rem` i styl inline) |
| `.current-summary-card` | `h3` bez górnego marginesu, `.summary-content` `margin-top:.6rem` |
| `#professionalModule` | `margin-top:1.4rem !important`, obrys `#d0dede`, promień, cień, bez tła |
| szkło (`.liquid-ios26 .card`, `.plan-card`, `.result-card`, `.data-card`, `fieldset`, `#timesCard`, `#intakeCard`) | `!important`: tło `--lg-surface-light` (`rgba(255,255,255,.18)`, szkło 4: `.72`), obrys `1px solid --lg-border` (`.32` / `.9`), cień `--lg-shadow`, promień `--lg-radius` 18px, `backdrop-filter: blur(14px) saturate(115%)` |
| wysoki kontrast 1–3 (`.card`, `.plan-card`, `.result-card`, `.data-card`, `fieldset`, …) | `!important`: tło `--hc-surface` (biel `.84/.9/.96`), obrys `--hc-card-border-width` (`1/1.5/2px`) `--hc-border` (`rgba(7,54,62,.18/.24/.32)`), cień `--hc-shadow`, rozmycie `--hc-blur` |
| wysoki kontrast: `.info-card`, `.result-box` | tło `--hc-result-bg` (`.93/.96/.99`), tekst `--hc-text`, cień `0 6px 18px #00000017` |
| `.liquid-ios26 .card._enter`, `fieldset._enter` | `animation:none; transform:none; opacity:1` (`!important`) |

Klasa `liquid-ios26` stoi na `<body>` każdej strony, więc użytkownik widzi wersję szklaną: tło z `--card` i promień 12px są nadpisane przez `--lg-surface-light` i 18px. Legenda zachowuje tło `--card`.

## Tokeny

`--card`, `--radius`, `--shadow`, `--primary`, `--lg-surface-light`, `--lg-border`, `--lg-shadow`, `--lg-radius`, `--hc-surface`, `--hc-border`, `--hc-card-border-width`, `--hc-shadow`, `--hc-blur`, `--hc-result-bg`, `--hc-text`. Literały: `#d0dede` (obrys), `#c0c8c8` (obrys pól w `.user-card`).

## Zasady

- Rób: jedna karta = jeden temat kliniczny; nagłówek `h2`/`h3` jako pierwsze dziecko, w `fieldset` zawsze `<legend>` jako pierwsze dziecko.
- Rób: nowe powierzchnie buduj na klasie `card` (lub `fieldset`), żeby przejęły recepturę szkła, drabinkę `glass-level` i nadpisania wysokiego kontrastu; nie wpisuj bieli na stałe.
- Nie rób: nie ustawiaj własnego `border-radius` ani `background` na karcie — na szkle i tak przegrają z regułą `!important`; wyróżnienie treści rób wewnątrz karty (np. `.result-box`).
- Nie rób: nie polegaj na `p` w `.gh-test-card` jako drobnym tekście; reguła `1.4rem !important` czyni go dużym.
- Kontrast: tekst `--text` `#333` na `--card` `#f5f9f9` daje 11,91:1, a na szkle nad białym `--bg` 12,63:1 (AA). Legenda `--primary` `#00838d` na `--card` `#f5f9f9` daje zmierzone 4,28:1 — poniżej AA 4,5:1 dla tekstu 1,1–1,25rem (wartości ze źródła, pozostawione bez zmian); na szkle (`--lg-surface-light` nad białym `--bg`) ta sama legenda ma 4,53:1; w wysokim kontraście karta dostaje krycie do `.96`, obrys do 2px i tekst `--hc-text`, na ciemnym tle (`--bg` `#f5f5f5` / `#e0e0e0`) szkło czyta się jako jaśniejsza plama, cień pozostaje `--lg-shadow`.

Wersja statyczna, przepisana ręcznie z style.css (39–66, 124–129, 361–364, 538–554, 617–621, 1368–1394, 2024–2035, 2155–2168, 4788–4791, 5157–5166), ios26-v2.css (74–80).
