/*
 * vilda_farmakoterapia.js (v1) — JEDYNE miejsce, w którym aplikacja rozstrzyga, czy pacjent
 * spełnia KRYTERIA ANTROPOMETRYCZNE włączenia leczenia farmakologicznego choroby otyłościowej.
 *
 * P-RAPORT rata 3 (2026-09-20). Powód powstania: raport pacjenta ma napisać, że przy takiej
 * otyłości należy rozważyć leczenie farmakologiczne — ale wolno to napisać dopiero wtedy, gdy
 * aplikacja sprawdziła, czy pacjent w ogóle spełnia kryteria włączenia. Decyzja właściciela
 * 2026-09-20: „aplikacja musi sprawdzić, czy pacjent kwalifikuje się na taką terapię […]
 * leków nie nazywaj, pisz o leczeniu farmakologicznym […] kryteria akceptuję".
 *
 * CZEGO TEN MODUŁ NIE ROBI — i nigdy nie będzie robił:
 *  • nie nazywa leku (decyzja właściciela); mówi wyłącznie o „leczeniu farmakologicznym
 *    choroby otyłościowej";
 *  • nie kwalifikuje pacjenta do terapii. Sprawdza jedną rzecz: kryterium antropometryczne
 *    (BMI, centyl BMI, masa ciała, wiek). Przeciwwskazań, chorób współistniejących,
 *    ciąży, wcześniejszego leczenia ani wyników badań NIE ZNA i nie udaje, że zna.
 *    Każdy wynik niesie listę `czegoNieSprawdza` i zdanie, że decyduje lekarz;
 *  • nie zgaduje progu, którego nie ma w danych. Gdy tablicy odniesienia brakuje, zwraca
 *    „nieocenione" z powodem — nigdy przybliżenie podane jako wynik.
 *
 * KRYTERIA JAKO DANE (AGENTS.md §3, decyzja właściciela 2026-09-09 o wielopopulacyjności):
 * zestaw kryteriów jest osobną, zamrożoną strukturą przyjmowaną argumentem, a nie regułą
 * wpisaną w gałęzie `if`. Wynik NAZYWA użyty zestaw i użytą siatkę centylową, bo „95. centyl"
 * nie znaczy tego samego na siatce OLAF i na WHO.
 *
 * ŹRÓDŁO ZESTAWU DOMYŚLNEGO: Charakterystyka Produktu Leczniczego analogu GLP-1 zarejestrowanego
 * we wskazaniu leczenia otyłości, wersja dokumentu z 26.06.2025 (identyfikacja wersji w
 * docs/clinical/ALGORITHMS.md, wpis P-FARMAKOTERAPIA; samego dokumentu nie ma w repozytorium —
 * jest objęty prawem autorskim).
 *
 * UWAGA NA PRÓG 95. CENTYLA: to próg z kryterium rejestracyjnego, NIE jest to próg otyłości
 * używany w reszcie aplikacji (97. centyl, kanon P-BMI). Dlatego stoi w danych kryteriów,
 * a nie w VildaBmi.PROGI — te dwie liczby odpowiadają na dwa różne pytania i nie wolno ich
 * zlepić w jedną stałą.
 *
 * ZALEŻNOŚCI: window.VildaBmi (BMI, centyl, kategoria dorosłego, granica dorosłości). Bez niego
 * moduł zwraca „nieocenione" z powodem — nie liczy BMI po swojemu (P-BMI etap 1: jedno miejsce).
 */
