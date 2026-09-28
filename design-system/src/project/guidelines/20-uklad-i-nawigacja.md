# Układ i nawigacja

Vilda ma jeden szkielet strony, który na desktopie rozkłada się na pasek chrome, sidebar i treść, a na telefonie na pasek chrome z hamburgerem, szufladę i dolny dock. Ten sam szkielet działa dla strony otwartej wprost i dla strony osadzonej w powłoce `app.html`. Komponent projektowany do tego systemu musi zmieścić się w kontenerze treści, nie rysować własnej nawigacji i liczyć dół ekranu ze zmiennej, którą publikuje właściciel docka.

## Powłoka aplikacji

`app.html` jest hostem SPA-lite: `body` ma `100dvh` i `overflow: hidden`, blok `.app-shell-main` trzyma ułożone na sobie ramki same-origin (`border: 0`, przezroczyste), a nad nimi leży szkielet ładowania `.app-shell-skeleton` (warstwa `--z-mini-summary` `5`, tekst `.skeleton` „Ładowanie…”). Od `--bp-desktop` `992px` kolumna główna dostaje `margin-top: 14px` i wysokość `calc(100dvh - 80px)`, żeby zrównać się ze szklanym sidebarem; prawa kolumna dekoracyjna `#vildaShellDecor` pokazuje się od `--bp-wide` `1400px` tylko na trasach start, DocPro, klirens, steroidy i HOMA (terminarz zostaje w dwóch kolumnach). Każda karta docka to osobna strona załadowana z `?embedded=1`; taka strona ma `html.vilda-embedded` i ukrywa własny nagłówek, sidebar, dock, przycisk powrotu na górę oraz pasek bezpiecznego obszaru, a jej siatka staje się blokiem. Powłoka wstrzykuje do ramki zmienną `--vilda-shell-dock-h` (wysokość docka, fallback `84px`) i dolny odstęp, żeby treść nie chowała się pod dockiem; stan błędu `.is-error` pokazuje dwa przyciski: „Spróbuj ponownie” (tło `--success`, biały tekst) i „Otwórz bezpośrednio”. Klasy wyglądu nie są kopiowane do ramek; każda ramka liczy je sama z tego samego `localStorage`.

## Pasek chrome

`vilda_chrome.js` wypełnia pusty `<header>` każdej strony paskiem `.chrome-strip` o wysokości `--chrome-strip-height` `64px`, szerokości do `--chrome-strip-max-width` `1500px`, z `padding: 0 1rem` i `gap: .75rem`. Powierzchnia to szkło `--chrome-glass-bg` `rgba(255, 255, 255, .78)` z rozmyciem `--blur-chrome-header` `blur(14px)` i `--blur-chrome-header-saturate` `saturate(160%)`, dolny obrys `1px` w `--chrome-glass-border` i cień `0 1px #fff9 inset,0 6px 18px #0046500f`; pod zawsze włączonym szkłem nagłówek dostaje gradient `linear-gradient(180deg,#ffffffe6,#fffc)`, promień `0 0 var(--lg-radius) var(--lg-radius)` i warstwę `--z-header-liquid` `200` (bez skóry: `--z-header-chrome` `50`). Od `--bp-desktop` pasek jest `sticky` przy `top: 0` i niesie nazwę przejścia widoku `vilda-header`.

Blok marki po lewej: znak `logo_vilda.webp` w `--brand-logo-size` `38px` z promieniem 10 px, nad sobą `.brand-name` „wagaiwzrost.pl” w `--primary` i `.brand-tagline` „Vilda Clinic” w `--chrome-label-color`. Chipy (PatientChip, UserChip, ChromeActionButton) są dosunięte do prawej przez `margin-left: auto` z odstępem `.55rem`. Poniżej `--bp-below-desktop` `991px` blok marki znika, nagłówek rośnie do `min-height: calc(var(--chrome-strip-height) + 25px)` (`--chrome-strip-height` `64px`), a pod paskiem pojawia się 25-pikselowa listwa `.chrome-mobile-brand-bar` (`#00838d0d`, górny obrys `.5px` w `--chrome-glass-border`) z nazwą `.brand-bar-mobile`. `html` ma `scroll-padding-top: calc(var(--chrome-strip-height, 64px) + 12px)`, więc kotwice nie chowają się pod paskiem; ustawienia używają tej samej wysokości jako `scroll-margin-top`.

