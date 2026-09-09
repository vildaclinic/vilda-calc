/* vilda_height_velocity.js — SDS tempa wzrastania, silnik wielopopulacyjny.
 *
 * ZASADA NADRZEDNA (decyzja wlasciciela 2026-09-09): WYNIK JEST LICZBA OPISOWA, NIE ALARMEM.
 * Modul nie zwraca zadnego werdyktu — ani `slow`, ani `alarm`, ani `severity`. Powod jest
 * twardy i pochodzi z danych: w kohorcie DONALD zakres zmiennosci HV-Z u TEGO SAMEGO
 * zdrowego dziecka wynosi srednio 2,83 SD (dziewczeta) i 2,84 SD (chlopcy), a ponad 90%
 * zdrowych dzieci ma w trakcie obserwacji co najmniej jeden rok z tempem ponizej 25.
 * centyla. Swoistosc kryterium „HV < 25. centyla przez rok" to 10,4% u dziewczat i 4,3%
 * u chlopcow (Duran i wsp. 2025, DOI 10.1515/jpem-2025-0225). Pojedyncza wartosc tempa nie
 * niesie decyzji klinicznej i modul nie ma prawa udawac, ze niesie. Straznik testowy
 * pilnuje, ze w wyniku nie ma pol werdyktowych.
 *
 * ZRODLA JAKO DANE, NIE ZALOZENIE (docs/ARCHITECTURE.md, „Kierunek: wielopopulacyjnosc"):
 * silnik jest bezpanstwowy i przyjmuje zrodlo jako argument. Kazdy wynik niesie nazwe
 * populacji odniesienia, zeby dalo sie ja pokazac lekarzowi i zapisac w rekordzie.
 *
 *   DONALD  — populacja niemiecka, 2,0-17,0 lat, okno 6-18 mies. (podstawa, bo najblizsza
 *             polskiej z dostepnych i podaje wartosci LMS wprost)
 *   KELLY   — populacja amerykanska, 5,5-18,5 lat, okno 11-13 mies.; JEDYNE zrodlo
 *             z osobnymi normami dla dzieci dojrzewajacych wczesniej/przecietnie/pozniej
 *   KOWD    — kwartyle dla konstytucjonalnego opoznienia wzrastania i dojrzewania;
 *             NIE daje Z, bo publikacja nie podaje ani SD, ani wartosci LMS
 *
 * POLSKICH NORM TEMPA WZRASTANIA NIE MA. Monografia Palczewskiej jest przekrojowa i tempa
 * nie zawiera. Kazdy wynik niesie to zastrzezenie jawnie.
 *
 * WIEK: normy sa indeksowane SRODKIEM przedzialu miedzy dwoma pomiarami — tak zbudowano
 * oba zrodla LMS. Wywolujacy ma podac wiek srodkowy, nie wiek biezacy.
 */
