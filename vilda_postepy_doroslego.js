/* vilda_postepy_doroslego.js — JEDYNE miejsce, w którym aplikacja liczy POSTĘPY REDUKCJI
 * MASY CIAŁA U DOROSŁEGO. Wszyscy inni tylko wołają i rysują.
 *
 * P-POSTEPY rata 1 (decyzja właściciela 2026-09-19: „1. każdemu dorosłemu z dwoma pomiarami,
 * 2. poproszę dwa warianty do wyboru, 3. zostaw poza zestawem”).
 *
 * PO CO TO POWSTAŁO. Dziecko ma w Karcie Pacjenta siatki centylowe; dorosły ma tę zakładkę
 * pustą i komunikat, że siatki są tylko dla pacjentów poniżej 18 lat. Pacjent leczony z powodu
 * otyłości nie ma więc czym zobaczyć własnego postępu — a to jest dokładnie ten obraz, który
 * najbardziej działa w gabinecie. Ten moduł liczy dane pod taki wykres.
 *
 * CZYSTY SILNIK. Zero DOM, zero zapisu, zero synchronizacji (AGENTS.md §2 i §5). Widok
 * powstaje osobno (`vilda_postepy_doroslego_ui.js`, rata 2), montaż w Karcie Pacjenta osobno.
 *
 * TRZY RZECZY, KTÓRYCH TEN MODUŁ NIE ROBI — i to jest jego architektura, nie niedoróbka:
 *   1. Nie zna progów klas BMI. Pyta o nie `VildaBmi.kategoriaDorosly()`; bez silnika BMI
 *      klasy są puste, a reszta wyniku liczy się dalej.
 *   2. Nie zna kryteriów odstawienia leku. Punkt decyzyjny ChPL czyta z
 *      `ObesityResponseCriteria` (P-CHPL, SW 1.1.10) i PRZEPUSZCZA DALEJ bez przeliczania.
 *      Dla semaglutydu i tirzepatydu ChPL nie podaje ani progu, ani terminu — wtedy punktu
 *      nie ma i to jest poprawny wynik, nie brak danych.
 *   3. Nie zna drabinki pasm. Bierze ją z `VildaPostepyDoroslegoDane` jako ARGUMENT i niesie
 *      jej nazwę w wyniku (AGENTS.md §3: normy jako dane, nigdy jako założenie silnika).
 *
 * DEFINICJE, KTÓRE MUSZĄ BYĆ JEDNOZNACZNE (każda widoczna w wyniku):
 *   punkt odniesienia — masa, od której liczymy procenty: masa w punkcie „Włączenie” leczenia,
 *                       a gdy leczenia nie ma — pierwszy pomiar serii. Wynik mówi który
 *                       (`punktOdniesienia.zrodlo`), bo od tego zależy KAŻDY procent na wykresie.
 *   ubytekPct         — DODATNI odsetek ubytku masy wobec punktu odniesienia (0 przy przyroście).
 *   zmianaMasyPct     — ta sama wielkość ze znakiem (ujemna = ubytek), do wykresu.
 *   tydzien           — pełne tygodnie od punktu odniesienia; ujemny dla pomiarów sprzed niego.
 *                       Liczony z dat, a gdy dat brak — z wieku (przybliżenie, oznaczone flagą
 *                       `czasZWieku`, bo miesiąc kalendarzowy nie jest całkowitą liczbą tygodni).
 *   przekroczenie     — PIERWSZY pomiar, w którym ubytek sięgnął pasma. Bez interpolacji między
 *                       pomiarami: data między wizytami byłaby zmyślona.
 *   nadir             — najmniejsza masa od punktu odniesienia wzwyż.
 *   utrzymane         — jaka część ubytku z nadiru jest utrzymana dzisiaj (surowa frakcja);
 *                       w piśmiennictwie ta metryka nazywa się %MWL i liczy się od nadiru.
 *                       Próg „istotnego odzysku” (0,75) jest LINIĄ NA WYKRESIE z pliku danych,
 *                       nie kryterium klinicznym — dla farmakoterapii otyłości nie ma
 *                       uzgodnionego progu %MWL. Surowa frakcja jest w wyniku zawsze.
 *   leczenie          — czy pacjent jest na leku. Ta sama frakcja znaczy co innego na leczeniu
 *                       (spadek poniżej progu to rzadkie zdarzenie i realny sygnał) i po jego
 *                       odstawieniu (przeciętna trajektoria przekracza próg w ciągu kwartału).
 *                       Silnik tego nie interpretuje — oddaje stan, żeby widok mógł.
 */
