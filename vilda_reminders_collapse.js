/* vilda_reminders_collapse.js — zwijana kategoria „Zaległe” w panelu Przypomnień (strona główna).
 *
 * PROBLEM
 *   W panelu przypomnień (#remindersInline) sekcja „Zaległe” (.vild-rem-sec-over) potrafi
 *   zasłaniać bieżące pozycje („Dziś”). Chcemy móc ją ZWINĄĆ, a stan (zwinięte/rozwinięte)
 *   ZAPAMIĘTAĆ w przeglądarce.
 *
 * ROZWIĄZANIE (bez edycji zminifikowanego kodu — panel renderuje vilda_auth_ui.js)
 *   • Nagłówek sekcji (.vild-rem-sec-head) staje się klikalny; klik przełącza stan.
 *   • Obsługa przez DELEGACJĘ zdarzeń na document → działa także po każdym prze-renderowaniu
 *     panelu (nie trzeba podpinać się do konkretnego elementu, który znika przy re-renderze).
 *   • Stan trzymamy jako klasę na <html> (vrc-overdue-collapsed) ORAZ w preferencji
 *     `remindersOverdueCollapsed` o klasie `cloud-synced` — dzięki temu jedzie między
 *     urządzeniami tak samo, jak stan zwinięcia kategorii (PR 17). Klasa na
 *     <html> sprawia, że CSS obowiązuje NATYCHMIAST dla każdego renderu panelu — bez migotania
 *     (żadnego „mignięcia” rozwiniętej listy przed zwinięciem).
 *   • Domyślnie: rozwinięte (brak wpisu w localStorage). Dotyczy TYLKO sekcji „Zaległe”.
 *
 * BEZPIECZNIKI
 *   • Brak zależności; na stronach bez panelu CSS po prostu niczego nie dotyczy.
 *   • localStorage w try/catch (tryb prywatny / wyłączony storage nie wywala skryptu).
 *   • Idempotentne (podwójne dołączenie nie inicjalizuje dwa razy).
 */
(function (w) {
  'use strict';
  if (!w || !w.document) return;

  var doc = w.document;
  var root = doc.documentElement;
  var LS_KEY = 'vilda-rem-overdue-collapsed-v1'; // dziedzictwo: stan sprzed synchronizacji
  var PREF_KEY = 'remindersOverdueCollapsed';
  var HTML_CLASS = 'vrc-overdue-collapsed';

  /** Adapter preferencji; gdy go nie ma (strona bez niego), spadamy na czysty localStorage. */
  function prefs() {
    var P = w.VildaPersistence;
    return P && typeof P.readBooleanPreference === 'function'
      && typeof P.writeBooleanPreference === 'function' ? P : null;
  }

  function legacyCollapsed() {
    try {
      return !!(w.localStorage && w.localStorage.getItem(LS_KEY) === '1');
    } catch (_) {
      return false;
    }
  }

  // Nie inicjalizuj dwa razy.
  if (w.VildaRemindersCollapse && w.VildaRemindersCollapse.__init) return;

  function isCollapsed() {
    var P = prefs();
    if (!P) return legacyCollapsed();
    // Domyślną wartością jest stan sprzed synchronizacji, więc kto miał sekcję zwiniętą,
    // ten ma ją zwiniętą dalej — bez osobnego kroku migracji.
    try {
      return !!P.readBooleanPreference(PREF_KEY, legacyCollapsed());
    } catch (_) {
      return legacyCollapsed();
    }
  }

  function saveCollapsed(v) {
    var P = prefs();
    if (P) {
      try {
        P.writeBooleanPreference(PREF_KEY, !!v);
        return;
      } catch (_) {
        /* spadamy na localStorage poniżej */
      }
    }
    try {
      if (w.localStorage) w.localStorage.setItem(LS_KEY, v ? '1' : '0');
    } catch (_) {
      /* prywatny tryb / brak storage — trudno, zostaje stan tylko na czas sesji */
    }
  }

  function injectStyle() {
    if (doc.getElementById('vrc-style')) return;
    var css =
      // Nagłówek „Zaległe” klikalny.
      '.vild-rem-sec-over > .vild-rem-sec-head{cursor:pointer;-webkit-user-select:none;user-select:none;}' +
      // Chevron po etykiecie „Zaległe” (pierwszy span nagłówka).
      '.vild-rem-sec-over > .vild-rem-sec-head > span:first-child::after{' +
      'content:"\\25BE";display:inline-block;margin-left:6px;font-size:.82em;opacity:.6;' +
      'transition:transform .18s ease;vertical-align:baseline;}' +
      // Stan zwinięty: chevron obrócony w prawo…
      'html.' + HTML_CLASS +
      ' .vild-rem-sec-over > .vild-rem-sec-head > span:first-child::after{transform:rotate(-90deg);}' +
      // …i wszystkie pozycje sekcji (poza nagłówkiem) ukryte.
      'html.' + HTML_CLASS +
      ' .vild-rem-sec-over > *:not(.vild-rem-sec-head){display:none !important;}';
    var style = doc.createElement('style');
    style.id = 'vrc-style';
    style.textContent = css;
    (doc.head || root).appendChild(style);
  }

  function applyState() {
    root.classList.toggle(HTML_CLASS, isCollapsed());
  }

  injectStyle();
  applyState();

  // Scalenie z chmury wpisuje nową wartość preferencji bez zdarzenia — po synchronizacji
  // przepisujemy klasę na <html>, żeby stan z drugiego urządzenia był widać od razu.
  try {
    w.addEventListener('vilda:sync-merged', applyState);
  } catch (_) {
    /* brak addEventListener — nic nie szkodzi, stan wejdzie przy następnym wczytaniu strony */
  }

  // Delegowany klik: nagłówek sekcji „Zaległe” przełącza stan. Działa dla panelu renderowanego
  // w dowolnym momencie i po każdym re-renderze (nasłuch jest na document, nie na elemencie).
  doc.addEventListener(
    'click',
    function (ev) {
      var target = ev.target;
      if (!target || typeof target.closest !== 'function') return;
      var head = target.closest('.vild-rem-sec-head');
      if (!head || !head.closest('.vild-rem-sec-over')) return; // tylko sekcja „Zaległe”
      var next = !isCollapsed();
      saveCollapsed(next);
      root.classList.toggle(HTML_CLASS, next);
    },
    false,
  );

  // Publiczny znacznik (dla testów/diagnostyki; nie zmienia zachowania).
  w.VildaRemindersCollapse = {
    __init: true,
    version: '2',
    isCollapsed: isCollapsed,
  };
})(typeof window !== 'undefined' ? window : this);
