/*
 * vilda_masa.js (v1) — JEDYNE miejsce, w którym aplikacja liczy SDS (z-score), centyl
 * i WERDYKT MASY CIAŁA dla wieku. Wszyscy inni czytają, formatują i pokazują.
 *
 * P-MASA etap 1 (audyt werdyktów 2026-09-18, decyzja właściciela „ruszaj z 1 i 2").
 *
 * DLACZEGO TEN PLIK POWSTAŁ. Masa była jedyną z czterech miar antropometrycznych bez
 * silnika: wzrost ma vilda_sds_wzrostu.js, BMI ma vilda_bmi.js, tempo ma
 * vilda_tempo_wzrastania.js, a masa nie miała nic. Skutek zmierzony w audycie: każdy ekran
 * liczył jej werdykt po swojemu, z własnym pasmem normy — karta główna milczała w paśmie
 * 10–97, Karta pacjenta i moduł trajektorii używały 10–90, tabela porównania 10–90 z ostrym
 * progiem 97, a raport PDF 10–90 z progiem 97 liczonym z centyla ZAOKRĄGLONEGO przed
 * porównaniem. Ten sam pacjent dostawał więc różne werdykty w zależności od tego, na który
 * element ekranu lekarz patrzył.
 *
 * Moment powstania długu jest w kodzie widoczny: app.js, czytnik tablic LMS, niesie komentarz
 * „P-SDS-5: tablice wzrostu czyta wylacznie silnik (VildaSdsWzrostu.lms); tu zostaje masa."
 * — wzrost przeniesiono za silnik, masę świadomie zostawiono. Ten moduł to domyka.
 *
 * REGUŁY (te same, co w silniku wzrostu — celowo, żeby obie miary nie rozjeżdżały się co do
 * siatki ani co do wieku):
 *  1. Wiek jest UŁAMKOWY w miesiącach i taki trafia do interpolacji.
 *  2. Źródło OLAF: tablice OLAF od 36. do 216. miesiąca.
 *  3. Źródło WHO: 0–35 mies. WHO 2006 (tablice niemowlęce), 36–120 mies. WHO 2007. Powyżej
 *     120 mies. WHO nie ma masy dla wieku — i tu NIE ma cichego zejścia na OLAF bez powodu;
 *     zamiana siatki zawsze niesie `fallback` i `powod`.
 *  4. Źródło PALCZEWSKA: siatka publikuje centyle, nie LMS — centyl bierzemy z podanej
 *     funkcji `palCentyl` (app.js → getPLWeightCentile), która obejmuje 0–36 mies.
 *  5. Populacja DS (zespół Downa): albo tablica DS, albo nic — bez łańcucha zastępczego,
 *     ta sama decyzja D2, co w vilda_bmi.js i vilda_sds_wzrostu.js.
 *  6. Poza zakresem siatek wynik to null z powodem — nigdy cicha wartość z ostatniego wiersza.
 *
 * PROGI WERDYKTU (3 / 10 / 90 / 97 centyla) nie są nowym pomysłem: to pasma, których używa
 * już większość powierzchni aplikacji, i te same liczby, które app.js trzyma jako
 * PERCENTILE_EXTREME_LOW = 3 i PERCENTILE_EXTREME_HIGH = 97. Ujednolicenie polega na tym, że
 * odtąd jest JEDNA tablica, a nie pięć kopii. Pasmo ciszy karty głównej (10–97) jest z nimi
 * niezgodne i jego los jest osobną decyzją właściciela — ten moduł go nie przesądza.
 *
 * WZÓR LMS: z = ((x/M)^L − 1)/(L·S), a dla L = 0: z = ln(x/M)/S (Cole & Green 1992).
 * Statystyka (erf, normInv) jest przepisana z vilda_sds_wzrostu.js CO DO ZNAKU, żeby centyl
 * masy i centyl wzrostu liczyły się tą samą drogą.
 *
 * DANE: tablice LMS masy (LMS_WEIGHT_*, LMS_WEIGHT_WHO_*, LMS_INFANT_WEIGHT_*) mieszkają
 * w app.js i są wystawiane pakietem window.VildaMasaLMS; tablice DS przez window.VildaDsLMS.
 * Moduł nie zna DOM ani sejfu; dane bierze leniwie, a testy podają je przez ustawDane().
 */