(function (w) {
  'use strict';

  var VERSION = '1';

  var POWOD = {
    BRAK_DANYCH: 'brak-danych',
    PLEC: 'brak-plci',
    ZRODLO: 'nieznane-zrodlo',
    OKNO: 'okno-poza-zakresem',
    WIEK_PONIZEJ: 'wiek-ponizej-zakresu',
    WIEK_POWYZEJ: 'wiek-powyzej-zakresu'
  };

  var OPIS_POWODU = {
    'brak-danych': 'Do policzenia SDS tempa potrzebne są: tempo w cm/rok, wiek i płeć.',
    'brak-plci': 'Normy tempa wzrastania są osobne dla dziewcząt i chłopców.',
    'nieznane-zrodlo': 'Nie znam takiego źródła norm tempa wzrastania.',
    'okno-poza-zakresem': 'Odstęp między pomiarami leży poza zakresem, dla którego zbudowano '
      + 'te normy. Krótsze odstępy zawyżają błąd pomiaru, dłuższe zacierają zmianę tempa.',
    'wiek-ponizej-zakresu': 'Wiek poniżej dolnej granicy tych norm.',
    'wiek-powyzej-zakresu': 'Wiek powyżej górnej granicy tych norm — w tym wieku wzrastanie '
      + 'jest zwykle ukończone i tempo przestaje cokolwiek różnicować.'
  };

  // Zastrzezenie towarzyszace KAZDEMU wynikowi — wprost z decyzji wlasciciela i z danych
  // DONALD. Nie jest opcjonalne i nie da sie go wylaczyc parametrem.
  var ZASTRZEZENIE_STALE = 'Pojedyncza wartość SDS tempa nie jest kryterium rozpoznania: '
    + 'u tego samego zdrowego dziecka waha się w trakcie obserwacji średnio o ok. 2,8 SD, '
    + 'a ponad 90% zdrowych dzieci ma co najmniej jeden rok z tempem poniżej 25. centyla.';

  var ZASTRZEZENIE_POPULACJA = 'Polskie normy tempa wzrastania nie istnieją; '
    + 'populacja odniesienia to ';

  function num(x) {
    var v = typeof x === 'string' ? parseFloat(String(x).replace(',', '.')) : x;
    return typeof v === 'number' && isFinite(v) ? v : null;
  }

  function plecKod(x) {
    var t = String(x == null ? '' : x).trim().toUpperCase();
    if (t === 'F' || t === 'K' || t === 'FEMALE') return 'F';
    if (t === 'M' || t === 'MALE') return 'M';
    return null;
  }

  // Z metoda LMS. L == 0 wymaga postaci logarytmicznej — u dziewczat „pozniej dojrzewajacych"
  // Kelly'ego L faktycznie przechodzi przez zero, wiec ta galaz nie jest teoretyczna.
  function zLms(L, M, S, hv) {
    if (!(M > 0) || !(hv > 0) || !(S > 0)) return null;
    if (Math.abs(L) < 1e-9) return Math.log(hv / M) / S;
    var potega = Math.pow(hv / M, L);
    if (!isFinite(potega)) return null;
    return (potega - 1) / (L * S);
  }

  function centylZ(z) {
    // Dystrybuanta rozkladu normalnego przez przyblizenie Abramowitza-Steguna 26.2.17.
    var t = 1 / (1 + 0.2316419 * Math.abs(z));
    var d = 0.3989422804014327 * Math.exp(-z * z / 2);
    var p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
      + t * (-1.821255978 + t * 1.330274429))));
    return (z > 0 ? 1 - p : p) * 100;
  }

  /* Interpolacja liniowa L, M i S miedzy dwoma najblizszymi wierszami tabeli. Tak samo robi
   * LMSgrowth Cole'a; interpolowanie gotowych centyli zamiast parametrow dawaloby inne
   * (gorsze) wyniki w obszarze skosnym. Tabela musi byc posortowana rosnaco po wieku. */
  function interpolujLms(tab, wiek) {
    if (!tab || !tab.length) return null;
    if (wiek < tab[0][0] || wiek > tab[tab.length - 1][0]) return null;
    for (var i = 0; i < tab.length; i += 1) {
      if (tab[i][0] === wiek) return { L: tab[i][1], M: tab[i][2], S: tab[i][3] };
      if (tab[i][0] > wiek) {
        var a = tab[i - 1], b = tab[i];
        var f = (wiek - a[0]) / (b[0] - a[0]);
        return {
          L: a[1] + f * (b[1] - a[1]),
          M: a[2] + f * (b[2] - a[2]),
          S: a[3] + f * (b[3] - a[3])
        };
      }
    }
    return null;
  }

  // ── Rejestr zrodel ───────────────────────────────────────────────────────────

  function daneDonald() { return w.VildaHvDonaldData || null; }
  function daneKelly() { return w.VildaHvKellyData || null; }
  function daneKowd() { return w.VildaHvCdgpData || null; }

  function zrodla() {
    var lista = [];
    var d = daneDonald(); if (d) lista.push(d.META);
    var k = daneKelly(); if (k) lista.push(k.META);
    var c = daneKowd(); if (c) lista.push(c.META);
    return lista;
  }

  /* Podgrupa Kelly'ego z wieku startu pokwitania. Progi sa danymi zrodla, nie stalymi
   * silnika. Zwraca null, gdy wieku startu nie znamy — wtedy uzywana jest tabela dla calej
   * kohorty, a nie zgadywana podgrupa. */
  function podgrupaZWieku(plec, wiekStartu) {
    var k = daneKelly();
    var t = num(wiekStartu);
    if (!k || t == null || !k.PROGI_PODGRUP[plec]) return null;
    var p = k.PROGI_PODGRUP[plec];
    if (t < p.wczesniej) return 'wczesniej';
    if (t > p.pozniej) return 'pozniej';
    return 'przecietnie';
  }

  // ── Galaz KOWD ───────────────────────────────────────────────────────────────

  /* Polozenie wzgledem kwartyli dzieci z KOWD. NIE jest to Z-score i nie wolno go tak
   * nazywac — publikacja podaje wylacznie 25., 50. i 75. centyl, bez SD i bez LMS. */
  function ocenKowd(plec, wiek, hv) {
    var d = daneKowd();
    if (!d || !d.KWARTYLE[plec]) return null;
    var t = d.KWARTYLE[plec];
    for (var i = 0; i < t.length; i += 1) {
      var r = t[i];
      if (wiek >= r[0] && wiek < r[1]) {
        var p25 = r[3], p50 = r[4], p75 = r[5];
        var polozenie;
        if (p25 == null || p75 == null) {
          polozenie = hv < p50 ? 'ponizej-mediany' : 'powyzej-mediany';
        } else if (hv < p25) polozenie = 'ponizej-25c';
        else if (hv < p50) polozenie = '25-50c';
        else if (hv < p75) polozenie = '50-75c';
        else polozenie = 'powyzej-75c';
        return {
          wiekOd: r[0], wiekDo: r[1], n: r[2],
          p25: p25, mediana: p50, p75: p75,
          polozenie: polozenie,
          tylkoMediana: p25 == null || p75 == null,
          zrodlo: d.META.cytowanie, doi: d.META.doi,
          zastrzezenie: 'Kwartyle z małej próby klinicznej (n w tym przedziale wieku: '
            + r[2] + '), nie centyle referencyjne. SDS z tych danych policzyć się nie da.'
        };
      }
    }
    return null;
  }

  // ── Obliczenie ───────────────────────────────────────────────────────────────

  function odmowa(powod, meta) {
    return {
      version: VERSION, sds: null, centyl: null, mediana: null,
      zrodlo: meta || null, podgrupa: null, kowd: null,
      zastrzezenia: [],
      powod: powod, opisPowodu: OPIS_POWODU[powod] || null
    };
  }

  /* Wejscie:
   *   sex                     — 'M' / 'F' (przyjmuje tez 'K', 'male', 'female')
   *   wiekLat                 — SRODEK przedzialu miedzy pomiarami, w latach
   *   cmPerYear               — zmierzone tempo
   *   oknoMies                — odstep miedzy pomiarami w miesiacach
   *   zrodlo                  — 'DONALD' (domyslne) albo 'KELLY'
   *   wiekStartuPokwitaniaLat — opcjonalnie; wlacza podgrupy Kelly'ego
   *   podgrupa                — opcjonalnie; jawne wskazanie podgrupy przez lekarza
   *   kowd                    — true, gdy lekarz uznaje pacjenta za KOWD
   */
  function oblicz(we) {
    var i = we && typeof we === 'object' ? we : {};
    var hv = num(i.cmPerYear);
    var wiek = num(i.wiekLat);
    var plec = plecKod(i.sex);
    var idZrodla = String(i.zrodlo || 'DONALD').toUpperCase();

    var pakiet = idZrodla === 'KELLY' ? daneKelly() : (idZrodla === 'DONALD' ? daneDonald() : null);
    if (!pakiet) return odmowa(POWOD.ZRODLO, null);
    var meta = pakiet.META;

    if (hv == null || wiek == null) return odmowa(POWOD.BRAK_DANYCH, meta);
    if (!plec) return odmowa(POWOD.PLEC, meta);

    var okno = num(i.oknoMies);
    if (okno == null || okno < meta.oknoMiesMin || okno > meta.oknoMiesMax) {
      return odmowa(POWOD.OKNO, meta);
    }
    if (wiek < meta.wiekMinLat[plec]) return odmowa(POWOD.WIEK_PONIZEJ, meta);
    if (wiek > meta.wiekMaxLat[plec]) return odmowa(POWOD.WIEK_POWYZEJ, meta);

    // Podgrupa wg czasu pokwitania — tylko gdy zrodlo ja ma i gdy sa dane pacjenta.
    var podgrupa = null;
    var tab = pakiet.LMS[plec];
    if (meta.uwzglednaCzasPokwitania && pakiet.LMS_PODGRUPY) {
      podgrupa = i.podgrupa || podgrupaZWieku(plec, i.wiekStartuPokwitaniaLat);
      var tabP = podgrupa && pakiet.LMS_PODGRUPY[plec]
        ? pakiet.LMS_PODGRUPY[plec][podgrupa] : null;
      if (tabP && wiek >= tabP[0][0] && wiek <= tabP[tabP.length - 1][0]) tab = tabP;
      else podgrupa = null;   // poza zakresem podgrupy wracamy do calej kohorty
    }

    var lms = interpolujLms(tab, wiek);
    if (!lms) return odmowa(POWOD.WIEK_POWYZEJ, meta);
    var z = zLms(lms.L, lms.M, lms.S, hv);
    if (z == null) return odmowa(POWOD.BRAK_DANYCH, meta);

    var zastrzezenia = [ZASTRZEZENIE_STALE, ZASTRZEZENIE_POPULACJA + meta.populacja + '.'];
    if (!meta.uwzglednaCzasPokwitania || !podgrupa) {
      zastrzezenia.push('Norma uśredniona po wszystkich dzieciach w tym wieku — nie '
        + 'uwzględnia indywidualnego czasu pokwitania.');
    }
    if (hv < 0) {
      zastrzezenia.push('Tempo ujemne oznacza błąd pomiaru albo wpisu; wynik jest '
        + 'formalny, nie kliniczny.');
    }

    return {
      version: VERSION,
      sds: z,
      centyl: centylZ(z),
      mediana: lms.M,
      L: lms.L, S: lms.S,
      wiekLat: wiek,
      plec: plec,
      oknoMies: okno,
      cmPerYear: hv,
      podgrupa: podgrupa,
      zrodlo: {
        id: meta.id, etykieta: meta.etykieta, populacja: meta.populacja,
        cytowanie: meta.cytowanie, pmid: meta.pmid, doi: meta.doi
      },
      kowd: i.kowd === true ? ocenKowd(plec, wiek, hv) : null,
      zastrzezenia: zastrzezenia,
      powod: null,
      opisPowodu: null
    };
  }

  w.VildaHeightVelocity = {
    VERSION: VERSION,
    POWOD: POWOD,
    OPIS_POWODU: OPIS_POWODU,
    ZASTRZEZENIE_STALE: ZASTRZEZENIE_STALE,
    zrodla: zrodla,
    interpolujLms: interpolujLms,
    zLms: zLms,
    centylZ: centylZ,
    podgrupaZWieku: podgrupaZWieku,
    ocenKowd: ocenKowd,
    oblicz: oblicz
  };
}(typeof window !== 'undefined' ? window : this));
