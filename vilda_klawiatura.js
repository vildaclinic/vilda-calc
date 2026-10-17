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
 * WERSJA 2 (P-KLAWIATURA-2, zgłoszenie właściciela 2026-10-17 po scaleniu wersji 1). Na iPhonie
 * ścieżka wiek (lata) → miesiące → waga → wzrost, z klawiaturą otwartą cały czas, nadal chowała
 * wzrost pod klawiaturę. Emulacja Chromium tego nie odtwarza, więc wersja 2 usuwa założenia,
 * których nie da się sprawdzić bez iPhone'a:
 *  - otwartą klawiaturę rozpoznaje względem największej wysokości okna widzianej przy tej szerokości,
 *    nie względem bieżącego innerHeight (gdyby iOS w trybie PWA zmniejszał też innerHeight,
 *    wersja 1 uznałaby klawiaturę za schowaną);
 *  - margines nad zmierzoną klawiaturą 40 px zamiast 16 px: w iOS 26 pasek nad klawiaturą
 *    (strzałki, „Gotowe”) unosi się jako osobna kapsuła i nie wiadomo, czy visualViewport go
 *    odlicza (przed pierwszym pomiarem zostaje 16 px, bo szacunek 42% obejmuje pasek);
 *  - do 1,5 s po fokusie sprawdza pole jeszcze raz (po 350 i 900 ms oraz po każdym przesunięciu
 *    powłoki) i podnosi je, jeśli coś zostawiło je pod klawiaturą. Ta kontrola tylko podnosi pole;
 *  - pola nie opuszcza (przewinięcie ramki w górę), gdy powłoka jest przesunięta — wtedy górę pasa
 *    wyznacza offsetTop visualViewport, a tego rozliczenia na iOS 26 nie da się tu sprawdzić;
 *  - dziennik diagnostyczny dla właściciela: ten sam przełącznik co diagnostyka docka w ios26-ui.js
 *    (5 szybkich stuknięć w pasek z nazwą pod nagłówkiem, klucz `vilda-dockdiag`). Pokazuje
 *    u góry okna powłoki ostatnie pomiary i decyzje modułu — wyłącznie geometrię i identyfikatory
 *    pól, bez wpisanych wartości. Dziennik zostaje po schowaniu klawiatury (przy przesuniętej
 *    powłoce panel może być wtedy nad ekranem), więc zrzut można zrobić po „Gotowe”.
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

  var VERSION = '2';

  // Ten sam próg, którym powłoka rozpoznaje otwartą klawiaturę (`St()` w vilda_shell.js).
  var PROG_KLAWIATURY = 100;
  // Wysokość klawiatury przed pierwszym pomiarem, jako część wysokości okna: klawiatura liczbowa
  // z paskiem nad nią to ok. 40–45% ekranu iPhone'a. Działa tylko do pierwszego otwarcia
  // klawiatury w ramce; potem liczy się pomiar.
  var KLAWIATURA_DOMYSLNIE = 0.42;
  // Wersja 1 miała 16 px. 40 px mieści pływający pasek iOS 26 nad klawiaturą, gdyby visualViewport
  // go nie odliczał, a wiek (dolna krawędź 470 px przy linii klawiatury 516 px) nadal się mieści.
  var MARGINES_DOL = 40;
  // Przed pierwszym pomiarem klawiatury: szacunek 42% obejmuje już pasek nad klawiaturą, więc
  // margines jak w wersji 1. Inaczej pierwsze dotknięcie wieku przesuwało formularz o 112 px.
  var MARGINES_DOL_SZACUNEK = 16;
  var MARGINES_GORA = 8;
  // Gdy pole trzeba przesunąć, pod nim zostaje miejsce na jeszcze jeden wiersz formularza
  // (etykieta + pole to ok. 74 px), ale nie więcej niż trzecia część widocznego pasa.
  var ZAPAS_POD_POLEM = 96;
  var SZEROKOSC_TELEFONU = 700;
  // Dotknięcie, po którym przyszedł fokus. Na iOS fokus pola przychodzi przy puszczeniu palca.
  var OKNO_DOTKNIECIA_MS = 1000;
  // Kontrola po fokusie: iOS wysuwa klawiaturę i przesuwa powłokę w ciągu ok. 250–500 ms.
  var KONTROLE_MS = [350, 900];
  var OKNO_KONTROLI_MS = 1500;
  // Zmiana szerokości okna o więcej niż tyle to obrót ekranu: wysokość bazowa liczy się od nowa.
  var TOLERANCJA_SZEROKOSCI = 4;
  var KLUCZ_DIAGNOSTYKI = 'vilda-dockdiag';
  var LINIE_DZIENNIKA = 10;

  var BEZ_KLAWIATURY = /^(checkbox|radio|button|submit|reset|image|range|color|file|hidden)$/;

  // Czyste obliczenia — bez DOM, wołane wprost przez testy jednostkowe.

  /** Pas ramki widoczny nad klawiaturą, we współrzędnych okna ramki.
   *  o.wysRamki   — wysokość okna ramki (innerHeight ramki)
   *  o.ramkaGora  — górna krawędź ramki w oknie powłoki (getBoundingClientRect)
   *  o.vvGora, o.vvWys — offsetTop i height visualViewport powłoki
   *  o.oknoWys    — wysokość okna powłoki bez klawiatury (wysokość bazowa, zob. nowaPodstawa)
   *  o.klawiatura — wysokość klawiatury do przyjęcia, gdy jeszcze nie jest otwarta
   *  o.szacunek   — klawiatura jeszcze nigdy nie zmierzona (o.klawiatura to szacunek 42%) */
  function pasWidoczny(o) {
    var otwarta = o.oknoWys - o.vvWys > PROG_KLAWIATURY;
    var dolEkranu = otwarta ? o.vvGora + o.vvWys : o.oknoWys - o.klawiatura;
    var gora = Math.max(0, o.vvGora - o.ramkaGora) + MARGINES_GORA;
    var margines = !otwarta && o.szacunek ? MARGINES_DOL_SZACUNEK : MARGINES_DOL;
    var dol = Math.min(o.wysRamki, dolEkranu - o.ramkaGora) - margines;
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

  /** Wysokość okna powłoki bez klawiatury: największa widziana przy tej samej szerokości.
   *  stara — { szer, wys } z poprzedniego pomiaru (albo null)
   *  m.szer, m.oknoWys — innerWidth i innerHeight powłoki
   *  m.vvWys — visualViewport.height powłoki
   *  m.poleAktywne — czy jakieś pole ma fokus; wtedy visualViewport może być skrócony klawiaturą,
   *  więc nie podnosi podstawy. innerHeight podnosi ją zawsze: na iOS klawiatura go nie zmienia. */
  function nowaPodstawa(stara, m) {
    var ta = !!stara && Math.abs((stara.szer || 0) - (m.szer || 0)) <= TOLERANCJA_SZEROKOSCI;
    var wys = Math.max(ta ? stara.wys || 0 : 0, m.oknoWys || 0, m.poleAktywne ? 0 : m.vvWys || 0);
    return { szer: ta ? stara.szer : m.szer || 0, wys: wys };
  }

  // Środowisko przeglądarki.

  var d = w.document;
  var ostatnieDotkniecie = null; // { el, t }
  var zmierzonaKlawiatura = 0;
  var podstawa = null; // { szer, wys }
  var sledzone = null; // { el, vv, p, onResize, onPrzesuniecie, ro, poz, koniecKontroli, kontrole, czasKontroli, t0 }
  var zaplanowane = 0;
  var dziennik = [];

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

  // Fokus w ramce albo w samej powłoce (np. pole wyszukiwania w nagłówku).
  function jakiesPoleAktywne(p) {
    try {
      if (otwieraKlawiature(d.activeElement)) return true;
      return !!p && otwieraKlawiature(p.document.activeElement);
    } catch (e) { return true; }
  }

  function zmierzPodstawe(p) {
    try {
      podstawa = nowaPodstawa(podstawa, {
        szer: p.innerWidth || 0,
        oknoWys: p.innerHeight || 0,
        vvWys: p.visualViewport.height || 0,
        poleAktywne: jakiesPoleAktywne(p)
      });
    } catch (e) { /* powłoka mogła zniknąć */ }
    return podstawa ? podstawa.wys : 0;
  }

  function pomiar() {
    var p = powloka();
    if (!p) return null;
    var vv = p.visualViewport;
    var innerH = p.innerHeight || 0;
    var oknoWys = zmierzPodstawe(p) || innerH;
    var o = {
      wysRamki: w.innerHeight || 0,
      ramkaGora: w.frameElement.getBoundingClientRect().top,
      vvGora: vv.offsetTop || 0,
      vvWys: vv.height || oknoWys,
      oknoWys: oknoWys,
      innerH: innerH,
      powlokaY: p.scrollY || 0,
      klawiatura: zmierzonaKlawiatura || Math.round(oknoWys * KLAWIATURA_DOMYSLNIE),
      szacunek: !zmierzonaKlawiatura
    };
    if (oknoWys - o.vvWys > PROG_KLAWIATURY) zmierzonaKlawiatura = Math.round(oknoWys - o.vvWys);
    return o;
  }

  function klawiaturaOtwarta(o) {
    return !!o && o.oknoWys - o.vvWys > PROG_KLAWIATURY;
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

  // Dziennik diagnostyczny — tylko po włączeniu przez właściciela.

  function diagnostykaWlaczona() {
    try { return w.localStorage.getItem(KLUCZ_DIAGNOSTYKI) === '1'; } catch (e) { return false; }
  }

  function panelDiagnostyki(p, utworz) {
    var pd = p.document;
    var n = pd.getElementById('vildaKlawiaturaDiag');
    if (!n && utworz && pd.body) {
      n = pd.createElement('div');
      n.id = 'vildaKlawiaturaDiag';
      n.setAttribute('aria-hidden', 'true');
      // Wygląd w vilda_shell.css (#vildaKlawiaturaDiag): panel żyje w dokumencie powłoki.
      pd.body.appendChild(n);
    }
    return n;
  }

  /** Jedna linia: czas od fokusu, pole, zdarzenie, surowe pomiary i decyzja.
   *  inH — innerHeight/wysokość bazowa powłoki; vv — height@offsetTop; sY — scrollY powłoki;
   *  rG — góra ramki; fY — scrollY ramki; pole i pas we współrzędnych ramki, po przewinięciu. */
  function zapiszDiagnostyke(zdarzenie, el, o, dy) {
    var p = powloka();
    if (!p) return;
    if (!diagnostykaWlaczona()) {
      dziennik = [];
      var stary = panelDiagnostyki(p, false);
      if (stary && stary.parentNode) stary.parentNode.removeChild(stary);
      return;
    }
    try {
      var r = el.getBoundingClientRect();
      var pas = o ? pasWidoczny(o) : null;
      var t0 = sledzone && sledzone.el === el ? sledzone.t0 : teraz();
      dziennik.push('+' + Math.round(teraz() - t0) + ' ' + (el.id || el.name || el.tagName) + ' ' + zdarzenie
        + (o ? ' inH' + o.innerH + '/' + o.oknoWys + ' vv' + Math.round(o.vvWys) + '@' + Math.round(o.vvGora)
          + ' sY' + Math.round(o.powlokaY) + ' rG' + Math.round(o.ramkaGora) : ' bez pomiaru')
        + ' fY' + Math.round(w.scrollY || 0) + ' pole' + Math.round(r.top) + '–' + Math.round(r.bottom)
        + (pas ? ' pas' + Math.round(pas.gora) + '–' + Math.round(pas.dol) + (pas.otwarta ? ' K' : ' k') : '')
        + ' dy' + dy);
      if (dziennik.length > LINIE_DZIENNIKA) dziennik.shift();
      var n = panelDiagnostyki(p, true);
      if (!n) return;
      n.textContent = 'KLAWIATURA v' + VERSION + ' · 5× pasek z nazwą = wyłącz\n' + dziennik.join('\n');
    } catch (e) { /* diagnostyka nie może przeszkodzić w pracy */ }
  }

  /** Przewija ramkę tak, żeby pole stało nad klawiaturą. Zwraca wykonane przesunięcie (px).
   *  tylkoWGore — kontrola po fokusie: wolno tylko podnieść pole spod klawiatury. */
  function dopasuj(el, tylkoWGore, zdarzenie) {
    var o = null;
    var dy;
    try {
      o = pomiar();
      if (!o) return 0;
      var r = el.getBoundingClientRect();
      dy = przesuniecie({ top: r.top, bottom: r.bottom }, pasWidoczny(o));
      // Opuszczenie pola zależy od góry pasa. Przy przesuniętej powłoce wyznacza ją offsetTop
      // visualViewport, a tego na iOS 26 nie sprawdzimy — lepiej zostawić pole, niż zepchnąć je
      // pod klawiaturę.
      if (dy < 0 && (tylkoWGore || o.vvGora > 1 || o.powlokaY > 1)) dy = 0;
      if (dy !== 0) przewin(Math.max(0, (w.scrollY || 0) + dy));
      if (sledzone && sledzone.el === el) sledzone.poz = pozycjaWDokumencie(el);
    } catch (e) {
      if (typeof w.vildaLogSwallowedCatch === 'function') w.vildaLogSwallowedCatch('vilda_klawiatura.js', e, { feature: 'dopasuj' });
      dy = 0;
    }
    if (zdarzenie) zapiszDiagnostyke(zdarzenie, el, o, dy);
    return dy;
  }

  // Kontrola po fokusie: tylko przy otwartej klawiaturze i tylko w górę.
  function kontroluj(s, zdarzenie) {
    if (sledzone !== s || d.activeElement !== s.el) return;
    if (!klawiaturaOtwarta(pomiar())) return;
    dopasuj(s.el, true, zdarzenie);
  }

  function odepnij() {
    var s = sledzone;
    sledzone = null;
    if (!s) return;
    try { s.vv.removeEventListener('resize', s.onResize); } catch (e) { /* powłoka mogła zniknąć */ }
    try { s.vv.removeEventListener('scroll', s.onPrzesuniecie); } catch (e) { /* jw. */ }
    try { s.p.removeEventListener('scroll', s.onPrzesuniecie); } catch (e) { /* jw. */ }
    try { if (s.ro) s.ro.disconnect(); } catch (e) { /* bez znaczenia */ }
    for (var i = 0; i < s.kontrole.length; i += 1) w.clearTimeout(s.kontrole[i]);
    if (s.czasKontroli) w.clearTimeout(s.czasKontroli);
  }

  function zaplanuj(fn) {
    if (zaplanowane) w.clearTimeout(zaplanowane);
    zaplanowane = w.setTimeout(function () { zaplanowane = 0; fn(); }, 60);
  }

  // Na czas fokusu: wysunięcie albo zmiana klawiatury (resize visualViewport powłoki) i zmiana
  // treści NAD polem (pole zmieniło miejsce w dokumencie). Przesunięcie powłoki (scroll) tylko
  // przez 1,5 s po fokusie i tylko jako kontrola w górę: później przewinięcie palcem przy otwartej
  // klawiaturze należy do lekarza i nie wolno go cofać.
  function sledz(el) {
    if (sledzone && sledzone.el === el) return;
    odepnij();
    var p = powloka();
    if (!p) return;
    var t0 = teraz();
    var s = { el: el, p: p, vv: p.visualViewport, ro: null, poz: pozycjaWDokumencie(el), t0: t0, koniecKontroli: t0 + OKNO_KONTROLI_MS, kontrole: [], czasKontroli: 0 };
    s.onResize = function () {
      zaplanuj(function () {
        if (sledzone !== s || d.activeElement !== el) return;
        if (klawiaturaOtwarta(pomiar())) dopasuj(el, false, 'resize');
      });
    };
    s.onPrzesuniecie = function () {
      if (teraz() > s.koniecKontroli) return;
      if (s.czasKontroli) w.clearTimeout(s.czasKontroli);
      s.czasKontroli = w.setTimeout(function () { s.czasKontroli = 0; kontroluj(s, 'przesuniecie'); }, 60);
    };
    s.vv.addEventListener('resize', s.onResize, { passive: true });
    s.vv.addEventListener('scroll', s.onPrzesuniecie, { passive: true });
    p.addEventListener('scroll', s.onPrzesuniecie, { passive: true });
    KONTROLE_MS.forEach(function (ms) {
      s.kontrole.push(w.setTimeout(function () { kontroluj(s, 'kontrola' + ms); }, ms));
    });
    if (typeof w.ResizeObserver === 'function') {
      s.ro = new w.ResizeObserver(function () {
        if (sledzone !== s || d.activeElement !== el) return;
        if (Math.abs(pozycjaWDokumencie(el) - s.poz) > 1) dopasuj(el, false, 'tresc');
      });
      s.ro.observe(d.documentElement);
    }
    sledzone = s;
  }

  function naDotkniecie(e) {
    ostatnieDotkniecie = { el: e.target, t: teraz() };
    // Ostatnia chwila przed fokusem: jeśli żadne pole nie jest aktywne, visualViewport ma pełną wysokość.
    var p = powloka();
    if (p) zmierzPodstawe(p);
  }

  function naFokus(e) {
    var el = e.target;
    if (!otwieraKlawiature(el) || !aktywny() || !wPrzeplywieDokumentu(el)) {
      odepnij();
      return;
    }
    sledz(el);
    if (klawiaturaOtwarta(pomiar()) || niedawnoDotkniete(el)) dopasuj(el, false, 'fokus');
    else zapiszDiagnostyke('fokus-bez-klawiatury', el, pomiar(), 0);
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
    // Słuchacze siedzą na visualViewport i oknie POWŁOKI, więc przy przeładowaniu ramki trzeba je zdjąć.
    w.addEventListener('pagehide', odepnij);
    // Wysokość bazowa od startu ramki: wtedy klawiatura jest schowana.
    var pStart = powloka();
    if (pStart) zmierzPodstawe(pStart);
  }

  w.VildaKlawiatura = {
    VERSION: VERSION,
    pasWidoczny: pasWidoczny,
    przesuniecie: przesuniecie,
    nowaPodstawa: nowaPodstawa,
    aktywny: aktywny,
    dopasuj: dopasuj
  };
})(typeof window !== 'undefined' ? window : globalThis);
