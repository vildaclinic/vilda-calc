/* vilda_status_bar.js — stały pasek statusu zapisu.
 *
 * PO CO TO JEST (decyzja właściciela 2026-09-14). Wszystkie komunikaty zapisu — piętnaście
 * różnych zdań — szły dotąd przez `showTooltip()`: dymek przy przycisku, gasnący po 2,5 s
 * i znikający z DOM bez śladu. Trzy wady naraz:
 *   1. kotwica była przypadkowa (dymek przy przycisku w menu, a ekran przewijał się
 *      do brakującego pola — dwie pomocne funkcje pracowały przeciwko sobie);
 *   2. 2,5 s to za mało na zdanie „nie zapisano"; kto odwrócił wzrok, był przekonany,
 *      że zapis się udał;
 *   3. nie było gdzie sprawdzić, co aplikacja przed chwilą powiedziała.
 *
 * GDZIE STOI (decyzja właściciela: „wariant D na desktop i B na telefonie, tylko na
 * index.html"). Dwa miejsca w DOM, o widoczności rozstrzyga CSS na progu 700 px — tym
 * samym, na którym `#calcForm` przechodzi z jednej kolumny na dwie:
 *   szeroko  — prawa kolumna, nad „Podsumowaniem wyników", czyli tam, gdzie aplikacja
 *              i tak już mówi na stałe (`#infoMessages`);
 *   wąsko    — góra formularza, nad polem „Nazwisko", bo przy zwiniętych kolumnach prawa
 *              spada pod cały formularz i byłaby najdalej od miejsca pracy.
 * Treść trafia do OBU; jeden z nich jest w danej chwili niewidoczny. Świadomie nie
 * przenosimy jednego węzła przy zmianie szerokości: przenoszenie gubi stan i bije się
 * z odczytem dla czytników ekranu.
 *
 * CZEGO TU NIE MA: modul nie decyduje, KIEDY coś powiedzieć ani jakim tonem — tylko
 * pokazuje to, co dostanie. Decyzje zostają w kolektorze, przy zapisie.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  var TONY = { ok: 1, uwaga: 1, blad: 1, info: 1, nowy: 1 };
  var ZNAKI = { ok: '✓', uwaga: '●', blad: '✕', info: 'ℹ', nowy: '＋' };
  var ATRYBUT = 'data-vilda-status';

  function dok() {
    try { return w.document || null; } catch (e) { return null; }
  }

  function pojemniki() {
    var d = dok();
    if (!d || typeof d.querySelectorAll !== 'function') return [];
    try {
      return Array.prototype.slice.call(d.querySelectorAll('[' + ATRYBUT + ']'));
    } catch (e) { return []; }
  }

  function dostepny() {
    return pojemniki().length > 0;
  }

  function godzina(kiedy) {
    try {
      var d = kiedy instanceof Date ? kiedy : new Date();
      return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function pusty(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function wskaz(id) {
    var d = dok();
    if (!d || typeof d.getElementById !== 'function') return;
    var pole = d.getElementById(id);
    if (!pole) return;
    try {
      pole.scrollIntoView({
        block: 'center',
        behavior: typeof w.vildaGetMotionAwareScrollBehavior === 'function'
          ? w.vildaGetMotionAwareScrollBehavior() : 'smooth'
      });
    } catch (e) { /* przewijanie niedostepne — zostaje samo ustawienie kursora */ }
    try { pole.focus({ preventScroll: true }); } catch (e) { /* pole nieogniskowalne */ }
  }

  /* Zamiana nazw brakujących pól w tekście na odnośniki. Komunikat mówi CZEGO brakuje,
   * a odnośnik pozwala tam skoczyć — dzięki temu `Bwskaz()` w kolektorze nie musi porywać
   * przewijania w chwili, gdy lekarz patrzy gdzie indziej. Szukamy etykiet PO KOLEI, od
   * miejsca, w którym skończyło się poprzednie dopasowanie, żeby nie podmienić dwa razy
   * tego samego kawałka zdania. */
  function zTekstem(host, tekst, pola) {
    var d = dok();
    if (!d) return;
    var lista = Array.isArray(pola) ? pola : [];
    var reszta = String(tekst == null ? '' : tekst);
    var i = 0;

    for (var n = 0; n < lista.length; n += 1) {
      var poz = lista[n] && lista[n].etykieta ? reszta.indexOf(lista[n].etykieta, i) : -1;
      if (poz < 0) continue;
      if (poz > i) host.appendChild(d.createTextNode(reszta.slice(i, poz)));
      host.appendChild(odnosnik(lista[n]));
      i = poz + lista[n].etykieta.length;
    }
    if (i < reszta.length) host.appendChild(d.createTextNode(reszta.slice(i)));
  }

  function odnosnik(pole) {
    var d = dok();
    var b = d.createElement('button');
    b.type = 'button';
    b.className = 'vilda-status-link';
    b.textContent = pole.etykieta;
    b.addEventListener('click', function () { wskaz(pole.id); });
    return b;
  }

  function zbuduj(host, we) {
    var d = dok();
    if (!d) return;
    pusty(host);
    host.hidden = false;
    host.setAttribute('data-ton', we.ton);

    var znak = d.createElement('span');
    znak.className = 'vilda-status-znak';
    znak.setAttribute('aria-hidden', 'true');
    znak.textContent = ZNAKI[we.ton] || ZNAKI.info;
    host.appendChild(znak);

    var tresc = d.createElement('span');
    tresc.className = 'vilda-status-tresc';

    var linia = d.createElement('span');
    linia.className = 'vilda-status-tekst';
    zTekstem(linia, we.tekst, we.pola);
    tresc.appendChild(linia);

    if (we.czas) {
      var meta = d.createElement('span');
      meta.className = 'vilda-status-meta';
      meta.textContent = we.czas;
      tresc.appendChild(meta);
    }
    host.appendChild(tresc);
  }

  /* Pokazanie komunikatu. Zwraca true, gdy naprawdę było gdzie go pokazać — wołający ma
   * po czym poznać, że NIE musi sięgać po dymek ani po `alert()`. */
  function pokaz(we) {
    var i = we && typeof we === 'object' ? we : {};
    var tekst = i.tekst == null ? '' : String(i.tekst);
    if (!tekst.trim()) return false;
    var lista = pojemniki();
    if (!lista.length) return false;

    var dane = {
      tekst: tekst,
      ton: Object.prototype.hasOwnProperty.call(TONY, i.ton) ? i.ton : 'info',
      pola: Array.isArray(i.pola) ? i.pola : [],
      czas: i.bezCzasu === true ? '' : godzina(i.kiedy)
    };

    var pokazane = 0;
    for (var n = 0; n < lista.length; n += 1) {
      try { zbuduj(lista[n], dane); pokazane += 1; } catch (e) { /* jeden host padl — probujemy dalej */ }
    }
    return pokazane > 0;
  }

  function wyczysc() {
    var lista = pojemniki();
    for (var n = 0; n < lista.length; n += 1) {
      try {
        pusty(lista[n]);
        lista[n].hidden = true;
        lista[n].removeAttribute('data-ton');
      } catch (e) { /* jak wyzej */ }
    }
  }

  function podepnij() {
    var d = dok();
    if (!d || typeof w.addEventListener !== 'function') return;
    // Wylogowanie i „Wyczyść wszystkie pola" kasują stan formularza — komunikat sprzed
    // tej chwili przestaje być prawdziwy, więc znika razem z nim.
    w.addEventListener('vilda:user-state-cleared', wyczysc);
  }

  podepnij();

  w.VildaStatusBar = {
    VERSION: VERSION,
    ATRYBUT: ATRYBUT,
    TONY: TONY,
    ZNAKI: ZNAKI,
    dostepny: dostepny,
    pokaz: pokaz,
    wyczysc: wyczysc,
    _zTekstem: zTekstem,
    _godzina: godzina
  };
}(typeof window !== 'undefined' ? window : this));
