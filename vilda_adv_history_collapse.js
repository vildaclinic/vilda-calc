/* vilda_adv_history_collapse.js — zwijana lista „Poprzednie pomiary” w karcie
 * „Zaawansowane obliczenia wzrostowe” (strona główna). P-HISTORIA-ZWIJANA, decyzje właściciela
 * 2026-09-29: stan per pacjent, synchronizowany między urządzeniami, domyślnie rozwinięty,
 * podsumowanie pod nagłówkiem, tylko karta na stronie głównej.
 *
 * PROBLEM
 *   Przy dłuższej obserwacji lista poprzednich pomiarów zajmuje większość karty: sześć
 *   wierszy to ok. 940 px na desktopie i ok. 1220 px na telefonie.
 *
 * ROZWIĄZANIE (bez edycji zminifikowanego vilda_advanced_growth.js)
 *   • Nagłówek listy jest przyciskiem (#advHistoryToggle, aria-expanded) z licznikiem
 *     pomiarów, a w stanie zwiniętym z jednym wierszem podsumowania.
 *   • Zwinięcie oznacza atrybutem data-adv-history="ukryty" każdy wiersz z wiekiem i co
 *     najmniej jednym pomiarem; CSS chowa go tylko przy klasie kontenera
 *     `adv-history-collapsed`. Wiersz dodany, gdy lista jest zwinięta, dostaje
 *     data-adv-history="nowy" i zostaje widoczny z etykietą „Nowy pomiar” do następnego
 *     zwinięcia — kolejną wizytę dopisuje się bez rozwijania historii.
 *   • Pole ukrytego wiersza poza zakresem ustalonym atrybutami min/max samego pola
 *     (albo z aria-invalid) daje w nagłówku znacznik „Do poprawy: N”. Moduł nie wprowadza
 *     żadnych własnych progów.
 *
 * CZEGO MODUŁ NIE ROBI
 *   • Nie usuwa, nie przestawia i nie zmienia wierszy ani wartości: collectAdvancedMeasurements()
 *     i obliczenia czytają wszystkie wiersze niezależnie od widoczności.
 *   • Nie zapisuje niczego w rekordzie pacjenta ani w sesji głównej. Przyciski stoją POZA
 *     #advMeasurements, bo kliknięcia wewnątrz kontenera uruchamiają autozapis
 *     (vilda_persist_runtime.js), a wskaźnik zapisu reaguje wyłącznie na zmianę danych.
 *
 * STAN
 *   • Preferencja konta `advHistoryCollapsed` (klasa cloud-synced w vilda_persistence_adapter.js):
 *     mapa { <identyfikator pacjenta>: 1 } — wyłącznie pacjenci ze zwiniętą listą, bez dat,
 *     najwyżej LIMIT_WPISOW wpisów (najdawniej przełączone wypadają pierwsze); wpis znika po
 *     usunięciu pacjenta z sejfu. Identyfikator to losowy UUID z sejfu, nie nazwisko.
 *   • Pacjent niezapisany (brak identyfikatora) — stan tylko w pamięci strony; przy pierwszym
 *     zapisie (`vilda:patient-loaded`, source "save") przechodzi pod nadany identyfikator.
 *   • Przy wyborze pacjenta z sejfu wiersze odbudowuje applyLoadedData, a `vilda:patient-loaded`
 *     przychodzi PO niej, zaś `vilda:json-imported` jeszcze później (setTimeout 0). Dlatego
 *     json-imported w oknie OKNO_WCZYTANIA_MS po wczytaniu z sejfu jest ignorowany, tak jak
 *     robi to wskaźnik zapisu; poza tym oknem oznacza import pliku, czyli pacjenta bez
 *     identyfikatora.
 *
 * BEZPIECZNIKI
 *   • Brak elementów (inna strona) — moduł nic nie robi.
 *   • Adapter odmówił zapisu — stan żyje w pamięci do końca strony.
 *   • Idempotentne: podwójne dołączenie nie inicjalizuje dwa razy.
 */