## Siatka desktopowa (≥ 992 px)

`.has-sidebar .desktop-layout` to siatka `grid-template-columns: var(--chrome-sidebar-width) 1fr` (`--chrome-sidebar-width` `270px`) z `gap: 1rem` i `padding: 1rem 0 2rem`; od `--bp-wide` `1400px` dochodzi trzecia kolumna `--decor-sidebar-width` `230px` dla MiniSummary i skrótów. Starszy `sidebar.css` liczy `260px 1fr` (`--sidebar-legacy-width`) z `gap: .5rem` i `230px 1fr 230px` na szerokim ekranie. Sidebar jest `sticky` w `top: calc(var(--chrome-strip-height, 64px) + 1rem)` z `max-height: calc(100vh - var(--chrome-strip-height, 64px) - 1rem)`, ma promień `0 14px 14px 0` (`--chrome-radius-card`), tło `--chrome-glass-bg`, obrys `--chrome-glass-border` bez lewej krawędzi, cień `--chrome-glass-shadow` i cienki turkusowy pasek przewijania; prawa kolumna dekoracyjna odbija promień na `14px 0 0 14px`. Wewnątrz `.sidebar-inner` ma `padding: .4rem 0`, sekcje oddziela `1px rgba(0,131,141,.08)`, tytuły `.nav-section-title` są wcięte o `--chrome-sidebar-pad-x` `.85rem`, a strefa dodatków trzyma MiniSummary w karcie `#ffffffd9` z promieniem 10 px. Zanim skrypt zamontuje sidebar, `aside.sidebar:not(.sidebar-v2)` jest niewidoczny i pokazuje szkielet pasków (`rgba(13,68,76,.08)` co 40 px, wysokość 470 px). Treść główna `.has-sidebar .main-content` jest kartą z `padding: 1.25rem 1.25rem 1.5rem`, promieniem `--chrome-radius-card` `14px` i cieniem `--shadow-main-content`; strony narzędziowe (HOMA, klirens, DocPro) ograniczają się w niej do `--content-narrow-max-width` `720px`. Poniżej `--bp-below-desktop` sidebar znika całkowicie i zastępuje go szuflada.

## Górna nawigacja mobilna i szuflada (≤ 991 px)

Po lewej stronie paska stoi hamburger `.chrome-mobile-menu-btn`: kwadrat 40×40 (`#fff9`, obrys `1px` `--chrome-glass-border`, promień 12 px, ikona 22 px w `--primary`; hover `#ffffffe6`, aktywny `scale(.96)`), z `aria-label="Otwórz menu"`. Otwiera ChromeDrawer: tło `#0f1c1e73` z `--blur-drawer-backdrop` `blur(2px)`, biały panel `--drawer-width` `min(86%,320px)` z cieniem `4px 0 24px #00323c2e`, górnym paddingiem z `env(safe-area-inset-top, 0px)` i warstwą `--z-drawer` `99999`. Głowica (`.9rem 1rem`, obrys `#e5eded`) ma tytuł „Menu” w `--primary` i przycisk zamknięcia 36 px (promień 10 px, `aria-label="Zamknij menu"`); panel ma `role="dialog"` i `aria-modal="true"`, tło zamyka go atrybutem `[data-vilda-chrome-drawer-close]`. Ciało to karta konta (gradient `#00838d0f` do `#00838d00`, wiersz pacjenta kreskowany) i trzy sekcje: „Pacjent” (tytuł ukryty; przyciski `chrome-drawer-btn` „Zapisz dane”, „Dodaj notatkę do wizyty”, „Pacjenci”), „Narzędzia” i „Konto”, z wierszami o promieniu 10 px, ikonami w polu 22×22 (glif 18 px, `.chrome-drawer-icon`) i etykietą `.button-chrome-drawer`. Otwarcie: `body.chrome-drawer-open` przesuwa panel z `translate(-100%)` w `.28s cubic-bezier(.4,0,.2,1)` i blokuje przewijanie ciała. Starsza nawigacja tekstowa MainNav (`.main-nav`) jest ukryta pod chrome; na stronach bez niego przy `--bp-phone-small` `600px` staje się siatką `var(--mobile-top-nav-hamburger-size) repeat(5, minmax(0,1fr))` z odstępem `--mobile-top-nav-gap`, paddingiem `--mobile-top-nav-side-padding` i etykietami `.nav-top-mobile`.

