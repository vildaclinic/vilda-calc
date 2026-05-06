/*
 * ============================================================================
 * ⚠️  TURBO DRIVE — REGUŁY DLA NOWYCH PLIKÓW I SKRYPTÓW (Etap 2 — 2025-05) ⚠️
 * ============================================================================
 *
 * 1. KAŻDY nowy `<script src="…">` dodawany do dowolnej podstrony HTML MUSI
 *    mieć atrybut `data-turbo-track="reload"`. Bez tego Turbo Drive po
 *    nawigacji bez reloadu wykona skrypt PONOWNIE, a globalne `let`/`const`
 *    rzucą `SyntaxError: Identifier '…' has already been declared` i sparaliżują
 *    całą stronę. Wzór:
 *       <script src="moj_modul.js?v=1" data-turbo-track="reload"></script>
 *    Inline `<script>…</script>` (bez `src`) NIE wymagają tego atrybutu —
 *    re-eval jest po stronie pożądany (per-page init code).
 *
 * 2. KAŻDY listener na DOMContentLoaded lub window.load jest automatycznie
 *    re-fire'owany na `turbo:load` przez hijack zainstalowany niżej w tym
 *    pliku. Moduły same powinny być idempotentne (guards przez
 *    `data-…-bound` dataset / flagi closure).
 *
 * 3. Wewnętrzne rejestry „once" w `vildaAppSafeInit` / `vildaSafeInit` są
 *    czyszczone na `turbo:before-visit`, żeby ponowne wywołanie pod tym samym
 *    kluczem faktycznie wywołało fn (a nie zwróciło undefined przez guard).
 *
 * 4. Nowy plik HTML: kopiuj layout z istniejącej podstrony (np. homa-ir.html).
 *    Skrypty w head muszą być w tej samej kolejności. Body MUSI mieć
 *    `data-turbo="false"` (Turbo wyłączone domyślnie). Linki opt-in do Turbo
 *    nawigacji (`data-turbo="true"`) są dodawane w `vilda_chrome.js MENU`
 *    przez flagę `turbo: true`.
 *
 * 5. setInterval w nowym module: użyj `vildaSetInterval(fn, ms)` zamiast
 *    natywnego `setInterval`. Wrapper rejestruje interwał i kasuje go w
 *    `turbo:before-cache`, żeby nie tykał dalej po Turbo-nawigacji.
 *
 * 6. Stateful overlays (modale, toast, tutorial overlay) muszą mieć cleanup
 *    w `turbo:before-visit` — wzór w tutorial.js (linia ~2310+).
 *
 * ============================================================================
 *
 * vilda_turbo_helpers.js — globalne helpery init / interwałów / Turbo-readiness.
 *
 * Plik MUSI być dołączony SYNCHRONICZNIE w <head> przed jakimkolwiek innym
 * skryptem (zwłaszcza przed inline-scriptami w body), żeby `vildaPageReady`,
 * `vildaOnReady`, `vildaSetInterval` i `vildaSafeInit` były dostępne od razu
 * przy pierwszym napotkaniu w trakcie parsowania HTML-a.
 *
 * Te same helpery były wcześniej zdefiniowane w `custom-fixes.js`, który ładuje
 * się z `defer` na końcu HTML-a i nie był dostępny dla inline-scriptów na
 * początku body. `custom-fixes.js` ma idempotentne guardy `if (typeof
 * global.X !== 'function')`, więc po przeniesieniu definicji tutaj te bloki
 * są pomijane (zachowanie pozostaje identyczne).
 *
 * Funkcje:
 *   - vildaSafeInit(name, fn, opts) — uruchamia fn raz globalnie pod kluczem
 *     `name` (klasyczny one-shot init), backward-compat z dotychczasowym kodem.
 *   - vildaOnReady(name, fn, opts) — rejestr funkcji init odpalanych:
 *       (a) raz na pierwszy DOMContentLoaded,
 *       (b) ponownie na każdym `turbo:load` (po Turbo Drive nawigacji bez reloadu).
 *     Domyślnie funkcja re-initowana jest przy każdej Turbo-nawigacji. Opcja
 *     `{ turboReload: false }` wyłącza re-init dla pojedynczego callbacka.
 *   - vildaPageReady(fn) — skrót dla inline-scriptów w HTML-ach. Auto-generuje
 *     nazwę i przekazuje do vildaOnReady.
 *   - vildaSetInterval(fn, ms) / vildaClearInterval(id) — wrapper na setInterval,
 *     który automatycznie kasuje aktywne interwały w `turbo:before-cache`,
 *     żeby nie tykały dalej po Turbo-nawigacji na inną podstronę.
 *
 * Etap pre-Turbo (2025-05): wszystkie listenery na zdarzeniach `turbo:*` są
 * niegroźne dopóki Turbo Drive nie jest zainstalowany — zdarzenia po prostu
 * nie zostaną wyemitowane. Aplikacja działa identycznie jak wcześniej.
 */

