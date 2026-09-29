# Zasady wprowadzania zmian

Ten dokument określa proces pracy właściciela, współpracowników i agentów nad Vilda. To aplikacja medyczna, dlatego proces jest bardziej rygorystyczny niż w typowej stronie internetowej.

Kod projektu jest udostępniany na licencji [Apache License 2.0](LICENSE); zakres licencji opisuje sekcja „Licencja” w [README.md](README.md). Do czasu ustalenia zasad prawnych dla wkładu zewnętrznego (DCO lub CLA) publiczne pull requesty od osób trzecich nie są przyjmowane do scalenia. Można zgłaszać błędy i propozycje przez formularze Issues, bez danych pacjenta. Nieoczekiwany PR może zostać zamknięty bez wykorzystania jego kodu.

## Zanim utworzysz zgłoszenie

- Nie publikuj danych pacjentów, eksportów `.wiw`, zrzutów prawdziwej sesji ani sekretów.
- Do odtworzenia problemu użyj jednoznacznie fikcyjnych danych.
- Podatność bezpieczeństwa zgłoś prywatnie według `SECURITY.md`.
- Błąd wzoru, progu, dawki, jednostki lub interpretacji zgłoś formularzem zmiany medycznej.

## Gałęzie i pull requesty

1. Zaktualizuj lokalny `audyt` i utwórz od niego gałąź.
2. Nazwij ją krótko, np. `agent/fix-homa-rounding` albo `agent/docs-clinical-registry`.
3. Ogranicz PR do jednego celu. Nie łącz refaktoryzacji, nowej funkcji i zmiany klinicznej bez wyraźnej potrzeby.
4. Kieruj PR do `audyt`, nigdy do historycznego `main`.
5. Domyślnie otwieraj PR jako draft. Scalenie i wdrożenie należą do właściciela.

Zalecane prefiksy tytułu lub commita:

- `fix:` — naprawa błędu;
- `feat:` — nowa funkcja;
- `refactor:` — zmiana struktury bez zmiany zachowania;
- `clinical:` — zamierzona zmiana wyniku lub interpretacji medycznej;
- `test:` — testy i infrastruktura jakości;
- `docs:` — dokumentacja;
- `chore:` — utrzymanie zależności i narzędzi;
- `security:` — poprawa bezpieczeństwa bez ujawniania podatności w tytule.

## Dane testowe

Dozwolone są wyłącznie dane syntetyczne, które nie pochodzą od rzeczywistego pacjenta. Używaj nazw typu „Anna Testowa”, dat i wyników utworzonych na potrzeby testu oraz minimalnego zakresu pól.

Nie wystarczy zasłonięcie imienia na zrzucie. Metadane, adres strony, storage, logi, nazwa pliku i pozostałe pola również mogą identyfikować osobę. Zasady szczegółowe: `docs/DATA_PROTECTION.md`.

## Zmiana kliniczna

Za kliniczną uznaje się zmianę wzoru, stałej, danych referencyjnych, dawki, progu, jednostki, zaokrąglenia, populacji, zakresu wieku lub płci, ostrzeżenia albo interpretacji.

PR kliniczny musi zawierać:

- opis zachowania przed i po zmianie;
- populację i zakres zastosowania;
- pełne źródło: autor/instytucja, tytuł, rok, wersja wytycznych oraz DOI/PMID/URL, jeśli istnieje;
- informację o pochodzeniu i prawie użycia tabel lub danych;
- jednostki, precyzję i regułę zaokrąglania;
- co najmniej jeden przypadek typowy i graniczny w formie `wejście → oczekiwany wynik`;
- test rzeczywistej funkcji produkcyjnej;
- aktualizację `docs/clinical/ALGORITHMS.md`;
- akceptację kliniczną właściciela.

Nie kopiuj wzoru do testu jako drugiej implementacji. Oczekiwany wynik powinien być niezależnie wyliczoną, zatwierdzoną stałą regresyjną.

## Refaktoryzacja

Refaktoryzacja nie może zmieniać:

