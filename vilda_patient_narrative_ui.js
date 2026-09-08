/* vilda_patient_narrative_ui.js — przycisk „Kopiuj opis pacjenta" w karcie „Podsumowanie
 * wyników" (etap 2 silnika opisu, decyzja wlasciciela 2026-09-07).
 *
 * Czytelny modul wg AGENTS.md §2. Sklada wejscie dla vilda_patient_narrative.js z tego,
 * co karta zaawansowana JUZ policzyla (window.advancedGrowthData +
 * window.advancedGrowthTrajectory), i kopiuje gotowy akapit do schowka.
 *
 * ZASADA: opis NIE jest pokazywany na stronie. Wlasciciel chce go testowac w prawdziwej
 * dokumentacji, a nie wydluzac karty podsumowania — przycisk kopiuje i tylko melduje,
 * ze skopiowal. Odmowa schowka NIE moze byc cicha (lekcja z audytu Notatek, R3):
 * lekarz musi wiedziec, ze wkleja pustke.
 *
 * SKAD DANE: te same zrodla, z ktorych czyta kolektor epikryzy (Te() w
 * vilda_epicrisis_ui.js) — targetHeight/targetStats dla MPH, boneAgeMonths, obiekty
 * metod prognozy z errorSdCm, predictionReliability dla etykiet wiarygodnosci. Dzieki
 * temu opis i epikryza opisuja te sama liczbe tym samym slowem.
 *
 * GDZIE PRZYCISK: nad „Raport PDF dla pacjenta", w tym samym wrapperze
 * (.current-summary-actions), ktory vilda_patient_report.js buduje od nowa przy kazdym
 * renderze karty. Dlatego przycisk jest DOKLADANY obserwatorem DOM, a nie wpisany raz:
 * kazdy render karty kasuje wrapper i stawia nowy.
 */
