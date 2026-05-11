/**
 * vilda_pro_access.js — Zarządzanie stanem subskrypcji Vilda PRO.
 *
 * ─── Odpowiedzialność ────────────────────────────────────────────────────────
 *
 *   Jeden moduł, jedno źródło prawdy o tym czy użytkownik ma aktywny plan PRO.
 *   Nie zawiera żadnej logiki UI — to należy do vilda_pro_ui.js.
 *
 * ─── Kluczowa właściwość: hasAccess() jest SYNCHRONICZNY ────────────────────
 *
 *   hasAccess() odczytuje dane z localStorage bez żadnych await/Promise.
 *   Dzięki temu strony mogą sprawdzić stan PRO w inline <script> w <head>,
 *   ZANIM przeglądarka wyrenderuje <body> — zero migania elementów UI.
 *
 * ─── Przechowywanie stanu ────────────────────────────────────────────────────
 *
 *   localStorage klucz: 'vilda-pro-plan-v1'
 *   Format: { plan, validUntil, activatedAt, userId, cachedAt }
 *
 *   Pole userId (UUID konta z VildaVault) wiąże plan z konkretnym kontem —
 *   zapobiega dostępowi do PRO przez innych użytkowników na tym samym urządzeniu.
 *   Weryfikacja userId odbywa się w vilda_pro_ui.js po załadowaniu vaulta.
 *   hasAccess() pozostaje synchroniczny (sprawdza tylko datę) — do użycia
 *   w bootstrap <script> zanim vault się załaduje.
 *
 * ─── Zdarzenia ───────────────────────────────────────────────────────────────
 *
 *   Odpala:      'vildaProAccessChanged' (detail: { plan, validUntil })
 *
 * ─── API ─────────────────────────────────────────────────────────────────────
 *
 *   window.VildaProAccess = {
 *     hasAccess()                 — bool (synchroniczny)
 *     getSnapshot()               — { plan, validUntil, activatedAt } | null
 *     setPlan(plan, validUntil)   — zapisuje stan, odpala zdarzenie
 *     invalidateCache()           — kasuje localStorage
 *   }
 */

(function (global) {
  'use strict';

  if (!global) return;

  // Guard — nie inicjalizuj dwukrotnie
  if (global.VildaProAccess && global.VildaProAccess.__vildaProAccess) return;

  // ─── Stałe ──────────────────────────────────────────────────────────────────

  var CACHE_KEY = 'vilda-pro-plan-v1';

  // ─── Odczyt / zapis localStorage ────────────────────────────────────────────

  function readCache() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeCache(data) {
    try {
      if (!global.localStorage) return;
      var entry = {
        plan:        data.plan        || null,
        validUntil:  data.validUntil  || null,
        activatedAt: data.activatedAt || null,
        userId:      data.userId      || null,   // binding konta — weryfikowany przez vilda_pro_ui.js
        cachedAt:    new Date().toISOString()
      };
      global.localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch (_) {}
  }

  function clearCache() {
    try {
      if (global.localStorage) global.localStorage.removeItem(CACHE_KEY);
    } catch (_) {}
  }

  // ─── API publiczne ───────────────────────────────────────────────────────────

  /**
   * Sprawdza czy użytkownik ma aktywny plan PRO.
   * SYNCHRONICZNY — bezpieczny do wywołania w inline <script> w <head>.
   * @returns {boolean}
   */
  function hasAccess() {
    var cache = readCache();
    if (!cache) return false;
    if (cache.plan !== 'pro') return false;
    if (!cache.validUntil) return false;
    try {
      return new Date(cache.validUntil).getTime() > Date.now();
    } catch (_) {
      return false;
    }
  }

  /**
   * Zwraca snapshot aktualnego planu lub null jeśli brak danych.
   * @returns {{ plan: string, validUntil: string, activatedAt: string, cachedAt: string } | null}
   */
  function getSnapshot() {
    return readCache();
  }

  /**
   * Zapisuje plan PRO (po aktywacji triala lub odnowieniu subskrypcji).
   * Wywołać po otrzymaniu danych z endpointu /v1/slots/:slotId/trial.
   *
   * @param {string} plan        - 'pro' (lub 'free' żeby jawnie cofnąć)
   * @param {string} validUntil  - data ISO ważności planu
   * @param {string} [activatedAt] - data ISO aktywacji (opcjonalna)
   */
  function setPlan(plan, validUntil, activatedAt) {
    // Pobierz userId aktualnie zalogowanego użytkownika — wiąże plan z konkretnym
    // kontem. Zapobiega to sytuacji gdzie różne konta z tą samą nazwą (labelą)
    // lub kolejni użytkownicy na tym samym urządzeniu korzystają z jednego planu.
    var userId = null;
    try {
      var vault = global.VildaVault;
      var currentUser = vault && typeof vault.getCurrentUser === 'function'
        ? vault.getCurrentUser()
        : null;
      userId = (currentUser && currentUser.userId) || null;
    } catch (_) {}

    writeCache({
      plan:        plan,
      validUntil:  validUntil  || null,
      activatedAt: activatedAt || new Date().toISOString(),
      userId:      userId
    });

    // Powiadom resztę aplikacji (vilda_pro_ui.js nasłuchuje na to zdarzenie)
    try {
      if (global.document) {
        global.document.dispatchEvent(new CustomEvent('vildaProAccessChanged', {
          bubbles: false,
          detail: {
            plan:       plan,
            validUntil: validUntil || null
          }
        }));
      }
    } catch (_) {}
  }

  /**
   * Kasuje cache — wywołać przy jawnym wylogowaniu użytkownika.
   * Nie reaguje automatycznie na 'vilda:session-changed' (ten event odpala się
   * też przy starcie strony gdy vault jest zablokowany, co niszczyłoby cache).
   */
  function invalidateCache() {
    clearCache();
    // Powiadom UI żeby zaktualizowało klasy CSS
    try {
      if (global.document) {
        global.document.dispatchEvent(new CustomEvent('vildaProAccessChanged', {
          bubbles: false,
          detail: { plan: null, validUntil: null }
        }));
      }
    } catch (_) {}
  }

  // ─── Eksport ─────────────────────────────────────────────────────────────────

  global.VildaProAccess = {
    __vildaProAccess: true,   // guard przed podwójną inicjalizacją
    hasAccess:        hasAccess,
    getSnapshot:      getSnapshot,
    setPlan:          setPlan,
    invalidateCache:  invalidateCache
  };

}(typeof window !== 'undefined' ? window : this));
