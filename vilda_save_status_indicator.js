/**
 * vilda_save_status_indicator.js — Wskaźnik statusu zapisu danych pacjenta.
 *
 * Wersja: 0.7 (pivot na chrome-patient-chip — bez własnego DOM)
 *
 * Cel: pokazać użytkownikowi, czy aktualny stan formularza odpowiada ostatniemu
 * zapisanemu snapshotowi w vault. Zamiast wstawiać własny pill, kolorujemy
 * istniejący #vildaPatientChip w chrome-strip (już mountowany przez vilda_chrome.js).
 *
 * Architektura:
 *   • Source of truth dla fingerprintu: window.collectUserData() (zwraca ten sam
 *     obiekt, który trafia do vault.savePatient → snapshot).
 *   • Sygnał „zapisane": VildaVault.onPatientSaved (gotowy event-hook).
 *   • Sygnał „zmiana": listenery input/change na document (debounced 250 ms).
 *   • Sygnał lifecycle: VildaVault.onUnlock / onLock.
 *   • Eventy: vilda:patient-loaded (z auth_ui), vilda:json-imported (z data_import_export).
 *
 * Rendering: render() ustawia klasy `vilda-save-state--<state>` na #vildaPatientChip.
 * CSS w vilda_save_status_indicator.css definiuje kolory tła chip-icon per stan.
 * Tooltip: natywny `title` atrybut na chipie (krótka wskazówka).
 *
 * Test hooks (dla smoke testu): _onFormChange, _onUnlock, _onLock,
 * _onPatientSaved, _onPatientLoaded, _onJsonImported, _onSaveClicked,
 * _computeFormFingerprint, _setReferenceFingerprint, _forceTransition,
 * _relativeTime, _buildTitleAttr, _setLastSavedAtISO, _setLastSnapshotCount,
 * _setLastPatientName, _setDirtyStartedAt, _setLastError, STATES.
 *
 * Debug API: window.__vildaSaveStatusDebug() — snapshot stanu do DevTools.
 */
