# ChromeActionButton

Kompaktowe akcje paska górnego: kafelek synchronizacji, dzwonek przypomnień z licznikiem i pigułka statusu PRO — 30×30 px, biel z włoskowatym obrysem `#cfe4e4`, promień 8px.

## Kiedy używać

Wyłącznie w wierszu chipów paska górnego (`vilda_chrome.js`), obok chipa pacjenta i użytkownika. Kolory stanów wynikają z danych aplikacji (stan synchronizacji, liczba przypomnień, plan PRO) i są sterowane atrybutami `data-*`, nie klasami. Nie używaj tych klas do akcji w treści strony — tam służy Button.

## Co dostarcza konsument

- Synchronizacja: `<a href="ustawienia.html#settings-section-sync" class="chrome-sync-btn is-enabled" id="vildaSyncBtn" title="Synchronizacja między urządzeniami" aria-label="Status synchronizacji">` z SVG Lucide 16px (`stroke="currentColor"`, `stroke-width="2"`). Bez `is-enabled` element jest ukryty (`display:none`), chyba że ma `data-cloud-only="true"`. Atrybuty: `data-sync-state="syncing|ok|error|stale"`, `data-cloud-only="true"`, `data-offline="true"`.
- Przypomnienia: `<button type="button" class="chrome-reminders-btn" id="vildaRemindersBtn" data-count="3" data-state="today|overdue|loading|empty" title="Przypomnienia" aria-label="Przypomnienia"><span class="chrome-reminders-inner">SVG</span><span class="chrome-reminders-badge" id="vildaRemindersBadge" aria-hidden="true">3</span></button>`. Licznik powyżej 9 wyświetla „9+”; w stanie `empty` plakietka jest pusta i ukryta przez JS, w stanie `loading` pusta i zamieniona w pierścień. Etykiety: „Przypomnienia”, „Brak przypomnień”, „Wczytywanie przypomnień…”.
- Plan PRO: `<a href="subskrypcja.html" class="chrome-pro-badge" id="vildaProBadge" data-pro-state="active|upgrade" style="display:inline-flex" title="Status planu PRO" aria-label="Status planu PRO">PRO</a>`; JS ustawia `display:inline-flex` inline, bo reguła bazowa ukrywa plakietkę; w stanie `upgrade` treść to „↑ PRO”.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.chrome-sync-btn` | `inline-flex` 30×30, `border:1px solid #cfe4e4`, promień 8px, tło `#fff`, ikona `#4d8285`, bez cienia; przejścia `.15s`. |
| `.chrome-sync-btn:hover` | Tło `#f2f9f9`, obrys `#9fd4d8`, ikona `primary` #00838d. |
| `[data-sync-state=syncing]` | Ikona `primary`, animacja `vildaSyncPulse` 1.1s (skala .88, krycie .4). |
| `[data-sync-state=ok]` / `error` / `stale` | Ikona `#16a34a` / `#dc2626` / `#b45400`. |
| `[data-cloud-only=true]` | Tło `primary`, ikona `#fff`, obrys przezroczysty; hover `#006c75`; `ok` tło `#16a34a`, `error` tło `#dc2626`. |
| `[data-cloud-only=true][data-offline=true]` | Tło `#b45309`, pierścień `0 0 0 2px #b4530940`; hover `#8a3d05`. |
| `.chrome-reminders-btn` | Jak kafelek synchronizacji, `position:relative`, `inline-block`; hover jak wyżej; `:active` `scale(.95)`; `:focus-visible` obrys `2px solid primary` z odsunięciem 2px. |
| `.chrome-reminders-badge` | Pigułka 16px w prawym górnym rogu (`top:-4px; right:-4px`), `min-width:16px`, `.62rem`/700, tekst `#fff`, tło `#6b7280`, obrys `1.5px solid #fff`, cień `0 1px 3px #00283026`; po pojawieniu pulsuje 3 razy (`vildaRemindersPulse` .6s). |
| `[data-state=today]` | Ikona `primary`, plakietka `#d97706`. |
| `[data-state=overdue]` | Ikona `#dc2626`, plakietka `#dc2626`. |
| `[data-state=loading]` | Ikona `#9aa8aa`; plakietka staje się pierścieniem 14px (`border:2px solid rgba(0,131,141,.25)`, góra `primary`) z animacją `chrome-rem-spin` .7s. |
| `[data-state=empty]` | Ikona `#b3c2c4`, `opacity:.72`. |
| `.chrome-pro-badge` | Pigułka 30px wysokości, padding `0 10px`, promień 8px, `10.5px`/700, `letter-spacing:.05em`; hover `opacity:.8`, `scale(.96)`. |
| `[data-pro-state=active]` | Tło `#ece8fb`, tekst `#6d4bd8`. |
| `[data-pro-state=upgrade]` | Tło `#e0f2f3`, tekst `#00838d`. |
| `≤600px` | Wszystkie kafelki 34×34, plakietka PRO 34px wysokości. |
| `prefers-reduced-motion` | Plakietka przypomnień bez animacji. |

