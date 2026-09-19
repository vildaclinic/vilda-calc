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

  var VERSION = '2';

  /* ── czyste funkcje (mierzalne bez przeglądarki) ─────────────────────────────── */

  // Rozpoznanie z payloadu rekordu. Cokolwiek innego niż jawne `true` znaczy „nie".
  function zRekordu(payload) {
    if (!payload || typeof payload !== 'object') return false;
    var k = payload.clinical;
    return !!(k && typeof k === 'object' && k.downSyndrome === true);
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
      ? { maRekord: true, ds: zRekordu(payload) }
      : null;
    oglos();
    return zapamietane;
  }

  function zapomnij() {
    zapamietane = null;
    oglos();
  }

  // Odpowiedź dla reszty aplikacji.
  function maFlage() {
    return wybierz({
      maRekord: !!zapamietane,
      rekord: !!(zapamietane && zapamietane.ds)
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
    populacja: populacja
  };
}(typeof window !== 'undefined' ? window : this));
