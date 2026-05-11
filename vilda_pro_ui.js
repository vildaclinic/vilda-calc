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
        // Powiadom app.js żeby zresetował przełącznik trybu wyników do standardowego.
        // Listener w initResultsModeToggle() sprawdza czy toggle.checked — jeśli nie,
        // event jest ignorowany (no-op).
        try {
          if (global.document) {
            global.document.dispatchEvent(
              new CustomEvent('vilda:pro-gate-active', { bubbles: false })
            );
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  // ─── Główna funkcja aktualizacji stanu ──────────────────────────────────────

  function refresh() {
    try {
      var proAccess = global.VildaProAccess;

      // Krok 1: czy plan jest ważny datowo? (synchroniczne, bez vaulta)
      var planValid = proAccess && typeof proAccess.hasAccess === 'function'
        ? proAccess.hasAccess()
        : false;

      if (!planValid) {
        applyHtmlClass(false);
        return;
      }

      // Krok 2: weryfikacja user-bindingu — plan musi należeć do aktualnie
      // zalogowanego użytkownika. Zapobiega korzystaniu z PRO przez inne konta
      // na tym samym urządzeniu (w tym konta z identyczną nazwą / labelą).
      var vault = global.VildaVault;
      var snapshot = proAccess.getSnapshot ? proAccess.getSnapshot() : null;
      var planUserId = snapshot && snapshot.userId || null;

      // Dane sprzed wprowadzenia user-bindingu (brak userId) → nieważne.
      if (!planUserId) {
        applyHtmlClass(false);
        return;
      }

      // Pobierz userId aktualnie zalogowanego użytkownika.
      // Źródło 1: VildaVault.getCurrentUser() — autorytatywne, gdy vault odblokowany.
      // Źródło 2: sessionStorage — gdy vault załadowany ale sesja jeszcze przywracana
      //           (asynchronicznie); czytamy tylko userId, nie dotykamy keyB64.
      var currentUserId = null;
      if (vault && typeof vault.getCurrentUser === 'function') {
        var currentUser = vault.getCurrentUser();
        currentUserId = currentUser && currentUser.userId || null;
      }
      if (!currentUserId) {
        try {
          var sessionRaw = global.sessionStorage
            && global.sessionStorage.getItem('vilda-vault-session-v2');
          if (sessionRaw) {
            var sessionData = JSON.parse(sessionRaw);
            currentUserId = (sessionData && sessionData.userId) || null;
          }
        } catch (_) {}
      }

      if (vault && typeof vault.getCurrentUser === 'function') {
        // Vault załadowany — robimy pełną weryfikację.
        // Brak zalogowanego użytkownika (gość, vault zablokowany i brak sesji)
        // lub inny userId → brak PRO.
        if (!currentUserId || planUserId !== currentUserId) {
          applyHtmlClass(false);
          return;
        }
      } else {
        // VildaVault niezaładowany — nie możemy zweryfikować bindingu.
        // Fail-safe: deaktywuj PRO. Gdy vault załaduje sesję, odpali
        // vilda:session-changed → refresh() zostanie wywołany ponownie.
        applyHtmlClass(false);
        return;
      }

      // Wszystkie sprawdzenia przeszły — PRO aktywne
      applyHtmlClass(true);
    } catch (_) {
      // Fail-safe — brak PRO jest bezpiecznym domyślnym stanem
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
