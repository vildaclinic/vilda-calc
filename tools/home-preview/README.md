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

Główny punkt wejścia podglądu to `app.html#/start`. Samodzielne strony zawierające
natywny moduł konta, w tym `subskrypcja.html`, również przygotowują albo odblokowują
wyłącznie własne fikcyjne konto. Nowa karta przeglądarki nie wymaga wpisywania
hasła demonstracyjnego. Strony informacyjne bez modułu konta nie oczekują na
jego załadowanie. Oryginalna makieta pozostaje osobną
stroną referencyjną. Kopię uruchamia się na innym originie niż
`https://vildaclinic.github.io`; sam inny katalog na tym samym hoście nie izoluje
IndexedDB, localStorage ani pamięci service workera.

Strona podglądu może być sama osadzona w ramce interfejsu Sites. Taka ramka
nadal przygotowuje własne konto demonstracyjne. Bootstrap pomijają wyłącznie
wewnętrzne ramki `app-pane` aplikacji, których rodzicem jest `app.html` z tego
samego originu. Nie zakładamy, że każde `window !== window.top` oznacza panel
aplikacji; podgląd nie odczytuje danych obcego dokumentu nadrzędnego.

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

W eksportowanej `subskrypcja.html` formularz zakupu i aktywacji jest zastępowany
ekranem „Dostęp demonstracyjny”. Skrypty aktywacji okresu próbnego i płatności
nie są dołączane do tego dokumentu. Oznaczenie podglądu odzwierciedla rzeczywisty
stan natywnego dostępu na fikcyjnym koncie, także w powłoce bez `VildaProUi`.
Nie przedstawia go jako opłaconej subskrypcji ani weryfikacji PWZ. Natywne
potwierdzenie otwarcia treści lekarskich w DocPro pozostaje do decyzji użytkownika.

Dostęp demonstracyjny jest uzgadniany przez natywne zdarzenia odblokowania,
gotowości autoryzacji i zmiany planu. Ponowna aktywacja używa istniejącego API
planu dopiero po sprawdzeniu odblokowanego fikcyjnego konta, bez zapętlania
zdarzeń. Późne zdarzenie blokady widoku jest kończone przed powiadomieniem
natywnych odbiorców, aby przywrócić spójność trybu wyników. Zablokowanie lub
zmiana konta nie nadaje dostępu innemu użytkownikowi. Klasy widoku i opis
podglądu wynikają z rzeczywistego `hasAccess()`, nie ukrywają braku uprawnień.

Po przygotowaniu konta i funkcji lekarskich strona główna udostępnia formularz
bez automatycznego wczytywania pacjenta. Pasek „Przykładowy pacjent” otwiera
natywną Kartę pacjenta dopiero po kliknięciu. Następnie użytkownik sam wybiera
„Wczytaj tego pacjenta” i odtworzenie zapisanej wizyty. Natywne pytania o
niezapisane zmiany pozostają widoczne i wymagają jego decyzji. Bootstrap nie
klika przycisków wczytania ani odtworzenia i nie czeka na warunkowo wyświetlany
modal; brak takiego modala nie blokuje całego podglądu. Nie ma też oczekującego
automatycznego wczytania, które mogłoby później zastąpić wpisane dane.
Kolejne odświeżenia zachowują sesję formularza, także po rozpoczęciu nowego
pomiaru. Dawny znacznik `vilda-home-preview-opened-v1` jest ignorowany.
Zakładanie konta i dodanie przykładu są
serializowane między kartami przez Web Locks. Zmiany i zapisy w podglądzie są
lokalne; nie wolno wprowadzać rzeczywistych danych pacjentów.

Wejście bezpośrednio do DocPro, ustawień lub ekranu dostępu nie tworzy pacjenta
i nie wybiera wizyty. Tę czynność wykonuje wyłącznie strona główna. Podgląd
zachowuje bieżące ograniczenie importu XLSX: zewnętrzna biblioteka SheetJS
jest blokowana przez izolację sieci, a przykładowe pliki XLSX nie są jeszcze
pakowane. Nie należy przedstawiać tego eksportu jako pełnej kopii wszystkich
operacji plikowych aplikacji.

## Sprawdzenie przed publikacją

```bash
npx vitest run tests/unit/home-preview-export.test.mjs
```

Sprawdzenie przeglądarkowe używa nowego profilu i rzeczywistych modułów aplikacji:
pierwsze otwarcie bez blokady i bez automatycznego wyboru pacjenta, jawne
wczytanie i odtworzenie przykładu, anulowanie zmiany niezapisanej sesji,
zmiana pomiaru, odświeżenie, wyczyszczenie i ponowne odświeżenie, uruchomienie
offline, przejście do DocPro oraz mały ekran. Obserwacja sieci musi potwierdzić
brak żądania docierającego do produkcyjnego Workera. Osobno sprawdza się, że
adres produkcyjny i obcy endpoint są blokowane również wewnątrz service workera.
Wyniki testów i ograniczenia danego etapu należy podać przy publikacji podglądu.
