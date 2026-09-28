# SaveStatusPopover

Popover statusu zapisu danych pacjenta pod chipem pacjenta w pasku aplikacji: opcjonalny wiersz „Otwórz Kartę pacjenta”, wiersz bohatera z kolorowym stanem i legenda pozostałych stanów.

## Kiedy używać

Otwiera go kliknięcie chipa pacjenta (`#vildaPatientChip`) w powłoce `vilda_chrome.js`; tłumaczy kolor kropki chipa: Zapisane, Niezapisane zmiany, Nowy pacjent, Zapisywanie…, Błąd zapisu, Brak danych pacjenta. Jeden popover naraz, zamykany kliknięciem poza nim lub klawiszem Escape. Do komunikatów po akcji służy Toast, do pytań AuthSheet.

## Co dostarcza konsument

- `<div class="vilda-save-popover is-visible" role="dialog" aria-label="Status zapisu danych pacjenta">` dołączony do `<body>`; skrypt ustawia `top`/`right`/`left` stylem inline pod chipem, a atrybut `hidden` chowa go całkiem.
- Wiersz akcji (tylko gdy w `sessionStorage` jest `vildaCurrentPatientId`): `<button class="vsp-action" data-vilda-open-card>` z `.vsp-action-ic` (SVG 16 px, `stroke-width="2"`), `.vsp-action-txt` (`.vsp-action-title` „Otwórz Kartę pacjenta”, `.vsp-action-sub` „wczytany pacjent”) i `.vsp-action-go` ze znakiem „›”.
- Bohater: `.vsp-hero` z inline `background` (gradient stanu), `.vsp-hero-ic` z inline `background:linear-gradient(135deg, c1, c2)` i SVG 16 px o `stroke-width="2.4"`, `.vsp-hero-txt` z `.vsp-hero-title` (inline `color: c1`) i `.vsp-hero-sub`.
- Legenda: `.vsp-legend-head` „Pozostałe stany” i `.vsp-legend` z wierszami `.vsp-row` > `.vsp-dot` (inline gradient stanu) + `.vsp-name`; bieżący stan jest pomijany, stan `hidden` nigdy nie trafia do legendy.
- Kolory, teksty i ikony stanów pochodzą z tabeli w `vilda_chrome.js` (poniżej) i są wpisywane inline — arkusz nie zna stanów.
- W podglądzie popover stoi w przepływie dokumentu (nadpisanie tylko `position` i `transform`); w aplikacji jest `position:fixed`.

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `.vilda-save-popover` | `position:fixed; z-index:9500`, `width:290px; max-width:calc(100vw − 16px)`, tło `#fffffff0` z `backdrop-filter:saturate(180%) blur(14px)`, obrys `.5px solid rgba(0,131,141,.16)`, promień `var(--chrome-radius-card, 14px)`, cień `0 12px 34px #00515829, 0 3px 8px #0000000f`, font systemowy (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, …`), `overflow:hidden`; wejście `opacity:0; translateY(-6px)` → `.is-visible` `opacity:1; translateY(0)` w `.16s` |
| `[hidden]` | `display:none` |
| `.vsp-action` | flex, `gap:10px`, `padding:12px 14px`, tło `#00838d12`, dolna linia `.5px rgba(0,0,0,.05)`, tekst `#0c3a3e`; `:hover` `#00838d21`, `:active` `#00838d2e` |
| `.vsp-action-ic` | kafelek 30px, promień 8px, tło `#00838d`, biała ikona |
| `.vsp-action-title` / `-sub` / `-go` | `13px/600` `#0c3a3e` · `11px` `#6b7280` · „›” `17px` w `#00838d` |
| `.vsp-hero` | flex, `gap:11px`, `padding:14px`, dolna linia `.5px rgba(0,0,0,.05)`; ikona `.vsp-hero-ic` kółko 34px z białą ikoną; tytuł `13.5px/600`, podtytuł `11.5px` `#6b7280` |
| `.vsp-legend-head` | `10.5px/500` wersalikami, `letter-spacing:.04em`, `#5a7274`, `padding:9px 14px 3px` |
| `.vsp-row` / `.vsp-dot` / `.vsp-name` | wiersz `12px`, `padding:6px 14px`, `gap:9px` · kropka 12px · nazwa `500` w `#2a3a3c` |
| stan `saved` | c1 `#15803d`, c2 `#22c55e`, tło `linear-gradient(135deg, rgba(34,197,94,0.14), rgba(21,128,61,0.05))`, „Zapisane” — „wszystko w karcie pacjenta jest aktualne” (albo „Snapshot #N · czas” / „Dane są aktualne”) |
| stan `dirty` | `#b45309` / `#f59e0b`, `rgba(245,158,11,0.16)` → `rgba(180,83,9,0.05)`, „Niezapisane zmiany” — „kliknij „Zapisz dane”, aby zapisać snapshot” |
| stan `new_patient` | `#6d28d9` / `#a855f7`, `rgba(168,85,247,0.16)` → `rgba(109,40,217,0.05)`, „Nowy pacjent” — „brak snapshotu — zapisz, aby utworzyć kartę” |
| stan `saving` | `#1d4ed8` / `#3b82f6`, `rgba(59,130,246,0.16)` → `rgba(29,78,216,0.05)`, „Zapisywanie…” — „trwa zapis snapshotu do vault” |
| stan `error` | `#b91c1c` / `#ef4444`, `rgba(239,68,68,0.16)` → `rgba(185,28,28,0.05)`, „Błąd zapisu” — „spróbuj ponownie — kliknij „Zapisz dane”” |
| stan `hidden` | `#5f7274` / `#9eb8bb`, `rgba(158,184,187,0.18)` → `rgba(95,114,116,0.05)`, „Brak danych pacjenta” — „wpisz dane pacjenta, aby rozpocząć” |
| `prefers-reduced-motion` | tylko `opacity .1s`, bez przesunięcia |

## Tokeny

- `--chrome-radius-card` (promień; zapas 14px)
- `--lg-border` (obrys przycisku akcji w motywie szkła), `--hc-focus-width`, `--hc-focus-color` (fokus w wysokim kontraście)
- kolory wpisane na stałe: `#fffffff0`, `rgba(0,131,141,.16)`, `#00515829`, `#00838d12`, `#00838d21`, `#00838d2e`, `#00838d`, `#0c3a3e`, `#6b7280`, `#5a7274`, `#2a3a3c` oraz pary c1/c2 stanów wyżej

## Zasady

- Rób: zawsze pokazuj bohatera i legendę; wiersz akcji tylko wtedy, gdy jest wczytany pacjent — bez wczytanego pacjenta nie ma dokąd przejść.
- Rób: nazwy stanów i podtytuły bierz z tabeli skryptu, żeby chip, popover i przycisk „Zapisz dane” mówiły tym samym językiem.
- Nie rób: nie koloruj tytułu ani kropek klasami — kolor jest właściwością stanu i idzie stylem inline; nie dodawaj stanu `hidden` do legendy.
- Nie rób: nie zmieniaj szerokości 290 px ani fontu systemowego — popover ma wyglądać jak element pasków systemowych, nie jak karta treści.
- Kontrast: nazwy `#2a3a3c` na bieli (11,9:1), nagłówek legendy `#5a7274` (5,1:1), podtytuł `#6b7280` na bieli (4,8:1). Wartości źródłowe poniżej 4,5:1 (zmierzone na jasnym końcu gradientu bohatera): tytuł `#15803d` na `rgba(34,197,94,.14)` 4,45:1, `#b45309` na `rgba(245,158,11,.16)` 4,43:1, `#5f7274` na `rgba(158,184,187,.18)` 4,49:1 oraz podtytuł `#6b7280` na tłach bohatera 3,9–4,3:1 i na tle wiersza akcji `#00838d12` 4,4:1; `#6d28d9`, `#1d4ed8` i `#b91c1c` mają 5,2–5,8:1. Kropka nigdy nie jest jedynym nośnikiem — obok stoi nazwa stanu.
- Szkło i wysoki kontrast: źródło nie ma reguł `.liquid-ios26` ani `high-contrast` dla popovera; globalna reguła szkła obejmuje przycisk `.vsp-action` (białe tło 20 %, obrys `var(--lg-border)`, promień 14px, tekst `#111`) — tak wygląda w aplikacji; w wysokim kontraście dochodzi obwódka fokusu przycisku.

Wersja statyczna, przepisana ręcznie z src/css/vilda_chrome.css (linie 283–406), src/css/ios26-v2.css (85–99) i vilda_chrome.js (tabela stanów, znacznik i teksty).
