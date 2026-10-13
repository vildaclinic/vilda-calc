/* vilda_nowe_urzadzenie.js — pierwsze pobranie danych z serwera na nowym urządzeniu.
 *
 * ETAP 1 (P-NOWE-URZADZENIE, decyzja właściciela 2026-10-12). Po zalogowaniu na urządzeniu, które nie
 * synchronizowało jeszcze tego konta, a w chmurze są jego dane, vilda_sync_integration.js zgłasza zdarzenie
 * `vilda:new-device-restore-available`. Okno pytania „Pobierz dane z serwera” było dotąd wbudowane tylko
 * w index.html, więc w powłoce app.html (adres startowy PWA) nie pokazywało się wcale, a znacznik „pytanie
 * pokazane” stawiany w chwili pokazania sprawiał, że przeładowanie karty (baner aktualizacji, F5) gubiło
 * pytanie bez słowa. Okno buduje ten moduł na każdej stronie najwyższego poziomu, która ładuje integrację,
 * a znacznik odpowiedzi stawia dopiero odpowiedź użytkownika.
 *
 * ETAP 2 (decyzja właściciela 2026-10-12, makieta zaakceptowana 2026-10-13). Na „Komputerze prywatnym”
 * (sejf lokalny: nie chmurowy i nie efemeryczny) aplikacja nie pyta, tylko od razu pobiera dane: okno na
 * całym ekranie z krokami Pobieranie → Odszyfrowanie → Pacjenci i paskiem postępu, potem „Gotowe” (czeka na
 * „Przejdź do aplikacji”) albo „Nie udało się pobrać danych” z „Spróbuj ponownie” i „Pobierz później”.
 * Pobieranie włącza synchronizację na tym urządzeniu (jak „Pobierz dane z serwera” w etapie 1) i blokuje
 * aplikację, żeby nie powstał pacjent, który za chwilę przyjdzie z serwera jako duplikat. Rezygnacja nie jest
 * przyciskiem w oknie: wybór „Komputera prywatnego” oznacza pełną kopię na dysku, a synchronizację wyłącza się
 * w Ustawieniach. Po „Pobierz później” na dole ekranu zostaje przypomnienie bez przycisku zamknięcia; znika po
 * pobraniu (także pobraniu w tle przez integrację) albo po wyłączeniu synchronizacji w Ustawieniach.
 *
 * Znacznik „pierwsze pobranie w toku” (localStorage, osobno dla każdego konta) powstaje przed pierwszym
 * zapytaniem i znika po udanym pobraniu albo po celowym wyłączeniu synchronizacji. Dopóki jest, start
 * synchronizacji po odblokowaniu (vilda_sync_integration.js) oddaje sterowanie temu modułowi (przejmujeStart),
 * więc przeładowanie w trakcie i następne logowanie wznawiają pobieranie z oknem — sonda by tego nie wykryła,
 * bo slot jest rejestrowany przed pobraniem bloba. „Pobierz później” pamięta tylko ta karta (sessionStorage):
 * przeładowanie pokazuje przypomnienie, a nowe logowanie (blokada sejfu czyści wybór) znowu pobiera.
 *
 * Pytanie z etapu 1 zostaje tam, gdzie decyzja należy do użytkownika: „Obcy komputer” (bez zmian), urządzenie,
 * na którym synchronizację celowo wyłączono w Ustawieniach (vilda-sync-enabled-v1 = "false"), i przeglądarka
 * z innymi kontami (przełącznik synchronizacji jest dziś jeden dla przeglądarki; flaga per konto to etap 3).
 * „Pobierz dane z serwera” na „Komputerze prywatnym” prowadzi dalej do okna pobierania. „Komputer w pracy” ma
 * własne okno pobierania (vilda_chrome.js) i tu nie trafia.
 *
 * CZEGO TU NIE MA: decyzji, czy urządzenie jest nowe (sonda w vilda_sync.js), samej synchronizacji ani
 * scalania. Postęp przychodzi zdarzeniami vilda:sync-download-progress (vilda_sync.js) i
 * vilda:vault-merge-progress (sejf); pobranie idzie przez VildaSyncIntegration.pullForNewDevice, żeby
 * integracja nie pobierała równolegle w tle. Style są w vilda_auth_ui.css (arkusz jest na każdej stronie
 * z logowaniem).
 *
 * index.html ma okno w znacznikach (ukryte), a moduł wypełnia jego panel. Element musi tam zostać:
 * vilda_chrome.js (he) traktuje każdy [aria-modal="true"] w dokumencie jako otwarte okno, więc strona główna
 * jak dotąd nie ma przejść widoku między stronami ani gestu przesuwania stron. Na pozostałych stronach okno
 * powstaje dopiero przy pokazaniu i znika z dokumentu po zamknięciu, więc przejścia działają tam jak dotąd.
 *
 * Bramka banera aktualizacji (ios26-ui.js) pyta `VildaNoweUrzadzenie.czyAktywne()`: baner nie pojawia się,
 * dopóki okno jest otwarte albo trwa pobieranie uruchomione z okna. Przypomnienie banera nie wstrzymuje.
 */
