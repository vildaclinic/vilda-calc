/* vilda_cloud_cache_warm.js — WYŁĄCZNIK AWARYJNY trwałego cache chmurowego (kill-switch).
 *
 * KONTEKST / DLACZEGO
 *   Poprzednia wersja tego pliku WŁĄCZAŁA trwały cache danych („Opcja A”, warm start).
 *   W trybie chmurowym na iPhone (PWA) powodowało to zapis CAŁEGO zaszyfrowanego zbioru
 *   pacjentów do IndexedDB („vilda-cloud-cache”) i odczyt tego bloba przy starcie → skok
 *   pamięci → WebKit ubijał proces strony („Wielokrotnie wystąpił problem…”), a dane z chmury
 *   się nie ładowały. Reinstalacja PWA nie pomaga, bo iOS nie czyści niezawodnie danych origin,
 *   a wejście na adres główny (index.html) z poprzednim enablerem znów ustawiało preferencję.
 *   Dlatego ten plik został przerobiony na WYŁĄCZNIK: trwale gasi funkcję i sprząta jej bazę.
 *
 * DZIAŁANIE (skrypt ładowany PRZED sejfem na KAŻDEJ stronie ładującej sejf)
 *   1) window.VILDA_PERSISTENT_CLOUD_CACHE = false  → bramka Je() w sejfie zwraca false
 *      NATYCHMIAST (czyta ten globalny flag w pierwszej kolejności). Sejf NIE tworzy trwałego
 *      backendu i NIE czyta feralnego bloba przy starcie → koniec z crashem.
 *   2) localStorage['vilda-persistent-cloud-cache-v1'] = '0'  → utrwala wyłączenie na kolejne
 *      wejścia (odporne na to, że iOS potrafi zachować dane PWA mimo reinstalacji).
 *   3) indexedDB.deleteDatabase('vilda-cloud-cache')  → best-effort skasowanie bloba (zwolnienie
 *      pamięci/miejsca). Sejf i tak nie otworzy tej bazy (Je()=false), więc delete nie jest
 *      blokowany otwartym połączeniem.
 *
 * BEZPIECZNIKI
 *   • Brak zależności; wszystko w try/catch (nie ryzykujemy wywrócenia startu aplikacji).
 *   • NIE ma bramki „nie uruchamiaj dwa razy” — wyłączenie MA się wykonać zawsze, idempotentnie.
 *   • Nie dotyka logiki logowania ani klucza sejfu — czyste, defensywne sprzątanie konfiguracji.
 */
(function (w) {
  'use strict';
  if (!w) return;

  var LS_KEY = 'vilda-persistent-cloud-cache-v1';
  var DB_NAME = 'vilda-cloud-cache';

  // 1) + 2) Wyłącz bramkę Je() SYNCHRONICZNIE, zanim sejf ją sprawdzi.
  try {
    w.VILDA_PERSISTENT_CLOUD_CACHE = false;
  } catch (_) {
    /* środowisko bez zapisu do window — zostaje localStorage */
  }
  try {
    if (w.localStorage) w.localStorage.setItem(LS_KEY, '0');
  } catch (_) {
    /* prywatny tryb / brak storage — w tej sesji zadziała sam globalny flag */
  }

  // 3) Best-effort skasowanie bazy trwałego cache (sprzątanie feralnego bloba).
  var dbDeleteRequested = false;
  try {
    if (w.indexedDB && typeof w.indexedDB.deleteDatabase === 'function') {
      var req = w.indexedDB.deleteDatabase(DB_NAME);
      dbDeleteRequested = true;
      // Nie blokujemy startu — obsługa zdarzeń tylko dla diagnostyki.
      try {
        req.onsuccess = function () {
          try {
            if (w.VildaCloudCacheWarm) w.VildaCloudCacheWarm.dbDeleted = true;
          } catch (_) {
            /* noop */
          }
        };
        req.onerror = function () {};
        req.onblocked = function () {};
      } catch (_) {
        /* noop */
      }
    }
  } catch (_) {
    /* noop */
  }

  // Publiczny znacznik (dla testów/diagnostyki). Zachowana nazwa i pole __init dla zgodności,
  // ale enabled=false i killswitch=true — jednoznacznie sygnalizują WYŁĄCZENIE funkcji.
  w.VildaCloudCacheWarm = {
    __init: true,
    version: '2',
    mode: 'killswitch',
    enabled: false,
    killswitch: true,
    dbDeleteRequested: dbDeleteRequested,
    lsKey: LS_KEY,
  };
})(typeof window !== 'undefined' ? window : this);
