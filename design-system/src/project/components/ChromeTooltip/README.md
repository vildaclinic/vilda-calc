# ChromeTooltip

Szklany dymek powłoki (`vilda_chrome.js`): mroźna biel z turkusowym tekstem i strzałką w lewo, a pod `.has-vilda-chrome` ten sam wygląd dostaje globalna podpowiedź `.menu-tooltip`.

## Kiedy używać

Podpowiedzi przy elementach powłoki — pozycjach paska bocznego i przyciskach akcji, które mają atrybut `data-tip` (np. „Zapisz dane” z podpowiedzią „Aby zapisać dane, wprowadź imię, wiek, wzrost i wagę.”, „Zaloguj się, aby przeglądać bazę pacjentów.”). Dymek staje po prawej stronie kotwicy (w razie braku miejsca po lewej) i nie schodzi poniżej górnego bezpiecznego obszaru.

## Co dostarcza konsument

- Kotwica z `data-tip="tekst"`; skrypt tworzy `<div class="vilda-tip">` w `<body>`, ustawia `left`/`top` inline i po klatce dodaje `vilda-tip--in`.
- Strzałkę rysują `::before` (obrys) i `::after` (wypełnienie) — dymek nie może mieć własnych pseudoelementów.
- Klasa `has-vilda-chrome` na `<body>` (nadaje ją `vilda_chrome.js` po zamontowaniu powłoki) przełącza także `.menu-tooltip` i `.menu-tooltip.copy-tooltip` na wygląd szkła; sam znacznik `.menu-tooltip` pozostaje jak w karcie Tooltip, a stan „pokazany” to inline `opacity:1` (selektor `[style*="opacity:1"]` / `[style*="opacity: 1"]` cofa przesunięcie).

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.vilda-tip` | `position:fixed`, `z-index:99999`, `max-width:min(280px, calc(100vw - 24px))`, `padding:.6rem 1rem`, promień 10px, tekst `.83rem/1.5` wagi 500 w `var(--primary, #00838d)`, tło `#fffffff5`, obrys `1.5px solid rgba(0,131,141,.2)`, cień `0 4px 20px #00515821, 0 1px 4px #0000000f, inset 0 1px #fffc`, `backdrop-filter:blur(14px) saturate(1.6)`, `pointer-events:none`; ukryty: `opacity:0; translate(6px)`, przejście `.18s ease` |
| `.vilda-tip.vilda-tip--in` | `opacity:1; translate(0)` |
| `.vilda-tip::before` / `::after` | strzałka w lewo: obrys `6px 7px 6px 0` w `rgba(0,131,141,.2)` przy `left:-7px`, wypełnienie `5px 6px 5px 0` w `rgba(255,255,255,.96)` przy `left:-5px`, obie wyśrodkowane w pionie |
| `.has-vilda-chrome .menu-tooltip` | te same: tło `#fffffff5`, tekst `var(--primary, #00838d)`, obrys `1.5px solid rgba(0,131,141,.2)`, promień 10px, cień i rozmycie jak wyżej, tekst `.83rem` wagi 500, `padding:.6rem 1rem`, przesunięcie `translate(6px)` — wszystko z `!important` |
| `.has-vilda-chrome .menu-tooltip[style*="opacity:1"]` | `transform:translate(0)!important` |

## Tokeny

- `--primary` (z zapasem `#00838d`)
- wartości wpisane na stałe: `#fffffff5`, `rgba(0,131,141,.2)`, `#00515821`, `#0000000f`, `#fffc`, `rgba(255,255,255,.96)`, `blur(14px) saturate(1.6)`

## Zasady

- Rób: jedno zdanie po polsku, zakończone kropką; podpowiedź tłumaczy, czego brakuje albo co zrobić, nie powtarza etykiety przycisku.
- Rób: dymek pokazuj po najechaniu i po fokusie klawiatury na kotwicy; treść jest dostępna też przez `data-tip`.
- Nie rób: nie kładź w dymku elementów interaktywnych (`pointer-events:none`).
- Nie rób: nie zmieniaj strony strzałki stylami inline — kierunek jest częścią rysunku `::before`/`::after`.
- Kontrast (zmierzony): turkus `#00838d` na prawie białym tle `#fffffff5` — 4,53:1, tuż nad progiem 4,5:1; tekst wagi 500 nie schodzi poniżej `.83rem`.
- Szkło i wysoki kontrast: źródło nie ma osobnych reguł dla `.vilda-tip` — dymek jest w każdym motywie tym samym szkłem (rozmycie działa nad treścią pod nim); w wysokim kontraście zostaje półprzezroczysty, więc nie stawiaj go nad gęstym tekstem.
- W podglądzie dymki stoją w przepływie dokumentu (nadpisanie tylko `position`); w aplikacji `.vilda-tip` jest `position:fixed`, a `.menu-tooltip` absolutny.

Wersja statyczna, przepisana ręcznie z src/css/vilda_chrome.css (linie 964–1020) i src/css/style.css (linie 4053–4078, baza `.menu-tooltip`).
