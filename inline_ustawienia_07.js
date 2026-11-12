(function(){"use strict";var f=["settings-section-backup","settings-section-sync","settings-section-login","settings-section-account"],v='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',g="Zaloguj si\u0119, aby uzyska\u0107 dost\u0119p",a={};function k(){var e=window.VildaVault;if(e&&typeof e.isUnlocked=="function")return e.isUnlocked();var n=window.VildaSession;return n&&typeof n.isLoggedIn=="function"?n.isLoggedIn():!1}function d(e){e.preventDefault();var n=e.currentTarget.querySelector(".settings-lock-tip");n&&(n.classList.add("is-visible"),clearTimeout(n._t),n._t=setTimeout(function(){n.classList.remove("is-visible")},2200))}function t(){var e=k(),n=document.querySelector(".settings-danger-zone");n&&(n.style.display=e?"":"none"),f.forEach(function(r){var i=document.getElementById(r);if(i){var o=i.querySelector("summary"),s=i.querySelector(".settings-chevron");if(e)i.classList.remove("settings-accordion--locked"),o&&o.removeEventListener("click",d),s&&a[r]!==void 0&&(s.innerHTML=a[r]);else if(i.classList.contains("settings-accordion--locked")||s&&(a[r]=s.innerHTML),i.classList.add("settings-accordion--locked"),i.open=!1,s&&(s.innerHTML=v),o){if(!o.querySelector(".settings-lock-tip")){var l=document.createElement("span");l.className="settings-lock-tip",l.textContent=g,o.appendChild(l)}o.removeEventListener("click",d),o.addEventListener("click",d)}var u=document.querySelector('.settings-subnav-link[data-target="'+r+'"]');u&&(u.style.opacity=e?"":"0.4",u.style.pointerEvents=e?"":"none")}})}if(document.addEventListener("DOMContentLoaded",function(){t();var e=window.VildaVault;e&&(typeof e.onUnlock=="function"&&e.onUnlock(t),typeof e.onLock=="function"&&e.onLock(t)),document.addEventListener("vilda:session-changed",t),document.addEventListener("vilda:auth-loaded",t),document.addEventListener("vilda:guest-mode-changed",t)},{once:!0}),document.readyState!=="loading"){t();var c=window.VildaVault;c&&(typeof c.onUnlock=="function"&&c.onUnlock(t),typeof c.onLock=="function"&&c.onLock(t))}})();
/* P-SYNC-WIDOK-KOLEJKI (E2-PR5a; plan docs/SYNC_PRZYROSTOWA_PLAN.md wiersz 9a; decyzje wlasciciela 1-6 z 2026-11-12):
   widok kolejki zdarzen w sekcji "Synchronizacja miedzy urzadzeniami" Ustawien. Kod w tym pliku, a nie w nowym: kazdy
   nowy plik w pamieci offline to dodatkowe zadanie instalacji SW ponad limit 600. USPIONE: bez wlaczonego dziennika
   (VildaSync.isEventLogEnabled() !== true) nic nowego nie widac i nie ma odczytu kolejki; bez odblokowania i bez flagi
   nie ma tez pytania o health.
   - Licznik: outboxCount() sejfu (pending + inflight). Znaczek w naglowku sekcji (#syncOutboxChip) tylko przy N > 0;
     linia w "Status synchronizacji" (#syncOutboxBox) przy wlaczonym dzienniku: N zmian czeka albo wszystko wyslane.
   - Ostatni blad (#syncOutboxError): tylko gdy cos czeka; wiersz pending albo inflight z najpozniejszym
     lastAttemptAtISO i kodem z Bkw_BLEDY (sesja, blokada, wylaczony dziennik itp. nie sa bledem dla uzytkownika).
     Lista wierszy czytana tylko wtedy, gdy cos czeka; z wiersza tylko stan, kod i chwila (bez tresci).
   - Odswiezanie: start, odblokowanie i blokada sejfu, otwarcie sekcji, powrot karty, zmiana flagi w innej karcie
     i co 5 s przy widocznej stronie; nowszy odczyt wygrywa (pokolenie).
   - Ukryty przelacznik "Wysylaj zmiany pojedynczo (test)" (#syncEventLogTestCard w opcjach zaawansowanych):
     odblokowanie 5 kliknieciami linii "Wersja aplikacji" (przerwa do 1,5 s) i potwierdzeniem w arkuszu, tylko przy
     odblokowanym sejfie; odblokowanie tylko w pamieci strony (blokada sejfu je zdejmuje). Karta widoczna po
     odblokowaniu albo przy fladze vilda-event-log-v1 = "1". Pole wyboru przy "events" w health (detectApi okna
     nadrzednego w ramce powloki, inaczej tej strony) albo przy wlaczonej fladze (zeby dalo sie wylaczyc); bez "events"
     notka. Wlaczenie: flaga "1"; wylaczenie: usuniecie klucza (bez "0": po wlaczeniu dla wszystkich urzadzenie idzie
     za domyslnym).
   - Zmiany do wyjasnienia (#syncProblemsBox, E2-PR5b; wiersz 9b): wiersze kolejki oversize, unreadable i rejected
     (outboxList) i kwarantanna ze wszystkich slotow (quarantineCount, quarantineList), tylko gdy ktoras lista nie jest
     pusta. Wiersz: rodzaj zmiany i karta (naglowki z listPatients i listExternalPatients; notatka pacjenta przez
     getPatientNote; brak karty - "karta usunieta"), stan i chwila. Zdarzenie: numer, powod, chwila; slot inny niz
     biezacy (getSyncMaterial) - "poprzednia tozsamosc konta". Lista budowana od nowa tylko po zmianie zestawu wierszy
     (fokus i przyciski nie znikaja co 5 s). "Porzuc" - outboxDiscard([eid], { potwierdzone: true }); "Zwolnij" -
     quarantineRelease([seq], { slotId }); oba po potwierdzeniu w arkuszu (fokus na "Anuluj"); odmowa albo wyjatek -
     komunikat przy wierszu, przycisk znowu czynny. Operacje kolejki i kwarantanny sprawdzaja sesje w sejfie
     (P-SESJA-ZAPISU).
   Tekst wylacznie przez textContent, widocznosc wylacznie przez atrybut hidden (bez stylow na elementach). Okno
   wylacznie przez w.* (test powloki uruchamia ten plik w vm z oknem bez document).
   Testy: tests/unit/sync-widok-kolejki.test.mjs, tests/e2e/sync-zdarzenia-wysylka.spec.mjs. */
