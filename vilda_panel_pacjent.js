/*
 * vilda_panel_pacjent.js — P-POWLOKA-OBCY (2026-10-06): panel powłoki nie może po cichu przejąć innego pacjenta.
 *
 * Powłoka app.html trzyma strony (Start, DocPro, Klirens…) w ramkach tej samej karty przeglądarki. Każda ramka ma
 * własny formularz w pamięci, a wspólne dla karty są: identyfikator pacjenta (sessionStorage.vildaCurrentPatientId),
 * migawka sesji, stan wspólny i magazyn punktów terapii. Gdy INNA ramka wczyta INNEGO pacjenta, ten dokument dalej
 * trzyma poprzedniego — jego dane nie należą już do pacjenta karty.
 *
 * Dokument pamięta pacjenta, którego zna (`znany`): pacjenta karty z chwili startu, a potem z własnego wczytania
 * (`vilda:patient-loaded`) albo własnego „Wyczyść” (`vilda:user-state-cleared`). Tylko te dwie drogi zmieniają
 * identyfikator karty z wnętrza dokumentu (custom-fixes.js, gh_therapy_monitor.js tuż przed `patient-loaded`).
 * Ocena jest LENIWA: przy każdym pytaniu (zapis w adapterze, lustro formularza, powłoka, zapis do sejfu) porównuje
 * bieżący identyfikator karty ze znanym, więc nie zależy od kolejności zdarzeń między ramkami.
 *
 * Reguły (identyfikator karty względem znanego):
 *  - ten sam → dokument aktualny;
 *  - inny, a formularz pusty → dokument przyjmuje pacjenta karty (P-ODTWORZ-ZYWO, P-POWLOKA-ID, P-ZRODLA-PRZEJECIE);
 *  - nadany (znany brak → nowy), a formularz ma te same nazwisko i datę urodzenia co migawka sesji karty → to zapis
 *    tego samego nowego dziecka w innej ramce; dokument przyjmuje nowy identyfikator;
 *  - usunięty (blokada sejfu, usunięcie pacjenta, „Wyczyść” — to ostatnie powtarza w każdej ramce vilda_chrome.js)
 *    → to nie jest wczytanie innego pacjenta; dokument zostaje przy swoim;
 *  - inny, a formularz z danymi → dokument NIEAKTUALNY.
 * Stan nieaktualny kończy: własne wczytanie (także jego początek), własne „Wyczyść” albo powrót karty do pacjenta
 * tego dokumentu (X → Y → X). Po `utrwal()` (powłoka właśnie przeładowuje ramkę) powrót karty go już nie kończy —
 * pagehide nie zapisze starego formularza na świeżo wczytany rekord.
 *
 * Skutki (poza tym plikiem):
 *  - adapter trwałości odmawia zapisu stanu karty z nieaktualnego dokumentu;
 *  - lustro formularza (custom-fixes.js) nie nadaje z niego i nie przyjmuje do niego wpisów;
 *  - powłoka (vilda_shell.js) nie odświeża go w tle, a przy pokazaniu przeładowuje (location.reload, bez wpisu
 *    w historii) — świeży dokument startuje ze stanu karty jak panel otwierany pierwszy raz;
 *  - zapis do sejfu i notatka do wizyty celują w pacjenta, którego dane dokument trzyma (`cel`).
 *
 * Moduł działa tylko w powłoce, która deklaruje obsługę tego protokołu (VildaShell.protokolPanelu >= 1). Ramka
 * w starszej powłoce (mieszane wersje po aktualizacji) i strona samodzielna zachowują się jak dotąd.
 *
 * Rejestr: docs/clinical/ALGORITHMS.md, P-POWLOKA-OBCY.
 */
