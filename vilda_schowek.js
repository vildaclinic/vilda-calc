/* vilda_schowek.js — JEDNO miejsce, w którym aplikacja pisze tekst do schowka.
 *
 * PO CO TO JEST: zgłoszenie z iOS (2026-09-16). Przycisk „Podsumowanie wyników — kliknij
 * i skopiuj" kopiował treść, ale po wklejeniu w Notatkach i Wiadomościach tekst zamieniał się
 * w łącza. W polu przyjmującym czysty tekst ta sama zawartość wklejała się poprawnie, a inne
 * przyciski aplikacji (np. zalecenia antybiotykoterapii) działały bez zarzutu.
 *
 * DIAGNOZA (druga, po pierwszej BŁĘDNEJ — patrz niżej). Na schowku iOS leżą OBOK SIEBIE różne
 * warianty tej samej treści. `navigator.clipboard.writeText` zapisuje wyłącznie czysty tekst —
 * i dokładnie tak kopiują te przyciski, które działają. `document.execCommand('copy')` z pola
 * oznaczonego `contentEditable` dokłada do tego wariant HTML, a Notatki i Wiadomości wolą wariant
 * bogaty od czystego tekstu. Dlatego wklejały łącza, a pole czystotekstowe pokazywało tekst
 * poprawnie: każda aplikacja brała inny wariant z tego samego schowka.
 *
 * CO BYŁO BŁĘDNE W PIERWSZEJ DIAGNOZIE: przyjąłem, że do schowka nic nie trafia i użytkownik
 * wkleja jego poprzednią zawartość. Obaliło to jedno zdanie właściciela — wkleił skopiowaną
 * treść i była poprawna. Pierwsza wersja tego modułu uruchamiała obie drogi naraz i dokładała
 * `contentEditable`, czyli utrwalała wariant HTML na schowku przy KAŻDYM kopiowaniu. To nie
 * naprawiało błędu, tylko czyniło go powtarzalnym.
 *
 * ZASADA: zapisujemy CZYSTY TEKST i nic poza nim. `navigator.clipboard.writeText` jest drogą
 * pierwszą i jedyną tam, gdzie istnieje — bo tylko ona gwarantuje pojedynczy wariant na schowku.
 * Ścieżka przez `execCommand` zostaje wyłącznie dla przeglądarek bez Clipboard API i kopiuje
 * ze zwykłego pola tekstowego, BEZ `contentEditable`, żeby nie dokładać wariantu HTML.
 *
 * CZEGO TU NIE MA: żadnych powiadomień ani tekstów interfejsu. Moduł zwraca obietnicę i tyle —
 * co pokazać użytkownikowi, decyduje strona wywołująca. Nie rozpoznajemy też przeglądarki.
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

  /* Kopiuje tekst do schowka. Musi być wywołane W GEŚCIE UŻYTKOWNIKA (obsługa kliknięcia).
     Zwraca obietnicę: spełnioną, gdy tekst NAPRAWDĘ trafił do schowka, odrzuconą, gdy nie.

     Kolejność jest tu istotna klinicznie, nie estetycznie. `writeText` kładzie na schowku JEDEN
     wariant — czysty tekst — więc każda aplikacja wkleja to samo. Uruchomienie obok niego
     `execCommand` dokładałoby drugi wariant i to on wygrywałby w Notatkach i Wiadomościach.
     Dlatego droga zapasowa rusza WYŁĄCZNIE wtedy, gdy Clipboard API w ogóle nie ma. */
  function kopiuj(tekst) {
    var t = typeof tekst === 'string' ? tekst : String(tekst == null ? '' : tekst);
    if (!t) return Promise.reject(new Error('Brak tekstu do skopiowania.'));

    var obietnica = asynchronicznie(t);
    if (obietnica && typeof obietnica.then === 'function') {
      return obietnica.then(function () { return { droga: 'clipboard' }; });
    }
    if (kopiujSynchronicznie(t)) return Promise.resolve({ droga: 'execCommand' });
    return Promise.reject(new Error('Przeglądarka nie pozwoliła zapisać do schowka.'));
  }

  root.VildaSchowek = Object.freeze({ wersja: WERSJA, kopiuj: kopiuj });
})(typeof window !== 'undefined' ? window : null);