Pod szkłem (`.liquid-ios26`) każdy kafelek jest na nowo ustawiony z `!important` na biel, obrys `#cfe4e4`, promień 8px, bez `backdrop-filter` i cienia, więc nie zmienia się w glass-4. Wysoki kontrast i ciemne tło nie mają reguł dla tej rodziny; w wysokim kontraście działa tylko wspólny obrys `focus-visible` z zestawu `hc-*` (patrz Button).

## Tokeny

`--primary` (z zapasem literalnym `#00838d`). Pozostałe kolory (`#cfe4e4`, `#4d8285`, `#f2f9f9`, `#9fd4d8`, `#16a34a`, `#dc2626`, `#b45400`, `#006c75`, `#b45309`, `#8a3d05`, `#6b7280`, `#d97706`, `#9aa8aa`, `#b3c2c4`, `#ece8fb`, `#6d4bd8`, `#e0f2f3`) są w źródle wpisane literalnie.

## Zasady

- Rób: stan przekazuj atrybutem `data-*` i równocześnie w `title`/`aria-label` (np. „Tryb chmurowy — offline”), bo kolor ikony jest jedynym wizualnym sygnałem.
- Rób: zachowaj rozmiar 30×30 (34×34 na telefonie) i promień 8px — kafelki muszą wyrównać się z chipami paska.
- Rób: w stanie `empty` i `loading` zostaw plakietkę w drzewie (JS ukrywa ją lub zamienia w pierścień); usuwanie węzła zepsuje animację.
- Nie rób: nie dodawaj tekstu do kafelków ani nie zmieniaj ikon na inne niż Lucide `cloud-upload` i `bell`; nie używaj klas stanu — źródło ich nie ma.
- Nie rób: nie pokazuj plakietki PRO bez `data-pro-state` i inline `display:inline-flex`; reguła bazowa ją ukrywa.
- Kontrast (zmierzony na bieli, motyw domyślny): ikony `#4d8285` 4,3:1 i `#b3c2c4` 1,8:1 (`empty`), `#9aa8aa` 2,5:1 (`loading`) są celowo wyciszone i nie niosą tekstu; `#dc2626` 4,8:1, `#16a34a` 3,3:1 (ikona, próg 3:1 dla grafiki); wersja `cloud-only` jest odwrócona (biała ikona na turkusie, `#b45309` offline 5,0:1). Tekst plakietek: `#fff` na `#dc2626` i `#6b7280` 4,8:1; `#fff` na `#d97706` (`today`) 3,2:1 i `#00838d` na `#e0f2f3` (`upgrade`) 3,9:1 nie osiągają 4,5:1 — wartości pochodzą ze źródła, dlatego stan zawsze towarzyszy `title`/`aria-label`.

Wersja statyczna, przepisana ręcznie z src/css/vilda_chrome.css (499-503, 1026-1192, 1193-1252, 1264-1271)
