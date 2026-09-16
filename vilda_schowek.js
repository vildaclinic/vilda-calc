/* vilda_schowek.js — JEDNO miejsce, w którym aplikacja pisze tekst do schowka.
 *
 * PO CO TO JEST: zgłoszenie z iOS (2026-09-16). Treść skopiowana przyciskiem „Podsumowanie
 * wyników" wklejała się w Notatkach i Wiadomościach jako JEDNO ŁĄCZE obejmujące cały blok.
 * W polu przyjmującym czysty tekst ta sama zawartość wklejała się poprawnie, a inne przyciski
 * aplikacji (np. zalecenia antybiotykoterapii) działały bez zarzutu.
 *
 * PRZYCZYNA — POTWIERDZONA NA URZĄDZENIU (właściciel przytrzymał łącze: pokazywało adres
 * zaczynający się od „waga:"). Podsumowanie zaczyna się od wiersza „Waga: 63,4 kg…", a człon
 * „Waga:" ma dokładnie kształt SCHEMATU ADRESU — litera, potem litery/cyfry, potem dwukropek,
 * jak „mailto:" czy „tel:". WebKit, kładąc tekst na schowku, dokłada wariant „adres", gdy tekst
 * daje się przeczytać jako URL; Notatki wolą ten wariant i renderują CAŁOŚĆ jako jedno łącze.
 * Zalecenia antybiotykoterapii zaczynają się od nazwy leku i myślnika („Augmentin – lek
 * podajemy…"), więc nie dają się tak przeczytać — i dlatego tam problemu nie było.
 *
 * DWIE WCZEŚNIEJSZE PRÓBY BYŁY CHYBIONE, bo szukały winy w SPOSOBIE kopiowania:
 *   1.0.974 — założyłem, że do schowka nic nie trafia i użytkownik wkleja poprzednią zawartość.
 *             Obaliło to jedno zdanie właściciela: wkleił treść i była poprawna. Ta wersja
 *             dokładała na schowek wariant HTML (execCommand z pola `contentEditable`), czyli
 *             pogarszała sprawę zamiast ją naprawiać.
 *   1.0.975 — sprowadziłem zapis do samego `writeText` (jeden wariant, czysty tekst). Słuszne
 *             samo w sobie, ale objawu nie usunęło: wariant „adres" bierze się z TREŚCI, nie
 *             z drogi zapisu.
 * Zapis obu ślepych zaułków zostaje tutaj celowo — kosztowały dwa wydania i są najlepszym
 * ostrzeżeniem przed naprawianiem bez odtworzenia objawu.
 *
 * ZASADA: na schowek idzie JEDEN wariant — czysty tekst (`navigator.clipboard.writeText`) —
 * a tekst nie może zaczynać się czymś, co przeglądarka przeczyta jako adres. Pilnuje tego
 * `bezSchematuNaPoczatku()`.
 *
 * CZEGO TU NIE MA: żadnych powiadomień ani tekstów interfejsu. Moduł zwraca obietnicę i tyle.
 */
