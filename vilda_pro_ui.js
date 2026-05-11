/**
 * vilda_pro_ui.js — Warstwa UI subskrypcji Vilda PRO.
 *
 * ─── Odpowiedzialność ────────────────────────────────────────────────────────
 *
 *   Jedyne zadanie tego modułu: utrzymywać klasy CSS na <html> w zgodzie
 *   ze stanem VildaProAccess.hasAccess(). Reszta to CSS — nie JavaScript.
 *
 *   Klasa 'vilda-pro-active'   → użytkownik ma aktywny plan PRO
 *   Klasa 'vilda-pro-inactive' → brak PRO (gość, zalogowany bez PRO, trial wygasł)
 *
 *   Klasy te ustawia też inline bootstrap script w <head> każdej strony
 *   (synchronicznie, przed renderem body) — dzięki temu nie ma migania.
 *   Ten moduł je tylko potwierdza/aktualizuje po załadowaniu pełnego JS.
 *
 * ─── Co NIE należy do tego modułu ───────────────────────────────────────────
 *
 *   • Logika obliczeniowa i wyniki (app.js, vilda_professional_module.js)
 *   • Przełącznik resultsModeToggle (app.js — nie dotykamy)
 *   • Walidacja PWZ (vilda_professional_module.js — nie dotykamy)
 *
 * ─── Zdarzenia ───────────────────────────────────────────────────────────────
 *
 *   Nasłuchuje: 'vildaProAccessChanged' — odpala vilda_pro_access.js
 *   Nasłuchuje: 'vilda:session-changed' — synchronizuje stan po logowaniu
 *   Nasłuchuje: 'DOMContentLoaded'      — inicjalizacja przy załadowaniu strony
 *
 * ─── Zależności ──────────────────────────────────────────────────────────────
 *
 *   Wymaga window.VildaProAccess (vilda_pro_access.js załadowany wcześniej).
 */

(function (global) {
  'use strict';

  if (!global) return;

  // Guard — nie inicjalizuj dwukrotnie
  if (global.VildaProUi && global.VildaProUi.__vildaProUi) return;

  // ─── Pomocnik: ustaw klasę na <html> ────────────────────────────────────────

  function applyHtmlClass(isActive) {
    try {
      var root = global.document && global.document.documentElement;
      if (!root) return;
      if (isActive) {
        root.classList.add('vilda-pro-active');
        root.classList.remove('vilda-pro-inactive');
      } else {
        root.classList.add('vilda-pro-inactive');
        root.classList.remove('vilda-pro-active');
      }
    } catch (_) {}
  }

  // ─── Główna funkcja aktualizacji stanu ──────────────────────────────────────

  function refresh() {
    try {
      var proAccess = global.VildaProAccess;
      var isActive  = proAccess && typeof proAccess.hasAccess === 'function'
        ? proAccess.hasAccess()
        : false;
      applyHtmlClass(isActive);
    } catch (_) {
      // Fail safe — brak PRO jest bezpiecznym domyślnym stanem
      applyHtmlClass(false);
    }
  }

  // ─── Inicjalizacja ───────────────────────────────────────────────────────────

  function init() {
    // Aktualizuj klasy na podstawie aktualnego stanu
    refresh();

    // Nasłuchuj na zmiany stanu PRO (po aktywacji triala, wylogowaniu itp.)
    try {
      global.document.addEventListener('vildaProAccessChanged', refresh);
    } catch (_) {}

    // Nasłuchuj na zmiany sesji — po zalogowaniu stan PRO może być inny
    try {
      global.document.addEventListener('vilda:session-changed', refresh);
    } catch (_) {}
  }

  // ─── Start ───────────────────────────────────────────────────────────────────

  // Uruchom init gdy DOM jest gotowy (lub od razu jeśli już załadowany)
  try {
    if (global.document) {
      if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', init, { once: true });
      } else {
        init();
      }
    }
  } catch (_) {}

  // ─── Eksport ─────────────────────────────────────────────────────────────────

  global.VildaProUi = {
    __vildaProUi: true,   // guard przed podwójną inicjalizacją
    refresh:      refresh
  };

}(typeof window !== 'undefined' ? window : this));
