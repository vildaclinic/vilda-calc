/* vilda_ds_source.js — JEDNO miejsce, w którym aplikacja rozstrzyga, czy liczy dla pacjenta
 * z zespołem Downa.
 *
 * PO CO TO JEST: do 1.0.966 jedyną „flagą DS" w aplikacji był stan interfejsu — czy karta
 * modułu „Obliczenia dla dzieci z zespołem Downa" jest rozwinięta (`#downSyndromeCard`).
 * Skutki: zwinięcie karty zmieniało klasyfikację BMI w planie diety, wczytanie pacjenta
 * z sejfu, F5 albo przejście index ↔ docpro gubiło rozpoznanie, a rekord pacjenta o DS
 * nie wiedział w ogóle. P-DS-1 przenosi rozpoznanie do rekordu (sekcja `clinical`), a ten
 * moduł jest jedynym miejscem, które łączy oba źródła.
 *
 * ZASADA (decyzja właściciela D1, zaostrzona w P-DS-4): ten moduł niczego nie liczy i niczego
 * nie zapisuje. Rozpoznanie pochodzi WYŁĄCZNIE z rekordu pacjenta — brak pola albo brak
 * wczytanego pacjenta znaczy „bez DS" (stare rekordy czytają się bez migracji).
 *
 * Dlaczego bez furtki dla stanu karty: w etapie 1 flaga sterowała tylko planem diety, więc
 * „nie ma pacjenta → decyduje rozwinięta karta modułu" było wygodnym skrótem dla użycia
 * doraźnego. Od P-DS-4 ta sama flaga przestawia siatki CAŁEJ strony — karty głównej, schowka,
 * epikryzy, raportu. Przy starej regule rozwinięcie karty informacyjnej u pacjenta BEZ zespołu
 * Downa po cichu przeklasyfikowałoby wszystkie wyniki. Karta modułu DS nadal pokazuje swoje
 * centyle niezależnie od tej flagi, więc użycie doraźne niczego nie traci.
 *
 * CZEGO TU NIE MA: siatek, wzoru i progów. Populację dostaje silnik (`vilda_bmi.js`)
 * jako `populacja: 'DS'` i to on decyduje, co z nią zrobić.
 */
