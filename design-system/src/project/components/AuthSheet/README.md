# AuthSheet

Arkusz potwierdzenia modułu konta: na telefonie wysuwa się od dołu, na komputerze jest wyśrodkowaną kartą 400 px na rozmytym, ciemnoturkusowym tle; obok niego nakładka wylogowania ze spinnerem i dymek wyniku kopiowania.

## Kiedy używać

Do pytań i decyzji w module konta i kart pacjentów: włączenie Touch ID („Chcesz logować się przez Touch ID?”), konflikt zapisu („Ktoś inny zmienił ten rekord po wczytaniu danych”), scalanie rekordów („Scalić w jeden rekord?”), wybór pacjenta („Który to pacjent?”), zmiana hasła, treść wpisu. Nakładka wylogowania blokuje ekran na czas „Trwa wylogowywanie…”. Dymek `.vilda-copy-summary-toast` potwierdza skopiowanie danych („✓ Dane skopiowane do schowka”) albo błąd („Nie udało się skopiować — spróbuj ponownie.”, „Brak danych do skopiowania.”). Do treści referencyjnej z nagłówkiem i stopką służy Modal.

## Co dostarcza konsument

- Scrim `<div class="vilda-auth-overlay vilda-auth-overlay-sheet">` dołączony do `<body>` (obie klasy — pierwsza daje układ kolumnowy i tło, druga zamienia go w pełnoekranową nakładkę). W środku `.vilda-auth-sheet[role="alertdialog"][aria-modal="true"][aria-label]` z `<h3 class="vilda-auth-sheet-title">`, `<p class="vilda-auth-sheet-body">` i `.vilda-auth-sheet-actions` z pionowym stosem `<button class="vilda-auth-btn vilda-auth-btn-primary|-ghost|-danger">`.
- Modyfikatory arkusza: `vilda-auth-sheet-password` (zmiana hasła, z `.vilda-auth-password-warning`), `vilda-auth-sheet-conflict` (konflikt lub scalanie, z `ul.vilda-auth-conflict-list`), `vilda-auth-sheet-info` (treść wpisu) — wszystkie ograniczają wysokość i przewijają treść. W wyborze pacjenta przyciski kandydatów dostają `vilda-auth-kandydat` z `.vilda-auth-kandydat-nazwa` i `.vilda-auth-kandydat-opis`.
- Podczas otwarcia skrypt dodaje na `<body>` `vilda-modal-alert-open` (lub `vilda-password-alert-open`), co chowa `#mobileBottomDock` i `#scrollTopBtn`.
- Nakładka wylogowania: `.vilda-logout-overlay` > `.vilda-logout-overlay__spinner` + `.vilda-logout-overlay__label`.
- Dymek: `<div class="vilda-copy-summary-toast ok|err show">` z samym tekstem; `bottom` liczy z `--vilda-dol-wolny` publikowanej przez właściciela docka.
- W podglądzie nakładki stoją w kolumnach, a dymki w przepływie dokumentu (nadpisanie tylko `position` i `transform`); w aplikacji wszystkie są `position:fixed`.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.vilda-auth-overlay` | kolumna flex wyśrodkowana, `min-height:100vh`, `padding:56px 24px 48px`, tło dwóch delikatnych gradientów turkusu na bieli; dolny odstęp `48px + max(--vilda-shell-dock-h, --mobile-dock-visible-lift)` (`28px` poniżej 520 px i na ekranach dotykowych) |
| `.vilda-auth-overlay-sheet` | `position:fixed; inset:0`, tło `#00283073`, `backdrop-filter:blur(4px)`, `align-items:flex-end`, `padding:0`, `z-index:1000000`, wejście `vildaSheetFadeIn .22s`; od 700 px `align-items:center; padding:24px` |
| `.vilda-auth-sheet` | biel, promień `20px 20px 0 0`, `padding:28px 24px 36px`, `width:100%; max-width:480px`, wjazd `vildaSheetSlideUp .26s cubic-bezier(.22,1,.36,1)`; od 700 px promień 16px, `max-width:400px`, `padding:32px 28px 28px`, cień `0 20px 60px #00283038, 0 4px 12px #0028301a`, wejście `vildaSheetFadeScale .22s` |
| `.vilda-auth-sheet-title` | `1.15rem/700` w `#002830`, `margin:0 0 8px` |
| `.vilda-auth-sheet-body` | `.9rem/1.5` w `#4a6670`, `margin:0 0 20px` |
| `.vilda-auth-sheet-actions` | kolumna flex, `gap:10px`; każdy `.vilda-auth-btn` `width:100%` i wyśrodkowany |
| `.vilda-auth-btn` | `padding:14px 22px`, promień 12px, obrys `1.5px`, `15px/500`; `-primary` tło i obrys `#00838d`, cień `0 6px 18px #00838d38` (hover `#006d75`); `-ghost` biel, tekst `#08202c`, obrys `#d6dde0` (hover `#f5fafb`/`#00838d`); `-danger` (nadpisanie w arkuszu hasła) tekst `#9f1239`, obrys `#f0c2cd`, biel; `-small` `10px 16px`, `13px`, promień 10px; `:focus-visible` obwódka `3px rgba(0,131,141,.3)` |
| `.vilda-auth-sheet-password` / `-conflict` / `-info` | `max-height:86dvh` (`82vh` od 700 px, `88dvh` poniżej), `overflow-y:auto`, `padding-bottom:28px + safe-area` |
| `.vilda-auth-password-warning` | tło `#fff7ed`, obrys `#fbd5a8`, tekst `#7c3f04`, `padding:12px 14px`, promień 12px, `.86rem/1.5` |
| `.vilda-auth-conflict-list` | lista `.86rem/1.6` w `#0f2b33`, `padding-left:20px`, `margin-bottom:18px` |
| `.vilda-auth-kandydat` | przycisk dwuwierszowy do lewej, `gap:2px`, `line-height:1.35`; nazwa `600`, opis `.8rem` z `opacity:.72` |
| `.vilda-logout-overlay` | `position:fixed; inset:0; z-index:2000000`, tło `#ffffffd1` z `blur(6px)`, kolumna wyśrodkowana, `gap:18px`, wejście `.12s`; spinner 36px, obrys `3px rgba(0,131,141,.18)` z górą `#00838d`, obrót `.75s linear infinite`; etykieta `.95rem/500` w `#002830` |
| `.vilda-copy-summary-toast` | `position:fixed`, dół `--vilda-dol-wolny + 16px`, `left:50%`, `max-width:88vw`, `padding:10px 16px`, promień 12px, `13px/600`, cień `0 10px 30px #08202c40`, `z-index:2147483001`, niewidoczny do `.show` (`opacity:1`, `translateY(0)`); `.ok` tekst `#065f46` na `#ecfdf5` z obrysem `#a7f3d0`; `.err` `#7f1d1d` na `#fef2f2` z obrysem `#fecaca` |
| `body.vilda-modal-alert-open`, `body.vilda-password-alert-open` | chowają `#mobileBottomDock` i `#scrollTopBtn` |

