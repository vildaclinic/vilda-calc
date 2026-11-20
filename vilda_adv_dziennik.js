/* vilda_adv_dziennik.js — pomiary z dziennika leczenia w „Poprzednich pomiarach” karty
 * „Zaawansowane obliczenia wzrostowe” (strona główna). P-OTYLOSC-STRONA, temat D projektu
 * „Leczenie otyłości — wpisy poza wizytą”; makieta zaakceptowana przez właściciela 2026-11-20:
 * pomiary od pacjenta oznaczone w istniejącej liście, bez osobnej tabeli.
 *
 * CO ROBI
 *   • Bierze pomiary z dziennika leczenia pacjenta wczytanego na stronie
 *     (VildaDziennikOtylosci.pomiaryStrony — wizyta wygrywa w tym samym miesiącu życia, jak w Karcie
 *     pacjenta) i wstawia je między wiersze #advMeasurements jako bloki TYLKO DO ODCZYTU, w kolejności
 *     wieku, z odznaką „pomiar od pacjenta” (wpis z gabinetu poza wizytą — „wpis leczenia z gabinetu”).
 *   • Blok ma ten sam układ co wiersz (Wiek (lata), Wiek (miesiące), Wzrost / Waga, Wiek kostny),
 *     ale wartości są tekstem, nie polami <input>, i nie ma przycisku usuwania. Wpis poprawia się
 *     w Karcie pacjenta („Wpisy leczenia”).
 *   • Odtworzenie dawnej wizyty (w liście jest późniejszy wiersz) nie pokazuje wpisów po jej wieku.
 *   • Po zmianie dziennika (wczytanie pacjenta, zapis wpisu, synchronizacja) bloki rysują się od nowa,
 *     a karta zaawansowana liczy analizę trajektorii z nowymi pomiarami (gdy jest na ekranie).
 *
 * CZEGO NIE ROBI
 *   • Blok NIE jest .measure-row: collectAdvancedMeasurements(), obliczenia wierszy, autozapis
 *     (vilda_persist_runtime.js) i zapis wizyty go nie widzą. Moduł nie zmienia żadnego wiersza ani pola.
 *   • Nagłówek („6 pomiarów”, „3 od pacjenta”) i zwijanie listy prowadzi vilda_adv_history_collapse.js —
 *     liczy bloki, ale ich nie tworzy; zwinięta lista chowa je regułą CSS kontenera.
 *
 * BEZPIECZNIKI
 *   • Brak #advMeasurements (inna strona) albo modułu dziennika — moduł nic nie robi.
 *   • Przebudowa tylko przy zmianie treści albo kolejności (podpis), bo obserwator listy reaguje także
 *     na wstawienie bloku — bez podpisu byłaby pętla.
 */
