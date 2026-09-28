# SettingItem

Wiersz ustawienia na powierzchni karty ustawień: etykieta po lewej i przełącznik w stylu iOS (46×26 px) po prawej, układany w siatce `.settings-grid` po 270 px.

## Kiedy używać

- Do binarnych opcji interfejsu w sekcjach `SettingsAccordion` na `ustawienia.html`: „Pokaż dock”, „Pokaż strzałkę nawigacyjną”, „Szybki dock (wersja testowa)”, przełączniki widoczności kart generowane do `#settingsGrid`.
- Nie do wartości liczbowych ani wyboru z listy — tam służą karty sterujące (`BackupCard`) z suwakiem lub `select`.

## Co dostarcza konsument

- Siatka `div.settings-grid` (w aplikacji `id="settingsGrid"`), w niej `div.setting-item` → `span` z etykietą + `label.switch` → `input[type=checkbox]` + `span.slider`.
- Stan przełącznika to atrybut `checked`; blokada to `disabled` na `input`. `input` jest ukryty (`display:none` ze `style.css`), więc klikalny jest cały `label.switch`.
- Wysoki kontrast wymaga klasy `page-settings` na `<body>`.

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `.settings-grid` | `grid-template-columns:repeat(auto-fit,minmax(270px,1fr))`, `gap:1rem` (ustawienia.css nadpisuje 260px ze style.css) |
| `.setting-item` | flex `space-between`, `gap:1rem`, padding `1rem 1.05rem`, promień `--settings-card-radius` (18px), obrys 1px `--settings-card-border`, tło `--settings-card-bg`, cień `0 12px 28px #07363e0d` |
| `.setting-item span` | `flex:1` (style.css), .96rem/600 `#07363e`, `line-height:1.45` |
| `.switch` | 46×26 px, `display:inline-block`; ze style.css pozostaje `margin:0 .75rem` |
| `.settings-grid .switch .slider` | tor `#ccd9d9`, promień 26px, przejście `.4s` (reguła z `.settings-grid` wygrywa specyficznością z `#ccc` z ustawienia.css) |
| `.switch .slider:before` | gałka 22 px, biała, `left:2px; top:2px`, cień `0 0 2px #0003` |
| `input:checked+.slider` | tor `--primary`; gałka przesunięta regułą `.settings-grid … left:auto; right:2px; transform:none` |
| `input:disabled+.slider` | tor `#ddd!important`, kursor `not-allowed` |
| Wysoki kontrast 1–3 (`body.page-settings`) | tło `--hc-surface`, obrys `--hc-card-border-width solid --hc-border`, cień `--hc-shadow`, rozmycie `--hc-blur` |

## Tokeny

`--settings-card-radius`, `--settings-card-border`, `--settings-card-bg`, `--primary`, `--hc-surface`, `--hc-border`, `--hc-card-border-width`, `--hc-shadow`, `--hc-blur`.

## Zasady

- Etykieta jest zawsze tekstem w `span`; stan przełącznika czyta się z koloru toru (teal = włączony, `#ccd9d9` = wyłączony, `#ddd` = zablokowany) i pozycji gałki, nie tylko z koloru.
- Nie umieszczaj dwóch przełączników w jednym `.setting-item`; jeden wiersz = jedna opcja.
- Etykiety krótkie (do dwóch wierszy przy 270 px); dłuższe objaśnienie daj w `p.settings-section-note` nad siatką.
- Ten sam `.switch` jest reużywany na stronie głównej (`.switch-pub`, `.switch-diet`, `#dataToggle`) w wymiarze 60×30 px — poza `.settings-grid` obowiązują tamte reguły.
- Na szkle przełącznik nie ma osobnej reguły; wysoki kontrast zmienia tylko powierzchnię wiersza.

Wersja statyczna, przepisana ręcznie z ustawienia.css, style.css, ustawienia.html
