/* vilda_pubertal_status.js — jedno źródło prawdy o dojrzewaniu płciowym pacjenta.
 *
 * PO CO TO JEST (zgłoszenie właściciela 2026-09-08): etap Tannera dawało się dotąd wpisać
 * w trzech niezależnych miejscach — w formularzu głównym (`#tannerStage`), pośrednio przez
 * objętość jąder w karcie „Zaawansowane obliczenia wzrostowe" i w module jednostek
 * laboratoryjnych (`#labOverrideTanner`). Żadne z nich nie widziało pozostałych, więc
 * pacjent mógł mieć jednocześnie Tanner I w formularzu, 6 ml w karcie zaawansowanej
 * i Tanner III przy normach laboratoryjnych — i nic tego nie zauważało.
 *
 * DECYZJA WŁAŚCICIELA 2026-09-09: miejscem wpisu jest rozwinięty panel formularza głównego,
 * a reszta aplikacji już tylko czyta. Ten moduł jest tym „czyta": zbiera etap, dane
 * pokwitaniowe z rekordu i deklarację KOWD, stosuje regułę świeżości i wykrywa sprzeczności.
 *
 * DWA RODZAJE DANYCH, DWA MIEJSCA ZAPISU (decyzja właściciela 2026-09-09):
 *   stan na dziś  — etap Tannera, objętość jąder: zapisywane PRZY POMIARZE, z datą wpisu,
 *                   bo stadium zmienia się z wizyty na wizytę;
 *   fakt trwały   — wiek startu pokwitania, wiek menarche, deklaracja KOWD: zapisywane
 *                   W REKORDZIE (sekcja `puberty`), bo wpisane raz już się nie zmieniają.
 * Panel wygląda jak jedno miejsce, ale zapisuje w dwa — dlatego karta pacjenta i formularz
 * pokazują TĘ SAMĄ wartość, a nie jej kopię.
 *
 * ŚWIEŻOŚĆ (decyzja właściciela 2026-09-09): stadium z rekordu starsze niż 12 miesięcy jest
 * w ocenie IGNOROWANE, nie tylko oznaczane. Tak działał już strażnik TANNER_FRESH_M w karcie
 * trajektorii; tutaj ta sama reguła obowiązuje wszystkich konsumentów. Etap wpisany w bieżącym
 * formularzu nie ma daty i jest zawsze traktowany jako aktualny.
 *
 * CZEGO TU NIE MA: żadnego zgadywania. Moduł nie podstawia etapu z wieku (opcja
 * „automatycznie z wieku" nigdy niczego nie podstawiała — etykieta obiecywała coś,
 * czego kod nie robił) i nie przelicza menarche na wiek startu pokwitania.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  // Ta sama liczba, co P.TANNER_FRESH_M w vilda_trajectory_analysis.js.
  var SWIEZOSC_MIES = 12;

  var POLA_DOM = {
    etap: 'tannerStage',
    start: 'pubertyOnsetAge',
    menarche: 'pubertyMenarcheAge',
    kowd: 'pubertyCdgp',
    jadra: 'advTesticularVolume'
  };

  function el(id) {
    try {
      return w.document && typeof w.document.getElementById === 'function'
        ? w.document.getElementById(id) : null;
    } catch (e) { return null; }
  }

  function wartosc(id) {
    var e = el(id);
    return e && e.value != null ? String(e.value).trim() : '';
  }

  function liczba(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    if (typeof x !== 'string') return null;
    var t = x.trim().replace(',', '.');
    if (t === '') return null;
    var v = parseFloat(t);
    return isFinite(v) ? v : null;
  }

  function etapLiczbowy(x) {
    var v = liczba(x);
    if (v == null) return null;
    v = Math.round(v);
    return v >= 1 && v <= 5 ? v : null;
  }

  function plecKod(x) {
    var t = (x == null ? '' : String(x)).trim().toUpperCase();
    if (t === 'K' || t === 'F' || t === 'FEMALE' || t === 'GIRL') return 'F';
    if (t === 'M' || t === 'MALE' || t === 'BOY') return 'M';
    return '';
  }

  /* Rozstrzygnięcie etapu wobec reguły świeżości. Czysta funkcja — bez DOM, żeby dało się
   * ją zmierzyć testem. Zwraca zawsze obiekt, nigdy samą liczbę: konsument ma wiedzieć nie
   * tylko JAKI etap, ale też SKĄD i czy w ogóle wolno go użyć. */
  function ocenEtap(we) {
    var i = we && typeof we === 'object' ? we : {};
    var zFormularza = etapLiczbowy(i.etapFormularz);
    if (zFormularza != null) {
      return {
        etap: zFormularza, zrodlo: 'formularz',
        wiekWpisuMies: null, nieaktualny: false, etapPominiety: null
      };
    }
    var zRekordu = etapLiczbowy(i.etapRekord);
    if (zRekordu == null) {
      return { etap: null, zrodlo: null, wiekWpisuMies: null, nieaktualny: false, etapPominiety: null };
    }
    var wpis = liczba(i.wiekWpisuMies);
    var teraz = liczba(i.wiekTerazMies);
    if (wpis != null && teraz != null && teraz - wpis > SWIEZOSC_MIES) {
      return {
        etap: null, zrodlo: 'rekord', wiekWpisuMies: wpis,
        nieaktualny: true, etapPominiety: zRekordu
      };
    }
    return {
      etap: zRekordu, zrodlo: 'rekord', wiekWpisuMies: wpis,
      nieaktualny: false, etapPominiety: null
    };
  }

  var RZYMSKIE = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };

  /* Sprzeczności między polami. Moduł ich nie rozstrzyga i niczego nie kasuje — pokazuje
   * lekarzowi, że dwa pola mówią co innego, i zostawia decyzję jemu. */
  function sprzecznosci(we) {
    var i = we && typeof we === 'object' ? we : {};
    var lista = [];
    var t = etapLiczbowy(i.etap);
    var plec = plecKod(i.plec);
    var jadra = i.jadra == null ? '' : String(i.jadra);
    var start = liczba(i.wiekStartuLat);
    var menarche = liczba(i.wiekMenarcheLat);
    var wiek = liczba(i.wiekLat);

    if (plec === 'M' && t != null) {
      if (t === 1 && (jadra === '4to6' || jadra === 'gt6')) {
        lista.push('Tanner I wyklucza objętość jąder ≥ 4 ml — te dwa pola mówią co innego.');
      }
      if (t >= 2 && jadra === 'lt4') {
        lista.push('Tanner ' + RZYMSKIE[t] + ' przy jądrach < 4 ml — u chłopca gonadarche '
          + 'zaczyna się od objętości 4 ml.');
      }
    }
    if (t === 1 && start != null && wiek != null && start < wiek) {
      lista.push('Wpisano start pokwitania w ' + start + ' r.ż., a etap to Tanner I — '
        + 'dziecko po starcie pokwitania nie jest przedpokwitaniowe.');
    }
    if (menarche != null && t != null && t <= 2) {
      lista.push('Menarche przy Tanner ' + RZYMSKIE[t] + ' — pierwsza miesiączka wypada '
        + 'zwykle w stadium III–IV.');
    }
    if (menarche != null && plec === 'M') {
      lista.push('Wiek menarche wpisany u chłopca.');
    }
    if (start != null && menarche != null && menarche < start) {
      lista.push('Wiek menarche wcześniejszy niż wiek startu pokwitania.');
    }
    return lista;
  }

  // ── Odczyt bieżącego stanu aplikacji ─────────────────────────────────────────

  function zRekordu() {
    try {
      var P = w.VildaPubertySource;
      return P && typeof P.biezace === 'function' ? P.biezace() : null;
    } catch (e) { return null; }
  }

  /* Dane pokwitaniowe, których ma używać reszta aplikacji. Pierwszeństwo ma to, co lekarz
   * widzi na ekranie (pola formularza); rekord wchodzi tam, gdzie pola nie ma — na stronach
   * bez formularza głównego, np. w karcie DocPro. */
  function dane(we) {
    var i = we && typeof we === 'object' ? we : {};
    var rek = zRekordu();
    var startDom = liczba(wartosc(POLA_DOM.start));
    var menarcheDom = liczba(wartosc(POLA_DOM.menarche));
    var kowdDom = wartosc(POLA_DOM.kowd);
    var etap = ocenEtap({
      etapFormularz: i.etapFormularz != null ? i.etapFormularz : wartosc(POLA_DOM.etap),
      etapRekord: i.etapRekord,
      wiekWpisuMies: i.wiekWpisuMies,
      wiekTerazMies: i.wiekTerazMies
    });
    var out = {
      etap: etap.etap,
      etapZrodlo: etap.zrodlo,
      etapNieaktualny: etap.nieaktualny,
      etapPominiety: etap.etapPominiety,
      wiekStartuLat: startDom != null ? startDom : (rek ? rek.wiekStartuPokwitaniaLat : null),
      wiekMenarcheLat: menarcheDom != null ? menarcheDom : (rek ? rek.wiekMenarcheLat : null),
      kowd: kowdDom || (rek && rek.kowd ? rek.kowd : ''),
      jadra: wartosc(POLA_DOM.jadra)
    };
    out.sprzecznosci = sprzecznosci({
      etap: out.etap, plec: i.plec, jadra: out.jadra,
      wiekStartuLat: out.wiekStartuLat, wiekMenarcheLat: out.wiekMenarcheLat,
      wiekLat: i.wiekLat
    });
    return out;
  }

  w.VildaPubertalStatus = {
    VERSION: VERSION,
    SWIEZOSC_MIES: SWIEZOSC_MIES,
    POLA_DOM: POLA_DOM,
    ocenEtap: ocenEtap,
    sprzecznosci: sprzecznosci,
    dane: dane
  };
}(typeof window !== 'undefined' ? window : this));
