/*
 * vitalSigns.js
 *
 * Ten moduł dostarcza funkcje do wyznaczania centyli częstości akcji serca (HR)
 * i częstości oddechów (RR) dla dzieci i młodzieży w wieku 0–18 lat w
 * zależności od sytuacji klinicznej.  Umożliwia wybranie źródła danych
 * (populacja zdrowa vs hospitalizowana) oraz uwzględnia korekty
 * temperaturowe (gorączka) i stanu czuwania (czuwanie vs sen).  Zakres
 * danych obejmuje:
 *
 *  • Populacja zdrowa: siatki centylowe Fleming et al. 2011 (1.–99. c) dla
 *    tętna i oddechów.  Funkcje korzystają z wartości 10., 50. i 90. centyla.
 *  • Pacjenci hospitalizowani: centyle z Bonafide et al. 2013 (10., 50., 90.).
 *  • Korekta gorączki dla HR: ~+10 ud./min na każde +1 °C podwyższenia
 *    temperatury ciała według Daymont et al. 2015【839392951190399†L192-L206】.
 *  • Korekta gorączki dla RR: ~+2,2 oddechu/min na każde +1 °C podwyższenia
 *    temperatury według Nijman et al. 2012【446740410569204†L475-L476】.
 *  • Różnica czuwanie–sen dla RR: dla wieku 0–3 lata redukcja od 18 do
 *    ~3,5 oddechu/min podczas snu; powyżej 3 lat brak istotnej różnicy
 *    (Herbert et al. 2020【735531815443963†L158-L166】).
 *
 * Domyślnie funkcje zakładają populację zdrową, normotermię (37 °C) i
 * czuwanie.  Opcje `population`, `temperature` i `state` pozwalają
 * dostosować wyjście do innych warunków.
 *
 * Publiczne API (dostępne poprzez window.vitalSigns w przeglądarce):
 *   • getHrValues(ageYears, opts) → { p10, median, p90 }
 *   • getRrValues(ageYears, opts) → { p10, median, p90 }
 *   • getHrPercentile(ageYears, hrValue, opts) → centyl (0–100)
 *   • getRrPercentile(ageYears, rrValue, opts) → centyl (0–100)
 *
 * Parametry:
 *   ageYears: wiek w latach (może być ułamkowy, np. 0.25 = 3 miesiące).
 *   opts.population: 'healthy' (domyślnie) lub 'hospital' – określa bazę
 *     danych (Fleming vs Bonafide).
 *   opts.temperature: temperatura ciała w °C; brak lub null oznacza brak
 *     korekty gorączkowej.
 *   opts.state: 'awake' (domyślnie) lub 'sleep' – dotyczy RR; wpływa na
 *     korektę snu.
 *   opts.hrOffset / opts.rrOffset: opcjonalne przesunięcia pozwalające
 *     korygować dane bazowe (przydatne w testach); domyślne 0.
 */

