# Jak prowadzimy projekt na GitHubie

Ten dokument opisuje prosty, powtarzalny proces dla właściciela projektu. Kod aplikacji nie zmienia się przez samo utworzenie Issue lub pull requestu.

## Jednorazowe ustawienie repozytorium

Aktywny projekt znajduje się na `audyt`, ale GitHub nadal wskazuje historyczne `main` jako gałąź domyślną. Po zachowaniu `main` jako jednoznacznej gałęzi lub referencji archiwalnej należy ustawić `audyt` jako default branch.

Ta zmiana jest konieczna, aby:

- `README.md` i `SECURITY.md` były widoczne jako główne dokumenty;
- formularze Issues i szablon PR pojawiały się automatycznie;
- Dependabot działał na aktualnym kodzie;
- tygodniowy harmonogram CodeQL uruchamiał się z właściwej gałęzi.

Po zmianie default branch trzeba potwierdzić ochronę `audyt`. Realizuje ją **zestaw reguł** (ruleset) w Settings → Rules → Rulesets, a nie klasyczna ochrona gałęzi w Settings → Branches — to dwa różne mechanizmy i mylenie ich kosztowało cykl przy operacji z 2026-09-10:

- cel: gałąź `audyt` (Target branches → Include by pattern);
- `Require a pull request before merging`, wymagane akceptacje: 0 (właściciel pracuje sam);
- `Require status checks to pass`, dokładnie dwie kontrole:
  - `Lint, składnia i testy jednostkowe`;
  - `Testy przeglądarkowe i PWA`;
- `Block force pushes` i `Restrict deletions`;
- pusta lista obejść (Bypass list) albo świadome ograniczenie administratora;
- Enforcement status: `Active`.

Nazwy wymaganych kontroli muszą **dokładnie** odpowiadać nazwom jobów w `ci.yml`. Literówka nie daje żadnego komunikatu — po prostu żaden pull request nigdy nie stanie się scalalny.

**Jak zdjąć ochronę na czas operacji wymagającej force push.** Na stronie samego zestawu reguł przestaw `Enforcement status` na `Disabled`, wykonaj operację, wróć do `Active`. Adres, który GitHub podaje w komunikacie błędu (`/rules?ref=…`), prowadzi do listy **tylko do odczytu** — nie ma tam żadnego przełącznika, więc łatwo stamtąd omyłkowo skasować cały zestaw zamiast go wyłączyć.

CodeQL należy najpierw uruchomić i przejrzeć jako baseline. Nie ustawiaj go od razu jako wymaganego testu, dopóki zastane alerty nie zostaną sklasyfikowane.

## Zwykła zmiana

```mermaid
flowchart LR
    A["Issue lub ustalony zakres"] --> B["Gałąź agent/…"]
    B --> C["Draft PR do audyt"]
    C --> D["CI i przegląd"]
    D --> E["Squash and merge"]
```

1. Opisz problem lub zakres.
2. Zmiana powstaje na osobnej gałęzi `agent/...`.
3. Otwierany jest draft PR do `audyt`.
4. GitHub uruchamia testy; czerwony wynik wymaga diagnozy.
5. Przy zmianie klinicznej właściciel sprawdza źródło i przypadki regresyjne.
6. Po akceptacji PR przechodzi przez `Squash and merge`.
7. Sprawdź wynik GitHub Pages. W obecnej konfiguracji commit na `audyt` może uruchomić deployment, dlatego scalenie należy traktować jako potencjalną publikację. Docelowo produkcja powinna wymagać osobnego, ręcznego zatwierdzenia.

## Jak czytać wynik PR

| Stan | Znaczenie | Działanie |
|---|---|---|
| Żółty / oczekuje | Test nadal trwa | Poczekaj na zakończenie |
| Zielony | Sprawdzone kontrakty przeszły | Przejrzyj zakres i wpływ kliniczny |
| Czerwony | Test albo skan wykrył problem | Nie scalaj; przeanalizuj log i przyczynę |
| Pominięty | Warunek workflow nie został spełniony | Sprawdź, czy test rzeczywiście nie dotyczy |

Zielone CI nie zatwierdza medycznie wzoru. Potwierdza jedynie to, co test został zaprojektowany sprawdzić.

## Kilka wątków naraz

Kilka wątków (sesji agentów) może pracować równolegle. Ich PR-y wchodzą jednak do `audyt` **po kolei**, bo prawie każdy zmienia te same linie:

