/* vilda_plec_z_imienia.js — płeć NOWEGO pacjenta podpowiadana z imienia i nazwiska.
 *
 * P-PLEC-IMIE (decyzja właściciela 2026-10-12)
 *   Pole płci w formularzu głównym zaczyna od „Mężczyzna” (pierwsza opcja; „Wyczyść” wraca do M).
 *   Lekarz, który zapomni je zmienić, widzi u „Anny …” obliczenia dla mężczyzny. Ten moduł ustawia
 *   płeć z imienia (słownik imion z rejestru PESEL) i z nazwiska (-ski/-cki/-dzki ↔ -ska/-cka/-dzka),
 *   wyłącznie dla nowego pacjenta przed pierwszym zapisem i zawsze z widoczną notką.
 *
 * REGUŁY
 *   1. Tylko nowy pacjent. Działa, gdy pola tożsamości są wolne (vilda_pola_tozsamosci.js: brak
 *      wczytanego pacjenta) i pole płci nie jest wyłączone. Po pierwszym zapisie albo wczytaniu płeć
 *      jest z kartoteki i zmienia się ją w Karcie Pacjenta — moduł jej nie dotyka.
 *   2. Tylko wpis lekarza. Ustawia płeć po zaufanym (`isTrusted`) zdarzeniu `change` na #firstName
 *      albo #lastName, czyli po wyjściu z pola, a nie po każdym znaku. Wczytanie, odtworzenie po F5,
 *      import, lustro formularza między stronami i podpowiedź pacjenta nigdy go nie uruchamiają.
 *   3. Wybór lekarza wygrywa. Po zaufanej zmianie #sex moduł tej płci już nie zmienia (do „Wyczyść”).
 *      Płeć wpisana z zewnątrz (odtworzenie, lustro, import) też jest nietykalna.
 *   4. Tylko jednoznaczny sygnał. Imię decyduje, gdy w słowniku nosi je co najmniej PROG_LICZBY osób
 *      i co najmniej PROG_UDZIALU z nich ma jedną płeć. Nazwisko w formie przymiotnikowej decyduje,
 *      gdy imię nie rozstrzyga. Imię niejednoznaczne albo nieznane bez sygnału z nazwiska → płeć bez
 *      zmian i notka „Sprawdź płeć…”.
 *   5. Nigdy po cichu. Każda decyzja i każda wątpliwość ma notkę #plecZImieniaNote pod polem.
 *      Format rekordu się nie zmienia (płeć nadal M/F). Zmiana idzie zwykłymi zdarzeniami
 *      input/change, więc przeliczenia, autozapis i lustro formularza działają jak przy wyborze ręcznym.
 *
 * DANE
 *   Słownik mieszka w osobnym pliku (vilda_imiona_plec_dane.js), który rejestruje źródło
 *   w `window.VildaImionaPlecZrodla`. Silnik przyjmuje źródło jako argument (reguła właściciela
 *   2026-09-09: normy jako dane, nie założenie w silniku), a wynik niesie identyfikator, nazwę
 *   i stan źródła. Bez pliku danych działa tylko reguła nazwiska, bez ostrzeżeń o imieniu.
 *
 * P-PLEC-IMIE-2 (zgłoszenie właściciela 2026-10-13)
 *   Wpis „z zewnątrz” to zdarzenie programowe, które ZMIENIA wartość płci albo tożsamości. Samo
 *   powiadomienie bez zmiany (custom-fixes.js ponawia `change` na polach lustra ~3,2 s po „Wyczyść”
 *   i po wczytaniu) nie wyłącza automatu — dotąd drugi nowy pacjent po „Odrzuć dane i wyczyść”
 *   zostawał przy „M”, gdy lekarz zdążył wpisać nazwisko przed tym powiadomieniem.
 *
 * BEZPIECZNIKI
 *   Strona bez pól imienia i płci: moduł nic nie robi. Niczego nie zapisuje sam, nie liczy,
 *   żadna funkcja nie rzuca na zewnątrz. Rejestr: docs/clinical/ALGORITHMS.md, P-PLEC-IMIE.
 */
