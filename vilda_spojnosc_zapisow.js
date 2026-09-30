/* vilda_spojnosc_zapisow.js — „Sprawdzenie spójności zapisów” w Ustawieniach (Kopie zapasowe
 * pacjentów). P-SPOJNOSC-ZAPISOW, makieta zaakceptowana przez właściciela 2026-09-30; narzędzie do
 * usuwania pomylonych zapisów powstanie później jako osobna zmiana.
 *
 * PROBLEM
 *   Przed poprawką P-POWLOKA-ID (#491, 30.09.2026) „Zapisz” w DocPro otwartym w powłoce mógł zapisać
 *   dane pacjenta B jako nową wersję karty pacjenta A. Poprawka zamyka drogę na przyszłość, ale
 *   zapisy zrobione wcześniej zostają w sejfie. Nazwa karty na liście pacjentów pochodzi z OSTATNIEGO
 *   zapisu, więc po pomyłce karta A widnieje na liście jako B — porównanie nazwy z listą nic nie da.
 *
 * ROZWIĄZANIE
 *   W każdej karcie moduł porównuje zapisy między sobą (nazwisko, data urodzenia, płeć) i pokazuje
 *   karty, w których któryś zapis wygląda na zapis innej osoby. Wynik jest tylko na tej stronie.
 *
 * CZEGO MODUŁ NIE ROBI
 *   • Nie zmienia, nie usuwa i nie wysyła niczego: z sejfu woła wyłącznie listPatients() i
 *     getPatient(), które tylko odczytują i odszyfrowują. Nie pisze do dziennika dostępu.
 *   • Nie trzyma wyniku poza pamięcią strony. Jedyny zapis to chwila ostatniego zakończonego
 *     sprawdzenia (klucz recordConsistencyLastCheck, local-persistent, preferencja konta — przeżywa
 *     „Wyczyść wszystkie pola”; bez danych pacjentów).
 *   • Nie rozstrzyga, który zapis jest prawdziwy — oznacza karty do przejrzenia przez człowieka.
 *
 * REGUŁY (opis kliniczno-techniczny: docs/clinical/ALGORITHMS.md, P-SPOJNOSC-ZAPISOW)
 *   • Nazwisko porównujemy po normalizacji: małe litery, bez znaków diakrytycznych, „ł” → „l”,
 *     słowa w dowolnej kolejności („Nowak Jan” = „Jan Nowak”).
 *   • Wzorzec karty: osoba z NAJSTARSZEGO czytelnego zapisu z nazwiskiem (dla niej karta powstała),
 *     a w jej obrębie najczęstsza pisownia; data urodzenia i płeć — najczęstsze w zapisach z tą
 *     pisownią. Pomyłka dopisuje zapisy na końcu historii, więc nie przejmuje wzorca.
 *   • „Prawdopodobna pomyłka”: nazwisko bez wspólnego słowa ze wzorcem; albo wspólne słowo
 *     (rodzeństwo) przy innej dacie urodzenia; albo nazwisko i data innej karty z sejfu.
 *   • „Do sprawdzenia”: inna pisownia przy zgodnej lub nieznanej dacie urodzenia albo to samo
 *     nazwisko z inną datą urodzenia (zwykle poprawka literówki lub daty).
 *   • Sama płeć niczego nie oznacza: formularz podstawia „M” przy pustym polu. Płeć trafia tylko
 *     do opisu różnic.
 *
 * BEZPIECZNIKI
 *   • Treść zapisów wstawiana wyłącznie przez textContent — nazwiska są danymi, nie znacznikami.
 *   • Brak elementów karty (inna strona) — moduł wystawia tylko API.
 *   • Sejf zablokowany przed lub w trakcie — komunikat, nic nie zostaje zmienione.
 *   • Idempotentne: podwójne dołączenie nie inicjalizuje dwa razy.
 */