## Tokeny

- `--vilda-dol-wolny`, `--vilda-shell-dock-h`, `--mobile-dock-visible-lift` (publikowane w czasie działania przez powłokę i dock; nie w `tokens.css`)
- `--hc-surface`, `--hc-blur`, `--hc-shadow`, `--hc-border`, `--hc-card-border-width`, `--hc-text`, `--hc-focus-width`, `--hc-focus-color` (wysoki kontrast)
- `--lg-border` (obrys przycisków w motywie szkła)
- kolory wpisane na stałe: `#00283073`, `#002830`, `#4a6670`, `#00283038`, `#0028301a`, `#00838d`, `#006d75`, `#08202c`, `#d6dde0`, `#f5fafb`, `#9f1239`, `#f0c2cd`, `#ffffffd1`, `#08202c40`, `#ecfdf5`, `#065f46`, `#a7f3d0`, `#fef2f2`, `#7f1d1d`, `#fecaca`

## Zasady

- Rób: tytuł jako pytanie lub zdanie oznajmujące w drugiej osobie („Chcesz logować się przez Touch ID?”), treść jednym–dwoma zdaniami; akcja główna pierwsza (`-primary`), rezygnacja ostatnia (`-ghost`: „Nie teraz”, „Anuluj”).
- Rób: `role="alertdialog"`, `aria-modal="true"` i `aria-label` równy tytułowi; po zamknięciu zdejmij `vilda-modal-alert-open` z `<body>`.
- Rób: gdy decyzja niszczy dane, nazwij skutek w etykiecie („Zapisz to, co w formularzu”, „Przyjmij dane z bazy”), a listę zmian pokaż w `.vilda-auth-conflict-list`.
- Nie rób: nie umieszczaj arkusza w `.vilda-auth-root` (tam `.vilda-auth-root button` wymusza `width:auto`) ani nie ustawiaj `bottom` dymka stylem inline.
- Nie rób: nie sygnalizuj wyniku dymka samym kolorem — tekst („✓ Dane skopiowane do schowka”, „Nie udało się skopiować — spróbuj ponownie.”) niesie znaczenie.
- Kontrast: tytuł `#002830` i treść `#4a6670` na bieli, scrim `#00283073` z rozmyciem oddziela arkusz od strony.
- Szkło: `.liquid-ios26 button` zamienia przyciski arkusza w białe pigułki 20 % (`#fff3`, tekst `#111`, promień 14px, `blur(10px)`) — tak wygląda arkusz w aplikacji; sam arkusz i scrim nie mają reguł szkła.
- Wysoki kontrast (`body.liquid-ios26.high-contrast-level-1/2/3`): scrim i arkusz dostają tło `var(--hc-surface)`, rozmycie `var(--hc-blur)` i cień `var(--hc-shadow)`; tytuł, treść, nakładka wylogowania i przycisk `-ghost` tekst `var(--hc-text)`; `-ghost` obrys `var(--hc-card-border-width) solid var(--hc-border)`; fokus przycisków `var(--hc-focus-width) solid var(--hc-focus-color)`.

Wersja statyczna, przepisana ręcznie z src/css/vilda_auth_ui.css (linie 17–25, 209–256, 736–761, 1264–1291, 1299–1340, 1395–1433, 1452–1459, 1468–1469, 1584–1593, 1626–1673, 1675–1712, 1730–1740), src/css/ios26-v2.css (85–99, 191–192) i vilda_auth_ui.js (znacznik i teksty).