(function (global) {
  'use strict';

  // ── Stany ──────────────────────────────────────────────────────
  var STATES = {
    HIDDEN: 'hidden',
    NEW_PATIENT: 'new_patient',
    SAVED: 'saved',
    DIRTY: 'dirty',
    SAVING: 'saving',
    ERROR: 'error'
  };

  var ALL_STATE_CLASSES = [
    'vilda-save-state--hidden',
    'vilda-save-state--new_patient',
    'vilda-save-state--saved',
    'vilda-save-state--dirty',
    'vilda-save-state--saving',
    'vilda-save-state--error'
  ];

  // ── Stan modułu ────────────────────────────────────────────────
  var _state = STATES.HIDDEN;
  var _referenceFingerprint = null;
  var _lastSavedAtISO = null;
  var _lastSnapshotCount = null;
  var _lastPatientName = null;
  var _dirtyStartedAt = null;
  var _lastError = null;
  var _refreshTickInterval = null;
  var _debounceTimer = null;
  var _vaultUnlocked = false;

  // ── Pure functions ─────────────────────────────────────────────

  function computeFormFingerprint() {
    if (typeof global.collectUserData !== 'function') return null;
    try {
      var data = global.collectUserData({ source: 'save-status-indicator' });
      if (!data) return null;
      delete data.timestampISO;
      return JSON.stringify(data);
    } catch (_) { return null; }
  }

  /**
   * Heurystyka „formularz pusty" — wystarczy imię ALBO pomiar.
   */
  function isFormMostlyEmpty() {
    if (typeof global.collectUserData !== 'function') return true;
    try {
      var data = global.collectUserData({ source: 'save-status-indicator-empty-check' });
      if (!data) return true;
      var name = data.name && String(data.name).trim();
      var u = data.user || {};
      var hasName = !!name;
      var hasMeasure = !!(u.weight || u.height || (u.age != null && u.age !== ''));
      return !(hasName || hasMeasure);
    } catch (_) { return true; }
  }

  function relativeTime(iso) {
    if (!iso) return '';
    try {
      var t = new Date(iso).getTime();
      if (!isFinite(t)) return '';
      var diff = Date.now() - t;
      var min = Math.round(diff / 60000);
      if (min < 1) return 'przed chwilą';
      if (min < 60) return min + ' min temu';
      var hours = Math.round(min / 60);
      if (hours < 24) return hours + ' godz. temu';
      var days = Math.round(hours / 24);
      if (days < 7) return days + (days === 1 ? ' dzień temu' : ' dni temu');
      return new Date(iso).toLocaleDateString('pl-PL');
    } catch (_) { return ''; }
  }

  /**
   * Buduje krótki natywny title (jedna linia, plaintext — bez HTML).
   * Wyświetlany na hover ikony pacjenta w chrome-strip.
   */
  function buildTitleAttr(state) {
    if (state === STATES.SAVED) {
      var parts = ['✓ Dane pacjenta zapisane'];
      if (_lastSavedAtISO) parts.push(relativeTime(_lastSavedAtISO));
      if (_lastSnapshotCount) parts.push('Snapshot #' + _lastSnapshotCount);
      return parts.join(' · ');
    }
    if (state === STATES.DIRTY) {
      var dirtyParts = ['● Niezapisane zmiany'];
      if (_dirtyStartedAt) {
        var rel = relativeTime(new Date(_dirtyStartedAt).toISOString()).replace(' temu', '');
        dirtyParts.push('od ' + rel);
      }
      dirtyParts.push('Kliknij „Zapisz dane" w menu po lewej');
      return dirtyParts.join(' · ');
    }
    if (state === STATES.SAVING) return '⟳ Zapisywanie snapshotu…';
    if (state === STATES.ERROR) {
      return '⚠ Błąd ostatniego zapisu' + (_lastError ? ': ' + _lastError : '') + ' — kliknij Zapisz, by ponowić';
    }
    if (state === STATES.NEW_PATIENT) {
      return '＋ Nowy pacjent — kliknij „Zapisz dane", aby utworzyć kartę pacjenta';
    }
    return '';
  }

  // ── State transitions ──────────────────────────────────────────

  function transition(newState) {
    if (newState === _state) return;
    var oldState = _state;
    _state = newState;
    if (newState === STATES.DIRTY) _dirtyStartedAt = Date.now();
    if (newState === STATES.SAVED) _dirtyStartedAt = null;
    if (newState === STATES.HIDDEN) _dirtyStartedAt = null;
    try {
      if (global.console && typeof global.console.debug === 'function') {
        global.console.debug('[vilda-save-status] ' + oldState + ' → ' + newState);
      }
    } catch (_) {}
    render();
  }

  // ── Event handlers ─────────────────────────────────────────────

  function onFormChange() {
    if (_state === STATES.SAVING) return;
    if (global.VildaGuestMode === true) return;
    if (!_vaultUnlocked) return;
    if (_state === STATES.HIDDEN) {
      if (!isFormMostlyEmpty()) {
        _referenceFingerprint = null;
        transition(STATES.NEW_PATIENT);
      }
      return;
    }
    if (_referenceFingerprint == null) {
      if (isFormMostlyEmpty()) {
        transition(STATES.HIDDEN);
      } else if (_state !== STATES.NEW_PATIENT) {
        transition(STATES.NEW_PATIENT);
      }
      return;
    }
    var current = computeFormFingerprint();
    if (current === null) return;
    if (current === _referenceFingerprint) {
      if (_state !== STATES.SAVED) transition(STATES.SAVED);
    } else {
      if (_state !== STATES.DIRTY) transition(STATES.DIRTY);
    }
  }

  function debouncedOnFormChange() {
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(onFormChange, 250);
  }

  function onUnlock() {
    _vaultUnlocked = true;
    if (global.VildaGuestMode === true) { transition(STATES.HIDDEN); return; }
    if (isFormMostlyEmpty()) {
      _referenceFingerprint = null;
      transition(STATES.HIDDEN);
      return;
    }
    _referenceFingerprint = computeFormFingerprint();
    transition(STATES.SAVED);
  }

  function onLock() {
    _vaultUnlocked = false;
    _referenceFingerprint = null;
    _lastSavedAtISO = null;
    _lastSnapshotCount = null;
    _lastPatientName = null;
    _dirtyStartedAt = null;
    _lastError = null;
    transition(STATES.HIDDEN);
  }

  function onPatientSavedHandler(info) {
    _lastSavedAtISO = info && info.savedAtISO || null;
    _lastSnapshotCount = info && info.snapshotCount || null;
    _lastPatientName = (info && info.header && info.header.name) || _lastPatientName;
    _lastError = null;
    _referenceFingerprint = computeFormFingerprint();
    transition(STATES.SAVED);
  }

  function onPatientLoadedHandler(info) {
    _lastSavedAtISO = (info && info.savedAtISO) || null;
    _lastSnapshotCount = (info && info.snapshotCount) || null;
    _lastPatientName = (info && info.name) || null;
    _lastError = null;
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    setTimeout(function () {
      _referenceFingerprint = computeFormFingerprint();
      transition(STATES.SAVED);
    }, 150);
  }

  function onJsonImportedHandler(info) {
    _lastSavedAtISO = null;
    _lastSnapshotCount = null;
    _lastPatientName = (info && info.name) || null;
    _lastError = null;
    _referenceFingerprint = null;
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    setTimeout(function () {
      transition(STATES.NEW_PATIENT);
    }, 150);
  }

  function onSaveClicked() {
    if (_state === STATES.DIRTY || _state === STATES.NEW_PATIENT || _state === STATES.ERROR) {
      transition(STATES.SAVING);
    }
  }

  // ── Render — modyfikuje istniejący #vildaPatientChip ──────────

  /**
   * Znajduje #vildaPatientChip i aktualizuje klasy + title.
   * Zachowuje istniejące klasy chrome (is-empty/has-patient) — vilda_chrome.js
   * dalej nimi zarządza (widoczność tekstu, ikony bazowej). My nadpisujemy
   * tylko KOLOR przez vilda-save-state--<state> z większą specificity w CSS.
   */
  function render() {
    // Zachowaj inspect API (dla DevTools)
    try {
      global.__vildaSaveStatusState = {
        state: _state,
        lastSavedAtISO: _lastSavedAtISO,
        lastSnapshotCount: _lastSnapshotCount,
        lastPatientName: _lastPatientName,
        dirtyStartedAt: _dirtyStartedAt,
        lastError: _lastError,
        relativeTimeStr: _lastSavedAtISO ? relativeTime(_lastSavedAtISO) : null
      };
    } catch (_) {}

    if (typeof global.document === 'undefined') return; // headless

    var chip = global.document.getElementById('vildaPatientChip');
    if (!chip) return; // chrome-strip jeszcze nie wyrenderowany — retry przy następnej transition

    // Usuń wszystkie nasze klasy stanu, ustaw nową
    for (var i = 0; i < ALL_STATE_CLASSES.length; i++) {
      chip.classList.remove(ALL_STATE_CLASSES[i]);
    }
    if (_state && _state !== STATES.HIDDEN) {
      chip.classList.add('vilda-save-state--' + _state);
    }

    // Title (krótki tooltip natywny — pokazuje się obok ikony pacjenta na hover)
    var title = buildTitleAttr(_state);
    if (title) {
      chip.setAttribute('title', title);
    } else {
      chip.removeAttribute('title');
    }
  }

  // ── Listeners ─────────────────────────────────────────────────

  function attachVaultListeners() {
    var V = global.VildaVault;
    if (!V) return;
    if (typeof V.onUnlock === 'function') V.onUnlock(function () { onUnlock(); });
    if (typeof V.onLock === 'function') V.onLock(function () { onLock(); });
    if (typeof V.onPatientSaved === 'function') V.onPatientSaved(function (info) { onPatientSavedHandler(info); });
  }

  function attachDomListeners() {
    if (typeof global.document === 'undefined') return;
    global.document.addEventListener('input', debouncedOnFormChange, true);
    global.document.addEventListener('change', debouncedOnFormChange, true);
    // Save button click → SAVING (chip pokazuje spinner)
    ['saveDataBtn', 'saveDataBtnSidebar'].forEach(function (id) {
      var btn = global.document.getElementById(id);
      if (btn) btn.addEventListener('click', onSaveClicked);
    });
    // Eventy z Faz 4-5
    global.document.addEventListener('vilda:patient-loaded', function (ev) {
      try { onPatientLoadedHandler((ev && ev.detail) || {}); } catch (_) {}
    });
    global.document.addEventListener('vilda:json-imported', function (ev) {
      try { onJsonImportedHandler((ev && ev.detail) || {}); } catch (_) {}
    });
    // Save button może być wyrenderowany później (vilda_chrome wstrzykuje sidebar).
    // Periodically retry przez 5 s żeby podpiąć handler.
    var retries = 0;
    var saveRetryTimer = setInterval(function () {
      var bound = false;
      ['saveDataBtn', 'saveDataBtnSidebar'].forEach(function (id) {
        var btn = global.document.getElementById(id);
        if (btn && !btn.__vildaSSIBound) {
          btn.addEventListener('click', onSaveClicked);
          btn.__vildaSSIBound = true;
          bound = true;
        }
      });
      retries++;
      if (bound || retries > 50) {
        clearInterval(saveRetryTimer);
      }
    }, 100);
  }

  function startRefreshTick() {
    if (_refreshTickInterval) return;
    _refreshTickInterval = setInterval(function () {
      if (_state === STATES.SAVED || _state === STATES.DIRTY) render();
    }, 30000);
  }

  // ── Init ──────────────────────────────────────────────────────

  function init() {
    if (typeof global.document === 'undefined') {
      attachVaultListeners();
      return;
    }
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init, { once: true });
      return;
    }
    attachVaultListeners();
    attachDomListeners();
    startRefreshTick();
    var V = global.VildaVault;
    if (V && typeof V.isUnlocked === 'function' && V.isUnlocked()) {
      onUnlock();
    }
    // Fallback dla async tryRestoreSession — przy window.load synchronizuj stan
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('load', function () {
        try {
          var V2 = global.VildaVault;
          if (V2 && typeof V2.isUnlocked === 'function' && V2.isUnlocked() && !_vaultUnlocked) {
            onUnlock();
          } else {
            // Spróbuj re-render — chrome-strip może być już dostępny
            render();
          }
        } catch (_) {}
      }, { once: true });
    }
  }

  // ── Public API ────────────────────────────────────────────────

  global.VildaSaveStatusIndicator = {
    STATES: STATES,
    getState: function () { return _state; },
    getReferenceFingerprint: function () { return _referenceFingerprint; },
    getLastSavedAtISO: function () { return _lastSavedAtISO; },
    getLastSnapshotCount: function () { return _lastSnapshotCount; },
    getLastPatientName: function () { return _lastPatientName; },
    // Test hooks
    _onFormChange: onFormChange,
    _onUnlock: onUnlock,
    _onLock: onLock,
    _onPatientSaved: onPatientSavedHandler,
    _onPatientLoaded: onPatientLoadedHandler,
    _onJsonImported: onJsonImportedHandler,
    _onSaveClicked: onSaveClicked,
    _computeFormFingerprint: computeFormFingerprint,
    _setReferenceFingerprint: function (f) { _referenceFingerprint = f; },
    _forceTransition: function (s) { transition(s); },
    _relativeTime: relativeTime,
    _buildTitleAttr: buildTitleAttr,
    _setLastSavedAtISO: function (iso) { _lastSavedAtISO = iso; },
    _setLastSnapshotCount: function (n) { _lastSnapshotCount = n; },
    _setLastPatientName: function (n) { _lastPatientName = n; },
    _setDirtyStartedAt: function (t) { _dirtyStartedAt = t; },
    _setLastError: function (e) { _lastError = e; }
  };

  // ── DEBUG API (DevTools) ──────────────────────────────────────
  if (typeof global !== 'undefined') {
    global.__vildaSaveStatusDebug = function () {
      var V = global.VildaVault;
      var chip = global.document && global.document.getElementById('vildaPatientChip');
      var info = {
        state: _state,
        vaultUnlocked: !!(V && typeof V.isUnlocked === 'function' && V.isUnlocked()),
        myVaultUnlockedFlag: _vaultUnlocked,
        referenceFingerprint: _referenceFingerprint ? '[' + _referenceFingerprint.length + ' znaków]' : null,
        lastSavedAtISO: _lastSavedAtISO,
        lastSnapshotCount: _lastSnapshotCount,
        lastPatientName: _lastPatientName,
        chipExists: !!chip,
        chipClasses: chip ? chip.className : null,
        chipTitle: chip ? chip.getAttribute('title') : null,
        collectUserDataExists: typeof global.collectUserData,
        formMostlyEmpty: null
      };
      try {
        if (typeof global.collectUserData === 'function') {
          var d = global.collectUserData({ source: 'debug' });
          info.formData = d ? { name: d.name, user: d.user } : null;
          info.formMostlyEmpty = isFormMostlyEmpty();
        }
      } catch (e) { info.formDataError = String(e); }
      console.table(info);
      return info;
    };
  }

  init();
})(typeof window !== 'undefined' ? window : globalThis);
