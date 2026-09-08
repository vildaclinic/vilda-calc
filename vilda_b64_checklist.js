/* vilda_b64_checklist.js — sciaga kryteriow programu lekowego B.64 (SGA/IUGR).
 *
 * Czytelny modul wg AGENTS.md §2. Zestawia dane, ktore aplikacja juz ma, z osmioma
 * kryteriami kwalifikacji zalacznika B.64 („Leczenie hormonem wzrostu niskoroslych dzieci
 * urodzonych jako zbyt male w porownaniu do czasu trwania ciazy", ICD-10 R 62.9).
 *
 * ZASADA NADRZEDNA: to jest ZESTAWIENIE DANYCH, NIE ORZECZENIE. Do programu kwalifikuje
 * Zespol Koordynacyjny ds. Stosowania Hormonu Wzrostu — nie aplikacja i nie ten modul.
 * Dlatego zaden stan nie nazywa sie „kwalifikuje sie"; modul mowi wylacznie, czy dana
 * LICZBA miesci sie w progu zapisanym w programie, albo ze nie umie tego sprawdzic.
 *
 * ZADNEGO NOWEGO PROGU: wszystkie progi pochodza doslownie z zalacznika B.64 — masa lub
 * dlugosc urodzeniowa < -2 SD, wiek > 4 lat, wysokosc < 3 centyla na siatkach polskich,
 * tempo wzrastania < -1 SD przy min. 6-miesiecznej obserwacji, wiek kostny < 14 lat
 * (dziewczynka) / < 16 lat (chlopiec) wg Greulicha-Pyle.
 *
 * CZTERY RZECZY, KTORYCH TEN MODUL SWIADOMIE NIE UDAJE:
 *  1. Kryterium tempa w SD — aplikacja liczy tempo w cm/rok, a norm tempa w SD dla
 *     populacji polskiej nie ma w danych aplikacji. Modul podaje wiec liczbe w cm/rok
 *     i dlugosc okna obserwacji (te 6 miesiecy UMIE sprawdzic), a sama ocene w SD
 *     oznacza jako „do sprawdzenia recznie". Nie podstawia norm z innej populacji.
 *  2. „3 centyl" to NIE „-2 SD". 3 centyl odpowiada z = -1,881; dziecko z hSDS -1,95
 *     jest ponizej 3 centyla, choc powyzej -2 SD. Modul liczy wiec centyl, a nie porownuje
 *     SDS z -2.
 *  3. Siatki. Program zada siatek dla populacji polskiej. Jesli karta liczy centyl wg
 *     innego zbioru (OLAF, WHO), modul to WYPISUJE zamiast milczeco podac liczbe, ktorej
 *     program nie mial na mysli.
 *  4. Kryteria 6-8 (wykluczenie innych przyczyn, testy stymulacji GH, obrazowanie) leza
 *     poza aplikacja i sa tak oznaczone — nie „brak danych", tylko „poza aplikacja".
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  // ── Progi przepisane z zalacznika B.64 (wersja obowiazujaca od 01.2015) ──────────
  var PROG_SD_URODZENIOWY = -2;   // masa LUB dlugosc urodzeniowa
  var PROG_WIEK_MIES = 48;        // „wiek > 4 lat" — ostro wiekszy
  var PROG_CENTYL = 3;            // „ponizej 3 centyla"
  var PROG_TEMPO_SD = -1;         // „ponizej -1 SD" — aplikacja tego nie liczy, patrz naglowek
  var PROG_OKNO_TEMPA_MIES = 6;   // „co najmniej 6-miesieczny okres obserwacji"
  var PROG_WIEK_KOSTNY_F = 14;    // dziewczynka
  var PROG_WIEK_KOSTNY_M = 16;    // chlopiec
  var SIATKI_POLSKIE = 'PALCZEWSKA';

  // z dla 3 centyla — stala matematyczna rozkladu normalnego, nie prog kliniczny.
  var Z_3_CENTYL = -1.8808;

  function num(x) {
    var v = typeof x === 'string' ? parseFloat(String(x).replace(',', '.')) : x;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function fmt(v, n) {
    var x = num(v);
    if (x == null) return '—';
    return x.toFixed(n == null ? 1 : n).replace('.', ',');
  }

  // Znak jak w karcie: zero po zaokragleniu nie dostaje ani plusa, ani minusa.
  function fmtSds(s) {
    var x = num(s);
    if (x == null) return '—';
    var t = Math.abs(x).toFixed(2);
    return (parseFloat(t) === 0 ? '' : (x > 0 ? '+' : '−')) + t.replace('.', ',');
  }

  function lata(mies) {
    var m = num(mies);
    if (m == null) return '—';
    var l = Math.floor(m / 12), r = Math.round(m - l * 12);
    if (r === 12) { l += 1; r = 0; }
    return r === 0 ? l + ' lat' : l + ' lat ' + r + ' mies.';
  }

  // ── Stany kryterium ──────────────────────────────────────────────────────────────
  // SPELNIONE / NIESPELNIONE — liczba jest i miesci sie (albo nie) w progu programu.
  // BRAK_DANYCH  — aplikacja umialaby to sprawdzic, ale danych nie wpisano.
  // RECZNIE      — aplikacja nie ma czym tego policzyc; lekarz sprawdza sam.
  // POZA         — kryterium spoza aplikacji (badania, obrazowanie, roznicowanie).
  var ST = {
    SPELNIONE: 'spelnione',
    NIESPELNIONE: 'niespelnione',
    BRAK_DANYCH: 'brak-danych',
    RECZNIE: 'recznie',
    POZA: 'poza-aplikacja'
  };
  var ETYKIETA = {
    'spelnione': 'SPEŁNIONE',
    'niespelnione': 'NIESPEŁNIONE',
    'brak-danych': 'BRAK DANYCH',
    'recznie': 'DO SPRAWDZENIA RĘCZNIE',
    'poza-aplikacja': 'POZA APLIKACJĄ'
  };

  function poz(nr, tytul, stan, szczegol, uwaga) {
    return {
      nr: nr,
      tytul: tytul,
      stan: stan,
      etykieta: ETYKIETA[stan] || stan,
      szczegol: szczegol || null,
      uwaga: uwaga || null
    };
  }

  // ── Kryterium 1 — masa LUB dlugosc urodzeniowa < -2 SD ──────────────────────────
  function kryterium1(u) {
    var masa = u ? num(u.masaSds) : null;
    var dlug = u ? num(u.dlugoscSds) : null;
    if (masa == null && dlug == null) {
      return poz(1, 'Masa lub długość urodzeniowa < −2 SD dla wieku ciążowego',
        ST.BRAK_DANYCH, 'Karta SGA nie ma policzonego SDS masy ani długości urodzeniowej.');
    }
    var czesci = [];
    if (masa != null) czesci.push('masa ' + fmtSds(masa) + ' SD');
    if (dlug != null) czesci.push('długość ' + fmtSds(dlug) + ' SD');
    if (u && u.tygodnie != null) {
      czesci.push(num(u.tygodnie) + (num(u.dni) ? '+' + num(u.dni) : '') + ' tc');
    }
    if (u && u.zrodloNorm) czesci.push('wg ' + u.zrodloNorm);
    var spelnia = (masa != null && masa < PROG_SD_URODZENIOWY)
      || (dlug != null && dlug < PROG_SD_URODZENIOWY);
    return poz(1, 'Masa lub długość urodzeniowa < −2 SD dla wieku ciążowego',
      spelnia ? ST.SPELNIONE : ST.NIESPELNIONE, czesci.join('; '));
  }

  // ── Kryterium 2 — wiek > 4 lat ───────────────────────────────────────────────────
  function kryterium2(wiekMies) {
    var m = num(wiekMies);
    if (m == null) return poz(2, 'Wiek > 4 lat', ST.BRAK_DANYCH, 'Brak wieku pacjenta.');
    return poz(2, 'Wiek > 4 lat',
      m > PROG_WIEK_MIES ? ST.SPELNIONE : ST.NIESPELNIONE, lata(m));
  }

  // ── Kryterium 3 — wysokosc < 3 centyla na siatkach polskich ──────────────────────
  function kryterium3(input) {
    var c = num(input.centyl);
    var sd = num(input.hSds);
    var tytul = 'Wysokość ciała < 3 centyla na siatkach dla populacji polskiej';
    if (c == null && sd == null) {
      return poz(3, tytul, ST.BRAK_DANYCH, 'Brak pomiaru wysokości ciała.');
    }
    var ponizej = c != null ? c < PROG_CENTYL : sd < Z_3_CENTYL;
    var czesci = [];
    if (num(input.wzrostCm) != null) czesci.push(fmt(input.wzrostCm, 1) + ' cm');
    if (c != null) czesci.push(fmt(c, 1) + ' centyl');
    if (sd != null) czesci.push('hSDS ' + fmtSds(sd));
    var zrodlo = input.zrodloSiatek ? String(input.zrodloSiatek).toUpperCase() : null;
    if (zrodlo) czesci.push('siatki ' + zrodlo);
    var uwaga = null;
    if (!zrodlo) {
      uwaga = 'Nie wiadomo, z których siatek policzono centyl — program wymaga siatek polskich.';
    } else if (zrodlo !== SIATKI_POLSKIE) {
      uwaga = 'Centyl policzony wg ' + zrodlo + ', a program wymaga siatek dla populacji '
        + 'polskiej (Palczewska). Przelicz na siatkach polskich przed użyciem.';
    }
    if (c == null) {
      uwaga = (uwaga ? uwaga + ' ' : '')
        + 'Centyl odczytany z hSDS (3 centyl to z = −1,88, nie −2 SD).';
    }
    return poz(3, tytul, ponizej ? ST.SPELNIONE : ST.NIESPELNIONE, czesci.join('; '), uwaga);
  }

  // ── Kryterium 4 — tempo wzrastania < -1 SD, min. 6 mies. obserwacji ──────────────
  //
  // Ocena w SD jest poza zasiegiem aplikacji (brak norm tempa dla populacji polskiej),
  // ale WARUNEK 6 MIESIECY jest sprawdzalny — i sprawdzamy go, bo to najczestszy powod,
  // dla ktorego pomiar sie nie liczy.
  function kryterium4(input) {
    var tytul = 'Tempo wzrastania < −1 SD wobec norm polskich (min. 6 mies. obserwacji)';
    var v = num(input.tempoCmRok);
    var okno = num(input.tempoOknoMies);
    var czesci = [];
    if (v != null) czesci.push(fmt(v, 1) + ' cm/rok');
    if (okno != null) czesci.push('z ' + Math.round(okno) + ' mies. obserwacji');
    if (okno != null && okno < PROG_OKNO_TEMPA_MIES) {
      return poz(4, tytul, ST.NIESPELNIONE, czesci.join(', '),
        'Okno obserwacji krótsze niż wymagane ' + PROG_OKNO_TEMPA_MIES + ' miesięcy — '
        + 'niezależnie od wartości tempa pomiar nie spełnia warunku programu.');
    }
    if (v == null) {
      return poz(4, tytul, ST.BRAK_DANYCH,
        'Za mało pomiarów wzrostu, żeby policzyć tempo.');
    }
    return poz(4, tytul, ST.RECZNIE, czesci.join(', '),
      'Aplikacja liczy tempo w cm/rok. Norm tempa wzrastania w SD dla populacji polskiej '
      + 'nie ma w danych aplikacji, więc porównania z progiem ' + PROG_TEMPO_SD
      + ' SD nie wykonano.');
  }

  // ── Kryterium 5 — wiek kostny ────────────────────────────────────────────────────
  function kryterium5(input) {
    var plec = input.plec === 'F' ? 'F' : (input.plec === 'M' ? 'M' : null);
    var prog = plec === 'F' ? PROG_WIEK_KOSTNY_F : (plec === 'M' ? PROG_WIEK_KOSTNY_M : null);
    var tytul = 'Wiek kostny < 14 lat (dziewczynka) / < 16 lat (chłopiec), Greulich–Pyle';
    var ba = num(input.wiekKostnyLat);
    if (ba == null) {
      return poz(5, tytul, ST.BRAK_DANYCH, 'Brak oceny wieku kostnego.');
    }
    if (prog == null) {
      return poz(5, tytul, ST.BRAK_DANYCH,
        fmt(ba, 1) + ' roku', 'Brak płci — próg zależy od płci dziecka.');
    }
    return poz(5, tytul, ba < prog ? ST.SPELNIONE : ST.NIESPELNIONE,
      fmt(ba, 1) + ' roku (próg ' + prog + ' lat)');
  }

  function pozaAplikacja() {
    return [
      poz(6, 'Wykluczenie innych niż SGA/IUGR przyczyn niskorosłości', ST.POZA, null),
      poz(7, 'GH ≥ 10 ng/ml w 2 z 4 testów stymulacyjnych albo w teście nocnym', ST.POZA, null),
      poz(8, 'Brak przeciwwskazań w TK z kontrastem lub MRI okolicy podwzgórzowo-przysadkowej',
        ST.POZA, null)
    ];
  }

  function evaluate(input) {
    var we = input && typeof input === 'object' ? input : {};
    var kryteria = [
      kryterium1(we.urodzenie),
      kryterium2(we.wiekMies),
      kryterium3(we),
      kryterium4(we),
      kryterium5(we)
    ].concat(pozaAplikacja());
    var licz = function (stan) {
      return kryteria.filter(function (k) { return k.stan === stan; }).length;
    };
    return {
      version: VERSION,
      kryteria: kryteria,
      podsumowanie: {
        spelnione: licz(ST.SPELNIONE),
        niespelnione: licz(ST.NIESPELNIONE),
        brakDanych: licz(ST.BRAK_DANYCH),
        recznie: licz(ST.RECZNIE),
        poza: licz(ST.POZA)
      }
    };
  }

  // ── Tekst do schowka ─────────────────────────────────────────────────────────────
  var STOPKA = 'Aplikacja nie kwalifikuje do programu — kwalifikuje Zespół Koordynacyjny '
    + 'ds. Stosowania Hormonu Wzrostu. Powyższe jest zestawieniem danych, nie orzeczeniem. '
    + 'Podstawa: załącznik B.64 (ICD-10 R 62.9), wersja obowiązująca od 01.2015. '
    + 'Kryteria kwalifikacji muszą być spełnione łącznie.';

  function compose(input) {
    var wynik = evaluate(input);
    var we = input && typeof input === 'object' ? input : {};
    var linie = ['Program lekowy B.64 (SGA/IUGR) — zestawienie kryteriów'];
    var naglowek = [];
    if (we.imie) naglowek.push(String(we.imie).trim());
    if (we.plec === 'M') naglowek.push('chłopiec');
    else if (we.plec === 'F') naglowek.push('dziewczynka');
    if (num(we.wiekMies) != null) naglowek.push('wiek ' + lata(we.wiekMies));
    if (naglowek.length) linie.push(naglowek.join(', '));
    linie.push('');
    wynik.kryteria.forEach(function (k) {
      linie.push(k.nr + '. ' + k.tytul + ' — ' + k.etykieta);
      if (k.szczegol) linie.push('   ' + k.szczegol);
      if (k.uwaga) linie.push('   ' + k.uwaga);
    });
    linie.push('');
    linie.push(STOPKA);
    wynik.text = linie.join('\n');
    return wynik;
  }

  w.VildaB64Checklist = {
    VERSION: VERSION,
    STANY: ST,
    PROGI: {
      SD_URODZENIOWY: PROG_SD_URODZENIOWY,
      WIEK_MIES: PROG_WIEK_MIES,
      CENTYL: PROG_CENTYL,
      TEMPO_SD: PROG_TEMPO_SD,
      OKNO_TEMPA_MIES: PROG_OKNO_TEMPA_MIES,
      WIEK_KOSTNY_F: PROG_WIEK_KOSTNY_F,
      WIEK_KOSTNY_M: PROG_WIEK_KOSTNY_M,
      SIATKI_POLSKIE: SIATKI_POLSKIE,
      Z_3_CENTYL: Z_3_CENTYL
    },
    evaluate: evaluate,
    compose: compose
  };
}(typeof window !== 'undefined' ? window : this));
