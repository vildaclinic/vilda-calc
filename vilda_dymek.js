/* vilda_dymek.js — JEDNO miejsce, w którym aplikacja pokazuje krótki dymek (toast) na dole ekranu.
 *
 * PO CO TO JEST: zgłoszenie właściciela (2026-09-17). W trybie mobilnym i tabletowym dymki
 * potwierdzeń („Dane zostały skopiowane do schowka" i podobne) wyskakiwały POD dolnym dockiem
 * nawigacji albo pod strzałką „na górę" i nie było widać ich treści. Do 1.0.976 w kodzie było
 * dwanaście osobnych dymków, każdy ze swoim `position:fixed; bottom:1rem` w stylach inline —
 * żaden nie wiedział, że na dole ekranu stoi dock.
 *
 * ZASADA: dymek NIE ZNA geometrii dołu ekranu i nie ma jej znać. Pozycję dostaje wyłącznie
 * z klasy `.vilda-dymek` w style.css, a ta liczy `bottom` ze zmiennej `--vilda-dol-wolny`,
 * którą publikuje właściciel docka w danym trybie:
 *   - strony ładowane wprost  → ios26-ui.js (dock + strzałka #scrollTopBtn),
 *   - powłoka app.html z ramkami → vilda_shell.js (dock powłoki + przycisk „na górę" / „+"),
 *     przekazywana do każdej ramki.
 * Bez tej zmiennej (komputer, brak docka) CSS spada na `env(safe-area-inset-bottom)` i dymek
 * stoi tam, gdzie stał dotąd.
 *
 * CZEGO TU NIE MA: żadnego `style.bottom`, `style.zIndex` ani pomiaru docka. Gdyby ktoś je tu
 * dopisał, wróciłby dokładnie ten błąd, dla którego moduł powstał — strażnik tego pilnuje.
 */
(function (root) {
  'use strict';
  if (!root) return;
  var WERSJA = 1;
  var ID = 'vildaDymek';
  var TONY = { ok: 'vilda-dymek--ok', blad: 'vilda-dymek--blad', info: 'vilda-dymek--info' };
  var POZYCJE = { srodek: '', prawo: 'vilda-dymek--prawo' };
  var zegar = 0;

  function dokument() {
    try { return root.document || null; } catch (e) { return null; }
  }

  /* Chowa bieżący dymek. Jeden dymek naraz: nowy zastępuje poprzedni, zamiast układać się
     z nim w stos — dotąd każdy moduł miał własny identyfikator i po dwóch kliknięciach na dole
     ekranu leżały dwa nachodzące na siebie komunikaty. */
  function schowaj() {
    var doc = dokument();
    if (zegar) { try { root.clearTimeout(zegar); } catch (e) { /* zegar już nie istnieje */ } zegar = 0; }
    if (!doc) return;
    var stary = doc.getElementById(ID);
    if (stary && stary.parentNode) stary.parentNode.removeChild(stary);
  }

  /* Pokazuje dymek z tekstem. Opcje:
       ton:  'ok' (domyślnie, turkusowy) | 'blad' (biała karta z czerwoną krawędzią) | 'info'
       czas: ms do zniknięcia (domyślnie 2500); 0 — zostaje, aż ktoś wywoła schowaj()
       poz:  'srodek' (domyślnie) | 'prawo' (prawy dolny róg — komunikaty techniczne)
     Zwraca element albo null, gdy nie ma dokumentu. */
  function pokaz(tekst, opcje) {
    var doc = dokument();
    if (!doc || !doc.body) return null;
    var o = opcje || {};
    schowaj();
    var el = doc.createElement('div');
    el.id = ID;
    el.className = 'vilda-dymek ' + (TONY[o.ton] || TONY.ok) + (POZYCJE[o.poz] ? ' ' + POZYCJE[o.poz] : '');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = typeof tekst === 'string' ? tekst : String(tekst == null ? '' : tekst);
    doc.body.appendChild(el);
    var czas = typeof o.czas === 'number' && isFinite(o.czas) ? o.czas : 2500;
    if (czas > 0) {
      zegar = root.setTimeout(function () {
        zegar = 0;
        try { el.parentNode && el.parentNode.removeChild(el); } catch (e) { /* już zdjęty */ }
      }, czas);
    }
    return el;
  }

  root.VildaDymek = Object.freeze({ wersja: WERSJA, pokaz: pokaz, schowaj: schowaj, ID: ID });
})(typeof window !== 'undefined' ? window : null);
