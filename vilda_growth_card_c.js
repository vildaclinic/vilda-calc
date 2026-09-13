/* vilda_growth_card_c.js — prezentacja prognoz wzrostu na karcie „Zaawansowane obliczenia wzrostowe”.
 * Uklad „B (clean)”: duza liczba wiodaca + lista metod z przedzialem ±, cel MPH, kafel tempa
 * wzrastania, a reszta (wiarygodnosc slownie, profil/dobor modelu, nota KR) w rozwijanych „Szczegolach”.
 *
 * Czytelny modul (nie-minified) wg AGENTS.md §2: cala logika prezentacji tutaj; zminifikowany
 * vilda_advanced_growth.js jedynie WYWOLUJE window.VildaGrowthCardC.render(input).
 *
 * Zakres: SAMA PREZENTACJA + policzenie KR z window.calculateKhamisRochePrediction. NIE zmienia wzorow
 * BP/RWT/Reinehr/MPH. Kolejnosc STALA: RWT → BP → KR → Reinehr; MPH (cel, nie prognoza) na koncu listy.
 * Brakujace metody ukrywane. BEZ pastylek „NOWA”/wiarygodnosci i bez „Uwagi ogolnej” (decyzja wlasciciela).
 *
 * BLAD KR: sredni 90% przedzial bledu metody (Khamis HJ, Roche AF, Pediatrics 1994;94(4 Pt 1):504-507,
 * PMID 7936860): ±2,1 cala (chlopcy) / ±1,7 cala (dziewczeta) → ±5,3 cm / ±4,3 cm. Zbiorczy (nie per wiek).
 *
 * CLAMP DO AKTUALNEGO WZROSTU (decyzja wlasciciela 2026-08-13): prognoza punktowa kazdej metody nie
 * moze byc nizsza niz zmierzony wzrost (artefakt regresji przy gornej granicy wieku). Wartosc ponizej
 * aktualnego wzrostu jest podnoszona do niego (rawValue + flaga clamped w entry), a w prezentacji
 * zamiast "±" pokazywane sa widelki obciete od dolu: [obecny wzrost, max(raw + polszerokosc, obecny
 * wzrost)] — gorna granica liczona od wartosci SUROWEJ, zeby nie zawyzac przedzialu metody; gdy caly
 * przedzial lezy ponizej obecnego wzrostu, widelki zapadaja sie do pojedynczej wartosci. Konsensus
 * liczy sie z wartosci obcietych.
 */
