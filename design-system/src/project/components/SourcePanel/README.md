# SourcePanel

Miękka powierzchnia „Źródła i zastrzeżenia” pod wynikami: gradientowy `fieldset` o promieniu 18px z drobną legendą wersalikami, kolorowymi podpanelami zastrzeżeń i pigułkowym przyciskiem odsłaniającym bibliografię.

## Kiedy używać

Na końcu kolumny wyników kalkulatora (`index.html`, `docpro.html`), po obliczeniu — `vilda_update_prep.js` pokazuje `#sourceFieldset` po renderze wyników (`display:block`), a na pulpicie z paskiem bocznym (`body.has-sidebar`, ≥992px) wymusza go regułą `display:block !important`. Panel `--warning` niesie ograniczenia metody (zakres wieku siatek, populację), panel `--pro` informuje o wartościach dostępnych w trybie profesjonalnym. Notki `.source-note` i definicje `.bp-definition` to drobny druk źródłowy pod pojedynczym wynikiem (ciśnienie, obwody, oddech).

## Co dostarcza konsument

- `<fieldset id="sourceFieldset">` z `<legend>` jako pierwszym dzieckiem („Źródła i zastrzeżenia”). Wymagane `id` — wszystkie reguły są kluczowane po `#sourceFieldset`.
- Podpanele `<div class="source-panel source-panel--warning|--pro">`: `.source-panel__heading` = `<span class="source-panel__icon">` z SVG Lucide (`triangle-alert`, `shield-check`) + `<strong>`; potem `p` i opcjonalna `ul`.
- `<div class="source-toggle-wrap"><button type="button" id="toggleSources">Pokaż źródła</button></div>` — JS przełącza atrybut `hidden` na `<ol id="sourceList">` i podmienia etykietę („Ukryj źródła”). Elementy `a` w liście w kolorze marki.
- `.source-note` (notka pod wynikiem) i `.bp-definition` (definicja z `ul`/`li` i własną `.source-note`); `#respiratoryResult .source-note`, `#bpResult .source-note` — pełna szerokość, `1rem`, łamanie długich adresów.

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `#sourceFieldset` | `margin-top:1.5rem`, obrys `1px solid rgba(0,131,141,.14)`, promień 18px, tło `linear-gradient(180deg,#fffffff2,#f0fcfceb)`, cień `0 8px 28px #00515814`, padding `0 1.1rem 1.2rem`, `overflow-wrap:anywhere` |
| `#sourceFieldset legend` | `float:none`, `padding:0 .6rem`, `margin:0 0 0 .4rem`, `.78rem` 700, tracking `.05em`, wersaliki, kolor `--chrome-label-color` `#5a7274`, `line-height:1`; pozycja z reguły bazowej `legend` (`absolute; top:0; left:0`) |
| `.source-panel` | promień 14px, padding `.88rem 1rem`, `margin-top:.75rem`; `p` `.875rem/1.65` `#374151`, `ul` `padding-left:1.1rem`, `li+li` `margin-top:.25rem` |
| `.source-panel--warning` | tło `#b453090e`, obrys `1px solid rgba(180,83,9,.14)`, nagłówek `#8a3d0a`, ikona `#c2410c` |
| `.source-panel--pro` | tło `#0369a10b`, obrys `1px solid rgba(3,105,161,.12)`, nagłówek `#0c4a6e`, ikona `#0284c7` |
| `.source-panel__heading` | flex, `gap:.5rem`, `margin-bottom:.55rem`; `strong` `.88rem` 700 `line-height:1.25`; ikona 15×15 px, SVG 100 % |
| `#sourceFieldset #toggleSources` | pigułka 999px, padding `.44rem 1.1rem`, obrys `1px solid rgba(0,131,141,.22)`, tło `#ffffffbf`, tekst `--primary` `.82rem` 600, tracking `.02em`, cień `0 2px 8px #00515812`; `:hover` tło `#fffffff2`, cień `0 4px 14px #0051581f` |
| `#sourceList` | `.8rem/1.7` `#4b5563`, `padding-left:1.35rem`, `margin-top:.75rem`, `li+li` `.4rem`; `[hidden]` = ukryta |
| `.bp-definition` | `.9rem/1.35`, `margin-top:.6rem`; `ul` `margin:.4rem 0 0 1.2rem`; `.source-note` `.85rem` `#555` (tak samo `.circ-definition .source-note`) |
| `#respiratoryResult .source-note`, `#bpResult .source-note` | blok `1rem`, `margin-top:.4rem`, `#555`, `hyphens:auto`; ≤640px `.98rem/1.45` |
| szkło (`.liquid-ios26 fieldset`) | `!important`: tło `--lg-surface-light`, obrys `1px solid --lg-border`, cień `--lg-shadow`, promień `--lg-radius` 18px, `blur(14px) saturate(115%)` — gradient i cień własne `#sourceFieldset` są nadpisane |
| szkło (`.liquid-ios26 button`) | `!important`: tło `#fff3`, obrys `--lg-border`, tekst `#111`, promień 14px, cień `0 4px 12px #0000001a`, `blur(10px)` — pigułka `#toggleSources` traci własny obrys, kolor i promień 999px; tak wygląda w podglądzie |
| wysoki kontrast (`fieldset`) | tło `--hc-surface`, obrys `--hc-card-border-width` `--hc-border`, cień `--hc-shadow`, rozmycie `--hc-blur` (`!important`) |

