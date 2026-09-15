/* vilda_growth_prediction_validation_model.js — model karty „Walidacja prognoz".
 *
 * PO CO TO JEST (decyzja właściciela 2026-09-15, etap 2a). Karta walidacji liczyła prognozy
 * dla punktów historycznych, wołając CZTERY surowe silniki wprost i omijając całą warstwę
 * decyzyjną karty „Zaawansowane obliczenia wzrostowe". Miało to cztery skutki, wszystkie złe:
 *
 *   1. Karta oceniała cztery metody, a aplikacja liczy siedem plus konsensus — Blum/ISS,
 *      TW Mark II i „wzrost przy menarche / 0,955" nie były mierzone wcale.
 *   2. NIE mierzyła KONSENSUSU, czyli dokładnie tej liczby, którą aplikacja podaje jako
 *      prognozę i którą drukuje raport. Karta odpowiadała na wszystko oprócz pytania, po
 *      które powstała.
 *   3. Pomijała korekty (`GROWTH-PRED-BIAS`) i bramki stosowalności (`GROWTH-PRED-DOBOR`),
 *      więc oceniała metodę w wersji, której aplikacja nie użyła: Khamis–Roche wykluczona
 *      z konsensusu przy rozbieżności wieku kostnego ≥ 24 mies. była tu liczona jako
 *      równorzędna, a Bayley–Pinneau bez korekty −2/−4 cm.
 *   4. Kolumna Reinehr/CDGP NIGDY się nie wypełniała — silnik wymaga `profileModel`, którego
 *      karta nie przekazywała, a opóźnienie wieku kostnego liczyła z ODWROTNYM znakiem.
 *
 * CO ROBI TEN MODUŁ: dla każdego punktu historycznego składa wejście karty C i woła
 * `VildaGrowthCardC.computeFinalHeightPrediction` — tę samą funkcję, którą liczy karta,
 * raport i zalecenia. Nie liczy prognoz sam i nie zna żadnego wzoru medycznego. Profil KOWD
 * (bramka Reinehra) bierze z produkcyjnego `advGrowthBuildKowdProfileModel`, profil
 * pokwitaniowy z `VildaPubertyProfile.ocenProfil` — obu też nie kopiuje.
 *
 * DWA ZESTAWY LICZB. Każda metoda ma tu dwie wartości i dwa komplety metryk:
 *   • `publikacja` — wynik tak, jak podają go autorzy; to widać na obu kartach klinicznych
 *     (`GROWTH-PRED-PUBLIKACJA`);
 *   • `konsensus` — wartość po naszych korektach; tą liczbą aplikacja naprawdę policzyła
 *     prognozę.
 * Różnica MAE między nimi jest jedynym miejscem w aplikacji, w którym widać, czy nasze
 * własne korekty pomagają, czy szkodzą.
 *
 * RANKING „najbliżej FH" (decyzja właściciela 2026-09-15): minimum trzy punkty, liczony
 * z wartości W KONSENSUSIE (bo tych aplikacja użyła), a metoda musi w co najmniej trzech
 * punktach naprawdę wejść do konsensusu — inaczej ranking premiowałby metodę, której sami
 * nie użyliśmy. Konsensus dostaje własne metryki, ale w rankingu NIE startuje: jest metodą
 * pochodną i wygrana nad składowymi nie byłaby niezależnym dowodem.
 *
 * CZEGO TU NIE MA: prezentacji. Moduł zwraca model; tabelę, kafelki i eksport rysuje
 * `vilda_growth_prediction_validation.js`.
 */
