/* vilda_schowek.js — JEDNO miejsce, w którym aplikacja pisze tekst do schowka.
 *
 * PO CO TO JEST: zgłoszenie z iOS (2026-09-16). Przycisk „Podsumowanie wyników — kliknij
 * i skopiuj" meldował sukces, ale po wklejeniu w Wiadomościach pojawiał się bezsensowny ciąg
 * znaków, a w Notatkach — łącze. Na komputerze to samo kopiowanie działało poprawnie.
 *
 * DIAGNOZA: do schowka NIC nie trafiało, a użytkownik wklejał jego poprzednią zawartość.
 * Notatki zamieniają wklejony adres w łącze, Wiadomości pokazują go surowo — stąd dwa różne
 * objawy z jednej przyczyny. Stara ścieżka kopiowania łamała cztery reguły WebKita naraz:
 *
 *   1. Pole `readonly` BEZ `contentEditable` — na iOS `select()` nie ustawia wtedy zaznaczenia,
 *      więc `execCommand('copy')` nie ma czego kopiować.
 *   2. Pole odsunięte na `left:-9999px` — elementu poza widokiem iOS nie zaznaczy.
 *   3. Kopiowanie zapasowe uruchamiane w `.catch()` obietnicy — czyli JUŻ POZA gestem
 *      użytkownika, a iOS pozwala pisać do schowka wyłącznie w geście.
 *   4. Ufanie wartości zwróconej przez `execCommand('copy')` — WebKit potrafi zwrócić `true`,
 *      nie kopiując niczego. To dlatego przycisk pokazywał „skopiowane", a schowek zostawał stary.
 *
 * ZASADA: obie drogi zapisu uruchamiamy W TYM SAMYM GEŚCIE użytkownika — synchroniczną
 * (`execCommand`) i asynchroniczną (`navigator.clipboard`) — a sukces POTWIERDZAMY pomiarem
 * (czy nasz tekst jest naprawdę zaznaczony), zamiast wierzyć przeglądarce na słowo. Nie da się
 * stąd rozstrzygnąć, która z dróg zawodzi na konkretnym iPhonie, a odpalenie drugiej dopiero
 * po porażce pierwszej jest niemożliwe: byłoby już poza gestem. Wystarczy, że zadziała
 * którakolwiek; ten sam tekst zapisany dwa razy nikomu nie szkodzi.
 *
 * CZEGO TU NIE MA: żadnych powiadomień ani tekstów interfejsu. Moduł zwraca obietnicę i tyle —
 * co pokazać użytkownikowi, decyduje strona wywołująca. Nie rozpoznajemy też przeglądarki:
 * kolejność prób jest poprawna wszędzie, więc nie ma czego zgadywać po `userAgent`.
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
    /* `readOnly` trzyma klawiaturę ekranową z daleka, `contentEditable` pozwala iOS mimo to
       zaznaczyć zawartość. Dopiero OBA naraz dają na iPhonie działające kopiowanie. */
    pole.readOnly = true;
    pole.contentEditable = 'true';
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

  /* Kopiuje tekst do schowka. Musi być wywołane W GEŚCIE UŻYTKOWNIKA (obsługa kliknięcia),
     inaczej iOS odmówi i żadna z dróg nie zadziała. Zwraca obietnicę: spełnioną, gdy tekst
     NAPRAWDĘ trafił do schowka, odrzuconą, gdy nie — nigdy „pewnie się udało".

     Dlaczego OBIE drogi, a nie jedna po drugiej: nie da się stąd sprawdzić, która z nich
     zawodzi na iOS — `navigator.clipboard.writeText` bywa tam odrzucane (wygasły gest przy
     wolnym budowaniu tekstu), a ścieżka zapasowa i tak nie zadziała później, bo `.catch()`
     obietnicy wykonuje się już poza gestem. Uruchomienie obu W TYM SAMYM geście usuwa ten
     wybór: wystarczy, że zadziała którakolwiek. Zapis tego samego tekstu dwa razy jest
     nieszkodliwy, a rozpoznawanie przeglądarki po `userAgent` byłoby zgadywaniem. */
  function kopiuj(tekst) {
    var t = typeof tekst === 'string' ? tekst : String(tekst == null ? '' : tekst);
    if (!t) return Promise.reject(new Error('Brak tekstu do skopiowania.'));

    var synchroniczna = kopiujSynchronicznie(t);
    var obietnica = asynchronicznie(t);

    if (obietnica && typeof obietnica.then === 'function') {
      return obietnica.then(
        function () { return { droga: synchroniczna ? 'obie' : 'clipboard' }; },
        function (blad) {
          if (synchroniczna) return { droga: 'execCommand' };
          throw blad instanceof Error ? blad : new Error('Przeglądarka odmówiła zapisu do schowka.');
        }
      );
    }
    if (synchroniczna) return Promise.resolve({ droga: 'execCommand' });
    return Promise.reject(new Error('Przeglądarka nie pozwoliła zapisać do schowka.'));
  }

  root.VildaSchowek = Object.freeze({ wersja: WERSJA, kopiuj: kopiuj });
})(typeof window !== 'undefined' ? window : null);
