/*
 * Vilda Auth UI v2.0.0 — multi-user
 *
 * Etap 8R-3b: warstwa UI dopasowana do multi-user vaultu (vilda_vault.js v2).
 * Obsługuje:
 *   - automatyczny restore sesji z sessionStorage (logowanie przeżywa
 *     nawigację między podstronami index.html → docpro.html → klirens itd.,
 *     ale znika po zamknięciu karty),
 *   - ekran „Witamy” gdy na urządzeniu nie ma jeszcze żadnych kont,
 *   - ekran wyboru użytkownika („Kto się loguje?”) gdy konta istnieją,
 *   - ekran logowania konkretnego użytkownika (tytuł = imię/etykieta),
 *   - kreator dodawania nowego użytkownika (3 kroki),
 *   - flow odzyskiwania dostępu kluczem (z linku przy konkretnym koncie),
 *   - automatyczny ekran logowania po wygaśnięciu sesji,
 *   - flagę window.VildaGuestMode dla pozostałych modułów,
 *   - przycisk „Wyloguj się” w rogu aplikacji widoczny gdy vault otwarty.
 *
 * Brand header: logo + turkusowy napis „wagaiwzrost.pl” + tagline „Vilda Clinic”.
 * (Tytuł „wagaiwzrost.pl” jako duży h1 ekranu został usunięty — był redundantny
 * z subtelnym napisem pod logiem.)
 */
(function (global) {
  'use strict';

  if (!global) return;
  if (global.VildaAuthUI && global.VildaAuthUI.__vildaAuthUI) {
    return;
  }

  const VERSION = '2.6.5';
  const STEP = '8R-15';
  const ROOT_ID = 'vilda-auth-ui-root';
  const IDLE_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointerdown'];
  const PWA_GUEST_FLAG = 'VildaGuestMode';
  // „Ufam temu urządzeniu" — preferencja PER-URZĄDZENIE (localStorage tego komputera,
  // NIE konto → nie synchronizuje się na inne urządzenia). Włączona = dłuższe okno
  // bezczynności (7 dni) w obrębie OTWARTEJ karty. Sesja nadal żyje w sessionStorage,
  // więc zamknięcie przeglądarki i tak wylogowuje — klucz NIGDY nie trafia na dysk.
  const TRUSTED_DEVICE_KEY = 'vilda-trust-device-v1';
  const TRUSTED_DEVICE_IDLE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dni

  let booted = false;
  let rootEl = null;
  let _authRootBgLocked = false; // czy nakładka .vilda-auth-root trzyma blokadę scrolla body
  let logoutBtnEl = null;
  let pendingSetupOptions = null;
  let idleHandlersBound = false;
  // UWAGA: vilda_vault.lock() zeruje currentUserId PRZED wywołaniem notifyLock(),
  // więc getCurrentUser() w onLock zawsze zwraca null. Śledzimy userId sami —
  // aktualizujemy w onUnlock, używamy w onLock, zerujemy po użyciu.
  let _trackedUserId = null;
  // N11.2: usunięto _trackedCloudOnly + POST_LOGOUT_TOAST_KEY — toast
  // „Dane pacjentów usunięte z pamięci" był UX clutter (powtarzanie tego co
  // user już wie z wyboru trybu + chip topbar). Chip „Tryb chmurowy" + sekcja
  // w Ustawieniach są stałymi punktami informacji.
  // Stan ostatniej próby synchronizacji PRO z serwerem (per-user).
  // Cooldown 30s obowiązuje tylko gdy TEN SAM userId loguje się ponownie szybko
  // (idle-lock + natychmiastowy re-login, wieloetapowy QR transfer itp.).
  // Inny userId → cooldown ignorowany, sync zawsze startuje.
  let _proSyncLastAt = { userId: null, at: 0 };
  // AbortController dla aktywnego żądania WebAuthn (navigator.credentials.get).
  // Jeden kontroler na raz — abort() przed każdym nowym żądaniem eliminuje problem
  // "stale pending request" który blokuje kolejne wywołania przez do 60s i zamraża UI.
  let _passkeyAbortCtrl = null;
  // D.3 — Conditional mediation (autofill UI). Osobny AbortController bo conditional
  // get() wisi w tle (resolves dopiero gdy user wybierze passkey z autofill), a
  // równolegle może działać auto-trigger D.2 z modal UI. Tylko jedno credentials.get()
  // może być aktywne per origin — abort conditional PRZED start passkey modal.
  let _conditionalAbortCtrl = null;
  // Per-sesja zbiór userId dla których auto-passkey już raz nie udał się (anulowanie,
  // cooldown przeglądarki po odrzuceniu Touch ID/Face ID). Chroni przed kolejnymi
  // automatycznymi próbami — użytkownik może kliknąć przycisk biometryczny ręcznie.
  // Kasowany przy pomyślnym logowaniu dowolną metodą.
  let _passkeyAutoFailed = new Set();

  // ============ ADAPTIVE BACKOFF BIOMETRII ============
  // Po N anulowaniach z rzędu (cross-session) wyłączamy automatyczne wywoływanie
  // Face ID/Touch ID na ekranie logowania — przycisk biometryczny zostaje, ale
  // user musi go kliknąć ręcznie. Stan trzymamy w localStorage per-userId; user
  // może ręcznie przełączyć w Ustawieniach → Bezpieczeństwo.
  // Po udanym logowaniu biometrią resetujemy licznik (ale NIE re-enable auto —
  // to świadoma decyzja użytkownika z Ustawień).
  const BIOMETRIC_AUTO_OFF_THRESHOLD = 2;
  function _bioKey(prefix, uid) { return 'vilda:' + prefix + ':' + uid; }
  function _safeLS() { try { return global.localStorage || null; } catch (_) { return null; } }
  function getBiometricAutoTrigger(uid) {
    if (!uid) return 'on';
    const ls = _safeLS(); if (!ls) return 'on';
    try { return ls.getItem(_bioKey('biometricAutoTrigger', uid)) === 'off' ? 'off' : 'on'; }
    catch (_) { return 'on'; }
  }
  function setBiometricAutoTrigger(uid, value) {
    if (!uid) return;
    const ls = _safeLS(); if (!ls) return;
    try { ls.setItem(_bioKey('biometricAutoTrigger', uid), value === 'off' ? 'off' : 'on'); } catch (_) {}
  }
  function getBiometricDismissCount(uid) {
    if (!uid) return 0;
    const ls = _safeLS(); if (!ls) return 0;
    try {
      const n = parseInt(ls.getItem(_bioKey('biometricDismissCount', uid)) || '0', 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch (_) { return 0; }
  }
  function setBiometricDismissCount(uid, n) {
    if (!uid) return;
    const ls = _safeLS(); if (!ls) return;
    try { ls.setItem(_bioKey('biometricDismissCount', uid), String(Math.max(0, n | 0))); } catch (_) {}
  }
  function isBiometricAutoOffNoticePending(uid) {
    if (!uid) return false;
    const ls = _safeLS(); if (!ls) return false;
    try { return ls.getItem(_bioKey('biometricAutoOffNotice', uid)) === '1'; }
    catch (_) { return false; }
  }
  function setBiometricAutoOffNoticePending(uid, pending) {
    if (!uid) return;
    const ls = _safeLS(); if (!ls) return;
    try {
      if (pending) ls.setItem(_bioKey('biometricAutoOffNotice', uid), '1');
      else ls.removeItem(_bioKey('biometricAutoOffNotice', uid));
    } catch (_) {}
  }
  // Po anulowaniu biometrii (NotAllowedError): inkrementuj licznik; po N z rzędu
  // wyłącz auto-trigger i ustaw flagę banneru na następny ekran logowania.
  function recordBiometricDismissal(uid) {
    if (!uid) return;
    const n = getBiometricDismissCount(uid) + 1;
    setBiometricDismissCount(uid, n);
    if (n >= BIOMETRIC_AUTO_OFF_THRESHOLD && getBiometricAutoTrigger(uid) === 'on') {
      setBiometricAutoTrigger(uid, 'off');
      setBiometricAutoOffNoticePending(uid, true);
    }
  }
  // Po udanym logowaniu biometrią: zeruj licznik. NIE reaktywuj auto-trigger —
  // jeśli user w międzyczasie wyłączył ręcznie, szanujemy tę decyzję.
  function recordBiometricSuccess(uid) {
    if (!uid) return;
    setBiometricDismissCount(uid, 0);
  }

  // ============ PLATFORM DETECTION ============
  /**
   * Zwraca lokalną nazwę metody biometrycznej dla aktualnej platformy:
   *   macOS          → "Touch ID"
   *   iOS / iPadOS   → "Face ID / Touch ID"
   *   Windows        → "Windows Hello"
   *   Android / inne → "dane biometryczne"
   */
  function getBiometricLabel() {
    var ua = (navigator.userAgent || '').toLowerCase();
    var platform = ((navigator.userAgentData && navigator.userAgentData.platform) ||
                    navigator.platform || '').toLowerCase();

    // macOS — Touch ID (MacBook z Touch Bar / Magic Keyboard z Touch ID)
    if (/macintosh|mac os x/.test(ua) && !/iphone|ipad/.test(ua)) {
      return 'Touch ID';
    }
    // iOS / iPadOS — mogą mieć Face ID lub Touch ID zależnie od modelu,
    // nie da się tego niezawodnie odróżnić w przeglądarce bez dodatkowych API
    if (/iphone|ipad|ipod/.test(ua)) {
      return 'Face ID / Touch ID';
    }
    // Windows Hello
    if (/windows/.test(ua) || /win/.test(platform)) {
      return 'Windows Hello';
    }
    // Android i pozostałe
    return 'dane biometryczne';
  }

  // ============ UTIL ============
  function getCrypto() { return global.VildaCrypto || null; }
  function getVault() { return global.VildaVault || null; }
  function getSyncIntegration() { return global.VildaSyncIntegration || null; }
  function logWarn(msg) {
    if (typeof global.vildaLogAppWarn === 'function') {
      try { global.vildaLogAppWarn('vilda_auth_ui', msg); return; } catch (_) {}
    }
    if (global.console && typeof global.console.warn === 'function') {
      global.console.warn('[VildaAuthUI] ' + msg);
    }
  }
  function logError(msg, err) {
    if (typeof global.vildaLogAppError === 'function') {
      try { global.vildaLogAppError('vilda_auth_ui', msg, err); return; } catch (_) {}
    }
    if (global.console && typeof global.console.error === 'function') {
      global.console.error('[VildaAuthUI] ' + msg, err);
    }
  }

  // Mapuje błąd logowania passkey efemerycznego na komunikat dla użytkownika
  // + decyzję, czy proponować fallback QR. Pure — testowalne bez DOM.
  function mapEphemeralLoginError(err) {
    const code = err && err.code;
    if (code === 'EPH_PRF_UNSUPPORTED') {
      return { message: 'Ta przeglądarka nie obsługuje logowania biometrycznego. Zaloguj się kodem QR — działa w każdej przeglądarce.', offerQrFallback: true };
    }
    if (code === 'EPH_NO_ENVELOPE') {
      return { message: 'Ten klucz biometryczny nie jest skonfigurowany do logowania na cudzym komputerze. Aby to włączyć, wejdź na swoim telefonie w: Ustawienia → Synchronizacja → Skonfiguruj logowanie telefonem.', offerQrFallback: false };
    }
    if (code === 'EPH_CHALLENGE_FAILED' || code === 'EPH_UNLOCK_NETWORK') {
      return { message: 'Nie można połączyć się z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.', offerQrFallback: false };
    }
    if (code === 'EPH_UNLOCK_REJECTED') {
      return { message: 'Uwierzytelnienie odrzucone. Upewnij się, że używasz biometrii ze swojego telefonu (nie z tego komputera) i spróbuj ponownie.', offerQrFallback: true };
    }
    if (code === 'EPH_DECRYPT_FAILED') {
      if (err && err.diagnostic === 'envelope-legacy-create-prf') {
        return { message: 'Logowanie telefonem wymaga aktualizacji. Na swoim telefonie wejdź w Ustawienia → Synchronizacja, usuń je i skonfiguruj ponownie, a potem zaloguj się jeszcze raz.', offerQrFallback: true };
      }
      if (err && err.diagnostic === 'envelope-current-prf-mismatch') {
        return { message: 'Wybrałeś biometrię tego komputera — to nie zadziała na cudzym urządzeniu. Wybierz biometrię swojego telefonu i potwierdź na nim.', offerQrFallback: true };
      }
      return { message: 'Nie udało się zweryfikować tożsamości. Spróbuj ponownie lub zaloguj się kodem QR.', offerQrFallback: true };
    }
    if (err && err.name === 'AbortError') {
      return { message: 'Logowanie anulowane.', offerQrFallback: false };
    }
    return { message: (err && err.message) ? err.message : 'Logowanie nie powiodło się. Spróbuj ponownie lub użyj kodu QR.', offerQrFallback: true };
  }

  function el(tag, attrs, children) {
    const node = global.document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') node.addEventListener(k.substring(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      const list = Array.isArray(children) ? children : [children];
      list.forEach(function (c) {
        if (c == null) return;
        if (typeof c === 'string') node.appendChild(global.document.createTextNode(c));
        else node.appendChild(c);
      });
    }
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  // ============ HELPER: Toggle „Pokaż hasło" ============
  // Owija pole hasła w wrapper z absolute-positioned przyciskiem (eye SVG)
  // po prawej stronie. Klik toggle'uje input.type między 'password' i 'text'.
  //
  // Użycie:
  //   const pwInput = el('input', { type: 'password', class: '...', placeholder: '...' });
  //   const wrapped = attachPasswordToggle(pwInput);
  //   children.push(wrapped);     // zamiast children.push(pwInput)
  //   pwInput.value, pwInput.focus() — działa normalnie, bo to ten sam input.
  function attachPasswordToggle(input) {
    const wrapper = el('div', { class: 'vilda-auth-pw-wrap' });
    wrapper.style.cssText = 'position: relative; display: block; margin: inherit;';
    // Rezerwujemy miejsce na przycisk po prawej (44px = 40px szer. + 4px margines).
    input.style.paddingRight = '44px';
    wrapper.appendChild(input);

    // Eye / eye-off SVG (lucide-style, stroke 2, currentColor #5b6672).
    const EYE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const EYE_OFF_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

    const btn = el('button', {
      type: 'button',
      class: 'vilda-auth-pw-toggle',
      'aria-label': 'Pokaż hasło',
      'aria-pressed': 'false',
      title: 'Pokaż hasło'
    });
    // Płaska ikona — bez tła, cienia, border-radius. Wysokość 24px (znacznie
    // niższa niż input ≈47px), żeby focus/click nie ruszał layoutu pola hasła.
    // Globalne button:hover/focus-visible w style.css są zneutralizowane
    // przez reguły .vilda-auth-pw-toggle w vilda_auth_ui.css (!important).
    btn.style.cssText = [
      'position: absolute; right: 6px; top: 50%; transform: translateY(-50%);',
      'width: 40px; height: 24px;',
      'display: flex; align-items: center; justify-content: center;',
      'background: transparent; border: 0; padding: 0; border-radius: 0;',
      'color: #5b6672; cursor: pointer;',
      'transition: color .15s ease;'
    ].join('');
    btn.innerHTML = EYE_SVG;
    // Tylko subtelna zmiana koloru ikony na hover — bez tła, bez ramki.
    btn.addEventListener('mouseenter', function () { btn.style.color = '#00838d'; });
    btn.addEventListener('mouseleave', function () { btn.style.color = '#5b6672'; });
    btn.addEventListener('click', function () {
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = EYE_OFF_SVG;
        btn.setAttribute('aria-label', 'Ukryj hasło');
        btn.setAttribute('aria-pressed', 'true');
        btn.setAttribute('title', 'Ukryj hasło');
      } else {
        input.type = 'password';
        btn.innerHTML = EYE_SVG;
        btn.setAttribute('aria-label', 'Pokaż hasło');
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('title', 'Pokaż hasło');
      }
      try { input.focus(); } catch (_) {}
    });
    wrapper.appendChild(btn);
    return wrapper;
  }

  // Persistencja trybu gościa między podstronami: nawigacja nie powinna
  // wyrzucać niezalogowanego użytkownika do ekranu logowania. Trzymamy flagę
  // w sessionStorage, żeby przeżywała przejście między stronami, ale znikała
  // po zamknięciu karty — analogicznie do mechanizmu sesji zalogowanej.
  function persistGuestFlag(flag) {
    try {
      if (!global.sessionStorage) return;
      if (flag) global.sessionStorage.setItem(PWA_GUEST_FLAG, '1');
      else global.sessionStorage.removeItem(PWA_GUEST_FLAG);
    } catch (_) { /* sessionStorage może być zablokowany w prywatnym trybie */ }
  }

  function readPersistedGuestFlag() {
    try {
      if (!global.sessionStorage) return false;
      return global.sessionStorage.getItem(PWA_GUEST_FLAG) === '1';
    } catch (_) { return false; }
  }

  function setGuestMode(flag, options) {
    global[PWA_GUEST_FLAG] = !!flag;
    persistGuestFlag(!!flag);
    var opts = (options && typeof options === 'object') ? options : {};
    if (flag) {
      // Wejście w tryb gościa = nowa tożsamość anonimowa. Wyczyść wszystko,
      // co pozostało po poprzednim użytkowniku (autosave w localStorage,
      // wartości pól, globalne struktury). Pomijamy reset jeśli przywracamy
      // flagę z sessionStorage przy nawigacji między podstronami — wtedy
      // dane wpisane przez gościa na poprzedniej stronie pozostają jego.
      if (!opts.skipReset) resetAppSessionState('enter-guest');
      // Auth-gate: gość świadomie wchodzi do aplikacji → odsłoń interfejs
      // (brama mogła być założona przez <head>, bo nie było sesji ani gościa).
      unlockAppContent();
      // W rogu pokazujemy „Zaloguj się” — żeby gość mógł wyjść z trybu
      // anonimowego bez przeładowania strony.
      showLoginButtonForGuest();
    } else {
      // Wyjście z trybu gościa. UWAGA: nie chowaj bezwarunkowo corner-btn — przy
      // przywróceniu sesji (boot→tryRestoreSession→onUnlock pokazał „Wyloguj się")
      // wołane jest setGuestMode(false); ślepy hideCornerBtn() ukrywał wtedy przycisk
      // wylogowania na każdej podstronie po nawigacji. Gdy vault jest odblokowany
      // (użytkownik zalogowany) → pokaż „Wyloguj się”; w innym wypadku schowaj.
      var _vGuestExit = getVault();
      if (_vGuestExit && typeof _vGuestExit.isUnlocked === 'function' && _vGuestExit.isUnlocked()) {
        showLogoutButton();
      } else {
        hideCornerBtn();
      }
    }
    try {
      const evt = new global.CustomEvent('vilda:guest-mode-changed', { detail: { guest: !!flag } });
      global.document.dispatchEvent(evt);
    } catch (_) {}
  }

  function isGuestMode() { return !!global[PWA_GUEST_FLAG]; }

  function exitGuestMode() {
    setGuestMode(false);
    showStartupScreen();
  }

  function showError(node, msg) {
    if (!node) return;
    node.textContent = msg || '';
    node.style.display = msg ? 'block' : 'none';
  }

  function setBusy(flag) {
    if (!rootEl) return;
    if (flag) rootEl.setAttribute('data-busy', '1');
    else rootEl.removeAttribute('data-busy');
  }

  // Pełny reset DOM/persistencji aplikacji przy każdej zmianie tożsamości
  // (lock → start screen, wybór trybu gościa, restart bez przywróconej sesji).
  // Gwarantuje, że gość nie zobaczy danych po byłym zalogowanym, ani user B
  // nie zobaczy danych usera A. clearAllData() to istniejąca funkcja
  // VildaDataImportExport czyszcząca pola formularzy + localStorage + globale.
  function resetAppSessionState(reason) {
    try {
      if (typeof global.clearAllData === 'function') {
        global.clearAllData();
      } else if (global.VildaDataImportExport && typeof global.VildaDataImportExport.clearAllData === 'function') {
        global.VildaDataImportExport.clearAllData();
      }
    } catch (e) {
      logError('resetAppSessionState (' + (reason || '') + ')', e);
    }
    // Selektor „Substancja" w przeliczniku jednostek to PREFERENCJA urządzenia
    // (LAB_CONV_SUBSTANCE) — clearAllData jej NIE czyści (preferencje są celowo
    // zachowywane). Przy resecie sesji (logowanie, wylogowanie, gość, ekran startowy)
    // czyścimy ją, aby po zalogowaniu pole „Substancja" startowało puste, zgodnie
    // z zasadą „świeża sesja = puste formularze". W trakcie sesji (nawigacja między
    // podstronami) resetAppSessionState NIE jest wołane, więc wybór jest pamiętany.
    try {
      if (global.VildaPersistence && typeof global.VildaPersistence.writePreferenceRaw === 'function') {
        global.VildaPersistence.writePreferenceRaw('LAB_CONV_SUBSTANCE', '');
      }
    } catch (e2) {
      logError('resetAppSessionState:lab-conv-substance (' + (reason || '') + ')', e2);
    }
    // BEZPIECZEŃSTWO DANYCH: natychmiast wyczyść mini-summary w decor-sidebarze.
    // clearAllData() czyści pola formularza synchronicznie, ale odświeżenie
    // mini-summary (updateMiniSummary) dzieje się asynchronicznie przez setTimeout
    // w dispatchResetFieldEventsAfterClear. Gdy hide() usuwa nakładkę auth,
    // decor-sidebar jest już widoczny, zanim async timer zdąży wyczyścić HTML —
    // stare dane pacjenta poprzedniej sesji byłyby krótko (lub trwale) widoczne
    // dla nowego użytkownika (gość, inny lekarz). To naruszenie danych w kontekście
    // medycznym — dlatego czyścimy DOM synchronicznie tutaj, niezależnie od timera.
    try {
      var _miniContent = global.document && global.document.getElementById('miniSummaryContent');
      if (_miniContent) _miniContent.innerHTML = '';
      var _miniEl = global.document && global.document.getElementById('miniSummary');
      if (_miniEl) _miniEl.style.display = 'none';
      // Usuń też klasę wizualną z kontenera — bez tego decor-sidebar zostałby
      // widoczny jako puste pudełko mimo braku contentu (sidebar.css wymaga klasy
      // decor-sidebar--has-content żeby pokazać tło/cień/padding).
      var _decorEl = _miniEl && (typeof _miniEl.closest === 'function')
        ? _miniEl.closest('.decor-sidebar')
        : (global.document && global.document.querySelector('.desktop-layout .decor-sidebar'));
      if (_decorEl) _decorEl.classList.remove('decor-sidebar--has-content');
    } catch (_) { /* nie blokuj resetu jeśli DOM niedostępny */ }
  }

  function formatRelativeISO(iso) {
    if (!iso) return '';
    try {
      const t = new Date(iso).getTime();
      if (!isFinite(t)) return '';
      const diff = Date.now() - t;
      const min = Math.round(diff / 60000);
      if (min < 1) return 'przed chwilą';
      if (min < 60) return min + ' min temu';
      const hours = Math.round(min / 60);
      if (hours < 24) return hours + ' godz. temu';
      const days = Math.round(hours / 24);
      if (days < 7) return days + (days === 1 ? ' dzień temu' : ' dni temu');
      const weeks = Math.round(days / 7);
      if (weeks < 5) return weeks + (weeks === 1 ? ' tydzień temu' : ' tyg. temu');
      return new Date(iso).toLocaleDateString('pl-PL');
    } catch (_) { return ''; }
  }

  // ============ PRZYCISK W ROGU APLIKACJI ============
  // Jeden element DOM, dwa tryby:
  //   - 'logout' (zalogowany) → „⏻ Wyloguj się” → V.lock('manual'),
  //   - 'login'  (tryb gościa) → „→ Zaloguj się” → wyjście z trybu gościa
  //                              + reset stanu + ekran wyboru tożsamości.
  function ensureCornerBtn() {
    if (logoutBtnEl) return logoutBtnEl;
    if (!global.document || !global.document.body) return null;
    logoutBtnEl = el('button', { type: 'button', class: 'vilda-auth-logout' });
    logoutBtnEl.style.display = 'none';
    global.document.body.appendChild(logoutBtnEl);
    return logoutBtnEl;
  }

  function rebuildCornerBtn(mode) {
    ensureCornerBtn();
    if (!logoutBtnEl) return;
    // klonujemy bez deep żeby skasować poprzednie listenery
    const fresh = logoutBtnEl.cloneNode(false);
    if (logoutBtnEl.parentNode) logoutBtnEl.parentNode.replaceChild(fresh, logoutBtnEl);
    logoutBtnEl = fresh;

    if (mode === 'logout') {
      logoutBtnEl.title = 'Zablokuj aplikację i wróć do listy użytkowników';
      logoutBtnEl.appendChild(el('span', { class: 'vilda-auth-logout-icon', 'aria-hidden': 'true', text: '⏻' }));
      logoutBtnEl.appendChild(el('span', { text: 'Wyloguj się' }));
      logoutBtnEl.addEventListener('click', function () {
        // Pokaż overlay natychmiast — blokuje UI podczas całego async teardownu
        // (abort passkey, resetAppSessionState, nawigacja lub ekran startowy).
        showLogoutOverlay();
        // Przerwij aktywne żądanie WebAuthn natychmiast — przed lock(), żeby zminimalizować
        // okno race condition (biometria zdąży się rozwiązać między abort a lock).
        // Bez tego abort następuje dopiero wewnątrz showStartupScreen(), co jest za późno
        // i w ogóle pomija ścieżkę dla podstron (location.replace → return bez abort).
        abortPendingPasskey();
        const V = getVault();
        if (V) { try { V.lock('manual'); } catch (_) {} }
      });
      logoutBtnEl.style.display = 'flex';
    } else if (mode === 'login') {
      logoutBtnEl.title = 'Zaloguj się lub przełącz na inne konto';
      logoutBtnEl.appendChild(el('span', { class: 'vilda-auth-logout-icon', 'aria-hidden': 'true', text: '→' }));
      logoutBtnEl.appendChild(el('span', { text: 'Zaloguj się' }));
      logoutBtnEl.addEventListener('click', function () {
        // Wyjście z trybu gościa: czyścimy flagę bezpośrednio (NIE przez
        // setGuestMode(false), bo w setGuestMode jest event), kasujemy stan
        // aplikacji i pokazujemy ekran wyboru tożsamości. Trzeba też usunąć
        // utrwaloną wersję z sessionStorage, inaczej kolejna nawigacja
        // przywróci tryb gościa.
        global[PWA_GUEST_FLAG] = false;
        persistGuestFlag(false);
        resetAppSessionState('exit-guest-via-corner');
        hideCornerBtn();
        showStartupScreen();
      });
      logoutBtnEl.style.display = 'flex';
    } else {
      logoutBtnEl.style.display = 'none';
    }
  }

  // ── Etykieta PRO w nagłówku ─────────────────────────────────────────────
  // Aktualizuje #vildaProBadge (renderowany przez vilda_chrome.js):
  //   VildaProAccess.hasAccess() → "active" (fiolet)
  //   zalogowany, brak PRO       → "upgrade" (turkus „↑ PRO")
  //   wylogowany                 → ukryty
  function updateProBadge() {
    try {
      var badge = global.document && global.document.getElementById('vildaProBadge');
      if (!badge) return;
      var hasPro = global.VildaProAccess &&
                   typeof global.VildaProAccess.hasAccess === 'function' &&
                   global.VildaProAccess.hasAccess();
      badge.style.display = 'inline-flex';
      if (hasPro) {
        badge.setAttribute('data-pro-state', 'active');
        badge.textContent = 'PRO';
      } else {
        badge.setAttribute('data-pro-state', 'upgrade');
        badge.textContent = '↑ PRO';
      }
    } catch (_) {}
  }

  function hideProBadge() {
    try {
      var badge = global.document && global.document.getElementById('vildaProBadge');
      if (!badge) return;
      badge.style.display = 'none';
      badge.removeAttribute('data-pro-state');
    } catch (_) {}
  }

  // Przerywa aktywne żądanie WebAuthn jeśli istnieje i natychmiast zwalnia UI
  // (setBusy(false)) zanim wyrenderuje się nowy ekran. Bez tego stary pending
  // navigator.credentials.get() żyje do 20s i może blokować nowe wywołania.
  function abortPendingPasskey() {
    if (_passkeyAbortCtrl) {
      try { _passkeyAbortCtrl.abort(); } catch (_) {}
      _passkeyAbortCtrl = null;
      setBusy(false); // natychmiast odblokuj UI — nowy ekran musi być responsywny
    }
    // D.3 — conditional też dzieli credentials.get() API per-origin. Każdy nowy
    // passkey request (auto-trigger, ręczny klik) MUSI ubić conditional inaczej
    // dostaje NotAllowedError. Centralizujemy lifecycle tutaj — wszystkie istniejące
    // abortPendingPasskey() w showStartupScreen, lock, logout itp. automatycznie
    // ubijają też conditional bez zmian w call-sites.
    abortPendingConditional();
  }

  // D.3 — Abort conditional mediation. Wołane przez abortPendingPasskey (najczęściej).
  // Bezpośrednie wołanie tylko gdy potrzebujemy ubić conditional bez ubijania passkey
  // (np. nigdy w obecnym kodzie — zostawione publiczne dla przyszłych use-case).
  // Bez setBusy(false) — conditional nigdy nie ustawia busy (działa w tle bez UI).
  function abortPendingConditional() {
    if (_conditionalAbortCtrl) {
      try { _conditionalAbortCtrl.abort(); } catch (_) {}
      _conditionalAbortCtrl = null;
    }
  }

  // ── Overlay "Trwa wylogowywanie..." ──────────────────────────────────────
  // Pojawia się synchronicznie przy kliknięciu logout — natychmiast blokuje UI
  // podczas asynchronicznego teardownu (abort passkey, resetAppSessionState,
  // nawigacja lub renderowanie ekranu startowego). Szczególnie ważne gdy:
  //   a) systemowy dialog biometryczny nie zamyka się od razu po abort(),
  //   b) starsze Safari nie obsługuje AbortSignal w credentials.get() (timeout 20s),
  //   c) aplikacja jest na podstronie i musi przeładować index.html.
  // Zdejmowany przez hideLogoutOverlay() wywołane przez showStartupScreen()
  // (tuż przed wyrenderowaniem ekranu startowego) lub przez onLock→location.replace
  // (nowa strona montuje się od zera).
  let _logoutOverlayEl = null;

  function showLogoutOverlay() {
    if (_logoutOverlayEl || !global.document) return; // idempotentne
    try {
      var overlay = global.document.createElement('div');
      overlay.className = 'vilda-logout-overlay';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.setAttribute('aria-label', 'Trwa wylogowywanie');

      var spinner = global.document.createElement('div');
      spinner.className = 'vilda-logout-overlay__spinner';
      spinner.setAttribute('aria-hidden', 'true');

      var label = global.document.createElement('div');
      label.className = 'vilda-logout-overlay__label';
      label.textContent = 'Trwa wylogowywanie…';

      overlay.appendChild(spinner);
      overlay.appendChild(label);
      global.document.body.appendChild(overlay);
      _logoutOverlayEl = overlay;
    } catch (_) { /* nie blokuj logout jeśli DOM niedostępny */ }
  }

  function hideLogoutOverlay() {
    if (!_logoutOverlayEl) return;
    try { _logoutOverlayEl.parentNode && _logoutOverlayEl.parentNode.removeChild(_logoutOverlayEl); } catch (_) {}
    _logoutOverlayEl = null;
  }

  function showLogoutButton() {
    rebuildCornerBtn('logout');
    updateProBadge();
    try { if (global.document) global.document.documentElement.classList.add('vilda-logged-in'); } catch (_) {}
  }
  function showLoginButtonForGuest() { rebuildCornerBtn('login'); }
  function hideCornerBtn() { if (logoutBtnEl) logoutBtnEl.style.display = 'none'; }
  function hideLogoutButton() {
    hideCornerBtn();
    hideProBadge();
    try { if (global.document) global.document.documentElement.classList.remove('vilda-logged-in'); } catch (_) {}
  }

  // ============ AUTH-GATE (anti-flash) ============
  // Klasa html.vilda-auth-locked chowa interfejs aplikacji (patrz CSS w <head>
  // podstron), żeby przed pojawieniem się ekranu logowania oraz po wylogowaniu
  // nie błyskała treść aplikacji. Bramę zakłada synchroniczny skrypt w <head>
  // (gdy brak sesji i brak trybu gościa) oraz showStartupScreen()/onLock tutaj;
  // zdejmuje ją onUnlock po autoryzacji. Na podstronach bez reguły CSS te wywołania
  // są nieszkodliwe (brak efektu wizualnego).
  function lockAppContent() {
    try { if (global.document) global.document.documentElement.classList.add('vilda-auth-locked'); } catch (_) {}
  }
  function unlockAppContent() {
    try { if (global.document) global.document.documentElement.classList.remove('vilda-auth-locked'); } catch (_) {}
  }

  // ============ MOUNT ROOT ============
  function ensureRoot() {
    if (rootEl) return rootEl;
    if (!global.document || !global.document.body) return null;
    const existing = global.document.getElementById(ROOT_ID);
    if (existing) {
      // G1: gwarancja blokady gestu swipe-nawigacji (vilda_chrome.js
      // swipeExcludedTarget) — gest startujący wewnątrz karty pacjenta nie
      // może przejść do następnej strony, nawet gdy CSS display chwilowo pusty.
      try { existing.setAttribute('data-no-swipe', 'true'); } catch (_) {}
      rootEl = existing;
      return rootEl;
    }
    rootEl = el('div', { id: ROOT_ID, class: 'vilda-auth-root', 'aria-live': 'polite' });
    rootEl.style.display = 'none';
    // G1: patrz wyżej — atrybut musi być na rootEl niezależnie czy stworzony
    // świeżo, czy wzięty z DOM przez getElementById.
    try { rootEl.setAttribute('data-no-swipe', 'true'); } catch (_) {}
    global.document.body.appendChild(rootEl);
    return rootEl;
  }

  function buildBrandHeader(opts) {
    const options = opts || {};
    const name = el('h1', { class: 'vilda-auth-brand-name', text: 'wagaiwzrost.pl' });
    const tag = el('p', { class: 'vilda-auth-brand-tag', text: 'Vilda Clinic' });
    if (options.noLogo) {
      return el('div', { class: 'vilda-auth-brand' }, [name, tag]);
    }
    const logo = el('img', {
      class: 'vilda-auth-logo',
      src: 'logo_vilda.jpeg',
      alt: 'Waga i wzrost — Vilda Clinic'
    });
    return el('div', { class: 'vilda-auth-brand' }, [logo, name, tag]);
  }

  function open(content, opts) {
    ensureRoot();
    if (!rootEl) return;
    clear(rootEl);
    const overlay = el('div', { class: 'vilda-auth-overlay' });
    const card = el('div', { class: 'vilda-auth-card', role: 'dialog', 'aria-modal': 'true' });
    card.appendChild(buildBrandHeader(opts));
    // N11.2: usunięto post-logout toast (cloud-only). Chip „Tryb chmurowy"
    // w topbarze + sekcja Ustawienia → Synchronizacja są jedynymi miejscami
    // gdzie komunikujemy semantykę trybu — passive + persistent, nie spam.
    card.appendChild(content);
    overlay.appendChild(card);
    rootEl.appendChild(overlay);
    rootEl.style.display = 'block';
    // Nakładka (karta pacjenta / lista / ekrany auth) widoczna → zablokuj scroll
    // body, by strona pod fixed-overlayem nie przewijała się i nie „prześwitywała".
    // Flaga chroni przed wielokrotnym acquire przy kolejnych open() (re-render).
    if (!_authRootBgLocked) { _bgLockAcquire(); _authRootBgLocked = true; }
  }

  function hide() {
    if (!rootEl) return;
    rootEl.style.display = 'none';
    // Nakładka schowana → zwolnij blokadę scrolla body (ref-count).
    if (_authRootBgLocked) { _bgLockRelease(); _authRootBgLocked = false; }
    // Zawsze czyść data-busy przy chowaniu auth UI — obrona przed wyciekiem stanu
    // busy do następnego otwarcia overlay. Bez tego pointer-events:none (CSS) zostaje
    // na karcie gdy rootEl jest pokazywany ponownie (showPatientsList, showStartupScreen),
    // co sprawia że UI wygląda na zamrożone mimo że JS działa.
    rootEl.removeAttribute('data-busy');
    clear(rootEl);
    // Sygnalizuj że auth UI zostało schowane — użytkownik jest już w aplikacji
    // (zalogowany, tryb gościa, lub przywrócona sesja). Używane przez custom-fixes.js
    // do opóźnienia initMiniSummary() aż do tego momentu, by uniknąć pokazania
    // mini-summary z danymi poprzedniej sesji zanim pojawi się nakładka logowania.
    try { global.__vildaAuthHidden = true; } catch (_) {}
    try {
      if (global.document && typeof global.CustomEvent === 'function') {
        global.document.dispatchEvent(new global.CustomEvent('vilda:auth-hidden'));
      }
    } catch (_) {}
  }

  // ============ DYSPOZYTOR EKRANU STARTOWEGO ============
  async function showStartupScreen() {
    // Auth-gate: pokazujemy ekran logowania → interfejs aplikacji musi być
    // schowany (przypadek brzegowy: klucz sesji istniał, ale odtworzenie padło,
    // więc <head> mógł nie założyć bramy). Zakładamy ją zanim wyrenderujemy ekran.
    lockAppContent();
    // Przerwij aktywne żądanie WebAuthn przed przejściem do listy użytkowników.
    // Bez tego stary pending navigator.credentials.get() blokuje nowe wywołania.
    abortPendingPasskey();
    const V = getVault();
    if (!V) { logWarn('VildaVault niedostępny — pomijam ekran startowy.'); return; }
    // ekran startowy ZAWSZE = świeży stan tożsamości; przy okazji upewniamy się,
    // że nie zalega autosave z poprzedniej sesji ani guesta.
    resetAppSessionState('show-startup');
    hideCornerBtn();
    let users = [];
    try { users = await V.listUsers(); } catch (e) { logError('listUsers', e); }
    // Zdejmij overlay "Trwa wylogowywanie..." — dane gotowe, zaraz pokazujemy ekran.
    hideLogoutOverlay();
    if (users.length === 0) showEmptyStartupScreen();
    else showUserPicker(users);
  }

  // ============ EKRAN „BRAK UŻYTKOWNIKÓW” ============
  function showEmptyStartupScreen() {
    const title = el('h2', { class: 'vilda-auth-title', text: 'Witamy' });
    const subtitle = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Aby zapisywać dane pacjentów, skonfiguruj swoje konto. Aplikacja zaszyfruje i lokalnie przechowa dane na tym urządzeniu.'
    });

    // ── Opcje dodatkowe (zwijane) ─────────────────────────────────────────────
    const extraPanel = el('div', { class: 'vilda-auth-buttons' });
    extraPanel.style.display = 'none';

    extraPanel.appendChild(el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-subtle',
      type: 'button',
      text: 'Odtwórz konto z pliku kopii (.wiw)',
      onclick: function () { showRestoreVaultFlow(); }
    }));

    const toggleBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-subtle',
      type: 'button',
      text: 'Opcje dodatkowe ▾'
    });
    toggleBtn.addEventListener('click', function () {
      const expanded = extraPanel.style.display !== 'none';
      extraPanel.style.display = expanded ? 'none' : '';
      toggleBtn.textContent = expanded ? 'Opcje dodatkowe ▾' : 'Opcje dodatkowe ▴';
    });

    const mainButtons = el('div', { class: 'vilda-auth-buttons' });
    mainButtons.appendChild(el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Załóż konto',
      onclick: function () { showSetupWizard(); }
    }));
    mainButtons.appendChild(el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: 'Loguję się na nowym lub obcym komputerze',
      onclick: function () { showSyncCodeRestoreScreen(); }
    }));
    mainButtons.appendChild(el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-subtle',
      type: 'button',
      text: 'Korzystaj bez logowania',
      onclick: function () { setGuestMode(true); hide(); }
    }));
    mainButtons.appendChild(toggleBtn);

    open(el('div', { class: 'vilda-auth-screen vilda-auth-startup' }, [title, subtitle, mainButtons, extraPanel]));
  }

  // ============ EKRAN WYBORU UŻYTKOWNIKA ============
  function showUserPicker(users) {
    const title = el('h2', { class: 'vilda-auth-title', text: 'Kto się loguje?' });
    const subtitle = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Wybierz konto, aby kontynuować.'
    });

    const userList = el('div', { class: 'vilda-auth-user-list' });
    // D.1: badge biometrii. Czytamy passkeyCount z registry (zapisywany przez
    // vault._syncPasskeyCount po register/remove). Tekst lokalizowany przez
    // getBiometricLabel() — "Touch ID" / "Face ID / Touch ID" / "Windows Hello".
    // Ikona kłódki zamknietej (lucide-style) sygnalizuje że konto można odblokować
    // biometrią — działa jako visual cue zanim user kliknie kafelek.
    const PASSKEY_BADGE_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-1px;margin-right:4px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    users.forEach(function (u) {
      const lastSeen = u.lastLoginAtISO ? formatRelativeISO(u.lastLoginAtISO) : '';
      const hasPasskey = typeof u.passkeyCount === 'number' && u.passkeyCount > 0;
      const infoChildren = [
        el('div', { class: 'vilda-auth-user-name', text: u.label || 'Konto bez nazwy' })
      ];
      if (hasPasskey) {
        const badge = el('div', { class: 'vilda-auth-user-passkey-badge' });
        // innerHTML — SVG ikona przed tekstem. textContent wstawiony osobno bo
        // mieszanka SVG + tekst tylko przez innerHTML zachowa strukturę.
        badge.innerHTML = PASSKEY_BADGE_SVG + getBiometricLabel();
        infoChildren.push(badge);
      }
      if (lastSeen) {
        infoChildren.push(el('div', { class: 'vilda-auth-user-meta', text: 'Ostatnio: ' + lastSeen }));
      }
      const card = el('button', {
        class: 'vilda-auth-user-card',
        type: 'button',
        title: 'Zaloguj jako ' + u.label + (hasPasskey ? ' (' + getBiometricLabel() + ' dostępny)' : ''),
        'data-has-passkey': hasPasskey ? '1' : '0',
        onclick: function () { showLoginForUser(u.userId); }
      }, [
        el('div', { class: 'vilda-auth-user-avatar', text: (u.label || '?').charAt(0).toUpperCase() }),
        el('div', { class: 'vilda-auth-user-info' }, infoChildren),
        el('span', { class: 'vilda-auth-user-arrow', 'aria-hidden': 'true', text: '›' })
      ]);
      userList.appendChild(card);
    });

    // ── Opcje dodatkowe (zwijane) ─────────────────────────────────────────────
    const extraPanel = el('div', { class: 'vilda-auth-buttons' });
    extraPanel.style.display = 'none';

    extraPanel.appendChild(el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: '+ Dodaj nowego użytkownika',
      onclick: function () { showSetupWizard(); }
    }));
    extraPanel.appendChild(el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-subtle',
      type: 'button',
      text: 'Odtwórz konto z pliku kopii (.wiw)',
      onclick: function () { showRestoreVaultFlow(); }
    }));

    const toggleBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-subtle',
      type: 'button',
      text: 'Opcje dodatkowe ▾'
    });
    toggleBtn.addEventListener('click', function () {
      const expanded = extraPanel.style.display !== 'none';
      extraPanel.style.display = expanded ? 'none' : '';
      toggleBtn.textContent = expanded ? 'Opcje dodatkowe ▾' : 'Opcje dodatkowe ▴';
    });

    const newDeviceBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: 'Loguję się na nowym lub obcym komputerze',
      onclick: function () { showSyncCodeRestoreScreen(); }
    });

    const guestBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-subtle',
      type: 'button',
      text: 'Korzystaj bez logowania',
      onclick: function () { setGuestMode(true); hide(); }
    });

    open(el('div', { class: 'vilda-auth-screen vilda-auth-picker' }, [
      title, subtitle, userList,
      el('div', { class: 'vilda-auth-buttons' }, [newDeviceBtn, guestBtn, toggleBtn]),
      extraPanel
    ]));
  }

  // ============ KREATOR KONFIGURACJI NOWEGO UŻYTKOWNIKA ============
  function showSetupWizard(initialStep) {
    pendingSetupOptions = pendingSetupOptions || { step: 1 };
    const stepNum = (typeof initialStep === 'number') ? initialStep : pendingSetupOptions.step;
    if (stepNum === 1) renderSetupStep1();
    else if (stepNum === 2) renderSetupStep2();
    else renderSetupStep3();
  }

  // UWAGA: funkcja buildCloudOnlyOptInCard USUNIĘTA w Kroku 15.
  // Karta opt-in „Tryb chmurowy" nie ma już sensu w kreatorze nowego konta:
  // • Brak slot'u w chmurze (nowe konto) → pierwsza sesja jest pusta
  // • Mylący komunikat „konto pamięta hasło" przed założeniem konta
  // • Brak local fallback recovery (.wiw backup) w cloud-only
  // Cloud-only jest aktywowane runtime: Ustawienia (toggle) lub QR login na obcym
  // komputerze z chooserem (showQRLoginScreen → completeQRLogin z storageMode).

  function renderSetupStep1() {
    pendingSetupOptions = pendingSetupOptions || {};
    pendingSetupOptions.step = 1;

    const stepLabel = el('div', { class: 'vilda-auth-step', text: 'Krok 1 z 4' });
    const title = el('h2', { class: 'vilda-auth-title', text: 'Nowe konto' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Podaj swoje imię (np. „dr Kowalska”) i ustal hasło dostępu. Hasło min. 12 znaków, co najmniej 3 z 4 typów: małe i wielkie litery, cyfry, znaki specjalne.'
    });

    const labelInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input',
      placeholder: 'Twoje imię (np. dr Kowalska)',
      maxlength: '60'
    });
    if (pendingSetupOptions.label) labelInput.value = pendingSetupOptions.label;

    const pw1 = el('input', { type: 'password', class: 'vilda-auth-input', placeholder: 'Hasło (min. 12 znaków, 3 z 4 typów)' });
    const pw2 = el('input', { type: 'password', class: 'vilda-auth-input', placeholder: 'Powtórz hasło' });
    const errBox = el('div', { class: 'vilda-auth-error' });
    errBox.style.display = 'none';

    // Przycisk „Zaproponuj silne hasło" — generuje passphrase, wypełnia oba pola.
    // Ujawnia hasło na chwilę (zmiana type → text → password po 2s), żeby user
    // mógł je zapamiętać/skopiować przed dalszym krokiem.
    const generateBtn = el('button', {
      type: 'button',
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-small vilda-auth-btn-subtle',
      text: '🎲 Zaproponuj silne hasło'
    });
    generateBtn.style.cssText = 'margin: 4px 0 8px; font-size: 0.85rem;';
    generateBtn.addEventListener('click', function () {
      const V = getVault();
      if (!V || typeof V.generateStrongPassword !== 'function') return;
      const generated = V.generateStrongPassword();
      pw1.value = generated;
      pw2.value = generated;
      // User ma teraz przycisk „pokaż hasło" obok pola — może sam ujawnić
      // wygenerowane hasło żeby je zapamiętać/skopiować, bez auto-reveal'u
      // który mógłby gryźć się ze stanem toggle'a.
      updateMeter();
      try { pw1.focus(); } catch (_) {}
    });

    const meterLabel = el('span', { class: 'vilda-auth-meter-label', text: '—' });
    const meterFill = el('div', { class: 'vilda-auth-meter-fill' });
    const meter = el('div', { class: 'vilda-auth-meter' }, [meterFill]);

    function updateMeter() {
      const s = passwordStrength(pw1.value);
      meterFill.style.width = s.percent + '%';
      meterFill.setAttribute('data-strength', s.label);
      meterLabel.textContent = pw1.value ? ('Siła hasła: ' + s.labelPl) : '—';
    }
    pw1.addEventListener('input', updateMeter);

    // UWAGA: karta opt-in „Tryb chmurowy" USUNIĘTA z kreatora (Krok 15).
    // Cloud-only ma sens TYLKO dla istniejących kont — przy zakładaniu nowego
    // konta nie ma jeszcze slot'u w chmurze do zsynchronizowania. User chcący
    // cloud-only powinien:
    //   • założyć konto normalnie (local), potem włączyć cloud-only w Ustawieniach
    //   • lub na obcym komputerze zalogować się QR-em i wybrać „Komputer w pracy"
    //     w chooserze (tworzy konto z storageMode='cloud-only' przez completeQRLogin).

    const next = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Dalej',
      onclick: function () {
        showError(errBox, '');
        // Policy check przez vault.validatePasswordStrength (12+ chars, 3+ typy, no blacklist).
        const V = getVault();
        if (V && typeof V.validatePasswordStrength === 'function') {
          const r = V.validatePasswordStrength(pw1.value);
          if (!r.ok) {
            showError(errBox, r.message + (r.hint ? ' ' + r.hint : ''));
            return;
          }
        } else {
          // Fallback gdy vault niedostępny — minimalny length check.
          if (pw1.value.length < 12) { showError(errBox, 'Hasło musi mieć minimum 12 znaków.'); return; }
        }
        if (pw1.value !== pw2.value) { showError(errBox, 'Hasła nie są takie same.'); return; }
        pendingSetupOptions.password = pw1.value;
        pendingSetupOptions.label = labelInput.value.trim() || null;
        pendingSetupOptions.recoveryKey = (getCrypto() && getCrypto().generateRecoveryKey()) || null;
        // Zawsze 'local' w kreatorze. Cloud-only ustawiane runtime (Ustawienia /
        // logowanie z telefonu na obcym komputerze).
        pendingSetupOptions.storageMode = 'local';
        renderSetupStep2();
      }
    });

    const back = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: 'Anuluj',
      onclick: function () { pendingSetupOptions = null; showStartupScreen(); }
    });

    const safetyBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-subtle vilda-auth-btn-small',
      type: 'button',
      text: 'Jak chronimy dane?',
      onclick: function () { try { if (global.VildaDataSafety) global.VildaDataSafety.open(); } catch (_) {} }
    });
    const strengthBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-subtle vilda-auth-btn-small',
      type: 'button',
      text: 'Jak silne jest szyfrowanie?',
      onclick: function () { try { if (global.VildaCryptoStrength) global.VildaCryptoStrength.open(); } catch (_) {} }
    });
    const explainersRow = el('div', { class: 'vilda-auth-explainers' }, [safetyBtn, strengthBtn]);
    explainersRow.style.display = 'flex';
    explainersRow.style.flexWrap = 'wrap';
    explainersRow.style.gap = '8px';
    explainersRow.style.justifyContent = 'center';
    explainersRow.style.margin = '0 auto 6px';

    open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, [
      stepLabel, title, sub, explainersRow, labelInput,
      attachPasswordToggle(pw1), generateBtn,
      el('div', { class: 'vilda-auth-meter-wrap' }, [meter, meterLabel]),
      attachPasswordToggle(pw2), errBox,
      el('div', { class: 'vilda-auth-actions' }, [back, next])
    ]));
    setTimeout(function () { try { labelInput.focus(); } catch (_) {} }, 30);
  }

  function passwordStrength(pw) {
    if (!pw) return { percent: 0, label: 'none', labelPl: '—' };
    let score = 0;
    if (pw.length >= 8) score += 1;
    if (pw.length >= 12) score += 1;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
    if (/[0-9]/.test(pw)) score += 1;
    if (/[^A-Za-z0-9]/.test(pw)) score += 1;
    if (pw.length >= 16) score += 1;
    const map = [
      { percent: 10, label: 'very-weak', labelPl: 'bardzo słaba' },
      { percent: 25, label: 'weak', labelPl: 'słaba' },
      { percent: 45, label: 'fair', labelPl: 'średnia' },
      { percent: 65, label: 'good', labelPl: 'dobra' },
      { percent: 85, label: 'strong', labelPl: 'silna' },
      { percent: 100, label: 'very-strong', labelPl: 'bardzo silna' }
    ];
    return map[Math.min(score, map.length - 1)];
  }

  function renderSetupStep2() {
    const opts = pendingSetupOptions;
    if (!opts || !opts.password || !opts.recoveryKey) { renderSetupStep1(); return; }
    pendingSetupOptions.step = 2;

    const stepLabel = el('div', { class: 'vilda-auth-step', text: 'Krok 2 z 4' });
    const title = el('h2', { class: 'vilda-auth-title', text: 'Twój klucz odzyskiwania' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Zapisz go teraz — to jedyny sposób na odzyskanie konta, jeśli zapomnisz hasła. Możesz go skopiować lub pobrać jako plik.'
    });
    const keyBox = el('div', { class: 'vilda-auth-recovery-key', text: opts.recoveryKey });

    const copyBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-small',
      type: 'button',
      text: 'Skopiuj do schowka',
      onclick: async function () {
        try {
          if (global.navigator && global.navigator.clipboard) {
            await global.navigator.clipboard.writeText(opts.recoveryKey);
            copyBtn.textContent = 'Skopiowane ✓';
            setTimeout(function () { copyBtn.textContent = 'Skopiuj do schowka'; }, 2000);
          }
        } catch (e) { logWarn('clipboard write failed: ' + e); }
      }
    });

    const downloadBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-small',
      type: 'button',
      text: 'Pobierz jako plik TXT',
      onclick: function () { downloadRecoveryKeyFile(opts.recoveryKey, opts.label); }
    });

    const tools = el('div', { class: 'vilda-auth-tools' }, [copyBtn, downloadBtn]);

    const confirmCheckboxId = 'vilda-confirm-key-' + Date.now();
    const confirmCheckbox = el('input', {
      type: 'checkbox',
      id: confirmCheckboxId
    });
    const confirmLabel = el('label', {
      class: 'vilda-auth-checkbox-label',
      text: 'Zapisałem klucz odzyskiwania w bezpiecznym miejscu'
    });
    confirmLabel.setAttribute('for', confirmCheckboxId);
    const confirmRow = el('div', { class: 'vilda-auth-checkbox-row' }, [confirmCheckbox, confirmLabel]);

    const errBox = el('div', { class: 'vilda-auth-error' });
    errBox.style.display = 'none';

    const next = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Dalej',
      onclick: async function () {
        showError(errBox, '');
        if (!confirmCheckbox.checked) {
          showError(errBox, 'Zaznacz, że zapisałeś klucz odzyskiwania, zanim przejdziesz dalej.');
          return;
        }
        setBusy(true);
        try {
          const V = getVault();
          await V.createUser(opts.password, {
            label: opts.label,
            recoveryKey: opts.recoveryKey,
            // storageMode: 'cloud-only' (jeśli user zaznaczył kartę opt-in
            // w kroku 1) lub 'local' (domyślnie). Patrz vilda_vault.js
            // STORAGE MODE — kontroluje czy per-user IndexedDB jest trwałe
            // czy in-memory + sessionStorage.
            storageMode: opts.storageMode || 'local'
          });
          renderSetupSyncStep();
        } catch (e) {
          logError('createUser failed', e);
          showError(errBox, e && e.message ? e.message : 'Nie udało się utworzyć konta.');
        } finally {
          setBusy(false);
        }
      }
    });

    const back = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: 'Wstecz',
      onclick: function () { renderSetupStep1(); }
    });

    open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, [
      stepLabel, title, sub, keyBox, tools, confirmRow, errBox,
      el('div', { class: 'vilda-auth-actions' }, [back, next])
    ]));
  }

  // ─── Krok 3 z 4: pytanie o synchronizację ────────────────────────────────────
  function renderSetupSyncStep() {
    const stepLabel = el('div', { class: 'vilda-auth-step', text: 'Krok 3 z 4' });
    const title = el('h2', { class: 'vilda-auth-title', text: 'Korzystasz z kilku urządzeń?' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Jeśli używasz aplikacji na kilku komputerach lub chcesz mieć kopię danych w chmurze — włącz synchronizację. Dane są szyfrowane po Twojej stronie, serwer nigdy nie widzi danych pacjentów. Możesz to zmienić w każdej chwili w Ustawieniach.'
    });

    const yesBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Tak, włącz synchronizację'
    });
    const noBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: 'Nie, tylko to urządzenie'
    });

    yesBtn.addEventListener('click', function () {
      const SI = getSyncIntegration();
      if (SI && typeof SI.setSyncEnabled === 'function') {
        SI.setSyncEnabled(true);
      }
      renderSetupStep3();
    });

    noBtn.addEventListener('click', function () {
      renderSetupStep3();
    });

    open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, [
      stepLabel, title, sub,
      el('div', { class: 'vilda-auth-actions vilda-auth-actions-center' }, [yesBtn, noBtn])
    ]));
  }

  function renderSetupStep3() {
    pendingSetupOptions = null;

    const stepLabel = el('div', { class: 'vilda-auth-step', text: 'Krok 4 z 4' });
    const check = el('div', { class: 'vilda-auth-success-check', text: '✓' });
    const title = el('h2', { class: 'vilda-auth-title', text: 'Wszystko gotowe' });
    const SI = getSyncIntegration();
    const syncOn = !!(SI && typeof SI.isSyncEnabled === 'function' && SI.isSyncEnabled());
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: syncOn
        ? 'Konto skonfigurowane, synchronizacja włączona. Możesz zapisywać dane pacjentów. Po 20 minutach bezczynności zostaniesz automatycznie wylogowany.'
        : 'Konto skonfigurowane i odblokowane. Możesz zapisywać dane pacjentów. Synchronizację możesz włączyć w Ustawieniach. Po 20 minutach bezczynności zostaniesz automatycznie wylogowany.'
    });

    let syncWarning = null;
    if (syncOn) {
      syncWarning = el('div', { class: 'vilda-auth-warning-banner' });
      syncWarning.appendChild(el('strong', { text: 'Aby zalogować się na innym urządzeniu' }));
      syncWarning.appendChild(global.document.createTextNode(
        ', będziesz potrzebować zapasowego kodu dostępu. Możesz go zobaczyć w Ustawieniach → Synchronizacja → Pokaż zapasowy kod dostępu. Zapisz go razem z kluczem odzyskiwania.'
      ));
    }

    // Sekcja kopii zapasowych — tytuł + opis NAD przyciskiem, przycisk
    // wyśrodkowany, status folderu i krótka adnotacja POD.
    const FE = global.VildaFileExport;
    const supportsFsa = !!(FE && FE.SUPPORTS_FSA);
    const backupSection = el('div', { class: 'vilda-auth-info' });
    backupSection.appendChild(el('div', {
      style: 'font-weight:600; color:#08202C; margin-bottom:6px;',
      text: 'Kopie zapasowe pacjentów'
    }));
    backupSection.appendChild(el('p', {
      class: 'vilda-auth-side-note',
      style: 'margin:0 0 4px 0;',
      text: supportsFsa
        ? 'Możesz teraz wybrać folder, do którego aplikacja będzie automatycznie zapisywać zaszyfrowane pliki .vilda po każdej wizycie. Polecane: folder w OneDrive, iCloud Drive lub na Pulpicie — wtedy kopie synchronizują się w chmurze.'
        : 'W tej przeglądarce pliki kopii zapasowych będą zawsze trafiały do folderu Pobrane (Safari, Firefox i przeglądarki mobilne nie wspierają wyboru własnego folderu).'
    }));

    let chooseFolderBtn = null;
    let folderStatus = null;
    if (supportsFsa) {
      chooseFolderBtn = el('button', {
        class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-small',
        type: 'button',
        text: 'Wybierz folder kopii zapasowych',
        onclick: async function () {
          if (!FE) return;
          chooseFolderBtn.disabled = true;
          const originalText = chooseFolderBtn.textContent;
          chooseFolderBtn.textContent = 'Wybieranie folderu…';
          try {
            const info = await FE.setFolderForCurrentUser();
            folderStatus.textContent = '✓ Folder kopii: ' + (info && info.name ? info.name : '(wybrany)');
            chooseFolderBtn.textContent = 'Zmień folder kopii';
          } catch (err) {
            if (err && err.name !== 'AbortError') {
              folderStatus.textContent = 'Nie udało się wybrać folderu.';
            } else {
              folderStatus.textContent = 'Folder kopii: nie wybrany';
            }
            chooseFolderBtn.textContent = originalText;
          } finally {
            chooseFolderBtn.disabled = false;
          }
        }
      });
      backupSection.appendChild(el('div', { class: 'vilda-auth-section-action' }, [chooseFolderBtn]));

      folderStatus = el('p', {
        class: 'vilda-auth-side-note',
        style: 'text-align:center; margin:0 0 4px 0;',
        text: 'Folder kopii: nie wybrany'
      });
      backupSection.appendChild(folderStatus);

      backupSection.appendChild(el('p', {
        class: 'vilda-auth-side-note',
        style: 'text-align:center; margin:0;',
        text: 'Możesz to pominąć i ustawić później w aplikacji w sekcji „Ustawienia → Kopie zapasowe pacjentów".'
      }));
    }

    // Sekcja recovery — opcja wczytania wcześniejszych plików .vilda. Pomocna gdy
    // user przesiada się na nowe urządzenie / po wyczyszczeniu przeglądarki.
    const importSection = el('div', { class: 'vilda-auth-info' });
    importSection.appendChild(el('div', {
      style: 'font-weight:600; color:#08202C; margin-bottom:6px;',
      text: 'Masz już zapisaną bazę pacjentów?'
    }));
    importSection.appendChild(el('p', {
      class: 'vilda-auth-side-note',
      style: 'margin:0 0 4px 0;',
      text: 'Jeśli masz wcześniejsze pliki kopii (.wiw lub starsze .vilda — np. z innego urządzenia, OneDrive lub iCloud), możesz je teraz wczytać do swojego nowego konta. Aplikacja poprosi o hasło, którym te pliki były zaszyfrowane.'
    }));
    const importNowBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-small',
      type: 'button',
      text: 'Wczytaj kopie pacjentów teraz',
      onclick: function () {
        showImportPatientsFlow(null, { fromSetup: true });
      }
    });
    importSection.appendChild(el('div', { class: 'vilda-auth-section-action' }, [importNowBtn]));
    importSection.appendChild(el('p', {
      class: 'vilda-auth-side-note',
      style: 'text-align:center; margin:0;',
      text: 'Możesz też pominąć ten krok i zaimportować pliki później przez „Wczytaj dane → Importuj kopie pacjentów".'
    }));

    const done = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Przejdź do aplikacji',
      onclick: function () { hide(); startIdleWatch(); }
    });
    const screenChildren = [stepLabel, check, title, sub];
    if (syncWarning) screenChildren.push(syncWarning);
    screenChildren.push(backupSection, importSection,
      el('div', { class: 'vilda-auth-actions vilda-auth-actions-center' }, [done]));
    open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, screenChildren));
  }

  function downloadRecoveryKeyFile(rk, label) {
    try {
      const ownerLine = label ? ('Konto: ' + label + '\n') : '';
      const text = 'Klucz odzyskiwania wagaiwzrost.pl\n' +
        'Wygenerowano: ' + new Date().toISOString() + '\n' +
        ownerLine + '\n' +
        rk + '\n\n' +
        'UWAGA: Ten klucz pozwala odzyskać dostęp do danych pacjentów w razie zapomnienia hasła.\n' +
        'Trzymaj go w bezpiecznym miejscu (sejf, menedżer haseł). Bez niego i bez hasła utracisz wszystkie zapisane dane.\n';
      const blob = new global.Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = (global.URL || global.webkitURL).createObjectURL(blob);
      const a = global.document.createElement('a');
      a.href = url;
      a.download = 'klucz-odzyskiwania-wagaiwzrost.txt';
      global.document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { (global.URL || global.webkitURL).revokeObjectURL(url); } catch (_) {}
        try { if (a.parentNode) a.parentNode.removeChild(a); } catch (_) {}
      }, 0);
    } catch (e) { logError('downloadRecoveryKeyFile', e); }
  }

  // ============ LOGIN KONKRETNEGO UŻYTKOWNIKA ============
  async function showLoginForUser(userId, options) {
    const V = getVault();
    if (!V) return;
    const opts = options || {};
    let user = null;
    try {
      const users = await V.listUsers();
      user = users.find(function (u) { return u.userId === userId; });
    } catch (e) { logError('listUsers', e); }
    if (!user) { await showStartupScreen(); return; }

    // Sprawdź czy możemy zaproponować logowanie biometryczne
    let passkeys = [];
    let prfOk = false;
    try {
      prfOk = await V.isPrfSupported();
      if (prfOk) passkeys = await V.listPasskeys(userId);
    } catch (_) {}
    // N11.1: rozróżnij LOCAL passkeys (mają encryptedMasterByPasskey → odszyfrują
    // master key tego usera tym PRF na tym urządzeniu) od REMOTE (tylko metadata
    // przyszło przez sync, brak crypto material — wymaga adopcji najpierw).
    // Bez tego rozróżnienia auto-trigger Face ID na iPhonie odpalałby się dla
    // remote-only klucza, prosił o biometrię i kończył błędem PASSKEY_NOT_LOCAL —
    // czyli user widzi Face ID prompt, daje twarz, dostaje "to nie zadziałało".
    const usablePasskeys = passkeys.filter(function (p) { return !p.isRemote; });
    const hasBiometric = prfOk && usablePasskeys.length > 0;
    // Stan przejściowy: są passkeye konta (badge w pickerze pokazuje "Touch ID"),
    // ale na tym device wszystkie są remote-only. Zamiast oferować biometrię która
    // niezawodnie padnie, kierujemy do logowania hasłem — po unlock pojawi się
    // showPostLoginAdoptionPrompt z opcją aktywacji.
    const hasOnlyRemotePasskeys = prfOk && passkeys.length > 0 && usablePasskeys.length === 0;

    const title = el('h2', { class: 'vilda-auth-title', text: user.label });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: hasBiometric
        ? 'Odblokuj dane pacjentów.'
        : 'Wpisz hasło, aby odblokować dane pacjentów.'
    });
    const banner = opts.message
      ? el('div', { class: 'vilda-auth-banner', text: opts.message })
      : null;

    const errBox = el('div', { class: 'vilda-auth-error' });
    errBox.style.display = 'none';

    // ---- Sekcja biometryczna (widoczna tylko gdy mamy passkey) ----
    // D.4: biometricBtn i cancelledBanner są w outer scope żeby retry-link z
    // banneru mógł odpalić biometricBtn.click() — reuse pełnej logiki (abort,
    // setBusy, _passkeyAbortCtrl, error handling) bez duplikacji.
    let biometricSection = null;
    let biometricBtn = null;
    if (hasBiometric) {
      biometricBtn = el('button', {
        class: 'vilda-auth-btn vilda-auth-btn-biometric',
        type: 'button',
        text: '🪪  ' + getBiometricLabel()
      });
      biometricBtn.addEventListener('click', async function () {
        showError(errBox, '');
        // Przerwij ewentualny poprzedni pending request przed nowym
        abortPendingPasskey();
        _passkeyAbortCtrl = new AbortController();
        const _sig = _passkeyAbortCtrl.signal;
        setBusy(true);
        try {
          await V.unlockWithPasskey(userId, null, _sig);
          _passkeyAutoFailed.delete(userId); // sukces — resetuj flagę failed
          recordBiometricSuccess(userId); // zeruj persistent counter
          // D.4: ukryj banner anulowania po sukcesie — stan „anulowałeś" już nieaktualny.
          if (cancelledBanner) cancelledBanner.style.display = 'none';
          hide();
          startIdleWatch();
        } catch (e) {
          if (!_sig.aborted) {
            // Pokaż błąd tylko dla rzeczywistych problemów (nie abort)
            showError(errBox, e && e.message ? e.message : 'Logowanie biometryczne nie powiodło się.');
            logWarn('biometric-click', e && e.name ? e.name + ': ' + e.message : String(e));
            // Anulowanie ręczne też liczy do adaptive backoff — jeśli user kliknął
            // przycisk biometryczny i sam anulował, jest to sygnał "nie chcę".
            // ADAPTIVE BACKOFF FIX: każdy błąd (poza AbortError = my abortowaliśmy)
            // liczy się — broader matching dla browser quirks.
            if (e && e.name !== 'AbortError') {
              recordBiometricDismissal(userId);
              // D.4: ręczny klik biometric → anulowano → też pokaż banner z retry.
              // Spójne UX z auto-trigger cancellation.
              if (cancelledBanner) cancelledBanner.style.display = '';
            }
          }
        } finally {
          _passkeyAbortCtrl = null;
          if (!_sig.aborted) setBusy(false);
        }
      });

      const divider = el('div', { class: 'vilda-auth-divider' }, [
        el('span', { text: 'lub' })
      ]);

      biometricSection = el('div', { class: 'vilda-auth-biometric-section' }, [
        el('div', { class: 'vilda-auth-actions' }, [biometricBtn]),
        divider
      ]);
    }

    // ---- Sekcja hasła (zawsze widoczna) ----
    // D.3: autocomplete "current-password webauthn" — kluczowy tag dla conditional UI.
    // Przeglądarka (Chrome 108+, Safari 16+, Firefox 119+) pokaże passkey w autofill
    // dropdown gdy user kliknie pole. Bez tego tagu conditional mediation get() wisi
    // ale autofill suggestions nie zawierają passkey.
    const pw = el('input', {
      type: 'password',
      class: 'vilda-auth-input',
      placeholder: 'Hasło',
      autocomplete: 'current-password webauthn'
    });
    const submit = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Zaloguj się',
      onclick: async function () {
        showError(errBox, '');
        if (!pw.value) { showError(errBox, 'Wpisz hasło.'); return; }
        setBusy(true);
        try {
          const result = await V.unlockUser(userId, pw.value);
          _passkeyAutoFailed.delete(userId); // sukces hasłem — resetuj flagę dla kolejnych sesji
          // Krok 16.5 — Forced password reset gdy hasło nie spełnia aktualnej
          // polityki (legacy 8-char konta lub w blacklist). Vault flagował to
          // przez result.needsPasswordReset. Pokazujemy blokujący ekran przed
          // wejściem do aplikacji.
          if (result && result.needsPasswordReset) {
            showForcedPasswordResetScreen(result.passwordPolicy);
            return;
          }
          // Pokaż propozycję biometrii po pierwszym zalogowaniu hasłem (jeśli stosowne).
          // N10.3: po istniejącym prompt'ie (oferuje rejestrację gdy brak passkeyów),
          // sprawdzamy też adoption — gdy są passkeye, ale wyłącznie remote (synced
          // z innego Apple urządzenia przez iCloud Keychain). Te dwa prompty są
          // wzajemnie wykluczające w praktyce: pierwszy odpada gdy passkeys.length>0,
          // drugi tylko wtedy gdy wszystkie są remote.
          showPostLoginBiometricPrompt(userId);
          showPostLoginAdoptionPrompt(userId);
          hide();
          startIdleWatch();
        } catch (e) {
          showError(errBox, e && e.message ? e.message : 'Nie udało się zalogować.');
        } finally {
          setBusy(false);
        }
      }
    });
    pw.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') submit.click(); });

    const backToList = el('a', {
      class: 'vilda-auth-link',
      href: '#',
      text: '← Wybierz inne konto',
      onclick: function (ev) { ev.preventDefault(); showStartupScreen(); }
    });

    const forgot = el('a', {
      class: 'vilda-auth-link vilda-auth-link-muted',
      href: '#',
      text: 'Zapomniałem hasła',
      onclick: function (ev) { ev.preventDefault(); showRecoveryFlowForUser(userId); }
    });

    // N11.1 — banner dla stanu „klucz zsynchronizowany ale nieaktywowany na tym
    // urządzeniu" (typowo: iPhone po pierwszej synchronizacji z Macowego konta).
    // Komunikat tłumaczy że user widzi „Touch ID" w pickerze, ale tu na razie
    // musi wpisać hasło — po sukcesie pojawi się modal aktywacji biometrii.
    let remoteOnlyHintBanner = null;
    if (hasOnlyRemotePasskeys) {
      remoteOnlyHintBanner = el('div', { class: 'vilda-auth-banner', role: 'status' });
      remoteOnlyHintBanner.style.cssText = 'background:#eef6f8;border:1px solid #cfe8eb;color:#0f5b63;padding:11px 13px;border-radius:10px;font-size:0.86rem;line-height:1.5;margin:6px 0 8px;';
      remoteOnlyHintBanner.innerHTML =
        '<strong>Klucz biometryczny tego konta</strong> jest dostępny tu przez iCloud Keychain, ' +
        'ale jeszcze go nie aktywowałeś na tym urządzeniu. ' +
        'Zaloguj się hasłem — od razu po sukcesie zapytamy o aktywację ' + getBiometricLabel() + '.';
    }

    // Adaptive-backoff banner: pokaż jednorazowo gdy auto-trigger został właśnie
    // automatycznie wyłączony (N anulowań z rzędu). Po pokazaniu kasujemy flagę
    // żeby banner nie wracał na każdym kolejnym ekranie.
    let autoOffBanner = null;
    if (hasBiometric && isBiometricAutoOffNoticePending(userId)) {
      autoOffBanner = el('div', { class: 'vilda-auth-banner', role: 'status' });
      autoOffBanner.style.cssText = 'background:#f0f8f9;border:1px solid #cfe0e3;color:#0f2b33;padding:10px 12px;border-radius:10px;font-size:0.85rem;line-height:1.4;margin:6px 0 4px;';
      autoOffBanner.innerHTML = 'Wyłączyliśmy automatyczne pytanie o ' + getBiometricLabel() +
        '. Kliknij 🪪 obok, kiedy zechcesz — albo włącz z powrotem w <strong>Ustawienia → Bezpieczeństwo</strong>.';
      setBiometricAutoOffNoticePending(userId, false);
    }

    // D.4 — banner po anulowaniu auto-trigger biometrii. Ukryty domyślnie,
    // pokazywany w error handlerze gdy NotAllowedError (user anulował OS modal
    // Touch ID/Face ID). Zawiera retry-link który ponawia biometric flow przez
    // biometricBtn.click() — reuse istniejącej logiki bez duplikacji.
    //
    // Kolor amber (#fff7ed/#fbd5a8/#854f0b) — ostrzeżenie, nie błąd (nie czerwone,
    // nie zielone). „Anulowałeś, nic się złego nie stało, masz opcję".
    let cancelledBanner = null;
    if (hasBiometric) {
      cancelledBanner = el('div', { class: 'vilda-auth-banner vilda-auth-banner-cancelled', role: 'status' });
      cancelledBanner.style.cssText = 'background:#fff7ed;border:1px solid #fbd5a8;color:#854f0b;padding:10px 12px;border-radius:10px;font-size:0.85rem;line-height:1.45;margin:6px 0 4px;display:none;';
      const cancelMsg = el('span', { text: 'Anulowałeś logowanie ' + getBiometricLabel() + '. Wpisz hasło, albo ' });
      const retryLink = el('a', {
        class: 'vilda-auth-link',
        href: '#',
        text: 'spróbuj ponownie',
        onclick: function (ev) {
          ev.preventDefault();
          if (cancelledBanner) cancelledBanner.style.display = 'none';
          // Reuse istniejącej logiki klika biometric (abort, busy, error, success).
          // biometricBtn.click() jest dostępne dzięki lift do outer scope wyżej.
          if (biometricBtn) biometricBtn.click();
        }
      });
      const cancelEnd = el('span', { text: '.' });
      cancelledBanner.appendChild(cancelMsg);
      cancelledBanner.appendChild(retryLink);
      cancelledBanner.appendChild(cancelEnd);
    }

    const screenChildren = [title, sub, banner];
    if (autoOffBanner) screenChildren.push(autoOffBanner);
    if (cancelledBanner) screenChildren.push(cancelledBanner);
    if (remoteOnlyHintBanner) screenChildren.push(remoteOnlyHintBanner);
    if (biometricSection) screenChildren.push(biometricSection);
    screenChildren.push(pw, errBox,
      el('div', { class: 'vilda-auth-actions' }, [submit]),
      el('div', { class: 'vilda-auth-links' }, [backToList]),
      el('div', { class: 'vilda-auth-links' }, [forgot])
    );

    const screen = el('div', { class: 'vilda-auth-screen vilda-auth-login' }, screenChildren);
    open(screen);

    // Jeśli biometria dostępna — od razu uruchom Face ID/Touch ID, nie czekaj na klik.
    // Pomijamy auto-trigger jeśli: (a) opts.skipAutoPasskey, (b) poprzednia próba w tej
    // sesji nie powiodła się (_passkeyAutoFailed) — chroni przed cooldown przeglądarki
    // po anulowaniu biometrii który powoduje wielosekundowe zamrożenie UI,
    // (c) adaptive backoff (cross-session): po N anulowaniach z rzędu lub świadomym
    // wyłączeniu w Ustawieniach biometricAutoTrigger=off → przycisk widoczny, klik ręcznie.
    const autoTriggerPref = getBiometricAutoTrigger(userId);
    if (hasBiometric && !opts.skipAutoPasskey && !_passkeyAutoFailed.has(userId) && autoTriggerPref === 'on') {
      setTimeout(async function () {
        abortPendingPasskey(); // anuluj ewentualny stary request z poprzedniego ekranu
        _passkeyAbortCtrl = new AbortController();
        const _sig = _passkeyAbortCtrl.signal;
        try {
          setBusy(true);
          showError(errBox, '');
          await V.unlockWithPasskey(userId, null, _sig);
          _passkeyAutoFailed.delete(userId); // sukces — resetuj flagę
          recordBiometricSuccess(userId); // zeruj persistent counter
          // D.4: ukryj banner anulowania po sukcesie auto-trigger.
          if (cancelledBanner) cancelledBanner.style.display = 'none';
          hide();
          startIdleWatch();
        } catch (e) {
          if (!_sig.aborted) {
            // Nie logujemy NotAllowedError z anulowania — to normalne zachowanie użytkownika
            if (e && e.name !== 'NotAllowedError') {
              logWarn('auto-passkey', e && e.name ? e.name + ': ' + e.message : String(e));
            }
            // Zablokuj auto-trigger na pozostałą część sesji — użytkownik może kliknąć ręcznie
            _passkeyAutoFailed.add(userId);
            // Adaptive backoff: inkrementuj persistent counter; po N z rzędu wyłączamy auto.
            // ADAPTIVE BACKOFF FIX: każdy błąd (NotAllowedError, InvalidStateError,
            // TimeoutError, browser quirks) traktujemy jak dismissal — z punktu widzenia
            // usera „biometria nie zadziałała, nie chcę żeby się znów pojawiała". Pomijamy
            // tylko AbortError (= my sami abortowaliśmy via navigation/screen change).
            if (e && e.name !== 'AbortError') {
              recordBiometricDismissal(userId);
              // D.4: pokaż kontekstowy banner z retry-link zamiast cicho focusować pole
              // hasła. User wie co się stało („Anulowałeś Touch ID") i ma dwie opcje:
              // wpisać hasło albo kliknąć „spróbuj ponownie" — bez nawigacji do innego
              // ekranu. Banner ukrywany na success (w biometricBtn click handlerze).
              if (cancelledBanner) cancelledBanner.style.display = '';
            }
            setBusy(false);
            try { pw.focus(); } catch (_) {}
          }
          // jeśli _sig.aborted: abortPendingPasskey() już wywołało setBusy(false)
        } finally {
          _passkeyAbortCtrl = null;
          // Symetria z ręcznym kliknięciem biometrii: zawsze czyść busy w finally.
          // Na ścieżce sukcesu setBusy(false) nie było wołane — bez tego data-busy="1"
          // zostaje na rootEl i przy kolejnym open() karta ma pointer-events:none (CSS),
          // co sprawia że UI (lista pacjentów, ekran startowy po logout) wygląda na zamrożone.
          // Gdy aborted: abortPendingPasskey() już wywołało setBusy(false) — removeAttribute
          // na elemencie który już go nie ma jest bezpieczne (no-op).
          if (!_sig.aborted) setBusy(false);
        }
      }, 100);
    } else {
      setTimeout(function () { try { pw.focus(); } catch (_) {} }, 30);
    }

    // D.3 — Conditional mediation w tle.
    // Niezależne od auto-trigger D.2:
    //   • auto-trigger pokazuje modal natychmiast (1 user, current account)
    //   • conditional czeka pasywnie w autofill (każdy passkey z dowolnego konta)
    // Tylko jeden navigator.credentials.get() per origin może być aktywny — jeśli
    // auto-trigger D.2 wystartuje, wewnątrz wywołuje abortPendingPasskey() które
    // ubija też conditional.
    //
    // ADAPTIVE BACKOFF FIX: gdy autoTriggerPref='off' (user 2x anulował lub
    // wyłączył w Ustawieniach), NIE startujemy conditional. User powiedział
    // „nie chcę biometrii" — autofill też nie powinno podpowiadać passkey.
    // Inaczej user klika pole hasła, widzi passkey w autofill, klika go odruchowo,
    // pojawia się modal Touch ID — z punktu widzenia usera „aplikacja nadal się narzuca".
    if (autoTriggerPref === 'on') {
      maybeStartConditionalMediation();
    }
  }

  /**
   * D.3 — Start conditional mediation w tle.
   *
   * Wywołanie wisi do user-pick z autofill (lub abort z nawigacji). Po sukcesie
   * vault.unlockWithPasskeyConditional zwraca {userId, label}, my robimy hide()
   * + startIdleWatch jak inne ścieżki unlock.
   *
   * Failure modes (wszystkie ciche — nie pokazujemy błędu, conditional jest UX
   * dodatkiem, nie zastępuje password input):
   *   • brak wsparcia conditional UI w przeglądarce → return null
   *   • signal aborted → return null lub AbortError catch
   *   • user nie wybrał z autofill → promise wisi do navigation/abort
   *   • passkey wybrany ale userHandle nie pasuje do żadnego konta → log warning,
   *     fallback do password input (user wciąż może wpisać hasło)
   */
  async function maybeStartConditionalMediation() {
    const V = getVault();
    if (!V || typeof V.unlockWithPasskeyConditional !== 'function') return;
    // Defensywne: AbortController istnieje w przeglądarkach >2018, ale test smoke
    // (mock VM context) i bardzo stare środowiska mogą go nie mieć — skip.
    if (typeof AbortController === 'undefined') return;

    abortPendingConditional();
    _conditionalAbortCtrl = new AbortController();
    const _sig = _conditionalAbortCtrl.signal;

    try {
      const result = await V.unlockWithPasskeyConditional(_sig);
      if (_sig.aborted) return;
      if (!result) return; // null = niewspierane lub user nie wybrał

      // Sukces — identycznie jak D.2 auto-trigger po unlockWithPasskey
      _passkeyAutoFailed.delete(result.userId);
      recordBiometricSuccess(result.userId);
      hide();
      startIdleWatch();
    } catch (e) {
      if (_sig.aborted) return;
      if (e && e.name === 'AbortError') return;
      // Conditional fail jest cichy — nie pokazujemy w UI bo to background autofill.
      // User wciąż ma password input + biometric button (D.2 auto-trigger osobno).
      logWarn('conditional-passkey', e && e.message ? e.message : String(e));
    } finally {
      if (_conditionalAbortCtrl && _conditionalAbortCtrl.signal === _sig) {
        _conditionalAbortCtrl = null;
      }
    }
  }

  /**
   * Wyświetla jednorazową propozycję włączenia biometrii po zalogowaniu hasłem.
   * Pokazuje się tylko raz (flaga w localStorage) i tylko gdy PRF jest wspierany
   * i użytkownik nie ma jeszcze żadnych passkeys.
   *
   * FIX (2026-05-28): wcześniej był blok resetujący flagę gdy passkeys.length === 0
   * (rzekomo żeby naprawić "stary buggy kod"). Konsekwencja: user klika "Nie teraz",
   * przy następnym logowaniu hasłem flaga jest resetowana (bo nadal nie ma passkey),
   * prompt pojawia się znowu — nieskończona pętla. Usunięto reset; flaga raz ustawiona
   * zostaje na zawsze. User chcący włączyć biometrię używa Ustawienia → Bezpieczeństwo.
   *
   * @param {string} userId
   */
  async function showPostLoginBiometricPrompt(userId) {
    const V = getVault();
    if (!V) return;

    const flagKey = 'vilda:biometricPromptShown:' + userId;

    // Krótka ścieżka: flaga już ustawiona → user widział prompt, szanujemy decyzję
    // ("Nie teraz" = nie pytaj więcej automatycznie, włączy ręcznie w Ustawieniach
    // gdy zechce).
    if (localStorage.getItem(flagKey)) return;

    let prfOk = false;
    let passkeys = [];
    try {
      prfOk = await V.isPrfSupported();
      if (prfOk) passkeys = await V.listPasskeys(userId);
    } catch (_) { return; }

    // Pokaż tylko gdy PRF dostępny i brak już zarejestrowanego passkey
    if (!prfOk || passkeys.length > 0) return;

    // Oznacz jako pokazany — dopiero teraz, tuż przed renderowaniem.
    // Niezależnie od tego co user kliknie ("Tak, włącz" czy "Nie teraz"), flaga
    // zostaje ustawiona i prompt nie wróci. Jeśli rejestracja passkey się nie powiedzie,
    // user może spróbować ponownie z Ustawienia → Bezpieczeństwo.
    localStorage.setItem(flagKey, new Date().toISOString());

    const bioLabel = getBiometricLabel();
    const overlay = el('div', { class: 'vilda-auth-overlay vilda-auth-overlay-sheet' });
    const sheet = el('div', { class: 'vilda-auth-sheet' }, [
      el('h3', { class: 'vilda-auth-sheet-title', text: 'Chcesz logować się przez ' + bioLabel + '?' }),
      el('p', {
        class: 'vilda-auth-sheet-body',
        text: 'Następnym razem jeden dotyk wystarczy — bez wpisywania hasła.'
      }),
      el('div', { class: 'vilda-auth-sheet-actions' }, [
        el('button', {
          class: 'vilda-auth-btn vilda-auth-btn-primary',
          type: 'button',
          text: 'Tak, włącz ' + bioLabel,
          onclick: async function () {
            overlay.remove();
            try {
              await V.registerPasskey();
            } catch (e) {
              // Cicha obsługa — użytkownik może to zawsze zrobić w ustawieniach
              logError('registerPasskey (prompt)', e);
            }
          }
        }),
        el('button', {
          class: 'vilda-auth-btn vilda-auth-btn-ghost',
          type: 'button',
          text: 'Nie teraz',
          onclick: function () { overlay.remove(); }
        })
      ])
    ]);

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
  }

  /**
   * N10.3 — Prompt adopcji passkey zsynchronizowanego z innego urządzenia.
   *
   * Use case (Apple iCloud Keychain):
   *   Mac: registerPasskey → meta.passkeys = [{M_CRED, encryptedMasterByPasskey}]
   *   sync → cloud (bez encryptedMasterByPasskey)
   *   iPhone: pull → meta.passkeys = [{M_CRED, brak encryptedMasterByPasskey}]
   *   iPhone: zalogował się hasłem → ten prompt → "Aktywuj biometrię" → adoptSyncedPasskey()
   *           → iPhone's get-PRF wrappuje master → meta.passkeys[0].encryptedMasterByPasskey
   *           teraz istnieje LOKALNIE → Face ID login na iPhonie działa.
   *
   * Wykluczające z showPostLoginBiometricPrompt: tamten działa gdy passkeys.length===0,
   * ten gdy passkeys.length>0 i wszystkie są remote.
   */
  async function showPostLoginAdoptionPrompt(userId) {
    const V = getVault();
    if (!V) return;
    if (typeof V.listAdoptablePasskeys !== 'function') return; // starszy vault — pomijamy

    const flagKey = 'vilda:adoptionPromptShown:' + userId;
    if (localStorage.getItem(flagKey)) return;

    let prfOk = false;
    let adoptable = [];
    try {
      prfOk = await V.isPrfSupported();
      if (prfOk) adoptable = await V.listAdoptablePasskeys();
    } catch (_) { return; }

    if (!prfOk || !adoptable.length) return;

    // Oznacz jako pokazany — po wybraniu opcji (Aktywuj / Pominę) prompt nie wraca.
    // User może aktywować ręcznie z Ustawienia → Bezpieczeństwo.
    localStorage.setItem(flagKey, new Date().toISOString());

    const bioLabel = getBiometricLabel();
    // Bierzemy pierwszy adoptable (najczęstszy scenariusz: jeden iCloud Keychain credential).
    const target = adoptable[0];

    const overlay = el('div', { class: 'vilda-auth-overlay vilda-auth-overlay-sheet' });
    const sheet = el('div', { class: 'vilda-auth-sheet' }, [
      el('h3', { class: 'vilda-auth-sheet-title', text: 'Aktywuj ' + bioLabel + ' na tym urządzeniu?' }),
      el('p', {
        class: 'vilda-auth-sheet-body',
        html: 'Wykryliśmy biometryczny klucz Twojego konta zsynchronizowany przez iCloud Keychain ' +
              '(zarejestrowany jako <strong>' + escapeHtmlLocal(target.deviceLabel) + '</strong>). ' +
              'Aby logować się tu jednym ' + bioLabel + ' musisz go aktywować — to wymaga jednego potwierdzenia biometrycznego.'
      }),
      el('div', { class: 'vilda-auth-sheet-actions' }, [
        el('button', {
          class: 'vilda-auth-btn vilda-auth-btn-primary',
          type: 'button',
          text: 'Aktywuj ' + bioLabel,
          onclick: async function () {
            overlay.remove();
            try {
              await V.adoptSyncedPasskey(target.credentialId);
              // Sukces — kolejne logowania będą używać biometrii.
            } catch (e) {
              // Cicha obsługa — user może spróbować ponownie z Ustawienia → Bezpieczeństwo.
              logError('adoptSyncedPasskey (prompt)', e);
            }
          }
        }),
        el('button', {
          class: 'vilda-auth-btn vilda-auth-btn-ghost',
          type: 'button',
          text: 'Pominę teraz',
          onclick: function () { overlay.remove(); }
        })
      ])
    ]);

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
  }

  // Lokalny escape żeby nie zależeć od helpera ze setting'sów —
  // używany przez prompt adopcji do bezpiecznego renderowania deviceLabel.
  function escapeHtmlLocal(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ============ ODZYSKIWANIE DOSTĘPU ============
  async function showRecoveryFlowForUser(userId) {
    const V = getVault();
    const C = getCrypto();
    if (!V || !C) return;
    let user = null;
    try {
      const users = await V.listUsers();
      user = users.find(function (u) { return u.userId === userId; });
    } catch (e) { logError('listUsers', e); }
    if (!user) { await showStartupScreen(); return; }

    const title = el('h2', { class: 'vilda-auth-title', text: 'Odzyskaj dostęp' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Konto: „' + user.label + '”. Wpisz klucz odzyskiwania (24 znaki w 6 grupach po 4) i ustaw nowe hasło.'
    });

    const rkInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input vilda-auth-recovery-input',
      placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX',
      autocomplete: 'off'
    });
    const pw1 = el('input', { type: 'password', class: 'vilda-auth-input', placeholder: 'Nowe hasło (min. 12 znaków, 3 z 4 typów)' });
    const pw2 = el('input', { type: 'password', class: 'vilda-auth-input', placeholder: 'Powtórz nowe hasło' });
    const errBox = el('div', { class: 'vilda-auth-error' });
    errBox.style.display = 'none';

    const submit = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Odblokuj i ustaw nowe hasło',
      onclick: async function () {
        showError(errBox, '');
        if (!C.isValidRecoveryKeyShape(rkInput.value)) {
          showError(errBox, 'Klucz odzyskiwania ma nieprawidłowy format.');
          return;
        }
        if (pw1.value.length < 8) {
          showError(errBox, 'Nowe hasło musi mieć minimum 8 znaków.');
          return;
        }
        if (pw1.value !== pw2.value) {
          showError(errBox, 'Hasła nie są takie same.');
          return;
        }
        setBusy(true);
        try {
          await V.unlockUserWithRecoveryKey(userId, rkInput.value);
          await V.resetPasswordWhileUnlocked(pw1.value);
          hide();
          startIdleWatch();
        } catch (e) {
          showError(errBox, e && e.message ? e.message : 'Nie udało się odzyskać dostępu.');
        } finally {
          setBusy(false);
        }
      }
    });

    const back = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: 'Wstecz',
      onclick: function () { showLoginForUser(userId); }
    });

    open(el('div', { class: 'vilda-auth-screen vilda-auth-recovery' }, [
      title, sub, rkInput, pw1, pw2, errBox,
      el('div', { class: 'vilda-auth-actions' }, [back, submit])
    ]));
    setTimeout(function () { try { rkInput.focus(); } catch (_) {} }, 30);
  }

  // ============ ODTWARZANIE Z PEŁNEJ KOPII VAULTU ============
  // Restore tworzy nowe konto z TYM SAMYM master keyem co backup. Po
  // zakończonym restore aplikacja jest automatycznie odblokowana — user
  // przechodzi prosto do swoich danych.
  function showRestoreVaultFlow() {
    const V = getVault();
    const C = getCrypto();
    if (!V || !C) return;

    const title = el('h2', { class: 'vilda-auth-title', text: 'Odtwórz konto z kopii' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Wybierz plik z pełną kopią Twojego konta (np. wagaiwzrost_konto_<imię>.wiw) i podaj hasło, którym był zaszyfrowany. Aplikacja odtworzy identyczne konto razem z całą historią pacjentów.'
    });

    const fileInput = el('input', {
      type: 'file',
      accept: '*/*', // iOS nie obsługuje .wiw/.vilda bez UTI — accept=* pokazuje wszystkie pliki
      style: 'display:none;'
    });

    const pickBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-small',
      type: 'button',
      text: 'Wybierz plik kopii konta',
      onclick: function () { fileInput.click(); }
    });

    const fileLabel = el('p', {
      class: 'vilda-auth-side-note',
      style: 'text-align:center; margin:0 0 8px 0;',
      text: 'Plik nie wybrany'
    });

    const pwInput = el('input', { type: 'password', class: 'vilda-auth-input', placeholder: 'Hasło ze starego konta' });
    const labelInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input',
      placeholder: 'Nazwa konta w aplikacji (opcjonalnie, np. dr Kowalska)',
      maxlength: '60'
    });

    const errBox = el('div', { class: 'vilda-auth-error' });
    errBox.style.display = 'none';

    const reportBox = el('div', { class: 'vilda-auth-info', style: 'display:none; text-align:left;' });

    let pickedFileText = null;
    let pickedFilename = null;
    let pickedKind = null; // 'vault-backup' | 'patient' | null

    let applyPickedKind = function (kind, parsedMeta) {
      pickedKind = kind;
      if (kind === 'vault-backup') {
        // standardowy flow — pokazujemy pole hasła, label, przycisk Odtwórz
        const lbl = (parsedMeta && parsedMeta.label) ? parsedMeta.label : '(bez nazwy)';
        const pCount = parsedMeta && typeof parsedMeta.patientCount === 'number' ? parsedMeta.patientCount : '?';
        const sCount = parsedMeta && typeof parsedMeta.snapshotCount === 'number' ? parsedMeta.snapshotCount : '?';
        // B1.10: zmiana copy — snapshotCount to liczba zapisów vaulta, nie liczba wizyt
        // pacjenta. Te dwa modele czasu w aplikacji (data zapisu vs wiek pacjenta) były
        // mylone. Tutaj jesteśmy w kontekście kopii zapasowej konta — mówimy „zapisów".
        fileLabel.textContent = '✓ Pełna kopia konta „' + lbl + '" — pacjenci: ' + pCount + ', zapisów: ' + sCount;
        pwInput.style.display = '';
        labelInput.style.display = '';
        submit.style.display = '';
        showError(errBox, '');
        if (wrongKindHint) wrongKindHint.style.display = 'none';
      } else if (kind === 'patient') {
        // ZŁY TYP — to plik per-pacjent. Pokazujemy zwięzły komunikat
        // + propozycję alternatywnej ścieżki, ukrywamy pola.
        fileLabel.textContent = 'Wybrany plik to kopia pojedynczego pacjenta';
        pwInput.style.display = 'none';
        labelInput.style.display = 'none';
        submit.style.display = 'none';
        showError(errBox, '');
        if (wrongKindHint) wrongKindHint.style.display = 'block';
      } else {
        fileLabel.textContent = 'Plik nie wybrany';
        pwInput.style.display = '';
        labelInput.style.display = '';
        submit.style.display = '';
        if (wrongKindHint) wrongKindHint.style.display = 'none';
      }
    };

    let wrongKindHint = null; // utworzony niżej

    fileInput.addEventListener('change', async function (ev) {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      try {
        const reader = new global.FileReader();
        reader.onload = function () {
          pickedFileText = reader.result;
          pickedFilename = f.name;
          // próba parsowania envelope, żeby od razu rozpoznać typ
          try {
            const parsed = C.parseEnvelope(pickedFileText);
            applyPickedKind(parsed.kind, parsed.metadata);
          } catch (parseErr) {
            pickedKind = null;
            fileLabel.textContent = 'Wybrany plik: ' + f.name;
            showError(errBox, 'Plik nie wygląda na kopię z aplikacji wagaiwzrost.pl.');
            if (wrongKindHint) wrongKindHint.style.display = 'none';
          }
        };
        reader.onerror = function () {
          showError(errBox, 'Nie udało się odczytać pliku.');
        };
        reader.readAsText(f, 'utf-8');
      } catch (e) {
        showError(errBox, 'Błąd odczytu pliku: ' + (e && e.message ? e.message : e));
      } finally {
        fileInput.value = '';
      }
    });

    const submit = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Odtwórz konto',
      onclick: async function () {
        showError(errBox, '');
        if (!pickedFileText) {
          showError(errBox, 'Wybierz plik kopii konta.');
          return;
        }
        if (!pwInput.value || pwInput.value.length < 1) {
          showError(errBox, 'Wpisz hasło ze starego konta.');
          return;
        }
        setBusy(true);
        try {
          const opts = {};
          if (labelInput.value && labelInput.value.trim()) opts.label = labelInput.value.trim();
          const result = await V.restoreVaultBackup(pickedFileText, pwInput.value, opts);
          // Sukces — pokaż raport i przycisk "Przejdź do aplikacji"
          while (reportBox.firstChild) reportBox.removeChild(reportBox.firstChild);
          reportBox.style.display = 'block';
          reportBox.appendChild(el('strong', { text: 'Konto odtworzone' }));
          reportBox.appendChild(el('br'));
          reportBox.appendChild(global.document.createTextNode('Nazwa: ' + result.label));
          reportBox.appendChild(el('br'));
          // B1.10: „wpisów z wizyt" → „zapisów" (kontekst: backup konta, snapshoty vault).
          reportBox.appendChild(global.document.createTextNode('Pacjenci: ' + result.patientCount + ' · zapisów: ' + result.snapshotCount));
          if (result.newRecoveryKey) {
            reportBox.appendChild(el('br'));
            reportBox.appendChild(el('br'));
            const warn = el('strong', { text: 'UWAGA: Backup nie zawierał klucza odzyskiwania.' });
            reportBox.appendChild(warn);
            reportBox.appendChild(el('br'));
            reportBox.appendChild(global.document.createTextNode('Aplikacja wygenerowała nowy klucz odzyskiwania dla tego konta. Zapisz go bezpiecznie:'));
            reportBox.appendChild(el('br'));
            const keyEl = el('code', { style: 'display:block; padding:8px; background:#f5fafb; border-radius:8px; margin-top:6px; word-break:break-all;', text: result.newRecoveryKey });
            reportBox.appendChild(keyEl);
          }

          submit.style.display = 'none';
          back.textContent = 'Przejdź do aplikacji';
          back.onclick = function () { hide(); startIdleWatch(); };
        } catch (e) {
          showError(errBox, e && e.message ? e.message : 'Nie udało się odtworzyć konta.');
        } finally {
          setBusy(false);
        }
      }
    });

    const back = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: 'Wstecz',
      onclick: function () { showStartupScreen(); }
    });

    // Panel informacyjny gdy user wybrał plik per-pacjent zamiast pełnej kopii konta.
    wrongKindHint = el('div', { class: 'vilda-auth-info', style: 'display:none; text-align:left;' });
    wrongKindHint.appendChild(el('strong', { text: 'To kopia pojedynczego pacjenta' }));
    wrongKindHint.appendChild(el('br'));
    wrongKindHint.appendChild(global.document.createTextNode('Funkcja „Odtwórz konto z pełnej kopii" wymaga pliku z całym kontem (nazwa zaczyna się od „wagaiwzrost_konto_…"). Wybrany plik („' ));
    const fnameEl = el('em', { text: '' });
    wrongKindHint.appendChild(fnameEl);
    wrongKindHint.appendChild(global.document.createTextNode('") to kopia jednego pacjenta z konta źródłowego.'));
    wrongKindHint.appendChild(el('br'));
    wrongKindHint.appendChild(el('br'));
    wrongKindHint.appendChild(global.document.createTextNode('Jeśli masz tylko pliki pacjentów, możesz odzyskać dane w dwóch krokach:'));
    const stepsList = el('ol', { style: 'margin:6px 0 12px 18px; padding:0; line-height:1.6;' });
    stepsList.appendChild(el('li', { text: 'Skonfiguruj nowe konto (z dowolnym hasłem).' }));
    stepsList.appendChild(el('li', { text: 'W krokie 3 kreatora kliknij „Wczytaj kopie pacjentów teraz" i wpisz hasło ze starego konta.' }));
    wrongKindHint.appendChild(stepsList);
    const setupRedirectBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary vilda-auth-btn-small',
      type: 'button',
      text: 'Skonfiguruj nowe konto',
      onclick: function () { showSetupWizard(); }
    });
    wrongKindHint.appendChild(el('div', { class: 'vilda-auth-section-action', style: 'margin-top:6px;' }, [setupRedirectBtn]));

    // gdy parsujemy plik z kind=patient, wpiszemy nazwę pliku do <em>
    const origApplyPickedKind = applyPickedKind;
    applyPickedKind = function (kind, parsedMeta) {
      if (fnameEl) fnameEl.textContent = pickedFilename || '';
      origApplyPickedKind(kind, parsedMeta);
    };

    open(el('div', { class: 'vilda-auth-screen vilda-auth-restore' }, [
      title, sub,
      el('div', { class: 'vilda-auth-section-action' }, [pickBtn]),
      fileLabel,
      wrongKindHint,
      pwInput,
      labelInput,
      errBox,
      reportBox,
      fileInput,
      el('div', { class: 'vilda-auth-actions' }, [back, submit])
    ]));
    setTimeout(function () { try { pwInput.focus(); } catch (_) {} }, 30);
  }

  // ============ SPARKLINE WZROSTU ============
  // ============ HELPERY DLA KARTY PACJENTA (Faza 42 — koncepcja C) ============

  /**
   * Faza 42: inwersja formuły LMS — z parametrów L, M, S oblicza wartość
   * (BMI / wzrost / waga) dla zadanego z-score (np. -1.881 dla 3. centyla).
   */
  function valueAtZ(L, M, S, z) {
    if (!isFinite(L) || !isFinite(M) || !isFinite(S)) return NaN;
    if (Math.abs(L) < 1e-6) return M * Math.exp(S * z);
    var base = 1 + L * S * z;
    if (base <= 0) return NaN;
    return M * Math.pow(base, 1 / L);
  }

  /**
   * Faza 42c: kanoniczny odczyt wieku z obiektu pomiaru.
   * UWAGA: `growth-basic-module.js` zapisuje JEDNOCZEŚNIE:
   *   - `ageYears` jako ułamkowe lata (np. 8.5)
   *   - `ageMonths` jako TOTAL miesięcy (np. 102), NIE jako część miesiącową
   * Wcześniejsza formuła `ageYears*12 + ageMonths` dawała dublowanie (8.5*12+102=204).
   * Tu preferujemy `ageMonths` (jeśli istnieje) jako TOTAL; fallback do `ageYears*12`.
   * Akceptujemy też migawki ze snapshotów historycznych zapisane jako `{ageMonths: total}`.
   */
  function measurementAgeInMonths(m) {
    if (!m) return NaN;
    if (m.ageMonths != null && isFinite(m.ageMonths)) return Number(m.ageMonths);
    if (m.ageYears != null && isFinite(m.ageYears)) return Number(m.ageYears) * 12;
    return NaN;
  }

  /**
   * Faza 42b: konwertuje tablicę punktów {x, y} na ścieżkę SVG z gładkimi
   * krzywymi Béziera (Catmull-Rom przez 4 sąsiednie punkty). Daje
   * naturalnie wyglądające siatki centylowe bez „kantów" polyline.
   */
  function pointsToSmoothPath(pts) {
    if (!pts || pts.length === 0) return '';
    if (pts.length === 1) return 'M ' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
    if (pts.length === 2) {
      return 'M ' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1) +
             ' L ' + pts[1].x.toFixed(1) + ',' + pts[1].y.toFixed(1);
    }
    var d = 'M ' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[i + 2] || pts[i + 1];
      var c1x = p1.x + (p2.x - p0.x) / 6;
      var c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6;
      var c2y = p2.y - (p3.y - p1.y) / 6;
      d += ' C ' + c1x.toFixed(1) + ',' + c1y.toFixed(1) +
           ' '  + c2x.toFixed(1) + ',' + c2y.toFixed(1) +
           ' '  + p2.x.toFixed(1) + ',' + p2.y.toFixed(1);
    }
    return d;
  }

  /**
   * Faza 42: zwraca info o statusie BMI pacjenta — label i klasę CSS (ok/improve/alert).
   * Dla dzieci używa percentyla BMI; dla dorosłych — bezwzględnej wartości BMI.
   */
  function buildBmiStatusInfo(bmi, bmiPerc, isAdult) {
    if (isAdult) {
      if (bmi == null || !isFinite(bmi)) return null;
      if (bmi >= 40)    return { label: 'Otyłość III°', cls: 'alert' };
      if (bmi >= 35)    return { label: 'Otyłość II°',  cls: 'alert' };
      if (bmi >= 30)    return { label: 'Otyłość I°',   cls: 'alert' };
      if (bmi >= 25)    return { label: 'Nadwaga',      cls: 'improve' };
      if (bmi < 18.5)   return { label: 'Niedowaga',    cls: 'alert' };
      return                  { label: 'Norma BMI',     cls: 'ok' };
    }
    if (bmiPerc == null || !isFinite(bmiPerc)) return null;
    if (bmiPerc >= 99) return { label: 'Otyłość ciężka', cls: 'alert' };
    if (bmiPerc >= 95) return { label: 'Otyłość',        cls: 'alert' };
    if (bmiPerc >= 85) return { label: 'Nadwaga',        cls: 'improve' };
    if (bmiPerc < 3)   return { label: 'Niedowaga',      cls: 'alert' };
    return                   { label: 'Norma BMI',      cls: 'ok' };
  }

  /**
   * Faza 42b: generyczny builder siatki centylowej (BMI / wzrost / waga)
   * z wygładzonymi krzywymi (Catmull-Rom) i trajektorią pomiarów pacjenta.
   * Dla dorosłych (≥18 lat) zwraca null. Linie 3/10/50/90/97 percentyl.
   * @param {string} type — 'bmi' | 'height' | 'weight'
   * @param {Array}  measurements — [{ageYears, ageMonths, height, weight}, …]
   * @param {string} sexForCalc — M/K/chłopiec/dziewczynka
   * @param {number} currentAgeMonths — wiek bieżący (total months)
   * @param {number} currentValue — bieżąca wartość metryki (BMI/cm/kg)
   * @returns {SVGElement|null}
   */
  function buildPercentileChart(type, measurements, sexForCalc, currentAgeMonths, currentValue) {
    if (currentAgeMonths == null) return null;
    if (currentAgeMonths > 216) return null; // dorosły — brak siatki

    // ── Konfiguracja per typ ──
    var typeConfig;
    if (type === 'bmi') {
      typeConfig = {
        title: 'BMI',
        unit: 'kg/m²',
        minAgeAllowed: 24,
        yAxisStep: 4,
        yMinClamp: 10,
        sampleStep: 12,    // Faza 42d: rzadziej dla BMI (co rok) — krzywe gładsze
        smoothWindow: 2,   // 5-punktowy moving average eliminuje szum LMS
        normalizeSex: function (s) {
          var sl = (s || '').toLowerCase();
          if (sl === 'm' || sl === 'ch' || sl === 'chłopiec' || sl === 'male') return 'M';
          return 'K';
        },
        getLms: function (sex, months) {
          if (typeof global.getLMS !== 'function') return null;
          var nSex = (typeof this.normalizeSex === 'function') ? this.normalizeSex(sex) : sex;
          return global.getLMS(nSex, months);
        },
        extractValue: function (m) {
          var h = parseFloat(m.height), w = parseFloat(m.weight);
          if (!isFinite(h) || !isFinite(w) || h <= 0) return null;
          return w / Math.pow(h / 100, 2);
        }
      };
    } else if (type === 'height') {
      typeConfig = {
        title: 'Wzrost',
        unit: 'cm',
        minAgeAllowed: 0,
        yAxisStep: 10,
        yMinClamp: 40,
        sampleStep: 3,
        smoothWindow: 0,
        normalizeSex: function (s) {
          var sl = (s || '').toLowerCase();
          if (sl === 'm' || sl === 'ch' || sl === 'chłopiec' || sl === 'male') return 'M';
          return 'K';
        },
        getLms: function (sex, months) {
          if (typeof global.getChildLMS !== 'function') return null;
          var nSex = (typeof this.normalizeSex === 'function') ? this.normalizeSex(sex) : sex;
          return global.getChildLMS(nSex, months / 12, 'HT');
        },
        extractValue: function (m) {
          var v = parseFloat(m.height);
          return (isFinite(v) && v > 0) ? v : null;
        }
      };
    } else if (type === 'weight') {
      typeConfig = {
        title: 'Waga',
        unit: 'kg',
        minAgeAllowed: 0,
        yAxisStep: 5,
        yMinClamp: 2,
        sampleStep: 3,
        smoothWindow: 0,
        normalizeSex: function (s) {
          var sl = (s || '').toLowerCase();
          if (sl === 'm' || sl === 'ch' || sl === 'chłopiec' || sl === 'male') return 'M';
          return 'K';
        },
        getLms: function (sex, months) {
          if (typeof global.getChildLMS !== 'function') return null;
          var nSex = (typeof this.normalizeSex === 'function') ? this.normalizeSex(sex) : sex;
          return global.getChildLMS(nSex, months / 12, 'WT');
        },
        extractValue: function (m) {
          var v = parseFloat(m.weight);
          return (isFinite(v) && v > 0) ? v : null;
        }
      };
    } else {
      return null;
    }

    var svgNS = 'http://www.w3.org/2000/svg';

    // ── Zakres wieku z pomiarów ──
    var ages = [];
    (measurements || []).forEach(function (m) {
      if (!m) return;
      var ageMo = measurementAgeInMonths(m);
      if (isFinite(ageMo)) ages.push(ageMo);
    });
    if (isFinite(currentAgeMonths)) ages.push(currentAgeMonths);
    if (ages.length === 0) return null;

    var minAgeM = Math.min.apply(null, ages);
    var maxAgeM = Math.max.apply(null, ages);
    var ageStart = Math.max(typeConfig.minAgeAllowed, Math.floor((minAgeM - 12) / 12) * 12);
    var ageEnd   = Math.min(216, Math.ceil((maxAgeM + 12) / 12) * 12);
    if (ageEnd - ageStart < 36) ageEnd = Math.min(216, ageStart + 36);

    // ── Próbkowanie krzywych centylowych ──
    var Z_VALUES = [
      { z: -1.881, label: '3',  color: '#9FE1CB' },
      { z: -1.282, label: '10', color: '#5DCAA5' },
      { z:  0,     label: '50', color: '#0F6E56' },
      { z:  1.282, label: '90', color: '#5DCAA5' },
      { z:  1.881, label: '97', color: '#9FE1CB' }
    ];
    var curves = Z_VALUES.map(function () { return []; });
    var minVal = Infinity, maxVal = -Infinity;

    var step = (typeConfig.sampleStep && typeConfig.sampleStep > 0) ? typeConfig.sampleStep : 3;
    for (var mAge = ageStart; mAge <= ageEnd; mAge += step) {
      var lms = typeConfig.getLms(sexForCalc, mAge);
      if (!lms) continue;
      Z_VALUES.forEach(function (zv, idx) {
        var val = valueAtZ(lms[0], lms[1], lms[2], zv.z);
        if (isFinite(val)) {
          curves[idx].push({ age: mAge, val: val });
        }
      });
    }

    // Faza 42d — moving average smoothing dla krzywych percentyli (głównie BMI).
    // Eliminuje miesięczne wahania w tabelach LMS i artefakty na granicy WHO/OLAF.
    var sw = (typeConfig.smoothWindow && typeConfig.smoothWindow > 0) ? typeConfig.smoothWindow : 0;
    if (sw > 0) {
      curves = curves.map(function (curve) {
        if (curve.length < 3) return curve;
        var smoothed = [];
        for (var i = 0; i < curve.length; i++) {
          var lo = Math.max(0, i - sw);
          var hi = Math.min(curve.length - 1, i + sw);
          var sum = 0, count = 0;
          for (var j = lo; j <= hi; j++) { sum += curve[j].val; count++; }
          smoothed.push({ age: curve[i].age, val: sum / count });
        }
        return smoothed;
      });
    }

    // Po smoothingu — aktualny zakres min/max
    curves.forEach(function (curve) {
      curve.forEach(function (p) {
        if (p.val < minVal) minVal = p.val;
        if (p.val > maxVal) maxVal = p.val;
      });
    });
    if (!isFinite(minVal) || !isFinite(maxVal)) return null;

    // ── Trajektoria pomiarów pacjenta ──
    var trajectory = [];
    (measurements || []).forEach(function (meas) {
      if (!meas) return;
      var ageMo = measurementAgeInMonths(meas);
      if (!isFinite(ageMo) || ageMo < ageStart || ageMo > ageEnd) return;
      var v = typeConfig.extractValue(meas);
      if (v == null || !isFinite(v)) return;
      trajectory.push({ age: ageMo, val: v });
    });
    if (currentValue != null && isFinite(currentValue)) {
      if (currentValue < minVal) minVal = currentValue;
      if (currentValue > maxVal) maxVal = currentValue;
      var inTraj = trajectory.some(function (p) {
        return Math.abs(p.age - currentAgeMonths) < 1 && Math.abs(p.val - currentValue) < 0.05;
      });
      if (!inTraj && currentAgeMonths >= ageStart && currentAgeMonths <= ageEnd) {
        trajectory.push({ age: currentAgeMonths, val: currentValue });
      }
    }
    trajectory.forEach(function (p) {
      if (p.val < minVal) minVal = p.val;
      if (p.val > maxVal) maxVal = p.val;
    });
    trajectory.sort(function (a, b) { return a.age - b.age; });

    // ── Pad Y range ──
    var rangePad = (maxVal - minVal) * 0.06;
    minVal = Math.max(typeConfig.yMinClamp, minVal - rangePad);
    maxVal = maxVal + rangePad;

    // ── Geometria SVG ──
    var W = 360, H = 220;
    var PAD_L = 32, PAD_R = 22, PAD_T = 10, PAD_B = 24;
    var chartW = W - PAD_L - PAD_R;
    var chartH = H - PAD_T - PAD_B;

    function toX(ageM) { return PAD_L + (ageM - ageStart) / (ageEnd - ageStart) * chartW; }
    function toY(v)    { return PAD_T + (1 - (v - minVal) / (maxVal - minVal)) * chartH; }

    var svg = global.document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'vilda-patient-chart');
    svg.setAttribute('aria-label', 'Siatka centylowa ' + typeConfig.title);

    // ── Grid X (co 2 lata) + etykiety ──
    var startY = Math.ceil(ageStart / 12) * 12;
    for (var ag = startY; ag <= ageEnd; ag += 24) {
      var xg = toX(ag);
      var gx = global.document.createElementNS(svgNS, 'line');
      gx.setAttribute('x1', xg); gx.setAttribute('x2', xg);
      gx.setAttribute('y1', PAD_T); gx.setAttribute('y2', H - PAD_B);
      gx.setAttribute('stroke', '#e8eef0'); gx.setAttribute('stroke-width', '0.5');
      svg.appendChild(gx);

      var xLbl = global.document.createElementNS(svgNS, 'text');
      xLbl.setAttribute('x', xg); xLbl.setAttribute('y', H - PAD_B + 13);
      xLbl.setAttribute('text-anchor', 'middle');
      xLbl.setAttribute('font-size', '10'); xLbl.setAttribute('fill', '#5a7274');
      xLbl.textContent = String(Math.round(ag / 12));
      svg.appendChild(xLbl);
    }

    // ── Grid Y + etykiety ──
    var yStep = typeConfig.yAxisStep;
    var yStart = Math.ceil(minVal / yStep) * yStep;
    for (var b = yStart; b <= maxVal; b += yStep) {
      var yg = toY(b);
      var gy = global.document.createElementNS(svgNS, 'line');
      gy.setAttribute('x1', PAD_L); gy.setAttribute('x2', W - PAD_R);
      gy.setAttribute('y1', yg); gy.setAttribute('y2', yg);
      gy.setAttribute('stroke', '#e8eef0'); gy.setAttribute('stroke-width', '0.5');
      svg.appendChild(gy);

      var yLbl = global.document.createElementNS(svgNS, 'text');
      yLbl.setAttribute('x', PAD_L - 4); yLbl.setAttribute('y', yg + 3);
      yLbl.setAttribute('text-anchor', 'end');
      yLbl.setAttribute('font-size', '10'); yLbl.setAttribute('fill', '#5a7274');
      yLbl.textContent = String(b);
      svg.appendChild(yLbl);
    }

    // ── Osie ──
    var axisX = global.document.createElementNS(svgNS, 'line');
    axisX.setAttribute('x1', PAD_L); axisX.setAttribute('x2', W - PAD_R);
    axisX.setAttribute('y1', H - PAD_B); axisX.setAttribute('y2', H - PAD_B);
    axisX.setAttribute('stroke', '#08202C'); axisX.setAttribute('stroke-width', '0.8');
    svg.appendChild(axisX);

    var axisY = global.document.createElementNS(svgNS, 'line');
    axisY.setAttribute('x1', PAD_L); axisY.setAttribute('x2', PAD_L);
    axisY.setAttribute('y1', PAD_T); axisY.setAttribute('y2', H - PAD_B);
    axisY.setAttribute('stroke', '#08202C'); axisY.setAttribute('stroke-width', '0.8');
    svg.appendChild(axisY);

    // ── Krzywe percentyli (gładkie Bézier) + etykiety końca ──
    Z_VALUES.forEach(function (zv, idx) {
      if (curves[idx].length < 2) return;
      var screenPts = curves[idx].map(function (p) {
        return { x: toX(p.age), y: toY(p.val) };
      });
      var d = pointsToSmoothPath(screenPts);
      var path = global.document.createElementNS(svgNS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', zv.color);
      path.setAttribute('stroke-width', zv.label === '50' ? '1.6' : '1');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);

      var lastPt = curves[idx][curves[idx].length - 1];
      var endLbl = global.document.createElementNS(svgNS, 'text');
      endLbl.setAttribute('x', toX(lastPt.age) + 2);
      endLbl.setAttribute('y', toY(lastPt.val) + 3);
      endLbl.setAttribute('font-size', '9');
      endLbl.setAttribute('fill', zv.label === '50' ? '#0F6E56' : '#3a7062');
      endLbl.textContent = zv.label + 'c';
      svg.appendChild(endLbl);
    });

    // ── Trajektoria pacjenta — gładka linia ──
    if (trajectory.length >= 2) {
      var trajScreenPts = trajectory.map(function (p) {
        return { x: toX(p.age), y: toY(p.val) };
      });
      var dTraj = pointsToSmoothPath(trajScreenPts);
      var trajPath = global.document.createElementNS(svgNS, 'path');
      trajPath.setAttribute('d', dTraj);
      trajPath.setAttribute('fill', 'none');
      trajPath.setAttribute('stroke', '#b71c1c');
      trajPath.setAttribute('stroke-width', '1.8');
      trajPath.setAttribute('opacity', '0.75');
      trajPath.setAttribute('stroke-linecap', 'round');
      trajPath.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(trajPath);
    }

    // ── Trajektoria pacjenta — kropki ──
    trajectory.forEach(function (p, idx) {
      var isLast = idx === trajectory.length - 1;
      var c = global.document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', toX(p.age).toFixed(1));
      c.setAttribute('cy', toY(p.val).toFixed(1));
      c.setAttribute('r', isLast ? '5' : '3');
      c.setAttribute('fill', isLast ? '#b71c1c' : '#fff');
      c.setAttribute('stroke', '#b71c1c');
      c.setAttribute('stroke-width', isLast ? '2' : '1.5');
      svg.appendChild(c);
    });

    return svg;
  }

  /**
   * Faza 42 (zachowane dla wstecznej kompatybilności) — opakowuje generyczny
   * builder dla typu 'bmi'. Może być usunięte gdy nic z zewnątrz nie woła.
   */
  function buildBmiPercentileChart(measurements, sexForCalc, currentAgeMonths, currentBmi) {
    return buildPercentileChart('bmi', measurements, sexForCalc, currentAgeMonths, currentBmi);
  }

  /**
   * Buduje miniaturowy wykres SVG wzrostu w czasie z tablicy measurements.
   * Każdy pomiar: { ageYears, ageMonths, height, weight }.
   * Zwraca element SVG lub null gdy za mało danych (< 2 punktów).
   */
  function buildHeightSparkline(measurements) {
    if (!measurements || measurements.length < 2) return null;
    var svgNS = 'http://www.w3.org/2000/svg';

    var points = [];
    for (var i = 0; i < measurements.length; i++) {
      var m = measurements[i];
      if (!m || m.height == null) continue;
      var ageMo = measurementAgeInMonths(m);
      var h = parseFloat(m.height);
      if (isFinite(ageMo) && isFinite(h)) points.push({ age: ageMo, height: h });
    }
    if (points.length < 2) return null;

    var W = 280, H = 64, PAD = 8;
    var minAge = points[0].age, maxAge = points[points.length - 1].age;
    var heights = points.map(function (p) { return p.height; });
    var minH = Math.min.apply(null, heights);
    var maxH = Math.max.apply(null, heights);
    var rangeAge = maxAge - minAge || 1;
    var rangeH   = maxH - minH || 1;

    function toX(age) { return PAD + (age - minAge) / rangeAge * (W - 2 * PAD); }
    function toY(h)   { return H - PAD - (h - minH) / rangeH * (H - 2 * PAD); }

    var polylinePoints = points.map(function (p) {
      return toX(p.age).toFixed(1) + ',' + toY(p.height).toFixed(1);
    }).join(' ');

    var svg = global.document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    svg.setAttribute('class', 'vilda-patient-sparkline');
    svg.setAttribute('aria-hidden', 'true');

    var polyline = global.document.createElementNS(svgNS, 'polyline');
    polyline.setAttribute('points', polylinePoints);
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', '#00838d');
    polyline.setAttribute('stroke-width', '2.5');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(polyline);

    for (var j = 0; j < points.length; j++) {
      var circle = global.document.createElementNS(svgNS, 'circle');
      circle.setAttribute('cx', toX(points[j].age).toFixed(1));
      circle.setAttribute('cy', toY(points[j].height).toFixed(1));
      circle.setAttribute('r', j === points.length - 1 ? '5' : '3');
      circle.setAttribute('fill', '#00838d');
      circle.setAttribute('stroke', '#ffffff');
      circle.setAttribute('stroke-width', '1.5');
      svg.appendChild(circle);
    }
    return svg;
  }

  // ============ NOTATKI KLINICZNE PACJENTA (P4 — sekcja w karcie) ============
  // Mapowanie kategorii na human-readable label + kolor accent (Tailwind-friendly).
  var PATIENT_NOTE_CATEGORY_LABELS = {
    'followup':      { label: 'Kontrola',     color: '#854F0B', bg: '#FAEEDA' }, // amber
    'observation':   { label: 'Obserwacja',   color: '#0F6E56', bg: '#E1F5EE' }, // teal
    'treatment':     { label: 'Leczenie',     color: '#185FA5', bg: '#E6F1FB' }, // blue
    'wynik-badania': { label: 'Wynik badania', color: '#534AB7', bg: '#EEEDFE' }  // purple
  };

  // Formatowanie dueDateISO → relatywne ("za 3 dni", "wczoraj", "30.11.2026").
  // Plus klasa kolorystyczna w zależności od pilności: overdue / soon / ok.
  function formatPatientNoteDueDate(isoStr) {
    if (!isoStr) return null;
    var due = new Date(isoStr);
    if (isNaN(due.getTime())) return null;
    var now = new Date();
    var todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    var dueUTC = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()));
    var diffDays = Math.round((dueUTC - todayUTC) / (24 * 60 * 60 * 1000));
    var status, label;
    if (diffDays < 0) {
      status = 'overdue';
      label = (diffDays === -1) ? 'wczoraj' : ((-diffDays) + ' dni temu');
    } else if (diffDays === 0) {
      status = 'soon';
      label = 'dziś';
    } else if (diffDays === 1) {
      status = 'soon';
      label = 'jutro';
    } else if (diffDays <= 14) {
      status = 'soon';
      label = 'za ' + diffDays + ' dni';
    } else {
      status = 'ok';
      // dd.mm.yyyy
      var dd = String(due.getUTCDate()).padStart(2, '0');
      var mm = String(due.getUTCMonth() + 1).padStart(2, '0');
      var yyyy = due.getUTCFullYear();
      label = dd + '.' + mm + '.' + yyyy;
    }
    return { status: status, label: label };
  }

  // Konwertuje ISO timestamp do YYYY-MM-DD (dla <input type="date">).
  function isoToDateInputValue(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    var yyyy = d.getUTCFullYear();
    var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(d.getUTCDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  /**
   * Renderuje sekcję notatek klinicznych pacjenta w karcie.
   * Wywoływana ponownie po każdej akcji (CRUD) — czyści container i odbudowuje.
   * @param {HTMLElement} container — div który ma być wypełniony zawartością
   * @param {string} patientId
   * @param {Function} reRender — callback do ponownego wywołania (po save/delete)
   */
  async function renderPatientNotesSection(container, patientId, reRender) {
    const V = getVault();
    clear(container);
    if (!V || typeof V.listPatientNotesForPatient !== 'function') {
      container.appendChild(el('p', { class: 'vilda-patient-empty-msg', text: 'Notatki nie są dostępne.' }));
      return;
    }

    // Header sekcji z przyciskiem „+ Dodaj notatkę".
    // B3.3: główny tytuł zmieniony z „Notatki kliniczne" na neutralne „Notatki",
    // bo poniżej rozdzielamy je na sub-sekcje (Notatki ogólne + Notatki kliniczne).
    const headerRow = el('div', {
      class: 'vilda-patient-notes-header',
      style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;'
    });
    const headerLeft = el('div', null, [
      el('p', { class: 'vilda-patient-section-h', text: 'Notatki', style: 'margin:0;' })
    ]);
    const addBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-small',
      type: 'button',
      style: 'background:#00838d !important; color:#fff !important; border-color:#00838d !important; width:auto !important; padding:6px 14px !important; font-weight:600; flex:0 0 auto !important;',
      text: '+ Dodaj notatkę',
      onclick: function (ev) {
        if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
        try {
          showPatientNoteEditor({
            patientId: patientId,
            note: null,
            onSaved: function () { if (typeof reRender === 'function') reRender(); }
          });
        } catch (e) {
          logError('showPatientNoteEditor[add]', e);
          try { global.alert('Nie udało się otworzyć edytora notatki: ' + (e && e.message ? e.message : e)); } catch (_) {}
        }
      }
    });
    headerRow.appendChild(headerLeft);
    headerRow.appendChild(addBtn);
    container.appendChild(headerRow);

    // Wczytanie notatek pacjenta.
    let notes = [];
    try { notes = await V.listPatientNotesForPatient(patientId); }
    catch (e) { logError('listPatientNotesForPatient', e); }

    if (!notes.length) {
      container.appendChild(el('p', {
        class: 'vilda-patient-empty-msg',
        text: 'Brak notatek dla tego pacjenta. Kliknij „+ Dodaj notatkę", aby zapisać pierwszą obserwację, plan leczenia lub przypomnienie o kontroli.'
      }));
      return;
    }

    // ── B3.3: rozdzielenie notatek na 2 grupy (decyzja B3 #5) ───────────
    //   • Notatki ogólne — bez kotwicy wiekowej I bez daty zdarzenia
    //     (luźne obserwacje typu „Pacjent nie lubi mówić o rodzicach").
    //     Sortowane DESC po updatedAtISO (najświeższe pierwsze).
    //   • Notatki kliniczne — z linkedAgeMonths LUB z clinicalDateISO.
    //     Sortowane DESC po dacie zdarzenia (clinicalDateISO jeśli jest,
    //     inaczej updatedAtISO jako fallback).
    function _isGeneralNote(n) {
      return (n.linkedAgeMonths == null) && !n.clinicalDateISO;
    }
    var generalNotes = notes.filter(_isGeneralNote)
      .sort(function (a, b) {
        var av = a.updatedAtISO || '';
        var bv = b.updatedAtISO || '';
        if (av > bv) return -1;
        if (av < bv) return 1;
        return 0;
      });
    var clinicalNotes = notes.filter(function (n) { return !_isGeneralNote(n); })
      .sort(function (a, b) {
        var av = a.clinicalDateISO || a.updatedAtISO || '';
        var bv = b.clinicalDateISO || b.updatedAtISO || '';
        if (av > bv) return -1;
        if (av < bv) return 1;
        return 0;
      });

    // Helper: render pojedynczej karty notatki. Wspólny dla obu sekcji,
    // żeby uniknąć duplikacji ~80 linii kodu.
    function _renderPatientNoteCard(n) {
      const catMeta = PATIENT_NOTE_CATEGORY_LABELS[n.category] || PATIENT_NOTE_CATEGORY_LABELS.observation;
      const dueMeta = formatPatientNoteDueDate(n.dueDateISO);

      const card = el('div', {
        class: 'vilda-patient-note-card',
        style: 'background:#fff;border:0.5px solid #d7e9ec;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;'
      });

      // Top row: kategoria badge + due-date badge + actions menu
      const topRow = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;' });
      const badges = el('div', { style: 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;' });
      badges.appendChild(el('span', {
        text: catMeta.label,
        style: 'display:inline-block;padding:2px 8px;font-size:0.72rem;font-weight:600;color:' + catMeta.color + ';background:' + catMeta.bg + ';border-radius:999px;'
      }));
      if (dueMeta) {
        var dueBg, dueColor;
        if (dueMeta.status === 'overdue') { dueBg = '#FCEBEB'; dueColor = '#A32D2D'; }
        else if (dueMeta.status === 'soon') { dueBg = '#FAEEDA'; dueColor = '#854F0B'; }
        else { dueBg = '#E1F5EE'; dueColor = '#0F6E56'; }
        badges.appendChild(el('span', {
          text: (dueMeta.status === 'overdue' ? 'Termin: ' : 'Termin: ') + dueMeta.label,
          style: 'display:inline-block;padding:2px 8px;font-size:0.72rem;font-weight:600;color:' + dueColor + ';background:' + dueBg + ';border-radius:999px;'
        }));
      }
      const actionsDiv = el('div', { style: 'display:flex;gap:4px;flex:0 0 auto;' });
      const editBtn = el('button', {
        type: 'button',
        class: 'vilda-auth-btn vilda-auth-btn-small',
        style: 'background:transparent !important;color:#5b6672 !important;border:0.5px solid #d7e9ec !important;width:auto !important;min-width:0 !important;padding:4px 10px !important;font-size:0.78rem !important;flex:0 0 auto !important;',
        text: 'Edytuj',
        onclick: function () {
          showPatientNoteEditor({
            patientId: patientId,
            note: n,
            onSaved: function () { if (typeof reRender === 'function') reRender(); }
          });
        }
      });
      const delBtn = el('button', {
        type: 'button',
        class: 'vilda-auth-btn vilda-auth-btn-small',
        style: 'background:#fef2f3 !important;color:#b00020 !important;border:0.5px solid #f5b3bb !important;width:auto !important;min-width:0 !important;padding:4px 10px !important;font-size:0.78rem !important;flex:0 0 auto !important;',
        text: 'Usuń',
        onclick: async function () {
          var label = (n.title || n.body || '').slice(0, 60);
          if (!global.confirm('Usunąć notatkę „' + label + '"? Akcja propaguje się na inne urządzenia.')) return;
          try {
            await V.removePatientNote(n.id);
            if (typeof reRender === 'function') reRender();
          } catch (e) {
            global.alert('Nie udało się usunąć notatki: ' + (e && e.message ? e.message : e));
          }
        }
      });
      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(delBtn);
      topRow.appendChild(badges);
      topRow.appendChild(actionsDiv);
      card.appendChild(topRow);

      // Tytuł (jeśli jest).
      if (n.title) {
        card.appendChild(el('div', {
          text: n.title,
          style: 'font-weight:600;font-size:0.95rem;color:#0f2b33;'
        }));
      }
      // Body.
      if (n.body) {
        card.appendChild(el('div', {
          text: n.body,
          style: 'font-size:0.88rem;color:#374151;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;'
        }));
      }

      // Footer: data zapisu (relatywna).
      const savedLabel = n.updatedAtISO ? ('Zapisano: ' + formatRelativeISO(n.updatedAtISO)) : '';
      if (savedLabel) {
        card.appendChild(el('div', {
          text: savedLabel,
          style: 'font-size:0.74rem;color:#9aa8aa;'
        }));
      }

      return card;
    }

    // Helper: header sub-sekcji z ikoną + tekstem + counter pill.
    function _renderSubSectionHeader(iconSvg, text, count) {
      var wrap = el('div', {
        class: 'vilda-patient-notes-subheader',
        style: 'display:flex;align-items:center;gap:8px;margin:6px 0 10px;'
      });
      if (iconSvg) {
        var iconWrap = el('span', {
          style: 'display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;color:#5b6672;flex:0 0 auto;'
        });
        iconWrap.innerHTML = iconSvg;
        wrap.appendChild(iconWrap);
      }
      wrap.appendChild(el('span', {
        text: text,
        style: 'font-size:0.78rem;font-weight:600;color:#5b6672;text-transform:uppercase;letter-spacing:0.05em;'
      }));
      wrap.appendChild(el('span', {
        text: String(count),
        style: 'display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:18px;padding:0 6px;'
          + 'background:#e8eff1;color:#5b6672;font-size:0.7rem;font-weight:600;border-radius:999px;'
      }));
      return wrap;
    }

    // Ikona dymka (Tabler outline ti-message-dots) — inline SVG dla sekcji ogólnej.
    var MESSAGE_DOTS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l1.3 -3.9a9 8 0 1 1 3.4 2.9l-4.7 1"/><path d="M12 12l0 .01"/><path d="M8 12l0 .01"/><path d="M16 12l0 .01"/></svg>';
    // Ikona stetoskopu (Tabler ti-stethoscope) — dla sekcji klinicznej.
    var STETHOSCOPE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h-1a2 2 0 0 0 -2 2v3.5h0a5.5 5.5 0 0 0 11 0v-3.5a2 2 0 0 0 -2 -2h-1"/><path d="M8 15a6 6 0 1 0 12 0v-3"/><circle cx="20" cy="10" r="2"/></svg>';

    // B-fix UX (post-B3): wewnętrzny scroll dla obu sub-sekcji notatek.
    // Header z „+Dodaj notatkę" zostaje NAD scrollem (zawsze widoczny, akcja
    // dostępna bez scrollowania w górę). Lista wpisów scrolluje się wewnętrznie.
    // Wysokość dynamiczna do viewportu z capem 720px (na dużych monitorach lista
    // nie rozrasta się ponad sens) i floorem 280px (na małych ekranach minimalna
    // czytelna wysokość ~3 wpisy). Scrollbar stylizowany subtelnie (tylko gdy hover
    // na desktop, zawsze widoczny na touch — domyślne zachowanie OS).
    var notesScrollWrap = el('div', {
      class: 'vilda-patient-notes-scroll',
      style: 'max-height:min(calc(100vh - 320px), 720px);min-height:280px;'
        + 'overflow-y:auto;overflow-x:hidden;'
        + 'padding-right:4px;'  // pad pod scrollbar (uniknij skoku layoutu)
        + '-webkit-overflow-scrolling:touch;'  // momentum scroll na iOS
        + 'scrollbar-gutter:stable;'  // rezerwa miejsca na scrollbar — brak skoków
    });

    // Sekcja „Notatki ogólne" — subtelny szary tło (#f5fafb wg planu), ikona dymka.
    if (generalNotes.length > 0) {
      var generalWrap = el('div', {
        class: 'vilda-patient-notes-general-section',
        style: 'background:#f5fafb;border:0.5px solid #e0eef0;border-radius:12px;padding:10px 12px 12px;margin-bottom:14px;'
      });
      generalWrap.appendChild(_renderSubSectionHeader(MESSAGE_DOTS_SVG, 'Notatki ogólne', generalNotes.length));
      var generalList = el('div', { style: 'display:flex;flex-direction:column;gap:8px;' });
      generalNotes.forEach(function (n) { generalList.appendChild(_renderPatientNoteCard(n)); });
      generalWrap.appendChild(generalList);
      notesScrollWrap.appendChild(generalWrap);
    }

    // Sekcja „Notatki kliniczne" — bez szarego tła, header z ikoną stetoskopu.
    if (clinicalNotes.length > 0) {
      var clinicalWrap = el('div', { class: 'vilda-patient-notes-clinical-section' });
      clinicalWrap.appendChild(_renderSubSectionHeader(STETHOSCOPE_SVG, 'Notatki kliniczne', clinicalNotes.length));
      var clinicalList = el('div', { class: 'vilda-patient-notes-list', style: 'display:flex;flex-direction:column;gap:10px;' });
      clinicalNotes.forEach(function (n) { clinicalList.appendChild(_renderPatientNoteCard(n)); });
      clinicalWrap.appendChild(clinicalList);
      notesScrollWrap.appendChild(clinicalWrap);
    }

    container.appendChild(notesScrollWrap);
  }

  /**
   * Overlay edytora notatki klinicznej pacjenta — dodaj lub edytuj.
   * @param {object} opts — { patientId, note?, onSaved?, onCancel? }
   */
  function showPatientNoteEditor(opts) {
    const V = getVault();
    if (!V || typeof V.savePatientNote !== 'function') {
      // P4-fix: zamiast cichego return — pokaż jednoznaczny komunikat. To pomaga
      // diagnozować problemy z cache (gdy SW serwuje stary vilda_vault.js bez
      // API patient notes) lub gdy vault jest jeszcze locked.
      try { global.alert('Notatki pacjenta są niedostępne. Spróbuj odświeżyć stronę (Ctrl+Shift+R) — może być stary cache.'); } catch (_) {}
      return;
    }
    const isEdit = !!(opts && opts.note && opts.note.id);
    const initial = (opts && opts.note) || {};

    // P4-fix #2: defensywnie usuń wcześniejsze niezamknięte overlaye (multi-click).
    // Bez tego wielokrotne kliknięcia „+ Dodaj notatkę" akumulują overlaye w DOM —
    // niewidoczne pod rootEl, ale po hide() pokazują się wszystkie razem.
    try {
      var prev = global.document.querySelectorAll('.vilda-patient-note-editor-overlay');
      if (prev && prev.length) {
        for (var i = 0; i < prev.length; i++) prev[i].remove();
      }
    } catch (_) {}

    // Backdrop dla modalu — overlay na całość auth UI.
    // P4-fix #2: z-index MUSI być WYŻSZY niż .vilda-auth-root (999999), inaczej
    // overlay jest niewidoczny pod kartą pacjenta. Inline style przesłania klasę
    // .vilda-auth-overlay-sheet (z-index:1000000), więc tutaj 1000001 explicit.
    const overlay = el('div', {
      class: 'vilda-auth-overlay vilda-auth-overlay-sheet vilda-patient-note-editor-overlay',
      style: 'position:fixed;inset:0;height:100dvh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000001;padding:20px;box-sizing:border-box;'
    });

    const sheet = el('div', {
      class: 'vilda-auth-sheet',
      style: 'background:#fff;border-radius:14px;padding:18px 20px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:12px;'
    });

    sheet.appendChild(el('h3', {
      text: isEdit ? 'Edytuj notatkę' : 'Nowa notatka',
      style: 'margin:0;font-size:1.05rem;font-weight:600;color:#0f2b33;'
    }));

    // Kategoria — dropdown.
    const catWrap = el('div', null, [
      el('label', { text: 'Kategoria', style: 'display:block;font-size:0.78rem;color:#5b6672;margin-bottom:4px;font-weight:500;' })
    ]);
    const catSelect = el('select', {
      class: 'vilda-auth-input',
      style: 'width:100%;height:38px;padding:0 10px;font-size:0.92rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;'
    });
    var cats = (V.PATIENT_NOTE_CATEGORIES || ['followup', 'observation', 'treatment', 'wynik-badania']);
    cats.forEach(function (c) {
      const labelMeta = PATIENT_NOTE_CATEGORY_LABELS[c] || { label: c };
      const opt = el('option', { value: c, text: labelMeta.label });
      if ((initial.category || 'observation') === c) opt.selected = true;
      catSelect.appendChild(opt);
    });
    catWrap.appendChild(catSelect);
    sheet.appendChild(catWrap);

    // B3.1: Szablon notatki — dropdown z 5 opcjami (decyzja B3 #2).
    // Wybór szablonu robi 2 rzeczy:
    //   • ustawia kategorię automatycznie (treatment / wynik-badania)
    //   • pokazuje pola strukturalne (medication.{name,dose,previousDose} albo
    //     labResult.{test,value,norm}) odpowiednie dla szablonu
    // „Bez szablonu" pozostawia user'owi swobodę — tylko tytuł + treść.
    // Detekcja stanu początkowego (edycja istniejącej notatki):
    var initialTemplate = 'none';
    if (isEdit && initial.medication && initial.medication.action) {
      if (initial.medication.action === 'start') initialTemplate = 'med-start';
      else if (initial.medication.action === 'change') initialTemplate = 'med-change';
      else if (initial.medication.action === 'stop') initialTemplate = 'med-stop';
    } else if (isEdit && initial.labResult && (initial.labResult.test || initial.labResult.value)) {
      initialTemplate = 'lab';
    }

    var tplWrap = el('div', null, [
      el('label', { text: 'Szablon', style: 'display:block;font-size:0.78rem;color:#5b6672;margin-bottom:4px;font-weight:500;' })
    ]);
    var tplSelect = el('select', {
      class: 'vilda-auth-input b3-template-select',
      style: 'width:100%;height:38px;padding:0 10px;font-size:0.92rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;'
    });
    var TEMPLATES = [
      { value: 'none',       label: 'Bez szablonu' },
      { value: 'med-start',  label: 'Włączono lek' },
      { value: 'med-change', label: 'Zmieniono dawkę leku' },
      { value: 'med-stop',   label: 'Zakończono leczenie' },
      { value: 'lab',        label: 'Wynik badania' }
    ];
    TEMPLATES.forEach(function (t) {
      var opt = el('option', { value: t.value, text: t.label });
      if (t.value === initialTemplate) opt.selected = true;
      tplSelect.appendChild(opt);
    });
    tplWrap.appendChild(tplSelect);
    var tplHint = el('p', {
      style: 'font-size:0.72rem;color:#9aa8aa;margin:4px 0 0 0;line-height:1.4;',
      text: 'Szablon zapisze lek / wynik w sposób umożliwiający filtrowanie w przyszłości.'
    });
    tplWrap.appendChild(tplHint);
    sheet.appendChild(tplWrap);

    // ── Sekcja strukturalna: medication (start/change/stop) ────────────
    // Pokazuje pola name + dose; dla 'change' dodatkowo previousDose.
    // Auto-suggest (B3 #A1) — datalist HTML5 wypełniany asynchronicznie po
    // otwarciu edytora przez listMedicationNamesForCurrentUser().
    var medSection = el('div', {
      class: 'b3-med-section',
      style: 'display:none;flex-direction:column;gap:8px;padding:10px 12px;background:#fff8ee;border:0.5px solid #f0e0c8;border-radius:8px;'
    });
    var medHeader = el('div', {
      style: 'font-size:0.74rem;color:#7a5a1a;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;',
      text: 'Lek'
    });
    medSection.appendChild(medHeader);

    var medDatalistId = 'b3-med-names-' + Date.now();
    var medDatalist = el('datalist', { id: medDatalistId });
    medSection.appendChild(medDatalist);

    var medNameWrap = el('div', null, [
      el('label', { text: 'Nazwa leku', style: 'display:block;font-size:0.74rem;color:#5b6672;margin-bottom:3px;' })
    ]);
    var medNameInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input b3-med-name',
      list: medDatalistId,
      placeholder: 'np. Euthyrox, Letrox, Genotropin',
      style: 'width:100%;height:36px;padding:0 10px;font-size:0.9rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;'
    });
    medNameInput.value = (initial.medication && initial.medication.name) || '';
    medNameWrap.appendChild(medNameInput);
    medSection.appendChild(medNameWrap);

    // previousDose — pokazywane tylko dla 'med-change'
    var medPrevWrap = el('div', { class: 'b3-med-prev-wrap', style: 'display:none;' }, [
      el('label', { text: 'Poprzednia dawka', style: 'display:block;font-size:0.74rem;color:#5b6672;margin-bottom:3px;' })
    ]);
    var medPrevInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input b3-med-previous-dose',
      placeholder: 'np. 25 µg 1×dz.',
      style: 'width:100%;height:36px;padding:0 10px;font-size:0.9rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;'
    });
    medPrevInput.value = (initial.medication && initial.medication.previousDose) || '';
    medPrevWrap.appendChild(medPrevInput);
    medSection.appendChild(medPrevWrap);

    var medDoseWrap = el('div', { class: 'b3-med-dose-wrap' }, [
      el('label', { class: 'b3-med-dose-label', text: 'Dawka', style: 'display:block;font-size:0.74rem;color:#5b6672;margin-bottom:3px;' })
    ]);
    var medDoseInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input b3-med-dose',
      placeholder: 'np. 50 µg 1×dz.',
      style: 'width:100%;height:36px;padding:0 10px;font-size:0.9rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;'
    });
    medDoseInput.value = (initial.medication && initial.medication.dose) || '';
    medDoseWrap.appendChild(medDoseInput);
    medSection.appendChild(medDoseWrap);

    sheet.appendChild(medSection);

    // ── Sekcja strukturalna: labResult ─────────────────────────────────
    var labSection = el('div', {
      class: 'b3-lab-section',
      style: 'display:none;flex-direction:column;gap:8px;padding:10px 12px;background:#eef6ff;border:0.5px solid #cde0f5;border-radius:8px;'
    });
    var labHeader = el('div', {
      style: 'font-size:0.74rem;color:#1a4a7a;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;',
      text: 'Wynik badania'
    });
    labSection.appendChild(labHeader);

    var labDatalistId = 'b3-lab-names-' + Date.now();
    var labDatalist = el('datalist', { id: labDatalistId });
    labSection.appendChild(labDatalist);

    var labTestWrap = el('div', null, [
      el('label', { text: 'Badanie', style: 'display:block;font-size:0.74rem;color:#5b6672;margin-bottom:3px;' })
    ]);
    var labTestInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input b3-lab-test',
      list: labDatalistId,
      placeholder: 'np. TSH, fT4, IGF-1',
      style: 'width:100%;height:36px;padding:0 10px;font-size:0.9rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;'
    });
    labTestInput.value = (initial.labResult && initial.labResult.test) || '';
    labTestWrap.appendChild(labTestInput);
    labSection.appendChild(labTestWrap);

    var labValueWrap = el('div', null, [
      el('label', { text: 'Wartość', style: 'display:block;font-size:0.74rem;color:#5b6672;margin-bottom:3px;' })
    ]);
    var labValueInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input b3-lab-value',
      placeholder: 'np. 2,5 mIU/L',
      style: 'width:100%;height:36px;padding:0 10px;font-size:0.9rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;'
    });
    labValueInput.value = (initial.labResult && initial.labResult.value) || '';
    labValueWrap.appendChild(labValueInput);
    labSection.appendChild(labValueWrap);

    var labNormWrap = el('div', null, [
      el('label', { text: 'Norma (opcjonalnie)', style: 'display:block;font-size:0.74rem;color:#5b6672;margin-bottom:3px;' })
    ]);
    var labNormInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input b3-lab-norm',
      placeholder: 'np. 0,4-4,2 mIU/L',
      style: 'width:100%;height:36px;padding:0 10px;font-size:0.9rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;'
    });
    labNormInput.value = (initial.labResult && initial.labResult.norm) || '';
    labNormWrap.appendChild(labNormInput);
    labSection.appendChild(labNormWrap);

    sheet.appendChild(labSection);

    // Reaktywność szablonu — pokazuj odpowiednią sekcję, ustaw kategorię.
    // Etykietę „Dawka" dla 'med-change' zmieniamy na „Nowa dawka" (bo jest też previousDose).
    function syncTemplateVisibility() {
      var tpl = tplSelect.value;
      var isMed = tpl === 'med-start' || tpl === 'med-change' || tpl === 'med-stop';
      var isLab = tpl === 'lab';
      medSection.style.display = isMed ? 'flex' : 'none';
      labSection.style.display = isLab ? 'flex' : 'none';
      medPrevWrap.style.display = tpl === 'med-change' ? 'block' : 'none';
      medDoseWrap.style.display = (tpl === 'med-start' || tpl === 'med-change') ? 'block' : 'none';
      var doseLabel = medDoseWrap.querySelector('.b3-med-dose-label');
      if (doseLabel) doseLabel.textContent = tpl === 'med-change' ? 'Nowa dawka' : 'Dawka';
      // Auto-set kategoria dla szablonów strukturalnych.
      if (isMed) catSelect.value = 'treatment';
      else if (isLab) catSelect.value = 'wynik-badania';
    }
    tplSelect.addEventListener('change', syncTemplateVisibility);
    syncTemplateVisibility();

    // Auto-suggest — wypełniamy datalist asynchronicznie po otwarciu edytora.
    // Jeśli vault zwróci błąd (lock / stale cache), zostawiamy puste — input
    // nadal działa jako wolne pole tekstowe.
    if (typeof V.listMedicationNamesForCurrentUser === 'function') {
      V.listMedicationNamesForCurrentUser().then(function (names) {
        if (!Array.isArray(names)) return;
        names.forEach(function (n) { medDatalist.appendChild(el('option', { value: n })); });
      }).catch(function () {});
    }
    if (typeof V.listLabTestNamesForCurrentUser === 'function') {
      V.listLabTestNamesForCurrentUser().then(function (tests) {
        if (!Array.isArray(tests)) return;
        tests.forEach(function (t) { labDatalist.appendChild(el('option', { value: t })); });
      }).catch(function () {});
    }

    // Tytuł.
    const titleWrap = el('div', null, [
      el('label', { text: 'Tytuł (opcjonalnie)', style: 'display:block;font-size:0.78rem;color:#5b6672;margin-bottom:4px;font-weight:500;' })
    ]);
    const titleInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input',
      placeholder: 'np. Wprowadzono Euthyrox',
      style: 'width:100%;height:38px;padding:0 10px;font-size:0.92rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;'
    });
    titleInput.value = initial.title || '';
    titleWrap.appendChild(titleInput);
    sheet.appendChild(titleWrap);

    // Treść.
    const bodyWrap = el('div', null, [
      el('label', { text: 'Treść', style: 'display:block;font-size:0.78rem;color:#5b6672;margin-bottom:4px;font-weight:500;' })
    ]);
    const bodyInput = el('textarea', {
      class: 'vilda-auth-input',
      placeholder: 'np. 25 µg 1×dz. Kontrola TSH za 6 mc.',
      style: 'width:100%;min-height:120px;padding:10px;font-size:0.92rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;line-height:1.5;resize:vertical;font-family:inherit;'
    });
    bodyInput.value = initial.body || '';
    bodyWrap.appendChild(bodyInput);
    sheet.appendChild(bodyWrap);

    // dueDateISO — pole opcjonalne, podpowiedź zmienia się gdy kategoria = followup.
    const dueWrap = el('div', null, [
      el('label', { class: 'pn-due-label', text: 'Przypomnienie (data)', style: 'display:block;font-size:0.78rem;color:#5b6672;margin-bottom:4px;font-weight:500;' })
    ]);
    const dueInput = el('input', {
      type: 'date',
      class: 'vilda-auth-input',
      style: 'width:100%;height:38px;padding:0 10px;font-size:0.92rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;'
    });
    dueInput.value = isoToDateInputValue(initial.dueDateISO);
    dueWrap.appendChild(dueInput);
    const dueHint = el('p', {
      style: 'font-size:0.72rem;color:#9aa8aa;margin:4px 0 0 0;line-height:1.4;',
      text: 'Najlepiej ustawić dla kontroli — pojawi się jako przypomnienie z kolorem zależnym od pilności.'
    });
    dueWrap.appendChild(dueHint);
    sheet.appendChild(dueWrap);

    // B3.1: powiązanie notatki z osią czasu — radio group z 3 wzajemnie wykluczającymi
    // opcjami (decyzja B3 #6, zastępuje wcześniejszy checkbox z B1.8):
    //   (1) Notatka ogólna — bez kotwicy, bez daty zdarzenia (idzie do zakładki Notatki,
    //       sekcja „Notatki ogólne" — B3.3)
    //   (2) Powiąż z wizytą (wiek pacjenta) — kotwica linkedAgeMonths, dostępne tylko
    //       gdy suggestLinkedAge != null (edytor wywołany z kreatora głównego lub
    //       edytujemy notatkę która już ma kotwicę)
    //   (3) Wpisz datę zdarzenia — pole type=date → clinicalDateISO (B3.0); notatka
    //       wpasuje się chronologicznie w Historię.
    //
    // Stan początkowy:
    //   • Nowa notatka, brak suggestLinkedAge → (1) ogólna domyślnie
    //   • Nowa notatka, jest suggestLinkedAge → (2) powiąż z wizytą domyślnie
    //   • Edycja notatki z linkedAgeMonths → (2) powiąż z wizytą
    //   • Edycja notatki z clinicalDateISO → (3) data zdarzenia, pole wypełnione
    //   • Edycja notatki ogólnej (oba null) → (1) ogólna
    var suggestLinkedAge = null;
    if (opts && typeof opts.suggestLinkedAge === 'number' && isFinite(opts.suggestLinkedAge)
        && opts.suggestLinkedAge > 0) {
      suggestLinkedAge = Math.round(opts.suggestLinkedAge);
    } else if (isEdit && typeof initial.linkedAgeMonths === 'number' && initial.linkedAgeMonths > 0) {
      suggestLinkedAge = Math.round(initial.linkedAgeMonths);
    }

    // Wybierz początkowo zaznaczone radio na podstawie stanu notatki.
    var initialAnchorMode;
    if (isEdit && initial.clinicalDateISO) initialAnchorMode = 'date';
    else if (isEdit && typeof initial.linkedAgeMonths === 'number' && initial.linkedAgeMonths > 0) initialAnchorMode = 'visit';
    else if (suggestLinkedAge !== null) initialAnchorMode = 'visit';
    else initialAnchorMode = 'general';

    var anchorWrap = el('div', {
      class: 'b3-anchor-group',
      style: 'display:flex;flex-direction:column;gap:8px;padding:12px;background:#f5fafb;border-radius:10px;border:0.5px solid #d7e9ec;'
    });
    var anchorHeader = el('div', {
      style: 'font-size:0.78rem;color:#5b6672;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;',
      text: 'Powiązanie z osią czasu'
    });
    anchorWrap.appendChild(anchorHeader);

    // Radio (1) — Notatka ogólna
    var radioGeneralWrap = el('label', { class: 'b3-anchor-option', style: 'display:flex;align-items:flex-start;gap:8px;cursor:pointer;' });
    var radioGeneral = el('input', { type: 'radio', name: 'b3-anchor', value: 'general', style: 'flex:0 0 auto;margin-top:2px;cursor:pointer;width:16px;height:16px;accent-color:#00838d;' });
    radioGeneral.checked = initialAnchorMode === 'general';
    var radioGeneralText = el('div', { style: 'flex:1;font-size:0.86rem;color:#0f2b33;line-height:1.4;' }, [
      el('div', { text: 'Notatka ogólna', style: 'font-weight:500;' }),
      el('div', { text: 'Pojawi się w zakładce Notatki, nie w Historii.', style: 'font-size:0.74rem;color:#9aa8aa;margin-top:2px;' })
    ]);
    radioGeneralWrap.appendChild(radioGeneral);
    radioGeneralWrap.appendChild(radioGeneralText);
    anchorWrap.appendChild(radioGeneralWrap);

    // B3.3: hint pod radio „Notatka ogólna" — pokazywany TYLKO gdy general jest aktywna.
    // Wyjaśnia że notatka ogólna nie wpadnie do osi czasu Historii i zachęca do
    // wyboru wizyty lub daty zdarzenia, jeśli to ma być wpis kliniczny.
    var generalHint = el('div', {
      class: 'b3-general-hint',
      style: 'font-size:0.74rem;color:#7a5a1a;background:#fff8ee;border:0.5px solid #f0e0c8;'
        + 'border-radius:6px;padding:6px 8px;margin:-2px 0 0 24px;line-height:1.4;display:none;'
    });
    generalHint.innerHTML = '💡 Notatki ogólne nie pojawiają się w Historii. '
      + 'Aby notatka pojawiła się w Historii, wybierz <strong>wizytę</strong> lub <strong>datę zdarzenia</strong>.';
    anchorWrap.appendChild(generalHint);

    // Radio (2) — Powiąż z wizytą (tylko gdy mamy suggestLinkedAge)
    var radioVisit = null;
    if (suggestLinkedAge !== null) {
      var radioVisitWrap = el('label', { class: 'b3-anchor-option', style: 'display:flex;align-items:flex-start;gap:8px;cursor:pointer;' });
      radioVisit = el('input', { type: 'radio', name: 'b3-anchor', value: 'visit', style: 'flex:0 0 auto;margin-top:2px;cursor:pointer;width:16px;height:16px;accent-color:#00838d;' });
      radioVisit.checked = initialAnchorMode === 'visit';
      var radioVisitText = el('div', { style: 'flex:1;font-size:0.86rem;color:#0f2b33;line-height:1.4;' });
      var visitMain = el('div', { style: 'font-weight:500;' });
      visitMain.appendChild(global.document.createTextNode('Powiąż z wizytą '));
      visitMain.appendChild(el('strong', { text: '(wiek: ' + _formatAge(suggestLinkedAge) + ')', style: 'font-weight:600;color:#0F6E56;' }));
      radioVisitText.appendChild(visitMain);
      radioVisitText.appendChild(el('div', { text: 'Pojawi się w Historii pod chipem Pomiar.', style: 'font-size:0.74rem;color:#9aa8aa;margin-top:2px;' }));
      radioVisitWrap.appendChild(radioVisit);
      radioVisitWrap.appendChild(radioVisitText);
      anchorWrap.appendChild(radioVisitWrap);
    }

    // Radio (3) — Wpisz datę zdarzenia
    var radioDateWrap = el('label', { class: 'b3-anchor-option', style: 'display:flex;align-items:flex-start;gap:8px;cursor:pointer;' });
    var radioDate = el('input', { type: 'radio', name: 'b3-anchor', value: 'date', style: 'flex:0 0 auto;margin-top:2px;cursor:pointer;width:16px;height:16px;accent-color:#00838d;' });
    radioDate.checked = initialAnchorMode === 'date';
    var radioDateText = el('div', { style: 'flex:1;font-size:0.86rem;color:#0f2b33;line-height:1.4;' }, [
      el('div', { text: 'Wpisz datę zdarzenia', style: 'font-weight:500;' }),
      el('div', { text: 'Notatka wpasuje się chronologicznie w Historii.', style: 'font-size:0.74rem;color:#9aa8aa;margin-top:2px;' })
    ]);
    var clinicalDateInput = el('input', {
      type: 'date',
      class: 'vilda-auth-input b3-clinical-date',
      style: 'width:100%;height:34px;padding:0 10px;font-size:0.9rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;margin-top:6px;display:none;'
    });
    clinicalDateInput.value = initial.clinicalDateISO || '';
    radioDateText.appendChild(clinicalDateInput);
    radioDateWrap.appendChild(radioDate);
    radioDateWrap.appendChild(radioDateText);
    anchorWrap.appendChild(radioDateWrap);

    // Reaktywność — pokazuj date input tylko gdy radio (3) aktywne, hint tylko
    // gdy radio (1) „ogólna" aktywne (B3.3).
    function syncAnchorVisibility() {
      clinicalDateInput.style.display = radioDate.checked ? 'block' : 'none';
      generalHint.style.display = radioGeneral.checked ? 'block' : 'none';
    }
    radioGeneral.addEventListener('change', syncAnchorVisibility);
    if (radioVisit) radioVisit.addEventListener('change', syncAnchorVisibility);
    radioDate.addEventListener('change', syncAnchorVisibility);
    // Klik w pole daty automatycznie zaznacza radio (3) — wygodniej.
    clinicalDateInput.addEventListener('focus', function () {
      if (!radioDate.checked) { radioDate.checked = true; syncAnchorVisibility(); }
    });
    syncAnchorVisibility();

    sheet.appendChild(anchorWrap);

    // Error box.
    const errBox = el('div', {
      style: 'color:#A32D2D;font-size:0.82rem;line-height:1.4;display:none;'
    });
    sheet.appendChild(errBox);

    // Akcje (Anuluj + Zapisz).
    const actions = el('div', {
      style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:4px;'
    });
    const cancelBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      style: 'background:transparent !important;color:#5b6672 !important;border:0.5px solid #d7e9ec !important;width:auto !important;padding:8px 16px !important;flex:0 0 auto !important;',
      text: 'Anuluj',
      onclick: function () {
        overlay.remove();
        if (opts && typeof opts.onCancel === 'function') opts.onCancel();
      }
    });
    const saveBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      style: 'background:#00838d !important;color:#fff !important;border-color:#00838d !important;width:auto !important;padding:8px 18px !important;font-weight:600;flex:0 0 auto !important;',
      text: isEdit ? 'Zapisz zmiany' : 'Dodaj notatkę',
      onclick: async function () {
        errBox.style.display = 'none';
        saveBtn.disabled = true;
        cancelBtn.disabled = true;
        try {
          const payload = {
            patientId: opts.patientId,
            title: titleInput.value || '',
            body: bodyInput.value || '',
            category: catSelect.value || 'observation',
            dueDateISO: dueInput.value || null
          };
          if (isEdit) payload.id = initial.id;

          // B3.1: powiązanie z osią czasu na podstawie radio group.
          //   • general → linkedAgeMonths=null, clinicalDateISO=null (notatka ogólna)
          //   • visit   → linkedAgeMonths=suggestLinkedAge, clinicalDateISO=null
          //   • date    → linkedAgeMonths=null, clinicalDateISO=<input>
          // Przy edycji ZAWSZE wysyłamy explicit (3 stany: visit/date/general), więc
          // vault wyczyści drugie pole — radio jest mutually exclusive.
          var anchor = 'general';
          if (radioVisit && radioVisit.checked) anchor = 'visit';
          else if (radioDate.checked) anchor = 'date';
          if (anchor === 'visit') {
            payload.linkedAgeMonths = suggestLinkedAge;
            payload.clinicalDateISO = null;
          } else if (anchor === 'date') {
            payload.linkedAgeMonths = null;
            payload.clinicalDateISO = clinicalDateInput.value || null;
          } else {
            payload.linkedAgeMonths = null;
            payload.clinicalDateISO = null;
          }

          // B3.1: pola strukturalne na podstawie wybranego szablonu.
          //   • med-start / med-change / med-stop → buduj obiekt medication
          //   • lab → buduj obiekt labResult
          //   • none → wyzeruj oba (przy edycji vault wyczyści pola)
          var tpl = tplSelect.value;
          if (tpl === 'med-start' || tpl === 'med-change' || tpl === 'med-stop') {
            var actionMap = { 'med-start': 'start', 'med-change': 'change', 'med-stop': 'stop' };
            var med = { action: actionMap[tpl] };
            var medName = (medNameInput.value || '').trim();
            if (medName) med.name = medName;
            var medDose = (medDoseInput.value || '').trim();
            if (medDose && (tpl === 'med-start' || tpl === 'med-change')) med.dose = medDose;
            var medPrev = (medPrevInput.value || '').trim();
            if (medPrev && tpl === 'med-change') med.previousDose = medPrev;
            payload.medication = med;
            payload.labResult = null;
          } else if (tpl === 'lab') {
            var lab = {};
            var labTest = (labTestInput.value || '').trim();
            if (labTest) lab.test = labTest;
            var labValue = (labValueInput.value || '').trim();
            if (labValue) lab.value = labValue;
            var labNorm = (labNormInput.value || '').trim();
            if (labNorm) lab.norm = labNorm;
            payload.medication = null;
            payload.labResult = (lab.test || lab.value) ? lab : null;
          } else {
            payload.medication = null;
            payload.labResult = null;
          }

          await V.savePatientNote(payload);
          overlay.remove();
          if (opts && typeof opts.onSaved === 'function') opts.onSaved();
        } catch (e) {
          errBox.textContent = (e && e.message) ? e.message : 'Nie udało się zapisać notatki.';
          errBox.style.display = 'block';
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
        }
      }
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    sheet.appendChild(actions);

    overlay.appendChild(sheet);
    // P4-fix #3: host przepisuje na BODY gdy rootEl jest ukryty (display:none).
    // Modal w środku display:none rodzica jest niewidoczny — nawet z position:fixed.
    // rootEl jest hidden gdy user jest zalogowany i w aplikacji (auth UI niepotrzebne).
    // Modal otwierany z karty pacjenta (showPatientCard wywołuje open() → rootEl block)
    // → host=rootEl (dobry stacking). Modal otwierany ze stanu zalogowanego (np. R3 chip
    // reminderów, R4 auto-trigger po unlock) → rootEl display:none → host=body.
    var host = _chooseOverlayHost();
    host.appendChild(overlay);
    // Mobile: zablokuj scroll tła, by modal nie „pływał" (auto-unlock po zamknięciu).
    _lockBackgroundScrollUntilRemoved(overlay);

    // Auto-focus na treści (najczęściej edytowane).
    try { bodyInput.focus(); } catch (_) {}
  }

  /**
   * P4-fix #3: heurystyka wyboru hosta overlay'a.
   * - rootEl widoczny (display:block) → użyj rootEl (modal w tym samym stacking
   *   context co karta pacjenta; cleanup przy hide() automatyczny).
   * - rootEl hidden lub brak → użyj document.body (modal działa w trybie
   *   zalogowanym, gdy auth UI jest schowane).
   */
  function _chooseOverlayHost() {
    if (!rootEl) return global.document.body;
    var style = '';
    try { style = (rootEl.style && rootEl.style.display) || ''; } catch (_) {}
    // computed style fallback gdy inline style pusty.
    if (!style && global.getComputedStyle) {
      try { style = global.getComputedStyle(rootEl).display || ''; } catch (_) {}
    }
    if (style === 'none') return global.document.body;
    return rootEl;
  }

  // ── Blokada przewijania TŁA gdy widoczna nakładka auth (karta/lista) lub modal ──
  // DIAGNOZA NA ŻYWO (2026-06-03): karta pacjenta to .vilda-auth-root (position:fixed,
  // mieści się w 697px → SAM NIE przewija), a pod spodem <body> jest scrollerem
  // (scrollH ~5897). Bez blokady body przewijanie nad kartą przewija stronę pod
  // spodem → „prześwit" strony głównej. overscroll-behavior na .vilda-auth-root nie
  // pomagał, bo to NIE on jest scrollerem. Lekarstwo: zablokować scroll <body> na
  // czas widoczności nakładki/modala. Ref-count obsługuje zagnieżdżenie (karta +
  // modal na wierzchu) — odblokowujemy dopiero po zamknięciu ostatniej warstwy.
  var _bgLockCount = 0;
  var _bgLockPrevBodyOverflow = '';
  function _bgLockAcquire() {
    if (_bgLockCount === 0) {
      try {
        var b = global.document && global.document.body;
        _bgLockPrevBodyOverflow = b ? b.style.overflow : '';
        if (b) b.style.overflow = 'hidden';
      } catch (_) {}
    }
    _bgLockCount += 1;
  }
  function _bgLockRelease() {
    if (_bgLockCount > 0) _bgLockCount -= 1;
    if (_bgLockCount === 0) {
      try {
        var b = global.document && global.document.body;
        if (b) b.style.overflow = _bgLockPrevBodyOverflow;
      } catch (_) {}
    }
  }
  // Modal arkuszowy: zablokuj body (ref-count) + dodatkowo zamroź scroll karty
  // pod spodem (rootEl), jeśli jest widoczna, by nie przewijała się za modalem.
  // AUTO-release gdy overlay zniknie z DOM (Anuluj/Zapisz/tło/Escape/cleanup).
  function _lockBackgroundScrollUntilRemoved(overlay) {
    _bgLockAcquire();
    var rootPrevOverflow = null, rootLocked = false;
    try {
      if (rootEl && rootEl.style && global.getComputedStyle &&
          global.getComputedStyle(rootEl).display !== 'none') {
        rootPrevOverflow = rootEl.style.overflow;
        rootEl.style.overflow = 'hidden';
        rootLocked = true;
      }
    } catch (_) {}
    var released = false;
    function release() {
      if (released) return;
      released = true;
      _bgLockRelease();
      if (rootLocked) { try { rootEl.style.overflow = rootPrevOverflow || ''; } catch (_) {} }
    }
    try {
      var host = (overlay && overlay.parentNode) || global.document.body;
      if (typeof global.MutationObserver === 'function' && host) {
        var obs = new global.MutationObserver(function () {
          var stillThere = overlay && (overlay.isConnected !== false) && overlay.parentNode;
          if (!stillThere) { release(); try { obs.disconnect(); } catch (_) {} }
        });
        obs.observe(host, { childList: true });
      }
    } catch (_) {}
    return release;
  }

  // ============ R2 — REMINDER MODAL (PRZYPOMNIENIA PO ZALOGOWANIU) ============
  /**
   * Modal pokazywany po unlock vault'a — gdy są pacjenci z notatkami due dziś
   * lub overdue. Zbudowany na bazie showPatientNoteEditor (ten sam pattern overlay'a).
   *
   * @param {Array<{patientId, patientName, notes[]}>} reminders — z V.listPatientNotesDueByDate()
   * @param {object} [opts]
   *   - onOpenPatient(patientId, noteId) — callback "Otwórz" (default: showPatientCard)
   *   - onClose() — callback po zamknięciu (np. set "last-shown" flag)
   *
   * R3 wpięcie: vilda_auth_ui sam wywoła to po V.onUnlock — patrz `maybeShowReminders`.
   */
  function showRemindersModal(reminders, opts) {
    if (!Array.isArray(reminders) || !reminders.length) {
      if (opts && typeof opts.onClose === 'function') opts.onClose();
      return null;
    }

    // Cleanup poprzednich overlay'ów (multi-trigger protection — np. szybkie kliki).
    try {
      var prevList = global.document.querySelectorAll('.vilda-reminders-modal-overlay');
      if (prevList && prevList.length) {
        for (var i = 0; i < prevList.length; i++) prevList[i].remove();
      }
    } catch (_) {}

    var V = getVault();

    // ── Helper: data względna PL dla badge'a terminu ──────────────────────
    function fmtDueRel(dueISO) {
      var meta = formatPatientNoteDueDate ? formatPatientNoteDueDate(dueISO) : null;
      if (meta) return meta;
      return { status: 'ok', label: dueISO || '' };
    }

    // ── Backdrop overlay (z-index nad rootEl, host=rootEl jak w Fix #2) ──
    var overlay = el('div', {
      class: 'vilda-auth-overlay vilda-auth-overlay-sheet vilda-reminders-modal-overlay',
      style: 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000001;padding:20px;'
    });

    var sheet = el('div', {
      class: 'vilda-auth-sheet vilda-reminders-modal-sheet',
      style: 'background:#fff;border-radius:14px;padding:0;max-width:560px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;'
    });

    // ── Header: 🔔 N pacjentów wymaga uwagi ──────────────────────────────
    var totalNotes = 0;
    for (var k = 0; k < reminders.length; k++) totalNotes += reminders[k].notes.length;
    var headerTitle = '🔔 Przypomnienia';
    var headerSub = reminders.length === 1
      ? '1 pacjent · ' + totalNotes + (totalNotes === 1 ? ' notatka' : (totalNotes < 5 ? ' notatki' : ' notatek'))
      : reminders.length + ' pacjentów · ' + totalNotes + (totalNotes < 5 ? ' notatki' : ' notatek');

    var header = el('div', {
      style: 'padding:18px 20px 14px 20px;border-bottom:0.5px solid #d7e9ec;background:#f5fafb;'
    });
    header.appendChild(el('div', {
      text: headerTitle,
      style: 'font-size:1.05rem;font-weight:600;color:#0f2b33;margin-bottom:4px;'
    }));
    header.appendChild(el('div', {
      text: headerSub,
      style: 'font-size:0.82rem;color:#5b6672;'
    }));
    sheet.appendChild(header);

    // ── Scrollowalna lista pacjentów + notatek ───────────────────────────
    var listWrap = el('div', {
      class: 'vilda-reminders-list',
      style: 'flex:1 1 auto;overflow-y:auto;padding:8px 14px;display:flex;flex-direction:column;gap:14px;'
    });
    sheet.appendChild(listWrap);

    // ── Footer: przycisk „Później" ────────────────────────────────────────
    var footer = el('div', {
      style: 'padding:14px 20px;border-top:0.5px solid #d7e9ec;display:flex;justify-content:flex-end;gap:8px;flex:0 0 auto;'
    });
    var laterBtn = el('button', {
      type: 'button',
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-small',
      style: 'background:transparent !important;color:#5b6672 !important;border:0.5px solid #d7e9ec !important;width:auto !important;padding:8px 16px !important;flex:0 0 auto !important;',
      text: 'Później',
      onclick: function () {
        overlay.remove();
        if (opts && typeof opts.onClose === 'function') opts.onClose();
      }
    });
    footer.appendChild(laterBtn);
    sheet.appendChild(footer);

    overlay.appendChild(sheet);
    // P4-fix #3 (R4 dzwonek): host=body gdy rootEl hidden — patrz _chooseOverlayHost.
    var host = _chooseOverlayHost();
    host.appendChild(overlay);

    // ── Re-render listy po każdej akcji (zrobione/przełóż) ───────────────
    // Po każdej akcji pobieramy SWIEŻY snapshot z vault'a (oryginalny reminders
    // staje się nieaktualny po V.completePatientNote/snooze). Gdy pusty → close.
    async function refreshList() {
      var fresh = [];
      try {
        if (V && typeof V.listPatientNotesDueByDate === 'function') {
          fresh = await V.listPatientNotesDueByDate();
        }
      } catch (e) { logError('refreshReminders', e); }
      if (!fresh.length) {
        overlay.remove();
        if (opts && typeof opts.onClose === 'function') opts.onClose();
        return;
      }
      buildList(fresh);
    }

    function buildList(items) {
      clear(listWrap);
      items.forEach(function (group) {
        var card = el('div', {
          class: 'vilda-reminders-patient-card',
          style: 'background:#fff;border:0.5px solid #d7e9ec;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;'
        });

        // Patient header
        card.appendChild(el('div', {
          text: group.patientName,
          style: 'font-weight:600;font-size:0.95rem;color:#0f2b33;'
        }));

        // Notatki w karcie pacjenta
        group.notes.forEach(function (note) {
          card.appendChild(buildNoteItem(group.patientId, note));
        });

        listWrap.appendChild(card);
      });
    }

    function buildNoteItem(patientId, note) {
      var wrap = el('div', {
        style: 'background:#f5fafb;border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:8px;'
      });

      // Badges row: kategoria + due
      var catMeta = (typeof PATIENT_NOTE_CATEGORY_LABELS === 'object' && PATIENT_NOTE_CATEGORY_LABELS[note.category])
        || { label: note.category || 'Notatka', color: '#0F6E56', bg: '#E1F5EE' };
      var dueMeta = fmtDueRel(note.dueDateISO);

      var badges = el('div', { style: 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;' });
      badges.appendChild(el('span', {
        text: catMeta.label,
        style: 'display:inline-block;padding:2px 8px;font-size:0.72rem;font-weight:600;color:' + catMeta.color + ';background:' + catMeta.bg + ';border-radius:999px;'
      }));
      if (dueMeta) {
        var dueBg, dueColor;
        if (dueMeta.status === 'overdue') { dueBg = '#FCEBEB'; dueColor = '#A32D2D'; }
        else if (dueMeta.status === 'soon') { dueBg = '#FAEEDA'; dueColor = '#854F0B'; }
        else { dueBg = '#E1F5EE'; dueColor = '#0F6E56'; }
        badges.appendChild(el('span', {
          text: 'Termin: ' + dueMeta.label,
          style: 'display:inline-block;padding:2px 8px;font-size:0.72rem;font-weight:600;color:' + dueColor + ';background:' + dueBg + ';border-radius:999px;'
        }));
      }
      wrap.appendChild(badges);

      // Tytuł (jeśli jest)
      if (note.title) {
        wrap.appendChild(el('div', {
          text: note.title,
          style: 'font-weight:600;font-size:0.92rem;color:#0f2b33;'
        }));
      }
      // Body (truncate visually via CSS, full text dostępny w karcie pacjenta)
      if (note.body) {
        wrap.appendChild(el('div', {
          text: note.body,
          style: 'font-size:0.86rem;color:#374151;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;'
        }));
      }

      // Actions row
      var actions = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;' });

      // [✓ Zrobione]
      var doneBtn = el('button', {
        type: 'button',
        class: 'vilda-auth-btn vilda-auth-btn-small',
        style: 'background:#E1F5EE !important;color:#0F6E56 !important;border:0.5px solid #b4dfd0 !important;width:auto !important;padding:5px 12px !important;font-size:0.78rem !important;font-weight:600;flex:0 0 auto !important;',
        text: '✓ Zrobione',
        onclick: async function () {
          doneBtn.disabled = true;
          try {
            await V.completePatientNote(note.id);
            await refreshList();
          } catch (e) {
            doneBtn.disabled = false;
            logError('reminder-complete', e);
            try { global.alert('Nie udało się oznaczyć: ' + (e && e.message ? e.message : e)); } catch (_) {}
          }
        }
      });
      actions.appendChild(doneBtn);

      // [⏰ Przełóż ▼] — submenu
      var snoozeBtn = el('button', {
        type: 'button',
        class: 'vilda-auth-btn vilda-auth-btn-small',
        style: 'background:#FAEEDA !important;color:#854F0B !important;border:0.5px solid #e7c896 !important;width:auto !important;padding:5px 12px !important;font-size:0.78rem !important;font-weight:600;flex:0 0 auto !important;position:relative;',
        text: '⏰ Przełóż ▾',
        onclick: function (ev) {
          if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
          showSnoozeSubmenu(snoozeBtn, note.id);
        }
      });
      actions.appendChild(snoozeBtn);

      // [→ Otwórz]
      var openBtn = el('button', {
        type: 'button',
        class: 'vilda-auth-btn vilda-auth-btn-small',
        style: 'background:transparent !important;color:#00838d !important;border:0.5px solid #b3dde0 !important;width:auto !important;padding:5px 12px !important;font-size:0.78rem !important;font-weight:600;flex:0 0 auto !important;',
        text: '→ Otwórz',
        onclick: function () {
          overlay.remove();
          if (opts && typeof opts.onClose === 'function') opts.onClose();
          // Per Q7: open patient card + auto-switch do tab Notatki.
          // Lekki delay żeby overlay zdążył zniknąć przed renderem karty.
          setTimeout(function () {
            try {
              if (opts && typeof opts.onOpenPatient === 'function') {
                opts.onOpenPatient(patientId, note.id);
              } else {
                showPatientCard(patientId, null, { focusNoteId: note.id });
              }
            } catch (e) { logError('reminder-open', e); }
          }, 50);
        }
      });
      actions.appendChild(openBtn);

      wrap.appendChild(actions);
      return wrap;
    }

    // ── Submenu „Przełóż" — popover z 4 opcjami ──────────────────────────
    function showSnoozeSubmenu(anchorBtn, noteId) {
      // Cleanup poprzednich submenu (jedno na raz).
      try {
        var prevMenus = global.document.querySelectorAll('.vilda-reminders-snooze-menu');
        for (var m = 0; m < prevMenus.length; m++) prevMenus[m].remove();
      } catch (_) {}

      // R2-fix: position:fixed z viewport coords zamiast absolute (parent actions
      // nie ma position:relative, więc absolute uciekało do <html> w lewy górny róg).
      var menu = el('div', {
        class: 'vilda-reminders-snooze-menu',
        style: 'position:fixed;background:#fff;border:0.5px solid #d7e9ec;border-radius:10px;box-shadow:0 8px 24px rgba(0,40,48,0.18);padding:6px;display:flex;flex-direction:column;gap:2px;z-index:1000002;min-width:200px;'
      });

      function addOpt(label, days) {
        var opt = el('button', {
          type: 'button',
          style: 'background:transparent;border:none;text-align:left;padding:8px 12px;font-size:0.85rem;color:#0f2b33;cursor:pointer;border-radius:6px;font-family:inherit;',
          text: label,
          onclick: async function () {
            menu.remove();
            var target = new Date();
            target.setDate(target.getDate() + days);
            var yyyy = target.getFullYear();
            var mm = String(target.getMonth() + 1).padStart(2, '0');
            var dd = String(target.getDate()).padStart(2, '0');
            try {
              await V.snoozePatientNote(noteId, yyyy + '-' + mm + '-' + dd);
              await refreshList();
            } catch (e) {
              logError('reminder-snooze', e);
              try { global.alert('Nie udało się przełożyć: ' + (e && e.message ? e.message : e)); } catch (_) {}
            }
          }
        });
        opt.addEventListener('mouseover', function () { opt.style.background = '#f5fafb'; });
        opt.addEventListener('mouseout', function () { opt.style.background = 'transparent'; });
        menu.appendChild(opt);
      }

      addOpt('Jutro', 1);
      addOpt('Pojutrze', 2);
      addOpt('Za tydzień', 7);

      // Separator
      menu.appendChild(el('div', { style: 'height:1px;background:#d7e9ec;margin:4px 6px;' }));

      // Custom date picker
      var customWrap = el('div', { style: 'padding:6px 8px;display:flex;flex-direction:column;gap:6px;' });
      customWrap.appendChild(el('div', {
        text: 'Wybierz datę:',
        style: 'font-size:0.78rem;color:#5b6672;font-weight:500;'
      }));
      var dateInput = el('input', {
        type: 'date',
        style: 'width:100%;height:32px;padding:0 8px;font-size:0.85rem;border:0.5px solid #d7e9ec;border-radius:6px;background:#fff;color:#0f2b33;'
      });
      // Domyślna wartość: jutro
      var defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 1);
      dateInput.value = defaultDate.getFullYear() + '-'
        + String(defaultDate.getMonth() + 1).padStart(2, '0') + '-'
        + String(defaultDate.getDate()).padStart(2, '0');
      customWrap.appendChild(dateInput);
      var confirmBtn = el('button', {
        type: 'button',
        class: 'vilda-auth-btn vilda-auth-btn-small',
        style: 'background:#00838d !important;color:#fff !important;border-color:#00838d !important;width:100% !important;padding:6px !important;font-size:0.8rem !important;font-weight:600;',
        text: 'Przełóż',
        onclick: async function () {
          if (!dateInput.value) return;
          menu.remove();
          try {
            await V.snoozePatientNote(noteId, dateInput.value);
            await refreshList();
          } catch (e) {
            logError('reminder-snooze-custom', e);
            try { global.alert('Nie udało się przełożyć: ' + (e && e.message ? e.message : e)); } catch (_) {}
          }
        }
      });
      customWrap.appendChild(confirmBtn);
      menu.appendChild(customWrap);

      // R2-fix: append do body (a nie parent actions) — pozycjonowanie fixed
      // pracuje na viewport coords i nie wymaga relative parent. To gwarantuje że
      // submenu pojawia się dokładnie pod przyciskiem niezależnie od stacking context.
      global.document.body.appendChild(menu);

      // Pozycjonuj poniżej anchorBtn. Trzeba poczekać 1 frame żeby menu miało
      // realne wymiary (offsetWidth) — wtedy możemy go zmieścić w viewporcie.
      var rect = anchorBtn.getBoundingClientRect();
      var menuWidth = menu.offsetWidth || 220; // estimate gdy 0 (pre-paint)
      var menuHeight = menu.offsetHeight || 240;
      var viewportW = global.innerWidth || global.document.documentElement.clientWidth;
      var viewportH = global.innerHeight || global.document.documentElement.clientHeight;

      // Domyślnie: tuż pod przyciskiem, wyrównane do lewej krawędzi przycisku.
      var top = rect.bottom + 4;
      var left = rect.left;

      // Edge protection — gdy submenu wychodzi za prawą krawędź, dosuń do prawej.
      if (left + menuWidth > viewportW - 8) {
        left = Math.max(8, rect.right - menuWidth);
      }
      // Gdy wychodzi poniżej viewportu — pokaż NAD przyciskiem.
      if (top + menuHeight > viewportH - 8) {
        top = Math.max(8, rect.top - menuHeight - 4);
      }

      menu.style.top = top + 'px';
      menu.style.left = left + 'px';

      // Click-outside → close
      setTimeout(function () {
        function onDocClick(ev) {
          if (!menu.contains(ev.target) && ev.target !== anchorBtn) {
            menu.remove();
            global.document.removeEventListener('click', onDocClick, true);
          }
        }
        global.document.addEventListener('click', onDocClick, true);
      }, 0);
    }

    // ── Pierwszy render ───────────────────────────────────────────────────
    buildList(reminders);

    return overlay;
  }

  // ============ R3 — AUTO-TRIGGER REMINDER MODAL'A PO UNLOCK ============
  /**
   * Pomocnik: lokalna data w formacie YYYY-MM-DD (Q8 — „dzisiaj" w mojej strefie).
   */
  function _todayLocalDateString() {
    var d = new Date();
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  /**
   * Czyta flag cloud-synced "ostatnio pokazany reminder modal" (data YYYY-MM-DD).
   * Per Q1 (rekomendacja A): pokazuj raz dziennie, cloud-synced cross-device.
   */
  function _readRemindersLastShownDate() {
    try {
      var P = global.VildaPersistence;
      if (!P || typeof P.readModuleRaw !== 'function') return null;
      var raw = P.readModuleRaw('remindersLastShownDate', null);
      return (typeof raw === 'string' && raw) ? raw : null;
    } catch (_) { return null; }
  }

  /**
   * Zapisuje flag — uruchamia cloud-synced propagation (E3 onPreferenceWrite →
   * vault meta.userPreferences → syncPush → LWW na innych urządzeniach).
   */
  function _writeRemindersLastShownDate(dateStr) {
    try {
      var P = global.VildaPersistence;
      if (!P || typeof P.writeModuleRaw !== 'function') return false;
      P.writeModuleRaw('remindersLastShownDate', dateStr);
      return true;
    } catch (e) {
      logError('writeRemindersLastShownDate', e);
      return false;
    }
  }

  /**
   * Sprawdza czy są dziś pacjenci z notatkami due i jeśli flag != dzisiaj, pokazuje
   * modal. Wywoływane przez bootstrap V.onUnlock z lekkim delayem (3000ms żeby
   * po-login prompty — biometric/adoption/force-reset — zdążyły się zamknąć).
   *
   * @param {object} [options]
   *   - force=true: ignoruj flag (dla manual triggera, np. klik chip w sidebar)
   * @returns {Promise<boolean>} true gdy modal pokazany, false gdy skipped
   */
  async function maybeShowReminders(options) {
    try {
      var V = getVault();
      if (!V || !V.isUnlocked()) return false;
      if (typeof V.listPatientNotesDueByDate !== 'function') return false;

      var force = !!(options && options.force);
      var today = _todayLocalDateString();

      // Per Q1 (A): raz dziennie cloud-synced.
      if (!force) {
        var lastShown = _readRemindersLastShownDate();
        if (lastShown === today) return false; // już dziś pokazany — skip
      }

      var reminders = await V.listPatientNotesDueByDate();
      if (!reminders || !reminders.length) {
        // Nic do pokazania — nadal ustaw flag, żeby nie odpalać query co restart.
        if (!force) _writeRemindersLastShownDate(today);
        return false;
      }

      // Pokaż modal i ustaw flag PO zamknięciu.
      showRemindersModal(reminders, {
        onClose: function () {
          _writeRemindersLastShownDate(today);
        }
      });
      return true;
    } catch (e) {
      logError('maybeShowReminders', e);
      return false;
    }
  }

  // ── Wpięcie w post-unlock lifecycle ──────────────────────────────────────
  // Bootstrap raz: rejestrujemy listener V.onUnlock, który z opóźnieniem 3s
  // wywołuje maybeShowReminders. Opóźnienie daje przestrzeń innym promptom
  // (showPostLoginBiometricPrompt, showPostLoginAdoptionPrompt, force-reset)
  // żeby się otworzyły JAKO PIERWSZE. Reminder pokaże się PO ich zamknięciu
  // (overlay sheet z marker class cleanup'uje stare instances).
  var _remindersTriggerRegistered = false;
  function _registerRemindersTrigger() {
    if (_remindersTriggerRegistered) return;
    var V = getVault();
    if (!V || typeof V.onUnlock !== 'function') return;
    V.onUnlock(function () {
      // Lekki delay (3000ms) — daje czas na biometric/adoption/force-reset prompty.
      // Te modały blokują UI overlay i mają wyższy priorytet wizualny. Reminder
      // czeka jako ostatni w kolejce.
      setTimeout(function () {
        maybeShowReminders().catch(function () {});
      }, 3000);
    });
    _remindersTriggerRegistered = true;
  }

  // ============ KARTA INDYWIDUALNEGO PACJENTA ============
  /**
   * Otwiera szczegółową kartę pacjenta z jego statystykami i sparkline.
   * @param {string} patientId   — ID z listPatients()
   * @param {Function|null} onPick — callback do wczytania danych (null = viewOnly)
   * @param {object} listOptions  — opcje przekazywane z powrotem do showPatientsList
   */
  async function showPatientCard(patientId, onPick, listOptions, opts) {
    var V = getVault();
    if (!V || !V.isUnlocked()) return;

    // Pokaż skeleton ładowania
    open(el('div', { class: 'vilda-auth-screen vilda-auth-patient-card' }, [
      el('h2', { class: 'vilda-auth-title', text: 'Karta pacjenta' }),
      el('p', { class: 'vilda-auth-subtitle', text: 'Wczytywanie danych…' })
    ]), { noLogo: true });
    setBusy(true);

    // Faza 42c — ładujemy pełny rekord pacjenta (wszystkie snapshoty), żeby zbudować
    // trajektorię z całej historii zapisów, a nie tylko z najnowszego snapshota.
    var patientFull = null;
    try { patientFull = await V.getPatient(patientId); }
    catch (e) { logError('showPatientCard getPatient', e); }
    setBusy(false);

    var allSnapshots = (patientFull && Array.isArray(patientFull.snapshots)) ? patientFull.snapshots : [];
    var snap = allSnapshots.length ? allSnapshots[0] : null; // najnowszy (sortowane malejąco po dacie)

    if (!snap || !snap.payload) {
      open(el('div', { class: 'vilda-auth-screen vilda-auth-patient-card' }, [
        el('h2', { class: 'vilda-auth-title', text: 'Karta pacjenta' }),
        el('p', { class: 'vilda-auth-subtitle', text: 'Nie udało się wczytać danych pacjenta.' }),
        el('div', { class: 'vilda-auth-actions' }, [
          el('button', { class: 'vilda-auth-btn vilda-auth-btn-ghost', type: 'button',
            text: '← Wróć do listy',
            onclick: function () { showPatientsList(onPick, listOptions); }
          })
        ])
      ]), { noLogo: true });
      return;
    }

    var payload = snap.payload;

    // ── Faza 42f — tymczasowe przełączenie globalnego bmiSource ──
    // Wszystkie funkcje obliczeniowe (calcPercentileStats, bmiPercentileChild)
    // i LMS-gettery (getChildLMS, getLMS) w głębi sprawdzają window.bmiSource,
    // żeby wybrać OLAF / WHO / Palczewska. W kalkulatorze głównym ustawia to
    // suwak; Karta pacjenta sama z siebie tego nie wie, więc używała wartości
    // globalnej (zwykle OLAF defaultu) i ignorowała preferencję pacjenta.
    // Tutaj odczytujemy zapisaną siatkę z payload.zscore.dataSource i
    // ustawiamy bmiSource na ten sam okres. Przywracamy przed `open(...)`,
    // żeby nie wpłynąć na resztę aplikacji.
    var _origBmiSource = (typeof global.bmiSource !== 'undefined') ? global.bmiSource : null;
    var _bmiSourceOverridden = false;
    try {
      var _pds = (payload.zscore && payload.zscore.dataSource)
        ? String(payload.zscore.dataSource).toUpperCase() : null;
      if (_pds && /^(OLAF|WHO|PALCZEWSKA)$/.test(_pds)) {
        global.bmiSource = _pds;
        _bmiSourceOverridden = true;
      }
    } catch (_) {}

    // ── Dane z formularza (struktura collectUserData) ──
    var user      = payload.user     || {};
    var advanced  = payload.advanced || {};
    var growthRoot = payload.growthBasic || {};
    var growthData = growthRoot.data     || {};

    var name      = payload.name || '(bez imienia)';
    var age       = user.age       != null ? parseInt(user.age, 10)       : null;
    var ageMonths = user.ageMonths != null ? parseInt(user.ageMonths, 10) : null;
    var sex       = user.sex || '';
    var height    = user.height != null ? parseFloat(user.height) : null;
    var weight    = user.weight != null ? parseFloat(user.weight) : null;

    // totalAgeMonths = pełny wiek w miesiącach do obliczeń centylowych
    // P6.2 — Wiek z DOB (jeśli pacjent ma) liczony NA DZIŚ ma priorytet nad
    // wiekiem zapisanym w snapshot.user.age (= wiek w dniu pomiaru). To pozwala
    // pokazać aktualny wiek pacjenta i przeliczyć centyle "jak na dzisiaj"
    // gdy ostatni zapis jest sprzed kilku miesięcy.
    //
    // Logika:
    //   1) snapshotTotalAgeMonths — wiek z payloadu (zawsze, jako fallback i baseline)
    //   2) dobTotalAgeMonths — wiek liczony z DOB na dziś (gdy DOB jest)
    //   3) resolvedTotal — używany wszędzie do obliczeń (DOB jeśli jest, inaczej snapshot)
    //   4) recalculatedToday — true gdy diff > 3 mies. (wtedy w kafelkach
    //      dodajemy sub "przeliczono na dziś · ostatni pomiar: ...")
    var snapshotTotalAgeMonths = (age != null && ageMonths != null)
      ? (age * 12 + ageMonths)
      : (age != null ? age * 12 : null);
    var dobResolvedAge = null;
    if (user.dobISO && typeof V.calcAgeFromDOB === 'function') {
      dobResolvedAge = V.calcAgeFromDOB(user.dobISO);
    }
    var totalAgeMonths = (dobResolvedAge && isFinite(dobResolvedAge.totalMonths))
      ? dobResolvedAge.totalMonths
      : snapshotTotalAgeMonths;
    var recalculatedToday = false;
    if (dobResolvedAge && snapshotTotalAgeMonths != null
        && Math.abs(dobResolvedAge.totalMonths - snapshotTotalAgeMonths) > 3) {
      recalculatedToday = true;
    }
    // Display data ostatniego pomiaru (do subscriptu "przeliczono na dziś · ostatni pomiar: ...")
    var lastMeasureDisplay = '';
    if (recalculatedToday && (snap.savedAtISO || snap.lastSavedAtISO)) {
      var _lmISO = snap.savedAtISO || snap.lastSavedAtISO;
      var _lmD = new Date(_lmISO);
      if (!isNaN(_lmD.getTime())) {
        var _pad = function (n) { return n < 10 ? '0' + n : String(n); };
        lastMeasureDisplay = _pad(_lmD.getDate()) + '-' + _pad(_lmD.getMonth() + 1) + '-' + _lmD.getFullYear();
      }
    }

    // ── Dane wzrostowe (sparkline + prędkość) — FIX-CENTYLE v2 ──
    // Źródło prawdy zmienione z `growthData.measurements[]` (latest snapshot)
    // na ten sam helper, którego używa zakładka Historia:
    // `V.listPatientTimelineEvents(patientId)`.
    //
    // Przyczyna: dla pacjentów których kilka ostatnich snapshotów to były tylko
    // edycje (np. modal „+ Nowy pomiar" P6.3 zapisywał measurement do timeline
    // bez aktualizacji `growthBasic.data.measurements[]`), latestSnapshot zawierał
    // stary `measurements[]` (zaśmiecony PRE-K1 lub niezsynchronizowany). Sekcja
    // „Siatki centylowe" pokazywała „Brak wystarczających danych" mimo że Hero/
    // Historia widziały pełną listę pomiarów.
    //
    // listPatientTimelineEvents (po B1.2 + J2 + K1) iteruje po WSZYSTKICH
    // snapshotach, dedupuje po (ageMonths, height, weight) i synthesizuje
    // aktualny pomiar z payload.user. Siatki widzą dokładnie te same punkty
    // co Hero/Historia → spójność karty pacjenta dla starych pacjentów.
    var measurements = [];
    try {
      var timelineEvents = await V.listPatientTimelineEvents(patientId);
      measurements = (timelineEvents || [])
        .filter(function (ev) { return ev && ev.type === 'measurement' && ev.height != null; })
        .map(function (ev) {
          return {
            ageMonths: ev.ageMonths,
            ageYears: (typeof ev.ageYears === 'number') ? ev.ageYears : (ev.ageMonths / 12),
            height: ev.height,
            weight: ev.weight,
            sex: ev.sex || sex,
            boneAgeYears: ev.boneAgeYears
          };
        });
    } catch (e) {
      logError('showPatientCard listPatientTimelineEvents for charts', e);
      // Fallback do starej ścieżki — gdyby vault API zmieniło sygnaturę.
      measurements = (growthData.measurements || []).filter(function (m) {
        return m && m.height != null;
      });
    }
    var growthVelocity = growthData.growthVelocity != null ? growthData.growthVelocity : null;
    var isLosingGrowth = !!growthData.isLosingGrowth;
    var isSlowVelocity = !!growthData.isSlowVelocity;

    // Defensywny sort po wieku ASC (tabela może być nieuporządkowana po sync merge).
    measurements.sort(function (a, b) {
      return measurementAgeInMonths(a) - measurementAgeInMonths(b);
    });

    // ── BMI ──
    var bmi = null;
    if (height != null && weight != null && height > 0) {
      bmi = weight / Math.pow(height / 100, 2);
    }

    // ── Centyle — używaj globalnych funkcji aplikacji gdy dostępne ──
    var heightPerc = null, weightPerc = null, bmiPerc = null;
    var isAdult = (totalAgeMonths != null && totalAgeMonths >= 216); // 18 lat
    var sexForCalc = sex; // M/K lub chłopiec/dziewczynka — funkcje obsługują oba formaty
    // Faza 42e — używaj pełnego wieku w ułamkowych latach (z miesiącami), żeby
    // percentyl w kafelku był spójny z pozycją kropki na wykresie. Wcześniejsza
    // wersja używała `age` (samo całe lata) — co zawyżało percentyl np. o 10
    // punktów u dziecka kilka miesięcy po urodzinach.
    var ageForStats = (totalAgeMonths != null && isFinite(totalAgeMonths))
      ? (totalAgeMonths / 12)
      : age;
    try {
      if (!isAdult && ageForStats != null && isFinite(ageForStats) && typeof calcPercentileStats === 'function') {
        if (height != null) {
          var sH = calcPercentileStats(height, sexForCalc, ageForStats, 'HT');
          if (sH && sH.percentile != null) heightPerc = sH.percentile;
        }
        if (weight != null) {
          var sW = calcPercentileStats(weight, sexForCalc, ageForStats, 'WT');
          if (sW && sW.percentile != null) weightPerc = sW.percentile;
        }
      }
      if (!isAdult && bmi != null && totalAgeMonths != null && typeof bmiPercentileChild === 'function') {
        var bp = bmiPercentileChild(bmi, sexForCalc, totalAgeMonths);
        if (bp != null) bmiPerc = bp;
      }
    } catch (_) {}

    // ── Wskaźnik Cole'a (tylko dzieci, wymaga LMS) ──
    var cole = null;
    try {
      if (!isAdult && bmi != null && totalAgeMonths != null && typeof getLMS === 'function') {
        var lms = getLMS(sexForCalc, Math.round(totalAgeMonths));
        if (lms && lms.M) {
          cole = (bmi / lms.M) * 100;
        }
      }
    } catch (_) {}

    // ── Źródło danych centylowych ──
    var zscore = payload.zscore || {};
    var dataSource = (typeof zscore.dataSource === 'string' && zscore.dataSource)
      ? zscore.dataSource.toUpperCase() : null;
    var dataSourceLabel = dataSource === 'PALCZEWSKA' ? 'Palczewska'
      : dataSource === 'WHO' ? 'WHO' : dataSource === 'OLAF' ? 'OLAF' : null;

    // ── MPH (Mid-Parental Height) ──
    var motherH = advanced.motherHeight ? parseFloat(advanced.motherHeight) : null;
    var fatherH = advanced.fatherHeight ? parseFloat(advanced.fatherHeight) : null;
    var mph = null;
    var mphPerc = null;
    if (motherH && fatherH && isFinite(motherH) && isFinite(fatherH)) {
      var sexL = sex.toLowerCase();
      if (sexL === 'm' || sexL === 'ch' || sexL === 'chłopiec' || sexL === 'male') {
        mph = (motherH + fatherH + 13) / 2;
      } else if (sexL === 'k' || sexL === 'dz' || sexL === 'dziewczynka' || sexL === 'female' ||
                 sexL === 'f') {
        mph = (motherH + fatherH - 13) / 2;
      }
    }
    // Centyl MPH — wzrost docelowy oceniamy na siatce w wieku 18 lat
    if (mph != null) {
      try {
        if (dataSource === 'PALCZEWSKA' && typeof calcPercentileStatsPal === 'function') {
          var mphS = calcPercentileStatsPal(mph, sex, 18, 'HT');
          if (mphS && mphS.percentile != null) mphPerc = mphS.percentile;
        } else if (typeof calcPercentileStats === 'function') {
          var mphS2 = calcPercentileStats(mph, sex, 18, 'HT');
          if (mphS2 && mphS2.percentile != null) mphPerc = mphS2.percentile;
        }
      } catch (_) {}
    }

    // ── Klasyfikacja kolorów (spójna z vilda_summary_cards.js) ──
    function classify(type, val, perc) {
      if (!isAdult) {
        // Spójne z głównym „Podsumowaniem wyników" (custom-fixes.js → getCentileState):
        //   <3 || >97  → alert   (czerwony)
        //   <10 || >90 → improve (pomarańczowy „borderline")
        //   10–90      → null    (turkus)
        // Waga/wzrost — symetryczne pasma percentyla (wcześniej brakowało dolnego
        // pasma 3–10 → waga np. na 8. centylu fałszywie świeciła na turkus).
        if (type === 'height' || type === 'weight') {
          if (perc == null) return null;
          if (perc < 3 || perc > 97) return 'alert';
          if (perc < 10 || perc > 90) return 'improve';
          return null;
        }
        // BMI — KLINICZNE progi for-age (85 nadwaga, 97 otyłość), świadomie inne
        // niż symetryczne 90/97 z getCentileState (wariant A — czułość nadwagi).
        if (type === 'bmi')    return (perc != null) ? (perc >= 97 || perc < 3 ? 'alert' : perc >= 85 ? 'improve' : null) : null;
        if (type === 'cole')   return (val != null)  ? (val < 90 || val >= 120 ? 'alert' : val > 110 ? 'improve' : null) : null;
      } else {
        if (type === 'bmi')  return (val != null) ? (val >= 30 || val < 18.5 ? 'alert' : val >= 25 ? 'improve' : null) : null;
        if (type === 'cole') return (val != null) ? (val < 90 || val >= 120 ? 'alert' : val > 110 ? 'improve' : null) : null;
      }
      return null;
    }

    // ── Formatowanie centyla ──
    function fmtCentyl(p) {
      if (p == null || !isFinite(p)) return '';
      var r = Math.round(p);
      if (r < 1)  return '<1. centyl';
      if (r > 99) return '>99. centyl';
      return r + '. centyl';
    }

    // ── Buduj kafelkę statystyki ──
    // P6.2 — Dodany opcjonalny parametr `subAlt` (5.) — drobna szara linia pod
    // sub, używana do oznaczenia "przeliczono na dziś · ostatni pomiar: ..."
    // gdy centyl został przeliczony na bieżący wiek z DOB, a snapshot jest
    // sprzed >3 miesięcy. Lekarz widzi, że wartość kafelka pochodzi z innego
    // (starszego) pomiaru niż dzisiejsza data.
    function statEl(label, value, sub, status, subAlt) {
      var cls = 'vilda-patient-stat';
      if (status === 'alert')   cls += ' vilda-patient-stat--alert';
      else if (status === 'improve') cls += ' vilda-patient-stat--improve';
      else if (value && value !== '—') cls += ' vilda-patient-stat--ok';
      var children = [
        el('div', { class: 'vilda-patient-stat-label', text: label }),
        el('div', { class: 'vilda-patient-stat-value', text: value || '—' })
      ];
      if (sub) {
        var subCls = (status === 'alert' || status === 'improve')
          ? 'vilda-patient-stat-extra' : 'vilda-patient-stat-sub';
        children.push(el('div', { class: subCls, text: sub }));
      }
      if (subAlt) {
        children.push(el('div', {
          class: 'vilda-patient-stat-sub-alt',
          style: 'font-size:0.72rem; color:#7a8788; font-style:italic; margin-top:2px;',
          text: subAlt
        }));
      }
      return el('div', { class: cls }, children);
    }

    function fmtNum(n, dec) {
      if (n == null || !isFinite(n)) return null;
      return n.toFixed(dec != null ? dec : 1).replace('.', ',');
    }

    // Faza 42 — usunięto stary płaski statsChildren; statystyki są teraz pogrupowane
    // (Pomiar / Wzrastanie i genetyka) i budowane wewnątrz zakładki „Status".

    // ── Faza 42 — KONCEPCJA C: kompaktowy hero + zakładki Status / Siatki centylowe ──
    // P6.2 — Wiek w hero używa DOB-resolved totalAgeMonths (jeśli pacjent ma DOB).
    // Bez DOB: pokazujemy wiek z snapshota (legacy zachowanie). Format przez _formatAge.
    var ageStr = '';
    if (typeof totalAgeMonths === 'number' && isFinite(totalAgeMonths) && totalAgeMonths >= 0) {
      ageStr = _formatAge(totalAgeMonths);
    } else if (age != null) {
      // Defensywny fallback (gdyby resolver zwrócił null/NaN, czego nie powinien)
      ageStr = age + ' lat';
      if (ageMonths != null && ageMonths > 0) {
        ageStr += ' i ' + ageMonths + (ageMonths === 1 ? ' miesiąc' : ageMonths < 5 ? ' miesiące' : ' miesięcy');
      }
    }
    var headerMeta = [ageStr, sex].filter(Boolean).join(' · ');
    var lastSavedStr = (snap.savedAtISO || snap.lastSavedAtISO)
      ? formatRelativeISO(snap.savedAtISO || snap.lastSavedAtISO) : '';
    // P6.2 — Sub-line "ur. DD-MM-RRRR" pod meta (tylko gdy pacjent ma DOB)
    var dobDisplayHero = '';
    if (user.dobISO && typeof V.formatDobForDisplay === 'function') {
      dobDisplayHero = V.formatDobForDisplay(user.dobISO);
    }

    // ── HERO kompaktowy (wariant 1: bez awatara, bez statusu BMI) ──
    // Awatar-kółko z inicjałem usunięty; tożsamość niesie sam nagłówek +
    // turkusowy akcent boczny karty (CSS .vilda-patient-hero). Chip statusu BMI
    // też usunięty — kafelki Status są już kolorowane percentylem i od razu
    // wskazują problemy, więc chip był redundantny i zabierał miejsce.
    var heroInfoChildren = [
      el('div', { class: 'vilda-patient-hero-name', text: name })
    ];
    if (headerMeta) heroInfoChildren.push(el('div', { class: 'vilda-patient-hero-meta', text: headerMeta }));
    if (dobDisplayHero) heroInfoChildren.push(el('div', { class: 'vilda-patient-hero-meta vilda-patient-hero-meta--small', text: 'ur. ' + dobDisplayHero }));
    // „Ostatni wpis: …" usunięty z nagłówka (Propozycja 1) — zwalnia miejsce na
    // większe imię/nazwisko; ta informacja jest dostępna w zakładce Historia.
    void lastSavedStr;

    // P5 — pill button „Edytuj" w prawym górnym rogu hero. Otwiera osobny
    // ekran edycji (showPatientEditScreen). Tab Edycja został zastąpiony
    // zakładką Historia (timeline), więc dostęp do formularza edycji idzie
    // przez tę pill (jasne, łatwe do trafienia, nie zaśmieca tabBar).
    var editPill = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-small vilda-patient-hero-edit-pill',
      type: 'button',
      text: '✏ Edytuj',
      title: 'Edytuj dane pacjenta',
      'aria-label': 'Edytuj dane pacjenta',
      onclick: function () { showPatientEditScreen(patientId, onPick, listOptions); }
    });

    // P6.3 — pill „+ Nowy pomiar" jako prominent primary CTA w hero. Otwiera
    // modal `showQuickMeasureModal` (wariant A), który klonuje payload poprzedni
    // i tworzy nowy snapshot z aktualną wagą/wzrostem. Pill jest pod editem
    // (oba absolute top-right, edit wyżej, nowy pomiar niżej z większym
    // marginesem — przez CSS `.vilda-patient-hero-new-measure-pill`).
    var newMeasurePill = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-small vilda-patient-hero-new-measure-pill',
      type: 'button',
      text: '+ Nowy pomiar',
      title: 'Dodaj nowy pomiar (waga, wzrost)',
      'aria-label': 'Dodaj nowy pomiar',
      onclick: function () {
        showQuickMeasureModal(patientId, {
          onSaved: function () {
            // Po zapisie — przerenderuj kartę pacjenta od zera, by pokazać
            // nowy chip Pomiar w Historia + zaktualizowane kafelki Status.
            showPatientCard(patientId, onPick, listOptions);
          }
        });
      }
    });

    var heroDiv = el('div', { class: 'vilda-patient-hero' }, [
      el('div', { class: 'vilda-patient-hero-info' }, heroInfoChildren),
      el('div', { class: 'vilda-patient-hero-actions' }, [editPill, newMeasurePill])
    ]);

    // ── ZAKŁADKI (segmentowany przełącznik z ikonami — wariant 1) ──
    // Ikony jako inline SVG (stroke=currentColor) — brak zależności od webfontu.
    // Aktywna zakładka wypełniona turkusem (CSS .vilda-patient-tab--active).
    function _tabSvg(paths) {
      return '<svg class="vilda-patient-tab-ico" width="18" height="18" viewBox="0 0 24 24" '
        + 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
        + 'stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
    }
    function _tabHtml(svgPaths, label) {
      return _tabSvg(svgPaths) + '<span class="vilda-patient-tab-lbl">' + label + '</span>';
    }
    var _ICO_STATUS = '<path d="M3 12h4l2 6 4-12 2 6h6"/>';
    var _ICO_TRAJ   = '<path d="M4 4v16h16"/><path d="M7 15l4-4 3 2 5-6"/>';
    var _ICO_NOTES  = '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>';
    var _ICO_HIST   = '<path d="M3 4v5h5"/><path d="M3.5 9a9 9 0 1 1-1 4"/><path d="M12 8v4l3 2"/>';
    var tabAntro = el('button', {
      class: 'vilda-patient-tab vilda-patient-tab--active',
      type: 'button',
      html: _tabHtml(_ICO_STATUS, 'Status'),
      'data-tab': 'antro'
    });
    var tabTraj = el('button', {
      class: 'vilda-patient-tab',
      type: 'button',
      html: _tabHtml(_ICO_TRAJ, 'Siatki centylowe'),
      'data-tab': 'traj'
    });
    var tabNotes = el('button', {
      class: 'vilda-patient-tab',
      type: 'button',
      html: _tabHtml(_ICO_NOTES, 'Notatki'),
      'data-tab': 'notes'
    });
    // P5 — tab „Historia" zastępuje dawny tab „Edycja". Edycja jest dostępna
    // przez pill „✏ Edytuj" w hero (osobny ekran showPatientEditScreen).
    var tabTimeline = el('button', {
      class: 'vilda-patient-tab',
      type: 'button',
      html: _tabHtml(_ICO_HIST, 'Historia'),
      'data-tab': 'timeline'
    });
    var tabBar = el('div', { class: 'vilda-patient-tabs', role: 'tablist' }, [tabAntro, tabTraj, tabNotes, tabTimeline]);

    // ── ZAKŁADKA „Status" — pogrupowane statystyki ──
    var antroContent = el('div', { class: 'vilda-patient-tab-content', 'data-tab': 'antro' });

    // P6.2 — subAlt dla kafelków Pomiar: gdy diff DOB-resolved vs snapshot > 3 mies.,
    // dodajemy linię "przeliczono na dziś · ostatni pomiar: DD-MM-RRRR" pod sub.
    // To uczciwa informacja: kafelek pokazuje centyl liczony na BIEŻĄCY wiek
    // pacjenta (z DOB), ale wartości waga/wzrost pochodzą z poprzedniego pomiaru.
    var recalcSubAlt = null;
    if (recalculatedToday) {
      recalcSubAlt = 'przeliczono na dziś · ostatni pomiar: ' + (lastMeasureDisplay || '?');
    }
    // Grupa: Pomiar (Wzrost / Waga / BMI / Cole)
    var pomiarStats = [];
    if (height != null) {
      var hStatus2 = classify('height', height, heightPerc);
      var hSub2 = heightPerc != null ? fmtCentyl(heightPerc) : null;
      pomiarStats.push(statEl('Wzrost', fmtNum(height) + ' cm', hSub2, hStatus2, recalcSubAlt));
    }
    if (weight != null) {
      var wStatus2 = classify('weight', weight, weightPerc);
      var wSub2 = weightPerc != null ? fmtCentyl(weightPerc) : null;
      pomiarStats.push(statEl('Waga', fmtNum(weight) + ' kg', wSub2, wStatus2, recalcSubAlt));
    }
    if (bmi != null) {
      var bmiStatus2 = classify('bmi', bmi, bmiPerc);
      var bmiSub2 = bmiPerc != null ? fmtCentyl(bmiPerc) : null;
      pomiarStats.push(statEl('BMI', fmtNum(bmi), bmiSub2, bmiStatus2, recalcSubAlt));
    }
    if (cole != null) {
      var coleStatus2 = classify('cole', cole, null);
      pomiarStats.push(statEl("Wskaźnik Cole'a", fmtNum(cole) + '%', null, coleStatus2, recalcSubAlt));
    }
    if (pomiarStats.length > 0) {
      antroContent.appendChild(el('p', { class: 'vilda-patient-section-h', text: 'Pomiar' }));
      antroContent.appendChild(el('div', { class: 'vilda-patient-stats-grid' }, pomiarStats));
    }

    // Grupa: Wzrastanie i genetyka rodzinna (Prędkość / MPH / Siatki)
    var growthStats = [];
    if (growthVelocity != null) {
      var velWarn = isLosingGrowth ? '⚠ zahamowanie wzrostu'
        : isSlowVelocity          ? '⚠ wolna prędkość'      : null;
      var velStatus = (isLosingGrowth || isSlowVelocity) ? 'improve' : null;
      growthStats.push(statEl('Prędkość wzrastania', fmtNum(growthVelocity) + ' cm/rok', velWarn, velStatus));
    }
    if (mph != null) {
      var mphSub2 = mphPerc != null ? fmtCentyl(mphPerc) : null;
      growthStats.push(statEl('MPH', fmtNum(mph) + ' cm', mphSub2, null));
    }
    if (dataSourceLabel) growthStats.push(statEl('Siatki centylowe', dataSourceLabel, null, null));
    if (growthStats.length > 0) {
      antroContent.appendChild(el('p', { class: 'vilda-patient-section-h vilda-patient-section-h--secondary', text: 'Wzrastanie i genetyka rodzinna' }));
      antroContent.appendChild(el('div', { class: 'vilda-patient-stats-grid' }, growthStats));
    }

    if (pomiarStats.length === 0 && growthStats.length === 0) {
      antroContent.appendChild(el('p', { class: 'vilda-patient-empty-msg', text: 'Brak danych do wyświetlenia.' }));
    }

    // ── ZAKŁADKA „Siatki centylowe" — wzrost/waga/BMI ──
    var trajContent = el('div', { class: 'vilda-patient-tab-content vilda-patient-tab-content--hidden', 'data-tab': 'traj' });

    // Helper — buduje sekcję wykresu (heading + chart wrap + legenda); zwraca count
    function appendChartSection(label, chartElem, isFirst) {
      if (!chartElem) return false;
      var hClass = 'vilda-patient-section-h' + (isFirst ? '' : ' vilda-patient-section-h--secondary');
      trajContent.appendChild(el('p', { class: hClass, text: label }));
      trajContent.appendChild(el('div', { class: 'vilda-patient-chart-wrap' }, [chartElem]));
      return true;
    }

    var chartsBuilt = 0;
    if (!isAdult && measurements.length > 0) {
      var srcSuffix = dataSourceLabel ? ' · ' + dataSourceLabel : '';

      // 1) Wzrost (OLAF/WHO Hybrid)
      try {
        var heightChart = buildPercentileChart('height', measurements, sexForCalc, totalAgeMonths, height);
        if (appendChartSection('Siatka centylowa wzrostu' + srcSuffix, heightChart, chartsBuilt === 0)) chartsBuilt++;
      } catch (e) { logError('buildPercentileChart(height)', e); }

      // 2) Waga (OLAF/WHO Hybrid)
      try {
        var weightChart = buildPercentileChart('weight', measurements, sexForCalc, totalAgeMonths, weight);
        if (appendChartSection('Siatka centylowa wagi' + srcSuffix, weightChart, chartsBuilt === 0)) chartsBuilt++;
      } catch (e) { logError('buildPercentileChart(weight)', e); }

      // 3) BMI (OLAF lub WHO 5-19)
      try {
        var bmiChart = buildPercentileChart('bmi', measurements, sexForCalc, totalAgeMonths, bmi);
        if (appendChartSection('Siatka centylowa BMI' + srcSuffix, bmiChart, chartsBuilt === 0)) chartsBuilt++;
      } catch (e) { logError('buildPercentileChart(bmi)', e); }
    }

    // Legenda — wspólna dla wszystkich wykresów
    if (chartsBuilt > 0) {
      trajContent.appendChild(
        el('div', { class: 'vilda-patient-chart-legend' }, [
          el('span', { class: 'vilda-patient-legend-item' }, [
            el('span', { class: 'vilda-patient-legend-line', style: 'background:#0F6E56;' }),
            el('span', { text: ' percentyle 3/10/50/90/97' })
          ]),
          el('span', { class: 'vilda-patient-legend-item' }, [
            el('span', { class: 'vilda-patient-legend-dot', style: 'background:#b71c1c;' }),
            el('span', { text: ' pomiary pacjenta' })
          ])
        ])
      );
      trajContent.appendChild(
        el('p', { class: 'vilda-patient-chart-disclaimer', text: 'Podgląd — siatki uproszczone (5 linii percentylowych), służą do oceny trajektorii. Pełne siatki dostępne w głównym module wzrastania.' })
      );
    }

    // Fallback gdy nic się nie zbudowało
    if (chartsBuilt === 0) {
      trajContent.appendChild(el('p', { class: 'vilda-patient-empty-msg', text: isAdult
        ? 'Siatki centylowe dostępne tylko dla dzieci i młodzieży (< 18 lat).'
        : 'Brak wystarczających danych do wyświetlenia trajektorii. Wprowadź wzrost, wagę i wiek pacjenta.'
      }));
    }

    // ── ZAKŁADKA „Notatki" (P4) — kliniczne notatki przypisane do pacjenta ──
    // 4 kategorie: followup (z dueDateISO), observation, treatment, wynik-badania.
    // Sortowanie: notatki z dueDateISO rosnąco po dueDate (overdue na górze),
    // potem reszta malejąco po updatedAtISO. Akcje: Dodaj, Edytuj, Usuń.
    // Render odbywa się dopiero przy pierwszym klik tabu („notes") — lazy mount.
    // P4-fix: usunięto rekurencyjny anonymous handler (strict mode), używamy named function reRenderNotes.
    var notesContent = el('div', { class: 'vilda-patient-tab-content vilda-patient-tab-content--hidden vilda-patient-notes-section', 'data-tab': 'notes' });
    var _notesRendered = false;
    function reRenderNotes() {
      try {
        renderPatientNotesSection(notesContent, patientId, reRenderNotes);
      } catch (e) {
        logError('renderPatientNotesSection', e);
      }
      // B3-fix post-deploy: zapis/usunięcie notatki ZMIENIA też dane Historii
      // (mixed timeline z B3.2, kotwiczone notatki z B2). Bez invalidate'owania
      // _timelineRendered, Historia tab pokazywała stare dane do refresh strony.
      // Fix: jeśli Historia była renderowana → re-render od razu gdy aktywny tab,
      // inaczej reset flag żeby następna wizyta wymusiła fresh fetch.
      if (_timelineRendered) {
        var isTimelineActive = false;
        try { isTimelineActive = tabTimeline.classList.contains('vilda-patient-tab--active'); } catch (_) {}
        if (isTimelineActive) {
          reRenderTimeline();
        } else {
          _timelineRendered = false;
        }
      }
    }

    // ── ZAKŁADKA „Historia" (P5) — chronologiczny timeline wszystkich wydarzeń ──
    // Zastąpiła dawną zakładkę „Edycja". Edycja danych pacjenta jest dostępna
    // przez pill „✏ Edytuj" w hero (otwiera osobny ekran showPatientEditScreen).
    // Timeline pokazuje pomiary + notatki + obserwacje + future-proof slots
    // (wyniki badań, leki, terapie GH).
    var timelineContent = el('div', { class: 'vilda-patient-tab-content vilda-patient-tab-content--hidden vilda-patient-timeline-section', 'data-tab': 'timeline' });
    var _timelineRendered = false;
    function reRenderTimeline() {
      try {
        renderTimelineSection(timelineContent, patientId, reRenderTimeline, onPick, listOptions);
      } catch (e) {
        logError('renderTimelineSection', e);
      }
    }

    // ── Przełączanie zakładek ──
    function switchTab(tabId) {
      [tabAntro, tabTraj, tabNotes, tabTimeline].forEach(function (t) {
        if (t.getAttribute('data-tab') === tabId) t.classList.add('vilda-patient-tab--active');
        else t.classList.remove('vilda-patient-tab--active');
      });
      [antroContent, trajContent, notesContent, timelineContent].forEach(function (c) {
        if (c.getAttribute('data-tab') === tabId) c.classList.remove('vilda-patient-tab-content--hidden');
        else c.classList.add('vilda-patient-tab-content--hidden');
      });
    }
    tabAntro.addEventListener('click', function () { switchTab('antro'); });
    tabTraj.addEventListener('click', function () { switchTab('traj'); });
    tabNotes.addEventListener('click', function () {
      switchTab('notes');
      // Lazy mount — render dopiero przy pierwszym wejściu w tab. To eliminuje
      // race condition gdy V.listPatientNotesForPatient nie jest jeszcze dostępne
      // (np. mid-unlock w cloud-only) i daje czystszy lifecycle event listenerów.
      if (!_notesRendered) {
        _notesRendered = true;
        reRenderNotes();
      }
    });
    tabTimeline.addEventListener('click', function () {
      switchTab('timeline');
      // P5: lazy mount timeline — render dopiero przy pierwszym wejściu.
      if (!_timelineRendered) {
        _timelineRendered = true;
        reRenderTimeline();
      }
    });

    // G2: zachowanie kontekstu po sub-akcjach (Edytuj pomiar, Dodaj notatkę,
    // Usuń pomiar z chipa w Historii). Sub-akcje re-renderują kartę przez
    // showPatientCard(patientId, …, …, { activeTab: 'timeline' }), żeby nie
    // wyrzucić użytkownika z Historii do Statusu. Lazy-mount musi być
    // wymuszony zanim switchTab pokaże content (Notatki/Timeline renderują
    // się leniwie). Walidacja whitelisty chroni przed brzydkimi inputami.
    if (opts && opts.activeTab) {
      if (opts.activeTab === 'notes' && !_notesRendered) {
        _notesRendered = true;
        try { reRenderNotes(); } catch (e) { logError('showPatientCard restore notes', e); }
      }
      if (opts.activeTab === 'timeline' && !_timelineRendered) {
        _timelineRendered = true;
        try { reRenderTimeline(); } catch (e) { logError('showPatientCard restore timeline', e); }
      }
      if (opts.activeTab === 'antro' || opts.activeTab === 'traj' ||
          opts.activeTab === 'notes' || opts.activeTab === 'timeline') {
        try { switchTab(opts.activeTab); } catch (e) { logError('showPatientCard restore switchTab', e); }
      }
    }

    // ── Akcje ──
    var backBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost', type: 'button',
      text: '← Wróć do listy',
      onclick: function () { showPatientsList(onPick, listOptions); }
    });

    var loadBtn = null;
    if (typeof onPick === 'function') {
      loadBtn = el('button', {
        class: 'vilda-auth-btn vilda-auth-btn-primary', type: 'button',
        text: 'Wczytaj tego pacjenta',
        onclick: function () {
          var patient = global.VildaSession && typeof global.VildaSession.getPatient === 'function'
            ? global.VildaSession.getPatient() : null;
          if (patient && patient.source === 'form') {
            var msg = 'Zastąpisz dane pacjenta „' + patient.name + '”. Kontynuować?';
            if (!global.confirm(msg)) return;
          }
          // Drugi argument: patientId — używany przez handler chrome do trybu
          // load+nav (gdy bieżąca podstrona nie ma applyLoadedData, zapisujemy
          // ID i nawigujemy do index.html, gdzie receiver w chrome.js wczytuje
          // pacjenta z vault'a). Stare wywołania ignorujące 2. arg działają dalej.
          onPick(payload, patientId);
          // ── Faza 4: dispatch event dla wskaźnika statusu zapisu ──
          // VildaSaveStatusIndicator nasłuchuje tego eventu, żeby od razu wejść
          // w stan SAVED z prawidłowym fingerprintem (zamiast czekać na pierwszą
          // zmianę formularza i błędnie zaczynać od NEW_PATIENT lub DIRTY).
          try {
            if (typeof global.CustomEvent === 'function' && global.document) {
              global.document.dispatchEvent(new global.CustomEvent('vilda:patient-loaded', {
                detail: {
                  patientId: patientId,
                  savedAtISO: (snap && snap.savedAtISO) || null,
                  snapshotCount: (patientFull && patientFull.snapshotCount) || allSnapshots.length || null,
                  name: (payload && payload.name) || null
                }
              }));
            }
          } catch (_) { /* fail-silent — nie blokuj wczytania pacjenta */ }
          hide();
        }
      });
    }

    // ── Złożenie ekranu ──
    var screenChildren = [
      el('h2', { class: 'vilda-auth-title', text: 'Karta pacjenta' }),
      heroDiv,
      tabBar,
      antroContent,
      trajContent,
      notesContent,
      timelineContent,
      el('div', { class: 'vilda-auth-actions vilda-patient-actions' },
        loadBtn ? [backBtn, loadBtn] : [backBtn]
      )
    ];

    // ── Faza 42f — przywrócenie oryginalnego bmiSource przed pokazaniem karty ──
    // Wykres jest już zbudowany w pamięci (SVG nie odczytuje bmiSource przy
    // wyświetlaniu), więc restore jest bezpieczny i nie zaburza wyglądu karty.
    if (_bmiSourceOverridden) {
      try { global.bmiSource = _origBmiSource; } catch (_) {}
    }

    open(el('div', { class: 'vilda-auth-screen vilda-auth-patient-card' }, screenChildren), { noLogo: true });
  }

  // ============ P5 — EKRAN EDYCJI PACJENTA (osobny ekran) ============
  /**
   * Wydzielony z tab "Edycja" w showPatientCard. Otwierany pillem "✏ Edytuj"
   * w hero karty pacjenta. Zawiera formularz danych pacjenta + akcje
   * Przywróć/Zapisz/Usuń. Po zapisie wraca do showPatientCard.
   */
  async function showPatientEditScreen(patientId, onPick, listOptions) {
    var V = getVault();
    if (!V || !V.isUnlocked()) return;

    open(el('div', { class: 'vilda-auth-screen vilda-auth-patient-card' }, [
      el('h2', { class: 'vilda-auth-title', text: 'Edycja pacjenta' }),
      el('p', { class: 'vilda-auth-subtitle', text: 'Wczytywanie danych…' })
    ]), { noLogo: true });
    setBusy(true);

    var patientFull = null;
    try { patientFull = await V.getPatient(patientId); }
    catch (e) { logError('showPatientEditScreen getPatient', e); }
    setBusy(false);

    if (!patientFull || !patientFull.snapshots.length) {
      open(el('div', { class: 'vilda-auth-screen' }, [
        el('h2', { class: 'vilda-auth-title', text: 'Edycja pacjenta' }),
        el('p', { class: 'vilda-auth-subtitle', text: 'Brak danych do edycji.' }),
        el('div', { class: 'vilda-auth-actions' }, [
          el('button', {
            class: 'vilda-auth-btn vilda-auth-btn-ghost', type: 'button',
            text: '← Wróć',
            onclick: function () { showPatientCard(patientId, onPick, listOptions); }
          })
        ])
      ]), { noLogo: true });
      return;
    }

    var snap = patientFull.snapshots[0];
    var payload = snap.payload || {};
    var name = payload.name || '(bez imienia)';
    var u = payload.user || {};
    var age = u.age, ageMonths = u.ageMonths, sex = u.sex;
    var height = u.height, weight = u.weight;
    // P6.1 — DOB jako opcjonalne pole. Storage zostaje ISO (YYYY-MM-DD),
    // display jest PL (DD-MM-RRRR). Helpery V.formatDobForDisplay /
    // V.parseDobFromDisplay robią konwersję.
    var dobISO = (u.dobISO && typeof V.sanitizeDobISO === 'function') ? V.sanitizeDobISO(u.dobISO) : null;
    var _adv = payload.advanced || {};

    function _editInput(val, attrs) {
      var input = el('input', Object.assign({ class: 'vilda-auth-input', type: 'text', autocomplete: 'off', spellcheck: 'false' }, attrs || {}));
      input.value = (val == null ? '' : String(val));
      return input;
    }
    function _editField(labelText, control) {
      return el('div', { style: 'display:block;' }, [
        el('label', { class: 'vilda-patient-stat-label', style: 'display:block; margin-bottom:4px;', text: labelText }),
        control
      ]);
    }
    function _normSex(s) {
      var v = (s == null ? '' : String(s)).trim().toLowerCase();
      if (v === 'm' || v.indexOf('chło') === 0 || v === 'male' || v === 'boy') return 'M';
      if (v === 'k' || v.indexOf('dziew') === 0 || v === 'female' || v === 'girl' || v === 'f') return 'K';
      return '';
    }

    var efName  = _editInput(name === '(bez imienia)' ? '' : name, { placeholder: 'Imię i nazwisko', maxlength: '120' });
    // P6.1 — Data urodzenia (DOB) — opcjonalna, polski format display.
    // Type=text z maską numeryczną, max długość 10 znaków (DD-MM-RRRR).
    var dobDisplay = (typeof V.formatDobForDisplay === 'function') ? V.formatDobForDisplay(dobISO) : '';
    var efDob = _editInput(dobDisplay, {
      inputmode: 'numeric',
      placeholder: 'DD-MM-RRRR (opcjonalnie)',
      maxlength: '10',
      autocomplete: 'bday'
    });
    // P6.1b — komunikat błędu DOB: zwykły czerwony tekst (NIE kafelek „pustego stanu").
    // Pusty (.vilda-dob-err:empty) → display:none, więc nie zajmuje miejsca i nie tworzy
    // przerwy między wierszami formularza.
    var efDobErr = el('div', { class: 'vilda-dob-err' });
    var efAge   = _editInput(age != null ? age : '',             { inputmode: 'numeric', placeholder: 'lata' });
    var efAgeMo = _editInput(ageMonths != null ? ageMonths : '',  { inputmode: 'numeric', placeholder: 'miesiące (0–11)' });
    var efSex   = el('select', { class: 'vilda-auth-input' }, [
      el('option', { value: '',  text: '— wybierz —' }),
      el('option', { value: 'M', text: 'chłopiec' }),
      el('option', { value: 'K', text: 'dziewczynka' })
    ]);
    efSex.value = _normSex(sex);
    var efHeight = _editInput(height != null ? height : '', { inputmode: 'decimal', placeholder: 'cm' });
    var efWeight = _editInput(weight != null ? weight : '', { inputmode: 'decimal', placeholder: 'kg' });
    var efMother = _editInput(_adv.motherHeight != null ? _adv.motherHeight : '', { inputmode: 'decimal', placeholder: 'cm' });
    var efFather = _editInput(_adv.fatherHeight != null ? _adv.fatherHeight : '', { inputmode: 'decimal', placeholder: 'cm' });

    // P7 — Dane okołoporodowe (stałe). Jedno źródło prawdy: payload.perinatal.
    // Nazwy pól zgodne z epikryzą (sa.birth): gestationalWeeks/gestationalDays,
    // birthWeightG, birthLengthCm, birthHeadCircCm, gravidity, parity. Z tego bloku
    // prefillowany jest moduł SGA (docpro) i wywiad okołoporodowy w epikryzie.
    var _peri = (payload.perinatal && typeof payload.perinatal === 'object') ? payload.perinatal : {};
    var efGaW  = _editInput(_peri.gestationalWeeks != null ? _peri.gestationalWeeks : '', { inputmode: 'numeric', placeholder: 'tyg. (22–43)' });
    var efGaD  = _editInput(_peri.gestationalDays  != null ? _peri.gestationalDays  : '', { inputmode: 'numeric', placeholder: 'dni (0–6)' });
    var efBW   = _editInput(_peri.birthWeightG     != null ? _peri.birthWeightG     : '', { inputmode: 'numeric', placeholder: 'g' });
    var efBL   = _editInput(_peri.birthLengthCm    != null ? _peri.birthLengthCm    : '', { inputmode: 'decimal', placeholder: 'cm' });
    var efBHC  = _editInput(_peri.birthHeadCircCm  != null ? _peri.birthHeadCircCm  : '', { inputmode: 'decimal', placeholder: 'cm' });
    var efGrav = _editInput(_peri.gravidity        != null ? _peri.gravidity        : '', { inputmode: 'numeric', placeholder: 'nr' });
    var efPar  = _editInput(_peri.parity           != null ? _peri.parity           : '', { inputmode: 'numeric', placeholder: 'nr' });
    var editErr  = el('div', { class: 'vilda-auth-error' });

    function _setNumField(obj, key, raw) {
      var s = (raw == null ? '' : String(raw)).trim().replace(',', '.');
      if (s === '') { obj[key] = ''; return; }
      var n = parseFloat(s);
      obj[key] = isFinite(n) ? n : s;
    }

    // P6.1 — Helper reaktywności DOB.
    // Czyta pole efDob (format PL), próbuje sparsować. Jeśli puste → pola Wiek
    // wracają jako edytowalne (legacy, lekarz wpisuje wiek ręcznie). Jeśli
    // wypełnione i poprawne → liczy wiek z DOB i wpisuje do efAge/efAgeMo,
    // które stają się read-only. Jeśli wypełnione ale nieprawidłowe → pokazuje
    // błąd, pola Wiek pozostają edytowalne (lekarz nadal może zapisać legacy).
    function _updateAgeFieldsFromDob() {
      var raw = (efDob.value || '').trim();
      if (raw === '') {
        efAge.readOnly = false;
        efAgeMo.readOnly = false;
        efDobErr.textContent = '';
        return;
      }
      var iso = (typeof V.parseDobFromDisplay === 'function') ? V.parseDobFromDisplay(raw) : null;
      if (!iso) {
        efDobErr.textContent = 'Nieprawidłowa data. Format: DD-MM-RRRR (np. 12-01-2018).';
        // Pola Wiek zostają edytowalne — lekarz nadal może zapisać legacy.
        efAge.readOnly = false;
        efAgeMo.readOnly = false;
        return;
      }
      var resolved = V.calcAgeFromDOB(iso);
      if (!resolved) {
        efDobErr.textContent = 'Data nie pozwala obliczyć wieku.';
        efAge.readOnly = false;
        efAgeMo.readOnly = false;
        return;
      }
      efDobErr.textContent = '';
      efAge.value = String(resolved.years);
      efAgeMo.value = String(resolved.ageMonths);
      efAge.readOnly = true;
      efAgeMo.readOnly = true;
    }

    function _resetEditForm() {
      efName.value = name === '(bez imienia)' ? '' : name;
      efSex.value = _normSex(sex);
      efDob.value = dobDisplay;
      efAge.value = age != null ? age : '';
      efAgeMo.value = ageMonths != null ? ageMonths : '';
      efHeight.value = height != null ? height : '';
      efWeight.value = weight != null ? weight : '';
      efMother.value = _adv.motherHeight != null ? _adv.motherHeight : '';
      efFather.value = _adv.fatherHeight != null ? _adv.fatherHeight : '';
      editErr.textContent = '';
      efDobErr.textContent = '';
      // Po reset — przelicz stan read-only pól Wiek (DOB może być puste/wypełnione).
      _updateAgeFieldsFromDob();
    }
    async function _saveEdits() {
      var newName = (efName.value || '').trim();
      if (!newName) { editErr.textContent = 'Imię i nazwisko jest wymagane.'; try { efName.focus(); } catch (_) {} return; }
      // P6.1 — DOB ma priorytet nad wpisanym wiekiem. Wprowadzona wartość musi być
      // poprawna ALBO pusta. Jeśli lekarz wpisał coś nieprawidłowego, nie pozwalamy
      // zapisać (lepiej kazać poprawić niż zapisać śmieci jako wiek manual).
      var rawDob = (efDob.value || '').trim();
      var parsedDobISO = null;
      if (rawDob !== '') {
        parsedDobISO = (typeof V.parseDobFromDisplay === 'function') ? V.parseDobFromDisplay(rawDob) : null;
        if (!parsedDobISO) {
          editErr.textContent = 'Nieprawidłowa data urodzenia. Użyj formatu DD-MM-RRRR (np. 12-01-2018) lub zostaw puste.';
          try { efDob.focus(); } catch (_) {}
          return;
        }
      }
      var edited;
      try { edited = JSON.parse(JSON.stringify(payload)); }
      catch (e) { editErr.textContent = 'Nie udało się przygotować danych do zapisu.'; return; }
      edited.name = newName;
      edited.user = edited.user || {};
      // P6.1 — DOB do payloadu (sanityzowane, lub usunięte jeśli puste).
      // savePatient i tak ponownie sanityzuje (defensive), ale ustawiamy tu
      // już czystą wartość, by aplikacja widziała ten sam stan co serializacja.
      if (parsedDobISO) {
        edited.user.dobISO = parsedDobISO;
      } else if ('dobISO' in edited.user) {
        delete edited.user.dobISO;
      }
      // P6.1 — Wiek: zawsze zapisujemy. Gdy DOB jest, używamy wartości
      // wyliczonej (efAge/efAgeMo zostały już zaktualizowane przez listener);
      // gdy DOB nie ma, używamy wartości wpisanej ręcznie. Konwencja:
      // user.age = pełne lata, user.ageMonths = dodatkowe miesiące (0-11).
      _setNumField(edited.user, 'age', efAge.value);
      _setNumField(edited.user, 'ageMonths', efAgeMo.value);
      edited.user.sex = efSex.value || '';
      _setNumField(edited.user, 'height', efHeight.value);
      _setNumField(edited.user, 'weight', efWeight.value);
      edited.advanced = edited.advanced || {};
      _setNumField(edited.advanced, 'motherHeight', efMother.value);
      _setNumField(edited.advanced, 'fatherHeight', efFather.value);

      // P7 — Dane okołoporodowe → payload.perinatal (jedno źródło prawdy).
      // Tylko pola wypełnione; puste pomijamy (opcjonalność, zgodność wstecz).
      (function () {
        var peri = {};
        function setNum(key, raw) {
          var s = (raw == null ? '' : String(raw)).trim().replace(',', '.');
          if (s === '') return;
          var n = parseFloat(s);
          if (isFinite(n)) peri[key] = n;
        }
        setNum('gestationalWeeks', efGaW.value);
        setNum('gestationalDays', efGaD.value);
        setNum('birthWeightG', efBW.value);
        setNum('birthLengthCm', efBL.value);
        setNum('birthHeadCircCm', efBHC.value);
        setNum('gravidity', efGrav.value);
        setNum('parity', efPar.value);
        // Zachowaj cache wyliczeń SDS z poprzedniego zapisu (uzupełniany przez SGA).
        if (_peri.birthWeightSds != null) peri.birthWeightSds = _peri.birthWeightSds;
        if (_peri.birthLengthSds != null) peri.birthLengthSds = _peri.birthLengthSds;
        if (_peri.sdsSourceLabel) peri.sdsSourceLabel = _peri.sdsSourceLabel;
        if (_peri.catchUp) peri.catchUp = _peri.catchUp;
        if (Object.keys(peri).length) edited.perinatal = peri;
        else if ('perinatal' in edited) delete edited.perinatal;
      })();
      try {
        setBusy(true);
        await V.savePatient(edited, { patientId: patientId, dedup: false });
        setBusy(false);
        showPatientCard(patientId, onPick, listOptions);
      } catch (e) {
        setBusy(false);
        editErr.textContent = 'Nie udało się zapisać zmian.';
        logError('showPatientEditScreen saveEdits', e);
      }
    }
    async function _deletePatient() {
      var label = (name && name !== '(bez imienia)') ? name : 'tego pacjenta';
      // B1.10: „historią wizyt" → „historią pomiarów i notatek" (precyzyjniej).
      if (!global.confirm('Usunąć pacjenta „' + label + '” wraz z całą historią pomiarów i notatek? Tej operacji nie można cofnąć.')) return;
      try {
        setBusy(true);
        await V.removePatient(patientId);
        setBusy(false);
        showPatientsList(onPick, listOptions);
      } catch (e) {
        setBusy(false);
        editErr.textContent = 'Nie udało się usunąć pacjenta.';
        logError('showPatientEditScreen deletePatient', e);
      }
    }

    var backBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost', type: 'button',
      text: '← Wróć do karty pacjenta',
      onclick: function () { showPatientCard(patientId, onPick, listOptions); }
    });

    // P6.1 — Pole DOB jako osobna komórka grida (przed polami Wiek), z disclaimerem
    // i komunikatem walidacyjnym pod spodem. Komórka zajmuje wiele kolumn (zachowanie
    // gridu domyślnie + wpięcie diva z input + hint + error w jednym slocie).
    // P6.1c — Cała podpowiedź schowana pod ikoną „i" obok etykiety. Popover jest
    // pozycjonowany ABSOLUTNIE (pływa NAD treścią, nie zajmuje miejsca w layoucie),
    // więc komórka DOB ma tę samą wysokość co sąsiednie i nie ma przerwy między
    // wierszami (Wiek/Wzrost/Masa siadają tuż pod spodem). Dymek: hover (desktop)
    // + klik/tap (mobile), zamykany kliknięciem poza nim.
    var ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    var dobInfoBtn = el('button', {
      type: 'button', class: 'vilda-dob-info-btn',
      'aria-label': 'Informacja o polu data urodzenia',
      'aria-expanded': 'false',
      html: ICON_INFO
    });
    var dobPop = el('div', {
      class: 'vilda-dob-pop', role: 'tooltip',
      text: 'Opcjonalnie. Wypełnij, by aplikacja automatycznie liczyła wiek przy kolejnych pomiarach.'
    });
    dobPop.style.display = 'none';
    var dobField = el('div', { class: 'vilda-dob-field' }, [efDob, dobPop, efDobErr]);
    var efDobCell = el('div', { style: 'display:block;' }, [
      el('div', { class: 'vilda-dob-label-row' }, [
        el('label', { class: 'vilda-patient-stat-label', text: 'Data urodzenia' }),
        dobInfoBtn
      ]),
      dobField
    ]);
    (function () {
      function show() { dobPop.style.display = 'block'; dobInfoBtn.setAttribute('aria-expanded', 'true'); }
      function hide() { dobPop.style.display = 'none'; dobInfoBtn.setAttribute('aria-expanded', 'false'); }
      dobInfoBtn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (dobPop.style.display === 'none') show(); else hide();
      });
      dobInfoBtn.addEventListener('mouseenter', show);
      efDobCell.addEventListener('mouseleave', hide);
      // Klik poza komórką zamyka dymek (dotyk). Listener czyszczony nie jest —
      // ekran edycji jest krótkotrwały i przerenderowywany przy każdym wejściu.
      global.document.addEventListener('click', function (e) {
        if (!efDobCell.contains(e.target)) hide();
      });
    })();

    // P6.1 — Listener na pole DOB: po każdej zmianie przelicz wiek (lub zwolnij pola).
    efDob.addEventListener('input', _updateAgeFieldsFromDob);
    efDob.addEventListener('blur', _updateAgeFieldsFromDob);
    // Initial state — jeśli pacjent ma już DOB, ustaw pola Wiek od razu w tryb read-only.
    _updateAgeFieldsFromDob();

    var screen = el('div', { class: 'vilda-auth-screen vilda-auth-patient-card' }, [
      el('h2', { class: 'vilda-auth-title', text: 'Edycja pacjenta' }),
      el('p', { class: 'vilda-patient-section-h', text: 'Dane pacjenta' }),
      el('div', { class: 'vilda-patient-stats-grid' }, [
        _editField('Imię i nazwisko', efName),
        _editField('Płeć', efSex),
        efDobCell
      ]),
      el('p', { class: 'vilda-patient-section-h vilda-patient-section-h--secondary', text: 'Dane okołoporodowe' }),
      el('div', { class: 'vilda-patient-stats-grid' }, [
        _editField('Wiek ciążowy (tyg.)', efGaW),
        _editField('Wiek ciążowy (dni)', efGaD),
        _editField('Masa urodzeniowa (g)', efBW),
        _editField('Długość urodzeniowa (cm)', efBL),
        _editField('Obwód głowy (cm)', efBHC),
        _editField('Która ciąża', efGrav),
        _editField('Który poród', efPar)
      ]),
      el('p', { class: 'vilda-patient-section-h vilda-patient-section-h--secondary', text: 'Wzrost rodziców (do MPH)' }),
      el('div', { class: 'vilda-patient-stats-grid' }, [
        _editField('Wzrost matki (cm)', efMother),
        _editField('Wzrost ojca (cm)', efFather)
      ]),
      el('p', { class: 'vilda-patient-empty-msg', style: 'margin-top:6px;', text: 'Dane stałe pacjenta. Pomiary (wzrost, masa, wiek) dodajesz przez „Nowy pomiar"; korekta ostatniego — w zakładce Historia. Dane okołoporodowe zasilają moduł SGA i epikryzę.' }),
      editErr,
      el('div', { class: 'vilda-auth-actions' }, [
        el('button', { class: 'vilda-auth-btn vilda-auth-btn-ghost', type: 'button', text: 'Przywróć', onclick: _resetEditForm }),
        el('button', { class: 'vilda-auth-btn vilda-auth-btn-primary', type: 'button', text: 'Zapisz zmiany', onclick: _saveEdits })
      ]),
      el('div', { class: 'vilda-patient-delete-row' }, [
        el('button', { class: 'vilda-auth-btn vilda-patient-delete-btn', type: 'button', text: 'Usuń pacjenta', onclick: _deletePatient })
      ]),
      el('div', { class: 'vilda-auth-actions vilda-patient-actions' }, [backBtn])
    ]);

    open(screen, { noLogo: true });
  }

  // ============ P6.3 — MODAL „+ NOWY POMIAR" (wariant A, mode='new') ============
  /**
   * Modal do szybkiego dodania nowego pomiaru pacjenta (waga + wzrost + opcjonalnie
   * data pomiaru wstecznie). Klonuje pełny payload poprzedniego snapshota, nadpisuje
   * pola pomiaru, wywołuje _ensureCurrentMeasurementInHistory (FIX A/B/C) by
   * dorzucić wpis do measurements[], i zapisuje przez V.savePatient (nowy snapshot).
   *
   * Wariant A (modal overlay) — wybrany po B1, bo zakładka Historia w karcie
   * pacjenta już daje pełny kontekst trajektorii (nie potrzebujemy in-line history
   * w modalu jak w mockupie wariantu B).
   *
   * Mode 'new' (P6.3): klonuje najnowszy snapshot, tworzy nowy.
   * Mode 'edit' (P6.6): TODO — będzie edycja konkretnego snapshota in-place.
   *
   * opts:
   *   - mode: 'new' (default) | 'edit' (P6.6)
   *   - onSaved: function() — wywołane po zapisie (rerender karty pacjenta)
   *   - onCancel: function() — wywołane przy Anuluj (opcjonalne)
   */
  async function showQuickMeasureModal(patientId, opts) {
    opts = opts || {};
    // P6.6b — Tryby modala:
    //   • 'new' (default) — tworzy nowy snapshot przez V.savePatient
    //   • 'edit' — koryguje istniejący snapshot in-place przez V.updateSnapshotPayload.
    //     Wymaga opts.snapshotId.
    var mode = (opts.mode === 'edit') ? 'edit' : 'new';
    var editSnapshotId = (mode === 'edit' && typeof opts.snapshotId === 'string') ? opts.snapshotId : null;

    var V = getVault();
    if (!V || !V.isUnlocked()) {
      try { global.alert('Modal nowego pomiaru wymaga zalogowanego konta lekarza.'); } catch (_) {}
      return;
    }
    if (typeof V.savePatient !== 'function') {
      try { global.alert('Funkcja savePatient niedostępna — odśwież stronę (Ctrl+Shift+R).'); } catch (_) {}
      return;
    }
    if (mode === 'edit' && typeof V.updateSnapshotPayload !== 'function') {
      try { global.alert('Funkcja edit-in-place niedostępna — odśwież stronę (Ctrl+Shift+R).'); } catch (_) {}
      return;
    }
    if (mode === 'edit' && !editSnapshotId) {
      try { global.alert('Brak snapshotId — nie można edytować.'); } catch (_) {}
      return;
    }

    // Wczytaj pacjenta — najnowszy snapshot jako baseline (mode='new')
    // albo konkretny snapshot po snapshotId (mode='edit').
    var patientFull = null;
    try { patientFull = await V.getPatient(patientId); }
    catch (e) { logError('showQuickMeasureModal getPatient', e); return; }
    if (!patientFull || !patientFull.snapshots || !patientFull.snapshots.length) {
      try { global.alert('Brak danych pacjenta — nie można dodać pomiaru.'); } catch (_) {}
      return;
    }

    var snap;
    if (mode === 'edit') {
      snap = patientFull.snapshots.find(function (s) { return s.snapshotId === editSnapshotId; });
      if (!snap) {
        try { global.alert('Nie znaleziono pomiaru do edycji (snapshotId: ' + editSnapshotId + ').'); } catch (_) {}
        return;
      }
    } else {
      snap = patientFull.snapshots[0]; // najnowszy (sortowane malejąco po savedAtISO)
    }
    var prevPayload = snap.payload || {};
    var prevUser = prevPayload.user || {};
    var dobISO = (prevUser.dobISO && typeof V.sanitizeDobISO === 'function')
      ? V.sanitizeDobISO(prevUser.dobISO) : null;
    var prevHeight = (typeof prevUser.height === 'number' && isFinite(prevUser.height)) ? prevUser.height : null;
    var prevWeight = (typeof prevUser.weight === 'number' && isFinite(prevUser.weight)) ? prevUser.weight : null;
    var prevAgeYears = (typeof prevUser.age === 'number' && isFinite(prevUser.age)) ? prevUser.age : null;
    var prevAgeMonths = (typeof prevUser.ageMonths === 'number' && isFinite(prevUser.ageMonths)) ? prevUser.ageMonths : null;
    var prevSex = prevUser.sex || '';
    var prevName = prevPayload.name || '(bez imienia)';

    // P7-edit: edycja KONKRETNEGO wiersza Historii — prefill z wartości klikniętego
    // punktu (a NIE z user.* = najnowszego pomiaru). opts.rowValues niesie wiek/wzrost/masę wiersza.
    if (mode === 'edit' && opts.rowValues && typeof opts.rowValues === 'object') {
      var _rv = opts.rowValues;
      if (typeof _rv.height === 'number' && isFinite(_rv.height)) prevHeight = _rv.height;
      if (typeof _rv.weight === 'number' && isFinite(_rv.weight)) prevWeight = _rv.weight;
      if (typeof _rv.ageMonths === 'number' && isFinite(_rv.ageMonths)) {
        prevAgeYears = Math.floor(_rv.ageMonths / 12);
        prevAgeMonths = _rv.ageMonths % 12;
      }
    }

    // Defensywnie usuń poprzednie niezamknięte overlaye (multi-click).
    try {
      var existingOverlays = global.document.querySelectorAll('.vilda-quick-measure-overlay');
      for (var i = 0; i < existingOverlays.length; i += 1) existingOverlays[i].remove();
    } catch (_) {}

    var overlay = el('div', {
      class: 'vilda-auth-overlay vilda-auth-overlay-sheet vilda-quick-measure-overlay',
      style: 'position:fixed;inset:0;height:100dvh;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000001;padding:20px;box-sizing:border-box;'
    });

    var sheet = el('div', {
      class: 'vilda-auth-sheet',
      style: 'background:#fff;border-radius:14px;padding:18px 20px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:12px;'
    });

    // Header — różny copy dla 'new' vs 'edit'.
    sheet.appendChild(el('h3', {
      text: (mode === 'edit') ? '✏ Popraw pomiar' : '+ Nowy pomiar',
      style: 'margin:0;font-size:1.05rem;font-weight:600;color:#0f2b33;'
    }));
    sheet.appendChild(el('p', {
      text: (mode === 'edit')
        ? 'Pacjent: ' + prevName + '. Korekta nadpisze istniejący pomiar bez tworzenia drugiego wpisu.'
        : 'Pacjent: ' + prevName + '. Wpisz wagę i wzrost. BMI policzy się automatycznie.',
      style: 'margin:0;font-size:0.82rem;color:#5b6672;line-height:1.4;'
    }));

    // Helper — pojedynczy input w grid'owym labelu.
    function _row(labelText, inputEl, hint) {
      var wrap = el('div', null, [
        el('label', { text: labelText, style: 'display:block;font-size:0.78rem;color:#5b6672;margin-bottom:4px;font-weight:500;' }),
        inputEl
      ]);
      if (hint) {
        wrap.appendChild(el('div', {
          style: 'font-size:0.72rem;color:#9aa8aa;margin-top:3px;line-height:1.4;',
          text: hint
        }));
      }
      return wrap;
    }

    function _input(attrs) {
      return el('input', Object.assign({
        class: 'vilda-auth-input',
        style: 'width:100%;height:38px;padding:0 10px;font-size:0.92rem;border:0.5px solid #d7e9ec;border-radius:8px;background:#fff;color:#0f2b33;',
        autocomplete: 'off'
      }, attrs || {}));
    }

    // Data pomiaru — default dziś (mode='new') albo savedAtISO snapshota (mode='edit').
    var todayISO = new Date().toISOString().substring(0, 10);
    var initialDate = todayISO;
    if (mode === 'edit') {
      var sISO = snap.savedAtISO || '';
      if (sISO && sISO.length >= 10) initialDate = sISO.substring(0, 10);
    }
    var dateInput = _input({ type: 'date', value: initialDate });
    sheet.appendChild(_row('Data pomiaru', dateInput,
      (mode === 'edit')
        ? 'Pomiar został pierwotnie zapisany w tym dniu. Możesz skorygować datę.'
        : 'Domyślnie dzisiaj. Możesz wpisać starszą datę, jeśli dodajesz pomiar wstecznie.'));

    // 2-kolumnowy grid: Wzrost + Waga.
    var hwRow = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;' });
    var heightInput = _input({ type: 'text', inputmode: 'decimal', placeholder: prevHeight != null ? String(prevHeight) : 'cm' });
    var weightInput = _input({ type: 'text', inputmode: 'decimal', placeholder: prevWeight != null ? String(prevWeight) : 'kg' });
    hwRow.appendChild(_row('Wzrost (cm)', heightInput));
    hwRow.appendChild(_row('Waga (kg)', weightInput));
    sheet.appendChild(hwRow);

    // BMI (read-only auto).
    var bmiDisplay = el('div', {
      style: 'background:#f5fafb;border:0.5px solid #d7e9ec;border-radius:8px;padding:8px 10px;font-size:0.92rem;color:#0f2b33;font-weight:500;min-height:38px;display:flex;align-items:center;',
      text: 'BMI: —'
    });
    sheet.appendChild(bmiDisplay);

    // Wiek — z DOB (read-only display) ALBO pola input (gdy brak DOB).
    var ageDisplayBox = null;     // gdy DOB jest
    var ageYearsInput = null;     // gdy brak DOB
    var ageMonthsInput = null;
    var ageSection = el('div');
    if (dobISO) {
      ageDisplayBox = el('div', {
        style: 'background:#f5fafb;border:0.5px solid #d7e9ec;border-radius:8px;padding:8px 10px;font-size:0.92rem;color:#0f2b33;font-weight:500;min-height:38px;display:flex;align-items:center;',
        text: 'Wiek: —'
      });
      ageSection.appendChild(_row('Wiek (auto z daty urodzenia)', ageDisplayBox,
        'Liczony z DOB i daty pomiaru. Aby zmienić — usuń DOB w „Edytuj" karty pacjenta.'));
    } else {
      var ageGrid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px;' });
      ageYearsInput = _input({ type: 'text', inputmode: 'numeric', placeholder: 'lata' });
      ageMonthsInput = _input({ type: 'text', inputmode: 'numeric', placeholder: 'miesiące (0-11)' });
      // Prefill z poprzedniego snapshota — lekarz koryguje jeśli minęło dużo czasu.
      if (prevAgeYears != null) ageYearsInput.value = String(prevAgeYears);
      if (prevAgeMonths != null) ageMonthsInput.value = String(prevAgeMonths);
      ageGrid.appendChild(_row('Wiek (lata)', ageYearsInput));
      ageGrid.appendChild(_row('Wiek (miesiące, 0-11)', ageMonthsInput));
      ageSection.appendChild(ageGrid);
    }
    sheet.appendChild(ageSection);

    // Collapsible „💡 Wpisz datę urodzenia" — tylko gdy DOB jest PUSTE.
    var dobCollapseToggle = null;
    var dobInput = null;
    var dobErrBox = null;
    if (!dobISO) {
      dobCollapseToggle = el('button', {
        type: 'button',
        style: 'background:transparent;border:0;color:#00838d;text-align:left;padding:6px 0;font-size:0.82rem;cursor:pointer;text-decoration:underline;align-self:flex-start;',
        text: '💡 Wpisz datę urodzenia, by w przyszłości nie pytać o wiek'
      });
      sheet.appendChild(dobCollapseToggle);
      var dobCollapseBox = el('div', { style: 'display:none;' });
      dobInput = _input({ type: 'text', inputmode: 'numeric', maxlength: '10', placeholder: 'DD-MM-RRRR', autocomplete: 'bday' });
      dobErrBox = el('div', { style: 'color:#A32D2D;font-size:0.78rem;margin-top:4px;min-height:1em;' });
      dobCollapseBox.appendChild(_row('Data urodzenia (opcjonalnie)', dobInput,
        'Aplikacja będzie automatycznie liczyć wiek przy kolejnych pomiarach.'));
      dobCollapseBox.appendChild(dobErrBox);
      sheet.appendChild(dobCollapseBox);
      dobCollapseToggle.addEventListener('click', function () {
        var isOpen = dobCollapseBox.style.display !== 'none';
        dobCollapseBox.style.display = isOpen ? 'none' : 'block';
        dobCollapseToggle.textContent = isOpen
          ? '💡 Wpisz datę urodzenia, by w przyszłości nie pytać o wiek'
          : '▼ Schowaj pole daty urodzenia';
      });
    }

    // Live delta sub-line (Δ waga · Δ wzrost · BMI centyl).
    var deltaLine = el('div', {
      style: 'font-size:0.82rem;color:#0F6E56;line-height:1.4;min-height:1.2em;font-weight:500;'
    });
    sheet.appendChild(deltaLine);

    // Error box.
    var errBox = el('div', {
      style: 'color:#A32D2D;font-size:0.82rem;line-height:1.4;display:none;'
    });
    sheet.appendChild(errBox);

    // ── Recompute (live, na każdy input) ──────────────────────────────────
    function _parseNum(s) {
      var v = (s == null ? '' : String(s)).trim().replace(',', '.');
      if (v === '') return null;
      var n = parseFloat(v);
      return isFinite(n) ? n : null;
    }
    function _recompute() {
      var h = _parseNum(heightInput.value);
      var w = _parseNum(weightInput.value);
      // BMI
      var bmi = (h != null && w != null && h > 0) ? (w / Math.pow(h / 100, 2)) : null;
      bmiDisplay.textContent = bmi != null ? 'BMI: ' + bmi.toFixed(1).replace('.', ',') : 'BMI: —';
      // Wiek (gdy DOB)
      if (dobISO && ageDisplayBox) {
        var resolved = (typeof V.calcAgeFromDOB === 'function') ? V.calcAgeFromDOB(dobISO, dateInput.value || todayISO) : null;
        ageDisplayBox.textContent = resolved
          ? 'Wiek: ' + _formatAge(resolved.totalMonths)
          : 'Wiek: — (data pomiaru przed DOB)';
      }
      // Delta vs poprzedni pomiar
      var dParts = [];
      if (h != null && prevHeight != null) {
        var dH = h - prevHeight;
        dParts.push('Δ wzrost ' + (dH >= 0 ? '+' : '') + dH.toFixed(1).replace('.', ',') + ' cm');
      }
      if (w != null && prevWeight != null) {
        var dW = w - prevWeight;
        dParts.push('Δ waga ' + (dW >= 0 ? '+' : '') + dW.toFixed(1).replace('.', ',') + ' kg');
      }
      deltaLine.textContent = dParts.length ? dParts.join(' · ') : '';
    }
    [heightInput, weightInput, dateInput].forEach(function (i) {
      i.addEventListener('input', _recompute);
      i.addEventListener('change', _recompute);
    });
    _recompute();

    // ── Akcje ─────────────────────────────────────────────────────────────
    var cancelBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      style: 'background:transparent !important;color:#5b6672 !important;border:0.5px solid #d7e9ec !important;width:auto !important;padding:8px 16px !important;flex:0 0 auto !important;',
      text: 'Anuluj',
      onclick: function () {
        overlay.remove();
        if (typeof opts.onCancel === 'function') opts.onCancel();
      }
    });
    var saveBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      style: 'background:#00838d !important;color:#fff !important;border-color:#00838d !important;width:auto !important;padding:8px 18px !important;font-weight:600;flex:0 0 auto !important;',
      text: (mode === 'edit') ? 'Zapisz korektę' : 'Zapisz pomiar',
      onclick: async function () {
        errBox.style.display = 'none';
        errBox.textContent = '';
        if (dobErrBox) dobErrBox.textContent = '';

        // ── Walidacja ────
        var h = _parseNum(heightInput.value);
        var w = _parseNum(weightInput.value);
        if (h == null || h <= 0) {
          errBox.textContent = 'Podaj wzrost w cm (np. 122).';
          errBox.style.display = 'block';
          try { heightInput.focus(); } catch (_) {}
          return;
        }
        if (w == null || w <= 0) {
          errBox.textContent = 'Podaj wagę w kg (np. 25.3).';
          errBox.style.display = 'block';
          try { weightInput.focus(); } catch (_) {}
          return;
        }

        // Data pomiaru — czytamy z input (format YYYY-MM-DD, type=date).
        var measureDateISO = (dateInput.value && dateInput.value.length === 10) ? dateInput.value : todayISO;

        // Wiek — z DOB albo z pól manual.
        var newAgeYears = null, newAgeMonths = null;
        if (dobISO) {
          var resolved = (typeof V.calcAgeFromDOB === 'function') ? V.calcAgeFromDOB(dobISO, measureDateISO) : null;
          if (!resolved) {
            errBox.textContent = 'Data pomiaru jest wcześniejsza niż data urodzenia — sprawdź daty.';
            errBox.style.display = 'block';
            return;
          }
          newAgeYears = resolved.years;
          newAgeMonths = resolved.ageMonths;
        } else {
          newAgeYears = _parseNum(ageYearsInput && ageYearsInput.value);
          newAgeMonths = _parseNum(ageMonthsInput && ageMonthsInput.value);
          if (newAgeYears == null && newAgeMonths == null) {
            errBox.textContent = 'Podaj wiek pacjenta — lata lub miesiące.';
            errBox.style.display = 'block';
            return;
          }
          if (newAgeYears == null) newAgeYears = 0;
          if (newAgeMonths == null) newAgeMonths = 0;
        }

        // Opcjonalne DOB z collapsible.
        var newDobISO = null;
        if (!dobISO && dobInput && (dobInput.value || '').trim() !== '') {
          newDobISO = (typeof V.parseDobFromDisplay === 'function') ? V.parseDobFromDisplay(dobInput.value) : null;
          if (!newDobISO) {
            if (dobErrBox) dobErrBox.textContent = 'Nieprawidłowa data urodzenia. Format DD-MM-RRRR (np. 12-01-2018).';
            try { dobInput.focus(); } catch (_) {}
            return;
          }
        }

        // ── P7-edit: edycja KONKRETNEGO wiersza Historii (z menu ⋮) ────
        // Aktualizujemy wiersz po uid/kluczu w najnowszym snapshocie (vault sam
        // synchronizuje user.* gdy to bieżący pomiar). NIE dotykamy formularza
        // kalkulatora (brak applyLoadedData) — to edycja punktu w Historii.
        if (mode === 'edit' && opts.rowRef && typeof V.updateMeasurementRow === 'function') {
          var _rowAgeMonths = Math.round((newAgeYears || 0) * 12 + (newAgeMonths || 0));
          saveBtn.disabled = true;
          cancelBtn.disabled = true;
          try {
            setBusy(true);
            await V.updateMeasurementRow(patientId, opts.rowRef, { ageMonths: _rowAgeMonths, height: h, weight: w });
            setBusy(false);
            overlay.remove();
            try {
              global.document.dispatchEvent(new global.CustomEvent('vilda:measurement-changed', {
                detail: { patientId: patientId, action: 'edit-row' }
              }));
            } catch (_) {}
            // Re-render karty pacjenta (Historia + Status + siatka). onSaved
            // woła showPatientCard z poprawnym onPick/listOptions (teraz dostępne
            // w renderTimelineSection) — wcześniejszy ReferenceError już nie wywala
            // przebudowy, więc Historia odświeża się od razu po korekcie.
            if (typeof opts.onSaved === 'function') opts.onSaved();
          } catch (e) {
            setBusy(false);
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
            errBox.textContent = 'Nie udało się zapisać korekty pomiaru.';
            errBox.style.display = 'block';
            logError('showQuickMeasureModal updateMeasurementRow', e);
          }
          return;
        }

        // ── Klonuj payload i nadpisz pola pomiaru ────
        var edited;
        try { edited = JSON.parse(JSON.stringify(prevPayload)); }
        catch (e) {
          errBox.textContent = 'Nie udało się przygotować danych.';
          errBox.style.display = 'block';
          return;
        }
        if (!edited.user || typeof edited.user !== 'object') edited.user = {};
        edited.user.height = h;
        edited.user.weight = w;
        edited.user.age = newAgeYears;
        edited.user.ageMonths = newAgeMonths;
        if (newDobISO) {
          edited.user.dobISO = newDobISO;
        }
        // timestampISO — używamy daty pomiaru (z pola), nie dziś. Format ISO:
        // jeśli measureDateISO to dziś → użyj pełnego ISO (z godziną); inaczej
        // konstruujemy z YYYY-MM-DD + południe UTC (defensywnie, nie ma godziny pomiaru).
        if (measureDateISO === todayISO) {
          edited.timestampISO = new Date().toISOString();
        } else {
          edited.timestampISO = measureDateISO + 'T12:00:00.000Z';
        }

        // ── FIX A/B/C — dorzuć pomiar do measurements[] (UPDATE-by-ageMonths) ────
        try {
          var imp = global.VildaDataImportExport;
          if (imp && typeof imp._ensureCurrentMeasurementInHistory === 'function') {
            imp._ensureCurrentMeasurementInHistory(edited);
          }
          // Jeśli helper niedostępny — fallback. measurements[] zostanie też
          // zaktualizowany przy następnym applyLoadedData/saveUserData. Nie blokujemy
          // zapisu pomiaru jeśli helpera nie ma.
        } catch (e) {
          logError('showQuickMeasureModal _ensureCurrentMeasurementInHistory', e);
        }

        // ── Zapis ────
        // mode='new' → V.savePatient tworzy nowy snapshot
        // mode='edit' → V.updateSnapshotPayload podmienia istniejący snapshot in-place
        saveBtn.disabled = true;
        cancelBtn.disabled = true;
        // P-fix: czy edytowany pomiar jest NAJNOWSZY? Sprawdzamy PRZED zapisem,
        // bo updateSnapshotPayload podbija savedAtISO. Tylko dla najnowszego (lub
        // nowego pomiaru) synchronizujemy formularz kalkulatora — edycja STAREGO
        // wpisu nie przejmuje kontekstu kalkulatora danymi sprzed lat.
        var _editIsLatest = true;
        if (mode === 'edit') {
          try {
            var _pfBefore = await V.getPatient(patientId);
            var _snapsBefore = (_pfBefore && _pfBefore.snapshots) || [];
            _editIsLatest = !!(_snapsBefore.length && _snapsBefore[0] && _snapsBefore[0].snapshotId === editSnapshotId);
          } catch (_) { _editIsLatest = false; }
        }
        try {
          setBusy(true);
          if (mode === 'edit') {
            await V.updateSnapshotPayload(patientId, editSnapshotId, edited);
          } else {
            await V.savePatient(edited, { patientId: patientId, dedup: false });
          }
          setBusy(false);
          overlay.remove();

          // P6.3/P6.4 FIX — synchronizuj formularz głównego kalkulatora z nowym
          // payloadem. Bez tego po Nowy pomiar formularz w tle ZOSTAJE ze starymi
          // wartościami i kolejne kliknięcie „Zapisz dane" (odruchowe lub myśląc
          // że trzeba dopisać pacjenta) tworzy NOWY SNAPSHOT ze STAREGO formularza
          // jako najnowszy — Status pokazuje stare, Historia oba pomiary.
          //
          // Na podstronach z formularzem (index/docpro/kalkulator-klirens) global
          // applyLoadedData jest dostępne — wywołujemy. Na pozostałych podstronach
          // (notatki/subskrypcja/ustawienia) ta funkcja nie istnieje — try/catch
          // chroni przed exception, modal i tak zamknął się prawidłowo.
          //
          // Dla hero pill P6.3 (z karty pacjenta) ta synchronizacja też jest
          // bezpieczna — formularz w tle (jeśli istnieje) dostaje świeże dane,
          // a karta pacjenta i tak rerenderuje się przez onSaved.
          try {
            if ((mode !== 'edit' || _editIsLatest) && typeof global.applyLoadedData === 'function') {
              global.applyLoadedData(edited);
            }
          } catch (e) { logError('showQuickMeasureModal applyLoadedData sync', e); }

          // Sygnał dla karty „Ostatni pomiar" (i innych): zmienił się zbiór
          // pomiarów pacjenta → przelicz n-1 z osi snapshotów vault.
          try {
            global.document.dispatchEvent(new global.CustomEvent('vilda:measurement-changed', {
              detail: { patientId: patientId, action: (mode === 'edit') ? 'edit' : 'add' }
            }));
          } catch (_) {}

          if (typeof opts.onSaved === 'function') opts.onSaved();
        } catch (e) {
          setBusy(false);
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
          errBox.textContent = (mode === 'edit')
            ? 'Nie udało się zapisać korekty pomiaru.'
            : 'Nie udało się zapisać pomiaru.';
          errBox.style.display = 'block';
          logError('showQuickMeasureModal ' + (mode === 'edit' ? 'updateSnapshotPayload' : 'savePatient'), e);
        }
      }
    });
    var actions = el('div', {
      style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:4px;'
    });
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    sheet.appendChild(actions);

    overlay.appendChild(sheet);
    global.document.body.appendChild(overlay);
    // Mobile: zablokuj scroll tła, by modal nie „pływał" (auto-unlock po zamknięciu).
    _lockBackgroundScrollUntilRemoved(overlay);
    try { heightInput.focus(); } catch (_) {}
  }

  // ============ P5.4 — TIMELINE PACJENTA (UI wariant A: vertical oś + kropki) ============

  // Mapowanie typu wydarzenia na metadata: kolor kropki, label, ikona/SVG.
  var TIMELINE_TYPE_META = {
    'measurement':  { label: 'Pomiar',      color: '#0F6E56', bg: '#E1F5EE' },
    'note':         { label: 'Notatka',     color: '#854F0B', bg: '#FAEEDA' },
    'observation':  { label: 'Obserwacja',  color: '#185FA5', bg: '#E6F1FB' },
    'lab':          { label: 'Wynik',       color: '#534AB7', bg: '#EEEDFE' },
    'medication':   { label: 'Lek',         color: '#A32D2D', bg: '#FCEBEB' },
    'gh-therapy':   { label: 'Terapia GH',  color: '#0F6E56', bg: '#E1F5EE' }
  };

  // F1 — Filtry Historii zsynchronizowane z PATIENT_NOTE_CATEGORY_LABELS.
  // Lekarz w Notatkach widzi 4 kategorie: Kontrola/Obserwacja/Leczenie/Wynik badania.
  // W Historii dodajemy Pomiar (event measurement) + powyższe 4 kategorie + Wszystko.
  // Usunięte:
  //   • 'note' (catch-all śmietnik — każda notatka teraz ląduje pod swoją kategorią)
  //   • 'lab' / 'medication' (placeholdery future-proof, notatki ze structural fields
  //     trafiają teraz do 'wynik-badania' / 'treatment' przez _deriveNoteFilterCategory)
  //   • 'gh-therapy' (placeholder bez modułu — wraca gdy moduł powstanie)
  var TIMELINE_FILTER_OPTIONS = [
    { id: 'all',           label: 'Wszystko' },
    { id: 'measurement',   label: 'Pomiar' },
    { id: 'observation',   label: 'Obserwacja' },
    { id: 'treatment',     label: 'Leczenie' },
    { id: 'wynik-badania', label: 'Wynik badania' },
    { id: 'followup',      label: 'Kontrola' }
  ];

  // F1 — Wyprowadza „kategorię filtra" z notatki klinicznej:
  // priorytet structural fields B3 (medication/labResult) > category > default.
  // Zwraca jeden z: 'treatment' | 'wynik-badania' | 'observation' | 'followup'.
  // Używane przez eventMatchesFilter (filtrowanie listy) i _resolveEventMeta (badge/kolor).
  function _deriveNoteFilterCategory(noteEvent) {
    if (!noteEvent) return 'observation';
    if (noteEvent.medication) return 'treatment';
    if (noteEvent.labResult) return 'wynik-badania';
    if (noteEvent.category && PATIENT_NOTE_CATEGORY_LABELS[noteEvent.category]) {
      return noteEvent.category;
    }
    return 'observation';
  }

  // F1 — Decyduje czy event pasuje do bieżącego filtra. Notatki rozdzielają się
  // po kategorii (treatment/wynik-badania/observation/followup); auto-generated
  // 'observation' events trafiają pod filtr 'observation' razem z notatkami obs.
  function eventMatchesFilter(evt, filterId) {
    if (!evt) return false;
    if (filterId === 'all') return true;
    if (evt.type === 'measurement') return filterId === 'measurement';
    if (evt.type === 'observation') return filterId === 'observation';
    if (evt.type === 'note') return filterId === _deriveNoteFilterCategory(evt);
    return false;
  }

  // F1 — Zwraca meta { label, color, bg } dla badge'a w timeline.
  // Dla notatek używa palety PATIENT_NOTE_CATEGORY_LABELS (spójność z Notatkami),
  // dla measurement/observation auto — TIMELINE_TYPE_META.
  function _resolveEventMeta(evt) {
    if (!evt) return { label: '?', color: '#5b6672', bg: '#f5fafb' };
    if (evt.type === 'note') {
      var cat = _deriveNoteFilterCategory(evt);
      var pcat = PATIENT_NOTE_CATEGORY_LABELS[cat];
      if (pcat) return { label: pcat.label, color: pcat.color, bg: pcat.bg };
    }
    return TIMELINE_TYPE_META[evt.type] || { label: evt.type, color: '#5b6672', bg: '#f5fafb' };
  }

  /**
   * Formatuje dateISO w relatywny napis polski.
   *   "dziś · 14:30" / "wczoraj" / "3 dni temu" / "12.05.2026"
   */
  function _formatTimelineDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var now = new Date();
    var todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    var dUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    var diffDays = Math.round((todayUTC - dUTC) / (24 * 3600 * 1000));
    if (diffDays === 0) {
      var hh = String(d.getHours()).padStart(2, '0');
      var mm = String(d.getMinutes()).padStart(2, '0');
      return 'dziś · ' + hh + ':' + mm;
    }
    if (diffDays === 1) return 'wczoraj';
    if (diffDays > 1 && diffDays <= 14) return diffDays + ' dni temu';
    var dd = String(d.getDate()).padStart(2, '0');
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    var yyyy = d.getFullYear();
    return dd + '.' + mo + '.' + yyyy;
  }

  /**
   * B1.6/B1.7 — formatuje wiek pacjenta z liczby miesięcy do napisu po polsku.
   *   0 → "noworodek"
   *   1..11 → "N mies."
   *   12 → "1 rok"
   *   13..23 → "1 rok N mies."
   *   24..47 → "X lata" / "X lata N mies."
   *   48+ → "X lat" / "X lat N mies."
   * Używane jako kotwica chipów Pomiar (zamiast daty kalendarzowej) — historia
   * pomiarów w pediatrii kotwiczy się wiekiem dziecka, nie datą wizyty.
   */
  function _formatAge(ageMonths) {
    if (typeof ageMonths !== 'number' || !isFinite(ageMonths) || ageMonths < 0) return '';
    var months = Math.round(ageMonths);
    if (months === 0) return 'noworodek';
    if (months < 12) return months + ' mies.';
    var years = Math.floor(months / 12);
    var remMonths = months - years * 12;
    function yearWord(n) {
      if (n === 1) return 'rok';
      if (n >= 2 && n <= 4) return 'lata';
      return 'lat';
    }
    if (remMonths === 0) return years + ' ' + yearWord(years);
    return years + ' ' + yearWord(years) + ' ' + remMonths + ' mies.';
  }

  /**
   * Renderuje tag zdarzenia (badge typu + treść konkretnego typu).
   */
  function _renderTimelineEventBody(event) {
    var bodyDiv = el('div', null);
    if (event.type === 'measurement') {
      // Linia główna: Wzrost + Waga (kluczowe dane antropometryczne)
      var mainParts = [];
      if (event.height != null) mainParts.push('Wzrost ' + event.height + ' cm');
      if (event.weight != null) mainParts.push('Waga ' + event.weight + ' kg');
      if (mainParts.length) {
        bodyDiv.appendChild(el('div', {
          style: 'font-weight:600;font-size:0.92rem;color:#0f2b33;',
          text: mainParts.join(' · ')
        }));
      } else {
        // Sentinel: snapshot bez wzrostu/wagi (rzadko). Pokazujemy wprost.
        bodyDiv.appendChild(el('div', {
          style: 'font-weight:500;font-size:0.88rem;color:#9aa8aa;font-style:italic;',
          text: 'Snapshot bez pomiarów antropometrycznych'
        }));
      }
      // Linia sub: BMI + prędkość wzrastania (cm/rok od poprzedniego pomiaru)
      // B1.6: usunęliśmy "Wiek N lat" z sub-line — wiek pacjenta jest teraz
      // w nagłówku chipa Pomiar (kotwica chronologiczna). Sub-line zostaje skoncentrowana
      // na danych klinicznych (BMI + prędkość wzrastania).
      var subParts = [];
      if (event.bmi != null) subParts.push('BMI ' + event.bmi);
      if (event.growthVelocity != null) subParts.push('Prędkość ' + event.growthVelocity + ' cm/rok');
      if (subParts.length) {
        bodyDiv.appendChild(el('div', {
          style: 'font-size:0.86rem;color:#374151;line-height:1.5;margin-top:2px;',
          text: subParts.join(' · ')
        }));
      }
    } else if (event.type === 'note') {
      // B3.2f: strukturalny render dla notatek z medication / labResult.
      // Jeśli notatka ma pole strukturalne — pokazujemy dedykowaną linię
      // (Lek: NAZWA — Dawka: X (akcja) / TEST: WARTOŚĆ (norma: ...)). Tytuł
      // notatki pozostaje jako label nad strukturalną linią. Body (wolny tekst)
      // pokazujemy zawsze, jako ewentualny komentarz lekarza pod strukturą.
      if (event.title) {
        bodyDiv.appendChild(el('div', {
          style: 'font-weight:600;font-size:0.92rem;color:#0f2b33;',
          text: event.title
        }));
      }
      if (event.medication && event.medication.action) {
        var medLine = el('div', {
          style: 'display:flex;align-items:center;gap:6px;margin-top:4px;'
            + 'padding:4px 8px;background:#fff8ee;border:0.5px solid #f0e0c8;'
            + 'border-radius:6px;font-size:0.84rem;color:#7a5a1a;'
        });
        medLine.appendChild(el('span', { text: '💊', style: 'font-size:0.95rem;' }));
        var medParts = [];
        if (event.medication.name) medParts.push(event.medication.name);
        if (event.medication.dose) medParts.push(event.medication.dose);
        var actionLabel = { start: 'włączony', change: 'zmiana dawki', stop: 'zakończony' }[event.medication.action] || event.medication.action;
        medParts.push('(' + actionLabel + ')');
        if (event.medication.previousDose && event.medication.action === 'change') {
          medParts.push('· z ' + event.medication.previousDose);
        }
        medLine.appendChild(el('span', { text: medParts.join(' '), style: 'flex:1;' }));
        bodyDiv.appendChild(medLine);
      }
      if (event.labResult && (event.labResult.test || event.labResult.value)) {
        var labLine = el('div', {
          style: 'display:flex;align-items:center;gap:6px;margin-top:4px;'
            + 'padding:4px 8px;background:#eef6ff;border:0.5px solid #cde0f5;'
            + 'border-radius:6px;font-size:0.84rem;color:#1a4a7a;'
        });
        labLine.appendChild(el('span', { text: '🧪', style: 'font-size:0.95rem;' }));
        var labParts = [];
        if (event.labResult.test) labParts.push(event.labResult.test + ':');
        if (event.labResult.value) labParts.push(event.labResult.value);
        if (event.labResult.norm) labParts.push('(norma: ' + event.labResult.norm + ')');
        labLine.appendChild(el('span', { text: labParts.join(' '), style: 'flex:1;' }));
        bodyDiv.appendChild(labLine);
      }
      if (event.body) {
        bodyDiv.appendChild(el('div', {
          style: 'font-size:0.86rem;color:#374151;line-height:1.5;margin-top:2px;white-space:pre-wrap;word-wrap:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;',
          text: event.body
        }));
      }
      if (event.completedAtISO) {
        bodyDiv.appendChild(el('div', {
          style: 'font-size:0.74rem;color:#0F6E56;margin-top:3px;',
          text: '✓ Wykonano'
        }));
      }
    } else if (event.type === 'observation') {
      bodyDiv.appendChild(el('div', {
        style: 'font-weight:600;font-size:0.92rem;color:#0f2b33;',
        text: event.title || 'Obserwacja'
      }));
      if (event.description) {
        bodyDiv.appendChild(el('div', {
          style: 'font-size:0.86rem;color:#374151;line-height:1.5;margin-top:2px;',
          text: event.description
        }));
      }
      if (event.autoGenerated) {
        bodyDiv.appendChild(el('div', {
          style: 'font-size:0.7rem;color:#9aa8aa;margin-top:3px;font-style:italic;',
          text: 'Automatyczne wykrycie — zweryfikuj ręcznie'
        }));
      }
    }
    return bodyDiv;
  }

  /**
   * Główny renderer Timeline. Pobiera eventy z vault.listPatientTimelineEvents,
   * pozwala filtrować po typie (sticky pill button row na górze), renderuje
   * vertical timeline (pionowa oś + kolorowane kropki + karty zdarzeń).
   *
   * Klikalne wydarzenia:
   *   • measurement → switchTab('traj') — przełącz na siatki centylowe
   *   • note → switchTab('notes') — tab Notatki (P4)
   *   • observation, lab, medication, gh-therapy — na razie tylko statyczne karty
   *     (modal "Otwórz" w przyszłości po dodaniu dedykowanych modułów)
   *
   * @param {HTMLElement} container — div sekcji w karcie pacjenta
   * @param {string} patientId
   * @param {Function} reRender — callback do ponownego wywołania
   */
  async function renderTimelineSection(container, patientId, reRender, onPick, listOptions) {
    // onPick/listOptions PRZEKAZYWANE jawnie z showPatientCard przez reRenderTimeline.
    // To funkcja MODUŁOWA (nie zagnieżdżona w showPatientCard), więc NIE domyka się
    // nad jego zmiennymi — bez tych parametrów menu ⋮ (Edytuj/Usuń) odwoływało się
    // do nieistniejących onPick/listOptions → ReferenceError → przebudowa karty się
    // wywalała i Historia nie odświeżała się po korekcie.
    var V = getVault();
    clear(container);
    if (!V || typeof V.listPatientTimelineEvents !== 'function') {
      container.appendChild(el('p', { class: 'vilda-patient-empty-msg', text: 'Historia pacjenta nie jest dostępna.' }));
      return;
    }

    // Header z licznikiem + filtry
    var headerWrap = el('div', { style: 'margin-bottom:12px;' });
    headerWrap.appendChild(el('p', {
      class: 'vilda-patient-section-h',
      text: 'Historia pacjenta',
      style: 'margin:0 0 8px 0;'
    }));

    // Filtry — sticky pill row (jak w notatki.html dla kategorii)
    var filtersRow = el('div', {
      class: 'vilda-patient-timeline-filters',
      style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;'
    });
    // L1 — multi-select toggle pills.
    // State: activeFilters = Set kategorii NOTATEK które są aktywne ('measurement',
    // 'treatment', 'observation', 'wynik-badania', 'followup'). Pusty zbiór =
    // „Wszystko" świeci się = pokaż wszystkie eventy. Klik konkretnej kategorii
    // toggluje ją w secie (nie deselectuje innych). Klik „Wszystko" robi reset
    // (activeFilters.clear()). filterAllowsEvent: pusty set → true; inaczej OR
    // po wszystkich aktywnych kategoriach.
    var activeFilters = new Set();
    var filterPills = [];

    // F1 — Helper: zwraca paletę pill filtra W STANIE NIEAKTYWNYM.
    // Aktywny stan ('#00838d' teal + biały tekst) jest obsługiwany osobno
    // w refreshFilterUI — nie tutaj. Inaczej 'all' wyglądałoby aktywne nawet
    // gdy aktywny jest inny filtr (bug F1-fix2: dwa pill'e wyglądały aktywne).
    //
    // Nieaktywne stany:
    //   • 'all'         → neutralny szary
    //   • 'measurement' → light green z TIMELINE_TYPE_META
    //   • kategorie     → light kolor z PATIENT_NOTE_CATEGORY_LABELS (spójność z Notatkami)
    function _filterPillPalette(filterId) {
      if (filterId === 'all') return { bg: '#f5fafb', color: '#5b6672' };
      if (filterId === 'measurement') {
        var mm = TIMELINE_TYPE_META.measurement;
        return mm ? { bg: mm.bg, color: mm.color } : { bg: '#f5fafb', color: '#5b6672' };
      }
      // observation / treatment / wynik-badania / followup → paleta z Notatek (spójność)
      var pcat = PATIENT_NOTE_CATEGORY_LABELS[filterId];
      if (pcat) return { bg: pcat.bg, color: pcat.color };
      return { bg: '#f5fafb', color: '#5b6672' };
    }

    // F1-fix: ios26-v2.css ma `.liquid-ios26 button { background:...!important; color:#111!important }`
    // który nadpisuje inline `style="background:..."`. Bez !important pill'e wychodzą
    // semi-przezroczyste białe z czarnym tekstem niezależnie od typu. Musimy
    // używać setProperty z 'important' albo wpinać !important w inline string.
    function _applyPillStyle(btn, bg, color) {
      btn.style.setProperty('background', bg, 'important');
      btn.style.setProperty('color', color, 'important');
    }
    function refreshFilterUI() {
      filterPills.forEach(function (p) {
        var isAll = (p.opt.id === 'all');
        // L1: „Wszystko" aktywne gdy activeFilters.size === 0 (pusty set).
        // Inna kategoria aktywna gdy w secie. Pill aktywny: ciemny kolor swojej
        // palety (zamiast jednolitego teal jak przed L1) — daje jasny wizualny
        // sygnał której kategorii filtr przynależy.
        var isActive = isAll ? (activeFilters.size === 0) : activeFilters.has(p.opt.id);
        var pal = _filterPillPalette(p.opt.id);
        if (isActive) {
          if (isAll) {
            _applyPillStyle(p.btn, '#00838d', '#fff');
          } else {
            // Aktywny pill kategorii: użyj jej własnego ciemnego koloru (pal.color)
            // jako tła, biały tekst. Dzięki temu Leczenie świeci się niebiesko,
            // Wynik fioletowo, etc. — łatwo rozpoznać które filtry aktywne.
            _applyPillStyle(p.btn, pal.color, '#fff');
          }
        } else {
          _applyPillStyle(p.btn, pal.bg, pal.color);
        }
      });
      rebuildList();
    }
    TIMELINE_FILTER_OPTIONS.forEach(function (opt) {
      var pal = _filterPillPalette(opt.id);
      var isAllInit = (opt.id === 'all');
      var isActiveInit = isAllInit; // przy starcie tylko „Wszystko" aktywne
      var btn = el('button', {
        type: 'button',
        text: opt.label,
        style: 'border:none !important;padding:4px 10px;font-size:0.74rem;font-weight:600;border-radius:999px !important;cursor:pointer;font-family:inherit;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;box-shadow:none !important;',
        onclick: function () {
          // L1 — multi-select toggle:
          //   • „Wszystko" → reset (clear), wszystkie inne wygaszone
          //   • Inna kategoria → toggle (jeśli była w secie, usuń; inaczej dodaj)
          //     — pozostałe aktywne kategorie zostają
          if (opt.id === 'all') {
            activeFilters.clear();
          } else if (activeFilters.has(opt.id)) {
            activeFilters.delete(opt.id);
          } else {
            activeFilters.add(opt.id);
          }
          refreshFilterUI();
        }
      });
      // F1-fix: kolory ustawiamy przez setProperty('important') żeby pokonać
      // .liquid-ios26 button { background:...!important } z ios26-v2.css.
      _applyPillStyle(btn, isActiveInit ? '#00838d' : pal.bg, isActiveInit ? '#fff' : pal.color);
      filterPills.push({ opt: opt, btn: btn });
      filtersRow.appendChild(btn);
    });
    headerWrap.appendChild(filtersRow);
    container.appendChild(headerWrap);

    // B3.5 — Jednorazowy dymek wyjaśniający nowy układ Historii po wdrożeniu B3.
    // Pokazywany tylko przy pierwszym wejściu w zakładkę (per-urządzenie, przez
    // localStorage flag). Po kliknięciu „×" lub „Rozumiem" znika i już nie wraca.
    //
    // Lekarz po deploy B3 zobaczy: pomiary i notatki w jednej osi czasu zamiast
    // 3-warstwowego układu (notatki bez wizyty / pomiary). Dymek tłumaczy gdzie
    // teraz są luźne notatki (zakładka Notatki, sekcja „Notatki ogólne").
    var B3_HISTORY_TOOLTIP_KEY = 'vilda:b3-history-tooltip-seen';
    var tooltipSeen = false;
    try {
      if (global.localStorage) {
        tooltipSeen = global.localStorage.getItem(B3_HISTORY_TOOLTIP_KEY) === '1';
      }
    } catch (_) {}
    if (!tooltipSeen) {
      var tooltipBox = el('div', {
        class: 'vilda-b3-history-tooltip',
        style: 'display:flex;align-items:flex-start;gap:10px;padding:12px 14px;margin-bottom:14px;'
          + 'background:#eef6ff;border:0.5px solid #cde0f5;border-radius:10px;'
          + 'color:#1a4a7a;font-size:0.86rem;line-height:1.5;'
      });
      // Info icon (Tabler ti-info-circle outline)
      var infoIcon = el('span', {
        style: 'flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;'
          + 'width:20px;height:20px;color:#1a4a7a;margin-top:1px;'
      });
      infoIcon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" '
        + 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
        + '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 12h1v4h1"/></svg>';
      tooltipBox.appendChild(infoIcon);

      var tooltipText = el('div', { style: 'flex:1;' });
      tooltipText.innerHTML = '<strong>Historia to oś czasu zdarzeń klinicznych</strong> — pomiary, '
        + 'włączenie leków, wyniki badań. Luźne notatki znajdziesz w zakładce '
        + '<strong>Notatki</strong>, sekcja „Notatki ogólne".';
      tooltipBox.appendChild(tooltipText);

      function _dismissTooltip() {
        try {
          if (global.localStorage) global.localStorage.setItem(B3_HISTORY_TOOLTIP_KEY, '1');
        } catch (_) {}
        if (tooltipBox.parentNode) tooltipBox.parentNode.removeChild(tooltipBox);
      }

      var dismissBtn = el('button', {
        type: 'button',
        'aria-label': 'Zamknij',
        title: 'Zamknij (już nie pokazuj)',
        style: 'flex:0 0 auto;background:transparent;border:0;color:#1a4a7a;font-size:1.1rem;'
          + 'font-weight:600;cursor:pointer;padding:0 4px;line-height:1;align-self:flex-start;',
        text: '×',
        onclick: _dismissTooltip
      });
      tooltipBox.appendChild(dismissBtn);
      container.appendChild(tooltipBox);
    }

    // Wczytanie eventów
    var events = [];
    try { events = await V.listPatientTimelineEvents(patientId); }
    catch (e) { logError('listPatientTimelineEvents', e); }

    // Container listy (vertical timeline z pionową osią)
    // B-fix UX (post-B3): wewnętrzny scroll dla mixed timeline. Header (tytuł +
    // pill filtrów + tooltip B3.5) zostaje NAD scrollem — filtry zawsze widoczne,
    // user może filtrować bez scrollowania w górę. Same eventy scrollują się
    // wewnętrznie. Wymiary identyczne jak w Notatkach (spójność UX). Padding-left
    // przesunięty z listWrap na wewnętrzny wrapper żeby pionowa oś (axis) zaczynała
    // się od krawędzi scroll containera, nie od miejsca padding-left=28px.
    var listWrap = el('div', {
      class: 'vilda-patient-timeline-list',
      style: 'position:relative;padding-left:28px;'
        + 'max-height:min(calc(100vh - 320px), 720px);min-height:280px;'
        + 'overflow-y:auto;overflow-x:hidden;'
        + 'padding-right:4px;'
        + '-webkit-overflow-scrolling:touch;'
        + 'scrollbar-gutter:stable;'
    });
    // Pionowa linia osi
    var axis = el('div', {
      style: 'position:absolute;left:10px;top:4px;bottom:4px;width:2px;background:#d7e9ec;'
    });
    listWrap.appendChild(axis);
    container.appendChild(listWrap);

    // ── B1.6: Render pojedynczej karty event w pionowej osi ─────────────────
    // Wydzielona z głównego rebuildList — używana przez warstwy 1 (wolne notatki),
    // 2 (pomiary po wieku + kotwiczone notatki/obserwacje).
    //
    // headerText: tekst NAD chipem (data dla wolnych notatek; wiek dla pomiarów;
    //   "Notatka z wizyty" / null dla kotwiczonych — kotwiczone są wewnątrz grupy
    //   pomiaru, więc nie potrzebują własnego headera daty).
    // dotIndent: 'normal' (lewa krawędź osi) lub 'nested' (lekko cofnięte
    //   wewnątrz grupy pomiaru — pokazuje że to dziecko pomiaru).
    function _renderTimelineCard(event, headerText, dotIndent) {
      // F1: meta z _resolveEventMeta — dla notatek paleta z PATIENT_NOTE_CATEGORY_LABELS
      // (spójność z zakładką Notatki). Notatka kategorii „Leczenie" → niebieski badge
      // i niebieska kropka na osi, identycznie jak w Notatkach.
      var meta = _resolveEventMeta(event);
      var wrapper = el('div', { style: 'position:relative;margin-bottom:' + (dotIndent === 'nested' ? '8px' : '14px') + ';' });

      // Kropka na osi — kolor wg typu. Nested → mniejsza, lekko cofnięta w bok.
      var dotSize = (dotIndent === 'nested') ? 10 : 14;
      var dotLeft = (dotIndent === 'nested') ? -20 : -22;
      var dotTop = (dotIndent === 'nested') ? 6 : 4;
      wrapper.appendChild(el('div', {
        style: 'position:absolute;left:' + dotLeft + 'px;top:' + dotTop + 'px;'
          + 'width:' + dotSize + 'px;height:' + dotSize + 'px;border-radius:50%;'
          + 'background:' + meta.color + ';border:2px solid #fff;box-shadow:0 0 0 1px ' + meta.color + ';'
      }));

      // Header tekst nad kartą (wiek lub data; opcjonalny)
      if (headerText) {
        wrapper.appendChild(el('div', {
          style: 'font-size:0.7rem;color:#5b6672;font-weight:500;margin-bottom:3px;',
          text: headerText
        }));
      }

      var card = el('div', {
        style: 'background:#f5fafb;border-radius:10px;padding:' + (dotIndent === 'nested' ? '8px 12px' : '10px 12px') + ';'
          + 'display:flex;flex-direction:column;gap:6px;cursor:pointer;transition:background 0.15s;position:relative;',
        onmouseover: function () { card.style.background = '#ebf3f5'; },
        onmouseout: function () { card.style.background = '#f5fafb'; },
        onclick: function () { _handleTimelineEventClick(event); }
      });

      // Badge typu
      card.appendChild(el('span', {
        style: 'display:inline-block;padding:2px 8px;font-size:0.7rem;font-weight:600;color:'
          + meta.color + ';background:' + meta.bg + ';border-radius:999px;align-self:flex-start;',
        text: meta.label
      }));

      card.appendChild(_renderTimelineEventBody(event));

      // P6.6c — Menu „⋮" w prawym górnym rogu chipa Pomiar. Otwiera proste menu
      // z akcjami Edytuj i Usuń (gdy event ma snapshotId) lub samą opcję
      // „Edytuj w kalkulatorze" (I2: gdy snapshotId brak — pomiar wirtualny
      // z payload.user.measurementHistory / advanced.data.measurements).
      if (event.type === 'measurement') {
        var menuBtn = el('button', {
          type: 'button',
          'aria-label': 'Akcje dla pomiaru',
          title: 'Akcje',
          style: 'position:absolute;top:6px;right:8px;background:transparent;border:0;'
            + 'color:#5b6672;font-size:1.1rem;font-weight:700;padding:2px 8px;cursor:pointer;'
            + 'line-height:1;border-radius:6px;',
          text: '⋮',
          onmouseover: function () { menuBtn.style.background = 'rgba(0,131,141,0.1)'; menuBtn.style.color = '#00838d'; },
          onmouseout: function () { menuBtn.style.background = 'transparent'; menuBtn.style.color = '#5b6672'; },
          onclick: function (e) {
            e.stopPropagation();
            _openMeasurementActionMenu(event, menuBtn);
          }
        });
        card.appendChild(menuBtn);
      }

      wrapper.appendChild(card);
      return wrapper;
    }

    // I2 — Helper nawigacji do tabeli „Historyczne pomiary" w głównym
    // kalkulatorze. Pomiary wpisane w „Zaawansowane obliczenia wzrostowe" są
    // wirtualne (bez snapshotId), więc nie da się ich edytować w karcie
    // pacjenta. Ten helper:
    //   1) Zamyka kartę pacjenta (hide overlay)
    //   2) Jeśli aktualna strona ma elementy #toggleAdvancedGrowth +
    //      #advancedGrowthSection — rozwija sekcję i scrolluje do niej.
    //   3) Inaczej — ustawia sessionStorage flagi (vilda:pendingPatientLoad +
    //      vilda:postLoadScroll) i nawiguje do index.html. Chrome.js po
    //      unlocku wykonuje to samo (rozwija + scrolluje).
    function _navigateToHistoricalMeasurements(patientId) {
      try { hide(); } catch (_) {}

      function performInPageScroll() {
        var toggleBtn = global.document.getElementById('toggleAdvancedGrowth');
        var section = global.document.getElementById('advancedGrowthSection');
        if (!toggleBtn || !section) return false;
        // Rozwiń sekcję jeśli zwinięta (display:none lub style nieustawiony).
        var disp = '';
        try { disp = (section.style && section.style.display) || ''; } catch (_) {}
        if (disp === '' || disp === 'none') {
          try { toggleBtn.click(); } catch (_) {}
        }
        try { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {}
        return true;
      }

      // Spróbuj in-place (jesteśmy już na index.html).
      if (performInPageScroll()) return;

      // Inaczej: set flagi + nawiguj.
      try {
        if (global.sessionStorage) {
          if (patientId) global.sessionStorage.setItem('vilda:pendingPatientLoad', patientId);
          global.sessionStorage.setItem('vilda:postLoadScroll', 'advancedGrowth');
        }
      } catch (_) {}
      try { global.location.assign('index.html'); } catch (_) {}
    }

    // P6.6c — Mini popup menu „Edytuj / Usuń" przy chipie Pomiar.
    function _openMeasurementActionMenu(event, anchorBtn) {
      // Defensywnie usuń poprzednie menu (jednoczesne otwarcia).
      try {
        var prev = global.document.querySelectorAll('.vilda-timeline-measure-menu');
        for (var i = 0; i < prev.length; i += 1) prev[i].remove();
      } catch (_) {}

      // Ikony liniowe (stroke=currentColor) — spójne z resztą apki, zamiast emoji.
      var ICON_EDIT = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
      var ICON_NOTE = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>';
      var ICON_TRASH = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

      // Shell jak .vilda-auth-sort-dropdown (radius 14, obwódka 1.5px, turkusowy
      // cień, overflow hidden); wiersze pełnej szerokości z hairline-dzielnikami.
      var menu = el('div', {
        class: 'vilda-timeline-measure-menu',
        // Fix: montujemy na document.body z position:fixed (pozycja liczona z rect
        // przycisku), żeby menu NIE było obcinane przez overflow przodków ani nie
        // chowało się pod inne elementy gdy chip jest na dole listy. Pozycję i
        // ewentualny flip w górę ustawia _mountMeasureMenu po dodaniu do DOM.
        style: 'position:fixed;top:0;left:0;background:#fff;'
          + 'border:1.5px solid #e0e8eb;border-radius:14px;'
          + 'box-shadow:0 8px 28px rgba(0,60,80,0.13);overflow:hidden;'
          + 'z-index:1000002;min-width:210px;'
      });

      // Montaż menu na body + pozycjonowanie fixed względem przycisku ⋮.
      function _mountMeasureMenu(menuEl, btn) {
        try { global.document.body.appendChild(menuEl); } catch (_) { return; }
        try {
          var r = btn.getBoundingClientRect();
          var vw = global.innerWidth || global.document.documentElement.clientWidth || 360;
          var vh = global.innerHeight || global.document.documentElement.clientHeight || 640;
          var mw = menuEl.offsetWidth || 210;
          var mh = menuEl.offsetHeight || 0;
          var left = Math.round(r.right - mw);          // prawa krawędź menu = prawa krawędź przycisku
          if (left + mw > vw - 8) left = vw - 8 - mw;
          if (left < 8) left = 8;
          var top = Math.round(r.bottom + 4);           // domyślnie pod przyciskiem
          if (top + mh > vh - 8) {                       // brak miejsca w dół → otwórz w górę
            var up = Math.round(r.top - mh - 4);
            top = (up >= 8) ? up : Math.max(8, vh - 8 - mh);
          }
          menuEl.style.left = left + 'px';
          menuEl.style.top = top + 'px';
        } catch (_) {}
        // Menu fixed odkleja się przy scrollu/resize — zamykamy je wtedy.
        var onScrollResize = function () {
          try { menuEl.remove(); } catch (_) {}
          try { global.removeEventListener('scroll', onScrollResize, true); } catch (_) {}
          try { global.removeEventListener('resize', onScrollResize, true); } catch (_) {}
        };
        try {
          global.addEventListener('scroll', onScrollResize, true);
          global.addEventListener('resize', onScrollResize, true);
        } catch (_) {}
      }

      // Propozycja B — ikona w turkusowym kafelku + etykieta. „danger" → czerwień
      // (tekst, ikona) + czerwony kafelek. Bez emoji.
      function makeItem(iconSvg, label, onAction, danger) {
        var chip = el('span', {
          html: iconSvg,
          style: 'display:inline-flex;width:28px;height:28px;border-radius:8px;'
            + 'align-items:center;justify-content:center;flex:0 0 auto;'
            + 'background:' + (danger ? '#fceaea' : '#e1f5ee') + ';'
            + 'color:' + (danger ? '#A32D2D' : '#00838d') + ';'
        });
        return el('button', {
          type: 'button',
          class: danger ? 'is-danger' : '',
          style: 'display:flex;align-items:center;gap:12px;width:100%;'
            + 'padding:11px 14px;background:#fff;border:0;'
            + 'border-bottom:1px solid #f0f4f5;text-align:left;'
            + 'font-size:15px;font-family:inherit;cursor:pointer;'
            + 'color:' + (danger ? '#A32D2D' : '#0f2b33') + ';',
          onmouseover: function (e) { e.currentTarget.style.background = danger ? '#fceaea' : '#f5fafb'; },
          onmouseout: function (e) { e.currentTarget.style.background = '#fff'; },
          onclick: function (e) {
            e.stopPropagation();
            menu.remove();
            onAction();
          }
        }, [chip, label]);
      }
      // Usuwa dolny dzielnik z ostatniego wiersza menu (estetyka, jak :last-child).
      function stripLastDivider() {
        try { if (menu.lastElementChild) menu.lastElementChild.style.borderBottom = 'none'; } catch (_) {}
      }

      // I2: pomiary historyczne (z payload.user.measurementHistory /
      // advanced.data.measurements) są wirtualne — nie mają fizycznego
      // snapshotId w vault. Dla nich edycja jest w głównym kalkulatorze
      // (tabela „Historyczne pomiary"). Pokazujemy jeden item — „Edytuj
      // w kalkulatorze" — który zamyka kartę i otwiera kalkulator z
      // rozwiniętą sekcją Zaawansowane obliczenia wzrostowe.
      var hasSnapshotId = typeof event.snapshotId === 'string' && event.snapshotId;
      if (!hasSnapshotId) {
        menu.appendChild(makeItem(ICON_EDIT, 'Edytuj w kalkulatorze', function () {
          _navigateToHistoricalMeasurements(event.patientId);
        }));
        stripLastDivider();
        _mountMeasureMenu(menu, anchorBtn);
        // Menu zamyka się przy kliknięciu poza nim.
        setTimeout(function () {
          function offClick(ev) {
            if (!menu.contains(ev.target)) {
              menu.remove();
              global.document.removeEventListener('click', offClick);
            }
          }
          global.document.addEventListener('click', offClick);
        }, 0);
        return;
      }

      menu.appendChild(makeItem(ICON_EDIT, 'Edytuj', function () {
        // P7-edit: edytujemy KONKRETNY wiersz Historii (po uid/kluczu), nie snapshot.
        // snapshotId zostaje tylko jako kontekst prefilla (płeć/DOB/nazwa z najnowszego).
        showQuickMeasureModal(event.patientId, {
          mode: 'edit',
          snapshotId: event.snapshotId,
          rowRef: { uid: event.uid || null, key: event.rowKey || null },
          rowValues: { ageMonths: event.ageMonths, height: event.height, weight: event.weight },
          onSaved: function () {
            // Po zapisie — przerenderuj kartę pacjenta (timeline + status + siatka).
            // G2: restore Historia (chip Pomiar pochodzi z Historii) zamiast Status.
            // Fix: zachowujemy onPick + listOptions (z zasięgu showPatientCard), żeby
            // po rerenderze NIE zniknął przycisk „Wczytaj tego pacjenta" (powstaje
            // tylko gdy onPick jest funkcją). Wcześniej przekazywane null gasiło go.
            showPatientCard(event.patientId, onPick, listOptions, { activeTab: 'timeline' });
          }
        });
      }));
      // B2.1 — Dodaj notatkę do tej wizyty (kotwiczoną wiekiem tego pomiaru).
      // Wykorzystuje istniejący showPatientNoteEditor z suggestLinkedAge =
      // event.ageMonths, więc edytor pokazuje checkbox „Powiąż z bieżącą wizytą
      // (wiek X)" zaznaczony domyślnie. Notatka po zapisie pojawi się w
      // zakładce Historia jako kotwiczona pod chipem Pomiar (L-connector).
      menu.appendChild(makeItem(ICON_NOTE, 'Dodaj notatkę', function () {
        if (typeof showPatientNoteEditor !== 'function') {
          try { global.alert('Edytor notatki niedostępny — odśwież stronę.'); } catch (_) {}
          return;
        }
        showPatientNoteEditor({
          patientId: event.patientId,
          note: null,
          suggestLinkedAge: event.ageMonths,
          onSaved: function () {
            // G2: notatka dodana z Historii (kotwiczona do tego pomiaru) →
            // re-render karty pacjenta z aktywnym tabem Historia.
            // Fix: zachowujemy onPick + listOptions, by nie zniknął „Wczytaj tego pacjenta".
            showPatientCard(event.patientId, onPick, listOptions, { activeTab: 'timeline' });
          }
        });
      }));
      menu.appendChild(makeItem(ICON_TRASH, 'Usuń pomiar', function () {
        var ageLabel = _formatAge(event.ageMonths) || ('wiek ' + event.ageMonths + ' mies.');
        if (!global.confirm('Usunąć pomiar (' + ageLabel + ')? Tej operacji nie można cofnąć.')) return;
        var V = getVault();
        if (!V || typeof V.deleteMeasurementRow !== 'function') {
          try { global.alert('Funkcja usuwania pomiaru niedostępna — odśwież stronę.'); } catch (_) {}
          return;
        }
        // P7-edit: usuwamy KONKRETNY wiersz Historii (po uid/kluczu), NIE cały snapshot.
        V.deleteMeasurementRow(event.patientId, { uid: event.uid || null, key: event.rowKey || null }).then(function () {
          // Sygnał dla karty „Ostatni pomiar": zbiór pomiarów się zmienił.
          try {
            global.document.dispatchEvent(new global.CustomEvent('vilda:measurement-changed', {
              detail: { patientId: event.patientId, action: 'delete' }
            }));
          } catch (_) {}
          // G2: po usunięciu pomiaru z Historii — wróć do Historii (nie Status).
          // Fix: zachowujemy onPick + listOptions (z zasięgu showPatientCard), żeby
          // po rerenderze NIE zniknął przycisk „Wczytaj tego pacjenta" (powstaje
          // tylko gdy onPick jest funkcją). Wcześniej przekazywane null gasiło go.
          showPatientCard(event.patientId, onPick, listOptions, { activeTab: 'timeline' });
        }).catch(function (err) {
          logError('deleteSnapshot from timeline', err);
          try {
            global.alert((err && err.message)
              ? err.message
              : 'Nie udało się usunąć pomiaru.');
          } catch (_) {}
        });
      }, true));
      stripLastDivider();

      // Menu zamyka się przy kliknięciu poza nim.
      var closeOnOutside = function (ev) {
        if (menu.contains(ev.target) || (anchorBtn && anchorBtn.contains(ev.target))) return;
        menu.remove();
        global.document.removeEventListener('click', closeOnOutside, true);
      };
      // Defer registration o jedną mikrozadanie, by nie złapać bieżącego kliku.
      setTimeout(function () {
        global.document.addEventListener('click', closeOnOutside, true);
      }, 0);

      // Menu montowane na body z position:fixed (patrz _mountMeasureMenu) — nie
      // jest obcinane przez overflow przodków i nie chowa się na dole listy.
      _mountMeasureMenu(menu, anchorBtn);
    }

    function _renderSectionHeader(text) {
      return el('div', {
        style: 'font-size:0.72rem;font-weight:600;color:#5b6672;text-transform:uppercase;'
          + 'letter-spacing:0.05em;margin:18px 0 10px -28px;padding-left:28px;',
        text: text
      });
    }

    // B2 — Format daty utworzenia dla chipa kotwiczonej notatki (prawy górny róg).
    // Konwencja PL: DD-MM-RRRR. Zwraca '' dla null/nieprawidłowych dat.
    function _formatDateDDMMYYYY(iso) {
      if (!iso) return '';
      var d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      var pad = function (n) { return n < 10 ? '0' + n : String(n); };
      return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear();
    }

    // B2 (Wariant 1) — Karta kotwiczonej notatki z L-łącznikiem + wcięciem.
    // Wstawiana PO chipie Pomiar dla tego samego wieku. Visualnie „dziecko"
    // pomiaru: wcięta o 28px w prawo (poza standardową osią), SVG L-connector
    // łączy lewą krawędź notatki z lewą krawędzią pomiaru powyżej.
    // Data createdAtISO w prawym górnym rogu (format DD-MM-RRRR).
    //
    // event: typowo 'note' lub 'observation' z linkedAgeMonths != null.
    function _renderAnchoredCard(event) {
      // F1: meta z _resolveEventMeta (paleta wg kategorii notatki — patrz _renderTimelineCard).
      var meta = _resolveEventMeta(event);

      // Wrapper: relative do absolutnie pozycjonowanego SVG L-connector.
      // padding-left 36px = 8px ramienia poziomego L + 28px standardowego wcięcia osi.
      // margin-left 28px = przesunięcie chipa w prawo poza oś (tabulator).
      var wrapper = el('div', {
        style: 'position:relative;margin-bottom:14px;margin-left:28px;padding-left:36px;'
      });

      // SVG L-connector: zaczyna się od lewej krawędzi (gdzie była kropka)
      // i zagina w prawo do lewej krawędzi karty notatki.
      // Stroke w kolorze typu (kasztanowy dla notatki, niebieski dla obserwacji).
      var svgL = global.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgL.setAttribute('width', '36');
      svgL.setAttribute('height', '24');
      svgL.setAttribute('viewBox', '0 0 36 24');
      svgL.setAttribute('aria-hidden', 'true');
      svgL.style.position = 'absolute';
      svgL.style.left = '0';
      svgL.style.top = '-6px';
      svgL.style.pointerEvents = 'none';
      var pathL = global.document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathL.setAttribute('d', 'M 4 0 L 4 14 Q 4 18 8 18 L 36 18');
      pathL.setAttribute('stroke', meta.color);
      pathL.setAttribute('stroke-width', '1.2');
      pathL.setAttribute('fill', 'none');
      pathL.setAttribute('stroke-linecap', 'round');
      svgL.appendChild(pathL);
      wrapper.appendChild(svgL);

      // Karta notatki — klikalna (otwiera tab Notatki przez _handleTimelineEventClick).
      var card = el('div', {
        style: 'background:#f5fafb;border-radius:10px;padding:10px 12px;'
          + 'display:flex;flex-direction:column;gap:6px;cursor:pointer;'
          + 'transition:background 0.15s;position:relative;',
        onmouseover: function () { card.style.background = '#ebf3f5'; },
        onmouseout: function () { card.style.background = '#f5fafb'; },
        onclick: function () { _handleTimelineEventClick(event); }
      });

      // Górny rząd: badge typu (lewy) + data (prawy).
      // B3.2e: gdy notatka jest kotwiczona (linkedAgeMonths) ALE też ma datę
      // zdarzenia klinicznego (clinicalDateISO) — pokazujemy clinicalDateISO,
      // nie createdAtISO. Bez clinicalDateISO — fallback do dateISO (czyli
      // createdAtISO przez vault'owy fallback w `dateISO`).
      var topRow = el('div', {
        style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:8px;'
      });
      topRow.appendChild(el('span', {
        style: 'display:inline-block;padding:2px 8px;font-size:0.7rem;font-weight:600;color:'
          + meta.color + ';background:' + meta.bg + ';border-radius:999px;',
        text: meta.label
      }));
      var dateStr;
      if (event.clinicalDateISO) {
        // clinicalDateISO to 'YYYY-MM-DD' — dorzucamy time żeby parser działał.
        dateStr = _formatDateDDMMYYYY(event.clinicalDateISO + 'T00:00:00.000Z');
      } else {
        dateStr = _formatDateDDMMYYYY(event.dateISO);
      }
      if (dateStr) {
        topRow.appendChild(el('span', {
          style: 'font-size:0.72rem;color:#9aa8aa;white-space:nowrap;',
          text: dateStr
        }));
      }
      card.appendChild(topRow);

      // Body karty (tytuł + treść / obserwacja).
      card.appendChild(_renderTimelineEventBody(event));
      wrapper.appendChild(card);
      return wrapper;
    }

    // A (decyzja 2026-06-03) — placeholder „Pomiar usunięty".
    // Gdy pomiar o danym wieku zostanie usunięty, kotwiczona do niego notatka
    // (linkedAgeMonths) NIE może spadać na dół osi. Renderujemy wyszarzony chip
    // w miejscu wiekowym usuniętego pomiaru; pod nim (jak zwykle) idą kotwiczone
    // notatki przez _renderAnchoredCard (L-connector + wcięcie). Dzięki temu
    // notatka zachowuje pozycję na osi i nie powstaje rozjazd „notatka na dole
    // obok dużo starszego wieku".
    function _renderRemovedMeasurementPlaceholder(ageM) {
      var wrapper = el('div', { style: 'position:relative;margin-bottom:14px;' });
      // Kropka na osi — pusta, szara, przerywana (pomiar nie istnieje).
      wrapper.appendChild(el('div', {
        style: 'position:absolute;left:-22px;top:4px;width:14px;height:14px;border-radius:50%;'
          + 'background:#fff;border:2px dashed #c2ccce;box-shadow:0 0 0 1px #fff;'
      }));
      // Nagłówek wieku (jak nad chipem Pomiar, tylko wyszarzony).
      wrapper.appendChild(el('div', {
        style: 'font-size:0.7rem;color:#9aa8aa;font-weight:500;margin-bottom:3px;',
        text: 'Wiek ' + _formatAge(ageM)
      }));
      var card = el('div', {
        style: 'background:#f3f5f6;border:1px dashed #cdd6d8;border-radius:10px;'
          + 'padding:8px 12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;'
      });
      card.appendChild(el('span', {
        style: 'display:inline-block;padding:2px 8px;font-size:0.7rem;font-weight:600;'
          + 'color:#9aa8aa;background:#e8edee;border-radius:999px;',
        text: 'Pomiar usunięty'
      }));
      card.appendChild(el('span', {
        style: 'font-size:0.82rem;color:#9aa8aa;',
        text: 'Notatka zachowana — pomiar dla tego wieku został usunięty.'
      }));
      wrapper.appendChild(card);
      return wrapper;
    }

    function rebuildList() {
      // Usuń wszystkie children listWrap poza axis (axis jest [0])
      while (listWrap.childNodes.length > 1) listWrap.removeChild(listWrap.lastChild);

      // L1 — filtr OR po activeFilters. Pusty set = pokaż wszystko (równoważne
      // staremu currentFilter='all'). Inaczej event spełnia filtr jeśli pasuje
      // do JAKIEGOKOLWIEK z aktywnych identyfikatorów. Implementacja: kategorię
      // eventu derive'ujemy z eventMatchesFilter(evt, filterId) — używamy
      // istniejącej F1 logiki, tylko z OR po wielu filtrach.
      // f zachowany jako legacy alias dla branchy poniżej (isCategoryFilter
      // sprawdza single-filter cat — po L1 wciąż ważne gdy aktywna dokładnie
      // jedna kategoria-not-measurement).
      function filterAllowsEvent(evt) {
        if (activeFilters.size === 0) return true; // „Wszystko"
        var ids = Array.from(activeFilters);
        return ids.some(function (id) { return eventMatchesFilter(evt, id); });
      }
      // Tryb "category-only" (standalone lista notatek na osi czasu, bez chipów
      // Pomiar). Aktywny gdy zbiór filtrów to SAME kategorie notatek (≥1) i NIE
      // zawiera 'measurement'. Wcześniej (L1) bramka brzmiała `size === 1`, przez
      // co dwie kategorie notatek bez Pomiaru (np. Leczenie+Wynik, Kontrola+Wynik)
      // wpadały w mixedItems flow → ten flow renderuje notatki TYLKO pod chipem
      // Pomiar, a skoro 'measurement' nie był aktywny, chipów nie było → pusta
      // lista. Branch standalone (niżej) i tak obsługuje wiele kategorii przez
      // filterAllowsEvent (OR), więc wystarczy poszerzyć bramkę.
      // (activeFilters NIGDY nie zawiera 'all' — wybór „Wszystko" czyści zbiór.)
      var noteOnlyFilterMode = activeFilters.size >= 1 && !activeFilters.has('measurement');
      var f = activeFilters.size === 0 ? 'all'
            : activeFilters.size === 1 ? Array.from(activeFilters)[0]
            : 'all'; // multi → traktuj jak 'all' dla branch logic poniżej

      // ── B3.2: Mixed chronological timeline ────────────────────────────────
      // Architektura po B3.2 — jeden chronologiczny ciąg zdarzeń klinicznych:
      //   • Pomiary kotwiczone wiekiem (chip „WIEK · DATA SAVE") — sortowane po
      //     savedAtISO (proxy daty wizyty z najstarszego snapshota)
      //   • Notatki z clinicalDateISO bez linkedAgeMonths (chip „Wpis kliniczny
      //     DATA") — sortowane po clinicalDateISO
      //   • Kotwiczone notatki/observations (linkedAgeMonths != null) renderowane
      //     POD chipem Pomiar o tym samym wieku (L-connector z B2 — niezmienione)
      //   • Notatki ogólne (linkedAgeMonths=null, clinicalDateISO=null) USUNIĘTE
      //     z Historii — pojawią się w zakładce Notatki w sekcji „Notatki ogólne"
      //     (B3.3, ten plan)
      var measurements = events.filter(function (e) { return e.type === 'measurement'; });
      var notes = events.filter(function (e) { return e.type === 'note'; });
      var observations = events.filter(function (e) { return e.type === 'observation'; });

      // F1-fix2: gdy aktywny filtr to kategoria notatki (nie 'all', nie 'measurement'),
      // pomijamy mixed timeline z pomiarami i kotwicami. Renderujemy WSZYSTKIE notatki +
      // observations pasujące do kategorii jako standalone karty na chronologicznej osi.
      // Powód: notatki kotwiczone pod pomiarem są renderowane TYLKO po wyświetleniu chipa
      // Pomiar — gdy filtr ukrywa pomiary (np. 'treatment'), kotwiczone notatki znikały.
      // Naprawa: pomijamy logikę kotwicy gdy filtr to konkretna kategoria, co przy okazji
      // upraszcza wizualnie listę (sama treść, bez chipów Pomiar które i tak są odfiltrowane).
      // L1: category-only mode aktywny TYLKO gdy w secie jest dokładnie jedna
      // kategoria-not-measurement. Dla multi-select (np. Leczenie+Wynik) używamy
      // standardowego mixedItems flow (pokazujemy pomiary i pasujące notatki
      // kotwiczone). Standalone-list mode nadal sensowny tylko dla pojedynczej
      // wybranej kategorii — wtedy notatki są na osi czasu bez chipów Pomiar.
      var isCategoryFilter = noteOnlyFilterMode;
      if (isCategoryFilter) {
        var categoryItems = [];
        notes.forEach(function (n) {
          if (!filterAllowsEvent(n)) return;
          categoryItems.push({
            event: n,
            // Priorytet sortowania: clinicalDateISO > dateISO > updatedAtISO
            sortISO: n.clinicalDateISO
              ? (n.clinicalDateISO.length === 10 ? n.clinicalDateISO + 'T00:00:00.000Z' : n.clinicalDateISO)
              : (n.dateISO || n.updatedAtISO || '')
          });
        });
        observations.forEach(function (o) {
          if (!filterAllowsEvent(o)) return;
          categoryItems.push({ event: o, sortISO: o.dateISO || '' });
        });
        categoryItems.sort(function (a, b) {
          if (a.sortISO > b.sortISO) return -1;
          if (a.sortISO < b.sortISO) return 1;
          return 0;
        });

        if (categoryItems.length === 0) {
          listWrap.appendChild(el('p', {
            class: 'vilda-patient-empty-msg',
            text: 'Brak wpisów w wybranej kategorii.'
          }));
          return;
        }

        categoryItems.forEach(function (item) {
          var ev = item.event;
          var header;
          if (ev.linkedAgeMonths != null) {
            // Notatka kotwiczona wiekiem — pokaż wiek + ewentualnie datę zdarzenia
            header = _formatAge(ev.linkedAgeMonths);
            var dateStrAnchored = _formatDateDDMMYYYY(
              ev.clinicalDateISO
                ? (ev.clinicalDateISO.length === 10 ? ev.clinicalDateISO + 'T00:00:00.000Z' : ev.clinicalDateISO)
                : ev.dateISO
            );
            if (dateStrAnchored) header += ' · ' + dateStrAnchored;
          } else if (ev.clinicalDateISO) {
            // Wpis kliniczny z datą zdarzenia
            var clinDate = _formatDateDDMMYYYY(
              ev.clinicalDateISO.length === 10
                ? ev.clinicalDateISO + 'T00:00:00.000Z'
                : ev.clinicalDateISO
            );
            header = clinDate || '';
          } else {
            // Fallback — tylko data zapisu/utworzenia
            header = _formatDateDDMMYYYY(ev.dateISO) || '';
          }
          listWrap.appendChild(_renderTimelineCard(ev, header, 'normal'));
        });
        return;
      }

      // Kotwiczone events (zindeksowane po ageMonths) — renderowane POD chipem
      // Pomiar o tym wieku (zachowanie z B2). NIE są w głównym chronologicznym
      // sortowaniu — należą do swojego pomiaru.
      var anchoredByAge = Object.create(null);
      function _addAnchored(evt) {
        var key = evt.linkedAgeMonths;
        if (key == null) return;
        if (!anchoredByAge[key]) anchoredByAge[key] = [];
        anchoredByAge[key].push(evt);
      }
      notes.forEach(function (n) { if (n.linkedAgeMonths != null) _addAnchored(n); });
      observations.forEach(function (o) { _addAnchored(o); });

      // J3 — Historia = tylko pomiary biologiczne (oś czasu wieku pacjenta).
      //
      // Decyzja semantyczna: Historia pokazuje WYŁĄCZNIE pomiary historyczne
      // posortowane po ageMonths DESC (wiek pacjenta w momencie pomiaru).
      // Kotwiczone notatki (linkedAgeMonths != null) renderowane są pod swoim
      // chipem Pomiar (anchoredByAge, niżej). Luźne notatki kliniczne
      // (clinicalDateISO bez kotwicy) NIE pojawiają się w Historii — są
      // widoczne w zakładce Notatki, sub-sekcja „Notatki kliniczne".
      //
      // Powód: data zapisu (savedAtISO) to metadane operacyjne, nie chronologia
      // biologiczna. Sortowanie po savedAtISO powodowało że nowo dodany pomiar
      // (np. 6y2m, wpisany dziś) wskakiwał nad istniejący starszy biologicznie
      // (np. 12y1m, wpisany 2 miesiące temu) — bo dzisiaj > 2 miesiące temu.
      // Dla pomiarów naturalną osią czasu jest wiek pacjenta.
      var mixedItems = [];
      measurements.forEach(function (m) {
        if (filterAllowsEvent(m)) {
          mixedItems.push({
            kind: 'measurement',
            event: m,
            // sortISO zostaje dla informacji (chip pokazuje datę zapisu),
            // ale sortowanie używa ageMonths jako primary.
            sortISO: m.savedAtISO || ''
          });
        }
      });
      // A (decyzja 2026-06-03) — osierocone kotwice WPINANE W OŚ wg wieku.
      // Notatka z linkedAgeMonths, której pomiar usunięto, dostaje tu syntetyczny
      // slot (kind:'orphan-anchor') o tym samym ageMonths, więc trafia w prawidłową
      // pozycję sortu (DESC po wieku) — zamiast spadać na dół listy. Wstawiamy
      // tylko gdy istnieje co najmniej jedna kotwiczona notatka widoczna w filtrze.
      Object.keys(anchoredByAge).forEach(function (ageKey) {
        var ageM = Number(ageKey);
        var hasMatchingMeas = measurements.some(function (m) { return m.ageMonths === ageM; });
        if (hasMatchingMeas) return;
        var anyVisible = anchoredByAge[ageKey].some(function (evt) { return filterAllowsEvent(evt); });
        if (!anyVisible) return;
        mixedItems.push({ kind: 'orphan-anchor', event: { ageMonths: ageM }, sortISO: '' });
      });

      mixedItems.sort(function (a, b) {
        // J3 PRIMARY: ageMonths DESC. Większy wiek = nowszy biologicznie = wyżej.
        var aAge = (a.event && typeof a.event.ageMonths === 'number') ? a.event.ageMonths : -1;
        var bAge = (b.event && typeof b.event.ageMonths === 'number') ? b.event.ageMonths : -1;
        if (aAge > bAge) return -1;
        if (aAge < bAge) return 1;
        // Tie-breaker (rzadki: dwa pomiary o tym samym wieku): sortISO DESC,
        // żeby nowszy zapis był wyżej. To po prostu deterministyczna kolejność
        // dla edge case'ów — nie wpływa na semantykę biologiczną.
        if (a.sortISO > b.sortISO) return -1;
        if (a.sortISO < b.sortISO) return 1;
        return 0;
      });

      // Empty state — gdy mixed lista + osierocone kotwice są puste w obecnym filtrze.
      var anchoredHasAnyVisible = Object.keys(anchoredByAge).some(function (k) {
        return anchoredByAge[k].some(function (evt) { return filterAllowsEvent(evt); });
      });
      if (mixedItems.length === 0 && !anchoredHasAnyVisible) {
        listWrap.appendChild(el('p', {
          class: 'vilda-patient-empty-msg',
          text: f === 'all'
            ? 'Brak wydarzeń w historii. Dodaj pomiar lub notatkę z datą zdarzenia, aby zobaczyć timeline.'
            : 'Brak wydarzeń tego typu.'
        }));
        return;
      }

      // Render mixed timeline. Dla każdego pomiaru — od razu pod chipem rzucamy
      // kotwiczone notatki/obserwacje (jak po B2 — L-connector + indent).
      mixedItems.forEach(function (item) {
        if (item.kind === 'measurement') {
          var m = item.event;
          // Nagłówek chipa Pomiar: WIEK + DATA (savedAtISO sformatowana DD-MM-RRRR).
          // Bez daty — sam wiek (legacy/safety-net).
          var header = _formatAge(m.ageMonths);
          var dateStr = _formatDateDDMMYYYY(m.savedAtISO);
          if (dateStr) header += ' · ' + dateStr;
          listWrap.appendChild(_renderTimelineCard(m, header, 'normal'));
          // Pod chipem — kotwiczone notatki/observations dla tego wieku.
          var anchored = anchoredByAge[m.ageMonths] || [];
          anchored.forEach(function (a) {
            if (filterAllowsEvent(a)) {
              listWrap.appendChild(_renderAnchoredCard(a));
            }
          });
        } else if (item.kind === 'orphan-anchor') {
          // A: usunięty pomiar — wyszarzony placeholder w pozycji wiekowej,
          // pod nim kotwiczone notatki (te same _renderAnchoredCard co pod pomiarem).
          var om = item.event.ageMonths;
          listWrap.appendChild(_renderRemovedMeasurementPlaceholder(om));
          var orphanAnchored = anchoredByAge[om] || [];
          orphanAnchored.forEach(function (a) {
            if (filterAllowsEvent(a)) {
              listWrap.appendChild(_renderAnchoredCard(a));
            }
          });
        }
        // Opcja A (J3): mixedItems zawiera WYŁĄCZNIE pomiary (kind:'measurement') —
        // jedyny mixedItems.push wstawia 'measurement'. Notatki luźne kliniczne
        // (clinicalDateISO bez kotwicy) NIE są na głównej osi: widać je w zakładce
        // Notatki („Notatki kliniczne") oraz w Historii po wybraniu ich kategorii
        // (gałąź standalone wyżej). Dawna gałąź 'clinical-note' (mixed timeline z
        // B3.2) została usunięta — po J3 nic nie produkowało tego rodzaju, była
        // martwym kodem mylącym przy czytaniu (sugerowała render, który nie zachodził).
      });

      // (A 2026-06-03) Dawny dolny dump osieroconych kotwic USUNIĘTY — teraz
      // wpinają się w oś wg wieku przez mixedItems (kind:'orphan-anchor', wyżej).
    }

    function _handleTimelineEventClick(event) {
      // Per Q4 — Pomiar → tab Siatki; Notatka → tab Notatki; reszta → placeholder modal.
      try {
        var screen = global.document.querySelector('.vilda-auth-patient-card');
        if (event.type === 'measurement') {
          var tab = screen && screen.querySelector('[data-tab="traj"]');
          if (tab && typeof tab.click === 'function') tab.click();
        } else if (event.type === 'note') {
          var tabN = screen && screen.querySelector('button[data-tab="notes"]');
          if (tabN && typeof tabN.click === 'function') tabN.click();
        } else {
          // observation/lab/medication/gh-therapy — placeholder
          try { global.alert(event.title + (event.description ? '\n\n' + event.description : '')); } catch (_) {}
        }
      } catch (e) { logError('handleTimelineEventClick', e); }
    }

    rebuildList();
    void reRender;
  }

  // ============ LISTA PACJENTÓW — helpers sortowania ============

  var _PSORT_KEY = 'vilda:patients-sort';
  var _PSORT_OPTIONS = [
    { id: 'recent-desc', label: 'Ostatnio zapisany',  sub: 'od najnowszego' },
    { id: 'name-asc',    label: 'Imię A → Z',         sub: null },
    { id: 'name-desc',   label: 'Imię Z → A',         sub: null }
  ];
  function _readPSort() {
    try { return (global.localStorage && global.localStorage.getItem(_PSORT_KEY)) || 'recent-desc'; } catch (_) { return 'recent-desc'; }
  }
  function _writePSort(id) {
    try { if (global.localStorage) global.localStorage.setItem(_PSORT_KEY, id); } catch (_) {}
  }
  function _applyPSort(arr, id) {
    const a = arr.slice();
    if (id === 'name-asc') {
      a.sort(function (x, y) {
        const nx = ((x.header && x.header.name) || '').toLowerCase();
        const ny = ((y.header && y.header.name) || '').toLowerCase();
        return nx < ny ? -1 : nx > ny ? 1 : 0;
      });
    } else if (id === 'name-desc') {
      a.sort(function (x, y) {
        const nx = ((x.header && x.header.name) || '').toLowerCase();
        const ny = ((y.header && y.header.name) || '').toLowerCase();
        return nx > ny ? -1 : nx < ny ? 1 : 0;
      });
    } else if (id === 'visits-desc') {
      a.sort(function (x, y) { return ((y.snapshotCount || 0) - (x.snapshotCount || 0)); });
    } else { // recent-desc (domyślne)
      a.sort(function (x, y) {
        const tx = x.lastSavedAtISO ? Date.parse(x.lastSavedAtISO) : 0;
        const ty = y.lastSavedAtISO ? Date.parse(y.lastSavedAtISO) : 0;
        return (ty || 0) - (tx || 0);
      });
    }
    return a;
  }

  // ============ LISTA PACJENTÓW ============
  async function showPatientsList(onPick, options) {
    const V = getVault();
    if (!V || !V.isUnlocked()) return;
    const opts = options || {};

    // Cloud-only: pacjenci ładowani z chmury w tle przy logowaniu. Jeśli sync
    // jeszcze nie skończył gdy user wchodzi na listę, pokazujemy overlay
    // (lista byłaby pusta). Po complete overlay znika sam → kontynuujemy render.
    try {
      const C = global.VildaChrome;
      if (C && typeof C.isCloudOnlySyncInProgress === 'function' && C.isCloudOnlySyncInProgress()) {
        if (typeof C.showCloudOnlySyncOverlay === 'function') C.showCloudOnlySyncOverlay();
        try {
          await C.waitForCloudOnlySync();
          if (typeof C.hideCloudOnlySyncOverlay === 'function') C.hideCloudOnlySyncOverlay();
        } catch (_) {
          // Failed event — overlay przeszedł w error state (chrome.js obsługuje).
          // Zostawiamy go widocznym, user zdecyduje (retry/logout). Przerywamy
          // showPatientsList, bo lista i tak byłaby pusta.
          return;
        }
      }
    } catch (_) { void _; }

    let patients = [];
    try { patients = await V.listPatients(); } catch (e) { logError('listPatients', e); }

    let currentSort = _readPSort();
    patients = _applyPSort(patients, currentSort);

    const title = el('h2', { class: 'vilda-auth-title', text: 'Pacjenci' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: patients.length === 0
        ? 'Nie masz jeszcze zapisanych pacjentów. Wpisz dane w aplikacji i kliknij „Zapisz dane”.'
        : 'Kliknij pacjenta, aby zobaczyć jego kartę. Łącznie: ' + patients.length + (patients.length === 1 ? ' pacjent.' : ' pacjentów.')
    });

    // Pole wyszukiwarki — pokazujemy tylko gdy są jakiekolwiek dane do filtrowania.
    let searchInput = null;
    let resultsCounter = null;
    if (patients.length > 0) {
      searchInput = el('input', {
        class: 'vilda-auth-search-input',
        type: 'search',
        placeholder: 'Szukaj pacjenta po imieniu lub nazwisku…',
        autocomplete: 'off',
        spellcheck: 'false'
      });
      resultsCounter = el('div', { class: 'vilda-auth-search-counter' });
    }

    // Scrollowalny kontener listy — max ~3 karty widocznych, reszta pod scrollem.
    const list = el('div', { class: 'vilda-auth-user-list vilda-auth-patients-scroll' });
    const emptyResult = el('div', { class: 'vilda-auth-search-empty', text: 'Brak pasujących pacjentów.' });
    emptyResult.hidden = true;
    list.appendChild(emptyResult);

    // Trzymamy referencje do par (card, normalizedName) dla szybkiego filtrowania.
    const cards = [];

    // Buduje kartę pacjenta i dodaje ją do listy + tablicy cards.
    // Wydzielona jako funkcja, żeby można ją wywołać ponownie po zmianie sortowania.
    function buildCard(p) {
      const headerName = (p.header && p.header.name) ? p.header.name : '(bez imienia)';
      // B1.9: Usuwamy „Zapisano: 3 tyg. temu" i „1 wpis" — ta meta odnosiła się do
      // snapshotów vault (data zapisu w bazie), a nie do wizyt/pomiarów pacjenta.
      // Lista pacjentów ma teraz tylko wiek pacjenta (formatowany _formatAge) + płeć.
      // Sortowanie po lastSavedAtISO DESC zostaje jako default (ostatnio aktywni
      // pierwsi), ale sama data nie jest pokazywana użytkownikowi.
      const hAge = (p.header && typeof p.header.age === 'number' && isFinite(p.header.age)) ? p.header.age : null;
      const hAgeM = (p.header && typeof p.header.ageMonths === 'number' && isFinite(p.header.ageMonths)) ? p.header.ageMonths : null;
      let ageStr = '';
      if (hAge !== null || hAgeM !== null) {
        const totalMo = (hAge !== null ? hAge * 12 : 0) + (hAgeM !== null ? hAgeM : 0);
        ageStr = _formatAge(totalMo);
      }
      const sexStr = (p.header && p.header.sex) ? p.header.sex : '';
      const meta = [ageStr, sexStr].filter(function (x) { return x && x.length; }).join(' · ');

      const card = el('button', {
        class: 'vilda-auth-user-card',
        type: 'button',
        title: 'Zobacz kartę: ' + headerName,
        onclick: function () { showPatientCard(p.patientId, onPick, opts); }
      }, [
        el('div', { class: 'vilda-auth-user-avatar', text: headerName.charAt(0).toUpperCase() }),
        el('div', { class: 'vilda-auth-user-info' }, [
          el('div', { class: 'vilda-auth-user-name', text: headerName }),
          meta ? el('div', { class: 'vilda-auth-user-meta', text: meta }) : null
        ]),
        el('span', { class: 'vilda-auth-user-arrow', 'aria-hidden': 'true', text: '›' })
      ]);
      list.appendChild(card);
      cards.push({ card: card, key: normalizeForSearch(headerName) });
    }

    patients.forEach(buildCard);

    function updateCounter(visibleCount) {
      if (!resultsCounter) return;
      resultsCounter.textContent = visibleCount === patients.length
        ? ''
        : 'Pokazano ' + visibleCount + ' z ' + patients.length;
    }

    function applyFilter() {
      if (!searchInput) return;
      const q = normalizeForSearch(searchInput.value || '');
      let visible = 0;
      cards.forEach(function (entry) {
        const match = !q || entry.key.indexOf(q) !== -1;
        entry.card.hidden = !match;
        if (match) visible++;
      });
      emptyResult.hidden = visible !== 0;
      updateCounter(visible);
    }

    if (searchInput) {
      searchInput.addEventListener('input', applyFilter);
      // Esc czyści pole bez zamykania całego ekranu.
      searchInput.addEventListener('keydown', function (e) {
        if (e && e.key === 'Escape' && searchInput.value) {
          e.stopPropagation();
          searchInput.value = '';
          applyFilter();
        }
      });
      // Auto-fokus po otwarciu — szybkie wpisanie nazwiska bez klikania w pole.
      setTimeout(function () { try { searchInput.focus(); } catch (_) {} }, 60);
    }

    // ── Ikonka sortowania w wierszu z wyszukiwarką (tylko gdy są pacjenci) ──────
    let sortWrap = null;
    if (patients.length > 0) {
      const sortDropdown = el('div', { class: 'vilda-auth-sort-dropdown' });
      sortDropdown.hidden = true;
      let _outsideListener = null;

      function closeSortDropdown() {
        sortDropdown.hidden = true;
        sortBtn.classList.remove('vilda-auth-sort-btn--open');
        if (_outsideListener) {
          global.document.removeEventListener('click', _outsideListener, true);
          _outsideListener = null;
        }
      }

      _PSORT_OPTIONS.forEach(function (opt) {
        const optEl = el('button', {
          type: 'button',
          class: 'vilda-auth-sort-option' + (opt.id === currentSort ? ' vilda-auth-sort-option--active' : '')
        }, [
          el('span', { class: 'vilda-auth-sort-option-label', text: opt.label }),
          opt.sub ? el('span', { class: 'vilda-auth-sort-option-sub', text: opt.sub }) : null
        ]);
        optEl.addEventListener('click', function () {
          if (opt.id === currentSort) { closeSortDropdown(); return; }
          currentSort = opt.id;
          _writePSort(opt.id);
          // Zaktualizuj wizualny stan aktywnej opcji
          sortDropdown.querySelectorAll('.vilda-auth-sort-option').forEach(function (o) {
            o.classList.toggle('vilda-auth-sort-option--active', o === optEl);
          });
          // Przetasuj i odbuduj karty
          const sorted = _applyPSort(patients, currentSort);
          list.innerHTML = '';
          list.appendChild(emptyResult);
          cards.length = 0;
          sorted.forEach(buildCard);
          applyFilter();
          list.scrollTop = 0;
          closeSortDropdown();
        });
        sortDropdown.appendChild(optEl);
      });

      const sortBtn = el('button', {
        type: 'button',
        class: 'vilda-auth-sort-btn',
        title: 'Zmień sortowanie'
      });
      sortBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!sortDropdown.hidden) { closeSortDropdown(); return; }
        sortDropdown.hidden = false;
        sortBtn.classList.add('vilda-auth-sort-btn--open');
        // Zamknij przy kliknięciu poza elementem (defer o jeden tick)
        setTimeout(function () {
          _outsideListener = function (ev) {
            if (!sortDropdown.contains(ev.target) && ev.target !== sortBtn) {
              closeSortDropdown();
            }
          };
          global.document.addEventListener('click', _outsideListener, true);
        }, 0);
      });

      sortWrap = el('div', { class: 'vilda-auth-sort-wrap' }, [sortBtn, sortDropdown]);
    }

    const importBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: 'Importuj kopie pacjentów',
      onclick: function () { showImportPatientsFlow(onPick); }
    });

    const cancel = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: 'Anuluj',
      onclick: function () { hide(); }
    });

    const children = [title, sub];
    if (searchInput) {
      children.push(el('div', { class: 'vilda-auth-search-wrap' }, [searchInput, sortWrap, resultsCounter]));
    }
    children.push(list);
    children.push(el('div', { class: 'vilda-auth-actions' }, [cancel, importBtn]));

    open(el('div', { class: 'vilda-auth-screen vilda-auth-patients' }, children), { noLogo: true });
  }

  // Normalizuje string do filtrowania: lowercase + usunięcie polskich diakrytyków,
  // żeby "anna" znalazła "Anna", "aŃka" itd. niezależnie od ogonków.
  function normalizeForSearch(s) {
    if (!s) return '';
    var str = String(s).toLowerCase();
    try { str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    // ł → l (NFD nie ma rozkładu dla ł)
    return str.replace(/ł/g, 'l');
  }

  // ============ IMPORT PLIKÓW .vilda ============
  // Ścieżka recovery: użytkownik wczyta zaszyfrowane pliki kopii zapasowych
  // i zaimportuje pacjentów do swojego aktualnego konta. Pliki mogą pochodzić
  // z TEGO samego konta (deszyfracja transparentna) albo ze STAREGO konta
  // (potrzebne hasło, którym plik został wygenerowany).
  function showImportPatientsFlow(onPickAfterImport, options) {
    const opts = options || {};
    const fromSetup = !!opts.fromSetup;
    const V = getVault();
    if (!V || !V.isUnlocked()) return;

    const title = el('h2', { class: 'vilda-auth-title', text: 'Importuj kopie pacjentów' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Wybierz pliki kopii zapasowych pacjentów. Aplikacja odczyta nagłówki, a Ty zdecydujesz, które konta zaimportować do swojego vaultu. Jeśli pliki pochodzą ze starego konta — podaj hasło, którym były zaszyfrowane.'
    });

    const fileInput = el('input', {
      type: 'file',
      // Akceptujemy:
      //   .wiw — nowe pliki kopii pacjentów (zaszyfrowane envelope)
      //   .vilda — wczesne testy (zaszyfrowane envelope, wsteczna kompatybilność)
      //   .json — płaskie pliki sprzed wprowadzenia szyfrowania (legacy)
      accept: '*/*', // iOS nie obsługuje .wiw/.vilda bez UTI — accept=* pokazuje wszystkie pliki
      multiple: 'multiple',
      style: 'display:none;'
    });

    const pwInput = el('input', {
      type: 'password',
      class: 'vilda-auth-input',
      placeholder: 'Hasło ze starego konta (jeśli inne niż obecne)',
      autocomplete: 'off'
    });

    const pickBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Wybierz pliki kopii (.wiw)',
      onclick: function () { fileInput.click(); }
    });

    // Toolbar nad listą: licznik + zaznacz/odznacz wszystkie
    const countLabel = el('span', { text: '' });
    const selectAllLink = el('a', { href: '#', text: 'Zaznacz wszystkie' });
    const deselectAllLink = el('a', { href: '#', text: 'Odznacz wszystkie' });
    selectAllLink.addEventListener('click', function (ev) { ev.preventDefault(); selectAllFiles(true); });
    deselectAllLink.addEventListener('click', function (ev) { ev.preventDefault(); selectAllFiles(false); });
    // Toolbar trzymamy zawsze w layoucie — sterowanie przez data-hidden + visibility,
    // żeby pojawienie się/zniknięcie nie powodowało reflowu strony.
    const toolbar = el('div', { class: 'vilda-auth-import-toolbar', 'data-hidden': '1' }, [
      countLabel,
      el('div', { class: 'vilda-auth-import-toolbar-actions' }, [selectAllLink, deselectAllLink])
    ]);

    const previewBox = el('div', { class: 'vilda-auth-import-list' });
    const reportBox = el('div', { class: 'vilda-auth-info', style: 'display:none; text-align:left;' });
    // errBox z stałą rezerwacją miejsca — gdy pusty, schowany przez visibility (nie reflow)
    const errBox = el('div', { class: 'vilda-auth-error vilda-auth-error-stable', 'data-empty': '1' });

    const importBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Importuj wszystko'
    });
    importBtn.disabled = true;

    const back = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: fromSetup ? 'Pomiń import' : 'Wstecz',
      onclick: function () {
        if (fromSetup) { hide(); startIdleWatch(); }
        else { showStartupScreen(); }
      }
    });

    let selectedFiles = []; // [{file, text, preview, willImport}]

    function clearPreview() { while (previewBox.firstChild) previewBox.removeChild(previewBox.firstChild); }

    function setErr(msg) {
      if (msg) {
        errBox.textContent = msg;
        errBox.removeAttribute('data-empty');
      } else {
        errBox.textContent = '';
        errBox.setAttribute('data-empty', '1');
      }
    }

    function selectAllFiles(flag) {
      let changed = false;
      selectedFiles.forEach(function (entry) {
        const ok = !!(entry.preview && entry.preview.header);
        if (ok && entry.willImport !== flag) {
          entry.willImport = flag;
          if (entry._checkbox) entry._checkbox.checked = flag;
          changed = true;
        }
      });
      if (changed) updateImportButton();
    }

    function updateImportButton() {
      const okCount = selectedFiles.filter(function (e) { return e.preview && e.preview.header; }).length;
      const selectedCount = selectedFiles.filter(function (e) { return e.willImport; }).length;
      importBtn.disabled = selectedCount === 0;
      if (okCount === 0) {
        importBtn.textContent = 'Importuj zaznaczone';
        toolbar.setAttribute('data-hidden', '1');
        return;
      }
      toolbar.removeAttribute('data-hidden');
      countLabel.textContent = 'Wybrane: ' + selectedCount + ' z ' + okCount + (okCount !== selectedFiles.length ? (' (pliki bez hasła pominięto)') : '');
      // dynamiczny tekst przycisku
      if (selectedCount === okCount) {
        importBtn.textContent = okCount === 1 ? 'Importuj' : ('Importuj wszystko (' + okCount + ')');
      } else {
        importBtn.textContent = 'Importuj zaznaczone (' + selectedCount + ')';
      }
      // disable/enable links
      if (selectedCount === okCount) {
        selectAllLink.setAttribute('aria-disabled', 'true');
      } else {
        selectAllLink.removeAttribute('aria-disabled');
      }
      if (selectedCount === 0) {
        deselectAllLink.setAttribute('aria-disabled', 'true');
      } else {
        deselectAllLink.removeAttribute('aria-disabled');
      }
    }

    async function readFileAsText(file) {
      return new Promise(function (resolve, reject) {
        const reader = new global.FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsText(file, 'utf-8');
      });
    }

    // Marker bieżącej operacji refreshPreview — żeby anulować nakładające się
    // wywołania (debounce hasła może wystrzelić nowe wywołanie zanim poprzednie
    // skończy await PBKDF2 dla wszystkich plików).
    let refreshSeq = 0;

    async function refreshPreview() {
      const mySeq = ++refreshSeq;

      // zachowanie fokusu i pozycji kursora w polu hasła + scrollu listy
      const doc = global.document;
      const wasPwFocused = doc && doc.activeElement === pwInput;
      const cursorPos = wasPwFocused && pwInput.selectionStart != null ? pwInput.selectionStart : null;
      const scrollTopBefore = previewBox.scrollTop;

      setErr('');
      reportBox.style.display = 'none';
      importBtn.disabled = true;

      if (selectedFiles.length === 0) {
        clearPreview();
        toolbar.style.display = 'none';
        if (wasPwFocused) { try { pwInput.focus(); } catch (_) {} }
        return;
      }
      const password = pwInput.value || '';

      // 1) Asynchronicznie zbieramy preview do każdego entry — NIE rusznamy
      //    na razie zawartości previewBox (lista zostaje stara aż gotowe).
      let anyOk = false;
      let anyNeedsPwd = false;
      for (let i = 0; i < selectedFiles.length; i += 1) {
        const entry = selectedFiles[i];
        let preview = null;
        let errMsg = null;
        let isLegacy = false;
        let legacyPayload = null;

        // Najpierw sprawdzamy czy to PŁASKI JSON (sprzed wprowadzenia
        // szyfrowania). Taki plik jest niezaszyfrowany — odczytujemy
        // bezpośrednio bez hasła.
        try {
          const parsed = JSON.parse(entry.text);
          if (V.looksLikeLegacyPayload && V.looksLikeLegacyPayload(parsed)) {
            isLegacy = true;
            legacyPayload = parsed;
            preview = {
              header: {
                name: parsed.name,
                age: parsed.user && parsed.user.age,
                ageMonths: parsed.user && parsed.user.ageMonths,
                sex: parsed.user && parsed.user.sex,
                timestampISO: parsed.timestampISO || null
              },
              metadata: { legacy: true, version: parsed.version || 'pre-szyfrowanie' },
              needsPassword: false,
              methodUsed: 'legacy-json'
            };
          }
        } catch (_) { /* nie JSON / nie legacy — spróbujemy envelope */ }

        if (!isLegacy) {
          // Sprawdź czy to vault-backup zanim wywołamy previewPatientEnvelope
          // (które rzuciłoby błąd dla kind=vault-backup).
          let detectedKind = null;
          try {
            const C = global.VildaCrypto;
            if (C && C.parseEnvelope) {
              const env = C.parseEnvelope(entry.text);
              detectedKind = env.kind || null;
              if (detectedKind === 'vault-backup') {
                entry.isVaultBackup = true;
                entry.vaultBackupMeta = env.metadata || {};
              }
            }
          } catch (_) {}

          if (!entry.isVaultBackup) {
            try {
              preview = await V.previewPatientEnvelope(entry.text, password);
            } catch (e) {
              errMsg = e && e.message ? e.message : String(e);
            }
          }
        }

        entry.preview = preview;
        entry.errMsg = errMsg;
        entry.isLegacy = isLegacy;
        entry.legacyPayload = legacyPayload;
        if (preview && preview.header) anyOk = true;
        if (preview && preview.needsPassword) anyNeedsPwd = true;
      }

      // 2) Jeżeli w międzyczasie wystartował nowy refresh (user wpisał kolejny
      //    znak), przerywamy — niech ten nowszy zaktualizuje DOM. Bez tego
      //    nakładające się asynchroniczne wątki czyściłyby listę naprzemiennie.
      if (mySeq !== refreshSeq) return;

      // 3) Buduj wszystkie karty w DocumentFragment, NIE w previewBox.
      const fragment = doc.createDocumentFragment();
      selectedFiles.forEach(function (entry, idx) {
        // ── Specjalna karta dla pliku vault-backup ──────────────────────────
        if (entry.isVaultBackup) {
          const meta      = entry.vaultBackupMeta || {};
          const backupLbl = meta.label || 'Kopia konta';
          const pCount    = meta.patientCount != null ? meta.patientCount : '?';
          const sCount    = meta.snapshotCount != null ? meta.snapshotCount : '?';
          const expAt     = meta.exportedAtISO ? formatRelativeISO(meta.exportedAtISO) : '';

          const mergeBtn = el('button', {
            class: 'vilda-auth-btn vilda-auth-btn-primary vilda-auth-btn-small',
            type:  'button',
            text:  'Scal z moim kontem →'
          });
          mergeBtn.addEventListener('click', function () {
            showMergeAccountFlow(entry.text, entry.file.name);
          });

          const card = el('div', { class: 'vilda-auth-import-card vilda-auth-import-card-backup' }, [
            el('div', { class: 'vilda-auth-import-card-avatar', text: '🗂', style: 'font-size:1.4rem;' }),
            el('div', { class: 'vilda-auth-import-card-info' }, [
              el('div', { class: 'vilda-auth-import-card-name' }, [
                el('span', { text: backupLbl }),
                el('span', {
                  style: 'margin-left:8px; font-size:0.72rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#00838d; background:rgba(0,131,141,0.1); padding:1px 7px; border-radius:20px;',
                  text: 'KOPIA KONTA'
                })
              ]),
              el('div', { class: 'vilda-auth-import-card-meta',
                // B1.10: „wizyt" → „zapisów" — snapshotCount to liczba zapisów vaulta,
                // nie liczba wizyt pacjentów.
                text: pCount + ' pacj. · ' + sCount + ' zapisów' + (expAt ? ' · eksport: ' + expAt : '') }),
              el('div', { class: 'vilda-auth-import-card-filename', text: entry.file.name })
            ]),
            el('div', { class: 'vilda-auth-import-card-check' }, [mergeBtn])
          ]);
          fragment.appendChild(card);
          return; // nie budujemy standardowej karty dla tego wpisu
        }

        const ok = !!(entry.preview && entry.preview.header);
        const headerName = ok ? entry.preview.header.name : null;
        const ageStr = ok && entry.preview.header.age != null ? (entry.preview.header.age + ' lat') : '';
        const sexStr = ok && entry.preview.header.sex ? entry.preview.header.sex : '';
        const exportedAt = ok && entry.preview.metadata && entry.preview.metadata.exportedAtISO
          ? formatRelativeISO(entry.preview.metadata.exportedAtISO)
          : '';
        const savedAt = ok && entry.preview.header.timestampISO
          ? formatRelativeISO(entry.preview.header.timestampISO)
          : '';

        let metaText;
        if (ok) {
          const parts = [];
          if (entry.isLegacy) parts.push('plik z poprzedniej wersji (niezaszyfrowany .json)');
          if (ageStr) parts.push(ageStr);
          if (sexStr) parts.push(sexStr);
          if (exportedAt) parts.push('eksport: ' + exportedAt);
          else if (savedAt) parts.push('zapisano: ' + savedAt);
          metaText = parts.join(' · ');
        } else if (entry.preview && entry.preview.needsPassword) {
          metaText = 'plik chroniony hasłem — wpisz hasło powyżej';
        } else {
          metaText = entry.errMsg || 'błąd odczytu';
        }

        const checkbox = el('input', { type: 'checkbox' });
        checkbox.checked = ok;
        checkbox.disabled = !ok;
        checkbox.addEventListener('change', function () {
          entry.willImport = !!checkbox.checked;
          updateImportButton();
        });
        entry.willImport = checkbox.checked;
        entry._checkbox = checkbox;

        const card = el('div', {
          class: 'vilda-auth-import-card',
          'data-disabled': ok ? '' : '1',
          onclick: function (ev) {
            // klik gdziekolwiek na karcie (poza checkboxem) zaznacza/odznacza
            if (!ok || ev.target === checkbox) return;
            checkbox.checked = !checkbox.checked;
            entry.willImport = !!checkbox.checked;
          }
        }, [
          el('div', { class: 'vilda-auth-import-card-avatar', text: (headerName || '?').charAt(0).toUpperCase() }),
          el('div', { class: 'vilda-auth-import-card-info' }, [
            el('div', { class: 'vilda-auth-import-card-name', text: headerName || '(plik chroniony hasłem)' }),
            metaText ? el('div', { class: 'vilda-auth-import-card-meta', text: metaText }) : null,
            el('div', { class: 'vilda-auth-import-card-filename', text: entry.file.name })
          ]),
          el('div', { class: 'vilda-auth-import-card-check' }, [checkbox])
        ]);
        fragment.appendChild(card);
      });

      // 4) Atomic swap — jednym razem podmieniamy zawartość previewBox.
      //    Brak okresu „pusta lista przed gotowymi kartami" → brak skoku layoutu.
      while (previewBox.firstChild) previewBox.removeChild(previewBox.firstChild);
      previewBox.appendChild(fragment);

      updateImportButton();
      // Globalny komunikat „Niektóre pliki są chronione hasłem" usunięty:
      // pojawiał się i znikał przy każdym debounce hasła, powodując skoki
      // viewportu. Per-karta w meta jest wystarczająco czytelne („plik
      // chroniony hasłem — wpisz hasło powyżej").

      // przywróć scroll i fokus pwInput
      previewBox.scrollTop = scrollTopBefore;
      if (wasPwFocused) {
        try {
          pwInput.focus();
          if (cursorPos != null && typeof pwInput.setSelectionRange === 'function') {
            pwInput.setSelectionRange(cursorPos, cursorPos);
          }
        } catch (_) {}
      }
    }

    fileInput.addEventListener('change', async function (ev) {
      const fileList = ev.target.files || [];
      if (!fileList.length) return;
      setBusy(true);
      try {
        selectedFiles = [];
        for (let i = 0; i < fileList.length; i += 1) {
          const f = fileList[i];
          const text = await readFileAsText(f);
          selectedFiles.push({ file: f, text: text, preview: null, willImport: false, errMsg: null });
        }
        await refreshPreview();
      } catch (e) {
        setErr('Błąd odczytu plików: ' + (e && e.message ? e.message : e));
      } finally {
        setBusy(false);
        fileInput.value = '';
      }
    });

    let pwChangeTimer = null;
    pwInput.addEventListener('input', function () {
      if (pwChangeTimer) global.clearTimeout(pwChangeTimer);
      pwChangeTimer = global.setTimeout(function () { refreshPreview(); }, 350);
    });

    importBtn.addEventListener('click', async function () {
      setErr('');
      const toImport = selectedFiles.filter(function (e) { return e.willImport && e.preview && e.preview.header; });
      if (toImport.length === 0) {
        setErr('Nie zaznaczono żadnego pliku do importu.');
        return;
      }
      setBusy(true);
      const summary = {
        addedPatients: 0,
        mergedPatients: 0,
        addedSnapshots: 0,
        skippedSnapshots: 0,
        legacyImported: 0,
        errors: []
      };
      try {
        for (let i = 0; i < toImport.length; i += 1) {
          const entry = toImport[i];
          try {
            if (entry.isLegacy && entry.legacyPayload) {
              // Stary płaski JSON — savePatient sam zrobi dedup po imieniu+wieku.
              const result = await V.importLegacyJsonPatient(entry.legacyPayload);
              if (result.isNew) summary.addedPatients += 1; else summary.mergedPatients += 1;
              summary.addedSnapshots += 1; // savePatient zawsze dodaje 1 nowy snapshot
              summary.legacyImported += 1;
            } else {
              const result = await V.importPatientFromEnvelope(entry.text, pwInput.value || '');
              if (result.isNew) summary.addedPatients += 1; else summary.mergedPatients += 1;
              summary.addedSnapshots += result.addedSnapshots;
              summary.skippedSnapshots += result.skippedSnapshots;
            }
          } catch (e) {
            summary.errors.push({ file: entry.file.name, message: (e && e.message) || String(e) });
          }
        }
      } finally {
        setBusy(false);
      }

      // Pokaż raport
      while (reportBox.firstChild) reportBox.removeChild(reportBox.firstChild);
      reportBox.style.display = 'block';
      const lines = [
        'Nowych pacjentów: ' + summary.addedPatients,
        'Zaktualizowanych (merge): ' + summary.mergedPatients,
        // B1.10: „Nowych wpisów z wizyt" → „Nowych zapisów" (import legacy plików).
        'Nowych zapisów: ' + summary.addedSnapshots,
        'Pominiętych (już istniały): ' + summary.skippedSnapshots
      ];
      if (summary.legacyImported > 0) {
        lines.push('W tym ze starszych plików .json (sprzed szyfrowania): ' + summary.legacyImported);
      }
      if (summary.errors.length) {
        lines.push('Błędy: ' + summary.errors.length);
      }
      reportBox.appendChild(el('strong', { text: 'Import zakończony' }));
      reportBox.appendChild(el('br'));
      lines.forEach(function (line) {
        reportBox.appendChild(global.document.createTextNode(line));
        reportBox.appendChild(el('br'));
      });
      summary.errors.forEach(function (e) {
        reportBox.appendChild(el('div', { class: 'vilda-auth-error', style: 'margin-top:6px;', text: e.file + ': ' + e.message }));
      });

      // import zakończony — wyłącz przycisk, schowaj toolbar i listę
      importBtn.disabled = true;
      importBtn.textContent = 'Import zakończony';
      toolbar.style.display = 'none';
      if (fromSetup) {
        back.textContent = 'Przejdź do aplikacji';
        back.onclick = function () { hide(); startIdleWatch(); };
      } else {
        back.textContent = 'Wróć do listy pacjentów';
        back.onclick = function () { showPatientsList(onPickAfterImport); };
      }
    });

    open(el('div', { class: 'vilda-auth-screen vilda-auth-import' }, [
      title, sub,
      el('div', { class: 'vilda-auth-section-action' }, [pickBtn]),
      pwInput,
      toolbar,
      previewBox,
      errBox,
      reportBox,
      fileInput,
      el('div', { class: 'vilda-auth-actions' }, [back, importBtn])
    ]));
  }

  // ============ AUTO-LOCK ============
  function bindIdleHandlers() {
    if (idleHandlersBound || !global.document) return;
    const V = getVault();
    if (!V) return;
    const handler = function () {
      try { V.resetIdleTimer(); } catch (_) {}
    };
    IDLE_EVENTS.forEach(function (evName) {
      try { global.document.addEventListener(evName, handler, { passive: true }); } catch (_) {}
    });
    idleHandlersBound = true;
  }

  // ── „Ufam temu urządzeniu" — preferencja per-urządzenie ──────────────────────
  function isTrustedDevice() {
    try {
      return !!(global.localStorage && global.localStorage.getItem(TRUSTED_DEVICE_KEY) === '1');
    } catch (_) { return false; }
  }

  // Cloud-only: indywidualna preferencja idle (localStorage). Klucz PER-URZĄDZENIE
  // (nie synchronizuje się na inne kopie konta) — to świadoma decyzja: telefon/tablet
  // prywatne mogą mieć długie okno, a współdzielony komputer w gabinecie krótkie,
  // bez ryzyka „zarażenia" jednego ustawienia drugim. Wartości whitelistowane.
  //
  // Krótkie okna (5–30 min) = sprzęt współdzielony. Długie (1 h–7 dni) = prywatne
  // urządzenie — użytkownik wybiera je jawnie na tym konkretnym urządzeniu.
  const CLOUD_ONLY_IDLE_PREF_KEY = 'vilda-cloud-only-idle-ms';
  const CLOUD_ONLY_IDLE_CHOICES_MS = [5 * 60 * 1000, 10 * 60 * 1000, 15 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000, 8 * 60 * 60 * 1000, 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000];
  function getCloudOnlyIdlePref() {
    try {
      const raw = global.localStorage && global.localStorage.getItem(CLOUD_ONLY_IDLE_PREF_KEY);
      const n = raw != null ? parseInt(raw, 10) : NaN;
      if (CLOUD_ONLY_IDLE_CHOICES_MS.indexOf(n) >= 0) return n;
    } catch (_) {}
    return null;
  }
  function setCloudOnlyIdlePref(ms) {
    const n = parseInt(ms, 10);
    if (CLOUD_ONLY_IDLE_CHOICES_MS.indexOf(n) < 0) return false;
    try { if (global.localStorage) global.localStorage.setItem(CLOUD_ONLY_IDLE_PREF_KEY, String(n)); } catch (_) {}
    const V = getVault();
    try { if (V && V.isUnlocked()) V.startIdleTimer(effectiveIdleMs()); } catch (_) {}
    return true;
  }

  // Efektywne okno bezczynności:
  //   • cloud-only → preferencja PER-URZĄDZENIE z selecta (5 min–7 dni) lub 10 min
  //     default gdy nic nie wybrano. Flaga „ufam temu urządzeniu" (tryb lokalny) jest
  //     tu nadal ignorowana — w chmurze rolę „zaufania" pełni właśnie ten select,
  //     ustawiany jawnie na danym urządzeniu (telefon/tablet prywatny = długie okno;
  //     współdzielony komputer = krótkie/domyślne).
  //   • standardowo → 7 dni gdy „ufam temu urządzeniu", inaczej domyślne 20 min.
  function effectiveIdleMs() {
    const V = getVault();
    const def = (V && typeof V.DEFAULT_IDLE_LOCK_MS === 'number') ? V.DEFAULT_IDLE_LOCK_MS : (20 * 60 * 1000);
    const cloudDef = (V && typeof V.CLOUD_ONLY_IDLE_LOCK_MS === 'number') ? V.CLOUD_ONLY_IDLE_LOCK_MS : (10 * 60 * 1000);
    let isCloud = false;
    try { isCloud = !!(V && V.isCloudOnlyMode && V.isCloudOnlyMode()); } catch (_) {}
    if (isCloud) {
      const pref = getCloudOnlyIdlePref();
      return (typeof pref === 'number' && pref > 0) ? pref : cloudDef;
    }
    return isTrustedDevice() ? TRUSTED_DEVICE_IDLE_MS : def;
  }

  // Ustawia preferencję i — jeśli odblokowane — natychmiast stosuje nowe okno.
  function setTrustedDevice(on) {
    try {
      if (global.localStorage) {
        if (on) global.localStorage.setItem(TRUSTED_DEVICE_KEY, '1');
        else global.localStorage.removeItem(TRUSTED_DEVICE_KEY);
      }
    } catch (_) {}
    const V = getVault();
    try { if (V && V.isUnlocked()) V.startIdleTimer(effectiveIdleMs()); } catch (_) {}
    return isTrustedDevice();
  }

  function startIdleWatch() {
    const V = getVault();
    if (!V) return;
    bindIdleHandlers();
    try { V.startIdleTimer(effectiveIdleMs()); } catch (_) {}
  }

  function lockAndShowLogin(reason) {
    const V = getVault();
    if (V) { try { V.lock(reason || 'manual'); } catch (_) {} }
    // onLock listener wywoła showStartupScreen, więc nic więcej nie robimy
  }

  // ============ BOOT ============
  async function boot() {
    if (booted) return;
    booted = true;
    if (!getVault() || !getCrypto()) {
      logWarn('boot: brak VildaVault/VildaCrypto, pomijam UI.');
      return;
    }
    ensureRoot();

    try {
      getVault().onLock(function (reason) {
        // Auth-gate: schowaj interfejs NATYCHMIAST, synchronicznie, zanim ruszy
        // resetAppSessionState() i ewentualna nawigacja — inaczej po wylogowaniu
        // stara treść aplikacji błyska zanim pojawi się ekran logowania. W gałęzi
        // gościa (poniżej) zdejmujemy bramę, bo gość zostaje w aplikacji.
        lockAppContent();
        hideLogoutButton();

        // WAŻNE: vault.lock() zeruje currentUserId PRZED wywołaniem notifyLock(),
        // więc getCurrentUser() tu zawsze zwraca null. Używamy _trackedUserId
        // przechwyconego wcześniej w onUnlock.
        var lockedUserId = _trackedUserId;
        _trackedUserId = null; // zużyty — wyczyść niezależnie od wyniku
        // N11.2: usunięto tracking cloud-only + sessionStorage write — toast
        // post-logout został wyeliminowany jako UX clutter.

        // Wylogowanie/auto-lock = porzucenie tożsamości. Wyczyść stan aplikacji,
        // żeby kolejny user (lub gość) nie zobaczył danych poprzedniego.
        try {
          resetAppSessionState('on-lock');
        } catch (_) {}
        // Kasuj lokalny cache PRO wylogowanego użytkownika (obrona wgłębna, warstwa 2).
        // lockedUserId jest niezbędny — vault.lock() wyczyścił currentUserId
        // i sessionStorage PRZED wywołaniem onLock, więc getCurrentUserIdSync()
        // zwróciłby null.
        try {
          if ((reason === 'manual' || reason === 'user-removed') &&
              lockedUserId &&
              global.VildaProAccess && typeof global.VildaProAccess.invalidateCache === 'function') {
            global.VildaProAccess.invalidateCache(lockedUserId);
          }
        } catch (_) {}
        // Zaktualizuj bramkę PRO — vault zablokowany, sessionStorage wyczyszczone,
        // więc refresh() poprawnie ustawi vilda-pro-inactive na <html>.
        try {
          if (global.VildaProUi && typeof global.VildaProUi.refresh === 'function') {
            global.VildaProUi.refresh();
          }
        } catch (_) {}
        if (isGuestMode()) { unlockAppContent(); return; } // gość zostaje w aplikacji — bez bramy
        // Gdy konto zostało właśnie usunięte, ustawienia.html natychmiast
        // przekierowuje na index.html — nie otwieramy tu ekranu startowego,
        // żeby uniknąć błysku starych danych przed nawigacją.
        if (reason === 'user-removed') return;
        // Ekran logowania zawsze pojawia się nad index.html, nie nad podstroną.
        // Logout = pełna izolacja — po wylogowaniu (manual) lub wygaśnięciu sesji (idle)
        // wracamy do strony głównej, żeby następny użytkownik zaczynał od zera.
        try {
          if (reason === 'manual' || reason === 'idle') {
            var _loc = global.location;
            if (_loc && _loc.pathname &&
                !_loc.pathname.endsWith('index.html') &&
                _loc.pathname !== '/') {
              _loc.replace('index.html');
              return; // index.html załaduje auth UI samodzielnie
            }
          }
        } catch (_) {}
        // po każdym innym rodzaju blokady (lub gdy już jesteśmy na index.html) — ekran startowy
        showStartupScreen();
      });
      getVault().onUnlock(function (payload) {
        // Zapamiętaj userId zalogowanego użytkownika — vault.lock() zeruje go
        // PRZED wywołaniem onLock listenerów, więc bez własnego śledzenia
        // nie możemy odczytać userId w onLock.
        _trackedUserId = (payload && payload.userId) ? payload.userId : null;
        // N11.2: usunięto _trackedCloudOnly capture (post-logout toast usunięty).

        // Auth-gate: vault odblokowany (logowanie LUB nawigacja/odtworzenie sesji)
        // = aplikacja autoryzowana → odsłaniamy interfejs. Robimy to bezwarunkowo,
        // zanim niżej nastąpi ewentualny wczesny return dla nawigacji.
        unlockAppContent();

        // Zaktualizuj bramkę PRO — ale tylko gdy cache PRO już istnieje w localStorage.
        // Przypadek idle re-auth (vault auto-zablokował, user ponownie się loguje):
        //   cache ważny → refresh() od razu pokaże PRO bez żadnego flash.
        // Przypadek świeżego logowania po manual logout (warstwa 2 wyczyściła cache):
        //   hasAccess()=false → pomijamy, bo onLock już ustawił inactive przy wylogowaniu.
        //   PRO zostanie odświeżone przez sync w tle (warstwa 3) → 2b wywoła refresh()
        //   po sukcesie fetch — bez zbędnego "brak PRO" między logowaniem a synciem.
        try {
          var _hasLocalPro = global.VildaProAccess &&
                             typeof global.VildaProAccess.hasAccess === 'function' &&
                             global.VildaProAccess.hasAccess();
          if (global.VildaProUi && typeof global.VildaProUi.refresh === 'function') {
            if (_hasLocalPro || !global.VildaProAccess) {
              global.VildaProUi.refresh();
            }
          }
          // Gdy PRO potwierdzone z lokalnego cache → odpal vildaProAccessChanged
          // żeby app.js auto-włączył tryb profesjonalny przy każdym logowaniu.
          // (Ścieżka serwera odpala setPlan → vildaProAccessChanged osobno;
          //  ta gałąź obsługuje przypadek gdy cache jest ważny i serwer jest pomijany.)
          if (_hasLocalPro && global.document) {
            var _proSnap = (typeof global.VildaProAccess.getSnapshot === 'function')
              ? global.VildaProAccess.getSnapshot() : null;
            global.document.dispatchEvent(new CustomEvent('vildaProAccessChanged', {
              bubbles: false,
              detail: {
                plan:       (_proSnap && _proSnap.plan)       || 'pro',
                validUntil: (_proSnap && _proSnap.validUntil) || null
              }
            }));
          }
        } catch (_) {}
        // 2c: badge synchroniczny z wczesnym refresh — jeśli mamy cache PRO,
        // od razu pokaż fioletowe „PRO" bez czekania na async sync z serwerem.
        updateProBadge();

        // Logowanie zawsze unieważnia tryb gościa — także gdy user wszedł
        // wcześniej jako gość, a potem zalogował się przez przycisk w rogu.
        if (isGuestMode()) {
          global[PWA_GUEST_FLAG] = false;
          persistGuestFlag(false);
        }
        showLogoutButton();
        startIdleWatch();

        // R3 — auto-trigger reminder modal po unlock (raz na dzień, cloud-synced).
        // Delay 3000ms: daje przestrzeń biometric/adoption prompt'om i loading
        // overlay'om sync force-pull, żeby się zamknęły jako pierwsze. Reminder
        // pokazuje się jako ostatni element w kolejce powitalnej.
        setTimeout(function () {
          maybeShowReminders().catch(function () {});
        }, 3000);

        // ── Logowanie vs nawigacja/odtworzenie sesji ──────────────────────────
        // Vault podaje trigger w payloadzie onUnlock:
        //   • 'restore' → tryRestoreSession (nawigacja między podstronami lub
        //     auto-przywrócenie sesji przy starcie) — dane bieżącej sesji są
        //     nienaruszone, restoreAll() z vildaAppOnReady je obsłuży. NIE czyścimy.
        //   • inny ('login'/passkey/recovery/QR/nowe konto/odtworzenie backupu) →
        //     PRAWDZIWE logowanie. Nowy użytkownik musi zacząć od czysta — czyścimy
        //     wszystkie dane z poprzedniej sesji (DOM + localStorage sharedUserData +
        //     sessionStorage main/clcr/steroid) i dispatchujemy user-state-cleared,
        //     dzięki czemu ikona pacjenta przechodzi w stan hidden (a nie new_patient).
        // Fallback (starszy vault bez trigger): dawna heurystyka obecności sharedUserData.
        var _trigger = (payload && payload.trigger) || null;
        var _isNavigation;
        if (_trigger) {
          _isNavigation = (_trigger === 'restore');
        } else {
          var existingShared = null;
          try {
            existingShared = global.localStorage && global.localStorage.getItem('sharedUserData');
          } catch (_) {}
          _isNavigation = !!(existingShared && existingShared !== 'null' && existingShared.length > 10);
        }
        if (_isNavigation) return;

        // Prawdziwe logowanie — pełny reset stanu poprzedniej sesji.
        resetAppSessionState('fresh-login');

        // ── Synchronizacja stanu PRO z serwerem w tle (warstwa 3) ─────────────
        // Dociera tu tylko przy prawdziwym logowaniu (hasło, passkey, biometria,
        // QR, nowe konto) — tryRestoreSession (nawigacja) zawróciło wcześniej.
        // Odpytujemy serwer tylko gdy brak aktywnego lokalnego cache — czyli po
        // manual logout (warstwa 2 wyczyściła cache) lub na nowym urządzeniu.
        // Fire-and-forget: nie blokuje UI, ciche błędy (offline, 404, 401).
        try {
          var _proAccess = global.VildaProAccess;
          var _proVault  = getVault();
          var _proNow    = Date.now();
          // Cooldown per-user: ten sam userId w ciągu 30s → pomiń (idle re-login, QR).
          // Inny userId → zawsze odpytaj serwer, ignoruj cooldown poprzednika.
          var _proSyncUserId = _trackedUserId;
          var _proCooldownOk = (_proSyncLastAt.userId !== _proSyncUserId) ||
                               ((_proNow - _proSyncLastAt.at) > 30000);
          if (_proAccess && !_proAccess.hasAccess() &&
              _proVault && typeof _proVault.isUnlocked === 'function' && _proVault.isUnlocked() &&
              typeof _proVault.getSyncMaterial === 'function' &&
              _proCooldownOk) {
            _proSyncLastAt = { userId: _proSyncUserId, at: _proNow };
            (async function () {
              try {
                var _sm = await _proVault.getSyncMaterial();
                var _base = (global.VILDA_SYNC_WORKER_URL || 'https://vilda-sync.maciej-4b9.workers.dev')
                              .replace(/\/$/, '');
                var _resp = await fetch(
                  _base + '/v1/slots/' + _sm.slotId + '/trial',
                  { method: 'GET', headers: { 'Authorization': 'Bearer ' + _sm.authToken } }
                );
                if (_resp.ok) {
                  var _d;
                  try { _d = await _resp.json(); } catch (_) { return; }
                  if (_d && _d.plan === 'pro' && _d.validUntil) {
                    var _pa = global.VildaProAccess;
                    if (_pa && typeof _pa.setPlan === 'function') {
                      _pa.setPlan(_d.plan, _d.validUntil, _d.activatedAt || null);
                      // setPlan odpala 'vildaProAccessChanged' → VildaProUi nasłuchuje.
                      // Bezpośrednie refresh() jako obrona wgłębna — na wypadek gdy
                      // event nie dotrze (race przy init, brak listenera na tej stronie).
                      try {
                        if (global.VildaProUi && typeof global.VildaProUi.refresh === 'function') {
                          global.VildaProUi.refresh();
                        }
                        // 2b: po udanym sync z serwerem badge przełącza się na „PRO"
                        updateProBadge();
                      } catch (_) {}
                    }
                  }
                }
                // 404 = brak triala (nowy użytkownik) — cicho ignorujemy
                // 401 = slot niezarejestrowany — cicho ignorujemy
              } catch (_) { /* błąd sieci lub offline — nie wpływa na działanie */ }
            })();
          }
        } catch (_) {}

      });
    } catch (e) { logError('boot: listenery', e); }

    // Usuń stary _vildaSnapRestore jeśli użytkownik jawnie czyści dane
    // lub jeśli pozostał w localStorage z poprzedniej wersji aplikacji.
    try {
      if (typeof global.addEventListener === 'function') {
        global.addEventListener('vilda:user-state-cleared', function () {
          try {
            if (global.localStorage) global.localStorage.removeItem('_vildaSnapRestore');
          } catch (_) {}
        });
      }
    } catch (_) {}

    // Najpierw spróbuj przywrócić sesję zalogowanego użytkownika z sessionStorage —
    // nawigacja między podstronami nie powinna wymagać ponownego logowania.
    let restored = false;
    try { restored = await getVault().tryRestoreSession(); } catch (e) { logError('tryRestoreSession', e); }
    if (restored) {
      // sesja wczytana, hide() i UI pozostaje ukryte — onUnlock listener już się
      // odpalił i pokazał przycisk wyloguj się oraz uruchomił idle timer.
      setGuestMode(false);
      hide();
      return;
    }

    // Jeśli na poprzedniej podstronie użytkownik wybrał „Kontynuuj jako gość",
    // przywróćmy ten tryb zamiast pokazywać znów ekran logowania.
    if (readPersistedGuestFlag()) {
      setGuestMode(true, { skipReset: true });
      hide();
      return;
    }

    setGuestMode(false);
    await showStartupScreen();
  }

  // ============ SCALANIE VAULT-BACKUP ============

  /**
   * Ekran scalania kopii całego konta z bieżącym kontem.
   * Otwiera się gdy użytkownik wybierze plik vault-backup w imporcie pacjentów
   * lub wywoła bezpośrednio.
   *
   * @param {string} fileText  - zawartość pliku .wiw (vault-backup)
   * @param {string} [fileName] - oryginalna nazwa pliku (do wyświetlenia)
   */
  function showMergeAccountFlow(fileText, fileName) {
    const V = getVault();
    if (!V || !V.isUnlocked()) return;

    const title = el('h2', { class: 'vilda-auth-title', text: 'Scal kopię konta' });
    const sub   = el('p', {
      class: 'vilda-auth-subtitle',
      // B1.10: „wizyty" → „zapisy" — kontekst: scalanie kopii vaulta z aktualnymi danymi.
      text: 'Podaj hasło do tej kopii. Aplikacja sprawdzi, które zapisy już masz, i doda tylko brakujące — bez usuwania ani nadpisywania istniejących danych.'
    });

    const fileInfo = el('div', {
      class: 'vilda-auth-info',
      style: 'font-size:0.82rem; color:#4a6670; margin-bottom:4px;',
      text: fileName ? ('Plik: ' + fileName) : ''
    });

    const pwInput = el('input', {
      type:         'password',
      class:        'vilda-auth-input',
      placeholder:  'Hasło do tej kopii konta',
      autocomplete: 'off'
    });

    const errBox = el('div', { class: 'vilda-auth-error' });
    errBox.style.display = 'none';

    // Sekcja podglądu — wypełniana po wpisaniu hasła
    const previewBox = el('div', { class: 'vilda-auth-info', style: 'display:none; text-align:left;' });

    // Przycisk podglądu
    const previewBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type:  'button',
      text:  'Sprawdź co zostanie scalone'
    });

    // Przycisk wykonania scalania — początkowo ukryty
    const mergeBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type:  'button',
      text:  'Scal teraz'
    });
    mergeBtn.style.display = 'none';

    const back = el('button', {
      class:   'vilda-auth-btn vilda-auth-btn-ghost',
      type:    'button',
      text:    'Wstecz',
      onclick: function () { showImportPatientsFlow(null); }
    });

    // Wyniki po scaleniu
    const reportBox = el('div', { class: 'vilda-auth-info', style: 'display:none; text-align:left;' });

    // ---- Podgląd ----
    previewBtn.addEventListener('click', async function () {
      showError(errBox, '');
      previewBox.style.display = 'none';
      mergeBtn.style.display   = 'none';
      if (!pwInput.value) { showError(errBox, 'Wpisz hasło do tej kopii konta.'); return; }
      setBusy(true);
      previewBtn.disabled = true;
      try {
        const plan = await V.previewVaultBackupMerge(fileText, pwInput.value);

        // Buduj podgląd
        while (previewBox.firstChild) previewBox.removeChild(previewBox.firstChild);

        const backupDateStr = plan.backupExportedAtISO
          ? formatRelativeISO(plan.backupExportedAtISO) : '';

        previewBox.appendChild(el('div', {
          style: 'font-weight:700; color:#002830; margin-bottom:10px; font-size:0.95rem;',
          text:  'Kopia konta: „' + plan.backupLabel + '"' + (backupDateStr ? ' · ' + backupDateStr : '')
        }));

        // Scalenie (wspólni pacjenci)
        if (plan.mergePatients.length > 0) {
          previewBox.appendChild(el('div', {
            style: 'font-weight:600; color:#00838d; margin:10px 0 6px; font-size:0.83rem; text-transform:uppercase; letter-spacing:0.05em;',
            // B1.10: „uzupełnienia wizyt" → „uzupełnienia zapisów".
            text:  'Pacjenci do uzupełnienia zapisów (' + plan.mergePatients.length + ')'
          }));
          plan.mergePatients.forEach(function (p) {
            const noNew = p.newSnapshotCount === 0;
            const row = el('div', {
              style: 'display:flex; justify-content:space-between; align-items:baseline; padding:4px 0; border-bottom:1px solid rgba(0,131,141,0.08); font-size:0.85rem; color:' + (noNew ? '#999' : '#002830') + ';'
            }, [
              el('span', { text: p.name }),
              el('span', {
                style: 'font-size:0.78rem; color:' + (noNew ? '#bbb' : '#00838d') + '; white-space:nowrap; margin-left:12px;',
                text: noNew
                  ? 'brak nowych (wszystkie zapisy już są)'
                  : (p.currentSnapshotCount + ' + ' + p.newSnapshotCount + ' nowych = ' + (p.currentSnapshotCount + p.newSnapshotCount))
              })
            ]);
            previewBox.appendChild(row);
          });
        }

        // Nowi pacjenci
        if (plan.addPatients.length > 0) {
          previewBox.appendChild(el('div', {
            style: 'font-weight:600; color:#00838d; margin:14px 0 6px; font-size:0.83rem; text-transform:uppercase; letter-spacing:0.05em;',
            text:  'Nowi pacjenci do dodania (' + plan.addPatients.length + ')'
          }));
          plan.addPatients.forEach(function (p) {
            const row = el('div', {
              style: 'display:flex; justify-content:space-between; align-items:baseline; padding:4px 0; border-bottom:1px solid rgba(0,131,141,0.08); font-size:0.85rem; color:#002830;'
            }, [
              el('span', { text: p.name }),
              el('span', {
                style: 'font-size:0.78rem; color:#00838d; white-space:nowrap; margin-left:12px;',
                // B1.10: „wizyta/wizyty" → „zapis/zapisy/zapisów".
                text:  p.snapshotCount + ' ' + (p.snapshotCount === 1 ? 'zapis' : 'zapisów')
              })
            ]);
            previewBox.appendChild(row);
          });
        }

        // Podsumowanie
        const summaryParts = [];
        if (plan.totalNewSnapshots > 0)   summaryParts.push(plan.totalNewSnapshots + ' nowych zapisów zostanie dodanych');
        if (plan.totalNewSnapshots === 0)  summaryParts.push('Brak nowych danych — wszystko już masz');
        if (plan.addPatients.length > 0)   summaryParts.push(plan.addPatients.length + ' nowych pacjentów');

        previewBox.appendChild(el('div', {
          style: 'margin-top:14px; padding:10px 12px; background:rgba(0,131,141,0.06); border-radius:10px; font-size:0.87rem; color:#002830; font-weight:600;',
          text:  summaryParts.join(' · ')
        }));

        previewBox.style.display = 'block';

        if (plan.totalNewSnapshots > 0 || plan.addPatients.length > 0) {
          mergeBtn.style.display = '';
          mergeBtn.textContent   = 'Scal teraz (' + plan.totalNewSnapshots + ' nowych zapisów' +
            (plan.addPatients.length > 0 ? ', ' + plan.addPatients.length + ' nowych pacjentów' : '') + ')';
        } else {
          mergeBtn.style.display = 'none';
        }

      } catch (e) {
        showError(errBox, e && e.message ? e.message : 'Nie udało się odczytać kopii.');
      } finally {
        setBusy(false);
        previewBtn.disabled = false;
      }
    });

    // ---- Scalanie ----
    mergeBtn.addEventListener('click', async function () {
      showError(errBox, '');
      setBusy(true);
      mergeBtn.disabled    = true;
      previewBtn.disabled  = true;
      pwInput.disabled     = true;
      try {
        const result = await V.mergeVaultBackup(fileText, pwInput.value);

        previewBox.style.display = 'none';
        mergeBtn.style.display   = 'none';
        reportBox.style.display  = 'block';
        while (reportBox.firstChild) reportBox.removeChild(reportBox.firstChild);

        const lines = [];
        if (result.addedPatientCount > 0)
          lines.push('➕ Dodano ' + result.addedPatientCount + ' nowych pacjentów');
        if (result.mergedPatientCount > 0)
          lines.push('🔀 Uzupełniono zapisy u ' + result.mergedPatientCount + ' pacjentów');
        if (result.addedSnapshotCount > 0)
          lines.push('✓ Łącznie dodano ' + result.addedSnapshotCount + ' zapisów');
        if (result.skippedSnapshotCount > 0)
          lines.push('↩ Pominięto ' + result.skippedSnapshotCount + ' duplikatów (już były w Twoim koncie)');
        if (result.addedSnapshotCount === 0 && result.addedPatientCount === 0)
          lines.push('Brak zmian — wszystkie dane z tej kopii już były w Twoim koncie.');

        lines.forEach(function (line) {
          reportBox.appendChild(el('p', { style: 'margin:4px 0; font-size:0.88rem;', text: line }));
        });

        // Zmień przycisk Wstecz na "Gotowe"
        back.textContent = 'Gotowe';
        back.className   = 'vilda-auth-btn vilda-auth-btn-primary';
        back.onclick     = function () { hide(); startIdleWatch(); };

      } catch (e) {
        showError(errBox, e && e.message ? e.message : 'Scalanie nie powiodło się.');
        mergeBtn.disabled   = false;
        previewBtn.disabled = false;
        pwInput.disabled    = false;
      } finally {
        setBusy(false);
      }
    });

    pwInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') previewBtn.click();
    });

    open(el('div', { class: 'vilda-auth-screen vilda-auth-merge' }, [
      title, sub, fileInfo, pwInput, errBox,
      el('div', { class: 'vilda-auth-actions' }, [previewBtn]),
      previewBox,
      el('div', { class: 'vilda-auth-actions', style: 'margin-top:8px;' }, [mergeBtn]),
      reportBox,
      el('div', { class: 'vilda-auth-actions', style: 'margin-top:4px;' }, [back])
    ]));

    setTimeout(function () { try { pwInput.focus(); } catch (_) {} }, 30);
  }

  // ============ EKRAN ODTWARZANIA Z ZAPASOWEGO KODU DOSTĘPU ============

  /**
   * Ekran „Zapasowy kod dostępu" — cross-device restore bez pliku .wiw.
   * Użytkownik podaje kod (vsc3.…) + hasło → vault odblokowany z tym samym
   * masterKey → ten sam slotId → interstitial „Znaleziono Twoje dane" pojawia
   * się automatycznie z vilda_sync_integration.js.
   */
  function showSyncCodeRestoreScreen() {
    const V = getVault();
    if (!V) return;

    const title = el('h2', { class: 'vilda-auth-title', text: 'Logowanie z innego urządzenia' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Wybierz sposób logowania.'
    });

    // ── Karty wyboru metody logowania (Wariant B) ─────────────────────────────
    // Spójne z chooserem: kółko z lucide-style ikoną + tytuł + opis + tag w rogu.
    // Cała karta jest klikalna (<button>) — tak samo jak kafelki w chooserze.
    const ENTRY_ICON_QR = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<rect x="3" y="3" width="7" height="7" rx="1"/>'
      + '<rect x="14" y="3" width="7" height="7" rx="1"/>'
      + '<rect x="3" y="14" width="7" height="7" rx="1"/>'
      + '<line x1="14" y1="14" x2="14" y2="17"/>'
      + '<line x1="17" y1="14" x2="21" y2="14"/>'
      + '<line x1="14" y1="21" x2="17" y2="21"/>'
      + '<line x1="20" y1="17" x2="20" y2="21"/>'
      + '</svg>';
    const ENTRY_ICON_EYE_OFF = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>'
      + '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>'
      + '<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>'
      + '<line x1="2" y1="2" x2="22" y2="22"/>'
      + '</svg>';

    function buildEntryCard(cfg) {
      const card = el('button', {
        type: 'button',
        class: 'vilda-auth-entry-card',
        'data-method': cfg.method
      });
      card.style.cssText = [
        'display:block;width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit;',
        'padding:14px 16px;margin:8px 0 0;',
        'background:rgba(255,255,255,0.92);',
        'border:2px solid #d7e9ec;border-radius:14px;',
        'transition:border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .12s ease;'
      ].join('');
      card.innerHTML =
        '<div style="display:flex;align-items:flex-start;gap:14px;">' +
          '<div style="flex:0 0 auto;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#e2f1f2,#cfe9ec);display:flex;align-items:center;justify-content:center;color:#00838d;" aria-hidden="true">' +
            cfg.iconSvg +
          '</div>' +
          '<div style="flex:1 1 auto;min-width:0;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px;">' +
              '<div style="font-weight:700;font-size:1rem;color:#0f2b33;">' + cfg.title + '</div>' +
              '<span style="font-size:0.7rem;font-weight:600;color:' + cfg.tagColor + ';background:' + cfg.tagBg + ';padding:2px 8px;border-radius:999px;white-space:nowrap;">' + cfg.tag + '</span>' +
            '</div>' +
            '<div style="font-size:0.85rem;color:#5b6672;line-height:1.45;">' + cfg.desc + '</div>' +
          '</div>' +
        '</div>';
      card.addEventListener('mouseenter', function () {
        card.style.borderColor = '#00838d';
        card.style.transform = 'translateY(-1px)';
        card.style.boxShadow = '0 6px 16px rgba(0,131,141,0.18)';
      });
      card.addEventListener('mouseleave', function () {
        card.style.borderColor = '#d7e9ec';
        card.style.transform = '';
        card.style.boxShadow = '';
      });
      card.addEventListener('click', cfg.onClick);
      return card;
    }

    // QR card — sekcja „persistent" (konto zostaje). Chooser filtruje ephemeral
    // (to osobna karta poniżej).
    const qrSection = buildEntryCard({
      method: 'qr',
      iconSvg: ENTRY_ICON_QR,
      title: 'Zaloguj przez kod QR',
      desc: 'Zeskanuj telefonem i ustal hasło. W następnym kroku wybierzesz, czy pacjenci mają zostać na dysku, czy tylko w chmurze.',
      tag: 'Konto zostaje',
      tagColor: '#0f6e56',
      tagBg: '#e1f5ee',
      onClick: function () { showQRLoginScreen({ availableModes: ['local', 'cloud-only'] }); }
    });

    // Ephemeral card — sekcja „jednorazowo" (nic nie zostaje). User świadomie
    // wybrał obcy komputer → pomijamy chooser, prosto do ephemeral flow.
    let passkeySection = null;
    if (typeof V.unlockWithPasskeyEphemeral === 'function') {
      passkeySection = buildEntryCard({
        method: 'ephemeral',
        iconSvg: ENTRY_ICON_EYE_OFF,
        title: 'Zaloguj jednorazowo',
        desc: 'Pracujesz na obcym komputerze? Po zakończeniu pracy nic nie zostanie.',
        tag: 'Nic nie zostaje',
        tagColor: '#854f0b',
        tagBg: '#faeeda',
        onClick: function () { showPasskeyEphemeralLoginScreen({ storageMode: 'ephemeral' }); }
      });
    }

    // Backup code card — trzeci kafelek, klik prowadzi do osobnego ekranu
    // z formularzem (showBackupCodeRestoreScreen). Tag „Bez telefonu" w kolorze
    // szarym kontrastuje z zielonym/pomarańczowym tagiem powyżej.
    const ENTRY_ICON_KEY = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<circle cx="8" cy="15" r="4"/>'
      + '<line x1="10.85" y1="12.15" x2="19" y2="4"/>'
      + '<line x1="18" y1="5" x2="20" y2="7"/>'
      + '<line x1="15" y1="8" x2="17" y2="10"/>'
      + '</svg>';
    const backupCodeSection = buildEntryCard({
      method: 'backup-code',
      iconSvg: ENTRY_ICON_KEY,
      title: 'Użyj zapasowego kodu',
      desc: 'Masz zapasowy kod z poprzedniego urządzenia? Wklej go i podaj hasło, żeby zalogować się bez telefonu.',
      tag: 'Bez telefonu',
      tagColor: '#444441',
      tagBg: '#f1efe8',
      onClick: function () { showBackupCodeRestoreScreen(); }
    });

    const back = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: '← Wróć',
      onclick: function () { showStartupScreen(); }
    });

    const children = [title, sub, qrSection];
    if (passkeySection) { children.push(passkeySection); }
    children.push(backupCodeSection, back);
    const wrapper = el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, children);
    open(wrapper);
  }

  // ============ EKRAN WYMUSZONEJ ZMIANY HASŁA (Krok 16.5) ============
  // Pokazywany po unlockUser gdy vault zwrócił needsPasswordReset:true.
  // Stare konta z legacy 8-char hasłami muszą ustawić silne hasło zgodne
  // z aktualną polityką przed wejściem do aplikacji.
  //
  // BLOKUJĄCY — bez przycisku „Wróć". Jedyne wyjścia:
  //   • Ustawienie nowego hasła (resetPasswordWhileUnlocked) → aplikacja
  //   • „Wyloguj" → vault.lock() + powrót do ekranu wyboru konta
  function showForcedPasswordResetScreen(policyDetail) {
    const V = getVault();
    if (!V) return;

    const title = el('h2', { class: 'vilda-auth-title', text: 'Twoje hasło wymaga zmiany' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Twoje obecne hasło nie spełnia naszych zaktualizowanych wymagań bezpieczeństwa. Ustaw silniejsze hasło, żeby kontynuować pracę.'
    });

    // Box informacyjny — co konkretnie jest nie tak
    const policyBox = document.createElement('div');
    policyBox.style.cssText = 'margin: 8px 0 14px; padding: 10px 12px; background: rgba(180,83,9,0.08); border-left: 3px solid #b45309; border-radius: 8px; font-size: 0.85rem; color: #854f0b; line-height: 1.5;';
    const reasonText = (policyDetail && policyDetail.message)
      ? policyDetail.message + (policyDetail.hint ? ' ' + policyDetail.hint : '')
      : 'Hasło musi mieć minimum 12 znaków i zawierać co najmniej 3 z 4 typów znaków: małe litery, wielkie litery, cyfry, znaki specjalne.';
    policyBox.innerHTML = '<strong>Dlaczego?</strong> ' + reasonText;

    // Pola nowego hasła
    const pw1 = el('input', {
      type: 'password',
      class: 'vilda-auth-input',
      placeholder: 'Nowe hasło (min. 12 znaków, 3 z 4 typów)'
    });
    const pw2 = el('input', {
      type: 'password',
      class: 'vilda-auth-input',
      placeholder: 'Powtórz nowe hasło'
    });

    // Przycisk „Zaproponuj silne hasło" — identyczna logika jak w kreatorze.
    const generateBtn = el('button', {
      type: 'button',
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-small vilda-auth-btn-subtle',
      text: '🎲 Zaproponuj silne hasło'
    });
    generateBtn.style.cssText = 'margin: 4px 0 8px; font-size: 0.85rem;';
    generateBtn.addEventListener('click', function () {
      if (typeof V.generateStrongPassword !== 'function') return;
      const generated = V.generateStrongPassword();
      pw1.value = generated;
      pw2.value = generated;
      // Brak auto-reveal — user ma toggle „pokaż hasło" obok pola.
      try { pw1.focus(); } catch (_) {}
    });

    const errBox = el('div', { class: 'vilda-auth-error' });
    errBox.style.display = 'none';
    function showErr(msg) {
      errBox.textContent = msg || '';
      errBox.style.display = msg ? '' : 'none';
    }

    const submitBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Ustaw nowe hasło i kontynuuj'
    });
    submitBtn.addEventListener('click', async function () {
      showErr('');
      // Walidacja policy
      if (typeof V.validatePasswordStrength === 'function') {
        const r = V.validatePasswordStrength(pw1.value);
        if (!r.ok) { showErr(r.message + (r.hint ? ' ' + r.hint : '')); return; }
      } else if (pw1.value.length < 12) {
        showErr('Hasło musi mieć minimum 12 znaków.'); return;
      }
      if (pw1.value !== pw2.value) { showErr('Hasła nie są takie same.'); return; }
      submitBtn.disabled = true;
      const orig = submitBtn.textContent;
      submitBtn.textContent = 'Zmieniam…';
      try {
        // Hasło już zwalidowane wyżej → resetPasswordWhileUnlocked przejdzie.
        // Używamy reset (nie changePassword), bo user nie musi podawać starego —
        // jest już zalogowany, vault ma masterKey w RAM.
        await V.resetPasswordWhileUnlocked(pw1.value);
        hide();
        startIdleWatch();
      } catch (e) {
        showErr(e && e.message ? e.message : 'Nie udało się zmienić hasła.');
        submitBtn.disabled = false;
        submitBtn.textContent = orig;
      }
    });
    pw2.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitBtn.click(); });

    // „Wyloguj" — escape hatch, nie zmusza usera na siłę gdy nie chce ustawić
    // nowego hasła teraz. Wraca do ekranu wyboru konta.
    const logoutBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-small',
      type: 'button',
      text: 'Wyloguj się — ustawię hasło później',
      onclick: function () {
        try { V.lock('user'); } catch (_) {}
        showStartupScreen();
      }
    });

    open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, [
      title, sub, policyBox,
      attachPasswordToggle(pw1), generateBtn,
      attachPasswordToggle(pw2),
      errBox, submitBtn, logoutBtn
    ]));
    setTimeout(function () { try { pw1.focus(); } catch (_) {} }, 30);
  }

  // ============ EKRAN ZAPASOWEGO KODU DOSTĘPU ============
  // Osobny ekran z formularzem — wcześniej był inline w showSyncCodeRestoreScreen.
  // Po Kroku 14 sekcja na entry-screen to mały kafelek; klik → ten ekran.
  function showBackupCodeRestoreScreen() {
    const V = getVault();
    if (!V) return;

    const title = el('h2', { class: 'vilda-auth-title', text: 'Zapasowy kod dostępu' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Kod + hasło logują konto na tym urządzeniu i pobierają dane z chmury.'
    });

    const desc = document.createElement('p');
    desc.style.cssText = 'margin:0 0 0.9rem;font-size:0.84rem;color:var(--text-secondary,#555);line-height:1.5;';
    desc.innerHTML = [
      '<strong>Warunek:</strong> na starym urządzeniu musi być włączona synchronizacja.<br>',
      'Kod wygenerujesz tam w: <strong>Ustawienia → Synchronizacja</strong> → ',
      '<strong>„☁ Pokaż zapasowy kod dostępu"</strong> → Generuj.'
    ].join('');

    const codeInput = el('textarea', {
      class: 'vilda-auth-input',
      placeholder: 'vsc3.600000.AbCd1234.XyZw5678.…',
      rows: '3',
      style: 'font-family:monospace;font-size:0.82rem;resize:vertical;min-height:68px;margin-bottom:0.5rem;'
    });

    const labelInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input',
      placeholder: 'Nazwa konta (opcjonalnie, np. dr Kowalska)',
      maxlength: '60',
      style: 'margin-bottom:0.5rem;'
    });

    const pwInput = el('input', {
      type: 'password',
      class: 'vilda-auth-input',
      placeholder: 'Hasło ze starego konta',
      style: 'margin-bottom:0.5rem;'
    });

    const errBox = el('div', { class: 'vilda-auth-error' });
    errBox.style.display = 'none';
    function showErr(msg) {
      errBox.textContent = msg || '';
      errBox.style.display = msg ? '' : 'none';
    }

    const submitBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Odtwórz konto z kodem'
    });

    submitBtn.addEventListener('click', async function () {
      showErr('');
      const code  = (codeInput.value  || '').trim();
      const pw    = (pwInput.value    || '');
      const label = (labelInput.value || '').trim() || undefined;

      if (!code) { showErr('Wklej zapasowy kod dostępu.'); return; }
      if (!pw)   { showErr('Podaj hasło.'); return; }

      submitBtn.disabled = true;
      const origText = submitBtn.textContent;
      submitBtn.textContent = 'Odtwarzanie…';

      try {
        await V.importSyncCode(code, pw, { label: label });
        hide();
      } catch (e) {
        showErr(e && e.message ? e.message : 'Błąd odtwarzania. Sprawdź kod i hasło.');
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
      }
    });

    pwInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') submitBtn.click();
    });

    const back = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: '← Wróć',
      onclick: function () { showSyncCodeRestoreScreen(); }
    });

    open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, [
      title, sub, desc, codeInput, labelInput, pwInput, errBox, submitBtn, back
    ]));
  }

  // ============ HELPER: synchroniczny check dostępności PRO ============
  // Używany przez chooser oraz defensywne PRO guard'y w showQR/showPasskey,
  // żeby cloud-only nie dało się uruchomić ścieżką programatyczną bez PRO
  // (klikalne kafelki chooser'a są wizualnie disabled, ale samo wywołanie
  // showQRLoginScreen({storageMode:'cloud-only'}) z konsoli i tak by przeszło).
  function _hasProAccess() {
    try {
      return !!(global.VildaProAccess && global.VildaProAccess.hasAccess && global.VildaProAccess.hasAccess());
    } catch (_) { return false; }
  }

  // ============ EKRAN WYBORU TRYBU LOGOWANIA TELEFONEM ============

  /**
   * Wspólny ekran „Jak zalogować na tym komputerze?" — 3 kafelki: local / cloud-only /
   * ephemeral. Używany jako pierwszy krok przed QR LUB passkey flow z telefonu.
   *
   * Wymagania (decyzje user/D2/D3 Kroku 8):
   *   • Cloud-only kafelek WYMAGA aktywnego PRO (gating jak w kreatorze/Ustawieniach).
   *   • Cloud-only kafelek pokazuje warning gdy offline.
   *   • Ephemeral pozostaje dostępny zawsze.
   *
   * @param {{
   *   context: 'passkey' | 'qr',
   *   onPick: (mode: 'local' | 'cloud-only' | 'ephemeral') => void,
   *   onBack?: () => void,
   *   proGatingDeferred?: boolean  - gdy true (zalecane dla flow z telefonu na
   *     OBCYM komputerze), kafelek cloud-only jest klikalny niezależnie od PRO
   *     cache (bo na nowym urządzeniu nie znamy jeszcze userId, więc PRO check
   *     zawsze by zwracał false). Subskrypcja zostanie zweryfikowana POST-unlock
   *     (force-pull cloud-only → CLOUD_ONLY_NO_SYNC overlay jeśli brak sync/PRO).
   *   availableModes?: Array<'local'|'cloud-only'|'ephemeral'> - filtr listy kafelków.
   *     Default = wszystkie 3. Entry-screen sekcja „persistent" przekazuje
   *     ['local','cloud-only'] (bez ephemeral — to osobna sekcja na entry-screen).
   * }} options
   */
  function showLoginModeChooser(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    const ctx = opts.context === 'passkey' ? 'passkey' : 'qr';
    const onPick = (typeof opts.onPick === 'function') ? opts.onPick : function () {};
    const onBack = (typeof opts.onBack === 'function') ? opts.onBack : showSyncCodeRestoreScreen;
    const deferProGating = !!opts.proGatingDeferred;
    // availableModes — whitelist filtrowania kafelków. Default = wszystkie 3.
    const ALL_MODES = ['local', 'cloud-only', 'ephemeral'];
    const wantedModes = Array.isArray(opts.availableModes)
      ? opts.availableModes.filter(function (m) { return ALL_MODES.indexOf(m) >= 0; })
      : ALL_MODES;
    function modeAvailable(m) { return wantedModes.indexOf(m) >= 0; }

    // Walidacja PRO — synchroniczny snapshot z VildaProAccess.
    // W deferProGating ignorujemy hasPro przy disabled (bo na obcym komputerze
    // cache jest pusty, hasPro=false dla każdego usera — to byłoby błędne).
    const hasPro = _hasProAccess();
    const cloudOnlyDisabled = deferProGating ? false : !hasPro;

    // Status offline — `navigator.onLine === false` (z falsy gdy brak API).
    const isOffline = (typeof navigator !== 'undefined' && navigator && navigator.onLine === false);

    const title = el('h2', { class: 'vilda-auth-title', text: 'Jak chcesz się zalogować?' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: ctx === 'passkey'
        ? 'Po potwierdzeniu na telefonie wybierz, ile danych zostawić na tym komputerze.'
        : 'Po zeskanowaniu kodu QR wybierz, ile danych zostawić na tym komputerze.'
    });

    // ── Inline SVG ikony (lucide-style: stroke=2, currentColor) ──
    // Pasują do estetyki chip-icon/chip-avatar w nagłówku aplikacji.
    const ICON_HOUSE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M3 9.5L12 3l9 6.5"/>'
      + '<path d="M5 9v11h14V9"/>'
      + '<rect x="10" y="13" width="4" height="7" fill="none"/>'
      + '</svg>';
    const ICON_CLOUD_UP = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M17.5 18a4.5 4.5 0 1 0 0-9 4 4 0 0 0-7.9-1.6A4 4 0 0 0 5 17h12.5z"/>'
      + '<polyline points="12 16 12 12"/>'
      + '<polyline points="10 14 12 12 14 14"/>'
      + '</svg>';
    const ICON_EYE_OFF = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>'
      + '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>'
      + '<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>'
      + '<line x1="2" y1="2" x2="22" y2="22"/>'
      + '</svg>';

    // ── Helpery do budowania kafelka ──
    function buildModeCard(cfg) {
      const card = el('button', {
        type: 'button',
        class: 'vilda-auth-mode-card',
        'data-mode': cfg.mode,
        'aria-pressed': 'false',
        'aria-disabled': cfg.disabled ? 'true' : 'false'
      });
      card.style.cssText = [
        'display:block;width:100%;text-align:left;cursor:' + (cfg.disabled ? 'not-allowed' : 'pointer') + ';',
        'font:inherit;color:inherit;',
        'padding:14px 16px;margin:8px 0 0;',
        'background:' + (cfg.disabled ? 'rgba(245,245,245,0.65)' : 'rgba(255,255,255,0.92)') + ';',
        'border:2px solid ' + (cfg.disabled ? '#e5e7eb' : '#d7e9ec') + ';border-radius:14px;',
        'opacity:' + (cfg.disabled ? '0.78' : '1') + ';',
        'transition:border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .12s ease;'
      ].join('');

      // Ikona w kółku — wariant A: gradient turkus (jak chip-avatar w headerze) +
      // lucide-style SVG line-art (stroke 2, currentColor = #00838d). Spójne z
      // resztą aplikacji, dyskretne, profesjonalne.
      const iconWrapStyle = 'flex:0 0 auto;width:44px;height:44px;border-radius:50%;'
        + 'background:linear-gradient(135deg,#e2f1f2,#cfe9ec);'
        + 'display:flex;align-items:center;justify-content:center;'
        + 'color:#00838d;';

      card.innerHTML =
        '<div style="display:flex;align-items:center;gap:14px;">' +
          '<div style="' + iconWrapStyle + '" aria-hidden="true">' +
            (cfg.iconSvg || '') +
          '</div>' +
          '<div style="flex:1 1 auto;min-width:0;">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px;">' +
              '<div style="font-weight:700;font-size:1rem;color:#0f2b33;">' + cfg.title + '</div>' +
              (cfg.tag ? '<span style="font-size:0.7rem;font-weight:600;color:' + cfg.tagColor + ';background:' + cfg.tagBg + ';padding:2px 8px;border-radius:999px;white-space:nowrap;">' + cfg.tag + '</span>' : '') +
            '</div>' +
            '<div style="font-size:0.85rem;color:#5b6672;line-height:1.45;margin-bottom:6px;">' + cfg.desc + '</div>' +
            (cfg.hint ? '<div style="margin-top:8px;padding:7px 10px;border-radius:9px;background:' + (cfg.hintIsWarning ? 'rgba(180,83,9,0.08)' : 'rgba(0,131,141,0.06)') + ';color:' + (cfg.hintIsWarning ? '#854f0b' : '#00838d') + ';font-size:0.76rem;font-weight:500;">' + cfg.hint + '</div>' : '') +
          '</div>' +
        '</div>';

      if (!cfg.disabled) {
        card.addEventListener('mouseenter', function () {
          card.style.borderColor = cfg.hoverBorder;
          card.style.transform = 'translateY(-1px)';
          card.style.boxShadow = '0 6px 16px ' + cfg.hoverShadow;
        });
        card.addEventListener('mouseleave', function () {
          card.style.borderColor = '#d7e9ec';
          card.style.transform = '';
          card.style.boxShadow = '';
        });
        card.addEventListener('click', function () {
          card.setAttribute('aria-pressed', 'true');
          onPick(cfg.mode);
        });
      }
      return card;
    }

    // ── Kafelki (rendrowane tylko dla trybów w wantedModes) ──
    const localCard = modeAvailable('local') ? buildModeCard({
      mode: 'local',
      iconSvg: ICON_HOUSE,
      title: 'Komputer prywatny',
      desc: 'Pełna instalacja konta z kopią pacjentów na dysku. Po wylogowaniu wszystko zostaje — szybki dostęp przy następnym logowaniu.',
      hoverBorder: '#00838d',
      hoverShadow: 'rgba(0,131,141,0.18)'
    }) : null;

    // Hint dla kafelka cloud-only — zależy od kontekstu:
    //   • deferred + offline → ostrzeżenie offline (zalogujesz się, jak wróci sieć)
    //   • deferred (online)  → info „PRO sprawdzimy po zalogowaniu"
    //   • !deferred + !PRO   → klasyczny disabled hint
    //   • !deferred + offline → ostrzeżenie offline
    const cloudOnlyHint = (function () {
      if (deferProGating) {
        if (isOffline) return '⚠️ Brak internetu — logowanie cloud-only może się nie powieść.';
        return 'ⓘ Sprawdzimy Twoją subskrypcję PRO po zalogowaniu.';
      }
      if (!hasPro) return '⚠️ Wymaga aktywnego planu PRO.';
      if (isOffline) return '⚠️ Brak internetu — konfiguracja zostanie, ale logowanie nie powiedzie się bez sieci.';
      return null;
    })();
    const cloudOnlyHintIsWarning = (function () {
      if (deferProGating) return isOffline; // info bez warning gdy online
      return !hasPro || isOffline;
    })();
    const cloudOnlyTagLabel = (deferProGating || hasPro) ? 'PRO' : 'wymaga PRO';
    const cloudOnlyTagColor = (deferProGating || hasPro) ? '#00838d' : '#854f0b';
    const cloudOnlyTagBg = (deferProGating || hasPro) ? 'rgba(0,131,141,0.12)' : 'rgba(180,83,9,0.12)';

    const cloudOnlyCard = modeAvailable('cloud-only') ? buildModeCard({
      mode: 'cloud-only',
      iconSvg: ICON_CLOUD_UP,
      title: 'Komputer w pracy',
      tag: cloudOnlyTagLabel,
      tagColor: cloudOnlyTagColor,
      tagBg: cloudOnlyTagBg,
      desc: 'Pracujesz na sprzęcie, który mogą obsługiwać też inni? Ten tryb chroni dane pacjentów: ich karty, parametry i pomiary istnieją <strong>tylko w chmurze</strong> i w pamięci Twojej sesji — nigdy nie zapisują się na dysku. Wylogowanie = zero śladów pacjentów na tym komputerze. Twoje konto, ustawienia i biblioteka notatek pamiętają się lokalnie (zaszyfrowane Twoim hasłem), żebyś nie czekał na pobranie ustawień.',
      disabled: cloudOnlyDisabled,
      hint: cloudOnlyHint,
      hintIsWarning: cloudOnlyHintIsWarning,
      hoverBorder: '#00838d',
      hoverShadow: 'rgba(0,131,141,0.18)'
    }) : null;

    const ephemeralCard = modeAvailable('ephemeral') ? buildModeCard({
      mode: 'ephemeral',
      iconSvg: ICON_EYE_OFF,
      title: 'Obcy komputer',
      desc: 'Tylko ta sesja. <strong>Żadnych śladów</strong> — ani konta, ani kopii. Po zamknięciu zakładki nie da się tu więcej zalogować bez telefonu.',
      hoverBorder: '#9a213a',
      hoverShadow: 'rgba(154,33,58,0.16)'
    }) : null;

    const back = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost', type: 'button', text: '← Wróć',
      onclick: onBack
    });

    // Dynamiczna lista dzieci — pomijamy null'e (kafelki nieobjęte availableModes).
    const children = [title, sub];
    if (localCard) children.push(localCard);
    if (cloudOnlyCard) children.push(cloudOnlyCard);
    if (ephemeralCard) children.push(ephemeralCard);
    children.push(back);
    open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, children));
  }

  // ============ EKRAN LOGOWANIA PASSKEY Z TELEFONU ============

  /**
   * Ekran „Zaloguj passkey z telefonu". Routing:
   *   1. Brak opts.storageMode → pokaż showLoginModeChooser, po wyborze rekurencja.
   *   2. opts.storageMode === 'ephemeral' → unlockWithPasskeyEphemeral (jak dotychczas).
   *   3. opts.storageMode === 'local' | 'cloud-only' → formularz hasła + unlockWithPasskeyAndPersist.
   *
   * Nazwa funkcji historyczna (showPasskeyEphemeralLoginScreen) — pozostawiamy
   * dla call-sites z głównego ekranu; faktyczny tryb decyduje opts.storageMode.
   */
  function showPasskeyEphemeralLoginScreen(options) {
    const V = getVault();
    if (!V || typeof V.unlockWithPasskeyEphemeral !== 'function') {
      showSyncCodeRestoreScreen();
      return;
    }
    const opts = (options && typeof options === 'object') ? options : {};

    // KROK 0: wybór trybu storage (chooser) — pełna analogia do showQRLoginScreen.
    let mode = null;
    if (opts.storageMode === 'local' || opts.storageMode === 'cloud-only' || opts.storageMode === 'ephemeral') {
      mode = opts.storageMode;
    }
    // Helper re-otwierający chooser z tymi samymi opcjami. Kluczowe: gdy user
    // pójdzie z chooser do passkey-screen, a potem da „Wróć", chce wrócić
    // do choosera (nie do entry-screen). Z kolei gdy user przyszedł z entry
    // BEZ chooser'a (sekcja „Zaloguj jednorazowo" omija chooser), opts.onBack
    // nie jest ustawione → passkey-screen domyślnie wraca do entry.
    function _reopenPasskeyChooser() {
      showLoginModeChooser({
        context: 'passkey',
        proGatingDeferred: true,
        onPick: function (pickedMode) {
          showPasskeyEphemeralLoginScreen({
            storageMode: pickedMode,
            onBack: _reopenPasskeyChooser
          });
        },
        onBack: function () { showSyncCodeRestoreScreen(); }
      });
    }
    if (mode === null) {
      if (typeof showLoginModeChooser === 'function') {
        _reopenPasskeyChooser();
        return;
      }
      // Defensywny fallback: ephemeral (najbezpieczniej).
      mode = 'ephemeral';
    }

    // UWAGA: defensive PRO guard usunięty z phone-login (analogicznie do showQR).
    // Na obcym komputerze localStorage cache PRO jest pusty — guard blokowałby
    // każdego użytkownika z aktywnym PRO. Walidacja jest deferred do post-unlock.

    // Konto persystowane (local/cloud-only) wymaga nowej ścieżki vault.
    const persistMode = (mode === 'local' || mode === 'cloud-only');
    if (persistMode && typeof V.unlockWithPasskeyAndPersist !== 'function') {
      // Vault za stary — pokaż chooser z hintem.
      if (typeof showLoginModeChooser === 'function') {
        _reopenPasskeyChooser();
        return;
      }
    }

    // ── UI ekranu ─────────────────────────────────────────────────────────────
    const titleText = (mode === 'ephemeral')
      ? 'Zaloguj telefonem (ta sesja)'
      : (mode === 'cloud-only' ? 'Zaloguj telefonem — tryb chmurowy' : 'Zaloguj telefonem — pełne konto');
    const subText = (function () {
      if (mode === 'ephemeral')  return 'Po sesji nie zostanie na tym komputerze żadna kopia. Potwierdź logowanie biometrią na telefonie.';
      if (mode === 'cloud-only') return 'Konto zostanie zapamiętane (hasło), ale dane pacjentów tylko w chmurze. Wpisz hasło, potem potwierdź biometrią na telefonie.';
      return 'Konto i kopia pacjentów zostaną na tym komputerze. Wpisz hasło, potem potwierdź biometrią na telefonie.';
    })();

    const title = el('h2', { class: 'vilda-auth-title', text: titleText });
    const sub = el('p', { class: 'vilda-auth-subtitle', text: subText });

    const errBox = el('div', { class: 'vilda-auth-error' });
    errBox.style.display = 'none';
    function showErr(msg) { errBox.textContent = msg || ''; errBox.style.display = msg ? '' : 'none'; }

    // Pole hasła tylko dla local/cloud-only (ephemeral nie tworzy konta).
    const pwIn = persistMode ? el('input', {
      type: 'password',
      class: 'vilda-auth-input',
      placeholder: 'Nowe hasło (min. 12 znaków, 3 z 4 typów)',
      autocomplete: 'new-password'
    }) : null;
    const pwHint = persistMode ? el('p', {
      class: 'vilda-auth-hint',
      text: 'To hasło będziesz wpisywać przy każdym kolejnym logowaniu na tym komputerze.'
    }) : null;

    const startBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary', type: 'button',
      text: persistMode ? '📱 Wpisałem hasło — potwierdź telefonem' : '📱 Zaloguj telefonem'
    });

    const qrFallbackBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-small', type: 'button',
      text: 'Nie działa? Zaloguj kodem QR'
    });
    qrFallbackBtn.style.display = 'none';
    qrFallbackBtn.addEventListener('click', function () {
      // Fallback respektuje wybrany mode (zamiast wymuszać ephemeral jak dotychczas).
      showQRLoginScreen({ storageMode: mode });
    });

    let inProgress = false;
    startBtn.addEventListener('click', async function () {
      if (inProgress) return;
      showErr('');
      // Walidacja hasła dla persist mode.
      const password = pwIn ? (pwIn.value || '') : null;
      if (persistMode) {
        if (password.length < 8) {
          showErr('Hasło musi mieć minimum 8 znaków.');
          return;
        }
      }
      inProgress = true;
      qrFallbackBtn.style.display = 'none';
      const orig = startBtn.textContent;
      startBtn.disabled = true;
      startBtn.textContent = 'Czekam na telefon…';
      try {
        if (persistMode) {
          // Cloud-only WYMAGA aktywnego sync — włączamy PRZED unlock'iem, żeby
          // listener onUnlock w sync_integration (notifyUnlock fire'uje SYNC w środku
          // adoptMasterBytes) zobaczył już ustawioną flagę. Inaczej forcePullForCloudOnly
          // wystrzeli CLOUD_ONLY_NO_SYNC banner zanim setSyncEnabled zdąży się wywołać
          // (race microtask order: rejection handler #1, await continuation #2).
          if (mode === 'cloud-only') {
            try {
              const SI = getSyncIntegration();
              if (SI && typeof SI.setSyncEnabled === 'function') SI.setSyncEnabled(true);
            } catch (_) { void _; }
          }
          await V.unlockWithPasskeyAndPersist(password, { storageMode: mode });
        } else {
          await V.unlockWithPasskeyEphemeral({});
        }
        hide(); // onUnlock w boot() przejmie dalej (render aplikacji)
      } catch (e) {
        const m = mapEphemeralLoginError(e);
        showErr(m.message);
        if (m.offerQrFallback) qrFallbackBtn.style.display = '';
        inProgress = false;
        startBtn.disabled = false;
        startBtn.textContent = orig;
      }
    });

    if (pwIn) {
      pwIn.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') startBtn.click(); });
    }

    const back = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost', type: 'button', text: '← Wróć',
      onclick: function () {
        // Decyzja gdzie wraca „Wróć":
        //   • opts.onBack jeśli podane (np. chooser przekazuje powrót do siebie)
        //   • inaczej → entry-screen (showSyncCodeRestoreScreen)
        // Wcześniej zawsze pokazywaliśmy chooser, co było mylące dla user'a który
        // kliknął „Zaloguj jednorazowo" w entry-screen (omijając chooser): „Wróć"
        // powinno wrócić tam skąd przyszedł, czyli do entry-screen.
        if (typeof opts.onBack === 'function') {
          opts.onBack();
        } else {
          showSyncCodeRestoreScreen();
        }
      }
    });

    const children = [title, sub];
    if (pwIn) children.push(pwIn, pwHint);
    children.push(startBtn, errBox, qrFallbackBtn, back);
    open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, children));
  }

  // ============ EKRAN LOGOWANIA KODEM QR ============

  /**
   * Ładuje bibliotekę QRCode.js z CDN (jednorazowo, lazy).
   * @returns {Promise<void>}
   */
  function loadQRCodeLib() {
    return new Promise(function (resolve, reject) {
      if (typeof QRCode !== 'undefined') { resolve(); return; }
      const s = global.document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      // SRI — chroni przed podmianą pliku po stronie CDN (supply-chain attack)
      s.integrity = 'sha384-3zSEDfvllQohrq0PHL1fOXJuC_jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2_bMnU';
      s.crossOrigin = 'anonymous';
      s.onload  = resolve;
      s.onerror = function () { reject(new Error('Nie udało się załadować biblioteki QR.')); };
      global.document.head.appendChild(s);
    });
  }

  /**
   * Ekran „Zaloguj się przez QR" — strona komputera (nowego urządzenia).
   *
   * Faza 1: wyświetla QR + odlicza 120s + polling.
   * Faza 2 (po zatwierdzeniu przez telefon): prosi o hasło i nazwę konta,
   *          tworzy lokalne konto z przeniesionym masterKey.
   */
  function showQRLoginScreen(options) {
    const V = getVault();
    if (!V || typeof V.initiateQRLogin !== 'function') {
      return; // brak wsparcia
    }
    const opts = (options && typeof options === 'object') ? options : {};

    // ── KROK 0: Wybór trybu storage (chooser) ────────────────────────────────
    // Mapowanie wejść:
    //   • opts.storageMode === 'local' | 'cloud-only' | 'ephemeral' → bezpośrednio
    //   • opts.ephemeral === true (legacy) → mode = 'ephemeral' (zachowanie wsteczne)
    //   • inaczej → pokaż chooser z 3 kafelkami, po wyborze rekursywne wywołanie
    //     showQRLoginScreen({ storageMode: <wybór> }) startujące właściwy flow.
    let mode = null;
    if (opts.storageMode === 'local' || opts.storageMode === 'cloud-only' || opts.storageMode === 'ephemeral') {
      mode = opts.storageMode;
    } else if (opts.ephemeral === true) {
      mode = 'ephemeral';
    }
    // availableModes — opcjonalny filtr listy kafelków (propagowany z entry-screen).
    // Gdy entry-screen sekcja „persistent" wywołuje QR → chooser pokazuje tylko
    // ['local','cloud-only'] (ephemeral jest osobną sekcją na entry-screen).
    const availableModes = Array.isArray(opts.availableModes) ? opts.availableModes : null;
    if (mode === null) {
      // Pokaż chooser — po wyborze user trafia z powrotem do showQRLoginScreen.
      // proGatingDeferred: na nowym/obcym komputerze nie znamy jeszcze userId,
      // więc nie możemy sprawdzić PRO. Wybór waliduje się POST-unlock przez
      // force-pull cloud-only (CLOUD_ONLY_NO_SYNC overlay jeśli brak sync/PRO).
      if (typeof showLoginModeChooser === 'function') {
        const chooserOpts = {
          context: 'qr',
          proGatingDeferred: true,
          onPick: function (pickedMode) { showQRLoginScreen({ storageMode: pickedMode }); },
          onBack: function () { showSyncCodeRestoreScreen(); }
        };
        if (availableModes) chooserOpts.availableModes = availableModes;
        showLoginModeChooser(chooserOpts);
        return;
      }
      // Fallback gdy chooser niedostępny — defaultuj na ephemeral (najbezpieczniej).
      mode = 'ephemeral';
    }
    // Ephemeral mode wymaga wsparcia w vault (legacy guard).
    const ephemeralMode = (mode === 'ephemeral')
      && typeof V.completeQRLoginEphemeral === 'function';
    if (mode === 'ephemeral' && !ephemeralMode) {
      // Vault nie wspiera ephemeral — wracamy do chooser, użytkownik wybierze co innego.
      if (typeof showLoginModeChooser === 'function') {
        const chooserOpts2 = {
          context: 'qr',
          proGatingDeferred: true,
          onPick: function (pickedMode) { showQRLoginScreen({ storageMode: pickedMode }); },
          onBack: function () { showSyncCodeRestoreScreen(); }
        };
        if (availableModes) chooserOpts2.availableModes = availableModes;
        showLoginModeChooser(chooserOpts2);
        return;
      }
    }

    // UWAGA: PRO check usunięty z phone-login flow. Powód: na obcym komputerze
    // localStorage cache PRO jest pusty, więc _hasProAccess() zawsze zwraca false
    // → blokowałoby cloud-only nawet dla user'ów z aktywnym PRO. Walidacja jest
    // deferred do post-unlock: jeśli user wybierze cloud-only bez aktywnego PRO,
    // force-pull rzuci CLOUD_ONLY_NO_SYNC i chrome overlay pokaże komunikat.

    // ── klucze sessionStorage ──
    const SS_PRIV  = 'vilda-qr-priv-v1';
    const SS_TOKEN = 'vilda-qr-token-v1';

    let pollTimer       = null;
    let countdown       = null;
    let timeLeft        = 120;
    let privateKeyB64u  = null;
    let transferToken   = null;
    let completeInProgress = false; // mutex: blokuje wielokrotne wywołanie completeQRLogin

    function clearSessionKeys() {
      try { if (global.sessionStorage) { global.sessionStorage.removeItem(SS_PRIV); global.sessionStorage.removeItem(SS_TOKEN); } } catch(_) {}
      privateKeyB64u = null; // wymaż z pamięci
    }

    function stopPolling() {
      if (pollTimer)   { clearInterval(pollTimer);   pollTimer  = null; }
      if (countdown)   { clearInterval(countdown);   countdown  = null; }
      clearSessionKeys();
    }

    // ── Faza 2: podaj hasło aby ukończyć logowanie ──
    function showPhase2(result) {
      // result = { encryptedPayload, label } zwrócone przez pollQRLoginStatus
      const encryptedPayload = result && result.encryptedPayload ? result.encryptedPayload : result;
      const transferredLabel = result && result.label ? result.label : null;

      // Zachowaj klucz prywatny PRZED stopPolling() — ta funkcja wywołuje
      // clearSessionKeys() → privateKeyB64u = null, a my potrzebujemy go w finishBtn.
      const savedPrivKey = privateKeyB64u;
      stopPolling();
      const title2 = el('h2', { class: 'vilda-auth-title', text: '✓ Prawie gotowe!' });
      const sub2Text = (function () {
        if (mode === 'ephemeral') return 'Zaloguj się na tę sesję — po zamknięciu nic nie zostanie na tym komputerze.';
        if (mode === 'cloud-only') return 'Podaj hasło — konto zostanie zapamiętane, ale dane pacjentów tylko w chmurze.';
        return 'Podaj hasło, aby zalogować się na tym urządzeniu.';
      })();
      const sub2 = el('p', { class: 'vilda-auth-subtitle', text: sub2Text });
      // W trybie efemerycznym hasło nie jest potrzebne (master key przyszedł transferem,
      // konto nie jest tworzone lokalnie).
      const pwIn = ephemeralMode ? null : el('input', {
        type: 'password', class: 'vilda-auth-input',
        placeholder: 'Twoje hasło'
      });
      const errBox2 = el('div', { class: 'vilda-auth-error' });
      errBox2.style.display = 'none';

      const finishBtn = el('button', {
        class: 'vilda-auth-btn vilda-auth-btn-primary', type: 'button',
        text: ephemeralMode ? 'Zaloguj (ta sesja)' : 'Zaloguj się'
      });

      finishBtn.addEventListener('click', async function () {
        if (completeInProgress) return; // mutex — blokuj równoległe wywołania
        errBox2.style.display = 'none';
        const password = pwIn ? pwIn.value : null;
        if (!ephemeralMode && !password) { errBox2.textContent = 'Podaj hasło.'; errBox2.style.display = ''; return; }

        completeInProgress = true;
        finishBtn.disabled = true;
        finishBtn.textContent = 'Loguję…';
        try {
          if (ephemeralMode) {
            await V.completeQRLoginEphemeral(savedPrivKey, encryptedPayload, transferredLabel);
          } else {
            // mode === 'local' lub 'cloud-only' — przekazujemy flagę do vault,
            // który zapisze ją w registry. Po unlock adapter cloud-only zostanie
            // automatycznie zastosowany (adoptMasterBytes → applyCloudOnlyAdapterIfNeeded).
            //
            // Cloud-only WYMAGA aktywnego sync (force-pull przy każdym loginie).
            // Flagę sync ustawiamy PRZED unlock'iem — listener onUnlock w sync_integration
            // strzela natychmiast (notifyUnlock fire'uje SYNC w środku adoptMasterBytes)
            // i sprawdza isSyncEnabled(). Bez tej kolejności pojawiał się banner
            // CLOUD_ONLY_NO_SYNC race condition (rejection handler #1, await continuation #2
            // w microtask FIFO queue).
            if (mode === 'cloud-only') {
              try {
                const SI = getSyncIntegration();
                if (SI && typeof SI.setSyncEnabled === 'function') SI.setSyncEnabled(true);
              } catch (_) { void _; }
            }
            await V.completeQRLogin(savedPrivKey, encryptedPayload, {
              newPassword: password,
              label: transferredLabel,
              storageMode: mode
            });
          }
          clearSessionKeys(); // defence-in-depth: usuń klucz prywatny jeśli stopPolling go nie wyczyścił
          hide();
          // onUnlock w boot() uruchomi interstitial sync automatycznie
        } catch (e) {
          completeInProgress = false; // zwolnij mutex tylko przy błędzie
          errBox2.textContent = (e && e.message) ? e.message : 'Błąd logowania. Sprawdź hasło.';
          errBox2.style.display = '';
          finishBtn.disabled = false;
          finishBtn.textContent = ephemeralMode ? 'Zaloguj (ta sesja)' : 'Zaloguj się';
        }
      });

      if (pwIn) pwIn.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') finishBtn.click(); });

      const phase2Children = [title2, sub2];
      if (pwIn) phase2Children.push(pwIn);
      phase2Children.push(errBox2, finishBtn);
      open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, phase2Children));
      if (pwIn) setTimeout(function () { try { pwIn.focus(); } catch(_) {} }, 30);
    }

    // ── Faza 1: wyświetl QR ──
    async function showPhase1() {
      // skeleton podczas inicjalizacji
      const loadingDiv = el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, [
        el('h2', { class: 'vilda-auth-title', text: 'Logowanie przez QR' }),
        el('p',  { class: 'vilda-auth-subtitle', text: 'Generuję kod QR…' })
      ]);
      open(loadingDiv);

      // Załaduj bibliotekę QR
      try {
        await loadQRCodeLib();
      } catch (e) {
        open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, [
          el('h2', { class: 'vilda-auth-title', text: 'Logowanie przez QR' }),
          el('p',  { class: 'vilda-auth-error', text: 'Nie udało się załadować biblioteki QR. Sprawdź połączenie z internetem.' }),
          el('button', { class: 'vilda-auth-btn vilda-auth-btn-ghost', type: 'button', text: '← Wróć',
            onclick: function () { showStartupScreen(); }
          })
        ]));
        return;
      }

      // Inicjuj sesję QR
      let initResult;
      try {
        initResult = await V.initiateQRLogin();
      } catch (e) {
        open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, [
          el('h2', { class: 'vilda-auth-title', text: 'Logowanie przez QR' }),
          el('p',  { class: 'vilda-auth-error', text: (e && e.message) || 'Błąd generowania kodu QR.' }),
          el('button', { class: 'vilda-auth-btn vilda-auth-btn-ghost', type: 'button', text: '← Wróć',
            onclick: function () { showStartupScreen(); }
          })
        ]));
        return;
      }

      privateKeyB64u = initResult.privateKeyB64u;
      transferToken  = initResult.transferToken;
      timeLeft       = initResult.expiresIn || 120;

      // Zapamiętaj w sessionStorage (na wypadek odświeżenia strony)
      try {
        if (global.sessionStorage) {
          global.sessionStorage.setItem(SS_PRIV,  privateKeyB64u);
          global.sessionStorage.setItem(SS_TOKEN, transferToken);
        }
      } catch(_) {}

      // ── Zbuduj UI ──
      const title = el('h2', { class: 'vilda-auth-title', text: 'Zaloguj się przez QR' });
      const sub   = el('p',  {
        class: 'vilda-auth-subtitle',
        text:  'Na zalogowanym urządzeniu (np. telefonie) otwórz Ustawienia → „Zatwierdź logowanie QR" i zeskanuj ten kod.'
      });

      // Kontener QR kodu
      const qrWrap = el('div', {
        style: 'display:flex;justify-content:center;margin:12px 0;'
      });
      const qrInner = el('div', {
        style: 'background:#fff;padding:12px;border-radius:12px;display:inline-block;box-shadow:0 2px 12px rgba(0,0,0,.10);'
      });
      qrWrap.appendChild(qrInner);

      // Licznik czasu
      const timerEl = el('p', {
        class: 'vilda-auth-side-note',
        style: 'text-align:center;margin:4px 0;',
        text:  'Kod ważny przez ' + timeLeft + ' sekund'
      });

      // Status
      const statusEl = el('p', {
        class: 'vilda-auth-side-note',
        style: 'text-align:center;margin:4px 0;color:#00838d;',
        text:  'Czekam na zatwierdzenie przez telefon…'
      });

      // ── Fallback ręczny: token jako tekst ──
      // Gdy urządzenie skanujące (to już zalogowane) nie ma kamery, użytkownik
      // może skopiować ten token i wkleić go ręcznie w polu „wklej token QR
      // ręcznie" w Ustawieniach → „Zatwierdź logowanie QR". Token NIE jest
      // sekretem sam w sobie — bez klucza prywatnego tego urządzenia jest
      // bezużyteczny (patrz SYNC-QR.md, model bezpieczeństwa).
      const tokenBox = el('div', {
        style: 'font-family:monospace;font-size:0.82rem;word-break:break-all;' +
               'user-select:all;-webkit-user-select:all;text-align:center;' +
               'background:rgba(0,0,0,.05);border-radius:8px;padding:8px 10px;' +
               'margin:0 auto 12px;max-width:280px;display:none;',
        text:  transferToken
      });
      const copyTokenBtn = el('button', {
        class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-small',
        type:  'button',
        text:  'Kopiuj token',
        style: 'display:none;margin:0 auto;',
        onclick: async function () {
          try {
            if (global.navigator && global.navigator.clipboard) {
              await global.navigator.clipboard.writeText(transferToken);
              copyTokenBtn.textContent = 'Skopiowano ✓';
              setTimeout(function () { copyTokenBtn.textContent = 'Kopiuj token'; }, 2000);
            }
          } catch (e) { logWarn('clipboard write failed: ' + e); }
        }
      });
      const noCameraToggle = el('button', {
        class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-subtle',
        type:  'button',
        text:  'Drugie urządzenie nie ma kamery? ▾',
        style: 'display:block;margin:10px auto 0;font-size:0.82rem;'
      });
      noCameraToggle.addEventListener('click', function () {
        const expanded = tokenBox.style.display !== 'none';
        tokenBox.style.display    = expanded ? 'none' : '';
        copyTokenBtn.style.display = expanded ? 'none' : 'block';
        noCameraToggle.textContent = expanded
          ? 'Drugie urządzenie nie ma kamery? ▾'
          : 'Drugie urządzenie nie ma kamery? ▴';
      });
      const manualWrap = el('div', { style: 'margin:4px 0 0;text-align:center;' }, [noCameraToggle, tokenBox, copyTokenBtn]);

      const back = el('button', {
        class: 'vilda-auth-btn vilda-auth-btn-ghost', type: 'button', text: '← Wróć',
        onclick: function () { stopPolling(); showStartupScreen(); }
      });

      open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, [
        title, sub, qrWrap, timerEl, manualWrap, statusEl,
        el('div', { class: 'vilda-auth-actions' }, [back])
      ]));

      // Wygeneruj QR kod
      try {
        /* global QRCode */
        new QRCode(qrInner, {
          text:         initResult.qrData,
          width:        200,
          height:       200,
          colorDark:    '#00464d',
          colorLight:   '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch(e) {
        statusEl.textContent = 'Błąd generowania QR: ' + (e.message || e);
        return;
      }

      // Odliczanie
      countdown = setInterval(function () {
        timeLeft--;
        timerEl.textContent = 'Kod ważny przez ' + timeLeft + ' sekund';
        if (timeLeft <= 0) {
          stopPolling();
          statusEl.textContent = '⏰ Kod wygasł. Wróć i wygeneruj nowy.';
          manualWrap.style.display = 'none'; // token nieaktualny — ukryj fallback ręczny
          back.textContent = 'Wygeneruj nowy kod';
          // Zachowaj wybrany mode przy regeneracji kodu — user nie musi ponownie
          // wybierać trybu storage skoro już to zrobił.
          back.onclick = function () { stopPolling(); showQRLoginScreen({ storageMode: mode }); };
        }
      }, 1000);

      // Polling co 1s
      // UWAGA: callback jest async — jeśli żądanie sieciowe trwa >1s, dwa ticki
      // mogą być jednocześnie „w locie". Po każdym await sprawdzamy czy pollTimer
      // nie został już wyczyszczony przez równoległy tick (który obsłużył payload
      // jako pierwszy). Bez tego sprawdzenia drugi tick też wołałby showPhase2,
      // ale po tym jak pierwszy zdążył wywołać stopPolling() → privateKeyB64u = null.
      pollTimer = setInterval(async function () {
        if (!transferToken || timeLeft <= 0) return;
        try {
          const payload = await V.pollQRLoginStatus(transferToken);
          // Sprawdź po await — inny równoległy tick mógł już obsłużyć payload
          if (!pollTimer) return;
          if (payload) {
            clearInterval(pollTimer); pollTimer = null;
            clearInterval(countdown); countdown = null;
            statusEl.textContent = '✓ Zatwierdzono!';
            setTimeout(function () { showPhase2(payload); }, 300);
          }
        } catch(_) { /* sieć — spróbujemy za 1s */ }
      }, 1000);
    }

    showPhase1();
  }

  // ============ EKSPORT API ============
  const api = {
    __vildaAuthUI: true,
    VERSION: VERSION,
    STEP: STEP,
    boot: boot,
    showStartupScreen: showStartupScreen,
    showEmptyStartupScreen: showEmptyStartupScreen,
    showUserPicker: showUserPicker,
    showSetupWizard: showSetupWizard,
    showLoginForUser: showLoginForUser,
    showPostLoginBiometricPrompt: showPostLoginBiometricPrompt,
    showPostLoginAdoptionPrompt: showPostLoginAdoptionPrompt,
    showRecoveryFlowForUser: showRecoveryFlowForUser,
    showPatientsList: showPatientsList,
    showPatientCard: showPatientCard,
    // P5 — Edycja pacjenta jako osobny ekran (przed: tab w karcie).
    showPatientEditScreen: showPatientEditScreen,
    // B1.8 / FIX — Edytor notatki pacjenta. Funkcja istniała od P4, ale była
    // używana TYLKO wewnętrznie (z karty pacjenta). B1.8 dodał wywołanie z
    // sidebar handlera w custom-fixes.js, który potrzebuje globalnego dostępu
    // przez window.VildaAuthUI. Bez tego eksportu klik „Dodaj notatkę do wizyty"
    // pokazywał tip „Moduł notatek niedostępny — odśwież stronę". Smoke
    // visit_note_button_smoke nie sprawdzał eksportu — ślepy spot.
    showPatientNoteEditor: showPatientNoteEditor,
    // P6.3 — Modal „+ Nowy pomiar" (wariant A). Wywoływany z pilla w hero karty
    // pacjenta i z sidebar (P6.4 `quickMeasureBtnSidebar`).
    showQuickMeasureModal: showQuickMeasureModal,
    // R2: reminder modal po-unlock — pokazuje pacjentów z notatkami due dziś + overdue.
    showRemindersModal: showRemindersModal,
    // R3: auto-trigger po unlock (raz na dzień, cloud-synced flag). Manual: { force: true }.
    maybeShowReminders: maybeShowReminders,
    showImportPatientsFlow: showImportPatientsFlow,
    showMergeAccountFlow: showMergeAccountFlow,
    showRestoreVaultFlow: showRestoreVaultFlow,
    showSyncCodeRestoreScreen: showSyncCodeRestoreScreen,
    showBackupCodeRestoreScreen: showBackupCodeRestoreScreen,
    showForcedPasswordResetScreen: showForcedPasswordResetScreen,
    showQRLoginScreen: showQRLoginScreen,
    showPasskeyEphemeralLoginScreen: showPasskeyEphemeralLoginScreen,
    showLoginModeChooser: showLoginModeChooser,
    mapEphemeralLoginError: mapEphemeralLoginError,
    hide: hide,
    lockAndShowLogin: lockAndShowLogin,
    isGuestMode: isGuestMode,
    exitGuestMode: exitGuestMode,
    setBusy: setBusy,
    updateProBadge: updateProBadge,
    isTrustedDevice: isTrustedDevice,
    setTrustedDevice: setTrustedDevice,
    TRUSTED_DEVICE_IDLE_MS: TRUSTED_DEVICE_IDLE_MS,
    getCloudOnlyIdlePref: getCloudOnlyIdlePref,
    setCloudOnlyIdlePref: setCloudOnlyIdlePref,
    CLOUD_ONLY_IDLE_CHOICES_MS: CLOUD_ONLY_IDLE_CHOICES_MS,
    effectiveIdleMs: effectiveIdleMs,
    getBiometricAutoTrigger: getBiometricAutoTrigger,
    setBiometricAutoTrigger: setBiometricAutoTrigger,
    getBiometricDismissCount: getBiometricDismissCount,
    resetBiometricDismissCount: function (uid) { setBiometricDismissCount(uid, 0); },
    getBiometricLabel: getBiometricLabel
  };

  global.VildaAuthUI = api;

  // automatyczny bootstrap po DOMContentLoaded
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', function () { boot(); }, { once: true });
    } else {
      try { boot(); } catch (e) { logError('autostart boot', e); }
    }
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
