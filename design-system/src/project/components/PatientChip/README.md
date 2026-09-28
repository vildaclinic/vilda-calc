# PatientChip

Chip pacjenta w pasku górnym: 28 px okrągła ikona, etykieta „Pacjent” i nazwa pacjenta na kafelku o promieniu 9 px, którego tło i obrys zmieniają się wraz ze stanem pacjenta i stanem zapisu.

## Kiedy używać

Wyłącznie w `.chrome-chips` paska górnego, jako pierwszy element statusu sesji. Chip jest przyciskiem (`role="button"`, `aria-haspopup="dialog"`) otwierającym legendę stanu zapisu (SaveStatusPopover). Nie używaj go w treści strony do pokazywania danych pacjenta — tam służą karty pacjenta z `vilda_auth_ui.css`.

## Co dostarcza konsument

- `<div class="chrome-chip chrome-patient-chip is-empty|has-patient [vilda-save-state--…]" id="vildaPatientChip" aria-live="polite" role="button" tabindex="0" aria-haspopup="dialog" aria-expanded="false" title="Status zapisu — kliknij, aby zobaczyć legendę">`.
- Dzieci: `span.chip-icon[aria-hidden]` z SVG Lucide `user` 16px (`stroke="currentColor"`, `stroke-width="2"`), `span.chip-content` z `span.chip-label` „Pacjent” i `span.chip-value#vildaPatientValue` (nazwa, „Brak” gdy brak pacjenta, „—” gdy niedostępne, „…” w trakcie ładowania), oraz `span.chrome-chip-card[aria-hidden]` z SVG karty 17px.
- Stan pacjenta to klasa `is-empty` lub `has-patient`; stan zapisu to jedna klasa `vilda-save-state--hidden|new_patient|saved|dirty|saving|error`, którą `vilda_save_status_indicator.js` przepisuje razem z `title` (np. „✓ Dane pacjenta zapisane · 2 min temu · Snapshot #4”). Kolory ikony dla tych klas opisuje SaveStatusIndicator.
- Identyfikatory `vildaPatientChip` i `vildaPatientValue` są wymagane przez skrypty; w podglądzie mają je tylko pierwsze egzemplarze.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.chrome-chip` | `inline-flex`, `gap:.5rem`, `padding:.25rem .4rem`, bez tła i obrysu, promień `chrome-radius-pill` 999px, `max-width:240px`; hover tło `#ffffff8c`. |
| `.chip-icon` | 28×28, koło, gradient `135deg #e2f1f2→#cfe9ec`, glif `primary`; SVG 16px. |
| `.chip-label` | .66rem, wersaliki, `.06em`, 600, `chrome-label-color` #5a7274. |
| `.chip-value` | .86rem/600, `text`, jedna linia z wielokropkiem, `max-width:180px`. |
| `.chrome-chip-card` | Ikona karty `#00838d`, 17px, `margin-left:1px`; ukryta w `is-empty` i ≤600px. |
| `.is-empty` | Tło `#fff`, obrys `1px solid #cfe4e4`, promień 9px; ikona `#e8eded`/`#9eb8bb`; wartość `#9eb8bb`, 500. |
| `.has-patient` | Tło `#e6f4f5`, obrys `#9fd4d8`, promień 9px; ikona `#00838d`/`#fff`; etykieta `#00838d`; wartość `#0c3a3e`. |
| `.vilda-save-state--saved` (≥601px) | Tło `#e8f6ee`, obrys `#b6e2c8`; etykieta i karta `#15803d`; wartość `#14532d`. |
| `.vilda-save-state--dirty` (≥601px) | Tło `#fdf1dd`, obrys `#f2cf95`; `#b45309`; wartość `#7c3a06`. |
| `.vilda-save-state--saving` (≥601px) | Tło `#e6edfc`, obrys `#b8ccf5`; `#1d4ed8`; wartość `#1e3a8a`. |
| `.vilda-save-state--error` (≥601px) | Tło `#fdeaea`, obrys `#f4bcbc`; `#b91c1c`; wartość `#7f1d1d`. |
| `.vilda-save-state--new_patient` (≥601px) | Tło `#f1e9fd`, obrys `#d6bef5`; `#6d28d9`; wartość `#4c1d95`. |
| `:focus-visible` | Obrys `2px solid primary`, odsunięcie 2px. |
| `≤600px` | Tekst i karta ukryte; chip `height:34px`, bez obrysu i tła; ikona 34×34 z promieniem 8px (`is-empty`: biel z obrysem `#cfe4e4`). |
| `prefers-reduced-motion` | `.chrome-chip-card{transition:none}`. |

Tinty stanu zapisu mają `!important`, więc wygrywają z `has-patient`. Szkło (`.liquid-ios26`) nie ma reguł dla chipa — kolory są wpisane literalnie i nie zmieniają się w glass-4. Wysoki kontrast i ciemne tło również nie mają reguł; w wysokim kontraście chip zachowuje własne obrysy 1px.

## Tokeny

`--chrome-radius-pill`, `--chrome-label-color`, `--primary`, `--text`. Pozostałe kolory (`#cfe4e4`, `#e8eded`, `#9eb8bb`, `#e6f4f5`, `#9fd4d8`, `#0c3a3e` i palety stanów zapisu) są literałami źródła.

## Zasady

- Rób: zawsze łącz stan zapisu z tekstem w `title` (i z legendą po kliknięciu) — kolor tła jest jedynym sygnałem wizualnym, a na telefonie znika nawet etykieta.
- Rób: trzymaj dokładnie jedną klasę `vilda-save-state--*`; skrypt nadpisuje całe `className`, więc nie dopisuj własnych klas do tego elementu.
- Rób: nazwę pacjenta skracaj po stronie danych (inicjał nazwiska), bo wartość ucina się przy 180px.
- Nie rób: nie usuwaj `span.chrome-chip-card` w `is-empty` — CSS go chowa; brak węzła psuje przełączenie na `has-patient`.
- Nie rób: nie używaj `chrome-chip` na `<button>` — źródło stosuje `div[role=button]`, a bazowe style przycisków (szkło, pigułki) zniekształciłyby chip.
- Kontrast (zmierzony): etykiety stanów zapisu na swoich pastelowych tłach — `#15803d` 4,5:1, `#b45309` 4,5:1 (na granicy), `#1d4ed8` 5,7:1, `#b91c1c` 5,6:1, `#6d28d9` 6,0:1; wartości (`#14532d`, `#7c3a06`, `#1e3a8a`, `#7f1d1d`, `#4c1d95`) 7,6–9,3:1. Etykieta `#00838d` w `has-patient` bez stanu zapisu na `#e6f4f5` daje 4,0:1, a wartość `#9eb8bb` w `is-empty` na bieli 2,1:1 — obie poniżej 4,5:1, wartości źródła (wyciszony tekst zastępczy „Brak”).

Wersja statyczna, przepisana ręcznie z src/css/vilda_chrome.css (154-281, 404-406, 485-520), vilda_chrome.js (funkcja Je, ikony Se/Fe)
