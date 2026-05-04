# Vilda 8O-11m — PWA deploy smoke checklist dla Apache/home.pl

Zakres checklisty: ręczna kontrola wdrożenia aplikacji Vilda na serwerze Apache/home.pl pod adresem `www.wagaiwzrost.pl`, z rootem wdrożeniowym `/public_html` i kanonicznym katalogiem ikon PWA `/pwa-icons/`.

Ten plik jest dokumentacją operacyjną. Nie zmienia manifestu, Service Workera, danych klinicznych, IndexedDB, BroadcastChannel, importu/eksportu JSON ani strategii cache/offline.

---

## 1. Struktura plików w `/public_html`

Po wgraniu paczki do `/public_html` sprawdź, czy w root aplikacji znajdują się co najmniej:

```txt
/public_html/index.html
/public_html/docpro.html
/public_html/manifest.json
/public_html/service-worker-kalorii.js
/public_html/pwa-icons/
```

Katalog `/pwa-icons/` powinien zawierać komplet ikon PNG wymaganych przez manifest i HTML, w tym co najmniej:

```txt
/pwa-icons/icon-120x120.png
/pwa-icons/icon-152x152.png
/pwa-icons/icon-167x167.png
/pwa-icons/icon-180x180.png
/pwa-icons/icon-192x192.png
/pwa-icons/icon-512x512.png
/pwa-icons/icon-512x512-maskable.png
```

Kontrola negatywna:

```txt
- nie jest wymagany katalog /icons/,
- nie jest wymagany plik /favicon.ico,
- nie są wymagane rootowe pliki /favicon-*.png,
- po wdrożeniu aplikacja nie powinna wykonywać requestów do /icons/ ani /favicon.ico.
```

---

## 2. Manifest PWA

Otwórz w przeglądarce:

```txt
https://www.wagaiwzrost.pl/manifest.json
```

Sprawdź:

```txt
- odpowiedź HTTP 200,
- JSON jest poprawny składniowo,
- `id` ma wartość `/`,
- `start_url` ma wartość `/`,
- `scope` ma wartość `/`,
- wszystkie ikony mają ścieżki zaczynające się od `/pwa-icons/`,
- shortcuty pozostają w rootowym scope aplikacji,
- nie ma aktywnych odwołań do `/icons/`, `icons/favicon` ani `/favicon.ico`.
```

W Chrome DevTools sprawdź:

```txt
Application → Manifest
```

Oczekiwany wynik:

```txt
- manifest jest wykryty,
- ikony są widoczne bez błędów ładowania,
- aplikacja jest installable, o ile przeglądarka spełnia pozostałe warunki instalacji PWA,
- nie pojawiają się ostrzeżenia o brakujących ikonach 192x192, 512x512 ani maskable 512x512.
```

---

## 3. Service Worker

Otwórz:

```txt
https://www.wagaiwzrost.pl/service-worker-kalorii.js
```

Sprawdź:

```txt
- odpowiedź HTTP 200,
- plik jest serwowany z root aplikacji,
- Service Worker rejestruje się w rootowym scope `/`,
- aktualny stan po 8P-2 ma `SW_VERSION` równy `0.9.408`,
- `latestValidationStep` wskazuje bieżącą walidację `8P-2`,
- strategia offline/cache nie została zmieniona w tym kroku.
```

W Chrome DevTools sprawdź:

```txt
Application → Service Workers
```

Oczekiwany wynik:

