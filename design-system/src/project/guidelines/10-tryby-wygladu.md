# Tryby wyglądu

Vilda ma jeden wygląd bazowy i trzy przełączniki, którymi użytkownik go stroi. Wszystkie żyją w ustawieniach, w sekcji **Wygląd aplikacji** („Sterujesz tłem, siłą efektu Liquid Glass oraz czytelnością interfejsu bez wpływu na logikę obliczeń”). Zapisują się lokalnie w przeglądarce, nie są częścią danych pacjenta i nie synchronizują się z chmurą. W tym systemie każdy stan przełącznika jest osobnym motywem tokenów, więc podgląd komponentu można obejrzeć w każdym z nich.

## Liquid Glass jest zawsze włączone

Klasa `liquid-ios26` stoi na `<body>` każdej strony aplikacji (poza `subskrypcja.html`) i skrypt `ios26-ui.js` dokłada ją bezwarunkowo. Nie ma wyłącznika. To oznacza dwie rzeczy dla każdego, kto buduje z tego systemu:

- Wygląd domyślny **to szkło**: półprzezroczysta biel `lg-surface-light` na tle `bg`, obrys 1 px `lg-border`, promień `lg-radius` (18 px), cień `lg-shadow` i rozmycie tła `blur(14px) saturate(115%)` na kartach (`blur(16px)` na powierzchniach `_glass`, `blur(10px)` na panelach wewnętrznych). Przyciski stają się białymi pigułkami o kryciu 20 % (`#fff3`) z tekstem `#111`, promieniem 14 px i cieniem `0 4px 12px #0000001a`; pola formularza dostają biel 85 % (`#ffffffd9`), obrys `rgba(0,0,0,.12)` i promień 12 px, bez rozmycia.
- Motyw **nadpisuje** style bazowe: 826 z 1035 deklaracji Liquid Glass ma `!important`, a reguły są prefiksowane `.liquid-ios26`. Gradienty markowe na przyciskach z `style.css` znikają; tam, gdzie produkt chce wyróżnić CTA, przywraca pełny `primary` lub `secondary` osobną regułą. Komponent, który ma wyglądać inaczej niż szkło, musi to zrobić tak samo: selektor z prefiksem `.liquid-ios26`, `!important` i jawne wyzerowanie `backdrop-filter` oraz `box-shadow`. Bez tego motyw wygra.

Kolejność arkuszy nie jest jednolita (na stronach aplikacyjnych `ios26-v2.css` ładuje się przed `style.css`, na stronach informacyjnych po nim), więc przy równej ważności decyduje pozycja pliku. Nie polegaj na kolejności; polegaj na prefiksie i `!important`, jak robi to źródło.

Szkło leży na płaskim tle: `bg` jest czyste `#ffffff`, bez tapety ani gradientu, więc przezroczystość czyta się jako szarawe rozjaśnienie, nie jako efekt. Pasek bezpiecznego obszaru u góry (`body.liquid-ios26::before`) jest jedynym ciemnym elementem: `#00000038`.

## Płynne szkło (0–4)

Suwak **Płynne szkło** ustawia klasę `glass-level-N` na `<body>` i zmienia tylko trzy zmienne. Domyślny poziom to 0.

| Poziom | `lg-surface-light` | `lg-border` | `lg-shadow` |
| --- | --- | --- | --- |
| 0 (domyślny) | `rgba(255, 255, 255, .18)` | `rgba(255, 255, 255, .32)` | `0 8px 28px rgba(0, 0, 0, .12)` |
| 1 | `rgba(255, 255, 255, .3)` | `rgba(255, 255, 255, .5)` | bez zmian |
| 2 | `rgba(255, 255, 255, .45)` | `rgba(255, 255, 255, .65)` | bez zmian |
| 3 | `rgba(255, 255, 255, .58)` | `rgba(255, 255, 255, .78)` | `0 10px 32px rgba(0, 0, 0, .15)` |
| 4 | `rgba(255, 255, 255, .72)` | `rgba(255, 255, 255, .9)` | `0 12px 36px rgba(0, 0, 0, .18)` |

Suwak wzmacnia krycie, nie wyłącza szkła. Strony z własnymi paletami (`edu-*`, `contact-*`, `diab-*`) mają równoległe drabinki: powierzchnie od `.86` do `.98`, obrysy od `.34` do `.90`, rozmycie od 16 do 13 px. W tym systemie poziom 4 jest motywem `glass-4`; poziomy 1–3 leżą między nim a domyślnym i nie mają osobnych motywów.

Nowa powierzchnia szklana musi czerpać z `lg-surface-light` i `lg-border`, nigdy z wpisanej na stałe bieli, inaczej suwak jej nie obejmie.

## Wysoki kontrast (wył. / 1–3)

Przełącznik **Wysoki kontrast** z suwakiem poziomu (podpowiedź w ustawieniach: „1 = subtelny, 2 = zbalansowany, 3 = maksymalna czytelność”) ustawia `high-contrast-level-N`; po włączeniu domyślny jest poziom 2. Kontrast **zastępuje** szkło, nie dokłada się do niego: karty, nagłówek i pola przechodzą na zestaw `hc-*`.

