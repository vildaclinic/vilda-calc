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
 * WIEK W TYGODNIACH (DOB-AGE-2, rata 2)
 *   Poniżej 3. miesiąca życia „1 miesiąc" to zły opis sześciotygodniowego niemowlęcia,
 *   więc pojawia się wtedy pole „Wiek (ukończone tygodnie)". Z datą urodzenia liczy je
 *   kalendarz (pole tylko do odczytu); bez daty lekarz wpisuje tygodnie sam, a miesiące
 *   wyliczają się z nich i stają się polami pochodnymi.
 *
 *   Tygodnie są OSOBNYM, TRWAŁYM polem rekordu (`user.ageWeeks`) obok miesięcy — decyzja
 *   właściciela. Gdyby żyły tylko jako miesiące, precyzja ginęłaby przy pierwszym
 *   przeliczeniu (6 tygodni → 1 mies. → 4 tygodnie).
 *
 *   Przeliczenie tygodni na miesiące jest PRZYBLIŻENIEM (miesiąc = 30,4375 dnia), bo
 *   „tydzień → miesiąc" nie jest funkcją: dziecko w 8. tygodniu życia ma 1 albo 2 pełne
 *   miesiące zależnie od długości miesięcy, przez które przeszło. Z datą urodzenia nic
 *   nie jest przybliżane — oba wyniki liczy ten sam kalendarz. To kolejny powód, by
 *   wpisywać datę zamiast tygodni.
 *
 * DOKŁADNY WIEK DLA SIATEK CENTYLOWYCH (DOB-AGE-4)
 *   `readExactAge()` oddaje wiek w miesiącach UŁAMKOWYCH — w tej samej skali, w której
 *   indeksowane są tablice WHO (miesiąc = 30,4375 dnia). Czyta je `getChildLMS` w app.js,
 *   żeby poniżej 36 mies. interpolować między wierszami zamiast czytać wiersz ukończonego
 *   miesiąca. Powód jest kliniczny: dziecko w 29. dobie życia, leżące DOKŁADNIE na medianie
 *   WHO, było oceniane wierszem urodzeniowym i wychodziło na 99. centylu (z = +2,44 dla
 *   długości chłopców). Błąd jest jednostronny — zawsze zawyża — i znika dopiero około
 *   pierwszych urodzin.
 *
 *   Zwracamy też `totalMonths`, czyli wiek w pełnych miesiącach wyliczony przez TEN moduł.
 *   Odbiorca ma obowiązek sprawdzić, że zgadza się z wiekiem, który sam trzyma. Bez tego
 *   „Nowy pomiar" i rekordy historyczne dostałyby dzisiejszy wiek dziecka doklejony do
 *   pomiaru sprzed roku. Niezgodność = brak uściślenia, czyli zachowanie jak dotąd.
 *
 *   Uściślamy WYŁĄCZNIE z daty urodzenia, nigdy z ręcznie wpisanych tygodni. Tygodnie
 *   niosą przedział („ukończone 4 tygodnie" to doba 28–34), więc trzeba by zgadywać punkt
 *   w środku przedziału i wprowadzać własne obciążenie. Data urodzenia nie wymaga
 *   zgadywania niczego.
 *
 * ODTWORZONY ZAPIS (P-ODTWORZ-WIEK, zgłoszenie właściciela 2026-10-08)
 *   „Odtwórz zapis" pokazuje wizytę taką, jaka była — z wiekiem z dnia POMIARU, nie z dzisiaj.
 *   Pacjent zapisany w wieku 16 lat 10 mies. i odtworzony miesiąc później dostawał tu wiek
 *   16 lat 11 mies., więc centyle formularza liczyły się dla starego wzrostu i masy w nowym
 *   wieku, a Karta Pacjenta tego samego pacjenta pokazywała co innego. Reguła jest ta sama,
 *   co w Karcie (Rata B, P3, decyzja właściciela): wzrost i masę znamy wyłącznie z chwili
 *   pomiaru, więc jedyny uczciwy wiek to wiek z tamtej chwili. Data urodzenia podpowiada wiek
 *   dopiero przy KOLEJNYM pomiarze („Nowy pomiar").
 *
 *   O trybie decyduje wybór, który aplikacja i tak trzyma w sesji (`vildaLoadChoiceV1` =
 *   'restore'): przetrwa F5 i przejście na DocPro, a nowe wczytanie pacjenta, „Nowy pomiar"
 *   i „Wyczyść" go zdejmują. Tryb trwa, dopóki masa i wzrost w formularzu są takie jak
 *   w rekordzie — nowe wartości to nowy pomiar i wiek na dziś. Wiek pomiaru: zapisany wiek
 *   rekordu; bez niego wiek z daty urodzenia na dobę pomiaru (`user.measuredAtISO`, inaczej
 *   `timestampISO`). Dokładny wiek i tygodnie liczymy na tę dobę tylko wtedy, gdy zgadza się
 *   ona z zapisanym wiekiem — inaczej nie zgadujemy i siatki wracają do wiersza ukończonego
 *   miesiąca.
 *
 *   Doba pomiaru musi przeżyć ponowny zapis: kolektor zawsze daje świeży `timestampISO`.
 *   Dlatego `readMeasuredAtISO()` oddaje kolektorowi datę pomiaru do zapisu w rekordzie, ale
 *   TYLKO pewną — z rekordu, dzień zapisu potwierdzony datą urodzenia albo dzisiejszą wizytę
 *   z wiekiem liczonym z daty urodzenia. Wiek wpisany ręcznie daty nie dostaje.
 *
 * CZEGO TU NIE MA
 *   Zapisu daty do `sharedUserData` — data urodzenia jest daną identyfikującą, a wspólny
 *   stan stron leży w niezaszyfrowanym magazynie przeglądarki. Między stronami wędruje
 *   sam wiek.
 */
(function (w) {
  'use strict';

  var VERSION = '8';

  /* Pola formularza. `dobInput` to jedyne nowe; reszta istnieje od zawsze. */
  var ID = {
    dob: 'dobInput',
    note: 'dobNote',
    error: 'dobError',
    clear: 'dobClear',
    years: 'age',
    months: 'ageMonths',
    weeks: 'ageWeeks',
    weeksRow: 'ageWeeksRow',
    weeksNote: 'ageWeeksNote',
    weeksError: 'ageWeeksError'
  };

  var KLASA_AUTO = 'vild-age-auto';

  /* Okno wieku, w którym miesiąc jest złą jednostką. 3 miesiące to ok. 13 tygodni,
     więc tyle wynosi górna granica pola; wyżej lekarz podaje wiek w miesiącach. */
  var MIES_PROG_TYGODNI = 3;
  var TYGODNI_MAX = 13;
  var DNI_W_MIESIACU = 30.4375;

  var KOMUNIKAT = {
    format: 'Nie rozpoznano daty. Podaj dzień, miesiąc i czterocyfrowy rok, np. 20-08-2019.',
    year: 'Rok poza zakresem 1900–2999.',
    calendar: 'Taki dzień nie istnieje w kalendarzu.',
    future: 'Data urodzenia nie może być z przyszłości.'
  };

  var KOMUNIKAT_TYGODNI = {
    format: 'Podaj ukończone tygodnie jako liczbę całkowitą.',
    range: 'Tygodnie podaje się do 13. tygodnia życia. Powyżej wpisz wiek w miesiącach.'
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

  /* Opis wieku kończy się skrótem „mies.", więc druga kropka dawała „mies..". */
  function zdanie(tekst) {
    return /\.$/.test(tekst) ? tekst : tekst + '.';
  }

  function odmiana(n, mnoga, dopelniacz) {
    var ostatnia = n % 10;
    var dwie = n % 100;
    if (ostatnia >= 2 && ostatnia <= 4 && !(dwie >= 12 && dwie <= 14)) return mnoga;
    return dopelniacz;
  }

  function opisTygodni(tygodnie) {
    if (tygodnie === 1) return '1 tydzień';
    return tygodnie + ' ' + odmiana(tygodnie, 'tygodnie', 'tygodni');
  }

  /* ---------------------------------------------------------------- tygodnie */

  /* Czy wiek mieści się w oknie, w którym miesiąc jest złą jednostką. */
  function weeksApplicable(pelneMiesiace) {
    if (pelneMiesiace === '' || pelneMiesiace === null || pelneMiesiace === undefined) return false;
    var m = Number(pelneMiesiace);
    return Number.isFinite(m) && m >= 0 && m < MIES_PROG_TYGODNI;
  }

  /* Ukończone tygodnie → ukończone miesiące. PRZYBLIŻENIE (miesiąc = 30,4375 dnia):
     „tydzień → miesiąc" nie jest funkcją, bo ten sam 8. tydzień życia daje 1 albo
     2 pełne miesiące zależnie od długości miesięcy, przez które dziecko przeszło.
     Używane WYŁĄCZNIE przy ręcznym wpisie tygodni; z datą urodzenia oba wyniki
     liczy kalendarz i nic nie jest przybliżane.
     Tabela: 0–4 tyg. → 0 mies., 5–8 → 1, 9–13 → 2. */
  function monthsFromWeeks(tygodnie) {
    if (tygodnie === '' || tygodnie === null || tygodnie === undefined) return null;
    var t = Number(tygodnie);
    if (!Number.isFinite(t) || t < 0) return null;
    return Math.floor((Math.floor(t) * 7) / DNI_W_MIESIACU);
  }

  /* Doby życia → miesiące UŁAMKOWE w skali tablic WHO (miesiąc = 30,4375 dnia).
     To jest ta sama skala, w której indeksowane są LMS_INFANT_*: wiersz `m` odpowiada
     dobie m × 30,4375. Dlatego dzielimy przez długość miesiąca, a nie liczymy miesięcy
     kalendarzowych — inaczej interpolacja trafiałaby obok własnej siatki. */
  function exactMonthsFromDays(dni) {
    if (dni === '' || dni === null || dni === undefined) return null;
    var d = Number(dni);
    if (!Number.isFinite(d) || d < 0) return null;
    return d / DNI_W_MIESIACU;
  }

  /* Zwraca {status, weeks}: 'empty', 'format', 'range' albo 'ok'. */
  function parseWeeksInput(surowe) {
    var tekst = String(surowe == null ? '' : surowe).trim().replace(',', '.');
    if (tekst === '') return { status: 'empty', weeks: null };
    if (!/^\d{1,3}$/.test(tekst)) return { status: 'format', weeks: null };
    var t = parseInt(tekst, 10);
    if (!Number.isFinite(t) || t < 0 || t > TYGODNI_MAX) return { status: 'range', weeks: null };
    return { status: 'ok', weeks: t };
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

  /* Wiersz tygodni: pokazujemy go tylko w oknie < 3 mies., żeby nie zaśmiecać
     formularza starszym dzieciom. Bez daty urodzenia punktem odniesienia jest to,
     co lekarz wpisał w latach i miesiącach. */
  function pokazWierszTygodni(widoczny) {
    var wiersz = pole(ID.weeksRow);
    if (wiersz) wiersz.hidden = !widoczny;
  }

  function zablokujTygodnie(zablokowac) {
    var el = pole(ID.weeks);
    if (!el) return;
    try {
      el.readOnly = !!zablokowac;
    } catch (e) {
      zgloc('weeks-readOnly', e);
    }
    if (el.classList) el.classList.toggle(KLASA_AUTO, !!zablokowac);
  }

  function liczbaZPola(id) {
    var el = pole(id);
    if (!el) return null;
    var tekst = String(el.value == null ? '' : el.value).trim();
    if (tekst === '') return null;
    var n = parseInt(tekst, 10);
    return Number.isFinite(n) ? n : null;
  }

  /* Ile pełnych miesięcy ma dziecko wg pól wieku (bez daty urodzenia). */
  function miesiaceZPolWieku() {
    var lata = liczbaZPola(ID.years);
    if (lata === null || lata !== 0) return lata === null ? null : lata * 12;
    var mies = liczbaZPola(ID.months);
    return mies === null ? 0 : mies;
  }

  /* Stan wiersza tygodni, gdy daty urodzenia NIE MA. Tygodnie są wtedy wpisywane
     ręcznie i to one wyliczają miesiące — pola lat i miesięcy stają się pochodne. */
  function odswiezTygodnieRecznie() {
    var pow = pole(ID.weeks);
    var notka = pole(ID.weeksNote);
    var blad = pole(ID.weeksError);
    if (!pow) return null;

    zablokujTygodnie(false);
    var wynik = parseWeeksInput(pow.value);

    if (wynik.status !== 'ok') {
      pokaz(notka, '');
      pokaz(blad, wynik.status === 'empty' ? '' : (KOMUNIKAT_TYGODNI[wynik.status] || KOMUNIKAT_TYGODNI.format));
      var mies = miesiaceZPolWieku();
      pokazWierszTygodni(wynik.status !== 'empty' || weeksApplicable(mies));
      zablokujWiek(false);
      return wynik;
    }

    var pochodneMiesiace = monthsFromWeeks(wynik.weeks);
    ustawZPowiadomieniem(pole(ID.years), 0);
    ustawZPowiadomieniem(pole(ID.months), pochodneMiesiace);
    zablokujWiek(true);
    pokazWierszTygodni(true);
    pokaz(blad, '');
    pokaz(notka, opisTygodni(wynik.weeks) + ' życia — wiek w miesiącach wyliczono z tygodni ('
      + pochodneMiesiace + ' mies., przybliżenie). Dokładniej: wpisz datę urodzenia.');
    return wynik;
  }

  /* --------------------------------------------------------- odtworzony zapis */

  /* Wybór z okna „Co chcesz zrobić?", który aplikacja trzyma w sesji karty. Tylko go czytamy. */
  var KLUCZ_WYBORU = 'vildaLoadChoiceV1';

  function trybOdtworzenia() {
    try {
      var s = w.sessionStorage;
      return !!(s && typeof s.getItem === 'function' && s.getItem(KLUCZ_WYBORU) === 'restore');
    } catch (e) {
      zgloc('tryb-odtworzenia', e);
      return false;
    }
  }

  function rekordWczytany() {
    try {
      var r = w.lastLoadedData;
      return r && typeof r === 'object' ? r : null;
    } catch (e) {
      zgloc('rekord-wczytany', e);
      return null;
    }
  }

  function calkowitaNieujemna(v) {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
    var n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  /* Doba pomiaru zapisanego rekordu: {doba (lokalna północ), zMiary} albo null. Najpierw
     `user.measuredAtISO` — data pomiaru, bez godziny (pisze ją Karta Pacjenta, a od P-ODTWORZ-WIEK
     także ponowny zapis odtworzonej wizyty) — potem `timestampISO`, chwila zapisu z formularza
     głównego. Datę bez godziny czytamy wprost z zapisu: new Date('2026-06-17') to północ UTC
     i w strefach ujemnych cofnęłaby się o dobę (DOB-AGE-1). */
  function zrodloDobyPomiaru(rekord) {
    var uzytkownik = rekord && rekord.user && typeof rekord.user === 'object' ? rekord.user : null;
    var kandydaci = [uzytkownik ? uzytkownik.measuredAtISO : null, rekord ? rekord.timestampISO : null];
    for (var i = 0; i < kandydaci.length; i++) {
      var tekst = typeof kandydaci[i] === 'string' ? kandydaci[i].trim() : '';
      if (!tekst) continue;
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tekst);
      var data = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(tekst);
      if (isNaN(data.getTime())) continue;
      if (m && (data.getFullYear() !== +m[1] || data.getMonth() !== +m[2] - 1 || data.getDate() !== +m[3])) continue;
      return { doba: dzisLokalnie(data), zMiary: i === 0 };
    }
    return null;
  }

  function dobaPomiaru(rekord) {
    var zrodlo = zrodloDobyPomiaru(rekord);
    return zrodlo ? zrodlo.doba : null;
  }

  function liczbaZZapisu(v) {
    var tekst = String(v == null ? '' : v).trim().replace(',', '.');
    if (tekst === '') return null;
    var n = Number(tekst);
    return Number.isFinite(n) ? n : null;
  }

  /* Czy formularz nadal pokazuje POMIAR rekordu — masa i wzrost jak w zapisie. Gdy lekarz wpisze
     nowe wartości, to nowy pomiar i wiek liczy się na dziś, jak przed P-ODTWORZ-WIEK. Strona bez
     tych pól nie ma czego porównać. */
  function pomiarNiezmieniony(rekord) {
    var uzytkownik = rekord && rekord.user && typeof rekord.user === 'object' ? rekord.user : null;
    if (!uzytkownik) return false;
    return ['weight', 'height'].every(function (klucz) {
      var el = pole(klucz);
      if (!el) return true;
      var wPolu = liczbaZZapisu(el.value);
      var wRekordzie = liczbaZZapisu(uzytkownik[klucz]);
      if (wPolu === null || wRekordzie === null) return wPolu === wRekordzie;
      return Math.abs(wPolu - wRekordzie) < 1e-6;
    });
  }

  /* Wiek POMIARU zapisanego rekordu — ta sama reguła, co Karta Pacjenta (Rata B, P3): zapisany
     wiek rekordu, a gdy go nie ma, wiek z daty urodzenia na dobę pomiaru. Nigdy dzisiejszy.
     `exact` (dni i tygodnie z kalendarza) tylko wtedy, gdy doba pomiaru daje DOKŁADNIE zapisany
     wiek i zapisane tygodnie. Rekord zapisany ponownie starym kodem ma nową datę zapisu przy
     starym wieku — wtedy doby pomiaru nie znamy i nie zgadujemy jej. `iso` to data urodzenia
     z formularza. */
  function wiekPomiaru(rekord, iso, teraz) {
    var uzytkownik = rekord && rekord.user && typeof rekord.user === 'object' ? rekord.user : null;
    if (!uzytkownik) return null;

    var lata = calkowitaNieujemna(uzytkownik.age);
    var miesiace = calkowitaNieujemna(uzytkownik.ageMonths);
    var zrodlo = zrodloDobyPomiaru(rekord);
    var doba = zrodlo ? zrodlo.doba : null;
    var zDoby = iso && doba ? ageFromDobISO(iso, doba) : null;
    var zapisaneTygodnie = parseWeeksInput(uzytkownik.ageWeeks == null ? '' : uzytkownik.ageWeeks);
    var tygodnieRekordu = zapisaneTygodnie.status === 'ok' ? zapisaneTygodnie.weeks : null;

    /* Data urodzenia, której rekord NIE zna (dopisana w formularzu po zapisie wizyty bez daty):
       zapisany wiek wpisano wtedy ręcznie, nie z tej daty, więc o wieku pomiaru mówi ta data na
       dobę pomiaru — ale tylko na dobę PEWNĄ (zapisana data pomiaru albo wizyta z dziś; wtedy to
       zwykły wiek na dziś, jak przed zapisem). Przy niepewnej dobie zostaje zapisany wiek. */
    var dataRekordu = typeof uzytkownik.dobISO === 'string' ? uzytkownik.dobISO.trim() : '';
    var pewnaDoba = !!(zrodlo && (zrodlo.zMiary || doba.getTime() === dzisLokalnie(teraz || null).getTime()));
    var obcaData = !!(zDoby && iso !== dataRekordu && (pewnaDoba || lata === null));
    var razem = null;
    if (obcaData) razem = zDoby.totalMonths;
    else if (lata !== null) razem = lata * 12 + (miesiace !== null ? miesiace : 0);
    else if (zDoby) razem = zDoby.totalMonths;
    if (razem === null) return null;

    /* Zapisane tygodnie sprawdzają dobę tylko wtedy, gdy wzięła się z `timestampISO` (mogła
       przesunąć się przy ponownym zapisie starym kodem). Doba z `measuredAtISO` jest pewna,
       a tygodnie bywają nieaktualne: „+ Nowy pomiar" w Karcie klonuje je z poprzedniej wizyty.
       Data urodzenia spoza rekordu na pewną dobę też ma pierwszeństwo przed tygodniami
       wpisanymi wcześniej ręcznie. Powyżej okna tygodni tygodnie nic nie znaczą. */
    var wTygodniach = weeksApplicable(razem);
    var dokladny = null;
    if (zDoby && zDoby.totalMonths === razem) {
      var zgodne = obcaData || (zrodlo && zrodlo.zMiary) || !wTygodniach
        || tygodnieRekordu === null || tygodnieRekordu === zDoby.weeks;
      if (zgodne) dokladny = zDoby;
    }

    return {
      years: Math.floor(razem / 12),
      ageMonths: razem % 12,
      totalMonths: razem,
      weeks: wTygodniach ? (dokladny ? dokladny.weeks : tygodnieRekordu) : null,
      measuredOn: doba,
      exact: dokladny ? { days: dokladny.days, weeks: dokladny.weeks } : null
    };
  }

  /* Wiek pomiaru, gdy formularz pokazuje odtworzony zapis; inaczej null i działa wiek na dziś. */
  function pomiarOdtworzony(iso) {
    if (!trybOdtworzenia()) return null;
    var rekord = rekordWczytany();
    if (!pomiarNiezmieniony(rekord)) return null;
    return wiekPomiaru(rekord, iso);
  }

  function wartoscPola(id) {
    var el = pole(id);
    return el ? el.value : '';
  }

  /* Data pomiaru do zapisu (`user.measuredAtISO`) albo null — TYLKO gdy jest pewna:
     • odtworzona, niezmieniona wizyta: data pomiaru z rekordu, a gdy jej nie ma, dzień zapisu
       (`timestampISO`), jeśli data urodzenia go potwierdza (doba daje dokładnie zapisany wiek).
       Kolektor zawsze daje świeży `timestampISO`, więc bez tego doba pomiaru przesuwałaby się na
       dzień ponownego zapisu (przegląd P-ODTWORZ-WIEK, odtworzone na stronie). Niepotwierdzonego
       dnia nie zamieniamy w „pewną" datę;
     • dzisiejsza wizyta z wiekiem liczonym z daty urodzenia: dziś (wiek i dzień są wtedy zgodne
       z konstrukcji). Wiek wpisany ręcznie daty nie dostaje — mógł opisywać inny dzień. */
  function readMeasuredAtISO(teraz) {
    var dzis = dzisLokalnie(teraz || null);
    var rekord = trybOdtworzenia() ? rekordWczytany() : null;
    if (rekord && pomiarNiezmieniony(rekord)) {
      var zrodlo = zrodloDobyPomiaru(rekord);
      if (!zrodlo || zrodlo.doba.getTime() > dzis.getTime()) return null;
      var dobaISO = doISO(zrodlo.doba.getFullYear(), zrodlo.doba.getMonth() + 1, zrodlo.doba.getDate());
      if (zrodlo.zMiary) return dobaISO;
      var dataRekordu = parseDobInput(rekord.user && rekord.user.dobISO, teraz || null);
      var dataUr = readISO() || (dataRekordu.status === 'ok' ? dataRekordu.iso : null);
      var pomiar = dataUr ? wiekPomiaru(rekord, dataUr, teraz) : null;
      return pomiar && pomiar.exact ? dobaISO : null;
    }
    var iso = readISO();
    if (!iso || !ageFromDobISO(iso, dzis)) return null;
    if (liczbaZZapisu(wartoscPola('weight')) === null && liczbaZZapisu(wartoscPola('height')) === null) return null;
    return doISO(dzis.getFullYear(), dzis.getMonth() + 1, dzis.getDate());
  }


  function opisDaty(data) {
    return dwuCyfry(data.getDate()) + '-' + dwuCyfry(data.getMonth() + 1) + '-' + data.getFullYear();
  }

  /* Notka przy zapisanym pomiarze. Pomiar z DZISIEJSZEJ doby (lekarz właśnie zapisał wizytę)
     dostaje zwykłą notkę — to nadal dzisiejsza wizyta. Datę pomiaru podajemy tylko wtedy, gdy
     jest pewna, czyli zgadza się z zapisanym wiekiem. */
  function opisOdtworzenia(pomiar, dzis, zKartoteki, teraz) {
    var doba = pomiar.exact ? pomiar.measuredOn : null;
    var dzisiejszy = !!(doba && dzis && doba.getTime() === dzisLokalnie(teraz || null).getTime());
    if (dzisiejszy && dzis.totalMonths === pomiar.totalMonths) {
      return zKartoteki
        ? zdanie('Z kartoteki. Wiek na dzień dzisiejszej wizyty: ' + opisWieku(pomiar)) + ' Zmiana daty w Karcie Pacjenta.'
        : zdanie('Wiek liczony z daty urodzenia na dzień wizyty: ' + opisWieku(pomiar));
    }

    var tekst = (zKartoteki ? 'Z kartoteki. ' : '')
      + (doba ? 'Pomiar z ' + opisDaty(doba) : 'Zapisany pomiar')
      + ' — wiek w dniu pomiaru: ' + opisWieku(pomiar);
    if (dzis && dzis.totalMonths !== pomiar.totalMonths) {
      var plec = '';
      var rekord = rekordWczytany();
      if (rekord && rekord.user && rekord.user.sex) plec = String(rekord.user.sex);
      var kto = /^[KF]/i.test(plec.trim()) ? 'pacjentka ma ' : 'pacjent ma ';
      tekst = zdanie(tekst + ' (aktualnie ' + kto + opisWieku(dzis) + ')') + ' Wiek na dziś liczy „Nowy pomiar”.';
    } else {
      tekst = zdanie(tekst);
    }
    return zKartoteki ? tekst + ' Zmiana daty w Karcie Pacjenta.' : tekst;
  }

  /* Jedyne miejsce, które decyduje o stanie pól. Wywoływane po wpisaniu daty
     lub tygodni, po wczytaniu pacjenta i przy starcie strony. Pisanie do pól
     wysyła zdarzenia `input`, na które sami nasłuchujemy — stąd zapora. */
  var wTrakcie = false;

  function odswiez(opcje) {
    if (wTrakcie) return null;
    wTrakcie = true;
    try {
      return odswiezWewnetrznie(opcje);
    } finally {
      wTrakcie = false;
    }
  }

  function odswiezWewnetrznie(opcje) {
    var d = dok();
    if (!d) return null;

    var wejscie = pole(ID.dob);
    if (!wejscie) return null;

    var ustawienia = opcje && typeof opcje === 'object' ? opcje : {};
    var notka = pole(ID.note);
    var blad = pole(ID.error);
    var czysc = pole(ID.clear);
    var wynik = parseDobInput(wejscie.value, ustawienia.now || null);

    if (wynik.status !== 'ok') {
      /* Zły zapis nie może zablokować pól wieku — lekarz musi mieć czym pracować. */
      pokaz(notka, '');
      pokaz(blad, wynik.status === 'empty' ? '' : (KOMUNIKAT[wynik.status] || KOMUNIKAT.format));
      if (czysc) czysc.hidden = true;
      zablokujWiek(false);
      odswiezTygodnieRecznie();
      return wynik;
    }

    var wiek = ageFromDobISO(wynik.iso, ustawienia.now || null);
    if (!wiek) {
      pokaz(notka, '');
      pokaz(blad, KOMUNIKAT.future);
      if (czysc) czysc.hidden = true;
      zablokujWiek(false);
      odswiezTygodnieRecznie();
      return { status: 'future', iso: null };
    }

    /* P-ODTWORZ-WIEK: odtworzony zapis zostaje w wieku z dnia pomiaru (patrz nagłówek). */
    var pomiar = pomiarOdtworzony(wynik.iso);
    if (pomiar) return pokazOdtworzony(wynik.iso, pomiar, wiek, wejscie, notka, blad, czysc, ustawienia.now || null);

    ustawZPowiadomieniem(pole(ID.years), wiek.years);
    ustawZPowiadomieniem(pole(ID.months), wiek.ageMonths);
    zablokujWiek(true);
    pokaz(blad, '');
    pokaz(
      notka,
      zRekordu(wejscie)
        ? zdanie('Z kartoteki. Wiek na dzień dzisiejszej wizyty: ' + opisWieku(wiek)) + ' Zmiana daty w Karcie Pacjenta.'
        : zdanie('Wiek liczony z daty urodzenia na dzień wizyty: ' + opisWieku(wiek))
    );
    if (czysc) czysc.hidden = zRekordu(wejscie);

    /* Z datą urodzenia tygodnie liczy kalendarz — pole jest tylko do odczytu
       i nic nie jest przybliżane. */
    var wTygodniach = weeksApplicable(wiek.totalMonths);
    pokazWierszTygodni(wTygodniach);
    if (wTygodniach) {
      var powt = pole(ID.weeks);
      if (powt) powt.value = String(wiek.weeks);
      zablokujTygodnie(true);
      pokaz(pole(ID.weeksError), '');
      pokaz(pole(ID.weeksNote), opisTygodni(wiek.weeks) + ' życia — liczone z daty urodzenia.');
    } else {
      var powc = pole(ID.weeks);
      if (powc) powc.value = '';
      pokaz(pole(ID.weeksNote), '');
      pokaz(pole(ID.weeksError), '');
    }

    return { status: 'ok', iso: wynik.iso, age: wiek };
  }

  /* Stan pól przy odtworzonym zapisie: wiek i tygodnie z dnia pomiaru, nadal tylko do odczytu
     (o wieku przesądza rekord), a notka mówi wprost, z jakiej chwili są dane. */
  function pokazOdtworzony(iso, pomiar, dzis, wejscie, notka, blad, czysc, teraz) {
    ustawZPowiadomieniem(pole(ID.years), pomiar.years);
    ustawZPowiadomieniem(pole(ID.months), pomiar.ageMonths);
    zablokujWiek(true);
    pokaz(blad, '');
    pokaz(notka, opisOdtworzenia(pomiar, dzis, zRekordu(wejscie), teraz));
    if (czysc) czysc.hidden = zRekordu(wejscie);

    var wTygodniach = weeksApplicable(pomiar.totalMonths);
    pokazWierszTygodni(wTygodniach);
    var pow = pole(ID.weeks);
    if (wTygodniach) {
      if (pow) pow.value = pomiar.weeks === null ? '' : String(pomiar.weeks);
      zablokujTygodnie(true);
      pokaz(pole(ID.weeksError), '');
      pokaz(pole(ID.weeksNote), pomiar.weeks === null ? '' : opisTygodni(pomiar.weeks) + ' życia w dniu pomiaru.');
    } else {
      if (pow) pow.value = '';
      pokaz(pole(ID.weeksNote), '');
      pokaz(pole(ID.weeksError), '');
    }

    return { status: 'ok', iso: iso, age: pomiar, restored: true };
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

  /* P-ODSWIEZENIE (zgłoszenie właściciela 2026-09-15): data z bloba sesji po odświeżeniu strony
     albo po przejściu na inną stronę. Odtworzenie sesji NIE jest wczytaniem rekordu ani nową
     wizytą — pole ma wrócić dokładnie w stanie sprzed odświeżenia: z kartoteki (tylko do
     odczytu, poprawka przez „Edytuj") albo wpisane ręcznie (edytowalne). Sam blob tego nie
     rozróżnia, więc decyduje wołający (`opcje.zRekordu` — porównanie z wczytanym rekordem).
     Programowy wpis nie może uchodzić za edycję lekarza, stąd `bezZnaczaniaEdycji`. */
  function setFromSession(iso, opcje) {
    var wejscie = pole(ID.dob);
    if (!wejscie) return false;
    var czysta = parseDobInput(iso, null);
    if (czysta.status !== 'ok') return false;
    var zRek = !!(opcje && opcje.zRekordu);
    bezZnaczaniaEdycji(function () {
      wejscie.value = formatDobDisplay(czysta.iso);
      try {
        wejscie.readOnly = zRek;
        if (zRek) wejscie.dataset.dobSource = 'record';
        else delete wejscie.dataset.dobSource;
      } catch (e) {
        zgloc('setFromSession', e);
      }
      odswiez();
    });
    return true;
  }

  /* Tygodnie z rekordu — używane tylko wtedy, gdy rekord nie ma daty urodzenia.
     Z datą liczy je kalendarz i zapisana liczba nie ma nic do powiedzenia. */
  function setWeeksFromRecord(tygodnie) {
    var pow = pole(ID.weeks);
    if (!pow) return false;
    var wynik = parseWeeksInput(tygodnie);
    if (wynik.status !== 'ok') return false;
    pow.value = String(wynik.weeks);
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

  /* Dokładny wiek z daty urodzenia — dla siatek centylowych (DOB-AGE-4).
     Zwraca null, gdy daty nie ma albo jest niepoprawna; wtedy odbiorca ma działać jak
     dotąd. `totalMonths` jest po to, żeby odbiorca mógł sprawdzić, że patrzy na ten sam
     wiek, który sam trzyma — patrz nagłówek modułu. */
  function readExactAge() {
    var iso = readISO();
    if (!iso) return null;
    /* P-ODTWORZ-WIEK: przy odtworzonym zapisie dokładny wiek z doby POMIARU. Bez niej null —
       siatki biorą wtedy wiersz ukończonego miesiąca z pól wieku. Dzisiejszy wiek trafiałby do
       odbiorców bez strażnika `totalMonths` (karta zespołu Downa) wprost. */
    var pomiar = pomiarOdtworzony(iso);
    if (pomiar) {
      if (!pomiar.exact) return null;
      var ulamkowePomiaru = exactMonthsFromDays(pomiar.exact.days);
      if (ulamkowePomiaru === null) return null;
      return { totalMonths: pomiar.totalMonths, days: pomiar.exact.days, exactMonths: ulamkowePomiaru };
    }
    var wiek = ageFromDobISO(iso, null);
    if (!wiek) return null;
    var ulamkowe = exactMonthsFromDays(wiek.days);
    if (ulamkowe === null) return null;
    return { totalMonths: wiek.totalMonths, days: wiek.days, exactMonths: ulamkowe };
  }

  /* Ukończone tygodnie do zapisu w rekordzie: z daty urodzenia, gdy jest,
     inaczej z ręcznego wpisu. Poza oknem < 3 mies. — null, bo tygodnie
     przestają nieść informację, której nie ma już w miesiącach. */
  function readWeeks() {
    var iso = readISO();
    if (iso) {
      /* Odtworzony zapis zapisany ponownie niesie tygodnie z dnia pomiaru, nie dzisiejsze. */
      var pomiar = pomiarOdtworzony(iso);
      if (pomiar) return weeksApplicable(pomiar.totalMonths) ? pomiar.weeks : null;
      var wiek = ageFromDobISO(iso, null);
      if (!wiek) return null;
      return weeksApplicable(wiek.totalMonths) ? wiek.weeks : null;
    }
    var pow = pole(ID.weeks);
    if (!pow) return null;
    var wynik = parseWeeksInput(pow.value);
    return wynik.status === 'ok' ? wynik.weeks : null;
  }

  /* Pełne czyszczenie pola: zdejmuje blokadę, kasuje datę i tygodnie. Używane przez
     „Wyczyść wszystkie pola" w formularzu głównym oraz przez zdarzenie
     `vilda:user-state-cleared`. Różni się od `clear()` (przycisk „×" przy polu), który
     celowo NIE rusza daty pochodzącej z rekordu i oddaje fokus do pola. */
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
    var pow = pole(ID.weeks);
    if (pow) pow.value = '';
    odswiez();
  }

  /* Dane z rekordu, który aplikacja właśnie wczytała. Gdy ich nie ma, zostaje to,
     co lekarz wpisał ręcznie — wczytanie pacjenta bez daty niczego nie kasuje. */
  /* P-DOB-LOAD (zgłoszenie właściciela 2026-09-14): wypełnianie wieku po wczytaniu pacjenta
     nie może uchodzić za edycję lekarza.

     ZNALEZISKO. Po wczytaniu rekordu aplikacja pokazuje „Odtwórz zapisany stan" i zakłada
     JEDNORAZOWY nasłuch `input`/`change` w fazie przechwytywania. Pierwsze takie zdarzenie
     chowa przycisk, ustawia `hasUserModifiedAfterLoad` i WYREJESTROWUJE nasłuch — bo z punktu
     widzenia aplikacji lekarz właśnie zaczął zmieniać formularz. Ten moduł zaraz po wczytaniu
     wpisuje wiek wyliczony z daty urodzenia i wysyła `input`, więc u pacjenta z datą urodzenia
     przycisk znikał, zanim lekarz zdążył go zobaczyć: wybór „Nowy pomiar / Odtwórz zapisany
     stan" nie pojawiał się wcale, a wizyta zaczynała się tak, jakby wybrano „Nowy pomiar".

     POPRAWKA. Wokół WŁASNEGO, programowego wpisu zachowujemy stan sprzed niego: flagę edycji
     i widoczność przycisku. Samo przywrócenie widoczności nie wystarcza — nasłuch już się
     wyrejestrował, więc pierwsza PRAWDZIWA edycja lekarza nie schowałaby przycisku. Dlatego
     uzbrajamy go ponownie przez `showRestoreButton()`, czyli funkcję samej aplikacji: ona
     pokazuje przycisk i zakłada świeży nasłuch. Ten sam wzorzec (zapamiętaj flagę i stan
     przycisku, przywróć po swojej robocie) stosuje już `ghReimport` w kolektorze.

     Wpisu ręcznego to nie dotyczy: tam lekarz naprawdę edytuje formularz i flaga ma się
     ustawić. Obejmujemy wyłącznie ścieżkę po zdarzeniu wczytania rekordu. */
  function bezZnaczaniaEdycji(robota) {
    var flagaPrzed;
    var mialFlage = false;
    try {
      flagaPrzed = w.hasUserModifiedAfterLoad;
      mialFlage = true;
    } catch (e) {
      zgloc('flaga-odczyt', e);
    }

    var przycisk = null;
    var widocznoscPrzed = null;
    try {
      var d = dok();
      przycisk = d ? d.getElementById('restoreStateBtn') : null;
      if (przycisk && przycisk.style) widocznoscPrzed = przycisk.style.display;
    } catch (e) {
      zgloc('przycisk-odczyt', e);
    }

    try {
      robota();
    } finally {
      if (mialFlage) {
        try {
          w.hasUserModifiedAfterLoad = flagaPrzed;
        } catch (e) {
          zgloc('flaga-edycji', e);
        }
      }
      /* Przycisk był widoczny, a nasz wpis go schował — przywracamy razem z nasłuchem. */
      if (przycisk && przycisk.style && widocznoscPrzed !== null
        && widocznoscPrzed !== 'none' && przycisk.style.display === 'none') {
        try {
          if (typeof w.showRestoreButton === 'function') w.showRestoreButton();
          else przycisk.style.display = widocznoscPrzed;
        } catch (e) {
          zgloc('przycisk-odtworz', e);
        }
      }
    }
  }

  function przyjmijZWczytanego() {
    bezZnaczaniaEdycji(function () {
      var iso = null;
      var tygodnie = null;
      try {
        var wczytane = w.lastLoadedData;
        var uzytkownik = wczytane && wczytane.user ? wczytane.user : null;
        if (uzytkownik && typeof uzytkownik.dobISO === 'string') iso = uzytkownik.dobISO;
        if (uzytkownik && uzytkownik.ageWeeks != null) tygodnie = uzytkownik.ageWeeks;
      } catch (e) {
        zgloc('lastLoadedData', e);
      }
      if (iso && setFromRecord(iso)) return;
      if (tygodnie != null && setWeeksFromRecord(tygodnie)) return;
      odswiez();
    });
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

    /* DOB-AGE-2: pole tygodni oraz nasłuch na polach wieku. Ten drugi jest potrzebny,
       bo bez daty urodzenia to wpisane lata i miesiące decydują, czy dziecko jest
       w oknie < 3 mies. i czy wiersz tygodni ma się w ogóle pokazać. Zapora `wTrakcie`
       w odswiez() pilnuje, żeby nasze własne zapisy nie zapętliły tego nasłuchu. */
    var tygodnie = d.getElementById(ID.weeks);
    if (tygodnie) {
      ['input', 'change'].forEach(function (nazwa) {
        tygodnie.addEventListener(nazwa, function () {
          odswiez();
        });
      });
    }
    [ID.years, ID.months].forEach(function (id) {
      var el = d.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        odswiez();
      });
    });

    /* P-ODTWORZ-WIEK: nowa masa albo wzrost w odtworzonej wizycie to nowy pomiar — wiek wraca
       na dziś. Nasłuch działa tylko przy wyborze „Odtwórz", żeby zwykłe wpisywanie pomiarów
       niczego tu nie uruchamiało. */
    ['weight', 'height'].forEach(function (id) {
      var el = d.getElementById(id);
      if (!el) return;
      ['input', 'change'].forEach(function (nazwa) {
        el.addEventListener(nazwa, function () {
          if (trybOdtworzenia()) odswiez();
        });
      });
    });

    /* Rekord wczytuje się trzema drogami („Odtwórz zapis”, „Nowy pomiar”, wejście
       z Karty Pacjenta) i żadna nie wysyła zdarzenia `input`. Zamiast dopisywać się
       do każdej z nich, po zdarzeniu aplikacji czytamy datę wprost z wczytanego
       rekordu — jedno miejsce zamiast trzech.
       P-ODTWORZ-ZYWO (2026-09-16): czwarta droga to odtworzenie „na żywo” w panelu
       powłoki (app.html trzyma DocPro w ramce; po wczytaniu pacjenta na Start dostaje
       vildaPersistRestoreAll bez żadnego z powyższych zdarzeń). Data nie wędruje przez
       sharedUserData (patrz nagłówek), więc bez sygnału pole zostawało puste —
       vilda_persist_runtime.js wysyła teraz `vilda:persist-restored`. */
    ['vilda:patient-loaded', 'vilda:state-restored', 'vilda:persist-restored'].forEach(function (nazwa) {
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
    WEEKS_MAX: TYGODNI_MAX,
    WEEKS_MONTH_LIMIT: MIES_PROG_TYGODNI,
    parseDobInput: parseDobInput,
    formatDobDisplay: formatDobDisplay,
    ageFromDobISO: ageFromDobISO,
    describeAge: opisWieku,
    describeWeeks: opisTygodni,
    localToday: dzisLokalnie,
    messages: KOMUNIKAT,
    weekMessages: KOMUNIKAT_TYGODNI,
    parseWeeksInput: parseWeeksInput,
    monthsFromWeeks: monthsFromWeeks,
    exactMonthsFromDays: exactMonthsFromDays,
    weeksApplicable: weeksApplicable,
    measurementDay: dobaPomiaru,
    ageAtMeasurement: wiekPomiaru,
    refresh: odswiez,
    setFromRecord: setFromRecord,
    setFromSession: setFromSession,
    setWeeksFromRecord: setWeeksFromRecord,
    clear: clear,
    clearAll: odblokujPoWyczyszczeniuPacjenta,
    readISO: readISO,
    readWeeks: readWeeks,
    readExactAge: readExactAge,
    readMeasuredAtISO: readMeasuredAtISO,
    mount: mount
  };

  autoMount();
})(typeof window !== 'undefined' ? window : globalThis);