(function (global) {
  'use strict';
  if (!global) return;

  // ============ vildaSafeInit ============
  if (typeof global.vildaSafeInit !== 'function') {
    var fallbackRegistry = Object.create(null);
    global.vildaSafeInit = function (name, fn, options) {
      var key = String(name || 'anonymous-init');
      var opts = options || {};
      if (opts.once !== false && fallbackRegistry[key]) return undefined;
      fallbackRegistry[key] = true;
      try {
        return typeof fn === 'function' ? fn() : undefined;
      } catch (error) {
        if (global.console && typeof global.console.warn === 'function') {
          global.console.warn('[vildaSafeInit] ' + key + ' failed', error);
        }
        return undefined;
      }
    };
  }

  // ============ vildaOnReady ============
  if (typeof global.vildaOnReady !== 'function') {
    var onReadyRegistry = [];
    var initialFired = false;
    var firstTurboLoadConsumed = false;

    function runOne(reg) {
      try {
        if (typeof reg.fn === 'function') reg.fn();
      } catch (error) {
        if (global.console && typeof global.console.warn === 'function') {
          global.console.warn('[vildaOnReady] ' + reg.name + ' failed', error);
        }
      }
    }

    function runRegisteredFirstTime() {
      if (initialFired) return;
      initialFired = true;
      onReadyRegistry.forEach(function (reg) {
        if (typeof global.vildaSafeInit === 'function') {
          global.vildaSafeInit(reg.name, reg.fn, reg.opts);
        } else {
          runOne(reg);
        }
      });
    }

    function runRegisteredOnTurboNav() {
      onReadyRegistry.forEach(function (reg) {
        if (reg.turboReload === false) return;
        runOne(reg);
      });
    }

    global.vildaOnReady = function (name, fn, options) {
      var opts = options || {};
      var reg = {
        name: String(name || 'anonymous-init'),
        fn: fn,
        opts: opts,
        turboReload: opts.turboReload !== false
      };
      onReadyRegistry.push(reg);
      if (initialFired || !global.document || global.document.readyState !== 'loading') {
        if (typeof global.vildaSafeInit === 'function') {
          return global.vildaSafeInit(reg.name, reg.fn, reg.opts);
        }
        return runOne(reg);
      }
      return undefined;
    };

    if (global.document) {
      if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', runRegisteredFirstTime, { once: true });
      } else {
        initialFired = true;
      }
      global.document.addEventListener('turbo:load', function () {
        if (!firstTurboLoadConsumed) {
          firstTurboLoadConsumed = true;
          if (!initialFired) runRegisteredFirstTime();
          return;
        }
        runRegisteredOnTurboNav();
      });
    }

    global.vildaOnReady._registry = onReadyRegistry;
  }

  // ============ vildaInstallGlobalListener — anti-leak guard ============
  // Etap 4.2 (2026-05): wzorzec do bezpiecznej instalacji listenerów na
  // `document`/`window`/`data-turbo-permanent` elementach. Te targety NIE są
  // resetowane przy nawigacji Turbo, więc każde re-fire `vildaOnReady`-callback'u
  // (czyli każda Turbo-nawigacja) dodawało kolejny listener. Po N nawigacjach
  // każdy event triggerował N kopii handlera.
  //
  // Użycie:
  //   vildaInstallGlobalListener('app:resize-mainlayout', window, 'resize',
  //       handleMainLayoutResize);
  //
  // Listener jest instalowany dokładnie raz w cyklu życia karty przeglądarki.
  // Klucz musi być unikalny w skali całej aplikacji (zalecam prefix nazwą pliku).
  // Jeśli potrzebujesz listenera, który ma być resetowany per-page (np. closure
  // nad elementem nie-permanentnym) — użyj zwykłego `addEventListener` na tym
  // elemencie (umrze razem z body przy turbo render).
  if (typeof global.vildaInstallGlobalListener !== 'function') {
    var installedKeys = Object.create(null);
    global.vildaInstallGlobalListener = function (key, target, event, handler, options) {
      if (!key || !target || !event || typeof handler !== 'function') return false;
      if (installedKeys[key]) return false;
      try {
        target.addEventListener(event, handler, options);
        installedKeys[key] = true;
        return true;
      } catch (e) {
        if (global.console && typeof global.console.warn === 'function') {
          global.console.warn('[vildaInstallGlobalListener] ' + key + ' failed:', e);
        }
        return false;
      }
    };
    // Eksponujemy snapshot rejestru dla debugowania w DevTools.
    global.vildaInstallGlobalListener._registry = installedKeys;
  }

  // ============ vildaPageReady ============
  if (typeof global.vildaPageReady !== 'function') {
    var pageReadyCounter = 0;
    global.vildaPageReady = function (fn) {
      if (typeof fn !== 'function') return;
      var name = 'inline:auto-' + (++pageReadyCounter);
      if (typeof global.vildaOnReady === 'function') {
        return global.vildaOnReady(name, fn);
      }
      if (global.document && global.document.readyState !== 'loading') {
        try { return fn(); } catch (_) {}
      } else if (global.document) {
        global.document.addEventListener('DOMContentLoaded', fn, { once: true });
      }
    };
  }

  // ============ Hijack DOMContentLoaded + window.load → re-fire na turbo:load ============
  // Etap 2 (2025-05): w aplikacji jest ~33 plików JS, które rejestrują
  // listenery na natywnym `DOMContentLoaded` lub `window.load` (m.in. przez
  // `vildaAppOnReady` w `vilda_app_helpers.js`). Bez tej hijack-funkcji każdy
  // z nich musiałby być przepisany ręcznie, żeby reagować na nawigację Turbo
  // (która ani DOMContentLoaded ani load NIE odpala ponownie — tylko `turbo:load`).
  //
  // Co robi hijack:
  //   1) podmieniamy `document.addEventListener('DOMContentLoaded', cb)` i
  //      `window.addEventListener('load', cb)` — listenery odpalają się
  //      natywnie przy pierwszym renderze, PLUS są dopisywane do rejestru,
  //   2) na każdym kolejnym `turbo:load` (poza pierwszym, który pokrywa się z
  //      pierwszym renderem) odpalamy wszystkie listenery z rejestru ponownie.
  //
  // Wymóg idempotencji: moduły powinny same być odporne na wielokrotne
  // wywołanie (guard-flagi, dataset markers, etc.). Większość modułów Vildy
  // ma już takie guardy.
  if (global.document && typeof global.__vildaInitHijackInstalled === 'undefined') {
    global.__vildaInitHijackInstalled = true;
    var pageInitListeners = [];

    function registerHijack(target, eventName) {
      var nativeAdd = target.addEventListener.bind(target);
      var nativeRemove = target.removeEventListener.bind(target);
      target.addEventListener = function (eventType, listener, options) {
        if (eventType === eventName && typeof listener === 'function') {
          nativeAdd(eventType, listener, options);
          pageInitListeners.push({ fn: listener, source: eventName });
          return;
        }
        return nativeAdd(eventType, listener, options);
      };
      target.removeEventListener = function (eventType, listener, options) {
        if (eventType === eventName && typeof listener === 'function') {
          var idx = pageInitListeners.findIndex(function (e) { return e.fn === listener; });
          if (idx >= 0) pageInitListeners.splice(idx, 1);
        }
        return nativeRemove(eventType, listener, options);
      };
    }

    registerHijack(global.document, 'DOMContentLoaded');
    if (global.addEventListener) registerHijack(global, 'load');

    var firstTurboLoadInHijack = true;
    global.document.addEventListener('turbo:load', function () {
      if (firstTurboLoadInHijack) {
        firstTurboLoadInHijack = false;
        // Pierwszy turbo:load = initial render. DOMContentLoaded i load już się
        // odpaliły natywnie, listenery zadziałały. Nie odpalamy ich drugi raz.
        return;
      }
      // Kolejne turbo:load = nawigacja Turbo. DOM podmieniony, listenery
      // odpalamy ponownie na świeżych elementach.
      var snapshot = pageInitListeners.slice();
      snapshot.forEach(function (entry) {
        try { entry.fn(); } catch (e) {
          if (global.console && global.console.warn) {
            global.console.warn('[vilda-turbo] init re-fire failed (' + entry.source + ')', e);
          }
        }
      });
    });
  }

  // ============ DEBUG: kto zdejmuje data-turbo z body ============
  // Tymczasowy MutationObserver do zlokalizowania skryptu, który po renderze
  // usuwa nasze `data-turbo="false"` z body. Loguje stack trace przy każdej
  // zmianie atrybutu data-turbo. USUŃ po zdiagnozowaniu.
  if (global.document && typeof global.__vildaTurboAttrDebug === 'undefined') {
    global.__vildaTurboAttrDebug = true;
    var setUpObserver = function () {
      if (!global.document.body) return;
      try {
        var obs = new MutationObserver(function (mutations) {
          mutations.forEach(function (m) {
            if (m.attributeName === 'data-turbo') {
              var nowVal = global.document.body.getAttribute('data-turbo');
              global.console.warn('[vilda-turbo-debug] data-turbo zmienione:',
                'old=', m.oldValue, 'new=', nowVal,
                'stack:', new Error().stack);
            }
          });
        });
        obs.observe(global.document.body, {
          attributes: true,
          attributeOldValue: true,
          attributeFilter: ['data-turbo']
        });
      } catch (e) { global.console.warn('[vilda-turbo-debug] observer fail', e); }
    };
    if (global.document.body) {
      setUpObserver();
    } else {
      global.document.addEventListener('readystatechange', function () {
        if (global.document.body) setUpObserver();
      });
    }
  }

  // ============ Turbo Drive — wymuszamy widoczny progress bar ============
  // Domyślnie Turbo pokazuje pasek tylko gdy nawigacja trwa > 500 ms. Lokalnie
  // (i przy SW cache) wszystko jest tak szybkie, że pasek nigdy się nie
  // pokazuje — użytkownik nie ma wizualnej informacji o nawigacji. Skracamy
  // delay do 0 ms, żeby pasek mignął przy każdej Turbo-nawigacji.
  if (global.document && typeof global.__vildaTurboBarDelaySet === 'undefined') {
    global.__vildaTurboBarDelaySet = true;
    global.document.addEventListener('turbo:load', function () {
      try {
        // Turbo 8 ma nowe API `Turbo.config.drive.progressBarDelay`. Stare
        // `setProgressBarDelay()` dalej działa, ale wypisuje deprecation warning.
        if (global.Turbo && global.Turbo.config && global.Turbo.config.drive) {
          global.Turbo.config.drive.progressBarDelay = 0;
        } else if (global.Turbo && global.Turbo.setProgressBarDelay) {
          global.Turbo.setProgressBarDelay(0);
        } else if (global.Turbo && global.Turbo.session) {
          global.Turbo.session.progressBarDelay = 0;
        }
      } catch (_) { /* noop */ }
    }, { once: true });
  }

  // ============ Turbo Drive — diagnostyka ============
  // Sam loader Turbo siedzi teraz w statycznym <script> w HTML-u (po
  // vilda_turbo_helpers.js). Dzięki temu: (a) defer-load ma deterministyczną
  // kolejność wykonania, (b) widać go jasno w Network tab DevTools.
  // Tutaj tylko logujemy diagnostykę po załadowaniu, żeby było wiadomo czy
  // Turbo wstał i ile linków ma opt-in `data-turbo="true"`.
  if (global.document && typeof global.__vildaTurboDiag === 'undefined') {
    global.__vildaTurboDiag = true;
    global.document.addEventListener('turbo:load', function (e) {
      try {
        if (!global.console || !global.console.log) return;
        var T = global.Turbo;
        var drive = T && T.session && T.session.drive;
        var optIn = global.document.querySelectorAll('a[data-turbo="true"]').length;
        var bodyTurbo = global.document.body && global.document.body.getAttribute('data-turbo');
        global.console.log('[vilda-turbo] turbo:load — drive:', drive,
          '| <body data-turbo>:', bodyTurbo,
          '| linki z data-turbo="true":', optIn,
          '| Turbo.version:', T && T.session && T.session.history ? 'loaded' : 'not-detected');
      } catch (_) {}
    });
    global.document.addEventListener('turbo:click', function (e) {
      try {
        if (global.console && global.console.log) {
          global.console.log('[vilda-turbo] turbo:click intercepted →', e.detail && e.detail.url);
        }
      } catch (_) {}
    });
    global.document.addEventListener('turbo:before-visit', function (e) {
      try {
        if (global.console && global.console.log) {
          global.console.log('[vilda-turbo] turbo:before-visit →', e.detail && e.detail.url);
        }
      } catch (_) {}
    });
  }

// ============ vildaSetInterval / vildaClearInterval ============
  if (typeof global.vildaSetInterval !== 'function') {
    var trackedIntervals = new Set();
    global.vildaSetInterval = function (fn, ms) {
      try {
        var id = global.setInterval(fn, ms);
        trackedIntervals.add(id);
        return id;
      } catch (_) {
        return null;
      }
    };
    global.vildaClearInterval = function (id) {
      if (id == null) return;
      try { global.clearInterval(id); } catch (_) {}
      trackedIntervals.delete(id);
    };
    if (global.document) {
      global.document.addEventListener('turbo:before-cache', function () {
        trackedIntervals.forEach(function (id) {
          try { global.clearInterval(id); } catch (_) {}
        });
        trackedIntervals.clear();
      });
    }
  }
})(typeof window !== 'undefined' ? window : this);