(function (w) {
  "use strict";

  if (!w || (w.VildaNoweUrzadzenie && w.VildaNoweUrzadzenie.__vildaNoweUrzadzenie)) return;

  var WERSJA = "2";
  var ZDARZENIE = "vilda:new-device-restore-available";
  var ZDARZENIE_POBIERANIA = "vilda:sync-download-progress";
  var ZDARZENIE_SCALANIA = "vilda:vault-merge-progress";
  var ZDARZENIE_STANU_SYNCHRONIZACJI = "vilda:sync-status-changed";
  // Ten sam klucz czyta vilda_sync_integration.js: odpowiedź na pytanie w tej karcie — bez ponownego pytania.
  var KLUCZ_ODPOWIEDZI = "vilda-new-device-restore-shown-v1";
  // Przełącznik synchronizacji integracji: "true", "false" (wyłączona celowo w Ustawieniach) albo brak.
  var KLUCZ_SYNCHRONIZACJI = "vilda-sync-enabled-v1";
  // localStorage, + ":" + userId — pierwsze pobranie zaczęte i jeszcze nieudane.
  var KLUCZ_ZNACZNIKA = "vilda-new-device-download-v1";
  // sessionStorage — „Pobierz później” w tej karcie.
  var KLUCZ_POZNIEJ = "vilda-new-device-download-later-v1";
  var ID_OKNA = "vilda-restore-overlay";
  var ID_PRZYPOMNIENIA = "vilda-restore-reminder";
  var KLASA_OTWARTE = "is-open";
  var TEKST_POBIERZ = "Pobierz dane z serwera";
  var TEKST_POBIERANIE = "Pobieranie…";
  var NBSP = "\u00a0";
  var MB = 1048576;
  var KROKI = [
    ["pobieranie", "Pobieranie"],
    ["odszyfrowanie", "Odszyfrowanie"],
    ["pacjenci", "Pacjenci"],
  ];

  var okno = null;
  // null | "pytanie" | "pobieranie" | "gotowe" | "blad"
  var stan = null;
  var dane = { lastModified: null };
  // Numer bieżącej próby pobrania: wynik próby przerwanej blokadą sejfu nie trafia już do okna.
  var proba = 0;
  var pobieranieTrwa = false;
  // „Pobierz dane z serwera” z pytania etapu 1 poza „Komputerem prywatnym” (syncFull, jak dotąd).
  var pobieranieEtap1 = false;
  var postep = null;

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

  /* ---------- magazyny ---------- */

  function lokalny() {
    try {
      return w.localStorage || null;
    } catch (e) {
      return null;
    }
  }

  function sesyjny() {
    try {
      return w.sessionStorage || null;
    } catch (e) {
      return null;
    }
  }

  function czytaj(magazyn, klucz) {
    try {
      return magazyn ? magazyn.getItem(klucz) : null;
    } catch (e) {
      return null;
    }
  }

  function zapisz(magazyn, klucz, wartosc) {
    try {
      if (magazyn) magazyn.setItem(klucz, wartosc);
    } catch (e) {
      /* pomiń — bez magazynu działa tylko bieżący dokument */
    }
  }

  function usun(magazyn, klucz) {
    try {
      if (magazyn) magazyn.removeItem(klucz);
    } catch (e) {
      /* pomiń */
    }
  }

  /* ---------- stan konta i urządzenia ---------- */

  function sejf() {
    return w.VildaVault || null;
  }

  function integracja() {
    return w.VildaSyncIntegration || null;
  }

  function odblokowany() {
    var s = sejf();
    try {
      return !!(s && typeof s.isUnlocked === "function" && s.isUnlocked());
    } catch (e) {
      return false;
    }
  }

  // „Komputer prywatny”: pełna kopia na dysku — sejf lokalny, nie chmurowy („Komputer w pracy”)
  // i nie efemeryczny („Obcy komputer”).
  function prywatny() {
    if (!odblokowany()) return false;
    var s = sejf();
    try {
      if (typeof s.isEphemeralMode === "function" && s.isEphemeralMode()) return false;
      if (typeof s.isCloudOnlyMode === "function" && s.isCloudOnlyMode()) return false;
    } catch (e) {
      return false;
    }
    return true;
  }

  // Przełącznik synchronizacji jest dziś jeden dla całej przeglądarki (flaga per konto to etap 3). Gdy w tej
  // przeglądarce są też inne konta, samo pobieranie nie włącza go bez pytania — zostaje pytanie z etapu 1.
  function jedyneKonto() {
    var s = sejf();
    return Promise.resolve()
      .then(function () {
        return s && typeof s.listUsers === "function" ? s.listUsers() : null;
      })
      .then(
        function (lista) {
          return Array.isArray(lista) && lista.length <= 1;
        },
        function () {
          return false;
        }
      );
  }

  function synchronizacjaWlaczona() {
    return czytaj(lokalny(), KLUCZ_SYNCHRONIZACJI) === "true";
  }

  function synchronizacjaWylaczonaCelowo() {
    return czytaj(lokalny(), KLUCZ_SYNCHRONIZACJI) === "false";
  }

  // Ten sam przyrostek konta co vilda-sync-last-error-v1 w integracji.
  function kluczZnacznika() {
    var s = sejf();
    var u;
    try {
      u = s && typeof s.getCurrentUser === "function" ? s.getCurrentUser() : null;
    } catch (e) {
      u = null;
    }
    return u && u.userId ? KLUCZ_ZNACZNIKA + ":" + String(u.userId).slice(0, 64) : null;
  }

  function czytajZnacznik() {
    var klucz = kluczZnacznika();
    var surowy = klucz ? czytaj(lokalny(), klucz) : null;
    if (!surowy) return null;
    try {
      var z = JSON.parse(surowy);
      return z && typeof z === "object" ? z : {};
    } catch (e) {
      return {};
    }
  }

  function zapiszZnacznik(lastModified) {
    var klucz = kluczZnacznika();
    if (!klucz) return;
    zapisz(
      lokalny(),
      klucz,
      JSON.stringify({ v: 1, od: new Date().toISOString(), lastModified: lastModified || null })
    );
  }

  function usunZnacznik() {
    var klucz = kluczZnacznika();
    if (klucz) usun(lokalny(), klucz);
  }

  function odlozono() {
    return czytaj(sesyjny(), KLUCZ_POZNIEJ) === "1";
  }

  function oznaczOdpowiedz() {
    // Bez sessionStorage pytanie wróci przy następnym odblokowaniu.
    zapisz(sesyjny(), KLUCZ_ODPOWIEDZI, "1");
  }

  /* ---------- teksty ---------- */

  function sformatujDate(iso) {
    if (!iso) return "";
    try {
      var data = new Date(iso);
      if (isNaN(data.getTime())) return "";
      return data.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
    } catch (e) {
      return "";
    }
  }

  // Rodzaj męskoosobowy: 1 pacjent, 2, 5, 22 pacjentów; po „z”: 1 pacjenta, 248 pacjentów.
  function slowoPacjent(n) {
    return n === 1 ? "pacjent" : "pacjentów";
  }

  function slowoPacjentaPoZ(n) {
    return n === 1 ? "pacjenta" : "pacjentów";
  }

  // 1 notatka, 2–4 notatki (bez 12–14), pozostałe notatek.
  function slowoNotatka(n) {
    var r10 = n % 10;
    var r100 = n % 100;
    if (n === 1) return "notatka";
    if (r10 >= 2 && r10 <= 4 && (r100 < 12 || r100 > 14)) return "notatki";
    return "notatek";
  }

  function jednostka(bajty) {
    return bajty >= MB ? "MB" : "kB";
  }

  function liczbaBajtow(bajty, j) {
    if (!(bajty > 0)) return "0";
    if (j === "MB") return (bajty / MB).toFixed(1).replace(".", ",");
    return String(Math.max(1, Math.ceil(bajty / 1024)));
  }

  function liczba(v) {
    return typeof v === "number" && isFinite(v) && v > 0 ? v : 0;
  }

  /* ---------- DOM ---------- */

  function element(tag, klasa, tekst) {
    var el = dok().createElement(tag);
    if (klasa) el.className = klasa;
    if (tekst != null) el.textContent = tekst;
    return el;
  }

  // Części: łańcuch → tekst, [łańcuch] → <strong>.
  function wypelnij(el, czesci) {
    while (el.firstChild) el.removeChild(el.firstChild);
    for (var i = 0; i < czesci.length; i++) {
      var c = czesci[i];
      if (Array.isArray(c)) el.appendChild(element("strong", null, c[0]));
      else el.appendChild(dok().createTextNode(c));
    }
  }

  function przycisk(klasa, id, tekst, obsluga) {
    var b = element("button", klasa, tekst);
    b.type = "button";
    b.id = id;
    b.addEventListener("click", obsluga);
    return b;
  }

  function ikona(klasa, znak) {
    var el = element("div", "vilda-restore-ikona" + (klasa ? " " + klasa : ""), znak);
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  function tytul(tekst) {
    var h = element("h2", "vilda-restore-tytul", tekst);
    h.id = "vilda-restore-title";
    h.setAttribute("tabindex", "-1");
    return h;
  }

  // Fokus na tytule każdego widoku: czytnik ekranu ogłasza zmianę, a przycisk nie dostaje pierścienia fokusu bez
  // udziału klawiatury.
  function skupNaTytule() {
    var d = dok();
    var el = d && d.getElementById("vilda-restore-title");
    if (!el || typeof el.focus !== "function") return;
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      /* pomiń */
    }
  }

  // Zdarzenia przychodzą ≥ 600 ms po odblokowaniu, więc DOM jest gotowy; to tylko zabezpieczenie.
  function gdyDom(fn) {
    var d = dok();
    if (!d) return;
    if (d.body) {
      fn();
      return;
    }
    d.addEventListener("DOMContentLoaded", fn, { once: true });
  }

  /* ---------- okno ---------- */

  function zbudujOkno() {
    var d = dok();
    if (!d || !d.body) return null;
    var juz = d.getElementById(ID_OKNA);
    if (juz) {
      // index.html ma okno w znacznikach (ukryte, jak dotąd — zob. komentarz w index.html).
      okno = juz;
      return juz;
    }
    var o = element("div", "vilda-restore-overlay");
    o.id = ID_OKNA;
    o.setAttribute("role", "dialog");
    o.setAttribute("aria-modal", "true");
    o.setAttribute("aria-labelledby", "vilda-restore-title");
    o.setAttribute("data-vilda-zbudowane", "1");
    o.appendChild(element("div", "vilda-restore-panel"));
    d.body.appendChild(o);
    okno = o;
    return o;
  }

  function otworz(nazwa, buduj) {
    var o = zbudujOkno();
    if (!o) return false;
    var panel = o.querySelector(".vilda-restore-panel");
    if (!panel) {
      panel = element("div", "vilda-restore-panel");
      o.appendChild(panel);
    }
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    buduj(panel);
    o.setAttribute("data-stan", nazwa);
    o.classList.add(KLASA_OTWARTE);
    stan = nazwa;
    return true;
  }

  function zamknijOkno() {
    var d = dok();
    var o = okno || (d && d.getElementById(ID_OKNA));
    stan = null;
    if (!o) return;
    o.classList.remove(KLASA_OTWARTE);
    o.removeAttribute("data-stan");
    // Okno zbudowane tutaj znika z dokumentu (he w vilda_chrome.js); okno z index.html zostaje ukryte.
    if (o.getAttribute("data-vilda-zbudowane") === "1" && o.parentNode) {
      o.parentNode.removeChild(o);
      okno = null;
    }
  }

  /* ---------- widoki ---------- */

  function widokPytania(panel) {
    panel.appendChild(ikona(null, "☁️"));
    panel.appendChild(tytul("Znaleziono Twoje dane na serwerze"));
    panel.appendChild(element("p", "vilda-restore-etykieta", "Ostatnia synchronizacja:"));
    var data = element("p", "vilda-restore-data", sformatujDate(dane.lastModified) || "—");
    data.id = "vilda-restore-date";
    panel.appendChild(data);
    panel.appendChild(
      element(
        "p",
        "vilda-restore-opis",
        "Serwer przechowuje wyłącznie zaszyfrowane dane — tylko Ty, znając hasło, możesz je odczytać."
      )
    );
    panel.appendChild(przycisk("vilda-restore-pobierz", "vilda-restore-btn", TEKST_POBIERZ, naPobierz));
    panel.appendChild(
      przycisk("vilda-restore-pomin", "vilda-restore-skip", "Zacznij od nowa (nie pobieraj)", naPomin)
    );
  }

  function widokPobierania(panel) {
    panel.appendChild(ikona(null, "☁️"));
    panel.appendChild(tytul("Pobieranie Twoich danych z" + NBSP + "serwera"));
    var data = sformatujDate(dane.lastModified);
    if (data) {
      var etykieta = element("p", "vilda-restore-etykieta");
      wypelnij(etykieta, ["Ostatnia synchronizacja: ", [data]]);
      panel.appendChild(etykieta);
    }
    var kroki = element("ol", "vilda-restore-kroki");
    kroki.setAttribute("aria-label", "Etapy pobierania");
    for (var i = 0; i < KROKI.length; i++) {
      var krok = element("li", "vilda-restore-krok");
      krok.setAttribute("data-krok", KROKI[i][0]);
      krok.appendChild(element("span", "vilda-restore-krok-nr", String(i + 1)));
      krok.appendChild(element("span", "vilda-restore-krok-nazwa", KROKI[i][1]));
      kroki.appendChild(krok);
    }
    panel.appendChild(kroki);
    // Natywny <progress>: wartość atrybutem, bez stylu ustawianego z JS; bez value — postęp nieokreślony.
    var pasek = element("progress", "vilda-restore-postep");
    pasek.id = "vilda-restore-postep";
    pasek.max = 100;
    pasek.setAttribute("aria-labelledby", "vilda-restore-title");
    panel.appendChild(pasek);
    var wiersz = element("div", "vilda-restore-postep-wiersz");
    var licznik = element("span", "vilda-restore-licznik");
    licznik.id = "vilda-restore-licznik";
    var procent = element("span", "vilda-restore-procent");
    procent.id = "vilda-restore-procent";
    wiersz.appendChild(licznik);
    wiersz.appendChild(procent);
    panel.appendChild(wiersz);
    panel.appendChild(
      element(
        "p",
        "vilda-restore-opis",
        "Serwer przechowuje wyłącznie zaszyfrowane dane — odszyfrowuje je dopiero to urządzenie, Twoim hasłem."
      )
    );
    panel.appendChild(
      element(
        "p",
        "vilda-restore-uwaga",
        "Odświeżenie strony albo zamknięcie karty nie przerywa niczego na stałe — pobieranie wznowi się samo przy następnym otwarciu aplikacji."
      )
    );
  }

  function czesciPodsumowania(liczby) {
    var pacjenci = liczby && typeof liczby.pacjenci === "number" ? liczby.pacjenci : null;
    var notatki = liczby && typeof liczby.notatki === "number" ? liczby.notatki : null;
    var data = sformatujDate(dane.lastModified);
    if (pacjenci === null && notatki === null) {
      return [data ? "Stan z" + NBSP + data + "." : "Dane z serwera są już na tym urządzeniu."];
    }
    if (!pacjenci && !notatki) return ["Na serwerze nie było jeszcze pacjentów ani notatek."];
    var czesci = [];
    if (pacjenci) czesci.push([pacjenci + NBSP + slowoPacjent(pacjenci)]);
    if (notatki) {
      if (czesci.length) czesci.push(" i" + NBSP);
      czesci.push([notatki + NBSP + slowoNotatka(notatki)]);
    }
    if (data) czesci.push(" ze stanu z" + NBSP + data);
    return czesci;
  }

  function widokGotowe(panel, liczby) {
    panel.appendChild(ikona("is-gotowe", "✓"));
    panel.appendChild(tytul("Gotowe — dane są na tym urządzeniu"));
    var podsumowanie = element("p", "vilda-restore-podsumowanie");
    wypelnij(podsumowanie, czesciPodsumowania(liczby));
    panel.appendChild(podsumowanie);
    var info = element("p", "vilda-restore-info");
    if (synchronizacjaWlaczona()) {
      wypelnij(info, [
        ["Synchronizacja jest włączona na tym urządzeniu."],
        " Zmiany zapisane tutaj trafią na Twoje pozostałe urządzenia — zawsze zaszyfrowane. Wyłączysz ją w" +
          NBSP +
          "Ustawieniach → Synchronizacja.",
      ]);
    } else {
      // Wyłączona w innej karcie w trakcie pobierania — nie obiecujemy, że zmiany pójdą dalej.
      wypelnij(info, [
        ["Synchronizacja jest wyłączona na tym urządzeniu."],
        " Włączysz ją w" + NBSP + "Ustawieniach → Synchronizacja.",
      ]);
    }
    panel.appendChild(info);
    panel.appendChild(przycisk("vilda-restore-pobierz", "vilda-restore-dalej", "Przejdź do aplikacji", naDalej));
  }

  // Powód zwykłym językiem i krótki opis techniczny do ramki „Szczegóły”.
  function opisBledu(blad) {
    var kod = (blad && blad.code) || "";
    var http = blad && typeof blad.httpStatus === "number" ? blad.httpStatus : null;
    var offline;
    try {
      offline = !!(w.navigator && w.navigator.onLine === false);
    } catch (e) {
      offline = false;
    }
    var opis;
    var techniczny;
    if (kod === "TIMEOUT") {
      opis = "Serwer nie odpowiedział w wyznaczonym czasie. Sprawdź połączenie z" + NBSP + "internetem i spróbuj ponownie.";
      techniczny = "przekroczony czas oczekiwania";
    } else if (offline || (!kod && blad && blad.name === "TypeError")) {
      opis = "Brak połączenia z" + NBSP + "serwerem. Sprawdź połączenie z" + NBSP + "internetem i spróbuj ponownie.";
      techniczny = "brak połączenia";
      kod = kod || "NETWORK";
    } else if (kod === "AUTH_FAILED" || kod === "SLOT_AUTH_MISMATCH" || http === 401) {
      opis = "Serwer nie potwierdził uprawnień tego urządzenia. Spróbuj ponownie; jeśli błąd wróci, wyloguj się i" + NBSP + "zaloguj ponownie.";
      techniczny = "odmowa uwierzytelnienia";
    } else if (http === 429) {
      opis = "Serwer jest chwilowo przeciążony. Spróbuj ponownie za minutę.";
      techniczny = "zbyt wiele zapytań";
    } else if (kod === "DECRYPT_FAILED") {
      opis = "Nie udało się odszyfrować danych z" + NBSP + "serwera. Spróbuj ponownie; jeśli błąd się powtarza, napisz do nas.";
      techniczny = "błąd odszyfrowania";
    } else if (kod === "PARSE_FAILED" || kod === "DECOMPRESS_FAILED") {
      opis = "Dane z" + NBSP + "serwera dotarły niekompletne albo uszkodzone. Spróbuj ponownie.";
      techniczny = "uszkodzone dane";
    } else if (kod === "GZIP_UNSUPPORTED") {
      opis = "Ta przeglądarka nie umie rozpakować danych z" + NBSP + "serwera. Zaktualizuj przeglądarkę albo system i" + NBSP + "spróbuj ponownie.";
      techniczny = "brak obsługi gzip";
    } else if (kod === "SYNC_IDENTITY_CHANGED") {
      opis = "Synchronizację tego konta odnowiono na innym urządzeniu. Odśwież stronę i" + NBSP + "zaloguj się ponownie.";
      techniczny = "zmiana tożsamości synchronizacji";
    } else if (kod === "MERGE_BUSY") {
      opis = "Pacjent jest właśnie zapisywany w" + NBSP + "innej karcie. Dokończ tam zapis i" + NBSP + "spróbuj ponownie.";
      techniczny = "pacjent zajęty w" + NBSP + "innej karcie";
    } else if (http) {
      opis = "Serwer zwrócił błąd. Spróbuj ponownie za chwilę.";
      techniczny = "błąd serwera";
    } else {
      opis = "Coś poszło nie tak podczas pobierania. Spróbuj ponownie.";
      techniczny = "nieznany błąd";
    }
    var kody = [];
    if (kod) kody.push(kod);
    if (http) kody.push("HTTP " + http);
    var szczegoly = "Szczegóły: " + techniczny + (kody.length ? " (" + kody.join(", ") + ")" : "");
    var p = postep || {};
    if (p.loaded > 0 || p.total > 0) {
      var j = jednostka(Math.max(p.total, p.loaded));
      szczegoly +=
        " · pobrano " +
        liczbaBajtow(p.loaded, j) +
        (p.total > 0 ? " z" + NBSP + liczbaBajtow(p.total, j) : "") +
        NBSP +
        j;
    }
    return { opis: opis, szczegoly: szczegoly };
  }

  function widokBledu(panel, blad) {
    var ik = ikona("is-blad", "☁️");
    ik.appendChild(element("span", "vilda-restore-odznaka", "!"));
    panel.appendChild(ik);
    panel.appendChild(tytul("Nie udało się pobrać danych"));
    var opis = opisBledu(blad);
    panel.appendChild(element("p", "vilda-restore-opis", opis.opis));
    panel.appendChild(element("p", "vilda-restore-szczegoly", opis.szczegoly));
    var akcje = element("div", "vilda-restore-akcje");
    akcje.appendChild(przycisk("vilda-restore-pobierz", "vilda-restore-ponow", "Spróbuj ponownie", naPonow));
    akcje.appendChild(przycisk("vilda-restore-pozniej", "vilda-restore-pozniej", "Pobierz później", naPozniej));
    panel.appendChild(akcje);
    panel.appendChild(
      element(
        "p",
        "vilda-restore-uwaga",
        "„Pobierz później”: aplikacja działa na tym urządzeniu bez Twoich danych z" +
          NBSP +
          "serwera. Pobieranie ponowi się samo w" +
          NBSP +
          "tle i przy następnym logowaniu; możesz je też uruchomić przypomnieniem na dole ekranu."
      )
    );
  }

  /* ---------- postęp ---------- */

  function nowyPostep() {
    return { etap: "pobieranie", loaded: 0, total: 0, wczytano: 0, razem: 0 };
  }

  function aktualizujPostep() {
    if (stan !== "pobieranie" || !postep) return;
    var d = dok();
    if (!d) return;
    var etapy = ["pobieranie", "odszyfrowanie", "pacjenci"];
    var biezacy = postep.etap === "koniec" ? etapy.length : etapy.indexOf(postep.etap);
    var kroki = d.querySelectorAll("#" + ID_OKNA + " .vilda-restore-krok");
    for (var i = 0; i < kroki.length; i++) {
      var zrobiony = i < biezacy;
      var aktywny = i === biezacy;
      kroki[i].classList.toggle("is-zrobiony", zrobiony);
      kroki[i].classList.toggle("is-aktywny", aktywny);
      if (aktywny) kroki[i].setAttribute("aria-current", "step");
      else kroki[i].removeAttribute("aria-current");
      var nr = kroki[i].querySelector(".vilda-restore-krok-nr");
      if (nr) nr.textContent = zrobiony ? "✓" : String(i + 1);
    }

    var ulamek = null;
    var czesci;
    if (postep.etap === "pobieranie") {
      var j = jednostka(Math.max(postep.total, postep.loaded));
      if (postep.total > 0) {
        ulamek = postep.loaded / postep.total;
        czesci = [
          "Pobrano ",
          [liczbaBajtow(postep.loaded, j)],
          " z" + NBSP + liczbaBajtow(postep.total, j) + NBSP + j,
        ];
      } else if (postep.loaded > 0) {
        czesci = ["Pobrano ", [liczbaBajtow(postep.loaded, j) + NBSP + j]];
      } else {
        ulamek = 0;
        czesci = ["Łączenie z" + NBSP + "serwerem…"];
      }
    } else if (postep.etap === "odszyfrowanie") {
      czesci = ["Odszyfrowywanie danych na tym urządzeniu…"];
    } else if (postep.etap === "pacjenci" && postep.razem > 0) {
      ulamek = postep.wczytano / postep.razem;
      czesci = [
        "Wczytano ",
        [String(postep.wczytano)],
        " z" + NBSP + postep.razem + NBSP + slowoPacjentaPoZ(postep.razem),
      ];
    } else if (postep.etap === "pacjenci") {
      czesci = ["Wczytywanie danych…"];
    } else {
      ulamek = 1;
      czesci = ["Kończenie…"];
    }

    var pasek = d.getElementById("vilda-restore-postep");
    var licznik = d.getElementById("vilda-restore-licznik");
    var procent = d.getElementById("vilda-restore-procent");
    var wartosc = ulamek === null ? null : Math.round(Math.min(1, Math.max(0, ulamek)) * 100);
    if (pasek) {
      if (wartosc === null) pasek.removeAttribute("value");
      else pasek.value = wartosc;
    }
    if (licznik) wypelnij(licznik, czesci);
    if (procent) procent.textContent = wartosc === null || (ulamek === 0 && postep.etap === "pobieranie" && !postep.total) ? "" : wartosc + "%";
  }

  function naPostepPobierania(e) {
    var d = e && e.detail;
    if (!d || !postep || !pobieranieTrwa) return;
    if (d.phase === "download") {
      postep.etap = "pobieranie";
      postep.loaded = liczba(d.loaded);
      postep.total = liczba(d.total);
    } else if (d.phase === "decrypt") {
      postep.etap = "odszyfrowanie";
    } else {
      return;
    }
    aktualizujPostep();
  }

  function naPostepScalania(e) {
    var d = e && e.detail;
    if (!d || !postep || !pobieranieTrwa) return;
    if (d.phase === "patients-start" || d.phase === "patients") {
      postep.etap = "pacjenci";
      postep.wczytano = liczba(d.current);
      postep.razem = liczba(d.total);
    } else if (d.phase === "done") {
      postep.etap = "koniec";
    } else {
      return;
    }
    aktualizujPostep();
  }

  /* ---------- pobieranie (etap 2) ---------- */

  function wlaczSynchronizacje() {
    var i = integracja();
    try {
      if (
        i &&
        typeof i.setSyncEnabled === "function" &&
        !(typeof i.isSyncEnabled === "function" && i.isSyncEnabled())
      ) {
        i.setSyncEnabled(true);
      }
    } catch (e) {
      /* pomiń */
    }
  }

  function pobierzZSerwera() {
    var i = integracja();
    if (i && typeof i.pullForNewDevice === "function") {
      return Promise.resolve().then(function () {
        return i.pullForNewDevice();
      });
    }
    var s = w.VildaSync;
    if (s && typeof s.syncPull === "function") {
      return Promise.resolve().then(function () {
        return s.syncPull();
      });
    }
    var b = new Error("Moduł synchronizacji niedostępny.");
    b.code = "SYNC_NO_API";
    return Promise.reject(b);
  }

  // Udane pobranie: dane z serwera są na urządzeniu — scalone, już aktualne albo na serwerze nic nie ma.
  // „not-registered” z kodem innym niż 404 to błąd serwera, nie brak danych (vilda_sync.js podaje kod od etapu 2).
  function pobranieUdane(wynik) {
    var a = wynik && wynik.action;
    if (a === "merged" || a === "up-to-date" || a === "no-remote-blob") return true;
    if (a === "not-registered") return !(typeof wynik.httpStatus === "number" && wynik.httpStatus !== 404);
    return false;
  }

  function bladWyniku(wynik) {
    var b = new Error("Serwer nie potwierdził danych konta.");
    b.code = "STATUS_FAILED";
    if (wynik && typeof wynik.httpStatus === "number") b.httpStatus = wynik.httpStatus;
    return b;
  }

  function policz() {
    var s = sejf();
    function ile(nazwa) {
      return Promise.resolve()
        .then(function () {
          return s && typeof s[nazwa] === "function" ? s[nazwa]() : null;
        })
        .then(
          function (lista) {
            return Array.isArray(lista) ? lista.length : null;
          },
          function () {
            return null;
          }
        );
    }
    return Promise.all([ile("listPatients"), ile("listNotes")]).then(function (wyniki) {
      return { pacjenci: wyniki[0], notatki: wyniki[1] };
    });
  }

  function pokazGotowe(liczby) {
    otworz("gotowe", function (panel) {
      widokGotowe(panel, liczby);
    });
    skupNaTytule();
  }

  function rozpocznijPobieranie() {
    if (pobieranieTrwa) return;
    zapiszZnacznik(dane.lastModified);
    usun(sesyjny(), KLUCZ_POZNIEJ);
    ukryjPrzypomnienie();
    wlaczSynchronizacje();
    postep = nowyPostep();
    if (!otworz("pobieranie", widokPobierania)) return;
    aktualizujPostep();
    skupNaTytule();
    var moja = ++proba;
    pobieranieTrwa = true;
    pobierzZSerwera()
      .then(function (wynik) {
        if (moja !== proba) return null;
        if (!pobranieUdane(wynik)) throw bladWyniku(wynik);
        postep.etap = "koniec";
        aktualizujPostep();
        return policz().then(function (liczby) {
          if (moja !== proba) return;
          pobieranieTrwa = false;
          usunZnacznik();
          pokazGotowe(liczby);
        });
      })
      .catch(function (blad) {
        if (moja !== proba) return;
        pobieranieTrwa = false;
        otworz("blad", function (panel) {
          widokBledu(panel, blad);
        });
        skupNaTytule();
      });
  }

  function naPonow() {
    rozpocznijPobieranie();
  }

  function naPozniej() {
    if (pobieranieTrwa) return;
    zapisz(sesyjny(), KLUCZ_POZNIEJ, "1");
    zamknijOkno();
    pokazPrzypomnienie();
  }

  function naDalej() {
    zamknijOkno();
  }

  /* ---------- przypomnienie po „Pobierz później” ---------- */

  function pokazPrzypomnienie() {
    var d = dok();
    if (!d || !d.body) return;
    var el = d.getElementById(ID_PRZYPOMNIENIA);
    if (!el) {
      el = element("div", "vilda-restore-przypomnienie");
      el.id = ID_PRZYPOMNIENIA;
      el.setAttribute("role", "status");
      var ik = element("span", "vilda-restore-przypomnienie-ikona", "☁️");
      ik.setAttribute("aria-hidden", "true");
      var tekst = element("div", "vilda-restore-przypomnienie-tekst");
      tekst.appendChild(element("strong", null, "Twoje dane z" + NBSP + "serwera nie są jeszcze na tym urządzeniu."));
      var data = element("span", "vilda-restore-przypomnienie-data");
      data.id = "vilda-restore-reminder-date";
      tekst.appendChild(data);
      el.appendChild(ik);
      el.appendChild(tekst);
      el.appendChild(przycisk("vilda-restore-teraz", "vilda-restore-teraz", "Pobierz teraz", naPobierzTeraz));
      d.body.appendChild(el);
    }
    var etykieta = d.getElementById("vilda-restore-reminder-date");
    var s = sformatujDate(dane.lastModified);
    if (etykieta) {
      etykieta.textContent = s ? "Stan z" + NBSP + s : "";
      etykieta.hidden = !s;
    }
  }

  function ukryjPrzypomnienie() {
    var d = dok();
    var el = d && d.getElementById(ID_PRZYPOMNIENIA);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function naPobierzTeraz() {
    if (!prywatny()) return;
    rozpocznijPobieranie();
  }

  /* ---------- pytanie (etap 1) ---------- */

  function ustawZajetosc(zajety) {
    var d = dok();
    var pobierz = d && d.getElementById("vilda-restore-btn");
    var pomin = d && d.getElementById("vilda-restore-skip");
    if (pobierz) {
      pobierz.disabled = !!zajety;
      pobierz.textContent = zajety ? TEKST_POBIERANIE : TEKST_POBIERZ;
      if (zajety) pobierz.setAttribute("aria-busy", "true");
      else pobierz.removeAttribute("aria-busy");
    }
    if (pomin) pomin.disabled = !!zajety;
  }

  function naPobierz() {
    if (pobieranieEtap1 || pobieranieTrwa) return;
    // Odpowiedź PRZED pobraniem: przeładowanie w trakcie wraca do pobierania, a nie do pytania.
    oznaczOdpowiedz();
    // „Komputer prywatny” z synchronizacją wyłączoną celowo: zgoda kliknięciem — dalej jak w etapie 2.
    if (prywatny()) {
      rozpocznijPobieranie();
      return;
    }
    pobieranieEtap1 = true;
    ustawZajetosc(true);
    wlaczSynchronizacje();
    var sync = w.VildaSync;
    var zadanie;
    try {
      zadanie = sync && typeof sync.syncFull === "function" ? sync.syncFull() : null;
    } catch (e) {
      zadanie = null;
    }
    function koniec() {
      pobieranieEtap1 = false;
      if (stan === "pytanie") zamknijOkno();
    }
    Promise.resolve(zadanie).then(koniec, koniec);
  }

  function naPomin() {
    if (pobieranieEtap1 || pobieranieTrwa) return;
    oznaczOdpowiedz();
    zamknijOkno();
  }

  /* ---------- zdarzenia ---------- */

  function naNoweUrzadzenie(e) {
    var szczegoly = (e && e.detail) || {};
    gdyDom(function () {
      if (pobieranieTrwa || pobieranieEtap1) return;
      dane = { lastModified: szczegoly.lastModified || null };
      if (!prywatny() || synchronizacjaWylaczonaCelowo()) {
        otworz("pytanie", widokPytania);
        return;
      }
      jedyneKonto().then(function (jedyne) {
        if (pobieranieTrwa || pobieranieEtap1 || !odblokowany()) return;
        if (jedyne) rozpocznijPobieranie();
        else otworz("pytanie", widokPytania);
      });
    });
  }

  // Wołane przez vilda_sync_integration.js ~600 ms po odblokowaniu, zanim integracja zacznie sondować albo
  // pobierać. true — start należy do modułu (czeka pierwsze pobranie tego konta); false — integracja jak dotąd.
  function przejmujeStart() {
    if (!aktywny || !odblokowany()) return false;
    var znacznik = czytajZnacznik();
    if (!znacznik || !prywatny()) return false;
    if (synchronizacjaWylaczonaCelowo()) {
      // Wyłączona celowo (np. w innej karcie, gdy ta była zamknięta) — decyzja użytkownika wygrywa.
      usunZnacznik();
      return false;
    }
    dane = { lastModified: znacznik.lastModified || null };
    try {
      gdyDom(function () {
        if (pobieranieTrwa || stan === "pobieranie") return;
        if (odlozono()) {
          pokazPrzypomnienie();
          return;
        }
        rozpocznijPobieranie();
      });
    } catch (e) {
      /* pomiń — start i tak należy do modułu */
    }
    return true;
  }

  // Pobranie zakończone poza oknem (integracja w tle po „Pobierz później”, inna operacja synchronizacji):
  // dane są już na urządzeniu — znacznik i przypomnienie znikają, a ekran błędu przechodzi w „Gotowe”.
  function naKoniecSynchronizacji(zdarzenie) {
    if (!zdarzenie || zdarzenie.operation !== "pull" || pobieranieTrwa) return;
    if (!pobranieUdane(zdarzenie.result) || !czytajZnacznik()) return;
    usunZnacznik();
    usun(sesyjny(), KLUCZ_POZNIEJ);
    ukryjPrzypomnienie();
    if (stan === "blad") {
      policz().then(function (liczby) {
        if (stan === "blad" && !pobieranieTrwa) pokazGotowe(liczby);
      });
    }
  }

  // Synchronizacja wyłączona w Ustawieniach (ta strona albo ramka powłoki / inna karta przez storage).
  function naWylaczenieSynchronizacji() {
    if (!synchronizacjaWylaczonaCelowo()) return;
    usunZnacznik();
    usun(sesyjny(), KLUCZ_POZNIEJ);
    ukryjPrzypomnienie();
    if (stan === "blad") zamknijOkno();
  }

  function naZmianeMagazynu(e) {
    if (!e || !e.key) return;
    if (e.key === KLUCZ_SYNCHRONIZACJI && e.newValue === "false") {
      naWylaczenieSynchronizacji();
      return;
    }
    // Inna karta skończyła pierwsze pobranie tego konta.
    if (e.newValue === null && e.key === kluczZnacznika() && stan === null) ukryjPrzypomnienie();
  }

  function naBlokade() {
    // Blokada sejfu (wylogowanie, bezczynność): okno i przypomnienie znikają; wynik trwającej próby jest
    // pomijany. Znacznik zostaje, a wybór „Pobierz później” nie — następne logowanie znowu pobiera.
    proba += 1;
    pobieranieTrwa = false;
    pobieranieEtap1 = false;
    postep = null;
    usun(sesyjny(), KLUCZ_POZNIEJ);
    zamknijOkno();
    ukryjPrzypomnienie();
  }

  var podpietoBlokade = false;
  var podpietoSynchronizacje = false;
  function podepnij() {
    var s = sejf();
    if (!podpietoBlokade && s && typeof s.onLock === "function") {
      podpietoBlokade = true;
      s.onLock(naBlokade);
    }
    var sync = w.VildaSync;
    if (!podpietoSynchronizacje && sync && typeof sync.onSyncComplete === "function") {
      podpietoSynchronizacje = true;
      sync.onSyncComplete(naKoniecSynchronizacji);
    }
    return podpietoBlokade && podpietoSynchronizacje;
  }

  function start() {
    var d = dok();
    if (!d || typeof d.addEventListener !== "function") return;
    d.addEventListener(ZDARZENIE, naNoweUrzadzenie);
    d.addEventListener(ZDARZENIE_POBIERANIA, naPostepPobierania);
    d.addEventListener(ZDARZENIE_SCALANIA, naPostepScalania);
    d.addEventListener(ZDARZENIE_STANU_SYNCHRONIZACJI, function (e) {
      if (e && e.detail && e.detail.state === "disabled") naWylaczenieSynchronizacji();
    });
    if (typeof w.addEventListener === "function") w.addEventListener("storage", naZmianeMagazynu);
    if (!podepnij()) {
      var proby = 0;
      var zegar = w.setInterval(function () {
        proby += 1;
        if (podepnij() || proby >= 30) w.clearInterval(zegar);
      }, 100);
    }
  }

  var aktywny = !osadzony();
  if (aktywny) start();

  w.VildaNoweUrzadzenie = Object.freeze({
    __vildaNoweUrzadzenie: true,
    wersja: WERSJA,
    /** Okno otwarte (pytanie, pobieranie, „Gotowe”, błąd) albo trwa pobieranie uruchomione z okna. */
    czyAktywne: function () {
      return aktywny && (stan !== null || pobieranieTrwa || pobieranieEtap1);
    },
    /** Start synchronizacji po odblokowaniu (vilda_sync_integration.js): czy przejmuje go ten moduł. */
    przejmujeStart: przejmujeStart,
  });
})(typeof window !== "undefined" ? window : null);