(function (w) {
  'use strict';

  var VERSION = '1';
  var MIN_PUNKTOW_RANKINGU = 3;

  /* Metody, których kolumna stoi ZAWSZE — także gdy u tego pacjenta nic nie policzyły. Pusta
   * kolumna z nazwanym powodem („brak wieku kostnego") mówi lekarzowi, że metoda istnieje
   * i czego jej brakuje; zniknięcie kolumny nie mówi nic. Metody wąskiego wskazania
   * (Blum/ISS, TW Mark II, wzrost przy menarche) dochodzą dopiero wtedy, gdy się policzą —
   * inaczej większość pacjentów oglądałaby trzy puste kolumny bez znaczenia klinicznego.
   * Etykiety muszą się zgadzać z kartą C; gdy metoda się policzy, etykieta z niej wygrywa. */
  var METODY_PODSTAWOWE = [
    { key: 'rwt', label: 'RWT' },
    { key: 'bp', label: 'Bayley–Pinneau' },
    { key: 'khamis', label: 'Khamis–Roche' },
    { key: 'reinehr', label: 'Reinehr/CDGP' }
  ];

  // Wiek, od którego uznajemy wzrost za prawdopodobnie zakończony — te same progi, których
  // karta używała dotąd do automatycznego wskazania FH.
  var BA_ZAKONCZONY = { F: 15, M: 17 };
  var CA_ZAKONCZONY = { F: 16, M: 18 };

  function liczba(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      var p = parseFloat(v.replace(',', '.'));
      return isFinite(p) ? p : null;
    }
    return null;
  }
  function dodatnia(v) { var n = liczba(v); return n !== null && n > 0 ? n : null; }
  function zaokr1(v) { return typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : null; }

  function plecKod(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === 'f' || s === 'k' || s === 'dz' || s === 'dziewczynka' || s === 'female') return 'F';
    return 'M';
  }
  function plecEtykieta(k) { return k === 'F' ? 'dziewczynka' : 'chłopiec'; }

  function fun(nazwa) {
    try { return typeof w[nazwa] === 'function' ? w[nazwa] : null; } catch (e) { return null; }
  }

  /* hSDS w wieku punktu — tą samą ścieżką, którą liczy reszta aplikacji (źródło norm wg
   * `bmiSource`, z przełączeniem na Palczewską poniżej progu OLAF). Potrzebny bramkom
   * `GROWTH-PRED-BIAS` (progi ±2 SDS) i metodzie Blum/ISS (hSDS ≤ −1,28). */
  function hSds(wzrost, plec, wiekLat) {
    if (wzrost === null || wiekLat === null) return null;
    try {
      var zrodlo = typeof w.bmiSource === 'string' ? String(w.bmiSource).toUpperCase() : 'OLAF';
      var progOlaf = typeof w.OLAF_DATA_MIN_AGE === 'number' ? w.OLAF_DATA_MIN_AGE : 3;
      var pal = zrodlo === 'PALCZEWSKA' || (zrodlo === 'OLAF' && wiekLat < progOlaf);
      var f = pal ? fun('calcPercentileStatsPal') : fun('calcPercentileStats');
      if (!f) f = fun('calcPercentileStats');
      if (!f) return null;
      var st = f(wzrost, plec, wiekLat, 'HT');
      return st && typeof st.sd === 'number' && isFinite(st.sd) ? st.sd : null;
    } catch (e) { return null; }
  }

  /* Mediana i LMS wzrostu dorosłego (18 l) — kotwica MPH w konsensusie i ocena wobec celu. */
  function normyDorosle(plec) {
    try {
      var f = fun('getChildLMS');
      if (!f) return { median: null, lms: null };
      var L = f(plec, 18, 'h');
      if (!L || L.length < 2) return { median: null, lms: null };
      var l0 = Number(L[0]), m0 = Number(L[1]), s0 = L.length > 2 ? Number(L[2]) : NaN;
      var median = isFinite(m0) && m0 > 0 ? m0 : null;
      var lms = (median !== null && isFinite(s0) && s0 > 0) ? { L: isFinite(l0) ? l0 : 1, M: m0, S: s0 } : null;
      return { median: median, lms: lms };
    } catch (e) { return { median: null, lms: null }; }
  }

  function mphZRodzicow(plecKodowa, matka, ojciec) {
    if (matka === null || ojciec === null) return null;
    return plecKodowa === 'F' ? (matka + ojciec - 13) / 2 : (matka + ojciec + 13) / 2;
  }

  /* ——— punkty pomiarowe ——— */

  /* Oś czasu: pomiary karty zaawansowanej + punkty terapii GH + pomiar bieżący, scalane po
   * wieku w miesiącach (jeden punkt na wiek, później wpisane pola uzupełniają wcześniejsze). */
  function punktyZPayloadu(payload) {
    var user = payload.user || {};
    var adv = payload.advanced || {};
    var dane = adv.data && typeof adv.data === 'object' ? adv.data : {};
    var wg = Object.create(null);

    function dodaj(p) {
      if (p.ageMonths === null || !(p.ageMonths > 0)) return;
      var k = String(Math.round(p.ageMonths));
      if (!wg[k]) {
        wg[k] = { ageMonths: Math.round(p.ageMonths), height: null, weight: null, boneAgeYears: null, biezacy: false };
      }
      if (p.height !== null) wg[k].height = p.height;
      if (p.weight !== null) wg[k].weight = p.weight;
      if (p.boneAgeYears !== null) wg[k].boneAgeYears = p.boneAgeYears;
      if (p.biezacy) wg[k].biezacy = true;
    }

    var gh = Array.isArray(payload.ghTherapyPoints) ? payload.ghTherapyPoints : [];
    gh.forEach(function (p) {
      if (!p || typeof p !== 'object') return;
      var lata = liczba(p.ageYears), mies = liczba(p.ageMonths);
      if (lata === null && mies === null) return;
      dodaj({
        ageMonths: Math.round((lata || 0) * 12 + (mies || 0)),
        height: liczba(p.height), weight: liczba(p.weight), boneAgeYears: dodatnia(p.boneAge), biezacy: false
      });
    });

    var pomiary = Array.isArray(dane.measurements) ? dane.measurements : [];
    pomiary.forEach(function (p) {
      if (!p || p.ghSync === true) return;
      var m = liczba(p.ageMonths);
      if (m === null) return;
      dodaj({ ageMonths: Math.round(m), height: liczba(p.height), weight: liczba(p.weight),
        boneAgeYears: dodatnia(p.boneAgeYears), biezacy: false });
    });

    var lata = liczba(user.age), mies = liczba(user.ageMonths);
    if (lata !== null || mies !== null) {
      dodaj({ ageMonths: Math.round((lata || 0) * 12 + (mies || 0)), height: liczba(user.height),
        weight: liczba(user.weight), boneAgeYears: dodatnia(adv.boneAgeYears), biezacy: true });
    }

    return Object.keys(wg).map(function (k) {
      var p = wg[k];
      p.ageYears = p.ageMonths / 12;
      p.boneAgeMonths = p.boneAgeYears !== null ? Math.round(p.boneAgeYears * 12) : null;
      p.key = String(p.ageMonths);
      return p;
    }).sort(function (a, b) { return a.ageMonths - b.ageMonths; });
  }

  function wzrostZakonczony(punkt, plecKodowa) {
    if (!punkt) return false;
    if (punkt.boneAgeYears !== null && punkt.boneAgeYears > 0) {
      return punkt.boneAgeYears >= (plecKodowa === 'F' ? BA_ZAKONCZONY.F : BA_ZAKONCZONY.M);
    }
    return punkt.ageYears >= (plecKodowa === 'F' ? CA_ZAKONCZONY.F : CA_ZAKONCZONY.M);
  }

  /* ——— prognoza dla jednego punktu ——— */

  /* Profil KOWD decyduje, czy model Reinehra w ogóle wolno policzyć. Karta walidacji dotąd
   * go NIE przekazywała, więc kolumna Reinehra była zawsze pusta — a opóźnienie wieku
   * kostnego liczyła jako `wiek kostny − metrykalny`, czyli z odwrotnym znakiem względem
   * tego, czego oczekuje silnik. Oba błędy naprawia ta funkcja, wołając produkcyjny
   * budowniczy profilu zamiast przepisywać jego reguły. */
  function profilKowd(punkt, ctx) {
    var f = fun('advGrowthBuildKowdProfileModel');
    if (!f) return null;
    try {
      return f({
        sex: ctx.plec, chronologicalAgeYears: punkt.ageYears, chronologicalAgeMonths: punkt.ageMonths,
        boneAgeYears: punkt.boneAgeYears, currentHeightCm: punkt.height, targetHeightCm: ctx.mph,
        heightSds: punkt.heightSds, testicularVolume: ctx.jadra, familyDelayedPuberty: ctx.wywiadOpoznienie,
        growthExclusion: ctx.wykluczenie,
        rwtDataComplete: punkt.height !== null && punkt.weight !== null && ctx.matka !== null && ctx.ojciec !== null
      });
    } catch (e) { return null; }
  }

  function profilPokwitania(punkt, ctx) {
    var api = w.VildaPubertyProfile;
    if (!api || typeof api.ocenProfil !== 'function') return null;
    try {
      return api.ocenProfil({
        plec: ctx.plec, wiekLat: punkt.ageYears, wiekKostnyLat: punkt.boneAgeYears,
        wiekStartuLat: ctx.startPokwitania, wiekMenarcheLat: ctx.wiekMenarche,
        postmenarcheal: poMenarche(punkt, ctx), jadra: ctx.jadra
      });
    } catch (e) { return null; }
  }

  /* Status „po menarche" dla punktu historycznego wynika z porównania wieku punktu z wiekiem
   * menarche — tej daty nie trzeba nigdzie dopisywać, rekord już ją niesie. */
  function poMenarche(punkt, ctx) {
    if (ctx.plec !== 'F' || ctx.wiekMenarche === null) return false;
    return punkt.ageYears >= ctx.wiekMenarche;
  }

  function silnikBp(punkt, ctx, profil) {
    var f = fun('calculateBayleyPinneauPrediction');
    if (!f || punkt.height === null || punkt.boneAgeYears === null) return null;
    try {
      return f({ sex: ctx.plec, chronologicalAgeMonths: punkt.ageMonths, chronologicalAgeYears: punkt.ageYears,
        boneAgeYears: punkt.boneAgeYears, currentHeightCm: punkt.height, profileModel: profil });
    } catch (e) { return null; }
  }
  function silnikRwt(punkt, ctx) {
    var f = fun('calculateRWTPrediction');
    if (!f || punkt.height === null || punkt.weight === null || ctx.matka === null || ctx.ojciec === null) return null;
    try {
      return f({ sex: ctx.plec, chronologicalAgeMonths: punkt.ageMonths, chronologicalAgeYears: punkt.ageYears,
        currentHeightCm: punkt.height, currentWeightKg: punkt.weight,
        motherHeightCm: ctx.matka, fatherHeightCm: ctx.ojciec, boneAgeYears: punkt.boneAgeYears });
    } catch (e) { return null; }
  }
  function silnikReinehr(punkt, ctx, profil) {
    var f = fun('calculateReinehrCdgpPrediction');
    if (!f || punkt.height === null) return null;
    try {
      return f({ sex: ctx.plec, chronologicalAgeMonths: punkt.ageMonths, chronologicalAgeYears: punkt.ageYears,
        boneAgeYears: punkt.boneAgeYears, currentHeightCm: punkt.height,
        // ZNAK: silnik oczekuje `wiek metrykalny − kostny` (dodatnie = opóźnienie). Karta
        // liczyła to odwrotnie i model odmawiał wyniku nawet przy przekazanym profilu.
        boneAgeDelayYears: punkt.boneAgeYears === null ? null : punkt.ageYears - punkt.boneAgeYears,
        profileModel: profil });
    } catch (e) { return null; }
  }

  function prognozaPunktu(punkt, ctx) {
    var api = w.VildaGrowthCardC;
    if (!api || typeof api.computeFinalHeightPrediction !== 'function') return null;
    var profil = profilKowd(punkt, ctx);
    var wejscie = {
      sex: ctx.plec, ageYears: punkt.ageYears, ageMonths: punkt.ageMonths,
      currentHeightCm: punkt.height, currentWeightKg: punkt.weight, boneAgeYears: punkt.boneAgeYears,
      motherHeightCm: ctx.matka, fatherHeightCm: ctx.ojciec, mphCm: ctx.mph,
      heightSds: punkt.heightSds, adultMedianHeightCm: ctx.medianaDorosla, adultHeightLMS: ctx.lmsDorosly,
      boneAgeSource: ctx.zrodloWiekuKostnego,
      bp: silnikBp(punkt, ctx, profil),
      rwt: silnikRwt(punkt, ctx),
      reinehr: silnikReinehr(punkt, ctx, profil),
      pubertyProfile: profilPokwitania(punkt, ctx),
      postmenarcheal: poMenarche(punkt, ctx),
      menarcheAgeYears: ctx.wiekMenarche,
      heightAtMenarcheCm: ctx.wzrostPrzyMenarche,
      boneAgeAtMenarcheYears: ctx.wiekKostnyPrzyMenarche
    };
    try { return api.computeFinalHeightPrediction(wejscie); } catch (e) { return null; }
  }

  /* ——— metryki ——— */

  function srednia(lista) {
    if (!lista.length) return null;
    var s = 0;
    for (var i = 0; i < lista.length; i += 1) s += lista[i];
    return zaokr1(s / lista.length);
  }

  function metrykiMetody(punkty, klucz) {
    var bledyPub = [], bledyKons = [], wKonsensusie = 0;
    punkty.forEach(function (p) {
      if (p.isFH) return;
      var pr = p.preds && p.preds[klucz];
      if (!pr) return;
      if (typeof pr.errPub === 'number' && isFinite(pr.errPub)) bledyPub.push(pr.errPub);
      if (typeof pr.errKons === 'number' && isFinite(pr.errKons)) {
        bledyKons.push(pr.errKons);
        if (!pr.excluded) wKonsensusie += 1;
      }
    });
    return {
      n: bledyPub.length,
      nWKonsensusie: wKonsensusie,
      maePub: srednia(bledyPub.map(Math.abs)), mePub: srednia(bledyPub),
      maeKons: srednia(bledyKons.map(Math.abs)), meKons: srednia(bledyKons)
    };
  }

  function metrykiKonsensusu(punkty) {
    var bledy = [];
    punkty.forEach(function (p) {
      if (p.isFH || !p.konsensus) return;
      if (typeof p.konsensus.err === 'number' && isFinite(p.konsensus.err)) bledy.push(p.konsensus.err);
    });
    return { n: bledy.length, mae: srednia(bledy.map(Math.abs)), me: srednia(bledy) };
  }

  /* Pastylkę „najbliżej FH" dostaje metoda z co najmniej trzema punktami, które NAPRAWDĘ
   * weszły do konsensusu. Bez drugiego warunku ranking mógłby wskazać metodę wykluczoną
   * bramką we wszystkich punktach — czyli taką, której aplikacja u tego pacjenta nie użyła. */
  function najblizejFH(metody, summary) {
    var najlepszy = null, najlepszaMae = Infinity;
    metody.forEach(function (m) {
      if (!m.pred || m.pochodna) return;
      var s = summary[m.key];
      if (!s || s.n < MIN_PUNKTOW_RANKINGU || s.nWKonsensusie < MIN_PUNKTOW_RANKINGU) return;
      if (typeof s.maeKons !== 'number' || !isFinite(s.maeKons)) return;
      if (s.maeKons < najlepszaMae) { najlepszaMae = s.maeKons; najlepszy = m.key; }
    });
    return najlepszy;
  }

  /* ——— model ——— */

  function policzDlaPayloadu(payload, opcje) {
    var o = opcje && typeof opcje === 'object' ? opcje : {};
    var pusty = { ok: false, reason: null, points: [], methods: [], summary: {}, konsensus: null, best: null };
    if (!payload || typeof payload !== 'object') { pusty.reason = 'no-payload'; return pusty; }

    var user = payload.user || {};
    var adv = payload.advanced || {};
    var pub = payload.puberty && typeof payload.puberty === 'object' ? payload.puberty : {};
    var plec = plecKod(user.sex || (adv.data && adv.data.sex) || 'M');
    var matka = dodatnia(adv.motherHeight);
    var ojciec = dodatnia(adv.fatherHeight);
    var normy = normyDorosle(plec);

    var ctx = {
      plec: plec, matka: matka, ojciec: ojciec,
      mph: zaokr1(mphZRodzicow(plec, matka, ojciec)),
      medianaDorosla: normy.median, lmsDorosly: normy.lms,
      jadra: adv.testicularVolume == null ? '' : String(adv.testicularVolume),
      wywiadOpoznienie: adv.familyDelayedPuberty == null ? '' : String(adv.familyDelayedPuberty),
      wykluczenie: adv.growthExclusion == null ? '' : String(adv.growthExclusion),
      startPokwitania: liczba(pub.onsetAgeYears),
      wiekMenarche: liczba(pub.menarcheAgeYears),
      wzrostPrzyMenarche: liczba(pub.heightAtMenarcheCm),
      wiekKostnyPrzyMenarche: liczba(pub.boneAgeAtMenarcheYears),
      zrodloWiekuKostnego: adv.boneAgeSource ? String(adv.boneAgeSource) : 'GP'
    };

    var punkty = punktyZPayloadu(payload);
    if (punkty.length < 2) { pusty.reason = 'too-few-points'; return pusty; }
    var zWzrostem = punkty.filter(function (p) { return p.height !== null; });
    if (!zWzrostem.length) { pusty.reason = 'no-height'; return pusty; }

    punkty.forEach(function (p) { p.heightSds = hSds(p.height, plec, p.ageYears); });

    var ostatni = punkty[punkty.length - 1];
    var autoComplete = wzrostZakonczony(ostatni, plec);
    var tryb;
    if (o.forcePrognosis === true) tryb = 'prognosis';
    else if (liczba(o.fhAgeMonths) !== null) tryb = 'validation';
    else tryb = autoComplete ? 'validation' : 'prognosis';

    var fhPunkt = null;
    if (tryb === 'validation') {
      var wskazany = liczba(o.fhAgeMonths);
      if (wskazany !== null) {
        fhPunkt = zWzrostem.filter(function (p) { return p.ageMonths === Math.round(wskazany); })[0] || null;
      }
      if (!fhPunkt) fhPunkt = zWzrostem[zWzrostem.length - 1];
    }
    var fhWzrost = fhPunkt ? fhPunkt.height : null;

    // Kolejność metod z karty C; MPH dopisujemy na końcu jako CEL, nie prognozę.
    var kolejnosc = [], etykiety = Object.create(null);
    METODY_PODSTAWOWE.forEach(function (m) { kolejnosc.push(m.key); etykiety[m.key] = m.label; });

    punkty.forEach(function (p) {
      p.isFH = Boolean(fhPunkt && p.ageMonths === fhPunkt.ageMonths);
      p.pctFH = (tryb === 'validation' && p.height !== null && fhWzrost) ? (p.height / fhWzrost) * 100 : null;
      p.preds = Object.create(null);
      p.konsensus = null;
      if (p.isFH) return;

      var fhp = prognozaPunktu(p, ctx);
      if (!fhp) return;

      (fhp.methods || []).forEach(function (m) {
        if (!m || !m.key) return;
        if (kolejnosc.indexOf(m.key) < 0) kolejnosc.push(m.key);
        if (m.label) etykiety[m.key] = m.label;
        var wPub = liczba(m.publikacjaCm !== undefined ? m.publikacjaCm : m.cm);
        var wKons = liczba(m.cm);
        p.preds[m.key] = {
          publikacja: zaokr1(wPub), konsensus: zaokr1(wKons),
          errPub: (wPub !== null && fhWzrost) ? zaokr1(wPub - fhWzrost) : null,
          errKons: (wKons !== null && fhWzrost) ? zaokr1(wKons - fhWzrost) : null,
          excluded: m.excluded === true, gateNote: m.gateNote || '',
          biasCm: m.biasCm || 0, errorHalfWidthCm: liczba(m.errorHalfWidthCm),
          reason: wPub === null ? 'no-value' : null
        };
        p.preds[m.key].absErrPub = p.preds[m.key].errPub === null ? null : Math.abs(p.preds[m.key].errPub);
        p.preds[m.key].absErrKons = p.preds[m.key].errKons === null ? null : Math.abs(p.preds[m.key].errKons);
      });

      var kons = liczba(fhp.cm);
      if (kons !== null) {
        p.konsensus = {
          cm: zaokr1(kons), halfWidthCm: liczba(fhp.halfWidthCm),
          sourceLabel: fhp.sourceLabel || '', agreementLabel: fhp.agreementLabel || '',
          err: fhWzrost ? zaokr1(kons - fhWzrost) : null,
          methodCount: fhp.methodCount || 0
        };
      }
    });

    var metody = kolejnosc.map(function (k) { return { key: k, label: etykiety[k], pred: true }; });
    if (ctx.mph !== null) metody.push({ key: 'mph', label: 'MPH (cel)', pred: false, cel: true });

    var summary = Object.create(null);
    metody.forEach(function (m) { if (m.pred) summary[m.key] = metrykiMetody(punkty, m.key); });

    return {
      ok: true, reason: null, mode: tryb, autoComplete: autoComplete,
      sex: plec, sexLabel: plecEtykieta(plec), mother: matka, father: ojciec, mph: ctx.mph,
      fh: fhPunkt ? { ageMonths: fhPunkt.ageMonths, height: fhPunkt.height } : null,
      fhKey: fhPunkt ? String(fhPunkt.ageMonths) : null,
      points: punkty, methods: metody, summary: summary,
      konsensus: metrykiKonsensusu(punkty),
      best: najblizejFH(metody, summary),
      minPunktowRankingu: MIN_PUNKTOW_RANKINGU
    };
  }

  function maPoliczalnePrognozy(payload, opcje) {
    var m = policzDlaPayloadu(payload, opcje);
    if (!m.ok) return false;
    return m.points.some(function (p) {
      return !p.isFH && Object.keys(p.preds || {}).some(function (k) {
        return typeof p.preds[k].publikacja === 'number';
      });
    });
  }

  w.VildaGrowthPredictionValidationModel = {
    VERSION: VERSION,
    MIN_PUNKTOW_RANKINGU: MIN_PUNKTOW_RANKINGU,
    policzDlaPayloadu: policzDlaPayloadu,
    maPoliczalnePrognozy: maPoliczalnePrognozy,
    _punkty: punktyZPayloadu,
    _prognozaPunktu: prognozaPunktu,
    _profilKowd: profilKowd,
    _metrykiMetody: metrykiMetody,
    _metrykiKonsensusu: metrykiKonsensusu,
    _najblizejFH: najblizejFH,
    _poMenarche: poMenarche,
    _wzrostZakonczony: wzrostZakonczony,
    _hSds: hSds,
    METODY_PODSTAWOWE: METODY_PODSTAWOWE,
    _mph: mphZRodzicow
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = w.VildaGrowthPredictionValidationModel;
}(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this)));