(function (w) {
  'use strict';
  var d = w && w.document;
  if (!d || typeof d.getElementById !== 'function') return;
  if (w.VildaPlecZImienia && w.VildaPlecZImienia.__init) return;

  var VERSION = '2';
  var ID = { imie: 'firstName', nazwisko: 'lastName', kanon: 'name', plec: 'sex', notka: 'plecZImieniaNote' };

  /* Imię rozstrzyga, gdy nosi je co najmniej 20 osób i co najmniej 99% z nich ma jedną płeć.
     Rzadsze imię traktujemy jak nieznane — mała liczba nosicieli nie mówi nic pewnego. */
  var PROG_UDZIALU = 0.99;
  var PROG_LICZBY = 20;

  /* Przymiotnikowe nazwiska polskie: forma żeńska i męska. Przed końcówką co najmniej dwie litery. */
  var KONCOWKI = [['dzka', 'F'], ['dzki', 'M'], ['ska', 'F'], ['ski', 'M'], ['cka', 'F'], ['cki', 'M']];
  var MIN_RDZEN = 2;

  var STAN = { DOMYSLNA: 'domyslna', AUTOMAT: 'automat', LEKARZ: 'lekarz', ZEWNETRZNA: 'zewnetrzna' };
  var KLASA_INFO = 'vild-dob-note';
  var KLASA_UWAGA = 'vild-dob-error';

  function zgloc(gdzie, e) {
    try {
      var L = w.VildaLogger || w.vildaLogger;
      if (L && typeof L.warn === 'function') L.warn('plec-z-imienia', gdzie, e || null);
    } catch (err) { /* logger niedostępny */ }
  }

  function tekst(v) {
    return v == null ? '' : String(v);
  }

  function nfc(s) {
    try { return typeof s.normalize === 'function' ? s.normalize('NFC') : s; } catch (e) { return s; }
  }

  function malymi(s) {
    try { return s.toLocaleLowerCase('pl'); } catch (e) { return s.toLowerCase(); }
  }

  /* ------------------------------------------------------------------ silnik (bez DOM) */

  /* Klucz słownika: pierwsze imię z pola (do spacji, łącznika, przecinka albo ukośnika), małymi
     literami, w postaci NFC, bez znaków nieliterowych na brzegach. „ Anna-Maria ” → „anna”. */
  function kluczImienia(imie) {
    var s = malymi(nfc(tekst(imie))).replace(/\s+/g, ' ').trim();
    if (!s) return '';
    var pierwsze = s.split(/[\s,;/\p{Pd}]+/u)[0] || '';
    return pierwsze.replace(/^[^\p{L}]+/u, '').replace(/[^\p{L}]+$/u, '');
  }

  /* „Lukasz” wpisany bez polskich znaków ma trafić w „łukasz”. Ł nie rozkłada się w NFD. */
  function bezOgonkow(s) {
    var t = tekst(s);
    try { t = t.normalize('NFD'); } catch (e) { /* bez normalize: tylko ł */ }
    return t.replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/Ł/g, 'L');
  }

  /* Pierwsza część pola, tak jak ją wpisano — do notki. */
  function pierwszeSlowo(s) {
    var t = tekst(s).replace(/\s+/g, ' ').trim();
    return t ? (t.split(/[\s,;/\p{Pd}]+/u)[0] || '') : '';
  }

  function zrodla() {
    var r = w.VildaImionaPlecZrodla;
    if (!r || typeof r !== 'object') return [];
    return Object.keys(r).sort().map(function (k) { return r[k]; }).filter(function (z) {
      return Boolean(z && z.imiona && typeof z.imiona === 'object');
    });
  }

  /* Automatyczny dobór: najnowszy stan źródła dla kraju (dziś jest tylko PL). */
  function zrodloDomyslne(kraj) {
    var k = kraj || 'PL';
    var lista = zrodla().filter(function (z) { return z.kraj === k; });
    lista.sort(function (a, b) { return tekst(b.stanNa).localeCompare(tekst(a.stanNa)); });
    return lista[0] || null;
  }

  function opisZrodla(z) {
    if (!z) return null;
    return { id: z.id || null, nazwa: z.nazwa || null, stanNa: z.stanNa || null, kraj: z.kraj || null };
  }

  /* Indeks bez polskich znaków: liczby zsumowane po wszystkich imionach o tej samej postaci złożonej. */
  var zlozone = typeof w.WeakMap === 'function' ? new w.WeakMap() : null;
  function indeksZlozony(z) {
    if (zlozone && zlozone.has(z)) return zlozone.get(z);
    var idx = Object.create(null);
    Object.keys(z.imiona).forEach(function (k) {
      var wiersz = z.imiona[k];
      if (!wiersz) return;
      var kz = bezOgonkow(k);
      var s = idx[kz] || (idx[kz] = [0, 0]);
      s[0] += Number(wiersz[0]) || 0;
      s[1] += Number(wiersz[1]) || 0;
    });
    if (zlozone) zlozone.set(z, idx);
    return idx;
  }

  function liczby(z, klucz) {
    var im = z && z.imiona;
    if (!im || !klucz) return null;
    if (Object.prototype.hasOwnProperty.call(im, klucz) && im[klucz]) {
      return { kobiety: Number(im[klucz][0]) || 0, mezczyzni: Number(im[klucz][1]) || 0, dokladne: true };
    }
    var zl = indeksZlozony(z)[bezOgonkow(klucz)];
    return zl ? { kobiety: zl[0], mezczyzni: zl[1], dokladne: false } : null;
  }

  /* Ocena imienia według źródła. powod: 'puste' | 'brak-slownika' | 'nieznane' | 'niejednoznaczne'
     | 'slownik'. Plec tylko przy 'slownik'. */
  function ocenImie(imie, zrodlo) {
    var z = zrodlo === undefined ? zrodloDomyslne() : zrodlo;
    var wynik = {
      plec: null, powod: 'puste', imie: pierwszeSlowo(imie), klucz: kluczImienia(imie),
      kobiety: 0, mezczyzni: 0, udzial: null, dokladne: null, zrodlo: opisZrodla(z),
    };
    if (!wynik.klucz) return wynik;
    if (!z || !z.imiona) { wynik.powod = 'brak-slownika'; return wynik; }
    var l = liczby(z, wynik.klucz);
    if (!l) { wynik.powod = 'nieznane'; return wynik; }
    wynik.kobiety = l.kobiety;
    wynik.mezczyzni = l.mezczyzni;
    wynik.dokladne = l.dokladne;
    var suma = l.kobiety + l.mezczyzni;
    if (suma < PROG_LICZBY) { wynik.powod = 'nieznane'; return wynik; }
    var kobiet = l.kobiety / suma;
    wynik.udzial = Math.max(kobiet, 1 - kobiet);
    if (kobiet >= PROG_UDZIALU) { wynik.plec = 'F'; wynik.powod = 'slownik'; }
    else if (1 - kobiet >= PROG_UDZIALU) { wynik.plec = 'M'; wynik.powod = 'slownik'; }
    else wynik.powod = 'niejednoznaczne';
    return wynik;
  }

  function koncowka(czlon) {
    for (var i = 0; i < KONCOWKI.length; i += 1) {
      var k = KONCOWKI[i][0];
      if (czlon.length >= k.length + MIN_RDZEN && czlon.slice(-k.length) === k) return KONCOWKI[i][1];
    }
    return null;
  }

  /* Ocena nazwiska: każdy człon (spacje, łączniki) osobno. powod: 'puste' | 'brak' | 'sprzeczne'
     | 'koncowka'. „Nowak-Testowska” → F; „Testowska-Testowski” → sprzeczne, bez płci. */
  function ocenNazwisko(nazwisko) {
    var surowe = tekst(nazwisko).replace(/\s+/g, ' ').trim();
    var wynik = { plec: null, powod: 'puste', nazwisko: surowe, czlon: '' };
    var s = malymi(nfc(surowe));
    if (!s) return wynik;
    var kobiece = null;
    var meskie = null;
    s.split(/[\s\p{Pd}]+/u).forEach(function (c) {
      var p = koncowka(c.replace(/[^\p{L}]+/gu, ''));
      if (p === 'F' && !kobiece) kobiece = c;
      if (p === 'M' && !meskie) meskie = c;
    });
    if (kobiece && meskie) { wynik.powod = 'sprzeczne'; return wynik; }
    if (kobiece || meskie) {
      wynik.plec = kobiece ? 'F' : 'M';
      wynik.powod = 'koncowka';
      wynik.czlon = kobiece || meskie;
      return wynik;
    }
    wynik.powod = 'brak';
    return wynik;
  }

  /* Podpowiedź łączna. powod: 'imie' | 'imie-i-nazwisko' | 'nazwisko' | 'niejednoznaczne'
     | 'nieznane' | 'brak'. Imię ze słownika jest silniejsze od reguły nazwiska; sprzeczne nazwisko
     nie zmienia decyzji, tylko ustawia `konflikt` (notka to mówi). */
  function podpowiedz(dane, zrodlo) {
    var we = dane || {};
    var z = zrodlo === undefined ? zrodloDomyslne() : zrodlo;
    var im = ocenImie(we.imie, z);
    var na = ocenNazwisko(we.nazwisko);
    var wynik = { plec: null, powod: 'brak', konflikt: false, imie: im, nazwisko: na, zrodlo: opisZrodla(z) };
    if (im.plec) {
      wynik.plec = im.plec;
      if (na.plec && na.plec !== im.plec) { wynik.powod = 'imie'; wynik.konflikt = true; }
      else wynik.powod = na.plec ? 'imie-i-nazwisko' : 'imie';
      return wynik;
    }
    if (na.plec) {
      wynik.plec = na.plec;
      wynik.powod = 'nazwisko';
      return wynik;
    }
    if (im.powod === 'niejednoznaczne' || im.powod === 'nieznane') wynik.powod = im.powod;
    return wynik;
  }

  function slowoPlci(plec, zenskie, meskie) {
    return plec === 'F' ? zenskie : meskie;
  }

  /* Treść notki z podpowiedzi, pochodzenia płci w polu i jej wartości. null = notka ukryta. */
  function trescNotki(wynik, stanPlci, plec) {
    if (!wynik) return null;
    var cel = wynik.plec;
    var imie = wynik.imie && wynik.imie.imie;
    var nazwisko = wynik.nazwisko && wynik.nazwisko.nazwisko;
    if (cel && plec === cel) {
      if (stanPlci !== STAN.AUTOMAT) return null;
      if (wynik.powod === 'imie' && wynik.konflikt) {
        return {
          uwaga: true,
          tekst: 'Płeć ustawiona na podstawie imienia „' + imie + '”, ale nazwisko „' + nazwisko + '” ma formę '
            + slowoPlci(wynik.nazwisko.plec, 'żeńską', 'męską') + ' — sprawdź.',
        };
      }
      if (wynik.powod === 'imie') return { uwaga: false, tekst: 'Płeć ustawiona na podstawie imienia „' + imie + '” — sprawdź.' };
      if (wynik.powod === 'imie-i-nazwisko') return { uwaga: false, tekst: 'Płeć ustawiona na podstawie imienia i nazwiska — sprawdź.' };
      return { uwaga: false, tekst: 'Płeć ustawiona na podstawie nazwiska „' + nazwisko + '” — sprawdź.' };
    }
    if (cel) {
      if (wynik.powod === 'imie-i-nazwisko') {
        return { uwaga: true, tekst: 'Sprawdź płeć: imię i nazwisko wskazują płeć ' + slowoPlci(cel, 'żeńską', 'męską') + '.' };
      }
      if (wynik.powod === 'imie') {
        return { uwaga: true, tekst: 'Sprawdź płeć: imię „' + imie + '” jest zwykle ' + slowoPlci(cel, 'żeńskie', 'męskie') + '.' };
      }
      return { uwaga: true, tekst: 'Sprawdź płeć: nazwisko „' + nazwisko + '” ma formę ' + slowoPlci(cel, 'żeńską', 'męską') + '.' };
    }
    if (stanPlci === STAN.LEKARZ || stanPlci === STAN.ZEWNETRZNA) return null;
    if (wynik.powod === 'niejednoznaczne') return { uwaga: true, tekst: 'Sprawdź płeć: imię „' + imie + '” noszą kobiety i mężczyźni.' };
    if (wynik.powod === 'nieznane') return { uwaga: true, tekst: 'Sprawdź płeć: imienia „' + imie + '” nie ma w słowniku.' };
    return null;
  }

  function liczba(n) {
    try { return Number(n).toLocaleString('pl-PL'); } catch (e) { return String(n); }
  }

  /* Podpowiedź po najechaniu na notkę: skąd decyzja (liczby ze źródła). */
  function tytulNotki(wynik) {
    var im = wynik && wynik.imie;
    if (!im || !im.zrodlo || !(im.kobiety || im.mezczyzni)) return '';
    var z = im.zrodlo;
    return 'Imię „' + im.imie + '”: ' + liczba(im.kobiety) + ' kobiet, ' + liczba(im.mezczyzni) + ' mężczyzn — '
      + (z.nazwa || z.id || 'słownik imion') + (z.stanNa ? ', stan na ' + z.stanNa : '') + '.';
  }

  /* ------------------------------------------------------------------ formularz (DOM) */

  var stan = STAN.DOMYSLNA;
  var wlasne = false;
  /* Ostatnio widziane wartości: tożsamość (lekarz pisze albo przyszła z zewnątrz) i płeć w polu.
     Zdarzenie programowe, które ich nie zmienia, jest tylko powiadomieniem, a nie wpisem. */
  var PO_WYCZYSZCZENIU = { tozsamosc: '|', plec: 'M' };
  var widziane = { tozsamosc: PO_WYCZYSZCZENIU.tozsamosc, plec: PO_WYCZYSZCZENIU.plec };

  function pole(id) {
    try { return d.getElementById(id); } catch (e) { return null; }
  }

  function wartosc(id) {
    var el = pole(id);
    return el && typeof el.value === 'string' ? el.value : '';
  }

  function tozsamoscPusta() {
    return !wartosc(ID.imie).trim() && !wartosc(ID.nazwisko).trim();
  }

  function kluczTozsamosci() {
    return [wartosc(ID.nazwisko), wartosc(ID.imie)].map(function (v) {
      return malymi(v.replace(/\s+/g, ' ').trim());
    }).join('|');
  }

  function biezacaPlec() {
    var p = pole(ID.plec);
    return p && typeof p.value === 'string' ? p.value : '';
  }

  function zapamietaj() {
    widziane.tozsamosc = kluczTozsamosci();
    widziane.plec = biezacaPlec();
  }

  /* Pacjent z kartoteki albo pola zablokowane przez kogokolwiek — moduł nie ma tu nic do roboty. */
  function zablokowane() {
    var plec = pole(ID.plec);
    if (!plec || plec.disabled) return true;
    var imie = pole(ID.imie);
    var nazwisko = pole(ID.nazwisko);
    if ((imie && imie.readOnly) || (nazwisko && nazwisko.readOnly)) return true;
    try {
      var T = w.VildaPolaTozsamosci;
      if (T && typeof T.zablokowane === 'function' && T.zablokowane()) return true;
    } catch (e) { zgloc('blokada', e); }
    return false;
  }

  /* Wpis z zewnątrz: odtworzenie stanu (F5, panel powłoki) albo lustro formularza innej strony. */
  function wpisZZewnatrz() {
    return Boolean(w.__vildaPersistRestoring || w.__vildaLustroWpis);
  }

  function biezacaPodpowiedz() {
    return podpowiedz({ imie: wartosc(ID.imie), nazwisko: wartosc(ID.nazwisko) });
  }

  function pokaz(t, wynik) {
    var n = pole(ID.notka);
    if (!n) return;
    try {
      if (!t) {
        n.textContent = '';
        n.hidden = true;
        n.removeAttribute('title');
        return;
      }
      n.textContent = t.tekst;
      if (n.classList) {
        n.classList.toggle(KLASA_UWAGA, Boolean(t.uwaga));
        n.classList.toggle(KLASA_INFO, !t.uwaga);
      }
      var tytul = tytulNotki(wynik);
      if (tytul) n.title = tytul; else n.removeAttribute('title');
      n.hidden = false;
    } catch (e) { zgloc('notka', e); }
  }

  function odswiezNotke() {
    try {
      if (zablokowane()) { pokaz(null); return; }
      var wynik = biezacaPodpowiedz();
      var plec = pole(ID.plec);
      pokaz(trescNotki(wynik, stan, plec ? plec.value : ''), wynik);
    } catch (e) { zgloc('odswiez', e); }
  }

  var czeka = null;
  function zaplanujNotke() {
    if (czeka) return;
    czeka = w.setTimeout(function () {
      czeka = null;
      odswiezNotke();
    }, 50);
  }

  function ustawPlec(plec) {
    var el = pole(ID.plec);
    if (!el || el.value === plec) return false;
    el.value = plec;
    widziane.plec = plec;
    wlasne = true;
    try {
      /* Jak wybór z listy: input, potem change (przeliczenia, autozapis, lustro formularza). */
      el.dispatchEvent(new w.Event('input', { bubbles: true }));
      el.dispatchEvent(new w.Event('change', { bubbles: true }));
    } catch (e) {
      zgloc('zdarzenia', e);
    } finally {
      wlasne = false;
    }
    return true;
  }

  /* Lekarz opuścił pole imienia albo nazwiska po wpisaniu: decyzja i notka. */
  function rozstrzygnij() {
    try {
      if (zablokowane()) { pokaz(null); return; }
      if (tozsamoscPusta()) {
        /* Lekarz sam wyczyścił imię i nazwisko — zaczyna od nowa. Płeć zostaje, jaka jest
           (żadnej cichej zmiany), ale następny wpis znowu może ją ustawić. Jego własny wybór
           płci obowiązuje dalej. */
        if (stan !== STAN.LEKARZ) stan = STAN.DOMYSLNA;
        pokaz(null);
        return;
      }
      var wynik = biezacaPodpowiedz();
      if (wynik.plec && (stan === STAN.DOMYSLNA || stan === STAN.AUTOMAT)) {
        ustawPlec(wynik.plec);
        stan = STAN.AUTOMAT;
      }
      var plec = pole(ID.plec);
      pokaz(trescNotki(wynik, stan, plec ? plec.value : ''), wynik);
    } catch (e) { zgloc('rozstrzygnij', e); }
  }

  function naZdarzeniePola(e) {
    if (wlasne || !e) return;
    var t = e.target;
    var id = t && t.id;
    if (!id) return;
    if (id === ID.plec) {
      if (e.type !== 'change') return;
      /* Zaufana zmiana = wybór lekarza. Programowa (odtworzenie, lustro, import, inne moduły):
         płeć przyszła z zewnątrz, gdy idzie razem z tożsamością albo gdy nie jest domyślnym „M”
         (formularz bez nazwiska z „Kobietą” po F5). Samo „M” przy pustej tożsamości to stan
         wyjściowy — tak kończy się „Wyczyść”. P-PLEC-IMIE-2: liczy się tylko zdarzenie, które
         zmieniło wartość; ponowione powiadomienie z tą samą płcią niczego nie przestawia. */
      if (e.isTrusted) stan = STAN.LEKARZ;
      else if (t.value !== widziane.plec) {
        if (!tozsamoscPusta() || (t.value && t.value !== 'M')) stan = STAN.ZEWNETRZNA;
        else stan = STAN.DOMYSLNA;
      }
      widziane.plec = t.value;
      zaplanujNotke();
      return;
    }
    if (id !== ID.imie && id !== ID.nazwisko && id !== ID.kanon) return;
    if (e.isTrusted) {
      if (id !== ID.kanon) widziane.tozsamosc = kluczTozsamosci();
      if (e.type === 'change' && id !== ID.kanon) rozstrzygnij();
      return;
    }
    /* Zdarzenia programowe na nazwie: P-SPLIT przepisuje #name przy każdym znaku lekarza (bez
       znaczenia), a odtworzenie i lustro wpisują tożsamość z zewnątrz — wtedy płeć przyszła razem
       z nią i jest nietykalna. Ta sama tożsamość ponowiona z zewnątrz (odtworzenie „na żywo”
       w panelu powłoki) niczego nie zmienia. */
    if (wpisZZewnatrz()) {
      var teraz = kluczTozsamosci();
      if (teraz !== widziane.tozsamosc) {
        if (!tozsamoscPusta()) stan = STAN.ZEWNETRZNA;
        widziane.tozsamosc = teraz;
      }
      zaplanujNotke();
    }
  }

  function naCyklZycia(e) {
    var typ = e && e.type;
    if (typ === 'vilda:user-state-cleared') {
      /* Stan po „Wyczyść” wpisujemy wprost: zdarzenie bywa wysłane, zanim pola zostaną opróżnione. */
      stan = STAN.DOMYSLNA;
      widziane.tozsamosc = PO_WYCZYSZCZENIU.tozsamosc;
      widziane.plec = PO_WYCZYSZCZENIU.plec;
      pokaz(null);
      return;
    }
    if (typ === 'vilda:tozsamosc-zmiana') {
      zaplanujNotke();
      return;
    }
    if (typ === 'vilda:persist-restored') {
      /* Odtworzenie przy starcie strony i „na żywo” w panelu powłoki: z zewnątrz tylko wtedy, gdy
         coś faktycznie zmieniło w tożsamości albo płci — i jak przy polu płci: razem z tożsamością
         albo płeć inna niż domyślne „M”. */
      var odtworzona = biezacaPlec();
      var zmiana = kluczTozsamosci() !== widziane.tozsamosc || odtworzona !== widziane.plec;
      if (zmiana && (!tozsamoscPusta() || (odtworzona && odtworzona !== 'M'))) stan = STAN.ZEWNETRZNA;
      zapamietaj();
      zaplanujNotke();
      return;
    }
    /* Wczytanie, zapis, odtworzenie zapisu, import, odświeżenie bazy: rekord z kartoteki. */
    if (!tozsamoscPusta()) stan = STAN.ZEWNETRZNA;
    zapamietaj();
    zaplanujNotke();
  }

  var CYKL = ['vilda:patient-loaded', 'vilda:patient-saved', 'vilda:state-restored', 'vilda:json-imported',
    'vilda:baseline-refreshed', 'vilda:persist-restored', 'vilda:tozsamosc-zmiana', 'vilda:user-state-cleared'];

  function podepnij() {
    ['input', 'change'].forEach(function (nazwa) {
      d.addEventListener(nazwa, naZdarzeniePola, true);
    });
    CYKL.forEach(function (nazwa) { d.addEventListener(nazwa, naCyklZycia); });
    /* Wylogowanie i kasowanie stanu lecą na WINDOW (userData.js, vilda_persist_runtime.js). */
    w.addEventListener('vilda:user-state-cleared', naCyklZycia);
  }

  function start() {
    if (!pole(ID.imie) || !pole(ID.plec)) return;
    podepnij();
    /* Formularz z tożsamością już przy starcie przyszedł z zewnątrz (odtworzenie). */
    if (!tozsamoscPusta()) stan = STAN.ZEWNETRZNA;
    zapamietaj();
    odswiezNotke();
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();

  w.VildaPlecZImienia = {
    __init: true,
    version: VERSION,
    ID: ID,
    STAN: STAN,
    PROG_UDZIALU: PROG_UDZIALU,
    PROG_LICZBY: PROG_LICZBY,
    KONCOWKI: KONCOWKI,
    kluczImienia: kluczImienia,
    bezOgonkow: bezOgonkow,
    zrodla: zrodla,
    zrodloDomyslne: zrodloDomyslne,
    ocenImie: ocenImie,
    ocenNazwisko: ocenNazwisko,
    podpowiedz: podpowiedz,
    trescNotki: trescNotki,
    stan: function () { return stan; },
    odswiez: odswiezNotke
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