(function() {
  'use strict';

  /* ===== Dane Fleming et al. 2011 (populacja zdrowa) ===== */
  // Tablice percentylowe dla częstości oddechów i tętna.  Zawierają klucze
  // przedziału wiekowego (półotwarte w miesiącach) oraz obiekt percentiles
  // z kluczami 1, 10, 25, 50, 75, 90, 99 (breaths/min i beats/min).
  // Poniższe wartości pochodzą z tabel Web Table 4 i Web Table 5 w
  // dodatku internetowym Fleming et al. 2011; obejmują zarówno
  // respirację (respiratoryRateData) jak i tętno (heartRateData).
  const HEALTHY_RR_DATA = [
    { range: '0–3 m', ageMinMonths: 0, ageMaxMonths: 3,  percentiles: {1:25,10:34,25:40,50:43,75:52,90:57,99:66} },
    { range: '3–6 m', ageMinMonths: 3, ageMaxMonths: 6,  percentiles: {1:24,10:33,25:38,50:41,75:49,90:55,99:64} },
    { range: '6–9 m', ageMinMonths: 6, ageMaxMonths: 9,  percentiles: {1:23,10:31,25:36,50:39,75:47,90:52,99:61} },
    { range: '9–12 m',ageMinMonths: 9, ageMaxMonths: 12, percentiles: {1:22,10:30,25:35,50:37,75:45,90:50,99:58} },
    { range: '12–18 m',ageMinMonths: 12, ageMaxMonths: 18, percentiles: {1:21,10:28,25:32,50:35,75:42,90:46,99:53} },
    { range: '18–24 m',ageMinMonths: 18, ageMaxMonths: 24, percentiles: {1:19,10:25,25:29,50:31,75:36,90:40,99:46} },
    { range: '2–3 y', ageMinMonths: 24, ageMaxMonths: 36, percentiles: {1:18,10:22,25:25,50:28,75:31,90:34,99:38} },
    { range: '3–4 y', ageMinMonths: 36, ageMaxMonths: 48, percentiles: {1:17,10:21,25:23,50:25,75:27,90:29,99:33} },
    { range: '4–6 y', ageMinMonths: 48, ageMaxMonths: 72, percentiles: {1:17,10:20,25:21,50:23,75:25,90:27,99:29} },
    { range: '6–8 y', ageMinMonths: 72, ageMaxMonths: 96, percentiles: {1:16,10:18,25:20,50:21,75:23,90:24,99:27} },
    { range: '8–12 y',ageMinMonths: 96, ageMaxMonths: 144,percentiles: {1:14,10:16,25:18,50:19,75:21,90:22,99:25} },
    { range: '12–15 y',ageMinMonths: 144,ageMaxMonths: 180,percentiles: {1:12,10:15,25:16,50:18,75:19,90:21,99:23} },
    { range: '15–18 y',ageMinMonths: 180,ageMaxMonths: 216,percentiles: {1:11,10:13,25:15,50:16,75:18,90:19,99:22} }
  ];

  const HEALTHY_HR_DATA = [
    // „Birth” band stosowany tylko dla dokładnie 0 miesięcy; jeśli age > 0,
    // używamy następnego przedziału 0–3 m.
    { range: 'Birth', ageMinMonths: 0, ageMaxMonths: 0,  percentiles: {1:90,10:107,25:116,50:127,75:138,90:148,99:164} },
    { range: '0–3 m', ageMinMonths: 0, ageMaxMonths: 3,  percentiles: {1:107,10:123,25:133,50:143,75:154,90:164,99:181} },
    { range: '3–6 m', ageMinMonths: 3, ageMaxMonths: 6,  percentiles: {1:104,10:120,25:129,50:140,75:150,90:159,99:175} },
    { range: '6–9 m', ageMinMonths: 6, ageMaxMonths: 9,  percentiles: {1:98,10:114,25:123,50:134,75:143,90:152,99:168} },
    { range: '9–12 m',ageMinMonths: 9, ageMaxMonths: 12, percentiles: {1:93,10:109,25:118,50:128,75:137,90:145,99:161} },
    { range: '12–18 m',ageMinMonths: 12, ageMaxMonths: 18, percentiles: {1:88,10:103,25:112,50:123,75:132,90:140,99:156} },
    { range: '18–24 m',ageMinMonths: 18, ageMaxMonths: 24, percentiles: {1:82,10:98,25:106,50:116,75:126,90:135,99:149} },
    { range: '2–3 y', ageMinMonths: 24, ageMaxMonths: 36, percentiles: {1:76,10:92,25:100,50:110,75:119,90:128,99:142} },
    { range: '3–4 y', ageMinMonths: 36, ageMaxMonths: 48, percentiles: {1:70,10:86,25:94,50:104,75:113,90:123,99:136} },
    { range: '4–6 y', ageMinMonths: 48, ageMaxMonths: 72, percentiles: {1:65,10:81,25:89,50:98,75:108,90:117,99:131} },
    { range: '6–8 y', ageMinMonths: 72, ageMaxMonths: 96, percentiles: {1:59,10:74,25:82,50:91,75:101,90:111,99:123} },
    { range: '8–12 y',ageMinMonths: 96, ageMaxMonths: 144,percentiles: {1:52,10:67,25:75,50:84,75:93,90:103,99:115} },
    { range: '12–15 y',ageMinMonths: 144,ageMaxMonths: 180,percentiles: {1:47,10:62,25:69,50:78,75:87,90:96,99:108} },
    { range: '15–18 y',ageMinMonths: 180,ageMaxMonths: 216,percentiles: {1:43,10:58,25:65,50:73,75:83,90:92,99:104} }
  ];

  /**
   * Konwersja wieku z lat na miesiące.  Używana do wyszukania danych
   * w tablicach HEALTHY_*_DATA.
   * @param {number} ageYears Wiek w latach.
   * @returns {number} Wiek w miesiącach.
   */
  function toMonths(ageYears) {
    return ageYears * 12;
  }

  /**
   * Znajduje rekord z danych zdrowej populacji (Fleming) dla podanego wieku
   * w miesiącach.  Dla bandu "Birth" wiek musi wynosić dokładnie 0 miesięcy.
   * @param {number} ageMonths Wiek w miesiącach.
   * @param {Array} data Tablica z obiektami zawierającymi ageMinMonths i ageMaxMonths.
   * @returns {Object|null} Pasujący rekord lub null.
   */
  function findHealthyRecord(ageMonths, data) {
    for (const record of data) {
      if (record.ageMinMonths === 0 && record.ageMaxMonths === 0) {
        if (ageMonths === 0) return record;
        continue;
      }
      if (ageMonths >= record.ageMinMonths && ageMonths < record.ageMaxMonths) {
        return record;
      }
    }
    return null;
  }

  /**
   * Zwraca centyle tętna dla populacji zdrowej (Fleming).  Dla wieku
   * wykraczającego poza zakres (0–18 lat) zwraca ostatni band.
   * @param {number} ageYears Wiek w latach.
   * @returns {Object} Obiekt { p10, median, p90 }
   */
  function getHealthyHrValues(ageYears) {
    const months = toMonths(ageYears);
    // Dla wieku większego niż ostatni zakres zwracamy ostatni wiersz
    let record = findHealthyRecord(months, HEALTHY_HR_DATA);
    if (!record) {
      record = HEALTHY_HR_DATA[HEALTHY_HR_DATA.length - 1];
    }
    const p = record.percentiles;
    return { p10: p[10], median: p[50], p90: p[90] };
  }

  /**
   * Zwraca centyle częstości oddechów dla populacji zdrowej (Fleming).
   * @param {number} ageYears Wiek w latach.
   * @returns {Object} Obiekt { p10, median, p90 }
   */
  function getHealthyRrValues(ageYears) {
    const months = toMonths(ageYears);
    let record = findHealthyRecord(months, HEALTHY_RR_DATA);
    if (!record) {
      record = HEALTHY_RR_DATA[HEALTHY_RR_DATA.length - 1];
    }
    const p = record.percentiles;
    return { p10: p[10], median: p[50], p90: p[90] };
  }

  /* ===== Dane Bonafide et al. 2013 (populacja hospitalizowana) ===== */
  // Każdy wpis zawiera minAge, maxAge (lata) oraz obiekt hr/rr z p10, medianą i p90.
  const HOSPITAL_DATA = [
    { minAge: 0.0,  maxAge: 0.25, hr: { p10: 119, median: 140, p90: 164 }, rr: { p10: 30, median: 41, p90: 56 } },
    { minAge: 0.25, maxAge: 0.5,  hr: { p10: 114, median: 135, p90: 159 }, rr: { p10: 28, median: 38, p90: 52 } },
    { minAge: 0.5,  maxAge: 0.75, hr: { p10: 110, median: 131, p90: 156 }, rr: { p10: 26, median: 35, p90: 49 } },
    { minAge: 0.75, maxAge: 1.0,  hr: { p10: 107, median: 128, p90: 153 }, rr: { p10: 24, median: 33, p90: 46 } },
    { minAge: 1.0,  maxAge: 1.5,  hr: { p10: 103, median: 124, p90: 149 }, rr: { p10: 23, median: 31, p90: 43 } },
    { minAge: 1.5,  maxAge: 2.0,  hr: { p10: 98,  median: 120, p90: 146 }, rr: { p10: 21, median: 29, p90: 40 } },
    { minAge: 2.0,  maxAge: 3.0,  hr: { p10: 93,  median: 115, p90: 142 }, rr: { p10: 20, median: 27, p90: 37 } },
    { minAge: 3.0,  maxAge: 4.0,  hr: { p10: 88,  median: 111, p90: 138 }, rr: { p10: 19, median: 25, p90: 35 } },
    { minAge: 4.0,  maxAge: 6.0,  hr: { p10: 83,  median: 106, p90: 134 }, rr: { p10: 18, median: 24, p90: 33 } },
    { minAge: 6.0,  maxAge: 8.0,  hr: { p10: 77,  median: 100, p90: 128 }, rr: { p10: 17, median: 23, p90: 31 } },
    { minAge: 8.0,  maxAge: 12.0, hr: { p10: 72,  median: 94,  p90: 120 }, rr: { p10: 16, median: 21, p90: 28 } },
    { minAge: 12.0, maxAge: 15.0, hr: { p10: 66,  median: 87,  p90: 112 }, rr: { p10: 15, median: 19, p90: 25 } },
    { minAge: 15.0, maxAge: 18.0, hr: { p10: 62,  median: 82,  p90: 107 }, rr: { p10: 14, median: 18, p90: 23 } }
  ];

  /**
   * Znajduje przedział wiekowy w HOSPITAL_DATA odpowiadający podanemu wiekowi.
   * @param {number} age Lata.
   * @returns {Object} Pasujący band (ostatni, jeśli wiek poza zakresem).
   */
  function findHospitalBand(age) {
    let a = Number.isFinite(age) ? age : 0;
    if (a < 0) a = 0;
    for (const band of HOSPITAL_DATA) {
      if (a >= band.minAge && a < band.maxAge) return band;
    }
    return HOSPITAL_DATA[HOSPITAL_DATA.length - 1];
  }

  /**
   * Zwraca centyle tętna dla populacji hospitalizowanej (Bonafide).
   * @param {number} ageYears Wiek w latach.
   * @returns {Object} Obiekt { p10, median, p90 }
   */
  function getHospitalHrValues(ageYears) {
    const band = findHospitalBand(ageYears);
    return {
      p10: band.hr.p10,
      median: band.hr.median,
      p90: band.hr.p90
    };
  }

  /**
   * Zwraca centyle częstości oddechów dla populacji hospitalizowanej (Bonafide).
   * @param {number} ageYears Wiek w latach.
   * @returns {Object} Obiekt { p10, median, p90 }
   */
  function getHospitalRrValues(ageYears) {
    const band = findHospitalBand(ageYears);
    return {
      p10: band.rr.p10,
      median: band.rr.median,
      p90: band.rr.p90
    };
  }

  /* ===== Korekty gorączkowe i snu ===== */
  // Współczynniki temperatury – orientacyjne przyrosty na 1 °C
  const TEMP_HR_SLOPE = 10.0; // ud./min 【839392951190399†L192-L206】
  const TEMP_RR_SLOPE = 2.2;  // oddechów/min 【446740410569204†L475-L476】

  /**
   * Redukcja RR w czasie snu zależna od wieku (0–3 lata) według Herbert et al.
   * @param {number} ageYears Wiek w latach.
   * @returns {number} Różnica między RR w czuwaniu a we śnie.
   */
  /**
   * Różnica między częstością oddechów w czuwaniu i podczas snu.
   * Na podstawie danych Herbert et al. 2020 obserwowano redukcję
   * ok. 18 oddechów/min u noworodków i ok. 3.4 oddechu/min u 3‑latków
   *【735531815443963†L158-L166】. W starszych grupach brak było
   * dokładnych danych, dlatego zakładamy malejącą redukcję do 0 w wieku 18 lat.
   *
   * Dla wieku 0–3 lat interpolujemy liniowo pomiędzy 18 a 3.4.  Dla
   * wieku 3–18 lat redukcja zmniejsza się od 3.4 do 0 zgodnie z linią
   * prostą.  Po 18. r.ż. redukcja jest pomijalna i zwracamy 0.
   *
   * @param {number} ageYears Wiek w latach.
   * @returns {number} Różnica (breaths/min) odejmowana od bazowych
   *   wartości centylowych przy obliczaniu RR we śnie.
   */
  function sleepRrAdjustment(ageYears) {
    const a = Number.isFinite(ageYears) ? ageYears : 0;
    // wartości graniczne z badania: noworodek (0 l) ~18 oddechów/min
    // redukcji; 3 lata ~3.4 oddechu/min; powyżej 18 lat ~0.
    const startDiff = 18.0;
    const endDiff3 = 3.4;
    if (a <= 0) return startDiff;
    if (a < 3.0) {
      // liniowa interpolacja między 0 a 3 lata
      return startDiff - (startDiff - endDiff3) * (a / 3.0);
    }
    if (a < 18.0) {
      // liniowa redukcja od 3 lata do 18 lat
      return endDiff3 * (18.0 - a) / 15.0;
    }
    return 0.0;
  }

  /* ===== Funkcje publiczne ===== */

  /**
   * Pobiera bazowe centyle tętna w zależności od populacji.
   * @param {number} ageYears Wiek w latach.
   * @param {string} population 'healthy' | 'hospital'
   * @returns {Object} { p10, median, p90 }
   */
  function getBaseHrValues(ageYears, population) {
    const pop = (population || 'healthy').toLowerCase();
    if (pop === 'hospital') {
      return getHospitalHrValues(ageYears);
    }
    return getHealthyHrValues(ageYears);
  }

  /**
   * Pobiera bazowe centyle RR w zależności od populacji.
   * @param {number} ageYears Wiek w latach.
   * @param {string} population 'healthy' | 'hospital'
   * @returns {Object} { p10, median, p90 }
   */
  function getBaseRrValues(ageYears, population) {
    const pop = (population || 'healthy').toLowerCase();
    if (pop === 'hospital') {
      return getHospitalRrValues(ageYears);
    }
    return getHealthyRrValues(ageYears);
  }

  /**
   * Zwraca centyle tętna z uwzględnieniem opcjonalnych korekt.
   * @param {number} ageYears Wiek w latach.
   * @param {Object} [opts] Ustawienia:
   *   • population: 'healthy' | 'hospital'
   *   • temperature: liczba (°C) – korekta gorączkowa
   *   • hrOffset: liczba – dodatkowy offset centyli (domyślne 0)
   * @returns {Object} { p10, median, p90 }
   */
  function getHrValues(ageYears, opts = {}) {
    const { population = 'healthy', temperature = null, hrOffset = 0 } = opts;
    const base = getBaseHrValues(ageYears, population);
    let { p10, median, p90 } = base;
    // Dodatkowy offset pozwala na korekcję zewnętrzną (np. dopasowanie do innego badania)
    if (typeof hrOffset === 'number' && hrOffset !== 0) {
      p10 += hrOffset;
      median += hrOffset;
      p90 += hrOffset;
    }
    // Korekta gorączkowa HR (Daymont)
    if (temperature != null && Number.isFinite(temperature)) {
      const delta = temperature - 37.0;
      p10 += TEMP_HR_SLOPE * delta;
      median += TEMP_HR_SLOPE * delta;
      p90 += TEMP_HR_SLOPE * delta;
    }
    return { p10, median, p90 };
  }

  /**
   * Zwraca centyle RR z uwzględnieniem opcjonalnych korekt.
   * @param {number} ageYears Wiek w latach.
   * @param {Object} [opts] Ustawienia:
   *   • population: 'healthy' | 'hospital'
   *   • temperature: liczba (°C) – korekta gorączkowa
   *   • state: 'awake' | 'sleep' – korekta snu
   *   • rrOffset: liczba – dodatkowy offset centyli (domyślne 0)
   * @returns {Object} { p10, median, p90 }
   */
  function getRrValues(ageYears, opts = {}) {
    const { population = 'healthy', temperature = null, state = 'awake', rrOffset = 0 } = opts;
    const base = getBaseRrValues(ageYears, population);
    let { p10, median, p90 } = base;
    // Dodatkowy offset – rzadko używany; pozwala dopasować dane do lokalnych obserwacji
    if (typeof rrOffset === 'number' && rrOffset !== 0) {
      p10 += rrOffset;
      median += rrOffset;
      p90 += rrOffset;
    }
    // Korekta gorączkowa RR (Nijman)
    if (temperature != null && Number.isFinite(temperature)) {
      const delta = temperature - 37.0;
      p10 += TEMP_RR_SLOPE * delta;
      median += TEMP_RR_SLOPE * delta;
      p90 += TEMP_RR_SLOPE * delta;
    }
    // Korekta snu (Herbert) – tylko jeśli state ~ 'sleep'
    const s = String(state).toLowerCase();
    if (s === 'sleep' || s === 'asleep' || s === 'sleeping') {
      const reduction = sleepRrAdjustment(ageYears);
      p10 = Math.max(0, p10 - reduction);
      median = Math.max(0, median - reduction);
      p90 = Math.max(0, p90 - reduction);
    }
    return { p10, median, p90 };
  }

  /**
   * Szacowanie centyla na podstawie wartości pomiaru i wyznaczonych
   * 10., 50. i 90. centyla.  Używa interpolacji liniowej między
   * przedziałami (0–10., 10.–50., 50.–90., 90.–∞).
   * @param {number} value Wartość pomiaru.
   * @param {number} p10 10. centyl.
   * @param {number} median 50. centyl.
   * @param {number} p90 90. centyl.
   * @returns {number} Szacowany centyl w przedziale 0–100 (może zwrócić NaN).
   */
  function estimatePercentile(value, p10, median, p90) {
    const v = Number(value);
    if (!Number.isFinite(v) || !Number.isFinite(p10) || !Number.isFinite(median) || !Number.isFinite(p90)) {
      return NaN;
    }
    if (!(p10 < median && median < p90)) {
      return NaN;
    }
    // Poniżej 10. centyla
    if (v <= p10) {
      return p10 === 0 ? 0 : Math.max(0, 10 * v / p10);
    }
    // 10–50
    if (v <= median) {
      return 10 + (v - p10) * 40 / (median - p10);
    }
    // 50–90
    if (v <= p90) {
      return 50 + (v - median) * 40 / (p90 - median);
    }
    // powyżej 90
    return Math.min(100, 90 + (v - p90) * 10 / (p90 - median));
  }

  /**
   * Zwraca przybliżony centyl tętna na podstawie wieku i zmierzonej wartości.
   * @param {number} ageYears Wiek w latach.
   * @param {number} hrValue Zmierzona częstość akcji serca (ud./min).
   * @param {Object} [opts] Ustawienia jak w getHrValues().
   * @returns {number} Centyl (0–100) lub NaN przy błędzie.
   */
  function getHrPercentile(ageYears, hrValue, opts = {}) {
    const { p10, median, p90 } = getHrValues(ageYears, opts);
    return estimatePercentile(hrValue, p10, median, p90);
  }

  /**
   * Zwraca przybliżony centyl częstości oddechów na podstawie wieku i
   * zmierzonej wartości.
   * @param {number} ageYears Wiek w latach.
   * @param {number} rrValue Zmierzona liczba oddechów na minutę.
   * @param {Object} [opts] Ustawienia jak w getRrValues().
   * @returns {number} Centyl (0–100) lub NaN przy błędzie.
   */
  function getRrPercentile(ageYears, rrValue, opts = {}) {
    const { p10, median, p90 } = getRrValues(ageYears, opts);
    return estimatePercentile(rrValue, p10, median, p90);
  }

  // Eksport API.  W środowisku Node pozwalamy na require().  W przeglądarce
  // przyłączamy funkcje do window.vitalSigns, aby umożliwić proste użycie
  // poprzez window.vitalSigns.getHrValues() itd.
  const api = {
    getHrValues,
    getRrValues,
    getHrPercentile,
    getRrPercentile,
    // opcjonalnie eksportujmy wewnętrzne funkcje (przydatne w testach)
    _getHealthyHrValues: getHealthyHrValues,
    _getHealthyRrValues: getHealthyRrValues,
    _getHospitalHrValues: getHospitalHrValues,
    _getHospitalRrValues: getHospitalRrValues,
    _sleepRrAdjustment: sleepRrAdjustment
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof window !== 'undefined') {
    window.vitalSigns = api;
  }
})();