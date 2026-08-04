/* vilda_cloud_cache_warm.js — „ciepły start" trybu chmurowego: włącza uśpiony trwały cache danych.
 *
 * PROBLEM
 *   W trybie chmurowym po każdym odblokowaniu sejfu aplikacja robi pełny `syncPull()` z serwera,
 *   zanim pokaże dane (np. Terminarz). Na wolniejszym łączu / iPhonie oznacza to uciążliwe czekanie
 *   „aż się ściągną dane" przy każdym wejściu.
 *
 *   W kodzie sejfu (vilda_vault.js) ISTNIEJE już cały mechanizm „ciepłego startu”:
 *     • trwały backend w IndexedDB (baza „vilda-cloud-cache”, store „state”),
 *     • zapis stanu po synchronizacji (writeState) oraz odczyt-hydratacja przy starcie (readState),
 *     • publiczne API: isPersistentCloudCacheEnabled(), canWarmStartCloudOnly().
 *   Ale jest ZABRAMKOWANY funkcją Je(), która DOMYŚLNIE zwraca false i NIGDZIE w aplikacji nie jest
 *   włączana (brak settera, brak przełącznika w UI). Efekt: trwały cache jest martwy → pełny pull
 *   za każdym razem.
 *
 * ROZWIĄZANIE (Opcja A — bez edycji zminifikowanego kodu)
 *   Włączamy bramkę Je(), ustawiając jej dwa źródła prawdy:
 *     • window.VILDA_PERSISTENT_CLOUD_CACHE = true  → działa NATYCHMIAST w tej sesji (Je() czyta
 *       ten globalny flag w pierwszej kolejności),
 *     • localStorage['vilda-persistent-cloud-cache-v1'] = '1'  → utrwala wybór na kolejne wejścia
 *       (Je() czyta ten klucz, gdy globalny flag nie jest ustawiony) i czyni go odwracalnym/inspekcyjnym.
 *   Wtedy sejf zapisuje zsynchronizowane dane lokalnie i przy następnym odblokowaniu pokazuje je OD RAZU
 *   z cache, a świeży `syncPull` dociąga w tle.
 *
 * BEZPIECZEŃSTWO / PRYWATNOŚĆ
 *   • Cache przechowuje wyłącznie SZYFROGRAM (rekordy z headerCipher/bodyCipher/payloadCipher). Klucz
 *     odblokowujący NADAL żyje tylko w sessionStorage — nic nie zmieniamy w modelu „klucz nie ląduje
 *     na dysku”. Szyfrogram na dysku jest bezużyteczny bez klucza z sesji. Model zero-knowledge zostaje.
 *   • Cache jest kluczowany per-użytkownik i CZYSZCZONY przy wylogowaniu/wyczyszczeniu danych
 *     (mechanizm „wipe-pending” w sejfie) — nie przecieka między kontami.
 *   • W trybie EFEMERYCZNYM sejf i tak nie utrwala (bramka `if(yt)` w init) — respektujemy „nie zapisuj”.
 *   • Sejf ma własny bezpiecznik: po 3 nieudanych zapisach trwałych ustawia pref na '0' (auto-wyłączenie
 *     na urządzeniu, które nie potrafi pisać do IndexedDB). SZANUJEMY to: jeśli pref === '0', NIE włączamy
 *     (ani globalnego flagu, ani localStorage), żeby nie walczyć z bezpiecznikiem — zachowanie samo-naprawcze.
 *
 * BEZPIECZNIKI SKRYPTU
 *   • Brak zależności; wszystko w try/catch (tryb prywatny / brak storage nie wywala skryptu).
 *   • Idempotentny (podwójne dołączenie nie robi nic złego).
 *   • Nie dotyka logiki logowania ani klucza — czysta konfiguracja cache’u danych.
 */
(function (w) {
  'use strict';
  if (!w) return;

  var LS_KEY = 'vilda-persistent-cloud-cache-v1';

  // Nie inicjalizuj dwa razy.
  if (w.VildaCloudCacheWarm && w.VildaCloudCacheWarm.__init) return;

  var enabled = false;
  var respectedOptOut = false;

  try {
    var cur = null;
    try {
      if (w.localStorage) cur = w.localStorage.getItem(LS_KEY);
    } catch (_) {
      cur = null;
    }

    if (cur === '0') {
      // Jawne wyłączenie (opt-out użytkownika lub bezpiecznik sejfu po nieudanych zapisach) — respektujemy.
      respectedOptOut = true;
    } else {
      // Włącz trwały cache. Globalny flag działa natychmiast (Je() czyta go w pierwszej kolejności),
      // localStorage utrwala wybór na kolejne wejścia.
      try {
        w.VILDA_PERSISTENT_CLOUD_CACHE = true;
      } catch (_) {
        /* środowisko bez zapisu do window — trudno, zostaje localStorage */
      }
      try {
        if (w.localStorage && cur !== '1') w.localStorage.setItem(LS_KEY, '1');
      } catch (_) {
        /* prywatny tryb / brak storage — w tej sesji zadziała sam globalny flag */
      }
      enabled = true;
    }
  } catch (_) {
    /* nic — nie ryzykujemy wywrócenia startu aplikacji */
  }

  // Publiczny znacznik (dla testów/diagnostyki; nie zmienia zachowania).
  w.VildaCloudCacheWarm = {
    __init: true,
    version: '1',
    enabled: enabled,
    respectedOptOut: respectedOptOut,
    lsKey: LS_KEY,
  };
})(typeof window !== 'undefined' ? window : this);
