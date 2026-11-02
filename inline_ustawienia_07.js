(function(){"use strict";var f=["settings-section-backup","settings-section-sync","settings-section-login","settings-section-account"],v='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',g="Zaloguj si\u0119, aby uzyska\u0107 dost\u0119p",a={};function k(){var e=window.VildaVault;if(e&&typeof e.isUnlocked=="function")return e.isUnlocked();var n=window.VildaSession;return n&&typeof n.isLoggedIn=="function"?n.isLoggedIn():!1}function d(e){e.preventDefault();var n=e.currentTarget.querySelector(".settings-lock-tip");n&&(n.classList.add("is-visible"),clearTimeout(n._t),n._t=setTimeout(function(){n.classList.remove("is-visible")},2200))}function t(){var e=k(),n=document.querySelector(".settings-danger-zone");n&&(n.style.display=e?"":"none"),f.forEach(function(r){var i=document.getElementById(r);if(i){var o=i.querySelector("summary"),s=i.querySelector(".settings-chevron");if(e)i.classList.remove("settings-accordion--locked"),o&&o.removeEventListener("click",d),s&&a[r]!==void 0&&(s.innerHTML=a[r]);else if(i.classList.contains("settings-accordion--locked")||s&&(a[r]=s.innerHTML),i.classList.add("settings-accordion--locked"),i.open=!1,s&&(s.innerHTML=v),o){if(!o.querySelector(".settings-lock-tip")){var l=document.createElement("span");l.className="settings-lock-tip",l.textContent=g,o.appendChild(l)}o.removeEventListener("click",d),o.addEventListener("click",d)}var u=document.querySelector('.settings-subnav-link[data-target="'+r+'"]');u&&(u.style.opacity=e?"":"0.4",u.style.pointerEvents=e?"":"none")}})}if(document.addEventListener("DOMContentLoaded",function(){t();var e=window.VildaVault;e&&(typeof e.onUnlock=="function"&&e.onUnlock(t),typeof e.onLock=="function"&&e.onLock(t)),document.addEventListener("vilda:session-changed",t),document.addEventListener("vilda:auth-loaded",t),document.addEventListener("vilda:guest-mode-changed",t)},{once:!0}),document.readyState!=="loading"){t();var c=window.VildaVault;c&&(typeof c.onUnlock=="function"&&c.onUnlock(t),typeof c.onLock=="function"&&c.onLock(t))}})();
/* P-WERSJA-APLIKACJI (E2-PR1w; decyzja wlasciciela 4 z 2026-10-29 i decyzje z 2026-11-02; docs/SYNC_PRZYROSTOWA_PLAN.md):
   linia "Wersja aplikacji" na dole Ustawien (#settingsAppVersionValue), widoczna zawsze (takze bez logowania i w ramce
   powloki). Kod jest w tym pliku, a nie w nowym: kazdy nowy plik w pamieci offline to dodatkowe zadanie instalacji SW
   ponad limit 600 (tests/unit/sw-precache-stron.test.mjs; decyzja 2 z 2026-11-02).
   Numer to SW_VERSION service workera, ktory naprawde obsluguje strone: wiadomosc {type:'VILDA_WERSJA'} przez
   MessageChannel do navigator.serviceWorker.controller, SW odpowiada wlasna stala (strona nie ma kopii numeru).
   Oczekujacy SW (registration.waiting) pytany osobno: " . gotowa aktualizacja X"; gdy milczy, sam dopisek bez X
   (tak jak baner, ktory reaguje na samo registration.waiting). registration.installing: " . pobieranie aktualizacji...".
   Kontroler milczy dluzej niz 2 s albo odpowiada nie tak (SW sprzed tej zmiany): "starsza wersja (numer nieznany)".
   Bez kontrolera albo bez SW: "nieustalona" (registration.active nie jest pytany).
   Tylko odczyt: bez zapisow w magazynach, bez zadan sieciowych, bez czytania nazw pamieci; tekst wylacznie przez
   textContent. Okno wylacznie przez w.* (test powloki uruchamia ten plik w vm z oknem bez document/navigator).
   Testy: tests/unit/wersja-aplikacji.test.mjs, tests/e2e/wersja-aplikacji.spec.mjs, wersja-aplikacji-mobile.spec.mjs. */
