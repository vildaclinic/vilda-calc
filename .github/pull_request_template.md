## Cel

<!-- Jaki problem rozwiązuje ten PR i dlaczego ta zmiana jest potrzebna? -->

## Zakres

<!-- Wymień zmienione strony, moduły lub konfiguracje. Wskaż również, czego celowo nie zmieniono. -->

Powiązane Issue: <!-- np. #123 albo „brak” -->

## Wpływ kliniczny

**Klasyfikacja:** <!-- brak / możliwy / zamierzona zmiana wyniku -->

<!-- Jeżeli zmienia się wzór, próg, dawka, jednostka, populacja, zaokrąglenie albo interpretacja, podaj źródło, zakres i różnicę względem poprzedniej wersji. -->

Źródło medyczne i wersja:

Przypadki `wejście → oczekiwany wynik`:

## Walidacja

<!-- Wpisz rzeczywiste wyniki. Nie pozostawiaj samej listy poleceń. -->

- [ ] Uruchomiono `npm test`.
- [ ] Uruchomiono `npm run test:e2e` albo wyjaśniono poniżej, dlaczego nie dotyczy.
- [ ] Test zmiany klinicznej wywołuje kod produkcyjny, a nie kopię wzoru.
- [ ] Sprawdzono desktop i mobile, jeżeli zmienia się UI.

Wyniki i ewentualne pominięcia:

## Prywatność i bezpieczeństwo

- [ ] Zmiana nie zawiera danych pacjentów, eksportów `.wiw`, sekretów, prywatnych logów ani zrzutów prawdziwej sesji.
- [ ] Wszystkie przykłady, fixture i screenshoty używają danych syntetycznych.
- [ ] Nie dodano `node_modules`, `.wrangler`, backupów ani lokalnych archiwów.
- [ ] Nowe zależności i uprawnienia Actions zostały uzasadnione.

## PWA i wdrożenie

**Wpływ:** <!-- brak / cache / service worker / manifest / zasób wersjonowany -->

- [ ] Sprawdzono `?v=`, `SW_VERSION`, precache i działanie offline albo punkt nie dotyczy.
- [ ] Publiczny artefakt zawiera wszystkie wymagane zasoby.
- [ ] Opisano sposób wycofania zmiany, jeżeli ryzyko tego wymaga.

## Decyzje właściciela

<!-- Co wymaga akceptacji klinicznej, organizacyjnej, scalenia lub wdrożenia? -->
