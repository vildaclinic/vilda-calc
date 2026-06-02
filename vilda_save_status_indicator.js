/**
 * vilda_save_status_indicator.js — Wskaźnik statusu zapisu danych pacjenta.
 *
 * Wersja: 0.8 (trwała referencja w sessionStorage + kanoniczny page-independent
 *   fingerprint — naprawia fałszywy SAVED po nawigacji między podstronami i reloadzie)
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
  // Jawna, TRWAŁA (sessionStorage) flaga „edytowano od ostatniego zapisu/wczytania".
  // To ona — a NIE porównanie fingerprintów — decyduje o SAVED/DIRTY przy nawigacji
  // między podstronami i reloadzie. Fingerprint służy tylko do wykrycia edycji/undo
  // na tej samej stronie. Eliminuje fałszywy DIRTY wynikający z niestabilności
  // kanonicznego fingerprintu między podstronami (różne pola DOM, autosave per strona).
  var _dirty = false;
  var _lastSavedAtISO = null;
  var _lastSnapshotCount = null;
  var _lastPatientName = null;
  var _dirtyStartedAt = null;
  var _lastError = null;
  var _refreshTickInterval = null;
  var _debounceTimer = null;
  var _vaultUnlocked = false;
  // Tłumi vilda:json-imported na 500ms po vilda:patient-loaded. applyLoadedData
  // (wywoływane przez onPick w vault load) dispatchuje json-imported zawsze, więc
  // bez tej flagi vault load → race: patient-loaded (SAVED) vs json-imported
  // (NEW_PATIENT) — niedeterministyczny wynik, najczęściej NEW_PATIENT (fiolet).
  var _suppressJsonImportedUntil = 0;

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

  // ── Kanoniczny fingerprint (page-independent) ─────────────────────
  // PROBLEM (sprzed v0.8): _referenceFingerprint był liczony z collectUserData(),
  // które czyta WYŁĄCZNIE z DOM bieżącej strony. Na podstronach (np. klirens)
  // brakuje pól z głównej, więc fingerprint był nieporównywalny między stronami,
  // a onUnlock brał bieżący stan jako „zapisany" → fałszywy SAVED po nawigacji.
  //
  // ROZWIĄZANIE: licz fingerprint z page-niezależnego źródła kanonicznego:
  //   • główna/docpro (pełny formularz obecny) → live collectUserData (dokładne),
  //   • podstrony (klirens) → VildaPersistence.readMainSession() (sessionStorage,
  //     ten sam snapshot zapisany przez główną, przeżywa nawigację i reload),
  //   • clcr zawsze z readClcrSession() (page-independent), by edycje na klirensie
  //     też były wykrywane jako zmiana.

  function stripVolatile(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    var c;
    try { c = JSON.parse(JSON.stringify(obj)); } catch (_) { return obj; }
    delete c.timestampISO;
    delete c.timestamp;
    delete c.version;
    return c;
  }

  function readCanonicalClcr() {
    var P = global.VildaPersistence;
    try {
      if (P && typeof P.readClcrSession === 'function') return P.readClcrSession();
    } catch (_) {}
    return null;
  }

  /* clcrHasValue() usunięto — clcr nie jest już samodzielnym sygnałem „są dane"
     w isFormMostlyEmpty (patrz komentarz tam). readCanonicalClcr nadal zasila
     kanoniczny fingerprint. */

  /**
   * Czy bieżąca strona ma pełny formularz pacjenta (główna/docpro), tj. czy
   * collectUserData() zwraca sensowne dane pacjenta. Na podstronie bez tego
   * formularza (np. klirens) collectUserData zwraca okrojony obiekt.
   */
  function isFullFormPage() {
    if (typeof global.collectUserData !== 'function'
        || typeof global.hasMeaningfulMainSessionData !== 'function') return false;
    try {
      var live = global.collectUserData({ source: 'save-status-fullform-check' });
      return !!(live && global.hasMeaningfulMainSessionData(live));
    } catch (_) { return false; }
  }

  /**
   * Flush sesji głównej do sessionStorage — TYLKO na stronie z pełnym formularzem.
   * Na podstronie (klirens) NIE wolno: saveMainSessionNow wyczyściłby main session,
   * bo collectUserData(klirens) jest „niemeaningful". Używane przy uchwyceniu
   * referencji (save/load/restore), by main session == zapisany stan zanim
   * policzymy fingerprint (inaczej referencja rozjeżdża się z tym, co odczytają
   * inne podstrony).
   */
  function flushMainSessionIfFullForm() {
    if (typeof global.saveMainSessionNow !== 'function') return;
    if (!isFullFormPage()) return;
    // J1-v7: force=true omija isMainSessionAutosavePaused (pauseUntil w przyszłości
    // 1.6-2.5s po Restore). To wywołanie jest z forceFormChange (user action),
    // nie z autosave debouncer'a — pauza nie ma tu zastosowania semantycznego.
    try { global.saveMainSessionNow({ force: true }); } catch (_) {}
  }

  /**
   * Kanoniczny rdzeń pacjenta — ZAWSZE page-independent.
   *
   * KLUCZOWE: źródłem jest main session z sessionStorage (vildaMainSessionV1),
   * który jest IDENTYCZNY na każdej podstronie (zapisywany przez autosave strony
   * z pełnym formularzem). NIE używamy tu live collectUserData strony bieżącej —
   * bo collectUserData zwraca RÓŻNE pola na różnych stronach (główna: jedzenie/
   * intake; docpro: pola lekarskie), więc ten sam pacjent dawałby różne
   * fingerprinty na różnych podstronach → fałszywy DIRTY po nawigacji.
   * Live collectUserData służy WYŁĄCZNIE jako fallback, gdy main session jeszcze
   * nie istnieje (nowy pacjent przed pierwszym autosave / headless test).
   */
  function readCanonicalCore() {
    var P = global.VildaPersistence;
    try {
      if (P && typeof P.readMainSession === 'function') {
        var main = P.readMainSession();
        if (main && typeof main === 'object') return stripVolatile(main);
      }
    } catch (_) {}
    // Fallback (brak main session): live collectUserData — ALE tylko, gdy to PEŁNY
    // formularz (sensowne dane pacjenta). Na podstronie bez formularza (klirens)
    // okrojony collectUserData NIE reprezentuje pacjenta, więc zwracamy null
    // („nie potrafię policzyć") zamiast mylącego okrojonego fingerprintu —
    // dzięki temu nie pojawia się fałszywy DIRTY, gdy main session chwilowo zniknie.
    if (typeof global.collectUserData === 'function') {
      try {
        var live = global.collectUserData({ source: 'save-status-canonical-fallback' });
        if (typeof global.hasMeaningfulMainSessionData === 'function') {
          if (live && global.hasMeaningfulMainSessionData(live)) return stripVolatile(live);
          return null; // podstrona bez pełnych danych pacjenta → brak porównania
        }
        return live ? stripVolatile(live) : null; // headless bez heurystyki
      } catch (_) {}
    }
    return null;
  }

  function computeCanonicalFingerprint() {
    var core = readCanonicalCore();
    if (core == null) return null;
    // clcr trzymamy osobno (page-independent), usuwamy z core by nie liczyć podwójnie.
    if (core && typeof core === 'object' && core.clcr !== undefined) {
      try { delete core.clcr; } catch (_) {}
    }
    var clcr = readCanonicalClcr();
    var payload = { core: core, clcr: clcr ? stripVolatile(clcr) : null };
    try { return JSON.stringify(payload); } catch (_) { return null; }
  }

  // ── Trwała referencja (sessionStorage, przeżywa nawigację + reload) ──
  // Zapisujemy fingerprint ostatniego PRAWDZIWEGO zapisu/wczytania z vault,
  // żeby każda świeżo załadowana podstrona porównywała się do tej samej
  // referencji zamiast brać bieżący stan jako „zapisany".
  var REF_KEY = 'vilda-save-ref-v1';
  var _memRef = null; // fallback gdy sessionStorage niedostępne (headless/test)

  function readPersistedRef() {
    try {
      var ss = global.sessionStorage;
      if (!ss) return _memRef;
      var raw = ss.getItem(REF_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) { return _memRef; }
  }

  function writePersistedRef(rec) {
    _memRef = rec || null;
    try {
      var ss = global.sessionStorage;
      if (!ss) return;
      if (rec) ss.setItem(REF_KEY, JSON.stringify(rec));
      else ss.removeItem(REF_KEY);
    } catch (_) {}
  }

  function persistRef() {
    writePersistedRef(_referenceFingerprint ? {
      fp: _referenceFingerprint,
      dirty: !!_dirty,
      savedAtISO: _lastSavedAtISO || null,
      snapshotCount: _lastSnapshotCount || null,
      patientName: _lastPatientName || null
    } : null);
  }

  function clearRef() {
    _referenceFingerprint = null;
    _dirty = false;
    writePersistedRef(null);
  }

  /**
   * Czy main session zawiera dane PACJENTA (a nie tylko poświadczenie lekarza /
   * przełączniki UI). hasMeaningfulMainSessionData() zwraca true także gdy jedyną
   * „treścią" jest numer PWZ lekarza (doctor.pwzNumber/isDoctor), tryb wyników
   * (zscore.resultsMode) czy przełącznik bpDataToggle — to są sygnały „warto
   * odtworzyć sesję", ale NIE „jest pacjent do zapisania". Dla wskaźnika statusu
   * odejmujemy te pola, by samo wpisanie PWZ na DocPro (np. przez lekarza PRO,
   * by odblokować stronę) nie zmieniało ikony z hidden na new_patient.
   */
  function hasMeaningfulPatientData(data) {
    if (!data || typeof global.hasMeaningfulMainSessionData !== 'function') return false;
    if (!global.hasMeaningfulMainSessionData(data)) return false;
    var clone;
    try { clone = JSON.parse(JSON.stringify(data)); } catch (_) { return true; }
    delete clone.doctor;       // poświadczenie lekarza (PWZ) — nie pacjent
    delete clone.zscore;       // resultsMode to tryb UI
    delete clone.bpDataToggle; // przełącznik UI
    return global.hasMeaningfulMainSessionData(clone);
  }

  /**
   * Heurystyka „formularz pusty" — page-independent.
   * Sprawdza kanoniczny main session (sessionStorage), a dopiero w ostateczności
   * bieżący DOM (collectUserData) — bo na podstronach DOM nie ma pól pacjenta
   * z głównej. clcr i poświadczenie lekarza (PWZ) NIE są tu sygnałem „są dane".
   */
  function isFormMostlyEmpty() {
    // 1) Kanoniczny main session (page-independent) — tylko dane PACJENTA.
    var P = global.VildaPersistence;
    try {
      if (P && typeof P.readMainSession === 'function'
          && typeof global.hasMeaningfulMainSessionData === 'function') {
        var main = P.readMainSession();
        if (main && hasMeaningfulPatientData(main)) return false;
      }
    } catch (_) {}
    // 2) clcr (klirens) NIE jest samodzielnym sygnałem „są dane pacjenta".
    //    Sam wynik klirensu — bez imienia/pomiarów — nie jest możliwy do zapisania
    //    jako karta pacjenta (VildaVault.savePatient wymaga imienia), więc nie może
    //    wymuszać NEW_PATIENT. Wcześniej wejście na kalkulator klirensu zapisywało
    //    migawkę sesji (metadane + inputs/summary), przez co po powrocie na inną
    //    podstronę ikona fałszywie zmieniała się z hidden na new_patient.
    //    clcr POZOSTAJE częścią kanonicznego fingerprintu (computeCanonicalFingerprint),
    //    więc edycja klirensu u ZAŁADOWANEGO/zapisanego pacjenta nadal daje DIRTY.
    // 3) Fallback: bieżący DOM (główna przed autosave / headless).
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

  // J1-v4: wspólna implementacja fingerprint compare → DIRTY/SAVED.
  // Wyciągnięta z onFormChange, żeby forceFormChange (publiczny hook dla user
  // actions takich jak usuń wiersz historyczny) mogła ominąć
  // __vildaPersist* guardy bez duplikowania całej logiki.
  function _evaluateFingerprintAgainstReference() {
    if (_state === STATES.SAVING) return;
    if (global.VildaGuestMode === true) return;
    if (!_vaultUnlocked) return;
    if (_state === STATES.HIDDEN) {
      if (!isFormMostlyEmpty()) {
        clearRef(); // nowy pacjent od zera — porzuć ewentualną nieaktualną referencję
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
    var current = computeCanonicalFingerprint();
    if (current === null) return;
    if (current === _referenceFingerprint) {
      if (_dirty) { _dirty = false; persistRef(); }
      if (_state !== STATES.SAVED) transition(STATES.SAVED);
    } else {
      if (!_dirty) { _dirty = true; persistRef(); }
      if (_state !== STATES.DIRTY) transition(STATES.DIRTY);
    }
  }

  // J1-v4/v5: WERSJA DLA USER ACTIONS — bez __vildaPersist* guards.
  // Wywoływana przez setTimeout w notifyExternalChange. Argument działania
  // niezależnie od post-restore pauzy autosave (która istnieje wyłącznie po
  // to, żeby blokować debouncedOnFormChange — listener na natywnych input/
  // change events generowane przez rebuild formularza). Operacja użytkownika
  // (np. klik X przy wierszu historycznym 1-3s po wczytaniu pacjenta) MUSI
  // przejść do DIRTY natychmiast.
  //
  // J1-v5: KLUCZOWE — flush main session do sessionStorage PRZED fingerprint
  // compare. Operacje typu „usuń wiersz historyczny" (row.remove()) NIE
  // generują natywnego input/change event → autosave w vilda_persist_runtime
  // NIE jest triggered → sessionStorage zachowuje STARY main session z
  // usuwanym wierszem. computeCanonicalFingerprint czyta z sessionStorage
  // (readMainSession), więc bez flushu zwraca TEN SAM fingerprint co
  // referenceFingerprint → state zostaje SAVED mimo że user usunął dane.
  // flushMainSessionIfFullForm() wywołuje saveMainSessionNow który
  // synchronicznie zaktualizuje sessionStorage z bieżącego DOM.
  function forceFormChange() {
    flushMainSessionIfFullForm();
    _evaluateFingerprintAgainstReference();
  }

  function onFormChange() {
    // GUARD: ignoruj zmiany pól wywołane PROGRAMOWO przez restore/nawigację
    // (vilda_persist_runtime ustawia __vildaPersistRestoring / __vildaPersistPauseUntil
    // na czas odbudowy formularza). To NIE są edycje użytkownika — bez tego guardu
    // odtworzenie formularza po wczytaniu/nawigacji fałszywie ustawiałoby DIRTY.
    //
    // J1-v4: te guardy działają DLA NATYWNYCH eventów input/change (które
    // mogą lecieć podczas rebuild formularza po restore). User actions
    // (handle*RowRemove → notifyExternalChange → forceFormChange) omijają
    // tę ścieżkę, bo są semantycznie nie-programatyczne.
    try {
      if (global.__vildaPersistRestoring === true) return;
      if (Date.now() < Number(global.__vildaPersistPauseUntil || 0)) return;
    } catch (_) {}
    _evaluateFingerprintAgainstReference();
  }

  function debouncedOnFormChange(ev) {
    // KLUCZOWE rozróżnienie W MOMENCIE ZDARZENIA (nie po debounce):
    // odbudowa formularza przez restore/nawigację dispatchuje SYNTETYCZNE zdarzenia
    // 'input'/'change' (new Event(...)), które mają isTrusted=false. Prawdziwa
    // interakcja użytkownika ma isTrusted=true. Tylko ona może oznaczyć dane jako
    // zmienione. Sprawdzanie flagi restore dopiero w onFormChange było nieskuteczne,
    // bo debounce (400 ms) odraczał je poza okno, w którym flaga jest ustawiona —
    // stąd fałszywy DIRTY po zmianie podstrony. isTrusted jest dostępne natychmiast.
    if (ev && ev.isTrusted === false) return;
    // Druga warstwa: ignoruj, jeśli w MOMENCIE zdarzenia trwa restore/odbudowa.
    try {
      if (global.__vildaPersistRestoring === true) return;
      if (Date.now() < Number(global.__vildaPersistPauseUntil || 0)) return;
    } catch (_) {}
    if (_debounceTimer) clearTimeout(_debounceTimer);
    // 400 ms > 300 ms (autosave main session aplikacji). Dzięki temu onFormChange
    // czyta JUŻ zaktualizowany przez autosave page-niezależny main session.
    _debounceTimer = setTimeout(onFormChange, 400);
  }

  /**
   * Wspólna logika ustalenia stanu na podstawie TRWAŁEJ referencji (sessionStorage)
   * i bieżącego kanonicznego fingerprintu. Używana przez onUnlock (każda podstrona)
   * oraz onStateRestored. Eliminuje fałszywy SAVED po nawigacji/reloadzie — moduł
   * nie zakłada już, że „formularz ma dane ⇒ zapisane".
   */
  function reconcileState() {
    if (global.VildaGuestMode === true) { transition(STATES.HIDDEN); return; }
    var ref = readPersistedRef();
    if (ref && ref.fp) {
      _referenceFingerprint = ref.fp;
      _dirty = !!ref.dirty;
      _lastSavedAtISO = ref.savedAtISO || null;
      _lastSnapshotCount = ref.snapshotCount || null;
      _lastPatientName = ref.patientName || _lastPatientName;
    } else {
      _referenceFingerprint = null;
      _dirty = false;
    }
    if (isFormMostlyEmpty()) {
      transition(STATES.HIDDEN);
      return;
    }
    if (_referenceFingerprint == null) {
      // Są dane, ale nigdy nie zapisano/wczytano → realnie nowy pacjent.
      transition(STATES.NEW_PATIENT);
      return;
    }
    // KLUCZOWE: przy nawigacji NIE przeliczamy ani nie porównujemy fingerprintu —
    // kanoniczny fingerprint nie jest stabilny między podstronami (różne pola DOM,
    // autosave per strona, asynchroniczne dopełnianie po wczytaniu), więc porównanie
    // dawało fałszywy DIRTY. Ufamy TRWAŁEJ fladze _dirty, którą ustawia tylko
    // realna edycja użytkownika (onFormChange poza trybem restore).
    transition(_dirty ? STATES.DIRTY : STATES.SAVED);
  }

  function onUnlock() {
    _vaultUnlocked = true;
    _suppressJsonImportedUntil = 0; // fresh start — zeruj suppress
    reconcileState();
  }

  function onLock() {
    _vaultUnlocked = false;
    _suppressJsonImportedUntil = 0;
    // Czyść trwałą referencję — vault zablokowany / wylogowanie. Zapobiega temu,
    // by inny użytkownik w tej samej karcie zobaczył referencję poprzednika.
    clearRef();
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
    // Wymuś świeży main session, by kanoniczny rdzeń == zapisany snapshot (best-effort).
    flushMainSessionIfFullForm();
    _referenceFingerprint = computeCanonicalFingerprint();
    _dirty = false; // świeżo zapisane → czysto
    persistRef(); // utrwal referencję — przeżyje nawigację i reload
    transition(STATES.SAVED);
  }

  function onPatientLoadedHandler(info) {
    _lastSavedAtISO = (info && info.savedAtISO) || null;
    _lastSnapshotCount = (info && info.snapshotCount) || null;
    _lastPatientName = (info && info.name) || null;
    _lastError = null;
    // Aktywuj suppress dla json-imported na 500ms — applyLoadedData (wywoływane
    // w trakcie vault load) dispatchuje też json-imported, który bez suppress
    // przeskakiwałby nas z SAVED → NEW_PATIENT (fioletowy bug).
    _suppressJsonImportedUntil = Date.now() + 500;
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    setTimeout(function () {
      flushMainSessionIfFullForm();
      _referenceFingerprint = computeCanonicalFingerprint();
      _dirty = false; // świeżo wczytany pacjent → czysto
      persistRef(); // utrwal referencję wczytanego pacjenta
      transition(STATES.SAVED);
    }, 150);
  }

  function onJsonImportedHandler(info) {
    // Suppress: jeśli to fragment vault load (applyLoadedData→json-imported tuż
    // po patient-loaded), zignoruj. Inaczej nadpisalibyśmy SAVED przez NEW_PATIENT.
    if (Date.now() < _suppressJsonImportedUntil) {
      try {
        if (global.console && typeof global.console.debug === 'function') {
          global.console.debug('[vilda-save-status] json-imported zignorowane (vault load w toku)');
        }
      } catch (_) {}
      return;
    }
    _lastSavedAtISO = null;
    _lastSnapshotCount = null;
    _lastPatientName = (info && info.name) || null;
    _lastError = null;
    // Import JSON to NIE snapshot w vault — czyść trwałą referencję, by po
    // nawigacji/reloadzie zaimportowany (niezapisany) pacjent dalej był NEW_PATIENT.
    clearRef();
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    setTimeout(function () {
      transition(STATES.NEW_PATIENT);
    }, 150);
  }

  /**
   * Handler eventu vilda:state-restored — przycisk "Odtwórz zapisany stan"
   * przywraca poprzedni stan formularza (np. po wylogowaniu/reload). Z punktu
   * widzenia user: "to są moje dane, kontynuuję pracę" → SAVED (z aktualną
   * referencją). Edycja pól po restore → DIRTY, jak normalnie.
   *
   * NIE ustawiamy metadanych snapshot (savedAtISO/snapshotCount) — bo to nie
   * jest snapshot z vault, tylko persisted state formularza.
   */
  function onStateRestoredHandler() {
    _lastError = null;
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    setTimeout(function () {
      // „Odtwórz zapisany stan" to świadoma akcja użytkownika: „to są moje dane,
      // jak je zostawiłem". Odtworzony stan staje się NOWĄ bazą odniesienia → SAVED.
      // NIE uzgadniamy przez reconcileState, bo odtworzenie formularza z innego
      // źródła (persisted form-state) daje minimalnie inny kanoniczny fingerprint
      // niż referencja uchwycona przy wczytaniu pliku/pacjenta — co fałszywie
      // dawało DIRTY (bursztyn) tuż po odtworzeniu, mimo braku jakiejkolwiek edycji.
      // Utrwalamy referencję, żeby SAVED przeżył nawigację; edycja po odtworzeniu
      // → kanoniczny fingerprint się zmieni → DIRTY (poprawnie).
      // Metadanych snapshot (savedAtISO/snapshotCount) NIE ustawiamy — to nie jest
      // snapshot z vault, tylko przywrócony stan formularza.
      flushMainSessionIfFullForm();
      _referenceFingerprint = computeCanonicalFingerprint();
      _dirty = false; // odtworzony stan = bieżąca baza, brak edycji
      persistRef();
      transition(STATES.SAVED);
    }, 150);
  }

  /**
   * Handler eventu vilda:user-state-cleared (przycisk „Wyczyść wszystkie pola").
   * Wszystko wyzerowane → wskaźnik wraca do HIDDEN (chip pokazuje domyślny
   * is-empty / has-patient z vilda_chrome). Vault może być wciąż unlocked —
   * NIE zmieniamy _vaultUnlocked, tylko czyścimy dane wskaźnika.
   *
   * Anulujemy też pending debouncedOnFormChange, bo clearAllData wystrzeli
   * mnóstwo input/change events (setowanie val='' na każdym polu), które
   * mogłyby zaraz po naszym HIDDEN przeskoczyć w NEW_PATIENT.
   */
  function onUserStateClearedHandler() {
    clearRef(); // wyczyść trwałą referencję — pacjent usunięty z formularza
    _lastSavedAtISO = null;
    _lastSnapshotCount = null;
    _lastPatientName = null;
    _dirtyStartedAt = null;
    _lastError = null;
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
    transition(STATES.HIDDEN);
    // Drugi tick — clearAllData kończy wysypywanie input events asynchronicznie,
    // więc po nich znów sprawdzamy stan (powinien zostać HIDDEN bo formularz pusty).
    setTimeout(function () {
      if (_state !== STATES.HIDDEN && isFormMostlyEmpty()) {
        transition(STATES.HIDDEN);
      }
    }, 300);
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

    // ATOMICZNA zmiana className — ZAWSZE ustawiamy klasę vilda-save-state--<state>
    // (włącznie z hidden). To eliminuje "zielony przelot" bo nasz CSS z !important
    // ZAWSZE decyduje o kolorze chip-icon — nigdy nie polegamy na bazowym
    // has-patient (turkus #00838d→#00b0a6 wyglądający jak zielony) z chrome.css.
    //
    // Wcześniejsze podejście "HIDDEN = brak klasy stanu, chrome decyduje" miało
    // race condition: VildaSession.getPatient() czyta dane formularza ZANIM
    // clearAllData je wyczyści — refreshPatientChip zostawia has-patient
    // i chip pokazuje turkus do następnego ticka. Tu eliminujemy ten problem
    // u źródła — chip ZAWSZE pokazuje kolor naszego stanu, niezależnie od
    // tego co myśli chrome.
    var currentClasses = (chip.className || '').split(/\s+/);
    var newClasses = [];
    for (var i = 0; i < currentClasses.length; i++) {
      var c = currentClasses[i];
      if (c && c.indexOf('vilda-save-state--') !== 0) newClasses.push(c);
    }
    if (_state) {
      newClasses.push('vilda-save-state--' + _state);
    }
    var newClassName = newClasses.join(' ');
    if (chip.className !== newClassName) {
      chip.className = newClassName; // single atomic write
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
    // Event z vilda_data_import_export po kliknięciu „Odtwórz zapisany stan"
    global.document.addEventListener('vilda:state-restored', function (ev) {
      try { onStateRestoredHandler((ev && ev.detail) || {}); } catch (_) {}
    });
    // Przycisk „Wyczyść wszystkie pola" → HIDDEN.
    // Event dispatched na window (nie document) przez vilda_persistence_adapter.
    if (typeof global.addEventListener === 'function') {
      global.addEventListener('vilda:user-state-cleared', function () {
        try { onUserStateClearedHandler(); } catch (_) {}
      });
    }
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
    // J1-fix v2: publiczny hook dla wewnętrznych operacji DOM (np. usunięcie
    // wiersza historycznego w Zaawansowanych obliczeniach), które NIE emitują
    // user-trusted input/change. debouncedOnFormChange odrzuca syntetyczne
    // `new Event(...)` przez ev.isTrusted===false (chroni przed fałszywym DIRTY
    // podczas restore/nawigacji). Ta metoda omija tę ścieżkę — bezpośrednio
    // schedule'uje onFormChange.
    //
    // J1-v3 fix: zostaje TYLKO __vildaPersistRestoring guard (sync flag,
    // mikroskopijne okno gdy restore aktywnie trwa — user nie kliknie X
    // w tym czasie). __vildaPersistPauseUntil USUNIĘTO — to długie okno
    // (1.6-2.5s po Restore) blokowało legitymne user actions: typowy flow
    // „wczytaj pacjenta → kliknij X przy historycznym pomiarze (w ciągu 1-3s)"
    // sprawiał że notifyExternalChange wpadało w guard i nie schedule'owało
    // onFormChange → indykator zostawał SAVED zamiast przejść do DIRTY.
    //
    // Argument `reason` jest tylko informacyjny (do diagnostyki) — semantycznie
    // każde wywołanie jest „realna zmiana po stronie usera".
    notifyExternalChange: function notifyExternalChange(reason) {
      try {
        if (global.__vildaPersistRestoring === true) return;
      } catch (_) {}
      if (_debounceTimer) clearTimeout(_debounceTimer);
      // J1-v4: wywołuje forceFormChange (BEZ __vildaPersist* guards), bo
      // notifyExternalChange jest publicznym API dla user actions. Wcześniej
      // schedulowanie onFormChange miało ten sam bug — guardy w onFormChange
      // blokowały po debounce gdy pauza była wciąż aktywna.
      _debounceTimer = setTimeout(forceFormChange, 400);
    },
    // Test hooks
    _onFormChange: onFormChange,
    _debouncedOnFormChange: debouncedOnFormChange,
    _onUnlock: onUnlock,
    _onLock: onLock,
    _onPatientSaved: onPatientSavedHandler,
    _onPatientLoaded: onPatientLoadedHandler,
    _onJsonImported: onJsonImportedHandler,
    _onStateRestored: onStateRestoredHandler,
    _onUserStateCleared: onUserStateClearedHandler,
    _onSaveClicked: onSaveClicked,
    _computeFormFingerprint: computeFormFingerprint,
    _computeCanonicalFingerprint: computeCanonicalFingerprint,
    _reconcileState: reconcileState,
    _readPersistedRef: readPersistedRef,
    _writePersistedRef: writePersistedRef,
    _clearPersistedRef: clearRef,
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