(function (w) {
  'use strict';
  var Bwa_LIMIT_MS = 2000;
  var Bwa_WZOR = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;
  var Bwa_ID = 'settingsAppVersionValue';
  var Bwa_pokolenie = 0;

  // Pytanie jednego workera; odpowiedz spoza wzoru albo cisza dluzej niz limit = null. Port zamykany zawsze.
  function Bwa_zapytaj(sw) {
    return new Promise(function (gotowe) {
      var kanal = null, zegar = null, koniec = false;
      function zakoncz(v) {
        if (koniec) return;
        koniec = true;
        if (zegar !== null) w.clearTimeout(zegar);
        try { kanal.port1.onmessage = null; kanal.port1.close(); } catch (x) { /* brak kanalu */ }
        gotowe(v);
      }
      try {
        kanal = new w.MessageChannel();
        kanal.port1.onmessage = function (e) {
          var d = e && e.data;
          zakoncz(d && d.type === 'VILDA_WERSJA' && typeof d.wersja == 'string' && Bwa_WZOR.test(d.wersja) ? d.wersja : null);
        };
        zegar = w.setTimeout(function () { zakoncz(null); }, Bwa_LIMIT_MS);
        sw.postMessage({ type: 'VILDA_WERSJA' }, [kanal.port2]);
      } catch (x) {
        zakoncz(null);
      }
    });
  }

  // Odczyt navigator.serviceWorker moze rzucic (np. SecurityError w ramce sandbox bez allow-same-origin) = brak SW.
  function Bwa_sw() {
    try { return (w.navigator && w.navigator.serviceWorker) || null; } catch (x) { return null; }
  }

  // Wynik: { stan: 'ok' | 'starsza' | 'brak', aktywna, oczekujaca, czeka, instalacja }.
  async function Bwa_odczytaj() {
    var nic = { stan: 'brak', aktywna: null, oczekujaca: null, czeka: false, instalacja: false };
    var sw = Bwa_sw();
    if (!sw || typeof sw.getRegistration != 'function' || typeof w.MessageChannel != 'function') return nic;
    var reg;
    try { reg = await sw.getRegistration(); } catch (x) { reg = null; }
    // statechange instalowanego SW sledzi kazdy odczyt, ktory go zastanie (tez po updatefound i ready): przy pierwszej
    // wizycie ready czeka na aktywny SW, a nieudana instalacja (redundant) ma i tak zdjac dopisek. Nasluch zakladany
    // zaraz po odczycie rejestracji, przed pytaniem workerow (do 2 s), wiec zmiana stanu w trakcie pytania nie wpada
    // w luke (test W14e); ta sama funkcja nasluchu, wiec bez duplikatow.
    Bwa_sledzInstalacje(reg);
    var kontroler = sw.controller || null;
    if (!reg && !kontroler) return nic;
    var czeka = !!(reg && reg.waiting);
    var odp = await Promise.all([kontroler ? Bwa_zapytaj(kontroler) : null, czeka ? Bwa_zapytaj(reg.waiting) : null]);
    return {
      stan: odp[0] ? 'ok' : (kontroler ? 'starsza' : 'brak'),
      aktywna: odp[0], oczekujaca: odp[1], czeka: czeka, instalacja: !!(reg && reg.installing)
    };
  }

  function Bwa_tekst(o) {
    var t = o && o.stan === 'ok' && o.aktywna ? o.aktywna
      : (o && o.stan === 'starsza' ? 'starsza wersja (numer nieznany)' : 'nieustalona');
    if (o && (o.czeka || o.oczekujaca)) t += ' \u00b7 gotowa aktualizacja' + (o.oczekujaca ? ' ' + o.oczekujaca : '');
    else if (o && o.instalacja) t += ' \u00b7 pobieranie aktualizacji\u2026';
    return t;
  }

  // Nowszy odczyt wygrywa (pokolenie); zapis tylko przy zmianie tekstu.
  function Bwa_odswiez() {
    var d = w.document;
    var el = d && typeof d.getElementById == 'function' ? d.getElementById(Bwa_ID) : null;
    if (!el) return Promise.resolve(null);
    Bwa_pokolenie += 1;
    var nr = Bwa_pokolenie;
    return Bwa_odczytaj().then(function (o) {
      if (nr !== Bwa_pokolenie) return null;
      var t = Bwa_tekst(o);
      if (el.textContent !== t) el.textContent = t;
      return t;
    }, function () { return null; });
  }

  function Bwa_naZmiane() { Bwa_odswiez(); }
  function Bwa_sledzInstalacje(reg) {
    var nowy = reg && reg.installing;
    if (nowy && typeof nowy.addEventListener == 'function') nowy.addEventListener('statechange', Bwa_naZmiane);
  }
  function Bwa_start() {
    Bwa_odswiez();
    var sw = Bwa_sw();
    if (sw && typeof sw.addEventListener == 'function') sw.addEventListener('controllerchange', Bwa_naZmiane);
    if (sw && sw.ready && typeof sw.ready.then == 'function') {
      sw.ready.then(function (reg) {
        Bwa_odswiez();
        if (reg && typeof reg.addEventListener == 'function') reg.addEventListener('updatefound', Bwa_naZmiane);
      }, function () { /* bez rejestracji zostaje "nieustalona" */ });
    }
    var d = w.document;
    if (d && typeof d.addEventListener == 'function') {
      d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'visible') Bwa_odswiez(); });
    }
  }

  w.VildaWersjaAplikacji = Object.freeze({ odczytaj: Bwa_odczytaj, tekst: Bwa_tekst, odswiez: Bwa_odswiez });
  if (w.document && w.document.readyState === 'loading' && typeof w.document.addEventListener == 'function') {
    w.document.addEventListener('DOMContentLoaded', Bwa_start);
  } else {
    Bwa_start();
  }
})(window);
/* /P-WERSJA-APLIKACJI */
