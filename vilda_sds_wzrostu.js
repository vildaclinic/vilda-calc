/*
 * vilda_sds_wzrostu.js (v1) — JEDYNE miejsce, w którym aplikacja liczy SDS (z-score)
 * i centyl WZROSTU dla wieku. Wszyscy inni czytają, formatują i pokazują.
 *
 * P-SDS etap 1 (audyt 2026-09-15, decyzje właściciela 2026-09-15). Dotąd wzór LMS na wzrost
 * żył w app.js w dwóch kopiach (calcPercentileStats i advHistoryCalcLmsStats), w module
 * siatek (getCentilePercentileStatsForSource), w module ciśnienia i w Karcie pacjenta,
 * a reguła „która siatka dla którego wieku" była przepisywana ręcznie w kilkunastu plikach
 * z trzema różnymi wynikami. Ten moduł zamyka regułę w jednym miejscu.
 *
 * REGUŁY (decyzje właściciela):
 *  1. Źródło OLAF: od 36. miesiąca siatki OLAF; poniżej 3 lat — siatka Palczewskiej
 *     (OLAF nie ma danych poniżej 3 lat; WHO 2006 zostaje tylko dla źródła WHO).
 *  2. Źródło PALCZEWSKA jest pełnoprawne: każdy konsument rdzenia dostaje Palczewską,
 *     także mpSDS i normy w 18. roku życia (dotąd rdzeń traktował PALCZEWSKA jak WHO).
 *  3. Źródło WHO: 0–35 mies. WHO 2006 (długość/wysokość), 36–216 mies. WHO 2007.
 *  4. Wiek jest UŁAMKOWY w miesiącach i tak trafia do interpolacji — wszędzie, także
 *     u niemowląt (DOB-AGE-4 działa dla każdej ścieżki, nie tylko dla karty głównej).
 *  5. Noworodek (< 1 mies.) nie ma wiersza u Palczewskiej (siatka od 1. miesiąca) — idzie
 *     na WHO 2006, z jawnym powodem.
 *  6. Powyżej 216 mies. siatki LMS milczą; Palczewska sięga 222 mies. Powyżej 222 mies.
 *     wynik to null z powodem — nigdy cicha wartość z ostatniego wiersza.
 *  7. Łańcuch zastępczy (gdy zadana siatka nie ma danych) jest jawny: wynik niesie
 *     `siatka` (użyta), `zrodloZadane`, `fallback` i `powod`.
 *
 * WZÓR LMS: z = ((x/M)^L − 1)/(L·S), a dla L = 0: z = ln(x/M)/S (Cole & Green 1992).
 * Palczewska publikuje centyle, nie LMS: z liczymy interpolacją liniową między
 * z-wartościami sąsiednich centyli (3, 10, 25, 50, 75, 90, 97), z ekstrapolacją liniową poza
 * skrajnymi — ta sama reguła, którą app.js stosował w calcPercentileStatsPal (patrz
 * ALGORITHMS.md, „Uwaga o zgodności hSDS": 3. centyl = −1,8808).
 *
 * DANE: tablice LMS (LMS_INFANT_HEIGHT_*, LMS_HEIGHT_WHO_*, LMS_HEIGHT_* [OLAF]) mieszkają
 * w app.js jako stałe skryptowe i są wystawione pakietem window.VildaWzrostLMS; centyle
 * Palczewskiej daje getPalReferenceCentileInterpolated (app.js → vilda_centile_interpolation.js).
 * Moduł nie ma zależności od DOM ani od eval (CSP); dane bierze leniwie przy liczeniu,
 * a testy podają je przez ustawDane().
 *
 * FORMAT (decyzja 4): SDS zawsze z dwoma miejscami, znakiem i przecinkiem: „hSDS −1,23";
 * centyl wg ADV-REPORT-5: „<1", „>99", inaczej zaokrąglenie do jedności.
 */