(function (w) {
  'use strict';
  if (!w || w.VildaPanelPacjent) return;

  var KLUCZ = 'vildaCurrentPatientId';

  function pacjentKarty() {
    try { return (w.sessionStorage && w.sessionStorage.getItem(KLUCZ)) || null; } catch (_) { return null; }
  }

  var stan = { znany: pacjentKarty(), nieaktualny: false, wlasciciel: null, koncowy: false };
  var writeGeneration = 0, writeTickets = new WeakSet(), acceptedLoads = new WeakMap();

  function aktywny() {
    try {
      var p = w.parent;
      return !!(p && p !== w && p.VildaShell && p.VildaShell.protokolPanelu >= 1);
    } catch (_) { return false; } // inna domena albo brak dostępu
  }

  // The shell has already flushed its active document. Every old frame must
  // now stop publishing until the host reloads, including the same patient.
  // Keep this separate from patient ownership so a failed reload can roll back.
  function aktualizacjaAplikacji() {
    try {
      var shell = w.parent && w.parent.VildaShell;
      return !!(shell && typeof shell.isAppUpdateReloadPending === 'function' && shell.isAppUpdateReloadPending());
    } catch (_) { return false; }
  }

  function tablica(x) { return Array.isArray(x) && x.length > 0; }

  /* Czy dokument niesie dane jakiegoś pacjenta: pola formularza (anyDataEntered) albo stan pacjenta poza nimi
     (wczytany rekord, data urodzenia, punkty terapii, pomiary zaawansowane). Bez modułu formularza — nie ma czego
     chronić. */
  function maDane() {
    try {
      var api = w.VildaDataImportExport;
      if (api && typeof api.anyDataEntered === 'function' && api.anyDataEntered()) return true;
    } catch (_) { /* pomiń */ }
    try {
      if (w.lastLoadedData && typeof w.lastLoadedData === 'object') return true;
      var dob = w.document && w.document.getElementById('dobInput');
      if (dob && String(dob.value || '').trim()) return true;
      if (tablica(w.ghTherapyPoints) || tablica(w.obesityTherapyPoints) || tablica(w.bisphosTherapyPoints)) return true;
      var adv = w.advancedGrowthData;
      if (adv && typeof adv === 'object' && tablica(adv.measurements)) return true;
    } catch (_) { /* pomiń */ }
    return false;
  }

  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }

  /* Formularz i migawka sesji karty opisują tę samą osobę: nazwisko zgodne, daty urodzenia (gdy są obie) zgodne. */
  function tenSamPacjentCoMigawka() {
    var nazwa = '';
    try {
      var d = w.document;
      ['name', 'fullName', 'advName', 'basicGrowthName'].some(function (id) {
        var el = d && d.getElementById(id);
        var v = el && typeof el.value === 'string' ? el.value.trim() : '';
        if (v) nazwa = norm(v);
        return !!v;
      });
    } catch (_) { return false; }
    if (!nazwa) return false;
    var m;
    try {
      var p = w.VildaPersistence;
      m = p && typeof p.readMainSession === 'function' ? p.readMainSession() : null;
    } catch (_) { m = null; }
    if (!m || typeof m !== 'object') return false;
    var u = m.user && typeof m.user === 'object' ? m.user : {};
    var nazwaM = norm(m.name || m.fullName || [u.firstName, u.lastName].filter(Boolean).join(' '));
    if (!nazwaM || nazwaM !== nazwa) return false;
    var dob;
    try { dob = w.VildaDobAge && typeof w.VildaDobAge.readISO === 'function' ? w.VildaDobAge.readISO() || null : null; } catch (_) { dob = null; }
    var dobM = typeof u.dobISO === 'string' && u.dobISO ? u.dobISO : null;
    return !(dob && dobM && dob !== dobM);
  }

  function oznacz() {
    stan.nieaktualny = true;
    stan.wlasciciel = stan.znany;
    return true;
  }

  function ocenPacjenta() {
    if (!aktywny()) return false;
    var karta = pacjentKarty();
    if (stan.nieaktualny) {
      if (!stan.koncowy && karta !== null && karta === stan.wlasciciel) { // karta wróciła do pacjenta tego dokumentu
        stan.nieaktualny = false;
        stan.wlasciciel = null;
        stan.znany = karta;
        return false;
      }
      return true;
    }
    if (karta === stan.znany || karta === null) return false;
    if (!maDane()) { // pusty panel przyjmuje pacjenta karty
      stan.znany = karta;
      return false;
    }
    if (stan.znany === null && tenSamPacjentCoMigawka()) { // nadanie identyfikatora temu samemu nowemu dziecku
      stan.znany = karta;
      return false;
    }
    return oznacz();
  }

  function ocen() {
    var nieaktualny = ocenPacjenta();
    return nieaktualny || (aktywny() && aktualizacjaAplikacji());
  }

  /* Własne wczytanie albo „Wyczyść” kończy stan nieaktualny także po `utrwal()`: dokument trzyma wtedy to, co sam
     zapisał (np. skok GH dokończony tuż przed przeładowaniem), więc jego zapisy są zgodne z kartą. */
  function odNowa(id, zachowajZapis) {
    if (!zachowajZapis) writeGeneration += 1;
    stan.znany = id || null;
    stan.nieaktualny = false;
    stan.wlasciciel = null;
    stan.koncowy = false;
  }

  // Wczesne zdarzenie Clear może jeszcze nieść wychodzący PID. Tylko
  // producent zakończonego czyszczenia potwierdza jego usunięcie; zwykły
  // odczyt ani zniknięcie PID w innej ramce nie kończą nieaktualności.
  function zakonczWyczyszczenie() {
    var storage, id;
    try {
      storage = w.sessionStorage;
      if (!storage || typeof storage.getItem !== 'function') return false;
      id = storage.getItem(KLUCZ);
    } catch (_) { return false; }
    if (id !== null && id !== '') return false;
    odNowa(null);
    return true;
  }

  function wlasneWczytanie(e) {
    var d = e && e.detail;
    var id = d && typeof d.patientId === 'string' && d.patientId ? d.patientId : pacjentKarty();
    // A durable own save assigns an ID to the same current visit. Keep its
    // queued edits; an explicit load, even of the same PID, starts a new scope.
    var ownSave = !!(d && d.source === 'save' && !stan.nieaktualny &&
      (stan.znany === id || stan.znany === null && id && tenSamPacjentCoMigawka()));
    var load = d && acceptedLoads.get(d.acceptedLoadAuthority);
    var completesLoad = !!(load && load.phase === 'publishing' && id === load.targetId && acceptedLoadCurrent(load, true));
    odNowa(id, ownSave);
    if (completesLoad) { load.generation = writeGeneration; load.phase = 'published'; }
  }

  function wlasneWyczyszczenie() { odNowa(null); }

  function writeShell() {
    try {
      var parent = w.parent, shell = parent && parent !== w && parent.VildaShell;
      return shell && typeof shell.captureSessionWriter === 'function' &&
        typeof shell.isSessionWriterCurrent === 'function' ? shell : null;
    } catch (_) { return null; }
  }

  function applySequence() {
    var api = w.VildaDataImportExport;
    return api && typeof api.getApplyLoadedDataSequence === 'function' ? api.getApplyLoadedDataSequence() : null;
  }

  function accountScope() {
    var vault = w.VildaVault || null, user = vault && typeof vault.getCurrentUser === 'function' ? vault.getCurrentUser() : null;
    var unlocked = !!(vault && typeof vault.isUnlocked === 'function' && vault.isUnlocked());
    var auth = w.VildaAuthUI, guest = !!(auth && typeof auth.isGuestMode === 'function' && auth.isGuestMode());
    var token = null;
    if (unlocked && vault && typeof vault.captureSyncOperationSession === 'function' && typeof vault.assertSyncOperationSession === 'function') {
      token = vault.captureSyncOperationSession();
      vault.assertSyncOperationSession(token);
    }
    return { vault: vault, userId: user && user.userId || null, unlocked: unlocked, guest: guest, token: token };
  }

  function accountCurrent(scope) {
    var current = accountScope();
    if (scope.vault !== current.vault || scope.userId !== current.userId || scope.unlocked !== current.unlocked || scope.guest !== current.guest) return false;
    if (scope.token !== null) scope.vault.assertSyncOperationSession(scope.token);
    return true;
  }

  function canWriteSession() {
    try {
      if (ocen()) return false;
      var shell = writeShell();
      return !shell || !!shell.captureSessionWriter(w);
    } catch (_) { return false; }
  }

  function captureWriteAuthority() {
    try {
      if (ocen()) return null;
      var shell = writeShell(), source = shell && shell.captureSessionWriter(w);
      if (shell && !source) return null;
      var ticket = Object.freeze({ shell: shell, source: source, generation: writeGeneration,
        sequence: applySequence(), patientId: pacjentKarty(), account: accountScope() });
      writeTickets.add(ticket);
      return ticket;
    } catch (_) { return null; }
  }

  function isWriteAuthorityCurrent(ticket) {
    try {
      if (!ticket || !writeTickets.has(ticket) || ocen() || ticket.generation !== writeGeneration ||
        ticket.sequence !== applySequence() || ticket.shell !== writeShell() || !accountCurrent(ticket.account)) return false;
      if (ticket.shell && !ticket.shell.isSessionWriterCurrent(ticket.source, w)) return false;
      var id = pacjentKarty();
      if (ticket.patientId === id) return true;
      // Existing null -> PID adoption is valid only for this same visit and
      // the same identity as the newly saved shared snapshot.
      return ticket.patientId === null && !!id && stan.znany === id && tenSamPacjentCoMigawka();
    } catch (_) { return false; }
  }

  // DIX's accepted main-session restore advances its own apply sequence once.
  // Validate that continuation without relaxing ordinary writer tickets or
  // adopting a PID: every other opaque owner/activation fence stays intact.
  function isWriteAuthorityCurrentAfterSessionApply(ticket) {
    try {
      if (!ticket || !writeTickets.has(ticket) || ocen() || ticket.generation !== writeGeneration ||
        !Number.isInteger(ticket.sequence) || applySequence() !== ticket.sequence + 1 ||
        ticket.shell !== writeShell() || !accountCurrent(ticket.account)) return false;
      if (ticket.shell && !ticket.shell.isSessionWriterCurrent(ticket.source, w)) return false;
      return ticket.patientId === pacjentKarty();
    } catch (_) { return false; }
  }

  // An explicit accepted load has a known destination before its asynchronous
  // read/confirmation. Its own reset and native publication are the only
  // permitted transitions; ordinary writer tickets remain unchanged.
  function acceptedLoadCurrent(load, publishing) {
    try {
      if (!load || load.document !== w.document || load.shell !== writeShell() ||
          load.generation !== writeGeneration || load.sequence !== applySequence() || !accountCurrent(load.account)) return false;
      if (load.shell && !load.shell.isSessionWriterCurrent(load.activation, w)) return false;
      var id = pacjentKarty();
      return load.phase === 'published' ? id === load.targetId : id === load.sourceId || !!publishing && id === load.targetId;
    } catch (_) { return false; }
  }
  function captureAcceptedLoadAuthority(patientId, advance) {
    try {
      if (typeof patientId !== 'string' || !patientId) return null;
      var account = accountScope(), shell = writeShell(), activation = shell && shell.captureSessionWriter(w);
      if (!account.unlocked || account.guest || !account.userId || !account.token || shell && !activation) return null;
      var ticket = Object.freeze({});
      acceptedLoads.set(ticket, { document: w.document, account: account, shell: shell, activation: activation,
        sourceId: pacjentKarty(), targetId: patientId, generation: writeGeneration, sequence: applySequence(),
        advance: advance === 0 ? 0 : 1, phase: 'captured' });
      return ticket;
    } catch (_) { return null; }
  }
  function isAcceptedLoadAuthorityCurrent(ticket) {
    var load = acceptedLoads.get(ticket);
    return !!(load && load.phase === 'captured' && acceptedLoadCurrent(load, false));
  }
  function adoptAcceptedLoadOwnSave(ticket, result) {
    var load = acceptedLoads.get(ticket);
    try {
      if (!load || load.phase !== 'captured' || !result || !result.patientId ||
          load.sourceId !== null && load.sourceId !== result.patientId || pacjentKarty() !== result.patientId) return false;
      var vault = load.account.vault;
      if (!vault || typeof vault.getCommittedSavePayload !== 'function' || !vault.getCommittedSavePayload(result)) return false;
      var previous = load.sourceId; load.sourceId = result.patientId;
      if (!acceptedLoadCurrent(load, false)) { load.sourceId = previous; return false; }
      return true;
    } catch (_) { return false; }
  }
  function beginAcceptedLoadAuthority(ticket) {
    var load = acceptedLoads.get(ticket);
    if (!load || load.phase !== 'captured') return false;
    // Only this exact native apply is allowed to advance its sequence.
    var original = load.sequence; load.sequence += load.advance;
    if (!acceptedLoadCurrent(load, false)) { load.sequence = original; return false; }
    odNowa(pacjentKarty()); load.generation = writeGeneration; load.phase = 'applied';
    return true;
  }
  function isAcceptedLoadAuthorityApplied(ticket) {
    var load = acceptedLoads.get(ticket);
    return !!(load && (load.phase === 'applied' || load.phase === 'published') && acceptedLoadCurrent(load, false));
  }
  function publishAcceptedLoadAuthority(ticket) {
    var load = acceptedLoads.get(ticket);
    if (!load || load.phase !== 'applied' || !acceptedLoadCurrent(load, false)) return false;
    load.phase = 'publishing'; return true;
  }
  function completeAcceptedLoadAuthority(ticket, withoutEvent) {
    var load = acceptedLoads.get(ticket);
    if (!load || !(load.phase === 'published' || withoutEvent && load.phase === 'applied' && load.sourceId === load.targetId)) return false;
    return acceptedLoadCurrent(load, false) && pacjentKarty() === load.targetId;
  }

  try {
    w.document.addEventListener('vilda:patient-loaded', wlasneWczytanie);
    // „Wyczyść” rozgłaszane jest na window (VildaPersistence.clearUserState); część modułów słucha na document.
    w.document.addEventListener('vilda:user-state-cleared', wlasneWyczyszczenie);
    w.addEventListener('vilda:user-state-cleared', wlasneWyczyszczenie);
  } catch (_) { /* pomiń */ }

  w.VildaPanelPacjent = Object.freeze({
    // A same-patient restore begins a new visit scope without adopting a PID.
    invalidateWriteAuthority: function () { writeGeneration += 1; },
    // Privacy cleanup may inspect ownership during the separate app-update fence.
    isPatientOwnershipStale: ocenPacjenta,
    captureAcceptedLoadAuthority: captureAcceptedLoadAuthority,
    isAcceptedLoadAuthorityCurrent: isAcceptedLoadAuthorityCurrent,
    adoptAcceptedLoadOwnSave: adoptAcceptedLoadOwnSave,
    beginAcceptedLoadAuthority: beginAcceptedLoadAuthority,
    isAcceptedLoadAuthorityApplied: isAcceptedLoadAuthorityApplied,
    publishAcceptedLoadAuthority: publishAcceptedLoadAuthority,
    completeAcceptedLoadAuthority: completeAcceptedLoadAuthority,
    captureWriteAuthority: captureWriteAuthority,
    isWriteAuthorityCurrent: isWriteAuthorityCurrent,
    isWriteAuthorityCurrentAfterSessionApply: isWriteAuthorityCurrentAfterSessionApply,
    canWriteSession: canWriteSession,
    /* true: w innej ramce tej karty wczytano innego pacjenta, a ten dokument trzyma poprzedniego. */
    nieaktualny: ocen,
    /* identyfikator pacjenta, którego dane trzyma dokument (null: nowy, niezapisany pacjent albo pusty formularz) */
    wlasciciel: function () { ocen(); return stan.nieaktualny ? stan.wlasciciel : stan.znany; },
    /* pacjent docelowy zapisu do sejfu i notatki: `domyslny`, a w dokumencie nieaktualnym — jego własny pacjent */
    cel: function (domyslny) { ocen(); return stan.nieaktualny ? stan.wlasciciel : domyslny; },
    /* początek własnego wczytania (applyLoadedData poza odtworzeniem sesji): zapisy wczytania mają przejść */
    wczytanie: function () { odNowa(pacjentKarty()); },
    zakonczWyczyszczenie: zakonczWyczyszczenie,
    /* powłoka przeładowuje ramkę: powrót karty do pacjenta dokumentu nie kończy już stanu nieaktualnego */
    utrwal: function () { if (ocen() && stan.nieaktualny) stan.koncowy = true; return stan.koncowy; },
    pacjentKarty: pacjentKarty,
  });
})(typeof window !== 'undefined' ? window : undefined);