- `SW_VERSION` w `service-worker-kalorii.js`;
- `?v=` zmienionych plików na stronach, w skryptach wstrzykujących (`vilda_chrome.js`, `vilda_session_bridge.js`…) i w `EXPECTED_BROWSER_SCRIPTS` (`vilda_smoke_tests.js`);
- wpisy precache w tablicach service workera;
- pin SW w `tests/unit/klirens-ui-model.test.mjs`;
- `tests/fixtures/wersje-zasobow.json`.

Dwa wątki biorą ten sam „następny numer”. Po scaleniu pierwszego PR drugi jest nieaktualny, nawet jeżeli GitHub nie pokazuje konfliktu.

### Zasady dla właściciela

1. **Jeden obszar — jeden wątek.** Równolegle idą prace w różnych modułach. Dwie raty tego samego tematu (np. P-DIETA w `vilda_diet_recommendations.js`) prowadź po kolei.
2. **Scalaj jeden PR naraz.** Po każdym scaleniu pozostałe otwarte PR-y trzeba zaktualizować — także te bez konfliktu.
3. **Wersje na końcu.** Wątek nadaje numery skryptem `npm run podbij-wersje` jako ostatni krok, po scaleniu najnowszego `audyt`.

Wątek, który obserwuje swój PR, dostaje powiadomienie o konflikcie i aktualizuje się sam. W pozostałych przypadkach wklej mu:

> `audyt` się zmienił. Scal `origin/audyt` do swojej gałęzi (`git merge`, bez rebase), rozwiąż konflikty według `docs/GITHUB_WORKFLOW.md` → „Kilka wątków naraz”, uruchom `npm run podbij-wersje` i `npm test`, wypchnij.

### Procedura wątku po zmianie `audyt`

```bash
git fetch origin audyt
git merge origin/audyt          # na cudzej gałęzi: bez rebase i force-push
# konflikty — tabela niżej
npm run podbij-wersje           # przelicza wersje względem origin/audyt i zapisuje
npm test
git push
```

| Konflikt w | Jak rozwiązać |
|---|---|
| `service-worker-kalorii.js`, linia `SW_VERSION` | dowolna strona |
| `service-worker-kalorii.js`, tablice precache | strona `audyt` (wpisy bazy są nietykalne); brakujące wpisy wątku dopisze skrypt |
| strony HTML i skrypty, tokeny `?v=` | dowolna strona w liniach samych wersji; inne zmiany w tym samym fragmencie zachowaj z obu stron |
| `vilda_smoke_tests.js`, `EXPECTED_BROWSER_SCRIPTS` | dowolna strona |
| `tests/unit/klirens-ui-model.test.mjs`, pin `SW_VERSION` | dowolna strona |
| `tests/fixtures/wersje-zasobow.json` | dowolna strona — skrypt przepisze cały plik |
| `docs/clinical/ALGORITHMS.md` | zachowaj oba wpisy |

Numery z konfliktu nie mają znaczenia, bo skrypt liczy je od nowa. **Nie** rozwiązuj konfliktu w stanie wersji samym `node tests/scripts/wersje-zasobow.mjs --zapisz`. Utrwala on kolizję opisaną niżej.

### Dlaczego także bez konfliktu