(function (w) {
  'use strict';
  if (!w || !w.document) return;
  if (w.VildaAdvDziennik && w.VildaAdvDziennik.__init) return;

  var doc = w.document;
  var KLASA = 'adv-dz-row';
  var NBSP = ' ';
  var podpis = '';

  function zglos(krok, blad) {
    try {
      if (typeof w.vildaLogSwallowedCatch === 'function') w.vildaLogSwallowedCatch('vilda_adv_dziennik.js', blad, { step: krok });
    } catch (e) { /* logowanie nie może wywrócić karty */ }
  }

  function el(id) { return typeof doc.getElementById === 'function' ? doc.getElementById(id) : null; }
  function tekst(v) { return v == null ? '' : String(v).trim(); }
  function liczba(v) {
    var n = parseFloat(tekst(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  function liczbaPl(v) { return String(v).replace('.', ','); }

  // ---------------------------------------------------------------------------------------
  // Czyste funkcje — testowane jednostkowo przez __internals.
  // ---------------------------------------------------------------------------------------

  /** Wiek wiersza w pełnych miesiącach (jak collectAdvancedMeasurements: round(lata·12 + mies.)); bez wieku — null. */
  function wiekMies(lata, miesiace) {
    var y = liczba(lata), m = liczba(miesiace);
    if (y == null && m == null) return null;
    return Math.round((y || 0) * 12 + (m || 0));
  }

  /** „13 l. 7 mies.”, „13 l.” — jak podsumowanie listy (twarde spacje przed jednostką). */
  function wiekOpis(am) {
    var y = Math.floor(am / 12), m = am % 12;
    return y + NBSP + 'l.' + (m ? ' ' + m + NBSP + 'mies.' : '');
  }

  function odPacjenta(p) {
    return !!p && (p.zrodloMasy === 'pacjent' || p.zrodloWzrostu === 'pacjent');
  }

  /**
   * Gdzie wstawić blok o wieku `am` między wiersze o wiekach `wieki` (null — wiersz w toku): indeks
   * pierwszego wiersza starszego niż blok, a gdy takiego nie ma — -1 (po ostatnim wypełnionym wierszu).
   */
  function miejsceBloku(wieki, am) {
    for (var i = 0; i < wieki.length; i++) if (wieki[i] != null && wieki[i] > am) return i;
    return -1;
  }

  /**
   * Pomiary z dziennika do pokazania: `wiersze` — [{ ageMonths, weight }] wypełnionych wierszy, `biezacy` —
   * pomiar formularza { ageMonths, weight, dateISO } albo null. Gdy jest wiersz późniejszy niż bieżący pomiar
   * (odtworzenie dawnej wizyty), bez wpisów po wieku bieżącego.
   */
  function pomiaryDoListy(D, wiersze, biezacy) {
    if (!D || typeof D.pomiaryStrony !== 'function') return [];
    var os = wiersze.slice();
    var pozniej = !!biezacy && wiersze.some(function (x) { return x.ageMonths > biezacy.ageMonths; });
    if (biezacy) os.push(biezacy);
    var lista = D.pomiaryStrony(os, { doWiekuMies: pozniej ? biezacy.ageMonths : null });
    return Array.isArray(lista) ? lista : [];
  }

  // ---------------------------------------------------------------------------------------
  // DOM.
  // ---------------------------------------------------------------------------------------

  function wiersze(lista) {
    return Array.prototype.filter.call(lista.children || [], function (n) {
      return n && n.classList && n.classList.contains('measure-row');
    });
  }

  function poleWiersza(r, sel) {
    var p = r.querySelector(sel);
    return p ? tekst(p.value) : '';
  }

  function wiekWiersza(r) {
    var maWartosc = poleWiersza(r, '.adv-height') !== '' || poleWiersza(r, '.adv-weight') !== '' || poleWiersza(r, '.adv-bone-age') !== '';
    return maWartosc ? wiekMies(poleWiersza(r, '.adv-age-years'), poleWiersza(r, '.adv-age-months')) : null;
  }

  function biezacyPomiar() {
    var am = wiekMies(el('age') && el('age').value, el('ageMonths') && el('ageMonths').value);
    if (am == null) return null;
    var dob = w.VildaDobAge;
    return { ageMonths: am, weight: liczba(el('weight') && el('weight').value),
      dateISO: dob && typeof dob.readMeasuredAtISO === 'function' ? dob.readMeasuredAtISO() : null };
  }

  function pole(etykieta, wartosc) {
    var box = doc.createElement('span');
    box.className = 'adv-dz-field';
    var nazwa = doc.createElement('span');
    nazwa.className = 'adv-dz-label';
    nazwa.textContent = etykieta;
    var v = doc.createElement('span');
    v.className = 'adv-dz-value';
    v.textContent = wartosc;
    box.appendChild(nazwa);
    box.appendChild(v);
    return box;
  }

  function blok(p) {
    var D = w.VildaDziennikOtylosci;
    var pac = odPacjenta(p);
    var am = Math.round(p.ageMonths);
    var data = p.dateISO && D && typeof D.dataPL === 'function' ? D.dataPL(p.dateISO) : '';
    var b = doc.createElement('div');
    b.className = KLASA;
    b.setAttribute('role', 'group');
    b.setAttribute('data-origin', pac ? 'pacjent' : 'gabinet');
    b.setAttribute('data-age-months', String(am));
    if (p.dateISO) b.setAttribute('data-date', p.dateISO);
    b.setAttribute('aria-label', (pac ? 'Pomiar od pacjenta' : 'Wpis leczenia z gabinetu') + ', wiek ' + wiekOpis(am).replace(/ /g, ' ')
      + (data ? ', ' + data : '') + ' — tylko do odczytu, poprawiasz w Karcie pacjenta.');
    b.title = (pac ? 'Pomiar od pacjenta' : 'Wpis z gabinetu') + ' z „Wpisów leczenia”' + (data ? ' · ' + data : '') + ' · poprawiasz w Karcie pacjenta';
    var sep = doc.createElement('div');
    sep.className = 'measure-row-sep adv-dz-sep';
    var odznaka = doc.createElement('span');
    odznaka.className = 'adv-dz-badge';
    odznaka.textContent = pac ? 'pomiar od pacjenta' : 'wpis leczenia z gabinetu';
    var gora = doc.createElement('div');
    gora.className = 'measure-row-top adv-dz-top';
    gora.appendChild(pole('Wiek (lata):', String(Math.floor(am / 12))));
    gora.appendChild(pole('Wiek (miesiące):', String(am % 12)));
    gora.appendChild(pole('Wzrost (cm):', Number(p.height) > 0 ? liczbaPl(p.height) : '—'));
    var dol = doc.createElement('div');
    dol.className = 'measure-row-bot adv-dz-bot';
    dol.appendChild(pole('Waga (kg):', Number(p.weight) > 0 ? liczbaPl(p.weight) : '—'));
    dol.appendChild(pole('Wiek kostny (lata):', ''));
    b.appendChild(sep);
    b.appendChild(odznaka);
    b.appendChild(gora);
    b.appendChild(dol);
    return b;
  }

  function rysuj() {
    var lista = el('advMeasurements');
    if (!lista) return;
    try {
      var ws = wiersze(lista);
      var wieki = ws.map(wiekWiersza);
      var pelne = [];
      ws.forEach(function (r, i) {
        if (wieki[i] != null) pelne.push({ ageMonths: wieki[i], weight: liczba(poleWiersza(r, '.adv-weight')) });
      });
      var pomiary = pomiaryDoListy(w.VildaDziennikOtylosci, pelne, biezacyPomiar());
      var nowy = JSON.stringify([wieki, pomiary.map(function (p) {
        return [p.ageMonths, p.weight, p.height, p.zrodloMasy, p.zrodloWzrostu, p.dateISO];
      })]);
      var obecne = Array.prototype.filter.call(lista.children || [], function (n) {
        return n && n.classList && n.classList.contains(KLASA);
      });
      if (nowy === podpis && obecne.length === pomiary.length) return;
      podpis = nowy;
      obecne.forEach(function (n) { lista.removeChild(n); });
      var ostatni = null;
      ws.forEach(function (r, i) { if (wieki[i] != null) ostatni = r; });
      pomiary.forEach(function (p) {
        var b = blok(p);
        var i = miejsceBloku(wieki, p.ageMonths);
        if (i >= 0) {
          lista.insertBefore(b, ws[i]);
        } else if (ostatni) {
          var po = ostatni;
          while (po.nextSibling && po.nextSibling.classList && po.nextSibling.classList.contains(KLASA)) po = po.nextSibling;
          lista.insertBefore(b, po.nextSibling);
        } else {
          lista.appendChild(b);
        }
      });
      var C = w.VildaAdvHistoryCollapse;
      if (C && typeof C.odswiez === 'function') C.odswiez();
    } catch (blad) {
      zglos('rysuj', blad);
    }
  }

  var zaplanowane = false;
  function zaplanuj() {
    if (zaplanowane) return;
    zaplanowane = true;
    var uruchom = function () { zaplanowane = false; rysuj(); };
    if (typeof w.requestAnimationFrame === 'function') w.requestAnimationFrame(uruchom);
    else w.setTimeout(uruchom, 0);
  }

  function poZmianieDziennika(ev) {
    if (!(ev && ev.detail && ev.detail.source === 'obesity-dziennik')) return;
    podpis = '';
    rysuj();
    try {
      var forma = el('advancedGrowthForm');
      if (forma && forma.offsetParent !== null && typeof w.calculateGrowthAdvanced === 'function') w.calculateGrowthAdvanced();
    } catch (blad) {
      zglos('przeliczenie', blad);
    }
  }

  function start() {
    var lista = el('advMeasurements');
    if (!lista) return;
    if (typeof w.MutationObserver === 'function') {
      new w.MutationObserver(function (zmiany) {
        // Własne bloki pomijamy; wiersz dodany albo usunięty — rysunek od nowa.
        var wiersz = zmiany.some(function (z) {
          return Array.prototype.some.call(z.addedNodes || [], function (n) { return n.nodeType === 1 && !(n.classList && n.classList.contains(KLASA)); })
            || Array.prototype.some.call(z.removedNodes || [], function (n) { return n.nodeType === 1 && !(n.classList && n.classList.contains(KLASA)); });
        });
        // Od razu (mikrozadanie obserwatora), nie w następnej klatce: przebudowa wierszy nie zostawia listy bez bloków.
        if (wiersz) rysuj();
      }).observe(lista, { childList: true });
    }
    ['input', 'change'].forEach(function (typ) { doc.addEventListener(typ, zaplanuj, { capture: true, passive: true }); });
    ['vilda:patient-loaded', 'vilda:state-restored', 'vilda:persist-restored', 'vilda:json-imported', 'vilda:sync-merged'].forEach(function (n) {
      doc.addEventListener(n, zaplanuj);
    });
    doc.addEventListener('vilda:therapy-points-changed', poZmianieDziennika);
    if (typeof w.addEventListener === 'function') w.addEventListener('vilda:user-state-cleared', function () { podpis = ''; zaplanuj(); });
    zaplanuj();
  }

  w.VildaAdvDziennik = Object.freeze({
    __init: true,
    odswiez: function () { podpis = ''; rysuj(); },
    __internals: Object.freeze({ wiekMies: wiekMies, wiekOpis: wiekOpis, odPacjenta: odPacjenta, miejsceBloku: miejsceBloku, pomiaryDoListy: pomiaryDoListy })
  });

  if (doc.readyState === 'loading' && typeof doc.addEventListener === 'function') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : this);