(function (w) {
  'use strict';

  var VERSION = '2';
  var ATTR = 'data-patient-narrative-copy-btn';
  var ETYKIETA = 'Kopiuj opis pacjenta';

  function num(x) {
    var v = typeof x === 'string' ? parseFloat(String(x).replace(',', '.')) : x;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function polePliku(id) {
    if (!w.document || typeof w.document.getElementById !== 'function') return null;
    var el = w.document.getElementById(id);
    return el ? num(el.value) : null;
  }

  // Etykiety metod, gdy karta nie dala wlasnych (predictionReliability obejmuje BP,
  // RWT i Reinehra; Khamis–Roche ma etykiete tylko w finalHeightPrediction.methods).
  var NAZWY_METOD = {
    bayleyPinneau: 'Bayley-Pinneau',
    rwt: 'RWT',
    reinehr: 'Reinehr/CDGP',
    khamis: 'Khamis–Roche'
  };

  // Prognozy wzrostu ostatecznego w kolejnosci karty. Blad metody = errorBoundHalfWidthCm,
  // czyli polszerokosc 90-proc. przedzialu — TA SAMA liczba, ktora karta C pokazuje jako
  // „±X cm" obok przycisku i z ktorej liczy wiarygodnosc metody. Epikryza drukuje
  // errorSdCm (1 SD, ma go tylko Bayley-Pinneau) — to rozjazd w aplikacji sprzed opisu,
  // zgloszony wlascicielowi 2026-09-07; opis idzie za karta, na ktora lekarz patrzy.
  function prognozy(d) {
    var lista = [];
    var metody = d && d.finalHeightPrediction && Array.isArray(d.finalHeightPrediction.methods)
      ? d.finalHeightPrediction.methods : null;
    var klucze = metody ? metody.map(function (m) { return m && m.key; })
      : ['bayleyPinneau', 'rwt'];
    var mapa = d && d.predictionReliability && d.predictionReliability.entryMap
      ? d.predictionReliability.entryMap : {};
    klucze.forEach(function (k, i) {
      if (!k) return;
      var obj = d ? d[k] : null;
      var zMetod = metody ? metody[i] : null;
      var cm = zMetod && num(zMetod.cm) != null ? num(zMetod.cm)
        : (obj && obj.available === true ? num(obj.predictedAdultHeightCm) : null);
      if (cm == null) return;
      var wiar = mapa[k] || null;
      lista.push({
        key: k,
        label: (zMetod && zMetod.label) || (wiar && wiar.methodLabel) || NAZWY_METOD[k] || k,
        cm: cm,
        errorHalfWidthCm: zMetod && num(zMetod.errorHalfWidthCm) != null
          ? num(zMetod.errorHalfWidthCm)
          : (obj ? num(obj.errorBoundHalfWidthCm) : null),
        reliabilityLabel: wiar && wiar.label ? wiar.label : null
      });
    });
    return lista;
  }

  // Przebieg prognozy w czasie: dla kazdej ZAPISANEJ wizyty z wiekiem kostnym liczymy
  // prognoze tak, jak wygladalaby na tamtej wizycie, i patrzymy, jak daleko odeszla od
  // dzisiejszej. Silnik to ten sam Bayley-Pinneau, ktory liczy karte — wyeksportowany,
  // zeby nie powstala druga kopia wzoru. Gdy ktoregokolwiek ogniwa brak, wychodzi null
  // i opis po prostu nie ma tego zdania.
  function dryfPrognozy(d, model) {
    var D = w.VildaPredictionDrift;
    // Pomocniki karty zaawansowanej sa eksportowane jako GLOBALE (i.advGrowth*), a nie na
    // obiekcie VildaAdvancedGrowth — tak jak advGrowthBuildTargetHeightForReport, ktory
    // app.js czyta w ten sam sposob. Wylapane e2e; testy jednostkowe tego nie widzialy,
    // bo podstawiaja wlasny silnik.
    var predict = w.advGrowthComputeBayleyPinneau;
    if (!D || typeof D.analyze !== 'function') return null;
    if (typeof predict !== 'function') return null;
    d = d || {};
    var pomiary = Array.isArray(d.measurements) ? d.measurements : [];
    var baM = num(d.boneAgeMonths);
    var h = model && model.metrics ? metrykaWzrostu(model) : null;
    var teraz = h && baM != null && baM > 0
      ? { ageMonths: h.ageMonths, height: h.value, boneAgeYears: baM / 12 }
      : null;
    try {
      return D.analyze({
        sex: (model && model.sex) || null,
        measurements: pomiary,
        current: teraz,
        predict: predict
      });
    } catch (e) {
      return null;
    }
  }

  // Ostatni punkt wzrostu z modelu karty — wiek i wartosc „dzisiejszego" pomiaru.
  function metrykaWzrostu(model) {
    for (var i = 0; i < model.metrics.length; i += 1) {
      if (model.metrics[i].metric === 'height') return model.metrics[i].last || null;
    }
    return null;
  }

  // Wejscie „extra" dla VildaPatientNarrative.compose — czysta funkcja na obiekcie
  // advancedGrowthData, zeby dalo sie ja sprawdzic bez przegladarki.
  function metryka(model, klucz) {
    if (!model || !model.metrics) return null;
    for (var i = 0; i < model.metrics.length; i += 1) {
      if (model.metrics[i].metric === klucz) return model.metrics[i];
    }
    return null;
  }

  // Dane urodzeniowe ta sama regula, co kolektor rekordu (GROWTH-BIRTH-REC): karta, jesli
  // niesie dane, w przeciwnym razie wartosc przeniesiona z rekordu. Dzieki temu opis mowi
  // to samo na index.html i na docpro.html — karta SGA istnieje tylko na tej drugiej.
  function stanUrodzeniowy() {
    var karta = null;
    try {
      var api = w.vildaSgaBirthPersistApi;
      if (api && typeof api.captureState === 'function') karta = api.captureState();
    } catch (e) { karta = null; }
    var niesie = karta && (String(karta.weeks || '').trim() || String(karta.weight || '').trim()
      || String(karta.length || '').trim() || String(karta.head || '').trim());
    if (niesie) return karta;
    var przeniesione = w.vildaBirthData;
    return przeniesione && typeof przeniesione === 'object' ? przeniesione : null;
  }

  // SGA bez catch-upu — progi liczy vilda_sga_catchup.js, SDS urodzeniowe ten sam silnik,
  // ktory liczy karte SGA. Bez ktoregokolwiek z nich zdanie po prostu nie powstaje.
  function sgaCatchUp(model) {
    var C = w.VildaSgaCatchUp;
    var S = w.VildaSgaBirth;
    if (!C || typeof C.ocen !== 'function' || !S || typeof S.compute !== 'function') return null;
    var karta = stanUrodzeniowy();
    if (!karta) return null;
    var h = metryka(model, 'height');
    var ost = h && h.last ? h.last : null;
    if (!ost) return null;
    var sds;
    try {
      var klucz = Array.isArray(karta.sourceKeys) && karta.sourceKeys.length
        ? karta.sourceKeys[0] : 'niklasson';
      sds = S.compute(klucz, {
        sex: karta.sex,
        weeks: karta.weeks,
        days: karta.days,
        weightG: karta.weight,
        lengthCm: karta.length,
        headCm: karta.head
      });
    } catch (e) { return null; }
    if (!sds || sds.error) return null;
    try {
      return C.ocen({
        masaSdsUr: sds.weightSds,
        dlugoscSdsUr: sds.lengthSds,
        tygodnie: karta.weeks,
        dni: karta.days,
        wiekMies: ost.ageMonths,
        hSds: ost.sd
      });
    } catch (e) { return null; }
  }

  function buildInput(d, model) {
    d = d || {};
    var mpSds = d.targetStats && num(d.targetStats.sd) != null ? num(d.targetStats.sd)
      : (model && model.context && num(model.context.mpSds) != null ? num(model.context.mpSds) : null);
    var baM = num(d.boneAgeMonths);
    var zgodnosc = d.finalHeightPrediction && d.finalHeightPrediction.agreementLabel
      ? d.finalHeightPrediction.agreementLabel
      : (d.predictionReliability && d.predictionReliability.agreementLabel) || null;
    return {
      motherHeight: num(d.motherHeight) != null ? num(d.motherHeight) : polePliku('advMotherHeight'),
      fatherHeight: num(d.fatherHeight) != null ? num(d.fatherHeight) : polePliku('advFatherHeight'),
      mph: num(d.targetHeight),
      mphSds: mpSds,
      boneAgeYears: baM != null && baM > 0 ? baM / 12 : null,
      // Wiek kostny i pomiar z formularza sa „teraz" — nie ma czego datowac.
      boneAgeAtAgeMonths: null,
      boneAgeMonthsAgo: null,
      lastMeasuredMonthsAgo: null,
      predictions: prognozy(d),
      predictionAgreement: zgodnosc || null,
      predictionDrift: dryfPrognozy(d, model),
      sgaCatchUp: sgaCatchUp(model)
    };
  }

  // Model trajektorii: ten sam, ktory renderuje karta zaawansowana. Przed odczytem jedno
  // przeliczenie — to samo, ktore robi kazda zmiana w formularzu. Zawsze, nie tylko przy
  // braku modelu: klik nie odbiera fokusu polu (patrz mousedown nizej), wiec bez tego
  // opis moglby powstac z wartosci sprzed ostatniego wpisu.
  function model() {
    if (typeof w.calculateGrowthAdvanced === 'function') {
      try { w.calculateGrowthAdvanced(); } catch (e) { /* karta nie policzyla — nizej null */ }
    }
    return w.advancedGrowthTrajectory || null;
  }

  // Gotowy opis albo powod, dla ktorego go nie ma. Nigdy nie rzuca.
  function describeCurrent() {
    var N = w.VildaPatientNarrative;
    if (!N || typeof N.compose !== 'function') {
      return { text: null, reason: 'Moduł opisu pacjenta nie został załadowany.' };
    }
    var m = model();
    if (!m) {
      return { text: null, reason: 'Brak analizy toru wzrastania — opis wymaga co najmniej dwóch pomiarów wzrostu.' };
    }
    var wynik = N.compose(m, buildInput(w.advancedGrowthData || {}, m));
    if (!wynik || !wynik.text) {
      return { text: null, reason: 'Za mało danych, żeby złożyć opis.' };
    }
    return { text: wynik.text, reason: null, sentences: wynik.sentences };
  }

  // ── Schowek ──────────────────────────────────────────────────────────────────
  //
  // Wzorzec z app.js (copyAdvancedGrowthHistoryText): Clipboard API, a przy odmowie
  // ukryte pole tekstowe + execCommand. Pole jest zdejmowane natychmiast — opis nie
  // zostaje w DOM.

  function kopiujPrzezPole(t) {
    var doc = w.document;
    var ta = doc.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    doc.body.appendChild(ta);
    var ok;
    try {
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      ok = doc.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  function kopiuj(t) {
    var nav = w.navigator;
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      return nav.clipboard.writeText(t).then(function () { return true; }, function () {
        return kopiujPrzezPole(t);
      });
    }
    return Promise.resolve(kopiujPrzezPole(t));
  }

  // ── Komunikat ────────────────────────────────────────────────────────────────

  function komunikat(t) {
    if (typeof w.patientReportShowToast === 'function') {
      try { w.patientReportShowToast(t); return; } catch (e) { /* wlasny toast nizej */ }
    }
    var doc = w.document;
    if (!doc || !doc.body) return;
    var stary = doc.getElementById('patientNarrativeToast');
    if (stary) stary.remove();
    var el = doc.createElement('div');
    el.id = 'patientNarrativeToast';
    el.setAttribute('role', 'status');
    el.textContent = t;
    el.style.cssText = 'position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);'
      + 'background:#00838d;color:#fff;padding:.65rem 1.25rem;border-radius:10px;'
      + 'font-size:.98rem;z-index:99999;box-shadow:0 10px 24px rgba(0,0,0,.18)';
    doc.body.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (e) { /* juz zdjety */ } }, 3200);
  }

  // Kliknięcie: zloz, skopiuj, zamelduj. Zwraca obietnice — dla testow.
  function copyCurrent() {
    var opis = describeCurrent();
    if (!opis.text) {
      komunikat(opis.reason);
      return Promise.resolve({ ok: false, reason: opis.reason });
    }
    return kopiuj(opis.text).then(function (ok) {
      if (ok) {
        komunikat('Opis pacjenta skopiowano do schowka (' + opis.sentences.length + ' zd.).');
        return { ok: true, text: opis.text };
      }
      komunikat('Nie udało się skopiować opisu — przeglądarka odmówiła dostępu do schowka.');
      return { ok: false, reason: 'clipboard' };
    });
  }

  // ── Przycisk w karcie ────────────────────────────────────────────────────────

  // JEDEN trwaly wezel przycisku, przenoszony miedzy wrapperami — nie nowy przy kazdym
  // dolozeniu. Od 1.0.852 wrapper akcji nie jest juz przebudowywany przy przeliczeniu karty
  // (naprawa w vilda_patient_report.js), wiec trwalosc wezla nie jest juz tym, co ratuje
  // klikniecie. Zostaje jako tanie zabezpieczenie na wypadek, gdyby wrapper zniknal i wrocil
  // (przelaczenie trybu PRO): przycisk wraca ten sam, bez gubienia stanu.
  var przycisk = null;

  function zbudujPrzycisk() {
    if (przycisk) return przycisk;
    var b = w.document.createElement('button');
    b.type = 'button';
    b.className = 'patient-report-summary-btn';
    b.setAttribute(ATTR, '');
    b.textContent = ETYKIETA;
    przycisk = b;
    return b;
  }

  // Obsluga klikniecia przez delegacje na dokumencie — jak przycisk raportu PDF obok.
  // Wrapper akcji jest budowany od nowa przy kazdym renderze karty, wiec sluchacz
  // zawieszony na konkretnym przycisku zylby krocej niz sam przycisk.
  function uruchomDelegacje() {
    var doc = w.document;
    if (!doc || typeof doc.addEventListener !== 'function') return;
    // Bez obejscia na mousedown: przycisk zachowuje sie jak kazdy inny (dostaje fokus).
    // Ginace pierwsze klikniecie naprawione u zrodla — wrapper akcji przezywa przeliczenie
    // karty, wiec mousedown i mouseup trafiaja w ten sam wezel.
    doc.addEventListener('click', function (ev) {
      var cel = ev && ev.target && typeof ev.target.closest === 'function'
        ? ev.target.closest('[' + ATTR + ']') : null;
      if (!cel) return;
      ev.preventDefault();
      copyCurrent();
    });
  }

  // Doklada przycisk do kazdego wrappera akcji, ktory go jeszcze nie ma — PRZED
  // przyciskiem raportu PDF. Wrapper istnieje tylko w trybie PRO/DocPro, wiec bramka
  // dostepu jest dziedziczona, nie powielana.
  function dolozPrzycisk() {
    var doc = w.document;
    if (!doc || typeof doc.querySelectorAll !== 'function') return 0;
    var n = 0;
    var wrappery = doc.querySelectorAll('.current-summary-actions');
    for (var i = 0; i < wrappery.length; i += 1) {
      var wr = wrappery[i];
      if (wr.querySelector('[' + ATTR + ']')) continue;
      var pdf = wr.querySelector('[data-patient-report-pdf-btn]');
      var b = zbudujPrzycisk();
      if (pdf) wr.insertBefore(b, pdf); else wr.appendChild(b);
      n += 1;
    }
    return n;
  }

  // Obserwator dziala SYNCHRONICZNIE w mikrozadaniu po mutacji — celowo bez rAF, zeby
  // przycisk wracal na miejsce w tej samej klatce, w ktorej wrapper sie pojawil.
  function uruchomObserwatora() {
    var doc = w.document;
    if (!doc || typeof w.MutationObserver !== 'function') return;
    var obs = new w.MutationObserver(function () { dolozPrzycisk(); });
    var start = function () {
      if (!doc.body) return;
      obs.observe(doc.body, { childList: true, subtree: true });
      dolozPrzycisk();
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  uruchomDelegacje();
  uruchomObserwatora();

  w.VildaPatientNarrativeUI = {
    version: VERSION,
    buildInput: buildInput,
    describeCurrent: describeCurrent,
    copyCurrent: copyCurrent,
    attach: dolozPrzycisk
  };
})(typeof window !== 'undefined' ? window : globalThis);
