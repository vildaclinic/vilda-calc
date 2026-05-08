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

  const VERSION = '2.5.0';
  const STEP = '8R-7b';
  const ROOT_ID = 'vilda-auth-ui-root';
  const IDLE_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'pointerdown'];
  const PWA_GUEST_FLAG = 'VildaGuestMode';

  let booted = false;
  let rootEl = null;
  let logoutBtnEl = null;
  let pendingSetupOptions = null;
  let idleHandlersBound = false;

  // ============ UTIL ============
  function getCrypto() { return global.VildaCrypto || null; }
  function getVault() { return global.VildaVault || null; }
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
      // W rogu pokazujemy „Zaloguj się” — żeby gość mógł wyjść z trybu
      // anonimowego bez przeładowania strony.
      showLoginButtonForGuest();
    } else {
      hideCornerBtn();
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
        return;
      }
      if (global.VildaDataImportExport && typeof global.VildaDataImportExport.clearAllData === 'function') {
        global.VildaDataImportExport.clearAllData();
      }
    } catch (e) {
      logError('resetAppSessionState (' + (reason || '') + ')', e);
    }
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

  function showLogoutButton() { rebuildCornerBtn('logout'); }
  function showLoginButtonForGuest() { rebuildCornerBtn('login'); }
  function hideCornerBtn() { if (logoutBtnEl) logoutBtnEl.style.display = 'none'; }
  function hideLogoutButton() { hideCornerBtn(); }

  // ============ MOUNT ROOT ============
  function ensureRoot() {
    if (rootEl) return rootEl;
    if (!global.document || !global.document.body) return null;
    const existing = global.document.getElementById(ROOT_ID);
    if (existing) { rootEl = existing; return rootEl; }
    rootEl = el('div', { id: ROOT_ID, class: 'vilda-auth-root', 'aria-live': 'polite' });
    rootEl.style.display = 'none';
    global.document.body.appendChild(rootEl);
    return rootEl;
  }

  function buildBrandHeader() {
    const logo = el('img', {
      class: 'vilda-auth-logo',
      src: 'logo_vilda.jpeg',
      alt: 'Waga i wzrost — Vilda Clinic'
    });
    const name = el('h1', { class: 'vilda-auth-brand-name', text: 'wagaiwzrost.pl' });
    const tag = el('p', { class: 'vilda-auth-brand-tag', text: 'Vilda Clinic' });
    return el('div', { class: 'vilda-auth-brand' }, [logo, name, tag]);
  }

  function open(content) {
    ensureRoot();
    if (!rootEl) return;
    clear(rootEl);
    const overlay = el('div', { class: 'vilda-auth-overlay' });
    const card = el('div', { class: 'vilda-auth-card', role: 'dialog', 'aria-modal': 'true' });
    card.appendChild(buildBrandHeader());
    card.appendChild(content);
    overlay.appendChild(card);
    rootEl.appendChild(overlay);
    rootEl.style.display = 'block';
  }

  function hide() {
    if (!rootEl) return;
    rootEl.style.display = 'none';
    clear(rootEl);
  }

  // ============ DYSPOZYTOR EKRANU STARTOWEGO ============
  async function showStartupScreen() {
    const V = getVault();
    if (!V) { logWarn('VildaVault niedostępny — pomijam ekran startowy.'); return; }
    // ekran startowy ZAWSZE = świeży stan tożsamości; przy okazji upewniamy się,
    // że nie zalega autosave z poprzedniej sesji ani guesta.
    resetAppSessionState('show-startup');
    hideCornerBtn();
    let users = [];
    try { users = await V.listUsers(); } catch (e) { logError('listUsers', e); }
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
    const buttons = el('div', { class: 'vilda-auth-buttons' });
    buttons.appendChild(el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Skonfiguruj zapisywanie pacjentów',
      onclick: function () { showSetupWizard(); }
    }));
    buttons.appendChild(el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: 'Odtwórz konto z pełnej kopii',
      onclick: function () { showRestoreVaultFlow(); }
    }));
    buttons.appendChild(el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: 'Korzystaj bez logowania',
      onclick: function () { setGuestMode(true); hide(); }
    }));
    const info = el('p', {
      class: 'vilda-auth-info',
      text: 'Ustalisz hasło dostępu oraz otrzymasz klucz awaryjny do odzyskania danych w razie zapomnienia hasła. Jeśli masz pełną kopię konta z innego urządzenia, możesz ją odtworzyć w jednym kliknięciu — konto i wszyscy pacjenci wrócą bez zmian.'
    });
    open(el('div', { class: 'vilda-auth-screen vilda-auth-startup' }, [title, subtitle, buttons, info]));
  }

  // ============ EKRAN WYBORU UŻYTKOWNIKA ============
  function showUserPicker(users) {
    const title = el('h2', { class: 'vilda-auth-title', text: 'Kto się loguje?' });
    const subtitle = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Wybierz konto, aby kontynuować, lub dodaj nowego użytkownika.'
    });

    const userList = el('div', { class: 'vilda-auth-user-list' });
    users.forEach(function (u) {
      const lastSeen = u.lastLoginAtISO ? formatRelativeISO(u.lastLoginAtISO) : '';
      const card = el('button', {
        class: 'vilda-auth-user-card',
        type: 'button',
        title: 'Zaloguj jako ' + u.label,
        onclick: function () { showLoginForUser(u.userId); }
      }, [
        el('div', { class: 'vilda-auth-user-avatar', text: (u.label || '?').charAt(0).toUpperCase() }),
        el('div', { class: 'vilda-auth-user-info' }, [
          el('div', { class: 'vilda-auth-user-name', text: u.label || 'Konto bez nazwy' }),
          lastSeen ? el('div', { class: 'vilda-auth-user-meta', text: 'Ostatnio: ' + lastSeen }) : null
        ]),
        el('span', { class: 'vilda-auth-user-arrow', 'aria-hidden': 'true', text: '›' })
      ]);
      userList.appendChild(card);
    });

    const addBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: '+ Dodaj nowego użytkownika',
      onclick: function () { showSetupWizard(); }
    });

    const restoreBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-subtle',
      type: 'button',
      text: 'Odtwórz konto z pełnej kopii',
      onclick: function () { showRestoreVaultFlow(); }
    });

    const guestBtn = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-subtle',
      type: 'button',
      text: 'Korzystaj bez logowania',
      onclick: function () { setGuestMode(true); hide(); }
    });

    open(el('div', { class: 'vilda-auth-screen vilda-auth-picker' }, [
      title, subtitle, userList,
      el('div', { class: 'vilda-auth-buttons' }, [addBtn, restoreBtn, guestBtn])
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

  function renderSetupStep1() {
    pendingSetupOptions = pendingSetupOptions || {};
    pendingSetupOptions.step = 1;

    const stepLabel = el('div', { class: 'vilda-auth-step', text: 'Krok 1 z 3' });
    const title = el('h2', { class: 'vilda-auth-title', text: 'Nowe konto' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Podaj swoje imię (np. „dr Kowalska”) i ustal hasło dostępu. Hasło min. 8 znaków, im dłuższe — tym lepiej.'
    });

    const labelInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input',
      placeholder: 'Twoje imię (np. dr Kowalska)',
      maxlength: '60'
    });
    if (pendingSetupOptions.label) labelInput.value = pendingSetupOptions.label;

    const pw1 = el('input', { type: 'password', class: 'vilda-auth-input', placeholder: 'Hasło (min. 8 znaków)' });
    const pw2 = el('input', { type: 'password', class: 'vilda-auth-input', placeholder: 'Powtórz hasło' });
    const errBox = el('div', { class: 'vilda-auth-error' });
    errBox.style.display = 'none';

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

    const next = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Dalej',
      onclick: function () {
        showError(errBox, '');
        if (pw1.value.length < 8) { showError(errBox, 'Hasło musi mieć minimum 8 znaków.'); return; }
        if (pw1.value !== pw2.value) { showError(errBox, 'Hasła nie są takie same.'); return; }
        pendingSetupOptions.password = pw1.value;
        pendingSetupOptions.label = labelInput.value.trim() || null;
        pendingSetupOptions.recoveryKey = (getCrypto() && getCrypto().generateRecoveryKey()) || null;
        renderSetupStep2();
      }
    });

    const back = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-ghost',
      type: 'button',
      text: 'Anuluj',
      onclick: function () { pendingSetupOptions = null; showStartupScreen(); }
    });

    open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, [
      stepLabel, title, sub, labelInput, pw1,
      el('div', { class: 'vilda-auth-meter-wrap' }, [meter, meterLabel]),
      pw2, errBox,
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

    const stepLabel = el('div', { class: 'vilda-auth-step', text: 'Krok 2 z 3' });
    const title = el('h2', { class: 'vilda-auth-title', text: 'Klucz odzyskiwania' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Zapisz ten klucz w bezpiecznym miejscu (kartka w sejfie, menedżer haseł). Bez niego utrata hasła = utrata wszystkich danych pacjentów.'
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

    const confirmInput = el('input', {
      type: 'text',
      class: 'vilda-auth-input vilda-auth-recovery-input',
      placeholder: 'Wpisz klucz, aby potwierdzić, że go zapisałeś',
      autocomplete: 'off'
    });
    const errBox = el('div', { class: 'vilda-auth-error' });
    errBox.style.display = 'none';

    const next = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Dalej',
      onclick: async function () {
        showError(errBox, '');
        const C = getCrypto();
        if (!C) { showError(errBox, 'Brak modułu kryptograficznego.'); return; }
        const expected = C.normalizeRecoveryKey(opts.recoveryKey);
        const typed = C.normalizeRecoveryKey(confirmInput.value);
        if (expected !== typed) {
          showError(errBox, 'Wpisany klucz nie zgadza się z wygenerowanym. Skopiuj go ponownie albo pobierz plik.');
          return;
        }
        setBusy(true);
        try {
          const V = getVault();
          await V.createUser(opts.password, {
            label: opts.label,
            recoveryKey: opts.recoveryKey
          });
          renderSetupStep3();
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
      stepLabel, title, sub, keyBox, tools, confirmInput, errBox,
      el('div', { class: 'vilda-auth-actions' }, [back, next])
    ]));
  }

  function renderSetupStep3() {
    pendingSetupOptions = null;

    const stepLabel = el('div', { class: 'vilda-auth-step', text: 'Krok 3 z 3' });
    const check = el('div', { class: 'vilda-auth-success-check', text: '✓' });
    const title = el('h2', { class: 'vilda-auth-title', text: 'Wszystko gotowe' });
    const sub = el('p', {
      class: 'vilda-auth-subtitle',
      text: 'Konto skonfigurowane i odblokowane. Możesz zapisywać dane pacjentów. Po 20 minutach bezczynności zostaniesz automatycznie wylogowany.'
    });

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
    open(el('div', { class: 'vilda-auth-screen vilda-auth-setup' }, [
      stepLabel, check, title, sub, backupSection, importSection,
      el('div', { class: 'vilda-auth-actions vilda-auth-actions-center' }, [done])
    ]));
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
    const hasBiometric = prfOk && passkeys.length > 0;

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
    let biometricSection = null;
    if (hasBiometric) {
      const biometricBtn = el('button', {
        class: 'vilda-auth-btn vilda-auth-btn-biometric',
        type: 'button',
        text: '🪪  Face ID / odcisk palca'
      });
      biometricBtn.addEventListener('click', async function () {
        showError(errBox, '');
        setBusy(true);
        try {
          await V.unlockWithPasskey(userId, null);
          hide();
          startIdleWatch();
        } catch (e) {
          showError(errBox, e && e.message ? e.message : 'Logowanie biometryczne nie powiodło się.');
        } finally {
          setBusy(false);
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
    const pw = el('input', { type: 'password', class: 'vilda-auth-input', placeholder: 'Hasło' });
    const submit = el('button', {
      class: 'vilda-auth-btn vilda-auth-btn-primary',
      type: 'button',
      text: 'Zaloguj się',
      onclick: async function () {
        showError(errBox, '');
        if (!pw.value) { showError(errBox, 'Wpisz hasło.'); return; }
        setBusy(true);
        try {
          await V.unlockUser(userId, pw.value);
          // Pokaż propozycję biometrii po pierwszym zalogowaniu hasłem (jeśli stosowne)
          showPostLoginBiometricPrompt(userId);
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

    const screenChildren = [title, sub, banner];
    if (biometricSection) screenChildren.push(biometricSection);
    screenChildren.push(pw, errBox,
      el('div', { class: 'vilda-auth-actions' }, [submit]),
      el('div', { class: 'vilda-auth-links' }, [backToList]),
      el('div', { class: 'vilda-auth-links' }, [forgot])
    );

    const screen = el('div', { class: 'vilda-auth-screen vilda-auth-login' }, screenChildren);
    open(screen);

    // Jeśli biometria dostępna — od razu uruchom Face ID, nie czekaj na klik
    if (hasBiometric && !opts.skipAutoPasskey) {
      setTimeout(async function () {
        try {
          setBusy(true);
          showError(errBox, '');
          await V.unlockWithPasskey(userId, null);
          hide();
          startIdleWatch();
        } catch (_) {
          // Użytkownik anulował lub coś poszło nie tak — pokaż formularz hasła
          setBusy(false);
          try { pw.focus(); } catch (_) {}
        }
      }, 100);
    } else {
      setTimeout(function () { try { pw.focus(); } catch (_) {} }, 30);
    }
  }

  /**
   * Wyświetla jednorazową propozycję włączenia biometrii po zalogowaniu hasłem.
   * Pokazuje się tylko raz (flaga w localStorage) i tylko gdy PRF jest wspierany
   * i użytkownik nie ma jeszcze żadnych passkeys.
   *
   * @param {string} userId
   */
  async function showPostLoginBiometricPrompt(userId) {
    const V = getVault();
    if (!V) return;

    const flagKey = 'vilda:biometricPromptShown:' + userId;

    let prfOk = false;
    let passkeys = [];
    try {
      prfOk = await V.isPrfSupported();
      if (prfOk) passkeys = await V.listPasskeys(userId);
    } catch (_) { return; }

    // Pokaż tylko gdy PRF dostępny i brak już zarejestrowanego passkey
    if (!prfOk || passkeys.length > 0) return;

    // Jeśli PRF teraz działa ale flaga mogła być ustawiona zanim naprawiliśmy
    // detekcję — sprawdź czy passkeys naprawdę są puste (już sprawdzone wyżej).
    // Flaga blokuje ponowne pokazanie TYLKO gdy passkey już był zarejestrowany lub
    // użytkownik świadomie wybrał "Nie teraz" przy działającym PRF.
    // Czyścimy starą flagę jeśli brak passkeys — znaczy PRF wcześniej nie działał.
    if (localStorage.getItem(flagKey) && passkeys.length === 0) {
      // Flaga ustawiona, ale brak passkey — mogła być zapisana przez stary buggy kod.
      // Reset żeby użytkownik mógł zobaczyć prompt.
      localStorage.removeItem(flagKey);
    }

    // Sprawdź jeszcze raz po ewentualnym resecie flagi
    if (localStorage.getItem(flagKey)) return;

    // Oznacz jako pokazany — dopiero teraz, tuż przed renderowaniem
    localStorage.setItem(flagKey, new Date().toISOString());

    const overlay = el('div', { class: 'vilda-auth-overlay vilda-auth-overlay-sheet' });
    const sheet = el('div', { class: 'vilda-auth-sheet' }, [
      el('h3', { class: 'vilda-auth-sheet-title', text: 'Chcesz logować się przez Face ID?' }),
      el('p', {
        class: 'vilda-auth-sheet-body',
        text: 'Następnym razem jeden dotyk wystarczy — bez wpisywania hasła.'
      }),
      el('div', { class: 'vilda-auth-sheet-actions' }, [
        el('button', {
          class: 'vilda-auth-btn vilda-auth-btn-primary',
          type: 'button',
          text: 'Tak, włącz Face ID',
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
    const pw1 = el('input', { type: 'password', class: 'vilda-auth-input', placeholder: 'Nowe hasło (min. 8 znaków)' });
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
        fileLabel.textContent = '✓ Pełna kopia konta „' + lbl + '" — pacjenci: ' + pCount + ', snapshoty: ' + sCount;
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
          reportBox.appendChild(global.document.createTextNode('Pacjenci: ' + result.patientCount + ' · snapshoty: ' + result.snapshotCount));
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
      var ageMo = ((m.ageYears || 0) * 12) + (m.ageMonths || 0);
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

  // ============ KARTA INDYWIDUALNEGO PACJENTA ============
  /**
   * Otwiera szczegółową kartę pacjenta z jego statystykami i sparkline.
   * @param {string} patientId   — ID z listPatients()
   * @param {Function|null} onPick — callback do wczytania danych (null = viewOnly)
   * @param {object} listOptions  — opcje przekazywane z powrotem do showPatientsList
   */
  async function showPatientCard(patientId, onPick, listOptions) {
    var V = getVault();
    if (!V || !V.isUnlocked()) return;

    // Pokaż skeleton ładowania
    open(el('div', { class: 'vilda-auth-screen vilda-auth-patient-card' }, [
      el('h2', { class: 'vilda-auth-title', text: 'Karta pacjenta' }),
      el('p', { class: 'vilda-auth-subtitle', text: 'Wczytywanie danych…' })
    ]));
    setBusy(true);

    var snap = null;
    try { snap = await V.getLatestSnapshot(patientId); }
    catch (e) { logError('showPatientCard getLatestSnapshot', e); }
    setBusy(false);

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
      ]));
      return;
    }

    var payload = snap.payload;

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
    var totalAgeMonths = (age != null && ageMonths != null)
      ? (age * 12 + ageMonths)
      : (age != null ? age * 12 : null);

    // ── Dane wzrostowe (sparkline + prędkość) ──
    var measurements = (growthData.measurements || []).filter(function (m) {
      return m && m.height != null;
    });
    var growthVelocity = growthData.growthVelocity != null ? growthData.growthVelocity : null;
    var isLosingGrowth = !!growthData.isLosingGrowth;
    var isSlowVelocity = !!growthData.isSlowVelocity;

    // ── BMI ──
    var bmi = null;
    if (height != null && weight != null && height > 0) {
      bmi = weight / Math.pow(height / 100, 2);
    }

    // ── Centyle — używaj globalnych funkcji aplikacji gdy dostępne ──
    var heightPerc = null, weightPerc = null, bmiPerc = null;
    var isAdult = (totalAgeMonths != null && totalAgeMonths >= 216); // 18 lat
    var sexForCalc = sex; // M/K lub chłopiec/dziewczynka — funkcje obsługują oba formaty
    try {
      if (!isAdult && age != null && typeof calcPercentileStats === 'function') {
        if (height != null) {
          var sH = calcPercentileStats(height, sexForCalc, age, 'HT');
          if (sH && sH.percentile != null) heightPerc = sH.percentile;
        }
        if (weight != null) {
          var sW = calcPercentileStats(weight, sexForCalc, age, 'WT');
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
        if (type === 'height') return (perc != null && (perc < 3 || perc > 97)) ? 'alert' : null;
        if (type === 'weight') return (perc != null) ? (perc >= 97 || perc < 3 ? 'alert' : perc >= 90 ? 'improve' : null) : null;
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
    function statEl(label, value, sub, status) {
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
      return el('div', { class: cls }, children);
    }

    function fmtNum(n, dec) {
      if (n == null || !isFinite(n)) return null;
      return n.toFixed(dec != null ? dec : 1).replace('.', ',');
    }

    // ── Statystyki ──
    var statsChildren = [];

    // Wzrost
    var hStatus = classify('height', height, heightPerc);
    var hSub = heightPerc != null ? fmtCentyl(heightPerc) : null;
    if (height != null) statsChildren.push(statEl('Wzrost', fmtNum(height) + ' cm', hSub, hStatus));

    // Waga
    var wStatus = classify('weight', weight, weightPerc);
    var wSub = weightPerc != null ? fmtCentyl(weightPerc) : null;
    if (weight != null) statsChildren.push(statEl('Waga', fmtNum(weight) + ' kg', wSub, wStatus));

    // BMI
    var bmiStatus = classify('bmi', bmi, bmiPerc);
    var bmiSub = bmiPerc != null ? fmtCentyl(bmiPerc) : null;
    if (bmi != null) statsChildren.push(statEl('BMI', fmtNum(bmi), bmiSub, bmiStatus));

    // Wskaźnik Cole'a
    var coleStatus = classify('cole', cole, null);
    if (cole != null) statsChildren.push(statEl("Wskaźnik Cole'a", fmtNum(cole) + '%', null, coleStatus));

    // Prędkość wzrastania
    if (growthVelocity != null) {
      var velWarn = isLosingGrowth ? '⚠ zahamowanie wzrostu'
        : isSlowVelocity          ? '⚠ wolna prędkość'      : null;
      var velStatus = (isLosingGrowth || isSlowVelocity) ? 'improve' : null;
      statsChildren.push(statEl('Prędkość wzrastania', fmtNum(growthVelocity) + ' cm/rok', velWarn, velStatus));
    }

    // MPH (Mid-Parental Height)
    if (mph != null) {
      var mphSub = mphPerc != null ? fmtCentyl(mphPerc) : null;
      statsChildren.push(statEl('MPH', fmtNum(mph) + ' cm', mphSub, null));
    }

    // Źródło siatek centylowych
    if (dataSourceLabel) {
      statsChildren.push(statEl('Siatki centylowe', dataSourceLabel, null, null));
    }

    // ── Nagłówek karty (avatar + imię) ──
    var ageStr = '';
    if (age != null) {
      ageStr = age + ' lat';
      if (ageMonths != null && ageMonths > 0) {
        ageStr += ' i ' + ageMonths + (ageMonths === 1 ? ' miesiąc' : ageMonths < 5 ? ' miesiące' : ' miesięcy');
      }
    }
    var headerMeta = [ageStr, sex].filter(Boolean).join(' · ');
    var lastSavedStr = (snap.savedAtISO || snap.lastSavedAtISO)
      ? formatRelativeISO(snap.savedAtISO || snap.lastSavedAtISO) : '';

    var headerDiv = el('div', { class: 'vilda-auth-user-card vilda-patient-card-header' }, [
      el('div', { class: 'vilda-auth-user-avatar', text: name.charAt(0).toUpperCase() }),
      el('div', { class: 'vilda-auth-user-info' }, [
        el('div', { class: 'vilda-auth-user-name', text: name }),
        headerMeta   ? el('div', { class: 'vilda-auth-user-meta', text: headerMeta })              : null,
        lastSavedStr ? el('div', { class: 'vilda-auth-user-meta', text: 'Ostatni wpis: ' + lastSavedStr }) : null
      ].filter(Boolean))
    ]);

    // ── Sparkline ──
    var sparklineWrap = null;
    if (measurements.length >= 2) {
      var svgEl = buildHeightSparkline(measurements);
      if (svgEl) {
        sparklineWrap = el('div', { class: 'vilda-patient-sparkline-wrap' }, [
          el('div', { class: 'vilda-patient-sparkline-label', text: 'Wzrost w czasie' }),
          svgEl
        ]);
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
        onclick: function () { onPick(payload); hide(); }
      });
    }

    // ── Złożenie ekranu ──
    var screenChildren = [
      el('h2', { class: 'vilda-auth-title', text: 'Karta pacjenta' }),
      headerDiv
    ];
    if (statsChildren.length > 0) {
      screenChildren.push(el('div', { class: 'vilda-patient-stats-grid' }, statsChildren));
    }
    if (sparklineWrap) screenChildren.push(sparklineWrap);
    screenChildren.push(
      el('div', { class: 'vilda-auth-actions' },
        loadBtn ? [backBtn, loadBtn] : [backBtn]
      )
    );

    open(el('div', { class: 'vilda-auth-screen vilda-auth-patient-card' }, screenChildren));
  }

  // ============ LISTA PACJENTÓW ============
  async function showPatientsList(onPick, options) {
    const V = getVault();
    if (!V || !V.isUnlocked()) return;
    const opts = options || {};
    let patients = [];
    try { patients = await V.listPatients(); } catch (e) { logError('listPatients', e); }

    // Sortujemy malejąco po dacie ostatniego zapisu — najnowsi pacjenci na górze.
    patients = patients.slice().sort(function (a, b) {
      var ta = a && a.lastSavedAtISO ? Date.parse(a.lastSavedAtISO) : 0;
      var tb = b && b.lastSavedAtISO ? Date.parse(b.lastSavedAtISO) : 0;
      return (tb || 0) - (ta || 0);
    });

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

    // Scrollowalny kontener listy — max ~5 kart widocznych, reszta pod scrollem
    // wewnątrz tego kontenera, żeby modal nie rósł do nieba przy 100+ pacjentach.
    const list = el('div', { class: 'vilda-auth-user-list vilda-auth-patients-scroll' });
    const emptyResult = el('div', { class: 'vilda-auth-search-empty', text: 'Brak pasujących pacjentów.' });
    emptyResult.hidden = true;
    list.appendChild(emptyResult);

    // Trzymamy referencje do par (card, normalizedName) dla szybkiego filtrowania.
    const cards = [];

    patients.forEach(function (p) {
      const headerName = (p.header && p.header.name) ? p.header.name : '(bez imienia)';
      const lastSeen = p.lastSavedAtISO ? formatRelativeISO(p.lastSavedAtISO) : '';
      const ageStr = (p.header && p.header.age != null) ? (p.header.age + ' lat') : '';
      const sexStr = (p.header && p.header.sex) ? p.header.sex : '';
      const meta = [
        lastSeen ? 'Zapisano: ' + lastSeen : '',
        p.snapshotCount ? p.snapshotCount + (p.snapshotCount === 1 ? ' wpis' : ' wpisów') : '',
        ageStr,
        sexStr
      ].filter(function (x) { return x && x.length; }).join(' · ');

      const card = el('button', {
        class: 'vilda-auth-user-card',
        type: 'button',
        title: 'Zobacz kartę: ' + headerName,
        onclick: function () {
          showPatientCard(p.patientId, onPick, opts);
        }
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
    });

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
      children.push(el('div', { class: 'vilda-auth-search-wrap' }, [searchInput, resultsCounter]));
    }
    children.push(list);
    children.push(el('div', { class: 'vilda-auth-actions' }, [cancel, importBtn]));

    open(el('div', { class: 'vilda-auth-screen vilda-auth-patients' }, children));
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
                text: pCount + ' pacj. · ' + sCount + ' wizyt' + (expAt ? ' · eksport: ' + expAt : '') }),
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
        'Dodanych snapshotów: ' + summary.addedSnapshots,
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

  function startIdleWatch() {
    const V = getVault();
    if (!V) return;
    bindIdleHandlers();
    try { V.startIdleTimer(V.DEFAULT_IDLE_LOCK_MS); } catch (_) {}
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
      getVault().onLock(function () {
        hideLogoutButton();
        // Wylogowanie/auto-lock = porzucenie tożsamości. Wyczyść stan aplikacji,
        // żeby kolejny user (lub gość) nie zobaczył danych poprzedniego.
        resetAppSessionState('on-lock');
        if (isGuestMode()) return;
        // po blokadzie wracamy do ekranu startowego (lista użytkowników)
        showStartupScreen();
      });
      getVault().onUnlock(function () {
        // Logowanie zawsze unieważnia tryb gościa — także gdy user wszedł
        // wcześniej jako gość, a potem zalogował się przez przycisk w rogu.
        if (isGuestMode()) {
          global[PWA_GUEST_FLAG] = false;
          persistGuestFlag(false);
        }
        showLogoutButton();
        startIdleWatch();
      });
    } catch (e) { logError('boot: listenery', e); }

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
      text: 'Podaj hasło do tej kopii. Aplikacja sprawdzi, które wizyty już masz, i doda tylko brakujące — bez usuwania ani nadpisywania istniejących danych.'
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
            text:  'Pacjenci do uzupełnienia wizyt (' + plan.mergePatients.length + ')'
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
                  ? 'brak nowych (wszystkie wizyty już są)'
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
                text:  p.snapshotCount + ' ' + (p.snapshotCount === 1 ? 'wizyta' : 'wizyty/wizyt')
              })
            ]);
            previewBox.appendChild(row);
          });
        }

        // Podsumowanie
        const summaryParts = [];
        if (plan.totalNewSnapshots > 0)   summaryParts.push(plan.totalNewSnapshots + ' nowych wizyt zostanie dodanych');
        if (plan.totalNewSnapshots === 0)  summaryParts.push('Brak nowych danych — wszystko już masz');
        if (plan.addPatients.length > 0)   summaryParts.push(plan.addPatients.length + ' nowych pacjentów');

        previewBox.appendChild(el('div', {
          style: 'margin-top:14px; padding:10px 12px; background:rgba(0,131,141,0.06); border-radius:10px; font-size:0.87rem; color:#002830; font-weight:600;',
          text:  summaryParts.join(' · ')
        }));

        previewBox.style.display = 'block';

        if (plan.totalNewSnapshots > 0 || plan.addPatients.length > 0) {
          mergeBtn.style.display = '';
          mergeBtn.textContent   = 'Scal teraz (' + plan.totalNewSnapshots + ' nowych wizyt' +
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
          lines.push('🔀 Uzupełniono wizyty u ' + result.mergedPatientCount + ' pacjentów');
        if (result.addedSnapshotCount > 0)
          lines.push('✓ Łącznie dodano ' + result.addedSnapshotCount + ' wizyt');
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
    showRecoveryFlowForUser: showRecoveryFlowForUser,
    showPatientsList: showPatientsList,
    showPatientCard: showPatientCard,
    showImportPatientsFlow: showImportPatientsFlow,
    showMergeAccountFlow: showMergeAccountFlow,
    showRestoreVaultFlow: showRestoreVaultFlow,
    hide: hide,
    lockAndShowLogin: lockAndShowLogin,
    isGuestMode: isGuestMode,
    exitGuestMode: exitGuestMode,
    setBusy: setBusy
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
