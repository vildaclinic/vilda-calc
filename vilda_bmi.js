/*
 * vilda_bmi.js (v1) — JEDYNE miejsce, w którym aplikacja liczy BMI, BMI-SDS (z-score), centyl BMI,
 * kategorię BMI, wskaźnik Cole'a i cel „normy" BMI. Wszyscy inni czytają, formatują i pokazują.
 *
 * P-BMI etap 1 (audyt 2026-09-16 — docs/clinical/AUDYT-BMI.md; decyzje właściciela 2026-09-16:
 * „akceptuję wszystkie rekomendacje"). Dotąd wzór BMI żył w ~40 kopiach w 17 plikach, SDS/centyl
 * szedł pięcioma drogami (bmiZscore/getLMS z cichym przejściem na WHO poza 36–216 mies. przy OLAF,
 * łańcuch historii, Palczewska, karta główna z własną regułą, własne LMS w modułach), a kategorię
 * rozstrzygało co najmniej dziewięć zestawów progów. Ten moduł zamyka regułę w jednym miejscu.
 *
 * REGUŁY (decyzje właściciela, numeracja jak w §5 audytu):
 *  1. Źródło OLAF: od 36. do 216. miesiąca siatki OLAF (LMS); poniżej 3 lat — siatka
 *     Palczewskiej (spójnie ze wzrostem, P-SDS-1); WHO 2006 tylko dla źródła WHO.
 *  2. Powyżej 216 mies. przy OLAF — jawny łańcuch zastępczy Palczewska (do 222 mies.) → WHO 2007
 *     (do 228 mies.), z powodem w wyniku; nigdy cicha zmiana siatki.
 *  3. Niedowaga dziecka: centyl < 5 (kanon BMI-TONORM-S1). Kolor: ostrzeżenie < 5, alarm < 3.
 *  4. „Otyłość olbrzymia": BMI-SDS ≥ 3 i wiek ≥ 60 mies. Przy nieznanym wieku bramka nie blokuje
 *     (kontrakt resolvera 8O-10b, test TONORM-S3-SEVERE-LABEL) — konsumenci rdzenia wiek podają.
 *  5. Granica dziecko/dorosły dla BMI: 18 lat (216 mies.). Od 216 mies. kategoria dorosła
 *     (18,5 / 25 / 30 / 35 / 40), SDS i centyl nadal liczone informacyjnie, dopóki są siatki.
 *  6. Dorośli: norma < 25 (klasyfikacja); cel „normy" do redukcji = 24,9 (liczba, nie kategoria).
 *  8. Wiek jest UŁAMKOWY w miesiącach i tak trafia do interpolacji L/M/S (DOB-AGE-4 także dla BMI).
 * 10. Format: „BMI 17,3 kg/m²", „bmiSDS +1,20" (2 miejsca, znak, przecinek), centyl wg ADV-REPORT-5.
 * 12. POPULACJA (P-DS-1, decyzje D1–D3): zespół Downa to cecha PACJENTA, nie wybór siatki. Gdy
 *     populacja = 'DS', BMI liczy się WYŁĄCZNIE na siatce DS (Zemel 2015) — bez cichego zejścia na
 *     OLAF/WHO/Palczewską; poza zakresem siatki DS (poniżej 2 lat, powyżej 20 lat) wynik jest pusty
 *     z jawnym powodem. Poniżej 2 lat BMI zastępuje masa do długości (WFL DS) poza tym modułem.
 *     Granica dorosłości dla DS to 20 lat (240 mies.), nie 18 — siatki DS sięgają 20 lat i centyl
 *     DS niesie więcej niż próg dorosłego (decyzja D3).
 *     P-DS-4: populacja jest AMBIENTNA tak samo jak źródło siatek (`bmiSource`) — konsument, który
 *     opisuje wczytanego pacjenta, nie musi jej podawać. Aplikacja wstrzykuje resolver przez
 *     ustawDane({populacjaDomyslna}) i to on (vilda_ds_source.js) odpowiada, czy pacjent ma DS.
 *     Jawne `populacja` w opcjach ZAWSZE wygrywa — i tak właśnie moduły liczące dla KOGOŚ INNEGO
 *     niż wczytany pacjent (wsad XLSX) wypisują się z reguły, podając 'OGOLNA'.
 *
 * SIATKI: OLAF BMI 36–216 mies. (tablice OLAF_LMS_* z app.js), WHO 2006 0–60 mies. (LMS_INFANT_*),
 * WHO 2006/2007 24–228 mies. (LMS_BOYS/GIRLS; powyżej 60. mies. czytamy stąd), Palczewska 1–222 mies.
 * (centyle 3/10/25/50/75/90/97 przez interpolator vilda_centile_interpolation.js; z liczymy
 * interpolacją liniową między z-wartościami sąsiednich centyli, jak dla wzrostu). Dane wystawia
 * app.js pakietem window.VildaBmiLMS (CSP zakazuje eval), testy podają je przez ustawDane().
 *
 * WZÓR LMS: z = ((x/M)^L − 1)/(L·S), dla L = 0: z = ln(x/M)/S (Cole & Green 1992). Statystyka
 * (erf A&S 7.1.26, Acklam) identyczna z vilda_sds_wzrostu.js — do wyniesienia do wspólnego
 * modułu w etapie 5.
 *
 * WSKAŹNIK COLE'A: BMI / mediana BMI dla wieku i płci × 100 z tej samej siatki, co SDS
 * (p50 Palczewskiej przy Palczewskiej); progi 90 / 110 / 120.
 * CEL NORMY: dziecko — 85. centyl (z = 1,036, ENERGY-CHILD-MID2), dorosły — 24,9.
 * ŹRÓDŁA TABLIC (P-BMI-5, decyzja 11; cytowania zweryfikowane w PubMed 2026-09-16):
 *  - OLAF (BMI 36–216 mies., LMS): Kułaga Z i wsp. „Polish 2010 growth references for school-aged
 *    children and adolescents", Eur J Pediatr 2011;170(5):599–609, PMID 20972688,
 *    DOI 10.1007/s00431-010-1329-x — dzieci szkolne 7–18 lat (OLAF); 3–6 lat: Kułaga Z i wsp.
 *    „Polish 2012 growth references for preschool children", Eur J Pediatr 2013;172(6):753–761,
 *    PMID 23371392, DOI 10.1007/s00431-013-1954-2 (OLA).
 *  - WHO 2006 (BMI 0–60 mies., LMS): WHO Multicentre Growth Reference Study Group, „WHO Child Growth
 *    Standards based on length/height, weight and age", Acta Paediatr Suppl 2006;450:76–85,
 *    PMID 16817681, DOI 10.1111/j.1651-2227.2006.tb02378.x.
 *  - WHO 2007 (BMI 61–228 mies., LMS): de Onis M i wsp. „Development of a WHO growth reference for
 *    school-aged children and adolescents", Bull World Health Organ 2007;85(9):660–667,
 *    PMID 18026621, DOI 10.2471/blt.07.043497.
 *  - Zespół Downa (BMI 24–240 mies., LMS): Zemel BS, Pipan M, Stallings VA i wsp. „Growth Charts
 *    for Children With Down Syndrome in the United States", Pediatrics 2015;136(5):e1204–e1211,
 *    PMID 26504127, DOI 10.1542/peds.2015-1652 (siatki DSGS/AAP; tablice w ds_lms.js, klucze
 *    przeliczone na miesiące w app.js, żeby wszystkie siatki silnika miały tę samą oś wieku).
 *  - Palczewska (centyle 3–97 BMI, 1–222 mies.): Palczewska I, Niedźwiecka Z. „Wskaźniki rozwoju
 *    somatycznego dzieci i młodzieży warszawskiej", Med Wieku Rozwoj 2001;5(2 Supl. 1):18–118,
 *    PMID 11675534 (bez DOI w PubMed).
 *  Wartości tablic w app.js / vilda_growth_reference_data.js / centile_data.js — kotwice spójności
 *  między tablicami pilnuje tests/unit/bmi-straznik.test.mjs.
 *
 * Moduł nie ma zależności od DOM ani od eval.
 */