(function (w) {
  'use strict';

  var VERSION = '4';

  /* ── czyste funkcje (mierzalne bez przeglądarki) ─────────────────────────────── */

  var kodyZemel = new Set(['Q90', 'Q90.0', 'Q90.1', 'Q90.2', 'Q90.9']);

  function canonicalDiagnosisCode(code) {
    return kodyZemel.has(code) ? code : null;
  }

  function diagnosisCode(payload) {
    return canonicalDiagnosisCode(payload?.clinical?.growthReferenceIcd10);
  }

  function applyDiagnosisToVisit(payload, code) {
    var clinical = Object.assign({}, payload.clinical);
    var selected = canonicalDiagnosisCode(code);
    if (selected) clinical.growthReferenceIcd10 = selected;
    else delete clinical.growthReferenceIcd10;
    if (Object.keys(clinical).length) payload.clinical = clinical;
    else delete payload.clinical;
    return payload;
  }

  function diagnosisCodeFromNotes(notes, patientId) {
    var model = w.VildaPatientTreatmentModel;
    if (!model || !Array.isArray(notes)) throw new Error('Nie można odczytać rozpoznań pacjenta.');
    var candidates = [];
    for (var note of notes) {
      if (note?.patientId !== patientId) continue;
      var decoded = model.decode(note), context = decoded.context;
      if (decoded.kind === 'diagnosis' && canonicalDiagnosisCode(context.code)) candidates.push(context);
    }
    // Zamknięcie wpisu pozostawia zapisane rozpoznanie cechy wrodzonej.
    candidates.sort(function (a, b) { return b.dateISO.localeCompare(a.dateISO) || a.code.localeCompare(b.code); });
    return candidates[0]?.code || null;
  }

  async function readDiagnosisCode({vault, patientId, isCurrent}) {
    var userId = vault?.getCurrentUser()?.userId;
    if (!userId || !patientId || typeof isCurrent !== 'function' || typeof vault.listPatientNotesForPatient !== 'function') {
      throw new Error('Nie można odczytać rozpoznań pacjenta.');
    }
    var session = vault.captureSyncOperationSession();
    function check() {
      if (w.VildaVault !== vault || !vault.isUnlocked() || vault.getCurrentUser()?.userId !== userId ||
          !vault.assertSyncOperationSession(session) || isCurrent() !== true) {
        throw new Error('Zmieniono kontekst odczytu rozpoznania.');
      }
    }
    check();
    var notes = await vault.listPatientNotesForPatient(patientId);
    check();
    if (!Array.isArray(notes) || notes.some(function (note) { return note?.patientId !== patientId; })) {
      throw new Error('Nie można potwierdzić rozpoznań pacjenta.');
    }
    return diagnosisCodeFromNotes(notes, patientId);
  }

  // Rozpoznanie z payloadu rekordu. Cokolwiek innego niż jawne `true` znaczy „nie".
  function zRekordu(payload) {
    if (!payload || typeof payload !== 'object') return false;
    var k = payload.clinical;
    return !!(k && typeof k === 'object' && k.downSyndrome === true);
  }

  function usesZemel(payload) {
    return zRekordu(payload) || !!diagnosisCode(payload);
  }

  /* Pierwszeństwo źródeł. `maRekord` mówi, czy w ogóle jest wczytany pacjent; bez rekordu
   * nie ma rozpoznania, a stan interfejsu nigdy go nie zastępuje (P-DS-4).
   */
  function wybierz(z) {
    var s = z && typeof z === 'object' ? z : {};
    return s.maRekord === true && s.rekord === true;
  }

  function populacjaZFlagi(flaga) {
    return flaga === true ? 'DS' : 'OGOLNA';
  }

  /* ── pamięć rekordu (jak w vilda_perinatal_source.js) ────────────────────────── */

  var zapamietane = null;
  var potwierdzonyPacjent = null;
  var oczekiwanyPacjent = null;
  var statusOdczytu = 'idle';
  var ostatniStan = '';
  var podlaczonySejf = null;
  var odswiez = null;

  // Ownership/readiness is presentation metadata. Existing calculators keep
  // using maFlage()/populacja(); charts can wait for the correct patient's read.
  function getState() {
    var source = visitSource();
    if (source) {
      var id = wybranyPacjent(), payload = activeVisitPayload(source, id);
      var unlocked = w.VildaVault && w.VildaVault.isUnlocked();
      var code = id ? diagnosisCode(payload) : rapidDiagnosis();
      var state = { patientId: unlocked ? id : null,
        status: payload || code ? 'ready' : id && unlocked ? 'pending' : 'idle',
        population: populacjaZFlagi(zRekordu(payload) || !!code) };
      if (code) state.diagnosisCode = code;
      return state;
    }
    return { patientId: oczekiwanyPacjent, status: statusOdczytu, population: populacja() };
  }

  // Only panels with the existing guarded visit reader opt into visit scope.
  // A corrected directory profile must not replace a saved visit's population.
  function visitSource() {
    var source = w.VildaPerinatalSource;
    return w.__VILDA_HOME_GABINET_PREVIEW__ === true && source && typeof source.visitPayload === 'function' ? source : null;
  }

  function activeVisitPayload(source, patientId) {
    try {
      var vault = w.VildaVault;
      if (!patientId || !vault || !vault.isUnlocked() || wybranyPacjent() !== patientId) return null;
      return source.visitPayload(patientId);
    } catch (_) { return null; }
  }

  function rapidDiagnosis() {
    if (!visitSource() || !w.VildaVault?.isUnlocked()) return null;
    return canonicalDiagnosisCode(w.VildaHomeGabinet?.rapidDiagnosis?.());
  }

  // The normal and partial-page native collectors may carry only the active
  // accepted visit's reference. Rapid intake pins its choices when it saves.
  function carryVisitReference(payload, base) {
    var reader = visitSource();
    if (!reader) return;
    var patientId = wybranyPacjent();
    var source = base || activeVisitPayload(reader, patientId);
    if (!source) return;
    applyDiagnosisToVisit(payload, diagnosisCode(source));
    if (zRekordu(source)) payload.clinical = Object.assign({}, payload.clinical, { downSyndrome: true });
    else if (payload.clinical && typeof payload.clinical === 'object') {
      delete payload.clinical.downSyndrome;
      if (!Object.keys(payload.clinical).length) delete payload.clinical;
    }
  }

  function oglosStan() {
    var stan = getState(), podpis = JSON.stringify(stan);
    if (podpis === ostatniStan) return;
    ostatniStan = podpis;
    try {
      if (w.document && typeof w.document.dispatchEvent === 'function' && typeof w.CustomEvent === 'function') {
        w.document.dispatchEvent(new w.CustomEvent('vilda:ds-source-state', { detail: stan }));
      }
    } catch (_) { /* no presentation consumer */ }
  }

  function ustawStan(patientId, status) {
    oczekiwanyPacjent = patientId || null;
    statusOdczytu = status;
    oglosStan();
  }

  /* Wspólny sygnał zmiany źródeł pacjenta (vilda_zrodla_pacjenta.js). Odczyt rekordu z
   * sejfu jest asynchroniczny, a strona nie miała powodu policzyć się drugi raz — stąd
   * wynik z siatki populacyjnej u pacjenta z rozpoznaniem aż do przeładowania strony.
   * Moduł nadal niczego nie liczy: mówi tylko, że jego stan jest inny niż przed chwilą. */
  function oglos() {
    try {
      var Z = w.VildaZrodlaPacjenta;
      if (Z && typeof Z.ogloszJesliInne === 'function') Z.ogloszJesliInne('ds', zapamietane);
    } catch (e) { /* brak wspolnego sygnalu — modul dziala jak dotad */ }
  }

  function zapamietaj(payload) {
    zapamietane = payload && typeof payload === 'object'
      ? { maRekord: true, ds: visitSource() ? usesZemel(payload) : zRekordu(payload) }
      : null;
    oglos();
    return zapamietane;
  }

  function zapomnij() {
    generacjaOdczytu += 1;
    zapamietane = null;
    potwierdzonyPacjent = null;
    ustawStan(null, 'idle');
    oglos();
  }

  // Odpowiedź dla reszty aplikacji.
  function maFlage() {
    var source = visitSource();
    if (source) {
      var patientId = wybranyPacjent();
      return patientId ? usesZemel(activeVisitPayload(source, patientId)) : !!rapidDiagnosis();
    }
    return wybierz({
      maRekord: !!zapamietane,
      rekord: !!(zapamietane && zapamietane.ds)
    });
  }

  function populacja() {
    return populacjaZFlagi(maFlage());
  }

  /* ── wczytanie z sejfu ───────────────────────────────────────────────────────── */

  /* P-ZRODLA-PRZEJECIE (2026-10-06): odczyty z sejfu bywają w locie dwa naraz — poprzedni pacjent
   * i ten, którego panel właśnie przejął z sesji karty. Wynik starszego odczytu nie nadpisuje
   * nowszego (ta sama zasada co w vilda_puberty_source.js). */
  var generacjaOdczytu = 0;

  function wybranyPacjent() {
    var id = null;
    try { if (w.sessionStorage) id = w.sessionStorage.getItem('vildaCurrentPatientId'); } catch (_) { /* legacy frame */ }
    if (visitSource()) return id || null;
    return id || w._vildaCurrentPatientId || null;
  }

  function podepnijSejf(V) {
    if (!V || V === podlaczonySejf) return;
    podlaczonySejf = V;
    if (typeof V.onLock === 'function') V.onLock(function () {
      if (podlaczonySejf === V) zapomnij();
    });
  }

  function wczytaj(patientId) {
    var V = w.VildaVault;
    var source = visitSource();
    if (source) {
      generacjaOdczytu += 1;
      if (V) podepnijSejf(V);
      var payload = activeVisitPayload(source, patientId);
      zapamietaj(payload);
      potwierdzonyPacjent = payload ? patientId : null;
      ustawStan(patientId, payload ? 'ready' : patientId ? 'pending' : 'idle');
      return;
    }
    if (!patientId || !V || typeof V.isUnlocked !== 'function' || !V.isUnlocked()
      || typeof V.getPatient !== 'function') return;
    podepnijSejf(V);
    var generacja = ++generacjaOdczytu;
    var zachowaj = statusOdczytu === 'ready' && potwierdzonyPacjent === patientId;
    if (!zachowaj) ustawStan(patientId, 'pending');
    try {
      V.getPatient(patientId).then(function (rec) {
        var wybrany = wybranyPacjent();
        if (visitSource() || generacja !== generacjaOdczytu || podlaczonySejf !== V || !V.isUnlocked()
          || wybrany && wybrany !== patientId) return;
        var snap = rec && Array.isArray(rec.snapshots) && rec.snapshots.length
          ? rec.snapshots[0] : null;
        if (!snap || !snap.payload || typeof snap.payload !== 'object'
          || rec.patientId && rec.patientId !== patientId) {
          if (!zachowaj) ustawStan(patientId, 'error');
          return;
        }
        zapamietaj(snap.payload);
        potwierdzonyPacjent = patientId;
        ustawStan(patientId, 'ready');
      }).catch(function () {
        if (generacja === generacjaOdczytu && !zachowaj) ustawStan(patientId, 'error');
      });
    } catch (e) {
      if (generacja === generacjaOdczytu && !zachowaj) ustawStan(patientId, 'error');
    }
  }

  function draftChanged() {
    if (!visitSource() || wybranyPacjent()) return;
    var code = rapidDiagnosis();
    zapamietane = code ? { maRekord: false, ds: true } : null;
    oglos();
    oglosStan();
  }

  function podepnij() {
    var doc = w.document;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    if (w.__vildaDsSourceBound) return;
    w.__vildaDsSourceBound = true;

    doc.addEventListener('vilda:patient-loaded', function (ev) {
      var id = ev && ev.detail ? ev.detail.patientId : null;
      if (id) wczytaj(id);
    });

    // Kasowanie stanu leci na WINDOW, nie na document (userData.js, vilda_persist_runtime.js).
    if (typeof w.addEventListener === 'function') {
      w.addEventListener('vilda:user-state-cleared', zapomnij);
    }

    /* P-ZRODLA-PRZEJECIE (2026-10-06, uwaga Codex P1 do #491): bieżący pacjent to pacjent sesji
     * karty. Ramki powłoki app.html dzielą sessionStorage, a własna zmienna ramki potrafi jeszcze
     * wskazywać poprzedniego pacjenta (P-POWLOKA-ID); zmienna ramki zostaje, gdy sesja go nie zna. */
    odswiez = function () {
      var id = wybranyPacjent();
      if (id) wczytaj(id);
      else if (visitSource()) zapomnij();
    };
    doc.addEventListener('vilda:auth-hidden', odswiez);
    doc.addEventListener('vilda:sync-status-changed', odswiez);
    doc.addEventListener('vilda:data-applied', function () { if (visitSource()) odswiez(); });
    /* P-ZRODLA-PRZEJECIE: panel powłoki przejmuje pacjenta wczytanego w innej ramce w
     * vildaPersistRestoreAll (vilda_persist_runtime.js) — bez vilda:patient-loaded, które dostaje
     * tylko ramka wczytująca. Odtworzenie kończy się vilda:persist-restored, a zmiana pacjenta
     * sesji karty w innej ramce przychodzi tu jako zdarzenie storage. Bez tego panel po powrocie
     * przyciskiem „Wstecz” liczył dla nowego pacjenta z rekordu poprzedniego. */
    doc.addEventListener('vilda:persist-restored', odswiez);
    if (typeof w.addEventListener === 'function') {
      w.addEventListener('storage', function (ev) {
        if (!ev || ev.key == null || ev.key === 'vildaCurrentPatientId') odswiez();
      });
    }
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', function () { setTimeout(odswiez, 0); }, { once: true });
    } else {
      setTimeout(odswiez, 0);
    }
  }

  podepnij();

  /* P-DS-4: dobrze znana globalna funkcja, po którą sięga silnik BMI, gdy konsument nie poda
     populacji jawnie. Tą samą drogą silnik bierze tablice (window.VildaBmiLMS) — nie zna DOM
     ani sejfu, pyta aplikację. Moduł liczący dla KOGOŚ INNEGO niż wczytany pacjent (wsad XLSX)
     podaje populację jawnie i tym samym wypisuje się z tej reguły. */
  w.VildaPopulacjaPacjenta = populacja;

  w.VildaDsSource = {
    VERSION: VERSION,
    zRekordu: zRekordu,
    wybierz: wybierz,
    populacjaZFlagi: populacjaZFlagi,
    zapamietaj: zapamietaj,
    zapomnij: zapomnij,
    maFlage: maFlage,
    populacja: populacja,
    canonicalDiagnosisCode: canonicalDiagnosisCode,
    diagnosisCodeFromNotes: diagnosisCodeFromNotes,
    readDiagnosisCode: readDiagnosisCode,
    diagnosisCode: diagnosisCode,
    usesZemel: usesZemel,
    applyDiagnosisToVisit: applyDiagnosisToVisit,
    carryVisitReference: carryVisitReference,
    draftChanged: draftChanged,
    getState: getState,
    retry: function () { if (typeof odswiez === 'function') odswiez(); }
  };
}(typeof window !== 'undefined' ? window : this));
