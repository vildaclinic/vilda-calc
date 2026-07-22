# Testowanie vilda-calc

Projekt produkcyjny pozostaje statyczną aplikacją HTML/CSS/JavaScript bez etapu budowania. `package.json` służy wyłącznie narzędziom deweloperskim i CI.

## Pierwsze uruchomienie

Wymagany jest Node.js 20.19 lub nowszy.

```bash
npm ci
npx playwright install chromium
```

## Dostępne kontrole

```bash
npm run lint         # reguły ESLint nastawione na błędy wykonania
npm run test:syntax  # node --check dla wszystkich plików .js i .mjs
npm run test:unit    # Vitest: dane referencyjne, konwersje i czyste modele
npm run test:pro     # trzy historyczne zestawy regresji dostępu PRO
npm run test:e2e     # Playwright: strony, HOMA-IR, smoke suite, mobile i PWA
npm test             # wszystkie kontrole niewymagające przeglądarki
npm run test:ci      # pełny zestaw lokalny odpowiadający GitHub Actions
```

Testy przeglądarkowe same uruchamiają lokalny serwer na `127.0.0.1:4173`.

Scenariusz offline wykonuje rzeczywisty kod produkcyjnego service workera, ale serwer testowy skraca jego listę precache do trzech podstawowych zasobów. Dzięki temu CI sprawdza przepływ `install`/`activate`/`fetch` i przeładowanie offline bez sekwencyjnego zapisywania ponad tysiąca historycznie wersjonowanych wpisów. Testy układu mobilnego blokują service workery, ponieważ cache nie jest częścią sprawdzanego tam zachowania.

ESLint kontroluje cały kod JavaScript. Zastane naruszenia starego, w dużej części zminifikowanego kodu są zapisane liczbowo w `eslint-suppressions.json`. Baseline nie ukrywa nowych kategorii błędów ani wzrostu liczby naruszeń w danym pliku. Po świadomym usunięciu starego naruszenia można odświeżyć baseline poleceniem:

```bash
npx eslint . --suppressions-location eslint-suppressions.json --prune-suppressions
```

## Zakres CI

Workflow `.github/workflows/ci.yml` uruchamia się dla pull requestów kierowanych do `audyt`, commitów wysyłanych bezpośrednio na `audyt` oraz ręcznie. Najpierw wykonuje lint, kontrolę składni, Vitest i testy PRO. Po ich powodzeniu instaluje Chromium i uruchamia testy Playwright.

## Zasada dla obliczeń medycznych

Test powinien wywoływać rzeczywistą funkcję lub publiczne API aplikacji. Nie należy kopiować wzoru do testu jako drugiej implementacji. Stałe oczekiwane wyniki muszą odpowiadać zatwierdzonym przypadkom regresyjnym, a każda zamierzona zmiana wyniku medycznego wymaga świadomej aktualizacji testu.