(function (root) {
  'use strict';
  if (!root) return;

  var WERSJA = 1;
  var ZRODLA = ['PALCZEWSKA', 'OLAF', 'WHO'];
  /* P-DS-1: siatki, na których silnik umie liczyć. DS nie jest wyborem użytkownika (bmiSource),
     tylko skutkiem populacji pacjenta — dlatego stoi obok ZRODLA, a nie w nich. */
  var SIATKI = ['PALCZEWSKA', 'OLAF', 'WHO', 'DS'];
  var G = Object.freeze({
    OLAF_MIN_M: 36,        // OLAF BMI od 3. roku życia
    OLAF_MAX_M: 216,       // OLAF BMI do 18 lat
    WHO_INFANT_MAX_M: 60,  // WHO 2006 BMI 0–60 mies.
    WHO_MAX_M: 228,        // WHO 2007 BMI do 19 lat
    PAL_MIN_M: 1,          // Palczewska od 1. miesiąca
    PAL_MAX_M: 222,        // Palczewska do 18,5 roku
    DOROSLY_M: 216,        // decyzja 5: dorosły od 18 lat
    OLBRZYMIA_MIN_M: 60,   // decyzja 4
    Z_P85: 1.036,          // cel normy dziecka (ENERGY-CHILD-MID2, jak Z85 w app.js)
    DS_MIN_M: 24,          // siatka BMI DS od 2 lat (poniżej: masa do długości WFL DS)
    DS_MAX_M: 240,         // siatka DS do 20 lat; decyzja D3: do tego wieku DS wygrywa z progiem dorosłego
  });
  var PROGI = Object.freeze({
    DZIECKO: Object.freeze({ NIEDOWAGA: 5, NADWAGA: 85, OTYLOSC: 97, OLBRZYMIA_SDS: 3, ALARM_NISKI: 3 }),
    DOROSLY: Object.freeze({ NIEDOWAGA: 18.5, NADWAGA: 25, OTYLOSC_1: 30, OTYLOSC_2: 35, OTYLOSC_3: 40, CEL: 24.9 }),
    COLE: Object.freeze({ NIEDOWAGA: 90, NADWAGA: 110, OTYLOSC: 120 }),
  });
  var BRAK_KLASYFIKACJI = 'Brak klasyfikacji pediatrycznej — brak danych referencyjnych';
  var CENTYLE_PAL = [3, 10, 25, 50, 75, 90, 97];
  /* Jedno brzmienie noty o siatce DS dla wszystkich wyjść (decyzja D4). */
  var NOTA_DS = 'wg siatki dla zespołu Downa (Zemel 2015)';

  var dane = {};
  function dana(nazwa) {
    if (Object.prototype.hasOwnProperty.call(dane, nazwa)) return dane[nazwa];
    try { var pak = root.VildaBmiLMS; if (pak && pak[nazwa] != null) return pak[nazwa]; } catch (e) { /* brak */ }
    try { if (root[nazwa] != null) return root[nazwa]; } catch (e) { /* brak */ }
    return null;
  }
  function ustawDane(obj) { dane = Object.assign({}, dane, obj || {}); }

  /* ---------- statystyka: identyczna z app.js i vilda_sds_wzrostu.js ---------- */
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
    if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var pl = 0.02425, ph = 1 - pl, q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > ph) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function centylZSds(z) { return typeof z === 'number' && isFinite(z) ? normalCDF(z) * 100 : null; }
  function sdsZCentyla(p) { return typeof p === 'number' && p > 0 && p < 100 ? normInv(p / 100) : null; }

  /* ---------- wzór BMI ---------- */
  function bmi(opts) {
    var o = opts || {};
    var m = Number(o.masaKg), h = Number(o.wzrostCm);
    if (!isFinite(m) || m <= 0 || !isFinite(h) || h <= 0) return null;
    var v = m / Math.pow(h / 100, 2);
    return isFinite(v) ? v : null;
  }

  /* ---------- LMS ---------- */
  function zLms(x, lmsRow) {
    if (!lmsRow || typeof x !== 'number' || !isFinite(x) || x <= 0) return null;
    var L = lmsRow[0], M = lmsRow[1], S = lmsRow[2];
    if (![L, M, S].every(function (v) { return typeof v === 'number' && isFinite(v); }) || M <= 0 || S <= 0) return null;
    return L !== 0 ? (Math.pow(x / M, L) - 1) / (L * S) : Math.log(x / M) / S;
  }
  function xLms(z, lmsRow) {
    if (!lmsRow || typeof z !== 'number' || !isFinite(z)) return null;
    var L = lmsRow[0], M = lmsRow[1], S = lmsRow[2];
    var v = L !== 0 ? M * Math.pow(1 + L * S * z, 1 / L) : M * Math.exp(S * z);
    return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
  }
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
      if (wiekMies <= G.WHO_INFANT_MAX_M) return dana(m ? 'LMS_BMI_WHO_INFANT_BOYS' : 'LMS_BMI_WHO_INFANT_GIRLS');
      return dana(m ? 'LMS_BMI_WHO_BOYS' : 'LMS_BMI_WHO_GIRLS');
    }
    if (siatka === 'OLAF') {
      if (wiekMies < G.OLAF_MIN_M || wiekMies > G.OLAF_MAX_M) return null;
      return dana(m ? 'LMS_BMI_OLAF_BOYS' : 'LMS_BMI_OLAF_GIRLS');
    }
    if (siatka === 'DS') {
      if (wiekMies < G.DS_MIN_M || wiekMies > G.DS_MAX_M) return null;
      return dana(m ? 'LMS_BMI_DS_BOYS' : 'LMS_BMI_DS_GIRLS');
    }
    return null;
  }
  /* L, M, S BMI dla wieku ułamkowego na zadanej siatce (WHO / OLAF); Palczewska nie ma LMS → null. */
  function lms(plec, wiekMies, siatka) {
    var s = String(siatka || '').toUpperCase();
    if (typeof wiekMies !== 'number' || !isFinite(wiekMies) || wiekMies < 0) return null;
    if (s === 'WHO' && wiekMies > G.WHO_MAX_M) return null;
    return interpoluj(tablicaLms(plec === 'M' ? 'M' : 'F', wiekMies, s), wiekMies);
  }

  /* ---------- Palczewska ---------- */
  function palCentyl(plec, wiekMies, centyl) {
    var f = dana('palCentyl');
    if (typeof f !== 'function') f = dana('getPalReferenceCentileInterpolated');
    if (typeof f !== 'function') return null;
    var v;
    try { v = f(plec, wiekMies, centyl, 'BMI'); } catch (e) { return null; }
    return typeof v === 'number' && isFinite(v) && v > 0 ? v : null;
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
    else { for (var i = 0; i < n - 1; i++) if (x >= w[i].x && x <= w[i + 1].x) { a = w[i]; b = w[i + 1]; break; } }
    if (!a || !b || b.x === a.x) return null;
    return a.z + (x - a.x) * (b.z - a.z) / (b.x - a.x);
  }
  function xPal(z, w) {
    if (!w || typeof z !== 'number' || !isFinite(z)) return null;
    var n = w.length, a, b;
    if (z <= w[0].z) { a = w[0]; b = w[1]; }
    else if (z >= w[n - 1].z) { a = w[n - 2]; b = w[n - 1]; }
    else { for (var i = 0; i < n - 1; i++) if (z >= w[i].z && z <= w[i + 1].z) { a = w[i]; b = w[i + 1]; break; } }
    if (!a || !b || b.z === a.z) return null;
    return a.x + (z - a.z) * (b.x - a.x) / (b.z - a.z);
  }

  /* ---------- reguła wyboru siatki ---------- */
  /* P-DS-1: populacja odniesienia. 'DS' = pacjent z zespołem Downa; wszystko inne to populacja
     ogólna. Flagę rozstrzyga vilda_ds_source.js — silnik jej nie szuka i nie zna DOM. */
  function normPopulacja(p) {
    return String(p || '').toUpperCase() === 'DS' ? 'DS' : 'OGOLNA';
  }
  /* Resolver populacji — tą samą drogą, co tablice (dana()): najpierw jawnie wstrzyknięty przez
     ustawDane(), potem dobrze znana globalna funkcja aplikacji. Silnik nie zna DOM ani sejfu;
     odpowiada mu vilda_ds_source.js. */
  function resolverPopulacji() {
    if (typeof dane.populacjaDomyslna === 'function') return dane.populacjaDomyslna;
    try { var f = root.VildaPopulacjaPacjenta; if (typeof f === 'function') return f; } catch (e) { /* brak resolvera */ }
    return null;
  }

  /* Populacja z opcji, a gdy jej nie ma — z resolvera. Wyjątek resolvera znaczy „ogólna". */
  function populacjaZOpcji(o) {
    if (o && o.populacja != null) return normPopulacja(o.populacja);
    try {
      var f = resolverPopulacji();
      if (f) return normPopulacja(f());
    } catch (e) { /* resolver odmowil — populacja ogolna */ }
    return 'OGOLNA';
  }

  function maxWiek(populacja) {
    return normPopulacja(populacja) === 'DS' ? G.DS_MAX_M : G.WHO_MAX_M;
  }

  function normZrodlo(z) {
    var s = String(z || '').toUpperCase();
    return ZRODLA.indexOf(s) >= 0 ? s : 'OLAF';
  }
  function etykieta(z) {
    if (String(z || '').toUpperCase() === 'DS') return 'siatka DS (Zemel 2015)';
    var s = normZrodlo(z);
    return s === 'PALCZEWSKA' ? 'Palczewska' : s === 'WHO' ? 'WHO' : 'OLAF';
  }
  /* Kolejność siatek dla zadanego źródła i wieku; pierwsza z danymi wygrywa (decyzje 1–2). */
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
  function powodDs(wiekMies) {
    if (typeof wiekMies !== 'number' || !isFinite(wiekMies)) return 'brak wieku dla siatki DS';
    if (wiekMies < G.DS_MIN_M) return 'siatka BMI zespołu Downa zaczyna się od 2 lat — poniżej stosuje się masę do długości (WFL DS)';
    return 'siatka zespołu Downa kończy się na 20 latach';
  }

  function powodZmiany(zadane, uzyta, wiekMies) {
    if (!uzyta || zadane === uzyta) return '';
    if (typeof wiekMies === 'number' && wiekMies < G.PAL_MIN_M && uzyta === 'WHO') return 'noworodek poniżej 1. miesiąca — siatka Palczewskiej zaczyna się od 1. miesiąca, użyto WHO 2006';
    if (zadane === 'OLAF' && typeof wiekMies === 'number' && wiekMies < G.OLAF_MIN_M) return 'brak danych OLAF dla wieku poniżej 3 lat';
    if (typeof wiekMies === 'number' && wiekMies > G.OLAF_MAX_M) return 'brak siatek ' + etykieta(zadane) + ' powyżej 18 lat';
    return 'brak danych ' + etykieta(zadane) + ' dla tego wieku';
  }

  function wynikPusty(o, powod) {
    return {
      wersja: WERSJA, bmi: typeof o.bmi === 'number' && isFinite(o.bmi) ? o.bmi : null,
      sds: null, centyl: null, siatka: null, zrodloZadane: normZrodlo(o.zrodlo), populacja: normPopulacja(o.populacja), fallback: false,
      powod: powod || '', pozaZakresem: true, mediana: null, lms: null, wiekMies: o.wiekMies, plec: o.plec,
    };
  }
  function wejscieBmi(o) {
    if (typeof o.bmi === 'number' && isFinite(o.bmi) && o.bmi > 0) return o.bmi;
    return bmi({ masaKg: o.masaKg, wzrostCm: o.wzrostCm });
  }

  /* BMI-SDS na JEDNEJ, wskazanej siatce (bez łańcucha zastępczego). */
  function policzNaSiatce(opts) {
    var o = opts || {};
    var siatka = String(o.siatka || '').toUpperCase();
    var wiek = liczba(o.wiekMies), x = wejscieBmi(o), plec = o.plec === 'M' ? 'M' : 'F';
    if (!isFinite(wiek) || wiek < 0 || x == null || SIATKI.indexOf(siatka) < 0) return null;
    var z, mediana, tab = null;
    if (siatka === 'PALCZEWSKA') {
      var w = wezlyPal(plec, wiek);
      if (!w) return null;
      z = zPal(x, w);
      mediana = palCentyl(plec, wiek, 50);
    } else {
      tab = lms(plec, wiek, siatka);
      if (!tab) return null;
      z = zLms(x, tab);
      mediana = tab[1];
    }
    if (typeof z !== 'number' || !isFinite(z)) return null;
    return {
      wersja: WERSJA, bmi: x, sds: z, centyl: centylZSds(z), siatka: siatka,
      zrodloZadane: normZrodlo(o.zrodlo), populacja: siatka === 'DS' ? 'DS' : normPopulacja(o.populacja), fallback: false, powod: '',
      siatkaOpis: etykieta(siatka),
      pozaZakresem: false, mediana: mediana, lms: tab, wiekMies: wiek, plec: plec,
    };
  }

  /* BMI-SDS z regułą wyboru siatki i jawnym łańcuchem zastępczym.
     opts: { bmi | (masaKg, wzrostCm), plec ('M'|'F'), wiekMies (ułamkowe), zrodlo ('OLAF'|'WHO'|'PALCZEWSKA') } */
  function liczba(v) { return v == null || v === '' ? NaN : Number(v); }
  function policz(opts) {
    var o = opts || {};
    var wiek = liczba(o.wiekMies), x = wejscieBmi(o), zadane = normZrodlo(o.zrodlo), pop = populacjaZOpcji(o);
    var baza = { bmi: x, zrodlo: zadane, populacja: pop, wiekMies: isFinite(wiek) ? wiek : null, plec: o.plec === 'M' ? 'M' : 'F' };
    if (!isFinite(wiek) || wiek < 0) return wynikPusty(baza, 'brak wieku');
    if (x == null) return wynikPusty(baza, 'brak masy lub wzrostu');
    if (wiek > maxWiek(pop)) return wynikPusty(baza, pop === 'DS' ? powodDs(wiek) : 'wiek poza zakresem siatek BMI (powyżej 19 lat)');
    var lista = kandydaci(zadane, wiek, pop);
    for (var i = 0; i < lista.length; i++) {
      var r = policzNaSiatce({ bmi: x, plec: o.plec, wiekMies: wiek, siatka: lista[i], zrodlo: zadane, populacja: pop });
      if (r) {
        r.fallback = pop !== 'DS' && lista[i] !== zadane;
        r.powod = pop === 'DS' ? '' : powodZmiany(zadane, lista[i], wiek);
        return r;
      }
    }
    return wynikPusty(baza, pop === 'DS' ? powodDs(wiek) : 'brak siatek BMI dla tego wieku');
  }

  /* Mediana BMI (P50) dla wieku na siatce z tej samej reguły — do Cole'a, masy należnej, „50. centyla BMI". */
  function medianaNaSiatce(plec, wiekMies, siatka) {
    var s = String(siatka || '').toUpperCase(), p = plec === 'M' ? 'M' : 'F', w = liczba(wiekMies);
    if (!isFinite(w) || w < 0) return null;
    if (s === 'PALCZEWSKA') return w >= G.PAL_MIN_M && w <= G.PAL_MAX_M ? palCentyl(p, w, 50) : null;
    var t = lms(p, w, s);
    return t && t[1] > 0 ? t[1] : null;
  }
  function mediana(plec, wiekMies, zrodlo, populacja) {
    var w = liczba(wiekMies), pop = populacjaZOpcji({ populacja: populacja });
    if (!isFinite(w) || w < 0 || w > maxWiek(pop)) return null;
    var lista = kandydaci(zrodlo, w, pop);
    for (var i = 0; i < lista.length; i++) {
      var m = medianaNaSiatce(plec, w, lista[i]);
      if (typeof m === 'number' && isFinite(m) && m > 0) {
        if (pop === 'DS') return { mediana: m, siatka: lista[i], populacja: 'DS', fallback: false, powod: '' };
        return { mediana: m, siatka: lista[i], populacja: 'OGOLNA', fallback: lista[i] !== normZrodlo(zrodlo), powod: powodZmiany(normZrodlo(zrodlo), lista[i], w) };
      }
    }
    return null;
  }

  /* BMI odpowiadające SDS / centylowi na siatce z tej samej reguły (odwrotność) — P85 celu, P5 niedowagi, P50. */
  function wartoscDlaSds(opts) {
    var o = opts || {};
    var w = liczba(o.wiekMies), z = liczba(o.sds), plec = o.plec === 'M' ? 'M' : 'F';
    var pop = populacjaZOpcji(o);
    if (!isFinite(w) || w < 0 || !isFinite(z) || w > maxWiek(pop)) return null;
    var lista = o.siatka ? [String(o.siatka).toUpperCase()] : kandydaci(o.zrodlo, w, pop);
    for (var i = 0; i < lista.length; i++) {
      var s = lista[i], x;
      if (s === 'PALCZEWSKA') x = xPal(z, wezlyPal(plec, w));
      else x = xLms(z, lms(plec, w, s));
      if (typeof x === 'number' && isFinite(x) && x > 0) return { bmi: x, siatka: s, populacja: s === 'DS' ? 'DS' : 'OGOLNA', fallback: s !== 'DS' && s !== normZrodlo(o.zrodlo != null ? o.zrodlo : s) };
    }
    return null;
  }
  function wartoscDlaCentyla(opts) {
    var o = opts || {};
    var z = sdsZCentyla(Number(o.centyl));
    if (z == null) return null;
    return wartoscDlaSds({ sds: z, plec: o.plec, wiekMies: o.wiekMies, zrodlo: o.zrodlo, siatka: o.siatka, populacja: o.populacja });
  }

  /* ---------- kategoria (jedna tablica progów; decyzje 3–6) ---------- */
  /* decyzja 5: dorosły od 18 lat. Decyzja D3: u pacjenta z DS siatki sięgają 20 lat i do tego wieku
     centyl DS wygrywa z progiem dorosłego. */
  function dorosly(wiekMies, populacja) {
    var prog = normPopulacja(populacja) === 'DS' ? G.DS_MAX_M : G.DOROSLY_M;
    return typeof wiekMies === 'number' && isFinite(wiekMies) && wiekMies >= prog;
  }
  function kategoriaDorosly(x) {
    var v = Number(x), P = PROGI.DOROSLY;
    if (!isFinite(v) || v <= 0) return { etykieta: '', klucz: 'brak', kolor: null, dorosly: true };
    if (v < P.NIEDOWAGA) return { etykieta: 'Niedowaga', klucz: 'niedowaga', kolor: 'alert', dorosly: true };
    if (v < P.NADWAGA) return { etykieta: 'Prawidłowe', klucz: 'prawidlowe', kolor: null, dorosly: true };
    if (v < P.OTYLOSC_1) return { etykieta: 'Nadwaga', klucz: 'nadwaga', kolor: 'improve', dorosly: true };
    if (v < P.OTYLOSC_2) return { etykieta: 'Otyłość I stopnia', klucz: 'otylosc-1', kolor: 'alert', dorosly: true };
    if (v < P.OTYLOSC_3) return { etykieta: 'Otyłość II stopnia', klucz: 'otylosc-2', kolor: 'alert', dorosly: true };
    return { etykieta: 'Otyłość III stopnia', klucz: 'otylosc-3', kolor: 'alert', dorosly: true };
  }
  /* Dziecko: z centyla (i SDS dla „olbrzymiej"). Kolor: alert = otyłość / < 3 c; improve = nadwaga / niedowaga 3–5 c. */
  function kategoriaDziecko(centyl, sds, wiekMies) {
    var c = liczba(centyl), z = liczba(sds), w = liczba(wiekMies), P = PROGI.DZIECKO;
    if (centyl == null || !isFinite(c)) return { etykieta: BRAK_KLASYFIKACJI, klucz: 'brak', kolor: null, dorosly: false };
    var bramkaWieku = !isFinite(w) || w >= G.OLBRZYMIA_MIN_M;
    if (isFinite(z) && z >= P.OLBRZYMIA_SDS && bramkaWieku) return { etykieta: 'Otyłość olbrzymia', klucz: 'olbrzymia', kolor: 'alert', dorosly: false };
    if (c < P.NIEDOWAGA) return { etykieta: 'Niedowaga', klucz: 'niedowaga', kolor: c < P.ALARM_NISKI ? 'alert' : 'improve', dorosly: false };
    if (c < P.NADWAGA) return { etykieta: 'Prawidłowe', klucz: 'prawidlowe', kolor: null, dorosly: false };
    if (c < P.OTYLOSC) return { etykieta: 'Nadwaga', klucz: 'nadwaga', kolor: 'improve', dorosly: false };
    return { etykieta: 'Otyłość', klucz: 'otylosc', kolor: 'alert', dorosly: false };
  }
  /* opts: { bmi, centyl, sds, wiekMies, dorosly? } — dorosły od 216 mies. (lub jawnie). */
  function kategoria(opts) {
    var o = opts || {};
    var jestDorosly = o.dorosly != null ? !!o.dorosly : dorosly(liczba(o.wiekMies), populacjaZOpcji(o));
    if (jestDorosly) return kategoriaDorosly(o.bmi);
    return kategoriaDziecko(o.centyl, o.sds, o.wiekMies);
  }
  /* Wynik `policz` + kategoria w jednym kroku. */
  function ocen(opts) {
    var o = opts || {};
    var r = policz(o);
    r.kategoria = kategoria({ bmi: r.bmi, centyl: r.centyl, sds: r.sds, wiekMies: r.wiekMies, dorosly: o.dorosly, populacja: r.populacja });
    return r;
  }

  /* ---------- wskaźnik Cole'a ---------- */
  function kategoriaCole(c) {
    var v = Number(c), P = PROGI.COLE;
    if (!isFinite(v)) return { etykieta: '', klucz: 'brak', kolor: null };
    if (v < P.NIEDOWAGA) return { etykieta: 'Niedowaga', klucz: 'niedowaga', kolor: 'alert' };
    if (v <= P.NADWAGA) return { etykieta: 'W normie', klucz: 'norma', kolor: null };
    if (v < P.OTYLOSC) return { etykieta: 'Nadwaga', klucz: 'nadwaga', kolor: 'improve' };
    return { etykieta: 'Otyłość', klucz: 'otylosc', kolor: 'alert' };
  }
  /* opts: { bmi | (masaKg, wzrostCm), plec, wiekMies, zrodlo, siatka? } */
  function cole(opts) {
    var o = opts || {};
    var x = wejscieBmi(o), w = liczba(o.wiekMies);
    if (x == null || !isFinite(w) || w < 0) return null;
    var m = o.siatka ? (function () { var v = medianaNaSiatce(o.plec, w, o.siatka); return v ? { mediana: v, siatka: String(o.siatka).toUpperCase(), fallback: false, powod: '' } : null; })() : mediana(o.plec, w, o.zrodlo, populacjaZOpcji(o));
    if (!m) return null;
    var c = x / m.mediana * 100;
    return { cole: c, mediana: m.mediana, siatka: m.siatka, fallback: m.fallback, powod: m.powod, kategoria: kategoriaCole(c) };
  }

  /* ---------- cel „normy" (decyzja 6; dziecko P85) ---------- */
  function celNormy(opts) {
    var o = opts || {};
    var w = liczba(o.wiekMies), h = liczba(o.wzrostCm);
    var masa = function (b) { return isFinite(h) && h > 0 && b != null ? b * Math.pow(h / 100, 2) : null; };
    var pop = populacjaZOpcji(o);
    if (o.dorosly === true || dorosly(w, pop)) return { bmiCel: PROGI.DOROSLY.CEL, masaCel: masa(PROGI.DOROSLY.CEL), rodzaj: 'dorosly-24.9', siatka: null, fallback: false };
    var r = wartoscDlaSds({ sds: G.Z_P85, plec: o.plec, wiekMies: w, zrodlo: o.zrodlo, siatka: o.siatka, populacja: pop });
    if (!r) return null;
    return { bmiCel: r.bmi, masaCel: masa(r.bmi), rodzaj: 'dziecko-P85', siatka: r.siatka, fallback: r.fallback };
  }

  /* ---------- drabinka celów: szczeble pośrednie w drodze do normy ----------
   * P-SZCZEBLE (decyzje właściciela 2026-09-20). JEDNO miejsce, w którym aplikacja liczy
   * „ile brakuje i dokąd". Karty tego nie liczą — czytają gotowy wynik.
   *
   * SKĄD POTRZEBA. Obie karty („Droga do normy BMI", „Zalecenia dietetyczne") pokazywały
   * jeden cel i nic pomiędzy: dziecko 85. centyl, dorosły BMI 24,9. Pacjentowi z BMI 42
   * zdanie „do normy brakuje 50 kg" odbiera sens startu. Szczeble są bliższymi słupkami
   * na tej samej drodze — NIE są celem leczenia i nie zastępują celu.
   *
   * SZCZEBLE DOROSŁEGO (bez nowych progów — wszystkie z PROGI.DOROSLY):
   *   BMI 35 → wyjście z otyłości II stopnia;
   *   BMI 30 → koniec otyłości.
   *
   * SZCZEBLE DZIECKA (bez nowych progów — z PROGI.DZIECKO):
   *   SDS 3  → wyjście z otyłości olbrzymiej (tylko od OLBRZYMIA_MIN_M, jak w kategorii);
   *   97. centyl → koniec otyłości.
   *
   * SZCZEBEL DOWODOWY DZIECKA — JEDYNY NOWY PRÓG W TYM WPISIE (akceptacja kliniczna
   * właściciela 2026-09-20): redukcja BMI-SDS o 0,25 od wartości wyjściowej.
   * Reinehr T. i wsp., „Which Amount of BMI-SDS Reduction Is Necessary to Improve
   * Cardiovascular Risk Factors in Overweight Children?", J Clin Endocrinol Metab
   * 2016;101(8):3171–9, doi:10.1210/jc.2016-1885 (PMID 27285295): 1388 dzieci, średnia
   * wieku 11,4 roku, roczna interwencja behawioralna, percentyle IOTF. Redukcja 0,25–0,5
   * BMI-SDS wiązała się ze spadkiem ciśnienia skurczowego o 3,2 mm Hg, rozkurczowego
   * o 2,2 mm Hg, trójglicerydów o 6,9 mg/dl i HOMA o 0,5 oraz wzrostem HDL o 1,3 mg/dl;
   * redukcja > 0,5 podwajała efekt. To jest PRÓG POPRAWY METABOLICZNEJ, nie cel terapii.
   *
   * OGRANICZENIE, KTÓRE MUSI BYĆ WIDOCZNE W WYNIKU. BMI-SDS jest złym miernikiem przy
   * skrajnych wartościach: teoretyczne maksimum z-score zmienia się ponad trzykrotnie
   * z wiekiem, a u dzieci z otyłością ciężką z-score koreluje z odsetkiem 95. centyla
   * tylko na poziomie r ≈ 0,5 (Freedman D.S. i wsp., J Pediatr 2017;188:50–56,
   * doi:10.1016/j.jpeds.2017.03.039; kohorta 2–4 lata, siatki CDC). Dlatego szczebel
   * Reinehra niesie flagę `ostrzezenieSds`, gdy SDS wyjściowy przekracza OLBRZYMIA_SDS —
   * wtedy karta ma się opierać na kilogramach i granicy centylowej, nie na samym SDS.
   *
   * FILTR. Szczebel wchodzi do `szczeble` tylko wtedy, gdy LEŻY MIĘDZY dzisiejszą masą
   * a celem. Inaczej pokazywalibyśmy pacjentowi z BMI 26 „do BMI 30", czyli w stronę,
   * z której właśnie wyszedł. `wszystkie` niesie komplet kandydatów (także odfiltrowanych),
   * żeby konsument, który pyta o konkretny próg, nie musiał liczyć go po swojemu.
   *
   * KIERUNEK. Drabinka dotyczy REDUKCJI. Przy niedowadze `szczeble` jest puste, a `cel`
   * wskazuje dolną granicę normy — decyzja o szczeblach „w górę" nie zapadła i nie ma
   * dla nich źródła.
   */
  var SZCZEBEL_SDS_REINEHR = 0.25;
  /* Powyżej tego SDS z-score przestaje wiernie oddawać BMI — liczba wprost z Freedmana:
     „BMIz i centyle mogą się istotnie różnić od obserwowanych dla BMI powyżej 97. centyla
     (z = 1,88)". Konsument, który dostanie tę flagę, ma się opierać na kilogramach
     i granicy centylowej, nie na samym SDS. */
  var SDS_KOMPRESJA = 1.88;
  var EPS_KG = 0.05;   // poniżej tego „brakuje 0,0 kg" — szczebel nie niesie informacji

  function drabinkaCelow(opts) {
    var o = opts || {};
    var h = liczba(o.wzrostCm), m = liczba(o.masaKg), wiek = liczba(o.wiekMies);
    if (!isFinite(h) || h <= 0 || !isFinite(m) || m <= 0) return null;
    var pop = populacjaZOpcji(o);
    var jestDorosly = o.dorosly != null ? !!o.dorosly : dorosly(wiek, pop);
    var masaDla = function (b) { return typeof b === 'number' && isFinite(b) && b > 0 ? b * Math.pow(h / 100, 2) : null; };
    var x = m / Math.pow(h / 100, 2);
    var wszystkie = [];
    var cel = null, kat, zakresNormy, sds = null, centyl = null, siatka = null;

    function dodaj(klucz, bmi, etykieta, opis, extra) {
      var masa = masaDla(bmi);
      if (masa == null) return;
      var poz = { klucz: klucz, bmi: bmi, masa: masa, roznica: masa - m, etykieta: etykieta, opis: opis };
      if (extra) { Object.keys(extra).forEach(function (k) { poz[k] = extra[k]; }); }
      wszystkie.push(poz);
    }

    if (jestDorosly) {
      var P = PROGI.DOROSLY;
      kat = kategoriaDorosly(x);
      zakresNormy = { odBmi: P.NIEDOWAGA, doBmi: P.CEL, odMasa: masaDla(P.NIEDOWAGA), doMasa: masaDla(P.CEL) };
      if (x < P.NIEDOWAGA) {
        cel = { klucz: 'norma-dol', bmi: P.NIEDOWAGA, masa: masaDla(P.NIEDOWAGA), granica: 'dolna',
          etykieta: 'BMI ' + P.NIEDOWAGA, opis: 'dolna granica normy' };
      } else if (x >= P.NADWAGA) {
        cel = { klucz: 'norma', bmi: P.CEL, masa: masaDla(P.CEL), granica: 'gorna',
          etykieta: 'BMI ' + P.CEL, opis: 'górna granica normy' };
      }
      dodaj('otylosc-2', P.OTYLOSC_2, 'BMI ' + P.OTYLOSC_2, 'wyjście z otyłości II stopnia');
      dodaj('otylosc-1', P.OTYLOSC_1, 'BMI ' + P.OTYLOSC_1, 'koniec otyłości');
    } else {
      var D = PROGI.DZIECKO;
      var r = policz({ bmi: x, plec: o.plec, wiekMies: wiek, zrodlo: o.zrodlo, siatka: o.siatka, populacja: pop });
      if (!r || typeof r.sds !== 'number' || !isFinite(r.sds)) return null;
      sds = r.sds; centyl = r.centyl; siatka = r.siatka;
      kat = kategoriaDziecko(r.centyl, r.sds, wiek);
      var naSds = function (z) {
        var v = wartoscDlaSds({ sds: z, plec: o.plec, wiekMies: wiek, zrodlo: o.zrodlo, siatka: o.siatka, populacja: pop });
        return v && isFinite(v.bmi) ? v.bmi : null;
      };
      var naCentylu = function (c) {
        var v = wartoscDlaCentyla({ centyl: c, plec: o.plec, wiekMies: wiek, zrodlo: o.zrodlo, siatka: o.siatka, populacja: pop });
        return v && isFinite(v.bmi) ? v.bmi : null;
      };
      /* Cel TYLKO wtedy, gdy dziecko jest poza normą — tak samo jak u dorosłego.
         Bez tej bramki dziecko z BMI w normie dostawało „cel 85. centyl" i kierunek
         „przyrost", czyli zalecenie tycia do górnej granicy normy. */
      var bmiGora = naSds(G.Z_P85), bmiDol = naCentylu(D.NIEDOWAGA);
      zakresNormy = { odCentyl: D.NIEDOWAGA, doCentyl: D.NADWAGA,
        odBmi: bmiDol, doBmi: bmiGora, odMasa: masaDla(bmiDol), doMasa: masaDla(bmiGora) };
      if (isFinite(r.centyl) && r.centyl >= D.NADWAGA && bmiGora != null) {
        cel = { klucz: 'norma', bmi: bmiGora, masa: masaDla(bmiGora), granica: 'gorna',
          etykieta: '85. centyl', opis: 'górna granica normy dla wieku' };
      } else if (isFinite(r.centyl) && r.centyl < D.NIEDOWAGA && bmiDol != null) {
        cel = { klucz: 'norma-dol', bmi: bmiDol, masa: masaDla(bmiDol), granica: 'dolna',
          etykieta: D.NIEDOWAGA + '. centyl', opis: 'dolna granica normy dla wieku' };
      }
      if (isFinite(wiek) && wiek >= G.OLBRZYMIA_MIN_M) {
        dodaj('olbrzymia', naSds(D.OLBRZYMIA_SDS), 'SDS ' + D.OLBRZYMIA_SDS, 'wyjście z otyłości olbrzymiej');
      }
      dodaj('otylosc', naCentylu(D.OTYLOSC), D.OTYLOSC + '. centyl', 'koniec otyłości');
      dodaj('reinehr', naSds(r.sds - SZCZEBEL_SDS_REINEHR),
        '\u2212' + String(SZCZEBEL_SDS_REINEHR).replace('.', ',') + ' BMI-SDS',
        'próg poprawy: ciśnienie, trójglicerydy, HDL',
        { sdsDocelowy: r.sds - SZCZEBEL_SDS_REINEHR, deltaSds: SZCZEBEL_SDS_REINEHR,
          zrodlo: 'Reinehr 2016, doi:10.1210/jc.2016-1885',
          sdsPrzyEkstremum: r.sds > SDS_KOMPRESJA });
    }

    /* Tylko szczeble LEŻĄCE MIĘDZY dzisiejszą masą a celem, od najbliższego.
       BEZ CELU REDUKCYJNEGO NIE MA ŻADNYCH SZCZEBLI — drabinka jest drogą do celu, a bez
       celu nie ma drogi. Bramka jest tu, nie w widoku, bo pierwsza wersja filtrowała tylko
       „poniżej dzisiejszej masy" i dziecko z BMI w normie dostawało próg Reinehra, czyli
       aplikacja podpowiadała zdrowemu dziecku, żeby schudło kilogram. */
    var redukcja = cel != null && isFinite(cel.masa) && cel.masa < m;
    var masaCelu = redukcja ? cel.masa : null;
    var szczeble = !redukcja ? [] : wszystkie.filter(function (p) {
      if (!isFinite(p.masa)) return false;
      if (p.masa >= m - EPS_KG) return false;
      return p.masa > masaCelu + EPS_KG;
    }).sort(function (a, b) { return b.masa - a.masa; });

    return {
      dorosly: jestDorosly, wzrostCm: h, masa: m, bmi: x, kategoria: kat,
      sds: sds, centyl: centyl, siatka: siatka,
      kierunek: cel == null ? 'w-normie' : (cel.masa > m ? 'przyrost' : 'redukcja'),
      cel: cel && isFinite(cel.masa) ? Object.assign({}, cel, { roznica: cel.masa - m }) : null,
      szczeble: szczeble, najblizszy: szczeble.length ? szczeble[0] : null,
      wszystkie: wszystkie, zakresNormy: zakresNormy,
    };
  }

  /* ---------- masa docelowa dorosłego (P-STATUS-DOROSLY; decyzja właściciela 2026-09-20) ----------
   *
   * Kafelek „Masa ciała docelowa" w Statusie Karty pacjenta pyta o jedno: ile kilogramów
   * dzieli pacjenta od granicy, do której idzie. Wszystkie liczby biorą się z PROGI.DOROSLY,
   * więc zmiana progu w jednym miejscu przestawia kafelek — Karta nie zna progów BMI
   * dorosłego i nie liczy ich po swojemu.
   *
   * Kierunek wybiera kategoria, nie znak różnicy:
   *   BMI < 18,5  → cel = dolna granica normy, różnica dodatnia (przytyć);
   *   BMI ≥ 25    → cel = górna granica normy (CEL = 24,9), różnica ujemna (schudnąć);
   *   w normie    → celu nie ma, jest zakres.
   *
   * PRÓG POŚREDNI (decyzja właściciela 2026-09-20). Pacjentowi z BMI 42 zdanie „do normy
   * brakuje 50 kg" odbiera sens startu, a „12 kg i wychodzisz z otyłości III stopnia" — nie.
   * Dlatego przy otyłości wynik niesie także masę przy BMI 30, czyli pierwszą granicę, za
   * którą otyłość się kończy. To NIE jest cel leczenia ani kryterium odpowiedzi na lek,
   * tylko bliższy słupek na tej samej drodze.
   *
   * `roznica` zawsze znaczy „o tyle ma się zmienić masa": ujemna — ubytek, dodatnia — przyrost.
   */
  function celMasyDorosly(opts) {
    /* P-SZCZEBLE: ta funkcja NIE liczy już progów po swojemu — jest widokiem drabinki
       (`drabinkaCelow`) w kształcie, którego oczekuje kafelek Statusu. Dzięki temu próg
       BMI 30 istnieje w silniku raz, a nie w dwóch miejscach, które mogą się rozjechać.
       Kształt wyniku i zachowanie bez zmian; pilnują tego testy Statusu. */
    var o = opts || {};
    var d = drabinkaCelow({
      wzrostCm: o.wzrostCm, masaKg: o.masaKg, wiekMies: o.wiekMies,
      plec: o.plec, zrodlo: o.zrodlo, siatka: o.siatka, populacja: o.populacja, dorosly: true,
    });
    if (!d) {
      /* Bez masy, ale z BMI i wzrostem — stara ścieżka wołających, którzy podają samo BMI. */
      var h = liczba(o.wzrostCm), b = liczba(o.bmi);
      if (!isFinite(h) || h <= 0 || !isFinite(b) || b <= 0) return null;
      d = drabinkaCelow({ wzrostCm: h, masaKg: b * Math.pow(h / 100, 2), wiekMies: o.wiekMies,
        plec: o.plec, zrodlo: o.zrodlo, siatka: o.siatka, populacja: o.populacja, dorosly: true });
      if (!d) return null;
    }
    var prog = null;
    if (d.bmi >= PROGI.DOROSLY.OTYLOSC_1) {
      d.wszystkie.forEach(function (p) {
        if (p.klucz === 'otylosc-1') prog = { bmi: p.bmi, masa: p.masa, granica: 'otylosc', roznica: p.roznica };
      });
    }
    return {
      bmi: d.bmi, masa: d.masa, kategoria: d.kategoria, kierunek: d.kierunek,
      cel: d.cel ? { bmi: d.cel.bmi, masa: d.cel.masa, granica: d.cel.granica, roznica: d.cel.roznica } : null,
      posredni: prog, zakresNormy: d.zakresNormy,
      /* Pełna drabinka dla konsumentów, którzy chcą najbliższy szczebel, a nie sam BMI 30. */
      szczeble: d.szczeble, najblizszy: d.najblizszy,
    };
  }

  /* ---------- format (decyzja 10) ---------- */
  function fmtBmi(v) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    return v.toFixed(1).replace('.', ',');
  }
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
  function fmtCole(c) {
    if (typeof c !== 'number' || !isFinite(c)) return '—';
    return c.toFixed(1).replace('.', ',') + ' %';
  }
  function formatuj(model) {
    var m = model || {};
    var maSds = typeof m.sds === 'number' && isFinite(m.sds);
    var kat = m.kategoria || kategoria({ bmi: m.bmi, centyl: m.centyl, sds: m.sds, wiekMies: m.wiekMies });
    return {
      etykieta: 'bmiSDS',
      bmi: fmtBmi(m.bmi),
      bmiZdanie: typeof m.bmi === 'number' && isFinite(m.bmi) ? 'BMI ' + fmtBmi(m.bmi) + ' kg/m²' : '',
      sds: maSds ? fmtSds(m.sds) : '—',
      zdanie: maSds ? 'bmiSDS ' + fmtSds(m.sds) : '',
      centyl: maSds ? fmtCentyl(m.centyl) : '—',
      centylZdanie: maSds ? (m.centyl < 1 || m.centyl > 99 ? fmtCentyl(m.centyl) + '. centyla' : fmtCentyl(m.centyl) + '. centyl') : '',
      kategoria: kat ? kat.etykieta : '',
      kolor: kat ? kat.kolor : null,
      siatka: m.siatka ? etykieta(m.siatka) : '',
      /* decyzja D4: siatka specjalnej populacji musi być NAZWANA w każdym wyjściu tekstowym —
         centyl DS nie znaczy tego samego, co centyl populacyjny. */
      siatkaNota: m.siatka === 'DS' ? NOTA_DS : '',
      fallback: !!m.fallback,
      powod: m.powod || '',
    };
  }

  root.VildaBmi = Object.freeze({
    version: WERSJA, ZRODLA: ZRODLA.slice(), SIATKI: SIATKI.slice(), NOTA_DS: NOTA_DS, G: G, PROGI: PROGI, CENTYLE_PAL: CENTYLE_PAL.slice(), BRAK_KLASYFIKACJI: BRAK_KLASYFIKACJI,
    ustawDane: ustawDane, kandydaci: kandydaci, normPopulacja: normPopulacja, populacjaZOpcji: populacjaZOpcji, lms: lms, interpoluj: interpoluj, zLms: zLms, xLms: xLms,
    bmi: bmi, policz: policz, policzNaSiatce: policzNaSiatce, ocen: ocen,
    mediana: mediana, medianaNaSiatce: medianaNaSiatce, wartoscDlaSds: wartoscDlaSds, wartoscDlaCentyla: wartoscDlaCentyla,
    kategoria: kategoria, kategoriaDziecko: kategoriaDziecko, kategoriaDorosly: kategoriaDorosly, dorosly: dorosly,
    cole: cole, kategoriaCole: kategoriaCole, celNormy: celNormy, celMasyDorosly: celMasyDorosly, drabinkaCelow: drabinkaCelow, SZCZEBEL_SDS_REINEHR: SZCZEBEL_SDS_REINEHR, SDS_KOMPRESJA: SDS_KOMPRESJA,
    centylZSds: centylZSds, sdsZCentyla: sdsZCentyla, normalCDF: normalCDF, normInv: normInv,
    fmtBmi: fmtBmi, fmtSds: fmtSds, fmtCentyl: fmtCentyl, fmtCole: fmtCole, formatuj: formatuj, etykieta: etykieta,
  });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