(function (root) {
  'use strict';
  if (!root) return;

  var WERSJA = 1;
  var ZRODLA = ['PALCZEWSKA', 'OLAF', 'WHO'];
  var SIATKI = ['PALCZEWSKA', 'OLAF', 'WHO', 'DS'];

  var G = Object.freeze({
    OLAF_MIN_M: 36,
    OLAF_MAX_M: 216,
    WHO_INFANT_MAX_M: 35,
    WHO_MAX_M: 120,
    PAL_MIN_M: 0,
    PAL_MAX_M: 36,
    DS_MIN_M: 1,
    DS_DZIECKO_M: 24,
    DS_MAX_M: 240,
  });

  /* JEDNA tablica progów werdyktu o masie dla wieku. Zmiana którejkolwiek liczby zmienia
     werdykt WSZĘDZIE — i o to chodzi. */
  var PROGI = Object.freeze({ NIEDOBOR: 3, NISKA: 10, PODWYZSZONA: 90, WYSOKA: 97 });

  var BRAK_KLASYFIKACJI = 'Brak klasyfikacji — brak danych referencyjnych dla masy';
  var NOTA_DS = 'Siatka zespołu Downa — centyl nie znaczy tego samego, co centyl populacyjny.';

  var dane = {};
  function ustawDane(obj) { dane = Object.assign({}, dane, obj || {}); }

  function pakiet(nazwa) {
    try { if (dane[nazwa] != null) return dane[nazwa]; } catch (e) { /* brak */ }
    try { var p = root.VildaMasaLMS; if (p && p[nazwa] != null) return p[nazwa]; } catch (e) { /* brak */ }
    return null;
  }

  function liczba(v) { return typeof v === 'number' && isFinite(v) ? v : NaN; }

  /* ---------- statystyka: identyczna z vilda_sds_wzrostu.js ---------- */
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
    var pl = 0.02425, ph = 1 - pl, q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > ph) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function centylZSds(z) { return typeof z === 'number' && isFinite(z) ? normalCDF(z) * 100 : null; }
  function sdsZCentyla(p) { return typeof p === 'number' && p > 0 && p < 100 ? normInv(p / 100) : null; }

  /* ---------- wzór LMS ---------- */
  function zLms(x, lmsRow) {
    if (!lmsRow || typeof x !== 'number' || !isFinite(x) || x <= 0) return null;
    var L = lmsRow[0], M = lmsRow[1], S = lmsRow[2];
    if (![L, M, S].every(function (v) { return typeof v === 'number' && isFinite(v); }) || M <= 0 || S <= 0) return null;
    return L !== 0 ? (Math.pow(x / M, L) - 1) / (L * S) : Math.log(x / M) / S;
  }
  function xLms(z, lmsRow) {
    if (!lmsRow || typeof z !== 'number' || !isFinite(z)) return null;
    var L = lmsRow[0], M = lmsRow[1], S = lmsRow[2];
    if (![L, M, S].every(function (v) { return typeof v === 'number' && isFinite(v); })) return null;
    return L !== 0 ? M * Math.pow(1 + L * S * z, 1 / L) : M * Math.exp(S * z);
  }

  function interpoluj(tablica, wiekMies) {
    if (!tablica || typeof wiekMies !== 'number' || !isFinite(wiekMies)) return null;
    var klucze = Object.keys(tablica).map(Number).filter(function (k) { return !isNaN(k); }).sort(function (a, b) { return a - b; });
    if (!klucze.length || wiekMies < klucze[0] || wiekMies > klucze[klucze.length - 1]) return null;
    var lo = klucze[0], hi = klucze[klucze.length - 1], i;
    for (i = 0; i < klucze.length; i++) {
      if (klucze[i] <= wiekMies) lo = klucze[i];
      if (klucze[i] >= wiekMies) { hi = klucze[i]; break; }
    }
    var a = tablica[String(lo)] || tablica[lo], b = tablica[String(hi)] || tablica[hi];
    if (!a || !b) return null;
    if (lo === hi) return a.slice ? a.slice() : [a[0], a[1], a[2]];
    var t = (wiekMies - lo) / (hi - lo);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function normZrodlo(z) {
    var s = String(z || '').toUpperCase();
    return ZRODLA.indexOf(s) >= 0 ? s : 'OLAF';
  }
  function normPopulacja(p) {
    var s = String(p || '').toUpperCase();
    return s === 'DS' ? 'DS' : 'OGOLNA';
  }
  function populacjaZOpcji(o) {
    var jawna = o && o.populacja;
    if (jawna) return normPopulacja(jawna);
    try {
      if (typeof root.vildaPopulacjaDs === 'function' && root.vildaPopulacjaDs()) return 'DS';
    } catch (e) { /* brak */ }
    return 'OGOLNA';
  }

  /* Tablica LMS masy dla podanej siatki, płci i wieku. */
  function lms(plec, wiekMies, siatka, populacja) {
    var m = liczba(wiekMies);
    if (!isFinite(m) || m < 0) return null;
    var chlopiec = String(plec || '').toUpperCase() === 'M';
    var s = String(siatka || '').toUpperCase();
    if (normPopulacja(populacja) === 'DS' || s === 'DS') {
      if (m < G.DS_MIN_M || m > G.DS_MAX_M) return null;
      var ds;
      try {
        var pak = root.VildaDsLMS || dane.VildaDsLMS;
        var grupa = m < G.DS_DZIECKO_M ? 'NIEMOWLE' : 'DZIECKO';
        ds = pak && pak[grupa] && pak[grupa].WT ? pak[grupa].WT[chlopiec ? 'M' : 'F'] : null;
      } catch (e) { ds = null; }
      return ds ? interpoluj(ds, m) : null;
    }
    if (s === 'OLAF') {
      if (m < G.OLAF_MIN_M || m > G.OLAF_MAX_M) return null;
      return interpoluj(pakiet(chlopiec ? 'LMS_WEIGHT_OLAF_BOYS' : 'LMS_WEIGHT_OLAF_GIRLS'), m);
    }
    if (s === 'WHO') {
      if (m <= G.WHO_INFANT_MAX_M) return interpoluj(pakiet(chlopiec ? 'LMS_WEIGHT_WHO_INFANT_BOYS' : 'LMS_WEIGHT_WHO_INFANT_GIRLS'), m);
      if (m > G.WHO_MAX_M) return null;
      return interpoluj(pakiet(chlopiec ? 'LMS_WEIGHT_WHO_BOYS' : 'LMS_WEIGHT_WHO_GIRLS'), m);
    }
    return null;
  }

  /* Kolejność siatek do wypróbowania. Przy DS — bez łańcucha (decyzja D2). */
  function kandydaci(zrodlo, wiekMies, populacja) {
    if (normPopulacja(populacja) === 'DS') return ['DS'];
    var z = normZrodlo(zrodlo);
    var maly = typeof wiekMies === 'number' && wiekMies < G.OLAF_MIN_M;
    if (z === 'PALCZEWSKA') return maly ? ['PALCZEWSKA', 'WHO', 'OLAF'] : ['OLAF', 'WHO'];
    if (z === 'WHO') return ['WHO', 'OLAF'];
    return maly ? ['PALCZEWSKA', 'WHO', 'OLAF'] : ['OLAF', 'WHO'];
  }

  function powodZmiany(zadane, uzyte, wiekMies) {
    if (zadane === uzyte) return '';
    if (uzyte === 'PALCZEWSKA') return 'OLAF nie ma masy poniżej 3. roku życia — użyto siatki Palczewskiej.';
    if (zadane === 'WHO' && uzyte === 'OLAF') return 'WHO nie ma masy dla wieku powyżej 10 lat — użyto siatki OLAF.';
    if (uzyte === 'WHO') return 'Wiek poza zakresem siatki OLAF — użyto siatki WHO.';
    return 'Zadana siatka nie ma danych dla tego wieku — użyto siatki zastępczej.';
  }

  function pusty(baza, powod) {
    return Object.assign({ sds: null, centyl: null, siatka: null, fallback: false, powod: powod || '' }, baza || {});
  }

  function policzNaSiatce(opts) {
    var o = opts || {};
    var wiek = liczba(o.wiekMies), masa = liczba(o.masaKg);
    var siatka = String(o.siatka || '').toUpperCase();
    if (!isFinite(wiek) || !isFinite(masa) || masa <= 0) return null;
    if (siatka === 'PALCZEWSKA') {
      var f = dane.palCentyl || (typeof root.getPLWeightCentile === 'function' ? root.getPLWeightCentile : null);
      if (typeof f !== 'function' || wiek > G.PAL_MAX_M) return null;
      var c;
      try { c = f(String(o.plec || '').toUpperCase() === 'M' ? 'M' : 'F', wiek, masa); } catch (e) { c = null; }
      if (typeof c !== 'number' || !isFinite(c)) return null;
      return { sds: sdsZCentyla(c), centyl: c, siatka: 'PALCZEWSKA', fallback: false, powod: '' };
    }
    var row = lms(o.plec, wiek, siatka, o.populacja);
    if (!row) return null;
    var z = zLms(masa, row);
    if (z == null) return null;
    return { sds: z, centyl: centylZSds(z), siatka: siatka, fallback: false, powod: '' };
  }

  function policz(opts) {
    var o = opts || {};
    var wiek = liczba(o.wiekMies), masa = liczba(o.masaKg);
    var zadane = normZrodlo(o.zrodlo), pop = populacjaZOpcji(o);
    var baza = { masaKg: isFinite(masa) ? masa : null, zrodloZadane: zadane, populacja: pop, wiekMies: isFinite(wiek) ? wiek : null, plec: String(o.plec || '').toUpperCase() === 'M' ? 'M' : 'F' };
    if (!isFinite(wiek) || wiek < 0) return pusty(baza, 'brak wieku');
    if (!isFinite(masa) || masa <= 0) return pusty(baza, 'brak masy ciała');
    var lista = kandydaci(zadane, wiek, pop), i;
    for (i = 0; i < lista.length; i++) {
      var r = policzNaSiatce({ wiekMies: wiek, plec: baza.plec, masaKg: masa, siatka: lista[i], populacja: pop });
      if (r) {
        r.fallback = pop !== 'DS' && lista[i] !== zadane;
        r.powod = pop === 'DS' ? '' : powodZmiany(zadane, lista[i], wiek);
        return Object.assign({}, baza, r);
      }
    }
    return pusty(baza, pop === 'DS' ? 'brak siatki masy dla zespołu Downa w tym wieku' : 'wiek poza zakresem siatek masy');
  }

  /* ---------- JEDEN werdykt ---------- */
  function kategoria(centyl) {
    var c = liczba(centyl);
    if (!isFinite(c)) return { etykieta: BRAK_KLASYFIKACJI, klucz: 'brak', kolor: null };
    if (c < PROGI.NIEDOBOR) return { etykieta: 'Niedobór masy ciała', klucz: 'niedobor', kolor: 'alert' };
    if (c < PROGI.NISKA) return { etykieta: 'Masa poniżej typowego zakresu dla wieku', klucz: 'niska', kolor: 'improve' };
    if (c < PROGI.PODWYZSZONA) return { etykieta: 'Masa w typowym zakresie dla wieku', klucz: 'typowa', kolor: 'ok' };
    if (c < PROGI.WYSOKA) return { etykieta: 'Masa powyżej typowego zakresu dla wieku', klucz: 'podwyzszona', kolor: 'improve' };
    return { etykieta: 'Masa wyraźnie powyżej typowego zakresu dla wieku', klucz: 'wysoka', kolor: 'alert' };
  }

  /* ---------- P-MASA punkt 2: dlaczego masa i BMI mówią co innego ----------
   * Aplikacja ma cztery gotowe akapity „Dlaczego…" dla pary BMI↔wskaźnik Cole'a i ani jednego
   * dla pary masa↔BMI — a to właśnie ta para rozjeżdża się codziennie i to ona była powodem
   * tej raty. Rozjazd NIE jest usterką rachunku: centyl masy odnosi masę do WIEKU, a BMI do
   * WZROSTU. U dziecka niższego od rówieśników ta sama masa daje wyższe BMI i tak ma być.
   * Wadą było milczenie o tym, nie sam rozjazd — dlatego zdanie pojawia się WYŁĄCZNIE wtedy,
   * gdy oba werdykty faktycznie wskazują w różne strony, i nigdy nie podważa żadnego z nich. */
  function kierunek(klucz) {
    if (klucz === 'niedobor' || klucz === 'niska') return -1;
    if (klucz === 'podwyzszona' || klucz === 'wysoka') return 1;
    return 0;
  }
  function kierunekBmi(kat) {
    var k = String((kat && (kat.klucz || kat)) || '').toLowerCase();
    if (k.indexOf('niedowag') >= 0) return -1;
    if (k.indexOf('nadwag') >= 0 || k.indexOf('otylosc') >= 0 || k.indexOf('otyłość') >= 0 || k.indexOf('olbrzymia') >= 0) return 1;
    if (k === 'prawidlowe' || k === 'prawidłowe') return 0;
    return null;
  }

  function wyjasnienieWzgledemBmi(opts) {
    var o = opts || {};
    var km = kierunek((o.kategoriaMasy && o.kategoriaMasy.klucz) || kategoria(o.centylMasy).klucz);
    var kb = kierunekBmi(o.kategoriaBmi);
    if (kb == null) return { rozne: false, zdanie: '' };
    if (km === kb) return { rozne: false, zdanie: '' };
    var wspolne = 'Masa ciała i BMI oceniają co innego: centyl masy odnosi masę do WIEKU dziecka, a BMI — do jego WZROSTU.';
    if (kb > km) {
      return {
        rozne: true,
        zdanie: wspolne + ' Dlatego u dziecka niższego od rówieśników ta sama masa daje wyższe BMI — masa może być w typowym zakresie dla wieku, a BMI już powyżej niego. Oba werdykty są poprawne i nie znoszą się nawzajem.',
      };
    }
    return {
      rozne: true,
      zdanie: wspolne + ' Dlatego u dziecka wyższego od rówieśników ta sama masa daje niższe BMI — masa może być powyżej typowego zakresu dla wieku, a BMI mieścić się w normie. Oba werdykty są poprawne i nie znoszą się nawzajem.',
    };
  }

  /* ---------- format (ten sam, co przy wzroście) ---------- */
  function fmtSds(z) {
    if (typeof z !== 'number' || !isFinite(z)) return '—';
    var s = Math.abs(z).toFixed(2).replace('.', ',');
    return (z < 0 ? '−' : '+') + s;
  }
  function fmtCentyl(p) {
    if (typeof p !== 'number' || !isFinite(p)) return '—';
    return p < 1 ? '<1' : p > 99 ? '>99' : String(Math.round(p));
  }
  function formatuj(model) {
    var m = model || {};
    var maSds = typeof m.sds === 'number' && isFinite(m.sds);
    var kat = kategoria(m.centyl);
    return {
      etykieta: 'wSDS',
      sds: maSds ? fmtSds(m.sds) : '—',
      zdanie: maSds ? 'wSDS ' + fmtSds(m.sds) : '',
      centyl: maSds ? fmtCentyl(m.centyl) : '—',
      kategoria: kat.etykieta,
      klucz: kat.klucz,
      kolor: kat.kolor,
      siatkaNota: m.siatka === 'DS' ? NOTA_DS : '',
      fallback: !!m.fallback,
      powod: m.powod || '',
    };
  }

  root.VildaMasa = Object.freeze({
    version: WERSJA, ZRODLA: ZRODLA.slice(), SIATKI: SIATKI.slice(), G: G, PROGI: PROGI,
    BRAK_KLASYFIKACJI: BRAK_KLASYFIKACJI, NOTA_DS: NOTA_DS,
    ustawDane: ustawDane, normZrodlo: normZrodlo, normPopulacja: normPopulacja, populacjaZOpcji: populacjaZOpcji,
    lms: lms, interpoluj: interpoluj, zLms: zLms, xLms: xLms, kandydaci: kandydaci,
    policz: policz, policzNaSiatce: policzNaSiatce,
    kategoria: kategoria, wyjasnienieWzgledemBmi: wyjasnienieWzgledemBmi,
    centylZSds: centylZSds, sdsZCentyla: sdsZCentyla, normalCDF: normalCDF, normInv: normInv,
    fmtSds: fmtSds, fmtCentyl: fmtCentyl, formatuj: formatuj,
  });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