## Dock mobilny

MobileDock (`#mobileBottomDock`) to pływający pasek kart przypięty nad bezpiecznym obszarem: lewy i prawy margines `max(var(--mobile-dock-side-gap), calc(env(safe-area-inset-left, 0px) + .35rem))` (`--mobile-dock-side-gap` `.75rem`), dół `env(safe-area-inset-bottom, 0px)` + `--mobile-dock-bottom-gap` `4px` + `--mobile-dock-extra-offset` `0px`, warstwa `--z-mobile-dock` `1100`. Lista ma `min-height` `--mobile-dock-height` `84px` (`--mobile-dock-height-compact` `80px` do `--bp-phone-480` `480px`), tło `#fffc` z `--blur-dock` `blur(24px)` i `--blur-dock-saturate` `saturate(155%)`, obrys `1px rgba(255,255,255,.42)`, promień 1.55rem, cień `0 18px 42px #0f172a29, inset 0 1px #ffffff6b`, `padding: .4rem`, `gap: .28rem` i pięć kolumn `repeat(5, minmax(0,1fr))`. Kafelek: `padding: .42rem .28rem`, promień 1.2rem, ikona 1.2rem, etykieta `.dock-label` (`.63rem` przy `--bp-phone-480`), kolor `#52606d`; aktywna trasa ma tekst `--primary`, tło `#00838d1f` i wewnętrzny pierścień `0 0 0 1px #00838d2e`; naciśnięcie `scale(.97)`. Ciało strony z klasą `has-mobile-bottom-dock` rezerwuje `padding-bottom` na wysokość docka, bezpieczny obszar i 1rem. W zainstalowanej PWA na urządzeniu dotykowym (`display-mode: standalone` i `pointer: coarse`) dock kotwiczy się do bezpiecznego obszaru + 4 px, a `body` dostaje `min-height: calc(100% + 120px)`. Stany ukrycia: `.is-hidden` / `.is-keyboard-hidden` zsuwają dock o `calc(100% + env(safe-area-inset-bottom,0px) + var(--mobile-dock-bottom-gap) + .95rem)` i ściszają do `--opacity-hidden-dock` `.001`, `body.user-hides-mobile-dock` usuwa go z układu, a `html.vilda-pane-modal-open` w powłoce chowa go na czas modalu. Wysokość zmierzoną publikuje `ios26-ui.js`; elementy pływające (Toast, banery, kotwice `vilda-dol-kotwica`) liczą swój `bottom` z `--vilda-dol-wolny`, a w powłoce z `--vilda-shell-dock-h`, nigdy z własnych stałych.

## Przycisk powrotu na górę

Na stronach otwartych wprost przycisk powrotu na górę (`#scrollTopBtn`, `aria-label="Powrót na górę strony"`) jest dyskiem `--scroll-top-size` `4rem` w `--primary` z białą strzałką 3rem i cieniem `--shadow`, przypiętym `bottom: 1rem` (`--scroll-top-btn-bottom`), `right: 1rem`, w warstwie `--z-menu` `1000`; hover przełącza tło na `--secondary`. Nad widocznym dockiem przycisk przechodzi do `--z-scroll-top-dock` `1201`, a jego dół to wysokość docka plus `--mobile-dock-scroll-top-gap` `4px`. W powłoce zastępuje go `#appShellScrollTop`: dysk `--shell-scroll-top-size` `44px` ze szkła (`#ffffffb8`, `--blur-shell-scroll-top` `blur(12px)` z `saturate(1.4)`, obrys `.5px rgba(255,255,255,.55)`, ikona w `--success`) przy `right: 16px` i `bottom: calc(var(--vilda-shell-dock-h, 84px) + 14px)`, obok `#appShellTermFab` `--shell-term-fab-size` `54px` w `--primary` dla terminarza; oba w warstwie `--z-shell-fab` `1150`, niewidoczne (`opacity: 0`, `translateY(10px)`) do klasy `.is-visible`, naciśnięcie `scale(.94)`.

## Punkty przełamania

Zapytania są w większości `max-width`; podejście od telefonu w górę (`min-width`) nie jest używane.