- wartości ani prezentacji wyniku mającej znaczenie kliniczne;
- formatu zapisu i eksportu;
- autosave, synchronizacji lub przywracania danych;
- publicznych interfejsów `window.Vilda…`;
- kolejności wymaganych efektów ubocznych skryptów.

W szczególności rozdzielone warstwy modelu wejściowego, obliczeń, UI, runtime i montowania DOM dla „Szacowanego spożycia energii” powinny pozostać rozdzielone.

## PWA i pliki wdrożeniowe

Po zmianie zasobu ładowanego przez stronę:

- sprawdź wszystkie odwołania `?v=` — także adresy wstrzykiwane ze skryptów (`vilda_chrome.js`, `vilda_session_bridge.js`, `vilda_gh_therapy_resource_audit.js`): podbij je razem ze stronami; pilnuje tego `tests/unit/piny-wersji.test.mjs` (P-PINY-WERSJI, ósme twierdzenie);
- przeanalizuj wpływ na `SW_VERSION` i listę cache;
- nie usuwaj historycznych, wersjonowanych adresów z cache bez planu migracji; od P-SW-PRECACHE instalacja i tak pobiera tylko bieżący wpis każdego pliku (najwyższy `?v=`), więc nowy `?v=` dopisujesz obok starego, a strona musi odwoływać się do najwyższego — odwołanie do starszej wersji nie trafi do pamięci offline (pilnuje tego `tests/unit/sw-precache-stron.test.mjs`, razem z budżetem instalacji: poniżej 40 MB i 600 żądań, bo Chromium przerywa instalację trwającą ponad 5 minut); zmianę sposobu instalacji mierz `node tests/scripts/pomiar-instalacji-sw.mjs` (limit pamięci, wolne łącze, migracja ze starszego SW);
- zasób ładowany przez stronę z precache (albo doładowywany z pliku JS) dopisz do tablic SW pod dokładnie tym adresem (z tym samym `?v=`), którego używa strona — pilnuje tego `tests/unit/sw-precache-stron.test.mjs` (P-SW-DOCPRO);
- uruchom test instalacji, aktualizacji i pracy offline; brak sieci w teście przeglądarkowym rób zatrzymaniem serwera (wzór: `tests/e2e/pwa-strony-offline.spec.mjs`), bo `context.setOffline(true)` nie odcinał niezawodnie sieci service workera (zmierzone w P-SW-DOCPRO na Chromium 141 z Playwright 1.61.1);
- sprawdź widok mobilny bez poziomego przewijania.

Jeżeli dostępny jest czytelny plik źródłowy i generowany artefakt, zmieniaj źródło i odtwórz artefakt kontrolowanym procesem. Nie poprawiaj tylko zminifikowanej kopii.

### Arkusze CSS (P-STYLE rata 1, decyzja właściciela 2026-09-28)

Arkusze w korzeniu repozytorium są **sformatowane** i tak mają zostać: nie commituj postaci zminifikowanej. `npm run css:formatuj` formatuje arkusze, które wyglądają na zminifikowane (czytelne zostawia), zmieniając wyłącznie białe znaki poza łańcuchami i komentarzami; `npm run css:cssom -- --baza origin/audyt` dowodzi w Chromium, że lista reguł nie zmieniła się względem bazy. Strażnik `tests/unit/css-sformatowany.test.mjs` odrzuca linie dłuższe niż 1000 znaków. Test jednostkowy, który cytuje regułę CSS, czyta arkusz przez `zwartyCss()` z `tests/support/css-zwarty.mjs`, a nie dosłownie — cytat nie zależy wtedy od układu białych znaków.

