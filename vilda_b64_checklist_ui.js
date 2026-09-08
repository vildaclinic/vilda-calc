/* vilda_b64_checklist_ui.js — przycisk „Kopiuj sciage B.64" w karcie SGA.
 *
 * Warstwa 2 nad vilda_b64_checklist.js. Zbiera dane rozsypane po stronie DocPro (karta
 * urodzeniowa, karta zaawansowana, formularz) i sklada z nich zestawienie osmiu kryteriow
 * kwalifikacji zalacznika B.64, ktore trafia do schowka — bez pokazywania na stronie,
 * tak samo jak opis pacjenta.
 *
 * DLACZEGO W KARCIE SGA: caly program B.64 dotyczy dzieci urodzonych jako SGA, a to w tej
 * karcie wpisuje sie dane urodzeniowe i liczy ich SDS. Przycisk stoi tam, gdzie lekarz
 * i tak jest, gdy o programie mysli. Karta istnieje wylacznie na docpro.html — i tam
 * wylacznie ladowany jest ten modul.
 *
 * ZASADA: sciaga to ZESTAWIENIE DANYCH, nie orzeczenie o kwalifikacji. Ton pilnuje
 * modul obliczeniowy; adapter ma tylko rzetelnie podac mu, co strona wie, i NIE
 * dopowiadac tego, czego nie wie (brak pomiaru zostaje brakiem, nie zerem).
 */
