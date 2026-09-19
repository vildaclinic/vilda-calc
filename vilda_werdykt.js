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
 * HISTORIA ZMIAN MERYTORYCZNYCH. Rata 1 była wyłącznie przeniesieniem — zero zmian
 * zachowania, udowodnione odciskiem pełnej siatki wejść, a nie deklaracją w komentarzu.
 * Rata 2 dołożyła gałąź POZIOMU dla masy i BMI (poziomMasyBmi) i jest jedyną zmianą
 * zachowania w tym module; tamten odcisk nadal obowiązuje po odwzorowaniu nowych etykiet
 * z powrotem na „stabilny tor" — pilnuje tego tests/unit/werdykt-silnik.test.mjs.
 * Kolejne zmiany merytoryczne (gate catch-upu, prędkość BMI wobec tempa wzrastania) są
 * osobnymi ratami i wymagają akceptacji klinicznej właściciela.
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

  var WERSJA = '4';

  // Progi nazwane. Reszta liczb w gałęziach jest celowo zostawiona dokładnie tam, gdzie była
  // przed przeniesieniem — rata 1 ma być czytelna jako przeniesienie, a nie jako przepisanie.
  var PROGI = Object.freeze({
    // Słowo „istotny" niesie w werdyktach DWIE różne wielkości (P-SLOWA, punkt 4 audytu):
    //   wzrost   — „istotna deceleracja wzrastania" przy ΔSDS ≤ −1,0 (tyle samo, co czerwona
    //              flaga pozycyjna wzrostu, więc epikryza i trajektoria mówią jedną liczbą),
    //   masa/BMI — „istotne przesunięcie centylowe" przy |ΔSDS| ≥ 0,5.
    // Czy mają być JEDNĄ liczbą, jest pytaniem klinicznym i nie zapada tutaj.
    ISTOTNA_DECELERACJA_DSDS: -1.0,
    ISTOTNE_PRZESUNIECIE_DSDS: 0.5,
    // Strefy alarmowe pozycji (P-WERDYKT rata 2). To NIE są nowe liczby: dokładnie te same
    // progi silnik traktował już jako alarmowe w gałęzi środkowego pasma (zmienna `al`).
    // Rata 2 nadała im nazwy i użyła ich w drugim miejscu — przy stabilnym torze.
    MASA_WYSOKA_C: 97,
    MASA_NISKA_C: 3,
    BMI_OTYLOSC_C: 97,
    BMI_NIEDOWAGA_C: 5,
    // Hamulec catch-upu masy (P-WERDYKT rata 3, decyzja właściciela 2026-09-19).
    // Te same liczby, których używa już silnik BMI: VildaBmi.PROGI.DZIECKO.NADWAGA = 85
    // i VildaBmi.PROGI.COLE.NADWAGA = 110. Nie są nowe i nie zapadają tutaj.
    BMI_NADWAGA_C: 85,
    COLE_NADWAGA_PCT: 110,
    // Przyspieszenie BMI w paśmie typowym (P-WERDYKT rata 4, decyzja właściciela 2026-09-19:
    // „0,3 jest ok"). Liczba wybrana po przemiataniu: przy 0,30 reguła obejmuje trzecią część
    // dotychczasowej ciszy, mediana przeskoku to 12,7 punktu centylowego, a próg siedzi
    // wyraźnie poniżej ISTOTNE_PRZESUNIECIE_DSDS (0,5), więc go nie dubluje.
    PRZYSPIESZENIE_BMI_DSDS: 0.3,
    // Krótki odcinek to szum pomiarowy, nie przyspieszenie. Ta sama liczba i ten sam powód,
    // co SEGMENT_MIN_GAP_M w vilda_trajectory_analysis.js — pilnuje tego test między plikami.
    PREDKOSC_MIN_ODSTEP_M: 3
  });

  function dSds(sa0, sb0) {
    return Math.round(100 * (sb0 - sa0)) / 100;
  }

  // ── Poziom miary przy stabilnym torze (P-WERDYKT rata 2) ─────────────────────────────
  // „Stabilny tor" mówił dotąd o KIERUNKU i milczał o POZIOMIE. Odcinek dziecka, które stoi
  // na 99. centylu masy i na nim zostaje, brzmiał tak samo uspokajająco jak odcinek dziecka
  // w środku siatki — a to jest inna sytuacja kliniczna (usterki A i C audytu 2026-09-18).
  // Wzrost dostał tę gałąź wcześniej (nakladkaPozycjaWzrostu); tu dostają ją masa i BMI.
  //
  // TON NIE JEST SYMETRYCZNY I TO JEST ZMIERZONE, NIE PRZEOCZONE. Ostrzeżenie (`warn`)
  // stawiamy tylko tam, gdzie SAMA miara wystarcza, żeby orzec nadmiar albo niedobór:
  //  - BMI jest skorygowane o wzrost, więc rozstrzyga po obu stronach;
  //  - masa-do-wieku rozstrzyga tylko u góry. Na tablicach OLAF najwyższy centyl masy
  //    osiągalny przy BMI poniżej progu nadwagi to 96,4–98,5 (zależnie od wieku), więc masa
  //    ≥97c praktycznie wymusza BMI ≥85c. U dołu jest odwrotnie: dziecko niskie i
  //    proporcjonalne ma masę-do-wieku nawet w 0. centylu przy CAŁKOWICIE prawidłowym BMI
  //    (zmierzone w każdym badanym wieku). Żółty alarm byłby tam fałszywy, więc dolny koniec
  //    masy DOSTAJE ZDANIE, ale NIE dostaje ostrzeżenia — nazywa pozycję, nie orzeka choroby.
  // Brzmienie „znacznie powyżej/poniżej typowego zakresu" — decyzja właściciela 2026-09-18.
  function poziomMasyBmi(B, cb) {
    if (typeof cb !== 'number' || !isFinite(cb)) return null;
    if (B) {
      // Górny koniec BMI ma własną, mocniejszą etykietę w gałęzi wysokich centyli
      // („utrzymująca się otyłość (>97c)") — rata 2 jej nie dubluje i nie zmienia.
      if (cb < PROGI.BMI_NIEDOWAGA_C) return { t: 'warn', l: 'tor stabilny, ale BMI znacznie poniżej typowego zakresu (<5c)' };
      return null;
    }
    if (cb >= PROGI.MASA_WYSOKA_C) return { t: 'warn', l: 'tor stabilny, ale masa ciała znacznie powyżej typowego zakresu (>97c)' };
    if (cb <= PROGI.MASA_NISKA_C) return { t: 'stable', l: 'tor stabilny, masa ciała poniżej 3. centyla' };
    return null;
  }

  // Jedyne miejsce, w którym werdykt „stabilny" powstaje dla masy i BMI — dzięki temu gałąź
  // poziomu nie może ominąć żadnej ze ścieżek. Wzrost przechodzi tędy bez zmiany: ma własną
  // nakładkę pozycyjną, która widzi kanał rodzicielski i terapię GH, a tych tu nie ma.
  function stabilny(W, B, ST, cb) {
    if (W) return { t: 'stable', l: ST };
    return poziomMasyBmi(B, cb) || { t: 'stable', l: ST };
  }

  // ── 1. Werdykt bazowy pary punktów ────────────────────────────────────────────────────
  // Rdzeń przeniesiony 1:1 z dotychczasowych verdictCh (vilda_auth_ui.js) i verdictForPair
  // (vilda_trajectory_analysis.js); jedyne odstępstwo to gałąź poziomu przy stabilnym torze
  // masy i BMI (rata 2, patrz stabilny() wyżej).
  // met: 'height' | 'weight' | 'bmi'; sa0/sb0: SDS punktu A/B; ca/cb: centyl punktu A/B.
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
      return d <= -0.5 ? { t: 'bad', l: ND } : d <= -0.2 ? { t: 'warn', l: ND } : stabilny(W, B, ST, cb);
    }
    if (high) {
      if (W) return d <= -1 ? { t: 'warn', l: 'szybka deceleracja z wysokich centyli' } : d <= -0.2 ? { t: 'stable', l: 'normalizacja pozycji centylowej' } : d >= 0.5 ? { t: 'warn', l: 'dalsza akceleracja wzrastania' } : { t: 'stable', l: ST };
      if (d <= -1.5) return { t: 'warn', l: B ? 'szybki spadek BMI — wskazana ocena' : 'szybka utrata masy — wskazana ocena' };
      if (d <= -0.2) return { t: 'good', l: B ? 'redukcja BMI' : 'redukcja nadmiaru masy ciała' };
      if (d >= 0.5 || (d >= 0.2 && cb >= 97)) return { t: 'bad', l: B ? (cb >= 97 ? (ca >= 97 ? 'progresja otyłości' : 'przekroczenie progu otyłości (≥97c)') : 'szybka progresja nadwagi (BMI)') : (cb >= 97 ? (ca >= 97 ? 'progresja nadmiaru masy (>97. centyla)' : 'przekroczenie 97. centyla masy ciała') : 'nasilony przyrost masy ciała') };
      return d >= 0.2 ? { t: 'warn', l: B ? 'progresja nadwagi (BMI w paśmie 85.–97. centyla)' : 'narastanie nadmiaru masy ciała' } : B && cb >= PROGI.BMI_OTYLOSC_C ? { t: 'warn', l: 'utrzymująca się otyłość (>97c)' } : stabilny(W, B, ST, cb);
    }
    if (W) return d <= PROGI.ISTOTNA_DECELERACJA_DSDS ? { t: 'bad', l: 'istotna deceleracja wzrastania' } : d <= -0.5 ? { t: 'warn', l: 'deceleracja toru wzrastania' } : (d >= 0.5 && cb > 97) ? { t: 'warn', l: 'akceleracja z przekroczeniem 97. centyla' } : { t: 'stable', l: ST };
    if (Math.abs(d) >= PROGI.ISTOTNE_PRZESUNIECIE_DSDS) {
      var al = B ? (cb >= PROGI.BMI_OTYLOSC_C || cb < PROGI.BMI_NIEDOWAGA_C) : (cb <= PROGI.MASA_NISKA_C || cb >= PROGI.MASA_WYSOKA_C);
      return al ? { t: 'bad', l: d > 0 ? (B ? 'przekroczenie progu otyłości (≥97c)' : 'przekroczenie 97. centyla masy ciała') : (B ? 'przekroczenie progu niedowagi (<5c)' : 'obniżenie masy ciała poniżej 3. centyla') } : { t: 'warn', l: d > 0 ? 'istotne przesunięcie centylowe w górę' : 'istotne przesunięcie centylowe w dół' };
    }
    return stabilny(W, B, ST, cb);
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
  // Hamulec catch-upu (rata 3). Werdykt „wyrównanie niedoboru masy ciała" to dobra
  // wiadomość dopóty, dopóki doganianie nie zawiozło dziecka w pasmo nadmiaru. Odcinek
  // z audytu 2026-09-18: masa 9c→24c (ΔwSDS +0,62) chwalona jako wyrównanie niedoboru,
  // podczas gdy BMI szło 66c→85c i wchodziło w pasmo nadwagi. Werdykt był zgodny z regułą
  // i niezgodny z sytuacją.
  //
  // To jest próg POZIOMU, nie ruchu: liczy się to, DOKĄD catch-up dojechał, a nie czy BMI
  // akurat też się rusza. Dlatego nie korzysta z werdyktu BMI ani z jego ΔSDS.
  // Miara jest nazwana w etykiecie (P-SLOWA), bo BMI i wskaźnik Cole'a to dwa różne odczyty
  // i lekarz ma widzieć, który z nich zadziałał.
  //
  // `poziomBmi`: { centyl, cole } z tego samego punktu B, co werdykt. Brak którejkolwiek
  // wartości wycisza wyłącznie jej własne ramię — nigdy nie zgaduje.
  function hamulecCatchUp(poziomBmi) {
    var p = poziomBmi || {};
    var c = typeof p.centyl === 'number' && isFinite(p.centyl) ? p.centyl : null;
    var cole = typeof p.cole === 'number' && isFinite(p.cole) ? p.cole : null;
    if (c != null && c >= PROGI.BMI_NADWAGA_C) {
      return { t: 'warn', l: 'wyrównanie niedoboru masy, ale BMI jest już w paśmie nadwagi (≥85c)' };
    }
    if (cole != null && cole >= PROGI.COLE_NADWAGA_PCT) {
      return { t: 'warn', l: 'wyrównanie niedoboru masy, ale wskaźnik Cole\'a sięgnął już 110%' };
    }
    return null;
  }

  function nakladkaMasaBmi(v, dW, vB, dB, poziomBmi) {
    if (!v || !(dW >= 0.2)) return v;
    // Catch-up (`good`) ocenia hamulec poziomu; „stabilny" tor — reguła ruchu poniżej.
    // Rozdział jest celowy: etykieta reguły ruchu mówi „nadmiar ujawnia się w BMI",
    // a to byłaby nieprawda przy catch-upie, który dojechał dopiero do środka siatki.
    if (v.t === 'good') return hamulecCatchUp(poziomBmi) || v;
    if (v.t !== 'stable') return v;
    if (!vB || (vB.t !== 'warn' && vB.t !== 'bad') || !(dB >= 0.2)) return v;
    return { t: 'warn', l: 'przyrost masy szybszy niż wzrastanie — nadmiar ujawnia się w BMI' };
  }

  // ── 3c. Nakładka przyspieszenia BMI ──────────────────────────────────────────────────
  // P-WERDYKT rata 4. W środkowym paśmie siatki jest dużo miejsca i BMI może się po nim
  // przesuwać, nie uruchamiając żadnej reguły: wysokie centyle odzywają się od ΔSDS ≥ 0,2,
  // „istotne przesunięcie" dopiero od 0,5, a między nimi — cisza. Zmierzone przed tą ratą:
  // 4546 komórek siatki, w których BMI rośnie, a werdykt brzmi „stabilny tor BMI";
  // największy niezauważony przyrost to +0,49 ΔbmiSDS, czyli skok o 19,4 punktu centylowego.
  // Ponad 80 % z nich kończy poniżej 85. centyla, więc nie złapie ich ani hamulec catch-upu,
  // ani gałąź poziomu — nikt o nich nie powie nic.
  //
  // Rosnący bmiSDS TO JEST „przyrost masy szybszy niż wzrastanie": BMI jest już skorygowane
  // o wzrost, więc jego dodatni dryf oznacza, że masa idzie w górę szybciej niż wysokość.
  //
  // Nakładka odzywa się WYŁĄCZNIE tam, gdzie silnik dotąd milczał (`stable`) — nigdy nie
  // nadpisuje mocniejszego werdyktu. Stosuje się ją tylko do BMI; dla masy-do-wieku ten sam
  // dryf znaczy co innego (dziecko może po prostu rosnąć).
  function nakladkaPredkosciBmi(v, d, gapM) {
    if (!v || v.t !== 'stable') return v;
    if (typeof d !== 'number' || !isFinite(d) || !(d >= PROGI.PRZYSPIESZENIE_BMI_DSDS)) return v;
    if (typeof gapM !== 'number' || !isFinite(gapM) || !(gapM >= PROGI.PREDKOSC_MIN_ODSTEP_M)) return v;
    return { t: 'warn', l: 'BMI rośnie szybciej niż wzrastanie — do obserwacji' };
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
    poziomMasyBmi: poziomMasyBmi,
    para: para,
    zKontekstem: zKontekstem,
    hamulecCatchUp: hamulecCatchUp,
    nakladkaMasaBmi: nakladkaMasaBmi,
    nakladkaPredkosciBmi: nakladkaPredkosciBmi,
    nakladkaPozycjaWzrostu: nakladkaPozycjaWzrostu
  });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
