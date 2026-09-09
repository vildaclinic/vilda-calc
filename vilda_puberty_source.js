/* vilda_puberty_source.js — sekcja „Dojrzewanie płciowe" z Karty Pacjenta jako źródło
 * danych o czasie pokwitania.
 *
 * PO CO TO JEST: normy tempa wzrastania Kelly'ego mają osobne wartości LMS dla dzieci
 * dojrzewających wcześniej, przeciętnie i później, ale wybór podgrupy wymaga JEDNEJ
 * liczby, której aplikacja dotąd nigdzie nie zbierała — wieku startu pokwitania.
 * Bez niej podgrupy są martwym kodem: silnik zawsze liczy na uśrednionej krzywej.
 *
 * DWIE LICZBY, DWIE ROLE:
 *
 *   wiek startu pokwitania (u dziewcząt B2/telarche, u chłopców objętość jąder 4 ml)
 *     — TO jest zmienna, na której zbudowano podgrupy Kelly'ego, i tylko ona je wybiera;
 *
 *   wiek menarche
 *     — fakt kliniczny wart zapisania, ale NIE zamiennik powyższego. Odstęp między
 *       telarche a pierwszą miesiączką jest indywidualny (typowo 2–2,5 roku, ale to
 *       wartość opisowa, nie przelicznik), więc podstawienie jednego za drugie byłoby
 *       progiem wymyślonym przez aplikację. Ten moduł tego nie robi i silnik też nie.
 *
 * ZASADA: moduł niczego nie liczy i niczego nie zapisuje. Czyta rekord pacjenta,
 * zapamiętuje sekcję i podaje ją w kształcie, którego oczekuje `VildaHeightVelocity`.
 * Wzorzec przepisany z `vilda_perinatal_source.js` — jedno miejsce, w którym rozstrzyga
 * się, skąd te dane pochodzą.
 *
 * CZEGO TU NIE MA: żadnej reguły „jeśli brak startu, przyjmij X". Brak danych zostaje
 * brakiem danych i silnik dostaje null.
 */
(function (w) {
  'use strict';

  var VERSION = '2';

  var POLA = ['onsetAgeYears', 'menarcheAgeYears', 'cdgpDeclared'];

  // Deklaracja KOWD jest odpowiedzia lekarza, nie wynikiem automatu — dopuszczalne sa
  // wylacznie te dwie wartosci, brak odpowiedzi zostaje brakiem odpowiedzi.
  var KOWD_DOPUSZCZALNE = { tak: 1, nie: 1 };

  function liczba(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    if (typeof x !== 'string') return null;
    var t = x.trim().replace(',', '.');
    if (t === '') return null;
    var v = parseFloat(t);
    return isFinite(v) ? v : null;
  }

  function plec(x) {
    var t = (x == null ? '' : String(x)).trim().toUpperCase();
    if (t === 'K' || t === 'F' || t === 'FEMALE') return 'F';
    if (t === 'M' || t === 'MALE') return 'M';
    return '';
  }

  /* Czysta zamiana sekcji `puberty` rekordu na wejście silnika. Zwraca null, gdy sekcja
   * nie niesie żadnej z dwóch liczb — pusty obiekt kłamałby, że dane są. */
  function naWejscie(puberty) {
    if (!puberty || typeof puberty !== 'object') return null;
    var start = liczba(puberty.onsetAgeYears);
    var menarche = liczba(puberty.menarcheAgeYears);
    var kowd = typeof puberty.cdgpDeclared === 'string'
      && Object.prototype.hasOwnProperty.call(KOWD_DOPUSZCZALNE, puberty.cdgpDeclared)
      ? puberty.cdgpDeclared : '';
    if (start == null && menarche == null && !kowd) return null;
    return {
      wiekStartuPokwitaniaLat: start,
      wiekMenarcheLat: menarche,
      kowd: kowd,
      zKartyPacjenta: true
    };
  }

  function niesieDane(s) {
    return !!(s && typeof s === 'object'
      && (s.wiekStartuPokwitaniaLat != null || s.wiekMenarcheLat != null || s.kowd));
  }

  // ── Pamięć sekcji ────────────────────────────────────────────────────────────
  //
  // Konsument czyta synchronicznie, a rekord z vaulta przychodzi obietnicą — więc sekcja
  // jest zapamiętywana przy wczytaniu pacjenta. Ten sam wzorzec, co w module
  // okołoporodowym i w prefillu karty SGA.

  var zapamietane = null;

  function zapamietaj(payload) {
    var p = payload && typeof payload === 'object' && payload.puberty
      && typeof payload.puberty === 'object' ? payload.puberty : null;
    var we = naWejscie(p);
    zapamietane = we
      ? { we: we, plec: plec(payload.user ? payload.user.sex : null) }
      : null;
    return zapamietane;
  }

  function zapomnij() {
    zapamietane = null;
  }

  function zKartyPacjenta() {
    return zapamietane ? zapamietane.we : null;
  }

  function plecRekordu() {
    return zapamietane ? zapamietane.plec : '';
  }

  // Dane o pokwitaniu, których w tej chwili ma używać reszta aplikacji.
  function biezace() {
    var s = zKartyPacjenta();
    return niesieDane(s) ? s : null;
  }

  /* Ocena wieku startu pokwitania wobec kohorty Kelly'ego — cienka delegacja do silnika,
   * żeby konsument nie musiał znać ani progów, ani kryteriów włączenia kohorty. Bez
   * silnika albo bez danych zwraca null; sam tych progów nie kopiuje. */
  function ocenStart(plecArg) {
    var H = w.VildaHeightVelocity;
    var s = biezace();
    if (!H || typeof H.ocenStartPokwitania !== 'function' || !s) return null;
    var pl = plec(plecArg) || plecRekordu();
    if (!pl) return null;
    return H.ocenStartPokwitania(pl, s.wiekStartuPokwitaniaLat);
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
    if (w.__vildaPubertySourceBound) return;
    w.__vildaPubertySourceBound = true;

    doc.addEventListener('vilda:patient-loaded', function (ev) {
      var id = ev && ev.detail ? ev.detail.patientId : null;
      if (id) wczytaj(id);
    });

    // Wylogowanie i kasowanie stanu leci na WINDOW, nie na document.
    if (typeof w.addEventListener === 'function') {
      w.addEventListener('vilda:user-state-cleared', zapomnij);
    }

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

  w.VildaPubertySource = {
    VERSION: VERSION,
    POLA: POLA,
    naWejscie: naWejscie,
    niesieDane: niesieDane,
    zapamietaj: zapamietaj,
    zapomnij: zapomnij,
    zKartyPacjenta: zKartyPacjenta,
    biezace: biezace,
    ocenStart: ocenStart
  };
}(typeof window !== 'undefined' ? window : this));
