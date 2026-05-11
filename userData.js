// userData.js – shared user data persistence across pages
// This script synchronizes basic user information (name, age, weight, height, sex,
// optional age in months) across different pages of the Waga i wzrost site.
// When the user enters these values on any page, they are saved through
// VildaPersistence under the shared `sharedUserData` key. On page load the stored values
// are applied to matching form fields if they exist. This ensures the
// information does not have to be re‑entered on each page.

(function() {
  function logUserDataError(message, error, meta) {
    try {
      const logger = window.VildaLogger || window.vildaLogger || null;
      if (logger && typeof logger.error === 'function') {
        logger.error('user-data', message || 'Błąd synchronizacji danych użytkownika', error || null, meta || null);
      }
    } catch (loggingError) {
      if (typeof window !== 'undefined' && window.__VILDA_DEBUG && window.console && typeof window.console.warn === 'function') {
        window.console.warn('[VildaLogger][user-data] Nie udało się zapisać logu diagnostycznego', loggingError);
      }
    }
  }

  function logUserDataWarn(message, error, meta) {
    try {
      const logger = window.VildaLogger || window.vildaLogger || null;
      if (logger && typeof logger.warn === 'function') {
        logger.warn('user-data', message || 'Ostrzeżenie synchronizacji danych użytkownika', error || null, meta || null);
      }
    } catch (loggingError) {
      if (typeof window !== 'undefined' && window.__VILDA_DEBUG && window.console && typeof window.console.warn === 'function') {
        window.console.warn('[VildaLogger][user-data] Nie udało się zapisać logu diagnostycznego', loggingError);
      }
    }
  }

  function getPersistence() {
    try {
      if (typeof window !== 'undefined' && window.VildaPersistence) {
        return window.VildaPersistence;
      }
    } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
    return null;
  }

  function isPersistenceWriteSuppressed() {
    try {
      const persistence = getPersistence();
      if (persistence && typeof persistence.isAutosaveSuppressed === 'function') {
        return !!persistence.isAutosaveSuppressed();
      }
      if (typeof window === 'undefined') return false;
      const now = Date.now();
      return Number(window.__vildaPersistClearUntil || 0) > now
        || Number(window.__vildaPersistPauseUntil || 0) > now
        || !!window.__vildaPersistRestoring;
    } catch (error) {
      logUserDataWarn('Nie udało się sprawdzić blokady autosave danych użytkownika', error);
      return false;
    }
  }

  function markPersistenceClearFallback(durationMs) {
    try {
      if (typeof window === 'undefined') return;
      const ms = durationMs == null ? 2500 : Number(durationMs);
      const until = Date.now() + (Number.isFinite(ms) && ms > 0 ? ms : 2500);
      window.__vildaPersistClearUntil = Math.max(Number(window.__vildaPersistClearUntil || 0), until);
      window.__vildaPersistPauseUntil = Math.max(Number(window.__vildaPersistPauseUntil || 0), until);
    } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
  }

  function dispatchUserStateClearFallback(source) {
    try {
      if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
      const detail = { source: source || 'userData.clearFallback', clearedAtISO: new Date().toISOString() };
      if (typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('vilda:user-state-cleared', { detail }));
      } else {
        const ev = new Event('vilda:user-state-cleared');
        ev.detail = detail;
        window.dispatchEvent(ev);
      }
    } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
  }

  /**
   * Load the persisted user data through VildaPersistence. Returns an empty object
   * if nothing has been saved or if parsing fails.
   * @returns {Object}
   */
  function loadUserData() {
    const persistence = getPersistence();
    if (persistence && typeof persistence.readShared === 'function') {
      return persistence.readShared({ ensurePersist: false }) || {};
    }
    return {};
  }

  /**
   * Save the user data through VildaPersistence. Storage errors are handled
   * inside the adapter so user interactions are not interrupted.
   * @param {Object} data
   */
  function saveUserData(data) {
    if (isPersistenceWriteSuppressed()) return;
    const persistence = getPersistence();
    if (persistence && typeof persistence.writeShared === 'function') {
      persistence.writeShared(data || {}, { ensurePersist: false });
    }
  }

  /**
   * Called once on DOMContentLoaded. Reads saved values and populates
   * corresponding inputs, then attaches listeners to keep the storage
   * up to date when the user edits the form.
   */
  function initUserData() {
    const stored = loadUserData();
    // Map form element IDs to keys in the stored object. If multiple
    // elements correspond to the same key (e.g. name/fullName) they share
    // the same value.
    // Lista pól synchronizowanych między podstronami. Oprócz podstawowych danych
    // (imię, wiek, waga, wzrost, płeć) dodajemy również wzrost matki i ojca
    // z sekcji zaawansowanych obliczeń. Dzięki temu wartości te będą
    // zachowywane przez VildaPersistence i automatycznie wstawiane po przejściu
    // między stronami, co jest niezbędne do obliczania mpSDS w module
    // monitorowania terapii.
    const fields = [
      { id: 'name',     key: 'name' },
      { id: 'fullName', key: 'name' },
      { id: 'age',      key: 'age' },
      { id: 'ageMonths',key: 'ageMonths' },
      { id: 'weight',   key: 'weight' },
      { id: 'height',   key: 'height' },
      { id: 'sex',      key: 'sex' },
      // Zaawansowane pola dotyczące wzrostu rodziców. Przechowujemy je jako
      // wartości tekstowe (tak jak inne pola liczbowo‑tekstowe) i wstawiamy
      // tylko wtedy, gdy pole jest puste (analogicznie do pozostałych pól).
      { id: 'advMotherHeight', key: 'advMotherHeight' },
      { id: 'advFatherHeight', key: 'advFatherHeight' }
    ];
    const restoredValueElements = [];

    function markRestoredValue(el, previousValue) {
      if (!el) return;
      try {
        const prev = previousValue == null ? '' : String(previousValue);
        const next = el.value == null ? '' : String(el.value);
        if (prev !== next) {
          restoredValueElements.push(el);
        }
      } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
    }

    function onDomReady(fn) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fn, { once: true });
      } else {
        fn();
      }
    }

    function nextFrame(fn) {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(fn);
      } else {
        setTimeout(fn, 0);
      }
    }

    function scheduleGlobalRefresh() {
      onDomReady(() => {
        nextFrame(() => {
          nextFrame(() => {
            try {
              if (typeof window !== 'undefined') {
                if (typeof window.debouncedUpdate === 'function') {
                  window.debouncedUpdate();
                } else if (typeof window.update === 'function') {
                  window.update();
                }
                try {
                  window.dispatchEvent(new Event('resize'));
                } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
              }
            } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
          });
        });
      });
    }

    function dispatchSyntheticValueEvent(el) {
      if (!el || typeof el.dispatchEvent !== 'function') return;
      const tag = (el.tagName || '').toUpperCase();
      const type = (el.type || '').toLowerCase();
      const eventName = (tag === 'SELECT' || type === 'checkbox' || type === 'radio')
        ? 'change'
        : 'input';
      try {
        el.dispatchEvent(new Event(eventName, { bubbles: true }));
      } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
    }

    function requestRefreshAfterRestore() {
      if (!restoredValueElements.length) return;
      const seen = new Set();
      const uniqueElements = restoredValueElements.filter((el) => {
        if (!el || seen.has(el)) return false;
        seen.add(el);
        return true;
      });
      if (!uniqueElements.length) return;

      onDomReady(() => {
        nextFrame(() => {
          nextFrame(() => {
            let prevPersistRestoring = false;
            let prevIntakeReset = false;
            try {
              if (typeof window !== 'undefined') {
                prevPersistRestoring = !!window.__vildaPersistRestoring;
                prevIntakeReset = !!window.__vildaSuspendIntakeUserReset;
                window.__vildaPersistRestoring = true;
                window.__vildaSuspendIntakeUserReset = true;
              }
            } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }

            try {
              uniqueElements.forEach(dispatchSyntheticValueEvent);
              if (typeof window !== 'undefined') {
                if (typeof window.debouncedUpdate === 'function') {
                  window.debouncedUpdate();
                } else if (typeof window.update === 'function') {
                  window.update();
                }
                try {
                  window.dispatchEvent(new Event('resize'));
                } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
              }
            } finally {
              try {
                if (typeof window !== 'undefined') {
                  window.__vildaPersistRestoring = prevPersistRestoring;
                  window.__vildaSuspendIntakeUserReset = prevIntakeReset;
                }
              } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
            }
          });
        });
      });
    }

    /**
     * Apply the stored values to all registered fields.
     *
     * Dla większości pól (imię, wiek, wzrost, masa) wpisujemy wartość z
     * localStorage tylko wtedy, gdy pole jest puste – żeby nie nadpisywać
     * danych wczytanych z pliku JSON.
     *
     * Dla pola „płeć” robimy wyjątek:
     *  - jeżeli w localStorage jest zapisany sex, zawsze go wstawiamy
     *    (nawet jeśli <select> ma domyślną wartość „Mężczyzna”),
     *  - jeżeli jest ustawiona flaga stored.sexLocked, dodatkowo
     *    blokujemy edycję selecta na wszystkich podstronach.
     *
     * Po wstawieniu wartości emitujemy kontrolowane zdarzenia input/change i
     * wymuszamy jedno globalne przeliczenie. Dzięki temu wyniki i elementy UI
     * zależne od wartości pól nie czekają na ręczne odświeżenie strony.
     */
    fields.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const storedValue = stored[key];

      // 🔹 Specjalna obsługa dla imienia/nazwiska
      if (key === 'name') {
        // Jeżeli mamy zapisaną wartość imienia – zawsze ją wpisujemy
        // (zarówno dla #name jak i #fullName).
        if (storedValue !== undefined && storedValue !== null && storedValue !== '') {
          const previousValue = el.value;
          try {
            el.value = String(storedValue);
            markRestoredValue(el, previousValue);
          } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
        }

        // Jeżeli flaga nameLocked jest ustawiona, pole ma być zablokowane
        // na wszystkich podstronach, dopóki nie zaczniemy nowej sesji
        // (czyli np. nie klikniemy „Wyczyść wszystkie dane/pola”).
        if (stored.nameLocked) {
          try { el.disabled = true; } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
        } else {
          // W nowej sesji upewnij się, że pole jest z powrotem edytowalne
          try { el.disabled = false; } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
        }
        return; // reszta logiki nie dotyczy pola imienia
      }

      // 🔹 Specjalna obsługa dla płci (jak było)
      if (key === 'sex') {
        if (storedValue !== undefined && storedValue !== null && storedValue !== '') {
          const previousValue = el.value;
          try {
            el.value = String(storedValue);
            markRestoredValue(el, previousValue);
          } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
        }
        if (stored.sexLocked) {
          try { el.disabled = true; } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
        } else {
          try { el.disabled = false; } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
        }
        return;
      }

      // Standardowa ścieżka dla pozostałych pól – tylko gdy pole jest puste
      const hasValue = el.value !== '' && el.value !== undefined && el.value !== null;
      if (!hasValue && storedValue !== undefined && storedValue !== null && storedValue !== '') {
        const previousValue = el.value;
        try {
          el.value = String(storedValue);
          markRestoredValue(el, previousValue);
        } catch (error) { logUserDataWarn('Zignorowany błąd pomocniczy w synchronizacji danych użytkownika', error); }
      }
    });

    requestRefreshAfterRestore();

    /**
     * Read current values from form and persist them. This function is
     * invoked on both `input` and `change` events to capture both typing
     * and selection changes. It preserves unrelated keys in the stored
     * object, allowing future extensions without losing data.
     */
    function updateFromFields() {
      if (isPersistenceWriteSuppressed()) return;
      // Start with the last stored state to retain unknown keys
      const current = loadUserData();
      fields.forEach(({ id, key }) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = el.value;
        // For number inputs with step attributes browsers return empty
        // strings when nothing is entered; keep them as empty strings so
        // that presence/absence can be detected on next load.
        current[key] = val;
      });
      saveUserData(current);
    }

    // Attach listeners to all fields. Use both ‘input’ and ‘change’ to
    // ensure all interaction types (typing, paste, selecting from dropdown)
    // trigger updates. The listeners are attached in capturing phase by
    // default (false) to avoid interference with other handlers.
    fields.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', updateFromFields);
      el.addEventListener('change', updateFromFields);
    });

    /**
     * Clears the stored user data. Called when the user clicks a
     * "clear all" button in any of the forms. This removes the
     * shared user-state entry through VildaPersistence so that fields will not
     * be repopulated on subsequent page loads.
     */
    function clearStoredUserData() {
      try {
        const persistence = getPersistence();
        if (persistence && typeof persistence.clearUserState === 'function') {
          persistence.clearUserState({ includeSessions: true, source: 'userData.clearStoredUserData', durationMs: 2500 });
        } else {
          markPersistenceClearFallback(2500);
          dispatchUserStateClearFallback('userData.clearStoredUserData');
        }
      } catch (error) {
        logUserDataError('Nie udało się wyczyścić danych użytkownika przez adapter persistence', error);
        markPersistenceClearFallback(2500);
        dispatchUserStateClearFallback('userData.clearStoredUserData');
      }
      // Wyczyść od razu widoczne pola i ponownie je odblokuj.
      // Wyjątek: pole płci powinno wracać do domyślnej wartości "M",
      // bo reszta aplikacji traktuje ją jako stan startowy po pełnym resecie.
      // Ustawiamy też selectedIndex, aby native <select> nie pozostał
      // wizualnie pusty, jeśli wcześniej dostał wartość spoza listy opcji.
      fields.forEach(({ id, key }) => {
        const el = document.getElementById(id);
        if (el) {
          try {
            el.disabled = false;
            if (key === 'sex') {
              el.value = 'M';
              if (typeof el.selectedIndex === 'number') {
                el.selectedIndex = 0;
              }
            } else {
              el.value = '';
            }
          } catch (error) {
            logUserDataWarn('Nie udało się wyczyścić widocznego pola danych użytkownika', error, { id, key });
          }
        }
      });
      scheduleGlobalRefresh();
    }
    // Attach clear handlers to known clear buttons if they exist.  Include
    // additional buttons (e.g. advClearBtn) to support clearing from
    // advanced modules.  When any of these buttons is clicked the stored
    // data and field values will be cleared.
    ['clearAllDataBtn', 'clearBtn'].forEach((btnId) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', clearStoredUserData);
      }
    });
  }

  // Register the initialization function once the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUserData);
  } else {
    initUserData();
  }
})();
