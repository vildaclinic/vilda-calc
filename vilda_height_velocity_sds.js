/* vilda_height_velocity_sds.js — SDS tempa wzrastania (HV-SDS) wg Rikkena i Wita 1992.
 *
 * Czytelny modul wg AGENTS.md §2. Odpowiada na pytanie, ktorego aplikacja dotad nie umiala
 * zadac: nie „ile centymetrow na rok", tylko „jak to tempo wypada wzgledem rowiesnikow".
 *
 * ZRODLO I JEGO GRANICE (Rikken B, Wit JM. Prepubertal height velocity references over a
 * wide age range. Arch Dis Child 1992;67:1277-80; DOI 10.1136/adc.67.10.1277):
 *  - model ICP dopasowany do SZWEDZKIEGO badania podluznego — populacja szwedzka lat 60.,
 *    NIE polska; kazdy wynik musi to nazywac;
 *  - wylacznie okres PRZEDPOKWITANIOWY, do 15,5 roku (chlopcy) i 13,5 roku (dziewczeta) —
 *    autorzy przyjeli te granice, bo dluzszy stan przedpokwitaniowy uznali za niefizjologiczny;
 *  - SD dopasowano na danych chlopcow <10 lat i dziewczat <8 lat, powyzej jest EKSTRAPOLOWANE;
 *    autorzy pisza wprost, ze te czesc opiera sie na nieudowodnionych zalozeniach;
 *  - referencja dotyczy przyrostu ROCZNEGO. Autorzy ostrzegaja, ze dla krotszych odstepow
 *    nalezaloby uzyc WIEKSZEGO SD, a jego wielkosc jest nieznana. Liczenie SDS z polrocznej
 *    obserwacji na tym SD zawyzaloby wynik co do wartosci bezwzglednej — dziecko wygladaloby
 *    gorzej, niz jest. Dlatego modul MILCZY poza oknem rocznym, zamiast zgadywac.
 *
 * TOLERANCJA OKNA: 12 +/- 1 miesiac. To nie jest liczba dobrana przez implementacje — tak
 * definiuje przyrost roczny Kelly i wsp. (J Clin Endocrinol Metab 2014;99:2104-12;
 * DOI 10.1210/jc.2013-4455), ktorzy zbierali „annual (12 +/- 1 mo) HV measurements".
 *
 * CZEGO TEN MODUL NIE ROBI: nie orzeka o kwalifikacji do programu B.64. Program wymaga norm
 * dla populacji POLSKIEJ, a tych nie ma — ani w monografii Palczewskiej i Niedzwieckiej
 * (badanie przekrojowe), ani w zadnym zweryfikowanym zrodle. Wynik tego modulu jest
 * informacja kliniczna z jawnie nazwana populacja odniesienia, nie spelnieniem kryterium.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  // Zrodlo: Rikken i Wit 1992, tabela 1 (srednie) i tabela 2 (SD).
  var MODEL = {
    M: {
      // 0,5 <= t <= 3,0: HV(t) = a + b*t + c*t^2
      wielomian: { a: 27.11, b: -12.73, c: 2.06 },
      // t > 3,0: HV(t) = b + 2*c*t  (czyli 8,54 - 0,36*t)
      liniowa: { b: 8.54, c: -0.18 },
      // SD(t) = a + exp(-b*t + c)
      sd: { a: 0.691, b: 0.538, c: 0.912 },
      wiekMax: 15.5,
      sdDopasowaneDo: 10
    },
    F: {
      wielomian: { a: 25.28, b: -11.07, c: 1.73 },
      liniowa: { b: 8.88, c: -0.21 },   // 8,88 - 0,42*t
      sd: { a: 0.820, b: 0.649, c: 0.635 },
      wiekMax: 13.5,
      sdDopasowaneDo: 8
    }
  };

  var WIEK_MIN = 0.5;
  var GRANICA_WIELOMIANU = 3.0;
  var OKNO_SRODEK_M = 12;
  var OKNO_TOLERANCJA_M = 1;   // Kelly 2014: „annual (12 +/- 1 mo)"

  var ZRODLO = 'Rikken i Wit 1992 (model ICP na danych szwedzkich)';

  function num(x) {
    var v = typeof x === 'string' ? parseFloat(String(x).replace(',', '.')) : x;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function plecKod(p) {
    var s = String(p == null ? '' : p).trim().toUpperCase();
    if (s === 'M') return 'M';
    if (s === 'F' || s === 'K') return 'F';
    return null;
  }

  // Srednie tempo wzrastania w wieku t (lata). Ponizej 3,0 roku wielomian interpozycyjny,
  // powyzej — komponent dzieciecy modelu ICP. W punkcie 3,0 obowiazuje wielomian (tak jak
  // w tabeli 3 pracy zrodlowej).
  function srednia(t, plec) {
    var m = MODEL[plec];
    if (!m) return null;
    if (t <= GRANICA_WIELOMIANU) {
      var wl = m.wielomian;
      return wl.a + wl.b * t + wl.c * t * t;
    }
    return m.liniowa.b + 2 * m.liniowa.c * t;
  }

  function odchylenie(t, plec) {
    var m = MODEL[plec];
    if (!m) return null;
    return m.sd.a + Math.exp(-m.sd.b * t + m.sd.c);
  }

  // Powody, dla ktorych modul odmawia policzenia SDS. Kazdy jest osobna wiadomoscia, bo
  // „nie da sie" bez podania przyczyny jest w karcie leczenia bezuzyteczne.
  var POWOD = {
    BRAK_DANYCH: 'brak-danych',
    PLEC: 'brak-plci',
    WIEK_PONIZEJ: 'wiek-ponizej-zakresu',
    WIEK_POWYZEJ: 'wiek-powyzej-zakresu',
    OKNO: 'okno-obserwacji',
    POKWITANIE: 'po-pokwitaniu'
  };

  var OPIS_POWODU = {};
  OPIS_POWODU[POWOD.BRAK_DANYCH] = 'Brak tempa wzrastania albo wieku.';
  OPIS_POWODU[POWOD.PLEC] = 'Brak płci — model ma osobne równania dla chłopców i dziewcząt.';
  OPIS_POWODU[POWOD.WIEK_PONIZEJ] = 'Model zaczyna się od 0,5 roku życia.';
  OPIS_POWODU[POWOD.WIEK_POWYZEJ] = 'Model kończy się na 15,5 roku (chłopcy) i 13,5 roku '
    + '(dziewczęta) — powyżej tych granic autorzy uznali stan przedpokwitaniowy za '
    + 'niefizjologiczny.';
  OPIS_POWODU[POWOD.OKNO] = 'Referencja dotyczy przyrostu rocznego (12 ± 1 mies.). Autorzy '
    + 'ostrzegają, że dla krótszych odstępów należałoby użyć większego SD, a jego wielkość '
    + 'jest nieznana — policzony SDS byłby zawyżony.';
  OPIS_POWODU[POWOD.POKWITANIE] = 'Model dotyczy wyłącznie dzieci przed pokwitaniem.';

  function odmowa(powod) {
    return {
      version: VERSION,
      sds: null,
      powod: powod,
      opisPowodu: OPIS_POWODU[powod] || null,
      zrodlo: ZRODLO
    };
  }

  /* Wejscie:
   *   cmPerYear     — tempo wzrastania w cm/rok
   *   ageYears      — wiek w latach na koniec okresu obserwacji
   *   sex           — 'M' | 'F'
   *   gapMonths     — dlugosc okna obserwacji w miesiacach
   *   tannerStage   — etap Tannera, jesli znany (null = nieznany)
   */
  function oblicz(we) {
    var i = we && typeof we === 'object' ? we : {};
    var v = num(i.cmPerYear);
    var t = num(i.ageYears);
    if (v == null || t == null) return odmowa(POWOD.BRAK_DANYCH);
    var plec = plecKod(i.sex);
    if (!plec) return odmowa(POWOD.PLEC);

    var tanner = num(i.tannerStage);
    if (tanner != null && tanner > 1) return odmowa(POWOD.POKWITANIE);

    var okno = num(i.gapMonths);
    if (okno == null || Math.abs(okno - OKNO_SRODEK_M) > OKNO_TOLERANCJA_M) {
      return odmowa(POWOD.OKNO);
    }

    if (t < WIEK_MIN) return odmowa(POWOD.WIEK_PONIZEJ);
    var m = MODEL[plec];
    if (t > m.wiekMax) return odmowa(POWOD.WIEK_POWYZEJ);

    var mu = srednia(t, plec);
    var sd = odchylenie(t, plec);
    if (mu == null || sd == null || !(sd > 0)) return odmowa(POWOD.BRAK_DANYCH);

    return {
      version: VERSION,
      sds: (v - mu) / sd,
      srednia: mu,
      sd: sd,
      wiekLat: t,
      plec: plec,
      oknoMies: okno,
      // Powyzej wieku dopasowania SD jest ekstrapolowane — praca mowi o tym wprost,
      // wiec kazdy taki wynik musi to niesc dalej.
      sdEkstrapolowane: t > m.sdDopasowaneDo,
      // Model jest przedpokwitaniowy; przy nieznanym Tannerze to zalozenie, nie fakt.
      zalozonoPrzedpokwitaniowy: tanner == null,
      zrodlo: ZRODLO,
      powod: null,
      opisPowodu: null
    };
  }

  w.VildaHeightVelocitySDS = {
    VERSION: VERSION,
    ZRODLO: ZRODLO,
    POWOD: POWOD,
    MODEL: MODEL,
    OKNO: { srodekM: OKNO_SRODEK_M, tolerancjaM: OKNO_TOLERANCJA_M },
    srednia: srednia,
    odchylenie: odchylenie,
    oblicz: oblicz
  };
}(typeof window !== 'undefined' ? window : this));
