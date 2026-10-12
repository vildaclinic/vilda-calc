/* vilda_nowe_urzadzenie.js — pytanie „Pobierz dane z serwera” na nowym urządzeniu.
 *
 * PO CO (P-NOWE-URZADZENIE, decyzja właściciela 2026-10-12, etap 1). Po zalogowaniu na urządzeniu,
 * które nie synchronizowało jeszcze tego konta, a w chmurze są jego dane, vilda_sync_integration.js
 * zgłasza zdarzenie `vilda:new-device-restore-available`. Okno pytania było dotąd wbudowane tylko
 * w index.html (inline_index_10.js), więc:
 *   1. w powłoce app.html (adres startowy PWA) i na pozostałych stronach z logowaniem nikt zdarzenia
 *      nie słuchał — pytanie nie pokazywało się wcale, a synchronizacja zostawała wyłączona;
 *   2. znacznik „pytanie pokazane” stawiała integracja w chwili pokazania, więc przeładowanie karty
 *      (baner aktualizacji, F5, aktualizacja w innej karcie) gubiło pytanie bez słowa.
 * Teraz okno buduje ten moduł na każdej stronie najwyższego poziomu, która ładuje integrację,
 * a znacznik odpowiedzi stawia dopiero odpowiedź użytkownika. Dopóki pytanie czeka, każde
 * odblokowanie sejfu sonduje serwer od nowa, więc po przeładowaniu pytanie wraca.
 *
 * CZEGO TU NIE MA: decyzji, czy urządzenie jest nowe (sonda w vilda_sync.js), ani samej
 * synchronizacji (VildaSync.syncFull). Treść, identyfikatory i wygląd okna są takie jak w index.html
 * przed zmianą; style są w vilda_auth_ui.css (arkusz jest na każdej stronie z logowaniem).
 *
 * index.html ma okno w znacznikach (ukryte), a moduł tylko podpina do niego przyciski. Element musi tam
 * zostać: vilda_chrome.js (he) traktuje każdy [aria-modal="true"] w dokumencie jako otwarte okno, więc
 * strona główna jak dotąd nie ma przejść widoku między stronami ani gestu przesuwania stron. Na pozostałych
 * stronach okno powstaje dopiero przy pytaniu, więc przejścia działają tam jak dotąd.
 *
 * Bramka banera aktualizacji (ios26-ui.js) pyta `VildaNoweUrzadzenie.czyAktywne()`: baner nie
 * pojawia się, dopóki okno jest otwarte albo trwa pobieranie uruchomione z okna.
 */