(function (w) {
  'use strict';
  if (!w) return;
  if (w.VildaSpojnoscZapisow && w.VildaSpojnoscZapisow.__init) return;

  var VERSION = '1';
  var PREF_KEY = 'recordConsistencyLastCheck';
  var LIMIT_KONT = 20;
  var WIERSZE_KONTEKSTU = 2;
  var NBSP = '\u00a0';

  // ── Nazwisko, data urodzenia, płeć ─────────────────────────────────────────────────────────

  function tekst(v) {
    return v == null ? '' : String(v).trim();
  }

  function tokenyNazwy(nazwa) {
    var t = tekst(nazwa).toLowerCase();
    try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* bez normalize */ }
    t = t.replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
    if (!t) return [];
    var widziane = Object.create(null);
    return t.split(' ').filter(function (s) {
      if (widziane[s]) return false;
      widziane[s] = true;
      return true;
    }).sort();
  }

  function kluczNazwy(nazwa) {
    return tokenyNazwy(nazwa).join(' ');
  }

  // Wspólne słowo co najmniej dwuliterowe — pojedyncze inicjały nie wiążą dwóch nazwisk.
  function wspolneSlowo(a, b) {
    for (var i = 0; i < a.length; i += 1) {
      if (a[i].length >= 2 && b.indexOf(a[i]) !== -1) return true;
    }
    return false;
  }

  function dataUrodzenia(v) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(tekst(v));
    if (!m) return null;
    var r = +m[1], mi = +m[2], d = +m[3];
    if (r < 1900 || r > 2999 || mi < 1 || mi > 12 || d < 1 || d > 31) return null;
    return m[1] + '-' + (mi < 10 ? '0' : '') + mi + '-' + (d < 10 ? '0' : '') + d;
  }

  function plec(v) {
    var s = tekst(v).toUpperCase();
    if (s === 'F' || s === 'K') return 'K';
    if (s === 'M') return 'M';
    return null;
  }

  function liczba(v) {
    if (v == null || v === '') return null;
    var n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) && n > 0 ? n : null;
  }

  function nazwaZZapisu(payload) {
    var n = tekst(payload && payload.name);
    if (n) return n;
    var u = (payload && payload.user) || {};
    return [tekst(u.lastName), tekst(u.firstName)].filter(Boolean).join(' ');
  }

  // Snapshot sejfu → wiersz porównania. null, gdy zapisu nie dało się odszyfrować.
  function wierszZapisu(snapshot) {
    if (!snapshot || !snapshot.payload || typeof snapshot.payload !== 'object') return null;
    var p = snapshot.payload;
    var u = p.user && typeof p.user === 'object' ? p.user : {};
    var nazwa = nazwaZZapisu(p);
    var tokeny = tokenyNazwy(nazwa);
    return {
      snapshotId: snapshot.snapshotId || null,
      savedAtISO: snapshot.savedAtISO || p.timestampISO || '',
      nazwa: nazwa,
      tokeny: tokeny,
      klucz: tokeny.join(' '),
      dob: dataUrodzenia(u.dobISO),
      plec: plec(u.sex),
      wzrost: liczba(u.height),
      masa: liczba(u.weight),
    };
  }

  // Wiersze od najstarszego (remisy rozstrzyga starszy zapis).
  function odNajstarszego(wiersze) {
    return wiersze.slice().sort(function (a, b) {
      return a.savedAtISO < b.savedAtISO ? -1 : a.savedAtISO > b.savedAtISO ? 1 : 0;
    });
  }

  // Najczęstsza wartość; przy remisie ta, która pojawiła się wcześniej (wartości od najstarszej).
  function najczestsza(wartosci) {
    var licz = Object.create(null), kolejnosc = [];
    for (var i = 0; i < wartosci.length; i += 1) {
      var v = wartosci[i];
      if (v == null || v === '') continue;
      if (!licz[v]) kolejnosc.push(v);
      licz[v] = (licz[v] || 0) + 1;
    }
    var naj = null;
    kolejnosc.forEach(function (k) { if (naj === null || licz[k] > licz[naj]) naj = k; });
    return naj;
  }

  // 'zgodny' | 'pisownia' | 'data' | 'obcy' — wiersz względem wzorca karty.
  function porownaj(wiersz, wzorzec) {
    if (!wiersz || !wzorzec || !wiersz.klucz) return 'zgodny';
    var innaData = !!(wiersz.dob && wzorzec.dob && wiersz.dob !== wzorzec.dob);
    if (wiersz.klucz === wzorzec.klucz) return innaData ? 'data' : 'zgodny';
    if (wspolneSlowo(wiersz.tokeny, wzorzec.tokeny)) return innaData ? 'obcy' : 'pisownia';
    return 'obcy';
  }

  function wzorzecKarty(wiersze) {
    var nazwane = odNajstarszego(wiersze.filter(function (x) { return x && x.klucz; }));
    if (!nazwane.length) return null;
    var ziarno = nazwane[0];
    var kandydaci = nazwane.filter(function (x) { return porownaj(x, ziarno) !== 'obcy'; });
    var klucz = najczestsza(kandydaci.map(function (x) { return x.klucz; }));
    var zKluczem = kandydaci.filter(function (x) { return x.klucz === klucz; });
    var dob = najczestsza(zKluczem.map(function (x) { return x.dob; })) ||
      najczestsza(kandydaci.map(function (x) { return x.dob; }));
    return {
      klucz: klucz,
      tokeny: klucz.split(' '),
      nazwa: zKluczem[zKluczem.length - 1].nazwa,
      dob: dob,
      plec: najczestsza(zKluczem.map(function (x) { return x.plec; })),
    };
  }

  // Jedna karta: wzorzec i ocena każdego czytelnego zapisu.
  function ocenKarte(karta) {
    var wiersze = (karta.wiersze || []).filter(Boolean);
    var wzorzec = wzorzecKarty(wiersze);
    var ocenione = wiersze.map(function (x) {
      return { wiersz: x, ocena: wzorzec ? porownaj(x, wzorzec) : 'zgodny', innaKarta: null };
    });
    return {
      patientId: karta.patientId,
      nazwaNaLiscie: tekst(karta.nazwaNaLiscie),
      wzorzec: wzorzec,
      ocenione: ocenione,
      nieczytelne: karta.nieczytelne || 0,
    };
  }

  // Druga faza, gdy znane są wzorce wszystkich kart: zapis z nazwiskiem (i datą) innej karty.
  function uzupelnijInnymiKartami(karty) {
    var poKluczu = Object.create(null);
    karty.forEach(function (k) {
      if (!k.wzorzec) return;
      (poKluczu[k.wzorzec.klucz] = poKluczu[k.wzorzec.klucz] || []).push(k);
    });
    karty.forEach(function (k) {
      if (!k.wzorzec) return;
      k.ocenione.forEach(function (o) {
        if (o.ocena === 'zgodny') return;
        var r = o.wiersz;
        var inne = (poKluczu[r.klucz] || []).filter(function (c) {
          if (c === k) return false;
          if (r.dob && c.wzorzec.dob && r.dob !== c.wzorzec.dob) return false;
          if (o.ocena === 'obcy') return true;
          // Ta sama osoba w dwóch kartach (duplikat) to nie pomyłka zapisu.
          if (k.wzorzec.dob && c.wzorzec.dob && k.wzorzec.dob === c.wzorzec.dob) return false;
          // Imiennik z inną datą: awans tylko przy dodatniej zgodności daty z tamtą kartą.
          if (o.ocena === 'data') return !!(r.dob && c.wzorzec.dob === r.dob);
          return true;
        });
        if (!inne.length) return;
        var zData = inne.filter(function (c) { return r.dob && c.wzorzec.dob === r.dob; });
        o.innaKarta = { patientId: (zData[0] || inne[0]).patientId, nazwa: (zData[0] || inne[0]).wzorzec.nazwa,
          dob: (zData[0] || inne[0]).wzorzec.dob };
        o.ocena = 'obcy';
      });
    });
    karty.forEach(function (k) {
      var obce = k.ocenione.filter(function (o) { return o.ocena === 'obcy'; });
      var slabe = k.ocenione.filter(function (o) { return o.ocena === 'pisownia' || o.ocena === 'data'; });
      k.poziom = obce.length ? 'pomylka' : slabe.length ? 'sprawdzic' : 'ok';
      k.widniejeJako = k.wzorzec && k.nazwaNaLiscie && kluczNazwy(k.nazwaNaLiscie) !== k.wzorzec.klucz
        ? k.nazwaNaLiscie : null;
    });
    return karty;
  }

  // Wiersze do pokazania: wszystkie oznaczone + dwa najnowsze bez uwag; reszta tylko liczbą.
  function wierszeDoPokazania(karta) {
    var odNajnowszego = karta.ocenione.slice().sort(function (a, b) {
      return a.wiersz.savedAtISO < b.wiersz.savedAtISO ? 1 : a.wiersz.savedAtISO > b.wiersz.savedAtISO ? -1 : 0;
    });
    var kontekst = 0, pokaz = [], pominiete = 0;
    odNajnowszego.forEach(function (o) {
      if (o.ocena !== 'zgodny') { pokaz.push(o); return; }
      if (kontekst < WIERSZE_KONTEKSTU) { kontekst += 1; pokaz.push(o); return; }
      pominiete += 1;
    });
    return { wiersze: pokaz, pominiete: pominiete };
  }

  // ── Przebieg: tylko listPatients() i getPatient() ──────────────────────────────────────────

  function bladZablokowany() {
    var e = new Error('Sejf jest zablokowany.');
    e.code = 'zablokowany';
    return e;
  }

  function odblokowany(vault) {
    try { return !!(vault && typeof vault.isUnlocked === 'function' && vault.isUnlocked()); } catch (e) { return false; }
  }

  async function sprawdz(vault, opcje) {
    opcje = opcje || {};
    var czyPrzerwac = typeof opcje.czyPrzerwac === 'function' ? opcje.czyPrzerwac : function () { return false; };
    var postep = typeof opcje.postep === 'function' ? opcje.postep : function () {};
    if (!odblokowany(vault)) throw bladZablokowany();
    var lista = await vault.listPatients();
    lista = Array.isArray(lista) ? lista : [];
    var wynik = { wszystkich: lista.length, karty: 0, zapisy: 0, nieczytelneZapisy: 0, nieczytelneKarty: 0,
      przerwano: false, oceny: [] };
    var karty = [];
    postep(0, lista.length);
    for (var i = 0; i < lista.length; i += 1) {
      if (czyPrzerwac()) { wynik.przerwano = true; break; }
      var poz = lista[i] || {};
      var rekord = null;
      try {
        rekord = await vault.getPatient(poz.patientId);
      } catch (e) {
        if (!odblokowany(vault)) throw bladZablokowany();
      }
      if (!rekord || !Array.isArray(rekord.snapshots)) {
        wynik.nieczytelneKarty += 1;
      } else {
        var wiersze = [], nieczytelne = 0;
        rekord.snapshots.forEach(function (s) {
          var x = wierszZapisu(s);
          if (x) wiersze.push(x); else nieczytelne += 1;
        });
        wynik.karty += 1;
        wynik.zapisy += rekord.snapshots.length;
        wynik.nieczytelneZapisy += nieczytelne;
        var naglowek = (rekord.header && rekord.header.name) || (poz.header && poz.header.name) || '';
        karty.push(ocenKarte({ patientId: poz.patientId, nazwaNaLiscie: naglowek, wiersze: wiersze,
          nieczytelne: nieczytelne }));
      }
      postep(i + 1, lista.length);
    }
    wynik.oceny = uzupelnijInnymiKartami(karty);
    wynik.pomylki = wynik.oceny.filter(function (k) { return k.poziom === 'pomylka'; }).length;
    wynik.doSprawdzenia = wynik.oceny.filter(function (k) { return k.poziom === 'sprawdzic'; }).length;
    wynik.bezUwag = wynik.karty - wynik.pomylki - wynik.doSprawdzenia;
    return wynik;
  }

  // ── Teksty ─────────────────────────────────────────────────────────────────────────────────

  function odmiana(n, jeden, kilka, wiele) {
    var d = n % 10, s = n % 100;
    if (n === 1) return jeden;
    if (d >= 2 && d <= 4 && (s < 12 || s > 14)) return kilka;
    return wiele;
  }

  function liczbaPL(n) {
    try { return Number(n).toLocaleString('pl-PL'); } catch (e) { return String(n); }
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
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || '');
    return m ? m[3] + '.' + m[2] + '.' + m[1] : '—';
  }

  function formatPomiarow(wzrost, masa) {
    var czesci = [];
    if (wzrost != null) czesci.push(wzrost.toFixed(1).replace('.', ',') + NBSP + 'cm');
    if (masa != null) czesci.push(masa.toFixed(1).replace('.', ',') + NBSP + 'kg');
    return czesci.length ? czesci.join(' · ') : '—';
  }

  function wyliczenie(lista) {
    if (lista.length <= 1) return lista.join('');
    return lista.slice(0, -1).join(', ') + ' i ' + lista[lista.length - 1];
  }

  function zdanieWyniku(wynik) {
    if (!wynik.wszystkich) return 'W sejfie nie ma jeszcze kart pacjentów.';
    var sprawdzono = wynik.przerwano
      ? 'Sprawdzanie przerwane: sprawdzono ' + liczbaPL(wynik.karty) + ' z ' + liczbaPL(wynik.wszystkich) + ' kart i '
      : 'Sprawdzono ' + liczbaPL(wynik.karty) + ' ' + odmiana(wynik.karty, 'kartę', 'karty', 'kart') + ' i ';
    sprawdzono += liczbaPL(wynik.zapisy) + ' ' + odmiana(wynik.zapisy, 'zapis', 'zapisy', 'zapisów') + '.';
    var n = wynik.pomylki + wynik.doSprawdzenia;
    if (n) return sprawdzono + ' ' + liczbaPL(n) + ' ' + odmiana(n, 'karta', 'karty', 'kart') + ' do przejrzenia.';
    return sprawdzono + (wynik.przerwano ? ' Do tej chwili nie' : ' Nie') + ' znaleziono zapisów innego pacjenta.';
  }

  function zapisyLiczba(n, jeden) {
    return n === 1 ? jeden : liczbaPL(n) + ' ' + odmiana(n, 'zapis', 'zapisy', 'zapisów');
  }

  function czasownik(n, pojedynczy, mnogi) {
    return odmiana(n, pojedynczy, mnogi, pojedynczy);
  }

  // Opis karty „do sprawdzenia”: co się różni i co się zgadza.
  function opisSlabej(karta) {
    var w = karta.wzorzec, zdania = [];
    var pisownia = karta.ocenione.filter(function (o) { return o.ocena === 'pisownia'; });
    var data = karta.ocenione.filter(function (o) { return o.ocena === 'data'; });
    if (pisownia.length) {
      var n = pisownia.length;
      var zgodneDaty = pisownia.every(function (o) { return o.wiersz.dob && o.wiersz.dob === w.dob; });
      var zgodnePlci = pisownia.every(function (o) { return o.wiersz.plec && o.wiersz.plec === w.plec; });
      var reszta = zgodneDaty && zgodnePlci ? 'data urodzenia i płeć się zgadzają'
        : zgodneDaty ? 'data urodzenia się zgadza'
          : 'daty urodzenia nie da się porównać';
      zdania.push(zapisyLiczba(n, 'Jeden zapis') + ' ' + czasownik(n, 'ma', 'mają') + ' inną pisownię nazwiska; ' +
        reszta + '. Często to poprawka literówki albo dopisane drugie imię.');
    }
    if (data.length) {
      var m = data.length;
      zdania.push(zapisyLiczba(m, 'Jeden zapis') + ' przy tym samym nazwisku ' + czasownik(m, 'ma', 'mają') +
        ' inną datę urodzenia. Często to poprawka daty.');
    }
    return zdania.join(' ');
  }

  // Zdania dowodowe karty „prawdopodobna pomyłka”, po jednym na obcą osobę.
  function dowodyPomylki(karta) {
    var w = karta.wzorzec, grupy = [], poKluczu = Object.create(null);
    karta.ocenione.forEach(function (o) {
      if (o.ocena !== 'obcy') return;
      var g = poKluczu[o.wiersz.klucz];
      if (!g) { g = poKluczu[o.wiersz.klucz] = { oceny: [] }; grupy.push(g); }
      g.oceny.push(o);
    });
    return grupy.map(function (g) {
      var o0 = g.oceny[0], r = o0.wiersz;
      // Imiennik (to samo nazwisko, data innej karty) różni się tylko datą — nie piszemy „nazwisko”.
      var roznice = r.klucz !== w.klucz ? ['nazwisko'] : [];
      if (r.dob && w.dob && r.dob !== w.dob) roznice.push('datę urodzenia');
      if (r.plec && w.plec && r.plec !== w.plec) roznice.push('płeć');
      var chwile = g.oceny.map(function (o) { return o.wiersz.savedAtISO; }).sort();
      var n = chwile.length;
      var ktore = n === 1 ? 'Zapis z ' + formatChwili(chwile[0])
        : n <= 3 ? 'Zapisy z ' + wyliczenie(chwile.map(formatChwili))
          : liczbaPL(n) + ' ' + odmiana(n, 'zapis', 'zapisy', 'zapisów') + ' (od ' + formatChwili(chwile[0]) +
            ' do ' + formatChwili(chwile[n - 1]) + ')';
      var zdanie = ktore + ' ' + czasownik(n, 'ma', 'mają') + ' ' + wyliczenie(roznice) + ' innej osoby.';
      var inna = null;
      g.oceny.forEach(function (o) { if (!inna && o.innaKarta) inna = o.innaKarta; });
      if (inna) {
        zdanie += ' „' + inna.nazwa + '”' + (inna.dob ? ' (ur. ' + formatDaty(inna.dob) + ')' : '') +
          ' ma w sejfie własną kartę.';
      } else if (r.nazwa) {
        zdanie += ' W sejfie nie ma osobnej karty „' + r.nazwa + '”.';
      }
      return { zdanie: zdanie, innaKarta: inna };
    });
  }

  // ── Pamięć „Ostatnie sprawdzenie” (bez danych pacjentów) ──────────────────────────────────

  function idKonta(vault) {
    try {
      var u = vault && typeof vault.getCurrentUser === 'function' ? vault.getCurrentUser() : null;
      return u && u.userId ? String(u.userId) : null;
    } catch (e) { return null; }
  }

  function czytajOstatnie(vault) {
    var id = idKonta(vault), P = w.VildaPersistence;
    if (!id || !P || typeof P.readPreferenceJSON !== 'function') return null;
    var mapa = P.readPreferenceJSON(PREF_KEY, null);
    var v = mapa && typeof mapa === 'object' && !Array.isArray(mapa) ? mapa[id] : null;
    return typeof v === 'string' && !isNaN(new Date(v).getTime()) ? v : null;
  }

  function zapiszOstatnie(vault, iso) {
    var id = idKonta(vault), P = w.VildaPersistence;
    if (!id || !P || typeof P.writePreferenceJSON !== 'function') return false;
    var mapa = P.readPreferenceJSON(PREF_KEY, null);
    mapa = mapa && typeof mapa === 'object' && !Array.isArray(mapa) ? mapa : {};
    mapa[id] = iso;
    var klucze = Object.keys(mapa).filter(function (k) { return typeof mapa[k] === 'string'; })
      .sort(function (a, b) { return mapa[a] < mapa[b] ? 1 : mapa[a] > mapa[b] ? -1 : 0; });
    var nowa = {};
    klucze.slice(0, LIMIT_KONT).forEach(function (k) { nowa[k] = mapa[k]; });
    return P.writePreferenceJSON(PREF_KEY, nowa);
  }

  // ── Widok ──────────────────────────────────────────────────────────────────────────────────

  var doc = w.document;

  function el(tag, klasa, tresc) {
    var e = doc.createElement(tag);
    if (klasa) e.className = klasa;
    if (tresc != null) e.textContent = tresc;
    return e;
  }

  function przycisk(klasa, tresc, akcja) {
    var b = el('button', ('vilda-auth-btn vilda-auth-btn-small settings-backup-btn ' + klasa).trim(), tresc);
    b.type = 'button';
    b.addEventListener('click', akcja);
    return b;
  }

  function otworzHistorie(karta) {
    var H = w.VildaVersionHistory;
    if (H && typeof H.open === 'function') H.open(karta.patientId, { patientName: karta.nazwaNaLiscie || karta.wzorzec.nazwa });
  }

  function otworzKarte(patientId) {
    var A = w.VildaAuthUI;
    // Bez funkcji wczytania karta jest tylko do podglądu (brak przycisku „Wczytaj tego pacjenta”).
    if (A && typeof A.showPatientCard === 'function') A.showPatientCard(patientId, null, null);
  }

  var ETYKIETY_UWAG = { obcy: 'inna osoba', pisownia: 'inna pisownia', data: 'inna data urodzenia' };
  var KLASY_WIERSZY = {
    obcy: 'settings-spojnosc-wiersz--obcy',
    pisownia: 'settings-spojnosc-wiersz--pisownia',
    data: 'settings-spojnosc-wiersz--data',
    zgodny: 'settings-spojnosc-wiersz--zgodny',
  };
  var KLASY_TONU = {
    ok: 'settings-spojnosc-podsumowanie--ok',
    uwaga: 'settings-spojnosc-podsumowanie--uwaga',
    info: 'settings-spojnosc-podsumowanie--info',
  };

  function tabelaWierszy(karta) {
    var dane = wierszeDoPokazania(karta);
    var tabela = el('table', 'settings-spojnosc-tabela');
    var thead = el('thead'), tr = el('tr');
    ['Zapis', 'Nazwisko w zapisie', 'Data urodzenia', 'Płeć', 'Wzrost · masa', 'Uwaga'].forEach(function (t) {
      var th = el('th', null, t);
      th.scope = 'col';
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    tabela.appendChild(thead);
    var tbody = el('tbody');
    dane.wiersze.forEach(function (o) {
      var r = o.wiersz;
      var wiersz = el('tr', 'settings-spojnosc-wiersz ' + KLASY_WIERSZY[o.ocena]);
      wiersz.appendChild(el('td', 'settings-spojnosc-kol-zapis', formatChwili(r.savedAtISO)));
      wiersz.appendChild(el('td', 'settings-spojnosc-kol-nazwa', r.nazwa || '—'));
      var tdDob = el('td', 'settings-spojnosc-kol-dob');
      tdDob.appendChild(el('span', 'settings-spojnosc-tylko-telefon', 'ur. '));
      tdDob.appendChild(doc.createTextNode(formatDaty(r.dob)));
      wiersz.appendChild(tdDob);
      wiersz.appendChild(el('td', 'settings-spojnosc-kol-plec', r.plec || '—'));
      wiersz.appendChild(el('td', 'settings-spojnosc-kol-pomiary', formatPomiarow(r.wzrost, r.masa)));
      var tdUwaga = el('td', 'settings-spojnosc-kol-uwaga');
      if (ETYKIETY_UWAG[o.ocena]) {
        tdUwaga.appendChild(el('span', 'settings-spojnosc-znak', o.ocena === 'obcy' ? '●' : 'ℹ')).setAttribute('aria-hidden', 'true');
        tdUwaga.appendChild(doc.createTextNode(' ' + ETYKIETY_UWAG[o.ocena]));
      } else {
        tdUwaga.classList.add('settings-spojnosc-kol-uwaga--pusta');
        tdUwaga.textContent = '—';
      }
      wiersz.appendChild(tdUwaga);
      tbody.appendChild(wiersz);
    });
    tabela.appendChild(tbody);
    var owijka = el('div', 'settings-spojnosc-tabela-owijka');
    owijka.appendChild(tabela);
    if (dane.pominiete) {
      owijka.appendChild(el('p', 'settings-spojnosc-pominiete', 'Oraz ' + liczbaPL(dane.pominiete) + ' ' +
        odmiana(dane.pominiete, 'starszy zapis', 'starsze zapisy', 'starszych zapisów') + ' bez uwag.'));
    }
    return owijka;
  }

  var licznikId = 0;

  function artykulKarty(karta) {
    licznikId += 1;
    var pomylka = karta.poziom === 'pomylka';
    var art = el('article', pomylka ? 'settings-spojnosc-karta settings-spojnosc-karta--pomylka'
      : 'settings-spojnosc-karta settings-spojnosc-karta--sprawdzic');
    var idTytulu = 'recordConsistencyCard' + licznikId;
    art.setAttribute('aria-labelledby', idTytulu);
    var gora = el('div', 'settings-spojnosc-karta-gora');
    var etykieta = el('span', pomylka ? 'settings-spojnosc-etykieta settings-spojnosc-etykieta--pomylka'
      : 'settings-spojnosc-etykieta settings-spojnosc-etykieta--sprawdzic');
    etykieta.appendChild(el('span', null, pomylka ? '●' : 'ℹ')).setAttribute('aria-hidden', 'true');
    etykieta.appendChild(doc.createTextNode(pomylka ? ' Prawdopodobna pomyłka' : ' Do sprawdzenia'));
    gora.appendChild(etykieta);
    var h = el('h4', 'settings-spojnosc-karta-tytul', 'Karta: ' + karta.wzorzec.nazwa);
    h.id = idTytulu;
    gora.appendChild(h);
    art.appendChild(gora);
    if (karta.widniejeJako) {
      art.appendChild(el('p', 'settings-spojnosc-notka', 'Na liście pacjentów ta karta widnieje jako „' + karta.widniejeJako +
        '”, bo nazwa karty pochodzi z ostatniego zapisu.'));
    }
    if (!pomylka) art.appendChild(el('p', 'settings-spojnosc-notka', opisSlabej(karta)));
    art.appendChild(tabelaWierszy(karta));
    var inneKarty = [];
    if (pomylka) {
      dowodyPomylki(karta).forEach(function (d) {
        art.appendChild(el('p', 'settings-spojnosc-dowod', d.zdanie));
        if (d.innaKarta && inneKarty.every(function (k) { return k.patientId !== d.innaKarta.patientId; })) {
          inneKarty.push(d.innaKarta);
        }
      });
    }
    var akcje = el('div', 'settings-spojnosc-akcje');
    akcje.appendChild(przycisk('', 'Otwórz historię wersji', function () { otworzHistorie(karta); }));
    inneKarty.forEach(function (k) {
      akcje.appendChild(przycisk('', 'Otwórz kartę: ' + k.nazwa, function () { otworzKarte(k.patientId); }));
    });
    art.appendChild(akcje);
    return art;
  }

  function podsumowanieWyniku(wynik, chwilaISO) {
    var n = wynik.pomylki + wynik.doSprawdzenia;
    var ton = !wynik.wszystkich ? 'info' : n ? 'uwaga' : wynik.przerwano ? 'info' : 'ok';
    var box = el('div', 'settings-spojnosc-podsumowanie ' + KLASY_TONU[ton]);
    var zdanie = el('p', 'settings-spojnosc-podsumowanie-zdanie');
    if (ton !== 'info') {
      zdanie.appendChild(el('span', 'settings-spojnosc-znak', ton === 'ok' ? '✓' : '●')).setAttribute('aria-hidden', 'true');
      zdanie.appendChild(doc.createTextNode(' '));
    }
    zdanie.appendChild(doc.createTextNode(zdanieWyniku(wynik)));
    box.appendChild(zdanie);
    if (n) {
      var chipy = el('div', 'settings-spojnosc-chipy');
      if (wynik.pomylki) {
        chipy.appendChild(el('span', 'settings-spojnosc-chip settings-spojnosc-chip--pomylka', liczbaPL(wynik.pomylki) + ' ' +
          odmiana(wynik.pomylki, 'prawdopodobna pomyłka', 'prawdopodobne pomyłki', 'prawdopodobnych pomyłek')));
      }
      if (wynik.doSprawdzenia) {
        chipy.appendChild(el('span', 'settings-spojnosc-chip settings-spojnosc-chip--sprawdzic', liczbaPL(wynik.doSprawdzenia) + ' do sprawdzenia'));
      }
      chipy.appendChild(el('span', 'settings-spojnosc-chip', liczbaPL(wynik.bezUwag) + ' bez uwag'));
      box.appendChild(chipy);
    }
    if (wynik.nieczytelneKarty) {
      box.appendChild(el('p', 'settings-spojnosc-drobny', liczbaPL(wynik.nieczytelneKarty) + ' ' +
        odmiana(wynik.nieczytelneKarty, 'karty', 'kart', 'kart') + ' nie udało się odczytać; pominięto.'));
    }
    if (wynik.nieczytelneZapisy) {
      box.appendChild(el('p', 'settings-spojnosc-drobny', liczbaPL(wynik.nieczytelneZapisy) + ' ' +
        odmiana(wynik.nieczytelneZapisy, 'zapisu', 'zapisów', 'zapisów') + ' nie udało się odczytać; pominięto.'));
    }
    if (wynik.wszystkich) {
      box.appendChild(el('p', 'settings-spojnosc-drobny', formatChwili(chwilaISO) + (n ? ' · wynik widać tylko na tej stronie' : '')));
    }
    return box;
  }

  function coDalej() {
    var aside = el('aside', 'settings-spojnosc-co-dalej');
    aside.setAttribute('aria-labelledby', 'recordConsistencyNext');
    var h = el('h4', 'settings-spojnosc-co-dalej-tytul', 'Co dalej');
    h.id = 'recordConsistencyNext';
    aside.appendChild(h);
    var ul = el('ul', 'settings-spojnosc-lista');
    [
      'Sprawdzenie niczego nie naprawia. Pomylony zapis obejrzysz w historii wersji karty.',
      '„Przywróć jako nowy” przy ostatnim prawidłowym zapisie przywraca nazwę karty. Pomylony zapis zostaje wtedy w historii.',
      'Usunięcie pomylonego zapisu nie jest jeszcze dostępne.',
    ].forEach(function (t) { ul.appendChild(el('li', null, t)); });
    aside.appendChild(ul);
    return aside;
  }

  function mount() {
    if (!doc || typeof doc.getElementById !== 'function') return false;
    var karta = doc.getElementById('recordConsistencyCard');
    if (!karta || karta.getAttribute('data-spojnosc') === 'gotowa') return false;
    var wstep = doc.getElementById('recordConsistencyIntro');
    var postepBox = doc.getElementById('recordConsistencyProgress');
    var wynikBox = doc.getElementById('recordConsistencyResult');
    var startBtn = doc.getElementById('recordConsistencyRunBtn');
    var stopBtn = doc.getElementById('recordConsistencyStopBtn');
    var ostatnie = doc.getElementById('recordConsistencyLast');
    var notka = doc.getElementById('recordConsistencyNote');
    var licznik = doc.getElementById('recordConsistencyCounter');
    var pasek = doc.getElementById('recordConsistencyBar');
    var ogloszenie = doc.getElementById('recordConsistencyLive');
    if (!wstep || !postepBox || !wynikBox || !startBtn || !stopBtn) return false;
    karta.setAttribute('data-spojnosc', 'gotowa');

    var przerwij = false, trwa = false;

    function oglos(t) { if (ogloszenie) ogloszenie.textContent = t; }

    function pokazOstatnie() {
      if (!ostatnie) return;
      var vault = w.VildaVault;
      if (!odblokowany(vault)) { ostatnie.hidden = true; return; }
      var iso = czytajOstatnie(vault);
      ostatnie.textContent = 'Ostatnie sprawdzenie: ' + (iso ? formatChwili(iso) : 'nigdy');
      ostatnie.hidden = false;
    }

    function stan(nazwa) {
      karta.setAttribute('data-stan', nazwa);
      wstep.hidden = nazwa !== 'start';
      postepBox.hidden = nazwa !== 'postep';
      wynikBox.hidden = nazwa !== 'wynik';
    }

    function pokazNotke(t) {
      if (!notka) return;
      notka.textContent = t || '';
      notka.hidden = !t;
    }

    function ustawPostep(zrobione, wszystkie) {
      if (licznik) licznik.textContent = liczbaPL(zrobione) + ' z ' + liczbaPL(wszystkie);
      if (pasek) { pasek.max = Math.max(1, wszystkie); pasek.value = zrobione; }
    }

    function pokazWynik(wynik, chwilaISO) {
      while (wynikBox.firstChild) wynikBox.removeChild(wynikBox.firstChild);
      wynikBox.appendChild(podsumowanieWyniku(wynik, chwilaISO));
      var doPrzejrzenia = wynik.oceny.filter(function (k) { return k.poziom !== 'ok'; });
      doPrzejrzenia.sort(function (a, b) { return (a.poziom === 'pomylka' ? 0 : 1) - (b.poziom === 'pomylka' ? 0 : 1); });
      doPrzejrzenia.forEach(function (k) { wynikBox.appendChild(artykulKarty(k)); });
      if (doPrzejrzenia.length) wynikBox.appendChild(coDalej());
      var dol = el('div', 'settings-spojnosc-akcje settings-spojnosc-akcje--dol');
      var ponownie = przycisk('vilda-auth-btn-primary', 'Sprawdź ponownie', uruchom);
      ponownie.id = 'recordConsistencyAgainBtn';
      dol.appendChild(ponownie);
      if (wynik.wszystkich) dol.appendChild(el('span', 'settings-spojnosc-drobny', 'Wynik znika po zamknięciu strony.'));
      wynikBox.appendChild(dol);
      stan('wynik');
      oglos(zdanieWyniku(wynik));
      // Przycisk, który miał fokus, zniknął — fokus na podsumowanie, by klawiatura nie wracała na początek strony.
      var podsumowanie = wynikBox.firstChild;
      podsumowanie.setAttribute('tabindex', '-1');
      try { podsumowanie.focus(); } catch (e) { /* bez fokusu */ }
    }

    async function uruchom() {
      if (trwa) return;
      var vault = w.VildaVault;
      if (!odblokowany(vault)) {
        stan('start');
        pokazNotke('Zaloguj się, aby sprawdzić zapisy.');
        return;
      }
      pokazNotke('');
      trwa = true;
      przerwij = false;
      stopBtn.disabled = false;
      ustawPostep(0, 0);
      stan('postep');
      try { postepBox.focus(); } catch (e) { /* bez fokusu */ }
      oglos('Sprawdzanie kart pacjentów…');
      try {
        var wynik = await sprawdz(vault, {
          czyPrzerwac: function () { return przerwij; },
          postep: ustawPostep,
        });
        var chwila = new Date().toISOString();
        if (!wynik.przerwano && wynik.wszystkich) zapiszOstatnie(vault, chwila);
        pokazWynik(wynik, chwila);
      } catch (e) {
        stan('start');
        pokazNotke(e && e.code === 'zablokowany'
          ? 'Sejf został zablokowany w trakcie sprawdzania. Niczego nie zmieniono — zaloguj się i sprawdź ponownie.'
          : 'Nie udało się dokończyć sprawdzania. Niczego nie zmieniono.');
        oglos('');
      } finally {
        trwa = false;
        pokazOstatnie();
      }
    }

    startBtn.addEventListener('click', uruchom);
    stopBtn.addEventListener('click', function () {
      przerwij = true;
      stopBtn.disabled = true;
    });
    var sekcja = karta.closest ? karta.closest('details') : null;
    if (sekcja) sekcja.addEventListener('toggle', function () { if (sekcja.open) pokazOstatnie(); });
    doc.addEventListener('vilda:auth-state-settled', pokazOstatnie);
    stan('start');
    pokazOstatnie();
    return true;
  }

  var api = {
    __init: true,
    VERSION: VERSION,
    PREF_KEY: PREF_KEY,
    sprawdz: sprawdz,
    mount: mount,
    __internals: {
      tokenyNazwy: tokenyNazwy,
      kluczNazwy: kluczNazwy,
      dataUrodzenia: dataUrodzenia,
      plec: plec,
      wierszZapisu: wierszZapisu,
      porownaj: porownaj,
      wzorzecKarty: wzorzecKarty,
      ocenKarte: ocenKarte,
      uzupelnijInnymiKartami: uzupelnijInnymiKartami,
      wierszeDoPokazania: wierszeDoPokazania,
      odmiana: odmiana,
      formatDaty: formatDaty,
      formatPomiarow: formatPomiarow,
      zdanieWyniku: zdanieWyniku,
      opisSlabej: opisSlabej,
      dowodyPomylki: dowodyPomylki,
      czytajOstatnie: czytajOstatnie,
      zapiszOstatnie: zapiszOstatnie,
    },
  };
  w.VildaSpojnoscZapisow = api;

  if (doc && typeof doc.getElementById === 'function') {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount);
    else mount();
  }
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
