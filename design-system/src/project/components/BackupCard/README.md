# BackupCard

Karta sterująca strony ustawień: nagłówek z tytułem i tagiem-pigułką, opis, wiersz akcji z przyciskami `AuthButton`; wariant kopii zapasowych układa kilka sekcji oddzielonych cienką linią, wariant niebezpieczny ma różowy gradient i czerwony przycisk.

## Kiedy używać

- Do pojedynczych ustawień ze stanem i akcją wewnątrz `SettingsAccordion`: folder kopii, pełna kopia konta, automatyczny backup, synchronizacja, biometria.
- Wariant `.settings-backup-card` — gdy jedna karta ma kilka powiązanych podsekcji (folder → pełna kopia → automatyczny backup).
- Wariant `.settings-danger-card` — wyłącznie do nieodwracalnych akcji na koncie („Usuń to konto z urządzenia”), w sekcji `settings-accordion--danger`.

## Co dostarcza konsument

- Siatka `div.settings-control-grid` (auto-fit 280 px); karta `div.settings-control-card` z opcjonalnymi `settings-control-card--wide` (cała szerokość), `settings-backup-card`, `settings-danger-card`.
- Nagłówek `div.settings-control-header` → `h3.settings-control-title` + `span.settings-tag` (teksty z aplikacji: „brak”, „Pobrane”, „wymaga logowania”, „Backup”, „—”; `settings-tag--danger` „Nieodwracalne”).
- Opis `p.settings-control-desc`; podpowiedź `p.settings-control-hint`; notatka `p.settings-inline-note.settings-backup-note`, ostrzeżenie `.settings-note-warn` (np. „⚠ To urządzenie nie synchronizowało się od N dni. …”).
- Akcje: `div.settings-card-toggle-row` (z `.settings-backup-btn-row` wyrównane do lewej) z przyciskami `button.vilda-auth-btn.vilda-auth-btn-small` + `vilda-auth-btn-primary` / `vilda-auth-btn-ghost` / `settings-danger-btn`, z klasą `settings-backup-btn` (min 175 px) lub `settings-backup-run-btn` (min 140 px).
- Wiersz sterowania `div.settings-backup-controls-row`: `label.settings-backup-checkbox-label` z `input.settings-backup-checkbox`, `label.settings-backup-interval-label` z `select.vilda-auth-input.settings-backup-select`, przycisk.
- W karcie kopii sekcje `div.settings-backup-section` rozdziela `div.settings-backup-sep[role=separator]`; w karcie niebezpiecznej pole `input.vilda-auth-input.settings-danger-input` i status `p.settings-inline-note.settings-danger-status`.
- `id` kart i elementów (`backupFolderCard`, `backupFolderTag`, `autoBackupEnabledToggle`, `removeUserCard`…) są wymagane tylko przez skrypty strony; CSS ich nie używa.
- Wysoki kontrast wymaga klasy `page-settings` na `<body>`.

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `.settings-control-card` | padding `1.05rem 1.1rem`, promień 20px, obrys 1px `--settings-card-border`, tło `--settings-card-bg`, cień `0 12px 30px #07363e0d` |
| `.settings-control-card--wide` | `grid-column:1 / -1` |
| `.settings-control-title` | 1rem, `line-height:1.28`, `#07363e` |
| `.settings-tag` | pigułka .78rem/700, `letter-spacing:.02em`, tło `#00838d14`, obrys `rgba(0,131,141,.12)`, kolor `#145861` |
| `.settings-tag--danger` | tło `#b0002012`, obrys `#b000202e`, kolor `#b00020` |
| `.settings-control-desc` / `-hint` / `.settings-inline-note` | .9rem `#566b71` (margines `.48rem 0 .95rem`) / .82rem `#566b71` / .91rem `#586d72`, `max-width:760px` |
| `.settings-backup-card` + `.settings-backup-section` + `.settings-backup-sep` | karta bez paddingu; sekcje `1.05rem 1.1rem`; separator 1px `#00838d1a` |
| `.settings-backup-checkbox` | 18×18 px, `accent-color:--primary` |
| `.settings-backup-select` | `width:auto`, padding `6px 10px`; reszta z `.vilda-auth-input` (obrys 1.5px `#d6dde0`, promień 12px, strzałka `data:` SVG) |
| `.settings-note-warn` | padding `.6rem .75rem`, obrys `#b4540033`, promień 12px, tło `#b454000f`, kolor `#6e4600`, 600 |
| `.settings-danger-card` | obrys `#b000202e`, tło `180deg,#fffffff5,#fff8f9e6` |
| `.settings-danger-btn` | `#b00020` z białym tekstem (`!important`), min 200 px, hover `#8a0018` |
| Szkło (`.liquid-ios26 button`, `.liquid-ios26 select`) | globalna reguła szkła (`#fff3`, obrys `--lg-border`, tekst `#111`, promień 14px, rozmycie 10px, `!important`) ma wyższą specyficzność niż `.vilda-auth-btn-primary` i `.settings-danger-btn`, więc na stronie ustawień wszystkie przyciski karty są białymi pigułkami; `select` dostaje `#ffffffd9`, obrys `rgba(0,0,0,.12)`, promień 12px |
| Wysoki kontrast 1–3 (`body.page-settings`) | karta `--hc-surface`, obrys `--hc-card-border-width solid --hc-border`, cień `--hc-shadow`, rozmycie `--hc-blur`; opisy, notatki i podpowiedzi `--hc-muted` |
| `@media(max-width:720px)` | `.settings-inline-actions{align-items:stretch}` |

## Tokeny

`--settings-card-border`, `--settings-card-bg`, `--primary`, `--lg-border`, `--hc-surface`, `--hc-border`, `--hc-card-border-width`, `--hc-shadow`, `--hc-blur`, `--hc-muted`.

## Zasady

- Tag w nagłówku zawsze niesie stan słowem („brak”, „Pobrane”, „wymaga logowania”), nie samym kolorem.
- Ostrzeżenie `.settings-note-warn` zaczyna się od „⚠” i mówi, co sprawdzić; nie używaj go do zwykłych statusów.
- Karta niebezpieczna wymaga pola hasła przed przyciskiem i chipu „Nieodwracalne”; przycisk czerwony tylko tu.
- Przyciski to `AuthButton` w rozmiarze `small`; nie stylizuj ich lokalnie — na szkle i tak przejmuje je globalna reguła `.liquid-ios26 button`.
- Placeholder pola hasła (`#9ca8ad` na `#fff`) ma zmierzony kontrast 2,44:1 — poniżej 4,5:1; to wartość ze źródła (`vilda_auth_ui.css`), nie zmieniaj jej, a treść placeholdera nie może być jedyną instrukcją (tytuł karty i opis mówią, co zrobić). Opis `#566b71` ma 5,62:1, notatka `#586d72` 5,46:1, tag `#145861` 7,28:1, ostrzeżenie `#6e4600` 7,65:1, tag niebezpieczny `#b00020` 6,41:1.
- W wysokim kontraście powierzchnia karty staje się `--hc-surface` z grubszym obrysem; tagi i separator zachowują swoje kolory.

Wersja statyczna, przepisana ręcznie z ustawienia.css, vilda_auth_ui.css, ios26-v2.css, style.css, ustawienia.html
