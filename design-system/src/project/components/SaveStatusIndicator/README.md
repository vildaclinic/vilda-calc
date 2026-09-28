# SaveStatusIndicator

Warstwa stanu zapisu na ikonie chipa pacjenta: dysk 28 px (34 px na telefonie) dostaje dwustopniowy gradient 135° w kolorze stanu, a stany wymagające uwagi oddychają pierścieniem `box-shadow`.

## Kiedy używać

Zawsze razem z PatientChip — to nie osobny element, lecz zestaw klas `vilda-save-state--*` na `#vildaPatientChip`, które `vilda_save_status_indicator.js` ustawia po każdym zapisie, zmianie danych i błędzie synchronizacji. Na desktopie (≥601px) ten sam stan tintuje cały chip (patrz PatientChip); na telefonie zostaje tylko ikona, więc stan musi być czytelny z samego dysku.

## Co dostarcza konsument

- Element PatientChip z dokładnie jedną klasą stanu: `vilda-save-state--hidden` (brak pacjenta, razem z `is-empty`), `--new_patient`, `--saved`, `--dirty`, `--saving`, `--error` (z `has-patient`).
- `span.chip-icon` z SVG Lucide `user` 16px jako jedynym dzieckiem — w stanie `saving` obraca się `.chip-icon>*`.
- `title` z tekstem stanu z `H()`: „✓ Dane pacjenta zapisane · 2 min temu · Snapshot #4”, „● Niezapisane zmiany · od 3 min · Kliknij „Zapisz dane” w menu po lewej”, „⟳ Zapisywanie snapshotu…”, „⚠ Błąd ostatniego zapisu”, „＋ Nowy pacjent — kliknij „Zapisz dane””.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.chrome-patient-chip .chip-icon` | `transition:none!important` — zmiana stanu jest natychmiastowa. |
| `.vilda-save-state--hidden .chip-icon` | Tło `#e8eded`, glif `#9eb8bb`. |
| `.vilda-save-state--saved .chip-icon` | `linear-gradient(135deg,#15803d,#22c55e)`, glif `#fff`. |
| `.vilda-save-state--dirty .chip-icon` | `linear-gradient(135deg,#b45309,#f59e0b)`, glif `#fff`; `vilda-save-status-dirty-pulse` 2.4s ease-in-out: pierścień do `0 0 0 4px #f59e0b38`. |
| `.vilda-save-state--saving .chip-icon` | `linear-gradient(135deg,#1d4ed8,#3b82f6)`, glif `#fff`; dziecko obraca się `vilda-save-status-spin` .9s linear. |
| `.vilda-save-state--error .chip-icon` | `linear-gradient(135deg,#b91c1c,#ef4444)`, glif `#fff`; `vilda-save-status-error-pulse` 1.8s: pierścień do `5px #ef444452`. |
| `.vilda-save-state--new_patient .chip-icon` | `linear-gradient(135deg,#6d28d9,#a855f7)`, glif `#fff`; `vilda-save-status-new-pulse` 2.4s: pierścień do `5px #a855f747`. |
| `prefers-reduced-motion` | Pulsy wyłączone; obrót w `saving` spowolniony do 3s. |

Wszystkie deklaracje tła i koloru mają `!important`, żeby wygrać z `has-patient .chip-icon` (`#00838d`) i z regułą ≤600px, która chipowi `is-empty` daje białą ikonę z obrysem. Szkło, wysoki kontrast i ciemne tło nie mają reguł dla tej warstwy; kolory są literałami i nie zmieniają się w żadnym motywie.

## Tokeny

Brak — wszystkie wartości są wpisane literalnie (zieleń `#15803d`/`#22c55e`, bursztyn `#b45309`/`#f59e0b`, błękit `#1d4ed8`/`#3b82f6`, czerwień `#b91c1c`/`#ef4444`, fiolet `#6d28d9`/`#a855f7`, szarość `#e8eded`/`#9eb8bb`).

## Zasady

- Rób: stan przekazuj jedną klasą i jednocześnie tekstem w `title` oraz w legendzie (SaveStatusPopover) — kolor dysku jest jedynym sygnałem na telefonie.
- Rób: zostaw SVG jako jedyne dziecko `.chip-icon`; obrót w `saving` działa na `.chip-icon>*` z `transform-origin:50% 50%`.
- Rób: respektuj `prefers-reduced-motion` — źródło wyłącza pulsy, ale zostawia wolny obrót jako jedyną informację „trwa zapis”.
- Nie rób: nie dodawaj przejść na `.chip-icon` — źródło je zeruje, żeby przełączenie `saving → saved` nie rozmywało się w gradient pośredni.
- Nie rób: nie używaj tych klas poza `#vildaPatientChip`; selektory są związane z `.chrome-patient-chip`.
- Kontrast (zmierzony): biały glif na gradientach ma 5,0–7,1:1 przy ciemniejszym stopniu (`#15803d`, `#b45309`, `#1d4ed8`, `#b91c1c`, `#6d28d9`), a przy jaśniejszym (`#22c55e` 2,3:1, `#f59e0b` 2,2:1, `#3b82f6` 3,7:1, `#ef4444` 3,8:1, `#a855f7` 4,0:1) spada poniżej 4,5:1 — wartości źródła; ikona jest dekoracyjna (`aria-hidden`), stan niesie `title`.

Wersja statyczna, przepisana ręcznie z src/css/vilda_save_status_indicator.css (1-55), src/css/vilda_chrome.css (225-261), vilda_save_status_indicator.js (funkcje g i H)