(function (w) {
  'use strict';

  var VERSION = '1';
  var ID_PRZYCISKU = 'copyB64ChecklistBtn';

  function num(x) {
    var v = typeof x === 'string' ? parseFloat(String(x).replace(',', '.')) : x;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function pole(id) {
    try {
      var el = w.document ? w.document.getElementById(id) : null;
      return el ? el.value : null;
    } catch (e) {
      return null;
    }
  }

  function metryka(model, klucz) {
    if (!model || !model.metrics) return null;
    for (var i = 0; i < model.metrics.length; i += 1) {
      if (model.metrics[i].metric === klucz) return model.metrics[i];
    }
    return null;
  }

  /* Czysta czesc: z surowych kawalkow buduje wejscie dla silnika sciagi.
   * Wszystko wstrzykiwane, zeby dalo sie to zmierzyc bez DOM.
   *
   *   model  — model trajektorii (metrics, velocity, source, sex)
   *   adv    — advancedGrowthData (boneAgeMonths)
   *   karta  — stan karty SGA (captureState)
   *   sds    — wynik VildaSgaBirth.compute dla wybranego zrodla (albo null)
   *   imie, plecFormularza — z formularza pacjenta
   */
  function zbierzZeZrodel(z) {
    var s = z && typeof z === 'object' ? z : {};
    var model = s.model || null;
    var h = metryka(model, 'height');
    var ost = h && h.last ? h.last : null;
    var v = model && model.velocity ? model.velocity : null;
    var karta = s.karta && typeof s.karta === 'object' ? s.karta : null;
    var sds = s.sds && typeof s.sds === 'object' ? s.sds : null;

    // Plec: formularz pacjenta ma pierwszenstwo przed modelem i przed karta urodzeniowa,
    // bo to jego wartosc opisuje pacjenta, a nie ustawienie pojedynczej karty.
    var plec = null;
    var kandydaci = [s.plecFormularza, model ? model.sex : null, karta ? karta.sex : null];
    for (var i = 0; i < kandydaci.length && !plec; i += 1) {
      var t = String(kandydaci[i] == null ? '' : kandydaci[i]).trim().toUpperCase();
      if (t === 'M' || t === 'MALE') plec = 'M';
      else if (t === 'F' || t === 'K' || t === 'FEMALE') plec = 'F';
    }

    var baM = num(s.adv ? s.adv.boneAgeMonths : null);

    var urodzenie = null;
    if (karta || sds) {
      urodzenie = {
        tygodnie: karta ? num(karta.weeks) : null,
        dni: karta ? num(karta.days) : null,
        masaSds: sds ? num(sds.weightSds) : null,
        dlugoscSds: sds ? num(sds.lengthSds) : null,
        zrodloNorm: sds && sds.sourceShortLabel ? sds.sourceShortLabel : null
      };
    }

    return {
      imie: s.imie && String(s.imie).trim() ? String(s.imie).trim() : null,
      plec: plec,
      wiekMies: ost ? num(ost.ageMonths) : null,
      wzrostCm: ost ? num(ost.value) : null,
      hSds: ost ? num(ost.sd) : null,
      centyl: ost ? num(ost.c) : null,
      zrodloSiatek: model && model.source ? model.source : null,
      wiekKostnyLat: baM != null && baM > 0 ? baM / 12 : null,
      tempoCmRok: v ? num(v.cmPerYear) : null,
      tempoOknoMies: v ? num(v.gapM) : null,
      urodzenie: urodzenie
    };
  }

  // Model trajektorii: to samo przeliczenie, ktore robi kazda zmiana w formularzu.
  function model() {
    if (typeof w.calculateGrowthAdvanced === 'function') {
      try { w.calculateGrowthAdvanced(); } catch (e) { /* karta nie policzyla — nizej null */ }
    }
    return w.advancedGrowthTrajectory || null;
  }

  // Stan karty urodzeniowej i SDS policzony tym samym silnikiem, ktory liczy karte.
  // Przy kilku zaznaczonych zrodlach bierzemy pierwsze — sciaga ma podac jedno,
  // a nie sugerowac, ze program dopuszcza porownywanie.
  function urodzeniowe() {
    var api = w.vildaSgaBirthPersistApi;
    var karta = null;
    try {
      if (api && typeof api.captureState === 'function') karta = api.captureState();
    } catch (e) {
      karta = null;
    }
    if (!karta) return { karta: null, sds: null };
    var silnik = w.VildaSgaBirth;
    var sds = null;
    try {
      if (silnik && typeof silnik.compute === 'function') {
        var klucz = Array.isArray(karta.sourceKeys) && karta.sourceKeys.length
          ? karta.sourceKeys[0] : 'niklasson';
        var wynik = silnik.compute(klucz, {
          sex: karta.sex,
          weeks: karta.weeks,
          days: karta.days,
          weightG: karta.weight,
          lengthCm: karta.length,
          headCm: karta.head
        });
        if (wynik && !wynik.error) sds = wynik;
      }
    } catch (e) {
      sds = null;
    }
    return { karta: karta, sds: sds };
  }

  function zbierz() {
    var u = urodzeniowe();
    return zbierzZeZrodel({
      model: model(),
      adv: w.advancedGrowthData || null,
      karta: u.karta,
      sds: u.sds,
      imie: pole('name') || pole('advName') || pole('fullName'),
      plecFormularza: pole('sex')
    });
  }

  // Gotowa sciaga albo powod, dla ktorego jej nie ma. Nigdy nie rzuca.
  function zloz() {
    var B = w.VildaB64Checklist;
    if (!B || typeof B.compose !== 'function') {
      return { text: null, reason: 'Moduł ściągi B.64 nie został załadowany.' };
    }
    var we;
    try {
      we = zbierz();
    } catch (e) {
      return { text: null, reason: 'Nie udało się odczytać danych ze strony.' };
    }
    var wynik;
    try {
      wynik = B.compose(we);
    } catch (e) {
      return { text: null, reason: 'Nie udało się złożyć zestawienia.' };
    }
    if (!wynik || !wynik.text) return { text: null, reason: 'Za mało danych na zestawienie.' };
    return { text: wynik.text, reason: null, podsumowanie: wynik.podsumowanie };
  }

  // ── Schowek (wzorzec z vilda_patient_narrative_ui.js) ────────────────────────

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

  function komunikat(t) {
    var doc = w.document;
    if (!doc || !doc.body) return;
    var stary = doc.getElementById('b64ChecklistToast');
    if (stary) stary.remove();
    var el = doc.createElement('div');
    el.id = 'b64ChecklistToast';
    el.setAttribute('role', 'status');
    el.textContent = t;
    el.style.cssText = 'position:fixed;bottom:1rem;left:50%;transform:translateX(-50%);'
      + 'background:#00838d;color:#fff;padding:.65rem 1.25rem;border-radius:10px;'
      + 'font-size:.98rem;z-index:99999;box-shadow:0 10px 24px rgba(0,0,0,.18)';
    doc.body.appendChild(el);
    setTimeout(function () { try { el.remove(); } catch (e) { /* juz zdjety */ } }, 3600);
  }

  function kopiujTeraz() {
    var wynik = zloz();
    if (!wynik.text) {
      komunikat(wynik.reason);
      return Promise.resolve({ ok: false, reason: wynik.reason });
    }
    return kopiuj(wynik.text).then(function (ok) {
      if (ok) {
        komunikat('Zestawienie kryteriów B.64 skopiowano do schowka.');
        return { ok: true, text: wynik.text };
      }
      komunikat('Nie udało się skopiować — przeglądarka odmówiła dostępu do schowka.');
      return { ok: false, reason: 'schowek' };
    });
  }

  // ── Przycisk ─────────────────────────────────────────────────────────────────

  function dolozPrzycisk() {
    var doc = w.document;
    if (!doc) return false;
    if (doc.getElementById(ID_PRZYCISKU)) return true;
    var reset = doc.getElementById('resetSgaBirth');
    var akcje = reset && reset.parentNode ? reset.parentNode : null;
    if (!akcje) return false;
    var b = doc.createElement('button');
    b.type = 'button';
    b.id = ID_PRZYCISKU;
    b.className = 'sga-birth-secondary-btn';
    b.textContent = 'Kopiuj ściągę B.64';
    b.setAttribute('data-tip', 'Zestawienie ośmiu kryteriów kwalifikacji programu lekowego '
      + 'B.64 na podstawie danych z karty. Nie jest orzeczeniem o kwalifikacji.');
    // Przycisk stoi po „Wyczyść dane urodzeniowe" — czynnosc pomocnicza, nie glowna.
    akcje.appendChild(b);
    return true;
  }

  function uruchomDelegacje() {
    var doc = w.document;
    if (!doc || doc.__vildaB64UiBound) return;
    doc.__vildaB64UiBound = true;
    doc.addEventListener('click', function (ev) {
      var t = ev && ev.target ? ev.target : null;
      if (!t || typeof t.closest !== 'function') return;
      var b = t.closest('#' + ID_PRZYCISKU);
      if (!b) return;
      ev.preventDefault();
      kopiujTeraz();
    });
  }

  function start() {
    try { dolozPrzycisk(); } catch (e) { /* karty nie ma — na tej stronie nie robimy nic */ }
    uruchomDelegacje();
  }

  if (w.document) {
    if (w.document.readyState === 'loading') {
      w.document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  }

  w.VildaB64ChecklistUI = {
    VERSION: VERSION,
    ID_PRZYCISKU: ID_PRZYCISKU,
    zbierzZeZrodel: zbierzZeZrodel,
    zbierz: zbierz,
    zloz: zloz,
    kopiujTeraz: kopiujTeraz,
    dolozPrzycisk: dolozPrzycisk
  };
}(typeof window !== 'undefined' ? window : this));