(function (root) {
  'use strict';
  if (!root) return;

  var WERSJA = 1;
  var ZRODLA = ['PALCZEWSKA', 'OLAF', 'WHO'];
  /* P-DS-4b: siatki, na których silnik umie liczyć. DS nie jest wyborem użytkownika
     (bmiSource), tylko skutkiem rozpoznania pacjenta — dlatego stoi obok ZRODLA, nie w nich.
     Reguła i jej uzasadnienie jak w vilda_bmi.js (decyzje D1–D3). */
  var SIATKI = ['PALCZEWSKA', 'OLAF', 'WHO', 'DS'];
  var G = Object.freeze({
    OLAF_MIN_M: 36,     // OLAF od 3. roku życia
    LMS_MAX_M: 216,     // WHO 2007 i OLAF do 18 lat
    WHO_INFANT_MAX_M: 35,
    PAL_MIN_M: 1,       // Palczewska od 1. miesiąca
    PAL_MAX_M: 222,     // Palczewska do 18,5 roku
    DS_MIN_M: 1,        // długość DS od 1. miesiąca (tabela niemowlęca Zemel)
    DS_DZIECKO_M: 24,   // od 2 lat tabela dziecięca DS
    DS_MAX_M: 240,      // siatki DS do 20 lat
  });
  var CENTYLE_PAL = [3, 10, 25, 50, 75, 90, 97];

  var dane = {};

  /* Dane: najpierw wstrzyknięte (testy), potem własność globalna, potem pakiet tablic
     wzrostu wystawiony przez app.js (window.VildaWzrostLMS — stałe skryptowe app.js nie są
     własnościami window, a CSP strony zakazuje eval/Function, więc jawny eksport to jedyna
     droga). Brak danych = null, nigdy wyjątek. */
  function dana(nazwa) {
    if (Object.prototype.hasOwnProperty.call(dane, nazwa)) return dane[nazwa];
    try { if (root[nazwa] != null) return root[nazwa]; } catch (e) { /* brak */ }
    try { var pak = root.VildaWzrostLMS; if (pak && pak[nazwa] != null) return pak[nazwa]; } catch (e) { /* brak */ }
    return null;
  }
  function ustawDane(obj) {
    dane = Object.assign({}, dane, obj || {});
  }

  /* ---------- statystyka: identyczna z app.js (Abramowitz–Stegun 7.1.26, Acklam) ---------- */
  function erf(x) {
    var t = x >= 0 ? 1 : -1;
    x = Math.abs(x);
    var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
    var p = 1 / (1 + 0.3275911 * x);
    var y = 1 - ((((a5 * p + a4) * p + a3) * p + a2) * p + a1) * p * Math.exp(-x * x);
    return t * y;
  }
  function normalCDF(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }
  function normInv(p) {
    if (typeof p !== 'number' || isNaN(p)) return NaN;
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
    var b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
    var c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
    var d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
    var lo = 0.02425, hi = 1 - lo, q, r;
    if (p < lo) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > hi) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function centylZSds(z) { return typeof z === 'number' && isFinite(z) ? normalCDF(z) * 100 : null; }
  function sdsZCentyla(p) { return typeof p === 'number' && p > 0 && p < 100 ? normInv(p / 100) : null; }

  /* ---------- wzór LMS i jego odwrotność ---------- */
  function zLms(x, lms) {
    if (!lms || typeof x !== 'number' || !isFinite(x) || x <= 0) return null;
    var L = lms[0], M = lms[1], S = lms[2];
    if (![L, M, S].every(function (v) { return typeof v === 'number' && isFinite(v); }) || M <= 0 || S <= 0) return null;
    return L !== 0 ? (Math.pow(x / M, L) - 1) / (L * S) : Math.log(x / M) / S;
  }
  function xLms(z, lms) {
    if (!lms || typeof z !== 'number' || !isFinite(z)) return null;
    var L = lms[0], M = lms[1], S = lms[2];
    return L !== 0 ? M * Math.pow(1 + L * S * z, 1 / L) : M * Math.exp(S * z);
  }

  /* Interpolacja liniowa L, M, S między sąsiednimi węzłami tablicy {mies: [L,M,S]}.
     Wiek ułamkowy; poza zakresem kluczy — null (żadnego cichego wiersza brzegowego). */
  function interpoluj(tablica, wiekMies) {
    if (!tablica || typeof wiekMies !== 'number' || !isFinite(wiekMies)) return null;
    var klucze = Object.keys(tablica).map(Number).filter(function (k) { return !isNaN(k); }).sort(function (a, b) { return a - b; });
    if (!klucze.length || wiekMies < klucze[0] || wiekMies > klucze[klucze.length - 1]) return null;
    var lo = klucze[0], hi = klucze[klucze.length - 1];
    for (var i = 0; i < klucze.length; i++) {
      if (klucze[i] <= wiekMies) lo = klucze[i];
      if (klucze[i] >= wiekMies) { hi = klucze[i]; break; }
    }
    var a = tablica[String(lo)], b = tablica[String(hi)];
    if (!a || !b) return null;
    if (lo === hi) return [a[0], a[1], a[2]];
    var f = (wiekMies - lo) / (hi - lo);
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])];
  }

  function tablicaLms(plec, wiekMies, siatka) {
    var m = plec === 'M';
    if (siatka === 'WHO') {
      if (wiekMies < G.OLAF_MIN_M) return dana(m ? 'LMS_INFANT_HEIGHT_BOYS' : 'LMS_INFANT_HEIGHT_GIRLS');
      return dana(m ? 'LMS_HEIGHT_WHO_BOYS' : 'LMS_HEIGHT_WHO_GIRLS');
    }
    if (siatka === 'OLAF') {
      if (wiekMies < G.OLAF_MIN_M) return null;
      return dana(m ? 'LMS_HEIGHT_BOYS' : 'LMS_HEIGHT_GIRLS');
    }
    if (siatka === 'DS') {
      if (wiekMies < G.DS_MIN_M || wiekMies > G.DS_MAX_M) return null;
      /* ta sama granica, co w karcie modułu DS: poniżej 2 lat długość niemowlęca, od 2 lat wzrost */
      if (wiekMies < G.DS_DZIECKO_M) return dana(m ? 'LMS_HEIGHT_DS_INFANT_BOYS' : 'LMS_HEIGHT_DS_INFANT_GIRLS');
      return dana(m ? 'LMS_HEIGHT_DS_BOYS' : 'LMS_HEIGHT_DS_GIRLS');
    }
    return null;
  }

  /* L, M, S wzrostu dla wieku na zadanej siatce (WHO / OLAF). Palczewska nie ma LMS → null.
     Wiek 35,5 mies. na WHO: interpolacja między wierszem 35 (niemowlęcym) a 36 (WHO 2007). */
  function lms(plec, wiekMies, siatka) {
    var s = String(siatka || '').toUpperCase();
    if (typeof wiekMies !== 'number' || !isFinite(wiekMies) || wiekMies < 0) return null;
    if (s === 'DS') return interpoluj(tablicaLms(plec, wiekMies, s), wiekMies);
    if (wiekMies > G.LMS_MAX_M) return null;
    if (s === 'WHO' && wiekMies > G.WHO_INFANT_MAX_M && wiekMies < G.OLAF_MIN_M) {
      var a = interpoluj(dana(plec === 'M' ? 'LMS_INFANT_HEIGHT_BOYS' : 'LMS_INFANT_HEIGHT_GIRLS'), G.WHO_INFANT_MAX_M);
      var b = interpoluj(dana(plec === 'M' ? 'LMS_HEIGHT_WHO_BOYS' : 'LMS_HEIGHT_WHO_GIRLS'), G.OLAF_MIN_M);
      if (!a || !b) return null;
      var f = wiekMies - G.WHO_INFANT_MAX_M;
      return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])];
    }
    return interpoluj(tablicaLms(plec, wiekMies, s), wiekMies);
  }

  /* ---------- Palczewska ---------- */
  function palCentyl(plec, wiekMies, centyl) {
    var f = dana('palCentyl');
    if (typeof f !== 'function') f = dana('getPalReferenceCentileInterpolated');
    if (typeof f !== 'function') return null;
    var v = f(plec, wiekMies, centyl, 'HT');
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  function wezlyPal(plec, wiekMies) {
    if (typeof wiekMies !== 'number' || !isFinite(wiekMies) || wiekMies < G.PAL_MIN_M || wiekMies > G.PAL_MAX_M) return null;
    var w = [];
    for (var i = 0; i < CENTYLE_PAL.length; i++) {
      var v = palCentyl(plec, wiekMies, CENTYLE_PAL[i]);
      if (v != null) w.push({ z: normInv(CENTYLE_PAL[i] / 100), x: v });
    }
    if (w.length < 2) return null;
    w.sort(function (a, b) { return a.x - b.x; });
    return w;
  }
  function zPal(x, w) {
    if (!w || typeof x !== 'number' || !isFinite(x) || x <= 0) return null;
    var n = w.length, a, b;
    if (x <= w[0].x) { a = w[0]; b = w[1]; }
    else if (x >= w[n - 1].x) { a = w[n - 2]; b = w[n - 1]; }
    else {
      for (var i = 0; i < n - 1; i++) if (x >= w[i].x && x <= w[i + 1].x) { a = w[i]; b = w[i + 1]; break; }
    }
    if (!a || !b || b.x === a.x) return null;
    return a.z + (x - a.x) * (b.z - a.z) / (b.x - a.x);
  }
  function xPal(z, w) {
    if (!w || typeof z !== 'number' || !isFinite(z)) return null;
    var n = w.length, a, b;
    if (z <= w[0].z) { a = w[0]; b = w[1]; }
    else if (z >= w[n - 1].z) { a = w[n - 2]; b = w[n - 1]; }
    else {
      for (var i = 0; i < n - 1; i++) if (z >= w[i].z && z <= w[i + 1].z) { a = w[i]; b = w[i + 1]; break; }
    }
    if (!a || !b || b.z === a.z) return null;
    return a.x + (z - a.z) * (b.x - a.x) / (b.z - a.z);
  }
  function medianaPal(plec, wiekMies) { return palCentyl(plec, wiekMies, 50); }

  /* ---------- reguła wyboru siatki ---------- */
  /* Populacja odniesienia — ta sama reguła i ten sam resolver, co w silniku BMI
     (vilda_ds_source.js wystawia window.VildaPopulacjaPacjenta). Jawna opcja wygrywa. */
  function normPopulacja(p) {
    return String(p || '').toUpperCase() === 'DS' ? 'DS' : 'OGOLNA';
  }
  function resolverPopulacji() {
    if (typeof dane.populacjaDomyslna === 'function') return dane.populacjaDomyslna;
    try { var f = root.VildaPopulacjaPacjenta; if (typeof f === 'function') return f; } catch (e) { /* brak resolvera */ }
    return null;
  }
  function populacjaZOpcji(o) {
    if (o && o.populacja != null) return normPopulacja(o.populacja);
    try {
      var f = resolverPopulacji();
      if (f) return normPopulacja(f());
    } catch (e) { /* resolver odmowil — populacja ogolna */ }
    return 'OGOLNA';
  }
  function maxWiek(populacja) {
    return normPopulacja(populacja) === 'DS' ? G.DS_MAX_M : G.PAL_MAX_M;
  }
  function powodDs(wiekMies) {
    if (typeof wiekMies !== 'number' || !isFinite(wiekMies)) return 'brak wieku dla siatki DS';
    if (wiekMies < G.DS_MIN_M) return 'siatka długości zespołu Downa zaczyna się od 1. miesiąca';
    return 'siatka zespołu Downa kończy się na 20 latach';
  }

  function normZrodlo(z) {
    var s = String(z || '').toUpperCase();
    return ZRODLA.indexOf(s) >= 0 ? s : 'OLAF';
  }

  /* Kolejność siatek do sprawdzenia dla zadanego źródła i wieku. Pierwsza z danymi wygrywa. */
  function kandydaci(zrodlo, wiekMies, populacja) {
    /* decyzja D2: przy DS nie ma łańcucha zastępczego — albo siatka DS, albo nic. */
    if (normPopulacja(populacja) === 'DS') return ['DS'];
    var z = normZrodlo(zrodlo);
    var noworodek = typeof wiekMies === 'number' && wiekMies < G.PAL_MIN_M;
    var maly = typeof wiekMies === 'number' && wiekMies < G.OLAF_MIN_M;
    if (z === 'PALCZEWSKA') return noworodek ? ['WHO', 'PALCZEWSKA', 'OLAF'] : ['PALCZEWSKA', 'WHO', 'OLAF'];
    if (z === 'OLAF') {
      if (noworodek) return ['WHO', 'PALCZEWSKA', 'OLAF'];
      if (maly) return ['PALCZEWSKA', 'WHO', 'OLAF'];
      return ['OLAF', 'PALCZEWSKA', 'WHO'];
    }
    return ['WHO', 'PALCZEWSKA', 'OLAF'];
  }

  function powodZmiany(zadane, uzyta, wiekMies) {
    if (!uzyta || zadane === uzyta) return '';
    if (typeof wiekMies === 'number' && wiekMies < G.PAL_MIN_M && uzyta === 'WHO') return 'noworodek poniżej 1. miesiąca — siatka Palczewskiej zaczyna się od 1. miesiąca, użyto WHO 2006';
    if (zadane === 'OLAF' && typeof wiekMies === 'number' && wiekMies < G.OLAF_MIN_M) return 'brak danych OLAF dla wieku poniżej 3 lat';
    if (typeof wiekMies === 'number' && wiekMies > G.LMS_MAX_M) return 'brak siatek ' + etykieta(zadane) + ' powyżej 18 lat';
    return 'brak danych ' + etykieta(zadane) + ' dla tego wieku';
  }
  function etykieta(z) {
    if (String(z || '').toUpperCase() === 'DS') return 'siatka DS (Zemel 2015)';
    var s = normZrodlo(z);
    return s === 'PALCZEWSKA' ? 'Palczewska' : s === 'WHO' ? 'WHO' : 'OLAF';
  }

  function wynikPusty(opts, powod) {
    return {
      wersja: WERSJA, sds: null, centyl: null, siatka: null,
      zrodloZadane: normZrodlo(opts && opts.zrodlo),
      populacja: normPopulacja(opts && opts.populacja), fallback: false, powod: powod || '',
      pozaZakresem: true, mediana: null, lms: null,
      wiekMies: opts ? opts.wiekMies : null, plec: opts ? opts.plec : null,
    };
  }

  /* SDS wzrostu na JEDNEJ, wskazanej siatce (bez łańcucha zastępczego). */
  function policzNaSiatce(opts) {
    var o = opts || {};
    var siatka = String(o.siatka || '').toUpperCase();
    var wiek = Number(o.wiekMies), x = Number(o.wzrost), plec = o.plec === 'M' ? 'M' : 'F';
    if (!isFinite(wiek) || wiek < 0 || !isFinite(x) || x <= 0 || SIATKI.indexOf(siatka) < 0) return null;
    var z, mediana, tab = null;
    if (siatka === 'PALCZEWSKA') {
      var w = wezlyPal(plec, wiek);
      if (!w) return null;
      z = zPal(x, w);
      mediana = medianaPal(plec, wiek);
    } else {
      tab = lms(plec, wiek, siatka);
      if (!tab) return null;
      z = zLms(x, tab);
      mediana = tab[1];
    }
    if (typeof z !== 'number' || !isFinite(z)) return null;
    return {
      wersja: WERSJA, sds: z, centyl: centylZSds(z), siatka: siatka,
      zrodloZadane: normZrodlo(o.zrodlo != null ? o.zrodlo : siatka),
      populacja: siatka === 'DS' ? 'DS' : normPopulacja(o.populacja), fallback: false, powod: '',
      pozaZakresem: false, mediana: mediana, lms: tab, wiekMies: wiek, plec: plec,
    };
  }

  /* SDS wzrostu z regułą wyboru siatki i jawnym łańcuchem zastępczym.
     opts: { wzrost (cm), plec ('M'|'F'), wiekMies (ułamkowe), zrodlo ('OLAF'|'WHO'|'PALCZEWSKA') } */
  function policz(opts) {
    var o = opts || {};
    var wiek = Number(o.wiekMies), x = Number(o.wzrost);
    var zadane = normZrodlo(o.zrodlo), pop = populacjaZOpcji(o);
    var baza = { zrodlo: zadane, populacja: pop, wiekMies: o.wiekMies, plec: o.plec };
    if (!isFinite(wiek) || wiek < 0) return wynikPusty(baza, 'brak wieku');
    if (!isFinite(x) || x <= 0) return wynikPusty(baza, 'brak wzrostu');
    if (wiek > maxWiek(pop)) return wynikPusty(baza, pop === 'DS' ? powodDs(wiek) : 'wiek poza zakresem siatek (powyżej 18,5 roku)');
    var lista = kandydaci(zadane, wiek, pop);
    for (var i = 0; i < lista.length; i++) {
      var r = policzNaSiatce({ wzrost: x, plec: o.plec, wiekMies: wiek, siatka: lista[i], zrodlo: zadane, populacja: pop });
      if (r) {
        r.fallback = pop !== 'DS' && lista[i] !== zadane;
        r.powod = pop === 'DS' ? '' : powodZmiany(zadane, lista[i], wiek);
        return r;
      }
    }
    return wynikPusty(baza, pop === 'DS' ? powodDs(wiek) : 'brak siatek wzrostu dla tego wieku');
  }

  /* Mediana wzrostu dla wieku na siatce wynikającej z tej samej reguły (np. normy w 18. r.ż.). */
  function mediana(plec, wiekMies, zrodlo, populacja) {
    var wiek = Number(wiekMies), p = plec === 'M' ? 'M' : 'F', pop = populacjaZOpcji({ populacja: populacja });
    if (!isFinite(wiek) || wiek < 0 || wiek > maxWiek(pop)) return null;
    var lista = kandydaci(zrodlo, wiek, pop);
    for (var i = 0; i < lista.length; i++) {
      var s = lista[i], m;
      if (s === 'PALCZEWSKA') m = wiek >= G.PAL_MIN_M ? medianaPal(p, wiek) : null;
      else { var t = lms(p, wiek, s); m = t ? t[1] : null; }
      if (typeof m === 'number' && isFinite(m) && m > 0) return { mediana: m, siatka: s, populacja: pop, fallback: pop !== 'DS' && s !== normZrodlo(zrodlo) };
    }
    return null;
  }

  /* Wzrost (cm) odpowiadający SDS na siatce wynikającej z tej samej reguły (odwrotność). */
  function wartoscDlaSds(opts) {
    var o = opts || {};
    var wiek = Number(o.wiekMies), z = Number(o.sds), plec = o.plec === 'M' ? 'M' : 'F';
    var pop = populacjaZOpcji(o);
    if (!isFinite(wiek) || wiek < 0 || !isFinite(z) || wiek > maxWiek(pop)) return null;
    var lista = o.siatka ? [String(o.siatka).toUpperCase()] : kandydaci(o.zrodlo, wiek, pop);
    for (var i = 0; i < lista.length; i++) {
      var s = lista[i], x;
      if (s === 'PALCZEWSKA') x = xPal(z, wezlyPal(plec, wiek));
      else x = xLms(z, lms(plec, wiek, s));
      if (typeof x === 'number' && isFinite(x)) return { wzrost: x, siatka: s, populacja: s === 'DS' ? 'DS' : 'OGOLNA', fallback: s !== 'DS' && s !== normZrodlo(o.zrodlo != null ? o.zrodlo : s) };
    }
    return null;
  }

  /* ---------- format ---------- */
  function fmtSds(z, miejsca) {
    if (typeof z !== 'number' || !isFinite(z)) return '—';
    var n = miejsca == null ? 2 : miejsca;
    var v = Math.round(z * Math.pow(10, n)) / Math.pow(10, n);
    var abs = Math.abs(v).toFixed(n).replace('.', ',');
    if (v === 0) return abs;
    return (v < 0 ? '−' : '+') + abs;
  }
  function fmtCentyl(p) {
    if (typeof p !== 'number' || !isFinite(p)) return '—';
    return p < 1 ? '<1' : p > 99 ? '>99' : String(Math.round(p));
  }
  function formatuj(model) {
    var m = model || {};
    var maSds = typeof m.sds === 'number' && isFinite(m.sds);
    return {
      etykieta: 'hSDS',
      sds: maSds ? fmtSds(m.sds) : '—',
      zdanie: maSds ? 'hSDS ' + fmtSds(m.sds) : '',
      centyl: maSds ? fmtCentyl(m.centyl) : '—',
      centylZdanie: maSds ? (m.centyl < 1 || m.centyl > 99 ? fmtCentyl(m.centyl) + '. centyla' : fmtCentyl(m.centyl) + '. centyl') : '',
      siatka: m.siatka ? etykieta(m.siatka) : '',
      fallback: !!m.fallback,
      powod: m.powod || '',
    };
  }

  root.VildaSdsWzrostu = Object.freeze({
    version: WERSJA, ZRODLA: ZRODLA.slice(), SIATKI: SIATKI.slice(), G: G, CENTYLE_PAL: CENTYLE_PAL.slice(),
    ustawDane: ustawDane, kandydaci: kandydaci, normPopulacja: normPopulacja, populacjaZOpcji: populacjaZOpcji, lms: lms, interpoluj: interpoluj,
    zLms: zLms, xLms: xLms, policz: policz, policzNaSiatce: policzNaSiatce, wartoscDlaSds: wartoscDlaSds, mediana: mediana,
    centylZSds: centylZSds, sdsZCentyla: sdsZCentyla, normalCDF: normalCDF, normInv: normInv,
    fmtSds: fmtSds, fmtCentyl: fmtCentyl, formatuj: formatuj, etykieta: etykieta,
  });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