(function (root) {
  'use strict';
  if (!root) return;

  var WERSJA = 1;

  var NIE_SPRAWDZA = Object.freeze([
    'przeciwwskazań do leczenia farmakologicznego',
    'chorób współistniejących i ich nasilenia',
    'wcześniejszego leczenia otyłości i jego efektów',
    'ciąży, karmienia piersią i planów prokreacyjnych',
    'wyników badań laboratoryjnych'
  ]);
  var ZDANIE_LEKARZ = 'O włączeniu leczenia farmakologicznego decyduje lekarz.';

  /* Zestaw kryteriów antropometrycznych. Zamrożony; przyjmowany argumentem `kryteria`. */
  var CHPL_2025_06_26 = Object.freeze({
    id: 'chpl-2025-06-26',
    nazwa: 'kryteria włączenia wg ChPL (wersja 26.06.2025)',
    dorosly: Object.freeze({
      odWiekuMies: 216,
      bmi: 30,            // kryterium spełnione
      bmiWarunkowe: 27    // 27 ≤ BMI < 30: decyduje obecność chorób współistniejących
    }),
    mlodziez: Object.freeze({
      odWiekuMies: 144,   // 12 lat
      doWiekuMies: 216,
      /* „BMI odpowiadające 30 kg/m² u dorosłego" — punkt odcięcia IOTF dla wieku i płci.
         Tablicy IOTF aplikacja NIE MA (patrz IOTF_BRAK niżej). */
      rownowaznikBmiDoroslego: 30,
      masaKgPowyzej: 60
    }),
    dziecko: Object.freeze({
      odWiekuMies: 72,    // 6 lat
      doWiekuMies: 144,   // poniżej 12 lat
      centylBmi: 95,
      masaKgOd: 45
    })
  });

  /* Tablica punktów odcięcia IOTF (Cole 2000; krzywe LMS opublikowane w Cole i Lobstein 2012).
     Dopóki jej nie ma, kryterium BMI u młodzieży jest NIEOCENIONE — nie przybliżamy go
     centylem z innej siatki, bo to zmienia, kto się kwalifikuje do leczenia. */
  var IOTF_BRAK = 'brak tablicy odniesienia IOTF dla równoważnika BMI 30 u dorosłego';

  function liczba(v) { var n = Number(v); return isFinite(n) ? n : null; }
  function silnik() {
    try { return root.VildaBmi && typeof root.VildaBmi.policz === 'function' ? root.VildaBmi : null; }
    catch (e) { return null; }
  }
  function fmtBmi(v) { return v == null ? '' : Number(v).toFixed(1).replace('.', ','); }
  function fmtMasa(v) { return v == null ? '' : Number(v).toFixed(1).replace('.', ','); }
  function fmtCentyl(v) { return v == null ? '' : Number(v).toFixed(1).replace('.', ','); }

  function pusty(baza, powod) {
    return {
      wersja: WERSJA,
      kryteria: baza.kryteria,
      grupa: baza.grupa || null,
      wynik: 'nieocenione',
      powod: powod,
      komunikat: '',
      szczegoly: baza.szczegoly || {},
      czegoNieSprawdza: NIE_SPRAWDZA.slice(),
      zdanieLekarz: ZDANIE_LEKARZ
    };
  }

  function grupaWieku(wiekMies, K) {
    var w = liczba(wiekMies);
    if (w == null || w < 0) return null;
    if (w >= K.dorosly.odWiekuMies) return 'dorosly';
    if (w >= K.mlodziez.odWiekuMies) return 'mlodziez';
    if (w >= K.dziecko.odWiekuMies) return 'dziecko';
    return 'ponizej-zakresu';
  }

  /* opts: { wiekMies, plec, masaKg, wzrostCm, bmi?, zrodlo?, populacja?, kryteria? } */
  function ocen(opts) {
    var o = opts || {};
    var K = o.kryteria || CHPL_2025_06_26;
    var kryteriaOpis = { id: K.id, nazwa: K.nazwa };
    var masa = liczba(o.masaKg), wzrost = liczba(o.wzrostCm), wiek = liczba(o.wiekMies);
    var baza = { kryteria: kryteriaOpis, grupa: grupaWieku(wiek, K), szczegoly: {} };

    var B = silnik();
    if (!B) return pusty(baza, 'brak silnika BMI');
    if (wiek == null || wiek < 0) return pusty(baza, 'brak wieku');
    if (masa == null || masa <= 0 || wzrost == null || wzrost <= 0) return pusty(baza, 'brak masy ciała lub wzrostu');

    var bmi = liczba(o.bmi);
    if (bmi == null) bmi = B.bmi({ masaKg: masa, wzrostCm: wzrost });
    if (bmi == null || !isFinite(bmi) || bmi <= 0) return pusty(baza, 'brak masy ciała lub wzrostu');

    var grupa = baza.grupa;
    baza.szczegoly = { bmi: bmi, masaKg: masa, wzrostCm: wzrost, wiekMies: wiek, plec: o.plec === 'M' ? 'M' : 'F' };

    if (grupa === 'ponizej-zakresu') {
      var wynikP = pusty(baza, 'wiek poniżej zakresu kryteriów włączenia');
      wynikP.wynik = 'niespelnione';
      wynikP.komunikat = 'Kryteria włączenia leczenia farmakologicznego choroby otyłościowej nie obejmują tego wieku.';
      return wynikP;
    }

    if (grupa === 'dorosly') return ocenDoroslego(bmi, baza, K);
    if (grupa === 'dziecko') return ocenDziecka(bmi, masa, o, baza, K, B);
    return ocenMlodziezy(bmi, masa, o, baza, K, B);
  }

  function ocenDoroslego(bmi, baza, K) {
    var D = K.dorosly;
    baza.szczegoly.progBmi = D.bmi;
    baza.szczegoly.progBmiWarunkowy = D.bmiWarunkowe;
    var w = {
      wersja: WERSJA, kryteria: baza.kryteria, grupa: 'dorosly',
      szczegoly: baza.szczegoly, czegoNieSprawdza: NIE_SPRAWDZA.slice(), zdanieLekarz: ZDANIE_LEKARZ, powod: ''
    };
    if (bmi >= D.bmi) {
      w.wynik = 'spelnione';
      w.komunikat = 'BMI ' + fmtBmi(bmi) + ' spełnia kryterium włączenia leczenia farmakologicznego choroby otyłościowej.';
      return w;
    }
    if (bmi >= D.bmiWarunkowe) {
      w.wynik = 'warunkowe';
      /* Brzmienie ustalone przez właściciela 2026-09-20 — nie zmieniać bez jego decyzji. */
      w.komunikat = 'Przy BMI ' + fmtBmi(bmi) + ' kryterium BMI spełnione warunkowo, decyduje obecność chorób współistniejących.';
      return w;
    }
    w.wynik = 'niespelnione';
    w.powod = 'BMI poniżej ' + String(D.bmiWarunkowe).replace('.', ',');
    w.komunikat = 'BMI ' + fmtBmi(bmi) + ' jest poniżej progu włączenia leczenia farmakologicznego choroby otyłościowej.';
    return w;
  }

  function ocenDziecka(bmi, masa, o, baza, K, B) {
    var D = K.dziecko;
    var r = B.policz({ bmi: bmi, plec: o.plec, wiekMies: o.wiekMies, zrodlo: o.zrodlo, populacja: o.populacja });
    var centyl = r && r.centyl != null ? liczba(r.centyl) : null;
    baza.szczegoly.centyl = centyl;
    baza.szczegoly.siatka = r ? r.siatka : null;
    baza.szczegoly.zrodlo = r ? r.zrodlo : null;
    baza.szczegoly.populacja = r ? r.populacja : null;
    baza.szczegoly.progCentyl = D.centylBmi;
    baza.szczegoly.progMasyKg = D.masaKgOd;
    if (centyl == null) return pusty(baza, (r && r.powod) || 'brak centyla BMI dla tego wieku');

    var w = {
      wersja: WERSJA, kryteria: baza.kryteria, grupa: 'dziecko',
      szczegoly: baza.szczegoly, czegoNieSprawdza: NIE_SPRAWDZA.slice(), zdanieLekarz: ZDANIE_LEKARZ, powod: ''
    };
    var bmiOk = centyl >= D.centylBmi, masaOk = masa >= D.masaKgOd;
    var nota = ' (centyl na siatce ' + String(baza.szczegoly.siatka || '') + ')';
    if (bmiOk && masaOk) {
      w.wynik = 'spelnione';
      w.komunikat = 'BMI na ' + fmtCentyl(centyl) + '. centylu i masa ciała ' + fmtMasa(masa)
        + ' kg spełniają kryteria włączenia leczenia farmakologicznego choroby otyłościowej'
        + nota + '.';
      return w;
    }
    w.wynik = 'niespelnione';
    w.powod = !bmiOk && !masaOk
      ? 'centyl BMI poniżej ' + D.centylBmi + '. i masa ciała poniżej ' + D.masaKgOd + ' kg'
      : (!bmiOk ? 'centyl BMI poniżej ' + D.centylBmi + '.' : 'masa ciała poniżej ' + D.masaKgOd + ' kg');
    w.komunikat = 'Kryteria włączenia leczenia farmakologicznego choroby otyłościowej nie są spełnione: '
      + w.powod + nota + '.';
    return w;
  }

  function ocenMlodziezy(bmi, masa, o, baza, K, B) {
    var M = K.mlodziez;
    baza.szczegoly.progMasyKg = M.masaKgPowyzej;
    baza.szczegoly.rownowaznikBmiDoroslego = M.rownowaznikBmiDoroslego;
    var prog = progIotf(o, M);
    baza.szczegoly.progBmi = prog;
    var masaOk = masa > M.masaKgPowyzej;
    baza.szczegoly.masaSpelniona = masaOk;

    if (prog == null) {
      var wn = pusty(baza, IOTF_BRAK);
      wn.grupa = 'mlodziez';
      wn.komunikat = 'Kryterium masy ciała ' + (masaOk ? 'jest spełnione' : 'nie jest spełnione')
        + ' (' + fmtMasa(masa) + ' kg wobec progu powyżej ' + M.masaKgPowyzej + ' kg), '
        + 'natomiast kryterium BMI wymaga punktu odcięcia IOTF odpowiadającego BMI '
        + M.rownowaznikBmiDoroslego + ' u dorosłego, którego aplikacja nie ma — tego kryterium nie ocenia.';
      return wn;
    }
    var w = {
      wersja: WERSJA, kryteria: baza.kryteria, grupa: 'mlodziez',
      szczegoly: baza.szczegoly, czegoNieSprawdza: NIE_SPRAWDZA.slice(), zdanieLekarz: ZDANIE_LEKARZ, powod: ''
    };
    var bmiOk = bmi >= prog;
    if (bmiOk && masaOk) {
      w.wynik = 'spelnione';
      w.komunikat = 'BMI ' + fmtBmi(bmi) + ' i masa ciała ' + fmtMasa(masa)
        + ' kg spełniają kryteria włączenia leczenia farmakologicznego choroby otyłościowej.';
      return w;
    }
    w.wynik = 'niespelnione';
    w.powod = !bmiOk && !masaOk
      ? 'BMI poniżej ' + fmtBmi(prog) + ' i masa ciała nie przekracza ' + M.masaKgPowyzej + ' kg'
      : (!bmiOk ? 'BMI poniżej ' + fmtBmi(prog) : 'masa ciała nie przekracza ' + M.masaKgPowyzej + ' kg');
    w.komunikat = 'Kryteria włączenia leczenia farmakologicznego choroby otyłościowej nie są spełnione: '
      + w.powod + '.';
    return w;
  }

  /* Punkt odcięcia IOTF dla wieku i płci. Wstrzykiwany przez ustawTablice(); dopóki go nie ma,
     zwracamy null i kryterium BMI u młodzieży zostaje nieocenione. Żadnego przybliżenia. */
  var tablicaIotf = null;
  function progIotf(o, M) {
    if (!tablicaIotf || typeof tablicaIotf.prog !== 'function') return null;
    var v = liczba(tablicaIotf.prog({
      plec: o.plec === 'M' ? 'M' : 'F',
      wiekMies: liczba(o.wiekMies),
      bmiDoroslego: M.rownowaznikBmiDoroslego
    }));
    return v != null && v > 0 ? v : null;
  }
  function ustawTablice(t) { tablicaIotf = t || null; }

  root.VildaFarmakoterapia = Object.freeze({
    version: WERSJA,
    KRYTERIA_DOMYSLNE: CHPL_2025_06_26,
    NIE_SPRAWDZA: NIE_SPRAWDZA.slice(),
    ZDANIE_LEKARZ: ZDANIE_LEKARZ,
    IOTF_BRAK: IOTF_BRAK,
    ocen: ocen,
    grupaWieku: function (wiekMies, kryteria) { return grupaWieku(wiekMies, kryteria || CHPL_2025_06_26); },
    ustawTablice: ustawTablice
  });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
