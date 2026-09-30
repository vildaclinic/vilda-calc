/* vilda_urodzeniowe_rozbieznosc.js — ostrzeżenie, gdy dwa zapisy danych urodzeniowych
 * tego samego pacjenta podają różne liczby (P-URODZENIOWE-ROZBIEZNOSC).
 *
 * PO CO TO JEST: dane urodzeniowe żyją w rekordzie w dwóch sekcjach, które NIE są ze sobą
 * synchronizowane (vilda_perinatal_source.js opisuje, kto czyta którą):
 *
 *   `birth`     — karta SGA w DocPro (stan karty, zapisywany do rekordu);
 *   `perinatal` — Karta Pacjenta, sekcja „Dane okołoporodowe".
 *
 * Karta SGA, opis pacjenta, ściąga B.64 i Blum ISS biorą liczby z karty SGA (albo z `birth`),
 * a generator epikryzy wypełnia się z „Danych okołoporodowych". Przykład z diagnozy
 * (dziewczynka, 38+0 tc, 48 cm, normy Niklasson): 2700 g w karcie SGA to SDS masy −1,21,
 * 2100 g w Karcie Pacjenta to −3,20 — jedna i ta sama pacjentka jest SGA w epikryzie i nie
 * jest SGA na ściądze B.64.
 *
 * DECYZJA WŁAŚCICIELA (2026-09-30): „Najpierw ostrzeżenie" — pokazać rozbieżność, NIE
 * zmieniać żadnych danych; makieta zaakceptowana 2026-09-30 (karta SGA, Karta Pacjenta,
 * krok „Dane urodzeniowe" generatora epikryzy; komputer i telefon).
 *
 * ZASADA: ten moduł niczego nie zapisuje i nie zmienia żadnej wartości. SDS liczy wyłącznie
 * produkcyjny silnik karty SGA (`window.VildaSgaBirth.compute`); gdy silnika na stronie nie
 * ma, wiersz SDS po prostu się nie pokazuje. Porównanie obejmuje tylko pola wypełnione po
 * OBU stronach — pole puste w jednym miejscu nie jest rozbieżnością.
 *
 * GDZIE SIĘ MONTUJE:
 *   - karta SGA (docpro.html) — sam, w kontenerze #sgaBirthRozbieznosc;
 *   - Karta Pacjenta — wywołaniem z vilda_auth_ui.js (`kartaPacjenta`);
 *   - generator epikryzy — wywołaniem z vilda_epicrisis_ui.js (`epikryza`).
 * Wygląd: vilda_urodzeniowe_rozbieznosc.css (style wyłącznie w klasach).
 */