| Token | Wartość | Znaczenie |
| --- | --- | --- |
| `--bp-desktop` | `992px` | Od tej szerokości: siatka z sidebarem, przyklejony nagłówek, nazwy przejść widoku, mini-podsumowanie w kolumnie. |
| `--bp-below-desktop` | `991px` | Do tej szerokości: chrome mobilny (nagłówek +25 px, hamburger, dock, padding kontenera z bezpiecznego obszaru). |
| `--bp-wide` | `1400px` | Trzecia kolumna dekoracyjna `230px`. |
| `--bp-tablet-up` | `700px` | Formularze i wyniki w dwóch kolumnach (`#calcForm`, `.grid-two` `minmax(0,1fr) minmax(0,1fr)`), przyciski modułów po 50 %; poniżej jedna kolumna, stopka z czterech kolumn spada do trzech. |
| `--bp-phone-small` | `600px` | Zwarta górna nawigacja, chipy chrome zwijają się do kafelków 34×34, przyciski na pełną szerokość. |
| `--bp-phone-sm` | `640px` | Telefon w stylach stron informacyjnych (o-aplikacji, kontakt, subskrypcja, steroidy): karty na pełną szerokość, siatka planów w jednej kolumnie. |
| `--bp-phone-560` | `560px` | Telefon w DocPro i ustawieniach (tytuł akordeonu `.88rem`). |
| `--bp-phone-520` | `520px` | Telefon w oknach konta (tytuł 22 px, klucz odzyskiwania 15 px). |
| `--bp-phone-480` | `480px` | Dock 80 px, etykieta docka `.63rem`. |
| `--bp-phone-420` | `420px` | Drugi krok tokenów górnej nawigacji. |
| `--bp-phone-360` | `360px` | Trzeci krok tokenów górnej nawigacji. |
| `--bp-tablet-768` | `768px` | Arkusz praktyczny norm żywieniowych. |
| `--bp-settings-980` | `980px` | Akordeon ustawień w jednej kolumnie; od tej szerokości dwupanelowa przestrzeń klirensu `minmax(0, 1fr) 348px`. |

Poza tokenami źródło używa też `@media (pointer: coarse) and (max-width: 1366px)` dla nakładek konta nad dockiem, `@container (max-width: 660px)` dla podsumowania akordeonu ustawień oraz `@supports not (backdrop-filter: blur(1px))`, pod którym szkło spada na stałe `#ffffff80`.

## Drabina warstw

| Token | Wartość | Co tu leży |
| --- | --- | --- |
| `--z-behind` | `-1` | Pseudoelementy dekoracyjne (poświaty kart, błysk `.result-card.--pulse:after`). |
| `--z-base` / `--z-raised` | `0` / `1` | Obrys „snake” i jego przycisk, dialog modułu cukrzycy. |
| `--z-range-marker` | `3` | Znacznik zakresu w przeliczniku. |
| `--z-film-controls` | `4` | Sterowanie filmem w module cukrzycy. |
| `--z-mini-summary` | `5` | Mini-podsumowanie w sidebarze, szkielet powłoki. |
| `--z-search-popover` | `6` | Wyszukiwarka formuł klirensu. |
| `--z-dropdown` | `20` | Podpowiedź blokady w ustawieniach, sortowanie w kartotece. |
| `--z-date-popover` | `40` | Popover daty urodzenia. |
| `--z-header-chrome` | `50` | Sticky nagłówek z chrome. |
| `--z-header-liquid` | `200` | Nagłówek pod skórą szkła. |
| `--z-menu` | `1000` | Menu pionowe, przycisk powrotu na górę, pasek bezpiecznego obszaru, dymki klirensu. |
| `--z-mobile-dock` | `1100` | Dock mobilny. |
| `--z-shell-fab` | `1150` | Przyciski pływające powłoki. |
| `--z-scroll-top-dock` | `1201` | Przycisk powrotu na górę nad dockiem. |
| `--z-clcr-live` / `--z-clcr-help` | `1202` / `1300` | Pasek formuły i dymek pomocy klirensu. |
| `--z-reward` | `2200` | Warstwa nagród w module cukrzycy. |
| `--z-save-popover` | `9500` | Popover stanu zapisu. |
| `--z-video-modal` / `--z-modal` | `9998` / `9999` | Modal filmu; modal glosariusza, lista substancji, dymek przelicznika. |
| `--z-banner` | `10000` | Baner cookies, baner aktualizacji, nakładka trybu profesjonalnego. |
| `--z-pwz-overlay` | `10001` | Nakładka zapamiętania PWZ. |
| `--z-tutorial-overlay` / `--z-tutorial-frame` / `--z-tutorial-bubble` | `10020` / `10021` / `10022` | Samouczek: tło, ramka, dymek; również dymki menu i zakresu. |
| `--z-clcr-patient-card` | `10050` | Karta pacjenta klirensu. |
| `--z-practice-sheet` | `12000` | Dolny arkusz praktyczny norm żywieniowych. |
| `--z-loading-overlay` | `20000` | Nakładka ładowania Z-score w DocPro. |
| `--z-logout-button` | `99990` | Przycisk wylogowania. |
| `--z-drawer` | `99999` | Szuflada mobilna, dymek `.vilda-tip`, toast SGA. |
| `--z-auth-root` / `--z-auth-sheet` | `999999` / `1000000` | Ekran logowania i jego arkusze. |
| `--z-reminder-dialog` | `1000001` | Okno przypomnienia. |
| `--z-logout-overlay` | `2000000` | Nakładka wylogowania. |
| `--z-note-editor` | `2000010` | Edytor notatki i terminu. |
| `--z-toast` / `--z-copy-toast` | `2147483000` / `2147483001` | Dymek i dymek kopiowania podsumowania. |