| Zmienna | 1 | 2 | 3 |
| --- | --- | --- | --- |
| `hc-surface` | `rgba(255, 255, 255, .84)` | `rgba(255, 255, 255, .9)` | `rgba(255, 255, 255, .96)` |
| `hc-border` | `rgba(7, 54, 62, .18)` | `rgba(7, 54, 62, .24)` | `rgba(7, 54, 62, .32)` |
| `hc-card-border-width` | `1px` | `1.5px` | `2px` |
| `hc-shadow` | `0 12px 30px rgba(0, 0, 0, .1)` | `0 14px 34px rgba(0, 0, 0, .13)` | `0 16px 38px rgba(0, 0, 0, .16)` |
| `hc-blur` | `blur(10px) saturate(112%)` | `blur(8px) saturate(108%)` | `blur(6px) saturate(105%)` |
| `hc-input-bg` | `rgba(255, 255, 255, .96)` | `rgba(255, 255, 255, .98)` | `rgba(255, 255, 255, 1)` |
| `hc-input-border` | `rgba(7, 54, 62, .22)` | `rgba(7, 54, 62, .28)` | `rgba(7, 54, 62, .36)` |
| `hc-result-bg` | `rgba(255, 255, 255, .93)` | `rgba(255, 255, 255, .96)` | `rgba(255, 255, 255, .99)` |
| `hc-text` | `#10282d` | `#0b2227` | `#07181c` |
| `hc-muted` | `#35545c` | `#29474f` | `#1f3941` |
| `hc-focus-color` | `rgba(0, 131, 141, .34)` | `rgba(0, 131, 141, .42)` | `rgba(0, 131, 141, .5)` |
| `hc-focus-width` | `2px` | `2.5px` | `3px` |

Przyciski modułów w kontraście są nieprzezroczystą bielą (`hc-module-btn-bg` `.9` / `.94` / `.98`) z ciemnym obrysem i bez rozmycia; stan aktywny to blady turkus (`hc-module-btn-active-bg`) z obrysem `rgba(0,131,141,.46/.56/.66)`. Tekst wyciszony i placeholdery przechodzą na `hc-muted` z pełnym kryciem. Każdy element z `:focus-visible` dostaje obrys `hc-focus-width` w `hc-focus-color`.

Palety stron aliasują się na ten zestaw: `edu-surface`, `contact-surface` i `diab-surface-1` stają się `{hc-surface}`, obrysy `{hc-border}`, tekst `{hc-text}`. Nowa paleta modułu musi mieć taki sam blok aliasów dla `.high-contrast-level-1/2/3`, inaczej moduł zostanie jedyną szklaną wyspą na kontrastowej stronie.

## Ciemne tło (0–2)

Suwak **Ciemne tło** ustawia `dark-bg-level-N` i przyciemnia wyłącznie tło strony: poziom 1 to `#f5f5f5`, poziom 2 to `#e0e0e0` (oba z `!important`). Krycie szkła się nie zmienia, więc karty na ciemniejszym tle wyglądają na cieplejsze i bardziej wyraźne; palety stron pogłębiają cienie do `rgba(11, 27, 33, .1)` (poziom 1) i `rgba(8, 20, 26, .13)` (poziom 2) i na poziomie 2 dokładają delikatny obrys `rgba(22, 76, 71, .12)`. W trybie profesjonalnym tło `professional-bg` (`#f5f5f5`) jest wyłączane, gdy suwak przekracza 0, żeby oba przyciemnienia nie nakładały się.

W tokenach: `bg` ma wartość osobną dla motywów `dark-bg-1` i `dark-bg-2`. Element, który ma leżeć bezpośrednio na stronie, bierze tło z `bg`, nie z `#ffffff`.

## Co nie jest trybem

- Nie ma trybu ciemnego. Blok `@media (prefers-color-scheme: dark)` w `ios26-v2.css` (`lg-surface-light` `.14`, `lg-border` `.28`) jest martwy, bo drabinka szkła nadpisuje go z `!important`. Nie projektuj ciemnych wariantów, dopóki właściciel nie zdecyduje inaczej.
- Nie ma kontrolki rozmiaru tekstu. `mobile-top-nav-font-size` jest wyliczany automatycznie dla etykiet górnej nawigacji mobilnej i nie jest ustawieniem użytkownika.
- `display-mode-standalone` (aplikacja zainstalowana) zmienia tylko pozycję dolnego docka. `html.vilda-embedded` (`?embedded=1` w powłoce `app.html`) ukrywa nagłówek, pasek boczny, dock i pasek bezpiecznego obszaru; powłoka nie kopiuje klas wyglądu do ramek, każda ramka liczy je sama z tego samego `localStorage`, a zdarzenie `storage` utrzymuje je w zgodzie.
- Ruch: przy `prefers-reduced-motion: reduce` animacje wejścia szkła (`_enter`, `_pop`, `_bounce`), przejścia docka i przejścia widoków są wyłączane, a globalne animacje skracane do `.01ms`. Wyjątkiem są pulsy kliniczne na wynikach (`pulseOrange`, `pulseRed` na `#intakeResults`, `#bpResult`, `#coleInfo`), które źródło przywraca z `!important`, bo niosą ostrzeżenie. Zachowaj ten wyjątek.
