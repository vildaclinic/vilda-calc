/* vilda_kosz_zapisow.js — usuwanie pomylonego zapisu do kosza i kosz zapisów. P-KOSZ-ZAPISOW, decyzje właściciela
 * 2026-09-30 (makieta zaakceptowana w całości).
 *
 * CO ROBI
 *   • otworzUsuwanie(): okno usunięcia pomylonego zapisu, wołane ze „Sprawdzenia spójności zapisów”. Przed
 *     usunięciem czyta obie karty na nowo i porównuje pomiary wzrostu i masy pomylonego zapisu z kartą osoby, której
 *     zapis dotyczy. Usuwa tylko wtedy, gdy wszystkie te pomiary są w tamtej karcie; w przeciwnym razie — oraz gdy
 *     ta osoba nie ma w sejfie własnej karty — pokazuje blokadę i nic nie zmienia. Zapis przypięty wymaga jawnego
 *     „Odepnij i usuń do kosza”.
 *   • Usunięty zapis trafia do kosza na 30 dni (VildaVault.moveSnapshotToTrash: nagrobek w synchronizacji, treść
 *     zaszyfrowana w nagrobku). Usunięcie i przywrócenie idą do dziennika dostępu.
 *   • Kosz w Ustawieniach (#recordTrashCard) i w historii wersji karty (wstawDoHistorii, wołane przez
 *     vilda_version_history_ui.js) — z „Przywróć”.
 *   • Na życzenie przed usunięciem pobiera kopię karty (.wiw) pod osobną nazwą, której automatyczna kopia
 *     pacjenta (wagaiwzrost_pacjent_<skrót>.wiw) nie nadpisze. Nieudana kopia = brak usunięcia.
 *
 * CZEGO NIE ROBI
 *   • Nie porównuje innych danych zapisu (terapie, badania, plan) — okno mówi to wprost; zostają w koszu 30 dni.
 *   • Nie ma „Opróżnij kosz” (decyzja właściciela) — treść znika sama po 30 dniach.
 *   • Nazwiska i dane pacjentów trafiają do DOM wyłącznie przez textContent.
 */