(function (w) {
  'use strict';

  var STYLE_ID = 'vgcc-style';
  var KR_ERR_HALFWIDTH_CM = { M: 5.3, F: 4.3 };
  var AGREE_GOOD_CM = 3, AGREE_MODERATE_CM = 6;

  // Ważony konsensus (Wniosek 2 / SPEC_dobor_metody). Waga metody = f_wiar(poziom) / σ²,
  // gdzie σ = errorBoundHalfWidthCm / 1,645 (90% półszerokość → SD). Metoda o najwyższej wadze
  // = „preferowana dla profilu". PARAMETRY KLINICZNE — do strojenia przez właściciela, bez zmian logiki.
  var CONSENSUS_W = { high: 1.0, moderate: 0.7, lowered: 0.5, indicative: 0.5, low: 0.3 };
  var CI90_TO_SD = 1.645;
  // Gdy metoda nie podaje błędu: σ NIE lepsze niż najsłabsza znana metoda (±6,4 cm → 3,9), żeby
  // metoda bez przedziału nie wygrywała z metodami o udokumentowanym błędzie (audyt 2026-09-11;
  // 6,4 = przedział Reinehra z GROWTH-PRED-REINEHR, wcześniej 5,7).
  var DEFAULT_ERR_HALFWIDTH_CM = 6.4;
  var DEFAULT_SIGMA_CM = DEFAULT_ERR_HALFWIDTH_CM / 1.645;

  // GROWTH-PRED-DOBOR (decyzja właściciela 2026-09-12). Bramki stosowalności wg Δ = wiek kostny −
  // wiek metrykalny [mies.] i MPH jako kotwica konsensusu:
  //  • Khamis–Roche nie zna wieku kostnego: |Δ| < 12 → pełna waga; 12–24 → ×0,5; ≥ 24 → POZA
  //    konsensusem (wiersz informacyjny). • RWT: Δ ≥ +24 → ×0,5 (wiek kostny jest w RWT jednym
  //    z czterech regresorów o małej wadze). • Bayley–Pinneau przy przyspieszeniu liczy z tablicy
  //    „przyspieszonej" — bez dodatkowej kary (kara za opóźnienie zostaje w profilu wiarygodności).
  //  • MPH wchodzi do średniej ważonej jako kotwica: f = 0,7, σ = 5,1 cm (95% przedział celu
  //    ±10 cm; Luo 1998, Pediatr Res 44:563) — udział nigdy nie przekracza ok. 1/3. Nie jest
  //    „metodą preferowaną" i nie wchodzi do widełek min–max ani do zgodności.
  //  • Nagłówek = wartość metody preferowanej, gdy zgodność jest niska I zadziałała jakaś bramka;
  //    wtedy konsensus ważony schodzi do podtytułu. PARAMETRY KLINICZNE — do strojenia.
  CONSENSUS_W.mph = 0.7;
  var MPH_SIGMA_CM = 5.1;
  var DELTA_KR_HALF_MONTHS = 12, DELTA_GATE_MONTHS = 24;

  // GROWTH-PRED-BIAS (decyzja właściciela 2026-09-11): korekty błędu SYSTEMATYCZNEGO metod wg
  // profilu pacjenta (znak: prognoza − wzrost osiągnięty; korekta = −błąd). Wiersz metody pokazuje
  // wartość skorygowaną; surowa w `uncorrectedCm` i w Szczegółach. Progi profilu: hSDS ≥ +2
  // (wysokorosłość) / ≤ −2 (niskorosłość). PARAMETRY KLINICZNE — do strojenia.
  //  • BP, chłopcy, Δ ≤ −24 mies.: −2,0 cm, σ×1,2 (Reinehr 2019 +1,6 przy opóźnieniu ≥ 2 l; Brämswig 1990
  //    +3,1; Rohani 2018 +5,0; Sperlich 1995: 33% prognoz > 5 cm od wyniku).
  //  • BP, chłopcy, hSDS ≥ +2 i wiek kostny < 12 l: −4,0 cm, σ×1,3 (Joss 1992 „masowo" do BA 12,
  //    Bettendorf 1997 +0,6 SDS, Matias 2022 +5 cm); po BA 12 bez korekty (Joss: trafna).
  //  • BP, dziewczęta, hSDS ≥ +2 i wiek kostny 12–14 l: −1,0 cm (Joss 1992; Drayer 1997 +0,7).
  //  • RWT, hSDS ≤ −2: −1,3 cm (Blum 2022, walidacja n = 35: +1,33 ±4,4).
  //  • Reguły BP są rozłączne (pierwsza pasująca), żeby korekty się nie sumowały.
  //  • MPH: kotwica = cel WARUNKOWY: M + 0,78·(MPH − M), M = mediana wzrostu dorosłego danej płci
  //    (regresja do średniej, Luo 1998: TH = 46,0 + 0,78·MPH; Cole 2000); przy hSDS ≤ −2 waga
  //    kotwicy ×0,5 (dzieci ISS kończą ~0,6 SDS poniżej celu: Blum 2022, Rekers-Mombarg 1996).
  //  • Reinehr/CDGP bez własnego przedziału błędu dostawał σ = 3,0 → sztuczna dominacja; od
  //    GROWTH-PRED-REINEHR ±6,4 cm z pracy (Study A, 5.–95. centyl błędu −7,1…+5,6; wcześniej 5,7).
  var BIAS_TALL_SDS = 2, BIAS_SHORT_SDS = -2;
  var BIAS_RULES = {
    bpDelayBoys: { shift: -2.0, sigma: 1.2, note: 'Bayley–Pinneau przy opóźnieniu kostnym ≥ 2 lata zawyża u chłopców', source: 'Reinehr 2019; Brämswig 1990' },
    bpTallBoys: { shift: -4.0, sigma: 1.3, note: 'Bayley–Pinneau w wysokorosłości zawyża u chłopców do wieku kostnego 12 lat', source: 'Joss 1992; Bettendorf 1997; Matias 2022' },
    bpTallGirls: { shift: -1.0, sigma: 1.0, note: 'Bayley–Pinneau w wysokorosłości zawyża u dziewcząt przy wieku kostnym 12–14 lat', source: 'Joss 1992; Drayer 1997' },
    rwtShort: { shift: -1.3, sigma: 1.0, note: 'RWT w niskorosłości (hSDS ≤ −2) zawyża', source: 'Blum 2022' }
  };
  var MPH_SHRINK = 0.78;
  var MPH_SHORT_WEIGHT = 0.5;
  var REINEHR_ERR_HALFWIDTH_CM = 6.4;

  // GROWTH-PRED-TW2 (decyzja właściciela 2026-09-12): profil „po menarche" u dziewcząt.
  //  • TW Mark II (Tanner 1983, tab. 3.1a/b/c, 3.2a/b, 3.3a/b dziewczęta, 2.1/2.2 chłopcy) jako metoda konsensusu: poziom z resztkowego
  //    SD tablicy (≤ 2,0 → wysoka; ≤ 3,0 → umiarkowana; wyżej → obniżona), przy ekstrapolacji poniżej
  //    tablicy (po menarche przed 11,5 r.ż.) — orientacyjna.
  //  • Po menarche: RWT i Khamis–Roche poza konsensusem (nie znają statusu menarche; regresje na
  //    dzieciach rosnących), kotwica MPH ×0,25 (Tanner 1983, s. 775: przy 95 % wzrostu dorosłego
  //    dodawanie za wysokich rodziców „nie ma sensu"), pseudometoda „wzrost przy menarche / 0,955"
  //    (Singleton 1975; korekta wieku kostnego Cho 2026) z poziomem obniżonym.
  //  PARAMETRY KLINICZNE — do strojenia.
  var MPH_POSTMENARCHE_WEIGHT = 0.25;
  var TW2_LEVEL_SD_HIGH = 2.0, TW2_LEVEL_SD_MODERATE = 3.0;

  // GROWTH-PRED-PUB2 (decyzja właściciela 2026-09-12): reguły wag w profilu przedwczesnego / wczesnego
  // pokwitania (profil z vilda_puberty_profile.js; także w trakcie i po leczeniu GnRHa, bo GnRHa
  // podaje się tylko w przedwczesnym pokwitaniu). Właściciel: profil wczesny (8–9 l dziewczęta,
  // 9–10,5 l chłopcy) traktować jak przedwczesny.
  //  • RWT i Khamis–Roche POZA konsensusem: regresje z dzieci o prawidłowym czasie pokwitania; RWT
  //    i Tanner Mark I „rażąco zawyżają" w przedwczesnym pokwitaniu (Zachmann 1978), KR nie zna
  //    wieku kostnego.
  //  • Bayley–Pinneau z tablicy „przeciętnej" zamiast „przyspieszonej" (Kauli 1997; Tanaka 2005;
  //    Brito 2008; Mul 2005 — adapter przekazuje groupOverride) i przedział ×1,3 (Erkko 2025: bez błędu
  //    średniego, ale SD 6,6 cm u 6–8-latek). Nota Bayley o dzieciach przyspieszonych wyciszona.
  //  • TW Mark II orientacyjna (tablice Tannera z dzieci o prawidłowym czasie dojrzewania).
  //  • MPH: pełna waga kotwicy przed menarche (×0,25 zostaje tylko po menarche).
  //  • Zdanie „konsensus wobec celu rodzicielskiego": różnica w cm i w SD celu (σ 5,1); progi:
  //    ≥ 5 cm poniżej MPH → „poniżej celu"; konsensus < −2 SDS norm dorosłych → „niskorosłość
  //    dorosła" (Bertelloni 2017: nieleczone wczesne FH ≈ MPH; Kauli 1997: szybkie 5–8 cm poniżej).
  //    Bez słów o leczeniu — decyzja lekarza. PARAMETRY KLINICZNE — do strojenia.
  var PUB_BP_SIGMA_FACTOR = 1.3;
  var TARGET_BELOW_CM = 5;
  var ADULT_SHORT_SDS = -2;

  // GROWTH-PRED-PUB3 (decyzja właściciela 2026-09-12): wiersze INFORMACYJNE poza konsensusem (bez wagi,
  // nie wchodzą do widełek ani zgodności), pokazywane w profilach pokwitaniowych (jak zdanie wobec celu):
  //  • „Wzrost dla wieku kostnego": SDS obecnego wzrostu wobec norm dla wieku KOSTNEGO (adapter,
  //    te same normy co centyle) przeniesiony na normy dorosłych 18 l (LMS z adaptera). Przy
  //    przyspieszeniu wieku kostnego bez aktywacji osi zgodny z wzrostem osiągniętym (Lazar 2010),
  //    przy BA − CA > 1 rok zaniża (Oron 2011; Jang 2023) — skok pokwitaniowy jest jeszcze przed dzieckiem.
  //  • Wu 2023 (Eur J Pediatr, DOI 10.1007/s00431-023-04842-3): dziewczęta z idiopatycznym CPP
  //    leczone GnRHa, populacja chińska: AH = 1,896·hSDS + 2,299·hSDS(BA) + 0,408·cel + 100,17
  //    (RMSE 2,2 cm w kohorcie autorów). Tylko dziewczęta. PARAMETRY KLINICZNE — do strojenia.
  var WU2023 = { hSds: 1.896, hSdsBa: 2.299, th: 0.408, konst: 100.17 };
  // Wzrost z SDS wobec LMS (odwrotność adultSdsFor).
  function heightFromSds(z, lms) {
    var zz = num(z);
    if (zz === null || !lms || typeof lms !== 'object') return null;
    var L = num(lms.L), M = num(lms.M), S = num(lms.S);
    if (M === null || M <= 0 || S === null || S <= 0) return null;
    if (L === null) L = 1;
    var x = Math.abs(L) < 1e-6 ? M * Math.exp(S * zz) : M * Math.pow(1 + L * S * zz, 1 / L);
    return isFinite(x) && x > 0 ? x : null;
  }
  function infoRowsFor(input, sk, curH) {
    var rows = [];
    var hBa = num(input.heightSdsForBoneAge);
    var hCa = num(input.heightSds);
    var mph = num(input.mphCm);
    var lms = input.adultHeightLMS;
    function push(key, label, cm, note, extra) {
      var v = num(cm);
      if (v === null) return;
      var clamped = false;
      if (curH !== null && v < curH) { v = curH; clamped = true; }
      var r = { key: key, label: label, cm: v, rawCm: num(cm), clamped: clamped, note: note, infoOnly: true };
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
      rows.push(r);
    }
    if (hBa !== null) {
      push('hba', 'Wzrost dla wieku kostnego', heightFromSds(hBa, lms),
        'SDS wzrostu dla wieku kostnego ' + fmtSds(hBa) + ' przeniesiony na normy dorosłych (18 l); przy przyspieszeniu wieku kostnego bez aktywacji osi zgodny z wzrostem osiągniętym (Lazar 2010), przy BA − CA > 1 rok zaniża, bo skok pokwitaniowy jest jeszcze przed dzieckiem (Oron 2011; Jang 2023)',
        { heightSdsForBoneAge: hBa });
    }
    if (sk === 'F' && hBa !== null && hCa !== null && mph !== null && mph > 0) {
      push('wu2023', 'Wu 2023 (CPP, dziewczęta)', WU2023.hSds * hCa + WU2023.hSdsBa * hBa + WU2023.th * mph + WU2023.konst,
        'równanie 1,896·hSDS ' + fmtSds(hCa) + ' + 2,299·hSDS dla wieku kostnego ' + fmtSds(hBa) + ' + 0,408·cel ' + fmt1(mph) + ' + 100,17; model z dziewcząt z idiopatycznym CPP leczonych GnRHa, populacja chińska (RMSE 2,2 cm u autorów) — orientacyjny',
        { heightSds: hCa, heightSdsForBoneAge: hBa, targetCm: mph });
    }
    return rows;
  }
  function fmtSds(z) { var n = num(z); if (n === null) return ''; var a = Math.abs(n).toFixed(2).replace('.', ','); return (n < -0.005 ? '−' : (n > 0.005 ? '+' : '')) + a; }

  // Reguły profilu pokwitaniowego dla konsensusu: { active, profil, tempo, gnrhaWTrakcie, gnrhaPo, label }.
  function pubertyRulesFor(pp) {
    var off = { active: false, profil: pp && pp.profil ? String(pp.profil) : '', tempo: pp && pp.tempo ? String(pp.tempo) : '', kategoriaStartu: pp && pp.kategoriaStartu ? String(pp.kategoriaStartu) : '', gnrhaWTrakcie: false, gnrhaPo: false, label: '' };
    if (!pp || typeof pp !== 'object') return off;
    var g = pp.gnrha && typeof pp.gnrha === 'object' ? pp.gnrha : {};
    off.gnrhaWTrakcie = g.wTrakcie === true;
    off.gnrhaPo = g.poLeczeniu === true;
    var profil = off.profil;
    var treated = off.gnrhaWTrakcie || off.gnrhaPo;
    var active = profil === 'przedwczesne' || profil === 'wczesne' || (treated && profil !== 'po-menarche');
    if (!active) return off;
    off.active = true;
    off.label = profil === 'wczesne' ? 'wczesnego pokwitania' : (profil === 'przedwczesne' ? 'przedwczesnego pokwitania' : 'leczonego przedwczesnego pokwitania');
    return off;
  }
  // Reguła profilu dla metody (poszerzenie przedziału) albo null.
  function profileRuleFor(key, rules) {
    if (!rules || !rules.active) return null;
    if (key === 'bp') return { sigmaFactor: PUB_BP_SIGMA_FACTOR, note: 'przedział ×1,3 w profilu ' + rules.label + ' (Erkko 2025: SD 6,6 cm u 6–8-latek)' };
    return null;
  }
  // SDS wzrostu wobec norm dorosłych z LMS (18 l) — null bez kompletnego LMS.
  function adultSdsFor(cm, lms) {
    var x = num(cm);
    if (x === null || x <= 0 || !lms || typeof lms !== 'object') return null;
    var L = num(lms.L), M = num(lms.M), S = num(lms.S);
    if (M === null || M <= 0 || S === null || S <= 0) return null;
    if (L === null) L = 1;
    var z = Math.abs(L) < 1e-6 ? Math.log(x / M) / S : (Math.pow(x / M, L) - 1) / (L * S);
    return isFinite(z) ? z : null;
  }
  // Konsensus wobec celu rodzicielskiego: różnica w cm i w SD celu, SDS wobec norm dorosłych, próg.
  function targetAssessmentFor(weightedCm, mphCm, adultLms) {
    var w = num(weightedCm), m = num(mphCm);
    if (w === null) return null;
    var adultSds = adultSdsFor(w, adultLms);
    var diff = m !== null && m > 0 ? w - m : null;
    var tier = diff !== null ? 'w-zakresie-celu' : 'w-normie-doroslych';
    if (adultSds !== null && adultSds < ADULT_SHORT_SDS) tier = 'niskoroslosc-dorosla';
    else if (diff !== null && diff <= -TARGET_BELOW_CM) tier = 'ponizej-celu';
    else if (diff === null && adultSds === null) return null;
    var labels = { 'niskoroslosc-dorosla': 'niskorosłość dorosła', 'ponizej-celu': 'poniżej celu', 'w-zakresie-celu': 'w zakresie celu', 'w-normie-doroslych': 'w normie dorosłych' };
    return { diffCm: diff, targetSd: diff !== null ? diff / MPH_SIGMA_CM : null, adultSds: adultSds, tier: tier, tierLabel: labels[tier] };
  }

  // Korekta błędu systematycznego dla metody `key` w profilu `ctx`
  // ({ sexKey, deltaMonths, heightSds, boneAgeYears }) albo null.
  function biasFor(key, ctx) {
    ctx = ctx || {};
    var sk = ctx.sexKey, d = num(ctx.deltaMonths), hs = num(ctx.heightSds), ba = num(ctx.boneAgeYears);
    var r = null;
    if (key === 'bp') {
      if (sk === 'M' && d !== null && d <= -DELTA_GATE_MONTHS) r = BIAS_RULES.bpDelayBoys;
      else if (sk === 'M' && hs !== null && hs >= BIAS_TALL_SDS && ba !== null && ba < 12) r = BIAS_RULES.bpTallBoys;
      else if (sk === 'F' && hs !== null && hs >= BIAS_TALL_SDS && ba !== null && ba >= 12 && ba < 14) r = BIAS_RULES.bpTallGirls;
    } else if (key === 'rwt') {
      if (hs !== null && hs <= BIAS_SHORT_SDS) r = BIAS_RULES.rwtShort;
    }
    return r ? { shiftCm: r.shift, sigmaFactor: r.sigma, note: r.note, source: r.source } : null;
  }

  // GROWTH-PRED-BP-DZIEWCZETA (decyzja wlasciciela 2026-09-13): ostrzezenie o prognozie
  // Bayleya-Pinneau przy opoznieniu wieku kostnego >= 2 lata obejmuje takze dziewczeta. Dotad
  // bylo WYLACZNIE dla chlopcow (zdanie modulu KOWD, dzis w karcie niewidoczne, oraz korekta
  // -2,0 cm z BIAS_RULES.bpDelayBoys); dziewczeta dostawaly tylko note Bayley 1952 schowana
  // w „Szczegolach”, choc degradacja wiarygodnosci prognoz dziala u obu plci (delta <= -24).
  //
  // U DZIEWCZAT NIE MA KOREKTY LICZBOWEJ i ostrzezenie jej nie sugeruje. Powod jest w danych:
  // jedyna praca obejmujaca obie plcie — Bramswig 1990 (37 chlopcow / 32 dziewczeta z KOWD,
  // J Pediatr 1990;117:886-91, DOI 10.1016/s0022-3476(05)80127-1) — daje blad BP +3,1 cm
  // u chlopcow i -0,8 cm u dziewczat; Reinehr 2019 (DOI 10.1159/000499712) i Akin Kagizmanli
  // 2025 (DOI 10.4274/jcrpe.galenos.2025.2024-11-6), z ktorych pochodzi wielkosc -2,0 cm,
  // liczyly WYLACZNIE chlopcow. Ostrzezenie u dziewczat mowi wiec o NIEPEWNOSCI prognozy
  // (tabele bledu nie byly kalibrowane dla tak duzego opoznienia), nie o kierunku bledu.
  // Zwraca sam tekst, bez wplywu na cm, +- i wagi — to komunikat, nie regula liczbowa.
  function bpDelayCautionFor(sk, deltaMonths, hasBp) {
    var d = num(deltaMonths);
    if (hasBp !== true || d === null || d > -DELTA_GATE_MONTHS) return '';
    var msc = String(Math.abs(Math.round(d)));
    if (sk === 'M') {
      return 'wiek kostny opóźniony o ' + msc + ' mies. — Bayley–Pinneau w tej sytuacji zawyża u chłopców, '
        + 'dlatego prognozę tej metody skorygowano o −2,0 cm (Reinehr 2019; Brämswig 1990).';
    }
    if (sk === 'F') {
      return 'wiek kostny opóźniony o ' + msc + ' mies. — prognozę Bayleya-Pinneau traktuj ostrożnie, bo tabele '
        + 'błędu metody nie były kalibrowane dla tak dużego opóźnienia. Korekty liczbowej u dziewcząt nie '
        + 'zastosowano: dane obejmujące obie płcie nie potwierdzają u nich zawyżania opisanego u chłopców '
        + '(Brämswig 1990: błąd +3,1 cm u chłopców, −0,8 cm u dziewcząt).';
    }
    return '';
  }
  // Cel warunkowy z MPH: regresja do średniej wzrostu dorosłego danej płci (Luo 1998).
  function mphAnchorFrom(mphCm, adultMedianCm) {
    var m = num(mphCm), med = num(adultMedianCm);
    if (m === null) return null;
    if (med === null || med <= 0) return m;
    return med + MPH_SHRINK * (m - med);
  }
  var GATE_LABELS = {
    khamis: 'Khamis–Roche',
    rwt: 'RWT'
  };

  // Δ = wiek kostny − wiek metrykalny w miesiącach (null, gdy brak któregoś).
  function deltaMonthsFor(input) {
    var ba = num(input && input.boneAgeYears);
    var months = num(input && input.ageMonths);
    if (months === null || months <= 0) {
      var y = num(input && input.ageYears);
      months = y !== null && y > 0 ? y * 12 : null;
    }
    if (ba !== null && ba > 0 && months !== null) return Math.round(ba * 12 - months);
    var fromBp = num(input && input.bp && input.bp.deltaMonths);
    return fromBp;
  }
  function gateFor(key, delta, ctx) {
    // Profil po menarche (GROWTH-PRED-TW2): RWT i KR nie modelują menarche → poza konsensusem.
    if (ctx && ctx.postmenarcheal === true && (key === 'rwt' || key === 'khamis')) {
      return { factor: 0, excluded: true, note: 'poza konsensusem, bo metoda nie zna statusu menarche (dziewczynka po menarche)' };
    }
    // Profil przedwczesnego / wczesnego pokwitania (GROWTH-PRED-PUB2): RWT i KR poza konsensusem.
    if (ctx && ctx.pubertyRules && ctx.pubertyRules.active && (key === 'rwt' || key === 'khamis')) {
      var pl = ctx.pubertyRules.label || 'przedwczesnego pokwitania';
      return { factor: 0, excluded: true, note: key === 'rwt'
        ? 'poza konsensusem w profilu ' + pl + ': regresja z dzieci o prawidłowym czasie pokwitania, w przedwczesnym pokwitaniu rażąco zawyża (Zachmann 1978)' + (ctx.pubertyRules.profil === 'wczesne' ? '; w profilu wczesnym jak w przedwczesnym — decyzja właściciela' : '')
        : 'poza konsensusem w profilu ' + pl + ': metoda nie zna wieku kostnego ani stadium pokwitania (regresja z dzieci o prawidłowym czasie pokwitania)' };
    }
    if (delta === null || delta === undefined) return { factor: 1, excluded: false, note: '' };
    var abs = Math.abs(delta);
    var sign = delta > 0 ? '+' : '−';
    var dtxt = sign + abs + ' mies.';
    if (key === 'khamis') {
      if (abs >= DELTA_GATE_MONTHS) return { factor: 0, excluded: true, note: 'poza konsensusem, bo metoda nie zna wieku kostnego (rozbieżność ' + dtxt + ')' };
      if (abs >= DELTA_KR_HALF_MONTHS) return { factor: 0.5, excluded: false, note: 'waga ×0,5, bo metoda nie ma korekty na wiek kostny (rozbieżność ' + dtxt + ')' };
      return { factor: 1, excluded: false, note: '' };
    }
    if (key === 'rwt' && delta >= DELTA_GATE_MONTHS) {
      return { factor: 0.5, excluded: false, note: 'waga ×0,5, bo wiek kostny ma w tej metodzie małą wagę, a jest przyspieszony o ' + dtxt };
    }
    return { factor: 1, excluded: false, note: '' };
  }

  var CSS = [
    '.vgcc{--vgcc-brand:#00838d;--vgcc-ink:#14393d;--vgcc-muted:#5a7274;--vgcc-line:#e3ecec}',
    '.vgcc-hero{background:linear-gradient(180deg,#fff,#f4fafa);border:1px solid #00838d33;border-radius:12px;padding:.8rem;text-align:center;margin:.15rem 0 .55rem}',
    '.vgcc-hero-cap{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--vgcc-muted)}',
    '.vgcc-hero-big{font-size:2rem;font-weight:800;color:var(--vgcc-ink);line-height:1.05}',
    '.vgcc-hero-sub{color:var(--vgcc-muted);font-size:.85rem;margin-top:.12rem}',
    '.vgcc-hero-sub b{color:var(--vgcc-ink)}',
    '.vgcc-hero.is-low{background:linear-gradient(180deg,#fff,#fff9f0);border-color:#e0a12a66}',
    '.vgcc-hero.is-low .vgcc-hero-cap{color:#9a6b12}',
    '.vgcc-warn{color:#9a6b12;font-weight:700}',
    '.vgcc-methods{background:#fff;border:1px solid var(--vgcc-line);border-radius:9px;padding:.1rem .6rem;margin-bottom:.5rem}',
    '.vgcc-row{display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.42rem .1rem;border-top:1px solid var(--vgcc-line);font-size:.9rem}',
    '.vgcc-row:first-child{border-top:0}',
    '.vgcc-nm{font-weight:700;color:#233}',
    '.vgcc-val{font-weight:800;color:var(--vgcc-ink);font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.vgcc-pm{color:var(--vgcc-muted);font-size:.78rem;white-space:nowrap}',
    '.vgcc-mph{display:block;text-align:center;background:#fbf6ec;border:1px solid #e7d8bb;border-radius:9px;padding:.4rem .6rem;margin:.1rem 0 .5rem;font-size:.9rem;color:#6d4a11}',
    '.vgcc-mph-cent{color:#8a6a2a}',
    '.vgcc-mph b{color:#8a4b00}',
    '.vgcc-target{display:block;text-align:center;background:#f4f8fb;border:1px solid #cfdde8;border-radius:9px;padding:.4rem .6rem;margin:.1rem 0 .5rem;font-size:.88rem;color:#2b4a63}',
    '.vgcc-target b{color:#1d3a52}',
    '.vgcc-stats{display:flex;gap:.5rem;margin:.15rem 0 .5rem}',
    '.vgcc-stat{flex:1;background:#fff;border:1px solid var(--vgcc-line);border-radius:9px;padding:.45rem .5rem;text-align:center}',
    '.vgcc-stat .k{font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:var(--vgcc-muted)}',
    '.vgcc-stat .vu{margin-top:.12rem}',
    '.vgcc-stat .v{font-weight:800;color:var(--vgcc-ink);font-variant-numeric:tabular-nums;font-size:1.18rem}',
    '.vgcc-stat .u{font-size:.84rem;color:var(--vgcc-muted);margin-left:.3rem}',
    '.vgcc-row.is-pref{border-left:3px solid var(--vgcc-brand);padding-left:.5rem;background:#ecf7f7;border-radius:0 7px 7px 0}',
    '.vgcc-row.is-pref .vgcc-nm{color:#006b73}',
    '.vgcc-row.is-excl{opacity:.72}',
    '.vgcc-row.is-excl .vgcc-val{text-decoration:line-through;text-decoration-color:#b8c6c8;font-weight:600}',
    '.vgcc-row.is-info{background:#f7f9fb;border-top:1px dashed var(--vgcc-line)}',
    '.vgcc-row.is-info .vgcc-nm{color:#4a6270;font-weight:600}',
    '.vgcc-row.is-info .vgcc-val{color:#4a6270;font-weight:700}',
    '.vgcc-tag{display:inline-block;font-size:.66rem;font-weight:600;color:#5a7274;background:#eef3f5;border-radius:6px;padding:.05rem .35rem;margin-left:.3rem;vertical-align:middle;text-transform:uppercase;letter-spacing:.03em}',
    '.vgcc-hint{font-size:.78rem;color:var(--vgcc-muted);margin:.3rem 0 .4rem}',
    '.vgcc-det{background:#fff;border:1px solid var(--vgcc-line);border-radius:9px;margin-top:.1rem}',
    '.vgcc-det>summary{cursor:pointer;list-style:none;padding:.5rem .7rem;font-weight:700;color:#006b73;display:flex;justify-content:center;align-items:center;font-size:.84rem}',
    '.vgcc-det>summary::-webkit-details-marker{display:none}',
    '.vgcc-det>summary::after{content:"\\25BE";color:var(--vgcc-muted);margin-left:.5rem}',
    '.vgcc-det[open]>summary::after{content:"\\25B4"}',
    '.vgcc-det-body{padding:.15rem .7rem .6rem;font-size:.8rem;color:#445}',
    '.vgcc-det-body p{margin:.35rem 0}',
    '.vgcc-lbl{color:var(--vgcc-muted)}',
    '.vgcc-empty{padding:.7rem;text-align:center;color:var(--vgcc-muted);font-size:.9rem}'
  ].join('');

  function ensureStyle() {
    try {
      if (typeof document === 'undefined' || !document.getElementById) return;
      if (document.getElementById(STYLE_ID)) return;
      var st = document.createElement('style');
      st.id = STYLE_ID; st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
    } catch (_) { /* noop */ }
  }

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : Number(v);
    return isFinite(n) ? n : null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function fmt1(v) { var n = num(v); return n === null ? '' : n.toFixed(1).replace('.', ','); }
  function fmt0(v) { var n = num(v); return n === null ? '' : String(Math.round(n)); }

  function levelLabel(k) {
    switch (String(k || '')) {
      case 'high': return 'wysoka';
      case 'moderate': return 'umiarkowana';
      case 'lowered': return 'obniżona';
      case 'low': return 'niska';
      default: return 'orientacyjna';
    }
  }
  function sexKey(sex) {
    var s = String(sex || '').trim().toUpperCase();
    return (s === 'F' || s === 'K') ? 'F' : 'M';
  }
  function levelFor(reliabilityModel, methodKey) {
    if (!reliabilityModel) return null;
    var map = reliabilityModel.entryMap || null;
    if (map && map[methodKey] && map[methodKey].levelKey) return map[methodKey].levelKey;
    var entries = reliabilityModel.entries;
    if (Array.isArray(entries)) {
      for (var i = 0; i < entries.length; i++) if (entries[i] && entries[i].methodKey === methodKey) return entries[i].levelKey;
    }
    return null;
  }
  function predValue(result) {
    if (!result || typeof result !== 'object' || result.available !== true) return null;
    return num(result.predictedAdultHeightCm);
  }

  function consensus(values) {
    var v = (values || []).map(num).filter(function (x) { return x !== null; }).sort(function (a, b) { return a - b; });
    if (!v.length) return { count: 0, median: null, min: null, max: null, spread: null, agreementLabel: null };
    var n = v.length;
    var median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
    var min = v[0], max = v[n - 1], spread = max - min;
    var agreementLabel = spread <= AGREE_GOOD_CM ? 'dobra' : (spread <= AGREE_MODERATE_CM ? 'umiarkowana' : 'niska');
    return { count: n, median: median, min: min, max: max, spread: spread, agreementLabel: agreementLabel };
  }

  // Waga pojedynczej metody: wiarygodność (poziom) / wariancja (z błędu 90%).
  function weightForEntry(e) {
    var f = CONSENSUS_W[e && e.levelKey];
    if (f === undefined || f === null) f = CONSENSUS_W.indicative;
    var pm = num(e && e.pm);
    var sigma = (pm !== null && pm > 0) ? pm / CI90_TO_SD : DEFAULT_SIGMA_CM;
    if (!(sigma > 0)) sigma = DEFAULT_SIGMA_CM;
    var g = (e && typeof e.gateFactor === 'number' && isFinite(e.gateFactor)) ? e.gateFactor : 1;
    if (e && e.excluded) g = 0;
    return g * f / (sigma * sigma);
  }
  // Ważony konsensus + metoda preferowana (największa waga). Nie zmienia zakresu min–max.
  // opts: { anchorCm (cel warunkowy; domyślnie mphCm), heightSds (≤ −2 → waga kotwicy ×0,5) }
  function weightedConsensus(entries, mphCm, opts) {
    opts = opts || {};
    var es = (entries || []).filter(function (e) { return e && num(e.value) !== null && !e.excluded; });
    if (!es.length) return { count: 0, weighted: null, recommendedKey: null, recommendedLabel: null, withMph: false, mphShare: 0, mphAnchorCm: null, mphWeightFactor: 1 };
    var sw = 0, swv = 0, best = null, bestW = -Infinity;
    for (var i = 0; i < es.length; i++) {
      var w = weightForEntry(es[i]);
      if (!(w > 0) || !isFinite(w)) w = 0;
      sw += w; swv += w * num(es[i].value);
      if (w > bestW) { bestW = w; best = es[i]; }
    }
    // MPH jako kotwica (GROWTH-PRED-DOBOR): tylko przy co najmniej DWÓCH metodach (przy jednej
  // nie ma czego uśredniać — pokazujemy metodę jak dotąd); nigdy „preferowana".
    var mph = num(mphCm), withMph = false, mphShare = 0;
    var anchor = num(opts.anchorCm); if (anchor === null || anchor <= 0) anchor = mph;
    var hsW = num(opts.heightSds);
    var mphWeightFactor = (hsW !== null && hsW <= BIAS_SHORT_SDS) ? MPH_SHORT_WEIGHT : 1;
    if (opts.postmenarcheal === true) mphWeightFactor *= MPH_POSTMENARCHE_WEIGHT;
    if (mph !== null && mph > 0 && sw > 0 && es.length >= 2) {
      var wm = mphWeightFactor * CONSENSUS_W.mph / (MPH_SIGMA_CM * MPH_SIGMA_CM);
      sw += wm; swv += wm * anchor; withMph = true; mphShare = wm / sw;
    }
    return {
      count: es.length,
      weighted: sw > 0 ? swv / sw : null,
      recommendedKey: best ? best.key : null,
      recommendedLabel: best ? best.label : null,
      withMph: withMph,
      mphShare: mphShare,
      mphAnchorCm: withMph ? anchor : null,
      mphWeightFactor: withMph ? mphWeightFactor : 1
    };
  }
  function activeEntries(entries) {
    return (entries || []).filter(function (e) { return e && !e.excluded; });
  }
  function anyGateFired(entries) {
    return (entries || []).some(function (e) { return e && (e.excluded || (typeof e.gateFactor === 'number' && e.gateFactor < 1)); });
  }

  // Budowa listy metod prognozy — wspólna dla renderu karty i czystego API
  // computeFinalHeightPrediction. Wynik KR można podać gotowy (input.khamis,
  // np. z ładunku adaptera) albo zostawić do policzenia silnikiem.
  function buildEntries(input) {
    input = input || {};
    var sk = sexKey(input.sex);
    var rm = input.reliabilityModel || null;
    var curH = num(input.currentHeightCm);
    if (curH !== null && curH <= 0) curH = null;
    var entries = [];
    var delta = deltaMonthsFor(input);
    var biasCtx = { sexKey: sk, deltaMonths: delta, heightSds: num(input.heightSds), boneAgeYears: num(input.boneAgeYears) };
    var pubRules = pubertyRulesFor(input.pubertyProfile);

    // Wzrost ostateczny nie może być niższy niż już zmierzony: prognozę punktową
    // ogranicza się od dołu aktualnym wzrostem (surowa wartość w rawValue, flaga
    // clamped). Górna granica przedziału błędu liczy się ZAWSZE od wartości
    // surowej (raw + pm) — clamp obcina przedział od dołu, nie przesuwa go w górę.
    function add(key, label, result, pm) {
      var val = predValue(result);
      if (val === null) return;
      var raw = num(result && result.predictedAdultHeightCmRaw);
      if (raw === null) raw = val;
      var clamped = result && result.clampedToCurrentHeight === true;
      // GROWTH-PRED-BIAS: korekta błędu systematycznego PRZED clampem; surowa wartość zostaje.
      var bias = biasFor(key, biasCtx);
      var uncorrected = raw; // to, co metoda wskazała — przed clampem silnika i przed korektą profilu
      if (bias) {
        val += bias.shiftCm; raw += bias.shiftCm;
        if (pm !== null && pm !== undefined) pm = pm * bias.sigmaFactor;
      }
      // GROWTH-PRED-PUB2: poszerzenie przedziału wg profilu pokwitaniowego (bez przesunięcia).
      var prule = profileRuleFor(key, pubRules);
      if (prule && (pm === null || pm === undefined)) prule = null; // GROWTH-PRED-PUB4: bez przedziału nie ma czego poszerzać — i nie ma o czym pisać
      if (prule) pm = pm * prule.sigmaFactor;
      if (curH !== null && val < curH) { val = curH; clamped = true; }
      entries.push({
        key: key, label: label, value: val, pm: pm, levelKey: null,
        rawValue: raw, clamped: clamped,
        uncorrectedCm: uncorrected,
        biasCm: bias ? bias.shiftCm : 0, biasSigmaFactor: bias ? bias.sigmaFactor : 1,
        biasNote: bias ? bias.note : '', biasSource: bias ? bias.source : '',
        profileSigmaFactor: prule ? prule.sigmaFactor : 1, profileNote: prule ? prule.note : '',
        loCm: pm !== null && pm !== undefined ? Math.max(val - pm, curH !== null ? curH : -Infinity) : null,
        hiCm: pm !== null && pm !== undefined ? Math.max(raw + pm, val) : null
      });
    }
    // 1. RWT  2. Bayley-Pinneau  3. Khamis-Roche  4. Reinehr/CDGP
    add('rwt', 'RWT', input.rwt, num(input.rwt && input.rwt.errorBoundHalfWidthCm));
    if (entries.length) entries[entries.length - 1].levelKey = levelFor(rm, 'rwt') || 'moderate';
    add('bp', 'Bayley–Pinneau', input.bp, num(input.bp && input.bp.errorBoundHalfWidthCm));
    (function () {
      var e = entries[entries.length - 1];
      if (e && e.key === 'bp') {
        e.levelKey = levelFor(rm, 'bayleyPinneau') || 'moderate';
        e.bpGroupOverride = !!(input.bp && input.bp.groupOverrideApplied === true);
        e.bpGroupAutoKey = input.bp && input.bp.groupAutoKey ? String(input.bp.groupAutoKey) : '';
        e.bpAutoGroupCm = num(input.bp && input.bp.autoGroupPredictedAdultHeightCm);
      }
    })();
    (function () {
      var r = input.khamis && typeof input.khamis === 'object' ? input.khamis : null;
      if (!r) {
        var engine = w.calculateKhamisRochePrediction;
        if (typeof engine !== 'function') return;
        try {
          r = engine({ sex: input.sex, chronologicalAgeYears: input.ageYears, chronologicalAgeMonths: input.ageMonths,
            currentHeightCm: input.currentHeightCm, currentWeightKg: input.currentWeightKg,
            motherHeightCm: input.motherHeightCm, fatherHeightCm: input.fatherHeightCm });
        } catch (_) { r = null; }
      }
      var val = predValue(r);
      if (val === null) return;
      var pm = KR_ERR_HALFWIDTH_CM[sk];
      var raw = num(r.predictedAdultHeightCmRaw);
      if (raw === null) raw = val;
      var clamped = r.clampedToCurrentHeight === true;
      if (curH !== null && val < curH) { val = curH; clamped = true; }
      entries.push({ key: 'khamis', label: 'Khamis–Roche', value: val, pm: pm, levelKey: 'indicative', noBoneAge: true,
        rawValue: raw, clamped: clamped, uncorrectedCm: raw, biasCm: 0, biasSigmaFactor: 1, biasNote: '', biasSource: '',
        loCm: Math.max(val - pm, curH !== null ? curH : -Infinity), hiCm: Math.max(raw + pm, val) });
    })();
    // Reinehr: własny przedział błędu, a gdy silnik go nie podaje — ±6,4 (GROWTH-PRED-REINEHR).
    (function () {
      var pmR = num(input.reinehr && input.reinehr.errorBoundHalfWidthCm);
      add('reinehr', 'Reinehr/CDGP', input.reinehr, pmR !== null && pmR > 0 ? pmR : REINEHR_ERR_HALFWIDTH_CM);
      var e = entries[entries.length - 1];
      if (e && e.key === 'reinehr') {
        e.reinehrExtrapolated = !!(input.reinehr && input.reinehr.usedExtrapolatedCoefficient === true);
        e.reinehrPooled = !!(input.reinehr && input.reinehr.usedPooledCoefficient === true);
      }
    })();
    (function () {
      var e = entries[entries.length - 1];
      if (e && e.key === 'reinehr') e.levelKey = levelFor(rm, 'reinehr') || 'indicative';
    })();
    // 5. Blum/ISS (2022) — tylko dzieci niskie (hSDS ≤ −1,28); gotowy wynik z adaptera (input.blum)
    // albo silnik window.calculateBlumIssPrediction, gdy karta dostała heightSds.
    (function () {
      var r = input.blum && typeof input.blum === 'object' ? input.blum : null;
      if (!r) {
        var engine = w.calculateBlumIssPrediction;
        if (typeof engine !== 'function' || num(input.heightSds) === null) return;
        try {
          r = engine({ sex: input.sex, chronologicalAgeYears: input.ageYears, chronologicalAgeMonths: input.ageMonths,
            currentHeightCm: input.currentHeightCm, heightSds: input.heightSds, boneAgeYears: input.boneAgeYears,
            motherHeightCm: input.motherHeightCm, fatherHeightCm: input.fatherHeightCm, birthWeightKg: input.birthWeightKg });
        } catch (_) { r = null; }
      }
      if (!r || r.available !== true) return;
      add('blum', 'Blum/ISS', r, num(r.errorBoundHalfWidthCm));
      var e = entries[entries.length - 1];
      if (e && e.key === 'blum') {
        e.levelKey = r.usedBoneAge === true ? 'moderate' : 'indicative';
        e.blumModelId = r.modelId || null;
      }
    })();
    // 6. TW Mark II (Tanner 1983) — dziewczęta (3.1a/b/c) i chłopcy (2.1); gotowy wynik z adaptera
    //    (input.tw2) albo silnik.
    var postmenarcheal = sk === 'F' && input.postmenarcheal === true;
    (function () {
      var r = input.tw2 && typeof input.tw2 === 'object' ? input.tw2 : null;
      if (!r) {
        var engine = w.calculateTW2Prediction;
        if (typeof engine !== 'function') return;
        try {
          r = engine({ sex: input.sex, chronologicalAgeYears: input.ageYears, chronologicalAgeMonths: input.ageMonths,
            currentHeightCm: input.currentHeightCm, boneAgeYears: input.boneAgeYears, boneAgeSource: input.boneAgeSource || 'GP',
            postmenarcheal: input.postmenarcheal, menarcheAgeYears: input.menarcheAgeYears });
        } catch (_) { r = null; }
      }
      if (!r || r.available !== true) return;
      add('tw2', 'TW Mark II', r, num(r.errorBoundHalfWidthCm));
      var e = entries[entries.length - 1];
      if (e && e.key === 'tw2') {
        var sd = num(r.residualSdCm);
        e.levelKey = r.extrapolatedBelowTable === true ? 'indicative'
          : (sd !== null && sd <= TW2_LEVEL_SD_HIGH ? 'high' : (sd !== null && sd <= TW2_LEVEL_SD_MODERATE ? 'moderate' : 'lowered'));
        // GROWTH-PRED-PUB2: w profilu przedwczesnego / wczesnego pokwitania TW2 orientacyjna.
        if (pubRules.active) { e.tw2LevelBeforeProfile = e.levelKey; e.levelKey = 'indicative'; e.tw2ProfileNote = 'Poziom orientacyjny w profilu ' + pubRules.label + ' — tablice Tannera pochodzą z dzieci o prawidłowym czasie dojrzewania'; }
        e.tw2Table = r.table || '';
        e.tw2RowAge = r.rowAge;
        e.tw2Extrapolated = r.extrapolatedBelowTable === true;
        e.tw2Variants = r.variants || null;
        e.tw2Notes = Array.isArray(r.notes) ? r.notes.slice() : [];
        e.tw2BoneAgeSource = r.boneAgeSource || '';
        e.tw2IncrementCmPerYear = num(r.heightIncrementCmPerYear);
        e.tw2IncrementIntervalYears = num(r.heightIncrementIntervalYears);
        e.tw2BoneAgeIncrementYearsPerYear = num(r.boneAgeIncrementYearsPerYear);
        e.tw2WithoutIncrementCm = num(r.withoutIncrementCm);
      }
    })();
    // 7. Wzrost przy menarche / 0,955 (Singleton 1975; korekta Cho 2026) — tylko po menarche.
    (function () {
      if (!postmenarcheal) return;
      var r = input.menarche && typeof input.menarche === 'object' ? input.menarche : null;
      if (!r) {
        var engine = w.calculateMenarcheFractionPrediction;
        if (typeof engine !== 'function' || num(input.heightAtMenarcheCm) === null) return;
        try {
          r = engine({ heightAtMenarcheCm: input.heightAtMenarcheCm, boneAgeAtMenarcheYears: input.boneAgeAtMenarcheYears,
            menarcheAgeYears: input.menarcheAgeYears, currentHeightCm: input.currentHeightCm });
        } catch (_) { r = null; }
      }
      if (!r || r.available !== true) return;
      add('menarche', 'Wzrost przy menarche / 0,955', r, num(r.errorBoundHalfWidthCm));
      var e = entries[entries.length - 1];
      if (e && e.key === 'menarche') {
        e.levelKey = 'lowered';
        e.menarcheBaseCm = num(r.baseCm);
        e.menarcheAdjCm = num(r.boneAgeAdjustmentCm) || 0;
        e.menarcheNotes = Array.isArray(r.notes) ? r.notes.slice() : [];
      }
    })();
    // Bramki stosowalności wg Δ (GROWTH-PRED-DOBOR) i profilu po menarche (GROWTH-PRED-TW2).
    var gateCtx = { postmenarcheal: postmenarcheal, pubertyRules: pubRules };
    for (var gi = 0; gi < entries.length; gi++) {
      var g = gateFor(entries[gi].key, delta, gateCtx);
      entries[gi].gateFactor = g.factor;
      entries[gi].excluded = g.excluded;
      entries[gi].gateNote = g.note;
    }
    entries.deltaMonths = delta;
    entries.postmenarcheal = postmenarcheal;
    entries.pubertyRules = pubRules;
    // GROWTH-PRED-PUB3: wiersze informacyjne poza konsensusem — tylko w profilach pokwitaniowych.
    entries.infoRows = showTarget(pubRules, postmenarcheal) ? infoRowsFor(input, sk, curH) : [];
    return entries;
  }

  // Czysta prognoza wzrostu ostatecznego dla innych modułów (bez DOM): ważony
  // konsensus dostępnych metod (te same wagi co karta); przy jednej metodzie —
  // jej wynik. MPH celowo poza prognozą (cel genetyczny — fallback po stronie
  // konsumenta). Widełki ±: przedział błędu metody preferowanej (największa
  // waga) — decyzja właściciela 2026-08-11.
  function mphOpts(input) {
    input = input || {};
    var anchor = num(input.mphAnchorCm);
    if (anchor === null) anchor = mphAnchorFrom(input.mphCm, input.adultMedianHeightCm);
    return { anchorCm: anchor, heightSds: num(input.heightSds), postmenarcheal: sexKey(input.sex) === 'F' && input.postmenarcheal === true };
  }
  // Zdanie „konsensus wobec celu" pokazujemy w profilach pokwitaniowych: przedwczesne / wczesne /
  // leczone GnRHa, a po menarche — gdy start był przedwczesny lub wczesny.
  function showTarget(rules, postmenarcheal) {
    if (!rules) return false;
    if (rules.active) return true;
    return postmenarcheal === true && (rules.kategoriaStartu === 'przedwczesne' || rules.kategoriaStartu === 'wczesne');
  }
  function computeFinalHeightPrediction(input) {
    var entries = buildEntries(input || {});
    var active = activeEntries(entries);
    if (!active.length) return null;
    var skFhp = sexKey(input && input.sex);
    var wcon = weightedConsensus(entries, num(input && input.mphCm), mphOpts(input));
    var weightedCm = num(wcon.weighted);
    if (weightedCm === null) return null;
    var preferred = null;
    for (var i = 0; i < active.length; i++) {
      if (active[i].key === wcon.recommendedKey) preferred = active[i];
    }
    var pm = preferred ? num(preferred.pm) : null;
    var halfWidthSource = 'preferred';
    var halfWidthCm = pm !== null && pm > 0 ? pm : null;
    if (halfWidthCm === null) {
      // metoda preferowana bez przedziału: najszerszy znany ± wśród metod aktywnych, a bez żadnego — 5,7
      var known = active.map(function (e) { return num(e.pm); }).filter(function (x) { return x !== null && x > 0; });
      halfWidthCm = known.length ? Math.max.apply(null, known) : DEFAULT_ERR_HALFWIDTH_CM;
      halfWidthSource = known.length ? 'widest-known' : 'default';
    }
    var con = consensus(active.map(function (e) { return e.value; }));
    var gateFired = anyGateFired(entries);
    // GROWTH-PRED-UI2 (2026-09-11): nagłówek i `cm` to ZAWSZE konsensus ważony — metoda
    // preferowana jest wyróżniona w liście i nazwana w podtytule, nie zastępuje nagłówka.
    var cm = weightedCm;
    var excluded = entries.filter(function (e) { return e.excluded; }).map(function (e) { return e.key; });
    var multi = active.length >= 2;
    return {
      cm: cm,
      halfWidthCm: halfWidthCm,
      halfWidthSource: halfWidthSource,
      methodCount: active.length,
      source: multi ? 'consensus' : active[0].key,
      sourceLabel: multi ? 'konsensus ' + active.length + (active.length === 1 ? ' metody' : ' metod') + (wcon.withMph ? ' i MPH' : '') : active[0].label,
      headlineSource: 'weighted',
      weightedCm: weightedCm,
      mphInConsensus: wcon.withMph === true,
      mphShare: wcon.mphShare || 0,
      mphAnchorCm: wcon.mphAnchorCm !== undefined ? wcon.mphAnchorCm : null,
      mphWeightFactor: wcon.mphWeightFactor !== undefined ? wcon.mphWeightFactor : 1,
      biasApplied: entries.filter(function (e) { return e.biasCm; }).map(function (e) { return e.key; }),
      // GROWTH-PRED-BP-DZIEWCZETA: tekst ostrzezenia dla konsumentow modelu (karta rysuje go sama).
      bpDelayCaution: bpDelayCautionFor(skFhp, entries.deltaMonths !== undefined ? entries.deltaMonths : null, entries.some(function (e) { return e.key === 'bp'; })),
      deltaMonths: entries.deltaMonths !== undefined ? entries.deltaMonths : null,
      gateFired: gateFired,
      excludedMethods: excluded,
      postmenarcheal: entries.postmenarcheal === true,
      // GROWTH-PRED-PUB1: profil pokwitaniowy dla konsumentów (opis pacjenta, zalecenia).
      pubertyProfile: input.pubertyProfile && typeof input.pubertyProfile === 'object'
        ? { profil: input.pubertyProfile.profil || null, tempo: input.pubertyProfile.tempo || null, etykieta: input.pubertyProfile.etykieta || '', gnrhaStatus: input.pubertyProfile.gnrha ? (input.pubertyProfile.gnrha.status || '') : '' }
        : null,
      // GROWTH-PRED-PUB2: czy działały reguły profilu pokwitaniowego i jak konsensus ma się do celu.
      pubertyRulesActive: entries.pubertyRules ? entries.pubertyRules.active === true : false,
      // GROWTH-PRED-PUB3: wiersze informacyjne (poza konsensusem, bez wagi; nie ma ich w `methods`).
      infoRows: (entries.infoRows || []).map(function (r) { return { key: r.key, label: r.label, cm: r.cm, rawCm: r.rawCm, clamped: r.clamped === true, note: r.note }; }),
      targetAssessment: showTarget(entries.pubertyRules, entries.postmenarcheal === true) ? targetAssessmentFor(weightedCm, num(input.mphCm), input.adultHeightLMS) : null,
      preferredKey: wcon.recommendedKey || null,
      preferredLabel: wcon.recommendedLabel || null,
      minCm: con.min,
      maxCm: con.max,
      agreementLabel: con.agreementLabel,
      // errorHalfWidthCm: polszerokosc 90% bledu metody (pm) — ta sama, ktora karta
      // pokazuje jako „±"; konsumenci (opis pacjenta) czytaja ja stad, zeby stala
      // Khamis-Roche nie miala drugiej kopii poza ta karta.
      methods: entries.map(function (e) { return { key: e.key, label: e.label, cm: e.value, rawCm: e.rawValue, clamped: e.clamped === true, errorHalfWidthCm: (e.pm !== null && e.pm !== undefined) ? e.pm : null, excluded: e.excluded === true, gateFactor: typeof e.gateFactor === 'number' ? e.gateFactor : 1, gateNote: e.gateNote || '', uncorrectedCm: e.uncorrectedCm !== undefined ? e.uncorrectedCm : e.value, biasCm: e.biasCm || 0, biasNote: e.biasNote || '', levelKey: e.levelKey || null, tw2Table: e.tw2Table || '', tw2Extrapolated: e.tw2Extrapolated === true, profileSigmaFactor: e.profileSigmaFactor || 1, bpGroupOverride: e.bpGroupOverride === true }; })
    };
  }

  function buildModel(input) {
    input = input || {};
    var sk = sexKey(input.sex);
    var rm = input.reliabilityModel || null;
    var entries = buildEntries(input);
    var active = activeEntries(entries);
    var con = consensus(active.map(function (e) { return e.value; }));
    var mphCm = num(input.mphCm);
    var wcon = weightedConsensus(entries, mphCm, mphOpts(input));
    var boneAgeMissing = num(input.boneAgeYears) === null;
    var gateFired = anyGateFired(entries);

    return {
      sexKey: sk,
      entries: entries,
      active: active,
      consensus: con,
      weighted: wcon,
      deltaMonths: entries.deltaMonths !== undefined ? entries.deltaMonths : null,
      gateFired: gateFired,
      headline: { source: 'weighted', entry: null },
      mph: mphCm !== null ? { cm: mphCm, centileText: input.mphCentileText != null ? String(input.mphCentileText) : '' } : null,
      tempo: num(input.growthVelocityCmPerYear) !== null ? { cm: num(input.growthVelocityCmPerYear), context: input.growthVelocityContext != null ? String(input.growthVelocityContext) : '' } : null,
      hasKhamis: entries.some(function (e) { return e.key === 'khamis'; }),
      hasBlum: entries.some(function (e) { return e.key === 'blum'; }),
      hasBp: entries.some(function (e) { return e.key === 'bp'; }),
      // GROWTH-PRED-BP-DZIEWCZETA: widoczne ostrzezenie przy opoznieniu wieku kostnego >= 2 lata (obie plcie).
      bpDelayCaution: bpDelayCautionFor(sk, entries.deltaMonths !== undefined ? entries.deltaMonths : null, entries.some(function (e) { return e.key === 'bp'; })),
      hasReinehr: entries.some(function (e) { return e.key === 'reinehr'; }),
      hasTw2: entries.some(function (e) { return e.key === 'tw2'; }),
      hasMenarche: entries.some(function (e) { return e.key === 'menarche'; }),
      postmenarcheal: entries.postmenarcheal === true,
      menarcheAgeYears: num(input.menarcheAgeYears),
      reinehrExtrapolated: entries.some(function (e) { return e.key === 'reinehr' && e.reinehrExtrapolated; }),
      reinehrPooled: entries.some(function (e) { return e.key === 'reinehr' && e.reinehrPooled; }),
      boneAgeMissing: boneAgeMissing,
      showBoneAgeHint: boneAgeMissing && entries.some(function (e) { return e.key === 'khamis'; }) && !entries.some(function (e) { return e.key === 'bp'; }),
      profileStatus: rm && rm.profileStatusLabel ? String(rm.profileStatusLabel) : '',
      profileSummary: rm && rm.profileSummaryText ? String(rm.profileSummaryText) : '',
      // GROWTH-PRED-PUB1: profil pokwitaniowy z vilda_puberty_profile.js (adapter → input.pubertyProfile).
      pubertyProfile: input.pubertyProfile && typeof input.pubertyProfile === 'object' ? input.pubertyProfile : null,
      // GROWTH-PRED-PUB2: reguły profilu i konsensus wobec celu rodzicielskiego.
      pubertyRules: entries.pubertyRules || pubertyRulesFor(null),
      infoRows: entries.infoRows || [],
      targetAssessment: (con.count >= 1 && wcon.weighted !== null && showTarget(entries.pubertyRules, entries.postmenarcheal === true))
        ? targetAssessmentFor(wcon.weighted, mphCm, input.adultHeightLMS) : null
    };
  }

  // Etykieta „Profil predykcyjny": profil pokwitaniowy ma pierwszeństwo przed profilem
  // wiarygodności (KOWD/standardowy), gdy jest inny niż standardowy.
  function profileLabelText(model) {
    var pp = model.pubertyProfile;
    if (pp && pp.profil && pp.profil !== 'standardowy' && pp.etykieta) return String(pp.etykieta);
    if (model.profileStatus) return String(model.profileStatus) + (pp && pp.gnrha && pp.gnrha.wTrakcie ? ', GnRHa w trakcie' : (pp && pp.gnrha && pp.gnrha.poLeczeniu ? ', po GnRHa' : ''));
    return pp && pp.etykieta ? String(pp.etykieta) : '';
  }
  function pubertyProfileParagraph(model) {
    var pp = model.pubertyProfile;
    if (!pp || typeof pp !== 'object') return '';
    var parts = [];
    var show = (pp.profil && pp.profil !== 'standardowy') || (pp.dowody && pp.dowody.length) || (pp.braki && pp.braki.length);
    if (!show) return '';
    var s = '<p><span class="vgcc-lbl">Profil pokwitaniowy:</span> ' + esc(pp.etykieta || 'nieokreślony');
    if (pp.dowody && pp.dowody.length) s += ' — ' + pp.dowody.map(function (d) { return esc(d); }).join('; ');
    if (pp.braki && pp.braki.length) s += '. Brakuje: ' + pp.braki.map(function (d) { return esc(d); }).join('; ');
    s += '.';
    if (pp.gnrha && pp.gnrha.wTrakcie) s += ' W trakcie leczenia GnRHa prognoza rezydualnego wzrostu jest nierzetelna — nasady zamykają się wcześniej niż wynika z wieku kostnego, zwłaszcza po rozpoznaniu po 6. r.ż. (Lazar 2007).';
    else if (pp.gnrha && pp.gnrha.poLeczeniu) s += ' Po zakończeniu GnRHa przyrost do wzrostu ostatecznego bywa mniejszy niż przewidziany w chwili odstawienia (Lazar 2007).';
    parts.push(s + '</p>');
    parts.push(pubertyRulesParagraph(model));
    return parts.join('');
  }
  // GROWTH-PRED-PUB2: co reguły profilu zrobiły z konsensusem i czego uczy tempo.
  function pubertyRulesParagraph(model) {
    var r = model.pubertyRules;
    if (!r || !r.active) return '';
    var s = '<p><span class="vgcc-lbl">Reguły konsensusu w profilu ' + esc(r.label) + ':</span> RWT i Khamis–Roche poza konsensusem (Zachmann 1978' + (r.profil === 'wczesne' ? '; w profilu wczesnym jak w przedwczesnym — decyzja właściciela' : '') + ')';
    var bp = (model.entries || []).filter(function (e) { return e.key === 'bp'; })[0];
    if (bp) {
      var grp = bp.bpGroupAutoKey === 'accelerated' ? 'przyspieszona' : (bp.bpGroupAutoKey === 'retarded' ? 'opóźniona' : 'średnia');
      s += '; Bayley–Pinneau ' + (bp.bpGroupOverride
        ? 'z tablicy „przeciętnej" zamiast „przyspieszonej" (Kauli 1997; Tanaka 2005; Brito 2008; Mul 2005)' + (bp.bpAutoGroupCm !== null && bp.bpAutoGroupCm !== undefined ? ' — tablica przyspieszona dałaby ' + esc(fmt1(bp.bpAutoGroupCm)) + ' cm' + (bp.biasCm ? ' (przed korektą błędu systematycznego)' : '') : '')
        : (bp.bpGroupAutoKey === 'accelerated' ? 'z tablicy przyspieszonej (zamiana na przeciętną nie zaszła)' : 'z tablicy wg rozbieżności wieku kostnego (grupa ' + grp + ', więc bez zamiany)'))
        + (bp.profileNote ? ', ' + esc(bp.profileNote) : ' (bez przedziału błędu dla tego wieku, więc bez poszerzenia)');
    }
    if (model.hasTw2) s += '; TW Mark II orientacyjna (tablice z dzieci o prawidłowym czasie dojrzewania)';
    // GROWTH-PRED-PUB4: zdanie o MPH mówi to, co naprawdę policzono.
    var wcm = model.weighted || {};
    if (wcm.withMph) s += '; MPH jako kotwica ' + (wcm.mphWeightFactor === 1 ? 'z pełną wagą' + (model.postmenarcheal ? '' : ' (×0,25 dopiero po menarche)') : 'z wagą ×' + esc(fmt1(wcm.mphWeightFactor)) + (wcm.mphWeightFactor < 1 && !model.postmenarcheal ? ' (niskorosłość, Blum 2022)' : '')) + '.';
    else s += '; MPH poza konsensusem (' + (model.mph ? 'kotwica wchodzi dopiero przy dwóch metodach' : 'brak wzrostu rodziców') + ').';
    if (r.tempo === 'wolne') s += ' Tempo wolne: metody z wieku kostnego zaniżają o ok. 3–4 cm, a wzrost ostateczny nieleczonych zwykle mieści się w zakresie celu (Jang 2023; Palmert 1999; Léger 2000).';
    else if (r.tempo === 'szybkie') s += ' Tempo szybkie: bez leczenia wzrost ostateczny bywa 5–8 cm poniżej celu (Kauli 1997), a prognozy z wieku kostnego zawyżają (Kauli 1997; Lazar 2001).';
    else if (r.tempo === 'nieznane') s += ' Tempo nieznane — bez wieku kostnego z dwóch wizyt nie da się odróżnić przebiegu wolnego (wzrost ostateczny ≈ cel) od szybkiego (5–8 cm poniżej celu).';
    if (model.sexKey === 'M') {
      var stad = model.pubertyProfile && model.pubertyProfile.wskazniki ? num(model.pubertyProfile.wskazniki.tannerStadium) : null;
      if (stad !== null && stad >= 3) s += ' U chłopców Bayley–Pinneau w stadium Tanner 3 zawyża (Lazar 2001).';
      s += ' Po GnRHa wzrost ostateczny chłopców był bliski celu (Cho 2026).';
    }
    if (r.gnrhaWTrakcie) s += ' W trakcie GnRHa liczby Bayley–Pinneau i TW Mark II traktuj ostrożnie — nasady zamykają się wcześniej, niż wynika z wieku kostnego (Lazar 2007).';
    return s + '</p>';
  }
  function infoRowsParagraph(model) {
    var rows = model.infoRows || [];
    if (!rows.length) return '';
    var items = rows.map(function (r) {
      return esc(r.label) + ' ' + esc(fmt1(r.cm)) + ' cm' + (r.clamped ? ' (obcięte do obecnego wzrostu; równanie dało ' + esc(fmt1(r.rawCm)) + ' cm)' : '') + ': ' + esc(r.note);
    });
    return '<p><span class="vgcc-lbl">Wiersze informacyjne (poza konsensusem, bez wagi):</span> ' + items.join('. ') + '.</p>';
  }
  function targetHtml(model) {
    var t = model.targetAssessment;
    if (!t) return '';
    var parts = [];
    if (t.diffCm !== null) {
      var sign = t.diffCm < -0.05 ? '−' : (t.diffCm > 0.05 ? '+' : '');
      parts.push('<b>' + sign + esc(fmt1(Math.abs(t.diffCm))) + ' cm</b> (' + sign + esc(fmt1(Math.abs(t.targetSd))) + ' SD celu; cel ±10 cm)');
    }
    if (t.adultSds !== null) {
      var sg = t.adultSds < -0.005 ? '−' : (t.adultSds > 0.005 ? '+' : '');
      parts.push('wobec norm dorosłych ' + sg + esc(fmt1(Math.abs(t.adultSds))) + ' SDS');
    }
    var lbl = t.diffCm === null ? 'Prognoza wobec norm dorosłych (bez wzrostu rodziców): '
      : (model.consensus && model.consensus.count >= 2 ? 'Konsensus wobec celu rodzicielskiego: ' : 'Prognoza wobec celu rodzicielskiego: ');
    return '<div class="vgcc-target">' + lbl + parts.join('; ') + ' — <b>' + esc(t.tierLabel) + '</b></div>';
  }

  function heroHtml(model) {
    var c = model.consensus;
    var wc = model.weighted || {};
    // GROWTH-PRED-UI2: podpis stały („Konsensus metod (ważony)"), podtytuł = zgodność
    // (+ metoda preferowana przy niskiej zgodności); widełki min–max tylko w Szczegółach.
    var capKons = 'Konsensus metod (ważony)';
    if (c.count >= 2) {
      var headline = (wc.weighted !== null && wc.weighted !== undefined) ? wc.weighted : c.median;
      var low = c.agreementLabel === 'niska';
      var rec = (low && wc.recommendedLabel) ? ' · <span class="vgcc-warn">preferowana: ' + esc(wc.recommendedLabel) + '</span>' : '';
      return '<div class="vgcc-hero' + (low ? ' is-low' : '') + '"><div class="vgcc-hero-cap">' + esc(capKons) + '</div>' +
        '<div class="vgcc-hero-big">≈ ' + esc(fmt0(headline)) + ' cm</div>' +
        '<div class="vgcc-hero-sub">zgodność ' + esc(c.agreementLabel) + rec + '</div></div>';
    }
    if (c.count === 1) {
      var e = model.active[0];
      var pmTxt = e.clamped
        ? '<b>' + (e.hiCm !== null && e.hiCm !== undefined && e.hiCm > e.value + 0.049
            ? esc(fmt1(e.value)) + '–' + esc(fmt1(e.hiCm)) : esc(fmt1(e.value))) + ' cm</b>'
        : (e.pm !== null && e.pm !== undefined ? '±' + esc(fmt1(e.pm)) + ' cm' : '');
      var sub = pmTxt +
        (model.boneAgeMissing ? (pmTxt ? ' · ' : '') + '<b>bez wieku kostnego</b>' : '');
      return '<div class="vgcc-hero"><div class="vgcc-hero-cap">' + esc(e.label) + '</div>' +
        '<div class="vgcc-hero-big">≈ ' + esc(fmt0(e.value)) + ' cm</div>' +
        '<div class="vgcc-hero-sub">' + sub + '</div></div>';
    }
    if (model.entries.length && !model.active.length) {
      var exl = model.entries.map(function (e) { return esc(e.label); }).join(', ');
      var dm = num(model.deltaMonths);
      var dtxt = dm !== null ? ' — rozbieżność wieku kostnego i metrykalnego ' + esc((dm > 0 ? '+' : (dm < 0 ? '−' : '')) + Math.abs(dm)) + ' mies.' : '';
      return '<div class="vgcc-hero is-low"><div class="vgcc-hero-cap">Prognoza bez konsensusu</div>' +
        '<div class="vgcc-hero-sub">Dostępne metody (' + exl + ') są poza konsensusem' + dtxt + '. Prognoza z wieku kostnego wymaga metody Bayley–Pinneau lub RWT (wiek kostny, masa, wzrost rodziców).</div></div>';
    }
    return '<div class="vgcc-hero"><div class="vgcc-empty">Uzupełnij dane (wzrost, masę, wzrost rodziców, wiek kostny), aby policzyć prognozę.</div></div>';
  }

  function infoRowsHtml(model) {
    var rows = model.infoRows || [];
    if (!rows.length) return '';
    return rows.map(function (r) {
      return '<div class="vgcc-row is-info"><span class="vgcc-nm">' + esc(r.label) + ' <span class="vgcc-tag">poza konsensusem</span></span><span><span class="vgcc-val">' + esc(fmt1(r.cm)) + ' cm</span></span></div>';
    }).join('');
  }
  function methodsHtml(model) {
    var hasExcluded = model.entries.some(function (e) { return e.excluded; });
    var hasInfo = (model.infoRows || []).length > 0;
    if (model.consensus.count < 2 && !hasExcluded && !hasInfo) return ''; // dla 1 metody hero wystarcza
    var prefKey = model.weighted && model.weighted.recommendedKey;
    var rows = model.entries.map(function (e) {
      var right = e.clamped
        ? '<span class="vgcc-val">' + (e.hiCm !== null && e.hiCm !== undefined && e.hiCm > e.value + 0.049
            ? esc(fmt1(e.value)) + '–' + esc(fmt1(e.hiCm)) : esc(fmt1(e.value))) + ' cm</span>'
        : '<span class="vgcc-val">' + esc(fmt1(e.value)) + ' cm</span>' +
          (e.pm !== null && e.pm !== undefined ? ' <span class="vgcc-pm">±' + esc(fmt1(e.pm)) + '</span>' : '');
      var cls = (prefKey && e.key === prefKey) ? ' is-pref' : (e.excluded ? ' is-excl' : '');
      // powody bramek (waga ×0,5 / poza konsensusem) — tylko w „Szczegóły i wiarygodność" (GROWTH-PRED-UI2)
      return '<div class="vgcc-row' + cls + '"><span class="vgcc-nm">' + esc(e.label) + '</span><span>' + right + '</span></div>';
    }).join('');
    return '<div class="vgcc-methods">' + rows + infoRowsHtml(model) + '</div>';
  }

  function mphHtml(model) {
    if (!model.mph) return '';
    var ct = model.mph.centileText != null ? String(model.mph.centileText).replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
    var cm = ct.match(/([<>])?\s*(\d+)/);
    var c = '';
    if (cm) {
      if (cm[1] === '<') c = '; <span class="vgcc-mph-cent">&lt;' + esc(cm[2]) + '. centyla</span>';
      else if (cm[1] === '>') c = '; <span class="vgcc-mph-cent">&gt;' + esc(cm[2]) + '. centyla</span>';
      else c = '; <span class="vgcc-mph-cent">' + esc(cm[2]) + '. centyl</span>';
    }
    return '<div class="vgcc-mph">🎯 Cel rodzicielski (MPH): <b>' + esc(fmt1(model.mph.cm)) + ' cm</b>' + c + '</div>';
  }

  function statsHtml(model) {
    if (!model.tempo) return '';
    var u = model.tempo.context ? esc(model.tempo.context) : 'cm/rok';
    return '<div class="vgcc-stats"><div class="vgcc-stat"><div class="k">Tempo wzrastania</div>' +
      '<div class="vu"><span class="v">' + esc(fmt1(model.tempo.cm)) + '</span> <span class="u">' + u + '</span></div></div></div>';
  }

  function mphAnchorSentence(model) {
    var wc = model.weighted || {};
    var anchor = num(wc.mphAnchorCm), mph = model.mph ? num(model.mph.cm) : null;
    var s = ' MPH w konsensusie jako ';
    if (anchor !== null && mph !== null && Math.abs(anchor - mph) >= 0.05) {
      s += 'cel warunkowy ' + esc(fmt1(anchor)) + ' cm (regresja do średniej 0,78, Luo 1998; udział ';
    } else {
      s += 'kotwica (udział ';
    }
    s += esc(String(Math.round((wc.mphShare || 0) * 100))) + '%';
    if (model.postmenarcheal) s += '; waga ×0,25 po menarche, bo przy ok. 95 % wzrostu dorosłego poprawka na rodziców traci sens, Tanner 1983';
    if (wc.mphWeightFactor !== undefined && wc.mphWeightFactor < (model.postmenarcheal ? MPH_POSTMENARCHE_WEIGHT : 1)) s += '; waga ×0,5 w niskorosłości, bo dzieci ISS kończą poniżej celu, Blum 2022';
    return s + ').';
  }
  function tw2Paragraph(model) {
    var e = (model.entries || []).filter(function (x) { return x.key === 'tw2'; })[0];
    if (!e) return '';
    var t = String(e.tw2Table || '');
    var boy = t === '2.1' || t === '2.2';
    var postT = t === '3.1b' || t === '3.1c' || t === '3.2b' || t === '3.3b';
    var desc;
    if (t === '2.2') desc = ' (4 zmienne: wzrost, wiek metrykalny, wiek kostny, przyrost wzrostu w ostatnim roku)';
    else if (boy) desc = ' (3 zmienne: wzrost, wiek metrykalny, wiek kostny)';
    else if (t === '3.2a' || t === '3.2b') desc = ' (' + (postT ? 'po menarche' : 'przed menarche') + '; 4 zmienne: wzrost, wiek metrykalny, wiek kostny, przyrost wzrostu w ostatnim roku)';
    else if (t === '3.3a' || t === '3.3b') desc = ' (' + (postT ? 'po menarche' : 'przed menarche') + '; 5 zmiennych: wzrost, wiek metrykalny, wiek kostny, przyrost wzrostu i przyrost wieku kostnego w ostatnim roku)';
    else if (t === '3.1c') desc = ' (po menarche, ze znanym wiekiem menarche)';
    else if (t === '3.1b') desc = ' (po menarche, wiek menarche nieznany)';
    else desc = ' (przed menarche)';
    var s = '<p><span class="vgcc-lbl">TW Mark II:</span> równania Tannera i wsp. (1983) dla ' + (boy ? 'chłopców' : 'dziewcząt') + ', tablica ' + esc(t) + desc +
      ', wiersz ' + esc(String(e.tw2RowAge).replace('.', ',')) + ' l';
    if (e.tw2Variants) s += '; warianty: wiek dokładny ' + esc(fmt1(e.tw2Variants.exactCa)) + ' cm, wiek obcięty ' + esc(fmt1(e.tw2Variants.clampedCa)) + ' cm';
    if (e.tw2Notes && e.tw2Notes.length) s += '. ' + e.tw2Notes.map(function (n) { return esc(n); }).join('; ');
    if (e.tw2ProfileNote) s += '. ' + esc(e.tw2ProfileNote);
    return s + '.</p>';
  }
  function menarcheParagraph(model) {
    var parts = [];
    if (model.postmenarcheal) {
      parts.push('<p><span class="vgcc-lbl">Profil po menarche:</span> dziewczynka po pierwszej miesiączce' +
        (num(model.menarcheAgeYears) !== null ? ' (menarche w wieku ' + esc(fmt1(model.menarcheAgeYears)) + ' l)' : '') +
        ' — przy menarche osiągnięte jest ok. 95,5 % wzrostu ostatecznego (Singleton 1975), a dalszy przyrost (zwykle 5–8 cm) zależy głównie od wieku kostnego przy menarche (Cho 2026). RWT i Khamis–Roche nie modelują menarche i są poza konsensusem; największą wagę ma TW Mark II (Tanner 1983: po menarche resztkowe SD 0,9–1,9 cm).</p>');
    }
    var e = (model.entries || []).filter(function (x) { return x.key === 'menarche'; })[0];
    if (e) {
      parts.push('<p><span class="vgcc-lbl">Wzrost przy menarche / 0,955:</span> baza ' + esc(fmt1(e.menarcheBaseCm)) + ' cm' +
        (e.menarcheAdjCm ? ', korekta ' + (e.menarcheAdjCm > 0 ? '+' : '−') + esc(fmt1(Math.abs(e.menarcheAdjCm))) + ' cm' : '') +
        (e.menarcheNotes && e.menarcheNotes.length ? '; ' + e.menarcheNotes.map(function (n) { return esc(n); }).join('; ') : '') +
        ' (Singleton 1975: 95,5 ± 1,2 %, n = 40; Cho 2026).</p>');
    }
    return parts.join('');
  }
  function biasSentence(model) {
    var corr = (model.entries || []).filter(function (e) { return e.biasCm; });
    if (!corr.length) return '';
    var items = corr.map(function (e) {
      var sign = e.biasCm > 0 ? '+' : '−';
      return esc(e.label) + ' ' + esc(fmt1(e.uncorrectedCm)) + ' → ' + esc(fmt1(e.rawValue)) + ' cm (' + sign + esc(fmt1(Math.abs(e.biasCm))) + ' cm' +
        (e.biasSigmaFactor && e.biasSigmaFactor !== 1 ? ', σ ×' + esc(fmt1(e.biasSigmaFactor)) : '') + ')' +
        (e.clamped ? ', obcięte do obecnego wzrostu ' + esc(fmt1(e.value)) + ' cm' : '') + ': ' + esc(e.biasNote) + ' (' + esc(e.biasSource) + ')';
    });
    return '<p><span class="vgcc-lbl">Korekta błędu systematycznego:</span> ' + items.join('; ') + '.</p>';
  }
  function detailsHtml(model) {
    var parts = [];
    if (model.consensus && model.consensus.count >= 2 && model.weighted && model.weighted.weighted !== null) {
      parts.push('<p><span class="vgcc-lbl">Konsensus:</span> ' + esc(String(model.consensus.count)) + (model.weighted.withMph ? ' metody i MPH' : ' metody') +
        ', ważony wiarygodnością ' + esc(fmt1(model.weighted.weighted)) + ' cm; widełki metod ' + esc(fmt1(model.consensus.min)) + '–' + esc(fmt1(model.consensus.max)) +
        ' cm (mediana metod ' + esc(fmt1(model.consensus.median)) + ' cm).' +
        (model.weighted.recommendedLabel ? ' Największa waga dla tego profilu: ' + esc(model.weighted.recommendedLabel) + '.' : '') +
        (model.weighted.withMph ? mphAnchorSentence(model) : '') + '</p>');
    }
    if (model.entries.length) {
      var rel = model.entries.map(function (e) { return esc(e.label) + ' ' + esc(levelLabel(e.levelKey)); }).join(' · ');
      parts.push('<p><span class="vgcc-lbl">Wiarygodność:</span> ' + rel + '</p>');
    }
    var profLabel = profileLabelText(model);
    // GROWTH-PRED-PUB4: zdanie modelu wiarygodności („pokazano standardowe modele BP i RWT…") nie pasuje
    // do profili pokwitaniowych, gdzie RWT wypada — tam mówi akapit reguł.
    var pubProf = model.pubertyProfile && model.pubertyProfile.profil ? String(model.pubertyProfile.profil) : '';
    var summary = (model.pubertyRules && model.pubertyRules.active) || (pubProf && pubProf !== 'standardowy') ? '' : model.profileSummary;
    if (profLabel || summary) {
      parts.push('<p><span class="vgcc-lbl">Profil predykcyjny:</span> ' + esc(profLabel) +
        (summary ? '. ' + esc(summary) : '') + '</p>');
    }
    parts.push(pubertyProfileParagraph(model));
    var clampedEntries = model.entries.filter(function (e) { return e.clamped; });
    if (clampedEntries.length) {
      var cl = clampedEntries.map(function (e) {
        return esc(e.label) + ' wskazała ' + esc(fmt1(e.uncorrectedCm !== undefined ? e.uncorrectedCm : e.rawValue)) + ' cm' +
          (e.biasCm ? ' (po korekcie ' + esc(fmt1(e.rawValue)) + ' cm)' : '');
      }).join(', ');
      parts.push('<p><span class="vgcc-lbl">Prognoza a obecny wzrost:</span> ' +
        (clampedEntries.length === 1 ? 'metoda ' : 'metody: ') + cl +
        ', czyli poniżej zmierzonego wzrostu. Dolną granicę prognozy ograniczono do aktualnego wzrostu, z odpowiednim obcięciem przedziału błędu; ' + (model.sexKey === 'F' ? 'pacjentka' : 'pacjent') + ' jest już blisko osiągnięcia wzrostu ostatecznego.</p>');
    }
    if (model.deltaMonths !== null && model.deltaMonths !== undefined && model.entries.length) {
      var dm = model.deltaMonths;
      var dtxt = dm > 0 ? 'wiek kostny wyprzedza metrykalny o ' + esc(String(dm)) + ' mies.'
        : (dm < 0 ? 'wiek kostny opóźniony względem metrykalnego o ' + esc(String(-dm)) + ' mies.' : 'wiek kostny zgodny z metrykalnym');
      var gated = model.entries.filter(function (e) { return e.gateNote; }).map(function (e) { return esc(e.label) + ': ' + esc(e.gateNote) + '.'; });
      parts.push('<p><span class="vgcc-lbl">Dobór metody:</span> ' + dtxt + ' ' +
        (gated.length ? gated.join(' ') : 'Bez bramek: wszystkie metody z pełną wagą.') + '</p>');
    } else if (model.entries.length >= 2 && model.boneAgeMissing) {
      var gated0 = model.entries.filter(function (e) { return e.gateNote; }).map(function (e) { return esc(e.label) + ': ' + esc(e.gateNote) + '.'; });
      parts.push('<p><span class="vgcc-lbl">Dobór metody:</span> bez wieku kostnego bramki rozbieżności nie działają' + (gated0.length ? '. ' + gated0.join(' ') : '; wszystkie metody z pełną wagą.') + '</p>');
    }
    parts.push(biasSentence(model));
    parts.push(infoRowsParagraph(model));
    parts.push(menarcheParagraph(model));
    parts.push(tw2Paragraph(model));
    if (model.hasBlum) {
      var be = model.entries.filter(function (e) { return e.key === 'blum'; })[0];
      parts.push('<p><span class="vgcc-lbl">Blum/ISS:</span> równania dla dzieci niskorosłych (hSDS ≤ −1,28; Blum i wsp., J Endocr Soc 2022' + (be && be.blumModelId ? ', model ' + esc(String(be.blumModelId)) : '') + '); RMSE 3,2–3,7 cm, kohorta niemiecko-holenderska. Nie stosować u dzieci rosnących prawidłowo ani wysokich.</p>');
    }
    if (model.hasBp) {
      var dmb = num(model.deltaMonths);
      var bpOv = model.entries.some(function (e) { return e.key === 'bp' && e.bpGroupOverride; });
      parts.push('<p><span class="vgcc-lbl">Bayley–Pinneau:</span> błąd odczytu wieku kostnego z RTG jest głównym źródłem błędu prognozy — autorki zalecają uśrednić kilka niezależnych odczytów.' +
        (bpOv && model.postmenarcheal ? ' Po menarche użyto tablicy dla dziewcząt „przeciętnych" zamiast „przyspieszonej" — w przedwczesnym dojrzewaniu jest dokładniejsza (Cho 2026); nota o dzieciach przyspieszonych dotyczy przyspieszenia konstytucjonalnego, nie dziewcząt po menarche.' : '') +
        (bpOv && !model.postmenarcheal ? ' W profilu przedwczesnego / wczesnego pokwitania użyto tablicy dla dzieci „przeciętnych" zamiast „przyspieszonej" — u nieleczonych i leczonych z przedwczesnym pokwitaniem jest bliższa wzrostu osiągniętego (Kauli 1997; Tanaka 2005; Brito 2008; Mul 2005); nota o dzieciach przyspieszonych dotyczy przyspieszenia konstytucjonalnego.' : '') +
        (dmb !== null && dmb >= DELTA_GATE_MONTHS && !bpOv ? ' Bayley i Pinneau (1952): dzieci przyspieszone o ponad 2 lata osiągają zwykle wzrost wyższy, niż wskazują tabele.' : '') +
        (dmb !== null && dmb <= -DELTA_GATE_MONTHS ? ' Bayley i Pinneau (1952): dzieci opóźnione o ponad 2 lata osiągają zwykle wzrost niższy, niż wskazują tabele.' : '') + '</p>');
    }
    if (model.hasReinehr) {
      parts.push('<p><span class="vgcc-lbl">Reinehr 2019:</span> model dla chłopców z opóźnieniem kostnym >1 roku, opracowany u nieleczonych (bez testosteronu) po wykluczeniu niedoboru hormonu wzrostu, chorób tarczycy i hipogonadyzmu; przedział ±6,4 cm z kohorty rozwojowej (5.–95. centyl), w niezależnej walidacji model zawyżał o 2,9 cm (mediana).' +
        (model.reinehrExtrapolated ? ' Przy wieku kostnym ≥14,5 l współczynniki są w publikacji ekstrapolowane (≤2 pomiary na węzeł).' : '') +
        (model.reinehrPooled ? ' Przy wieku kostnym 10,5 i opóźnieniu ≥2 lata użyto współczynnika zbiorczego dla wszystkich opóźnień >1 rok (publikacja nie podaje osobnej wartości).' : '') + '</p>');
    }
    if (model.hasKhamis) {
      parts.push('<p><span class="vgcc-lbl">Khamis–Roche:</span> błąd zbiorczy 90% metody (±5,3 cm chłopcy / ±4,3 cm dziewczęta; Khamis–Roche 1994), nie zależy od wieku; liczy się bez wieku kostnego, populacja Fels (białe dzieci USA).</p>');
    }
    parts = parts.filter(Boolean);
    if (!parts.length) return '';
    return '<details class="vgcc-det"><summary>Szczegóły i wiarygodność</summary><div class="vgcc-det-body">' + parts.join('') + '</div></details>';
  }

  function render(input) {
    ensureStyle();
    var model;
    try { model = buildModel(input); } catch (_) { model = null; }
    if (!model) return '';
    var html = '<div class="vgcc">' + heroHtml(model) + methodsHtml(model) + mphHtml(model) + targetHtml(model) + statsHtml(model);
    if (model.bpDelayCaution) html += '<p class="vgcc-hint"><span class="vgcc-warn">Uwaga:</span> ' + esc(model.bpDelayCaution) + '</p>';
    if (model.showBoneAgeHint) html += '<p class="vgcc-hint">Część metod (np. Bayley–Pinneau) wymaga wieku kostnego — uzupełnij go, aby sprawdzić dostępność pozostałych prognoz.</p>';
    html += detailsHtml(model);
    html += '</div>';
    return html;
  }

  w.VildaGrowthCardC = {
    version: '22',
    MPH_POSTMENARCHE_WEIGHT: MPH_POSTMENARCHE_WEIGHT,
    KR_ERR_HALFWIDTH_CM: KR_ERR_HALFWIDTH_CM,
    CONSENSUS_W: CONSENSUS_W,
    render: render,
    computeFinalHeightPrediction: computeFinalHeightPrediction,
    _buildModel: buildModel,
    _consensus: consensus,
    _weightedConsensus: weightedConsensus,
    _buildEntries: buildEntries,
    _gateFor: gateFor,
    _biasFor: biasFor,
    _bpDelayCautionFor: bpDelayCautionFor,
    _pubertyRulesFor: pubertyRulesFor,
    _targetAssessmentFor: targetAssessmentFor,
    _adultSdsFor: adultSdsFor,
    _heightFromSds: heightFromSds,
    _infoRowsFor: infoRowsFor,
    WU2023: WU2023,
    PUB_BP_SIGMA_FACTOR: PUB_BP_SIGMA_FACTOR,
    TARGET_BELOW_CM: TARGET_BELOW_CM,
    ADULT_SHORT_SDS: ADULT_SHORT_SDS,
    _mphAnchor: mphAnchorFrom,
    BIAS_RULES: BIAS_RULES,
    MPH_SHRINK: MPH_SHRINK,
    REINEHR_ERR_HALFWIDTH_CM: REINEHR_ERR_HALFWIDTH_CM,
    DEFAULT_ERR_HALFWIDTH_CM: DEFAULT_ERR_HALFWIDTH_CM,
    _deltaMonths: deltaMonthsFor,
    MPH_SIGMA_CM: MPH_SIGMA_CM,
    _levelLabel: levelLabel,
    _esc: esc,
    _sexKey: sexKey
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
