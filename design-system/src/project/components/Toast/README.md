# Toast

Krótki dymek potwierdzenia na dole ekranu: turkusowy dla sukcesu, ciemny dla informacji, biała karta z czerwoną krawędzią dla błędu.

## Kiedy używać

Po akcji, która się udała albo nie (skopiowanie do schowka, wygenerowanie raportu PDF, zapis notatki, błąd generatora). Jeden dymek naraz — nowy zastępuje poprzedni, znika sam po 2500 ms (moduł `vilda_dymek.js`, `VildaDymek.pokaz(tekst, {ton, czas, poz})`). Komunikaty techniczne (synchronizacja, tryb offline) stawia się w prawym dolnym rogu wariantem `vilda-dymek--prawo`.

## Co dostarcza konsument

- Jeden `<div class="vilda-dymek vilda-dymek--ok" role="status" aria-live="polite">` z samym tekstem; moduł nadaje mu `id="vildaDymek"`.
- Klasa tonu jest obowiązkowa: `vilda-dymek--ok` | `vilda-dymek--info` | `vilda-dymek--blad`. Bez niej dymek nie ma tła.
- Opcjonalna klasa pozycji `vilda-dymek--prawo`.
- Dymek nie zna geometrii dołu ekranu: `bottom` liczy z `--vilda-dol-wolny`, którą publikuje właściciel docka (`ios26-ui.js` na stronach ładowanych wprost, `vilda_shell.js` w powłoce). Bez zmiennej spada na `env(safe-area-inset-bottom)`. Nie ustawiaj `style.bottom` ani `style.zIndex`.
- Inne pływające elementy (baner synchronizacji, kontener komunikatów zależności) biorą ten sam dół klasą `vilda-dol-kotwica`.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.vilda-dymek` | `position:fixed`, `left:50%` + `translateX(-50%)`, `bottom: calc(var(--vilda-dol-wolny, env(safe-area-inset-bottom, 0px)) + 16px)`, `z-index:2147483000`, `max-width:min(88vw,520px)`, `padding:.65rem 1.25rem`, promień 10px, tekst `.98rem/1.35` wyśrodkowany, cień `0 10px 24px rgba(0,0,0,.18)`, `pointer-events:none`, `transition:bottom .22s ease` |
| `.vilda-dymek--ok` | tło `#00838d` (`--primary`), tekst `#fff` |
| `.vilda-dymek--info` | tło `#0f2b33`, tekst `#fff` |
| `.vilda-dymek--blad` | tło `#fff`, tekst `#2f3137`, obrys `1px solid rgba(211,47,47,.28)` z lewą krawędzią `4px solid #d32f2f`, promień 14px, tekst do lewej `500 14px/1.4 system-ui`, `padding:12px 14px`, `pointer-events:auto` |
| `.vilda-dymek--prawo` | `left:auto; right:16px; transform:none`, `max-width:min(420px, calc(100vw - 32px))` |
| `.vilda-dol-kotwica` | tylko `bottom` jak wyżej z `!important` i `transition:bottom .22s ease` — dla elementów o własnym wyglądzie |

## Tokeny

- `--vilda-dol-wolny` (publikowana w czasie działania przez właściciela docka; nie jest w `tokens.css`)
- kolory tonów są wpisane na stałe: `#00838d`, `#0f2b33`, `#fff`, `#2f3137`, `#d32f2f`, `rgba(211,47,47,.28)`

## Zasady

- Rób: jeden dymek naraz; tekst pełnym zdaniem z kropką, jak w aplikacji („Dane zostały skopiowane do schowka.”); `role="status"` i `aria-live="polite"`.
- Rób: błąd, który wymaga reakcji, pokazuj tonem `blad` — tylko ten wariant przyjmuje wskaźnik (`pointer-events:auto`) i czas `0` (zostaje do `schowaj()`).
- Nie rób: nie pozycjonuj dymka stylami inline i nie mierz docka — to właśnie ten błąd naprawił moduł.
- Nie rób: nie kładź w dymku linków ani przycisków w tonach `ok`/`info` (nie przyjmują wskaźnika).
- Kontrast (zmierzony): biały tekst na `#00838d` 4,53:1, na `#0f2b33` 14,85:1, tekst `#2f3137` na bieli 13,0:1 — ton `ok` jest tuż nad progiem 4,5:1, więc nie zmniejszaj w nim rozmiaru pisma; sens tonu niesie też treść, nie sam kolor.
- Wysoki kontrast i szkło: źródło nie ma osobnych reguł dla `.vilda-dymek`; tony są nieprzezroczyste, więc dymek wygląda tak samo w każdym motywie i na ciemnym tle.
- W podglądzie dymki stoją w przepływie dokumentu (nadpisanie tylko `position` i `transform`); w aplikacji są `position:fixed`.

Wersja statyczna, przepisana ręcznie z src/css/style.css (linie 7495–7540) i vilda_dymek.js (tony i pozycje).