(function (w) {
  'use strict';

  var VERSION = '1';
  var NBSP = '\u00a0';
  var MINUS = '\u2212';

  // ── Czyste funkcje: odczyt, porównanie, zapis liczb ─────────────────────────

  function tekst(x) {
    return x == null ? '' : String(x).trim();
  }

  // Liczba z pola formularza: przecinek albo kropka dziesiętna; puste i śmieci → null.
  function liczba(x) {
    var t = tekst(x).replace(',', '.');
    if (!t) return null;
    var n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  /* Sprowadza stan karty SGA, sekcję `birth`, sekcję `perinatal` w kształcie karty
   * (VildaPerinatalSource.naKarte) albo pola formularza do jednego kształtu liczb.
   * Dni bez tygodni nie znaczą nic; tygodnie bez dni to pełny tydzień (+0). */
  function normalizuj(s) {
    var z = s && typeof s === 'object' ? s : {};
    var weeks = liczba(z.weeks);
    var days = liczba(z.days);
    return {
      weeks: weeks,
      days: weeks == null ? null : (days == null ? 0 : days),
      weight: liczba(z.weight),
      length: liczba(z.length),
      head: liczba(z.head)
    };
  }

  function niesieDane(s) {
    var n = normalizuj(s);
    return n.weeks != null || n.weight != null || n.length != null || n.head != null;
  }

  var POLA = [
    { klucz: 'wiek', nazwa: 'Wiek ciążowy', zgodne: 'wiek ciążowy', rodzaj: 'm' },
    { klucz: 'weight', nazwa: 'Masa urodzeniowa', zgodne: 'masa', rodzaj: 'f' },
    { klucz: 'length', nazwa: 'Długość urodzeniowa', zgodne: 'długość', rodzaj: 'f' },
    { klucz: 'head', nazwa: 'Obwód głowy', zgodne: 'obwód głowy', rodzaj: 'm' }
  ];

  function wartosc(n, klucz) {
    if (klucz === 'wiek') return n.weeks == null ? null : { weeks: n.weeks, days: n.days };
    return n[klucz];
  }

  // Równość w rozdzielczości, w jakiej pola są wpisywane: masa w gramach, wymiary co 0,1 cm,
  // wiek ciążowy w dniach.
  function rowne(klucz, a, b) {
    if (klucz === 'wiek') return a.weeks * 7 + a.days === b.weeks * 7 + b.days;
    if (klucz === 'weight') return Math.round(a) === Math.round(b);
    return Math.round(a * 10) === Math.round(b * 10);
  }

  /* Porównanie dwóch zapisów. Zwraca pola różne i zgodne; pole puste po którejkolwiek
   * stronie nie trafia do żadnej listy. */
  function porownaj(sa, sb) {
    var a = normalizuj(sa);
    var b = normalizuj(sb);
    var rozne = [];
    var zgodne = [];
    POLA.forEach(function (p) {
      var va = wartosc(a, p.klucz);
      var vb = wartosc(b, p.klucz);
      if (va == null || vb == null) return;
      (rowne(p.klucz, va, vb) ? zgodne : rozne).push({ pole: p, a: va, b: vb });
    });
    return { rozne: rozne, zgodne: zgodne };
  }

  function formatLiczby(n) {
    var r = Math.round(n * 10) / 10;
    return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',');
  }

  function formatWartosci(klucz, v) {
    if (klucz === 'wiek') return v.weeks + '+' + v.days + NBSP + 'tc';
    if (klucz === 'weight') return String(Math.round(v)) + NBSP + 'g';
    return formatLiczby(v) + NBSP + 'cm';
  }

  function formatSds(x) {
    var t = Math.abs(x).toFixed(2).replace('.', ',');
    return (x < 0 && t !== '0,00' ? MINUS : '') + t;
  }

  // 'female' / 'male' / null — kształt, który rozumie silnik karty SGA.
  function plecNorm(x) {
    var t = tekst(x).toUpperCase();
    if (t === 'F' || t === 'K' || t === 'FEMALE') return 'female';
    if (t === 'M' || t === 'MALE') return 'male';
    return null;
  }

  // Krótka nazwa norm do wiersza SDS: „Niklasson / Albertsson-Wikland" → „Niklasson".
  function etykietaNorm(silnik, klucz) {
    var t;
    try {
      t = silnik && typeof silnik.sourceShortLabel === 'function' ? silnik.sourceShortLabel(klucz) : '';
    } catch (e) {
      t = '';
    }
    return tekst(t || klucz).split(' / ')[0];
  }

  var MIARY_SDS = [
    { klucz: 'weight', pole: 'weightSds', nazwa: 'SDS masy' },
    { klucz: 'length', pole: 'lengthSds', nazwa: 'SDS długości' },
    { klucz: 'head', pole: 'headSds', nazwa: 'SDS obwodu głowy' }
  ];

  /* Wiersze SDS: ten sam silnik, te same normy i ta sama płeć po obu stronach, więc różnica
   * w wierszu wynika wyłącznie z różnicy danych. Pokazujemy tylko miary obecne po obu
   * stronach i tylko wtedy, gdy SDS po zaokrągleniu się różni. */
  function wierszeSds(sa, sb, plec, klucz, silnik) {
    var S = silnik || w.VildaSgaBirth;
    var p = plecNorm(plec);
    if (!S || typeof S.compute !== 'function' || !p) return [];
    var a = normalizuj(sa);
    var b = normalizuj(sb);
    var norma = klucz && Array.isArray(S.SOURCE_KEYS) && S.SOURCE_KEYS.indexOf(klucz) !== -1 ? klucz : 'niklasson';
    var wejscie = function (n) {
      return { sex: p, weeks: n.weeks, days: n.days, weightG: n.weight, lengthCm: n.length, headCm: n.head };
    };
    var ra;
    var rb;
    try {
      ra = S.compute(norma, wejscie(a));
      rb = S.compute(norma, wejscie(b));
    } catch (e) {
      return [];
    }
    if (!ra || ra.error || !rb || rb.error) return [];
    var nazwaNorm = etykietaNorm(S, norma);
    var out = [];
    MIARY_SDS.forEach(function (m) {
      if (a[m.klucz] == null || b[m.klucz] == null) return;
      var x = ra[m.pole];
      var y = rb[m.pole];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (formatSds(x) === formatSds(y)) return;
      out.push({ nazwa: m.nazwa + ' · ' + nazwaNorm, a: formatSds(x), b: formatSds(y) });
    });
    return out;
  }

  function wylicz(lista) {
    if (lista.length <= 1) return lista.join('');
    return lista.slice(0, -1).join(', ') + ' i ' + lista[lista.length - 1];
  }

  function zWielkiej(t) {
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }

  function zdanieZgodnych(zgodne) {
    if (!zgodne.length) return '';
    var czesci = zgodne.map(function (z) {
      return z.pole.zgodne + ' (' + formatWartosci(z.pole.klucz, z.a) + ')';
    });
    var orzeczenie = zgodne.length > 1 ? 'są zgodne' : (zgodne[0].pole.rodzaj === 'f' ? 'jest zgodna' : 'jest zgodny');
    return zWielkiej(wylicz(czesci)) + ' ' + orzeczenie + '.';
  }

  var TYTUL_JEDNEGO = { wiek: 'inny wiek ciążowy', weight: 'inną masę urodzeniową', length: 'inną długość urodzeniową', head: 'inny obwód głowy' };
  var PLAKIETKA_JEDNEGO = {
    wiek: 'Inny wiek ciążowy niż w karcie SGA',
    weight: 'Inna masa niż w karcie SGA',
    length: 'Inna długość niż w karcie SGA',
    head: 'Inny obwód głowy niż w karcie SGA'
  };

  var KOLUMNY = {
    sga: ['Pole', 'Ta karta SGA', 'Karta Pacjenta'],
    kartaPacjenta: ['Pole', 'Ta sekcja', 'Karta SGA'],
    epikryza: ['Pole', 'Ten formularz', 'Karta SGA']
  };

  /* Model ostrzeżenia — czysta funkcja, cała treść w jednym miejscu.
   *   wariant: 'sga' | 'kartaPacjenta' | 'epikryza'
   *   ten:     dane miejsca, w którym stoi ostrzeżenie (druga kolumna)
   *   drugi:   dane z drugiego zapisu (trzecia kolumna)
   * Zwraca null, gdy nie ma rozbieżności. */
  function model(o) {
    var op = o && typeof o === 'object' ? o : {};
    var wariant = KOLUMNY[op.wariant] ? op.wariant : 'sga';
    var p = porownaj(op.ten, op.drugi);
    if (!p.rozne.length) return null;
    var jeden = p.rozne.length === 1 ? p.rozne[0].pole : null;
    var wartosciTen = wylicz(p.rozne.map(function (r) { return formatWartosci(r.pole.klucz, r.a); }));
    var wartosciDrugi = wylicz(p.rozne.map(function (r) { return formatWartosci(r.pole.klucz, r.b); }));
    var zgodne = zdanieZgodnych(p.zgodne);
    var czyje = jeden ? jeden.nazwa : 'Dane urodzeniowe';
    var orzeczenie = jeden ? 'nie zgadza się' : 'nie zgadzają się';

    var m = {
      wariant: wariant,
      kolumny: KOLUMNY[wariant].slice(),
      wiersze: p.rozne.map(function (r) {
        return { nazwa: r.pole.nazwa, a: formatWartosci(r.pole.klucz, r.a), b: formatWartosci(r.pole.klucz, r.b) };
      }).concat(wierszeSds(op.ten, op.drugi, op.plec, op.klucz, op.silnik)),
      pola: p.rozne.map(function (r) {
        return { klucz: r.pole.klucz, drugi: formatWartosci(r.pole.klucz, r.b) };
      }),
      plakietka: jeden ? PLAKIETKA_JEDNEGO[jeden.klucz] : 'Inne dane niż w karcie SGA'
    };

    if (wariant === 'sga') {
      m.tytul = 'Dane urodzeniowe różnią się między kartami';
      m.wstep = czyje + ' w tej karcie ' + orzeczenie + ' z sekcją „Dane okołoporodowe” w Karcie Pacjenta.'
        + (zgodne ? ' ' + zgodne : '');
      m.skutek = 'Wynik tej karty, opis pacjenta, ściąga B.64 i Blum ISS liczą z ' + wartosciTen
        + '. Epikryza bierze ' + wartosciDrugi + ' z Karty Pacjenta.';
      m.uwaga = 'Nic nie zostało zmienione. Sprawdź dokumentację urodzeniową i popraw błędną wartość w jednym z miejsc.';
      m.podpis = 'Karta Pacjenta';
    } else if (wariant === 'kartaPacjenta') {
      m.tytul = 'Karta SGA ma ' + (jeden ? TYTUL_JEDNEGO[jeden.klucz] : 'inne dane urodzeniowe');
      m.wstep = '';
      m.skutek = (zgodne ? zgodne + ' ' : '') + 'Karta SGA, opis pacjenta, ściąga B.64 i Blum ISS liczą z '
        + wartosciDrugi + '. Epikryza bierze ' + wartosciTen + ' z tej sekcji.';
      m.uwaga = 'Nic nie zostało zmienione. Popraw błędną wartość tutaj albo w karcie SGA i zapisz pacjenta.';
      m.podpis = 'Karta SGA';
    } else {
      m.tytul = 'Karta SGA ma ' + (jeden ? TYTUL_JEDNEGO[jeden.klucz] : 'inne dane urodzeniowe');
      m.wstep = czyje + ' w tym formularzu ' + orzeczenie + ' z kartą SGA.' + (zgodne ? ' ' + zgodne : '');
      m.skutek = 'Epikryza użyje wartości z tego formularza. Karta SGA, opis pacjenta, ściąga B.64 i Blum ISS liczą z '
        + wartosciDrugi + '.';
      m.uwaga = 'Nic nie zostało zmienione. Sprawdź dokumentację urodzeniową, zanim wygenerujesz tekst.';
      m.podpis = 'Karta SGA';
    }
    return m;
  }

  // ── DOM: budowa ostrzeżenia (bez stylów inline — wygląd w arkuszu) ───────────

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // Glif „triangle-alert" z zestawu Lucide, jak w reszcie aplikacji.
  function ikona(doc, klasa) {
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', klasa);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'].forEach(function (d) {
      var p = doc.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  function el(doc, tag, klasa, tresc) {
    var e = doc.createElement(tag);
    if (klasa) e.className = klasa;
    if (tresc != null) e.textContent = tresc;
    return e;
  }

  var licznik = 0;

  /* Buduje sekcję ostrzeżenia z modelu. `naPrzycisk` (opcjonalny) dodaje przycisk
   * „Otwórz Kartę Pacjenta" — sama nawigacja, bez zapisu. */
  function zbuduj(doc, m, opcje) {
    var op = opcje || {};
    licznik += 1;
    var id = 'vilda-ur-tytul-' + licznik;
    var s = el(doc, 'section', 'vilda-ur');
    s.setAttribute('aria-labelledby', id);
    s.setAttribute('data-vilda-ur', m.wariant);

    var nag = el(doc, 'div', 'vilda-ur__naglowek');
    nag.appendChild(ikona(doc, 'vilda-ur__ikona'));
    var h = el(doc, 'h3', 'vilda-ur__tytul', m.tytul);
    h.id = id;
    nag.appendChild(h);
    s.appendChild(nag);

    if (m.wstep) s.appendChild(el(doc, 'p', 'vilda-ur__tekst', m.wstep));

    var tab = el(doc, 'div', 'vilda-ur__tabela');
    tab.setAttribute('role', 'table');
    var glowa = el(doc, 'div', 'vilda-ur__wiersz vilda-ur__wiersz--glowa');
    glowa.setAttribute('role', 'row');
    m.kolumny.forEach(function (k) {
      var c = el(doc, 'span', 'vilda-ur__kom', k);
      c.setAttribute('role', 'columnheader');
      glowa.appendChild(c);
    });
    tab.appendChild(glowa);
    m.wiersze.forEach(function (r) {
      var w0 = el(doc, 'div', 'vilda-ur__wiersz');
      w0.setAttribute('role', 'row');
      var c0 = el(doc, 'span', 'vilda-ur__kom vilda-ur__kom--nazwa', r.nazwa);
      c0.setAttribute('role', 'rowheader');
      var c1 = el(doc, 'span', 'vilda-ur__kom vilda-ur__kom--liczba', r.a);
      c1.setAttribute('role', 'cell');
      var c2 = el(doc, 'span', 'vilda-ur__kom vilda-ur__kom--liczba', r.b);
      c2.setAttribute('role', 'cell');
      w0.appendChild(c0);
      w0.appendChild(c1);
      w0.appendChild(c2);
      tab.appendChild(w0);
    });
    s.appendChild(tab);

    s.appendChild(el(doc, 'p', 'vilda-ur__tekst', m.skutek));

    var stopka = el(doc, 'div', 'vilda-ur__stopka');
    stopka.appendChild(el(doc, 'p', 'vilda-ur__uwaga', m.uwaga));
    if (typeof op.naPrzycisk === 'function') {
      var b = el(doc, 'button', 'vilda-ur__przycisk', 'Otwórz Kartę Pacjenta');
      b.type = 'button';
      b.addEventListener('click', op.naPrzycisk);
      stopka.appendChild(b);
    }
    s.appendChild(stopka);
    return s;
  }

  /* Oznaczenie rozbieżnych pól: klasa na polu i podpis pod nim („Karta SGA: 2700 g").
   * `poCzym(klucz)` (opcjonalne) wskazuje element, za którym stanie podpis; domyślnie
   * samo pole, a dla wieku ciążowego pole dni. Zwraca funkcję, która wszystko zdejmuje. */
  function oznaczPola(doc, pola, m, poCzym) {
    var zdjac = [];
    (m ? m.pola : []).forEach(function (r) {
      var lista = r.klucz === 'wiek' ? [pola.weeks, pola.days] : [pola[r.klucz]];
      lista.forEach(function (p) {
        if (!p || !p.classList) return;
        p.classList.add('vilda-ur-pole');
        zdjac.push(function () { p.classList.remove('vilda-ur-pole'); });
      });
      var za = (typeof poCzym === 'function' ? poCzym(r.klucz) : null)
        || (r.klucz === 'wiek' ? (pola.days || pola.weeks) : pola[r.klucz]);
      if (!za || !za.parentNode) return;
      var pod = el(doc, 'span', 'vilda-ur-podpis');
      pod.appendChild(ikona(doc, 'vilda-ur-podpis__ikona'));
      pod.appendChild(doc.createTextNode(m.podpis + ': ' + r.drugi));
      za.parentNode.insertBefore(pod, za.nextSibling);
      zdjac.push(function () { if (pod.parentNode) pod.parentNode.removeChild(pod); });
    });
    return function () { zdjac.forEach(function (f) { f(); }); };
  }

  function odcisk(m) {
    return m ? JSON.stringify([m.tytul, m.wstep, m.skutek, m.wiersze, m.pola]) : '';
  }

  // ── Źródła danych ────────────────────────────────────────────────────────────

  function stanKarty() {
    try {
      var api = w.vildaSgaBirthPersistApi;
      var s = api && typeof api.captureState === 'function' ? api.captureState() : null;
      return s && niesieDane(s) ? s : null;
    } catch (e) {
      return null;
    }
  }

  function biezacyPacjent() {
    try {
      return (w.sessionStorage && w.sessionStorage.getItem('vildaCurrentPatientId')) || w._vildaCurrentPatientId || null;
    } catch (e) {
      return w._vildaCurrentPatientId || null;
    }
  }

  // Dane „karty SGA" bieżącego pacjenta: żywa karta (docpro), a bez niej sekcja `birth`.
  function zrodloSga() {
    var karta = stanKarty();
    if (karta) return karta;
    var rek = w.vildaBirthData;
    return rek && typeof rek === 'object' && niesieDane(rek) ? rek : null;
  }

  function plecStrony() {
    try {
      var e = w.document ? w.document.getElementById('sex') : null;
      return e ? plecNorm(e.value) : null;
    } catch (e) {
      return null;
    }
  }

  function kluczNorm(s) {
    return s && Array.isArray(s.sourceKeys) && s.sourceKeys.length ? s.sourceKeys[0] : 'niklasson';
  }

  function wartosciPol(pola) {
    var v = function (p) { return p ? p.value : ''; };
    return { weeks: v(pola.weeks), days: v(pola.days), weight: v(pola.weight), length: v(pola.length), head: v(pola.head) };
  }

  /* Wspólny cykl montażu: przelicza model, a zmienia DOM tylko przy zmianie treści, żeby
   * odświeżanie nie przestawiało fokusu ani przewinięcia. */
  function montaz(o) {
    var doc = o.doc;
    var stary = '';
    var sekcja = null;
    var zdejmijPola = null;
    var plakietka = null;
    return function odswiez() {
      var m;
      try {
        m = o.dane();
      } catch (e) {
        m = null;
      }
      var nowy = odcisk(m);
      if (nowy === stary) return m;
      stary = nowy;
      if (zdejmijPola) { zdejmijPola(); zdejmijPola = null; }
      if (sekcja && sekcja.parentNode) sekcja.parentNode.removeChild(sekcja);
      sekcja = null;
      if (plakietka && plakietka.parentNode) plakietka.parentNode.removeChild(plakietka);
      plakietka = null;
      if (o.poZmianie) o.poZmianie(m);
      if (!m) return null;
      sekcja = zbuduj(doc, m, { naPrzycisk: o.naPrzycisk ? o.naPrzycisk() : null });
      o.wstaw(sekcja);
      if (o.pola) zdejmijPola = oznaczPola(doc, o.pola, m, o.podpisPo);
      if (o.naglowek) {
        plakietka = el(doc, 'span', 'vilda-ur-plakietka');
        var kropka = el(doc, 'span', 'vilda-ur-plakietka__kropka', '●');
        kropka.setAttribute('aria-hidden', 'true');
        plakietka.appendChild(kropka);
        plakietka.appendChild(doc.createTextNode(' ' + m.plakietka));
        o.naglowek(plakietka);
      }
      return m;
    };
  }

  // ── 1. Karta SGA (docpro.html) ───────────────────────────────────────────────

  function otworzKartePacjenta() {
    var id = biezacyPacjent();
    var A = w.VildaAuthUI;
    if (!id || !A || typeof A.showPatientEditScreen !== 'function') return null;
    return function () {
      try { A.showPatientEditScreen(id); } catch (e) { /* ekran niedostępny — nic nie robimy */ }
    };
  }

  function kartaSga() {
    var doc = w.document;
    var miejsce = doc ? doc.getElementById('sgaBirthRozbieznosc') : null;
    var karta = doc ? doc.getElementById('sgaBirthCard') : null;
    if (!miejsce || !karta || miejsce.__vildaUr) return null;
    miejsce.__vildaUr = true;
    var id = function (x) { return doc.getElementById(x); };
    var pola = { weeks: id('sgaBirthWeeks'), days: id('sgaBirthDays'), weight: id('sgaBirthWeight'), length: id('sgaBirthLength'), head: id('sgaBirthHead') };
    var odswiez = montaz({
      doc: doc,
      pola: pola,
      dane: function () {
        var stan = stanKarty();
        var P = w.VildaPerinatalSource;
        var peri = P && typeof P.zKartyPacjenta === 'function' ? P.zKartyPacjenta() : null;
        if (!stan || !peri) return null;
        return model({
          wariant: 'sga', ten: stan, drugi: peri,
          plec: plecNorm(stan.sex) || plecStrony(), klucz: kluczNorm(stan)
        });
      },
      naPrzycisk: otworzKartePacjenta,
      wstaw: function (s) { miejsce.appendChild(s); },
      poZmianie: function (m) { miejsce.hidden = !m; }
    });

    var pozniej = function () {
      [0, 400, 1500].forEach(function (t) { w.setTimeout(odswiez, t); });
    };
    karta.addEventListener('input', odswiez);
    karta.addEventListener('change', odswiez);
    doc.addEventListener('vilda:patient-loaded', pozniej);
    doc.addEventListener('vilda:zrodlo-pacjenta-zmienione', pozniej);
    if (typeof w.addEventListener === 'function') w.addEventListener('vilda:user-state-cleared', pozniej);
    var przycisk = id('toggleSgaBirth');
    if (przycisk) przycisk.addEventListener('click', pozniej);
    // Karta odtwarza wartości programowo (restoreState, prefill z sejfu) — bez zdarzeń
    // `input`. Dopóki karta jest widoczna, sprawdzamy ją co 1,5 s; odcisk modelu sprawia,
    // że niezmieniony stan niczego w DOM nie rusza.
    w.setInterval(function () {
      if (doc.visibilityState === 'hidden' || !karta.getClientRects().length) return;
      odswiez();
    }, 1500);
    pozniej();
    return odswiez;
  }

  // ── 2. Karta Pacjenta (wywołanie z vilda_auth_ui.js) ────────────────────────

  /* o = { karta, naglowek, cialo, pola: {weeks, days, weight, length, head}, birth, plec, patientId }
   *   karta    — element sekcji „Dane okołoporodowe" (.ve-card.ve-coll)
   *   naglowek — przycisk zwijania sekcji
   *   cialo    — zawartość sekcji
   *   birth    — sekcja `birth` edytowanego rekordu
   *   plec     — pole płci w Karcie Pacjenta (M/K) */
  function kartaPacjenta(o) {
    if (!o || !o.karta || !o.cialo || !o.pola) return null;
    var doc = o.karta.ownerDocument || w.document;
    // Żywa karta SGA liczy się tylko dla pacjenta, który jest teraz na stronie.
    var zywa = o.patientId && o.patientId === biezacyPacjent() ? stanKarty() : null;
    var drugi = zywa || (o.birth && typeof o.birth === 'object' && niesieDane(o.birth) ? o.birth : null);
    if (!drugi) return null;
    var otwarta = false;
    var odswiez = montaz({
      doc: doc,
      pola: o.pola,
      dane: function () {
        return model({
          wariant: 'kartaPacjenta', ten: wartosciPol(o.pola), drugi: drugi,
          plec: plecNorm(o.plec ? o.plec.value : null) || plecNorm(drugi.sex), klucz: kluczNorm(drugi)
        });
      },
      wstaw: function (s) { o.cialo.insertBefore(s, o.cialo.firstChild); },
      // Wiek ciążowy stoi tu w parze pól (tygodnie | dni) — podpis pod całą parą.
      podpisPo: function (klucz) {
        var para = klucz === 'wiek' && o.pola.weeks && o.pola.weeks.parentNode ? o.pola.weeks.parentNode.parentNode : null;
        return para && o.pola.days && para.contains(o.pola.days) ? para : null;
      },
      naglowek: function (p) {
        var ost = o.naglowek ? o.naglowek.lastElementChild : null;
        if (o.naglowek) o.naglowek.insertBefore(p, ost);
      },
      poZmianie: function (m) {
        // Przy otwarciu Karty z rozbieżnością sekcja rozwija się sama — ostrzeżenie ma być
        // widać bez szukania. Później lekarz zwija ją jak zwykle.
        if (m && !otwarta) {
          otwarta = true;
          o.karta.classList.add('is-open');
        }
      }
    });
    ['weeks', 'days', 'weight', 'length', 'head'].forEach(function (k) {
      if (o.pola[k]) o.pola[k].addEventListener('input', odswiez);
    });
    if (o.plec) o.plec.addEventListener('change', odswiez);
    odswiez();
    return odswiez;
  }

  // ── 3. Generator epikryzy (wywołanie z vilda_epicrisis_ui.js) ───────────────

  /* o = { sekcja, zrodla }
   *   sekcja — blok „Dane urodzeniowe" kroku generatora (pola #epi-gest-weeks … )
   *   zrodla — blok wyboru norm (radio name="sga-source") */
  function epikryza(o) {
    if (!o || !o.sekcja) return null;
    var doc = o.sekcja.ownerDocument || w.document;
    var drugi = zrodloSga();
    if (!drugi) return null;
    var q = function (sel) { return o.sekcja.querySelector(sel); };
    var pola = { weeks: q('#epi-gest-weeks'), days: q('#epi-gest-days'), weight: q('#epi-birth-weight'), length: q('#epi-birth-length'), head: null };
    var norma = function () {
      var r = o.zrodla ? o.zrodla.querySelector('input[name="sga-source"]:checked') : null;
      return r && r.value ? r.value : kluczNorm(drugi);
    };
    var odswiez = montaz({
      doc: doc,
      pola: pola,
      dane: function () {
        return model({
          wariant: 'epikryza', ten: wartosciPol(pola), drugi: drugi,
          plec: plecNorm(drugi.sex) || plecStrony(), klucz: norma()
        });
      },
      wstaw: function (s) {
        var tytul = o.sekcja.firstElementChild;
        o.sekcja.insertBefore(s, tytul ? tytul.nextSibling : o.sekcja.firstChild);
      }
    });
    ['weeks', 'days', 'weight', 'length'].forEach(function (k) {
      if (pola[k]) pola[k].addEventListener('input', odswiez);
    });
    if (o.zrodla) o.zrodla.addEventListener('change', odswiez);
    odswiez();
    return odswiez;
  }

  // ── Start ────────────────────────────────────────────────────────────────────

  function start() {
    try { kartaSga(); } catch (e) {
      if (typeof w.vildaLogSwallowedCatch === 'function') w.vildaLogSwallowedCatch('vilda_urodzeniowe_rozbieznosc.js', e, { context: 'karta-sga' });
    }
  }

  if (w.document) {
    if (w.document.readyState === 'loading') w.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  w.VildaUrodzeniowaRozbieznosc = {
    VERSION: VERSION,
    normalizuj: normalizuj,
    porownaj: porownaj,
    wierszeSds: wierszeSds,
    model: model,
    formatSds: formatSds,
    zbuduj: zbuduj,
    kartaSga: kartaSga,
    kartaPacjenta: kartaPacjenta,
    epikryza: epikryza
  };
}(typeof window !== 'undefined' ? window : this));
