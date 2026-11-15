# Podgląd nowej strony głównej

To narzędzie eksportuje rzeczywistą aplikację z gałęzi integracyjnej do osobnej
domeny podglądu. Nie zmienia plików produkcyjnych, obliczeń ani konfiguracji
GitHub Pages. Wywołanie z katalogu repozytorium:

```bash
node tools/home-preview/export.mjs --output /workspace/sites/vilda-nowa-glowna/dist
```

Katalog docelowy musi być pusty albo zawierać znacznik poprzedniego eksportu tego
narzędzia. Musi leżeć poza repozytorium źródłowym. Eksporter nie kopiuje plików
nieujętych w indeksie Git; przed lokalnym podglądem nowych plików można użyć
`git add -N` dla konkretnych plików implementacji. Odtwarzalna publikacja wymaga
zatwierdzonego źródła i `sourceDirty: false` w wyniku eksportu.

Punkt wejścia podglądu to `app.html#/start`. Oryginalna makieta pozostaje osobną
stroną referencyjną. Kopię uruchamia się na innym originie niż
`https://vildaclinic.github.io`; sam inny katalog na tym samym hoście nie izoluje
IndexedDB, localStorage ani pamięci service workera.

## Co zawiera eksport

- Indeksowane pliki runtime z katalogu głównego oraz zasoby `runtime/`,
  `pwa-icons/`, `templates/` i informacje licencyjne. Bez repozytorium Git,
  zależności deweloperskich, testów, sekretów i nieśledzonych plików.
- `vilda_home_preview.js` i CSS pochodzące z tego katalogu. Są dołączane do
  wygenerowanych dokumentów, nigdy do dokumentów produkcyjnych.
- `.vilda-home-preview-export.json`: SHA źródła, oznaczenie lokalnych zmian,
  identyfikator całego zestawu wejściowego oraz hashe i rozmiary wszystkich
  wygenerowanych zasobów. Identyfikator obejmuje też treść samego eksportera.

## Granica sieci i danych

Każdy wygenerowany HTML otrzymuje przed pierwszym skryptem dodatkową politykę
CSP: połączenia tylko do własnego originu, brak zewnętrznych ramek i formularzy.
Wygenerowany service worker ma dodatkowo własną blokadę `fetch` poza swoim
originem; nie polega ona na obsłudze pliku `_headers` przez hosting.

Adres produkcyjnego Workera jest zastępowany zarezerwowanym adresem `.invalid`
w eksportowanych plikach JS i HTML. Obejmuje to również stały adres natywnego
clinical workspace w `vilda_vault.js`, niezależny od `VILDA_SYNC_WORKER_URL`.
Końcowy skan przerywa eksport, jeśli adres produkcji pozostał w pliku tekstowym.
Sam przełącznik synchronizacji i `deferServerContact` nie stanowią izolacji:
aktywacja planu może zdejmować ten znacznik w natywnej aplikacji.

Haszowane pakiety `runtime/` pozostają identyczne bajtowo. Service worker
podglądu zachowuje ich weryfikację, ma osobny prefiks cache i wersję wyprowadzoną
z całej treści eksportu. Bootstrap podglądu trafia do obowiązkowego precache.
Nie zmienia się numeracja produkcyjnych zasobów.

Bootstrap tworzy wyłącznie własne fikcyjne konto lokalne i przykładowego
pacjenta przez natywne API. Zapisane ID i etykieta konta muszą być zgodne przy
każdym ponownym otwarciu. Innego konta nie odblokowuje, nie czyta jego pacjentów
i go nie usuwa. Publiczne hasło w tym pliku służy tylko temu fikcyjnemu kontu.
Widok lekarski wykorzystuje istniejący tryb testowy uprawnień na tym koncie.
Żadne hasło użytkownika ani token produkcyjny nie jest potrzebny.

Pierwsze wejście w karcie wczytuje przykład przez natywną Kartę pacjenta i
wybór odtworzenia wizyty. Kolejne odświeżenia zachowują sesję formularza, także
po rozpoczęciu nowego pomiaru. Zakładanie konta i dodanie przykładu są
serializowane między kartami przez Web Locks. Zmiany i zapisy w podglądzie są
lokalne; nie wolno wprowadzać rzeczywistych danych pacjentów.

## Sprawdzenie przed publikacją

```bash
npx vitest run tests/unit/home-preview-export.test.mjs
```

Sprawdzenie przeglądarkowe używa nowego profilu i rzeczywistych modułów aplikacji:
pierwsze otwarcie, wynik przykładu, zmiana pomiaru, odświeżenie, uruchomienie
offline, przejście do DocPro oraz mały ekran. Obserwacja sieci musi potwierdzić
brak żądania docierającego do produkcyjnego Workera. Osobno sprawdza się, że
adres produkcyjny i obcy endpoint są blokowane również wewnątrz service workera.
Wyniki testów i ograniczenia danego etapu należy podać przy publikacji podglądu.