Symulacja na kodzie z 2026-09-30 (`audyt` `567597c`, otwarte #503 i #504):

- **#503 i #504 scalają się bez żadnego konfliktu**, a mimo to wynik jest zły. #504 podbija SW do 1.1.130, a #503 zmienia cztery pliki, ale SW nie podbija. Po obu scaleniach zmiany #503 wyszłyby pod wersją 1.1.130 z #504. `npm run podbij-wersje` na stanie po scaleniu daje 1.1.131.
- **Dwa wątki zmieniają ten sam plik** (`vilda_diet_recommendations.js`, oba podbijają do `?v=67`). Strony, precache i `SW_VERSION` scalają się bez konfliktu, bo obie strony wpisały to samo. Konflikt jest tylko w `wersje-zasobow.json`. Połączona treść obu zmian zostałaby pod `?v=67`, który klient z zainstalowaną aplikacją ma już w pamięci z treścią pierwszego wątku. Service worker nie odświeża wpisów z `?v=` (P-SW rata 1), więc druga zmiana nigdy by do niego nie dotarła. Skrypt nadaje `?v=68` i SW 1.1.132, a strażnicy wersji przechodzą.

### Co robi `npm run podbij-wersje`

Liczy wersje wyłącznie z bazy (`origin/audyt`) i z treści plików w drzewie roboczym:

- plik o treści innej niż w bazie dostaje `?v=` o jeden większe niż w bazie, plik niezmieniony — wersję z bazy;
- wersję przepisuje na wszystkich stronach, w skryptach i w liście smoke; skrypt, którego treść zmieniła się przez przepisanie tokenu, też dostaje nowe `?v=`;
- dopisuje wpis precache zaraz po poprzedniej wersji pliku; zbędne wpisy dodane na tej gałęzi usuwa, wpisów z bazy nie rusza;
- `SW_VERSION` ustawia na wersję z bazy + 1, gdy zmienił się którykolwiek zasób z pamięci service workera (strona, plik z tablic albo sam SW), inaczej zostawia wersję z bazy;
- aktualizuje pin SW w testach i przepisuje `tests/fixtures/wersje-zasobow.json`.

Wynik nie zależy od numerów wpisanych wcześniej, a drugie uruchomienie niczego nie zmienia. Skrypt odmawia zapisu, gdy gałąź nie zawiera bazy, gdy lokalne `origin/audyt` jest starsze niż na serwerze (`git ls-remote`), gdy zostały znaczniki konfliktu albo zniknął wpis precache obecny w bazie.

Poza zakresem skryptu (wypisuje je jako „Do decyzji”):

- nowy plik — trzeba go dopisać do `CORE_SHELL_URLS` albo `OPTIONAL_ASSETS`;
- wersje nieliczbowe (`edu-video-ui.css?v=20261003v4`);
- piny wersji plików w testach — wypisuje je z numerem linii.

Opcje: `-- --sprawdz` (tylko raport, kod 1, gdy coś trzeba zmienić), `-- --baza=<ref>`, `-- --bez-sieci`. Na końcu raportu jest gotowa linia „Wersje: …; SW x → y” do opisu PR. Logika: `tests/support/podbij-wersje.mjs`; test: `tests/unit/podbij-wersje.test.mjs`.

### Otwarte decyzje właściciela

- **`npm run podbij-wersje -- --sprawdz` w CI.** Wykryłby cichą kolizję na etapie PR, zanim zmiana trafi na `audyt`. Wymaga checkoutu z historią `audyt` (dziś CI pobiera jedną rewizję) i dopisania kontroli do wymaganych statusów.
- **SW podbijany przy wydaniu, a nie w każdym PR.** Usunąłby ostatnią linię wspólną dla wszystkich PR-ów. Dziś jednak każdy commit na `audyt` może trafić na GitHub Pages, więc to zmiana modelu wdrożenia.
- **Merge queue na GitHubie.** Sama nie rozwiązuje konfliktów w tych samych liniach — PR z konfliktem wypada z kolejki. Dopiero razem z kontrolą w CI dawałaby automatyczne „po kolei”.

## Dependabot

Dependabot raz w tygodniu sprawdzi npm i używane GitHub Actions. Aktualizacje minor/patch zostaną zgrupowane, a major pozostaną osobnymi PR-ami.

Każdy PR Dependabota:

1. pozostaje bez automatycznego scalania;
2. przechodzi pełne CI;
3. przy wersji major wymaga przeczytania informacji o niezgodnościach;
4. może zostać zamknięty lub odłożony, jeżeli zmiana jest ryzykowna.

W ustawieniach GitHuba należy osobno włączyć Dependency graph, Dependabot alerts i Dependabot security updates.

## CodeQL

CodeQL analizuje JavaScript przy PR-ach i commitach do `audyt` oraz tygodniowo po ustawieniu `audyt` jako gałęzi domyślnej. Pierwszy skan tworzy punkt odniesienia. Alerty trzeba sklasyfikować jako:

- rzeczywista podatność;
- bezpieczny wzorzec wymagający wyjaśnienia;
- kod historyczny lub zewnętrzny;
- fałszywy alarm.

Nie wyciszaj alertu bez krótkiego uzasadnienia. Po uporządkowaniu baseline można rozważyć dodanie CodeQL do wymaganych kontroli.

## Wydania i wdrożenia

Kolejny etap profesjonalizacji powinien wprowadzić:

- numerowane wydania i tagi;
- automatyczne release notes na podstawie PR-ów;
- kompletność budowanego artefaktu sprawdzaną „na czysto”;
- środowisko testowe;
- ręczne zatwierdzenie produkcji;
- udokumentowany rollback.

Nie należy automatyzować publikacji, dopóki źródło → build → publiczny artefakt nie jest w pełni odtwarzalne i nie obejmuje wszystkich zasobów używanych przez aplikację.
