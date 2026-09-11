/* vilda_blum_iss.js — silnik prognozy wzrostu ostatecznego dla dzieci NISKOROSŁYCH (ISS)
 * wg Bluma i wsp. 2022 (10 równań regresji, kohorta niemiecko-holenderska).
 *
 * ŹRÓDŁO WSPÓŁCZYNNIKÓW (medycznie krytyczne):
 *   Blum WF, Ranke MB, Keller E, Keller A, Barth S, de Bruin C, Wudy SA, Wit JM. „A Novel Method
 *   for Adult Height Prediction in Children With Idiopathic Short Stature Derived From a
 *   German-Dutch Cohort." J Endocr Soc 2022;6(7):bvac074. PMID 35668996, PMC9155597,
 *   DOI 10.1210/jendso/bvac074 (otwarty dostęp; tabela 2 — współczynniki; tabela 3 — walidacja).
 *   Współczynniki przepisane z tabeli 2 co do cyfry i sprawdzone na przykładzie liczbowym
 *   z pracy (chłopiec 10,0 l, 123,0 cm, matka 167,5, ojciec 180,5 → TH 174,0, BA 8,0 → BA/CA 0,80):
 *   M2 → 165,9 cm; M5 (tylko matka) → 166,8; M8 (tylko ojciec) → 168,6; M10 (bez rodziców) → 165,2.
 *
 * POPULACJA I ZAKRES STOSOWANIA (od autorów, dosłownie: „the algorithms should not be applied
 * to normally growing or tall children"):
 *   • 292 dzieci z ISS (FSS 26%, non-FSS/CDGP 73%), wzrost < 10. centyla przy zgłoszeniu,
 *     93% z opóźnieniem wieku kostnego > 1 rok; wiek 3,4–17,3 l (średnio 12,7); urodzeni ~1975.
 *   • Silnik liczy WYŁĄCZNIE przy hSDS ≤ −1,28 (10. centyl) — inaczej reason:"not-short-stature".
 *   • Wiek metrykalny 4,0–17,0 l (bez ekstrapolacji poza próbę).
 *
 * METODA (równania liniowe, cm):
 *   PAH = β0 + β_CA·CA[l] + β_H0·wzrost[cm] + β_TH·TH[cm] | β_MoH·matka[cm] | β_FaH·ojciec[cm]
 *         + β_BA·(BA/CA) + β_BiWt·masa urodzeniowa[kg] + β_sex·płeć (M = 1, K = 2)
 *   TH = (wzrost matki + wzrost ojca)/2 — PROSTA średnia rodziców. UWAGA (rozbieżność w źródle):
 *   opis metod pracy mówi o „sex-corrected mid-parental height (Tanner)", ale przykład liczbowy
 *   w pracy (matka 167,5, ojciec 180,5 → „TH 174,0") to prosta średnia, i tylko z nią M2 daje
 *   podane 165,9 cm (z celem Tannera 180,5 wyszłoby 168,1). Przyjęto wersję zgodną z przykładem
 *   — jedynym sprawdzalnym punktem; płeć wchodzi osobno przez β_sex. Zgłoszone właścicielowi.
 *   Wybór równania wg dostępnych danych (priorytet: więcej zmiennych = mniejszy RMSE):
 *     rodzice oboje → M1 (z masą urodzeniową i BA) / M2 (BA) / M3 (bez BA)
 *     tylko matka  → M4 / M5 / M6
 *     tylko ojciec → M7 / M8 / M9
 *     bez rodziców → M10 (wymaga BA)
 *   Błąd: RMSE modelu z tabeli 2 (3,16–3,68 cm); półszerokość 90% = RMSE × 1,645.
 *
 * KONTRAKT (jak calculateKhamisRochePrediction), wejście:
 *   { sex:'M'|'F', chronologicalAgeYears, chronologicalAgeMonths (łączne, pierwszeństwo),
 *     currentHeightCm, heightSds, motherHeightCm, fatherHeightCm, boneAgeYears, birthWeightKg }
 * Wyjście: { available:true, predictedAdultHeightCm, predictedAdultHeightCmRaw,
 *            clampedToCurrentHeight, method:'blum-iss', modelId, modelVariables, rmseCm,
 *            errorBoundHalfWidthCm, usedBoneAge, heightSds, targetHeightCm|null }
 *          lub { available:false, reason:'missing-input'|'missing-sex'|'missing-chronological-age'|
 *                'missing-height-sds'|'not-short-stature'|'out-of-range'|'no-model' }
 *
 * OGRANICZENIE OD DOŁU AKTUALNYM WZROSTEM — jak KR/RWT (decyzja właściciela 2026-08-13):
 *   predictedAdultHeightCm ≥ aktualny wzrost; surowy wynik w predictedAdultHeightCmRaw.
 */
