/*
 * vilda_werdykt.js (v1) — JEDYNE miejsce, w którym aplikacja układa WERDYKT ODCINKA
 * trajektorii (para pomiarów A→B dla wzrostu, masy i BMI). Wszyscy inni tylko wołają
 * i wyświetlają.
 *
 * P-WERDYKT rata 1 (audyt werdyktów 2026-09-18, decyzja właściciela „1. robimy silnik").
 *
 * DLACZEGO TEN PLIK POWSTAŁ. Werdykt odcinka istniał w aplikacji w DWÓCH pełnych kopiach:
 *   - vilda_auth_ui.js       — verdictCh / verdictCh2 / verdictWtBmi / verdictHtPos
 *                              (panel „Porównanie z poprzednim pomiarem", PR #63/v388),
 *   - vilda_trajectory_analysis.js — verdictForPair / verdictForPairCtx /
 *                              weightBmiOverlayVerdict / heightPositionOverlayVerdict
 *                              (moduł trajektorii, transkrypcja 1:1 tamtych).
 * Parytet trzymał się dotąd wyłącznie na teście jednostkowym i na komentarzach „nie zmieniaj
 * bez zmiany tej drugiej". To działa do pierwszego przeoczenia: każda zmiana kliniczna
 * musiała być wpisana ręcznie w dwóch plikach, z których jeden jest zminifikowany.
 * Od tej wersji obie powierzchnie wołają ten moduł, a kopie są cienkimi delegacjami.
 *
 * ZAKRES RATY 1: wyłącznie przeniesienie. ZERO zmian zachowania — te same progi, te same
 * etykiety, ta sama kolejność gałęzi. Równoważność jest udowodniona przemiataniem pełnej
 * siatki wejść w tests/unit/werdykt-silnik.test.mjs, a nie deklaracją w komentarzu.
 * Zmiany merytoryczne werdyktów (poziom po obu stronach, gate catch-upu, prędkość BMI wobec
 * tempa wzrastania) są osobnymi ratami i wymagają akceptacji klinicznej właściciela.
 *
 * WARSTWY. Werdykt powstaje w trzech krokach i to jest cała architektura tego modułu:
 *   1. para()                  — werdykt bazowy z samych liczb: ΔSDS + pozycja centylowa.
 *   2. zKontekstem()           — ta sama para widziana przez leczenie i pochodzenie:
 *                                terapia GH (≥6 mies. w odcinku), kanał rodzicielski (MPH),
 *                                zamierzona redukcja masy. Zwraca werdykt bazowy, gdy
 *                                kontekstu nie ma.
 *   3. nakladkaMasaBmi()       — spójność wagi z BMI w tym samym odcinku,
 *      nakladkaPozycjaWzrostu()— spójność „stabilnego" toru z pozycją centylową.
 * Nakładki są świadomie OSOBNE, a nie wpisane do para(): wołający, który widzi tylko jedną
 * miarę (np. tabela jednego wiersza), nie ma czym ich nakarmić i ma prawo ich nie stosować.
 *
 * SŁOWNIK WYNIKU: { t, l }, gdzie t ∈ good | stable | warn | bad, a l to etykieta po polsku.
 * Kolejność ciężaru: bad > warn > stable > good. `null` oznacza „brak werdyktu" (za mało
 * danych) i NIE jest tym samym co „stabilny" — wołający ma pokazać same liczby.
 *
 * ŹRÓDŁA PROGÓW. Moduł nie wprowadza żadnego nowego progu klinicznego; wszystkie pochodzą
 * z przyjętych wcześniej decyzji aplikacji (PR #63/v388 — słownik i progi ΔSDS; decyzja
 * właściciela 2026-08-09 — różnicowanie etykiety catch-upu centylem końcowym; decyzja
 * właściciela 2026-08-14 — obie nakładki). Pełny opis: docs/clinical/ALGORITHMS.md.
 */
