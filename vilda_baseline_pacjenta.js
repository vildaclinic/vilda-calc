/* vilda_baseline_pacjenta.js — linia bazowa wczytanego pacjenta podąża za rekordem.
 *
 * PO CO TO JEST (zgłoszenie właściciela 2026-09-15, P-ODSWIEZENIE, część 4). Formularz
 * główny trzyma `window.lastLoadedData` — kopię rekordu Z CHWILI WCZYTANIA. Sejf porównuje
 * ją z głową rekordu przy każdym „Zapisz" (P14) i pyta „Ktoś inny zmienił ten rekord", gdy w
 * głowie jest pomiar, którego nie ma ani w tej kopii, ani w formularzu. Kolektor czyta z niej
 * też datę urodzenia i części nazwiska, gdy strona nie ma odpowiednich pól.
 *
 * Kopia nie była odświeżana, gdy ten sam lekarz zmieniał rekord GDZIE INDZIEJ W TEJ SAMEJ
 * KARCIE: w ekranie „Edytuj" Karty Pacjenta (np. dopisując tam datę urodzenia), w oknie
 * szybkiego pomiaru, przy przywróceniu wersji czy przy korekcie imienia i nazwiska. Skutki:
 *   • data dopisana w Karcie Pacjenta nie pojawiała się w wczytanym formularzu, a następny
 *     zapis z formularza szedł BEZ niej — główka rekordu traciła datę, którą lekarz właśnie
 *     wpisał;
 *   • po korekcie nazwiska (vilda_name_fix.js) pole `#name` miało już nową postać, a kopia
 *     starą — bramka tożsamości `BdupId()` nie przekazywała id i sejf zakładał NOWEGO pacjenta.
 *
 * CO ROBI TEN MODUŁ. Nasłuchuje `VildaVault.onPatientSaved` — powiadomienia, które sejf
 * wysyła po KAŻDEJ lokalnej zmianie rekordu (savePatient, updateSnapshotPayload, usunięcie
 * wersji). Gdy dotyczy pacjenta wczytanego w formularzu, a nie jest echem własnego „Zapisz"
 * z tego formularza (ten odświeża bazę sam, mając payload pod ręką), moduł czyta głowę
 * rekordu z sejfu i:
 *   1. podmienia `window.lastLoadedData` na aktualną głowę i utrwala ją w persistence,
 *      żeby odświeżenie strony nie wróciło do starej kopii;
 *   2. uzupełnia w formularzu POLA TOŻSAMOŚCI (data urodzenia, nazwisko i imię, płeć) —
 *      ale tylko wtedy, gdy formularz nadal opisuje tego pacjenta (nazwa w polu równa nazwie
 *      starej bazy). Pól wizyty (masa, wzrost, wiek wpisany ręcznie) nie rusza.
 *
 * CZEGO NIE ROBI. Nie reaguje na zmiany przychodzące z synchronizacji ani z innego urządzenia —
 * te ścieżki sejfu nie wołają `onPatientSaved`, więc pytanie o obcą zmianę zostaje dokładnie
 * tam, gdzie było. Nie zmienia żadnego wzoru, progu ani zapisu.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  /* Echo własnego zapisu z formularza: `saveUserData` zapisuje id i snapshotId, które właśnie
     wysłał, i sam odświeża bazę — tu nie ma czego robić. Rozstrzyga ZGODNOŚĆ WERSJI; okno
     czasowe jest tylko dla powiadomień bez snapshotId (usunięcie wersji), bo inaczej edycja
     w Karcie Pacjenta zaraz po własnym zapisie uchodziłaby za jego echo i przepadała. */
  var ECHO_MS = 1500;

  function dok() {
    return w && w.document ? w.document : null;
  }

  function pole(id) {
    var d = dok();
    return d ? d.getElementById(id) : null;
  }

  function zgloc(krok, blad) {
    try {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('vilda_baseline_pacjenta.js', blad, { step: krok });
      }
    } catch (e) {
      /* logowanie nie może wywrócić formularza */
    }
  }

  function biezacyPacjent() {
    try {
      if (typeof w._vildaCurrentPatientId === 'string' && w._vildaCurrentPatientId) return w._vildaCurrentPatientId;
    } catch (e) {
      zgloc('pid-window', e);
    }
    try {
      return (w.sessionStorage && w.sessionStorage.getItem('vildaCurrentPatientId')) || null;
    } catch (e) {
      return null;
    }
  }

  function normalizuj(nazwa) {
    try {
      var v = w.VildaVault;
      if (v && typeof v.normalizePatientName === 'function') return v.normalizePatientName(nazwa) || '';
    } catch (e) {
      zgloc('normalizuj', e);
    }
    return String(nazwa == null ? '' : nazwa).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function klon(o) {
    try {
      return JSON.parse(JSON.stringify(o));
    } catch (e) {
      return o;
    }
  }

  function toEchoWlasnegoZapisu(info) {
    try {
      var z = w.__vildaOstatniWlasnyZapis;
      if (!z || z.patientId !== info.patientId) return false;
      /* Ekran „Edytuj" i korekta nazwiska aktualizują W MIEJSCU tę samą wersję, którą przed
         chwilą zapisał formularz — snapshotId jest wtedy równy, ale to nie jest echo. Sejf
         oznacza takie powiadomienia `isUpdate`; własny „Zapisz" idzie przez savePatient i
         tej flagi nie ma. */
      if (info.isUpdate) return false;
      if (info.snapshotId) return !!z.snapshotId && z.snapshotId === info.snapshotId;
      return typeof z.kiedy === 'number' && Date.now() - z.kiedy < ECHO_MS;
    } catch (e) {
      return false;
    }
  }

  /* Pola tożsamości. Nazwisko i imię: jawne części rekordu mają pierwszeństwo, tak jak w
     vilda_name_fix.js; bez nich zostaje kanon w `#name`. Ustawiamy wprost, bez zdarzeń `input`
     na `#name` — P-SPLIT dzieli kanon przy zapisie do `.value`, więc nadpisujemy widoczne
     pola PO nim, dokładnie tak jak robi to korekta nazwiska. */
  function ustawNazwe(payload) {
    var nazwa = String(payload && payload.name ? payload.name : '').trim();
    if (!nazwa) return;
    var nameEl = pole('name');
    var lnEl = pole('lastName');
    var fnEl = pole('firstName');
    var u = payload.user && typeof payload.user === 'object' ? payload.user : {};
    var ln = typeof u.lastName === 'string' ? u.lastName.trim() : '';
    var fn = typeof u.firstName === 'string' ? u.firstName.trim() : '';
    try {
      if (nameEl) nameEl.value = nazwa;
      if (lnEl && fnEl && (ln || fn)) {
        lnEl.value = ln;
        fnEl.value = fn;
      }
    } catch (e) {
      zgloc('nazwa', e);
    }
  }

  function ustawPlec(payload) {
    var u = payload && payload.user;
    var el = pole('sex');
    if (!el || !u || !u.sex) return;
    var plec = String(u.sex).trim();
    var opcje = el.options ? Array.prototype.slice.call(el.options).map(function (o) { return o.value; }) : [];
    if (opcje.length && opcje.indexOf(plec) < 0) return;
    if (el.value !== plec) {
      el.value = plec;
      try {
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (e) {
        zgloc('plec', e);
      }
    }
  }

  function ustawDate(payload) {
    var u = payload && payload.user;
    var m = w.VildaDobAge;
    if (!m) return;
    var iso = u && typeof u.dobISO === 'string' ? u.dobISO : null;
    if (iso && typeof m.setFromRecord === 'function') {
      m.setFromRecord(iso);
      return;
    }
    /* Rekord stracił datę (skasowana w Karcie Pacjenta): pole z kartoteki zdejmuje blokadę,
       ale wyliczony wiek zostaje — lekarz ma czym pracować. */
    if (!iso && typeof m.clearAll !== 'function') return;
    var wejscie = pole('dobInput');
    if (!iso && wejscie && wejscie.dataset && wejscie.dataset.dobSource === 'record') {
      try {
        wejscie.readOnly = false;
        delete wejscie.dataset.dobSource;
        wejscie.value = '';
        if (typeof m.refresh === 'function') m.refresh();
      } catch (e) {
        zgloc('data-zdjecie', e);
      }
    }
  }

  function utrwal() {
    try {
      if (typeof w.vildaPersistFlushNow === 'function') w.vildaPersistFlushNow({ force: true });
    } catch (e) {
      zgloc('flush', e);
    }
  }

  /* Formularz opisuje nadal tego pacjenta, gdy nazwa w polu równa się nazwie STAREJ bazy.
     Gdy lekarz zdążył wpisać inne dziecko, nie wolno mu podmienić tożsamości pod rękami. */
  function formularzOpisujeTegoPacjenta(staraBaza) {
    var nameEl = pole('name');
    if (!nameEl) return true;
    var wPolu = normalizuj(nameEl.value);
    if (!wPolu) return true;
    var wBazie = normalizuj(staraBaza && staraBaza.name);
    return !wBazie || wPolu === wBazie;
  }

  function odswiezZGlowy(patientId) {
    var v = w.VildaVault;
    if (!v || typeof v.getPatient !== 'function' || !patientId) return Promise.resolve(false);
    return Promise.resolve(v.getPatient(patientId)).then(function (rec) {
      var snap = rec && Array.isArray(rec.snapshots) && rec.snapshots.length ? rec.snapshots[0] : null;
      var payload = snap && snap.payload;
      if (!payload || typeof payload !== 'object') return false;
      if (biezacyPacjent() !== patientId) return false;

      var stara = w.lastLoadedData;
      var tenSam = formularzOpisujeTegoPacjenta(stara);
      w.lastLoadedData = klon(payload);
      if (tenSam) {
        ustawNazwe(payload);
        ustawPlec(payload);
        ustawDate(payload);
      }
      utrwal();
      try {
        if (typeof w.CustomEvent === 'function' && dok()) {
          dok().dispatchEvent(new w.CustomEvent('vilda:baseline-refreshed', {
            detail: { patientId: patientId, snapshotId: snap.snapshotId || null, identity: tenSam }
          }));
        }
      } catch (e) {
        zgloc('zdarzenie', e);
      }
      return true;
    }).catch(function (e) {
      zgloc('getPatient', e);
      return false;
    });
  }

  function naZapis(info) {
    try {
      if (!info || typeof info.patientId !== 'string') return;
      if (info.patientId !== biezacyPacjent()) return;
      if (toEchoWlasnegoZapisu(info)) return;
      odswiezZGlowy(info.patientId);
    } catch (e) {
      zgloc('naZapis', e);
    }
  }

  var zamontowano = false;

  function mount() {
    if (zamontowano) return true;
    var v = w.VildaVault;
    if (!v || typeof v.onPatientSaved !== 'function') return false;
    zamontowano = true;
    v.onPatientSaved(naZapis);
    return true;
  }

  function autoMount() {
    if (mount()) return;
    var d = dok();
    if (!d) return;
    if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { mount(); });
    else if (w.setTimeout) w.setTimeout(mount, 0);
  }

  w.VildaBaselinePacjenta = {
    VERSION: VERSION,
    version: VERSION,
    ECHO_MS: ECHO_MS,
    mount: mount,
    refreshFromHead: odswiezZGlowy,
    _naZapis: naZapis,
    _toEcho: toEchoWlasnegoZapisu,
    _opisujeTegoPacjenta: formularzOpisujeTegoPacjenta
  };

  autoMount();
})(typeof window !== 'undefined' ? window : globalThis);