(function (w) {
  'use strict';

  var MIN_AGE = 4.0;
  var MAX_AGE = 17.0;
  var SHORT_STATURE_SDS = -1.28; // 10. centyl — kryterium włączenia kohorty Bluma
  var CI90_FACTOR = 1.645;

  // Tabela 2 pracy. Pola: β0, CA, H0, TH, MoH, FaH, BA/CA, BiWt, Sex, RMSE, opis zmiennych.
  var MODELS = {
    1:  { b0: 63.3339,  ca: -2.9595, h0: 0.7256, th: 0.3173, moh: null,   fah: null,   ba: -13.0399, biwt: 1.2695, sex: -6.2213,  rmse: 3.16, vars: 'CA, H0, TH, płeć, BA/CA, masa urodzeniowa' },
    2:  { b0: 62.1795,  ca: -2.9892, h0: 0.7328, th: 0.3442, moh: null,   fah: null,   ba: -12.6821, biwt: null,   sex: -6.3021,  rmse: 3.30, vars: 'CA, H0, TH, płeć, BA/CA' },
    3:  { b0: 50.3654,  ca: -2.6372, h0: 0.6408, th: 0.3986, moh: null,   fah: null,   ba: null,     biwt: null,   sex: -5.9171,  rmse: 3.46, vars: 'CA, H0, TH, płeć' },
    4:  { b0: 80.3645,  ca: -3.4309, h0: 0.8241, th: null,   moh: 0.2242, fah: null,   ba: -15.1678, biwt: 1.2688, sex: -10.2474, rmse: 3.20, vars: 'CA, H0, wzrost matki, płeć, BA/CA, masa urodzeniowa' },
    5:  { b0: 83.4866,  ca: -3.4717, h0: 0.8374, th: null,   moh: 0.2234, fah: null,   ba: -14.7156, biwt: null,   sex: -10.6257, rmse: 3.36, vars: 'CA, H0, wzrost matki, płeć, BA/CA' },
    6:  { b0: 75.8792,  ca: -3.1944, h0: 0.7581, th: null,   moh: 0.2449, fah: null,   ba: null,     biwt: null,   sex: -10.9519, rmse: 3.57, vars: 'CA, H0, wzrost matki, płeć' },
    7:  { b0: 93.2475,  ca: -3.4020, h0: 0.8239, th: null,   moh: null,   fah: 0.1203, ba: -14.2739, biwt: 1.6156, sex: -10.0340, rmse: 3.34, vars: 'CA, H0, wzrost ojca, płeć, BA/CA, masa urodzeniowa' },
    8:  { b0: 94.2381,  ca: -3.5784, h0: 0.8759, th: null,   moh: null,   fah: 0.1348, ba: -14.2476, biwt: null,   sex: -10.5319, rmse: 3.49, vars: 'CA, H0, wzrost ojca, płeć, BA/CA' },
    9:  { b0: 84.3600,  ca: -3.2207, h0: 0.7623, th: null,   moh: null,   fah: 0.1775, ba: null,     biwt: null,   sex: -10.8759, rmse: 3.68, vars: 'CA, H0, wzrost ojca, płeć' },
    10: { b0: 110.8863, ca: -4.1250, h0: 0.9661, th: null,   moh: null,   fah: null,   ba: -16.0541, biwt: null,   sex: -10.4331, rmse: 3.58, vars: 'CA, H0, płeć, BA/CA' }
  };

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : Number(v);
    return isFinite(n) ? n : null;
  }
  function sexKey(sex) {
    var s = String(sex || '').trim().toUpperCase();
    if (s === 'M') return 'M';
    if (s === 'F' || s === 'K') return 'F';
    return null;
  }
  function ageYearsFrom(input) {
    var months = num(input.chronologicalAgeMonths);
    if (months !== null && months > 0) return months / 12;
    var years = num(input.chronologicalAgeYears);
    return years !== null && years > 0 ? years : null;
  }
  function round1(v) { return Math.round(v * 10) / 10; }

  // Wybór równania wg dostępności rodziców, wieku kostnego i masy urodzeniowej.
  function pickModel(hasMother, hasFather, hasBone, hasBirthWeight) {
    if (hasMother && hasFather) return hasBone ? (hasBirthWeight ? 1 : 2) : 3;
    if (hasMother) return hasBone ? (hasBirthWeight ? 4 : 5) : 6;
    if (hasFather) return hasBone ? (hasBirthWeight ? 7 : 8) : 9;
    return hasBone ? 10 : null;
  }

  function calculateBlumIssPrediction(input) {
    if (!input || typeof input !== 'object') return { available: false, reason: 'missing-input' };
    var sex = sexKey(input.sex);
    if (!sex) return { available: false, reason: 'missing-sex' };
    var ageYears = ageYearsFrom(input);
    if (ageYears === null) return { available: false, reason: 'missing-chronological-age' };
    var heightCm = num(input.currentHeightCm);
    if (heightCm === null || heightCm <= 0) return { available: false, reason: 'missing-input' };
    var heightSds = num(input.heightSds);
    if (heightSds === null) return { available: false, reason: 'missing-height-sds' };
    if (heightSds > SHORT_STATURE_SDS) return { available: false, reason: 'not-short-stature', heightSds: heightSds };
    if (ageYears < MIN_AGE || ageYears > MAX_AGE) return { available: false, reason: 'out-of-range', ageYears: ageYears };

    var mother = num(input.motherHeightCm), father = num(input.fatherHeightCm);
    if (mother !== null && mother <= 0) mother = null;
    if (father !== null && father <= 0) father = null;
    var boneAge = num(input.boneAgeYears);
    if (boneAge !== null && boneAge <= 0) boneAge = null;
    var birthWeight = num(input.birthWeightKg);
    // Masa urodzeniowa w kg; wartość > 20 traktowana jako gramy (3200 → 3,2); poza 0–10 kg → brak.
    if (birthWeight !== null && birthWeight > 20) birthWeight = birthWeight / 1000;
    if (birthWeight !== null && (birthWeight <= 0 || birthWeight > 10)) birthWeight = null;

    var modelId = pickModel(mother !== null, father !== null, boneAge !== null, birthWeight !== null);
    if (!modelId) return { available: false, reason: 'no-model' };
    var m = MODELS[modelId];

    // Prosta średnia rodziców — patrz nagłówek (rozbieżność opis/przykład w źródle).
    var targetHeight = (mother !== null && father !== null) ? (mother + father) / 2 : null;

    var raw = m.b0 + m.ca * ageYears + m.h0 * heightCm + m.sex * (sex === 'M' ? 1 : 2);
    if (m.th !== null) raw += m.th * targetHeight;
    if (m.moh !== null) raw += m.moh * mother;
    if (m.fah !== null) raw += m.fah * father;
    if (m.ba !== null) raw += m.ba * (boneAge / ageYears);
    if (m.biwt !== null) raw += m.biwt * birthWeight;
    if (!isFinite(raw)) return { available: false, reason: 'missing-input' };

    raw = round1(raw);
    var clamped = raw < heightCm;
    var predicted = clamped ? round1(heightCm) : raw;
    var halfWidth = round1(m.rmse * CI90_FACTOR);
    return {
      available: true,
      method: 'blum-iss',
      predictedAdultHeightCm: predicted,
      predictedAdultHeightCmRaw: raw,
      clampedToCurrentHeight: clamped,
      modelId: modelId,
      modelVariables: m.vars,
      rmseCm: m.rmse,
      errorBoundHalfWidthCm: halfWidth,
      hasErrorInterval: true,
      predictionIntervalLowerCm: Math.max(round1(raw - halfWidth), round1(heightCm)), // GROWTH-PRED-CLAMP: nie niżej niż obecny wzrost
      predictionIntervalUpperCm: Math.max(round1(raw + halfWidth), predicted),
      usedBoneAge: m.ba !== null,
      relativeBoneAge: m.ba !== null ? Math.round((boneAge / ageYears) * 1000) / 1000 : null,
      heightSds: heightSds,
      targetHeightCm: targetHeight !== null ? round1(targetHeight) : null,
      ageYears: ageYears,
      sex: sex
    };
  }

  w.calculateBlumIssPrediction = calculateBlumIssPrediction;
  w.VildaBlumIss = {
    version: '1.0.0',
    calculate: calculateBlumIssPrediction,
    MODELS: MODELS,
    SHORT_STATURE_SDS: SHORT_STATURE_SDS,
    MIN_AGE: MIN_AGE,
    MAX_AGE: MAX_AGE,
    _pickModel: pickModel
  };
})(typeof window !== 'undefined' ? window : this);