(function (root) {
  'use strict';
  if (!root) return;
  var WERSJA = 1;

  function dokument() {
    try { return root.document || null; } catch (e) { return null; }
  }

  /* Zapamiętuje i przywraca zaznaczenie użytkownika — kopiowanie nie może mu zabrać tego,
     co sam zaznaczył na stronie. */
  function zapiszZaznaczenie() {
    try {
      var s = root.getSelection ? root.getSelection() : null;
      if (!s || !s.rangeCount) return null;
      var zakresy = [];
      for (var i = 0; i < s.rangeCount; i += 1) zakresy.push(s.getRangeAt(i));
      return zakresy;
    } catch (e) { return null; }
  }

  function przywrocZaznaczenie(zakresy) {
    try {
      var s = root.getSelection ? root.getSelection() : null;
      if (!s) return;
      s.removeAllRanges();
      if (zakresy) for (var i = 0; i < zakresy.length; i += 1) s.addRange(zakresy[i]);
    } catch (e) { /* zaznaczenia nie da się przywrócić — to nie powód, by psuć kopiowanie */ }
  }

  /* Synchroniczna ścieżka kopiowania — jedyna, która działa na iOS.
     Zwraca true TYLKO wtedy, gdy nasz tekst był faktycznie zaznaczony w polu. */
  function kopiujSynchronicznie(tekst) {
    var doc = dokument();
    if (!doc || !doc.body || typeof doc.execCommand !== 'function') return false;

    var pole = doc.createElement('textarea');
    pole.value = tekst;
    /* BEZ `contentEditable`: to ono kazało WebKitowi potraktować zaznaczenie jak treść bogatą
       i dołożyć na schowek wariant HTML, przez który Notatki wklejały łącza zamiast tekstu.
       Zwykłe pole tekstowe kopiuje czysty tekst — i tylko o to nam chodzi. */
    pole.readOnly = true;
    pole.setAttribute('aria-hidden', 'true');
    pole.setAttribute('tabindex', '-1');
    /* Pole musi stać w widoku (iOS nie zaznaczy elementu odsuniętego poza ekran), więc jest
       przezroczyste i wielkości piksela. `font-size:16px` powstrzymuje iOS przed przybliżeniem
       strony przy ustawieniu fokusu. */
    pole.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;margin:0;padding:0;'
      + 'border:0;outline:0;box-shadow:none;opacity:0;font-size:16px;z-index:-1;';
    doc.body.appendChild(pole);

    var poprzednieZaznaczenie = zapiszZaznaczenie();
    var poprzedniFokus = doc.activeElement;
    var udane;

    try {
      pole.focus({ preventScroll: true });
      pole.setSelectionRange(0, tekst.length);
      /* POMIAR zamiast zaufania: jeśli nie udało się zaznaczyć własnego tekstu, to kopiowanie
         na pewno go nie wzięło — bez tej kontroli przycisk meldował sukces przy pustym strzale. */
      var zaznaczono = typeof pole.selectionStart === 'number' && typeof pole.selectionEnd === 'number'
        ? pole.selectionEnd - pole.selectionStart : 0;
      var polecenie = false;
      try { polecenie = doc.execCommand('copy'); } catch (e) { polecenie = false; }
      udane = polecenie === true && zaznaczono === tekst.length && tekst.length > 0;
    } catch (e) {
      udane = false;
    }

    try { pole.parentNode && pole.parentNode.removeChild(pole); } catch (e) { /* już usunięte */ }
    przywrocZaznaczenie(poprzednieZaznaczenie);
    try {
      if (poprzedniFokus && typeof poprzedniFokus.focus === 'function' && poprzedniFokus !== doc.body) {
        poprzedniFokus.focus({ preventScroll: true });
      }
    } catch (e) { /* fokusu nie da się przywrócić — bez wpływu na wynik kopiowania */ }

    return udane;
  }

  function asynchronicznie(tekst) {
    try {
      var n = root.navigator;
      if (n && n.clipboard && typeof n.clipboard.writeText === 'function') {
        return n.clipboard.writeText(tekst);
      }
    } catch (e) { /* brak API schowka — zostaje odmowa poniżej */ }
    return null;
  }

  /* Łącznik wyrazów U+2060: zero szerokości, nic nie widać po wklejeniu, a NIE jest znakiem
     odstępu — więc nie zostanie obcięty tak, jak spacja czy znak nowej linii (standard adresów
     każe obciąć wiodące odstępy przed próbą odczytania adresu, więc pusta linia by nie pomogła).
     Dzięki niemu tekst przestaje zaczynać się od czegoś o kształcie „schemat:", a treść, format
     wierszy i liczby zostają nietknięte. */
  var LACZNIK = '\u2060';
  var SCHEMAT = /^[A-Za-z][A-Za-z0-9+.-]*:/;

  /* Dokłada łącznik TYLKO wtedy, gdy tekst faktycznie zaczyna się jak adres. Gdyby kiedyś
     pierwszy wiersz przestał być etykietą z dwukropkiem, do schowka nie trafi żaden dodatkowy
     znak — zabezpieczenie znika samo, zamiast zostać na zawsze. */
  function bezSchematuNaPoczatku(tekst) {
    return SCHEMAT.test(tekst) ? LACZNIK + tekst : tekst;
  }

  /* Kopiuje tekst do schowka. Musi być wywołane W GEŚCIE UŻYTKOWNIKA (obsługa kliknięcia).
     Zwraca obietnicę: spełnioną, gdy tekst NAPRAWDĘ trafił do schowka, odrzuconą, gdy nie.

     Kolejność jest tu istotna klinicznie, nie estetycznie. `writeText` kładzie na schowku JEDEN
     wariant — czysty tekst — więc każda aplikacja wkleja to samo. Uruchomienie obok niego
     `execCommand` dokładałoby drugi wariant i to on wygrywałby w Notatkach i Wiadomościach.
     Dlatego droga zapasowa rusza WYŁĄCZNIE wtedy, gdy Clipboard API w ogóle nie ma. */
  function kopiuj(tekst) {
    var t = typeof tekst === 'string' ? tekst : String(tekst == null ? '' : tekst);
    if (!t) return Promise.reject(new Error('Brak tekstu do skopiowania.'));

    t = bezSchematuNaPoczatku(t);

    var obietnica = asynchronicznie(t);
    if (obietnica && typeof obietnica.then === 'function') {
      return obietnica.then(function () { return { droga: 'clipboard' }; });
    }
    if (kopiujSynchronicznie(t)) return Promise.resolve({ droga: 'execCommand' });
    return Promise.reject(new Error('Przeglądarka nie pozwoliła zapisać do schowka.'));
  }

  root.VildaSchowek = Object.freeze({ wersja: WERSJA, kopiuj: kopiuj });
})(typeof window !== 'undefined' ? window : null);