```txt
- Service Worker jest zarejestrowany dla `https://www.wagaiwzrost.pl/`,
- scope obejmuje root `/`,
- po odświeżeniu nie ma błędów instalacji ani aktywacji,
- przy aktualizacji pojawia się dotychczasowy update-flow aplikacji.
```

---

## 4. MIME i nagłówki cache

Sprawdź nagłówki odpowiedzi, na przykład przez DevTools → Network albo lokalnie poleceniami:

```bash
curl -I https://www.wagaiwzrost.pl/
curl -I https://www.wagaiwzrost.pl/index.html
curl -I https://www.wagaiwzrost.pl/docpro.html
curl -I https://www.wagaiwzrost.pl/manifest.json
curl -I https://www.wagaiwzrost.pl/service-worker-kalorii.js
curl -I https://www.wagaiwzrost.pl/pwa-icons/icon-192x192.png
curl -I https://www.wagaiwzrost.pl/pwa-icons/icon-512x512-maskable.png
```

Oczekiwane typy MIME:

```txt
/manifest.json                  application/manifest+json albo application/json
/service-worker-kalorii.js      text/javascript albo application/javascript
/pwa-icons/*.png                image/png
/index.html, /docpro.html       text/html
```

Zalecenia cache dla Apache/home.pl do weryfikacji po wdrożeniu:

```txt
- HTML: brak agresywnego długiego cache; preferowane krótkie cache albo revalidation.
- Service Worker: brak długiego cache; preferowane no-cache/revalidate, żeby update-flow widział nową wersję.
- manifest.json: krótki albo umiarkowany cache; po zmianie manifestu wymusić odświeżenie w przeglądarce.
- /pwa-icons/*.png: dłuższy cache jest akceptowalny, bo nazwy ikon są stabilne i kontrolowane.
- JSON/JS/CSS aplikacji: nie zmieniać polityki cache bez osobnego kroku.
```

Jeżeli nagłówki wymagają korekty po stronie serwera, wykonaj ją jako osobny zaakceptowany krok. Ten dokument nie wprowadza zmian w `.htaccess`.

---

## 5. Ręczne testy po wdrożeniu

### 5.1. Pierwsze wejście online

```txt
1. Wyczyść dane witryny dla `www.wagaiwzrost.pl` albo użyj profilu testowego.
2. Otwórz `https://www.wagaiwzrost.pl/`.
3. Sprawdź konsolę przeglądarki.
4. Sprawdź Network → brak 404 dla manifestu, Service Workera i ikon PWA.
5. Potwierdź, że nie ma requestów do `/icons/` ani `/favicon.ico`.
```

### 5.2. Manifest i instalowalność

```txt
1. DevTools → Application → Manifest.
2. Potwierdź poprawne `start_url`, `scope`, `id`.
3. Potwierdź widoczność ikon 192x192, 512x512 i 512x512 maskable.
4. Jeżeli przeglądarka pokazuje status instalowalności, sprawdź brak krytycznych błędów.
```

### 5.3. Service Worker lifecycle

```txt
1. DevTools → Application → Service Workers.
2. Potwierdź aktywnego Service Workera pod rootowym scope.
3. Odśwież stronę.
4. Sprawdź, czy nie pojawiają się błędy install/activate/fetch.
5. Nie używaj opcji unregister jako standardowej procedury dla użytkowników końcowych; tylko w profilu testowym.
```

### 5.4. Offline po wcześniejszym załadowaniu

```txt
1. Załaduj aplikację online.
2. Poczekaj na aktywację Service Workera.
3. Przełącz DevTools → Network → Offline.
4. Odśwież aplikację.
5. Sprawdź, czy działa dotychczasowy tryb offline i nie pojawiają się nowe błędy cache.
```

### 5.5. Update-flow

```txt
1. Po wdrożeniu nowej paczki odśwież aplikację w profilu, który ma poprzedni Service Worker.
2. Sprawdź, czy aplikacja wykrywa oczekującą aktualizację zgodnie z obecnym UX.
3. Potwierdź, że baner/komunikat aktualizacji działa zgodnie z dotychczasowym flow.
4. Nie zmieniaj payloadów BroadcastChannel ani logiki Service Workera bez osobnego kroku.
```

---

## 6. Smoke procedury w przeglądarce

Po wdrożeniu i załadowaniu aplikacji w przeglądarce uruchom w konsoli, o ile dana funkcja jest dostępna w aktualnym buildzie:

```js
window.vildaRunSmokeRegressionSuite && window.vildaRunSmokeRegressionSuite();
window.vildaGetPwaManifestIconCacheSnapshot && window.vildaGetPwaManifestIconCacheSnapshot();
window.vildaGetServiceWorkerClientLifecycleAuditSnapshot && window.vildaGetServiceWorkerClientLifecycleAuditSnapshot();
window.vildaGetServiceWorkerUpdateUxSnapshot && window.vildaGetServiceWorkerUpdateUxSnapshot();
window.vildaGetServiceWorkerRuntimeCachePruningSnapshot && window.vildaGetServiceWorkerRuntimeCachePruningSnapshot();
```

Oczekiwane kryteria akceptacji:

```txt
- brak regresji w głównym smoke suite,
- snapshot manifestu wskazuje `/pwa-icons/` jako kanoniczne źródło ikon,
- snapshot Service Workera nie wskazuje błędów lifecycle/update UX,
- brak odwołań runtime do legacy katalogu `/icons/`,
- brak odwołań runtime do `/favicon.ico`.
```

---

## 7. Granice kroku 8O-11m

Ten krok obejmuje wyłącznie dodanie niniejszej checklisty wdrożeniowej. W tym kroku nie wolno wprowadzać zmian w:

```txt
- danych GH/IGF,
- schemacie IndexedDB,
- payloadach BroadcastChannel,
- imporcie/eksporcie JSON,
- wzorach klinicznych,
- estimated intake,
- PDF/siatkach centylowych,
- strategii Service Workera,
- `SW_VERSION`,
- `manifest.json`,
- HTML aplikacji,
- katalogu `/pwa-icons/`,
- `.htaccess`.
```

---

## 8. Szybka checklista akceptacyjna

```txt
[ ] Pliki wdrożone do `/public_html`.
[ ] `/manifest.json` zwraca 200.
[ ] `/service-worker-kalorii.js` zwraca 200.
[ ] `/pwa-icons/icon-192x192.png` zwraca 200.
[ ] `/pwa-icons/icon-512x512-maskable.png` zwraca 200.
[ ] Manifest ma `id`, `start_url`, `scope` ustawione na `/`.
[ ] Wszystkie ikony manifestu wskazują `/pwa-icons/`.
[ ] DevTools → Application → Manifest bez krytycznych błędów ikon.
[ ] DevTools → Application → Service Workers pokazuje rootowy scope.
[ ] Brak requestów do `/icons/`.
[ ] Brak requestów do `/favicon.ico`.
[ ] Offline działa po wcześniejszym załadowaniu online.
[ ] Update-flow działa zgodnie z dotychczasowym UX.
[ ] Po wdrożeniu smoke testy w przeglądarce nie wskazują regresji.
```
