/* vilda_perinatal_source.js — sekcja „Dane okołoporodowe" z Karty Pacjenta jako trzecie
 * źródło danych urodzeniowych.
 *
 * PO CO TO JEST: te same liczby żyją w aplikacji w trzech miejscach i do 1.0.863 tylko
 * dwa z nich były czytane przy liczeniu SGA:
 *
 *   1. karta SGA (docpro.html) — `window.vildaSgaBirthPersistApi.captureState()`;
 *   2. sekcja `birth` rekordu pacjenta — `window.vildaBirthData` (GROWTH-BIRTH-REC);
 *   3. sekcja `perinatal` rekordu, wypełniana w Karcie Pacjenta pod nagłówkiem
 *      „Dane okołoporodowe" („opcjonalne · SGA / epikryza").
 *
 * Trzeciego nie czytał ani opis pacjenta, ani ściąga B.64. Skutek: pacjent, który ma
 * komplet danych wpisany wyłącznie w Karcie Pacjenta i nie otwierał karty SGA, nie
 * dostawał ani zdania o braku catch-upu, ani zestawienia kryteriów B.64 — a na
 * index.html karty SGA w ogóle nie ma, więc nie miał ich nigdy. Zgłoszone przez
 * właściciela 2026-09-08.
 *
 * ZASADA: ten moduł niczego nie liczy i niczego nie zapisuje. Podaje dane w kształcie
 * stanu karty SGA, żeby oba konsumujące moduły (`vilda_patient_narrative_ui.js`,
 * `vilda_b64_checklist_ui.js`) miały JEDNO miejsce, w którym rozstrzyga się pierwszeństwo
 * źródeł — zamiast dwóch kopii tej samej reguły.
 *
 * CZEGO TU NIE MA: pola `sourceKeys`. Karta Pacjenta nie pyta o normy urodzeniowe, więc
 * rekord ich nie niesie; konsumenci mają własną wartość domyślną (Niklasson) i to ona
 * zostaje. Nie zgadujemy za lekarza, których norm użył.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  function tekst(x) {
    return x == null ? '' : String(x).trim();
  }

  // Płeć w rekordzie bywa zapisana jako K/F/female albo M/male — karta SGA rozumie
  // wyłącznie 'male' i 'female'. Ta sama zamiana, którą robi prefill karty.
  function plec(x) {
    var t = tekst(x).toUpperCase();
    if (t === 'K' || t === 'F' || t === 'FEMALE') return 'female';
    if (t === 'M' || t === 'MALE') return 'male';
    return '';
  }

  // Czy zestaw pól niesie cokolwiek, z czego da się policzyć SDS urodzeniowy. Reguła
  // taka sama jak w kolektorze rekordu: sam wiek ciążowy w dniach albo sama płeć to
  // jeszcze nie są dane urodzeniowe.
  function niesieDane(s) {
    if (!s || typeof s !== 'object') return false;
    return !!(tekst(s.weeks) || tekst(s.weight) || tekst(s.length) || tekst(s.head));
  }

  /* Czysta zamiana sekcji `perinatal` na kształt stanu karty SGA. Zwraca null, gdy
   * sekcja jest pusta albo niesie same pola pomocnicze (ciąża, poród) — wtedy nie ma
   * czego liczyć i lepiej, żeby konsument o tym wiedział, niż dostał pusty obiekt.
   */
  function naKarte(perinatal, plecRekordu) {
    if (!perinatal || typeof perinatal !== 'object') return null;
    var s = {
      sex: plec(plecRekordu),
      weeks: tekst(perinatal.gestationalWeeks),
      days: tekst(perinatal.gestationalDays),
      weight: tekst(perinatal.birthWeightG),
      length: tekst(perinatal.birthLengthCm),
      head: tekst(perinatal.birthHeadCircCm),
      zKartyPacjenta: true
    };
    return niesieDane(s) ? s : null;
  }

  /* Pierwszeństwo źródeł — czysta funkcja, żeby dało się je zmierzyć bez przeglądarki.
   *
   *   karta        — stan karty SGA (to, co lekarz widzi i ostatnio poprawił);
   *   rekord       — sekcja `birth` przeniesiona z rekordu (window.vildaBirthData);
   *   kartaPacjenta— sekcja „Dane okołoporodowe" sprowadzona do kształtu karty.
   *
   * Karta wygrywa, bo jest najświeższa i jako jedyna niesie wybór norm. Sekcja `birth`
   * przed „Danymi okołoporodowymi", bo powstaje z karty — jest jej odbiciem, a nie
   * niezależnym wpisem. Źródło bez danych jest pomijane, nie przesłania kolejnych.
   */
  function wybierz(z) {
    var s = z && typeof z === 'object' ? z : {};
    if (niesieDane(s.karta)) return s.karta;
    if (niesieDane(s.rekord)) return s.rekord;
    if (niesieDane(s.kartaPacjenta)) return s.kartaPacjenta;
    return null;
  }

  // ── Pamięć sekcji „Dane okołoporodowe" ───────────────────────────────────────
  //
  // Konsumenci czytają synchronicznie (klik w przycisk), a rekord z vaulta przychodzi
  // obietnicą — więc sekcja jest zapamiętywana przy wczytaniu pacjenta. Ten sam wzorzec,
  // co w vilda_epicrisis_ui.js i w prefillu karty SGA.

  var zapamietane = null;

  function zapamietaj(payload) {
    var p = payload && typeof payload === 'object' && payload.perinatal
      && typeof payload.perinatal === 'object' ? payload.perinatal : null;
    zapamietane = p
      ? { perinatal: p, plec: plec(payload.user ? payload.user.sex : null) }
      : null;
    return zapamietane;
  }

  function zapomnij() {
    zapamietane = null;
  }

  // Sekcja „Dane okołoporodowe" w kształcie karty SGA albo null.
  function zKartyPacjenta() {
    return zapamietane ? naKarte(zapamietane.perinatal, zapamietane.plec) : null;
  }

  // Dane urodzeniowe, których w tej chwili ma używać reszta aplikacji.
  function biezace() {
    var karta = null;
    try {
      var api = w.vildaSgaBirthPersistApi;
      if (api && typeof api.captureState === 'function') karta = api.captureState();
    } catch (e) {
      karta = null;
    }
    return wybierz({
      karta: karta,
      rekord: w.vildaBirthData && typeof w.vildaBirthData === 'object' ? w.vildaBirthData : null,
      kartaPacjenta: zKartyPacjenta()
    });
  }

  // ── Wczytanie z vaulta ───────────────────────────────────────────────────────

  function wczytaj(patientId) {
    var V = w.VildaVault;
    if (!patientId || !V || typeof V.isUnlocked !== 'function' || !V.isUnlocked()
      || typeof V.getPatient !== 'function') return;
    try {
      V.getPatient(patientId).then(function (rec) {
        var snap = rec && Array.isArray(rec.snapshots) && rec.snapshots.length
          ? rec.snapshots[0] : null;
        zapamietaj(snap && snap.payload ? snap.payload : null);
      }).catch(function () { /* rekord nieczytelny — zostaje to, co bylo */ });
    } catch (e) { /* vault odmowil — jak wyzej */ }
  }

  function podepnij() {
    var doc = w.document;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    if (w.__vildaPerinatalSourceBound) return;
    w.__vildaPerinatalSourceBound = true;

    doc.addEventListener('vilda:patient-loaded', function (ev) {
      var id = ev && ev.detail ? ev.detail.patientId : null;
      if (id) wczytaj(id);
    });

    // Wylogowanie i kasowanie stanu leci na WINDOW (userData.js, vilda_persist_runtime.js),
    // nie na document — listener na dokumencie nigdy by się nie odezwał.
    if (typeof w.addEventListener === 'function') {
      w.addEventListener('vilda:user-state-cleared', zapomnij);
    }

    // Domknięcie logowania i powrót synchronizacji: pacjent bywa już wczytany, zanim ten
    // moduł zdąży się podpiąć. Wzorzec przepisany z prefillu karty SGA.
    var odswiez = function () {
      try {
        var id = w._vildaCurrentPatientId || null;
        if (!id && w.sessionStorage) id = w.sessionStorage.getItem('vildaCurrentPatientId');
        if (id) wczytaj(id);
      } catch (e) { /* brak dostepu do sessionStorage */ }
    };
    doc.addEventListener('vilda:auth-hidden', odswiez);
    doc.addEventListener('vilda:sync-status-changed', odswiez);
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', function () { setTimeout(odswiez, 0); }, { once: true });
    } else {
      setTimeout(odswiez, 0);
    }
  }

  podepnij();

  w.VildaPerinatalSource = {
    VERSION: VERSION,
    naKarte: naKarte,
    wybierz: wybierz,
    niesieDane: niesieDane,
    zapamietaj: zapamietaj,
    zapomnij: zapomnij,
    zKartyPacjenta: zKartyPacjenta,
    biezace: biezace
  };
}(typeof window !== 'undefined' ? window : this));
