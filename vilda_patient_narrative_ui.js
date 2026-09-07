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

  var VERSION = '1';
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

  // Wejscie „extra" dla VildaPatientNarrative.compose — czysta funkcja na obiekcie
  // advancedGrowthData, zeby dalo sie ja sprawdzic bez przegladarki.
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
      predictionAgreement: zgodnosc || null
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
  // renderze. Powod: klikniecie w przycisk tuz po wpisaniu masy zaczyna sie od blur pola,
  // blur przelicza karte, karta buduje wrapper od nowa, i mouseup trafia w inny wezel niz
  // mousedown — przegladarka nie sklada z tego zdarzenia click. Pierwsze klikniecie
  // lekarza ginelo (zmierzone e2e: Playwright klika, zadnego click na dokumencie).
  // Ten sam wezel pod kursorem przed i po renderze = klik dochodzi.
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
    var nasz = function (ev) {
      return ev && ev.target && typeof ev.target.closest === 'function'
        ? ev.target.closest('[' + ATTR + ']') : null;
    };
    // mousedown NIE zabiera fokusu polu formularza. Bez tego klikniecie tuz po wpisaniu
    // masy zaczynaloby sie od blur pola → przeliczenie → karta buduje wrapper od nowa
    // → mouseup trafia w inny wezel niz mousedown i przegladarka NIE sklada click.
    // Pierwsze klikniecie lekarza ginelo bez sladu (zmierzone e2e; przycisk „Raport
    // PDF" obok ma te sama wade). Klawiatura nie przechodzi przez mousedown — Enter
    // i spacja dzialaja jak dotad.
    doc.addEventListener('mousedown', function (ev) {
      if (nasz(ev)) ev.preventDefault();
    });
    doc.addEventListener('click', function (ev) {
      if (!nasz(ev)) return;
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

  // Obserwator dziala SYNCHRONICZNIE w mikrozadaniu po mutacji — celowo bez rAF.
  // Miedzy mousedown a mouseup jest kilkadziesiat milisekund; przycisk musi wrocic do
  // nowego wrappera, zanim przyjdzie mouseup (patrz komentarz przy `przycisk`).
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