(function (w) {
  'use strict';
  if (!w) return;
  if (w.VildaKoszZapisow && w.VildaKoszZapisow.__init) return;

  var VERSION = '1';
  var NBSP = '\u00a0';
  var ZDARZENIE = 'vilda:kosz-zapisow';
  var TOLERANCJA = 0.05;
  var doc = w.document;

  // ── Pomiary zapisu (czyste funkcje) ────────────────────────────────────────────────────────────

  function liczba(v) {
    if (v == null || v === '') return null;
    var n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) && n > 0 ? n : null;
  }

  function calkowita(v) {
    if (v == null || v === '') return null;
    var n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) && n >= 0 ? n : null;
  }

  // Pomiar = (wiek w pełnych miesiącach, wzrost, masa). Źródła: bieżąca wizyta (user: age lat + ageMonths
  // miesięcy) oraz wiersze historii pomiarów (advanced i growthBasic: ageMonths łącznie). Bez wieku albo bez
  // wzrostu i masy — to nie jest pomiar.
  function pomiaryZapisu(payload) {
    var wynik = [];
    var klucze = Object.create(null);
    function dodaj(miesiace, wzrost, masa) {
      if (miesiace == null || (wzrost == null && masa == null)) return;
      var m = Math.round(miesiace);
      var k = m + '|' + (wzrost == null ? '' : wzrost.toFixed(2)) + '|' + (masa == null ? '' : masa.toFixed(2));
      if (klucze[k]) return;
      klucze[k] = true;
      wynik.push({ miesiace: m, wzrost: wzrost, masa: masa });
    }
    if (!payload || typeof payload !== 'object') return wynik;
    var u = payload.user && typeof payload.user === 'object' ? payload.user : {};
    var lata = calkowita(u.age);
    if (lata != null) dodaj(lata * 12 + (calkowita(u.ageMonths) || 0), liczba(u.height), liczba(u.weight));
    ['advanced', 'growthBasic'].forEach(function (sekcja) {
      var s = payload[sekcja];
      var rows = s && s.data && Array.isArray(s.data.measurements) ? s.data.measurements : [];
      rows.forEach(function (r) {
        if (!r || typeof r !== 'object') return;
        dodaj(calkowita(r.ageMonths), liczba(r.height), liczba(r.weight));
      });
    });
    wynik.sort(function (a, b) { return a.miesiace - b.miesiace; });
    return wynik;
  }

  function rowne(a, b) {
    if (a == null || b == null) return a == null && b == null;
    return Math.abs(a - b) <= TOLERANCJA;
  }

  function tenSamPomiar(a, b) {
    return a.miesiace === b.miesiace && rowne(a.wzrost, b.wzrost) && rowne(a.masa, b.masa);
  }

  // Każdy pomiar pomylonego zapisu: czy jest gdziekolwiek w karcie drugiej osoby (w dowolnym jej zapisie).
  function pokrycie(pomiary, pomiaryInnejKarty) {
    var inne = Array.isArray(pomiaryInnejKarty) ? pomiaryInnejKarty : [];
    var wiersze = (Array.isArray(pomiary) ? pomiary : []).map(function (p) {
      return { miesiace: p.miesiace, wzrost: p.wzrost, masa: p.masa, jest: inne.some(function (q) { return tenSamPomiar(p, q); }) };
    });
    return { wiersze: wiersze, brakuje: wiersze.filter(function (x) { return !x.jest; }).length };
  }

  // ── Teksty ────────────────────────────────────────────────────────────────────────────────────

  function odmiana(n, jeden, kilka, wiele) {
    var d = n % 10, s = n % 100;
    if (n === 1) return jeden;
    if (d >= 2 && d <= 4 && (s < 12 || s > 14)) return kilka;
    return wiele;
  }

  function formatWieku(miesiace) {
    var l = Math.floor(miesiace / 12), m = miesiace % 12;
    if (!l) return m + NBSP + 'mies.';
    return l + NBSP + 'l.' + (m ? ' ' + m + NBSP + 'mies.' : '');
  }

  function formatPomiaru(p) {
    var czesci = [];
    if (p.wzrost != null) czesci.push(p.wzrost.toFixed(1).replace('.', ',') + NBSP + 'cm');
    if (p.masa != null) czesci.push(p.masa.toFixed(1).replace('.', ',') + NBSP + 'kg');
    return czesci.join(' · ');
  }

  function formatChwili(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '—';
    try {
      return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit' }).format(d);
    } catch (e) {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  function formatDaty(dob) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob || '');
    return m ? m[3] + '.' + m[2] + '.' + m[1] : null;
  }

  function dniDoKonca(expiresAtISO, terazMs) {
    var t = Date.parse(expiresAtISO);
    if (!isFinite(t)) return 0;
    return Math.max(0, Math.ceil((t - (terazMs == null ? Date.now() : terazMs)) / 864e5));
  }

  function tekstPozostalo(n) {
    if (n <= 0) return 'znika dziś';
    return odmiana(n, 'został', 'zostały', 'zostało') + ' ' + n + ' ' + odmiana(n, 'dzień', 'dni', 'dni');
  }

  function nazwaZapisu(payload) {
    if (!payload || typeof payload !== 'object') return '';
    var n = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (n) return n;
    var u = payload.user || {};
    return [u.lastName, u.firstName].filter(function (x) { return typeof x === 'string' && x.trim(); }).join(' ');
  }

  function daneZapisu(payload) {
    var u = payload && payload.user && typeof payload.user === 'object' ? payload.user : {};
    var czesci = [];
    var dob = formatDaty(u.dobISO);
    if (dob) czesci.push('ur. ' + dob);
    var s = String(u.sex || '').toUpperCase();
    if (s === 'F' || s === 'K') czesci.push('K'); else if (s === 'M') czesci.push('M');
    var p = formatPomiaru({ wzrost: liczba(u.height), masa: liczba(u.weight) });
    if (p) czesci.push(p);
    return czesci.join(' · ');
  }

  function nazwaPliku(skrot, terazMs) {
    var d = new Date(terazMs == null ? Date.now() : terazMs);
    var dw = function (x) { return (x < 10 ? '0' : '') + x; };
    var h = /^[0-9a-f]+$/i.test(skrot || '') ? skrot : '00000000';
    return 'wagaiwzrost_pacjent_' + h + '_przed_usunieciem_' + d.getFullYear() + '-' + dw(d.getMonth() + 1) + '-' +
      dw(d.getDate()) + '_' + dw(d.getHours()) + dw(d.getMinutes()) + '.wiw';
  }

  // ── Operacje na sejfie (zapis) ────────────────────────────────────────────────────────────────

  function sejf() { return w.VildaVault || null; }

  function odblokowany() {
    var v = sejf();
    try { return !!(v && typeof v.isUnlocked === 'function' && v.isUnlocked()); } catch (e) { return false; }
  }

  function dziennik(zdarzenie, dane) {
    try { if (w.VildaAuditLog && typeof w.VildaAuditLog.log === 'function') w.VildaAuditLog.log(zdarzenie, dane); } catch (e) { /* dziennik nie blokuje */ }
  }

  function oglosZmiane(szczegoly) {
    try {
      if (doc && typeof w.CustomEvent === 'function') doc.dispatchEvent(new w.CustomEvent(ZDARZENIE, { detail: szczegoly || {} }));
    } catch (e) { /* bez zdarzenia */ }
  }

  async function doKosza(patientId, snapshotId, opcje) {
    var wynik = await sejf().moveSnapshotToTrash(patientId, snapshotId, opcje || {});
    dziennik('snapshot.trash', { patientId: patientId, snapshotId: snapshotId });
    oglosZmiane({ akcja: 'usun', patientId: patientId, snapshotId: snapshotId });
    return wynik;
  }

  async function przywroc(patientId, snapshotId) {
    var wynik = await sejf().restoreTrashedSnapshot(patientId, snapshotId);
    dziennik('snapshot.restore', { patientId: patientId, snapshotId: snapshotId });
    oglosZmiane({ akcja: 'przywroc', patientId: patientId, snapshotId: snapshotId });
    return wynik;
  }

  async function wpisy(patientId) {
    if (!odblokowany() || typeof sejf().listTrashedSnapshots !== 'function') return [];
    var lista = await sejf().listTrashedSnapshots();
    return lista.filter(function (e) { return e.patientExists && (!patientId || e.patientId === patientId); });
  }

  // ── Widok: pomocnicze ─────────────────────────────────────────────────────────────────────────

  function el(tag, klasa, tresc) {
    var e = doc.createElement(tag);
    if (klasa) e.className = klasa;
    if (tresc != null) e.textContent = tresc;
    return e;
  }

  var SVG = 'http://www.w3.org/2000/svg';
  var IKONY = {
    ok: ['M20 6 9 17l-5-5'],
    wroc: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
    kosz: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
    dziennik: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8'],
    uwaga: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
    pinezka: ['M12 17v5', 'M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'],
    info: ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0', 'M12 16v-4', 'M12 8h.01'],
  };

  function ikona(nazwa, klasa) {
    var s = doc.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    s.setAttribute('class', 'settings-kosz-ikona' + (klasa ? ' ' + klasa : ''));
    (IKONY[nazwa] || []).forEach(function (d) {
      var p = doc.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      s.appendChild(p);
    });
    return s;
  }

  function przycisk(tekst, klasa, akcja) {
    var b = el('button', 'vilda-auth-btn vilda-auth-btn-small settings-backup-btn' + (klasa ? ' ' + klasa : ''), tekst);
    b.type = 'button';
    if (akcja) b.addEventListener('click', akcja);
    return b;
  }

  // ── Okno (nakładka w dokumencie, z pułapką fokusu) ────────────────────────────────────────────

  var licznikOkien = 0;

  function okno(opcje) {
    licznikOkien += 1;
    var poprzedni = doc.activeElement;
    var nakladka = el('div', 'settings-kosz-nakladka');
    var o = el('div', 'settings-kosz-okno');
    var idTytulu = 'koszOknoTytul' + licznikOkien;
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.setAttribute('aria-labelledby', idTytulu);
    var naglowek = el('div', 'settings-kosz-okno-naglowek');
    if (opcje.ikona) naglowek.appendChild(ikona(opcje.ikona, 'settings-kosz-ikona--naglowek'));
    var teksty = el('div', 'settings-kosz-okno-teksty');
    var h = el('h2', 'settings-kosz-tytul', opcje.tytul);
    h.id = idTytulu;
    teksty.appendChild(h);
    if (opcje.podtytul) teksty.appendChild(el('span', 'settings-kosz-podtytul', opcje.podtytul));
    naglowek.appendChild(teksty);
    o.appendChild(naglowek);
    if (opcje.nota) o.appendChild(opcje.nota);
    (opcje.tresc || []).forEach(function (n) { if (n) o.appendChild(n); });
    var blad = el('p', 'settings-kosz-blad');
    blad.setAttribute('role', 'alert');
    blad.hidden = true;
    o.appendChild(blad);
    var rzad = el('div', 'settings-kosz-przyciski');
    var przyciski = (opcje.przyciski || []).map(function (p) {
      var b = przycisk(p.tekst, p.klasa, function () { p.akcja(api); });
      rzad.appendChild(b);
      return b;
    });
    o.appendChild(rzad);
    nakladka.appendChild(o);

    var otwarte = true;
    function zamknij() {
      if (!otwarte) return;
      otwarte = false;
      doc.removeEventListener('keydown', klawisz, true);
      if (nakladka.parentNode) nakladka.parentNode.removeChild(nakladka);
      try { if (poprzedni && typeof poprzedni.focus === 'function' && doc.contains(poprzedni)) poprzedni.focus(); } catch (e) { /* bez fokusu */ }
      if (typeof opcje.poZamknieciu === 'function') opcje.poZamknieciu();
    }
    function fokusowalne() {
      return Array.prototype.filter.call(o.querySelectorAll('button, input, a[href]'), function (x) { return !x.disabled; });
    }
    function klawisz(e) {
      if (e.key === 'Escape') {
        if (api.zajete) return;
        e.stopPropagation();
        e.preventDefault();
        zamknij();
        return;
      }
      if (e.key !== 'Tab') return;
      var f = fokusowalne();
      if (!f.length) return;
      var pierwszy = f[0], ostatni = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === pierwszy) { e.preventDefault(); ostatni.focus(); }
      else if (!e.shiftKey && doc.activeElement === ostatni) { e.preventDefault(); pierwszy.focus(); }
      else if (!o.contains(doc.activeElement)) { e.preventDefault(); pierwszy.focus(); }
    }
    nakladka.addEventListener('click', function (e) { if (e.target === nakladka && !api.zajete) zamknij(); });
    doc.addEventListener('keydown', klawisz, true);
    doc.body.appendChild(nakladka);

    var api = {
      element: o,
      zajete: false,
      zamknij: zamknij,
      przyciski: przyciski,
      pokazBlad: function (t) { blad.textContent = t || ''; blad.hidden = !t; },
      zajmij: function (tak) {
        api.zajete = !!tak;
        przyciski.forEach(function (b) { b.disabled = !!tak; });
      },
    };
    var start = przyciski[opcje.fokus == null ? 0 : opcje.fokus] || przyciski[0];
    try { if (start) start.focus(); } catch (e) { /* bez fokusu */ }
    return api;
  }

  function punkt(nazwaIkony, tekst, klasa) {
    var li = el('li', 'settings-kosz-punkt' + (klasa ? ' ' + klasa : ''));
    li.appendChild(ikona(nazwaIkony));
    li.appendChild(el('span', null, tekst));
    return li;
  }

  function blokZapisu(zapis, przypiety) {
    var box = el('div', 'settings-kosz-zapis');
    var meta = el('span', 'settings-kosz-zapis-meta');
    var znak = meta.appendChild(el('span', null, '●'));
    znak.setAttribute('aria-hidden', 'true');
    meta.appendChild(doc.createTextNode(' inna osoba · zapis z ' + formatChwili(zapis.savedAtISO)));
    if (przypiety) {
      meta.appendChild(doc.createTextNode(' · '));
      meta.appendChild(ikona('pinezka', 'settings-kosz-ikona--mala'));
      meta.appendChild(doc.createTextNode(' przypięty'));
    }
    box.appendChild(meta);
    box.appendChild(el('span', 'settings-kosz-zapis-nazwa', nazwaZapisu(zapis.payload) || '—'));
    var dane = daneZapisu(zapis.payload);
    if (dane) box.appendChild(el('span', 'settings-kosz-zapis-dane', dane));
    return box;
  }

  function tabelaPomiarow(wiersze, nazwaInnej) {
    var t = el('table', 'settings-kosz-tabela');
    var thead = el('thead'), tr = el('tr');
    ['Wiek przy pomiarze', 'W pomylonym zapisie', 'W karcie „' + nazwaInnej + '”'].forEach(function (x) {
      var th = el('th', null, x);
      th.scope = 'col';
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    t.appendChild(thead);
    var tbody = el('tbody');
    wiersze.forEach(function (r) {
      var row = el('tr', r.jest ? 'settings-kosz-wiersz--jest' : 'settings-kosz-wiersz--brak');
      row.appendChild(el('td', 'settings-kosz-kol-wiek', formatWieku(r.miesiace)));
      row.appendChild(el('td', 'settings-kosz-kol-pomiar', formatPomiaru(r)));
      var stan = el('td', 'settings-kosz-kol-stan');
      var z = stan.appendChild(el('span', null, r.jest ? '✓' : '●'));
      z.setAttribute('aria-hidden', 'true');
      stan.appendChild(doc.createTextNode(r.jest ? ' jest' : ' brak'));
      row.appendChild(stan);
      tbody.appendChild(row);
    });
    t.appendChild(tbody);
    return t;
  }

  function otworzKarte(patientId) {
    var A = w.VildaAuthUI;
    // Bez funkcji wczytania karta jest tylko do podglądu.
    if (A && typeof A.showPatientCard === 'function') A.showPatientCard(patientId, null, null);
  }

  function otworzHistorie(patientId, nazwa) {
    var H = w.VildaVersionHistory;
    if (H && typeof H.open === 'function') H.open(patientId, { patientName: nazwa });
  }

  // W trybie „tylko chmura” aplikacja nie zapisuje plików kopii (VildaFileExport odmawia) — pole wtedy znika.
  function trybTylkoChmura() {
    var P = w.VildaPersistence;
    try { return !!(P && typeof P.isCloudOnlyMode === 'function' && P.isCloudOnlyMode()); } catch (e) { return false; }
  }

  // ── Usuwanie pomylonego zapisu ────────────────────────────────────────────────────────────────

  // Decyzja na świeżym odczycie obu kart: 'brak' | 'bez-karty' | 'braki' | 'mozna'.
  function ocenUsuniecie(kartaA, snapshotId, kartaB) {
    var wersje = kartaA && Array.isArray(kartaA.snapshots) ? kartaA.snapshots : [];
    var zapis = wersje.filter(function (s) { return s.snapshotId === snapshotId; })[0];
    if (!zapis || !zapis.payload) return { stan: 'brak' };
    if (wersje.length <= 1) return { stan: 'brak', zapis: zapis };
    var pomiary = pomiaryZapisu(zapis.payload);
    var reszta = wersje.filter(function (s) { return s.snapshotId !== snapshotId; });
    var najnowszy = wersje[0] && wersje[0].snapshotId === snapshotId;
    var poUsunieciu = reszta[0] || null;
    var wynik = {
      zapis: zapis,
      przypiety: !!(zapis.pinned || zapis.payload._pinned),
      pomiary: pomiary,
      zmianaNazwy: najnowszy && poUsunieciu ? { nazwa: nazwaZapisu(poUsunieciu.payload), savedAtISO: poUsunieciu.savedAtISO } : null,
    };
    if (!kartaB) return Object.assign(wynik, { stan: 'bez-karty' });
    var inne = [];
    (kartaB.snapshots || []).forEach(function (s) { inne = inne.concat(pomiaryZapisu(s && s.payload)); });
    var p = pokrycie(pomiary, inne);
    return Object.assign(wynik, { stan: p.brakuje ? 'braki' : 'mozna', pokrycie: p });
  }

  // P-KOSZ-POPRAWKI (uwaga Codex P1 do #501). Ta sama decyzja co przy otwarciu okna: dalej „można”, ta sama wersja
  // zapisu (rewizja i chwila zmiany), to samo przypięcie i ta sama nazwa karty po usunięciu.
  function wersjaOceny(o) {
    return o && o.zapis ? [o.zapis.rev, o.zapis.updatedAtISO || o.zapis.savedAtISO || null] : null;
  }
  function takaSamaOcena(a, b) {
    return !!a && !!b && b.stan === 'mozna' && a.stan === b.stan && a.przypiety === b.przypiety
      && JSON.stringify(wersjaOceny(a)) === JSON.stringify(wersjaOceny(b))
      && JSON.stringify(a.zmianaNazwy || null) === JSON.stringify(b.zmianaNazwy || null);
  }

  async function wczytajOcene(v, op) {
    var kartaA = await v.getPatient(op.patientId);
    var kartaB = op.innaKarta && op.innaKarta.patientId ? await v.getPatient(op.innaKarta.patientId) : null;
    return { kartaA: kartaA, ocena: ocenUsuniecie(kartaA, op.snapshotId, kartaB) };
  }

  async function otworzUsuwanie(opcje) {
    var op = opcje || {};
    if (!odblokowany()) throw new Error('Zaloguj się, aby usunąć zapis.');
    var v = sejf();
    var odczyt = await wczytajOcene(v, op);
    var kartaA = odczyt.kartaA;
    var nazwaA = op.nazwaKarty || (kartaA && kartaA.header && kartaA.header.name) || '';
    var nazwaB = op.innaKarta && op.innaKarta.nazwa ? op.innaKarta.nazwa : '';
    var ocena = odczyt.ocena;
    var zamknij = function (o) { o.zamknij(); };
    // Okno otwarte ponownie, bo przy potwierdzeniu karty wyglądały już inaczej niż przy otwarciu (P-KOSZ-POPRAWKI).
    var nota = null;
    if (op.zmienione) {
      nota = el('div', 'settings-kosz-uwaga');
      nota.setAttribute('role', 'status');
      nota.appendChild(ikona('info'));
      nota.appendChild(el('span', null, 'Zapis albo karta zmieniły się, gdy to okno było otwarte (np. przez synchronizację). Nic nie zostało usunięte — poniżej aktualny stan.'));
    }
    function otworzPonownie(o) {
      o.zajmij(false);
      o.zamknij();
      otworzUsuwanie(Object.assign({}, op, { zmienione: true })).catch(function (e) {
        try { w.console.warn('[kosz zapisów] ponowne otwarcie okna', e); } catch (e2) { /* cicho */ }
      });
    }

    if (ocena.stan === 'brak') {
      return okno({
        nota: nota,
        tytul: 'Tego zapisu nie ma już w karcie',
        podtytul: 'Karta: ' + nazwaA,
        ikona: 'info',
        tresc: [el('p', 'settings-kosz-tekst', 'Mógł zostać usunięty na innym urządzeniu albo to jedyny zapis tej karty. Sprawdź zapisy ponownie, by zobaczyć aktualny stan.')],
        przyciski: [{ tekst: 'Zamknij', akcja: zamknij }],
      });
    }

    var nazwaZ = nazwaZapisu(ocena.zapis.payload);
    var podtytulBlokady = 'Karta: ' + nazwaA + ' · zapis z ' + formatChwili(ocena.zapis.savedAtISO) + (nazwaZ ? ' („' + nazwaZ + '”)' : '');

    if (ocena.stan === 'bez-karty') {
      return okno({
        nota: nota,
        tytul: 'Tego zapisu nie można usunąć',
        podtytul: podtytulBlokady,
        ikona: 'uwaga',
        tresc: [
          el('p', 'settings-kosz-tekst', 'Osoba z tego zapisu' + (nazwaZ ? ' („' + nazwaZ + '”)' : '') + ' nie ma w sejfie własnej karty. Usunięcie skasowałoby jedyną kopię jej danych.'),
          el('p', 'settings-kosz-tekst settings-kosz-tekst--cichy', 'Najpierw załóż kartę tej osoby i przepisz do niej jej pomiary, a potem sprawdź zapisy ponownie. Dane zapisu obejrzysz w historii wersji karty.'),
        ],
        przyciski: [
          { tekst: 'Zamknij', akcja: zamknij },
          { tekst: 'Otwórz historię wersji', akcja: function (o) { o.zamknij(); otworzHistorie(op.patientId, nazwaA); } },
        ],
      });
    }

    if (ocena.stan === 'braki') {
      var n = ocena.pokrycie.brakuje;
      return okno({
        nota: nota,
        tytul: 'Tego zapisu nie można jeszcze usunąć',
        podtytul: podtytulBlokady,
        ikona: 'uwaga',
        tresc: [
          el('p', 'settings-kosz-tekst', n === 1
            ? 'Ten zapis ma pomiar, którego nie ma w karcie „' + nazwaB + '”. Usunięcie skasowałoby jego jedyną kopię.'
            : 'Ten zapis ma pomiary, których nie ma w karcie „' + nazwaB + '”. Usunięcie skasowałoby ich jedyną kopię.'),
          tabelaPomiarow(ocena.pokrycie.wiersze, nazwaB),
          el('p', 'settings-kosz-tekst settings-kosz-tekst--cichy', 'Dopisz ' + (n === 1 ? 'brakujący pomiar' : 'brakujące pomiary') +
            ' w karcie „' + nazwaB + '”, a potem sprawdź zapisy ponownie — wtedy zapis będzie można usunąć.'),
        ],
        przyciski: [
          { tekst: 'Zamknij', akcja: zamknij },
          { tekst: 'Otwórz kartę: ' + nazwaB, akcja: function (o) { o.zamknij(); otworzKarte(op.innaKarta.patientId); } },
        ],
      });
    }

    // Można usunąć (ewentualnie po odpięciu).
    var punkty = el('ul', 'settings-kosz-punkty');
    punkty.appendChild(punkt('ok', ocena.pomiary.length
      ? 'Pomiary z tego zapisu są też w karcie „' + nazwaB + '”. Nic nie zginie.'
      : 'Ten zapis nie ma pomiarów wzrostu ani masy.', 'settings-kosz-punkt--ok'));
    punkty.appendChild(punkt('wroc', ocena.zmianaNazwy
      ? 'Karta wróci do nazwy „' + ocena.zmianaNazwy.nazwa + '” z zapisu ' + formatChwili(ocena.zmianaNazwy.savedAtISO) + '.'
      : 'Nazwa karty się nie zmieni.'));
    punkty.appendChild(punkt('kosz', 'Zapis trafi do kosza na 30 dni. Przywrócisz go na każdym urządzeniu; potem zniknie na stałe.'));
    punkty.appendChild(punkt('info', 'Innych danych zapisu (np. terapii, badań) narzędzie nie porównuje — przez 30 dni zostają w koszu razem z zapisem.'));
    punkty.appendChild(punkt('dziennik', 'Usunięcie zostanie odnotowane w dzienniku dostępu.'));

    var tresc = [blokZapisu(ocena.zapis, ocena.przypiety)];
    if (ocena.przypiety) {
      var uw = el('div', 'settings-kosz-uwaga');
      uw.appendChild(ikona('pinezka'));
      uw.appendChild(el('span', null, 'Ten zapis jest przypięty — ktoś oznaczył go do zachowania. Żeby go usunąć, trzeba go najpierw odpiąć. Oba kroki cofniesz, przywracając zapis z kosza.'));
      tresc.push(uw);
    }
    tresc.push(punkty);
    var kopia = null;
    var fe = w.VildaFileExport;
    if (fe && typeof fe.exportPatient === 'function' && !trybTylkoChmura()) {
      var etykieta = el('label', 'settings-kosz-kopia');
      kopia = el('input');
      kopia.type = 'checkbox';
      kopia.id = 'koszKopia' + (licznikOkien + 1);
      etykieta.appendChild(kopia);
      var opis = el('span');
      opis.appendChild(el('strong', null, 'Pobierz też kopię tej karty (.wiw).'));
      opis.appendChild(doc.createTextNode(' Osobny, zaszyfrowany plik, którego automatyczna kopia konta nie nadpisze.'));
      etykieta.appendChild(opis);
      tresc.push(etykieta);
    }

    return okno({
      nota: nota,
      tytul: 'Usunąć pomylony zapis?',
      podtytul: 'Karta: ' + nazwaA,
      tresc: tresc,
      przyciski: [
        { tekst: 'Anuluj', akcja: zamknij },
        {
          tekst: ocena.przypiety ? 'Odepnij i usuń do kosza' : 'Usuń do kosza',
          klasa: 'settings-kosz-btn-usun',
          akcja: async function (o) {
            o.pokazBlad('');
            o.zajmij(true);
            // Decyzja na świeżym odczycie obu kart: gdy okno było otwarte, synchronizacja albo inna karta przeglądarki
            // mogły zmienić zapis albo zabrać pomiar z karty drugiej osoby (P-KOSZ-POPRAWKI).
            var teraz;
            try {
              teraz = (await wczytajOcene(v, op)).ocena;
            } catch (e) {
              o.zajmij(false);
              o.pokazBlad('Nie udało się odczytać kart — nic nie zostało usunięte.');
              return;
            }
            if (!takaSamaOcena(ocena, teraz)) {
              otworzPonownie(o);
              return;
            }
            try {
              if (kopia && kopia.checked) {
                var skrot = typeof v.shortHashOfPatientId === 'function' ? v.shortHashOfPatientId(op.patientId) : '';
                await fe.exportPatient(op.patientId, { filename: nazwaPliku(skrot) });
              }
            } catch (e) {
              o.zajmij(false);
              o.pokazBlad('Nie udało się zapisać kopii karty — zapis nie został usunięty.');
              return;
            }
            try {
              // Sejf sprawdza tę wersję jeszcze raz pod blokadą pacjenta i tuż przed usunięciem.
              var wynik = await doKosza(op.patientId, op.snapshotId, {
                odepnij: ocena.przypiety,
                oczekiwana: { rev: teraz.zapis.rev, updatedAtISO: teraz.zapis.updatedAtISO || teraz.zapis.savedAtISO || null },
              });
              o.zajmij(false);
              o.zamknij();
              if (typeof op.poUsunieciu === 'function') {
                op.poUsunieciu(Object.assign({}, wynik, { nazwaZapisu: nazwaZ, savedAtISO: ocena.zapis.savedAtISO, zmianaNazwy: ocena.zmianaNazwy }));
              }
            } catch (e) {
              if (e && e.code === 'zmieniony') {
                otworzPonownie(o);
                return;
              }
              o.zajmij(false);
              o.pokazBlad(e && e.code === 'zablokowany'
                ? 'Sejf jest zablokowany — zaloguj się i spróbuj ponownie. Nic nie zostało usunięte.'
                : 'Nie udało się usunąć zapisu' + (e && e.message ? ': ' + e.message : '.') + ' Karta jest bez zmian.');
            }
          },
        },
      ],
    });
  }

  // ── Kosz: wpis listy (Ustawienia) ─────────────────────────────────────────────────────────────

  function opisWpisu(e) {
    var nazwa = nazwaZapisu(e.payload);
    var dob = formatDaty(e.payload && e.payload.user && e.payload.user.dobISO);
    return 'Zapis z ' + formatChwili(e.savedAtISO) + (nazwa ? ' — „' + nazwa + '”' : '') + (dob ? ', ur. ' + dob : '');
  }

  function metaWpisu(e, terazMs) {
    var dni = dniDoKonca(e.expiresAtISO, terazMs);
    return { tekst: 'Usunięty ' + formatChwili(e.deletedAtISO) + ' · ' + tekstPozostalo(dni), koniec: dni <= 3 };
  }

  function mountUstawienia() {
    if (!doc || typeof doc.getElementById !== 'function') return false;
    var karta = doc.getElementById('recordTrashCard');
    if (!karta || karta.getAttribute('data-kosz') === 'gotowy') return false;
    var lista = doc.getElementById('recordTrashList');
    var status = doc.getElementById('recordTrashStatus');
    if (!lista || !status) return false;
    karta.setAttribute('data-kosz', 'gotowy');
    var pokolenie = 0;

    function ustawStatus(t) { status.textContent = t || ''; status.hidden = !t; }

    async function odswiez() {
      pokolenie += 1;
      var moje = pokolenie;
      if (!odblokowany()) {
        while (lista.firstChild) lista.removeChild(lista.firstChild);
        lista.hidden = true;
        ustawStatus('Zaloguj się, aby zobaczyć kosz.');
        return;
      }
      var elementy;
      try { elementy = await wpisy(null); } catch (e) { elementy = null; }
      if (moje !== pokolenie) return;
      while (lista.firstChild) lista.removeChild(lista.firstChild);
      if (!elementy) { lista.hidden = true; ustawStatus('Nie udało się odczytać kosza.'); return; }
      if (!elementy.length) { lista.hidden = true; ustawStatus('Kosz jest pusty.'); return; }
      ustawStatus('');
      lista.hidden = false;
      elementy.forEach(function (e) {
        var li = el('li', 'settings-kosz-wpis');
        var opis = el('div', 'settings-kosz-wpis-opis');
        opis.appendChild(el('span', 'settings-kosz-wpis-karta', 'Karta: ' + (e.patientName || '—')));
        opis.appendChild(el('span', 'settings-kosz-wpis-zapis', opisWpisu(e)));
        var meta = metaWpisu(e);
        opis.appendChild(el('span', 'settings-kosz-wpis-meta' + (meta.koniec ? ' settings-kosz-wpis-meta--koniec' : ''), meta.tekst));
        var blad = el('span', 'settings-kosz-wpis-blad');
        blad.setAttribute('role', 'alert');
        blad.hidden = true;
        opis.appendChild(blad);
        li.appendChild(opis);
        var b = przycisk('Przywróć', 'settings-kosz-btn-przywroc', async function () {
          b.disabled = true;
          blad.hidden = true;
          try {
            await przywroc(e.patientId, e.snapshotId);
          } catch (er) {
            b.disabled = false;
            blad.textContent = 'Nie udało się przywrócić' + (er && er.message ? ': ' + er.message : '.');
            blad.hidden = false;
          }
        });
        b.insertBefore(ikona('wroc'), b.firstChild);
        b.setAttribute('aria-label', 'Przywróć zapis z ' + formatChwili(e.savedAtISO) + ' do karty ' + (e.patientName || ''));
        li.appendChild(b);
        lista.appendChild(li);
      });
    }

    var sekcja = karta.closest ? karta.closest('details') : null;
    if (sekcja) sekcja.addEventListener('toggle', function () { if (sekcja.open) odswiez(); });
    doc.addEventListener(ZDARZENIE, odswiez);
    doc.addEventListener('vilda:auth-state-settled', odswiez);
    doc.addEventListener('vilda:sync-merged', odswiez); // vilda_sync_integration.js wysyła je na document
    odswiez();
    return true;
  }

  // ── Kosz w historii wersji karty (klasy historii vvh-*, bez własnego CSS) ─────────────────────

  function wstawDoHistorii(kontener, ctx) {
    if (!kontener || !ctx || !ctx.patientId || !odblokowany()) return;
    var miejsce = el('div', 'vvh-kosz');
    kontener.appendChild(miejsce);
    wpisy(ctx.patientId).then(function (elementy) {
      if (!elementy.length || !miejsce.parentNode) return;
      miejsce.appendChild(el('div', 'vvh-day', 'Kosz tej karty · ' + elementy.length + ' ' + odmiana(elementy.length, 'zapis', 'zapisy', 'zapisów')));
      elementy.forEach(function (e) {
        miejsce.appendChild(el('div', 'vvh-ret', opisWpisu(e) + '. ' + metaWpisu(e).tekst + '.'));
        var b = el('button', 'vvh-more', '↺ Przywróć ten zapis');
        b.type = 'button';
        b.addEventListener('click', function () {
          b.disabled = true;
          przywroc(e.patientId, e.snapshotId).then(function () {
            if (typeof ctx.reload === 'function') ctx.reload(e.snapshotId, { kind: 'ok', text: 'Przywrócono zapis z kosza.' });
          }).catch(function (er) {
            b.disabled = false;
            b.textContent = 'Nie udało się przywrócić' + (er && er.message ? ': ' + er.message : '');
          });
        });
        miejsce.appendChild(b);
      });
    }).catch(function () { /* kosz niedostępny — historia bez zmian */ });
  }

  var api = {
    __init: true,
    VERSION: VERSION,
    ZDARZENIE: ZDARZENIE,
    pomiaryZapisu: pomiaryZapisu,
    pokrycie: pokrycie,
    otworzUsuwanie: otworzUsuwanie,
    przywroc: przywroc,
    wpisy: wpisy,
    wstawDoHistorii: wstawDoHistorii,
    mountUstawienia: mountUstawienia,
    __internals: {
      tenSamPomiar: tenSamPomiar,
      ocenUsuniecie: ocenUsuniecie,
      takaSamaOcena: takaSamaOcena,
      formatWieku: formatWieku,
      formatPomiaru: formatPomiaru,
      tekstPozostalo: tekstPozostalo,
      dniDoKonca: dniDoKonca,
      nazwaPliku: nazwaPliku,
      opisWpisu: opisWpisu,
    },
  };
  w.VildaKoszZapisow = api;

  if (doc && typeof doc.getElementById === 'function') {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mountUstawienia);
    else mountUstawienia();
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
