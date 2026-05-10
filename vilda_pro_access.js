/* ==========================================================================
 * vilda_pro_access.js — abstrakcja dostępu do trybu PRO
 *
 * Krok PRO-0: Warstwa pośrednia między statusem subskrypcji użytkownika
 * a flagą professionalMode w app.js.
 *
 * Architektura:
 *   [VildaVault/VildaSync] → VildaProAccess.hasAccess() → professionalMode
 *
 * Stan bieżący (PRO-0):
 *   hasAccess() zawsze zwraca false — wszyscy użytkownicy mają plan 'free'.
 *   Przełącznik resultsModeToggle jest zablokowany do momentu wdrożenia
 *   subskrypcji (PRO-3+).
 *
 * Przyszłość (PRO-3+):
 *   hasAccess() odczyta subscriptionStatus z VildaVault i zweryfikuje
 *   po stronie Cloudflare Worker (VildaSync). Stripe webhook będzie
 *   aktualizował status subskrypcji w VildaSync KV.
 *
 * Użycie:
 *   window.VildaProAccess.hasAccess()   // → boolean
 *   window.VildaProAccess.getPlan()     // → 'free' | 'pro'
 *   window.VildaProAccess.setPlan(plan, validUntil)  // wywoływane przez VildaVault
 *   window.VildaProAccess.onPlanChange(fn)           // subskrypcja zmian planu
 *
 * ========================================================================== */
(function (global) {
  'use strict';

  if (!global) return;

  // Guard: nie inicjalizuj ponownie jeśli moduł już istnieje
  if (global.VildaProAccess && global.VildaProAccess.__vildaProAccessModule) {
    return;
  }

  var VERSION = '1.0.0';
  var STEP = 'PRO-0';

  // ── Wewnętrzny stan ──────────────────────────────────────────────────────
  // PRO-0: plan hardcoded jako 'free'.
  // PRO-3+: odczytywany z VildaVault.subscriptionStatus po zalogowaniu.

  var _plan = 'free';         // 'free' | 'pro'
  var _validUntil = null;     // null = bezterminowe; ISO date string = data ważności
  var _initialized = false;
  var _listeners = [];

  // ── Główne API ───────────────────────────────────────────────────────────

  /**
   * Czy bieżący użytkownik ma dostęp do trybu PRO?
   *
   * PRO-0: zawsze false.
   * PRO-3+: sprawdza _plan i _validUntil, które są ustawiane przez
   *         VildaVault po weryfikacji subskrypcji w Cloudflare Worker.
   *
   * @returns {boolean}
   */
  function hasAccess() {
    if (_plan !== 'pro') return false;
    if (_validUntil === null) return true; // bezterminowe
    try {
      return new Date(_validUntil) > new Date();
    } catch (_) {
      return false;
    }
  }

  /**
   * Bieżący plan użytkownika.
   * @returns {'free'|'pro'}
   */
  function getPlan() {
    return _plan;
  }

  /**
   * Ustawia plan subskrypcji. Wywoływane przez VildaVault/VildaSync
   * po weryfikacji statusu u Stripe (PRO-3+).
   * W PRO-0 nieużywane — zostawione jako interfejs dla przyszłości.
   *
   * @param {'free'|'pro'} plan
   * @param {string|null} validUntil  ISO date string lub null dla bezterminowego
   */
  function setPlan(plan, validUntil) {
    var prev = _plan;
    _plan = (plan === 'pro') ? 'pro' : 'free';
    _validUntil = (typeof validUntil === 'string' && validUntil) ? validUntil : null;
    if (prev !== _plan) {
      _notifyListeners();
    }
  }

  /**
   * Rejestruje callback wywoływany przy zmianie planu.
   * Callback otrzymuje obiekt: { plan, hasAccess, validUntil }
   *
   * @param {function} fn
   */
  function onPlanChange(fn) {
    if (typeof fn === 'function') {
      _listeners.push(fn);
    }
  }

  // ── Powiadomienia ────────────────────────────────────────────────────────

  function _notifyListeners() {
    var snapshot = _getSnapshot();
    _listeners.forEach(function (fn) {
      try { fn(snapshot); } catch (_) {}
    });
    try {
      global.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: snapshot }));
    } catch (_) {}
  }

  function _getSnapshot() {
    return {
      plan: _plan,
      hasAccess: hasAccess(),
      validUntil: _validUntil,
      step: STEP,
      version: VERSION
    };
  }

  // ── Diagnostyka ──────────────────────────────────────────────────────────

  /**
   * Zwraca snapshot stanu modułu (do logów i debugowania).
   * @returns {object}
   */
  function getSnapshot() {
    return Object.assign(_getSnapshot(), {
      initialized: _initialized,
      listenerCount: _listeners.length
    });
  }

  // ── Inicjalizacja ────────────────────────────────────────────────────────
  // PRO-0: brak zewnętrznego odczytu — plan pozostaje 'free'.
  // PRO-3+: tutaj będzie odczyt z VildaVault i wywołanie Cloudflare Worker.
  //
  //   function init() {
  //     const vault = global.VildaVault;
  //     if (vault && typeof vault.getSubscriptionStatus === 'function') {
  //       const status = vault.getSubscriptionStatus();
  //       if (status && status.plan) setPlan(status.plan, status.validUntil);
  //     }
  //   }

  function init() {
    if (_initialized) return;
    _initialized = true;
    // PRO-0: nie ma nic do zrobienia — plan = 'free' jest ustawiony z góry.
    // PRO-3+: odkomentuj i rozbuduj blok powyżej.
  }

  // Uruchom po gotowości DOM (zapewnia dostępność VildaVault jeśli już załadowany)
  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  } else {
    init();
  }

  // ── Eksport ──────────────────────────────────────────────────────────────

  global.VildaProAccess = Object.freeze({
    __vildaProAccessModule: true,
    VERSION: VERSION,
    version: VERSION,
    STEP: STEP,
    step: STEP,
    hasAccess: hasAccess,
    getPlan: getPlan,
    setPlan: setPlan,
    onPlanChange: onPlanChange,
    getSnapshot: getSnapshot
  });

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