(function (w) {
  'use strict';
  var Bkw_KLUCZ = 'vilda-event-log-v1';
  var Bkw_CO_MS = 5000, Bkw_KLIK_MS = 1500, Bkw_KLIKOW = 5;
  // Kody bledu wysylki zapisywane w wierszach kolejki (lastError) -> opis dla uzytkownika. Inne kody nie sa pokazywane.
  var Bkw_PACZKA = 'serwer nie przyj\u0105\u0142 paczki zmian';
  var Bkw_BLEDY = {
    NETWORK: 'brak po\u0142\u0105czenia z serwerem',
    TIMEOUT: 'serwer nie odpowiedzia\u0142 na czas',
    RATE_LIMITED: 'serwer poprosi\u0142 o chwil\u0119 przerwy',
    AUTH_FAILED: 'serwer nie rozpozna\u0142 tego urz\u0105dzenia',
    EVENTS_DISABLED: 'serwer nie przyjmuje teraz pojedynczych zmian',
    LOG_FULL: 'dziennik zmian na serwerze jest pe\u0142ny',
    SERVER: 'b\u0142\u0105d serwera',
    HTTP: 'b\u0142\u0105d serwera',
    INVALID_RESPONSE: 'nieczytelna odpowied\u017a serwera',
    PAYLOAD_TOO_LARGE: Bkw_PACZKA,
    UNSUPPORTED_MEDIA_TYPE: Bkw_PACZKA,
    INVALID_EVENTS: Bkw_PACZKA,
    NO_RESULT: 'serwer nie potwierdzi\u0142 cz\u0119\u015bci zmian',
    ERROR: 'nieoczekiwany b\u0142\u0105d wysy\u0142ania'
  };
  var Bkw_RADA = {
    AUTH_FAILED: 'Wysy\u0142anie ruszy po ponownym zalogowaniu.',
    EVENTS_DISABLED: 'Pe\u0142na synchronizacja dzia\u0142a dalej.'
  };
  var Bkw_RADA_ZWYKLA = 'Aplikacja spr\u00f3buje ponownie sama.';
  // Rodzaje zmian (jak w sejfie) -> opis; rodzaje z karta w kluczu encji (patientId albo patientId/snapshotId)
  // i z notatka pacjenta w kluczu (id notatki).
  var Bkw_RODZAJE = {
    snap: 'Wizyta', pfull: 'Karta', ptomb: 'Usuni\u0119cie karty', stomb: 'Usuni\u0119cie wizyty', pnote: 'Notatka pacjenta',
    pnotetomb: 'Usuni\u0119cie notatki pacjenta', note: 'Notatka w notatniku', notetomb: 'Usuni\u0119cie notatki z notatnika',
    plist: 'Lista pacjent\u00f3w', plisttomb: 'Usuni\u0119cie listy pacjent\u00f3w', pref: 'Ustawienie', pk: 'Klucz logowania',
    pktomb: 'Usuni\u0119cie klucza logowania', cred: 'Dane logowania konta'
  };
  var Bkw_KARTOWE = { snap: 1, pfull: 1, ptomb: 1, stomb: 1 }, Bkw_NOTATKOWE = { pnote: 1, pnotetomb: 1 };
  // Stany wierszy "Z tego urzadzenia" i powody kwarantanny -> opis.
  var Bkw_STANY = {
    oversize: 'za du\u017ca, \u017ceby wys\u0142a\u0107 j\u0105 pojedynczo', rejected: 'serwer odrzuci\u0142 zmian\u0119', unreadable: 'nie da si\u0119 odczyta\u0107 zmiany'
  };
  var Bkw_POWODY = {
    envelope: 'nieznany format', format: 'nieznany format', decrypt: 'nie uda\u0142o si\u0119 odszyfrowa\u0107', shape: 'nieczytelna tre\u015b\u0107'
  };
  var Bkw_pokolenie = 0, Bkw_pokolenieKarty = 0, Bkw_odblokowane = false, Bkw_klikow = 0, Bkw_ostatniKlik = 0;
  var Bkw_arkusz = null, Bkw_sejfPodlaczony = false, Bkw_podpis = null;

  function Bkw_el(id) {
    var d = w.document;
    return d && typeof d.getElementById == 'function' ? d.getElementById(id) : null;
  }
  function Bkw_sejf() {
    try {
      var v = w.VildaVault;
      return v && typeof v.isUnlocked == 'function' && v.isUnlocked() === true ? v : null;
    } catch (x) { return null; }
  }
  function Bkw_kolejka() {
    var v = Bkw_sejf(), L = v && v._eventLog;
    return L && typeof L == 'object' ? L : null;
  }
  function Bkw_dziennik() {
    try {
      var s = w.VildaSync;
      return !!s && typeof s.isEventLogEnabled == 'function' && s.isEventLogEnabled() === true;
    } catch (x) { return false; }
  }
  function Bkw_flaga() {
    try { return !!w.localStorage && w.localStorage.getItem(Bkw_KLUCZ) === '1'; } catch (x) { return false; }
  }
  // detectApi okna nadrzednego w ramce powloki (ta sama domena; jak wlacznik dziennika), inaczej tej strony.
  function Bkw_syncApi() {
    try {
      var t = w.top;
      if (t && t !== w && t.VildaSync && typeof t.VildaSync.detectApi == 'function') return t.VildaSync;
    } catch (x) { /* inna domena - strona */ }
    var s = w.VildaSync;
    return s && typeof s.detectApi == 'function' ? s : null;
  }
  function Bkw_liczba(x) { return typeof x == 'number' && isFinite(x) && x >= 0 && Math.floor(x) === x; }
  function Bkw_ma(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function Bkw_nowy(tag, klasa, tekst) {
    var e = w.document.createElement(tag);
    if (klasa) e.className = klasa;
    if (tekst) e.textContent = tekst;
    return e;
  }

  // Formy liczebnika: 1, 2-4 (bez 12-14), reszta.
  function Bkw_forma(n, f1, f2, f5) {
    if (n === 1) return f1;
    var j = n % 10, d = n % 100;
    return j >= 2 && j <= 4 && (d < 12 || d > 14) ? f2 : f5;
  }
  function Bkw_tekstZnaczka(n) { return n + ' ' + Bkw_forma(n, 'zmiana czeka', 'zmiany czekaj\u0105', 'zmian czeka'); }
  function Bkw_tekstLicznika(n) { return n > 0 ? Bkw_tekstZnaczka(n) + ' na wys\u0142anie.' : 'Wszystkie zmiany wys\u0142ane.'; }
  function Bkw_tekstPodpowiedzi(n) {
    return n > 0 ? Bkw_forma(n, 'Wysy\u0142a si\u0119 sama', 'Wysy\u0142aj\u0105 si\u0119 same', 'Wysy\u0142aj\u0105 si\u0119 same') + ', zwykle w ci\u0105gu kilku sekund.' : '';
  }
  function Bkw_dwa(x) { return (x < 10 ? '0' : '') + x; }
  // Chwila po polsku wzgledem teraz (ms): "dzis 12:41", "wczoraj 18:02" albo "11.11.2026, 18:02"; zla data - null.
  function Bkw_kiedy(iso, teraz) {
    var D = w.Date;
    var d = new D(iso);
    if (typeof iso != 'string' || !isFinite(d.getTime())) return null;
    var t = new D(typeof teraz == 'number' ? teraz : D.now());
    var godz = Bkw_dwa(d.getHours()) + ':' + Bkw_dwa(d.getMinutes());
    function dzien(x) { return x.getFullYear() * 10000 + x.getMonth() * 100 + x.getDate(); }
    if (dzien(d) === dzien(t)) return 'dzi\u015b ' + godz;
    if (dzien(d) === dzien(new D(t.getFullYear(), t.getMonth(), t.getDate() - 1))) return 'wczoraj ' + godz;
    return Bkw_dwa(d.getDate()) + '.' + Bkw_dwa(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + godz;
  }
  // Wiersz pending albo inflight ze znanym kodem i najpozniejsza proba: { kod, at } albo null.
  function Bkw_ostatniBlad(wiersze) {
    var naj = null, najT = -Infinity;
    if (!Array.isArray(wiersze)) return null;
    for (var i = 0; i < wiersze.length; i++) {
      var r = wiersze[i];
      if (!r || typeof r != 'object' || (r.state !== 'pending' && r.state !== 'inflight')) continue;
      var kod = r.lastError;
      if (typeof kod != 'string' || !Object.prototype.hasOwnProperty.call(Bkw_BLEDY, kod)) continue;
      var t = typeof r.lastAttemptAtISO == 'string' ? w.Date.parse(r.lastAttemptAtISO) : NaN;
      if (!isFinite(t) || t <= najT) continue;
      najT = t;
      naj = { kod: kod, at: r.lastAttemptAtISO };
    }
    return naj;
  }
  function Bkw_tekstBledu(b, teraz) {
    if (!b || !Object.prototype.hasOwnProperty.call(Bkw_BLEDY, b.kod)) return '';
    var k = Bkw_kiedy(b.at, teraz);
    return 'Ostatni b\u0142\u0105d' + (k ? ' (' + k + ')' : '') + ': ' + Bkw_BLEDY[b.kod] + '. '
      + (Object.prototype.hasOwnProperty.call(Bkw_RADA, b.kod) ? Bkw_RADA[b.kod] : Bkw_RADA_ZWYKLA);
  }
  function Bkw_tekst(el, t) { if (el && el.textContent !== t) el.textContent = t; }

  // stan null = dziennik wylaczony, sejf zablokowany albo odmowa kolejki: nic nowego nie widac.
  function Bkw_pokaz(stan) {
    var znaczek = Bkw_el('syncOutboxChipWrap'), box = Bkw_el('syncOutboxBox'), blad = Bkw_el('syncOutboxError');
    var n = stan ? stan.n : 0;
    Bkw_tekst(Bkw_el('syncOutboxChip'), Bkw_tekstZnaczka(n)); // przy n = 0 otoczka ukryta
    if (znaczek) znaczek.hidden = !(n > 0);
    if (box) box.hidden = !stan;
    if (!stan) return;
    Bkw_tekst(Bkw_el('syncOutboxCount'), Bkw_tekstLicznika(n));
    Bkw_tekst(Bkw_el('syncOutboxHint'), Bkw_tekstPodpowiedzi(n));
    var t = Bkw_tekstBledu(stan.blad); // blad tylko przy n > 0 (lista czytana tylko wtedy)
    if (blad) {
      Bkw_tekst(blad, t);
      blad.hidden = !t;
    }
  }
  function Bkw_wierszProblemu(r) { return !!r && typeof r == 'object' && typeof r.eid == 'string' && Bkw_ma(Bkw_STANY, r.state); }
  function Bkw_wierszKw(q) { return !!q && typeof q == 'object' && typeof q.slotId == 'string' && Bkw_liczba(q.seq); }
  async function Bkw_odswiez() {
    if (!Bkw_el('syncOutboxBox') && !Bkw_el('syncOutboxChipWrap') && !Bkw_el('syncProblemsBox')) return null;
    var nr = ++Bkw_pokolenie, stan = null;
    try {
      var L = Bkw_kolejka();
      if (L && typeof L.outboxCount == 'function' && Bkw_dziennik()) {
        var c = await L.outboxCount();
        if (nr !== Bkw_pokolenie) return null;
        if (c && c.ok === true && Bkw_liczba(c.pending)) {
          var n = c.pending + (Bkw_liczba(c.inflight) ? c.inflight : 0), wiersze = [], kw = [];
          var p = ['oversize', 'unreadable', 'rejected'].some(function (k) { return Bkw_liczba(c[k]) && c[k] > 0; });
          if ((n > 0 || p) && typeof L.outboxList == 'function') {
            var l = null;
            try { l = await L.outboxList(); } catch (x) { l = null; }
            if (nr !== Bkw_pokolenie) return null;
            if (l && l.ok === true && Array.isArray(l.wiersze)) wiersze = l.wiersze;
          }
          if (typeof L.quarantineCount == 'function') {
            var q = null;
            try { q = await L.quarantineCount(); } catch (x) { q = null; }
            if (nr !== Bkw_pokolenie) return null;
            if (q && q.ok === true && Bkw_liczba(q.total) && q.total > 0 && typeof L.quarantineList == 'function') {
              var ql = null;
              try { ql = await L.quarantineList(); } catch (x) { ql = null; }
              if (nr !== Bkw_pokolenie) return null;
              if (ql && ql.ok === true && Array.isArray(ql.wiersze)) kw = ql.wiersze.filter(Bkw_wierszKw);
            }
          }
          stan = { n: n, blad: Bkw_ostatniBlad(wiersze), wlasne: wiersze.filter(Bkw_wierszProblemu), kw: kw };
        }
      }
    } catch (x) { stan = null; }
    if (nr !== Bkw_pokolenie) return null;
    Bkw_pokaz(stan);
    await Bkw_pokazProblemy(stan, nr);
    return nr === Bkw_pokolenie ? stan : null;
  }

  // -- Zmiany do wyjasnienia (E2-PR5b) --
  function Bkw_rodzaj(kind) { return Bkw_ma(Bkw_RODZAJE, kind) ? Bkw_RODZAJE[kind] : 'Zmiana'; }
  // Tytul wiersza z karta: nazwa (tekst; pusty - karta bez nazwy) albo null (karty nie ma na tym urzadzeniu).
  function Bkw_tytul(kind, nazwa) {
    if (nazwa === null) return kind === 'pfull' || kind === 'ptomb' ? 'Karta usuni\u0119ta' : Bkw_rodzaj(kind) + ' (karta usuni\u0119ta)';
    return Bkw_rodzaj(kind) + ': ' + (nazwa || 'karta bez nazwy');
  }
  // eid -> tytul dla wierszy z karta; bez sejfu albo przy bledzie odczytu kart - pusto (sam rodzaj zmiany).
  async function Bkw_opisy(wlasne) {
    var v = Bkw_sejf(), wynik = {}, karty = new Map();
    var potrzeba = wlasne.some(function (r) { return Bkw_ma(Bkw_KARTOWE, r.kind) || Bkw_ma(Bkw_NOTATKOWE, r.kind); });
    if (!v || !potrzeba) return wynik;
    try {
      var zrodla = [];
      if (typeof v.listPatients == 'function') zrodla.push(v.listPatients());
      if (typeof v.listExternalPatients == 'function') zrodla.push(v.listExternalPatients());
      if (!zrodla.length) return wynik;
      (await Promise.all(zrodla)).forEach(function (lp) {
        (Array.isArray(lp) ? lp : []).forEach(function (k) {
          if (k && typeof k.patientId == 'string') karty.set(k.patientId, k.header && typeof k.header.name == 'string' ? k.header.name.trim() : '');
        });
      });
    } catch (x) { return wynik; }
    for (var i = 0; i < wlasne.length; i++) {
      var r = wlasne[i], pid = null;
      if (typeof r.entityKey != 'string') continue;
      if (Bkw_ma(Bkw_KARTOWE, r.kind)) pid = r.entityKey.split('/')[0];
      else if (Bkw_ma(Bkw_NOTATKOWE, r.kind) && typeof v.getPatientNote == 'function') {
        try {
          var nt = await v.getPatientNote(r.entityKey);
          pid = nt && typeof nt.patientId == 'string' ? nt.patientId : null;
        } catch (x) { pid = null; }
      }
      if (pid) wynik[r.eid] = Bkw_tytul(r.kind, karty.has(pid) ? karty.get(pid) : null);
    }
    return wynik;
  }
  // Biezacy slot konta (tylko identyfikator) albo null.
  async function Bkw_slot() {
    try {
      var v = Bkw_sejf();
      var m = v && typeof v.getSyncMaterial == 'function' ? await v.getSyncMaterial() : null;
      return m && typeof m.slotId == 'string' ? m.slotId : null;
    } catch (x) { return null; }
  }
  function Bkw_chwila(iso, przed) {
    var k = Bkw_kiedy(iso);
    return k ? ' \u00b7 ' + przed + k : '';
  }
  function Bkw_wiersz(tytul, opis, napis, etykieta, akcja) {
    var li = Bkw_nowy('li', 'settings-kosz-wpis'), o = Bkw_nowy('div', 'settings-kosz-wpis-opis');
    o.appendChild(Bkw_nowy('span', 'settings-kosz-wpis-karta', tytul));
    o.appendChild(Bkw_nowy('span', 'settings-kosz-wpis-meta', opis));
    var blad = Bkw_nowy('span', 'settings-kosz-wpis-blad');
    blad.setAttribute('role', 'alert');
    blad.hidden = true;
    o.appendChild(blad);
    var b = Bkw_nowy('button', 'vilda-auth-btn vilda-auth-btn-ghost vilda-auth-btn-small settings-backup-btn', napis);
    b.type = 'button';
    b.setAttribute('aria-label', etykieta);
    b.addEventListener('click', function () { akcja(b, blad); });
    li.appendChild(o);
    li.appendChild(b);
    return li;
  }
  function Bkw_lista(idBox, idTytul, idLista, tytul, elementy) {
    var box = Bkw_el(idBox), lista = Bkw_el(idLista);
    if (box) box.hidden = !elementy.length;
    Bkw_tekst(Bkw_el(idTytul), tytul + ' (' + elementy.length + ')');
    if (!lista) return;
    while (lista.firstChild) lista.removeChild(lista.firstChild);
    elementy.forEach(function (e) { lista.appendChild(e); });
  }
  async function Bkw_pokazProblemy(stan, nr) {
    var box = Bkw_el('syncProblemsBox');
    if (!box) return;
    var wlasne = stan ? stan.wlasne : [], kw = stan ? stan.kw : [];
    if (!wlasne.length && !kw.length) {
      box.hidden = true;
      Bkw_podpis = null;
      return;
    }
    var slot = kw.length ? await Bkw_slot() : null;
    if (nr !== Bkw_pokolenie) return;
    var podpis = JSON.stringify([slot, wlasne.map(function (r) {
      return [r.eid, r.state, r.kind, r.entityKey, r.lastAttemptAtISO || r.createdAtISO || null];
    }), kw.map(function (q) { return [q.slotId, q.seq, q.reason, q.firstSeenAtISO]; })]);
    if (podpis === Bkw_podpis && !box.hidden) return;
    var opisy = await Bkw_opisy(wlasne);
    if (nr !== Bkw_pokolenie) return;
    Bkw_podpis = podpis;
    Bkw_tekst(Bkw_el('syncProblemsTag'), String(wlasne.length + kw.length));
    Bkw_lista('syncProblemsOwn', 'syncProblemsOwnTitle', 'syncProblemsOwnList', 'Z tego urz\u0105dzenia', wlasne.map(function (r) {
      var t = Bkw_ma(opisy, r.eid) ? opisy[r.eid] : Bkw_rodzaj(r.kind);
      return Bkw_wiersz(t, Bkw_STANY[r.state] + Bkw_chwila(r.lastAttemptAtISO || r.createdAtISO, ''), 'Porzu\u0107', 'Porzu\u0107: ' + t,
        function (b, blad) { Bkw_porzuc(r, b, blad); });
    }));
    Bkw_lista('syncProblemsOther', 'syncProblemsOtherTitle', 'syncProblemsOtherList', 'Z innych urz\u0105dze\u0144', kw.map(function (q) {
      var t = 'Zdarzenie nr ' + q.seq + (slot && q.slotId !== slot ? ' (poprzednia to\u017csamo\u015b\u0107 konta)' : '');
      var o = (Bkw_ma(Bkw_POWODY, q.reason) ? Bkw_POWODY[q.reason] : 'nie uda\u0142o si\u0119 odczyta\u0107') + Bkw_chwila(q.firstSeenAtISO, 'od ');
      return Bkw_wiersz(t, o, 'Zwolnij', 'Zwolnij: ' + t, function (b, blad) { Bkw_zwolnij(q, b, blad); });
    }));
    box.hidden = false;
  }
  // Akcja po potwierdzeniu: przycisk wylaczony na czas operacji; wynik bez ok: true albo wyjatek - komunikat przy
  // wierszu i przycisk znowu czynny; sukces - lista od nowa.
  function Bkw_akcja(b, blad, wykonaj, tekstBledu) {
    b.disabled = true;
    blad.hidden = true;
    return Promise.resolve().then(wykonaj).then(null, function () { return null; }).then(function (r) {
      if (!r || r.ok !== true) {
        b.disabled = false;
        blad.textContent = tekstBledu;
        blad.hidden = false;
        return null;
      }
      Bkw_podpis = null;
      return Bkw_odswiez();
    });
  }
  function Bkw_porzuc(r, b, blad) {
    Bkw_pytanie({
      id: 'syncProblemConfirm', tytul: 'Porzuci\u0107 t\u0119 zmian\u0119?', tak: 'Porzu\u0107', niebezpieczne: true,
      tresc: 'Zmiana nie zostanie wys\u0142ana pojedynczo. Na inne urz\u0105dzenia trafi przy najbli\u017cszej pe\u0142nej synchronizacji.',
      naTak: function () {
        return Bkw_akcja(b, blad, function () {
          var L = Bkw_kolejka();
          return L && typeof L.outboxDiscard == 'function' ? L.outboxDiscard([r.eid], { potwierdzone: true }) : null;
        }, 'Nie uda\u0142o si\u0119 porzuci\u0107 zmiany. Spr\u00f3buj ponownie.');
      }
    });
  }
  function Bkw_zwolnij(q, b, blad) {
    Bkw_pytanie({
      id: 'syncProblemConfirm', tytul: 'Zwolni\u0107 to zdarzenie?', tak: 'Zwolnij', niebezpieczne: true,
      tresc: 'Do najbli\u017cszej pe\u0142nej synchronizacji karta pacjenta na tym urz\u0105dzeniu mo\u017ce by\u0107 niepe\u0142na albo mo\u017ce jej brakowa\u0107. Aplikacja przestanie pr\u00f3bowa\u0107 odczyta\u0107 to zdarzenie.',
      naTak: function () {
        return Bkw_akcja(b, blad, function () {
          var L = Bkw_kolejka();
          return L && typeof L.quarantineRelease == 'function' ? L.quarantineRelease([q.seq], { slotId: q.slotId }) : null;
        }, 'Nie uda\u0142o si\u0119 zwolni\u0107 zdarzenia. Spr\u00f3buj ponownie.');
      }
    });
  }

  // Karta ukrytego przelacznika: { serwer, flaga } albo null (ukryta).
  async function Bkw_karta() {
    var k = Bkw_el('syncEventLogTestCard');
    if (!k) return null;
    var nr = ++Bkw_pokolenieKarty;
    if (!Bkw_sejf()) Bkw_odblokowane = false;
    if (!Bkw_sejf() || !(Bkw_odblokowane || Bkw_flaga())) { k.hidden = true; return null; }
    var api, s = Bkw_syncApi();
    try { api = s ? await s.detectApi() : null; } catch (x) { api = null; }
    if (nr !== Bkw_pokolenieKarty) return null;
    var flaga = Bkw_flaga();
    if (!Bkw_sejf() || !(Bkw_odblokowane || flaga)) { k.hidden = true; return null; }
    var serwer = !!api && Array.isArray(api.features) && api.features.indexOf('events') !== -1;
    var wiersz = Bkw_el('syncEventLogTestRow'), pole = Bkw_el('syncEventLogTestToggle');
    if (wiersz) wiersz.hidden = !(serwer || flaga);
    if (pole) pole.checked = flaga;
    Bkw_tekst(Bkw_el('syncEventLogTestTag'), flaga ? 'W\u0142\u0105czone' : 'Wy\u0142\u0105czone');
    Bkw_tekst(Bkw_el('syncEventLogTestStatus'), !serwer ? 'Serwer nie obs\u0142uguje jeszcze tej opcji.'
      : (flaga && !Bkw_dziennik() ? 'Teraz nie dzia\u0142a: potrzebna jest w\u0142\u0105czona synchronizacja, bez trybu chmurowego i bez logowania jednorazowego.' : ''));
    k.hidden = false;
    return { serwer: serwer, flaga: flaga };
  }
  function Bkw_przelacz() {
    var pole = Bkw_el('syncEventLogTestToggle');
    if (!pole) return Promise.resolve(null);
    var wlacz = pole.checked === true;
    try {
      if (wlacz) w.localStorage.setItem(Bkw_KLUCZ, '1');
      else w.localStorage.removeItem(Bkw_KLUCZ);
    } catch (x) {
      pole.checked = !wlacz;
      Bkw_tekst(Bkw_el('syncEventLogTestStatus'), 'Nie uda\u0142o si\u0119 zapisa\u0107 tego ustawienia na tym urz\u0105dzeniu.');
      return Promise.resolve(null);
    }
    return Promise.all([Bkw_karta(), Bkw_odswiez()]);
  }

  function Bkw_pokazKarte() {
    var sek = Bkw_el('settings-section-sync'), zaaw = Bkw_el('syncSlotCard');
    if (sek) sek.open = true;
    if (zaaw) zaaw.open = true;
    return Bkw_karta().then(function (r) {
      var k = Bkw_el('syncEventLogTestCard'), pole = Bkw_el('syncEventLogTestToggle');
      if (r && k && typeof k.scrollIntoView == 'function') k.scrollIntoView({ block: 'center' });
      if (r && (r.serwer || r.flaga) && pole && typeof pole.focus == 'function') pole.focus();
      return r;
    });
  }
  function Bkw_zamknijArkusz(wynik) {
    var a = Bkw_arkusz;
    if (!a) return;
    Bkw_arkusz = null;
    if (a.tlo.parentNode) a.tlo.parentNode.removeChild(a.tlo);
    var d = w.document;
    if (d && d.body && d.body.classList) d.body.classList.remove('vilda-modal-alert-open');
    if (wynik) a.naTak();
    else if (a.przed && typeof a.przed.focus == 'function') a.przed.focus();
  }
  // Arkusz potwierdzenia (wzor AuthSheet): o = { id, tytul, tresc, tak, niebezpieczne, naTak }. Przy akcji
  // nieodwracalnej fokus startuje na "Anuluj".
  function Bkw_pytanie(o) {
    var d = w.document;
    if (!d || !d.body || typeof d.createElement != 'function' || Bkw_arkusz) return;
    var tlo = Bkw_nowy('div', 'vilda-auth-overlay vilda-auth-overlay-sheet');
    var ark = Bkw_nowy('div', 'vilda-auth-sheet');
    ark.setAttribute('role', 'alertdialog');
    ark.setAttribute('aria-modal', 'true');
    ark.setAttribute('aria-labelledby', o.id + 'Title');
    ark.setAttribute('aria-describedby', o.id + 'Body');
    var h = Bkw_nowy('h3', 'vilda-auth-sheet-title', o.tytul);
    h.id = o.id + 'Title';
    var p = Bkw_nowy('p', 'vilda-auth-sheet-body', o.tresc);
    p.id = o.id + 'Body';
    var akcje = Bkw_nowy('div', 'vilda-auth-sheet-actions');
    var tak = Bkw_nowy('button', o.niebezpieczne ? 'vilda-auth-btn settings-kosz-btn-usun' : 'vilda-auth-btn vilda-auth-btn-primary', o.tak);
    var nie = Bkw_nowy('button', 'vilda-auth-btn vilda-auth-btn-ghost', 'Anuluj');
    tak.type = 'button';
    nie.type = 'button';
    tak.addEventListener('click', function () { Bkw_zamknijArkusz(true); });
    nie.addEventListener('click', function () { Bkw_zamknijArkusz(false); });
    tlo.addEventListener('click', function (e) { if (e.target === tlo) Bkw_zamknijArkusz(false); });
    tlo.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); Bkw_zamknijArkusz(false); return; }
      if (e.key !== 'Tab') return;
      // Fokus zostaje w arkuszu: dwa przyciski na zmiane.
      e.preventDefault();
      (d.activeElement === tak ? nie : tak).focus();
    });
    akcje.appendChild(tak);
    akcje.appendChild(nie);
    ark.appendChild(h);
    ark.appendChild(p);
    ark.appendChild(akcje);
    tlo.appendChild(ark);
    Bkw_arkusz = { tlo: tlo, przed: d.activeElement, naTak: o.naTak };
    d.body.appendChild(tlo);
    if (d.body.classList) d.body.classList.add('vilda-modal-alert-open');
    (o.niebezpieczne ? nie : tak).focus();
  }
  function Bkw_pytaj() {
    Bkw_pytanie({
      id: 'syncEventLogUnlock', tytul: 'Odblokowa\u0107 opcje testowe?', tak: 'Odblokuj',
      tresc: 'Na tym urz\u0105dzeniu poka\u017ce si\u0119 prze\u0142\u0105cznik \u201eWysy\u0142aj zmiany pojedynczo (test)\u201d w opcjach zaawansowanych synchronizacji. Nikt inny go nie zobaczy.',
      naTak: function () {
        Bkw_odblokowane = true;
        Bkw_pokazKarte();
      }
    });
  }
  // 5 klikniec linii "Wersja aplikacji", kazde do 1,5 s po poprzednim.
  function Bkw_klik() {
    var t = w.Date.now();
    Bkw_klikow = t - Bkw_ostatniKlik <= Bkw_KLIK_MS ? Bkw_klikow + 1 : 1;
    Bkw_ostatniKlik = t;
    if (Bkw_klikow < Bkw_KLIKOW) return;
    Bkw_klikow = 0;
    if (!Bkw_sejf() || Bkw_arkusz) return;
    if (Bkw_odblokowane) Bkw_pokazKarte();
    else Bkw_pytaj();
  }

  function Bkw_wszystko() {
    Bkw_podlaczSejf();
    Bkw_odswiez();
    Bkw_karta();
  }
  // Odblokowanie zdejmuje Bkw_karta przy zablokowanym sejfie (tu przez Bkw_wszystko).
  function Bkw_poBlokadzie() {
    Bkw_zamknijArkusz(false);
    Bkw_wszystko();
  }
  function Bkw_tik() {
    Bkw_podlaczSejf();
    Bkw_odswiez();
    if (Bkw_odblokowane || Bkw_flaga()) Bkw_karta();
  }
  // Sejf bywa wczytany po tym pliku: podlaczenie przy starcie albo przy pierwszym zdarzeniu konta.
  function Bkw_podlaczSejf() {
    var v = w.VildaVault;
    if (Bkw_sejfPodlaczony || !v) return;
    Bkw_sejfPodlaczony = true;
    if (typeof v.onUnlock == 'function') v.onUnlock(Bkw_wszystko);
    if (typeof v.onLock == 'function') v.onLock(Bkw_poBlokadzie);
  }
  function Bkw_start() {
    var d = w.document;
    if (!d || typeof d.getElementById != 'function') return;
    if (!Bkw_el('syncOutboxBox') && !Bkw_el('syncEventLogTestCard') && !Bkw_el('syncProblemsBox')) return;
    var wersja = Bkw_el('settingsAppVersion'), pole = Bkw_el('syncEventLogTestToggle'), sek = Bkw_el('settings-section-sync');
    if (wersja && typeof wersja.addEventListener == 'function') wersja.addEventListener('click', Bkw_klik);
    if (pole && typeof pole.addEventListener == 'function') pole.addEventListener('change', Bkw_przelacz);
    if (sek && typeof sek.addEventListener == 'function') sek.addEventListener('toggle', function () { if (sek.open) Bkw_odswiez(); });
    if (typeof d.addEventListener == 'function') {
      d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'visible') Bkw_wszystko(); });
      d.addEventListener('vilda:auth-loaded', Bkw_wszystko);
      d.addEventListener('vilda:session-changed', Bkw_wszystko);
    }
    if (typeof w.addEventListener == 'function') {
      w.addEventListener('storage', function (e) { if (!e || e.key === Bkw_KLUCZ || e.key === null) Bkw_wszystko(); });
    }
    if (typeof w.setInterval == 'function') {
      w.setInterval(function () { if (d.visibilityState !== 'hidden') Bkw_tik(); }, Bkw_CO_MS);
    }
    Bkw_wszystko();
  }

  w.VildaWidokKolejki = Object.freeze({
    odswiez: Bkw_odswiez, karta: Bkw_karta, kiedy: Bkw_kiedy, ostatniBlad: Bkw_ostatniBlad,
    tekstZnaczka: Bkw_tekstZnaczka, tekstLicznika: Bkw_tekstLicznika, tekstPodpowiedzi: Bkw_tekstPodpowiedzi,
    tekstBledu: Bkw_tekstBledu, tytulZmiany: Bkw_tytul
  });
  if (w.document && w.document.readyState === 'loading' && typeof w.document.addEventListener == 'function') {
    w.document.addEventListener('DOMContentLoaded', Bkw_start);
  } else {
    Bkw_start();
  }
})(window);
/* /P-SYNC-WIDOK-KOLEJKI */
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