Podpanele `--warning`/`--pro` nie mają reguł motywów: ich odcienie bursztynu i błękitu pozostają w każdym trybie, na szkle leżą na półprzezroczystej bieli.

## Tokeny

`--primary`, `--chrome-label-color`, `--lg-surface-light`, `--lg-border`, `--lg-shadow`, `--lg-radius`, `--hc-surface`, `--hc-border`, `--hc-card-border-width`, `--hc-shadow`, `--hc-blur`. Literały: `rgba(0,131,141,.14)`, `#fffffff2`, `#f0fcfceb`, `#00515814`, `#b453090e`, `rgba(180,83,9,.14)`, `#8a3d0a`, `#c2410c`, `#0369a10b`, `rgba(3,105,161,.12)`, `#0c4a6e`, `#0284c7`, `#374151`, `#4b5563`, `#ffffffbf`, `rgba(0,131,141,.22)`, `#555`.

## Zasady

- Rób: każdy podpanel zaczynaj od nagłówka z ikoną i słowem („Ograniczenia”, „Tryb profesjonalny”) — kolor tła nie jest jedynym nośnikiem znaczenia.
- Rób: bibliografię trzymaj w `<ol id="sourceList">` i przełączaj wyłącznie atrybutem `hidden` oraz `aria-expanded` na przycisku; etykieta przycisku zmienia się razem ze stanem.
- Nie rób: nie zmieniaj `id="sourceFieldset"`, `id="toggleSources"`, `id="sourceList"` — style i `vilda_update_prep.js` używają tych identyfikatorów.
- Nie rób: nie wstawiaj tu wyników liczbowych ani ostrzeżeń klinicznych wymagających działania — to miejsce na źródła i zastrzeżenia metody; ostrzeżenia należą do grupy Komunikaty.
- Kontrast (zmierzone nad białym `--bg`): nagłówek `#8a3d0a` na `#b453090e` 7,09:1, `#0c4a6e` na `#0369a10b` 8,89:1, akapity `#374151` 9,57:1 / 9,69:1, lista `#4b5563` na bieli 7,56:1, legenda `#5a7274` 5,13:1, link i własna pigułka `#00838d` 4,53:1 — wszystko AA. Ikona `#0284c7` na `#0369a10b` ma 3,85:1: poniżej 4,5:1 dla tekstu, ale ikona jest grafiką obok słowa „Tryb profesjonalny” (próg 3:1 spełniony); wartość ze źródła, bez zmian. W wysokim kontraście zewnętrzny `fieldset` przejmuje `--hc-surface` i grubszy obrys, na szkle 4 tło rośnie do `rgba(255,255,255,.72)`.

Wersja statyczna, przepisana ręcznie z style.css (986–998, 1080–1083, 1205–1206, 1212–1226, 1401–1515, 39–55, 538–549, 569–590, 630–636, 659–664), ios26-v2.css (74–93), vilda_update_prep.js (vildaUpdatePrepPrepareSourceFieldsetForUpdate).
