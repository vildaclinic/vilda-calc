# TutorialOverlay

Nakładka samouczka: przyciemnienie strony, turkusowa ramka wokół elementu, o który chodzi, i biały dymek z tytułem kroku, opisem oraz przyciskami „Dalej” i „Pomiń”.

## Kiedy używać

Do prowadzenia użytkownika po karcie krok po kroku (pierwsze uruchomienie, nowa funkcja): każdy krok wskazuje jeden element formularza lub wyniku. Nie używaj do komunikatów ani ostrzeżeń — od tego są Callout, Notice i Toast. Nie zasłaniaj wskazywanego elementu dymkiem.

## Co dostarcza konsument

- `<div class="tutorial-overlay">` z inline `display:block` (w arkuszu `display:none`), a w nim `.tutorial-blocker` z inline `inset` (może być kilka bloków wokół celu), `.tutorial-highlight-frame` z inline `display:block; top; left; width; height` zmierzonymi z `getBoundingClientRect()` celu oraz `.tutorial-bubble[role="dialog"]` z `<strong>` (tytuł kroku), `<p>` (opis) i przyciskami `<button class="tutorial-next">` oraz `<button class="tutorial-skip">`.
- Wskazywany element dostaje klasę `tutorial-highlight` (`position:relative`), żeby nie wypadł z warstwy.
- Chwilowe ukrycie (np. podczas przewijania do celu): klasa `is-temporarily-hidden` na nakładce lub dymku; klasa `nav-ui-temporarily-hidden` na `<body>` chowa dock mobilny i przycisk „do góry”.
- Arkusz nie buduje tych elementów sam; obecny `tutorial.js` tworzy przewodniki `ww-*`, więc znacznik pochodzi z inwentarza i musi być odtworzony przez konsumenta dokładnie w tym zagnieżdżeniu.
- W podglądzie nakładka, blokada, ramka i dymek są pozycjonowane względem sceny (nadpisanie tylko `position`); w aplikacji wszystkie cztery są `position:fixed` względem okna.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.tutorial-overlay` | `position:fixed; inset:0; z-index:10020; display:none`, `pointer-events:none`, `touch-action:none`, `overscroll-behavior:contain` |
| `.tutorial-blocker` | `position:fixed`, tło `#0f172a94`, `pointer-events:auto` (przechwytuje kliknięcia poza celem) |
| `.tutorial-highlight-frame` | `position:fixed; display:none`, obrys `2px solid rgba(0,131,141,.96)`, promień 12px, przezroczyste tło, cień `0 16px 36px #0f172a29`, `z-index:10021`, bez wskaźnika |
| `.tutorial-bubble` | `position:fixed; top:1rem; left:1rem`, `width:min(320px, 100vw − 2rem)`, `max-height:calc(100dvh − 2rem)` z przewijaniem, biel, tekst `#111`, `padding:1.2rem 1rem`, promień 14px, cień `0 18px 48px #0f172a42`, `line-height:1.45`, `z-index:10022` |
| `.tutorial-bubble strong` | blok `1.08rem` w `var(--primary)`, `margin-bottom:.4rem` |
| `.tutorial-bubble p` | `.98rem`, bez marginesu |
| `.tutorial-bubble button` | `margin-top:.85rem`, `padding:.5rem 1rem`, bez obrysu, promień 8px, `.95rem`, cień `0 2px 8px #0f172a24` |
| `.tutorial-next` | tło `var(--primary)`, biały tekst, `margin-right:.5rem` |
| `.tutorial-skip` | tło `#e6ebee`, tekst `#22303a` |
| `.is-temporarily-hidden` | `visibility:hidden; opacity:0; pointer-events:none` (`!important`) |
| `body.nav-ui-temporarily-hidden` | `#mobileBottomDock` i `#scrollTopBtn` ukryte; dock przesunięty o `100% + safe-area + var(--mobile-dock-bottom-gap, 4px) + .95rem` |

## Tokeny

- `--primary` (tytuł kroku, przycisk „Dalej”)
- `--mobile-dock-bottom-gap` (przesunięcie docka przy ukryciu)
- `--lg-border` (obrys przycisków w motywie szkła), `--hc-focus-width`, `--hc-focus-color` (fokus w wysokim kontraście)
- kolory wpisane na stałe: `#0f172a94`, `rgba(0,131,141,.96)`, `#0f172a29`, `#0f172a42`, `#0f172a24`, `#111`, `#e6ebee`, `#22303a`

## Zasady

- Rób: tytuł kroku krótki, w trybie rozkazującym jak w aplikacji („Pierwsze kroki”, „Uzupełnij dane”), opis jednym–dwoma zdaniami; zawsze dwa wyjścia — „Dalej” i „Pomiń”.
- Rób: mierz ramkę z rzeczywistego elementu i przelicz po `resize`/`scroll`; podczas przewijania używaj `is-temporarily-hidden` zamiast usuwać nakładkę.
- Nie rób: nie kładź w dymku formularzy ani linków — dymek ma `pointer-events:auto`, ale reszta nakładki blokuje stronę.
- Nie rób: nie zmieniaj kolejności warstw (`10020/10021/10022`) ani nie podnoś ich ponad okna modalne (`#thyTermModal` ma `9999`, arkusze AuthSheet `1000000`).
- Kontrast: tekst `#111` na bieli, tytuł `#00838d`; ramka `rgba(0,131,141,.96)` na przyciemnieniu `#0f172a94` jest czytelna także na jasnych kartach.
- Szkło i wysoki kontrast: źródło nie ma reguł `.liquid-ios26` ani `high-contrast` dla samouczka; globalna reguła szkła zamienia oba przyciski w białe pigułki 20 % (`#fff3`, tekst `#111`, promień 14px) — tak wyglądają w aplikacji; w wysokim kontraście dochodzi obwódka fokusu `var(--hc-focus-width)`.

Wersja statyczna, przepisana ręcznie z src/css/style.css (linie 450–524), src/css/ios26-v2.css (85–99) i inwentarza components-core.json (znacznik).
