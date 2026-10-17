/* vilda_klawiatura.js — aktywne pole nad klawiaturą telefonu w ramce powłoki (P-KLAWIATURA).
 *
 * PO CO TO JEST (zgłoszenie właściciela 2026-10-17). W PWA na iPhonie strona Start żyje w ramce
 * powłoki app.html, a ramka sięga pod klawiaturę: powłoka celowo nie skraca jej, gdy w panelu
 * jest aktywne pole (`v()` w vilda_shell.js). Dla pól formularza iOS nie przewija wnętrza ramki,
 * tylko przesuwa cały dokument powłoki — nagłówek razem z formularzem. To było „skakanie”
 * formularza; przy przejściu z wagi do wzrostu pole wzrostu zostawało pod klawiaturą.
 *
 * CO ROBI. W chwili dotknięcia pola — zanim iOS zdecyduje o przesunięciu powłoki — przewija
 * SAMĄ ramkę tak, żeby pole stało nad klawiaturą, z zapasem na kolejny wiersz formularza (po
 * wadze widać jeszcze wzrost, więc da się go dotknąć). Wysokość klawiatury bierze z ostatniego
 * pomiaru `visualViewport` powłoki (ta sama domena); przed pierwszym pomiarem przyjmuje 42%
 * wysokości okna. Gdy klawiatura się wysunie, sprawdza pole jeszcze raz według prawdziwego
 * pomiaru. Pole już widoczne zostaje w miejscu: nic się nie rusza przy pisaniu ani wtedy, gdy
 * pod formularzem pojawiają się wyniki.
 *
 * GRANICE. Tylko ramka powłoki (`html.vilda-embedded`), tylko ekran dotykowy węższy niż 700 px,
 * tylko pola, które otwierają klawiaturę (bez select, checkbox, pól tylko do odczytu), tylko pola
 * w zwykłym przepływie dokumentu — pole w nakładce `position: fixed` albo we własnym obszarze
 * przewijania nie przesunie się przewinięciem strony, więc moduł go nie dotyka. Przed otwarciem
 * klawiatury działa tylko po dotknięciu pola (programowe `focus()` bez dotyku klawiatury na iOS
 * nie otwiera). Przewija z `behavior: 'instant'`, bo html ma `scroll-behavior: smooth`.
 * Nie zmienia danych, wyników, zapisu ani synchronizacji.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  // Ten sam próg, którym powłoka rozpoznaje otwartą klawiaturę (`St()` w vilda_shell.js).
  var PROG_KLAWIATURY = 100;
  // Wysokość klawiatury przed pierwszym pomiarem, jako część wysokości okna: klawiatura liczbowa
  // z paskiem nad nią to ok. 40–45% ekranu iPhone'a. Działa tylko do pierwszego otwarcia
  // klawiatury w ramce; potem liczy się pomiar.
  var KLAWIATURA_DOMYSLNIE = 0.42;
  var MARGINES_DOL = 16;
  var MARGINES_GORA = 8;
  // Gdy pole trzeba przesunąć, pod nim zostaje miejsce na jeszcze jeden wiersz formularza
  // (etykieta + pole to ok. 74 px), ale nie więcej niż trzecia część widocznego pasa.
  var ZAPAS_POD_POLEM = 96;
  var SZEROKOSC_TELEFONU = 700;
  // Dotknięcie, po którym przyszedł fokus. Na iOS fokus pola przychodzi przy puszczeniu palca.
  var OKNO_DOTKNIECIA_MS = 1000;

  var BEZ_KLAWIATURY = /^(checkbox|radio|button|submit|reset|image|range|color|file|hidden)$/;

  // Czyste obliczenia — bez DOM, wołane wprost przez testy jednostkowe.

  /** Pas ramki widoczny nad klawiaturą, we współrzędnych okna ramki.
   *  o.wysRamki   — wysokość okna ramki (innerHeight ramki)
   *  o.ramkaGora  — górna krawędź ramki w oknie powłoki (getBoundingClientRect)
   *  o.vvGora, o.vvWys — offsetTop i height visualViewport powłoki
   *  o.oknoWys    — innerHeight powłoki
   *  o.klawiatura — wysokość klawiatury do przyjęcia, gdy jeszcze nie jest otwarta */
  function pasWidoczny(o) {
    var otwarta = o.oknoWys - o.vvWys > PROG_KLAWIATURY;
    var dolEkranu = otwarta ? o.vvGora + o.vvWys : o.oknoWys - o.klawiatura;
    var gora = Math.max(0, o.vvGora - o.ramkaGora) + MARGINES_GORA;
    var dol = Math.min(o.wysRamki, dolEkranu - o.ramkaGora) - MARGINES_DOL;
    return { gora: gora, dol: dol, otwarta: otwarta };
  }

  /** O ile przewinąć ramkę (w dół dodatnio), żeby pole [top, bottom] mieściło się w pasie.
   *  0, gdy pole już się mieści — wtedy nic się nie rusza. Pole poza pasem staje dolną krawędzią
   *  nad zapasem na kolejny wiersz; pole wyższe niż to miejsce staje górną krawędzią przy górze pasa. */
  function przesuniecie(pole, pas) {
    if (!pole || !pas || !(pas.dol > pas.gora)) return 0;
    if (pole.top >= pas.gora && pole.bottom <= pas.dol) return 0;
    var zapas = Math.min(ZAPAS_POD_POLEM, (pas.dol - pas.gora) / 3);
    var dy = pole.bottom - (pas.dol - zapas);
    if (pole.top - dy < pas.gora) dy = pole.top - pas.gora;
    return Math.round(dy);
  }

  // Środowisko przeglądarki.

  var d = w.document;
  var ostatnieDotkniecie = null; // { el, t }
  var zmierzonaKlawiatura = 0;
  var sledzone = null; // { el, vv, onResize, ro, poz }
  var zaplanowane = 0;

  function teraz() {
    try { return w.performance && w.performance.now ? w.performance.now() : Date.now(); } catch (e) { return Date.now(); }
  }

  function powloka() {
    try {
      var p = w.parent;
      if (!p || p === w || !w.frameElement || !p.visualViewport) return null;
      return p;
    } catch (e) { return null; }
  }

  function aktywny() {
    try {
      if (!d.documentElement.classList.contains('vilda-embedded')) return false;
      if (!powloka()) return false;
      if ((w.innerWidth || 0) >= SZEROKOSC_TELEFONU) return false;
      return !!(w.matchMedia && w.matchMedia('(pointer: coarse)').matches);
    } catch (e) { return false; }
  }

  function otwieraKlawiature(el) {
    if (!el || el.disabled || el.readOnly) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    return !BEZ_KLAWIATURY.test(String(el.getAttribute('type') || 'text').toLowerCase());
  }

  // Pole przesuwa się razem z dokumentem tylko wtedy, gdy żaden przodek nie jest przyklejony
  // do ekranu ani nie przewija się sam.
  function wPrzeplywieDokumentu(el) {
    var n = el.parentElement;
    while (n && n !== d.body && n !== d.documentElement) {
      var cs = w.getComputedStyle(n);
      if (cs.position === 'fixed' || cs.position === 'sticky') return false;
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return false;
      n = n.parentElement;
    }
    return true;
  }

  function niedawnoDotkniete(el) {
    var o = ostatnieDotkniecie;
    if (!o || !o.el || teraz() - o.t > OKNO_DOTKNIECIA_MS) return false;
    return o.el === el || (typeof o.el.contains === 'function' && o.el.contains(el)) || el.contains(o.el);
  }

  function pomiar() {
    var p = powloka();
    if (!p) return null;
    var vv = p.visualViewport;
    var oknoWys = p.innerHeight || 0;
    var o = {
      wysRamki: w.innerHeight || 0,
      ramkaGora: w.frameElement.getBoundingClientRect().top,
      vvGora: vv.offsetTop || 0,
      vvWys: vv.height || oknoWys,
      oknoWys: oknoWys,
      klawiatura: zmierzonaKlawiatura || Math.round(oknoWys * KLAWIATURA_DOMYSLNIE)
    };
    if (oknoWys - o.vvWys > PROG_KLAWIATURY) zmierzonaKlawiatura = Math.round(oknoWys - o.vvWys);
    return o;
  }

  function przewin(y) {
    try {
      w.scrollTo({ top: y, left: w.scrollX || 0, behavior: 'instant' });
    } catch (e) {
      w.scrollTo(w.scrollX || 0, y);
    }
  }

  function pozycjaWDokumencie(el) {
    return el.getBoundingClientRect().top + (w.scrollY || 0);
  }

  /** Przewija ramkę tak, żeby pole stało nad klawiaturą. Zwraca wykonane przesunięcie (px). */
  function dopasuj(el) {
    try {
      var o = pomiar();
      if (!o) return 0;
      var r = el.getBoundingClientRect();
      var dy = przesuniecie({ top: r.top, bottom: r.bottom }, pasWidoczny(o));
      if (dy !== 0) przewin(Math.max(0, (w.scrollY || 0) + dy));
      if (sledzone && sledzone.el === el) sledzone.poz = pozycjaWDokumencie(el);
      return dy;
    } catch (e) {
      if (typeof w.vildaLogSwallowedCatch === 'function') w.vildaLogSwallowedCatch('vilda_klawiatura.js', e, { feature: 'dopasuj' });
      return 0;
    }
  }

  function odepnij() {
    var s = sledzone;
    sledzone = null;
    if (!s) return;
    try { s.vv.removeEventListener('resize', s.onResize); } catch (e) { /* powłoka mogła zniknąć */ }
    try { if (s.ro) s.ro.disconnect(); } catch (e) { /* bez znaczenia */ }
  }

  function zaplanuj(fn) {
    if (zaplanowane) w.clearTimeout(zaplanowane);
    zaplanowane = w.setTimeout(function () { zaplanowane = 0; fn(); }, 60);
  }

  // Na czas fokusu: wysunięcie albo zmiana klawiatury (resize visualViewport powłoki) i zmiana
  // treści NAD polem (pole zmieniło miejsce w dokumencie). Celowo bez zdarzenia scroll: przewinięcie
  // palcem przy otwartej klawiaturze należy do lekarza i nie wolno go cofać.
  function sledz(el) {
    if (sledzone && sledzone.el === el) return;
    odepnij();
    var p = powloka();
    if (!p) return;
    var s = { el: el, vv: p.visualViewport, ro: null, poz: pozycjaWDokumencie(el) };
    s.onResize = function () {
      zaplanuj(function () {
        if (sledzone !== s || d.activeElement !== el) return;
        var o = pomiar();
        if (o && o.oknoWys - o.vvWys > PROG_KLAWIATURY) dopasuj(el);
      });
    };
    s.vv.addEventListener('resize', s.onResize, { passive: true });
    if (typeof w.ResizeObserver === 'function') {
      s.ro = new w.ResizeObserver(function () {
        if (sledzone !== s || d.activeElement !== el) return;
        if (Math.abs(pozycjaWDokumencie(el) - s.poz) > 1) dopasuj(el);
      });
      s.ro.observe(d.documentElement);
    }
    sledzone = s;
  }

  function naDotkniecie(e) {
    ostatnieDotkniecie = { el: e.target, t: teraz() };
  }

  function naFokus(e) {
    var el = e.target;
    if (!otwieraKlawiature(el) || !aktywny() || !wPrzeplywieDokumentu(el)) {
      odepnij();
      return;
    }
    sledz(el);
    var o = pomiar();
    var otwarta = !!o && o.oknoWys - o.vvWys > PROG_KLAWIATURY;
    if (otwarta || niedawnoDotkniete(el)) dopasuj(el);
  }

  function naUtrateFokusu() {
    w.setTimeout(function () {
      if (sledzone && d.activeElement !== sledzone.el) odepnij();
    }, 0);
  }

  if (d && typeof d.addEventListener === 'function') {
    d.addEventListener('pointerdown', naDotkniecie, { capture: true, passive: true });
    d.addEventListener('touchstart', naDotkniecie, { capture: true, passive: true });
    d.addEventListener('focusin', naFokus, true);
    d.addEventListener('focusout', naUtrateFokusu, true);
    // Słuchacz siedzi na visualViewport POWŁOKI, więc przy przeładowaniu ramki trzeba go zdjąć.
    w.addEventListener('pagehide', odepnij);
  }

  w.VildaKlawiatura = {
    VERSION: VERSION,
    pasWidoczny: pasWidoczny,
    przesuniecie: przesuniecie,
    aktywny: aktywny,
    dopasuj: dopasuj
  };
})(typeof window !== 'undefined' ? window : globalThis);
