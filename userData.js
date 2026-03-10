// userData.js – shared user data persistence across pages
// This script synchronizes basic user information (name, age, weight, height, sex,
// optional age in months) across different pages of the Waga i wzrost site.
// When the user enters these values on any page, they are saved in
// localStorage under the key `sharedUserData`. On page load the stored values
// are applied to matching form fields if they exist. This ensures the
// information does not have to be re‑entered on each page.

(function() {
  /**
   * Load the persisted user data from localStorage. Returns an empty object
   * if nothing has been saved or if parsing fails.
   * @returns {Object}
   */
  function loadUserData() {
    try {
      const raw = localStorage.getItem('sharedUserData');
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (e) {
      // If parsing fails return an empty object to avoid breaking the page
      return {};
    }
  }

  /**
   * Save the user data back to localStorage. If JSON.stringify throws
   * (which is unlikely for plain objects) the catch will silently ignore
   * the error to avoid interrupting user interactions.
   * @param {Object} data
   */
  function saveUserData(data) {
    try {
      localStorage.setItem('sharedUserData', JSON.stringify(data));
    } catch (e) {
      // Silently ignore storage errors (e.g. quota exceeded)
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
    // zachowywane w localStorage i automatycznie wstawiane po przejściu
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
              try {
                el.value = storedValue;
              } catch (_) {}
            }
        
            // Jeżeli flaga nameLocked jest ustawiona, pole ma być zablokowane
            // na wszystkich podstronach, dopóki nie zaczniemy nowej sesji
            // (czyli np. nie klikniemy „Wyczyść wszystkie dane/pola”).
            if (stored.nameLocked) {
              try { el.disabled = true; } catch (_) {}
            } else {
              // W nowej sesji upewnij się, że pole jest z powrotem edytowalne
              try { el.disabled = false; } catch (_) {}
            }
            return; // reszta logiki nie dotyczy pola imienia
          }
        
          // 🔹 Specjalna obsługa dla płci (jak było)
          if (key === 'sex') {
            if (storedValue !== undefined && storedValue !== null && storedValue !== '') {
              try {
                el.value = storedValue;
              } catch (_) {}
            }
            if (stored.sexLocked) {
              try { el.disabled = true; } catch (_) {}
            } else {
              try { el.disabled = false; } catch (_) {}
            }
            return;
          }
        
          // Standardowa ścieżka dla pozostałych pól – tylko gdy pole jest puste
          const hasValue = el.value !== '' && el.value !== undefined && el.value !== null;
          if (!hasValue && storedValue !== undefined && storedValue !== null && storedValue !== '') {
            try {
              el.value = storedValue;
            } catch (_) {}
          }
        });

    /**
     * Read current values from form and persist them. This function is
     * invoked on both `input` and `change` events to capture both typing
     * and selection changes. It preserves unrelated keys in the stored
     * object, allowing future extensions without losing data.
     */
    function updateFromFields() {
      // Start with the last stored state to retain unknown keys
      const current = loadUserData();
      fields.forEach(({ id, key }) => {
        const el = document.getElementById(id);
        if (!el) return;
        let val = el.value;
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
     * sharedUserData entry from localStorage so that fields will not
     * be repopulated on subsequent page loads.
     */
    function clearStoredUserData() {
      try {
        // Usuń zapisane dane wspólne – dzięki temu przy kolejnym
        // załadowaniu strony pola nie zostaną automatycznie uzupełnione.
        localStorage.removeItem('sharedUserData');
      } catch (_) {
        // Ignore errors (e.g. storage quota issues)
      }
      // Wyczyść od razu widoczne pola i ponownie je odblokuj
      fields.forEach(({ id }) => {
        const el = document.getElementById(id);
        if (el) {
          try {
            el.value = '';
            el.disabled = false;
          } catch (_) {
            // Ignore assignment errors on unsupported field types
          }
        }
      });
    }
    // Attach clear handlers to known clear buttons if they exist.  Include
    // additional buttons (e.g. advClearBtn) to support clearing from
    // advanced modules.  When any of these buttons is clicked the stored
    // data and field values will be cleared.
    ['clearAllDataBtn', 'clearBtn', 'advClearBtn'].forEach((btnId) => {
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