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
 * Rata 5 (decyzja właściciela 2026-09-27) dokłada dwie gałęzie POZIOMU przy nadwadze: BMI
 * stabilne w paśmie 85.–97. centyla przestaje brzmieć „stabilny tor BMI", a stabilny tor
 * masy-do-wieku przy BMI ≥85c (albo Cole ≥110 %) przestaje brzmieć uspokajająco.
 * Rata 6 (audyt 2 werdyktów, decyzja właściciela 2026-09-27) zmienia gałęzie LECZENIA: odpowiedź
 * na GH i na leczenie redukcyjne jest liczona na 12 miesięcy (ΔSDS × 12 / długość okna), a nie
 * z surowej ΔSDS pary punktów — dotąd +0,30 w 36 mies. brzmiało „dobra odpowiedź na GH", a +0,29
 * w 6 mies. „umiarkowana". Dochodzą: etykieta „brak istotnej odpowiedzi na leczenie" (redukcja
 * między −0,25 a +0,2 SDS/rok — dotąd taki pacjent spadał do werdyktu populacyjnego i słowo
 * „leczenie" znikało), „za wcześnie na ocenę odpowiedzi na GH" (okno < 6 mies. w kursie),
 * „szybka zmiana w krótkim oknie — do weryfikacji pomiaru" (wzrost, |ΔSDS| ≥ 0,5 w < 6 mies.)
 * oraz dopisek „nadal poniżej 3. centyla" przy GH (nakładka pozycyjna dotąd milkła przy GH).
 * Wołający, który nie poda długości okna, dostaje dokładnie dotychczasowe zachowanie — tego
 * pilnuje odcisk siatki (tests/unit/werdykt-silnik.test.mjs).
 * Rata 7 (karta „Porównanie z poprzednim pomiarem", decyzja właściciela 2026-09-27) dokłada: pasmo
 * wysokie MASY od 85. centyla (dotąd 90; start z 82c przy BMI 99c wpadał do środka siatki, gdzie
 * mówi tylko |ΔSDS| ≥ 0,5), ruch masy/BMI w KRÓTKIM OKNIE (< 6 mies.) liczony po tempie rocznym
 * (ruchKrotkieOkno: |ΔSDS × 12/okno| ≥ 0,5 — dotąd −0,19 w miesiąc brzmiało „stabilny tor"),
 * z kierunkiem PRZED poziomem („spadek BMI w krótkim oknie — …, nadal otyłość (>97c)") i liczbami
 * w ogonie, oraz strażnik tempa redukcji (strazTempaRedukcji) przeniesiony z panelu Karty pacjenta
 * do silnika, żeby karta, panel i trajektoria mówiły jednym głosem.
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

  var WERSJA = '7';

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
    PREDKOSC_MIN_ODSTEP_M: 3,
    // ── P-WERDYKT rata 6 (audyt 2, decyzja właściciela 2026-09-27): odpowiedź na leczenie NA ROK ──
    // Ocena odpowiedzi na GH wymaga okna ≥ 6 mies. w kursie (jak dotąd próg nakładania), a przy
    // oknie 6–11 mies. jest oznaczona „wstępnie". Progi na 12 mies. to dotychczasowe liczby
    // aplikacji (PR #63/v388: ≥ +0,3 dobra, < +0,1 słaba) — teraz odniesione do roku, a nie do
    // dowolnie długiego okna. Definicja słabej odpowiedzi w 1. roku (ΔhSDS < 0,3) za konsensusem
    // Bang 2012 (doi:10.1111/j.1365-2265.2012.04420.x). Osobny, niższy próg dla kolejnych lat
    // kursu pozostaje decyzją właściciela — dziś te same liczby na każdy rok kursu.
    GH_OKNO_MIN_M: 6,
    GH_WSTEPNIE_DO_M: 12,
    GH_DOBRA_DSDS_ROK: 0.3,
    GH_SLABA_DSDS_ROK: 0.1,
    // Redukcja: ocena od 3 mies. leczenia (okno 12 tyg. z ChPL — obesity_response_criteria.js),
    // „wstępnie" poniżej 6 mies. Odpowiedź = ΔBMI-SDS ≤ −0,25 na rok (Reinehr 2016, doi:10.1210/
    // jc.2016-1885: od 0,25 BMI-SDS poprawa ciśnienia i lipidów; dotąd −0,2 bez czasu), przyrost
    // ≥ +0,2/rok (jak dotąd), między nimi nowa etykieta „brak istotnej odpowiedzi na leczenie".
    // Próg „bardzo szybkiej" redukcji (−1,5) był już liczony na rok w panelu porównania.
    RD_OKNO_MIN_M: 3,
    RD_WSTEPNIE_DO_M: 6,
    RD_ODPOWIEDZ_DSDS_ROK: -0.25,
    RD_PRZYROST_DSDS_ROK: 0.2,
    RD_SZYBKA_DSDS_ROK: -1.5,
    // Krótkie okno wzrostu: |ΔhSDS| ≥ 0,5 (próg „deceleracji") w oknie < 6 mies. to najczęściej
    // błąd pomiaru, nie zdarzenie kliniczne — werdykt kieruje do weryfikacji, nie do rozpoznania.
    KROTKIE_OKNO_M: 6,
    KROTKIE_OKNO_DSDS: 0.5,
    // ── P-WERDYKT rata 7 (decyzja właściciela 2026-09-27) ──
    // Pasmo wysokie masy-do-wieku od 85c (dotąd 90c w literale para()). 85 = próg nadwagi BMI
    // (VildaBmi.PROGI.DZIECKO.NADWAGA) — ten sam, którym silnik od raty 5 nazywa poziom masy.
    MASA_PASMO_WYSOKIE_C: 85,
    // Ruch masy/BMI w krótkim oknie (< KROTKIE_OKNO_M): tempo roczne |ΔSDS × 12/okno| ≥ 0,5 —
    // ten sam próg, co ISTOTNE_PRZESUNIECIE_DSDS, tylko odniesiony do roku.
    RUCH_KROTKI_DSDS_ROK: 0.5,
    // …i zarazem |ΔSDS| ≥ 0,1 (próg płaskości fazy z raty 5): −0,05 SDS w miesiąc to szum wagi, nie ruch.
    RUCH_KROTKI_MIN_DSDS: 0.1,
    // Strażnik tempa redukcji — liczby z panelu Karty pacjenta (PR #63/v388): ≤ −1,5 SDS/rok albo
    // ubytek > 1 kg/mies. u dziecka < 12 lat / > ~3,9 kg/mies. (≈ 0,9 kg/tydz.) od 12 lat; odstęp ≥ 2 mies.
    TEMPO_RD_KG_MIES_MLODSI: 1,
    TEMPO_RD_KG_MIES_STARSI: 3.9,
    TEMPO_RD_WIEK_GRANICA_M: 144,
    TEMPO_RD_MIN_ODSTEP_M: 2
  });

  function dSds(sa0, sb0) {
    return Math.round(100 * (sb0 - sa0)) / 100;
  }

  // ── Pomocnicze raty 6 ──────────────────────────────────────────────────────────────
  // ΔSDS przeliczona na 12 miesięcy. Okno w miesiącach; bez poprawnego okna zwraca samą ΔSDS.
  function naRok(d, oknoM) {
    if (typeof oknoM !== 'number' || !isFinite(oknoM) || oknoM <= 0) return d;
    return Math.round(100 * d * 12 / oknoM) / 100;
  }
  // Dopisek do etykiety po „ — " (albo po przecinku, gdy ogon już jest). Słowniki opisu i epikryzy
  // odmieniają GŁOWĘ etykiety (część przed „ — "), ogon wraca na koniec zdania bez odmiany —
  // dlatego dopiski idą wyłącznie tędy, a nie do środka etykiety.
  function zOgonem(v, ogon) {
    if (!v || !ogon) return v;
    var l = String(v.l || '');
    var out = { t: v.t };
    out.l = l.indexOf(' \u2014 ') >= 0 ? l + ', ' + ogon : l + ' \u2014 ' + ogon;
    return out;
  }
  function oknoMies(oknoM) { return Math.round(oknoM) + ' mies.'; }
  // Odpowiedź na GH na 12 mies. (okno ≥ GH_OKNO_MIN_M — pilnuje wołający przez `gm`).
  function odpowiedzGH(d, oknoM) {
    var dr = naRok(d, oknoM);
    var v = dr >= PROGI.GH_DOBRA_DSDS_ROK ? { t: 'good', l: 'dobra odpowiedź na GH' }
      : dr < PROGI.GH_SLABA_DSDS_ROK ? { t: 'warn', l: 'słaba odpowiedź na GH — do oceny' }
        : { t: 'stable', l: 'odpowiedź umiarkowana (GH)' };
    return oknoM < PROGI.GH_WSTEPNIE_DO_M ? zOgonem(v, 'wstępnie (' + oknoMies(oknoM) + ')') : v;
  }
  // Odpowiedź na leczenie redukcyjne. `v1` = werdykt bazowy (ton przyrostu). Okno krótsze niż rok
  // jest przeliczane na 12 mies. (kryteria ChPL i Reinehra są roczne); okno ≥ 12 mies. ocenia
  // ZMIANĘ SKUMULOWANĄ od początku okna — odpowiedź osiągnięta i utrzymana przez 3 lata (−0,6) nie
  // może brzmieć „brak odpowiedzi" tylko dlatego, że średnio to −0,2 na rok. Tempo „bardzo szybkie"
  // jest zawsze na rok, bo to alarm o szybkości, nie o wielkości.
  function odpowiedzRedukcji(d, oknoM, v1) {
    var dr = naRok(d, oknoM);
    var ds = oknoM < 12 ? dr : d;
    var v;
    if (dr <= PROGI.RD_SZYBKA_DSDS_ROK) v = { t: 'warn', l: 'redukcja bardzo szybka — do kontroli' };
    else if (ds <= PROGI.RD_ODPOWIEDZ_DSDS_ROK) v = { t: 'good', l: 'redukcja w trakcie leczenia' };
    else if (ds >= PROGI.RD_PRZYROST_DSDS_ROK) v = { t: v1 && v1.t === 'bad' ? 'bad' : 'warn', l: 'przyrost masy mimo leczenia redukcyjnego' };
    else v = zOgonem({ t: 'warn', l: 'brak istotnej odpowiedzi na leczenie' }, 'po ' + oknoMies(oknoM));
    return oknoM < PROGI.RD_WSTEPNIE_DO_M ? zOgonem(v, 'wstępnie (' + oknoMies(oknoM) + ')') : v;
  }
  // Okno w kursie GH za krótkie na ocenę odpowiedzi (< GH_OKNO_MIN_M).
  function zaWczesnieGH(oknoM) {
    return zOgonem({ t: 'stable', l: 'za wcześnie na ocenę odpowiedzi na GH' }, oknoMies(oknoM));
  }
  // ── Rata 7: ruch masy/BMI w krótkim oknie i strażnik tempa ─────────────────────────
  function fmtL(x, miejsca) {
    if (typeof x !== 'number' || !isFinite(x)) return '';
    var r = Math.abs(x).toFixed(miejsca).replace('.', ',');
    return (x > 0 ? '+' : x < 0 ? '\u2212' : '\u00B1') + r;
  }
  function oknoTekst(oknoM) {
    if (typeof oknoM !== 'number' || !isFinite(oknoM)) return '';
    return oknoM < 1 ? 'w niecały mies.' : 'w ' + Math.round(oknoM) + ' mies.';
  }
  // Ogon z liczbami: masa „−2,0 kg (−3,1 %) w 1 mies.", BMI „−1,0 (−3,2 %) w 1 mies."; bez wartości — ΔSDS.
  function ogonLiczb(met, d, oknoM, ekstra) {
    var e = ekstra && typeof ekstra === 'object' ? ekstra : {};
    var maDv = typeof e.dVal === 'number' && isFinite(e.dVal), maPct = typeof e.pct === 'number' && isFinite(e.pct);
    if (maDv) return fmtL(e.dVal, 1) + (met === 'weight' ? ' kg' : '') + (maPct ? ' (' + fmtL(e.pct, 1) + ' %)' : '') + ' ' + oknoTekst(oknoM);
    return 'ΔSDS ' + fmtL(d, 2) + ' ' + oknoTekst(oknoM);
  }
  function poziomPoRuchu(met, cb) {
    if (typeof cb !== 'number' || !isFinite(cb)) return '';
    if (met === 'bmi') return cb >= PROGI.BMI_OTYLOSC_C ? 'nadal otyłość (>97c)' : cb >= PROGI.BMI_NADWAGA_C ? 'nadal nadwaga (85.–97. centyl)' : '';
    return cb >= PROGI.MASA_WYSOKA_C ? 'masa nadal >97c' : '';
  }
  // Ruch masy/BMI w oknie krótszym niż KROTKIE_OKNO_M, po tempie rocznym. Spadek z pasma nadmiaru (ca ≥ 85)
  // to dobra wiadomość z nazwanym poziomem; spadek spoza nadmiaru — do oceny; przyrost liczy się tylko, gdy
  // kończy w nadmiarze (cb ≥ 85). null = reguła milczy, wołający idzie dalej dotychczasową ścieżką.
  // ekstra: { dVal, pct } (zmiana wartości i procent) — do ogona; bez nich ogon niesie ΔSDS.
  function ruchKrotkieOkno(met, sa0, sb0, ca, cb, oknoM, ekstra) {
    if (met === 'height' || typeof oknoM !== 'number' || !isFinite(oknoM) || oknoM >= PROGI.KROTKIE_OKNO_M) return null;
    if (typeof sa0 !== 'number' || typeof sb0 !== 'number' || !isFinite(sa0) || !isFinite(sb0) || ca == null || cb == null) return null;
    var d = dSds(sa0, sb0), dr = naRok(d, oknoM);
    if (Math.abs(d) < PROGI.RUCH_KROTKI_MIN_DSDS || Math.abs(dr) < PROGI.RUCH_KROTKI_DSDS_ROK) return null;
    var B = met === 'bmi', v, ogon = ogonLiczb(met, d, oknoM, ekstra), poz;
    if (d < 0) {
      if (ca >= PROGI.BMI_NADWAGA_C) {
        v = zOgonem({ t: 'good', l: B ? 'spadek BMI w krótkim oknie' : 'redukcja masy ciała w krótkim oknie' }, ogon);
        poz = poziomPoRuchu(met, cb);
        return poz ? zOgonem(v, poz) : v;
      }
      return zOgonem(zOgonem({ t: 'warn', l: B ? 'spadek BMI w krótkim oknie' : 'utrata masy w krótkim oknie' }, ogon), 'do oceny');
    }
    if (cb < PROGI.BMI_NADWAGA_C) return null;
    v = zOgonem({ t: 'warn', l: B ? 'wzrost BMI w krótkim oknie' : 'przyrost masy w krótkim oknie' }, ogon);
    poz = poziomPoRuchu(met, cb);
    return poz ? zOgonem(v, poz) : v;
  }
  // Strażnik tempa redukcji (nie osłabia werdyktu „bad"): spadek ≥ 0,2 SDS przy starcie ≥ 10c i odstępie
  // ≥ 2 mies., gdy tempo ≤ −1,5 SDS/rok albo (masa) ubytek w kg/mies. ponad próg wieku. ekstra: { dVal, wiekMies }.
  function strazTempaRedukcji(met, sa0, sb0, ca, oknoM, ekstra) {
    if (met === 'height' || typeof oknoM !== 'number' || !isFinite(oknoM) || oknoM < PROGI.TEMPO_RD_MIN_ODSTEP_M) return null;
    if (typeof sa0 !== 'number' || typeof sb0 !== 'number' || !isFinite(sa0) || !isFinite(sb0) || ca == null || ca < 10) return null;
    var d = dSds(sa0, sb0);
    if (d > -0.2) return null;
    var szybko = naRok(d, oknoM) <= PROGI.RD_SZYBKA_DSDS_ROK;
    var e = ekstra && typeof ekstra === 'object' ? ekstra : {};
    if (!szybko && met === 'weight' && typeof e.dVal === 'number' && isFinite(e.dVal) && typeof e.wiekMies === 'number' && isFinite(e.wiekMies)) {
      var kgM = e.dVal / oknoM;
      szybko = e.wiekMies < PROGI.TEMPO_RD_WIEK_GRANICA_M ? kgM <= -PROGI.TEMPO_RD_KG_MIES_MLODSI : kgM <= -PROGI.TEMPO_RD_KG_MIES_STARSI;
    }
    return szybko ? { t: 'warn', l: 'redukcja bardzo szybka — do kontroli' } : null;
  }

  // Krótkie okno wzrostu z dużą zmianą — do weryfikacji pomiaru, przed każdą inną regułą.
  function krotkieOkno(met, sa0, sb0, oknoM) {
    if (met !== 'height' || typeof oknoM !== 'number' || !isFinite(oknoM) || oknoM >= PROGI.KROTKIE_OKNO_M) return null;
    if (Math.abs(dSds(sa0, sb0)) < PROGI.KROTKIE_OKNO_DSDS) return null;
    return { t: 'warn', l: 'szybka zmiana w krótkim oknie — do weryfikacji pomiaru' };
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
      // P-WERDYKT rata 5 (decyzja właściciela 2026-09-27): rata 2 nazwała przy stabilnym torze
      // tylko ≥97c i <5c; pasmo nadwagi 85.–97. centyla zostawało „stabilnym torem BMI", czyli
      // brzmiało jak środek siatki. Zmierzone na siatce z rat 2/4: 864 z 5 499 „stabilnych"
      // komórek BMI kończy w tym paśmie. Próg 85 = VildaBmi.PROGI.DZIECKO.NADWAGA (nie nowy).
      if (cb >= PROGI.BMI_NADWAGA_C && cb < PROGI.BMI_OTYLOSC_C) return { t: 'warn', l: 'tor stabilny, ale BMI w paśmie nadwagi (85.–97. centyl)' };
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
    // Rata 7: pasmo wysokie masy od MASA_PASMO_WYSOKIE_C (85), jak BMI; wzrost bez zmian (> 90c).
    var d = dSds(sa0, sb0), W = met === 'height', B = met === 'bmi', low = ca < 10, high = W ? ca > 90 : ca >= (B ? 85 : PROGI.MASA_PASMO_WYSOKIE_C);
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
  // Rata 6: dziewiąty argument `oknoM` (długość okna A→B w miesiącach) włącza liczenie odpowiedzi
  // na leczenie NA ROK. Bez niego gałęzie GH i redukcji zachowują się dokładnie jak dotąd.
  function zKontekstem(met, sa0, sb0, ca, cb, gm, mp, rd, oknoM) {
    var v1 = para(met, sa0, sb0, ca, cb);
    if (!v1) return null;
    var d = dSds(sa0, sb0);
    var naRokOn = typeof oknoM === 'number' && isFinite(oknoM) && oknoM > 0;
    if (met === 'height') {
      if (gm >= 6) {
        if (naRokOn) return odpowiedzGH(d, oknoM);
        return d >= 0.3 ? { t: 'good', l: 'dobra odpowiedź na GH' } : d < 0.1 ? { t: 'warn', l: 'słaba odpowiedź na GH — do oceny' } : { t: 'stable', l: 'odpowiedź umiarkowana (GH)' };
      }
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
      if (naRokOn) return odpowiedzRedukcji(d, oknoM, v1);
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

  // Poziom BMI przy STABILNYM torze masy-do-wieku (P-WERDYKT rata 5, decyzja właściciela
  // 2026-09-27). Rata 2 ostrzegała o masie tylko ≥97c, bo „wiersz BMI rozstrzyga". Ale
  // „stabilny tor masy ciała" obok BMI 88c brzmiał uspokajająco (zgłoszenie właściciela
  // z raportu wzrastania). To próg POZIOMU, nie ruchu — te same liczby, co hamulec
  // catch-upu (BMI ≥85c, Cole ≥110 %), i ta sama zasada: BMI mówi pierwsze, Cole drugi.
  function poziomNadwagiPrzyStabilnejMasie(poziomBmi) {
    var p = poziomBmi || {};
    var c = typeof p.centyl === 'number' && isFinite(p.centyl) ? p.centyl : null;
    var cole = typeof p.cole === 'number' && isFinite(p.cole) ? p.cole : null;
    if (c != null && c >= PROGI.BMI_OTYLOSC_C) return { t: 'warn', l: 'tor masy ciała stabilny, ale BMI w paśmie otyłości (≥97c)' };
    if (c != null && c >= PROGI.BMI_NADWAGA_C) return { t: 'warn', l: 'tor masy ciała stabilny, ale BMI w paśmie nadwagi (≥85c)' };
    if (cole != null && cole >= PROGI.COLE_NADWAGA_PCT) return { t: 'warn', l: 'tor masy ciała stabilny, ale wskaźnik Cole\'a sięga 110%' };
    return null;
  }

  function nakladkaMasaBmi(v, dW, vB, dB, poziomBmi) {
    // Rata 7: „utrata masy w krótkim oknie — do oceny" (masa-do-wieku spoza pasma nadmiaru) przy BMI, które
    // w tym samym oknie spada z nadmiaru („spadek BMI w krótkim oknie", good), to redukcja nadmiaru — BMI
    // rozstrzyga o nadmiarze, nie centyl masy (ten sam argument, co w poziomMasyBmi).
    if (v && vB && vB.t === 'good' && String(v.l || '').indexOf('utrata masy w krótkim oknie') === 0
      && String(vB.l || '').indexOf('spadek BMI w krótkim oknie') === 0) {
      var l7 = String(v.l).replace('utrata masy w krótkim oknie', 'redukcja masy ciała w krótkim oknie').replace(/, do oceny(?=,|$)/, '');
      var o7 = { t: 'good' }; o7.l = l7;
      return o7;
    }
    if (!v) return v;
    if (dW >= 0.2) {
      // Catch-up (`good`) ocenia hamulec poziomu; „stabilny" tor — reguła ruchu poniżej.
      // Rozdział jest celowy: etykieta reguły ruchu mówi „nadmiar ujawnia się w BMI",
      // a to byłaby nieprawda przy catch-upie, który dojechał dopiero do środka siatki.
      if (v.t === 'good') return hamulecCatchUp(poziomBmi) || v;
      if (v.t === 'stable' && vB && (vB.t === 'warn' || vB.t === 'bad') && dB >= 0.2) {
        return { t: 'warn', l: 'przyrost masy szybszy niż wzrastanie — nadmiar ujawnia się w BMI' };
      }
    }
    // Rata 5: poziom BMI przy stabilnym torze masy — niezależnie od ruchu masy. Bez danych
    // o poziomie (przemiatanie siatki, brak silnika BMI) reguła milczy, jak hamulec.
    if (v.t === 'stable') return poziomNadwagiPrzyStabilnejMasie(poziomBmi) || v;
    return v;
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
  // Rata 5: gałąź poziomu „BMI w paśmie nadwagi (85.–97. centyl)" powstaje w para() tam, gdzie dotąd był
  // „stabilny tor BMI" — czyli dokładnie tam, gdzie ta nakładka ma prawo mówić. RUCH ma pierwszeństwo przed
  // POZIOMEM (jak w nakładce masa↔BMI): przy ΔbmiSDS ≥ +0,30 etykieta „tor stabilny" byłaby nieprawdą.
  var ETYKIETA_POZIOMU_NADWAGI_BMI = 'tor stabilny, ale BMI w paśmie nadwagi (85.–97. centyl)';
  function nakladkaPredkosciBmi(v, d, gapM) {
    if (!v || (v.t !== 'stable' && v.l !== ETYKIETA_POZIOMU_NADWAGI_BMI)) return v;
    if (typeof d !== 'number' || !isFinite(d) || !(d >= PROGI.PRZYSPIESZENIE_BMI_DSDS)) return v;
    if (typeof gapM !== 'number' || !isFinite(gapM) || !(gapM >= PROGI.PREDKOSC_MIN_ODSTEP_M)) return v;
    return { t: 'warn', l: 'BMI rośnie szybciej niż wzrastanie — do obserwacji' };
  }

  // ── 3b. Nakładka pozycyjna wzrostu ───────────────────────────────────────────────────
  // Transkrypcja 1:1 dotychczasowych verdictHtPos / heightPositionOverlayVerdict.
  // „Stabilny" tor nie jest uspokajający, gdy pozycja tego nie uzasadnia: <3c zawsze (niedobór
  // wzrostu z definicji, poza normą populacyjną 3–97c), 3–10c tylko przy torze poniżej kanału
  // rodzicielskiego (≥1,5 SDS pod MPH). Pasmo 3–10c samo w sobie to DOLNE PASMO NORMY, nie brak
  // normy (decyzja właściciela 2026-08-14). Przy aktywnej ocenie odpowiedzi na GH nakładka nie
  // zmienia werdyktu, ale od raty 6 dopisuje „nadal poniżej 3. centyla" — dotąd milkła zupełnie
  // i „odpowiedź umiarkowana (GH)" na 1. centylu brzmiała jak dziecko w normie.
  function nakladkaPozycjaWzrostu(v, cb, mp, sa0, ghOn) {
    if (!v) return v;
    if (ghOn) return typeof cb === 'number' && cb < 3 ? zOgonem(v, 'nadal poniżej 3. centyla') : v;
    if (v.t !== 'stable') return v;
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
    poziomNadwagiPrzyStabilnejMasie: poziomNadwagiPrzyStabilnejMasie,
    nakladkaMasaBmi: nakladkaMasaBmi,
    nakladkaPredkosciBmi: nakladkaPredkosciBmi,
    nakladkaPozycjaWzrostu: nakladkaPozycjaWzrostu,
    // Rata 6
    naRok: naRok,
    zOgonem: zOgonem,
    krotkieOkno: krotkieOkno,
    zaWczesnieGH: zaWczesnieGH,
    // Rata 7
    ruchKrotkieOkno: ruchKrotkieOkno,
    strazTempaRedukcji: strazTempaRedukcji
  });
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null);