(function (w) {
  'use strict';

  var WERSJA = '1';

  var MS_TYDZIEN = 7 * 24 * 60 * 60 * 1000;
  var MIES_NA_TYDZ = 30.4375 / 7;   // średni miesiąc gregoriański w tygodniach

  /* Drabinka klas dorosłego — WYŁĄCZNIE do orzekania, czy przejście jest poprawą, czy
     pogorszeniem. Progi liczbowe zostają w `vilda_bmi.js`; tu jest tylko kolejność kluczy. */
  var KOLEJNOSC_KLAS = ['niedowaga', 'prawidlowe', 'nadwaga', 'otylosc-1', 'otylosc-2', 'otylosc-3'];
  var KLASY_OTYLOSCI = { 'otylosc-1': 1, 'otylosc-2': 1, 'otylosc-3': 1 };

  function zaokraglTydzien(t) {
    return typeof t === 'number' && isFinite(t) ? Math.round(t) : null;
  }

  function liczba(x) {
    var v = typeof x === 'number' ? x : parseFloat(x);
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function czasMs(dateISO) {
    var s = String(dateISO == null ? '' : dateISO).trim();
    if (!s) return null;
    var t = Date.parse(s.length === 10 ? s + 'T00:00:00Z' : s);
    return isFinite(t) ? t : null;
  }

  function bmiZ(masa, wzrost) {
    var B = w && w.VildaBmi;
    if (B && typeof B.bmi === 'function') {
      var v = B.bmi({ masaKg: masa, wzrostCm: wzrost });
      return liczba(v);
    }
    return null;
  }

  function klasaZ(bmi) {
    var B = w && w.VildaBmi;
    if (bmi == null || !(B && typeof B.kategoriaDorosly === 'function')) return null;
    var k = B.kategoriaDorosly(bmi);
    if (!k || !k.klucz || k.klucz === 'brak') return null;
    return { klucz: k.klucz, etykieta: k.etykieta, kolor: k.kolor };
  }

  /* Dorosłość pyta silnik BMI (jeden próg w aplikacji: 216 mies.). Bez silnika — 18 lat. */
  function doroslyWiek(wiekMies) {
    var m = liczba(wiekMies);
    if (m == null) return false;
    var B = w && w.VildaBmi;
    if (B && typeof B.dorosly === 'function') return !!B.dorosly(m, 'OGOLNA');
    return m >= 216;
  }

  function daneModul() {
    return (w && w.VildaPostepyDoroslegoDane) || null;
  }

  /* ---------- normalizacja wejścia ---------- */

  /* Pomiar → { masa, wzrost, dateISO, wiekMies, ms, klucz } albo null. Masa jest wymagana:
     bez niej punkt nie mówi nic o postępie i tylko udawałby daną. */
  function normPomiar(p) {
    if (!p || typeof p !== 'object') return null;
    var masa = liczba(p.weight != null ? p.weight : p.masa);
    if (masa == null || !(masa > 0)) return null;
    var wzrost = liczba(p.height != null ? p.height : p.wzrost);
    if (wzrost != null && !(wzrost > 0)) wzrost = null;
    var wiekMies = liczba(p.ageMonthsTotal);
    if (wiekMies == null) {
      var lata = liczba(p.ageYears);
      var mies = liczba(p.ageMonths);
      if (lata != null || mies != null) wiekMies = (lata || 0) * 12 + (mies || 0);
    }
    var dateISO = String(p.dateISO != null ? p.dateISO : (p.date != null ? p.date : '')).trim();
    return {
      masa: masa,
      wzrost: wzrost,
      dateISO: dateISO || null,
      wiekMies: wiekMies,
      ms: czasMs(dateISO),
      typ: String(p.type == null ? '' : p.type) || null,
      lek: p.drug != null ? String(p.drug) : null,
      substancja: p.substance != null ? String(p.substance) : null,
    };
  }

  function normSeria(lista) {
    var out = [];
    var arr = Array.isArray(lista) ? lista : [];
    for (var i = 0; i < arr.length; i++) {
      var n = normPomiar(arr[i]);
      if (n) out.push(n);
    }
    return out;
  }

  /* Oś czasu: daty, gdy KAŻDY punkt ma datę; inaczej wiek. Mieszanka spada na wiek, bo
     sortowanie po dwóch różnych skalach przestawia kolejność wizyt bez ostrzeżenia. */
  function osCzasu(punkty) {
    var wszystkieDaty = punkty.length > 0;
    var wszystkieWieki = punkty.length > 0;
    for (var i = 0; i < punkty.length; i++) {
      if (punkty[i].ms == null) wszystkieDaty = false;
      if (punkty[i].wiekMies == null) wszystkieWieki = false;
    }
    if (wszystkieDaty) return 'daty';
    if (wszystkieWieki) return 'wiek';
    return null;
  }

  function klucz(p, os) {
    return os === 'daty' ? p.ms : p.wiekMies;
  }

  function tygodnieMiedzy(a, b, os) {
    var ka = klucz(a, os);
    var kb = klucz(b, os);
    if (ka == null || kb == null) return null;
    if (os === 'daty') return (kb - ka) / MS_TYDZIEN;
    return (kb - ka) * MIES_NA_TYDZ;
  }

  /* ---------- reguła widoczności ---------- */

  /* Decyzja właściciela 2026-09-19: zakładka należy się KAŻDEMU dorosłemu z dwoma pomiarami,
     nie tylko leczonemu farmakologicznie. Reguła mieszka tu, żeby widok jej nie powtarzał. */
  function dostepne(opts) {
    var o = opts || {};
    var seria = normSeria(o.pomiary);
    var wiekMies = liczba(o.wiekMies);
    if (wiekMies == null && liczba(o.wiekLat) != null) wiekMies = liczba(o.wiekLat) * 12;
    if (!doroslyWiek(wiekMies)) {
      return { ok: false, powod: 'nie-dorosly', opis: 'Wizualizacja postępów dotyczy pacjentów dorosłych.' };
    }
    if (seria.length < 2) {
      return { ok: false, powod: 'za-malo-pomiarow', opis: 'Potrzebne są co najmniej dwa pomiary masy ciała.' };
    }
    if (!osCzasu(seria)) {
      return { ok: false, powod: 'brak-osi-czasu', opis: 'Pomiary nie mają wspólnej osi czasu — potrzebne są daty albo wiek przy każdym punkcie.' };
    }
    return { ok: true, powod: null, opis: '' };
  }

  /* ---------- punkt decyzyjny ChPL (przepuszczony, nie przeliczony) ---------- */

  /* Tydzień punktu decyzyjnego na osi liczonej od punktu odniesienia. Dla kotwicy w starcie to
     wprost okno ChPL; dla kotwicy w dawce podtrzymującej — okno powiększone o nominalny czas
     zwiększania dawki (liraglutyd 4 tyg. → 16.; semaglutyd 16 tyg. → 28.). */
  function osadzNaOsi(g) {
    if (!g) return null;
    if (g.windowAnchor === 'start') return liczba(g.windowWeeks);
    if (g.windowAnchor === 'dawka-podtrzymujaca') {
      var okno = liczba(g.windowWeeks);
      var tit = liczba(g.titrationWeeksNominal);
      if (okno != null && tit != null) return okno + tit;
    }
    return null;
  }

  function punktDecyzyjny(lek, substancja, wiekLat) {
    var K = w && w.ObesityResponseCriteria;
    if (!K || typeof K.getCriterion !== 'function') return null;
    var kryt;
    try { kryt = K.getCriterion(lek || '', substancja || '', wiekLat); } catch (e) { kryt = null; }
    if (!kryt || !kryt.group) return null;
    var g = kryt.group;
    if (g.metric === 'clinical' || g.windowWeeks == null || g.thresholdPct == null) {
      /* ChPL nie podaje progu ani terminu — brak punktu jest WYNIKIEM, nie brakiem danych. */
      return { jest: false, lek: kryt.drugKey, metryka: g.metric, zdanie: g.zdanie || '', kotwica: null, tygodnie: null, progPct: null, tydzienOdOdniesienia: null };
    }
    /* Kotwica „dawka-podtrzymująca” nie jest tym samym co start leczenia. Rekord pacjenta nie
       zapisuje jeszcze momentu dojścia do dawki podtrzymującej, ale NOMINALNY czas zwiększania
       dawki jest faktem z ChPL i od P-KOTWICA (2026-09-20) mieszka w danych grupy jako
       `titrationWeeksNominal`. Punkt na osi osadzamy więc z sumy i ZNACZYMY to flagą
       `nominalna` — to założenie, nie odczyt z rekordu, i widok musi je nazwać.
       Bez nominalnego czasu punktu nie stawiamy wcale: zgadywanie dałoby datę z powietrza. */
    return {
      jest: true,
      lek: kryt.drugKey,
      metryka: g.metric,
      zdanie: g.zdanie || '',
      kotwica: g.windowAnchor || null,
      tygodnie: g.windowWeeks,
      progPct: g.thresholdPct,
      tydzienOdOdniesienia: osadzNaOsi(g),
      nominalna: g.windowAnchor === 'dawka-podtrzymujaca' && osadzNaOsi(g) != null,
      titracjaNominalnaTyg: liczba(g.titrationWeeksNominal),
    };
  }

  /* ---------- silnik ---------- */

  function analizuj(opts) {
    var o = opts || {};
    var D = daneModul();
    var brama = dostepne(o);

    var seria = normSeria(o.pomiary);
    var punkty = normSeria(o.punktyLeczenia).filter(function (p) {
      return p.typ === 'start' || p.typ === 'continue' || p.typ === 'end';
    });

    var wiekMies = liczba(o.wiekMies);
    if (wiekMies == null && liczba(o.wiekLat) != null) wiekMies = liczba(o.wiekLat) * 12;
    var wiekLat = wiekMies != null ? wiekMies / 12 : null;

    /* Zestaw pasm: jawny argument wygrywa; inaczej dobór wg leku; inaczej zestaw ogólny. */
    var zestaw = null;
    var nieznanyZestaw = null;
    if (o.zestaw && typeof o.zestaw === 'object' && Array.isArray(o.zestaw.progi)) {
      zestaw = o.zestaw;
    } else if (D) {
      var nazwany = typeof o.zestaw === 'string' && o.zestaw ? D.zestaw(o.zestaw) : null;
      if (typeof o.zestaw === 'string' && o.zestaw && !nazwany) nieznanyZestaw = String(o.zestaw);
      zestaw = nazwany || D.zestawDlaLeku(o.lek, o.substancja);
    }

    var wynik = {
      wersja: WERSJA,
      dostepne: brama,
      zestaw: zestaw ? { id: zestaw.id, nazwa: zestaw.nazwa, progi: zestaw.progi.slice(), zrodlo: zestaw.zrodlo, uwaga: zestaw.uwaga || '' } : null,
      osCzasu: null,
      czasZWieku: false,
      punktOdniesienia: null,
      seria: [],
      przekroczenia: [],
      nadir: null,
      odzysk: null,
      leczenie: null,
      klasy: [],
      zdarzenia: [],
      punktDecyzyjny: punktDecyzyjny(o.lek, o.substancja, wiekLat),
      ostrzezenia: [],
    };

    if (!brama.ok) return wynik;
    if (!zestaw) {
      wynik.ostrzezenia.push('Brak modułu danych pasm — wykres pasm nie powstanie.');
    }
    if (nieznanyZestaw) {
      /* Cicha podmiana drabinki zmieniłaby wykres bez śladu — wołający ma się o tym dowiedzieć. */
      wynik.ostrzezenia.push('Nieznany zestaw pasm „' + nieznanyZestaw + '” — użyto zestawu dobranego wg leku.');
    }

    var os = osCzasu(seria);
    wynik.osCzasu = os;
    wynik.czasZWieku = os === 'wiek';
    if (os === 'wiek') {
      wynik.ostrzezenia.push('Tygodnie policzone z wieku pacjenta — pomiary nie mają kompletu dat, więc oś czasu jest przybliżona.');
    }

    var uporzadkowane = seria.slice().sort(function (a, b) {
      return klucz(a, os) - klucz(b, os);
    });

    /* Punkt odniesienia: masa w punkcie „Włączenie”, a gdy go nie ma — pierwszy pomiar. */
    var start = null;
    for (var i = 0; i < punkty.length; i++) {
      if (punkty[i].typ === 'start' && klucz(punkty[i], os) != null) { start = punkty[i]; break; }
    }
    var odniesienie = start || uporzadkowane[0];
    wynik.punktOdniesienia = {
      zrodlo: start ? 'start-leczenia' : 'pierwszy-pomiar',
      masa: odniesienie.masa,
      wzrost: odniesienie.wzrost,
      dateISO: odniesienie.dateISO,
      wiekMies: odniesienie.wiekMies,
      lek: start ? start.lek : null,
      substancja: start ? start.substancja : null,
      opis: start
        ? 'Procenty liczone od masy w punkcie „Włączenie” leczenia.'
        : 'Brak punktu „Włączenie” — procenty liczone od pierwszego pomiaru w serii.',
    };

    var masaOdn = odniesienie.masa;

    /* Seria wyliczona. Pomiary sprzed punktu odniesienia zostają, z ujemnym tygodniem —
       pokazują, co działo się przed leczeniem, i nie mogą udawać jego efektu. */
    for (var j = 0; j < uporzadkowane.length; j++) {
      var p = uporzadkowane[j];
      var tydz = tygodnieMiedzy(odniesienie, p, os);
      var bmi = bmiZ(p.masa, p.wzrost);
      var zmiana = (p.masa - masaOdn) / masaOdn * 100;
      wynik.seria.push({
        i: j,
        dateISO: p.dateISO,
        wiekMies: p.wiekMies,
        tydzien: tydz == null ? null : Math.round(tydz),
        tydzienDokladny: tydz,
        przedOdniesieniem: tydz != null && tydz < 0,
        masa: p.masa,
        wzrost: p.wzrost,
        bmi: bmi,
        zmianaMasyKg: p.masa - masaOdn,
        zmianaMasyPct: zmiana,
        ubytekPct: zmiana < 0 ? -zmiana : 0,
        klasa: klasaZ(bmi),
      });
    }

    var poOdniesieniu = wynik.seria.filter(function (s) { return !s.przedOdniesieniem; });

    /* Stan leczenia. „brak-danych” NIE znaczy „nie leczony” — zakładka należy się każdemu
       dorosłemu z dwoma pomiarami, więc brak punktów terapii może oznaczać i pacjenta bez
       farmakoterapii, i pacjenta, u którego jej po prostu nie wpisano. Nie zgadujemy. */
    var koniec = null;
    for (var e = 0; e < punkty.length; e++) if (punkty[e].typ === 'end') koniec = punkty[e];
    wynik.leczenie = {
      stan: punkty.length === 0 ? 'brak-danych' : (koniec ? 'odstawione' : 'na-leczeniu'),
      odstawienieDateISO: koniec ? koniec.dateISO : null,
      odstawienieTydzien: koniec ? zaokraglTydzien(tygodnieMiedzy(odniesienie, koniec, os)) : null,
      lek: wynik.punktOdniesienia.lek,
      substancja: wynik.punktOdniesienia.substancja,
    };

    /* Przekroczenia pasm — pierwszy pomiar, który sięgnął pasma. Bez interpolacji. */
    if (zestaw) {
      for (var b = 0; b < zestaw.progi.length; b++) {
        var prog = zestaw.progi[b];
        var trafiony = null;
        for (var k = 0; k < poOdniesieniu.length; k++) {
          if (poOdniesieniu[k].ubytekPct >= prog) { trafiony = poOdniesieniu[k]; break; }
        }
        wynik.przekroczenia.push({
          prog: prog,
          osiagniety: !!trafiony,
          tydzien: trafiony ? trafiony.tydzien : null,
          dateISO: trafiony ? trafiony.dateISO : null,
          masa: trafiony ? trafiony.masa : null,
          ubytekPct: trafiony ? trafiony.ubytekPct : null,
        });
      }
    }

    /* Nadir — najmniejsza masa od punktu odniesienia wzwyż. */
    var nadir = null;
    for (var n = 0; n < poOdniesieniu.length; n++) {
      if (!nadir || poOdniesieniu[n].masa < nadir.masa) nadir = poOdniesieniu[n];
    }
    if (nadir) {
      wynik.nadir = {
        tydzien: nadir.tydzien, dateISO: nadir.dateISO, masa: nadir.masa,
        bmi: nadir.bmi, ubytekPct: nadir.ubytekPct, ostatni: nadir === poOdniesieniu[poOdniesieniu.length - 1],
      };
    }

    /* Odzysk masy po nadirze. Surowa frakcja ZAWSZE — próg z pliku danych jest linią na
       wykresie, nie kryterium klinicznym (dla farmakoterapii nie ma uzgodnionego progu %MWL).

       `liniaDoPokazania` = false, dopóki nadirem jest ostatni pomiar. W trakcie redukcji
       `utrzymane` wynosi wtedy z definicji 1,00 i pole niczego nie mierzy; narysowana wtedy
       linia sugerowałaby lekarzowi, że coś jest monitorowane, choć nie ma jeszcze czego. */
    var ostatni = poOdniesieniu.length ? poOdniesieniu[poOdniesieniu.length - 1] : null;
    if (nadir && ostatni && nadir.ubytekPct > 0) {
      var U = (D && D.ODZYSK) || { frakcja: 0.75, nazwa: '', metryka: '', zrodlo: '' };
      var utrzymane = ostatni.ubytekPct / nadir.ubytekPct;
      wynik.odzysk = {
        frakcja: U.frakcja,
        nazwa: U.nazwa,
        metryka: U.metryka,
        zrodlo: U.zrodlo,
        utrzymane: utrzymane,
        istotny: utrzymane < U.frakcja,
        masaGraniczna: masaOdn - U.frakcja * (masaOdn - nadir.masa),
        odzyskKg: ostatni.masa - nadir.masa,
        liniaDoPokazania: nadir !== ostatni,
      };
    }

    /* Przejścia klas BMI — tylko tam, gdzie klucz klasy naprawdę się zmienił. */
    var poprzednia = null;
    for (var c = 0; c < wynik.seria.length; c++) {
      var kl = wynik.seria[c].klasa;
      if (!kl) continue;
      if (poprzednia && poprzednia.klasa.klucz !== kl.klucz) {
        var iOd = KOLEJNOSC_KLAS.indexOf(poprzednia.klasa.klucz);
        var iDo = KOLEJNOSC_KLAS.indexOf(kl.klucz);
        var kierunek = iOd < 0 || iDo < 0 ? null : (iDo < iOd ? 'poprawa' : 'pogorszenie');
        wynik.klasy.push({
          od: poprzednia.klasa, do: kl, kierunek: kierunek,
          tydzien: wynik.seria[c].tydzien, dateISO: wynik.seria[c].dateISO,
        });
        /* Wyjście z otyłości — moment, który na wykresie ma własny kolor (makieta 2026-09-19). */
        if (KLASY_OTYLOSCI[poprzednia.klasa.klucz] && !KLASY_OTYLOSCI[kl.klucz]) {
          wynik.zdarzenia.push({
            typ: 'wyjscie-z-otylosci', tydzien: wynik.seria[c].tydzien, dateISO: wynik.seria[c].dateISO,
            opis: 'Pacjent wyszedł z zakresu otyłości: ' + poprzednia.klasa.etykieta + ' → ' + kl.etykieta + '.',
          });
        }
      }
      poprzednia = wynik.seria[c];
    }

    /* Utrata zdobytego pasma — efekt jo-jo widziany po pasmach, bez nowego progu. */
    if (zestaw) {
      for (var z = 0; z < wynik.przekroczenia.length; z++) {
        var pz = wynik.przekroczenia[z];
        if (!pz.osiagniety) continue;
        var poTrafieniu = false;
        for (var q = 0; q < poOdniesieniu.length; q++) {
          var s = poOdniesieniu[q];
          if (!poTrafieniu) { if (s.ubytekPct >= pz.prog) poTrafieniu = true; continue; }
          if (s.ubytekPct < pz.prog) {
            wynik.zdarzenia.push({
              typ: 'pasmo-utracone', prog: pz.prog, tydzien: s.tydzien, dateISO: s.dateISO,
              opis: 'Ubytek spadł poniżej osiągniętego wcześniej pasma ' + pz.prog + ' %.',
            });
            break;
          }
        }
      }
    }

    /* Istotny odzysk masy — pierwszy pomiar po nadirze poniżej progu. To ZDARZENIE, nie
       „wypadnięcie z korytarza”: próg oznacza moment, od którego piśmiennictwo wiąże odzysk
       z progresją chorób towarzyszących, a nie cel, w którym pacjent ma się mieścić. */
    if (wynik.odzysk && wynik.nadir && !wynik.nadir.ostatni) {
      var poNadirze = false;
      for (var r = 0; r < poOdniesieniu.length; r++) {
        var t = poOdniesieniu[r];
        if (!poNadirze) { if (t === nadir) poNadirze = true; continue; }
        if (nadir.ubytekPct > 0 && (t.ubytekPct / nadir.ubytekPct) < wynik.odzysk.frakcja) {
          wynik.zdarzenia.push({
            typ: 'istotny-odzysk', tydzien: t.tydzien, dateISO: t.dateISO,
            opis: 'Odzyskano ponad ' + Math.round((1 - wynik.odzysk.frakcja) * 100)
              + ' % uzyskanego ubytku masy.',
          });
          break;
        }
      }
    }

    return wynik;
  }

  var API = {
    version: WERSJA,
    KOLEJNOSC_KLAS: KOLEJNOSC_KLAS.slice(),
    dostepne: dostepne,
    analizuj: analizuj,
    punktDecyzyjny: punktDecyzyjny,
  };

  try { Object.freeze(API); } catch (e) { /* zamrożenie jest miłe, nie konieczne */ }

  if (w) w.VildaPostepyDoroslego = API;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