(function (w) {
  "use strict";

  if (!w || (w.VildaNoweUrzadzenie && w.VildaNoweUrzadzenie.__vildaNoweUrzadzenie)) return;

  var WERSJA = "1";
  var ZDARZENIE = "vilda:new-device-restore-available";
  // Ten sam klucz czyta vilda_sync_integration.js: odpowiedź w tej karcie — bez ponownego pytania.
  var KLUCZ_ODPOWIEDZI = "vilda-new-device-restore-shown-v1";
  var ID_OKNA = "vilda-restore-overlay";
  var KLASA_OTWARTE = "is-open";
  var TEKST_POBIERZ = "Pobierz dane z serwera";
  var TEKST_POBIERANIE = "Pobieranie…";

  var okno = null;
  var otwarte = false;
  var pobieranie = false;
  var czekajNaDom = null;

  function dok() {
    try {
      return w.document || null;
    } catch (e) {
      return null;
    }
  }

  // Ramka panelu powłoki (?embedded=1) nigdy nie dostaje zdarzenia — sonduje tylko dokument
  // najwyższego poziomu. Okno w ramce zakryłoby zresztą tylko panel, nie całą aplikację.
  function osadzony() {
    try {
      var html = dok() && dok().documentElement;
      if (html && html.classList && html.classList.contains("vilda-embedded")) return true;
    } catch (e) {
      /* pomiń */
    }
    try {
      return w.self !== w.top;
    } catch (e) {
      return true;
    }
  }

  function element(tag, klasa, tekst) {
    var el = dok().createElement(tag);
    if (klasa) el.className = klasa;
    if (tekst != null) el.textContent = tekst;
    return el;
  }

  // Przyciski podpinamy raz na element: okno budowane tutaj albo gotowe w index.html.
  var podpiete = typeof WeakSet === "function" ? new WeakSet() : null;
  function podepnijPrzyciski(o) {
    if (!o || (podpiete && podpiete.has(o))) return;
    if (podpiete) podpiete.add(o);
    var pobierz = o.querySelector("#vilda-restore-btn");
    var pomin = o.querySelector("#vilda-restore-skip");
    if (pobierz) pobierz.addEventListener("click", naPobierz);
    if (pomin) pomin.addEventListener("click", naPomin);
  }

  function zbuduj() {
    var d = dok();
    if (!d || !d.body) return null;
    var juz = d.getElementById(ID_OKNA);
    if (juz) {
      // index.html ma okno w znacznikach (ukryte, jak dotąd — zob. komentarz w index.html).
      podepnijPrzyciski(juz);
      okno = juz;
      return juz;
    }

    var o = element("div", "vilda-restore-overlay");
    o.id = ID_OKNA;
    o.setAttribute("role", "dialog");
    o.setAttribute("aria-modal", "true");
    o.setAttribute("aria-labelledby", "vilda-restore-title");

    var panel = element("div", "vilda-restore-panel");
    var ikona = element("div", "vilda-restore-ikona", "☁️");
    ikona.setAttribute("aria-hidden", "true");
    var tytul = element("h2", "vilda-restore-tytul", "Znaleziono Twoje dane na serwerze");
    tytul.id = "vilda-restore-title";
    var etykieta = element("p", "vilda-restore-etykieta", "Ostatnia synchronizacja:");
    var data = element("p", "vilda-restore-data", "…");
    data.id = "vilda-restore-date";
    var opis = element(
      "p",
      "vilda-restore-opis",
      "Serwer przechowuje wyłącznie zaszyfrowane dane — tylko Ty, znając hasło, możesz je odczytać."
    );
    var pobierz = element("button", "vilda-restore-pobierz", TEKST_POBIERZ);
    pobierz.id = "vilda-restore-btn";
    pobierz.type = "button";
    var pomin = element("button", "vilda-restore-pomin", "Zacznij od nowa (nie pobieraj)");
    pomin.id = "vilda-restore-skip";
    pomin.type = "button";

    panel.appendChild(ikona);
    panel.appendChild(tytul);
    panel.appendChild(etykieta);
    panel.appendChild(data);
    panel.appendChild(opis);
    panel.appendChild(pobierz);
    panel.appendChild(pomin);
    o.appendChild(panel);
    d.body.appendChild(o);
    podepnijPrzyciski(o);
    okno = o;
    return o;
  }

  function sformatujDate(iso) {
    if (!iso) return "—";
    try {
      var data = new Date(iso);
      if (isNaN(data.getTime())) return "—";
      return data.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
    } catch (e) {
      return "—";
    }
  }

  function przyciski() {
    var d = dok();
    return {
      pobierz: d && d.getElementById("vilda-restore-btn"),
      pomin: d && d.getElementById("vilda-restore-skip"),
    };
  }

  function ustawZajetosc(zajety) {
    var p = przyciski();
    if (p.pobierz) {
      p.pobierz.disabled = !!zajety;
      p.pobierz.textContent = zajety ? TEKST_POBIERANIE : TEKST_POBIERZ;
      if (zajety) p.pobierz.setAttribute("aria-busy", "true");
      else p.pobierz.removeAttribute("aria-busy");
    }
    if (p.pomin) p.pomin.disabled = !!zajety;
  }

  function pokaz(szczegoly) {
    var o = zbuduj();
    if (!o) {
      // Zdarzenie przed zbudowaniem DOM (w praktyce nie występuje: integracja czeka ≥ 600 ms
      // po odblokowaniu) — pokaż po DOMContentLoaded.
      var d = dok();
      if (d && !czekajNaDom) {
        czekajNaDom = function () {
          czekajNaDom = null;
          pokaz(szczegoly);
        };
        d.addEventListener("DOMContentLoaded", czekajNaDom, { once: true });
      }
      return;
    }
    var data = dok().getElementById("vilda-restore-date");
    if (data) data.textContent = sformatujDate(szczegoly && szczegoly.lastModified);
    if (!pobieranie) ustawZajetosc(false);
    o.classList.add(KLASA_OTWARTE);
    otwarte = true;
  }

  function ukryj() {
    var d = dok();
    var o = okno || (d && d.getElementById(ID_OKNA));
    if (o) o.classList.remove(KLASA_OTWARTE);
    otwarte = false;
  }

  function oznaczOdpowiedz() {
    try {
      if (w.sessionStorage) w.sessionStorage.setItem(KLUCZ_ODPOWIEDZI, "1");
    } catch (e) {
      /* pomiń — bez sessionStorage pytanie wróci przy następnym odblokowaniu */
    }
  }

  function naPobierz() {
    if (pobieranie) return;
    pobieranie = true;
    // Odpowiedź PRZED pobraniem: przeładowanie w trakcie wraca do pobierania (integracja widzi
    // odpowiedź i włączoną synchronizację), a nie do pytania.
    oznaczOdpowiedz();
    ustawZajetosc(true);
    var integracja = w.VildaSyncIntegration;
    try {
      if (
        integracja &&
        typeof integracja.setSyncEnabled === "function" &&
        !(typeof integracja.isSyncEnabled === "function" && integracja.isSyncEnabled())
      ) {
        integracja.setSyncEnabled(true);
      }
    } catch (e) {
      /* pomiń */
    }
    var sync = w.VildaSync;
    var zadanie;
    try {
      zadanie = sync && typeof sync.syncFull === "function" ? sync.syncFull() : null;
    } catch (e) {
      zadanie = null;
    }
    function koniec() {
      pobieranie = false;
      ukryj();
      ustawZajetosc(false);
    }
    Promise.resolve(zadanie).then(koniec, koniec);
  }

  function naPomin() {
    if (pobieranie) return;
    oznaczOdpowiedz();
    ukryj();
  }

  var zarejestrowanoBlokade = false;
  function podepnijBlokade() {
    if (zarejestrowanoBlokade) return true;
    var sejf = w.VildaVault;
    if (!sejf || typeof sejf.onLock !== "function") return false;
    zarejestrowanoBlokade = true;
    // Blokada sejfu (wylogowanie, bezczynność): okno znika bez odpowiedzi — po ponownym
    // zalogowaniu integracja zapyta znowu.
    sejf.onLock(function () {
      ukryj();
    });
    return true;
  }

  function start() {
    var d = dok();
    if (!d || typeof d.addEventListener !== "function") return;
    d.addEventListener(ZDARZENIE, function (e) {
      pokaz((e && e.detail) || {});
    });
    if (!podepnijBlokade()) {
      var proby = 0;
      var zegar = w.setInterval(function () {
        proby += 1;
        if (podepnijBlokade() || proby >= 30) w.clearInterval(zegar);
      }, 100);
    }
  }

  var aktywny = !osadzony();
  if (aktywny) start();

  w.VildaNoweUrzadzenie = Object.freeze({
    __vildaNoweUrzadzenie: true,
    wersja: WERSJA,
    /** Okno pytania otwarte albo trwa pobieranie uruchomione z okna (bramka banera aktualizacji). */
    czyAktywne: function () {
      return aktywny && (otwarte || pobieranie);
    },
  });
})(typeof window !== "undefined" ? window : null);