**Tokeny zamiast literałów (P-STYLE raty 2a i 2b).** Kolor, cień, `z-index` i `opacity` (rata 2a) oraz odstępy, promienie, grubości obramowań, rozmycie tła i wymiary układu (rata 2b), które mają token w design systemie (`design-system/src/project/tokens.json`), zapisuje się w arkuszach jako `var(--token)`; zmienne są w bloku `:root` na początku `style.css`. Rodziny wymiarowe mają zasięg własności: `padding: var(--space-1)`, `border-radius: var(--radius-12)`, `border: var(--border-hairline) solid var(--line)`, `backdrop-filter: var(--blur-card) var(--blur-card-saturate)`, `max-width: var(--container-max-width)` — ta sama liczba w `font-size`, `top` czy `transform` zostaje literałem, a zero nigdy nie jest tokenem. Punkty przełamania `@media` nie mogą być zmiennymi i zostają literałami. Strażnik `tests/unit/css-tokeny.test.mjs` odrzuca literał równy tokenowi objętej rodziny; `npm run css:tokenizuj -- --sprawdz` pokazuje, co by zamienił, `-- --raport` dodaje selektory reguł, `npm run css:tokenizuj` zamienia i dopisuje brakujące zmienne, `-- --kandydaci` wypisuje literały bez tokenu per rodzina (do nazwania). Refaktoryzację stylów dowodzi się porównaniem stylów obliczonych: `npm run css:dowod -- --baza origin/audyt` otwiera każdą stronę w obu rewizjach (tryb gościa, cztery tryby wyglądu, desktop i telefon) i porównuje style obliczone wszystkich elementów; różnica stylu oznacza zmianę wyglądu. Zmiana dotykająca warstwy trybów wymaga `-- --tryby wszystkie` (dziesięć trybów: szkło 0–4, kontrast 1–3, ciemne tło 1–2).

**Warstwa trybów wyglądu (P-STYLE rata 3).** Reguła wysokiego kontrastu wspólna dla trzech poziomów ma JEDEN selektor z `:is(.high-contrast-level-1, .high-contrast-level-2, .high-contrast-level-3)` (np. `body:is(…).liquid-ios26 .card`), a nie trzy części po jednej na poziom; wartości różniące się między poziomami idą przez zmienne `--hc-*`, ustawiane w osobnych blokach `body.high-contrast-level-N.liquid-ios26 { … }`. Strażnik `tests/unit/css-tryby.test.mjs` odrzuca powrót tripletów; `node tests/scripts/zwin-tryby-css.mjs` zwija je (także w partialach design systemu), `-- --sprawdz` tylko raportuje.

