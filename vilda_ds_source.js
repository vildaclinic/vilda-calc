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
 * ZASADA (decyzja właściciela D1): ten moduł niczego nie liczy i niczego nie zapisuje.
 *  - Jest wczytany pacjent → decyduje WYŁĄCZNIE pole w rekordzie (brak pola = brak DS,
 *    więc stare rekordy czytają się bez migracji).
 *  - Nie ma wczytanego pacjenta (użycie doraźne, np. kalkulator na index.html) → decyduje
 *    stan karty modułu, tak jak dotąd.
 * Nigdy odwrotnie: rozwinięcie karty nie „dodaje" DS pacjentowi, który go w rekordzie
 * nie ma — inaczej wróciłby dokładnie ten błąd, który ten etap usuwa.
 *
 * CZEGO TU NIE MA: siatek, wzoru i progów. Populację dostaje silnik (`vilda_bmi.js`)
 * jako `populacja: 'DS'` i to on decyduje, co z nią zrobić.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  /* ── czyste funkcje (mierzalne bez przeglądarki) ─────────────────────────────── */

  // Rozpoznanie z payloadu rekordu. Cokolwiek innego niż jawne `true` znaczy „nie".
  function zRekordu(payload) {
    if (!payload || typeof payload !== 'object') return false;
    var k = payload.clinical;
    return !!(k && typeof k === 'object' && k.downSyndrome === true);
  }

  /* Pierwszeństwo źródeł. `maRekord` mówi, czy w ogóle jest wczytany pacjent — bez tego
   * nie dałoby się odróżnić „rekord mówi nie" od „nie ma rekordu".
   */
  function wybierz(z) {
    var s = z && typeof z === 'object' ? z : {};
    if (s.maRekord === true) return s.rekord === true;
    return s.karta === true;
  }

  function populacjaZFlagi(flaga) {
    return flaga === true ? 'DS' : 'OGOLNA';
  }

  /* ── pamięć rekordu (jak w vilda_perinatal_source.js) ────────────────────────── */

  var zapamietane = null;

  function zapamietaj(payload) {
    zapamietane = payload && typeof payload === 'object'
      ? { maRekord: true, ds: zRekordu(payload) }
      : null;
    return zapamietane;
  }

  function zapomnij() {
    zapamietane = null;
  }

  /* ── stan karty modułu (użycie doraźne, bez wczytanego pacjenta) ─────────────── */

  function zKarty() {
    try {
      if (!w || !w.document || !w.DS) return false;
      var k = w.document.getElementById('downSyndromeCard');
      if (!k) return false;
      var st = typeof w.getComputedStyle === 'function' ? w.getComputedStyle(k) : k.style;
      return !!(st && st.display !== 'none' && st.display !== '');
    } catch (e) {
      return false;
    }
  }

  // Odpowiedź dla reszty aplikacji.
  function maFlage() {
    return wybierz({
      maRekord: !!zapamietane,
      rekord: !!(zapamietane && zapamietane.ds),
      karta: zKarty()
    });
  }

  function populacja() {
    return populacjaZFlagi(maFlage());
  }

  /* ── wczytanie z sejfu ───────────────────────────────────────────────────────── */

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

  w.VildaDsSource = {
    VERSION: VERSION,
    zRekordu: zRekordu,
    wybierz: wybierz,
    populacjaZFlagi: populacjaZFlagi,
    zapamietaj: zapamietaj,
    zapomnij: zapomnij,
    zKarty: zKarty,
    maFlage: maFlage,
    populacja: populacja
  };
}(typeof window !== 'undefined' ? window : this));
