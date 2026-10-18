/* vilda_pubertal_status.js — wspólny odczyt dojrzewania dla wzrastania.
 *
 * Etap 2 (2026-10-15): dane() wybiera wyłącznie G u chłopców i Th u dziewcząt
 * przez VildaPubertyAssessmentContext. P i dawny nieokreślony Tanner nie
 * zastępują osi gonadalnej. Brak oceny nie uruchamia fallbacku do rekordu.
 *
 * Świeżość: zachowana operacyjna granica 12 miesięcy od oceny (włącznie),
 * kwalifikowana w centralnym adapterze wraz z płcią i pochodzeniem. Transport
 * loaded/restored i autosave nie potwierdzają badania w bieżącej wizycie.
 *
 * Fakty trwałe (początek, menarche, GnRHa, KOWD) zachowują dotychczasowe
 * oddzielne kontrakty. Kategorie objętości jąder nie wyznaczają G.
 *
 * ocenEtap() i sprzecznosci() pozostają czystym niskopoziomowym API dla
 * wywołania, które jawnie deklaruje gonadalny etap. Nie czytają legacy JSON.
 * Rejestr kliniczny: docs/clinical/ALGORITHMS.md, GROWTH-TRAJ / PUBERTY-ASSESSMENT.
 */
(function (w) {
  'use strict';

  var VERSION = '6';

  // Ta sama liczba, co P.TANNER_FRESH_M w vilda_trajectory_analysis.js.
  var SWIEZOSC_MIES = 12;

  var POLA_DOM = {
    etap: 'tannerStage',
    start: 'pubertyOnsetAge',
    menarche: 'pubertyMenarcheAge',
    // GROWTH-PRED-TW2B: wzrost w chwili pierwszej miesiączki (cm) — fakt trwały, do prognozy
    // wzrostu ostatecznego (pseudometoda „wzrost przy menarche / 0,955").
    wzrostMenarche: 'pubertyMenarcheHeight',
    // GROWTH-PRED-TW2C: wiek kostny (GP) z RTG wykonanego przy menarche — do korekty Cho 2026.
    wiekKostnyMenarche: 'pubertyMenarcheBoneAge',
    // GROWTH-PRED-PUB1: leczenie GnRHa (status + wiek startu/końca) — fakt trwały rekordu.
    gnrhaStatus: 'pubertyGnrhaStatus',
    gnrhaStart: 'pubertyGnrhaStartAge',
    gnrhaStop: 'pubertyGnrhaStopAge',
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

  function zrodlo() {
    try { return w.VildaPubertySource || null; } catch (e) { return null; }
  }

  /* Wartość pola „stanu na dziś" — z ekranu tam, gdzie pole jest, z rekordu tam, gdzie go
   * nie ma. Sama reguła mieszka w `vilda_puberty_source.js`; tutaj tylko z niej korzystamy,
   * żeby obie karty czytały przez te same drzwi. Bez modułu źródłowego (strona, która go nie
   * ładuje) zostaje zwykły odczyt z ekranu — czyli dzisiejsze zachowanie. */
  function stanPola(id) {
    var p = zrodlo();
    if (p && typeof p.zPolaLubRekordu === 'function') {
      try { return String(p.zPolaLubRekordu(id) || '').trim(); } catch (e) { /* poniżej */ }
    }
    return wartosc(id);
  }

  /* Wiek bieżący w miesiącach — potrzebny WYŁĄCZNIE po to, żeby dało się zmierzyć wiek
   * stadium wziętego z rekordu. Najpierw to, co podał konsument, potem pola wieku, które
   * ma i formularz główny, i DocPro. */
  function wiekTerazZEkranu(i) {
    var lat = liczba(i.wiekLat);
    if (lat != null) return lat * 12;
    var l = liczba(wartosc('age'));
    var m = liczba(wartosc('ageMonths'));
    if (l == null && m == null) return null;
    return (l == null ? 0 : l) * 12 + (m == null ? 0 : m);
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
    var start = liczba(i.wiekStartuLat);
    var menarche = liczba(i.wiekMenarcheLat);
    var wiek = liczba(i.wiekLat);
    var wzrostMenarche = liczba(i.wzrostPrzyMenarcheCm);
    var wzrost = liczba(i.wzrostCm);
    var kostnyMenarche = liczba(i.wiekKostnyPrzyMenarcheLat);
    var gStatus = i.gnrhaStatus == null ? '' : String(i.gnrhaStatus);
    var gStart = liczba(i.gnrhaStartLat);
    var gStop = liczba(i.gnrhaStopLat);

    // Kategorie objętości nie wyznaczają morfologicznego G. Orientacyjne
    // wartości Pradera pomagają ocenić opis, ale nie pozwalają odrzucić G2 przy
    // objętości <4 mL ani automatycznie skorygować stadium.
    if (i.stageIsCurrent !== false && t === 1 && start != null && wiek != null && start < wiek) {
      lista.push('Wpisano start pokwitania w ' + start + ' r.ż., a etap to Tanner I — '
        + 'dziecko po starcie pokwitania nie jest przedpokwitaniowe.');
    }
    if (i.stageIsCurrent !== false && menarche != null && t != null && t <= 2) {
      lista.push('Menarche przy Tanner ' + RZYMSKIE[t] + ' — pierwsza miesiączka wypada '
        + 'zwykle w stadium III–IV.');
    }
    if (menarche != null && plec === 'M') {
      lista.push('Wiek menarche wpisany u chłopca.');
    }
    if (start != null && menarche != null && menarche < start) {
      lista.push('Wiek menarche wcześniejszy niż wiek startu pokwitania.');
    }
    if (wzrostMenarche != null && plec === 'M') {
      lista.push('Wzrost przy menarche wpisany u chłopca.');
    }
    if (wzrostMenarche != null && menarche == null && plec !== 'M') {
      lista.push('Wpisano wzrost przy menarche bez wieku menarche — bez wieku prognoza nie wie, czy dziewczynka jest po menarche.');
    }
    if (wzrostMenarche != null && wzrost != null && wzrostMenarche > wzrost + 0.5) {
      lista.push('Wzrost przy menarche (' + String(wzrostMenarche).replace('.', ',') + ' cm) większy niż wzrost obecny (' + String(wzrost).replace('.', ',') + ' cm).');
    }
    if (kostnyMenarche != null && plec === 'M') {
      lista.push('Wiek kostny przy menarche wpisany u chłopca.');
    }
    if (kostnyMenarche != null && menarche == null && plec !== 'M') {
      lista.push('Wpisano wiek kostny przy menarche bez wieku menarche.');
    }
    if (gStart != null && gStop != null && gStop < gStart) {
      lista.push('Wiek zakończenia GnRHa wcześniejszy niż wiek rozpoczęcia.');
    }
    if (gStatus === 'w-trakcie' && gStop != null) {
      lista.push('Leczenie GnRHa „w trakcie", a wpisano wiek zakończenia.');
    }
    if (gStatus === 'zakonczone' && gStop == null) {
      lista.push('Leczenie GnRHa „zakończone" bez wieku zakończenia.');
    }
    if ((gStatus === 'w-trakcie' || gStatus === 'zakonczone') && gStart != null && wiek != null && gStart > wiek + 0.05) {
      lista.push('Wiek rozpoczęcia GnRHa (' + String(gStart).replace('.', ',') + ' l) późniejszy niż wiek obecny.');
    }
    if ((gStart != null || gStop != null) && gStatus !== 'w-trakcie' && gStatus !== 'zakonczone') {
      lista.push('Wpisano wiek leczenia GnRHa, a status leczenia to „' + (gStatus === 'brak' ? 'nie leczono' : 'nie pytano') + '".');
    }
    return lista;
  }

  function pustaOcenaGonadalna() {
    return { kind: null, stage: null, observation: null, ageMonths: null,
      observedAtISO: null, source: null, current: false, usableForGrowth: false,
      status: 'absent', reason: 'absent' };
  }

  function aktywnaOcena(i) {
    var opts = { sex: plecKod(i.plec || wartosc('sex')),
      currentAgeMonths: i.wiekTerazMies != null ? i.wiekTerazMies : wiekTerazZEkranu(i) };
    // Brak nadpisania zachowuje datę ocenianej wizyty z centralnego źródła.
    if (Object.prototype.hasOwnProperty.call(i, 'measuredAtISO')) opts.measuredAtISO = i.measuredAtISO;
    try {
      var runtime = w.VildaPubertyAssessmentContext;
      if (runtime && typeof runtime.readActiveContext === 'function') {
        var context = runtime.readActiveContext(opts);
        if (context && context.growth) return context;
      }
    } catch (e) { /* brak kwalifikującego się źródła nie staje się starym numerem */ }
    return { assessmentContext: null, growth: pustaOcenaGonadalna() };
  }

  // Transport do istniejących czystych silników: numer ma jawnie nazwany rodzaj,
  // a wiek obserwacji pozostaje wiekiem oceny, nie datą autosave.
  function kontekstWzrastania(i) {
    var d = dane(i);
    return { tannerStage: d.etap, tannerKind: d.etapRodzaj,
      tannerAtAgeMonths: d.wiekEtapuMies, assessmentContext: d.assessmentContext,
      tannerStale: d.etapNieaktualny, tannerStaleStage: d.etapPominiety };
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
    var wzrostMenarcheDom = liczba(wartosc(POLA_DOM.wzrostMenarche));
    var kostnyMenarcheDom = liczba(wartosc(POLA_DOM.wiekKostnyMenarche));
    var gnrhaStatusDom = wartosc(POLA_DOM.gnrhaStatus);
    var gnrhaStartDom = liczba(wartosc(POLA_DOM.gnrhaStart));
    var gnrhaStopDom = liczba(wartosc(POLA_DOM.gnrhaStop));
    var kowdDom = wartosc(POLA_DOM.kowd);
    // Wyłącznie typowana oś gonadalna z aktywnej wizyty. Stary numer oraz
    // samo P pozostają opisem danych; nie są wejściem oceny wzrastania.
    var resolved = aktywnaOcena(i);
    var etap = resolved.growth;
    var out = {
      etap: etap.stage,
      etapRodzaj: etap.kind,
      wiekEtapuMies: etap.ageMonths,
      dataEtapuISO: etap.observedAtISO,
      etapZrodlo: etap.observation ? (etap.current ? 'formularz' : 'rekord') : null,
      etapNieaktualny: etap.reason === 'stale',
      etapPominiety: etap.stage == null && etap.observation ? etap.observation.stage : null,
      etapOcena: etap,
      assessmentContext: resolved.assessmentContext,
      wiekStartuLat: startDom != null ? startDom : (rek ? rek.wiekStartuPokwitaniaLat : null),
      wiekMenarcheLat: menarcheDom != null ? menarcheDom : (rek ? rek.wiekMenarcheLat : null),
      wzrostPrzyMenarcheCm: wzrostMenarcheDom != null ? wzrostMenarcheDom : (rek && rek.wzrostPrzyMenarcheCm != null ? rek.wzrostPrzyMenarcheCm : null),
      wiekKostnyPrzyMenarcheLat: kostnyMenarcheDom != null ? kostnyMenarcheDom : (rek && rek.wiekKostnyPrzyMenarcheLat != null ? rek.wiekKostnyPrzyMenarcheLat : null),
      gnrhaStatus: gnrhaStatusDom || (rek && rek.gnrhaStatus ? rek.gnrhaStatus : ''),
      gnrhaStartLat: gnrhaStartDom != null ? gnrhaStartDom : (rek && rek.gnrhaStartLat != null ? rek.gnrhaStartLat : null),
      gnrhaStopLat: gnrhaStopDom != null ? gnrhaStopDom : (rek && rek.gnrhaStopLat != null ? rek.gnrhaStopLat : null),
      kowd: kowdDom || (rek && rek.kowd ? rek.kowd : ''),
      jadra: stanPola(POLA_DOM.jadra)
    };
    out.sprzecznosci = sprzecznosci({
      etap: out.etap, plec: i.plec, jadra: out.jadra,
      stageIsCurrent: out.etapOcena.current === true,
      wiekStartuLat: out.wiekStartuLat, wiekMenarcheLat: out.wiekMenarcheLat,
      wzrostPrzyMenarcheCm: out.wzrostPrzyMenarcheCm, wzrostCm: i.wzrostCm,
      wiekKostnyPrzyMenarcheLat: out.wiekKostnyPrzyMenarcheLat,
      gnrhaStatus: out.gnrhaStatus, gnrhaStartLat: out.gnrhaStartLat, gnrhaStopLat: out.gnrhaStopLat,
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
    kontekstWzrastania: kontekstWzrastania,
    dane: dane
  };
}(typeof window !== 'undefined' ? window : this));