(function (w) {
  'use strict';
  if (!w || !w.document) return;
  if (w.VildaAdvHistoryCollapse && w.VildaAdvHistoryCollapse.__init) return;

  var doc = w.document;
  var VERSION = '1';
  var PREF_KEY = 'advHistoryCollapsed';
  var LIMIT_WPISOW = 300;
  var OKNO_WCZYTANIA_MS = 1500;
  var KLASA_ZWINIETE = 'adv-history-collapsed';
  var ATRYBUT = 'data-adv-history';
  var ID_PACJENTA = /^[A-Za-z0-9_-]{8,64}$/;
  var MIN_DO_DOLNEGO_PRZYCISKU = 3;
  // Twarda spacja między liczbą a jednostką: „27,0 kg” nie łamie się na końcu wiersza.
  var NBSP = '\u00a0';

  function zglos(krok, blad) {
    try {
      if (typeof w.vildaLogSwallowedCatch === 'function') {
        w.vildaLogSwallowedCatch('vilda_adv_history_collapse.js', blad, { step: krok });
      }
    } catch (e) {
      /* logowanie nie może wywrócić karty */
    }
  }

  // ---------------------------------------------------------------------------------------
  // Czyste funkcje — testowane jednostkowo przez __internals.
  // ---------------------------------------------------------------------------------------

  function tekst(v) {
    return v == null ? '' : String(v).trim();
  }

  function liczbaPl(v) {
    return tekst(v).replace('.', ',');
  }

  /** 1 pomiar, 2–4 pomiary, 5–21 pomiarów, 22–24 pomiary, 112 pomiarów… */
  function odmianaPomiarow(n) {
    var d = n % 10;
    var s = n % 100;
    if (n === 1) return 'pomiar';
    if (d >= 2 && d <= 4 && !(s >= 12 && s <= 14)) return 'pomiary';
    return 'pomiarów';
  }

  /** Wiersz jest pomiarem, gdy ma wiek i co najmniej jedną wartość. Wiersz z samym wiekiem
   *  albo pusty to wpis w toku — nie liczy się i nigdy nie jest chowany. */
  function czyWypelniony(d) {
    if (!d) return false;
    var maWiek = tekst(d.lata) !== '' || tekst(d.miesiace) !== '';
    var maWartosc = tekst(d.wzrost) !== '' || tekst(d.masa) !== '' || tekst(d.wiekKostny) !== '';
    return maWiek && maWartosc;
  }

  function wiekLiczbowy(d) {
    var y = parseFloat(tekst(d.lata).replace(',', '.'));
    var m = parseFloat(tekst(d.miesiace).replace(',', '.'));
    return (isFinite(y) ? y : 0) + (isFinite(m) ? m / 12 : 0);
  }

  /** Wiek tak, jak go wpisano: „9 l.”, „9 l. 6 mies.”, „8 mies.” (twarde spacje przed
   *  jednostką). Bez przeliczeń. */
  function wiekOpis(d) {
    var y = tekst(d.lata);
    var m = tekst(d.miesiace);
    var mZero = m === '' || parseFloat(m.replace(',', '.')) === 0;
    if (y === '') return mZero ? '0' + NBSP + 'mies.' : liczbaPl(m) + NBSP + 'mies.';
    return liczbaPl(y) + NBSP + 'l.' + (mZero ? '' : ' ' + liczbaPl(m) + NBSP + 'mies.');
  }

  /** „wiek 4 l. – 9 l. · najnowszy: 129,1 cm · 27,0 kg” — wartości przepisane z pól. */
  function podsumowanie(wypelnione, maNowe) {
    if (!wypelnione || !wypelnione.length) return '';
    var najmlodszy = wypelnione[0];
    var najnowszy = wypelnione[0];
    wypelnione.forEach(function (d) {
      if (wiekLiczbowy(d) < wiekLiczbowy(najmlodszy)) najmlodszy = d;
      if (wiekLiczbowy(d) >= wiekLiczbowy(najnowszy)) najnowszy = d;
    });
    var miary = [];
    if (tekst(najnowszy.wzrost) !== '') miary.push(liczbaPl(najnowszy.wzrost) + NBSP + 'cm');
    if (tekst(najnowszy.masa) !== '') miary.push(liczbaPl(najnowszy.masa) + NBSP + 'kg');
    var czesci;
    if (wypelnione.length === 1) {
      czesci = ['wiek ' + wiekOpis(najnowszy)].concat(miary);
    } else {
      czesci = ['wiek ' + wiekOpis(najmlodszy) + ' – ' + wiekOpis(najnowszy)];
      if (miary.length) czesci.push('najnowszy: ' + miary.join(' · '));
    }
    if (maNowe) czesci.push('nowy pomiar poniżej');
    return czesci.join(' · ');
  }

  function przytnij(mapa) {
    var klucze = Object.keys(mapa);
    if (klucze.length <= LIMIT_WPISOW) return mapa;
    var wynik = {};
    klucze.slice(klucze.length - LIMIT_WPISOW).forEach(function (k) {
      wynik[k] = 1;
    });
    return wynik;
  }

  /** Odczyt z magazynu jest danymi, nie zaufaniem: zostają tylko identyfikatory o kształcie
   *  identyfikatora sejfu z wartością 1. */
  function normalizujMape(v) {
    var wynik = {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) return wynik;
    Object.keys(v).forEach(function (k) {
      if (ID_PACJENTA.test(k) && v[k] === 1) wynik[k] = 1;
    });
    return przytnij(wynik);
  }

  /** Nowa mapa po przełączeniu: zwinięcie przenosi wpis na koniec (najświeższy), rozwinięcie
   *  go usuwa, bo rozwinięta lista jest stanem domyślnym. */
  function zmienMape(mapa, id, zwiniete) {
    var wynik = {};
    Object.keys(mapa || {}).forEach(function (k) {
      if (k !== id) wynik[k] = 1;
    });
    if (zwiniete && ID_PACJENTA.test(String(id || ''))) wynik[id] = 1;
    return przytnij(wynik);
  }

  // ---------------------------------------------------------------------------------------
  // Magazyn: preferencja konta przez VildaPersistence.
  // ---------------------------------------------------------------------------------------

  var mapaZapasowa = null;

  function adapter() {
    var P = w.VildaPersistence;
    return P && typeof P.readPreferenceJSON === 'function'
      && typeof P.writePreferenceJSON === 'function' ? P : null;
  }

  function czytajMape() {
    if (mapaZapasowa) return mapaZapasowa;
    var P = adapter();
    if (!P) return {};
    try {
      return normalizujMape(P.readPreferenceJSON(PREF_KEY, {}));
    } catch (e) {
      zglos('czytaj-mape', e);
      return {};
    }
  }

  function zapiszMape(mapa) {
    var P = adapter();
    if (P) {
      try {
        // force: okno blokady po wczytaniu pacjenta (__vildaPersistClearUntil) wstrzymuje zapis
        // DANYCH; to jest preferencja widoku, tak jak cardCollapseState.
        if (P.writePreferenceJSON(PREF_KEY, mapa, { force: true }) === true) {
          mapaZapasowa = null;
          return true;
        }
      } catch (e) {
        zglos('zapisz-mape', e);
      }
    }
    mapaZapasowa = mapa;
    return false;
  }

  // ---------------------------------------------------------------------------------------
  // Tożsamość pacjenta.
  // ---------------------------------------------------------------------------------------

  var brakIdWymuszony = false;
  var ostatnieWczytanieZSejfu = 0;

  function poprawneId(id) {
    return typeof id === 'string' && ID_PACJENTA.test(id) ? id : null;
  }

  function biezacyPacjent() {
    if (brakIdWymuszony) return null;
    var id;
    try {
      id = w._vildaCurrentPatientId
        || (w.sessionStorage && w.sessionStorage.getItem('vildaCurrentPatientId')) || null;
    } catch (e) {
      id = w._vildaCurrentPatientId || null;
    }
    return poprawneId(id);
  }

  /** Zapis dostaje identyfikator tylko wtedy, gdy wskaźnik zapisu nie mówi, że na ekranie
   *  jest pacjent niezapisany — np. po imporcie pliku przy pozostałym identyfikatorze
   *  poprzedniej osoby. Wtedy stan idzie do pamięci strony, a nie pod cudzy wpis. */
  function idDoZapisu() {
    var id = biezacyPacjent();
    if (!id) return null;
    try {
      var S = w.VildaSaveStatusIndicator;
      var s = S && typeof S.getState === 'function' ? S.getState() : null;
      if (s === 'new_patient' || s === 'hidden') return null;
    } catch (e) {
      zglos('stan-wskaznika', e);
    }
    return id;
  }

  // ---------------------------------------------------------------------------------------
  // Widok.
  // ---------------------------------------------------------------------------------------

  var stan = { id: null, zwiniete: false };
  var zwinieteNiezapisanego = false;
  var przelaczonoRecznie = false;

  function el(id) {
    return typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function elementy() {
    return {
      lista: el('advMeasurements'),
      przelacznik: el('advHistoryToggle'),
      naglowek: el('advHistoryHeading'),
      licznik: el('advHistoryCount'),
      uwaga: el('advHistoryInvalid'),
      uwagaTekst: el('advHistoryInvalidText'),
      podsumowanie: el('advHistorySummary'),
      akcja: el('advHistoryAction'),
      dolny: el('advHistoryCollapseBottom')
    };
  }

  function wiersze(lista) {
    if (!lista) return [];
    return Array.prototype.filter.call(lista.children || [], function (n) {
      return n && n.classList && n.classList.contains('measure-row');
    });
  }

  function daneWiersza(r) {
    function v(sel) {
      var pole = r.querySelector(sel);
      return pole ? tekst(pole.value) : '';
    }
    return {
      lata: v('.adv-age-years'),
      miesiace: v('.adv-age-months'),
      wzrost: v('.adv-height'),
      masa: v('.adv-weight'),
      wiekKostny: v('.adv-bone-age')
    };
  }

  /** Tylko granice pola (min/max) i nieparsowalna liczba. `step` pomijamy: 129,15 cm jest
   *  poprawnym wpisem, choć pole ma krok 0,1. */
  function maBlednePole(r) {
    var pola = r.querySelectorAll('input');
    for (var i = 0; i < pola.length; i++) {
      var p = pola[i];
      if (p.getAttribute('aria-invalid') === 'true') return true;
      var v = p.validity;
      if (v && (v.rangeOverflow || v.rangeUnderflow || v.badInput)) return true;
    }
    return false;
  }

  function odswiez() {
    var e = elementy();
    if (!e.lista || !e.przelacznik) return;
    var ws = wiersze(e.lista);
    var pelne = ws.map(daneWiersza).filter(czyWypelniony);
    var n = pelne.length;
    var zwiniete = stan.zwiniete && n > 0;

    e.lista.classList.toggle(KLASA_ZWINIETE, zwiniete);
    e.przelacznik.hidden = n === 0;
    if (e.naglowek) e.naglowek.hidden = n > 0;
    e.przelacznik.setAttribute('aria-expanded', zwiniete ? 'false' : 'true');
    if (e.licznik) e.licznik.textContent = n + ' ' + odmianaPomiarow(n);

    var bledne = zwiniete ? ws.filter(function (r) {
      return r.getAttribute(ATRYBUT) === 'ukryty' && maBlednePole(r);
    }).length : 0;
    if (e.uwaga) e.uwaga.hidden = bledne === 0;
    if (e.uwagaTekst) e.uwagaTekst.textContent = 'Do poprawy: ' + bledne;

    var maNowe = zwiniete && ws.some(function (r) {
      return r.getAttribute(ATRYBUT) === 'nowy';
    });
    var opis = zwiniete ? podsumowanie(pelne, maNowe) : '';
    if (e.podsumowanie) {
      e.podsumowanie.textContent = opis;
      e.podsumowanie.hidden = opis === '';
    }
    if (e.akcja) e.akcja.textContent = zwiniete ? 'Rozwiń' : 'Zwiń';
    if (e.dolny) e.dolny.hidden = zwiniete || n < MIN_DO_DOLNEGO_PRZYCISKU;
  }

  var odswiezenieZaplanowane = false;
  function zaplanujOdswiezenie() {
    if (odswiezenieZaplanowane) return;
    odswiezenieZaplanowane = true;
    var uruchom = function () {
      odswiezenieZaplanowane = false;
      odswiez();
    };
    if (typeof w.requestAnimationFrame === 'function') w.requestAnimationFrame(uruchom);
    else w.setTimeout(uruchom, 0);
  }

  /** Pełne ustawienie znaczników według stanu: przy zwinięciu chowa każdy wiersz z danymi,
   *  zdejmuje etykiety „Nowy pomiar”; przy rozwinięciu zdejmuje wszystkie znaczniki. */
  function oznaczWiersze() {
    var lista = el('advMeasurements');
    wiersze(lista).forEach(function (r) {
      if (stan.zwiniete && czyWypelniony(daneWiersza(r))) r.setAttribute(ATRYBUT, 'ukryty');
      else r.removeAttribute(ATRYBUT);
    });
    odswiez();
  }

  function stanDla(id) {
    return id ? czytajMape()[id] === 1 : zwinieteNiezapisanego;
  }

  function zastosuj(id) {
    stan.id = id;
    stan.zwiniete = stanDla(id);
    przelaczonoRecznie = false;
    oznaczWiersze();
  }

  function przewinDoNaglowka(przelacznik) {
    try {
      przelacznik.focus({ preventScroll: true });
    } catch (e) {
      try { przelacznik.focus(); } catch (e2) { zglos('fokus', e2); }
    }
    try {
      var r = przelacznik.getBoundingClientRect();
      var wysokosc = w.innerHeight || 0;
      // 72 px: pasek chrome (--chrome-strip-height, 64 px) przykrywa górę okna.
      if (r.top < 72 || (wysokosc && r.top > wysokosc)) {
        var ograniczRuch = typeof w.matchMedia === 'function'
          && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
        przelacznik.scrollIntoView({ block: 'start', behavior: ograniczRuch ? 'auto' : 'smooth' });
      }
    } catch (e) {
      zglos('przewin', e);
    }
  }

  function przelacz(zDolu) {
    var nowy = !stan.zwiniete;
    var id = idDoZapisu();
    if (id) zapiszMape(zmienMape(czytajMape(), id, nowy));
    else zwinieteNiezapisanego = nowy;
    stan.id = id;
    stan.zwiniete = nowy;
    przelaczonoRecznie = true;
    oznaczWiersze();
    if (zDolu === true && nowy) {
      var p = el('advHistoryToggle');
      if (p) przewinDoNaglowka(p);
    }
  }

  // ---------------------------------------------------------------------------------------
  // Zdarzenia.
  // ---------------------------------------------------------------------------------------

  function poWczytaniuPacjenta(ev) {
    var d = ev && ev.detail ? ev.detail : {};
    var id = poprawneId(d.patientId);
    brakIdWymuszony = false;
    ostatnieWczytanieZSejfu = Date.now();
    if (d.source === 'save') {
      // Zapis nie przebudowuje wierszy — nie ruszamy znaczników, żeby dopiero dopisany pomiar
      // nie zniknął spod ręki. Gdy zapis nadał NOWY identyfikator (pierwszy zapis albo „zapisz
      // jako nowego pacjenta”), widoczny na ekranie stan przechodzi pod nowy wpis.
      if (id && id !== stan.id) {
        if (stan.zwiniete) zapiszMape(zmienMape(czytajMape(), id, true));
        zwinieteNiezapisanego = false;
        stan.id = id;
      }
      odswiez();
      return;
    }
    zastosuj(id);
  }

  function poImporcie() {
    if (Date.now() - ostatnieWczytanieZSejfu < OKNO_WCZYTANIA_MS) return;
    brakIdWymuszony = true;
    zwinieteNiezapisanego = false;
    zastosuj(null);
  }

  function poWyczyszczeniuStanu() {
    brakIdWymuszony = true;
    zwinieteNiezapisanego = false;
    mapaZapasowa = null;
    zastosuj(null);
  }

  function poOdtworzeniu() {
    zastosuj(biezacyPacjent());
  }

  function poScaleniu() {
    // Stan przyszedł z innego urządzenia. Nie przestawiamy listy pod ręką kogoś, kto właśnie
    // ją przełączył na tym ekranie.
    if (!przelaczonoRecznie) {
      var przed = stan.zwiniete;
      stan.zwiniete = stanDla(stan.id);
      if (stan.zwiniete !== przed) oznaczWiersze();
    }
  }

  var usuwanieWpiete = false;
  function wepnijUsuwaniePacjenta() {
    if (usuwanieWpiete) return;
    var V = w.VildaVault;
    if (!V || typeof V.onPatientDeleted !== 'function') return;
    usuwanieWpiete = true;
    try {
      V.onPatientDeleted(function (e) {
        var id = poprawneId(e && e.patientId);
        if (!id) return;
        var mapa = czytajMape();
        if (mapa[id] === 1) zapiszMape(zmienMape(mapa, id, false));
      });
    } catch (e) {
      zglos('usuwanie-pacjenta', e);
    }
  }

  function obserwujWiersze(lista) {
    if (typeof w.MutationObserver !== 'function') return;
    var obserwator = new w.MutationObserver(function (zmiany) {
      var dodane = [];
      zmiany.forEach(function (z) {
        Array.prototype.forEach.call(z.addedNodes || [], function (n) {
          if (n && n.nodeType === 1 && n.classList && n.classList.contains('measure-row')) dodane.push(n);
        });
      });
      if (stan.zwiniete) {
        // Wiersz z danymi dołożony przez kod (wczytanie, import GH, synchronizacja z kartą
        // spożycia) należy do historii; pusty dołożył użytkownik — to nowy wpis.
        dodane.forEach(function (r) {
          if (r.hasAttribute(ATRYBUT)) return;
          r.setAttribute(ATRYBUT, czyWypelniony(daneWiersza(r)) ? 'ukryty' : 'nowy');
        });
      }
      // Od razu, nie w następnej klatce: nagłówek ma mówić to samo co lista, zanim ktokolwiek
      // zdąży go przeczytać (odświeżenie to kilka odczytów pól, bez przeliczeń).
      odswiez();
    });
    obserwator.observe(lista, { childList: true });
  }

  function start() {
    var e = elementy();
    if (!e.lista || !e.przelacznik) return;

    e.przelacznik.addEventListener('click', function () { przelacz(false); });
    if (e.dolny) e.dolny.addEventListener('click', function () { przelacz(true); });

    obserwujWiersze(e.lista);
    // Wartości wierszy zmienia też kod (synchronizacja z kartą spożycia), zawsze w następstwie
    // wpisu użytkownika — stąd nasłuch na całym dokumencie. Tylko odczyt, nic nie zapisuje.
    ['input', 'change'].forEach(function (typ) {
      doc.addEventListener(typ, zaplanujOdswiezenie, { capture: true, passive: true });
    });

    doc.addEventListener('vilda:patient-loaded', poWczytaniuPacjenta);
    doc.addEventListener('vilda:json-imported', poImporcie);
    doc.addEventListener('vilda:state-restored', poOdtworzeniu);
    doc.addEventListener('vilda:persist-restored', poOdtworzeniu);
    doc.addEventListener('vilda:sync-merged', poScaleniu);
    // Wylogowanie i czyszczenie stanu lecą na WINDOW (userData.js, vilda_persist_runtime.js).
    if (typeof w.addEventListener === 'function') {
      w.addEventListener('vilda:user-state-cleared', poWyczyszczeniuStanu);
      w.addEventListener('load', wepnijUsuwaniePacjenta);
    }
    wepnijUsuwaniePacjenta();

    zastosuj(biezacyPacjent());
  }

  w.VildaAdvHistoryCollapse = Object.freeze({
    __init: true,
    VERSION: VERSION,
    PREF_KEY: PREF_KEY,
    /** Stan widoku do diagnostyki i testów; bez identyfikatora pacjenta w konsoli. */
    stan: function () {
      return { zapisany: !!stan.id, zwiniete: stan.zwiniete };
    },
    odswiez: odswiez,
    __internals: Object.freeze({
      LIMIT_WPISOW: LIMIT_WPISOW,
      odmianaPomiarow: odmianaPomiarow,
      czyWypelniony: czyWypelniony,
      wiekOpis: wiekOpis,
      podsumowanie: podsumowanie,
      normalizujMape: normalizujMape,
      zmienMape: zmienMape
    })
  });

  if (doc.readyState === 'loading' && typeof doc.addEventListener === 'function') {
    doc.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : this);