(function (root) {
  'use strict';

  if (!root) return;

  var WERSJA = '1';

  // Progi nazwane. Reszta liczb w gałęziach jest celowo zostawiona dokładnie tam, gdzie była
  // przed przeniesieniem — rata 1 ma być czytelna jako przeniesienie, a nie jako przepisanie.
  var PROGI = Object.freeze({
    // Słowo „istotny" niesie w werdyktach DWIE różne wielkości (P-SLOWA, punkt 4 audytu):
    //   wzrost   — „istotna deceleracja wzrastania" przy ΔSDS ≤ −1,0 (tyle samo, co czerwona
    //              flaga pozycyjna wzrostu, więc epikryza i trajektoria mówią jedną liczbą),
    //   masa/BMI — „istotne przesunięcie centylowe" przy |ΔSDS| ≥ 0,5.
    // Czy mają być JEDNĄ liczbą, jest pytaniem klinicznym i nie zapada tutaj.
    ISTOTNA_DECELERACJA_DSDS: -1.0,
    ISTOTNE_PRZESUNIECIE_DSDS: 0.5
  });

  function dSds(sa0, sb0) {
    return Math.round(100 * (sb0 - sa0)) / 100;
  }

  // ── 1. Werdykt bazowy pary punktów ────────────────────────────────────────────────────
  // Transkrypcja 1:1 dotychczasowych verdictCh (vilda_auth_ui.js) i verdictForPair
  // (vilda_trajectory_analysis.js). met: 'height' | 'weight' | 'bmi'; sa0/sb0: SDS punktu A/B;
  // ca/cb: centyl punktu A/B.
  function para(met, sa0, sb0, ca, cb) {
    if (typeof sa0 !== 'number' || typeof sb0 !== 'number' || !isFinite(sa0) || !isFinite(sb0) || ca == null || cb == null) return null;
    var d = dSds(sa0, sb0), W = met === 'height', B = met === 'bmi', low = ca < 10, high = W ? ca > 90 : ca >= (B ? 85 : 90);
    var ST = W ? 'stabilny tor wzrastania' : B ? 'stabilny tor BMI' : 'stabilny tor masy ciała';
    var ND = W ? 'pogłębianie niedoboru wzrostu' : 'pogłębianie niedoboru masy ciała';
    if (low) {
      if (d >= 0.2) {
        // Start z niedoboru (<10c): etykietę różnicuje centyl końcowy (decyzja właściciela 2026-08-09).
        if (W) return { t: 'good', l: 'wyrównywanie niedoboru wzrostu (catch-up)' };
        if (cb < 10) return { t: 'good', l: 'wyrównywanie niedoboru masy ciała' };
        if (B) return cb >= 97 ? { t: 'bad', l: 'przekroczenie progu otyłości (≥97c)' }
          : cb >= 85 ? { t: 'warn', l: 'wyrównanie niedoboru z szybkim przyrostem BMI — do obserwacji' }
          : { t: 'good', l: 'wyrównanie niedoboru (BMI)' };
        return cb >= 90 ? { t: 'bad', l: 'przekroczenie 90. centyla masy ciała po wyrównaniu niedoboru' }
          : cb >= 75 ? { t: 'warn', l: 'wyrównanie niedoboru z szybkim przyrostem masy ciała — do obserwacji' }
          : { t: 'good', l: 'wyrównanie niedoboru masy ciała' };
      }
      return d <= -0.5 ? { t: 'bad', l: ND } : d <= -0.2 ? { t: 'warn', l: ND } : { t: 'stable', l: ST };
    }
    if (high) {
      if (W) return d <= -1 ? { t: 'warn', l: 'szybka deceleracja z wysokich centyli' } : d <= -0.2 ? { t: 'stable', l: 'normalizacja pozycji centylowej' } : d >= 0.5 ? { t: 'warn', l: 'dalsza akceleracja wzrastania' } : { t: 'stable', l: ST };
      if (d <= -1.5) return { t: 'warn', l: B ? 'szybki spadek BMI — wskazana ocena' : 'szybka utrata masy — wskazana ocena' };
      if (d <= -0.2) return { t: 'good', l: B ? 'redukcja BMI' : 'redukcja nadmiaru masy ciała' };
      if (d >= 0.5 || (d >= 0.2 && cb >= 97)) return { t: 'bad', l: B ? (cb >= 97 ? (ca >= 97 ? 'progresja otyłości' : 'przekroczenie progu otyłości (≥97c)') : 'szybka progresja nadwagi (BMI)') : (cb >= 97 ? (ca >= 97 ? 'progresja nadmiaru masy (>97. centyla)' : 'przekroczenie 97. centyla masy ciała') : 'nasilony przyrost masy ciała') };
      return d >= 0.2 ? { t: 'warn', l: B ? 'progresja nadwagi (BMI w paśmie 85.–97. centyla)' : 'narastanie nadmiaru masy ciała' } : B && cb >= 97 ? { t: 'warn', l: 'utrzymująca się otyłość (>97c)' } : { t: 'stable', l: ST };
    }
    if (W) return d <= PROGI.ISTOTNA_DECELERACJA_DSDS ? { t: 'bad', l: 'istotna deceleracja wzrastania' } : d <= -0.5 ? { t: 'warn', l: 'deceleracja toru wzrastania' } : (d >= 0.5 && cb > 97) ? { t: 'warn', l: 'akceleracja z przekroczeniem 97. centyla' } : { t: 'stable', l: ST };
    if (Math.abs(d) >= PROGI.ISTOTNE_PRZESUNIECIE_DSDS) {
      var al = B ? (cb >= 97 || cb < 5) : (cb <= 3 || cb >= 97);
      return al ? { t: 'bad', l: d > 0 ? (B ? 'przekroczenie progu otyłości (≥97c)' : 'przekroczenie 97. centyla masy ciała') : (B ? 'przekroczenie progu niedowagi (<5c)' : 'obniżenie masy ciała poniżej 3. centyla') } : { t: 'warn', l: d > 0 ? 'istotne przesunięcie centylowe w górę' : 'istotne przesunięcie centylowe w dół' };
    }
    return { t: 'stable', l: ST };
  }

  // ── 2. Ten sam odcinek widziany przez kontekst leczenia i pochodzenia ─────────────────
  // Transkrypcja 1:1 dotychczasowych verdictCh2 / verdictForPairCtx.
  // gm: miesiące terapii GH nakładające się z odcinkiem (ocena odpowiedzi od gm≥6);
  // mp: SDS kanału rodzicielskiego (MPH); rd: zamierzona redukcja aktywna w odcinku
  // (panel wymaga nakładania ≥3 mies.; nigdy przy niedoborze ca<10).
  function zKontekstem(met, sa0, sb0, ca, cb, gm, mp, rd) {
    var v1 = para(met, sa0, sb0, ca, cb);
    if (!v1) return null;
    var d = dSds(sa0, sb0);
    if (met === 'height') {
      if (gm >= 6) return d >= 0.3 ? { t: 'good', l: 'dobra odpowiedź na GH' } : d < 0.1 ? { t: 'warn', l: 'słaba odpowiedź na GH — do oceny' } : { t: 'stable', l: 'odpowiedź umiarkowana (GH)' };
      if (typeof mp === 'number' && isFinite(mp)) {
        var e0 = Math.round(100 * (sa0 - mp)) / 100;
        if (e0 <= -1.5) return d >= 0.2 ? { t: 'good', l: 'nadrabia względem kanału rodzicielskiego' } : d <= -0.5 ? { t: 'bad', l: 'oddala się od kanału rodzicielskiego' } : d <= -0.2 ? { t: 'warn', l: 'oddala się od kanału rodzicielskiego' } : { t: 'stable', l: 'stabilnie (poniżej kanału rodzicielskiego)' };
        if (e0 >= 1.5) return d <= -1 ? { t: 'warn', l: 'szybka deceleracja wzrastania' } : d <= -0.2 ? { t: 'stable', l: 'normalizacja do kanału rodzicielskiego' } : d >= 0.5 ? { t: 'warn', l: 'dalsza akceleracja ponad kanał rodzicielski' } : { t: 'stable', l: 'stabilny tor wzrastania' };
        if (ca < 10) {
          if (d <= -0.5) return { t: 'bad', l: 'pogłębianie niedoboru wzrostu' };
          if (d <= -0.2) return { t: 'warn', l: 'obniżanie pozycji centylowej w dolnym paśmie normy (3.–10. centyl) — do obserwacji' };
        }
        return d <= PROGI.ISTOTNA_DECELERACJA_DSDS ? { t: 'bad', l: 'istotna deceleracja wzrastania' } : d <= -0.5 ? { t: 'warn', l: 'deceleracja toru wzrastania' } : (d >= 0.5 && cb > 97) ? { t: 'warn', l: 'akceleracja z przekroczeniem 97. centyla' } : { t: 'stable', l: 'w kanale rodzicielskim' };
      }
      return v1;
    }
    if (rd && ca >= 10) {
      if (d <= -1.5) return { t: 'warn', l: 'redukcja bardzo szybka — do kontroli' };
      if (d <= -0.2) return { t: 'good', l: 'redukcja w trakcie leczenia' };
      if (d >= 0.2) return { t: v1.t === 'bad' ? 'bad' : 'warn', l: 'przyrost masy mimo leczenia redukcyjnego' };
    }
    return v1;
  }

  // ── 3a. Nakładka spójności waga↔BMI ──────────────────────────────────────────────────
  // Transkrypcja 1:1 dotychczasowych verdictWtBmi / weightBmiOverlayVerdict.
  // „Stabilna" waga (ΔSDS ≥ +0,2, poniżej własnego progu ostrzeżenia) przy BMI warn/bad
  // w kierunku nadmiaru (ΔSDS BMI ≥ +0,2) w tym samym odcinku nie jest stabilna klinicznie:
  // masa-do-wieku maskuje nadmiar, gdy wzrost odstaje w dół (decyzja właściciela 2026-08-14).
  function nakladkaMasaBmi(v, dW, vB, dB) {
    if (!v || v.t !== 'stable' || !(dW >= 0.2)) return v;
    if (!vB || (vB.t !== 'warn' && vB.t !== 'bad') || !(dB >= 0.2)) return v;
    return { t: 'warn', l: 'przyrost masy szybszy niż wzrastanie — nadmiar ujawnia się w BMI' };
  }

  // ── 3b. Nakładka pozycyjna wzrostu ───────────────────────────────────────────────────
  // Transkrypcja 1:1 dotychczasowych verdictHtPos / heightPositionOverlayVerdict.
  // „Stabilny" tor nie jest uspokajający, gdy pozycja tego nie uzasadnia: <3c zawsze (niedobór
  // wzrostu z definicji, poza normą populacyjną 3–97c), 3–10c tylko przy torze poniżej kanału
  // rodzicielskiego (≥1,5 SDS pod MPH). Pasmo 3–10c samo w sobie to DOLNE PASMO NORMY, nie brak
  // normy (decyzja właściciela 2026-08-14). Nie stosuje się przy aktywnej ocenie odpowiedzi na GH.
  function nakladkaPozycjaWzrostu(v, cb, mp, sa0, ghOn) {
    if (!v || v.t !== 'stable' || ghOn) return v;
    if (cb < 3) return { t: 'warn', l: 'tor stabilny, ale poniżej 3. centyla — niedobór wzrostu' };
    if (cb < 10 && typeof mp === 'number' && isFinite(mp) && Math.round(100 * (sa0 - mp)) / 100 <= -1.5)
      return { t: 'warn', l: 'tor stabilny w dolnym paśmie normy (3.–10. centyl), poniżej kanału rodzicielskiego — do obserwacji' };
    return v;
  }

  root.VildaWerdykt = Object.freeze({
    version: WERSJA,
    PROGI: PROGI,
    dSds: dSds,
    para: para,
    zKontekstem: zKontekstem,
    nakladkaMasaBmi: nakladkaMasaBmi,
    nakladkaPozycjaWzrostu: nakladkaPozycjaWzrostu
  });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
