# Vilda — wagaiwzrost.pl

Vilda to rozwijana przez Vilda Clinic statyczna aplikacja PWA wspierająca pracę w pediatrii i endokrynologii dziecięcej. Obejmuje m.in. ocenę wzrastania i stanu odżywienia, kalkulatory laboratoryjne, moduły żywieniowe oraz wybrane narzędzia monitorowania terapii.

Wersja użytkowa: [wagaiwzrost.pl](https://wagaiwzrost.pl/)

> Aplikacja ma charakter pomocniczy i edukacyjny. Wynik programu nie zastępuje badania pacjenta, oceny klinicznej ani aktualnych wytycznych. Zielone testy potwierdzają zachowanie wybranych kontraktów programu, a nie automatyczną poprawność medyczną wszystkich wyników.

## Stan repozytorium

To publiczne repozytorium zawiera aktualne pliki statycznej aplikacji wdrożeniowej oraz narzędzia jakości. Część plików JavaScript jest artefaktem zminifikowanym. Pełne, czytelne materiały robocze i dokumentacja wewnętrzna nie są obecnie publikowane w tym repozytorium.

Aktywną bazą rozwoju jest gałąź `audyt`. Historyczna gałąź `main` nie powinna być używana jako podstawa nowych zmian. Do czasu zakończenia migracji ustawień GitHuba może ona nadal być wyświetlana jako gałąź domyślna.

Projekt nie ma obecnie licencji open source. Publiczna widoczność kodu nie oznacza zgody na jego dalsze rozpowszechnianie lub wykorzystanie poza zakresem wynikającym z prawa.

## Architektura w skrócie

- HTML, CSS i JavaScript bez frameworka oraz bez produkcyjnego etapu budowania w tym repozytorium;
- `app.html` jako powłoka SPA-lite osadzająca funkcjonalne strony tego samego originu;
- moduły domenowe udostępniają kontrolowane interfejsy, zwykle pod `window.Vilda…`;
- warstwa zapisu, szyfrowania i synchronizacji jest oddzielona od obliczeń domenowych;
- `service-worker-kalorii.js` zapewnia instalację PWA, kontrolę wersji cache i działanie offline;
- Node.js i npm służą wyłącznie do lintowania, testów i kontroli CI.

Szczegóły: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Główne obszary

| Obszar | Przykładowe punkty wejścia lub moduły |
|---|---|
| Wzrastanie i antropometria | `index.html`, dane OLAF/WHO, LMS, tempo wzrastania i prognozy wzrostu |
| Kalkulatory | `homa-ir.html`, `kalkulator-klirens.html`, `przelicznik-jednostek.html`, `steroidy.html` |
| Moduły profesjonalne | `docpro.html` oraz moduły monitorowania i dawkowania terapii |
| Organizacja pracy | `terminarz.html`, notatki, karta pacjenta i raporty |
| PWA i wspólna powłoka | `app.html`, `vilda_shell.js`, `vilda_chrome.js`, `service-worker-kalorii.js` |

Wstępny rejestr logiki klinicznej znajduje się w [docs/clinical/ALGORITHMS.md](docs/clinical/ALGORITHMS.md). Status „zinwentaryzowane” nie oznacza walidacji klinicznej.

## Uruchomienie kontroli jakości

Wymagany jest Node.js 20.19 lub nowszy.

```bash
npm ci
npx playwright install chromium
npm test
npm run test:e2e
```

Pełny opis testów i ich ograniczeń: [TESTING.md](TESTING.md).

## Zasady zmian

1. Utwórz gałąź od aktualnego `audyt`.
2. Wprowadź jedną spójną zmianę i opisz jej wpływ kliniczny.
3. Używaj wyłącznie danych syntetycznych.
4. Uruchom kontrole lokalne i otwórz pull request do `audyt`.
5. Nie wdrażaj ani nie scalaj zmian bez akceptacji właściciela.

Każda zmiana wzoru, progu, dawki, jednostki, zakresu wieku lub płci, interpretacji albo danych referencyjnych wymaga źródła, przypadku regresyjnego i świadomej akceptacji klinicznej. Szczegóły opisuje [CONTRIBUTING.md](CONTRIBUTING.md).

## Dane i bezpieczeństwo

Nigdy nie umieszczaj w repozytorium, Issue, pull requeście ani artefakcie CI:

- prawdziwych danych lub zrzutów ekranu pacjenta;
- eksportów `.wiw`, kopii JSON, lokalnych baz i archiwów;
- plików `.env`, `.dev.vars`, tokenów, haseł i kluczy prywatnych;
- katalogów `node_modules`, `.wrangler` ani cache narzędzi.

Zasady pracy z danymi: [docs/DATA_PROTECTION.md](docs/DATA_PROTECTION.md). Podatności zgłaszaj zgodnie z [SECURITY.md](SECURITY.md), a nie w publicznym Issue.

## Dokumentacja projektu

- [Proces pracy na GitHubie](docs/GITHUB_WORKFLOW.md)
- [Architektura](docs/ARCHITECTURE.md)
- [Zarządzanie zmianami klinicznymi](docs/clinical/README.md)
- [Rejestr algorytmów i danych referencyjnych](docs/clinical/ALGORITHMS.md)
- [Testowanie](TESTING.md)
- [Zasady współtworzenia](CONTRIBUTING.md)
- [Polityka bezpieczeństwa](SECURITY.md)