**Skórka szkła jako baza (P-STYLE raty 4a i 4b).** Skórka `.liquid-ios26` jest zawsze włączona. Deklaracja zasłonięta nadpisaniem `.liquid-ios26 …` tej samej własności (albo skrótu obejmującego jej longhandy) — o selektorze pokrywającym bazowy (każdy element bazy pasuje do nadpisania; typ elementu może wynikać z wiedzy o DOM), w tym samym kontekście `@media` albo bez kontekstu, z `!important` albo nieważnym o wyższej swoistości, z tego samego arkusza albo z arkusza globalnego ładowanego na każdej stronie — jest martwa i nie ma jej w arkuszach; martwa część listy selektorów znika z listy. Strażnik `tests/unit/css-szklo.test.mjs` odrzuca takie martwe deklaracje; `node tests/scripts/usun-martwe-css.mjs -- --sprawdz` je wylicza (`-- --raport` z selektorami), bez flagi usuwa. Nadpisanie skórki `.liquid-ios26 S { p: v !important }`, którego złożenie do `S { p: v }` nie zmienia żadnego zwycięzcy kaskady (analiza `tests/support/skorka-css.mjs`: konkurenci o wspólnym longhandzie na każdej stronie z arkuszem, rozłączność selektorów z wiedzą o DOM z `tests/support/wiedza-dom.mjs` i faktami z `tests/fixtures/skorka-fakty.json`, per część selektora), jest złożone. **Nowy styl komponentu piszemy jako regułę bazową, bez `.liquid-ios26` i bez `!important`**; nadpisanie skórki zostaje tylko tam, gdzie jest spisane z powodem w `tests/fixtures/skorka-nadpisania.json` (kaskada, grupa, behawioralna, js, inline, dynamiczna). Strażnik `tests/unit/css-skorka.test.mjs` odrzuca nadpisanie spoza fixture i nadpisanie, które da się złożyć. Rozłączność selektorów opiera się na wiedzy o DOM: nazwa klasy lub id nieobecna nigdzie w HTML (poza `<style>`) ani w JS oznacza regułę martwą, a nazwa obecna w kodzie, lecz nierozpoznana przez skaner (stała w JS, szablon z wyrażeniem), albo sklejalna z tokenu z łącznikiem (`'glass-level-' + n`), może być na dowolnym elemencie (rata 4b bis); lista nazw nieobecnych jest w `tests/fixtures/skorka-nieobecne.json` i ten sam strażnik pilnuje, by była aktualna — nazwa, która pojawia się w kodzie, ożywia reguły złożone bez `!important`, więc sprawdź ich kaskadę i odśwież listę (`--zapisz`). Skrót `all` nakłada się na każdą własność poza własnymi i nigdy nie jest składany. **Reguła z nazwą klasy lub id nieobecną w kodzie jest nieosiągalna i nie ma jej w arkuszach ani w blokach `<style>`** (P-STYLE krok 7): strażnik `tests/unit/css-nieosiagalne.test.mjs` odrzuca taką regułę, więc nowy styl wchodzi razem z elementem, który go używa; `node tests/scripts/usun-nieosiagalne-css.mjs -- --sprawdz` wylicza reguły nieosiągalne, bez flagi usuwa (potem `node tests/scripts/usun-martwe-css.mjs --partiale`, `npm run design-system -- --update`, `node tests/scripts/zloz-skorke-css.mjs --zapisz`). Kolejność przy kolejnym składaniu: `node tests/scripts/usun-martwe-css.mjs` → `node tests/scripts/zloz-skorke-css.mjs --dom` (Chromium: arkusze wstrzykiwane z JS, style inline na dopasowanych elementach, spójność wiedzy o DOM) → `-- --sprawdz` lub `-- --raport` → bez flagi (arkusze) → `-- --partiale` → `npm run design-system -- --update` → `-- --zapisz`; `-- --js` wypisuje miejsca w JS ustawiające składane własności inline do ręcznego przeglądu (dziś `!important` skórki przykrywa taki styl, po złożeniu wygrałby). Dowód: `npm run css:dowod -- --baza origin/audyt --tryby wszystkie`.

**Style stron w arkuszach, nie w blokach `<style>` (P-STYLE krok 5a).** Strona nie ma bloków `<style>`: jej style są w arkuszu `inline_<strona>_<NN>.css` (wspólny blok powłoki osadzonej: `vilda_embedded.css`), linkowanym w tym miejscu dokumentu, w którym stał blok — dzięki temu kaskada (także względem arkuszy wstrzykiwanych z JS na końcu `<head>`) się nie zmienia, a arkusz podlega tym samym strażnikom co reszta (formatowanie, tokeny, tryby, skórka, reguły nieosiągalne). Strażnik `tests/unit/css-inline.test.mjs` odrzuca blok `<style>`; nowy styl strony dopisuje się do jej arkusza (i podbija jego `?v=`), a gdyby blok jednak powstał, `node tests/scripts/wyciagnij-style-inline.mjs -- --raport` pokazuje plan, bez flagi wyciąga (nowy arkusz dostaje `?v=1`; potem precache i `SW_VERSION`). Kolejne bloki trafiają do jednego arkusza tylko wtedy, gdy między nimi nie stoi link do arkusza, synchroniczny skrypt ani granica `<body>`.

**Style na elementach nie przybywają (P-STYLE krok 5b).** Nowy styl nie trafia do atrybutu `style=` w HTML ani do zapisu stylu elementu w JS (`el.style.x = …`, `style.cssText`, `style.setProperty`, `setAttribute('style', …)`, `style="…"` w łańcuchu), tylko do klasy w arkuszu strony albo komponentu; JS przełącza klasę (`classList`). Strażnik `tests/unit/css-style-elementow.test.mjs` porównuje liczby per plik z `tests/fixtures/style-elementow.json` i odrzuca przyrost; stan dynamiczny, którego nie da się opisać klasą (np. pozycja liczona w JS), to świadomy wyjątek — po nim `node tests/scripts/style-elementow.mjs --zapisz`. Po przeniesieniu stylu do klasy liczba spada i fixture odświeża to samo polecenie; `-- --raport` pokazuje liczby per plik i najczęstsze wartości. Uwaga przy przenoszeniu: kod, który czyta styl inline (`el.style.display === 'none'`) albo nadpisuje cały styl (`cssText`, `setAttribute`/`removeAttribute('style')`), zachowa się inaczej, gdy deklaracja przejdzie do klasy.

