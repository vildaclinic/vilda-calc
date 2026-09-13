/* vilda_dob_age.js — pole „Data urodzenia” w formularzu głównym (index.html, docpro.html).
 *
 * DOB-AGE-1 (decyzja właściciela 2026-09-13). Lekarz wpisuje datę urodzenia raz, a wiek
 * w latach i miesiącach wypełnia się sam — przy tej wizycie i przy każdej następnej,
 * licząc UKOŃCZONE pełne miesiące. Bez daty formularz działa dokładnie tak jak dotąd.
 *
 * DLACZEGO TAK, A NIE PRZEZ NOWY „KANONICZNY WIEK”
 *   `#age` i `#ageMonths` czyta 34 pliki aplikacji, a wzorzec `lata + miesiące/12` jest
 *   w nich przepisany dziesiątki razy (getAgeDecimal, getUserBasics, _getUserBasics,
 *   getGrowthDataSourceAgeYears i po kopii w niemal każdym module). Te dwa pola SĄ
 *   kontraktem. Data urodzenia jest więc METODĄ WPISU, która je wypełnia — nie ich
 *   zamiennikiem. Dzięki temu żaden moduł liczący nie wymaga zmiany.
 *
 * GNIAZDO W REKORDZIE JUŻ ISTNIEJE
 *   Sejf i Karta Pacjenta od dawna obsługują `payload.user.dobISO` (sanitizeDobISO,
 *   calcAgeFromDOB, resolvePatientAge, edytor DOB w karcie). Brakowało wyłącznie pola
 *   w formularzu głównym i jednej linii w kolektorze — ten moduł domyka pierwszą część.
 *
 * DOBA LOKALNA
 *   Wiek liczymy na dzień LOKALNY, nie UTC. `new Date().toISOString()` oddaje dzień
 *   w strefie UTC, więc w Polsce między północą a 1:00/2:00 dziecko w dniu swoich
 *   urodzin miałoby wiek o miesiąc niższy. Patrz tests/unit/lokalna-doba.test.mjs.
 *
 * CZEGO TU NIE MA
 *   Wieku w tygodniach dla niemowląt < 3 mies. (rata 2) oraz zapisu daty do
 *   `sharedUserData` — data urodzenia jest daną identyfikującą, a wspólny stan stron
 *   leży w niezaszyfrowanym magazynie przeglądarki. Między stronami wędruje sam wiek.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  /* Pola formularza. `dobInput` to jedyne nowe; reszta istnieje od zawsze. */
  var ID = {
    dob: 'dobInput',
    note: 'dobNote',
    error: 'dobError',
    clear: 'dobClear',
    years: 'age',
    months: 'ageMonths'
  };

  var KLASA_AUTO = 'vild-age-auto';

  var KOMUNIKAT = {
    format: 'Nie rozpoznano daty. Podaj dzień, miesiąc i czterocyfrowy rok, np. 20-08-2019.',
    year: 'Rok poza zakresem 1900–2999.',
    calendar: 'Taki dzień nie istnieje w kalendarzu.',
    future: 'Data urodzenia nie może być z przyszłości.'
  };

  /* ---------------------------------------------------------------- parsowanie */

  /* Separator może być inny przy każdej liczbie („11.04/2025”), może go nie być wcale
     („20082025”), a wklejona data w zapisie ISO też ma działać. Rok zawsze czterocyfrowy:
     przy dwóch cyfrach nie da się odróżnić 1925 od 2025, a zła setka to zła siatka. */
  var RE_ISO = /^(\d{4})\s*[-./, ]\s*(\d{1,2})\s*[-./, ]\s*(\d{1,2})$/;
  var RE_DMY = /^(\d{1,2})\s*[-./, ]\s*(\d{1,2})\s*[-./, ]\s*(\d{4})$/;
  var RE_ZWARTA = /^(\d{2})(\d{2})(\d{4})$/;

  function dwuCyfry(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function doISO(rok, miesiac, dzien) {
    return rok + '-' + dwuCyfry(miesiac) + '-' + dwuCyfry(dzien);
  }

  /* Dzisiejsza doba LOKALNA jako Date o północy — punkt odniesienia dla wieku. */
  function dzisLokalnie(teraz) {
    var t = teraz instanceof Date && !isNaN(teraz.getTime()) ? teraz : new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }

  /* Zwraca {status, iso}. Status inny niż 'ok' ma gotowy komunikat w KOMUNIKAT. */
  function parseDobInput(surowe, teraz) {
    var tekst = String(surowe == null ? '' : surowe).trim();
    if (tekst === '') return { status: 'empty', iso: null };

    var rok;
    var miesiac;
    var dzien;
    var trafienie = tekst.match(RE_ISO);

    if (trafienie) {
      rok = +trafienie[1];
      miesiac = +trafienie[2];
      dzien = +trafienie[3];
    } else if ((trafienie = tekst.match(RE_DMY))) {
      dzien = +trafienie[1];
      miesiac = +trafienie[2];
      rok = +trafienie[3];
    } else if ((trafienie = tekst.match(RE_ZWARTA))) {
      dzien = +trafienie[1];
      miesiac = +trafienie[2];
      rok = +trafienie[3];
    } else {
      return { status: 'format', iso: null };
    }

    if (rok < 1900 || rok > 2999) return { status: 'year', iso: null };

    /* Data budowana LOKALNIE, żeby porównanie z dzisiejszą dobą było w tej samej strefie. */
    var proba = new Date(rok, miesiac - 1, dzien);
    if (proba.getFullYear() !== rok || proba.getMonth() !== miesiac - 1 || proba.getDate() !== dzien) {
      return { status: 'calendar', iso: null };
    }
    if (proba.getTime() > dzisLokalnie(teraz).getTime()) return { status: 'future', iso: null };

    return { status: 'ok', iso: doISO(rok, miesiac, dzien) };
  }

  function formatDobDisplay(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? '' : iso).trim());
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }

  /* ------------------------------------------------------------------- wiek */

  /* Ukończone pełne miesiące, z pożyczką dnia miesiąca — ta sama reguła, co
     calcAgeFromDOB w sejfie, żeby formularz i kartoteka nigdy nie podały dwóch
     różnych wieków dla tego samego dziecka. */
  function ageFromDobISO(iso, naDzien) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? '' : iso).trim());
    if (!m) return null;

    var urodziny = new Date(+m[1], +m[2] - 1, +m[3]);
    var dzis = naDzien instanceof Date ? dzisLokalnie(naDzien) : dzisLokalnie(null);
    if (dzis.getTime() < urodziny.getTime()) return null;

    var lata = dzis.getFullYear() - urodziny.getFullYear();
    var miesiace = dzis.getMonth() - urodziny.getMonth();
    if (dzis.getDate() - urodziny.getDate() < 0) miesiace -= 1;
    if (miesiace < 0) {
      lata -= 1;
      miesiace += 12;
    }

    var dni = Math.round((dzis.getTime() - urodziny.getTime()) / 86400000);
    return {
      years: lata,
      ageMonths: miesiace,
      totalMonths: lata * 12 + miesiace,
      days: dni,
      weeks: Math.floor(dni / 7)
    };
  }

  function opisWieku(wiek) {
    if (!wiek) return '';
    var lata = wiek.years === 1 ? 'rok' : odmiana(wiek.years, 'lata', 'lat');
    return wiek.years + ' ' + lata + ' ' + wiek.ageMonths + ' mies.';
  }

  function odmiana(n, mnoga, dopelniacz) {
    var ostatnia = n % 10;
    var dwie = n % 100;
    if (ostatnia >= 2 && ostatnia <= 4 && !(dwie >= 12 && dwie <= 14)) return mnoga;
    return dopelniacz;
  }

  /* -------------------------------------------------------------------- DOM */

  function dok() {
    return w && w.document ? w.document : null;
  }

  function pole(id) {
    var d = dok();
    return d ? d.getElementById(id) : null;
  }

  /* Wartość ustawiona z kodu nie wywołuje `oninput`, a na nim stoi przeliczanie
     całej strony — dlatego zdarzenie wysyłamy ręcznie. */
  function ustawZPowiadomieniem(el, wartosc) {
    if (!el) return;
    var nowa = wartosc == null ? '' : String(wartosc);
    if (el.value === nowa) return;
    el.value = nowa;
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
      zgloc('dispatch', e);
    }
  }

  function zablokujWiek(zablokowac) {
    [pole(ID.years), pole(ID.months)].forEach(function (el) {
      if (!el) return;
      try {
        el.readOnly = !!zablokowac;
      } catch (e) {
        zgloc('readOnly', e);
      }
      if (el.classList) el.classList.toggle(KLASA_AUTO, !!zablokowac);
    });
  }

  function pokaz(el, tekst) {
    if (!el) return;
    var jest = !!(tekst && String(tekst).trim());
    el.textContent = jest ? tekst : '';
    el.hidden = !jest;
  }

  function zgloc(krok, blad) {
    try {
      if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
        globalThis.vildaLogSwallowedCatch('vilda_dob_age.js', blad, { step: krok });
      }
    } catch (e) {
      /* logowanie nie może wywrócić formularza */
    }
  }

  /* Czy data pochodzi z wczytanego rekordu — wtedy pole jest tylko do odczytu,
     a poprawka idzie przez „Edytuj” w Karcie Pacjenta (tak jak płeć, którą
     restoreLoadedState blokuje po wczytaniu pacjenta). */
  function zRekordu(el) {
    return !!(el && el.dataset && el.dataset.dobSource === 'record');
  }

  /* Jedyne miejsce, które decyduje o stanie pól. Wywoływane po wpisaniu daty,
     po wczytaniu pacjenta i przy starcie strony. */
  function odswiez(opcje) {
    var d = dok();
    if (!d) return null;

    var wejscie = pole(ID.dob);
    if (!wejscie) return null;

    var ustawienia = opcje && typeof opcje === 'object' ? opcje : {};
    var notka = pole(ID.note);
    var blad = pole(ID.error);
    var czysc = pole(ID.clear);
    var wynik = parseDobInput(wejscie.value, ustawienia.now || null);

    if (wynik.status === 'empty') {
      zablokujWiek(false);
      pokaz(notka, '');
      pokaz(blad, '');
      if (czysc) czysc.hidden = true;
      return wynik;
    }

    if (wynik.status !== 'ok') {
      /* Zły zapis nie może zablokować pól wieku — lekarz musi mieć czym pracować. */
      zablokujWiek(false);
      pokaz(notka, '');
      pokaz(blad, KOMUNIKAT[wynik.status] || KOMUNIKAT.format);
      if (czysc) czysc.hidden = true;
      return wynik;
    }

    var wiek = ageFromDobISO(wynik.iso, ustawienia.now || null);
    if (!wiek) {
      zablokujWiek(false);
      pokaz(notka, '');
      pokaz(blad, KOMUNIKAT.future);
      if (czysc) czysc.hidden = true;
      return { status: 'future', iso: null };
    }

    ustawZPowiadomieniem(pole(ID.years), wiek.years);
    ustawZPowiadomieniem(pole(ID.months), wiek.ageMonths);
    zablokujWiek(true);
    pokaz(blad, '');
    pokaz(
      notka,
      zRekordu(wejscie)
        ? 'Z kartoteki. Wiek na dzień dzisiejszej wizyty: ' + opisWieku(wiek) + '. Zmiana daty w Karcie Pacjenta.'
        : 'Wiek liczony z daty urodzenia na dzień wizyty: ' + opisWieku(wiek) + '.'
    );
    if (czysc) czysc.hidden = zRekordu(wejscie);

    return { status: 'ok', iso: wynik.iso, age: wiek };
  }

  /* Data z wczytanego rekordu: wpisz, oznacz jako pochodzącą z kartoteki i zablokuj. */
  function setFromRecord(iso) {
    var wejscie = pole(ID.dob);
    if (!wejscie) return false;

    var czysta = parseDobInput(iso, null);
    if (czysta.status !== 'ok') return false;

    wejscie.value = formatDobDisplay(czysta.iso);
    try {
      wejscie.readOnly = true;
      wejscie.dataset.dobSource = 'record';
    } catch (e) {
      zgloc('setFromRecord', e);
    }
    odswiez();
    return true;
  }

  /* Ręczne czyszczenie (link pod polem) — bez pytania o potwierdzenie, decyzja
     właściciela: pola wieku wracają do ręcznego wpisu z ostatnią wyliczoną wartością. */
  function clear() {
    var wejscie = pole(ID.dob);
    if (!wejscie || zRekordu(wejscie)) return false;
    wejscie.value = '';
    odswiez();
    try {
      wejscie.focus();
    } catch (e) {
      zgloc('clear-focus', e);
    }
    return true;
  }

  /* Bieżąca data w zapisie ISO albo null — czyta ją kolektor rekordu. */
  function readISO() {
    var wejscie = pole(ID.dob);
    if (!wejscie) return null;
    var wynik = parseDobInput(wejscie.value, null);
    return wynik.status === 'ok' ? wynik.iso : null;
  }

  function odblokujPoWyczyszczeniuPacjenta() {
    var wejscie = pole(ID.dob);
    if (!wejscie) return;
    try {
      wejscie.readOnly = false;
      delete wejscie.dataset.dobSource;
    } catch (e) {
      zgloc('unlock', e);
    }
    wejscie.value = '';
    odswiez();
  }

  /* Data z rekordu, który aplikacja właśnie wczytała. Gdy jej nie ma, zostaje to,
     co lekarz wpisał ręcznie — wczytanie pacjenta bez daty niczego nie kasuje. */
  function przyjmijZWczytanego() {
    var iso = null;
    try {
      var wczytane = w.lastLoadedData;
      if (wczytane && wczytane.user && typeof wczytane.user.dobISO === 'string') iso = wczytane.user.dobISO;
    } catch (e) {
      zgloc('lastLoadedData', e);
    }
    if (iso && setFromRecord(iso)) return;
    odswiez();
  }

  var zamontowano = false;

  function mount() {
    var d = dok();
    if (!d || zamontowano) return false;

    var wejscie = d.getElementById(ID.dob);
    if (!wejscie) return false;
    zamontowano = true;

    wejscie.addEventListener('input', function () {
      odswiez();
    });
    wejscie.addEventListener('change', function () {
      /* Po opuszczeniu pola normalizujemy zapis do DD-MM-RRRR, żeby „20082025”
         i „2025-08-20” zostawiły w formularzu tę samą, czytelną postać. */
      var wynik = parseDobInput(wejscie.value, null);
      if (wynik.status === 'ok') wejscie.value = formatDobDisplay(wynik.iso);
      odswiez();
    });

    var czysc = d.getElementById(ID.clear);
    if (czysc) {
      czysc.addEventListener('click', function () {
        clear();
      });
    }

    /* Rekord wczytuje się trzema drogami („Odtwórz zapis”, „Nowy pomiar”, wejście
       z Karty Pacjenta) i żadna nie wysyła zdarzenia `input`. Zamiast dopisywać się
       do każdej z nich, po zdarzeniu aplikacji czytamy datę wprost z wczytanego
       rekordu — jedno miejsce zamiast trzech. */
    ['vilda:patient-loaded', 'vilda:state-restored'].forEach(function (nazwa) {
      d.addEventListener(nazwa, function () {
        try {
          if (w.setTimeout) w.setTimeout(przyjmijZWczytanego, 0);
          else przyjmijZWczytanego();
        } catch (e) {
          zgloc(nazwa, e);
        }
      });
    });
    d.addEventListener('vilda:user-state-cleared', function () {
      odblokujPoWyczyszczeniuPacjenta();
    });

    odswiez();
    return true;
  }

  function autoMount() {
    var d = dok();
    if (!d) return;
    if (d.readyState === 'loading') {
      d.addEventListener('DOMContentLoaded', function () { mount(); });
    } else {
      mount();
    }
  }

  w.VildaDobAge = {
    VERSION: VERSION,
    version: VERSION,
    parseDobInput: parseDobInput,
    formatDobDisplay: formatDobDisplay,
    ageFromDobISO: ageFromDobISO,
    describeAge: opisWieku,
    localToday: dzisLokalnie,
    messages: KOMUNIKAT,
    refresh: odswiez,
    setFromRecord: setFromRecord,
    clear: clear,
    readISO: readISO,
    mount: mount
  };

  autoMount();
})(typeof window !== 'undefined' ? window : globalThis);
