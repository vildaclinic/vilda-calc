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
  Śledzone arkusze XLSX do pobrania zachowują oryginalne bajty.
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

Dawny adres Workera oraz aktualna domena `sync.vildasync.com` są zastępowane
zarezerwowanym adresem `.invalid`
w eksportowanych plikach JS i HTML. Obejmuje to również stały adres natywnego
clinical workspace w `vilda_vault.js`, niezależny od `VILDA_SYNC_WORKER_URL`.
Końcowy skan przerywa eksport, jeśli adres produkcji pozostał w pliku tekstowym.
Sam przełącznik synchronizacji i `deferServerContact` nie stanowią izolacji:
aktywacja planu może zdejmować ten znacznik w natywnej aplikacji.

Haszowane pakiety `runtime/` pozostają identyczne bajtowo. Service worker
podglądu zachowuje ich weryfikację. Zarówno prefiks pamięci shell i runtime,
jak i wersja workera zawierają identyfikator całej treści eksportu. Kolejne
publikacje tej samej raty mogą mieć różne bajty pod tym samym liczbowym `?v=`;
dlatego podgląd nie kopiuje odpowiedzi z poprzedniego eksportu. Stara pamięć
pozostaje dostępna podczas instalacji. Dopiero aktywacja nowego workera usuwa
ściśle rozpoznane poprzednie pamięci podglądu, bez dotykania sejfu, IndexedDB,
localStorage ani pamięci innych aplikacji. Bootstrap podglądu trafia do
obowiązkowego precache. Nie zmienia się numeracja produkcyjnych zasobów ani
produkcyjna strategia cache.

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

Po przygotowaniu konta otwiera się Gabinet. Wpisz „Antoni” w polu wyszukiwania
i wybierz nazwisko przykładowego pacjenta. Otworzy się Przegląd jego kartoteki,
z zakładką Przypomnienia. Przełączenie na Analizę pokazuje formularz, wyniki
i narzędzia kliniczne. Wspólny nagłówek zachowuje położenie na obu ekranach.
Przycisk „Rozpocznij wizytę” pozwala zacząć konsultację także bez nowego pomiaru
masy i wzrostu. Po wpisaniu danych można wybrać „Zapisz wizytę”.

W Bazie pacjentów wybór nazwiska otwiera ten sam Przegląd. „Historia wizyt”
pozwala odczytać zapisaną wizytę. Dopiero „Edytuj wizytę” otwiera wskazany
zapis do korekty. W trakcie wizyty przycisk „Zapisz wizytę” i skrót Ctrl+S
(na Macu ⌘S) odnoszą się do otwartej wizyty.

Wybór pacjenta należy do użytkownika. Przy zmianie pacjenta aplikacja sprawdza
stan niezapisanych danych. Zakładanie konta i dodanie przykładu są serializowane
między kartami przez Web Locks. Dane tego konta pozostają w lokalnym podglądzie.
Do testów używaj wyłącznie fikcyjnych pacjentów.

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
wyszukanie przykładowego pacjenta w Gabinecie, przejście między Przeglądem
i Analizą, widoczność przypomnień w Przeglądzie i położenie wspólnego nagłówka
na desktopie, tablecie i telefonie. Sprawdź także zapis wizyty bez nowych
pomiarów, anulowanie zmiany niezapisanej sesji, odświeżenie, uruchomienie
offline i przejście do DocPro. Obserwacja sieci musi potwierdzić
brak żądania docierającego do produkcyjnego Workera. Osobno sprawdza się, że
adres produkcyjny i obcy endpoint są blokowane również wewnątrz service workera.
Aktualizację sprawdza się z ostatniego opublikowanego eksportu przez natywne
„Aktualizuj”, także gdy numer `?v=` zmienionego pliku pozostaje taki sam.
Po aktualizacji i zimnym starcie offline hash rzeczywistej odpowiedzi workera
oraz wpisu jego bieżącej pamięci musi odpowiadać nowemu eksportowi. Samo
sprawdzenie nazwy workera lub globalne `caches.match()` nie wystarcza.
Test zachowuje konto, pacjenta, identyfikator wizyty i wpisane pomiary.
Wyniki testów i ograniczenia danego etapu należy podać przy publikacji podglądu.