**Progi `@media` (P-STYLE krok 6).** Nowa reguła w `@media` używa progu szerokości już obecnego w `tests/fixtures/breakpointy.json` (38 progów; najczęstsze `700px` i `992px`); nowy próg zmienia układ przy części szerokości okna, więc jest decyzją właściciela — po niej `node tests/scripts/breakpointy-css.mjs --zapisz` odświeża listę, a strażnik `tests/unit/css-breakpointy.test.mjs` pilnuje zgodności. Tabela progów z liczbą reguł i źródłami: `node tests/scripts/breakpointy-css.mjs --raport`. Kolejność przy kolejnym składaniu: `node tests/scripts/usun-martwe-css.mjs` → `node tests/scripts/zloz-skorke-css.mjs --dom` (Chromium: arkusze wstrzykiwane z JS, style inline na dopasowanych elementach, spójność wiedzy o DOM) → `-- --sprawdz` lub `-- --raport` → bez flagi (arkusze) → `-- --partiale` → `npm run design-system -- --update` → `-- --zapisz`; `-- --js` wypisuje miejsca w JS ustawiające składane własności inline do ręcznego przeglądu (dziś `!important` skórki przykrywa taki styl, po złożeniu wygrałby). Dowód: `npm run css:dowod -- --baza origin/audyt --tryby wszystkie`.

Po zamierzonej zmianie wyglądu uruchom `npm run test:visual` (siatka zrzutów: `tests/visual`, osiem stron, desktop i telefon, cztery tryby z sekcji „Wygląd aplikacji”). Wzorce zrzutów powstają **wyłącznie w CI**, na dwa sposoby: Actions → „Wygląd” → „Run workflow” na gałęzi PR-a z zaznaczonym „aktualizuj_wzorce”, albo usunięcie katalogu `tests/visual/wzorce` w PR-ze (job widzi brak wzorców i tworzy je od nowa). W obu wypadkach job wypycha wzorce na gałąź jednym commitem i sam uruchamia kontrole dla tego commita; różnice obrazów ogląda się w PR-ze. Lokalny przebieg na macOS nie zgodzi się z wzorcem z Linuksa (inne czcionki i wygładzanie), więc służy tylko do sprawdzenia, że strony się renderują.

## Testy

Minimalny zestaw przed PR:

```bash
npm ci
npm test
npx playwright install chromium
npm run test:e2e
```

Szczegóły znajdują się w `TESTING.md`. W opisie PR podaj rzeczywisty wynik oraz przyczynę pominięcia testu, jeżeli nie dotyczy danej zmiany.

Nie akceptujemy:

- zmniejszenia oczekiwanej liczby asercji bez uzasadnionej zmiany zakresu;
- skopiowania błędnego zachowania do testu;
- rozszerzenia baseline ESLint zamiast naprawy nowego błędu;
- wyłączenia testu albo alarmu bezpieczeństwa tylko po to, by uzyskać zielone CI.

## Aktualizacje zależności

PR-y Dependabota nie są scalane automatycznie. Nawet aktualizacja narzędzia deweloperskiego musi przejść pełne CI. Aktualizacje major wymagają osobnego przeglądu zmian niezgodnych wstecz.

## Gotowość do scalenia

PR jest gotowy, gdy:

- zakres i wpływ kliniczny są jednoznacznie opisane;
- nie zawiera danych pacjenta ani sekretów;
- dokumentacja i testy odpowiadają zmianie;
- wymagane kontrole GitHub Actions są zielone;
- właściciel zatwierdził część kliniczną oraz decyzję o scaleniu.
