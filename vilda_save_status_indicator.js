/**
 * vilda_save_status_indicator.js — Wskaźnik statusu zapisu danych pacjenta.
 *
 * Wersja: 0.6 (Faza 6 — mount w nagłówku + fix bug pustego formularza)
 *
 * Cel: pokazać użytkownikowi, czy aktualny stan formularza odpowiada ostatniemu
 * zapisanemu snapshotowi w vault (analogicznie do paska statusu Google Docs).
 *
 * Architektura:
 *   • Source of truth dla fingerprintu: window.collectUserData() (zwraca ten sam
 *     obiekt, który trafia do vault.savePatient → snapshot).
 *   • Sygnał „zapisane": VildaVault.onPatientSaved (gotowy event-hook).
 *   • Sygnał „zmiana": listenery input/change na document (debounced 250 ms).
 *   • Sygnał lifecycle: VildaVault.onUnlock / onLock.
 *
 * Mount: body level (fixed position) — niezależny od display:none parenta sidebara.
 * Responsywne pozycjonowanie w CSS: desktop top-left (obszar sidebara),
 * mobile top-right (kompaktowy pill z samą ikoną).
 *
 * Faza 2 dodaje DOM rendering. Tooltip i eventy patient-loaded/json-imported
 * wchodzą w Fazach 3-5.
 *
 * Test hooks (dla smoke testu): _onFormChange, _onUnlock, _onLock,
 * _onPatientSaved, _computeFormFingerprint, _setReferenceFingerprint,
 * _forceTransition, STATES.
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
  var _indicatorEl = null; // <div id="saveStatusIndicator"> wewnątrz nagłówka, lazy mounted
  var _tooltipEl = null;   // <div id="saveStatusTooltip"> w body, lazy mounted
  var _tooltipVisible = false;
  var _tooltipShowTimer = null;
  var _tooltipHideTimer = null;
  var _tooltipHandlersAttached = false;
  var _mountObserver = null;     // MutationObserver czekający na pojawienie się hosta
  var _resizeDebounceTimer = null;
  var _currentBreakpoint = null; // 'desktop' | 'mobile' — żeby remountować przy resize
  var _vaultUnlocked = false;    // własny snapshot stanu vault (niezależny od polling)

  // ── Pure functions ─────────────────────────────────────────────

  /**
   * Liczy fingerprint formularza przez wywołanie collectUserData() i
   * stringify wyniku (z wycięciem nondeterministycznego timestampISO).
   * Zwraca string lub null gdy collectUserData niedostępne / zwróciło null.
   */
  function computeFormFingerprint() {
    if (typeof global.collectUserData !== 'function') return null;
    try {
      var data = global.collectUserData({ source: 'save-status-indicator' });
      if (!data) return null;
      // timestampISO zmienia się przy każdym wywołaniu — wyciąć przed hashowaniem.
      delete data.timestampISO;
      return JSON.stringify(data);
    } catch (_) { return null; }
  }

  /**
   * Heurystyka „formularz w zasadzie pusty" — gdy zwraca true, wskaźnik powinien
   * pozostać HIDDEN zamiast pokazywać NEW_PATIENT/SAVED. Stosowane głównie tuż po
   * unlock vault — świeży login bez wybranego pacjenta NIE powinien sugerować
   * że coś jest „zapisane".
   *
   * Warunki „minimalny pacjent": nazwa + co najmniej jeden pomiar (waga/wzrost/wiek).
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
      return !(hasName && hasMeasure);
    } catch (_) { return true; }
  }

  /**
   * "2 min temu" / "godz. temu" / "dzień temu" — wzorowane na vilda_auth_ui.js.
   */
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

  // ── State transitions ──────────────────────────────────────────

  function transition(newState) {
    if (newState === _state) return;
    var oldState = _state;
    _state = newState;
    if (newState === STATES.DIRTY) _dirtyStartedAt = Date.now();
    if (newState === STATES.SAVED) _dirtyStartedAt = null;
    if (newState === STATES.HIDDEN) {
      _dirtyStartedAt = null;
    }
    // Faza 1: log dla debugowania, render dziedziczony (na razie tylko global state).
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
    if (global.VildaGuestMode === true) return; // guest mode pozostaje HIDDEN
    // Vault zalokowany / niezainicjalizowany → no-op (HIDDEN się utrzymuje).
    // _vaultUnlocked jest ustawiana w onUnlock/onLock (własny snapshot stanu,
    // nie polling) — bezpieczna w kontekście testów i nawigacji między podstronami.
    if (!_vaultUnlocked) return;
    // Specjalny przypadek: wskaźnik HIDDEN przy unlocked vault (pusty formularz po
    // świeżym loginie) — gdy user wpisze dane pacjenta, przechodzimy w NEW_PATIENT.
    if (_state === STATES.HIDDEN) {
      if (!isFormMostlyEmpty()) {
        _referenceFingerprint = null;
        transition(STATES.NEW_PATIENT);
      }
      return;
    }
    if (_referenceFingerprint == null) {
      // Brak referencji = NEW_PATIENT (po imporcie JSON, lub świeżo wpisany pacjent).
      // Ale jeśli user wyczyścił wszystkie pola → wracamy do HIDDEN.
      if (isFormMostlyEmpty()) {
        transition(STATES.HIDDEN);
      } else if (_state !== STATES.NEW_PATIENT) {
        transition(STATES.NEW_PATIENT);
      }
      return;
    }
    var current = computeFormFingerprint();
    if (current === null) return; // collectUserData niedostępne — ignoruj
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
    // Tryb gość → wskaźnik niedostępny
    if (global.VildaGuestMode === true) { transition(STATES.HIDDEN); return; }
    // Pusty formularz po świeżym loginie (bez wybranego pacjenta) → HIDDEN.
    // Wskaźnik nie powinien sugerować „Zapisane" gdy nie ma czego zapisywać.
    // Dopiero gdy user wpisze dane lub wczyta pacjenta (event patient-loaded),
    // wskaźnik się pojawi.
    if (isFormMostlyEmpty()) {
      _referenceFingerprint = null;
      transition(STATES.HIDDEN);
      return;
    }
    // Formularz ma dane → przyjmujemy że pochodzą z ostatniego snapshotu
    // (restoreAll po tryRestoreSession lub po wczytaniu pacjenta).
    _referenceFingerprint = computeFormFingerprint();
    transition(STATES.SAVED);
  }

  function onLock() {
    _vaultUnlocked = false;
    // Reset wszystkich pól stanu, ukryj wskaźnik
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
    // Po zapisie: nowy fingerprint = aktualny stan formularza = nowa referencja.
    _referenceFingerprint = computeFormFingerprint();
    transition(STATES.SAVED);
  }

  /**
   * Faza 4: handler eventu vilda:patient-loaded (wczytanie pacjenta z listy vault).
   * applyLoadedData może być częściowo asynchroniczne (setTimeout w restoreClcrSession itp.),
   * więc fingerprint liczymy z drobnym opóźnieniem — daje DOM-owi czas się zaktualizować.
   */
  function onPatientLoadedHandler(info) {
    _lastSavedAtISO = (info && info.savedAtISO) || null;
    _lastSnapshotCount = (info && info.snapshotCount) || null;
    _lastPatientName = (info && info.name) || null;
    _lastError = null;
    // Anuluj ewentualny debouncedOnFormChange (input listenery wystrzelone
    // przez applyLoadedData) — żeby nie nadpisał nas zaraz po setTimeout.
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    // 150 ms daje czas applyLoadedData + restoreClcrSession na zapełnienie pól.
    setTimeout(function () {
      _referenceFingerprint = computeFormFingerprint();
      transition(STATES.SAVED);
    }, 150);
  }

  /**
   * Faza 5: handler eventu vilda:json-imported (wczytanie pliku JSON).
   * Plik JSON to NIE snapshot w vault — formularz jest wypełniony, ale nie ma karty
   * pacjenta dla tych danych. Stan = NEW_PATIENT (user musi kliknąć Zapisz dane).
   */
  function onJsonImportedHandler(info) {
    _lastSavedAtISO = null;
    _lastSnapshotCount = null;
    _lastPatientName = (info && info.name) || null;
    _lastError = null;
    // Wymuszenie NEW_PATIENT: brak referencyjnego fingerprintu = wskaźnik wie
    // "to nie pasuje do żadnego snapshotu w vault".
    _referenceFingerprint = null;
    // Anuluj pending debounce (input listenery z applyLoadedData mogłyby nas wyprzedzić).
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    // 150 ms — czas dla applyLoadedData + clcrRuntime.restoreFromSession.
    setTimeout(function () {
      transition(STATES.NEW_PATIENT);
    }, 150);
  }

  function onSaveClicked() {
    // Wczesna sygnalizacja "zapisuję" — actual SAVED przyjdzie z onPatientSavedHandler.
    if (_state === STATES.DIRTY || _state === STATES.NEW_PATIENT || _state === STATES.ERROR) {
      transition(STATES.SAVING);
    }
  }

  // ── Render (Faza 2: DOM + inspect API) ─────────────────────────

  // Inline SVG ikon — niezależne od ładowania Lucide (asynchronicznego).
  // Stroke = currentColor, dziedziczone z CSS koloru per stan.
  var ICONS = {
    saved:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    dirty:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    saving:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
    error:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    new_patient: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>'
  };

  // Etykiety per stan
  var LABELS = {
    saved: 'Zapisane',
    dirty: 'Niezapisane zmiany',
    saving: 'Zapisywanie…',
    error: 'Błąd zapisu',
    new_patient: 'Nowy pacjent'
  };

  /**
   * Bezpieczne escape HTML — dla nazw pacjentów wstrzykiwanych w title attr.
   */
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Buduje HTML dla aktualnego stanu (ikona + tekst + opcjonalnie czas).
   */
  function renderHtmlForState(state) {
    var icon = ICONS[state] || '';
    var label = LABELS[state] || '';
    var timeFragment = '';
    if (state === 'saved' && _lastSavedAtISO) {
      timeFragment = '<span class="vilda-save-status-time">• ' + escapeHtml(relativeTime(_lastSavedAtISO)) + '</span>';
    } else if (state === 'dirty' && _dirtyStartedAt) {
      var dirtyISO = new Date(_dirtyStartedAt).toISOString();
      timeFragment = '<span class="vilda-save-status-time">• od ' + escapeHtml(relativeTime(dirtyISO).replace(' temu', '')) + '</span>';
    } else if (state === 'new_patient') {
      timeFragment = '<span class="vilda-save-status-time">• kliknij Zapisz</span>';
    } else if (state === 'error') {
      timeFragment = '<span class="vilda-save-status-time">• kliknij Zapisz, by ponowić</span>';
    }
    return ''
      + '<span class="vilda-save-status-icon" aria-hidden="true">' + icon + '</span>'
      + '<span class="vilda-save-status-text">' + escapeHtml(label) + '</span>'
      + timeFragment;
  }

  /**
   * Buduje treść HTML tooltipu (multilinie). Wersja Fazy 3 zastępuje natywny title.
   */
  function buildTooltipHtml(state) {
    if (state === STATES.SAVED) {
      var rows = [];
      if (_lastPatientName) rows.push('<strong>' + escapeHtml(_lastPatientName) + '</strong>');
      if (_lastSavedAtISO) {
        var when = new Date(_lastSavedAtISO).toLocaleString('pl-PL');
        rows.push('Zapisano: ' + escapeHtml(when));
        rows.push('<span class="vilda-save-tooltip-time">' + escapeHtml(relativeTime(_lastSavedAtISO)) + '</span>');
      } else {
        rows.push('Snapshot pacjenta jest aktualny.');
      }
      if (_lastSnapshotCount) rows.push('Snapshot #' + _lastSnapshotCount);
      return rows.join('<br>');
    }
    if (state === STATES.DIRTY) {
      var dirtyRows = ['<strong>Niezapisane zmiany</strong>'];
      if (_dirtyStartedAt) {
        var dirtyISO = new Date(_dirtyStartedAt).toISOString();
        var rel = relativeTime(dirtyISO).replace(' temu', '');
        dirtyRows.push('Edytujesz od ' + escapeHtml(rel));
      }
      dirtyRows.push('<span class="vilda-save-tooltip-hint">Kliknij „Zapisz dane" w menu po lewej, aby zapisać snapshot.</span>');
      return dirtyRows.join('<br>');
    }
    if (state === STATES.SAVING) {
      return '<strong>Zapisywanie…</strong><br>Tworzę snapshot pacjenta w vault.';
    }
    if (state === STATES.ERROR) {
      var errRows = ['<strong>Błąd ostatniego zapisu</strong>'];
      if (_lastError) errRows.push(escapeHtml(_lastError));
      errRows.push('<span class="vilda-save-tooltip-hint">Kliknij „Zapisz dane", by ponowić.</span>');
      return errRows.join('<br>');
    }
    if (state === STATES.NEW_PATIENT) {
      return '<strong>Nowy pacjent</strong><br>Ten pacjent nie ma jeszcze snapshotu w karcie pacjenta.<br><span class="vilda-save-tooltip-hint">Kliknij „Zapisz dane", aby utworzyć kartę pacjenta.</span>';
    }
    return '';
  }

  /**
   * Wybiera mount point zależnie od viewport.
   * Desktop (≥992px): wstrzyknij wskaźnik do .sidebar .sidebar-logo, w wewnętrznym
   *   wrapperze obok h1 (host = .vilda-save-status-host--desktop).
   * Mobile/Tablet (<992px): wstrzyknij obok hamburgera (.chrome-mobile-menu-btn)
   *   w .chrome-strip (host = .vilda-save-status-host--mobile).
   *
   * Zwraca element-host (parent dla wskaźnika) lub null jeśli vilda_chrome jeszcze
   * nie wyrenderował struktury — wtedy wywołujący ustawia MutationObserver.
   */
  function findMountPoint() {
    if (typeof global.document === 'undefined') return null;
    var doc = global.document;
    var vw = global.innerWidth
      || (doc.documentElement && doc.documentElement.clientWidth)
      || 1024;
    var isDesktop = vw >= 992;
    _currentBreakpoint = isDesktop ? 'desktop' : 'mobile';

    if (isDesktop) {
      var sidebarLogo = doc.querySelector('.sidebar .sidebar-logo');
      if (!sidebarLogo) return null; // sidebar jeszcze nie wyrenderowany
      // Reuse existing host jeśli już go stworzyliśmy
      var existing = sidebarLogo.querySelector('.vilda-save-status-host--desktop');
      if (existing) return existing;
      // Stwórz wrapper obok h1: <div class="host">{h1}{indicator}</div>
      var h1 = sidebarLogo.querySelector('h1');
      var host = doc.createElement('div');
      host.className = 'vilda-save-status-host vilda-save-status-host--desktop';
      if (h1 && h1.parentNode === sidebarLogo) {
        sidebarLogo.insertBefore(host, h1);
        host.appendChild(h1);
      } else {
        sidebarLogo.appendChild(host);
      }
      return host;
    } else {
      var hamburger = doc.querySelector('[data-vilda-chrome-menu-btn], .chrome-mobile-menu-btn');
      if (!hamburger || !hamburger.parentNode) return null;
      var existingMobile = hamburger.parentNode.querySelector('.vilda-save-status-host--mobile');
      if (existingMobile) return existingMobile;
      var hostMobile = doc.createElement('div');
      hostMobile.className = 'vilda-save-status-host vilda-save-status-host--mobile';
      // Wstrzyknij jako sibling tuż po hamburgerze
      hamburger.parentNode.insertBefore(hostMobile, hamburger.nextSibling);
      return hostMobile;
    }
  }

  function disconnectMountObserver() {
    if (_mountObserver) {
      try { _mountObserver.disconnect(); } catch (_) {}
      _mountObserver = null;
    }
  }

  /**
   * Lazy-mount wskaźnika. Idempotentne. Jeśli mount point niedostępny
   * (vilda_chrome jeszcze nie wyrenderował), uruchamia MutationObserver
   * który próbuje ponownie gdy DOM się zmieni.
   */
  function ensureIndicatorMounted() {
    if (typeof global.document === 'undefined') return; // headless
    var doc = global.document;
    if (!doc.body) return;

    // Lazy create element
    if (!_indicatorEl) {
      _indicatorEl = doc.createElement('div');
      _indicatorEl.id = 'saveStatusIndicator';
      _indicatorEl.className = 'vilda-save-status vilda-save-status--hidden';
      _indicatorEl.style.display = 'none';
      _indicatorEl.setAttribute('role', 'status');
      _indicatorEl.setAttribute('aria-live', 'polite');
      _indicatorEl.setAttribute('aria-atomic', 'true');
      _indicatorEl.setAttribute('aria-describedby', 'saveStatusTooltip');
      _indicatorEl.setAttribute('tabindex', '0');
    }

    var host = findMountPoint();
    if (host) {
      if (_indicatorEl.parentNode !== host) {
        host.appendChild(_indicatorEl);
      }
      disconnectMountObserver();
      return;
    }

    // Brak hosta — vilda_chrome jeszcze nie wyrenderował sidebar/chrome-strip.
    // MutationObserver: gdy dowolne dziecko body się zmieni, próbujemy ponownie.
    if (!_mountObserver && typeof global.MutationObserver === 'function') {
      _mountObserver = new global.MutationObserver(function () {
        var h = findMountPoint();
        if (h && _indicatorEl) {
          h.appendChild(_indicatorEl);
          disconnectMountObserver();
        }
      });
      _mountObserver.observe(doc.body, { childList: true, subtree: true });
    }
  }

  /**
   * Handler resize — gdy breakpoint się zmienił, remountuj wskaźnik
   * do właściwego hosta dla nowego viewportu.
   */
  function handleResize() {
    if (_resizeDebounceTimer) clearTimeout(_resizeDebounceTimer);
    _resizeDebounceTimer = setTimeout(function () {
      var vw = global.innerWidth
        || (global.document.documentElement && global.document.documentElement.clientWidth)
        || 1024;
      var newBreakpoint = (vw >= 992) ? 'desktop' : 'mobile';
      if (newBreakpoint !== _currentBreakpoint) {
        ensureIndicatorMounted();
        if (_tooltipVisible) repositionTooltip();
      }
    }, 200);
  }

  /**
   * Lazy-mount tooltipu do body. Idempotentne.
   */
  function ensureTooltipMounted() {
    if (_tooltipEl && _tooltipEl.parentNode) return;
    if (typeof global.document === 'undefined') return;
    var doc = global.document;
    if (!doc.body) return;
    _tooltipEl = doc.createElement('div');
    _tooltipEl.id = 'saveStatusTooltip';
    _tooltipEl.className = 'vilda-save-tooltip';
    _tooltipEl.setAttribute('role', 'tooltip');
    _tooltipEl.style.display = 'none';
    doc.body.appendChild(_tooltipEl);
  }

  /**
   * Pozycjonowanie tooltipu względem wskaźnika z klampem do viewportu.
   */
  function repositionTooltip() {
    if (!_tooltipEl || !_indicatorEl) return;
    var iRect = _indicatorEl.getBoundingClientRect();
    // Najpierw pokażmy żeby zmierzyć (visibility hidden) — chwilowo bez animacji
    var prevDisplay = _tooltipEl.style.display;
    if (prevDisplay === 'none') {
      _tooltipEl.style.visibility = 'hidden';
      _tooltipEl.style.display = '';
    }
    var tRect = _tooltipEl.getBoundingClientRect();
    var vw = global.innerWidth || (global.document.documentElement && global.document.documentElement.clientWidth) || 1024;
    var vh = global.innerHeight || (global.document.documentElement && global.document.documentElement.clientHeight) || 768;
    // Domyślnie poniżej wskaźnika, wyrównane do lewej krawędzi wskaźnika
    var top = iRect.bottom + 8;
    var left = iRect.left;
    // Klamp do viewportu — pad 8 px od krawędzi
    if (left + tRect.width > vw - 8) left = vw - tRect.width - 8;
    if (left < 8) left = 8;
    // Jeśli za nisko — pokaż nad wskaźnikiem
    if (top + tRect.height > vh - 8) {
      top = iRect.top - tRect.height - 8;
      if (top < 8) top = 8;
    }
    _tooltipEl.style.top = top + 'px';
    _tooltipEl.style.left = left + 'px';
    if (prevDisplay === 'none') {
      _tooltipEl.style.display = 'none';
      _tooltipEl.style.visibility = '';
    }
  }

  function showTooltip() {
    if (_state === STATES.HIDDEN) return;
    ensureTooltipMounted();
    if (!_tooltipEl) return;
    _tooltipEl.innerHTML = buildTooltipHtml(_state);
    _tooltipEl.style.display = '';
    repositionTooltip();
    // rAF żeby pozwolić display:block na renderowanie przed dodaniem klasy animacji
    if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(function () {
        if (_tooltipEl) _tooltipEl.classList.add('vilda-save-tooltip--visible');
      });
    } else {
      _tooltipEl.classList.add('vilda-save-tooltip--visible');
    }
    _tooltipVisible = true;
  }

  function hideTooltip() {
    if (!_tooltipEl) return;
    _tooltipEl.classList.remove('vilda-save-tooltip--visible');
    _tooltipVisible = false;
    // Po animacji wyłącz display żeby nie blokować klików w pobliżu
    setTimeout(function () {
      if (_tooltipEl && !_tooltipEl.classList.contains('vilda-save-tooltip--visible')) {
        _tooltipEl.style.display = 'none';
      }
    }, 180);
  }

  function scheduleShowTooltip() {
    if (_tooltipHideTimer) { clearTimeout(_tooltipHideTimer); _tooltipHideTimer = null; }
    if (_tooltipShowTimer) return;
    _tooltipShowTimer = setTimeout(function () {
      _tooltipShowTimer = null;
      showTooltip();
    }, 250);
  }

  function scheduleHideTooltip() {
    if (_tooltipShowTimer) { clearTimeout(_tooltipShowTimer); _tooltipShowTimer = null; }
    if (_tooltipHideTimer) return;
    _tooltipHideTimer = setTimeout(function () {
      _tooltipHideTimer = null;
      hideTooltip();
    }, 200);
  }

  /**
   * Podłącz handlery hover/tap/focus/Esc/outside-click do wskaźnika i tooltipu.
   * Idempotentne — wykonuje się raz po pierwszym mount.
   */
  function attachTooltipHandlersOnce() {
    if (_tooltipHandlersAttached) return;
    if (!_indicatorEl || !_tooltipEl) return;
    _tooltipHandlersAttached = true;

    // Detekcja urządzeń z prawdziwym hoverem (desktop mysz) vs touch
    var hasFineHover = false;
    try {
      hasFineHover = global.matchMedia
        && global.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch (_) {}

    if (hasFineHover) {
      _indicatorEl.addEventListener('mouseenter', scheduleShowTooltip);
      _indicatorEl.addEventListener('mouseleave', scheduleHideTooltip);
      _tooltipEl.addEventListener('mouseenter', function () {
        if (_tooltipHideTimer) { clearTimeout(_tooltipHideTimer); _tooltipHideTimer = null; }
      });
      _tooltipEl.addEventListener('mouseleave', scheduleHideTooltip);
    }

    // Focus/blur — keyboard a11y
    _indicatorEl.addEventListener('focus', function () { showTooltip(); });
    _indicatorEl.addEventListener('blur', function () {
      // Drobne opóźnienie, żeby pozwolić użytkownikowi wejść myszą w tooltip
      scheduleHideTooltip();
    });

    // Click/tap → toggle (zawsze, niezależnie od hasFineHover; pokrywa też tap na mobile)
    _indicatorEl.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (_tooltipVisible) hideTooltip(); else showTooltip();
    });

    // Outside click → hide
    global.document.addEventListener('click', function (ev) {
      if (!_tooltipVisible) return;
      var t = ev.target;
      if (_tooltipEl && _tooltipEl.contains(t)) return;
      if (_indicatorEl && _indicatorEl.contains(t)) return;
      hideTooltip();
    });

    // Esc → hide
    global.document.addEventListener('keydown', function (ev) {
      if ((ev.key === 'Escape' || ev.key === 'Esc') && _tooltipVisible) hideTooltip();
    });

    // Reposition on resize/scroll
    global.addEventListener('resize', function () {
      if (_tooltipVisible) repositionTooltip();
    });
    global.addEventListener('scroll', function () {
      if (_tooltipVisible) repositionTooltip();
    }, true);
  }

  function render() {
    // 1. Inspect API (zachowane z Fazy 1)
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

    // 2. DOM update (jeśli mamy document)
    try {
      if (typeof global.document === 'undefined') return; // headless
      ensureIndicatorMounted();
      ensureTooltipMounted();
      attachTooltipHandlersOnce();
      if (!_indicatorEl) return;
      if (_state === STATES.HIDDEN) {
        _indicatorEl.style.display = 'none';
        _indicatorEl.className = 'vilda-save-status vilda-save-status--hidden';
        _indicatorEl.innerHTML = '';
        if (_tooltipVisible) hideTooltip();
        return;
      }
      _indicatorEl.style.display = '';
      _indicatorEl.className = 'vilda-save-status vilda-save-status--' + _state;
      _indicatorEl.innerHTML = renderHtmlForState(_state);
      // Jeśli tooltip jest aktualnie widoczny — zaktualizuj jego treść i pozycję
      if (_tooltipVisible && _tooltipEl) {
        _tooltipEl.innerHTML = buildTooltipHtml(_state);
        repositionTooltip();
      }
    } catch (_) {}
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
    // Save button click → SAVING
    ['saveDataBtn', 'saveDataBtnSidebar'].forEach(function (id) {
      var btn = global.document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', onSaveClicked);
      }
    });
    // Faza 4: event z vilda_auth_ui po wczytaniu pacjenta z listy vault
    global.document.addEventListener('vilda:patient-loaded', function (ev) {
      try { onPatientLoadedHandler((ev && ev.detail) || {}); } catch (_) {}
    });
    // Faza 5: event z vilda_data_import_export po imporcie pliku JSON
    global.document.addEventListener('vilda:json-imported', function (ev) {
      try { onJsonImportedHandler((ev && ev.detail) || {}); } catch (_) {}
    });
    // Faza 6: resize → remount do właściwego hosta gdy zmienił się breakpoint
    global.addEventListener('resize', handleResize);
  }

  function startRefreshTick() {
    // Co 30 s odśwież render (żeby "N min temu" się aktualizowało).
    // W Fazie 1 jeszcze nie ma widzialnego renderu, ale ustaw teraz — nieinwazyjne.
    if (_refreshTickInterval) return;
    _refreshTickInterval = setInterval(function () {
      if (_state === STATES.SAVED || _state === STATES.DIRTY) render();
    }, 30000);
  }

  // ── Init ──────────────────────────────────────────────────────

  function init() {
    if (typeof global.document === 'undefined') {
      // Headless (node test) — tylko vault hooks
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
    // Jeśli vault już unlocked w momencie init (refresh strony z aktywną sesją)
    // — natychmiast spróbuj wejść w stan SAVED / NEW_PATIENT.
    var V = global.VildaVault;
    if (V && typeof V.isUnlocked === 'function' && V.isUnlocked()) {
      onUnlock();
    }
  }

  // ── Public API ────────────────────────────────────────────────

  global.VildaSaveStatusIndicator = {
    STATES: STATES,
    // Read-only inspectors
    getState: function () { return _state; },
    getReferenceFingerprint: function () { return _referenceFingerprint; },
    getLastSavedAtISO: function () { return _lastSavedAtISO; },
    getLastSnapshotCount: function () { return _lastSnapshotCount; },
    getLastPatientName: function () { return _lastPatientName; },
    // Test hooks (prefix _ — nie używać poza testami)
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
    _buildTooltipHtml: buildTooltipHtml,
    _isTooltipVisible: function () { return _tooltipVisible; },
    _setLastSavedAtISO: function (iso) { _lastSavedAtISO = iso; },
    _setLastSnapshotCount: function (n) { _lastSnapshotCount = n; },
    _setLastPatientName: function (n) { _lastPatientName = n; },
    _setDirtyStartedAt: function (t) { _dirtyStartedAt = t; },
    _setLastError: function (e) { _lastError = e; }
  };

  init();
})(typeof window !== 'undefined' ? window : globalThis);
