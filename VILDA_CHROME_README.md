# Vilda Chrome — wspólny komponent menu i nagłówka

Wersja 1.0.0 · maj 2026

## Po co to jest

Aplikacja `wagaiwzrost.pl` ma 15 podstron, a każda powtarzała:

- około 100 linii statycznego HTML-a sidebara z menu,
- nagłówek z logo i drugim, hamburgerowym wariantem menu.

Powodowało to dwa problemy:

1. **Skakanie viewportu przy nawigacji** — drobne różnice w renderowaniu (kolejność ikon, wysokość elementów, mini‑summary) powodowały przesunięcia treści między podstronami.
2. **Bałagan przy zmianach** — dodanie pozycji menu wymagało zmian w 15 plikach.

Komponent `vilda_chrome.js` rozwiązuje oba problemy: jedno źródło prawdy dla menu i nagłówka, identyczna geometria na każdej podstronie, oraz strefa informacyjna z aktualnie zalogowanym lekarzem i wczytanym pacjentem.

## Co zostało dostarczone

| Plik | Zawartość |
|---|---|
| `vilda_chrome.js` | Komponent JS — renderuje sidebar i strip nagłówka, podświetla aktywny link, integruje się z `VildaVault` i polami formularza pacjenta. |
| `vilda_chrome.css` | Style nowego layoutu (Liquid Glass v2). Ładowany **po** `sidebar.css`, więc nadpisuje co trzeba. |
| `vilda_chrome_demo.html` | Standalone demo — pozwala obejrzeć nowy wygląd i przetestować różne stany (zalogowany/gość/niezalogowany, z pacjentem/bez). |
| `service-worker-kalorii.js` | Zaktualizowane: pliki dodane do `CORE_SHELL_URLS`. |
| 15 plików HTML | Każdy ma teraz jedną dodatkową linię `<link>` i jedną `<script>` w `<head>`. |

## Jak to działa

1. `vilda_chrome.js` startuje na `DOMContentLoaded`.
2. Znajduje istniejący `<header>` i `<aside class="sidebar">` (wsparcie dla nowych mount-pointów `data-vilda-chrome-header` i `data-vilda-chrome-sidebar`).
3. Ukrywa stary `header > .container` i `header > .main-nav` przez klasę `body.has-vilda-chrome` w CSS.
4. Renderuje:
   - **Strip nagłówka** — logo, brand, hamburger (mobile), chip pacjenta, chip konta + przycisk wyloguj/zaloguj.
   - **Sidebar** — logo + brand, sekcje grupujące (`Pacjent`, `Narzędzia`, `Konto i pomoc`).
   - **Drawer mobilny** — wysuwany po kliknięciu hamburgera.
5. Podświetla aktywną pozycję wg `window.location.pathname` (znane ograniczenie: instrukcje wideo `*-instrukcja.html` traktowane są jako pozycja "Edu").

## Integracja z istniejącymi modułami

### `VildaVault` (zalogowany użytkownik)
- `getCurrentUser()` — pobranie inicjałów + nazwy do chipu konta.
- `onUnlock(fn)` / `onLock(fn)` — automatyczne odświeżanie chipu.
- `lock('manual')` — wywoływane po kliknięciu przycisku „Wyloguj”.
- `vilda:guest-mode-changed` (event na `document`) — wsparcie trybu gościa.

### `VildaVault` (zapisany pacjent)
- `onPatientSaved(fn)` — odświeżenie chipu po `Zapisz dane`.

### Formularz pacjenta
Komponent obserwuje pola formularza z `index.html`/`docpro.html`:
- `#name`, `#fullName`, `#advName`, `#basicGrowthName` (różne aliasy imienia).
- `#age`, `#ageMonths`, `#sex`.

Pola są zapełniane przez moduł importu (`vilda_data_import_export.js`) — komponent zarówno nasłuchuje eventów `input`/`change`, jak i co 1.5 s sprawdza wartości (bo importer używa `setFieldValueSilently`, który nie emituje `input`).

### `custom-fixes.js` — `mini-summary`, `steroid-summary`
Stary kod nadal wstawia te karty do `<aside class="sidebar">`. Komponent `vilda_chrome.js` przy mountowaniu wykrywa ich obecność i przenosi je do nowego kontenera `.sidebar-extras`, więc działają bez zmian.

### Przyciski `Zapisz dane` / `Wczytaj dane`
ID `saveDataBtnSidebar`, `loadDataBtnSidebar`, `fileInputSidebar` są zachowane 1:1 — `custom-fixes.js` (linie ~709 i ~734) działa na nich bez modyfikacji. Bonus: są teraz dostępne na **każdej** podstronie, nie tylko na index/cukrzyca.

## Wymagania kompatybilności

Komponent jest dodatkowy — nie usunąłem starych elementów z 15 plików HTML. Dlatego:

- Istniejące skrypty wciąż znajdą `<aside class="sidebar">` i nadpisanie zawartości (sidebar.innerHTML) odbywa się dopiero po `DOMContentLoaded`, więc kod typu `aside.querySelector('#saveDataBtn...')` z odroczeniem działa.
- Skrypt z `defer` jest w `<head>` przed `</head>`, więc wykonuje się przed `custom-fixes.js?v=13` (które jest w `<body>`, też z `defer`).
- Stare `.container` i `.main-nav` w `<header>` są ukrywane przez CSS, ale pozostają w DOM (gdyby jakiś moduł czytał z nich wartości).

## Wycofywanie zmian

Aby cofnąć:

1. Usuń linie z `<link href="vilda_chrome.css?v=1">` i `<script src="vilda_chrome.js?v=1">` z 15 plików HTML.
2. W `service-worker-kalorii.js` usuń wpisy `vilda_chrome.{css,js}` z `CORE_SHELL_URLS`.
3. (Opcjonalnie) Usuń pliki `vilda_chrome.js`, `vilda_chrome.css`, `vilda_chrome_demo.html`.

Nie ma żadnych modyfikacji w starych plikach `sidebar.css`, `style.css`, `ios26-v2.css` — wszystko nadpisanie odbywa się przez nowy plik CSS.

## Najczęstsze pytania

**Czy menu hamburgera w nagłówku (mobile) działa nadal?**  
Tak. `vilda_chrome.js` renderuje własny hamburger po lewej stronie stripa nagłówka, a po kliknięciu otwiera drawer z lewej strony zawierający te same pozycje co sidebar (bez przycisków „Zapisz/Wczytaj dane” — ich akcje wymagają formularza pacjenta widocznego w danym momencie). Stary `<nav class="main-nav">` jest ukryty przez CSS, ale fizycznie zostaje w DOM.

**Co jeśli `VildaVault` jeszcze się nie załadował?**  
Komponent wywołuje `refreshUserChip()` kilka razy z opóźnieniami 200/1000/3000 ms i dodatkowo nasłuchuje na `onUnlock`/`onLock`. W praktyce chip konta dosypie się natychmiast po `tryRestoreSession()`.

**Jak dodać nową pozycję menu?**  
W jednym miejscu — `vilda_chrome.js`, tablica `MENU` (sekcja `// ============ KONFIGURACJA MENU ============`). Zmiana wystarczy w jednym pliku, wszystkie 15 podstron zaktualizuje się automatycznie po deployu i invalidacji service workera.

**Jak ustawić styl pasującego do mojej palety?**  
W `vilda_chrome.css` na początku znajdziesz blok `:root` z tokenami (`--chrome-strip-height`, `--chrome-sidebar-width`, `--chrome-radius-card`, `--chrome-active-bg` itd.). Wszystkie kolory korzystają z istniejących `--primary` i `--secondary` z `style.css`.

**Co jeśli na jakiejś stronie nie chcę pokazać sidebara?**  
Usuń klasę `has-sidebar` z `<body>` na tej stronie. Sidebar zostanie wyrenderowany w `<aside class="sidebar">`, ale CSS go zwinie (Layout pozostaje stały, ale element jest niewidoczny). Ewentualnie usuń `<aside class="sidebar">` z DOM przed mountem komponentu.

## Punkty rozszerzenia

Komponent eksponuje globalne API:

```js
window.VildaChrome.refreshUserChip();      // odśwież chip konta
window.VildaChrome.refreshPatientChip();   // odśwież chip pacjenta
window.VildaChrome.highlightActiveLink();  // odśwież podświetlenie menu
window.VildaChrome.MENU;                   // tablica konfigurująca pozycje
```

To wystarczy, żeby integracja z innymi modułami nie wymagała hackowania DOM-u.

## Testowanie

1. Uruchom lokalnie serwer (np. `python3 -m http.server 8080` w głównym folderze projektu).
2. Otwórz `vilda_chrome_demo.html` — panel po prawej u dołu pozwala przełączać stany.
3. Otwórz `index.html`, `docpro.html`, `kontakt.html`, … — sidebar i header powinny być identyczne, aktywna pozycja menu odpowiada otwartej podstronie.
4. Zmniejsz okno do < 992px szerokości — sidebar znika, w nagłówku pojawia się hamburger.

## Co dalej (sugestie na kolejne iteracje)

- **Patient picker w chipie pacjenta** — kliknięcie chipu otwiera dropdown z listą zapisanych pacjentów (dane z `VildaVault.listPatients()`).
- **Skrót klawiszowy `⌘/Ctrl + K`** — palette wyszukiwania pozycji menu.
- **Tryb ciemny** — istniejące tokeny CSS wystarczą, dodać tylko media query `prefers-color-scheme: dark`.
- **Onboarding** — gdy nowy użytkownik otwiera aplikację, chip konta podpowiada co kliknąć żeby się zalogować (mała strzałka + tooltip).