Nowy element pływający bierze wartość z tej drabiny i staje między istniejącymi warstwami; nie dopisuj własnych liczb ani nie przekraczaj `--z-copy-toast`.

## Kontenery i miary czytania

| Token | Wartość | Użycie |
| --- | --- | --- |
| `--container-max-width` | `960px` | `.container`, `.site-footer__inner`, strona filmów; `padding: 1rem`, `margin-inline: auto`; do `--bp-below-desktop` padding boczny z bezpiecznego obszaru. |
| `--sub-max` | `960px` | Kontener strony subskrypcji. |
| `--content-narrow-max-width` | `720px` | Strony narzędziowe wewnątrz treści z sidebarem. |
| `--notes-shell-max-width` | `1080px` | Powłoka notatek i terminarza. |
| `--auth-card-max-width` | `880px` | Karta konta od `1200px`. |
| `--sub-hero-max-width` | `660px` | Hero i FAQ subskrypcji. |
| `--edu-portrait-max-width` | `520px` | Pionowa rama filmu. |
| `--auth-sheet-width` / `--dialog-width` | `480px` / `460px` | Arkusz konta; okno przypomnienia i nakładki DocPro. |
| `--clcr-result-rail-width` | `348px` | Prawa szyna wyniku klirensu od `980px`. |
| `--toast-max-width` | `min(88vw,520px)` | Dymek dolny (`vilda-dymek--prawo`: `min(420px, calc(100vw - 32px))`). |
| `--measure-copy` / `--measure-lead` / `--measure-diab-lead` | `72ch` / `74ch` / `60ch` | Akapity edukacyjne, lead edukacyjny, lead modułu cukrzycy. |
| `--icon-column-width` | `34px` | Kolumna przycisku ikony w wierszach posiłków i pomiarów (`1fr 100px 34px`, `1fr 1fr 34px`, `minmax(0,1fr) 34px`). |

Siatki kart są `auto-fit`: `repeat(auto-fit, minmax(260px,1fr))` dla ustawień na stronie głównej, `minmax(270px,1fr)` w ustawieniach, `minmax(280px,1fr)` dla prezentacji edukacyjnych i kart kontroli, `minmax(180px,1fr)` dla parametrów dorosłych; notatki i terminarz używają `repeat(auto-fill, minmax(280px, 1fr))`. Stopka to `1.5fr 1fr 1fr 1fr`. Przestrzeń klirensu od `--bp-settings-980` to `minmax(0, 1fr) 348px`, a jego siatka modułów ma cztery kolumny od `920px`. Modal glosariusza tarczycy mieści się w `--thy-modal-inner-max-height` `760px` pomniejszonym o bezpieczne obszary. Nowy widok układa się w tych kontenerach; nie wprowadzaj szerokości spoza tabeli.
