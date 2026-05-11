/**
 * vilda_session_bridge.js v1
 *
 * Jedno źródło prawdy dla CAŁEJ aplikacji:
 *   - stan logowania (nawet na stronach bez VildaVault)
 *   - dane aktualnego pacjenta (formularz → sharedUserData)
 *   - teksty tooltipów (jeden plik do edycji)
 *   - lazy-loading VildaVault + VildaAuthUI w tle
 *
 * Ładowany na KAŻDEJ stronie, tuż po vilda_persistence_adapter.js.
 * Eksportuje globalny obiekt window.VildaSession.
 *
 * ──────────────────────────────────────────────────────────────
 * TOOLTIPS – jak edytować:
 *   Zmień tekst w obiekcie TOOLTIPS poniżej.
 *   Nie ruszaj kluczy — vilda_chrome.js i custom-fixes.js
 *   odwołują się do nich przez VildaSession.TOOLTIPS.*.
 * ──────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  // ── Klucz sessionStorage identyczny z vilda_vault.js ──────────
  var VAULT_SESSION_KEY = 'vilda-vault-session-v2';

  // ── Wersje zależności auth – aktualizuj razem z HTML ──────────
  var AUTH_DEPS = [
    { type: 'css',    src: 'vilda_auth_ui.css?v=17',  ready: function () { return false; } },
    { type: 'script', src: 'vilda_crypto.js?v=4',     ready: function () { return !!global.VildaCrypto; } },
    { type: 'script', src: 'vilda_vault.js?v=11',     ready: function () { return !!global.VildaVault; } },
    { type: 'script', src: 'vilda_auth_ui.js?v=47',   ready: function () { return !!global.VildaAuthUI; } }
  ];

  // ════════════════════════════════════════════════════════════════
  // TOOLTIPS — centralne repozytorium wszystkich stringów.
  // ════════════════════════════════════════════════════════════════
  var TOOLTIPS = {
    saveData: {
      notLoggedIn:  'Zapisywanie danych jest zarezerwowane dla zalogowanych użytkowników.',
      missingFields:'Aby zapisać dane, wprowadź imię, wiek, wzrost i wagę.',
      missingName:  'Podaj „Imię i Nazwisko" przed zapisem.',
      notOnThisPage:'Zapisywanie danych jest dostępne na stronie głównej pacjenta.',
      saveError:    'Nie udało się zapisać pacjenta.'           // uzupełniany dynamicznie przez saveUserData
    },
    patients: {
      notLoggedIn:  'Zaloguj się, aby przeglądać bazę pacjentów.',
      unavailable:  'Moduł pacjentów niedostępny — odśwież stronę.'
    }
  };

  // ════════════════════════════════════════════════════════════════
  // AUTH STATE
  // ════════════════════════════════════════════════════════════════

  /**
   * Szybka odpowiedź bez VildaVault — odczyt surowego klucza z sessionStorage.
   * Wystarczy do natychmiastowego decydowania o stanie UI, zanim vault się
   * załaduje. VildaVault sam weryfikuje kryptograficzną poprawność klucza.
   */
  function hasSessionKey() {
    try {
      return !!(global.sessionStorage && global.sessionStorage.getItem(VAULT_SESSION_KEY));
    } catch (_) { return false; }
  }

  /** true gdy użytkownik jest zalogowany (nie gość, vault odblokowany). */
  function isLoggedIn() {
    // Tryb gościa zawsze = niezalogowany.
    var auth = global.VildaAuthUI;
    if (auth && typeof auth.isGuestMode === 'function' && auth.isGuestMode()) return false;
    // Preferujemy VildaVault gdy dostępny (autorytatywny).
    var v = global.VildaVault;
    if (v && typeof v.isUnlocked === 'function') return v.isUnlocked();
    // Fallback: sessionStorage (vault jeszcze się nie załadował).
    return hasSessionKey();
  }

  function isGuestMode() {
    var auth = global.VildaAuthUI;
    return !!(auth && typeof auth.isGuestMode === 'function' && auth.isGuestMode());
  }

  /** Zwraca obiekt {label, ...} zalogowanego użytkownika lub null. */
  function getCurrentUser() {
    var v = global.VildaVault;
    if (v && typeof v.getCurrentUser === 'function') return v.getCurrentUser();
    return null;
  }

  // ════════════════════════════════════════════════════════════════
  // PATIENT DATA
  // ════════════════════════════════════════════════════════════════

  function _fieldVal(id) {
    var el = global.document && global.document.getElementById(id);
    return (el && el.value) ? el.value : '';
  }

  function _fieldInt(id) {
    var v = _fieldVal(id);
    var n = parseInt(v, 10);
    return isFinite(n) ? n : null;
  }

  /**
   * Zwraca dane aktualnego pacjenta.
   * Źródło 1: pola formularza (index, docpro, klirens).
   * Źródło 2: VildaPersistence.sharedUserData (każda strona).
   * Zwraca null gdy brak danych.
   */
  function getPatient() {
    // — Źródło 1: pola formularza —
    var nameFields = ['name', 'fullName', 'advName', 'basicGrowthName'];
    var name = '';
    for (var i = 0; i < nameFields.length; i++) {
      var v = _fieldVal(nameFields[i]);
      if (v && v.trim()) { name = v.trim(); break; }
    }
    if (name) {
      return {
        name:      name,
        age:       _fieldInt('age'),
        ageMonths: _fieldInt('ageMonths'),
        sex:       _fieldVal('sex'),
        source:    'form'
      };
    }

    // — Źródło 2: sharedUserData (localStorage, dostępne na każdej stronie) —
    var persist = global.VildaPersistence;
    if (persist && typeof persist.readShared === 'function') {
      try {
        var shared = persist.readShared({ ensurePersist: false });
        var sharedName = (shared && (shared.name || shared.fullName)) || '';
        if (sharedName && sharedName.trim()) {
          return {
            name:      sharedName.trim(),
            age:       (shared.age != null) ? parseInt(shared.age, 10) : null,
            ageMonths: (shared.ageMonths != null) ? parseInt(shared.ageMonths, 10) : null,
            sex:       shared.sex || '',
            source:    'shared'
          };
        }
      } catch (_) {}
    }
    return null;
  }

  // ════════════════════════════════════════════════════════════════
  // KONTEKST PRZYCISKÓW (stan + tooltip)
  // ════════════════════════════════════════════════════════════════

  /**
   * Zwraca { enabled: bool, tip: string|null } dla przycisku „Zapisz dane".
   * Używane przez custom-fixes.js i syncSidebarMenuState().
   */
  function getSaveButtonState() {
    if (!isLoggedIn()) {
      return { enabled: false, tip: TOOLTIPS.saveData.notLoggedIn };
    }
    // Strona musi mieć formularz z wymaganymi polami.
    var doc = global.document;
    var hasForm = !!(doc && (doc.getElementById('name') || doc.getElementById('fullName')));
    if (!hasForm) {
      return { enabled: false, tip: TOOLTIPS.saveData.notOnThisPage };
    }
    // Walidacja wymaganych pól (duplikuje logikę saveUserData — tylko dla stanu UI).
    var hasName   = !!(_fieldVal('name') || _fieldVal('fullName')).trim();
    var hasAge    = !!_fieldVal('age');
    var hasWeight = !!_fieldVal('weight');
    var hasHeight = !!_fieldVal('height');
    if (!hasName) {
      return { enabled: false, tip: TOOLTIPS.saveData.missingName };
    }
    if (!hasAge || !hasWeight || !hasHeight) {
      return { enabled: false, tip: TOOLTIPS.saveData.missingFields };
    }
    return { enabled: true, tip: null };
  }

  /**
   * Zwraca { enabled: bool, tip: string|null } dla przycisku „Pacjenci".
   */
  function getPatientsButtonState() {
    if (!isLoggedIn()) {
      return { enabled: false, tip: TOOLTIPS.patients.notLoggedIn };
    }
    return { enabled: true, tip: null };
  }

  // ════════════════════════════════════════════════════════════════
  // ZDARZENIA
  // ════════════════════════════════════════════════════════════════

  function fireEvent(name, detail) {
    var doc = global.document;
    if (!doc) return;
    try {
      doc.dispatchEvent(new CustomEvent(name, { bubbles: false, detail: detail || {} }));
    } catch (_) {}
  }

  /** Odpal 'vilda:session-changed' — powiadamia vilda_chrome.js o zmianie stanu. */
  function notifySessionChanged() {
    fireEvent('vilda:session-changed', {
      loggedIn: isLoggedIn(),
      patient:  getPatient()
    });
  }

  // ════════════════════════════════════════════════════════════════
  // LAZY-LOAD AUTH
  // ════════════════════════════════════════════════════════════════

  var _authLoadPromise = null;

  function _loadOne(dep) {
    var doc = global.document;
    return new Promise(function (resolve, reject) {
      try {
        if (dep.ready && dep.ready()) { resolve(); return; }
        var base = dep.src.split('?')[0];
        var sel  = dep.type === 'css'
          ? 'link[rel="stylesheet"][href*="' + base + '"]'
          : 'script[src*="' + base + '"]';
        var existing = doc && doc.querySelector(sel);
        if (existing) {
          if (dep.ready && dep.ready()) { resolve(); return; }
          existing.addEventListener('load',  resolve, { once: true });
          existing.addEventListener('error', reject,  { once: true });
          return;
        }
        var el;
        if (dep.type === 'css') {
          el = doc.createElement('link');
          el.rel  = 'stylesheet';
          el.href = dep.src;
        } else {
          el = doc.createElement('script');
          el.src   = dep.src;
          el.async = false; // zachowaj kolejność
        }
        el.addEventListener('load',  resolve, { once: true });
        el.addEventListener('error', reject,  { once: true });
        doc.head.appendChild(el);
      } catch (e) { reject(e); }
    });
  }

  /**
   * Ładuje VildaCrypto → VildaVault → VildaAuthUI jeśli jeszcze nie ma.
   * Zwraca Promise. Idempotentna — drugi call zwraca ten sam Promise.
   */
  function ensureAuthLoaded() {
    if (global.VildaVault && global.VildaAuthUI) return Promise.resolve();
    if (_authLoadPromise) return _authLoadPromise;
    _authLoadPromise = AUTH_DEPS.reduce(function (chain, dep) {
      return chain.then(function () { return _loadOne(dep); });
    }, Promise.resolve()).then(function () {
      // Auth gotowy — powiadom chrome.js żeby odświeżył chipy.
      fireEvent('vilda:auth-loaded');
      notifySessionChanged();
    }).catch(function () {
      _authLoadPromise = null; // pozwól na ponowną próbę po błędzie sieciowym
    });
    return _authLoadPromise;
  }

  // ════════════════════════════════════════════════════════════════
  // AUTO-LOAD AUTH NA "LEKKICH" STRONACH
  // Jeśli strona nie ładuje statycznie VildaVault, ale w sessionStorage
  // jest klucz sesji (= użytkownik był zalogowany na innej podstronie
  // tego samego taba), ładujemy auth w tle, żeby header mógł pokazać
  // właściwy stan.  Bez aktywnej sesji nie robimy żadnych dodatkowych
  // requestów — nie ma potrzeby.
  // ════════════════════════════════════════════════════════════════

  function _autoLoadIfNeeded() {
    if (global.VildaVault) return; // statycznie załadowany — nic do roboty
    if (!hasSessionKey()) return;  // brak sesji — niezalogowany, oszczędzamy requesty
    ensureAuthLoaded();
  }

  var doc = global.document;
  if (doc) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', _autoLoadIfNeeded, { once: true });
    } else {
      _autoLoadIfNeeded();
    }
  }

  // ════════════════════════════════════════════════════════════════
  // EKSPORT
  // ════════════════════════════════════════════════════════════════

  global.VildaSession = {
    VERSION: 1,

    // Konfig tooltipów (edytuj tutaj, nie w custom-fixes.js)
    TOOLTIPS: TOOLTIPS,

    // Stan auth
    isLoggedIn:       isLoggedIn,
    isGuestMode:      isGuestMode,
    getCurrentUser:   getCurrentUser,
    hasSessionKey:    hasSessionKey,

    // Dane pacjenta
    getPatient:       getPatient,

    // Stany przycisków
    getSaveButtonState:     getSaveButtonState,
    getPatientsButtonState: getPatientsButtonState,

    // Zdarzenia
    notifySessionChanged: notifySessionChanged,
    fireEvent:            fireEvent,

    // Auth loading
    ensureAuthLoaded: ensureAuthLoaded
  };

})(typeof window !== 'undefined' ? window : this);
